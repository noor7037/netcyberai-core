// NetCyberAI Labs: the reusable templates. Each template is built once and configured by a lab definition
// (labs.js); none is written for one chapter. A template draws its scene, keeps its own state, and talks to the
// engine through `api`:
//   api.allowed(key)  may the child use this control now? (guided mode lets only the glowing one through)
//   api.emit(event)   tell the engine what happened ("pick:zinc", "reacted", "phase:full" ...)
//   api.t(text)       a {en, hi} text in the chosen language
//   api.lang()        'en' or 'hi'
//   api.speak(text, lang?)  read aloud with the phone's own voice
//   api.record(line)  one line for the tutor's view of what the child did
// Controls carry data-key="…" so the engine can put its spotlight on them. Domain rules (which reactions happen,
// how indicators behave, how fractions compare, the Moon's phase) live here, checked in code, never in the
// chapter's settings.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sub = (f) => f.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>');
  // Inside SVG an HTML <sub> would end the drawing, so subscripts there are tspans.
  const svgSub = (f) => f.replace(/([A-Za-z\)])(\d+)/g, '$1<tspan baseline-shift="sub" font-size="72%">$2</tspan>');
  const eqHTML = (line) => line.split(' ').map((tok) => {
    if (tok === '->') return '<span class="eq-arrow" aria-label="gives">⟶</span>';
    if (tok === '+') return ' + ';
    const m = tok.match(/^(\d*)(.*?)(\((?:s|l|g|aq)\))?([\^v])?$/);
    if (!m) return esc(tok);
    return `${m[1]}${sub(esc(m[2]))}${m[3] ? `<span class="eq-st">${m[3]}</span>` : ''}${m[4] === '^' ? '↑' : m[4] === 'v' ? '↓' : ''}`;
  }).join('');
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const mixHex = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], t)).toString(16).padStart(2, '0')).join('');
  const avgHex = (list) => { if (!list.length) return '#EAF3FB'; const s = [0, 0, 0]; list.forEach((h) => hex(h).forEach((v, i) => (s[i] += v))); return '#' + s.map((v) => Math.round(v / list.length).toString(16).padStart(2, '0')).join(''); };
  // A tween on requestAnimationFrame; with reduced motion it jumps to the end.
  function tween(ms, step, done) {
    if (reduced() || ms <= 0) { step(1); done && done(); return () => {}; }
    let stop = false;
    const t0 = performance.now();
    const f = (now) => { if (stop) return; const t = Math.min(1, (now - t0) / ms); step(t); if (t < 1) requestAnimationFrame(f); else done && done(); };
    requestAnimationFrame(f);
    return () => { stop = true; };
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // =====================================================================================================
  // 1. BEAKER BENCH: reactions in a beaker, from a checked list of substances and reactions.
  // =====================================================================================================
  const SUB = {
    zinc: { kind: 'solid', look: 'granules', colour: '#9AA6B8', formula: 'Zn', name: { en: 'Zinc granules', hi: 'जस्ते के दाने' } },
    hcl: { kind: 'liquid', colour: '#E4EFFA', formula: 'HCl', ph: 'acid', name: { en: 'Dilute hydrochloric acid', hi: 'तनु हाइड्रोक्लोरिक अम्ल' } },
    pbno3: { kind: 'liquid', colour: '#EEF2F8', formula: 'Pb(NO3)2', name: { en: 'Lead nitrate solution', hi: 'लेड नाइट्रेट विलयन' } },
    ki: { kind: 'liquid', colour: '#F1F4F9', formula: 'KI', name: { en: 'Potassium iodide solution', hi: 'पोटैशियम आयोडाइड विलयन' } },
    cuso4: { kind: 'liquid', colour: '#3F8FE0', formula: 'CuSO4', name: { en: 'Copper sulphate solution', hi: 'कॉपर सल्फेट विलयन' } },
    feso4: { kind: 'liquid', colour: '#C9E4BD', formula: 'FeSO4', name: { en: 'Iron sulphate solution', hi: 'आयरन सल्फेट विलयन' } },
    nail: { kind: 'solid', look: 'nail', colour: '#8E99AA', formula: 'Fe', name: { en: 'Iron nail', hi: 'लोहे की कील' } },
    copperwire: { kind: 'solid', look: 'wire', colour: '#C8742F', formula: 'Cu', name: { en: 'Copper wire', hi: 'ताँबे का तार' } },
    cao: { kind: 'solid', look: 'lumps', colour: '#F6F7F9', formula: 'CaO', name: { en: 'Quicklime', hi: 'बिना बुझा चूना' } },
    water: { kind: 'liquid', colour: '#D9ECFB', formula: 'H2O', name: { en: 'Water', hi: 'पानी' } },
    soda: { kind: 'solid', look: 'powder', colour: '#FBFBFB', formula: 'NaHCO3', name: { en: 'Baking soda', hi: 'खाने का सोडा' } },
    vinegar: { kind: 'liquid', colour: '#F4ECD6', formula: 'CH3COOH', ph: 'acid', name: { en: 'Vinegar', hi: 'सिरका' } },
    naoh: { kind: 'liquid', colour: '#EDF3F8', formula: 'NaOH', ph: 'base', name: { en: 'Sodium hydroxide solution', hi: 'सोडियम हाइड्रॉक्साइड विलयन' } },
    bluelitmus: { kind: 'liquid', indicator: { acid: '#D8433A', base: '#3F63D6' }, colour: '#3F63D6', formula: 'litmus', name: { en: 'Blue litmus solution', hi: 'नीला लिटमस विलयन' } },
    redlitmus: { kind: 'liquid', indicator: { acid: '#D8433A', base: '#3F63D6' }, colour: '#D8433A', formula: 'litmus', name: { en: 'Red litmus solution', hi: 'लाल लिटमस विलयन' } },
    phenol: { kind: 'liquid', indicator: { acid: '#F4F4F6', base: '#E24FA4' }, colour: '#F4F4F6', formula: 'phenolphthalein', name: { en: 'Phenolphthalein', hi: 'फ़िनॉल्फ़्थेलिन' } },
  };
  // Reactions: what must be in the beaker, and what the child sees. Every entry is a real school-lab reaction.
  const REACT = [
    { needs: ['zinc', 'hcl'], gas: 1.2, temp: 1, obs: ['gas', 'temp'], eq: 'Zn(s) + 2HCl(aq) -> ZnCl2(aq) + H2(g)^', note: { en: 'Bubbles of hydrogen gas form on the zinc, and the beaker gets warm.', hi: 'जस्ते पर हाइड्रोजन गैस के बुलबुले बनते हैं और बीकर गर्म हो जाता है।' } },
    { needs: ['pbno3', 'ki'], ppt: '#F2B705', colour: '#FFE27A', obs: ['ppt', 'colour'], eq: 'Pb(NO3)2(aq) + 2KI(aq) -> PbI2(s)v + 2KNO3(aq)', note: { en: 'A bright yellow solid, lead iodide, forms and settles: a precipitate. Lead compounds are poisonous; only a teacher does this in a school lab.', hi: 'चमकीला पीला ठोस, लेड आयोडाइड, बनकर नीचे बैठ जाता है: यह अवक्षेप है। लेड के यौगिक ज़हरीले होते हैं; स्कूल लैब में यह केवल शिक्षक करते हैं।' } },
    { needs: ['nail', 'cuso4'], colour: '#BFE0B4', coat: '#9C4A22', obs: ['colour'], eq: 'Fe(s) + CuSO4(aq) -> FeSO4(aq) + Cu(s)', note: { en: 'The nail gets a reddish-brown coat of copper, and the blue colour fades to pale green iron sulphate.', hi: 'कील पर ताँबे की लाल-भूरी परत चढ़ जाती है और नीला रंग हल्के हरे आयरन सल्फेट में बदल जाता है।' } },
    { needs: ['copperwire', 'feso4'], none: true, note: { en: 'Nothing happens. Copper is less reactive than iron, so it cannot push iron out of iron sulphate.', hi: 'कुछ नहीं होता। ताँबा लोहे से कम अभिक्रियाशील है, इसलिए वह आयरन सल्फेट से लोहे को नहीं हटा सकता।' } },
    { needs: ['copperwire', 'cuso4'], none: true, note: { en: 'Nothing happens: copper cannot displace copper.', hi: 'कुछ नहीं होता: ताँबा ताँबे को नहीं हटा सकता।' } },
    { needs: ['nail', 'feso4'], none: true, note: { en: 'Nothing visible happens: iron is already the metal in iron sulphate.', hi: 'कुछ दिखाई नहीं देता: आयरन सल्फेट में धातु पहले से लोहा ही है।' } },
    { needs: ['cao', 'water'], temp: 3, steam: true, colour: '#F2F3F5', obs: ['temp'], eq: 'CaO(s) + H2O(l) -> Ca(OH)2(aq)', note: { en: 'It hisses and gets very hot: a lot of heat is given out. The milky liquid is slaked lime. Never try this at home.', hi: 'सी-सी की आवाज़ होती है और मिश्रण बहुत गर्म हो जाता है: बहुत ऊष्मा निकलती है। यह दूधिया द्रव बुझा हुआ चूना है। इसे घर पर कभी मत करना।' } },
    { needs: ['soda', 'vinegar'], gas: 3, foam: true, temp: -0.6, obs: ['gas', 'temp'], eq: 'NaHCO3(s) + CH3COOH(aq) -> CH3COONa(aq) + H2O(l) + CO2(g)^', note: { en: 'It fizzes strongly with carbon dioxide gas, and the beaker feels slightly cooler.', hi: 'कार्बन डाइऑक्साइड गैस से तेज़ झाग बनता है और बीकर थोड़ा ठंडा लगता है।' } },
    { needs: ['hcl', 'naoh'], temp: 0.6, obs: ['temp'], eq: 'NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)', note: { en: 'No colour change, but it warms a little: the acid and the base neutralise each other into salt and water.', hi: 'रंग नहीं बदलता, पर मिश्रण थोड़ा गर्म होता है: अम्ल और क्षार एक-दूसरे को उदासीन करके नमक और पानी बनाते हैं।' } },
  ];
  const OBS = { gas: { en: 'Gas given off', hi: 'गैस निकली' }, temp: { en: 'Temperature change', hi: 'तापमान बदला' }, colour: { en: 'Colour change', hi: 'रंग बदला' }, ppt: { en: 'Precipitate', hi: 'अवक्षेप' } };

  function beaker(root, cfg, api) {
    const items = cfg.items;
    const S = { picked: null, inside: [], colour: null, level: 0, temp: 0, gas: 0, ppt: null, pptH: 0, coat: null, steam: 0, foam: 0, done: new Set(), result: null };
    const n = items.length;
    const gap = Math.min(96, 540 / n);
    const pos = Object.fromEntries(items.map((id, i) => [id, 34 + i * gap + (gap - 72) / 2]));
    let idleStop = null;
    let busy = false;

    root.innerHTML = `
      <div class="bk">
        <svg class="bk-svg" viewBox="0 140 800 330" role="group" aria-label="${esc(api.t({ en: 'Lab bench', hi: 'लैब की मेज़' }))}"></svg>
        <div class="bk-under">
          <div class="obs-row" aria-label="${esc(api.t({ en: 'What you observe', hi: 'तुमने क्या देखा' }))}"></div>
          <div class="bk-result" aria-live="polite"></div>
          <div class="bk-tools"><button type="button" class="ghost" data-key="clean">${esc(api.t({ en: 'Clean the beaker', hi: 'बीकर साफ़ करो' }))}</button></div>
        </div>
      </div>`;
    const svg = root.querySelector('svg');

    const bottle = (id) => {
      const s = SUB[id];
      if (s.kind === 'solid' && S.inside.includes(id)) return '';
      const x = pos[id];
      const nm = api.t(s.name).split(' ');
      const lines = [];
      nm.forEach((w) => { const l = lines[lines.length - 1]; if (l && (l + ' ' + w).length <= 13) lines[lines.length - 1] = l + ' ' + w; else lines.push(w); });
      const label = `<text x="36" y="22" text-anchor="middle" class="bk-name">${lines.slice(0, 3).map((l, i) => `<tspan x="36" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
      const sel = S.picked === id;
      let body;
      if (s.kind === 'liquid') {
        body = `<rect x="6" y="-118" width="60" height="118" rx="12" fill="url(#glass)" stroke="#8FA3BF" stroke-width="2"/>
          <rect x="9" y="-84" width="54" height="81" rx="9" fill="${s.colour}" opacity=".92"/>
          <rect x="12" y="-80" width="8" height="70" rx="4" fill="#fff" opacity=".45"/>
          <rect x="24" y="-136" width="24" height="20" rx="3" fill="url(#glass)" stroke="#8FA3BF" stroke-width="2"/>
          <rect x="21" y="-148" width="30" height="14" rx="4" fill="${s.indicator ? '#6D28D9' : '#1E3A8A'}"/>
          <rect x="11" y="-70" width="50" height="30" rx="5" fill="#FFFDF7" stroke="#D8CFB8"/>
          <text x="36" y="-50" text-anchor="middle" class="bk-formula">${s.formula.length > 9 ? esc(s.formula.slice(0, 7)) + '…' : svgSub(esc(s.formula))}</text>`;
      } else {
        const inner = s.look === 'granules' ? [0, 1, 2, 3, 4].map((k) => `<path d="M${16 + k * 9} -${16 + (k % 2) * 5}l6-5 6 3 0 6-7 3z" fill="${s.colour}" stroke="#6B7689" stroke-width="1"/>`).join('')
          : s.look === 'nail' ? `<rect x="10" y="-22" width="52" height="7" rx="3" fill="${S.coat && S.inside.includes('nail') ? s.colour : s.colour}" stroke="#5E6878"/><rect x="58" y="-26" width="6" height="15" rx="2" fill="#7C889C"/>`
          : s.look === 'wire' ? `<path d="M14 -18c6-10 12 10 18 0s12 10 18 0 10 8 14 0" fill="none" stroke="${s.colour}" stroke-width="4" stroke-linecap="round"/>`
          : s.look === 'lumps' ? [0, 1, 2].map((k) => `<rect x="${14 + k * 15}" y="-${24 + (k % 2) * 4}" width="13" height="12" rx="4" fill="${s.colour}" stroke="#B5BDCA"/>`).join('')
          : `<path d="M14 -12c8-14 36-14 44 0z" fill="${s.colour}" stroke="#C9CED8"/>`;
        body = `<ellipse cx="36" cy="-8" rx="32" ry="9" fill="#EEF3FA" stroke="#8FA3BF" stroke-width="2"/>${inner}
          <rect x="8" y="-62" width="56" height="26" rx="6" fill="#FFFDF7" stroke="#D8CFB8"/>
          <text x="36" y="-44" text-anchor="middle" class="bk-formula">${svgSub(esc(s.formula))}</text>`;
      }
      return `<g class="bk-item ${sel ? 'sel' : ''}" data-key="pick:${id}" data-id="${id}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(api.t(s.name))}" transform="translate(${x} ${380 - (sel ? 16 : 0)})">
        <rect x="-2" y="-152" width="76" height="196" fill="transparent"/>${sel ? '<ellipse cx="36" cy="6" rx="34" ry="6" fill="#8B3DFF" opacity=".25"/>' : ''}${body}${label}</g>`;
    };

    const insideSolids = () => S.inside.filter((id) => SUB[id].kind === 'solid').map((id, i) => {
      const s = SUB[id];
      if (s.look === 'nail') return `<g id="bk-nail"><rect x="646" y="232" width="10" height="132" rx="4" fill="${S.coat || s.colour}" stroke="#5E6878" transform="rotate(14 651 300)"/><rect x="638" y="226" width="26" height="9" rx="3" fill="#7C889C" transform="rotate(14 651 300)"/></g>`;
      if (s.look === 'wire') return `<path d="M630 360c8-30 20 20 28-12s20 24 28-8" fill="none" stroke="${s.colour}" stroke-width="5" stroke-linecap="round"/>`;
      if (s.look === 'granules') return [0, 1, 2, 3, 4, 5].map((k) => `<path d="M${612 + k * 20} ${366 - (k % 2) * 4}l8-6 8 4 0 7-9 4z" fill="${s.colour}" stroke="#6B7689"/>`).join('');
      if (s.look === 'lumps') return [0, 1, 2, 3].map((k) => `<rect x="${614 + k * 28}" y="${352 - (k % 2) * 5}" width="22" height="18" rx="6" fill="${s.colour}" stroke="#B5BDCA"/>`).join('');
      return `<path d="M610 371c18-20 92-20 110 0z" fill="${s.colour}" stroke="#D5D9E0" opacity="${S.done.size ? 0.35 : 1}"/>`;
    }).join('');

    const thermoY = () => 300 - Math.max(-0.8, Math.min(3, S.temp)) * 36;

    function draw() {
      const top = 372 - S.level;
      svg.innerHTML = `
        <defs>
          <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9EEF7"/><stop offset="1" stop-color="#D6DEEC"/></linearGradient>
          <linearGradient id="bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F2E8"/><stop offset="1" stop-color="#E3D6BE"/></linearGradient>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".85"/><stop offset=".5" stop-color="#EAF3FD" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".8"/></linearGradient>
          <clipPath id="bkclip"><path d="M602 196h136v168a10 10 0 0 1-10 10H612a10 10 0 0 1-10-10z"/></clipPath>
          <pattern id="tiles" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#C9D3E4" stroke-width="1"/></pattern>
        </defs>
        <rect width="800" height="470" fill="url(#wall)"/><rect width="800" height="330" fill="url(#tiles)" opacity=".7"/>
        <rect x="0" y="380" width="800" height="90" fill="url(#bench)"/><rect x="0" y="378" width="800" height="5" fill="#CDBB98"/>
        <g data-key="beaker" class="bk-beaker" role="button" tabindex="0" aria-label="${esc(api.t({ en: 'Beaker', hi: 'बीकर' }))}">
          <rect x="580" y="170" width="180" height="214" fill="transparent"/>
          <g clip-path="url(#bkclip)">
            <rect id="bk-liquid" x="600" y="${top}" width="140" height="${S.level + 4}" fill="${S.colour || '#EAF3FB'}" opacity="${S.level ? 0.9 : 0}"/>
            <rect id="bk-surface" x="600" y="${top - 2}" width="140" height="4" fill="#fff" opacity="${S.level ? 0.6 : 0}"/>
            <rect id="bk-ppt" x="600" y="${374 - S.pptH}" width="140" height="${S.pptH}" fill="${S.ppt || 'transparent'}"/>
            <g id="bk-parts"></g>
            ${insideSolids()}
            <ellipse id="bk-foam" cx="670" cy="${top - 4}" rx="68" ry="${S.foam * 14}" fill="#FFFFFF" opacity="${S.foam ? 0.85 : 0}"/>
            <g id="bk-bubbles"></g>
          </g>
          <path d="M596 182h148M600 186v178a14 14 0 0 0 14 14h112a14 14 0 0 0 14-14V186" fill="url(#glass)" fill-opacity=".25" stroke="#7F93B2" stroke-width="3" stroke-linecap="round"/>
          <path d="M610 200v150" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity=".55"/>
          ${[0, 1, 2, 3].map((k) => `<path d="M726 ${352 - k * 36}h12" stroke="#7F93B2" stroke-width="2"/>`).join('')}
          <g id="bk-steam" opacity="${S.steam}">${[0, 1, 2].map((k) => `<path d="M${632 + k * 32} 168c-10-14 10-20 0-36" fill="none" stroke="#B9C6D8" stroke-width="5" stroke-linecap="round"/>`).join('')}</g>
        </g>
        <g aria-hidden="true">
          <rect x="770" y="190" width="14" height="168" rx="7" fill="#FFFFFF" stroke="#7F93B2" stroke-width="2"/>
          <rect id="bk-merc" x="774" y="${thermoY()}" width="6" height="${364 - thermoY()}" fill="#E5484D"/>
          <circle cx="777" cy="366" r="11" fill="#E5484D" stroke="#7F93B2" stroke-width="2"/>
        </g>
        <text x="796" y="178" text-anchor="end" class="bk-temp" id="bk-templbl">${esc(tempWord())}</text>
        <line id="bk-stream" x1="0" y1="0" x2="0" y2="0" stroke="#9CC3EE" stroke-width="7" stroke-linecap="round" opacity="0"/>
        ${items.map(bottle).join('')}`;
      root.querySelector('.obs-row').innerHTML = Object.keys(OBS).map((k) => `<span class="obs ${S.result && S.result.obs && S.result.obs.includes(k) ? 'on' : ''}">${esc(api.t(OBS[k]))}</span>`).join('') + (S.result && S.result.none ? `<span class="obs on none">${esc(api.t({ en: 'No change', hi: 'कोई बदलाव नहीं' }))}</span>` : '');
      root.querySelector('.bk-result').innerHTML = S.result ? `${S.result.eq ? `<div class="eq">${eqHTML(S.result.eq)}</div>` : ''}<p>${esc(api.t(S.result.note))}</p>` : `<p class="muted">${esc(api.t(S.inside.length ? { en: 'In the beaker: ', hi: 'बीकर में: ' } : { en: 'The beaker is empty. Pick something and tap the beaker.', hi: 'बीकर ख़ाली है। कुछ उठाओ और बीकर पर टैप करो।' }))}${S.inside.map((id) => esc(api.t(SUB[id].name))).join(', ')}</p>`;
    }
    function tempWord() {
      if (S.temp > 2) return api.t({ en: 'very hot', hi: 'बहुत गर्म' });
      if (S.temp > 0.3) return api.t({ en: 'warmer', hi: 'गर्म' });
      if (S.temp < -0.3) return api.t({ en: 'cooler', hi: 'ठंडा' });
      return api.t({ en: 'room temp.', hi: 'सामान्य' });
    }

    // Bubbles while a gas is being given off (and gently afterwards).
    const bubbles = [];
    function bubbleFrame(rate) {
      const g = svg.querySelector('#bk-bubbles');
      if (!g) return;
      const top = 372 - S.level;
      if (Math.random() < rate * 0.6 && bubbles.length < 60) bubbles.push({ x: 612 + Math.random() * 116, y: 368, r: 1.5 + Math.random() * 3.5, v: 0.8 + Math.random() * 1.6 });
      for (const b of bubbles) { b.y -= b.v * (1 + rate * 0.4); b.x += Math.sin(b.y / 9) * 0.4; }
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < top) bubbles.splice(i, 1);
      g.innerHTML = bubbles.map((b) => `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.r.toFixed(1)}" fill="#FFFFFF" fill-opacity=".55" stroke="#FFFFFF" stroke-width="1"/>`).join('');
    }
    function idle() {
      if (idleStop) idleStop();
      if (reduced() || !S.gas) return;
      let on = true;
      const f = () => { if (!on) return; bubbleFrame(S.gas * 0.25); requestAnimationFrame(f); };
      requestAnimationFrame(f);
      idleStop = () => { on = false; };
    }

    function react() {
      const present = new Set(S.inside);
      // An indicator with an acid or a base: the indicator's own colour rule.
      const ind = S.inside.find((id) => SUB[id].indicator);
      const phSub = S.inside.find((id) => SUB[id].ph);
      let r = REACT.find((x) => x.needs.every((id) => present.has(id)) && !S.done.has(x.needs.join('+')));
      if (!r && ind && phSub && !S.done.has('ind:' + ind + phSub)) {
        const to = SUB[ind].indicator[SUB[phSub].ph];
        const changed = to.toLowerCase() !== SUB[ind].colour.toLowerCase();
        const acid = SUB[phSub].ph === 'acid';
        const nm = SUB[ind].name;
        r = { key: 'ind:' + ind + phSub, colour: to, obs: changed ? ['colour'] : null, none: !changed,
          note: changed
            ? { en: `${nm.en} turns ${to === SUB[ind].indicator.acid && acid ? 'red' : to === '#E24FA4' ? 'pink' : 'blue'}: the solution is ${acid ? 'an acid' : 'a base'}.`, hi: `${nm.hi} ${to === '#E24FA4' ? 'गुलाबी' : acid ? 'लाल' : 'नीला'} हो जाता है: विलयन ${acid ? 'अम्ल' : 'क्षार'} है।` }
            : { en: `${nm.en} does not change in ${acid ? 'an acid' : 'a base'}. Try another indicator.`, hi: `${nm.hi} ${acid ? 'अम्ल' : 'क्षार'} में नहीं बदलता। कोई दूसरा सूचक आज़माओ।` } };
      }
      if (!r) {
        if (S.inside.length >= 2) {
          S.result = { none: true, note: { en: 'Nothing visible happens with these.', hi: 'इनसे कोई बदलाव दिखाई नहीं देता।' } };
          draw(); api.emit('reacted'); api.record(api.t({ en: 'Mixed with no visible change', hi: 'मिलाया, कोई बदलाव नहीं दिखा' }));
        }
        busy = false;
        return;
      }
      S.done.add(r.key || r.needs.join('+'));
      const from = { colour: S.colour || '#EAF3FB', temp: S.temp, coat: S.coat || SUB.nail.colour };
      busy = true;
      tween(3200, (t) => {
        const e = ease(t);
        if (r.colour) { S.colour = mixHex(from.colour, r.colour, e); const l = svg.querySelector('#bk-liquid'); if (l) l.setAttribute('fill', S.colour); }
        if (r.temp) { S.temp = from.temp + r.temp * e; const m = svg.querySelector('#bk-merc'); if (m) { m.setAttribute('y', thermoY()); m.setAttribute('height', 364 - thermoY()); } const tl = svg.querySelector('#bk-templbl'); if (tl) tl.textContent = tempWord(); }
        if (r.gas) bubbleFrame(r.gas * (1 - t * 0.5));
        if (r.ppt) { S.ppt = r.ppt; S.pptH = 22 * e; const p = svg.querySelector('#bk-ppt'); if (p) { p.setAttribute('fill', r.ppt); p.setAttribute('y', 374 - S.pptH); p.setAttribute('height', S.pptH); } const g = svg.querySelector('#bk-parts'); if (g) g.innerHTML = Array.from({ length: 26 }, (_, i) => `<circle cx="${606 + ((i * 37) % 130)}" cy="${(372 - S.level) + 10 + ((i * 53) % 60) + e * 70}" r="2.4" fill="${r.ppt}" opacity="${(1 - e) * 0.9}"/>`).join(''); }
        if (r.coat) { S.coat = mixHex(from.coat, r.coat, e); svg.querySelectorAll('#bk-nail rect')[0]?.setAttribute('fill', S.coat); }
        if (r.steam) { S.steam = Math.min(1, e * 1.4); svg.querySelector('#bk-steam')?.setAttribute('opacity', S.steam); }
        if (r.foam) { S.foam = Math.sin(Math.PI * Math.min(1, t * 1.2)) ; const f = svg.querySelector('#bk-foam'); if (f) { f.setAttribute('ry', Math.max(0, S.foam) * 14); f.setAttribute('opacity', S.foam > 0 ? 0.85 : 0); } }
      }, () => {
        if (r.foam) S.foam = 0;
        S.gas = r.gas || S.gas;
        S.result = r;
        busy = false;
        draw();
        idle();
        if (r.none) api.record(api.t({ en: 'Saw no change', hi: 'कोई बदलाव नहीं दिखा' }));
        else api.record(api.t({ en: 'Saw: ', hi: 'देखा: ' }) + (r.obs || []).map((k) => api.t(OBS[k])).join(', '));
        api.emit('reacted');
      });
    }

    function add(id) {
      const s = SUB[id];
      busy = true;
      S.picked = null;
      draw();
      const g = svg.querySelector(`[data-id="${id}"]`);
      const x0 = pos[id];
      const liquid = s.kind === 'liquid';
      const tx = 548, ty = 300;
      const stream = svg.querySelector('#bk-stream');
      api.record(api.t({ en: 'Added ', hi: 'डाला: ' }) + api.t(s.name));
      tween(1800, (t) => {
        const a = t < 0.3 ? ease(t / 0.3) : t > 0.8 ? 1 - ease((t - 0.8) / 0.2) : 1;
        const x = lerp(x0, tx, a), y = lerp(380, ty, a);
        const rot = (t > 0.3 && t < 0.8 ? Math.sin(((t - 0.3) / 0.5) * Math.PI) : 0) * (liquid ? 100 : 70);
        g.setAttribute('transform', `translate(${x} ${y}) rotate(${rot} 36 -130)`);
        if (t > 0.38 && t < 0.72) {
          const k = (t - 0.38) / 0.34;
          if (liquid) {
            stream.setAttribute('x1', 588); stream.setAttribute('y1', 176); stream.setAttribute('x2', 630); stream.setAttribute('y2', 372 - S.level);
            stream.setAttribute('stroke', s.colour); stream.setAttribute('opacity', 0.85);
            S.level = Math.min(120, S.level + 1.1);
            S.colour = avgHex(S.inside.concat(id).filter((j) => SUB[j].kind === 'liquid').map((j) => SUB[j].colour));
            const l = svg.querySelector('#bk-liquid');
            if (l) { l.setAttribute('y', 372 - S.level); l.setAttribute('height', S.level + 4); l.setAttribute('opacity', 0.9); l.setAttribute('fill', S.colour); }
            const su = svg.querySelector('#bk-surface'); if (su) { su.setAttribute('y', 370 - S.level); su.setAttribute('opacity', 0.6); }
          } else if (k > 0.5 && !S.inside.includes(id)) {
            S.inside.push(id);
            const hold = svg.querySelector('#bk-parts');
            if (hold) hold.insertAdjacentHTML('beforeend', '');
          }
        } else stream.setAttribute('opacity', 0);
      }, () => {
        if (!S.inside.includes(id)) S.inside.push(id);
        draw();
        api.emit('add:' + id);
        react();
      });
    }

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-key]');
      if (!el || busy) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('pick:')) {
        const id = key.slice(5);
        S.picked = S.picked === id ? null : id;
        draw();
        if (S.picked) { api.emit('pick:' + id); api.speak(api.t(SUB[id].name)); }
      } else if (key === 'beaker') {
        if (!S.picked) { api.toast({ en: 'Pick something from the bench first.', hi: 'पहले मेज़ से कुछ उठाओ।' }); return; }
        if (S.inside.includes(S.picked)) { api.toast({ en: 'That is already in the beaker.', hi: 'यह पहले से बीकर में है।' }); return; }
        if (S.inside.length >= 3) { api.toast({ en: 'The beaker is full. Clean it first.', hi: 'बीकर भर गया है। पहले इसे साफ़ करो।' }); return; }
        add(S.picked);
      } else if (key === 'clean') {
        Object.assign(S, { picked: null, inside: [], colour: null, level: 0, temp: 0, gas: 0, ppt: null, pptH: 0, coat: null, steam: 0, foam: 0, result: null });
        S.done = new Set();
        bubbles.length = 0;
        if (idleStop) idleStop();
        draw();
        api.emit('clean');
        api.record(api.t({ en: 'Cleaned the beaker', hi: 'बीकर साफ़ किया' }));
      }
    });
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-key]') && e.target.closest('g')) { e.preventDefault(); e.target.closest('[data-key]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    draw();
    return { destroy() { if (idleStop) idleStop(); }, summary: () => S.result ? (S.result.eq || '') : '' };
  }

  // =====================================================================================================
  // 2. FRACTION KITCHEN: a roti or a chocolate bar cut into equal parts, with a number line.
  // =====================================================================================================
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function fractions(root, cfg, api) {
    const bars = cfg.bars.map((b) => ({ n: b.n, shaded: new Set(Array.from({ length: b.k || 0 }, (_, i) => i)), lock: !!b.lock }));
    const roti = cfg.object === 'roti';
    root.innerHTML = `<div class="fr">${bars.map((b, i) => `<div class="fr-bar" data-bar="${i}"></div>`).join('')}</div>`;
    const piecesPath = (i, b) => {
      if (roti) {
        const cx = 200, cy = 150, r = 130;
        if (b.n === 1) return `<circle cx="${cx}" cy="${cy}" r="${r}" class="fr-p ${b.shaded.has(0) ? 'on' : ''}" data-p="0"/>`;
        return Array.from({ length: b.n }, (_, p) => {
          const a0 = (p / b.n) * 2 * Math.PI - Math.PI / 2, a1 = ((p + 1) / b.n) * 2 * Math.PI - Math.PI / 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          return `<path d="M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z" class="fr-p ${b.shaded.has(p) ? 'on' : ''}" data-p="${p}"/>`;
        }).join('');
      }
      const w = 560 / b.n;
      return Array.from({ length: b.n }, (_, p) => `<rect x="${20 + p * w + 2}" y="20" width="${w - 4}" height="86" rx="8" class="fr-p choc ${b.shaded.has(p) ? 'on' : ''}" data-p="${p}"/><rect x="${20 + p * w + 10}" y="28" width="${Math.max(4, w - 20)}" height="10" rx="4" fill="#ffffff" opacity=".12" pointer-events="none"/>`).join('');
    };
    const numberLine = (b, y, x0, x1) => {
      const k = b.shaded.size;
      const ticks = Array.from({ length: b.n + 1 }, (_, j) => { const x = x0 + ((x1 - x0) * j) / b.n; return `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="var(--ink-2)" stroke-width="2"/>`; }).join('');
      const mx = x0 + ((x1 - x0) * k) / b.n;
      return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round"/>${ticks}
        <text x="${x0}" y="${y + 28}" text-anchor="middle" class="fr-tick">0</text><text x="${x1}" y="${y + 28}" text-anchor="middle" class="fr-tick">1</text>
        <g class="fr-marker" transform="translate(${mx} ${y})"><circle r="10" fill="#8B3DFF"/><text y="-18" text-anchor="middle" class="fr-mark">${k}/${b.n}</text></g>`;
    };
    function draw() {
      bars.forEach((b, i) => {
        const el = root.querySelector(`[data-bar="${i}"]`);
        const k = b.shaded.size;
        const g = gcd(k, b.n) || 1;
        const simple = k && g > 1 ? ` = ${k / g}/${b.n / g}` : '';
        const vb = roti ? '0 0 400 380' : '0 0 600 190';
        const art = roti
          ? `<defs><radialGradient id="rotig" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#F3D9A4"/><stop offset=".7" stop-color="#E2B873"/><stop offset="1" stop-color="#C8924C"/></radialGradient></defs>
             <circle cx="200" cy="150" r="134" fill="#E8EDF6"/><circle cx="200" cy="150" r="130" fill="url(#rotig)"/>
             ${[[150, 100], [240, 120], [190, 210], [260, 200], [140, 180], [210, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${6 + (x % 5)}" fill="#A86A2E" opacity=".35"/>`).join('')}
             <g data-key="piece:${i}" class="fr-pieces">${piecesPath(i, b)}</g>${numberLine(b, 330, 60, 340)}`
          : `<rect x="16" y="16" width="568" height="94" rx="12" fill="#3B2014"/><g data-key="piece:${i}" class="fr-pieces">${piecesPath(i, b)}</g>${numberLine(b, 150, 20, 580)}`;
        el.innerHTML = `
          <div class="fr-head">
            <div class="fr-big" aria-live="polite"><span class="fr-num">${k}</span><span class="fr-den">${b.n}</span></div>
            <div class="fr-say">${esc(api.t(k ? { en: `${k} of ${b.n} equal parts${simple}`, hi: `${b.n} बराबर भागों में से ${k}${simple}` } : { en: `${b.n} equal part${b.n > 1 ? 's' : ''}, none shaded`, hi: `${b.n} बराबर भाग, कोई नहीं रंगा` }))}</div>
            ${b.lock ? `<span class="pill-s">${esc(api.t({ en: 'Fixed', hi: 'तय' }))}</span>` : `<div class="stepper" data-key="cut:${i}" role="group" aria-label="${esc(api.t({ en: 'Number of equal parts', hi: 'बराबर भागों की संख्या' }))}"><button type="button" data-cut="-1" aria-label="${esc(api.t({ en: 'Fewer parts', hi: 'कम भाग' }))}">−</button><output>${b.n}</output><button type="button" data-cut="1" aria-label="${esc(api.t({ en: 'More parts', hi: 'ज़्यादा भाग' }))}">+</button></div>`}
          </div>
          <svg viewBox="${vb}" class="fr-svg ${roti ? 'roti' : ''}" role="group" aria-label="${esc(api.t(roti ? { en: 'Roti', hi: 'रोटी' } : { en: 'Chocolate bar', hi: 'चॉकलेट बार' }))}">${art}</svg>`;
      });
    }
    const value = (b) => [b.shaded.size, b.n];
    root.addEventListener('click', (e) => {
      const cut = e.target.closest('[data-cut]');
      const piece = e.target.closest('[data-p]');
      const barEl = e.target.closest('[data-bar]');
      if (!barEl) return;
      const i = +barEl.dataset.bar;
      const b = bars[i];
      if (cut) {
        if (!api.allowed('cut:' + i)) { api.nudge('cut:' + i); return; }
        const nn = Math.max(1, Math.min(12, b.n + +cut.dataset.cut));
        if (nn === b.n) return;
        b.n = nn; b.shaded.clear(); draw();
        api.emit(`cut:${i}:${nn}`);
        api.record(api.t({ en: `Cut into ${nn} equal parts`, hi: `${nn} बराबर भागों में काटा` }));
      } else if (piece && !b.lock) {
        if (!api.allowed('piece:' + i)) { api.nudge('piece:' + i); return; }
        const p = +piece.dataset.p;
        b.shaded.has(p) ? b.shaded.delete(p) : b.shaded.add(p);
        draw();
        const [k, n] = value(b);
        api.emit(`shade:${i}:${k}/${n}`);
        api.record(api.t({ en: `Shaded ${k}/${n}`, hi: `${k}/${n} रंगा` }));
        if (bars.length === 2) {
          const [a, an] = value(bars[0]), [c, cn] = value(bars[1]);
          if (a && c && a * cn === c * an) { api.emit('equal'); api.speak(api.t({ en: `${a} by ${an} equals ${c} by ${cn}`, hi: `${an} में से ${a}, ${cn} में से ${c} के बराबर है` })); }
        }
      }
    });
    draw();
    return { destroy() {} };
  }

  // =====================================================================================================
  // 3. WORD BUILDER: letters into words (phonics), or a letter with a vowel sign (matra). Any language.
  // =====================================================================================================
  const PIC = {
    cat: '<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M30 40l8-24 14 16h16l14-16 8 24c6 8 8 16 8 24 0 18-18 28-38 28S22 82 22 64c0-8 2-16 8-24z" fill="#F4A259"/><circle cx="48" cy="56" r="5" fill="#1E293B"/><circle cx="72" cy="56" r="5" fill="#1E293B"/><path d="M56 66h8l-4 5z" fill="#C2410C"/><path d="M40 68h-16M40 72l-14 4M80 68h16M80 72l14 4" stroke="#1E293B" stroke-width="2" stroke-linecap="round"/></svg>',
    sun: '<svg viewBox="0 0 120 100" aria-hidden="true"><circle cx="60" cy="50" r="22" fill="#FFD23F" stroke="#F5B90A" stroke-width="3"/>' + Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * 2 * Math.PI; return `<line x1="${60 + 30 * Math.cos(a)}" y1="${50 + 30 * Math.sin(a)}" x2="${60 + 42 * Math.cos(a)}" y2="${50 + 42 * Math.sin(a)}" stroke="#F5B90A" stroke-width="5" stroke-linecap="round"/>`; }).join('') + '</svg>',
    bus: '<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="14" y="24" width="92" height="50" rx="10" fill="#FF7A1A"/><rect x="22" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="46" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="70" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="92" y="32" width="8" height="28" rx="2" fill="#E5ECFE"/><circle cx="34" cy="76" r="9" fill="#1E293B"/><circle cx="86" cy="76" r="9" fill="#1E293B"/><rect x="14" y="56" width="92" height="5" fill="#C2410C"/></svg>',
    pen: '<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="20" y="44" width="70" height="14" rx="5" fill="#1D4ED8" transform="rotate(-25 60 50)"/><path d="M88 34l14-6-6 14z" fill="#1E293B" transform="rotate(0)"/></svg>',
  };
  function words(root, cfg, api) {
    if (cfg.mode === 'matra') return matra(root, cfg, api);
    const W = cfg.words;
    let wi = 0, filled = [], complete = false;
    const letters = [...new Set(W.map((w) => w.w).join('') + (cfg.extra || ''))].sort();
    function draw() {
      const w = W[wi];
      root.innerHTML = `<div class="wb">
        <div class="wb-card"><div class="wb-pic">${PIC[w.pic] || ''}</div><button type="button" class="ghost big" data-key="listen">${esc(api.t({ en: 'Listen', hi: 'सुनो' }))}</button></div>
        <div class="wb-slots" aria-live="polite">${[...w.w].map((ch, i) => `<span class="slot ${filled[i] ? 'full' : ''} ${i === filled.length && !complete ? 'next' : ''}">${filled[i] || ''}</span>`).join('')}</div>
        <div class="wb-tiles" data-key="tiles" role="group" aria-label="${esc(api.t({ en: 'Letters', hi: 'अक्षर' }))}">${letters.map((ch) => `<button type="button" class="tile" data-ch="${ch}">${ch}</button>`).join('')}</div>
        <div class="wb-foot">${complete ? `<div class="wb-done">${esc(api.t({ en: 'You built ', hi: 'तुमने बनाया: ' }))}<b>${w.w}</b></div>${wi + 1 < W.length ? `<button type="button" class="btn-go" data-key="next">${esc(api.t({ en: 'Next word', hi: 'अगला शब्द' }))}</button>` : ''}` : `<span class="muted">${esc(api.t({ en: 'Tap the letters in order.', hi: 'अक्षरों को क्रम से टैप करो।' }))}</span>`}</div>
      </div>`;
    }
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-key], .tile');
      if (!el) return;
      const w = W[wi];
      if (el.classList.contains('tile')) {
        if (!api.allowed('tiles')) { api.nudge('tiles'); return; }
        if (complete) return;
        const ch = el.dataset.ch;
        if (ch === w.w[filled.length]) {
          filled.push(ch); api.speak(ch, 'en');
          if (filled.length === w.w.length) { complete = true; draw(); setTimeout(() => api.speak([...w.w].join(' ... ') + ' ... ' + w.w, 'en'), 250); api.emit('word:' + w.w); api.record(api.t({ en: 'Built the word ', hi: 'शब्द बनाया: ' }) + w.w); api.celebrate(); return; }
          draw();
        } else {
          el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500);
          api.toast({ en: `Listen again: ${[...w.w].join(' - ')}`, hi: `फिर से सुनो: ${[...w.w].join(' - ')}` });
          api.record(api.t({ en: `Tried ${ch} instead of ${w.w[filled.length]}`, hi: `${w.w[filled.length]} की जगह ${ch} चुना` }));
        }
      } else if (el.dataset.key === 'listen') {
        if (!api.allowed('listen')) { api.nudge('listen'); return; }
        api.speak(w.w, 'en'); api.emit('listen');
      } else if (el.dataset.key === 'next') {
        if (!api.allowed('next')) { api.nudge('next'); return; }
        wi++; filled = []; complete = false; draw(); api.emit('next'); api.speak(W[wi].w, 'en');
      }
    });
    draw();
    return { destroy() {} };
  }
  function matra(root, cfg, api) {
    let c = null, made = null;
    function draw() {
      root.innerHTML = `<div class="mt">
        <div class="mt-row" role="group" aria-label="${esc(api.t({ en: 'Letters', hi: 'अक्षर' }))}">${cfg.consonants.map((k) => `<button type="button" class="tile big ${c === k ? 'on' : ''}" data-key="pick:${k}" lang="hi">${k}</button>`).join('')}</div>
        <div class="mt-eq" aria-live="polite" lang="hi"><span class="mt-c">${c || '?'}</span><span class="mt-op">+</span><span class="mt-m">${made ? '◌' + made.m : '◌'}</span><span class="mt-op">=</span><span class="mt-r ${made ? 'pop' : ''}">${made ? made.r : ''}</span></div>
        ${made && cfg.examples[made.r] ? `<div class="mt-ex" lang="hi">${esc(made.r)} ${esc(api.t({ en: 'as in', hi: 'से' }))} <b>${esc(cfg.examples[made.r])}</b></div>` : '<div class="mt-ex muted">&nbsp;</div>'}
        <div class="mt-row" role="group" aria-label="${esc(api.t({ en: 'Vowel signs', hi: 'मात्राएँ' }))}">${cfg.matras.map((m) => `<button type="button" class="tile" data-key="matra:${m}" lang="hi" aria-label="${esc(m)}">◌${m}</button>`).join('')}</div>
      </div>`;
    }
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-key]');
      if (!el) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('pick:')) { c = key.slice(5); made = null; draw(); api.speak(c, 'hi'); api.emit(key); }
      else if (key.startsWith('matra:')) {
        if (!c) { api.toast({ en: 'Pick a letter first.', hi: 'पहले कोई अक्षर चुनो।' }); return; }
        const m = key.slice(6);
        made = { m, r: c + m };
        draw();
        api.speak(made.r + (cfg.examples[made.r] ? ', ' + cfg.examples[made.r] : ''), 'hi');
        api.emit('make:' + made.r);
        api.record(api.t({ en: 'Made ', hi: 'बनाया: ' }) + made.r);
      }
    });
    draw();
    return { destroy() {} };
  }

  // =====================================================================================================
  // 4. SKY: the Sun, the Earth and the Moon in 3D (three.js, loaded only here), with the Moon as seen from Earth.
  // =====================================================================================================
  const MONTH = 29.53;
  const PHASES = [
    { key: 'new', at: 0, en: 'New moon', hi: 'अमावस्या' },
    { key: 'waxing_crescent', at: 3.7, en: 'Waxing crescent', hi: 'शुक्ल पक्ष का हँसिया चाँद' },
    { key: 'first_quarter', at: 7.38, en: 'First quarter (half moon)', hi: 'शुक्ल पक्ष का आधा चाँद' },
    { key: 'waxing_gibbous', at: 11.1, en: 'Waxing gibbous', hi: 'शुक्ल पक्ष, लगभग पूरा चाँद' },
    { key: 'full', at: 14.77, en: 'Full moon', hi: 'पूर्णिमा' },
    { key: 'waning_gibbous', at: 18.5, en: 'Waning gibbous', hi: 'कृष्ण पक्ष, लगभग पूरा चाँद' },
    { key: 'last_quarter', at: 22.15, en: 'Last quarter (half moon)', hi: 'कृष्ण पक्ष का आधा चाँद' },
    { key: 'waning_crescent', at: 25.8, en: 'Waning crescent', hi: 'कृष्ण पक्ष का हँसिया चाँद' },
  ];
  const phaseOf = (d) => { let best = PHASES[0], bd = 99; for (const p of PHASES.concat([{ ...PHASES[0], at: MONTH }])) { const x = Math.abs(d - p.at); if (x < bd) { bd = x; best = p; } } return best; };
  let threeLoading = null;
  const loadThree = () => threeLoading || (threeLoading = new Promise((ok, no) => {
    if (window.THREE) return ok(window.THREE);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => (window.THREE ? ok(window.THREE) : no());
    s.onerror = no;
    document.head.appendChild(s);
  }));

  function sky(root, cfg, api) {
    let day = cfg.startDay || 3, playing = false, lastKey = null, alive = true, raf = 0;
    root.innerHTML = `<div class="sky">
      <div class="sky-space" data-key="space"><div class="sky-loading">${esc(api.t({ en: 'Opening space…', hi: 'अंतरिक्ष खुल रहा है…' }))}</div></div>
      <div class="sky-side">
        <div class="sky-view"><canvas width="240" height="240" aria-hidden="true"></canvas><div class="sky-cap">${esc(api.t({ en: 'The Moon seen from Earth', hi: 'पृथ्वी से दिखता चाँद' }))}</div><div class="sky-phase" aria-live="polite"></div></div>
        <label class="sky-lbl" for="skyday">${esc(api.t({ en: 'Day of the month', hi: 'महीने का दिन' }))}: <output id="skydayout"></output></label>
        <input id="skyday" type="range" min="0" max="29.5" step="0.25" data-key="slider">
        <button type="button" class="btn-go" data-key="play"></button>
      </div></div>`;
    const space = root.querySelector('.sky-space');
    const cv = root.querySelector('.sky-view canvas');
    const range = root.querySelector('#skyday');
    const playBtn = root.querySelector('[data-key="play"]');
    let three = null;

    function drawView() {
      const ctx = cv.getContext('2d');
      const W = cv.width, r = 92, cx = W / 2, cy = W / 2;
      ctx.clearRect(0, 0, W, W);
      const sky = ctx.createRadialGradient(cx, cy, 10, cx, cy, W / 1.2);
      sky.addColorStop(0, '#0E1A3F'); sky.addColorStop(1, '#040817');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + ((i * 7) % 10) / 20})`; ctx.fillRect((i * 53) % W, (i * 97) % W, 1.5, 1.5); }
      const th = (day / MONTH) * 2 * Math.PI;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip();
      ctx.fillStyle = '#262A35'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      const lit = '#EDE8D8';
      const waxing = th <= Math.PI;
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing); ctx.closePath(); ctx.fill();
      const k = Math.cos(th);
      ctx.fillStyle = k > 0 ? '#262A35' : lit;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(k) * r, r, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#7A7466';
      [[-30, -20, 16], [25, 30, 12], [10, -40, 9], [-20, 40, 10], [40, -10, 7]].forEach(([x, y, s]) => { ctx.beginPath(); ctx.arc(cx + x, cy + y, s, 0, 2 * Math.PI); ctx.fill(); });
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    }
    function update(fromUser) {
      range.value = String(day);
      root.querySelector('#skydayout').textContent = String(Math.round(day));
      const p = phaseOf(day);
      root.querySelector('.sky-phase').textContent = api.t(p);
      playBtn.textContent = api.t(playing ? { en: 'Pause', hi: 'रोको' } : { en: 'Play a whole month', hi: 'पूरा महीना चलाओ' });
      drawView();
      if (three) three.place(day);
      if (p.key !== lastKey) { lastKey = p.key; api.emit('phase:' + p.key); if (fromUser) api.record(api.t({ en: 'Moved to ', hi: 'पहुँचे: ' }) + api.t(p)); }
    }

    function build3D(T) {
      if (!alive) return;
      const w = space.clientWidth || 600, h = Math.round(w * 0.62);
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h);
      space.innerHTML = '';
      space.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-label', api.t({ en: 'The Sun on the left, the Earth in the middle, and the Moon going round it', hi: 'बाईं ओर सूरज, बीच में पृथ्वी, और उसके चारों ओर घूमता चाँद' }));
      renderer.domElement.setAttribute('role', 'img');
      const scene = new T.Scene();
      scene.background = new T.Color('#050816');
      const cam = new T.PerspectiveCamera(42, w / h, 0.1, 200);
      cam.position.set(0, 7.5, 9.5); cam.lookAt(0, 0, 0);
      const starsG = new T.BufferGeometry();
      const pts = new Float32Array(900 * 3);
      for (let i = 0; i < 900; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 2 * Math.PI, rr = 60; const s = Math.sqrt(1 - u * u); pts.set([rr * s * Math.cos(a), rr * u, rr * s * Math.sin(a)], i * 3); }
      starsG.setAttribute('position', new T.BufferAttribute(pts, 3));
      scene.add(new T.Points(starsG, new T.PointsMaterial({ color: 0xffffff, size: 0.18 })));
      const tex = (fn, s = 256) => { const c = document.createElement('canvas'); c.width = s * 2; c.height = s; fn(c.getContext('2d'), s * 2, s); const t = new T.CanvasTexture(c); return t; };
      const earthTex = tex((g, W, H) => { g.fillStyle = '#1F5FBF'; g.fillRect(0, 0, W, H); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? '#3E9B4F' : '#B98E4E'; g.beginPath(); g.ellipse(rnd() * W, H * 0.2 + rnd() * H * 0.6, 20 + rnd() * 50, 12 + rnd() * 30, rnd() * 3, 0, 2 * Math.PI); g.fill(); } g.fillStyle = '#F2F6FA'; g.fillRect(0, 0, W, H * 0.07); g.fillRect(0, H * 0.93, W, H * 0.07); g.globalAlpha = 0.5; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 18 + rnd() * 30, 4 + rnd() * 6, 0, 0, 2 * Math.PI); g.fill(); } });
      const moonTex = tex((g, W, H) => { g.fillStyle = '#B9B6AE'; g.fillRect(0, 0, W, H); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(80,76,70,${0.15 + (i % 5) / 20})`; g.beginPath(); g.arc((i * 97) % W, (i * 61) % H, 3 + (i % 9), 0, 2 * Math.PI); g.fill(); } }, 128);
      const earth = new T.Mesh(new T.SphereGeometry(1, 48, 48), new T.MeshPhongMaterial({ map: earthTex, shininess: 12 }));
      scene.add(earth);
      const moon = new T.Mesh(new T.SphereGeometry(0.34, 36, 36), new T.MeshPhongMaterial({ map: moonTex, shininess: 2 }));
      scene.add(moon);
      const sunPos = new T.Vector3(-8.6, 0, -1.2);
      const sun = new T.Mesh(new T.SphereGeometry(1.1, 32, 32), new T.MeshBasicMaterial({ color: 0xffd23f }));
      sun.position.copy(sunPos); scene.add(sun);
      const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,120,1)'); gr.addColorStop(0.4, 'rgba(255,170,40,.45)'); gr.addColorStop(1, 'rgba(255,140,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
      glow.scale.set(6.5, 6.5, 1); glow.position.copy(sunPos); scene.add(glow);
      const light = new T.DirectionalLight(0xffffff, 1.35); light.position.copy(sunPos); scene.add(light);
      scene.add(new T.AmbientLight(0x223355, 0.35));
      const ring = new T.Mesh(new T.RingGeometry(3.97, 4.03, 128), new T.MeshBasicMaterial({ color: 0x8ea9ff, transparent: true, opacity: 0.35, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      // Sun's rays: faint lines towards the Earth.
      const rays = new T.Group();
      for (let i = -3; i <= 3; i++) { const g = new T.BufferGeometry().setFromPoints([new T.Vector3(-7.2, 0, i * 0.7), new T.Vector3(-5.0, 0, i * 0.7)]); rays.add(new T.Line(g, new T.LineBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35 }))); }
      scene.add(rays);
      three = {
        place(d) { const th = (d / MONTH) * 2 * Math.PI; moon.position.set(-4 * Math.cos(th), 0, 4 * Math.sin(th)); moon.lookAt(0, 0, 0); renderer.render(scene, cam); },
      };
      const frame = () => {
        if (!alive) return;
        if (!reduced()) earth.rotation.y += 0.004;
        if (playing) { day = (day + 0.06) % MONTH; update(false); }
        else renderer.render(scene, cam);
        raf = requestAnimationFrame(frame);
      };
      update(false);
      raf = requestAnimationFrame(frame);
      const ro = new ResizeObserver(() => { const ww = space.clientWidth; if (!ww) return; const hh = Math.round(ww * 0.62); renderer.setSize(ww, hh); cam.aspect = ww / hh; cam.updateProjectionMatrix(); renderer.render(scene, cam); });
      ro.observe(space);
      three.stop = () => { ro.disconnect(); renderer.dispose(); };
    }
    // Without WebGL: a flat top view, drawn on a canvas.
    function build2D() {
      if (!alive) return;
      space.innerHTML = '<canvas width="600" height="372"></canvas>';
      const c = space.querySelector('canvas');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', api.t({ en: 'Top view: the Sun on the left, the Earth in the middle, the Moon going round', hi: 'ऊपर से दृश्य: बाईं ओर सूरज, बीच में पृथ्वी, चारों ओर घूमता चाँद' }));
      three = {
        place(d) {
          const g = c.getContext('2d'); g.fillStyle = '#050816'; g.fillRect(0, 0, 600, 372);
          const gr = g.createRadialGradient(40, 186, 5, 40, 186, 90); gr.addColorStop(0, '#FFE27A'); gr.addColorStop(1, 'rgba(255,170,40,0)'); g.fillStyle = gr; g.fillRect(0, 60, 160, 260);
          g.strokeStyle = 'rgba(142,169,255,.4)'; g.beginPath(); g.arc(340, 186, 130, 0, 2 * Math.PI); g.stroke();
          g.fillStyle = '#1F5FBF'; g.beginPath(); g.arc(340, 186, 34, 0, 2 * Math.PI); g.fill();
          const th = (d / MONTH) * 2 * Math.PI, mx = 340 - 130 * Math.cos(th), my = 186 + 130 * Math.sin(th);
          g.fillStyle = '#3A3E48'; g.beginPath(); g.arc(mx, my, 14, 0, 2 * Math.PI); g.fill();
          g.fillStyle = '#EDE8D8'; g.beginPath(); g.arc(mx, my, 14, Math.PI / 2, (3 * Math.PI) / 2); g.fill();
        },
      };
      update(false);
      const frame = () => { if (!alive) return; if (playing) { day = (day + 0.06) % MONTH; update(false); } raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);
    }
    range.addEventListener('input', () => {
      if (!api.allowed('slider')) { api.nudge('slider'); range.value = String(day); return; }
      playing = false; day = +range.value; update(true);
    });
    playBtn.addEventListener('click', () => {
      if (!api.allowed('play')) { api.nudge('play'); return; }
      playing = !playing; update(false); api.emit('play'); api.record(api.t({ en: 'Played the month', hi: 'महीना चलाया' }));
    });
    const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })();
    if (hasGL) loadThree().then(build3D, build2D); else build2D();
    update(false);
    return { destroy() { alive = false; cancelAnimationFrame(raf); if (three && three.stop) three.stop(); } };
  }

  window.NCA = { eqHTML, esc, sub, templates: { beaker, fractions, words, sky }, SUB };
})();
