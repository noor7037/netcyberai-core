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
};

// Hand-rolled per the WAI-ARIA Authoring Practices Tabs pattern
// (role=tablist/tab/tabpanel, aria-selected, a roving tabindex, and
// Left/Right/Home/End keyboard navigation with automatic activation)
// rather than a dependency -- this is a well-specified, well-tested
// recipe, not the kind of thing (like a focus trap) that's genuinely
// easy to get subtly wrong by hand.
export function Tabs({ items, defaultActiveId }: Props) {
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

  return (
    <div>
      <div role="tablist" aria-label="Tabs" className="flex gap-1 border-b border-slate/10">
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el;
              }}
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => activate(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`min-h-[44px] border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
                selected ? 'border-sapphire text-sapphire' : 'border-transparent text-slate/70 hover:text-slate'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`tabpanel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="py-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
