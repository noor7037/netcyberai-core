import { describe, expect, it } from 'vitest';
import { blogPosts } from '@/content/blog';
import { blogClusters, clusterOf } from '@/content/blog/clusters';
import { findProduct } from '@/content/catalog';

// C471: every blog post sits in one topic cluster, which links it to its product page and its neighbours. A new post
// with no cluster would have no link pointing at it but the blog list.
describe('blog topic clusters', () => {
  it('every post is in exactly one cluster, and every cluster names real posts', () => {
    const slugs = blogPosts.map((p) => p.slug);
    for (const s of slugs) expect(blogClusters.filter((c) => c.slugs.includes(s)), s).toHaveLength(1);
    for (const c of blogClusters) for (const s of c.slugs) expect(slugs, `${c.id}: ${s}`).toContain(s);
  });

  it('every cluster has a product page as its pillar, and at least three posts', () => {
    for (const c of blogClusters) {
      expect(findProduct(c.pillar.replace('/products/', '')), c.id).toBeDefined();
      expect(c.slugs.length, c.id).toBeGreaterThanOrEqual(3);
    }
    expect(clusterOf('haryana-form-6-fee-hike-compliance-guide')?.id).toBe('fees');
  });
});
