// The lazy 3D viewer's engine (founder, 16 Nov 2026): three.js in its own chunk, fetched only when a 3D picture starts
// (Model3dPic.tsx). One finger turns the model, two fingers pinch to zoom (OrbitControls). A glTF binary is loaded as it
// is; a PubChem molecule (SDF) is drawn as balls and sticks and a protein (PDB) as its backbone line, by our own code.
// Reduced motion: nothing turns by itself. Any failure calls onFail and the still picture stays.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { colors } from '@/lib/design-tokens';
import { gltfLoader } from './gltf-resources';

export type ViewerHandle = { destroy: () => void };
export type ViewerModel = { format: 'glb' | 'sdf' | 'pdb'; url: string };

const ELEMENT: Record<string, { c: number; r: number }> = { H: { c: 0xffffff, r: 0.25 }, C: { c: 0x444444, r: 0.4 }, N: { c: 0x3050f8, r: 0.38 }, O: { c: 0xff2020, r: 0.38 }, S: { c: 0xffd23f, r: 0.5 }, P: { c: 0xff8000, r: 0.5 }, Mg: { c: 0x2eb82e, r: 0.55 }, Cl: { c: 0x1ff01f, r: 0.5 } };

// SDF (a V2000 molfile): the counts line, then atoms (x y z symbol), then bonds (a b order).
export function parseSdf(text: string): { atoms: { p: [number, number, number]; e: string }[]; bonds: [number, number][] } {
  const lines = text.split(/\r?\n/);
  const counts = lines[3] ?? '';
  const na = parseInt(counts.slice(0, 3), 10);
  const nb = parseInt(counts.slice(3, 6), 10);
  if (!(na > 0 && na <= 2000)) throw new Error('bad sdf');
  const atoms = lines.slice(4, 4 + na).map((l) => {
    const t = l.trim().split(/\s+/);
    return { p: [Number(t[0]), Number(t[1]), Number(t[2])] as [number, number, number], e: t[3] ?? 'C' };
  });
  const bonds = lines.slice(4 + na, 4 + na + (nb > 0 ? nb : 0)).map((l): [number, number] => [parseInt(l.slice(0, 3), 10) - 1, parseInt(l.slice(3, 6), 10) - 1]);
  return { atoms, bonds: bonds.filter(([a, b]) => a >= 0 && b >= 0 && a < na && b < na) };
}

// PDB: the alpha-carbon backbone (ATOM lines named CA), in order.
export function parsePdbBackbone(text: string): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('ATOM') && l.slice(12, 16).trim() === 'CA') pts.push([parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))]);
    if (pts.length >= 4000) break;
  }
  if (pts.length < 3) throw new Error('bad pdb');
  return pts;
}

function molecule(text: string): THREE.Object3D {
  const { atoms, bonds } = parseSdf(text);
  const g = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 16, 12);
  atoms.forEach((a) => {
    const el = ELEMENT[a.e] ?? { c: 0xcc66cc, r: 0.45 };
    const m = new THREE.Mesh(ball, new THREE.MeshStandardMaterial({ color: el.c, roughness: 0.5 }));
    m.scale.setScalar(el.r);
    m.position.set(...a.p);
    g.add(m);
  });
  const stick = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
  const up = new THREE.Vector3(0, 1, 0);
  bonds.forEach(([i, j]) => {
    const a = new THREE.Vector3(...atoms[i].p);
    const b = new THREE.Vector3(...atoms[j].p);
    const m = new THREE.Mesh(stick, new THREE.MeshStandardMaterial({ color: 0x999999 }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, a.distanceTo(b), 1);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.add(m);
  });
  return g;
}

function backbone(text: string): THREE.Object3D {
  const pts = parsePdbBackbone(text).map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(pts.length * 3, 4000), 0.5, 6, false), new THREE.MeshStandardMaterial({ color: colors.emerald, roughness: 0.5 }));
}

export async function startViewer(canvasHost: HTMLElement, model: ViewerModel, o: { reducedMotion: boolean; onReady: () => void; onFail: () => void }): Promise<ViewerHandle> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2), Object.assign(new THREE.DirectionalLight(0xffffff, 2), { position: new THREE.Vector3(3, 5, 4) }));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
  let frame = 0;
  let dead = false;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !o.reducedMotion;
  controls.autoRotate = !o.reducedMotion;
  controls.autoRotateSpeed = 1.2;
  const size = () => {
    const w = canvasHost.clientWidth || 300;
    const h = canvasHost.clientHeight || 225;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const destroy = () => {
    dead = true;
    cancelAnimationFrame(frame);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  try {
    const res = await fetch(model.url, { referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(String(res.status));
    let obj: THREE.Object3D;
    if (model.format === 'glb') obj = (await gltfLoader(model.url).parseAsync(await res.arrayBuffer(), model.url.slice(0, model.url.lastIndexOf('/') + 1))).scene;
    else obj = model.format === 'sdf' ? molecule(await res.text()) : backbone(await res.text());
    if (dead) return { destroy };
    const box = new THREE.Box3().setFromObject(obj);
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
    obj.position.sub(centre);
    scene.add(obj);
    camera.position.set(0, radius * 0.4, radius * 2.6);
    camera.near = radius / 100;
    camera.far = radius * 50;
    controls.minDistance = radius * 0.8;
    controls.maxDistance = radius * 6;
    size();
    canvasHost.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%' });
    const tick = () => {
      if (dead) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();
    o.onReady();
  } catch {
    destroy();
    o.onFail();
  }
  return { destroy };
}
