import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import tableRoutes from './routes/tables';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import gamesRoutes from './routes/games';
import tournamentsRoutes from './routes/tournaments';
import { setupSocketHandlers } from './socket/socketHandler';
import { errorHandler } from './middleware/errorHandler';
import { tournamentManager } from './game/tournamentManager';

dotenv.config();

const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: clientUrl,
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  message: 'Too many auth attempts, please try again after 15 minutes.',
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/tournaments', tournamentsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io handlers
setupSocketHandlers(io);

// Tournament scheduler
tournamentManager.init(io);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function main() {
  httpServer.listen(PORT, () => {
    console.log(`🃏 AcePoker server running on port ${PORT}`);
    console.log(`📡 Supabase connected`);
  });
}

main().catch(console.error);

export { io };
