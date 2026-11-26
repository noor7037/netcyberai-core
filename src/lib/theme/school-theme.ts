import { chartSeries, colors, deepColors, accessibleTextColors, schoolDark, schoolThemes, SCHOOL_MODE_IDS, SCHOOL_THEME_IDS, type SchoolModeId, type SchoolThemeId } from '@/lib/design-tokens';

// The school app's themes and dark mode as CSS (C553), made from the design tokens, so the tokens stay the one source.
// The layout puts data-nca-theme and data-nca-mode on the school app's wrapper (and, for pop-ups drawn outside it, on
// <html> while the school app is open); these rules set the colour variables tailwind.config.ts reads. Outside the
// school app nothing sets them, so every other page keeps its colours. Printing is always the light page.

export const THEME_COOKIE = 'nca_mode'; // the person's own light / dark / system choice, on their device
export const isSchoolTheme = (v: unknown): v is SchoolThemeId => typeof v === 'string' && (SCHOOL_THEME_IDS as readonly string[]).includes(v);
export const isSchoolMode = (v: unknown): v is SchoolModeId => typeof v === 'string' && (SCHOOL_MODE_IDS as readonly string[]).includes(v);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const block = (selector: string, vars: Record<string, string>) => `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;

function themeVars(id: SchoolThemeId): Record<string, string> {
  const t = schoolThemes[id];
  return {
    '--c-sapphire': rgb(t.sapphire),
    '--c-midnight': rgb(t.midnight),
    '--c-royal': rgb(t.royal),
    '--c-electric': rgb(t.electric),
    '--c-azure': rgb(t.azure),
    ...Object.fromEntries(t.chart.map((c, i) => [`--chart-${i + 1}`, c])),
  };
}

function darkVars(id: SchoolThemeId): Record<string, string> {
  const t = schoolThemes[id];
  const tints = schoolDark.textTints;
  return {
    'color-scheme': 'dark',
    '--s-white': rgb(schoolDark.surface),
    '--s-page': rgb(schoolDark.page),
    '--t-slate': rgb(schoolDark.text),
    '--l-slate': rgb(schoolDark.text),
    '--b-slate': '100 116 139', // a solid slate chip keeps white text readable (4.8:1), a faint slate fill stays visible
    '--t-sapphire': rgb(t.darkText.sapphire),
    '--t-royal': rgb(t.darkText.royal),
    '--t-royal-deep': rgb(t.darkText.royal),
    '--t-azure': rgb(t.darkText.azure),
    '--t-electric': rgb(t.darkText.electric),
    '--t-emerald': rgb(tints.emerald),
    '--t-emerald-text': rgb(tints.emerald),
    '--t-grape': rgb(tints.grape),
    '--t-grape-deep': rgb(tints.grape),
    '--t-tangerine': rgb(tints.tangerine),
    '--t-tangerine-deep': rgb(tints.tangerine),
    '--t-coral': rgb(tints.coral),
    '--t-coral-deep': rgb(tints.coral),
    '--t-violet': rgb(tints.violet),
    '--t-turquoise': rgb(tints.turquoise),
    '--t-cyan': rgb(tints.cyan),
    '--t-amber': rgb(tints.amber),
    '--t-amber-text': rgb(tints.amber),
    '--t-gold': rgb(tints.gold),
    '--t-gold-deep': rgb(tints.gold),
    '--chart-grid': schoolDark.chartGrid,
    '--chart-text': schoolDark.chartText,
    // Text with no class of its own inherits the light text, not the body's dark ink.
    color: 'rgb(var(--t-slate))',
  };
}

export function schoolThemeCss(): string {
  const out: string[] = [];
  for (const id of SCHOOL_THEME_IDS) {
    out.push(block(`[data-nca-theme="${id}"]`, themeVars(id)));
    // Dark only on the screen: a printed page is always the light one.
    out.push(`@media screen{${block(`[data-nca-theme="${id}"][data-nca-mode="dark"]`, darkVars(id))}}`);
    out.push(`@media screen and (prefers-color-scheme: dark){${block(`[data-nca-theme="${id}"][data-nca-mode="system"]`, darkVars(id))}}`);
  }
  // The page itself takes the dark page colour behind everything.
  out.push(`@media screen{html[data-nca-mode="dark"] body,div[data-nca-mode="dark"]{background-color:rgb(var(--s-page));color:rgb(var(--t-slate))}}`);
  out.push(`@media screen and (prefers-color-scheme: dark){html[data-nca-mode="system"] body,div[data-nca-mode="system"]{background-color:rgb(var(--s-page));color:rgb(var(--t-slate))}}`);
  return out.join('\n');
}

// What the tests check for contrast: each theme and mode's pairs as they appear on screens.
export function paletteFor(id: SchoolThemeId, dark: boolean) {
  const t = schoolThemes[id];
  const tints = schoolDark.textTints;
  return {
    page: dark ? schoolDark.page : colors.offWhite,
    surface: dark ? schoolDark.surface : '#FFFFFF',
    text: dark ? schoolDark.text : colors.slate,
    buttons: [t.sapphire, t.royal, t.midnight, t.electric, t.azure], // white text on each
    textOnSurface: dark ? [t.darkText.sapphire, t.darkText.royal, t.darkText.azure, tints.emerald, tints.grape, tints.tangerine, tints.coral] : [t.sapphire, t.royal, t.azure, accessibleTextColors.emeraldText, deepColors.grapeDeep, deepColors.tangerineDeep, deepColors.coralDeep],
    chart: t.chart,
  };
}
export const CLASSIC_CHART = chartSeries;
