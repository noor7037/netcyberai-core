import type { Words } from '@/lib/family/fill';

// The "made by AI" notice (W2, C315) under every answer the AI made, with a link to the page that says how the AI
// works. A checked answer says it was checked as well; neither ever says more than happened (34 §10).
export function AiNotice({ w, made }: { w: Words; made: 'ai_made' | 'checked' }) {
  return (
    <p data-ai-notice={made} className="text-sm text-slate">
      {made === 'checked' ? w['fam.ai.notice.checked'] : w['fam.ai.notice.aiMade']}{' '}
      <a href="/family/about-ai" className="inline-flex min-h-[44px] items-center font-bold text-royal-deep underline underline-offset-4">
        {w['fam.ai.notice.link']}
      </a>
    </p>
  );
}
