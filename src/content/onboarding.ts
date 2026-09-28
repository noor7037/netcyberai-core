import type { IconName } from '@/components/visual/Icons';
import type { Tone } from '@/lib/semantic';
import { commercialClaims } from './pricing';

// "Go live in 3 easy steps" (founder, 2026-09-28, Decision Log C79),
// shown on the homepage, pricing and contact pages. The two promises it
// makes are registry claims (src/content/pricing.ts) and render only
// while those claims are confirmed.

export interface OnboardingStep {
  title: string;
  text: string;
  icon: IconName;
  tone: Tone;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Book your free demo',
    text: 'Tell us about your school. We walk you through NetCyberAI with your own classes and answer every question.',
    icon: 'chat',
    tone: 'communication',
  },
  {
    title: 'Share your data',
    text: 'Upload your student list as Excel or CSV. Every row is checked before anything is saved.',
    icon: 'reports',
    tone: 'product',
  },
  {
    title: 'Go live',
    text: 'We set up your school and train your staff, free. Parents start getting WhatsApp updates, and your first month is free.',
    icon: 'check',
    tone: 'success',
  },
];

function confirmed(id: string): string | null {
  const c = commercialClaims.find((x) => x.id === id);
  return c && c.status === 'confirmed' ? c.body : null;
}

export const ONBOARDING = {
  eyebrow: 'How it works',
  title: 'Get your school online in 3 easy steps',
  lead: confirmed('go-live-24h') ? 'Live in under 24 hours once your student list is ready. No technical skills needed.' : 'No technical skills needed.',
  noExcel: confirmed('free-data-upload')
    ? { title: 'No Excel sheet? No problem.', text: 'Send photos of your registers or an export from your old software. Our team prepares and uploads it for you, free.' }
    : null,
};
