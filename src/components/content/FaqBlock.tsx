import { faqPageJsonLd, serializeJsonLd } from '@/lib/seo';

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqBlock({ items }: { items: FaqItem[] }) {

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.question} className="rounded-lg border border-slate/10 bg-white p-4">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-semibold text-sapphire">
            {item.question}
          </summary>
          <p className="mt-2 text-base leading-relaxed text-slate">{item.answer}</p>
        </details>
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd(items)) }}
      />
    </div>
  );
}
