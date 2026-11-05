// The use steps of Teacher Copilot (W20-C, docs/42 H3), with nothing from the server so the screen can use them.
// The two limits are homework's own (src/lib/homework/homework.ts); a test holds them equal.
export const HOMEWORK_TITLE_MAX = 120;
export const HOMEWORK_DETAILS_MAX = 2000;

// A worksheet set as homework goes to families: its answer key stays with the teacher.
export function withoutAnswers(text: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^\s*(answers?|answer key)\s*:?\s*$/i.test(l.replace(/[*#_]/g, '')));
  return (at === -1 ? lines : lines.slice(0, at)).join('\n').trim();
}

export function homeworkTitle(chapter: string, topic: string): string {
  return (chapter === topic ? topic : `${chapter}: ${topic}`).slice(0, HOMEWORK_TITLE_MAX);
}

// The homework's words from an approved worksheet, or why it cannot be one.
export function homeworkDetails(worksheet: string): { ok: true; details: string } | { ok: false; reason: 'empty' | 'too_long' } {
  const details = withoutAnswers(worksheet);
  if (!details) return { ok: false, reason: 'empty' };
  if (details.length > HOMEWORK_DETAILS_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, details };
}

// The day after `today` (YYYY-MM-DD), the due date the screen suggests.
export function nextDay(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// "Send as today's Pulse": the approved words travel to the Pulse page in this tab only (never in the address), and
// are taken once. If the browser keeps nothing, `putPulseFill` says so and the screen saves the words itself.
const FILL_KEY = (pulseId: string) => `copilot.pulse.${pulseId}`;
export function putPulseFill(pulseId: string, text: string): boolean {
  try {
    sessionStorage.setItem(FILL_KEY(pulseId), text);
    return sessionStorage.getItem(FILL_KEY(pulseId)) === text;
  } catch {
    return false;
  }
}
export function takePulseFill(pulseId: string): string | null {
  try {
    const text = sessionStorage.getItem(FILL_KEY(pulseId));
    sessionStorage.removeItem(FILL_KEY(pulseId));
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}
