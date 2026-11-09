// Template: Logic gates and bits. Binary numbers (place values, doubling, overflow), the six school logic gates drawn
// with their real symbols, truth tables the child fills in and checks, how computers store data (ASCII and Unicode
// text, a black-and-white picture, an RGB colour, the byte ladder) and the half / full adder built from gates.
// Everything is computed, not scripted: gates are evaluated from their Boolean functions, the adder is built from
// XOR / AND / OR exactly as in the textbook, characters come from their real codes (ASCII 65 = A, UTF-8 bytes for
// Hindi letters). A lab can only choose among the things listed here. Config:
//   { mode: 'binary' | 'gates' | 'truth-table' | 'encoding' | 'adder',
//     gates?: ['AND','OR','NOT','NAND','NOR','XOR']  gates / truth-table only (1-6, each once; default AND OR NOT / AND)
//     value?: integer   binary: a number 0-255 the child must build with the bits (answer button);
//                       encoding: an ASCII code 32-126, the letter the child must store (answer button);
//                       adder: how many bits are added, 1-4 (1 = a half adder, more = a ripple of half + full adders) }
// Targets: bit:<i> (i = power of two, 0 = rightmost), input:A / input:B (adder with 2+ bits: input:A0, input:B0 ...),
// gate:<name>, answer, and in encoding: char, tab:*, pixel:*, rgb:*, preset:*, unit:*; in binary: shl, shr, step, reset.
// Events: toggled, converted, output:0 / output:1 (adder: the carry out), answered:right, answered:wrong.
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['binary', 'gates', 'truth-table', 'encoding', 'adder'];
  const GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

  // ---------------------------------------------------------------- the gates (Boolean functions are the truth)
  const G = {
    AND: { f: (a, b) => a & b, n: 2, col: '#2563EB', ink: '#FFFFFF', name: T2('AND gate', 'AND गेट'), expr: 'A · B',
      rule: T2('The output is 1 only when BOTH inputs are 1.', 'आउटपुट तभी 1 होता है जब दोनों इनपुट 1 हों।'),
      idea: T2('Like two switches one after the other on a wire: the bulb glows only if both are on.', 'जैसे एक तार में एक के बाद एक दो स्विच: दोनों चालू हों तभी बल्ब जलता है।') },
    OR: { f: (a, b) => a | b, n: 2, col: '#22C55E', ink: '#1E293B', name: T2('OR gate', 'OR गेट'), expr: 'A + B',
      rule: T2('The output is 1 when AT LEAST ONE input is 1.', 'कम से कम एक इनपुट 1 हो, तो आउटपुट 1 होता है।'),
      idea: T2('Like two switches side by side (in parallel): either one lights the bulb.', 'जैसे दो स्विच अगल-बगल (समांतर क्रम में): कोई भी एक बल्ब जला देता है।') },
    NOT: { f: (a) => 1 - a, n: 1, col: '#FF7A1A', ink: '#1E293B', name: T2('NOT gate', 'NOT गेट'), expr: 'A′',
      rule: T2('The output is the opposite of the input: 0 becomes 1 and 1 becomes 0.', 'आउटपुट इनपुट का उल्टा होता है: 0 से 1 और 1 से 0।'),
      idea: T2('It is an inverter: it turns a signal upside down. It has only one input.', 'यह इनवर्टर है: संकेत को उलट देता है। इसमें केवल एक इनपुट होता है।') },
    NAND: { f: (a, b) => 1 - (a & b), n: 2, col: '#8B3DFF', ink: '#FFFFFF', name: T2('NAND gate', 'NAND गेट'), expr: '(A · B)′',
      rule: T2('NOT AND: the output is 0 only when both inputs are 1.', 'NOT AND: आउटपुट केवल तब 0 होता है जब दोनों इनपुट 1 हों।'),
      idea: T2('NAND is a "universal gate": every other gate can be built from NAND gates alone.', 'NAND "सार्वत्रिक गेट" है: केवल NAND गेटों से बाकी सब गेट बनाए जा सकते हैं।') },
    NOR: { f: (a, b) => 1 - (a | b), n: 2, col: '#14B8A6', ink: '#1E293B', name: T2('NOR gate', 'NOR गेट'), expr: '(A + B)′',
      rule: T2('NOT OR: the output is 1 only when both inputs are 0.', 'NOT OR: आउटपुट केवल तब 1 होता है जब दोनों इनपुट 0 हों।'),
      idea: T2('NOR is also a universal gate.', 'NOR भी सार्वत्रिक गेट है।') },
    XOR: { f: (a, b) => a ^ b, n: 2, col: '#FF6B57', ink: '#1E293B', name: T2('XOR gate', 'XOR गेट'), expr: 'A ⊕ B',
      rule: T2('The output is 1 when the two inputs are DIFFERENT.', 'दोनों इनपुट अलग-अलग हों, तब आउटपुट 1 होता है।'),
      idea: T2('Like the two switches of a staircase light: flipping either one changes the light.', 'जैसे सीढ़ी की बत्ती के दो स्विच: किसी भी एक को पलटो तो बत्ती बदल जाती है।') },
  };
  const onlyNot = (gs) => gs.every((g) => G[g].n === 1);

  // ---------------------------------------------------------------- small texts
  const TXT = {
    bit: T2('Bit', 'बिट'), place: T2('place value', 'स्थानीय मान'), input: T2('Input', 'इनपुट'), output: T2('Output', 'आउटपुट'),
    check: T2('Check', 'जाँचो'), reset: T2('Start again', 'फिर से'), dec: T2('Decimal', 'दशमलव'), bin: T2('Binary', 'द्विआधारी'),
    hex: T2('Hex', 'हेक्स'), sum: T2('Sum', 'योग'), carry: T2('Carry', 'हासिल'),
  };
  const bstr = (v, n) => v.toString(2).padStart(n, '0');
  const g4 = (s) => s.replace(/(.{4})(?=.)/g, '$1 ');
  const bitName = (api, i) => `${api.t(TXT.bit)} ${i}, ${api.t(TXT.place)} ${Math.pow(2, i)}`;

  // ---------------------------------------------------------------- drawing: wires, gates, lamps (SVG)
  const defs = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${GATES.map((k) => `<linearGradient id="lg-g-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mixHex(G[k].col, '#ffffff', 0.32)}"/><stop offset="1" stop-color="${G[k].col}"/></linearGradient>`).join('')}<radialGradient id="lg-bulb" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFF6C4"/><stop offset=".6" stop-color="#FFD23F"/><stop offset="1" stop-color="#F5B90A"/></radialGradient></defs></svg>`;
  const wire = (pts, on) => { const d = 'M' + pts.map((p) => p.join(' ')).join('L'); return `<path class="lg-w ${on ? 'on' : 'off'}" d="${d}"/>${on ? `<path class="lg-fl" d="${d}"/>` : ''}`; };
  const dot = (x, y, on) => `<circle class="lg-jn ${on ? 'on' : 'off'}" cx="${x}" cy="${y}" r="3.6"/>`;
  const lamp = (cx, cy, r, v, label) => `<g class="lg-lp ${v ? 'on' : 'off'}">${v ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" class="lg-halo"/>` : ''}<circle cx="${cx}" cy="${cy}" r="${r}" class="lg-lpc"/><text x="${cx}" y="${cy + r * 0.38}" text-anchor="middle" font-size="${Math.round(r * 1.2)}">${v}</text>${label ? `<text class="lg-lbl" x="${cx}" y="${cy - r - 4}" text-anchor="middle" font-size="12">${esc(label)}</text>` : ''}</g>`;

  // One gate in local coordinates: body 0..60 wide, 50 high; inputs at x=-12 (y 15 and 35, NOT: 25); output at x=72, y=25.
  function gateSVG(type, a, b, out) {
    const inv = type === 'NOT' || type === 'NAND' || type === 'NOR';
    const bw = inv ? 50 : 60;
    let body;
    if (type === 'AND' || type === 'NAND') body = `M0 0H${bw - 25}A25 25 0 0 1 ${bw - 25} 50H0Z`;
    else if (type === 'NOT') body = 'M0 0L50 25L0 50Z';
    else body = `M0 0Q${bw * 0.5} 0 ${bw} 25Q${bw * 0.5} 50 0 50Q${bw * 0.22} 25 0 0Z`;
    const x0 = type === 'XOR' ? -3 : type === 'OR' || type === 'NOR' ? 5 : 0;
    let s = '';
    if (type === 'NOT') s += wire([[-12, 25], [0, 25]], a);
    else s += wire([[-12, 15], [x0, 15]], a) + wire([[-12, 35], [x0, 35]], b);
    s += wire([[inv ? 60 : bw, 25], [72, 25]], out);
    s += `<path class="lg-body${out ? ' lg-lit' : ''}" d="${body}" fill="url(#lg-g-${type})"/>`;
    if (type === 'XOR') s += `<path class="lg-xo" d="M-8 0Q${bw * 0.22 - 8} 25 -8 50"/>`;
    if (inv) s += `<circle class="lg-bub" cx="55" cy="25" r="5" fill="${G[type].col}"/>`;
    const lx = { AND: 24, NAND: 21, OR: 29, NOR: 24, XOR: 29, NOT: 14 }[type];
    s += `<text class="lg-gl" x="${lx}" y="${type === 'NOT' || type === 'NAND' || type === 'NOR' ? 29 : 30}" text-anchor="middle" font-size="${type === 'NAND' || type === 'NOR' || type === 'NOT' ? 11 : 13}" fill="${G[type].ink}">${type}</text>`;
    return s;
  }
  const at = (x, y, inner, extra) => `<g transform="translate(${x} ${y})"${extra || ''}>${inner}</g>`;

  // A gate with its input lamps and an output bulb (the gates cards, the truth-table helper).
  function gateScene(type, a, b) {
    const n = G[type].n, out = G[type].f(a, b);
    let s = '';
    if (n === 1) s += wire([[-26, 25], [-12, 25]], a) + lamp(-35, 25, 9, a) + `<text class="lg-lbl" x="-54" y="29" font-size="12" text-anchor="middle">A</text>`;
    else s += wire([[-26, 15], [-12, 15]], a) + wire([[-26, 35], [-12, 35]], b) + lamp(-35, 15, 9, a) + lamp(-35, 35, 9, b) + `<text class="lg-lbl" x="-54" y="19" font-size="12" text-anchor="middle">A</text><text class="lg-lbl" x="-54" y="39" font-size="12" text-anchor="middle">B</text>`;
    s += gateSVG(type, a, b, out);
    s += wire([[72, 25], [92, 25]], out);
    s += bulb(106, 25, 13, out);
    return s;
  }
  function bulb(cx, cy, r, v) {
    let s = '';
    if (v) {
      s += `<circle class="lg-halo" cx="${cx}" cy="${cy}" r="${r + 9}"/>`;
      for (let k = 0; k < 8; k++) { const an = (k * Math.PI) / 4, c = Math.cos(an), sn = Math.sin(an); s += `<line class="lg-ray" x1="${(cx + c * (r + 4)).toFixed(1)}" y1="${(cy + sn * (r + 4)).toFixed(1)}" x2="${(cx + c * (r + 9)).toFixed(1)}" y2="${(cy + sn * (r + 9)).toFixed(1)}"/>`; }
    }
    s += `<circle class="lg-bulb ${v ? 'on' : 'off'}" cx="${cx}" cy="${cy}" r="${r}"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" class="lg-bt ${v ? 'on' : 'off'}">${v}</text>`;
    return s;
  }
  const sceneSVG = (type, a, b, label) => `<svg class="lg-scene" viewBox="-62 -10 190 70" role="img" aria-label="${esc(label)}">${gateScene(type, a, b)}</svg>`;

  // ---------------------------------------------------------------- adders: pure logic and drawing
  function rippleCells(n, a, b) {
    const cells = []; let c = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] ^ b[i], s = i === 0 ? x : x ^ c, co = i === 0 ? a[i] & b[i] : (a[i] & b[i]) | (x & c);
      cells.push({ a: a[i], b: b[i], cin: i === 0 ? 0 : c, x, s, co });
      c = co;
    }
    return { cells, carry: c };
  }
  // Half adder drawn from an XOR (sum) and an AND (carry). Gates are keyed when `keyed`.
  function halfSVG(A, B, keyed, api) {
    const S = A ^ B, C = A & B;
    const gt = (type, x, y, a, b, o, exp) => at(x, y, gateSVG(type, a, b, o), keyed ? ` class="lg-gt" role="button" tabindex="0" data-key="gate:${type}" aria-label="${esc(api.t(G[type].name))}: ${a}, ${b} → ${o}. ${esc(api.t(exp))}"` : '');
    let s = wire([[0, 35], [58, 35]], A) + wire([[22, 35], [22, 115], [58, 115]], A) + dot(22, 35, A);
    s += wire([[0, 55], [58, 55]], B) + wire([[44, 55], [44, 135], [58, 135]], B) + dot(44, 55, B);
    s += gt('XOR', 70, 20, A, B, S, T2('XOR gives the sum bit.', 'XOR योग का बिट देता है।'));
    s += gt('AND', 70, 100, A, B, C, T2('AND gives the carry bit.', 'AND हासिल का बिट देता है।'));
    s += wire([[142, 45], [200, 45]], S) + wire([[142, 125], [200, 125]], C);
    s += lamp(-10, 35, 9, A) + lamp(-10, 55, 9, B);
    s += lamp(214, 45, 12, S) + lamp(214, 125, 12, C);
    s += `<text class="lg-lbl" x="-28" y="39" font-size="13" text-anchor="middle">A</text><text class="lg-lbl" x="-28" y="59" font-size="13" text-anchor="middle">B</text>`;
    s += `<text class="lg-lbl" x="238" y="50" font-size="14">${esc(api.t(T2('Sum', 'योग')))}</text><text class="lg-lbl" x="238" y="130" font-size="14">${esc(api.t(T2('Carry', 'हासिल')))}</text>`;
    return `<svg class="lg-circ" viewBox="-40 8 340 160" role="img" aria-label="${esc(api.t(T2(`Half adder: A=${A}, B=${B}, sum ${S}, carry ${C}`, `अर्ध योजक: A=${A}, B=${B}, योग ${S}, हासिल ${C}`)))}">${s}</svg>`;
  }
  // Full adder: two XORs, two ANDs and an OR.
  function fullSVG(A, B, Ci, api) {
    const X = A ^ B, S = X ^ Ci, A1 = A & B, A2 = X & Ci, Co = A1 | A2;
    const gt = (type, x, y, a, b, o) => at(x, y, gateSVG(type, a, b, o));
    let s = wire([[0, 35], [58, 35]], A) + wire([[22, 35], [22, 165], [58, 165]], A) + dot(22, 35, A);
    s += wire([[0, 55], [58, 55]], B) + wire([[44, 55], [44, 185], [58, 185]], B) + dot(44, 55, B);
    s += wire([[0, 105], [166, 105], [166, 55], [178, 55]], Ci) + wire([[166, 105], [166, 165], [178, 165]], Ci) + dot(166, 105, Ci);
    s += wire([[142, 45], [154, 45], [154, 35], [178, 35]], X) + wire([[154, 45], [154, 145], [178, 145]], X) + dot(154, 45, X);
    s += gt('XOR', 70, 20, A, B, X) + gt('AND', 70, 150, A, B, A1) + gt('XOR', 190, 20, X, Ci, S) + gt('AND', 190, 130, X, Ci, A2);
    s += wire([[142, 175], [148, 175], [148, 205], [280, 205], [280, 120], [288, 120]], A1);
    s += wire([[262, 155], [270, 155], [270, 100], [288, 100]], A2);
    s += gt('OR', 300, 85, A2, A1, Co);
    s += wire([[262, 45], [330, 45]], S) + wire([[372, 110], [392, 110]], Co);
    s += lamp(-10, 35, 9, A) + lamp(-10, 55, 9, B) + lamp(-10, 105, 9, Ci);
    s += lamp(344, 45, 12, S) + lamp(406, 110, 12, Co);
    s += `<text class="lg-lbl" x="-28" y="39" font-size="13" text-anchor="middle">A</text><text class="lg-lbl" x="-28" y="59" font-size="13" text-anchor="middle">B</text><text class="lg-lbl" x="-30" y="109" font-size="13" text-anchor="middle">Cin</text>`;
    s += `<text class="lg-lbl" x="344" y="22" font-size="14" text-anchor="middle">${esc(api.t(T2('Sum', 'योग')))}</text><text class="lg-lbl" x="406" y="86" font-size="14" text-anchor="middle">Cout</text>`;
    return `<svg class="lg-circ" viewBox="-44 10 480 206" role="img" aria-label="${esc(api.t(T2(`Full adder: A=${A}, B=${B}, carry in ${Ci}, sum ${S}, carry out ${Co}`, `पूर्ण योजक: A=${A}, B=${B}, आने वाला हासिल ${Ci}, योग ${S}, जाने वाला हासिल ${Co}`)))}">${s}</svg>`;
  }

  // ---------------------------------------------------------------- the template core: draw, focus, clicks
  function Core(root, api, o) {
    root.innerHTML = defs() + '<div class="lg"><div class="lg-view"></div><div class="lg-live" aria-live="polite" role="status"></div></div>';
    const vw = root.querySelector('.lg-view'), lv = root.querySelector('.lg-live');
    const timers = [];
    const self = {
      last: null, vw, lv,
      draw() {
        const ae = document.activeElement;
        const fk = ae && vw.contains(ae) ? ae.getAttribute('data-key') : null;
        vw.innerHTML = o.view();
        self.last = null;
        if (fk) { const el = [...vw.querySelectorAll('[data-key]')].find((x) => x.getAttribute('data-key') === fk); if (el && el.focus) el.focus({ preventScroll: true }); }
      },
      say(msg, tone) { lv.textContent = msg; lv.className = 'lg-live' + (tone ? ' ' + tone : ''); },
      ok(key) { if (api.allowed(key)) return true; api.nudge(key); return false; },
      later(fn, ms) { timers.push(setTimeout(fn, ms)); },
      destroy() { timers.forEach(clearTimeout); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.removeEventListener('input', onInput); root.innerHTML = ''; },
    };
    const onClick = (e) => { const el = e.target.closest && e.target.closest('[data-key]'); if (!el || !root.contains(el) || el.tagName === 'INPUT') return; o.act(el.getAttribute('data-key'), el); };
    const onKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } };
    const onInput = (e) => { const el = e.target; if (el && el.tagName === 'INPUT' && o.input) o.input(el.getAttribute('data-key'), el); };
    root.addEventListener('click', onClick); root.addEventListener('keydown', onKey); root.addEventListener('input', onInput);
    self.draw();
    return self;
  }
  const E = (api, x) => esc(api.t(x));

  // A row of bit switches, nibbles grouped. keyPrefix 'bit' -> data-key="bit:<i>".
  function bitRow(v, n, last, api) {
    let s = '<div class="lg-bits" role="group" aria-label="' + esc(api.t(T2('Bits', 'बिट'))) + '">';
    for (let hi = n - 1; hi >= 0; hi -= 4) {
      s += '<div class="lg-nib">';
      for (let i = hi; i > hi - 4 && i >= 0; i--) {
        const on = (v >> i) & 1;
        s += `<div class="lg-bitcol"><span class="lg-pv">${Math.pow(2, i)}</span><button type="button" class="lg-bit${on ? ' on' : ''}${last === 'bit:' + i ? ' chg' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}" data-key="bit:${i}" aria-label="${esc(bitName(api, i))}"><span>${on}</span></button><span class="lg-pe">2<sup>${i}</sup></span></div>`;
      }
      s += '</div>';
    }
    return s + '</div>';
  }
  const sumText = (v, n) => { const p = []; for (let i = n - 1; i >= 0; i--) if ((v >> i) & 1) p.push(Math.pow(2, i)); return p.length ? p.join(' + ') : '0'; };

  // An input switch (a real button with role switch).
  function sw(key, label, val, last, api, sm) {
    return `<button type="button" class="lg-sw${sm ? ' sm' : ''}${val ? ' on' : ''}${last === key ? ' chg' : ''}" role="switch" aria-checked="${val ? 'true' : 'false'}" data-key="${key}" aria-label="${esc(api.t(TXT.input))} ${esc(label)}"><span class="lg-swl">${esc(label)}</span><span class="lg-trk"><i class="lg-kn"></i></span><span class="lg-swv">${val}</span></button>`;
  }

  // ================================================================ BINARY
  function binaryMode(root, c, api) {
    let ctl;
    const tgt = c.value;
    const n = tgt != null && tgt <= 15 ? 4 : 8;
    const max = (1 << n) - 1;
    let v = 0;
    const view = () => {
      const hex = v.toString(16).toUpperCase();
      return `<div class="lg-board"><h3 class="lg-h">${E(api, T2('Bits and place values', 'बिट और स्थानीय मान'))}</h3>${bitRow(v, n, ctl && ctl.last, api)}
        <div class="lg-eq"><span class="lg-sum">${sumText(v, n)}</span><span class="lg-big" aria-hidden="true">= ${v}</span></div></div>
        <div class="lg-chips"><span class="lg-chip"><small>${E(api, TXT.bin)}</small><b>${g4(bstr(v, n))}</b></span><span class="lg-chip"><small>${E(api, TXT.dec)}</small><b>${v}</b></span><span class="lg-chip"><small>${E(api, TXT.hex)}</small><b>${hex}</b></span></div>
        <div class="lg-row"><button type="button" class="lg-btn" data-key="shl"${v * 2 > max ? ' aria-disabled="true"' : ''}>${E(api, T2('× 2 (shift left)', '× 2 (बाएँ खिसकाओ)'))}</button><button type="button" class="lg-btn" data-key="shr"${v < 1 ? ' aria-disabled="true"' : ''}>${E(api, T2('÷ 2 (shift right)', '÷ 2 (दाएँ खिसकाओ)'))}</button><button type="button" class="lg-btn" data-key="step">+ 1</button><button type="button" class="lg-btn ghost" data-key="reset">${E(api, TXT.reset)}</button></div>
        ${tgt != null ? `<div class="lg-ask"><span>${E(api, T2('Make the number', 'यह संख्या बनाओ'))} <b class="lg-tgt">${tgt}</b></span><button type="button" class="lg-btn go" data-key="answer">${E(api, TXT.check)}</button></div>` : ''}`;
    };
    const changed = (why) => { ctl.draw(); api.emit('converted'); api.record(`${why}: ${bstr(v, n)} = ${v}`); };
    const act = (k) => {
      if (!ctl.ok(k)) return;
      if (k.startsWith('bit:')) {
        const i = +k.slice(4); v ^= 1 << i; ctl.draw(); ctl.last = null;
        ctl.say(`${api.t(T2('Bit', 'बिट'))} ${i}: ${(v >> i) & 1 ? api.t(T2('on, adds', 'चालू, जोड़ता है')) : api.t(T2('off, adds 0 instead of', 'बंद, नहीं जोड़ता'))} ${Math.pow(2, i)}. ${sumText(v, n)} = ${v}`);
        api.emit('toggled'); api.emit('converted'); api.record(`bit ${i}: ${bstr(v, n)} = ${v}`);
      } else if (k === 'shl') {
        if (v * 2 > max) { ctl.say(api.t(T2(`No room: ${v * 2} needs more than ${n} bits.`, `जगह नहीं: ${v * 2} के लिए ${n} से ज़्यादा बिट चाहिए।`)), 'warn'); return; }
        v *= 2; changed('x2'); ctl.say(api.t(T2('Every bit moved one place left, so the number doubled.', 'हर बिट एक स्थान बाएँ गया, इसलिए संख्या दोगुनी हो गई।')));
      } else if (k === 'shr') {
        if (v < 1) return; const odd = v & 1; v >>= 1; changed('/2');
        ctl.say(api.t(odd ? T2('Every bit moved one place right: the number halved; the 1 that fell off the end is lost.', 'हर बिट एक स्थान दाएँ गया: संख्या आधी हो गई; किनारे से गिरा 1 खो गया।') : T2('Every bit moved one place right, so the number halved.', 'हर बिट एक स्थान दाएँ गया, इसलिए संख्या आधी हो गई।')));
      } else if (k === 'step') {
        if (v === max) { v = 0; changed('+1'); ctl.say(api.t(T2(`${max} + 1 needs one more bit than ${n}. A ${n}-bit counter wraps back to 0: this is overflow.`, `${max} + 1 के लिए ${n} से एक बिट ज़्यादा चाहिए। ${n}-बिट काउंटर वापस 0 पर लौट जाता है: इसे ओवरफ़्लो कहते हैं।`)), 'warn'); }
        else { v++; changed('+1'); ctl.say(api.t(T2('Adding 1: the rightmost 0 turns on and every 1 to its right turns off (a carry).', '1 जोड़ना: सबसे दाएँ का 0 चालू होता है और उसके दाएँ के सब 1 बंद हो जाते हैं (हासिल)।'))); }
      } else if (k === 'reset') { v = 0; changed('reset'); ctl.say(api.t(T2('All bits are off: the number is 0.', 'सब बिट बंद हैं: संख्या 0 है।'))); }
      else if (k === 'answer') {
        if (v === tgt) { ctl.say(`${api.t(T2('Yes!', 'सही!'))} ${sumText(v, n)} = ${tgt}  (${bstr(v, n)})`, 'good'); api.emit('answered:right'); api.celebrate(); }
        else {
          const d = Math.abs(v - tgt);
          ctl.say(`${api.t(T2(`You made ${v}. That is ${d} ${v < tgt ? 'too small' : 'too big'}. Try again.`, `तुमने ${v} बनाया। यह ${d} ${v < tgt ? 'कम' : 'ज़्यादा'} है। फिर कोशिश करो।`))}`, 'bad');
          api.emit('answered:wrong');
        }
        api.record(`answer ${v} (target ${tgt})`);
      }
    };
    ctl = Core(root, api, { view, act });
    ctl.say(tgt != null ? api.t(T2(`Tap the switches to make ${tgt}. Each bit is worth double the bit on its right.`, `स्विच दबाकर ${tgt} बनाओ। हर बिट अपने दाएँ वाले बिट से दोगुना मान रखता है।`)) : api.t(T2('Tap a switch. Each bit is worth double the bit on its right.', 'कोई स्विच दबाओ। हर बिट अपने दाएँ वाले बिट से दोगुना मान रखता है।')));
    return ctl;
  }

  // ================================================================ GATES
  function gatesMode(root, c, api) {
    let ctl;
    const gs = c.gates || ['AND', 'OR', 'NOT'];
    const noB = onlyNot(gs);
    let A = 0, B = 0, sel = 0;
    const out = (g) => G[g].f(A, B);
    const rowsOf = (g) => (G[g].n === 1 ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]]);
    const view = () => {
      const last = ctl && ctl.last;
      const cards = gs.map((g, i) => {
        const o = out(g), lbl = `${api.t(G[g].name)}: A=${A}${G[g].n === 2 ? `, B=${B}` : ''} → ${o}`;
        return `<button type="button" class="lg-gc${i === sel ? ' sel' : ''}" data-key="gate:${g}" aria-pressed="${i === sel}" aria-label="${esc(lbl)}"><span class="lg-gn" style="--c:${G[g].col};--k:${G[g].ink}">${esc(api.t(G[g].name))}</span><span class="lg-gsvg">${sceneSVG(g, A, B, lbl)}</span><span class="lg-gx">Y = ${esc(G[g].expr)} = <b>${o}</b></span></button>`;
      }).join('');
      const g = gs[sel], rows = rowsOf(g);
      const tbl = `<table class="lg-tt"><thead><tr><th scope="col">A</th>${G[g].n === 2 ? '<th scope="col">B</th>' : ''}<th scope="col">Y</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr${a === A && (G[g].n === 1 || b === B) ? ' class="cur"' : ''}><td>${a}</td>${G[g].n === 2 ? `<td>${b}</td>` : ''}<td><b>${G[g].f(a, b)}</b></td></tr>`).join('')}</tbody></table>`;
      return `<div class="lg-panel"><h3 class="lg-h">${E(api, T2('Inputs: flip the switches', 'इनपुट: स्विच पलटो'))}</h3><div class="lg-sws">${sw('input:A', 'A', A, last, api)}${noB ? '' : sw('input:B', 'B', B, last, api)}</div></div>
        <div class="lg-gcards${gs.length === 1 ? ' one' : ''}">${cards}</div>
        <div class="lg-panel lg-detail"><div><h3 class="lg-h" style="color:inherit"><span class="lg-gn" style="--c:${G[g].col};--k:${G[g].ink}">${esc(api.t(G[g].name))}</span></h3><p class="lg-rule">${E(api, G[g].rule)}</p><p class="lg-idea">${E(api, G[g].idea)}</p><p class="lg-expr">Y = <b>${esc(G[g].expr)}</b> <span class="muted">(′ = NOT)</span></p></div><div><div class="lg-cap">${E(api, T2('Truth table', 'सत्य सारणी'))}</div>${tbl}</div></div>`;
    };
    const act = (k) => {
      if (!ctl.ok(k)) return;
      if (k === 'input:A' || k === 'input:B') {
        if (k === 'input:A') A ^= 1; else B ^= 1;
        ctl.draw(); const g = gs[sel], o = out(g);
        ctl.say(`${api.t(G[g].name)}: A = ${A}${G[g].n === 2 ? `, B = ${B}` : ''} → ${api.t(TXT.output)} ${o}`);
        api.emit('toggled'); api.emit('output:' + o); api.record(`A=${A} B=${B} ${g} -> ${o}`);
      } else if (k.startsWith('gate:')) {
        const i = gs.indexOf(k.slice(5)); if (i < 0) return; sel = i; ctl.draw(); const g = gs[sel], o = out(g);
        ctl.say(`${api.t(G[g].name)}: ${api.t(G[g].rule)}`); api.emit('output:' + o); api.record(`looked at ${g}`);
      }
    };
    ctl = Core(root, api, { view, act });
    ctl.say(api.t(T2('Flip the input switches and watch each gate decide.', 'इनपुट स्विच पलटो और देखो हर गेट कैसे फ़ैसला करता है।')));
    return ctl;
  }

  // ================================================================ TRUTH TABLE
  function tableMode(root, c, api) {
    let ctl;
    const gs = c.gates || ['AND'];
    const oneIn = onlyNot(gs);
    const rows = oneIn ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
    let A = 0, B = 0, sel = 0, done = false;
    const cell = {}, mark = {};
    const view = () => {
      const last = ctl && ctl.last, g0 = gs[sel];
      const head = gs.map((g, i) => `<th scope="col"><button type="button" class="lg-gh${i === sel ? ' sel' : ''}" data-key="gate:${g}" aria-pressed="${i === sel}" style="--c:${G[g].col};--k:${G[g].ink}">${esc(g)}</button></th>`).join('');
      const body = rows.map(([a, b], r) => {
        const cur = a === A && (oneIn || b === B);
        return `<tr${cur ? ' class="cur"' : ''}><td>${a}</td>${oneIn ? '' : `<td>${b}</td>`}${gs.map((g) => {
          const k = g + ':' + r, st = cell[k], m = mark[k];
          const sw2 = st == null ? '?' : st;
          return `<td><button type="button" class="lg-cell${st == null ? ' empty' : ''}${m ? ' ' + m : ''}${last === 'cell:' + k ? ' chg' : ''}" data-key="cell:${k}" aria-label="${esc(api.t(G[g].name))}, A=${a}${G[g].n === 2 ? `, B=${b}` : ''}: ${st == null ? esc(api.t(T2('not filled yet', 'अभी खाली'))) : st}">${sw2}</button></td>`;
        }).join('')}</tr>`;
      }).join('');
      return `<div class="lg-panel lg-try"><div><h3 class="lg-h">${E(api, T2('Try it: flip the switches', 'आज़माओ: स्विच पलटो'))}</h3><div class="lg-sws">${sw('input:A', 'A', A, last, api)}${oneIn ? '' : sw('input:B', 'B', B, last, api)}</div></div><div class="lg-gsvg">${sceneSVG(g0, A, B, `${api.t(G[g0].name)}: A=${A}${G[g0].n === 2 ? `, B=${B}` : ''} → ${G[g0].f(A, B)}`)}</div></div>
        <div class="lg-panel"><h3 class="lg-h">${E(api, T2('Fill the truth table: tap a box to make it 0 or 1', 'सत्य सारणी भरो: खाना दबाकर 0 या 1 करो'))}</h3><div class="lg-tblwrap"><table class="lg-tt big"><thead><tr><th scope="col">A</th>${oneIn ? '' : '<th scope="col">B</th>'}${head}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="lg-expr">${gs.map((g) => `${esc(g)}: Y = <b>${esc(G[g].expr)}</b>`).join(' &nbsp; ')}</p>
        <div class="lg-ask"><span class="muted">${E(api, T2('The glowing row shows what the gate does for the switches above.', 'चमकती पंक्ति दिखाती है कि ऊपर के स्विचों पर गेट क्या करता है।'))}</span><button type="button" class="lg-btn go" data-key="answer">${E(api, TXT.check)}</button><button type="button" class="lg-btn ghost" data-key="clear">${E(api, T2('Clear', 'साफ़ करो'))}</button></div></div>`;
    };
    const act = (k) => {
      if (!ctl.ok(k)) return;
      if (k === 'input:A' || k === 'input:B') {
        if (k === 'input:A') A ^= 1; else B ^= 1;
        ctl.draw(); const g = gs[sel], o = G[g].f(A, B);
        ctl.say(`${api.t(G[g].name)}: A = ${A}${G[g].n === 2 ? `, B = ${B}` : ''} → ${api.t(TXT.output)} ${o}`);
        api.emit('toggled'); api.emit('output:' + o); api.record(`A=${A} B=${B} ${g} -> ${o}`);
      } else if (k.startsWith('gate:')) {
        const i = gs.indexOf(k.slice(5)); if (i < 0) return; sel = i; ctl.draw(); const g = gs[sel];
        ctl.say(`${api.t(G[g].name)}: ${api.t(G[g].rule)}`); api.emit('output:' + G[g].f(A, B));
      } else if (k.startsWith('cell:')) {
        const id = k.slice(5); const cur = cell[id];
        cell[id] = cur == null ? 1 : cur === 1 ? 0 : 1; mark[id] = ''; done = false;
        ctl.draw(); ctl.last = null;
        const [g, r] = id.split(':'), [a, b] = rows[+r];
        ctl.say(`${g}, A = ${a}${G[g].n === 2 ? `, B = ${b}` : ''}: ${api.t(TXT.output)} ${cell[id]}`);
        api.emit('toggled'); api.record(`${g} row ${r} = ${cell[id]}`);
      } else if (k === 'clear') {
        for (const x in cell) delete cell[x]; for (const x in mark) delete mark[x]; done = false; ctl.draw();
        ctl.say(api.t(T2('Table cleared. Fill it again.', 'सारणी साफ़ हो गई। फिर से भरो।')));
      } else if (k === 'answer') {
        const empties = []; let wrong = 0;
        gs.forEach((g) => rows.forEach(([a, b], r) => { const id = g + ':' + r; if (cell[id] == null) empties.push(id); }));
        if (empties.length) { ctl.say(api.t(T2(`Fill every box first: ${empties.length} left.`, `पहले हर खाना भरो: ${empties.length} बाकी हैं।`)), 'warn'); empties.forEach((x) => { mark[x] = 'wrong'; }); ctl.draw(); empties.forEach((x) => { mark[x] = ''; }); return; }
        gs.forEach((g) => rows.forEach(([a, b], r) => { const id = g + ':' + r, ok = cell[id] === G[g].f(a, b); mark[id] = ok ? 'right' : 'wrong'; if (!ok) wrong++; }));
        ctl.draw();
        if (!wrong) { done = true; ctl.say(api.t(T2('Every box is right! The table matches the gate.', 'हर खाना सही है! सारणी गेट से मेल खाती है।')), 'good'); api.emit('answered:right'); api.celebrate(); }
        else { ctl.say(api.t(T2(`${wrong} box${wrong > 1 ? 'es are' : ' is'} wrong (shown in red). Use the switches above to see what the gate really does.`, `${wrong} खाने गलत हैं (लाल)। ऊपर के स्विच चलाकर देखो कि गेट असल में क्या करता है।`)), 'bad'); api.emit('answered:wrong'); }
        api.record(`checked table: ${wrong} wrong`);
      }
    };
    ctl = Core(root, api, { view, act });
    ctl.say(api.t(T2('Work out the output of each row, then press Check.', 'हर पंक्ति का आउटपुट निकालो, फिर "जाँचो" दबाओ।')));
    return ctl;
  }

  // ================================================================ ENCODING
  const PRESETS = { saffron: ['Saffron', 'केसरिया', [255, 153, 51]], white: ['White', 'सफ़ेद', [255, 255, 255]], green: ['Green', 'हरा', [19, 136, 8]], navy: ['Navy blue', 'गहरा नीला', [0, 0, 128]] };
  const UNITS = [
    { k: 'B', n: T2('byte', 'बाइट'), p: 0, eg: T2('One letter, like A, takes 1 byte.', 'एक अक्षर, जैसे A, 1 बाइट लेता है।') },
    { k: 'KB', n: T2('kilobyte', 'किलोबाइट'), p: 1, eg: T2('About a page of plain text (around 2,000 letters).', 'सादे पाठ का लगभग एक पन्ना (करीब 2,000 अक्षर)।') },
    { k: 'MB', n: T2('megabyte', 'मेगाबाइट'), p: 2, eg: T2('About one phone photo or one song.', 'लगभग एक फ़ोन फ़ोटो या एक गाना।') },
    { k: 'GB', n: T2('gigabyte', 'गीगाबाइट'), p: 3, eg: T2('About a film, or hundreds of songs.', 'लगभग एक फ़िल्म, या सैकड़ों गाने।') },
    { k: 'TB', n: T2('terabyte', 'टेराबाइट'), p: 4, eg: T2('A big hard disk full of films.', 'फ़िल्मों से भरी एक बड़ी हार्ड डिस्क।') },
  ];
  const HEART = [0x66, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C, 0x18, 0x00];
  const utf8 = (cp) => (cp < 0x80 ? [cp] : cp < 0x800 ? [0xC0 | (cp >> 6), 0x80 | (cp & 63)] : cp < 0x10000 ? [0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)] : [0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)]);
  const charLabel = (api, code) => (code === 32 ? { g: '␣', cap: api.t(T2('space', 'खाली स्थान')) } : code < 32 || code === 127 ? { g: '·', cap: api.t(T2('control code, not a printable letter', 'कंट्रोल कोड, छपने वाला अक्षर नहीं')) } : { g: String.fromCharCode(code), cap: '' });
  function codeFact(api, code) {
    const ch = String.fromCharCode(code);
    if (code >= 65 && code <= 90) return T2(`Capital letter. Turn the 32 bit on and it becomes the small letter "${ch.toLowerCase()}" (code ${code + 32}).`, `बड़ा अक्षर। 32 वाला बिट चालू कर दो तो यह छोटा अक्षर "${ch.toLowerCase()}" (कोड ${code + 32}) बन जाता है।`);
    if (code >= 97 && code <= 122) return T2(`Small letter. Turn the 32 bit off and it becomes the capital letter "${ch.toUpperCase()}" (code ${code - 32}).`, `छोटा अक्षर। 32 वाला बिट बंद कर दो तो यह बड़ा अक्षर "${ch.toUpperCase()}" (कोड ${code - 32}) बन जाता है।`);
    if (code >= 48 && code <= 57) return T2(`The digit character "${ch}" has code ${code}. It is not the number ${ch}: computers store a typed digit as a character.`, `अंक-अक्षर "${ch}" का कोड ${code} है। यह संख्या ${ch} नहीं है: टाइप किया अंक कंप्यूटर में अक्षर की तरह रखा जाता है।`);
    if (code === 32) return T2('Even a space is stored as a character: code 32.', 'खाली स्थान भी अक्षर की तरह रखा जाता है: कोड 32।');
    if (code < 32 || code === 127) return T2('Codes 0 to 31 and 127 are control codes (like Enter or Tab); they are not letters.', 'कोड 0 से 31 और 127 कंट्रोल कोड हैं (जैसे Enter या Tab); ये अक्षर नहीं हैं।');
    return T2(`The symbol "${ch}" is stored as code ${code}. ASCII has 128 codes in all (0 to 127).`, `चिह्न "${ch}" कोड ${code} से रखा जाता है। ASCII में कुल 128 कोड हैं (0 से 127)।`);
  }
  function encodingMode(root, c, api) {
    let ctl;
    const tgt = c.value;
    let tab = 'text', v = tgt != null ? 0 : 65, word = 'Hi', unit = 1, rgb = [29, 78, 216];
    const px = HEART.slice();
    const wordsHTML = () => {
      const cps = Array.from(word).slice(0, 8).map((ch) => ch.codePointAt(0));
      if (!cps.length) return `<p class="muted">${E(api, T2('Type a word above.', 'ऊपर कोई शब्द लिखो।'))}</p>`;
      let bytes = 0;
      const tiles = cps.map((cp) => { const b = utf8(cp); bytes += b.length; return `<div class="lg-tile"><span class="lg-tc" lang="${cp > 127 ? 'hi' : 'en'}">${esc(String.fromCodePoint(cp))}</span><span class="lg-tb">${b.map((x) => bstr(x, 8)).join('<br>')}</span><small>0x${b.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ')}${cp > 127 ? ` · U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : ` = ${cp}`}</small></div>`; }).join('');
      return `<div class="lg-tiles">${tiles}</div><p class="lg-fact">${E(api, T2(`${cps.length} character${cps.length > 1 ? 's' : ''} = ${bytes} byte${bytes > 1 ? 's' : ''} = ${bytes * 8} bits.`, `${cps.length} अक्षर = ${bytes} बाइट = ${bytes * 8} बिट।`))}${cps.some((x) => x > 127) ? ' ' + E(api, T2('Letters outside plain English need more than one byte (Unicode, stored as UTF-8).', 'अंग्रेज़ी के सादे अक्षरों के बाहर के अक्षरों के लिए एक से ज़्यादा बाइट चाहिए (यूनिकोड, UTF-8 में)।')) : ''}</p>`;
    };
    const tabsHTML = () => `<div class="lg-tabs" role="tablist">${[['text', T2('Text', 'अक्षर')], ['picture', T2('Picture', 'चित्र')], ['colour', T2('Colour', 'रंग')], ['size', T2('Size', 'आकार')]].map(([k, n]) => `<button type="button" role="tab" class="lg-tab${tab === k ? ' sel' : ''}" aria-selected="${tab === k}" data-key="tab:${k}">${E(api, n)}</button>`).join('')}</div>`;
    const colourBits = () => {
      const hexs = rgb.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
      const nm = ['r', 'g', 'b'], lb = [T2('Red', 'लाल'), T2('Green', 'हरा'), T2('Blue', 'नीला')], cl = ['#FF6B57', '#22C55E', '#2563EB'];
      return `<div class="lg-swatch" style="background:rgb(${rgb.join(',')})" role="img" aria-label="#${hexs}"></div><div class="lg-hexline"><b>#${hexs}</b> <span class="muted">= rgb(${rgb.join(', ')})</span></div>${nm.map((k, i) => `<label class="lg-rg" style="--c:${cl[i]}"><span class="lg-rgl">${E(api, lb[i])}</span><input type="range" min="0" max="255" value="${rgb[i]}" data-key="rgb:${k}" aria-label="${esc(api.t(lb[i]))}"><output>${rgb[i]} · <span>${bstr(rgb[i], 8)}</span></output></label>`).join('')}`;
    };
    const view = () => {
      const last = ctl && ctl.last;
      let body = '';
      if (tab === 'text') {
        const { g, cap } = charLabel(api, v);
        body = `<div class="lg-board"><div class="lg-glyphrow"><div class="lg-glyph" aria-hidden="true">${esc(g)}</div><div class="lg-gmeta"><b>${E(api, T2('Code', 'कोड'))} ${v}</b><span>${E(api, TXT.bin)} ${g4(bstr(v, 8))}</span><span>${E(api, TXT.hex)} ${v.toString(16).toUpperCase().padStart(2, '0')}</span>${cap ? `<em>${esc(cap)}</em>` : ''}</div></div>${bitRow(v, 8, last, api)}</div>
          <p class="lg-fact">${E(api, codeFact(api, v))}</p>
          ${tgt != null ? `<div class="lg-ask"><span>${E(api, T2('Store the letter', 'यह अक्षर रखो'))} <b class="lg-tgt">${esc(String.fromCharCode(tgt))}</b> <span class="muted">${E(api, T2('(set the bits to its code)', '(बिट इसके कोड पर लगाओ)'))}</span></span><button type="button" class="lg-btn go" data-key="answer">${E(api, TXT.check)}</button></div>` : ''}
          <div class="lg-panel"><label class="lg-cap" for="lg-word">${E(api, T2('Type a word to see its bytes', 'शब्द लिखो और उसके बाइट देखो'))}</label><input id="lg-word" class="lg-in" data-key="char" type="text" maxlength="8" value="${esc(word)}" autocomplete="off" spellcheck="false" placeholder="${esc(api.t(T2('Try a name, or a Hindi letter like क', 'कोई नाम या क जैसा हिंदी अक्षर आज़माओ')))}"><div class="lg-words">${wordsHTML()}</div></div>`;
      } else if (tab === 'picture') {
        const cells = px.map((byte, r) => Array.from({ length: 8 }, (_, cc) => { const on = (byte >> (7 - cc)) & 1; return `<button type="button" class="lg-px${on ? ' on' : ''}${last === `pixel:${r}-${cc}` ? ' chg' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}" data-key="pixel:${r}-${cc}" aria-label="${esc(api.t(T2('Row', 'पंक्ति')))} ${r + 1}, ${esc(api.t(T2('column', 'स्तंभ')))} ${cc + 1}"></button>`; }).join('')).join('');
        const bytes = px.map((byte, r) => `<li><span class="lg-bb">${bstr(byte, 8)}</span> <small>= ${byte}</small></li>`).join('');
        body = `<div class="lg-pic"><div class="lg-board lg-pxb"><div class="lg-pxgrid">${cells}</div></div><div class="lg-panel"><div class="lg-cap">${E(api, T2('Each row is one byte', 'हर पंक्ति एक बाइट है'))}</div><ol class="lg-bytes">${bytes}</ol></div></div><p class="lg-fact">${E(api, T2('A black-and-white picture stores 1 bit for each dot: 1 = black, 0 = white. 8 × 8 = 64 bits = 8 bytes.', 'श्वेत-श्याम चित्र हर बिंदु के लिए 1 बिट रखता है: 1 = काला, 0 = सफ़ेद। 8 × 8 = 64 बिट = 8 बाइट।'))}</p>`;
      } else if (tab === 'colour') {
        body = `<div class="lg-panel lg-col"><div class="lg-colbox">${colourBits()}</div><div class="lg-row">${Object.keys(PRESETS).map((k) => `<button type="button" class="lg-btn" data-key="preset:${k}"><i class="lg-sq" style="background:rgb(${PRESETS[k][2].join(',')})"></i>${E(api, T2(PRESETS[k][0], PRESETS[k][1]))}</button>`).join('')}</div></div><p class="lg-fact">${E(api, T2('A screen mixes red, green and blue light. Each colour is one byte (0 to 255), so there are 256 × 256 × 256 = 16,777,216 colours.', 'स्क्रीन लाल, हरी और नीली रोशनी मिलाती है। हर रंग एक बाइट (0 से 255) है, इसलिए 256 × 256 × 256 = 16,777,216 रंग बनते हैं।'))}</p>`;
      } else {
        const u = UNITS[unit], bytes = Math.pow(1024, u.p);
        body = `<div class="lg-ladder" role="group" aria-label="${esc(api.t(T2('Storage units', 'भंडारण इकाइयाँ')))}">${UNITS.map((x, i) => `<button type="button" class="lg-un${i === unit ? ' sel' : ''}" data-key="unit:${x.k}" aria-pressed="${i === unit}" style="--w:${20 + i * 20}%"><b>${x.k}</b><span>${E(api, x.n)}</span></button>`).join('')}</div>
          <div class="lg-panel"><h3 class="lg-h">1 ${u.k} = ${bytes.toLocaleString('en-US')} ${esc(api.t(T2(bytes === 1 ? 'byte' : 'bytes', 'बाइट')))}</h3><p class="lg-rule">= ${(bytes * 8).toLocaleString('en-US')} ${esc(api.t(T2('bits', 'बिट')))}</p><p class="lg-idea">${E(api, u.eg)}</p>${u.p ? `<p class="lg-fact">1 ${u.k} = 1024 ${UNITS[unit - 1].k}</p>` : `<p class="lg-fact">1 ${esc(api.t(T2('byte', 'बाइट')))} = 8 ${esc(api.t(T2('bits', 'बिट')))}</p>`}</div>`;
      }
      return tabsHTML() + body;
    };
    const setBits = (nv) => { v = nv; };
    const act = (k) => {
      if (!ctl.ok(k)) return;
      if (k.startsWith('tab:')) { tab = k.slice(4); ctl.draw(); ctl.say({ text: api.t(T2('Tap the switches to change the code.', 'स्विच दबाकर कोड बदलो।')), picture: api.t(T2('Tap dots to draw. Watch the bytes change.', 'बिंदु दबाकर चित्र बनाओ। बाइट बदलते देखो।')), colour: api.t(T2('Slide the three bytes to mix a colour.', 'तीनों बाइट खिसकाकर रंग मिलाओ।')), size: api.t(T2('Pick a unit.', 'कोई इकाई चुनो।')) }[tab] || ''); api.emit('converted'); }
      else if (k.startsWith('bit:')) {
        const i = +k.slice(4); setBits(v ^ (1 << i)); ctl.draw();
        const { cap } = charLabel(api, v);
        ctl.say(`${api.t(T2('Code', 'कोड'))} ${v} = ${bstr(v, 8)} → ${v >= 33 && v < 127 ? '"' + String.fromCharCode(v) + '"' : cap || String.fromCharCode(v)}`);
        api.emit('toggled'); api.emit('converted'); api.record(`bits ${bstr(v, 8)} = ${v}`);
      } else if (k.startsWith('pixel:')) {
        const [r, cc] = k.slice(6).split('-').map(Number); px[r] ^= 1 << (7 - cc); ctl.draw(); ctl.last = null;
        ctl.say(`${api.t(T2('Row', 'पंक्ति'))} ${r + 1}: ${bstr(px[r], 8)} = ${px[r]}`); api.emit('toggled'); api.emit('converted');
      } else if (k.startsWith('preset:')) {
        const p = PRESETS[k.slice(7)]; if (!p) return; rgb = p[2].slice(); ctl.draw(); ctl.say(`${api.t(T2(p[0], p[1]))}: rgb(${rgb.join(', ')})`); api.emit('converted');
      } else if (k.startsWith('unit:')) {
        const i = UNITS.findIndex((x) => x.k === k.slice(5)); if (i < 0) return; unit = i; ctl.draw(); ctl.say(`1 ${UNITS[i].k} = ${Math.pow(1024, UNITS[i].p).toLocaleString('en-US')} ${api.t(T2('bytes', 'बाइट'))}`); api.emit('converted');
      } else if (k === 'answer') {
        if (v === tgt) { ctl.say(`${api.t(T2('Yes!', 'सही!'))} ${bstr(v, 8)} = ${tgt} = "${String.fromCharCode(tgt)}"`, 'good'); api.emit('answered:right'); api.celebrate(); }
        else { ctl.say(api.t(T2(`Your bits make code ${v}, not ${tgt}. Hint: add the place values that give ${tgt}.`, `तुम्हारे बिट कोड ${v} बनाते हैं, ${tgt} नहीं। संकेत: स्थानीय मान जोड़कर ${tgt} बनाओ।`)), 'bad'); api.emit('answered:wrong'); }
        api.record(`answer code ${v} (target ${tgt})`);
      }
    };
    const input = (k, el) => {
      if (k === 'char') {
        word = el.value; ctl.vw.querySelector('.lg-words').innerHTML = wordsHTML(); api.emit('converted'); api.record('typed: ' + word);
      } else if (k && k.startsWith('rgb:')) {
        if (!api.allowed(k)) { api.nudge(k); return; }
        const i = ['r', 'g', 'b'].indexOf(k.slice(4)); rgb[i] = +el.value;
        const box = ctl.vw.querySelector('.lg-colbox'); box.querySelector('.lg-swatch').style.background = `rgb(${rgb.join(',')})`;
        const hexs = rgb.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
        box.querySelector('.lg-hexline').innerHTML = `<b>#${hexs}</b> <span class="muted">= rgb(${rgb.join(', ')})</span>`;
        el.parentNode.querySelector('output').innerHTML = `${rgb[i]} · <span>${bstr(rgb[i], 8)}</span>`;
        box.querySelector('.lg-swatch').setAttribute('aria-label', '#' + hexs); api.emit('converted');
      }
    };
    ctl = Core(root, api, { view, act, input });
    ctl.say(tgt != null ? api.t(T2(`Computers store letters as numbers. Set the bits to the code of "${String.fromCharCode(tgt)}".`, `कंप्यूटर अक्षरों को संख्याओं की तरह रखता है। बिट इस तरह लगाओ कि "${String.fromCharCode(tgt)}" का कोड बने।`)) : api.t(T2('Computers store letters as numbers. Tap a bit to change the letter.', 'कंप्यूटर अक्षरों को संख्याओं की तरह रखता है। कोई बिट दबाकर अक्षर बदलो।')));
    return ctl;
  }

  // ================================================================ ADDER
  function adderMode(root, c, api) {
    let ctl;
    const n = c.value || 1;
    const a = new Array(n).fill(0), b = new Array(n).fill(0);
    let sel = 0;
    const nameA = (i) => (n === 1 ? 'A' : 'A' + i), nameB = (i) => (n === 1 ? 'B' : 'B' + i);
    const calc = () => rippleCells(n, a, b);
    const num = (arr) => arr.reduce((s, x, i) => s + (x << i), 0);
    const rippleSVG = (R) => {
      const cw = 72, gap = 26, ml = 56, H = 160;
      const xs = (i) => ml + (n - 1 - i) * (cw + gap);
      const W = ml + n * cw + (n - 1) * gap + 10;
      let s = '';
      R.cells.forEach((ce, i) => {
        const x = xs(i), cx = x + cw / 2, fa = i === 0 ? '#14B8A6' : '#8B3DFF', ink = i === 0 ? '#1E293B' : '#FFFFFF';
        s += wire([[cx - 17, 40], [cx - 17, 52]], ce.a) + wire([[cx + 17, 40], [cx + 17, 52]], ce.b) + wire([[cx, 118], [cx, 134]], ce.s);
        s += `<g class="lg-gt${sel === i ? ' sel' : ''}" role="button" tabindex="0" data-key="gate:add${i}" aria-label="${esc(api.t(T2(i === 0 ? 'Half adder' : 'Full adder', i === 0 ? 'अर्ध योजक' : 'पूर्ण योजक')))}, ${esc(api.t(T2('bit', 'बिट')))} ${i}: ${ce.a} + ${ce.b}${i ? ' + ' + ce.cin : ''} = ${ce.s}, ${esc(api.t(TXT.carry))} ${ce.co}"><rect x="${x}" y="52" width="${cw}" height="66" rx="12" fill="${fa}" stroke="${sel === i ? '#FFD23F' : '#fff'}" stroke-width="${sel === i ? 4 : 2}"/><text x="${cx}" y="80" text-anchor="middle" font-size="22" fill="${ink}">${i === 0 ? 'HA' : 'FA'}</text><text x="${cx}" y="102" text-anchor="middle" font-size="15" fill="${ink}">${esc(api.t(T2('bit', 'बिट')))} ${i}</text></g>`;
        s += lamp(cx - 17, 30, 10, ce.a) + lamp(cx + 17, 30, 10, ce.b) + lamp(cx, 146, 10, ce.s);
        s += `<text class="lg-lbl" x="${cx - 17}" y="10" text-anchor="middle" font-size="15">A${i}</text><text class="lg-lbl" x="${cx + 17}" y="10" text-anchor="middle" font-size="15">B${i}</text>`;
        if (i > 0) { const xr = xs(i - 1); s += wire([[xr, 85], [x + cw, 85]], ce.cin) + `<path class="lg-ar ${ce.cin ? 'on' : 'off'}" d="M${x + cw + 7} 79L${x + cw} 85L${x + cw + 7} 91Z"/>` + lamp((xr + x + cw) / 2, 85, 9, ce.cin); }
      });
      const xl = xs(n - 1);
      s += wire([[xl, 85], [xl - 14, 85]], R.carry) + lamp(22, 85, 13, R.carry) + `<text class="lg-lbl" x="22" y="62" text-anchor="middle" font-size="13">Cout</text>`;
      s += `<text class="lg-lbl" x="22" y="150" text-anchor="middle" font-size="14">${esc(api.t(TXT.sum))}</text>`;
      return `<svg class="lg-rip" viewBox="0 0 ${W} ${H + 4}" role="img" aria-label="${esc(api.t(T2('Ripple adder', 'रिपल योजक')))}">${s}</svg>`;
    };
    const view = () => {
      const last = ctl && ctl.last, R = calc();
      const A = num(a), B = num(b), S = A + B;
      const bitsOf = (arr) => arr.slice().reverse().join('');
      const resBits = R.carry + R.cells.map((x) => x.s).reverse().join('');
      const ins = n === 1
        ? `<div class="lg-sws">${sw('input:A', 'A', a[0], last, api)}${sw('input:B', 'B', b[0], last, api)}</div>`
        : `<div class="lg-swrow"><span class="lg-rowl">A</span>${a.map((x, i) => i).reverse().map((i) => sw('input:A' + i, 'A' + i, a[i], last, api, 1)).join('')}</div><div class="lg-swrow"><span class="lg-rowl">B</span>${b.map((x, i) => i).reverse().map((i) => sw('input:B' + i, 'B' + i, b[i], last, api, 1)).join('')}</div>`;
      let board, detail = '';
      if (n === 1) board = halfSVG(a[0], b[0], true, api);
      else {
        board = rippleSVG(R);
        const ce = R.cells[sel];
        detail = `<div class="lg-panel"><h3 class="lg-h">${E(api, sel === 0 ? T2('Inside the half adder (bit 0)', 'अर्ध योजक के अंदर (बिट 0)') : T2(`Inside the full adder (bit ${sel})`, `पूर्ण योजक के अंदर (बिट ${sel})`))}</h3><div class="lg-board lg-bd0">${sel === 0 ? halfSVG(ce.a, ce.b, false, api) : fullSVG(ce.a, ce.b, ce.cin, api)}</div></div>`;
      }
      return `<div class="lg-panel"><h3 class="lg-h">${E(api, n === 1 ? T2('Add two bits: flip the switches', 'दो बिट जोड़ो: स्विच पलटो') : T2(`Add two ${n}-bit numbers: flip the switches`, `दो ${n}-बिट संख्याएँ जोड़ो: स्विच पलटो`))}</h3>${ins}</div>
        <div class="lg-board lg-bd0">${board}</div>
        <div class="lg-chips"><span class="lg-chip wide"><small>${E(api, TXT.bin)}</small><b>${bitsOf(a)} + ${bitsOf(b)} = ${resBits}</b></span><span class="lg-chip wide"><small>${E(api, TXT.dec)}</small><b>${A} + ${B} = ${S}</b></span></div>
        ${detail}
        <p class="lg-fact">${E(api, n === 1 ? T2('XOR gives the sum bit (1 + 1 = 10 in binary: sum 0, carry 1). AND gives the carry. Tap a gate to read what it does.', 'XOR योग का बिट देता है (द्विआधारी में 1 + 1 = 10: योग 0, हासिल 1)। AND हासिल देता है। किसी गेट को दबाकर पढ़ो वह क्या करता है।') : T2('The first column is a half adder; every next column is a full adder that also takes the carry from its right. Tap a column to look inside.', 'पहला स्तंभ अर्ध योजक है; आगे के हर स्तंभ पूर्ण योजक हैं जो दाएँ से आया हासिल भी लेते हैं। अंदर देखने के लिए स्तंभ दबाओ।'))}</p>`;
    };
    const act = (k) => {
      if (!ctl.ok(k)) return;
      if (k.startsWith('input:')) {
        const nm = k.slice(6), isA = nm[0] === 'A', i = nm.length > 1 ? +nm.slice(1) : 0;
        (isA ? a : b)[i] ^= 1; ctl.draw();
        const R = calc(), A = num(a), B = num(b);
        ctl.say(`${A} + ${B} = ${A + B}  (${api.t(TXT.sum)} ${R.cells.map((x) => x.s).reverse().join('')}, ${api.t(TXT.carry)} ${R.carry})`);
        api.emit('toggled'); api.emit('output:' + R.carry); api.record(`${A}+${B}=${A + B}`);
      } else if (k.startsWith('gate:add')) {
        sel = +k.slice(8); ctl.draw(); const ce = calc().cells[sel];
        ctl.say(`${api.t(T2(sel === 0 ? 'Half adder' : 'Full adder', sel === 0 ? 'अर्ध योजक' : 'पूर्ण योजक'))}: ${ce.a} + ${ce.b}${sel ? ' + ' + ce.cin : ''} = ${api.t(TXT.sum)} ${ce.s}, ${api.t(TXT.carry)} ${ce.co}`);
      } else if (k === 'gate:XOR') ctl.say(`XOR: ${a[0]} ⊕ ${b[0]} = ${a[0] ^ b[0]}. ${api.t(G.XOR.rule)}`);
      else if (k === 'gate:AND') ctl.say(`AND: ${a[0]} · ${b[0]} = ${a[0] & b[0]}. ${api.t(G.AND.rule)}`);
    };
    ctl = Core(root, api, { view, act });
    ctl.say(api.t(T2('Flip the switches and watch the sum and the carry.', 'स्विच पलटो और योग तथा हासिल देखो।')));
    return ctl;
  }

  // ================================================================ register
  const demo = { mode: 'gates', gates: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'] };
  const CSS = `
.lg{display:flex;flex-direction:column;gap:12px;padding:12px;font-family:var(--font-body);color:var(--ink);max-width:980px;margin:0 auto}
.lg *{box-sizing:border-box}
.lg-view{display:flex;flex-direction:column;gap:12px;min-width:0}
.lg svg text{font-family:var(--font-display);font-weight:700}
.lg .muted{color:var(--ink-2)}
.lg-h{font-family:var(--font-display);font-size:1.08rem;margin:0 0 8px}
.lg-board{position:relative;border-radius:18px;padding:14px 10px;color:#fff;background:radial-gradient(rgba(255,255,255,.09) 1px,transparent 1.6px) 0 0/16px 16px,linear-gradient(160deg,#0B1B3A,#1B3C93);box-shadow:0 10px 24px rgba(6,18,51,.25),inset 0 0 0 1px rgba(255,255,255,.12)}
.lg-board .lg-h{color:#DCE7FF}
.lg-bd0{padding:10px 6px;display:flex;justify-content:center}
.lg-panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px 14px;box-shadow:0 2px 8px rgba(6,18,51,.06)}
.lg-chips{display:flex;flex-wrap:wrap;gap:8px}
.lg-chip{flex:1 1 90px;display:flex;flex-direction:column;background:var(--royal-t);border-radius:12px;padding:6px 12px;min-width:0}
.lg-chip.wide{flex:1 1 220px}
.lg-chip small{color:var(--ink-2);font-weight:600}
.lg-chip b{font-family:var(--font-display);font-size:1.15rem;color:var(--royal);letter-spacing:.5px;overflow-wrap:anywhere}
.lg-row{display:flex;flex-wrap:wrap;gap:8px}
.lg-btn{min-height:46px;padding:0 16px;border-radius:14px;border:2px solid var(--line);background:var(--surface);font-weight:700;display:inline-flex;align-items:center;gap:8px;transition:transform .12s,box-shadow .12s}
.lg-btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(6,18,51,.12)}
.lg-btn:active{transform:scale(.97)}
.lg-btn[aria-disabled="true"]{opacity:.5}
.lg-btn.go{background:var(--action);border-color:var(--action);color:var(--on-action)}
.lg-btn.ghost{background:transparent}
.lg-sq{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink-2);display:inline-block}
.lg-ask{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;background:var(--sun-t);border:2px solid var(--sun);border-radius:14px;padding:8px 12px;font-weight:600}
.lg-panel .lg-ask{background:transparent;border:0;padding:8px 0 0}
.lg-tgt{font-family:var(--font-display);font-size:1.7rem;color:var(--royal);padding:0 4px}
.lg-live{min-height:48px;border-radius:14px;padding:10px 14px;background:var(--sunk);border:1px solid var(--line);font-weight:600;display:flex;align-items:center}
.lg-live.good{background:var(--good-t);border-color:var(--good);color:var(--good)}
.lg-live.bad{background:var(--bad-t);border-color:var(--bad);color:var(--bad)}
.lg-live.warn{background:var(--sun-t);border-color:var(--sun)}
.lg-fact{margin:0;padding:10px 14px;border-radius:14px;background:var(--grape-t);border-left:5px solid var(--grape);font-weight:500}
.lg-rule{margin:0 0 6px;font-weight:700;font-size:1.05rem}
.lg-idea{margin:0 0 6px;color:var(--ink-2)}
.lg-expr{margin:6px 0 0;font-family:var(--font-display);font-size:1.05rem}
.lg-cap{font-weight:700;color:var(--ink-2);margin-bottom:6px}
/* bits */
.lg-bits{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 22px}
.lg-nib{display:flex;gap:8px}
.lg-bitcol{display:flex;flex-direction:column;align-items:center;gap:4px;width:56px}
.lg-pv{font-family:var(--font-display);font-weight:800;color:#9FE8FF;font-size:1.05rem}
.lg-pe{font-size:.8rem;color:#B6C6EC}
.lg-bit{width:56px;height:68px;border-radius:16px;border:2px solid #5B73B5;background:linear-gradient(#27407F,#1B2C61);color:#9FB0D8;font-family:var(--font-display);font-weight:800;font-size:1.9rem;box-shadow:inset 0 -5px 0 rgba(0,0,0,.25);transition:transform .12s,background .2s}
.lg-bit:active{transform:scale(.94)}
.lg-bit.on{background:linear-gradient(#FFE27A,#FFD23F);border-color:#FFF6C4;color:#1E293B;box-shadow:0 0 18px rgba(255,210,63,.65),inset 0 -5px 0 rgba(0,0,0,.15)}
.lg-bit.chg{animation:lg-pop .28s ease}
@keyframes lg-pop{0%{transform:scale(.82)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
.lg-eq{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:6px 14px;margin-top:12px}
.lg-sum{font-family:var(--font-display);font-size:1.15rem;color:#CFE0FF;overflow-wrap:anywhere;text-align:center}
.lg-big{font-family:var(--font-display);font-weight:800;font-size:2.6rem;color:#FFD23F;text-shadow:0 0 16px rgba(255,210,63,.5)}
/* switches */
.lg-sws{display:flex;flex-wrap:wrap;gap:10px}
.lg-swrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.lg-rowl{font-family:var(--font-display);font-weight:800;font-size:1.3rem;width:22px}
.lg-sw{min-height:52px;min-width:104px;padding:4px 12px 4px 14px;border-radius:16px;border:2px solid var(--line);background:var(--surface);display:inline-flex;align-items:center;gap:10px;font-weight:800}
.lg-swl{font-family:var(--font-display);font-size:1.2rem;min-width:14px}
.lg-trk{position:relative;width:48px;height:28px;border-radius:999px;background:#7C8AAE;transition:background .2s;flex:none}
.lg-kn{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}
.lg-sw.on{border-color:var(--sun);background:var(--sun-t)}
.lg-sw.on .lg-trk{background:#F5B90A}
.lg-sw.on .lg-kn{transform:translateX(20px)}
.lg-sw.sm{min-width:0;flex:1 1 0;max-width:110px;flex-direction:column;gap:2px;padding:4px 4px 6px;min-height:76px}
.lg-swrow .lg-sw.sm .lg-swl{font-size:1rem}
.lg-swv{font-family:var(--font-display);font-size:1.25rem;min-width:12px;text-align:center}
.lg-sw.chg .lg-kn{animation:lg-slide .22s ease}
@keyframes lg-slide{from{transform:translateX(0)}to{transform:translateX(20px)}}
.lg-sw.chg:not(.on) .lg-kn{animation:lg-slideb .22s ease}
@keyframes lg-slideb{from{transform:translateX(20px)}to{transform:translateX(0)}}
/* gate cards */
.lg-gcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.lg-gcards.one{grid-template-columns:minmax(0,520px);justify-content:center}
.lg-gc{display:flex;flex-direction:column;align-items:stretch;gap:6px;text-align:left;padding:10px;border-radius:18px;border:2px solid transparent;background:linear-gradient(160deg,#0B1B3A,#1B3C93);color:#fff;box-shadow:0 8px 18px rgba(6,18,51,.22);transition:transform .15s,border-color .15s}
.lg-gc:hover{transform:translateY(-2px)}
.lg-gc.sel{border-color:#FFD23F;box-shadow:0 0 0 3px rgba(255,210,63,.35),0 8px 18px rgba(6,18,51,.22)}
.lg-gn{display:inline-block;align-self:flex-start;background:var(--c);color:var(--k);border-radius:999px;padding:2px 12px;font-family:var(--font-display);font-weight:800;font-size:1rem}
.lg-gsvg{display:block}
.lg-scene{width:100%;height:auto;display:block;max-height:150px}
.lg-gx{font-family:var(--font-display);font-size:1.05rem;color:#E4ECFF}
.lg-gx b{color:#FFD23F;font-size:1.25rem}
.lg-detail{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:700px){.lg-detail{grid-template-columns:1.4fr 1fr}}
/* tables */
.lg-tt{border-collapse:separate;border-spacing:0;min-width:140px;text-align:center;font-family:var(--font-display);font-size:1.1rem}
.lg-tt th,.lg-tt td{padding:6px 12px;border-bottom:1px solid var(--line)}
.lg-tt th{background:var(--sunk);font-weight:800}
.lg-tt tr.cur td{background:var(--sun-t);box-shadow:inset 0 0 0 0 transparent;animation:lg-glow 1.6s ease-in-out infinite alternate}
@keyframes lg-glow{from{background:var(--sun-t)}to{background:#FFE98E}}
.lg-tt.big td,.lg-tt.big th{padding:4px 6px}
.lg-tblwrap{overflow-x:auto;padding-bottom:4px}
.lg-gh{min-height:44px;min-width:60px;border-radius:12px;border:0;padding:0 10px;background:var(--c);color:var(--k);font-family:var(--font-display);font-weight:800;border:3px solid transparent}
.lg-gh.sel{border-color:var(--ink)}
.lg-cell{width:48px;height:48px;border-radius:12px;border:2px solid var(--line);background:var(--surface);font-family:var(--font-display);font-weight:800;font-size:1.3rem}
.lg-cell.empty{border-style:dashed;color:var(--ink-2);background:var(--sunk)}
.lg-cell.right{background:var(--good-t);border-color:var(--good);color:var(--good)}
.lg-cell.wrong{background:var(--bad-t);border-color:var(--bad);color:var(--bad)}
.lg-cell.chg{animation:lg-pop .25s ease}
.lg-try{display:grid;grid-template-columns:1fr;gap:10px;align-items:center}
@media(min-width:700px){.lg-try{grid-template-columns:1fr 1fr}}
.lg-try .lg-gsvg{background:linear-gradient(160deg,#0B1B3A,#1B3C93);border-radius:16px;padding:8px}
/* encoding */
.lg-tabs{display:flex;flex-wrap:wrap;gap:6px;background:var(--sunk);border-radius:16px;padding:4px}
.lg-tab{flex:1 1 60px;padding:0 6px;min-height:46px;border:0;border-radius:12px;background:transparent;font-weight:700}
.lg-tab.sel{background:var(--surface);box-shadow:0 2px 6px rgba(6,18,51,.18);color:var(--royal)}
.lg-glyphrow{display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:12px;flex-wrap:wrap}
.lg-glyph{width:96px;height:96px;border-radius:20px;background:linear-gradient(#FFE27A,#FFD23F);color:#1E293B;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:3.4rem;box-shadow:0 0 22px rgba(255,210,63,.45)}
.lg-gmeta{align-items:flex-start;display:flex;flex-direction:column;gap:2px;font-family:var(--font-display);color:#DCE7FF}
.lg-gmeta b{font-size:1.5rem;color:#FFD23F}
.lg-gmeta em{font-style:normal;font-size:.9rem;max-width:200px;color:#B6C6EC}
.lg-in{width:100%;min-height:48px;border:2px solid var(--line);border-radius:14px;padding:0 14px;font:inherit;font-size:1.1rem;background:var(--bg);color:var(--ink)}
.lg-words{margin-top:10px}
.lg-tiles{display:flex;flex-wrap:wrap;gap:8px}
.lg-tile{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--royal-t);border-radius:12px;padding:6px 10px;min-width:84px}
.lg-tc{font-family:var(--font-display);font-size:1.7rem;font-weight:800}
.lg-tb{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;text-align:center;color:var(--royal);line-height:1.35}
.lg-tile small{color:var(--ink-2)}
.lg-pic{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:700px){.lg-pic{grid-template-columns:1.2fr 1fr}}
.lg-pxb{padding:12px}
.lg-pxgrid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-width:400px;margin:0 auto}
.lg-px{aspect-ratio:1;min-height:36px;border-radius:8px;border:1.5px solid #5B73B5;background:#E9EEFB;padding:0;transition:background .15s,transform .1s;position:relative}
.lg-px::after{content:"";position:absolute;inset:-4px}
.lg-px.on{background:#0B1B3A;border-color:#0B1B3A}
.lg-px.chg{animation:lg-pop .22s ease}
.lg-bytes{margin:0;padding:0;list-style:none;font-family:ui-monospace,Menlo,Consolas,monospace;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
.lg-bb{font-weight:700;color:var(--royal);letter-spacing:1px}
.lg-col{display:flex;flex-direction:column;gap:12px}
.lg-colbox{display:flex;flex-direction:column;gap:8px}
.lg-swatch{height:90px;border-radius:16px;border:3px solid var(--line);box-shadow:inset 0 0 0 2px rgba(255,255,255,.4)}
.lg-hexline{font-family:var(--font-display);font-size:1.2rem}
.lg-rg{display:grid;grid-template-columns:62px 1fr auto;align-items:center;gap:10px}
.lg-rgl{font-weight:700}
.lg-rg input{width:100%;height:44px;accent-color:var(--c)}
.lg-rg output{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9rem;min-width:130px;text-align:right}
.lg-rg output span{color:var(--ink-2)}
.lg-ladder{display:flex;flex-direction:column;gap:8px}
.lg-un{width:var(--w);min-width:150px;min-height:48px;border-radius:14px;border:2px solid var(--line);background:linear-gradient(90deg,var(--royal-t),var(--surface));display:flex;align-items:center;gap:10px;padding:0 14px;text-align:left;transition:transform .15s}
.lg-un b{font-family:var(--font-display);font-size:1.2rem;min-width:34px}
.lg-un.sel{border-color:var(--sun);background:var(--sun-t)}
/* circuits */
.lg-circ{width:100%;max-width:520px;height:auto;display:block}
.lg-rip{width:100%;max-width:560px;height:auto;display:block}
.lg-w{fill:none;stroke:#4A5D8F;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.lg-w.on{stroke:#FFD23F;filter:drop-shadow(0 0 3px rgba(255,210,63,.8))}
.lg-fl{fill:none;stroke:#fff;stroke-width:1.4;stroke-dasharray:2 10;stroke-linecap:round;opacity:.85;animation:lg-flow .8s linear infinite}
@keyframes lg-flow{to{stroke-dashoffset:-12}}
.lg-jn.on{fill:#FFD23F}.lg-jn.off{fill:#4A5D8F}
.lg-ar.on{fill:#FFD23F}.lg-ar.off{fill:#4A5D8F}
.lg-body{stroke:#fff;stroke-width:2.5;stroke-linejoin:round}
.lg-body.lg-lit{filter:drop-shadow(0 0 6px rgba(255,210,63,.9))}
.lg-xo{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round}
.lg-bub{stroke:#fff;stroke-width:2}
.lg-lbl{fill:#B9C8F0}
.lg-lp .lg-lpc{stroke-width:2}
.lg-lp.on .lg-lpc{fill:#FFD23F;stroke:#FFF6C4}.lg-lp.on text{fill:#1E293B}
.lg-lp.off .lg-lpc{fill:#1B2A57;stroke:#5B73B5}.lg-lp.off text{fill:#9FB0D8}
.lg-halo{fill:rgba(255,210,63,.28)}
.lg-ray{stroke:#FFD23F;stroke-width:2;stroke-linecap:round}
.lg-bulb.on{fill:url(#lg-bulb);stroke:#FFF6C4;stroke-width:2;filter:drop-shadow(0 0 8px rgba(255,210,63,.9))}
.lg-bulb.off{fill:#1B2A57;stroke:#5B73B5;stroke-width:2}
.lg-bt.on{fill:#1E293B}.lg-bt.off{fill:#9FB0D8}
.lg-gt{cursor:pointer;outline:none}
.lg-gt:hover .lg-body,.lg-gt:focus-visible .lg-body{stroke:#FFD23F}
.lg-gt:focus-visible{outline:3px solid var(--cyan);outline-offset:4px}
@media(max-width:480px){.lg{padding:8px}.lg-bitcol,.lg-bit{width:62px}.lg-bits{gap:10px}.lg-big{font-size:2.2rem}.lg-bytes{grid-template-columns:1fr}}
`;

  NCA_T.register({
    id: 'logic',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'gates', 'value'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
      const gm = c.mode === 'gates' || c.mode === 'truth-table';
      if (c.gates != null) {
        if (!gm) e.push('gates: only for the gates and truth-table modes');
        else if (!Array.isArray(c.gates) || c.gates.length < 1 || c.gates.length > 6) e.push('gates: 1 to 6 gate names');
        else {
          c.gates.forEach((g) => { if (!GATES.includes(g)) e.push('unknown gate: ' + g + ' (use ' + GATES.join(', ') + ')'); });
          if (new Set(c.gates).size !== c.gates.length) e.push('gates: each gate once');
        }
      }
      if (c.value != null) {
        if (!Number.isInteger(c.value)) e.push('value: a whole number');
        else if (gm) e.push('value: not used by the ' + c.mode + ' mode');
        else if (c.mode === 'binary' && (c.value < 0 || c.value > 255)) e.push('value: 0 to 255 for binary (8 bits)');
        else if (c.mode === 'encoding' && (c.value < 32 || c.value > 126)) e.push('value: an ASCII code 32 to 126 (a printable character) for encoding');
        else if (c.mode === 'adder' && (c.value < 1 || c.value > 4)) e.push('value: 1 to 4 (the number of bits to add) for adder');
      }
      return e;
    },
    keys(c) {
      const mode = c && c.mode, gs = (c && Array.isArray(c.gates) && c.gates.length ? c.gates : mode === 'truth-table' ? ['AND'] : ['AND', 'OR', 'NOT']).filter((g) => GATES.includes(g));
      const ev = ['toggled'];
      let tg = [];
      if (mode === 'binary') {
        const n = c.value != null && c.value <= 15 ? 4 : 8;
        tg = Array.from({ length: n }, (_, i) => 'bit:' + i).concat(['shl', 'shr', 'step', 'reset']);
        ev.push('converted');
        if (c.value != null) { tg.push('answer'); ev.push('answered:right', 'answered:wrong'); }
      } else if (mode === 'gates') {
        tg = ['input:A'].concat(onlyNot(gs) ? [] : ['input:B'], gs.map((g) => 'gate:' + g));
        ev.push('output:0', 'output:1');
      } else if (mode === 'truth-table') {
        tg = ['input:A'].concat(onlyNot(gs) ? [] : ['input:B'], gs.map((g) => 'gate:' + g), ['cell:*', 'answer', 'clear']);
        ev.push('output:0', 'output:1', 'answered:right', 'answered:wrong');
      } else if (mode === 'encoding') {
        tg = Array.from({ length: 8 }, (_, i) => 'bit:' + i).concat(['char', 'tab:text', 'tab:picture', 'tab:colour', 'tab:size', 'pixel:*', 'rgb:*', 'preset:*', 'unit:*']);
        ev.push('converted');
        if (c.value != null) { tg.push('answer'); ev.push('answered:right', 'answered:wrong'); }
      } else if (mode === 'adder') {
        const n = c.value || 1;
        if (n === 1) tg = ['input:A', 'input:B', 'gate:XOR', 'gate:AND'];
        else { for (let i = 0; i < n; i++) tg.push('input:A' + i, 'input:B' + i); for (let i = 0; i < n; i++) tg.push('gate:add' + i); }
        ev.push('output:0', 'output:1');
      }
      return { targets: tg, events: ev };
    },
    demo,
    gates: G,
    mount(root, config, api) {
      const m = { binary: binaryMode, gates: gatesMode, 'truth-table': tableMode, encoding: encodingMode, adder: adderMode }[config.mode];
      const ctl = m(root, config, api);
      return { destroy() { ctl.destroy(); } };
    },
  });
})();
