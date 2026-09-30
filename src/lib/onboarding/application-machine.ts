// The school application state machine (C98). One table of allowed
// transitions and one function that applies it; the database code in
// applications.ts only ever moves an application through transition().
//
//   submitted ─verify_email→ email_verified ─start_review→ under_review ─approve→ approved ─provision→ provisioned ─activate→ active
//                                  └──────────────reject──────────────┴─reject→ rejected
//
// provision = the principal's invite was sent (user and membership exist);
// activate = the principal's first sign-in.

export const APPLICATION_STATES = ['submitted', 'email_verified', 'under_review', 'approved', 'rejected', 'provisioned', 'active'] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const APPLICATION_EVENTS = ['verify_email', 'start_review', 'approve', 'reject', 'provision', 'activate'] as const;
export type ApplicationEvent = (typeof APPLICATION_EVENTS)[number];

type Rule = { from: readonly ApplicationState[]; to: ApplicationState; done: readonly ApplicationState[] };

// `done`: states in which the event has already happened, so repeating it
// is a no-op rather than an error (a double click, a retried request).
const RULES: Record<ApplicationEvent, Rule> = {
  verify_email: { from: ['submitted'], to: 'email_verified', done: ['email_verified', 'under_review', 'approved', 'rejected', 'provisioned', 'active'] },
  start_review: { from: ['email_verified'], to: 'under_review', done: ['under_review', 'approved', 'provisioned', 'active'] },
  approve: { from: ['under_review'], to: 'approved', done: ['approved', 'provisioned', 'active'] },
  reject: { from: ['email_verified', 'under_review'], to: 'rejected', done: ['rejected'] },
  provision: { from: ['approved'], to: 'provisioned', done: ['provisioned', 'active'] },
  activate: { from: ['provisioned'], to: 'active', done: ['active'] },
};

export type TransitionResult =
  | { ok: true; changed: true; from: ApplicationState; to: ApplicationState }
  | { ok: true; changed: false; state: ApplicationState }
  | { ok: false; reason: string };

export function transition(current: ApplicationState, event: ApplicationEvent): TransitionResult {
  const rule = RULES[event];
  if (rule.from.includes(current)) return { ok: true, changed: true, from: current, to: rule.to };
  if (rule.done.includes(current)) return { ok: true, changed: false, state: current };
  return { ok: false, reason: `cannot ${event.replace('_', ' ')} an application that is ${current.replace('_', ' ')}` };
}

export function isApplicationState(value: unknown): value is ApplicationState {
  return typeof value === 'string' && (APPLICATION_STATES as readonly string[]).includes(value);
}

// What the founder can do next from each state, for the approvals screen.
export function founderActions(state: ApplicationState): ApplicationEvent[] {
  return (['start_review', 'approve', 'reject'] as ApplicationEvent[]).filter((e) => {
    if (e === 'approve') return state === 'email_verified' || state === 'under_review';
    return RULES[e].from.includes(state);
  });
}

export const STATE_LABELS: Record<ApplicationState, string> = {
  submitted: 'Email not confirmed',
  email_verified: 'New',
  under_review: 'Under review',
  approved: 'Approved, inviting',
  rejected: 'Rejected',
  provisioned: 'Invite sent',
  active: 'Active',
};
