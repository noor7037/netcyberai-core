import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapState, toRow, type SeedListing } from '@/lib/future/seed-import';

// The 90 Haryana listings added 15 Nov 2026. They are already pending in the live database under these seed ids,
// so a second import does nothing. This checks the file the importer reads: unique ids, the table's own limits, and toRow.

const TODAY = '2026-11-15';
const HR = (JSON.parse(readFileSync('data/future/haryana_listings_seed.json', 'utf8')) as { listings: SeedListing[] }).listings;
const MAIN = (JSON.parse(readFileSync('data/future/future_listings_seed.json', 'utf8')) as { listings: SeedListing[] }).listings;
const CATEGORIES = ['entrance_exam', 'olympiad', 'board_exam', 'scholarship', 'central_scheme', 'state_scheme', 'admission'];
const PROVIDERS = ['state', 'central', 'board_exam_body', 'institution'];
const HUBS = ['careers', 'exams_portal', 'opportunities'];
const STATUSES = ['draft', 'expected', 'upcoming', 'open', 'closing_soon', 'closed', 'in_progress', 'archived', 'withdrawn'];

describe('Haryana future seed', () => {
  it('has 90 unique seed ids, none already in the main seed, and each row passes the importer', () => {
    expect(HR).toHaveLength(90);
    const ids = HR.map((l) => l.id);
    expect(new Set(ids).size).toBe(90);
    const main = new Set(MAIN.map((l) => l.id));
    for (const l of HR) {
      expect(l.id.startsWith('hr.'), l.id).toBe(true);
      expect(main.has(l.id), l.id).toBe(false);
      expect(l.id.length, l.id).toBeLessThanOrEqual(120);
      expect(l.series_key.length).toBeLessThanOrEqual(120);
      expect(l.cycle.length).toBeLessThanOrEqual(40);
      expect(l.title_en.length).toBeGreaterThan(0);
      expect(l.title_en.length).toBeLessThanOrEqual(220);
      expect(l.title_en).not.toMatch(/[<>]/);
      if (l.title_hi) {
        expect(l.title_hi.length).toBeLessThanOrEqual(220);
        expect(l.title_hi).not.toMatch(/[<>]/);
      }
      expect(l.provider.length).toBeLessThanOrEqual(200);
      expect((l.eligibility ?? '').length).toBeLessThanOrEqual(1500);
      expect((l.benefit ?? '').length).toBeLessThanOrEqual(1500);
      expect((l.fee ?? '').length).toBeLessThanOrEqual(500);
      expect((l.notes ?? '').length).toBeLessThanOrEqual(2000);
      expect(l.source_url.length).toBeLessThanOrEqual(500);
      expect(l.source_url.startsWith('https://')).toBe(true);
      if (l.apply_url) {
        expect(l.apply_url.length).toBeLessThanOrEqual(500);
        expect(l.apply_url.startsWith('https://')).toBe(true);
      }
      expect(HUBS).toContain(l.hub);
      expect(CATEGORIES).toContain(l.category);
      expect(PROVIDERS).toContain(l.provider_type);
      expect(STATUSES).toContain(l.status);
      expect(l.states).toEqual(['IN-HR']);
      expect(l.confidence).toBe(0.6);
      for (const c of [...l.classes_eligible, ...l.classes_plan_ahead]) {
        expect(c).toBeGreaterThanOrEqual(-2);
        expect(c).toBeLessThanOrEqual(12);
      }
      const row = toRow(l, TODAY);
      expect(row.seed_id).toBe(l.id);
      expect(row.hub).toBe(l.hub);
      expect(row.category).toBe(l.category);
      expect(row.classes).toEqual(l.classes_eligible);
      expect([...row.prepare_classes, ...row.future_classes].sort((a, b) => a - b)).toEqual([...l.classes_plan_ahead].sort((a, b) => a - b));
      expect(row.states).toEqual(l.states.map(mapState));
      expect(row.apply_url).toBe(l.apply_url);
      expect(row.source_url).toBe(l.source_url);
      expect(row.confidence).toBe(l.confidence);
      expect(row.summary_en === null || row.summary_en.length <= 280).toBe(true);
      expect(STATUSES).toContain(row.status);
    }
  });

  it('counts 31 scholarships, 29 state schemes, 9 central schemes, 4 awards, 6 admissions, 5 olympiads, 2 boards and 4 career routes', () => {
    const n = (hub: string, category?: string) => HR.filter((l) => l.hub === hub && (category === undefined || l.category === category)).length;
    expect(n('opportunities', 'scholarship')).toBe(31);
    expect(n('opportunities', 'state_scheme')).toBe(29);
    expect(n('opportunities', 'central_scheme')).toBe(9);
    expect(n('opportunities', 'olympiad')).toBe(4);
    expect(n('exams_portal', 'admission')).toBe(6);
    expect(n('exams_portal', 'olympiad')).toBe(5);
    expect(n('exams_portal', 'board_exam')).toBe(2);
    expect(n('careers')).toBe(4);
  });
});
