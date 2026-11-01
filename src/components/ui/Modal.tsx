'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** A wider sheet for long forms (the demo dashboard's Add dialog). */
  wide?: boolean;
};

const AUTOFOCUS_SELECTOR = '[data-autofocus]';
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The native <dialog> element via showModal() for Escape-to-close and
// top-layer/backdrop behavior -- but NOT relying on it alone for the
// focus trap. Verified by testing (Playwright, real Tab keypresses,
// Chromium 141): tabbing past the dialog's last focusable element
// reaches document.body for one step before the browser's own
// containment redirects it back on the NEXT Tab -- a real, measured
// gap, not a hypothetical one. The manual keydown handler below closes
// that gap outright: Tab/Shift+Tab cycle strictly within the dialog's
// own focusable elements, every time, re-verified after adding it.
//
// A dialog opened over another (the step-up check over View as, W14-B) is its own showModal(): the later one sits
// above in the top layer, takes the focus, and Escape closes only it. A field marked data-autofocus gets the focus
// first; otherwise the first thing that can take it.
export function Modal({ open, onClose, title, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Native addEventListener, not React's onClose/onCancel props:
    // @types/react 18 declares those props, but this pins the actual
    // wiring to the DOM's own dialog "close" event (fired on Escape,
    // form-method=dialog submission, or a programmatic .close()) so it
    // does not depend on which React minor version actually dispatches
    // through the synthetic prop.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (open && !dialog.open) {
      dialog.showModal();
      const first: HTMLElement | null = dialog.querySelector(AUTOFOCUS_SELECTOR) ?? dialog.querySelector(FOCUSABLE_SELECTOR);
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => dialog.removeEventListener('close', handleClose);
  }, [open, onClose]);

  function trapTab(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      className={`modal-dialog w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-lg border border-slate/10 bg-white p-6 shadow-sm`}
      aria-labelledby={titleId}
      onKeyDown={trapTab}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-lg font-bold text-slate">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate/70 hover:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
        >
          ✕
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </dialog>
  );
}
