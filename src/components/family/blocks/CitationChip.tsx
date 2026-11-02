import type { Citation } from '@/lib/family/citation';
import { fill, type Words } from '@/lib/family/fill';

// The citation chip (W16-A2, docs/39 §6): one line first in the answer, "From your chapter: <title> · <unit>", or
// "General knowledge, not from your chapter". Plain text, no link, no motion.
export function CitationChip({ w, c }: { w: Words; c: Citation }) {
  const text = c.kind === 'general' ? w['fam.cite.general'] : c.unit ? fill(w['fam.cite.chapterUnit'], { title: c.title, unit: c.unit }) : fill(w['fam.cite.chapter'], { title: c.title });
  return (
    <p data-citation={c.kind} className={`inline-flex min-h-[36px] items-center gap-2 self-start rounded-full px-3 py-1 text-sm font-bold ring-1 ${c.kind === 'chapter' ? 'bg-lesson-mint text-lesson-mint-deep ring-lesson-mint-deep/30' : 'bg-white text-ink ring-ink/15'}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.kind === 'chapter' ? 'bg-lesson-mint-deep' : 'bg-ink/40'}`} />
      {text}
    </p>
  );
}
