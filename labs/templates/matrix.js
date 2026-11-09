// Template: Matrices and vectors. Exact rational arithmetic (fractions, never floating point) for matrix sums, products,
// determinants, minors, cofactors, adjugates and inverses; integer vectors for sum, dot product, cross product and
// lines in 3D. Nothing is scripted: every number shown is computed here. Config:
//   { mode: 'matrix-add' | 'matrix-multiply' | 'determinant' | 'inverse' | 'vector-add' | 'dot' | 'cross' | 'line-3d',
//     a?: number[][]   matrix A (add, multiply: up to 4x4; determinant, inverse: 2x2 or 3x3);
//                      line-3d: an optional second line as [[px,py,pz],[dx,dy,dz]]
//     b?: number[][]   matrix B (add, multiply)
//     u?, v?: [x,y,z]  whole-number vectors (line-3d: u = a point on the line, v = its direction) }
// A vector-add or dot config with z = 0 in both vectors is drawn flat (2D); otherwise in 3D.
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;

  // ---------------------------------------------------------------- exact fractions
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
  const F = (n, d) => { d = d == null ? 1 : d; if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const fadd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
  const fsub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
  const fmul = (a, b) => F(a.n * b.n, a.d * b.d);
  const fdiv = (a, b) => F(a.n * b.d, a.d * b.n);
  const fneg = (a) => F(-a.n, a.d);
  const feq = (a, b) => a.n === b.n && a.d === b.d;
  const fzero = (a) => a.n === 0;
  const fnum = (a) => a.n / a.d;
  const ZERO = F(0), ONE = F(1);
  const MINUS = '−';
  // plain text of a fraction: -3, 3/4, -3/4
  const fs = (f) => (f.n < 0 ? MINUS : '') + Math.abs(f.n) + (f.d === 1 ? '' : '/' + f.d);
  // text with brackets round a negative number
  const pn = (f) => (f.n < 0 ? '(' + fs(f) + ')' : fs(f));
  // HTML: a stacked fraction for non-integers
  const fh = (f) => (f.d === 1 ? esc(fs(f)) : (f.n < 0 ? MINUS : '') + '<span class="mx-fr"><i>' + Math.abs(f.n) + '</i><i>' + f.d + '</i></span>');
  // Read what a child (or a config) wrote: 4, -3, −3, 1/2, 1.25 (up to 3 decimals). null when it is not a number.
  function parseF(s) {
    if (typeof s === 'number') {
      if (!isFinite(s)) return null;
      return Number.isInteger(s) ? F(s) : parseF(String(Math.round(s * 1000) / 1000));
    }
    if (typeof s !== 'string') return null;
    const t = s.trim().replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(',', '.');
    let m = t.match(/^([+-]?\d{1,6})\/(\d{1,6})$/);
    if (m) return +m[2] ? F(+m[1], +m[2]) : null;
    m = t.match(/^([+-]?)(\d*)(?:\.(\d{1,3}))?$/);
    if (!m || (!m[2] && !m[3])) return null;
    const frac = m[3] || '';
    const n = parseInt((m[2] || '0') + frac, 10), d = Math.pow(10, frac.length);
    return F(m[1] === '-' ? -n : n, d);
  }

  // ---------------------------------------------------------------- matrices
  const toM = (a) => a.map((r) => r.map((x) => parseF(x)));
  const cloneM = (M) => M.map((r) => r.map((x) => ({ n: x.n, d: x.d })));
  const sgn = (i, j) => ((i + j) % 2 ? F(-1) : ONE);
  const mAdd = (A, B, s) => A.map((r, i) => r.map((x, j) => (s < 0 ? fsub(x, B[i][j]) : fadd(x, B[i][j]))));
  const mMul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => fadd(s, fmul(x, B[k][j])), ZERO)));
  const mT = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const minorM = (A, i, j) => A.filter((_, r) => r !== i).map((r) => r.filter((_, c) => c !== j));
  function det(A) {
    const n = A.length;
    if (n === 1) return A[0][0];
    if (n === 2) return fsub(fmul(A[0][0], A[1][1]), fmul(A[0][1], A[1][0]));
    let s = ZERO;
    for (let j = 0; j < n; j++) s = fadd(s, fmul(fmul(sgn(0, j), A[0][j]), det(minorM(A, 0, j))));
    return s;
  }
  const minorsM = (A) => A.map((r, i) => r.map((_, j) => det(minorM(A, i, j))));
  const cofM = (A) => minorsM(A).map((r, i) => r.map((x, j) => fmul(sgn(i, j), x)));
  const adjM = (A) => mT(cofM(A));
  function invM(A) { const d = det(A); return fzero(d) ? null : adjM(A).map((r) => r.map((x) => fdiv(x, d))); }
  const idM = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));
  // Expansion of |A| along row i (kind 'row') or column j (kind 'col'): the signed terms.
  function expansion(A, kind, k) {
    return A.map((_, t) => {
      const i = kind === 'row' ? k : t, j = kind === 'row' ? t : k;
      const a = A[i][j], mn = det(minorM(A, i, j)), s = sgn(i, j);
      return { i, j, a, s, minor: mn, val: fmul(fmul(s, a), mn) };
    });
  }

  // ---------------------------------------------------------------- vectors (whole numbers)
  const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len2 = (u) => dot3(u, u);
  const vadd = (u, v, s) => [u[0] + s * v[0], u[1] + s * v[1], u[2] + s * v[2]];
  const isZeroV = (u) => !u[0] && !u[1] && !u[2];
  // sqrt(n) as k sqrt(m), m square-free
  function radical(n) { let k = 1, m = n; for (let f = 2; f * f <= m; f++) { while (m % (f * f) === 0) { m /= f * f; k *= f; } } return { k, m }; }
  function rtxt(n) { if (n === 0) return '0'; const r = radical(n); if (r.m === 1) return '' + r.k; return (r.k > 1 ? r.k : '') + '√' + r.m; }
  const vtxt = (u, n) => '(' + u.slice(0, n).map((x) => (x < 0 ? MINUS : '') + Math.abs(x)).join(', ') + ')';
  const ftxt = (x, p) => { let s = x.toFixed(p == null ? 1 : p); if (/^-0\.?0*$/.test(s)) s = s.slice(1); return s.replace('-', MINUS); };
  function angleDeg(u, v) {
    const a = Math.sqrt(len2(u)), b = Math.sqrt(len2(v));
    if (!a || !b) return null;
    return (Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / (a * b)))) * 180) / Math.PI;
  }
  // How two lines P1 + l b1 and P2 + m b2 lie: exact, with whole numbers.
  function lineRelation(p1, b1, p2, b2) {
    const c = cross3(b1, b2), w = vadd(p2, p1, -1);
    if (isZeroV(c)) {
      const k = cross3(w, b1);
      return isZeroV(k) ? { kind: 'same' } : { kind: 'parallel', num: len2(k), den: len2(b1) };
    }
    const s = dot3(w, c);
    const cosA = Math.abs(dot3(b1, b2)) / Math.sqrt(len2(b1) * len2(b2));
    const ang = (Math.acos(Math.min(1, cosA)) * 180) / Math.PI;
    if (s === 0) return { kind: 'meet', ang, lam: F(dot3(cross3(w, b2), c), len2(c)) };
    return { kind: 'skew', num: Math.abs(s), den: len2(c), ang };
  }
  // nearest points of two lines (floats, for the picture): parameters l, m
  function nearest(p1, b1, p2, b2) {
    const w = vadd(p1, p2, -1), a = dot3(b1, b1), b = dot3(b1, b2), c = dot3(b2, b2), d = dot3(b1, w), e = dot3(b2, w);
    const den = a * c - b * b;
    if (den === 0) return { l: 0, m: e / c };
    return { l: (b * e - c * d) / den, m: (a * e - b * d) / den };
  }

  // ---------------------------------------------------------------- configs
  const MODES = ['matrix-add', 'matrix-multiply', 'determinant', 'inverse', 'vector-add', 'dot', 'cross', 'line-3d'];
  const MATRIX_MODES = ['matrix-add', 'matrix-multiply', 'determinant', 'inverse'];
  const DEF = {
    'matrix-add': { a: [[2, -1, 4], [0, 3, 5]], b: [[1, 6, -2], [7, -3, 0]] },
    'matrix-multiply': { a: [[1, 2], [3, 4]], b: [[2, 0], [1, 2]] },
    determinant: { a: [[3, 2], [1, 4]] },
    inverse: { a: [[2, 1], [5, 3]] },
    'vector-add': { u: [3, 1, 0], v: [1, 3, 0] },
    dot: { u: [3, 1, 0], v: [1, 4, 0] },
    cross: { u: [3, 0, 0], v: [-1, 2, 2] },
    'line-3d': { u: [1, 0, 1], v: [2, 1, 1] },
  };
  // vector limits [per component for u, for v]; the picture's half-width
  const LIMS = { 'vector-add': { u: 6, v: 6, R: 12 }, 'vector-add3': { u: 4, v: 4, R: 8 }, dot: { u: 6, v: 6, R: 7 }, cross: { u: 4, v: 4, R: 5 }, 'line-3d': { u: 4, v: 4, R: 7 } };
  const flat = (u) => Array.isArray(u) && u.length === 3 && u[2] === 0;
  const limFor = (m, u, v) => LIMS[m === 'vector-add' && !(flat(u) && flat(v)) ? 'vector-add3' : m];
  const BIG = 99;
  const MAXN = 4;

  function mErrors(name, m, o) {
    const e = [];
    if (!Array.isArray(m) || !m.length || !m.every((r) => Array.isArray(r) && r.length)) return [name + ': a list of rows, each a list of numbers'];
    const cols = m[0].length;
    if (!m.every((r) => r.length === cols)) return [name + ': every row must have the same number of entries'];
    if (m.length > o.max || cols > o.max) e.push(`${name}: at most ${o.max} rows and ${o.max} columns`);
    if (o.square && m.length !== cols) e.push(name + ': must be a square matrix');
    if (o.sizes && (m.length !== cols || !o.sizes.includes(m.length))) e.push(`${name}: must be ${o.sizes.join(' x ')} sizes only`);
    m.forEach((r) => r.forEach((x) => {
      if (typeof x !== 'number' || !isFinite(x)) e.push(name + ': entries must be numbers');
      else if (Math.abs(x) > BIG) e.push(`${name}: entries must be between -${BIG} and ${BIG}`);
      else if (!Number.isInteger(x) && Math.abs(x * 1000 - Math.round(x * 1000)) > 1e-6) e.push(name + ': at most 3 decimals');
    }));
    return e.filter((x, i, a) => a.indexOf(x) === i);
  }
  function vErrors(name, u, lim, nonzero) {
    if (!Array.isArray(u) || u.length !== 3 || !u.every((x) => typeof x === 'number' && Number.isInteger(x))) return [name + ': three whole numbers [x, y, z]'];
    const e = [];
    if (u.some((x) => Math.abs(x) > lim)) e.push(`${name}: each part between -${lim} and ${lim}`);
    if (nonzero && isZeroV(u)) e.push(name + ': must not be the zero vector');
    return e;
  }
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (!['mode', 'a', 'b', 'u', 'v'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
    const m = c.mode, d = DEF[m];
    if (MATRIX_MODES.includes(m)) {
      if (c.u != null || c.v != null) e.push('u and v are for the vector modes only');
      if ((m === 'determinant' || m === 'inverse') && c.b != null) e.push('b: this mode uses one matrix, a');
      const a = c.a != null ? c.a : d.a, b = c.b != null ? c.b : d.b;
      if (m === 'determinant' || m === 'inverse') return e.concat(mErrors('a', a, { max: 3, sizes: [2, 3] }));
      const ea = mErrors('a', a, { max: MAXN }), eb = mErrors('b', b, { max: MAXN });
      if (ea.length || eb.length) return e.concat(ea, eb);
      if (m === 'matrix-add' && (a.length !== b.length || a[0].length !== b[0].length)) e.push('a and b must be the same size to add or subtract');
      if (m === 'matrix-multiply' && a[0].length !== b.length) e.push('a must have as many columns as b has rows to multiply');
      return e;
    }
    if (c.b != null) e.push('b is for the matrix modes only');
    const u = c.u != null ? c.u : d.u, v = c.v != null ? c.v : d.v;
    const lim = limFor(m, u, v);
    e.push(...vErrors('u', u, lim.u, false), ...vErrors('v', v, lim.v, m === 'line-3d'));
    if (m !== 'line-3d' && c.a != null) e.push('a is for the matrix modes (or a second line in line-3d)');
    if (m === 'line-3d' && c.a != null) {
      if (!Array.isArray(c.a) || c.a.length !== 2) e.push('a: a second line as [[px,py,pz],[dx,dy,dz]]');
      else e.push(...vErrors('a[0]', c.a[0], lim.u, false), ...vErrors('a[1]', c.a[1], lim.v, true));
    }
    return e;
  }
  // fill in the defaults
  function resolve(c) {
    const m = c.mode, d = DEF[m], o = { mode: m };
    if (MATRIX_MODES.includes(m)) { o.A = toM(c.a != null ? c.a : d.a); if (d.b) o.B = toM(c.b != null ? c.b : d.b); }
    else { o.u = (c.u != null ? c.u : d.u).slice(); o.v = (c.v != null ? c.v : d.v).slice(); if (m === 'line-3d' && c.a) o.L2 = [c.a[0].slice(), c.a[1].slice()]; }
    o.is3 = m === 'cross' || m === 'line-3d' || ((m === 'vector-add' || m === 'dot') && (o.u[2] !== 0 || o.v[2] !== 0));
    return o;
  }
  function keys(c) {
    let r;
    try { r = resolve(c); } catch (x) { return { targets: [], events: [] }; }
    const m = c.mode;
    const cells = (rows, cols) => { const t = []; for (let i = 1; i <= rows; i++) for (let j = 1; j <= cols; j++) t.push(`cell:${i}-${j}`); return t; };
    let targets = [];
    const rot = r.is3 ? ['op:rotate-left', 'op:rotate-right'] : [];
    if (m === 'matrix-add') targets = cells(r.A.length, r.A[0].length).concat(['answer', 'op:add', 'op:subtract', 'op:step', 'op:show', 'op:new']);
    else if (m === 'matrix-multiply') targets = cells(r.A.length, r.B[0].length).concat(['answer', 'op:step', 'op:show', 'op:swap', 'op:new']);
    else if (m === 'determinant') {
      const n = r.A.length;
      targets = cells(n, n).concat(['answer', 'op:show', 'op:swap-rows', 'op:double-row', 'op:reset', 'op:new']);
      for (let i = 1; i <= n; i++) targets.push('op:row-' + i, 'op:col-' + i);
    } else if (m === 'inverse') targets = cells(r.A.length, r.A.length).concat(['answer', 'op:minors', 'op:cofactors', 'op:adjugate', 'op:inverse', 'op:show', 'op:reset', 'op:new']);
    else if (m === 'vector-add') targets = ['drag:u', 'drag:v', 'answer', 'op:triangle', 'op:parallelogram', 'op:subtract', 'op:show', 'op:reset'].concat(rot);
    else if (m === 'dot') targets = ['drag:u', 'drag:v', 'answer', 'op:project', 'op:show', 'op:reset'].concat(rot);
    else if (m === 'cross') targets = ['drag:u', 'drag:v', 'answer', 'op:swap', 'op:parallelogram', 'op:show', 'op:reset'].concat(rot);
    else targets = ['drag:u', 'drag:v', 'answer', 'op:lambda', 'op:show', 'op:reset'].concat(rot);
    const events = ['computed', 'answered:right', 'answered:wrong'];
    if (m === 'vector-add' || m === 'cross') events.push('resultant');
    return { targets, events };
  }

  // A deterministic list of fresh practice problems ("New problem"): a small seeded generator, never random.
  function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function genMatrix(rows, cols, rnd, lo, hi) { return Array.from({ length: rows }, () => Array.from({ length: cols }, () => F(lo + Math.floor(rnd() * (hi - lo + 1))))); }
  function genProblem(mode, base, index) {
    const rnd = lcg(7919 * (index + 3) + mode.length);
    const r = base.A.length, c = base.A[0].length;
    if (mode === 'matrix-add') return { A: genMatrix(r, c, rnd, -5, 9), B: genMatrix(r, c, rnd, -5, 9) };
    if (mode === 'matrix-multiply') return { A: genMatrix(r, c, rnd, -3, 5), B: genMatrix(base.B.length, base.B[0].length, rnd, -3, 5) };
    for (let t = 0; t < 60; t++) {
      const A = genMatrix(r, r, rnd, -4, 6);
      const d = det(A);
      if (mode === 'determinant' ? !fzero(d) || t > 40 : !fzero(d) && Math.abs(d.n) <= 7) return { A };
    }
    return { A: cloneM(base.A) };
  }

  // ---------------------------------------------------------------- style
  const CSS = `
.mx{font-family:var(--font-body,inherit);color:var(--ink,#1E293B);display:grid;gap:14px;grid-template-columns:minmax(0,1fr);--cw:44px;--ch:44px;width:100%}
.mx *{box-sizing:border-box}
.mx-board{background:linear-gradient(155deg,#EEF2FF 0%,#E3E9FF 55%,#F3E8FF 100%);border-radius:22px;padding:14px;box-shadow:0 10px 28px rgba(67,56,202,.18),inset 0 0 0 1px rgba(67,56,202,.12);color:#1E293B;display:grid;gap:12px;align-content:start;min-width:0}
.mx-side{display:grid;gap:12px;align-content:start;min-width:0}
.mx-tip{margin:0;padding:10px 14px;border-radius:14px;background:var(--sun-t,#FFF4CC);color:var(--ink,#1E293B);font-size:15px;line-height:1.45;border-left:5px solid #F5B90A}
.mx-eq{display:flex;flex-wrap:wrap;gap:10px 8px;align-items:center;justify-content:center;min-height:90px}
.mx-eq:empty{display:none}
.mx-blk{display:grid;gap:4px;justify-items:center}
.mx-cap{font:700 14px var(--font-display,inherit);color:#334155;display:flex;gap:6px;align-items:baseline}
.mx-cap small{font:600 12px var(--font-body,inherit);color:#64748B}
.mx-op{font:800 28px var(--font-display,inherit);color:#4338CA;padding:0 2px;align-self:center}
.mx-m{--mc:#4338CA;display:grid;grid-template-columns:repeat(var(--c),var(--cw));grid-auto-rows:var(--ch);gap:5px;padding:7px 14px;position:relative;margin:2px 0}
.mx-m::before,.mx-m::after{content:'';position:absolute;top:0;bottom:0;width:10px;border:3px solid var(--mc)}
.mx-m::before{left:0;border-right:0;border-radius:8px 0 0 8px}
.mx-m::after{right:0;border-left:0;border-radius:0 8px 8px 0}
.mx-m.bar::before,.mx-m.bar::after{border-radius:0;width:0;border-top:0;border-bottom:0}
.mx-m.bar::before{border-left:3px solid var(--mc);left:2px}
.mx-m.bar::after{border-right:3px solid var(--mc);right:2px}
.mx-m.ma{--mc:#2563EB}.mx-m.mb{--mc:#FF7A1A}.mx-m.mc{--mc:#8B3DFF}.mx-m.mg{--mc:#0F766E}
.mx-m.act{--cw:48px}
.mx-m.sm{--cw:34px;--ch:32px;gap:3px;padding:4px 10px}
.mx-m.sm .mx-c{font-size:14px;border-radius:7px}
.mx-m.sm::before,.mx-m.sm::after{width:7px;border-width:2px}
.mx-c{display:grid;place-items:center;border-radius:11px;background:#fff;color:#1E293B;font:700 19px var(--font-display,inherit);box-shadow:0 1px 3px rgba(30,41,59,.15);border:2px solid transparent;transition:background .25s,transform .25s,border-color .25s;min-width:0}
.mx-c.hl-a{background:#DBE7FF;border-color:#2563EB}
.mx-c.hl-b{background:#FFE8D4;border-color:#FF7A1A}
.mx-c.hl-r{background:#E6F7F3;border-color:#0F766E}
.mx-res{cursor:pointer;font-family:var(--font-display,inherit);background:#F3E8FF;color:#6B21A8;border:2px dashed #8B3DFF;padding:0}
.mx-res:hover{background:#EBD9FF}
.mx-res.sel{border-style:solid;background:#fff;box-shadow:0 0 0 3px #8B3DFF}
.mx-res.done{background:#8B3DFF;color:#fff;border:2px solid #8B3DFF}
.mx-res.done.sel{box-shadow:0 0 0 3px #C9A6FF}
.mx-res:focus-visible,.mx-btn:focus-visible,.mx-in:focus-visible,.mx-h:focus-visible circle:last-child,.mx-range:focus-visible{outline:3px solid #FF7A1A;outline-offset:2px}
.mx-pop{animation:mxPop .5s ease}
@keyframes mxPop{0%{transform:scale(.6)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.mx-in{width:100%;height:100%;min-width:44px;text-align:center;font:700 19px var(--font-display,inherit);color:#1E293B;background:#fff;border:2px solid #CBD5E1;border-radius:11px;padding:0 2px;-moz-appearance:textfield}
.mx-in.bad{border-color:#E11D48;background:#FFF1F2}
.mx-in.rowhl{border-color:#2563EB;background:#EAF1FF}
.mx-fr{display:inline-grid;text-align:center;font-size:.7em;line-height:1.05;vertical-align:middle;margin:0 1px}
.mx-fr i{font-style:normal;padding:0 2px}
.mx-fr i:first-child{border-bottom:2px solid currentColor}
.mx-svg{width:100%;height:auto;max-height:520px;display:block;touch-action:pan-y;border-radius:16px;background:#F8FAFF;box-shadow:inset 0 0 0 1px rgba(67,56,202,.15);user-select:none;-webkit-user-select:none}
.mx-svg text{font-family:var(--font-display,inherit)}
.mx-h{cursor:grab;touch-action:none}
.mx-h:active{cursor:grabbing}
.mx-h circle:last-child{transition:r .15s}
.mx-h:hover circle:last-child{r:12}
.mx-work{display:grid;gap:8px;background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:16px;padding:12px 14px;font-size:16px;line-height:1.5;min-height:70px;overflow-wrap:anywhere}
.mx-hint{margin:0;color:var(--ink-2,#475569)}
.mx-wt{font:700 15px var(--font-display,inherit);color:var(--ink-2,#475569)}
.mx-line{font-size:17px}
.mx-line b{font-family:var(--font-display,inherit)}
.mx-q{display:inline-block;min-width:1.2em;text-align:center;border-bottom:3px solid #8B3DFF;color:#8B3DFF;font-weight:800}
.mx-tm{display:inline-block;white-space:nowrap}
.mx-tm b.a,.mx-t.a,.mx-u{color:#2563EB}
.mx-tm b.b,.mx-t.b,.mx-v{color:#C2410C}
.mx-s{color:#8B3DFF}.mx-g{color:#0F766E}.mx-r{color:#BE123C}
.mx-rd{display:grid;gap:4px}
.mx-cards{display:flex;flex-wrap:wrap;gap:8px}
.mx-card{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:14px;background:linear-gradient(135deg,#EEF2FF,#F5EEFF);border:1px solid #D9DFFB;font:700 17px var(--font-display,inherit);flex-wrap:wrap}
.mx-card.zero{opacity:.55}
.mx-card .sg{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;color:#fff;font-size:15px}
.mx-card .sg.p{background:#0F766E}.mx-card .sg.m{background:#BE123C}
.mx-card .mx-m{margin:0}
.mx-stg{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.mx-stg .mx-blk{padding:6px 8px;border-radius:14px;background:#F8FAFF;border:1px solid #D9DFFB;color:#1E293B}
.mx-ctl{display:flex;flex-wrap:wrap;gap:8px}
.mx-btn{min-height:44px;padding:0 16px;border-radius:14px;border:0;font:700 15px var(--font-body,inherit);cursor:pointer;background:#1D4ED8;color:#fff;box-shadow:0 3px 0 rgba(6,18,51,.25);transition:transform .12s,box-shadow .12s,background .2s}
.mx-btn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(6,18,51,.25)}
.mx-btn.alt{background:var(--surface,#fff);color:var(--ink,#1E293B);border:2px solid var(--line,#CBD5E1);box-shadow:none}
.mx-btn.alt[aria-pressed="true"]{background:#4338CA;color:#fff;border-color:#4338CA}
.mx-btn.ok{background:#0F766E}
.mx-btn.sun{background:#FFD23F;color:#1E293B}
.mx-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%}
.mx-stbox{border-radius:14px;padding:8px 10px;background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);display:grid;gap:4px}
.mx-stbox>b{font:800 15px var(--font-display,inherit)}
.mx-stbox.u>b{color:#2563EB}.mx-stbox.v>b{color:#C2410C}
.mx-st{display:grid;grid-template-columns:18px 44px minmax(24px,1fr) 44px;align-items:center;gap:2px;font:700 14px var(--font-display,inherit)}
.mx-st button{width:44px;height:44px;border-radius:12px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font:800 20px var(--font-display,inherit);cursor:pointer;padding:0}
.mx-st button:active{background:#DBE7FF}
.mx-st output{text-align:center;font:800 18px var(--font-display,inherit)}
.mx-sl{display:grid;gap:4px;width:100%}
.mx-sl span{font:700 14px var(--font-body,inherit);display:flex;justify-content:space-between}
.mx-range{width:100%;height:44px;accent-color:#8B3DFF}
.mx-ans{display:grid;gap:8px;padding:12px 14px;border-radius:16px;background:linear-gradient(135deg,#F5EEFF,#EAF1FF);border:2px solid #C9B6FF}
.mx-ans-q{font:700 16px var(--font-display,inherit)}
.mx-ans-f{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.mx-ans-f label{display:flex;gap:6px;align-items:center;font:700 16px var(--font-display,inherit)}
.mx-ans-f .mx-in{width:76px;height:44px}
.mx-ans-b{display:flex;gap:8px;flex-wrap:wrap}
.mx-fb{min-height:24px;font-size:16px;font-weight:600;padding:2px 4px}
.mx-fb.good{color:#0F766E}.mx-fb.bad{color:#BE123C}
.mx-shake{animation:mxShake .4s}
@keyframes mxShake{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
.mx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@container (min-width:760px){
  .mx{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:start}
  .mx-m{--cw:50px;--ch:48px}
  .mx-m.act{--cw:54px}
  .mx-m.sm{--cw:36px;--ch:34px}
}
@container (max-width:430px){
  .mx-m{--cw:38px;--ch:42px;padding:6px 12px}
  .mx-m.act{--cw:46px;--ch:46px}
  .mx-m.sm{--cw:30px;--ch:30px}
  .mx-c{font-size:17px}
  .mx-steps{grid-template-columns:minmax(0,1fr)}
}
@media (prefers-reduced-motion:reduce){.mx *{animation:none!important;transition:none!important}}
`;

  // ---------------------------------------------------------------- projection (3D drawn on flat paper)
  const EL = 0.5, CE = Math.cos(EL), SE = Math.sin(EL);
  function iso(x, y, z, sc, psi) {
    const cp = Math.cos(psi), sp = Math.sin(psi), rx = x * cp - y * sp, ry = x * sp + y * cp;
    return { sx: rx * sc, sy: -(z * CE + ry * SE) * sc, d: ry };
  }
  const COL = { u: '#2563EB', v: '#FF7A1A', s: '#8B3DFF', g: '#0F766E', r: '#E11D48', k: '#64748B' };
  const L_SHAPE = [[0, 0], [1, 0], [1, 0.4], [0.4, 0.4], [0.4, 1], [0, 1]];
  const f1 = (x) => ftxt(x, 1);

  function mount(root, cfg, api) {
    const R0 = resolve(cfg), mode = cfg.mode, isMat = MATRIX_MODES.includes(mode), is3 = R0.is3;
    const uid = 'mx' + Math.random().toString(36).slice(2, 7);
    const W = (en, hi) => api.t({ en, hi });
    const E = (en, hi) => esc(W(en, hi));
    const lang = () => (api.lang ? api.lang() : 'en');
    let alive = true, lastLang = null, svg = null, form = null, workEl = null, eqEl = null, fbEl = null, ctlEl = null, stopTw = null, langTimer = 0;
    const timers = [];
    const later = (fn, ms) => { const id = setTimeout(() => { if (alive) fn(); }, ms); timers.push(id); return id; };
    const allowed = (k) => { if (api.allowed && !api.allowed(k)) { if (api.nudge) api.nudge(k); return false; } return true; };
    let evSet = new Set(), evT = 0;
    const emit = (...evs) => {
      evs.forEach((e) => evSet.add(e));
      clearTimeout(evT);
      evT = setTimeout(() => { if (!alive) return; const l = [...evSet]; evSet = new Set(); l.forEach((e) => api.emit(e)); }, 120);
    };
    const record = (s) => { if (api.record) api.record(s); };

    // ---------------------------------------------------------- state
    const S = { psi: 0.55, drag: null, rot: null, anim: 1, pi: 0 };
    const lim = limFor(mode, R0.u, R0.v);
    const hasSvg = !isMat ? true : mode === 'determinant' || (mode === 'inverse' && R0.A.length === 2) || (mode === 'matrix-multiply' && R0.A.length === 2 && R0.A[0].length === 2 && R0.B.length === 2 && R0.B[0].length === 2);
    function recalc() {
      if (mode === 'matrix-add') S.C = mAdd(S.A, S.B, S.op === 'sub' ? -1 : 1);
      else if (mode === 'matrix-multiply') S.C = mMul(S.A, S.B);
      if (S.C) S.done = S.C.map((r) => r.map(() => false));
    }
    function initState(p) {
      S.shown = false; S.msg = ''; S.kind = ''; S.sel = null; S.stage = 0; S.exp = { kind: 'row', i: 0 };
      S.cons = 'parallelogram'; S.minus = false; S.proj = true; S.area = true; S.k = 2; S.pop = ''; S.op = 'add'; S.prevDet = null;
      if (isMat) { S.A = cloneM(p.A); S.B = p.B ? cloneM(p.B) : null; recalc(); } else { S.u = p.u.slice(); S.v = p.v.slice(); }
    }
    initState(R0);
    const lam = () => F(S.k, 2);
    const nz = (n) => (is3 ? n : Math.min(n, 2));

    // ---------------------------------------------------------- words
    const TIPS = {
      'matrix-add': W('Matrices of the same size add entry by entry: each box of A + B is the box of A plus the box of B in the same place. Tap a box in the answer matrix and work it out.', 'समान आकार के आव्यूह प्रविष्टि-दर-प्रविष्टि जुड़ते हैं: A + B का हर खाना, A और B के उसी जगह के खानों का योग होता है। उत्तर वाले आव्यूह का कोई खाना दबाओ और निकालो।'),
      'matrix-multiply': W('Entry (i, j) of AB: take row i of A and column j of B, multiply pair by pair, then add. It works only when A has as many columns as B has rows.', 'AB की प्रविष्टि (i, j): A की पंक्ति i और B का स्तंभ j लो, जोड़े बनाकर गुणा करो, फिर जोड़ो। यह तभी होता है जब A के स्तंभ B की पंक्तियों के बराबर हों।'),
      determinant: W('Change any number in the box. For a 2 × 2 matrix the determinant is the signed area of the parallelogram; for 3 × 3 it is the signed volume. Expand along a row or a column: the signs go + − + − like a chessboard.', 'डिब्बे में कोई भी संख्या बदलो। 2 × 2 का सारणिक समांतर चतुर्भुज का चिह्नित क्षेत्रफल है; 3 × 3 का चिह्नित आयतन। किसी पंक्ति या स्तंभ पर प्रसार करो: चिह्न शतरंज की तरह + − + − चलते हैं।'),
      inverse: W('A⁻¹ = adj A ÷ |A|. Go step by step: minors, cofactors, adjugate, inverse. If |A| = 0 the matrix squashes the plane flat and has no inverse.', 'A⁻¹ = adj A ÷ |A|। क्रम से चलो: उपसारणिक, सहखंड, सहखंडज (एडजॉइंट), प्रतिलोम। यदि |A| = 0 तो आव्यूह तल को सपाट कर देता है और उसका प्रतिलोम नहीं होता।'),
      'vector-add': W('Drag the tips of u and v, or use the + and − buttons. Slide a copy of v to the tip of u: the arrow from the start to the end is u + v.', 'u और v के सिरे खींचो, या + और − बटन दबाओ। v की एक प्रति u के सिरे पर सरकाओ: शुरू से अंत तक का तीर u + v है।'),
      dot: W('u · v = |u| |v| cos θ = u₁v₁ + u₂v₂ + u₃v₃. Move the vectors and watch the angle. What happens to u · v when θ = 90°?', 'u · v = |u| |v| cos θ = u₁v₁ + u₂v₂ + u₃v₃। सदिशों को हिलाओ और कोण देखो। θ = 90° होने पर u · v का क्या होता है?'),
      cross: W('u × v points at right angles to both u and v (right-hand rule). Its length is the area of the parallelogram. Swap u and v: the direction flips.', 'u × v, u और v दोनों के लंबवत होता है (दायाँ हाथ नियम)। उसकी लंबाई समांतर चतुर्भुज का क्षेत्रफल है। u और v बदलो: दिशा उलट जाती है।'),
      'line-3d': W('A line is a point P plus λ times a direction b: r = P + λb. Slide λ to move along the line. With a second line you can see if they meet, run parallel or miss each other (skew).', 'रेखा = एक बिंदु P + λ गुना दिशा b: r = P + λb। λ को सरकाकर रेखा पर चलो। दूसरी रेखा हो तो देखो कि वे मिलती हैं, समांतर हैं या एक-दूसरे को छूती नहीं (विषमतलीय)।'),
    };
    const NAMES = {
      'matrix-add': W('Matrix sum and difference', 'आव्यूह का योग और अंतर'), 'matrix-multiply': W('Matrix product', 'आव्यूहों का गुणनफल'),
      determinant: W('Determinant', 'सारणिक'), inverse: W('Inverse of a matrix', 'आव्यूह का प्रतिलोम'), 'vector-add': W('Adding vectors', 'सदिशों का योग'),
      dot: W('Dot product', 'अदिश गुणनफल'), cross: W('Cross product', 'सदिश गुणनफल'), 'line-3d': W('A line in 3D', 'त्रिविमीय रेखा'),
    };
    const setMsg = (text, kind) => { S.msg = text; S.kind = kind || ''; if (fbEl) { fbEl.textContent = text; fbEl.className = 'mx-fb ' + (kind || ''); } };
    const shake = (el) => { if (!el) return; el.classList.remove('mx-shake'); void el.offsetWidth; el.classList.add('mx-shake'); };

    // ---------------------------------------------------------- matrix pieces (HTML)
    function mgrid(M, cell, cls, label) {
      let h = `<div class="mx-m ${cls || ''}" style="--r:${M.length};--c:${M[0].length}" role="group" aria-label="${esc(label || '')}">`;
      for (let r = 0; r < M.length; r++) for (let c = 0; c < M[0].length; c++) h += cell(r, c, M[r][c]);
      return h + '</div>';
    }
    const plain = (r, c, v) => `<span class="mx-c">${fh(v)}</span>`;
    const mini = (M, cls) => mgrid(M, plain, 'sm ' + (cls || ''), '');
    const dimTxt = (M) => M.length + ' × ' + M[0].length;
    const blk = (cap, dim, inner) => `<div class="mx-blk"><div class="mx-cap">${cap}${dim ? ` <small>${dim}</small>` : ''}</div>${inner}</div>`;
    const q = (txt) => `<span class="mx-q">${txt == null ? '?' : txt}</span>`;
    const val = (f) => (S.shown ? `<b>${esc(fs(f))}</b>` : q());

    function drawEq() {
      if (!eqEl) return;
      if (mode === 'matrix-add' || mode === 'matrix-multiply') {
        const s = S.sel, add = mode === 'matrix-add';
        const hl = (who, r, c) => {
          if (!s) return '';
          if (add) return r === s[0] && c === s[1] ? (who === 'A' ? ' hl-a' : ' hl-b') : '';
          return who === 'A' ? (r === s[0] ? ' hl-a' : '') : c === s[1] ? ' hl-b' : '';
        };
        const ga = mgrid(S.A, (r, c, v) => `<span class="mx-c${hl('A', r, c)}">${fh(v)}</span>`, 'ma', 'A');
        const gb = mgrid(S.B, (r, c, v) => `<span class="mx-c${hl('B', r, c)}">${fh(v)}</span>`, 'mb', 'B');
        const gc = mgrid(S.C, (r, c, v) => {
          const d = S.done[r][c], on = s && s[0] === r && s[1] === c;
          const nm = W(`Row ${r + 1}, column ${c + 1} of the answer`, `उत्तर की पंक्ति ${r + 1}, स्तंभ ${c + 1}`);
          return `<button type="button" class="mx-c mx-res${on ? ' sel' : ''}${d ? ' done' : ''}${S.pop === r + '-' + c ? ' mx-pop' : ''}" data-key="cell:${r + 1}-${c + 1}" data-r="${r}" data-c="${c}" aria-pressed="${!!on}" aria-label="${esc(nm + ': ' + (d ? fs(v) : W('not found yet', 'अभी निकाला नहीं')))}">${d ? fh(v) : '?'}</button>`;
        }, 'mc act', 'C');
        const sym = add ? (S.op === 'sub' ? MINUS : '+') : '×';
        const cname = add ? (S.op === 'sub' ? 'A − B' : 'A + B') : 'A B';
        eqEl.innerHTML = blk('A', dimTxt(S.A), ga) + `<span class="mx-op" aria-hidden="true">${sym}</span>` + blk('B', dimTxt(S.B), gb) + '<span class="mx-op" aria-hidden="true">=</span>' + blk(cname, dimTxt(S.C), gc);
      } else if (mode === 'determinant' || mode === 'inverse') {
        const ex = S.exp, det_ = mode === 'determinant';
        const g = mgrid(S.A, (r, c, v) => {
          const hl = det_ && ((ex.kind === 'row' && r === ex.i) || (ex.kind === 'col' && c === ex.i)) ? ' rowhl' : '';
          return `<input class="mx-in${hl}" type="text" inputmode="text" autocomplete="off" data-key="cell:${r + 1}-${c + 1}" data-r="${r}" data-c="${c}" value="${esc(fs(v))}" aria-label="${esc(W(`Row ${r + 1}, column ${c + 1} of A`, `A की पंक्ति ${r + 1}, स्तंभ ${c + 1}`))}">`;
        }, (det_ ? 'bar ' : '') + 'ma act', 'A');
        eqEl.innerHTML = blk(det_ ? '|A|' : 'A', dimTxt(S.A), g);
      } else eqEl.innerHTML = '';
    }

    // ---------------------------------------------------------- the working panel
    const NOTHING = '<span class="mx-hint">—</span>';
    function workMatrix() {
      if (!S.sel) return `<p class="mx-hint">${E('Tap a box in the answer matrix.', 'उत्तर वाले आव्यूह का कोई खाना दबाओ।')}</p>`;
      const [r, c] = S.sel, d = S.done[r][c], add = mode === 'matrix-add';
      let h = `<div class="mx-wt">${add ? E(`Row ${r + 1}, column ${c + 1}: add the two numbers in that place`, `पंक्ति ${r + 1}, स्तंभ ${c + 1}: उस जगह की दोनों संख्याएँ जोड़ो`) : E(`Row ${r + 1} of A with column ${c + 1} of B: multiply the pairs, then add`, `A की पंक्ति ${r + 1} और B का स्तंभ ${c + 1}: जोड़े गुणा करो, फिर जोड़ो`)}</div>`;
      const res = d ? `<b class="mx-s">${esc(fs(S.C[r][c]))}</b>` : q();
      if (add) h += `<div class="mx-line"><span class="mx-t a">${esc(pn(S.A[r][c]))}</span> ${S.op === 'sub' ? MINUS : '+'} <span class="mx-t b">${esc(pn(S.B[r][c]))}</span> = ${res}</div>`;
      else h += `<div class="mx-line">${S.A[r].map((x, k) => `<span class="mx-tm">(<b class="a">${esc(pn(x))}</b> × <b class="b">${esc(pn(S.B[k][c]))}</b>)</span>`).join(' + ')} = ${res}</div>`;
      if (!add) h += `<div class="mx-hint">(${dimTxt(S.A)}) × (${dimTxt(S.B)}) ${E('gives', 'से बनता है')} ${dimTxt(S.C)}</div>`;
      return h;
    }
    function miniBar(M) { return mgrid(M, plain, 'sm bar mg', ''); }
    function workDet() {
      const A = S.A, n = A.length, ex = expansion(A, S.exp.kind, S.exp.i), total = det(A);
      const kt = S.exp.kind === 'row' ? W('row', 'पंक्ति') : W('column', 'स्तंभ');
      let h = `<div class="mx-wt">${E('Expanding along', 'इस पर प्रसार')} ${esc(kt)} ${S.exp.i + 1}: ${E('sign × number × minor', 'चिह्न × संख्या × उपसारणिक')}</div><div class="mx-cards">`;
      ex.forEach((t) => {
        h += `<div class="mx-card${fzero(t.a) ? ' zero' : ''}"><span class="sg ${t.s.n > 0 ? 'p' : 'm'}" aria-label="${esc(W('sign', 'चिह्न'))} ${t.s.n > 0 ? '+' : MINUS}">${t.s.n > 0 ? '+' : MINUS}</span><span>${esc(pn(t.a))}</span><span>×</span>${miniBar(minorM(A, t.i, t.j))}<span>=</span><b>${esc(fs(t.val))}</b></div>`;
      });
      h += '</div>';
      h += `<div class="mx-line">|A| = ${ex.map((t) => esc(pn(t.val))).join(' + ')} = ${val(total)}</div>`;
      if (n === 2) h += `<div class="mx-hint">ad − bc = ${esc(pn(A[0][0]))}×${esc(pn(A[1][1]))} − ${esc(pn(A[0][1]))}×${esc(pn(A[1][0]))}</div>`;
      if (S.prop) h += `<div class="mx-hint">${esc(S.prop)}</div>`;
      return h;
    }
    function workInverse() {
      const A = S.A, d = det(A), n = A.length;
      let h = `<div class="mx-line">|A| = ${val(d)}</div>`;
      const stages = [];
      if (S.stage >= 1) stages.push(blk(W('Minors', 'उपसारणिक'), '', mini(minorsM(A), 'mb')));
      if (S.stage >= 2) stages.push(blk(W('Cofactors', 'सहखंड'), '', mini(cofM(A), 'mc')));
      if (S.stage >= 3) stages.push(blk(W('Adjugate (flip over the diagonal)', 'सहखंडज (विकर्ण पर पलटो)'), '', mini(adjM(A), 'mg')));
      if (S.stage >= 1) h += `<div class="mx-stg">${stages.join('<span class="mx-op" aria-hidden="true">→</span>')}</div>`;
      if (S.stage >= 4) {
        if (fzero(d)) h += `<div class="mx-line mx-r"><b>|A| = 0</b>: ${E('A has no inverse (it is singular).', 'A का प्रतिलोम नहीं है (यह अव्युत्क्रमणीय है)।')}</div>`;
        else {
          const inv = invM(A), prod = mMul(A, inv);
          h += `<div class="mx-line">A⁻¹ = (1 ÷ ${esc(pn(d))}) × adj A</div><div class="mx-stg">${blk('A⁻¹', '', mini(inv, 'ma'))}<span class="mx-op" aria-hidden="true">✓</span>${blk('A × A⁻¹', '', mini(prod, 'mg'))}<span class="mx-hint">= I (${n} × ${n})</span></div>`;
        }
      } else if (S.stage === 0) h += `<p class="mx-hint">${E('Press Minors to start.', 'शुरू करने के लिए उपसारणिक दबाओ।')}</p>`;
      return h;
    }
    function readVec(name, v, n, cls) { return `<div class="mx-line"><b class="${cls}">${name}</b> = ${esc(vtxt(v, n))}</div>`; }
    function workVec() {
      const n = nz(3), u = S.u, v = S.v;
      const hid = (arr) => (S.shown ? esc(vtxt(arr, n)) : '(' + Array.from({ length: n }, () => q()).join(', ') + ')');
      let h = '<div class="mx-rd">';
      if (mode === 'vector-add') {
        const w = vadd(u, v, S.minus ? -1 : 1);
        h += readVec('u', u, n, 'mx-u') + readVec('v', v, n, 'mx-v');
        h += `<div class="mx-line"><b class="mx-s">${S.minus ? 'u − v' : 'u + v'}</b> = ${hid(w)}</div>`;
        if (S.shown) h += `<div class="mx-hint">${u.slice(0, n).map((x, i) => `${pn(F(x))} ${S.minus ? MINUS : '+'} ${pn(F(v[i]))}`).join(', ')}</div>`;
        h += `<div class="mx-hint">${E('Tip to tail: v starts where u ends.', 'सिरा-से-पूँछ: v वहाँ से शुरू होता है जहाँ u खत्म होता है।')}</div>`;
      } else if (mode === 'dot') {
        const ang = angleDeg(u, v), d = dot3(u, v);
        h += readVec('u', u, n, 'mx-u') + readVec('v', v, n, 'mx-v');
        h += `<div class="mx-line">|u| = ${esc(rtxt(len2(u)))} &nbsp; |v| = ${esc(rtxt(len2(v)))}</div>`;
        if (ang == null) h += `<div class="mx-line mx-r">${E('One vector is zero, so there is no angle.', 'एक सदिश शून्य है, इसलिए कोण नहीं बनता।')}</div>`;
        else h += `<div class="mx-line">θ = <b class="mx-g">${f1(ang)}°</b>${d === 0 ? ` &nbsp; <b class="mx-g">${E('at right angles', 'समकोण')}</b>` : ''}</div>`;
        h += `<div class="mx-line"><b class="mx-s">u · v</b> = ${S.shown ? '<b>' + String(d).replace('-', MINUS) + '</b>' : q()}</div>`;
        if (S.shown) h += `<div class="mx-hint">${u.slice(0, n).map((x, i) => `${pn(F(x))}×${pn(F(v[i]))}`).join(' + ')}${ang != null ? ` &nbsp; (|u||v| cos θ = ${esc(rtxt(len2(u)))} × ${esc(rtxt(len2(v)))} × ${ftxt(Math.cos((ang * Math.PI) / 180), 3)})` : ''}</div>`;
        h += `<div class="mx-hint">${d > 0 ? E('Angle under 90°: u · v is positive.', '90° से कम कोण: u · v धनात्मक है।') : d < 0 ? E('Angle over 90°: u · v is negative.', '90° से अधिक कोण: u · v ऋणात्मक है।') : E('u · v = 0 only when the vectors are perpendicular (or one is zero).', 'u · v = 0 तभी जब सदिश लंबवत हों (या एक शून्य हो)।')}</div>`;
      } else if (mode === 'cross') {
        const w = cross3(u, v);
        h += readVec('u', u, 3, 'mx-u') + readVec('v', v, 3, 'mx-v');
        h += `<div class="mx-line"><b class="mx-g">u × v</b> = ${hid(w)}</div>`;
        if (S.shown) {
          h += `<div class="mx-hint">(u₂v₃ − u₃v₂, u₃v₁ − u₁v₃, u₁v₂ − u₂v₁)</div>`;
          h += `<div class="mx-line">|u × v| = ${esc(rtxt(len2(w)))}${len2(w) ? ' ≈ ' + f1(Math.sqrt(len2(w))) : ''} = ${E('area of the parallelogram', 'समांतर चतुर्भुज का क्षेत्रफल')}</div>`;
          if (isZeroV(w)) h += `<div class="mx-line mx-r">${E('The zero vector: u and v are parallel, so there is no area.', 'शून्य सदिश: u और v समांतर हैं, इसलिए क्षेत्रफल नहीं बनता।')}</div>`;
          h += `<div class="mx-hint">${E('Check: (u × v) · u = ', 'जाँच: (u × v) · u = ')}${dot3(w, u)}, (u × v) · v = ${dot3(w, v)}</div>`;
        }
      } else {
        const l = lam(), P = u, b = v, pt = P.map((x, i) => fadd(F(x), fmul(l, F(b[i]))));
        h += `<div class="mx-line"><b>r</b> = ${esc(vtxt(P, 3))} + λ ${esc(vtxt(b, 3))}</div>`;
        h += `<div class="mx-line">λ = <b class="mx-s">${esc(fs(l))}</b> &nbsp; ${E('point', 'बिंदु')} = ${S.shown ? '(' + pt.map((x) => '<b>' + esc(fs(x)) + '</b>').join(', ') + ')' : '(' + q() + ', ' + q() + ', ' + q() + ')'}</div>`;
        h += `<div class="mx-hint">${E('Direction ratios', 'दिक् अनुपात')}: ${b.join(' : ').replace(/-/g, MINUS)} &nbsp; ${E('length', 'लंबाई')} |b| = ${esc(rtxt(len2(b)))}</div>`;
        if (R0.L2) {
          const rel = lineRelation(P, b, R0.L2[0], R0.L2[1]);
          h += `<div class="mx-line"><b class="mx-r">${E('Second line', 'दूसरी रेखा')}</b>: ${esc(vtxt(R0.L2[0], 3))} + μ ${esc(vtxt(R0.L2[1], 3))}</div>`;
          const kinds = {
            same: W('The two lines are the same line.', 'दोनों रेखाएँ एक ही रेखा हैं।'),
            parallel: W('The lines are parallel.', 'रेखाएँ समांतर हैं।'),
            meet: W('The lines meet in one point.', 'रेखाएँ एक बिंदु पर मिलती हैं।'),
            skew: W('The lines are skew: they never meet and are not parallel.', 'रेखाएँ विषमतलीय हैं: न मिलती हैं, न समांतर हैं।'),
          };
          h += `<div class="mx-line"><b>${esc(kinds[rel.kind])}</b></div>`;
          if (S.shown) {
            if (rel.kind === 'skew') h += `<div class="mx-line">${E('Shortest distance', 'न्यूनतम दूरी')} = |(a₂ − a₁) · (b₁ × b₂)| ÷ |b₁ × b₂| = ${rel.num} ÷ ${esc(rtxt(rel.den))} ≈ <b>${f1(rel.num / Math.sqrt(rel.den))}</b></div>`;
            if (rel.kind === 'parallel') h += `<div class="mx-line">${E('Distance between them', 'उनके बीच की दूरी')} = |(a₂ − a₁) × b| ÷ |b| = √(${rel.num}/${rel.den}) ≈ <b>${f1(Math.sqrt(rel.num / rel.den))}</b></div>`;
            if (rel.kind === 'meet') h += `<div class="mx-line">${E('Meeting point at λ =', 'मिलन बिंदु λ =')} <b>${esc(fs(rel.lam))}</b>: (${P.map((x, i) => '<b>' + esc(fs(fadd(F(x), fmul(rel.lam, F(b[i]))))) + '</b>').join(', ')})</div>`;
            if (rel.ang != null) h += `<div class="mx-hint">${E('Angle between the lines', 'रेखाओं के बीच का कोण')}: ${f1(rel.ang)}°</div>`;
          }
        }
      }
      return h + '</div>';
    }
    function drawWork() {
      if (!workEl) return;
      workEl.innerHTML = mode === 'matrix-add' || mode === 'matrix-multiply' ? workMatrix() : mode === 'determinant' ? workDet() : mode === 'inverse' ? workInverse() : workVec();
    }

    // ---------------------------------------------------------- the picture
    const VW = 400, VH = 360;
    const CX = 200, CY = is3 ? 196 : 180, SC = (is3 ? 122 : 165) / (lim ? lim.R : 1), RV = lim ? lim.R : 1;
    const P = (x, y, z) => { if (!is3) return [CX + x * SC, CY - y * SC]; const o = iso(x, y, z || 0, SC, S.psi); return [CX + o.sx, CY + o.sy]; };
    const ln = (a, b, col, w, dash, op) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}${op != null ? ` opacity="${op}"` : ''} stroke-linecap="round"/>`;
    function head(a, b, col, w, op) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      if (l < 3) return '';
      const ux = dx / l, uy = dy / l, hs = Math.min(5 + w * 2.2, l * 0.6);
      const bx = b[0] - ux * hs, by = b[1] - uy * hs;
      return `<polygon points="${b[0].toFixed(1)},${b[1].toFixed(1)} ${(bx - uy * hs * 0.45).toFixed(1)},${(by + ux * hs * 0.45).toFixed(1)} ${(bx + uy * hs * 0.45).toFixed(1)},${(by - ux * hs * 0.45).toFixed(1)}" fill="${col}"${op != null ? ` opacity="${op}"` : ''}/>`;
    }
    const arrS = (a, b, col, w, dash, op) => ln(a, b, col, w, dash, op) + head(a, b, col, w, op);
    const arrW = (a, b, col, w, dash, op) => arrS(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), col, w, dash, op);
    const txt = (p, s, col, size, anchor) => `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" fill="${col}" font-size="${size || 15}" font-weight="800" text-anchor="${anchor || 'middle'}" paint-order="stroke" stroke="#F8FAFF" stroke-width="4" stroke-linejoin="round">${esc(s)}</text>`;
    const polyS = (pts, fill, fop, stroke, w) => `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${fill}" fill-opacity="${fop}" stroke="${stroke || 'none'}" stroke-width="${w || 1.5}" stroke-linejoin="round"/>`;
    // a label placed just beyond a tip, away from the origin
    function tipLabel(tipW, s, col, from) {
      const t = P(tipW[0], tipW[1], tipW[2]), o = from ? P(from[0], from[1], from[2]) : P(0, 0, 0);
      let dx = t[0] - o[0], dy = t[1] - o[1]; const l = Math.hypot(dx, dy) || 1;
      return txt([t[0] + (dx / l) * 18, t[1] + (dy / l) * 18 + 5], s, col, 16);
    }
    function sceneGrid() {
      let s = '';
      if (!is3) {
        for (let k = -RV; k <= RV; k++) s += ln(P(k, -RV), P(k, RV), k % 5 === 0 ? '#BAC6EC' : '#E2E8F8', 1) + ln(P(-RV, k), P(RV, k), k % 5 === 0 ? '#BAC6EC' : '#E2E8F8', 1);
        s += arrS(P(-RV, 0), P(RV, 0), '#475569', 2) + arrS(P(0, -RV), P(0, RV), '#475569', 2);
        const st = RV > 8 ? 2 : 1;
        for (let k = -RV + 1; k < RV; k++) if (k && k % st === 0) s += `<text x="${P(k, 0)[0].toFixed(1)}" y="${(CY + 13).toFixed(1)}" font-size="9" fill="#64748B" text-anchor="middle">${k < 0 ? MINUS : ''}${Math.abs(k)}</text><text x="${(CX - 5).toFixed(1)}" y="${(P(0, k)[1] + 3).toFixed(1)}" font-size="9" fill="#64748B" text-anchor="end">${k < 0 ? MINUS : ''}${Math.abs(k)}</text>`;
        s += txt([P(RV, 0)[0] - 8, CY - 8], 'x', '#475569', 13) + txt([CX + 12, P(0, RV)[1] + 12], 'y', '#475569', 13);
      } else {
        const st = RV > 8 ? 2 : 1;
        for (let k = -RV; k <= RV; k += st) s += ln(P(k, -RV, 0), P(k, RV, 0), '#DDE4F7', 1) + ln(P(-RV, k, 0), P(RV, k, 0), '#DDE4F7', 1);
        s += polyS([P(-RV, -RV, 0), P(RV, -RV, 0), P(RV, RV, 0), P(-RV, RV, 0)], '#C7D2FE', 0.18, '#9AA9DE', 1.5);
        s += ln(P(0, 0, -RV), P(0, 0, 0), '#94A3B8', 1.5) + arrS(P(-RV, 0, 0), P(RV, 0, 0), '#475569', 1.8) + arrS(P(0, -RV, 0), P(0, RV, 0), '#475569', 1.8) + arrS(P(0, 0, 0), P(0, 0, RV), '#475569', 1.8);
        s += txt(P(RV + 0.9, 0, 0), 'x', '#475569', 13) + txt(P(0, RV + 0.9, 0), 'y', '#475569', 13) + txt(P(0, 0, RV + 0.9), 'z', '#475569', 13);
      }
      return s;
    }
    function dropLine(w, col) { return is3 ? ln(P(w[0], w[1], w[2]), P(w[0], w[1], 0), col, 1.2, '3 4', 0.75) + ln(P(w[0], w[1], 0), P(0, 0, 0), col, 1, '3 4', 0.45) : ''; }
    function handle(which, tipW, col, label) {
      const p = P(tipW[0], tipW[1], tipW[2]);
      return `<g class="mx-h" data-drag="${which}" data-key="drag:${which}" role="button" tabindex="0" aria-label="${esc(label)}" transform="translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})"><circle r="22" fill="transparent"/><circle r="8" fill="${col}" stroke="#fff" stroke-width="2.5"/></g>`;
    }
    const orgOf = (which) => (mode === 'line-3d' && which === 'v' ? S.u : [0, 0, 0]);
    const tipOf = (which) => vadd(orgOf(which), S[which], 1);
    const hlabel = (which) => {
      const nm = mode === 'line-3d' ? (which === 'u' ? W('point P', 'बिंदु P') : W('direction b', 'दिशा b')) : which;
      return `${nm} = ${vtxt(S[which], nz(3))}. ${W('Drag, or use the arrow keys.', 'खींचो, या तीर कुंजियाँ दबाओ।')}`;
    };
    function arcPts(u, v, r) {
      const a = Math.sqrt(len2(u)), b = Math.sqrt(len2(v));
      if (!a || !b) return null;
      const uh = u.map((x) => x / a), vh = v.map((x) => x / b), th = Math.acos(Math.max(-1, Math.min(1, dot3(uh, vh))));
      if (th < 0.02 || Math.abs(Math.PI - th) < 0.02) return null;
      const out = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, k1 = Math.sin((1 - t) * th) / Math.sin(th), k2 = Math.sin(t * th) / Math.sin(th); out.push([0, 1, 2].map((j) => r * (k1 * uh[j] + k2 * vh[j]))); }
      return out;
    }
    function sceneVec() {
      let s = sceneGrid();
      const u = S.u, v = S.v;
      if (mode === 'vector-add') {
        const w = S.minus ? v.map((x) => -x) : v, sum = vadd(u, w, 1), a = S.anim, uo = u.map((x) => x * a);
        const tail = vadd(uo, w, 1);
        if (S.cons === 'parallelogram') s += arrW(w.map((x) => x * a), vadd(w.map((x) => x * a), u, 1), COL.u, 2, '5 5', 0.55);
        s += dropLine(sum, COL.s);
        s += arrW([0, 0, 0], sum, COL.s, 5, null, 1);
        if (S.minus) s += arrW([0, 0, 0], w, COL.v, 2.5, '6 5', 0.7);
        s += arrW(uo, tail, COL.v, 2.5, '5 5', 0.6);
        s += arrW([0, 0, 0], u, COL.u, 4) + arrW([0, 0, 0], v, COL.v, 4);
        s += dropLine(u, COL.u) + dropLine(v, COL.v);
        s += tipLabel(sum, S.minus ? 'u − v' : 'u + v', COL.s) + tipLabel(u, 'u', COL.u) + tipLabel(v, 'v', COL.v);
        if (S.shown) s += txt([VW / 2, 16], (S.minus ? 'u − v = ' : 'u + v = ') + vtxt(sum, nz(3)), COL.s, 16);
        s += handle('u', u, COL.u, hlabel('u')) + handle('v', v, COL.v, hlabel('v'));
      } else if (mode === 'dot') {
        const ang = angleDeg(u, v), d = dot3(u, v), vv = len2(v);
        if (S.proj && vv) {
          const k = d / vv, p = v.map((x) => x * k);
          s += ln(P(u[0], u[1], u[2]), P(p[0], p[1], p[2]), COL.g, 2, '5 4', 0.9) + arrW([0, 0, 0], p, COL.g, 8, null, 0.45);
          s += txt(P(p[0] / 2, p[1] / 2, p[2] / 2).map((x, i) => x + (i ? 20 : 0)), W('shadow of u on v', 'v पर u की छाया'), COL.g, 11);
        }
        s += arrW([0, 0, 0], u, COL.u, 4) + arrW([0, 0, 0], v, COL.v, 4) + dropLine(u, COL.u) + dropLine(v, COL.v);
        const r = Math.max(0.9, Math.min(Math.sqrt(len2(u)), Math.sqrt(vv), RV / 2.5) * 0.45), arc = arcPts(u, v, r);
        if (arc) {
          if (d === 0) { const a = Math.sqrt(len2(u)), b = Math.sqrt(vv), rr = r * 0.7, e1 = u.map((x) => (x / a) * rr), e2 = v.map((x) => (x / b) * rr); s += polyS([P(0, 0, 0), P(e1[0], e1[1], e1[2]), P(e1[0] + e2[0], e1[1] + e2[1], e1[2] + e2[2]), P(e2[0], e2[1], e2[2])], COL.g, 0.25, COL.g, 2); }
          else s += `<polyline points="${arc.map((p) => P(p[0], p[1], p[2]).map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#BE123C" stroke-width="3" stroke-linecap="round"/>`;
          const mid = arc[12], pm = P(mid[0] * 1.5, mid[1] * 1.5, mid[2] * 1.5);
          s += txt([pm[0], pm[1] + 4], f1(ang) + '°', '#BE123C', 14);
        }
        s += tipLabel(u, 'u', COL.u) + tipLabel(v, 'v', COL.v) + handle('u', u, COL.u, hlabel('u')) + handle('v', v, COL.v, hlabel('v'));
      } else if (mode === 'cross') {
        const w = cross3(u, v), uv = vadd(u, v, 1);
        s += polyS([P(0, 0, 0), P(u[0], u[1], u[2]), P(uv[0], uv[1], uv[2]), P(v[0], v[1], v[2])], COL.g, S.area ? 0.3 : 0.08, COL.g, S.area ? 2 : 1);
        const m = Math.sqrt(len2(w)), k = m > 0 ? Math.min(1, (RV * 0.85) / m) : 0, ws = w.map((x) => x * k);
        if (m > 0) {
          s += arrW([0, 0, 0], ws, COL.g, 5);
          s += tipLabel(ws, 'u × v', COL.g);
          if (k < 1) s += txt([VW / 2, VH - 10], W('The arrow u × v is drawn shorter than its true length.', 'तीर u × v को असली लंबाई से छोटा बनाया गया है।'), '#64748B', 11);
        } else s += txt([VW / 2, 24], W('u × v = 0: the vectors are parallel', 'u × v = 0: सदिश समांतर हैं'), COL.r, 15);
        s += arrW([0, 0, 0], u, COL.u, 4) + arrW([0, 0, 0], v, COL.v, 4) + dropLine(u, COL.u) + dropLine(v, COL.v);
        s += tipLabel(u, 'u', COL.u) + tipLabel(v, 'v', COL.v);
        s += handle('u', u, COL.u, hlabel('u')) + handle('v', v, COL.v, hlabel('v'));
      } else {
        const d = v, P1 = u;
        const clip = (p, b) => {
          let t0 = -1e9, t1 = 1e9;
          for (let i = 0; i < 3; i++) {
            if (b[i] === 0) { if (Math.abs(p[i]) > RV) return null; continue; }
            const a = (-RV - p[i]) / b[i], c = (RV - p[i]) / b[i];
            t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
          }
          return t0 <= t1 ? [t0, t1] : null;
        };
        const seg = (p, b, col, w) => { const c = clip(p, b); if (!c) return ''; const A = p.map((x, i) => x + c[0] * b[i]), B = p.map((x, i) => x + c[1] * b[i]); return arrW(A, B, col, w, null, 0.9); };
        let n2 = null;
        if (R0.L2) {
          const [p2, b2] = R0.L2;
          s += seg(p2, b2, COL.r, 3);
          const nr = nearest(P1, d, p2, b2), pa = P1.map((x, i) => x + nr.l * d[i]), pb = p2.map((x, i) => x + nr.m * b2[i]);
          const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
          if (gap > 1e-6) s += ln(P(pa[0], pa[1], pa[2]), P(pb[0], pb[1], pb[2]), COL.g, 2.5, '4 4');
          n2 = p2;
          s += `<circle cx="${P(p2[0], p2[1], p2[2])[0].toFixed(1)}" cy="${P(p2[0], p2[1], p2[2])[1].toFixed(1)}" r="5" fill="${COL.r}" stroke="#fff" stroke-width="2"/>`;
        }
        s += seg(P1, d, COL.u, 3.5);
        const l = fnum(lam()), pt = P1.map((x, i) => x + l * d[i]);
        s += dropLine(P1, COL.u) + arrW(P1, vadd(P1, d, 1), COL.v, 3.5);
        const pp = P(pt[0], pt[1], pt[2]);
        s += `<circle cx="${pp[0].toFixed(1)}" cy="${pp[1].toFixed(1)}" r="8" fill="${COL.s}" stroke="#fff" stroke-width="3"/>` + txt([pp[0], pp[1] - 14], 'λ = ' + fs(lam()), COL.s, 13);
        s += tipLabel(vadd(P1, d, 1), 'b', COL.v, P1) + txt(P(P1[0], P1[1], P1[2]).map((x, i) => x + (i ? 20 : -14)), 'P', COL.u, 15);
        s += handle('u', P1, COL.u, hlabel('u')) + handle('v', vadd(P1, d, 1), COL.v, hlabel('v'));
      }
      return s;
    }
    // flat transformation pictures (2 x 2 matrices acting on a shape)
    function affineScene(items, gridM, note) {
      let R = 2; items.forEach((it) => it.pts.forEach((p) => { R = Math.max(R, Math.abs(p[0]), Math.abs(p[1])); })); R = Math.ceil(R) + 1;
      const sc = 160 / R, X = (x) => CX + x * sc, Y = (y) => 180 - y * sc, id = uid + 'c';
      let s = `<defs><clipPath id="${id}"><rect x="${CX - 168}" y="6" width="336" height="348" rx="10"/></clipPath></defs>`;
      const st = R > 12 ? 5 : R > 7 ? 2 : 1;
      for (let k = -R; k <= R; k += st) s += `<line x1="${X(k)}" y1="${Y(-R)}" x2="${X(k)}" y2="${Y(R)}" stroke="#E2E8F8"/><line x1="${X(-R)}" y1="${Y(k)}" x2="${X(R)}" y2="${Y(k)}" stroke="#E2E8F8"/>`;
      s += `<line x1="${X(-R)}" y1="${Y(0)}" x2="${X(R)}" y2="${Y(0)}" stroke="#64748B" stroke-width="1.8"/><line x1="${X(0)}" y1="${Y(-R)}" x2="${X(0)}" y2="${Y(R)}" stroke="#64748B" stroke-width="1.8"/>`;
      if (gridM) {
        gridM = gridM.map((r) => r.map(fnum));
        s += `<g clip-path="url(#${id})" opacity="0.3">`;
        for (let k = -12; k <= 12; k++) {
          const a = [gridM[0][0] * k - gridM[0][1] * 12, gridM[1][0] * k - gridM[1][1] * 12], b = [gridM[0][0] * k + gridM[0][1] * 12, gridM[1][0] * k + gridM[1][1] * 12];
          const c = [gridM[0][0] * -12 + gridM[0][1] * k, gridM[1][0] * -12 + gridM[1][1] * k], d = [gridM[0][0] * 12 + gridM[0][1] * k, gridM[1][0] * 12 + gridM[1][1] * k];
          s += `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="#818CF8" stroke-width="${k === 0 ? 1.6 : 1}"/><line x1="${X(c[0])}" y1="${Y(c[1])}" x2="${X(d[0])}" y2="${Y(d[1])}" stroke="#818CF8" stroke-width="${k === 0 ? 1.6 : 1}"/>`;
        }
        s += '</g>';
      }
      items.forEach((it) => {
        s += `<polygon points="${it.pts.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}" fill="${it.fill || 'none'}" fill-opacity="${it.fop || 0.4}" stroke="${it.stroke}" stroke-width="${it.w || 2.5}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''} stroke-linejoin="round"/>`;
        if (it.label) s += txt([X(it.lx), Y(it.ly)], it.label, it.stroke, 13);
      });
      (note || []).forEach((n) => { s += arrS([X(0), Y(0)], [X(n.to[0]), Y(n.to[1])], n.col, 3.2) + (n.label ? txt([X(n.to[0]) + 8, Y(n.to[1]) - 8], n.label, n.col, 13) : ''); });
      return s;
    }
    const applyM = (M, pts) => pts.map((p) => [fnum(M[0][0]) * p[0] + fnum(M[0][1]) * p[1], fnum(M[1][0]) * p[0] + fnum(M[1][1]) * p[1]]);
    const SQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
    function sceneDet() {
      const A = S.A, d = det(A);
      if (A.length === 2) {
        const pts = applyM(A, SQ), pos = fnum(d) > 0, zero = fzero(d), col = zero ? '#64748B' : pos ? '#4338CA' : '#E11D48';
        const cen = [(pts[2][0] + pts[0][0]) / 2, (pts[2][1] + pts[0][1]) / 2];
        return affineScene([
          { pts: SQ, stroke: '#94A3B8', dash: '5 4', w: 2 },
          { pts, fill: col, fop: 0.38, stroke: col, w: 3, label: S.shown ? (zero ? '0' : fs(d)) : '', lx: cen[0], ly: cen[1] },
        ], A, [{ to: [fnum(A[0][0]), fnum(A[1][0])], col: COL.u, label: 'c₁' }, { to: [fnum(A[0][1]), fnum(A[1][1])], col: COL.v, label: 'c₂' }])
          + txt([CX, 22], zero ? W('Flat: area 0, so determinant 0', 'सपाट: क्षेत्रफल 0, इसलिए सारणिक 0') : pos ? W('Counter-clockwise: determinant is positive', 'वामावर्त: सारणिक धनात्मक') : W('Flipped over: determinant is negative', 'पलटा हुआ: सारणिक ऋणात्मक'), col, 13);
      }
      // 3 x 3: the box spanned by the three columns
      const cols = [0, 1, 2].map((j) => A.map((r) => fnum(r[j]))), psi = 0.6;
      const vert = (i, j, k) => [0, 1, 2].map((t) => i * cols[0][t] + j * cols[1][t] + k * cols[2][t]);
      let m = 1; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) vert(i, j, k).forEach((x) => { m = Math.max(m, Math.abs(x)); });
      const sc = 150 / m, pr = (p) => iso(p[0], p[1], p[2], sc, psi);
      const all = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) all.push(pr(vert(i, j, k)));
      const mx = (Math.max(...all.map((p) => p.sx)) + Math.min(...all.map((p) => p.sx))) / 2, my = (Math.max(...all.map((p) => p.sy)) + Math.min(...all.map((p) => p.sy))) / 2;
      const S2 = (p) => { const o = pr(p); return [CX + o.sx - mx, 180 + o.sy - my]; };
      const faces = [];
      for (let t = 0; t < 2; t++) {
        faces.push({ a: 0, vs: [vert(t, 0, 0), vert(t, 1, 0), vert(t, 1, 1), vert(t, 0, 1)] }, { a: 1, vs: [vert(0, t, 0), vert(1, t, 0), vert(1, t, 1), vert(0, t, 1)] }, { a: 2, vs: [vert(0, 0, t), vert(1, 0, t), vert(1, 1, t), vert(0, 1, t)] });
      }
      faces.forEach((f) => { f.dp = f.vs.reduce((a, p) => a + pr(p).d, 0) / 4; });
      faces.sort((a, b) => b.dp - a.dp);
      const base = fzero(d) ? '#64748B' : fnum(d) > 0 ? '#4338CA' : '#E11D48', tints = [COL.u, COL.v, COL.g];
      let s = `<rect x="0" y="0" width="${VW}" height="${VH}" fill="none"/>`;
      faces.forEach((f) => { s += polyS(f.vs.map(S2), base, 0.16, base, 1.5) + polyS(f.vs.map(S2), tints[f.a], 0.12, 'none'); });
      const o = S2([0, 0, 0]);
      [0, 1, 2].forEach((j) => { const tip = S2(cols[j]); s += arrS(o, tip, tints[j], 3.5) + txt([tip[0] + 10, tip[1] - 8], 'c' + '₁₂₃'[j], tints[j], 14); });
      s += txt([CX, 24], S.shown ? W('Volume of the box = |', 'बक्से का आयतन = |') + fs(d).replace(MINUS, '') + '|' : W('The box built on the three columns', 'तीनों स्तंभों पर बना बक्सा'), base, 14);
      if (S.shown && !fzero(d)) s += txt([CX, VH - 14], fnum(d) > 0 ? W('Determinant positive', 'सारणिक धनात्मक') : W('Determinant negative: the box is mirrored', 'सारणिक ऋणात्मक: बक्सा दर्पण-प्रतिबिंब है'), base, 13);
      if (S.shown && fzero(d)) s += txt([CX, VH - 14], W('Determinant 0: the box is flat', 'सारणिक 0: बक्सा सपाट है'), base, 13);
      return s;
    }
    function sceneInverse() {
      const A = S.A, inv = invM(A);
      const items = [{ pts: L_SHAPE, stroke: '#94A3B8', dash: '5 4', w: 2, label: 'L', lx: 0.2, ly: 0.2 }, { pts: applyM(A, L_SHAPE), fill: '#4338CA', fop: 0.3, stroke: '#4338CA', w: 3 }];
      if (inv) items.push({ pts: applyM(inv, applyM(A, L_SHAPE)), stroke: '#FF7A1A', dash: '2 5', w: 4 });
      const cap = inv ? W('Blue: A moves L. A⁻¹ moves it back (orange dots).', 'नीला: A, L को चलाता है। A⁻¹ उसे वापस लाता है (नारंगी बिंदु)।') : W('|A| = 0: the shape is squashed flat. Nothing can undo that.', '|A| = 0: आकृति सपाट हो गई। इसे कोई वापस नहीं ला सकता।');
      return affineScene(items, A) + txt([CX, 22], cap, inv ? '#4338CA' : COL.r, 12);
    }
    function sceneMult() {
      const A = S.A, B = S.B, AB = S.C;
      return affineScene([
        { pts: L_SHAPE, stroke: '#94A3B8', dash: '5 4', w: 2 },
        { pts: applyM(B, L_SHAPE), fill: '#FF7A1A', fop: 0.25, stroke: '#EA580C', w: 3 },
        { pts: applyM(AB, L_SHAPE), fill: '#8B3DFF', fop: 0.3, stroke: '#8B3DFF', w: 3 },
      ], AB) + txt([CX, 22], W('L, then B (orange), then AB (purple)', 'L, फिर B (नारंगी), फिर AB (बैंगनी)'), '#6B21A8', 13);
    }
    function drawSvg(focusKey) {
      if (!svg) return;
      let body = '';
      if (!isMat) body = sceneVec();
      else if (mode === 'determinant') body = sceneDet();
      else if (mode === 'inverse') body = sceneInverse();
      else body = sceneMult();
      svg.innerHTML = body;
      if (focusKey) { const el = svg.querySelector(`[data-drag="${focusKey}"]`); if (el) el.focus(); }
    }

    // ---------------------------------------------------------- controls
    const btn = (key, label, cls) => `<button type="button" class="mx-btn ${cls || 'alt'}" data-key="${key}"${cls === 'alt' || !cls ? ' aria-pressed="false"' : ''}>${label}</button>`;
    const act = (key, label, cls) => `<button type="button" class="mx-btn ${cls || 'alt'}" data-key="${key}">${label}</button>`;
    function steppers() {
      const names = mode === 'line-3d' ? { u: W('Point P', 'बिंदु P'), v: W('Direction b', 'दिशा b') } : { u: 'u', v: 'v' };
      const axes = ['x', 'y', 'z'].slice(0, nz(3));
      return '<div class="mx-steps">' + ['u', 'v'].map((w) => `<div class="mx-stbox ${w}" role="group" aria-label="${esc(names[w])}"><b>${esc(names[w])}</b>${axes.map((ax, i) => `<div class="mx-st"><span>${ax}</span><button type="button" data-st="${w}" data-i="${i}" data-d="-1" aria-label="${esc(names[w] + ' ' + ax + ' ' + W('minus one', 'एक घटाओ'))}">${MINUS}</button><output data-out="${w}${i}" aria-live="off"></output><button type="button" data-st="${w}" data-i="${i}" data-d="1" aria-label="${esc(names[w] + ' ' + ax + ' ' + W('plus one', 'एक बढ़ाओ'))}">+</button></div>`).join('')}</div>`).join('') + '</div>';
    }
    function ctlHTML() {
      const rot = is3 ? act('op:rotate-left', '⟲ ' + E('Turn left', 'बाएँ घुमाओ')) + act('op:rotate-right', E('Turn right', 'दाएँ घुमाओ') + ' ⟳') : '';
      const show = act('op:show', E('Show answer', 'उत्तर दिखाओ'), 'sun');
      switch (mode) {
        case 'matrix-add': return btn('op:add', E('A + B', 'A + B')) + btn('op:subtract', E('A − B', 'A − B')) + act('op:step', E('Work out this box', 'यह खाना निकालो')) + show + act('op:new', E('New problem', 'नया सवाल'));
        case 'matrix-multiply': return act('op:step', E('Work out this box', 'यह खाना निकालो')) + show + act('op:swap', E('Try B × A', 'B × A आज़माओ')) + act('op:new', E('New problem', 'नया सवाल'));
        case 'determinant': {
          const n = R0.A.length; let h = '';
          for (let i = 1; i <= n; i++) h += btn('op:row-' + i, E('Row ', 'पंक्ति ') + i);
          for (let i = 1; i <= n; i++) h += btn('op:col-' + i, E('Column ', 'स्तंभ ') + i);
          return h + act('op:swap-rows', E('Swap rows 1 and 2', 'पंक्ति 1 और 2 बदलो')) + act('op:double-row', E('Double row 1', 'पंक्ति 1 दुगुनी करो')) + show + act('op:reset', E('Start again', 'फिर से शुरू')) + act('op:new', E('New matrix', 'नया आव्यूह'));
        }
        case 'inverse': return btn('op:minors', E('1 Minors', '1 उपसारणिक')) + btn('op:cofactors', E('2 Cofactors', '2 सहखंड')) + btn('op:adjugate', E('3 Adjugate', '3 सहखंडज')) + btn('op:inverse', E('4 Inverse', '4 प्रतिलोम')) + show + act('op:reset', E('Start again', 'फिर से शुरू')) + act('op:new', E('New matrix', 'नया आव्यूह'));
        case 'vector-add': return btn('op:triangle', E('Triangle', 'त्रिभुज')) + btn('op:parallelogram', E('Parallelogram', 'समांतर चतुर्भुज')) + btn('op:subtract', E('Use u − v', 'u − v लो')) + rot + show + act('op:reset', E('Start again', 'फिर से शुरू')) + steppers();
        case 'dot': return btn('op:project', E('Show the shadow', 'छाया दिखाओ')) + rot + show + act('op:reset', E('Start again', 'फिर से शुरू')) + steppers();
        case 'cross': return btn('op:parallelogram', E('Shade the area', 'क्षेत्रफल रंगो')) + act('op:swap', E('Swap u and v', 'u और v बदलो')) + rot + show + act('op:reset', E('Start again', 'फिर से शुरू')) + steppers();
        default: return `<label class="mx-sl"><span><b>λ</b><output data-out="lam"></output></span><input class="mx-range" type="range" min="-8" max="8" step="1" value="${S.k}" data-key="op:lambda" aria-label="${esc(W('Slide λ along the line', 'λ को रेखा पर सरकाओ'))}"></label>` + rot + show + act('op:reset', E('Start again', 'फिर से शुरू')) + steppers();
      }
    }
    function syncCtl() {
      if (!ctlEl) return;
      const set = (key, on) => { const el = ctlEl.querySelector(`[data-key="${key}"]`); if (el) el.setAttribute('aria-pressed', String(!!on)); };
      if (mode === 'matrix-add') { set('op:add', S.op === 'add'); set('op:subtract', S.op === 'sub'); }
      if (mode === 'determinant') { const n = S.A.length; for (let i = 1; i <= n; i++) { set('op:row-' + i, S.exp.kind === 'row' && S.exp.i === i - 1); set('op:col-' + i, S.exp.kind === 'col' && S.exp.i === i - 1); } }
      if (mode === 'inverse') ['minors', 'cofactors', 'adjugate', 'inverse'].forEach((k, i) => set('op:' + k, S.stage === i + 1));
      if (mode === 'vector-add') { set('op:triangle', S.cons === 'triangle'); set('op:parallelogram', S.cons === 'parallelogram'); set('op:subtract', S.minus); }
      if (mode === 'dot') set('op:project', S.proj);
      if (mode === 'cross') set('op:parallelogram', S.area);
      if (!isMat) {
        ['u', 'v'].forEach((w) => { for (let i = 0; i < nz(3); i++) { const o = ctlEl.querySelector(`[data-out="${w}${i}"]`); if (o) o.textContent = String(S[w][i]).replace('-', MINUS); } });
        const lo = ctlEl.querySelector('[data-out="lam"]'); if (lo) lo.textContent = fs(lam());
        const rg = ctlEl.querySelector('.mx-range'); if (rg && +rg.value !== S.k) rg.value = S.k;
      }
    }

    // ---------------------------------------------------------- the answer form
    function askSpec() {
      const labels3 = ['x', 'y', 'z'].slice(0, nz(3));
      if (mode === 'matrix-add' || mode === 'matrix-multiply') {
        if (!S.sel) return { none: true, sig: 'none', q: W('Tap a box in the answer matrix, then type its value.', 'उत्तर वाले आव्यूह का खाना दबाओ, फिर उसका मान लिखो।'), labels: [] };
        const [r, c] = S.sel;
        return { sig: `c${r}${c}${S.done[r][c] ? 'd' : ''}`, q: W(`Row ${r + 1}, column ${c + 1} of the answer`, `उत्तर की पंक्ति ${r + 1}, स्तंभ ${c + 1}`), labels: [''], exp: [S.C[r][c]], done: S.done[r][c] };
      }
      if (mode === 'determinant' || mode === 'inverse') return { sig: 'd', q: W('The determinant |A| is', 'सारणिक |A| है'), labels: [''], exp: [det(S.A)] };
      if (mode === 'vector-add') return { sig: 'v', q: W(S.minus ? 'u − v is' : 'u + v is', S.minus ? 'u − v है' : 'u + v है'), labels: labels3, exp: vadd(S.u, S.v, S.minus ? -1 : 1).slice(0, labels3.length).map((x) => F(x)) };
      if (mode === 'dot') return { sig: 'd', q: W('u · v is', 'u · v है'), labels: [''], exp: [F(dot3(S.u, S.v))] };
      if (mode === 'cross') return { sig: 'c', q: W('u × v is', 'u × v है'), labels: labels3, exp: cross3(S.u, S.v).map((x) => F(x)) };
      return { sig: 'l', q: W('The point on the line at this λ is', 'इस λ पर रेखा का बिंदु है'), labels: labels3, exp: S.u.map((x, i) => fadd(F(x), fmul(lam(), F(S.v[i])))) };
    }
    let ansSig = '';
    function drawAns(force) {
      if (!form) return;
      const sp = askSpec();
      const sig = sp.sig + '|' + lang();
      form.querySelector('.mx-ans-q').textContent = sp.q;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = !!sp.none || !!sp.done;
      if (sig === ansSig && !force) return;
      ansSig = sig;
      const f = form.querySelector('.mx-ans-f');
      f.innerHTML = sp.labels.map((l, i) => `<label>${l ? esc(l) + ' =' : ''}<input class="mx-in" type="text" inputmode="text" autocomplete="off" data-i="${i}" aria-label="${esc(sp.q + (l ? ' ' + l : ''))}"${sp.done ? ' disabled' : ''}></label>`).join('');
      if (sp.done) { const i0 = f.querySelector('input'); if (i0) i0.value = fs(sp.exp[0]); }
    }
    function hint(sp) {
      if (mode === 'matrix-add') return W('Add the two numbers in the same place. Look at the highlighted boxes.', 'उसी जगह की दोनों संख्याएँ जोड़ो। रंगीन खानों को देखो।');
      if (mode === 'matrix-multiply') return W('Multiply each pair (row number × column number), then add all the products.', 'हर जोड़े को गुणा करो (पंक्ति की संख्या × स्तंभ की संख्या), फिर सब गुणनफल जोड़ो।');
      if (mode === 'determinant' || mode === 'inverse') return S.A.length === 2 ? W('Multiply across the diagonals: a×d minus b×c.', 'विकर्णों पर गुणा करो: a×d में से b×c घटाओ।') : W('Add up the three cards. Mind each sign.', 'तीनों कार्ड जोड़ो। हर चिह्न का ध्यान रखो।');
      if (mode === 'vector-add') return W('Add the matching parts: x with x, y with y (z with z).', 'संगत भाग जोड़ो: x में x, y में y (z में z)।');
      if (mode === 'dot') return W('Multiply the matching parts, then add: u₁v₁ + u₂v₂ + u₃v₃.', 'संगत भाग गुणा करो, फिर जोड़ो: u₁v₁ + u₂v₂ + u₃v₃।');
      if (mode === 'cross') return W('x: u₂v₃ − u₃v₂, y: u₃v₁ − u₁v₃, z: u₁v₂ − u₂v₁.', 'x: u₂v₃ − u₃v₂, y: u₃v₁ − u₁v₃, z: u₁v₂ − u₂v₁।');
      return W('Point = P + λ × b, one part at a time. Use the λ shown.', 'बिंदु = P + λ × b, एक-एक भाग करके। दिखाया गया λ लो।');
    }
    function submitAnswer() {
      if (!allowed('answer')) return;
      const sp = askSpec();
      if (sp.none) { setMsg(sp.q, ''); return; }
      if (sp.done) return;
      const ins = [...form.querySelectorAll('input')], got = ins.map((i) => parseF(i.value));
      if (got.some((g) => g === null)) { setMsg(W('Type a number, like 4, −3 or 1/2.', 'कोई संख्या लिखो, जैसे 4, −3 या 1/2।'), ''); shake(form); return; }
      const ok = got.every((g, i) => feq(g, sp.exp[i]));
      if (ok) {
        if (isMat && (mode === 'matrix-add' || mode === 'matrix-multiply')) {
          const [r, c] = S.sel; S.done[r][c] = true; S.pop = r + '-' + c;
          const left = []; S.done.forEach((row, i) => row.forEach((d, j) => { if (!d) left.push([i, j]); }));
          const nxt = left.find((p) => p[0] > r || (p[0] === r && p[1] > c)) || left[0];
          setMsg(left.length ? W('Yes! That is right. On to the next box.', 'हाँ! सही है। अब अगला खाना।') : W('Yes! The whole matrix is done.', 'हाँ! पूरा आव्यूह बन गया।'), 'good');
          S.sel = nxt || S.sel;
          drawEq(); drawWork(); drawAns(true); if (hasSvg) drawSvg();
          if (!left.length) { if (api.celebrate) api.celebrate(); }
        } else {
          S.shown = true; setMsg(W('Yes! That is right.', 'हाँ! सही है।'), 'good');
          drawWork(); drawSvg(); drawAns(); if (api.celebrate) api.celebrate();
        }
        emit('answered:right', 'computed'); if (mode === 'vector-add' || mode === 'cross') emit('resultant');
        record('answered right in ' + mode);
      } else {
        setMsg(W('Not yet. ', 'अभी नहीं। ') + hint(sp), 'bad'); shake(form);
        emit('answered:wrong'); record('answered wrong in ' + mode);
      }
    }

    // ---------------------------------------------------------- doing things
    function afterVec(focus) {
      S.anim = 1; drawSvg(focus); syncCtl(); drawWork(); drawAns();
      if (mode === 'vector-add' || mode === 'cross') emit('resultant', 'computed'); else emit('computed');
    }
    function bump(which, i, d) {
      const key = 'drag:' + which;
      if (!allowed(key)) return;
      const v = S[which].slice(), L = lim[which];
      v[i] += d;
      if (Math.abs(v[i]) > L) { setMsg(W(`The picture only goes up to ${L}.`, `चित्र केवल ${L} तक जाता है।`), ''); return; }
      if (mode === 'line-3d' && which === 'v' && isZeroV(v)) { setMsg(W('A line needs a direction: b cannot be zero.', 'रेखा को दिशा चाहिए: b शून्य नहीं हो सकता।'), ''); return; }
      S[which] = v; afterVec();
    }
    function setVec(which, v) {
      const L = lim[which];
      const nv = v.map((x) => Math.max(-L, Math.min(L, Math.round(x))));
      if (!is3) nv[2] = 0;
      if (mode === 'line-3d' && which === 'v' && isZeroV(nv)) return false;
      if (nv.every((x, i) => x === S[which][i])) return false;
      S[which] = nv; return true;
    }
    function selectCell(r, c) {
      const k = `cell:${r + 1}-${c + 1}`;
      if (!allowed(k)) return;
      S.sel = [r, c]; S.pop = '';
      drawEq(); drawWork(); drawAns(); setMsg('', '');
      emit('computed'); record(`opened box ${r + 1},${c + 1}`);
    }
    function revealCell(r, c) { if (!S.done[r][c]) { S.done[r][c] = true; S.pop = r + '-' + c; } }
    function newProblem() {
      S.pi++;
      const p = genProblem(mode, R0, S.pi);
      initState(p); if (isMat) recalc();
      drawEq(); drawWork(); drawSvg(); syncCtl(); drawAns(true); setMsg('', '');
    }
    function readCells() {
      // matrix cells edited by hand: only commits good numbers
      return true;
    }
    function doOp(op) {
      const key = 'op:' + op;
      if (!allowed(key)) return;
      if (op === 'rotate-left' || op === 'rotate-right') { S.psi += op === 'rotate-left' ? -0.35 : 0.35; drawSvg(); return; }
      if (mode === 'matrix-add' || mode === 'matrix-multiply') {
        if (op === 'add' || op === 'subtract') { S.op = op === 'add' ? 'add' : 'sub'; recalc(); setMsg('', ''); drawEq(); drawWork(); drawAns(true); emit('computed'); return; }
        if (op === 'step') {
          if (!S.sel) { let f = null; S.done.forEach((row, i) => row.forEach((d, j) => { if (!d && !f) f = [i, j]; })); S.sel = f || [0, 0]; }
          revealCell(S.sel[0], S.sel[1]); drawEq(); drawWork(); drawAns(true); setMsg(W('Here it is.', 'यह रहा।'), 'good'); emit('computed'); return;
        }
        if (op === 'show') { S.done.forEach((row, i) => row.forEach((d, j) => revealCell(i, j))); if (!S.sel) S.sel = [0, 0]; S.pop = ''; drawEq(); drawWork(); drawAns(true); setMsg(W('The whole answer is shown.', 'पूरा उत्तर दिखा दिया।'), 'good'); emit('computed'); return; }
        if (op === 'new') { newProblem(); return; }
        if (op === 'swap') {
          if (S.B[0].length !== S.A.length) { setMsg(W(`B × A is not defined: B has ${S.B[0].length} columns but A has ${S.A.length} rows.`, `B × A परिभाषित नहीं है: B के ${S.B[0].length} स्तंभ हैं पर A की ${S.A.length} पंक्तियाँ।`), 'bad'); shake(eqEl); return; }
          const t = S.A; S.A = S.B; S.B = t; recalc(); S.sel = null; setMsg(W('Now A and B have swapped places. Is the answer the same as before?', 'अब A और B की जगह बदल गई। क्या उत्तर पहले जैसा ही है?'), ''); drawEq(); drawWork(); drawAns(true); drawSvg(); emit('computed'); return;
        }
      } else if (mode === 'determinant') {
        let m;
        if ((m = op.match(/^(row|col)-(\d)$/))) { S.exp = { kind: m[1], i: +m[2] - 1 }; S.prop = ''; drawEq(); drawWork(); syncCtl(); emit('computed'); return; }
        if (op === 'show') { S.shown = true; S.prop = ''; drawWork(); drawSvg(); drawAns(true); fillAns(); emit('computed'); return; }
        if (op === 'reset') { initState(R0); drawEq(); drawWork(); drawSvg(); syncCtl(); drawAns(true); setMsg('', ''); emit('computed'); return; }
        if (op === 'new') { newProblem(); return; }
        if (op === 'swap-rows' || op === 'double-row') {
          const before = det(S.A);
          if (op === 'swap-rows') { const t = S.A[0]; S.A[0] = S.A[1]; S.A[1] = t; S.prop = S.shown ? W(`Two rows swapped: the determinant changes sign (${fs(before)} became ${fs(det(S.A))}).`, `दो पंक्तियाँ बदलीं: सारणिक का चिह्न बदल गया (${fs(before)} से ${fs(det(S.A))})।`) : W('Two rows swapped: the determinant changes sign.', 'दो पंक्तियाँ बदलीं: सारणिक का चिह्न बदल जाता है।'); }
          else {
            if (S.A[0].some((x) => Math.abs(fnum(x)) * 2 > BIG)) { setMsg(W('The numbers would get too big.', 'संख्याएँ बहुत बड़ी हो जाएँगी।'), ''); return; }
            S.A[0] = S.A[0].map((x) => fmul(x, F(2)));
            S.prop = S.shown ? W(`Row 1 doubled: the determinant doubles (${fs(before)} became ${fs(det(S.A))}).`, `पंक्ति 1 दुगुनी हुई: सारणिक दुगुना हो गया (${fs(before)} से ${fs(det(S.A))})।`) : W('Row 1 doubled: the determinant doubles too.', 'पंक्ति 1 दुगुनी हुई: सारणिक भी दुगुना हो जाता है।');
          }
          drawEq(); drawWork(); drawSvg(); drawAns(); emit('computed'); return;
        }
      } else if (mode === 'inverse') {
        const st = { minors: 1, cofactors: 2, adjugate: 3, inverse: 4 }[op];
        if (st) { S.stage = st; if (st === 4) S.shown = true; drawWork(); syncCtl(); drawAns(); emit('computed'); return; }
        if (op === 'show') { S.shown = true; drawWork(); drawSvg(); drawAns(true); fillAns(); emit('computed'); return; }
        if (op === 'reset') { initState(R0); drawEq(); drawWork(); drawSvg(); syncCtl(); drawAns(true); setMsg('', ''); emit('computed'); return; }
        if (op === 'new') { newProblem(); return; }
      } else {
        if (op === 'reset') { initState(R0); S.anim = 1; drawSvg(); drawWork(); syncCtl(); drawAns(true); setMsg('', ''); emit('computed'); return; }
        if (op === 'show') { S.shown = true; drawWork(); drawSvg(); drawAns(true); fillAns(); setMsg(W('The answer is shown.', 'उत्तर दिखा दिया।'), 'good'); if (mode === 'vector-add' || mode === 'cross') emit('resultant', 'computed'); else emit('computed'); return; }
        if (mode === 'vector-add') {
          if (op === 'triangle' || op === 'parallelogram') {
            S.cons = op; setMsg('', ''); syncCtl();
            S.anim = 0; if (stopTw) stopTw();
            stopTw = tween(900, (t) => { S.anim = L.ease(t); drawSvg(); }, () => { S.anim = 1; });
            drawWork(); emit('resultant', 'computed'); return;
          }
          if (op === 'subtract') { S.minus = !S.minus; syncCtl(); drawSvg(); drawWork(); drawAns(true); emit('resultant', 'computed'); return; }
        }
        if (mode === 'dot' && op === 'project') { S.proj = !S.proj; syncCtl(); drawSvg(); emit('computed'); return; }
        if (mode === 'cross') {
          if (op === 'swap') { const t = S.u; S.u = S.v; S.v = t; afterVec(); setMsg(W('u and v swapped: the arrow u × v now points the other way.', 'u और v बदले: तीर u × v अब उलटी दिशा में है।'), ''); return; }
          if (op === 'parallelogram') { S.area = !S.area; syncCtl(); drawSvg(); emit('computed'); return; }
        }
      }
    }
    function fillAns() {
      const sp = askSpec(), ins = form ? [...form.querySelectorAll('input')] : [];
      if (!sp.exp) return;
      ins.forEach((i, k) => { if (sp.exp[k]) i.value = fs(sp.exp[k]); });
    }

    // ---------------------------------------------------------- events
    function onClick(ev) {
      const st = ev.target.closest('[data-st]');
      if (st) { bump(st.dataset.st, +st.dataset.i, +st.dataset.d); return; }
      const el = ev.target.closest('[data-key]');
      if (!el || !root.contains(el)) return;
      const k = el.dataset.key;
      if (k.startsWith('op:') && el.tagName === 'BUTTON') doOp(k.slice(3));
      else if (el.classList.contains('mx-res')) selectCell(+el.dataset.r, +el.dataset.c);
    }
    let cellTimer = 0;
    function onInput(ev) {
      const el = ev.target;
      if (el.classList.contains('mx-range')) {
        if (!allowed('op:lambda')) { el.value = S.k; return; }
        S.k = +el.value; syncCtl(); drawSvg(); drawWork(); drawAns(); emit('computed'); return;
      }
      if (el.dataset.key && el.dataset.key.startsWith('cell:') && el.classList.contains('mx-in')) {
        if (!allowed(el.dataset.key)) { el.value = fs(S.A[+el.dataset.r][+el.dataset.c]); return; }
        const v = parseF(el.value);
        if (v === null || Math.abs(fnum(v)) > BIG) { el.classList.add('bad'); return; }
        el.classList.remove('bad');
        S.A[+el.dataset.r][+el.dataset.c] = v; S.prop = '';
        drawWork(); drawSvg(); drawAns();
        clearTimeout(cellTimer); cellTimer = setTimeout(() => { if (alive) emit('computed'); }, 300);
      }
    }
    function onSubmit(ev) { ev.preventDefault(); submitAnswer(); }
    function svgPoint(ev) {
      const m = svg.getScreenCTM(); if (!m) return null;
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      return pt.matrixTransform(m.inverse());
    }
    function onDown(ev) {
      if (!svg || !svg.contains(ev.target)) return;
      const h = ev.target.closest('[data-drag]');
      if (h) {
        if (!allowed('drag:' + h.dataset.drag)) return;
        S.drag = h.dataset.drag; svg.setPointerCapture(ev.pointerId); ev.preventDefault();
      } else if (is3 && !isMat) { S.rot = { x: ev.clientX, psi: S.psi }; svg.setPointerCapture(ev.pointerId); }
    }
    function onMove(ev) {
      if (S.drag && svg) {
        const p = svgPoint(ev); if (!p) return;
        const w = S.drag, org = orgOf(w), vec = S[w], nv = vec.slice();
        if (!is3) { nv[0] = (p.x - CX) / SC - org[0]; nv[1] = (CY - p.y) / SC - org[1]; }
        else {
          const z = org[2] + vec[2], rx = (p.x - CX) / SC, ry = (-(p.y - CY) / SC - z * CE) / SE, cp = Math.cos(S.psi), sp = Math.sin(S.psi);
          nv[0] = rx * cp + ry * sp - org[0]; nv[1] = -rx * sp + ry * cp - org[1];
        }
        if (setVec(w, nv)) { S.anim = 1; drawSvg(); syncCtl(); drawWork(); drawAns(); S.moved = true; }
      } else if (S.rot) { S.psi = S.rot.psi + (ev.clientX - S.rot.x) * 0.012; drawSvg(); }
    }
    function onUp() {
      if (S.drag && S.moved) { if (mode === 'vector-add' || mode === 'cross') emit('resultant', 'computed'); else emit('computed'); record('moved ' + S.drag); }
      S.drag = null; S.rot = null; S.moved = false;
    }
    function onKey(ev) {
      const h = ev.target.closest && ev.target.closest('[data-drag]');
      if (!h) return;
      const w = h.dataset.drag, k = ev.key;
      const map = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [1, 1], ArrowDown: [1, -1], PageUp: [2, 1], PageDown: [2, -1] };
      if (!map[k] || (map[k][0] === 2 && !is3)) return;
      ev.preventDefault();
      const [i, d] = map[k], v = S[w].slice(), L = lim[w];
      v[i] += d;
      if (Math.abs(v[i]) > L || (mode === 'line-3d' && w === 'v' && isZeroV(v))) return;
      if (!allowed('drag:' + w)) return;
      S[w] = v; afterVec(w);
    }
    // enter/space on the stepper-less rotate handled by buttons; language switches rebuild
    function build() {
      lastLang = lang();
      root.style.containerType = 'inline-size';
      const tipTxt = TIPS[mode];
      root.innerHTML = `<div class="mx mx-${mode}" aria-label="${esc(NAMES[mode])}"><div class="mx-board"><div class="mx-eq"></div>${hasSvg ? `<svg class="mx-svg" viewBox="${is3 && !isMat ? '30 46 340 280' : `0 0 ${VW} ${VH}`}" role="group" aria-label="${esc(NAMES[mode])}"></svg>` : ''}</div>
        <div class="mx-side"><p class="mx-tip">${esc(tipTxt)}</p><div class="mx-work" aria-live="off"></div><div class="mx-ctl" role="group" aria-label="${esc(W('Controls', 'नियंत्रण'))}">${ctlHTML()}</div>
        <form class="mx-ans" data-key="answer" novalidate><div class="mx-ans-q"></div><div class="mx-ans-f"></div><div class="mx-ans-b"><button type="submit" class="mx-btn ok">${E('Check', 'जाँचो')}</button></div></form>
        <div class="mx-fb" aria-live="polite" role="status"></div></div></div>`;
      eqEl = root.querySelector('.mx-eq'); svg = root.querySelector('.mx-svg'); workEl = root.querySelector('.mx-work'); ctlEl = root.querySelector('.mx-ctl'); form = root.querySelector('.mx-ans'); fbEl = root.querySelector('.mx-fb');
      ansSig = '';
      drawEq(); drawSvg(); drawWork(); syncCtl(); drawAns(true);
      if (S.msg) setMsg(S.msg, S.kind);
      if (!isMat && !S.shown && !L.reducedMotion()) { S.anim = 0; stopTw = tween(800, (t) => { S.anim = L.ease(t); drawSvg(); }, () => { S.anim = 1; drawSvg(); }); }
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('keydown', onKey);
    langTimer = setInterval(() => { if (alive && lang() !== lastLang) build(); }, 600);
    build();
    return {
      destroy() {
        alive = false; clearInterval(langTimer); clearTimeout(evT); clearTimeout(cellTimer); timers.forEach(clearTimeout); if (stopTw) stopTw();
        ['click', 'input', 'submit', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown'].forEach((n) => root.removeEventListener(n, { click: onClick, input: onInput, submit: onSubmit, pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp, keydown: onKey }[n]));
        root.innerHTML = '';
      },
    };
  }

  NCA_T.register({
    id: 'matrix',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'matrix-multiply', a: [[2, 1], [3, -1]], b: [[1, 4], [2, 0]] },
    mount,
    // pure maths, for tests under Node
    model: { F, fadd, fsub, fmul, fdiv, parseF, mAdd, mMul, det, minorsM, cofM, adjM, invM, dot3, cross3, lineRelation, radical },
  });
})();
