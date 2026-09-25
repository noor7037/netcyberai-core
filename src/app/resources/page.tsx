import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { resourceSections } from '@/content/resources';
import { blogPosts } from '@/content/blog';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.resources);

export default function ResourcesPage() {
  return (
    <>
      <section aria-labelledby="resources-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="communication">Resources</EyebrowOnDark>
          <h1 id="resources-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Everything you need to evaluate NetCyberAI
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            Real guides and references for Indian school leaders evaluating NetCyberAI — no fabricated case studies or
            testimonials, and no invented statistics. What is published here reflects what the platform actually does
            today, with plainly-marked gaps where a claim has not yet been verified.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container wide className="flex flex-col gap-10 py-16">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <Link href="/blog" className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                <SpotlightCard className="flex h-full flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal text-white">
                      <Icon name="academics" className="h-5 w-5" />
                    </span>
                    <span className="rounded-full bg-turquoise/15 px-2.5 py-0.5 text-xs font-bold text-emerald">{`${blogPosts.length} articles`}</span>
                  </div>
                  <p className="text-lg font-bold text-slate">Blog</p>
                  <p className="text-sm text-slate/70">Long-form guides for principals and office teams.</p>
                </SpotlightCard>
              </Link>
            </li>
            {resourceSections.map((r) => (
              <li key={r.slug}>
                <Link href={`/resources/${r.slug}`} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                  <SpotlightCard className="flex h-full flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[r.tone].solid}`}>
                        <Icon name={r.icon} className="h-5 w-5" />
                      </span>
                      {r.status === 'available' ? (
                        <span className="rounded-full bg-turquoise/15 px-2.5 py-0.5 text-xs font-bold text-emerald">Available</span>
                      ) : (
                        <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-gold-deep">Coming</span>
                      )}
                    </div>
                    <p className="text-lg font-bold text-slate">{r.name}</p>
                    <p className="text-sm text-slate/70">{r.heroTitle}</p>
                  </SpotlightCard>
                </Link>
              </li>
            ))}
          </ul>
          <div className="rounded-3xl bg-white p-6">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate/70">Latest from the blog</p>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {blogPosts.slice(0, 3).map((post) => (
                <li key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="block rounded-xl p-3 hover:bg-off-white">
                    <p className="font-bold text-slate">{post.title}</p>
                    <p className="mt-1 text-sm text-slate/70">{post.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.resources)) }}
      />
    </>
  );
}
