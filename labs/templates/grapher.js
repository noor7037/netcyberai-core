// Template: Graph studio. Plot points, straight lines, pairs of lines, parabolas, polynomials, trigonometric,
// exponential and log curves; trace a point along a curve; see slopes (tangents and the slope curve), areas under a
// curve (with rectangles that close in on the true area, a limit), linear inequalities and linear programming.
// Every number is computed from the expression on the screen: a small safe parser (never eval) reads it, roots,
// turning points and intersections are found numerically or by the exact school formula, areas by Simpson's rule,
// and the LP feasible region by clipping half-planes, so the picture, the facts and the answers always agree. Config:
//   { mode: 'points'|'line'|'pair'|'quadratic'|'polynomial'|'trig'|'exp-log'|'derivative'|'integral'|'inequality'|'lp',
//     expr?: string   (numbers, x, a, b, c, + − × ÷ ^, sin cos tan sqrt log ln exp abs, π, e; implicit 2x works;
//                     line: "a*x + b" or "2x + 3y = 6"; pair: two lines joined by ";";
//                     inequality: "y <= a*x + b; x + y < 5"; lp: "max 3x + 2y; x + y <= 4; x + 3y <= 6" (x, y ≥ 0 added);
//                     integral: a and b are the limits, so the curve may use c only),
//     params?: { a?: [min, max, start, step?], b?, c? }   (only the letters the expression uses),
//     points?: [[x, y], …]   (points mode: the points already plotted; other modes: data points shown on the graph) }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI;
  const MODES = ['points', 'line', 'pair', 'quadratic', 'polynomial', 'trig', 'exp-log', 'derivative', 'integral', 'inequality', 'lp'];
  const FNMODES = ['line', 'quadratic', 'polynomial', 'trig', 'exp-log', 'derivative', 'integral'];
  const CURVE = ['quadratic', 'polynomial', 'trig', 'exp-log', 'derivative', 'integral'];
  const EQUAL = ['points', 'line', 'pair', 'exp-log', 'inequality', 'lp'];
  const PARAMS = ['a', 'b', 'c'];
  const DEF = {
    points: { params: {} },
    line: { expr: 'a*x + b', params: { a: [-4, 4, 1], b: [-6, 6, 2] } },
    pair: { expr: 'a*x + b; c*x + 3', params: { a: [-3, 3, 1], b: [-5, 5, -1], c: [-3, 3, -1] } },
    quadratic: { expr: 'a*x^2 + b*x + c', params: { a: [-3, 3, 1], b: [-6, 6, -2], c: [-8, 8, -3] } },
    polynomial: { expr: '(x - a)*(x - b)*(x - c)', params: { a: [-4, 4, -2], b: [-4, 4, 1], c: [-4, 4, 3] } },
    trig: { expr: 'a*sin(b*x + c)', params: { a: [-3, 3, 1], b: [0.5, 3, 1], c: [-3.1, 3.1, 0] } },
    'exp-log': { expr: 'a^x', params: { a: [0.2, 4, 2] } },
    derivative: { expr: 'x^3/3 - a*x', params: { a: [-2, 6, 4] } },
    integral: { expr: 'x^2/4 + c', params: { a: [-4, 6, 0], b: [-4, 6, 3], c: [-2, 3, 1] } },
    inequality: { expr: 'y <= a*x + b', params: { a: [-3, 3, -1], b: [-5, 5, 3] } },
    lp: { expr: 'max 3x + 2y; x + y <= 4; x + 3y <= 6', params: {} },
  };
  const GENERIC = [-5, 5, 1];
  const XR = { line: [-8, 8], quadratic: [-8, 8], polynomial: [-6, 6], trig: [-2 * PI, 2 * PI], 'exp-log': [-6, 6], derivative: [-5, 5], integral: [-5, 7] };
  const COL = { main: '#8B3DFF', two: '#FF7A1A', three: '#14B8A6', four: '#1D4ED8', root: '#FF6B57', max: '#0F766E', min: '#1D4ED8', trace: '#1D4ED8', area: '#14B8A6', neg: '#FF6B57', ink: '#1E293B' };
  const PCOL = { a: '#8B3DFF', b: '#FF7A1A', c: '#14B8A6', x: '#1D4ED8' };
  const LINECOL = ['#8B3DFF', '#FF7A1A', '#14B8A6', '#1D4ED8', '#FF6B57', '#0F766E', '#F5B90A', '#4400F0'];

  // ---------------------------------------------------------------- numbers
  const rd = (v, k = 1e9) => Math.round(v * k) / k;
  function fmt(v, d = 2) {
    if (v == null || !Number.isFinite(v)) return '–';
    const p = Math.pow(10, d);
    let r = Math.round(v * p) / p;
    if (Object.is(r, -0) || Math.abs(r) < 0.5 / p) r = 0;
    return String(r).replace('-', '−');
  }
 // on a trig graph, x values that are multiples of π/4 show as π
  function fx(x, pix) {
    if (pix && Number.isFinite(x) && Math.abs(x) > 1e-9) {
      const q = x / (PI / 4);
      if (Math.abs(q - Math.round(q)) < 1e-6) { const n = Math.round(q); if (n % 2 === 0) return piLabel(x); const s = n < 0 ? '−' : ''; return s + (Math.abs(n) === 1 ? '' : Math.abs(n)) + 'π/4'; }
    }
    return fmt(x);
  }
  const pt = (x, y) => `(${fmt(x)}, ${fmt(y)})`;
  function niceStep(raw) {
    const k = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / k;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * k;
  }
  function piLabel(v) {
    const n = Math.round(v / (PI / 2));
    if (n === 0) return '0';
    const s = n < 0 ? '−' : '';
    const a = Math.abs(n);
    if (a % 2 === 0) return s + (a / 2 === 1 ? '' : a / 2) + 'π';
    return s + (a === 1 ? '' : a) + 'π/2';
  }

  // ---------------------------------------------------------------- the safe expression parser (no eval)
  const FN = ['sqrt', 'sin', 'cos', 'tan', 'log', 'exp', 'abs', 'ln'];
  function lex(src) {
    const s = String(src).toLowerCase().replace(/[−–]/g, '-').replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (m) { out.push({ k: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      if (/[a-z]/.test(ch)) {
        const w = s.slice(i).match(/^[a-z]+/)[0];
        let j = 0;
        while (j < w.length) {
          const r = w.slice(j);
          const f = FN.concat(['pi']).find((n) => r.startsWith(n));
          if (f) { out.push(f === 'pi' ? { k: 'const', v: 'pi' } : { k: 'fn', v: f }); j += f.length; continue; }
          const c = r[0];
          if ('xyabc'.includes(c)) out.push({ k: 'var', v: c });
          else if (c === 'e') out.push({ k: 'const', v: 'e' });
          else throw new Error(`unknown name "${w}"`);
          j++;
        }
        i += w.length;
        continue;
      }
      if (s.startsWith('<=', i) || s.startsWith('>=', i)) { out.push({ k: 'cmp', v: s.substr(i, 2) }); i += 2; continue; }
      if ('<>='.includes(ch)) { out.push({ k: 'cmp', v: ch }); i++; continue; }
      if ('+-*/^()'.includes(ch)) { out.push({ k: 'op', v: ch }); i++; continue; }
      throw new Error(`unexpected "${ch}"`);
    }
    return out;
  }
  function parseTokens(toks) {
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = (t, v) => t && t.k === 'op' && t.v === v;
    const startsAtom = (t) => t && (t.k === 'num' || t.k === 'var' || t.k === 'const' || t.k === 'fn' || isOp(t, '('));
    let depth = 0;
    function expr() {
      if (++depth > 60) throw new Error('the expression is too deep');
      let n = term();
      while (peek() && peek().k === 'op' && (peek().v === '+' || peek().v === '-')) { const o = next().v; n = { t: 'bin', op: o, a: n, b: term() }; }
      depth--;
      return n;
    }
    function term() {
      let n = unary();
      for (;;) {
        const t = peek();
        if (t && t.k === 'op' && (t.v === '*' || t.v === '/')) { next(); n = { t: 'bin', op: t.v, a: n, b: unary() }; }
        else if (startsAtom(t)) n = { t: 'bin', op: '*', a: n, b: power() };
        else break;
      }
      return n;
    }
    function unary() {
      const t = peek();
      if (isOp(t, '-')) { next(); return { t: 'neg', a: unary() }; }
      if (isOp(t, '+')) { next(); return unary(); }
      return power();
    }
    function power() {
      const b = atom();
      if (isOp(peek(), '^')) { next(); return { t: 'bin', op: '^', a: b, b: unary() }; }
      return b;
    }
    function atom() {
      const t = next();
      if (!t) throw new Error('the expression ends too early');
      if (t.k === 'num') return { t: 'num', v: t.v };
      if (t.k === 'var') return { t: 'var', n: t.v };
      if (t.k === 'const') return { t: 'const', n: t.v };
      if (t.k === 'fn') {
        let a;
        if (isOp(peek(), '(')) { next(); a = expr(); if (!isOp(next(), ')')) throw new Error('a bracket is not closed'); }
        else a = power();
        return { t: 'fn', n: t.v, a };
      }
      if (isOp(t, '(')) { const n = expr(); if (!isOp(next(), ')')) throw new Error('a bracket is not closed'); return n; }
      throw new Error(`unexpected "${t.v}"`);
    }
    if (!toks.length) throw new Error('empty expression');
    const n = expr();
    if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
    return n;
  }
  // "L op R" (op one of = < <= > >=) or a plain expression.
  function parseRel(src) {
    const toks = lex(src);
    const idx = toks.map((t, i) => (t.k === 'cmp' ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 1) throw new Error('only one comparison sign per part');
    if (!idx.length) return { e: parseTokens(toks) };
    const i = idx[0];
    return { L: parseTokens(toks.slice(0, i)), op: toks[i].v, R: parseTokens(toks.slice(i + 1)) };
  }
  function rpow(a, b) {
    if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
    for (let q = 3; q <= 9; q += 2) { const pq = b * q; if (Math.abs(pq - Math.round(pq)) < 1e-9) return (Math.round(pq) % 2 ? -1 : 1) * Math.pow(-a, b); }
    return NaN;
  }
  const FNS = { sin: Math.sin, cos: Math.cos, tan: (v) => (Math.abs(Math.cos(v)) < 1e-12 ? NaN : Math.tan(v)), sqrt: Math.sqrt, log: Math.log10, ln: Math.log, exp: Math.exp, abs: Math.abs };
  function comp(n) {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'var': { const k = n.n; return (e) => e[k]; }
      case 'const': { const v = n.n === 'pi' ? PI : Math.E; return () => v; }
      case 'neg': { const a = comp(n.a); return (e) => -a(e); }
      case 'fn': { const a = comp(n.a); const f = FNS[n.n]; return (e) => f(a(e)); }
      default: {
        const a = comp(n.a), b = comp(n.b);
        if (n.op === '+') return (e) => a(e) + b(e);
        if (n.op === '-') return (e) => a(e) - b(e);
        if (n.op === '*') return (e) => a(e) * b(e);
        if (n.op === '/') return (e) => { const d = b(e); return d === 0 ? NaN : a(e) / d; };
        return (e) => rpow(a(e), b(e));
      }
    }
  }
  const safe = (f) => (e) => { const v = f(e); return Number.isFinite(v) ? v : NaN; };
  function vars(n, s = new Set()) {
    if (n.t === 'var') s.add(n.n);
    if (n.a) vars(n.a, s);
    if (n.b) vars(n.b, s);
    return s;
  }
  const hasFn = (n, names) => (n.t === 'fn' && names.includes(n.n)) || (!!n.a && hasFn(n.a, names)) || (!!n.b && hasFn(n.b, names));
  const xInExp = (n) => (n.t === 'bin' && n.op === '^' && vars(n.b).has('x')) || (!!n.a && xInExp(n.a)) || (!!n.b && xInExp(n.b));
  const sub = (L, R) => ({ t: 'bin', op: '-', a: L, b: R });

  // ---------------------------------------------------------------- pretty printing (HTML, values put in)
  const NUM = (v) => ({ t: 'num', v });
  const isN = (n, v) => n.t === 'num' && (v === undefined || Math.abs(n.v - v) < 1e-12);
  function simp(n, env) {
    if (n.t === 'num' || n.t === 'const') return n;
    if (n.t === 'var') return PARAMS.includes(n.n) && env && env[n.n] != null ? NUM(env[n.n]) : n;
    if (n.t === 'neg') { const a = simp(n.a, env); if (a.t === 'num') return NUM(-a.v); if (a.t === 'neg') return a.a; return { t: 'neg', a }; }
    if (n.t === 'fn') return { t: 'fn', n: n.n, a: simp(n.a, env) };
    let A = simp(n.a, env), B = simp(n.b, env);
    const op = n.op;
    if (op === '+' || op === '-') {
      if (isN(B, 0)) return A;
      if (isN(A, 0)) return op === '+' ? B : simp({ t: 'neg', a: B });
      if (A.t === 'num' && B.t === 'num') return NUM(op === '+' ? A.v + B.v : A.v - B.v);
      if (B.t === 'num' && B.v < 0) return { t: 'bin', op: op === '+' ? '-' : '+', a: A, b: NUM(-B.v) };
      if (B.t === 'neg') return { t: 'bin', op: op === '+' ? '-' : '+', a: A, b: B.a };
      return { t: 'bin', op, a: A, b: B };
    }
    if (op === '*') {
      if (isN(A, 0) || isN(B, 0)) return NUM(0);
      if (B.t === 'num' && A.t !== 'num') [A, B] = [B, A];
      if (A.t === 'num' && B.t === 'num') return NUM(A.v * B.v);
      if (isN(A, 1)) return B;
      if (isN(A, -1)) return { t: 'neg', a: B };
      if (A.t === 'num' && A.v < 0) return { t: 'neg', a: { t: 'bin', op: '*', a: NUM(-A.v), b: B } };
      if (A.t === 'neg') return { t: 'neg', a: simp({ t: 'bin', op: '*', a: A.a, b: B }) };
      return { t: 'bin', op, a: A, b: B };
    }
    if (op === '/') {
      if (isN(B, 1)) return A;
      if (isN(A, 0)) return NUM(0);
      if (A.t === 'num' && B.t === 'num' && B.v !== 0) { const q = A.v / B.v; if (Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-9) return NUM(q); }
      if (A.t === 'neg') return { t: 'neg', a: { t: 'bin', op, a: A.a, b: B } };
      return { t: 'bin', op, a: A, b: B };
    }
    if (isN(B, 1)) return A;
    if (isN(B, 0)) return NUM(1);
    return { t: 'bin', op, a: A, b: B };
  }
  const PREC = (n) => (n.t === 'bin' ? (n.op === '+' || n.op === '-' ? 1 : n.op === '^' ? 4 : 2) : n.t === 'neg' || (n.t === 'num' && n.v < 0) ? 3 : 5);
  const leftNum = (n) => (n.t === 'num' ? true : n.t === 'bin' && n.op !== '+' && n.op !== '-' ? leftNum(n.a) : false);
  function pp(n) {
    const w = (c, need) => (PREC(c) < need ? `(${pp(c)})` : pp(c));
    if (n.t === 'num') return fmt(n.v, 3);
    if (n.t === 'var') return `<i>${n.n}</i>`;
    if (n.t === 'const') return n.n === 'pi' ? 'π' : '<i>e</i>';
    if (n.t === 'neg') return '−' + w(n.a, 3);
    if (n.t === 'fn') {
      if (n.n === 'abs') return `|${pp(n.a)}|`;
      if (n.n === 'sqrt') return `√(${pp(n.a)})`;
      if (n.n === 'exp') return `<i>e</i><sup>${pp(n.a)}</sup>`;
      return `${n.n}(${pp(n.a)})`;
    }
    if (n.op === '+') return `${w(n.a, 1)} + ${w(n.b, 1)}`;
    if (n.op === '-') return `${w(n.a, 1)} − ${w(n.b, 2)}`;
    if (n.op === '*') { const r = w(n.b, 2); return w(n.a, 2) + (leftNum(n.b) && PREC(n.b) >= 2 ? ' × ' : '') + r; }
    if (n.op === '/') return `${w(n.a, 2)}/${w(n.b, 3)}`;
    return `${w(n.a, 5)}<sup>${pp(n.b)}</sup>`;
  }
  const show = (ast, env) => pp(simp(ast, env));
  function linStr(m, k) {
    let s = '';
    if (Math.abs(m) > 1e-12) s = (Math.abs(m - 1) < 1e-12 ? '' : Math.abs(m + 1) < 1e-12 ? '−' : fmt(m)) + '<i>x</i>';
    if (Math.abs(k) > 1e-12 || !s) s += s ? (k < 0 ? ' − ' : ' + ') + fmt(Math.abs(k)) : fmt(k);
    return s;
  }
  function polyStr(cs) {
    // cs: highest power first
    const n = cs.length - 1;
    let s = '';
    cs.forEach((c, i) => {
      const p = n - i;
      if (Math.abs(c) < 1e-12) return;
      const sign = c < 0 ? (s ? ' − ' : '−') : s ? ' + ' : '';
      const a = Math.abs(c);
      const coef = p > 0 && Math.abs(a - 1) < 1e-12 ? '' : fmt(a);
      s += sign + coef + (p > 0 ? '<i>x</i>' : '') + (p > 1 ? `<sup>${p}</sup>` : '');
    });
    return s || '0';
  }

  // ---------------------------------------------------------------- the model (pure: used by validate, keys and mount)
  const OPS = ['<', '<=', '>', '>='];
  const LTEST = [[0.7, -1.3], [-2.1, 2.9], [3.3, 1.7], [-4.2, -3.6]];
  function linCoef(g, env) {
    const at = (x, y) => g(Object.assign({}, env, { x, y }));
    const r = at(0, 0), p = at(1, 0) - r, q = at(0, 1) - r;
    const ok = [r, p, q].every(Number.isFinite) && LTEST.every(([x, y]) => { const v = at(x, y); return Number.isFinite(v) && Math.abs(v - (p * x + q * y + r)) < 1e-7 * (1 + Math.abs(v)); });
    return { p: rd(p), q: rd(q), r: rd(r), ok };
  }
  // g(x, y) = q·y + h(x) with q a constant: the boundary is y = −h(x)/q (or a vertical line when q = 0 and h is linear).
  function yLinear(g, env) {
    const at = (x, y) => g(Object.assign({}, env, { x, y }));
    const xs = [-3.7, -1.1, 0.4, 2.6, 5.2];
    const q = at(0.4, 1) - at(0.4, 0);
    if (!Number.isFinite(q)) return { ok: false };
    for (const x of xs) {
      const h = at(x, 0);
      if (!Number.isFinite(h)) continue;
      for (const y of [-2.3, 1.9, 4.4]) { const v = at(x, y); if (!Number.isFinite(v) || Math.abs(v - (q * y + h)) > 1e-7 * (1 + Math.abs(v))) return { ok: false }; }
    }
    if (Math.abs(q) < 1e-12) { const lc = linCoef(g, env); if (!lc.ok || Math.abs(lc.p) < 1e-12) return { ok: false }; return { ok: true, q: 0, p: lc.p, r: lc.r }; }
    return { ok: true, q: rd(q) };
  }
  const levels = (r) => { const [lo, hi, st] = r; return [...new Set([lo, (lo + st) / 2, st, (st + hi) / 2, hi].map((v) => rd(v, 1e6)))]; };
  function combos(P, names) {
    let out = [{}];
    names.forEach((k) => { const nx = []; out.forEach((e) => levels(P[k]).forEach((v) => nx.push(Object.assign({}, e, { [k]: v })))); out = nx; });
    return out;
  }
  const startEnv = (P) => Object.fromEntries(Object.keys(P).map((k) => [k, P[k][2]]));
  const stripY = (rel) => {
    if (rel.e) return rel.e;
    if (rel.op === '=' && rel.L.t === 'var' && rel.L.n === 'y' && !vars(rel.R).has('y')) return rel.R;
    if (rel.op === '=' && rel.R.t === 'var' && rel.R.n === 'y' && !vars(rel.L).has('y')) return rel.L;
    return null;
  };
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');

  function prepare(c) {
    const errs = [];
    const R = { errs, mode: c && c.mode, P: {}, parts: [] };
    if (!c || typeof c !== 'object' || Array.isArray(c)) { errs.push('config must be an object'); return R; }
    Object.keys(c).forEach((k) => { if (!['mode', 'expr', 'params', 'points'].includes(k)) errs.push('unknown key: ' + k); });
    const mode = c.mode;
    if (!MODES.includes(mode)) { errs.push(`mode must be one of ${MODES.join(', ')}`); return R; }
    // points
    if (c.points != null) {
      if (!Array.isArray(c.points) || c.points.length > 26) errs.push('points: an array of at most 26 [x, y] pairs');
      else c.points.forEach((p, i) => { if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000)) errs.push(`points[${i}]: must be [x, y], two numbers between −1000 and 1000`); });
    }
    if (c.params != null && (typeof c.params !== 'object' || Array.isArray(c.params))) { errs.push('params: an object { a?, b?, c? }'); return R; }
    const given = c.params || {};
    Object.keys(given).forEach((k) => {
      if (!PARAMS.includes(k)) { errs.push(`params: unknown parameter "${k}" (use a, b or c)`); return; }
      const r = given[k];
      if (!Array.isArray(r) || (r.length !== 3 && r.length !== 4) || !r.every((v) => typeof v === 'number' && Number.isFinite(v))) { errs.push(`params.${k}: must be [min, max, start] or [min, max, start, step], numbers`); return; }
      const [lo, hi, st, sp] = r;
      if (!(lo < hi)) errs.push(`params.${k}: min must be less than max`);
      if (st < lo || st > hi) errs.push(`params.${k}: start must be between min and max`);
      if (Math.abs(lo) > 1e4 || Math.abs(hi) > 1e4) errs.push(`params.${k}: keep values between −10000 and 10000`);
      if (sp != null && !(sp > 0 && sp <= hi - lo)) errs.push(`params.${k}: step must be more than 0 and at most max − min`);
    });
    if (errs.length) return R;
    if (mode === 'points') {
      if (c.expr != null) errs.push('points mode takes no expr');
      if (Object.keys(given).length) errs.push('points mode takes no params');
      return R;
    }
    if (c.expr != null && (typeof c.expr !== 'string' || !c.expr.trim() || c.expr.length > 200)) { errs.push('expr: a non-empty string of at most 200 characters'); return R; }
    const src = c.expr != null ? c.expr : DEF[mode].expr;
    R.isDefault = c.expr == null || norm(c.expr) === norm(DEF[mode].expr);
    R.src = src;
    let rels = [];
    try {
      let s = src;
      if (mode === 'lp') {
        const m = s.trim().match(/^(max|min|maximise|maximize|minimise|minimize)\b\s*(z\s*=\s*)?/i);
        if (!m) { errs.push('lp: expr must start with "max" or "min" and the objective, e.g. "max 3x + 2y; x + y <= 4"'); return R; }
        R.dir = m[1].toLowerCase().startsWith('max') ? 'max' : 'min';
        s = s.trim().slice(m[0].length);
      }
      rels = s.split(';').map((p) => p.trim()).filter(Boolean).map(parseRel);
    } catch (e) { errs.push('expr: ' + e.message); return R; }
    const used = new Set();
    rels.forEach((r) => [r.e, r.L, r.R].filter(Boolean).forEach((n) => vars(n).forEach((v) => used.add(v))));
    const usedP = PARAMS.filter((k) => used.has(k));
    const limits = mode === 'integral';
    if (limits && (used.has('a') || used.has('b'))) { errs.push('integral: a and b are the limits of the area; the curve may use c only'); return R; }
    if (['lp'].includes(mode) && usedP.length) { errs.push('lp: the objective and the constraints take plain numbers, no a, b or c'); return R; }
    const need = limits ? ['a', 'b'].concat(usedP) : usedP;
    Object.keys(given).forEach((k) => { if (!need.includes(k)) errs.push(`params.${k}: the expression does not use ${k}, so its slider would do nothing`); });
    need.forEach((k) => { R.P[k] = (given[k] || DEF[mode].params[k] || GENERIC).slice(); });
    if (errs.length) return R;
    const envs = need.length ? combos(R.P, need) : [{}];
    const env0 = startEnv(R.P);
    const noY = (n) => !vars(n).has('y');

    if (FNMODES.includes(mode) && mode !== 'line') {
      if (rels.length !== 1) { errs.push(`${mode}: expr must be one curve y = f(x)`); return R; }
      const f = stripY(rels[0]);
      if (!f || !noY(f)) { errs.push(`${mode}: write the curve as y = f(x) or just f(x), using x`); return R; }
      R.f = f;
      R.fc = safe(comp(f));
      if (!vars(f).has('x')) errs.push(`${mode}: the expression must use x`);
      const [x0, x1] = limits ? [Math.min(-1, R.P.a[0]) - 1, Math.max(1, R.P.b[1]) + 1] : XR[mode];
      R.xr = [x0, x1];
      const finiteShare = (env) => { let n = 0; for (let i = 0; i <= 200; i++) if (Number.isFinite(R.fc(Object.assign({}, env, { x: x0 + ((x1 - x0) * i) / 200 })))) n++; return n / 201; };
      if (finiteShare(env0) < 0.1) errs.push(`${mode}: the curve has (almost) no real values in view at the start; check the expression and the start values`);
      if (mode === 'quadratic') {
        const bad = envs.find((e) => degree(R.fc, e) > 2);
        if (bad) errs.push('quadratic: the expression must be a polynomial of degree 2 in x (like a*x^2 + b*x + c)');
        else if (Math.abs(quadCoef(R.fc, env0).A) < 1e-12) errs.push('quadratic: at the start the x² term is 0, so it is not a quadratic; change the start values');
      }
      if (mode === 'polynomial' && envs.some((e) => degree(R.fc, e) > 6)) errs.push('polynomial: the expression must be a polynomial in x of degree at most 6 (no sin, log, 1/x or roots)');
      if (mode === 'trig' && !hasFn(f, ['sin', 'cos', 'tan'])) errs.push('trig: the expression must use sin, cos or tan');
      if (mode === 'exp-log' && !hasFn(f, ['exp', 'ln', 'log']) && !xInExp(f)) errs.push('exp-log: the expression must be exponential or logarithmic (exp, ln, log, or a number to the power x)');
      if (mode === 'exp-log' && xInExp(f)) {
        // a base that can go to 0 or below has no real power curve
        const bases = [];
        (function walk(n) { if (n.t === 'bin' && n.op === '^' && vars(n.b).has('x')) bases.push(n.a); if (n.a) walk(n.a); if (n.b) walk(n.b); })(f);
        if (envs.some((e) => bases.some((b) => vars(b).has('x') ? false : !(comp(b)(Object.assign({}, e, { x: 0 })) > 0)))) errs.push('exp-log: the base of a power of x must stay above 0 for every slider value');
      }
      if (limits) {
        const [, , a0] = R.P.a, [, , b0] = R.P.b;
        if (a0 === b0) errs.push('integral: the start values of a and b are the same, so there is no area to show');
      }
      return R;
    }
    if (mode === 'line' || mode === 'pair') {
      const want = mode === 'line' ? 1 : 2;
      if (rels.length !== want) { errs.push(mode === 'line' ? 'line: expr must be one straight line' : 'pair: expr must be two straight lines joined by ";"'); return R; }
      rels.forEach((r, i) => {
        let g;
        if (r.e) { if (!noY(r.e)) { errs.push(`${mode}: line ${i + 1}: write it as y = … or as an equation like 2x + 3y = 6`); return; } g = sub({ t: 'var', n: 'y' }, r.e); }
        else if (r.op === '=') g = sub(r.L, r.R);
        else { errs.push(`${mode}: line ${i + 1}: use "=", not an inequality`); return; }
        const gc = safe(comp(g));
        if (envs.some((e) => !linCoef(gc, e).ok)) { errs.push(`${mode}: line ${i + 1} is not a straight line (x and y may only appear to the first power)`); return; }
        const lc = linCoef(gc, env0);
        if (Math.abs(lc.p) < 1e-12 && Math.abs(lc.q) < 1e-12) { errs.push(`${mode}: line ${i + 1} has no x and no y at the start, so it is not a line`); return; }
        R.parts.push({ g, gc, rel: r });
      });
      return R;
    }
    if (mode === 'inequality') {
      if (!rels.length || rels.length > 4) { errs.push('inequality: one to four inequalities joined by ";"'); return R; }
      rels.forEach((r, i) => {
        if (!r.op || !OPS.includes(r.op)) { errs.push(`inequality ${i + 1}: needs one of <, <=, >, >=`); return; }
        const g = sub(r.L, r.R);
        const gc = safe(comp(g));
        if (!vars(g).has('x') && !vars(g).has('y')) { errs.push(`inequality ${i + 1}: must use x or y`); return; }
        if (envs.some((e) => !yLinear(gc, e).ok)) { errs.push(`inequality ${i + 1}: the template draws inequalities that are straight-line or of the form y < f(x)`); return; }
        R.parts.push({ g, gc, rel: r, op: r.op });
      });
      return R;
    }
    // lp
    if (rels.length < 2 || rels.length > 9) { errs.push('lp: the objective and one to eight constraints'); return R; }
    const [obj, ...cons] = rels;
    if (!obj.e) { errs.push('lp: the objective is an expression like 3x + 2y'); return R; }
    const oc = safe(comp(obj.e));
    const ol = linCoef((e) => oc(e), {});
    if (!ol.ok) { errs.push('lp: the objective must be linear in x and y'); return R; }
    if (Math.abs(ol.p) < 1e-12 && Math.abs(ol.q) < 1e-12) { errs.push('lp: the objective must use x or y'); return R; }
    R.obj = { ast: obj.e, p: ol.p, q: ol.q, r: ol.r };
    cons.forEach((r, i) => {
      if (r.op !== '<=' && r.op !== '>=') { errs.push(`lp: constraint ${i + 1} needs <= or >=`); return; }
      const g = sub(r.L, r.R);
      const lc = linCoef(safe(comp(g)), {});
      if (!lc.ok || (Math.abs(lc.p) < 1e-12 && Math.abs(lc.q) < 1e-12)) { errs.push(`lp: constraint ${i + 1} must be a straight-line inequality in x and y`); return; }
      // stored as p·x + q·y + r ≤ 0
      const s = r.op === '<=' ? 1 : -1;
      R.parts.push({ rel: r, p: s * lc.p, q: s * lc.q, r: s * lc.r });
    });
    if (errs.length) return R;
    R.lp = solveLP(R);
    if (!R.lp.poly.length) errs.push('lp: no point satisfies all the constraints together with x ≥ 0, y ≥ 0 (the feasible region is empty)');
    return R;
  }
  // degree by finite differences (∞ when not a polynomial of degree ≤ 6)
  function degree(f, env) {
    const h = 0.73, x0 = -2.2;
    let v = [];
    for (let i = 0; i <= 8; i++) v.push(f(Object.assign({}, env, { x: x0 + i * h })));
    if (!v.every(Number.isFinite)) return Infinity;
    const scale = Math.max(1, ...v.map(Math.abs));
    for (let d = 0; d <= 7; d++) {
      if (v.every((t) => Math.abs(t) < 1e-8 * scale)) return d - 1;
      v = v.slice(1).map((t, i) => t - v[i]);
    }
    return Infinity;
  }
  function quadCoef(f, env) {
    const at = (x) => f(Object.assign({}, env, { x }));
    const C = at(0), A = (at(1) + at(-1)) / 2 - C, B = (at(1) - at(-1)) / 2;
    return { A: rd(A), B: rd(B), C: rd(C) };
  }
  // half-plane clipping of the big box [0, BIG]² (x ≥ 0, y ≥ 0 come free)
  const BIG = 1e4;
  function solveLP(R) {
    let poly = [[0, 0], [BIG, 0], [BIG, BIG], [0, BIG]];
    R.parts.forEach(({ p, q, r }) => {
      const val = ([x, y]) => p * x + q * y + r;
      const out = [];
      poly.forEach((A, i) => {
        const B = poly[(i + 1) % poly.length];
        const va = val(A), vb = val(B);
        if (va <= 1e-9) out.push(A);
        if ((va <= 1e-9) !== (vb <= 1e-9)) { const t = va / (va - vb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
      });
      poly = out.filter((P, i, a) => { const Q = a[(i + 1) % a.length]; return a.length < 2 || Math.hypot(P[0] - Q[0], P[1] - Q[1]) > 1e-9; });
    });
    poly = poly.map(([x, y]) => [rd(x, 1e8), rd(y, 1e8)]);
    const far = (P) => P[0] >= BIG * 0.999 || P[1] >= BIG * 0.999;
    const Z = ([x, y]) => R.obj.p * x + R.obj.q * y + R.obj.r;
    const corners = poly.filter((P) => !far(P));
    const unbounded = poly.some(far);
    let best = null;
    if (poly.length) {
      const zs = poly.map(Z);
      const bz = R.dir === 'max' ? Math.max(...zs) : Math.min(...zs);
      const at = poly.filter((P, i) => Math.abs(zs[i] - bz) < 1e-7 * (1 + Math.abs(bz)));
      best = at.some(far) ? null : { z: rd(bz, 1e8), at };
    }
    return { poly, corners, unbounded, best, Z };
  }

  // ---------------------------------------------------------------- numeric analysis of y = f(x) in a window
  function scan(f, x0, x1, ys) {
    const N = 480;
    const xs = [], vs = [];
    for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; xs.push(x); vs.push(f(x)); }
    const tol = 1e-7 * (1 + ys);
    const roots = [];
    const addR = (x) => { if (!roots.some((r) => Math.abs(r - x) < (x1 - x0) * 2e-4)) roots.push(x); };
    for (let i = 0; i < N; i++) {
      let a = xs[i], b = xs[i + 1], fa = vs[i], fb = vs[i + 1];
      if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
      if (fa === 0) { addR(a); continue; }
      if (fa * fb < 0) {
        for (let k = 0; k < 70; k++) { const m = (a + b) / 2, fm = f(m); if (!Number.isFinite(fm)) break; if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
        const m = (a + b) / 2;
        if (Math.abs(f(m)) < tol * 10) addR(m);
      }
    }
    // touching roots: local minima of |f| that reach 0
    for (let i = 1; i < N; i++) {
      const u = Math.abs(vs[i]);
      if (!(u <= Math.abs(vs[i - 1]) && u <= Math.abs(vs[i + 1])) || u > ys * 0.05) continue;
      let a = xs[i - 1], b = xs[i + 1];
      const g = (x) => Math.abs(f(x));
      for (let k = 0; k < 80; k++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; if (g(m1) < g(m2)) b = m2; else a = m1; }
      const m = (a + b) / 2;
      if (g(m) < tol) addR(m);
    }
    // turning points from the sign of the slope
    const h = (x1 - x0) * 1e-6;
    const d = (x) => (f(x + h) - f(x - h)) / (2 * h);
    const max = [], min = [];
    let pd = null, px = null;
    for (let i = 1; i < N; i++) {
      const x = xs[i];
      const dv = d(x);
      if (!Number.isFinite(dv) || !Number.isFinite(vs[i])) { pd = null; continue; }
      if (dv === 0) continue;
      if (pd != null && pd * dv < 0) {
        let a = px, b = x, da = pd;
        for (let k = 0; k < 60; k++) { const m = (a + b) / 2, dm = d(m); if (!Number.isFinite(dm)) break; if (da * dm <= 0) b = m; else { a = m; da = dm; } }
        const m = (a + b) / 2, fm = f(m);
        if (Number.isFinite(fm) && Math.abs(fm) < ys * 50) (pd > 0 ? max : min).push({ x: m, y: fm });
      }
      pd = dv; px = x;
    }
    return { roots: roots.sort((p, q) => p - q).map((x) => ({ x, y: 0 })), max, min };
  }
  function simpson(f, a, b) {
    if (a === b) return 0;
    const n = 2000, h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    const v = (s * h) / 3;
    return Number.isFinite(v) ? v : NaN;
  }

  // ---------------------------------------------------------------- which events can really happen (for keys)
  function possible(R) {
    const ev = { root: false, max: false, min: false, intersect: false };
    const names = Object.keys(R.P).filter((k) => !(R.mode === 'integral' && (k === 'a' || k === 'b')));
    const envs = names.length ? combos(R.P, names) : [{}];
    if (R.mode === 'pair') {
      envs.forEach((e) => { const [A, B] = R.parts.map((p) => linCoef(p.gc, e)); if (Math.abs(A.p * B.q - B.p * A.q) > 1e-9) ev.intersect = true; });
      return ev;
    }
    if (R.mode === 'line') {
      envs.forEach((e) => { const A = linCoef(R.parts[0].gc, e); if (Math.abs(A.p) > 1e-12) ev.root = true; });
      return ev;
    }
    if (R.mode === 'quadratic') {
      envs.forEach((e) => { const { A, B, C } = quadCoef(R.fc, e); if (A > 0) ev.min = true; if (A < 0) ev.max = true; if (B * B - 4 * A * C >= 0 || (A === 0 && B !== 0)) ev.root = true; });
      return ev;
    }
    const [x0, x1] = R.xr, w = x1 - x0;
    envs.slice(0, 125).forEach((e) => {
      const f = (x) => R.fc(Object.assign({}, e, { x }));
      const s = scan(f, x0 - w, x1 + w, 10);
      if (s.roots.length) ev.root = true;
      if (s.max.length) ev.max = true;
      if (s.min.length) ev.min = true;
    });
    return ev;
  }

  // ---------------------------------------------------------------- words
  const W = {
    graph: T2('Graph', 'ग्राफ़'),
    zin: T2('Zoom in', 'पास से देखो'), zout: T2('Zoom out', 'दूर से देखो'), zreset: T2('Back to the start view', 'शुरू वाला दृश्य'),
    trace: T2('Move the point along the curve', 'बिंदु को वक्र पर चलाओ'), iso: T2('Slide the line Z = k', 'रेखा Z = k को खिसकाओ'),
    less: T2('less', 'कम'), more: T2('more', 'ज़्यादा'),
    tangentOn: T2('Show the tangent', 'स्पर्श रेखा दिखाओ'), tangentOff: T2('Hide the tangent', 'स्पर्श रेखा छिपाओ'),
    areaOn: T2('Shade the area', 'क्षेत्रफल रंगो'), areaOff: T2('Hide the area', 'क्षेत्रफल छिपाओ'), rects: T2('Rectangles', 'आयत'),
    undo: T2('Undo last point', 'आख़िरी बिंदु हटाओ'), clear: T2('Clear', 'सब मिटाओ'),
    quiz: T2('Quick check', 'झटपट जाँच'), nextQ: T2('Try another', 'एक और करो'),
    right: T2('Right!', 'सही!'), wrong: T2('Not quite.', 'पूरी तरह सही नहीं।'),
    facts: T2('What the graph shows', 'ग्राफ़ क्या दिखाता है'),
    tapPlot: T2('Tap the graph paper to plot a point.', 'बिंदु बनाने के लिए ग्राफ़ पेपर पर टैप करो।'),
    tapTest: T2('Tap the graph to test any point.', 'किसी भी बिंदु को जाँचने के लिए ग्राफ़ पर टैप करो।'),
    dragTrace: T2('Drag the blue point, or use the slider.', 'नीले बिंदु को खींचो, या स्लाइडर चलाओ।'),
    origin: T2('the origin', 'मूल बिंदु'), onX: T2('on the x-axis', 'x-अक्ष पर'), onY: T2('on the y-axis', 'y-अक्ष पर'),
    yes: T2('Yes', 'हाँ'), no: T2('No', 'नहीं'),
  };
  const QN = [null, T2('quadrant I', 'पहला चतुर्थांश'), T2('quadrant II', 'दूसरा चतुर्थांश'), T2('quadrant III', 'तीसरा चतुर्थांश'), T2('quadrant IV', 'चौथा चतुर्थांश')];
  const QR = ['', 'I', 'II', 'III', 'IV'];
  const quadrant = (x, y) => (x === 0 && y === 0 ? 0 : x === 0 ? -2 : y === 0 ? -1 : x > 0 ? (y > 0 ? 1 : 4) : y > 0 ? 2 : 3);
  const PLAB = {
    line: { a: T2('slope m', 'ढलान m'), b: T2('cuts the y-axis at', 'y-अक्ष पर कटान') },
    quadratic: { a: T2('a: opens up or down, wide or narrow', 'a: ऊपर/नीचे खुलना, चौड़ा या पतला'), b: T2('b: moves it sideways', 'b: बगल में खिसकाता है'), c: T2('c: cuts the y-axis at', 'c: y-अक्ष पर कटान') },
    polynomial: { a: T2('first zero', 'पहला शून्यक'), b: T2('second zero', 'दूसरा शून्यक'), c: T2('third zero', 'तीसरा शून्यक') },
    trig: { a: T2('a: amplitude (height)', 'a: आयाम (ऊँचाई)'), b: T2('b: how fast it repeats', 'b: कितनी जल्दी दोहराता है'), c: T2('c: shift left or right', 'c: बाएँ-दाएँ खिसकाव') },
    'exp-log': { a: T2('base a', 'आधार a') },
    integral: { a: T2('from x = a', 'x = a से'), b: T2('to x = b', 'x = b तक'), c: T2('c: moves the curve up or down', 'c: वक्र को ऊपर-नीचे करता है') },
    derivative: { a: T2('a: changes where the curve turns', 'a: वक्र कहाँ मुड़ता है, यह बदलता है') },
  };

  // ---------------------------------------------------------------- CSS
  const CSS = `
.gr { container-type: inline-size; display: flex; flex-direction: column; gap: 12px; color: var(--ink); font-family: var(--font-body); }
.gr-eqs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.gr-eq { display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 14px; background: var(--surface); border: 1.5px solid var(--line); font: 600 1.12rem/1.3 var(--font-body); box-shadow: 0 2px 8px rgba(6,18,51,.06); max-width: 100%; overflow-wrap: anywhere; }
.gr-eq i { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 600; }
.gr-eq sup { font-size: .68em; line-height: 0; }
.gr-eq .gr-dot { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: 0 0 0 3px rgba(255,255,255,.7); }
.gr-eq.obj { background: linear-gradient(135deg, #1D4ED8, #8B3DFF); color: #fff; border: 0; }
.gr-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@container (min-width: 780px) { .gr-main { grid-template-columns: minmax(0, 1.6fr) minmax(270px, 1fr); align-items: start; } }
.gr-card { position: relative; border-radius: 20px; padding: 6px; background: linear-gradient(140deg, #8B3DFF 0%, #1D4ED8 55%, #02CFF9 100%); box-shadow: 0 10px 28px rgba(29,78,216,.22); }
.gr-svg { display: block; width: 100%; height: auto; border-radius: 15px; touch-action: pan-y; user-select: none; -webkit-user-select: none; font-family: var(--font-body); }
.gr-svg text { font-family: var(--font-body); }
.gr-svg [tabindex]:focus { outline: none; }
.gr-svg [tabindex]:focus-visible .gr-ring, .gr-svg .gr-hit:focus-visible { stroke: #FFD23F; stroke-width: 4; }
.gr-zoom { display: flex; justify-content: flex-end; gap: 8px; padding: 6px 4px 0; }
.gr-zb { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.94); color: #1E293B; display: grid; place-items: center; cursor: pointer; box-shadow: 0 3px 10px rgba(6,18,51,.25); transition: transform .12s; }
.gr-zb:hover { transform: translateY(-1px); }
.gr-zb:active { transform: scale(.94); }
.gr-zb svg { width: 22px; height: 22px; }
.gr-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.gr-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; box-shadow: 0 2px 10px rgba(6,18,51,.05); }
.gr-h { margin: 0 0 8px; font: 700 .95rem/1.2 var(--font-display); color: var(--ink-2); letter-spacing: .01em; }
.gr-sl-x { border-top: 1px dashed var(--line); padding-top: 10px; }
.gr-sl + .gr-sl { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.gr-sl-top { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.gr-chip { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #fff; font: italic 700 1.05rem Georgia, serif; flex: none; }
.gr-sl-name { flex: 1; min-width: 0; font-weight: 600; font-size: .92rem; color: var(--ink-2); line-height: 1.2; }
.gr-sl-val { font: 800 1.2rem var(--font-display); color: var(--ink); min-width: 3.2em; text-align: right; }
.gr-sl-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 6px; align-items: center; }
.gr-step { width: 44px; height: 44px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sunk); color: var(--ink); font: 800 1.3rem var(--font-body); cursor: pointer; display: grid; place-items: center; }
.gr-step:active { transform: scale(.94); }
.gr-range { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; cursor: pointer; margin: 0; }
.gr-range::-webkit-slider-runnable-track { height: 10px; border-radius: 99px; background: linear-gradient(90deg, var(--c) var(--p, 50%), var(--sunk) var(--p, 50%)); box-shadow: inset 0 1px 2px rgba(6,18,51,.15); }
.gr-range::-moz-range-track { height: 10px; border-radius: 99px; background: var(--sunk); }
.gr-range::-moz-range-progress { height: 10px; border-radius: 99px; background: var(--c); }
.gr-range::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -10px; border-radius: 50%; background: #fff; border: 4px solid var(--c); box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.gr-range::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 4px solid var(--c); box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.gr-range:focus-visible { outline: 3px solid #FFD23F; outline-offset: 2px; border-radius: 8px; }
.gr-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.gr-btn { min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px; font: 700 .95rem var(--font-body); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; color: #fff; background: linear-gradient(180deg, #A266FF, #8B3DFF); box-shadow: 0 2px 0 rgba(6,18,51,.2); transition: transform .12s, filter .12s; }
.gr-btn svg { width: 24px; height: 24px; flex: none; }
.gr-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.gr-btn:active { transform: translateY(1px); }
.gr-btn.alt { background: linear-gradient(180deg, #3ED1C0, #14B8A6); color: #1E293B; }
.gr-btn.on { background: linear-gradient(180deg, #3B6EEA, #1D4ED8); }
.gr-btn.ghost2 { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; }
.gr-btn[disabled] { opacity: .45; cursor: default; }
.gr-rect { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--ink-2); }
.gr-rect output { min-width: 2.2em; text-align: center; font: 800 1.1rem var(--font-display); color: var(--ink); }
.gr-facts { display: flex; flex-direction: column; gap: 6px; }
.gr-fact { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; font-size: .95rem; line-height: 1.3; }
.gr-fact > span:first-child { color: var(--ink-2); }
.gr-fact > b { font-weight: 800; text-align: right; overflow-wrap: anywhere; }
.gr-fact i { font-family: Georgia, serif; }
.gr-note { margin: 4px 0 0; font-size: .9rem; color: var(--ink-2); line-height: 1.35; }
.gr-tag { display: inline-block; border-radius: 999px; padding: 2px 10px; font-weight: 800; font-size: .85rem; color: #fff; }
.gr-q { margin: 0 0 10px; font-weight: 700; font-size: 1rem; line-height: 1.35; }
.gr-q i { font-family: Georgia, serif; }
.gr-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.gr-opt { min-height: 48px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sunk); color: var(--ink); font: 700 1rem var(--font-body); cursor: pointer; padding: 6px 10px; transition: transform .12s, background .2s; }
.gr-opt:hover { transform: translateY(-1px); }
.gr-opt.ok { background: #22C55E; border-color: #22C55E; color: #08201D; }
.gr-opt.no { background: #FF6B57; border-color: #FF6B57; color: #1E293B; }
.gr-fb { margin: 10px 0 0; font-size: .93rem; line-height: 1.4; }
.gr-fb b { margin-right: 4px; }
.gr-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gr-draw 1.1s cubic-bezier(.4,.1,.2,1) forwards; }
@keyframes gr-draw { to { stroke-dashoffset: 0; } }
.gr-pulse { animation: gr-pulse 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes gr-pulse { 0%, 100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.6); opacity: 0; } }
.gr-pop { animation: gr-pop .35s cubic-bezier(.3,1.6,.5,1); transform-box: fill-box; transform-origin: center; }
@keyframes gr-pop { from { transform: scale(0); } to { transform: scale(1); } }
.gr-err { padding: 16px; border-radius: 14px; background: var(--bad-t); color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .gr-draw { animation: none; stroke-dashoffset: 0; stroke-dasharray: none; } .gr-pulse, .gr-pop { animation: none; } .gr-btn, .gr-opt, .gr-zb { transition: none; } }`;

  const ICON = {
    zin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l5.5 5.5M7 10h6M10 7v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    zout: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l5.5 5.5M7 10h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    zreset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 3v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tangent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18c4-1 7-6 9-9s4-5 9-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M2 14l20-8" stroke="#FFD23F" stroke-width="2.2" stroke-linecap="round"/><circle cx="11" cy="10.4" r="2.4" fill="#FFD23F"/></svg>',
    area: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V14c4 0 6-8 11-8s5 4 7 4v10z" fill="currentColor" opacity=".55"/><path d="M3 14c4 0 6-8 11-8s5 4 7 4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M2 20h20" stroke="currentColor" stroke-width="2"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 11.5A8 8 0 1 1 7 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  };

  // ---------------------------------------------------------------- the view
  function grapher(root, cfg, api) {
    const R = prepare(cfg);
    const t = (x) => api.t(x);
    if (R.errs.length) { root.innerHTML = `<div class="gr-err">${esc(R.errs.join('; '))}</div>`; return { destroy() {} }; }
    const mode = R.mode;
    const pt = (x, y) => `(${fx(x, mode === 'trig')}, ${fmt(y)})`;
    const lang = () => (api.lang ? api.lang() : 'en');
    const P = R.P;
    const pnames = Object.keys(P);
    const S = {
      pv: startEnv(P), tx: 1, k: 0, tangent: false, area: false, rects: 0,
      pts: mode === 'points' ? (cfg.points || []).map((p) => p.slice()) : [], tests: [], cur: { x: 0, y: 0 }, curOn: false,
      quiz: null, prev: null, onFeat: null, first: true, tapped: new Set(), revealed: false, fresh: -1, dragging: false,
    };
    const DATA = mode === 'points' ? [] : cfg.points || [];
    const traceMode = FNMODES.includes(mode);
    let dims = { W: 640, H: 440, narrow: false };
    let V = null, V0 = null;
    let stopTween = null, ro = null;
    const lpData = R.lp;
    const stepOf = (k) => P[k][3] || ((P[k][1] - P[k][0]) <= 2.5 ? 0.05 : (P[k][1] - P[k][0]) <= 25 ? 0.1 : (P[k][1] - P[k][0]) <= 250 ? 1 : 10);
    const roundTo = (v, s) => rd(Math.round(v / s) * s, 1e6);

    // ---- current functions
    const env = () => S.pv;
    const f = (x) => (R.fc ? R.fc(Object.assign({}, S.pv, { x })) : NaN);
    const lineCoefs = () => R.parts.map((p) => linCoef(p.gc, env()));

    // ---- view
    function measure() {
      const w = root.clientWidth || 800;
      const narrow = w < 600;
      dims = narrow ? { W: 360, H: 400, narrow } : { W: 640, H: 500, narrow };
    }
    function equalY(v) { return Object.assign({}, v, { sy: (v.sx * dims.H) / dims.W }); }
    function initView() {
      const { W, H } = dims;
      let v;
      if (mode === 'lp') {
        const xs = [1], ys = [1];
        lpData.corners.forEach(([x, y]) => { xs.push(x); ys.push(y); });
        R.parts.forEach(({ p, q, r }) => { if (Math.abs(p) > 1e-12 && -r / p > 0) xs.push(-r / p); if (Math.abs(q) > 1e-12 && -r / q > 0) ys.push(-r / q); });
        let X = Math.max(...xs), Y = Math.max(...ys);
        if (lpData.unbounded) { X *= 1.5; Y *= 1.5; }
        const sx = Math.max(X * 1.32, (Y * 1.32 * W) / H);
        const sy = (sx * H) / W;
        return { cx: -0.12 * sx + sx / 2, cy: -0.12 * sy + sy / 2, sx, sy, eq: true };
      }
      if (EQUAL.includes(mode)) {
        let sx = mode === 'points' ? (dims.narrow ? 12 : 16) : mode === 'exp-log' ? 12 : 16;
        const all = (mode === 'points' ? S.pts : DATA).concat([[0, 0]]);
        const mx = Math.max(...all.map((p) => Math.abs(p[0])), 1), my = Math.max(...all.map((p) => Math.abs(p[1])), 1);
        sx = Math.max(sx, mx * 2.3, (my * 2.3 * W) / H);
        if (mode === 'line' || mode === 'inequality') { /* keep 16 */ }
        v = equalY({ cx: 0, cy: 0, sx, eq: true });
        return v;
      }
      const [x0, x1] = R.xr;
      const xs = DATA.map((p) => p[0]);
      const lo = Math.min(x0, ...xs), hi = Math.max(x1, ...xs);
      const sx = hi - lo;
      // y from the curve at the start (robust percentiles), turning points and data points
      const vals = [];
      if (mode === 'trig') {
        combos(P, pnames.filter((k) => k === 'a')).forEach((e) => { for (let i = 0; i <= 300; i++) { const y = R.fc(Object.assign({}, S.pv, e, { x: lo + (sx * i) / 300 })); if (Number.isFinite(y)) vals.push(y); } });
      } else {
        for (let i = 0; i <= 300; i++) { const y = f(lo + (sx * i) / 300); if (Number.isFinite(y)) vals.push(y); }
      }
      vals.sort((p, q) => p - q);
      const qt = (p) => vals[Math.floor(p * (vals.length - 1))] || 0;
      let ylo, yhi;
      if (mode === 'trig') {
        ylo = Math.min(0, qt(0.02)); yhi = Math.max(0, qt(0.98));
        const span = Math.max(yhi - ylo, 2);
        ylo -= span * 0.14; yhi += span * 0.14;
      } else {
        // fit the zeros, turning points and the y-intercept, then give the arms room
        const an = scan(f, lo, hi, Math.max(1, qt(0.9) - qt(0.1)));
        const ys = [0].concat(an.max.map((p) => p.y), an.min.map((p) => p.y), DATA.map((p) => p[1]));
        const y0 = f(clamp(0, lo, hi));
        if (Number.isFinite(y0)) ys.push(y0);
        if (mode === 'integral') [P.a[2], P.b[2]].forEach((x) => { const v = f(x); if (Number.isFinite(v)) ys.push(v); });
        ylo = Math.min(...ys); yhi = Math.max(...ys);
        const S2 = Math.max(yhi - ylo, sx * 0.8, 4);
        const nAb = vals.filter((v) => v > yhi).length, nBe = vals.filter((v) => v < ylo).length;
        const extra = S2 - (yhi - ylo);
        const up = clamp((nAb + 1) / (nAb + nBe + 2), 0.15, 0.85);
        yhi += extra * up; ylo -= extra * (1 - up);
        const pad = S2 * 0.1;
        ylo -= pad; yhi += pad;
      }
      return { cx: (lo + hi) / 2, cy: (ylo + yhi) / 2, sx, sy: yhi - ylo, eq: false };
    }
    const vx0 = () => V.cx - V.sx / 2, vx1 = () => V.cx + V.sx / 2, vy0 = () => V.cy - V.sy / 2, vy1 = () => V.cy + V.sy / 2;
    const X = (x) => ((x - vx0()) / V.sx) * dims.W;
    const Y = (y) => dims.H - ((y - vy0()) / V.sy) * dims.H;
    const IX = (px) => vx0() + (px / dims.W) * V.sx;
    const IY = (py) => vy0() + ((dims.H - py) / dims.H) * V.sy;
    const n2 = (v) => Math.round(v * 10) / 10;

    // ---- analysis of the current state
    function analyse() {
      const A = { roots: [], max: [], min: [], feats: [] };
      if (mode === 'line') {
        const [l] = lineCoefs();
        A.line = l;
        if (Math.abs(l.q) > 1e-12) {
          A.m = rd(-l.p / l.q); A.k = rd(-l.r / l.q);
          if (Math.abs(A.m) > 1e-12) A.roots.push({ x: rd(-A.k / A.m), y: 0 });
        } else if (Math.abs(l.p) > 1e-12) { A.vert = rd(-l.r / l.p); A.roots.push({ x: A.vert, y: 0 }); }
      } else if (mode === 'pair') {
        const [l1, l2] = lineCoefs();
        A.lines = [l1, l2];
        const det = l1.p * l2.q - l2.p * l1.q;
        if (Math.abs(det) > 1e-9) { A.type = 'one'; A.ix = { x: rd((l1.q * l2.r - l2.q * l1.r) / det), y: rd((l2.p * l1.r - l1.p * l2.r) / det) }; }
        else {
          const c1 = l1.p * l2.r - l2.p * l1.r, c2 = l1.q * l2.r - l2.q * l1.r;
          A.type = Math.abs(c1) < 1e-9 && Math.abs(c2) < 1e-9 ? 'same' : 'none';
        }
      } else if (mode === 'quadratic') {
        const q = quadCoef(R.fc, env());
        Object.assign(A, q);
        if (Math.abs(q.A) > 1e-12) {
          A.h = rd(-q.B / (2 * q.A)); A.vk = rd(f(A.h)); A.D = rd(q.B * q.B - 4 * q.A * q.C);
          if (A.D > 1e-9) { const s = Math.sqrt(A.D); [(-q.B - s) / (2 * q.A), (-q.B + s) / (2 * q.A)].sort((p, r) => p - r).forEach((x) => A.roots.push({ x: rd(x), y: 0 })); }
          else if (Math.abs(A.D) <= 1e-9) A.roots.push({ x: A.h, y: 0 });
          (q.A > 0 ? A.min : A.max).push({ x: A.h, y: A.vk });
        } else if (Math.abs(q.B) > 1e-12) A.roots.push({ x: rd(-q.C / q.B), y: 0 });
      } else if (CURVE.includes(mode)) {
        const s = scan(f, vx0(), vx1(), V.sy);
        A.roots = s.roots; A.max = s.max; A.min = s.min;
      } else if (mode === 'inequality') {
        A.parts = R.parts.map((p) => {
          const y = yLinear(p.gc, env());
          return Object.assign({ op: p.op, strict: p.op.length === 1 }, y);
        });
      }
      A.roots.forEach((p) => A.feats.push(Object.assign({ kind: 'root' }, p)));
      A.max.forEach((p) => A.feats.push(Object.assign({ kind: 'max' }, p)));
      A.min.forEach((p) => A.feats.push(Object.assign({ kind: 'min' }, p)));
      if (A.ix) A.feats.push(Object.assign({ kind: 'intersect' }, A.ix));
      A.feats = A.feats.filter((p) => p.x >= vx0() && p.x <= vx1());
      return A;
    }
    // y on the line(s) for the trace in line mode
    const traceY = (x, A) => (mode === 'line' ? (A.vert != null ? NaN : A.m * x + A.k) : f(x));
    const satisfies = (x, y) => R.parts.every((p) => {
      const v = p.gc(Object.assign({}, env(), { x, y }));
      if (!Number.isFinite(v)) return false;
      const e = Math.abs(v) < 1e-9 ? 0 : v;
      return p.op === '<' ? e < 0 : p.op === '<=' ? e <= 0 : p.op === '>' ? e > 0 : e >= 0;
    });

    // ---- markup
    const hasTangent = mode === 'derivative';
    const hasArea = mode === 'integral';
    const plab = (k) => (R.isDefault && PLAB[mode] && PLAB[mode][k] ? t(PLAB[mode][k]) : `${k}`);
    function sliderRow(k, label, val, lo, hi, step) {
      const p = ((val - lo) / (hi - lo)) * 100;
      return `<div class="gr-sl" data-key="slider:${k}" style="--c:${PCOL[k]}">
        <div class="gr-sl-top"><span class="gr-chip" style="background:${PCOL[k]}" aria-hidden="true">${k === 'x' ? (mode === 'lp' ? 'Z' : 'x') : k}</span><span class="gr-sl-name">${esc(label)}</span><output class="gr-sl-val" data-out="${k}">${fmt(val)}</output></div>
        <div class="gr-sl-row"><button type="button" class="gr-step" data-act="dec" data-p="${k}" aria-label="${esc(label)}: ${esc(t(W.less))}">−</button>
        <input class="gr-range" type="range" data-p="${k}" min="${lo}" max="${hi}" step="${step}" value="${val}" style="--p:${p}%" aria-label="${esc(label)}">
        <button type="button" class="gr-step" data-act="inc" data-p="${k}" aria-label="${esc(label)}: ${esc(t(W.more))}">+</button></div></div>`;
    }
    function build() {
      measure();
      V0 = initView();
      V = Object.assign({}, V0);
      if (mode === 'lp') {
        S.lpRange = lpRange();
        S.k = R.dir === 'max' ? S.lpRange[0] : S.lpRange[1];
      }
      if (traceMode) {
        const lo = vx0(), hi = vx1();
        S.A = analyse();
        const cands = (mode === 'integral' ? [(P.a[2] + P.b[2]) / 2 - lo] : []).map((v) => v / (hi - lo)).concat([0.72, 0.3, 0.82, 0.62, 0.2, 0.9]);
        const okAt = (x) => { const y = traceY(x, S.A); return Number.isFinite(y) && inView(x, y) && S.A.feats.every((p) => Math.abs(p.x - x) > (hi - lo) * 0.1); };
        const pick = cands.map((c) => rd(Math.round((lo + (hi - lo) * c) * 10) / 10, 1e6)).find(okAt);
        S.tx = pick != null ? pick : rd(Math.round((lo + (hi - lo) * 0.72) * 10) / 10, 1e6);
      }
      const sliders = pnames.map((k) => sliderRow(k, plab(k), S.pv[k], P[k][0], P[k][1], stepOf(k))).join('');
      const acts = [];
      if (hasTangent) acts.push(`<button type="button" class="gr-btn" data-key="tangent" data-act="tangent">${ICON.tangent}<span></span></button>`);
      if (hasArea) acts.push(`<button type="button" class="gr-btn alt" data-key="area" data-act="area">${ICON.area}<span></span></button>
        <span class="gr-rect" data-key="area"><span>${esc(t(W.rects))}</span><button type="button" class="gr-step" data-act="rdec" aria-label="${esc(t(W.rects))}: ${esc(t(W.less))}">−</button><output data-out="rects">0</output><button type="button" class="gr-step" data-act="rinc" aria-label="${esc(t(W.rects))}: ${esc(t(W.more))}">+</button></span>`);
      if (mode === 'points' || mode === 'inequality') acts.push(`<button type="button" class="gr-btn ghost2" data-key="point:undo" data-act="undo">${ICON.undo}<span>${esc(t(W.undo))}</span></button>`);
      root.innerHTML = `<div class="gr">
        <div class="gr-eqs"></div>
        <div class="gr-main">
          <div class="gr-card"><svg class="gr-svg" role="group" aria-label="${esc(t(W.graph))}"></svg>
            <div class="gr-zoom"><button type="button" class="gr-zb" data-key="zoom" data-act="zin" aria-label="${esc(t(W.zin))}" title="${esc(t(W.zin))}">${ICON.zin}</button><button type="button" class="gr-zb" data-key="zoom" data-act="zout" aria-label="${esc(t(W.zout))}" title="${esc(t(W.zout))}">${ICON.zout}</button><button type="button" class="gr-zb" data-key="zoom" data-act="zreset" aria-label="${esc(t(W.zreset))}" title="${esc(t(W.zreset))}">${ICON.zreset}</button></div>
          </div>
          <div class="gr-side">
            ${sliders || traceMode || mode === 'lp' ? `<div class="gr-panel gr-sls">${sliders}<div class="gr-trace"></div></div>` : ''}
            ${acts.length ? `<div class="gr-acts">${acts.join('')}</div>` : ''}
            <div class="gr-panel"><h3 class="gr-h">${esc(t(W.facts))}</h3><div class="gr-facts" aria-live="polite"></div></div>
            <div class="gr-panel gr-quiz"><h3 class="gr-h">${esc(t(W.quiz))}</h3><div class="gr-qbody"></div></div>
          </div>
        </div></div>`;
      svg = root.querySelector('svg');
      traceRow();
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
    }
    let svg = null;
    function lpRange() {
      const zs = lpData.corners.map(lpData.Z);
      let lo = Math.min(...zs), hi = Math.max(...zs);
      if (lpData.unbounded && !lpData.best) { const r = hi - lo || 10; if (R.dir === 'max') hi += r; else lo -= r; }
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      return [rd(lo, 1e6), rd(hi, 1e6)];
    }
    function traceRange() {
      if (mode === 'lp') { const [lo, hi] = S.lpRange; return { lo, hi, step: rd((hi - lo) / 200, 1e6) }; }
      const lo = vx0(), hi = vx1();
      return { lo, hi, step: (hi - lo) / 400 };
    }
    function traceRow() {
      const box = root.querySelector('.gr-trace');
      if (!box) return;
      if (!traceMode && mode !== 'lp') { box.innerHTML = ''; return; }
      const { lo, hi, step } = traceRange();
      const val = mode === 'lp' ? S.k : S.tx;
      box.innerHTML = (pnames.length ? '<div style="height:10px"></div>' : '') + sliderRow('x', t(mode === 'lp' ? W.iso : W.trace), val, lo, hi, step).replace('class="gr-sl"', pnames.length ? 'class="gr-sl gr-sl-x"' : 'class="gr-sl"');
    }

    // ---- drawing the graph
    function curvePath(fn, x0, x1, N) {
      const H = dims.H;
      let d = '', pen = false, py = null, pxv = null;
      for (let i = 0; i <= N; i++) {
        const x = x0 + ((x1 - x0) * i) / N;
        const y = fn(x);
        if (!Number.isFinite(y)) { pen = false; py = null; continue; }
        const sy = Y(y);
        if (pen && Math.abs(sy - py) > H * 1.5) {
          const m = fn((x + pxv) / 2);
          const ym = Number.isFinite(m) ? Y(m) : NaN;
          if (!(ym >= Math.min(sy, py) - 2 && ym <= Math.max(sy, py) + 2)) pen = false;
        }
        const cy = clamp(sy, -3 * H, 4 * H);
        d += (pen ? 'L' : 'M') + n2(X(x)) + ' ' + n2(cy);
        pen = true; py = sy; pxv = x;
      }
      return d;
    }
    function lineEnds(p, q, r) {
      // p·x + q·y + r = 0 across the view
      if (Math.abs(q) >= Math.abs(p)) { const xa = vx0() - V.sx, xb = vx1() + V.sx; return [[xa, -(p * xa + r) / q], [xb, -(p * xb + r) / q]]; }
      const ya = vy0() - V.sy, yb = vy1() + V.sy;
      return [[-(q * ya + r) / p, ya], [-(q * yb + r) / p, yb]];
    }
    const segLine = (p, q, r, col, extra = '') => { const [[a, b], [c, d]] = lineEnds(p, q, r); return `<line x1="${n2(X(a))}" y1="${n2(Y(b))}" x2="${n2(X(c))}" y2="${n2(Y(d))}" stroke="${col}" stroke-width="4" stroke-linecap="round" ${extra}/>`; };
    function pill(x, y, text, col, opts = {}) {
      const w = text.length * 7.4 + 16, h = 24;
      let px = x + (opts.dx != null ? opts.dx : 12), py = y - (opts.dy != null ? opts.dy : 30);
      if (px + w > dims.W - 4) px = x - w - 12;
      if (px < 4) px = 4;
      if (py < 4) py = y + 12;
      if (py + h > dims.H - 4) py = dims.H - h - 4;
      return `<g class="gr-pill" pointer-events="none"><rect x="${n2(px)}" y="${n2(py)}" width="${n2(w)}" height="${h}" rx="12" fill="${col}" opacity=".95"/><text x="${n2(px + w / 2)}" y="${n2(py + 16.5)}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${esc(text)}</text></g>`;
    }
    const dot = (x, y, col, r = 7, cls = '') => `<circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="${r}" fill="${col}" stroke="#fff" stroke-width="3" class="${cls}"/>`;
    function grid() {
      const { W, H } = dims;
      const trig = mode === 'trig';
      let sx = niceStep(V.sx / (W / 64));
      if (trig) { const k = Math.max(1, Math.round(sx / (PI / 2))); sx = (PI / 2) * (k > 2 ? 2 * Math.round(k / 2) : k); }
      const sy = V.eq ? sx : niceStep(V.sy / (H / 52));
      S.tick = { sx, sy };
      let g = '';
      const minor = (s) => (trig ? s / 2 : s / (String(s / Math.pow(10, Math.floor(Math.log10(s)))) === '2' ? 4 : 5));
      const mx = minor(sx), my = V.eq ? mx : minor(sy);
      if (W / (V.sx / mx) > 7) for (let x = Math.ceil(vx0() / mx) * mx; x <= vx1(); x += mx) g += `<line x1="${n2(X(x))}" y1="0" x2="${n2(X(x))}" y2="${H}" class="gm"/>`;
      if (H / (V.sy / my) > 7) for (let y = Math.ceil(vy0() / my) * my; y <= vy1(); y += my) g += `<line x1="0" y1="${n2(Y(y))}" x2="${W}" y2="${n2(Y(y))}" class="gm"/>`;
      for (let x = Math.ceil(vx0() / sx) * sx; x <= vx1(); x += sx) g += `<line x1="${n2(X(x))}" y1="0" x2="${n2(X(x))}" y2="${H}" class="gM"/>`;
      for (let y = Math.ceil(vy0() / sy) * sy; y <= vy1(); y += sy) g += `<line x1="0" y1="${n2(Y(y))}" x2="${W}" y2="${n2(Y(y))}" class="gM"/>`;
      // axes (pinned to the edge when the origin is out of view)
      const ax = clamp(Y(0), 1, H - 1), ay = clamp(X(0), 1, W - 1);
      const inX = Y(0) >= 0 && Y(0) <= H, inY = X(0) >= 0 && X(0) <= W;
      g += `<line x1="0" y1="${n2(ax)}" x2="${W - 2}" y2="${n2(ax)}" class="ga" ${inX ? '' : 'stroke-dasharray="6 6" opacity=".5"'} marker-end="url(#gr-arr)"/>`;
      g += `<line x1="${n2(ay)}" y1="${H}" x2="${n2(ay)}" y2="2" class="ga" ${inY ? '' : 'stroke-dasharray="6 6" opacity=".5"'} marker-end="url(#gr-arr)"/>`;
      g += `<text x="${W - 14}" y="${n2(clamp(ax - 10, 16, H - 8))}" class="gl gx" text-anchor="end">x</text><text x="${n2(clamp(ay + 12, 8, W - 14))}" y="18" class="gl gx">y</text>`;
      const lyx = ax + 18 > H - 4 ? ax - 8 : ax + 18;
      for (let x = Math.ceil(vx0() / sx) * sx; x <= vx1() + 1e-9; x += sx) {
        if (Math.abs(x) < sx / 1e6) continue;
        const px = X(x);
        if (px < 14 || px > W - 26) continue;
        g += `<line x1="${n2(px)}" y1="${n2(ax - 5)}" x2="${n2(px)}" y2="${n2(ax + 5)}" class="ga" stroke-width="2"/><text x="${n2(px)}" y="${n2(lyx)}" text-anchor="middle" class="gl">${esc(trig ? piLabel(x) : fmt(x, 3))}</text>`;
      }
      const left = ay - 8 < 30;
      for (let y = Math.ceil(vy0() / sy) * sy; y <= vy1() + 1e-9; y += sy) {
        if (Math.abs(y) < sy / 1e6) continue;
        const py = Y(y);
        if (py < 26 || py > H - 12) continue;
        g += `<line x1="${n2(ay - 5)}" y1="${n2(py)}" x2="${n2(ay + 5)}" y2="${n2(py)}" class="ga" stroke-width="2"/><text x="${n2(left ? ay + 9 : ay - 9)}" y="${n2(py + 4.5)}" text-anchor="${left ? 'start' : 'end'}" class="gl">${esc(fmt(y, 3))}</text>`;
      }
      if (inX && inY) g += `<text x="${n2(X(0) - 8)}" y="${n2(Y(0) + 18)}" text-anchor="end" class="gl">O</text>`;
      return g;
    }
    function draw() {
      if (!svg) return;
      const { W, H } = dims;
      const focusKey = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      const A = analyse();
      S.A = A;
      const first = S.first && !L.reducedMotion();
      const anim = first ? ' class="gr-draw" pathLength="1"' : '';
      let body = '', over = '', xdefs = '';
      // ---- by mode
      if (mode === 'points') {
        if (inView(0, 0)) {
          const qx = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
          qx.forEach(([sxn, syn], i) => {
            const px = clamp(X(0) + sxn * Math.min(70, W * 0.2), 30, W - 30), py = clamp(Y(0) - syn * Math.min(60, H * 0.18), 30, H - 20);
            body += `<text x="${n2(px)}" y="${n2(py)}" text-anchor="middle" class="gq">${QR[i + 1]}</text>`;
          });
        }
        const pts = S.pts;
        if (pts.length >= 2) {
          const [a, b] = pts.slice(-2);
          body += `<line x1="${n2(X(a[0]))}" y1="${n2(Y(a[1]))}" x2="${n2(X(b[0]))}" y2="${n2(Y(b[1]))}" stroke="#FF7A1A" stroke-width="3" stroke-dasharray="8 6" stroke-linecap="round"/>`;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          body += `<rect x="${n2(X(mx) - 5)}" y="${n2(Y(my) - 5)}" width="10" height="10" fill="#FF7A1A" transform="rotate(45 ${n2(X(mx))} ${n2(Y(my))})"/>`;
        }
        if (pts.length) {
          const [lx, ly] = pts[pts.length - 1];
          body += `<line x1="${n2(X(lx))}" y1="${n2(Y(ly))}" x2="${n2(X(lx))}" y2="${n2(Y(0))}" class="gd"/><line x1="${n2(X(lx))}" y1="${n2(Y(ly))}" x2="${n2(X(0))}" y2="${n2(Y(ly))}" class="gd"/>`;
        }
        pts.forEach((p, i) => {
          const col = LINECOL[i % LINECOL.length];
          over += `<g class="${i === S.fresh ? 'gr-pop' : ''}">${dot(p[0], p[1], col, 8)}</g><text x="${n2(X(p[0]) + 11)}" y="${n2(Y(p[1]) - 10)}" class="gp" fill="${col}">${String.fromCharCode(65 + i)}</text>`;
        });
        if (pts.length) { const p = pts[pts.length - 1]; over += pill(X(p[0]), Y(p[1]), `${String.fromCharCode(64 + pts.length)}${pt(p[0], p[1])}`, LINECOL[(pts.length - 1) % LINECOL.length], { dy: 46 }); }
      } else if (mode === 'line') {
        const l = A.line;
        body += segLine(l.p, l.q, l.r, COL.main, first ? 'class="gr-draw" pathLength="1"' : '');
        // slope triangle from the y-intercept
        if (A.m != null && inView(0, A.k)) {
          let run = 1;
          while (X(run) - X(0) < 34) run *= 2;
          const x1 = run, y1 = A.k + A.m * run;
          body += `<path d="M${n2(X(0))} ${n2(Y(A.k))}H${n2(X(x1))}V${n2(Y(y1))}" fill="none" stroke="#FF7A1A" stroke-width="3" stroke-dasharray="7 5"/>`;
          body += `<text x="${n2((X(0) + X(x1)) / 2)}" y="${n2(Y(A.k) + (A.m >= 0 ? 18 : -8))}" text-anchor="middle" class="gt" fill="#C2410C">${fmt(run)}</text>`;
          if (Math.abs(A.m) > 1e-12) body += `<text x="${n2(X(x1) + 8)}" y="${n2((Y(A.k) + Y(y1)) / 2 + 5)}" class="gt" fill="#C2410C">${fmt(A.m * run)}</text>`;
          over += dot(0, A.k, COL.two, 6);
        }
      } else if (mode === 'pair') {
        A.lines.forEach((l, i) => { body += segLine(l.p, l.q, l.r, i ? COL.two : COL.main, i && A.type === 'same' ? 'stroke-dasharray="14 10"' : ''); });
      } else if (mode === 'inequality') {
        const regs = [];
        let lines = '';
        A.parts.forEach((p, i) => {
          const col = LINECOL[i % LINECOL.length];
          const g = R.parts[i].gc;
          const dash = p.strict ? 'stroke-dasharray="12 9"' : '';
          if (!p.ok) return;
          if (p.q === 0) {
            const xv = -p.r / p.p;
            const right = (p.op[0] === '>') === (p.p > 0);
            const xa = right ? xv : vx0() - V.sx, xb = right ? vx1() + V.sx : xv;
            const rx = n2(clamp(X(xa), -20, W + 20)), rw = n2(Math.max(0, clamp(X(xb), -20, W + 20) - rx));
            regs.push(`M${rx} -10h${rw}V${H + 10}h${-rw}Z`);
            lines += `<line x1="${n2(X(xv))}" y1="0" x2="${n2(X(xv))}" y2="${H}" stroke="${col}" stroke-width="4" ${dash}/>`;
          } else {
            const bnd = (x) => { const h = g(Object.assign({}, env(), { x, y: 0 })); return -h / p.q; };
            const above = (p.op[0] === '>') === (p.q > 0);
            const d = curvePath(bnd, vx0(), vx1(), 160);
            const edge = above ? -10 : H + 10;
            regs.push(`${d}L${W + 10} ${n2(clamp(Y(bnd(vx1())), -3 * H, 4 * H))}L${W + 10} ${edge}L-10 ${edge}L-10 ${n2(clamp(Y(bnd(vx0())), -3 * H, 4 * H))}Z`);
            lines += `<path d="${d}" fill="none" stroke="${col}" stroke-width="4" ${dash} stroke-linecap="round"/>`;
          }
        });
        // each inequality faintly in its own colour; where they all hold, a strong fill
        if (regs.length > 1) regs.forEach((d, i) => { body += `<path d="${d}" fill="${LINECOL[i % LINECOL.length]}" opacity=".1"/>`; });
        regs.forEach((d, i) => { xdefs += `<clipPath id="gr-r${i}"><path d="${d}"/></clipPath>`; });
        let sol = `<rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#gr-feas)"/>`;
        regs.forEach((d, i) => { sol = `<g clip-path="url(#gr-r${i})">${sol}</g>`; });
        if (regs.length === A.parts.length) body += sol;
        body += lines;
        S.tests.forEach(([x, y]) => {
          const ok = satisfies(x, y);
          over += `<g>${dot(x, y, ok ? '#22C55E' : '#FF6B57', 9)}<text x="${n2(X(x))}" y="${n2(Y(y) + 4.5)}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${ok ? '✓' : '✗'}</text></g>`;
        });
        if (S.tests.length) { const [x, y] = S.tests[S.tests.length - 1]; over += pill(X(x), Y(y), pt(x, y), satisfies(x, y) ? '#15803D' : '#C2410C'); }
      } else if (mode === 'lp') {
        const poly = lpData.poly;
        body += `<path d="M${poly.map(([x, y]) => `${n2(X(Math.min(x, vx1() + V.sx)))} ${n2(Y(Math.min(y, vy1() + V.sy)))}`).join('L')}Z" fill="url(#gr-feas)" stroke="none"/>`;
        R.parts.forEach((c, i) => { body += segLine(c.p, c.q, c.r, LINECOL[(i + 1) % LINECOL.length], 'opacity=".9" stroke-width="3"'); });
        // the objective line Z = k
        const o = R.obj;
        body += segLine(o.p, o.q, o.r - S.k, '#061233', 'stroke-dasharray="10 8" stroke-width="3"');
        const [[ea, eb], [ec, ed]] = lineEnds(o.p, o.q, o.r - S.k);
        const lxp = clamp((X(ea) + X(ec)) / 2, 50, W - 90), lyp = clamp((Y(eb) + Y(ed)) / 2, 30, H - 30);
        const zl = `Z = ${fmt(S.k)}`;
        over += pill(lxp, lyp, zl, '#061233', { dx: 6, dy: 12 });
        lpData.corners.forEach(([x, y], i) => {
          const best = S.revealed && lpData.best && lpData.best.at.some((P2) => Math.abs(P2[0] - x) < 1e-9 && Math.abs(P2[1] - y) < 1e-9);
          over += `<g data-key="corner:${i}" data-act="corner" data-i="${i}" role="button" tabindex="0" aria-label="${esc(pt(x, y))}" style="cursor:pointer">
            <circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="22" fill="transparent"/>${best ? `<circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="12" fill="#FFD23F" class="gr-pulse"/>` : ''}
            <circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="${best ? 10 : 8}" fill="${best ? '#F5B90A' : '#061233'}" stroke="#fff" stroke-width="3" class="gr-ring"/></g>`;
          if (S.tapped.has(i) || S.revealed) over += pill(X(x), Y(y), `${pt(x, y)}: Z = ${fmt(lpData.Z([x, y]))}`, best ? '#B45309' : '#334155', { dx: 10, dy: 32 });
        });
      }
      if (CURVE.includes(mode)) {
        if (mode === 'integral' && S.area) {
          const a = S.pv.a, b = S.pv.b, lo = Math.min(a, b), hi = Math.max(a, b);
          const d = curvePath(f, lo, hi, 240);
          if (d && !/M.*M/.test(d)) {
            const fill = `${d}L${n2(X(hi))} ${n2(Y(0))}L${n2(X(lo))} ${n2(Y(0))}Z`;
            body += `<path d="${fill}" fill="${COL.area}" opacity=".42" clip-path="url(#gr-up)"/><path d="${fill}" fill="${COL.neg}" opacity=".42" clip-path="url(#gr-down)"/>`;
          }
        }
        if (mode === 'integral') {
          const a = S.pv.a, b = S.pv.b;
          [a, b].forEach((x, i) => { body += `<line x1="${n2(X(x))}" y1="0" x2="${n2(X(x))}" y2="${H}" stroke="${PCOL[i ? 'b' : 'a']}" stroke-width="2.5" stroke-dasharray="6 5"/><text x="${n2(X(x))}" y="${H - 8}" text-anchor="middle" class="gt" fill="${PCOL[i ? 'b' : 'a']}">${i ? 'b' : 'a'}</text>`; });
          if (S.rects > 0) {
            const n = S.rects, h = (b - a) / n;
            for (let i = 0; i < n; i++) {
              const x = a + i * h, y = f(x);
              if (!Number.isFinite(y)) continue;
              const xa = Math.min(X(x), X(x + h)), w = Math.abs(X(x + h) - X(x));
              body += `<rect x="${n2(xa)}" y="${n2(Math.min(Y(0), Y(y)))}" width="${n2(w)}" height="${n2(Math.abs(Y(y) - Y(0)))}" fill="#FFD23F" opacity=".55" stroke="#B45309" stroke-width="1.4"/>`;
            }
          }
        }
        if (mode === 'derivative') {
          const h = 1e-5 * (1 + V.sx);
          const d1 = (x) => (f(x + h) - f(x - h)) / (2 * h);
          body += `<path d="${curvePath(d1, vx0(), vx1(), 400)}" fill="none" stroke="${COL.three}" stroke-width="3" stroke-dasharray="9 7" stroke-linecap="round"/>`;
        }
        if (mode === 'exp-log') {
          body += `<line x1="${n2(X(vx0() - V.sx))}" y1="${n2(Y(vx0() - V.sx))}" x2="${n2(X(vx1() + V.sx))}" y2="${n2(Y(vx1() + V.sx))}" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4 6"/>`;
          const yl = clamp(vy1() - V.sy * 0.08, vy0(), vy1());
          if (inView(yl, yl)) body += `<text x="${n2(X(yl) - 6)}" y="${n2(Y(yl) + 4)}" text-anchor="end" class="gt" fill="#64748B">y = x</text>`;
          // the mirror image in y = x: the inverse
          let dm = '', pen = false;
          for (let i = 0; i <= 500; i++) {
            const x = vy0() - V.sy * 0.2 + ((V.sy * 1.4) * i) / 500;
            const y = f(x);
            if (!Number.isFinite(y) || y < vx0() - V.sx || y > vx1() + V.sx) { pen = false; continue; }
            dm += (pen ? 'L' : 'M') + n2(X(y)) + ' ' + n2(clamp(Y(x), -3 * H, 4 * H));
            pen = true;
          }
          body += `<path d="${dm}" fill="none" stroke="${COL.three}" stroke-width="3.5" stroke-dasharray="10 7" stroke-linecap="round"/>`;
        }
        body += `<path d="${curvePath(f, vx0(), vx1(), Math.round(W * 1.2))}" fill="none" stroke="${COL.main}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#gr-glow)"${anim}/>`;
      }
      // data points (all modes but points)
      DATA.forEach(([x, y]) => { over += dot(x, y, '#061233', 6); });
      // features
      const fcol = { root: COL.root, max: COL.max, min: COL.min, intersect: '#8B3DFF' };
      A.feats.forEach((p, i) => {
        if (!inView(p.x, p.y)) return;
        const clickable = (traceMode && !(mode === 'line' && A.vert != null)) || p.kind === 'intersect';
        const fkey = p.kind === 'intersect' ? 'intersect' : 'slider:x';
        over += `<g ${clickable ? `data-key="${fkey}" data-act="feat" data-fx="${p.x}" role="button" tabindex="0" aria-label="${esc(featName(p.kind))} ${esc(pt(p.x, p.y))}" style="cursor:pointer"` : ''}>
          <circle cx="${n2(X(p.x))}" cy="${n2(Y(p.y))}" r="10" fill="${fcol[p.kind]}" class="gr-pulse"/>
          <circle cx="${n2(X(p.x))}" cy="${n2(Y(p.y))}" r="7.5" fill="#fff" stroke="${fcol[p.kind]}" stroke-width="4" class="gr-ring"/>${clickable ? `<circle cx="${n2(X(p.x))}" cy="${n2(Y(p.y))}" r="22" fill="transparent"/>` : ''}</g>`;
        if (mode === 'pair' || (!traceMode && mode !== 'lp') || A.feats.length <= 4) over += pill(X(p.x), Y(p.y), pt(p.x, p.y), fcol[p.kind], { dy: p.kind === 'min' ? -14 : 32 });
      });
      // trace point
      if (traceMode && !(mode === 'line' && A.vert != null)) {
        const x = S.tx, y = traceY(x, A);
        if (Number.isFinite(y) && inView(x, y)) {
          over += `<line x1="${n2(X(x))}" y1="${n2(Y(y))}" x2="${n2(X(x))}" y2="${n2(clamp(Y(0), 0, H))}" class="gd" stroke="${COL.trace}"/><line x1="${n2(X(x))}" y1="${n2(Y(y))}" x2="${n2(clamp(X(0), 0, W))}" y2="${n2(Y(y))}" class="gd" stroke="${COL.trace}"/>`;
          if (mode === 'derivative' && S.tangent) {
            const h = 1e-5 * (1 + V.sx);
            const m = (f(x + h) - f(x - h)) / (2 * h);
            if (Number.isFinite(m)) {
              over += segLine(-m, 1, m * x - y, '#F5B90A', 'stroke-width="4"');
              const dx = Math.min(V.sx * 0.12, 1.5);
              over += `<path d="M${n2(X(x))} ${n2(Y(y))}H${n2(X(x + dx))}V${n2(Y(y + m * dx))}" fill="none" stroke="#B45309" stroke-width="2.5" stroke-dasharray="5 4"/>`;
            }
          }
          over += `<g data-key="slider:x" data-act="tracept" role="slider" tabindex="0" aria-label="${esc(t(W.trace))}" aria-valuenow="${fmt(x)}" aria-valuetext="${esc(pt(x, y))}" style="cursor:grab">
            <circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="24" fill="${COL.trace}" opacity=".14"/>
            <circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="10" fill="${COL.trace}" stroke="#fff" stroke-width="3.5" class="gr-ring"/></g>`;
          over += pill(X(x), Y(y), pt(x, y), COL.trace);
        }
      }
      // keyboard cursor for plotting
      if ((mode === 'points' || mode === 'inequality') && S.curOn) {
        const { x, y } = S.cur;
        over += `<g pointer-events="none"><circle cx="${n2(X(x))}" cy="${n2(Y(y))}" r="11" fill="none" stroke="#FF7A1A" stroke-width="3"/><path d="M${n2(X(x) - 16)} ${n2(Y(y))}h32M${n2(X(x))} ${n2(Y(y) - 16)}v32" stroke="#FF7A1A" stroke-width="2"/></g>` + pill(X(x), Y(y), pt(x, y), '#C2410C', { dy: -16 });
      }
      const plane = mode === 'points' || mode === 'inequality';
      const hit = plane
        ? `<rect class="gr-hit" data-key="point:add" role="button" tabindex="0" aria-label="${esc(t(mode === 'points' ? W.tapPlot : W.tapTest))}" x="0" y="0" width="${W}" height="${H}" fill="transparent" style="cursor:crosshair"/>`
        : `<rect x="0" y="0" width="${W}" height="${H}" fill="transparent"${traceMode ? ' style="cursor:pointer"' : ''}/>`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = `<defs>
          <linearGradient id="gr-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F4FF"/></linearGradient>
          <linearGradient id="gr-feas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14B8A6" stop-opacity=".45"/><stop offset="1" stop-color="#02CFF9" stop-opacity=".3"/></linearGradient>
          <filter id="gr-glow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#8B3DFF" flood-opacity=".35"/></filter>
          <marker id="gr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1E293B"/></marker>
          <clipPath id="gr-up"><rect x="0" y="-10" width="${W}" height="${n2(clamp(Y(0), -10, H + 10) + 10)}"/></clipPath>
          <clipPath id="gr-down"><rect x="0" y="${n2(clamp(Y(0), -10, H + 10))}" width="${W}" height="${H + 20}"/></clipPath>
${xdefs}
          <clipPath id="gr-clip"><rect x="0" y="0" width="${W}" height="${H}" rx="14"/></clipPath>
        </defs>
        <style>.gm{stroke:#E4E9F6;stroke-width:1}.gM{stroke:#C7D2EC;stroke-width:1.2}.ga{stroke:#1E293B;stroke-width:2.2}.gl{font-size:13px;font-weight:600;fill:#334155;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}.gx{font-size:17px;font-style:italic;font-family:Georgia,serif;font-weight:700}.gq{font-size:30px;font-weight:800;fill:#8B3DFF;opacity:.13;font-family:Georgia,serif}.gd{stroke:${COL.trace};stroke-width:2;stroke-dasharray:5 5;opacity:.7}.gp{font-size:17px;font-weight:800;paint-order:stroke;stroke:#fff;stroke-width:4px}.gt{font-size:14px;font-weight:800;paint-order:stroke;stroke:#fff;stroke-width:4px}</style>
        <g clip-path="url(#gr-clip)"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#gr-paper)"/>${grid()}${hit}<g pointer-events="none">${body}</g>${over}</g>`;
      S.first = false;
      S.fresh = -1;
      if (focusKey) { const el = svg.querySelector(`[data-key="${focusKey}"]`); if (el) el.focus({ preventScroll: true }); }
      drawSide(A);
    }
    const inView = (x, y) => x >= vx0() && x <= vx1() && y >= vy0() && y <= vy1();
    const featName = (k) => t(k === 'root' ? T2('zero (cuts the x-axis)', 'शून्यक (x-अक्ष पर कटान)') : k === 'max' ? T2('highest point', 'सबसे ऊँचा बिंदु') : k === 'min' ? T2('lowest point', 'सबसे नीचा बिंदु') : T2('meeting point', 'मिलन बिंदु'));

    // ---- the side: equations, facts and the quick check
    const fact = (k, v) => `<div class="gr-fact"><span>${esc(t(k))}</span><b>${v}</b></div>`;
    const note = (x) => `<p class="gr-note">${esc(t(x))}</p>`;
    function equations(A) {
      const chip = (col, html, cls = '') => `<span class="gr-eq ${cls}"><span class="gr-dot" style="background:${col}" aria-hidden="true"></span><span>${html}</span></span>`;
      const yl = (l) => (Math.abs(l.q) > 1e-12 ? `<i>y</i> = ${linStr(rd(-l.p / l.q), rd(-l.r / l.q))}` : Math.abs(l.p) > 1e-12 ? `<i>x</i> = ${fmt(-l.r / l.p)}` : `0 = ${fmt(-l.r)}`);
      if (mode === 'points') return chip('#FF7A1A', esc(t(T2('Plot points (x, y)', 'बिंदु (x, y) बनाओ'))));
      const asGiven = (i, l) => { const r = R.parts[i].rel; return r.e || (r.L.t === 'var' && r.L.n === 'y') ? yl(l) : `${show(r.L, env())} = ${show(r.R, env())}`; };
      if (mode === 'line') return chip(COL.main, asGiven(0, A.line));
      if (mode === 'pair') return A.lines.map((l, i) => chip(i ? COL.two : COL.main, asGiven(i, l))).join('');
      if (mode === 'quadratic') return chip(COL.main, `<i>y</i> = ${polyStr([A.A, A.B, A.C])}`);
      if (mode === 'inequality') return R.parts.map((p, i) => chip(LINECOL[i % LINECOL.length], `${show(p.rel.L, env())} ${{ '<': '&lt;', '<=': '≤', '>': '&gt;', '>=': '≥' }[p.op]} ${show(p.rel.R, env())}`)).join('');
      if (mode === 'lp') return chip('#FFD23F', `${esc(t(R.dir === 'max' ? T2('Maximise', 'अधिकतम करो') : T2('Minimise', 'न्यूनतम करो')))} <i>Z</i> = ${show(R.obj.ast, {})}`, 'obj')
        + R.parts.map((p, i) => chip(LINECOL[(i + 1) % LINECOL.length], `${show(p.rel.L, {})} ${p.rel.op === '<=' ? '≤' : '≥'} ${show(p.rel.R, {})}`)).join('') + chip('#94A3B8', '<i>x</i> ≥ 0, <i>y</i> ≥ 0');
      const main = chip(COL.main, `<i>y</i> = ${show(R.f, env())}`);
      if (mode === 'derivative') return main + chip(COL.three, `<i>y</i> = <i>f</i> ′(<i>x</i>) ${esc(t(T2('(slope)', '(ढलान)')))}`);
      if (mode === 'exp-log') return main + chip(COL.three, esc(t(T2('its mirror in y = x (the inverse)', 'y = x में इसका दर्पण (प्रतिलोम)'))));
      return main;
    }
    function facts(A) {
      let h = '';
      if (mode === 'points') {
        const pts = S.pts;
        if (!pts.length) return note(W.tapPlot);
        pts.slice(-4).forEach((p, j) => {
          const i = pts.length - Math.min(4, pts.length) + j;
          const q = quadrant(p[0], p[1]);
          const where = q === 0 ? W.origin : q === -1 ? W.onX : q === -2 ? W.onY : QN[q];
          h += fact(`${String.fromCharCode(65 + i)} ${pt(p[0], p[1])}`, esc(t(where)));
        });
        if (pts.length >= 2) {
          const [a, b] = pts.slice(-2);
          const n = pts.length;
          const A1 = String.fromCharCode(63 + n), B1 = String.fromCharCode(64 + n);
          const dx = b[0] - a[0], dy = b[1] - a[1], s2 = rd(dx * dx + dy * dy, 1e6);
          const d = Math.sqrt(s2);
          h += fact(T2(`Distance ${A1}${B1}`, `दूरी ${A1}${B1}`), `√${fmt(s2)}${Number.isInteger(rd(d, 1e6)) ? ' = ' + fmt(d) : ' ≈ ' + fmt(d)}`);
          h += fact(T2(`Midpoint of ${A1}${B1}`, `${A1}${B1} का मध्य-बिंदु`), pt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
        }
        return h;
      }
      if (mode === 'line') {
        if (A.vert != null) return fact(T2('Line', 'रेखा'), `<i>x</i> = ${fmt(A.vert)}`) + note(T2('A vertical line: its slope is not defined.', 'खड़ी रेखा: इसकी ढलान परिभाषित नहीं है।'));
        h += fact(T2('Slope m', 'ढलान m'), fmt(A.m));
        h += fact(T2('Cuts the y-axis at', 'y-अक्ष को काटती है'), pt(0, A.k));
        h += fact(T2('Cuts the x-axis at', 'x-अक्ष को काटती है'), A.roots.length ? pt(A.roots[0].x, 0) : Math.abs(A.k) < 1e-12 ? esc(t(T2('it is the x-axis', 'यह x-अक्ष ही है'))) : esc(t(T2('never (parallel to it)', 'कभी नहीं (समांतर है)'))));
        h += note(A.m > 0 ? T2('It goes up from left to right: the slope is positive.', 'यह बाएँ से दाएँ ऊपर जाती है: ढलान धनात्मक है।') : A.m < 0 ? T2('It goes down from left to right: the slope is negative.', 'यह बाएँ से दाएँ नीचे जाती है: ढलान ऋणात्मक है।') : T2('It is flat, parallel to the x-axis: the slope is 0.', 'यह सपाट है, x-अक्ष के समांतर: ढलान 0 है।'));
        if (traceMode) h += note(W.dragTrace);
        return h;
      }
      if (mode === 'pair') {
        const [l1, l2] = A.lines;
        const sl = (l) => (Math.abs(l.q) > 1e-12 ? fmt(-l.p / l.q) : '∞');
        h += fact(T2('Slopes', 'ढलानें'), `${sl(l1)} , ${sl(l2)}`);
        if (A.type === 'one') {
          h += fact(T2('They meet at', 'वे मिलती हैं'), pt(A.ix.x, A.ix.y));
          h += `<p class="gr-note"><span class="gr-tag" style="background:#8B3DFF">${esc(t(T2('One solution', 'एक हल')))}</span> ${esc(t(T2('Different slopes, so the lines cross once.', 'ढलानें अलग हैं, इसलिए रेखाएँ एक बार काटती हैं।')))}</p>`;
        } else if (A.type === 'none') h += `<p class="gr-note"><span class="gr-tag" style="background:#FF6B57">${esc(t(T2('No solution', 'कोई हल नहीं')))}</span> ${esc(t(T2('Same slope, different lines: they are parallel and never meet.', 'ढलान एक जैसी, रेखाएँ अलग: वे समांतर हैं और कभी नहीं मिलतीं।')))}</p>`;
        else h += `<p class="gr-note"><span class="gr-tag" style="background:#0F766E">${esc(t(T2('Infinitely many solutions', 'अनगिनत हल')))}</span> ${esc(t(T2('The two equations give the same line: every point on it fits both.', 'दोनों समीकरण एक ही रेखा देते हैं: उस पर हर बिंदु दोनों को संतुष्ट करता है।')))}</p>`;
        return h;
      }
      if (mode === 'quadratic') {
        if (Math.abs(A.A) < 1e-12) return note(T2('a = 0, so there is no x² term: this is a straight line, not a parabola.', 'a = 0, इसलिए x² वाला पद नहीं है: यह सीधी रेखा है, परवलय नहीं।'));
        h += fact(A.A > 0 ? T2('Lowest point (vertex)', 'सबसे नीचा बिंदु (शीर्ष)') : T2('Highest point (vertex)', 'सबसे ऊँचा बिंदु (शीर्ष)'), pt(A.h, A.vk));
        h += fact(T2('Axis of symmetry', 'सममित अक्ष'), `<i>x</i> = ${fmt(A.h)}`);
        h += fact(T2('D = b² − 4ac', 'D = b² − 4ac'), fmt(A.D));
        h += fact(T2('Zeros (cuts the x-axis)', 'शून्यक (x-अक्ष पर कटान)'), A.roots.length ? A.roots.map((r) => fmt(r.x)).join(' , ') : esc(t(T2('none: D < 0', 'कोई नहीं: D < 0'))));
        h += note(A.A > 0 ? T2('a > 0: the parabola opens upwards.', 'a > 0: परवलय ऊपर की ओर खुलता है।') : T2('a < 0: the parabola opens downwards.', 'a < 0: परवलय नीचे की ओर खुलता है।'));
        return h + note(W.dragTrace);
      }
      if (mode === 'inequality') {
        const strict = A.parts.some((p) => p.strict), loose = A.parts.some((p) => !p.strict);
        h += note(T2('Shaded: every point that makes it true.', 'रंगा भाग: हर वह बिंदु जिसके लिए यह सही है।'));
        if (R.parts.length > 1) h += note(T2('Where all the shadings overlap, every inequality is true.', 'जहाँ सारे रंग एक-दूसरे पर पड़ते हैं, वहाँ सभी असमिकाएँ सही हैं।'));
        if (loose) h += note(T2('Solid line: points on the line count too (≤ or ≥).', 'ठोस रेखा: रेखा के बिंदु भी शामिल हैं (≤ या ≥)।'));
        if (strict) h += note(T2('Dashed line: points on the line do not count (< or >).', 'टूटी रेखा: रेखा के बिंदु शामिल नहीं हैं (< या >)।'));
        if (S.tests.length) { const [x, y] = S.tests[S.tests.length - 1]; h += fact(T2('Point tested', 'जाँचा गया बिंदु'), `${pt(x, y)} ${satisfies(x, y) ? '✓' : '✗'}`); }
        else h += note(W.tapTest);
        return h;
      }
      if (mode === 'lp') {
        h += fact(T2('Corner points', 'कोने के बिंदु'), lpData.corners.length);
        lpData.corners.forEach((P2, i) => { if (S.tapped.has(i) || S.revealed) h += fact(T2(`At ${pt(P2[0], P2[1])}`, `${pt(P2[0], P2[1])} पर`), `<i>Z</i> = ${fmt(lpData.Z(P2))}`); });
        if (S.revealed) {
          if (lpData.best) {
            const at = lpData.best.at.filter((P2) => !(P2[0] >= BIG * 0.999 || P2[1] >= BIG * 0.999));
            h += `<p class="gr-note"><span class="gr-tag" style="background:#B45309">${esc(t(R.dir === 'max' ? T2('Maximum', 'अधिकतम') : T2('Minimum', 'न्यूनतम')))} Z = ${fmt(lpData.best.z)}</span> ${esc(at.map((P2) => pt(P2[0], P2[1])).join(' , '))}</p>`;
            if (at.length > 1) h += note(T2('Two corners tie, so every point on the edge between them is also best.', 'दो कोनों पर मान बराबर है, इसलिए उनके बीच की भुजा का हर बिंदु भी सबसे अच्छा है।'));
          } else h += note(R.dir === 'max' ? T2('The region is unbounded and Z keeps growing: there is no maximum.', 'क्षेत्र अपरिबद्ध है और Z बढ़ता ही जाता है: कोई अधिकतम मान नहीं है।') : T2('The region is unbounded and Z keeps falling: there is no minimum.', 'क्षेत्र अपरिबद्ध है और Z घटता ही जाता है: कोई न्यूनतम मान नहीं है।'));
        } else h += note(T2('Tap the corners to find Z there, or slide the line Z = k across the shaded region.', 'कोनों पर टैप करके वहाँ Z निकालो, या रेखा Z = k को रंगे क्षेत्र पर खिसकाओ।'));
        if (lpData.unbounded) h += note(T2('The shaded (feasible) region goes on without end: it is unbounded.', 'रंगा (सुसंगत) क्षेत्र अंतहीन है: यह अपरिबद्ध है।'));
        return h;
      }
      // curves
      const x = S.tx, y = f(x);
      h += fact(T2('Point on the curve', 'वक्र पर बिंदु'), Number.isFinite(y) ? pt(x, y) : `<i>x</i> = ${fmt(x)}: ${esc(t(T2('not defined', 'परिभाषित नहीं')))}`);
      if (mode === 'derivative') {
        const hh = 1e-5 * (1 + V.sx);
        const m = (f(x + hh) - f(x - hh)) / (2 * hh);
        h += fact(T2('Slope there, f ′(x)', 'वहाँ ढलान, f ′(x)'), fmt(m, 3));
        h += note(Math.abs(m) < 0.005 ? T2('Slope 0: the tangent is flat. This is a turning point.', 'ढलान 0: स्पर्श रेखा सपाट है। यह मोड़ बिंदु है।') : m > 0 ? T2('Slope positive: the curve is going up here.', 'ढलान धनात्मक: वक्र यहाँ ऊपर जा रहा है।') : T2('Slope negative: the curve is going down here.', 'ढलान ऋणात्मक: वक्र यहाँ नीचे जा रहा है।'));
        h += note(T2('The dashed curve is f ′(x): where it crosses the x-axis, the curve turns.', 'टूटी रेखा वाला वक्र f ′(x) है: जहाँ यह x-अक्ष को काटता है, वहाँ वक्र मुड़ता है।'));
      }
      if (mode === 'integral') {
        const a = S.pv.a, b = S.pv.b;
        const I = simpson(f, a, b);
        let broken = false;
        for (let i = 0; i <= 200; i++) if (!Number.isFinite(f(a + ((b - a) * i) / 200))) broken = true;
        h += fact(T2('∫ from a to b', 'a से b तक ∫'), broken || !Number.isFinite(I) ? esc(t(T2('not defined: the curve breaks', 'परिभाषित नहीं: वक्र टूटता है'))) : fmt(I, 3));
        if (S.rects > 0 && !broken) {
          const n = S.rects, hw = (b - a) / n;
          let s = 0;
          for (let i = 0; i < n; i++) s += f(a + i * hw) * hw;
          h += fact(T2(`${n} rectangles add up to`, `${n} आयतों का योग`), fmt(s, 3));
          h += note(T2('More, thinner rectangles come closer and closer to the true area: that is the limit.', 'जितने ज़्यादा और पतले आयत, उतना ही असली क्षेत्रफल के पास: यही सीमा है।'));
        }
        if (a > b) h += note(T2('a is to the right of b, so the sign of the answer flips.', 'a, b के दाईं ओर है, इसलिए उत्तर का चिह्न उलट जाता है।'));
        if (scan(f, Math.min(a, b), Math.max(a, b), V.sy).roots.length || (Number.isFinite(f(a)) && f(a) < 0)) h += note(T2('Area below the x-axis counts as negative.', 'x-अक्ष के नीचे का क्षेत्रफल ऋणात्मक गिना जाता है।'));
      }
      if (mode === 'trig' && R.isDefault) {
        const a = S.pv.a, b = S.pv.b, c = S.pv.c;
        h += fact(T2('Amplitude |a|', 'आयाम |a|'), fmt(Math.abs(a)));
        h += fact(T2('Period 2π ÷ b', 'आवर्त 2π ÷ b'), Math.abs(b) > 1e-12 ? `${fmt((2 * PI) / Math.abs(b))} (${fmt(2 / Math.abs(b))}π)` : '–');
        h += fact(T2('Highest and lowest y', 'सबसे बड़ा और छोटा y'), `${fmt(Math.abs(a))} , ${fmt(-Math.abs(a))}`);
        if (Math.abs(c) > 1e-12 && Math.abs(b) > 1e-12) h += fact(T2('Shift', 'खिसकाव'), `${fmt(Math.abs(c / b))} ${esc(t(c > 0 ? T2('to the left', 'बाईं ओर') : T2('to the right', 'दाईं ओर')))}`);
      } else if (mode === 'trig') {
        if (A.max.length) h += fact(T2('Highest y in view', 'दिख रहा सबसे बड़ा y'), fmt(Math.max(...A.max.map((p) => p.y))));
        if (A.min.length) h += fact(T2('Lowest y in view', 'दिख रहा सबसे छोटा y'), fmt(Math.min(...A.min.map((p) => p.y))));
      }
      if (mode === 'exp-log') {
        const y0 = f(0);
        if (Number.isFinite(y0)) h += fact(T2('Cuts the y-axis at', 'y-अक्ष को काटता है'), pt(0, y0));
        if (A.roots.length) h += fact(T2('Cuts the x-axis at', 'x-अक्ष को काटता है'), A.roots.map((r) => pt(r.x, 0)).join(' '));
        if (R.isDefault) {
          const a = S.pv.a;
          h += note(Math.abs(a - 1) < 1e-12 ? T2('a = 1: 1 to any power is 1, so it is the flat line y = 1.', 'a = 1: 1 की कोई भी घात 1 है, इसलिए यह सपाट रेखा y = 1 है।') : a > 1 ? T2('a > 1: the curve grows faster and faster. It never touches the x-axis.', 'a > 1: वक्र तेज़ी से बढ़ता जाता है। यह x-अक्ष को कभी नहीं छूता।') : T2('0 < a < 1: the curve falls (decay). It never touches the x-axis.', '0 < a < 1: वक्र घटता है (क्षय)। यह x-अक्ष को कभी नहीं छूता।'));
          if (Math.abs(a - 1) > 1e-12) h += note(T2('The dashed mirror curve is y = logₐx: it passes through (1, 0).', 'टूटी रेखा वाला दर्पण वक्र y = logₐx है: यह (1, 0) से गुज़रता है।'));
        } else h += note(T2('The dashed curve is the mirror image in y = x: the inverse.', 'टूटी रेखा वाला वक्र y = x में दर्पण-प्रतिबिंब है: प्रतिलोम।'));
      }
      if (mode === 'polynomial' || mode === 'derivative') {
        h += fact(T2('Zeros in view', 'दिख रहे शून्यक'), A.roots.length ? A.roots.map((r) => fmt(r.x)).join(' , ') : esc(t(T2('none', 'कोई नहीं'))));
        if (A.max.length) h += fact(T2('Local highest points', 'स्थानीय उच्चतम बिंदु'), A.max.map((p) => pt(p.x, p.y)).join(' '));
        if (A.min.length) h += fact(T2('Local lowest points', 'स्थानीय निम्नतम बिंदु'), A.min.map((p) => pt(p.x, p.y)).join(' '));
      }
      if (mode === 'polynomial' && R.isDefault) h += note(T2('The curve cuts the x-axis exactly at a, b and c: they are its zeros.', 'वक्र x-अक्ष को ठीक a, b और c पर काटता है: ये इसके शून्यक हैं।'));
      return h + note(W.dragTrace);
    }
    // the quick check, built from the graph on the screen
    function question(A) {
      const opts = (vals, right) => {
        const seen = new Set(), out = [];
        vals.forEach((v, i) => { const s = typeof v === 'object' ? t(v) : String(v); if (seen.has(s)) return; seen.add(s); out.push({ label: s, ok: i === right }); });
        return out;
      };
      const order = (o, seed) => { const a = o.slice(); let s = Math.abs(Math.round(seed * 97)) + 3; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const numQ = (q, v, alts, why) => { const o = opts([fmt(v)].concat(alts.map((x) => fmt(x))), 0).slice(0, 4); return { q, opts: order(o, v + o.length), why }; };
      if (mode === 'points') {
        const p = S.pts.find((p2) => p2[0] !== 0 && p2[1] !== 0) || [-3, 2];
        const q = quadrant(p[0], p[1]);
        return { q: T2(`In which quadrant is the point ${pt(p[0], p[1])}?`, `बिंदु ${pt(p[0], p[1])} किस चतुर्थांश में है?`), opts: [1, 2, 3, 4].map((k) => ({ label: t(QN[k]), ok: k === q })), why: T2(`x is ${p[0] > 0 ? 'positive' : 'negative'} and y is ${p[1] > 0 ? 'positive' : 'negative'}, so it is in quadrant ${QR[q]}.`, `x ${p[0] > 0 ? 'धनात्मक' : 'ऋणात्मक'} है और y ${p[1] > 0 ? 'धनात्मक' : 'ऋणात्मक'} है, इसलिए यह ${t(QN[q])} में है।`) };
      }
      if (mode === 'line') {
        if (A.vert != null) return { q: T2('Is this line vertical?', 'क्या यह रेखा खड़ी है?'), opts: [{ label: t(W.yes), ok: true }, { label: t(W.no), ok: false }], why: T2('x stays the same at every point, so the line stands straight up.', 'हर बिंदु पर x एक जैसा है, इसलिए रेखा सीधी खड़ी है।') };
        return numQ(T2('What is the slope of this line?', 'इस रेखा की ढलान क्या है?'), A.m, [-A.m, A.k, A.m + 1, A.m === 0 ? 1 : 1 / A.m], T2('Go 1 step right and count how far the line goes up (or down): that is the slope.', '1 कदम दाईं ओर चलो और गिनो कि रेखा कितना ऊपर (या नीचे) जाती है: यही ढलान है।'));
      }
      if (mode === 'pair') {
        const k = A.type === 'one' ? 0 : A.type === 'none' ? 1 : 2;
        return { q: T2('How many solutions does this pair of equations have?', 'इस समीकरण-युग्म के कितने हल हैं?'), opts: [T2('Exactly one', 'ठीक एक'), T2('None', 'कोई नहीं'), T2('Infinitely many', 'अनगिनत')].map((x, i) => ({ label: t(x), ok: i === k })), why: T2('Each point where both lines pass is a solution: crossing lines meet once, parallel lines never, the same line everywhere.', 'जहाँ दोनों रेखाएँ गुज़रती हैं, वह हर बिंदु हल है: काटती रेखाएँ एक बार मिलती हैं, समांतर कभी नहीं, एक ही रेखा हर जगह।') };
      }
      if (mode === 'quadratic') {
        if (Math.abs(A.A) < 1e-12) return { q: T2('With a = 0, is this graph a parabola?', 'a = 0 पर क्या यह ग्राफ़ परवलय है?'), opts: [{ label: t(W.yes), ok: false }, { label: t(W.no), ok: true }], why: T2('Without the x² term the graph is a straight line.', 'x² पद के बिना ग्राफ़ सीधी रेखा है।') };
        const n = A.roots.length;
        return { q: T2('How many times does this graph meet the x-axis?', 'यह ग्राफ़ x-अक्ष से कितनी बार मिलता है?'), opts: [0, 1, 2].map((k) => ({ label: String(k), ok: k === n })), why: T2(`D = b² − 4ac = ${fmt(A.D)}. D > 0: two zeros; D = 0: one (it just touches); D < 0: none.`, `D = b² − 4ac = ${fmt(A.D)}। D > 0: दो शून्यक; D = 0: एक (बस छूता है); D < 0: कोई नहीं।`) };
      }
      if (mode === 'polynomial') {
        const n = A.roots.length;
        return { q: T2('How many zeros can you see on the graph?', 'ग्राफ़ पर कितने शून्यक दिख रहे हैं?'), opts: [...new Set([n, n + 1, Math.max(0, n - 1), n + 2])].sort((p, q) => p - q).slice(0, 4).map((k) => ({ label: String(k), ok: k === n })), why: T2('Count the places where the curve meets the x-axis: each one is a zero.', 'गिनो कि वक्र x-अक्ष से कितनी जगह मिलता है: हर जगह एक शून्यक है।') };
      }
      if (mode === 'trig') {
        const hi = R.isDefault ? Math.abs(S.pv.a) : A.max.length ? Math.max(...A.max.map((p) => p.y)) : NaN;
        if (Number.isFinite(hi)) return numQ(T2('What is the highest value y reaches?', 'y का सबसे बड़ा मान क्या है?'), hi, [hi * 2, hi / 2, -hi, hi + 1], T2('Look at the tops of the waves: they all reach the same height.', 'तरंगों के शिखर देखो: सब एक ही ऊँचाई तक पहुँचते हैं।'));
      }
      if (mode === 'exp-log') {
        const y0 = f(0);
        if (Number.isFinite(y0)) return numQ(T2('Where does the curve cut the y-axis? (y = ?)', 'वक्र y-अक्ष को कहाँ काटता है? (y = ?)'), y0, [0, y0 + 1, y0 * 2, -y0], T2('On the y-axis x = 0, so put x = 0 into the expression.', 'y-अक्ष पर x = 0 होता है, इसलिए व्यंजक में x = 0 रखो।'));
      }
      if (mode === 'derivative') {
        const hh = 1e-5 * (1 + V.sx);
        const m = (f(S.tx + hh) - f(S.tx - hh)) / (2 * hh);
        const k = Math.abs(m) < 0.005 ? 2 : m > 0 ? 0 : 1;
        return { q: T2(`At x = ${fmt(S.tx)}, is the slope of the curve positive, negative or zero?`, `x = ${fmt(S.tx)} पर वक्र की ढलान धनात्मक, ऋणात्मक या शून्य है?`), opts: [T2('Positive', 'धनात्मक'), T2('Negative', 'ऋणात्मक'), T2('Zero', 'शून्य')].map((x, i) => ({ label: t(x), ok: i === k })), why: T2(`The slope there is ${fmt(m, 3)}: the tangent ${k === 0 ? 'goes up' : k === 1 ? 'goes down' : 'is flat'}.`, `वहाँ ढलान ${fmt(m, 3)} है: स्पर्श रेखा ${k === 0 ? 'ऊपर जाती है' : k === 1 ? 'नीचे जाती है' : 'सपाट है'}।`) };
      }
      if (mode === 'integral') {
        return { q: T2('When you use more and thinner rectangles, their total…', 'जब ज़्यादा और पतले आयत लेते हो, तो उनका योग…'), opts: [T2('comes closer to the true area', 'असली क्षेत्रफल के और पास आता है'), T2('always gets bigger', 'हमेशा बड़ा होता जाता है'), T2('stays the same', 'वैसा ही रहता है')].map((x, i) => ({ label: t(x), ok: i === 0 })), why: T2('The gaps and overlaps shrink as the rectangles get thinner; the area is the limit of the sums.', 'आयत पतले होने पर ख़ाली जगह और ज़्यादा भाग घटते जाते हैं; क्षेत्रफल इन योगों की सीमा है।') };
      }
      if (mode === 'inequality') {
        const cand = [[0, 0], [1, 1], [-1, 2], [2, -1]].find(([x, y]) => R.parts.every((p) => Math.abs(p.gc(Object.assign({}, env(), { x, y }))) > 1e-9)) || [0, 0];
        const ok = satisfies(cand[0], cand[1]);
        return { q: T2(`Is the point ${pt(cand[0], cand[1])} in the solution region?`, `क्या बिंदु ${pt(cand[0], cand[1])} हल-क्षेत्र में है?`), opts: [{ label: t(W.yes), ok }, { label: t(W.no), ok: !ok }], why: T2(`Put x = ${fmt(cand[0])}, y = ${fmt(cand[1])} into each inequality and check if it is true.`, `हर असमिका में x = ${fmt(cand[0])}, y = ${fmt(cand[1])} रखो और देखो कि वह सही है या नहीं।`) };
      }
      if (mode === 'lp') {
        if (!lpData.best) return { q: T2(`Does Z have a ${R.dir === 'max' ? 'maximum' : 'minimum'} on this region?`, `क्या इस क्षेत्र पर Z का ${R.dir === 'max' ? 'अधिकतम' : 'न्यूनतम'} मान है?`), opts: [{ label: t(W.yes), ok: false }, { label: t(W.no), ok: true }], why: T2('The region has no end in the direction that improves Z, so there is always a better point.', 'Z को बेहतर करने वाली दिशा में क्षेत्र का अंत नहीं है, इसलिए हमेशा एक और बेहतर बिंदु मिलता है।') };
        const bestSet = lpData.best.at;
        const cs = lpData.corners.slice(0, 5);
        return { q: T2(`At which corner is Z the ${R.dir === 'max' ? 'largest' : 'smallest'}?`, `किस कोने पर Z ${R.dir === 'max' ? 'सबसे बड़ा' : 'सबसे छोटा'} है?`), opts: cs.map((P2) => ({ label: pt(P2[0], P2[1]), ok: bestSet.some((B) => Math.abs(B[0] - P2[0]) < 1e-9 && Math.abs(B[1] - P2[1]) < 1e-9) })), why: T2(`Work out Z at every corner and pick the ${R.dir === 'max' ? 'largest' : 'smallest'}: Z = ${fmt(lpData.best.z)}.`, `हर कोने पर Z निकालो और ${R.dir === 'max' ? 'सबसे बड़ा' : 'सबसे छोटा'} चुनो: Z = ${fmt(lpData.best.z)}।`) };
      }
      // fall-back: the y value at the traced point
      const y = f(S.tx);
      return numQ(T2(`What is y when x = ${fmt(S.tx)}?`, `x = ${fmt(S.tx)} होने पर y क्या है?`), y, [y + 1, -y, y * 2, y - 1], T2('Read it from the blue point, or put x into the expression.', 'नीले बिंदु से पढ़ो, या व्यंजक में x रखो।'));
    }
    function drawQuiz(A) {
      const box = root.querySelector('.gr-qbody');
      if (!box) return;
      const Q = S.quiz && S.quiz.done ? S.quiz.q : question(A);
      if (!S.quiz || !S.quiz.done) S.quiz = { q: Q, done: false };
      const done = S.quiz.done;
      box.innerHTML = `<p class="gr-q">${esc(t(Q.q))}</p><div class="gr-opts" ${Q.opts.length === 3 && Q.opts.every((o) => o.label.length <= 6) ? 'style="grid-template-columns:repeat(3,minmax(0,1fr))"' : ''}>${Q.opts.map((o, i) => `<button type="button" class="gr-opt ${done && i === S.quiz.pick ? (o.ok ? 'ok' : 'no') : done && o.ok ? 'ok' : ''}" data-key="answer" data-act="opt" data-i="${i}" ${done ? 'aria-disabled="true"' : ''}>${esc(o.label)}</button>`).join('')}</div>
        <div aria-live="polite">${done ? `<p class="gr-fb"><b>${esc(t(S.quiz.right ? W.right : W.wrong))}</b>${esc(t(Q.why))}</p><div class="gr-acts" style="margin-top:8px"><button type="button" class="gr-btn ghost2" data-key="answer" data-act="again">${esc(t(W.nextQ))}</button></div>` : ''}</div>`;
    }
    function drawSide(A) {
      root.querySelector('.gr-eqs').innerHTML = equations(A);
      root.querySelector('.gr-facts').innerHTML = facts(A);
      drawQuiz(A);
      const tb = root.querySelector('[data-act="tangent"]');
      if (tb) { tb.classList.toggle('on', S.tangent); tb.setAttribute('aria-pressed', String(S.tangent)); tb.querySelector('span').textContent = t(S.tangent ? W.tangentOff : W.tangentOn); }
      const ab = root.querySelector('[data-act="area"]');
      if (ab) { ab.setAttribute('aria-pressed', String(S.area)); ab.querySelector('span').textContent = t(S.area ? W.areaOff : W.areaOn); }
      const ro2 = root.querySelector('[data-out="rects"]');
      if (ro2) ro2.textContent = String(S.rects);
      const ub = root.querySelector('[data-act="undo"]');
      if (ub) ub.disabled = !(mode === 'points' ? S.pts.length : S.tests.length);
      // keep the trace slider in step with the view
      const tr = root.querySelector('input[data-p="x"]');
      if (tr) {
        const { lo, hi, step } = traceRange();
        tr.min = lo; tr.max = hi; tr.step = step;
        const v = mode === 'lp' ? S.k : S.tx;
        tr.value = v;
        tr.style.setProperty('--p', `${((v - lo) / (hi - lo)) * 100}%`);
        const out = root.querySelector('[data-out="x"]');
        if (out) out.textContent = fmt(v);
      }
    }

    // ---- events
    function featureEvents(before, after) {
      if (!before) return;
      if (mode === 'pair') { if (after.type === 'one' && before.type !== 'one') api.emit('intersect'); return; }
      if (after.roots.length && !before.roots.length) api.emit('root');
      if (after.max.length && !before.max.length) api.emit('max');
      if (after.min.length && !before.min.length) api.emit('min');
    }
    function setParam(k, v, final) {
      const [lo, hi] = P[k];
      v = clamp(roundTo(v, stepOf(k)), lo, hi);
      if (v === S.pv[k] && !final) return;
      const before = S.A;
      S.pv = Object.assign({}, S.pv, { [k]: v });
      if (S.quiz && S.quiz.done) S.quiz = null;
      const inp = root.querySelector(`input[data-p="${k}"]`);
      if (inp) { inp.value = v; inp.style.setProperty('--p', `${((v - lo) / (hi - lo)) * 100}%`); }
      const out = root.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = fmt(v);
      draw();
      api.emit('changed');
      featureEvents(before, S.A);
      if (final) api.record(`${k} = ${fmt(v)}`);
    }
    function setTrace(x, final) {
      const { lo, hi } = traceRange();
      if (mode === 'lp') {
        let k = clamp(x, lo, hi);
        const best = lpData.best;
        if (best && Math.abs(k - best.z) <= (hi - lo) * 0.02) k = best.z;
        S.k = rd(k, 1e6);
        draw();
        api.emit('changed');
        if (best && Math.abs(S.k - best.z) < 1e-9 && !S.revealed) { S.revealed = true; draw(); api.emit(R.dir); api.celebrate(); api.record(t(T2(`Found the best corner: Z = ${fmt(best.z)}`, `सबसे अच्छा कोना मिला: Z = ${fmt(best.z)}`))); }
        return;
      }
      x = clamp(x, lo, hi);
      const A = S.A || analyse();
      let snapped = null;
      A.feats.forEach((p) => { if (Math.abs(p.x - x) <= V.sx * 0.018 && (!snapped || Math.abs(p.x - x) < Math.abs(snapped.x - x))) snapped = p; });
      S.tx = snapped ? snapped.x : rd(x, 1e6);
      draw();
      api.emit('changed');
      const id = snapped ? snapped.kind + ':' + fmt(snapped.x, 3) : null;
      if (snapped && id !== S.onFeat) {
        S.onFeat = id;
        if (snapped.kind !== 'intersect') api.emit(snapped.kind);
        api.speak(featName(snapped.kind));
        api.record(`${featName(snapped.kind)} ${pt(snapped.x, snapped.y)}`);
      } else if (!snapped) S.onFeat = null;
      if (final) api.record(`x = ${fmt(S.tx)}`);
    }
    function animateView(to) {
      if (stopTween) stopTween();
      const from = Object.assign({}, V);
      stopTween = L.tween(380, (k) => {
        const e = L.ease(k);
        V = { cx: L.lerp(from.cx, to.cx, e), cy: L.lerp(from.cy, to.cy, e), sx: L.lerp(from.sx, to.sx, e), sy: L.lerp(from.sy, to.sy, e), eq: to.eq };
        if (traceMode) S.tx = clamp(S.tx, vx0(), vx1());
        draw();
      }, () => { stopTween = null; });
    }
    function zoom(act) {
      if (act === 'zreset') { animateView(V0); api.emit('changed'); return; }
      const k = act === 'zin' ? 1 / 1.6 : 1.6;
      const sx = V.sx * k;
      if (sx < V0.sx / 30 || sx > V0.sx * 30) { api.toast(T2('That is as far as the zoom goes.', 'ज़ूम इससे आगे नहीं जाता।')); return; }
      let cx = V.cx, cy = V.cy;
      if (act === 'zin' && traceMode) { const y = traceY(S.tx, S.A); cx = S.tx; if (Number.isFinite(y)) cy = y; }
      animateView({ cx, cy, sx, sy: V.sy * k, eq: V.eq });
      api.emit('changed');
      api.record(t(act === 'zin' ? W.zin : W.zout));
    }
    function snapPlane(x, y) {
      const s = S.tick ? Math.min(S.tick.sx, S.tick.sy) : 1;
      const u = mode === 'points' ? (s <= 1 ? (s < 1 ? s : 1) : s / 2) : s / 2;
      return [roundTo(x, u), roundTo(y, u)];
    }
    function addPoint(x, y) {
      if (mode === 'points') {
        if (S.pts.length >= 26) { api.toast(T2('That is enough points. Undo one first.', 'बिंदु काफ़ी हो गए। पहले एक हटाओ।')); return; }
        S.pts.push([x, y]);
        S.fresh = S.pts.length - 1;
        if (S.quiz && S.quiz.done) S.quiz = null;
        draw();
        api.emit('plotted');
        api.speak(pt(x, y));
        api.record(t(T2('Plotted ', 'बिंदु बनाया ')) + pt(x, y));
      } else {
        if (S.tests.length >= 8) S.tests.shift();
        S.tests.push([x, y]);
        draw();
        api.emit('plotted');
        const ok = satisfies(x, y);
        api.speak(t(ok ? T2('Yes, it is in the region.', 'हाँ, यह क्षेत्र में है।') : T2('No, it is outside.', 'नहीं, यह बाहर है।')));
        api.record(t(T2('Tested ', 'जाँचा ')) + pt(x, y) + (ok ? ' ✓' : ' ✗'));
      }
    }
    const svgXY = (ev) => { const m = svg.getScreenCTM(); if (!m) return null; const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return { px: p.x, py: p.y }; };
    let down = null;
    function onDown(ev) {
      const p = svgXY(ev);
      if (!p) return;
      const keyEl = ev.target.closest('[data-key]');
      if (traceMode && !(keyEl && keyEl.dataset.act === 'feat')) {
        if (!api.allowed('slider:x')) { api.nudge('slider:x'); return; }
        S.dragging = true;
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        setTrace(IX(p.px), false);
      }
      down = p;
    }
    function onMove(ev) { if (!S.dragging) return; const p = svgXY(ev); if (p) setTrace(IX(p.px), false); }
    function onUp(ev) {
      if (S.dragging) { S.dragging = false; api.record(`x = ${fmt(S.tx)}`); }
      const p = svgXY(ev);
      if ((mode === 'points' || mode === 'inequality') && p && down && Math.hypot(p.px - down.px, p.py - down.py) < 12 && ev.type === 'pointerup') {
        if (!api.allowed('point:add')) { api.nudge('point:add'); down = null; return; }
        const [x, y] = snapPlane(IX(p.px), IY(p.py));
        S.curOn = false;
        addPoint(x, y);
      }
      down = null;
    }
    function onClick(ev) {
      const el = ev.target.closest('[data-act]');
      if (!el || !root.contains(el)) return;
      const keyEl = el.closest('[data-key]');
      const key = keyEl ? keyEl.dataset.key : null;
      const act = el.dataset.act;
      if (act === 'tracept') return;
      if (key && !api.allowed(key)) { api.nudge(key); return; }
      if (act === 'inc' || act === 'dec') {
        const k = el.dataset.p;
        if (k === 'x') { const { step } = traceRange(); const s = mode === 'lp' ? step * 10 : V.sx / 40; setTrace((mode === 'lp' ? S.k : S.tx) + (act === 'inc' ? s : -s), true); }
        else setParam(k, S.pv[k] + (act === 'inc' ? stepOf(k) : -stepOf(k)), true);
      } else if (act === 'zin' || act === 'zout' || act === 'zreset') zoom(act);
      else if (act === 'tangent') {
        S.tangent = !S.tangent; draw();
        if (S.tangent) { api.emit('plotted'); api.record(t(W.tangentOn)); }
      } else if (act === 'area') {
        S.area = !S.area; draw();
        if (S.area) { api.emit('plotted'); api.record(t(W.areaOn)); }
      } else if (act === 'rinc' || act === 'rdec') {
        const seq = [0, 2, 4, 8, 16, 32, 64];
        const i = seq.indexOf(S.rects);
        S.rects = seq[clamp(i + (act === 'rinc' ? 1 : -1), 0, seq.length - 1)];
        draw();
        if (S.rects) { api.emit('plotted'); api.emit('changed'); api.record(`${t(W.rects)}: ${S.rects}`); }
      } else if (act === 'undo') {
        if (mode === 'points') S.pts.pop(); else S.tests.pop();
        if (S.quiz && S.quiz.done) S.quiz = null;
        draw(); api.emit('changed');
      } else if (act === 'feat') {
        if (key === 'intersect') { const ix = S.A.ix; api.emit('intersect'); api.speak(pt(ix.x, ix.y)); api.record(t(T2('Found the meeting point ', 'मिलन बिंदु मिला ')) + pt(ix.x, ix.y)); api.celebrate(); return; }
        setTrace(parseFloat(el.dataset.fx), true);
      } else if (act === 'corner') {
        const i = +el.dataset.i;
        S.tapped.add(i);
        const P2 = lpData.corners[i];
        draw();
        api.emit('changed');
        api.record(`${pt(P2[0], P2[1])}: Z = ${fmt(lpData.Z(P2))}`);
        if (lpData.best && lpData.corners.every((_, j) => S.tapped.has(j)) && !S.revealed) { S.revealed = true; draw(); api.emit(R.dir); }
      } else if (act === 'opt') {
        if (S.quiz.done) return;
        const o = S.quiz.q.opts[+el.dataset.i];
        S.quiz = Object.assign(S.quiz, { done: true, pick: +el.dataset.i, right: o.ok });
        if (mode === 'lp' && o.ok) S.revealed = true;
        draw();
        api.emit(o.ok ? 'answered:right' : 'answered:wrong');
        api.record(`${t(S.quiz.q.q)} → ${o.label} ${o.ok ? '✓' : '✗'}`);
        if (o.ok) api.celebrate();
      } else if (act === 'again') { S.quiz = null; draw(); }
    }
    function onInput(ev) {
      const el = ev.target;
      if (!el.matches || !el.matches('input[data-p]')) return;
      const k = el.dataset.p;
      if (!api.allowed('slider:' + k)) { api.nudge('slider:' + k); el.value = k === 'x' ? (mode === 'lp' ? S.k : S.tx) : S.pv[k]; return; }
      const v = parseFloat(el.value);
      if (k === 'x') setTrace(v, ev.type === 'change'); else setParam(k, v, ev.type === 'change');
    }
    function onKey(ev) {
      const el = ev.target.closest && ev.target.closest('[data-key]');
      if (!el || !svg.contains(el)) return;
      const key = el.dataset.key;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (key === 'point:add') {
        const s = S.tick ? Math.min(S.tick.sx, S.tick.sy) : 1;
        const u = mode === 'points' ? Math.min(1, s) : s / 2;
        if (arrows[ev.key]) { ev.preventDefault(); S.curOn = true; S.cur = { x: roundTo(clamp(S.cur.x + arrows[ev.key][0] * u, vx0(), vx1()), u), y: roundTo(clamp(S.cur.y + arrows[ev.key][1] * u, vy0(), vy1()), u) }; draw(); return; }
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (!api.allowed(key)) { api.nudge(key); return; } S.curOn = true; addPoint(S.cur.x, S.cur.y); }
        return;
      }
      if (el.dataset.act === 'tracept' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        ev.preventDefault();
        if (!api.allowed(key)) { api.nudge(key); return; }
        setTrace(S.tx + (ev.key === 'ArrowRight' ? 1 : -1) * V.sx / 80, true);
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    function onFocus(ev) { if (ev.target.classList && ev.target.classList.contains('gr-hit')) { if (!S.curOn) { S.curOn = true; draw(); } } }
    function onBlur(ev) { if (ev.target.classList && ev.target.classList.contains('gr-hit') && !(ev.relatedTarget && ev.relatedTarget.classList && ev.relatedTarget.classList.contains('gr-hit'))) { setTimeout(() => { const a = document.activeElement; if (S.curOn && !(a && a.classList && a.classList.contains('gr-hit'))) { S.curOn = false; draw(); } }, 0); } }

    build();
    draw();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('keydown', onKey);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onBlur);
    let lastNarrow = dims.narrow;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const nw = (root.clientWidth || 800) < 600;
        if (nw === lastNarrow) return;
        lastNarrow = nw;
        measure();
        V0 = initView();
        V = Object.assign({}, V0);
        if (traceMode) S.tx = clamp(S.tx, vx0(), vx1());
        draw();
      });
      ro.observe(root);
    }
    return {
      destroy() {
        if (stopTween) stopTween();
        if (ro) ro.disconnect();
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onInput);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('focusin', onFocus);
        root.removeEventListener('focusout', onBlur);
        if (svg) { svg.removeEventListener('pointerdown', onDown); svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerup', onUp); svg.removeEventListener('pointercancel', onUp); }
      },
    };
  }

  NCA_T.register({
    id: 'grapher',
    css: CSS,
    validate(c) { return prepare(c).errs; },
    keys(c) {
      const R = prepare(c);
      const targets = ['zoom', 'answer'];
      const events = ['changed', 'answered:right', 'answered:wrong'];
      if (R.errs.length) return { targets, events };
      const m = R.mode;
      Object.keys(R.P).forEach((k) => targets.push('slider:' + k));
      if (m === 'points' || m === 'inequality') { targets.push('point:add', 'point:undo'); events.push('plotted'); }
      if (FNMODES.includes(m)) targets.push('slider:x');
      if (m === 'derivative') { targets.push('tangent'); events.push('plotted'); }
      if (m === 'integral') { targets.push('area'); events.push('plotted'); }
      if (m === 'pair') targets.push('intersect');
      if (m === 'lp') { targets.push('slider:x', 'corner:*'); if (R.lp.best) events.push(R.dir); }
      if (FNMODES.includes(m) || m === 'pair') {
        const ev = possible(R);
        ['root', 'max', 'min', 'intersect'].forEach((k) => { if (ev[k]) events.push(k); });
      }
      return { targets, events };
    },
    demo: { mode: 'quadratic', params: { a: [-3, 3, 1], b: [-6, 6, -2], c: [-8, 8, -3] } },
    modes: MODES,
    // the pure model, for tests under Node
    model: { lex, parseRel, prepare, scan, simpson, solveLP, degree, quadCoef, linCoef },
    mount(root, config, api) { return grapher(root, config, api); },
  });
})();
