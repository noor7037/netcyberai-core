'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Words } from '@/lib/family/fill';
import { findSentence } from '../voice/highlight';
import { readWordSettings } from './settings';
import { cleanAsk, sentenceAtOffset, sentenceIndexIn, wordAtOffset } from './tapTarget';
import dynamic from 'next/dynamic';
import type { Tap } from './WordMenu';

// The menu is loaded on the first tap (W23 integration): every reading page carries the tap layer, few open the menu, and
// the Study page has a 200 kB first-load budget.
const WordMenu = dynamic(() => import('./WordMenu').then((m) => m.WordMenu), { ssr: false });

// W23-A: makes the text under `root` tappable. A tap on a word, or a selected piece of text, opens the one tap menu
// (WordMenu) for it. Nothing in the text is rewritten: the tap is found from the browser's caret at the point. A tap on a
// button, link or field does what it always did. "Read from here" is offered when the surface reads aloud (`onReadFrom`,
// given the index of the spoken sentence the tap landed in), so a tap on a word or paragraph starts the tutor there.

type Caret = { node: Text; offset: number };

function caretAt(x: number, y: number): Caret | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p && p.offsetNode.nodeType === Node.TEXT_NODE) return { node: p.offsetNode as Text, offset: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  if (r && r.startContainer.nodeType === Node.TEXT_NODE) return { node: r.startContainer as Text, offset: r.startOffset };
  return null;
}

// The first spoken sentence that sits after the caret in the page's order; when none does (the tap is on a board or
// figure at the end), the last one before it; -1 when the voice reads nothing in this text.
function nextSpoken(root: HTMLElement, c: Caret, sentences: readonly string[]): number {
  let before = -1;
  for (let i = 0; i < sentences.length; i++) {
    const found = sentences[i] ? findSentence(root, sentences[i], 0) : null;
    if (!found) continue;
    if (found.node === c.node ? found.at >= c.offset : !!(c.node.compareDocumentPosition(found.node) & Node.DOCUMENT_POSITION_FOLLOWING)) return i;
    before = i;
  }
  return before;
}

const INTERACTIVE = 'a, button, input, textarea, select, summary, label, [role="button"], [contenteditable="true"], [data-no-word-tap]';
const rectOf = (r: DOMRect) => ({ left: r.left, top: r.top, width: r.width, height: r.height });

export function WordTapLayer({ root, w, lang, sentences, onReadFrom }: { root: RefObject<HTMLElement | null>; w: Words; lang?: 'en' | 'hi'; sentences?: readonly string[]; onReadFrom?: (sentence: number) => void }) {
  const [tap, setTap] = useState<Tap | null>(null);
  const live = useRef({ lang, sentences, onReadFrom });
  live.current = { lang, sentences, onReadFrom };
  const on = useRef({ tapToRead: true, wordHelp: true });
  useEffect(() => {
    let alive = true;
    void readWordSettings().then((s) => {
      if (alive) on.current = { tapToRead: s.tapToRead, wordHelp: s.wordHelp };
    });
    return () => {
      alive = false;
    };
  }, []);

  const close = useCallback(() => setTap(null), []);

  const open = useCallback((el: HTMLElement, c: Caret, text: string, context: string, rect: DOMRect) => {
    const ask = cleanAsk(text, context);
    if (!ask) return;
    const { sentences: ss, onReadFrom: go } = live.current;
    let at = ss && go ? sentenceIndexIn(c.node.data, c.offset, ss) : -1;
    // A tap on text the voice does not read (a heading, a label, a board's step) starts at the next sentence it does read (or the last before it).
    if (at < 0 && ss && go) at = nextSpoken(el, c, ss);
    const language = live.current.lang ?? (el.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi' : 'en');
    setTap({ ...ask, rect: rectOf(rect), lang: language, read: at >= 0 && go ? () => go(at) : undefined });
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (!on.current.tapToRead && !on.current.wordHelp) return;
      if (e.defaultPrevented || (e.target as Element | null)?.closest?.(INTERACTIVE)) return;
      if (window.getSelection()?.toString().trim()) return;
      const c = caretAt(e.clientX, e.clientY);
      if (!c || !el.contains(c.node)) return;
      const hit = wordAtOffset(c.node.data, c.offset);
      if (!hit) return;
      const r = document.createRange();
      r.setStart(c.node, hit.start);
      r.setEnd(c.node, hit.end);
      open(el, c, hit.word, sentenceAtOffset(c.node.data, c.offset).text, r.getBoundingClientRect());
    };
    // A selected sentence or phrase (long press, or a drag) opens the same menu for the selection.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSelect = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!on.current.tapToRead && !on.current.wordHelp) return;
        const s = window.getSelection();
        if (!s || s.isCollapsed || s.rangeCount === 0) return;
        const r = s.getRangeAt(0);
        const text = s.toString();
        if (!el.contains(r.startContainer) || !el.contains(r.endContainer) || r.startContainer.nodeType !== Node.TEXT_NODE || !text.trim() || text.length > 200) return;
        const node = r.startContainer as Text;
        open(el, { node, offset: r.startOffset }, text, sentenceAtOffset(node.data, r.startOffset).text, r.getBoundingClientRect());
      }, 500);
    };
    el.addEventListener('click', onClick);
    document.addEventListener('selectionchange', onSelect);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('click', onClick);
      document.removeEventListener('selectionchange', onSelect);
    };
  }, [root, open]);

  return tap ? <WordMenu tap={tap} w={w} onClose={close} /> : null;
}
