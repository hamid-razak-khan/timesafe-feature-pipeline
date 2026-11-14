/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ts: {
          bg: '#080811',
          secondary: '#10101F',
          card: '#16112B',
          surface: '#211936',
          violet: '#8B5CF6',
          neon: '#A855F7',
          lavender: '#D8B4FE',
          text: '#F8F7FF',
          muted: '#A1A1B5',
          border: 'rgba(168, 85, 247, 0.18)',
          borderHover: 'rgba(168, 85, 247, 0.4)',
        },
        navy: {
          900: '#080811',
          800: '#10101F',
          700: '#16112B',
          600: '#211936',
        },
        brand: {
          blue: '#8B5CF6',
          cyan: '#A855F7',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
        }
      },
      boxShadow: {
        neon: '0 0 20px -3px rgba(168, 85, 247, 0.25)',
        'neon-sm': '0 0 12px -2px rgba(168, 85, 247, 0.2)',
        'neon-lg': '0 0 35px -5px rgba(168, 85, 247, 0.35)',
      }
    },
  },
  plugins: [],
}

