// A form field people never see (off-screen, not focusable, hidden from
// screen readers). Browsers' autofill leaves it alone because of the
// autocomplete value; simple bots fill every input and are refused by
// /api/public/leads when it arrives non-empty.
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label>
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
