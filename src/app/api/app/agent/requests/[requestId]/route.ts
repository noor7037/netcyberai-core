import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { AGENT_PREVIEW_COOKIE } from '@/lib/auth/db';
import { agentTurn } from '@/lib/agent/loop';
import { authFrom, discard, getRequest, goLive, linkReverse, undoAsk } from '@/lib/agent/requests';

// One change request (C546). GET: what it would change. POST { action }:
//   go_live     — run it again as this person and commit, only if it still changes exactly what was reviewed;
//   discard     — never make it live;
//   preview_on  — "See it live": every screen this person opens shows the school with it applied, nothing kept;
//   preview_off — back to the live school;
//   undo        — the agent prepares the reverse as a new change request to review.
export const maxDuration = 300;
const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!ID.test(params.requestId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const v = await getRequest(guard.claims, params.requestId);
    return v ? NextResponse.json({ request: v }) : NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!ID.test(params.requestId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const secure = req.nextUrl.protocol === 'https:';
  try {
    if (action === 'preview_on' || action === 'preview_off') {
      const v = await getRequest(guard.claims, params.requestId);
      if (!v) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const res = NextResponse.json({ preview: action === 'preview_on' ? v.requestId : null });
      if (action === 'preview_on' && v.status === 'ready') res.cookies.set(AGENT_PREVIEW_COOKIE, v.requestId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 2 * 3600 });
      else res.cookies.set(AGENT_PREVIEW_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
      res.cookies.set('nca_agent_preview_on', action === 'preview_on' ? v.requestId : '', { sameSite: 'lax', secure, path: '/', maxAge: action === 'preview_on' ? 2 * 3600 : 0 });
      return res;
    }
    if (action === 'go_live' || action === 'discard') {
      const d = action === 'go_live' ? await goLive(guard.claims, params.requestId, authFrom(req)) : await discard(guard.claims, params.requestId);
      const res = d.ok ? NextResponse.json({ request: d.view }) : NextResponse.json({ error: d.error, ...(d.detail ? { detail: d.detail } : {}) }, { status: d.status });
      res.cookies.set(AGENT_PREVIEW_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
      res.cookies.set('nca_agent_preview_on', '', { sameSite: 'lax', secure, path: '/', maxAge: 0 });
      return res;
    }
    if (action === 'undo') {
      const v = await getRequest(guard.claims, params.requestId);
      if (!v || v.status !== 'live') return NextResponse.json({ error: 'only a live change can be undone' }, { status: 409 });
      const reply = await agentTurn(guard.claims, (book) => undoAsk(v, book), authFrom(req));
      if (reply.requestId) await linkReverse(guard.claims, reply.requestId, v.requestId);
      return NextResponse.json(reply);
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
