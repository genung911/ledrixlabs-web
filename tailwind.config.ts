import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Signature royal blue — used SPARINGLY, in the Tesla-red spirit (the delta mark,
        // link hover/active). `.ink` is the legible deeper blue for link text on the light
        // ground. The interface is otherwise monochrome; color comes from the photography.
        accent: { DEFAULT: '#217BE8', soft: '#7FB4F0', ink: 'rgb(var(--c-accent-ink) / <alpha-value>)' },
        // Light-forward system. Values are CSS variables (app/globals.css) holding the SAME light colours on every
        // page; only the inspector workspace (/app, .ws-root) redefines them, for its optional dark theme.
        ground:   'rgb(var(--c-ground) / <alpha-value>)', // cool off-white page ground
        surface:  'rgb(var(--c-surface) / <alpha-value>)', // cards
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)', // thin borders
        ink:      'rgb(var(--c-ink) / <alpha-value>)', // near-black cool — headings (also the dark bg on out-of-scope pages)
        body:     'rgb(var(--c-body) / <alpha-value>)', // slate body copy
        muted:    'rgb(var(--c-muted) / <alpha-value>)', // muted meta
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
