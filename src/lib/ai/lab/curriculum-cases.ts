import { createHash } from 'crypto';
import type { Sql } from '@/lib/jobs/types';
import type { LabCase, LabCaseSummary, LabCaseTags } from './cases';

// The Quality Lab's cases from the syllabus (W9-D, docs/39 §3 and §4). For each unit of a published syllabus, and each
// question type that fits its subject, a case whose question is written from the unit and topic titles by a fixed
// template per type and language (English and Hindi). Deterministic and free: no model is called here, and the same
// syllabus always gives the same cases. A case's key is 'cur-' and sixteen hex digits of its board, class, subject, unit,
// type, language and the template's version, so adding a set again inserts nothing; the key is the case id a run names.
// Cases are stored in control.ai_eval_cases and run by the Lab like any other case. Syllabus titles only: never
// textbook text, never a child's words.

export const CURRICULUM_TEMPLATE_VERSION = 'v1';
export const CURRICULUM_TYPES = ['definition', 'concept', 'comparison', 'application', 'problem', 'derivation', 'history', 'case'] as const;
export type CurriculumType = (typeof CURRICULUM_TYPES)[number];
export type Band = 'lkg_1' | 'c2_5' | 'c6_8' | 'c9_10' | 'c11_12';

// The most one request adds, so a route never outlives its time; narrow by class or subject for more.
export const CURRICULUM_MAX_ADD = 3000;
// The most the Lab screen lists at once (the newest); a run takes at most 200 cases.
export const CURRICULUM_LIST_MAX = 300;

const MATHS_SCIENCE = new Set(['mathematics', 'science', 'physics', 'chemistry', 'biology']);
const SOCIAL = new Set(['social_science', 'history', 'geography', 'political_science', 'economics', 'sociology']);

// Definition and concept everywhere; problem and derivation for Mathematics and Science; history and case for Social
// Science; comparison and application everywhere.
export function fittingTypes(subject: string): CurriculumType[] {
  return CURRICULUM_TYPES.filter((t) => {
    if (t === 'problem' || t === 'derivation') return MATHS_SCIENCE.has(subject);
    if (t === 'history' || t === 'case') return SOCIAL.has(subject);
    return true;
  });
}

// The band comes from the class, as docs/39 §3 says (class 1 is the first band; the syllabus starts there).
export function bandOf(classLevel: number): Band {
  return classLevel <= 1 ? 'lkg_1' : classLevel <= 5 ? 'c2_5' : classLevel <= 8 ? 'c6_8' : classLevel <= 10 ? 'c9_10' : 'c11_12';
}
const BAND_RULE: Record<Band, string> = {
  lkg_1: 'Use at most 60 words, very simple words and one picture idea.',
  c2_5: 'Use at most 150 words, a short story or example and one check question.',
  c6_8: 'Use 150 to 350 words, give the reasoning, name a common misconception, then one check and one practice question.',
  c9_10: 'Give formulas where they apply, a worked problem and an exam-style question.',
  c11_12: 'Be rigorous: derive results, work numericals and state the conditions.',
};

type Unit = { boardId: string; classLevel: number; subject: string; unitKey: string; position: number; titleEn: string; titleHi: string | null; topics: { en: string; hi: string | null }[] };

const QUESTION: Record<'en' | 'hi', Record<CurriculumType, (t: string, t2: string, u: string) => string>> = {
  en: {
    definition: (t) => `What is ${t}? Define it in simple words.`,
    concept: (t, _t2, u) => `Explain the main idea of "${u}", starting with ${t}.`,
    comparison: (t, t2, u) => (t === t2 ? `Compare the main ideas in "${u}".` : `How are ${t} and ${t2} alike, and how are they different?`),
    application: (t) => `Where do we use ${t} in everyday life? Give two examples.`,
    problem: (t, _t2, u) => `Give me a practice problem on ${t} from "${u}" and solve it step by step.`,
    derivation: (t, _t2, u) => `Show how the main result of "${u}" is derived, step by step, starting from ${t}.`,
    history: (t) => `Tell me the story of ${t}: what happened, when, and why it matters.`,
    case: (t, _t2, u) => `Take a real situation connected with ${t} from "${u}" and explain what it teaches us.`,
  },
  hi: {
    definition: (t) => `${t} क्या है? इसे आसान शब्दों में समझाइए।`,
    concept: (t, _t2, u) => `"${u}" का मुख्य विचार समझाइए, ${t} से शुरू करके।`,
    comparison: (t, t2, u) => (t === t2 ? `"${u}" के मुख्य विचारों की तुलना कीजिए।` : `${t} और ${t2} में क्या समानता है और क्या अंतर है?`),
    application: (t) => `रोज़मर्रा के जीवन में ${t} का उपयोग कहाँ होता है? दो उदाहरण दीजिए।`,
    problem: (t, _t2, u) => `"${u}" से ${t} पर एक अभ्यास-प्रश्न दीजिए और उसे चरण-दर-चरण हल कीजिए।`,
    derivation: (t, _t2, u) => `"${u}" के मुख्य परिणाम को ${t} से शुरू करके चरण-दर-चरण सिद्ध कीजिए।`,
    history: (t) => `${t} की कहानी बताइए: क्या हुआ, कब हुआ और यह क्यों महत्वपूर्ण है।`,
    case: (t, _t2, u) => `"${u}" में ${t} से जुड़ी एक वास्तविक स्थिति लेकर समझाइए कि उससे हमें क्या सीख मिलती है।`,
  },
};

const BAND_LABEL: Record<Band, string> = { lkg_1: 'LKG to class 1', c2_5: 'classes 2 to 5', c6_8: 'classes 6 to 8', c9_10: 'classes 9 and 10', c11_12: 'classes 11 and 12' };

const RUBRIC: Record<CurriculumType, string> = {
  definition: 'Gives a correct definition in one or two plain sentences.',
  concept: 'Explains the idea correctly, in order, without skipping the reason.',
  comparison: 'Names real likenesses and real differences, and none that are wrong.',
  application: 'Gives two true examples from daily life that fit the idea.',
  problem: 'Sets a fair problem for the class and solves it correctly, step by step.',
  derivation: 'Each step follows from the one before and the result is correct.',
  history: 'The events, order and dates are correct and the reason it matters is clear.',
  case: 'The situation is real or plausible, and the lesson drawn from it is correct.',
};

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// The case key: stable for a unit, type and language, whatever the unit's title says later.
export function curriculumKey(u: { boardId: string; classLevel: number; subject: string; unitKey: string }, type: CurriculumType, lang: 'en' | 'hi'): string {
  return `cur-${createHash('sha256').update([CURRICULUM_TEMPLATE_VERSION, u.boardId, u.classLevel, u.subject, u.unitKey, type, lang].join('|')).digest('hex').slice(0, 16)}`;
}

export type CurriculumOptions = { boardId: string; classLevel?: number | null; subject?: string | null; perUnit?: number | null; languages?: readonly ('en' | 'hi')[] };

// Pure: the cases for these units. perUnit is the most question types a unit gets (default all that fit); fewer than
// all rotate with the unit's position, so a short set still touches every type across a subject.
export function buildCurriculumCases(units: readonly Unit[], opts: Pick<CurriculumOptions, 'perUnit' | 'languages'> = {}): LabCase[] {
  const languages = opts.languages ?? (['en', 'hi'] as const);
  const out: LabCase[] = [];
  for (const u of units) {
    const fitting = fittingTypes(u.subject);
    const n = opts.perUnit && opts.perUnit > 0 ? Math.min(opts.perUnit, fitting.length) : fitting.length;
    const types = n >= fitting.length ? fitting : Array.from({ length: n }, (_, i) => fitting[(u.position + i) % fitting.length]);
    const band = bandOf(u.classLevel);
    for (const type of types) {
      for (const lang of languages) {
        const unitTitle = lang === 'hi' ? u.titleHi ?? u.titleEn : u.titleEn;
        const topic = (i: number) => (u.topics[i] ? (lang === 'hi' ? u.topics[i].hi ?? u.topics[i].en : u.topics[i].en) : unitTitle);
        const tags: LabCaseTags = { board: u.boardId, classLevel: u.classLevel, subject: u.subject, unit: u.unitKey, type, band };
        out.push({
          id: curriculumKey(u, type, lang),
          area: 'curriculum',
          language: lang,
          system: `You are a ${titleCase(u.subject)} tutor for a Class ${u.classLevel} ${u.boardId} student. ${BAND_RULE[band]} Answer in ${lang === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.`,
          messages: [{ role: 'user', content: QUESTION[lang][type](topic(0), topic(1), unitTitle) }],
          expect: 'text',
          maxTokens: 900,
          rubric: [RUBRIC[type], `Pitched for ${BAND_LABEL[band]}: ${BAND_RULE[band]}`, lang === 'hi' ? 'Written in Hindi in Devanagari, with correct terms.' : 'Written in clear English with correct terms.'],
          tags,
        });
      }
    }
  }
  return out;
}

// The syllabus units (with their first topics) of the published syllabi that match, in syllabus order.
async function loadUnits(db: Sql, o: CurriculumOptions): Promise<Unit[]> {
  const args = [o.boardId, o.classLevel ?? null, o.subject ?? null];
  const where = `where v.status = 'published' and v.board_id = $1 and ($2::int is null or v.class_level = $2) and ($3::text is null or v.subject = $3)`;
  const units = (
    await db.query(
      `select u.unit_id, v.board_id, v.class_level, v.subject, u.unit_key, u.position, u.title_en, u.title_hi
         from content.units u join content.syllabus_versions v on v.version_id = u.version_id
        ${where} order by v.class_level, v.subject, u.position, u.unit_key`,
      args
    )
  ).rows;
  const topics = (
    await db.query(
      `select c.unit_id, t.title_en, t.title_hi
         from content.topics t join content.chapters c on c.chapter_id = t.chapter_id join content.syllabus_versions v on v.version_id = c.version_id
        ${where} and c.unit_id is not null order by c.unit_id, c.position, t.position`,
      args
    )
  ).rows;
  const byUnit = new Map<string, { en: string; hi: string | null }[]>();
  for (const t of topics) {
    const list = byUnit.get(String(t.unit_id)) ?? [];
    if (list.length < 2) list.push({ en: String(t.title_en), hi: t.title_hi ? String(t.title_hi) : null });
    byUnit.set(String(t.unit_id), list);
  }
  return units.map((r) => ({
    boardId: String(r.board_id),
    classLevel: Number(r.class_level),
    subject: String(r.subject),
    unitKey: String(r.unit_key),
    position: Number(r.position),
    titleEn: String(r.title_en),
    titleHi: r.title_hi ? String(r.title_hi) : null,
    topics: byUnit.get(String(r.unit_id)) ?? [],
  }));
}

// The cases for a board (and class and subject), built from the syllabus and not yet stored.
export async function curriculumCases(db: Sql, opts: CurriculumOptions): Promise<LabCase[]> {
  return buildCurriculumCases(await loadUnits(db, opts), opts);
}

export type AddResult = { ok: true; units: number; added: number; skipped: number } | { ok: false; code: 'request' | 'too_many' };

// Stores the cases a request describes; one already stored (same key) is skipped, never changed.
export async function addCurriculumCases(db: Sql, by: { userId: string }, opts: CurriculumOptions): Promise<AddResult> {
  if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(opts.boardId)) return { ok: false, code: 'request' };
  if (opts.classLevel != null && !(Number.isInteger(opts.classLevel) && opts.classLevel >= 1 && opts.classLevel <= 12)) return { ok: false, code: 'request' };
  if (opts.subject != null && !/^[a-z][a-z_]{1,39}$/.test(opts.subject)) return { ok: false, code: 'request' };
  if (opts.perUnit != null && !(Number.isInteger(opts.perUnit) && opts.perUnit >= 1 && opts.perUnit <= CURRICULUM_TYPES.length)) return { ok: false, code: 'request' };
  const units = await loadUnits(db, opts);
  const cases = buildCurriculumCases(units, opts);
  if (cases.length > CURRICULUM_MAX_ADD) return { ok: false, code: 'too_many' };
  let added = 0;
  for (let i = 0; i < cases.length; i += 200) {
    const rows = cases.slice(i, i + 200).map((c) => ({
      case_key: c.id,
      board_id: c.tags!.board,
      class_level: c.tags!.classLevel,
      subject: c.tags!.subject,
      unit_key: c.tags!.unit,
      question_type: c.tags!.type,
      band: c.tags!.band,
      language: c.language,
      spec: { system: c.system, messages: c.messages, expect: c.expect, maxTokens: c.maxTokens, rubric: c.rubric, tags: c.tags },
    }));
    const r = await db.query(
      `insert into control.ai_eval_cases (case_key, board_id, class_level, subject, unit_key, question_type, band, language, spec, created_by)
       select x->>'case_key', x->>'board_id', (x->>'class_level')::smallint, x->>'subject', x->>'unit_key', x->>'question_type', x->>'band', x->>'language', x->'spec', $2
         from jsonb_array_elements($1::jsonb) x
       on conflict (case_key) do nothing returning case_key`,
      [JSON.stringify(rows), by.userId]
    );
    added += r.rows.length;
  }
  return { ok: true, units: units.length, added, skipped: cases.length - added };
}

type Row = { case_key: unknown; language: unknown; spec: unknown };
function fromRow(r: Row): LabCase | null {
  const s = r.spec as Partial<LabCase> | null;
  const lang = r.language === 'hi' ? 'hi' : r.language === 'en' ? 'en' : null;
  if (!s || !lang || typeof s.system !== 'string' || !Array.isArray(s.messages) || s.messages.length === 0 || !Array.isArray(s.rubric)) return null;
  return {
    id: String(r.case_key),
    area: 'curriculum',
    language: lang,
    system: s.system,
    messages: s.messages,
    expect: 'text',
    ...(typeof s.maxTokens === 'number' ? { maxTokens: s.maxTokens } : {}),
    rubric: s.rubric,
    ...(s.tags ? { tags: s.tags } : {}),
  };
}

// One stored case for a run (the Lab's store asks for the ids a run names).
export async function curriculumCase(db: Sql, id: string): Promise<LabCase | null> {
  if (!/^cur-[a-f0-9]{16}$/.test(id)) return null;
  const r = (await db.query(`select case_key, language, spec from control.ai_eval_cases where case_key = $1`, [id])).rows[0];
  return r ? fromRow(r) : null;
}

// Which of these ids are stored cases (a run may name only known ones).
export async function storedCurriculumIds(db: Sql, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const r = await db.query(`select case_key from control.ai_eval_cases where case_key = any($1::text[])`, [ids]);
  return new Set(r.rows.map((x) => String(x.case_key)));
}

export type CurriculumList = { cases: LabCaseSummary[]; total: number; scopes: { boardId: string; classLevel: number; subject: string }[] };

// What the Lab screen lists: the newest stored cases (a run takes at most 200), how many are stored, and the published
// syllabi a set can be added for.
export async function curriculumList(db: Sql): Promise<CurriculumList> {
  // Before the table exists (its migration not yet applied) the Lab shows no curriculum cases rather than failing.
  if ((await db.query(`select to_regclass('control.ai_eval_cases') as t`)).rows[0]?.t == null) return { cases: [], total: 0, scopes: [] };
  const rows = (await db.query(`select case_key, language, spec from control.ai_eval_cases order by created_at desc, case_key limit ${CURRICULUM_LIST_MAX}`)).rows;
  const total = Number((await db.query(`select count(*)::int as n from control.ai_eval_cases`)).rows[0]?.n ?? 0);
  const scopes = (await db.query(`select board_id, class_level, subject from content.syllabus_versions where status = 'published' group by 1, 2, 3 order by 1, 2, 3`)).rows;
  const cases = rows.flatMap((r) => {
    const c = fromRow(r);
    return c ? [{ id: c.id, area: c.area, language: c.language, expect: c.expect, ask: c.messages[c.messages.length - 1].content.slice(0, 200), rubric: c.rubric, turns: c.messages.length }] : [];
  });
  return { cases, total, scopes: scopes.map((s) => ({ boardId: String(s.board_id), classLevel: Number(s.class_level), subject: String(s.subject) })) };
}
