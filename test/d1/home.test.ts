import fs from 'fs';
import path from 'path';
import emojiRegex from 'emoji-regex';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
import { AskBox } from '@/components/family/home/AskBox';
import { HomeHeader } from '@/components/family/home/HomeHeader';
import { SubjectTiles } from '@/components/family/home/SubjectTiles';
import { TalkCard } from '@/components/family/home/TalkCard';
import { HabitCard } from '@/components/family/HabitCard';
import { PlanCard } from '@/components/family/PlanCard';
import { EmptyState } from '@/components/family/ui/EmptyState';
import type { FamilyChild } from '@/lib/family/children';
import { greetingOf, homeParts, indiaHour, stageOf, subjectTiles, SUBJECT_PICTURES, type HomeInput } from '@/lib/family/home';
import { pictureFile } from '@/lib/family/pictures';
import { SUBJECT_COLOURS } from '@/lib/family/subject-colours';
import { subjectsOfClass, type Subject } from '@/lib/family/subjects';
import { t } from '@/lib/i18n';

// D1-2 (C294): the home as in the overview board. Which parts show for which switches and consents, the subject tiles
// following the class's subjects and colours, the first-time welcome, and no emoji text on the home (pictures only).

const base: HomeInput = {
  modules: { plan: true, habit: true, homework: true, voiceInput: true },
  consents: { voicePractice: true },
  hasPlan: true,
  hasHabit: true,
  hasTalk: true,
  subjects: 4,
  progress: 3,
};
const w = new Proxy({} as Record<string, string>, { get: (_, k: string) => t('en', k as never) });

describe('which parts of the home show', () => {
  it('shows every part when every module is on and the data exists', () => {
    expect(homeParts(base)).toEqual({ plan: true, camera: true, microphone: true, talk: true, week: true, tiles: true, welcome: false });
  });
  it('plan off: no plan card', () => expect(homeParts({ ...base, modules: { ...base.modules, plan: false } }).plan).toBe(false));
  it('a plan with no items: no plan card', () => expect(homeParts({ ...base, hasPlan: false }).plan).toBe(false));
  it('homework off: no camera', () => expect(homeParts({ ...base, modules: { ...base.modules, homework: false } }).camera).toBe(false));
  it('voice on without the parent consent: no microphone', () => expect(homeParts({ ...base, consents: { voicePractice: false } }).microphone).toBe(false));
  it('consent given but voice input off: no microphone', () => expect(homeParts({ ...base, modules: { ...base.modules, voiceInput: false } }).microphone).toBe(false));
  it('habit off: no talk question and no week', () => {
    const p = homeParts({ ...base, modules: { ...base.modules, habit: false } });
    expect([p.talk, p.week]).toEqual([false, false]);
  });
  it('habit on without a talk question: no talk card', () => expect(homeParts({ ...base, hasTalk: false }).talk).toBe(false));
  it('a first-time child gets the welcome, never an empty card', () => {
    expect(homeParts({ ...base, hasPlan: false, progress: 0, hasTalk: false }).welcome).toBe(true);
    expect(homeParts({ ...base, hasPlan: false, progress: 0, subjects: 0 })).toMatchObject({ welcome: true, tiles: false });
    expect(homeParts({ ...base, hasPlan: false, progress: 2 }).welcome).toBe(false);
  });
});

describe('greeting and stage', () => {
  it('greets by the hour in India', () => {
    expect(indiaHour(new Date('2026-10-22T02:00:00Z'))).toBe(7);
    expect(indiaHour(new Date('2026-10-22T20:00:00Z'))).toBe(1);
    expect([7, 13, 19, 1].map(greetingOf)).toEqual(['morning', 'afternoon', 'evening', 'evening']);
  });
  it('classes 1–5 are young, 9 and up senior', () => expect([1, 5, 6, 8, 9, 12].map(stageOf)).toEqual(['young', 'young', 'middle', 'middle', 'senior', 'senior']));
});

describe('the subject tiles', () => {
  it('follow the class subjects, free one first, in their colours and with a bundled picture each', () => {
    const subjects = subjectsOfClass(7, [], 'CBSE');
    const tiles = subjectTiles(subjects, [{ subject: 'science', mastered: true }, { subject: 'science', mastered: false }], 'science');
    expect(tiles.map((x) => x.subject)).toEqual(['science', ...subjects.filter((s) => s !== 'science')]);
    for (const x of tiles) {
      expect(x.colour).toBe(SUBJECT_COLOURS[x.subject]);
      expect(fs.existsSync(path.join(process.cwd(), 'public/family/pictures', `${pictureFile(x.picture)}.svg`))).toBe(true);
      expect(x.open).toBe(x.subject === 'science');
    }
    expect(tiles[0]).toMatchObject({ checked: 2, mastered: 1, isFree: true, href: '/family/study?subject=science' });
  });
  it('are all open before a free subject is chosen', () => expect(subjectTiles(['mathematics', 'english'], [], null).every((x) => x.open)).toBe(true));
  it('every subject has a picture, none religious', () => {
    for (const s of Object.keys(SUBJECT_COLOURS) as Subject[]) expect(SUBJECT_PICTURES[s]).toBeTruthy();
    expect(Object.values(SUBJECT_PICTURES)).not.toContain('🕉️');
  });
  it('mark a closed subject calmly, without a price', () => {
    const html = renderToStaticMarkup(h(SubjectTiles, { w, tiles: subjectTiles(['mathematics', 'english'], [], 'mathematics'), stage: 'middle' }));
    expect(html).toContain('Opens with Family Plus later');
    expect(html).not.toMatch(/₹|Rs\.?\s?\d|price/i);
  });
});

describe('no emoji text on the home', () => {
  const child = { childId: 'c1', firstName: 'Asha', classLevel: 7, freeSubject: 'mathematics' } as unknown as FamilyChild;
  const html = [
    renderToStaticMarkup(h(HomeHeader, { w, child, children: [child], greeting: 'morning', stage: 'middle' })),
    renderToStaticMarkup(h(AskBox, { w, camera: true, voice: { secondsLeft: 60 }, tone: 'mathematics' })),
    renderToStaticMarkup(h(SubjectTiles, { w, tiles: subjectTiles(['mathematics', 'science'], [], 'mathematics'), stage: 'young' })),
    renderToStaticMarkup(h(TalkCard, { w, talk: { template: 1, topic: 'Fractions' } })),
    renderToStaticMarkup(
      h(PlanCard, { lang: 'en', plan: { day: '2026-10-22', minutes: 10, complete: false, items: [{ kind: 'next', topicKey: 'a.t1', subject: 'science', minutes: 10, title: 'Light', done: true, isTopic: true }] } })
    ),
    renderToStaticMarkup(h(HabitCard, { lang: 'en', habit: { week: [true, false, false, false, false, false, true], doneDays: 2, goal: 5, badges: [{ topicKey: 'a', title: 'Light' }], jar: null } as never })),
    renderToStaticMarkup(h(EmptyState, { e: '👋', title: 'Welcome', action: { href: '/family/study', label: 'Start' } })),
  ].join('');
  it('shows every picture through Picture, never as text', () => {
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text.match(emojiRegex()) ?? []).toEqual([]);
    expect(html).toContain('/family/pictures/');
  });
  it('the ask box shows the camera and microphone only when given', () => {
    expect(html).toContain('data-ask-camera');
    expect(html).toContain('data-ask-microphone');
    const bare = renderToStaticMarkup(h(AskBox, { w, camera: false, voice: null, tone: 'mathematics' }));
    expect(bare).not.toContain('data-ask-camera');
    expect(bare).not.toContain('data-ask-microphone');
  });
  it('the plan item carries its subject chip in the subject colour', () => expect(html).toContain(SUBJECT_COLOURS.science.chip));
});
