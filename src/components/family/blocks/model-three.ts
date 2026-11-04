// The 3D model view's engine (W19-D): three.js, in its own chunk, fetched only when the 3D view starts (ModelView.tsx).
// It loads the model (a part-segmented glTF from public/models, or our procedural schematic), colours each part from the
// logo tokens, lets the child turn it (OrbitControls: one finger turns, two pinch), picks the part under a tap
// (raycast), and turns the camera to the part being explained and highlights it (the others fade).
// Reduced motion: no auto-rotate, no easing, no damping: every move is instant.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { colors } from '@/lib/design-tokens';
import { MODELS, drawnParts, modelAssetPath, type ModelKey } from '@/lib/family/models/catalog';
import { buildProcedural } from '@/lib/family/models/procedural';

export type ModelHandle = { focus: (parts: readonly string[] | null) => void; destroy: () => void };
export type StartOptions = { reducedMotion: boolean; onPick: (part: string | null) => void; onFail: () => void };

const DIST = 3.0;
const EASE_MS = 650;
// Models open at the top or laid out flat are first seen from higher up.
const LOOK_DOWN: Partial<Record<ModelKey, number>> = { plant_cell: 2.2, animal_cell: 2.2, water_cycle: 1, solar_system: 1, leaf: 1.4 };
const PALE = new THREE.Color(colors.offWhite);

async function loadModel(key: ModelKey): Promise<THREE.Object3D> {
  const url = modelAssetPath(key);
  if (!url) {
    const g = buildProcedural(key);
    if (!g) throw new Error(`no model ${key}`);
    return g;
  }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  // Each mesh belongs to the part group above it (the asset's top nodes are named by part key).
  const keys = new Set(drawnParts(key).map((p) => p.key));
  gltf.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    for (let up: THREE.Object3D | null = o; up; up = up.parent) {
      if (keys.has(up.name)) {
        o.userData.part = up.name;
        break;
      }
    }
  });
  return gltf.scene;
}

export async function startModel(canvas: HTMLCanvasElement, key: ModelKey, opts: StartOptions): Promise<ModelHandle | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  camera.position.set(0.9, LOOK_DOWN[key] ?? 0.6, DIST).setLength(DIST);
  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(colors.slate), 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 4);
  camera.add(sun);
  scene.add(camera);

  let gone = false;
  let root: THREE.Object3D;
  try {
    root = await loadModel(key);
  } catch {
    renderer.dispose();
    return null;
  }
  if (gone) return null;

  // Centre the model and scale it to a radius of 1.
  // The bounds of the parts only: an orbit line or a wire never shrinks the model.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.part) bounds.expandByObject(o);
  });
  if (bounds.isEmpty()) bounds.setFromObject(root);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const holder = new THREE.Group();
  root.position.sub(sphere.center);
  holder.add(root);
  holder.scale.setScalar(1 / (sphere.radius || 1));
  scene.add(holder);

  // One material per mesh, so a part can be lit and the rest faded.
  const tone = new Map(MODELS[key].parts.map((p) => [p.key, colors[p.tone]]));
  const meshes: THREE.Mesh[] = [];
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const part = m.userData.part as string | undefined;
    const hex = part ? (tone.get(part) ?? colors.offWhite) : colors[(m.userData.decor as keyof typeof colors) ?? 'offWhite'] ?? colors.offWhite;
    m.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide, transparent: !part, opacity: part ? 1 : 0.35 });
    meshes.push(m);
  });

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 6;
  controls.enableDamping = !opts.reducedMotion;
  controls.autoRotate = !opts.reducedMotion;
  controls.autoRotateSpeed = 1.2;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    ease = null;
  });

  const resize = () => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 240;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  watch?.observe(canvas);

  // The camera's move to a part: from where it is to where it should be, over EASE_MS (instant under reduced motion).
  let ease: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; start: number } | null = null;
  const asset = MODELS[key].source === 'asset';
  const focus = (parts: readonly string[] | null) => {
    const on = parts && parts.length > 0 ? new Set(parts) : null;
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const part = m.userData.part as string | undefined;
      const lit = !!on && !!part && on.has(part);
      mat.emissive.set(lit ? colors.sunshine : 0x000000);
      mat.emissiveIntensity = lit ? 0.5 : 0;
      // The rest turn pale and see-through, so a part inside (a valve, the lens) still shows.
      const faded = !!on && !lit;
      const base = (m.userData.base as THREE.Color | undefined) ?? mat.color.clone();
      m.userData.base = base;
      mat.color.copy(faded ? base.clone().lerp(PALE, 0.6) : base);
      mat.transparent = faded || !part;
      mat.opacity = faded ? (part ? 0.4 : 0.15) : part ? 1 : 0.35;
      mat.needsUpdate = true;
    }
    if (!on) return;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of meshes) if (on.has(m.userData.part as string)) box.expandByObject(m);
    if (box.isEmpty()) return;
    controls.autoRotate = false;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    // Turn toward the part's side of the model (anatomy fully, a schematic a little), seen from a little above: the
    // heading from the part's place round the model, the height kept between just below and well above.
    const cam = camera.position.clone().sub(controls.target);
    const flat = new THREE.Vector2(cam.x, cam.z).normalize();
    const side = new THREE.Vector2(c.x, c.z);
    if (side.length() > 0.12) flat.add(side.normalize().multiplyScalar(asset ? 4 : 0.6)).normalize();
    const y = Math.max(-0.15, Math.min(0.55, 0.2 + (c.length() > 0.15 ? (c.y / c.length()) * 0.4 : 0)));
    const across = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(flat.x * across, y, flat.y * across);
    const target = c.clone().multiplyScalar(0.3);
    const dist = Math.max(2.5, Math.min(DIST, r * 5));
    const to = target.clone().add(dir.multiplyScalar(dist));
    if (opts.reducedMotion) {
      camera.position.copy(to);
      controls.target.copy(target);
      ease = null;
    } else ease = { from: camera.position.clone(), to, fromT: controls.target.clone(), toT: target, start: performance.now() };
  };

  // A tap (not a drag) picks the part under the finger.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return void (down = null);
    down = null;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(meshes, false).find((h) => h.object.userData.part && (h.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.opacity > 0.5) ?? ray.intersectObjects(meshes, false).find((h) => h.object.userData.part);
    opts.onPick((hit?.object.userData.part as string | undefined) ?? null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  const lost = (e: Event) => {
    e.preventDefault();
    opts.onFail();
  };
  canvas.addEventListener('webglcontextlost', lost);

  let frame = 0;
  const tick = (now: number) => {
    if (gone) return;
    if (ease) {
      const t = Math.min(1, (now - ease.start) / EASE_MS);
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      camera.position.lerpVectors(ease.from, ease.to, k);
      controls.target.lerpVectors(ease.fromT, ease.toT, k);
      if (t >= 1) ease = null;
    }
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    focus,
    destroy: () => {
      gone = true;
      cancelAnimationFrame(frame);
      watch?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('webglcontextlost', lost);
      controls.dispose();
      holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
    },
  };
}
