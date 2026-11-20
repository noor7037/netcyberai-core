import type { IconName } from '@/components/visual/Icons';
import type { ModuleId } from '@/lib/contracts/modules';
import type { Tone } from '@/lib/semantic';

// One feature's public page, /features/<slug> (C533, supervisor 20 Nov 2026). Facts only from
// docs/website/ECOSYSTEM_FACTS.md and the feature's own code. A school feature names its `module`: its status is shown
// from src/content/module-status.ts, never written in the text. A family feature has no module.
export type FeatureDetail = {
  slug: string;
  audience: 'school' | 'family';
  module?: ModuleId;
  // The menu and index card.
  name: string;
  blurb: string;
  icon: IconName;
  tone: Tone;
  // The page.
  title: string;
  lead: string;
  // SEO, at most 160 characters.
  metaDescription: string;
  howItWorks: { title: string; detail: string }[];
  whatYouGet: string[];
  whoUsesIt: { role: string; text: string }[];
  faqs: { question: string; answer: string }[];
  // Other feature slugs.
  related: string[];
};

// The slugs, fixed before the pages are written so every file can link to them.
export const SCHOOL_FEATURE_SLUGS = ['ai-answer-sheet-marking', 'omr-bubble-sheets', 'online-tests', 'question-paper-generator', 'report-cards-hpc'] as const;
export const FAMILY_FEATURE_SLUGS = [
  'family-ai-tutor',
  'check-my-work',
  'study-chapters-labs',
  'your-own-syllabus',
  'english-speaking-practice',
  'draw-studio',
  'future-careers-exams-schemes',
  'parent-controls-progress',
  'school-link',
  'family-app-getting-started',
] as const;
