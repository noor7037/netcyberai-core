import Link from 'next/link';
import type { ReactNode } from 'react';
import { FamIcon, type IconName } from '../FamIcon';

// A row that opens another screen (W6-B, docs/38 §5): an optional mark, the words, a chevron. 48 px or more, 12 px
// radius, lifts on hover and presses on tap (family.css `.fam-row`, `.fam-lift`). Used inside a card, or as a card (`card`).
export function LinkRow({ href, icon, children, card = false, ...data }: { href: string; icon?: IconName; children: ReactNode; card?: boolean; [data: `data-${string}`]: string | boolean | undefined }) {
  return (
    <Link href={href} {...data} className={`fam-row fam-lift justify-between text-base font-bold text-royal-deep ${card ? 'fam-card min-h-[56px] bg-white' : 'bg-off-white'}`}>
      <span className="flex min-w-0 items-center gap-3">
        {icon && <FamIcon name={icon} className="h-5 w-5 shrink-0" />}
        <span className="min-w-0">{children}</span>
      </span>
      <FamIcon name="next" className="h-5 w-5 shrink-0" />
    </Link>
  );
}
