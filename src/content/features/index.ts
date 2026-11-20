import { features as familyLearn } from './family-learn';
import { features as familyLife } from './family-life';
import { features as school } from './school';
import type { FeatureDetail } from './types';

// Every feature page under /features/<slug> drawn from data (C533). The older hand-made feature pages
// (src/app/features/<slug>/page.tsx) are listed in src/content/catalog.ts featurePages.
export const featureDetails: FeatureDetail[] = [...school, ...familyLearn, ...familyLife];
export const schoolFeatureDetails = featureDetails.filter((f) => f.audience === 'school');
export const familyFeatureDetails = featureDetails.filter((f) => f.audience === 'family');
export const featureDetail = (slug: string): FeatureDetail | undefined => featureDetails.find((f) => f.slug === slug);
export type { FeatureDetail } from './types';
