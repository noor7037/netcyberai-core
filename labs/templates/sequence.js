// Template: Put in order. Steps of a process, a story, a life cycle or a procedure come as shuffled cards; the child puts
// them into numbered places. Tap a card, then tap a place (or drag with a mouse, or use the keyboard). Tapping a card in
// a place and then another place swaps them. "Check" says how many are right without giving the answer away; after two
// misses it gives one hint. A cycle (cyclic: true) accepts any starting point: every rotation of the order is right,
// because a life cycle or the water cycle has no first step. Config:
//   { items: [{ id, text: {en,hi}, image?: asset id }] in the correct order (3–10), cyclic?: boolean }
(function () {
  const { esc, tx } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const DEV = /[ऀ-ॿ]/;
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  // Card colours (logo tokens). The colour follows the shuffled position, never the answer, so it gives nothing away.
  const PAL = ['#1D4ED8', '#0F766E', '#8B3DFF', '#FF7A1A', '#02CFF9', '#FF6B57', '#14B8A6', '#2563EB', '#F5B90A', '#22C55E'];

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { items, cyclic? }'];
    Object.keys(c).forEach((k) => { if (k !== 'items' && k !== 'cyclic') e.push('unknown key: ' + k + ' (use items, cyclic)'); });
    if (c.cyclic != null && typeof c.cyclic !== 'boolean') e.push('cyclic must be true or false');
    if (!Array.isArray(c.items) || c.items.length < 3 || c.items.length > 10) e.push('items: an array of 3 to 10 steps in the correct order');
    else {
      const ids = new Set(), texts = new Set();
      c.items.forEach((d, i) => {
        const w = 'items[' + i + ']';
        if (!d || typeof d !== 'object' || Array.isArray(d)) { e.push(w + ': an object { id, text }'); return; }
        if (typeof d.id !== 'string' || !ID.test(d.id)) e.push(w + ': id must be letters, digits, - or _ (no spaces or colons)');
        else if (ids.has(d.id)) e.push(w + ': duplicate id ' + d.id);
        else ids.add(d.id);
        if (!isBi(d.text)) e.push(w + ': text needs both en and hi');
        else {
          if (d.text.en.length > 90 || d.text.hi.length > 120) e.push(w + ': text is too long for a card (90 characters in English at most)');
          if (!DEV.test(d.text.hi) && d.text.hi.trim() !== d.text.en.trim()) e.push(w + ': the hi text must be written in Devanagari');
          const key = d.text.en.trim().toLowerCase();
          if (texts.has(key)) e.push(w + ': the same step text appears twice (' + d.text.en + ')');
          texts.add(key);
        }
        if (d.image != null && (typeof d.image !== 'string' || !ID.test(d.image))) e.push(w + ': image must be an asset id');
        Object.keys(d).forEach((k) => { if (k !== 'id' && k !== 'text' && k !== 'image') e.push(w + ': unknown key ' + k); });
      });
    }
    return e;
  }

  function keys(c) {
    const items = (c && Array.isArray(c.items) ? c.items : []).filter((d) => d && typeof d.id === 'string').map((d) => d.id);
    const n = c && Array.isArray(c.items) ? c.items.length : 0;
    const slots = []; for (let i = 1; i <= n; i++) slots.push('slot:' + i);
    return {
      targets: items.map((i) => 'item:' + i).concat(slots, ['check', 'reset']),
      events: items.map((i) => 'placed:' + i).concat(['ordered', 'wrong-order']),
    };
  }

  const css = `
.sq { --sq-r: 16px; display: grid; gap: 12px; font-family: var(--font-body, system-ui, sans-serif); color: var(--ink); min-width: 0; }
.sq * { box-sizing: border-box; }
.sq-top { display: flex; align-items: center; gap: 12px; }
.sq-prog { flex: 1; height: 12px; border-radius: 999px; background: var(--sunk); border: 1px solid var(--line); overflow: hidden; }
.sq-prog > i { display: block; height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, #02CFF9, #14B8A6, #22C55E); transition: width .45s cubic-bezier(.3,1.3,.5,1); }
.sq-count { font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; min-width: 3.6em; text-align: right; }
.sq-hint { margin: 0; font-size: .95rem; color: var(--ink-2); }
.sq-main { display: grid; gap: 14px; min-width: 0; }
.sq-h { font-family: var(--font-display, inherit); font-weight: 700; margin: 0 0 6px; font-size: 1rem; color: var(--ink-2); }
.sq-tray { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 10px; padding: 12px; min-height: 76px; border-radius: var(--sq-r); border: 2px dashed var(--line); background: var(--surface); transition: background .18s, border-color .18s; }
.sq-tray.sq-over { border-color: var(--royal); background: var(--royal-t); }
.sq-tray-ok { margin: auto; font-weight: 700; color: var(--good); font-family: var(--font-display, inherit); text-align: center; }
.sq-card { --c: #1D4ED8; position: relative; display: inline-flex; align-items: center; gap: 10px; min-height: 48px; max-width: 100%; padding: 8px 14px 8px 8px; border-radius: 14px; border: 2px solid var(--line); border-left: 8px solid var(--c); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-body, inherit); font-weight: 600; font-size: 1rem; line-height: 1.3; text-align: left; cursor: grab; touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: transform .15s, box-shadow .15s, border-color .15s, background .15s; box-shadow: 0 4px 10px rgba(6,18,51,.10); }
.sq-card > span { min-width: 0; overflow-wrap: anywhere; }
.sq-card:hover { transform: translateY(-2px); border-color: var(--c); }
.sq-card[aria-pressed="true"] { border-color: #FF7A1A; background: var(--sun-t); transform: translateY(-3px) rotate(-1deg); box-shadow: 0 0 0 3px rgba(255,122,26,.35), 0 10px 18px rgba(6,18,51,.18); }
.sq-card img, .sq-pic { width: 38px; height: 38px; border-radius: 10px; object-fit: cover; flex: none; }
.sq-pic { display: grid; place-items: center; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 55%, #fff)); color: #fff; font-weight: 800; font-family: var(--font-display, inherit); font-size: 1.1rem; text-shadow: 0 1px 2px rgba(0,0,0,.35); }
.sq-drag-src { opacity: .35; }
.sq-ghost { position: fixed; z-index: 9999; pointer-events: none; transform: translate(-50%, -60%) rotate(-3deg) scale(1.05); opacity: .96; box-shadow: 0 16px 30px rgba(6,18,51,.35); }
.sq-body { display: grid; gap: 12px; min-width: 0; }
.sq-ring { display: none; justify-self: center; width: min(100%, 210px); }
.sq-cyc .sq-ring { display: block; }
.sq-ring svg { display: block; width: 100%; height: auto; }
.sq-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; counter-reset: none; }
.sq-slot { position: relative; display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; align-items: center; padding: 5px 0; border-radius: 14px; transition: background .18s; }
.sq-slot.sq-over { background: var(--royal-t); }
.sq-num { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(180deg, #2563EB, #1D4ED8); color: #fff; font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.1rem; box-shadow: 0 3px 0 #1E3A8A; position: relative; z-index: 1; }
.sq-slot.sq-ok .sq-num { background: linear-gradient(180deg, #14B8A6, #0F766E); box-shadow: 0 3px 0 #064E48; }
.sq-slot.sq-no .sq-num { background: linear-gradient(180deg, #FF6B57, #E04A36); box-shadow: 0 3px 0 #9A2C1D; color: #1E293B; }
.sq-slot:not(:last-child)::after { content: ''; position: absolute; left: 19px; top: 45px; bottom: -5px; width: 3px; background: repeating-linear-gradient(180deg, var(--line) 0 5px, transparent 5px 9px); }
.sq-empty { display: flex; align-items: center; min-height: 52px; width: 100%; padding: 8px 14px; border-radius: 14px; border: 2px dashed var(--line); background: var(--sunk); color: var(--ink-2); font-size: .92rem; font-family: inherit; cursor: pointer; text-align: left; }
.sq-pick .sq-empty { border-color: var(--royal); background: var(--royal-t); color: var(--royal); animation: sq-pulse 1.4s ease-in-out infinite; }
.sq-pick .sq-slot-full .sq-card { animation: sq-pulse 1.4s ease-in-out infinite; }
.sq-slot .sq-card { width: 100%; min-height: 52px; cursor: pointer; }
.sq-slot.sq-ok .sq-card { border-color: var(--good); background: var(--good-t); border-left-color: var(--good); }
.sq-slot.sq-no .sq-card { border-color: var(--bad); background: var(--bad-t); border-left-color: var(--bad); animation: sq-shake .45s; }
.sq-mark { margin-left: auto; flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: .95rem; background: var(--good); color: #fff; }
.sq-slot.sq-no .sq-mark { background: var(--bad); }
.sq-pop .sq-card { animation: sq-pop .45s cubic-bezier(.3,1.6,.5,1); }
.sq-win .sq-card { animation: sq-win .6s cubic-bezier(.3,1.5,.5,1) both; animation-delay: var(--d, 0s); }
.sq-back { display: none; margin: 4px 0 0 50px; font-size: .9rem; font-weight: 700; color: var(--royal); font-family: var(--font-display, inherit); }
.sq-cyc .sq-back { display: block; }
.sq-fb { min-height: 64px; border-radius: var(--sq-r); padding: 10px 14px; background: var(--sunk); border: 1px solid var(--line); font-size: 1rem; line-height: 1.45; display: flex; gap: 10px; align-items: flex-start; }
.sq-fb-i { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--royal-t); color: var(--royal); }
.sq-fb.sq-good { background: var(--good-t); border-color: var(--good); } .sq-fb.sq-good .sq-fb-i { background: var(--good); color: #fff; }
.sq-fb.sq-bad { background: var(--bad-t); border-color: var(--bad); } .sq-fb.sq-bad .sq-fb-i { background: var(--bad); color: #fff; }
.sq-fb.sq-winm { background: var(--sun-t); border-color: var(--sun); } .sq-fb.sq-winm .sq-fb-i { background: var(--sun); color: #1E293B; }
.sq-fb-t { min-width: 0; overflow-wrap: anywhere; } .sq-fb-t strong { font-family: var(--font-display, inherit); }
.sq-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.sq-btn { min-height: 48px; min-width: 120px; padding: 10px 20px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; cursor: pointer; transition: transform .15s; }
.sq-btn:hover { transform: translateY(-2px); }
.sq-btn.sq-primary { background: linear-gradient(180deg, #2563EB, #1D4ED8); border-color: #1E3A8A; color: #fff; }
.sq-btn[disabled] { opacity: .55; cursor: default; transform: none; }
.sq-card:focus-visible, .sq-empty:focus-visible, .sq-btn:focus-visible { outline: 3px solid var(--cyan, #02CFF9); outline-offset: 2px; }
.sq-done .sq-tray { border-style: solid; border-color: var(--good); background: var(--good-t); }
.sq-done .sq-card { cursor: default; }
@keyframes sq-pulse { 0%, 100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 0 4px rgba(37,99,235,.28); } }
@keyframes sq-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } }
@keyframes sq-pop { 0% { transform: scale(.85); } 100% { transform: scale(1); } }
@keyframes sq-win { 0% { transform: scale(1); } 45% { transform: scale(1.04) translateX(6px); } 100% { transform: scale(1); } }
@media (min-width: 760px) {
  .sq-main { grid-template-columns: minmax(240px, 5fr) minmax(0, 7fr); align-items: start; gap: 22px; }
  .sq-tray { position: sticky; top: 8px; }
  .sq-ring { width: 190px; }
}
@media (prefers-reduced-motion: reduce) { .sq *, .sq *::before, .sq *::after { animation: none !important; transition: none !important; } }
@media (max-width: 420px) { .sq-ring { width: 128px; } .sq-btn { flex: 1; min-width: 0; } .sq-slot { grid-template-columns: 34px minmax(0, 1fr); gap: 8px; } .sq-num { width: 34px; height: 34px; font-size: 1rem; } .sq-slot:not(:last-child)::after { left: 16px; top: 39px; } .sq-back { margin-left: 42px; } }
`;

  // ---------------------------------------------------------------- logic (pure)
  // For a cycle every rotation is right. Returns { ok: [bool per place], best: rotation used, total correct }.
  function grade(order, arr, cyclic) {
    const n = order.length;
    const rots = cyclic ? n : 1;
    let best = null;
    for (let r = 0; r < rots; r++) {
      const ok = arr.map((id, i) => id === order[(i + r) % n]);
      const total = ok.filter(Boolean).length;
      if (!best || total > best.total) best = { ok, total, r };
    }
    return best;
  }
  const rotated = (order, arr, cyclic) => { const g = grade(order, arr, cyclic); return g.total === order.length; };

  function mount(root, config, api) {
    const items = config.items, cyclic = !!config.cyclic, n = items.length;
    const order = items.map((d) => d.id);
    const by = {}; items.forEach((d) => { by[d.id] = d; });
    let shuffleNo = 0;
    const shuffled = () => {
      let seed = 11 + shuffleNo * 977; order.forEach((id) => { for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0; });
      for (let tries = 0; tries < 50; tries++) {
        const a = order.slice();
        for (let i = a.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = (seed >>> 8) % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
        if (!rotated(order, a, cyclic)) return a;
      }
      return order.slice().reverse();
    };
    let st, tray, colourOf = {};
    const fresh = () => {
      tray = shuffled(); colourOf = {}; tray.forEach((id, i) => { colourOf[id] = PAL[i % PAL.length]; });
      return { slots: new Array(n).fill(null), sel: null, marks: null, msg: null, done: false, fails: 0, pop: -1, win: false };
    };
    st = fresh();
    let destroyed = false, drag = null, suppressClick = false;
    const T = (en, hi) => api.t({ en, hi });
    const L = () => api.lang();
    const txt = (id) => tx(by[id].text, L());
    const filled = () => st.slots.filter(Boolean).length;
    const inTray = () => tray.filter((id) => !st.slots.includes(id));
    const where = (id) => st.slots.indexOf(id);

    function cardHTML(id, inSlot, mark) {
      const d = by[id], text = txt(id);
      const url = d.image ? api.asset(d.image) : null;
      const pic = url ? `<img src="${esc(url)}" alt="" draggable="false">` : d.image ? `<span class="sq-pic" aria-hidden="true">${esc(text.trim().charAt(0))}</span>` : '';
      const pos = where(id);
      const label = text + (pos >= 0 ? ', ' + T('place ' + (pos + 1), 'स्थान ' + (pos + 1)) + (mark === 'ok' ? ', ' + T('right', 'सही') : mark === 'no' ? ', ' + T('not right', 'सही नहीं') : '') : '');
      return `<button type="button" class="sq-card" data-key="item:${esc(id)}" data-item="${esc(id)}" aria-pressed="${st.sel === id}" aria-label="${esc(label)}" style="--c:${colourOf[id]}">${pic}<span>${esc(text)}</span>${mark ? `<b class="sq-mark" aria-hidden="true">${mark === 'ok' ? '✓' : '✗'}</b>` : ''}</button>`;
    }

    function ringSVG() {
      const R = 74, cx = 100, cy = 100;
      const pt = (i, r) => { const a = (-90 + (360 * i) / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      let s = `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(T('A cycle: the last step leads back to the first.', 'एक चक्र: आख़िरी चरण फिर पहले चरण पर पहुँचाता है।'))}"><defs><marker id="sq-ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2563EB"/></marker></defs><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(37,99,235,.12)" stroke-width="16"/>`;
      for (let i = 0; i < n; i++) {
        const a0 = (-90 + (360 * i) / n + 360 / n * 0.24) * Math.PI / 180, a1 = (-90 + (360 * (i + 1)) / n - 360 / n * 0.24) * Math.PI / 180;
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        s += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#2563EB" stroke-width="3" marker-end="url(#sq-ah)"/>`;
      }
      for (let i = 0; i < n; i++) {
        const [x, y] = pt(i, R), has = !!st.slots[i], m = st.marks ? st.marks[i] : null;
        const fill = m === 'no' ? '#FF6B57' : m === 'ok' || (st.done) ? '#0F766E' : has ? '#1D4ED8' : '#FFFFFF';
        const stroke = has ? 'none' : '#2563EB';
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="800" font-family="inherit" fill="${m === 'no' ? '#1E293B' : has ? '#FFFFFF' : '#1D4ED8'}">${i + 1}</text>`;
      }
      s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="26" fill="#2563EB" aria-hidden="true">↻</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" font-family="inherit">${esc(T('repeats', 'दोहराता है'))}</text></svg>`;
      return s;
    }

    function render() {
      if (destroyed) return;
      const act = root.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      const got = filled();
      const selText = st.sel ? txt(st.sel) : '';
      const free = inTray();
      const slotsHTML = st.slots.map((id, i) => {
        const mark = id && st.marks ? st.marks[i] : null;
        const cls = ['sq-slot', id ? 'sq-slot-full' : '', mark ? 'sq-' + mark : '', st.pop === i ? 'sq-pop' : '', st.done ? 'sq-ok' : ''].filter(Boolean).join(' ');
        const inner = id ? cardHTML(id, true, mark || (st.done ? 'ok' : null))
          : `<button type="button" class="sq-empty" data-empty="${i}" aria-label="${esc(T('Place ' + (i + 1) + ', empty', 'स्थान ' + (i + 1) + ', खाली') + (st.sel ? '. ' + T('Put ' + selText + ' here', selText + ' को यहाँ रखो') : ''))}">${esc(st.sel ? T('Put it here', 'इसे यहाँ रखो') : T('Place ' + (i + 1), 'स्थान ' + (i + 1)))}</button>`;
        return `<li class="${cls}" data-key="slot:${i + 1}" data-slot="${i}" style="--d:${(i * 0.09).toFixed(2)}s"><span class="sq-num" aria-hidden="true">${i + 1}</span><div>${inner}</div></li>`;
      }).join('');
      const trayHTML = free.map((id) => cardHTML(id, false, null)).join('') || `<div class="sq-tray-ok">★ ${esc(T('All cards are placed', 'सारे कार्ड रख दिए'))}</div>`;
      const hint = st.done ? T('Well done! Press "Start again" to try a new shuffle.', 'शाबाश! नए क्रम के लिए "फिर से शुरू" दबाओ।')
        : st.sel ? T('Now tap the place for "' + selText + '".', '"' + selText + '" के लिए अब सही स्थान छुओ।')
        : cyclic ? T('This is a cycle: it repeats, so you may start anywhere. Tap a card, then tap a place.', 'यह एक चक्र है: यह दोहराता रहता है, इसलिए कहीं से भी शुरू कर सकते हो। कार्ड छुओ, फिर स्थान छुओ।')
        : T('Tap a card, then tap its place. With a mouse you can drag it too.', 'पहले कार्ड छुओ, फिर उसका स्थान छुओ। माउस से खींच भी सकते हो।');
      const m = st.msg;
      const icon = !m ? '?' : m.kind === 'good' ? '✓' : m.kind === 'bad' ? '✗' : m.kind === 'winm' ? '★' : 'i';
      const full = got === n;
      root.innerHTML = `<div class="sq${cyclic ? ' sq-cyc' : ''}${st.sel ? ' sq-pick' : ''}${st.done ? ' sq-done' : ''}${st.win ? ' sq-win' : ''}">
<div class="sq-top"><div class="sq-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${got}" aria-label="${esc(T('Places filled', 'भरे हुए स्थान'))}"><i style="width:${(100 * got) / n}%"></i></div><span class="sq-count">${got} / ${n}</span></div>
<p class="sq-hint">${esc(hint)}</p>
<div class="sq-main">
<div><p class="sq-h">${esc(T('Cards', 'कार्ड'))} (${free.length})</p><div class="sq-tray" data-tray>${trayHTML}</div></div>
<div class="sq-body"><div class="sq-ring">${cyclic ? ringSVG() : ''}</div><ol class="sq-list" aria-label="${esc(T('The order', 'सही क्रम'))}">${slotsHTML}</ol><div class="sq-back" aria-hidden="true">↻ ${esc(T('then back to place 1', 'फिर वापस स्थान 1 पर'))}</div></div>
</div>
<div class="sq-fb ${m ? 'sq-' + m.kind : ''}" aria-live="polite" role="status"><span class="sq-fb-i" aria-hidden="true">${icon}</span><div class="sq-fb-t">${m ? m.html : esc(T('Put every card in its place, then press Check.', 'हर कार्ड को उसकी जगह रखो, फिर "जाँचो" दबाओ।'))}</div></div>
<div class="sq-actions"><button type="button" class="sq-btn sq-primary" data-key="check"${st.done ? ' disabled' : ''}>${esc(T('Check', 'जाँचो'))}${full && !st.done ? ' ✓' : ''}</button><button type="button" class="sq-btn" data-key="reset">${esc(T('Start again', 'फिर से शुरू'))}</button></div>
</div>`;
      st.pop = -1; st.win = false;
      if (act) { const el = root.querySelector('[data-key="' + act.replace(/"/g, '\\"') + '"]'); if (el) { const f = el.matches('button') ? el : el.querySelector('button'); if (f) f.focus({ preventScroll: true }); } }
    }

    function put(id, slot) {
      if (st.done || !by[id] || slot < 0 || slot >= n) return;
      if (!api.allowed('slot:' + (slot + 1))) { api.nudge('slot:' + (slot + 1)); return; }
      const from = where(id), other = st.slots[slot];
      if (from === slot) { st.sel = null; render(); return; }
      if (from >= 0) st.slots[from] = other || null; // swap with the card that was there (or leave a gap)
      st.slots[slot] = id;
      st.sel = null; st.marks = null; st.pop = slot;
      st.msg = null;
      api.record(T(txt(id) + ' put in place ' + (slot + 1), txt(id) + ' को स्थान ' + (slot + 1) + ' पर रखा'));
      api.emit('placed:' + id);
      render();
    }
    function toTray(id) {
      const from = where(id);
      if (st.done || from < 0) return;
      st.slots[from] = null; st.sel = null; st.marks = null; st.msg = null;
      render();
    }

    function doCheck() {
      if (st.done) return;
      if (!api.allowed('check')) { api.nudge('check'); return; }
      const left = n - filled();
      if (left) {
        st.msg = { kind: 'info', html: esc(T(left + ' place' + (left === 1 ? ' is' : 's are') + ' still empty. Fill every place, then check.', left + ' स्थान अभी खाली हैं। सारे स्थान भरो, फिर जाँचो।')) };
        api.record(T('Pressed Check with ' + left + ' places empty', 'जाँचो दबाया, ' + left + ' स्थान खाली')); render(); return;
      }
      const g = grade(order, st.slots, cyclic);
      if (g.total === n) {
        st.done = true; st.marks = null; st.win = true; st.sel = null;
        const seq = st.slots.map(txt).join(' → ');
        st.msg = { kind: 'winm', html: `<strong>${esc(T('Right order!', 'सही क्रम!'))}</strong> ${esc(cyclic ? T('Any starting point works in a cycle. Read it round: ', 'चक्र में कहीं से भी शुरू कर सकते हैं। गोल-गोल पढ़ो: ') : T('Read it back: ', 'फिर से पढ़ो: '))}${esc(seq)}${cyclic ? ' ↻' : ''}` };
        api.record(T('Put all ' + n + ' steps in the right order' + (st.fails ? ' after ' + st.fails + ' wrong check' + (st.fails > 1 ? 's' : '') : ' at the first check'), 'सभी ' + n + ' चरण सही क्रम में लगाए' + (st.fails ? ' (' + st.fails + ' बार ग़लत जाँच के बाद)' : ' (पहली जाँच में)')));
        api.emit('ordered');
        api.celebrate();
      } else {
        st.fails++;
        st.marks = g.ok.map((v) => (v ? 'ok' : 'no'));
        const bad = g.ok.findIndex((v) => !v);
        let html = `<strong>${esc(T(g.total + ' of ' + n + ' are in the right place.', n + ' में से ' + g.total + ' सही जगह पर हैं।'))}</strong> ${esc(T('Move the ones marked ✗ and check again.', '✗ वाले कार्ड बदलो और फिर जाँचो।'))}`;
        if (st.fails >= 2) {
          const want = order[(bad + g.r) % n];
          html += ` ${esc(T('Hint: ' + (cyclic ? 'after "' + txt(st.slots[(bad + n - 1) % n]) + '"' : 'place ' + (bad + 1)) + ' comes "' + txt(want) + '".', 'संकेत: ' + (cyclic ? '"' + txt(st.slots[(bad + n - 1) % n]) + '" के बाद' : 'स्थान ' + (bad + 1) + ' पर') + ' "' + txt(want) + '" आता है।'))}`;
        }
        st.msg = { kind: 'bad', html };
        api.record(T(g.total + ' of ' + n + ' right on check ' + st.fails, 'जाँच ' + st.fails + ': ' + n + ' में से ' + g.total + ' सही'));
        api.emit('wrong-order');
      }
      render();
    }

    function doReset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      shuffleNo++; st = fresh();
      st.msg = { kind: 'info', html: esc(T('The cards are shuffled. Put them in order!', 'कार्ड फेंट दिए गए। इन्हें क्रम में लगाओ!')) };
      api.record(T('Started again', 'फिर से शुरू किया'));
      render();
    }

    function onClick(ev) {
      if (suppressClick) { suppressClick = false; return; }
      const t = ev.target;
      const keyEl = t.closest('[data-key]');
      if (!keyEl || !root.contains(keyEl)) { const tr = t.closest('[data-tray]'); if (tr && st.sel && where(st.sel) >= 0) toTray(st.sel); return; }
      const key = keyEl.getAttribute('data-key');
      if (key === 'check') return doCheck();
      if (key === 'reset') return doReset();
      const cardEl = t.closest('[data-item]');
      const slotEl = t.closest('[data-slot]');
      if (cardEl && root.contains(cardEl)) {
        const id = cardEl.getAttribute('data-item');
        if (st.done) return;
        if (slotEl && st.sel && st.sel !== id) return put(st.sel, +slotEl.getAttribute('data-slot'));
        if (!api.allowed('item:' + id)) { api.nudge('item:' + id); return; }
        st.sel = st.sel === id ? null : id; render(); return;
      }
      if (slotEl && root.contains(slotEl)) {
        if (st.sel) return put(st.sel, +slotEl.getAttribute('data-slot'));
        st.msg = { kind: 'info', html: esc(T('Pick a card first, then tap this place.', 'पहले एक कार्ड चुनो, फिर इस स्थान को छुओ।')) }; render();
      }
    }

    // Drag with a mouse or pen; touch uses tap-then-tap so the page still scrolls.
    const dropAt = (x, y) => { const el = document.elementFromPoint(x, y); if (!el || !el.closest) return null; const s = el.closest('[data-slot]'); if (s && root.contains(s)) return s; const tr = el.closest('[data-tray]'); return tr && root.contains(tr) ? tr : null; };
    function onDown(ev) {
      if (ev.pointerType === 'touch' || ev.button > 0 || st.done) return;
      const el = ev.target.closest('[data-item]');
      if (!el || !root.contains(el)) return;
      drag = { id: el.getAttribute('data-item'), el, x: ev.clientX, y: ev.clientY, on: false, ghost: null, over: null };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    }
    function onMove(ev) {
      if (!drag) return;
      if (!drag.on) {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 7) return;
        if (!api.allowed('item:' + drag.id)) { api.nudge('item:' + drag.id); endDrag(); return; }
        drag.on = true;
        drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('sq-ghost'); drag.ghost.removeAttribute('data-key'); drag.ghost.removeAttribute('data-item');
        drag.ghost.style.width = drag.el.offsetWidth + 'px'; document.body.appendChild(drag.ghost); drag.el.classList.add('sq-drag-src');
      }
      drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
      const b = dropAt(ev.clientX, ev.clientY);
      if (b !== drag.over) { if (drag.over) drag.over.classList.remove('sq-over'); if (b) b.classList.add('sq-over'); drag.over = b; }
    }
    function onUp(ev) {
      if (!drag) return;
      const d = drag; endDrag();
      if (d.on) {
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
        const b = dropAt(ev.clientX, ev.clientY);
        if (!b) { st.sel = d.id; render(); } else if (b.hasAttribute('data-slot')) put(d.id, +b.getAttribute('data-slot')); else toTray(d.id);
      }
    }
    function endDrag() {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.over) drag.over.classList.remove('sq-over'); if (drag.el) drag.el.classList.remove('sq-drag-src'); }
      drag = null;
    }

    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('dragstart', (e) => e.preventDefault());
    render();
    return { destroy() { destroyed = true; endDrag(); root.removeEventListener('click', onClick); root.removeEventListener('pointerdown', onDown); root.innerHTML = ''; } };
  }

  const S = (id, en, hi) => ({ id, text: { en, hi } });
  NCA_T.register({
    id: 'sequence',
    css,
    validate,
    keys,
    demo: {
      cyclic: true,
      items: [
        S('sun', 'The Sun heats the water in seas, rivers and ponds', 'सूरज समुद्र, नदियों और तालाबों के पानी को गरम करता है'),
        S('evap', 'Water evaporates and rises as invisible vapour', 'पानी वाष्पित होकर अदृश्य भाप के रूप में ऊपर उठता है'),
        S('cond', 'High up, the cool vapour condenses into tiny droplets and forms clouds', 'ऊपर ठंडी भाप संघनित होकर बूँदों में बदलती है और बादल बनते हैं'),
        S('rain', 'Clouds give rain, hail or snow', 'बादलों से वर्षा, ओले या बर्फ़ गिरती है'),
        S('flow', 'Water flows into rivers, soaks into the ground and reaches the sea again', 'पानी नदियों में बहता है, ज़मीन में रिसता है और फिर समुद्र में पहुँचता है'),
      ],
    },
    mount,
  });
})();
