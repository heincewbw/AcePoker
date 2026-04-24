# 🃏 AcePoker - Premium Online Poker with USDT

A full-stack **Zynga Poker-style** online Texas Hold'em game with **real-time multiplayer** and **USDT crypto deposits** via MetaMask.

![Tech](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![Tech](https://img.shields.io/badge/Node.js-20-339933?logo=node.js) ![Tech](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Tech](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io) ![Tech](https://img.shields.io/badge/ethers.js-6-627EEA) ![Tech](https://img.shields.io/badge/USDT-BSC-26A17B)

---

## ✨ Features

### 🎮 Poker Game
- Full **Texas Hold'em No-Limit** implementation
- Real-time multiplayer via WebSockets (Socket.io)
- Complete hand evaluation: Royal Flush → High Card
- Betting rounds: Pre-Flop → Flop → Turn → River → Showdown
- Side pots, all-in logic, blind rotation
- Beautiful animated UI inspired by Zynga Poker
- Up to **9 players per table**
- In-game chat

### 💰 USDT Integration
- **Deposit USDT via MetaMask** on BSC (BEP-20)
- Supports BSC Mainnet & Testnet
- Automatic transaction verification via blockchain
- Multi-confirmation validation (3+ blocks)
- Exchange rate: `1 USDT = 1,000,000 chips`
- Transaction history with BSCScan links

### 👤 User System
- Registration & login (JWT auth)
- Bcrypt-hashed passwords
- Starting bonus: 10,000 chips
- Stats tracking (wins, games played, level)
- Leaderboard

### 🔒 Security
- Rate limiting on auth endpoints
- Helmet.js security headers
- Input validation (express-validator)
- Server-side chip management (anti-cheat)
- JWT socket authentication

---

## 📂 Project Structure

```
AcePoker/
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/        # Login, register
│   │   │   ├── Lobby/       # Table browser
│   │   │   ├── Game/        # Poker table UI
│   │   │   └── Wallet/      # USDT deposit
│   │   ├── hooks/           # useSocket, useWeb3
│   │   ├── store/           # Zustand state
│   │   ├── utils/           # API client
│   │   └── types/
│   └── package.json
│
├── server/                  # Express + Socket.io backend
│   ├── src/
│   │   ├── game/            # Poker engine (deck, hand eval, game)
│   │   ├── routes/          # REST API
│   │   ├── socket/          # WebSocket handlers
│   │   ├── blockchain/      # USDT service (ethers.js)
│   │   ├── models/          # MongoDB models
│   │   └── middleware/
│   └── package.json
│
└── package.json             # Monorepo root
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+
- **MongoDB** (local or Atlas)
- **MetaMask** browser extension (for USDT deposits)

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Configure environment

**Server** (`server/.env`):
```bash
cp server/.env.example server/.env
```
Edit `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/acepoker
JWT_SECRET=<generate_a_strong_random_string>

# For USDT deposits (use testnet for dev)
USE_TESTNET=true
PLATFORM_WALLET_ADDRESS=0xYourPlatformWalletAddress
```

**Client** (`client/.env`):
```bash
cp client/.env.example client/.env
```

### 3. Start MongoDB
```bash
# Windows (if installed as service, it's already running)
# Or with Docker:
docker run -d -p 27017:27017 --name mongo mongo:7
```

### 4. Run in development
```bash
npm run dev
```
This starts:
- **Backend** → http://localhost:5000
- **Frontend** → http://localhost:5173

### 5. Build for production
```bash
npm run build
```

---

## 🎮 How to Play

1. **Register** an account → get 10,000 free chips
2. **Choose a table** from the lobby (Low, Medium, High, VIP stakes)
3. **Pick a seat** and set your buy-in
4. **Play Texas Hold'em**:
   - `Fold` → give up your hand
   - `Check` → pass action (no bet to call)
   - `Call` → match the current bet
   - `Raise` → increase the bet
   - `All-In` → bet all your chips

---

## 💵 USDT Deposit Flow

1. Click **"Deposit USDT"** in lobby
2. Enter amount (min 1 USDT)
3. Connect **MetaMask**
4. System initiates deposit → returns platform wallet address
5. MetaMask prompts USDT transfer
6. Backend **verifies transaction on-chain** (3+ confirmations)
7. Chips credited: `1 USDT → 1,000,000 chips`

### Supported networks
| Network | USDT Contract | Decimals |
|--------|--------------|---------|
| **BSC Mainnet** | `0x55d398326f99059fF775485246999027B3197955` | 18 |
| **BSC Testnet** | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` | 18 |
| Ethereum | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |
| Polygon | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 |

> 💡 **Testnet faucets**: Get free BNB at https://testnet.bnbchain.org/faucet-smart

---

## 🧪 Testing the Poker Engine

The hand evaluator handles all standard poker hands including edge cases:
- A-2-3-4-5 "wheel" straight
- Flush tiebreakers by kicker
- Full house trips comparison
- Split pots on tied hands

---

## 🛡️ Production Checklist

Before going live:
- [ ] Change `JWT_SECRET` to a 256-bit random value
- [ ] Set `USE_TESTNET=false` and configure real BSC RPC
- [ ] Use a dedicated **hardware/cold wallet** for `PLATFORM_WALLET_ADDRESS`
- [ ] Set up MongoDB replication & backups
- [ ] Enable HTTPS (use nginx or Cloudflare)
- [ ] Add monitoring (Sentry, LogRocket)
- [ ] Implement **KYC/AML** if operating in regulated jurisdictions
- [ ] Get gaming license for your jurisdiction
- [ ] Add withdrawal system with admin approval
- [ ] Set up CDN for static assets

---

## ⚠️ Legal Disclaimer

This software is provided **for educational purposes**. Operating real-money gambling services requires licenses in most jurisdictions. The authors assume no liability for misuse. **Play responsibly. 18+ only.**

---

## 📜 License

MIT License - feel free to build upon this!

---

## 🤝 Contributing

PRs welcome! Ideas:
- Tournament mode (SNGs, MTTs)
- Pot-limit Omaha
- Mobile-responsive improvements
- AI opponents for practice mode
- Sound effects & animations
- Spectator mode
- Replay system
