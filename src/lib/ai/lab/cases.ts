import { createHash } from 'crypto';
import maths from '../../../../data/ai-lab/maths.json';
import science from '../../../../data/ai-lab/science.json';
import humanities from '../../../../data/ai-lab/humanities.json';
import hindi from '../../../../data/ai-lab/hindi.json';
import englishRoleplay from '../../../../data/ai-lab/english-roleplay.json';
import multiTurn from '../../../../data/ai-lab/multi-turn.json';
import edge from '../../../../data/ai-lab/edge.json';

// The Quality Lab's cases (G4, C372): NetCyber-authored, made-up questions and personas, kept in the repository
// (data/ai-lab/*.json) and never in the database. Each is a system prompt, the conversation so far, what kind of answer
// is expected (text, or one JSON object with the keys named), an optional deterministic check (words the answer must
// contain: a maths answer, a fact) and the hints the founder scores against. A case may give the call its own token
// limit or time limit (the timeout probe). The set's version is the hash of the whole set, so a run always says which
// cases it ran, and a changed case is a new version.

export const LAB_AREAS = ['maths', 'science', 'humanities', 'hindi', 'english_roleplay', 'multi_turn', 'edge'] as const;
export type LabArea = (typeof LAB_AREAS)[number];

export type LabCase = {
  id: string;
  area: LabArea;
  language: 'en' | 'hi' | 'hinglish';
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  expect: 'json' | 'text';
  jsonKeys?: string[];
  mustContain?: string[];
  maxTokens?: number;
  timeoutMs?: number;
  rubric: string[];
};

const CASE_ID = /^[a-z][a-z0-9-]{2,40}$/;
const FILES: unknown[] = [maths, science, humanities, hindi, englishRoleplay, multiTurn, edge];

// Reads one file's cases, refusing anything that does not have the shape above (a typo in a file fails the tests and
// the build's first use, never a run).
export function parseCaseFile(file: unknown): LabCase[] {
  const f = file as { area?: unknown; cases?: unknown };
  if (!LAB_AREAS.includes(f?.area as LabArea) || !Array.isArray(f.cases)) throw new Error('a lab case file needs an area and cases');
  return f.cases.map((raw) => {
    const c = raw as Record<string, unknown>;
    const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0);
    const messages = c.messages as LabCase['messages'];
    const ok =
      typeof c.id === 'string' &&
      CASE_ID.test(c.id) &&
      ['en', 'hi', 'hinglish'].includes(c.language as string) &&
      typeof c.system === 'string' &&
      c.system.length > 0 &&
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0) &&
      messages[messages.length - 1].role === 'user' &&
      (c.expect === 'json' || c.expect === 'text') &&
      (c.jsonKeys === undefined || (c.expect === 'json' && strings(c.jsonKeys))) &&
      (c.mustContain === undefined || strings(c.mustContain)) &&
      (c.maxTokens === undefined || (Number.isInteger(c.maxTokens) && (c.maxTokens as number) >= 50 && (c.maxTokens as number) <= 8000)) &&
      (c.timeoutMs === undefined || (Number.isInteger(c.timeoutMs) && (c.timeoutMs as number) >= 1000 && (c.timeoutMs as number) <= 240_000)) &&
      strings(c.rubric);
    if (!ok) throw new Error(`lab case ${String(c.id)} is not well formed`);
    return {
      id: c.id as string,
      area: f.area as LabArea,
      language: c.language as LabCase['language'],
      system: c.system as string,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      expect: c.expect as LabCase['expect'],
      ...(c.jsonKeys ? { jsonKeys: c.jsonKeys as string[] } : {}),
      ...(c.mustContain ? { mustContain: c.mustContain as string[] } : {}),
      ...(c.maxTokens ? { maxTokens: c.maxTokens as number } : {}),
      ...(c.timeoutMs ? { timeoutMs: c.timeoutMs as number } : {}),
      rubric: c.rubric as string[],
    };
  });
}

let cached: { cases: LabCase[]; version: string } | null = null;

export function labDataset(): { cases: LabCase[]; version: string } {
  if (cached) return cached;
  const cases = FILES.flatMap(parseCaseFile);
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`lab case ${c.id} appears twice`);
    ids.add(c.id);
  }
  cached = { cases, version: createHash('sha256').update(JSON.stringify(cases)).digest('hex').slice(0, 12) };
  return cached;
}

export function labCase(id: string): LabCase | null {
  return labDataset().cases.find((c) => c.id === id) ?? null;
}

// What the screen needs to choose and read a case (the full prompt stays on the server until it is run).
export type LabCaseSummary = { id: string; area: LabArea; language: LabCase['language']; expect: LabCase['expect']; ask: string; rubric: string[]; turns: number };
export function caseSummaries(): LabCaseSummary[] {
  return labDataset().cases.map((c) => ({ id: c.id, area: c.area, language: c.language, expect: c.expect, ask: c.messages[c.messages.length - 1].content.slice(0, 200), rubric: c.rubric, turns: c.messages.length }));
}
