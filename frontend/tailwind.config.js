import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  // Paths are relative to this file, not the process working directory.
  content: { relative: true, files: ['./index.html', './src/**/*.{js,jsx}'] },
  theme: {
    extend: {
      colors: {
        // Deep navy neutrals with a violet tint (950 is the original EcoAI background).
        ink: {
          950: '#050414',
          900: '#0b0a1f',
          850: '#100e28',
          800: '#151331',
          700: '#1f1c42',
          600: '#2e2a5a',
          500: '#5b5680',
          400: '#8a86a8',
          300: '#b5b2cc',
          200: '#d9d7e6',
          100: '#f0eff6',
        },
        // EcoAI purple, anchored on the original #8245ec.
        brand: {
          50: '#f4f0fe',
          100: '#e9e0fd',
          200: '#d4c2fb',
          300: '#b99af7',
          400: '#9b6ff1',
          500: '#8245ec',
          600: '#6d34d4',
          700: '#5a28b0',
          800: '#48218c',
          900: '#3a1c70',
          950: '#220f45',
        },
        // Pink partner for gradients and AI highlights (the original purple → pink).
        accent: { ...colors.fuchsia, DEFAULT: '#c026d3' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 10px 40px -12px rgba(130, 69, 236, 0.6)',
        card: '0 1px 0 0 rgba(255, 255, 255, 0.04) inset, 0 20px 40px -24px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        blink: { '0%, 80%, 100%': { opacity: 0.2 }, '40%': { opacity: 1 } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'fade-up': 'fade-up .35s ease-out both',
        blink: 'blink 1.4s infinite both',
      },
    },
  },
  plugins: [],
};
