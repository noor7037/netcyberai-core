import type { Subject } from '@/lib/contracts/subjects';

// The home plan's shape (M3-7, C337), apart from its database code so the parent area's client component can use it.
export const PLAN_NIGHTS = 14;
export const NIGHT_MINUTES = 15;
export const MAX_PLAN_TOPICS = 7;
export const MAX_NOTE = 1000;

export type PlanTopic = { topicKey: string; subject: Subject };
export type HomePlanNight = { night: number; date: string; topicKey: string; subject: Subject; title: string; done: boolean };
export type HomePlan = { planId: string; startsOn: string; note: string | null; followupAsked: boolean; nights: HomePlanNight[]; tonight: HomePlanNight | null };
