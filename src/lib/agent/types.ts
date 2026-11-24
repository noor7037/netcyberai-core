// The school agent's shared types (C546). See src/lib/agent/engine.ts for how a change request runs.
import type { NextRequest, NextResponse } from 'next/server';

export type Tier = 0 | 1 | 2; // 0 answer now; 1 the asker approves; 2 the principal approves (tier 3 is never listed)
export type CatalogEntry = {
  id: string; // "POST classes/:classId"
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // classes/:classId (under /api/app/)
  module: string;
  params: string[];
  fields: string[];
  query: string[];
  doc: string;
  tier: Tier;
  file: string;
};
type Handler = (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<NextResponse | Response>;
export type RouteModule = Partial<Record<CatalogEntry['method'], Handler>>;

// One step of a plan, as the model writes it. A value may name an earlier step's answer: a dollar sign, the step's
// number, then the fields to follow (step two's class.class_id).
export type Step = { endpoint: string; params?: Record<string, string>; query?: Record<string, string>; body?: Record<string, unknown>; why?: string };
// `sent`: the values the step really sent, after earlier answers were filled in; the review hash covers them.
export type StepResult = { endpoint: string; status: number; ok: boolean; answer: unknown; error?: string; sent?: { params: unknown; query: unknown; body: unknown } };
export type Change = { action: string; target: string | null; targetId: string | null; before: unknown; after: unknown };
export type DryRun = { steps: StepResult[]; changes: Change[]; ok: boolean; hash: string; tier: Tier };
