import { describe, expect, it } from 'vitest';
import { adapterFor, standInAdapter, standInAllowed } from '@/lib/ai/adapters';
import { isTutorRequest, tutorAnswer } from '@/lib/ai/adapters/stand-in-tutor';
import { completeResponse, coreBlocks, parseBlockLine } from '@/lib/family/blocks';
import { namedSubject } from '@/lib/family/resolver';

const SYSTEM =
  'You are a patient teacher.\nOutput ONLY JSON objects, one per line (JSON Lines).\nFIRST, before any block, write one line: {"type":"subject","subject":"<id>"}. The student may be answered only in: mathematics or science or social_science.\n';
const SUM = `${SYSTEM}THIS QUESTION IS A MATHS SUM: SOLVE IT FIRST.`;
const ELAB = `${SYSTEM}THE NETCYBERAI ELABORATION FRAMEWORK. Five steps.`;

describe('the stand-in answers the tutor in its own line format', () => {
  it('recognises only the tutor request', () => {
    expect(isTutorRequest(SYSTEM)).toBe(true);
    expect(isTutorRequest('Answer with one JSON object only.')).toBe(false);
  });

  it('writes the subject line, then valid core blocks, and says it is a stand-in', () => {
    const lines = tutorAnswer(SYSTEM, 'What is photosynthesis?').split('\n');
    expect(namedSubject(lines[0])).toBe('science');
    const blocks = lines.slice(1).map((l) => parseBlockLine(l));
    expect(blocks.every((b) => b !== null)).toBe(true);
    expect(completeResponse(blocks as never, coreBlocks(null))).not.toBeNull();
    expect(lines.join(' ')).toContain('Stand-in answer for testing');
  });

  it('defaults to mathematics and solves a sum first with exact arithmetic', () => {
    const lines = tutorAnswer(SUM, 'How do I solve x^2 - 5x + 6 = 0?').split('\n');
    expect(namedSubject(lines[0])).toBe('mathematics');
    expect(parseBlockLine(lines[1])?.type).toBe('worked_example');
  });

  it('writes the one elaboration block when the prompt asks for it', () => {
    const lines = tutorAnswer(ELAB, 'quadratic').split('\n');
    expect(lines).toHaveLength(2);
    expect(parseBlockLine(lines[1])?.type).toBe('elaboration');
  });

  it('the adapter uses it for the tutor and keeps its plain text for other callers', async () => {
    const tutor = await standInAdapter.streamText({ apiKey: '', model: 'stand-in', system: SYSTEM, messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }, () => {});
    expect(tutor.ok && tutor.text.split('\n')[0]).toContain('"type":"subject"');
    const other = await standInAdapter.streamText({ apiKey: '', model: 'stand-in', system: 'Plain.', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 }, () => {});
    expect(other.ok && other.text).toBe('Stand-in answer (1 question).');
  });

  it('is refused in production, and when the switch is off', () => {
    expect(standInAllowed({ NODE_ENV: 'production', AI_PLATFORM_STAND_IN: 'on' })).toBe(false);
    expect(standInAllowed({ NODE_ENV: 'development' })).toBe(false);
    expect(adapterFor('stand-in', { NODE_ENV: 'production', AI_PLATFORM_STAND_IN: 'on' })).toBeNull();
    expect(adapterFor('stand-in', { NODE_ENV: 'development' })).toBeNull();
    expect(adapterFor('stand-in', { NODE_ENV: 'development', AI_PLATFORM_STAND_IN: 'on' })).toBe(standInAdapter);
  });
});
