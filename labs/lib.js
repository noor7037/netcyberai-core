// NetCyberAI Labs: shared helpers and the template registry. Loaded before the engine and every template.
// Plain browser JavaScript (no build step); also loads under Node for the checker (scripts/check.mjs), so nothing
// here touches the DOM at load time.
(function (g) {
  const reducedMotion = () => !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Subscripts for chemical formulae: HTML <sub> outside SVG, a tspan inside SVG (an HTML <sub> ends an SVG).
  const sub = (f) => esc(f).replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>');
  const svgSub = (f) => esc(f).replace(/([A-Za-z\)])(\d+)/g, '$1<tspan baseline-shift="sub" font-size="72%">$2</tspan>');
  // An equation line: "Zn(s) + 2HCl(aq) -> ZnCl2(aq) + H2(g)^"; "-[heat]->" puts a condition on the arrow;
  // ^ gas given off, v precipitate.
  const eqHTML = (line) => String(line).split(' ').map((tok) => {
    if (tok === '->') return '<span class="eq-arrow" aria-label="gives">⟶</span>';
    const a = tok.match(/^-\[(.+)\]->$/);
    if (a) return `<span class="eq-arrow"><small>${esc(a[1])}</small>⟶</span>`;
    if (tok === '+') return ' + ';
    const m = tok.match(/^(\d*)(.*?)(\((?:s|l|g|aq)\))?([\^v])?$/);
    if (!m) return esc(tok);
    return `${m[1]}${sub(m[2])}${m[3] ? `<span class="eq-st">${m[3]}</span>` : ''}${m[4] === '^' ? '↑' : m[4] === 'v' ? '↓' : ''}`;
  }).join('');
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const mixHex = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], t)).toString(16).padStart(2, '0')).join('');
  // A tween on requestAnimationFrame; with reduced motion it jumps to the end. Returns a stop function.
  function tween(ms, step, done) {
    if (reducedMotion() || ms <= 0 || !g.requestAnimationFrame) { step(1); if (done) done(); return () => {}; }
    let stop = false;
    const t0 = g.performance.now();
    const f = (now) => { if (stop) return; const t = Math.min(1, (now - t0) / ms); step(t); if (t < 1) g.requestAnimationFrame(f); else if (done) done(); };
    g.requestAnimationFrame(f);
    return () => { stop = true; };
  }
  // A {en, hi} text, or a plain string, in the asked language.
  const tx = (x, lang) => (x == null ? '' : typeof x === 'string' || typeof x === 'number' ? String(x) : x[lang] || x.en || '');
  // Load a script once (third-party libraries come only from cdnjs, pinned).
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((ok, no) => {
      const s = g.document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src));
      g.document.head.appendChild(s);
    });
    return loaded[src];
  }
  // Add a template's own CSS once.
  const styled = {};
  function addCSS(id, css) {
    if (styled[id] || !g.document) return;
    styled[id] = true;
    const el = g.document.createElement('style');
    el.setAttribute('data-template', id);
    el.textContent = css;
    g.document.head.appendChild(el);
  }
  // "pick:*" matches "pick:zinc"; exact strings match themselves.
  const matches = (pattern, s) => (pattern.endsWith('*') ? s.startsWith(pattern.slice(0, -1)) : pattern === s);

  const templates = {};
  const NCA_T = {
    register(t) {
      if (!t || !t.id || typeof t.mount !== 'function' || typeof t.validate !== 'function' || typeof t.keys !== 'function') throw new Error('template must have id, mount, validate, keys');
      templates[t.id] = t;
      if (t.css) addCSS(t.id, t.css);
    },
    get: (id) => templates[id],
    all: () => Object.values(templates),
  };
  g.NCA_LIB = { esc, sub, svgSub, eqHTML, lerp, clamp, ease, mixHex, hex, tween, tx, loadScript, addCSS, matches, reducedMotion };
  g.NCA_T = NCA_T;
})(typeof window !== 'undefined' ? window : globalThis);
