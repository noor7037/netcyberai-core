// Template: Balance the equation. The child changes each coefficient with − and +, and an atom counter shows every
// element on the left and the right, red until both sides match and green when they do. It never balances for the child;
// it tells them which atom is still off, and when every atom matches but all the numbers share a factor it asks for the
// smallest whole numbers. Works for any chemical equation the lab gives. Config:
//   { equations: [{ id, left: [formula], right: [formula], name?: {en,hi} }] (1–8) }
// Formulas use plain text with brackets, e.g. "Ca(OH)2", "Fe3O4", "Al2(SO4)3". Coefficients run from 1 to 12.
(function () {
  const { esc, tx, sub } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const FORMULA = /^(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+$/;
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const MAX = 12;

  function atomsOf(formula) {
    const stack = [{}];
    const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g;
    let m;
    while ((m = re.exec(formula))) {
      if (m[1]) { const top = stack[stack.length - 1]; top[m[1]] = (top[m[1]] || 0) + Number(m[2] || 1); }
      else if (m[3]) stack.push({});
      else if (m[4]) { const g = stack.pop(); const n = Number(m[5] || 1); const top = stack[stack.length - 1]; for (const k in g) top[k] = (top[k] || 0) + g[k] * n; }
    }
    return stack[0];
  }
  // Is there any set of coefficients 1..MAX that balances it? (So a lab can never ask for the impossible.)
  function solvable(eq) {
    const all = eq.left.concat(eq.right);
    const co = all.map(() => 1);
    const check = () => { const t = {}; all.forEach((f, i) => { const a = atomsOf(f); const s = i < eq.left.length ? 1 : -1; for (const k in a) t[k] = (t[k] || 0) + s * a[k] * co[i]; }); return Object.values(t).every((v) => v === 0); };
    const rec = (i) => { if (i === all.length) return check(); for (let v = 1; v <= 8; v++) { co[i] = v; if (rec(i + 1)) return true; } return false; };
    return all.length <= 5 ? rec(0) : true;
  }

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { equations }'];
    Object.keys(c).forEach((k) => { if (k !== 'equations') e.push('unknown key: ' + k + ' (use equations)'); });
    if (!Array.isArray(c.equations) || c.equations.length < 1 || c.equations.length > 8) return e.concat('equations: an array of 1 to 8');
    const ids = new Set();
    c.equations.forEach((q, i) => {
      const w = 'equations[' + i + ']';
      if (!q || typeof q !== 'object') { e.push(w + ': an object { id, left, right }'); return; }
      Object.keys(q).forEach((k) => { if (!['id', 'left', 'right', 'name'].includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof q.id !== 'string' || !ID.test(q.id)) e.push(w + ': id must be letters, digits, - or _');
      else if (ids.has(q.id)) e.push(w + ': duplicate id ' + q.id); else ids.add(q.id);
      for (const side of ['left', 'right']) {
        if (!Array.isArray(q[side]) || q[side].length < 1 || q[side].length > 3) e.push(w + '.' + side + ': 1 to 3 formulas');
        else q[side].forEach((f, j) => { if (typeof f !== 'string' || !FORMULA.test(f)) e.push(w + '.' + side + '[' + j + ']: "' + f + '" is not a formula like H2O or Ca(OH)2'); });
      }
      if (q.name !== undefined && !isBi(q.name)) e.push(w + ': name needs both en and hi');
      if (Array.isArray(q.left) && Array.isArray(q.right) && q.left.every((f) => FORMULA.test(f)) && q.right.every((f) => FORMULA.test(f))) {
        const L = new Set(q.left.flatMap((f) => Object.keys(atomsOf(f)))), R = new Set(q.right.flatMap((f) => Object.keys(atomsOf(f))));
        if ([...L].some((k) => !R.has(k)) || [...R].some((k) => !L.has(k))) e.push(w + ': an element appears on only one side, so it can never balance');
        else if (!solvable(q)) e.push(w + ': no whole numbers up to 8 balance this equation');
      }
    });
    return e;
  }

  function keys(c) {
    const eqs = (c && Array.isArray(c.equations) ? c.equations : []).filter((q) => q && typeof q.id === 'string');
    const n = Math.max(0, ...eqs.map((q) => (Array.isArray(q.left) ? q.left.length : 0) + (Array.isArray(q.right) ? q.right.length : 0)));
    const slots = [...Array(n).keys()];
    return {
      targets: eqs.map((q) => 'eq:' + q.id).concat(slots.map((i) => 'inc:' + i), slots.map((i) => 'dec:' + i), ['inc:*', 'dec:*', 'reset']),
      events: eqs.map((q) => 'picked:' + q.id).concat(eqs.map((q) => 'balanced:' + q.id), ['changed', 'balanced', 'smallest']),
    };
  }

  const css = `
.bl-wrap { display: flex; flex-direction: column; gap: 14px; padding: 14px; }
.bl-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.bl-pick button { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 14px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.bl-pick button[aria-pressed="true"] { background: var(--action, #E8702A); border-color: var(--action, #E8702A); color: var(--on-action, #1C1B1A); }
.bl-eq { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 700; font-size: 1.2rem; }
.bl-term { display: inline-flex; align-items: center; border: 1.5px solid var(--line, #E7E1D6); border-radius: 12px; overflow: hidden; background: var(--surface, #FFFDF9); }
.bl-term button { border: 0; background: var(--sunk, #F4EFE7); width: 44px; height: 48px; font-size: 1.3rem; font-weight: 800; cursor: pointer; color: var(--ink, #1C1B1A); }
.bl-term output { min-width: 30px; text-align: center; color: #C2410C; font-size: 1.3rem; }
.bl-term .bl-f { padding: 0 8px 0 2px; }
.bl-arrow { color: var(--royal, #0F766E); font-size: 1.4rem; }
.bl-atoms { border-collapse: collapse; width: 100%; max-width: 420px; font-variant-numeric: tabular-nums; }
.bl-atoms th, .bl-atoms td { border-bottom: 1px solid var(--line, #E7E1D6); padding: 8px 10px; text-align: center; }
.bl-atoms td.ok { color: #0F766E; font-weight: 800; }
.bl-atoms td.off { color: #B42318; font-weight: 800; }
.bl-status { font-weight: 700; padding: 10px 12px; border-radius: 12px; background: var(--sunk, #F4EFE7); }
.bl-status.ok { background: #E4F3EA; color: #0F766E; }
.bl-scale { width: 100%; max-width: 360px; height: auto; }
.bl-beam { transition: transform .35s ease; transform-origin: 180px 40px; }
@media (prefers-reduced-motion: reduce) { .bl-beam { transition: none; } }
`;

  function mount(root, config, api) {
    const T = (en, hi) => api.t({ en, hi });
    const eqs = config.equations;
    let cur = eqs[0];
    let co = cur.left.concat(cur.right).map(() => 1);
    let wasBalanced = false;

    function counts() {
      const L = {}, R = {};
      cur.left.forEach((f, i) => { const a = atomsOf(f); for (const k in a) L[k] = (L[k] || 0) + a[k] * co[i]; });
      cur.right.forEach((f, i) => { const a = atomsOf(f); for (const k in a) R[k] = (R[k] || 0) + a[k] * co[cur.left.length + i]; });
      return { L, R, els: [...new Set(Object.keys(L).concat(Object.keys(R)))] };
    }
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);

    function render() {
      const { L, R, els } = counts();
      const ok = els.every((k) => L[k] === R[k]);
      const g = co.reduce(gcd);
      const lsum = els.reduce((a, k) => a + (L[k] || 0), 0), rsum = els.reduce((a, k) => a + (R[k] || 0), 0);
      const tilt = ok ? 0 : Math.max(-10, Math.min(10, (rsum - lsum) * 2));
      const term = (f, i) => `<span class="bl-term"><button type="button" data-key="dec:${i}" aria-label="${esc(T('One less ' + f, f + ' एक कम'))}">−</button><output aria-live="polite">${co[i]}</output><span class="bl-f">${sub(f)}</span><button type="button" data-key="inc:${i}" aria-label="${esc(T('One more ' + f, f + ' एक ज़्यादा'))}">+</button></span>`;
      const off = els.find((k) => L[k] !== R[k]);
      const msg = ok ? (g > 1 ? T(`Balanced, but every number can be divided by ${g}. Use the smallest whole numbers.`, `बैलेंस हो गया, पर हर संख्या ${g} से पूरी कट जाती है। सबसे छोटी पूरी संख्याएँ लगाओ।`) : T('Balanced: every atom matches on both sides. Mass is conserved.', 'बैलेंस हो गया: दोनों तरफ़ हर परमाणु बराबर है। द्रव्यमान संरक्षित है।'))
        : T(`Not balanced yet: ${off} is ${L[off] || 0} on the left and ${R[off] || 0} on the right. Change a coefficient, never a small number inside a formula.`, `अभी बैलेंस नहीं: ${off} बाईं तरफ़ ${L[off] || 0} और दाईं तरफ़ ${R[off] || 0} है। गुणांक बदलो, फ़ॉर्मूले के अंदर की छोटी संख्या कभी नहीं।`);
      root.innerHTML = `<div class="bl-wrap">
        ${eqs.length > 1 ? `<div class="bl-pick" role="group" aria-label="${esc(T('Choose an equation', 'समीकरण चुनो'))}">${eqs.map((q) => `<button type="button" data-key="eq:${q.id}" aria-pressed="${q.id === cur.id}">${q.name ? esc(api.t(q.name)) : q.left.map(sub).join(' + ') + ' → ' + q.right.map(sub).join(' + ')}</button>`).join('')}</div>` : ''}
        <svg class="bl-scale" viewBox="0 0 360 90" aria-hidden="true"><path d="M180 40v42M150 84h60" stroke="#4B5563" stroke-width="5" stroke-linecap="round"/><g class="bl-beam" style="transform: rotate(${tilt}deg)"><path d="M40 40h280" stroke="#1C1B1A" stroke-width="5" stroke-linecap="round"/><path d="M60 40l-22 30h44zM300 40l-22 30h44z" fill="${ok ? '#E4F3EA' : '#FBE6E3'}" stroke="${ok ? '#0F766E' : '#B42318'}" stroke-width="3" stroke-linejoin="round"/></g><circle cx="180" cy="40" r="6" fill="#E8702A"/></svg>
        <div class="bl-eq">${cur.left.map((f, i) => term(f, i)).join(' + ')} <span class="bl-arrow" aria-label="${esc(T('gives', 'बनाता है'))}">⟶</span> ${cur.right.map((f, i) => term(f, cur.left.length + i)).join(' + ')}</div>
        <table class="bl-atoms"><thead><tr><th scope="col">${esc(T('Atom', 'परमाणु'))}</th><th scope="col">${esc(T('Left', 'बाईं तरफ़'))}</th><th scope="col">${esc(T('Right', 'दाईं तरफ़'))}</th></tr></thead><tbody>${els.map((k) => `<tr><th scope="row">${k}</th><td class="${L[k] === R[k] ? 'ok' : 'off'}">${L[k] || 0}</td><td class="${L[k] === R[k] ? 'ok' : 'off'}">${R[k] || 0}</td></tr>`).join('')}</tbody></table>
        <div class="bl-status ${ok && g === 1 ? 'ok' : ''}" aria-live="polite">${esc(msg)}</div>
        <div><button type="button" class="btn" data-key="reset">${esc(T('Start again', 'फिर से शुरू करो'))}</button></div>
      </div>`;
      if (ok && g === 1 && !wasBalanced) { api.emit('balanced:' + cur.id); api.emit('balanced'); api.emit('smallest'); api.record('Balanced ' + cur.left.concat(cur.right).map((f, i) => co[i] + f).join(' ')); api.celebrate(); }
      wasBalanced = ok && g === 1;
    }

    function onClick(ev) {
      const b = ev.target.closest('[data-key]');
      if (!b) return;
      const k = b.getAttribute('data-key');
      if (!api.allowed(k)) { api.nudge(); return; }
      if (k.startsWith('eq:')) { cur = eqs.find((q) => q.id === k.slice(3)) || cur; co = cur.left.concat(cur.right).map(() => 1); wasBalanced = false; api.emit('picked:' + cur.id); }
      else if (k.startsWith('inc:')) { const i = +k.slice(4); if (i < co.length) { co[i] = Math.min(MAX, co[i] + 1); api.emit('changed'); } }
      else if (k.startsWith('dec:')) { const i = +k.slice(4); if (i < co.length) { co[i] = Math.max(1, co[i] - 1); api.emit('changed'); } }
      else if (k === 'reset') { co = co.map(() => 1); wasBalanced = false; }
      render();
    }
    root.addEventListener('click', onClick);
    render();
    return { destroy() { root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'balance',
    css,
    validate,
    keys,
    demo: {
      equations: [
        { id: 'water', left: ['H2', 'O2'], right: ['H2O'] },
        { id: 'methane', left: ['CH4', 'O2'], right: ['CO2', 'H2O'] },
        { id: 'iron-steam', left: ['Fe', 'H2O'], right: ['Fe3O4', 'H2'] },
        { id: 'aluminium', left: ['Al', 'O2'], right: ['Al2O3'] },
        { id: 'lime', left: ['Ca(OH)2', 'CO2'], right: ['CaCO3', 'H2O'] },
      ],
    },
    mount,
  });
})();
