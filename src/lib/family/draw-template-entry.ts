// The small part of the drawing templates a lesson page needs (C514): one template's type and the few functions that act
// on a single entry. It holds none of the manifest, so a page that is given its one template by the server does not
// download the whole list. draw-templates.ts re-exports all of it.
import type { DrawTemplate } from './draw-contract';

export type DrawLang = 'en' | 'hi';
export type DrawCategory = 'colour' | 'learn' | 'play' | 'art';
type Words = { en: string; hi: string };

export type DrawTemplateEntry = {
  id: string;
  classes: readonly [number, number];
  subject: string;
  chapterKey: string | null;
  title: Words;
  task: Words;
  labels: { en: readonly string[]; hi: readonly string[] };
  palette: readonly string[];
  // A parent turns on "Allow all drawing activities" for the child before this one opens.
  parentGate: boolean;
  // C517: guided steps for LKG to Class 4 (engagement mode), and a line of background context; both optional.
  steps?: readonly { en: string; hi: string; at?: { x: number; y: number } }[];
  context?: Words;
  // C517: an activity kind. Such a template shows under its kind (for every class in range), not under a school subject.
  cat?: DrawCategory;
};

export const templateSrc = (id: string) => `/draw/templates/${id}.svg`;

// Locked until a parent allows drawing activities for the child.
export const isLocked = (t: DrawTemplateEntry, allowed: boolean) => t.parentGate && !allowed;

// The template in the shape the studio takes (the contract), in the child's language, with its outline's text.
export function toStudioTemplate(t: DrawTemplateEntry, lang: DrawLang, outlineSvg: string, subject: string, classLevel: number): DrawTemplate {
  return {
    id: t.id, title: t.title[lang], task: t.task[lang], outlineSvg, palette: t.palette, labels: t.labels[lang], subject, classLevel, chapterKey: t.chapterKey,
    ...(t.steps ? { steps: t.steps.map((x) => ({ text: x[lang], ...(x.at ? { at: x.at } : {}) })) } : {}),
    ...(t.context ? { context: t.context[lang] } : {}),
  };
}

