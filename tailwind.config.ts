import type { Config } from 'tailwindcss';
import { colors, deepColors, accessibleTextColors, onAccentColors, lessonColors } from './src/lib/design-tokens';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sapphire: colors.sapphire,
        midnight: colors.midnight,
        azure: colors.azure,
        royal: { DEFAULT: colors.royal, deep: deepColors.royalDeep },
        electric: colors.electric,
        cyan: { DEFAULT: colors.cyan, text: onAccentColors.onCyan },
        turquoise: colors.turquoise,
        leaf: colors.leaf,
        grape: { DEFAULT: colors.grape, deep: deepColors.grapeDeep },
        violet: colors.violet,
        tangerine: { DEFAULT: colors.tangerine, deep: deepColors.tangerineDeep },
        coral: { DEFAULT: colors.coral, deep: deepColors.coralDeep },
        sunshine: colors.sunshine,
        peach: { DEFAULT: colors.peach, text: onAccentColors.onPeach },
        emerald: { DEFAULT: colors.emerald, text: accessibleTextColors.emeraldText },
        amber: { DEFAULT: colors.amber, text: accessibleTextColors.amberText },
        gold: { DEFAULT: colors.gold, text: onAccentColors.onGold, deep: deepColors.goldDeep },
        slate: colors.slate,
        'off-white': colors.offWhite,
        // W10-4 (C413): the lesson identity on every Family screen (src/lib/design-tokens.ts lessonColors).
        ink: lessonColors.ink,
        paper: lessonColors.paper,
        saffron: { DEFAULT: lessonColors.saffron, deep: lessonColors.saffronDeep },
      },
      // The phone menu slides in from the left (F1-2); `motion-reduce:animate-none` takes the slide away.
      // The English course's motion (docs/family-app/12 §10): short, explaining, and off under reduced motion
      // (`motion-reduce:animate-none` on every use).
      keyframes: {
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        'pop-in': { '0%': { transform: 'scale(0.4)', opacity: '0' }, '70%': { transform: 'scale(1.12)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'rise-in': { from: { transform: 'translateY(14px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'flip-in': { from: { transform: 'rotateY(90deg)', opacity: '0.4' }, to: { transform: 'rotateY(0)', opacity: '1' } },
        draw: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        glow: { '0%, 100%': { transform: 'scale(1)', opacity: '0.55' }, '50%': { transform: 'scale(1.25)', opacity: '0' } },
        'bounce-once': { '0%, 100%': { transform: 'translateY(0)' }, '40%': { transform: 'translateY(-10px)' }, '70%': { transform: 'translateY(2px)' } },
        burst: { '0%': { transform: 'translate(0, 0) scale(0.6)', opacity: '1' }, '100%': { transform: 'translate(var(--bx), var(--by)) scale(1)', opacity: '0' } },
        nudge: { '0%, 100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-5px)' }, '75%': { transform: 'translateX(5px)' } },
      },
      animation: {
        'drawer-in': 'drawer-in 180ms ease-out',
        'pop-in': 'pop-in 360ms cubic-bezier(.2,.9,.3,1.2)',
        'rise-in': 'rise-in 320ms ease-out',
        'flip-in': 'flip-in 300ms ease-out',
        draw: 'draw 900ms ease-out forwards',
        glow: 'glow 1.8s ease-in-out infinite',
        'bounce-once': 'bounce-once 600ms ease-out',
        burst: 'burst 900ms ease-out forwards',
        nudge: 'nudge 300ms ease-in-out',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans Devanagari"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
