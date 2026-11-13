import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import type { AppFlag } from '@/lib/contracts/app-flags';
import { familyModuleRows } from '@/lib/control/apps';
import { switchOn, type FamilySwitches } from '@/lib/family/flags';
import { tutorParts } from '@/lib/family/tutor-parts';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { TutorHall } from '@/components/family/TutorHall';
import { TutorsTile } from '@/components/family/TutorsTile';
import { AnswerBlock } from '@/components/family/UnderstandView';
import { TutorSwitches } from '@/components/family/tutor/switches';
import { TutorWindow } from '@/components/family/tutor/TutorWindow';

// W16-B5: every part of the Tutor programme has its own Control → Apps switch, on by default (C398). Switched off, the
// part hides its entry points and its route answers "This part is switched off". Made-up names only.
//   1. The registry lists the five parts, each named in English and Hindi, and Control lists them on.
//   2. Each switch is on with nothing saved, and off once Control saves it off (or the whole app is off).
//   3. The routes (the Hall, the call) answer the switched-off page; the entries (the Tutors tile, the Hall's Call
//      button, the composer's call link, the board) are not drawn.

const PARTS = ['tutor_hall', 'tutor_call', 'tutor_board', 'tutor_quiz', 'tutor_reports'] as const;
const flag = (module: string, over: Partial<AppFlag> = {}): AppFlag => ({ app: 'family', module, enabled: true, audience: 'everyone', audiencePercent: null, audienceSchools: null, endsAt: null, offMessageEn: null, offMessageHi: null, ...over }) as AppFlag;
const switches = (flags: AppFlag[]): FamilySwitches => ({ flags, banners: [], isPreview: false, accountId: null, minShell: 0 });
const off = (...modules: string[]) => switches([flag('*'), ...modules.map((m) => flag(m, { enabled: false }))]);

const state: { switches: FamilySwitches; page: unknown } = { switches: switches([flag('*')]), page: null };

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); }, usePathname: () => '/family/study', useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/family/server', async (orig) => {
  const real = await orig<typeof import('@/lib/family/server')>();
  return { ...real, requireFamilyPage: async () => state.page, firstStepsNext: () => null, familyPageRead: async (_page: unknown, fn: (db: unknown) => unknown) => fn({}) };
});
vi.mock('@/lib/family/flags', async (orig) => ({ ...(await orig<typeof import('@/lib/family/flags')>()), readFamilySwitches: async () => state.switches }));
vi.mock('@/lib/family/catalog', async (orig) => ({ ...(await orig<typeof import('@/lib/family/catalog')>()), classSubjects: async () => ['mathematics', 'science'] }));
vi.mock('@/lib/family/voice', async (orig) => ({ ...(await orig<typeof import('@/lib/family/voice')>()), voiceDay: async () => ({ left: 300, limit: 600 }) }));
vi.mock('@/lib/family/voice-out', async (orig) => ({ ...(await orig<typeof import('@/lib/family/voice-out')>()), realtimeReady: async () => false }));
vi.mock('@/lib/family/tutors', async (orig) => ({
  ...(await orig<typeof import('@/lib/family/tutors')>()),
  loadHall: async () => [{ school: null, tutors: [{ key: 'maths', subject: 'mathematics', name: 'Maths Tutor', style: 'Shows each step.', language: 'both', tint: 'mint', avatar: 'maths', persona: { name: 'Maths Tutor', style: 'Shows each step.', language: 'both' } }] }],
}));

const child = { childId: 'f0000000-0000-4000-8000-0000000000c1', firstName: 'Asha', classLevel: 8, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-UP', freeSubject: null, stream: null };
const pageFor = (lang: 'en' | 'hi') => ({ session: { accountId: 'f0000000-0000-4000-8000-0000000000a1', tokenVersion: 0 }, account: { hasPin: true }, consents: { study_core: true, voice_practice: true }, children: [child], child, parentMode: false, childLang: lang, parentLang: 'en' });

beforeEach(() => {
  state.switches = switches([flag('*')]);
  state.page = pageFor('en');
});

describe('the five switches are listed, named and on by default', () => {
  it('are registry modules, built, each named in English and Hindi, and the old single Hall flag is gone', () => {
    for (const m of PARTS) {
      expect(FAMILY_MODULES.find((x) => x.flag === m)?.built, m).toBe(true);
      expect(en[`control.apps.module.label.${m}` as keyof typeof en], `en ${m}`).toBeTruthy();
      expect(hi[`control.apps.module.label.${m}` as keyof typeof hi], `hi ${m}`).toBeTruthy();
    }
    expect(FAMILY_MODULES.some((x) => x.flag === 'tutors')).toBe(false);
  });

  it('Control → Apps lists each one on, for everyone, until it is saved', () => {
    for (const m of PARTS) expect(familyModuleRows([]).find((r) => r.flag.module === m), m).toEqual({ everSet: false, flag: expect.objectContaining({ module: m, enabled: true, audience: 'everyone' }) });
  });

  it('are on with nothing saved, and off when Control saves them off, one at a time', () => {
    for (const m of PARTS) {
      expect(switchOn(switches([flag('*')]), m), `${m} default`).toBe(true);
      expect(switchOn(off(m), m), `${m} off`).toBe(false);
      expect(switchOn(switches([flag('*', { enabled: false })]), m), `${m} app off`).toBe(false);
      for (const other of PARTS.filter((p) => p !== m)) expect(switchOn(off(m), other), `${other} unaffected by ${m}`).toBe(true);
    }
  });

  it('the call is offered only while the modules it is built on are on too', () => {
    expect(tutorParts(switches([flag('*')]))).toEqual({ hall: true, call: true, board: true, quiz: true, reports: true });
    expect(tutorParts(off('tutor_call')).call).toBe(false);
    expect(tutorParts(off('voice_input')).call).toBe(false);
    expect(tutorParts(off('understand')).call).toBe(false);
    expect(tutorParts(off('tutor_call'))).toMatchObject({ hall: true, board: true });
  });
});

describe('a switched-off part hides its routes', () => {
  it('the Tutor Hall route answers the switched-off page, and lists the tutors when on', async () => {
    const { default: Page } = await import('@/app/(family)/family/(app)/tutors/page');
    expect(renderToStaticMarkup(await Page())).toContain('data-tutor-group');
    state.switches = off('tutor_hall');
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-tutors-off');
    expect(html).toContain('The Tutor Hall is switched off for now.');
    expect(html).not.toContain('data-tutor-group');
    state.page = pageFor('hi');
    expect(renderToStaticMarkup(await Page())).toContain('ट्यूटर हॉल अभी बंद है।');
  });

  it('Control’s own words for an off Hall are shown in place of ours, in the family’s language', async () => {
    const { default: Page } = await import('@/app/(family)/family/(app)/tutors/page');
    state.switches = switches([flag('*'), flag('tutor_hall', { enabled: false, offMessageEn: 'Back after the holidays.' })]);
    expect(renderToStaticMarkup(await Page())).toContain('Back after the holidays.');
  });

  it('the call route answers the switched-off page (and the call screen when on), in both languages', async () => {
    const { default: Page } = await import('@/app/(family)/family/(app)/call/page');
    const on = renderToStaticMarkup(await Page({ searchParams: { tutor: 'maths', subject: 'mathematics' } }));
    expect(on).toContain('data-call');
    expect(on).toContain('Maths Tutor');
    expect(on).toContain('href="/family/study?subject=mathematics&amp;tutor=maths"');
    state.switches = off('tutor_call');
    const html = renderToStaticMarkup(await Page({ searchParams: { tutor: 'maths' } }));
    expect(html).toContain('data-call-refused');
    expect(html).toContain('Calling a tutor is switched off for now.');
    expect(html).not.toContain('data-call-bar');
    state.page = pageFor('hi');
    expect(renderToStaticMarkup(await Page({ searchParams: {} }))).toContain('ट्यूटर को कॉल करना अभी बंद है।');
  });

  it('a call to a Hall that is off still happens, with no tutor named and none kept', async () => {
    const { default: Page } = await import('@/app/(family)/family/(app)/call/page');
    state.switches = off('tutor_hall');
    const html = renderToStaticMarkup(await Page({ searchParams: { tutor: 'maths', subject: 'science' } }));
    expect(html).toContain('data-call');
    // C511: the header chip names the default tutor.
    expect(html).toContain('Your tutor');
    expect(html).not.toContain('Maths Tutor');
    expect(html).toContain('href="/family/study?subject=science"');
  });
});

describe('a switched-off part hides its entry points', () => {
  const tutor = { key: 'maths', subject: 'mathematics' as const, name: 'Maths Tutor', style: 'Shows each step.', language: 'both' as const, tint: 'mint' as const, avatar: 'maths', persona: { name: 'Maths Tutor', style: 'Shows each step.', language: 'both' as const } };
  const w = Object.fromEntries(Object.keys(en).map((k) => [k, en[k as keyof typeof en] as string]));

  it('the Hall offers Call beside Chat, with the subject, and Chat alone when the call is off', () => {
    const html = renderToStaticMarkup(h(TutorHall, { groups: [{ school: null, tutors: [tutor] }], w }));
    expect(html).toContain('data-tutor-chat');
    expect(html).toContain('href="/family/call?tutor=maths&amp;subject=mathematics"');
    const noCall = renderToStaticMarkup(h(TutorHall, { groups: [{ school: null, tutors: [tutor] }], w, call: false }));
    expect(noCall).toContain('data-tutor-chat');
    expect(noCall).not.toContain('data-tutor-call');
    expect(noCall).not.toContain('/family/call');
  });

  it('the Study composer shows the call link only when given one, naming the tutor', () => {
    const props = { w, subject: 'mathematics' as const, tone: 'mathematics', voice: { secondsLeft: 300 }, tutor: { key: 'maths', name: 'Maths Tutor' } };
    const withCall = renderToStaticMarkup(h(TutorWindow, { ...props, call: { href: '/family/call?tutor=maths&subject=mathematics', label: 'Call Maths Tutor' } }));
    expect(withCall).toContain('data-tutor-call-link');
    expect(withCall).toContain('aria-label="Call Maths Tutor"');
    expect(withCall).toContain('href="/family/call?tutor=maths&amp;subject=mathematics"');
    expect(withCall).toContain('data-voice-input');
    const without = renderToStaticMarkup(h(TutorWindow, props));
    expect(without).not.toContain('data-tutor-call-link');
    expect(without).toContain('data-voice-input');
  });

  it('the Tutors tile lists the tutors’ names and opens the Hall; none are drawn without names', () => {
    const html = renderToStaticMarkup(h(TutorsTile, { title: 'Tutors', lead: 'Chat or call a tutor for each subject.', names: [{ key: 'maths', name: 'Maths Tutor', tint: 'mint' }, { key: 'science', name: 'Science Tutor', tint: 'butter' }] }));
    expect(html).toContain('href="/family/tutors"');
    expect(html).toContain('data-tutors-tile');
    expect(html).toContain('Maths Tutor');
    expect(html).toContain('Science Tutor');
    expect(html).toContain('bg-lesson-mint');
    expect(renderToStaticMarkup(h(TutorsTile, { title: 'Tutors', lead: 'x', names: [] }))).not.toContain('data-tutor-names');
  });

  it('the board and the simulations are left out of an answer while tutor_board is off, and the words stay', () => {
    const board = { type: 'board', steps: [{ say: 'First.', commands: [] }] } as never;
    const sim = { type: 'scene', sim: 'pressure_depth', title: 'Pressure', links: [], parts: [] } as never;
    const words = { type: 'key_points', title: 'Remember', points: ['One thing.'] } as never;
    const draw = (b: never, boardOn: boolean) => renderToStaticMarkup(h(TutorSwitches, { board: boardOn, children: h(AnswerBlock, { b, w, tone: 'mathematics', onRetry: () => {} }) }));
    expect(draw(board, false)).toBe('');
    expect(draw(sim, false)).toBe('');
    expect(draw(words, false)).toContain('One thing.');
    expect(draw(words, true)).toContain('One thing.');
  });
});
