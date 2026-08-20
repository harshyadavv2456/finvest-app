/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // FinVest brand colors
        'finvest': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Authority colors
        'authority': {
          locked: '#22c55e',   // Green - LOCKED status
          warning: '#f59e0b',  // Amber - WARNING status
          error: '#ef4444',    // Red - ERROR status
        },
        // Intent colors
        'intent': {
          initiate: '#22c55e',    // Green
          accumulate: '#3b82f6',  // Blue
          hold: '#6b7280',        // Gray
          reduce: '#f59e0b',      // Amber
          avoid: '#ef4444',       // Red
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

