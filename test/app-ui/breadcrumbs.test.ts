import { describe, expect, it } from 'vitest';
import { buildTrail, canGoBack, keepQuery, nextDepth, siteTrail, type Crumb } from '@/lib/nav/breadcrumbs';
import { paperCrumbs } from '@/lib/exams/crumbs';

// The trail of a nested page and the way up (W14-E): derived from the path, with the named levels a page knows.

const rootLabel = (slug: string) => ({ exams: 'Exams', schools: 'Schools' })[slug] ?? slug;
const labels = (items: Crumb[]) => items.map((c) => c.label);

describe('buildTrail', () => {
  it('a module page has no trail', () => {
    expect(buildTrail({ pathname: '/app/exams', rootLabel, current: 'Exams' })).toBeNull();
    expect(buildTrail({ pathname: '/control/schools', rootLabel, current: 'Schools' })).toBeNull();
    expect(buildTrail({ pathname: '/family/study', rootLabel, current: 'Study' })).toBeNull();
    expect(buildTrail({ pathname: null, rootLabel, current: 'x' })).toBeNull();
  });

  it('Control: Schools › the school, the way up is the module', () => {
    const t = buildTrail({ pathname: '/control/schools/abc', rootLabel, current: 'Sunrise Public School' });
    expect(labels(t!.items)).toEqual(['Schools', 'Sunrise Public School']);
    expect(t!.items[0].href).toBe('/control/schools');
    expect(t!.items[1].href).toBeUndefined();
    expect(t!.parent).toBe('/control/schools');
  });

  it('marking: Exams › exam › class and subject › Marking, every level but the last a link', () => {
    const paperId = '11111111-1111-1111-1111-111111111111';
    const crumbs = paperCrumbs({ examName: 'AI Marking Retest', classId: 'c', classLabel: '6-A', subjectName: 'English' }, paperId, true);
    const t = buildTrail({ pathname: `/app/exams/papers/${paperId}/marking`, rootLabel, current: 'Marking', crumbs });
    expect(labels(t!.items)).toEqual(['Exams', 'AI Marking Retest', '6-A English', 'Marking']);
    expect(t!.items.map((c) => c.href)).toEqual(['/app/exams', '/app/exams', `/app/exams/papers/${paperId}`, undefined]);
    expect(t!.parent).toBe(`/app/exams/papers/${paperId}`);
  });

  it('a page whose last named level has no link is that level: the title is not added twice', () => {
    const t = buildTrail({ pathname: '/app/exams/papers/p', rootLabel, current: 'Enter marks', crumbs: [{ label: 'AI Marking Retest', href: '/app/exams' }, { label: '6-A English' }] });
    expect(labels(t!.items)).toEqual(['Exams', 'AI Marking Retest', '6-A English']);
    expect(t!.parent).toBe('/app/exams');
  });

  it('without names the trail is the module, then the page', () => {
    const t = buildTrail({ pathname: '/app/exams/progress/s1', rootLabel, current: 'Progress report' });
    expect(labels(t!.items)).toEqual(['Exams', 'Progress report']);
  });
});

describe('siteTrail', () => {
  it('the home page has none', () => {
    expect(siteTrail('/')).toBeNull();
  });
  it('Products › a product', () => {
    const t = siteTrail('/products/attendance', (p) => (p === '/products/attendance' ? 'Attendance' : undefined));
    expect(labels(t!.items)).toEqual(['Products', 'Attendance']);
    expect(t!.items[0].href).toBe('/products');
    expect(t!.parent).toBe('/products');
  });
  it('Resources › Blog › a post', () => {
    const t = siteTrail('/blog/why-parents-dont-check-school-apps');
    expect(labels(t!.items)).toEqual(['Resources', 'Blog', 'Why parents dont check school apps']);
    expect(t!.items.map((c) => c.href)).toEqual(['/resources', '/blog', undefined]);
    expect(t!.parent).toBe('/blog');
  });
  it('a page that is a section of its own goes up to the home page', () => {
    const t = siteTrail('/pricing');
    expect(labels(t!.items)).toEqual(['Pricing']);
    expect(t!.parent).toBe('/');
  });
});

describe('Back', () => {
  it('uses the browser history only when this tab has shown an earlier page and has an entry to go to', () => {
    expect(canGoBack(1, 1)).toBe(false);
    expect(canGoBack(3, 1)).toBe(false);
    expect(canGoBack(1, 5)).toBe(false);
    expect(canGoBack(2, 2)).toBe(true);
  });
  it('counts a new page up and a pop down, never below one', () => {
    expect(nextDepth(1, false)).toBe(2);
    expect(nextDepth(3, true)).toBe(2);
    expect(nextDepth(1, true)).toBe(1);
  });
  it('keeps the filters in the URL on a link up, and only those', () => {
    expect(keepQuery('/app/exams', '?session=s1&sheet=9&q=ab', ['session', 'q'])).toBe('/app/exams?session=s1&q=ab');
    expect(keepQuery('/app/exams', '?sheet=9')).toBe('/app/exams');
    expect(keepQuery('/app/exams?x=1', '?session=s1')).toBe('/app/exams?x=1');
    expect(keepQuery('/app/exams', '')).toBe('/app/exams');
  });
});
