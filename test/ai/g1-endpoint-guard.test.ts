import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkEndpoint, checkEndpointShape, endpointNet, guardedFetch, isPublicAddress, type Resolved } from '@/lib/ai/adapters/endpoint-guard';

// G1 (C369): the founder's address for the OpenAI-compatible adapter. The network is replaced (endpointNet), so no
// name is resolved and no connection is opened here. Made-up names and addresses only.

afterEach(() => {
  vi.restoreAllMocks();
});
const resolvesTo = (...addresses: string[]) => vi.spyOn(endpointNet, 'lookup').mockImplementation(async () => addresses.map((a): Resolved => ({ address: a, family: a.includes(':') ? 6 : 4 })));

describe('which addresses are public', () => {
  it('private, loopback, link-local, CGNAT, multicast, unspecified and reserved IPv4 are refused', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '100.100.100.200', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '142.250.183.10']) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it('IPv6: loopback, unspecified, unique local, link-local, multicast, documentation and Teredo are refused', () => {
    for (const ip of ['::', '::1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'fec0::1', 'ff02::1', '2001:db8::1', '2001::1', '3fff::1', '::7f00:1', '100::1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicAddress('2404:6800:4009:80b::200e')).toBe(true);
  });

  it('an IPv4 address carried inside IPv6 is judged as that IPv4 address (mapped, translated, NAT64, 6to4)', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:0:10.0.0.1', '64:ff9b::10.0.0.1', '2002:a9fe:a9fe::1', '2002:c0a8:0101::1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('64:ff9b::808:808')).toBe(true);
  });

  it('anything that is not an address is not public', () => {
    for (const ip of ['', 'localhost', '1.2.3', '1.2.3.256', 'fe80::1%eth0', '1::2::3']) expect(isPublicAddress(ip), ip).toBe(false);
  });
});

describe('the address’s shape (no network)', () => {
  it('https only; no user name or password, query, fragment or unusual port', () => {
    expect(checkEndpointShape('http://api.example.com/v1')).toEqual({ ok: false, code: 'not_https' });
    expect(checkEndpointShape('ftp://api.example.com')).toEqual({ ok: false, code: 'not_https' });
    expect(checkEndpointShape('not an address')).toEqual({ ok: false, code: 'not_https' });
    expect(checkEndpointShape('https://user:pass@api.example.com/v1')).toEqual({ ok: false, code: 'credentials' });
    expect(checkEndpointShape('https://key@api.example.com/v1')).toEqual({ ok: false, code: 'credentials' });
    expect(checkEndpointShape('https://api.example.com/v1?key=abc')).toEqual({ ok: false, code: 'query' });
    expect(checkEndpointShape('https://api.example.com/v1#x')).toEqual({ ok: false, code: 'query' });
    expect(checkEndpointShape('https://api.example.com:8443/v1')).toEqual({ ok: false, code: 'port' });
    expect(checkEndpointShape(`https://api.example.com/${'a'.repeat(500)}`)).toEqual({ ok: false, code: 'too_long' });
  });

  it('local and metadata names are refused, as is a name of one label', () => {
    for (const host of ['localhost', 'app.localhost', 'printer.local', 'metadata.google.internal', 'metadata', 'instance-data', 'db.internal', 'router.home.arpa', 'intranet']) {
      expect(checkEndpointShape(`https://${host}/v1`), host).toEqual({ ok: false, code: 'host' });
    }
  });

  it('a raw address is refused unless public, however it is written', () => {
    for (const raw of ['https://127.0.0.1/v1', 'https://169.254.169.254/latest', 'https://2130706433/', 'https://0x7f.1/', 'https://[::1]/v1', 'https://[::ffff:127.0.0.1]/v1', 'https://[fd00:ec2::254]/', 'https://10.0.0.5']) {
      expect(checkEndpointShape(raw), raw).toEqual({ ok: false, code: 'private_address' });
    }
    expect(checkEndpointShape('https://8.8.8.8/v1')).toMatchObject({ ok: true, normal: 'https://8.8.8.8/v1' });
  });

  it('a good address is kept without its trailing slash, the usual port dropped', () => {
    expect(checkEndpointShape(' https://API.Example.com:443/v1/ ')).toMatchObject({ ok: true, normal: 'https://api.example.com/v1' });
    expect(checkEndpointShape('https://api.example.com')).toMatchObject({ ok: true, normal: 'https://api.example.com' });
  });
});

describe('resolving: every answer must be public', () => {
  it('a name that resolves to a private, metadata or mapped address is refused; a public one passes', async () => {
    resolvesTo('10.0.0.7');
    expect(await checkEndpoint('https://llm.example.com/v1')).toEqual({ ok: false, code: 'private_address' });
    resolvesTo('169.254.169.254');
    expect(await checkEndpoint('https://llm.example.com/v1')).toEqual({ ok: false, code: 'private_address' });
    resolvesTo('::ffff:192.168.0.1');
    expect(await checkEndpoint('https://llm.example.com/v1')).toEqual({ ok: false, code: 'private_address' });
    // One public answer beside a private one is still refused: a connection could take either.
    resolvesTo('8.8.8.8', '127.0.0.1');
    expect(await checkEndpoint('https://llm.example.com/v1')).toEqual({ ok: false, code: 'private_address' });
    resolvesTo('8.8.8.8', '2606:4700:4700::1111');
    expect(await checkEndpoint('https://llm.example.com/v1')).toEqual({ ok: true, normal: 'https://llm.example.com/v1' });
  });

  it('a name that does not resolve is refused', async () => {
    vi.spyOn(endpointNet, 'lookup').mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    expect(await checkEndpoint('https://nowhere.example.com/v1')).toEqual({ ok: false, code: 'dns' });
    resolvesTo();
    expect(await checkEndpoint('https://nowhere.example.com/v1')).toEqual({ ok: false, code: 'dns' });
  });
});

describe('the call: checked again, pinned, and never redirected', () => {
  it('goes to exactly the address just checked, with the path added', async () => {
    resolvesTo('8.8.4.4');
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(new Response('{}', { status: 200 }));
    const got = await guardedFetch('https://llm.example.com/v1', '/chat/completions', { method: 'POST', headers: {}, body: '{}' });
    expect(got.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, to] = send.mock.calls[0];
    expect(url.href).toBe('https://llm.example.com/v1/chat/completions');
    expect(to).toEqual({ address: '8.8.4.4', family: 4 });
  });

  it('DNS rebinding: a name public when saved but private at call time is refused, and nothing is sent', async () => {
    resolvesTo('8.8.4.4');
    expect(await checkEndpoint('https://llm.example.com/v1')).toMatchObject({ ok: true });
    resolvesTo('127.0.0.1');
    const send = vi.spyOn(endpointNet, 'send');
    expect(await guardedFetch('https://llm.example.com/v1', '/models', { method: 'GET', headers: {} })).toEqual({ ok: false, code: 'private_address' });
    expect(send).not.toHaveBeenCalled();
  });

  it('any 3xx is a failure: the redirect is not followed', async () => {
    resolvesTo('8.8.4.4');
    for (const status of [301, 302, 303, 307, 308]) {
      const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(new Response(null, { status, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
      expect(await guardedFetch('https://llm.example.com/v1', '/models', { method: 'GET', headers: {} })).toEqual({ ok: false, code: 'redirect' });
      expect(send).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
      resolvesTo('8.8.4.4');
    }
  });

  it('an address stored before a rule tightened is checked again at the call (http, private literal)', async () => {
    const send = vi.spyOn(endpointNet, 'send');
    expect(await guardedFetch('http://llm.example.com/v1', '/models', { method: 'GET', headers: {} })).toEqual({ ok: false, code: 'not_https' });
    expect(await guardedFetch('https://[::ffff:a9fe:a9fe]', '/models', { method: 'GET', headers: {} })).toEqual({ ok: false, code: 'private_address' });
    expect(send).not.toHaveBeenCalled();
  });
});
