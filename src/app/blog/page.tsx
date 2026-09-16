import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { blogPosts } from '@/content/blog';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.blog);

export default function BlogIndexPage() {
  const sorted = [...blogPosts].sort((a, b) => (a.publishedOn < b.publishedOn ? 1 : -1));

  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Blog</h1>
        <p className="text-lg text-slate">
          The NetCyberAI blog publishes practical guides for Indian school principals and staff
          on WhatsApp fee automation, Haryana Form 6 compliance, digital certificate workflows,
          and parent engagement that does not rely on ranking or comparing students. Every
          numeric claim on this blog traces to a cited, dated source — nothing here is an
          invented statistic.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {sorted.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`}>
            <Card className="transition-shadow hover:shadow-md">
              <p className="text-xs text-slate/70">
                {new Date(post.publishedOn).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-sapphire">{post.title}</h2>
              <p className="mt-2 text-sm text-slate">{post.description}</p>
            </Card>
          </Link>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.blog)) }}
      />
    </Container>
  );
}
