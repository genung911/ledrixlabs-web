import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#00F3FF', soft: '#67e8f9' },
        ink:    '#070707',
        bg:     '#080808',
        card:   '#0e0e0e',
        safety: '#FF3B3B',
        warn:   '#FACC15',
        ok:     '#22C55E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
