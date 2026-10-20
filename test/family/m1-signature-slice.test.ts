/**
 * Test Suite: Family App Programme — M1 Signature Slice
 * (docs/family-app/07_EXECUTION_WORKFLOW.md, 08_PROMPT_FRAMEWORKS.md §1)
 *
 * Asserts:
 * 1. 60-Second Onboarding, Email Code Auth & DPDP Consent.
 * 2. Child Profile Creation & Multi-Child Context Switching (Grade 6 vs 9).
 * 3. Privacy Pre-Processor: PII, Phone & Aadhaar 12-digit Screening.
 * 4. Concept Resolver Block Generation in English, Hindi & Hinglish.
 * 5. Hint-First Socratic Evaluation (Misconception Feedback, No Immediate Answers).
 * 6. Checked Mastery Progress & Calm Parent Card Generation.
 */

import { describe, it, expect } from 'vitest';
import {
  requestSignInCode,
  verifySignInCode,
  recordConsent,
  hasConsent,
  parseFamilySession,
} from '@/lib/family/accounts';
import {
  addChildProfile,
  getChildrenForAccount,
  getTopicProgress,
  updateCheckProgress,
  getParentDailyCard,
} from '@/lib/family/children';
import { cleanTextForAI } from '@/lib/family/privacy/pre-processor';
import {
  getTopicsForGrade,
  getTopicById,
  CATALOG_SUBJECTS,
} from '@/lib/family/syllabus/catalog';
import { resolveTopicBlocks, evaluateCheckAnswer } from '@/lib/family/resolver';
import type { CheckQuestionBlock } from '@/lib/contracts/family-types';

describe('Family App M1 — Signature Slice', () => {
  const testEmail = 'founder.test@example.com';
  let createdAccountId = '';
  let testChildId = '';

  describe('1. 60-Second Onboarding, Global Auth & DPDP Consent', () => {
    it('requests email sign-in code successfully', async () => {
      const res = await requestSignInCode(testEmail);
      expect(res.success).toBe(true);
      expect(res.devCode).toBe('123456');
    });

    it('refuses incorrect verification codes', async () => {
      const res = await verifySignInCode(testEmail, '999999');
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('verifies code 123456 and mints a dedicated family session claims token', async () => {
      const res = await verifySignInCode(testEmail, '123456');
      expect(res.success).toBe(true);
      expect(res.account).toBeDefined();
      expect(res.account?.email).toBe(testEmail);
      expect(res.token).toBeDefined();

      createdAccountId = res.account!.accountId;

      const parsed = parseFamilySession(res.token);
      expect(parsed).not.toBeNull();
      expect(parsed?.role).toBe('family');
      expect(parsed?.accountId).toBe(createdAccountId);
      expect(parsed?.email).toBe(testEmail);
    });

    it('records and verifies DPDP consent for core educational study', () => {
      const record = recordConsent(createdAccountId, 'study_core', true);
      expect(record.granted).toBe(true);
      expect(record.purpose).toBe('study_core');
      expect(hasConsent(createdAccountId, 'study_core')).toBe(true);
      expect(hasConsent(createdAccountId, 'photo_input')).toBe(false);
    });
  });

  describe('2. Child Profiles & Multi-Child Adaptive Switching', () => {
    it('creates child profile for Aarav (Class 9 CBSE, Hindi)', () => {
      const child = addChildProfile(createdAccountId, {
        firstName: 'Aarav',
        grade: 9,
        board: 'CBSE',
        medium: 'hi',
        state: 'Delhi',
      });
      testChildId = child.childId;
      expect(child.firstName).toBe('Aarav');
      expect(child.grade).toBe(9);
      expect(child.board).toBe('CBSE');
      expect(child.medium).toBe('hi');
    });

    it('creates second child for Diya (Class 6 CBSE, English)', () => {
      const child = addChildProfile(createdAccountId, {
        firstName: 'Diya',
        grade: 6,
        board: 'CBSE',
        medium: 'en',
        state: 'Delhi',
      });
      expect(child.firstName).toBe('Diya');
      expect(child.grade).toBe(6);

      const children = getChildrenForAccount(createdAccountId);
      expect(children.length).toBeGreaterThanOrEqual(2);
    });

    it('adapts syllabus catalog by grade level (Class 9 vs Class 6)', () => {
      const grade9Science = getTopicsForGrade(9, 'science');
      expect(grade9Science.length).toBeGreaterThan(0);
      expect(grade9Science.some((t) => t.id === 'cbse-9-sci-motion-accel')).toBe(true);

      const grade6Science = getTopicsForGrade(6, 'science');
      expect(grade6Science.length).toBeGreaterThan(0);
      expect(grade6Science.some((t) => t.id === 'cbse-6-sci-plants')).toBe(true);
      // Grade 6 must not see Grade 9 topics
      expect(grade6Science.some((t) => t.id === 'cbse-9-sci-motion-accel')).toBe(false);
    });
  });

  describe('3. Privacy Pre-Processor (PII & Aadhaar Screening)', () => {
    it('redacts email addresses, Indian mobile numbers, and 12-digit Aadhaar runs', () => {
      const dirtyPrompt =
        'My email is parent@gmail.com and phone is +91 98765 43210. Aadhaar is 1234 5678 9012. Can Aarav learn acceleration?';
      const cleaned = cleanTextForAI(dirtyPrompt, 'Aarav');

      expect(cleaned.hasRedactions).toBe(true);
      expect(cleaned.cleanedText).not.toContain('parent@gmail.com');
      expect(cleaned.cleanedText).not.toContain('98765');
      expect(cleaned.cleanedText).not.toContain('1234 5678 9012');
      expect(cleaned.cleanedText).not.toContain('Aarav');
      expect(cleaned.cleanedText).toContain('[REDACTED_EMAIL]');
      expect(cleaned.cleanedText).toContain('[REDACTED_PHONE]');
      expect(cleaned.cleanedText).toContain('[REDACTED_ID]');
      expect(cleaned.cleanedText).toContain('Student');
    });
  });

  describe('4. Concept Resolver Block Generation (Hindi, English, Hinglish)', () => {
    it('generates rich structured educational blocks in Hindi', () => {
      const res = resolveTopicBlocks('cbse-9-sci-motion-accel', 'hi');
      expect(res.topicId).toBe('cbse-9-sci-motion-accel');
      expect(res.language).toBe('hi');

      // Must contain explanation, worked example, check question, practice, English moment, and sources
      const blockTypes = res.blocks.map((b) => b.type);
      expect(blockTypes).toContain('explanation');
      expect(blockTypes).toContain('worked_example');
      expect(blockTypes).toContain('check_question');
      expect(blockTypes).toContain('targeted_practice');
      expect(blockTypes).toContain('english_moment');
      expect(blockTypes).toContain('sources');

      const explanation = res.blocks.find((b) => b.type === 'explanation') as any;
      expect(explanation.idea).toContain('त्वरण');
      expect(explanation.analogy).toContain('ऑटो-रिक्शा');
      expect(explanation.technicalTerms.length).toBeGreaterThan(0);
    });

    it('generates corresponding blocks in English with accurate terms', () => {
      const res = resolveTopicBlocks('cbse-9-sci-motion-accel', 'en');
      expect(res.language).toBe('en');

      const explanation = res.blocks.find((b) => b.type === 'explanation') as any;
      expect(explanation.idea).toContain('rate of change of velocity');
      expect(explanation.analogy).toContain('auto-rickshaw');
    });

    it('generates natural Hinglish blocks matching bilingual family discussions', () => {
      const res = resolveTopicBlocks('cbse-9-sci-motion-accel', 'hinglish');
      expect(res.language).toBe('hinglish');

      const explanation = res.blocks.find((b) => b.type === 'explanation') as any;
      expect(explanation.analogy).toContain('traffic light green hoti hai');
    });
  });

  describe('5. Socratic Hint-First Check & Misconception Remediation', () => {
    const res = resolveTopicBlocks('cbse-9-sci-motion-accel', 'hi');
    const checkBlock = res.blocks.find((b) => b.type === 'check_question') as CheckQuestionBlock;

    it('verifies hint ladder is populated with 3 hints', () => {
      expect(checkBlock.hint1).toBeDefined();
      expect(checkBlock.hint2).toBeDefined();
      expect(checkBlock.hint3).toBeDefined();
    });

    it('does NOT reveal answer on wrong attempt; provides targeted misconception feedback and Hint 1', () => {
      // opt-a is 60 m/s², which confuses speed with acceleration
      const evalResult = evaluateCheckAnswer(checkBlock, 'opt-a', 0);
      expect(evalResult.isCorrect).toBe(false);
      expect(evalResult.misconceptionTag).toBe('confuses_speed_with_acceleration');
      expect(evalResult.feedbackText).toContain('रेलगाड़ी की गति है, त्वरण नहीं');
      expect(evalResult.nextHint).toBe(checkBlock.hint1);
    });

    it('provides Hint 2 on second unsuccessful attempt', () => {
      const evalResult = evaluateCheckAnswer(checkBlock, 'opt-c', 1);
      expect(evalResult.isCorrect).toBe(false);
      expect(evalResult.nextHint).toBe(checkBlock.hint2);
    });

    it('validates correct answer (opt-b: 0 m/s²) and provides complete explanatory confirmation', () => {
      const evalResult = evaluateCheckAnswer(checkBlock, 'opt-b', 1);
      expect(evalResult.isCorrect).toBe(true);
      expect(evalResult.feedbackText).toContain('वेग में कोई परिवर्तन नहीं है');
    });
  });

  describe('6. Mastery Tracking & Calm Parent Card', () => {
    it('initializes progress in introduced state', () => {
      const prog = getTopicProgress(testChildId, 'cbse-9-sci-motion-accel');
      expect(prog.status).toBe('introduced');
      expect(prog.checksPassed).toBe(0);
    });

    it('records wrong attempt as practised and captures misconception tag', () => {
      const updated = updateCheckProgress(
        testChildId,
        'cbse-9-sci-motion-accel',
        false,
        'confuses_speed_with_acceleration'
      );
      expect(updated.status).toBe('practised');
      expect(updated.misconceptionsRecorded).toContain('confuses_speed_with_acceleration');
    });

    it('records correct checked answer and updates progress', () => {
      const updated = updateCheckProgress(testChildId, 'cbse-9-sci-motion-accel', true);
      expect(updated.checksPassed).toBe(1);
      expect(updated.status).toBe('checked');
    });

    it('reaches mastered status after repeated correct checks', () => {
      const updated = updateCheckProgress(testChildId, 'cbse-9-sci-motion-accel', true);
      expect(updated.checksPassed).toBe(2);
      expect(updated.status).toBe('mastered');
    });

    it('generates a reassuring, calm parent card with tonight talk question', () => {
      const card = getParentDailyCard(testChildId);
      expect(card.childName).toBe('Aarav');
      expect(card.tonightTalkQuestion).toContain('आज रात');
      expect(card.calmInsight).toBeDefined();
      expect(card.masteryStatus).toBe('mastered');
    });
  });

  describe('7. Verified Allowlisted Sources Standard', () => {
    it('proves every topic reference points to official allowlisted NCERT curriculum', () => {
      const res = resolveTopicBlocks('cbse-9-sci-motion-accel', 'en');
      const sourcesBlock = res.blocks.find((b) => b.type === 'sources') as any;
      expect(sourcesBlock).toBeDefined();
      expect(sourcesBlock.references.length).toBeGreaterThan(0);

      for (const ref of sourcesBlock.references) {
        expect(ref.url).toMatch(/^https:\/\/(?:[a-zA-Z0-9-]+\.)?ncert\.nic\.in\//);
        expect(ref.verifiedDate).toBeDefined();
      }
    });
  });
});
