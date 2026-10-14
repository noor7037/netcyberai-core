import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { changedFields, checkStaff, emptyQualification, FIELD_MAX, gapCode, GAP_CODES, matchImport, readQualification, registerSettingsOf, ruleSetting, RULE_IDS, SETTING_WINDOW, type Qualification } from '@/lib/compliance/register-rules';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { effectiveValues } from '@/lib/frameworks/settings-engine';
import { blankTeacher, checkTeacher, cleanTeacher, defaultRegisterSettings, RULE_LABEL, STAGES, teachersFromCsv, teachersToCsv, WINDOWS, type StageId, type Teacher } from '@/lib/free-tools/teacher-register';
import { readDate } from '@/lib/free-tools/student-data-check';

// The compliance desk's teacher register, with no database (docs/28 row 10d, C227): its rules are the website tool's
// own (src/lib/free-tools/teacher-register.ts), imported and never copied; the school's settings start at the tool's
// defaults; every sentence the tool can write has words in the app; a TET certificate has no end date unless the
// school types one. Every name is made up.

const ROOT = path.resolve(__dirname, '../..');
const TODAY = '2026-10-15';
const q = (over: Partial<Qualification>): Qualification => ({ ...emptyQualification(), ...over });

describe('one rule in one place', () => {
  it('the register imports the website tool’s rules, and none of its browser-storage helpers', () => {
    const files = ['src/lib/compliance/register-rules.ts', 'src/lib/compliance/qualifications.ts'];
    const text = files.map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    expect(text).toMatch(/from '@\/lib\/free-tools\/teacher-register'/);
    for (const helper of ['readRegisterSettings', 'saveRegisterSettings', 'browserStore', 'REGISTER_KEY']) expect(text, helper).not.toContain(helper);
    // No copy of the tool's rules: which CTET paper covers which stage, the windows and the "none" words are the tool's
    // alone (its sentences are only read back to codes, GAP_CODES).
    expect(text).not.toMatch(/CTET_COVERS|papers: \[|\[30, 60, 90\]|'nil'|daysBetween/);
  });

  it('the settings start at the tool’s defaults: TET for classes I to VIII, a window of 90 days, its WINDOWS as the choices', () => {
    const schema = settingsSchemaFor('compliance')!;
    expect(schema).toBeTruthy();
    expect(registerSettingsOf(effectiveValues(schema, {}))).toEqual(defaultRegisterSettings());
    expect(schema.fields.find((f) => f.key === SETTING_WINDOW)!.options!.map((o) => Number(o.value))).toEqual([...WINDOWS]);
    // One on/off setting for each stage and requirement, named and labelled as the tool names them.
    for (const st of STAGES) for (const r of RULE_IDS) expect(schema.fields.find((f) => f.key === ruleSetting(st.id, r))!.label).toBe(`${st.label}: ${RULE_LABEL[r]}`);
    expect(schema.fields).toHaveLength(1 + STAGES.length * RULE_IDS.length);
    // A school's choices are read through the tool's own cleanRegisterSettings.
    expect(registerSettingsOf({ [SETTING_WINDOW]: '60', primary_degree: true, upper_tet: false }).rules.primary).toEqual({ degree: true, professional: false, tet: true, pg: false });
    expect(registerSettingsOf({ [SETTING_WINDOW]: '45' }).window).toBe(90);
  });

  it('the typed fields are as long as the tool keeps them', () => {
    const long = 'x'.repeat(200);
    const cleaned = cleanTeacher({ ...blankTeacher(), subjects: long, degree: long, pg: long, professional: long, other: long })!;
    expect([cleaned.subjects.length, cleaned.degree.length, cleaned.pg.length, cleaned.professional.length, cleaned.other.length]).toEqual([FIELD_MAX.subjects, FIELD_MAX.degree, FIELD_MAX.postgraduate_degree, FIELD_MAX.professional_qualification, FIELD_MAX.other_approval]);
  });
});

describe('what is missing, and what ends', () => {
  it('every sentence the tool writes about a teacher has its code, so the screen says it in the person’s language', () => {
    const settings = defaultRegisterSettings();
    for (const st of STAGES) for (const r of RULE_IDS) settings.rules[st.id][r] = true;
    const seen = new Set<string>();
    const stages: (StageId | '')[] = ['', ...STAGES.map((s) => s.id)];
    for (const stage of stages)
      for (const tetType of ['', 'CTET', 'State TET'] as const)
        for (const tetPaper of ['', 'I', 'II', 'both'] as const) {
          const t: Teacher = { ...blankTeacher(), name: 'Asha Example', stage, tetType, tetPaper, tetDate: 'not a date', tetValidUntil: 'soon', otherValidUntil: 'later' };
          for (const g of checkTeacher(t, settings, readDate(TODAY)!).gaps) seen.add(g);
        }
    const codes = [...seen].map(gapCode);
    expect(codes).not.toContain('other');
    expect(new Set(codes)).toEqual(new Set([...Object.values(GAP_CODES)]));
  });

  it('a TET certificate issued after 2021 has no end date unless the school types one; a typed date ending within the window is listed', () => {
    const s = defaultRegisterSettings();
    expect(checkStaff('Asha', q({ stage: 'primary', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01' }), s, TODAY)).toEqual({ gaps: [], endings: [] });
    expect(checkStaff('Asha', q({ stage: 'primary', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2015-06-01' }), s, TODAY)).toEqual({ gaps: [], endings: [] });
    expect(checkStaff('Asha', q({ stage: 'primary', tet_type: 'State TET', tet_valid_until: '2026-11-14' }), s, TODAY).endings).toEqual([{ kind: 'tet', label: 'State TET', until: '2026-11-14', days: 30 }]);
    expect(checkStaff('Asha', q({ stage: 'primary', tet_type: 'State TET', tet_valid_until: '2027-01-14' }), s, TODAY).endings).toEqual([]);
    expect(checkStaff('Asha', q({ stage: 'primary', tet_type: 'State TET', tet_valid_until: '2027-01-12' }), s, TODAY).endings).toEqual([{ kind: 'tet', label: 'State TET', until: '2027-01-12', days: 89 }]);
    expect(checkStaff('Asha', q({ stage: 'secondary', other_approval: 'State approval', other_valid_until: '2026-10-10' }), s, TODAY).endings).toEqual([{ kind: 'other', label: 'State approval', until: '2026-10-10', days: -5 }]);
    // TET applies to classes I to VIII; a CTET paper that does not cover the stage is a gap.
    expect(checkStaff('Asha', q({ stage: 'upper' }), s, TODAY).gaps).toEqual(['tet']);
    expect(checkStaff('Asha', q({ stage: 'upper', tet_type: 'CTET', tet_paper: 'I' }), s, TODAY).gaps).toEqual(['ctet_upper']);
    expect(checkStaff('Asha', q({ stage: 'secondary' }), s, TODAY).gaps).toEqual([]);
    expect(checkStaff('Asha', null, s, TODAY).gaps).toEqual(['stage']);
  });
});

describe('reading what the office typed', () => {
  const base = { stage: 'primary', subjects: 'EVS', degree: 'B.A.', postgraduate_degree: '', professional_qualification: 'D.El.Ed', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2023-01-20', tet_valid_until: '', other_approval: '', other_valid_until: '' };
  it('keeps a whole row, a blank as nothing', () => {
    expect(readQualification(base, TODAY)).toEqual({ ok: true, value: q({ stage: 'primary', subjects: 'EVS', degree: 'B.A.', professional_qualification: 'D.El.Ed', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2023-01-20' }) });
  });
  it('refuses an Aadhaar number, a field too long, a stage or a TET it does not know, a date that is not real, and dates in the wrong order', () => {
    expect(readQualification({ ...base, degree: 'B.A. 1234 5678 9012' }, TODAY)).toMatchObject({ ok: false, reason: 'aadhaar', field: 'degree' });
    expect(readQualification({ ...base, subjects: 'x'.repeat(81) }, TODAY)).toMatchObject({ ok: false, reason: 'length' });
    expect(readQualification({ ...base, stage: 'college' }, TODAY)).toMatchObject({ ok: false, reason: 'stage' });
    expect(readQualification({ ...base, tet_type: 'HTET' }, TODAY)).toMatchObject({ ok: false, reason: 'tet_type' });
    expect(readQualification({ ...base, tet_paper: 'III' }, TODAY)).toMatchObject({ ok: false, reason: 'tet_paper' });
    expect(readQualification({ ...base, tet_certificate_date: '2023-02-30' }, TODAY)).toMatchObject({ ok: false, reason: 'date' });
    expect(readQualification({ ...base, tet_certificate_date: '2026-10-16' }, TODAY)).toMatchObject({ ok: false, reason: 'future' });
    expect(readQualification({ ...base, tet_valid_until: '2022-01-01' }, TODAY)).toMatchObject({ ok: false, reason: 'order' });
    expect(readQualification({ ...base, tet_type: '' }, TODAY)).toMatchObject({ ok: false, reason: 'tet_needed' });
    expect(readQualification({ ...base, degree: 7 }, TODAY)).toMatchObject({ ok: false, reason: 'length' });
  });
  it('the audit row names the fields that changed, never their values', () => {
    const a = q({ stage: 'primary', degree: 'B.A.' });
    expect(changedFields(null, a)).toEqual(['stage', 'degree']);
    expect(changedFields(a, { ...a, degree: 'B.Sc.' })).toEqual(['degree']);
    expect(changedFields(a, a)).toEqual([]);
  });
});

describe('the CSV import, in the tool’s own columns', () => {
  const staff = [
    { user_id: 'u1', name: 'Asha  Example', has_row: true },
    { user_id: 'u2', name: 'Bina Example', has_row: false },
    { user_id: 'u3', name: 'Ravi Example', has_row: false },
    { user_id: 'u4', name: 'Ravi Example', has_row: false },
  ];
  it('reads a file the website tool writes, matches each teacher with one account by name, and says why a line is left out', () => {
    const teachers: Teacher[] = [
      { ...blankTeacher(), name: 'asha example', stage: 'primary', degree: 'B.A.', tetType: 'CTET', tetPaper: 'I', tetDate: '2022-03-01' },
      { ...blankTeacher(), name: 'Bina Example', stage: 'upper', degree: 'B.Sc. 1234 5678 9012' },
      { ...blankTeacher(), name: 'Ravi Example', stage: 'senior' },
      { ...blankTeacher(), name: 'Nobody Here', stage: 'pre' },
      { ...blankTeacher(), name: 'Tara Example', stage: 'pre' },
      { ...blankTeacher(), name: 'Tara Example', stage: 'pre' },
    ];
    const read = teachersFromCsv(teachersToCsv(teachers));
    expect(read.teachers.map((t) => t.stage)).toEqual(['primary', 'upper', 'senior', 'pre', 'pre', 'pre']);
    const rows = matchImport(read.teachers, [...staff, { user_id: 'u5', name: 'Tara Example', has_row: false }], TODAY);
    expect(rows.map((r) => [r.line, r.status, r.userId, r.replaces])).toEqual([
      [1, 'ready', 'u1', true],
      [2, 'aadhaar', 'u2', false],
      [3, 'two_accounts', null, false],
      [4, 'no_account', null, false],
      [5, 'twice', 'u5', false],
      [6, 'twice', 'u5', false],
    ]);
    expect(rows[0].value).toEqual(q({ stage: 'primary', degree: 'B.A.', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-03-01' }));
  });
  it('keeps no TET paper or date on a line with no TET', () => {
    const rows = matchImport([{ ...blankTeacher(), name: 'Bina Example', stage: 'pre', tetPaper: 'II', tetDate: '2022-03-01', tetValidUntil: '2030-01-01' }], staff, TODAY);
    expect(rows[0]).toMatchObject({ status: 'ready', value: q({ stage: 'pre' }) });
  });
});
