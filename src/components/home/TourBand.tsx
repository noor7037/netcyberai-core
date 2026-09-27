import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/visual/Icons';

// Sits between the parent's WhatsApp story and the rest of the homepage:
// the invitation to click through the whole product, not just read about it.
export function TourBand() {
  return (
    <section aria-labelledby="tour-band-title" className="bg-midnight text-white">
      <Container wide className="flex flex-col items-start gap-5 py-12 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-grape text-white">
            <Icon name="play" className="h-6 w-6" />
          </span>
          <div>
            <h2 id="tour-band-title" className="text-2xl font-extrabold">
              Click through the whole product
            </h2>
            <p className="opacity-90">Principal, teacher and finance dashboards, and the parent’s WhatsApp, in one hands-on demo school.</p>
          </div>
        </div>
        <Button href="/product-tour" variant="secondary">
          Explore the product tour
        </Button>
      </Container>
    </section>
  );
}
