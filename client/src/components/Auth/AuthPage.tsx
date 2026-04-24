import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #1a0505 0%, #0d0303 60%, #050101 100%)',
      }}
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute opacity-5 text-6xl"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          >
            {['♠', '♥', '♦', '♣'][i % 4]}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl font-bold mb-2"
            style={{
              fontFamily: 'Cinzel, serif',
              background: 'linear-gradient(135deg, #c9a227, #f0c040, #c9a227)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ♠ AcePoker
          </h1>
          <p className="text-gray-400 text-sm">Premium Texas Hold'em with USDT</p>
        </div>

        {/* Card */}
        <div className="glass-panel p-8">
          {/* Tab switcher */}
          <div className="flex mb-6 bg-black/30 rounded-xl p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-yellow-700 to-yellow-900 text-yellow-300'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-yellow-700 to-yellow-900 text-yellow-300'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Register
            </button>
          </div>

          {mode === 'login' ? (
            <LoginForm onSwitchMode={() => setMode('register')} />
          ) : (
            <RegisterForm onSwitchMode={() => setMode('login')} />
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Play responsibly. 18+ only.
        </p>
      </div>
    </div>
  );
}
