import type { Config } from 'tailwindcss';
import { colors, deepColors, accessibleTextColors, onAccentColors } from './src/lib/design-tokens';

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
      },
      // The phone menu slides in from the left (F1-2); `motion-reduce:animate-none` takes the slide away.
      keyframes: {
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'drawer-in': 'drawer-in 180ms ease-out',
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
