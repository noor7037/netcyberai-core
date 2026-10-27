import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireAiControl } from '@/lib/ai/control-guard';
import { caseSummaries } from '@/lib/ai/lab/cases';
import { labRunCsv, labRunJson } from '@/lib/ai/lab/export';
import { listLabRuns, loadLabRun, loadLabSetup, prepareLabCase, saveLabResult, scoreLabResult, startLabRun, type LabLink } from '@/lib/ai/lab/store';

// Control → AI → Quality Lab (G4, C372). The founder only, with the authenticator (aal2), as Control → AI.
//   GET                        the cases, the providers with a usable key (ids only), suggested models, recent runs
//   GET ?runId=…               one run with every answer so far
//   GET ?runId=…&format=csv    the run as a CSV file; format=json as a JSON file
//   POST { action: 'start', caseIds, models: [{ provider, model }] }   a new run (2–4 models)
//        { action: 'case', runId, caseId, provider, model }            one case × model: the browser sends one request a
//                                                                     cell, so a long run never outlives a route's time
//        { action: 'score', resultId, score, notes }                   the founder's 1–5 and a note
// A cell's key is opened in one short transaction, the vendor asked with none held, the answer kept in a second. No
// response carries a key, nothing here logs a prompt or an answer, and nothing is written outside control.ai_eval_*.
export const dynamic = 'force-dynamic';
// One cell may take a provider's whole-answer limit (WHOLE_ANSWER_TIMEOUT_MS) with room for its two short transactions.
export const maxDuration = 300;
const NO_STORE = { 'Cache-Control': 'no-store' };

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const linkOf = (v: unknown): LabLink | null => {
  const provider = str((v as LabLink)?.provider, 40);
  const model = str((v as LabLink)?.model, 80);
  return provider && model ? { provider, model: model.trim() } : null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const runId = req.nextUrl.searchParams.get('runId');
  if (runId) {
    const run = await withPlatformService((db) => loadLabRun(db, runId));
    if (!run) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404, headers: NO_STORE });
    const format = req.nextUrl.searchParams.get('format');
    if (format === 'csv' || format === 'json') {
      const name = `quality-lab-${run.runId.slice(0, 8)}.${format}`;
      return new NextResponse(format === 'csv' ? labRunCsv(run) : labRunJson(run), {
        headers: { ...NO_STORE, 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
      });
    }
    return NextResponse.json({ run }, { headers: NO_STORE });
  }
  const { setup, runs } = await withPlatformService(async (db) => ({ setup: await loadLabSetup(db), runs: await listLabRuns(db) }));
  return NextResponse.json({ ...setup, cases: caseSummaries(), runs }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const by = { userId: guard.claims.sub };
  const refused = (code: string, status = 400) => NextResponse.json({ error: 'not done', code }, { status, headers: NO_STORE });

  if (b?.action === 'start') {
    const caseIds = Array.isArray(b.caseIds) && b.caseIds.length <= 200 ? b.caseIds.map((c: unknown) => str(c, 41)) : null;
    const models = Array.isArray(b.models) && b.models.length <= 4 ? b.models.map(linkOf) : null;
    if (!caseIds || caseIds.includes(null) || !models || models.includes(null)) return refused('request');
    const started = await withPlatformService((db) => startLabRun(db, by, caseIds as string[], models as LabLink[]));
    return started.ok ? NextResponse.json({ ok: true, runId: started.runId }, { headers: NO_STORE }) : refused(started.code, started.code === 'not_configured' ? 409 : 400);
  }
  if (b?.action === 'case') {
    const runId = str(b.runId, 36);
    const caseId = str(b.caseId, 41);
    const link = linkOf(b);
    if (!runId || !caseId || !link) return refused('request');
    const prepared = await withPlatformService((db) => prepareLabCase(db, runId, caseId, link));
    if (!prepared.ok) return refused(prepared.code, prepared.code === 'not_found' ? 404 : 409);
    const outcome = await prepared.send();
    const result = await withPlatformService((db) => saveLabResult(db, runId, caseId, link, outcome));
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  }
  if (b?.action === 'score') {
    const resultId = str(b.resultId, 36);
    const score = b.score === null ? null : typeof b.score === 'number' ? b.score : undefined;
    const notes = b.notes === undefined || b.notes === null ? null : str(b.notes, 1000) ?? (b.notes === '' ? null : undefined);
    if (!resultId || score === undefined || notes === undefined) return refused('request');
    const scored = await withPlatformService((db) => scoreLabResult(db, by, resultId, score, notes));
    return scored.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : refused(scored.code, scored.code === 'not_found' ? 404 : 400);
  }
  return refused('request');
}
