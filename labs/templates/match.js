// Template: Match pairs. The child joins each term to its partner: a word and its meaning, a picture and its name,
// a cause and its effect. Tap one card on the left and its partner on the right (either order, mouse, touch or
// keyboard). A right pair is locked at once in its own colour (with the reason, if the lab gives one); a wrong pair
// shakes gently and nothing is lost. "Check" tells the child how many are done and nudges one that is still open.
// The right-hand column is shuffled by code (never in the same order as the left), so a lab cannot give the answer away.
// Config: { pairs: [{ id, left: {en,hi}, right: {en,hi}, why?: {en,hi}, image?: asset id }] (3-10),
//           style?: 'lines' (partners stay in place and are joined by coloured lines) | 'cards' (a matched pair
//           joins up into one card in the "matched" tray) }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const STYLES = ['lines', 'cards'];
  const KEYS = ['pairs', 'style'];
  // Logo colours for matched pairs (border and line); the card fill is a light tint of the same colour.
  const PAL = ['#1D4ED8', '#8B3DFF', '#0F766E', '#FF7A1A', '#FF6B57', '#14B8A6', '#F5B90A', '#22C55E', '#2563EB', '#4400F0'];
  const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
  const isText = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

  // A deterministic shuffle (so a lab always looks the same), with no card left opposite its own partner.
  function order(n, seed) {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < n; i++) if (p[i] === i) { const j = (i + 1) % n; [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < n; i++) if (p[i] === i) { const j = (i + 2) % n; [p[i], p[j]] = [p[j], p[i]]; }
    return p;
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  const CSS = `
.mt{--mt-c:#0E7490;font-family:var(--font-body);color:var(--ink);padding:0 0 4px;max-width:980px;margin:0 auto}
.mt *{box-sizing:border-box}
.mt-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:18px;color:#fff;background:linear-gradient(120deg,#0E7490 0%,#1D4ED8 60%,#8B3DFF 120%);box-shadow:0 6px 18px rgba(14,116,144,.28)}
.mt-head p{margin:0;flex:1 1 220px;font-size:clamp(15px,3.9vw,17px);line-height:1.35;font-weight:600}
.mt-prog{display:flex;align-items:center;gap:8px;font-family:var(--font-display);font-weight:700;font-size:16px;white-space:nowrap}
.mt-bar{width:84px;height:10px;border-radius:99px;background:rgba(255,255,255,.28);overflow:hidden}
.mt-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#FFD23F,#22C55E);transition:width .5s cubic-bezier(.3,.8,.3,1)}
.mt-tray{display:flex;flex-direction:column;gap:8px;margin:12px 0 0}
.mt-tray:empty{display:none}
.mt-chip{display:flex;align-items:stretch;border-radius:16px;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 14%,var(--surface));overflow:hidden;box-shadow:0 3px 10px rgba(6,18,51,.12)}
.mt-chip>span{flex:1 1 0;padding:9px 12px;font-size:clamp(15px,3.8vw,17px);line-height:1.3;font-weight:600;display:flex;align-items:center;min-width:0;overflow-wrap:anywhere}
.mt-chip>b{flex:0 0 auto;display:grid;place-items:center;width:34px;background:var(--c);color:#fff;font-size:18px}
.mt-chip.fresh{animation:mt-pop .55s cubic-bezier(.3,1.4,.5,1)}
.mt-board{position:relative;display:grid;grid-template-columns:1fr 84px 1fr;margin:14px 0 0;align-items:start}
.mt-s-cards .mt-board{grid-template-columns:1fr 1fr;column-gap:14px}
.mt-narrow .mt-board{grid-template-columns:1fr 34px 1fr}
.mt-narrow.mt-s-cards .mt-board{grid-template-columns:1fr 1fr;column-gap:10px}
.mt-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.mt-col.r{grid-column:3}
.mt-s-cards .mt-col.r{grid-column:2}
.mt-narrow .mt-col{gap:10px}
.mt-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1}
.mt-lines path{fill:none;stroke-width:5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:0;filter:drop-shadow(0 2px 2px rgba(6,18,51,.22))}
.mt-lines path.fresh{animation:mt-draw .6s ease-out}
.mt-card{position:relative;z-index:2;display:flex;align-items:center;gap:10px;width:100%;min-height:58px;padding:9px 14px;text-align:start;font:inherit;font-weight:600;font-size:clamp(15px,3.9vw,17px);line-height:1.3;color:var(--ink);cursor:pointer;
  background:var(--surface);border:2px solid var(--line);border-inline-start-width:7px;border-radius:16px;box-shadow:0 2px 6px rgba(6,18,51,.1);transition:transform .18s cubic-bezier(.3,1.3,.5,1),box-shadow .18s,border-color .18s,background .18s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.mt-card.l{border-inline-start-color:#0E7490}
.mt-card.r{border-inline-start-color:#8B3DFF}
.mt-card .tx{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.mt-card .dot{flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:3px solid var(--line);background:var(--surface);position:absolute;top:50%;margin-top:-7px}
.mt-card.l .dot{inset-inline-end:-9px}
.mt-card.r .dot{inset-inline-start:-9px}
.mt-card:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(6,18,51,.16)}
.mt-card:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:3px}
.mt-card.sel{transform:translateY(-3px) scale(1.025);border-color:var(--royal,#1D4ED8);background:color-mix(in srgb,#2563EB 13%,var(--surface));box-shadow:0 0 0 4px rgba(37,99,235,.28),0 8px 18px rgba(6,18,51,.2)}
.mt-card.sel .dot{background:#2563EB;border-color:#fff}
.mt-card.done{cursor:default;border-color:var(--c);border-inline-start-color:var(--c);background:color-mix(in srgb,var(--c) 15%,var(--surface));box-shadow:0 2px 8px rgba(6,18,51,.12)}
.mt-card.done:hover{transform:none}
.mt-card.done .dot{background:var(--c);border-color:#fff}
.mt-card.fresh{animation:mt-pop .55s cubic-bezier(.3,1.4,.5,1)}
.mt-card.bad{animation:mt-shake .45s;border-color:var(--bad,#C2410C);background:color-mix(in srgb,#FF6B57 18%,var(--surface))}
.mt-card.hint{animation:mt-hint 1.1s ease-in-out 2}
.mt-card.gone{display:none}
.mt-card.leaving{animation:mt-leave .35s ease-in forwards}
.mt-card .tick{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-size:14px;font-weight:800}
.mt-pic{flex:0 0 auto;width:44px;height:44px;border-radius:12px;object-fit:cover;background:color-mix(in srgb,var(--mt-c) 14%,var(--surface));display:grid;place-items:center;overflow:hidden}
.mt-pic svg{width:30px;height:30px}
.mt-say{margin:14px 0 0;display:flex;align-items:flex-start;gap:10px;padding:11px 14px;border-radius:16px;border:2px solid var(--line);background:var(--sunk);font-size:clamp(15px,3.8vw,17px);line-height:1.4;min-height:56px}
.mt-say .ic{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:#0E7490}
.mt-say.ok{border-color:var(--c);background:color-mix(in srgb,var(--c) 12%,var(--surface))}
.mt-say.ok .ic{background:var(--c)}
.mt-say.no{border-color:#FF6B57}
.mt-say.no .ic{background:#C2410C}
.mt-say.all{border-color:#22C55E;background:color-mix(in srgb,#22C55E 14%,var(--surface))}
.mt-say.all .ic{background:#0F766E}
.mt-say p{margin:0;flex:1;min-width:0}
.mt-say b{font-family:var(--font-display)}
.mt-actions{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 0}
.mt-btn{min-height:46px;padding:0 20px;border-radius:99px;font:inherit;font-family:var(--font-display);font-weight:700;font-size:16px;cursor:pointer;border:2px solid var(--mt-c);background:var(--mt-c);color:#fff;transition:transform .15s,box-shadow .15s}
.mt-btn:hover{transform:translateY(-1px);box-shadow:0 5px 12px rgba(14,116,144,.3)}
.mt-btn.ghost{background:transparent;color:var(--ink)}
.mt-btn:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:3px}
.mt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes mt-pop{0%{transform:scale(.92)}55%{transform:scale(1.05)}100%{transform:scale(1)}}
@keyframes mt-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes mt-hint{0%,100%{box-shadow:0 2px 6px rgba(6,18,51,.1)}50%{box-shadow:0 0 0 5px rgba(245,185,10,.7)}}
@keyframes mt-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes mt-leave{to{opacity:0;transform:scale(.85)}}
@media (prefers-reduced-motion:reduce){.mt *{animation:none!important;transition:none!important}}
`;

  const PICICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="5" fill="#CFE9F1" stroke="#0E7490" stroke-width="2"/><circle cx="11" cy="12" r="3" fill="#FFD23F"/><path d="M4 24l8-8 5 5 4-4 7 7" fill="#14B8A6" stroke="#0E7490" stroke-width="2" stroke-linejoin="round"/></svg>';

  function mount(root, config, api) {
    const pairs = config.pairs;
    const style = config.style || 'lines';
    const n = pairs.length;
    const byId = Object.fromEntries(pairs.map((p) => [p.id, p]));
    const S = { selL: null, selR: null, matched: {}, seq: [], mist: 0, round: 0, fresh: null, say: null, perm: null, hint: null, bad: [] };
    const timers = [];
    let ro = null, finished = false, focusKey = null;
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const seedBase = hash(pairs.map((p) => p.id).join('|'));
    S.perm = order(n, seedBase);
    const colourOf = (id) => PAL[S.matched[id] % PAL.length];
    const A = (en, hi) => api.t(T2(en, hi));

    root.innerHTML = `<div class="mt mt-s-${style}">
      <div class="mt-head"><p class="mt-ins"></p><div class="mt-prog"><span class="mt-count"></span><span class="mt-bar" aria-hidden="true"><i></i></span></div></div>
      <div class="mt-tray" role="list"></div>
      <div class="mt-board"><svg class="mt-lines" aria-hidden="true" preserveAspectRatio="none"></svg><div class="mt-col l" role="group"></div><div class="mt-col r" role="group"></div></div>
      <div class="mt-say" aria-live="polite"><span class="ic" aria-hidden="true">i</span><p></p></div>
      <div class="mt-actions"><button type="button" class="mt-btn" data-key="check"></button><button type="button" class="mt-btn ghost" data-key="reset"></button></div>
    </div>`;
    const el = root.querySelector('.mt');
    const board = el.querySelector('.mt-board');
    const colL = el.querySelector('.mt-col.l'), colR = el.querySelector('.mt-col.r');
    const lines = el.querySelector('.mt-lines');
    const tray = el.querySelector('.mt-tray');
    const say = el.querySelector('.mt-say');

    const total = () => Object.keys(S.matched).length;
    const insText = () => (style === 'lines'
      ? A('Tap a card on the left, then its partner on the right. A coloured line joins each pair.', 'बाईं ओर का कार्ड छुओ, फिर दाईं ओर उसका जोड़ीदार। हर जोड़ी को रंगीन रेखा जोड़ती है।')
      : A('Tap a card on the left, then its partner on the right. Matched pairs join into one card.', 'बाईं ओर का कार्ड छुओ, फिर दाईं ओर उसका जोड़ीदार। मिली जोड़ियाँ एक कार्ड बन जाती हैं।'));

    function cardHTML(p, side) {
      const id = p.id, m = S.matched[id] != null;
      const txt = api.t(side === 'l' ? p.left : p.right);
      let pic = '';
      if (side === 'l' && p.image) {
        const url = api.asset ? api.asset(p.image) : null;
        pic = url ? `<img class="mt-pic" src="${esc(url)}" alt="" loading="lazy">` : `<span class="mt-pic" aria-hidden="true">${PICICON}</span>`;
      }
      const cls = ['mt-card', side, m ? 'done' : '', S[side === 'l' ? 'selL' : 'selR'] === id ? 'sel' : '', S.fresh === id && m ? 'fresh' : ''].filter(Boolean).join(' ');
      const gone = style === 'cards' && m && S.fresh !== id ? ' gone' : '';
      const sideName = side === 'l' ? A('left', 'बायाँ') : A('right', 'दायाँ');
      const state = m ? A(', matched', ', जोड़ी मिल गई') : '';
      return `<button type="button" class="${cls}${gone}" data-key="${side === 'l' ? 'left' : 'right'}:${esc(id)}" data-id="${esc(id)}" data-side="${side}" aria-pressed="${S[side === 'l' ? 'selL' : 'selR'] === id}" aria-label="${esc(txt + ' (' + sideName + ')' + state)}"${m ? ` style="--c:${colourOf(id)}"` : ''}>${pic}<span class="tx" lang="${api.lang ? api.lang() : 'en'}">${esc(txt)}</span>${m ? '<span class="tick" aria-hidden="true">\u2713</span>' : '<span class="dot" aria-hidden="true"></span>'}</button>`;
    }

    function render() {
      const lang = api.lang ? api.lang() : 'en';
      el.querySelector('.mt-ins').textContent = insText();
      el.querySelector('.mt-count').textContent = `${total()} / ${n}`;
      el.querySelector('.mt-bar i').style.width = (total() / n) * 100 + '%';
      el.querySelector('[data-key="check"]').textContent = A('Check', 'जाँचो');
      el.querySelector('[data-key="reset"]').textContent = A('Start again', 'फिर से शुरू करो');
      colL.setAttribute('aria-label', A('Left cards', 'बाएँ कार्ड'));
      colR.setAttribute('aria-label', A('Right cards', 'दाएँ कार्ड'));
      colL.innerHTML = pairs.map((p) => cardHTML(p, 'l')).join('');
      colR.innerHTML = S.perm.map((i) => cardHTML(pairs[i], 'r')).join('');
      if (style === 'cards') {
        tray.setAttribute('aria-label', A('Matched pairs', 'मिली हुई जोड़ियाँ'));
        tray.innerHTML = S.seq.map((id) => {
          const p = byId[id];
          return `<div class="mt-chip ${S.fresh === id ? 'fresh' : ''}" role="listitem" style="--c:${colourOf(id)}"><span lang="${lang}">${esc(api.t(p.left))}</span><b aria-hidden="true">\u21C4</b><span lang="${lang}">${esc(api.t(p.right))}</span></div>`;
        }).join('');
      }
      const sayBox = S.say || { cls: '', ic: 'i', html: esc(A('Pick any card to begin.', 'कोई भी कार्ड छुओ और शुरू करो।')) };
      say.className = 'mt-say ' + (sayBox.cls || '');
      if (sayBox.c) say.style.setProperty('--c', sayBox.c); else say.style.removeProperty('--c');
      say.querySelector('.ic').textContent = sayBox.ic;
      say.querySelector('p').innerHTML = sayBox.html;
      drawLines();
      if (focusKey) { const f = root.querySelector(`[data-key="${focusKey}"]`); if (f && !f.classList.contains('gone')) f.focus({ preventScroll: true }); focusKey = null; }
    }

    function drawLines() {
      if (style !== 'lines') { lines.innerHTML = ''; return; }
      const W = board.clientWidth, H = board.clientHeight;
      lines.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const b = board.getBoundingClientRect();
      lines.innerHTML = S.seq.map((id) => {
        const a = colL.querySelector(`[data-id="${CSS_ESC(id)}"]`), c = colR.querySelector(`[data-id="${CSS_ESC(id)}"]`);
        if (!a || !c) return '';
        const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
        const x1 = ra.right - b.left, y1 = ra.top + ra.height / 2 - b.top, x2 = rc.left - b.left, y2 = rc.top + rc.height / 2 - b.top;
        const dx = (x2 - x1) * 0.55;
        return `<path pathLength="1" class="${S.fresh === id ? 'fresh' : ''}" stroke="${colourOf(id)}" d="M${x1} ${y1} C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}"/>`;
      }).join('');
    }
    const CSS_ESC = (s) => String(s).replace(/["\\]/g, '\\$&');

    function setSay(kind, ic, html, c) { S.say = { cls: kind, ic, html, c }; }

    function match(id) {
      const p = byId[id];
      S.matched[id] = S.seq.length;
      S.seq.push(id);
      S.selL = S.selR = null;
      S.fresh = id;
      const c = colourOf(id);
      const why = p.why ? api.t(p.why) : `${api.t(p.left)} \u2194 ${api.t(p.right)}`;
      const done = total() === n;
      setSay(done ? 'all' : 'ok', done ? '\u2605' : '\u2713', `<b>${esc(A('Yes!', 'सही!'))}</b> ${esc(why)}${done ? `<br><b>${esc(A('All pairs matched!', 'सारी जोड़ियाँ मिल गईं!'))}</b> ${esc(S.mist ? A(`You found them all with ${S.mist} wrong ${S.mist === 1 ? 'try' : 'tries'} on the way.`, `तुमने सब मिला लीं, रास्ते में ${S.mist} ग़लत कोशिश${S.mist === 1 ? '' : 'एँ'} हुईं।`) : A('Not a single wrong try. Brilliant!', 'एक भी ग़लत कोशिश नहीं। शानदार!'))}` : ''}`, c);
      if (style === 'cards') {
        focusKey = null;
        const nextL = pairs.find((q) => S.matched[q.id] == null);
        if (nextL) focusKey = 'left:' + nextL.id;
      }
      render();
      api.record(A('Matched: ', 'जोड़ी मिलाई: ') + api.t(p.left) + ' \u2194 ' + api.t(p.right));
      api.emit('matched:' + id);
      if (style === 'cards') {
        // The matched cards fade out, then leave the columns.
        const sel = `[data-id="${CSS_ESC(id)}"]`;
        root.querySelectorAll(sel).forEach((cd) => { if (cd.classList.contains('mt-card')) cd.classList.add('leaving'); });
        later(() => { root.querySelectorAll(`.mt-card${sel}`).forEach((cd) => cd.classList.add('gone')); }, 360);
      }
      if (done) {
        finished = true;
        api.emit('all-matched');
        api.celebrate();
        api.speak(A('All pairs matched!', 'सारी जोड़ियाँ मिल गईं!'));
      }
      later(() => { if (S.fresh === id) S.fresh = null; }, 700);
    }

    function mismatch(l, r) {
      S.mist++;
      const bad = [`left:${l}`, `right:${r}`];
      S.selL = S.selR = null;
      setSay('no', '!', `<b>${esc(A('Not a pair.', 'यह जोड़ी नहीं है।'))}</b> ${esc(A('Look again and try another partner.', 'ध्यान से देखो और दूसरा जोड़ीदार चुनो।'))}`);
      render();
      bad.forEach((k) => { const c = root.querySelector(`[data-key="${CSS_ESC(k)}"]`); if (c) c.classList.add('bad'); });
      later(() => bad.forEach((k) => { const c = root.querySelector(`[data-key="${CSS_ESC(k)}"]`); if (c) c.classList.remove('bad'); }), 520);
      api.record(A('Tried a wrong pair: ', 'ग़लत जोड़ी चुनी: ') + api.t(byId[l].left) + ' / ' + api.t(byId[r].right));
      api.emit('mismatch');
    }

    function syncSel() {
      root.querySelectorAll('.mt-card').forEach((c) => {
        const on = (c.dataset.side === 'l' ? S.selL : S.selR) === c.dataset.id && S.matched[c.dataset.id] == null;
        c.classList.toggle('sel', on);
        c.setAttribute('aria-pressed', String(on));
      });
    }

    function onClick(e) {
      const b = e.target.closest('[data-key]');
      if (!b || !root.contains(b) || b.disabled) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'check') {
        const left = n - total();
        if (!left) {
          setSay('all', '\u2605', `<b>${esc(A('Everything matches!', 'सब कुछ मिल गया!'))}</b>`);
          render();
          api.emit('all-matched');
        } else {
          const first = pairs.find((q) => S.matched[q.id] == null);
          setSay('', 'i', `<b>${esc(A(`${total()} of ${n} matched.`, `${n} में से ${total()} जोड़ियाँ मिलीं।`))}</b> ${esc(A(`${left} still to go. The glowing card is a good one to start with.`, `${left} बाकी हैं। जो कार्ड चमक रहा है, उससे शुरू करो।`))}`);
          render();
          const c = root.querySelector(`[data-key="left:${CSS_ESC(first.id)}"]`);
          if (c) { c.classList.add('hint'); later(() => c.classList.remove('hint'), 2400); }
        }
        api.record(A('Pressed Check: ', 'जाँचो दबाया: ') + total() + '/' + n);
        return;
      }
      if (key === 'reset') {
        S.matched = {}; S.seq = []; S.selL = S.selR = null; S.mist = 0; S.fresh = null; S.say = null; finished = false;
        S.round++;
        S.perm = order(n, seedBase + S.round * 7919);
        render();
        api.record(A('Started again', 'फिर से शुरू किया'));
        return;
      }
      const side = key.startsWith('left:') ? 'l' : key.startsWith('right:') ? 'r' : null;
      if (!side) return;
      const id = b.dataset.id;
      if (S.matched[id] != null) {
        const p = byId[id];
        setSay('ok', '\u2713', esc(p.why ? api.t(p.why) : `${api.t(p.left)} \u2194 ${api.t(p.right)}`), colourOf(id));
        render();
        return;
      }
      const k = side === 'l' ? 'selL' : 'selR';
      if (S[k] === id) { S[k] = null; syncSel(); return; }
      S[k] = id;
      syncSel();
      api.speak(api.t(side === 'l' ? byId[id].left : byId[id].right));
      if (S.selL && S.selR) {
        if (S.selL === S.selR) match(S.selL);
        else mismatch(S.selL, S.selR);
      } else {
        setSay('', 'i', esc(side === 'l' ? A('Now tap its partner on the right.', 'अब दाईं ओर उसका जोड़ीदार छुओ।') : A('Now tap its partner on the left.', 'अब बाईं ओर उसका जोड़ीदार छुओ।')));
        say.className = 'mt-say';
        say.querySelector('.ic').textContent = 'i';
        say.querySelector('p').innerHTML = S.say.html;
      }
    }
    root.addEventListener('click', onClick);

    const fit = () => { const w = root.clientWidth || 800; const nw = w < 560; if (el.classList.contains('mt-narrow') !== nw) { el.classList.toggle('mt-narrow', nw); } drawLines(); };
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(fit); ro.observe(root); }
    el.classList.toggle('mt-narrow', (root.clientWidth || 800) < 560);
    render();
    root.addEventListener('load', drawLines, true);

    return { destroy() { timers.forEach(clearTimeout); if (ro) ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('load', drawLines, true); } };
  }

  NCA_T.register({
    id: 'match',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!KEYS.includes(k)) e.push('unknown key: ' + k); });
      if (c.style != null && !STYLES.includes(c.style)) e.push("style: 'lines' or 'cards'");
      if (!Array.isArray(c.pairs) || c.pairs.length < 3 || c.pairs.length > 10) { e.push('pairs: 3 to 10 pairs'); return e; }
      const ids = new Set(), lefts = new Set(), rights = new Set(), all = [];
      c.pairs.forEach((p, i) => {
        const w = `pairs[${i}]`;
        if (!p || typeof p !== 'object') { e.push(w + ': must be an object'); return; }
        Object.keys(p).forEach((k) => { if (!['id', 'left', 'right', 'why', 'image'].includes(k)) e.push(`${w}: unknown key ${k}`); });
        if (typeof p.id !== 'string' || !ID_RE.test(p.id)) e.push(`${w}.id: letters, digits, - and _ only (1 to 32)`);
        else if (ids.has(p.id)) e.push(`${w}.id: duplicate id ${p.id}`);
        else ids.add(p.id);
        ['left', 'right'].forEach((s) => {
          if (!isText(p[s])) e.push(`${w}.${s}: needs {en, hi}, both non-empty`);
          else if (p[s].en.length > 100 || p[s].hi.length > 100) e.push(`${w}.${s}: at most 100 characters`);
        });
        if (p.why != null) { if (!isText(p.why)) e.push(`${w}.why: needs {en, hi}, both non-empty`); else if (p.why.en.length > 220 || p.why.hi.length > 220) e.push(`${w}.why: at most 220 characters`); }
        if (p.image != null && (typeof p.image !== 'string' || !ID_RE.test(p.image))) e.push(`${w}.image: an asset id (letters, digits, - and _)`);
        if (isText(p.left) && isText(p.right)) {
          const l = norm(p.left.en) + '|' + norm(p.left.hi), r = norm(p.right.en) + '|' + norm(p.right.hi);
          if (lefts.has(l)) e.push(`${w}.left: the same left text appears twice`);
          if (rights.has(r)) e.push(`${w}.right: the same right text appears twice (a card must have exactly one partner)`);
          if (l === r) e.push(`${w}: left and right are the same text`);
          lefts.add(l); rights.add(r); all.push([l, r, i]);
        }
      });
      all.forEach(([l, , i]) => { all.forEach(([, r, j]) => { if (i !== j && l === r) e.push(`pairs[${i}].left equals pairs[${j}].right: the child could not tell which is which`); }); });
      return e;
    },
    keys(c) {
      const ids = ((c && Array.isArray(c.pairs) && c.pairs) || []).map((p) => p && p.id).filter((x) => typeof x === 'string');
      return {
        targets: ids.map((id) => 'left:' + id).concat(ids.map((id) => 'right:' + id), ['check', 'reset']),
        events: ids.map((id) => 'matched:' + id).concat(['mismatch', 'all-matched']),
      };
    },
    demo: {
      style: 'lines',
      pairs: [
        { id: 'root', left: T2('Root', 'जड़'), right: T2('Takes in water and minerals from the soil', 'मिट्टी से पानी और खनिज सोखती है'), why: T2('Roots hold the plant in the soil and take in water and minerals.', 'जड़ें पौधे को मिट्टी में थामती हैं और पानी व खनिज सोखती हैं।') },
        { id: 'stem', left: T2('Stem', 'तना'), right: T2('Carries water and food to every part', 'पानी और भोजन को हर भाग तक पहुँचाता है'), why: T2('The stem holds the plant up and carries water and food up and down.', 'तना पौधे को सीधा रखता है और पानी व भोजन को ऊपर-नीचे पहुँचाता है।') },
        { id: 'leaf', left: T2('Leaf', 'पत्ती'), right: T2('Makes food using sunlight', 'सूर्य के प्रकाश से भोजन बनाती है'), why: T2('Leaves make food by photosynthesis, using sunlight, water and carbon dioxide.', 'पत्तियाँ सूर्य के प्रकाश, पानी और कार्बन डाइऑक्साइड से प्रकाश-संश्लेषण द्वारा भोजन बनाती हैं।') },
        { id: 'flower', left: T2('Flower', 'फूल'), right: T2('Makes seeds for new plants', 'नए पौधों के लिए बीज बनाता है'), why: T2('The flower is the part of the plant that makes fruits and seeds.', 'फूल पौधे का वह भाग है जिससे फल और बीज बनते हैं।') },
        { id: 'fruit', left: T2('Fruit', 'फल'), right: T2('Protects the seeds inside it', 'अंदर के बीजों की रक्षा करता है'), why: T2('A fruit grows from the flower and keeps the seeds safe until they are ready to grow.', 'फल फूल से बनता है और बीजों को सुरक्षित रखता है।') },
      ],
    },
    mount,
  });
})();
