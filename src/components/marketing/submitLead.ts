// One submit path for every website lead form. Resolves only when the
// API stored the lead (2xx); every other outcome, including a network
// error or no answer within SUBMIT_TIMEOUT_MS, throws a readable
// message so the form shows an error instead of spinning or, worse,
// showing success.
const SUBMIT_TIMEOUT_MS = 20_000;

export async function submitLead(payload: Record<string, unknown>): Promise<{ isDuplicate: boolean }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
    return { isDuplicate: Boolean(body?.isDuplicate) };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Our server did not answer in time, so your request may not have been saved. Please try again.');
    }
    if (err instanceof TypeError) {
      throw new Error('We could not reach our server. Please check your connection and try again.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}
