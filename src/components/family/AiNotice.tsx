import type { Words } from '@/lib/family/fill';
import { FamIcon } from './FamIcon';

// The "made by AI" marker (W2, C315; W6-B, docs/38 §5) under every answer the AI made: a small pill, not a paragraph.
// A checked answer says it was checked as well; neither ever says more than happened (34 §10). The pill still opens the
// page that says how the AI works (its label is the link's name), with a 44 px touch area (family.css `.fam-hit`).
export function AiNotice({ w, made }: { w: Words; made: 'ai_made' | 'checked' }) {
  return (
    <p data-ai-notice={made} className="flex">
      <a href="/family/about-ai" className="fam-pill fam-hit bg-white text-grape-deep ring-1 ring-grape/30">
        <FamIcon name="sparkle" className="h-3.5 w-3.5" />
        {made === 'checked' ? w['fam.ai.notice.checked'] : w['fam.ai.notice.aiMade']}
        <span className="sr-only">{w['fam.ai.notice.link']}</span>
      </a>
    </p>
  );
}
