import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-base font-semibold text-slate">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate/70">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
