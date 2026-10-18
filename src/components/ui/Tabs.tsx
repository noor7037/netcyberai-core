'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type TabItem = {
  id: string;
  label: string;
  content: React.ReactNode;
};

type Props = {
  items: TabItem[];
  defaultActiveId?: string;
  /**
   * 'horizontal' (default) keeps every existing caller's behavior
   * unchanged. 'vertical' renders a left-hand rail instead -- for a
   * list long enough that a horizontal row would overflow/wrap and
   * visually overlap (confirmed live on /control/schools/[id]'s 21-item
   * school-detail tab list, screenshotted by the founder). Same
   * roving-tabindex keyboard model either way; arrow keys still move
   * next/previous in the list, which reads naturally in a vertical rail
   * too. Under 768 px the rail becomes one scrolling row above the
   * panel, so the page itself never scrolls sideways.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Prefix for tab/panel ids, so two tab sets on one page never share an id. */
  idPrefix?: string;
  /** Accessible name for the tab list. */
  label?: string;
};

// Hand-rolled per the WAI-ARIA Authoring Practices Tabs pattern
// (role=tablist/tab/tabpanel, aria-selected, a roving tabindex, and
// Left/Right/Home/End keyboard navigation with automatic activation)
// rather than a dependency -- this is a well-specified, well-tested
// recipe, not the kind of thing (like a focus trap) that's genuinely
// easy to get subtly wrong by hand.
export function Tabs({ items, defaultActiveId, orientation = 'horizontal', idPrefix = '', label = 'Tabs' }: Props) {
  const [activeId, setActiveId] = useState(defaultActiveId ?? items[0]?.id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);

  // A tab opened by the page's address (?tab=…) can sit past the edge of a scrolling tab row on a phone (C238): the
  // row is scrolled sideways to it once, when the tabs first show. Only the row moves, never the page.
  useEffect(() => {
    const list = listRef.current;
    const tab = activeId ? tabRefs.current[activeId] : null;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const row = list.getBoundingClientRect();
    const at = tab.getBoundingClientRect();
    if (at.left < row.left || at.right > row.right) list.scrollLeft += at.left - row.left - (row.width - at.width) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the tab the page opened with
  }, []);

  function activate(id: string) {
    setActiveId(id);
    tabRefs.current[id]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      activate(items[(index + 1) % items.length].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      activate(items[(index - 1 + items.length) % items.length].id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      activate(items[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      activate(items[items.length - 1].id);
    }
  }

  const isVertical = orientation === 'vertical';

  const tabList = (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation={isVertical ? 'vertical' : undefined}
      className={
        isVertical
          ? 'flex w-full shrink-0 gap-1 overflow-x-auto border-b border-slate/10 pb-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-2'
          : 'flex gap-1 overflow-x-auto border-b border-slate/10'
      }
    >
      {items.map((item, index) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[item.id] = el;
            }}
            role="tab"
            id={`${idPrefix}tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}tabpanel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => activate(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={
              isVertical
                ? `min-h-[44px] shrink-0 whitespace-nowrap rounded-md px-4 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
                    selected ? 'bg-sapphire/10 text-sapphire' : 'text-slate/70 hover:bg-slate/5 hover:text-slate'
                  }`
                : `min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
                    selected ? 'border-sapphire text-sapphire' : 'border-transparent text-slate/70 hover:text-slate'
                  }`
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  const panels = items.map((item) => (
    <div
      key={item.id}
      role="tabpanel"
      id={`${idPrefix}tabpanel-${item.id}`}
      aria-labelledby={`${idPrefix}tab-${item.id}`}
      hidden={item.id !== activeId}
      tabIndex={0}
      className={isVertical ? 'min-w-0 flex-1 md:pl-6' : 'py-4'}
    >
      {item.content}
    </div>
  ));

  if (isVertical) {
    // A row of tabs above the panel on a phone; a column beside it from 768 px.
    return <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-2">{tabList}{panels}</div>;
  }

  return (
    <div>
      {tabList}
      {panels}
    </div>
  );
}
