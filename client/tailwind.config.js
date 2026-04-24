/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        poker: {
          dark: '#0a0205',
          bg: '#16040c',
          maroon: '#6b1a1a',
          red: '#8b0000',
          gold: '#c9a227',
          'gold-light': '#f0c040',
          chip: '#2d6a4f',
          felt: '#1e4d2b',
          table: '#1e5c28',
          rail: '#5c2810',
        },
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
        poker: ['Cinzel', 'Georgia', 'serif'],
      },
      keyframes: {
        dealCard: {
          '0%': { transform: 'translateX(-180px) translateY(-120px) rotate(-12deg) scale(0.4)', opacity: '0' },
          '65%': { transform: 'translateX(4px) translateY(4px) rotate(0.5deg) scale(1.03)', opacity: '1' },
          '100%': { transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)', opacity: '1' },
        },
        cardFlip: {
          '0%': { transform: 'rotateY(90deg) scale(0.9)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg) scale(1)', opacity: '1' },
        },
        chipSlide: {
          '0%': { transform: 'scale(0) translateY(-8px)', opacity: '0' },
          '60%': { transform: 'scale(1.18) translateY(0)', opacity: '1' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        pulse_glow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(201, 162, 39, 0.5)' },
          '50%': { boxShadow: '0 0 32px rgba(201, 162, 39, 1), 0 0 64px rgba(201, 162, 39, 0.35)' },
        },
        winnerGlow: {
          '0%, 100%': { boxShadow: '0 0 24px rgba(201, 162, 39, 0.7)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 56px rgba(201, 162, 39, 1), 0 0 88px rgba(201, 162, 39, 0.5)', transform: 'scale(1.09)' },
        },
        actionBadge: {
          '0%': { transform: 'scale(0) translateY(-6px)', opacity: '0' },
          '65%': { transform: 'scale(1.12) translateY(0)', opacity: '1' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        floatIn: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bouncePop: {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '60%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        winnerBanner: {
          '0%': { transform: 'translateX(-50%) scale(0.75) translateY(16px)', opacity: '0' },
          '65%': { transform: 'translateX(-50%) scale(1.06) translateY(0)', opacity: '1' },
          '100%': { transform: 'translateX(-50%) scale(1) translateY(0)', opacity: '1' },
        },
        tableGlow: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        timerUrgent: {
          '0%, 100%': { filter: 'drop-shadow(0 0 4px #ef4444)' },
          '50%': { filter: 'drop-shadow(0 0 14px #ef4444) drop-shadow(0 0 24px #ef4444)' },
        },
        betBadge: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '70%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Player seat entrance (translate included so centering stays correct)
        seatEnter: {
          '0%':   { transform: 'translate(-50%, -50%) scale(0.3)', opacity: '0' },
          '65%':  { transform: 'translate(-50%, -50%) scale(1.1)', opacity: '1' },
          '100%': { transform: 'translate(-50%, -50%) scale(1)',   opacity: '1' },
        },
        // Dealer / blind chip spin-in
        chipSpin: {
          '0%':   { transform: 'scale(0) rotate(-180deg)', opacity: '0' },
          '70%':  { transform: 'scale(1.25) rotate(12deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)',     opacity: '1' },
        },
        // Thinking dots (used with staggered delay)
        thinkDot: {
          '0%, 80%, 100%': { opacity: '0', transform: 'scale(0)' },
          '40%':           { opacity: '1', transform: 'scale(1)' },
        },
        // Chip flies from seat → pot
        chipFlyToCenter: {
          '0%':   { transform: 'translate(var(--fx), var(--fy)) scale(1.4)', opacity: '1' },
          '60%':  { opacity: '1' },
          '100%': { transform: 'translate(0px, 0px) scale(0.25)', opacity: '0' },
        },
        // Chip flies from pot → winner seat
        chipFlyFromCenter: {
          '0%':   { transform: 'translate(0px, 0px) scale(0.5)', opacity: '0' },
          '15%':  { opacity: '1', transform: 'translate(calc(var(--fx) * 0.1), calc(var(--fy) * 0.1)) scale(1.5)' },
          '100%': { transform: 'translate(var(--fx), var(--fy)) scale(0.8)', opacity: '0' },
        },
        // Moving felt sheen
        feltSheen: {
          '0%':   { transform: 'translateX(-80%) translateY(-40%)', opacity: '0' },
          '20%':  { opacity: '0.8' },
          '50%':  { transform: 'translateX(80%) translateY(40%)', opacity: '0.6' },
          '80%':  { opacity: '0.8' },
          '100%': { transform: 'translateX(-80%) translateY(-40%)', opacity: '0' },
        },
      },
      animation: {
        dealCard: 'dealCard 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        cardFlip: 'cardFlip 0.35s ease-out',
        chipSlide: 'chipSlide 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)',
        pulse_glow: 'pulse_glow 1.5s ease-in-out infinite',
        winnerGlow: 'winnerGlow 0.85s ease-in-out infinite',
        actionBadge: 'actionBadge 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer: 'shimmer 2.2s linear infinite',
        floatIn: 'floatIn 0.4s ease-out',
        bouncePop: 'bouncePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        winnerBanner: 'winnerBanner 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        tableGlow: 'tableGlow 3s ease-in-out infinite',
        timerUrgent: 'timerUrgent 0.5s ease-in-out infinite',
        betBadge: 'betBadge 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        seatEnter: 'seatEnter 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        chipSpin: 'chipSpin 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        thinkDot: 'thinkDot 1.4s ease-in-out infinite',
        chipFlyToCenter: 'chipFlyToCenter 0.7s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        chipFlyFromCenter: 'chipFlyFromCenter 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        feltSheen: 'feltSheen 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
