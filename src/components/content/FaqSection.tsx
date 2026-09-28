import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { FaqBlock, type FaqItem } from './FaqBlock';

// A titled FAQ section (with FAQPage JSON-LD from FaqBlock) for any page.
export function FaqSection({ id, items, tint = 'off-white', title = 'Frequently asked questions' }: { id: string; items: FaqItem[]; tint?: 'white' | 'off-white'; title?: string }) {
  return (
    <section aria-labelledby={id} className={tint === 'white' ? 'bg-white' : 'bg-off-white'}>
      <Container className="flex flex-col gap-6 py-14">
        <SectionHeading id={id} eyebrow="Got questions?" tone="product" title={title} center />
        <FaqBlock items={items} />
      </Container>
    </section>
  );
}
