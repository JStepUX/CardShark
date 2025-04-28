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
        sans: ['Poppins', 'sans-serif'],
      },
      animation: {
        'blink-caret': 'blink-caret 0.75s step-end infinite',
        'blink': 'blink 1s infinite',
        'scale-in': 'scale-in 0.3s ease-out forwards',
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
      },
      boxShadow: {
        'glow-blue': '0 0 8px rgba(59, 130, 246, 0.6)',
      },
    },
  },
  plugins: [],
};