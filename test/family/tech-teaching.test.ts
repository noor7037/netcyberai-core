// C557: the teaching layer of the Tech & AI Lab — every picture has a renderer, Guided Teacher Mode reads the lesson in
// order and never a question, the picture lights the part each beat explains, and the reference chapters teach the
// accurate model.
import { describe, expect, it } from 'vitest';
import { narrationScript } from '@/lib/family/blocks';
import { guideTimeline, techlabToBlocks } from '@/lib/family/tech/blocks';
import { courseCatalog, lessonById, lessonForChild } from '@/lib/family/tech/catalog';
import { introLines, type TechPersonal } from '@/lib/family/tech/personal';
import { pick } from '@/lib/family/tech/text';
import { auditLesson, lessonProblems, visualKind } from '@/lib/family/tech/validate';

const me: TechPersonal = { name: 'Alsifa', prevTitle: null, nextTitle: null, returning: false };
const REF = ['L1.using-devices.01', 'L2.inside-computer.01', 'L3.computer-architecture.01'];
const all = () => courseCatalog().units.flatMap((unit) => unit.lessons.map((row) => lessonById(row.key)!));

describe('every lesson file', () => {
  it('names only picture kinds that have a renderer or an honest stand-in, and is complete in three languages', () => {
    const lessons = all();
    expect(lessons.length).toBe(281);
    const problems = lessons.flatMap((lesson) => lessonProblems(lesson));
    expect(problems).toEqual([]);
  });

  it('an unknown picture kind is caught, never drawn as an unrelated card', () => {
    expect(visualKind('anim:fde-cycle')).toBe('anim');
    expect(visualKind('code')).toBe('code');
    expect(visualKind('hologram:x')).toBeNull();
    expect(lessonProblems({ ...lessonById('L2.cloud.01')!, see: [{ visual: 'hologram:x' }] })[0]).toMatch(/no renderer/);
  });
});

describe('Guided Teacher Mode', () => {
  const lesson = lessonById('L3.computer-architecture.01')!;
  const timeline = guideTimeline(lesson, me);

  it('reads the opening, each step and its beats, every Understand card, then the summary, in that order', () => {
    expect(timeline[0].blockId).toBe(`${lesson.id}.intro`);
    expect(timeline[timeline.length - 1].blockId).toBe(`${lesson.id}.wrap`);
    const see = timeline.filter((s) => s.phase === 'see' && s.beat == null && !s.blockId.endsWith('.intro')).map((s) => s.step);
    expect(see).toEqual([0, 1, 2, 3]);
    const cards = timeline.filter((s) => s.phase === 'understand' && !s.blockId.endsWith('.wrap')).map((s) => s.step);
    expect(cards).toEqual(lesson.understand!.map((_, i) => i));
    // Every segment is a real Reader block, so the voice and captions have words for it.
    const ids = new Set(techlabToBlocks(lesson, 'hinglish', me).map((b) => (b as { id?: string }).id));
    for (const segment of timeline) expect(ids.has(segment.blockId)).toBe(true);
  });

  it('never reads a question, an option or an answer', () => {
    const lessonText = JSON.stringify(techlabToBlocks(lesson, 'en', me));
    for (const q of lesson.try!.questions!) {
      expect(lessonText).not.toContain(pick('en', q.prompt));
      expect(lessonText).not.toContain(pick('en', q.explain));
    }
    expect(timeline.some((s) => s.blockId.includes('.try'))).toBe(false);
  });

  it('lights the part each beat explains: ADD R1, [100] takes R1 from 5 to 12', () => {
    const beats = timeline.filter((s) => s.step === 1 && s.beat != null && s.phase === 'see');
    expect(beats.map((b) => b.focus)).toEqual(['pc', 'ir', 'cu', 'mem', 'alu', 'r1', 'pc']);
    expect(beats[0].values).toMatchObject({ pc: '200', r1: '5' });
    expect(beats[3].values).toMatchObject({ mem: '[100] = 7' });
    expect(beats[5].values).toMatchObject({ r1: '12' });
    expect(beats[6].values).toMatchObject({ pc: '201' });
  });

  it('the server voice’s copy has the beats but no name, no opening and no summary', () => {
    const server = narrationScript(techlabToBlocks(lesson, 'en'));
    expect(server.some((line) => line.text.includes('Write back'))).toBe(true);
    expect(server.some((line) => /Alsifa|\{\{/.test(line.text))).toBe(false);
    expect(JSON.stringify(techlabToBlocks(lesson, 'en'))).not.toMatch(/\.intro"|\.wrap"/);
  });

  it('opens with the lesson’s own situation and question, by name, in each language', () => {
    for (const lang of ['en', 'hi', 'hinglish'] as const) {
      const lines = introLines(lesson.id, lang, me, lesson.hook).join(' ');
      expect(lines).toContain('Alsifa');
      expect(lines).toContain('23 + 19');
    }
  });

  it('a lesson without beats or a hook still plays: steps and cards in order, a general opening', () => {
    const plain = lessonById('L2.cloud.02')!;
    const t = guideTimeline({ ...plain, hook: undefined }, me);
    expect(t.length).toBe(1 + plain.see!.length + plain.understand!.length + 1);
    expect(introLines(plain.id, 'en', me)[0]).toContain('Alsifa');
  });
});

describe('the reference chapters', () => {
  it('each meets the standard: opening, prediction, teach-back, every picture drawn, narration tied to parts', () => {
    for (const id of REF) {
      const audit = auditLesson(lessonById(id)!);
      expect(audit, id).toMatchObject({ grade: 'meets', hook: true, predict: true, teachBack: true, beats: true });
      expect(audit.drawn, id).toBe(audit.pictures);
    }
  });

  it('teach the accurate model: the field, not "electricity out of your finger"; the CPU executes, it does not think', () => {
    const tap = JSON.stringify(lessonById('L1.using-devices.01')!.understand);
    expect(tap).toMatch(/electric field/);
    expect(tap).not.toMatch(/finger also carries/i);
    const parts = lessonById('L2.inside-computer.01')!;
    expect(pick('en', parts.understand![0].body)).toMatch(/executes instructions/);
    expect(pick('en', parts.understand![0].body)).not.toMatch(/thinks/);
    expect(JSON.stringify(parts.understand)).toMatch(/system-on-chip/);
  });

  it('the phone copy has the prediction’s question and choices but not its answer, and hides every question’s answer', () => {
    for (const id of REF) {
      const copy = lessonForChild(id)!;
      expect(copy.predict?.options.length).toBeGreaterThan(1);
      expect(copy.predict?.answer).toBeUndefined();
      expect(copy.predict?.explain).toBeUndefined();
      expect(JSON.stringify(copy)).not.toContain('"answer"');
      for (const q of copy.try!.questions!) {
        expect(q.answer).toBeUndefined();
        expect(q.explain).toBeUndefined();
      }
    }
  });
});
