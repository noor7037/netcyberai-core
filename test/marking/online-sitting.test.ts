import { describe, expect, it } from 'vitest';
import { clockWords, markOf, numberAnswer, SaveQueue, secondsLeft, type QueueEvent, type SaveItem, type SendResult } from '@/components/family/school-test/sitting';
import { answerFrom } from '@/lib/online/guardian';
import { indiaLocalToIso, isoToIndiaLocal } from '@/lib/online/time';

// AQ-4 (C365): the phone's side of an online test, and the shapes both sides agree on. Pure: the clock counts from the
// server's deadline whatever the phone's own clock says; each answer is queued, the newest kept, and tried again
// through a brief loss of internet; an answer that is not one of the three shapes never reaches the database.

describe('the clock (C365)', () => {
  it('counts from the server’s deadline, with the phone’s clock corrected by the server’s time', () => {
    const deadline = '2026-10-28T05:00:00.000Z';
    const phone = Date.parse('2026-10-28T04:50:00.000Z');
    expect(secondsLeft(deadline, 0, phone)).toBe(600);
    // The phone runs two minutes slow: the server is two minutes ahead of it.
    expect(secondsLeft(deadline, 120_000, phone)).toBe(480);
    expect(secondsLeft(deadline, 0, Date.parse('2026-10-28T05:00:01.000Z'))).toBe(0);
    expect(clockWords(65)).toBe('01:05');
    expect(clockWords(3 * 3600 + 7)).toBe('3:00:07');
    expect(clockWords(-3)).toBe('00:00');
  });

  it('India’s date and time, both ways, whatever the device’s zone', () => {
    expect(indiaLocalToIso('2026-10-28T10:00')).toBe('2026-10-28T04:30:00.000Z');
    expect(isoToIndiaLocal('2026-10-28T04:30:00.000Z')).toBe('2026-10-28T10:00');
    for (const bad of ['2026-02-30T10:00', '2026-10-28 10:00', '2026-10-28T24:00', '', null, 5]) expect(indiaLocalToIso(bad)).toBeNull();
  });
});

describe('answers (C365)', () => {
  it('numbers as typed; the three shapes only, nothing else', () => {
    expect(numberAnswer(' 0.75 ')).toEqual({ value: 0.75 });
    expect(numberAnswer('0,5')).toEqual({ value: 0.5 });
    expect(numberAnswer('-3')).toEqual({ value: -3 });
    expect(numberAnswer('')).toBeNull();
    expect(numberAnswer('3/4')).toBe('bad');
    expect(numberAnswer('1e13')).toBe('bad');
    expect(answerFrom({ keys: ['B', 'A'] })).toEqual({ keys: ['B', 'A'] });
    expect(answerFrom({ keys: [] })).toBeNull();
    expect(answerFrom({ value: 3 })).toEqual({ value: 3 });
    expect(answerFrom({ text: '  ' })).toBeNull();
    expect(answerFrom(null)).toBeNull();
    for (const bad of [{ keys: ['Z'] }, { keys: 'A' }, { value: '3' }, { value: Infinity }, { text: 'x'.repeat(4001) }, { text: 'a', keys: ['A'] }, { correct: true }, [1], 'A'])
      expect(answerFrom(bad), JSON.stringify(bad)).toBe('bad');
    expect(markOf({ answer: { keys: ['A'] }, flagged: true, seq: 2 })).toBe('answered');
    expect(markOf({ answer: null, flagged: true, seq: 2 })).toBe('not_answered');
    expect(markOf(undefined)).toBe('not_answered');
  });
});

describe('the save queue (C365)', () => {
  const item = (questionId: string, seq: number): SaveItem => ({ questionId, answer: { value: seq }, flagged: false, seq });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('sends each answer, the newest of a question only, and tries again after a lost connection', async () => {
    const sent: SaveItem[] = [];
    const events: QueueEvent['kind'][] = [];
    let offline = 2;
    const sleeps: number[] = [];
    const q = new SaveQueue(
      async (i) => {
        sent.push(i);
        if (offline > 0) {
          offline -= 1;
          return 'network';
        }
        return 'saved';
      },
      (e) => events.push(e.kind),
      async (ms) => {
        sleeps.push(ms);
      }
    );
    q.put(item('q1', 1));
    q.put(item('q1', 2)); // replaces the one not yet sent
    q.put(item('q2', 1));
    for (let i = 0; i < 10 && q.size; i++) await settle();
    expect(q.size).toBe(0);
    expect(sent.map((s) => `${s.questionId}:${s.seq}`)).toEqual(['q1:1', 'q1:2', 'q1:2', 'q2:1']);
    expect(sleeps).toEqual([1000, 2000]);
    expect(events).toContain('offline');
    expect(events.at(-1)).toBe('idle');
  });

  it('stops for good when the server says the test has ended', async () => {
    const events: QueueEvent[] = [];
    const answers: SendResult[] = ['saved', 'closed'];
    const q = new SaveQueue(async () => answers.shift() ?? 'saved', (e) => events.push(e), async () => {});
    q.put(item('q1', 1));
    q.put(item('q2', 1));
    q.put(item('q3', 1));
    for (let i = 0; i < 10; i++) await settle();
    expect(events.filter((e) => e.kind === 'closed')).toHaveLength(1);
    expect(q.size).toBe(0);
    q.put(item('q4', 1));
    expect(q.size).toBe(0);
  });
});
