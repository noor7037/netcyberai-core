import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The rows behind a dashboard number are drawn on the server, above the module's own screen (docs/26 slice 8d,
// C203). The screen below is the browser's: after a change made there it reads its own list again. Unless the
// page is read again too, the list above goes on saying what was true before the change: "Leave requests
// waiting: 1", with the request just approved still on it. These tests hold the fix in place: the one hook that
// asks the router to read the page again, and its use by the three screens that have a list drawn above them.
// (The browser harness does it for real: it closes a complaint, cancels a meeting and cancels a leave in the
// list below, and the list above must say so without a reload.)

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { useShownRefresh } from '@/components/dashboards/useShownRefresh';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('a list drawn above a screen is read again after a change made in the screen below it', () => {
  it('the hook asks the router to read the page again when a list is drawn above, and asks nothing when none is', () => {
    // The hook is called as a screen calls it; the function it gives back is what the screen runs after a change.
    const Screen = ({ shownAbove }: { shownAbove: boolean }) => {
      useShownRefresh(shownAbove)();
      return null;
    };
    renderToStaticMarkup(h(Screen, { shownAbove: false }));
    expect(router.refresh).not.toHaveBeenCalled();
    renderToStaticMarkup(h(Screen, { shownAbove: true }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('Complaints, PTM and Staff leave each run it after a change that succeeded, once their own list has been read again', () => {
    for (const file of ['src/components/complaints/ComplaintsView.tsx', 'src/components/ptm/PtmView.tsx', 'src/components/staff/StaffLeaveOffice.tsx']) {
      const text = read(file);
      expect(text, file).toMatch(/\(\{ shownAbove = false \}: \{ shownAbove\?: boolean \}/);
      expect(text, file).toContain('const refreshShown = useShownRefresh(shownAbove);');
      // Every change of the screen goes through its one `send`. A refusal returns before the list is read again;
      // after a success the screen's own list is read first, and then the list above.
      const send = /const send = async \([\s\S]*?\n  \};/.exec(text)?.[0] ?? '';
      expect(send, file).toMatch(/if \(!res\?\.ok\) return /);
      expect(send.indexOf('await load('), file).toBeGreaterThan(send.indexOf('if (!res?.ok) return '));
      expect(send.indexOf('refreshShown();'), file).toBeGreaterThan(send.indexOf('await load('));
      expect(text.match(/refreshShown\(\);/g), file).toHaveLength(1);
    }
    // Whether a list is drawn above is the page's to say: test/insights/dashboard.test.ts reads what each page
    // hands its screen, with the filter and without it.
  });

  // C210: the same for every other screen a dashboard number opens.
  const PROPS = /\{[^}]*shownAbove = false[^}]*\}: \{[^}]*shownAbove\?: boolean[^}]*\}/;
  const times = (text: string, what: string) => text.split(what).length - 1;

  it('Notices, Events and Parent AI run it in their one send, after a success, once their own list has been read again', () => {
    for (const file of ['src/components/communication/NoticesView.tsx', 'src/components/events/EventsView.tsx', 'src/components/parent-ai/ParentAiView.tsx']) {
      const text = read(file);
      expect(text, file).toMatch(/\(\{ shownAbove = false \}: \{ shownAbove\?: boolean \}/);
      expect(text, file).toContain('const refreshShown = useShownRefresh(shownAbove);');
      const send = /const send = async \([\s\S]*?\n  \};/.exec(text)?.[0] ?? '';
      expect(send, file).toMatch(/if \(!res\?\.ok\) return /);
      expect(send.indexOf('await load('), file).toBeGreaterThan(send.indexOf('if (!res?.ok) return '));
      expect(send.indexOf('refreshShown();'), file).toBeGreaterThan(send.indexOf('await load('));
      expect(times(text, 'refreshShown();'), file).toBe(1);
    }
  });

  it('Attendance, Homework and the Pulse messages run it after every change the server now holds, and only then', () => {
    // [file, how many changes the screen makes (each calls afterChange once it has succeeded), the reloads left that
    // are not after a change: the screen opening, or the Pulse list read again after a send that failed]
    const screens: [string, number, string, number][] = [
      ['src/components/attendance/AttendanceView.tsx', 5, 'void loadRoster(', 1],
      ['src/components/homework/HomeworkView.tsx', 4, 'void load()', 1],
      ['src/components/pulse/PulseDraftsView.tsx', 2, 'void load()', 2],
    ];
    for (const [file, changes, reload, reloadsLeft] of screens) {
      const text = read(file);
      expect(text, file).toMatch(PROPS);
      expect(text, file).toContain('const refreshShown = useShownRefresh(shownAbove);');
      // One function runs after a change: the screen's own list first, then the list above.
      const after = /const afterChange = async \(\) => \{[\s\S]*?\n  \};/.exec(text)?.[0] ?? '';
      expect(after.indexOf('refreshShown();'), file).toBeGreaterThan(after.indexOf('await '));
      expect(after.indexOf('await '), file).toBeGreaterThan(-1);
      expect(times(text, 'refreshShown();'), file).toBe(1);
      expect(times(text, 'void afterChange();'), file).toBe(changes);
      expect(times(text, reload), file).toBe(reloadsLeft);
      // Never on a refusal: every call follows the success of its own change (a failed one returns first).
      for (const at of text.split('void afterChange();').slice(0, -1).map((before) => before.slice(before.lastIndexOf('\n  async function ') >= 0 ? before.lastIndexOf('\n  async function ') : 0))) {
        if (!/res\?\.ok|!op|sync\.state === 'saved'/.test(at)) throw new Error(`${file}: a call to afterChange that follows no success`);
      }
    }
  });

  it('Fees: every part that takes money, verifies a payment, records a promise or raises dues has the fee rows above read again', () => {
    const first = read('src/components/fees/FeesFirstLoad.tsx');
    expect(first).toMatch(PROPS);
    expect(first).toContain('const changed = useShownRefresh(shownAbove);');
    for (const [file, calls] of [
      ['src/components/fees/FeesVerifyView.tsx', 2],
      ['src/components/fees/FeesCollectView.tsx', 2],
      ['src/components/fees/FeesBankView.tsx', 2],
      ['src/components/fees/FeesRecoveryView.tsx', 1],
      ['src/components/fees/FeesDuesView.tsx', 2],
    ] as const) {
      const text = read(file);
      expect(text, file).toContain('const feesChanged = useFeesChanged();');
      expect(times(text, 'feesChanged()'), file).toBe(calls);
    }
  });

  it('Fees: the function a part is given asks the router to read the page again only when a list is drawn above', async () => {
    const { FeesFirstLoad, useFeesChanged } = await import('@/components/fees/FeesFirstLoad');
    const Part = () => {
      useFeesChanged()();
      return null;
    };
    router.refresh.mockClear();
    renderToStaticMarkup(h(Part));
    renderToStaticMarkup(h(FeesFirstLoad, { shownAbove: false, children: h(Part) }));
    expect(router.refresh).not.toHaveBeenCalled();
    renderToStaticMarkup(h(FeesFirstLoad, { shownAbove: true, children: h(Part) }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a support ticket changed on its own page has the router read again, so the tickets a dashboard number listed are as they are now', () => {
    const detail = read('src/components/tickets/TicketDetail.tsx');
    const act = /async function act\([\s\S]*?\n  \}/.exec(detail)?.[0] ?? '';
    // After the change and the ticket read again; a refusal throws before it. Opening a screenshot changes nothing.
    expect(act.indexOf('if (changes) onChanged?.();')).toBeGreaterThan(act.indexOf('setTicket(await api.get(ticketId));'));
    expect(act.indexOf('setTicket(await api.get(ticketId));')).toBeGreaterThan(act.indexOf('await fn();'));
    expect(detail).toMatch(/window\.open\([\s\S]*?\},\s*undefined,\s*false\s*\)/);
    const school = read('src/components/tickets/TicketScreens.tsx');
    expect(school).toContain('<TicketDetail api={api} routes={SCHOOL_TICKET_ROUTES} ticketId={ticketId} onChanged={() => router.refresh()} />');
  });
});
