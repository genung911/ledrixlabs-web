import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Signature royal blue — used SPARINGLY, in the Tesla-red spirit (the delta mark,
        // link hover/active). `.ink` is the legible deeper blue for link text on the light
        // ground. The interface is otherwise monochrome; color comes from the photography.
        accent: { DEFAULT: '#217BE8', soft: '#7FB4F0', ink: '#1A63C8' },
        // Light-forward system
        ground:   '#F6F8FA', // cool off-white page ground
        surface:  '#FFFFFF', // cards
        hairline: '#E4E9EE', // thin borders
        ink:      '#0A0F14', // near-black cool — headings (also the dark bg on out-of-scope pages)
        body:     '#48586A', // slate body copy
        muted:    '#8A98A5', // muted meta
        dark:     '#0A0F11', // near-black — the full-bleed dark "hero moments"
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
