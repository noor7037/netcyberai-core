// A finished template (C514), sent to /api/family/draw/done; with no connection it waits on the phone (localStorage,
// under the child it was done by) and is sent when the phone is back online or the Draw tab opens. Only the template's id
// travels: no image, no score, no text. A refusal (the template is not this child's, or locked) drops it; a network
// failure or a server not ready keeps it.
import { familyApi } from '../../client';

const KEY = 'ncf.draw.done.queue';
type Waiting = { childId: string; templateId: string };

function read(): Waiting[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is Waiting => !!x && typeof x.childId === 'string' && typeof x.templateId === 'string').slice(-200) : [];
  } catch {
    return [];
  }
}
function write(list: Waiting[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the completion is sent now or not at all.
  }
}

const keep = (status: number) => status === 0 || status >= 500;

// Sends one; true when the server has it (or refused it for good), false when it waits.
export async function sendDone(childId: string, templateId: string): Promise<boolean> {
  const r = await familyApi('/api/family/draw/done', 'POST', { templateId });
  if (r.ok) return true;
  if (keep(r.status)) {
    const list = read();
    if (!list.some((x) => x.childId === childId && x.templateId === templateId)) write([...list, { childId, templateId }]);
    return false;
  }
  return true;
}

// Sends what waits for this child (the one the phone has chosen now); others' wait for their own turn.
export async function flushDone(childId: string): Promise<string[]> {
  const list = read();
  const mine = list.filter((x) => x.childId === childId);
  if (!mine.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
  const sent: string[] = [];
  const left = list.filter((x) => x.childId !== childId);
  for (const x of mine) {
    const r = await familyApi('/api/family/draw/done', 'POST', { templateId: x.templateId });
    if (r.ok) sent.push(x.templateId);
    else if (keep(r.status)) left.push(x);
  }
  write(left);
  return sent;
}

export const waitingFor = (childId: string): string[] => read().filter((x) => x.childId === childId).map((x) => x.templateId);
