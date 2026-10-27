// Solids for the 3D model block (S5, C378; docs/37 §4). A 3D model is a solid from a fixed set with bounded sizes; its
// mesh, volume and surface area are computed here, so the 3D view (WebGL, loaded only when the child asks for it) and the
// 2D view (a drawing of the same mesh) show one shape and one set of numbers. No model files, nothing from outside.
// Pure: no DOM, no network. Safe for the phone and the server.

export type SolidKind = 'cube' | 'cuboid' | 'cylinder' | 'cone' | 'sphere' | 'pyramid';
export const SOLID_KINDS: readonly SolidKind[] = ['cube', 'cuboid', 'cylinder', 'cone', 'sphere', 'pyramid'];
const SIDE = { min: 0.5, max: 100 };
export const SOLID_INPUTS: Record<SolidKind, Record<string, { min: number; max: number }>> = {
  cube: { a: SIDE },
  cuboid: { l: SIDE, b: SIDE, h: SIDE },
  cylinder: { r: SIDE, h: SIDE },
  cone: { r: SIDE, h: SIDE },
  sphere: { r: SIDE },
  pyramid: { a: SIDE, h: SIDE },
};

export function solidVolume(kind: SolidKind, d: Record<string, number>): number {
  switch (kind) {
    case 'cube':
      return d.a ** 3;
    case 'cuboid':
      return d.l * d.b * d.h;
    case 'cylinder':
      return Math.PI * d.r * d.r * d.h;
    case 'cone':
      return (Math.PI * d.r * d.r * d.h) / 3;
    case 'sphere':
      return (4 / 3) * Math.PI * d.r ** 3;
    case 'pyramid':
      return (d.a * d.a * d.h) / 3;
  }
}

// Total surface area (a pyramid is a square-based one).
export function solidSurface(kind: SolidKind, d: Record<string, number>): number {
  switch (kind) {
    case 'cube':
      return 6 * d.a * d.a;
    case 'cuboid':
      return 2 * (d.l * d.b + d.b * d.h + d.l * d.h);
    case 'cylinder':
      return 2 * Math.PI * d.r * (d.r + d.h);
    case 'cone':
      return Math.PI * d.r * (d.r + Math.hypot(d.r, d.h));
    case 'sphere':
      return 4 * Math.PI * d.r * d.r;
    case 'pyramid':
      return d.a * d.a + 2 * d.a * Math.hypot(d.h, d.a / 2);
  }
}

export type Vec = [number, number, number];
export type Mesh = { vertices: Vec[]; triangles: [number, number, number][]; edges: [number, number][] };
const SEG = 16;

// The solid centred on the origin, scaled so its longest extent is 1 from the centre (it fills the same frame whatever
// its size).
export function solidMesh(kind: SolidKind, d: Record<string, number>): Mesh {
  const v: Vec[] = [];
  const t: Mesh['triangles'] = [];
  const e: Mesh['edges'] = [];
  const box = (x: number, y: number, z: number) => {
    const hx = x / 2;
    const hy = y / 2;
    const hz = z / 2;
    // vertex index = (x>0)*4 + (y>0)*2 + (z>0)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push([sx * hx, sy * hy, sz * hz]);
    const faces: [number, number, number, number][] = [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ];
    for (const [a, b, c, f] of faces) t.push([a, b, c], [a, c, f]);
    const edges: [number, number][] = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [3, 7], [2, 6]];
    e.push(...edges);
  };
  const ring = (r: number, y: number) => {
    const start = v.length;
    for (let i = 0; i < SEG; i++) v.push([r * Math.cos((2 * Math.PI * i) / SEG), y, r * Math.sin((2 * Math.PI * i) / SEG)]);
    return start;
  };
  const join = (a: number, b: number) => {
    for (let i = 0; i < SEG; i++) {
      const n = (i + 1) % SEG;
      t.push([a + i, b + i, b + n], [a + i, b + n, a + n]);
      e.push([a + i, a + n], [a + i, b + i]);
    }
  };
  const cap = (a: number, y: number) => {
    const c = v.length;
    v.push([0, y, 0]);
    for (let i = 0; i < SEG; i++) t.push([c, a + i, a + ((i + 1) % SEG)]);
  };
  switch (kind) {
    case 'cube':
      box(d.a, d.a, d.a);
      break;
    case 'cuboid':
      box(d.l, d.h, d.b);
      break;
    case 'cylinder': {
      const bottom = ring(d.r, -d.h / 2);
      const top = ring(d.r, d.h / 2);
      join(bottom, top);
      cap(bottom, -d.h / 2);
      cap(top, d.h / 2);
      break;
    }
    case 'cone': {
      const base = ring(d.r, -d.h / 2);
      const apex = v.length;
      v.push([0, d.h / 2, 0]);
      for (let i = 0; i < SEG; i++) {
        const n = (i + 1) % SEG;
        t.push([base + i, apex, base + n]);
        e.push([base + i, base + n], [base + i, apex]);
      }
      cap(base, -d.h / 2);
      break;
    }
    case 'sphere': {
      const rings = 8;
      const starts: number[] = [];
      for (let k = 1; k < rings; k++) {
        const phi = (Math.PI * k) / rings;
        starts.push(ring(d.r * Math.sin(phi), d.r * Math.cos(phi)));
      }
      for (let k = 0; k + 1 < starts.length; k++) join(starts[k], starts[k + 1]);
      const top = v.length;
      v.push([0, d.r, 0]);
      const bottom = v.length;
      v.push([0, -d.r, 0]);
      const last = starts[starts.length - 1];
      for (let i = 0; i < SEG; i++) {
        const n = (i + 1) % SEG;
        t.push([top, starts[0] + n, starts[0] + i], [bottom, last + i, last + n]);
      }
      break;
    }
    case 'pyramid': {
      const h = d.a / 2;
      v.push([-h, -d.h / 2, -h], [h, -d.h / 2, -h], [h, -d.h / 2, h], [-h, -d.h / 2, h], [0, d.h / 2, 0]);
      t.push([0, 2, 1], [0, 3, 2], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]);
      e.push([0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]);
      break;
    }
  }
  let big = 0;
  for (const p of v) big = Math.max(big, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const k = big > 0 ? 1 / big : 1;
  return { vertices: v.map((p): Vec => [p[0] * k, p[1] * k, p[2] * k]), triangles: t, edges: e };
}

// Which view a 3D model gets. The data-saver forces the 2D drawing, as does a phone without WebGL; the 3D view is only
// ever the child's own choice (a tap), never started by itself.
export type ModelView = '2d' | '3d';
export function modelView(a: { dataSaver: boolean; webgl: boolean; requested: boolean }): ModelView {
  return !a.dataSaver && a.webgl && a.requested ? '3d' : '2d';
}
