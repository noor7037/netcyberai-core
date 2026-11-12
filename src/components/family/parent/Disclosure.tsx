import type { ReactNode } from 'react';
import { Icon, type IconName } from './parts';

// One compact row that opens what it names (C506). The content stays mounted while closed (hidden), so a draft typed
// in an open panel is not lost when the row is closed; `open` and `onToggle` are the parent area's, so a link can open it.
export function Disclosure({ id, title, icon, open, onToggle, children }: { id: string; title: string; icon: IconName; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section data-parent-row={id} className="fam-card">
      <h2>
        <button type="button" id={`fam-parent-row-${id}`} aria-expanded={open} aria-controls={`fam-parent-row-body-${id}`} onClick={onToggle} className="fam-press flex min-h-[56px] w-full items-center gap-3 px-3 text-left">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lesson-sky text-lesson-sky-deep">
            <Icon name={icon} size={20} />
          </span>
          <span className="min-w-0 flex-1 break-words text-base font-bold text-slate">{title}</span>
          <Icon name="chevron" size={20} className={`shrink-0 text-slate transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
        </button>
      </h2>
      <div id={`fam-parent-row-body-${id}`} role="region" aria-labelledby={`fam-parent-row-${id}`} hidden={!open} className="flex flex-col gap-4 px-3 pb-3 [&[hidden]]:hidden">
        {children}
      </div>
    </section>
  );
}
