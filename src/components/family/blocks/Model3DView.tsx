'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import type { Model3D } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { num } from '@/lib/family/interactive';
import { modelView, solidMesh, solidSurface, solidVolume, type Mesh, type Vec } from '@/lib/family/solids';
import { useDataSaver } from '../useDataSaver';
import { Card } from './BlockViews';
import { toneColor } from './InteractiveViews';

// A 3D model with a 2D drawing (S5, C378; docs/37 §3 decision 7). The drawing is the default and the fallback: it is
// the same mesh as the 3D view, projected and shaded in SVG, with the same computed volume and surface area, and a text
// description. The 3D view (plain WebGL, ./webgl-solid.ts) is a separate chunk loaded only when the child taps "See it in
// 3D", and only when all of these hold (modelView in lib/family/solids.ts): the data-saver is off, the phone has WebGL,
// and the child asked. With the data-saver on, or no WebGL, or WebGL failing to start or losing its context, the drawing
// stays and says why. Nothing animates: the model turns only when the child drags it, presses an arrow key or a turn button.

const YAW = 0.7;
const PITCH = 0.45;
const STEP = 0.2;

const hexToRgb = (hex: string): Vec => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Vec;
};
const toHex = (c: Vec) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    const ok = !!(c.getContext('webgl') ?? c.getContext('experimental-webgl'));
    return ok;
  } catch {
    return false;
  }
}

// The mesh turned to (yaw, pitch) and projected to the picture: the faces far to near (every face two-sided), shaded
// by the light, then the edges thin on top.
function drawing(mesh: Mesh, color: Vec, yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rot = (p: Vec): Vec => {
    const a: Vec = [cy * p[0] + sy * p[2], p[1], -sy * p[0] + cy * p[2]];
    return [a[0], cp * a[1] - sp * a[2], sp * a[1] + cp * a[2]];
  };
  const r = mesh.vertices.map(rot);
  const light: Vec = [0.4, 0.6, 0.7];
  const ll = Math.hypot(...light);
  const faces = mesh.triangles
    .map(([i, j, k]) => {
      const [a, b, c] = [r[i], r[j], r[k]];
      const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(...n) || 1;
      const d = Math.abs((n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (len * ll));
      const shade = 0.5 + 0.5 * d;
      return { pts: [a, b, c], depth: (a[2] + b[2] + c[2]) / 3, color: toHex([color[0] * shade, color[1] * shade, color[2] * shade]) };
    })
    .sort((p, q) => p.depth - q.depth);
  const X = (p: Vec) => (150 + p[0] * 82).toFixed(1);
  const Y = (p: Vec) => (110 - p[1] * 82).toFixed(1);
  return { faces: faces.map((f) => ({ d: ['M', ...f.pts.flatMap((p, k) => (k ? ['L', X(p), Y(p)] : [X(p), Y(p)])), 'Z'].join(' '), color: f.color })), edges: mesh.edges.map(([i, j]) => ({ x1: X(r[i]), y1: Y(r[i]), x2: X(r[j]), y2: Y(r[j]) })) };
}

export function Model3DView({ b, w, tone }: { b: Model3D; w: Words; tone: string }) {
  const saver = useDataSaver();
  const [glOk, setGlOk] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [angles, setAngles] = useState({ yaw: YAW, pitch: PITCH });
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<{ turn: (y: number, p: number) => void; destroy: () => void } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const mesh = useMemo(() => solidMesh(b.solid, b.dims), [b]);
  const base = toneColor(tone);
  const rgb = useMemo(() => hexToRgb(base), [base]);
  const still = useMemo(() => drawing(mesh, rgb, YAW, PITCH), [mesh, rgb]);
  useEffect(() => setGlOk(webglSupported()), []);

  // Until the data-saver is known the drawing stays (never a 3D view before the phone's choice is read).
  const view = modelView({ dataSaver: saver.state.on || !saver.ready, webgl: glOk === true && !failed, requested: asked });

  useEffect(() => {
    if (view !== '3d' || !canvas.current) return;
    let gone = false;
    setLoading(true);
    // The WebGL code is its own chunk: it is fetched here, on the child's tap, and nowhere else.
    void import('./webgl-solid')
      .then((m) => {
        if (gone || !canvas.current) return;
        const h = m.startSolid(canvas.current, mesh, rgb, hexToRgb(colors.slate), () => setFailed(true));
        if (!h) return setFailed(true);
        handle.current = h;
        h.turn(angles.yaw, angles.pitch);
        setLoading(false);
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // The view starts once per request; later turns go through `turn` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mesh, rgb]);

  const turn = (dy: number, dp: number) =>
    setAngles((a) => {
      const next = { yaw: a.yaw + dy, pitch: Math.max(-1.45, Math.min(1.45, a.pitch + dp)) };
      handle.current?.turn(next.yaw, next.pitch);
      return next;
    });

  const u = b.unit ? ` ${b.unit}` : '';
  const volume = `${num(solidVolume(b.solid, b.dims), 1)}${b.unit ? ` ${b.unit}³` : ''}`;
  const surface = `${num(solidSurface(b.solid, b.dims), 1)}${b.unit ? ` ${b.unit}²` : ''}`;
  const dims = Object.entries(b.dims).map(([k, v]) => `${k} = ${num(v)}${u}`).join(', ');
  const note = saver.ready && saver.state.on ? w['fam.model.saver'] : failed ? w['fam.model.failed'] : glOk === false ? w['fam.model.noGl'] : null;
  const canAsk = saver.ready && !saver.state.on && glOk === true && !failed;
  const btn = 'fam-press flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white px-3 text-sm font-bold text-royal-deep ring-1 ring-royal/25';

  return (
    <Card title={b.title} tone={tone} tag="model_3d">
      <div data-model-view={view} className="flex flex-col items-center gap-2">
        {view === '3d' ? (
          <canvas
            ref={canvas}
            role="img"
            aria-label={fill(w['fam.model.aria'], { title: b.title })}
            tabIndex={0}
            data-model-canvas
            className="h-64 w-full max-w-md touch-none rounded-2xl bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              turn((e.clientX - drag.current.x) * 0.01, (e.clientY - drag.current.y) * 0.01);
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
              const k: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
              if (k[e.key]) {
                e.preventDefault();
                turn(...k[e.key]);
              }
            }}
          />
        ) : (
          <svg viewBox="0 0 300 220" className="h-64 w-full max-w-md rounded-2xl bg-off-white" role="img" aria-label={b.alt} data-model-2d>
            {still.faces.map((f, i) => (
              <path key={i} d={f.d} fill={f.color} stroke={f.color} strokeWidth="0.6" strokeLinejoin="round" />
            ))}
            {still.edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={colors.slate} strokeOpacity="0.4" strokeWidth="0.8" />
            ))}
          </svg>
        )}
        {view === '3d' && (
          <div role="group" aria-label={w['fam.model.turn']} className="flex flex-wrap justify-center gap-2">
            <button type="button" className={btn} onClick={() => turn(-STEP, 0)}>
              {w['fam.model.left']}
            </button>
            <button type="button" className={btn} onClick={() => turn(STEP, 0)}>
              {w['fam.model.right']}
            </button>
            <button type="button" className={btn} onClick={() => turn(0, -STEP)}>
              {w['fam.model.up']}
            </button>
            <button type="button" className={btn} onClick={() => turn(0, STEP)}>
              {w['fam.model.down']}
            </button>
          </div>
        )}
        {view === '3d' && <p className="text-xs text-slate/80">{loading ? w['fam.model.loading'] : w['fam.model.hint']}</p>}
        {canAsk && (
          <button type="button" data-model-3d-ask onClick={() => (view === '3d' ? setAsked(false) : setAsked(true))} className="fam-press flex min-h-[44px] items-center rounded-full bg-royal-deep px-5 text-sm font-bold text-white">
            {view === '3d' ? w['fam.model.back2d'] : w['fam.model.see3d']}
          </button>
        )}
        {note && (
          <p role="status" data-model-note className="text-sm text-slate">
            {note}
          </p>
        )}
      </div>
      <p className="text-base text-slate">{b.alt}</p>
      <ul className="flex flex-col gap-1 rounded-2xl bg-off-white p-3 text-base text-slate">
        <li lang="en" className="font-mono text-sm">
          {dims}
        </li>
        <li>
          {w['fam.model.volume']}: {volume}
        </li>
        <li>
          {w['fam.model.surface']}: {surface}
        </li>
      </ul>
    </Card>
  );
}
