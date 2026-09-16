import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { FaqBlock } from '@/components/content/FaqBlock';
import { blogPosts, getBlogPost } from '@/content/blog';
import { whatsappLink } from '@/lib/site-config';
import { articleJsonLd, breadcrumbListJsonLd, buildMetadata, howToJsonLd, serializeJsonLd } from '@/lib/seo';

interface PageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const post = getBlogPost(params.slug);
  if (!post) return {};

  // No " | NetCyberAI" suffix: these headlines are intentionally long,
  // answer-engine-optimized titles, and the suffix would push them
  // further past typical SERP truncation.
  return buildMetadata({
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.description,
    absoluteTitle: true,
    type: 'article',
    publishedTime: post.publishedOn,
  });
}

// Renders "[label](href)" markdown-style links inside a paragraph as real
// Next.js Links, and internal links use next/link for client-side nav.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, label, href] = match;
    parts.push(
      <Link key={`link-${key++}`} href={href} className="underline">
        {label}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function BlogPostPage({ params }: PageProps) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  const path = `/blog/${post.slug}`;
  const jsonLd = articleJsonLd({ path, title: post.title, description: post.description, publishedOn: post.publishedOn });
  const breadcrumbs = breadcrumbListJsonLd({ path, title: post.title });
  // Only emitted when a post's own data includes ordered steps (see
  // contract.ts) — never inferred, so HowTo can't end up on a post that
  // is explaining a topic rather than walking through a procedure.
  const howTo = post.howTo ? howToJsonLd(post.howTo) : null;

  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate/70">
          {new Date(post.publishedOn).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">{post.title}</h1>
        <AnswerFirst>{post.answerFirst}</AnswerFirst>
      </div>

      <div className="flex flex-col gap-5">
        {post.body.map((block, i) => {
          if (block.type === 'heading') {
            return (
              <h2 key={i} className="text-xl font-bold text-slate">
                {block.text}
              </h2>
            );
          }
          if (block.type === 'list') {
            return (
              <ul key={i} className="list-disc space-y-2 pl-5 text-base leading-relaxed text-slate">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-base leading-relaxed text-slate">
              {renderInline(block.text)}
            </p>
          );
        })}
      </div>

      {post.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-slate">Sources</h2>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate/70">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} className="underline" target="_blank" rel="noopener noreferrer">
                  {source.label}
                </a>
                {' — checked '}
                {new Date(source.checkedOn).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={post.faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">Have a question about your school?</h2>
        <p className="mt-2 text-off-white/90">Message us on WhatsApp and we&rsquo;ll walk you through it.</p>
        <div className="mt-4">
          <Button
            href={whatsappLink(`Hi, I read your post "${post.title}" and had a question.`)}
            variant="secondary"
          >
            Ask on WhatsApp
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }}
      />
      {howTo && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(howTo) }}
        />
      )}
    </Container>
  );
}
