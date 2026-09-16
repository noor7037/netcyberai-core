import { blogPosts, getBlogPost } from '@/content/blog';
import { renderOgCard } from '@/lib/og-card';
import { ogImageSize } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const size = ogImageSize;
export const contentType = 'image/png';
export const alt = `${companyName} guide`;

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export default function Image({ params }: { params: { slug: string } }) {
  const post = getBlogPost(params.slug);
  return renderOgCard({ eyebrow: `${companyName} guide`, title: post?.title ?? `${companyName} blog` });
}
