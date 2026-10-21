'use client';

import { useRouter } from 'next/navigation';

// Sign out of the family app (C230-D): the same sign-out as staff, then the sign-in page.
export function ParentSignOut({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-family-sign-out
      className="min-h-[44px] rounded-md border border-white/30 bg-royal-deep px-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/login');
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
