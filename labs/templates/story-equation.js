// Template: Story to equation. A word problem is turned into an equation by trying it. The child slides the unknown x
// and watches the story's quantities change (a rectangle's sides and area, or the two journey times), sees how close the
// result is to what the story says, then writes the equation step by step in standard form ax² + bx + c = 0 (a, b, c are
// computed exactly) and, if the lab allows, finds every root with the quadratic formula and sees which roots the story
// accepts and which it must reject (a length cannot be negative), or that no real root means the story is impossible.
// Two families of stories are modelled honestly:
//   product:  (p0 + p1·x) × (q0 + q1·x) = target   (areas, consecutive numbers, ages, marbles, costs, sums and products)
//   journey:  distance/(x − slower) − distance/x = extra   (x is the usual speed; a slower trip takes more time)
// Config:
//   { situations: [ { id, kind: 'product'|'journey', title: T, story: T, unknown: T (what x is, with unit),
//       product: p: [p0, p1], q: [q0, q1], pName: T, qName: T, result: T (what p × q is called), target: number,
//       journey: distance: number, slower: number, extra: number, resultName?: T,
//       min: int, max: int (the slider range, whole numbers, at most 120 values),
//       solve?: boolean (show "find all roots"), unit?: string } ] }   (1–6 situations; T = { en, hi })
(function () {
  const { esc } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const isInt = (n) => Number.isInteger(n);
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
  const gcdL = (l) => l.reduce(gcd, 0);

  // ---------------------------------------------------------------- exact algebra (whole numbers only)
  // The standard form of the situation: [a, b, c] for a x² + b x + c = 0, a > 0, divided by the common factor.
  function rawQuad(s) {
    if (s.kind === 'product') {
      const [p0, p1] = s.p, [q0, q1] = s.q;
      return [p1 * q1, p0 * q1 + p1 * q0, p0 * q0 - s.target];
    }
    // D x − D (x − s) = h x (x − s)  →  h x² − h s x − D s = 0
    const { distance: D, slower: sl, extra: h } = s;
    return [h, -h * sl, -D * sl];
  }
  function tidy(abc) {
    let [a, b, c] = abc;
    const g = gcdL([a, b, c]) || 1;
    a /= g; b /= g; c /= g;
    if (a < 0) { a = -a; b = -b; c = -c; }
    return [a, b, c];
  }
  function polyStr(a, b, c) {
    const part = (k, sym, first) => {
      if (k === 0) return '';
      const sign = k < 0 ? '−' : '+';
      const m = Math.abs(k);
      const body = sym ? (m === 1 ? sym : m + sym) : String(m);
      return first ? (k < 0 ? '−' : '') + body : ' ' + sign + ' ' + body;
    };
    let out = '', first = true;
    [[a, 'x²'], [b, 'x'], [c, '']].forEach(([k, sym]) => { const t = part(k, sym, first); if (t) { out += t; first = false; } });
    return out || '0';
  }
  // linear expression in x as text, e.g. [1,2] → "2x + 1", [40,-1] → "40 − x"
  function linStr(l) {
    const [k0, k1] = l;
    if (k1 === 0) return String(k0);
    const xs = (k1 === 1 ? '' : k1 === -1 ? '−' : String(k1).replace('-', '−')) + 'x';
    if (k0 === 0) return xs;
    const z = String(k0).replace('-', '−');
    if (k1 < 0 && Math.abs(k1) === 1) return z + ' − x';
    return k1 < 0 ? `${z} − ${Math.abs(k1)}x` : k0 < 0 ? `${xs} − ${Math.abs(k0)}` : `${xs} + ${k0}`;
  }
  const bracket = (l) => (l[0] === 0 || l[1] === 0 ? linStr(l) : '(' + linStr(l) + ')');
  const fmt = (n) => { const r = Math.round(n * 100) / 100; return String(r).replace('-', '−'); };
  function rootsOf([a, b, c]) {
    const D = b * b - 4 * a * c;
    if (D < 0) return { D, roots: [] };
    const sq = Math.sqrt(D);
    const exact = Number.isInteger(sq);
    const r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
    return { D, exact, roots: D === 0 ? [r2] : [r1, r2] };
  }
  const valueOf = (s, x) => (s.kind === 'product' ? (s.p[0] + s.p[1] * x) * (s.q[0] + s.q[1] * x) : s.distance / (x - s.slower) - s.distance / x);
  const targetOf = (s) => (s.kind === 'product' ? s.target : s.extra);
  // Why a value of x is not allowed in the story, or '' when it is.
  function whyNot(s, x) {
    if (x <= 0) return 'x';
    if (s.kind === 'product') {
      if (s.p[0] + s.p[1] * x <= 0) return 'p';
      if (s.q[0] + s.q[1] * x <= 0) return 'q';
    } else if (x <= s.slower) return 'p';
    return '';
  }

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { situations }'];
    Object.keys(c).forEach((k) => { if (k !== 'situations') e.push('unknown key: ' + k + ' (use situations)'); });
    if (!Array.isArray(c.situations) || c.situations.length < 1 || c.situations.length > 6) return e.concat('situations: an array of 1 to 6');
    const ids = new Set();
    c.situations.forEach((s, i) => {
      const w = 'situations[' + i + ']';
      if (!s || typeof s !== 'object') { e.push(w + ': an object'); return; }
      const allowed = ['id', 'kind', 'title', 'story', 'unknown', 'p', 'q', 'pName', 'qName', 'result', 'target', 'distance', 'slower', 'extra', 'resultName', 'min', 'max', 'solve', 'unit'];
      Object.keys(s).forEach((k) => { if (!allowed.includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof s.id !== 'string' || !ID.test(s.id)) e.push(w + ': id must be letters, digits, - or _'); else if (ids.has(s.id)) e.push(w + ': duplicate id'); else ids.add(s.id);
      ['title', 'story', 'unknown'].forEach((k) => { if (!isBi(s[k])) e.push(w + '.' + k + ': needs en and hi'); });
      if (!isInt(s.min) || !isInt(s.max) || s.min >= s.max || s.max - s.min > 120) e.push(w + ': min and max must be whole numbers, min < max, at most 120 apart');
      if (s.kind === 'product') {
        ['p', 'q'].forEach((k) => { if (!Array.isArray(s[k]) || s[k].length !== 2 || !s[k].every(isInt)) e.push(w + '.' + k + ': [constant, coefficient of x] whole numbers'); });
        ['pName', 'qName', 'result'].forEach((k) => { if (!isBi(s[k])) e.push(w + '.' + k + ': needs en and hi'); });
        if (!isInt(s.target) || s.target < 1) e.push(w + '.target: a positive whole number');
        if (Array.isArray(s.p) && Array.isArray(s.q) && s.p.every(isInt) && s.q.every(isInt)) {
          if (s.p[1] * s.q[1] === 0) e.push(w + ': both factors must contain x, or the equation is not quadratic');
        }
      } else if (s.kind === 'journey') {
        ['distance', 'slower', 'extra'].forEach((k) => { if (!isInt(s[k]) || s[k] < 1) e.push(w + '.' + k + ': a positive whole number'); });
        if (isInt(s.slower) && isInt(s.min) && s.min <= s.slower) e.push(w + ': min must be more than slower (a speed cannot be zero or negative)');
        if (s.pName !== undefined || s.qName !== undefined) e.push(w + ': journey takes no pName/qName');
      } else e.push(w + ': kind must be product or journey');
      if (!e.length || e.every((m) => !m.startsWith(w))) {
        const [a, b, cc] = tidy(rawQuad(s));
        if (a === 0) e.push(w + ': the equation is not quadratic');
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(cc)) > 20000) e.push(w + ': numbers too big');
      }
    });
    return e;
  }

  function keys(c) {
    const ss = (c && Array.isArray(c.situations) ? c.situations : []).filter((s) => s && typeof s.id === 'string');
    return {
      targets: ['slider:x', 'equation', 'solve', 'reset'].concat(ss.map((s) => 'sit:' + s.id)),
      events: ['moved', 'hit', 'equation', 'solved', 'rejected', 'impossible', 'repeated'].concat(ss.map((s) => 'picked:' + s.id)),
    };
  }

  const css = `
.se-wrap { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.se-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.se-pick button { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 14px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.se-pick button[aria-pressed="true"] { background: var(--action, #E8702A); border-color: var(--action, #E8702A); color: var(--on-action, #1C1B1A); }
.se-story { font-weight: 600; padding: 10px 12px; border-radius: 12px; background: var(--sunk, #F4EFE7); line-height: 1.45; }
.se-svg { width: 100%; max-width: 420px; height: auto; align-self: center; }
.se-slide { display: flex; flex-direction: column; gap: 4px; }
.se-slide label { font-weight: 700; }
.se-slide input[type=range] { width: 100%; min-height: 44px; accent-color: var(--action, #E8702A); }
.se-read { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; font-variant-numeric: tabular-nums; }
.se-read span:nth-child(even) { font-weight: 800; text-align: right; }
.se-chip { font-weight: 800; padding: 8px 12px; border-radius: 12px; }
.se-chip.low, .se-chip.high { background: #FBF1D3; color: #7A4B00; }
.se-chip.hit { background: #E4F3EA; color: #0F766E; }
.se-chip.bad { background: #FBE6E3; color: #B42318; }
.se-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.se-btns button { min-height: 44px; border-radius: 12px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 16px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.se-btns button.pri { background: var(--action, #E8702A); border-color: var(--action, #E8702A); color: var(--on-action, #1C1B1A); }
.se-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.se-steps li { padding: 8px 12px; border-radius: 10px; background: var(--surface, #FFFDF9); border: 1.5px solid var(--line, #E7E1D6); font-weight: 700; font-size: 1.05rem; }
.se-steps li small { display: block; font-weight: 500; color: var(--ink-2, #4B5563); }
.se-steps li.last { border-color: #0F766E; background: #E4F3EA; }
.se-roots { display: flex; flex-direction: column; gap: 6px; }
.se-root { padding: 8px 12px; border-radius: 10px; font-weight: 700; }
.se-root.ok { background: #E4F3EA; color: #0F766E; }
.se-root.no { background: #FBE6E3; color: #B42318; }
@media (prefers-reduced-motion: reduce) { .se-wrap * { transition: none !important; animation: none !important; } }
`;

  function mount(root, config, api) {
    const T = (en, hi) => api.t({ en, hi });
    const sits = config.situations;
    let cur = sits[0];
    let x = cur.min;
    let showEq = false, showRoots = false, hitDone = false;
    let destroyed = false;

    function scene() {
      const W = 360, H = 200;
      const f = valueOf(cur, x), tgt = targetOf(cur);
      if (cur.kind === 'product') {
        const p = cur.p[0] + cur.p[1] * x, q = cur.q[0] + cur.q[1] * x;
        const pmax = Math.max(1, cur.p[0] + cur.p[1] * cur.max, cur.p[0] + cur.p[1] * cur.min, 1);
        const qmax = Math.max(1, cur.q[0] + cur.q[1] * cur.max, cur.q[0] + cur.q[1] * cur.min, 1);
        const bw = 200, bh = 125;
        const u = Math.min(bw / pmax, bh / qmax);
        const w = p > 0 ? Math.max(4, p * u) : 0, h = q > 0 ? Math.max(4, q * u) : 0;
        const ok = f === tgt;
        const col = ok ? '#0F766E' : f < tgt ? '#6D28D9' : '#E8702A';
        const base = 20 + bh;
        return `<svg class="se-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('A rectangle with sides ' + fmt(p) + ' and ' + fmt(q) + '. Its area is ' + fmt(p * q) + '.', 'एक आयत जिसकी भुजाएँ ' + fmt(p) + ' और ' + fmt(q) + ' हैं। उसका क्षेत्रफल ' + fmt(p * q) + ' है।'))}">
          <rect width="${W}" height="${H}" rx="14" fill="#FFFDF9" stroke="#E7E1D6"/>
          <line x1="30" y1="${base}" x2="${40 + bw + 6}" y2="${base}" stroke="#E7E1D6" stroke-width="2"/>
          <rect x="40" y="${base - h}" width="${w}" height="${h}" rx="3" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="3"/>
          <text x="40" y="${base + 20}" font-size="14" font-weight="700" fill="#4B5563">${esc(api.t(cur.pName))} = ${fmt(p)}</text>
          <text x="${W - 14}" y="30" font-size="14" font-weight="700" text-anchor="end" fill="#4B5563">${esc(api.t(cur.qName))} = ${fmt(q)}</text>
          <text x="${W - 14}" y="${H - 8}" font-size="14" font-weight="800" text-anchor="end" fill="${col}">${esc(api.t(cur.result))}: ${fmt(p * q)} / ${tgt}</text>
        </svg>`;
      }
      const tFast = cur.distance / x, tSlow = cur.distance / (x - cur.slower);
      const tref = cur.distance / Math.max(1, cur.min + 0.25 * (cur.max - cur.min) - cur.slower);
      const sc = 250 / Math.max(tref, 1);
      const wd = (t) => Math.max(2, Math.min(300, t * sc));
      const diff = tSlow - tFast, ok = Math.abs(diff - tgt) < 1e-9;
      const col = ok ? '#0F766E' : diff < tgt ? '#6D28D9' : '#E8702A';
      return `<svg class="se-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Two bars: the trip at ' + x + ' takes ' + fmt(tFast) + ' h, at ' + (x - cur.slower) + ' it takes ' + fmt(tSlow) + ' h.', 'दो पट्टियाँ: ' + x + ' की चाल से सफ़र में ' + fmt(tFast) + ' h लगते हैं, ' + (x - cur.slower) + ' की चाल से ' + fmt(tSlow) + ' h।'))}">
          <rect width="${W}" height="${H}" rx="14" fill="#FFFDF9" stroke="#E7E1D6"/>
          <text x="20" y="34" font-size="14" font-weight="700" fill="#4B5563">${esc(T('Usual speed ' + x + ': time', 'सामान्य चाल ' + x + ': समय'))}</text>
          <rect x="20" y="42" width="${wd(tFast)}" height="24" rx="5" fill="#0369A1" fill-opacity=".3" stroke="#0369A1" stroke-width="2.5"/>
          <text x="${Math.min(wd(tFast) + 28, 290)}" y="60" font-size="14" font-weight="800" fill="#1C1B1A">${fmt(tFast)} h</text>
          <text x="20" y="98" font-size="14" font-weight="700" fill="#4B5563">${esc(T('Slower speed ' + (x - cur.slower) + ': time', 'कम चाल ' + (x - cur.slower) + ': समय'))}</text>
          <rect x="20" y="106" width="${wd(tSlow)}" height="24" rx="5" fill="#E8702A" fill-opacity=".3" stroke="#E8702A" stroke-width="2.5"/>
          <rect x="${20 + wd(tFast)}" y="106" width="${Math.max(0, Math.min(wd(tSlow) - wd(tFast), 300))}" height="24" rx="5" fill="${col}" fill-opacity=".55"/>
          <text x="${Math.min(wd(tSlow) + 28, 290)}" y="124" font-size="14" font-weight="800" fill="#1C1B1A">${fmt(tSlow)} h</text>
          <text x="${W - 14}" y="${H - 14}" font-size="14" font-weight="800" text-anchor="end" fill="${col}">${esc(T('extra time', 'ज़्यादा समय'))}: ${fmt(diff)} h / ${tgt} h</text>
        </svg>`;
    }

    function readout() {
      const f = valueOf(cur, x), tgt = targetOf(cur);
      const ok = Math.abs(f - tgt) < 1e-9;
      let rows;
      if (cur.kind === 'product') {
        const p = cur.p[0] + cur.p[1] * x, q = cur.q[0] + cur.q[1] * x;
        rows = `<span>${esc(api.t(cur.pName))}</span><span>${fmt(p)}</span><span>${esc(api.t(cur.qName))}</span><span>${fmt(q)}</span><span>${esc(api.t(cur.result))}</span><span>${fmt(p * q)}</span><span>${esc(T('The story says', 'स्टोरी कहती है'))}</span><span>${tgt}</span>`;
      } else {
        rows = `<span>${esc(T('Time at speed x', 'चाल x पर समय'))}</span><span>${fmt(cur.distance / x)} h</span><span>${esc(T('Time at speed x − ' + cur.slower, 'चाल x − ' + cur.slower + ' पर समय'))}</span><span>${fmt(cur.distance / (x - cur.slower))} h</span><span>${esc(T('Extra time', 'ज़्यादा समय'))}</span><span>${fmt(f)} h</span><span>${esc(T('The story says', 'स्टोरी कहती है'))}</span><span>${tgt} h</span>`;
      }
      const cls = ok ? 'hit' : f < tgt ? 'low' : 'high';
      const msg = ok ? T('Exactly what the story says!', 'ठीक वही जो स्टोरी कहती है!') : f < tgt ? T('Too small. Try another x.', 'बहुत छोटा है। दूसरा x आज़माओ।') : T('Too big. Try another x.', 'बहुत बड़ा है। दूसरा x आज़माओ।');
      return `<div class="se-read">${rows}</div><div class="se-chip ${cls}" aria-live="polite">${esc(msg)}</div>`;
    }

    function eqPanel() {
      if (!showEq) return '';
      const abc = rawQuad(cur), std = tidy(abc);
      const items = [];
      if (cur.kind === 'product') {
        items.push([`${bracket(cur.p)} × ${bracket(cur.q)} = ${cur.target}`, T('the story in symbols', 'स्टोरी को सिंबल में लिखा')]);
        items.push([`${polyStr(abc[0], abc[1], abc[2] + cur.target)} = ${cur.target}`, T('multiply out the brackets', 'ब्रैकेट गुणा करके खोला')]);
        items.push([`${polyStr(abc[0], abc[1], abc[2])} = 0`, T('move everything to one side', 'सब कुछ एक तरफ़ ले आए')]);
      } else {
        items.push([`${cur.distance}/(x − ${cur.slower}) − ${cur.distance}/x = ${cur.extra}`, T('the story in symbols (time = distance ÷ speed)', 'स्टोरी सिंबल में (समय = दूरी ÷ चाल)')]);
        items.push([`${cur.distance}x − ${cur.distance}(x − ${cur.slower}) = ${cur.extra}x(x − ${cur.slower})`, T('multiply both sides by x(x − ' + cur.slower + ')', 'दोनों तरफ़ x(x − ' + cur.slower + ') से गुणा किया')]);
        items.push([`${polyStr(abc[0], abc[1], abc[2])} = 0`, T('multiply out and move to one side', 'गुणा करके सब एक तरफ़ लाए')]);
      }
      const changed = std[0] !== abc[0] || std[1] !== abc[1] || std[2] !== abc[2];
      if (changed) items.push([`${polyStr(std[0], std[1], std[2])} = 0`, T('make a positive and divide by the common factor', 'a को धन बनाया और उभयनिष्ठ गुणनखंड से भाग दिया')]);
      items.push([`a = ${std[0]},  b = ${fmt(std[1])},  c = ${fmt(std[2])}`, T('standard form  ax² + bx + c = 0', 'मानक रूप  ax² + bx + c = 0')]);
      return `<ol class="se-steps">${items.map((it, i) => `<li${i === items.length - 1 ? ' class="last"' : ''}>${esc(it[0])}<small>${esc(api.t(it[1]))}</small></li>`).join('')}</ol>`;
    }

    function rootPanel() {
      if (!showRoots) return '';
      const std = tidy(rawQuad(cur));
      const r = rootsOf(std);
      let h = `<div class="se-steps"><li>${esc('D = b² − 4ac = ' + fmt(std[1] * std[1]) + ' − 4(' + std[0] + ')(' + fmt(std[2]) + ') = ' + r.D)}</li></div>`;
      if (r.D < 0) return h + `<div class="se-root no">${esc(T('D is negative, so there is no real root: this story cannot happen.', 'D ऋणात्मक है, इसलिए कोई वास्तविक मूल नहीं है: यह स्टोरी हो ही नहीं सकती।'))}</div>`;
      if (r.D === 0) h += `<div class="se-root ok">${esc(T('D = 0: the two roots are equal.', 'D = 0: दोनों मूल बराबर हैं।'))}</div>`;
      h += '<div class="se-roots">' + r.roots.map((v) => {
        const why = whyNot(cur, v);
        if (!why) return `<div class="se-root ok">x = ${fmt(v)}: ${esc(T('fits the story, keep it', 'स्टोरी में फ़िट होता है, रखो'))}</div>`;
        const reason = why === 'x' ? T('x must be more than 0', 'x का मान 0 से ज़्यादा होना चाहिए') : T('a quantity in the story would be zero or negative', 'स्टोरी की कोई राशि 0 या ऋणात्मक हो जाएगी');
        return `<div class="se-root no">x = ${fmt(v)}: ${esc(T('reject it, ', 'इसे रद्द करो, '))}${esc(reason)}</div>`;
      }).join('') + '</div>';
      return h;
    }

    function render() {
      const keepFocus = root.contains(document.activeElement) && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-key') : null;
      root.innerHTML = `<div class="se-wrap">
        ${sits.length > 1 ? `<div class="se-pick" role="group" aria-label="${esc(T('Choose a story', 'स्टोरी चुनो'))}">${sits.map((s) => `<button type="button" data-key="sit:${s.id}" aria-pressed="${s.id === cur.id}">${esc(api.t(s.title))}</button>`).join('')}</div>` : ''}
        <div class="se-story">${esc(api.t(cur.story))}</div>
        ${scene()}
        <div class="se-slide"><label for="se-x">${esc(api.t(cur.unknown))}: <b>x = ${x}</b></label>
          <input id="se-x" type="range" data-key="slider:x" min="${cur.min}" max="${cur.max}" step="1" value="${x}" aria-label="${esc(T('Value of x', 'x का मान'))}"></div>
        ${readout()}
        <div class="se-btns"><button type="button" class="pri" data-key="equation">${esc(T('Write the equation', 'समीकरण लिखो'))}</button>${cur.solve ? `<button type="button" data-key="solve">${esc(T('Find all roots', 'सारे मूल निकालो'))}</button>` : ''}<button type="button" data-key="reset">${esc(T('Start again', 'फिर से शुरू करो'))}</button></div>
        ${eqPanel()}${rootPanel()}
      </div>`;
      if (keepFocus) { const el = root.querySelector('[data-key="' + keepFocus + '"]'); if (el && el.focus) el.focus(); }
    }

    function onInput(ev) {
      const el = ev.target.closest('[data-key="slider:x"]');
      if (!el || destroyed) return;
      if (!api.allowed('slider:x')) { el.value = x; api.nudge('slider:x'); return; }
      x = +el.value;
      api.emit('moved');
      if (Math.abs(valueOf(cur, x) - targetOf(cur)) < 1e-9) { api.emit('hit'); if (!hitDone) { hitDone = true; api.record('found x = ' + x + ' for ' + cur.id); } }
      render();
    }
    function onClick(ev) {
      const b = ev.target.closest('button[data-key]');
      if (!b || destroyed) return;
      const k = b.getAttribute('data-key');
      if (!api.allowed(k)) { api.nudge(k); return; }
      if (k.startsWith('sit:')) { cur = sits.find((s) => s.id === k.slice(4)) || cur; x = cur.min; showEq = false; showRoots = false; hitDone = false; api.emit('picked:' + cur.id); }
      else if (k === 'equation') { showEq = true; api.emit('equation'); api.record('wrote the equation for ' + cur.id); }
      else if (k === 'solve') {
        showRoots = true; showEq = true;
        const r = rootsOf(tidy(rawQuad(cur)));
        api.emit('solved');
        if (r.D < 0) api.emit('impossible'); else if (r.D === 0) api.emit('repeated');
        if (r.roots.some((v) => whyNot(cur, v))) api.emit('rejected');
      } else if (k === 'reset') { x = cur.min; showEq = false; showRoots = false; hitDone = false; }
      render();
    }
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    render();
    return { destroy() { destroyed = true; root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'story-equation',
    css,
    validate,
    keys,
    demo: {
      situations: [
        { id: 'hall', kind: 'product', title: { en: 'Prayer hall', hi: 'प्रार्थना हॉल' }, story: { en: 'A hall must have a carpet area of 300 m². Its length is 1 m more than twice its breadth. Try breadths until the area matches.', hi: 'एक हॉल का कालीन क्षेत्रफल 300 m² होना चाहिए। उसकी लंबाई चौड़ाई के दोगुने से 1 m ज़्यादा है। अलग-अलग चौड़ाई आज़माओ जब तक क्षेत्रफल मिल न जाए।' }, unknown: { en: 'Breadth in m', hi: 'चौड़ाई m में' }, p: [0, 1], q: [1, 2], pName: { en: 'Breadth', hi: 'चौड़ाई' }, qName: { en: 'Length', hi: 'लंबाई' }, result: { en: 'Area', hi: 'क्षेत्रफल' }, target: 300, min: 1, max: 20, solve: true },
        { id: 'train', kind: 'journey', title: { en: 'Train', hi: 'ट्रेन' }, story: { en: 'A train covers 480 km. At 8 km/h less it would take 3 hours more. Find the usual speed x.', hi: 'एक ट्रेन 480 km जाती है। 8 km/h कम चाल से 3 घंटे ज़्यादा लगते। सामान्य चाल x निकालो।' }, unknown: { en: 'Usual speed in km/h', hi: 'सामान्य चाल km/h में' }, distance: 480, slower: 8, extra: 3, min: 9, max: 80, solve: true },
      ],
    },
    mount,
  });
})();
