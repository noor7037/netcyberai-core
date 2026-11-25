import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { agentTurn } from '@/lib/agent/loop';
import { photosFrom } from '@/lib/agent/photos';
import { authFrom, recentMessages } from '@/lib/agent/requests';

// The school agent's conversation (C546, C549). POST { text, images? }: one turn, which may end in an answer, a guide or a
// change request to review.
// GET: this person's recent conversation. Only school staff, each as themselves; nothing here is another person's.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ messages: await recentMessages(guard.claims) });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST answers as a stream of lines (application/x-ndjson): {"type":"status",...} while the assistant works, so the
// screen shows each step as it happens, then {"type":"done","reply":...}.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const images = photosFrom(body?.images);
  if (images === null) return NextResponse.json({ error: 'photos must be up to 3 JPEG, PNG or WebP pictures' }, { status: 400 });
  if (!text && images.length === 0) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const auth = authFrom(req);
  const claims = guard.claims;
  const ask = text || 'Please look at the attached photo(s) and tell me what you can do with them.';
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (v: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(v)}\n`));
      try {
        const reply = await agentTurn(claims, ask, auth, { images, onEvent: send });
        send({ type: 'done', reply: { say: reply.say, requestId: reply.requestId, plan: reply.plan, links: reply.links ?? [], ticket: reply.ticket ?? null, refused: reply.refused ?? null } });
      } catch (err) {
        const resp = sessionErrorResponse(err);
        send({ type: 'done', reply: { say: resp ? 'Please sign in again.' : 'The assistant could not answer just now. Please try again.', requestId: null, plan: null, links: [], ticket: null, refused: 'failed' } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
