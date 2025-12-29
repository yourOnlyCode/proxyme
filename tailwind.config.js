// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    theme: {
      extend: {
        colors: {
          // Intent Colors (Slightly refined for professional look)
          romance: '#E11D48', // Rose-600 (Professional Pink/Red)
          friendship: '#059669', // Emerald-600 (Professional Green)
          business: '#2563EB', // Blue-600 (Stripe/Vercel Blue)
          
          // Semantic Neutrals (Beige with Slate accents)
          paper: '#FAF7F2', // Warm beige for cards
          background: '#F9F6F1', // Light beige for app background
          ink: '#0F172A', // Slate-900 for primary text
          
          // Beige Palette
          beige: {
            50: '#FDFCF9',
            100: '#FAF7F2',
            200: '#F5F0E8',
            300: '#EDE5D8',
            400: '#E0D4C2',
            500: '#D4C4AC',
            600: '#C4B096',
            700: '#B09A80',
            800: '#9C846A',
            900: '#8A7056',
          },
          
          // Slate Palette (Explicitly added for reference/usage)
          slate: {
            50: '#f8fafc',
            100: '#f1f5f9',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155',
            800: '#1e293b',
            900: '#0f172a',
          },

          // Utility
          subtle: '#F1F5F9', // Slate-100 for subtle backgrounds
          border: '#E2E8F0', // Slate-200 for borders
          muted: '#64748B', // Slate-500 for secondary text
        },
        fontFamily: {
          sans: ['LibertinusSans-Regular', 'system-ui', 'sans-serif'],
          'sans-bold': ['LibertinusSans-Bold', 'system-ui', 'sans-serif'],
          'sans-italic': ['LibertinusSans-Italic', 'system-ui', 'sans-serif'],
        }
      },
    },
    plugins: [],
  }
