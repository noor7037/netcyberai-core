import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Audit rows hold no personal data (C56, C223-A answer 7, C224). audit_log is append-only: whatever a row holds stays
// for good, out of reach of the erasure of a data request. So a row says WHAT happened with ids, codes, counts, dates
// of the event and booleans (noted: true), never a name, a phone, a date of birth, an address, or free text a person
// typed (a note, a reason, a reference): those stay on their own rows, which the erasure can reach.
//
// This reads every call of the audit writers in src (writeAuditLog, writeAuditLogs, writeEntitlementAudit,
// writeAttendanceAudit, writeImpersonationAudit) and fails on a before or after state that could carry such data:
//   - a key whose words say so (name, phone, dob, note, reason, text, message, ...), unless its value is plainly a
//     code, a boolean or a count (a literal, a comparison, Boolean(...), .length);
//   - a value read from something whose words say so (input.note, params.reason, body.text, ...);
//   - a state the check cannot see into (a database row, a call's result, a spread of one), unless it is resolved here:
//     a local object literal, or the parameter of a local wrapper (each of its call sites is read).
// Anything else is in ALLOWED below, file by file, each entry with its reason. An entry no longer needed fails too,
// so the list only ever shrinks.

const ROOT = path.resolve(__dirname, '../..');
const WRITERS = new Set(['writeAuditLog', 'writeAuditLogs', 'writeEntitlementAudit', 'writeAttendanceAudit', 'writeImpersonationAudit']);
const PERSONAL = new Set(['name', 'names', 'phone', 'phones', 'mobile', 'email', 'dob', 'birth', 'address', 'note', 'notes', 'reason', 'reasons', 'why', 'text', 'message', 'body', 'details', 'title', 'reference', 'comment', 'description', 'summary', 'remark', 'remarks', 'outcome', 'narration', 'utr', 'aadhaar']);

// file -> problem -> why it is not personal data. Problems are "key:<key>", "value:<key>" or "opaque:<expression>".
const ALLOWED: Record<string, Record<string, string>> = {
  'src/lib/audit/log.ts': {
    'opaque:entry': 'writeAttendanceAudit passes its entry on to writeAuditLog when no words were given; that entry is checked at each call of writeAttendanceAudit, which is in WRITERS (review of C224)',
  },
  'src/app/api/app/classes/route.ts': { 'opaque:row': 'a class as made: its id, name (5-A), grade, section, session and class teacher’s id' },
  'src/app/api/app/settings/holidays/route.ts': { 'key:name': 'a holiday’s name (Diwali), from the school’s calendar' },
  'src/app/api/control/schools/route.ts': { 'opaque:row': 'a school as Control makes it: its id, name, board, type, jurisdiction, stage and flags' },
  'src/app/api/control/schools/[schoolId]/features/route.ts': { 'opaque:beforeFeatures': 'the school’s feature flags: codes', 'opaque:rows[0].enabled_features': 'the school’s feature flags: codes' },
  'src/lib/school/branding.ts': { 'key:nameChanged': 'true or false: whether the school’s name changed, never the name' },
  'src/lib/bank/match.ts': { 'key:outcome': 'a code: credited, seen_not_credited or needs_person' },
  'src/lib/payments/upi.ts': { 'key:outcome': 'a code: credited or seen_not_credited' },
  'src/lib/payments/apply.ts': { 'opaque:e.audit': 'the provider and its payment id, or nothing', 'key:reason': 'a code the provider check returns (fetch_status_404, status_failed)' },
  'src/lib/control/billing.ts': {
    'opaque:planState(plan)': 'a plan: its id, name (Growth), prices and modules',
    'opaque:planState(before)': 'a plan: its id, name (Growth), prices and modules',
    'opaque:rows[0]': 'the school’s access row: plan id, access mode, grace end',
    'opaque:after': 'the school’s access row: plan id, access mode, grace end, since',
  },
  'src/lib/control/billing-terms.ts': { 'opaque:termValues(t)': 'a term’s kind, prices, module and percentages', 'opaque:row': 'a module entitlement row: enabled, source, limits' },
  'src/lib/control/billing-nightly.ts': { 'opaque:after': 'the school’s access row: plan id, access mode, grace end, since' },
  'src/lib/frameworks/entitlements.ts': { 'opaque:before[0]': 'an entitlement row: enabled, source, limits or plan, access mode, grace end', 'opaque:rows[0]': 'an entitlement row: enabled, source, limits or plan, access mode, grace end' },
  'src/lib/exams/exams.ts': { 'key:name': 'an exam’s name (Half-yearly), set by the school' },
  'src/lib/exams/boards.ts': { 'key:name': 'a board’s name (CBSE)', 'key:source_title': 'the title of the public document a grading preset cites' },
  'src/lib/fees/structures.ts': { 'key:name': 'a fee head’s name (Tuition)' },
  'src/lib/fees/concessions.ts': { 'opaque:before': 'the RTE tag: a boolean, the entry class (a class code) and the day of admission under RTE' },
  'src/lib/timetable/timetable.ts': { 'opaque:before': 'the period’s subject and teacher ids before it changed', 'opaque:at': 'the period: class id, weekday and period number' },
  'src/lib/parent-ai/answers.ts': { 'key:message': 'the send-gate’s state of the message (queued, sent, blocked_consent): a code' },
  'src/lib/students/data-check.ts': { 'key:message': 'the send-gate’s state of the message, or no_number: a code' },
  'src/lib/rte/desk.ts': {
    'key:withNote': 'a boolean (with_note), never the note',
    'value:reversalCode': 'a code from the fixed list typed_wrong, recorded_twice, not_received (isReversalReason checks it before it is written), never typed words',
  },
  // C249: Control → AI's platform rows (school null): a provider's clearance, a profile or the daily cap, before and after,
  // so a change can be undone. Ids, model names, flags and a terms page address; never a key, never a child's data.
  'src/lib/ai/control.ts': { 'opaque:before': 'a provider, profile or cap setting as it was: ids, models, flags, the terms address; never a key', 'opaque:next': 'the same setting after the change' },
  // C250: Control → Content's platform rows: a syllabus version's id with counts or its new audience; a rejection says only
  // that a note exists, never the note.
  'src/lib/content/library.ts': {
    "opaque:AUDIT(actor, 'content.syllabus.imported', v.versionId, { versionNo: v.versionNo, units: v.units, chapters: v.chapters, topics: v.topics })": 'a version id with its number and line counts',
    "opaque:AUDIT(actor, 'content.syllabus.approved', versionId, { audience: 'staff_preview' })": 'a version id and its audience code',
    "opaque:AUDIT(actor, 'content.syllabus.rejected', versionId, { note: true })": 'a version id and true: a note exists, never its words',
    "opaque:AUDIT(actor, 'content.syllabus.released', versionId, { audience: 'everyone', supersededVersionId: before?.version_id ?? null })": 'version ids and an audience code',
    "opaque:AUDIT(actor, 'content.syllabus.rolled_back', versionId, { restoredVersionId: previous.version_id })": 'version ids',
  },
  // C253: Control → Apps' platform rows: an app flag, version setting, banner or preview account before and after, so a
  // change can be undone in one step. The founder's reason for the change and a banner's public notice text are kept with
  // it; nothing about a family, a child or a school's people.
  'src/lib/control/apps.ts': {
    'opaque:before': 'a flag, version, banner or preview row as it was: codes, numbers, dates, ids',
    'opaque:after': 'the same row after the change',
    'opaque:current': 'the row as it stands when a change is undone',
    'opaque:restored': 'the row an undo put back',
    'key:change_reason': 'the founder’s own reason for a Control change, written in Control (required by 10 §7)',
    'key:text_en': 'a banner’s public notice text, shown to every user of the app',
    'key:text_hi': 'the same notice in Hindi',
  },
};

type Problem = { file: string; line: number; action: string; problem: string };

const srcFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'demo-fixture' ? [] : srcFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

const words = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
const personal = (id: string) => words(id).some((w) => PERSONAL.has(w));

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x) || ts.isAwaitExpression(x)) x = x.expression;
  return x;
};

const COMPARE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.InstanceOfKeyword, ts.SyntaxKind.InKeyword]);

// A code, a boolean or a count, whatever it is called.
function plainlySafe(e: ts.Expression): boolean {
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNumericLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return true;
  if (x.kind === ts.SyntaxKind.TrueKeyword || x.kind === ts.SyntaxKind.FalseKeyword || x.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(x) && x.text === 'undefined') return true;
  if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken) return true;
  if (ts.isBinaryExpression(x) && COMPARE.has(x.operatorToken.kind)) return true;
  if (ts.isConditionalExpression(x)) return plainlySafe(x.whenTrue) && plainlySafe(x.whenFalse);
  if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && (x.expression.text === 'Boolean' || x.expression.text === 'Number')) return true;
  if (ts.isPropertyAccessExpression(x) && x.name.text === 'length') return true;
  return false;
}

// The names a value is read from: a variable, or the last property of a chain (`input.note`, not `outcome.result.n`);
// through a method call to its receiver (`input.note?.trim()`), the arguments of a plain call, both sides of a
// sum, and the body of an arrow passed along (`xs.map((f) => f.note)`).
function namesIn(e: ts.Node): string[] {
  const x = ts.isExpression(e) ? unwrap(e) : e;
  if (ts.isIdentifier(x)) return [x.text];
  if (ts.isPropertyAccessExpression(x)) return [x.name.text];
  if (ts.isElementAccessExpression(x)) return namesIn(x.expression);
  if (ts.isCallExpression(x)) {
    const fromArgs = x.arguments.flatMap((a) => (ts.isArrowFunction(a) || ts.isFunctionExpression(a) ? namesIn(a.body) : namesIn(a)));
    return ts.isPropertyAccessExpression(x.expression) ? [...namesIn(x.expression.expression), ...fromArgs] : fromArgs;
  }
  if (ts.isBinaryExpression(x)) return COMPARE.has(x.operatorToken.kind) ? [] : [...namesIn(x.left), ...namesIn(x.right)];
  if (ts.isConditionalExpression(x)) return [...namesIn(x.whenTrue), ...namesIn(x.whenFalse)];
  if (ts.isTemplateExpression(x)) return x.templateSpans.flatMap((s) => namesIn(s.expression));
  if (ts.isBlock(x)) return x.statements.flatMap((s) => (ts.isReturnStatement(s) && s.expression ? namesIn(s.expression) : []));
  if (ts.isArrayLiteralExpression(x)) return x.elements.flatMap((el) => namesIn(el));
  return [];
}
// A key or a name that names an id (message_id, phoneNumberId) holds an id.
const isIdKey = (key: string) => ['id', 'ids'].includes(words(key).at(-1) ?? '');
const readsPersonal = (e: ts.Node) => namesIn(e).some((n) => personal(n) && !isIdKey(n));

function enclosingFunction(n: ts.Node): ts.SignatureDeclaration | null {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
  return null;
}

function nameOfFunction(fn: ts.SignatureDeclaration): string | null {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return null;
}

function analyze(sf: ts.SourceFile, e: ts.Expression, seen: Set<ts.Node>, report: (p: string, at: ts.Node) => void): void {
  const x = unwrap(e);
  if (seen.has(x)) return;
  seen.add(x);
  if (plainlySafe(x)) return;
  if (ts.isObjectLiteralExpression(x)) return analyzeObject(sf, x, seen, report);
  if (ts.isConditionalExpression(x)) {
    analyze(sf, x.whenTrue, seen, report);
    analyze(sf, x.whenFalse, seen, report);
    return;
  }
  if (ts.isBinaryExpression(x) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(x.operatorToken.kind)) {
    analyze(sf, x.left, seen, report);
    analyze(sf, x.right, seen, report);
    return;
  }
  if (ts.isIdentifier(x)) {
    // The parameter of a local wrapper: every call of the wrapper in this file is read.
    for (let fn: ts.SignatureDeclaration | null = enclosingFunction(x); fn !== null; fn = enclosingFunction(fn as ts.Node)) {
      const i = fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === x.text);
      if (i < 0) continue;
      const name = nameOfFunction(fn);
      if (!name) break;
      const calls: ts.CallExpression[] = [];
      const find = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) calls.push(n);
        ts.forEachChild(n, find);
      };
      find(sf);
      if (calls.length === 0) break;
      for (const c of calls) if (c.arguments[i]) analyze(sf, c.arguments[i], seen, report);
      return;
    }
    // A local object literal.
    const local = localObject(sf, x);
    if (local) return analyze(sf, local, seen, report);
  }
  report(`opaque:${x.getText(sf).replace(/\s+/g, ' ')}`, x);
}

function analyzeObject(sf: ts.SourceFile, o: ts.ObjectLiteralExpression, seen: Set<ts.Node>, report: (p: string, at: ts.Node) => void): void {
  for (const prop of o.properties) {
    if (ts.isSpreadAssignment(prop)) {
      analyze(sf, prop.expression, seen, report);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text;
      if (personal(key) && !isIdKey(key)) report(`key:${key}`, prop);
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) {
      report(`opaque:${prop.getText(sf)}`, prop);
      continue;
    }
    if (ts.isComputedPropertyName(prop.name)) {
      report(`key:[${prop.name.expression.getText(sf)}]`, prop);
      continue;
    }
    const key = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
    const value = unwrap(prop.initializer);
    if (personal(key) && !isIdKey(key)) {
      if (!plainlySafe(value)) report(`key:${key}`, prop);
      continue;
    }
    if (ts.isObjectLiteralExpression(value)) {
      analyzeObject(sf, value, seen, report);
      continue;
    }
    if (ts.isArrayLiteralExpression(value)) {
      for (const el of value.elements) if (!plainlySafe(el) && readsPersonal(el)) report(`value:${key}`, el);
      continue;
    }
    if (!plainlySafe(value) && readsPersonal(value)) report(`value:${key}`, prop);
  }
}

// The entry of one call: its states, and the states of what is spread into it (`...common`, a local object literal;
// `...(before ? { beforeState: ... } : {})`).
function readEntry(sf: ts.SourceFile, entry: ts.ObjectLiteralExpression, report: (p: string, at: ts.Node) => void): void {
  for (const p of entry.properties) {
    if (ts.isSpreadAssignment(p)) {
      const inner = unwrap(p.expression);
      const branches = ts.isConditionalExpression(inner) ? [inner.whenTrue, inner.whenFalse] : [inner];
      for (const b of branches.map(unwrap)) {
        if (ts.isObjectLiteralExpression(b)) {
          readEntry(sf, b, report);
          continue;
        }
        const local = ts.isIdentifier(b) ? localObject(sf, b) : null;
        if (local) readEntry(sf, local, report);
        else report(`opaque:${b.getText(sf)}`, b);
      }
      continue;
    }
    const key = p.name?.getText(sf);
    if (key !== 'beforeState' && key !== 'afterState') continue;
    if (ts.isShorthandPropertyAssignment(p)) analyze(sf, p.name, new Set(), report);
    else if (ts.isPropertyAssignment(p)) analyze(sf, p.initializer, new Set(), report);
  }
}

// `const x = { ... }` in the function around the name (or the file): its object literal, if there is exactly one.
function localObject(sf: ts.SourceFile, id: ts.Identifier): ts.ObjectLiteralExpression | null {
  const decls: ts.VariableDeclaration[] = [];
  const find = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id.text && n.initializer) decls.push(n);
    ts.forEachChild(n, find);
  };
  find(enclosingFunction(id) ?? sf);
  const init = decls.length === 1 ? unwrap(decls[0].initializer!) : null;
  return init && ts.isObjectLiteralExpression(init) ? init : null;
}

// The entry of a call: an object literal, or for writeAuditLogs the object each row of a map makes
// (`rows.map((r) => ({ ... }))`), which is read the same way.
function entryOf(arg: ts.Expression): ts.Expression {
  const x = unwrap(arg);
  if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'map') {
    const fn = x.arguments[0];
    if (fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return unwrap(fn.body);
  }
  return x;
}

function auditCalls(): { problems: Problem[]; calls: number; files: Set<string> } {
  const problems: Problem[] = [];
  const files = new Set<string>();
  let calls = 0;
  for (const file of srcFiles(path.join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    if (![...WRITERS].some((w) => text.includes(`${w}(`))) continue;
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && WRITERS.has(n.expression.text)) {
        calls += 1;
        files.add(rel);
        const entry = n.arguments[1] ? entryOf(n.arguments[1]) : null;
        const action = entry && ts.isObjectLiteralExpression(entry) ? entry.properties.find((p) => p.name?.getText(sf) === 'eventAction')?.getText(sf).replace(/^eventAction:\s*/, '') ?? '?' : '?';
        const report = (problem: string, at: ts.Node) => problems.push({ file: rel, line: sf.getLineAndCharacterOfPosition(at.getStart(sf)).line + 1, action, problem });
        if (!entry || !ts.isObjectLiteralExpression(entry)) report(`opaque:${n.arguments[1]?.getText(sf) ?? '(no entry)'}`, n);
        else readEntry(sf, entry, report);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { problems, calls, files };
}

describe('audit rows hold no personal data (C56, C223-A answer 7, C224)', () => {
  const { problems, calls, files } = auditCalls();

  it('reads every call of the audit writers in src', () => {
    // A count far below today’s would mean the check stopped finding them.
    expect(calls).toBeGreaterThan(180);
    expect(files.size).toBeGreaterThan(80);
  });

  it('no before or after state carries a name, a phone, a date of birth, an address or free text', () => {
    const left = problems.filter((p) => !ALLOWED[p.file]?.[p.problem]);
    expect(left.map((p) => `${p.file}:${p.line} ${p.action} ${p.problem}`)).toEqual([]);
  });

  it('every allowed entry is still needed, and says why', () => {
    const used = new Set(problems.map((p) => `${p.file}|${p.problem}`));
    const stale = Object.entries(ALLOWED).flatMap(([file, entries]) => Object.keys(entries).filter((k) => !used.has(`${file}|${k}`)).map((k) => `${file} ${k}`));
    expect(stale).toEqual([]);
    for (const entries of Object.values(ALLOWED)) for (const why of Object.values(entries)) expect(why.length).toBeGreaterThan(10);
  });

  it('nothing in src writes audit_log but the two writers', () => {
    const direct = srcFiles(path.join(ROOT, 'src'))
      .filter((f) => /insert\s+into\s+audit_log/i.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(direct).toEqual(['src/lib/audit/log.ts']);
  });

  it('the check finds what it is for', () => {
    const src = `
      const audit = (db, after) => writeAuditLog(db, { eventAction: 'x.y', afterState: after });
      async function f(db, input, row) {
        await writeAuditLog(db, { eventAction: 'a', afterState: { note: input.note, noted: Boolean(input.note), reason: 'a_code' } });
        await writeAuditLog(db, { eventAction: 'b', beforeState: row, afterState: { [input.field]: 1, why: input.why } });
        await writeAuditLog(db, { eventAction: 'c', afterState: { count: input.items.length, by: input.textOfNote } });
        await audit(db, { name: input.name, withNote: input.note !== null });
      }`;
    const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'writeAuditLog') {
        const entry = n.arguments[1] as ts.ObjectLiteralExpression;
        for (const p of entry.properties) if (ts.isPropertyAssignment(p) && ['beforeState', 'afterState'].includes(p.name.getText(sf))) analyze(sf, p.initializer, new Set(), (problem) => found.push(problem));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(found.sort()).toEqual(['key:[input.field]', 'key:name', 'key:note', 'key:why', 'opaque:row', 'value:by'].sort());
  });
});
