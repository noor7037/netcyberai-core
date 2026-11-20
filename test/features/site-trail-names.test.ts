// The breadcrumb names the data-drawn feature pages by their short name, not their address (C533).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/features/family-ai-tutor', useRouter: () => ({ back: () => {}, push: () => {} }) }));

describe('site breadcrumb', () => {
  it('names a feature page by its short name', async () => {
    const { SiteTrail } = await import('@/components/layout/SiteTrail');
    const html = renderToStaticMarkup(createElement(SiteTrail));
    expect(html).toContain('AI tutor');
    expect(html).not.toContain('Family ai tutor');
  });
});
