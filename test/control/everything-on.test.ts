import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppFlag } from '@/lib/contracts/app-flags';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import { switchOn, type FamilySwitches } from '@/lib/family/flags';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W6-D (C398, the founder's decision C230-AU): everything built is on by default. A module with no row is on; a row a
// person set off (it carries the reason Control requires) stays off, in the code and through the migration.
const flag = (module: string, over: Partial<AppFlag> = {}): AppFlag => ({ app: 'family', module, enabled: true, audience: 'everyone', audiencePercent: null, audienceSchools: null, endsAt: null, offMessageEn: null, offMessageHi: null, reason: null, ...over }) as AppFlag;
const switches = (flags: AppFlag[]): FamilySwitches => ({ flags, banners: [], isPreview: false, accountId: null, minShell: 0 });

describe('a module with no row is on; a row a person set off stays off', () => {
  it('every built module but the Focus Lock reads on with no row, and school_today is built', () => {
    expect(FAMILY_MODULES.find((m) => m.id === 'school_today')?.built).toBe(true);
    for (const m of FAMILY_MODULES.filter((x) => x.built && !x.offByDefault)) expect(switchOn(switches([flag('*')]), m.flag), m.id).toBe(true);
    expect(FAMILY_MODULES.filter((m) => !m.built)).toEqual([]);
  });
  it('a row set off by a person decides', () => {
    expect(switchOn(switches([flag('*'), flag('school_today', { enabled: false, reason: 'pause' })]), 'school_today')).toBe(false);
  });
});

const SQL = readFileSync('supabase/migrations/20261028120000_w6_d_everything_on.sql', 'utf8');
let db: { pg: { exec: (s: string) => Promise<unknown>; query: (s: string) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> };
const row = async (app: string, module: string) => (await db.pg.query(`select enabled, audience, reason from control.app_flags where app = '${app}' and module = '${module}'`)).rows[0];

describe('the migration', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      delete from control.app_flags;
      insert into control.app_flags (app, module, enabled, reason) values
        ('family', 'plan', false, null), ('family', 'habit', false, 'Paused while we fix it'), ('teacher', 'copilot', false, null);
      insert into control.app_flags (app, module, enabled, audience, audience_percent) values ('family', 'videos', true, 'percent', 10);
    `);
    await db.pg.exec(SQL);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('adds the whole-app switch of every app and a row for every built module but the Focus Lock', async () => {
    for (const app of ['family', 'teacher', 'school_web']) expect(await row(app, '*')).toMatchObject({ enabled: true });
    expect(await row('family', 'school_today')).toMatchObject({ enabled: true });
    expect(await row('family', 'focus_lock')).toBeUndefined();
  });
  it('turns on a switch nobody gave a reason for, and keeps one a person set off', async () => {
    expect(await row('family', 'plan')).toMatchObject({ enabled: true });
    expect(await row('teacher', 'copilot')).toMatchObject({ enabled: true });
    expect(await row('family', 'videos')).toMatchObject({ enabled: true, audience: 'everyone' });
    expect(await row('family', 'habit')).toMatchObject({ enabled: false, reason: 'Paused while we fix it' });
  });
});
