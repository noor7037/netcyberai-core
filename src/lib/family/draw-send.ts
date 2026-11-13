// Send to tutor, made patient (C513). The founder's test answered "too many requests" when a drawing was sent: the
// server counted files that were stored and never sent for ever (fixed in C512). On the phone: a send that fails takes
// its own uploaded file back (DELETE /api/family/tutor/files/<id>), so a failure never uses up a place; a "too many
// files" answer first takes back this window's own unsent drawings it still knows of, waits, and tries again (1 s, then
// 3 s; two retries at most); and a second tap while a send is under way does nothing. Plain functions with the network
// handed in, so the rules are tested without one.

// What one upload answered: the attachment's id, or the code that refused it (with the id when a ticket was already
// given, so the half-made attachment can be taken back).
export type UploadAnswer = { id: string } | { code: string; id?: string };
export type SendDeps = {
  upload: () => Promise<UploadAnswer>;
  // Takes an unsent attachment back; true when it is gone (a 404 counts: there is nothing left to take back).
  remove: (id: string) => Promise<boolean>;
  // Defaults to a timer.
  wait?: (ms: number) => Promise<void>;
  // This window's own drawings that were uploaded and never sent, which a later send may take back.
  leftovers: Set<string>;
};
export const SEND_RETRY_DELAYS: readonly number[] = [1000, 3000];
export type SendOutcome = { ok: true; id: string; tries: number } | { ok: false; code: string; tries: number };

export async function sendWithRetry(deps: SendDeps, delays: readonly number[] = SEND_RETRY_DELAYS): Promise<SendOutcome> {
  for (let attempt = 0; ; attempt++) {
    let r: UploadAnswer;
    try {
      r = await deps.upload();
    } catch {
      r = { code: 'network' };
    }
    if ('id' in r && !('code' in r)) return { ok: true, id: r.id, tries: attempt + 1 };
    const failed = r as { code: string; id?: string };
    // The half-made attachment of this try goes at once; if that fails too, a later send takes it back.
    if (failed.id) {
      const gone = await deps.remove(failed.id).catch(() => false);
      if (!gone) deps.leftovers.add(failed.id);
    }
    if (failed.code !== 'too_many_files' || attempt >= delays.length) {
      // Still "too many" after the retries: the day's files are used up (30 a day), said in its own words.
      return { ok: false, code: failed.code === 'too_many_files' && attempt > 0 ? 'files_today' : failed.code, tries: attempt + 1 };
    }
    for (const id of [...deps.leftovers]) if (await deps.remove(id).catch(() => false)) deps.leftovers.delete(id);
    await (deps.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(delays[attempt]);
  }
}

// One send at a time: a second call while the first runs answers null and starts nothing (a double tap, a tap during
// a retry's wait).
export function singleFlight<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R | null> {
  let running = false;
  return async (...args: A) => {
    if (running) return null;
    running = true;
    try {
      return await fn(...args);
    } finally {
      running = false;
    }
  };
}

// Each refusal in its own plain words (fam.tutor.err.<code>, fam.draw.err.<code>); anything else is the network line.
export const DRAW_SEND_CODES = ['files_today', 'not_signed_in', 'consent_required', 'files_not_read_yet', 'not_found'] as const;
export function sendErrorKey(code: string): string {
  if ((DRAW_SEND_CODES as readonly string[]).includes(code)) return `fam.draw.err.${code}`;
  return `fam.tutor.err.${code}`;
}
