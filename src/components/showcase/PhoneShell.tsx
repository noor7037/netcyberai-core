import type { ReactNode } from 'react';

// One phone frame for every phone preview on the site (the teacher app,
// the parent's WhatsApp and the homepage feed), so they read as one
// product family. The screen scrolls inside the frame; the page never
// scrolls sideways.
const BAR = { slate: 'bg-slate text-white', emerald: 'bg-emerald text-white', royal: 'bg-royal text-white' };

export function PhoneShell({
  header,
  footer,
  children,
  label,
  bar = 'slate',
  screen = 'bg-off-white',
  height = 'h-[36rem]',
  className = '',
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  label: string;
  bar?: 'slate' | 'emerald' | 'royal';
  screen?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[20rem] rounded-[2.6rem] border-[9px] border-midnight bg-midnight shadow-2xl shadow-slate/30 ${className}`}>
      <div className={`flex flex-col overflow-hidden rounded-[2rem] bg-white ${height}`}>
        <div className={`flex items-center justify-between px-5 pb-1 pt-2 text-[11px] font-semibold ${BAR[bar]}`}>
          <span>9:41</span>
          <span aria-hidden="true" className="h-4 w-20 rounded-full bg-midnight" />
          <span>5G</span>
        </div>
        {header}
        <div role="region" aria-label={label} tabIndex={0} className={`nca-scroll relative min-h-0 flex-1 overflow-y-auto ${screen} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-royal`}>
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
