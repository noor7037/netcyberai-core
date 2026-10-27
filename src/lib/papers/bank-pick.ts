import type { Difficulty, QuestionKind } from '@/lib/contracts/marking';

// The school's own questions first (C363): for each slot of a paper's plan, a kept bank question of the same chapter,
// kind and marks, never one the class had in its last two papers of the subject (the caller leaves those out) and never
// two slots the same question. Among the ones that fit: the same topic first, then the same difficulty, then the one
// used on fewest kept papers, then the one used longest ago (never used first), then the oldest. Pure and
// deterministic; slots it cannot fill are left for the AI.

export type BankCandidate = {
  bankId: string;
  chapter: string;
  topic: string;
  kind: QuestionKind;
  maxMarks: number;
  difficulty: Difficulty | null;
  usedCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};
export type BankSlot = { n: number; chapter: string; topic: string; kind: QuestionKind; marks: number; difficulty: Difficulty };

export function pickFromBank(slots: readonly BankSlot[], candidates: readonly BankCandidate[], taken: Iterable<string> = []): Map<number, string> {
  const used = new Set(taken);
  const out = new Map<number, string>();
  for (const s of slots) {
    let best: BankCandidate | null = null;
    for (const c of candidates) {
      if (used.has(c.bankId) || c.chapter !== s.chapter || c.kind !== s.kind || c.maxMarks !== s.marks) continue;
      if (!best || better(c, best, s)) best = c;
    }
    if (best) {
      out.set(s.n, best.bankId);
      used.add(best.bankId);
    }
  }
  return out;
}

function better(a: BankCandidate, b: BankCandidate, s: BankSlot): boolean {
  const key = (c: BankCandidate) => [c.topic === s.topic ? 0 : 1, c.difficulty === s.difficulty ? 0 : 1, c.usedCount, c.lastUsedAt ?? '', c.createdAt, c.bankId] as const;
  const x = key(a);
  const y = key(b);
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    return x[i] < y[i];
  }
  return false;
}
