// Template: Sort it. Cards go into the right groups; every card explains itself. Tap a card, then tap a group (or drag a
// card onto a group with a mouse or pen, or use the keyboard). A right card stays in its group and shows why it belongs;
// a wrong card springs back with a gentle hint, and after two misses the reason is shown. Works for any subject: the
// lab supplies the groups and the cards, and this template checks the shape so that every card has exactly one group
// and every group has at least one card. Config:
//   { bins: [{ id, label: {en,hi} }] (2–5), cards: [{ id, text: {en,hi}, image?: asset id, bin: bin id, why: {en,hi} }] (4–16) }
(function () {
  const { esc, tx } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  // Group colours: fixed, with a shape mark as well so colour is never the only cue. Text colour follows the contract.
  const PAL = [
    { c: '#1D4ED8', t: '#FFFFFF', g: '●' },
    { c: '#0F766E', t: '#FFFFFF', g: '▲' },
    { c: '#8B3DFF', t: '#FFFFFF', g: '■' },
    { c: '#FF7A1A', t: '#1E293B', g: '◆' },
    { c: '#FF6B57', t: '#1E293B', g: '★' },
  ];
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const DEV = /[ऀ-ॿ]/;

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { bins, cards }'];
    Object.keys(c).forEach((k) => { if (k !== 'bins' && k !== 'cards') e.push('unknown key: ' + k + ' (use bins, cards)'); });
    const binIds = new Set();
    if (!Array.isArray(c.bins) || c.bins.length < 2 || c.bins.length > 5) e.push('bins: an array of 2 to 5 groups');
    else c.bins.forEach((b, i) => {
      const w = 'bins[' + i + ']';
      if (!b || typeof b !== 'object') { e.push(w + ': an object { id, label }'); return; }
      if (typeof b.id !== 'string' || !ID.test(b.id)) e.push(w + ': id must be letters, digits, - or _ (no spaces or colons)');
      else if (binIds.has(b.id)) e.push(w + ': duplicate bin id ' + b.id);
      else binIds.add(b.id);
      if (!isBi(b.label)) e.push(w + ': label needs both en and hi text');
      else {
        if (b.label.en.length > 40 || b.label.hi.length > 40) e.push(w + ': label is too long (40 characters at most)');
        if (!DEV.test(b.label.hi)) e.push(w + ': the hi label must be written in Devanagari');
      }
      Object.keys(b).forEach((k) => { if (k !== 'id' && k !== 'label') e.push(w + ': unknown key ' + k); });
    });
    if (!Array.isArray(c.cards) || c.cards.length < 4 || c.cards.length > 16) e.push('cards: an array of 4 to 16 cards');
    else {
      const ids = new Set(), texts = new Set(), used = new Set();
      c.cards.forEach((d, i) => {
        const w = 'cards[' + i + ']';
        if (!d || typeof d !== 'object') { e.push(w + ': an object { id, text, bin, why }'); return; }
        if (typeof d.id !== 'string' || !ID.test(d.id)) e.push(w + ': id must be letters, digits, - or _ (no spaces or colons)');
        else if (ids.has(d.id)) e.push(w + ': duplicate card id ' + d.id);
        else ids.add(d.id);
        if (!isBi(d.text)) e.push(w + ': text needs both en and hi');
        else {
          if (d.text.en.length > 60 || d.text.hi.length > 60) e.push(w + ': text is too long (60 characters at most)');
          if (!DEV.test(d.text.hi) && /[A-Za-z]/.test(d.text.en) && d.text.hi === d.text.en) { /* a name or symbol may be the same in both languages */ }
          const key = d.text.en.trim().toLowerCase();
          if (texts.has(key)) e.push(w + ': the same card text appears twice (' + d.text.en + ')');
          texts.add(key);
        }
        if (!isBi(d.why)) e.push(w + ': why needs both en and hi (the reason the card belongs in its group)');
        else if (d.why.en.length > 220 || d.why.hi.length > 260) e.push(w + ': why is too long for a child (220 characters in English at most)');
        if (typeof d.bin !== 'string' || !binIds.has(d.bin)) e.push(w + ': bin "' + d.bin + '" is not one of the bins');
        else used.add(d.bin);
        if (d.image != null && (typeof d.image !== 'string' || !ID.test(d.image))) e.push(w + ': image must be an asset id');
        Object.keys(d).forEach((k) => { if (!['id', 'text', 'image', 'bin', 'why'].includes(k)) e.push(w + ': unknown key ' + k); });
      });
      if (binIds.size) binIds.forEach((b) => { if (!used.has(b)) e.push('bin "' + b + '" has no card; every group needs at least one card'); });
    }
    return e;
  }

  function keys(c) {
    const bins = (c && Array.isArray(c.bins) ? c.bins : []).filter((b) => b && typeof b.id === 'string').map((b) => b.id);
    const cards = (c && Array.isArray(c.cards) ? c.cards : []).filter((d) => d && typeof d.id === 'string').map((d) => d.id);
    return {
      targets: cards.map((i) => 'card:' + i).concat(bins.map((i) => 'bin:' + i), ['check', 'reset']),
      events: cards.map((i) => 'placed:' + i).concat(cards.map((i) => 'correct:' + i), cards.map((i) => 'wrong:' + i), ['sorted']),
    };
  }

  const css = `
.so { --so-r: 16px; display: grid; gap: 12px; font-family: var(--font-body, system-ui, sans-serif); color: var(--ink); min-width: 0; }
.so * { box-sizing: border-box; }
.so-top { display: flex; align-items: center; gap: 12px; }
.so-prog { flex: 1; height: 12px; border-radius: 999px; background: var(--sunk); border: 1px solid var(--line); overflow: hidden; }
.so-prog > i { display: block; height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, #02CFF9, #14B8A6, #22C55E); transition: width .45s cubic-bezier(.3,1.3,.5,1); }
.so-count { font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; min-width: 4.2em; text-align: right; }
.so-hint { margin: 0; font-size: .95rem; color: var(--ink-2); }
.so-bins { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }
.so-bin { --c: #1D4ED8; --tc: #fff; border-radius: var(--so-r); border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 12%, var(--surface)); display: flex; flex-direction: column; min-height: 132px; overflow: hidden; box-shadow: 0 3px 0 color-mix(in srgb, var(--c) 55%, transparent), 0 8px 18px rgba(6,18,51,.10); transition: transform .18s, box-shadow .18s, background .18s; cursor: pointer; }
.so-bin-h { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 8px 12px; border: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 88%, #fff), var(--c)); color: var(--tc); font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; line-height: 1.2; text-align: left; cursor: pointer; }
.so-bin-h b { font-size: .9rem; opacity: .95; flex: none; }
.so-bin-h span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.so-bin-h em { font-style: normal; font-size: .85rem; background: rgba(255,255,255,.25); border-radius: 999px; padding: 2px 9px; flex: none; }
.so-bin-c { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; padding: 8px; flex: 1; }
.so-bin-e { margin: auto; font-size: .85rem; color: var(--ink-2); opacity: .8; padding: 6px; text-align: center; }
.so.so-pick .so-bin { animation: so-pulse 1.4s ease-in-out infinite; }
.so-bin.so-over { transform: translateY(-3px) scale(1.02); background: color-mix(in srgb, var(--c) 28%, var(--surface)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 35%, transparent), 0 10px 22px rgba(6,18,51,.18); animation: none; }
.so-bin-h:focus-visible, .so-card:focus-visible, .so-btn:focus-visible { outline: 3px solid var(--cyan, #02CFF9); outline-offset: 2px; }
.so-fb { min-height: 64px; border-radius: var(--so-r); padding: 10px 14px; background: var(--sunk); border: 1px solid var(--line); font-size: 1rem; line-height: 1.45; display: flex; gap: 10px; align-items: center; }
.so-fb-i { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1rem; background: var(--royal-t); color: var(--royal); }
.so-fb.so-good { background: var(--good-t); border-color: var(--good); } .so-fb.so-good .so-fb-i { background: var(--good); color: #fff; }
.so-fb.so-bad { background: var(--bad-t); border-color: var(--bad); } .so-fb.so-bad .so-fb-i { background: var(--bad); color: #fff; }
.so-fb.so-win { background: var(--sun-t); border-color: var(--sun); } .so-fb.so-win .so-fb-i { background: var(--sun); color: #1E293B; }
.so-fb-t { min-width: 0; overflow-wrap: anywhere; } .so-fb-t strong { font-family: var(--font-display, inherit); }
.so-tray-h { font-family: var(--font-display, inherit); font-weight: 700; margin: 0 0 6px; font-size: 1rem; color: var(--ink-2); }
.so-tray { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px; min-height: 76px; border-radius: var(--so-r); border: 2px dashed var(--line); background: var(--surface); }
.so-card { position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; max-width: 100%; padding: 8px 14px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-body, inherit); font-weight: 600; font-size: 1rem; line-height: 1.25; text-align: left; cursor: grab; touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: transform .15s, box-shadow .15s, border-color .15s; box-shadow: 0 4px 10px rgba(6,18,51,.10); }
.so-card:hover { transform: translateY(-2px); border-color: var(--royal); }
.so-card[aria-pressed="true"] { border-color: #FF7A1A; background: var(--sun-t); transform: translateY(-4px) rotate(-1.5deg); box-shadow: 0 0 0 3px rgba(255,122,26,.35), 0 10px 18px rgba(6,18,51,.18); }
.so-card.so-in { cursor: pointer; min-height: 44px; padding: 6px 12px; font-size: .95rem; box-shadow: none; border-color: var(--c); border-bottom-width: 3px; background: var(--surface); }
.so-card.so-in::before { content: '✓'; font-weight: 800; color: var(--c); }
.so-card.so-in:hover { transform: none; }
.so-card.so-in[aria-pressed="true"] { transform: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 40%, transparent); }
.so-card.so-shake { animation: so-shake .45s; border-color: var(--bad); }
.so-card.so-pop { animation: so-pop .45s cubic-bezier(.3,1.6,.5,1); }
.so-card.so-drag-src { opacity: .35; }
.so-card img, .so-mono { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; flex: none; }
.so-mono { display: grid; place-items: center; background: linear-gradient(135deg, #02CFF9, #14B8A6); color: #1E293B; font-weight: 800; font-family: var(--font-display, inherit); }
.so-ghost { position: fixed; z-index: 9999; pointer-events: none; transform: translate(-50%, -60%) rotate(-3deg) scale(1.06); opacity: .96; box-shadow: 0 16px 30px rgba(6,18,51,.35); }
.so-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.so-btn { min-height: 48px; min-width: 120px; padding: 10px 20px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; cursor: pointer; transition: transform .15s; }
.so-btn:hover { transform: translateY(-2px); }
.so-btn.so-main { background: linear-gradient(180deg, #2563EB, #1D4ED8); border-color: #1E3A8A; color: #fff; }
.so-done .so-tray { border-style: solid; border-color: var(--good); background: var(--good-t); }
.so-tray-ok { margin: auto; font-weight: 700; color: var(--good); font-family: var(--font-display, inherit); }
@keyframes so-pulse { 0%, 100% { box-shadow: 0 3px 0 color-mix(in srgb, var(--c) 55%, transparent), 0 8px 18px rgba(6,18,51,.10); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, transparent), 0 8px 18px rgba(6,18,51,.10); } }
@keyframes so-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(3px); } }
@keyframes so-pop { 0% { transform: scale(.7); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .so *, .so *::before { animation: none !important; transition: none !important; } }
@media (max-width: 420px) { .so-bins { grid-template-columns: repeat(2, minmax(0, 1fr)); }   .so-bin { min-height: 118px; } .so-bin:last-child:nth-child(odd) { grid-column: 1 / -1; } .so-btn { flex: 1; } }
`;

  function mount(root, config, api) {
    const bins = config.bins, cards = config.cards;
    const byCard = {}; cards.forEach((d) => { byCard[d.id] = d; });
    const byBin = {}; bins.forEach((b, i) => { byBin[b.id] = Object.assign({ pal: PAL[i] }, b); });
    // A fixed, scrambled order so the answer is not given away by the order in the config.
    let seed = 7; cards.forEach((d) => { for (let i = 0; i < d.id.length; i++) seed = (seed * 31 + d.id.charCodeAt(i)) >>> 0; });
    const order = cards.map((d) => d.id);
    for (let i = order.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); const t = order[i]; order[i] = order[j]; order[j] = t; }
    let st;
    const fresh = () => ({ placed: {}, wrongs: {}, sel: null, msg: null, done: false, shake: null, pop: null });
    st = fresh();
    let destroyed = false, drag = null, suppressClick = false, shakeTimer = 0;
    const T = (x) => api.t(x);
    const L = () => api.lang();
    const binLabel = (id) => tx(byBin[id].label, L());
    const left = () => cards.filter((d) => !st.placed[d.id]).length;
    const msgT = (en, hi) => api.t({ en, hi });

    function cardHTML(d) {
      const b = st.placed[d.id];
      const pal = b ? byBin[b].pal : null;
      const url = d.image ? api.asset(d.image) : null;
      const text = tx(d.text, L());
      const pic = url ? `<img src="${esc(url)}" alt="" draggable="false">` : d.image ? `<span class="so-mono" aria-hidden="true">${esc(text.trim().charAt(0))}</span>` : '';
      const cls = ['so-card', b ? 'so-in' : '', st.shake === d.id ? 'so-shake' : '', st.pop === d.id ? 'so-pop' : ''].filter(Boolean).join(' ');
      const label = b ? text + ', ' + msgT('in ' + binLabel(b), binLabel(b) + ' में') : text;
      return `<button type="button" class="${cls}" data-key="card:${esc(d.id)}" data-card="${esc(d.id)}" aria-pressed="${st.sel === d.id}" aria-label="${esc(label)}"${pal ? ` style="--c:${pal.c}"` : ''}>${pic}<span>${esc(text)}</span></button>`;
    }

    function render() {
      if (destroyed) return;
      const act = root.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      const total = cards.length, got = total - left();
      const selText = st.sel ? tx(byCard[st.sel].text, L()) : '';
      const binsHTML = bins.map((b) => {
        const p = byBin[b.id].pal;
        const inside = cards.filter((d) => st.placed[d.id] === b.id);
        const nm = tx(b.label, L());
        const aria = st.sel && !st.placed[st.sel] ? msgT('Put ' + selText + ' in ' + nm, selText + ' को ' + nm + ' में रखो') : nm + ', ' + msgT(inside.length + ' cards', inside.length + ' कार्ड');
        return `<section class="so-bin" data-bin="${esc(b.id)}" style="--c:${p.c};--tc:${p.t}"><button type="button" class="so-bin-h" data-key="bin:${esc(b.id)}" aria-label="${esc(aria)}"><b aria-hidden="true">${p.g}</b><span>${esc(nm)}</span>${inside.length ? `<em aria-hidden="true">${inside.length}</em>` : ''}</button><div class="so-bin-c">${inside.map(cardHTML).join('') || `<div class="so-bin-e">${esc(msgT('Drop cards here', 'कार्ड यहाँ रखो'))}</div>`}</div></section>`;
      }).join('');
      const tray = order.map((id) => byCard[id]).filter((d) => !st.placed[d.id]).map(cardHTML).join('') || `<div class="so-tray-ok">★ ${esc(msgT('Every card is sorted!', 'सारे कार्ड छँट गए!'))}</div>`;
      const m = st.msg;
      const hint = st.sel ? msgT('Now tap the group for "' + selText + '".', '"' + selText + '" के लिए अब सही समूह छुओ।') : msgT('Tap a card, then tap its group. With a mouse you can drag it too.', 'पहले कार्ड छुओ, फिर उसका समूह छुओ। माउस से खींच भी सकते हो।');
      const fbIcon = !m ? '?' : m.kind === 'good' ? '✓' : m.kind === 'bad' ? '✗' : m.kind === 'win' ? '★' : 'i';
      root.innerHTML = `<div class="so${st.sel ? ' so-pick' : ''}${st.done ? ' so-done' : ''}">
<div class="so-top"><div class="so-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${got}" aria-label="${esc(msgT('Cards sorted', 'छँटे हुए कार्ड'))}"><i style="width:${(100 * got) / total}%"></i></div><span class="so-count">${got} / ${total}</span></div>
<p class="so-hint">${esc(hint)}</p>
<div class="so-bins">${binsHTML}</div>
<div class="so-fb ${m ? 'so-' + m.kind : ''}" aria-live="polite" role="status"><span class="so-fb-i" aria-hidden="true">${fbIcon}</span><div class="so-fb-t">${m ? m.html : esc(msgT('Every card explains itself once it is in the right group.', 'सही समूह में जाते ही हर कार्ड अपना कारण बताता है।'))}</div></div>
<div><p class="so-tray-h">${esc(msgT('Cards to sort', 'छाँटने के कार्ड'))} (${left()})</p><div class="so-tray" data-tray>${tray}</div></div>
<div class="so-actions"><button type="button" class="so-btn so-main" data-key="check">${esc(msgT('Check', 'जाँचो'))}</button><button type="button" class="so-btn" data-key="reset">${esc(msgT('Start again', 'फिर से शुरू'))}</button></div>
</div>`;
      st.shake = null; st.pop = null;
      if (act) { const el = root.querySelector('[data-key="' + act.replace(/"/g, '\\"') + '"]'); if (el) el.focus({ preventScroll: true }); }
    }

    const fbWhy = (d, lead) => `<strong>${esc(lead)}</strong> ${esc(tx(d.why, L()))}`;

    function place(cardId, binId) {
      const d = byCard[cardId];
      if (!d || !byBin[binId] || st.placed[cardId]) return;
      if (!api.allowed('bin:' + binId)) { api.nudge('bin:' + binId); return; }
      api.emit('placed:' + cardId);
      const name = tx(d.text, L());
      if (d.bin === binId) {
        st.placed[cardId] = binId; st.sel = null; st.pop = cardId;
        st.msg = { kind: 'good', html: fbWhy(d, tx(d.text, L()) + ' → ' + binLabel(binId) + '.') };
        api.record(msgT(name + ' sorted into ' + binLabel(binId) + ' (correct)', name + ' को ' + binLabel(binId) + ' में रखा (सही)'));
        api.emit('correct:' + cardId);
        api.speak(tx(d.why, L()), L());
        if (!left()) finish();
      } else {
        st.wrongs[cardId] = (st.wrongs[cardId] || 0) + 1;
        st.shake = cardId;
        const lead = msgT('"' + name + '" does not go in ' + binLabel(binId) + '. Try another group.', '"' + name + '" ' + binLabel(binId) + ' में नहीं आता। दूसरा समूह आज़माओ।');
        st.msg = { kind: 'bad', html: st.wrongs[cardId] >= 2 ? `<strong>${esc(lead)}</strong> ${esc(msgT('Hint:', 'संकेत:'))} ${esc(tx(d.why, L()))}` : `<strong>${esc(lead)}</strong>` };
        api.record(msgT(name + ' tried in ' + binLabel(binId) + ' (wrong)', name + ' को ' + binLabel(binId) + ' में रखा (ग़लत)'));
        api.emit('wrong:' + cardId);
      }
      render();
    }

    function finish() {
      st.done = true;
      const first = cards.filter((d) => !st.wrongs[d.id]).length;
      st.msg = { kind: 'win', html: `<strong>${esc(msgT('All sorted!', 'सब छँट गया!'))}</strong> ${esc(msgT(first + ' of ' + cards.length + ' cards were right on the first try. Tap any card to read why it belongs.', cards.length + ' में से ' + first + ' कार्ड पहली बार में सही रहे। कारण पढ़ने के लिए किसी भी कार्ड को छुओ।'))}` };
      api.record(msgT('Sorted all ' + cards.length + ' cards; ' + first + ' right first time', 'सभी ' + cards.length + ' कार्ड छाँटे; ' + first + ' पहली बार में सही'));
      api.emit('sorted');
      api.celebrate();
    }

    function selectCard(id) {
      if (!api.allowed('card:' + id)) { api.nudge('card:' + id); return; }
      const d = byCard[id];
      if (st.placed[id]) { // a sorted card: read why again
        st.sel = null;
        st.msg = { kind: 'good', html: fbWhy(d, tx(d.text, L()) + ' → ' + binLabel(st.placed[id]) + '.') };
      } else st.sel = st.sel === id ? null : id;
      render();
    }

    function onClick(ev) {
      if (suppressClick) { suppressClick = false; return; }
      const cardEl = ev.target.closest('[data-card]');
      if (cardEl && root.contains(cardEl)) { selectCard(cardEl.getAttribute('data-card')); return; }
      const binEl = ev.target.closest('[data-bin]');
      if (binEl && root.contains(binEl)) {
        if (st.sel && !st.placed[st.sel]) place(st.sel, binEl.getAttribute('data-bin'));
        else { st.msg = { kind: 'info', html: esc(msgT('Pick a card from below first, then tap this group.', 'पहले नीचे से एक कार्ड चुनो, फिर इस समूह को छुओ।')) }; render(); }
        return;
      }
      const k = ev.target.closest('[data-key]');
      if (!k || !root.contains(k)) return;
      const key = k.getAttribute('data-key');
      if (key === 'check') {
        if (!api.allowed('check')) { api.nudge('check'); return; }
        const n = left();
        if (n) st.msg = { kind: 'info', html: esc(msgT(n + ' card' + (n === 1 ? '' : 's') + ' still to sort. Everything in the groups so far is correct.', n + ' कार्ड अभी छाँटने बाकी हैं। अब तक समूहों में जो भी है वह सही है।')) };
        else { finish(); return render(); }
        api.record(msgT('Pressed Check with ' + n + ' left', 'जाँचो दबाया, ' + n + ' बाकी'));
        render();
      } else if (key === 'reset') {
        if (!api.allowed('reset')) { api.nudge('reset'); return; }
        st = fresh();
        st.msg = { kind: 'info', html: esc(msgT('All cards are back. Sort them again!', 'सब कार्ड वापस आ गए। फिर से छाँटो!')) };
        api.record(msgT('Started again', 'फिर से शुरू किया'));
        render();
      }
    }

    // Drag with a mouse or pen; touch uses tap-then-tap so that the page still scrolls.
    function binAt(x, y) { const el = document.elementFromPoint(x, y); const b = el && el.closest && el.closest('[data-bin]'); return b && root.contains(b) ? b : null; }
    function onDown(ev) {
      if (ev.pointerType === 'touch' || ev.button > 0) return;
      const el = ev.target.closest('[data-card]');
      if (!el || !root.contains(el) || st.placed[el.getAttribute('data-card')]) return;
      drag = { id: el.getAttribute('data-card'), el, x: ev.clientX, y: ev.clientY, on: false, ghost: null, over: null };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
    function onMove(ev) {
      if (!drag) return;
      if (!drag.on) {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 7) return;
        if (!api.allowed('card:' + drag.id)) { api.nudge('card:' + drag.id); endDrag(); return; }
        drag.on = true;
        drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('so-ghost'); drag.ghost.removeAttribute('data-key'); drag.ghost.removeAttribute('data-card');
        drag.ghost.style.width = drag.el.offsetWidth + 'px';
        document.body.appendChild(drag.ghost); drag.el.classList.add('so-drag-src');
        st.sel = drag.id; root.firstElementChild.classList.add('so-pick');
      }
      drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
      const b = binAt(ev.clientX, ev.clientY);
      if (b !== drag.over) { if (drag.over) drag.over.classList.remove('so-over'); if (b) b.classList.add('so-over'); drag.over = b; }
    }
    function onUp(ev) {
      if (!drag) return;
      const d = drag;
      endDrag();
      if (d.on) {
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
        const b = binAt(ev.clientX, ev.clientY);
        if (b) place(d.id, b.getAttribute('data-bin')); else { st.sel = d.id; render(); }
      }
    }
    function endDrag() {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.over) drag.over.classList.remove('so-over'); if (drag.el) drag.el.classList.remove('so-drag-src'); }
      drag = null;
    }

    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('dragstart', (e) => e.preventDefault());
    render();
    return {
      destroy() { destroyed = true; endDrag(); clearTimeout(shakeTimer); root.removeEventListener('click', onClick); root.removeEventListener('pointerdown', onDown); root.innerHTML = ''; },
    };
  }

  const B = (id, en, hi) => ({ id, label: { en, hi } });
  const C = (id, bin, en, hi, wen, whi) => ({ id, bin, text: { en, hi }, why: { en: wen, hi: whi } });
  NCA_T.register({
    id: 'sort',
    css,
    validate,
    keys,
    demo: {
      bins: [B('herb', 'Herbivores', 'शाकाहारी'), B('carn', 'Carnivores', 'माँसाहारी'), B('omni', 'Omnivores', 'सर्वाहारी')],
      cards: [
        C('cow', 'herb', 'Cow', 'गाय', 'A cow eats only grass, hay and other plants.', 'गाय केवल घास, भूसा और दूसरे पौधे खाती है।'),
        C('goat', 'herb', 'Goat', 'बकरी', 'A goat eats leaves, grass and shoots. It eats no meat.', 'बकरी पत्ते, घास और कोंपलें खाती है। वह माँस नहीं खाती।'),
        C('elephant', 'herb', 'Elephant', 'हाथी', 'An elephant eats leaves, bark, grass and fruit, all plant food.', 'हाथी पत्ते, छाल, घास और फल खाता है, यानी केवल पौधों से मिला भोजन।'),
        C('deer', 'herb', 'Deer', 'हिरन', 'A deer grazes on grass and leaves.', 'हिरन घास और पत्ते चरता है।'),
        C('lion', 'carn', 'Lion', 'शेर', 'A lion hunts other animals and eats their meat.', 'शेर दूसरे जानवरों का शिकार करके उनका माँस खाता है।'),
        C('tiger', 'carn', 'Tiger', 'बाघ', 'A tiger hunts deer and other animals for meat.', 'बाघ हिरन जैसे जानवरों का शिकार करके माँस खाता है।'),
        C('eagle', 'carn', 'Eagle', 'चील', 'An eagle catches small animals such as snakes and rats.', 'चील साँप और चूहे जैसे छोटे जानवरों को पकड़कर खाती है।'),
        C('crocodile', 'carn', 'Crocodile', 'मगरमच्छ', 'A crocodile eats fish and other animals it catches.', 'मगरमच्छ मछलियाँ और दूसरे पकड़े हुए जानवर खाता है।'),
        C('crow', 'omni', 'Crow', 'कौआ', 'A crow eats grains and fruit, and also insects and scraps of meat.', 'कौआ अनाज और फल खाता है, और कीड़े तथा माँस के टुकड़े भी।'),
        C('bear', 'omni', 'Brown bear', 'भूरा भालू', 'A brown bear eats berries and roots, and also fish and insects.', 'भूरा भालू बेर और जड़ें खाता है, और मछली व कीड़े भी।'),
        C('pig', 'omni', 'Pig', 'सूअर', 'A pig eats roots and grain, and also worms and small animals.', 'सूअर जड़ें और अनाज खाता है, और केंचुए व छोटे जानवर भी।'),
        C('rat', 'omni', 'Rat', 'चूहा', 'A rat eats grain and vegetables, and also insects and eggs.', 'चूहा अनाज और सब्ज़ियाँ खाता है, और कीड़े तथा अंडे भी।'),
      ],
    },
    mount,
  });
})();
