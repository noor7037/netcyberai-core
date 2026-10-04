import type { ReactNode } from 'react';

// Every screen's four other states (16 §3 rule 4: loading, empty, error,
// no permission). Each says what is happening and what to do next.

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="nca-shimmer block h-4 rounded-md bg-gradient-to-r from-slate/5 via-slate/10 to-slate/5"
          style={{ width: `${100 - ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  );
}

function StateBox({ title, children, action, role }: { title: string; children?: ReactNode; action?: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div role={role} className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
      <p className="text-base font-bold text-slate">{title}</p>
      {children && <div className="text-sm text-slate/70">{children}</div>}
      {action}
    </div>
  );
}

// Nothing here yet: say what to do to fill it.
export function EmptyState({ title, whatToDo, action }: { title: string; whatToDo: string; action?: ReactNode }) {
  return (
    <StateBox title={title} action={action} role="status">
      {whatToDo}
    </StateBox>
  );
}

export function ErrorState({ message = 'Something went wrong while loading this.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <StateBox
      title="Could not load"
      role="alert"
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Try again
          </button>
        )
      }
    >
      {message}
    </StateBox>
  );
}

const NO_ACCESS: Record<'role' | 'module' | 'read_only', { title: string; text: string }> = {
  role: { title: 'Not available for your role', text: 'Ask your principal or school admin if you need this.' },
  module: { title: 'Not switched on for your school', text: 'Your school’s plan does not include this module yet. Your principal can ask NetCyberAI to switch it on.' },
  read_only: { title: 'Read only for now', text: 'Your school can view and export, but not change anything, until the account is settled.' },
};

// No permission: the API's 403 reasons (role_not_allowed, module_not_enabled, read_only).
export function NoAccessState({ reason }: { reason: 'role' | 'module' | 'read_only' }) {
  const { title, text } = NO_ACCESS[reason];
  return <StateBox title={title}>{text}</StateBox>;
}
