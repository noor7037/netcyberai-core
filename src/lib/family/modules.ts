/**
 * Family App Module Registry & Entitlements (docs/family-app/03_ARCHITECTURE.md §2)
 * Governs module IDs, modes, flags, and entitlement tiers.
 */

export type FamilyEntitlement =
  | 'school_info' // Always free to linked families
  | 'learning'    // Free for one subject per child; Family Plus for all
  | 'public'      // Free to all (opportunities, careers, weekly summary, vault)
  | 'plus';       // Family Plus only (90-day English, dossier export, etc.)

export type FamilyModuleMode = 'standalone' | 'connected' | 'both';

export interface FamilyModuleDefinition {
  id: string;
  nameKey: string;
  mode: FamilyModuleMode;
  flag: string;
  entitlement: FamilyEntitlement;
  route: string;
}

export const FAMILY_MODULES: Record<string, FamilyModuleDefinition> = {
  understand: {
    id: 'understand',
    nameKey: 'fam.modules.understand',
    mode: 'both',
    flag: 'family_learning_core',
    entitlement: 'learning',
    route: '/family/learn',
  },
  practice: {
    id: 'practice',
    nameKey: 'fam.modules.practice',
    mode: 'both',
    flag: 'family_learning_core',
    entitlement: 'learning',
    route: '/family/practice',
  },
  plan: {
    id: 'plan',
    nameKey: 'fam.modules.plan',
    mode: 'both',
    flag: 'family_learning_core',
    entitlement: 'learning',
    route: '/family/plan',
  },
  english: {
    id: 'english',
    nameKey: 'fam.modules.english',
    mode: 'both',
    flag: 'family_english_programme',
    entitlement: 'plus',
    route: '/family/english',
  },
  careers: {
    id: 'careers',
    nameKey: 'fam.modules.careers',
    mode: 'both',
    flag: 'family_careers',
    entitlement: 'public',
    route: '/family/careers',
  },
  opportunities: {
    id: 'opportunities',
    nameKey: 'fam.modules.opportunities',
    mode: 'both',
    flag: 'family_opportunities',
    entitlement: 'public',
    route: '/family/opportunities',
  },
  vault: {
    id: 'vault',
    nameKey: 'fam.modules.vault',
    mode: 'both',
    flag: 'family_vault',
    entitlement: 'public',
    route: '/family/vault',
  },
  school_today: {
    id: 'school_today',
    nameKey: 'fam.modules.school_today',
    mode: 'connected',
    flag: 'family_school_link',
    entitlement: 'school_info',
    route: '/family/school/today',
  },
  settings: {
    id: 'settings',
    nameKey: 'fam.modules.settings',
    mode: 'both',
    flag: 'family_settings',
    entitlement: 'public',
    route: '/family/account',
  },
};
