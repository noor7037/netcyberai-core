'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warning' | 'danger';

type ToastEntry = { id: number; message: string; variant: Variant };

type ToastContextValue = {
  show: (message: string, variant?: Variant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: Variant = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live region: a screen reader announces a new toast as it
          appears, without needing focus to move -- Constitution §9's
          no-silent-failures rule applies to save confirmations, not
          only errors. */}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'danger' ? 'alert' : 'status'}
            className={`flex min-h-[44px] items-center justify-between gap-3 rounded-md border p-3 text-sm shadow-sm ${
              t.variant === 'success'
                ? 'border-emerald-text/30 bg-white text-emerald-text'
                : t.variant === 'warning'
                  ? 'border-amber-text/30 bg-white text-amber-text'
                  : t.variant === 'danger'
                    ? 'border-red-800/30 bg-white text-red-800'
                    : 'border-sapphire/30 bg-white text-sapphire'
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate/70 hover:text-slate"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
