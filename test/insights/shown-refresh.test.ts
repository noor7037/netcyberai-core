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
});
