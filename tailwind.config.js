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
          DEFAULT: '#8B5CF6',
          dark:    '#7C3AED',
          light:   '#A78BFA',
          dim:     '#6D28D9',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
        'surface-gradient': 'linear-gradient(180deg, #131C31 0%, #0F172A 100%)',
      },
      animation: {
        'pulse-dot': 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      boxShadow: {
        'brand-glow': '0 0 20px rgba(139,92,246,0.25)',
        'brand-glow-lg': '0 0 40px rgba(139,92,246,0.3)',
      },
    },
  },
  plugins: [],
}
