// Template: Quadratic machine. The child chooses a, b and c of ax² + bx + c = 0 (a is never 0) and runs the quadratic
// formula one stage at a time with the Next button: 1 read a, b, c with their signs; 2 compute the discriminant
// D = b² − 4ac; 3 read what D says (two different real roots, two equal real roots, or none) and write
// x = (−b ± √D) / 2a; 4 get the roots and check each one by putting it back into the equation. A graph of the
// parabola y = ax² + bx + c is drawn from computed points, and the roots appear on the x-axis from stage 3.
// Everything is exact for whole numbers (D, perfect-square roots as fractions); other roots are shown to 2 decimals and
// checked numerically. Config:
//   { equations: [ { id, a, b, c, name?: {en, hi} } ] (1–6; a, b, c whole numbers, a from −5 to 5 but not 0, b and c from −12 to 12),
//     steppers?: boolean (default true: the child may change a, b and c) }
(function () {
  const { esc } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const isInt = Number.isInteger;
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
  const m = (n) => String(n).replace('-', '−');
  const fmt = (n) => m(Math.round(n * 100) / 100);
  const frac = (num, den) => { if (den < 0) { num = -num; den = -den; } const g = gcd(num, den) || 1; num /= g; den /= g; return den === 1 ? m(num) : m(num) + '/' + den; };
  function term(k, sym, first) {
    if (k === 0) return '';
    const mag = Math.abs(k);
    const body = sym ? (mag === 1 ? sym : mag + sym) : String(mag);
    return first ? (k < 0 ? '−' : '') + body : (k < 0 ? ' − ' : ' + ') + body;
  }
  function poly(a, b, c) { let o = '', f = true; [[a, 'x²'], [b, 'x'], [c, '']].forEach(([k, s]) => { const t = term(k, s, f); if (t) { o += t; f = false; } }); return o || '0'; }

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { equations }'];
    Object.keys(c).forEach((k) => { if (!['equations', 'steppers'].includes(k)) e.push('unknown key: ' + k); });
    if (c.steppers !== undefined && typeof c.steppers !== 'boolean') e.push('steppers must be true or false');
    if (!Array.isArray(c.equations) || c.equations.length < 1 || c.equations.length > 6) return e.concat('equations: an array of 1 to 6');
    const ids = new Set();
    c.equations.forEach((q, i) => {
      const w = 'equations[' + i + ']';
      if (!q || typeof q !== 'object') { e.push(w + ': an object { id, a, b, c }'); return; }
      Object.keys(q).forEach((k) => { if (!['id', 'a', 'b', 'c', 'name'].includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof q.id !== 'string' || !ID.test(q.id)) e.push(w + ': id must be letters, digits, - or _'); else if (ids.has(q.id)) e.push(w + ': duplicate id'); else ids.add(q.id);
      if (!isInt(q.a) || q.a === 0 || Math.abs(q.a) > 5) e.push(w + '.a: a whole number from −5 to 5, not 0');
      ['b', 'c'].forEach((k) => { if (!isInt(q[k]) || Math.abs(q[k]) > 12) e.push(w + '.' + k + ': a whole number from −12 to 12'); });
      if (q.name !== undefined && !isBi(q.name)) e.push(w + ': name needs both en and hi');
    });
    return e;
  }
  function keys(c) {
    const eqs = (c && Array.isArray(c.equations) ? c.equations : []).filter((q) => q && typeof q.id === 'string');
    return {
      targets: ['a:+', 'a:-', 'b:+', 'b:-', 'c:+', 'c:-', 'a:*', 'b:*', 'c:*', 'next', 'reset'].concat(eqs.map((q) => 'eq:' + q.id)),
      events: ['changed', 'stage:1', 'stage:2', 'stage:3', 'stage:4', 'solved', 'distinct', 'equal', 'none'].concat(eqs.map((q) => 'picked:' + q.id)),
    };
  }

  const css = `
.qm-wrap { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.qm-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.qm-pick button { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 14px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.qm-pick button[aria-pressed="true"] { background: var(--action, #E8702A); border-color: var(--action, #E8702A); color: var(--on-action, #1C1B1A); }
.qm-eq { font-size: 1.5rem; font-weight: 800; text-align: center; }
.qm-steps { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.qm-st { display: inline-flex; align-items: center; border: 1.5px solid var(--line, #E7E1D6); border-radius: 12px; overflow: hidden; background: var(--surface, #FFFDF9); }
.qm-st b { padding: 0 8px; min-width: 56px; text-align: center; font-size: 1.1rem; }
.qm-st button { border: 0; background: var(--sunk, #F4EFE7); width: 44px; height: 48px; font-size: 1.3rem; font-weight: 800; cursor: pointer; color: var(--ink, #1C1B1A); }
.qm-svg { width: 100%; max-width: 420px; height: auto; align-self: center; }
.qm-card { border: 1.5px solid var(--line, #E7E1D6); border-radius: 12px; padding: 8px 12px; background: var(--surface, #FFFDF9); font-weight: 700; line-height: 1.5; }
.qm-card small { display: block; font-weight: 500; color: var(--ink-2, #4B5563); }
.qm-card.good { background: #E4F3EA; border-color: #0F766E; color: #0F766E; }
.qm-card.warn { background: #FBF1D3; border-color: #C2410C; color: #7A4B00; }
.qm-card.bad { background: #FBE6E3; border-color: #B42318; color: #B42318; }
.qm-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.qm-btns button { min-height: 44px; border-radius: 12px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 16px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.qm-btns button.pri { background: var(--action, #E8702A); border-color: var(--action, #E8702A); color: var(--on-action, #1C1B1A); }
@media (prefers-reduced-motion: reduce) { .qm-wrap * { transition: none !important; animation: none !important; } }
`;

  function mount(root, config, api) {
    const T = (en, hi) => api.t({ en, hi });
    const eqs = config.equations;
    const free = config.steppers !== false;
    let cur = eqs[0];
    let a = cur.a, b = cur.b, c = cur.c, stage = 0, destroyed = false;

    function calc() {
      const D = b * b - 4 * a * c;
      const sq = D >= 0 ? Math.sqrt(D) : NaN;
      const exact = D >= 0 && Number.isInteger(sq);
      let roots = [];
      if (D >= 0) {
        const r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
        roots = D === 0 ? [r2] : [r1, r2].sort((p, q) => p - q);
      }
      return { D, sq, exact, roots };
    }
    const rootText = (r, K) => {
      if (!K.exact) return fmt(r);
      // exact fraction: (−b ± √D)/(2a)
      const sign = r === (-b + K.sq) / (2 * a) ? 1 : -1;
      return frac(-b + sign * K.sq, 2 * a);
    };

    function graph(K) {
      const W = 360, H = 210, L = 34, R = 346, Tp = 12, B = 190;
      const x0 = -10, x1 = 10;
      const f = (x) => a * x * x + b * x + c;
      const vx = -b / (2 * a), vy = f(vx);
      let lo = Math.min(0, vy, f(x0), f(x1)), hi = Math.max(0, vy, f(x0), f(x1));
      // keep the view readable: clip tall parabolas, but always include the vertex and 0
      const cap = 30;
      lo = Math.max(lo, -cap); hi = Math.min(hi, cap);
      lo = Math.min(lo, 0, vy) ; hi = Math.max(hi, 0, vy); lo = Math.max(lo, -cap); hi = Math.min(hi, cap);
      if (hi - lo < 8) { hi += 4; lo -= 4; }
      const padv = (hi - lo) * 0.1; lo -= padv; hi += padv;
      const X = (x) => L + ((x - x0) / (x1 - x0)) * (R - L), Y = (y) => B - ((y - lo) / (hi - lo)) * (B - Tp);
      let d = '';
      for (let i = 0; i <= 160; i++) { const x = x0 + ((x1 - x0) * i) / 160; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(f(x)).toFixed(1); }
      const ticks = [-10, -5, 0, 5, 10].map((t) => `<line x1="${X(t)}" y1="${Y(0) - 4}" x2="${X(t)}" y2="${Y(0) + 4}" stroke="#4B5563"/><text x="${X(t)}" y="${Math.min(B + 14, Y(0) + 20)}" font-size="12" text-anchor="middle" fill="#4B5563">${m(t)}</text>`).join('');
      let dots = '';
      if (stage >= 3 && K.D >= 0) dots = K.roots.map((r) => `<circle cx="${X(r)}" cy="${Y(0)}" r="6" fill="#0F766E" stroke="#fff" stroke-width="2"/><text x="${X(r)}" y="${Y(0) - 10}" font-size="12" font-weight="800" text-anchor="middle" fill="#0F766E">${rootText(r, K)}</text>`).join('');
      const col = K.D > 0 ? '#0369A1' : K.D === 0 ? '#C2410C' : '#B42318';
      return `<svg class="qm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Graph of y = ' + poly(a, b, c) + '. ' + (K.D > 0 ? 'It crosses the x-axis twice.' : K.D === 0 ? 'It just touches the x-axis.' : 'It does not meet the x-axis.'), 'y = ' + poly(a, b, c) + ' का ग्राफ़। ' + (K.D > 0 ? 'यह x-अक्ष को दो बार काटता है।' : K.D === 0 ? 'यह x-अक्ष को बस छूता है।' : 'यह x-अक्ष से मिलता ही नहीं।')))}">
        <rect width="${W}" height="${H}" rx="14" fill="#FFFDF9" stroke="#E7E1D6"/>
        <clipPath id="qm-clip"><rect x="${L}" y="${Tp}" width="${R - L}" height="${B - Tp}"/></clipPath>
        <line x1="${L}" y1="${Y(0)}" x2="${R}" y2="${Y(0)}" stroke="#1C1B1A" stroke-width="2"/>
        <line x1="${X(0)}" y1="${Tp}" x2="${X(0)}" y2="${B}" stroke="#E7E1D6" stroke-width="2"/>
        <path d="${d}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linejoin="round" clip-path="url(#qm-clip)"/>
        ${ticks}${dots}
      </svg>`;
    }

    function panels(K) {
      const out = [];
      if (stage >= 1) out.push(`<div class="qm-card">${esc(T('Step 1: read the numbers with their signs', 'स्टेप 1: संख्याएँ पढ़ो, उनके चिह्न के साथ'))}<small>a = ${m(a)},  b = ${m(b)},  c = ${m(c)}</small></div>`);
      if (stage >= 2) out.push(`<div class="qm-card">${esc(T('Step 2: the discriminant D = b² − 4ac', 'स्टेप 2: विविक्तकर D = b² − 4ac'))}<small>D = (${m(b)})² − 4(${m(a)})(${m(c)}) = ${m(b * b)} − (${m(4 * a * c)}) = ${m(K.D)}</small></div>`);
      if (stage >= 3) {
        const cls = K.D > 0 ? 'good' : K.D === 0 ? 'warn' : 'bad';
        const msg = K.D > 0 ? T('D > 0: two different real roots.', 'D > 0: दो अलग-अलग वास्तविक मूल।') : K.D === 0 ? T('D = 0: two equal real roots, the curve only touches the x-axis.', 'D = 0: दो बराबर वास्तविक मूल, कर्व x-अक्ष को सिर्फ़ छूता है।') : T('D < 0: no real roots. No real number squares to a negative.', 'D < 0: कोई वास्तविक मूल नहीं। कोई भी वास्तविक संख्या वर्ग करने पर ऋणात्मक नहीं आती।');
        out.push(`<div class="qm-card ${cls}">${esc(msg)}${K.D >= 0 ? `<small>x = (−b ± √D) / 2a = (${m(-b)} ± √${K.D}) / ${m(2 * a)}</small>` : ''}</div>`);
      }
      if (stage >= 4) {
        if (K.D < 0) out.push(`<div class="qm-card bad">${esc(T('There is nothing to check: the equation has no real root.', 'जाँचने को कुछ नहीं: समीकरण का कोई वास्तविक मूल नहीं है।'))}</div>`);
        else {
          const lines = K.roots.map((r) => {
            let ok;
            if (K.exact) { const sign = r === (-b + K.sq) / (2 * a) ? 1 : -1; let n = -b + sign * K.sq, d = 2 * a; if (d < 0) { n = -n; d = -d; } ok = a * n * n + b * n * d + c * d * d === 0; } else ok = Math.abs(a * r * r + b * r + c) < 1e-9;
            return `x = ${rootText(r, K)}${K.exact ? '' : ' (≈)'}: ${esc(T('put it back', 'वापस रखा'))} ${esc(poly(a, b, c))} = 0 ${ok ? '✓' : '✗'}`;
          }).join('<br>');
          out.push(`<div class="qm-card good">${esc(T('Step 4: the roots, checked', 'स्टेप 4: मूल, जाँचे हुए'))}<small>${lines}${K.D === 0 ? '<br>' + esc(T('Both roots are the same number.', 'दोनों मूल एक ही संख्या हैं।')) : ''}</small></div>`);
        }
      }
      return out.join('');
    }

    function render() {
      const K = calc();
      const stepper = (k, v, lab) => `<div class="qm-st"><button type="button" data-key="${k}:-" aria-label="${esc(T(lab + ' down', lab + ' घटाओ'))}">−</button><b>${esc(lab)} = ${m(v)}</b><button type="button" data-key="${k}:+" aria-label="${esc(T(lab + ' up', lab + ' बढ़ाओ'))}">+</button></div>`;
      root.innerHTML = `<div class="qm-wrap">
        ${eqs.length > 1 ? `<div class="qm-pick" role="group" aria-label="${esc(T('Choose an equation', 'समीकरण चुनो'))}">${eqs.map((q) => `<button type="button" data-key="eq:${q.id}" aria-pressed="${q.id === cur.id}">${q.name ? esc(api.t(q.name)) : esc(poly(q.a, q.b, q.c))}</button>`).join('')}</div>` : ''}
        <div class="qm-eq" role="img" aria-label="${esc(poly(a, b, c) + ' = 0')}">${esc(poly(a, b, c))} = 0</div>
        ${free ? `<div class="qm-steps">${stepper('a', a, 'a')}${stepper('b', b, 'b')}${stepper('c', c, 'c')}</div>` : ''}
        ${graph(K)}
        ${panels(K)}
        <div class="qm-btns"><button type="button" class="pri" data-key="next"${stage >= 4 ? ' disabled' : ''}>${esc(stage === 0 ? T('Start the formula', 'फ़ॉर्मूला शुरू करो') : T('Next step', 'अगला स्टेप'))}</button><button type="button" data-key="reset">${esc(T('Start again', 'फिर से शुरू करो'))}</button></div>
        <div aria-live="polite" class="qm-card" style="font-weight:500">${esc(stage >= 4 ? T('Done. Change a, b or c and run it again.', 'हो गया। a, b या c बदलो और फिर चलाओ।') : T('Press the button to run one step of the formula at a time.', 'बटन दबाकर फ़ॉर्मूले को एक-एक स्टेप में चलाओ।'))}</div>
      </div>`;
    }

    function onClick(ev) {
      const bt = ev.target.closest('button[data-key]');
      if (!bt || destroyed) return;
      const k = bt.getAttribute('data-key');
      if (!api.allowed(k)) { api.nudge(k); return; }
      if (k.startsWith('eq:')) { cur = eqs.find((q) => q.id === k.slice(3)) || cur; a = cur.a; b = cur.b; c = cur.c; stage = 0; api.emit('picked:' + cur.id); }
      else if (/^[abc]:[+-]$/.test(k)) {
        const d = k[2] === '+' ? 1 : -1;
        if (k[0] === 'a') { a += d; if (a === 0) a += d; a = Math.max(-5, Math.min(5, a)); }
        else if (k[0] === 'b') b = Math.max(-12, Math.min(12, b + d));
        else c = Math.max(-12, Math.min(12, c + d));
        stage = Math.min(stage, 1);
        api.emit('changed');
      } else if (k === 'next') {
        if (stage < 4) {
          stage += 1; api.emit('stage:' + stage);
          const K = calc();
          if (stage === 3) api.emit(K.D > 0 ? 'distinct' : K.D === 0 ? 'equal' : 'none');
          if (stage === 4) { api.emit('solved'); api.record('solved ' + poly(a, b, c) + ' = 0 with D = ' + K.D); api.celebrate(); }
        }
      } else if (k === 'reset') { a = cur.a; b = cur.b; c = cur.c; stage = 0; }
      render();
    }
    root.addEventListener('click', onClick);
    render();
    return { destroy() { destroyed = true; root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'quad-machine',
    css,
    validate,
    keys,
    demo: {
      equations: [
        { id: 'e1', a: 2, b: 1, c: -6, name: { en: '2x² + x − 6', hi: '2x² + x − 6' } },
        { id: 'e2', a: 1, b: -4, c: 4, name: { en: 'x² − 4x + 4', hi: 'x² − 4x + 4' } },
        { id: 'e3', a: 2, b: -4, c: 3, name: { en: '2x² − 4x + 3', hi: '2x² − 4x + 3' } },
      ],
    },
    mount,
  });
})();
