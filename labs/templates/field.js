// Template: Fields lab. Magnetic and electric fields a child can feel with a compass, iron filings, field lines and
// arrows: a bar magnet, two magnets, a straight wire, a loop, a solenoid, force on a wire (Fleming's left-hand
// rule), a DC motor, electromagnetic induction, point charges (Coulomb) and the Earth. Every field is computed in
// code from the real rule (two-pole magnet model, Biot–Savart for loops and solenoids, B ∝ I/r for a wire,
// Coulomb's law for charges, EMF = −N dΦ/dt for induction), so a lab can never show an impossible picture. Config:
//   { source: 'bar-magnet'|'two-magnets'|'wire'|'loop'|'solenoid'|'force-on-wire'|'motor'|'induction'|'charges'|'earth',
//     show?: 'filings'|'compass'|'lines'|'vectors',          the view at the start (default: lines)
//     charges?: [{ q: -3..3 (not 0), x: 0..100, y: 0..100 }],   only with source 'charges' (x, y in cm on the board)
//     current?: 0..5 (A), turns?: 2..12, on?: true|false }      optional starting values where the mode has them
(function () {
  const L = window.NCA_LIB;
  const { esc, lerp, clamp, ease, tween } = L;
  const reduced = L.reducedMotion;
  const P = 'fd';
  const CSS = `.fd-svg { width: 100%; height: auto; display: block; border-radius: 14px; background: #E9EEF7; touch-action: none; user-select: none; -webkit-user-select: none; }
.fd-wrap { display: flex; flex-direction: column; gap: 10px; }
.fd-title { font: 800 22px var(--font-display); fill: #0B1D5C; paint-order: stroke; stroke: #F4F7FD; stroke-width: 6px; stroke-linejoin: round; }
.fd-sub { font: 600 13px var(--font-body); fill: #3B4A6B; }
.fd-lbl { font: 800 20px var(--font-display); fill: #fff; pointer-events: none; }
.fd-small { font: 700 12px var(--font-body); fill: #1E293B; pointer-events: none; }
.fd-tag { font: 700 13px var(--font-body); fill: #0B1D5C; pointer-events: none; paint-order: stroke; stroke: #F4F7FD; stroke-width: 4px; stroke-linejoin: round; }
.fd-drag { cursor: grab; }
.fd-drag.fd-held { cursor: grabbing; }
.fd-drag:hover .fd-glow { opacity: .35; }
.fd-glow { opacity: 0; transition: opacity .2s; }
.fd-line { fill: none; stroke: #4400F0; stroke-width: 2.2; stroke-linecap: round; opacity: .85; }
.fd-arrow { fill: #4400F0; }
.fd-eline { fill: none; stroke: #B91C1C; stroke-width: 2.2; stroke-linecap: round; opacity: .85; } .fd-earrow { fill: #B91C1C; }
.fd-vec { stroke: #0F766E; stroke-width: 2.4; stroke-linecap: round; fill: none; }
.fd-vech { fill: #0F766E; }
.fd-filing { stroke: #334155; stroke-width: 2; stroke-linecap: round; }
.fd-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fd-btn { border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; min-height: 46px; padding: 0 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: background .2s, transform .15s; }
.fd-btn:active { transform: scale(.97); }
.fd-btn .fd-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--ink-2); flex: none; box-shadow: inset 0 0 0 2px rgba(255,255,255,.5); }
.fd-btn[aria-pressed="true"] { background: var(--royal); color: #fff; border-color: var(--royal); }
.fd-btn[aria-pressed="true"] .fd-dot { background: #FFD23F; box-shadow: 0 0 10px #FFD23F; }
.fd-btn.fd-act { background: var(--sun-t); border-color: var(--sun); }
.fd-views { display: inline-flex; background: var(--sunk); border-radius: 12px; padding: 3px; flex-wrap: wrap; gap: 2px; }
.fd-views button { border: 0; background: transparent; color: var(--ink-2); border-radius: 9px; min-height: 40px; padding: 0 12px; font-weight: 700; }
.fd-views button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(6,18,51,.15); }
.fd-sliders { display: flex; flex-wrap: wrap; gap: 10px 18px; }
.fd-slider { display: flex; flex-direction: column; gap: 2px; flex: 1 1 200px; min-width: 0; font-weight: 700; }
.fd-slider span { display: flex; justify-content: space-between; font-size: .95rem; }
.fd-slider output { color: var(--royal); font-family: var(--font-display); font-size: 1.1rem; }
.fd-slider input { width: 100%; height: 44px; margin: 0; accent-color: var(--royal); cursor: pointer; }
.fd-read { background: var(--surface); border-radius: 12px; padding: 10px 14px; border: 1px solid var(--line); min-height: 52px; }
.fd-read p { margin: 0; }
.fd-read b { color: var(--royal); }
.fd-rule { display: inline-block; margin-top: 6px; border-radius: 999px; padding: 2px 12px; font-size: .88rem; font-weight: 700; background: var(--grape-t); color: var(--grape); }
.fd-gauge { font: 800 11px var(--font-body); fill: #1E293B; }
.fd-narrow .fd-title { font-size: 34px; } .fd-narrow .fd-tag { font-size: 20px; } .fd-narrow .fd-small { font-size: 17px; } .fd-narrow .fd-sub { font-size: 20px; } .fd-narrow .fd-gauge { font-size: 16px; }
.fd-narrow .fd-views { width: 100%; display: grid; grid-template-columns: 1fr 1fr; } .fd-narrow .fd-views button { min-height: 44px; }
@media (prefers-reduced-motion: reduce) { .fd-btn, .fd-glow { transition: none; } }`;

  // ---------- words (every visible word has English and Hindi) ----------
  const T = {
    modes: {
      'bar-magnet': { en: 'Bar magnet', hi: 'छड़ चुंबक' }, 'two-magnets': { en: 'Two magnets', hi: 'दो चुंबक' }, wire: { en: 'Straight wire', hi: 'सीधा तार' },
      loop: { en: 'Circular loop', hi: 'वृत्ताकार लूप' }, solenoid: { en: 'Solenoid', hi: 'परिनालिका' }, 'force-on-wire': { en: 'Force on a wire', hi: 'तार पर बल' },
      motor: { en: 'Electric motor', hi: 'विद्युत मोटर' }, induction: { en: 'Electromagnetic induction', hi: 'विद्युत चुंबकीय प्रेरण' }, charges: { en: 'Electric charges', hi: 'विद्युत आवेश' }, earth: { en: "Earth's magnetic field", hi: 'पृथ्वी का चुंबकीय क्षेत्र' },
    },
    views: { filings: { en: 'Iron filings', hi: 'लोहे का बुरादा' }, compass: { en: 'Compasses', hi: 'कंपास' }, lines: { en: 'Field lines', hi: 'क्षेत्र रेखाएँ' }, vectors: { en: 'Arrows', hi: 'तीर' } },
    seeds: { en: 'Seeds', hi: 'बीज' },
    on: { en: 'Switch ON', hi: 'स्विच ON' }, off: { en: 'Switch OFF', hi: 'स्विच OFF' }, switchName: { en: 'Switch', hi: 'स्विच' },
    reverse: { en: 'Reverse current', hi: 'धारा उलटो' }, flip: { en: 'Flip the magnet', hi: 'चुंबक पलटो' },
    sprinkle: { en: 'Sprinkle iron filings', hi: 'लोहे का बुरादा छिड़को' }, sprinkleSeeds: { en: 'Sprinkle seeds', hi: 'बीज छिड़को' },
    current: { en: 'Current', hi: 'धारा' }, turns: { en: 'Turns', hi: 'फेरे' }, turnsLow: { en: 'turns', hi: 'फेरे' },
    compass: { en: 'Compass (drag me)', hi: 'कंपास (मुझे खींचो)' }, magnet: { en: 'Magnet (drag me)', hi: 'चुंबक (मुझे खींचो)' }, coil: { en: 'Coil (drag me)', hi: 'कुंडली (मुझे खींचो)' },
    magnetTap: { en: 'Magnet (tap to turn, drag to move)', hi: 'चुंबक (घुमाने के लिए टैप, हिलाने के लिए खींचो)' },
    charge: { en: 'Charge', hi: 'आवेश' }, dragMe: { en: 'drag me', hi: 'मुझे खींचो' },
    outOfPage: { en: 'out of the page (dot)', hi: 'पन्ने से बाहर (बिंदु)' }, intoPage: { en: 'into the page (cross)', hi: 'पन्ने के अंदर (क्रॉस)' },
    anticlockwise: { en: 'anticlockwise', hi: 'वामावर्त' }, clockwise: { en: 'clockwise', hi: 'दक्षिणावर्त' },
    up: { en: 'up', hi: 'ऊपर' }, down: { en: 'down', hi: 'नीचे' }, left: { en: 'left', hi: 'बाएँ' }, right: { en: 'right', hi: 'दाएँ' },
    noCurrent: { en: 'The switch is off: no current, so no magnetic field from the wire. Switch it on.', hi: 'स्विच बंद है: धारा नहीं, इसलिए तार का कोई चुंबकीय क्षेत्र नहीं। स्विच चालू करो।' },
    rhr: { en: 'Right-hand thumb rule: thumb along the current, curled fingers show the field.', hi: 'दाएँ हाथ के अंगूठे का नियम: अंगूठा धारा की दिशा में, मुड़ी उँगलियाँ क्षेत्र की दिशा बताती हैं।' },
    flhr: { en: "Fleming's left-hand rule: First finger = Field, seCond finger = Current, thuMb = Motion.", hi: 'फ्लेमिंग का बायाँ-हाथ नियम: तर्जनी = क्षेत्र, मध्यमा = धारा, अंगूठा = गति।' },
    faraday: { en: 'A current is induced only while the magnetic field through the coil is changing.', hi: 'धारा तभी प्रेरित होती है जब कुंडली से गुज़रता चुंबकीय क्षेत्र बदल रहा हो।' },
    coulomb: { en: "Coulomb's law: F = k q₁q₂ / r²", hi: 'कूलॉम का नियम: F = k q₁q₂ / r²' },
    attract: { en: 'attract', hi: 'आकर्षित करते हैं' }, repel: { en: 'repel', hi: 'प्रतिकर्षित करते हैं' },
  };
  const N_PT = { en: 'N', hi: 'N' }, S_PT = { en: 'S', hi: 'S' };

  // ---------- geometry: physics in centred coordinates (x right, y up); SVG viewBox 0 0 800 460 ----------
  const W = 800, H = 460, CX = 400, CY = 230;
  const toS = (p) => [CX + p.x, CY - p.y];
  const fromS = (sx, sy) => ({ x: sx - CX, y: CY - sy });
  const deg = (bx, by) => (-Math.atan2(by, bx) * 180) / Math.PI; // screen rotation (deg) that points +x along (bx, by)
  const fmt = (v, d) => Number(v).toFixed(d == null ? 1 : d);

  // Field of magnetic poles (two-pole bar-magnet model; also point charges with q as m).
  function poleField(poles, p) {
    let bx = 0, by = 0;
    for (const q of poles) {
      const dx = p.x - q.x, dy = p.y - q.y;
      const r2 = dx * dx + dy * dy + 9;
      const f = q.m / (r2 * Math.sqrt(r2));
      bx += f * dx; by += f * dy;
    }
    return [bx, by];
  }
  // Infinite straight wire through (cx, cy), perpendicular to the page; I > 0 out of the page: B anticlockwise, ∝ I/r.
  function wireField(cx, cy, I, p) {
    const dx = p.x - cx, dy = p.y - cy;
    const r2 = dx * dx + dy * dy + 4;
    const f = (I * 1800) / r2;
    return [-dy * f, dx * f];
  }
  // Circular loop of radius R, axis along x through (cx, 0), by Biot–Savart (numeric). Cross-section: wire at
  // (cx, +R) carries current out of the page for I > 0, wire at (cx, −R) into the page. B at the centre is then +x.
  function loopField(cx, R, I, p, segs) {
    segs = segs || 40;
    let bx = 0, by = 0;
    for (let k = 0; k < segs; k++) {
      const ph = ((k + 0.5) * 2 * Math.PI) / segs;
      const sy = R * Math.cos(ph), sz = R * Math.sin(ph);
      const dly = -Math.sin(ph), dlz = Math.cos(ph);
      const rx = p.x - cx, ry = p.y - sy, rz = -sz;
      const r2 = rx * rx + ry * ry + rz * rz + 2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      bx += (dly * rz - dlz * ry) * inv;
      by += (dlz * rx) * inv;
    }
    const f = (I * R * 2 * Math.PI * 900) / segs;
    return [bx * f, by * f];
  }
  function solenoidField(x0, x1, n, R, I, p) {
    let bx = 0, by = 0;
    for (let i = 0; i < n; i++) {
      const cx = n === 1 ? (x0 + x1) / 2 : lerp(x0, x1, i / (n - 1));
      const [a, b] = loopField(cx, R, I, p, 24);
      bx += a; by += b;
    }
    return [bx, by];
  }
  // Follow a field line from a seed, forwards (dir 1) or backwards (dir -1), with a midpoint step.
  function trace(field, start, dir, opt) {
    const pts = [[start.x, start.y]];
    let p = { x: start.x, y: start.y };
    const h = (opt.h || 6) * dir, max = opt.max || 400;
    for (let i = 0; i < max; i++) {
      const [bx, by] = field(p);
      const m = Math.hypot(bx, by);
      if (m < 1e-7) break;
      const mid = { x: p.x + (bx / m) * h * 0.5, y: p.y + (by / m) * h * 0.5 };
      const [cx, cy] = field(mid);
      const m2 = Math.hypot(cx, cy) || 1;
      p = { x: p.x + (cx / m2) * h, y: p.y + (cy / m2) * h };
      pts.push([p.x, p.y]);
      if (Math.abs(p.x) > 430 || Math.abs(p.y) > 260) break;
      if (opt.stop && opt.stop(p)) break;
    }
    return pts;
  }
  // SVG path for a traced line plus arrowheads every `every` px along it, pointing with the field.
  function linePath(pts, every, cls) {
    if (pts.length < 2) return '';
    let d = '', acc = every * 0.55, arrows = '';
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = toS({ x: pts[i][0], y: pts[i][1] });
      d += (i ? 'L' : 'M') + sx.toFixed(1) + ' ' + sy.toFixed(1);
      if (i) {
        const [px, py] = toS({ x: pts[i - 1][0], y: pts[i - 1][1] });
        acc += Math.hypot(sx - px, sy - py);
        if (acc >= every) {
          acc = 0;
          const a = (Math.atan2(sy - py, sx - px) * 180) / Math.PI;
          arrows += `<path d="M-6 -4.5L4 0L-6 4.5z" class="${cls}arrow" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${a.toFixed(1)})"/>`;
        }
      }
    }
    return `<path d="${d}" class="${cls}line"/>${arrows}`;
  }
  // The seeds of the field lines around a pole: n directions, centred on `face` (radians), spread ±spread.
  function seedsAround(c, r, n, face, spread) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = face - spread + ((k + 0.5) / n) * 2 * spread;
      out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return out;
  }
  const inRect = (p, c, w, h, ang) => {
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    const dx = p.x - c.x, dy = p.y - c.y;
    const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
    return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
  };

  // ---------- small drawings ----------
  const EARTH_B = 0.45; // a weak uniform field (north = up the page) so a far-away compass still points north
  function magnetSVG(m, label, key, tapHint) {
    const [sx, sy] = toS(m);
    const rot = (-m.ang * 180) / Math.PI;
    const w = m.len, h = m.h;
    const hit = key ? ` class="fd-drag" data-key="${key}" data-drag="${key}" role="button" tabindex="0" aria-label="${esc(label)}"` : '';
    return `<g transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${rot.toFixed(1)})"${hit}>
      <rect x="${-w / 2 - 26}" y="${-h / 2 - 22}" width="${w + 52}" height="${h + 44}" rx="18" fill="#FFD23F" class="fd-glow"/>
      <rect x="${-w / 2 - 22}" y="${-h / 2 - 18}" width="${w + 44}" height="${h + 36}" fill="transparent"/>
      <rect x="${-w / 2 + 3}" y="${-h / 2 + 6}" width="${w}" height="${h}" rx="7" fill="#061233" opacity=".22"/>
      <rect x="${-w / 2}" y="${-h / 2}" width="${w / 2}" height="${h}" rx="0" fill="url(#fdS)"/>
      <rect x="0" y="${-h / 2}" width="${w / 2}" height="${h}" fill="url(#fdN)"/>
      <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7" fill="none" stroke="#0B1D5C" stroke-width="2.5"/>
      <rect x="${-w / 2 + 6}" y="${-h / 2 + 5}" width="${w - 12}" height="6" rx="3" fill="#fff" opacity=".35"/>
      <text x="${w / 4}" y="7" text-anchor="middle" class="fd-lbl" transform="rotate(${(-rot).toFixed(1)} ${w / 4} 0)">N</text><text x="${-w / 4}" y="7" text-anchor="middle" class="fd-lbl" transform="rotate(${(-rot).toFixed(1)} ${-w / 4} 0)">S</text>
    </g>${tapHint ? `<text x="${sx.toFixed(1)}" y="${(sy + (Math.abs(Math.sin(m.ang)) > 0.5 ? w / 2 : h / 2) + 30).toFixed(1)}" text-anchor="middle" class="fd-tag" style="paint-order:stroke;stroke:#F4F7FD;stroke-width:4px">${esc(tapHint)}</text>` : ''}`;
  }
  function compassSVG(sx, sy, needle, r, key, label) {
    const hit = key ? ` class="fd-drag" data-key="${key}" data-drag="${key}" role="button" tabindex="0" aria-label="${esc(label)}"` : '';
    const big = r > 18;
    return `<g transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)})"${hit}>
      ${key ? `<circle r="${r + 20}" fill="#FFD23F" class="fd-glow"/><circle r="${r + 18}" fill="transparent"/>` : ''}
      <circle r="${r}" fill="url(#fdGlass)" stroke="#5B6B8C" stroke-width="${big ? 3 : 1.5}"/>
      ${big ? `<circle r="${r - 6}" fill="none" stroke="#B8C4DD" stroke-width="1" stroke-dasharray="2 5"/><text y="${-r + 14}" text-anchor="middle" class="fd-small">N</text>` : ''}
      <g transform="rotate(${needle.toFixed(1)})">
        <path d="M0 ${-r * 0.22}L${r * 0.82} 0L0 ${r * 0.22}z" fill="#E11D48"/>
        <path d="M0 ${-r * 0.22}L${-r * 0.82} 0L0 ${r * 0.22}z" fill="#CBD5E1" stroke="#64748B" stroke-width=".6"/>
      </g>
      <circle r="${big ? 4 : 2}" fill="#0B1D5C"/>
    </g>`;
  }
  const dotCross = (sx, sy, r, sign, col) => `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${col || '#F59E0B'}" stroke="#7C2D12" stroke-width="2"/>` +
    (sign > 0 ? `<circle cx="${sx}" cy="${sy}" r="${r * 0.3}" fill="#7C2D12"/>` : sign < 0 ? `<path d="M${sx - r * 0.5} ${sy - r * 0.5}L${sx + r * 0.5} ${sy + r * 0.5}M${sx + r * 0.5} ${sy - r * 0.5}L${sx - r * 0.5} ${sy + r * 0.5}" stroke="#7C2D12" stroke-width="2.4" stroke-linecap="round"/>` : '');
  const arrowSVG = (x1, y1, x2, y2, col, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hx = x2 - 11 * Math.cos(a), hy = y2 - 11 * Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${col}" stroke-width="${w || 4}" stroke-linecap="round"/><path d="M-11 -7L0 0L-11 7z" fill="${col}" transform="translate(${x2.toFixed(1)} ${y2.toFixed(1)}) rotate(${((a * 180) / Math.PI).toFixed(1)})"/>`;
  };
  const circuitSVG = (sx, sy, on, sign, t) => `<g transform="translate(${sx} ${sy})" aria-hidden="true">
      <rect x="-70" y="-26" width="140" height="52" rx="10" fill="#FFFFFF" opacity=".7" stroke="#C5CFE3"/>
      <text x="-62" y="-11" class="fd-small">${esc(t(T.switchName))}: ${on ? 'ON' : 'OFF'}</text>
      <line x1="-40" y1="12" x2="-20" y2="12" stroke="#0B1D5C" stroke-width="2.5"/><line x1="-22" y1="4" x2="-22" y2="20" stroke="#0B1D5C" stroke-width="4"/><line x1="-14" y1="8" x2="-14" y2="16" stroke="#0B1D5C" stroke-width="2.5"/><line x1="-12" y1="12" x2="4" y2="12" stroke="#0B1D5C" stroke-width="2.5"/>
      <text x="-30" y="0" class="fd-small" font-size="10">${sign > 0 ? '−   +' : '+   −'}</text>
      <circle cx="10" cy="12" r="3" fill="#0B1D5C"/><circle cx="40" cy="12" r="3" fill="#0B1D5C"/>
      <line x1="10" y1="12" x2="${on ? 40 : 34}" y2="${on ? 12 : -4}" stroke="${on ? '#0F766E' : '#B42318'}" stroke-width="3" stroke-linecap="round"/>
      <line x1="40" y1="12" x2="60" y2="12" stroke="#0B1D5C" stroke-width="2.5"/></g>`;
  const DEFS = `<defs>
    <linearGradient id="fdBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F7FD"/><stop offset="1" stop-color="#DCE4F3"/></linearGradient>
    <linearGradient id="fdN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F87171"/><stop offset="1" stop-color="#B91C1C"/></linearGradient>
    <linearGradient id="fdS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#1E40AF"/></linearGradient>
    <radialGradient id="fdGlass" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE6F5"/></radialGradient>
    <radialGradient id="fdEarth" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#7DD3FC"/><stop offset=".7" stop-color="#1D4ED8"/><stop offset="1" stop-color="#0B1D5C"/></radialGradient>
    <linearGradient id="fdCu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F59E0B"/><stop offset=".5" stop-color="#FDE68A"/><stop offset="1" stop-color="#D97706"/></linearGradient>
    <linearGradient id="fdIron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CBD5E1"/><stop offset="1" stop-color="#64748B"/></linearGradient>
    <pattern id="fdGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#C9D3E4" stroke-width="1"/></pattern>
  </defs>`;

  // ---------- the modes: each knows its field, its drawing, its seeds and its words ----------
  const CURRENT_MODES = ['wire', 'loop', 'solenoid', 'force-on-wire', 'motor'];
  function makeState(cfg) {
    const mode = cfg.source;
    const S = {
      mode, view: cfg.show && !(mode === 'charges' && cfg.show === 'compass') ? cfg.show : 'lines', on: cfg.on != null ? !!cfg.on : false, I: cfg.current != null ? cfg.current : 2, sign: 1,
      turns: cfg.turns != null ? cfg.turns : mode === 'solenoid' ? 7 : 6, filings: null, sprinkled: false,
      compass: { x: 0, y: -150 }, needle: 0, drag: null, motorA: 0, turnsDone: 0, wireY: 0,
      gal: 0, flux: 0, fluxPrev: null, ip: 0, lastT: null, kick: 0, induceCool: 0,
    };
    if (mode === 'bar-magnet') S.mag = { x: 0, y: 0, ang: 0, len: 170, h: 46 };
    if (mode === 'two-magnets') { S.magA = { x: -160, y: 0, ang: 0, len: 150, h: 44 }; S.mag = { x: 175, y: 0, ang: Math.PI, len: 150, h: 44 }; }
    if (mode === 'induction') { S.mag = { x: -235, y: 0, ang: 0, len: 150, h: 44 }; S.coilX = 95; S.turns = cfg.turns != null ? cfg.turns : 6; }
    if (mode === 'charges') S.charges = (cfg.charges || [{ q: 2, x: 32, y: 50 }, { q: -2, x: 68, y: 50 }]).map((c) => ({ q: c.q, x: clamp((c.x - 50) * 4.4, -200, 200), y: clamp((50 - c.y) * 4.4, -200, 200) }));
    if (mode === 'earth') S.compass = { x: 260, y: 90 };
    if (mode === 'force-on-wire' || mode === 'motor' || mode === 'wire' || mode === 'loop' || mode === 'solenoid') S.compass = { x: mode === 'wire' ? 0 : 0, y: mode === 'wire' ? -120 : -150 };
    if (mode === 'solenoid' || mode === 'loop') S.compass = { x: 0, y: -150 };
    if (mode === 'wire') S.compass = { x: 0, y: -120 };
    return S;
  }
  const curI = (S) => (S.on ? S.I * S.sign : 0);
  const polesOf = (m, strength) => {
    const c = Math.cos(m.ang), s = Math.sin(m.ang), d = m.len / 2 - 8;
    return [{ x: m.x + c * d, y: m.y + s * d, m: strength }, { x: m.x - c * d, y: m.y - s * d, m: -strength }];
  };
  const MAG_M = 2.3e5;
  // A field function for the whole scene, in centred coordinates.
  // pure: true leaves out the Earth's weak field (used to trace field lines of the source alone, so they close).
  function fieldOf(S, pure) {
    const m = S.mode;
    const withEarth = (f) => (pure ? f : (p) => { const [bx, by] = f(p); return [bx, by + EARTH_B]; });
    if (m === 'bar-magnet') return withEarth((p) => poleField(polesOf(S.mag, MAG_M), p));
    if (m === 'two-magnets') return withEarth((p) => poleField(polesOf(S.magA, MAG_M).concat(polesOf(S.mag, MAG_M)), p));
    if (m === 'wire') return withEarth((p) => wireField(0, 0, curI(S), p));
    if (m === 'loop') return withEarth((p) => loopField(0, 95, curI(S), p));
    if (m === 'solenoid') return withEarth((p) => solenoidField(-135, 135, S.turns, 54, curI(S) * 0.6, p));
    if (m === 'induction') return withEarth((p) => poleField(polesOf(S.mag, MAG_M), p));
    if (m === 'earth') return (p) => poleField(earthPoles(), p);
    if (m === 'charges') return (p) => poleField(S.charges.map((c) => ({ x: c.x, y: c.y, m: c.q * 1.1e5 })), p);
    if (m === 'force-on-wire') return (p) => (Math.abs(p.x) < 130 && Math.abs(p.y) < 110 ? [9, 0] : [0, 0]);
    return () => [0, 0];
  }
  const EARTH_TILT = (11 * Math.PI) / 180, EARTH_R = 150;
  function earthPoles() {
    // Earth's magnetic axis is tilted about 11° from its spin axis. Field lines come out near the geographic south
    // and go in near the geographic north: the "S" of the Earth-magnet is in the north.
    const ax = Math.sin(EARTH_TILT), ay = Math.cos(EARTH_TILT), d = EARTH_R * 0.3;
    return [{ x: -ax * d, y: -ay * d, m: MAG_M * 1.3 }, { x: ax * d, y: ay * d, m: -MAG_M * 1.3 }];
  }
  // Where filings, arrows and small compasses must not be drawn (inside solid things).
  function excludedOf(S) {
    const m = S.mode;
    if (m === 'bar-magnet') return (p) => inRect(p, S.mag, S.mag.len + 14, S.mag.h + 14, S.mag.ang);
    if (m === 'two-magnets') return (p) => inRect(p, S.magA, S.magA.len + 14, S.magA.h + 14, S.magA.ang) || inRect(p, S.mag, S.mag.len + 14, S.mag.h + 14, S.mag.ang);
    if (m === 'wire') return (p) => Math.hypot(p.x, p.y) < 30;
    if (m === 'loop') return (p) => Math.abs(p.x) < 18 && (Math.abs(Math.abs(p.y) - 95) < 18);
    if (m === 'solenoid') return (p) => Math.abs(p.x) < 150 && Math.abs(Math.abs(p.y) - 54) < 16;
    if (m === 'induction') return (p) => inRect(p, S.mag, S.mag.len + 14, S.mag.h + 14, S.mag.ang) || (Math.abs(p.x - S.coilX) < 40 && Math.abs(p.y) < 80);
    if (m === 'earth') return (p) => Math.hypot(p.x, p.y) < EARTH_R + 10;
    if (m === 'charges') return (p) => S.charges.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 30);
    if (m === 'force-on-wire') return (p) => Math.abs(p.x) > 130 || Math.abs(p.y) > 110;
    return () => true;
  }
  // Seeds of the field lines: where each line starts and which way to follow it.
  function seedsOf(S) {
    const m = S.mode, out = [];
    const pole = (mag, n) => {
      const [N, Sp] = polesOf(mag, 1);
      const face = mag.ang;
      seedsAround(N, 16, n, face, Math.PI * 0.9).forEach((p) => out.push({ p, dir: 1, stop: (q) => Math.hypot(q.x - Sp.x, q.y - Sp.y) < 16 || inRect(q, mag, mag.len - 4, mag.h - 4, mag.ang) }));
      seedsAround(Sp, 16, n, face + Math.PI, Math.PI * 0.9).forEach((p) => out.push({ p, dir: -1, drop: (q) => Math.hypot(q.x - N.x, q.y - N.y) < 16 || inRect(q, mag, mag.len - 4, mag.h - 4, mag.ang), stop: (q) => Math.hypot(q.x - N.x, q.y - N.y) < 16 || inRect(q, mag, mag.len - 4, mag.h - 4, mag.ang) }));
    };
    if (m === 'bar-magnet' || m === 'induction') pole(S.mag, 12);
    if (m === 'two-magnets') { pole(S.magA, 10); pole(S.mag, 10); }
    if (m === 'earth') {
      const [N, Sp] = earthPoles();
      const face = Math.atan2(N.y, N.x);
      const back = (q) => Math.hypot(q.x, q.y) < EARTH_R + 2;
      seedsAround({ x: 0, y: 0 }, EARTH_R + 4, 16, face, Math.PI * 0.82).forEach((p) => out.push({ p, dir: 1, stop: (q) => back(q) && Math.hypot(q.x - Sp.x, q.y - Sp.y) < Math.hypot(q.x - N.x, q.y - N.y) }));
      // lines that come in from far away near the north: traced backwards from the surface; drop those already drawn
      seedsAround({ x: 0, y: 0 }, EARTH_R + 4, 16, face + Math.PI, Math.PI * 0.82).forEach((p) => out.push({ p, dir: -1, stop: back, drop: back }));
    }
    if (m === 'loop' && curI(S)) {
      const nearWire = (q) => Math.abs(q.x) < 12 && Math.abs(Math.abs(q.y) - 95) < 12;
      [0, 28, 55, 128, 165, 205].forEach((y) => { [1, -1].forEach((sg) => { if (y === 0 && sg < 0) return; out.push({ p: { x: 0, y: y * sg }, dir: 1, stop: nearWire, closed: true }); }); });
    }
    if (m === 'solenoid' && curI(S)) {
      const nearWire = (q) => Math.abs(q.x) < 146 && Math.abs(Math.abs(q.y) - 54) < 11;
      [0, 17, 34, 92, 125, 165, 210].forEach((y) => { [1, -1].forEach((sg) => { if (y === 0 && sg < 0) return; out.push({ p: { x: 0, y: y * sg }, dir: 1, stop: nearWire, closed: true }); }); });
    }
    if (m === 'charges') {
      S.charges.forEach((c, i) => {
        const n = Math.round(Math.abs(c.q)) * 6;
        const stop = (q) => S.charges.some((o, j) => j !== i && Math.hypot(q.x - o.x, q.y - o.y) < 14);
        // lines from a − charge that end on a + charge are already drawn from the + side
        const drop = c.q < 0 ? (q) => S.charges.some((o) => o.q > 0 && Math.hypot(q.x - o.x, q.y - o.y) < 15) : null;
        seedsAround(c, 14, n, 0.3, Math.PI).forEach((p) => out.push({ p, dir: c.q > 0 ? 1 : -1, stop, drop }));
      });
    }
    return out;
  }

  // ---------- mount ----------
  function mount(root, cfg, api) {
    const S = makeState(cfg);
    const mode = S.mode;
    const t = (x) => api.t(x);
    const hasSwitch = CURRENT_MODES.includes(mode) || mode === 'induction';
    const hasReverse = hasSwitch || mode === 'two-magnets';
    const hasCompass = ['bar-magnet', 'two-magnets', 'wire', 'loop', 'solenoid', 'earth'].includes(mode);
    const hasTurns = mode === 'solenoid' || mode === 'induction';
    const hasCurrentSlider = CURRENT_MODES.includes(mode);
    const isE = mode === 'charges';
    let raf = null, stopAnim = null, dirty = false;

    root.innerHTML = `<div class="fd-wrap">
      <svg class="fd-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(t(T.modes[mode]))}"></svg>
      <div class="fd-controls">
        ${hasSwitch ? `<button type="button" class="fd-btn" data-key="switch" aria-pressed="${S.on}"><span class="fd-dot"></span><span class="fd-sw"></span></button>` : ''}
        ${hasReverse ? `<button type="button" class="fd-btn" data-key="reverse">⇄ ${esc(t(hasSwitch && mode !== 'induction' ? T.reverse : T.flip))}</button>` : ''}
        <button type="button" class="fd-btn fd-act" data-key="sprinkle">✦ ${esc(t(isE ? T.sprinkleSeeds : T.sprinkle))}</button>
        <div class="fd-views" role="group" aria-label="${esc(t({ en: 'View', hi: 'दृश्य' }))}">${(isE ? ['lines', 'vectors', 'filings'] : ['lines', 'compass', 'vectors', 'filings']).map((v) => `<button type="button" data-key="view:${v}" aria-pressed="${S.view === v}">${esc(t(isE && v === 'filings' ? T.seeds : T.views[v]))}</button>`).join('')}</div>
      </div>
      ${hasCurrentSlider || hasTurns ? `<div class="fd-sliders">
        ${hasCurrentSlider ? `<label class="fd-slider"><span>${esc(t(T.current))} <output id="fd-iout">${fmt(S.I)} A</output></span><input type="range" data-key="slider:current" min="0" max="5" step="0.5" value="${S.I}" aria-label="${esc(t(T.current))}"></label>` : ''}
        ${hasTurns ? `<label class="fd-slider"><span>${esc(t(T.turns))} <output id="fd-nout">${S.turns}</output></span><input type="range" data-key="slider:turns" min="2" max="12" step="1" value="${S.turns}" aria-label="${esc(t(T.turns))}"></label>` : ''}
      </div>` : ''}
      <div class="fd-read" aria-live="polite"></div>
    </div>`;
    const svg = root.querySelector('svg');
    const wrapEl = root.querySelector('.fd-wrap');
    const fit = () => wrapEl.classList.toggle('fd-narrow', (root.clientWidth || 800) < 600);
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(root);
    const readEl = root.querySelector('.fd-read');

    // ----- field helpers bound to the state -----
    const field = () => fieldOf(S);
    const excluded = () => excludedOf(S);
    const needleAt = (p) => { const [bx, by] = field()(p); return Math.hypot(bx, by) < 1e-6 ? -90 : deg(bx, by); };
    const sat = (mags) => { const s = mags.filter((m) => m > 0).sort((a, b) => a - b); if (!s.length) return () => 0; const lo = Math.log(s[Math.floor(s.length * 0.15)] + 1e-9), hi = Math.log(s[Math.floor(s.length * 0.95)] + 1e-9); return (m) => (hi - lo < 1e-6 ? 0.7 : clamp((Math.log(m + 1e-9) - lo) / (hi - lo), 0, 1)); };
    const underUI = (p) => (p.y > 150 && p.x < -120) || (hasSwitch && p.y < -125 && p.x < -230);
    const gridPts = (step, jitter) => {
      const out = [];
      for (let y = -205; y <= 205; y += step) for (let x = -385; x <= 385; x += step) { const q = { x: x + (jitter ? (Math.random() - 0.5) * jitter : 0), y: y + (jitter ? (Math.random() - 0.5) * jitter : 0) }; if (!underUI(q)) out.push(q); }
      return out;
    };
    function makeFilings() { const ex = excluded(); S.filings = gridPts(26, 16).filter((p) => !ex(p)).map((p) => ({ x: p.x, y: p.y, a0: Math.random() * 180, k: 0 })); }

    // ----- field layers -----
    const lineCls = isE ? 'fd-e' : 'fd-';
    function linesLayer() {
      const f = fieldOf(S, true);
      if (mode === 'wire') {
        const I = curI(S);
        if (!I) return '';
        const n = Math.round(2 + Math.abs(I) * 1.4);
        let out = '';
        for (let k = 0; k < n; k++) {
          const r = 34 + 24 * k + 2.2 * k * k;
          if (r > 250) break;
          const [sx, sy] = toS({ x: 0, y: 0 });
          out += `<circle cx="${sx}" cy="${sy}" r="${r}" class="fd-line"/>`;
          [0, 90, 180, 270].forEach((a) => { const rad = (a * Math.PI) / 180; const px = sx + r * Math.cos(rad), py = sy + r * Math.sin(rad); const rot = a + (I > 0 ? -90 : 90); out += `<path d="M-6 -4.5L4 0L-6 4.5z" class="fd-arrow" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot})"/>`; });
        }
        return out;
      }
      if (mode === 'force-on-wire' || mode === 'motor') {
        let out = '';
        for (let y = -90; y <= 90; y += 30) { const [x1, y1] = toS({ x: -128, y }), [x2] = toS({ x: 128, y }); out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" class="fd-line" opacity=".5"/><path d="M-6 -4.5L4 0L-6 4.5z" class="fd-arrow" transform="translate(${(x1 + x2) / 2} ${y1})"/>`; }
        return out;
      }
      return seedsOf(S).map((sd) => {
        if (sd.closed) { // follow the line both ways from its seed until it closes, leaves the scene or meets a wire
          const fwd = trace(f, sd.p, 1, { h: 3, max: 1300, stop: sd.stop });
          let i = 40; for (; i < fwd.length; i++) if (Math.hypot(fwd[i][0] - sd.p.x, fwd[i][1] - sd.p.y) < 7) break;
          if (i < fwd.length) { fwd.length = i + 1; return linePath(fwd, 72, lineCls); }
          const back = trace(f, sd.p, -1, { h: 3, max: 1300, stop: sd.stop });
          return linePath(back.reverse().concat(fwd.slice(1)), 72, lineCls);
        }
        const pts = trace(f, sd.p, sd.dir, { h: 5, max: 500, stop: sd.stop });
        if (sd.drop && pts.length > 2 && sd.drop({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] })) return '';
        return linePath(sd.dir > 0 ? pts : pts.reverse(), 72, lineCls);
      }).join('');
    }
    function vectorsLayer() {
      const f = field(), ex = excluded();
      const pts = gridPts(54, 0).filter((p) => !ex(p)).map((p) => { const [bx, by] = f(p); return { p, bx, by, m: Math.hypot(bx, by) }; });
      const st = sat(pts.map((q) => q.m));
      return pts.map(({ p, bx, by, m }) => { if (m < 1e-6) return ''; const s = st(m); const len = 9 + 19 * s; const [sx, sy] = toS(p); const a = deg(bx, by); return `<g transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${a.toFixed(1)})" opacity="${(0.35 + 0.65 * s).toFixed(2)}"><line x1="${-len / 2}" y1="0" x2="${len / 2 - 6}" y2="0" class="fd-vec"/><path d="M-7 -5L0 0L-7 5z" class="fd-vech" transform="translate(${len / 2} 0)"/></g>`; }).join('');
    }
    function compassesLayer() {
      const ex = excluded();
      return gridPts(80, 0).filter((p) => !ex(p) && (!hasCompass || Math.hypot(p.x - S.compass.x, p.y - S.compass.y) > 60)).map((p) => { const [sx, sy] = toS(p); return compassSVG(sx, sy, needleAt(p), 15); }).join('');
    }
    function filingsLayer() {
      if (!S.filings) { const [sx, sy] = toS({ x: 0, y: -195 }); return `<text x="${sx}" y="${sy}" text-anchor="middle" class="fd-sub">${esc(t({ en: '↓ Tap "Sprinkle" below', hi: '↓ नीचे "छिड़को" दबाओ' }))}</text>`; }
      const f = field();
      const data = S.filings.map((q) => { const [bx, by] = f(q); return { q, m: Math.hypot(bx, by), a: deg(bx, by) }; });
      const st = sat(data.map((d) => d.m));
      return `<g id="fd-filings">${data.map(({ q, m, a }, i) => { const s = m < 1e-6 ? 0 : st(m); const len = 5 + 9 * s; const [sx, sy] = toS(q); const ang = m < 1e-6 ? q.a0 : lerp(q.a0, a, q.k); return `<line x1="${-len / 2}" y1="0" x2="${len / 2}" y2="0" class="fd-filing" data-i="${i}" data-a="${a.toFixed(1)}" data-a0="${q.a0.toFixed(1)}" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${ang.toFixed(1)})" opacity="${((0.25 + 0.7 * s) * (0.15 + 0.85 * q.k)).toFixed(2)}"/>`; }).join('')}</g>`;
    }
    function fieldLayer() {
      if (S.view === 'lines') return linesLayer();
      if (S.view === 'vectors') return vectorsLayer();
      if (S.view === 'compass') return compassesLayer();
      return filingsLayer();
    }

    // ----- scenes -----
    const poleBlocks = () => { const [lx, ty] = toS({ x: -235, y: 110 }); const [rx] = toS({ x: 130, y: 0 }); return `<rect x="${lx}" y="${ty}" width="105" height="220" rx="10" fill="url(#fdN)" stroke="#0B1D5C" stroke-width="2.5"/><text x="${lx + 52}" y="${ty + 122}" text-anchor="middle" class="fd-lbl" style="font-size:34px">N</text><rect x="${rx}" y="${ty}" width="105" height="220" rx="10" fill="url(#fdS)" stroke="#0B1D5C" stroke-width="2.5"/><text x="${rx + 52}" y="${ty + 122}" text-anchor="middle" class="fd-lbl" style="font-size:34px">S</text>`; };
    function sceneUnder() {
      if (mode === 'loop') { const [sx, sy] = toS({ x: 0, y: 0 }); return `<ellipse cx="${sx}" cy="${sy}" rx="16" ry="95" fill="none" stroke="#D97706" stroke-width="5" opacity=".45"/>`; }
      if (mode === 'solenoid') { const [sx, sy] = toS({ x: -150, y: 54 }); return `<rect x="${sx}" y="${sy}" width="300" height="108" rx="12" fill="#FFF7ED" stroke="#F59E0B" stroke-width="1.5" opacity=".55"/>`; }
      if (mode === 'force-on-wire' || mode === 'motor') return poleBlocks();
      if (mode === 'charges') { const [sx, sy] = toS({ x: -220, y: 220 }); return `<rect x="${sx}" y="${sy}" width="440" height="440" rx="14" fill="#FFFFFF" opacity=".55" stroke="#C5CFE3"/>`; }
      if (mode === 'earth') return earthSVG();
      return '';
    }
    function earthSVG() {
      const [cx, cy] = toS({ x: 0, y: 0 });
      const tilt = (EARTH_TILT * 180) / Math.PI, R = EARTH_R;
      return `<g>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#fdEarth)" stroke="#0B1D5C" stroke-width="2.5"/>
        <path d="M${cx - 60} ${cy - 90}c20-18 48-10 60 6s-6 40-28 44-36-14-40-28 2-16 8-22z" fill="#22C55E" opacity=".85"/>
        <path d="M${cx + 10} ${cy - 40}c26-16 56-4 66 20s-10 48-36 46-44-20-46-36 6-24 16-30z" fill="#22C55E" opacity=".85"/>
        <path d="M${cx - 90} ${cy + 20}c18-10 36 0 40 18s-8 36-26 36-32-16-30-30 6-20 16-24z" fill="#22C55E" opacity=".85"/>
        <ellipse cx="${cx}" cy="${cy - R + 18}" rx="42" ry="14" fill="#F8FAFC" opacity=".8"/><ellipse cx="${cx}" cy="${cy + R - 18}" rx="42" ry="14" fill="#F8FAFC" opacity=".8"/>
        <line x1="${cx}" y1="${cy - R - 26}" x2="${cx}" y2="${cy + R + 26}" stroke="#0B1D5C" stroke-width="2.5" stroke-dasharray="8 6"/>
        <g transform="rotate(${tilt} ${cx} ${cy})"><line x1="${cx}" y1="${cy - R - 40}" x2="${cx}" y2="${cy + R + 40}" stroke="#B91C1C" stroke-width="2" stroke-dasharray="3 5"/>
          <rect x="${cx - 15}" y="${cy - 64}" width="30" height="64" rx="0" fill="url(#fdS)"/><rect x="${cx - 15}" y="${cy}" width="30" height="64" fill="url(#fdN)"/><rect x="${cx - 15}" y="${cy - 64}" width="30" height="128" rx="6" fill="none" stroke="#0B1D5C" stroke-width="2"/>
          <text x="${cx}" y="${cy - 26}" text-anchor="middle" class="fd-lbl" style="font-size:18px">S</text><text x="${cx}" y="${cy + 40}" text-anchor="middle" class="fd-lbl" style="font-size:18px">N</text></g>
        <text x="${cx}" y="${cy - R - 32}" text-anchor="middle" class="fd-tag">${esc(t({ en: 'Geographic North', hi: 'भौगोलिक उत्तर' }))}</text>
        <text x="${cx}" y="${cy + R + 44}" text-anchor="middle" class="fd-tag">${esc(t({ en: 'Geographic South', hi: 'भौगोलिक दक्षिण' }))}</text>
      </g>`;
    }
    function sceneOver() {
      const I = curI(S);
      if (mode === 'bar-magnet') return magnetSVG(S.mag, t(T.magnetTap), 'magnet', t({ en: 'tap: turn · drag: move', hi: 'टैप: घुमाओ · खींचो: हिलाओ' }));
      if (mode === 'two-magnets') return magnetSVG(S.magA) + magnetSVG(S.mag, t(T.magnet), 'magnet', t(T.dragMe));
      if (mode === 'wire') { const [sx, sy] = toS({ x: 0, y: 0 }); return dotCross(sx, sy, 17, I) + `<text x="${sx + 22}" y="${sy + 26}" class="fd-tag" style="paint-order:stroke;stroke:#F4F7FD;stroke-width:5px">I ${I ? (I > 0 ? '⊙' : '⊗') : '= 0'}</text>` + circuitSVG(90, H - 44, S.on, S.sign, t); }
      if (mode === 'loop') { const [sx, sy1] = toS({ x: 0, y: 95 }), [, sy2] = toS({ x: 0, y: -95 }); return dotCross(sx, sy1, 13, I) + dotCross(sx, sy2, 13, -I) + circuitSVG(90, H - 44, S.on, S.sign, t); }
      if (mode === 'solenoid') {
        let out = '';
        for (let i = 0; i < S.turns; i++) { const x = S.turns === 1 ? 0 : lerp(-135, 135, i / (S.turns - 1)); const [sx, sy1] = toS({ x, y: 54 }), [, sy2] = toS({ x, y: -54 }); out += `<line x1="${sx}" y1="${sy1}" x2="${sx + 6}" y2="${sy2}" stroke="#D97706" stroke-width="3" opacity=".5"/>` + dotCross(sx, sy1, 10, I) + dotCross(sx, sy2, 10, -I); }
        if (I) { const [lx, ly] = toS({ x: -190, y: 0 }), [rx] = toS({ x: 190, y: 0 }); out += `<text x="${rx}" y="${ly + 8}" text-anchor="middle" class="fd-lbl" style="font-size:34px;fill:${I > 0 ? '#B91C1C' : '#1E40AF'}" stroke="#fff" stroke-width="4" paint-order="stroke">${I > 0 ? 'N' : 'S'}</text><text x="${lx}" y="${ly + 8}" text-anchor="middle" class="fd-lbl" style="font-size:34px;fill:${I > 0 ? '#1E40AF' : '#B91C1C'}" stroke="#fff" stroke-width="4" paint-order="stroke">${I > 0 ? 'S' : 'N'}</text>`; }
        return out + circuitSVG(90, H - 44, S.on, S.sign, t);
      }
      if (mode === 'force-on-wire') {
        const [sx, sy] = toS({ x: 0, y: S.wireY });
        const [, top] = toS({ x: 0, y: 200 });
        let out = `<path d="M${sx - 10} ${top}L${sx - 10} ${sy - 30}L${sx} ${sy}M${sx + 10} ${top}L${sx + 10} ${sy - 30}L${sx} ${sy}" fill="none" stroke="#D97706" stroke-width="3"/>` + dotCross(sx, sy, 18, I);
        out += arrowSVG(sx - 108, top - 10, sx - 20, top - 10, '#1D4ED8') + `<text x="${sx - 64}" y="${top - 18}" text-anchor="middle" class="fd-tag" style="fill:#1D4ED8">B</text>`;
        if (I) { const dir = I > 0 ? -1 : 1; out += arrowSVG(sx + 44, sy, sx + 44, sy + dir * 70, '#0F766E', 5) + `<text x="${sx + 60}" y="${sy + dir * 40}" class="fd-tag" style="fill:#0F766E">F</text>`; }
        return out + circuitSVG(90, H - 44, S.on, S.sign, t);
      }
      if (mode === 'motor') return motorSVG(I);
      if (mode === 'induction') return inductionSVG();
      if (mode === 'charges') return chargesSVG();
      return '';
    }
    function motorSVG(I) {
      const [cx, cy] = toS({ x: 0, y: 0 });
      const a = S.motorA, r = 92;
      const ax = cx + r * Math.cos(a), ay = cy - r * Math.sin(a), bx = cx - r * Math.cos(a), by = cy + r * Math.sin(a);
      const right = Math.cos(a) >= 0; // the arm on the right half always carries current out of the page for I > 0 (the commutator sees to it)
      const sA = right ? I : -I, sB = -sA;
      let out = `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#92400E" stroke-width="9" stroke-linecap="round"/><line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="url(#fdCu)" stroke-width="6" stroke-linecap="round"/>`;
      out += dotCross(ax, ay, 15, sA) + dotCross(bx, by, 15, sB);
      // commutator: two half rings turning with the coil, brushes fixed at left and right
      out += `<g transform="rotate(${((-a * 180) / Math.PI).toFixed(1)} ${cx} ${cy})"><path d="M${cx + 24} ${cy}A24 24 0 0 1 ${cx - 24} ${cy}" fill="none" stroke="#D97706" stroke-width="8"/><path d="M${cx - 24} ${cy}A24 24 0 0 1 ${cx + 24} ${cy}" fill="none" stroke="#B45309" stroke-width="8"/></g><circle cx="${cx}" cy="${cy}" r="7" fill="#334155"/>`;
      out += `<rect x="${cx - 46}" y="${cy - 6}" width="14" height="12" rx="3" fill="#1E293B"/><rect x="${cx + 32}" y="${cy - 6}" width="14" height="12" rx="3" fill="#1E293B"/>`;
      if (I) {
        const F = 36 + 10 * Math.abs(I);
        const fA = sA > 0 ? -1 : 1, fB = sB > 0 ? -1 : 1; // F = I L × B with B to the right: out-of-page current → up
        out += arrowSVG(ax, ay, ax, ay + fA * F, '#0F766E', 5) + arrowSVG(bx, by, bx, by + fB * F, '#0F766E', 5);
        out += `<text x="${ax + 20}" y="${ay + fA * F * 0.6}" class="fd-tag" style="fill:#0F766E">F</text><text x="${bx + 20}" y="${by + fB * F * 0.6}" class="fd-tag" style="fill:#0F766E">F</text>`;
        const ccw = I > 0;
        out += `<path d="M${cx - 84} ${cy - 84}A119 119 0 0 1 ${cx + 84} ${cy - 84}" fill="none" stroke="#6D28D9" stroke-width="3" stroke-dasharray="6 5"/><path d="M-11 -7L0 0L-11 7z" fill="#6D28D9" transform="translate(${ccw ? cx - 84 : cx + 84} ${cy - 84}) rotate(${ccw ? 135 : 45})"/><text x="${cx}" y="${cy + 150}" text-anchor="middle" class="fd-tag" style="fill:#6D28D9">${esc(t(ccw ? T.anticlockwise : T.clockwise))} · ${esc(t({ en: 'turns', hi: 'चक्कर' }))}: ${S.turnsDone}</text>`;
      }
      return out + circuitSVG(90, H - 44, S.on, S.sign, t);
    }
    function inductionSVG() {
      const [cx, cy] = toS({ x: S.coilX, y: 0 });
      let out = `<g class="fd-drag" data-key="coil" data-drag="coil" role="button" tabindex="0" aria-label="${esc(t(T.coil))}" transform="translate(${cx.toFixed(1)} ${cy})">
        <rect x="-60" y="-100" width="120" height="200" rx="16" fill="#FFD23F" class="fd-glow"/>
        <rect x="-46" y="-84" width="92" height="168" rx="10" fill="#FFF7ED" stroke="#F59E0B" stroke-width="2"/>`;
      for (let i = 0; i < S.turns; i++) { const x = -36 + (72 * (i + 0.5)) / S.turns; out += `<line x1="${x.toFixed(1)}" y1="-84" x2="${(x + 4).toFixed(1)}" y2="84" stroke="#D97706" stroke-width="3" opacity=".6"/><circle cx="${x.toFixed(1)}" cy="-84" r="5" fill="#F59E0B" stroke="#7C2D12"/><circle cx="${x.toFixed(1)}" cy="84" r="5" fill="#F59E0B" stroke="#7C2D12"/>`; }
      out += `<path d="M-40 -92C-60 -150 60 -150 40 -92" fill="none" stroke="#475569" stroke-width="2"/>
        <text x="0" y="110" text-anchor="middle" class="fd-tag">${esc(t({ en: 'coil', hi: 'कुंडली' }))} · ${S.turns} ${esc(t(T.turnsLow))}</text>
        <g transform="translate(66 -40)"><rect x="0" y="-34" width="34" height="68" rx="6" fill="#FFF7ED" stroke="#8B3DFF" stroke-width="2"/>${[0, 1, 2, 3].map((k) => `<line x1="6" y1="${-26 + k * 16}" x2="28" y2="${-20 + k * 16}" stroke="#8B3DFF" stroke-width="2.5"/>`).join('')}<text x="17" y="54" text-anchor="middle" class="fd-small" style="fill:#8B3DFF">${esc(t({ en: 'coil 2', hi: 'कुंडली 2' }))}</text></g>
      </g>`;
      // galvanometer, top right
      const gx = 690, gy = 92;
      out += `<g transform="translate(${gx} ${gy})"><circle r="56" fill="#FFFFFF" stroke="#334155" stroke-width="3"/><path d="M-44 10A46 46 0 0 1 44 10" fill="none" stroke="#CBD5E1" stroke-width="4"/>
        ${[-60, -30, 0, 30, 60].map((d) => { const r = ((d - 90) * Math.PI) / 180; return `<line x1="${(42 * Math.cos(r)).toFixed(1)}" y1="${(42 * Math.sin(r)).toFixed(1)}" x2="${(48 * Math.cos(r)).toFixed(1)}" y2="${(48 * Math.sin(r)).toFixed(1)}" stroke="#334155" stroke-width="2"/>`; }).join('')}
        <text x="-36" y="-18" class="fd-gauge">−</text><text x="30" y="-18" class="fd-gauge">+</text><text x="0" y="-26" text-anchor="middle" class="fd-gauge">0</text>
        <line x1="0" y1="6" x2="0" y2="-46" stroke="#E11D48" stroke-width="3.5" stroke-linecap="round" transform="rotate(${S.gal.toFixed(1)})"/><circle r="5" fill="#0B1D5C"/>
        <text x="0" y="34" text-anchor="middle" class="fd-small">G</text><text x="0" y="78" text-anchor="middle" class="fd-tag">${esc(t({ en: 'galvanometer', hi: 'गैल्वेनोमीटर' }))}</text></g>`;
      out += `<path d="M${cx + 40} ${cy - 150}C${cx + 40} ${gy + 20} ${gx - 90} ${gy + 20} ${gx - 56} ${gy}" fill="none" stroke="#475569" stroke-width="2" opacity=".7"/>`;
      out += magnetSVG(S.mag, t(T.magnet), 'magnet', t({ en: 'drag me in and out', hi: 'मुझे अंदर-बाहर खींचो' }));
      return out + circuitSVG(90, H - 44, S.on, S.sign, t);
    }
    function chargesSVG() {
      let out = '';
      const forces = coulomb();
      S.charges.forEach((c, i) => {
        const [sx, sy] = toS(c);
        const pos = c.q > 0;
        const f = forces[i];
        if (f.m > 0.005) { const sc = clamp(34 + 70 * Math.sqrt(f.m), 34, 120); const a = Math.atan2(f.y, f.x), ca = Math.cos(a), sa = Math.sin(a); out += `<g class="fd-force">${arrowSVG(sx + 28 * ca, sy - 28 * sa, sx + (28 + sc) * ca, sy - (28 + sc) * sa, '#FFFFFF', 9)}${arrowSVG(sx + 28 * ca, sy - 28 * sa, sx + (28 + sc) * ca, sy - (28 + sc) * sa, '#0F766E', 5)}</g><text x="${(sx + (40 + sc) * ca).toFixed(1)}" y="${(sy - (40 + sc) * sa + 5).toFixed(1)}" text-anchor="middle" class="fd-tag" style="fill:#0F766E;paint-order:stroke;stroke:#fff;stroke-width:4px">F</text>`; }
        out += `<g class="fd-drag" data-key="charge:${i}" data-drag="charge:${i}" role="button" tabindex="0" aria-label="${esc(t(T.charge))} ${esc(String(c.q > 0 ? '+' + c.q : c.q))} µC" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)})">
          <circle r="40" fill="#FFD23F" class="fd-glow"/><circle r="36" fill="transparent"/>
          <circle r="24" fill="${pos ? 'url(#fdN)' : 'url(#fdS)'}" stroke="#0B1D5C" stroke-width="2.5"/><circle r="22" cx="-6" cy="-8" fill="#fff" opacity=".18"/>
          <text y="8" text-anchor="middle" class="fd-lbl" style="font-size:22px">${pos ? '+' : '−'}${Math.abs(c.q)}</text></g>`;
      });
      return out;
    }
    // Coulomb's law: q in µC, distance in cm (4.4 px per cm): F = 9e9 · q1 q2 · 1e-12 / (r/100)² = 90 q1 q2 / r² N.
    function coulomb() {
      return S.charges.map((c, i) => {
        let fx = 0, fy = 0;
        S.charges.forEach((o, j) => { if (i === j) return; const dx = (c.x - o.x) / 4.4, dy = (c.y - o.y) / 4.4; const r2 = Math.max(dx * dx + dy * dy, 4); const r = Math.sqrt(r2); const F = (90 * c.q * o.q) / r2; fx += (F * dx) / r; fy += (F * dy) / r; });
        return { x: fx, y: fy, m: Math.hypot(fx, fy) };
      });
    }

    // ----- words that change with the state -----
    function readout() {
      const I = curI(S);
      const b = (x) => `<b>${esc(x)}</b>`;
      const rule = (x) => `<span class="fd-rule">${esc(t(x))}</span>`;
      const lineWords = t({ en: 'Field lines leave the N pole and enter the S pole. They are closest together near the poles, where the field is strongest.', hi: 'क्षेत्र रेखाएँ N ध्रुव से निकलकर S ध्रुव में जाती हैं। ध्रुवों के पास वे सबसे पास-पास होती हैं, जहाँ क्षेत्र सबसे प्रबल है।' });
      if (mode === 'bar-magnet') return `<p>${lineWords}</p>`;
      if (mode === 'two-magnets') {
        const rel = facing();
        const w = rel.like ? t({ en: 'Like poles face each other', hi: 'समान ध्रुव आमने-सामने हैं' }) : t({ en: 'Unlike poles face each other', hi: 'असमान ध्रुव आमने-सामने हैं' });
        return `<p>${w} (${rel.a}–${rel.b}): ${b(t(rel.like ? T.repel : T.attract))}. ${esc(t({ en: 'Gap', hi: 'दूरी' }))}: ${b(fmt(rel.gap / 4.4, 0) + ' cm')}</p>`;
      }
      if (!I && CURRENT_MODES.includes(mode)) return `<p>${esc(t(T.noCurrent))}</p>`;
      if (mode === 'wire') return `<p>I = ${b(fmt(Math.abs(I)) + ' A')}, ${esc(t(I > 0 ? T.outOfPage : T.intoPage))}. ${esc(t({ en: 'The field goes round the wire', hi: 'क्षेत्र तार के चारों ओर घूमता है' }))} ${b(t(I > 0 ? T.anticlockwise : T.clockwise))}; ${esc(t({ en: 'it gets weaker as you go away (B ∝ I ⁄ r).', hi: 'दूर जाने पर यह कमज़ोर होता जाता है (B ∝ I ⁄ r)।' }))}</p>${rule(T.rhr)}`;
      if (mode === 'loop') return `<p>I = ${b(fmt(Math.abs(I)) + ' A')}. ${esc(t({ en: 'Near each wire the lines are circles; at the centre of the loop they are nearly straight, all pointing', hi: 'हर तार के पास रेखाएँ वृत्त हैं; लूप के केंद्र में वे लगभग सीधी हैं, सब एक ही ओर' }))} ${b(t(I > 0 ? T.right : T.left))}. ${esc(t({ en: 'The loop face on the', hi: 'लूप का' }))} ${b(t(I > 0 ? T.right : T.left))} ${esc(t({ en: 'acts as a N pole.', hi: 'वाला फलक N ध्रुव की तरह काम करता है।' }))}</p>${rule(T.rhr)}`;
      if (mode === 'solenoid') return `<p>${b(S.turns + ' ' + t(T.turnsLow))}, I = ${b(fmt(Math.abs(I)) + ' A')}. ${esc(t({ en: 'Inside, the field is strong and nearly uniform (parallel, evenly spaced lines). Outside it looks like a bar magnet: N pole on the', hi: 'अंदर क्षेत्र प्रबल और लगभग एकसमान है (समांतर, बराबर दूरी की रेखाएँ)। बाहर यह छड़ चुंबक जैसा दिखता है: N ध्रुव' }))} ${b(t(I > 0 ? T.right : T.left))}. ${esc(t({ en: 'More turns or more current: stronger field.', hi: 'ज़्यादा फेरे या ज़्यादा धारा: ज़्यादा प्रबल क्षेत्र।' }))}</p>${rule(T.rhr)}`;
      if (mode === 'force-on-wire') return `<p>${esc(t({ en: 'Field B: N → S (to the right). Current', hi: 'क्षेत्र B: N → S (दाईं ओर)। धारा' }))} ${b(fmt(Math.abs(I)) + ' A')} ${esc(t(I > 0 ? T.outOfPage : T.intoPage))}. ${esc(t({ en: 'The wire is pushed', hi: 'तार को धक्का लगता है' }))} ${b(t(I > 0 ? T.up : T.down))}. ${esc(t({ en: 'More current: bigger push.', hi: 'ज़्यादा धारा: ज़्यादा धक्का।' }))}</p>${rule(T.flhr)}`;
      if (mode === 'motor') return `<p>${esc(t({ en: 'The two arms carry current in opposite directions, so they are pushed in opposite directions: a turning pair. The split-ring commutator swaps the current every half turn, so the coil keeps turning', hi: 'दोनों भुजाओं में धारा विपरीत दिशा में है, इसलिए उन पर विपरीत दिशा में बल लगता है: कुंडली घूमती है। विभक्त-वलय दिक्परिवर्तक हर आधे चक्कर पर धारा बदल देता है, इसलिए कुंडली घूमती रहती है' }))} ${b(t(I > 0 ? T.anticlockwise : T.clockwise))}.</p>${rule(T.flhr)}`;
      if (mode === 'induction') {
        const g = Math.round(S.gal);
        const w = Math.abs(g) < 3 ? t({ en: 'Galvanometer: 0. Nothing is changing, so no current.', hi: 'गैल्वेनोमीटर: 0। कुछ नहीं बदल रहा, इसलिए धारा नहीं।' }) : t({ en: 'Galvanometer kicks ', hi: 'गैल्वेनोमीटर की सुई घूमी ' }) + (g > 0 ? t(T.right) : t(T.left)) + ': ' + t({ en: 'current is induced because the field through the coil is changing.', hi: 'धारा प्रेरित हुई क्योंकि कुंडली से गुज़रता क्षेत्र बदल रहा है।' });
        return `<p>${esc(w)} ${esc(t({ en: 'Faster motion, more turns or a stronger magnet: bigger kick. Switching coil 2 on or off also gives a kick.', hi: 'तेज़ गति, ज़्यादा फेरे या प्रबल चुंबक: बड़ा झटका। कुंडली 2 को चालू या बंद करने पर भी झटका आता है।' }))}</p>${rule(T.faraday)}`;
      }
      if (mode === 'charges') {
        let s = '';
        if (S.charges.length >= 2) { const a = S.charges[0], c = S.charges[1]; const r = Math.hypot(a.x - c.x, a.y - c.y) / 4.4; const F = (90 * a.q * c.q) / Math.max(r * r, 4); s = `q₁ = ${b((a.q > 0 ? '+' : '') + a.q + ' µC')}, q₂ = ${b((c.q > 0 ? '+' : '') + c.q + ' µC')}, r = ${b(fmt(r, 0) + ' cm')} → F = ${b(fmt(Math.abs(F), 2) + ' N')} (${esc(t(F > 0 ? T.repel : T.attract))}). `; }
        return `<p>${s}${esc(t({ en: 'Lines start on + and end on −. Halve the distance: four times the force.', hi: 'रेखाएँ + से शुरू होकर − पर खत्म होती हैं। दूरी आधी करो: बल चार गुना।' }))}</p>${rule(T.coulomb)}`;
      }
      if (mode === 'earth') return `<p>${esc(t({ en: 'The Earth behaves like a huge bar magnet, tilted about 11° from its spin axis. Its magnetic S pole lies near the geographic north: that is why the red N end of a compass points north.', hi: 'पृथ्वी एक विशाल छड़ चुंबक की तरह है, जो अपनी घूर्णन अक्ष से लगभग 11° झुकी है। उसका चुंबकीय S ध्रुव भौगोलिक उत्तर के पास है: इसीलिए कंपास का लाल N सिरा उत्तर की ओर इशारा करता है।' }))}</p>`;
      return '';
    }
    function facing() { // two-magnets: which poles face each other and how far apart they are
      const A = S.magA, B = S.mag;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const aN = Math.cos(A.ang) * ux + Math.sin(A.ang) * uy > 0; // A's N end is nearer B
      const bN = Math.cos(B.ang) * ux + Math.sin(B.ang) * uy < 0; // B's N end is nearer A
      const gap = Math.max(0, d - A.len / 2 - B.len / 2);
      return { a: aN ? 'N' : 'S', b: bN ? 'N' : 'S', like: aN === bN, gap };
    }

    // ----- render -----
    function render() {
      const [tx, ty] = [20, 34];
      const bigCompass = hasCompass ? (() => { S.needle = needleAt(S.compass); const [sx, sy] = toS(S.compass); return compassSVG(sx, sy, S.needle, 30, 'compass', t(T.compass)); })() : '';
      svg.innerHTML = `${DEFS}<rect width="${W}" height="${H}" fill="url(#fdBg)"/><rect width="${W}" height="${H}" fill="url(#fdGrid)" opacity=".55"/>
        ${sceneUnder()}<g aria-hidden="true">${fieldLayer()}</g>${sceneOver()}${bigCompass}
        <text x="${tx}" y="${ty}" class="fd-title">${esc(t(T.modes[mode]))}</text>`;
      readEl.innerHTML = readout();
      const sw = root.querySelector('[data-key="switch"]');
      if (sw) { sw.setAttribute('aria-pressed', String(S.on)); sw.querySelector('.fd-sw').textContent = t(S.on ? T.off : T.on); }
      root.querySelectorAll('.fd-views button').forEach((bt) => bt.setAttribute('aria-pressed', String(bt.dataset.key === 'view:' + S.view)));
      const io = root.querySelector('#fd-iout'); if (io) io.textContent = fmt(S.I) + ' A';
      const no = root.querySelector('#fd-nout'); if (no) no.textContent = String(S.turns);
      dirty = false;
    }
    const ask = () => { if (dirty) return; dirty = true; requestAnimationFrame(() => { if (dirty) render(); }); };

    // ----- actions -----
    function checkDeflect(before) { const after = needleAt(S.compass); let d = Math.abs(after - before) % 360; if (d > 180) d = 360 - d; if (d > 12) api.emit('deflected'); }
    function sprinkle() {
      makeFilings();
      S.view = 'filings';
      render();
      api.record(t(isE ? { en: 'Sprinkled seeds', hi: 'बीज छिड़के' } : { en: 'Sprinkled iron filings', hi: 'लोहे का बुरादा छिड़का' }));
      tween(1100, (tt) => {
        const g = svg.querySelector('#fd-filings');
        if (!g) return;
        g.querySelectorAll('line').forEach((el) => { const i = +el.dataset.i; const q = S.filings[i]; const k = clamp((tt - (0.3 * (q.y + 205)) / 410) / 0.7, 0, 1); q.k = ease(k); });
        render();
      }, () => { S.filings.forEach((q) => (q.k = 1)); render(); api.emit('lines'); });
    }
    function setSwitch(on) {
      const before = hasCompass ? needleAt(S.compass) : 0;
      S.on = on;
      api.emit(on ? 'on' : 'off');
      api.record(t(on ? { en: 'Switched on', hi: 'स्विच चालू किया' } : { en: 'Switched off', hi: 'स्विच बंद किया' }));
      if (hasCompass) checkDeflect(before);
      if (mode === 'force-on-wire') jumpWire();
      if (mode === 'motor') motorLoop();
      render();
    }
    function reverse() {
      const before = hasCompass ? needleAt(S.compass) : 0;
      if (CURRENT_MODES.includes(mode)) S.sign *= -1; else S.mag.ang += Math.PI;
      api.emit('reversed');
      api.record(t(CURRENT_MODES.includes(mode) ? { en: 'Reversed the current', hi: 'धारा उलटी' } : { en: 'Flipped the magnet', hi: 'चुंबक पलटा' }));
      if (hasCompass) checkDeflect(before);
      if (mode === 'force-on-wire') jumpWire();
      render();
    }
    function jumpWire() {
      const to = curI(S) * 14;
      const from = S.wireY;
      tween(500, (tt) => { S.wireY = lerp(from, to, ease(tt)); render(); }, () => { if (to) api.emit('deflected'); });
    }
    function motorLoop() {
      if (stopAnim) { stopAnim(); stopAnim = null; }
      if (!S.on || !curI(S)) return;
      let on = true, last = performance.now(), acc = 0;
      const step = (now) => {
        if (!on) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const w = curI(S) * 1.5;
        if (reduced()) { acc += dt; if (acc > 0.7) { acc = 0; S.motorA += Math.sign(w) * Math.PI / 3; render(); } }
        else { S.motorA += w * dt; render(); }
        const turns = Math.floor(Math.abs(S.motorA) / (2 * Math.PI));
        if (turns > S.turnsDone) { S.turnsDone = turns; api.emit('rotated'); }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      stopAnim = () => { on = false; if (raf) cancelAnimationFrame(raf); };
    }
    function inductionLoop() {
      let on = true;
      const fluxNow = () => {
        const f = (p) => poleField(polesOf(S.mag, MAG_M), p);
        let bx = 0;
        [-60, -30, 0, 30, 60].forEach((y) => { bx += f({ x: S.coilX, y })[0]; });
        return S.turns * (bx / 5 + S.ip * 3.2);
      };
      const step = (now) => {
        if (!on) return;
        const dt = S.lastT == null ? 0.016 : Math.min(0.05, (now - S.lastT) / 1000); S.lastT = now;
        const ipT = S.on ? S.I * S.sign : 0;
        S.ip += (ipT - S.ip) * Math.min(1, dt / 0.09);
        const phi = fluxNow();
        const emf = S.fluxPrev == null ? 0 : -(phi - S.fluxPrev) / dt;
        S.fluxPrev = phi;
        const target = clamp(emf * 0.09, -62, 62);
        const prev = S.gal;
        S.gal += (target - S.gal) * (reduced() ? 1 : Math.min(1, dt / 0.08));
        if (Math.abs(S.gal) < 0.2) S.gal = 0;
        S.induceCool = Math.max(0, S.induceCool - dt);
        if (Math.abs(S.gal) > 14 && !S.induceCool) { S.induceCool = 1.2; api.emit('induced'); api.record(t({ en: 'Galvanometer kicked: current induced', hi: 'गैल्वेनोमीटर की सुई घूमी: धारा प्रेरित हुई' })); }
        if (Math.abs(S.gal - prev) > 0.05 || S.drag) ask();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      stopAnim = () => { on = false; if (raf) cancelAnimationFrame(raf); };
    }
    function afterMove(id) {
      api.emit('moved');
      if (mode === 'two-magnets') {
        const rel = facing();
        if (rel.gap < 46) {
          const A = S.magA, B = S.mag;
          const ux = (B.x - A.x) / (Math.hypot(B.x - A.x, B.y - A.y) || 1), uy = (B.y - A.y) / (Math.hypot(B.x - A.x, B.y - A.y) || 1);
          const from = { x: B.x, y: B.y };
          const to = rel.like ? { x: B.x + ux * 90, y: B.y + uy * 90 } : { x: A.x + ux * (A.len / 2 + B.len / 2 + 2), y: A.y + uy * (A.len / 2 + B.len / 2 + 2) };
          to.x = clamp(to.x, -300, 300); to.y = clamp(to.y, -160, 160);
          tween(rel.like ? 420 : 300, (tt) => { B.x = lerp(from.x, to.x, ease(tt)); B.y = lerp(from.y, to.y, ease(tt)); render(); }, () => { api.emit(rel.like ? 'repel' : 'attract'); api.record(t(rel.like ? { en: 'Like poles pushed apart', hi: 'समान ध्रुव दूर हटे' } : { en: 'Unlike poles pulled together', hi: 'असमान ध्रुव आपस में जुड़े' })); });
        }
      }
      if (mode === 'charges' && id.startsWith('charge:')) {
        const i = +id.slice(7), c = S.charges[i];
        let best = null;
        S.charges.forEach((o, j) => { if (j === i) return; const d = Math.hypot(o.x - c.x, o.y - c.y); if (!best || d < best.d) best = { o, d }; });
        if (best && best.d < 130) { const like = Math.sign(best.o.q) === Math.sign(c.q); api.emit(like ? 'repel' : 'attract'); api.record(t(like ? { en: 'Like charges repel', hi: 'समान आवेश प्रतिकर्षित' } : { en: 'Unlike charges attract', hi: 'असमान आवेश आकर्षित' })); }
      }
    }

    // ----- pointer: dragging magnets, compasses, coils and charges -----
    const scenePt = (e) => { const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const inv = m.inverse(); const x = inv.a * e.clientX + inv.c * e.clientY + inv.e, y = inv.b * e.clientX + inv.d * e.clientY + inv.f; return fromS(x, y); };
    const objOf = (id) => (id === 'magnet' ? S.mag : id === 'compass' ? S.compass : id === 'coil' ? { get x() { return S.coilX; }, set x(v) { S.coilX = v; }, y: 0 } : id.startsWith('charge:') ? S.charges[+id.slice(7)] : null);
    const limits = (id) => (id === 'coil' ? { x: [-60, 300], y: [0, 0] } : id.startsWith('charge:') ? { x: [-200, 200], y: [-200, 200] } : mode === 'induction' && id === 'magnet' ? { x: [-320, 300], y: [0, 0] } : mode === 'earth' ? null : { x: [-370, 370], y: [-190, 190] });
    const clampTo = (id, p) => { const l = limits(id); if (!l) { const d = Math.hypot(p.x, p.y); if (d < EARTH_R + 40) { const k = (EARTH_R + 40) / (d || 1); p.x *= k; p.y *= k; } p.x = clamp(p.x, -370, 370); p.y = clamp(p.y, -190, 190); return p; } return { x: clamp(p.x, l.x[0], l.x[1]), y: clamp(p.y, l.y[0], l.y[1]) }; };
    svg.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.fd-drag');
      if (!el || S.drag) return;
      const id = el.dataset.drag;
      if (!api.allowed(id)) { api.nudge(id); return; }
      const obj = objOf(id);
      if (!obj) return;
      const p = scenePt(e);
      S.drag = { id, dx: obj.x - p.x, dy: obj.y - p.y, sx: e.clientX, sy: e.clientY, moved: false, before: hasCompass ? needleAt(S.compass) : 0 };
      el.classList.add('fd-held');
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!S.drag) return;
      const d = S.drag;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true;
      const p = scenePt(e), obj = objOf(d.id);
      const q = clampTo(d.id, { x: p.x + d.dx, y: p.y + d.dy });
      obj.x = q.x; obj.y = q.y;
      ask();
    });
    const endDrag = (e) => {
      if (!S.drag) return;
      const d = S.drag; S.drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
      if (!d.moved) { if (d.id === 'magnet' && mode === 'bar-magnet') rotateMagnet(); render(); return; }
      render();
      api.record(t({ en: 'Moved the ', hi: 'हिलाया: ' }) + t(d.id === 'magnet' ? { en: 'magnet', hi: 'चुंबक' } : d.id === 'compass' ? { en: 'compass', hi: 'कंपास' } : d.id === 'coil' ? { en: 'coil', hi: 'कुंडली' } : T.charge));
      afterMove(d.id);
      if (hasCompass) checkDeflect(d.before);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    function rotateMagnet() { const before = hasCompass ? needleAt(S.compass) : 0; S.mag.ang += Math.PI / 2; render(); api.emit('rotated'); api.record(t({ en: 'Turned the magnet', hi: 'चुंबक घुमाया' })); if (hasCompass) checkDeflect(before); }
    // keyboard: Enter/Space turns the bar magnet; arrow keys move any draggable thing
    svg.addEventListener('keydown', (e) => {
      const el = e.target.closest('.fd-drag');
      if (!el) return;
      const id = el.dataset.drag;
      const arrows = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] };
      if (arrows[e.key]) {
        e.preventDefault();
        if (!api.allowed(id)) { api.nudge(id); return; }
        const obj = objOf(id), before = hasCompass ? needleAt(S.compass) : 0;
        const q = clampTo(id, { x: obj.x + arrows[e.key][0], y: obj.y + arrows[e.key][1] });
        obj.x = q.x; obj.y = q.y; render();
        svg.querySelector(`[data-drag="${id}"]`)?.focus();
        afterMove(id); if (hasCompass) checkDeflect(before);
      } else if ((e.key === 'Enter' || e.key === ' ') && id === 'magnet' && mode === 'bar-magnet') { e.preventDefault(); if (!api.allowed(id)) { api.nudge(id); return; } rotateMagnet(); svg.querySelector('[data-drag="magnet"]')?.focus(); }
    });

    // ----- buttons and sliders -----
    const onClick = (e) => {
      const el = e.target.closest('button[data-key]');
      if (!el) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'switch') setSwitch(!S.on);
      else if (key === 'reverse') reverse();
      else if (key === 'sprinkle') sprinkle();
      else if (key.startsWith('view:')) { S.view = key.slice(5); render(); if (S.view === 'lines') api.emit('lines'); api.record(t({ en: 'View: ', hi: 'दृश्य: ' }) + t(T.views[S.view])); }
    };
    root.addEventListener('click', onClick);
    const onInput = (e) => {
      const el = e.target.closest('input[data-key]');
      if (!el) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); el.value = key === 'slider:current' ? S.I : S.turns; return; }
      const before = hasCompass ? needleAt(S.compass) : 0;
      if (key === 'slider:current') S.I = +el.value; else S.turns = +el.value;
      if (mode === 'force-on-wire' && S.on) jumpWire();
      if (mode === 'motor') motorLoop();
      render();
      if (hasCompass && S.on) checkDeflect(before);
    };
    root.addEventListener('input', onInput);
    const onChange = (e) => {
      const el = e.target.closest('input[data-key]');
      if (!el) return;
      api.record(t(el.dataset.key === 'slider:current' ? { en: 'Current set to ', hi: 'धारा रखी ' } : { en: 'Turns set to ', hi: 'फेरे रखे ' }) + el.value);
    };
    root.addEventListener('change', onChange);

    render();
    if (mode === 'motor') motorLoop();
    if (mode === 'induction') inductionLoop();
    if (mode === 'force-on-wire' && S.on) { S.wireY = curI(S) * 14; render(); }
    return { destroy() { if (stopAnim) stopAnim(); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); } };
  }

  // ---------- registration ----------
  const MODES = ['bar-magnet', 'two-magnets', 'wire', 'loop', 'solenoid', 'force-on-wire', 'motor', 'induction', 'charges', 'earth'];
  const VIEWS = ['filings', 'compass', 'lines', 'vectors'];
  NCA_T.register({
    id: 'field',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['source', 'show', 'charges', 'current', 'turns', 'on'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.source)) e.push('source: one of ' + MODES.join(', '));
      if (c.source === 'charges' && c.show === 'compass') e.push("show: 'compass' needs a magnetic field; a compass does not respond to still charges");
      if (c.show != null && !VIEWS.includes(c.show)) e.push('show: one of ' + VIEWS.join(', '));
      if (c.charges != null) {
        if (c.source !== 'charges') e.push("charges: only with source 'charges'");
        if (!Array.isArray(c.charges) || c.charges.length < 1 || c.charges.length > 6) e.push('charges: 1 to 6 charges');
        else c.charges.forEach((q, i) => {
          if (!q || typeof q !== 'object') { e.push(`charges[${i}]: an object { q, x, y }`); return; }
          if (!Number.isInteger(q.q) || q.q === 0 || q.q < -3 || q.q > 3) e.push(`charges[${i}].q: a whole number from -3 to 3, not 0`);
          if (typeof q.x !== 'number' || q.x < 0 || q.x > 100 || typeof q.y !== 'number' || q.y < 0 || q.y > 100) e.push(`charges[${i}]: x and y from 0 to 100`);
          Object.keys(q).forEach((k) => { if (!['q', 'x', 'y'].includes(k)) e.push(`charges[${i}]: unknown key ${k}`); });
        });
        if (Array.isArray(c.charges)) c.charges.forEach((a, i) => c.charges.forEach((b, j) => { if (j > i && a && b && Math.hypot(a.x - b.x, a.y - b.y) < 12) e.push(`charges[${i}] and charges[${j}]: at least 12 cm apart`); }));
      }
      if (c.current != null && (typeof c.current !== 'number' || c.current < 0 || c.current > 5)) e.push('current: 0 to 5');
      if (c.current != null && !CURRENT_MODES.includes(c.source) && c.source !== 'induction') e.push('current: only with a mode that has a circuit');
      if (c.turns != null && (!Number.isInteger(c.turns) || c.turns < 2 || c.turns > 12)) e.push('turns: a whole number from 2 to 12');
      if (c.turns != null && c.source !== 'solenoid' && c.source !== 'induction') e.push("turns: only with source 'solenoid' or 'induction'");
      if (c.on != null && typeof c.on !== 'boolean') e.push('on: true or false');
      if (c.on != null && !CURRENT_MODES.includes(c.source) && c.source !== 'induction') e.push('on: only with a mode that has a switch');
      return e;
    },
    keys(c) {
      const m = (c && c.source) || '';
      const targets = ['sprinkle', 'view:*'], events = ['lines'];
      if (!['force-on-wire', 'motor'].includes(m)) events.push('moved');
      const hasSwitch = CURRENT_MODES.includes(m) || m === 'induction';
      if (hasSwitch) { targets.push('switch'); events.push('on', 'off'); }
      if (hasSwitch || m === 'two-magnets') { targets.push('reverse'); events.push('reversed'); }
      if (CURRENT_MODES.includes(m)) targets.push('slider:current');
      if (m === 'solenoid' || m === 'induction') targets.push('slider:turns');
      if (['bar-magnet', 'two-magnets', 'wire', 'loop', 'solenoid', 'earth'].includes(m)) { targets.push('compass'); events.push('deflected'); }
      if (m === 'bar-magnet') { targets.push('magnet'); events.push('rotated'); }
      if (m === 'two-magnets') { targets.push('magnet'); events.push('attract', 'repel'); }
      if (m === 'induction') { targets.push('magnet', 'coil'); events.push('induced'); }
      if (m === 'force-on-wire') events.push('deflected');
      if (m === 'motor') events.push('rotated');
      if (m === 'charges') { ((c && c.charges) || [0, 0]).forEach((_, i) => targets.push('charge:' + i)); events.push('attract', 'repel'); }
      return { targets, events };
    },
    demo: { source: 'solenoid', show: 'lines', current: 3, turns: 7, on: true },
    modes: MODES,
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
