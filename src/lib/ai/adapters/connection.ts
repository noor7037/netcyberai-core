import { CALL_TIMEOUT_MS, type ConnectionTest } from './types';

// A key's free check (G5, C373): one GET to the vendor's model list, which answers only for a working key and costs
// nothing. "Test the key" in Control and the 15-minute health probe both use it. Only the status is read: nothing the
// vendor sends back is kept, and the key goes in a header, never in the address.
export async function freeCheck(url: string, headers: Record<string, string>): Promise<ConnectionTest> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch {
    return { ok: false, failure: 'network' };
  }
  await res.body?.cancel().catch(() => {});
  return res.ok ? { ok: true } : { ok: false, failure: 'http', status: res.status };
}
