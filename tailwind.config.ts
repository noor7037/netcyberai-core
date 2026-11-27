import type { Config } from 'tailwindcss';
import { colors, deepColors, accessibleTextColors, onAccentColors, lessonColors, lessonTints, artColors } from './src/lib/design-tokens';

// School app themes and dark mode (C553): these colours read a CSS variable first and fall back to the token itself, so
// every page outside the school app (which never sets the variables) looks exactly as before. Text, background and line
// utilities can take different values (a brand blue as a button stays deep; as text on the dark surface it turns light).
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const themed = (name: string, hex: string) => `rgb(var(--c-${name}, ${rgb(hex)}) / <alpha-value>)`;
const textOf = (name: string, hex: string) => `rgb(var(--t-${name}, var(--c-${name}, ${rgb(hex)})) / <alpha-value>)`;
const lineOf = (name: string, hex: string) => `rgb(var(--l-${name}, var(--c-${name}, ${rgb(hex)})) / <alpha-value>)`;
const TEXT_TINTED = ['sapphire', 'royal', 'azure', 'electric', 'emerald', 'grape', 'tangerine', 'coral', 'violet', 'turquoise', 'cyan', 'amber', 'gold'] as const;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Dark mode (C553): the page and the cards become dark surfaces; text-white stays white on coloured buttons.
      backgroundColor: {
        white: `rgb(var(--s-white, 255 255 255) / <alpha-value>)`,
        'off-white': `rgb(var(--s-page, ${rgb(colors.offWhite)}) / <alpha-value>)`,
        slate: `rgb(var(--b-slate, ${rgb(colors.slate)}) / <alpha-value>)`,
      },
      textColor: Object.fromEntries(([
        ['slate', textOf('slate', colors.slate)] as [string, unknown],
        ...TEXT_TINTED.map((n) => [n, { DEFAULT: textOf(n, colors[n]) }] as [string, unknown]),
      ] as [string, unknown][]).map(([n, v]) => {
        // The text-safe variants (text-royal-deep, text-emerald-text, …) turn to tints on the dark surface too; as a
        // background (bg-grape-deep behind white text) they keep their own value.
        const variants: Record<string, Record<string, string>> = {
          royal: { deep: textOf('royal-deep', deepColors.royalDeep) },
          grape: { deep: textOf('grape-deep', deepColors.grapeDeep) },
          tangerine: { deep: textOf('tangerine-deep', deepColors.tangerineDeep) },
          coral: { deep: textOf('coral-deep', deepColors.coralDeep) },
          gold: { deep: textOf('gold-deep', deepColors.goldDeep), text: onAccentColors.onGold },
          emerald: { text: textOf('emerald-text', accessibleTextColors.emeraldText) },
          amber: { text: textOf('amber-text', accessibleTextColors.amberText) },
          cyan: { text: onAccentColors.onCyan },
        };
        return [n, typeof v === 'string' ? v : { ...(v as object), ...(variants[n] ?? {}) }];
      })),
      borderColor: { slate: lineOf('slate', colors.slate) },
      ringColor: { slate: lineOf('slate', colors.slate) },
      divideColor: { slate: lineOf('slate', colors.slate) },
      colors: {
        sapphire: themed('sapphire', colors.sapphire),
        midnight: themed('midnight', colors.midnight),
        azure: themed('azure', colors.azure),
        royal: { DEFAULT: themed('royal', colors.royal), deep: deepColors.royalDeep },
        electric: themed('electric', colors.electric),
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
        slate: themed('slate', colors.slate),
        'off-white': colors.offWhite,
        // W10-4 (C413): the lesson identity on every Family screen (src/lib/design-tokens.ts lessonColors).
        ink: lessonColors.ink,
        paper: lessonColors.paper,
        card: lessonColors.card,
        saffron: { DEFAULT: lessonColors.saffron, deep: lessonColors.saffronDeep },
        // W12-E (C419): the five lesson tints and their accents as classes (bg-lesson-mint, bg-lesson-mint-deep, ...).
        lesson: Object.fromEntries(
          Object.entries(lessonTints).flatMap(([name, v]) => [
            [name, v.tint],
            [`${name}-deep`, v.accent],
          ]),
        ),
        // C513: the Draw tab's art table (bg-art-coral, bg-art-sky, bg-art-mint, bg-art-butter, bg-art-lavender, bg-art-table).
        art: artColors,
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
        // C549: the school assistant's eyes blink while it works.
        blink: { '0%, 88%, 100%': { transform: 'scaleY(1)' }, '94%': { transform: 'scaleY(0.1)' } },
      },
      animation: {
        'drawer-in': 'drawer-in 180ms ease-out',
        blink: 'blink 2.4s ease-in-out infinite',
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
