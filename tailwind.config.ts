import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          DEFAULT: '#16a34a',
          600: '#15803d',
          700: '#166534',
          900: '#14532d',
        },
        traffic: {
          green: '#16a34a',
          yellow: '#d97706',
          red: '#dc2626',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,83,45,0.05), 0 4px 14px rgba(20,83,45,0.07)',
        lift: '0 4px 10px rgba(20,83,45,0.08), 0 12px 32px rgba(20,83,45,0.10)',
      },
      fontFamily: {
        sans: ['var(--font-tajawal)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0%)' },
        },
        'fade-slide': {
          '0%, 100%': { opacity: '0', transform: 'translateY(6px)' },
          '10%, 90%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
      },
      animation: {
        ticker: 'ticker 32s linear infinite',
        'fade-slide': 'fade-slide 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
