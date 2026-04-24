import { useState, useEffect } from 'react';
import { X, Wallet, ArrowDownToLine, History, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWeb3 } from '../../hooks/useWeb3';
import api from '../../utils/api';
import { Transaction } from '../../types';
import DepositModal from './DepositModal';

interface Props {
  onClose: () => void;
}

export default function WalletModal({ onClose }: Props) {
  const { user, refreshUser } = useAuthStore();
  const { address, usdtBalance, isConnecting, connectWallet, disconnectWallet } = useWeb3();
  const [showDeposit, setShowDeposit] = useState(false);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    api.get('/wallet/transactions').then(({ data }) => {
      setTransactions(data.transactions || []);
    }).catch(() => {});
  }, []);

  const refresh = async () => {
    await refreshUser();
    const { data } = await api.get('/wallet/transactions');
    setTransactions(data.transactions || []);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-yellow-900/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Cinzel, serif' }}>
                  My Wallet
                </h2>
                <p className="text-gray-500 text-xs">Manage your USDT & chips</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Balance Cards */}
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-950/40 border border-yellow-700/40 rounded-xl p-4">
              <p className="text-yellow-400 text-xs uppercase tracking-wider mb-1">Game Chips</p>
              <p className="text-white text-2xl font-bold">
                {(user?.chips || 0).toLocaleString()}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                ≈ {((user?.chips || 0) / 1_000_000).toFixed(2)} USDT
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-900/40 to-green-950/40 border border-green-700/40 rounded-xl p-4">
              <p className="text-green-400 text-xs uppercase tracking-wider mb-1">USDT Balance</p>
              <p className="text-white text-2xl font-bold">
                {(user?.usdtBalance || 0).toFixed(2)}
              </p>
              <p className="text-gray-500 text-xs mt-1">Platform balance</p>
            </div>
          </div>

          {/* Tab selector */}
          <div className="px-6 flex gap-1 bg-black/20 rounded-lg mx-6 p-1">
            <button
              onClick={() => setTab('overview')}
              className={`flex-1 py-2 rounded text-sm font-semibold transition-all ${
                tab === 'overview'
                  ? 'bg-yellow-900/40 text-yellow-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex-1 py-2 rounded text-sm font-semibold transition-all ${
                tab === 'history'
                  ? 'bg-yellow-900/40 text-yellow-300'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Transaction History
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'overview' && (
              <div className="space-y-4">
                {/* MetaMask connection */}
                <div className="bg-black/40 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    🦊 Web3 Wallet
                  </h3>
                  {address ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Connected:</span>
                        <span className="text-green-400 text-sm font-mono">
                          {address.slice(0, 6)}...{address.slice(-4)}
                        </span>
                      </div>
                      {usdtBalance !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-sm">USDT Balance:</span>
                          <span className="text-white font-bold">{Number(usdtBalance).toFixed(2)} USDT</span>
                        </div>
                      )}
                      <button
                        onClick={disconnectWallet}
                        className="text-red-400 text-xs hover:text-red-300"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={connectWallet}
                      disabled={isConnecting}
                      className="w-full py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold transition-colors disabled:opacity-60"
                    >
                      {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
                    </button>
                  )}
                </div>

                {/* Deposit button */}
                <button
                  onClick={() => setShowDeposit(true)}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-white font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #26a17b, #1a6e52)' }}
                >
                  <ArrowDownToLine className="w-5 h-5" />
                  Deposit USDT
                </button>

                {/* Info */}
                <div className="bg-black/30 rounded-lg p-4 border border-yellow-900/20 text-xs text-gray-400">
                  <p className="mb-2"><span className="text-yellow-400 font-bold">Exchange rate:</span> 1 USDT = 1,000,000 chips</p>
                  <p className="mb-2"><span className="text-yellow-400 font-bold">Network:</span> BSC (BEP-20 USDT)</p>
                  <p><span className="text-yellow-400 font-bold">Min deposit:</span> 1 USDT · <span className="text-yellow-400 font-bold">Confirmations:</span> 3 blocks</p>
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2">
                {transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500">No transactions yet</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div
                      key={tx._id}
                      className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${
                            tx.type === 'deposit' || tx.type === 'win'
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}>
                            {tx.type === 'deposit' || tx.type === 'win' ? '+' : '-'}{tx.amount} {tx.currency}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            tx.status === 'confirmed' ? 'bg-green-900/40 text-green-400' :
                            tx.status === 'pending' ? 'bg-yellow-900/40 text-yellow-400' :
                            'bg-red-900/40 text-red-400'
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                        {tx.description && (
                          <p className="text-xs text-gray-400 mt-1">{tx.description}</p>
                        )}
                      </div>
                      {tx.txHash && (
                        <a
                          href={`https://${process.env.NODE_ENV === 'production' ? '' : 'testnet.'}bscscan.com/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-yellow-500 hover:text-yellow-300"
                          title="View on BSCScan"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSuccess={async () => {
            setShowDeposit(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}
