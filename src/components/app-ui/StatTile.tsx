import type { ReactNode } from 'react';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import type { IconName } from '@/components/visual/Icons';
import type { ColorToken } from '@/lib/contracts/modules';

// A figure with its icon chip above it and its label under it (design system
// v5, C235-C; C240, kept with the shared parts by the lead): the same look as the
// KPI tile of the dashboards, for a figure a screen computes itself (a total
// of rupees, a count of rows) where the dashboard's tile contract does not
// fit. The value and the label are plain text, so a screen keeps its own data
// attributes (`attrs` on the tile, `valueAttrs` on the value). Not a link.
type Attrs = Record<string, string | number | undefined>;

export function StatTile({
  icon,
  tone = 'royal',
  label,
  value,
  note,
  attrs,
  valueAttrs,
  className = '',
}: {
  icon: IconName;
  tone?: ColorToken;
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  attrs?: Attrs;
  valueAttrs?: Attrs;
  className?: string;
}) {
  return (
    <div {...attrs} className={`flex min-w-0 flex-col gap-0.5 rounded-2xl border border-slate/10 bg-white p-3 shadow-sm ${className}`}>
      <ModuleIcon name={icon} tone={tone} size="sm" variant="solid" />
      <p {...valueAttrs} className="mt-2 break-words text-2xl font-extrabold tabular-nums tracking-tight text-slate">
        {value}
      </p>
      <p className="text-sm font-medium text-slate/70">{label}</p>
      {note && <p className="text-xs text-slate/70">{note}</p>}
    </div>
  );
}
