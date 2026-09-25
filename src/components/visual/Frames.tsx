import type { ReactNode } from 'react';

export function BrowserFrame({ url = 'app.netcyberai.com', children, className = '' }: { url?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-2xl shadow-sapphire/10 ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-slate/10 bg-off-white px-4 py-2.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-coral" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-leaf" />
        <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-xs text-slate/70">{url}</span>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}

// A phone with a WhatsApp-style chat header. The chat surface is a
// light peach wash (checker-visible) standing in for WhatsApp's beige.
export function PhoneFrame({ title, subtitle, children, className = '', compact = false }: { title: string; subtitle?: string; children: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={`mx-auto w-full max-w-[18rem] rounded-[2.2rem] border-[7px] border-midnight bg-midnight shadow-2xl shadow-grape/20 ${className}`}>
      <div className="overflow-hidden rounded-[1.7rem] bg-off-white">
        <div className="flex items-center gap-2 bg-emerald px-3 py-2.5 text-white">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            NC
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle && <p className="truncate text-xs text-white">{subtitle}</p>}
          </div>
        </div>
        <div className={`flex flex-col gap-2 bg-peach/25 p-3 ${compact ? '' : 'min-h-[18rem]'}`}>{children}</div>
      </div>
    </div>
  );
}

export function ChatIn({ children, time }: { children: ReactNode; time?: string }) {
  return (
    <div className="mr-8 self-start rounded-xl rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug text-slate shadow-sm">
      {children}
      {time && <span className="mt-1 block text-right text-[10px] text-slate/70">{time}</span>}
    </div>
  );
}

export function ChatOut({ children, time }: { children: ReactNode; time?: string }) {
  return (
    <div className="ml-8 self-end rounded-xl rounded-tr-none bg-leaf/25 px-3 py-2 text-[13px] leading-snug text-slate shadow-sm">
      {children}
      {time && <span className="mt-1 block text-right text-[10px] text-slate/70">{time}</span>}
    </div>
  );
}
