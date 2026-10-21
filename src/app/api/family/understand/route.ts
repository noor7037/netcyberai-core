import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { FamilySessionRevokedError, withFamilyContext } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { openItem } from '@/lib/family/items';
import { claimSubject } from '@/lib/family/learning';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { FOLLOW_UPS, resolve, type FollowUp, type ResolveInput, type ResolverEvent } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { indiaDate } from '@/lib/time/india';
import { isMessageKey, t } from '@/lib/i18n';

// Understand (M1-5, C251): POST { kind: 'topic' | 'chapter', key } or { kind: 'question', text, subject }, with an
// optional followUp ('simpler', 'another_example', 'differently', 'practise_more') or retry { token, choice } (a wrong
// answer: explain that exact misunderstanding differently). The answer is a stream of JSON lines (ResolverEvent), one
// per checked block, for the child using the app now. Needs the parent's study_core consent and the module switched on.
export const dynamic = 'force-dynamic';

const SUBJECTS = ['mathematics', 'science'] as const;

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const body = await jsonBody(req);
  const followUp = FOLLOW_UPS.includes(body.followUp as FollowUp) ? (body.followUp as FollowUp) : null;
  let input: ResolveInput | null = null;
  if ((body.kind === 'topic' || body.kind === 'chapter') && typeof body.key === 'string') input = { kind: body.kind, key: body.key };
  if (body.kind === 'question' && typeof body.text === 'string' && SUBJECTS.includes(body.subject as never)) {
    const text = body.text.trim().slice(0, 500);
    if (text.length >= 3) input = { kind: 'question', text, subject: body.subject as 'mathematics' | 'science' };
  }
  const retry = body.retry && typeof body.retry === 'object' ? (body.retry as { token?: unknown; choice?: unknown }) : null;
  if (!input && !retry) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ResolverEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await withFamilyContext({ accountId: session.accountId, tokenVersion: session.tokenVersion }, async (db) => {
          const children = await listChildren(db, session.accountId);
          const child = activeChild(children, chosen);
          const words = (key: string) => (isMessageKey(key) ? t(child?.language ?? 'en', key) : key);
          if (!child) return send({ t: 'refused', reason: 'not_found', message: words('fam.understand.noChild') });
          if (!(await consentState(db, session.accountId)).study_core) return send({ t: 'refused', reason: 'not_found', message: words('fam.err.consent_required') });
          if (!(await familyModuleOn(db, 'understand', session.accountId))) return send({ t: 'refused', reason: 'not_switched_on', message: words('fam.understand.off') });
          let target = input;
          let misconception: string | null = null;
          if (retry) {
            const item = openItem(retry.token, { accountId: session.accountId, childId: child.childId });
            const choice = Number(retry.choice);
            if (!item || !Number.isInteger(choice) || choice < 0 || choice >= item.w.length || choice === item.a) return send({ t: 'refused', reason: 'not_found', message: words('fam.understand.notFound') });
            misconception = item.w[choice] || item.y;
            target = item.k.endsWith('.question') ? { kind: 'question', text: words('fam.understand.retryQuestion'), subject: item.s as 'mathematics' | 'science' } : { kind: /\.t\d+$/.test(item.k) ? 'topic' : 'chapter', key: item.k };
          }
          const account = await accountSummary(db, session.accountId);
          await resolve(
            db,
            {
              accountId: session.accountId,
              child,
              childFirstNames: children.map((c) => c.firstName),
              parentEmail: account?.email ?? '',
              day: indiaDate(),
              refusalWords: words,
              allowSubject: (subject) => claimSubject(db, session.accountId, child.childId, subject),
            },
            target!,
            followUp,
            send,
            misconception
          );
        });
      } catch (err) {
        send({ t: 'refused', reason: err instanceof FamilySessionRevokedError ? 'not_found' : 'failed', message: t('en', 'fam.err.network') });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
