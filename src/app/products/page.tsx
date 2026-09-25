import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { CatalogGrid } from '@/components/catalog/CatalogGrid';
import { ProductShowcase } from '@/components/home/ProductShowcase';
import { CTASection } from '@/components/home/CTASection';
import { products } from '@/content/catalog';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.products);

export default function ProductsPage() {
  return (
    <>
      <section aria-labelledby="products-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="product">Products</EyebrowOnDark>
          <h1 id="products-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            One platform, nine connected capabilities
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            NetCyberAI is built as one connected system, not a bundle of separate tools bolted together after the fact.
            Every capability below reads and writes the same students, guardians, classes, sections, and consent
            records, so nothing is duplicated or re-entered as a school moves between them.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/pricing" variant="outlineLight">
              View pricing
            </Button>
          </div>
        </Container>
      </section>
      <section className="bg-off-white">
        <Container wide className="py-16">
          <CatalogGrid pages={products} base="/products" />
        </Container>
      </section>
      <ProductShowcase />
      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.products)) }} />
    </>
  );
}
