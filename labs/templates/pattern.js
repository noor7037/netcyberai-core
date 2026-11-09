// Template: Pattern maker. Continue and create patterns with shapes, colours and numbers; arithmetic and geometric
// progressions; figurate (dot) numbers. All arithmetic is exact (BigInt fractions), so every term, formula and sum on
// the screen is true. Config:
//   { kind: 'shapes'|'colours'|'numbers'|'ap'|'gp'|'figurate',
//     seed: [items or numbers],
//       shapes:  shape ids ('circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'hexagon', 'pentagon', 'cross',
//                'moon'), optionally with a colour ('circle:red'); colours: colour ids ('red' ... 'brown').
//                With a rule the seed lists the distinct items, without it the seed IS the repeating part (2-6 items).
//       numbers: the first term(s); with no rule the seed (4 or more terms) must follow one rule, found by the code.
//       ap: [a, d] (whole numbers); gp: [a, r] (a whole, r a multiple of 0.5, not 0); figurate: [] or omitted.
//     rule?: shapes/colours: letters like 'abb' (a = seed[0], b = seed[1] ...);
//            numbers: '+3', '-2', '×2', '÷2', '×2+1', '×3-1' or 'fib' (ap/gp: may repeat the true rule, e.g. '+3');
//            figurate (required): 'triangular'|'square'|'pentagonal'|'hexagonal'|'oblong'|'cubic'.
//     show?: how many terms are visible at the start (default depends on the kind) }
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex } = L;
  const T = (en, hi) => ({ en, hi });

  // ---------------------------------------------------------------- exact fractions (BigInt)
  const gcdB = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { const t = a % b; a = b; b = t; } return a; };
  const R = (n, d = 1n) => { n = BigInt(n); d = BigInt(d); if (d < 0n) { n = -n; d = -d; } const g = gcdB(n, d) || 1n; return { n: n / g, d: d / g }; };
  const radd = (x, y) => R(x.n * y.d + y.n * x.d, x.d * y.d);
  const rsub = (x, y) => R(x.n * y.d - y.n * x.d, x.d * y.d);
  const rmul = (x, y) => R(x.n * y.n, x.d * y.d);
  const rdiv = (x, y) => R(x.n * y.d, x.d * y.n);
  const rneg = (x) => R(-x.n, x.d);
  const req = (x, y) => x.n === y.n && x.d === y.d;
  const rpow = (x, e) => { let r = R(1); for (let i = 0; i < e; i++) r = rmul(r, x); return r; };
  const rsgn = (x) => (x.n < 0n ? -1 : x.n > 0n ? 1 : 0);
  const rabs = (x) => (x.n < 0n ? rneg(x) : x);
  const rnum = (x) => Number(x.n) / Number(x.d);
  const ZERO = R(0), ONE = R(1);
  function parseR(s) {
    if (typeof s === 'number') { if (!isFinite(s)) return null; s = String(s); }
    s = String(s).trim().replace(/[−–]/g, '-');
    const m = s.match(/^(-?)(\d+)(?:\.(\d{1,4}))?(?:\/(\d+))?$/);
    if (!m || (m[3] && m[4])) return null;
    let n, d = 1n;
    if (m[3]) { n = BigInt(m[2] + m[3]); d = 10n ** BigInt(m[3].length); } else n = BigInt(m[2]);
    if (m[4]) { d = BigInt(m[4]); if (d === 0n) return null; }
    if (m[1]) n = -n;
    return R(n, d);
  }
  function fmt(x) {
    const neg = x.n < 0n, n = neg ? -x.n : x.n, d = x.d;
    let s;
    if (d === 1n) s = n.toString();
    else {
      let dd = d, k2 = 0, k5 = 0;
      while (dd % 2n === 0n) { dd /= 2n; k2++; }
      while (dd % 5n === 0n) { dd /= 5n; k5++; }
      if (dd === 1n) {
        const k = Math.max(k2, k5);
        const str = ((10n ** BigInt(k)) / d * n).toString().padStart(k + 1, '0');
        s = str.slice(0, -k) + '.' + str.slice(-k);
      } else s = n + '/' + d;
    }
    return (neg ? '−' : '') + s;
  }
  const paren = (x) => (rsgn(x) < 0 ? '(' + fmt(x) + ')' : fmt(x));
  const BIG = 10n ** 14n, BIGD = 10n ** 6n;

  // ---------------------------------------------------------------- items: shapes and colours
  const SHAPES = {
    circle: { n: T('circle', 'वृत्त'), c: '#FF6B57' },
    square: { n: T('square', 'वर्ग'), c: '#2563EB' },
    triangle: { n: T('triangle', 'त्रिभुज'), c: '#22C55E' },
    star: { n: T('star', 'तारा'), c: '#F5B90A' },
    heart: { n: T('heart', 'दिल'), c: '#F43F8E' },
    diamond: { n: T('diamond', 'समचतुर्भुज'), c: '#8B3DFF' },
    hexagon: { n: T('hexagon', 'षट्भुज'), c: '#14B8A6' },
    pentagon: { n: T('pentagon', 'पंचभुज'), c: '#FF7A1A' },
    cross: { n: T('plus sign', 'जोड़ का चिह्न'), c: '#0F766E' },
    moon: { n: T('moon', 'चाँद'), c: '#4400F0' },
  };
  const COLOURS = {
    red: { n: T('red', 'लाल'), c: '#E5383B' },
    orange: { n: T('orange', 'नारंगी'), c: '#FF7A1A' },
    yellow: { n: T('yellow', 'पीला'), c: '#FFD23F' },
    green: { n: T('green', 'हरा'), c: '#22C55E' },
    blue: { n: T('blue', 'नीला'), c: '#2563EB' },
    purple: { n: T('purple', 'बैंगनी'), c: '#8B3DFF' },
    pink: { n: T('pink', 'गुलाबी'), c: '#F472B6' },
    brown: { n: T('brown', 'भूरा'), c: '#92400E' },
  };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function parseItem(kind, s) {
    if (typeof s !== 'string') return null;
    if (kind === 'colours') return has(COLOURS, s) ? { colour: s } : null;
    const m = s.match(/^([a-z]+)(?::([a-z]+))?$/);
    if (!m || !has(SHAPES, m[1]) || (m[2] && !has(COLOURS, m[2]))) return null;
    return { shape: m[1], colour: m[2] || null };
  }
  function itemName(kind, s) {
    const it = parseItem(kind, s);
    if (kind === 'colours') return COLOURS[it.colour].n;
    const sn = SHAPES[it.shape].n;
    if (!it.colour) return sn;
    const cn = COLOURS[it.colour].n;
    return T(cn.en + ' ' + sn.en, cn.hi + ' ' + sn.hi);
  }
  const poly = (n, r, rot, cx = 20, cy = 20) => Array.from({ length: n }, (_, i) => { const a = rot + (i * 2 * Math.PI) / n; return (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2); }).join(' ');
  const starPts = () => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 7.5 : 18; return (20 + r * Math.cos(a)).toFixed(2) + ',' + (21 + r * Math.sin(a)).toFixed(2); }).join(' ');
  function glyph(kind, s, size) {
    const it = parseItem(kind, s);
    const fill = kind === 'colours' ? COLOURS[it.colour].c : it.colour ? COLOURS[it.colour].c : SHAPES[it.shape].c;
    const edge = mixHex(fill, '#061233', 0.35);
    const st = `fill="${fill}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"`;
    let body;
    if (kind === 'colours') body = `<circle cx="20" cy="20" r="16" ${st}/>`;
    else {
      const sh = it.shape;
      if (sh === 'circle') body = `<circle cx="20" cy="20" r="16" ${st}/>`;
      else if (sh === 'square') body = `<rect x="5" y="5" width="30" height="30" rx="5" ${st}/>`;
      else if (sh === 'triangle') body = `<polygon points="20,4 37,35 3,35" ${st}/>`;
      else if (sh === 'star') body = `<polygon points="${starPts()}" ${st}/>`;
      else if (sh === 'heart') body = `<path d="M20 35 C4 24 3 12 11 8 C16 6 20 10 20 13 C20 10 24 6 29 8 C37 12 36 24 20 35Z" ${st}/>`;
      else if (sh === 'diamond') body = `<polygon points="20,3 36,20 20,37 4,20" ${st}/>`;
      else if (sh === 'hexagon') body = `<polygon points="${poly(6, 17, 0)}" ${st}/>`;
      else if (sh === 'pentagon') body = `<polygon points="${poly(5, 17, -Math.PI / 2, 20, 21)}" ${st}/>`;
      else if (sh === 'cross') body = `<path d="M15 4h10v11h11v10H25v11H15V25H4V15h11z" ${st}/>`;
      else body = `<path d="M26 4 A16 16 0 1 0 36 27 A13 13 0 1 1 26 4Z" ${st}/>`;
    }
    const shine = `<ellipse cx="14" cy="13" rx="4.5" ry="2.4" fill="#fff" opacity=".38" transform="rotate(-30 14 13)"/>`;
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}${kind === 'colours' || (it.shape !== 'moon' && it.shape !== 'cross') ? shine : ''}</svg>`;
  }

  // ---------------------------------------------------------------- number rules
  const RULE_RE = {
    add: /^\+(\d+(?:\.\d{1,3})?)$/, sub: /^-(\d+(?:\.\d{1,3})?)$/, mul: /^×(-?\d+(?:\.\d{1,3})?)$/, div: /^÷(\d+(?:\.\d{1,3})?)$/,
    lin: /^×(-?\d+(?:\.\d{1,3})?)([+-]\d+(?:\.\d{1,3})?)$/,
  };
  function parseRule(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim().replace(/[−–]/g, '-').replace(/[x*]/gi, '×').replace(/\//g, '÷').replace(/\s+/g, '');
    if (s.toLowerCase() === 'fib') return { t: 'fib' };
    let m;
    if ((m = s.match(RULE_RE.add))) return { t: 'add', k: parseR(m[1]) };
    if ((m = s.match(RULE_RE.sub))) return { t: 'add', k: rneg(parseR(m[1])) };
    if ((m = s.match(RULE_RE.lin))) { const k = parseR(m[1]); return rsgn(k) === 0 ? null : { t: 'lin', m: k, c: parseR(m[2].replace('+', '')) }; }
    if ((m = s.match(RULE_RE.mul))) { const k = parseR(m[1]); return rsgn(k) === 0 ? null : { t: 'mul', k }; }
    if ((m = s.match(RULE_RE.div))) { const k = parseR(m[1]); return rsgn(k) === 0 ? null : { t: 'mul', k: rdiv(ONE, k) }; }
    return null;
  }
  function applyRule(r, prev, prev2) {
    if (r.t === 'add') return radd(prev, r.k);
    if (r.t === 'mul') return rmul(prev, r.k);
    if (r.t === 'lin') return radd(rmul(prev, r.m), r.c);
    return radd(prev, prev2);
  }
  function genTerms(r, seed, len) {
    const out = seed.slice(0, r.t === 'fib' ? 2 : 1);
    while (out.length < len) out.push(applyRule(r, out[out.length - 1], out[out.length - 2]));
    return out.slice(0, len);
  }
  const tooBig = (v) => v.some((x) => (x.n < 0n ? -x.n : x.n) > BIG || x.d > BIGD);
  // Find the single rule a list of at least 4 terms follows (or null).
  function inferRule(t) {
    if (t.length < 4) return null;
    const d = rsub(t[1], t[0]);
    if (t.every((x, i) => i === 0 || req(rsub(x, t[i - 1]), d))) return { t: 'add', k: d };
    if (t.every((x) => rsgn(x) !== 0)) {
      const q = rdiv(t[1], t[0]);
      if (t.every((x, i) => i === 0 || req(rdiv(x, t[i - 1]), q))) return { t: 'mul', k: q };
    }
    if (t.every((x, i) => i < 2 || req(x, radd(t[i - 1], t[i - 2])))) return { t: 'fib' };
    const dd = rsub(t[1], t[0]);
    if (rsgn(dd) !== 0) {
      const m = rdiv(rsub(t[2], t[1]), dd), c = rsub(t[1], rmul(m, t[0]));
      if (rsgn(m) !== 0 && t.every((x, i) => i === 0 || req(x, radd(rmul(m, t[i - 1]), c)))) return { t: 'lin', m, c };
    }
    return null;
  }

  // ---------------------------------------------------------------- figurate numbers
  const FAMS = {
    triangular: { n: T('Triangular numbers', 'त्रिकोणीय संख्याएँ'), one: T('triangular', 'त्रिकोणीय'), max: 8, f: (n) => (n * (n + 1)) / 2, form: 'n(n+1)/2' },
    square: { n: T('Square numbers', 'वर्ग संख्याएँ'), one: T('square', 'वर्ग'), max: 8, f: (n) => n * n, form: 'n × n' },
    oblong: { n: T('Oblong numbers', 'आयताकार संख्याएँ'), one: T('oblong', 'आयताकार'), max: 8, f: (n) => n * (n + 1), form: 'n(n+1)' },
    pentagonal: { n: T('Pentagonal numbers', 'पंचकोणीय संख्याएँ'), one: T('pentagonal', 'पंचकोणीय'), max: 8, f: (n) => (n * (3 * n - 1)) / 2, form: 'n(3n−1)/2' },
    hexagonal: { n: T('Hexagonal numbers', 'षट्कोणीय संख्याएँ'), one: T('hexagonal', 'षट्कोणीय'), max: 8, f: (n) => n * (2 * n - 1), form: 'n(2n−1)' },
    cubic: { n: T('Cube numbers', 'घन संख्याएँ'), one: T('cube', 'घन'), max: 6, f: (n) => n * n * n, form: 'n × n × n' },
  };
  const FAM_LIST = ['triangular', 'square', 'oblong', 'pentagonal', 'hexagonal', 'cubic'];
  const LAYER_COL = ['#2563EB', '#FF7A1A', '#22C55E', '#8B3DFF', '#F5B90A', '#FF6B57', '#14B8A6', '#F472B6'];
  // Dots of the n-th figure, in screen coordinates (y down), each with the layer it was added in.
  function figPoints(fam, n) {
    const pts = [];
    if (fam === 'triangular') { for (let r = 1; r <= n; r++) for (let c = 0; c < r; c++) pts.push({ x: c - (r - 1) / 2, y: (r - 1) * 0.866, l: r }); }
    else if (fam === 'square') { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push({ x: i, y: j, l: Math.max(i, j) + 1 }); }
    else if (fam === 'oblong') { for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) pts.push({ x: i, y: j, l: Math.max(i, j + 1) }); }
    else if (fam === 'pentagonal' || fam === 'hexagonal') {
      const s = fam === 'pentagonal' ? 5 : 6, seen = new Set();
      const add = (x, y, l) => { const k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4); if (!seen.has(k)) { seen.add(k); pts.push({ x, y: -y, l }); } };
      for (let k = 1; k <= n; k++) {
        let x = 0, y = 0;
        add(0, 0, k);
        for (let e = 0; e < s; e++) { const a = (e * 2 * Math.PI) / s; for (let t = 1; t < k; t++) { x += Math.cos(a); y += Math.sin(a); add(x, y, k); } }
      }
    }
    return pts;
  }
  function figBounds(fam, n) {
    if (fam === 'cubic') return { x0: 0, y0: 0, w: 1.5 * n, h: 1.5 * n, cx: 0.75 * n, cy: 0.75 * n };
    const p = figPoints(fam, n);
    const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x0, y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // The n-th figure as an SVG sized to the frame of the largest figure (nMax) so growth is visible.
  function figSVG(fam, n, nMax, px, layered) {
    const B = figBounds(fam, nMax);
    const span = Math.max(B.w, B.h, 1);
    if (fam === 'cubic') {
      const s = 88 / (1.5 * nMax), ox = 6, oy = 94, d = s * 0.5;
      let g = '';
      const cell = (pts, fill) => `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${fill}" stroke="#fff" stroke-width="${Math.max(0.5, s * 0.06).toFixed(2)}" stroke-linejoin="round"/>`;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = ox + i * s, y = oy - (j + 1) * s;
        g += cell([[x, y], [x + s, y], [x + s, y + s], [x, y + s]], '#2563EB');
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        const x = ox + i * s + k * d, y = oy - n * s - k * d;
        g += cell([[x, y], [x + s, y], [x + s + d, y - d], [x + d, y - d]], '#8EA9FF');
      }
      for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const x = ox + n * s + k * d, y = oy - (j + 1) * s - k * d;
        g += cell([[x, y], [x + d, y - d], [x + d, y - d + s], [x, y + s]], '#1E3FA0');
      }
      return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true" focusable="false">${g}</svg>`;
    }
    const sc = 84 / span;
    const r = Math.max(1.3, Math.min(7.5, sc * 0.36));
    const dots = figPoints(fam, n).map((p) => `<circle cx="${(50 + (p.x - B.cx) * sc).toFixed(1)}" cy="${(50 + (p.y - B.cy) * sc).toFixed(1)}" r="${r.toFixed(2)}" fill="${layered ? LAYER_COL[(p.l - 1) % LAYER_COL.length] : '#2563EB'}"/>`).join('');
    return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true" focusable="false">${dots}</svg>`;
  }

  // ---------------------------------------------------------------- config analysis (pure)
  const KINDS = ['shapes', 'colours', 'numbers', 'ap', 'gp', 'figurate'];
  const GP_R = [];
  for (let v = -8; v <= 8; v++) if (v !== 0) GP_R.push(R(v, 2));
  const isHalf = (x) => x.d === 1n || x.d === 2n;
  const MAXT = { shapes: 14, colours: 14, numbers: 14, ap: 12, gp: 12 };
  function analyse(c) {
    const err = [];
    const fail = () => ({ errors: err, m: null });
    if (!c || typeof c !== 'object' || Array.isArray(c)) { err.push('config must be an object'); return fail(); }
    Object.keys(c).forEach((k) => { if (!['kind', 'seed', 'rule', 'show'].includes(k)) err.push('unknown key: ' + k); });
    if (!KINDS.includes(c.kind)) { err.push('kind must be one of ' + KINDS.join(', ')); return fail(); }
    const kind = c.kind;
    if (c.show != null && !Number.isInteger(c.show)) err.push('show must be a whole number');
    const seed = c.seed;
    if (kind === 'figurate') {
      if (seed != null && !(Array.isArray(seed) && seed.length === 0)) err.push("figurate: seed must be empty or left out (the 'rule' names the family)");
      if (!has(FAMS, c.rule)) { err.push('figurate: rule must be one of ' + FAM_LIST.join(', ')); return fail(); }
      const F = FAMS[c.rule], max = F.max;
      const show = c.show == null ? Math.min(4, max) : c.show;
      if (Number.isInteger(show) && (show < 3 || show > max)) err.push(`show must be from 3 to ${max} for ${c.rule} numbers`);
      if (err.length) return fail();
      const vals = Array.from({ length: max }, (_, i) => R(F.f(i + 1)));
      return { errors: err, m: { kind, maxT: max, show, fam: c.rule, vals, sumable: null } };
    }
    if (!Array.isArray(seed)) { err.push('seed must be an array'); return fail(); }
    if (kind === 'shapes' || kind === 'colours') {
      const items = seed.map((s) => parseItem(kind, s));
      seed.forEach((s, i) => { if (!items[i]) err.push(`seed[${i}]: '${s}' is not a ${kind === 'colours' ? 'colour (' + Object.keys(COLOURS).join(', ') + ')' : 'shape (' + Object.keys(SHAPES).join(', ') + ', optionally shape:colour)'}`); });
      if (err.length) return fail();
      let unit;
      if (c.rule != null) {
        if (typeof c.rule !== 'string' || !/^[a-f]{2,6}$/.test(c.rule)) { err.push("rule must be letters like 'abb' (2 to 6 letters, a to f)"); return fail(); }
        const top = Math.max(...c.rule.split('').map((ch) => ch.charCodeAt(0) - 96));
        for (let i = 1; i <= top; i++) if (!c.rule.includes(String.fromCharCode(96 + i))) { err.push(`rule '${c.rule}' skips the letter '${String.fromCharCode(96 + i)}'`); break; }
        if (seed.length !== top) err.push(`seed must list exactly ${top} items for rule '${c.rule}' (a to ${String.fromCharCode(96 + top)})`);
        if (new Set(seed).size !== seed.length) err.push('with a rule, the seed items must all be different');
        if (top < 2) err.push('the rule needs at least two different letters');
        if (err.length) return fail();
        unit = c.rule.split('').map((ch) => seed[ch.charCodeAt(0) - 97]);
      } else {
        if (seed.length < 2 || seed.length > 6) { err.push('without a rule the seed is the repeating part: 2 to 6 items'); return fail(); }
        if (new Set(seed).size < 2) { err.push('the repeating part needs at least two different items'); return fail(); }
        unit = seed.slice();
      }
      const len = unit.length;
      const show = c.show == null ? Math.min(12, Math.max(5, 2 * len + 1)) : c.show;
      if (Number.isInteger(show)) {
        if (show < 2 * len) err.push(`show must be at least ${2 * len} so the repeating part is seen twice`);
        if (show > 12) err.push('show can be at most 12');
      }
      if (err.length) return fail();
      const MX = MAXT[kind];
      return { errors: err, m: { kind, maxT: MX, show, unit, items: Array.from({ length: MX }, (_, i) => unit[i % len]), sumable: null } };
    }
    // numbers, ap, gp
    let rule, vals, show;
    if (kind === 'ap' || kind === 'gp') {
      if (seed.length !== 2) { err.push(kind === 'ap' ? 'ap: seed is [a, d] (first term, common difference)' : 'gp: seed is [a, r] (first term, common ratio)'); return fail(); }
      const a = typeof seed[0] === 'number' ? seed[0] : NaN, x = typeof seed[1] === 'number' ? seed[1] : NaN;
      if (!Number.isInteger(a) || a < -50 || a > 50) err.push('a must be a whole number from -50 to 50');
      if (kind === 'ap') { if (!Number.isInteger(x) || x < -20 || x > 20) err.push('d must be a whole number from -20 to 20'); }
      else {
        if (a === 0) err.push('gp: a cannot be 0');
        const r = Number.isFinite(x) ? parseR(x) : null;
        if (!r || !GP_R.some((g) => req(g, r))) err.push('r must be a multiple of 0.5 from -4 to 4, not 0');
      }
      if (err.length) return fail();
      rule = kind === 'ap' ? { t: 'add', k: R(seed[1]) } : { t: 'mul', k: parseR(seed[1]) };
      if (c.rule != null) {
        const given = parseRule(c.rule);
        if (!given || given.t !== rule.t || !req(given.k, rule.k)) err.push(`rule '${c.rule}' does not match the seed (${kind === 'ap' ? '+' + seed[1] : '×' + seed[1]})`);
      }
      show = c.show == null ? 6 : c.show;
      if (Number.isInteger(show) && (show < 3 || show > 12)) err.push('show must be from 3 to 12');
      if (err.length) return fail();
      vals = genTerms(rule, [R(seed[0])], MAXT[kind]);
    } else {
      const sv = seed.map((s) => (typeof s === 'number' && Number.isFinite(s) ? parseR(s) : null));
      seed.forEach((s, i) => { if (!sv[i]) err.push(`seed[${i}] must be a number with at most 4 decimals`); });
      if (seed.length < 1 || seed.length > 14) err.push('seed: 1 to 14 numbers');
      if (err.length) return fail();
      if (c.rule != null) {
        rule = parseRule(c.rule);
        if (!rule) { err.push("rule must look like '+3', '-2', '×2', '÷2', '×2+1' or 'fib'"); return fail(); }
        const need = rule.t === 'fib' ? 2 : 1;
        if (sv.length < need) { err.push(`rule '${c.rule}' needs at least ${need} seed term${need > 1 ? 's' : ''}`); return fail(); }
        const gen = genTerms(rule, sv, sv.length);
        if (sv.some((x, i) => !req(x, gen[i]))) { err.push(`the seed does not follow the rule '${c.rule}'`); return fail(); }
      } else {
        rule = inferRule(sv);
        if (!rule) { err.push('without a rule the seed needs 4 or more terms that follow one rule (add, subtract, multiply, divide, multiply-then-add, or Fibonacci)'); return fail(); }
      }
      const minShow = rule.t === 'fib' ? 4 : 3;
      show = c.show == null ? Math.min(12, Math.max(rule.t === 'fib' ? 6 : 5, c.rule == null ? sv.length : sv.length)) : c.show;
      if (Number.isInteger(show) && (show < minShow || show > 12)) err.push(`show must be from ${minShow} to 12`);
      if (Number.isInteger(show) && show < sv.length) err.push('show cannot be smaller than the number of seed terms');
      if (err.length) return fail();
      vals = genTerms(rule, sv, MAXT.numbers);
    }
    if (tooBig(vals)) { err.push('the numbers grow too big (or too fine) to show'); return fail(); }
    const sumable = rule.t === 'add' ? 'ap' : rule.t === 'mul' ? 'gp' : null;
    return { errors: err, m: { kind, maxT: MAXT[kind], show, rule, vals, sumable } };
  }
  function validate(c) { return analyse(c).errors; }
  function keys(c) {
    const m = analyse(c).m;
    const kind = c && c.kind;
    const targets = ['tile:*', 'answer', 'next', 'rule'];
    const events = ['extended', 'rule-found', 'answered:right', 'answered:wrong'];
    const sumable = m ? m.sumable : kind === 'ap' || kind === 'gp' ? kind : null;
    if (sumable) { targets.push('sum'); events.push('sum'); }
    if (kind === 'ap') targets.push('slider:a', 'slider:d', 'slider:n');
    else if (kind === 'gp') targets.push('slider:a', 'slider:r', 'slider:n');
    else if (kind === 'figurate') targets.push('slider:n');
    return { targets, events };
  }

  // ---------------------------------------------------------------- pure helpers for the rule question
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
  const lcg = (seed) => { let h = seed >>> 0; return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; };
  function ruleLabel(r) {
    if (r.t === 'fib') return T('Add the two numbers before it', 'पिछली दो संख्याएँ जोड़ो');
    if (r.t === 'add') {
      const s = rsgn(r.k);
      if (s >= 0) return T(`Add ${fmt(r.k)} each time`, `हर बार ${fmt(r.k)} जोड़ो`);
      return T(`Subtract ${fmt(rneg(r.k))} each time`, `हर बार ${fmt(rneg(r.k))} घटाओ`);
    }
    if (r.t === 'mul') {
      if (r.k.n === 1n && r.k.d > 1n) return T(`Divide by ${r.k.d} each time`, `हर बार ${r.k.d} से भाग दो`);
      return T(`Multiply by ${fmt(r.k)} each time`, `हर बार ${fmt(r.k)} से गुणा करो`);
    }
    const plus = rsgn(r.c) >= 0;
    return T(`Multiply by ${fmt(r.m)}, then ${plus ? 'add' : 'subtract'} ${fmt(plus ? r.c : rneg(r.c))}`, `${fmt(r.m)} से गुणा करो, फिर ${fmt(plus ? r.c : rneg(r.c))} ${plus ? 'जोड़ो' : 'घटाओ'}`);
  }
  const ruleChip = (r) => (r.t === 'add' ? (rsgn(r.k) >= 0 ? '+' : '−') + fmt(rabs(r.k)) : r.t === 'mul' ? (r.k.n === 1n && r.k.d > 1n ? '÷' + r.k.d : '×' + fmt(r.k)) : r.t === 'lin' ? '×' + fmt(r.m) + (rsgn(r.c) >= 0 ? '+' : '−') + fmt(rabs(r.c)) : '');
  const ruleKey = (r) => ruleChip(r) + r.t;
  function numRuleOptions(m) {
    const shown = m.vals.slice(0, m.show), r = m.rule;
    const consistent = (q) => { if (q.t === 'fib' && shown.length < 2) return false; const g = genTerms(q, shown, shown.length); return g.every((x, i) => req(x, shown[i])); };
    const cand = [], push = (q) => { if (q && !(q.t === 'mul' && rsgn(q.k) === 0)) cand.push(q); };
    const A = (k) => ({ t: 'add', k: R(k) }), M = (k) => ({ t: 'mul', k: typeof k === 'bigint' || typeof k === 'number' ? R(k) : k });
    if (r.t === 'add') { const k = r.k; [1, -1, 2, -2].forEach((e) => push({ t: 'add', k: radd(k, R(e)) })); push({ t: 'add', k: rneg(k) }); push({ t: 'mul', k: rabs(k) }); push({ t: 'mul', k: radd(k, ONE) }); push({ t: 'lin', m: R(2), c: k }); }
    else if (r.t === 'mul') { const k = r.k; [1, -1, 2].forEach((e) => push({ t: 'mul', k: radd(k, R(e)) })); push({ t: 'add', k }); push({ t: 'add', k: rsub(shown[1], shown[0]) }); push({ t: 'mul', k: rneg(k) }); push({ t: 'lin', m: k, c: ONE }); }
    else if (r.t === 'lin') { [1, -1, 2].forEach((e) => { push({ t: 'lin', m: r.m, c: radd(r.c, R(e)) }); push({ t: 'lin', m: radd(r.m, R(e)), c: r.c }); }); push({ t: 'mul', k: r.m }); push({ t: 'add', k: r.c }); }
    else { push({ t: 'add', k: rsub(shown[1], shown[0]) }); push({ t: 'mul', k: M(2) }); push({ t: 'add', k: R(2) }); push({ t: 'lin', m: R(2), c: ONE }); push({ t: 'add', k: R(3) }); }
    [1, 2, 3, 5, 10].forEach((e) => push(A(e))); [2, 3].forEach((e) => push(M(e)));
    const seen = new Set([ruleKey(r)]), pool = [];
    const rnd = lcg(hash(ruleKey(r) + fmt(m.vals[0])));
    cand.map((q) => [rnd(), q]).sort((a, b) => a[0] - b[0]).forEach(([, q]) => {
      const k = ruleKey(q);
      if (seen.has(k) || pool.length >= 3 || consistent(q)) return;
      seen.add(k); pool.push(q);
    });
    const pos = hash(ruleKey(r)) % (pool.length + 1);
    const list = pool.map((q) => ({ label: ruleLabel(q), ok: false }));
    list.splice(pos, 0, { label: ruleLabel(r), ok: true });
    return list;
  }
  function unitRuleOptions(m) {
    const distinct = [...new Set(m.unit)], shown = m.items.slice(0, m.show);
    const consistent = (u) => shown.every((it, i) => u[i % u.length] === it);
    const key = (u) => u.join('|');
    const seen = new Set([key(m.unit)]), pool = [];
    const rnd = lcg(hash(key(m.unit)));
    for (let tries = 0; tries < 300 && pool.length < 3; tries++) {
      const len = 2 + Math.floor(rnd() * 4);
      const u = Array.from({ length: len }, () => distinct[Math.floor(rnd() * distinct.length)]);
      if (new Set(u).size < 2 || seen.has(key(u)) || consistent(u)) continue;
      seen.add(key(u)); pool.push(u);
    }
    const list = pool.map((u) => ({ unit: u, ok: false }));
    list.splice(hash(key(m.unit)) % (pool.length + 1), 0, { unit: m.unit, ok: true });
    return list;
  }
  function famRuleOptions(m) {
    const others = FAM_LIST.filter((f) => f !== m.fam);
    const start = hash(m.fam) % others.length;
    const pick = [0, 1, 2].map((i) => others[(start + i) % others.length]);
    const list = pick.map((f) => ({ fam: f, ok: false }));
    list.splice(hash(m.fam + 'x') % 4, 0, { fam: m.fam, ok: true });
    return list;
  }
  // Sum of the first n terms: the formula route and the plain adding route (they must agree).
  function sumInfo(m, n) {
    const a = m.vals[0], vals = m.vals.slice(0, n);
    const direct = vals.reduce((s, x) => radd(s, x), ZERO);
    if (m.sumable === 'ap') {
      const d = m.rule.k, N = R(n);
      const viaFormula = rmul(rdiv(N, R(2)), radd(rmul(R(2), a), rmul(R(n - 1), d)));
      return { type: 'ap', a, d, n, direct, formula: viaFormula, pair: radd(vals[0], vals[n - 1]) };
    }
    const r = m.rule.k;
    const viaFormula = req(r, ONE) ? rmul(R(n), a) : rdiv(rmul(a, rsub(rpow(r, n), ONE)), rsub(r, ONE));
    const inf = rsgn(rsub(rabs(r), ONE)) < 0 ? rdiv(a, rsub(ONE, r)) : null;
    return { type: 'gp', a, r, n, direct, formula: viaFormula, inf };
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `
.pt { display: grid; gap: 12px; max-width: 980px; margin: 0 auto; color: var(--ink); font-family: var(--font-body); }
.pt * { box-sizing: border-box; }
.pt button { font: inherit; }
.pt-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.pt-title { font-family: var(--font-display); font-weight: 800; font-size: 1.35rem; margin: 0; color: var(--ink); }
.pt-prompt { margin: 0; color: var(--ink-2); font-size: 1rem; flex: 1 1 260px; }
.pt-board { position: relative; background: linear-gradient(160deg, #F6E9FF 0%, #E4ECFF 55%, #D9F7FF 100%); border: 1px solid rgba(139,61,255,.28); border-radius: 20px; padding: 16px 12px 14px; box-shadow: inset 0 -10px 30px rgba(139,61,255,.08); color: #1E293B; }
.pt-tiles { display: flex; flex-wrap: wrap; gap: 10px 8px; justify-content: center; }
.pt-tile { position: relative; flex: 0 0 auto; min-width: 62px; min-height: 80px; padding: 16px 6px 8px; border-radius: 16px; border: 2px solid #fff; background: #fff; box-shadow: 0 3px 0 rgba(6,18,51,.12), 0 8px 16px rgba(6,18,51,.10); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #1E293B; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
.pt-tile:hover { transform: translateY(-2px); }
.pt-tile.sel { border-color: #8B3DFF; box-shadow: 0 0 0 3px rgba(139,61,255,.35), 0 8px 16px rgba(6,18,51,.12); }
.pt-tile .ix { position: absolute; top: 3px; left: 7px; font-size: .68rem; font-weight: 700; color: #64748B; }
.pt-tile .nm { font-size: .68rem; font-weight: 600; color: #475569; line-height: 1.05; text-align: center; max-width: 66px; }
.pt-tile .val { font-family: var(--font-display); font-weight: 800; font-size: 1.45rem; line-height: 1.05; color: #1E293B; }
.pt-tile .val.long { font-size: 1.05rem; } .pt-tile .val.xl { font-size: .85rem; }
.pt-tile .pt-chip { flex: none; line-height: 1.5; font-size: .7rem; font-weight: 800; color: #fff; background: #8B3DFF; border-radius: 999px; padding: 1px 7px; margin-top: 2px; white-space: nowrap; }
.pt-tile.fig { min-width: 78px; padding-top: 14px; }
.pt-tile.q { border: 2px dashed #8B3DFF; background: rgba(255,255,255,.65); color: #8B3DFF; box-shadow: none; }
.pt-tile.q .val { color: #8B3DFF; font-size: 1.9rem; }
.pt-tile.unit::after { content: ''; position: absolute; left: 6px; right: 6px; bottom: -7px; height: 5px; border-radius: 4px; background: #14B8A6; }
.pt-tile.pair { border-top: 6px solid var(--pc, #8B3DFF); }
.pt-tile.mid { border-top: 6px dashed #94A3B8; }
.pt-new { animation: pt-pop .5s cubic-bezier(.2,1.4,.4,1); }
@keyframes pt-pop { 0% { transform: scale(.3) translateY(14px); opacity: 0; } 100% { transform: none; opacity: 1; } }
.pt-note { text-align: center; margin: 14px 0 0; font-weight: 700; color: #0F766E; font-size: .95rem; }
.pt-stage { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: center; background: rgba(255,255,255,.7); border-radius: 16px; padding: 10px; }
.pt-stage svg { width: min(210px, 62vw); height: auto; flex: 0 0 auto; }
.pt-stage p { margin: 0; flex: 1 1 200px; font-size: 1rem; color: #1E293B; }
.pt-stage b { font-family: var(--font-display); font-size: 1.5rem; color: #8B3DFF; }
.pt-chart { margin: 12px auto 0; max-width: 620px; background: rgba(255,255,255,.7); border-radius: 16px; padding: 8px 8px 4px; }
.pt-chart svg { display: block; width: 100%; height: auto; }
.pt-chart text { font-family: var(--font-body); font-size: 10px; fill: #475569; }
.pt-ctl { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px 14px; align-items: center; }
.pt-sl { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 12px 0; }
.pt-sl label { font-weight: 700; font-size: .92rem; }
.pt-sl output { font-family: var(--font-display); font-weight: 800; min-width: 2.4em; text-align: right; color: var(--grape); }
.pt-sl input[type=range] { grid-column: 1 / -1; grid-row: 2; width: 100%; min-height: 44px; accent-color: #8B3DFF; margin: 0; }
.pt-next { min-height: 52px; border: 0; border-radius: 14px; padding: 0 20px; font-weight: 800; font-size: 1.05rem; color: #fff; background: linear-gradient(135deg, #8B3DFF, #4400F0); box-shadow: 0 4px 0 #2d00a8, 0 8px 18px rgba(68,0,240,.28); display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.pt-next:active { transform: translateY(2px); box-shadow: 0 2px 0 #2d00a8; }
.pt-next:disabled { opacity: .5; box-shadow: none; }
.pt-cards { align-items: start; display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; }
.pt-card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 14px; display: grid; gap: 10px; align-content: start; min-width: 0; }
.pt-card h3 { font-size: 1.12rem; margin: 0; display: flex; align-items: center; gap: 8px; }
.pt-card h3 i { font-style: normal; display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--grape); color: var(--bg); font-size: .85rem; flex: 0 0 auto; }
.pt-card p { margin: 0; color: var(--ink-2); }
.pt-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pt-in { flex: 1 1 120px; min-width: 0; min-height: 52px; border-radius: 12px; border: 2px solid var(--line); background: var(--sunk); color: var(--ink); font-family: var(--font-display); font-weight: 800; font-size: 1.4rem; padding: 0 12px; text-align: center; }
.pt-in:focus { border-color: var(--grape); outline: none; box-shadow: 0 0 0 3px var(--grape-t); }
.pt-go { min-height: 52px; border: 0; border-radius: 12px; padding: 0 20px; font-weight: 800; color: #fff; background: #0F766E; box-shadow: 0 3px 0 #0a4f4a; }
.pt-pal { display: flex; flex-wrap: wrap; gap: 8px; }
.pt-opt { min-width: 56px; min-height: 56px; border-radius: 14px; border: 2px solid var(--line); background: var(--sunk); display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 8px; color: var(--ink); font-weight: 700; text-align: left; transition: transform .12s, border-color .12s; }
.pt-opt:hover { transform: translateY(-2px); border-color: var(--grape); }
.pt-opt.bad { border-color: var(--bad); background: var(--bad-t); }
.pt-opt.good { border-color: var(--good); background: var(--good-t); }
.pt-opt:disabled { cursor: default; opacity: .8; transform: none; }
.pt-opts { display: grid; gap: 8px; }
.pt-opts .pt-opt { justify-content: flex-start; min-height: 52px; font-size: .98rem; }
.pt-unitrow { display: inline-flex; align-items: center; gap: 2px; }
.pt-fb { margin: 0; min-height: 1.4em; font-weight: 700; }
.pt-fb.good { color: var(--good); } .pt-fb.bad { color: var(--bad); }
.pt-shake { animation: pt-shake .4s; }
@keyframes pt-shake { 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
.pt-info { background: var(--grape-t); color: var(--ink); border-radius: 14px; padding: 10px 14px; min-height: 48px; font-weight: 600; }
.pt-math { display: grid; gap: 8px; }
.pt-eq { font-family: var(--font-display); font-size: 1.12rem; line-height: 1.6; overflow-wrap: anywhere; color: var(--ink); }
.pt-eq sub { font-size: .7em; }
.pt-sum { animation: pt-rise .45s ease; display: grid; gap: 4px; background: var(--good-t); border: 1px solid var(--good); border-radius: 14px; padding: 10px 14px; }
.pt-sum .big { font-family: var(--font-display); font-weight: 800; font-size: 1.5rem; color: var(--good); }
@keyframes pt-rise { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: none; opacity: 1; } }
.pt-sumbtn { min-height: 48px; border: 2px solid var(--grape); background: var(--grape-t); color: var(--ink); font-weight: 800; border-radius: 12px; padding: 0 16px; justify-self: start; }
@media (prefers-reduced-motion: reduce) { .pt-new, .pt-shake, .pt-sum { animation: none; } .pt-tile, .pt-opt { transition: none; } }
@media (max-width: 480px) { .pt-tile { min-width: 56px; } .pt-title { font-size: 1.2rem; } }
`;

  // ---------------------------------------------------------------- the interactive lab
  function mount(root, cfg, api) {
    const w = (en, hi) => esc(api.t(T(en, hi)));
    const tp = (en, hi) => api.t(T(en, hi));
    let base = analyse(cfg).m;
    const kind = base.kind;
    const isAPGP = kind === 'ap' || kind === 'gp';
    const isFig = kind === 'figurate';
    const isSeq = kind === 'shapes' || kind === 'colours';
    const P = isAPGP ? { a: cfg.seed[0], x: cfg.seed[1], n: base.show } : null;
    let m = base;
    const S = { count: base.show, sel: null, found: false, wrong: 0, fb: null, sum: false, newIdx: -1, ruleWrong: new Set(), ruleOpts: null, ruleMsg: null, hint: false };
    let timers = [];
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); };
    const sub = (s) => `<sub>${esc(s)}</sub>`;

    const titleOf = () => {
      if (kind === 'shapes') return T('Shape pattern', 'आकारों का पैटर्न');
      if (kind === 'colours') return T('Colour pattern', 'रंगों का पैटर्न');
      if (kind === 'ap') return T('Arithmetic progression (AP)', 'समांतर श्रेढ़ी (AP)');
      if (kind === 'gp') return T('Geometric progression (GP)', 'गुणोत्तर श्रेढ़ी (GP)');
      if (isFig) return FAMS[m.fam].n;
      return T('Number pattern', 'संख्याओं का पैटर्न');
    };
    const promptOf = () => {
      if (isSeq) return T('Look at the pattern. What comes next? Which part repeats?', 'पैटर्न को देखो। आगे क्या आएगा? कौन-सा भाग दोहराता है?');
      if (kind === 'numbers') return T('Look at the numbers. How does each one change? What comes next?', 'संख्याओं को देखो। हर संख्या कैसे बदलती है? आगे क्या आएगा?');
      if (kind === 'ap') return T('Move the sliders to build your own AP. Every term is the one before plus d.', 'स्लाइडर चलाकर अपनी AP बनाओ। हर पद = पिछला पद + d।');
      if (kind === 'gp') return T('Move the sliders to build your own GP. Every term is the one before times r.', 'स्लाइडर चलाकर अपनी GP बनाओ। हर पद = पिछला पद × r।');
      return m.fam === 'cubic' ? T('Count the small cubes. See how each cube grows from the one before.', 'छोटे घन गिनो। देखो हर घन पिछले से कैसे बढ़ता है।') : T('Count the dots. See how each figure grows from the one before.', 'बिंदुओं को गिनो। देखो हर आकृति पिछली से कैसे बढ़ती है।');
    };

    root.innerHTML = `<div class="pt">
      <div class="pt-head"><h2 class="pt-title"></h2><p class="pt-prompt"></p></div>
      <div class="pt-board">
        <div class="pt-tiles" role="list"></div>
        <p class="pt-note" hidden></p>
        <div class="pt-stage" hidden></div>
        <div class="pt-chart" hidden></div>
      </div>
      <div class="pt-ctl"></div>
      <div class="pt-info" aria-live="polite"></div>
      <div class="pt-cards"><section class="pt-card pt-quiz"></section><section class="pt-card pt-rule"></section></div>
      <section class="pt-card pt-math" hidden></section>
    </div>`;
    const q = (s) => root.querySelector(s);
    const tilesEl = q('.pt-tiles'), noteEl = q('.pt-note'), stageEl = q('.pt-stage'), chartEl = q('.pt-chart'), ctlEl = q('.pt-ctl');
    const infoEl = q('.pt-info'), quizEl = q('.pt-quiz'), ruleEl = q('.pt-rule'), mathEl = q('.pt-math');

    // ---- controls (built once; sliders are updated in place so dragging is smooth)
    function buildControls() {
      let h = '';
      const slider = (k, label, min, max, step, val, extra) => `<div class="pt-sl"><label for="pt-s-${k}">${label}</label><input id="pt-s-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-key="slider:${k}" ${extra || ''}><output for="pt-s-${k}" data-out="${k}"></output></div>`;
      if (isAPGP) {
        h += slider('a', w('First term a', 'पहला पद a'), -50, 50, 1, P.a);
        if (kind === 'ap') h += slider('d', w('Common difference d', 'सार्वान्तर d'), -20, 20, 1, P.x);
        else h += slider('r', w('Common ratio r', 'सार्व अनुपात r'), 0, GP_R.length - 1, 1, GP_R.findIndex((g) => req(g, parseR(P.x))));
        h += slider('n', w('Number of terms n', 'पदों की संख्या n'), 3, 12, 1, S.count);
      } else if (isFig) h += slider('n', w('Number of figures n', 'आकृतियों की संख्या n'), 3, m.maxT, 1, S.count);
      h += `<button type="button" class="pt-next" data-key="next"><span aria-hidden="true">＋</span> <span>${w('Show the next one', 'अगला दिखाओ')}</span></button>`;
      ctlEl.innerHTML = h;
      syncControls();
    }
    function syncControls() {
      const set = (k, v, out) => { const el = ctlEl.querySelector(`[data-key="slider:${k}"]`); if (el && el !== root.ownerDocument.activeElement) el.value = v; const o = ctlEl.querySelector(`[data-out="${k}"]`); if (o) o.textContent = out; };
      if (isAPGP) {
        set('a', P.a, String(P.a));
        if (kind === 'ap') set('d', P.x, String(P.x)); else set('r', GP_R.findIndex((g) => req(g, parseR(P.x))), fmt(parseR(P.x)));
        set('n', S.count, String(S.count));
      } else if (isFig) set('n', S.count, String(S.count));
      const nx = ctlEl.querySelector('[data-key="next"]');
      if (nx) nx.disabled = S.count >= m.maxT;
    }

    // ---- drawing
    function tileHTML(i) {
      const sel = S.sel === i ? ' sel' : '';
      const nw = S.newIdx === i ? ' pt-new' : '';
      if (i === S.count) {
        return `<button type="button" role="listitem" class="pt-tile q${sel}" data-key="tile:${i}" data-i="${i}" aria-label="${esc(tp(`Term ${i + 1}: missing, what comes here?`, `पद ${i + 1}: ख़ाली, यहाँ क्या आएगा?`))}"><span class="ix">${i + 1}</span><span class="val">?</span></button>`;
      }
      if (isSeq) {
        const it = m.items[i], nm = itemName(kind, it);
        const un = S.found && i < m.unit.length ? ' unit' : '';
        return `<button type="button" role="listitem" class="pt-tile${sel}${nw}${un}" data-key="tile:${i}" data-i="${i}" aria-label="${esc(tp(`Term ${i + 1}: `, `पद ${i + 1}: `) + api.t(nm))}"><span class="ix">${i + 1}</span>${glyph(kind, it, 44)}<span class="nm">${esc(api.t(nm))}</span></button>`;
      }
      let pair = '';
      if (S.sum && m.sumable === 'ap') {
        const half = Math.floor(S.count / 2);
        if (i < half || i >= S.count - half) pair = ` pair" style="--pc:${LAYER_COL[Math.min(i, S.count - 1 - i) % LAYER_COL.length]}`;
        else pair = ' mid';
      }
      if (isFig) {
        return `<button type="button" role="listitem" class="pt-tile fig${sel}${nw}${pair}" data-key="tile:${i}" data-i="${i}" aria-label="${esc(m.fam === 'cubic' ? tp(`Cube ${i + 1}: ${fmt(m.vals[i])} small cubes`, `घन ${i + 1}: ${fmt(m.vals[i])} छोटे घन`) : tp(`Figure ${i + 1}: ${fmt(m.vals[i])} dots`, `आकृति ${i + 1}: ${fmt(m.vals[i])} बिंदु`))}"><span class="ix">${i + 1}</span>${figSVG(m.fam, i + 1, m.maxT === 8 ? Math.max(S.count, 4) : Math.max(S.count, 3), 64, false)}<span class="val long">${fmt(m.vals[i])}</span></button>`;
      }
      const txt = fmt(m.vals[i]);
      let chip = '';
      if (isAPGP || S.found) {
        if (i > 0) chip = m.rule.t === 'fib' ? (i > 1 ? `${fmt(m.vals[i - 2])}+${fmt(m.vals[i - 1])}` : '') : ruleChip(m.rule);
      }
      return `<button type="button" role="listitem" class="pt-tile${sel}${nw}${pair}" data-key="tile:${i}" data-i="${i}" aria-label="${esc(tp(`Term ${i + 1}: `, `पद ${i + 1}: `) + txt)}"><span class="ix">${i + 1}</span><span class="val${txt.length > 8 ? ' xl' : txt.length > 5 ? ' long' : ''}">${esc(txt)}</span>${chip ? `<span class="pt-chip">${esc(chip)}</span>` : ''}</button>`;
    }
    function drawTiles() {
      let h = '';
      for (let i = 0; i < S.count; i++) h += tileHTML(i);
      if (S.count < m.maxT) h += tileHTML(S.count);
      tilesEl.innerHTML = h;
      const unitNote = isSeq && S.found;
      noteEl.hidden = !unitNote;
      if (unitNote) noteEl.textContent = tp(`The green bar shows the part that repeats: ${m.unit.length} items.`, `हरी पट्टी वह भाग दिखाती है जो दोहराता है: ${m.unit.length} चीज़ें।`);
      S.newIdx = -1;
    }
    function drawStage() {
      stageEl.hidden = !isFig;
      if (!isFig) return;
      const i = S.sel != null && S.sel < S.count ? S.sel : S.count - 1;
      const F = FAMS[m.fam], cube = m.fam === 'cubic';
      const v = m.vals[i];
      const grow = i > 0 ? rsub(v, m.vals[i - 1]) : null;
      const nMax = m.maxT === 8 ? Math.max(S.count, 4) : Math.max(S.count, 3);
      stageEl.innerHTML = `${figSVG(m.fam, i + 1, nMax, 210, true)}<p><b>${esc(fmt(v))}</b><br>${esc(cube ? tp(`${F.one.en} number ${i + 1}: ${i + 1} × ${i + 1} × ${i + 1} small cubes = ${fmt(v)}.`, `${F.one.hi} संख्या ${i + 1}: ${i + 1} × ${i + 1} × ${i + 1} छोटे घन = ${fmt(v)}।`) : tp(`${F.one.en} number ${i + 1} uses ${fmt(v)} dots.`, `${F.one.hi} संख्या ${i + 1} में ${fmt(v)} बिंदु हैं।`))}${grow ? '<br>' + esc(cube ? tp(`${fmt(grow)} more small cubes than the figure before.`, `पिछली आकृति से ${fmt(grow)} छोटे घन ज़्यादा।`) : tp(`${fmt(grow)} new dots were added (the new colour).`, `${fmt(grow)} नए बिंदु जुड़े (नया रंग)।`)) : ''}</p>`;
    }
    function drawChart() {
      const show = kind === 'numbers' || isAPGP || isFig;
      chartEl.hidden = !show;
      if (!show) return;
      const vs = m.vals.slice(0, S.count).map(rnum);
      const W = 360, H = 150, l = 34, r = 10, t = 14, b = 22;
      let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
      if (hi === lo) hi = lo + 1;
      const X = (i) => l + ((i + 0.5) * (W - l - r)) / S.count, Y = (v) => t + ((hi - v) * (H - t - b)) / (hi - lo);
      const lab = (v) => { const a = Math.abs(v); return a >= 1e6 ? v.toExponential(1) : String(Math.round(v * 100) / 100); };
      let g = `<line x1="${l}" x2="${W - r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#94A3B8" stroke-width="1"/><line x1="${l}" x2="${l}" y1="${t - 6}" y2="${H - b}" stroke="#CBD5E1" stroke-width="1"/>`;
      g += `<text x="${l - 4}" y="${Y(hi) + 3}" text-anchor="end">${lab(hi)}</text>${lo < 0 ? `<text x="${l - 4}" y="${Y(lo) + 3}" text-anchor="end">${lab(lo)}</text>` : ''}<text x="${l - 4}" y="${Y(0) + 3}" text-anchor="end">0</text>`;
      g += `<polyline fill="none" stroke="#8B3DFF" stroke-width="2.2" stroke-linejoin="round" points="${vs.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')}"/>`;
      vs.forEach((v, i) => {
        g += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(0)}" y2="${Y(v)}" stroke="#C4A5FF" stroke-width="2" opacity=".6"/><circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${S.sel === i ? 6 : 4.2}" fill="${S.sel === i ? '#FF7A1A' : '#8B3DFF'}" stroke="#fff" stroke-width="1.5"/>`;
        if (S.count <= 12) g += `<text x="${X(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${i + 1}</text>`;
      });
      const desc = tp(`Graph of the terms: term number against value, from ${fmt(m.vals[0])} to ${fmt(m.vals[S.count - 1])}.`, `पदों का आलेख: पद संख्या के सामने मान, ${fmt(m.vals[0])} से ${fmt(m.vals[S.count - 1])} तक।`);
      chartEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">${g}</svg>`;
    }
    function drawInfo() {
      const i = S.sel;
      if (i == null) {
        infoEl.textContent = tp('Tap any tile to look closely at it.', 'किसी भी टाइल को छूकर ध्यान से देखो।');
        return;
      }
      if (i === S.count) { infoEl.textContent = tp(`This is place ${i + 1}. What should go here? Answer below.`, `यह जगह ${i + 1} है। यहाँ क्या आएगा? नीचे उत्तर दो।`); return; }
      infoEl.textContent = tileInfo(i);
    }
    function tileInfo(i) {
      const n = i + 1;
      if (isSeq) {
        const nm = api.t(itemName(kind, m.items[i]));
        let s = tp(`Term ${n} is ${nm}.`, `पद ${n}: ${nm}।`);
        if (S.found) s += ' ' + tp(`It is number ${(i % m.unit.length) + 1} in the repeating part.`, `यह दोहराने वाले भाग में ${(i % m.unit.length) + 1} नंबर पर है।`);
        return s;
      }
      const v = m.vals[i];
      if (isFig) {
        const F = FAMS[m.fam];
        return tp(`${F.one.en} number ${n} is ${fmt(v)}. Formula: ${F.form.replace(/n/g, n)} = ${fmt(v)}.`, `${F.one.hi} संख्या ${n} = ${fmt(v)}। सूत्र: ${F.form.replace(/n/g, n)} = ${fmt(v)}।`);
      }
      if (isAPGP && i > 0) {
        if (kind === 'ap') {
          const d = m.rule.k;
          return tp(`Term ${n} = a + (n − 1)d = ${fmt(m.vals[0])} + ${n - 1} × ${paren(d)} = ${fmt(v)}`, `पद ${n} = a + (n − 1)d = ${fmt(m.vals[0])} + ${n - 1} × ${paren(d)} = ${fmt(v)}`);
        }
        const r = m.rule.k;
        return tp(`Term ${n} = a × r^(n−1) = ${fmt(m.vals[0])} × ${paren(r)}^${n - 1} = ${fmt(v)}`, `पद ${n} = a × r^(n−1) = ${fmt(m.vals[0])} × ${paren(r)}^${n - 1} = ${fmt(v)}`);
      }
      if (i === 0) return tp(`Term 1 is ${fmt(v)}. Every other term comes from this start.`, `पद 1 = ${fmt(v)}। बाक़ी सब पद इसी से बनते हैं।`);
      const prev = m.vals[i - 1];
      const diff = rsub(v, prev);
      let s = tp(`Term ${n} is ${fmt(v)}. Difference from the term before: ${rsgn(diff) >= 0 ? '+' : ''}${fmt(diff)}.`, `पद ${n} = ${fmt(v)}। पिछले पद से अंतर: ${rsgn(diff) >= 0 ? '+' : ''}${fmt(diff)}।`);
      if (rsgn(prev) !== 0) s += ' ' + tp(`Ratio: ${fmt(rdiv(v, prev))}.`, `अनुपात: ${fmt(rdiv(v, prev))}।`);
      return s;
    }

    function questionText() {
      if (isSeq) return T('What comes next?', 'आगे क्या आएगा?');
      if (isFig) return m.fam === 'cubic' ? T('How many small cubes will the next cube have?', 'अगले घन में कितने छोटे घन होंगे?') : T('How many dots will the next figure have?', 'अगली आकृति में कितने बिंदु होंगे?');
      return T(`What is term ${S.count + 1}?`, `पद ${S.count + 1} क्या होगा?`);
    }
    function drawQuiz() {
      if (S.count >= m.maxT) {
        quizEl.innerHTML = `<h3><i>1</i>${w('All terms are shown', 'सारे पद दिख गए')}</h3><p>${w('Lovely! Now find the rule on the right.', 'वाह! अब दाईं ओर नियम खोजो।')}</p>`;
        return;
      }
      const qt = questionText();
      let body;
      if (isSeq) {
        const distinct = [...new Set(m.unit)];
        const all = kind === 'colours' ? Object.keys(COLOURS) : Object.keys(SHAPES);
        const pal = distinct.slice();
        if (kind === 'colours') all.forEach((k) => { if (pal.length < 4 && !pal.includes(k)) pal.push(k); });
        else { const used = new Set(distinct.map((x) => x.split(':')[0])); const dc = distinct[0].includes(':') ? ':' + distinct[0].split(':')[1] : ''; all.forEach((k) => { if (pal.length < 4 && !used.has(k)) pal.push(k + dc); }); }
        const ordered = pal.map((it) => [hash(it + distinct.join()), it]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        body = `<p>${w('Tap the one that belongs in the ? place.', '? की जगह जो आएगा उसे छुओ।')}</p><div class="pt-pal" role="group" aria-label="${w('Choices', 'विकल्प')}">${ordered.map((it) => `<button type="button" class="pt-opt" data-key="answer" data-item="${esc(it)}" aria-label="${esc(api.t(itemName(kind, it)))}">${glyph(kind, it, 40)}</button>`).join('')}</div>`;
      } else {
        body = `<p>${w('Work it out, then type your answer.', 'सोचो, फिर अपना उत्तर लिखो।')}</p><div class="pt-row"><input class="pt-in" type="text" inputmode="decimal" autocomplete="off" data-key="answer" aria-label="${w('Your answer', 'तुम्हारा उत्तर')}" placeholder="?"><button type="button" class="pt-go" data-key="answer" data-act="check">${w('Check', 'जाँचो')}</button></div>`;
      }
      quizEl.innerHTML = `<h3><i>1</i>${esc(api.t(qt))}</h3>${body}<p class="pt-fb ${S.fb ? S.fb.cls : ''}" aria-live="polite">${S.fb ? esc(S.fb.text) : ''}</p>`;
    }
    function drawRule() {
      const o = S.ruleOpts;
      const head = `<h3><i>2</i>${w('Which rule makes this pattern?', 'यह पैटर्न किस नियम से बना है?')}</h3>`;
      const items = o.map((x, i) => {
        const cls = S.found && x.ok ? ' good' : S.ruleWrong.has(i) ? ' bad' : '';
        let inner, label;
        if (isSeq) {
          label = x.unit.map((it) => api.t(itemName(kind, it))).join(', ') + tp(', then it repeats', ', फिर दोहराता है');
          inner = `<span class="pt-unitrow">${x.unit.map((it) => glyph(kind, it, 30)).join('')}</span><span aria-hidden="true">↻</span>`;
        } else if (isFig) { label = api.t(FAMS[x.fam].n); inner = `<span>${esc(label)}</span>`; }
        else { label = api.t(x.label); inner = `<span>${esc(label)}</span>`; }
        return `<button type="button" class="pt-opt${cls}" data-key="rule" data-i="${i}" ${S.found ? 'disabled' : ''} aria-label="${esc(label)}">${inner}</button>`;
      }).join('');
      let foot = '';
      if (S.found) foot = `<p class="pt-fb good" aria-live="polite">${esc(ruleExplain())}</p>`;
      else if (S.ruleMsg) foot = `<p class="pt-fb bad" aria-live="polite">${esc(S.ruleMsg)}</p>`;
      else foot = '<p class="pt-fb" aria-live="polite"></p>';
      ruleEl.innerHTML = head + `<div class="${isSeq ? 'pt-pal' : 'pt-opts'}" role="group">${items}</div>` + foot;
    }
    function ruleExplain() {
      if (isSeq) return tp(`Yes! The part of ${m.unit.length} repeats again and again.`, `हाँ! ${m.unit.length} चीज़ों वाला भाग बार-बार दोहराता है।`);
      if (isFig) { const F = FAMS[m.fam]; return tp(`Yes! These are ${F.n.en.toLowerCase()}. Formula: ${F.form}.`, `हाँ! ये ${F.n.hi} हैं। सूत्र: ${F.form}।`); }
      return tp(`Yes! ${ruleLabel(m.rule).en}.`, `हाँ! ${ruleLabel(m.rule).hi}।`);
    }
    function drawMath() {
      const show = isAPGP || (kind === 'numbers' && m.sumable) || isFig;
      const gated = kind === 'numbers' && !S.found;
      mathEl.hidden = !show || gated;
      if (mathEl.hidden) return;
      let h = `<h3>${w('The rule in symbols', 'नियम सूत्र के रूप में')}</h3>`;
      if (isFig) {
        const F = FAMS[m.fam];
        h += `<div class="pt-eq">${esc(tp('The n-th number', 'n-वीं संख्या'))} = ${esc(F.form)}</div><p>${w('Put n = 1, 2, 3 … in the formula to get each number.', 'सूत्र में n = 1, 2, 3 … रखकर हर संख्या पाओ।')}</p>`;
        mathEl.innerHTML = h;
        return;
      }
      if (m.rule.t === 'add') h += `<div class="pt-eq">a${sub('n')} = a + (n − 1)d = ${fmt(m.vals[0])} + (n − 1) × ${esc(paren(m.rule.k))}</div>`;
      else if (m.rule.t === 'mul') h += `<div class="pt-eq">a${sub('n')} = a × r<sup>n−1</sup> = ${fmt(m.vals[0])} × ${esc(paren(m.rule.k))}<sup>n−1</sup></div>`;
      else if (m.rule.t === 'lin') h += `<div class="pt-eq">a${sub('n+1')} = ${esc(fmt(m.rule.m))} × a${sub('n')} ${rsgn(m.rule.c) >= 0 ? '+' : '−'} ${esc(fmt(rabs(m.rule.c)))}</div>`;
      if (m.sumable) {
        if (!S.sum) h += `<button type="button" class="pt-sumbtn" data-key="sum">${w('Add up the first terms', 'पहले पदों का योग निकालो')} (n = ${S.count})</button>`;
        else h += sumHTML(sumInfo(m, S.count));
      }
      mathEl.innerHTML = h;
    }
    function sumHTML(s) {
      const n = s.n;
      let lines, extra = '';
      if (s.type === 'ap') {
        lines = `<div class="pt-eq">S${sub(String(n))} = n/2 × (2a + (n − 1)d)</div><div class="pt-eq">= ${n}/2 × (2 × ${esc(paren(s.a))} + ${n - 1} × ${esc(paren(s.d))})</div>`;
        const half = Math.floor(n / 2);
        extra = `<p>${esc(tp(`Pair the first with the last: each pair adds up to ${fmt(s.pair)}. There ${half === 1 ? 'is 1 pair' : 'are ' + half + ' pairs'}${n % 2 ? ' and the middle term stands alone' : ''}.`, `पहले को आख़िरी से जोड़ी बनाओ: हर जोड़ी का योग ${fmt(s.pair)} है। ${half} जोड़ियाँ हैं${n % 2 ? ' और बीच का पद अकेला है' : ''}।`))}</p>`;
      } else if (req(s.r, ONE)) lines = `<div class="pt-eq">S${sub(String(n))} = n × a = ${n} × ${esc(paren(s.a))}</div>`;
      else {
        lines = `<div class="pt-eq">S${sub(String(n))} = a(r<sup>n</sup> − 1)/(r − 1)</div><div class="pt-eq">= ${esc(paren(s.a))} × (${esc(paren(s.r))}<sup>${n}</sup> − 1)/(${esc(paren(s.r))} − 1)</div>`;
        if (s.inf) extra = `<p>${esc(tp(`Because r is between −1 and 1, if we went on for ever the sum would get closer and closer to a/(1 − r) = ${fmt(s.inf)}.`, `r, −1 और 1 के बीच है, इसलिए अनंत पदों तक जाने पर योग a/(1 − r) = ${fmt(s.inf)} के क़रीब पहुँचता है।`))}</p>`;
      }
      return `<div class="pt-sum" aria-live="polite">${lines}<div class="big">S${sub(String(n))} = ${esc(fmt(s.formula))}</div><p>${esc(tp(`Adding the ${n} terms one by one also gives ${fmt(s.direct)}.`, `${n} पदों को एक-एक करके जोड़ने पर भी ${fmt(s.direct)} मिलता है।`))}</p>${extra}</div>`;
    }
    function refreshRuleOpts() {
      if (isSeq) S.ruleOpts = unitRuleOptions(m);
      else if (isFig) S.ruleOpts = famRuleOptions(m);
      else S.ruleOpts = numRuleOptions(Object.assign({}, m, { show: Math.max(3, Math.min(S.count, m.vals.length)) }));
      S.ruleWrong = new Set();
      S.ruleMsg = null;
    }
    function drawAll() {
      q('.pt-title').textContent = api.t(titleOf());
      q('.pt-prompt').textContent = api.t(promptOf());
      drawTiles(); drawStage(); drawChart(); drawInfo(); drawQuiz(); drawRule(); drawMath(); syncControls();
    }

    // ---- behaviour
    function extend(how) {
      if (S.count >= m.maxT) { api.toast(T('That is plenty of terms!', 'इतने पद काफ़ी हैं!')); return false; }
      S.count++;
      S.newIdx = S.count - 1;
      S.wrong = 0; S.hint = false;
      if (isAPGP) P.n = S.count;
      api.record(tp(`Showed term ${S.count}`, `पद ${S.count} दिखाया`));
      api.emit('extended');
      return true;
    }
    function rebuildAPGP() {
      const seed = [P.a, kind === 'ap' ? P.x : P.x];
      const res = analyse({ kind, seed, show: S.count });
      if (res.m) m = res.m;
    }
    function submit(raw) {
      if (S.count >= m.maxT) return;
      let ok;
      if (isSeq) ok = raw === m.items[S.count];
      else {
        const v = parseR(String(raw).replace(/,/g, '.').replace(/\s+/g, ''));
        if (!v) { S.fb = { cls: 'bad', text: tp('Type a number, like 12 or −3 or 2.5.', 'कोई संख्या लिखो, जैसे 12 या −3 या 2.5।') }; drawQuiz(); const inp = q('.pt-in'); if (inp) { inp.value = raw; inp.focus(); } return; }
        ok = req(v, m.vals[S.count]);
      }
      if (ok) {
        const said = isSeq ? api.t(itemName(kind, m.items[S.count])) : fmt(m.vals[S.count]);
        api.record(tp(`Answered right: ${said}`, `सही उत्तर: ${said}`));
        api.emit('answered:right');
        extend('answer');
        S.fb = { cls: 'good', text: tp(`Yes! ${said}. Well done! What comes next now?`, `हाँ! ${said}। शाबाश! अब आगे क्या आएगा?`) };
        if (isSeq) api.speak(tp('Right!', 'सही!'));
        drawAll();
        const inp = q('.pt-in'); if (inp) inp.focus();
      } else {
        S.wrong++;
        api.record(tp('Answered wrong', 'ग़लत उत्तर दिया'));
        api.emit('answered:wrong');
        let text;
        if (isSeq) {
          text = S.wrong === 1 ? tp('Not quite. Look carefully: what repeats?', 'अभी नहीं। ध्यान से देखो: क्या दोहराता है?') : tp('Look at the first tiles again. The same group comes back.', 'पहली टाइलें फिर से देखो। वही समूह लौटकर आता है।');
          if (S.wrong >= 2) S.hint = true;
        } else if (S.wrong === 1) text = tp('Not quite. Look at how each number changes to the next one.', 'अभी नहीं। देखो हर संख्या अगली में कैसे बदलती है।');
        else {
          const g = m.vals.slice(0, S.count);
          const gaps = g.slice(1).map((x, i) => rsub(x, g[i])).slice(-4).map((x) => (rsgn(x) >= 0 ? '+' : '') + fmt(x)).join(', ');
          text = tp(`Hint: the gaps between neighbours are ${gaps}. ${isFig ? 'How do the gaps change?' : 'Is there a rule?'}`, `संकेत: पास-पास की संख्याओं का अंतर ${gaps} है। ${isFig ? 'अंतर कैसे बदलते हैं?' : 'क्या कोई नियम है?'}`);
        }
        S.fb = { cls: 'bad', text };
        drawQuiz();
        quizEl.classList.remove('pt-shake'); void quizEl.offsetWidth; quizEl.classList.add('pt-shake');
        if (isSeq) {
          const mark = [...quizEl.querySelectorAll('.pt-opt')].find((b) => b.dataset.item === raw);
          if (mark) mark.classList.add('bad');
          if (S.hint) { S.found = S.found; tilesEl.querySelectorAll('.pt-tile').forEach((t, i) => { if (i < m.unit.length) t.classList.add('unit'); }); }
        } else { const inp = q('.pt-in'); if (inp) { inp.value = raw; inp.focus(); inp.select(); } }
      }
    }
    function chooseRule(i) {
      if (S.found) return;
      const o = S.ruleOpts[i];
      if (!o) return;
      if (o.ok) {
        S.found = true;
        api.record(tp('Found the rule', 'नियम खोज लिया'));
        api.emit('rule-found');
        api.celebrate();
      } else {
        S.ruleWrong.add(i);
        S.ruleMsg = isSeq ? tp('Not that one. Does it match the tiles from the start?', 'यह नहीं। क्या यह शुरू की टाइलों से मेल खाता है?') : tp('Not that one. Try it on the first two or three terms.', 'यह नहीं। इसे पहले दो-तीन पदों पर आज़माओ।');
        api.record(tp('Tried a wrong rule', 'ग़लत नियम आज़माया'));
      }
      drawAll();
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled || el.tagName === 'INPUT' && el.type === 'range') return;
      const key = el.dataset.key;
      if (el.tagName === 'INPUT' && el.type === 'text') return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('tile:')) {
        const i = +el.dataset.i;
        S.sel = S.sel === i ? null : i;
        drawTiles(); drawInfo(); drawStage(); drawChart();
        const again = tilesEl.querySelector(`[data-i="${i}"]`); if (again) again.focus();
        if (S.sel != null && S.sel < S.count) {
          if (isSeq) api.speak(api.t(itemName(kind, m.items[i]))); else api.speak(fmt(m.vals[i]));
        }
      } else if (key === 'next') {
        if (extend('next')) { S.fb = null; drawAll(); }
      } else if (key === 'answer') {
        if (isSeq) submit(el.dataset.item);
        else { const inp = q('.pt-in'); submit(inp ? inp.value : ''); }
      } else if (key === 'rule') chooseRule(+el.dataset.i);
      else if (key === 'sum') {
        S.sum = true;
        api.record(tp(`Added the first ${S.count} terms`, `पहले ${S.count} पदों का योग निकाला`));
        api.emit('sum');
        drawTiles(); drawMath();
      }
    }
    function onKey(e) {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.pt-in')) {
        e.preventDefault();
        if (!api.allowed('answer')) { api.nudge('answer'); return; }
        submit(e.target.value);
      }
    }
    function onInput(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type=range]')) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); syncControls(); const k = key.slice(7); el.value = k === 'n' ? S.count : k === 'a' ? P.a : k === 'd' ? P.x : GP_R.findIndex((g) => req(g, parseR(P.x))); return; }
      const k = key.slice(7);
      let v = +el.value;
      if (kind === 'gp' && k === 'a' && v === 0) { v = P.a > 0 ? -1 : 1; el.value = v; }
      const before = S.count;
      if (isFig) { S.count = Math.max(3, Math.min(m.maxT, v)); if (S.sel != null && S.sel >= S.count) S.sel = null; }
      else if (k === 'n') { S.count = v; P.n = v; if (S.sel != null && S.sel > S.count) S.sel = null; }
      else {
        if (k === 'a') P.a = v; else if (k === 'd') P.x = v; else P.x = rnum(GP_R[v]);
        S.found = false; S.sum = false; S.fb = null; S.wrong = 0;
        rebuildAPGP(); refreshRuleOpts();
      }
      if (k === 'n') { S.fb = null; S.wrong = 0; if (S.count > before) { S.newIdx = S.count - 1; api.emit('extended'); } }
      drawTiles(); drawStage(); drawChart(); drawInfo(); drawQuiz(); drawRule(); drawMath();
      const o = ctlEl.querySelector(`[data-out="${k}"]`);
      if (o) o.textContent = k === 'r' ? fmt(GP_R[v]) : String(v);
      const nx = ctlEl.querySelector('[data-key="next"]'); if (nx) nx.disabled = S.count >= m.maxT;
      if (k === 'n' && S.count !== before) api.record(tp(`Set n to ${S.count}`, `n को ${S.count} किया`));
    }

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('input', onInput);
    buildControls();
    refreshRuleOpts();
    if (isFig) S.sel = null;
    drawAll();
    return {
      destroy() {
        timers.forEach(clearTimeout);
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('input', onInput);
      },
    };
  }

  NCA_T.register({
    id: 'pattern',
    css: CSS,
    validate,
    keys,
    demo: { kind: 'ap', seed: [5, 3], show: 6 },
    model: { analyse, parseR, parseRule, fmt, genTerms, inferRule, figPoints, sumInfo, FAMS, numRuleOptions, unitRuleOptions, famRuleOptions, R },
    mount,
  });
})();
