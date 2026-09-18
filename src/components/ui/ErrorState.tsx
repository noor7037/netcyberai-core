import type { ReactNode } from 'react';

type Props = {
  message: string;
  action?: ReactNode;
};

// Constitution §9's no-silent-failures rule, as a primitive: a
// data-driven view (Table, most of all) must never just show nothing
// when a load fails. red-800 for AAA on this critical state, matching
// the login page's error text.
export function ErrorState({ message, action }: Props) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-base font-semibold text-red-800">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
