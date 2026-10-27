import { lookup as dnsLookup } from 'dns/promises';
import { request as httpsRequest } from 'https';
import { isIP } from 'net';
import { Readable } from 'stream';

// The one address in the platform the founder types himself (G1, C369): the OpenAI-compatible adapter's base URL. The
// server, not the screen, decides whether it may be called, so that Control can never be used to reach this server's
// own network, a cloud's metadata service or anything else that is not a public service on the internet.
//
// An address is refused unless it is https, carries no user name, password, query or fragment, uses the usual port,
// and its host is a public name or a public address. Every address the name resolves to must be public (IPv4 and
// IPv6, an IPv4 address inside IPv6 judged as the IPv4 address it carries). The check runs when the address is saved
// and again at every call, because what a name resolves to can change; and the call goes to exactly the address that
// was checked (the connection's own lookup is pinned to it), so a name that changes its answer between the check and
// the connection still reaches only the checked address. A redirect is never followed: it is a failure.

export type EndpointError = 'not_https' | 'credentials' | 'query' | 'port' | 'host' | 'private_address' | 'dns' | 'redirect' | 'too_long';
export type Resolved = { address: string; family: 4 | 6 };
export type Lookup = (host: string) => Promise<Resolved[]>;
export type SendInit = { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal };
export type Send = (url: URL, to: Resolved, init: SendInit) => Promise<Response>;

const MAX_URL = 500;

// Names that are never public services: this machine, a local network, a cloud's metadata service.
const BLOCKED_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data', 'instance-data.ec2.internal', 'metadata.azure.internal']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa', '.arpa', '.test', '.invalid', '.example', '.onion'];

// ---- addresses -----------------------------------------------------------------------------------------------------

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

// Reserved IPv4 ranges (IANA special-purpose registry): never reachable as a public service.
const V4_BLOCKED: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 8], // this network, 0.0.0.0
  [10, 0, 0, 0, 8], // private
  [100, 64, 0, 0, 10], // carrier-grade NAT (also Alibaba's metadata, 100.100.100.200)
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local (the metadata service at 169.254.169.254)
  [172, 16, 0, 0, 12], // private
  [192, 0, 0, 0, 24], // IETF protocol assignments
  [192, 0, 2, 0, 24], // documentation
  [192, 88, 99, 0, 24], // 6to4 relay
  [192, 168, 0, 0, 16], // private
  [198, 18, 0, 0, 15], // benchmarking
  [198, 51, 100, 0, 24], // documentation
  [203, 0, 113, 0, 24], // documentation
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reserved, and the broadcast address
];

function v4Public(parts: number[]): boolean {
  const n = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  return !V4_BLOCKED.some(([a, b, c, d, bits]) => {
    const base = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

// An IPv6 address as its eight 16-bit groups (with "::" and a trailing dotted IPv4 part expanded), or null.
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) return null; // a zone id names a local interface: never public
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) {
    const v4 = ipv4Parts(dotted[1]);
    if (!v4) return null;
    s = `${s.slice(0, -dotted[1].length)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const read = (h: string) => (h === '' ? [] : h.split(':'));
  const head = read(halves[0]);
  const tail = halves.length === 2 ? read(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function v6Public(g: number[]): boolean {
  const embedded = (hi: number, lo: number) => v4Public([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (IPv4-translated): judged as the IPv4 address inside.
  if (zeros(0, 5) && g[5] === 0xffff) return embedded(g[6], g[7]);
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return embedded(g[6], g[7]);
  // 64:ff9b::/96 (NAT64): the IPv4 address inside.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return embedded(g[6], g[7]);
  // 2002::/16 (6to4): the IPv4 address in groups 1 and 2.
  if (g[0] === 0x2002) return embedded(g[1], g[2]);
  // Only global unicast (2000::/3) is public: this refuses ::, ::1, the IPv4-compatible ::/96, fc00::/7 (unique
  // local, AWS's fd00:ec2::254 metadata), fe80::/10 (link-local), fec0::/10 and ff00::/8 (multicast).
  if ((g[0] & 0xe000) !== 0x2000) return false;
  // Inside 2000::/3: 2001::/23 (IETF protocol assignments, Teredo 2001::/32), 2001:db8::/32 (documentation),
  // 64:ff9b:1::/48 is outside 2000::/3 already; 3fff::/20 (documentation).
  if (g[0] === 0x2001 && g[1] < 0x0200) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
  if (g[0] === 0x3fff && g[1] < 0x1000) return false;
  return true;
}

// Whether an address (IPv4 or IPv6, without brackets) is a public internet address.
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const parts = ipv4Parts(ip);
    return parts !== null && v4Public(parts);
  }
  if (kind === 6) {
    const groups = ipv6Groups(ip);
    return groups !== null && v6Public(groups);
  }
  return false;
}

// ---- the address's shape -------------------------------------------------------------------------------------------

const bare = (hostname: string) => hostname.replace(/^\[|\]$/g, '');

// The address as it is stored (no trailing slash), or why it is refused. No network is used.
export function checkEndpointShape(raw: string): { ok: true; url: URL; normal: string } | { ok: false; code: EndpointError } {
  const text = raw.trim();
  if (text.length > MAX_URL) return { ok: false, code: 'too_long' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, code: 'not_https' };
  }
  if (url.protocol !== 'https:') return { ok: false, code: 'not_https' };
  if (url.username || url.password) return { ok: false, code: 'credentials' };
  if (url.search || url.hash || text.includes('?') || text.includes('#')) return { ok: false, code: 'query' };
  if (url.port !== '' && url.port !== '443') return { ok: false, code: 'port' };
  const host = bare(url.hostname.toLowerCase()).replace(/\.$/, '');
  if (!host) return { ok: false, code: 'host' };
  if (isIP(host)) {
    if (!isPublicAddress(host)) return { ok: false, code: 'private_address' };
  } else {
    // A public name has at least two labels, and is none of the local or metadata names.
    if (!host.includes('.') || BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, code: 'host' };
    if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, code: 'host' };
  }
  const normal = `https://${url.host}${url.pathname.replace(/\/+$/, '')}`;
  return { ok: true, url: new URL(normal), normal };
}

// ---- resolving, and the call --------------------------------------------------------------------------------------

async function systemLookup(host: string): Promise<Resolved[]> {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((f) => ({ address: f.address, family: f.family === 6 ? 6 : 4 }));
}

// Sends one https request to exactly the address given: the connection's lookup is pinned to it, while the name is
// still used for the certificate check (SNI) and the Host header. Redirects are not followed (https.request never does).
const pinnedSend: Send = (url, to, init) =>
  new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: bare(url.hostname),
        servername: isIP(bare(url.hostname)) ? undefined : bare(url.hostname),
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: init.method,
        headers: init.headers,
        signal: init.signal,
        lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => (opts?.all ? cb(null, [to]) : cb(null, to.address, to.family))) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers.set(k, v);
        if (status < 200 || status > 599 || status === 204 || status === 205 || status === 304 || (status >= 300 && status < 400)) {
          res.resume();
          // A Response cannot carry these statuses with a body; the caller only reads the status.
          resolve(new Response(null, { status: status >= 200 && status <= 599 ? status : 502, headers }));
          return;
        }
        resolve(new Response(Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>, { status, headers }));
      }
    );
    req.on('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });

// What the guard uses to reach the network. Replaced in tests (vi.spyOn), so no test resolves a name or opens a
// connection.
export const endpointNet: { lookup: Lookup; send: Send } = { lookup: systemLookup, send: pinnedSend };

// The address's name resolved, every answer public. Returns the address to connect to.
export async function resolvePublic(url: URL): Promise<{ ok: true; to: Resolved } | { ok: false; code: EndpointError }> {
  const host = bare(url.hostname.toLowerCase());
  if (isIP(host)) return isPublicAddress(host) ? { ok: true, to: { address: host, family: isIP(host) === 6 ? 6 : 4 } } : { ok: false, code: 'private_address' };
  let found: Resolved[];
  try {
    found = await endpointNet.lookup(host);
  } catch {
    return { ok: false, code: 'dns' };
  }
  if (found.length === 0) return { ok: false, code: 'dns' };
  // Every answer must be public: a name that also points inside is refused, whichever answer a connection would take.
  if (!found.every((f) => isPublicAddress(f.address))) return { ok: false, code: 'private_address' };
  return { ok: true, to: found[0] };
}

// The whole check, as Control runs it when the address is saved.
export async function checkEndpoint(raw: string): Promise<{ ok: true; normal: string } | { ok: false; code: EndpointError }> {
  const shape = checkEndpointShape(raw);
  if (!shape.ok) return shape;
  const resolved = await resolvePublic(shape.url);
  return resolved.ok ? { ok: true, normal: shape.normal } : resolved;
}

// One call to the founder's address plus a path (for example "/chat/completions"): checked again now, sent to the
// address just checked, and any redirect refused.
export async function guardedFetch(base: string, path: string, init: SendInit): Promise<{ ok: true; res: Response } | { ok: false; code: EndpointError }> {
  const shape = checkEndpointShape(base);
  if (!shape.ok) return shape;
  const resolved = await resolvePublic(shape.url);
  if (!resolved.ok) return resolved;
  const url = new URL(`${shape.normal}${path}`);
  const res = await endpointNet.send(url, resolved.to, init);
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, code: 'redirect' };
  }
  return { ok: true, res };
}
