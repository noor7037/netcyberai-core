import type { CorrectAnswer, Difficulty, MarkingStep, QuestionKind, QuestionOption } from '@/lib/contracts/marking';
import type { Blueprint, BlueprintIssue } from './blueprint';
import type { PaperPlan } from './scope';

// The shapes the paper maker's routes and screens share (docs/36 §1.1, C362, C363). Pure types: safe in the browser.

export const GENERATION_STATES = ['waiting', 'working', 'done', 'failed'] as const;
export type GenerationState = (typeof GENERATION_STATES)[number];
export type GenerationKind = 'paper' | 'again' | 'question';
// Why a making ended without questions: the paper was published or a script approved meanwhile, it had questions
// already, the AI gave no question it could keep (or is switched off, for one question written anew), or it stopped
// (the job ended before it did).
export type GenerationFailure = 'closed' | 'locked' | 'has_questions' | 'no_answer' | 'ai_off' | 'stopped' | 'error';
export type GenerationView = {
  generationId: string;
  kind: GenerationKind;
  state: GenerationState;
  failure: GenerationFailure | null;
  questionId: string | null;
  result: { bank: number; ai: number; empty: number; aiOff: boolean } | null;
  createdAt: string;
  finishedAt: string | null;
};

// Why "Make the paper" cannot be pressed now.
export type MakeRefusal =
  | 'not_allowed'
  | 'closed' // the class is published
  | 'locked' // a script of the paper is approved: its questions are fixed
  | 'busy' // a making is waiting or working
  | 'has_questions' // the paper has questions: "Make again" replaces them
  | 'no_blueprint' // the exam's type has no blueprint (Settings → Exams)
  | 'blueprint' // the sections as changed for this paper are not a blueprint
  | 'plan' // the plan has a problem (see plan.problems)
  | 'no_topic' // a question written anew needs its chapter and topic
  | 'ai_off'; // the AI does not write questions now (Control → AI)

// Why the paper does not print yet.
export type PrintRefusal = 'no_questions' | 'busy' | 'not_kept' | 'changed' | 'drafts';

export type MakeScreen = {
  paperId: string;
  examType: { key: string; en: string; hi: string };
  blueprint: Blueprint | null; // the exam type's, as the school set it
  blueprintIssues: BlueprintIssue[]; // of the sections sent for this paper, when they are not a blueprint
  plan: PaperPlan | null; // null with no blueprint
  generation: GenerationView | null; // the latest making
  questions: number;
  mayMake: boolean;
  why: MakeRefusal | null;
  kept: { at: string; by: string | null } | null;
  printable: boolean;
  printWhy: PrintRefusal | null;
  ai: boolean; // the AI may write questions now (Control: exams.write_questions switched on with a provider)
};

export type BankQuestion = {
  bankId: string;
  chapter: string;
  topic: string;
  kind: QuestionKind;
  maxMarks: number;
  prompt: string;
  options: QuestionOption[];
  correct: CorrectAnswer | null;
  answerKey: string;
  steps: MarkingStep[];
  difficulty: Difficulty | null;
  source: 'teacher' | 'ai' | 'paper';
  usedCount: number;
};
export type BankList = { questions: BankQuestion[]; skipped: number; chapters: string[] };

// What a question paper and its marking scheme print (the browser draws the PDFs).
export type PrintQuestion = {
  label: string;
  section: string | null;
  choiceGroup: string | null;
  maxMarks: number;
  kind: QuestionKind;
  prompt: string;
  options: QuestionOption[];
  correct: CorrectAnswer | null;
  answerKey: string;
  steps: MarkingStep[];
};
export type PrintData = {
  schoolName: string;
  examName: string;
  className: string;
  subjectName: string;
  date: string | null;
  minutes: number | null;
  maxMarks: number;
  language: 'en' | 'hi' | 'mixed';
  choiceCounts: Record<string, number>;
  questions: PrintQuestion[];
};
