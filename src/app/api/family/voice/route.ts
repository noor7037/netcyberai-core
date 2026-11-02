import { NextRequest, NextResponse } from 'next/server';
import type { listChildren } from '@/lib/family/children';
import { callGate } from '@/lib/family/call-gate';
import { hearVoice, type VoiceAllowed } from '@/lib/family/voice-hear';

// Voice input (M2-7, C281): POST { audio: <base64 of a WebM, Ogg, MP4 or WAV recording>, seconds: <the phone's timer> }.
// Refused cheaply first (a child of Class 1 or above, the parent's study_core AND voice_practice consent, the
// voice_input module, seconds left today); the container is read from the bytes; the seconds (the phone's timer, but
// never fewer than the recording's size can hold) are counted against the child's day (Control:
// family.voice_input_seconds_per_day) and given back when the platform refuses, no provider hears it, or no words
// come back; the recording is read once by the family.voice_input profile with no database connection held (F1-3),
// then dropped: never stored, never logged. The answer is only the words (at most 500 characters, an Aadhaar-like
// number taken out) and the seconds left today.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The refusals that need no recording read: the same in the quick look and in the counting transaction.
async function refusal(db: Parameters<typeof listChildren>[0], accountId: string, chosen: string | undefined): Promise<NextResponse | VoiceAllowed> {
  // W16-A4: the call asks the same gate (src/lib/family/call-gate.ts), so a call refuses the same way with the same words.
  const g = await callGate(db, accountId, chosen);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return { child: g.child, children: g.children, language: g.language };
}

export async function POST(req: NextRequest) {
  return hearVoice(req, refusal);
}
