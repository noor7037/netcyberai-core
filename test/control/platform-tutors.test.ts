import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { readPlatformTutors, savePlatformTutor } from '@/lib/control/family-settings';

// Control → Family → Tutors (2 Nov 2026): the founder adds a platform tutor, changes its words and switches it off, with
// a reason, audited; the Family app's Tutor Hall reads what is enabled. On the real migrations (PGlite). Made-up names.

const FOUNDER = 'f2110000-0000-4000-8000-0000000000f1';
const by = { userId: FOUNDER };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const words = { nameEn: 'Geography Tutor', nameHi: 'भूगोल ट्यूटर', styleEn: 'Starts from a map and asks what you see.', styleHi: 'नक़्शे से शुरू करता है और पूछता है कि आप क्या देखते हैं।', subject: 'social_science', language: 'both' };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('the platform tutors in Control', () => {
  it('needs a reason and whole words; nothing is written or audited before that', async () => {
    const before = (await readPlatformTutors(db.pg)).length;
    expect(await savePlatformTutor(db.pg, by, { ...words, reason: '' })).toEqual({ ok: false, code: 'reason_required' });
    expect(await savePlatformTutor(db.pg, by, { ...words, nameHi: '', reason: 'New subject' })).toEqual({ ok: false, code: 'bad_value' });
    expect(await savePlatformTutor(db.pg, by, { ...words, subject: 'astrology', reason: 'New subject' })).toEqual({ ok: false, code: 'bad_value' });
    expect(await savePlatformTutor(db.pg, by, { ...words, language: 'fr', reason: 'New subject' })).toEqual({ ok: false, code: 'bad_value' });
    expect(await savePlatformTutor(db.pg, by, { ...words, key: 'no_such_tutor', reason: 'New subject' })).toEqual({ ok: false, code: 'not_found' });
    expect((await readPlatformTutors(db.pg)).length).toBe(before);
    expect(await q(`select count(*)::int as n from audit_log where event_action like 'family.tutor_%'`)).toEqual([{ n: 0 }]);
  });

  it('adds a tutor with a key of its own, tags stripped, and audits the name, subject, language and switch (never the style)', async () => {
    const added = await savePlatformTutor(db.pg, by, { ...words, nameEn: '<b>Geography</b> Tutor', reason: 'New subject for Class 6' });
    expect(added).toEqual({ ok: true, tutor: { key: 'geography_tutor', subject: 'social_science', nameEn: 'Geography Tutor', nameHi: words.nameHi, styleEn: words.styleEn, styleHi: words.styleHi, language: 'both', enabled: true } });
    const again = await savePlatformTutor(db.pg, by, { ...words, reason: 'A second one' });
    expect(again.ok && again.tutor.key).toBe('geography_tutor_2');
    const rows = await q(`select event_action, target_id, before_state, after_state from audit_log where event_action like 'family.tutor_%' order by audit_id`);
    expect(rows.map((r: { event_action: string; target_id: string }) => [r.event_action, r.target_id])).toEqual([
      ['family.tutor_added', 'geography_tutor'],
      ['family.tutor_added', 'geography_tutor_2'],
    ]);
    expect(rows[0].before_state).toBeNull();
    expect(rows[0].after_state).toEqual({ key: 'geography_tutor', subject: 'social_science', language: 'both', enabled: true, name_en: 'Geography Tutor', name_hi: words.nameHi, reason: 'New subject for Class 6' });
    expect(JSON.stringify(rows)).not.toContain('map');
    // The Family app's Hall reads it as a platform tutor; the tint follows the subject.
    expect(await q(`select tint, avatar_key, enabled from content.tutors where key = 'geography_tutor'`)).toEqual([{ tint: expect.any(String), avatar_key: 'geography_tutor', enabled: true }]);
  });

  it('changes its words and switches it off; the key never changes; a family then no longer sees it', async () => {
    const changed = await savePlatformTutor(db.pg, by, { ...words, key: 'geography_tutor', nameEn: 'Maps Tutor', enabled: false, reason: 'Renamed, paused for the pilot' });
    expect(changed).toMatchObject({ ok: true, tutor: { key: 'geography_tutor', nameEn: 'Maps Tutor', enabled: false } });
    const row = (await q(`select before_state, after_state from audit_log where event_action = 'family.tutor_changed'`))[0];
    expect(row.before_state).toEqual({ key: 'geography_tutor', subject: 'social_science', language: 'both', enabled: true, name_en: 'Geography Tutor', name_hi: words.nameHi });
    expect(row.after_state).toMatchObject({ name_en: 'Maps Tutor', enabled: false, reason: 'Renamed, paused for the pilot' });
    const seen = await db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: { key: string }[] }> }) => {
      await tx.query('set local role family_app');
      return (await tx.query(`select key from content.tutors order by key`)).rows.map((r) => r.key);
    });
    expect(seen).toContain('geography_tutor_2');
    expect(seen).not.toContain('geography_tutor');
    expect((await readPlatformTutors(db.pg)).find((t) => t.key === 'geography_tutor')).toMatchObject({ nameEn: 'Maps Tutor', enabled: false });
  });
});
