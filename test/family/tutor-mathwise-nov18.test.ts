import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyboardLift, MIN_ESTIMATE, type LiftInput } from '@/components/family/tutor/keyboard-lift';
import { matchSim, simRowsFromCsv, tightFit, type SimRow } from '@/lib/family/curated-sims';
import { isMathsSum } from '@/lib/family/maths-solve';
import { hasSolvedSum, teachingMove, withTeachingMove, MOVE_LINES } from '@/lib/family/maths-moves';
import { MEMORY_TURNS, WORKED_TEXT } from '@/lib/family/tutor';
import { explanationText, WORKED_MARK, workedText } from '@/lib/family/tutor-shape';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

const SRC = (p: string) => readFileSync(p, 'utf8');
const { rows: ALL } = simRowsFromCsv(SRC('scripts/seed/curated_sims.csv'));
const lang = (l: string) => ALL.filter((r) => r.language === l);

describe('keyboard: the Ask pill above the keys (root cause and fix)', () => {
  const base: LiftInput = { typing: true, innerHeight: 800, baseline: 800, vvHeight: 800, vvOffsetTop: 0, scale: 1, phone: true, settled: false, lastKnown: 0 };
  it('visual viewport smaller than the page: lift by exactly the covered part', () => {
    expect(keyboardLift({ ...base, vvHeight: 480 })).toEqual({ open: true, lift: 320, source: 'visual' });
    expect(keyboardLift({ ...base, vvHeight: 480, vvOffsetTop: 100 })).toEqual({ open: true, lift: 220, source: 'visual' });
  });
  it('the page itself shrank (resizes-content working): open, and not lifted again', () => {
    expect(keyboardLift({ ...base, innerHeight: 480, vvHeight: 480 })).toEqual({ open: true, lift: 0, source: 'resized' });
  });
  it('a phone that tells the page nothing: after the settling time the typical keyboard height is assumed, never 0', () => {
    expect(keyboardLift({ ...base, settled: false }).open).toBe(false);
    const g = keyboardLift({ ...base, settled: true });
    expect(g.source).toBe('estimate');
    expect(g.lift).toBeGreaterThanOrEqual(MIN_ESTIMATE);
    expect(g.lift).toBe(Math.round(800 * 0.42));
    expect(keyboardLift({ ...base, settled: true, lastKnown: 310 }).lift).toBe(310);
    expect(keyboardLift({ ...base, settled: true, lastKnown: 900 }).lift).toBe(Math.round(800 * 0.55));
  });
  it('closed with no text field focused, while pinch-zoomed, and on a desktop or tablet that guesses nothing', () => {
    expect(keyboardLift({ ...base, typing: false, vvHeight: 480 }).open).toBe(false);
    expect(keyboardLift({ ...base, vvHeight: 480, scale: 2 }).open).toBe(false);
    expect(keyboardLift({ ...base, phone: false, settled: true }).open).toBe(false);
  });
  it('the Study dock is fixed (not sticky), raised by the measured lift, with the tab bar tucked; a spacer keeps the feed room', () => {
    const c = SRC('src/components/family/tutor/Composer.tsx');
    const css = SRC('src/app/(family)/family/family.css');
    expect(c).toContain('useKeyboardLift');
    expect(c).toContain("'fixed inset-x-0 bottom-[var(--fam-dock-h,");
    expect(c).not.toMatch(/fam-composer-dock sticky/);
    expect(c).toContain('data-composer-spacer');
    expect(css).toContain("html[data-fam-kb='open'] [data-fam-dock]");
    expect(css).toContain('bottom: var(--fam-kb-lift, 0px)');
    expect(SRC('src/components/family/tutor/keyboard-lift.ts')).toContain("setAttribute('data-fam-kb', 'open')");
  });
  it('the Android Playwright test is in the family harness, in both the visual-viewport and the silent web-view mode', () => {
    const h = SRC('scripts/harness/family.mjs');
    expect(h).toContain("'family-tutor-keyboard-visual'");
    expect(h).toContain("'family-tutor-keyboard-silent'");
    expect(h).toContain('Pixel 7');
    expect(h).toContain('step.kbOpen');
    expect(h).toContain('step.kbClose');
  });
  it('Focus Reading never hides the Ask bar while the child types (verify still works)', () => {
    const f = SRC('src/components/family/tutor/useFocusReading.ts');
    expect(f).toContain('isTyping(document.activeElement)');
  });
});

describe('sims: a tight match to the question, no source by default', () => {
  it('a time-speed or catch-up question gets no simulation, in English and in Hindi', () => {
    for (const [term, c] of [['time speed distance catch up thief policeman', 3], ['speed distance time cyclist friend half an hour later', 5], ['चोर और पुलिस की चाल', 3]] as const)
      for (const l of ['en', 'hi'])
        expect(matchSim(lang(l), { subject: 'mathematics', term, topicEn: term, title: term, chapterEn: 'Speed, Distance and Time' }, { classLevel: c }), `${l} ${term}`).toBeNull();
  });
  it('"time" is not "times tables", and the chapter never lends a fit', () => {
    expect(tightFit('times tables', 'time speed distance')).toBeLessThan(0.67);
    expect(tightFit('multiplication tables', 'multiplication tables of 7')).toBe(1);
    expect(matchSim(lang('en'), { subject: 'mathematics', term: 'speed', chapterEn: 'Multiplication' }, { classLevel: 4 })).toBeNull();
  });
  it('a question that is about a sim topic still finds it', () => {
    expect(matchSim(lang('en'), { subject: 'mathematics', term: 'area of rectangle', topicEn: 'area of rectangle' }, { classLevel: 4 })?.title).toContain('Area Model');
    expect(matchSim(lang('en'), { subject: 'science', term: 'energy' }, { classLevel: 5 })?.embed).toContain('energy-forms-and-changes');
  });
  it('the source is not a ranking: an OLabs row that fits equally is not beaten by PhET being first', () => {
    const row = (o: Partial<SimRow>): SimRow => ({ class: '6-8', subject: 'Science', chapter_name: '', topic: 'lever', language: 'en', source: 'phet', title: 'Lever PhET', embed_url: 'https://phet.colorado.edu/sims/html/balancing-act/latest/balancing-act_en.html', page_url: 'https://phet.colorado.edu/en/simulations/balancing-act', licence: 'CC BY 4.0', preview: null, chapter_number: '', ...o });
    const phet = row({});
    const olabs = row({ source: 'olabs', title: 'Lever OLabs', embed_url: 'https://www.olabs.edu.in/?sub=1&brch=2&sim=3&cnt=4', page_url: 'https://www.olabs.edu.in/?sub=1&brch=2&sim=3&cnt=4', licence: 'OLabs' });
    const first = matchSim([olabs, phet], { subject: 'science', term: 'lever' }, { classLevel: 7 });
    const second = matchSim([phet, olabs], { subject: 'science', term: 'lever' }, { classLevel: 7 });
    expect(first?.source).toBe('olabs');
    expect(second?.source).toBe('phet');
    expect(SRC('src/lib/family/curated-sims.ts')).not.toContain('EMBED_ORDER');
  });
});

describe('maths: the teacher\'s moves keep the same sum (Mathwise patterns)', () => {
  const solved = { problem: 'A thief runs at 90 km/h. A policeman starts 5 minutes later at 108 km/h.', given: ['Thief 90 km/h', 'Policeman 108 km/h', 'Head start 5 min'], find: ['Time to catch', 'Distance'], steps: [{ text: 'Thief head start', expression: '90 × 5 ÷ 60', result: '7.5 km' }, { text: 'Gain per hour', expression: '108 − 90', result: '18 km/h' }], answer: '25 minutes after the policeman starts, 45 km' };
  const memory = { turns: [{ role: 'child' as const, text: 'thief 90' }, { role: 'tutor' as const, text: workedText(solved) }] };
  const chatNoSum = { turns: [{ role: 'child' as const, text: 'hi' }, { role: 'tutor' as const, text: 'Hello' }] };
  it('"I don\'t know" in Hinglish, English and Hindi is a don\'t-know move; a lone one with no chat is a new question', () => {
    for (const t of ['Mujhe nhi pata', 'Mujhe nhi samajh aarha hai', "I don't understand", 'मुझे नहीं पता', 'No idea']) expect(teachingMove(t, memory), t).toBe('dontknow');
    expect(teachingMove('Mujhe nhi pata', { turns: [] })).toBeNull();
    expect(teachingMove('Mujhe nhi pata', null)).toBeNull();
  });
  it('the full method, still unclear, and a what-if each pick their own move', () => {
    expect(teachingMove('App ek baar pura samjhao', memory)).toBe('full');
    expect(teachingMove('explain it all step by step', memory)).toBe('full');
    expect(teachingMove('Abhi bhi mujhe kuch samajh nahi aaya', memory)).toBe('restart');
    expect(teachingMove('I still do not understand', memory)).toBe('restart');
    expect(teachingMove('but if the policeman started 10 minutes later?', memory)).toBe('whatif');
    expect(teachingMove('agar policeman 10 minute baad shuru ho', memory)).toBe('whatif');
    expect(teachingMove('what if he started 10 minutes later', chatNoSum)).toBeNull();
  });
  it('a long pasted question is not a move', () => {
    expect(teachingMove(`Two poles of equal heights are standing opposite each other on either side of a road, which is 80 m wide. From a point between them on the road, the angles of elevation of the top of the poles are 60° and 30°, respectively. Find the height of the poles and the distances of the point from the poles. I don't understand it.`, memory)).toBeNull();
  });
  it('the two buttons that ask for another way are the same moves, without pasting the sum', () => {
    for (const w of [en, hi] as Record<string, string>[]) {
      expect(w['fam.solve.ask.simpler']).not.toContain('{problem}');
      expect(w['fam.solve.ask.differently']).not.toContain('{problem}');
    }
    expect(teachingMove(en['fam.solve.ask.simpler'] as string, memory)).toBe('dontknow');
    expect(teachingMove(en['fam.solve.ask.differently'] as string, memory)).toBe('restart');
    expect(teachingMove(hi['fam.solve.ask.simpler'] as string, memory)).toBe('dontknow');
    expect(teachingMove(hi['fam.solve.ask.differently'] as string, memory)).toBe('restart');
  });
  it('each move says: same sum, warm first or by reasons, no story card, no video', () => {
    for (const m of ['dontknow', 'restart', 'full', 'whatif'] as const) {
      expect(MOVE_LINES[m]).toContain('SAME sum');
      expect(MOVE_LINES[m]).toMatch(/no (elaboration|new story)/i);
    }
    expect(MOVE_LINES.dontknow).toContain('Koi baat nahi, main hoon na');
    expect(MOVE_LINES.full).toContain('Ek baar pura solution dekh lo');
    expect(MOVE_LINES.restart).toContain('Kya itni baat samajh aayi?');
    expect(withTeachingMove('Intro\nRules: x', 'dontknow')).toMatch(/Intro\nTHE CHILD SAYS[\s\S]*\nRules: x$/);
    expect(withTeachingMove('Intro', null)).toBe('Intro');
  });
  it('the resolver takes a sum or a move out of the elaboration, and the live sums are sums', () => {
    const r = SRC('src/lib/family/resolver.ts');
    expect(r).toContain('const elaborate = prompt.elaborate === true && plainQuestion && !solve && move === null;');
    expect(r).toContain('withTeachingMove(withMathsSolve(');
    expect(isMathsSum('mathematics', 'एक चोर 90 km/h की चाल से भाग रहा है। पुलिसवाला 5 मिनट बाद 108 km/h से पीछे दौड़ता है। वह चोर को कितनी देर में पकड़ेगा?')).toBe(true);
    expect(isMathsSum('mathematics', 'A cyclist rides at 10 km/h. His friend leaves half an hour later at 15 km/h. When will the friend catch him?')).toBe(true);
    expect(isMathsSum('mathematics', 'Why is 1/2 the same as 2/4?')).toBe(false);
  });
});

describe('history: the last problem and its working travel with a follow-up', () => {
  const w = { problem: '80 m road, 60° and 30°', given: ['road 80 m'], find: ['h'], steps: [{ text: 'tan 60°', expression: 'x × 1.732', result: 'h' }], answer: 'x = 20 m, 80 − x = 60 m, h = 20√3 m' };
  it('a worked example is remembered whole, with its numbers, and wins over a story paragraph', () => {
    const t = explanationText([{ type: 'explanation', paragraphs: ['A story.'] }, { type: 'worked_example', ...w }]);
    expect(t.startsWith(WORKED_MARK)).toBe(true);
    expect(t).toContain('x = 20 m, 80 − x = 60 m');
    expect(t).not.toContain('A story');
    expect(explanationText([{ type: 'explanation', paragraphs: ['Only this.'] }])).toBe('Only this.');
    expect(hasSolvedSum({ turns: [{ role: 'tutor', text: t }] })).toBe(true);
  });
  it('the window is 10 turns, and a solved sum is kept up to 1,600 characters', () => {
    expect(MEMORY_TURNS).toBe(10);
    expect(WORKED_TEXT).toBe(1600);
    const t = SRC('src/lib/family/tutor.ts');
    expect(t).toContain('clipTutor(explanationText(r.blocks))');
  });
});

describe('verify still works (PR #441 and #442)', () => {
  it('the clock is the chat / chapters toggle; no history list; no frozen question strip; the puck is scroll-only', () => {
    const win = SRC('src/components/family/tutor/TutorWindow.tsx');
    expect(win).toContain('historyOpen={open && shown}');
    expect(win).not.toContain('ConversationList');
    expect(existsSync('src/components/family/tutor/ConversationList.tsx')).toBe(false);
    expect(existsSync('src/components/family/tutor/QuestionNavigator.tsx')).toBe(false);
    expect(SRC('src/components/family/tutor/QuestionPuck.tsx')).toContain("addEventListener('scroll'");
  });
  it('Draw is gone from the Ask bar; the jump-to-latest control rides the dock', () => {
    const c = SRC('src/components/family/tutor/Composer.tsx');
    expect(c).not.toMatch(/data-tutor-draw/);
    expect(c).toContain('{p.above && ');
  });
  it('the bottom bar shows every tab\'s full label and the Study column is 68rem on desktop for the dock, the feed and the Ask bar', () => {
    const tabs = SRC('src/components/family/FamilyTabs.tsx');
    expect(tabs).toContain('data-tab-label');
    expect(tabs).toContain('lg:max-w-[68rem]');
    expect(SRC('src/components/family/tutor/Composer.tsx')).toContain('lg:max-w-[68rem]');
    expect(SRC('src/app/(family)/family/(app)/study/page.tsx')).toContain('lg:max-w-[68rem]');
  });
  it('the mobile gutters are 8 px outside and 12 px inside, and pictures run the card\'s full width', () => {
    const page = SRC('src/app/(family)/family/(app)/study/page.tsx');
    expect(page).toMatch(/data-study-main[^>]*px-2 [^>]*sm:px-3/);
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toContain('padding: 0.5rem 0.25rem;');
    expect(css).toContain("[data-fullscreen-stage='off']");
    expect(css).toContain('width: calc(100% + 0.5rem);');
  });
});
