import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        paper: '#FFFFFF',
      },
      boxShadow: {
        glass: '0 12px 40px rgba(15, 23, 42, 0.14)',
      },
      backdropBlur: {
        glass: '18px',
      },
    },
  },
  plugins: [],
} satisfies Config;

