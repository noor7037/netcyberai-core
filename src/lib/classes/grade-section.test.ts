import { describe, expect, it } from 'vitest';
import { deriveGradeSection } from './grade-section';

describe('deriveGradeSection', () => {
  it('splits on the last hyphen', () => {
    expect(deriveGradeSection('8-A')).toEqual({ grade: '8', section: 'A' });
  });

  it('splits on the LAST hyphen, not the first, for a multi-hyphen name', () => {
    expect(deriveGradeSection('Grade-8-A')).toEqual({ grade: 'Grade-8', section: 'A' });
  });

  it('leaves section null when there is no hyphen at all', () => {
    expect(deriveGradeSection('Nursery')).toEqual({ grade: 'Nursery', section: null });
  });

  it('does not treat a leading hyphen as a splitter (lastIndexOf > 0 guard)', () => {
    // A name starting with '-' has no sensible grade on its left side --
    // the route's own guard (lastHyphen > 0) intentionally leaves it whole.
    expect(deriveGradeSection('-A')).toEqual({ grade: '-A', section: null });
  });

  it('trims whitespace around the derived grade and section', () => {
    expect(deriveGradeSection('8 - A')).toEqual({ grade: '8', section: 'A' });
  });
});
