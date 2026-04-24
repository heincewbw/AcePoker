import { useState } from 'react';
import { X, Copy, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useWeb3 } from '../../hooks/useWeb3';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'amount' | 'connect' | 'transfer' | 'confirm' | 'done';

export default function DepositModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('10');
  const [depositInfo, setDepositInfo] = useState<{
    depositAddress: string;
    network: string;
  } | null>(null);
  const [txHash, setTxHash] = useState('');
  const [manualTxHash, setManualTxHash] = useState('');
  const [loading, setLoading] = useState(false);

  const { address, isConnecting, connectWallet, sendUsdt } = useWeb3();
  const isTestnet = import.meta.env.VITE_USE_TESTNET !== 'false';

  const handleInitiate = async () => {
    const num = Number(amount);
    if (!num || num < 1) {
      toast.error('Minimum deposit is 1 USDT');
      return;
    }

    setLoading(true);
    try {
      let walletAddress = address;
      if (!walletAddress) {
        walletAddress = await connectWallet();
        if (!walletAddress) {
          setLoading(false);
          return;
        }
      }

      const { data } = await api.post('/wallet/deposit/initiate', {
        walletAddress,
        amount: num,
        network: 'BSC',
      });

      setDepositInfo(data);
      setStep('transfer');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to initiate deposit');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!depositInfo) return;
    setLoading(true);

    const hash = await sendUsdt(depositInfo.depositAddress, amount, isTestnet);
    if (hash) {
      setTxHash(hash);
      setStep('confirm');
      await handleConfirm(hash);
    }
    setLoading(false);
  };

  const handleConfirm = async (hash: string) => {
    setLoading(true);
    try {
      // Wait a bit for blockchain confirmations
      await new Promise(r => setTimeout(r, 15000));

      const { data } = await api.post('/wallet/deposit/confirm', {
        txHash: hash,
        network: 'BSC',
      });

      toast.success(`✅ Deposited ${data.transaction.amount} USDT → ${data.chipsAdded.toLocaleString()} chips`);
      setStep('done');
      setTimeout(() => onSuccess(), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Confirmation failed. Try manual confirmation.');
      setStep('transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleManualConfirm = async () => {
    if (!manualTxHash) {
      toast.error('Enter transaction hash');
      return;
    }
    await handleConfirm(manualTxHash);
  };

  const copyAddress = () => {
    if (depositInfo) {
      navigator.clipboard.writeText(depositInfo.depositAddress);
      toast.success('Address copied!');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-yellow-900/30">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="usdt-badge">USDT</span>
            Deposit
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Amount */}
          {step === 'amount' && (
            <div className="space-y-5">
              <div>
                <label className="text-gray-400 text-sm block mb-2">
                  How much USDT would you like to deposit?
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input-poker pr-16 text-xl text-center font-bold"
                    min={1}
                    step={1}
                    placeholder="10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400 font-bold">
                    USDT
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[5, 10, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className="py-2 rounded-lg bg-black/40 border border-green-900/40 text-green-400 hover:bg-green-900/20 text-sm font-semibold"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* You will receive */}
              <div className="bg-black/40 rounded-lg p-4 border border-yellow-900/30">
                <p className="text-gray-500 text-xs mb-1">You will receive:</p>
                <p className="text-yellow-400 font-bold text-xl">
                  {(Number(amount || 0) * 1_000_000).toLocaleString()} chips
                </p>
                <p className="text-gray-600 text-xs mt-1">Rate: 1 USDT = 1,000,000 chips</p>
              </div>

              <div className="bg-blue-950/30 border border-blue-900/40 rounded-lg p-3 flex gap-2 text-xs text-blue-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {isTestnet
                    ? 'Using BSC Testnet. Get free test USDT from a BSC faucet.'
                    : 'You will send USDT on BSC (BEP-20) network. Do not send from exchanges or wrong network — your funds may be lost.'}
                </p>
              </div>

              <button
                onClick={handleInitiate}
                disabled={loading || !amount || Number(amount) < 1}
                className="w-full py-3 rounded-xl font-bold text-white uppercase tracking-wider disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #26a17b, #1a6e52)' }}
              >
                {loading ? 'Loading...' : isConnecting ? 'Connect Wallet...' : 'Continue'}
              </button>
            </div>
          )}

          {/* Step 2: Transfer */}
          {step === 'transfer' && depositInfo && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-green-400 font-bold text-2xl">{amount} USDT</p>
                <p className="text-gray-500 text-xs">Amount to send</p>
              </div>

              <div className="bg-black/40 rounded-lg p-4 border border-yellow-900/30">
                <p className="text-gray-500 text-xs mb-1">Send to address (BSC):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-yellow-300 break-all">
                    {depositInfo.depositAddress}
                  </code>
                  <button
                    onClick={copyAddress}
                    className="text-yellow-500 hover:text-yellow-300 flex-shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={handleSendTransaction}
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white uppercase tracking-wider disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #f6851b, #d47812)' }}
              >
                {loading ? 'Sending...' : '🦊 Send via MetaMask'}
              </button>

              {/* Manual entry */}
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-400 hover:text-yellow-400">
                  Already sent? Enter transaction hash
                </summary>
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={manualTxHash}
                    onChange={(e) => setManualTxHash(e.target.value)}
                    placeholder="0x..."
                    className="input-poker text-xs"
                  />
                  <button
                    onClick={handleManualConfirm}
                    disabled={loading || !manualTxHash}
                    className="w-full py-2 rounded-lg bg-yellow-800 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {loading ? 'Verifying...' : 'Confirm Transaction'}
                  </button>
                </div>
              </details>
            </div>
          )}

          {/* Step 3: Confirming */}
          {step === 'confirm' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full border-4 border-yellow-400 border-t-transparent animate-spin" />
              <div>
                <p className="text-white font-bold">Confirming transaction...</p>
                <p className="text-gray-500 text-sm">Waiting for blockchain confirmations</p>
              </div>
              {txHash && (
                <a
                  href={`https://${isTestnet ? 'testnet.' : ''}bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 text-sm"
                >
                  View on BSCScan <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-4">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
              <div>
                <p className="text-white font-bold text-lg">Deposit Successful!</p>
                <p className="text-gray-400 text-sm mt-1">
                  {(Number(amount) * 1_000_000).toLocaleString()} chips added to your account
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
