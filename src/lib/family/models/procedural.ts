// The procedural 3D models (W19-D): schematics built from three.js primitives, every shape named after its part
// (`userData.part`), placed where the textbook places it. Not anatomy-accurate scans: the screen calls them "a model".
// A shape with no part (a wire, an orbit line, the magnifier round the stomata) carries `userData.decor` and cannot be
// tapped. Imported only by the lazy 3D chunk (components/family/blocks/model-three.ts), never by the first load.

import * as THREE from 'three';
import type { ModelKey } from '../blocks';

type Pose = { at?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] };

function put(g: THREE.Object3D, part: string | null, geo: THREE.BufferGeometry, pose: Pose = {}, decor?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  if (pose.at) m.position.set(...pose.at);
  if (pose.rot) m.rotation.set(...pose.rot);
  if (pose.scale) m.scale.set(...pose.scale);
  if (part) {
    m.userData.part = part;
    m.name = part;
  } else m.userData.decor = decor ?? 'offWhite';
  g.add(m);
  return m;
}

const sphere = (r: number, w = 32, h = 20) => new THREE.SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cyl = (r: number, h: number, seg = 24) => new THREE.CylinderGeometry(r, r, h, seg);
const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 16);
const tube = (pts: [number, number, number][], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), Math.max(16, pts.length * 12), r, 10, false);
const ring = (r: number, t: number) => new THREE.TorusGeometry(r, t, 12, 96);
const TAU = Math.PI * 2;

function solarSystem(g: THREE.Group) {
  put(g, 'sun', sphere(0.9, 48, 32), { at: [-3.2, 0, 0] });
  const planets: [string, number, number][] = [
    ['mercury', -1.9, 0.09],
    ['venus', -1.45, 0.16],
    ['earth', -0.95, 0.17],
    ['mars', -0.5, 0.12],
    ['jupiter', 0.75, 0.45],
    ['saturn', 1.95, 0.38],
    ['uranus', 2.85, 0.26],
    ['neptune', 3.55, 0.25],
  ];
  for (const [k, x, r] of planets) {
    put(g, k, sphere(r), { at: [x, 0, 0] });
    // Its orbit round the Sun: a faint line, flat in the plane of the planets.
    put(g, null, ring(x + 3.2, 0.004), { at: [-3.2, 0, 0], rot: [Math.PI / 2, 0, 0] }, 'slate');
  }
  put(g, 'saturn', new THREE.RingGeometry(0.5, 0.75, 64), { at: [1.95, 0, 0], rot: [Math.PI / 2.4, 0, 0] });
  // The asteroid belt between Mars and Jupiter: small rocks on the stretch of its circle round the Sun that faces us.
  for (let i = 0; i < 48; i++) {
    const a = ((i / 47) - 0.5) * 0.5;
    const r = 2.95 + ((i * 37) % 7) * 0.03;
    put(g, 'asteroid_belt', new THREE.IcosahedronGeometry(0.03 + ((i * 13) % 5) * 0.006, 0), { at: [-3.2 + Math.cos(a) * r, ((i * 7) % 5) * 0.02 - 0.04, Math.sin(a) * r] });
  }
}

// A sphere cut open by a quarter (three quarters kept), so the layers show on the two cut faces.
function earthLayers(g: THREE.Group) {
  // The open quarter turned toward the first view.
  g.rotation.y = Math.PI / 3;
  const layers: [string, number, number][] = [
    ['crust', 1, 0.94],
    ['mantle', 0.94, 0.55],
    ['outer_core', 0.55, 0.3],
    ['inner_core', 0.3, 0],
  ];
  for (const [k, outer, inner] of layers) {
    put(g, k, new THREE.SphereGeometry(outer, 48, 32, Math.PI / 2, Math.PI * 1.5));
    // The two cut faces: half rings in the planes x = 0 (facing +x) and z = 0 (facing +z).
    put(g, k, new THREE.RingGeometry(inner, outer, 48, 1, Math.PI / 2, Math.PI), { rot: [0, Math.PI / 2, 0] });
    put(g, k, new THREE.RingGeometry(inner, outer, 48, 1, Math.PI / 2, Math.PI));
  }
}

function atom(g: THREE.Group) {
  // Carbon: 6 protons and 6 neutrons packed in the nucleus, 2 electrons on the K shell and 4 on the L shell.
  for (let i = 0; i < 12; i++) {
    const y = 1 - (i / 11) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963;
    put(g, i % 2 === 0 ? 'protons' : 'neutrons', sphere(0.09, 20, 14), { at: [Math.cos(a) * r * 0.14, y * 0.14, Math.sin(a) * r * 0.14] });
  }
  const shells: [string, number, number, number][] = [
    ['k_shell', 0.55, 2, 0.3],
    ['l_shell', 1.05, 4, -0.25],
  ];
  for (const [k, r, n, tilt] of shells) {
    const shell = new THREE.Group();
    shell.rotation.set(Math.PI / 2 + tilt, tilt, 0);
    put(shell, k, ring(r, 0.012));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4;
      put(shell, 'electrons', sphere(0.05, 16, 12), { at: [Math.cos(a) * r, Math.sin(a) * r, 0] });
    }
    g.add(shell);
  }
}

// A plant cell: a box-shaped cell, open at the top so the inside shows (the textbook's 3D cut).
function plantCell(g: THREE.Group) {
  const W = 2.4, H = 0.36, D = 1.6, t = 0.06;
  const walls = (part: string, w: number, d: number, th: number, y0: number) => {
    put(g, part, box(w, th, d), { at: [0, y0, 0] });
    put(g, part, box(w, H, th), { at: [0, y0 + H / 2, d / 2 - th / 2] });
    put(g, part, box(w, H, th), { at: [0, y0 + H / 2, -d / 2 + th / 2] });
    put(g, part, box(th, H, d), { at: [w / 2 - th / 2, y0 + H / 2, 0] });
    put(g, part, box(th, H, d), { at: [-w / 2 + th / 2, y0 + H / 2, 0] });
  };
  walls('cell_wall', W, D, t, -0.3);
  walls('cell_membrane', W - 2 * t - 0.02, D - 2 * t - 0.02, 0.02, -0.25);
  put(g, 'cytoplasm', box(W - 0.3, 0.2, D - 0.3), { at: [0, -0.15, 0] });
  put(g, 'vacuole', sphere(0.5), { at: [0.25, -0.02, 0], scale: [1.5, 0.3, 1] });
  put(g, 'nucleus', sphere(0.2), { at: [-0.75, 0.0, -0.35] });
  for (const [x, z, r] of [[-0.8, 0.45, 0.4], [0.9, -0.5, -0.6], [0.95, 0.5, 1.2], [-0.2, -0.55, 0.2], [-0.9, -0.1, 2]] as const) put(g, 'chloroplasts', sphere(0.11), { at: [x, -0.02, z], rot: [0, r, 0], scale: [1.6, 0.6, 0.9] });
  for (const [x, z, r] of [[-0.35, 0.5, 0.8], [0.7, 0.05, -0.5]] as const) put(g, 'mitochondria', capsule(0.045, 0.14), { at: [x, -0.02, z], rot: [0, r, Math.PI / 2] });
}

// An animal cell: a round cell with its top cut away.
function animalCell(g: THREE.Group) {
  put(g, 'cell_membrane', new THREE.SphereGeometry(1, 48, 24, 0, TAU, Math.PI * 0.32, Math.PI * 0.68), { scale: [1.3, 0.75, 1] });
  put(g, 'cytoplasm', new THREE.CircleGeometry(0.95, 64), { at: [0, 0.38, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.3, 0.92, 1] });
  put(g, 'nucleus', sphere(0.3), { at: [0, 0.32, 0] });
  for (const [x, z, r] of [[-0.75, 0.25, 0.6], [0.6, 0.5, -0.4], [0.3, -0.55, 1.4]] as const) put(g, 'mitochondria', capsule(0.06, 0.18), { at: [x, 0.38, z], rot: [0, r, Math.PI / 2] });
  for (let i = 0; i < 4; i++) put(g, 'golgi', new THREE.TorusGeometry(0.28 - i * 0.03, 0.025, 8, 32, Math.PI * 0.8), { at: [0.75, 0.38, -0.25 - i * 0.07], rot: [-Math.PI / 2, 0, 0.6] });
  for (const [x, z] of [[-0.5, -0.45], [0.95, 0.15], [-0.25, 0.6]] as const) put(g, 'lysosomes', sphere(0.06, 16, 12), { at: [x, 0.38, z] });
  put(g, 'vacuole', sphere(0.11, 20, 14), { at: [-0.8, 0.38, -0.3] });
}

function flower(g: THREE.Group) {
  put(g, 'stalk', cyl(0.05, 1.6), { at: [0, -0.9, 0] });
  put(g, 'receptacle', sphere(0.17), { at: [0, -0.08, 0], scale: [1, 0.6, 1] });
  // A petal or sepal: a flattened oval leaning out from the centre, turned round the stalk.
  const leaf = (part: string, n: number, len: number, wid: number, tilt: number, y: number, phase: number) => {
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, y, 0);
      pivot.rotation.set(0, (i / n) * TAU + phase, 0);
      const arm = new THREE.Group();
      arm.rotation.set(0, 0, -tilt);
      const geo = new THREE.SphereGeometry(1, 24, 16);
      geo.scale(len / 2, 0.02, wid / 2);
      geo.translate(len / 2, 0, 0);
      put(arm, part, geo);
      pivot.add(arm);
      g.add(pivot);
    }
  };
  leaf('sepals', 5, 0.55, 0.22, -0.35, -0.12, 0.3);
  leaf('petals', 5, 0.95, 0.55, 0.65, -0.02, 0);
  put(g, 'ovary', sphere(0.13), { at: [0, 0.04, 0], scale: [1, 1.2, 1] });
  put(g, 'style', cyl(0.025, 0.5), { at: [0, 0.4, 0] });
  put(g, 'stigma', sphere(0.06), { at: [0, 0.66, 0], scale: [1.4, 0.7, 1.4] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.25;
    const top: [number, number, number] = [Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3];
    put(g, 'filament', tube([[Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22], top], 0.012));
    put(g, 'anther', capsule(0.03, 0.07), { at: top });
  }
}

function neuron(g: THREE.Group) {
  put(g, 'cell_body', sphere(0.32), { at: [-1.6, 0, 0], scale: [1, 0.85, 0.9] });
  put(g, 'nucleus', sphere(0.12), { at: [-1.6, 0, 0.12] });
  const den: [number, number, number][][] = [
    [[-1.8, 0.2, 0], [-2.1, 0.5, 0.1], [-2.35, 0.75, 0.05]],
    [[-1.8, -0.2, 0], [-2.1, -0.5, -0.1], [-2.4, -0.65, 0]],
    [[-1.7, 0.25, 0.1], [-1.75, 0.6, 0.2], [-1.9, 0.95, 0.3]],
    [[-1.7, -0.25, 0.1], [-1.65, -0.6, 0.25], [-1.8, -0.9, 0.35]],
    [[-1.85, 0, 0.15], [-2.25, 0.05, 0.35], [-2.55, 0.1, 0.4]],
    [[-2.1, 0.5, 0.1], [-2.15, 0.85, -0.05]],
    [[-2.1, -0.5, -0.1], [-2.0, -0.85, -0.2]],
  ];
  for (const pts of den) put(g, 'dendrites', tube(pts, 0.03));
  put(g, 'axon', cyl(0.045, 3.1), { at: [0.0, 0, 0], rot: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 5; i++) put(g, 'myelin', capsule(0.1, 0.36), { at: [-0.95 + i * 0.55, 0, 0], rot: [0, 0, Math.PI / 2] });
  for (const [dy, dz] of [[0.35, 0], [-0.35, 0.05], [0.05, 0.35], [0, -0.3]] as const) {
    put(g, 'nerve_endings', tube([[1.5, 0, 0], [1.75, dy * 0.6, dz * 0.6], [1.95, dy, dz]], 0.022));
    put(g, 'nerve_endings', sphere(0.05, 14, 10), { at: [1.97, dy, dz] });
  }
}

function dcMotor(g: THREE.Group) {
  put(g, 'magnet_n', box(0.45, 1.2, 0.9), { at: [-1.25, 0, 0] });
  put(g, 'magnet_s', box(0.45, 1.2, 0.9), { at: [1.25, 0, 0] });
  // The coil: a rectangle of wire turning on the axle (along z), in the field between the poles.
  const c: [number, number, number][] = [[-0.7, 0, -0.55], [-0.7, 0, 0.55], [0.7, 0, 0.55], [0.7, 0, -0.55]];
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Vector3(...c[i]);
    const b = new THREE.Vector3(...c[(i + 1) % 4]);
    const len = a.distanceTo(b);
    const m = put(g, 'coil', new THREE.CylinderGeometry(0.035, 0.035, len, 12), { at: [(a.x + b.x) / 2, 0.15, (a.z + b.z) / 2] });
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  put(g, 'axle', cyl(0.03, 2.2), { at: [0, 0.15, 0.5], rot: [Math.PI / 2, 0, 0] });
  put(g, 'commutator', new THREE.CylinderGeometry(0.12, 0.12, 0.22, 24, 1, true, 0.15, Math.PI - 0.3), { at: [0, 0.15, 1.05], rot: [Math.PI / 2, 0, 0] });
  put(g, 'commutator', new THREE.CylinderGeometry(0.12, 0.12, 0.22, 24, 1, true, Math.PI + 0.15, Math.PI - 0.3), { at: [0, 0.15, 1.05], rot: [Math.PI / 2, 0, 0] });
  put(g, 'brushes', box(0.12, 0.08, 0.14), { at: [-0.19, 0.15, 1.05] });
  put(g, 'brushes', box(0.12, 0.08, 0.14), { at: [0.19, 0.15, 1.05] });
  put(g, 'battery', cyl(0.14, 0.6), { at: [0, -0.85, 1.05], rot: [0, 0, Math.PI / 2] });
  put(g, null, tube([[-0.25, 0.15, 1.05], [-0.6, -0.3, 1.05], [-0.3, -0.85, 1.05]], 0.012), {}, 'slate');
  put(g, null, tube([[0.25, 0.15, 1.05], [0.6, -0.3, 1.05], [0.3, -0.85, 1.05]], 0.012), {}, 'slate');
}

function electromagnet(g: THREE.Group) {
  put(g, 'core', cyl(0.09, 2.2), { rot: [0, 0, Math.PI / 2] });
  put(g, 'core', new THREE.ConeGeometry(0.09, 0.2, 24), { at: [1.2, 0, 0], rot: [0, 0, -Math.PI / 2] });
  put(g, 'core', cyl(0.16, 0.05), { at: [-1.12, 0, 0], rot: [0, 0, Math.PI / 2] });
  // The coil: a helix of wire round the core.
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 18 * 24; i++) {
    const a = (i / 24) * TAU;
    pts.push([-0.8 + (i / (18 * 24)) * 1.6, Math.cos(a) * 0.13, Math.sin(a) * 0.13]);
  }
  put(g, 'coil', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 18 * 24, 0.018, 6, false));
  put(g, 'battery', cyl(0.13, 0.55), { at: [-0.45, -0.9, 0], rot: [0, 0, Math.PI / 2] });
  put(g, 'switch', box(0.3, 0.05, 0.16), { at: [0.45, -0.95, 0] });
  put(g, 'switch', box(0.28, 0.025, 0.04), { at: [0.47, -0.88, 0], rot: [0, 0, 0.3] });
  put(g, null, tube([[-0.8, 0.13, 0], [-1.0, -0.4, 0], [-0.75, -0.9, 0]], 0.012), {}, 'slate');
  put(g, null, tube([[0.8, 0.13, 0], [0.9, -0.5, 0], [0.62, -0.95, 0]], 0.012), {}, 'slate');
  put(g, null, tube([[-0.17, -0.9, 0], [0.1, -1.0, 0], [0.3, -0.95, 0]], 0.012), {}, 'slate');
  for (const [y, r] of [[-0.12, 0.2], [-0.32, -0.3], [-0.5, 0.1]] as const) put(g, 'clips', new THREE.TorusGeometry(0.07, 0.012, 8, 24), { at: [1.33, y, 0], rot: [0, 0, r], scale: [0.6, 1.4, 1] });
}

function waterCycle(g: THREE.Group) {
  put(g, null, box(4, 0.1, 2), { at: [0.5, -0.55, 0] }, 'peach');
  put(g, 'sea', box(1.7, 0.12, 2), { at: [-0.65, -0.48, 0] });
  put(g, 'mountains', new THREE.ConeGeometry(0.75, 1.4, 6), { at: [1.6, 0.2, -0.3] });
  put(g, 'mountains', new THREE.ConeGeometry(0.55, 1, 6), { at: [2.1, 0.0, 0.35] });
  put(g, 'river', tube([[1.45, -0.1, 0.2], [1.0, -0.42, 0.45], [0.5, -0.48, 0.3], [0.2, -0.47, 0.2]], 0.05), { scale: [1, 0.5, 1] });
  put(g, 'sun', sphere(0.35), { at: [-1.7, 1.6, -0.4] });
  for (const x of [-1.2, -0.7, -0.2]) {
    put(g, 'evaporation', cyl(0.025, 0.8), { at: [x, 0.0, 0.3] });
    put(g, 'evaporation', new THREE.ConeGeometry(0.07, 0.16, 16), { at: [x, 0.47, 0.3] });
  }
  for (const [x, y, z, r] of [[0.2, 1.35, 0, 0.3], [0.55, 1.45, 0.1, 0.38], [0.95, 1.35, -0.05, 0.3], [0.6, 1.25, 0.25, 0.26]] as const) put(g, 'clouds', sphere(r), { at: [x, y, z] });
  for (let i = 0; i < 7; i++) put(g, 'rain', cyl(0.012, 0.25, 8), { at: [0.25 + i * 0.13, 0.75 - (i % 3) * 0.12, ((i * 5) % 3) * 0.12 - 0.1], rot: [0, 0, 0.2] });
}

function leafModel(g: THREE.Group) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.75, 1.6, 0.7, 2.4, 0);
  s.bezierCurveTo(1.6, -0.7, 0.5, -0.75, 0, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 24 });
  blade.translate(-1.2, 0, -0.01);
  put(g, 'blade', blade, { rot: [-Math.PI / 2, 0, 0] });
  put(g, 'midrib', cyl(0.025, 2.35), { at: [0, 0.03, 0], rot: [0, 0, Math.PI / 2] });
  for (const x of [-0.75, -0.3, 0.15, 0.55]) {
    for (const side of [1, -1]) put(g, 'veins', tube([[x, 0.03, 0], [x + 0.2, 0.03, side * 0.22], [x + 0.35, 0.03, side * (0.48 - Math.abs(x) * 0.12)]], 0.01));
  }
  put(g, 'petiole', cyl(0.035, 0.6), { at: [-1.5, 0, 0], rot: [0, 0, Math.PI / 2] });
  // The magnifier: a round window above the leaf with two stomata, each a pore between two guard cells.
  put(g, null, new THREE.CircleGeometry(0.55, 48), { at: [0.6, 0.9, -0.2], rot: [-0.5, 0, 0] }, 'offWhite');
  put(g, null, cyl(0.006, 0.75), { at: [0.45, 0.45, -0.05], rot: [0.3, 0, 0.3] }, 'slate');
  const lens = new THREE.Group();
  lens.position.set(0.6, 0.9, -0.2);
  lens.rotation.set(-0.5, 0, 0);
  for (const x of [-0.2, 0.2]) {
    put(lens, 'stomata', sphere(0.05, 16, 12), { at: [x, 0, 0.01], scale: [0.5, 1.8, 0.2] });
    put(lens, 'guard_cells', sphere(0.06, 16, 12), { at: [x - 0.065, 0, 0.02], scale: [0.6, 1.9, 0.5] });
    put(lens, 'guard_cells', sphere(0.06, 16, 12), { at: [x + 0.065, 0, 0.02], scale: [0.6, 1.9, 0.5] });
  }
  g.add(lens);
}

const BUILDERS: Partial<Record<ModelKey, (g: THREE.Group) => void>> = {
  solar_system: solarSystem,
  earth_layers: earthLayers,
  atom,
  plant_cell: plantCell,
  animal_cell: animalCell,
  flower,
  neuron,
  dc_motor: dcMotor,
  electromagnet,
  water_cycle: waterCycle,
  leaf: leafModel,
};

export const hasBuilder = (key: ModelKey): boolean => key in BUILDERS;

export function buildProcedural(key: ModelKey): THREE.Group | null {
  const build = BUILDERS[key];
  if (!build) return null;
  const g = new THREE.Group();
  g.name = key;
  build(g);
  return g;
}
