import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Props {
  onClose: () => void;
  onCreate: () => void;
}

export default function CreateTableModal({ onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    name: '',
    smallBlind: 500,
    bigBlind: 1000,
    maxPlayers: 6,
    minBuyIn: 10000,
    maxBuyIn: 1000000,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/tables', form);
      toast.success('Table created!');
      onCreate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-panel p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Cinzel, serif' }}>
            Create Table
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-1">Table Name</label>
            <input
              className="input-poker"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Poker Table"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Small Blind</label>
              <input
                type="number"
                className="input-poker"
                value={form.smallBlind}
                onChange={(e) => setForm({ ...form, smallBlind: +e.target.value })}
                min={100}
                required
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Big Blind</label>
              <input
                type="number"
                className="input-poker"
                value={form.bigBlind}
                onChange={(e) => setForm({ ...form, bigBlind: +e.target.value })}
                min={200}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-1">Max Players ({form.maxPlayers})</label>
            <input
              type="range"
              min={2}
              max={9}
              value={form.maxPlayers}
              onChange={(e) => setForm({ ...form, maxPlayers: +e.target.value })}
              className="w-full accent-yellow-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Min Buy-in</label>
              <input
                type="number"
                className="input-poker"
                value={form.minBuyIn}
                onChange={(e) => setForm({ ...form, minBuyIn: +e.target.value })}
                min={1000}
                required
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Max Buy-in</label>
              <input
                type="number"
                className="input-poker"
                value={form.maxBuyIn}
                onChange={(e) => setForm({ ...form, maxBuyIn: +e.target.value })}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white uppercase tracking-wider disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c9a227, #8b6e1a)' }}
          >
            {loading ? 'Creating...' : 'Create Table'}
          </button>
        </form>
      </div>
    </div>
  );
}
