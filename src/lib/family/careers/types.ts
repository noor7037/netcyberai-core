// Career Hub view model. Families only ever receive rows that already passed the approval gate.
// Text is bilingual. No state field: the hub is the same in every state.

export const LEVELS = ['entry', 'skilled', 'supervisor', 'professional', 'senior', 'top'] as const;
export type CareerLevel = (typeof LEVELS)[number];

export const STREAMS = ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'] as const;
export type StreamSlug = (typeof STREAMS)[number];

export const LANES = ['during_10', 'after_10', 'during_12', 'entrance', 'bachelor', 'first_job', 'growth'] as const;
export type LaneId = (typeof LANES)[number];

export const ACTION_TYPES = ['skill', 'project', 'competition', 'olympiad', 'hackathon', 'certification', 'internship', 'apprenticeship', 'portfolio'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const EFFORTS = ['light', 'medium', 'heavy'] as const;
export type Effort = (typeof EFFORTS)[number];

export const COSTS = ['free', 'paid', 'mixed'] as const;
export type Cost = (typeof COSTS)[number];

export type Bi = { en: string; hi: string };

export type CareerCard = {
  slug: string;
  fieldId: string;
  fieldName: Bi;
  level: CareerLevel;
  title: Bi;
  summary: Bi;
  streams: StreamSlug[];
  minLevel: string;
  govGroup: 'D' | 'C' | 'B' | 'A' | null;
  isco: string | null;
  onet: string | null;
  nco: string | null;
  officialUrl: string | null;
  horizon: Bi | null;
  compete: Bi;
};

export type RoadStep = {
  key: string;
  lane: 'after_10' | 'entrance' | 'bachelor' | 'first_job' | 'growth';
  sort: number;
  requirement: Bi;
  examName: Bi | null;
  futureSeriesKey: string | null;
  officialUrl: string | null;
};

export type ParallelAction = {
  key: string;
  stage: 'during_10' | 'during_12' | 'during_bachelor';
  type: ActionType;
  title: Bi;
  detail: Bi;
  effort: Effort;
  cost: Cost;
  officialUrl: string | null;
};

export type CrossPath = {
  key: string;
  via: Bi;
  conditions: Bi;
  officialUrl: string | null;
  streams: StreamSlug[];
  toSlugs: string[];
  anyGraduate: boolean;
};

export type LateralRoute = {
  key: string;
  fromKind: 'portfolio' | 'skills' | 'experience' | 'certification' | 'apprenticeship';
  detail: Bi;
  example: Bi;
  toSlug: string;
  minYears: number | null;
  degreeRequired: boolean | null;
  officialUrl: string | null;
};

export type RoadLane = {
  id: LaneId;
  steps: RoadStep[];
  actions: ParallelAction[];
  laterals: LateralRoute[];
};

export type Roadmap = {
  career: CareerCard;
  lanes: RoadLane[];
  crosses: CrossPath[];
};

export type ReviewState = 'pending' | 'approved' | 'rejected';

export type Reviewed = { reviewState: ReviewState; reviewDue: string };
