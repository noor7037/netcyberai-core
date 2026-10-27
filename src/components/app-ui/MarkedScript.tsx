// A child's checked answer sheet (AI answer-sheet marking, C351): each page picture with the marks the teacher approved
// written in its margin, beside the answers they are for, as on the paper itself. Shared by the Family app (the linked
// family and the child's own view) and the private report link, so a family sees the same page either way. Pure: the
// pictures come from `src`, the words from the caller (both languages live in the message files).

export type MarkedScriptPage = { pageId: string; width: number; height: number };
export type MarkedScriptMark = { label: string; marks: number | null; max: number; counted: boolean; place: { pageId: string; yFrom: number; yTo: number } | null };
export type MarkedScriptWords = {
  page: string; // "Page {n} of {total}"
  badge: string; // "Question {label}: {marks} of {max}"
  badgeNotCounted: string; // "Question {label}: not counted"
};

const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, k: string) => (k in params ? String(params[k]) : whole));
const shown = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));

// The badge's colour by how much of the question was given: all of it, some, none, or left out by internal choice.
// Calm on purpose: no red. Each pairing is AA (white on emerald 5.47:1, slate on sunshine 10.13:1, white on slate).
function tone(m: MarkedScriptMark): string {
  if (!m.counted) return 'bg-white text-slate ring-1 ring-slate/30';
  if (m.marks !== null && m.marks >= m.max) return 'bg-emerald text-white';
  if (m.marks !== null && m.marks > 0) return 'bg-sunshine text-slate';
  return 'bg-slate text-white';
}

// Where each badge sits on its page: at the top of its answer, moved down when it would sit on the one above.
function placed(marks: readonly MarkedScriptMark[]): { m: MarkedScriptMark; nudge: number }[] {
  const sorted = [...marks].sort((a, b) => (a.place?.yFrom ?? 0) - (b.place?.yFrom ?? 0));
  const out: { m: MarkedScriptMark; nudge: number }[] = [];
  let lastY = -1;
  let nudge = 0;
  for (const m of sorted) {
    const y = m.place?.yFrom ?? 0;
    nudge = y - lastY < 0.04 ? nudge + 1 : 0;
    lastY = y;
    out.push({ m, nudge });
  }
  return out;
}

export function MarkedScript({ pages, src, marks, words }: { pages: readonly MarkedScriptPage[]; src: (pageId: string) => string; marks: readonly MarkedScriptMark[]; words: MarkedScriptWords }) {
  return (
    <ol className="flex flex-col gap-4" data-marked-script>
      {pages.map((p, i) => {
        const here = placed(marks.filter((m) => m.place?.pageId === p.pageId));
        return (
          <li key={p.pageId} data-script-page={p.pageId}>
            <figure className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private page picture streamed by our own route; next/image would cache it on a shared server */}
              <img
                src={src(p.pageId)}
                width={p.width}
                height={p.height}
                alt={fill(words.page, { n: i + 1, total: pages.length })}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="block h-auto w-full bg-off-white"
              />
              {here.map(({ m, nudge }) => {
                const y0 = Math.max(0, Math.min(1, m.place!.yFrom));
                const y1 = Math.max(y0, Math.min(1, m.place!.yTo));
                const label = m.counted ? fill(words.badge, { label: m.label, marks: shown(m.marks), max: shown(m.max) }) : fill(words.badgeNotCounted, { label: m.label });
                return (
                  <span key={m.label} data-margin-mark={m.label}>
                    <span aria-hidden="true" className={`absolute right-1 w-1 rounded-full ${m.counted ? 'bg-royal/40' : 'bg-slate/20'}`} style={{ top: `${y0 * 100}%`, height: `${Math.max(2, (y1 - y0) * 100)}%` }} />
                    <span
                      className={`absolute right-3 rounded-lg px-2 py-0.5 text-xs font-bold shadow-sm sm:text-sm ${tone(m)}`}
                      style={{ top: `min(calc(${y0 * 100}% + ${nudge * 1.9}rem), calc(100% - 2rem))` }}
                    >
                      <span aria-hidden="true">
                        {m.label} · {m.counted ? `${shown(m.marks)}/${shown(m.max)}` : '–'}
                      </span>
                      <span className="sr-only">{label}</span>
                    </span>
                  </span>
                );
              })}
            </figure>
          </li>
        );
      })}
    </ol>
  );
}
