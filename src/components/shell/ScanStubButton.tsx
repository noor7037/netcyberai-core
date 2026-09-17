import { Badge } from '@/components/ui/Badge';

// The capture/QR subsystem (PRD §6) isn't built until Prompt F.
// Constitution §9 bans silent failures -- a button that looks
// functional but does nothing on tap is exactly that. This renders as
// visibly, honestly disabled: a real HTML disabled button (so a
// screen reader announces it as unavailable, not just visually muted)
// plus a "Coming soon" badge, not a camera UI that only pretends to work.
export function ScanStubButton() {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Scan & autofill — coming in a later prompt"
      className="flex min-h-[44px] min-w-[44px] cursor-not-allowed items-center gap-1.5 rounded-md px-2 text-slate/40"
    >
      <span aria-hidden="true">📷</span>
      <Badge variant="neutral">Soon</Badge>
    </button>
  );
}
