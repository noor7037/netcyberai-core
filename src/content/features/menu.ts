import type { FeatureMenu } from '@/components/layout/Header';
import { featurePages } from '@/content/catalog';
import { familyFeatureDetails, schoolFeatureDetails } from './index';
import type { FeatureDetail } from './types';

// The Features menu (C533): only what the menu draws. Built on the server, so the feature pages' text stays out of
// the header's browser bundle, which every page loads.
const toItem = (f: FeatureDetail) => ({ href: `/features/${f.slug}`, name: f.name, blurb: f.blurb, tone: f.tone, icon: f.icon });
export const featureMenu = (): FeatureMenu => ({ school: [...featurePages, ...schoolFeatureDetails.map(toItem)], family: familyFeatureDetails.map(toItem) });

// The breadcrumb's names for the same pages, by path.
export const featureNames = (): Record<string, string> => Object.fromEntries([...schoolFeatureDetails, ...familyFeatureDetails].map((f) => [`/features/${f.slug}`, f.name]));
