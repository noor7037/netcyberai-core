'use client';

import { useEffect, useRef, useState } from 'react';
import type { ElabPic } from '@/lib/family/elaboration';
import { fill, type Words } from '@/lib/family/fill';
import { useDataSaver } from '../useDataSaver';
import { useReducedMotion } from './motion';
import type { ViewerHandle } from './glb-viewer';

// A 3D picture of a step (founder, 16 Nov 2026): the still picture shows first and stays when the phone cannot or should
// not run 3D: Data saver on, a weak phone (little memory or few cores), no WebGL, or a failure. Otherwise the 3D view
// (three.js, its own chunk) starts when the picture scrolls into view and the child turns it with a finger and pinches
// to zoom. Never a label on it.

// A weak phone: little memory or few cores, as the browser reports them.
export function lowEnd(nav: { deviceMemory?: number; hardwareConcurrency?: number }): boolean {
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2);
}

const webgl = (): boolean => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
};

export function Model3dPic({ pic, w, className }: { pic: ElabPic; w: Words; className?: string }) {
  const saver = useDataSaver();
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);
  const allowed = saver.ready && !saver.state.on && typeof navigator !== 'undefined' && !lowEnd(navigator as never) && !failed;
  useEffect(() => {
    const el = host.current;
    if (!el || !allowed) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [allowed]);
  useEffect(() => {
    const el = host.current;
    if (!el || !allowed || !near || !pic.model || !webgl()) return;
    let handle: ViewerHandle | null = null;
    let gone = false;
    void import('./glb-viewer').then(async (m) => {
      const h = await m.startViewer(el, pic.model!, { reducedMotion: reduced, onReady: () => setReady(true), onFail: () => setFailed(true) });
      if (gone) h.destroy();
      else handle = h;
    }).catch(() => setFailed(true));
    return () => {
      gone = true;
      handle?.destroy();
    };
  }, [allowed, near, pic.model, reduced]);
  return (
    <div ref={host} data-elab-3d={ready ? 'live' : 'still'} role="img" aria-label={pic.caption} className={`relative aspect-[4/3] w-full overflow-hidden ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the still picture of the model, a plain image */}
      {pic.url ? <img src={pic.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full object-contain ${ready ? 'opacity-0' : ''}`} /> : null}
      {ready ? <span className="sr-only">{fill(w['fam.elab.view3d'], {})}</span> : null}
    </div>
  );
}
