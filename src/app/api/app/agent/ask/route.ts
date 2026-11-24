import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { agentTurn } from '@/lib/agent/loop';
import { authFrom, recentMessages } from '@/lib/agent/requests';

// The school agent's conversation (C546). POST { text }: one turn, which may end in a change request to review.
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

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  try {
    return NextResponse.json(await agentTurn(guard.claims, text, authFrom(req)));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
