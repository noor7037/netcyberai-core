import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// v21: a glTF may be Draco-compressed (Smithsonian 3D; the decoder is served from /draco/) or a .gltf with its files
// beside it (Poly Haven, whose textures sit in a sibling jpg folder). Every file it names must be on the model's own host.
const POLYHAVEN_TEXTURES = new RegExp('/Models/gltf/([^/]+)/([^/]+)/textures/');
export function resourceUrl(modelAddress: string, asked: string): string {
  if (asked.startsWith('blob:') || asked.startsWith('data:')) return asked; // the embedded images and buffers of a GLB
  try {
    const base = new URL(modelAddress);
    const u = new URL(asked, modelAddress);
    if (u.protocol !== 'https:' || u.host !== base.host) return 'about:blank';
    if (u.host === 'dl.polyhaven.org') u.pathname = u.pathname.replace(POLYHAVEN_TEXTURES, (_m, res: string, id: string) => ['', 'Models', 'jpg', res, id, ''].join('/'));
    return u.toString();
  } catch {
    return 'about:blank';
  }
}
let draco: DRACOLoader | null = null;
export function gltfLoader(modelAddress: string): GLTFLoader {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => resourceUrl(modelAddress, u));
  draco ??= new DRACOLoader().setDecoderPath('/draco/').setDecoderConfig({ type: 'wasm' });
  return new GLTFLoader(manager).setDRACOLoader(draco);
}
