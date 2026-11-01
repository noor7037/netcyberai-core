import type { ReactNode } from 'react';
import { lessonTints, type LessonTint } from '@/lib/design-tokens';
import { FamIcon, type IconName } from './FamIcon';

// One number on a tint (W14-G): the parent area's Overview shows what the school says as tiles in the Family
// identity's colours, one icon each (the Family set), the number big and the plain lines under it (what it is, and where it is from).
export function ParentTile({ tint, icon, label, value, lines, ...rest }: { tint: LessonTint; icon: IconName; label: string; value: string; lines: ReactNode[] } & Record<`data-${string}`, string | undefined>) {
  const c = lessonTints[tint];
  return (
    <div {...rest} className="flex min-w-0 flex-col gap-1 rounded-2xl p-3" style={{ backgroundColor: c.tint }}>
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-white" style={{ color: c.accent }}>
        <FamIcon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-1 text-sm font-bold text-ink">{label}</p>
      <p className="fam-num text-2xl font-extrabold text-ink">{value}</p>
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-ink/80">
          {line}
        </p>
      ))}
    </div>
  );
}
