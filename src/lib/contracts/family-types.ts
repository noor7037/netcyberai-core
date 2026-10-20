/**
 * Family App Domain Contracts & Block Schemas
 * Governed by docs/family-app/03_ARCHITECTURE.md §6 and 08_PROMPT_FRAMEWORKS.md §7
 */

export type LanguageCode = 'en' | 'hi' | 'hinglish';

export interface FamilyAccount {
  accountId: string;
  email: string;
  createdAt: string;
}

export interface FamilyChild {
  childId: string;
  accountId: string;
  firstName: string;
  grade: number; // 6 to 10 in M1
  board: string;  // e.g. 'CBSE'
  medium: LanguageCode;
  state: string;
  createdAt: string;
}

export interface ChildProfileInput {
  firstName: string;
  grade: number;
  board?: string;
  medium?: LanguageCode;
  state?: string;
}

export type ConsentPurpose =
  | 'study_core'
  | 'photo_input'
  | 'voice_practice'
  | 'health_records'
  | 'opportunity_matching'
  | 'school_link';

export interface ConsentRecord {
  consentId: string;
  accountId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: string;
}

export interface CatalogSubject {
  id: string;
  nameEn: string;
  nameHi: string;
  colorHue: 'emerald' | 'sapphire' | 'tangerine' | 'grape' | 'rose';
}

export interface CatalogTopic {
  id: string;
  subjectId: string;
  grade: number;
  board: string;
  chapterNumber: number;
  chapterTitleEn: string;
  chapterTitleHi: string;
  topicTitleEn: string;
  topicTitleHi: string;
  ncertSlug?: string;
}

// ---------------- Concept Resolver Block Schemas ----------------

export interface ExplanationBlock {
  type: 'explanation';
  idea: string;
  analogy: string;
  steps: string[];
  technicalTerms: Array<{ english: string; hindi: string }>;
}

export interface WorkedExampleBlock {
  type: 'worked_example';
  problemStatement: string;
  steps: string[];
  finalAnswer: string;
}

export interface KeyPointsBlock {
  type: 'key_points';
  points: string[];
}

export interface CheckQuestionOption {
  id: string;
  text: string;
  misconceptionTag?: string;
}

export interface CheckQuestionBlock {
  type: 'check_question';
  id: string;
  question: string;
  options: CheckQuestionOption[];
  hint1: string;
  hint2: string;
  hint3: string;
  correctOptionId: string;
  explanation: string;
  misconceptionFeedbacks?: Record<string, string>;
}

export interface PracticeItem {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface TargetedPracticeBlock {
  type: 'targeted_practice';
  items: PracticeItem[];
}

export interface EnglishMomentBlock {
  type: 'english_moment';
  keyWords: Array<{ word: string; meaning: string }>;
  modelSentence: string;
  patternToUse: string;
  sayItPrompt: string;
}

export interface SourcesBlock {
  type: 'sources';
  references: Array<{
    title: string;
    url: string;
    verifiedDate: string;
  }>;
}

export type ConceptBlock =
  | ExplanationBlock
  | WorkedExampleBlock
  | KeyPointsBlock
  | CheckQuestionBlock
  | TargetedPracticeBlock
  | EnglishMomentBlock
  | SourcesBlock;

export interface ConceptResolverResponse {
  topicId: string;
  chapterTitle: string;
  topicTitle: string;
  language: LanguageCode;
  blocks: ConceptBlock[];
}

// ---------------- Mastery & Progress ----------------

export type TopicProgressStatus = 'introduced' | 'practised' | 'checked' | 'mastered';

export interface TopicProgress {
  topicId: string;
  childId: string;
  status: TopicProgressStatus;
  checksPassed: number;
  lastCheckedAt?: string;
  misconceptionsRecorded: string[];
}

export interface ParentDailyCard {
  childName: string;
  practisedTopic: string;
  masteryStatus: TopicProgressStatus;
  tonightTalkQuestion: string;
  calmInsight: string;
}
