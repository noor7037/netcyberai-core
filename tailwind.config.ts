import type { Config } from 'tailwindcss';
import { colors, accessibleTextColors, onAccentColors } from './src/lib/design-tokens';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sapphire: colors.sapphire,
        azure: colors.azure,
        cyan: { DEFAULT: colors.cyan, text: onAccentColors.onCyan },
        violet: colors.violet,
        peach: { DEFAULT: colors.peach, text: onAccentColors.onPeach },
        emerald: { DEFAULT: colors.emerald, text: accessibleTextColors.emeraldText },
        amber: { DEFAULT: colors.amber, text: accessibleTextColors.amberText },
        gold: { DEFAULT: colors.gold, text: onAccentColors.onGold },
        slate: colors.slate,
        'off-white': colors.offWhite,
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
