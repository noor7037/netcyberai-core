import { Icon, type IconName } from '@/components/visual/Icons';
import type { ColorToken } from '@/lib/contracts/modules';
import { TOKEN_TONES } from './tones';

// An icon in its rounded, coloured tile (docs/19 §3.2): every module's
// icon wears its group's colour, in the sidebar, the dashboards, quick
// actions and empty states. `soft` is the resting tile; `solid` marks the
// selected one and reads on dark surfaces. Decorative: the word beside it
// names the thing.
const SIZE = {
  sm: ['h-8 w-8 rounded-lg', 'h-4 w-4'],
  md: ['h-10 w-10 rounded-xl', 'h-5 w-5'],
  lg: ['h-14 w-14 rounded-2xl', 'h-7 w-7'],
} as const;

export function ModuleIcon({ name, tone, size = 'md', variant = 'soft', className = '' }: { name: IconName; tone: ColorToken; size?: keyof typeof SIZE; variant?: 'soft' | 'solid'; className?: string }) {
  const [box, glyph] = SIZE[size];
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ${box} ${TOKEN_TONES[tone][variant]} ${className}`}>
      <Icon name={name} className={glyph} />
    </span>
  );
}
