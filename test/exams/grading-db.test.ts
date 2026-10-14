import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addBoard, addPreset, controlBoards, listBoards, setSchoolBoard } from '@/lib/exams/boards';
import { bandProblems, gapsAsInPreset, grade, passed } from '@/lib/exams/grading';
import { emptyScheme, schemeFromPreset, type Band, type BoardPreset, type GradingScheme } from '@/lib/exams/scheme';
import { saveScheme, schemeInForce, schemeScreen, setOwnBoard } from '@/lib/exams/schemes';
import { workingModules } from '@/lib/frameworks/plans';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// Boards and the grading scheme builder (docs/27 row 9a, C213). The acceptance test: "A CBSE school starts from the
// CBSE preset and sees its source. It changes a band and the grade follows. A CISCE school sees the grades and pass
// mark of the Regulations and is asked for the mark ranges the Regulations do not give. Control adds a state board
// preset with its circular's URL, and a school of that board starts from it. No grade table exists in the code
// except the two presets, each with its URL." Proven on the whole schema as the app's own database role, through the
// app's code, its routes, and by going to the database directly. (The code holds no grade table at all: the two
// presets are rows the migration seeds; test/exams/grading.test.ts reads the source.) Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));

import { GET as getScheme, POST as postScheme } from '@/app/api/app/exams/scheme/route';
import { GET as getBoards, POST as postBoards } from '@/app/api/control/boards/route';
import { GET as getSchoolBoard, POST as postSchoolBoard } from '@/app/api/control/boards/schools/[schoolId]/route';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `9a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// A: a CBSE school (its form said CBSE). C: a CISCE school (its form said ICSE). S: a school of a state board that
// is not on record until Control adds it. Every name and number below is made up.
const [A, C, S] = [u(1), u(2), u(3)];
const [PRINCIPAL, ADMIN, COORDINATOR, TEACHER, ACCOUNTANT, C_PRINCIPAL, S_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(21), u(31), u(91)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const cPrincipal: Who = { role: 'principal', user: C_PRINCIPAL, school: C };
const sPrincipal: Who = { role: 'principal', user: S_PRINCIPAL, school: S };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The platform role as Control uses it: a NetCyberAI staff session (withTenantContext sets these for super_admin).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>, asStaff = true): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    if (asStaff) for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', FOUNDER]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { rows: any[]; rowCount: number };
const run = (who: Who, sql: string, params: unknown[] = []) => as<Result>(who, (c) => c.query(sql, params));
const founder = { userId: FOUNDER };

const CBSE_URL = 'https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Curriculum_Sec_2025-26.pdf';
const ICSE_URL = 'https://cisce.org/wp-content/uploads/2026/01/1.-Regulations.pdf';
const ISC_URL = 'https://cisce.org/wp-content/uploads/2026/01/1.-Regulations-1.pdf';
const CIRCULAR_URL = 'https://example.invalid/state-board/circular-grading.pdf';
const ranges = (bands: readonly Band[]) => bands.map((b) => [b.grade, b.from, b.to]);
const presetOf = (boards: { boardId: string; presets: BoardPreset[] }[], board: string, level: string) => boards.find((b) => b.boardId === board)!.presets.find((p) => p.level === level)!;
const save = (who: Who, scheme: GradingScheme, fromPresetId: string | null, basedOn: number) => as(who, (c) => saveScheme(c, actor(who), { scheme, fromPresetId, basedOn }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board) values ('${A}', 'School A', 'IN-HR', 'CBSE'), ('${C}', 'School C', 'IN-DL', 'ICSE'), ('${S}', 'School S', 'IN-HR', 'STATE');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${TEACHER}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true), ('${C_PRINCIPAL}', '${C}', 'principal@school-c.example', 'principal', 'Chhaya Principal', true),
      ('${S_PRINCIPAL}', '${S}', 'principal@school-s.example', 'principal', 'Sunil Principal', true), ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder', true);
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${C}', '${S}']::uuid[]) s;
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the presets are rows, copied from each board’s document, with its URL', () => {
  it('CBSE, Classes IX-X: the bands as printed (the gap included), the pass mark, the components and the notes', async () => {
    const boards = await as(teacher, (c) => listBoards(c)); // every school role reads them
    expect(boards.map((b) => b.boardId)).toEqual(['cbse', 'cisce']);
    const cbse = presetOf(boards, 'cbse', 'Classes IX-X');
    expect(cbse).toMatchObject({ sourceTitle: 'Secondary School Curriculum 2025–26, Classes IX–X', sourceUrl: CBSE_URL, sourceReadOn: '2026-10-14', passMark: 33, coScholastic: null, addedBy: null });
    expect(ranges(cbse.bands)).toEqual([['A1', 91, 100], ['A2', 81, 90], ['B1', 71, 80], ['B2', 61, 70], ['C1', 51, 60], ['C2', 45, 50], ['D', 33, 40]]);
    expect(cbse.components.map((c) => [c.kind, c.name, c.share, c.passMark, c.parts.map((p) => [p.name, p.share])])).toEqual([
      ['theory', 'Annual examination', 80, null, []],
      ['internal', 'Internal assessment', 20, null, [['Periodic assessment', 5], ['Multiple assessment', 5], ['Portfolio', 5], ['Subject enrichment', 5]]],
    ]);
    expect(cbse.notes.map((n) => n.about)).toEqual(['general', 'pass_mark', 'bands', 'grades']);
    expect(cbse.notes.find((n) => n.about === 'pass_mark')!.text).toContain('“33 percent in total in each of these components”');
    expect(cbse.notes.find((n) => n.about === 'pass_mark')!.text).toContain('2018 notification');
    expect(cbse.notes.find((n) => n.about === 'bands')!.text).toContain('41 to 44, and below 33, fall in no band');
    expect(cbse.notes.find((n) => n.about === 'grades')!.text).toMatch(/Class X grades are positional.*does not offer them/);
    // The builder shows the gap the document prints, on the scale of whole percents.
    expect(bandProblems(schemeFromPreset(cbse)).gaps).toEqual([{ from: 0, to: 32 }, { from: 41, to: 44 }]);
  });

  it('CISCE: ICSE and ISC, grades 1 to 9 with their meanings and no mark ranges, pass marks 33 and 35, SUPW graded A to E', async () => {
    const boards = await as(accountant, (c) => listBoards(c));
    const icse = presetOf(boards, 'cisce', 'ICSE (Class X)');
    const isc = presetOf(boards, 'cisce', 'ISC (Class XII)');
    expect(icse).toMatchObject({ sourceTitle: 'ICSE Regulations, Year 2028', sourceUrl: ICSE_URL, passMark: 33, components: [] });
    expect(isc).toMatchObject({ sourceTitle: 'ISC Regulations, Year 2028', sourceUrl: ISC_URL, passMark: 35, components: [] });
    expect(icse.bands.map((b) => [b.grade, b.from, b.to, b.meaning])).toEqual([
      ['1', null, null, 'Very good'], ['2', null, null, 'Very good'], ['3', null, null, 'Pass with credit'], ['4', null, null, 'Pass with credit'], ['5', null, null, 'Pass with credit'],
      ['6', null, null, 'Pass'], ['7', null, null, 'Pass'], ['8', null, null, 'Failure'], ['9', null, null, 'Failure'],
    ]);
    expect(isc.bands.map((b) => b.meaning)).toEqual(['Very good (pass with credit)', 'Very good (pass with credit)', 'Pass with credit', 'Pass with credit', 'Pass with credit', 'Pass with credit', 'Pass', 'Pass', 'Failure']);
    // Both Regulations grade SUPW and Community Service A to E, A to D a pass (the ISC Regulations say so too).
    for (const p of [icse, isc]) expect(p.coScholastic).toEqual({ areas: ['SUPW and Community Service'], grades: ['A', 'B', 'C', 'D', 'E'].map((grade) => ({ grade, meaning: null, pass: grade !== 'E' })) });
    for (const p of [icse, isc]) expect(p.notes.find((n) => n.about === 'bands')!.text).toContain('give no mark range for the grades');
  });

  it('no other board, and every preset has its document’s URL', async () => {
    const all = await platform((c) => controlBoards(c));
    expect(all.map((b) => [b.boardId, b.presets.map((p) => p.level)])).toEqual([['cbse', ['Classes IX-X']], ['cisce', ['ICSE (Class X)', 'ISC (Class XII)']]]);
    expect(all.flatMap((b) => b.presets.map((p) => p.sourceUrl))).toEqual([CBSE_URL, ICSE_URL, ISC_URL]);
  });
});

describe('a school records its board', () => {
  it('a school whose form said CBSE or ICSE starts on that board; one that said a state board has none', async () => {
    expect((await as(principal, (c) => schemeScreen(c, actor(principal))))!.board).toMatchObject({ boardId: 'cbse', setBy: null });
    expect((await as(cPrincipal, (c) => schemeScreen(c, actor(cPrincipal))))!.board).toMatchObject({ boardId: 'cisce' });
    expect((await as(sPrincipal, (c) => schemeScreen(c, actor(sPrincipal))))!.board).toEqual({ boardId: null, name: null, setBy: null, setAt: null });
  });

  it('the principal and the school admin record it, in their own name; nobody else can, in the app or the database', async () => {
    expect(await as(admin, (c) => setOwnBoard(c, actor(admin), 'cisce'))).toEqual({ ok: true, changed: true });
    expect((await as(principal, (c) => schemeScreen(c, actor(principal))))!.board).toMatchObject({ boardId: 'cisce', setBy: 'Asif Admin' });
    expect(await as(principal, (c) => setOwnBoard(c, actor(principal), 'cbse'))).toEqual({ ok: true, changed: true });
    expect(await as(principal, (c) => setOwnBoard(c, actor(principal), 'no-such-board'))).toEqual({ ok: false, reason: 'no_board' });
    for (const who of [coordinator, teacher, accountant]) expect(await as(who, (c) => setOwnBoard(c, actor(who), 'cisce')), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    for (const who of [teacher, accountant, coordinator]) await expect(run(who, `update schools set board_id = 'cisce' where school_id = $1`, [A]), who.role).rejects.toThrow(/only the principal, the school admin or NetCyberAI/);
    await expect(run(principal, `update schools set board_id = 'made-up' where school_id = $1`, [A])).rejects.toThrow(/foreign key/);
    // Who set it and when are the trigger's to write.
    await run(principal, `update schools set board_set_by = $2, board_set_at = now() - interval '9 days' where school_id = $1`, [A, ADMIN]);
    const row = (await db.pg.query(`select board_id, board_set_by, board_set_at > now() - interval '1 hour' as recent from schools where school_id = $1`, [A])).rows[0];
    expect(row).toEqual({ board_id: 'cbse', board_set_by: PRINCIPAL, recent: true });
    // Another school's row is not this principal's to change.
    expect((await run(principal, `update schools set board_id = 'cbse' where school_id = $1`, [C])).rowCount).toBe(0);
    const audit = (await db.pg.query(`select actor_user_id, after_state ->> 'board_id' as board from audit_log where event_action = 'school.board_set' and school_id = $1 order by audit_id`, [A])).rows;
    expect(audit).toEqual([{ actor_user_id: ADMIN, board: 'cisce' }, { actor_user_id: PRINCIPAL, board: 'cbse' }]);
  });
});

describe('a CBSE school starts from the CBSE preset and sees its source; it changes a band and the grade follows', () => {
  it('starts from the preset, sees where it came from and the gap the document prints, and saves version 1', async () => {
    const screen = (await as(principal, (c) => schemeScreen(c, actor(principal))))!;
    expect(screen).toMatchObject({ current: null, versions: [], mayEdit: true });
    const preset = presetOf(screen.boards, screen.board.boardId!, 'Classes IX-X');
    const draft = schemeFromPreset(preset);
    // The gaps the document prints are shown as copied from it, beside the board's own words.
    expect(gapsAsInPreset(draft, preset.bands)).toEqual([{ from: 0, to: 32, asInPreset: true }, { from: 41, to: 44, asInPreset: true }]);
    expect(grade(42, draft)).toMatchObject({ kind: 'no_grade', reason: 'no_band', rounded: 42 });
    expect(await save(principal, draft, preset.presetId, 0)).toEqual({ ok: true, version: 1 });
    const after = (await as(coordinator, (c) => schemeScreen(c, actor(coordinator))))!;
    expect(after.mayEdit).toBe(false);
    expect(after.current).toMatchObject({ version: 1, madeBy: 'Priya Principal', fromPresetId: preset.presetId, fromPreset: { sourceUrl: CBSE_URL, sourceTitle: preset.sourceTitle, boardName: 'Central Board of Secondary Education (CBSE)', replaced: false } });
    expect(grade(85, after.current!.scheme)).toMatchObject({ kind: 'grade', grade: 'A2' });
    expect(grade(80, after.current!.scheme)).toMatchObject({ kind: 'grade', grade: 'B1' });
    expect(passed({ percent: 32.4 }, after.current!.scheme)).toMatchObject({ kind: 'not_passed', rounded: 32 });
    expect(passed({ percent: 32.5 }, after.current!.scheme)).toEqual({ kind: 'passed', rounded: 33 });
  });

  it('changes a band and closes the gap: a new version, the grade follows, and version 1 is kept as it was', async () => {
    const v1 = (await as(admin, (c) => schemeInForce(c, A)))!;
    const next = structuredClone(v1.scheme);
    next.bands = next.bands.map((b) => (b.grade === 'A2' ? { ...b, from: 80 } : b.grade === 'B1' ? { ...b, to: 79 } : b.grade === 'C2' ? { ...b, from: 41 } : b));
    next.bands.push({ from: 0, to: 32, grade: 'E', meaning: 'Needs improvement' });
    expect(await save(admin, next, v1.fromPresetId, 1)).toEqual({ ok: true, version: 2 });
    const inForce = (await as(teacher, (c) => schemeInForce(c, A)))!; // teachers read it (from 9b, the class result's grades)
    expect(inForce.version).toBe(2);
    expect(grade(80, inForce.scheme)).toMatchObject({ kind: 'grade', grade: 'A2' });
    expect(grade(42, inForce.scheme)).toMatchObject({ kind: 'grade', grade: 'C2' });
    expect(bandProblems(inForce.scheme).gaps).toEqual([]);
    const kept = (await db.pg.query(`select scheme from grading_schemes where school_id = $1 and version = 1`, [A])).rows[0].scheme;
    expect(grade(80, kept)).toMatchObject({ kind: 'grade', grade: 'B1' });
    expect((await as(principal, (c) => schemeScreen(c, actor(principal))))!.versions.map((v) => [v.version, v.madeBy])).toEqual([[2, 'Asif Admin'], [1, 'Priya Principal']]);
    const audit = (await db.pg.query(`select actor_user_id, after_state ->> 'version' as version from audit_log where event_action = 'grading_scheme.saved' and school_id = $1 order by audit_id`, [A])).rows;
    expect(audit).toEqual([{ actor_user_id: PRINCIPAL, version: '1' }, { actor_user_id: ADMIN, version: '2' }]);
  });

  it('a save based on an older version saves nothing: the person is told someone saved meanwhile', async () => {
    const v2 = (await as(principal, (c) => schemeInForce(c, A)))!;
    expect(await save(principal, v2.scheme, null, 1)).toEqual({ ok: false, reason: 'newer_version' });
    expect(await save(principal, v2.scheme, null, 7)).toEqual({ ok: false, reason: 'newer_version' });
    expect((await as(principal, (c) => schemeInForce(c, A)))!.version).toBe(2);
  });

  it('only the principal and the school admin save; a scheme that breaks a rule is not saved', async () => {
    const v2 = (await as(principal, (c) => schemeInForce(c, A)))!;
    for (const who of [coordinator, teacher, accountant]) expect(await save(who, v2.scheme, null, 2), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    const overlap = structuredClone(v2.scheme);
    overlap.bands[1] = { ...overlap.bands[1], from: 79 };
    expect(await save(principal, overlap, null, 2)).toEqual({ ok: false, reason: 'band_overlap', at: 2 });
    const shares = structuredClone(v2.scheme);
    shares.components[0].share = 70;
    expect(await save(principal, shares, null, 2)).toEqual({ ok: false, reason: 'component_shares_total' });
    expect(await save(principal, v2.scheme, '9a000000-0000-4000-8000-00000000dead', 2)).toEqual({ ok: false, reason: 'preset' });
    expect((await as(principal, (c) => schemeInForce(c, A)))!.version).toBe(2);
  });

  it('the screen is for the principal, the school admin and the coordinator; a teacher and an accountant are refused', async () => {
    for (const who of [principal, admin, coordinator]) expect(await as(who, (c) => schemeScreen(c, actor(who))), who.role).not.toBeNull();
    for (const who of [teacher, accountant]) expect(await as(who, (c) => schemeScreen(c, actor(who))), who.role).toBeNull();
  });
});

describe('a CISCE school sees the grades and pass mark of the Regulations and is asked for the mark ranges', () => {
  it('starts from ICSE: grades 1 to 9 and their meanings, pass mark 33, and no grade until the school enters ranges', async () => {
    const screen = (await as(cPrincipal, (c) => schemeScreen(c, actor(cPrincipal))))!;
    expect(screen.board.boardId).toBe('cisce');
    const icse = presetOf(screen.boards, 'cisce', 'ICSE (Class X)');
    const draft = schemeFromPreset(icse);
    expect(draft.passMark).toBe(33);
    expect(draft.layout.coScholastic).toBe(true);
    // Asked for the ranges: every grade is listed as having none, and no percent gets a grade yet.
    expect(bandProblems(draft)).toEqual({ gaps: [], overlaps: [], unranged: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] });
    expect(grade(72, draft)).toMatchObject({ kind: 'no_grade', reason: 'no_ranges' });
    // The pass mark of the Regulations still decides a pass.
    expect(passed({ percent: 40 }, draft)).toEqual({ kind: 'passed', rounded: 40 });
    expect(passed({ percent: 30 }, draft)).toMatchObject({ kind: 'not_passed' });
    // A range for some grades and not others is not saved, by the app or the database.
    const some = structuredClone(draft);
    some.bands[0] = { ...some.bands[0], from: 90, to: 100 };
    expect(await save(cPrincipal, some, icse.presetId, 0)).toEqual({ ok: false, reason: 'band_mixed', at: 1 });
    await expect(run(cPrincipal, `insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [C, JSON.stringify(some), C_PRINCIPAL])).rejects.toThrow(/every band has a range, or none has/);
    // Saved as the Regulations have it: marks only, no grade.
    expect(await save(cPrincipal, draft, icse.presetId, 0)).toEqual({ ok: true, version: 1 });
    // The school enters the ranges it uses: then the grades follow.
    const withRanges = structuredClone(draft);
    const tops = [100, 89, 79, 69, 59, 49, 39, 32, 19];
    withRanges.bands = withRanges.bands.map((b, i) => ({ ...b, to: tops[i], from: i === 8 ? 0 : tops[i + 1] + 1 }));
    expect(bandProblems(withRanges)).toEqual({ gaps: [], overlaps: [], unranged: [] });
    expect(await save(cPrincipal, withRanges, icse.presetId, 1)).toEqual({ ok: true, version: 2 });
    const inForce = (await as(cPrincipal, (c) => schemeInForce(c, C)))!;
    expect(grade(72, inForce.scheme)).toMatchObject({ kind: 'grade', grade: '3', meaning: 'Pass with credit' });
    expect(grade(33, inForce.scheme)).toMatchObject({ kind: 'grade', grade: '7', meaning: 'Pass' });
  });

  it('a school reads only its own scheme', async () => {
    expect((await run(cPrincipal, `select school_id from grading_schemes`)).rows.every((r) => r.school_id === C)).toBe(true);
    expect((await run(principal, `select school_id from grading_schemes`)).rows.every((r) => r.school_id === A)).toBe(true);
    // Into another school: refused (the policies; the version is the first the writer can see there).
    await expect(run(cPrincipal, `insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(emptyScheme()), C_PRINCIPAL])).rejects.toThrow(/row-level security/);
  });
});

describe('Control adds a state board preset with its circular’s URL, and a school of that board starts from it', () => {
  let first = '';
  let second = '';
  const presetBody = (extra: Record<string, unknown> = {}) => ({
    boardId: 'example-state',
    level: 'Classes IX-X',
    sourceTitle: 'Circular 12 of 2026: grading in secondary classes (made up for this test)',
    sourceUrl: CIRCULAR_URL,
    sourceReadOn: '2026-10-14',
    bands: [
      { from: 75, to: 100, grade: 'Distinction', meaning: null },
      { from: 60, to: 74, grade: 'First', meaning: null },
      { from: 33, to: 59, grade: 'Pass', meaning: null },
    ],
    passMark: 33,
    components: [],
    coScholastic: null,
    notes: [{ about: 'bands', text: 'The circular gives no grade below 33.' }],
    ...extra,
  });

  it('a board and its preset are added in Control, with who and when; the circular’s URL is required', async () => {
    expect(await platform((c) => addBoard(c, founder, { boardId: 'example-state', name: 'Example State Board' }))).toEqual({ ok: true, boardId: 'example-state' });
    expect(await platform((c) => addBoard(c, founder, { boardId: 'example-state', name: 'Another' }))).toEqual({ ok: false, reason: 'id_taken' });
    expect(await platform((c) => addBoard(c, founder, { boardId: 'other', name: 'example state board' }))).toEqual({ ok: false, reason: 'name_taken' });
    expect(await platform((c) => addPreset(c, founder, presetBody({ sourceUrl: '' })))).toEqual({ ok: false, reason: 'source_url' });
    expect(await platform((c) => addPreset(c, founder, presetBody({ sourceUrl: 'http://example.invalid/circular.pdf' })))).toEqual({ ok: false, reason: 'source_url' });
    expect(await platform((c) => addPreset(c, founder, presetBody({ sourceTitle: ' ' })))).toEqual({ ok: false, reason: 'source_title' });
    expect(await platform((c) => addPreset(c, founder, presetBody({ bands: [] })))).toEqual({ ok: false, reason: 'band_grade', at: 0 });
    expect(await platform((c) => addPreset(c, founder, presetBody({ boardId: 'nowhere' })))).toEqual({ ok: false, reason: 'no_board' });
    const made = await platform((c) => addPreset(c, founder, presetBody()));
    expect(made.ok).toBe(true);
    first = (made as { presetId: string }).presetId;
    const control = (await platform((c) => controlBoards(c))).find((b) => b.boardId === 'example-state')!;
    expect(control).toMatchObject({ name: 'Example State Board', addedBy: 'Farid Founder', schools: 0 });
    expect(control.presets[0]).toMatchObject({ presetId: first, sourceUrl: CIRCULAR_URL, addedBy: 'Farid Founder', replacedBy: null });
    const audit = (await db.pg.query(`select event_action, actor_user_id, school_id from audit_log where event_action in ('board.added', 'board_preset.added') order by audit_id`)).rows;
    expect(audit).toEqual([{ event_action: 'board.added', actor_user_id: FOUNDER, school_id: null }, { event_action: 'board_preset.added', actor_user_id: FOUNDER, school_id: null }]);
  });

  it('Control records the school’s board; the school starts from that board’s preset and saves', async () => {
    expect(await platform((c) => setSchoolBoard(c, { userId: FOUNDER, role: 'super_admin' }, S, 'example-state'))).toEqual({ ok: true, changed: true });
    const screen = (await as(sPrincipal, (c) => schemeScreen(c, actor(sPrincipal))))!;
    expect(screen.board).toMatchObject({ boardId: 'example-state', name: 'Example State Board' });
    const preset = presetOf(screen.boards, 'example-state', 'Classes IX-X');
    expect(preset).toMatchObject({ presetId: first, sourceUrl: CIRCULAR_URL });
    const draft = schemeFromPreset(preset);
    expect(grade(80, draft)).toMatchObject({ kind: 'grade', grade: 'Distinction' });
    expect(await save(sPrincipal, draft, preset.presetId, 0)).toEqual({ ok: true, version: 1 });
    expect((await as(sPrincipal, (c) => schemeScreen(c, actor(sPrincipal))))!.current).toMatchObject({ version: 1, fromPreset: { presetId: first, sourceUrl: CIRCULAR_URL } });
  });

  it('a preset is never changed: a new one replaces it, the old one stays on record, and a school keeps what it saved', async () => {
    const made = await platform((c) => addPreset(c, founder, presetBody({ replacesPresetId: first, sourceTitle: 'Circular 15 of 2026 (made up)', bands: [{ from: 75, to: 100, grade: 'Distinction', meaning: null }, { from: 33, to: 74, grade: 'Pass', meaning: null }] })));
    expect(made.ok).toBe(true);
    second = (made as { presetId: string }).presetId;
    expect(await platform((c) => addPreset(c, founder, presetBody({ replacesPresetId: first })))).toEqual({ ok: false, reason: 'replaced_already' });
    expect(await platform((c) => addPreset(c, founder, presetBody({ boardId: 'cbse', replacesPresetId: first })))).toEqual({ ok: false, reason: 'replaces_other_board' });
    const screen = (await as(sPrincipal, (c) => schemeScreen(c, actor(sPrincipal))))!;
    expect(screen.boards.find((b) => b.boardId === 'example-state')!.presets.map((p) => p.presetId)).toEqual([second]);
    expect(screen.current!.fromPreset).toMatchObject({ presetId: first, replaced: true });
    const control = (await platform((c) => controlBoards(c))).find((b) => b.boardId === 'example-state')!;
    expect(control.presets.map((p) => [p.presetId, p.replacedBy])).toEqual([[first, second], [second, null]]);
    expect(control.schools).toBe(1);
  });
});

describe('the database refuses what the app does not do', () => {
  it('a school’s session reads boards and presets and cannot write them; the platform role only adds', async () => {
    for (const who of [principal, teacher, accountant]) {
      await expect(run(who, `insert into boards (board_id, name, added_by) values ('x-board', 'X', $1)`, [who.user]), who.role).rejects.toThrow(/permission denied/);
      await expect(run(who, `update board_presets set pass_mark = 40`), who.role).rejects.toThrow(/permission denied/);
      await expect(run(who, `delete from board_presets`), who.role).rejects.toThrow(/permission denied/);
    }
    await expect(platform((c) => c.query(`update board_presets set pass_mark = 40`))).rejects.toThrow(/permission denied/);
    await expect(platform((c) => c.query(`delete from board_presets`))).rejects.toThrow(/permission denied/);
    await expect(platform((c) => c.query(`update boards set name = 'X'`))).rejects.toThrow(/permission denied/);
    // Even the owner cannot change a preset in place.
    await expect(db.pg.query(`update board_presets set pass_mark = 40 where board_id = 'cbse'`)).rejects.toThrow(/never changed or removed/);
    await expect(db.pg.query(`delete from boards where board_id = 'cbse'`)).rejects.toThrow(/never changed or removed/);
    // A row with nobody's name, an address that is not https, bands that share a percent: refused.
    const insert = (sql: string) => platform((c) => c.query(sql));
    const base = `insert into board_presets (board_id, level, source_title, source_url, source_read_on, bands, pass_mark, added_by)`;
    await expect(insert(`${base} values ('cbse', 'X', 'T', 'https://example.invalid/a.pdf', '2026-10-14', '[{"from": 0, "to": 100, "grade": "P", "meaning": null}]', 33, null)`)).rejects.toThrow(/says who added it/);
    await expect(insert(`${base} values ('cbse', 'X', 'T', 'http://example.invalid/a.pdf', '2026-10-14', '[{"from": 0, "to": 100, "grade": "P", "meaning": null}]', 33, '${FOUNDER}')`)).rejects.toThrow(/check constraint/);
    await expect(insert(`${base} values ('cbse', 'X', 'T', 'https://example.invalid/a.pdf', '2026-10-14', '[{"from": 0, "to": 50, "grade": "P", "meaning": null}, {"from": 50, "to": 100, "grade": "Q", "meaning": null}]', 33, '${FOUNDER}')`)).rejects.toThrow(/share a percent/);
    await expect(insert(`${base} values ('cbse', 'X', 'T', 'https://example.invalid/a.pdf', '2026-10-14', '[{"from": 0, "to": 50, "grade": "P", "meaning": null}]', 101, '${FOUNDER}')`)).rejects.toThrow(/check constraint/);
    // The board of a school is set by the platform only for a NetCyberAI staff session.
    await expect(platform((c) => c.query(`update schools set board_id = 'cbse' where school_id = $1`, [S]), false)).rejects.toThrow(/only the principal, the school admin or NetCyberAI/);
  });

  it('a saved version is never changed or removed, and only the next version is written, by the office in its own name', async () => {
    const scheme = JSON.stringify((await as(principal, (c) => schemeInForce(c, A)))!.scheme);
    await expect(run(principal, `update grading_schemes set scheme = scheme where school_id = $1`, [A])).rejects.toThrow(/permission denied/);
    await expect(run(principal, `delete from grading_schemes where school_id = $1`, [A])).rejects.toThrow(/permission denied/);
    await expect(db.pg.query(`update grading_schemes set version = version where school_id = $1`, [A])).rejects.toThrow(/never changed or removed/);
    const ins = (who: Who, version: number, made: string, body = scheme) => run(who, `insert into grading_schemes (school_id, version, scheme, made_by) values ($1, $2, $3::jsonb, $4)`, [A, version, body, made]);
    for (const who of [teacher, coordinator]) await expect(ins(who, 3, who.user), who.role).rejects.toThrow(/row-level security/);
    // The accountant reads no version, so the first is the next one it could name: refused all the same.
    await expect(ins(accountant, 1, ACCOUNTANT)).rejects.toThrow(/row-level security/);
    await expect(ins(accountant, 3, ACCOUNTANT)).rejects.toThrow(/right after the latest one/);
    await expect(ins(principal, 3, ADMIN)).rejects.toThrow(/row-level security/); // in someone else's name
    await expect(ins(principal, 5, PRINCIPAL)).rejects.toThrow(/right after the latest one/);
    await expect(ins(principal, 2, PRINCIPAL)).rejects.toThrow(/right after the latest one/);
    const bad = (change: (s: GradingScheme) => void) => {
      const s = JSON.parse(scheme) as GradingScheme;
      change(s);
      return JSON.stringify(s);
    };
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.bands[1].from = 79)))).rejects.toThrow(/share a percent/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.components[0].share = 70)))).rejects.toThrow(/add up to 100/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.passMark = 120)))).rejects.toThrow(/within 0 to 100/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => ((s as { decimals: number }).decimals = 2)))).rejects.toThrow(/whole number or to one decimal place/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.bands[0].grade = ' ')))).rejects.toThrow(/every band has a grade/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.bands[0].to = 120)))).rejects.toThrow(/within 0 to 100/);
    await expect(ins(principal, 3, PRINCIPAL, bad((s) => (s.bands[1].grade = 'A1')))).rejects.toThrow(/same grade/);
    expect((await ins(principal, 3, PRINCIPAL)).rowCount).toBe(1);
  });

  it('the accountant reads no scheme, the teacher and the coordinator read their school’s, and the platform role reads nothing', async () => {
    expect((await run(accountant, `select * from grading_schemes`)).rows).toEqual([]);
    expect((await run(teacher, `select version from grading_schemes order by version`)).rows.map((r) => r.version)).toEqual([1, 2, 3]);
    expect((await run(coordinator, `select version from grading_schemes order by version`)).rows.length).toBe(3);
    await expect(platform((c) => c.query(`select * from grading_schemes`))).rejects.toThrow(/permission denied/);
  });
});

describe('the routes', () => {
  const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
  const staff = { sub: FOUNDER, role: 'super_admin', schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: u(82) };
  const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (who: any, fn: () => Promise<Response>) => {
    state.claims = who;
    const res = await fn();
    return { status: res.status, body: await res.json() };
  };
  beforeAll(() => {
    state.tenant = (c: { role: string; sub: string; schoolId: string | null }, fn: (x: unknown) => Promise<unknown>) =>
      c.role === 'super_admin' ? platform(fn) : as({ role: c.role, user: c.sub, school: c.schoolId! }, fn);
  });

  it('each route is guarded by the Exams switch, and an unknown path is not waved through', async () => {
    expect(writeModuleFor('/api/app/exams/scheme')).toBe('exams');
    expect(readModuleFor('/api/app/exams/scheme')).toBe('exams');
    expect(workingModules()).toContain('exams');
    await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await call(claims(principal), () => getScheme(req('GET', '/api/app/exams/scheme')))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    expect(await call(claims(principal), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'board', boardId: 'cisce' })))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'exams'`, [A]);
  });

  it('the school screen: read by the office and the coordinator, saved by the office', async () => {
    const got = await call(claims(coordinator), () => getScheme(req('GET', '/api/app/exams/scheme')));
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ mayEdit: false, board: { boardId: 'cbse' }, current: { version: 3 } });
    for (const who of [teacher, accountant]) expect(await call(claims(who), () => getScheme(req('GET', '/api/app/exams/scheme'))), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    const scheme = got.body.current.scheme;
    expect(await call(claims(coordinator), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'save', scheme, fromPresetId: null, basedOn: 3 })))).toMatchObject({ status: 403 });
    expect(await call(claims(principal), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'save', scheme, fromPresetId: null, basedOn: 2 })))).toMatchObject({ status: 409, body: { code: 'newer_version' } });
    expect(await call(claims(principal), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'save', scheme: { ...scheme, decimals: 3 }, fromPresetId: null, basedOn: 3 })))).toMatchObject({ status: 400, body: { code: 'decimals' } });
    expect(await call(claims(principal), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'save', scheme, fromPresetId: null, basedOn: 3 })))).toEqual({ status: 201, body: { ok: true, version: 4 } });
    expect(await call(claims(admin), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'board', boardId: 'cbse' })))).toEqual({ status: 200, body: { ok: true, changed: false } });
    expect(await call(claims(admin), () => postScheme(req('POST', '/api/app/exams/scheme', { action: 'something' })))).toMatchObject({ status: 400 });
  });

  it('Control: NetCyberAI staff only; boards, presets and a school’s board', async () => {
    expect((await call(claims(principal), () => getBoards(req('GET', '/api/control/boards')))).status).toBe(403);
    expect((await call(claims(principal), () => postBoards(req('POST', '/api/control/boards', { action: 'board', boardId: 'zz-board', name: 'ZZ' })))).status).toBe(403);
    expect((await call(claims(principal), () => postSchoolBoard(req('POST', `/api/control/boards/schools/${A}`, { boardId: null }), { params: { schoolId: A } }))).status).toBe(403);
    const list = await call(staff, () => getBoards(req('GET', '/api/control/boards')));
    expect(list.status).toBe(200);
    expect(list.body.boards.map((b: { boardId: string }) => b.boardId)).toEqual(['cbse', 'cisce', 'example-state']);
    expect(await call(staff, () => postBoards(req('POST', '/api/control/boards', { action: 'board', boardId: 'Bad Id', name: 'X' })))).toMatchObject({ status: 400, body: { code: 'board_id' } });
    expect(await call(staff, () => postBoards(req('POST', '/api/control/boards', { action: 'preset', boardId: 'example-state', level: 'Class XII', sourceTitle: 'T', sourceUrl: 'ftp://x', sourceReadOn: '2026-10-14', bands: [{ from: 0, to: 100, grade: 'P', meaning: null }] })))).toMatchObject({ status: 400, body: { code: 'source_url' } });
    expect(await call(staff, () => getSchoolBoard(req('GET', `/api/control/boards/schools/${C}`), { params: { schoolId: C } }))).toMatchObject({ status: 200, body: { board: { boardId: 'cisce' } } });
    expect(await call(staff, () => postSchoolBoard(req('POST', `/api/control/boards/schools/${C}`, { boardId: 'example-state' }), { params: { schoolId: C } }))).toEqual({ status: 200, body: { ok: true, changed: true } });
    expect(await call(staff, () => postSchoolBoard(req('POST', `/api/control/boards/schools/${C}`, { boardId: 'no-such' }), { params: { schoolId: C } }))).toMatchObject({ status: 400, body: { code: 'no_board' } });
    expect(await call(staff, () => postSchoolBoard(req('POST', `/api/control/boards/schools/${C}`, { boardId: 5 }), { params: { schoolId: C } }))).toMatchObject({ status: 400 });
    const audit = (await db.pg.query(`select actor_role::text as role, after_state ->> 'board_id' as board from audit_log where event_action = 'school.board_set' and school_id = $1 order by audit_id desc limit 1`, [C])).rows[0];
    expect(audit).toEqual({ role: 'super_admin', board: 'example-state' });
  });
});

describe('My Day', () => {
  const provider = TODAY_PROVIDERS.find((p) => p.type === 'grading-scheme')!;
  const cards = (who: Who) => as(who, (c) => provider.load(c, { schoolId: who.school, userId: who.user, role: who.role as never, sunday: false }));

  it('the principal and the school admin are asked to set up the scheme until it has a version; nobody else is', async () => {
    expect(provider).toMatchObject({ moduleId: 'exams', roles: ['principal', 'school_admin'] });
    const fresh: Who = { role: 'principal', user: S_PRINCIPAL, school: S };
    expect(await cards(fresh)).toEqual([]); // School S saved a version above
    await db.pg.exec(`insert into schools (school_id, name, jurisdiction) values ('${u(4)}', 'School N', 'IN-HR'); insert into users (user_id, school_id, email, role, display_name, is_active) values ('${u(41)}', '${u(4)}', 'p@school-n.example', 'principal', 'Nidhi Principal', true);`);
    expect(await cards({ role: 'principal', user: u(41), school: u(4) })).toEqual([{ id: 'grading-scheme', type: 'grading-scheme', moduleId: 'exams', state: 'todo', count: 1, href: '/app/exams/scheme' }]);
  });
});

describe('the migration', () => {
  it('ends by switching Exams on for every school there is, keeping a school’s own choice', async () => {
    const dir = path.join(ROOT, 'supabase/migrations');
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_p6_boards_grading.sql'))!), 'utf8');
    const last = sql.slice(sql.lastIndexOf('insert into school_module_entitlements'));
    expect(last).toContain(`'exams', true, 'plan'`);
    await db.pg.query(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'exams'`, [C]);
    await db.pg.exec(last);
    const on = (await db.pg.query(`select school_id, enabled from school_module_entitlements where module_id = 'exams' and school_id in ($1, $2, $3) order by school_id`, [A, C, u(4)])).rows;
    expect(on).toEqual([{ school_id: A, enabled: true }, { school_id: C, enabled: false }, { school_id: u(4), enabled: true }]);
  });
});
