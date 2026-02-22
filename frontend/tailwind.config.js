/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        input: '#252525',
        border: '#303030',
      },
      fontFamily: {
        sans: ['var(--font-app)', 'sans-serif'],
      }, animation: {
        'blink-caret': 'blink-caret 0.75s step-end infinite',
        'blink': 'blink 1s infinite',
        'scale-in': 'scale-in 0.3s ease-out forwards',
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'slide-up': 'slide-up 0.15s ease-out forwards',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        // Combat animations - directional for vertical battlefield
        'melee-attack-up': 'melee-attack-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'melee-attack-down': 'melee-attack-down 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'take-hit': 'take-hit 0.4s ease-out forwards',
      },
      keyframes: {
        'blink-caret': {
          '0%, 100%': { opacity: 0 },
          '50%': { opacity: 1 },
        },
        blink: {
          '0%, 100%': { opacity: 0 },
          '50%': { opacity: 1 },
        },
        'scale-in': {
          '0%': { transform: 'scale(0)', opacity: 0 },
          '80%': { transform: 'scale(1.2)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        'fade-in': {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        // Combat animation keyframes
        // Players attack upward (toward enemy row at top)
        'melee-attack-up': {
          '0%': {
            transform: 'translateY(0) translateX(0) rotate(0deg) scale(1)',
          },
          '20%': {
            transform: 'translateY(12px) translateX(0) rotate(8deg) scale(1.08)',
          },
          '50%': {
            transform: 'translateY(-80px) translateX(0) rotate(-12deg) scale(1.15)',
          },
          '70%': {
            transform: 'translateY(-70px) translateX(0) rotate(-8deg) scale(1.12)',
          },
          '100%': {
            transform: 'translateY(0) translateX(0) rotate(0deg) scale(1)',
          },
        },
        // Enemies attack downward (toward player row at bottom)
        'melee-attack-down': {
          '0%': {
            transform: 'translateY(0) translateX(0) rotate(0deg) scale(1)',
          },
          '20%': {
            transform: 'translateY(-12px) translateX(0) rotate(-8deg) scale(1.08)',
          },
          '50%': {
            transform: 'translateY(80px) translateX(0) rotate(12deg) scale(1.15)',
          },
          '70%': {
            transform: 'translateY(70px) translateX(0) rotate(8deg) scale(1.12)',
          },
          '100%': {
            transform: 'translateY(0) translateX(0) rotate(0deg) scale(1)',
          },
        },
        'take-hit': {
          '0%': {
            transform: 'translateX(0) rotate(0deg)',
            filter: 'brightness(1)',
          },
          '25%': {
            transform: 'translateX(-12px) rotate(-5deg)',
            filter: 'brightness(1.8)',
          },
          '50%': {
            transform: 'translateX(10px) rotate(4deg)',
            filter: 'brightness(1.5)',
          },
          '75%': {
            transform: 'translateX(-6px) rotate(-2deg)',
            filter: 'brightness(1.2)',
          },
          '100%': {
            transform: 'translateX(0) rotate(0deg)',
            filter: 'brightness(1)',
          },
        },
      },
      boxShadow: {
        'glow-blue': '0 0 8px rgba(59, 130, 246, 0.6)',
      },
    },
  },
  plugins: [],
};