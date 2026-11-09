// Template: Light scattering. Two modes.
//  tyndall: a dark room, a glass of liquid and a torch. The child picks a liquid and switches the torch on; in a true
//    solution the beam's path stays invisible, in a colloid or suspension tiny particles scatter light sideways and the
//    path glows (the Tyndall effect). Particle size decides it, not colour.
//  sky: the Sun moves from noon to sunset; the light's path through the air gets longer, blue is scattered away on the
//    way, and the Sun and sky near it turn orange-red, while the sky overhead at noon looks blue.
// Config: { mode: 'tyndall', liquids?: [id] (2–6 of water, salt, sugar, copper-sulphate, milk, soap, starch, muddy) }
//       | { mode: 'sky' }
(function () {
  const { esc } = window.NCA_LIB;
  const LIQ = {
    water: { en: 'Pure water', hi: 'साफ़ पानी', kind: 'solution', tint: '#E3EEF9', size: { en: 'no particles big enough', hi: 'कोई बड़े कण नहीं' } },
    salt: { en: 'Salt solution', hi: 'नमक का घोल', kind: 'solution', tint: '#E3EEF9', size: { en: 'ions far smaller than light’s wavelength', hi: 'आयन, प्रकाश की तरंगदैर्घ्य से बहुत छोटे' } },
    sugar: { en: 'Sugar solution', hi: 'चीनी का घोल', kind: 'solution', tint: '#EEF2F7', size: { en: 'single molecules, too small', hi: 'अकेले अणु, बहुत छोटे' } },
    'copper-sulphate': { en: 'Copper sulphate solution', hi: 'कॉपर सल्फ़ेट का घोल', kind: 'solution', tint: '#9CC7EE', size: { en: 'coloured, but still a true solution', hi: 'रंगीन, फिर भी असली घोल' } },
    milk: { en: 'A few drops of milk in water', hi: 'पानी में दूध की कुछ बूँदें', kind: 'colloid', tint: '#F4F1EA', size: { en: 'fat and protein droplets: colloid', hi: 'वसा और प्रोटीन की बूँदें: कोलॉइड' } },
    soap: { en: 'Soap water', hi: 'साबुन का पानी', kind: 'colloid', tint: '#EEF0F4', size: { en: 'clusters of soap molecules (micelles): colloid', hi: 'साबुन के अणुओं के गुच्छे (मिसेल): कोलॉइड' } },
    starch: { en: 'Starch in water', hi: 'पानी में स्टार्च', kind: 'colloid', tint: '#F2F2EE', size: { en: 'large starch molecules: colloid', hi: 'स्टार्च के बड़े अणु: कोलॉइड' } },
    muddy: { en: 'Muddy water', hi: 'मटमैला पानी', kind: 'suspension', tint: '#D9C7A7', size: { en: 'clay bits: suspension, they settle', hi: 'मिट्टी के कण: निलंबन, नीचे बैठ जाते हैं' } },
  };
  const DEFAULT = ['water', 'salt', 'copper-sulphate', 'milk', 'soap'];

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { mode }'];
    Object.keys(c).forEach((k) => { if (k !== 'mode' && k !== 'liquids') e.push('unknown key: ' + k); });
    if (c.mode !== 'tyndall' && c.mode !== 'sky') e.push('mode must be tyndall or sky');
    if (c.liquids !== undefined) {
      if (c.mode !== 'tyndall') e.push('liquids only belong to tyndall mode');
      else if (!Array.isArray(c.liquids) || c.liquids.length < 2 || c.liquids.length > 6) e.push('liquids: 2 to 6 ids');
      else {
        c.liquids.forEach((id) => { if (!LIQ[id]) e.push('unknown liquid ' + id + ' (use ' + Object.keys(LIQ).join(', ') + ')'); });
        if (new Set(c.liquids).size !== c.liquids.length) e.push('liquids: no repeats');
        if (!c.liquids.some((id) => LIQ[id] && LIQ[id].kind === 'solution') || !c.liquids.some((id) => LIQ[id] && LIQ[id].kind !== 'solution')) e.push('liquids: include at least one true solution and one colloid or suspension');
      }
    }
    return e;
  }
  function keys(c) {
    if (c && c.mode === 'sky') return { targets: ['noon', 'sunset', 'sun'], events: ['noon', 'sunset', 'moved'] };
    const ls = (c && Array.isArray(c.liquids) ? c.liquids : DEFAULT).filter((id) => LIQ[id]);
    return { targets: ls.map((id) => 'liquid:' + id).concat(['torch', 'liquid:*']), events: ls.map((id) => 'shone:' + id).concat(['beam-seen', 'beam-hidden', 'picked']) };
  }

  const css = `
.sc-wrap { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.sc-scene { width: 100%; height: auto; border-radius: 14px; background: #1C1B1A; display: block; }
.sc-row { display: flex; flex-wrap: wrap; gap: 6px; }
.sc-row button { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 14px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.sc-row button[aria-pressed="true"] { background: var(--action, #E8702A); border-color: var(--action, #E8702A); }
.sc-note { font-weight: 600; padding: 10px 12px; border-radius: 12px; background: var(--sunk, #F4EFE7); }
.sc-note.on { background: #FBF1D3; }
.sc-beam { transition: opacity .4s ease; }
.sc-dot { animation: sc-tw 1.6s ease-in-out infinite; }
@keyframes sc-tw { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .sc-beam { transition: none; } .sc-dot { animation: none; } }
input.sc-range { width: 100%; min-height: 44px; accent-color: #E8702A; }
`;

  function mount(root, config, api) {
    const t = (o) => api.t(o);
    let destroyed = false;
    if (config.mode === 'sky') {
      let pos = 0; // 0 noon … 100 sunset
      const draw = () => {
        const a = pos / 100;
        const sunY = 30 + a * 150, sunX = 180 + a * 120;
        const skyTop = a < .5 ? '#5DA9E9' : '#3E5C8A', skyLow = a < .3 ? '#A9D3F5' : a < .7 ? '#F2C38B' : '#E8702A';
        const sun = a < .5 ? '#FFF6D2' : a < .8 ? '#FFC590' : '#FF6B57';
        const path = Math.round(1 / Math.max(0.12, Math.cos(a * 1.45)) * 10) / 10;
        root.querySelector('svg').innerHTML = `<defs><linearGradient id="sc-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyLow}"/></linearGradient></defs>
          <rect width="360" height="220" fill="url(#sc-sk)"/><rect y="190" width="360" height="30" fill="#4B5563"/>
          <path d="M60 190 L${sunX} ${sunY}" stroke="#FFFDF9" stroke-width="2" stroke-dasharray="6 6" opacity=".9"/>
          <circle cx="${sunX}" cy="${sunY}" r="16" fill="${sun}"/><circle cx="60" cy="186" r="6" fill="#FFFDF9"/>
          ${[...Array(10)].map((_, i) => `<circle class="sc-dot" cx="${70 + i * (sunX - 70) / 10}" cy="${186 - i * (186 - sunY) / 10}" r="2" fill="#5DA9E9" style="animation-delay:${i * .15}s"/>`).join('')}`;
        root.querySelector('.sc-note').textContent = t(a < .4
          ? { en: `Noon: sunlight crosses a short path of air (about ${path}×). Air molecules scatter mostly blue light all over the sky, so the sky looks blue and the Sun white.`, hi: `दोपहर: धूप हवा का छोटा रास्ता (करीब ${path}×) पार करती है। हवा के अणु ज़्यादातर नीली रोशनी को चारों तरफ़ बिखेरते हैं, इसलिए आसमान नीला और सूरज सफ़ेद दिखता है।` }
          : a < .8 ? { en: `Evening: the path through air is longer (about ${path}×). Much of the blue is scattered away before it reaches you; more yellow and orange get through.`, hi: `शाम: हवा से रास्ता लंबा (करीब ${path}×) हो गया। नीली रोशनी का बड़ा हिस्सा रास्ते में ही बिखर जाता है; पीली और नारंगी ज़्यादा पहुँचती है।` }
          : { en: `Sunset: the light travels through the thickest air (about ${path}×). Almost all blue is scattered out, so mainly red and orange reach your eyes: a red Sun.`, hi: `सूर्यास्त: रोशनी सबसे मोटी हवा की परत (करीब ${path}×) से आती है। लगभग सारी नीली रोशनी बिखर जाती है, इसलिए आँखों तक ज़्यादातर लाल और नारंगी पहुँचती है: लाल सूरज।` });
      };
      root.innerHTML = `<div class="sc-wrap"><svg class="sc-scene" viewBox="0 0 360 220" role="img" aria-label="${esc(t({ en: 'Sky and Sun', hi: 'आसमान और सूरज' }))}"></svg>
        <label><span class="sr">${esc(t({ en: 'Time of day', hi: 'दिन का समय' }))}</span><input class="sc-range" type="range" min="0" max="100" value="0" data-key="sun"></label>
        <div class="sc-row"><button type="button" data-key="noon">${esc(t({ en: 'Noon', hi: 'दोपहर' }))}</button><button type="button" data-key="sunset">${esc(t({ en: 'Sunset', hi: 'सूर्यास्त' }))}</button></div>
        <p class="sc-note" aria-live="polite"></p></div>`;
      const set = (v, ev) => { pos = v; root.querySelector('.sc-range').value = v; draw(); api.emit(ev); if (v >= 90) api.emit('sunset'); if (v <= 10) api.emit('noon'); };
      root.addEventListener('click', (e) => { const b = e.target.closest('button[data-key]'); if (!b) return; const k = b.dataset.key; if (!api.allowed(k)) return api.nudge(); set(k === 'noon' ? 0 : 100, 'moved'); });
      root.addEventListener('input', (e) => { if (!e.target.matches('.sc-range')) return; if (!api.allowed('sun')) { e.target.value = pos; return api.nudge(); } set(+e.target.value, 'moved'); });
      draw();
      return { destroy() { destroyed = true; root.innerHTML = ''; } };
    }

    const ls = (Array.isArray(config.liquids) ? config.liquids : DEFAULT).filter((id) => LIQ[id]);
    let cur = null, on = false;
    function draw() {
      const L = cur ? LIQ[cur] : null;
      const show = on && L && L.kind !== 'solution';
      const parts = L && L.kind !== 'solution' ? [...Array(L.kind === 'suspension' ? 36 : 22)].map((_, i) => { const x = 146 + ((i * 41) % 72), y = 92 + ((i * 29) % 78); return `<circle cx="${x}" cy="${y}" r="${L.kind === 'suspension' ? 2.6 : 1.6}" fill="${L.kind === 'suspension' ? '#8A5300' : '#FFFDF9'}" opacity=".7"/>`; }).join('') : '';
      root.querySelector('svg').innerHTML = `
        <rect width="360" height="220" fill="#1C1B1A"/>
        <rect x="18" y="114" width="54" height="26" rx="6" fill="#4B5563"/><rect x="70" y="118" width="10" height="18" fill="${on ? '#FFD23F' : '#6B7280'}"/>
        <g class="sc-beam" opacity="${on ? 1 : 0}"><path d="M80 120 L140 112 L140 142 L80 134 Z" fill="#FFF6D2" opacity=".55"/><path d="M226 112 L340 100 L340 154 L226 142 Z" fill="#FFF6D2" opacity=".35"/></g>
        <rect x="140" y="82" width="86" height="98" rx="8" fill="${L ? L.tint : '#3B3936'}" opacity="${L ? .85 : .4}" stroke="#E7E1D6" stroke-width="2"/>
        <rect class="sc-beam" x="142" y="113" width="82" height="28" fill="#FFF6D2" opacity="${show ? (L.kind === 'suspension' ? .55 : .8) : 0}"/>
        ${parts}
        <rect x="336" y="96" width="8" height="62" fill="#E7E1D6" opacity=".6"/>`;
      const note = root.querySelector('.sc-note');
      if (!L) note.textContent = t({ en: 'Pick a liquid, then switch the torch on.', hi: 'कोई द्रव चुनो, फिर टॉर्च जलाओ।' });
      else if (!on) note.textContent = t({ en: `${L.en}: ${L.size.en}. Now switch the torch on and look at the glass from the side.`, hi: `${L.hi}: ${L.size.hi}। अब टॉर्च जलाओ और गिलास को साइड से देखो।` });
      else if (show) note.textContent = t({ en: `You can see the beam's path inside the glass. The particles (${L.size.en}) are big enough to scatter light sideways into your eyes: the Tyndall effect.`, hi: `गिलास के अंदर रोशनी का रास्ता दिख रहा है। कण (${L.size.hi}) इतने बड़े हैं कि रोशनी को साइड में तुम्हारी आँखों की तरफ़ बिखेर देते हैं: टिंडल प्रभाव।` });
      else note.textContent = t({ en: `The light goes straight through and the path inside the glass stays invisible. In a true solution the particles (${L.size.en}) are too small to scatter it.${cur === 'copper-sulphate' ? ' Colour does not matter; particle size does.' : ''}`, hi: `रोशनी सीधे निकल जाती है और गिलास के अंदर उसका रास्ता नहीं दिखता। असली घोल में कण (${L.size.hi}) इतने छोटे हैं कि उसे बिखेर नहीं पाते।${cur === 'copper-sulphate' ? ' रंग से फ़र्क़ नहीं पड़ता; कणों का आकार मायने रखता है।' : ''}` });
      root.querySelectorAll('[data-key^="liquid:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'liquid:' + cur)));
      const tb = root.querySelector('[data-key="torch"]'); tb.setAttribute('aria-pressed', String(on)); tb.textContent = t(on ? { en: 'Torch off', hi: 'टॉर्च बंद करो' } : { en: 'Torch on', hi: 'टॉर्च जलाओ' });
    }
    root.innerHTML = `<div class="sc-wrap"><svg class="sc-scene" viewBox="0 0 360 220" role="img" aria-label="${esc(t({ en: 'A torch beam through a glass of liquid in a dark room', hi: 'अँधेरे कमरे में द्रव के गिलास से गुज़रती टॉर्च की रोशनी' }))}"></svg>
      <div class="sc-row" role="group">${ls.map((id) => `<button type="button" data-key="liquid:${id}">${esc(t(LIQ[id]))}</button>`).join('')}</div>
      <div class="sc-row"><button type="button" data-key="torch"></button></div>
      <p class="sc-note" aria-live="polite"></p></div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-key]');
      if (!b || destroyed) return;
      const k = b.dataset.key;
      if (!api.allowed(k)) return api.nudge();
      if (k.startsWith('liquid:')) { cur = k.slice(7); api.emit('picked'); if (on) shone(); }
      else if (k === 'torch') { on = !on; if (on && cur) shone(); }
      draw();
    });
    function shone() { api.emit('shone:' + cur); api.emit(LIQ[cur].kind === 'solution' ? 'beam-hidden' : 'beam-seen'); api.record((LIQ[cur].en) + ': ' + (LIQ[cur].kind === 'solution' ? 'no beam' : 'beam seen')); }
    draw();
    return { destroy() { destroyed = true; root.innerHTML = ''; } };
  }

  NCA_T.register({ id: 'scatter', css, validate, keys, demo: { mode: 'tyndall', liquids: ['water', 'salt', 'copper-sulphate', 'milk', 'soap'] }, mount });
})();
