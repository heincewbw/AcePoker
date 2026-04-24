import { Server, Socket } from 'socket.io';
import { supabase } from '../config/supabase';
import { tableManager } from './tableManager';
import { PlayerAction } from '../game/PokerGame';
import { logChipChange } from '../utils/chipLedger';
import { recordGame } from '../utils/gameRecorder';

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
  currentTableId?: string;
}

// Track one active socket per user. If a second connection arrives with the
// same userId, the older socket is disconnected so only one session is live.
const activeUserSockets = new Map<string, string>(); // userId → socketId

export function setupSocketHandlers(io: Server): void {
  // Supabase auth middleware for socket
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return next(new Error('Invalid token'));

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, avatar, chips')
        .eq('id', data.user.id)
        .single();

      if (!profile) return next(new Error('User not found'));

      socket.userId = profile.id;
      socket.username = profile.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    console.log(`🔌 ${socket.username} connected [${socket.id}]`);

    // Enforce single active session per user. If the same user already has a
    // connected socket, kick the old one — the latest login wins.
    const userId = socket.userId!;
    const existingSocketId = activeUserSockets.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existing = io.sockets.sockets.get(existingSocketId);
      if (existing && existing.connected) {
        existing.emit('auth:kicked', {
          message: 'Your account logged in from another location.',
        });
        existing.disconnect(true);
      }
      // If the old socket is already gone (stale entry from a disconnect we
      // haven't processed yet), just take over silently without emitting.
    }
    activeUserSockets.set(userId, socket.id);

    // Join per-user room for tournament notifications / targeted events
    socket.join(`user:${userId}`);

    // ----- TABLE EVENTS -----

    socket.on('table:join', async ({ tableId, buyIn, seatIndex }) => {
      try {
        const table = tableManager.getTable(tableId);
        if (!table) {
          socket.emit('error', { message: 'Table not found' });
          return;
        }

        const { data: user } = await supabase
          .from('profiles')
          .select('id, username, avatar, chips')
          .eq('id', socket.userId)
          .single();

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        const { info } = table;

        // ── TOURNAMENT TABLE ──────────────────────────────────────────────
        // For tournament tables: user must be registered; buy-in is ignored
        // (already deducted at registration). Stack = starting_stack from DB.
        if (info.isTournament && info.tournamentId) {
          const { data: reg } = await supabase
            .from('tournament_registrations')
            .select('id')
            .eq('tournament_id', info.tournamentId)
            .eq('user_id', socket.userId)
            .maybeSingle();
          if (!reg) {
            socket.emit('error', { message: 'You are not registered for this tournament' });
            return;
          }
          const { data: tour } = await supabase
            .from('tournaments')
            .select('starting_stack, status')
            .eq('id', info.tournamentId)
            .single();
          if (!tour || tour.status === 'finished' || tour.status === 'cancelled') {
            socket.emit('error', { message: 'Tournament is no longer running' });
            return;
          }

          const game = tableManager.getGame(tableId)!;
          // Idempotent: if already seated, just re-attach socket
          const existingPlayer = game.getState().players.find(p => p.userId === socket.userId);
          if (!existingPlayer) {
            const added = game.addPlayer(
              socket.userId!,
              user.username,
              user.avatar,
              tour.starting_stack,
              seatIndex
            );
            if (!added) {
              socket.emit('error', { message: 'Failed to seat you at the tournament' });
              return;
            }
          }

          tableManager.addSocketId(tableId, socket.userId!, socket.id);
          socket.join(tableId);
          socket.currentTableId = tableId;

          // Broadcast updated state
          const state = game.getPublicState();
          io.to(tableId).emit('game:state', state);
          io.to(tableId).emit('table:player_joined', { username: user.username });

          // If enough players seated and game still waiting, start the hand
          if (game.canStartGame()) {
            // Small delay so all players have a moment to render
            setTimeout(() => {
              if (!game.canStartGame()) return;
              game.setCallbacks(
                (s) => io.to(tableId).emit('game:state', s),
                (s) => io.to(tableId).emit('game:ended', s),
              );
              game.startGame();
            }, 3000);
          }
          return;
        }

        // ── REGULAR CASH TABLE ────────────────────────────────────────────
        if (user.chips < buyIn) {
          socket.emit('error', { message: 'Insufficient chips' });
          return;
        }

        const effectiveMax = info.bigBlind * 100;
        if (buyIn < info.minBuyIn || buyIn > effectiveMax) {
          socket.emit('error', {
            message: `Buy-in must be between ${info.minBuyIn} and ${effectiveMax} chips (max = 100× big blind)`,
          });
          return;
        }

        // Deduct chips from user
        const newBalance = user.chips - buyIn;
        await supabase
          .from('profiles')
          .update({ chips: newBalance })
          .eq('id', socket.userId);

        // Audit: buy-in
        await logChipChange({
          userId:       socket.userId!,
          username:     user.username,
          event:        'buyin',
          amount:       -buyIn,
          balanceAfter: newBalance,
          tableId:      tableId,
          detail:       `Bought in to table "${info.name}" with ${buyIn} chips`,
        });

        const game = tableManager.getGame(tableId)!;
        const success = game.addPlayer(
          socket.userId!,
          user.username,
          user.avatar,
          buyIn,
          seatIndex
        );

        if (!success) {
          // Refund — restore full balance
          await supabase
            .from('profiles')
            .update({ chips: user.chips })
            .eq('id', socket.userId);
          await logChipChange({
            userId:       socket.userId!,
            username:     user.username,
            event:        'refund',
            amount:       buyIn,
            balanceAfter: user.chips,
            tableId:      tableId,
            detail:       'Seat taken or table full — buy-in refunded',
          });
          socket.emit('error', { message: 'Seat is taken or table is full' });
          return;
        }

        socket.join(tableId);
        socket.currentTableId = tableId;
        tableManager.addSocketId(tableId, socket.userId!, socket.id);

        // Notify all players in the table
        io.to(tableId).emit('game:state', game.getPublicState(socket.userId));
        io.to(tableId).emit('table:player_joined', {
          username: user.username,
          seatIndex,
        });

        socket.emit('table:joined', { tableId, buyIn });

        // Auto-start game if enough players and not already running
        if (game.canStartGame()) {
          setTimeout(() => {
            if (game.canStartGame()) {
              game.setCallbacks(
                (state) => {
                  tableManager.updateGameState(tableId, state);
                  // Send personalized state to each player
                  const socketIds = tableManager.getSocketIds(tableId);
                  for (const [uid, sid] of tableManager.getTable(tableId)!.socketIds) {
                    const playerSocket = io.sockets.sockets.get(sid);
                    if (playerSocket) {
                      playerSocket.emit('game:state', game.getPublicState(uid));
                    }
                  }
                },
                async (finalState) => {
                  tableManager.updateGameState(tableId, finalState);
                  io.to(tableId).emit('game:ended', finalState);

                  // ── PERSIST the game itself so every hand has a permanent record ──
                  await recordGame(finalState);

                  // ── PERSIST WINNERS to DB immediately ─────────────────
                  // Winner chips are already updated in-memory by PokerGame.
                  // Persist them now so a crash/disconnect doesn't lose chips.
                  if (finalState.winners) {
                    for (const winner of finalState.winners) {
                      const winnerPlayer = finalState.players.find(
                        p => p.id === winner.playerId
                      );
                      if (!winnerPlayer) continue;

                      // Read current DB balance first to avoid race conditions
                      const { data: wp } = await supabase
                        .from('profiles')
                        .select('chips, username')
                        .eq('id', winnerPlayer.userId)
                        .single();
                      if (!wp) continue;

                      const newBal = wp.chips + winnerPlayer.chips;
                      await supabase
                        .from('profiles')
                        .update({ chips: newBal })
                        .eq('id', winnerPlayer.userId);

                      // Zero in-memory so handleLeaveTable doesn't double-credit.
                      // Chips will be resynced from DB inside the setTimeout below
                      // before the next round starts.
                      winnerPlayer.chips = 0;

                      await logChipChange({
                        userId:       winnerPlayer.userId,
                        username:     wp.username,
                        event:        'win',
                        amount:       winner.amount,
                        balanceAfter: newBal,
                        tableId:      tableId,
                        gameId:       finalState.id,
                        roundNumber:  finalState.roundNumber,
                        detail:       `Won ${winner.amount} chips${
                          winner.hand ? ` with ${winner.hand.description}` : ''
                        }`,
                      });
                    }

                    // ── LOG LOSSES for players who lost chips ──
                    for (const p of finalState.players) {
                      if (finalState.winners!.some(w => w.playerId === p.id)) continue;
                      if (p.chips > 0) continue; // still has chips, logged on leave
                      const { data: lp } = await supabase
                        .from('profiles')
                        .select('chips, username')
                        .eq('id', p.userId)
                        .single();
                      if (!lp) continue;
                      await logChipChange({
                        userId:       p.userId,
                        username:     lp.username,
                        event:        'lose',
                        amount:       0,
                        balanceAfter: lp.chips,
                        tableId:      tableId,
                        gameId:       finalState.id,
                        roundNumber:  finalState.roundNumber,
                        detail:       `Lost hand — chips remaining in stack: ${p.chips}`,
                      });
                    }
                  }

                  // Schedule next game — resync ALL player chips from DB first
                  // so winner chips (persisted above) are accurate in-memory.
                  setTimeout(async () => {
                    for (const p of game.getState().players) {
                      const { data: prof } = await supabase
                        .from('profiles')
                        .select('chips')
                        .eq('id', p.userId)
                        .single();
                      if (prof != null) game.updatePlayerChips(p.userId, prof.chips);
                    }
                    if (game.canStartGame()) {
                      game.startGame();
                    }
                  }, 5000);
                }
              );
              game.startGame();
            }
          }, 3000);
        }
      } catch (err) {
        console.error('table:join error:', err);
        socket.emit('error', { message: 'Failed to join table' });
      }
    });

    socket.on('table:leave', async () => {
      await handleLeaveTable(socket, io);
    });

    // ----- SIT OUT / RETURN -----

    socket.on('player:sitout', ({ tableId }: { tableId: string }) => {
      const game = tableManager.getGame(tableId);
      if (!game || !socket.userId) return;
      game.setSitOut(socket.userId, true);
      io.to(tableId).emit('game:state', game.getPublicState());
    });

    socket.on('player:return', ({ tableId }: { tableId: string }) => {
      const game = tableManager.getGame(tableId);
      if (!game || !socket.userId) return;
      game.setSitOut(socket.userId, false);
      const state = game.getPublicState();
      io.to(tableId).emit('game:state', state);
      // Start next hand if enough active players and no hand in progress
      if (game.canStartGame()) {
        setTimeout(() => {
          if (!game.canStartGame()) return;
          game.startGame();
        }, 1500);
      }
    });

    socket.on('player:post_bb', ({ tableId }: { tableId: string }) => {
      const game = tableManager.getGame(tableId);
      if (!game || !socket.userId) return;
      game.postBBToReturn(socket.userId);
      io.to(tableId).emit('game:state', game.getPublicState());
      // Start next hand if enough active players and no hand in progress
      if (game.canStartGame()) {
        setTimeout(() => {
          if (!game.canStartGame()) return;
          game.startGame();
        }, 1500);
      }
    });

    // ----- GAME ACTIONS -----

    socket.on('game:action', ({ tableId, action, amount }: { tableId: string; action: PlayerAction; amount?: number }) => {
      try {
        const game = tableManager.getGame(tableId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        const success = game.processAction(socket.userId!, action, amount);
        if (!success) {
          socket.emit('error', { message: 'Invalid action' });
          return;
        }

        // State updates are handled by callbacks
      } catch (err) {
        console.error('game:action error:', err);
        socket.emit('error', { message: 'Action failed' });
      }
    });

    // ----- CHAT -----

    socket.on('chat:message', ({ tableId, message }: { tableId: string; message: string }) => {
      if (!message || message.trim().length === 0) return;
      const sanitized = message.trim().slice(0, 200);

      io.to(tableId).emit('chat:message', {
        userId: socket.userId,
        username: socket.username,
        message: sanitized,
        timestamp: new Date().toISOString(),
      });
    });

    // ----- DISCONNECT -----

    socket.on('disconnect', async () => {
      console.log(`🔌 ${socket.username} disconnected`);
      // Only clear the map if this socket is the currently-tracked one.
      // If a newer login took over, the map already points at that newer socket.
      if (socket.userId && activeUserSockets.get(socket.userId) === socket.id) {
        activeUserSockets.delete(socket.userId);
      }
      await handleLeaveTable(socket, io);
    });
  });
}

async function handleLeaveTable(socket: AuthSocket, io: Server): Promise<void> {
  const tableId = socket.currentTableId;
  if (!tableId) return;

  try {
    const game = tableManager.getGame(tableId);
    if (game) {
      const state = game.getState();
      const player = state.players.find(p => p.userId === socket.userId);

      if (player) {
        const info = tableManager.getTableInfo(tableId);
        const isTournament = !!info?.isTournament;

        // Tournament tables: do NOT refund stack (those are tournament chips,
        // not wallet chips). Disconnect-mid-hand just force-folds so play
        // continues.  For disconnect outside a hand in a tournament, leave
        // the player seated silently so they can reconnect.
        if (isTournament) {
          const isActiveHand = !['waiting', 'finished'].includes(state.phase);
          if (isActiveHand && !player.isFolded) {
            game.forceRemovePlayer(socket.userId!);
          }
          tableManager.removeSocketId(tableId, socket.userId!);
          socket.leave(tableId);
          socket.currentTableId = undefined;
          return;
        }

        // ── CHIP LEAK FIX (cash tables) ─────────────────────────────────────
        // player.chips  = remaining stack (includes winnings already credited)
        // player.currentBet = bet in the CURRENT betting round (not yet in pot)
        //
        // If we're mid-hand, we also need to recoup the player's share of the
        // pot for rounds already completed.  We do this by calculating how much
        // they invested this hand (via totalBetThisRound) and haven't yet seen
        // returned as winnings.  Rather than a complex side-pot calculation, the
        // safe approach is: fold them so the hand resolves normally, THEN return
        // their remaining stack on leave.
        //
        // If the game is in 'waiting' or 'finished', just return their stack.
        // ───────────────────────────────────────────────────────────────────

        const isActiveHand = !['waiting', 'finished'].includes(state.phase);

        if (isActiveHand && !player.isFolded) {
          // Force-fold so remaining players win pot correctly
          // (PokerGame will advance the phase and resolve naturally)
          game.forceRemovePlayer(socket.userId!);
        }

        // Re-read state after possible forced fold resolution
        const freshState = game.getState();
        const freshPlayer = freshState.players.find(p => p.userId === socket.userId)
          ?? player; // fallback to stale if already removed

        // Chips to return = stack left (winnings already set to 0 in onGameEnd)
        const chipsToReturn = freshPlayer.chips + (freshPlayer.currentBet || 0);

        if (chipsToReturn > 0) {
          const { data: p } = await supabase
            .from('profiles')
            .select('chips, username')
            .eq('id', socket.userId)
            .single();
          if (p) {
            const newBalance = p.chips + chipsToReturn;
            await supabase
              .from('profiles')
              .update({ chips: newBalance })
              .eq('id', socket.userId);

            await logChipChange({
              userId:       socket.userId!,
              username:     p.username,
              event:        'refund',
              amount:       chipsToReturn,
              balanceAfter: newBalance,
              tableId:      tableId,
              gameId:       state.id,
              roundNumber:  state.roundNumber,
              detail:       `Left table — stack of ${chipsToReturn} chips returned`,
            });
          }
        }

        game.removePlayer(socket.userId!);
        tableManager.removeSocketId(tableId, socket.userId!);

        const updatedState = game.getPublicState();
        io.to(tableId).emit('game:state', updatedState);
        io.to(tableId).emit('table:player_left', { username: socket.username });
      }
    }

    socket.leave(tableId);
    socket.currentTableId = undefined;
  } catch (err) {
    console.error('handleLeaveTable error:', err);
  }
}
