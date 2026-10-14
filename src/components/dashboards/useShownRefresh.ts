'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

// Keeping the rows behind a dashboard number true after a change (docs/26 slice 8d, C203).
//
// Opened from a dashboard number, a screen has the rows behind the number drawn above its own content
// (ShownRows), on the server: "Leave requests waiting: 1", the request, and "Approve or refuse them in the list
// below". The list below is the browser's. After a change made there (a complaint closed, a leave request
// decided, a meeting cancelled) it reads its own route again, and nothing more: the rows above would go on
// saying what was true before, with the request just approved still listed as waiting.
//
// A screen that has such a list above it calls the function this gives, once a change has succeeded and its own
// list has been read again. It asks the router to read the page again: the list above is counted and drawn
// afresh by the same function, in the same session, and what the person has typed or opened on the screen
// stays as it is. With no list above there is nothing to read again, and nothing is asked.
export function useShownRefresh(shownAbove: boolean): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (shownAbove) router.refresh();
  }, [router, shownAbove]);
}
