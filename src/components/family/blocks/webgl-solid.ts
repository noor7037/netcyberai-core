import type { Mesh, Vec } from '@/lib/family/solids';

// The 3D view of a solid (S5, C378): plain WebGL, no library. This file is loaded only when a child taps "See it in 3D"
// (a dynamic import in Model3DView.tsx), so it is never part of the first load. It draws on request, not in a loop: a
// frame is drawn when the angles change, so nothing animates by itself (prefers-reduced-motion has nothing to switch
// off) and an idle model costs no battery. Lighting is flat and two-sided, so a mesh needs no consistent winding.

export type SolidHandle = { turn: (yaw: number, pitch: number) => void; destroy: () => void };

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform float uYaw;
uniform float uPitch;
varying vec3 vNormal;
vec3 rot(vec3 p) {
  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
  vec3 a = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  return vec3(a.x, cp * a.y - sp * a.z, sp * a.y + cp * a.z);
}
void main() {
  vec3 p = rot(aPos) * 0.52;
  vNormal = rot(aNormal);
  gl_Position = vec4(p.x, p.y, p.z * 0.5, 1.0 + p.z * 0.2);
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uLines;
void main() {
  if (uLines > 0.5) { gl_FragColor = vec4(uColor, 1.0); return; }
  float d = abs(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 0.7))));
  gl_FragColor = vec4(uColor * (0.5 + 0.5 * d), 1.0);
}`;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

// `fill` and `line` are colours as [r, g, b] in 0..1. Returns null when WebGL cannot start (the caller shows the drawing).
export function startSolid(canvas: HTMLCanvasElement, mesh: Mesh, fill: Vec, line: Vec, onLost: () => void): SolidHandle | null {
  const gl = (canvas.getContext('webgl', { antialias: true, alpha: true }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // Unindexed triangles with one flat normal each, then the edges as lines (normal unused).
  const tri: number[] = [];
  for (const [i, j, k] of mesh.triangles) {
    const a = mesh.vertices[i];
    const b = mesh.vertices[j];
    const c = mesh.vertices[k];
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const p of [a, b, c]) tri.push(p[0], p[1], p[2], n[0] / len, n[1] / len, n[2] / len);
  }
  const lines: number[] = [];
  for (const [i, j] of mesh.edges) for (const p of [mesh.vertices[i], mesh.vertices[j]]) lines.push(p[0], p[1], p[2], 0, 0, 1);
  const buffer = gl.createBuffer();
  const triCount = tri.length / 6;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...tri, ...lines]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'aPos');
  const nor = gl.getAttribLocation(program, 'aNormal');
  gl.enableVertexAttribArray(pos);
  gl.enableVertexAttribArray(nor);
  gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(nor, 3, gl.FLOAT, false, 24, 12);
  const uYaw = gl.getUniformLocation(program, 'uYaw');
  const uPitch = gl.getUniformLocation(program, 'uPitch');
  const uColor = gl.getUniformLocation(program, 'uColor');
  const uLines = gl.getUniformLocation(program, 'uLines');
  gl.enable(gl.DEPTH_TEST);
  // The faces sit a little behind their own edges, so the edges are not eaten by them.
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);

  let yaw = 0.7;
  let pitch = 0.45;
  let alive = true;
  const draw = () => {
    if (!alive) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uYaw, yaw);
    gl.uniform1f(uPitch, pitch);
    gl.uniform3f(uColor, fill[0], fill[1], fill[2]);
    gl.uniform1f(uLines, 0);
    gl.drawArrays(gl.TRIANGLES, 0, triCount);
    gl.uniform3f(uColor, line[0], line[1], line[2]);
    gl.uniform1f(uLines, 1);
    gl.drawArrays(gl.LINES, triCount, lines.length / 6);
  };
  const lost = (e: Event) => {
    e.preventDefault();
    alive = false;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);
  draw();
  return {
    turn: (y, p) => {
      yaw = y;
      pitch = Math.max(-1.45, Math.min(1.45, p));
      draw();
    },
    destroy: () => {
      alive = false;
      canvas.removeEventListener('webglcontextlost', lost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
