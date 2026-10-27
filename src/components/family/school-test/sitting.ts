import type { FamilyOnlineQuestion, OnlineAnswer } from '@/lib/contracts/marking';

// The phone's side of sitting a school's online test (AQ-4, C365): the clock from the server's deadline, the palette's
// marks, and the queue that saves each answer as it is given and tries again through a brief loss of internet. Pure
// and free of the screen, so it is tested (test/marking/online-sitting.test.ts). The server alone decides what is
// kept and when time is up: this only shows it.

// What is left of the deadline in whole seconds (never below 0), by the server's clock: `skewMs` is the server's time
// less the phone's, taken when the server last answered, so a phone whose clock is wrong still counts right.
export function secondsLeft(deadlineIso: string, skewMs: number, phoneNow: number = Date.now()): number {
  return Math.max(0, Math.floor((new Date(deadlineIso).getTime() - (phoneNow + skewMs)) / 1000));
}

// "1:05:09" or "05:09".
export function clockWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}

export type Held = { answer: OnlineAnswer | null; flagged: boolean; seq: number };
export type Mark = 'answered' | 'not_answered';

// A question's mark in the palette: answered or not; marked to look at again is shown beside either.
export const markOf = (h: Held | undefined): Mark => (h?.answer ? 'answered' : 'not_answered');

// The answers as the server gave them back, by question.
export function heldFrom(questions: readonly FamilyOnlineQuestion[]): Record<string, Held> {
  return Object.fromEntries(questions.map((q) => [q.questionId, { answer: q.answer, flagged: q.flagged, seq: q.seq }]));
}

// What a number field holds as an answer: a number (a comma as the decimal point too), none when empty, 'bad' else.
export function numberAnswer(text: string): OnlineAnswer | null | 'bad' {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return 'bad';
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? { value: n } : 'bad';
}

// ---- the save queue ------------------------------------------------------------------------------------------------------

export type SaveItem = { questionId: string; answer: OnlineAnswer | null; flagged: boolean; seq: number };
// 'network': no answer from the server (offline, or it failed): tried again. Anything else is the server's word.
export type SendResult = 'saved' | 'closed' | 'bad_answer' | 'not_found' | 'network';
export type QueueEvent = { kind: 'saving' | 'offline' | 'idle' } | { kind: 'saved' | 'bad_answer'; questionId: string } | { kind: 'closed' | 'not_found' };

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

// One answer per question waits to be sent: a newer one replaces an older one not yet sent. Sent one at a time, in
// the order given; while the server cannot be reached, tried again after a growing wait (cut short by wake(), when the
// phone is back online). The server keeps only the newest of a question (its seq), so a late retry never undoes.
export class SaveQueue {
  private pending = new Map<string, SaveItem>();
  private running = false;
  private tries = 0;
  private stopped = false;
  private wakeUp: (() => void) | null = null;

  constructor(
    private readonly send: (item: SaveItem) => Promise<SendResult>,
    private readonly on: (e: QueueEvent) => void,
    private readonly sleep: (ms: number, wake: (cut: () => void) => void) => Promise<void> = (ms, wake) =>
      new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        wake(() => {
          clearTimeout(id);
          resolve();
        });
      })
  ) {}

  get size(): number {
    return this.pending.size;
  }

  put(item: SaveItem): void {
    if (this.stopped) return;
    this.pending.set(item.questionId, item);
    void this.run();
  }

  // The phone is back online: try now.
  wake(): void {
    this.wakeUp?.();
  }

  // Nothing more is sent (the test ended).
  stop(): void {
    this.stopped = true;
    this.pending.clear();
    this.wake();
  }

  // Waits until nothing is left to send, or `ms` passed. True when everything was sent.
  async flush(ms: number): Promise<boolean> {
    const until = Date.now() + ms;
    this.wake();
    while (this.pending.size && Date.now() < until && !this.stopped) await new Promise((r) => setTimeout(r, 100));
    return this.pending.size === 0;
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.size && !this.stopped) {
        const [questionId, item] = this.pending.entries().next().value as [string, SaveItem];
        this.on({ kind: 'saving' });
        let result: SendResult;
        try {
          result = await this.send(item);
        } catch {
          result = 'network';
        }
        if (result === 'network') {
          this.on({ kind: 'offline' });
          const wait = BACKOFF_MS[Math.min(this.tries, BACKOFF_MS.length - 1)];
          this.tries += 1;
          await this.sleep(wait, (cut) => (this.wakeUp = cut));
          this.wakeUp = null;
          continue;
        }
        this.tries = 0;
        // A newer answer given while this one was on its way stays to be sent.
        if (this.pending.get(questionId) === item) this.pending.delete(questionId);
        if (result === 'closed' || result === 'not_found') {
          this.pending.clear();
          this.stopped = true;
          this.on({ kind: result });
          return;
        }
        this.on({ kind: result, questionId });
      }
    } finally {
      this.running = false;
      if (!this.stopped) this.on({ kind: 'idle' });
    }
  }
}
