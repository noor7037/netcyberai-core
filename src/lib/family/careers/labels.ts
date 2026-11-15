import type { MessageKey } from '@/lib/i18n';
import type { ActionType, CareerLevel, Cost, Effort, LaneId, StreamSlug } from './types';

export const STREAM_KEY: Record<StreamSlug, MessageKey> = {
  'science-pcm': 'fam.career.stream.sciencePcm',
  'science-pcb': 'fam.career.stream.sciencePcb',
  commerce: 'fam.career.stream.commerce',
  arts: 'fam.career.stream.arts',
  vocational: 'fam.career.stream.vocational',
};

export const LEVEL_KEY: Record<CareerLevel, MessageKey> = {
  entry: 'fam.career.level.entry',
  skilled: 'fam.career.level.skilled',
  supervisor: 'fam.career.level.supervisor',
  professional: 'fam.career.level.professional',
  senior: 'fam.career.level.senior',
  top: 'fam.career.level.top',
};

export const LANE_KEY: Record<LaneId, MessageKey> = {
  during_10: 'fam.career.lane.during10',
  after_10: 'fam.career.lane.after10',
  during_12: 'fam.career.lane.during12',
  entrance: 'fam.career.lane.entrance',
  bachelor: 'fam.career.lane.bachelor',
  first_job: 'fam.career.lane.firstJob',
  years: 'fam.career.lane.growth',
};

export const TYPE_KEY: Record<ActionType, MessageKey> = {
  skill: 'fam.career.type.skill',
  project: 'fam.career.type.project',
  competition: 'fam.career.type.competition',
  olympiad: 'fam.career.type.olympiad',
  hackathon: 'fam.career.type.hackathon',
  certification: 'fam.career.type.certification',
  internship: 'fam.career.type.internship',
  apprenticeship: 'fam.career.type.apprenticeship',
  portfolio: 'fam.career.type.portfolio',
};

export const EFFORT_KEY: Record<Effort, MessageKey> = {
  light: 'fam.career.effort.light',
  medium: 'fam.career.effort.medium',
  heavy: 'fam.career.effort.heavy',
};

export const COST_KEY: Record<Cost, MessageKey> = {
  free: 'fam.career.cost.free',
  paid: 'fam.career.cost.paid',
  mixed: 'fam.career.cost.mixed',
};

export function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
