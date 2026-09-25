import { describe, expect, it } from 'vitest';
import { computeRecognition, headroomScoreDeprecated, logitDelta, type AssessmentPoint } from './recognition';

function point(overrides: Partial<AssessmentPoint> & Pick<AssessmentPoint, 'studentId' | 'score'>): AssessmentPoint {
  return { classId: 'c1', attendanceInWindow: 0.9, assessmentCount: 3, ...overrides };
}

describe('logitDelta vs the deprecated headroom formula', () => {
  // The exact numbers from this file's own header comment: the headroom
  // formula rewards the already-strongest student (85->90) over the real
  // turnaround (40->55) -- the bug logit-delta exists to fix.
  it('headroom (deprecated) wrongly scores the small high-baseline gain above the big turnaround', () => {
    expect(headroomScoreDeprecated(90, 85)).toBeGreaterThan(headroomScoreDeprecated(55, 40));
  });

  it('logit-delta correctly scores the big turnaround above the small high-baseline gain', () => {
    expect(logitDelta(40, 55)).toBeGreaterThan(logitDelta(85, 90));
  });
});

describe('computeRecognition', () => {
  it('emits both a Personal Best and a Most Improved event for a single qualifying improver', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [point({ studentId: 's1', score: 40 })],
      current: [point({ studentId: 's1', score: 55 })],
    });
    expect(events).toContainEqual(expect.objectContaining({ studentId: 's1', type: 'personal_best' }));
    expect(events).toContainEqual(expect.objectContaining({ studentId: 's1', type: 'most_improved' }));
  });

  it('excludes a student below MIN_ASSESSMENTS even with a large score jump', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [point({ studentId: 's2', score: 40 })],
      current: [point({ studentId: 's2', score: 90, assessmentCount: 1 })],
    });
    expect(events).toHaveLength(0);
  });

  it('excludes a student below MIN_ATTENDANCE even with a large score jump', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [point({ studentId: 's3', score: 40 })],
      current: [point({ studentId: 's3', score: 90, attendanceInWindow: 0.5 })],
    });
    expect(events).toHaveLength(0);
  });

  it('does not throw for a current-period student with no baseline row', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [],
      current: [point({ studentId: 's4', score: 80 })],
    });
    expect(events).toHaveLength(0);
  });

  it('caps Most Improved to exactly one winner per class per baseline quartile band', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [point({ studentId: 's1', score: 40 }), point({ studentId: 's2', score: 45 })],
      current: [point({ studentId: 's1', score: 60 }), point({ studentId: 's2', score: 55 })],
    });
    const mostImproved = events.filter((e) => e.type === 'most_improved');
    expect(mostImproved).toHaveLength(1);
    // s1's logit-delta (40->60) is larger than s2's (45->55) -- s1 must win.
    expect(mostImproved[0].studentId).toBe('s1');
    // Both still qualify for the non-competitive Personal Best tier.
    expect(events.filter((e) => e.type === 'personal_best')).toHaveLength(2);
  });

  it('gives Most Improved winners independently per class (no cross-class competition)', () => {
    const events = computeRecognition({
      fortnightId: 'F1',
      baseline: [point({ studentId: 's1', classId: 'c1', score: 40 }), point({ studentId: 's2', classId: 'c2', score: 40 })],
      current: [point({ studentId: 's1', classId: 'c1', score: 55 }), point({ studentId: 's2', classId: 'c2', score: 60 })],
    });
    const mostImproved = events.filter((e) => e.type === 'most_improved').map((e) => e.studentId).sort();
    expect(mostImproved).toEqual(['s1', 's2']);
  });
});
