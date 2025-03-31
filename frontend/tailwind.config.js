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
      },
    },
  },
  plugins: [],
};