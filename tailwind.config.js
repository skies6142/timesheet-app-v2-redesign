/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          amber: '#f59e0b',
        }
      },
      animation: {
        'pulse-dot': 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
      }
    },
  },
  plugins: [],
}
