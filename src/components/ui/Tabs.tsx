'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

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
   * too.
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
      role="tablist"
      aria-label={label}
      aria-orientation={isVertical ? 'vertical' : undefined}
      className={
        isVertical
          ? 'flex w-56 shrink-0 flex-col gap-1 border-r border-slate/10 pr-2'
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
                ? `min-h-[44px] whitespace-nowrap rounded-md px-4 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
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
      className={isVertical ? 'min-w-0 flex-1 pl-6' : 'py-4'}
    >
      {item.content}
    </div>
  ));

  if (isVertical) {
    return <div className="flex items-start gap-2">{tabList}{panels}</div>;
  }

  return (
    <div>
      {tabList}
      {panels}
    </div>
  );
}
