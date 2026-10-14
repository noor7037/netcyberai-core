import { describe, expect, it } from 'vitest';
import { MAX_DEVICE_ROWS, forgetDeviceList, readDeviceList, writeDeviceList } from './device-list';
import type { KeyValueStore } from './school-profile';
import { waNumber, whatsappDraftLink } from './whatsapp-draft';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const clean = (r: unknown) => (r && typeof r === 'object' && typeof (r as { name?: unknown }).name === 'string' ? { name: (r as { name: string }).name } : null);

describe('tracker list kept on this device', () => {
  it('keeps nothing until written, and round-trips through clean()', () => {
    const store = memoryStore();
    expect(readDeviceList('t', clean, store)).toBeNull();
    expect(writeDeviceList('t', [{ name: 'A' }, { name: 'B' }], store)).toBe(true);
    expect(readDeviceList('t', clean, store)).toEqual([{ name: 'A' }, { name: 'B' }]);
  });
  it('drops rows clean() rejects and caps the list', () => {
    const store = memoryStore();
    store.data.set('nca-free-tool-list:t', JSON.stringify([{ name: 'A' }, { evil: 1 }, 'x']));
    expect(readDeviceList('t', clean, store)).toEqual([{ name: 'A' }]);
    writeDeviceList('t', Array.from({ length: MAX_DEVICE_ROWS + 5 }, (_, i) => ({ name: String(i) })), store);
    expect(readDeviceList('t', clean, store)).toHaveLength(MAX_DEVICE_ROWS);
  });
  it('fails soft on bad data and missing storage, and forgets on request', () => {
    const store = memoryStore();
    store.data.set('nca-free-tool-list:t', '{');
    expect(readDeviceList('t', clean, store)).toBeNull();
    expect(readDeviceList('t', clean, null)).toBeNull();
    expect(writeDeviceList('t', [], null)).toBe(false);
    writeDeviceList('t', [{ name: 'A' }], store);
    forgetDeviceList('t', store);
    expect(store.data.size).toBe(0);
  });
});

describe('WhatsApp draft link', () => {
  it('accepts Indian mobile numbers in the usual shapes', () => {
    for (const p of ['98765 43210', '+91 98765-43210', '09876543210', '919876543210']) expect(waNumber(p), p).toBe('919876543210');
  });
  it('rejects anything that is not a mobile number', () => {
    for (const p of ['', '12345', '0141 2345678', '5876543210']) expect(waNumber(p), p).toBeNull();
  });
  it('encodes the message', () => {
    expect(whatsappDraftLink('9876543210', 'Fee due & thanks')).toBe('https://wa.me/919876543210?text=Fee%20due%20%26%20thanks');
    expect(whatsappDraftLink('123', 'x')).toBeNull();
  });
});
