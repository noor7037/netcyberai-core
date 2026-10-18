import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '@/components/app-shell/LangContext';
import { MessagesView } from '@/components/communication/MessagesView';

// The message list's day headings (C239 review): the list is newest written first, so each heading is a day the
// messages under it were written, and appears once; a row shows the time of its latest state, with that day too when
// it is not the heading's. Made-up rows only.

const row = (id: string, created: string, status: string, at: Partial<Record<'delivered_at' | 'read_at' | 'failed_at', string>> = {}) => ({
  log_id: id,
  created_at: created,
  child: null,
  guardian: null,
  phone_last4: '0001',
  template_name: 'class_notice',
  status,
  reason: null,
  provider: 'meta',
  delivered_at: at.delivered_at ?? null,
  read_at: at.read_at ?? null,
  failed_at: at.failed_at ?? null,
});

describe('day headings of the message list', () => {
  it('one heading a written day, in the list’s order; a state on another day carries that day', () => {
    // Times in UTC; India is 5:30 ahead. A: written and delivered 18 Oct. B: written and delivered 17 Oct. C: written
    // 17 Oct, read 18 Oct.
    const messages = [
      row('a', '2026-10-18T05:00:00Z', 'delivered', { delivered_at: '2026-10-18T05:01:00Z' }),
      row('b', '2026-10-17T06:00:00Z', 'delivered', { delivered_at: '2026-10-17T06:01:00Z' }),
      row('c', '2026-10-17T05:00:00Z', 'read', { read_at: '2026-10-18T04:00:00Z' }),
    ];
    const html = renderToStaticMarkup(h(LangProvider, { lang: 'en' }, h(MessagesView, { mayRead: true, initial: { messages, counts: { delivered: 2, read: 1 }, days: 14 } })));
    const headings = [...html.matchAll(/data-message-day[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(headings).toEqual(['18 Oct', '17 Oct']);
    // C sits under 17 Oct and says it was read on 18 Oct; A and B show their time alone.
    const rows = [...html.matchAll(/data-message="(\w+)"[\s\S]*?<span class="text-slate\/70">([^<]+)</g)].map((m) => m[2]);
    expect(rows[0]).not.toContain('Oct');
    expect(rows[1]).not.toContain('Oct');
    expect(rows[2]).toMatch(/^18 Oct, 9:30am$/i);
  });
});
