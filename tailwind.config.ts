import type { Config } from 'tailwindcss';
import { colors, accessibleTextColors } from './src/lib/design-tokens';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sapphire: colors.sapphire,
        emerald: { DEFAULT: colors.emerald, text: accessibleTextColors.emeraldText },
        amber: { DEFAULT: colors.amber, text: accessibleTextColors.amberText },
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
