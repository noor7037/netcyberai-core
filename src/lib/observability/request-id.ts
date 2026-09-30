// Request ids (C111). Edge-safe (Web Crypto only): the middleware gives
// every API, app, control and login request an id, passes it to the route
// as `x-request-id` and returns it in the response, so a person's report
// ("it failed at 10:42, id …") finds the log lines and the error report.

export const REQUEST_ID_HEADER = 'x-request-id';
const ID_RE = /^[A-Za-z0-9:_-]{8,128}$/;

// Vercel's own id (x-vercel-id) is reused when present, so our logs and
// Vercel's request log line up; anything malformed is replaced.
export function requestIdFrom(headers: Headers): string {
  for (const name of [REQUEST_ID_HEADER, 'x-vercel-id']) {
    const v = headers.get(name);
    if (v && ID_RE.test(v)) return v;
  }
  return crypto.randomUUID();
}
