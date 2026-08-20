/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bloomberg': {
          'dark': '#0d1117',
          'darker': '#010409',
          'panel': '#161b22',
          'border': '#30363d',
          'text': '#c9d1d9',
          'text-muted': '#8b949e',
          'accent': '#1f6feb',
          'accent-hover': '#2f81f7',
        },
        // FinDash colors
        'groww': {
          'dark': '#1a1a2e',
          'darker': '#0f0f1a',
          'green': '#00d09c',
          'light': '#ffffff',
          'gray': '#8b8b9a',
        },
        'positive': '#00d09c',
        'negative': '#ff6b6b',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

