import type { ProfileId } from '@/lib/ai/platform';
import { AI_OPS_DAILY_JOB, TUTOR_PARENT_REPORT_JOB, TUTOR_QUIZ_JOB } from './jobs';

// The Tutor's agent registry (W16-A1, the proposal's M2; docs/AI_TUTOR_AGENT_PROGRESS.md "Programme W16", decision 1:
// thin tool calls on the existing gateway, no agent framework). An agent here is a name for work the code already does
// or a wave will build: each one says what it reads and makes, whether a child waits for it ('live', inside the tutor
// turn, src/lib/ai/agents/orchestrator.ts) or it runs on the job queue ('job'), the gateway profile its AI calls go
// through (control.ai_profiles, so Control routes it and the minors gate applies), and the module that does the work.
// Only the orchestrator is live on its own: the other live agents are steps of its turn.
//
// `profileId` null: the agent makes no AI call of its own. `implementedBy`: a repository path that does the work today,
// or 'pending' with the wave that builds it.

export type AgentId = 'ingestion' | 'orchestrator' | 'voice' | 'drawing' | 'simulation' | 'quiz' | 'photo_doubt' | 'parent_report' | 'quality_check' | 'ops';

type AgentBase = { id: AgentId; role: string; inputs: readonly string[]; outputs: readonly string[]; profileId: ProfileId | null };
type Implemented = { implementedBy: string } | { implementedBy: 'pending'; wave: string };
export type LiveAgent = AgentBase & Implemented & { mode: 'live' };
export type JobAgent = AgentBase & Implemented & { mode: 'job'; jobType: string };
export type Agent = LiveAgent | JobAgent;

export const AGENTS: readonly Agent[] = [
  {
    id: 'ingestion',
    role: 'Prepares the library’s explanations of a syllabus’s chapters before children ask, for a person to check.',
    inputs: ['syllabus version', 'chapter keys'],
    outputs: ['AI-made library responses for review'],
    mode: 'job',
    profileId: 'content.prepare',
    // The job that exists for it (src/lib/jobs/ai-jobs.ts CONTENT_PREPARE_JOB).
    jobType: 'content.prepare',
    implementedBy: 'src/lib/family/prepare.ts',
  },
  {
    id: 'orchestrator',
    role: 'Runs the live tutor turn: retrieves the chapter’s passages, plans the teaching, streams the answer and hands off to the checks and the slow work.',
    inputs: ['child’s question or chapter', 'class, board, language', 'chat memory'],
    outputs: ['checked teaching blocks, streamed', 'after-turn jobs'],
    mode: 'live',
    profileId: 'family.resolver',
    implementedBy: 'src/lib/family/resolver.ts',
  },
  {
    id: 'voice',
    role: 'Hears a spoken question and speaks the answer; the two-way call is a realtime slot until a provider exists.',
    inputs: ['child’s recording'],
    outputs: ['transcript', 'spoken sentences'],
    mode: 'live',
    profileId: 'family.voice_call',
    implementedBy: 'src/lib/family/voice.ts',
  },
  {
    id: 'drawing',
    role: 'Draws the answer’s figures, steps, timelines, scenes and charts from the model’s labels, and fills licensed pictures.',
    inputs: ['visual blocks of the answer'],
    outputs: ['drawn and filled visual blocks'],
    mode: 'live',
    profileId: 'family.resolver',
    implementedBy: 'src/lib/family/visuals/fill.ts',
  },
  {
    id: 'simulation',
    role: 'Gives an answer one interactive model (graph, number line, fractions, geometry, simulation) where the plan asks for one.',
    inputs: ['the plan’s interactive block'],
    outputs: ['one checked interactive block'],
    mode: 'live',
    profileId: 'family.resolver',
    implementedBy: 'src/lib/family/blocks.ts',
  },
  {
    id: 'quiz',
    role: 'Makes a short quiz from a tutor session when it ends, kept with review dates.',
    inputs: ['the session’s questions and answers'],
    outputs: ['quiz items with review dates'],
    mode: 'job',
    profileId: 'family.quiz',
    jobType: TUTOR_QUIZ_JOB,
    implementedBy: 'src/lib/family/quiz.ts',
  },
  {
    id: 'photo_doubt',
    role: 'Reads a photo of a doubt or of the child’s own working, under the photo rules, and answers it step by step.',
    inputs: ['photo', 'child’s question'],
    outputs: ['answer blocks'],
    mode: 'live',
    profileId: 'family.homework',
    implementedBy: 'src/lib/family/homework.ts',
  },
  {
    id: 'parent_report',
    role: 'Writes each child’s weekly report for the parent from counts and chapter names.',
    inputs: ['the week’s counts and chapters'],
    outputs: ['weekly report in the Family app and by email'],
    mode: 'job',
    profileId: 'family.parent_report',
    jobType: TUTOR_PARENT_REPORT_JOB,
    implementedBy: 'pending',
    wave: 'W16-B3',
  },
  {
    id: 'quality_check',
    role: 'Checks each answer on the hot path: citation present, blocks valid, board commands valid, no hang.',
    inputs: ['the answer’s blocks', 'the passages used'],
    outputs: ['problem codes'],
    mode: 'live',
    profileId: 'family.qc',
    implementedBy: 'pending',
    wave: 'W16-A5',
  },
  {
    id: 'ops',
    role: 'Looks once a day at the AI platform’s latency, failures and spend, from the ledger.',
    inputs: ['the usage ledger'],
    outputs: ['the daily summary for Control'],
    mode: 'job',
    profileId: null,
    jobType: AI_OPS_DAILY_JOB,
    implementedBy: 'pending',
    wave: 'W16-B4',
  },
];

export function agentById(id: AgentId): Agent {
  const a = AGENTS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown agent ${id}`);
  return a;
}

// The live turn's handoffs, in the order the orchestrator makes them. The planner reads the passages' titles
// (src/lib/family/resolver.ts prepareTeach), so retrieval comes before the plan.
export type TurnStep = 'retrieve' | 'plan' | 'answer' | 'visual_check' | 'quality_check' | 'enqueue';
export const TURN_STEPS: readonly { step: TurnStep; agent: AgentId; implementedBy: string }[] = [
  { step: 'retrieve', agent: 'orchestrator', implementedBy: 'src/lib/ai/teaching/retrieve.ts' },
  { step: 'plan', agent: 'orchestrator', implementedBy: 'src/lib/ai/teaching/plan.ts' },
  { step: 'answer', agent: 'orchestrator', implementedBy: 'src/lib/family/resolver.ts' },
  { step: 'visual_check', agent: 'drawing', implementedBy: 'src/lib/ai/agents/orchestrator.ts' },
  { step: 'quality_check', agent: 'quality_check', implementedBy: 'src/lib/ai/agents/orchestrator.ts' },
  { step: 'enqueue', agent: 'quiz', implementedBy: 'src/lib/ai/agents/orchestrator.ts' },
];
