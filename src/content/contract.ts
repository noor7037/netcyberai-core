export interface BlogFaqItem {
  question: string;
  answer: string;
}

export interface BlogSource {
  label: string;
  url: string;
  checkedOn: string;
}

export type BlogBodyBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] };

export interface BlogCaseStudy {
  schoolName: string;
  summary: string;
  consentedOn: string;
}

export interface BlogHowToStep {
  name: string;
  text: string;
}

// Optional: only for a post that is a genuine step-by-step procedure
// (the reader mechanically does these steps in order). Do not add this
// to a post that is explaining a topic rather than walking through a
// procedure — that would be schema-stuffing, not honest markup.
export interface BlogHowTo {
  name: string;
  description: string;
  steps: BlogHowToStep[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedOn: string;
  answerFirst: string;
  body: BlogBodyBlock[];
  faqs: BlogFaqItem[];
  sources: BlogSource[];
  howTo?: BlogHowTo;
  // Stays null until a real, consented pilot exists (Constitution §9).
  caseStudy: null | BlogCaseStudy;
}
