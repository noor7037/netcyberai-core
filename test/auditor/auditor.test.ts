import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { helpArticle } from '@/content/help/articles';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY, moduleById } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { addHead, addStructureVersion } from '@/lib/fees/structures';
import { recordFollowUp } from '@/lib/fees/recovery';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { workingModules } from '@/lib/frameworks/plans';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { isMessageKey, t, tCount } from '@/lib/i18n';
import { loadFacts } from '@/lib/insights/load';
import { screenFor } from '@/lib/insights/screens';
import { decideLeave } from '@/lib/staff/leave';
import { addDays } from '@/lib/staff/leave-rules';
import { indiaDate } from '@/lib/time/india';
import { putEntry } from '@/lib/timetable/timetable';
import {
  ATTENDANCE_WORKING_DAYS, AUDITOR_ROLES, AUDITOR_RULE_VERSION, CHECK_IDS, CHECK_META, CHECKS, CHECKS_WITH_A_COUNT, HELD_IN_LAST_DAYS, LEAVE_WAITED_MORE_THAN_DAYS, NotTheOfficesCheckUp, OVERDUE_MORE_THAN_DAYS,
  checkKey, checkUpHistory, isAppAddress, lastWorkingDays, latestCheckUp, readResults, recordCheckUp, runCheckUp, summarise, type CheckDefinition, type CheckId, type CheckUp,
} from '@/lib/auditor';

// School Health Auditor v1 (docs/26 slice 8i, C208). The acceptance test: "A failing check names its count and
// opens the fixing screen; after the data is fixed the next check-up passes it. A check with nothing set up says
// so. No model is called." Proven on the whole schema as the app's own database role, through the app's code and
// by going to the database directly. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown, asked: 0, drafted: 0 }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/i18n/server', () => ({ getLang: () => ({ lang: 'en' }) }));
// The AI provider, watched: asking for one, or for a draft, is counted. A check-up must do neither.
vi.mock('@/lib/ai/provider', async (original) => {
  const real = await original<typeof import('@/lib/ai/provider')>();
  return {
    ...real,
    configuredProvider: (...args: Parameters<typeof real.configuredProvider>) => {
      state.asked += 1;
      return real.configuredProvider(...args);
    },
    standInProvider: { ...real.standInProvider, draft: async (r: Parameters<typeof real.standInProvider.draft>[0]) => {
      state.drafted += 1;
      return real.standInProvider.draft(r);
    } },
  };
});

import { GET as getAuditor, POST as postAuditor } from '@/app/api/app/school-auditor/route';
import SchoolAuditorPage from '@/app/(school)/app/school-auditor/page';
import { LangProvider } from '@/components/app-shell/LangContext';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { AuditorScreen, AuditorView, type AuditorData } from '@/components/auditor/AuditorView';

const u = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, NEW, C] = [u(1), u(2), u(3), u(4)];
const [PRINCIPAL, ADMIN, TARA, TARUN, TEJAS, ACCOUNTANT, COORDINATOR, LATA] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18)];
const [B_PRINCIPAL, NEW_PRINCIPAL, VISITING] = [u(21), u(31), u(41)];
// The brand-new school's other staff: it has no check-up yet, so what refuses their write is the policy alone.
const [NEW_TEACHER, NEW_ACCOUNTANT, NEW_COORDINATOR] = [u(32), u(33), u(34)];
const [C5A, C6B, C7C] = [u(51), u(52), u(53)];
const [MATHS, SESSION] = [u(60), u(61)];
// 5-A: Asha, Bela (active), Esha (waiting for consent), Ishan (inactive). 6-B: Farah, Gopal. Jaya: active, in no class.
const [ASHA, BELA, ESHA, ISHAN, FARAH, GOPAL, JAYA] = [u(101), u(102), u(103), u(104), u(105), u(106), u(107)];
// Guardians: Asha and Bela's (also Esha's); Farah's; Gopal's, with a number WhatsApp cannot use; and one merged
// into Asha's, the only guardian linked to Jaya.
const [G_ASHA, G_FARAH, G_GOPAL, G_OLD] = [u(201), u(202), u(203), u(204)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const elsewhere: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const newPrincipal: Who = { role: 'principal', user: NEW_PRINCIPAL, school: NEW };
const visiting: Who = { role: 'principal', user: VISITING };
const NOT_THE_OFFICE = [teacher, accountant, coordinator];
type Rows = { rows: Record<string, unknown>[] };

// As the app's own database role, with that person's school, role and user set. Kept.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const ents = (off: readonly string[] = [], school = A): SchoolEntitlements => ({ schoolId: school, plan: 'standard', accessMode: 'full', modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: !off.includes(m.id), source: 'plan' as const }])) });
const checkUp = (who: Who = principal, given: { today?: string; checks?: readonly CheckDefinition[]; off?: readonly string[] } = {}) => as(who, (c) => runCheckUp(c, actor(who), ents(given.off, who.school ?? A), given));
const of = (run: CheckUp, id: CheckId) => run.results.find((r) => r.id === id)!;
const check = async (id: CheckId, who: Who = principal) => of(await checkUp(who), id);
const n = async (sql: string, params: unknown[] = []) => Number((await db.pg.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n);
const owner = (sql: string) => db.pg.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`);

// THE DAY: India's today. The school works all seven days, so "the last five working days" are the five days
// before today whatever day of the week the tests run on; the test of a holiday changes that itself.
const D = indiaDate();
const day = (back: number) => addDays(D, -back);
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const setup = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'setup')!;
const timetable = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable')!;
const setting = (moduleId: string, version: number, values: Record<string, unknown>) =>
  db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, $2, $3, $4, 1) on conflict (school_id, module_id) do update set setting_values = excluded.setting_values`, [A, moduleId, version, JSON.stringify(values)]);
const mark = (student: string, cls: string, back: number) => `('${A}', '${student}', '${cls}', '${day(back)}', 'present', '${TARA}')`;
// Found by the end of its name: the first part is the version the database recorded.
const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS_DIR, readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith('_p5_school_health.sql'))!);
const SRC = path.join(__dirname, '../../src');

describe('the checks and their words', () => {
  it('rule version 1 holds exactly the twelve checks of docs/26 section 5, in its order, with the numbers its sentences say', () => {
    expect(AUDITOR_RULE_VERSION).toBe(1);
    expect(CHECK_IDS).toEqual(['class_teacher', 'student_guardian', 'guardian_phone', 'consent', 'attendance_marked', 'timetable_filled', 'fee_structure', 'overdue_followed_up', 'messages_held', 'message_budget', 'complaints_overdue', 'leave_waiting']);
    expect(CHECKS.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect([ATTENDANCE_WORKING_DAYS, OVERDUE_MORE_THAN_DAYS, HELD_IN_LAST_DAYS, LEAVE_WAITED_MORE_THAN_DAYS]).toEqual([5, 30, 7, 2]);
    expect(t('en', 'aud.check.attendance_marked.rule')).toContain('five most recent working days');
    expect(t('en', 'aud.check.overdue_followed_up.rule')).toContain('more than thirty days');
    expect(t('en', 'aud.check.messages_held.rule')).toContain('last seven days');
    expect(t('en', 'aud.check.leave_waiting.rule')).toContain('more than two days');
    expect(AUDITOR_ROLES).toEqual(['principal', 'school_admin']);
    expect([...AUDITOR_ROLES].sort()).toEqual([...moduleById('school-auditor').roles].sort());
  });

  it('every check has its words in both languages, and every screen it opens is a page of the app', () => {
    for (const id of CHECK_IDS) {
      const parts = ['title', 'rule', 'where', 'do', 'open', 'setup'] as const;
      for (const part of parts) for (const lang of ['en', 'hi'] as const) expect(isMessageKey(checkKey(id, part)) && t(lang, checkKey(id, part) as never).length > 3, `${lang} ${id} ${part}`).toBe(true);
      if ((CHECKS_WITH_A_COUNT as readonly string[]).includes(id)) {
        for (const lang of ['en', 'hi'] as const) {
          expect(tCount(lang, `aud.check.${id}.todo`, 1), `${lang} ${id}`).toContain('1');
          expect(tCount(lang, `aud.check.${id}.todo`, 3), `${lang} ${id}`).toContain('3');
        }
      }
      const page = CHECK_META[id].screen.replace(/\?.*$/, '');
      expect(statSync(path.join(SRC, 'app/(school)', page, 'page.tsx')).isFile(), page).toBe(true);
      expect(isAppAddress(CHECK_META[id].screen)).toBe(true);
    }
    expect(CHECKS_WITH_A_COUNT).not.toContain('message_budget');
  });

  it('the result is "N of M checks pass", in words: M is the checks that apply, and nothing is a percentage, a score or a grade', () => {
    const results = [{ state: 'passes' }, { state: 'passes' }, { state: 'needs_attention' }, { state: 'not_set_up' }, { state: 'could_not_check' }] as const;
    expect(summarise(results)).toEqual({ passed: 2, applicable: 4, attention: 1, notSetUp: 1, notChecked: 1 });
    expect(t('en', 'aud.summary', { passed: 2, applicable: 4 })).toBe('2 of 4 checks pass');
    expect(t('hi', 'aud.summary', { passed: 2, applicable: 4 })).toBe('4 में से 2 जाँचें ठीक हैं');
    for (const file of ['en', 'hi']) {
      const block = readFileSync(path.join(SRC, `lib/i18n/messages/${file}.ts`), 'utf8').split('// p5-8i begin')[1].split('// p5-8i end')[0];
      expect(block, file).not.toMatch(/%|\/ ?100|out of 100|\bscore\b/i);
    }
  });

  it('a stored result is read back with care: known checks, the four states, a count, and only an address of the app', () => {
    expect(readResults([
      { id: 'consent', state: 'needs_attention', count: 2, href: '/app/admissions' },
      { id: 'consent', state: 'passes', count: null, href: null }, // the same check twice: the first stays
      { id: 'timetable_filled', state: 'not_set_up', count: 5, href: 'https://elsewhere.example/app', off: true },
      { id: 'attendance_marked', state: 'needs_attention', count: 0, href: '/app/attendance' }, // a count of nothing is not "needs attention"
      { id: 'not_a_check', state: 'passes' },
      { id: 'leave_waiting', state: 'great' },
      'text',
    ])).toEqual([
      { id: 'consent', state: 'needs_attention', count: 2, href: '/app/admissions' },
      { id: 'timetable_filled', state: 'not_set_up', count: null, href: null, off: true },
    ]);
    expect(readResults('[]')).toEqual([]);
    expect(isAppAddress('/app/communication?state=held&from=2026-10-08&to=2026-10-14')).toBe(true);
    for (const bad of ['//evil.example', '/control/schools', 'javascript:alert(1)', '/app/x"onclick', '/app/<b>']) expect(isAppAddress(bad), bad).toBe(false);
  });

  it('the last working days skip a weekday the school does not work and a holiday, and look back sixty days at most', () => {
    const calendar = { weekdays: new Set([1, 2, 3, 4, 5]), holidays: new Set(['2026-11-12']) };
    // From Monday 16 November: back over the weekend; Thursday the 12th is a holiday.
    expect(lastWorkingDays(calendar, '2026-11-16')).toEqual(['2026-11-13', '2026-11-11', '2026-11-10', '2026-11-09', '2026-11-06']);
    expect(lastWorkingDays({ weekdays: new Set([0, 1, 2, 3, 4, 5, 6]), holidays: new Set() }, '2026-11-16', 2)).toEqual(['2026-11-15', '2026-11-14']);
    expect(lastWorkingDays({ weekdays: new Set([3]), holidays: new Set() }, '2026-11-16')).toHaveLength(5);
    // A school closed for sixty days has no working day to look at.
    const closed = new Set(Array.from({ length: 61 }, (_, i) => addDays('2026-11-16', -i)));
    expect(lastWorkingDays({ weekdays: new Set([0, 1, 2, 3, 4, 5, 6]), holidays: closed }, '2026-11-16')).toEqual([]);
  });
});

describe('the module, its words and its places', () => {
  it('School Health Auditor is partly live, for the principal and the school admin, rules only, and says what goes when it is off', () => {
    expect(moduleById('school-auditor')).toMatchObject({ status: 'partial', phase: 'P5', roles: ['principal', 'school_admin'] });
    expect(moduleById('school-auditor').phaseNote).toContain('Rules only: no AI model');
    expect(workingModules()).toContain('school-auditor');
    for (const lang of ['en', 'hi'] as const) expect(t(lang, 'moduleOff.school-auditor').length, lang).toBeLessThanOrEqual(200);
    for (const words of ['run a check-up', 'Check-ups already recorded are kept']) expect(t('en', 'moduleOff.school-auditor')).toContain(words);
    expect(t('hi', 'moduleOff.school-auditor')).toMatch(/[ऀ-ॿ]/);
  });

  it('its routes belong to the auditor; its tour and its guide exist', () => {
    expect(writeModuleFor('/api/app/school-auditor')).toBe('school-auditor');
    expect(readModuleFor('/api/app/school-auditor')).toBe('school-auditor');
    expect(TOURS['school-auditor'].steps).toHaveLength(3);
    const guide = helpArticle('school-check-up')!;
    expect(guide).toMatchObject({ audience: 'office', start: { href: '/app/school-auditor' } });
    expect(guide.related).toEqual(['read-the-dashboard', 'use-my-day']);
    expect(guide.tips!.map((x) => x.en).join(' ')).toContain('no AI model is used');
  });

  it('no model is called: nothing of the auditor imports the AI provider or Teacher Copilot', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? files(path.join(dir, name)) : [path.join(dir, name)]));
    const ours = [...files(path.join(SRC, 'lib/auditor')), ...files(path.join(SRC, 'components/auditor')), ...files(path.join(SRC, 'app/api/app/school-auditor')), ...files(path.join(SRC, 'app/(school)/app/school-auditor'))];
    expect(ours.length).toBeGreaterThanOrEqual(8);
    for (const f of ours) {
      const text = readFileSync(f, 'utf8');
      expect(text, path.relative(SRC, f)).not.toMatch(/from '@\/lib\/(ai|copilot)\b|lib\/ai\/|lib\/copilot\/|anthropic|openai|configuredProvider|standInProvider/i);
    }
    // And the migration queues nothing: no job, no schedule.
    expect(readFileSync(MIGRATION, 'utf8')).not.toMatch(/jobs_enqueue|insert into jobs|cron/i);
  });
});

describe('on the whole schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL'), ('${NEW}', 'School New', 'IN-UP'), ('${C}', 'School C', 'IN-MH');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true),
        ('${TEJAS}', '${A}', 'tejas@school-a.example', 'teacher', 'Tejas Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${LATA}', '${A}', 'lata@school-a.example', 'teacher', 'Lata Left', false),
        ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${NEW_PRINCIPAL}', '${NEW}', 'principal@school-new.example', 'principal', 'Nina New', true),
        ('${VISITING}', '${C}', 'parul@school-c.example', 'principal', 'Parul Visiting', true),
        ('${NEW_TEACHER}', '${NEW}', 'teacher@school-new.example', 'teacher', 'Neha New', true), ('${NEW_ACCOUNTANT}', '${NEW}', 'accounts@school-new.example', 'accountant', 'Naveen New', true),
        ('${NEW_COORDINATOR}', '${NEW}', 'coordinator@school-new.example', 'academic_coordinator', 'Nandini New', true);
      insert into memberships (user_id, school_id, role, is_active) values ('${VISITING}', '${A}', 'principal', true) on conflict (user_id, school_id) do nothing;
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select s, m, true, 'plan' from unnest(array['${A}', '${B}', '${NEW}']::uuid[]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5-A', '5', 'A', '${TARA}'), ('${C6B}', '${A}', '6-B', '6', 'B', '${TARUN}'), ('${C7C}', '${A}', '7-C', '7', 'C', null);
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values
        ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}'), ('${ESHA}', '${A}', 'A-3', 'Esha', 'pending_consent', '${C5A}'),
        ('${ISHAN}', '${A}', 'A-4', 'Ishan', 'inactive', '${C5A}'), ('${FARAH}', '${A}', 'A-5', 'Farah', 'active', '${C6B}'), ('${GOPAL}', '${A}', 'A-6', 'Gopal', 'active', '${C6B}'),
        ('${JAYA}', '${A}', 'A-7', 'Jaya', 'active', null);
      insert into parents (parent_id, school_id, name, phone, merged_into, merged_at) values
        ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001', null, null), ('${G_FARAH}', '${A}', 'Fatima Ali', '+91 90000 00002', null, null),
        ('${G_GOPAL}', '${A}', 'Ganesh Rao', '12345', null, null), ('${G_OLD}', '${A}', 'Anita S.', '000', '${G_ASHA}', now());
      insert into parent_student_map (school_id, parent_id, student_id) values
        ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_ASHA}', '${BELA}'), ('${A}', '${G_ASHA}', '${ESHA}'), ('${A}', '${G_FARAH}', '${FARAH}'), ('${A}', '${G_GOPAL}', '${GOPAL}'), ('${A}', '${G_OLD}', '${JAYA}');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', 'This session', '${day(100)}', '${day(-200)}', true);
    `);
    await setting('setup', setup.version, { working_days: ALL_DAYS });
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the migration switches the auditor on for every school there is, last, and keeps a founder’s own choice', async () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const last = sql.slice(sql.lastIndexOf('insert into school_module_entitlements'));
    expect(last).toContain(`'school-auditor', true, 'plan'`);
    expect(sql.trimEnd().endsWith(last.trimEnd())).toBe(true);
    await db.pg.query(`delete from school_module_entitlements where module_id = 'school-auditor' and school_id = $1`, [C]);
    await db.pg.exec(last);
    expect(await n(`school_module_entitlements where module_id = 'school-auditor' and enabled and school_id = any($1::uuid[])`, [[A, B, NEW, C]])).toBe(4);
    await db.pg.query(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'school-auditor'`, [C]);
    await db.pg.exec(last);
    expect((await db.pg.query(`select enabled from school_module_entitlements where module_id = 'school-auditor' and school_id = $1`, [C])).rows[0].enabled).toBe(false);
  });

  describe('a school with nothing set up', () => {
    it('no timetable, no budget, no fee structure and no fee raised: each says "not set up", and none is counted in M', async () => {
      const run = await checkUp();
      for (const id of ['timetable_filled', 'message_budget', 'fee_structure', 'overdue_followed_up'] as const) expect(of(run, id), id).toEqual({ id, state: 'not_set_up', count: null, href: CHECK_META[id].screen });
      expect(run.results.map((r) => r.id)).toEqual([...CHECK_IDS]);
      // What applies: the eight others. Three pass (no message held, no complaint, no leave waiting); five need attention.
      expect(run).toMatchObject({ date: D, ruleVersion: 1, passed: 3, applicable: 8 });
      expect(run.results.filter((r) => r.state === 'needs_attention').map((r) => [r.id, r.count])).toEqual([['class_teacher', 1], ['student_guardian', 1], ['guardian_phone', 1], ['consent', 1], ['attendance_marked', 5]]);
      expect(run.results.filter((r) => r.state === 'passes').map((r) => r.id)).toEqual(['messages_held', 'complaints_overdue', 'leave_waiting']);
    });

    it('a brand-new school: every check that looks at something not there says so, and the result counts only what applies', async () => {
      const run = await checkUp(newPrincipal);
      expect(run.results.filter((r) => r.state === 'not_set_up').map((r) => r.id)).toEqual(['class_teacher', 'student_guardian', 'guardian_phone', 'consent', 'attendance_marked', 'timetable_filled', 'fee_structure', 'overdue_followed_up', 'message_budget']);
      expect(run.results.some((r) => r.state === 'needs_attention' || r.state === 'could_not_check')).toBe(false);
      expect(run).toMatchObject({ passed: 3, applicable: 3 });
      // "Not set up" is never a count of zero.
      for (const r of run.results.filter((x) => x.state === 'not_set_up')) expect(r.count).toBeNull();
    });

    it('a module switched off for the school: its checks are "not set up" and are not counted', async () => {
      const run = await checkUp(principal, { off: ['fees', 'complaints'] });
      for (const id of ['fee_structure', 'overdue_followed_up', 'complaints_overdue'] as const) expect(of(run, id), id).toEqual({ id, state: 'not_set_up', count: null, href: null, off: true });
      expect(run).toMatchObject({ passed: 2, applicable: 7 });
    });
  });

  describe('each failing check names its count and its screen, and passes once the data is fixed', () => {
    it('every class has a class teacher: one with none and one whose teacher has left', async () => {
      await db.pg.query(`update classes set class_teacher_id = $2 where class_id = $1`, [C6B, LATA]);
      expect(await check('class_teacher')).toEqual({ id: 'class_teacher', state: 'needs_attention', count: 2, href: '/app/help/ticket/new' });
      // The office sets them (through the office's own session).
      await as(principal, (c) => c.query(`update classes set class_teacher_id = case class_id when $1::uuid then $3::uuid else $4::uuid end where class_id in ($1, $2)`, [C6B, C7C, TARUN, TEJAS]));
      expect(await check('class_teacher')).toEqual({ id: 'class_teacher', state: 'passes', count: null, href: null });
    });

    it('every active student has a guardian: a guardian merged into another does not count', async () => {
      expect(await check('student_guardian')).toEqual({ id: 'student_guardian', state: 'needs_attention', count: 1, href: screenFor.students('active') });
      await as(principal, (c) => c.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [A, G_FARAH, JAYA]));
      expect((await check('student_guardian')).state).toBe('passes');
    });

    it('every guardian’s number can receive WhatsApp, by the one rule that says how a number is written', async () => {
      expect(await check('guardian_phone')).toEqual({ id: 'guardian_phone', state: 'needs_attention', count: 1, href: '/app/parents' });
      await as(principal, (c) => c.query(`update parents set phone = '+91 90000 00003' where parent_id = $1`, [G_GOPAL]));
      expect((await check('guardian_phone')).state).toBe('passes');
    });

    it('consent: the same number as the school fact, opening the fact’s own list', async () => {
      const fact = (await as(principal, (c) => loadFacts(c, actor(principal), ents(), { ids: ['students.waiting_consent'] }))).facts[0];
      const got = await check('consent');
      expect(got).toEqual({ id: 'consent', state: 'needs_attention', count: fact.value, href: fact.href });
      expect(got).toMatchObject({ count: 1, href: '/app/admissions' });
      await db.pg.query(`update students set status = 'active' where student_id = $1`, [ESHA]);
      expect((await check('consent')).state).toBe('passes');
    });

    it('attendance on each of the last five working days: the days with a class unmarked, and the list of those days', async () => {
      // 5-A is marked on all five days; 6-B on three of them. 7-C has nobody on its roll and needs no mark.
      await db.pg.exec(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
        ${[1, 2, 3, 4, 5].map((b) => mark(ASHA, C5A, b)).join(', ')}, ${[1, 2, 4].map((b) => mark(FARAH, C6B, b)).join(', ')}`);
      expect(await check('attendance_marked')).toEqual({ id: 'attendance_marked', state: 'needs_attention', count: 2, href: `/app/attendance?show=days&from=${day(5)}&to=${day(1)}` });
      // The office marks the two days that were missed.
      await db.pg.exec(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ${[3, 5].map((b) => mark(FARAH, C6B, b)).join(', ')}`);
      expect((await check('attendance_marked')).state).toBe('passes');
      // A holiday is not a working day: the five days move back past it, to a day nobody marked.
      await db.pg.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, $2, 'Founders day', $3)`, [A, day(2), PRINCIPAL]);
      expect(await check('attendance_marked')).toEqual({ id: 'attendance_marked', state: 'needs_attention', count: 1, href: `/app/attendance?show=days&from=${day(6)}&to=${day(1)}` });
      await db.pg.exec(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ${mark(ASHA, C5A, 6)}, ${mark(GOPAL, C6B, 6)}`);
      expect((await check('attendance_marked')).state).toBe('passes');
      await db.pg.query(`delete from school_holidays where school_id = $1`, [A]);
    });

    it('the timetable has no empty period on a working day, up to the periods in a day', async () => {
      await setting('timetable', timetable.version, { periods_per_day: 1 });
      // Seven working days, one period, three classes: twenty-one periods. All but 7-C on Wednesday are filled.
      const teacherOf: Record<string, string> = { [C5A]: TARA, [C6B]: TARUN, [C7C]: TEJAS };
      const rows = [C5A, C6B, C7C].flatMap((c) => [1, 2, 3, 4, 5, 6, 7].filter((w) => !(c === C7C && w === 3)).map((w) => `('${A}', '${c}', ${w}, 1, '${MATHS}', '${teacherOf[c]}')`));
      await db.pg.exec(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ${rows.join(', ')}`);
      expect(await check('timetable_filled')).toEqual({ id: 'timetable_filled', state: 'needs_attention', count: 1, href: '/app/timetable' });
      // The office fills it with the timetable's own function.
      const put = await as(principal, (c) => putEntry(c, actor(principal), { classId: C7C, weekday: 3, period: 1, subjectId: MATHS, teacherUserId: TEJAS }));
      expect(put.ok).toBe(true);
      expect((await check('timetable_filled')).state).toBe('passes');
      // A second period a day, nowhere filled: twenty-one more. A school working six days: eighteen of them.
      await setting('timetable', timetable.version, { periods_per_day: 2 });
      expect((await check('timetable_filled')).count).toBe(21);
      await setting('setup', setup.version, { working_days: ALL_DAYS.slice(0, 6) });
      expect((await check('timetable_filled')).count).toBe(18);
      await setting('setup', setup.version, { working_days: ALL_DAYS });
      await setting('timetable', timetable.version, { periods_per_day: 1 });
      expect((await check('timetable_filled')).state).toBe('passes');
    });

    it('every class has a fee structure in force, by the fees library’s own "in force"', async () => {
      const head = await as(accountant, (c) => addHead(c, actor(accountant), { name: 'Tuition', isMandatory: true }));
      if (!head.ok) throw new Error(head.reason);
      const version = (classId: string, from: string) => as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId, sessionId: SESSION, effectiveFrom: from, items: [{ headId: head.head.head_id, amountMinor: 150000, frequency: 'monthly' }] }));
      for (const [cls, from] of [[C5A, day(30)], [C6B, D], [C7C, day(-5)]] as const) expect((await version(cls, from)).ok).toBe(true);
      // 7-C's only structure begins in five days: not in force today.
      expect(await check('fee_structure')).toEqual({ id: 'fee_structure', state: 'needs_attention', count: 1, href: '/app/fees' });
      expect((await version(C7C, day(1))).ok).toBe(true);
      expect((await check('fee_structure')).state).toBe('passes');
    });

    it('no fee overdue by more than thirty days without a follow-up: the families of the fee desk’s own list', async () => {
      const fee = (id: number, student: string, back: number) => `('${u(id)}', '${A}', '${student}', 100000, 100000, '${day(back)}', 'pending')`;
      await owner(`insert into fees_ledger (fee_id, school_id, student_id, amount_minor, gross_minor, due_date, status) values ${fee(301, ASHA, 40)}, ${fee(302, FARAH, 10)}, ${fee(303, GOPAL, 50)}, ${fee(304, BELA, 45)}`);
      // Gopal's family had a call five days ago; Bela's had one before her fee fell due, which does not count.
      await owner(`insert into fee_followups (school_id, student_id, kind, note, status, created_by, created_at) values
        ('${A}', '${GOPAL}', 'call', 'Will pay at month end.', 'closed', '${ACCOUNTANT}', now() - interval '5 days'),
        ('${A}', '${BELA}', 'call', 'Asked about the new fee.', 'closed', '${ACCOUNTANT}', now() - interval '60 days')`);
      expect(await check('overdue_followed_up')).toEqual({ id: 'overdue_followed_up', state: 'needs_attention', count: 2, href: screenFor.dues('overdue') });
      for (const student of [ASHA, BELA]) expect((await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'call', studentId: student, note: 'Spoke to the family.' }))).ok).toBe(true);
      expect((await check('overdue_followed_up')).state).toBe('passes');
    });

    it('no message held back in the last seven days: the school fact’s number and list', async () => {
      await owner(`insert into communication_log (school_id, channel, status, created_at) values
        ('${A}', 'whatsapp', 'blocked_consent', now() - interval '2 days'), ('${A}', 'whatsapp', 'blocked_budget', now() - interval '9 days'), ('${A}', 'whatsapp', 'delivered', now()), ('${B}', 'whatsapp', 'blocked_consent', now())`);
      const fact = (await as(principal, (c) => loadFacts(c, actor(principal), ents(), { ids: ['messages.held'], range: '7d' }))).facts[0];
      expect(await check('messages_held')).toEqual({ id: 'messages_held', state: 'needs_attention', count: fact.value, href: fact.href });
      expect(fact).toMatchObject({ value: 1, href: `/app/communication?state=held&from=${day(6)}&to=${D}` });
      // Nothing can unsend a held message: once its day is more than seven days back, the check passes.
      expect(of(await checkUp(principal, { today: addDays(D, 6) }), 'messages_held').state).toBe('passes');
      await owner(`delete from communication_log`);
    });

    it('a message budget is set: "not set up" without one, and it passes once NetCyberAI sets it', async () => {
      expect((await check('message_budget')).state).toBe('not_set_up');
      await platform((c) => c.query(`update schools set monthly_budget_paise = 500000 where school_id = $1`, [A]));
      expect(await check('message_budget')).toEqual({ id: 'message_budget', state: 'passes', count: null, href: null });
    });

    it('no complaint past its due time: the school fact’s number', async () => {
      await db.pg.exec(`insert into complaints (complaint_id, school_id, parent_id, student_id, source, summary, status, owner_id, due_at, created_by) values
        ('${u(801)}', '${A}', '${G_ASHA}', '${ASHA}', 'office', 'The bus was late.', 'open', '${ADMIN}', now() - interval '1 hour', '${ADMIN}'),
        ('${u(802)}', '${A}', '${G_FARAH}', '${FARAH}', 'office', 'The water cooler is broken.', 'open', '${ADMIN}', now() + interval '1 day', '${ADMIN}')`);
      const fact = (await as(principal, (c) => loadFacts(c, actor(principal), ents(), { ids: ['complaints.overdue'] }))).facts[0];
      expect(await check('complaints_overdue')).toEqual({ id: 'complaints_overdue', state: 'needs_attention', count: fact.value, href: fact.href ?? '/app/complaints' });
      expect(fact.value).toBe(1);
      await as(principal, (c) => c.query(`update complaints set status = 'closed', closed_by = $2, closed_at = now(), closing_note = 'The bus now leaves ten minutes earlier.' where complaint_id = $1`, [u(801), PRINCIPAL]));
      expect((await check('complaints_overdue')).state).toBe('passes');
    });

    it('no leave request waiting more than two days: India’s days, and the Staff screen’s own list', async () => {
      await db.pg.exec(`insert into staff_leave (leave_id, school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, asked_at) values
        ('${u(901)}', '${A}', '${TARA}', '${day(-10)}', '${day(-10)}', 'casual', 'A family function.', 'waiting', '${TARA}', now() - interval '3 days'),
        ('${u(902)}', '${A}', '${TARUN}', '${day(-12)}', '${day(-12)}', 'sick', 'An appointment.', 'waiting', '${TARUN}', now() - interval '2 days'),
        ('${u(903)}', '${A}', '${TEJAS}', '${day(-14)}', '${day(-14)}', 'other', 'A meeting.', 'waiting', '${TEJAS}', now())`);
      for (const who of [principal, admin]) expect(await check('leave_waiting', who), who.role).toEqual({ id: 'leave_waiting', state: 'needs_attention', count: 1, href: '/app/staff' });
      expect((await as(principal, (c) => decideLeave(c, actor(principal), u(901), 'approve', ''))).ok).toBe(true);
      expect((await check('leave_waiting')).state).toBe('passes');
    });

    it('with every one of them fixed, the next check-up passes all twelve', async () => {
      expect(await checkUp()).toMatchObject({ passed: 12, applicable: 12 });
    });
  });

  describe('a check that fails to run', () => {
    it('is "could not be checked", counted in M and not in N, and the checks after it still run', async () => {
      const broken: CheckDefinition = { ...CHECKS.find((c) => c.id === 'consent')!, run: async (c) => (await c.query(`select count(*) from a_table_that_is_not_there`), { state: 'passes' }) };
      const run = await checkUp(principal, { checks: CHECKS.map((c) => (c.id === 'consent' ? broken : c)) });
      expect(of(run, 'consent')).toEqual({ id: 'consent', state: 'could_not_check', count: null, href: null });
      expect(run).toMatchObject({ passed: 11, applicable: 12 });
      expect(run.results.filter((r) => r.id !== 'consent').every((r) => r.state === 'passes')).toBe(true);
      // A check that throws on its own is the same.
      const throws: CheckDefinition = { ...broken, run: async () => { throw new Error('no'); } };
      expect(of(await checkUp(principal, { checks: [throws] }), 'consent').state).toBe('could_not_check');
    });
  });

  describe('who may run and read a check-up', () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(990), tokenVersion: 0, aal: 'aal1', sessionId: u(991) });
    const req = (method: string) => new NextRequest('http://localhost/api/app/school-auditor', { method });
    const call = async (who: Who, fn: () => Promise<Response>) => {
      state.claims = claims(who);
      const res = await fn();
      return { status: res.status, body: await res.json() };
    };
    const get = (who: Who) => call(who, () => getAuditor(req('GET')));
    const post = (who: Who) => call(who, () => postAuditor(req('POST')));
    const rows = (school = A) => n(`school_health_runs where school_id = $1`, [school]);

    it('the principal runs one; "Check again" the same day rewrites that day; the school admin reads it; each run is audited; no model is asked', async () => {
      // The watch on the provider works: asking for one is counted.
      const { configuredProvider } = await import('@/lib/ai/provider');
      const watched = state.asked;
      configuredProvider({});
      expect(state.asked).toBe(watched + 1);
      const [asked, drafted, usage] = [state.asked, state.drafted, await n('ai_usage')];
      expect(await get(principal)).toMatchObject({ status: 200, body: { today: D, latest: null, history: [] } });
      const first = await post(principal);
      expect(first.status).toBe(201);
      expect(first.body.latest).toMatchObject({ date: D, ruleVersion: 1, passed: 12, applicable: 12, recordedBy: 'Priya Principal' });
      expect(first.body.latest.results).toHaveLength(12);
      expect(first.body.history).toEqual([{ date: D, ruleVersion: 1, passed: 12, applicable: 12 }]);
      // A thing breaks; the school admin checks again the same day: still one row, now the admin's, with the new result.
      await db.pg.query(`update classes set class_teacher_id = null where class_id = $1`, [C7C]);
      const again = await post(admin);
      expect(again.body.latest).toMatchObject({ date: D, passed: 11, applicable: 12, recordedBy: 'Asif Admin' });
      expect(again.body.latest.results.find((r: { id: string }) => r.id === 'class_teacher')).toEqual({ id: 'class_teacher', state: 'needs_attention', count: 1, href: '/app/help/ticket/new' });
      expect(await rows()).toBe(1);
      expect(await get(principal)).toMatchObject({ status: 200, body: { latest: { passed: 11, recordedBy: 'Asif Admin' }, history: [{ date: D, passed: 11, applicable: 12 }] } });
      const audit = (await db.pg.query(`select actor_user_id, after_state from audit_log where event_action = 'school_health.checked' order by created_at`)).rows;
      expect(audit.map((r: { actor_user_id: string }) => r.actor_user_id)).toEqual([PRINCIPAL, ADMIN]);
      expect(audit[1].after_state).toEqual({ date: D, ruleVersion: 1, passed: 11, applicable: 12 });
      // Rules only: no provider was asked for, no draft was made, nothing was metered.
      expect([state.asked, state.drafted, await n('ai_usage')]).toEqual([asked, drafted, usage]);
      await db.pg.query(`update classes set class_teacher_id = $2 where class_id = $1`, [C7C, TEJAS]);
    });

    it('what is kept is counts and addresses only: no name, number or id of any person', async () => {
      const kept = JSON.stringify((await db.pg.query(`select results from school_health_runs where school_id = $1`, [A])).rows[0].results);
      for (const secret of [ASHA, BELA, JAYA, TARA, TARUN, TEJAS, LATA, G_GOPAL, 'Asha', 'Tara', 'Tejas', 'Lata', '9000000001', '12345']) expect(kept).not.toContain(secret);
      for (const r of JSON.parse(kept) as Record<string, unknown>[]) expect(Object.keys(r).sort()).toEqual(['count', 'href', 'id', 'state']);
    });

    it('a teacher, an accountant and a coordinator are refused, by the route and by the library', async () => {
      const before = await rows();
      for (const who of NOT_THE_OFFICE) {
        expect(await get(who), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
        expect(await post(who), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
        await expect(checkUp(who), who.role).rejects.toBeInstanceOf(NotTheOfficesCheckUp);
        expect(await as(who, (c) => latestCheckUp(c, actor(who))), who.role).toBeNull();
        expect(await as(who, (c) => checkUpHistory(c, actor(who))), who.role).toEqual([]);
        expect(await as(who, (c) => recordCheckUp(c, actor(who), { date: D, ruleVersion: 1, results: [], passed: 0, applicable: 0 })), who.role).toBeNull();
      }
      expect(await rows()).toBe(before);
    });

    it('the database refuses them too: they read no row and write none; the platform role holds no right at all', async () => {
      expect(await rows()).toBe(1);
      for (const who of NOT_THE_OFFICE) {
        expect((await as<Rows>(who, (c) => c.query(`select count(*)::int as n from school_health_runs`))).rows[0].n, who.role).toBe(0);
        expect((await as<Rows>(who, (c) => c.query(`update school_health_runs set results = results returning run_id`))).rows, who.role).toEqual([]);
      }
      // A write in their own name, for a school that has no check-up yet: the policy refuses it.
      for (const who of [{ role: 'teacher', user: NEW_TEACHER, school: NEW }, { role: 'accountant', user: NEW_ACCOUNTANT, school: NEW }, { role: 'academic_coordinator', user: NEW_COORDINATOR, school: NEW }]) {
        await expect(as(who, (c) => c.query(`insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by) values ($1, (now() at time zone 'Asia/Kolkata')::date, 1, '[]', 0, 0, $2)`, [NEW, who.user])), who.role).rejects.toThrow(/row-level security/);
      }
      expect(await rows(NEW)).toBe(0);
      await expect(platform((c) => c.query(`select * from school_health_runs`))).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by) values ($1, (now() at time zone 'Asia/Kolkata')::date, 1, '[]', 0, 0, $2)`, [NEW, NEW_PRINCIPAL]))).rejects.toThrow(/permission denied/);
      // Another school's principal sees none of this school's check-ups.
      expect((await as<Rows>(elsewhere, (c) => c.query(`select count(*)::int as n from school_health_runs`))).rows[0].n).toBe(0);
      expect(await as(elsewhere, (c) => latestCheckUp(c, actor(elsewhere)))).toBeNull();
      // Nobody deletes one.
      await expect(as(principal, (c) => c.query(`delete from school_health_runs`))).rejects.toThrow(/permission denied/);
    });

    it('a check-up is written in one’s own name, for today only, and its "N of M" is what its checks said', async () => {
      const insert = (who: Who, date: string, results: unknown[], passed: number, applicable: number, by = who.user) =>
        as(who, (c) => c.query(`insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by) values ($1, $2::date, 1, $3::jsonb, $4, $5, $6)`, [who.school ?? A, date, JSON.stringify(results), passed, applicable, by]));
      const two = [{ id: 'consent', state: 'passes' }, { id: 'message_budget', state: 'not_set_up' }];
      await expect(insert(newPrincipal, D, two, 1, 1, PRINCIPAL)).rejects.toThrow(/row-level security/);
      await expect(insert(newPrincipal, day(1), two, 1, 1)).rejects.toThrow(/for today only/);
      await expect(insert(newPrincipal, addDays(D, 1), two, 1, 1)).rejects.toThrow(/for today only/);
      // A made-up score: more passing than said, or a "not set up" counted in M.
      await expect(insert(newPrincipal, D, two, 2, 2)).rejects.toThrow(/school_health_runs_n_of_m/);
      await expect(insert(newPrincipal, D, two, 1, 2)).rejects.toThrow(/school_health_runs_n_of_m/);
      await insert(newPrincipal, D, two, 1, 1);
      expect(await rows(NEW)).toBe(1);
    });

    it('a past day’s check-up never changes: not by "Check again", not by the database', async () => {
      await owner(`insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by, recorded_at) values ('${A}', '${day(1)}', 1, '[{"id":"consent","state":"needs_attention","count":4,"href":"/app/admissions"}]', 0, 1, '${PRINCIPAL}', now() - interval '1 day')`);
      const yesterday = async () => (await db.pg.query(`select results, passed, applicable, recorded_by, recorded_at from school_health_runs where school_id = $1 and run_date = $2`, [A, day(1)])).rows[0];
      const before = await yesterday();
      // Check again today: today's row is rewritten, yesterday's is not touched.
      expect((await post(principal)).status).toBe(201);
      expect(await yesterday()).toEqual(before);
      for (const who of [principal, admin]) {
        await expect(as(who, (c) => c.query(`update school_health_runs set results = '[]', passed = 0, applicable = 0, recorded_by = $2 where school_id = $1 and run_date < (now() at time zone 'Asia/Kolkata')::date`, [A, who.user])), who.role).rejects.toThrow(/a past day's check-up never changes/);
        await expect(as(who, (c) => c.query(`update school_health_runs set run_date = run_date + 1, recorded_by = $2 where school_id = $1 and run_date < (now() at time zone 'Asia/Kolkata')::date`, [A, who.user])), who.role).rejects.toThrow(/stays with its school and its day/);
      }
      expect(await yesterday()).toEqual(before);
      // The trend: today first, then yesterday.
      expect((await get(admin)).body.history.map((l: { date: string; passed: number; applicable: number }) => [l.date, l.passed, l.applicable])).toEqual([[D, 12, 12], [day(1), 0, 1]]);
    });

    it('a principal whose account was made at another school, signed in here, runs one in their own name', async () => {
      const got = await post(visiting);
      expect(got.status).toBe(201);
      expect((await db.pg.query(`select recorded_by from school_health_runs where school_id = $1 and run_date = $2`, [A, D])).rows[0].recorded_by).toBe(VISITING);
      expect((await post(principal)).status).toBe(201);
    });

    it('the page is the module’s own for the office, "not for your role" for anyone else, and off when the module is off', async () => {
      for (const who of [principal, admin]) {
        state.claims = claims(who);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await SchoolAuditorPage();
        expect(page.type, who.role).toBe(ModulePage);
        expect(page.props).toMatchObject({ moduleId: 'school-auditor', help: 'school-check-up', tour: 'school-auditor', title: t('en', 'aud.page.title'), purpose: t('en', 'aud.page.purpose') });
        expect(page.props.children.type).toBe(AuditorView);
      }
      for (const who of NOT_THE_OFFICE) {
        state.claims = claims(who);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(((await SchoolAuditorPage()) as any).type, who.role).toBe(ModuleComingPage);
      }
      await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'school-auditor'`, [A]);
      try {
        state.claims = claims(principal);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const off: any = await SchoolAuditorPage();
        expect(off.type).toBe(ModuleOffPage);
        expect(off.props).toMatchObject({ moduleId: 'school-auditor', reason: 'module_off' });
        expect(await post(principal)).toMatchObject({ status: 403 });
      } finally {
        await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'school-auditor'`, [A]);
      }
    });
  });

  describe('the screen', () => {
    const draw = (lang: 'en' | 'hi', data: AuditorData) => renderToStaticMarkup(h(LangProvider, { lang, children: h(AuditorScreen, { data, busy: false, note: null, onRun: () => undefined }) }));

    it('says "N of M checks pass" in words, the checks needing attention first with their count, button and "Why this?", then the rest', async () => {
      await db.pg.query(`update classes set class_teacher_id = null where class_id = $1`, [C7C]);
      await platform((c) => c.query(`update schools set monthly_budget_paise = null where school_id = $1`, [A]));
      const latest = await as(principal, async (c) => recordCheckUp(c, actor(principal), await runCheckUp(c, actor(principal), ents())));
      const data: AuditorData = { today: D, latest, history: await as(principal, (c) => checkUpHistory(c, actor(principal))) };
      expect(latest).toMatchObject({ passed: 10, applicable: 11 });
      const en = draw('en', data);
      expect(en).toContain('10 of 11 checks pass');
      expect(en).toContain('1 more check is not set up yet, so it is not counted.');
      expect(en).not.toContain('%');
      // Needs attention comes first, then what passes, then what is not set up.
      const at = (s: string) => en.indexOf(s);
      expect(at('data-auditor-section="attention"')).toBeGreaterThan(-1);
      expect(at('data-auditor-section="attention"')).toBeLessThan(at('data-auditor-section="passes"'));
      expect(at('data-auditor-section="passes"')).toBeLessThan(at('data-auditor-section="not-set-up"'));
      expect(en).toContain('1 class has no class teacher');
      expect(en).toMatch(/data-check-fix="class_teacher"[^>]*>Raise a ticket</);
      expect(en).toContain('href="/app/help/ticket/new"');
      expect(en).toContain(t('en', 'myDay.why'));
      expect(en).toContain(t('en', 'aud.why.rule', { rule: t('en', 'aud.check.class_teacher.rule') }));
      expect(en).toContain(t('en', 'aud.check.message_budget.setup'));
      expect(en).toContain(t('en', 'aud.how'));
      expect(en).toContain('data-auditor-day="' + D + '"');
      expect(en).not.toContain('data-auditor-older');
      const hi = draw('hi', data);
      expect(hi).toContain('11 में से 10 जाँचें ठीक हैं');
      expect(hi).toContain('1 कक्षा का कोई कक्षा शिक्षक नहीं है');
      // No name of any teacher is drawn: a class without a class teacher is a class.
      for (const name of ['Tara', 'Tarun', 'Tejas', 'Lata']) expect(en).not.toContain(name);
      await db.pg.query(`update classes set class_teacher_id = $2 where class_id = $1`, [C7C, TEJAS]);
    });

    it('a check that could not run is said plainly and never drawn as passing; an older check-up says so', async () => {
      const latest = { date: day(3), ruleVersion: 1, passed: 1, applicable: 2, recordedAt: new Date().toISOString(), recordedBy: null, results: [{ id: 'consent' as const, state: 'could_not_check' as const, count: null, href: null }, { id: 'leave_waiting' as const, state: 'passes' as const, count: null, href: null }] };
      const html = draw('en', { today: D, latest, history: [{ date: day(3), ruleVersion: 1, passed: 1, applicable: 2 }] });
      expect(html).toContain('1 of 2 checks pass');
      expect(html).toContain('1 check could not be run this time. It is counted, and not as a pass.');
      expect(html).toMatch(/data-check="consent" data-state="could_not_check"/);
      expect(html).toContain(t('en', 'aud.notChecked.do'));
      expect(html).toContain('data-auditor-older');
      expect(html).not.toContain('Nothing needs attention');
    });

    it('a brand-new school is told what a check-up does and runs the first one', () => {
      for (const lang of ['en', 'hi'] as const) {
        const html = draw(lang, { today: D, latest: null, history: [] });
        expect(html).toContain('data-empty="school-auditor"');
        expect(html).toContain(t(lang, 'aud.empty.title'));
        expect(html).toContain(t(lang, 'aud.empty.do'));
        expect(html).toContain(t(lang, 'aud.run.first'));
        expect(html).not.toContain('data-auditor-summary');
      }
    });
  });
});
