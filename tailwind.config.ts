import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand cyan — neon for glows + dark sections; `.ink` is the legible
        // deeper cyan reserved for accent text / links / underlines on the light ground.
        accent: { DEFAULT: '#00F3FF', soft: '#67e8f9', ink: '#0891A8' },
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
