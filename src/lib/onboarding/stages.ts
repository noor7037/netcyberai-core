// PRD §7.2's onboarding workflow, tracked from Tenant Created onward
// (Lead/Approved are pre-tenant -- no school_id exists yet to attach a
// stage to). See supabase/migrations/20260918120000_onboarding_consent_impersonation.sql
// for the enum this mirrors.
export const ONBOARDING_STAGES = [
  'tenant_created',
  'admin_invited',
  'data_imported',
  'data_validated',
  'consent_collection',
  'configuration',
  'training',
  'pilot_outbound_approved',
  'go_live',
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export function stageIndex(stage: OnboardingStage): number {
  return ONBOARDING_STAGES.indexOf(stage);
}

// Only ever one step forward. No skipping the consent gate, no jumping
// back to fix something out of band through this endpoint -- a real
// correction is a separate, deliberate, logged action (same principle
// as Task 3's pilot-flag rule), not a side effect of this one.
export function isValidStageAdvance(from: OnboardingStage, to: OnboardingStage): boolean {
  return stageIndex(to) === stageIndex(from) + 1;
}

// PRD §3.5: core_records and operational_communication are "required
// for service" -- the other purposes (daily_pulse, recognition,
// weekly_brief, at_risk) are opt-in and must NOT count toward this
// prompt's consent-completion gate, or the meter would read fully
// complete while a school's families never saw an opt-in prompt at all.
export const REQUIRED_CONSENT_PURPOSES = ['core_records', 'operational_communication'] as const;
