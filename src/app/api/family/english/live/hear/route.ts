import { NextRequest, NextResponse } from 'next/server';
import { liveChild } from '@/lib/family/english/live';
import { hearVoice, type VoiceGate } from '@/lib/family/voice-hear';

// The live English tutor's ear (E1, C382): POST { audio, seconds }, the same path as Study's voice input
// (src/lib/family/voice-hear.ts): the family.voice_input profile (speech to text, a provider cleared for minors), the
// child's voice seconds a day, and the recording dropped once heard (never stored, never logged). Only the words come
// back, for the child to read and correct before sending them to the tutor. Its own refusals: the live tutor's (the
// English course switch, the parent's English course and voice practice consents, from Class 1). The words are heard
// as English, the language being practised. No provider for speech to text answers 503 "ai_not_switched_on": the
// screen then says that live practice needs a speech service that is not set up yet.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const gate: VoiceGate = async (db, accountId, chosen) => {
  const g = await liveChild(db, accountId, chosen);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return { child: g.child, children: g.children, language: 'en' };
};

export async function POST(req: NextRequest) {
  try {
    return await hearVoice(req, gate);
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 503 });
  }
}
