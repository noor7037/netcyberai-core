import { describe, expect, it } from 'vitest';
import { APPLICATION_EVENTS, APPLICATION_STATES, founderActions, transition, type ApplicationEvent, type ApplicationState } from './application-machine';

// C98: the allowed transitions, exhaustively.
const ALLOWED: Record<ApplicationEvent, [ApplicationState, ApplicationState][]> = {
  verify_email: [['submitted', 'email_verified']],
  start_review: [['email_verified', 'under_review']],
  approve: [['under_review', 'approved']],
  reject: [
    ['email_verified', 'rejected'],
    ['under_review', 'rejected'],
  ],
  provision: [['approved', 'provisioned']],
  activate: [['provisioned', 'active']],
};

describe('transition', () => {
  it('moves exactly along the allowed edges', () => {
    for (const event of APPLICATION_EVENTS) {
      for (const state of APPLICATION_STATES) {
        const edge = ALLOWED[event].find(([from]) => from === state);
        const result = transition(state, event);
        if (edge) expect(result).toEqual({ ok: true, changed: true, from: state, to: edge[1] });
        else expect(result.ok === false || result.changed === false).toBe(true);
      }
    }
  });

  it('repeating an event that already happened is a no-op, not an error (idempotent)', () => {
    expect(transition('approved', 'approve')).toEqual({ ok: true, changed: false, state: 'approved' });
    expect(transition('provisioned', 'approve')).toEqual({ ok: true, changed: false, state: 'provisioned' });
    expect(transition('active', 'activate')).toEqual({ ok: true, changed: false, state: 'active' });
    expect(transition('email_verified', 'verify_email')).toEqual({ ok: true, changed: false, state: 'email_verified' });
    expect(transition('rejected', 'reject')).toEqual({ ok: true, changed: false, state: 'rejected' });
  });

  it('refuses the impossible', () => {
    expect(transition('submitted', 'approve')).toMatchObject({ ok: false });
    expect(transition('approved', 'reject')).toMatchObject({ ok: false });
    expect(transition('rejected', 'approve')).toMatchObject({ ok: false });
    expect(transition('submitted', 'activate')).toMatchObject({ ok: false });
    expect(transition('active', 'reject')).toMatchObject({ ok: false });
  });

  it('offers the founder only what is possible', () => {
    expect(founderActions('submitted')).toEqual([]);
    expect(founderActions('email_verified')).toEqual(['start_review', 'approve', 'reject']);
    expect(founderActions('under_review')).toEqual(['approve', 'reject']);
    expect(founderActions('approved')).toEqual([]);
    expect(founderActions('active')).toEqual([]);
  });
});
