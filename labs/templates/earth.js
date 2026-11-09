// Template: Earth lab. Thirteen views of how the Earth works, each a small working model, not a picture:
//   layers            cut-away Earth drawn to scale (crust thickened so it can be seen); a depth probe reads the layer,
//                     temperature and pressure from a depth profile (crust 0–35 km, mantle to 2,900, outer core to
//                     5,150, inner core to 6,371 km).
//   rock-cycle        a rock sample changed by real processes (cool, weather, compact, heat and squeeze, melt);
//                     each parent rock gives its true product (limestone → marble, shale → slate → schist …).
//   soil              a soil profile (humus, A, B, C, bedrock) and a percolation test (rate = water ÷ time) for sandy,
//                     loamy and clayey soil; with region 'india' the six major soils of India.
//   volcano           silica sets runniness, lava temperature, cone shape and eruption style; gas pressure decides
//                     whether it erupts.
//   earthquake        focus, epicentre, P (6 km/s), S (3.5 km/s) and surface waves (3 km/s) to a seismograph; the S − P
//                     gap gives the distance; magnitude ×10 shaking and ×32 energy per step; P and S shadow zones.
//   plates            divergent, ocean–continent, continent–continent and transform boundaries; distance moved =
//                     rate × time (1 cm a year for 1 million years = 10 km).
//   water-cycle       evaporation (rate from the saturation vapour pressure of water), transpiration, condensation,
//                     precipitation, infiltration and run-off; follow one drop round the cycle.
//   weather           a weather station; dew point (Magnus formula) and cloud base (125 m per °C of T − dew point).
//   winds             pressure belts and planetary winds with and without the Coriolis effect, belts shifting with
//                     the seasons; sea and land breezes from the land–sea temperature difference.
//   monsoon           India month by month: the south-west monsoon's two branches, onset and withdrawal, the retreating
//                     monsoon, north-east winds, western disturbances, loo, kal baisakhi and mango showers.
//   erosion           rivers (meander → ox-bow lake), sea waves (cave → arch → stack), wind (mushroom rock, dunes),
//                     glaciers (V → U valley, moraine) and rain on a slope with and without plants.
//   groundwater       water table from recharge (rain × infiltration share) minus pumping, ÷ specific yield; wells dry
//                     up; rainwater harvesting and paving change recharge.
//   atmosphere-layers troposphere to exosphere with the standard-atmosphere temperature and pressure at any height.
// Config: { mode: one of the above, region?: 'india' | 'world' } (default region: 'india' for monsoon, else 'world').
(function () {
  const L = window.NCA_LIB;
  const { esc, lerp, ease, clamp, mixHex } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['layers', 'rock-cycle', 'soil', 'volcano', 'earthquake', 'plates', 'water-cycle', 'weather', 'winds', 'monsoon', 'erosion', 'groundwater', 'atmosphere-layers'];
  const REGIONS = ['india', 'world'];
  const defRegion = (m) => (m === 'monsoon' ? 'india' : 'world');
  let INST = 0;
  const r1 = (n) => Math.round(n * 10) / 10;
  const num = (v, d = 0) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
  const DEG = Math.PI / 180;
  // Piecewise-linear lookup in [[x, y], …] (x ascending).
  function pw(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return tab[tab.length - 1][1];
  }
  // Saturation vapour pressure of water (hPa), Magnus formula (WMO coefficients).
  const esat = (T) => 6.112 * Math.exp((17.62 * T) / (243.12 + T));
  function dewPoint(T, RH) { const g = Math.log(Math.max(1, RH) / 100) + (17.62 * T) / (243.12 + T); return (243.12 * g) / (17.62 - g); }
  // A small seeded random generator, so drawings look hand-made but stay the same on every redraw.
  function rnd(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // ---------------------------------------------------------------- SVG helpers
  const lbl = (x, y, s, a = 'middle', cls = '', size) => `<text x="${r1(x)}" y="${r1(y)}" text-anchor="${a}" class="ea-lbl ${cls}"${size ? ` style="font-size:${size}px"` : ''}>${esc(s)}</text>`;
  function arr(x1, y1, x2, y2, col, w = 4, head = 12, extra = '') {
    const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
    const bx = x2 - c * head, by = y2 - s * head;
    return `<g ${extra}><line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(bx)}" y2="${r1(by)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><path d="M${r1(x2)} ${r1(y2)}L${r1(bx - s * head * 0.6)} ${r1(by + c * head * 0.6)}L${r1(bx + s * head * 0.6)} ${r1(by - c * head * 0.6)}Z" fill="${col}"/></g>`;
  }
  const hot = (key, label, inner, extra = '') => `<g class="ea-hot" data-key="${key}" role="button" tabindex="0" aria-label="${esc(label)}" ${extra}>${inner}</g>`;
  // A label pill that is a button: coloured dot, text, rounded box.
  function pill(key, x, y, w, text, col, on, label, h = 40) {
    return hot(key, label || text, `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="ea-pill ${on ? 'on' : ''}"/><circle cx="${x + 20}" cy="${y + h / 2}" r="9" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${x + 36}" y="${y + h / 2 + 6}" class="ea-ptxt">${esc(text)}</text>`);
  }
  const cloudD = (x, y, s) => `M${x - 40 * s} ${y}a${20 * s} ${20 * s} 0 0 1 ${18 * s} ${-22 * s}a${26 * s} ${26 * s} 0 0 1 ${46 * s} ${-8 * s}a${20 * s} ${20 * s} 0 0 1 ${30 * s} ${16 * s}a${16 * s} ${16 * s} 0 0 1 ${-4 * s} ${14 * s}z`;
  const cloud = (x, y, s, fill = '#FFFFFF', op = 1, extra = '') => `<path d="${cloudD(x, y, s)}" fill="${fill}" opacity="${op}" ${extra}/>`;
  const stars = (w, h, n, seed) => { const q = rnd(seed); return Array.from({ length: n }, () => `<circle cx="${r1(q() * w)}" cy="${r1(q() * h)}" r="${r1(0.6 + q() * 1.3)}" fill="#fff" opacity="${r1(0.35 + q() * 0.6)}"/>`).join(''); };
  // Smooth closed blob through points.
  function blob(pts) {
    const n = pts.length, m = (i) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
    let d = `M${r1(m(n - 1)[0])} ${r1(m(n - 1)[1])}`;
    for (let i = 0; i < n; i++) { const q = m(i); d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(q[0])} ${r1(q[1])}`; }
    return d + 'Z';
  }
  const poly = (pts) => 'M' + pts.map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z';
  const line = (pts) => 'M' + pts.map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L');
  function smooth(pts) {
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) { const q = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(q[0])} ${r1(q[1])}`; }
    const z = pts[pts.length - 1];
    return d + `L${r1(z[0])} ${r1(z[1])}`;
  }

  // ---------------------------------------------------------------- CSS (prefix ea-)
  const CSS = `
.ea { container-type: inline-size; font-family: var(--font-body); color: var(--ink); }
.ea-top { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; margin-bottom: 10px; }
.ea-badge { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #0F766E, #065F46); color: #fff; border-radius: 999px; padding: 5px 16px 5px 8px; font: 800 1.05rem/1.2 var(--font-display); box-shadow: 0 3px 10px rgba(6,95,70,.3); }
.ea-badge svg { width: 28px; height: 28px; flex: none; }
.ea-tag { color: var(--ink-2); font-size: .95rem; margin: 0; flex: 1 1 220px; }
.ea-body { display: grid; gap: 12px; }
@container (min-width: 760px) { .ea-body { grid-template-columns: minmax(0, 1.55fr) minmax(250px, 1fr); align-items: start; } }
.ea-stage { position: relative; border-radius: 18px; overflow: hidden; background: #0B1730; box-shadow: 0 10px 28px rgba(6,18,51,.22), inset 0 0 0 1px rgba(255,255,255,.06); }
.ea-svg { display: block; width: 100%; height: auto; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.ea-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ea-ctrl { display: flex; flex-direction: column; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }
.ea-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ea-row-t { font-size: .8rem; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: var(--ink-2); margin: 2px 0 -4px; }
.ea-btn { min-height: 44px; min-width: 44px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .93rem/1.15 var(--font-body); padding: 6px 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; text-align: left; transition: transform .12s, background .2s, border-color .2s, box-shadow .2s; }
.ea-btn:hover { border-color: #14B8A6; transform: translateY(-1px); }
.ea-btn:active { transform: translateY(1px); }
.ea-btn[aria-pressed="true"] { background: #0F766E; border-color: #0F766E; color: #fff; box-shadow: 0 0 0 3px rgba(20,184,166,.28); }
.ea-btn.ea-go { background: linear-gradient(180deg, #FF9A4D, #FF7A1A); border: 0; color: #1E293B; box-shadow: 0 3px 0 rgba(6,18,51,.18); }
.ea-btn.ea-go2 { background: linear-gradient(180deg, #3ED1C0, #14B8A6); border: 0; color: #1E293B; box-shadow: 0 3px 0 rgba(6,18,51,.18); }
.ea-btn .sw { width: 18px; height: 18px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(6,18,51,.25); }
.ea-btn svg { width: 22px; height: 22px; flex: none; }
.ea-sl { display: flex; flex-direction: column; gap: 0; font-weight: 600; }
.ea-sl-top { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }
.ea-sl-top b { font: 800 1.05rem var(--font-display); color: var(--ink); }
.ea-sl input[type=range] { width: 100%; min-height: 44px; accent-color: #0F766E; cursor: pointer; margin: 0; }
.ea-info { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; min-height: 96px; }
.ea-info h4 { margin: 0 0 4px; font: 800 1.12rem/1.2 var(--font-display); color: var(--ink); display: flex; align-items: center; gap: 8px; }
.ea-info h4 i { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--line); }
.ea-info p { margin: 0 0 6px; line-height: 1.5; }
.ea-info .ea-ex { color: var(--ink-2); font-size: .93rem; }
.ea-info .ea-warn { background: var(--sun-t); border-radius: 10px; padding: 6px 10px; font-size: .92rem; }
.ea-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 6px; margin-top: 8px; }
.ea-fact { background: var(--sunk); border-radius: 10px; padding: 5px 10px; min-width: 0; }
.ea-fact span { display: block; font-size: .76rem; color: var(--ink-2); line-height: 1.3; }
.ea-fact b { font: 700 .98rem/1.3 var(--font-display); color: var(--ink); overflow-wrap: anywhere; }
.ea-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ea-chips > span:first-child { font-size: .85rem; font-weight: 700; color: var(--ink-2); margin-right: 2px; }
.ea-chip { border-radius: 999px; padding: 2px 11px; font-size: .84rem; font-weight: 700; border: 1.5px dashed var(--line); color: var(--ink-2); transition: all .3s; }
.ea-chip.on { background: #0F766E; border: 1.5px solid #0F766E; color: #fff; }
.ea-hot { cursor: pointer; outline: none; }
.ea-hot:hover > *:first-child { filter: brightness(1.12); }
.ea-hot:focus-visible { filter: drop-shadow(0 0 3px #FFD23F) drop-shadow(0 0 6px #FFD23F); }
.ea-lbl { font: 700 19px var(--font-body); fill: #fff; paint-order: stroke; stroke: rgba(6,18,51,.72); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
.ea-lbl.dk { fill: #10223F; stroke: rgba(255,255,255,.85); }
.ea-lbl.sm { font-size: 16px; stroke-width: 3.5px; }
.ea-lbl.big { font: 800 24px var(--font-display); }
.ea-pill { fill: rgba(6,18,51,.72); stroke: rgba(255,255,255,.35); stroke-width: 1.5; transition: fill .2s; }
.ea-pill.on { fill: #0F766E; stroke: #5EE0C9; }
.ea-ptxt { font: 700 17px var(--font-body); fill: #fff; pointer-events: none; }
.ea-flow { stroke-dasharray: 10 14; animation: ea-dash 1.1s linear infinite; }
.ea-flow.slow { animation-duration: 2.4s; }
@keyframes ea-dash { to { stroke-dashoffset: -24; } }
.ea-pulse { animation: ea-pulse 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes ea-pulse { 50% { opacity: .55; transform: scale(1.06); } }
.ea-gust { animation: ea-gust 2.4s ease-in-out infinite; }
@keyframes ea-gust { 50% { opacity: .55; } }
.ea-bob { animation: ea-bob 3s ease-in-out infinite; }
@keyframes ea-bob { 50% { transform: translateY(-5px); } }
.ea-spin { animation: ea-spin 1s linear infinite; transform-box: fill-box; transform-origin: center; }
@keyframes ea-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ea-flow, .ea-pulse, .ea-bob, .ea-spin, .ea-gust { animation: none; } .ea-btn, .ea-chip, .ea-pill { transition: none; } }
`;

  const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#2F8FEA"/><path d="M8 9c3-2 6 0 7 2s-1 4 1 6-1 5-4 5-4-3-4-5-3-6 0-8zM19 6c3 0 7 3 8 7-2 1-4-1-5 1s1 4-1 5-3-2-3-4 2-3 0-5 0-4 1-4z" fill="#22C55E"/><path d="M16 16L30 16A14 14 0 0 1 16 30Z" fill="#FF7A1A"/><path d="M16 16L24 16A8 8 0 0 1 16 24Z" fill="#FFD23F"/></svg>';
  const MODE_NAME = {
    layers: T2('Inside the Earth', 'पृथ्वी के अंदर'), 'rock-cycle': T2('The rock cycle', 'शैल चक्र'), soil: T2('Soil', 'मृदा'),
    volcano: T2('Volcano', 'ज्वालामुखी'), earthquake: T2('Earthquake', 'भूकंप'), plates: T2('Moving plates', 'खिसकती प्लेटें'),
    'water-cycle': T2('The water cycle', 'जल चक्र'), weather: T2('Weather station', 'मौसम केंद्र'), winds: T2('Winds of the world', 'विश्व की पवनें'),
    monsoon: T2('The Indian monsoon', 'भारतीय मानसून'), erosion: T2('Erosion and landforms', 'अपरदन और स्थलरूप'), groundwater: T2('Groundwater', 'भौम जल'),
    'atmosphere-layers': T2('Layers of the air', 'वायुमंडल की परतें'),
  };
  const MODE_TAG = {
    layers: T2('Tap a layer, or slide the probe down to the centre of the Earth.', 'किसी परत पर टैप करो, या जाँच-यंत्र को पृथ्वी के केंद्र तक नीचे सरकाओ।'),
    'rock-cycle': T2('Pick a rock, then change it with heat, pressure, weather and time.', 'एक चट्टान चुनो, फिर उसे ऊष्मा, दबाव, अपक्षय और समय से बदलो।'),
    soil: T2('Tap the layers of soil, then pour water through different soils.', 'मृदा की परतों पर टैप करो, फिर अलग-अलग मृदा में पानी डालो।'),
    volcano: T2('Set the magma, build up gas, and make it erupt.', 'मैग्मा चुनो, गैस का दबाव बढ़ाओ और ज्वालामुखी फोड़ो।'),
    earthquake: T2('Set the size and depth, start the quake and watch the waves travel.', 'आकार और गहराई चुनो, भूकंप शुरू करो और तरंगों को चलते देखो।'),
    plates: T2('Pick a plate boundary and move time forward.', 'प्लेट की कोई सीमा चुनो और समय आगे बढ़ाओ।'),
    'water-cycle': T2('Warm the sea, run the cycle, or follow one drop.', 'समुद्र को गर्म करो, चक्र चलाओ, या एक बूँद के साथ चलो।'),
    weather: T2('Change the air and lift it to see if a cloud and rain form.', 'हवा को बदलो और ऊपर उठाओ, देखो बादल और वर्षा बनती है या नहीं।'),
    winds: T2('See where air rises and sinks, and how the spinning Earth turns the winds.', 'देखो हवा कहाँ उठती और बैठती है, और घूमती पृथ्वी पवनों को कैसे मोड़ती है।'),
    monsoon: T2('Slide through the year and watch the winds and rain over India.', 'साल भर में सरको और भारत पर पवनें और वर्षा देखो।'),
    erosion: T2('Pick what wears the land away and move time forward.', 'चुनो कि ज़मीन को कौन घिसता है और समय आगे बढ़ाओ।'),
    groundwater: T2('Set the rain and the pumping, then let a year pass.', 'वर्षा और पंपिंग तय करो, फिर एक साल बीतने दो।'),
    'atmosphere-layers': T2('Fly up through the air from the ground to space.', 'ज़मीन से अंतरिक्ष तक हवा में ऊपर उड़ो।'),
  };
  const ASSET = { layers: 'earth-layers', 'rock-cycle': 'earth-rocks', soil: 'earth-soil', volcano: 'earth-volcano', earthquake: 'earth-quake', plates: 'earth-plates', 'water-cycle': 'earth-water-cycle', weather: 'earth-weather', winds: 'earth-winds', monsoon: 'earth-monsoon', erosion: 'earth-erosion', groundwater: 'earth-groundwater', 'atmosphere-layers': 'earth-atmosphere' };

  const IMPL = {};
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup10 = (v) => '10' + String(Math.round(Math.log10(v))).split('').map((d) => SUP[+d]).join('');
  const sig = (v, n = 3) => { if (!v) return 0; const p = Math.pow(10, n - 1 - Math.floor(Math.log10(Math.abs(v)))); return Math.round(v * p) / p; };

  // ================================================================ layers
  const LAYERS = [
    { id: 'crust', from: 0, to: 35, n: T2('Crust', 'भूपर्पटी'), col: ['#B07A44', '#7A4E26'], dot: '#A0703C', dens: '2.7–3.0',
      state: T2('Solid rock', 'ठोस चट्टान'), made: T2('Silica and alumina (sial); silica and magnesium under oceans (sima)', 'सिलिका और ऐलुमिना (सियाल); महासागरों के नीचे सिलिका और मैग्नीशियम (सीमा)'),
      note: T2('The thin, rocky outer skin we live on. It is about 35 km thick under the continents, only about 5 km under the oceans, and up to about 70 km under high mountains like the Himalaya.', 'वह पतली, चट्टानी बाहरी परत जिस पर हम रहते हैं। यह महाद्वीपों के नीचे लगभग 35 किमी मोटी, महासागरों के नीचे केवल लगभग 5 किमी, और हिमालय जैसे ऊँचे पर्वतों के नीचे लगभग 70 किमी तक मोटी है।') },
    { id: 'mantle', from: 35, to: 2900, n: T2('Mantle', 'मैंटल'), col: ['#F2893C', '#A8251A'], dot: '#E0592F', dens: '3.3–5.7',
      state: T2('Solid, but soft and slowly flowing near the top', 'ठोस, पर ऊपर की ओर नरम और धीरे बहने वाला'), made: T2('Hot rocks rich in iron and magnesium', 'लोहे और मैग्नीशियम से भरपूर गर्म चट्टानें'),
      note: T2('The thickest layer: about 84% of the Earth’s volume. Its soft upper part, the asthenosphere (to about 400 km), flows very slowly and is where the magma of volcanoes comes from. The crust and the hard top of the mantle together make the lithosphere.', 'सबसे मोटी परत: पृथ्वी के आयतन का लगभग 84%। इसका नरम ऊपरी भाग, दुर्बलतामंडल (लगभग 400 किमी तक), बहुत धीरे बहता है और ज्वालामुखियों का मैग्मा यहीं से आता है। भूपर्पटी और मैंटल का कठोर ऊपरी भाग मिलकर स्थलमंडल बनाते हैं।') },
    { id: 'outer-core', from: 2900, to: 5150, n: T2('Outer core', 'बाह्य क्रोड'), col: ['#FFC15A', '#FF7A1A'], dot: '#FF9A2E', dens: '9.9–12.2',
      state: T2('Liquid metal', 'द्रव धातु'), made: T2('Molten iron and nickel', 'पिघला हुआ लोहा और निकल'),
      note: T2('Here iron is so hot that it is liquid. As it swirls, it makes the Earth’s magnetic field, which turns a compass needle. Earthquake S-waves cannot travel through this liquid.', 'यहाँ लोहा इतना गर्म है कि द्रव है। इसके घूमने से पृथ्वी का चुंबकीय क्षेत्र बनता है, जो दिक्सूचक की सुई घुमाता है। भूकंप की S-तरंगें इस द्रव से नहीं गुज़र सकतीं।') },
    { id: 'inner-core', from: 5150, to: 6371, n: T2('Inner core', 'आंतरिक क्रोड'), col: ['#FFFBE0', '#FFD23F'], dot: '#FFE27A', dens: '12.8–13.1',
      state: T2('Solid metal', 'ठोस धातु'), made: T2('Iron and nickel (nife)', 'लोहा और निकल (निफ़े)'),
      note: T2('About as hot as the surface of the Sun, yet solid: the pressure here is more than three million times the air pressure we feel, and it squeezes the metal solid.', 'लगभग सूर्य की सतह जितना गर्म, फिर भी ठोस: यहाँ दबाव हमारे आसपास की हवा के दबाव से तीस लाख गुना से भी ज़्यादा है, जो धातु को दबाकर ठोस रखता है।') },
  ];
  const EARTH_T = [[0, 15], [35, 600], [100, 1300], [660, 1900], [2890, 3700], [2900, 4000], [5150, 5400], [6371, 5500]];
  const EARTH_P = [[0, 0], [35, 1], [400, 13], [660, 24], [2900, 136], [5150, 329], [6371, 364]]; // GPa
  const layerAt = (d) => LAYERS.find((l) => d <= l.to) || LAYERS[3];
  IMPL.layers = (c) => {
    const S = { depth: 0, last: null, diving: false };
    const R = 195, CX = 215, CY = 222, A1 = -80 * DEG, A2 = 10 * DEG, CR = 8, AP = -50 * DEG;
    const rad = (d) => (d <= 35 ? R - (d / 35) * CR : ((6371 - d) / 6336) * (R - CR));
    const pt = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    const sector = (r) => { const p = pt(r, A1), q = pt(r, A2); return `M${CX} ${CY}L${r1(p[0])} ${r1(p[1])}A${r1(r)} ${r1(r)} 0 0 1 ${r1(q[0])} ${r1(q[1])}Z`; };
    const PILL = { crust: [30, -66], mantle: [100, -44], 'outer-core': [170, -22], 'inner-core': [240, -4] };
    function enter(d) { const l = layerAt(d); if (l.id !== S.last) { S.last = l.id; c.reveal(l.id); } }
    const tempAt = (d) => (d < 1 ? 15 + 25 * d : pw(EARTH_T, d));
    return {
      view: [600, 440], label: T2('Cut-away Earth', 'कटी हुई पृथ्वी'),
      chips: () => LAYERS.map((l) => ({ id: l.id, n: l.n })),
      controls: () => c.slider('depth', T2('Depth of the probe', 'जाँच-यंत्र की गहराई'), 0, 6371, 1) + `<div class="ea-row">${c.btn('play', T2('Dive to the centre', 'केंद्र तक गोता लगाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v14M6 11l6 6 6-6" stroke="#1E293B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M5 21h14" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/></svg>')}</div>`,
      val: () => S.depth, fmt: () => num(Math.round(S.depth)) + ' ' + c.t(T2('km', 'किमी')),
      slide(name, v) { S.depth = v; enter(v); },
      act(key) {
        if (key === 'play') {
          c.busy = true; S.diving = true; const d0 = S.depth;
          c.rec(T2('Dived to the centre of the Earth', 'पृथ्वी के केंद्र तक गोता लगाया'));
          c.run(7000 * (1 - d0 / 6371) + 600, (k) => { S.depth = lerp(d0, 6371, ease(k)); enter(S.depth); c.refresh(); }, () => { c.busy = false; S.diving = false; c.say(T2('You reached the centre of the Earth!', 'तुम पृथ्वी के केंद्र तक पहुँच गए!')); c.refresh(); });
        } else if (key.startsWith('layer:')) {
          const l = LAYERS.find((x) => x.id === key.slice(6)); const d0 = S.depth, d1 = (l.from + l.to) / 2;
          c.say(l.n); c.busy = true;
          c.run(700, (k) => { S.depth = lerp(d0, d1, ease(k)); c.refresh(); }, () => { c.busy = false; S.last = l.id; c.reveal(l.id); c.refresh(); });
        }
      },
      scene() {
        const id = c.id, cur = layerAt(S.depth);
        const q = rnd(7);
        const land = [[CX - 150, CY - 40, 60], [CX - 90, CY + 110, 55], [CX + 40, CY + 140, 45], [CX - 160, CY + 60, 30]].map(([x, y, s], i) => `<path d="${blob(Array.from({ length: 9 }, (_, k) => { const a = (k / 9) * 2 * Math.PI; const rr = s * (0.6 + 0.5 * q()); return [x + rr * Math.cos(a) * 1.2, y + rr * Math.sin(a)]; }))}" fill="${i % 2 ? '#3FA34D' : '#5DB85B'}"/>`).join('');
        const sectors = LAYERS.map((l) => {
          const r = rad(l.from), on = cur.id === l.id;
          return hot('layer:' + l.id, c.t(l.n), `<path d="${sector(r)}" fill="url(#${id}-g-${l.id})" stroke="${on ? '#FFFFFF' : 'rgba(0,0,0,.25)'}" stroke-width="${on ? 3 : 1}"/>`);
        }).join('');
        const pills = LAYERS.map((l) => {
          const [y, a] = PILL[l.id], r = l.id === 'crust' ? R - 4 : (rad(l.from) + rad(l.to)) / 2, p = pt(r, a * DEG);
          return `<path d="M${r1(p[0])} ${r1(p[1])}L${436} ${y + 20}" stroke="#fff" stroke-width="2" opacity=".8"/><circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="4" fill="#fff"/>` + pill('layer:' + l.id, 436, y, 156, c.t(l.n), l.dot, cur.id === l.id);
        }).join('');
        const pr = rad(S.depth), pp = pt(pr, AP), top = pt(R, AP);
        const temp = tempAt(S.depth);
        const glow = mixHex('#FFE27A', '#FF3B1F', clamp(1 - temp / 6000, 0, 1));
        return `<defs>
          <radialGradient id="${id}-sea" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#5EC2FF"/><stop offset=".6" stop-color="#1D6FD8"/><stop offset="1" stop-color="#0B2E78"/></radialGradient>
          ${LAYERS.map((l) => `<radialGradient id="${id}-g-${l.id}" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="${r1(rad(l.from))}"><stop offset="${l.id === 'crust' ? 0.9 : 0}" stop-color="${l.col[0]}"/><stop offset="1" stop-color="${l.col[1]}"/></radialGradient>`).join('')}
          <clipPath id="${id}-globe"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath>
          <radialGradient id="${id}-shade" cx="30%" cy="25%" r="85%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
        </defs>
        <rect width="600" height="440" fill="#071029"/>${stars(600, 440, 70, 3)}
        <circle cx="${CX}" cy="${CY}" r="${R + 10}" fill="none" stroke="#7FD3FF" stroke-opacity=".25" stroke-width="10"/>
        <g clip-path="url(#${id}-globe)"><circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-sea)"/>${land}
          ${cloud(CX - 60, CY - 120, 0.9, '#fff', 0.7)}${cloud(CX - 130, CY + 160, 0.7, '#fff', 0.6)}
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-shade)"/></g>
        ${sectors}
        <path d="${line([pt(R, A1), [CX, CY], pt(R, A2)])}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
        <line x1="${r1(top[0])}" y1="${r1(top[1])}" x2="${CX}" y2="${CY}" stroke="#fff" stroke-dasharray="4 5" stroke-width="2" opacity=".7"/>
        <g transform="translate(${r1(top[0])} ${r1(top[1])}) rotate(40)"><path d="M-12 -24L12 -24L0 2Z" fill="#FFD23F" stroke="#1E293B" stroke-width="2"/></g>
        <circle cx="${r1(pp[0])}" cy="${r1(pp[1])}" r="16" fill="${glow}" opacity=".45" class="${S.diving ? '' : 'ea-pulse'}"/>
        <circle cx="${r1(pp[0])}" cy="${r1(pp[1])}" r="8" fill="#FFD23F" stroke="#1E293B" stroke-width="3"/>
        ${lbl(pp[0] + 14, pp[1] - 12, num(Math.round(S.depth)) + ' ' + c.t(T2('km', 'किमी')), 'start', 'sm')}
        ${pills}
        ${lbl(436, 304, c.t(T2('Temperature', 'तापमान')), 'start', 'sm')}
        <rect x="436" y="328" width="156" height="16" rx="8" fill="url(#${id}-tbar)"/>
        <defs><linearGradient id="${id}-tbar"><stop offset="0" stop-color="#3A7BD5"/><stop offset=".35" stop-color="#FF7A1A"/><stop offset=".7" stop-color="#FF3B1F"/><stop offset="1" stop-color="#FFF6C2"/></linearGradient></defs>
        <path d="M${r1(436 + 156 * clamp(temp / 5500, 0, 1))} 324l-7-10h14z" fill="#fff"/>
        ${lbl(514, 372, c.t(T2('about', 'लगभग')) + ' ' + num(temp < 100 ? Math.round(temp) : Math.round(temp / 50) * 50) + ' °C', 'middle', 'big')}
        ${lbl(14, 432, c.t(T2('Crust drawn 8 times thicker so you can see it', 'भूपर्पटी 8 गुना मोटी बनाई गई है ताकि दिखे')), 'start', 'sm')}`;
      },
      panel() {
        const l = layerAt(S.depth), d = S.depth, gpa = pw(EARTH_P, d), atm = Math.max(1, gpa * 9869);
        return c.card({ title: l.n, dot: l.dot, paras: [l.note], facts: [
          [T2('Depth', 'गहराई'), `${num(l.from)}–${num(l.to)} ${c.t(T2('km', 'किमी'))}`], [T2('State', 'अवस्था'), l.state], [T2('Made of', 'किससे बनी'), l.made],
          [T2('Density (g/cm³)', 'घनत्व (ग्रा/सेमी³)'), l.dens], [T2('Pressure at the probe', 'जाँच-यंत्र पर दबाव'), `${num(sig(atm, 3))} × ${c.t(T2('air pressure', 'वायुदाब'))}`],
          [T2('Drive there at 60 km/h', '60 किमी/घंटा से वहाँ पहुँचने में'), `${num(d / 60, d < 600 ? 1 : 0)} ${c.t(T2('hours', 'घंटे'))}`],
        ] });
      },
    };
  };

  // ================================================================ rock-cycle
  const FAM = { igneous: T2('Igneous rock', 'आग्नेय चट्टान'), sedimentary: T2('Sedimentary rock', 'अवसादी चट्टान'), metamorphic: T2('Metamorphic rock', 'कायांतरित चट्टान') };
  const FAMCOL = { igneous: '#E0592F', sedimentary: '#D49A5E', metamorphic: '#8B3DFF', magma: '#FF7A1A', sediment: '#C9A66B' };
  const ROCK = {
    granite: { fam: 'igneous', col: '#D9C6BC', n: T2('Granite', 'ग्रेनाइट'), sed: 'sand', meta: 'gneiss',
      how: T2('Magma cooled slowly, deep underground, so large crystals had time to grow. You can see grains of quartz, feldspar and mica.', 'मैग्मा ज़मीन के अंदर गहराई में धीरे-धीरे ठंडा हुआ, इसलिए बड़े क्रिस्टल बनने का समय मिला। इसमें क्वार्ट्ज़, फ़ेल्सपार और अभ्रक के दाने दिखते हैं।'),
      india: T2('Common in the Deccan plateau and Rajasthan; used for buildings, floors and kitchen tops.', 'दक्कन के पठार और राजस्थान में आम; भवनों, फ़र्श और रसोई के पत्थर में काम आता है।'),
      world: T2('Half Dome in Yosemite (USA) is a giant block of granite.', 'अमेरिका के योसेमिटी का हाफ़ डोम ग्रेनाइट का विशाल खंड है।') },
    basalt: { fam: 'igneous', col: '#3E434B', n: T2('Basalt', 'बेसाल्ट'), sed: 'mud', meta: 'schist',
      how: T2('Lava cooled quickly on the surface, so its crystals are too small to see. It is dark and heavy.', 'लावा सतह पर जल्दी ठंडा हुआ, इसलिए इसके क्रिस्टल इतने छोटे हैं कि दिखते नहीं। यह गहरे रंग का और भारी होता है।'),
      india: T2('The Deccan Traps of Maharashtra are thick layers of basalt; the black soil there forms from it.', 'महाराष्ट्र का दक्कन ट्रैप बेसाल्ट की मोटी परतों से बना है; वहाँ की काली मृदा इसी से बनती है।'),
      world: T2('The volcanoes of Hawaii and the Giant’s Causeway in Northern Ireland are basalt.', 'हवाई के ज्वालामुखी और उत्तरी आयरलैंड का जायंट्स कॉज़वे बेसाल्ट के हैं।') },
    sandstone: { fam: 'sedimentary', col: '#D49A5E', n: T2('Sandstone', 'बलुआ पत्थर'), sed: 'sand', meta: 'quartzite',
      how: T2('Grains of sand were buried, pressed together and cemented by minerals. It feels gritty.', 'रेत के कण दबे, आपस में दबकर खनिजों से जुड़ गए। छूने पर यह खुरदरा लगता है।'),
      india: T2('The Red Fort in Delhi is built of red sandstone.', 'दिल्ली का लाल किला लाल बलुआ पत्थर से बना है।'),
      world: T2('The rock city of Petra in Jordan is carved out of sandstone.', 'जॉर्डन का चट्टानी शहर पेट्रा बलुआ पत्थर में तराशा गया है।') },
    shale: { fam: 'sedimentary', col: '#70747D', n: T2('Shale', 'शेल'), sed: 'mud', meta: 'slate',
      how: T2('Fine mud and clay settled in calm water and were pressed into thin layers. It may hold fossils.', 'बारीक कीचड़ और मिट्टी शांत पानी में बैठी और दबकर पतली परतें बनीं। इसमें जीवाश्म हो सकते हैं।'),
      india: T2('Shale forms where rivers drop fine mud, in lakes and the sea.', 'शेल वहाँ बनता है जहाँ नदियाँ झीलों और समुद्र में बारीक कीचड़ छोड़ती हैं।'),
      world: T2('Shale forms where rivers drop fine mud, in lakes and the sea.', 'शेल वहाँ बनता है जहाँ नदियाँ झीलों और समुद्र में बारीक कीचड़ छोड़ती हैं।') },
    limestone: { fam: 'sedimentary', col: '#CFCAB2', n: T2('Limestone', 'चूना पत्थर'), sed: 'shells', meta: 'marble',
      how: T2('Shells and skeletons of sea creatures, made of calcium carbonate, piled up on the sea floor and were pressed into rock. It fizzes with dilute acid.', 'समुद्री जीवों के कैल्शियम कार्बोनेट से बने खोल और कंकाल समुद्र तल पर जमा हुए और दबकर चट्टान बने। यह तनु अम्ल से झाग देता है।'),
      india: T2('Mined in Madhya Pradesh, Rajasthan and Andhra Pradesh to make cement and lime.', 'सीमेंट और चूना बनाने के लिए मध्य प्रदेश, राजस्थान और आंध्र प्रदेश में खोदा जाता है।'),
      world: T2('The White Cliffs of Dover in England are chalk, a soft kind of limestone.', 'इंग्लैंड की डोवर की सफ़ेद चट्टानें खड़िया हैं, जो एक नरम चूना पत्थर है।') },
    marble: { fam: 'metamorphic', col: '#F3F0EA', n: T2('Marble', 'संगमरमर'), sed: 'shells', meta: 'marble',
      how: T2('Limestone changed by great heat and pressure; its grains grew into sparkling crystals.', 'बहुत ऊष्मा और दबाव से बदला चूना पत्थर; इसके कण चमकीले क्रिस्टल बन गए।'),
      india: T2('The Taj Mahal is built of white marble from Makrana in Rajasthan.', 'ताजमहल राजस्थान के मकराना के सफ़ेद संगमरमर से बना है।'),
      world: T2('Carrara in Italy is famous for its white marble.', 'इटली का कैरारा अपने सफ़ेद संगमरमर के लिए प्रसिद्ध है।') },
    slate: { fam: 'metamorphic', col: '#4A5361', n: T2('Slate', 'स्लेट'), sed: 'mud', meta: 'schist',
      how: T2('Shale squeezed and gently heated. It splits into flat, smooth sheets.', 'दबाया और हल्का गर्म किया गया शेल। यह चपटी, चिकनी परतों में टूटता है।'),
      india: T2('Slate from Himachal Pradesh roofs many hill houses; old school slates were made of it.', 'हिमाचल प्रदेश की स्लेट से पहाड़ी घरों की छतें बनती हैं; पुरानी स्कूली स्लेटें इसी से बनती थीं।'),
      world: T2('Wales in the UK has huge old slate quarries.', 'ब्रिटेन के वेल्स में स्लेट की बड़ी पुरानी खदानें हैं।') },
    schist: { fam: 'metamorphic', col: '#8F99A5', n: T2('Schist', 'शिस्ट'), sed: 'mud', meta: 'gneiss',
      how: T2('Slate, shale or basalt changed by more heat and pressure. Flat, shiny flakes of mica line up in wavy layers.', 'अधिक ऊष्मा और दबाव से बदली स्लेट, शेल या बेसाल्ट। अभ्रक के चपटे, चमकीले टुकड़े लहरदार परतों में सज जाते हैं।'),
      india: T2('Schist is common in the Himalaya, where rocks were squeezed as the mountains rose.', 'शिस्ट हिमालय में आम है, जहाँ पर्वत उठते समय चट्टानें दबीं।'),
      world: T2('Schist is common in old mountain belts such as the Alps.', 'शिस्ट आल्प्स जैसी पुरानी पर्वत-श्रेणियों में आम है।') },
    gneiss: { fam: 'metamorphic', col: '#BDB2A7', n: T2('Gneiss', 'नीस'), sed: 'sand', meta: 'gneiss',
      how: T2('Granite or schist changed by very great heat and pressure. Its minerals separate into light and dark bands.', 'बहुत अधिक ऊष्मा और दबाव से बदला ग्रेनाइट या शिस्ट। इसके खनिज हल्की और गहरी पट्टियों में अलग हो जाते हैं।'),
      india: T2('Some of India’s oldest rocks, in Karnataka and Tamil Nadu, are gneiss more than 3 billion years old.', 'भारत की कुछ सबसे पुरानी चट्टानें, कर्नाटक और तमिलनाडु में, 3 अरब साल से भी पुरानी नीस हैं।'),
      world: T2('The Acasta gneiss in Canada, about 4 billion years old, is among the oldest rocks on Earth.', 'कनाडा की लगभग 4 अरब साल पुरानी अकास्टा नीस पृथ्वी की सबसे पुरानी चट्टानों में है।') },
    quartzite: { fam: 'metamorphic', col: '#E8D0C8', n: T2('Quartzite', 'क्वार्ट्ज़ाइट'), sed: 'sand', meta: 'quartzite',
      how: T2('Sandstone changed by heat and pressure: the sand grains fused into one very hard rock.', 'ऊष्मा और दबाव से बदला बलुआ पत्थर: रेत के कण जुड़कर एक बहुत कठोर चट्टान बन गए।'),
      india: T2('The Aravalli hills and the Delhi Ridge are made largely of quartzite.', 'अरावली की पहाड़ियाँ और दिल्ली रिज ज़्यादातर क्वार्ट्ज़ाइट से बनी हैं।'),
      world: T2('Quartzite is so hard that it is crushed for road gravel and railway tracks.', 'क्वार्ट्ज़ाइट इतना कठोर है कि इसे सड़क की गिट्टी और रेल पटरियों के लिए तोड़ा जाता है।') },
  };
  const ROCK_IDS = Object.keys(ROCK);
  const SEDROCK = { sand: 'sandstone', mud: 'shale', shells: 'limestone' };
  const SEDN = { sand: T2('Sand', 'रेत'), mud: T2('Mud and clay', 'कीचड़ और मिट्टी'), shells: T2('Shells and lime mud', 'सीपियाँ और चूने का कीचड़') };
  const PROC = {
    'cool-slow': T2('Cool slowly underground', 'ज़मीन के अंदर धीरे ठंडा करो'), 'cool-fast': T2('Erupt and cool fast', 'फूटकर जल्दी ठंडा करो'),
    weather: T2('Weather and erode', 'अपक्षय और अपरदन करो'), compact: T2('Bury, press and cement', 'दबाओ, कसो और जोड़ो'),
    heat: T2('Heat and squeeze', 'गर्म करो और दबाओ'), melt: T2('Melt deep down', 'गहराई में पिघलाओ'),
  };
  const PROC_IDS = Object.keys(PROC);
  const PI = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const PROCICON = {
    'cool-slow': PI('<path d="M12 2v20M3 7l18 10M21 7L3 17" stroke="#2F8FEA" stroke-width="2.5" stroke-linecap="round"/>'),
    'cool-fast': PI('<path d="M2 22l7-11h6l7 11z" fill="#7A4E26"/><path d="M10 11c-2-4 0-7 2-9 0 3 3 5 2 9z" fill="#FF7A1A"/>'),
    weather: PI('<path d="M5 10a5 5 0 0 1 10-1 4 4 0 0 1 4 4H5z" fill="#94A3B8"/><path d="M7 16l-1 4M12 16l-1 4M17 16l-1 4" stroke="#2F8FEA" stroke-width="2.5" stroke-linecap="round"/>'),
    compact: PI('<path d="M12 2v8M8 6l4 4 4-4" stroke="#1E293B" stroke-width="2.5" fill="none"/><rect x="3" y="13" width="18" height="3" fill="#D49A5E"/><rect x="3" y="17" width="18" height="3" fill="#B87A40"/>'),
    heat: PI('<path d="M12 2c3 4 6 7 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2-1-4 0-7z" fill="#B42318"/>'),
    melt: PI('<path d="M4 20c0-6 4-6 4-12 2 3 3 5 3 8 1-2 2-3 2-6 3 3 7 5 7 10z" fill="#FF7A1A"/><path d="M3 21h18" stroke="#B42318" stroke-width="2.5"/>'),
  };
  // Draw a rock sample (or magma or sediment) inside a blob, with its real texture.
  function rockArt(kind, cx, cy, r, uid, sedKind) {
    const q = rnd(kind.length * 31 + 5);
    if (kind === 'magma') {
      const pts = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * 2 * Math.PI; const rr = r * (0.86 + 0.12 * Math.sin(i * 2.3)); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a) * 0.9]; });
      return `<defs><radialGradient id="${uid}-m" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#FFF3A0"/><stop offset=".45" stop-color="#FF9A1A"/><stop offset="1" stop-color="#B42318"/></radialGradient></defs>
        <path d="${blob(pts)}" fill="url(#${uid}-m)" stroke="#7A1A10" stroke-width="3"/>${Array.from({ length: 9 }, () => `<circle cx="${r1(cx + (q() - 0.5) * r * 1.2)}" cy="${r1(cy + (q() - 0.5) * r)}" r="${r1(3 + q() * 7)}" fill="#FFE27A" opacity=".55"/>`).join('')}`;
    }
    if (kind === 'sediment') {
      const col = { sand: ['#E2BC7E', '#C9A05E', '#F1D9A8'], mud: ['#7D6650', '#9A8064', '#5F4B3A'], shells: ['#EEE9DA', '#D9D2BC', '#FFFFFF'] }[sedKind || 'sand'];
      let g = '';
      for (let i = 0; i < 150; i++) { const u = q() * 2 - 1, v = q(); const x = cx + u * r * 1.05 * (1 - v * 0.55), y = cy + r * 0.62 - v * r * 1.0 * (1 - Math.abs(u) * 0.6); g += sedKind === 'shells' && i % 6 === 0 ? `<path d="M${r1(x - 6)} ${r1(y)}a6 5 0 0 1 12 0z" fill="${col[0]}" stroke="#B9AE8F"/>` : `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(sedKind === 'mud' ? 2.2 : 3 + q() * 2)}" fill="${col[i % 3]}"/>`; }
      return `<ellipse cx="${cx}" cy="${cy + r * 0.66}" rx="${r * 1.1}" ry="${r * 0.14}" fill="rgba(0,0,0,.25)"/>${g}`;
    }
    const R0 = ROCK[kind], flat = kind === 'slate' ? 0.62 : kind === 'shale' ? 0.75 : 0.88;
    const pts = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * 2 * Math.PI + 0.3; const rr = r * (0.8 + 0.2 * q()); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a) * flat]; });
    const d = blob(pts);
    let tex = '';
    const S = (n, f) => { for (let i = 0; i < n; i++) tex += f(cx + (q() - 0.5) * 2 * r, cy + (q() - 0.5) * 2 * r * flat, i); };
    if (kind === 'granite') S(120, (x, y, i) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(3 + q() * 6)}" height="${r1(3 + q() * 5)}" fill="${['#1F1F24', '#FFFFFF', '#E9A79A', '#F7F2EA', '#8C8C94'][i % 5]}" transform="rotate(${Math.round(q() * 90)} ${r1(x)} ${r1(y)})"/>`);
    if (kind === 'basalt') { S(26, (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1.5 + q() * 3.5)}" fill="#25282E"/>`); S(60, (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1" fill="#6B7280"/>`); }
    if (kind === 'sandstone') { for (let k = -5; k <= 5; k++) tex += `<path d="M${cx - r} ${r1(cy + k * r * 0.17)}q${r * 0.5} ${-6} ${r} 0t${r} 0" stroke="${k % 2 ? '#B87A40' : '#E8B57D'}" stroke-width="${r * 0.08}" fill="none" opacity=".8"/>`; S(140, (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.2" fill="#8A5A2E" opacity=".6"/>`); }
    if (kind === 'shale') for (let k = -8; k <= 8; k++) tex += `<line x1="${cx - r}" y1="${r1(cy + k * r * 0.09)}" x2="${cx + r}" y2="${r1(cy + k * r * 0.09 + 3)}" stroke="${k % 3 ? '#565A62' : '#8A8F98'}" stroke-width="2"/>`;
    if (kind === 'limestone') { S(14, (x, y) => `<path d="M${r1(x)} ${r1(y)}m-7 0a7 7 0 1 1 7 7a4 4 0 1 1 3-6" fill="none" stroke="#9C967E" stroke-width="2"/>`); S(50, (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.4" fill="#A9A38A"/>`); }
    if (kind === 'marble') for (let k = 0; k < 6; k++) { const y0 = cy + (q() - 0.5) * r * 1.4; tex += `<path d="M${cx - r} ${r1(y0)}c${r * 0.5} ${r1(-20 + q() * 40)} ${r} ${r1(-20 + q() * 40)} ${r * 2} ${r1(-15 + q() * 30)}" stroke="#9AA0A8" stroke-width="${r1(1 + q() * 2)}" fill="none" opacity=".7"/>`; }
    if (kind === 'slate') for (let k = -9; k <= 9; k++) tex += `<line x1="${cx - r}" y1="${r1(cy + k * r * 0.07 - 10)}" x2="${cx + r}" y2="${r1(cy + k * r * 0.07 + 10)}" stroke="#3A414C" stroke-width="1.5"/>`;
    if (kind === 'schist') { for (let k = -6; k <= 6; k++) tex += `<path d="M${cx - r} ${r1(cy + k * r * 0.13)}q${r * 0.25} -8 ${r * 0.5} 0t${r * 0.5} 0t${r * 0.5} 0t${r * 0.5} 0" stroke="${k % 2 ? '#6B7380' : '#C3CAD3'}" stroke-width="3" fill="none"/>`; S(40, (x, y) => `<path d="M${r1(x)} ${r1(y)}l2 -2 2 2 -2 2z" fill="#F8FAFC"/>`); }
    if (kind === 'gneiss') for (let k = -6; k <= 6; k++) tex += `<path d="M${cx - r} ${r1(cy + k * r * 0.15)}q${r * 0.3} ${k % 2 ? 10 : -10} ${r * 0.6} 0t${r * 0.6} 0t${r * 0.6} 0t${r * 0.6} 0" stroke="${k % 2 ? '#2F2F35' : '#EEE7DD'}" stroke-width="${r1(r * 0.08)}" fill="none"/>`;
    if (kind === 'quartzite') S(220, (x, y, i) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1 + q() * 1.6)}" fill="${i % 2 ? '#F6E6E1' : '#C9A79D'}"/>`);
    return `<defs><clipPath id="${uid}-c"><path d="${d}"/></clipPath><radialGradient id="${uid}-h" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
      <ellipse cx="${cx}" cy="${r1(cy + r * flat + 6)}" rx="${r * 0.9}" ry="${r * 0.12}" fill="rgba(0,0,0,.3)"/>
      <path d="${d}" fill="${R0.col}"/><g clip-path="url(#${uid}-c)">${tex}</g><path d="${d}" fill="url(#${uid}-h)" stroke="rgba(6,18,51,.55)" stroke-width="2.5"/>`;
  }
  IMPL['rock-cycle'] = (c) => {
    const S = { cur: 'magma', sed: null, prev: null, prevSed: null, k: 1, fx: null, msg: null, made: new Set(), done: false, lastProc: null };
    const famOf = (s) => (s === 'magma' || s === 'sediment' ? s : ROCK[s].fam);
    const NODES = { magma: [300, 382], igneous: [90, 250], sediment: [150, 76], sedimentary: [450, 76], metamorphic: [510, 250] };
    const NODEN = { magma: T2('Magma', 'मैग्मा'), igneous: T2('Igneous', 'आग्नेय'), sediment: T2('Sediments', 'अवसाद'), sedimentary: T2('Sedimentary', 'अवसादी'), metamorphic: T2('Metamorphic', 'कायांतरित') };
    const EDGES = [['magma', 'igneous', 'cool'], ['igneous', 'sediment', 'weather'], ['sediment', 'sedimentary', 'compact'], ['sedimentary', 'metamorphic', 'heat'], ['metamorphic', 'magma', 'melt'], ['igneous', 'metamorphic', 'heat'], ['metamorphic', 'sediment', 'weather'], ['sedimentary', 'sediment', 'weather']];
    const nameOf = (s, sed) => (s === 'magma' ? T2('Magma', 'मैग्मा') : s === 'sediment' ? SEDN[sed] : ROCK[s].n);
    function become(next, sed, proc, msg) {
      S.prev = S.cur; S.prevSed = S.sed; S.cur = next; S.sed = sed || null; S.fx = proc; S.msg = msg || null; S.lastProc = proc; c.busy = true;
      c.rec(T2(`${PROC[proc].en}: ${nameOf(S.prev, S.prevSed).en} → ${nameOf(next, sed).en}`, `${PROC[proc].hi}: ${nameOf(S.prev, S.prevSed).hi} → ${nameOf(next, sed).hi}`));
      c.run(1500, (k) => { S.k = k; c.redraw(); }, () => {
        S.k = 1; S.fx = null; c.busy = false;
        const fam = famOf(next);
        if (proc === 'weather') c.emit('eroded');
        if (proc === 'cool-fast') c.emit('erupted');
        c.emit('formed:' + (next === 'sediment' ? 'sediment' : next));
        if (ROCK[next]) { c.emit('formed:' + fam); S.made.add(fam); }
        c.say(nameOf(next, sed));
        if (!S.done && S.made.size === 3) { S.done = true; c.emit('cycle-done'); c.celebrate(); }
        c.refresh();
      });
    }
    function apply(p) {
      const cur = S.cur, nm = nameOf(cur, S.sed);
      const no = (m) => { S.msg = m; c.toast(m); };
      if (p === 'melt') {
        if (cur === 'magma') return no(T2('It is already molten magma.', 'यह पहले से पिघला हुआ मैग्मा है।'));
        if (cur === 'sediment') return no(T2('Loose sediments must first be buried and pressed into rock before they can be pushed deep enough to melt.', 'ढीले अवसादों को पिघलने लायक गहराई तक जाने से पहले दबकर चट्टान बनना होता है।'));
        return become('magma', null, p, T2(`Deep underground, at about 700–1,200 °C, the ${nm.en.toLowerCase()} melts into magma.`, `ज़मीन के अंदर गहराई में, लगभग 700–1,200 °C पर, ${nm.hi} पिघलकर मैग्मा बन जाता है।`));
      }
      if (p === 'cool-slow' || p === 'cool-fast') {
        if (cur !== 'magma') return no(T2('Only molten magma can cool into igneous rock. Melt the rock first.', 'केवल पिघला मैग्मा ठंडा होकर आग्नेय चट्टान बनता है। पहले चट्टान को पिघलाओ।'));
        return become(p === 'cool-slow' ? 'granite' : 'basalt', null, p);
      }
      if (p === 'weather') {
        if (cur === 'magma') return no(T2('Magma is molten and hidden underground. Let it cool into rock first.', 'मैग्मा पिघला हुआ है और ज़मीन के नीचे है। पहले इसे ठंडा होकर चट्टान बनने दो।'));
        if (cur === 'sediment') return no(T2('It is already loose sediment.', 'यह पहले से ढीला अवसाद है।'));
        const k = ROCK[cur].sed;
        return become('sediment', k, p, k === 'shells' ? T2('Rain slowly dissolves the rock. Rivers carry the lime to the sea, where shells and corals use it, and their remains pile up.', 'वर्षा धीरे-धीरे चट्टान को घोल देती है। नदियाँ चूना समुद्र तक ले जाती हैं, जहाँ सीपियाँ और प्रवाल इसका उपयोग करते हैं और उनके अवशेष जमा होते हैं।') : T2(`Sun, rain, frost and plant roots break the ${nm.en.toLowerCase()} into bits; rivers and wind carry them away and drop them in layers.`, `धूप, वर्षा, पाला और पौधों की जड़ें ${nm.hi} को टुकड़ों में तोड़ती हैं; नदियाँ और हवा उन्हें बहा ले जाती हैं और परतों में जमा करती हैं।`));
      }
      if (p === 'compact') {
        if (cur !== 'sediment') return no(T2('Only loose sediments can be buried and pressed into sedimentary rock. Weather the rock first.', 'केवल ढीले अवसाद दबकर अवसादी चट्टान बनते हैं। पहले चट्टान का अपक्षय करो।'));
        return become(SEDROCK[S.sed], null, p, T2('Over thousands of years, new layers press down on the old ones; water leaves minerals that glue the grains together.', 'हज़ारों सालों में नई परतें पुरानी परतों को दबाती हैं; पानी खनिज छोड़ता है जो कणों को आपस में जोड़ देते हैं।'));
      }
      if (p === 'heat') {
        if (cur === 'magma') return no(T2('Magma is already molten. Heat and pressure change solid rock.', 'मैग्मा पहले से पिघला है। ऊष्मा और दबाव ठोस चट्टान को बदलते हैं।'));
        if (cur === 'sediment') return no(T2('Press the sediments into rock first.', 'पहले अवसादों को दबाकर चट्टान बनाओ।'));
        const m = ROCK[cur].meta;
        if (m === cur) return no(T2(`${nm.en} is already changed as far as heat and pressure can take it. More heat would melt it.`, `${nm.hi} ऊष्मा और दबाव से जितना बदल सकता है, बदल चुका है। और ऊष्मा इसे पिघला देगी।`));
        return become(m, null, p, T2('Deep inside mountains the rock is heated and squeezed, but does not melt; its minerals change and line up.', 'पर्वतों के भीतर गहराई में चट्टान गर्म होती और दबती है, पर पिघलती नहीं; इसके खनिज बदलकर कतार में आ जाते हैं।'));
      }
    }
    const node = (k) => {
      const [x, y] = NODES[k], on = famOf(S.cur) === k;
      return `<g>${on ? `<circle cx="${x}" cy="${y}" r="46" fill="none" stroke="#FFD23F" stroke-width="4" class="ea-pulse"/>` : ''}<circle cx="${x}" cy="${y}" r="38" fill="${FAMCOL[k]}" stroke="#fff" stroke-width="3"/>${rockArt(k === 'igneous' ? 'granite' : k === 'sedimentary' ? 'sandstone' : k === 'metamorphic' ? 'gneiss' : k, x, y - 4, 22, c.id + '-n' + k, 'sand')}${k === 'magma' ? lbl(x + 48, y + 7, c.t(NODEN[k]), 'start', '', 18) : lbl(x, y + 60, c.t(NODEN[k]), 'middle', '', 18)}</g>`;
    };
    const edge = ([a, b, p], i) => {
      const [x1, y1] = NODES[a], [x2, y2] = NODES[b];
      const major = i < 5, used = S.lastProc && (S.lastProc === p || (p === 'cool' && S.lastProc.startsWith('cool'))) && famOf(S.prev || '') === a && famOf(S.cur) === b;
      const dx = x2 - x1, dy = y2 - y1, L0 = Math.hypot(dx, dy), ux = dx / L0, uy = dy / L0;
      const sx = x1 + ux * 46, sy = y1 + uy * 46, ex = x2 - ux * 48, ey = y2 - uy * 48;
      const mx = (sx + ex) / 2 - uy * (major ? 30 : 0), my = (sy + ey) / 2 + ux * (major ? 30 : 0);
      const col = used ? '#FFD23F' : major ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.35)';
      const a2 = Math.atan2(ey - my, ex - mx);
      return `<path d="M${r1(sx)} ${r1(sy)}Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" stroke="${col}" stroke-width="${used ? 5 : major ? 3 : 2}" fill="none" ${major ? '' : 'stroke-dasharray="6 6"'}/><path d="M${r1(ex)} ${r1(ey)}l${r1(-12 * Math.cos(a2) + 7 * Math.sin(a2))} ${r1(-12 * Math.sin(a2) - 7 * Math.cos(a2))}l${r1(-14 * Math.sin(a2))} ${r1(14 * Math.cos(a2))}z" fill="${col}"/>`;
    };
    function fx(k) {
      const p = S.fx, cx = 300, cy = 200;
      if (!p) return '';
      const s = Math.sin(Math.PI * k);
      if (p === 'melt' || p === 'heat') return `<circle cx="${cx}" cy="${cy}" r="${r1(95 + 25 * s)}" fill="none" stroke="#FF5A1F" stroke-width="${r1(14 * s)}" opacity="${r1(0.7 * s)}"/>` + (p === 'heat' ? [0, 1].map((i) => arr(i ? 470 : 130, cy, i ? 410 - 20 * s : 190 + 20 * s, cy, '#FFD23F', 8, 22)).join('') : '');
      if (p === 'cool-slow' || p === 'cool-fast') return Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * 2 * Math.PI; return `<circle cx="${r1(cx + Math.cos(a) * (110 - 20 * k))}" cy="${r1(cy + Math.sin(a) * (95 - 20 * k))}" r="5" fill="#7FD3FF" opacity="${r1(s)}"/>`; }).join('') + (p === 'cool-fast' ? `<path d="M${cx - 30} ${cy - 90}q30 ${r1(-60 * s)} 60 0" stroke="#FF7A1A" stroke-width="10" fill="none" opacity="${r1(s)}"/>` : '');
      if (p === 'weather') return Array.from({ length: 14 }, (_, i) => `<line x1="${200 + i * 15}" y1="${r1(110 + ((k * 300 + i * 37) % 120))}" x2="${196 + i * 15}" y2="${r1(124 + ((k * 300 + i * 37) % 120))}" stroke="#9FD8FF" stroke-width="3" opacity="${r1(s)}"/>`).join('') + Array.from({ length: 10 }, (_, i) => `<rect x="${r1(cx + Math.cos(i) * 60 * (1 + k))}" y="${r1(cy + Math.sin(i) * 50 * (1 + k))}" width="7" height="6" fill="#B89A78" opacity="${r1(1 - k)}"/>`).join('');
      if (p === 'compact') return [0, 1].map((i) => arr(cx, i ? 330 - 20 * s : 100 + 20 * s, cx, i ? 300 - 20 * s : 130 + 20 * s, '#FFD23F', 8, 22)).join('');
      return '';
    }
    return {
      view: [600, 440], label: T2('The rock cycle', 'शैल चक्र'),
      chips: () => ['igneous', 'sedimentary', 'metamorphic'].map((f) => ({ id: f, n: FAM[f], on: S.made.has(f) })),
      controls: () => `<div class="ea-row-t">${esc(c.t(T2('Change the rock', 'चट्टान बदलो')))}</div><div class="ea-row">${PROC_IDS.map((p) => c.btn('toggle:' + p, PROC[p], p === 'melt' || p === 'heat' ? 'ea-go' : p === 'weather' || p === 'compact' ? 'ea-go2' : '', PROCICON[p])).join('')}</div>
        <div class="ea-row-t">${esc(c.t(T2('Or pick a rock', 'या कोई चट्टान चुनो')))}</div><div class="ea-row">${ROCK_IDS.map((r) => c.btn('rock:' + r, ROCK[r].n, '', `<span class="sw" style="background:${ROCK[r].col}"></span>`)).join('')}</div>`,
      pressed: (key) => (key.startsWith('rock:') ? S.cur === key.slice(5) : null),
      act(key) {
        if (key.startsWith('toggle:')) apply(key.slice(7));
        else if (key.startsWith('rock:')) {
          const r = key.slice(5);
          S.prev = S.cur; S.prevSed = S.sed; S.cur = r; S.sed = null; S.k = 1; S.fx = null; S.msg = null; S.lastProc = null;
          c.say(ROCK[r].n); c.rec(T2('Picked ' + ROCK[r].n.en, 'चुना: ' + ROCK[r].n.hi));
          c.reveal(r);
        }
      },
      scene() {
        const id = c.id, k = S.k;
        const art = (s, sed, op, sc) => `<g opacity="${r1(op)}" transform="translate(300 200) scale(${r1(sc)}) translate(-300 -200)">${rockArt(s, 300, 200, 78, id + '-r' + s + (sed || ''), sed)}</g>`;
        const shake = S.fx === 'compact' ? `transform="translate(300 200) scale(1 ${r1(1 - 0.12 * Math.sin(Math.PI * k))}) translate(-300 -200)"` : '';
        return `<defs><radialGradient id="${id}-bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1C2E5E"/><stop offset="1" stop-color="#0A1330"/></radialGradient></defs>
          <rect width="600" height="440" fill="url(#${id}-bg)"/>
          <circle cx="300" cy="200" r="110" fill="rgba(255,255,255,.05)"/>
          ${EDGES.map(edge).join('')}${Object.keys(NODES).map(node).join('')}
          <g ${shake}>${S.prev && k < 1 ? art(S.prev, S.prevSed, 1 - k, 1 - 0.15 * k) : ''}${art(S.cur, S.sed, S.prev && k < 1 ? k : 1, S.prev && k < 1 ? 0.85 + 0.15 * k : 1)}</g>
          ${fx(k)}
          ${lbl(300, 312, c.t(nameOf(S.cur, S.sed)), 'middle', 'big')}`;
      },
      panel() {
        const s = S.cur;
        const head = S.msg ? `<p class="ea-warn">${esc(c.t(S.msg))}</p>` : '';
        if (s === 'magma') return head + c.card({ title: T2('Magma', 'मैग्मा'), dot: FAMCOL.magma, paras: [T2('Molten rock deep underground, at about 700 to 1,200 °C. When it pours out of a volcano it is called lava. Cool it slowly underground, or let it erupt and cool fast.', 'ज़मीन के अंदर गहराई में लगभग 700 से 1,200 °C पर पिघली चट्टान। ज्वालामुखी से बाहर आने पर इसे लावा कहते हैं। इसे ज़मीन के अंदर धीरे ठंडा करो, या फूटकर जल्दी ठंडा होने दो।')], facts: [[T2('Rock types made', 'बने चट्टान प्रकार'), `${S.made.size} / 3`]] });
        if (s === 'sediment') return head + c.card({ title: SEDN[S.sed], dot: FAMCOL.sediment, paras: [T2('Loose bits of rock carried by rivers, wind, ice and waves and dropped in layers, often in lakes and the sea. Bury and press them to make sedimentary rock.', 'नदियों, हवा, बर्फ़ और लहरों द्वारा लाए गए चट्टान के ढीले टुकड़े, जो परतों में जमा होते हैं, अक्सर झीलों और समुद्र में। इन्हें दबाकर अवसादी चट्टान बनाओ।')], facts: [[T2('Will become', 'बनेगा'), ROCK[SEDROCK[S.sed]].n], [T2('Rock types made', 'बने चट्टान प्रकार'), `${S.made.size} / 3`]] });
        const R0 = ROCK[s];
        return head + c.card({ title: R0.n, dot: R0.col, paras: [R0.how], ex: c.region === 'india' ? R0.india : R0.world, facts: [[T2('Type', 'प्रकार'), FAM[R0.fam]], [T2('Heat and squeeze it', 'गर्म करके दबाने पर'), R0.meta === s ? T2('no further change', 'और बदलाव नहीं') : ROCK[R0.meta].n], [T2('Weather it', 'अपक्षय करने पर'), SEDN[R0.sed]], [T2('Rock types made', 'बने चट्टान प्रकार'), `${S.made.size} / 3`]] });
      },
    };
  };

  // ================================================================ soil
  const HORIZON = [
    { id: 'humus', y0: 72, y1: 94, n: T2('Humus', 'ह्यूमस'), col: '#3A2A1E',
      about: T2('Fallen leaves and dead plants and animals rot into humus. It makes the soil dark, rich and good at holding water.', 'गिरी पत्तियाँ और मरे पौधे-जीव सड़कर ह्यूमस बनते हैं। यह मृदा को गहरा, उपजाऊ और पानी रोकने वाला बनाता है।') },
    { id: 'topsoil', y0: 94, y1: 172, n: T2('Topsoil (A)', 'ऊपरी मृदा (A)'), col: '#6B4A2F',
      about: T2('Soft and dark, full of humus, roots, earthworms and tiny living things. Most plant roots grow here, so this is the most precious layer.', 'नरम और गहरी, ह्यूमस, जड़ों, केंचुओं और सूक्ष्म जीवों से भरी। ज़्यादातर पौधों की जड़ें यहीं रहती हैं, इसलिए यह सबसे क़ीमती परत है।') },
    { id: 'subsoil', y0: 172, y1: 252, n: T2('Subsoil (B)', 'अवमृदा (B)'), col: '#A0703C',
      about: T2('Less humus and more minerals, so it is harder and lighter in colour. Only deep roots reach it.', 'ह्यूमस कम और खनिज ज़्यादा, इसलिए यह कठोर और हल्के रंग की होती है। केवल गहरी जड़ें यहाँ पहुँचती हैं।') },
    { id: 'weathered-rock', y0: 252, y1: 332, n: T2('Weathered rock (C)', 'अपक्षयित चट्टान (C)'), col: '#B39A7C',
      about: T2('Lumps of rock with cracks, slowly breaking down. This is where new soil begins to form.', 'दरारों वाले चट्टान के टुकड़े, जो धीरे-धीरे टूट रहे हैं। यहीं से नई मृदा बनना शुरू होती है।') },
    { id: 'bedrock', y0: 332, y1: 440, n: T2('Bedrock', 'आधार शैल'), col: '#7A808A',
      about: T2('Hard, solid rock. Sun, water, frost and roots break rock like this into soil, but it takes hundreds of years to make even a few centimetres.', 'कठोर, ठोस चट्टान। धूप, पानी, पाला और जड़ें ऐसी चट्टान को तोड़कर मृदा बनाते हैं, पर कुछ सेंटीमीटर बनने में भी सैकड़ों साल लगते हैं।') },
  ];
  // Texture classes: grain size (USDA), percolation rate in this model (mL/min) and water the soil holds (mL of 200).
  const TEX = {
    sandy: { n: T2('Sandy soil', 'बलुई मृदा'), col: '#E0BE84', g: 4.2, rate: 40, hold: 30, size: T2('big grains, 0.05–2 mm', 'बड़े कण, 0.05–2 मिमी'),
      about: T2('Big grains with lots of air between them: water runs through fast and the soil dries quickly. Bajra and groundnut grow in sandy soils.', 'बड़े कण, जिनके बीच बहुत हवा होती है: पानी जल्दी निकल जाता है और मृदा जल्दी सूखती है। बलुई मृदा में बाजरा और मूँगफली उगती है।') },
    loamy: { n: T2('Loamy soil', 'दुमटी मृदा'), col: '#7A5636', g: 2.6, rate: 15, hold: 70, size: T2('a mix of sand, silt and clay', 'रेत, गाद और मिट्टी का मिश्रण'),
      about: T2('A mix of sand, silt and clay with plenty of humus. It holds enough water and air for roots: the best soil for most crops, such as wheat, gram and pulses.', 'रेत, गाद और मिट्टी का मिश्रण, भरपूर ह्यूमस के साथ। इसमें जड़ों के लिए पर्याप्त पानी और हवा रहती है: ज़्यादातर फ़सलों, जैसे गेहूँ, चना और दालों के लिए सबसे अच्छी मृदा।') },
    clayey: { n: T2('Clayey soil', 'मृण्मय मृदा'), col: '#9C5B3B', g: 1.4, rate: 4, hold: 120, size: T2('tiny grains, under 0.002 mm', 'बहुत छोटे कण, 0.002 मिमी से कम'),
      about: T2('Tiny grains packed tightly: little air, and water passes very slowly, so the soil stays wet and sticky. Good for paddy (rice), which likes standing water.', 'बहुत छोटे कण, कसकर भरे: हवा कम, और पानी बहुत धीरे निकलता है, इसलिए मृदा गीली और चिपचिपी रहती है। धान के लिए अच्छी, जिसे खड़ा पानी पसंद है।') },
  };
  const TEX_IDS = Object.keys(TEX);
  const INSOIL = {
    alluvial: { n: T2('Alluvial soil', 'जलोढ़ मृदा'), top: '#8C6A4A', sub: '#A88763',
      about: T2('Silt, sand and clay laid down by the Indus, Ganga and Brahmaputra. The most widespread soil in India, across the northern plains and the deltas. Very fertile: rice, wheat, sugarcane and pulses.', 'सिंधु, गंगा और ब्रह्मपुत्र द्वारा बिछाई गई गाद, रेत और मिट्टी। भारत में सबसे ज़्यादा फैली मृदा, उत्तरी मैदानों और डेल्टाओं में। बहुत उपजाऊ: चावल, गेहूँ, गन्ना और दालें।') },
    black: { n: T2('Black soil (regur)', 'काली मृदा (रेगुर)'), top: '#2F2A26', sub: '#4A433D',
      about: T2('Formed from the lava rock (basalt) of the Deccan. Clayey, it holds water well and cracks deeply when dry. Maharashtra, Gujarat and Madhya Pradesh. Famous for cotton.', 'दक्कन की लावा चट्टान (बेसाल्ट) से बनी। मृण्मय, पानी अच्छी तरह रोकती है और सूखने पर गहरी दरारें पड़ती हैं। महाराष्ट्र, गुजरात और मध्य प्रदेश। कपास के लिए प्रसिद्ध।') },
    red: { n: T2('Red and yellow soil', 'लाल और पीली मृदा'), top: '#A6432B', sub: '#C9893B',
      about: T2('Formed from old crystalline rocks where rain is low. Iron makes it red; it looks yellow when it is wet. Odisha, Chhattisgarh, Tamil Nadu and the eastern Deccan.', 'कम वर्षा वाले क्षेत्रों में पुरानी क्रिस्टलीय चट्टानों से बनी। लोहे के कारण लाल; गीली होने पर पीली दिखती है। ओडिशा, छत्तीसगढ़, तमिलनाडु और पूर्वी दक्कन।') },
    laterite: { n: T2('Laterite soil', 'लैटेराइट मृदा'), top: '#9C3E1E', sub: '#B5552A',
      about: T2('Forms where it is hot and very rainy: heavy rain washes the nutrients down (leaching). Kerala, Karnataka, Tamil Nadu and the hills of Odisha. With manure it grows tea, coffee and cashew.', 'गर्म और बहुत वर्षा वाले स्थानों पर बनती है: भारी वर्षा पोषक तत्व नीचे बहा देती है (निक्षालन)। केरल, कर्नाटक, तमिलनाडु और ओडिशा की पहाड़ियाँ। खाद के साथ चाय, कॉफ़ी और काजू उगते हैं।') },
    arid: { n: T2('Arid (desert) soil', 'मरुस्थली मृदा'), top: '#D4A266', sub: '#C78E52',
      about: T2('Sandy and often salty, red to brown, with little humus or water. Western Rajasthan. With irrigation it can grow crops.', 'रेतीली और अक्सर लवणीय, लाल से भूरी, ह्यूमस और पानी कम। पश्चिमी राजस्थान। सिंचाई से इसमें फ़सलें उग सकती हैं।') },
    forest: { n: T2('Forest and mountain soil', 'वन और पर्वतीय मृदा'), top: '#3D2E22', sub: '#6E5A43',
      about: T2('Forms in hilly forests; rich in humus at the top. The Himalaya and the Western and Eastern Ghats.', 'पहाड़ी वनों में बनती है; ऊपर ह्यूमस से भरपूर। हिमालय और पश्चिमी व पूर्वी घाट।') },
  };
  const INSOIL_IDS = Object.keys(INSOIL);
  IMPL.soil = (c) => {
    const S = { sel: null, tex: 'loamy', ins: null, pour: 0, out: 0, res: null, focus: 'profile' };
    const india = c.region === 'india';
    const colOf = (h) => { const s = S.ins && INSOIL[S.ins]; if (s && h.id === 'topsoil') return s.top; if (s && h.id === 'subsoil') return s.sub; return h.col; };
    function drop() {
      const T = TEX[S.tex], came = 200 - T.hold, mins = came / T.rate;
      c.busy = true; S.res = null; S.focus = 'test';
      c.emit('rained'); c.rec(T2('Poured 200 mL of water through ' + T.n.en.toLowerCase(), T.n.hi + ' में 200 mL पानी डाला'));
      c.run(4200, (k) => { const u = clamp((k - 0.15) / 0.85, 0, 1); S.pour = k < 0.35 ? clamp(k / 0.12, 0, 1) : clamp((0.45 - k) / 0.1, 0, 1); S.out = came * u; S.t = mins * u; c.redraw(); }, () => {
        c.busy = false; S.pour = 0; S.out = came; S.res = { came, mins, rate: T.rate, hold: T.hold, tex: S.tex }; c.reveal(S.tex); c.refresh();
      });
    }
    return {
      view: [600, 440], label: T2('A soil profile and a water test', 'मृदा की परतें और पानी की जाँच'),
      chips: () => HORIZON.map((h) => ({ id: h.id, n: h.n })),
      controls: () => `<div class="ea-row-t">${esc(c.t(T2('Soil in the funnel', 'कीप में मृदा')))}</div><div class="ea-row">${TEX_IDS.map((x) => c.btn('toggle:' + x, TEX[x].n, '', `<span class="sw" style="background:${TEX[x].col}"></span>`)).join('')}${c.btn('drop', T2('Pour 200 mL of water', '200 mL पानी डालो'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z" fill="#1D4ED8"/></svg>')}</div>`
        + (india ? `<div class="ea-row-t">${esc(c.t(T2('Soils of India', 'भारत की मृदाएँ')))}</div><div class="ea-row">${INSOIL_IDS.map((x) => c.btn('toggle:' + x, INSOIL[x].n, '', `<span class="sw" style="background:${INSOIL[x].top}"></span>`)).join('')}</div>` : ''),
      pressed: (key) => { const k = key.slice(7); if (TEX[k]) return S.tex === k; if (INSOIL[k]) return S.ins === k; return null; },
      act(key) {
        if (key === 'drop') return drop();
        if (key.startsWith('layer:')) { S.sel = key.slice(6); S.focus = 'profile'; const h = HORIZON.find((x) => x.id === S.sel); c.say(h.n); c.reveal(S.sel); return; }
        const k = key.slice(7);
        if (TEX[k]) { S.tex = k; S.res = null; S.out = 0; S.focus = 'test'; c.say(TEX[k].n); }
        if (INSOIL[k]) { S.ins = S.ins === k ? null : k; S.focus = 'india'; if (S.ins) { c.say(INSOIL[k].n); c.reveal(k); } }
      },
      scene() {
        const id = c.id, q = rnd(11), T = TEX[S.tex];
        const layers = HORIZON.map((h) => {
          const on = S.sel === h.id, col = colOf(h);
          let tex = '';
          if (h.id === 'humus') for (let i = 0; i < 26; i++) tex += `<ellipse cx="${r1(30 + q() * 260)}" cy="${r1(h.y0 + 4 + q() * 16)}" rx="${r1(5 + q() * 6)}" ry="2.5" fill="${['#7A5A2A', '#5C7A2A', '#8B4A1E'][i % 3]}" transform="rotate(${Math.round(q() * 60 - 30)} 0 0)" opacity=".9"/>`;
          if (h.id === 'topsoil') { for (let i = 0; i < 70; i++) tex += `<circle cx="${r1(24 + q() * 268)}" cy="${r1(h.y0 + q() * 76)}" r="1.6" fill="#3A2614" opacity=".7"/>`; tex += `<path d="M70 150c14-10 26 8 40-2s22 6 34-2" stroke="#E59A9A" stroke-width="7" stroke-linecap="round" fill="none" class="ea-bob"/>`; }
          if (h.id === 'subsoil') for (let i = 0; i < 18; i++) tex += `<ellipse cx="${r1(30 + q() * 260)}" cy="${r1(h.y0 + 10 + q() * 60)}" rx="${r1(4 + q() * 8)}" ry="${r1(3 + q() * 5)}" fill="#8A7A6A" stroke="#5E5348"/>`;
          if (h.id === 'weathered-rock') for (let i = 0; i < 12; i++) { const x = 26 + (i % 6) * 46 + q() * 10, y = h.y0 + 8 + Math.floor(i / 6) * 36 + q() * 6; tex += `<path d="${blob([[x, y], [x + 34, y + 2], [x + 38, y + 24], [x + 4, y + 30]])}" fill="#948A7E" stroke="#5E5750" stroke-width="2"/>`; }
          if (h.id === 'bedrock') tex += `<path d="M60 340l20 40-10 50M190 336l-14 50 22 50M250 350l10 40" stroke="#525862" stroke-width="3" fill="none"/>`;
          return hot('layer:' + h.id, c.t(h.n), `<rect x="20" y="${h.y0}" width="280" height="${h.y1 - h.y0}" fill="${col}"/>${tex}${on ? `<rect x="21.5" y="${h.y0 + 1.5}" width="277" height="${h.y1 - h.y0 - 3}" fill="none" stroke="#FFD23F" stroke-width="4"/>` : ''}${lbl(160, (h.y0 + h.y1) / 2 + 7, c.t(h.n), 'middle', '', h.id === 'humus' ? 16 : 19)}`);
        }).join('');
        const roots = `<path d="M90 72v40c0 20-14 30-10 60M90 110c10 10 20 12 22 30M210 72v30c0 30 12 44 8 80M210 120c-12 8-16 18-18 34" stroke="#E8D3A8" stroke-width="3" fill="none" opacity=".85"/>`;
        const plants = `<path d="M90 72c-2-26 6-40 0-56M90 40c-16-6-24-2-30 8M90 30c14-8 22-4 28 6" stroke="#2E9E48" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M210 72c0-22-4-34 2-50M210 40c16-10 26-6 30 4" stroke="#2E9E48" stroke-width="5" fill="none" stroke-linecap="round"/>${Array.from({ length: 30 }, (_, i) => `<path d="M${24 + i * 9.3} 72l-3-10M${24 + i * 9.3} 72l3-12" stroke="#3FB55A" stroke-width="2"/>`).join('')}`;
        // the percolation rig
        const fill = clamp(S.out / 200, 0, 1), cylH = 150, wl = 420 - cylH * fill;
        const grains = Array.from({ length: 70 }, (_, i) => { const u = q(); const y = 172 + q() * 34; const half = 60 - (y - 160) * 0.85; return `<circle cx="${r1(470 + (u * 2 - 1) * half * 0.85)}" cy="${r1(y)}" r="${r1(T.g * (0.7 + q() * 0.5))}" fill="${mixHex(T.col, '#000000', (i % 3) * 0.12)}"/>`; }).join('');
        const dripping = S.out > 0 && S.out < 200 - T.hold - 0.5;
        const dripN = Math.max(1, Math.round(T.rate / 8));
        return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#DDF3FF"/></linearGradient>
          <linearGradient id="${id}-glass" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".4" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient></defs>
          <rect width="600" height="440" fill="#14254F"/><rect x="0" y="0" width="320" height="72" fill="url(#${id}-sky)"/><circle cx="286" cy="26" r="16" fill="#FFD23F"/>
          ${layers}${roots}${plants}
          <rect x="320" y="0" width="280" height="440" fill="#1B2D5C"/>
          ${lbl(460, 30, c.t(T.n), 'middle', '', 20)}
          <g transform="translate(${S.pour ? 432 : 388} ${S.pour ? 46 : 50}) rotate(${r1(S.pour * 70)} 30 30)"><path d="M6 6h48v60a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill="url(#${id}-glass)" stroke="#CFE3F7" stroke-width="2.5"/><rect x="9" y="${S.pour ? 40 : 22}" width="42" height="${S.pour ? 30 : 48}" rx="5" fill="#4FA3F7" opacity=".85"/>${S.pour ? '' : lbl(30, 88, '200 mL', 'middle', 'sm')}</g>
          ${S.pour > 0.5 ? `<path d="M484 112q-6 30-10 50" stroke="#4FA3F7" stroke-width="7" fill="none" stroke-linecap="round"/>` : ''}
          <path d="M405 150h130l-50 70v40h-30v-40z" fill="url(#${id}-glass)" stroke="#CFE3F7" stroke-width="2.5"/>
          <path d="M413 160h114l-42 58h-30z" fill="${T.col}" opacity=".35"/>${grains}
          <path d="M415 162h110" stroke="#F5F0E6" stroke-width="3" stroke-dasharray="3 3" opacity=".6"/>
          ${dripping ? Array.from({ length: dripN }, (_, i) => `<circle cx="470" cy="${r1(268 + ((i * 47 + (S.out * 9)) % 130))}" r="4" fill="#4FA3F7"/>`).join('') : ''}
          <rect x="430" y="${420 - cylH - 8}" width="80" height="${cylH + 8}" rx="6" fill="url(#${id}-glass)" stroke="#CFE3F7" stroke-width="2.5"/>
          <rect x="433" y="${r1(wl)}" width="74" height="${r1(420 - wl)}" rx="4" fill="#4FA3F7" opacity=".85"/>
          ${[0, 50, 100, 150, 200].map((v) => `<line x1="508" x2="520" y1="${420 - cylH * v / 200}" y2="${420 - cylH * v / 200}" stroke="#E8F1FB" stroke-width="2"/><text x="526" y="${420 - cylH * v / 200 + 5}" class="ea-lbl sm" text-anchor="start">${v}</text>`).join('')}
          ${lbl(356, 300, num(Math.round(S.out)) + ' mL', 'middle', 'big')}
          ${S.res || c.busy ? lbl(356, 332, num(S.res ? S.res.mins : S.t || 0, 1) + ' ' + c.t(T2('min', 'मिनट')), 'middle', '', 18) : ''}`;
      },
      panel() {
        if (S.focus === 'profile' && S.sel) { const h = HORIZON.find((x) => x.id === S.sel); return c.card({ title: h.n, dot: colOf(h), paras: [h.about] }); }
        if (S.focus === 'india' && S.ins) { const s = INSOIL[S.ins]; return c.card({ title: s.n, dot: s.top, paras: [s.about] }); }
        const T = TEX[S.tex], r = S.res;
        return c.card({ title: T.n, dot: T.col, paras: [T.about, r ? T2(`Percolation rate = water that came through ÷ time = ${r.came} mL ÷ ${num(r.mins, 1)} min = ${r.rate} mL per minute.`, `अंतःस्रवण दर = निकला पानी ÷ समय = ${r.came} mL ÷ ${num(r.mins, 1)} मिनट = ${r.rate} mL प्रति मिनट।`) : T2('Pour water to measure how fast it passes through this soil.', 'पानी डालकर मापो कि यह इस मृदा से कितनी जल्दी निकलता है।')],
          facts: [[T2('Grain size', 'कणों का आकार'), T.size]].concat(r ? [[T2('Water poured', 'डाला गया पानी'), '200 mL'], [T2('Came through', 'नीचे निकला'), `${r.came} mL`], [T2('Held by the soil', 'मृदा ने रोका'), `${r.hold} mL`], [T2('Percolation rate', 'अंतःस्रवण दर'), `${r.rate} mL/${c.t(T2('min', 'मिनट'))}`]] : []),
          ex: T2('Numbers come from this model; in a real test they depend on how the soil is packed.', 'ये संख्याएँ इस मॉडल की हैं; असली जाँच में ये इस पर निर्भर करती हैं कि मृदा कितनी दबी है।') });
      },
    };
  };

  // ================================================================ volcano
  const VPART = {
    'magma-chamber': { n: T2('Magma chamber', 'मैग्मा कक्ष'), about: T2('A pool of molten rock a few kilometres under the volcano. Gas dissolved in the magma builds up pressure, like the fizz in a shaken bottle.', 'ज्वालामुखी के कुछ किलोमीटर नीचे पिघली चट्टान का भंडार। मैग्मा में घुली गैस दबाव बढ़ाती है, जैसे हिलाई गई बोतल में झाग।') },
    vent: { n: T2('Vent', 'निकास नली'), about: T2('The pipe through which magma rises to the surface. Once it comes out, magma is called lava.', 'वह नली जिससे मैग्मा ऊपर सतह तक आता है। बाहर निकलने पर मैग्मा को लावा कहते हैं।') },
    crater: { n: T2('Crater', 'क्रेटर (ज्वालामुख)'), about: T2('The bowl-shaped opening at the top, where lava, gas and ash come out.', 'ऊपर कटोरे जैसा मुख, जहाँ से लावा, गैस और राख बाहर आती है।') },
    cone: { n: T2('Cone', 'शंकु'), about: T2('The mountain itself, built up layer by layer from cooled lava and ash over many eruptions.', 'स्वयं पर्वत, जो कई उद्गारों में ठंडे लावा और राख की परत-दर-परत बना।') },
  };
  const VPART_IDS = Object.keys(VPART);
  IMPL.volcano = (c) => {
    const S = { si: 52, gas: 60, t: 0, phase: 'idle', n: 0, sel: null, last: null, fail: false };
    const kind = (si) => (si < 55 ? 'basaltic' : si < 65 ? 'andesitic' : 'rhyolitic');
    const MAG = {
      basaltic: { n: T2('Basaltic magma', 'बेसाल्टी मैग्मा'), runny: T2('runny, like warm honey', 'पतला, गुनगुने शहद जैसा'), shape: T2('Shield volcano: broad, gentle slopes', 'शील्ड ज्वालामुखी: चौड़ा, हल्की ढलान'), style: T2('Gentle: rivers of lava flow out', 'शांत: लावा की धाराएँ बहती हैं'),
        india: T2('The Deccan Traps formed when runny basalt lava poured out of long cracks about 66 million years ago.', 'दक्कन ट्रैप लगभग 6.6 करोड़ साल पहले लंबी दरारों से बहे पतले बेसाल्ट लावा से बना।'), world: T2('Mauna Loa in Hawaii is a shield volcano built of runny basalt lava.', 'हवाई का मौना लोआ पतले बेसाल्ट लावा से बना शील्ड ज्वालामुखी है।') },
      andesitic: { n: T2('Andesitic magma', 'एंडेसाइटी मैग्मा'), runny: T2('thick, like toothpaste', 'गाढ़ा, टूथपेस्ट जैसा'), shape: T2('Composite volcano: tall cone of lava and ash layers', 'मिश्रित ज्वालामुखी: लावा और राख की परतों का ऊँचा शंकु'), style: T2('Explosive bursts of ash, then lava', 'राख के विस्फोट, फिर लावा'),
        india: T2('Barren Island in the Andaman Sea, India’s only active volcano, is a cone of lava and ash layers.', 'अंडमान सागर का बैरन द्वीप, भारत का एकमात्र सक्रिय ज्वालामुखी, लावा और राख की परतों का शंकु है।'), world: T2('Mount Fuji in Japan and Vesuvius in Italy are composite volcanoes.', 'जापान का माउंट फ़ूजी और इटली का विसूवियस मिश्रित ज्वालामुखी हैं।') },
      rhyolitic: { n: T2('Rhyolitic magma', 'रायोलाइटी मैग्मा'), runny: T2('very sticky, like cold butter', 'बहुत चिपचिपा, ठंडे मक्खन जैसा'), shape: T2('Steep cone or dome; huge blasts can leave a giant crater (caldera)', 'खड़ा शंकु या गुंबद; बड़े विस्फोट विशाल गड्ढा (काल्डेरा) छोड़ सकते हैं'), style: T2('Violent: a tall column of ash and pumice', 'प्रचंड: राख और झाँवा का ऊँचा स्तंभ'),
        india: T2('Sticky, gas-rich magma makes the most violent eruptions. India has no such volcano today, but ash from Toba in Sumatra, about 74,000 years ago, fell over India.', 'चिपचिपा, गैस-भरा मैग्मा सबसे प्रचंड उद्गार करता है। आज भारत में ऐसा ज्वालामुखी नहीं है, पर लगभग 74,000 साल पहले सुमात्रा के टोबा की राख भारत पर गिरी थी।'), world: T2('Mount Pinatubo (Philippines, 1991) threw ash about 35 km into the sky.', 'फ़िलीपींस के माउंट पिनातुबो (1991) ने राख लगभग 35 किमी ऊपर फेंकी।') },
    };
    const lavaT = (si) => Math.round((1150 - 20 * (si - 50)) / 10) * 10;
    const visc = (si) => Math.pow(10, Math.max(1, 1 + (si - 50) * 0.4)) / 0.001; // Pa·s (basalt ~10–100, rhyolite ~10^9) ÷ water's 0.001
    const colKm = () => r1(clamp(0.3 + ((S.si - 45) / 30) * (S.gas / 100) * 32, 0.3, 35));
    function geo() {
      const t = (S.si - 45) / 30; // 0 runny … 1 sticky
      const top = 230 - t * 120 - Math.min(S.n, 4) * 6, half = 270 - t * 150 + Math.min(S.n, 4) * 6, cw = 22 - t * 6;
      return { top, half, cw, t };
    }
    function erupt() {
      if (S.gas < 40) {
        S.fail = true; c.busy = true; S.phase = 'rise';
        c.toast(T2('Not enough gas pressure: the magma rises a little and sinks back.', 'गैस का दबाव कम है: मैग्मा थोड़ा उठकर वापस बैठ जाता है।'));
        c.run(2200, (k) => { S.t = Math.sin(Math.PI * k) * 0.5; c.redraw(); }, () => { S.t = 0; S.phase = 'idle'; c.busy = false; c.refresh(); });
        return;
      }
      S.fail = false; c.busy = true; S.phase = 'erupt'; S.last = { kind: kind(S.si), km: colKm() };
      c.rec(T2(`Volcano erupted (${MAG[kind(S.si)].n.en}, gas ${S.gas}%)`, `ज्वालामुखी फूटा (${MAG[kind(S.si)].n.hi}, गैस ${S.gas}%)`));
      c.say(T2('Eruption!', 'उद्गार!'));
      c.run(6500, (k) => { S.t = k; c.redraw(); }, () => { S.t = 0; S.phase = 'idle'; S.n++; S.gas = 10; c.busy = false; c.emit('erupted'); c.refresh(); });
    }
    return {
      view: [600, 440], label: T2('A volcano cut in half', 'आधा कटा ज्वालामुखी'),
      chips: () => VPART_IDS.map((p) => ({ id: p, n: VPART[p].n })),
      controls: () => c.slider('silica', T2('Silica in the magma', 'मैग्मा में सिलिका'), 45, 75, 1) + c.slider('gas', T2('Gas pressure', 'गैस का दबाव'), 0, 100, 1) + `<div class="ea-row">${c.btn('play', T2('Erupt', 'फोड़ो'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22l7-12h6l7 12z" fill="#7A4E26"/><path d="M10 10c-2-4 0-7 2-8 0 3 3 4 2 8z" fill="#B42318"/></svg>')}</div>`,
      val: (n) => (n === 'silica' ? S.si : S.gas),
      fmt: (n) => (n === 'silica' ? `${S.si}% · ${c.t(MAG[kind(S.si)].n)}` : `${S.gas}%`),
      slide(n, v) { if (n === 'silica') S.si = v; else S.gas = v; },
      act(key) {
        if (key === 'play') return erupt();
        if (key.startsWith('layer:')) { S.sel = key.slice(6); c.say(VPART[S.sel].n); c.reveal(S.sel); }
      },
      scene() {
        const id = c.id, g = geo(), cx = 300, base = 300;
        const k = S.t, er = S.phase === 'erupt';
        const rise = er ? clamp(k / 0.2, 0, 1) : S.t;
        const reach = g.half + 40, pw0 = 1.3 - g.t * 0.8; // slope shape: gently rounded shield → steep, concave cone
        const yC = (dx) => { const a = Math.abs(dx); if (a <= g.cw) return g.top; return g.top + (base - g.top) * Math.pow(Math.min(1, (a - g.cw) / (reach - g.cw)), pw0); };
        const conePts = []; for (let k2 = -30; k2 <= 30; k2++) { const dx = (k2 / 30) * reach; conePts.push([cx + dx, yC(dx)]); }
        const cone = line(conePts) + 'Z';
        const strata = [0.82, 0.62, 0.42].map((f) => `<path d="${line(conePts.filter((p2, k2) => k2 % 2 === 0).map(([x, y]) => [cx + (x - cx) * f, base - (base - y) * f]))}" stroke="${g.t > 0.35 ? '#8E8277' : '#5A3E2B'}" stroke-width="4" fill="none" opacity=".55"/>`).join('');
        const vent = `M${cx - 9} 392L${cx - 7} ${g.top + 4}L${cx + 7} ${g.top + 4}L${cx + 9} 392Z`;
        const magTop = 392 - (392 - g.top) * rise;
        let erupt = '';
        if (er && k > 0.15) {
          const e = clamp((k - 0.15) / 0.85, 0, 1), fade = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
          const lavaLen = (1 - g.t) * 0.85 + 0.2;
          [-1, 1].forEach((sd) => { const pts = []; const far = g.cw + (reach - g.cw) * Math.min(1, e * 1.5) * lavaLen; for (let q2 = 0; q2 <= 24; q2++) { const dx = g.cw + ((far - g.cw) * q2) / 24; pts.push([cx + sd * dx, yC(dx) - 3]); } erupt += `<path d="${line(pts)}" stroke="${mixHex('#FFB020', '#C2410C', clamp(e * 0.8, 0, 1))}" stroke-width="${r1(11 - g.t * 6)}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${r1(0.6 + 0.4 * fade)}"/>`; });
          const fount = (1 - g.t) * 50 * Math.sin(Math.PI * clamp(e * 1.4, 0, 1));
          if (fount > 1) erupt += Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i - 4.5) * 0.12; return `<circle cx="${r1(cx + Math.cos(a) * fount * (0.5 + (i % 3) * 0.25))}" cy="${r1(g.top - Math.abs(Math.sin(a)) * fount * (0.6 + (i % 2) * 0.4))}" r="${4 + (i % 3)}" fill="#FFC23A"/>`; }).join('');
          const colH = Math.min(g.top - 10, (S.last.km / 35) * 260 + 30) * clamp(e * 1.3, 0, 1);
          if (g.t > 0.15) { const qq = rnd(4); erupt += Array.from({ length: 24 }, (_, i2) => { const f = i2 / 23, y = g.top - colH * f, w = (10 + f * (26 + g.t * 40)) * (0.7 + qq() * 0.6) * (f > 0.8 && S.last.km > 8 ? 1.5 : 1); return `<circle cx="${r1(cx + (qq() - 0.5) * 30 * f + Math.sin(i2 * 1.7 + k * 6) * 6 * f + (f > 0.8 && S.last.km > 8 ? (qq() - 0.5) * 120 : 0))}" cy="${r1(y)}" r="${r1(w)}" fill="${mixHex('#57534E', '#B8B5B0', f * 0.8 + qq() * 0.2)}" opacity="${r1(0.9 * fade)}"/>`; }).join(''); }
          if (g.t > 0.5) erupt += Array.from({ length: 7 }, (_, i) => { const dir = i % 2 ? 1 : -1, v = 60 + i * 18, tt = (e * 2 + i * 0.13) % 1; return `<circle cx="${r1(cx + dir * v * tt * 1.6)}" cy="${r1(g.top - v * 2.2 * tt + 300 * tt * tt)}" r="5" fill="#3A2E28"/>`; }).join('');
        }
        const cooled = S.n ? [-1, 1].map((sd) => { const pts = []; const far = g.cw + (reach - g.cw) * ((1 - g.t) * 0.85 + 0.2); for (let q2 = 0; q2 <= 16; q2++) { const dx = g.cw + ((far - g.cw) * q2) / 16; pts.push([cx + sd * dx, yC(dx) - 2]); } return `<path d="${line(pts)}" stroke="#2B2523" stroke-width="7" fill="none" opacity=".55" stroke-linecap="round"/>`; }).join('') : '';
        const bubbles = Array.from({ length: Math.round(S.gas / 12) }, (_, i) => `<circle cx="${cx - 60 + ((i * 37) % 120)}" cy="${398 + ((i * 13) % 16)}" r="${2 + (i % 3)}" fill="#FFE8A0" opacity=".8"/>`).join('');
        const sel = (p) => S.sel === p ? 'stroke="#FFD23F" stroke-width="4"' : '';
        return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${er ? '#3B2A4A' : '#5BB2F0'}"/><stop offset="1" stop-color="${er ? '#C46A3A' : '#CDEBFF'}"/></linearGradient>
          <linearGradient id="${id}-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.t > 0.35 ? '#9A8E84' : '#7B5A3E'}"/><stop offset="1" stop-color="${g.t > 0.35 ? '#5F554E' : '#4C3424'}"/></linearGradient>
          <linearGradient id="${id}-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B4E3A"/><stop offset="1" stop-color="#2E211A"/></linearGradient>
          <radialGradient id="${id}-mag" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#FFE27A"/><stop offset=".55" stop-color="#FF7A1A"/><stop offset="1" stop-color="#B42318"/></radialGradient></defs>
          <rect width="600" height="440" fill="url(#${id}-sky)"/>
          ${er ? '' : cloud(250, 60, 0.8, '#fff', 0.9) + cloud(520, 90, 0.7, '#fff', 0.8) + '<circle cx="560" cy="40" r="20" fill="#FFD23F"/>'}
          <rect x="0" y="${base}" width="600" height="${440 - base}" fill="url(#${id}-rock)"/>
          ${[318, 345, 372].map((y, i) => `<path d="M0 ${y}Q150 ${y - 8} 300 ${y}T600 ${y}" stroke="${['#7E5E46', '#5E4535', '#4A362A'][i]}" stroke-width="4" fill="none"/>`).join('')}
          <rect x="0" y="${base - 6}" width="600" height="8" fill="#5DAE4F"/>
          ${hot('layer:cone', c.t(VPART.cone.n), `<path d="${cone}" fill="url(#${id}-cone)" ${sel('cone')}/>${strata}`)}
          ${cooled}
          ${hot('layer:vent', c.t(VPART.vent.n), `<path d="${vent}" fill="#2A1A14" ${sel('vent')}/><rect x="${cx - 6}" y="${r1(magTop)}" width="12" height="${r1(392 - magTop)}" fill="#FF8A1A"/>`)}
          ${hot('layer:crater', c.t(VPART.crater.n), `<path d="M${cx - g.cw - 6} ${g.top - 2}Q${cx} ${g.top + 22} ${cx + g.cw + 6} ${g.top - 2}" fill="#3A2A20" ${sel('crater') || 'stroke="#2A1A14" stroke-width="2"'}/>`)}
          ${hot('layer:magma-chamber', c.t(VPART['magma-chamber'].n), `<ellipse cx="${cx}" cy="404" rx="96" ry="28" fill="url(#${id}-mag)" ${sel('magma-chamber')} class="ea-pulse"/>`)}
          ${bubbles}${erupt}
          ${lbl(cx + 112, 418, c.t(VPART['magma-chamber'].n), 'start', 'sm')}
          ${lbl(cx + 18, 360, c.t(VPART.vent.n), 'start', 'sm')}
          ${lbl(cx + g.cw + 14, g.top - 8, c.t(VPART.crater.n), 'start', 'sm')}
          ${lbl(cx - g.half * 0.55, base - 20, c.t(VPART.cone.n), 'middle', 'sm')}
          <g transform="translate(14 14)"><rect width="170" height="56" rx="12" fill="rgba(6,18,51,.7)"/><text x="12" y="24" class="ea-lbl sm" text-anchor="start">${esc(c.t(T2('gas pressure', 'गैस दबाव')))} ${S.gas}%</text><rect x="12" y="34" width="146" height="12" rx="6" fill="rgba(255,255,255,.25)"/><rect x="12" y="34" width="${r1(1.46 * S.gas)}" height="12" rx="6" fill="${S.gas >= 40 ? '#FF7A1A' : '#FFD23F'}"/><line x1="70" x2="70" y1="30" y2="50" stroke="#fff" stroke-width="2"/></g>`;
      },
      panel() {
        const m = MAG[kind(S.si)];
        const part = S.sel ? `<p><b>${esc(c.t(VPART[S.sel].n))}:</b> ${esc(c.t(VPART[S.sel].about))}</p>` : '';
        const facts = [[T2('Lava temperature', 'लावा का तापमान'), `${c.t(T2('about', 'लगभग'))} ${num(lavaT(S.si))} °C`], [T2('How runny', 'कितना पतला'), m.runny], [T2('Thicker than water', 'पानी से गाढ़ा'), `${c.t(T2('about', 'लगभग'))} ${sup10(visc(S.si))} ×`], [T2('Volcano shape', 'ज्वालामुखी का आकार'), m.shape], [T2('Eruption style', 'उद्गार का प्रकार'), m.style]];
        if (S.last) facts.push([T2('Last ash or lava column', 'पिछला राख/लावा स्तंभ'), `${c.t(T2('about', 'लगभग'))} ${num(S.last.km, 1)} ${c.t(T2('km high', 'किमी ऊँचा'))}`]);
        return part + c.card({ title: m.n, dot: '#FF7A1A', paras: [T2('More silica makes magma stickier. Sticky magma traps its gas until it bursts out violently; runny magma lets gas escape gently.', 'अधिक सिलिका मैग्मा को चिपचिपा बनाता है। चिपचिपा मैग्मा गैस को रोके रखता है जब तक वह ज़ोर से फट न जाए; पतला मैग्मा गैस को आराम से निकलने देता है।')], ex: c.region === 'india' ? m.india : m.world, facts, warn: S.gas < 40 ? T2('The gas pressure is too low to erupt. Push it to 40% or more.', 'उद्गार के लिए गैस का दबाव कम है। इसे 40% या ज़्यादा करो।') : null });
      },
    };
  };

  // ================================================================ earthquake
  const VP = 6.0, VS = 3.5, VR = 3.0; // km/s in the crust
  IMPL.earthquake = (c) => {
    const S = { M: 6.5, depth: 20, t: -1, shadow: false, sel: null, last: null };
    const KM = 1.25, EX = 100, SURF = 150, ZK = 2.3, TOWN = 60, STA = 350;
    const X = (km) => EX + km * KM, Y = (z) => SURF + z * ZK;
    const hyp = (d) => Math.hypot(d, S.depth);
    const level = (M, R) => M - 1.5 * Math.log10(Math.max(10, R) / 10);
    const LEV = [[3, T2('Not felt', 'महसूस नहीं')], [4, T2('Weak: felt by a few people', 'हल्का: कुछ लोगों को महसूस')], [5, T2('Light: windows rattle', 'कम: खिड़कियाँ खड़कती हैं')], [6, T2('Strong: things fall off shelves', 'तेज़: अलमारी से चीज़ें गिरती हैं')], [7, T2('Very strong: weak buildings crack', 'बहुत तेज़: कमज़ोर भवनों में दरारें')], [99, T2('Severe: many buildings damaged', 'भयंकर: कई भवन क्षतिग्रस्त')]];
    const levWord = (s) => LEV.find((x) => s < x[0])[1];
    const T_END = 150;
    const arrivals = (d) => { const R0 = hyp(d); return { p: R0 / VP, s: R0 / VS, r: d / VR + S.depth / VS }; };
    function shake() {
      c.busy = true; S.t = 0; S.last = { M: S.M, depth: S.depth };
      c.rec(T2(`Started an earthquake of magnitude ${S.M.toFixed(1)} at ${S.depth} km depth`, `${S.depth} किमी गहराई पर ${S.M.toFixed(1)} परिमाण का भूकंप शुरू किया`));
      c.run(8000, (k) => { S.t = k * T_END; c.redraw(); }, () => { S.t = T_END; c.busy = false; c.emit('shook'); c.refresh(); });
    }
    function trace(x0, y0, w, h) {
      const a = arrivals(STA), amp = clamp(0.12 * Math.pow(1.45, S.M - 3), 0.04, 1) * h / 2;
      const upto = S.t < 0 ? 0 : S.t;
      const pts = [];
      for (let i = 0; i <= 260; i++) {
        const tt = (i / 260) * T_END; if (tt > upto) break;
        let v = Math.sin(tt * 7.1) * 0.6 + Math.sin(tt * 13.3) * 0.4; let e = 0.03;
        if (tt > a.p) e = Math.max(e, 0.25 * Math.exp(-(tt - a.p) / 30));
        if (tt > a.s) e = Math.max(e, 0.6 * Math.exp(-(tt - a.s) / 30));
        if (tt > a.r) e = Math.max(e, 1.0 * Math.exp(-(tt - a.r) / 22));
        pts.push([x0 + (i / 260) * w, y0 - v * e * amp]);
      }
      const tick = (tt, l, col) => (upto >= tt ? `<line x1="${r1(x0 + (tt / T_END) * w)}" x2="${r1(x0 + (tt / T_END) * w)}" y1="${y0 - h / 2 + 8}" y2="${y0 + h / 2 - 6}" stroke="${col}" stroke-width="2" stroke-dasharray="3 3"/><text x="${r1(x0 + (tt / T_END) * w + 3)}" y="${y0 + h / 2 - 2}" class="ea-lbl dk sm" text-anchor="start">${esc(l)}</text>` : '');
      return (pts.length > 1 ? `<path d="${line(pts)}" stroke="#B42318" stroke-width="1.6" fill="none"/>` : '') + tick(a.p, 'P', '#1D4ED8') + tick(a.s, 'S', '#FF7A1A') + tick(a.r, c.t(T2('surface', 'सतह')), '#0F766E');
    }
    function house(x, y, s, wob, crack) {
      return `<g transform="translate(${r1(x + wob)} ${y}) rotate(${r1(wob * 0.8)})"><rect x="${-12 * s}" y="${-22 * s}" width="${24 * s}" height="${22 * s}" fill="#FFE7B8" stroke="#7A4E26" stroke-width="1.5"/><path d="M${-15 * s} ${-22 * s}L0 ${-36 * s}L${15 * s} ${-22 * s}Z" fill="#C2410C"/><rect x="${-4 * s}" y="${-11 * s}" width="${8 * s}" height="${11 * s}" fill="#7A4E26"/>${crack ? `<path d="M${-8 * s} ${-20 * s}l4 6-3 5 4 6" stroke="#1E293B" stroke-width="1.5" fill="none"/>` : ''}</g>`;
    }
    function shadowScene() {
      const cx = 300, cy = 222, R = 170, rc = (R * 3480) / 6371, ri = (R * 1220) / 6371;
      const P = (deg) => [cx + R * Math.sin(deg * DEG), cy - R * Math.cos(deg * DEG)];
      // A ray bends so that its deepest point sits at a turning radius that falls with distance: it grazes the core at
      // about 103°; rays beyond 145° pass through the core.
      const ray = (deg, col) => { const a = P(0), b = P(deg), ad = Math.abs(deg); const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy; const dm = Math.hypot(mx, my); const ux = dm > 0.5 ? mx / dm : -Math.sign(deg) || 1, uy = dm > 0.5 ? my / dm : 0; const rt = ad <= 105 ? R - (R - rc - 3) * Math.pow(ad / 103, 1.3) : 0.8 * rc * (1 - (ad - 145) / 35); const dC = 2 * rt - dm; const ctl = [cx + ux * dC, cy + uy * dC]; return `<path d="M${r1(a[0])} ${r1(a[1])}Q${r1(ctl[0])} ${r1(ctl[1])} ${r1(b[0])} ${r1(b[1])}" stroke="${col}" stroke-width="2" fill="none" opacity=".85"/>`; };
      const arc = (d1, d2, col, w) => [1, -1].map((s) => { const a = P(s * d1), b = P(s * d2); return `<path d="M${r1(a[0])} ${r1(a[1])}A${R} ${R} 0 0 ${s > 0 ? 1 : 0} ${r1(b[0])} ${r1(b[1])}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`; }).join('');
      let rays = '';
      for (let d = 15; d <= 100; d += 17) rays += ray(d, '#7FD3FF') + ray(-d, '#7FD3FF');
      for (let d = 150; d <= 175; d += 12) rays += ray(d, '#C4F1FF') + ray(-d, '#C4F1FF');
      return `<rect width="600" height="440" fill="#071029"/>${stars(600, 440, 50, 9)}
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="#C2552E"/><circle cx="${cx}" cy="${cy}" r="${r1(rc)}" fill="#FF9A2E"/><circle cx="${cx}" cy="${cy}" r="${r1(ri)}" fill="#FFE27A"/>
        ${rays}${arc(105, 145, '#94A3B8', 12)}${arc(105, 180, 'rgba(255,122,26,.0)', 1)}${arc(0, 105, '#22C55E', 8)}${arc(145, 180, '#3B82F6', 8)}
        <path d="M${cx} ${cy - R - 4}l-10 -14h20z" fill="#FFD23F"/>${lbl(cx, cy - R - 22, c.t(T2('Earthquake', 'भूकंप')), 'middle', 'sm')}
        ${lbl(cx + 196, cy - 80, c.t(T2('P and S arrive', 'P और S पहुँचती हैं')), 'start', 'sm')}
        ${lbl(cx + 196, cy + 90, c.t(T2('Shadow zone', 'छाया क्षेत्र')), 'start', 'sm')}${lbl(cx + 196, cy + 108, '105°–145°', 'start', 'sm')}
        ${lbl(cx, cy + R + 26, c.t(T2('Only P waves (through the liquid core)', 'केवल P तरंगें (द्रव क्रोड से होकर)')), 'middle', 'sm')}
        ${lbl(cx, cy + 6, c.t(T2('liquid outer core', 'द्रव बाह्य क्रोड')), 'middle', 'sm dk')}`;
    }
    return {
      view: [600, 440], label: T2('Earthquake waves', 'भूकंप की तरंगें'),
      chips: () => [{ id: 'focus', n: T2('Focus', 'उद्गम केंद्र') }, { id: 'epicentre', n: T2('Epicentre', 'अधिकेंद्र') }, { id: 'shadow-zone', n: T2('Shadow zone', 'छाया क्षेत्र') }],
      controls: () => c.slider('magnitude', T2('Magnitude', 'परिमाण'), 2, 9, 0.1) + c.slider('depth', T2('Depth of the focus', 'उद्गम केंद्र की गहराई'), 5, 100, 5) + `<div class="ea-row">${c.btn('play', T2('Start the earthquake', 'भूकंप शुरू करो'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 14h4l2-6 3 12 3-14 3 10 2-2h3" stroke="#1E293B" stroke-width="2.5" fill="none" stroke-linejoin="round"/></svg>')}${c.btn('toggle:shadow', T2('Whole Earth: shadow zone', 'पूरी पृथ्वी: छाया क्षेत्र'))}</div>`,
      val: (n) => (n === 'magnitude' ? S.M : S.depth), fmt: (n) => (n === 'magnitude' ? S.M.toFixed(1) : `${S.depth} ${c.t(T2('km', 'किमी'))}`),
      slide(n, v) { if (n === 'magnitude') S.M = Math.round(v * 10) / 10; else S.depth = v; S.t = -1; },
      pressed: (k) => (k === 'toggle:shadow' ? S.shadow : null),
      act(key) {
        if (key === 'play') { S.shadow = false; return shake(); }
        if (key === 'toggle:shadow') { S.shadow = !S.shadow; if (S.shadow) c.reveal('shadow-zone'); return; }
        if (key === 'layer:focus' || key === 'layer:epicentre') { S.sel = key.slice(6); c.say(S.sel === 'focus' ? T2('Focus', 'उद्गम केंद्र') : T2('Epicentre', 'अधिकेंद्र')); c.reveal(S.sel); }
      },
      scene() {
        if (S.shadow) return shadowScene();
        const id = c.id, t = S.t, fy = Y(S.depth);
        const waves = t > 0 ? [[VP, '#5BA8FF', 'P'], [VS, '#FF9A3D', 'S']].map(([v, col]) => { const r = v * t; return r > 0 && r < 520 ? `<ellipse cx="${EX}" cy="${r1(fy)}" rx="${r1(r * KM)}" ry="${r1(r * ZK)}" fill="none" stroke="${col}" stroke-width="3" opacity=".9"/>` : ''; }).join('') : '';
        const rw = t > S.depth / VS ? (t - S.depth / VS) * VR : -1;
        const surfW = rw > 0 && rw < 420 ? [-1, 1].map((sd) => { const x = EX + sd * rw * KM; return `<path d="M${r1(x - 30)} ${SURF}q7.5 -10 15 0t15 0t15 0t15 0" stroke="#22C55E" stroke-width="4" fill="none"/>`; }).join('') : '';
        const townA = arrivals(TOWN), sTown = level(S.M, hyp(TOWN));
        const wob = t > townA.s ? Math.sin(t * 9) * clamp((sTown - 3) * 1.6, 0, 6) * Math.exp(-(t - townA.s) / 40) : 0;
        const crack = S.last && t > townA.r && sTown >= 6.5;
        const fault = `M${r1(EX + (SURF - fy) * 0.3)} ${SURF}L${r1(EX + (430 - fy) * 0.3)} 430`;
        const sel = (p) => (S.sel === p ? '#FFD23F' : '#fff');
        return `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B6A4E"/><stop offset=".5" stop-color="#6A4C38"/><stop offset="1" stop-color="#3E2B20"/></linearGradient>
          <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6EC1F5"/><stop offset="1" stop-color="#D6F0FF"/></linearGradient><clipPath id="${id}-under"><rect x="0" y="${SURF}" width="600" height="${440 - SURF}"/></clipPath></defs>
          <rect width="600" height="${SURF}" fill="url(#${id}-sky)"/><rect y="${SURF}" width="600" height="${440 - SURF}" fill="url(#${id}-g)"/>
          ${[200, 260, 330, 400].map((y) => `<path d="M0 ${y}Q150 ${y - 6} 300 ${y}T600 ${y}" stroke="rgba(0,0,0,.18)" stroke-width="3" fill="none"/>`).join('')}
          <rect y="${SURF - 5}" width="600" height="6" fill="#4CAF50"/>
          <path d="${fault}" stroke="#2A1A12" stroke-width="4" stroke-dasharray="10 6"/>${lbl(EX + (420 - fy) * 0.3 + 10, 420, c.t(T2('fault', 'भ्रंश')), 'start', 'sm')}
          <g clip-path="url(#${id}-under)">${waves}</g>${surfW}
          ${[0, 1, 2].map((i) => house(X(TOWN) - 20 + i * 24, SURF - 4, 1, wob * (i % 2 ? -1 : 1), crack && i === 1)).join('')}
          ${lbl(X(TOWN), SURF - 48, c.t(T2('town', 'शहर')) + ` · ${TOWN} ${c.t(T2('km', 'किमी'))}`, 'middle', 'sm')}
          <g transform="translate(${X(STA) - 20} ${SURF - 30})"><rect width="40" height="26" rx="3" fill="#E2E8F0" stroke="#475569"/><path d="M-4 0L20 -14L44 0Z" fill="#475569"/></g>
          ${lbl(588, SURF - 42, c.t(T2('station', 'केंद्र')) + ` · ${STA} ${c.t(T2('km', 'किमी'))}`, 'end', 'sm')}
          <g transform="translate(330 326)"><rect width="258" height="90" rx="10" fill="#FFFDF5" stroke="#CBD5E1" stroke-width="2"/><line x1="10" x2="248" y1="56" y2="56" stroke="#CBD5E1"/>${trace(10, 56, 238, 56)}<text x="10" y="20" class="ea-lbl dk sm" text-anchor="start">${esc(c.t(T2('Seismograph', 'भूकंपलेखी')))}</text></g>
          ${hot('layer:epicentre', c.t(T2('Epicentre', 'अधिकेंद्र')), `<circle cx="${EX}" cy="${SURF}" r="22" fill="rgba(255,255,255,.01)"/><circle cx="${EX}" cy="${SURF}" r="9" fill="none" stroke="${sel('epicentre')}" stroke-width="4"/><circle cx="${EX}" cy="${SURF}" r="3" fill="#B42318"/>`)}
          ${lbl(EX, SURF - 16, c.t(T2('Epicentre', 'अधिकेंद्र')), 'middle', 'sm')}
          <line x1="${EX}" y1="${SURF + 8}" x2="${EX}" y2="${r1(fy - 12)}" stroke="#fff" stroke-dasharray="3 4" stroke-width="2"/>
          ${hot('layer:focus', c.t(T2('Focus', 'उद्गम केंद्र')), `<circle cx="${EX}" cy="${r1(fy)}" r="24" fill="rgba(255,255,255,.01)"/><path d="M${EX} ${r1(fy - 13)}l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#FFD23F" stroke="${sel('focus')}" stroke-width="2" class="${t > 0 && t < 20 ? 'ea-pulse' : ''}"/>`)}
          ${lbl(EX - 18, fy + 6, c.t(T2('Focus', 'उद्गम केंद्र')), 'end', 'sm')}
          ${lbl(16, 432, `${c.t(T2('depth', 'गहराई'))} ${S.depth} ${c.t(T2('km', 'किमी'))}`, 'start', 'sm')}
          ${t > 0 ? lbl(586, 318, `${Math.round(t)} s`, 'end', 'sm') : ''}<path d="M${X(STA)} ${SURF + 2}V326" stroke="#FFFDF5" stroke-width="2" stroke-dasharray="3 4" opacity=".7"/>${cloud(250, 60, 0.8, '#fff', 0.9)}<circle cx="40" cy="40" r="18" fill="#FFD23F"/>`;
      },
      panel() {
        if (S.shadow) return c.card({ title: T2('The shadow zone', 'छाया क्षेत्र'), dot: '#94A3B8', paras: [T2('P waves pass through solids and liquids; S waves pass only through solids. Between about 105° and 145° from an earthquake no direct P or S waves arrive: the shadow zone. S waves never reach beyond 105°, which tells us the outer core is liquid.', 'P तरंगें ठोस और द्रव दोनों से गुज़रती हैं; S तरंगें केवल ठोस से। भूकंप से लगभग 105° और 145° के बीच कोई सीधी P या S तरंग नहीं पहुँचती: यह छाया क्षेत्र है। S तरंगें 105° से आगे कभी नहीं पहुँचतीं, इससे पता चलता है कि बाह्य क्रोड द्रव है।')] });
        const a = arrivals(STA), lag = a.s - a.p, est = lag * ((VP * VS) / (VP - VS));
        const sTown = level(S.M, hyp(TOWN)), eRel = Math.pow(10, 1.5 * (S.M - 5));
        const head = S.sel === 'focus' ? T2('The focus (hypocentre) is the point deep in the ground where the rocks break and slip, and the waves start.', 'उद्गम केंद्र ज़मीन के अंदर वह बिंदु है जहाँ चट्टानें टूटकर खिसकती हैं और तरंगें शुरू होती हैं।') : S.sel === 'epicentre' ? T2('The epicentre is the place on the surface right above the focus. Shaking is usually strongest here.', 'अधिकेंद्र सतह पर उद्गम केंद्र के ठीक ऊपर का स्थान है। यहाँ कंपन आमतौर पर सबसे तेज़ होता है।') : T2('Rocks along a fault get stuck, strain builds up, and then they slip suddenly. P waves (fastest, push–pull) arrive first, then S waves (side-to-side), then surface waves, which do the most damage.', 'भ्रंश के साथ चट्टानें अटक जाती हैं, तनाव बढ़ता है और फिर वे अचानक खिसकती हैं। पहले P तरंगें (सबसे तेज़, धक्का-खिंचाव) पहुँचती हैं, फिर S तरंगें (दाएँ-बाएँ), फिर सतही तरंगें, जो सबसे ज़्यादा नुक़सान करती हैं।');
        return c.card({ title: T2(`Magnitude ${S.M.toFixed(1)}`, `परिमाण ${S.M.toFixed(1)}`), dot: '#B42318', paras: [head], facts: [
          [T2('Shaking in the town', 'शहर में कंपन'), levWord(sTown)], [T2('Energy compared with magnitude 5', 'परिमाण 5 की तुलना में ऊर्जा'), `${num(sig(eRel, 2), eRel < 1 ? 3 : 0)} ×`],
          [T2('P reaches the station', 'P केंद्र तक पहुँचती है'), `${num(a.p, 0)} s`], [T2('S reaches the station', 'S केंद्र तक पहुँचती है'), `${num(a.s, 0)} s`],
          [T2('Distance from S − P', 'S − P से दूरी'), `${num(lag, 0)} s × 8.4 ≈ ${num(est, 0)} ${c.t(T2('km', 'किमी'))}`], [T2('Focus', 'उद्गम केंद्र'), S.depth < 70 ? T2('shallow (under 70 km)', 'उथला (70 किमी से कम)') : T2('intermediate (70–300 km)', 'मध्यम (70–300 किमी)')],
        ], ex: c.region === 'india' ? T2('In India: Bhuj, Gujarat 2001 (magnitude 7.7); Latur, Maharashtra 1993 (6.2); Nepal 2015 (7.8), felt across north India. The Himalaya, the north-east, Kutch and the Andaman and Nicobar Islands are in the highest-risk zone (Zone V).', 'भारत में: भुज, गुजरात 2001 (परिमाण 7.7); लातूर, महाराष्ट्र 1993 (6.2); नेपाल 2015 (7.8), पूरे उत्तर भारत में महसूस हुआ। हिमालय, पूर्वोत्तर, कच्छ और अंडमान-निकोबार द्वीप सबसे अधिक ख़तरे वाले क्षेत्र (ज़ोन V) में हैं।') : T2('The largest ever recorded: Chile 1960 (magnitude 9.5). The Indian Ocean earthquake of 2004 (9.1) made a tsunami that struck many countries.', 'अब तक का सबसे बड़ा दर्ज भूकंप: चिली 1960 (परिमाण 9.5)। 2004 के हिंद महासागर भूकंप (9.1) से उठी सुनामी ने कई देशों को प्रभावित किया।'),
          warn: T2('If the ground shakes: Drop, Cover and Hold on under a strong table, away from windows.', 'अगर ज़मीन हिले: झुको, ढको और पकड़ो — किसी मज़बूत मेज़ के नीचे, खिड़कियों से दूर।') });
      },
    };
  };

  // ================================================================ plates
  const BOUND = {
    divergent: { n: T2('Moving apart (divergent)', 'दूर जाती (अपसारी)'), rate: 2.5, forms: [['mid-ocean-ridge', 1]],
      about: T2('Two plates pull apart. Magma rises into the gap, cools and makes new ocean floor, building an underwater mountain chain: a mid-ocean ridge.', 'दो प्लेटें एक-दूसरे से दूर जाती हैं। बीच की दरार में मैग्मा ऊपर आता है, ठंडा होकर नया महासागरीय तल बनाता है और समुद्र के नीचे पर्वत-श्रृंखला बनती है: मध्य-महासागरीय कटक।'),
      ex: T2('The Mid-Atlantic Ridge, which runs through Iceland.', 'मध्य-अटलांटिक कटक, जो आइसलैंड से होकर गुज़रता है।') },
    'convergent-ocean': { n: T2('Ocean meets continent', 'महासागर और महाद्वीप टकराते हैं'), rate: 7, forms: [['trench', 1], ['volcanoes', 6]],
      about: T2('The heavier ocean plate dives under the lighter continent (subduction). A deep trench forms; deep down the sinking plate melts and feeds a line of volcanoes.', 'भारी महासागरीय प्लेट हल्के महाद्वीप के नीचे धँसती है (क्षेपण)। एक गहरी खाई बनती है; गहराई में धँसती प्लेट पिघलती है और ज्वालामुखियों की कतार को मैग्मा देती है।'),
      ex: T2('The Nazca plate dives under South America: the Peru–Chile Trench and the Andes volcanoes.', 'नाज़्का प्लेट दक्षिण अमेरिका के नीचे धँसती है: पेरू-चिली खाई और एंडीज़ के ज्वालामुखी।') },
    'convergent-continent': { n: T2('Continent meets continent', 'महाद्वीप और महाद्वीप टकराते हैं'), rate: 5, forms: [['tethys-closed', 10], ['himalaya', 16]],
      about: T2('Neither continent sinks, so the crust crumples and is pushed up into high fold mountains. Earthquakes are common.', 'कोई भी महाद्वीप नहीं धँसता, इसलिए भूपर्पटी मुड़कर ऊपर उठती है और ऊँचे वलित पर्वत बनते हैं। भूकंप आम हैं।'),
      ex: T2('The Indian plate pushes into the Eurasian plate: the Himalaya are still rising by a few millimetres a year.', 'भारतीय प्लेट यूरेशियाई प्लेट में धँस रही है: हिमालय अब भी हर साल कुछ मिलीमीटर ऊपर उठ रहा है।') },
    transform: { n: T2('Sliding past (transform)', 'एक-दूसरे के पास से खिसकती (रूपांतर)'), rate: 3.5, forms: [['fault', 1]],
      about: T2('Two plates grind past each other sideways. No crust is made or destroyed, but the rocks lock and then slip with earthquakes.', 'दो प्लेटें बग़ल से एक-दूसरे को रगड़ती हुई खिसकती हैं। न भूपर्पटी बनती है न नष्ट होती है, पर चट्टानें अटककर झटके से खिसकती हैं और भूकंप आते हैं।'),
      ex: T2('The San Andreas Fault in California, USA.', 'अमेरिका के कैलिफ़ोर्निया का सैन एंड्रियास भ्रंश।') },
  };
  const BOUND_IDS = Object.keys(BOUND);
  const FORMN = { 'mid-ocean-ridge': T2('Mid-ocean ridge', 'मध्य-महासागरीय कटक'), trench: T2('Ocean trench', 'महासागरीय खाई'), volcanoes: T2('Volcanoes', 'ज्वालामुखी'), 'tethys-closed': T2('Sea closed up', 'सागर बंद हुआ'), himalaya: T2('Fold mountains', 'वलित पर्वत'), fault: T2('Fault', 'भ्रंश') };
  const myr = (t) => T2(`${t} million years`, t >= 10 && t % 10 === 0 ? `${t / 10} करोड़ वर्ष` : `${t * 10} लाख वर्ष`);
  IMPL.plates = (c) => {
    const S = { b: c.region === 'india' ? 'convergent-continent' : 'divergent', t: 0, seen: new Set(), quakes: 0 };
    const km = () => BOUND[S.b].rate * 10 * S.t;
    function check(prevT) {
      BOUND[S.b].forms.forEach(([f, at]) => { if (S.t >= at && !S.seen.has(S.b + f)) { S.seen.add(S.b + f); c.reveal(f); if (f === 'volcanoes') c.emit('erupted'); } });
      if ((S.b === 'convergent-continent' && S.t >= 10) || S.b === 'transform') { const q = Math.floor(S.t / 5); if (S.t > prevT && q > Math.floor(prevT / 5)) c.emit('shook'); }
    }
    function scene() {
      const id = c.id, t = S.t, b = S.b;
      const base = `<defs><linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F8FEA"/><stop offset="1" stop-color="#0B3D91"/></linearGradient><linearGradient id="${id}-man" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2893C"/><stop offset="1" stop-color="#A8251A"/></linearGradient><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC6F5"/><stop offset="1" stop-color="#D8F1FF"/></linearGradient></defs>`;
      const conv = (x, y, dir) => `<path d="M${x} ${y}a40 26 0 1 ${dir > 0 ? 1 : 0} 0.1 0" stroke="#FFE27A" stroke-width="3" fill="none" stroke-dasharray="8 8" class="ea-flow slow" opacity=".7"/>`;
      if (b === 'divergent') {
        const w = Math.min(230, 8 + t * 4.6), cx = 300;
        const stripes = []; for (let a = 0; a < t; a += 2) { const x0 = (a / Math.max(t, 1)) * w, x1 = (Math.min(a + 2, t) / Math.max(t, 1)) * w; [-1, 1].forEach((s) => stripes.push(`<rect x="${r1(cx + (s > 0 ? x0 : -x1))}" y="232" width="${r1(x1 - x0)}" height="26" fill="${(a / 2) % 2 ? '#334155' : '#64748B'}"/>`)); }
        return base + `<rect width="600" height="440" fill="url(#${id}-sky)"/><circle cx="550" cy="46" r="22" fill="#FFD23F"/>${cloud(120, 70, 0.8, '#fff', 0.9)}${cloud(380, 50, 0.6, '#fff', 0.8)}<rect y="120" width="600" height="112" fill="url(#${id}-sea)"/>
          <rect y="258" width="600" height="182" fill="url(#${id}-man)"/>
          <rect x="0" y="232" width="${r1(cx - w)}" height="26" fill="#475569"/><rect x="${r1(cx + w)}" y="232" width="${r1(300 - w)}" height="26" fill="#475569"/>${stripes.join('')}
          <path d="M${cx - 120} 232Q${cx - 40} ${r1(232 - Math.min(40, 6 + t * 2))} ${cx} ${r1(232 - Math.min(52, 8 + t * 2.6))}Q${cx + 40} ${r1(232 - Math.min(40, 6 + t * 2))} ${cx + 120} 232Z" fill="#475569"/>
          <path d="M${cx - 8} 258L${cx} 236L${cx + 8} 258Z" fill="#FF7A1A"/><rect x="${cx - 4}" y="236" width="8" height="200" fill="#FF9A2E" opacity=".8"/>
          ${conv(cx - 120, 330, -1)}${conv(cx + 120, 330, 1)}
          ${arr(cx - 60, 200, cx - 160, 200, '#fff', 5, 16)}${arr(cx + 60, 200, cx + 160, 200, '#fff', 5, 16)}
          ${lbl(cx, 108, c.t(FORMN['mid-ocean-ridge']), 'middle', '', 20)}${lbl(110, 300, c.t(T2('ocean plate', 'महासागरीय प्लेट')), 'middle', '', 17)}${lbl(490, 300, c.t(T2('ocean plate', 'महासागरीय प्लेट')), 'middle', '', 17)}${lbl(cx, 420, c.t(T2('rising magma', 'ऊपर उठता मैग्मा')), 'middle', '', 17)}
          ${lbl(cx, 286, c.t(T2('new ocean floor', 'नया महासागरीय तल')), 'middle', '', 17)}`;
      }
      if (b === 'convergent-ocean') {
        const L0 = Math.min(200, 30 + t * 8), ang = 32 * DEG, jx = 280, jy = 230;
        const ex = jx + L0 * Math.cos(ang), ey = jy + L0 * Math.sin(ang);
        const volc = t >= 6 ? Math.min(1, (t - 6) / 8) : 0, mh = 20 + Math.min(70, t * 3);
        const quakes = Array.from({ length: Math.min(9, Math.floor(t / 2) + 1) }, (_, i) => { const f = (i + 0.5) / 9; return `<circle cx="${r1(jx + L0 * f * Math.cos(ang) + 6)}" cy="${r1(jy + L0 * f * Math.sin(ang) - 8)}" r="4" fill="#FFD23F" stroke="#B42318"/>`; }).join('');
        return base + `<rect width="600" height="440" fill="url(#${id}-sky)"/><circle cx="550" cy="46" r="22" fill="#FFD23F"/>${cloud(120, 70, 0.8, '#fff', 0.9)}${cloud(380, 50, 0.6, '#fff', 0.8)}<rect y="150" width="${jx}" height="80" fill="url(#${id}-sea)"/><rect y="262" width="600" height="178" fill="url(#${id}-man)"/>
          <path d="M0 230H${jx - 10}L${jx} 250L${r1(ex)} ${r1(ey)}L${r1(ex - 10)} ${r1(ey + 26)}L${jx - 16} 262H0Z" fill="#475569"/>
          <path d="M${jx - 6} 230L${jx + 10} 236L${600} 236V286H${jx + 60}L${jx + 6} 252Z" fill="#9C7A54"/>
          <path d="M${jx + 6} 236L${jx + 120} ${r1(236 - mh)}L${jx + 180} ${r1(236 - mh * 0.7)}L${jx + 240} ${r1(236 - mh * 0.9)}L600 ${r1(236 - mh * 0.5)}V238Z" fill="#8B6A4E"/>
          ${volc ? `<path d="M${jx + 150} ${r1(236 - mh * 0.8)}l26 ${r1(-30 * volc)}l26 ${r1(30 * volc)}z" fill="#5A4636"/><circle cx="${jx + 176}" cy="${r1(236 - mh * 0.8 - 34 * volc)}" r="${r1(10 * volc)}" fill="#9CA3AF" class="ea-bob"/><path d="M${jx + 176} ${r1(236 - mh * 0.8 - 26 * volc)}L${r1(ex - 20)} ${r1(ey - 10)}" stroke="#FF7A1A" stroke-width="5" stroke-dasharray="6 6" class="ea-flow"/>` : ''}
          ${conv(150, 370, 1)}${conv(470, 370, -1)}${quakes}
          <path d="M${jx - 30} 232q20 30 40 0" stroke="#0B2E78" stroke-width="4" fill="none"/>
          ${arr(60, 205, 170, 205, '#fff', 5, 16)}${arr(560, 210, 470, 210, '#fff', 5, 16)}
          ${lbl(jx - 6, 296, c.t(FORMN.trench), 'end', 'sm')}${lbl(110, 254, c.t(T2('ocean plate', 'महासागरीय प्लेट')), 'middle', '', 17)}${lbl(510, 270, c.t(T2('continent', 'महाद्वीप')), 'middle', '', 17)}
          ${volc ? lbl(jx + 176, 108, c.t(FORMN.volcanoes), 'middle', '', 20) : ''}${lbl(r1(ex + 10), r1(ey + 40), c.t(T2('sinking plate melts', 'धँसती प्लेट पिघलती है')), 'middle', '', 17)}`;
      }
      if (b === 'convergent-continent') {
        const gap = Math.max(0, 110 - t * 11), push = Math.min(t, 10) * 11;
        const h = t > 10 ? Math.min(150, (t - 10) * 4.3) : 0, hkm = Math.min(8.8, Math.max(0, (t - 10) * 0.25));
        const ix = 120 + push, mx = ix + gap;
        const peaks = h ? `<path d="M${ix - 90} 222L${ix - 40} ${r1(222 - h * 0.45)}L${ix - 15} ${r1(222 - h * 0.3)}L${ix + 15} ${r1(222 - h)}L${ix + 45} ${r1(222 - h * 0.6)}L${ix + 70} ${r1(222 - h * 0.85)}L${ix + 110} ${r1(222 - h * 0.4)}L${ix + 170} 222Z" fill="#7B6A58"/><path d="M${ix + 3} ${r1(222 - h * 0.86)}L${ix + 15} ${r1(222 - h)}L${ix + 29} ${r1(222 - h * 0.8)}L${ix + 22} ${r1(222 - h * 0.78)}Z" fill="#fff"/>` : '';
        const folds = h ? Array.from({ length: 4 }, (_, i) => `<path d="M${ix - 60} ${236 + i * 10}q30 ${r1(-h * 0.15)} 60 0t60 0t60 0" stroke="#5E4A38" stroke-width="3" fill="none"/>`).join('') : '';
        return base + `<rect width="600" height="440" fill="url(#${id}-sky)"/><circle cx="550" cy="46" r="22" fill="#FFD23F"/>${cloud(120, 70, 0.8, '#fff', 0.9)}${cloud(380, 50, 0.6, '#fff', 0.8)}<rect y="270" width="600" height="170" fill="url(#${id}-man)"/>
          ${gap > 0 ? `<rect x="${r1(ix)}" y="222" width="${r1(gap)}" height="26" fill="url(#${id}-sea)"/>${gap > 40 ? lbl(ix + gap / 2, 214, c.t(T2('Tethys Sea', 'टेथिस सागर')), 'middle', '', 17) : ''}` : ''}
          <path d="M0 222H${r1(ix)}V270H0Z" fill="#B0814F"/><path d="M${r1(mx)} 222H600V270H${r1(mx)}Z" fill="#9C7A54"/>
          ${conv(150, 360, 1)}${conv(450, 360, -1)}${peaks}${folds}
          ${arr(20, 190, 90, 190, '#fff', 5, 16)}${arr(580, 190, 520, 190, '#fff', 5, 16)}
          ${lbl(Math.max(80, ix - 120), 300, c.t(T2('Indian plate', 'भारतीय प्लेट')), 'middle', '', 17)}${lbl(Math.min(515, mx + 140), 300, c.t(T2('Eurasian plate', 'यूरेशियाई प्लेट')), 'middle', '', 17)}
          ${h ? lbl(ix + 15, r1(222 - h - 14), c.t(T2('Himalaya', 'हिमालय')) + ` · ${c.t(T2('about', 'लगभग'))} ${num(hkm, 1)} ${c.t(T2('km', 'किमी'))}`, 'middle', '', 18) : ''}`;
      }
      // transform: seen from above
      const off = Math.min(150, t * 3);
      return base + `<rect width="600" height="440" fill="#B9A27A"/>
        <rect x="0" y="0" width="300" height="440" fill="#C8B48C"/>${Array.from({ length: 10 }, (_, i) => `<circle cx="${30 + (i * 53) % 260}" cy="${r1((40 + i * 41 + 440 - off) % 440)}" r="10" fill="#6E9E4A"/>`).join('')}${Array.from({ length: 10 }, (_, i) => `<circle cx="${330 + (i * 47) % 250}" cy="${r1((30 + i * 43 + off) % 440)}" r="10" fill="#6E9E4A"/>`).join('')}
        <rect x="0" y="${r1(200 - off / 2)}" width="300" height="28" fill="#4B5563"/><rect x="300" y="${r1(200 + off / 2)}" width="300" height="28" fill="#4B5563"/>
        <path d="M0 ${r1(214 - off / 2)}H300M300 ${r1(214 + off / 2)}H600" stroke="#FDE68A" stroke-width="3" stroke-dasharray="14 10"/>
        <path d="M300 0V440" stroke="#7A2E12" stroke-width="6" stroke-dasharray="16 8"/>
        ${arr(150, 380, 150, 300, '#fff', 6, 18)}${arr(450, 60, 450, 140, '#fff', 6, 18)}
        ${lbl(300, 30, c.t(FORMN.fault), 'middle', '', 20)}${lbl(150, 420, c.t(T2('plate moves this way', 'प्लेट इधर खिसकती है')), 'middle', '', 17)}${lbl(450, 170, c.t(T2('plate moves this way', 'प्लेट इधर खिसकती है')), 'middle', '', 17)}
        ${off > 2 ? lbl(300, 256 + off / 2, c.t(T2('road broken and shifted', 'सड़क टूटकर खिसकी')), 'start', 'sm') : ''}`;
    }
    return {
      view: [600, 440], label: T2('Plate boundary', 'प्लेट सीमा'),
      chips: () => BOUND[S.b].forms.map(([f]) => ({ id: f, n: FORMN[f] })),
      controls: () => `<div class="ea-row">${BOUND_IDS.map((b) => c.btn('toggle:' + b, BOUND[b].n)).join('')}</div>` + c.slider('time', T2('Time passed', 'बीता समय'), 0, 50, 1) + `<div class="ea-row">${c.btn('play', T2('Run time forward', 'समय आगे चलाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l12 8-12 8z" fill="#1E293B"/></svg>')}</div>`,
      val: () => S.t, fmt: () => c.t(myr(S.t)),
      slide(n, v) { const p = S.t; S.t = v; check(p); },
      pressed: (k) => (k.startsWith('toggle:') ? S.b === k.slice(7) : null),
      act(key) {
        if (key.startsWith('toggle:')) { S.b = key.slice(7); S.t = 0; c.say(BOUND[S.b].n); return; }
        if (key === 'play') {
          const t0 = S.t >= 50 ? 0 : S.t; c.busy = true; let prev = t0;
          c.rec(T2('Ran plate motion forward: ' + BOUND[S.b].n.en, 'प्लेट गति आगे चलाई: ' + BOUND[S.b].n.hi));
          c.run(6000 * (1 - t0 / 50) + 400, (k) => { S.t = Math.round(lerp(t0, 50, k)); check(prev); prev = S.t; c.refresh(); }, () => { c.busy = false; c.refresh(); });
        }
      },
      scene,
      panel() {
        const B = BOUND[S.b];
        const india = c.region === 'india' ? T2('India’s journey: about 200 million years ago India was part of a giant southern landmass, Gondwana, next to Africa, Antarctica and Australia. It broke away and drifted north, and hit Asia about 40–50 million years ago; the Himalaya began to rise.', 'भारत की यात्रा: लगभग 20 करोड़ साल पहले भारत दक्षिण के विशाल भूभाग गोंडवाना का हिस्सा था, अफ़्रीका, अंटार्कटिका और ऑस्ट्रेलिया के पास। यह अलग होकर उत्तर की ओर खिसका और लगभग 4–5 करोड़ साल पहले एशिया से टकराया; हिमालय उठने लगा।') : T2('The lithosphere is broken into seven major plates (Pacific, North American, South American, Eurasian, African, Indo-Australian and Antarctic) and many smaller ones, all slowly moving on the soft mantle below.', 'स्थलमंडल सात बड़ी प्लेटों (प्रशांत, उत्तर अमेरिकी, दक्षिण अमेरिकी, यूरेशियाई, अफ़्रीकी, इंडो-ऑस्ट्रेलियाई और अंटार्कटिक) और कई छोटी प्लेटों में बँटा है, जो नीचे के नरम मैंटल पर धीरे-धीरे खिसकती हैं।');
        return c.card({ title: B.n, dot: '#14B8A6', paras: [B.about, india], ex: B.ex, facts: [
          [T2('Speed', 'गति'), `${c.t(T2('about', 'लगभग'))} ${B.rate} ${c.t(T2('cm a year', 'सेमी प्रति वर्ष'))}`], [T2('Time', 'समय'), myr(S.t)],
          [T2('Distance moved = speed × time', 'खिसकी दूरी = गति × समय'), `${num(km())} ${c.t(T2('km', 'किमी'))}`],
        ] });
      },
    };
  };

  // ================================================================ water-cycle
  const WPROC = {
    evaporation: { n: T2('Evaporation', 'वाष्पन'), about: T2('The Sun warms the sea, lakes and rivers; water turns into invisible water vapour and rises.', 'सूर्य समुद्र, झीलों और नदियों को गर्म करता है; पानी अदृश्य जलवाष्प बनकर ऊपर उठता है।') },
    transpiration: { n: T2('Transpiration', 'वाष्पोत्सर्जन'), about: T2('Plants pull water up from the soil and give it out as vapour through tiny pores in their leaves.', 'पौधे मृदा से पानी खींचते हैं और पत्तियों के सूक्ष्म छिद्रों से उसे वाष्प के रूप में छोड़ते हैं।') },
    condensation: { n: T2('Condensation', 'संघनन'), about: T2('High up the air is cold. Vapour cools and turns into tiny droplets that gather into clouds.', 'ऊपर हवा ठंडी होती है। वाष्प ठंडी होकर नन्ही बूँदें बनती है जो मिलकर बादल बनाती हैं।') },
    precipitation: { n: T2('Precipitation', 'वर्षण'), about: T2('Droplets join into drops too heavy to float, and fall as rain, or as snow and hail when it is very cold. Mountains push moist air up, so they get a lot of rain.', 'बूँदें मिलकर इतनी भारी हो जाती हैं कि तैर नहीं पातीं और वर्षा बनकर गिरती हैं, या बहुत ठंड में हिम और ओले बनकर। पर्वत नम हवा को ऊपर धकेलते हैं, इसलिए वहाँ बहुत वर्षा होती है।') },
    infiltration: { n: T2('Infiltration', 'अंतःस्यंदन'), about: T2('Some rain soaks into the ground and fills the spaces in soil and rock as groundwater, which we draw from wells.', 'कुछ वर्षा ज़मीन में रिसकर मृदा और चट्टानों के छिद्रों में भौम जल बनकर भरती है, जिसे हम कुओं से निकालते हैं।') },
    runoff: { n: T2('Run-off', 'अपवाह'), about: T2('The rest flows over the land into streams and rivers, and back to the sea.', 'बाक़ी पानी ज़मीन पर बहकर नालों और नदियों में, और वापस समुद्र में पहुँचता है।') },
  };
  const WPROC_IDS = Object.keys(WPROC);
  IMPL['water-cycle'] = (c) => {
    const S = { sun: 60, cw: 0.2, cx: 190, rain: 0, river: 0.3, sel: null, drop: null, phase: 'idle' };
    const tempC = () => 10 + (30 * S.sun) / 100;
    const evapRel = () => esat(tempC()) / esat(25);
    const LBL = { evaporation: [100, 236], transpiration: [318, 196], condensation: [255, 40], precipitation: [520, 172], runoff: [392, 304], infiltration: [480, 360] };
    let stopLoop = null;
    function play() {
      if (S.sun < 10) { c.toast(T2('The water is too cold: almost nothing evaporates. Warm it up.', 'पानी बहुत ठंडा है: लगभग कुछ भी वाष्पित नहीं होता। इसे गर्म करो।')); return; }
      c.busy = true; S.phase = 'grow'; const dur = 1800 / Math.max(0.3, evapRel()); const w0 = S.cw;
      c.rec(T2('Ran the water cycle with the sea at ' + Math.round(tempC()) + ' °C', 'समुद्र को ' + Math.round(tempC()) + ' °C पर रखकर जल चक्र चलाया'));
      c.run(dur, (k) => { S.cw = lerp(w0, 1, k); c.redraw(); }, () => {
        S.phase = 'move';
        c.run(1600, (k) => { S.cx = lerp(190, 440, ease(k)); c.redraw(); }, () => {
          S.phase = 'rain'; c.emit('rained'); c.say(T2('It is raining on the mountain!', 'पर्वत पर वर्षा हो रही है!'));
          c.run(2600, (k) => { S.rain = 1; S.cw = 1 - k * 0.85; S.river = 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, k * 1.2)); c.redraw(); }, () => {
            S.rain = 0; S.phase = 'back';
            c.run(1400, (k) => { S.cx = lerp(440, 190, ease(k)); S.river = lerp(S.river, 0.3, k); c.redraw(); }, () => { S.phase = 'idle'; c.busy = false; c.emit('cycle-done'); c.refresh(); });
          });
        });
      });
    }
    const PATH = [[130, 300, 'evaporation'], [140, 150, 'evaporation'], [200, 100, 'condensation'], [440, 92, 'condensation'], [460, 200, 'precipitation'], [470, 230, 'precipitation'], [420, 268, 'runoff'], [330, 290, 'runoff'], [250, 296, 'runoff']];
    function follow() {
      c.busy = true; let last = null;
      c.rec(T2('Followed one drop round the water cycle', 'एक बूँद के साथ जल चक्र में घूमे'));
      c.run(9000, (k) => {
        const f = k * (PATH.length - 1), i = Math.min(PATH.length - 2, Math.floor(f)), u = f - i;
        S.drop = [lerp(PATH[i][0], PATH[i + 1][0], u), lerp(PATH[i][1], PATH[i + 1][1], u), PATH[i + 1][2]];
        if (PATH[i + 1][2] !== last) { last = PATH[i + 1][2]; S.sel = last; c.reveal(last); c.refreshPanel(); }
        c.redraw();
      }, () => { S.drop = null; c.busy = false; c.emit('cycle-done'); c.say(T2('Back in the sea, ready to go round again.', 'फिर समुद्र में, दोबारा घूमने को तैयार।')); c.refresh(); });
    }
    return {
      view: [600, 420], label: T2('The water cycle', 'जल चक्र'),
      chips: () => WPROC_IDS.map((p) => ({ id: p, n: WPROC[p].n })),
      controls: () => c.slider('sun', T2('Sunshine (warmth of the sea)', 'धूप (समुद्र की गर्मी)'), 0, 100, 1) + `<div class="ea-row">${c.btn('play', T2('Run the cycle', 'चक्र चलाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l12 8-12 8z" fill="#1E293B"/></svg>')}${c.btn('drop', T2('Follow one drop', 'एक बूँद के साथ चलो'), 'ea-go2', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z" fill="#1D4ED8"/></svg>')}</div>`,
      val: () => S.sun, fmt: () => `${Math.round(tempC())} °C`,
      slide(n, v) { S.sun = v; },
      act(key) {
        if (key === 'play') return play();
        if (key === 'drop') return follow();
        if (key.startsWith('layer:')) { S.sel = key.slice(6); c.say(WPROC[S.sel].n); c.reveal(S.sel); }
      },
      start() {
        stopLoop = c.loop((dt, now) => {
          const g = c.fx(); if (!g) return;
          const n = Math.round(4 + 10 * evapRel());
          let h = '';
          for (let i = 0; i < n; i++) { const ph = (now * 0.25 * (0.6 + evapRel() * 0.4) + i / n) % 1; h += `<circle cx="${r1(40 + ((i * 53) % 190) + Math.sin(now * 2 + i) * 4)}" cy="${r1(278 - ph * 150)}" r="${r1(2.5 + ph * 2)}" fill="#fff" opacity="${r1(0.55 * (1 - ph))}"/>`; }
          for (let i = 0; i < 5; i++) { const ph = (now * 0.2 + i / 5) % 1; h += `<circle cx="${r1(290 + i * 15)}" cy="${r1(226 - ph * 80)}" r="2.5" fill="#E6FFF0" opacity="${r1(0.6 * (1 - ph))}"/>`; }
          if (S.rain) for (let i = 0; i < 26; i++) { const ph = (now * 1.6 + i / 26) % 1; const x = S.cx - 50 + ((i * 37) % 100); h += `<line x1="${r1(x)}" y1="${r1(110 + ph * 110)}" x2="${r1(x - 3)}" y2="${r1(122 + ph * 110)}" stroke="#BFE3FF" stroke-width="2.5"/>`; }
          g.innerHTML = h;
        });
      },
      scene() {
        const id = c.id, sunR = 26 + S.sun * 0.12;
        const lab = (p) => { const [x, y] = LBL[p], on = S.sel === p, t = c.t(WPROC[p].n), w = t.length * 9.2 + 26; return hot('layer:' + p, t, `<rect x="${r1(x - w / 2)}" y="${y - 22}" width="${r1(w)}" height="32" rx="16" class="ea-pill ${on ? 'on' : ''}"/><text x="${x}" y="${y}" text-anchor="middle" class="ea-ptxt">${esc(t)}</text>`); };
        const river = `M470 170C440 200 430 230 410 250S350 270 330 282S270 292 236 288`;
        return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FA8EE"/><stop offset="1" stop-color="#CFEFFF"/></linearGradient>
          <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F86E0"/><stop offset="1" stop-color="#0A3A8A"/></linearGradient>
          <linearGradient id="${id}-land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57B65A"/><stop offset="1" stop-color="#2F7D3A"/></linearGradient>
          <radialGradient id="${id}-sun"><stop offset="0" stop-color="#FFF6C2"/><stop offset=".6" stop-color="#FFD23F"/><stop offset="1" stop-color="#FF9A2E"/></radialGradient></defs>
          <rect width="600" height="420" fill="url(#${id}-sky)"/>
          <circle cx="62" cy="62" r="${r1(sunR + 16)}" fill="#FFF3B0" opacity="${r1(0.1 + S.sun / 400)}" class="ea-pulse"/><circle cx="62" cy="62" r="${r1(sunR)}" fill="url(#${id}-sun)"/>
          <path d="M226 280L300 262L380 250L440 200L500 110L548 150L600 120V420H226Z" fill="url(#${id}-land)"/>
          <path d="M486 132L500 110L516 132L506 128L498 136Z" fill="#fff"/><path d="M535 138L548 150L560 138Z" fill="#fff"/>
          <rect x="226" y="330" width="374" height="90" fill="#7A5634"/><rect x="226" y="370" width="374" height="50" fill="#2F6FB0" opacity=".55"/>
          ${arr(560, 392, 300, 392, '#BFE3FF', 4, 12, 'class="ea-flow slow"')}
          <rect x="0" y="280" width="240" height="140" fill="url(#${id}-sea)"/>
          ${[0, 1, 2, 3].map((i) => `<path d="M${i * 60} 290q15 -6 30 0t30 0" stroke="#9FD3FF" stroke-width="2" fill="none" opacity=".7"/>`).join('')}
          ${[290, 320, 350].map((x, i) => `<rect x="${x - 3}" y="${248 - i * 4}" width="6" height="24" fill="#7A4E26"/><circle cx="${x}" cy="${238 - i * 4}" r="16" fill="#2E8B3E"/>`).join('')}
          <path d="${river}" stroke="#2F8FEA" stroke-width="${r1(6 + S.river * 8)}" fill="none" stroke-linecap="round"/><path d="${river}" stroke="#BFE3FF" stroke-width="2" fill="none" class="ea-flow"/>
          <g transform="translate(${r1(S.cx)} 100)"><path d="${cloudD(0, 0, 0.9 + S.cw * 0.9)}" fill="${mixHex('#FFFFFF', '#6B7A90', clamp(S.cw * 0.9, 0, 1))}" stroke="rgba(6,18,51,.15)" stroke-width="2"/></g>
          ${arr(150, 270, 150, 150, 'rgba(255,255,255,.9)', 4, 12)}${arr(332, 210, 332, 140, 'rgba(230,255,240,.9)', 3, 10)}${arr(420, 296, 420, 376, '#BFE3FF', 3, 10)}${arr(560, 240, 560, 376, '#BFE3FF', 3, 10)}
          <g id="${id}-fx"></g>
          ${S.drop ? `<circle cx="${r1(S.drop[0])}" cy="${r1(S.drop[1])}" r="9" fill="#1D4ED8" stroke="#fff" stroke-width="3"/>` : ''}
          ${WPROC_IDS.map(lab).join('')}`;
      },
      panel() {
        const p = S.sel ? WPROC[S.sel] : null;
        return c.card({ title: p ? p.n : T2('The water cycle', 'जल चक्र'), dot: '#2F8FEA', paras: [p ? p.about : T2('The Sun drives a never-ending loop: water evaporates, condenses into clouds, falls as rain, and flows back to the sea over and under the ground.', 'सूर्य एक कभी न रुकने वाला चक्र चलाता है: पानी वाष्पित होता है, बादलों में संघनित होता है, वर्षा बनकर गिरता है और ज़मीन के ऊपर व नीचे से बहकर वापस समुद्र में जाता है।')],
          facts: [[T2('Sea temperature', 'समुद्र का तापमान'), `${Math.round(tempC())} °C`], [T2('Evaporation compared with 25 °C', '25 °C की तुलना में वाष्पन'), `${num(evapRel(), 2)} ×`], [T2('Water in the oceans', 'महासागरों में पानी'), c.t(T2('about 97%, salty', 'लगभग 97%, खारा'))], [T2('Fresh water we can use', 'उपयोग योग्य मीठा पानी'), c.t(T2('less than 1%', '1% से भी कम'))]],
          ex: T2('Warmer water evaporates faster: the rate follows how much vapour the air can hold at that temperature.', 'गर्म पानी तेज़ी से वाष्पित होता है: दर इस पर चलती है कि उस तापमान पर हवा कितनी वाष्प रख सकती है।') });
      },
      destroy() { if (stopLoop) stopLoop(); },
    };
  };

  // ================================================================ weather
  const INSTR = {
    thermometer: { n: T2('Thermometer', 'तापमापी'), about: T2('Kept in a white, slatted box (a Stevenson screen) in the shade, so it measures the air, not the sunshine. A maximum–minimum thermometer records the day’s highest and lowest. A wet-and-dry bulb pair inside measures humidity.', 'छाया में सफ़ेद, झिरीदार बक्से (स्टीवेन्सन स्क्रीन) में रखा जाता है, ताकि यह धूप नहीं, हवा का तापमान मापे। अधिकतम-न्यूनतम तापमापी दिन का सबसे अधिक और सबसे कम तापमान दर्ज करता है। अंदर गीले और सूखे बल्ब की जोड़ी आर्द्रता मापती है।') },
    'rain-gauge': { n: T2('Rain gauge', 'वर्षामापी'), about: T2('A funnel and a measuring jar. Rainfall is the depth of water that would cover flat ground, in millimetres.', 'एक कीप और नापने का जार। वर्षा को उस पानी की गहराई से मापते हैं जो समतल ज़मीन को ढक दे, मिलीमीटर में।') },
    'wind-vane': { n: T2('Wind vane', 'वायु दिशा सूचक'), about: T2('It turns to point into the wind and shows the direction the wind comes from. A wind is named after where it blows from: a west wind blows from the west.', 'यह घूमकर हवा की ओर इशारा करता है और बताता है कि हवा किस दिशा से आ रही है। पवन का नाम उस दिशा से होता है जहाँ से वह आती है: पश्चिमी पवन पश्चिम से आती है।') },
    anemometer: { n: T2('Anemometer', 'पवनवेगमापी'), about: T2('Cups catch the wind and spin; the faster they spin, the stronger the wind. It measures wind speed.', 'कप हवा पकड़कर घूमते हैं; जितना तेज़ घूमें, हवा उतनी तेज़। यह पवन की गति मापता है।') },
    barometer: { n: T2('Barometer', 'वायुदाबमापी'), about: T2('Measures air pressure. Average pressure at sea level is 1013 hectopascals (hPa). Falling pressure often brings clouds and rain; rising pressure, fair weather.', 'वायुदाब मापता है। समुद्र तल पर औसत दाब 1013 हेक्टोपास्कल (hPa) होता है। गिरता दाब अक्सर बादल और वर्षा लाता है; बढ़ता दाब, साफ़ मौसम।') },
  };
  const INSTR_IDS = Object.keys(INSTR);
  // Beaufort scale, upper limits in km/h.
  const BEAU = [[1, T2('Calm', 'शांत')], [6, T2('Light air', 'बहुत हल्की हवा')], [12, T2('Light breeze', 'हल्की हवा')], [20, T2('Gentle breeze', 'मंद हवा')], [29, T2('Moderate breeze', 'मध्यम हवा')], [39, T2('Fresh breeze', 'ताज़ी तेज़ हवा')], [50, T2('Strong breeze', 'तेज़ हवा')], [62, T2('Near gale', 'आँधी जैसी')], [999, T2('Gale', 'आँधी')]];
  IMPL.weather = (c) => {
    const S = { T: 32, RH: 70, W: 14, sel: null, lift: -1, rainmm: 0, cloud: null, rot: 0 };
    let stopLoop = null;
    const td = () => dewPoint(S.T, S.RH), base = () => Math.max(0, 125 * (S.T - td()));
    const H = 330, KMPX = 76; // ground y, px per km in the sky
    function lift() {
      const b = base(); c.busy = true; S.cloud = null;
      c.rec(T2(`Lifted air at ${S.T} °C, ${S.RH}% humidity`, `${S.T} °C, ${S.RH}% आर्द्रता वाली हवा उठाई`));
      c.run(4200, (k) => { S.lift = k * 4000; if (S.lift >= b && !S.cloud && b < 3800) S.cloud = { base: b, rain: S.RH >= 75 && b < 1500 }; c.redraw(); }, () => {
        c.busy = false; S.lift = -1;
        if (!S.cloud) c.toast(T2('No cloud: the air is too dry. It would have to rise very high before cooling to its dew point.', 'कोई बादल नहीं: हवा बहुत सूखी है। ओसांक तक ठंडी होने के लिए उसे बहुत ऊपर जाना होगा।'));
        else if (S.cloud.rain) { S.rainmm += Math.round((S.RH - 60) / 2); c.emit('rained'); c.say(T2('It is raining!', 'वर्षा हो रही है!')); }
        c.refresh();
      });
    }
    return {
      view: [600, 420], label: T2('A weather station', 'एक मौसम केंद्र'),
      chips: () => INSTR_IDS.map((p) => ({ id: p, n: INSTR[p].n })),
      controls: () => c.slider('temperature', T2('Air temperature', 'हवा का तापमान'), 0, 45, 1) + c.slider('humidity', T2('Relative humidity', 'सापेक्ष आर्द्रता'), 10, 100, 1) + c.slider('wind', T2('Wind speed', 'पवन की गति'), 0, 70, 1) + `<div class="ea-row">${c.btn('play', T2('Lift the air', 'हवा ऊपर उठाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V6M6 11l6-6 6 6" stroke="#1E293B" stroke-width="3" fill="none" stroke-linecap="round"/></svg>')}</div>`,
      val: (n) => (n === 'temperature' ? S.T : n === 'humidity' ? S.RH : S.W),
      fmt: (n) => (n === 'temperature' ? `${S.T} °C` : n === 'humidity' ? `${S.RH}%` : `${S.W} ${c.t(T2('km/h', 'किमी/घंटा'))}`),
      slide(n, v) { if (n === 'temperature') S.T = v; else if (n === 'humidity') S.RH = v; else S.W = v; S.cloud = null; },
      act(key) { if (key === 'play') return lift(); if (key.startsWith('layer:')) { S.sel = key.slice(6); c.say(INSTR[S.sel].n); c.reveal(S.sel); } },
      start() { stopLoop = c.loop((dt, now) => { S.rot = (S.rot + dt * S.W * 25) % 360; const a = c.svg.querySelector('#' + c.id + '-cups'); if (a) a.setAttribute('transform', `rotate(${r1(S.rot)} 370 128)`); const g = c.fx(); if (g) { let h = ''; for (let i = 0; i < Math.round(S.W / 6); i++) { const ph = (now * (0.15 + S.W / 120) + i * 0.37) % 1; h += `<path d="M${r1(-60 + ph * 720)} ${80 + (i * 47) % 200}h40" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`; } if (S.cloud && S.cloud.rain) for (let i = 0; i < 30; i++) { const ph = (now * 1.4 + i / 30) % 1; const x = 30 + ((i * 41) % 500), y0 = H - S.cloud.base / 1000 * KMPX; h += `<line x1="${x}" y1="${r1(y0 + ph * (H - y0))}" x2="${x - 3}" y2="${r1(y0 + ph * (H - y0) + 12)}" stroke="#CFE8FF" stroke-width="2"/>`; } g.innerHTML = h; } }); },
      scene() {
        const id = c.id, b = base(), humid = clamp((S.RH - 30) / 70, 0, 1);
        const sky = [mixHex('#3E9BE8', '#7C8DA3', humid * (S.cloud ? 1 : 0.5)), mixHex('#CDEBFF', '#C9D2DD', humid * 0.6)];
        const cy = S.cloud ? H - (S.cloud.base / 1000) * KMPX : 0;
        const parcelY = S.lift >= 0 ? H - (S.lift / 1000) * KMPX : -99;
        const pT = S.lift >= 0 ? (S.lift <= b ? S.T - S.lift / 100 : S.T - b / 100 - (S.lift - b) * 0.006) : null;
        const sel = (p) => (S.sel === p ? 'stroke="#FFD23F" stroke-width="4"' : '');
        return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
          <rect width="600" height="420" fill="url(#${id}-sky)"/>
          ${S.cloud ? '' : `<circle cx="80" cy="60" r="28" fill="#FFD23F"/>` + (S.RH > 35 ? cloud(250, 70, 0.6, '#fff', 0.85) + cloud(450, 50, 0.45, '#fff', 0.7) : '')}
          ${S.cloud ? Array.from({ length: S.cloud.rain ? 4 : 1 }, (_, j) => [40, 170, 300, 430].map((x, i) => cloud(x + 50 + (j % 2) * 40, cy - j * 46, 1.3 + ((i + j) % 2) * 0.3, S.cloud.rain ? mixHex('#6B7686', '#B8C2CF', j / 4) : '#FFFFFF', 0.96)).join('')).join('') + `<line x1="0" x2="572" y1="${r1(cy)}" y2="${r1(cy)}" stroke="#fff" stroke-dasharray="6 6" opacity=".8"/>${lbl(570, cy + 22, c.t(T2('cloud base', 'बादल का आधार')) + ` ${num(Math.round(S.cloud.base / 50) * 50)} m`, 'end', 'sm')}` : ''}
          <rect y="${H}" width="600" height="${420 - H}" fill="#5DAE4F"/><rect y="${H + 30}" width="600" height="${420 - H - 30}" fill="#4A9440"/>
          ${hot('layer:thermometer', c.t(INSTR.thermometer.n), `<rect x="96" y="214" width="92" height="70" rx="4" fill="#FFFFFF" ${sel('thermometer') || 'stroke="#94A3B8" stroke-width="2"'}/>${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="102" x2="182" y1="${224 + i * 10}" y2="${228 + i * 10}" stroke="#CBD5E1" stroke-width="3"/>`).join('')}<path d="M92 214L142 196L192 214Z" fill="#E2E8F0" stroke="#94A3B8"/><rect x="104" y="284" width="6" height="${H - 284}" fill="#E2E8F0"/><rect x="174" y="284" width="6" height="${H - 284}" fill="#E2E8F0"/><rect x="136" y="226" width="8" height="46" rx="4" fill="#fff" stroke="#475569"/><rect x="138" y="${r1(268 - S.T * 0.85)}" width="4" height="${r1(4 + S.T * 0.85)}" fill="#DC2626"/>`)}
          ${hot('layer:rain-gauge', c.t(INSTR['rain-gauge'].n), `<path d="M236 270h44l-8 14h-28z" fill="#CBD5E1" ${sel('rain-gauge') || 'stroke="#475569" stroke-width="2"'}/><rect x="244" y="284" width="28" height="${H - 284}" fill="#E2E8F0" stroke="#475569" stroke-width="2"/><rect x="246" y="${r1(H - Math.min(42, S.rainmm * 1.2))}" width="24" height="${r1(Math.min(42, S.rainmm * 1.2))}" fill="#3B82F6"/>`)}
          <rect x="366" y="126" width="8" height="${H - 126}" fill="#64748B"/>
          ${hot('layer:anemometer', c.t(INSTR.anemometer.n), `<circle cx="370" cy="128" r="40" fill="rgba(255,255,255,.01)"/><g id="${id}-cups" transform="rotate(${r1(S.rot)} 370 128)">${[0, 120, 240].map((a) => `<g transform="rotate(${a} 370 128)"><line x1="370" y1="128" x2="400" y2="128" stroke="#334155" stroke-width="3"/><path d="M400 120a9 9 0 0 1 0 16z" fill="#F97316" ${sel('anemometer')}/></g>`).join('')}</g><circle cx="370" cy="128" r="5" fill="#334155"/>`)}
          ${hot('layer:wind-vane', c.t(INSTR['wind-vane'].n), `<rect x="340" y="196" width="60" height="34" fill="rgba(255,255,255,.01)"/><line x1="370" y1="190" x2="370" y2="210" stroke="#64748B" stroke-width="4"/><path d="M336 210h56" stroke="#1E293B" stroke-width="4"/><path d="M322 210l16 -9v18z" fill="#DC2626" ${sel('wind-vane')}/><path d="M390 210l14 -12v24z" fill="#1E293B"/>${lbl(370, 246, c.t(T2('wind from the west', 'पश्चिम से पवन')), 'middle', 'sm')}`)}
          ${hot('layer:barometer', c.t(INSTR.barometer.n), `<rect x="440" y="230" width="110" height="${H - 230}" fill="#FDE7C7" stroke="#B45309" stroke-width="2"/><path d="M432 232L495 196L558 232Z" fill="#C2410C"/><circle cx="495" cy="270" r="24" fill="#fff" ${sel('barometer') || 'stroke="#475569" stroke-width="2"'}/><line x1="495" y1="270" x2="495" y2="250" stroke="#1E293B" stroke-width="3"/><text x="495" y="288" text-anchor="middle" style="font: 700 9px var(--font-body)" fill="#1E293B">1013</text>`)}
          <line x1="584" x2="584" y1="${H}" y2="${H - 4 * KMPX}" stroke="#fff" stroke-width="2" opacity=".8"/>${[1, 2, 3, 4].map((k) => `<line x1="578" x2="590" y1="${H - k * KMPX}" y2="${H - k * KMPX}" stroke="#fff" stroke-width="2"/><text x="574" y="${H - k * KMPX + 5}" text-anchor="end" class="ea-lbl sm">${k} km</text>`).join('')}
          ${S.lift >= 0 ? `<circle cx="540" cy="${r1(parcelY)}" r="16" fill="${S.lift >= b ? '#E2E8F0' : 'rgba(255,255,255,.35)'}" stroke="#fff" stroke-width="2"/>${lbl(518, parcelY + 6, `${num(pT, 1)} °C`, 'end', 'sm')}` : ''}
          <g id="${id}-fx"></g>
          ${lbl(142, 380, c.t(INSTR.thermometer.n), 'middle', 'sm')}${lbl(258, 380, c.t(INSTR['rain-gauge'].n), 'middle', 'sm')}${lbl(370, 380, c.t(INSTR.anemometer.n), 'middle', 'sm')}${lbl(495, 380, c.t(INSTR.barometer.n), 'middle', 'sm')}
          ${lbl(258, 404, `${S.rainmm} mm`, 'middle', 'sm')}`;
      },
      panel() {
        const p = S.sel ? INSTR[S.sel] : null, d = td(), b = base();
        const w = BEAU.find((x) => S.W < x[0])[1];
        return c.card({ title: p ? p.n : T2('Today’s weather', 'आज का मौसम'), dot: '#3B82F6', paras: [p ? p.about : T2('Weather is the state of the air today: temperature, humidity, wind, pressure and rain. Climate is the average weather of a place over many years (usually 30).', 'मौसम आज की हवा की दशा है: तापमान, आर्द्रता, पवन, दाब और वर्षा। जलवायु किसी स्थान का कई वर्षों (आमतौर पर 30) का औसत मौसम है।'),
          T2('Rising air cools by about 10 °C every kilometre. When it cools to its dew point, vapour condenses and a cloud forms; inside the cloud it cools more slowly.', 'ऊपर उठती हवा हर किलोमीटर पर लगभग 10 °C ठंडी होती है। ओसांक तक ठंडी होने पर वाष्प संघनित होकर बादल बनाती है; बादल के अंदर यह धीरे ठंडी होती है।')],
          facts: [[T2('Dew point', 'ओसांक'), `${num(d, 1)} °C`], [T2('Cloud base = 125 m × (T − dew point)', 'बादल का आधार = 125 मी × (T − ओसांक)'), `${num(Math.round(b / 50) * 50)} m`], [T2('Wind', 'पवन'), w], [T2('Rain so far', 'अब तक वर्षा'), `${S.rainmm} mm`]],
          ex: c.region === 'india' ? T2('In India the India Meteorological Department (IMD) runs weather stations like this one across the country.', 'भारत में भारत मौसम विज्ञान विभाग (IMD) पूरे देश में ऐसे मौसम केंद्र चलाता है।') : T2('Weather stations around the world share their readings through the World Meteorological Organization.', 'दुनिया भर के मौसम केंद्र विश्व मौसम विज्ञान संगठन के ज़रिए अपने आँकड़े साझा करते हैं।') });
      },
      destroy() { if (stopLoop) stopLoop(); },
    };
  };

  // ================================================================ winds
  const WIND = {
    'polar-high': { n: T2('Polar high', 'ध्रुवीय उच्च दाब'), lat: 90, kind: 'H', about: T2('At the poles very cold, heavy air sinks, making high pressure.', 'ध्रुवों पर बहुत ठंडी, भारी हवा नीचे बैठती है और उच्च दाब बनाती है।') },
    'polar-easterlies': { n: T2('Polar easterlies', 'ध्रुवीय पूर्वी पवनें'), lat: 75, kind: 'W', about: T2('Cold winds blowing from the polar highs towards the subpolar lows, turned so that they come from the east.', 'ध्रुवीय उच्च दाब से उप-ध्रुवीय निम्न दाब की ओर बहने वाली ठंडी पवनें, जो मुड़कर पूर्व से आती हैं।') },
    'subpolar-low': { n: T2('Subpolar low', 'उप-ध्रुवीय निम्न दाब'), lat: 60, kind: 'L', about: T2('Around 60° the warm westerlies meet cold polar air and rise: low pressure and stormy weather.', 'लगभग 60° पर गर्म पछुआ पवनें ठंडी ध्रुवीय हवा से मिलकर ऊपर उठती हैं: निम्न दाब और तूफ़ानी मौसम।') },
    westerlies: { n: T2('Westerlies', 'पछुआ पवनें'), lat: 45, kind: 'W', about: T2('Blow from the subtropical highs towards the subpolar lows: from the south-west in the Northern Hemisphere and the north-west in the Southern. Over the open southern oceans they are very strong: the Roaring Forties.', 'उपोष्ण उच्च दाब से उप-ध्रुवीय निम्न दाब की ओर बहती हैं: उत्तरी गोलार्ध में दक्षिण-पश्चिम से और दक्षिणी गोलार्ध में उत्तर-पश्चिम से। दक्षिणी महासागरों पर ये बहुत तेज़ होती हैं: गरजती चालीसा।') },
    'subtropical-high': { n: T2('Subtropical high', 'उपोष्ण उच्च दाब'), lat: 30, kind: 'H', about: T2('Around 30° the air that rose at the equator sinks: high pressure and dry, clear skies. Many great deserts lie here, like the Sahara and the Thar. Sailors called these calm belts the horse latitudes.', 'लगभग 30° पर भूमध्य रेखा पर उठी हवा नीचे बैठती है: उच्च दाब और सूखा, साफ़ आसमान। सहारा और थार जैसे कई बड़े मरुस्थल यहीं हैं। नाविक इन शांत पेटियों को अश्व अक्षांश कहते थे।') },
    'trade-winds': { n: T2('Trade winds', 'व्यापारिक पवनें'), lat: 15, kind: 'W', about: T2('Steady winds blowing from the subtropical highs towards the equator: from the north-east in the Northern Hemisphere and the south-east in the Southern.', 'उपोष्ण उच्च दाब से भूमध्य रेखा की ओर बहने वाली स्थिर पवनें: उत्तरी गोलार्ध में उत्तर-पूर्व से और दक्षिणी में दक्षिण-पूर्व से।') },
    'equatorial-low': { n: T2('Equatorial low', 'भूमध्यरेखीय निम्न दाब'), lat: 0, kind: 'L', about: T2('The Sun heats the equator most; hot air rises and leaves low pressure. Winds here are weak and calm (the doldrums). This is where the trade winds meet (the ITCZ).', 'सूर्य भूमध्य रेखा को सबसे ज़्यादा गर्म करता है; गर्म हवा ऊपर उठती है और निम्न दाब छोड़ती है। यहाँ पवनें कमज़ोर और शांत होती हैं (डोलड्रम)। यहीं व्यापारिक पवनें मिलती हैं (ITCZ)।') },
  };
  const WIND_IDS = Object.keys(WIND);
  const LOCALW = {
    loo: { n: T2('Loo', 'लू'), about: T2('Hot, dry, strong winds that blow in the afternoon over the northern plains of India in May and June. They can cause heatstroke.', 'मई और जून में दोपहर को उत्तर भारत के मैदानों पर चलने वाली गर्म, सूखी, तेज़ हवाएँ। इनसे लू लग सकती है।') },
    'kal-baisakhi': { n: T2('Kal Baisakhi', 'काल बैसाखी'), about: T2('Violent evening thunderstorms with strong winds and rain in West Bengal and Assam in April and May. The name means ‘the calamity of the month of Baisakh’.', 'अप्रैल और मई में पश्चिम बंगाल और असम में तेज़ हवा और वर्षा वाले प्रचंड शाम के तूफ़ान। नाम का अर्थ है ‘बैसाख महीने की विपदा’।') },
    'mango-showers': { n: T2('Mango showers', 'आम्र वर्षा'), about: T2('Pre-monsoon showers in Kerala and coastal Karnataka at the end of summer; they help the mangoes ripen early.', 'गर्मियों के अंत में केरल और तटीय कर्नाटक में मानसून से पहले की बौछारें; ये आमों को जल्दी पकने में मदद करती हैं।') },
  };
  const LOCALW_IDS = Object.keys(LOCALW);
  const MONTHN = [T2('January', 'जनवरी'), T2('February', 'फ़रवरी'), T2('March', 'मार्च'), T2('April', 'अप्रैल'), T2('May', 'मई'), T2('June', 'जून'), T2('July', 'जुलाई'), T2('August', 'अगस्त'), T2('September', 'सितंबर'), T2('October', 'अक्टूबर'), T2('November', 'नवंबर'), T2('December', 'दिसंबर')];
  IMPL.winds = (c) => {
    const S = { cor: true, coast: false, month: 4, hour: 14, sel: null, breeze: null };
    const india = c.region === 'india';
    let stopLoop = null;
    const CX = 196, CY = 220, R = 186;
    const shift = () => 5 * Math.sin((2 * Math.PI * (S.month - 4)) / 12);
    const yOf = (lat) => CY - R * Math.sin(clamp(lat, -90, 90) * DEG);
    const landT = (h) => 27 + 7 * Math.sin((2 * Math.PI * (h - 9)) / 24), seaT = (h) => 27 + Math.sin((2 * Math.PI * (h - 11)) / 24);
    function breeze() { const d = landT(S.hour) - seaT(S.hour); return Math.abs(d) < 1 ? 'calm' : d > 0 ? 'sea-breeze' : 'land-breeze'; }
    function setBreeze() { const b = breeze(); if (b !== S.breeze) { S.breeze = b; if (b !== 'calm') c.reveal(b); } }
    // one wind arrow direction: in the north (sgn 1) or the south (−1), for a wind zone
    function dirOf(zone, sgn) {
      if (!S.cor) return zone === 'westerlies' ? [0, -sgn] : [0, sgn];
      if (zone === 'trade-winds') return [-0.85, 0.55 * sgn];
      if (zone === 'westerlies') return [0.85, -0.55 * sgn];
      return [-0.85, 0.55 * sgn];
    }
    function planet() {
      const id = c.id, s = shift();
      const belts = ['equatorial-low', 'subtropical-high', 'subpolar-low', 'polar-high'].map((b) => {
        const B = WIND[b], lats = b === 'equatorial-low' ? [0] : b === 'polar-high' ? [84, -84] : [B.lat, -B.lat];
        return lats.map((la) => { const L0 = la === 0 || Math.abs(la) < 89 ? la + s : la; const y1 = yOf(L0 + 5), y2 = yOf(L0 - 5); return `<rect x="0" y="${r1(y1)}" width="600" height="${r1(y2 - y1)}" fill="${B.kind === 'L' ? '#FF6B57' : '#3B6EEA'}" opacity="${S.sel === b ? 0.6 : 0.33}"/>${b === 'polar-high' ? '' : `<text x="${r1(CX - R * Math.cos(L0 * DEG) * 0.55)}" y="${r1(yOf(L0) + 8)}" class="ea-lbl big" text-anchor="middle">${B.kind}</text>`}`; }).join('');
      }).join('');
      const arrows = ['trade-winds', 'westerlies', 'polar-easterlies'].map((z) => [1, -1].map((sg) => {
        const la = (WIND[z].lat + (z === 'polar-easterlies' ? -2 : 0)) * sg + s, y = yOf(la), half = R * Math.cos(la * DEG);
        const [dx, dy] = dirOf(z, sg);
        return (z === 'polar-easterlies' ? [-0.3, 0.3] : [-0.5, 0, 0.5]).map((f) => { const x = CX + f * half * 1.1, L0 = z === 'polar-easterlies' ? 20 : 30; return arr(x - (dx * L0) / 2, y - (dy * L0) / 2, x + (dx * L0) / 2, y + (dy * L0) / 2, S.sel === z ? '#FFD23F' : '#FFFFFF', 4, 11); }).join('');
      }).join('')).join('');
      const rows = WIND_IDS.map((w, i) => { const y = 34 + i * 54, la = WIND[w].lat + (WIND[w].lat < 89 ? s : 0), px = CX + R * Math.cos(la * DEG), py = yOf(la); return `<path d="M${r1(px)} ${r1(py)}L404 ${y + 20}" stroke="#fff" stroke-width="1.5" opacity=".6"/>` + pill('layer:' + w, 404, y, 190, c.t(WIND[w].n), WIND[w].kind === 'L' ? '#FF6B57' : WIND[w].kind === 'H' ? '#3B6EEA' : '#FFFFFF', S.sel === w, null, 38); }).join('');
      return `<defs><radialGradient id="${id}-g" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#5EC2FF"/><stop offset=".7" stop-color="#1D6FD8"/><stop offset="1" stop-color="#0B2E78"/></radialGradient><clipPath id="${id}-c"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath></defs>
        <rect width="600" height="440" fill="#071029"/>${stars(600, 440, 40, 21)}
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${id}-g)"/>
        <g clip-path="url(#${id}-c)">${belts}${[0, 30, 60, -30, -60].map((la) => `<line x1="0" x2="600" y1="${r1(yOf(la))}" y2="${r1(yOf(la))}" stroke="#fff" stroke-width="1" opacity=".35" stroke-dasharray="4 6"/>`).join('')}${arrows}<g id="${id}-fx"></g></g>
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#7FD3FF" stroke-opacity=".4" stroke-width="3"/>
        ${[0, 30, 60, -30, -60].map((la) => lbl(CX - R * Math.cos(la * DEG) + 8, yOf(la) - 4, Math.abs(la) + '°', 'start', 'sm')).join('')}
        ${lbl(CX, 14, c.t(T2('N', 'उ')), 'middle', 'sm')}${lbl(CX, 434, c.t(T2('S', 'द')), 'middle', 'sm')}
        ${rows}`;
    }
    function coast() {
      const id = c.id, h = S.hour, day = h >= 6 && h < 18, lT = landT(h), sT = seaT(h), d = lT - sT, b = breeze();
      const sp = clamp(Math.abs(d) * 1.6, 0, 20), dir = d > 0 ? 1 : -1;
      const sunX = 60 + ((h - 6) / 12) * 480, sunY = 90 - Math.sin(clamp((h - 6) / 12, 0, 1) * Math.PI) * 50;
      const flow = b === 'calm' ? '' : `${arr(300 - dir * 120, 270, 300 + dir * 120, 270, '#FFFFFF', 6, 18, 'class="ea-flow"')}${arr(300 + dir * 120, 130, 300 - dir * 120, 130, 'rgba(255,255,255,.6)', 4, 14)}<path d="M${300 + dir * 140} 262V140M${300 - dir * 140} 140V262" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-dasharray="6 6"/>`;
      return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#4FA8EE' : '#0B1A44'}"/><stop offset="1" stop-color="${day ? '#CFEFFF' : '#28407A'}"/></linearGradient></defs>
        <rect width="600" height="440" fill="url(#${id}-sky)"/>${day ? `<circle cx="${r1(sunX)}" cy="${r1(sunY)}" r="26" fill="#FFD23F"/>` : stars(600, 220, 40, 5) + '<circle cx="500" cy="60" r="20" fill="#F1F5F9"/><circle cx="510" cy="54" r="18" fill="#0B1A44"/>'}
        <rect y="300" width="300" height="140" fill="#1F7BD8"/><path d="M0 300q20-6 40 0t40 0t40 0t40 0t40 0t40 0t40 0" stroke="#9FD3FF" stroke-width="3" fill="none"/>
        <path d="M290 300Q300 290 320 288H600V440H290Z" fill="#D9B77E"/><rect x="340" y="288" width="260" height="152" fill="#6CA34D"/>
        ${[420, 500].map((x) => `<rect x="${x}" y="246" width="44" height="42" fill="#FFE7B8" stroke="#7A4E26"/><path d="M${x - 6} 246l28-22 28 22z" fill="#C2410C"/>`).join('')}<rect x="372" y="236" width="6" height="52" fill="#7A4E26"/><circle cx="375" cy="230" r="18" fill="#2E8B3E"/>
        ${flow}
        <text x="150" y="${d < 0 ? 100 : 230}" class="ea-lbl big" text-anchor="middle">${d < 0 ? 'L' : b === 'calm' ? '' : 'H'}</text><text x="470" y="${d > 0 ? 100 : 230}" class="ea-lbl big" text-anchor="middle">${d > 0 ? 'L' : b === 'calm' ? '' : 'H'}</text>
        ${lbl(150, 340, c.t(T2('sea', 'समुद्र')) + ` ${num(sT, 1)} °C`, 'middle')}${lbl(470, 340, c.t(T2('land', 'स्थल')) + ` ${num(lT, 1)} °C`, 'middle')}
        ${lbl(300, 410, b === 'calm' ? c.t(T2('Almost calm', 'लगभग शांत')) : b === 'sea-breeze' ? c.t(T2('Sea breeze', 'समुद्री समीर')) + ` · ${num(sp)} ${c.t(T2('km/h', 'किमी/घंटा'))}` : c.t(T2('Land breeze', 'स्थलीय समीर')) + ` · ${num(sp)} ${c.t(T2('km/h', 'किमी/घंटा'))}`, 'middle', 'big')}
        ${lbl(300, 30, `${String(h).padStart(2, '0')}:00`, 'middle', 'big')}`;
    }
    return {
      view: [600, 440], label: T2('Winds', 'पवनें'),
      chips: () => WIND_IDS.map((w) => ({ id: w, n: WIND[w].n })).concat([{ id: 'sea-breeze', n: T2('Sea breeze', 'समुद्री समीर') }, { id: 'land-breeze', n: T2('Land breeze', 'स्थलीय समीर') }]),
      controls: () => `<div class="ea-row">${c.btn('toggle:coriolis', T2('Earth spinning (Coriolis effect)', 'घूमती पृथ्वी (कोरिऑलिस प्रभाव)'))}${c.btn('toggle:coast', T2('Sea and land breeze', 'समुद्री और स्थलीय समीर'))}</div>` + c.slider('month', T2('Month (belts follow the Sun)', 'महीना (पेटियाँ सूर्य के साथ खिसकती हैं)'), 1, 12, 1) + c.slider('hour', T2('Time of day at the coast', 'तट पर दिन का समय'), 0, 23, 1)
        + (india ? `<div class="ea-row-t">${esc(c.t(T2('Local winds of India', 'भारत की स्थानीय पवनें')))}</div><div class="ea-row">${LOCALW_IDS.map((w) => c.btn('layer:' + w, LOCALW[w].n)).join('')}</div>` : ''),
      val: (n) => (n === 'month' ? S.month : S.hour),
      fmt: (n) => (n === 'month' ? c.t(MONTHN[S.month - 1]) : `${String(S.hour).padStart(2, '0')}:00`),
      slide(n, v) { if (n === 'month') { S.month = v; S.coast = false; } else { S.hour = v; S.coast = true; setBreeze(); } },
      pressed: (k) => (k === 'toggle:coriolis' ? S.cor : k === 'toggle:coast' ? S.coast : k.startsWith('layer:') && LOCALW[k.slice(6)] ? S.sel === k.slice(6) : null),
      act(key) {
        if (key === 'toggle:coriolis') { S.cor = !S.cor; S.coast = false; c.say(S.cor ? T2('The spinning Earth turns the winds.', 'घूमती पृथ्वी पवनों को मोड़ती है।') : T2('Without spin, winds would blow straight from high to low pressure.', 'घूर्णन के बिना पवनें सीधी उच्च से निम्न दाब की ओर बहतीं।')); return; }
        if (key === 'toggle:coast') { S.coast = !S.coast; if (S.coast) setBreeze(); return; }
        const w = key.slice(6); S.sel = w; if (WIND[w]) S.coast = false;
        c.say(WIND[w] ? WIND[w].n : LOCALW[w].n); c.reveal(w);
      },
      start() { stopLoop = c.loop((dt, now) => { if (S.coast) return; const g = c.fx(); if (!g) return; const s = shift(); let h = ''; ['trade-winds', 'westerlies', 'polar-easterlies'].forEach((z) => [1, -1].forEach((sg) => { const la = WIND[z].lat * sg + s, y = yOf(la), half = R * Math.cos(la * DEG), [dx, dy] = dirOf(z, sg); for (let i = 0; i < 4; i++) { const ph = (now * 0.35 + i / 4 + (z.length % 3) * 0.1) % 1, x0 = CX + (ph * 2 - 1) * half * 0.95 * (dx >= 0 ? 1 : -1) * (dx === 0 ? 0 : 1) + (dx === 0 ? (i - 1.5) * half * 0.4 : 0), y0 = y + (dx === 0 ? (ph - 0.5) * 50 * dy : dy * (ph - 0.5) * 30); h += `<circle cx="${r1(x0)}" cy="${r1(y0)}" r="3" fill="#fff" opacity="${r1(0.8 * Math.sin(Math.PI * ph))}"/>`; } })); g.innerHTML = h; }); },
      scene() { return S.coast ? coast() : planet(); },
      panel() {
        if (S.coast) { const b = breeze(); return c.card({ title: b === 'land-breeze' ? T2('Land breeze', 'स्थलीय समीर') : b === 'sea-breeze' ? T2('Sea breeze', 'समुद्री समीर') : T2('Almost calm', 'लगभग शांत'), dot: '#3B82F6', paras: [T2('Land heats up and cools down faster than water. By day the land is warmer: air over it rises, pressure falls, and cool air flows in from the sea (sea breeze). At night the land is cooler, so the breeze blows from the land to the sea (land breeze).', 'स्थल पानी से जल्दी गर्म और जल्दी ठंडा होता है। दिन में स्थल गर्म होता है: उसके ऊपर हवा उठती है, दाब घटता है और समुद्र से ठंडी हवा आती है (समुद्री समीर)। रात में स्थल ठंडा होता है, इसलिए हवा स्थल से समुद्र की ओर बहती है (स्थलीय समीर)।')], facts: [[T2('Land', 'स्थल'), `${num(landT(S.hour), 1)} °C`], [T2('Sea', 'समुद्र'), `${num(seaT(S.hour), 1)} °C`], [T2('Wind blows', 'पवन बहती है'), T2('from cooler to warmer (high to low pressure)', 'ठंडे से गर्म की ओर (उच्च से निम्न दाब)')]], ex: T2('Temperatures here are a model of a sunny coastal day.', 'यहाँ तापमान धूप वाले तटीय दिन का मॉडल हैं।') }); }
        const w = S.sel ? WIND[S.sel] || LOCALW[S.sel] : null;
        return c.card({ title: w ? w.n : T2('Pressure belts and planetary winds', 'दाब पेटियाँ और ग्रहीय पवनें'), dot: '#FF6B57', paras: [w ? w.about : T2('Air sinks where it is cold or crowded (high pressure, H) and rises where it is warm (low pressure, L). Winds blow from high to low pressure.', 'जहाँ हवा ठंडी या घनी होती है वहाँ वह नीचे बैठती है (उच्च दाब, H) और जहाँ गर्म होती है वहाँ उठती है (निम्न दाब, L)। पवनें उच्च से निम्न दाब की ओर बहती हैं।'),
          S.cor ? T2('Because the Earth spins, winds turn to the right in the Northern Hemisphere and to the left in the Southern (the Coriolis effect, Ferrel’s law).', 'पृथ्वी के घूमने से पवनें उत्तरी गोलार्ध में दाईं ओर और दक्षिणी में बाईं ओर मुड़ती हैं (कोरिऑलिस प्रभाव, फ़ेरल का नियम)।') : T2('Spin is switched off: the winds blow straight north or south from high to low pressure. Switch it back on to see the real winds.', 'घूर्णन बंद है: पवनें सीधी उत्तर या दक्षिण में उच्च से निम्न दाब की ओर बहती हैं। असली पवनें देखने के लिए इसे फिर चालू करो।')],
          facts: [[T2('Month', 'महीना'), MONTHN[S.month - 1]], [T2('Belts moved', 'पेटियाँ खिसकीं'), `${num(Math.abs(shift()), 1)}° ${c.t(shift() >= 0 ? T2('north', 'उत्तर') : T2('south', 'दक्षिण'))}`]] });
      },
      destroy() { if (stopLoop) stopLoop(); },
    };
  };

  // ================================================================ monsoon
  // India and its neighbours in [lon, lat] (simplified outline; India's boundary as shown on the Survey of India map).
  const INDIA = [[68.2, 23.6], [68.7, 23.2], [69.35, 22.83], [70.4, 23.0], [70.05, 22.47], [69.08, 22.47], [68.97, 22.24], [69.6, 21.64], [70.37, 20.9], [70.98, 20.7], [71.4, 20.87], [72.15, 21.6], [72.62, 22.3], [72.9, 21.7], [72.8, 21.1], [72.83, 20.41], [72.7, 19.97], [72.82, 18.95], [72.87, 18.64], [73.3, 16.99], [73.47, 16.06], [73.8, 15.5], [74.12, 14.8], [74.55, 13.98], [74.7, 13.35], [74.83, 12.87], [74.99, 12.5], [75.37, 11.87], [75.77, 11.25], [75.92, 10.77], [76.24, 9.96], [76.33, 9.49], [76.6, 8.88], [76.94, 8.49], [77.54, 8.08], [78.0, 8.45], [78.15, 8.79], [78.6, 9.1], [79.0, 9.25], [79.3, 9.28], [79.25, 9.7], [79.86, 10.29], [79.85, 10.77], [79.84, 10.92], [79.77, 11.75], [79.83, 11.93], [80.19, 12.62], [80.29, 13.08], [80.32, 13.42], [80.15, 14.3], [80.1, 15.2], [80.6, 15.8], [81.14, 16.17], [82.25, 16.65], [82.3, 17.0], [83.3, 17.7], [84.1, 18.3], [84.9, 19.25], [85.5, 19.65], [85.83, 19.8], [86.4, 20.0], [86.7, 20.3], [87.0, 20.75], [86.95, 21.45], [87.5, 21.6], [88.1, 21.6], [88.7, 21.55], [89.05, 21.65],
    [89.05, 22.1], [88.95, 22.9], [88.6, 23.4], [88.2, 24.3], [88.45, 25.2], [88.1, 25.6], [88.45, 26.0], [88.2, 26.5], [89.0, 26.3], [89.85, 25.95], [89.85, 25.3], [91.0, 25.15], [92.0, 25.15], [92.4, 24.85], [92.2, 24.4], [91.9, 24.2], [91.4, 24.1], [91.2, 23.6], [91.7, 22.95], [92.2, 23.7], [92.6, 21.95], [93.2, 22.6], [93.4, 24.0], [94.15, 23.85], [94.7, 25.1], [95.2, 26.6], [96.1, 27.25], [97.3, 27.9], [97.4, 28.25], [96.6, 28.8], [96.1, 29.4], [95.3, 29.1], [94.2, 29.25], [93.2, 28.7], [92.0, 27.9], [91.65, 27.8], [92.1, 26.85], [90.5, 26.75], [89.6, 26.75], [88.9, 26.95], [88.75, 27.15], [88.9, 27.6], [88.75, 28.05], [88.1, 27.85], [88.0, 27.4], [88.1, 26.45], [87.0, 26.4], [85.8, 26.6], [85.0, 27.0], [84.1, 27.5], [83.3, 27.4], [82.3, 27.75], [81.2, 28.4], [80.5, 28.65], [80.05, 28.8], [80.25, 29.5], [80.95, 30.2], [80.3, 30.7], [79.3, 31.0], [78.75, 31.6], [78.75, 32.4], [78.4, 32.6], [79.3, 32.6], [79.5, 33.2], [80.0, 34.0], [80.3, 35.2], [79.6, 35.6], [78.0, 35.6], [77.8, 35.5], [76.6, 36.2], [75.5, 36.9], [74.6, 37.08], [73.7, 36.9], [72.6, 36.6], [73.4, 36.0], [73.8, 35.0], [73.6, 34.4], [73.4, 33.7], [74.0, 33.0], [74.6, 32.5], [75.3, 32.2], [74.55, 32.05], [74.57, 31.6], [74.6, 31.1], [74.0, 30.4], [73.4, 29.95], [72.9, 29.0], [71.9, 28.1], [70.7, 27.9], [70.05, 27.1], [69.6, 26.6], [70.15, 26.0], [70.6, 25.7], [70.1, 24.9], [69.0, 24.3], [68.75, 24.3]];
  const SRILANKA = [[80.2, 9.83], [80.9, 8.9], [81.2, 8.5], [81.9, 7.4], [81.7, 6.4], [80.6, 5.92], [80.0, 6.4], [79.85, 8.0], [79.9, 9.5]];
  const NEIGH = [[60, 25.3], [61.6, 25.2], [64, 25.3], [66.6, 25.4], [67, 24.8], [68.2, 23.6], [68.75, 24.3], [69.0, 24.3], [70.1, 24.9], [70.6, 25.7], [70.15, 26.0], [69.6, 26.6], [70.05, 27.1], [70.7, 27.9], [71.9, 28.1], [72.9, 29.0], [73.4, 29.95], [74.0, 30.4], [74.6, 31.1], [74.57, 31.6], [74.55, 32.05], [75.3, 32.2], [74.6, 32.5], [74.0, 33.0], [73.4, 33.7], [73.6, 34.4], [73.8, 35.0], [73.4, 36.0], [72.6, 36.6], [73.7, 36.9], [74.6, 37.08], [75.5, 36.9], [76.6, 36.2], [77.8, 35.5], [78.0, 35.6], [79.6, 35.6], [80.3, 35.2], [80.0, 34.0], [79.5, 33.2], [79.3, 32.6], [78.4, 32.6], [78.75, 32.4], [78.75, 31.6], [79.3, 31.0], [80.3, 30.7], [80.95, 30.2], [80.25, 29.5], [80.05, 28.8], [80.5, 28.65], [81.2, 28.4], [82.3, 27.75], [83.3, 27.4], [84.1, 27.5], [85.0, 27.0], [85.8, 26.6], [87.0, 26.4], [88.1, 26.45], [88.0, 27.4], [88.1, 27.85], [88.75, 28.05], [88.9, 27.6], [88.75, 27.15], [88.9, 26.95], [89.6, 26.75], [90.5, 26.75], [92.1, 26.85], [91.65, 27.8], [92.0, 27.9], [93.2, 28.7], [94.2, 29.25], [95.3, 29.1], [96.1, 29.4], [96.6, 28.8], [97.4, 28.25], [97.3, 27.9], [96.1, 27.25], [95.2, 26.6], [94.7, 25.1], [94.15, 23.85], [93.4, 24.0], [93.2, 22.6], [92.6, 21.95], [92.3, 20.8], [93.6, 19.6], [94.3, 18.8], [94.5, 16.2], [95.4, 15.8], [97.6, 16.5], [98.2, 15.0], [98.6, 12.0], [98.5, 9.0], [100, 8.0], [100, 38], [60, 38]];
  const BANGLA = [[89.05, 21.65], [89.6, 21.9], [90.5, 22.1], [91.8, 22.4], [92.3, 20.8], [92.6, 21.95], [92.2, 23.7], [91.7, 22.95], [91.2, 23.6], [91.4, 24.1], [91.9, 24.2], [92.2, 24.4], [92.4, 24.85], [92.0, 25.15], [91.0, 25.15], [89.85, 25.3], [89.85, 25.95], [89.0, 26.3], [88.2, 26.5], [88.45, 26.0], [88.1, 25.6], [88.45, 25.2], [88.2, 24.3], [88.6, 23.4], [88.95, 22.9], [89.05, 22.1]];
  const MP = (lon, lat) => [r1(16 + (lon - 60) * 14.1), r1(8 + (38 - lat) * 15)];
  const mpath = (pts) => 'M' + pts.map((p) => MP(p[0], p[1]).join(' ')).join('L') + 'Z';
  // Rain areas per month (lon/lat polygons, clipped to the land): 'covered' = monsoon or seasonal rain; 'heavy' = heaviest.
  const RAIN = {
    cover6: [[60, 5], [60, 20.5], [72.8, 20.5], [76, 21.5], [80, 22.5], [83, 24], [85, 26], [88, 27.5], [100, 28.5], [100, 5]],
    cover9: [[60, 5], [60, 22.5], [70.5, 24.5], [73, 27.5], [75, 30.5], [75.5, 38], [100, 38], [100, 5]],
    all: [[60, 2], [60, 38], [100, 38], [100, 2]],
    ghats: [[72.6, 20.5], [74.0, 20.5], [74.6, 16], [75.6, 13], [76.6, 10.6], [77.4, 8.4], [76.7, 8.2], [75.6, 10.6], [74.6, 13], [73.4, 16.4], [72.6, 19]],
    ne: [[89.8, 24.9], [92.5, 24.7], [95.5, 27], [97.5, 28.4], [94, 28.6], [91.5, 27.6], [89.7, 26.4]],
    tn: [[77.4, 8.0], [79.0, 8.8], [80.4, 13.2], [80.3, 15.0], [79.4, 14.6], [78.2, 12.0], [77.0, 9.6]],
    tnheavy: [[78.6, 9.0], [79.4, 9.2], [80.4, 13.2], [80.25, 14.2], [79.6, 12.5], [79.2, 10.6]],
    nw: [[73.4, 29.6], [78.4, 29.2], [80.3, 30.8], [80.3, 36.5], [72.8, 36.8]],
    bengal: [[85.6, 21.2], [89.0, 21.8], [92.0, 24.6], [95.0, 27.6], [89.0, 27.0], [85.6, 24.6]],
    kerala: [[74.8, 12.8], [77.5, 8.1], [76.8, 8.2], [75.6, 10.6], [74.7, 12.6]],
    dry: [[68.2, 23.8], [72.5, 25.0], [74.2, 29.6], [72.0, 29.6], [69.4, 27.0]],
    ladakh: [[75.5, 32.8], [80.4, 32.8], [80.4, 36.4], [75.5, 36.4]],
  };
  const SW = [[63, 6, 50], [66, 10, 60], [62.5, 15, 65], [68, 15.5, 62], [69.2, 19.5, 45], [70.6, 23.5, 30], [72, 3, 20], [80, 3, 30], [77, 16.5, 70], [80.5, 20, 60], [84, 8, 45], [87, 12, 40], [89, 16, 30], [91, 19.5, 15], [91.5, 23, 355], [88, 25.4, 288], [84, 26.2, 290], [80, 27.4, 295], [76.5, 28.9, 300]];
  const NE = [[88, 20, 225], [86, 15, 232], [83, 11.5, 240], [85, 24.5, 235], [79, 25, 228], [75.5, 20, 225], [68, 15, 228], [72, 10, 225], [90, 10, 230]];
  const WD = [[61.5, 32.5, 90], [65.5, 33.2, 85]];
  const LOO = [[71.5, 27.2, 95], [76.5, 26.8, 100], [81.5, 26, 105]];
  const MON = [
    { s: 'cold', w: NE.concat(WD), rain: ['nw', 'tn'], heavy: [], H: [76, 30], L: [80, 4], note: T2('Cold weather season. Cool, dry north-east winds blow from the land towards the sea, so most of India is dry and sunny. Western disturbances from the Mediterranean bring a little rain to Punjab and Haryana (good for wheat) and snow to the Himalaya.', 'शीत ऋतु। ठंडी, सूखी उत्तर-पूर्वी पवनें स्थल से समुद्र की ओर बहती हैं, इसलिए ज़्यादातर भारत सूखा और धूप वाला रहता है। भूमध्य सागर से आने वाले पश्चिमी विक्षोभ पंजाब और हरियाणा में थोड़ी वर्षा (गेहूँ के लिए अच्छी) और हिमालय पर हिमपात लाते हैं।') },
    { s: 'cold', w: NE.concat(WD), rain: ['nw'], heavy: [], H: [76, 30], L: [80, 4], note: T2('Still the cold weather season: clear skies and cool nights in the north, a little winter rain in the north-west.', 'अब भी शीत ऋतु: उत्तर में साफ़ आसमान और ठंडी रातें, उत्तर-पश्चिम में थोड़ी शीतकालीन वर्षा।') },
    { s: 'hot', w: [], rain: [], heavy: [], H: null, L: [73, 25], note: T2('Hot weather season begins. The Sun moves north and north India heats up; a low-pressure area starts to form over the north-west.', 'ग्रीष्म ऋतु शुरू होती है। सूर्य उत्तर की ओर बढ़ता है और उत्तर भारत गर्म होता है; उत्तर-पश्चिम पर निम्न दाब क्षेत्र बनने लगता है।') },
    { s: 'hot', w: LOO.slice(0, 2), rain: ['bengal'], heavy: [], H: null, L: [72, 26], note: T2('Hot and dry in the north. Kal Baisakhi: violent evening thunderstorms bring rain to West Bengal and Assam.', 'उत्तर में गर्म और सूखा। काल बैसाखी: प्रचंड शाम के तूफ़ान पश्चिम बंगाल और असम में वर्षा लाते हैं।') },
    { s: 'hot', w: LOO, rain: ['bengal', 'kerala'], heavy: [], H: null, L: [71, 27], note: T2('The hottest month in the north: the loo blows. The strong low pressure over the north-west will soon pull in moist sea winds. Mango showers fall in Kerala and Karnataka.', 'उत्तर में सबसे गर्म महीना: लू चलती है। उत्तर-पश्चिम का तेज़ निम्न दाब जल्द ही नम समुद्री पवनों को खींचेगा। केरल और कर्नाटक में आम्र वर्षा होती है।') },
    { s: 'sw', w: SW, rain: ['cover6'], heavy: ['ghats', 'ne'], H: [62, 3], L: [71, 27], note: T2('The south-west monsoon reaches Kerala around 1 June with a sudden burst of rain, then moves north. The Arabian Sea branch pours rain on the Western Ghats; the Bay of Bengal branch reaches the north-east, then turns west along the Himalaya.', 'दक्षिण-पश्चिम मानसून लगभग 1 जून को अचानक तेज़ वर्षा के साथ केरल पहुँचता है, फिर उत्तर की ओर बढ़ता है। अरब सागर शाखा पश्चिमी घाट पर वर्षा करती है; बंगाल की खाड़ी शाखा पूर्वोत्तर पहुँचकर हिमालय के साथ पश्चिम की ओर मुड़ती है।') },
    { s: 'sw', w: SW, rain: ['all'], heavy: ['ghats', 'ne'], dry: ['dry', 'ladakh'], H: [62, 3], L: [71, 27], note: T2('By about 8–15 July the monsoon covers all of India. The windward (west) side of the Western Ghats and the hills of the north-east get very heavy rain; land east of the Ghats lies in a rain shadow and gets much less.', 'लगभग 8–15 जुलाई तक मानसून पूरे भारत पर छा जाता है। पश्चिमी घाट का पवनमुखी (पश्चिमी) भाग और पूर्वोत्तर की पहाड़ियाँ बहुत भारी वर्षा पाते हैं; घाट के पूर्व की भूमि वृष्टि-छाया में रहती है और बहुत कम वर्षा पाती है।') },
    { s: 'sw', w: SW, rain: ['all'], heavy: ['ghats', 'ne'], dry: ['dry', 'ladakh'], H: [62, 3], L: [71, 27], note: T2('Rain continues, with ‘breaks’: dry spells of a few days between wet spells. Rivers are full and farmers grow kharif crops such as rice, cotton and maize.', 'वर्षा जारी रहती है, ‘विराम’ के साथ: भीगे दिनों के बीच कुछ दिनों के सूखे अंतराल। नदियाँ भरी होती हैं और किसान चावल, कपास और मक्का जैसी ख़रीफ़ फ़सलें उगाते हैं।') },
    { s: 'sw', w: SW, rain: ['cover9'], heavy: ['ne'], dry: ['ladakh'], H: [62, 3], L: [78, 24], note: T2('The monsoon begins to withdraw from north-west India (west Rajasthan) in the second half of September.', 'सितंबर के दूसरे पखवाड़े में मानसून उत्तर-पश्चिम भारत (पश्चिमी राजस्थान) से लौटने लगता है।') },
    { s: 'retreat', w: NE.slice(0, 4), rain: ['tn'], heavy: [], H: [76, 28], L: [83.5, 12], cyclone: [89, 15.5], note: T2('Retreating monsoon. The winds weaken and turn; skies clear, and the land is hot and humid (‘October heat’). Cyclones form over the Bay of Bengal. The north-east monsoon begins over Tamil Nadu late in the month.', 'लौटता मानसून। पवनें कमज़ोर होकर मुड़ती हैं; आसमान साफ़ होता है और ज़मीन गर्म व उमस भरी होती है (‘क्वार की उमस’)। बंगाल की खाड़ी में चक्रवात बनते हैं। महीने के अंत में तमिलनाडु पर उत्तर-पूर्वी मानसून शुरू होता है।') },
    { s: 'retreat', w: NE, rain: ['tn'], heavy: ['tnheavy'], H: [76, 29], L: [83, 9], cyclone: [87.5, 13.5], note: T2('North-east winds pick up moisture over the Bay of Bengal and bring heavy rain to the Tamil Nadu (Coromandel) coast. Cyclones may strike the east coast.', 'उत्तर-पूर्वी पवनें बंगाल की खाड़ी से नमी लेकर तमिलनाडु (कोरोमंडल) तट पर भारी वर्षा लाती हैं। पूर्वी तट पर चक्रवात आ सकते हैं।') },
    { s: 'cold', w: NE.concat(WD), rain: ['tn', 'nw'], heavy: [], H: [76, 30], L: [80, 4], note: T2('Cold weather sets in over the north. Tamil Nadu still gets north-east monsoon rain.', 'उत्तर में शीत ऋतु आ जाती है। तमिलनाडु में अब भी उत्तर-पूर्वी मानसून की वर्षा होती है।') },
  ];
  const SEASON = { cold: T2('Cold weather season', 'शीत ऋतु'), hot: T2('Hot weather season', 'ग्रीष्म ऋतु'), sw: T2('South-west monsoon season', 'दक्षिण-पश्चिम मानसून ऋतु'), retreat: T2('Retreating monsoon season', 'लौटते मानसून की ऋतु') };
  const SEASON_ID = { cold: 'cold-weather', hot: 'hot-weather', sw: 'south-west-monsoon', retreat: 'retreating-monsoon' };
  const MPLACE = {
    'western-ghats': { n: T2('Western Ghats', 'पश्चिमी घाट'), about: T2('A wall of hills along the west coast. Moist monsoon winds are forced up their western slopes, cool and drop very heavy rain; the eastern side gets little (a rain shadow).', 'पश्चिमी तट के साथ पहाड़ियों की दीवार। नम मानसूनी पवनें इनकी पश्चिमी ढलानों पर ऊपर उठने को मजबूर होती हैं, ठंडी होकर बहुत भारी वर्षा करती हैं; पूर्वी भाग में कम वर्षा होती है (वृष्टि-छाया)।') },
    himalaya: { n: T2('Himalaya', 'हिमालय'), about: T2('The great wall in the north stops the monsoon winds from escaping, so they turn west and rain over the northern plains. In winter it blocks the freezing winds of Central Asia.', 'उत्तर की यह विशाल दीवार मानसूनी पवनों को आगे नहीं जाने देती, इसलिए वे पश्चिम की ओर मुड़कर उत्तरी मैदानों पर बरसती हैं। सर्दियों में यह मध्य एशिया की बर्फ़ीली हवाओं को रोकती है।') },
    thar: { n: T2('Thar Desert', 'थार मरुस्थल'), about: T2('In May the Thar and the north-west get very hot, making strong low pressure that pulls the moist sea winds towards India. Little rain falls here: the winds run parallel to the Aravalli hills and are not pushed up.', 'मई में थार और उत्तर-पश्चिम बहुत गर्म हो जाते हैं, जिससे तेज़ निम्न दाब बनता है जो नम समुद्री पवनों को भारत की ओर खींचता है। यहाँ कम वर्षा होती है: पवनें अरावली के समानांतर बहती हैं और ऊपर नहीं उठतीं।') },
  };
  IMPL.monsoon = (c) => {
    const S = { m: 6, sel: null, seen: new Set() };
    function enter() { const d = MON[S.m - 1]; const sid = SEASON_ID[d.s]; c.reveal(sid); if (d.s === 'sw') c.emit('rained'); }
    const windArrow = ([lon, lat, h], k) => { const [x, y] = MP(lon, lat), L0 = 40, dx = Math.sin(h * DEG) * L0, dy = -Math.cos(h * DEG) * L0; return `<g class="ea-gust" style="animation-delay:${-(k % 6) * 0.25}s">${arr(x - dx / 2, y - dy / 2, x + dx / 2, y + dy / 2, 'rgba(6,18,51,.55)', 9, 17)}${arr(x - dx / 2, y - dy / 2, x + dx / 2, y + dy / 2, '#FFFFFF', 5, 14)}</g>`; };
    return {
      view: [600, 560], label: T2('Map of India with winds and rain', 'पवनों और वर्षा के साथ भारत का मानचित्र'),
      chips: () => ['cold', 'hot', 'sw', 'retreat'].map((s) => ({ id: SEASON_ID[s], n: SEASON[s] })),
      controls: () => c.slider('month', T2('Month', 'महीना'), 1, 12, 1) + `<div class="ea-row">${c.btn('play', T2('Play the whole year', 'पूरा साल चलाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l12 8-12 8z" fill="#1E293B"/></svg>')}${Object.keys(MPLACE).map((p) => c.btn('layer:' + p, MPLACE[p].n)).join('')}</div>`,
      val: () => S.m, fmt: () => c.t(MONTHN[S.m - 1]),
      slide(n, v) { if (v !== S.m) { S.m = v; S.sel = null; enter(); } },
      pressed: (k) => (k.startsWith('layer:') ? S.sel === k.slice(6) : null),
      act(key) {
        if (key === 'play') {
          c.busy = true; let m = 0; c.rec(T2('Played the monsoon year', 'मानसून का साल चलाया'));
          const step = () => { m++; if (m > 12) { c.busy = false; c.emit('cycle-done'); c.refresh(); return; } S.m = m; S.sel = null; enter(); c.refresh(); c.run(1300, () => {}, step); };
          step(); return;
        }
        const p = key.slice(6); S.sel = S.sel === p ? null : p; if (S.sel) { c.say(MPLACE[p].n); c.reveal(p); }
      },
      scene() {
        const id = c.id, d = MON[S.m - 1];
        const poly2 = (k) => mpath(RAIN[k]);
        const rain = d.rain.map((k) => `<path d="${poly2(k)}" fill="url(#${id}-rain)"/>`).join('') + d.heavy.map((k) => `<path d="${poly2(k)}" fill="#1D4ED8" opacity=".7"/>`).join('') + (d.dry || []).map((k) => `<path d="${poly2(k)}" fill="#F2D49B" opacity=".75"/>`).join('');
        const press = (p, k) => { if (!p) return ''; const [x, y] = MP(p[0], p[1]); return `<circle cx="${x}" cy="${y}" r="22" fill="${k === 'H' ? '#3B6EEA' : '#FF6B57'}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 9}" text-anchor="middle" class="ea-lbl big">${k}</text>`; };
        const cyc = d.cyclone ? (() => { const [x, y] = MP(d.cyclone[0], d.cyclone[1]); return `<g transform="translate(${x} ${y})"><g class="ea-spin" style="animation-duration:3s"><path d="M0 -18a18 18 0 0 1 18 18M0 18a18 18 0 0 1 -18 -18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle r="6" fill="#fff"/></g></g>${lbl(x, y + 40, c.t(T2('cyclone', 'चक्रवात')), 'middle', 'sm')}`; })() : '';
        const ghats = [[73.1, 20.5], [73.6, 17.5], [74.0, 15.5], [74.8, 13.5], [75.6, 11.8], [76.8, 10.2], [77.2, 8.6]];
        const him = [[73.5, 34.8], [75.5, 33.6], [77.5, 32.5], [79.5, 30.8], [81.5, 29.6], [84, 28.4], [86.5, 27.9], [88.6, 27.7], [91, 27.6], [93.5, 28.2], [95.5, 28.6]];
        const sel = (p) => S.sel === p;
        const kb = S.m === 4 || S.m === 5 ? (() => { const [x, y] = MP(89.5, 24); return `<path d="M${x - 8} ${y - 14}l10 0-6 10 10 0-16 18 4-12-8 0z" fill="#FFD23F" stroke="#1E293B"/>`; })() : '';
        return `<defs><linearGradient id="${id}-sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A86DA"/><stop offset="1" stop-color="#0B3D91"/></linearGradient>
          <pattern id="${id}-rain" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><rect width="14" height="14" fill="#3B82F6" opacity=".45"/><line x1="4" y1="0" x2="4" y2="8" stroke="#DBEAFE" stroke-width="2"/></pattern>
          <clipPath id="${id}-in"><path d="${mpath(INDIA)}"/><path d="${mpath(SRILANKA)}"/></clipPath></defs>
          <rect width="600" height="560" fill="url(#${id}-sea)"/>
          <path d="${mpath(NEIGH)}" fill="#C7B99A" opacity=".55"/><path d="${mpath(BANGLA)}" fill="#C7B99A" opacity=".55"/><path d="${mpath(SRILANKA)}" fill="#C7B99A" opacity=".8"/>
          <path d="${mpath(INDIA)}" fill="#8CC56A" stroke="#F8FAFC" stroke-width="2.5" stroke-linejoin="round"/>
          ${hot('layer:thar', c.t(MPLACE.thar.n), `<path d="${mpath([[69.2, 26.2], [70.5, 24.6], [72.6, 25.3], [74.2, 28.6], [72.6, 29.6], [70.6, 28.0]])}" fill="#E8C98A" ${sel('thar') ? 'stroke="#FFD23F" stroke-width="4"' : 'opacity=".95"'}/>`)}
          <g clip-path="url(#${id}-in)">${rain}</g>
          ${hot('layer:western-ghats', c.t(MPLACE['western-ghats'].n), `<path d="${line(ghats.map((p) => MP(p[0], p[1])))}" stroke="${sel('western-ghats') ? '#FFD23F' : '#6B4A2F'}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="2 9"/><path d="${line(ghats.map((p) => MP(p[0], p[1])))}" stroke="rgba(255,255,255,.01)" stroke-width="30" fill="none"/>`)}
          ${hot('layer:himalaya', c.t(MPLACE.himalaya.n), `<path d="${line(him.map((p) => MP(p[0], p[1])))}" stroke="${sel('himalaya') ? '#FFD23F' : '#F8FAFC'}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="3 10"/><path d="${line(him.map((p) => MP(p[0], p[1])))}" stroke="rgba(255,255,255,.01)" stroke-width="30" fill="none"/>`)}
          ${[[72.6, 11.0], [72.2, 11.9], [73.0, 10.2]].map((p) => `<circle cx="${MP(p[0], p[1])[0]}" cy="${MP(p[0], p[1])[1]}" r="2.5" fill="#8CC56A"/>`).join('')}${[[92.7, 11.6], [92.9, 12.5], [92.8, 13.3], [93.8, 7.1], [92.9, 8.2], [93.6, 9.2]].map((p) => `<ellipse cx="${MP(p[0], p[1])[0]}" cy="${MP(p[0], p[1])[1]}" rx="3" ry="6" fill="#8CC56A"/>`).join('')}
          ${press(d.H, 'H')}${press(d.L, 'L')}
          ${d.w.map(windArrow).join('')}${cyc}${kb}
          ${lbl(MP(65.5, 13)[0], MP(65.5, 13)[1], c.t(T2('Arabian Sea', 'अरब सागर')), 'middle', '', 20)}${lbl(MP(88.6, 19.2)[0], MP(88.6, 19.2)[1], c.t(T2('Bay of Bengal', 'बंगाल की खाड़ी')), 'middle', '', 20)}${lbl(MP(88, 4)[0], MP(88, 4)[1], c.t(T2('Indian Ocean', 'हिंद महासागर')), 'middle', '', 20)}
          <g transform="translate(14 14)"><rect width="196" height="62" rx="14" fill="rgba(6,18,51,.72)"/><text x="14" y="28" class="ea-lbl big" text-anchor="start">${esc(c.t(MONTHN[S.m - 1]))}</text><text x="14" y="50" class="ea-lbl sm" text-anchor="start">${esc(c.t(SEASON[d.s]))}</text></g>
          <g transform="translate(336 12)"><rect width="250" height="62" rx="12" fill="rgba(6,18,51,.72)"/><rect x="12" y="12" width="18" height="14" fill="url(#${id}-rain)"/><text x="38" y="24" class="ea-lbl sm" text-anchor="start">${esc(c.t(T2('rain', 'वर्षा')))}</text><rect x="100" y="12" width="18" height="14" fill="#1D4ED8"/><text x="126" y="24" class="ea-lbl sm" text-anchor="start">${esc(c.t(T2('heavy rain', 'भारी वर्षा')))}</text>${arr(14, 46, 44, 46, '#fff', 4, 10)}<text x="52" y="51" class="ea-lbl sm" text-anchor="start">${esc(c.t(T2('wind', 'पवन')))}</text><text x="120" y="51" class="ea-lbl sm" text-anchor="start">${esc(c.t(T2('outline simplified', 'रेखा सरलीकृत')))}</text></g>`;
      },
      panel() {
        const d = MON[S.m - 1];
        if (S.sel) return c.card({ title: MPLACE[S.sel].n, dot: '#6B4A2F', paras: [MPLACE[S.sel].about] });
        return c.card({ title: T2(`${MONTHN[S.m - 1].en}: ${SEASON[d.s].en}`, `${MONTHN[S.m - 1].hi}: ${SEASON[d.s].hi}`), dot: d.s === 'sw' ? '#1D4ED8' : d.s === 'hot' ? '#FF7A1A' : d.s === 'cold' ? '#7FD3FF' : '#14B8A6', paras: [d.note, S.m === 6 ? T2('Why it comes: in summer the land heats much more than the sea, so low pressure forms over north-west India and high pressure over the Indian Ocean. Moist winds blow from sea to land, turned by the Earth’s spin into south-west winds.', 'यह क्यों आता है: गर्मियों में स्थल समुद्र से बहुत ज़्यादा गर्म होता है, इसलिए उत्तर-पश्चिम भारत पर निम्न दाब और हिंद महासागर पर उच्च दाब बनता है। नम पवनें समुद्र से स्थल की ओर बहती हैं, जिन्हें पृथ्वी का घूर्णन मोड़कर दक्षिण-पश्चिमी बना देता है।') : null],
          ex: c.region === 'world' ? T2('Monsoons, winds that reverse with the seasons, also blow over South-East Asia, northern Australia and West Africa. They follow the yearly shift of the ITCZ, the belt where the trade winds meet.', 'मानसून, यानी ऋतु के साथ दिशा बदलने वाली पवनें, दक्षिण-पूर्व एशिया, उत्तरी ऑस्ट्रेलिया और पश्चिम अफ़्रीका पर भी बहती हैं। ये ITCZ, यानी व्यापारिक पवनों के मिलन-पेटी, के सालाना खिसकने के साथ चलती हैं।') : T2('India gets about three-quarters of its yearly rain from the south-west monsoon, June to September.', 'भारत को अपनी सालाना वर्षा का लगभग तीन-चौथाई भाग जून से सितंबर तक दक्षिण-पश्चिम मानसून से मिलता है।'),
          facts: [[T2('Winds blow', 'पवनें बहती हैं'), d.s === 'sw' ? T2('from the south-west, sea to land', 'दक्षिण-पश्चिम से, समुद्र से स्थल की ओर') : d.s === 'hot' ? T2('hot and dry over the land (loo)', 'स्थल पर गर्म और सूखी (लू)') : T2('from the north-east, land to sea', 'उत्तर-पूर्व से, स्थल से समुद्र की ओर')]] });
      },
    };
  };

  // ================================================================ erosion
  const AGENT = {
    river: { n: T2('River', 'नदी'), span: 500, unit: T2('years', 'वर्ष'), forms: [['meander', 15], ['ox-bow-lake', 70]],
      about: T2('On flat plains a river swings from side to side. It wears away (erodes) the outer bank of each bend, where water flows fastest, and drops sand on the inner bank. The bends grow into loops called meanders. One day the river cuts across the narrow neck of a loop and leaves it behind as an ox-bow lake.', 'समतल मैदानों में नदी इधर-उधर लहराती है। हर मोड़ के बाहरी किनारे को, जहाँ पानी सबसे तेज़ बहता है, यह काटती (अपरदन करती) है और अंदरूनी किनारे पर रेत जमा करती है। मोड़ बढ़कर विसर्प बनते हैं। एक दिन नदी किसी फंदे की पतली गर्दन काटकर निकल जाती है और उसे गोखुर झील के रूप में पीछे छोड़ देती है।'),
      india: T2('The Ganga and the Brahmaputra meander across their plains and leave many ox-bow lakes in Bihar and Assam.', 'गंगा और ब्रह्मपुत्र अपने मैदानों में विसर्प बनाती हैं और बिहार व असम में कई गोखुर झीलें छोड़ती हैं।'), world: T2('The Mississippi in the USA has some of the world’s best-known meanders and ox-bow lakes.', 'अमेरिका की मिसिसिपी नदी के विसर्प और गोखुर झीलें दुनिया में सबसे प्रसिद्ध हैं।') },
    sea: { n: T2('Sea waves', 'समुद्री लहरें'), span: 10000, unit: T2('years', 'वर्ष'), forms: [['sea-cave', 20], ['sea-arch', 45], ['sea-stack', 75]],
      about: T2('Waves crash against a rocky headland and attack its weak spots. A hollow becomes a sea cave; caves on both sides meet to make a sea arch; when the roof of the arch falls in, a pillar of rock is left standing: a sea stack. The cliff keeps moving back.', 'लहरें चट्टानी अंतरीप से टकराकर उसके कमज़ोर हिस्सों पर वार करती हैं। खोखला भाग समुद्री गुफा बनता है; दोनों ओर की गुफाएँ मिलकर समुद्री मेहराब बनाती हैं; मेहराब की छत गिरने पर चट्टान का खंभा खड़ा रह जाता है: समुद्री स्तंभ। तट की चट्टान पीछे खिसकती रहती है।'),
      india: T2('The Varkala cliffs in Kerala are sea cliffs cut by the waves of the Arabian Sea.', 'केरल की वर्कला चट्टानें अरब सागर की लहरों से कटी समुद्री भृगु हैं।'), world: T2('The Twelve Apostles in Australia are sea stacks; Durdle Door in England is a sea arch.', 'ऑस्ट्रेलिया के ट्वेल्व एपोसल्स समुद्री स्तंभ हैं; इंग्लैंड का डर्डल डोर समुद्री मेहराब है।') },
    wind: { n: T2('Wind', 'पवन'), span: 10000, unit: T2('years', 'वर्ष'), forms: [['sand-dune', 10], ['mushroom-rock', 45]],
      about: T2('In deserts, wind carries sand close to the ground and blasts rocks like sandpaper. The bottom of a rock wears away faster than the top, leaving a mushroom rock. Where the wind slows down it drops the sand in hills called sand dunes.', 'मरुस्थलों में पवन रेत को ज़मीन के पास उड़ाती है और रेगमाल की तरह चट्टानों को घिसती है। चट्टान का निचला भाग ऊपर से तेज़ी से घिसता है, और छत्रक शिला बचती है। जहाँ पवन धीमी होती है, वहाँ वह रेत को टीलों में जमा करती है: बालू के टिब्बे।'),
      india: T2('The Thar Desert in Rajasthan has rolling sand dunes, such as those near Jaisalmer.', 'राजस्थान के थार मरुस्थल में जैसलमेर के पास जैसे लहरदार बालू के टिब्बे हैं।'), world: T2('The Sahara has dunes taller than 100 m, and mushroom rocks in Egypt’s White Desert.', 'सहारा में 100 मीटर से ऊँचे टिब्बे हैं, और मिस्र के श्वेत मरुस्थल में छत्रक शिलाएँ।') },
    glacier: { n: T2('Glacier', 'हिमनद'), span: 100000, unit: T2('years', 'वर्ष'), forms: [['u-valley', 50], ['moraine', 88]],
      about: T2('A glacier is a river of ice that creeps slowly downhill. Rocks frozen into it scrape the valley floor and sides, turning a narrow V-shaped river valley into a wide U-shaped valley. When the ice melts it leaves heaps of rock and soil: moraines.', 'हिमनद बर्फ़ की नदी है जो धीरे-धीरे ढलान पर खिसकती है। इसमें जमी चट्टानें घाटी के तल और किनारों को खुरचती हैं और नदी की पतली V-आकार घाटी को चौड़ी U-आकार घाटी में बदल देती हैं। बर्फ़ पिघलने पर चट्टानों और मिट्टी के ढेर रह जाते हैं: हिमोढ़।'),
      india: T2('The Gangotri glacier in Uttarakhand, the source of the Bhagirathi (Ganga), has carved a U-shaped valley.', 'उत्तराखंड का गंगोत्री हिमनद, भागीरथी (गंगा) का स्रोत, U-आकार की घाटी बना चुका है।'), world: T2('Yosemite Valley in the USA is a famous U-shaped valley carved by ice.', 'अमेरिका की योसेमिटी घाटी बर्फ़ से बनी प्रसिद्ध U-आकार की घाटी है।') },
    slope: { n: T2('Rain on a slope', 'ढलान पर वर्षा'), span: 100, unit: T2('years', 'वर्ष'), forms: [['gully', 45]],
      about: T2('Heavy rain on bare ground washes the fertile topsoil downhill and cuts deep channels called gullies. Roots of grass and trees hold the soil, and leaves soften the rain, so a covered slope loses very little.', 'खुली ज़मीन पर भारी वर्षा उपजाऊ ऊपरी मृदा को ढलान से नीचे बहा ले जाती है और गहरी नालियाँ बनाती है जिन्हें अवनालिका कहते हैं। घास और पेड़ों की जड़ें मृदा को थामे रखती हैं और पत्तियाँ वर्षा की मार कम करती हैं, इसलिए ढकी ढलान बहुत कम मृदा खोती है।'),
      india: T2('The ravines of the Chambal valley were cut by gully erosion. Planting trees, terrace farming and contour ploughing save the soil.', 'चंबल घाटी के बीहड़ अवनालिका अपरदन से बने। पेड़ लगाना, सीढ़ीदार खेती और समोच्च जुताई मृदा बचाते हैं।'), world: T2('Planting trees, terrace farming and ploughing along the contours of a hill all save soil.', 'पेड़ लगाना, सीढ़ीदार खेती और पहाड़ी की समोच्च रेखाओं के साथ जुताई, सभी मृदा बचाते हैं।') },
  };
  const AGENT_IDS = Object.keys(AGENT);
  const LFORM = { meander: T2('Meander', 'विसर्प'), 'ox-bow-lake': T2('Ox-bow lake', 'गोखुर झील'), 'sea-cave': T2('Sea cave', 'समुद्री गुफा'), 'sea-arch': T2('Sea arch', 'समुद्री मेहराब'), 'sea-stack': T2('Sea stack', 'समुद्री स्तंभ'), 'sand-dune': T2('Sand dune', 'बालू का टिब्बा'), 'mushroom-rock': T2('Mushroom rock', 'छत्रक शिला'), 'u-valley': T2('U-shaped valley', 'U-आकार घाटी'), moraine: T2('Moraine', 'हिमोढ़'), gully: T2('Gully', 'अवनालिका') };
  IMPL.erosion = (c) => {
    const S = { a: 'river', t: 0, plants: false, seen: new Set(), maxT: 0 };
    const soilLoss = () => (S.plants ? 0.1 : 2) * (S.t / 100) * AGENT.slope.span; // mm
    function check() { AGENT[S.a].forms.forEach(([f, at]) => { if (S.t >= at && !(S.a === 'slope' && S.plants && f === 'gully') && !S.seen.has(f)) { S.seen.add(f); c.reveal(f); } }); }
    function river(k) {
      const amp = 22 + Math.min(k, 0.7) * 120, cut = k >= 0.7;
      const yAt = (x) => 210 + amp * Math.sin(((x - 30) / 270) * 2 * Math.PI);
      const pts = []; for (let x = -10; x <= 610; x += 10) pts.push([x, yAt(x)]);
      let main = pts, lake = '';
      if (cut) { const a = 30 + 270 * 0.75 - 270 * 0.5, b = 30 + 270 * 1.25 - 270 * 0.5; main = pts.filter((p) => p[0] <= a + 12 || p[0] >= b - 12); const lp = pts.filter((p) => p[0] > a + 12 && p[0] < b - 12); lake = `<path d="${smooth(lp)}" stroke="#3FA1E8" stroke-width="20" fill="none" stroke-linecap="round" opacity=".9"/>`; }
      const bars = [0.25, 0.75, 1.25, 1.75].map((f) => { const x = 30 + 270 * f, y = yAt(x), sg = Math.sin(((x - 30) / 270) * 2 * Math.PI) > 0 ? -1 : 1; return `<ellipse cx="${r1(x)}" cy="${r1(y + sg * 22)}" rx="${r1(20 + k * 30)}" ry="9" fill="#E9CF8E"/><path d="M${r1(x - 30)} ${r1(y - sg * 22)}q30 ${r1(-sg * 14)} 60 0" stroke="#B42318" stroke-width="3" stroke-dasharray="5 5" fill="none"/>`; }).join('');
      return `<rect width="600" height="400" fill="#7DBE5A"/>${Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 97) % 600}" cy="${(i * 53) % 400}" r="${8 + (i % 3) * 3}" fill="#5FA846"/>`).join('')}${bars}
        <path d="${smooth(main)}" stroke="#2F8FEA" stroke-width="26" fill="none" stroke-linecap="round"/><path d="${smooth(main)}" stroke="#BFE3FF" stroke-width="3" fill="none" class="ea-flow"/>${lake}
        ${hot('layer:meander', c.t(LFORM.meander), `<rect x="${r1(30 + 270 * 0.25 - 50)}" y="${r1(yAt(30 + 270 * 0.25) - 60)}" width="100" height="40" rx="20" class="ea-pill"/><text x="${r1(30 + 270 * 0.25)}" y="${r1(yAt(30 + 270 * 0.25) - 34)}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM.meander))}</text>`)}
        ${cut ? hot('layer:ox-bow-lake', c.t(LFORM['ox-bow-lake']), `<rect x="${r1(300 - 70)}" y="${r1(yAt(300) + 30)}" width="140" height="40" rx="20" class="ea-pill on"/><text x="300" y="${r1(yAt(300) + 56)}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM['ox-bow-lake']))}</text>`) : ''}
        ${lbl(14, 388, c.t(T2('red: bank worn away · yellow: sand dropped', 'लाल: कटता किनारा · पीला: जमा रेत')), 'start', 'sm')}`;
    }
    function sea(k) {
      const id = c.id, back = k * 70, tipX = 70 + back * 0.5, top = 150, SEA = 300;
      const cave = k >= 0.2, arch = k >= 0.45, stack = k >= 0.75;
      const hx = stack ? tipX + 150 : tipX; // where the joined headland starts
      const head = `M${r1(hx)} ${SEA}V${top + 18}Q${r1(hx + 4)} ${top} ${r1(hx + 24)} ${top}H${r1(400 + back)}L${r1(420 + back)} 100H600V${SEA}Z`;
      let cut = '';
      if (cave && !arch) { const ch = 34 + (k - 0.2) * 200; cut = `<path d="M${r1(tipX + 50)} ${SEA}q0 ${r1(-ch)} 36 ${r1(-ch)}t36 ${r1(ch)}z" fill="#2A2420"/>`; }
      if (arch && !stack) cut = `<path d="M${r1(tipX + 46)} ${SEA}V228q0 -36 50 -36t50 36V${SEA}z" fill="url(#${id}-sky2)"/>`;
      const pillar = stack ? `<path d="M${r1(tipX)} ${SEA}V${r1(top + 26 + (k - 0.75) * 90)}q20 -14 42 0V${SEA}z" fill="url(#${id}-rock)" stroke="#5E4535" stroke-width="3"/>` : '';
      const lab = stack ? ['sea-stack', tipX + 21, top + 6] : arch ? ['sea-arch', tipX + 96, top - 14] : cave ? ['sea-cave', tipX + 86, top - 14] : null;
      return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FA8EE"/><stop offset="1" stop-color="#D2EEFF"/></linearGradient>
          <linearGradient id="${id}-sky2" x1="0" x2="0" gradientUnits="userSpaceOnUse" y1="0" y2="300"><stop offset="0" stop-color="#4FA8EE"/><stop offset="1" stop-color="#D2EEFF"/></linearGradient>
          <linearGradient id="${id}-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C29A6B"/><stop offset="1" stop-color="#7E5C40"/></linearGradient>
          <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F9BEA"/><stop offset="1" stop-color="#0B4A9A"/></linearGradient></defs>
        <rect width="600" height="400" fill="url(#${id}-sky)"/><circle cx="80" cy="56" r="24" fill="#FFD23F"/>${cloud(300, 60, 0.7, '#fff', 0.9)}${cloud(520, 40, 0.5, '#fff', 0.8)}
        <path d="${head}" fill="url(#${id}-rock)" stroke="#5E4535" stroke-width="3"/>
        ${[190, 228, 266].map((y) => `<path d="M${r1(hx)} ${y}H600" stroke="#8A6C50" stroke-width="2" opacity=".55"/>`).join('')}
        <path d="M${r1(hx + 20)} ${top}H${r1(400 + back)}L${r1(420 + back)} 100H600V94H${r1(418 + back)}L${r1(398 + back)} ${top - 6}H${r1(hx + 20)}Z" fill="#5FA846"/>
        ${cut}${pillar}
        <path d="M${r1(450 + back * 0.6)} ${SEA}q50 -16 150 -10V${SEA}z" fill="#E9CF8E"/>
        <rect y="${SEA - 4}" width="600" height="${404 - SEA}" fill="url(#${id}-sea)"/>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${-30 + i * 46} ${SEA + 4 + (i % 2) * 18}q14 -12 28 0" stroke="#fff" stroke-width="4" fill="none" class="ea-bob" style="animation-delay:${i * 0.3}s"/>`).join('')}
        <path d="M${r1(tipX - 6)} ${SEA - 2}q10 -26 24 -10q8 -20 20 -2" stroke="#fff" stroke-width="4" fill="none" opacity=".85" class="ea-pulse"/>
        ${arr(10, 330, 60, 330, '#fff', 4, 12)}${lbl(14, 356, c.t(T2('waves attack', 'लहरों की मार')), 'start', 'sm')}
        ${hot('layer:cliff', c.t(T2('Cliff', 'भृगु (खड़ी चट्टान)')), `<rect x="${r1(430 + back * 0.5)}" y="200" width="${r1(c.t(T2('Cliff', 'भृगु (खड़ी चट्टान)')).length * 9 + 30)}" height="38" rx="19" class="ea-pill"/><text x="${r1(445 + back * 0.5)}" y="225" class="ea-ptxt">${esc(c.t(T2('Cliff', 'भृगु (खड़ी चट्टान)')))}</text>`)}
        ${lab ? hot('layer:' + lab[0], c.t(LFORM[lab[0]]), `<rect x="${r1(lab[1] - 75)}" y="${lab[2] - 62}" width="150" height="38" rx="19" class="ea-pill on"/><text x="${r1(lab[1])}" y="${lab[2] - 37}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM[lab[0]]))}</text><path d="M${r1(lab[1])} ${lab[2] - 24}V${lab[2] + 10}" stroke="#fff" stroke-width="2"/>`) : ''}`;
    }
    function wind(k) {
      const stem = 110 - Math.min(k, 0.9) * 80, dune = 20 + k * 90;
      const rock = `M${r1(190 - stem / 2)} 330C${r1(190 - stem / 2 + 6)} 280 ${r1(190 - stem / 2 - 4)} 250 ${r1(190 - stem / 2 - 6)} 230L115 205Q120 150 190 145Q262 150 266 205L${r1(190 + stem / 2 + 6)} 230C${r1(190 + stem / 2 + 4)} 250 ${r1(190 + stem / 2 - 6)} 280 ${r1(190 + stem / 2)} 330Z`;
      return `<defs><linearGradient id="${c.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6C27A"/><stop offset="1" stop-color="#FFE9C2"/></linearGradient></defs>
        <rect width="600" height="400" fill="url(#${c.id}-sky)"/><circle cx="520" cy="60" r="30" fill="#FFF3B0"/>
        <path d="M330 330Q${r1(430)} ${r1(330 - dune)} ${r1(500)} ${r1(330 - dune * 0.9)}Q540 ${r1(330 - dune * 0.6)} 600 330Z" fill="#E6B567"/><path d="M500 ${r1(330 - dune * 0.9)}Q540 ${r1(330 - dune * 0.6)} 600 330" stroke="#C99545" stroke-width="3" fill="none"/>
        <path d="${rock}" fill="#B9774A" stroke="#7A4A2A" stroke-width="3"/>${[170, 195, 220].map((y) => `<path d="M125 ${y}Q190 ${y - 10} 258 ${y}" stroke="#9A5E36" stroke-width="2" fill="none" opacity=".7"/>`).join('')}
        <rect y="330" width="600" height="70" fill="#E3B062"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => arr(10, 300 + (i % 3) * 10, 90, 300 + (i % 3) * 10, 'rgba(255,255,255,.85)', 3, 9, `class="ea-flow" style="animation-delay:${-i * 0.15}s"`)).join('')}
        ${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 37) % 120}" cy="${300 + (i * 13) % 30}" r="2" fill="#B8862E"/>`).join('')}
        ${k >= 0.1 ? hot('layer:sand-dune', c.t(LFORM['sand-dune']), `<rect x="400" y="${r1(320 - dune - 50)}" width="150" height="38" rx="19" class="ea-pill"/><text x="475" y="${r1(320 - dune - 25)}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM['sand-dune']))}</text>`) : ''}
        ${k >= 0.45 ? hot('layer:mushroom-rock', c.t(LFORM['mushroom-rock']), `<rect x="110" y="88" width="160" height="38" rx="19" class="ea-pill on"/><text x="190" y="113" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM['mushroom-rock']))}</text>`) : ''}
        ${lbl(14, 388, c.t(T2('sand-laden wind wears the bottom fastest', 'रेत भरी पवन नीचे का भाग सबसे तेज़ घिसती है')), 'start', 'sm')}`;
    }
    function glacier(k) {
      const u = clamp(k / 0.85, 0, 1), melted = k >= 0.85;
      const floor = []; for (let i = 0; i <= 40; i++) { const x = 60 + i * 12, f = Math.abs((x - 300) / 240); floor.push([x, lerp(340 - f * 220, 340 - Math.pow(f, 4) * 220, u)]); }
      const valley = `M0 40L60 ${r1(floor[0][1])}${floor.map((p) => 'L' + r1(p[0]) + ' ' + r1(p[1])).join('')}L600 40V400H0Z`;
      const ice = melted ? '' : `<path d="M${floor.filter((p) => p[1] < 330).map((p) => r1(p[0]) + ' ' + r1(Math.max(p[1], 180))).join('L')}" fill="none"/><path d="M60 180${floor.map((p) => 'L' + r1(p[0]) + ' ' + r1(Math.max(p[1], 180))).join('')}L540 180Z" fill="#E6F4FF" opacity=".92"/><path d="M80 200q220 30 440 0" stroke="#A9D6F5" stroke-width="3" fill="none"/>${[[200, 250], [260, 300], [330, 310], [400, 270], [300, 240]].map(([x, y]) => `<path d="M${x} ${r1(Math.min(y, floor[Math.round((x - 60) / 12)][1] - 8))}l8 -6 9 3 2 8-10 4z" fill="#6B6156"/>`).join('')}${[230, 370].map((x) => `<path d="M${x} 205l8 30" stroke="#A9D6F5" stroke-width="2"/>`).join('')}`;
      const mor = melted ? [150, 300, 450].map((x, i) => `<path d="M${x - 40} ${r1(Math.min(340, floor[Math.round((x - 60) / 12)][1]) + 2)}q40 -${30 + i * 6} 80 0z" fill="#9A8C7A"/>${Array.from({ length: 6 }, (_, j) => `<circle cx="${x - 25 + j * 10}" cy="${r1(Math.min(340, floor[Math.round((x - 60) / 12)][1]) - 6 - (j % 2) * 6)}" r="4" fill="#6B6156"/>`).join('')}`).join('') : '';
      return `<defs><linearGradient id="${c.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BB2F0"/><stop offset="1" stop-color="#DDF3FF"/></linearGradient></defs>
        <rect width="600" height="400" fill="url(#${c.id}-sky)"/>${cloud(300, 50, 0.6, '#fff', 0.85)}
        <path d="${valley}" fill="#7A6E62"/>${[0, 1, 2, 3].map((i) => `<path d="M${30 + i * 8} ${70 + i * 40}l40 6M${570 - i * 8} ${70 + i * 40}l-40 6" stroke="#5E554C" stroke-width="3"/>`).join('')}<path d="M0 40L60 ${r1(floor[0][1])}L40 ${r1(floor[0][1] - 30)}L0 52Z" fill="#fff" opacity=".9"/><path d="M600 40L540 ${r1(floor[40][1])}L560 ${r1(floor[40][1] - 30)}L600 52Z" fill="#fff" opacity=".9"/>
        ${ice}${mor}${melted ? `<path d="M270 ${r1(floor[20][1] - 2)}q30 -6 60 0" stroke="#2F8FEA" stroke-width="6" fill="none"/>` : `<path d="M300 ${r1(floor[20][1])}" />`}
        ${melted ? '' : lbl(300, 230, c.t(T2('glacier (ice)', 'हिमनद (बर्फ़)')), 'middle', 'dk')}
        ${k >= 0.5 ? hot('layer:u-valley', c.t(LFORM['u-valley']), `<rect x="210" y="70" width="180" height="38" rx="19" class="ea-pill on"/><text x="300" y="95" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM['u-valley']))}</text>`) : lbl(300, 95, c.t(T2('V-shaped river valley', 'नदी की V-आकार घाटी')), 'middle')}
        ${melted ? hot('layer:moraine', c.t(LFORM.moraine), `<rect x="380" y="${r1(floor[33][1] - 80)}" width="130" height="38" rx="19" class="ea-pill on"/><text x="445" y="${r1(floor[33][1] - 55)}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM.moraine))}</text>`) : ''}`;
    }
    function slope(k) {
      const lost = soilLoss(), th = Math.max(4, 34 - lost * 0.12);
      const top = (x) => 120 + x * 0.38, gully = !S.plants && k >= 0.45;
      return `<defs><linearGradient id="${c.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C8DA3"/><stop offset="1" stop-color="#D5DEE8"/></linearGradient></defs>
        <rect width="600" height="400" fill="url(#${c.id}-sky)"/>${cloud(160, 60, 1.3, '#8C97A8')}${cloud(400, 50, 1.1, '#8C97A8')}
        ${Array.from({ length: 24 }, (_, i) => `<line x1="${40 + i * 23}" y1="${80 + (i % 4) * 10}" x2="${34 + i * 23}" y2="${100 + (i % 4) * 10}" stroke="#E0F0FF" stroke-width="2" class="ea-flow" style="animation-delay:${-i * 0.1}s"/>`).join('')}
        <path d="M0 ${r1(top(0) + th)}L600 ${r1(top(600) + th)}V400H0Z" fill="#8A8F98"/>
        <path d="M0 ${r1(top(0))}L600 ${r1(top(600))}L600 ${r1(top(600) + th)}L0 ${r1(top(0) + th)}Z" fill="#6B4A2F"/>
        ${gully ? [150, 300, 430].map((x) => `<path d="M${x - 10} ${r1(top(x) - 1)}l10 ${r1(th * 0.9)}l10 ${r1(-th * 0.9)}z" fill="#8A8F98"/>`).join('') : ''}
        ${S.plants ? Array.from({ length: 16 }, (_, i) => { const x = 20 + i * 37, y = top(x); return i % 4 === 1 ? `<rect x="${x - 3}" y="${r1(y - 40)}" width="6" height="40" fill="#7A4E26"/><circle cx="${x}" cy="${r1(y - 48)}" r="20" fill="#2E8B3E"/><path d="M${x} ${r1(y)}v${r1(th - 2)}M${x} ${r1(y + 8)}l-8 ${r1(th - 10)}M${x} ${r1(y + 8)}l8 ${r1(th - 10)}" stroke="#E8D3A8" stroke-width="2"/>` : `<path d="M${x - 8} ${r1(y)}l-2 -12M${x} ${r1(y)}l0 -14M${x + 8} ${r1(y)}l2 -12" stroke="#3FB55A" stroke-width="3"/>`; }).join('') : ''}
        <path d="M480 ${r1(top(600) + 4)}q60 ${r1(-Math.min(40, lost * 0.15))} 120 0z" fill="#7A5634"/>
        <rect y="${r1(top(600) + th)}" x="520" width="80" height="${r1(400 - top(600) - th)}" fill="#8A6A44" opacity=".6"/>
        ${gully ? hot('layer:gully', c.t(LFORM.gully), `<rect x="230" y="${r1(top(300) + 40)}" width="140" height="38" rx="19" class="ea-pill on"/><text x="300" y="${r1(top(300) + 65)}" text-anchor="middle" class="ea-ptxt">${esc(c.t(LFORM.gully))}</text>`) : ''}
        ${lbl(20, 390, c.t(T2('topsoil left', 'बची ऊपरी मृदा')) + `: ${num(Math.max(0, 30 - lost / 10), 1)} cm`, 'start', 'sm')}`;
    }
    const DRAW = { river, sea, wind, glacier, slope };
    return {
      view: [600, 400], label: T2('Landforms made by erosion', 'अपरदन से बने स्थलरूप'),
      chips: () => AGENT[S.a].forms.map(([f]) => ({ id: f, n: LFORM[f] })),
      controls: () => `<div class="ea-row">${AGENT_IDS.map((a) => c.btn('toggle:' + a, AGENT[a].n)).join('')}</div>` + c.slider('time', T2('Time passed', 'बीता समय'), 0, 100, 1) + `<div class="ea-row">${c.btn('play', T2('Run time forward', 'समय आगे चलाओ'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l12 8-12 8z" fill="#1E293B"/></svg>')}${c.btn('toggle:plants', T2('Plants on the slope', 'ढलान पर पौधे'), '', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22V10M12 14c-4 0-7-3-7-7 4 0 7 3 7 7zM12 12c0-4 3-7 7-7 0 4-3 7-7 7z" fill="#22C55E" stroke="#15803D"/></svg>')}</div>`,
      val: () => S.t, fmt: () => `${num((S.t / 100) * AGENT[S.a].span)} ${c.t(AGENT[S.a].unit)}`,
      slide(n, v) { S.t = v; check(); },
      change(n, v) { if (v > S.maxT) { S.maxT = v; c.emit('eroded'); } },
      pressed: (k) => (k === 'toggle:plants' ? S.plants : k.startsWith('toggle:') ? S.a === k.slice(7) : null),
      act(key) {
        if (key === 'toggle:plants') { S.plants = !S.plants; if (S.a !== 'slope') { S.a = 'slope'; S.t = 0; S.maxT = 0; } c.say(S.plants ? T2('Plants hold the soil.', 'पौधे मृदा को थामे रखते हैं।') : T2('Bare slope.', 'खुली ढलान।')); return; }
        if (key.startsWith('toggle:')) { S.a = key.slice(7); S.t = 0; S.maxT = 0; c.say(AGENT[S.a].n); return; }
        if (key === 'play') {
          const t0 = S.t >= 100 ? 0 : S.t; c.busy = true;
          c.rec(T2('Ran erosion forward: ' + AGENT[S.a].n.en, 'अपरदन आगे चलाया: ' + AGENT[S.a].n.hi));
          c.run(7000 * (1 - t0 / 100) + 400, (k) => { S.t = Math.round(lerp(t0, 100, k)); check(); c.refresh(); }, () => { c.busy = false; S.maxT = 100; c.emit('eroded'); c.refresh(); });
          return;
        }
        if (key.startsWith('layer:')) { const f = key.slice(6); c.say(LFORM[f] || T2('Cliff', 'भृगु')); c.reveal(f); }
      },
      scene() { return DRAW[S.a](S.t / 100); },
      panel() {
        const A = AGENT[S.a];
        const facts = [[T2('Time passed', 'बीता समय'), `${num((S.t / 100) * A.span)} ${c.t(A.unit)}`]];
        if (S.a === 'slope') facts.push([T2('Soil washed away', 'बह गई मृदा'), `${num(soilLoss() / 10, 1)} cm`], [T2('Loss each year', 'हर साल नुक़सान'), S.plants ? T2('about 0.1 mm (covered)', 'लगभग 0.1 मिमी (ढकी)') : T2('about 2 mm (bare)', 'लगभग 2 मिमी (खुली)')]);
        return c.card({ title: A.n, dot: '#0F766E', paras: [A.about], ex: c.region === 'india' ? A.india : A.world, facts });
      },
    };
  };

  // ================================================================ groundwater
  const GPART = {
    soil: { n: T2('Soil', 'मृदा'), about: T2('Rain soaks into the soil first. Plant roots and loose soil help water sink in.', 'वर्षा पहले मृदा में रिसती है। पौधों की जड़ें और भुरभुरी मृदा पानी को अंदर जाने में मदद करती हैं।') },
    aquifer: { n: T2('Aquifer', 'जलभृत'), about: T2('A layer of sand, gravel or cracked rock whose spaces hold water, like a sponge. Wells take water from it.', 'रेत, बजरी या दरार वाली चट्टान की परत जिसके छिद्रों में पानी भरा रहता है, स्पंज की तरह। कुएँ इसी से पानी लेते हैं।') },
    'water-table': { n: T2('Water table', 'जल स्तर'), about: T2('The top of the zone where every space in the ground is full of water. It rises after good rain and falls when we pump out more than the rain puts back.', 'उस क्षेत्र की ऊपरी सीमा जहाँ ज़मीन का हर छिद्र पानी से भरा है। अच्छी वर्षा के बाद यह ऊपर आता है और जब हम वर्षा से भरे पानी से ज़्यादा निकालते हैं तो नीचे गिरता है।') },
    impermeable: { n: T2('Hard clay and rock', 'कठोर मिट्टी और चट्टान'), about: T2('A layer that water cannot pass through. Water collects above it; below it lies a deeper aquifer that only a borewell can reach.', 'ऐसी परत जिससे पानी नहीं गुज़र सकता। पानी इसके ऊपर जमा होता है; इसके नीचे एक गहरा जलभृत है जिस तक केवल नलकूप पहुँचता है।') },
    well: { n: T2('Dug well', 'खुदा कुआँ'), about: T2('An open well 15 m deep. It gives water only while the water table is above its bottom.', '15 मीटर गहरा खुला कुआँ। यह तभी पानी देता है जब जल स्तर इसके तल से ऊपर हो।') },
  };
  const GPART_IDS = Object.keys(GPART);
  IMPL.groundwater = (c) => {
    const S = { rain: 1000, pump: 150, harvest: false, paved: false, wt: 8, year: 0, anim: -1, from: 8, drop: null, sel: null, dry: false, last: null };
    const GY = 120, PX = 3.6, WELL = 15, SY = 0.12;
    const Y = (d) => GY + d * PX;
    const f = () => clamp((S.paved ? 0.04 : 0.12) + (S.harvest ? 0.15 : 0), 0, 0.5);
    const recharge = () => S.rain * f(), net = () => recharge() - S.pump, dWT = () => -net() / (SY * 1000);
    function year() {
      const d0 = S.wt, d1 = clamp(S.wt + dWT(), 1, 44);
      S.last = { recharge: recharge(), pump: S.pump, change: d0 - d1 };
      c.busy = true; S.from = d0; c.emit('rained');
      c.rec(T2(`A year passed: rain ${S.rain} mm, pumping ${S.pump} mm`, `एक साल बीता: वर्षा ${S.rain} मिमी, पंपिंग ${S.pump} मिमी`));
      c.run(3600, (k) => { S.anim = k; S.wt = lerp(d0, d1, ease(clamp((k - 0.35) / 0.65, 0, 1))); c.redraw(); }, () => {
        S.anim = -1; S.wt = d1; S.year++; c.busy = false;
        const dry = S.wt > WELL; if (dry && !S.dry) { c.reveal('dry-well'); c.toast(T2('The dug well has dried up: the water table fell below its bottom.', 'खुदा कुआँ सूख गया: जल स्तर उसके तल से नीचे चला गया।')); } S.dry = dry;
        c.refresh();
      });
    }
    function drop() {
      c.busy = true; c.emit('rained');
      c.run(3000, (k) => { S.drop = k; c.redraw(); }, () => { S.drop = null; c.busy = false; c.reveal('water-table'); S.sel = 'water-table'; c.refresh(); });
    }
    return {
      view: [600, 420], label: T2('Ground cut open to show the water underground', 'ज़मीन के नीचे पानी दिखाता कटा हुआ भाग'),
      chips: () => GPART_IDS.map((p) => ({ id: p, n: GPART[p].n })),
      controls: () => c.slider('rain', T2('Rain in a year', 'साल भर की वर्षा'), 200, 3000, 50) + c.slider('pumping', T2('Water pumped out in a year', 'साल भर में निकाला पानी'), 0, 400, 10)
        + `<div class="ea-row">${c.btn('toggle:harvest', T2('Rainwater harvesting', 'वर्षा जल संचयन'))}${c.btn('toggle:paved', T2('Concrete and roads', 'कंक्रीट और सड़कें'))}</div><div class="ea-row">${c.btn('play', T2('Let one year pass', 'एक साल बीतने दो'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l12 8-12 8z" fill="#1E293B"/></svg>')}${c.btn('drop', T2('Follow a raindrop', 'वर्षा की बूँद के साथ चलो'), 'ea-go2', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z" fill="#1D4ED8"/></svg>')}</div>`,
      val: (n) => (n === 'rain' ? S.rain : S.pump), fmt: (n) => (n === 'rain' ? `${num(S.rain)} mm` : `${num(S.pump)} mm`),
      slide(n, v) { if (n === 'rain') S.rain = v; else S.pump = v; },
      pressed: (k) => (k === 'toggle:harvest' ? S.harvest : k === 'toggle:paved' ? S.paved : null),
      act(key) {
        if (key === 'play') return year();
        if (key === 'drop') return drop();
        if (key === 'toggle:harvest') { S.harvest = !S.harvest; c.say(GPART.soil.n); return; }
        if (key === 'toggle:paved') { S.paved = !S.paved; return; }
        if (key.startsWith('layer:')) { S.sel = key.slice(6); c.say(GPART[S.sel].n); c.reveal(S.sel); }
      },
      scene() {
        const id = c.id, wy = Y(S.wt), a = S.anim, q = rnd(5);
        const raining = a >= 0 && a < 0.6;
        const dots = Array.from({ length: 160 }, () => `<circle cx="${r1(q() * 600)}" cy="${r1(Y(3) + q() * (Y(45) - Y(3)))}" r="1.8" fill="#B08D57"/>`).join('');
        const sel = (p) => (S.sel === p ? 'stroke="#FFD23F" stroke-width="4"' : '');
        const wellWater = S.wt < WELL ? `<rect x="104" y="${r1(wy)}" width="22" height="${r1(Y(WELL) - wy)}" fill="#2F8FEA"/>` : '';
        const dropY = S.drop != null ? (S.drop < 0.3 ? lerp(30, GY, S.drop / 0.3) : lerp(GY, wy, (S.drop - 0.3) / 0.7)) : null;
        const pumpOn = a >= 0;
        return `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${raining ? '#7C8DA3' : '#5BB2F0'}"/><stop offset="1" stop-color="${raining ? '#C9D2DD' : '#D8F1FF'}"/></linearGradient><pattern id="${id}-wet" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#2F7FD8" opacity=".55"/><circle cx="5" cy="5" r="1.4" fill="#DBEAFE" opacity=".8"/></pattern></defs>
          <rect width="600" height="${GY}" fill="url(#${id}-sky)"/>${raining ? cloud(160, 50, 1.2, '#8C97A8') + cloud(420, 44, 1.1, '#8C97A8') + Array.from({ length: 30 }, (_, i) => `<line x1="${20 + i * 19}" y1="${60 + ((i * 29 + a * 400) % 50)}" x2="${16 + i * 19}" y2="${74 + ((i * 29 + a * 400) % 50)}" stroke="#E0F0FF" stroke-width="2"/>`).join('') : `<circle cx="470" cy="40" r="22" fill="#FFD23F"/>` + cloud(220, 50, 0.8, '#fff', 0.9)}
          ${hot('layer:soil', c.t(GPART.soil.n), `<rect y="${GY}" width="600" height="${r1(Y(3) - GY)}" fill="#6B4A2F" ${sel('soil')}/>`)}
          ${hot('layer:aquifer', c.t(GPART.aquifer.n), `<rect y="${r1(Y(3))}" width="600" height="${r1(Y(45) - Y(3))}" fill="#D7B98A" ${sel('aquifer')}/>${dots}`)}
          <rect y="${r1(wy)}" width="600" height="${r1(Y(45) - wy)}" fill="url(#${id}-wet)"/>
          ${hot('layer:impermeable', c.t(GPART.impermeable.n), `<rect y="${r1(Y(45))}" width="600" height="${r1(Y(52) - Y(45))}" fill="#5B5F68" ${sel('impermeable')}/>`)}
          <rect y="${r1(Y(52))}" width="600" height="${r1(420 - Y(52))}" fill="#C9A978"/><rect y="${r1(Y(52))}" width="600" height="${r1(420 - Y(52))}" fill="url(#${id}-wet)"/>
          ${hot('layer:water-table', c.t(GPART['water-table'].n), `<rect y="${r1(wy - 10)}" width="600" height="20" fill="rgba(255,255,255,.01)"/><path d="M0 ${r1(wy)}${Array.from({ length: 30 }, (_, i) => `q10 -4 20 0`).join('')}" stroke="${S.sel === 'water-table' ? '#FFD23F' : '#1D4ED8'}" stroke-width="4" fill="none"/>`)}
          ${lbl(590, wy - 8, c.t(GPART['water-table'].n) + ` · ${num(S.wt, 1)} m`, 'end', 'sm')}
          <rect y="${GY - 6}" width="600" height="7" fill="${S.paved ? '#9CA3AF' : '#5DAE4F'}"/>${S.paved ? `<rect x="0" y="${GY - 8}" width="600" height="4" fill="#6B7280"/>` : ''}
          <rect x="30" y="${GY - 46}" width="50" height="40" fill="#FFE7B8" stroke="#7A4E26"/><path d="M24 ${GY - 46}l31-22 31 22z" fill="#C2410C"/>
          ${S.harvest ? `<path d="M80 ${GY - 40}h12v34" stroke="#3B82F6" stroke-width="4" fill="none"/><path d="M84 ${GY}h16l-4 26h-8z" fill="#93C5FD" stroke="#1D4ED8" stroke-width="2"/>${lbl(130, GY + 34, c.t(T2('recharge pit', 'पुनर्भरण गड्ढा')), 'start', 'sm')}` : ''}
          ${hot('layer:well', c.t(GPART.well.n), `<rect x="100" y="${GY - 14}" width="30" height="${r1(Y(WELL) - GY + 14)}" fill="#3A2A20" ${sel('well') || 'stroke="#9CA3AF" stroke-width="3"'}/>${wellWater}<path d="M96 ${GY - 34}h38M100 ${GY - 34}v20M130 ${GY - 34}v20" stroke="#7A4E26" stroke-width="4"/>`)}
          ${lbl(140, r1(Y(WELL) + 18), c.t(GPART.well.n) + (S.wt > WELL ? ' · ' + c.t(T2('dry', 'सूखा')) : ''), 'start', 'sm')}
          <rect x="398" y="${GY - 30}" width="24" height="24" rx="4" fill="#475569"/><rect x="406" y="${GY - 6}" width="8" height="${r1(Y(70) - GY + 6)}" fill="#94A3B8"/>
          ${pumpOn && S.pump > 0 ? `<path d="M422 ${GY - 20}h70" stroke="#3B82F6" stroke-width="6" class="ea-flow"/>` : ''}
          ${Array.from({ length: 7 }, (_, i) => `<path d="M${470 + i * 18} ${GY - 6}l-4 -12M${470 + i * 18} ${GY - 6}l4 -14" stroke="#3FB55A" stroke-width="3"/>`).join('')}
          ${lbl(410, GY - 40, c.t(T2('borewell', 'नलकूप')), 'middle', 'sm')}
          ${a >= 0.2 && a < 0.8 ? Array.from({ length: 6 }, (_, i) => arr(180 + i * 60, GY + 8, 180 + i * 60, GY + 8 + 30 * f() / 0.12, '#93C5FD', 3, 9)).join('') : ''}
          ${dropY != null ? `<path d="M300 ${r1(dropY - 10)}c4 6 8 10 8 14a8 8 0 0 1-16 0c0-4 4-8 8-14z" fill="#1D4ED8" stroke="#fff" stroke-width="2"/>` : ''}
          ${[0, 20, 40, 60, 80].map((d) => `<line x1="0" x2="10" y1="${Y(d)}" y2="${Y(d)}" stroke="#fff" stroke-width="2"/><text x="14" y="${Y(d) + 5}" class="ea-lbl sm" text-anchor="start">${d} m</text>`).join('')}
          ${lbl(300, r1(Y(48.5) + 6), c.t(GPART.impermeable.n), 'middle', 'sm')}${lbl(300, r1(Y(30)), c.t(GPART.aquifer.n), 'middle')}${lbl(300, r1(Y(66)), c.t(T2('deep aquifer', 'गहरा जलभृत')), 'middle', 'sm')}
          ${lbl(590, 22, c.t(T2('Year', 'वर्ष')) + ' ' + S.year, 'end', 'big')}`;
      },
      panel() {
        const p = S.sel ? GPART[S.sel] : null, L0 = S.last;
        const facts = [[T2('Soaks in = rain × share', 'रिसता पानी = वर्षा × हिस्सा'), `${num(S.rain)} × ${num(f() * 100)}% = ${num(recharge())} mm`], [T2('Pumped out', 'निकाला गया'), `${num(S.pump)} mm`], [T2('Water table moves each year', 'हर साल जल स्तर बदलता है'), `${dWT() <= 0 ? '▲' : '▼'} ${num(Math.abs(dWT()), 2)} m`], [T2('Water table depth', 'जल स्तर की गहराई'), `${num(S.wt, 1)} m`]];
        return c.card({ title: p ? p.n : T2('Water under the ground', 'ज़मीन के नीचे पानी'), dot: '#2F8FEA', paras: [p ? p.about : T2('Some rain soaks down and refills the aquifer (recharge). When we pump out more water than the rain puts back, the water table falls and wells dry up.', 'कुछ वर्षा रिसकर नीचे जाती है और जलभृत को फिर भरती है (पुनर्भरण)। जब हम वर्षा से भरे पानी से ज़्यादा पानी निकालते हैं, तो जल स्तर गिरता है और कुएँ सूख जाते हैं।'),
          T2('Each 1 mm of water spread over the ground raises the water table by about 8 mm here, because water fills only the spaces between the grains (about 12%).', 'ज़मीन पर फैला हर 1 मिमी पानी यहाँ जल स्तर को लगभग 8 मिमी ऊपर उठाता है, क्योंकि पानी केवल कणों के बीच के छिद्र (लगभग 12%) भरता है।')],
          facts, warn: S.wt > WELL ? T2('The dug well is dry. Pump less, or harvest rainwater to recharge the ground.', 'खुदा कुआँ सूखा है। कम पानी निकालो, या ज़मीन को फिर भरने के लिए वर्षा जल का संचयन करो।') : null,
          ex: c.region === 'india' ? T2('India uses more groundwater than any other country. Rooftop rainwater harvesting and recharge pits help refill it.', 'भारत किसी भी देश से ज़्यादा भौम जल उपयोग करता है। छत पर वर्षा जल संचयन और पुनर्भरण गड्ढे इसे फिर भरने में मदद करते हैं।') : T2('Groundwater gives about half of the world’s drinking water.', 'दुनिया का लगभग आधा पीने का पानी भौम जल से आता है।') });
      },
    };
  };

  // ================================================================ atmosphere-layers
  const ALAYER = [
    { id: 'troposphere', from: 0, to: 13, n: T2('Troposphere', 'क्षोभमंडल'), col: '#5BB2F0', about: T2('The layer we live and breathe in. It holds about three-quarters of all the air and almost all the clouds, rain and weather. It gets colder by about 6.5 °C for every kilometre up. It is about 18 km thick over the equator and 8 km over the poles.', 'वह परत जिसमें हम रहते और साँस लेते हैं। इसमें पूरी हवा का लगभग तीन-चौथाई भाग और लगभग सारे बादल, वर्षा और मौसम होते हैं। हर किलोमीटर ऊपर जाने पर यह लगभग 6.5 °C ठंडी होती है। भूमध्य रेखा पर यह लगभग 18 किमी और ध्रुवों पर 8 किमी मोटी है।') },
    { id: 'stratosphere', from: 13, to: 50, n: T2('Stratosphere', 'समतापमंडल'), col: '#3B6EEA', about: T2('Calm, dry air with almost no clouds, which is why jet planes like to fly near its bottom. It holds the ozone layer, which absorbs the Sun’s harmful ultraviolet rays and warms this layer as you go up.', 'शांत, सूखी हवा, लगभग बिना बादल, इसलिए जेट विमान इसके निचले भाग के पास उड़ना पसंद करते हैं। इसमें ओज़ोन परत है, जो सूर्य की हानिकारक पराबैंगनी किरणों को सोखती है और ऊपर जाने पर इस परत को गर्म करती है।') },
    { id: 'mesosphere', from: 50, to: 80, n: T2('Mesosphere', 'मध्यमंडल'), col: '#4B3FC8', about: T2('The coldest layer: about −90 °C at its top. Most meteors (shooting stars) burn up here.', 'सबसे ठंडी परत: इसके ऊपरी भाग पर लगभग −90 °C। ज़्यादातर उल्काएँ (टूटते तारे) यहीं जलकर ख़त्म हो जाती हैं।') },
    { id: 'thermosphere', from: 80, to: 400, n: T2('Thermosphere', 'तापमंडल'), col: '#2A1F7A', about: T2('The very thin air here is heated by the Sun to 1,000 °C or more. Its ionosphere (80–400 km) reflects radio waves back to Earth. Auroras glow here, and the International Space Station orbits about 400 km up.', 'यहाँ की बहुत विरल हवा सूर्य से 1,000 °C या ज़्यादा तक गर्म होती है। इसका आयनमंडल (80–400 किमी) रेडियो तरंगों को पृथ्वी पर वापस भेजता है। ध्रुवीय ज्योति यहीं चमकती है और अंतर्राष्ट्रीय अंतरिक्ष स्टेशन लगभग 400 किमी ऊपर घूमता है।') },
    { id: 'exosphere', from: 400, to: 700, n: T2('Exosphere', 'बहिर्मंडल'), col: '#120E3A', about: T2('The outermost layer, slowly fading into space. The air is so thin that light gases such as hydrogen and helium drift away. Many satellites orbit here.', 'सबसे बाहरी परत, जो धीरे-धीरे अंतरिक्ष में मिल जाती है। हवा इतनी विरल है कि हाइड्रोजन और हीलियम जैसी हल्की गैसें दूर निकल जाती हैं। कई उपग्रह यहाँ घूमते हैं।') },
  ];
  // US Standard Atmosphere 1976 temperature (°C) and pressure (hPa), with a simple thermosphere.
  function airT(h) {
    if (h <= 11) return 15 - 6.5 * h; if (h <= 20) return -56.5; if (h <= 32) return -56.5 + (h - 20); if (h <= 47) return -44.5 + 2.8 * (h - 32);
    if (h <= 51) return -2.5; if (h <= 71) return -2.5 - 2.8 * (h - 51); if (h <= 86) return -58.5 - 2 * (h - 71); if (h <= 90) return -88.5;
    return -88.5 + 1100 * (1 - Math.exp(-(h - 90) / 60));
  }
  function airP(h) {
    const m = h * 1000;
    if (h <= 11) return 1013.25 * Math.pow(1 - (0.0065 * m) / 288.15, 5.25588);
    if (h <= 20) return 226.32 * Math.exp(-0.000157688 * (m - 11000));
    if (h <= 32) return 54.749 * Math.pow(1 + (0.001 * (m - 20000)) / 216.65, -34.1632);
    if (h <= 47) return 8.6802 * Math.pow(1 + (0.0028 * (m - 32000)) / 228.65, -12.2011);
    if (h <= 100) return 1.1091 * Math.exp(-(h - 47) / 7.0);
    return 1.1091 * Math.exp(-53 / 7.0) * Math.exp(-(h - 100) / 25);
  }
  IMPL['atmosphere-layers'] = (c) => {
    const S = { s: 0, last: null };
    const alt = () => (S.s <= 700 ? (S.s / 700) * 100 : 100 + ((S.s - 700) / 300) * 600);
    const toS = (h) => (h <= 100 ? (h / 100) * 700 : 700 + ((h - 100) / 600) * 300);
    const Y = (h) => (h <= 100 ? 466 - 330 * Math.sqrt(Math.max(0, h) / 100) : 136 - ((h - 100) / 600) * 120); // square-root scale below 100 km
    const at = (h) => ALAYER.find((l) => h < l.to) || ALAYER[4];
    const inOz = (h) => h >= 15 && h <= 35;
    function enter() { const h = alt(), l = at(h); if (l.id !== S.last) { S.last = l.id; c.reveal(l.id); } if (inOz(h) && !S.oz) { S.oz = true; c.reveal('ozone'); } if (!inOz(h)) S.oz = false; }
    const TX = (T) => 372 + ((clamp(T, -100, 40) + 100) / 140) * 210;
    return {
      view: [600, 480], label: T2('Layers of the atmosphere', 'वायुमंडल की परतें'),
      chips: () => ALAYER.map((l) => ({ id: l.id, n: l.n })).concat([{ id: 'ozone', n: T2('Ozone layer', 'ओज़ोन परत') }]),
      controls: () => c.slider('altitude', T2('Height above the ground', 'ज़मीन से ऊँचाई'), 0, 1000, 1) + `<div class="ea-row">${c.btn('play', T2('Launch the rocket', 'रॉकेट छोड़ो'), 'ea-go', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4 3 5 8 4 13H8C7 10 8 5 12 2z" fill="#E2E8F0" stroke="#1E293B"/><path d="M9 16l-3 5 4-2M15 16l3 5-4-2" fill="#FF7A1A"/></svg>')}${c.btn('layer:ozone', T2('Ozone layer', 'ओज़ोन परत'))}</div>`,
      val: () => S.s, fmt: () => `${num(alt(), alt() < 20 ? 1 : 0)} ${c.t(T2('km', 'किमी'))}`,
      slide(n, v) { S.s = v; enter(); },
      act(key) {
        if (key === 'play') {
          const s0 = S.s >= 1000 ? 0 : S.s; c.busy = true; c.rec(T2('Launched a rocket through the atmosphere', 'वायुमंडल में रॉकेट छोड़ा'));
          c.run(9000 * (1 - s0 / 1000) + 500, (k) => { S.s = lerp(s0, 1000, k); enter(); c.refresh(); }, () => { c.busy = false; c.say(T2('You have reached space!', 'तुम अंतरिक्ष में पहुँच गए!')); c.refresh(); });
          return;
        }
        const id = key.slice(6), l = ALAYER.find((x) => x.id === id), h0 = alt(), h1 = id === 'ozone' ? 25 : l.id === 'troposphere' ? 6 : (l.from + Math.min(l.to, 650)) / 2;
        c.busy = true;
        c.run(800, (k) => { S.s = toS(lerp(h0, h1, ease(k))); c.refresh(); }, () => { c.busy = false; S.last = null; enter(); if (id === 'ozone') c.reveal('ozone'); c.say(id === 'ozone' ? T2('Ozone layer', 'ओज़ोन परत') : l.n); c.refresh(); });
      },
      scene() {
        const id = c.id, h = alt(), cur = at(h);
        const bands = ALAYER.map((l) => { const y1 = Y(Math.min(l.to, 700)), y2 = Y(l.from); return hot('layer:' + l.id, c.t(l.n), `<rect x="0" y="${r1(y1)}" width="340" height="${r1(y2 - y1)}" fill="${l.col}" ${cur.id === l.id ? 'stroke="#FFD23F" stroke-width="3"' : ''}/>`); }).join('');
        const names = ALAYER.map((l) => { const yy = (Y(Math.min(l.to, 700)) + Y(l.from)) / 2 + 6; return lbl(16, l.id === 'troposphere' ? Y(l.to) + 22 : yy, c.t(l.n), 'start', cur.id === l.id ? '' : 'sm'); }).join('') + lbl(16, Y(13) - 6, c.t(T2('tropopause 13 km', 'क्षोभसीमा 13 किमी')), 'start', 'sm') + `<line x1="0" x2="340" y1="${r1(Y(13))}" y2="${r1(Y(13))}" stroke="#fff" stroke-dasharray="5 5" opacity=".6"/>`;
        const curve = []; for (let a = 0; a <= 100; a += a < 20 ? 0.5 : 1) curve.push([TX(airT(a)), Y(a)]);
        const rx = 306, ry = Y(h);
        const T = airT(h);
        return `<defs><linearGradient id="${id}-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DAE4F"/><stop offset="1" stop-color="#2F7D3A"/></linearGradient></defs>
          <rect width="600" height="480" fill="#090B26"/>${stars(600, 140, 40, 13)}
          ${bands}
          ${hot('layer:ozone', c.t(T2('Ozone layer', 'ओज़ोन परत')), `<rect x="0" y="${r1(Y(35))}" width="340" height="${r1(Y(15) - Y(35))}" fill="#22D3EE" opacity="${inOz(h) ? 0.45 : 0.25}"/>`)}
          ${lbl(330, Y(25) + 6, c.t(T2('ozone layer', 'ओज़ोन परत')), 'end', 'sm')}
          <path d="M60 466L110 ${r1(Y(8.849))}L150 466Z" fill="#6B7280"/><path d="M98 ${r1(Y(7.5))}L110 ${r1(Y(8.849))}L122 ${r1(Y(7.5))}Z" fill="#fff"/>${lbl(132, Y(8.849) + 14, c.t(T2('Everest 8.8 km', 'एवरेस्ट 8.8 किमी')), 'start', 'sm')}
          ${cloud(220, Y(2), 0.8, '#fff', 0.9)}${cloud(290, Y(5), 0.6, '#fff', 0.8)}
          <path d="M196 ${r1(Y(11))}l24 -4 6 -6 4 0 -3 7 14 -2 4 -4 3 0 -2 6-46 6z" fill="#F8FAFC"/>${lbl(246, Y(11) - 2, c.t(T2('jet plane 11 km', 'जेट विमान 11 किमी')), 'start', 'sm')}
          <circle cx="150" cy="${r1(Y(32))}" r="9" fill="#F8FAFC"/><line x1="150" y1="${r1(Y(32) + 9)}" x2="150" y2="${r1(Y(32) + 22)}" stroke="#F8FAFC"/>${lbl(164, Y(32) + 4, c.t(T2('weather balloon', 'मौसम गुब्बारा')), 'start', 'sm')}
          ${[[150, 74], [210, 70], [270, 82]].map(([x, a]) => `<line x1="${x}" y1="${r1(Y(a + 8))}" x2="${x + 26}" y2="${r1(Y(a))}" stroke="#FFE27A" stroke-width="3" stroke-linecap="round"/>`).join('')}${lbl(170, Y(66), c.t(T2('meteors burn up', 'उल्काएँ जलती हैं')), 'start', 'sm')}
          <path d="M140 ${r1(Y(200))}q20 -18 40 0t40 0t40 0" stroke="#4ADE80" stroke-width="6" fill="none" opacity=".7" class="ea-bob"/>${lbl(270, Y(200) + 5, c.t(T2('aurora', 'ध्रुवीय ज्योति')), 'start', 'sm')}
          <g transform="translate(180 ${r1(Y(400))})"><rect x="-14" y="-4" width="28" height="8" fill="#CBD5E1"/><rect x="-34" y="-8" width="18" height="16" fill="#2563EB"/><rect x="16" y="-8" width="18" height="16" fill="#2563EB"/></g>${lbl(220, Y(400) + 5, c.t(T2('space station', 'अंतरिक्ष स्टेशन')), 'start', 'sm')}
          <rect y="466" width="340" height="14" fill="url(#${id}-ground)"/>
          ${names}
          <rect x="356" y="${r1(Y(100))}" width="236" height="${r1(Y(0) - Y(100))}" rx="10" fill="rgba(255,255,255,.08)"/>
          ${[-100, -50, 0, 40].map((t) => `<line x1="${r1(TX(t))}" x2="${r1(TX(t))}" y1="${r1(Y(100))}" y2="466" stroke="rgba(255,255,255,.2)"/><text x="${r1(TX(t))}" y="478" class="ea-lbl sm" text-anchor="middle">${t}°</text>`).join('')}
          ${[0, 5, 10, 20, 40, 60, 80, 100].map((a) => `<text x="354" y="${r1(Y(a) + 5)}" class="ea-lbl sm" text-anchor="end">${a}</text>`).join('')}
          <path d="${line(curve)}" stroke="#FF7A1A" stroke-width="4" fill="none"/>
          ${lbl(474, Y(100) - 8, c.t(T2('temperature (°C)', 'तापमान (°C)')), 'middle', 'sm')}
          ${lbl(474, 44, c.t(T2('Above 100 km the thin air', '100 किमी से ऊपर विरल हवा')), 'middle', 'sm')}${lbl(474, 64, c.t(T2('heats up to 1,000 °C or more', '1,000 °C या ज़्यादा तक गर्म होती है')), 'middle', 'sm')}
          ${h <= 100 ? `<circle cx="${r1(TX(T))}" cy="${r1(ry)}" r="8" fill="#FFD23F" stroke="#1E293B" stroke-width="2"/>` : ''}
          <line x1="0" x2="${h <= 100 ? r1(TX(T)) : 340}" y1="${r1(ry)}" y2="${r1(ry)}" stroke="#FFD23F" stroke-dasharray="4 5" stroke-width="2"/>
          <g transform="translate(${rx} ${r1(ry)})"><path d="M0 -26c8 6 10 16 8 26h-16c-2-10 0-20 8-26z" fill="#F1F5F9" stroke="#1E293B" stroke-width="2"/><circle cy="-10" r="4" fill="#3B82F6"/><path d="M-8 0l-6 10 8-4M8 0l6 10-8-4" fill="#FF7A1A"/>${c.busy ? '<path d="M-5 6l5 14 5-14z" fill="#FFD23F"/>' : ''}</g>`;
      },
      panel() {
        const h = alt(), l = at(h), T = airT(h), p = airP(h);
        const oz = inOz(h) ? T2('You are in the ozone layer (about 15–35 km), the Earth’s sunscreen.', 'तुम ओज़ोन परत (लगभग 15–35 किमी) में हो, जो पृथ्वी की सनस्क्रीन है।') : null;
        return c.card({ title: l.n, dot: l.col, paras: [l.about, oz], facts: [[T2('Layer', 'परत'), `${num(l.from)}–${l.id === 'exosphere' ? '…' : num(l.to)} ${c.t(T2('km', 'किमी'))}`], [T2('Height', 'ऊँचाई'), `${num(h, h < 20 ? 1 : 0)} ${c.t(T2('km', 'किमी'))}`], [T2('Temperature', 'तापमान'), `${c.t(T2('about', 'लगभग'))} ${num(Math.round(T))} °C`], [T2('Air pressure', 'वायुदाब'), `${p >= 100 ? num(p, 0) : num(sig(p, 3), p < 1 ? 4 : 1)} hPa (${num(sig((p / 1013.25) * 100, 2), p < 10 ? 3 : 0)}%)`]].concat(l.id === 'troposphere' ? [[T2('Air is made of', 'हवा में'), T2('nitrogen 78%, oxygen 21%, argon 0.9%, carbon dioxide 0.04%', 'नाइट्रोजन 78%, ऑक्सीजन 21%, आर्गन 0.9%, कार्बन डाइऑक्साइड 0.04%')]] : []) });
      },
    };
  };

  // ================================================================ control keys and events, per mode (pure; used by keys())
  function spec(mode, region) {
    const india = region === 'india';
    const L0 = (ids) => ids.map((x) => 'layer:' + x), RV = (ids) => ids.map((x) => 'revealed:' + x);
    switch (mode) {
      case 'layers': { const ids = LAYERS.map((l) => l.id); return { t: ['slider:depth', 'play', ...L0(ids)], e: RV(ids) }; }
      case 'rock-cycle': return { t: [...PROC_IDS.map((p) => 'toggle:' + p), ...ROCK_IDS.map((r) => 'rock:' + r)], e: [...RV(ROCK_IDS), ...ROCK_IDS.map((r) => 'formed:' + r), 'formed:igneous', 'formed:sedimentary', 'formed:metamorphic', 'formed:magma', 'formed:sediment', 'eroded', 'erupted', 'cycle-done'] };
      case 'soil': { const soils = TEX_IDS.concat(india ? INSOIL_IDS : []); const hz = HORIZON.map((h) => h.id); return { t: [...L0(hz), ...soils.map((s) => 'toggle:' + s), 'drop'], e: [...RV(hz), ...RV(soils), 'rained'] }; }
      case 'volcano': return { t: ['slider:silica', 'slider:gas', 'play', ...L0(VPART_IDS)], e: [...RV(VPART_IDS), 'erupted'] };
      case 'earthquake': return { t: ['slider:magnitude', 'slider:depth', 'play', 'toggle:shadow', 'layer:focus', 'layer:epicentre'], e: ['shook', 'revealed:focus', 'revealed:epicentre', 'revealed:shadow-zone'] };
      case 'plates': return { t: [...BOUND_IDS.map((b) => 'toggle:' + b), 'slider:time', 'play'], e: [...RV(Object.keys(FORMN)), 'erupted', 'shook'] };
      case 'water-cycle': return { t: ['slider:sun', 'play', 'drop', ...L0(WPROC_IDS)], e: [...RV(WPROC_IDS), 'rained', 'cycle-done'] };
      case 'weather': return { t: ['slider:temperature', 'slider:humidity', 'slider:wind', 'play', ...L0(INSTR_IDS)], e: [...RV(INSTR_IDS), 'rained'] };
      case 'winds': { const loc = india ? LOCALW_IDS : []; return { t: ['toggle:coriolis', 'toggle:coast', 'slider:month', 'slider:hour', ...L0(WIND_IDS), ...L0(loc)], e: [...RV(WIND_IDS), 'revealed:sea-breeze', 'revealed:land-breeze', ...RV(loc)] }; }
      case 'monsoon': return { t: ['slider:month', 'play', ...L0(Object.keys(MPLACE))], e: [...RV(Object.values(SEASON_ID)), ...RV(Object.keys(MPLACE)), 'rained', 'cycle-done'] };
      case 'erosion': { const f = Object.keys(LFORM).concat('cliff'); return { t: [...AGENT_IDS.map((a) => 'toggle:' + a), 'toggle:plants', 'slider:time', 'play', ...L0(f)], e: ['eroded', ...RV(f)] }; }
      case 'groundwater': return { t: ['slider:rain', 'slider:pumping', 'toggle:harvest', 'toggle:paved', 'play', 'drop', ...L0(GPART_IDS)], e: ['rained', ...RV(GPART_IDS), 'revealed:dry-well'] };
      case 'atmosphere-layers': { const ids = ALAYER.map((l) => l.id).concat('ozone'); return { t: ['slider:altitude', 'play', ...L0(ids)], e: RV(ids) }; }
    }
    return { t: [], e: [] };
  }

  // ================================================================ the shared frame: stage, controls, info, progress chips
  function mount(root, cfg, api) {
    const mode = cfg.mode, region = cfg.region || defRegion(mode);
    const id = 'ea' + ++INST;
    const t = (x) => api.t(x);
    const stops = new Set();
    const found = new Set();
    let M = null;
    const photo = api.asset ? api.asset(ASSET[mode]) : null;
    root.innerHTML = `<div class="ea" data-mode="${mode}">
      <div class="ea-top"><span class="ea-badge">${ICON}<span>${esc(t(MODE_NAME[mode]))}</span></span><p class="ea-tag">${esc(t(MODE_TAG[mode]))}</p></div>
      <div class="ea-body">
        <div class="ea-stage"><svg class="ea-svg" role="group"></svg></div>
        <div class="ea-side"><div class="ea-ctrl"></div><div class="ea-info" aria-live="polite"></div><div class="ea-chips"></div></div>
      </div></div>`;
    const svg = root.querySelector('.ea-svg'), ctrl = root.querySelector('.ea-ctrl'), info = root.querySelector('.ea-info'), chips = root.querySelector('.ea-chips');
    const c = {
      id, t, region, api, svg, busy: false,
      lang: () => (api.lang ? api.lang() : 'en'),
      emit: (e) => api.emit(e),
      reveal(name) { found.add(name); api.emit('revealed:' + name); paintChips(); },
      run(ms, step, done) { let s = null; s = L.tween(ms, step, () => { if (s) stops.delete(s); if (done) done(); }); stops.add(s); return s; },
      loop(fn) {
        if (L.reducedMotion() || typeof requestAnimationFrame === 'undefined') { try { fn(0, 0); } catch (e) { /* first frame only */ } return () => {}; }
        let on = true, last = performance.now();
        const f = (now) => { if (!on) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; fn(dt, now / 1000); requestAnimationFrame(f); };
        requestAnimationFrame(f);
        const s = () => { on = false; }; stops.add(s); return s;
      },
      fx: () => svg.querySelector('#' + id + '-fx'),
      toast: (x) => api.toast && api.toast(x),
      say: (x) => api.speak && api.speak(t(x)),
      rec: (x) => api.record && api.record(t(x)),
      celebrate: () => api.celebrate && api.celebrate(),
      slider(name, label, min, max, step) {
        return `<label class="ea-sl"><span class="ea-sl-top"><span>${esc(t(label))}</span><b data-out="${name}" aria-hidden="true"></b></span><input type="range" data-key="slider:${name}" min="${min}" max="${max}" step="${step}" value="${M.val(name)}" aria-label="${esc(t(label))}"></label>`;
      },
      btn: (key, label, cls, icon) => `<button type="button" class="ea-btn ${cls || ''}" data-key="${key}">${icon || ''}<span>${esc(t(label))}</span></button>`,
      card(o) {
        const tt = (x) => esc(t(x));
        return (photo ? `<img src="${esc(photo)}" alt="" style="width:100%;border-radius:12px;margin-bottom:8px;display:block">` : '')
          + `<h4>${o.dot ? `<i style="background:${o.dot}"></i>` : ''}${tt(o.title)}</h4>`
          + (o.paras || []).filter(Boolean).map((p) => `<p>${tt(p)}</p>`).join('')
          + (o.warn ? `<p class="ea-warn">${tt(o.warn)}</p>` : '')
          + (o.facts && o.facts.length ? `<div class="ea-facts">${o.facts.map(([k, v]) => `<div class="ea-fact"><span>${tt(k)}</span><b>${tt(v)}</b></div>`).join('')}</div>` : '')
          + (o.ex ? `<p class="ea-ex" style="margin-top:8px">${tt(o.ex)}</p>` : '');
      },
      redraw() {
        const a = document.activeElement, fk = a && svg.contains(a) && a.dataset ? a.dataset.key : null;
        svg.innerHTML = M.scene();
        if (fk) { const el = svg.querySelector(`[data-key="${fk}"]`); if (el) el.focus(); }
      },
      refreshPanel() { info.innerHTML = M.panel(); },
      refresh() { c.redraw(); c.refreshPanel(); sync(); paintChips(); },
    };
    function paintChips() {
      const list = M.chips();
      const n = list.filter((x) => (x.on != null ? x.on : found.has(x.id))).length;
      chips.innerHTML = `<span>${esc(t(T2('Found', 'खोजे')))} ${n}/${list.length}</span>` + list.map((x) => `<span class="ea-chip ${(x.on != null ? x.on : found.has(x.id)) ? 'on' : ''}">${esc(t(x.n))}</span>`).join('');
    }
    function sync() {
      ctrl.querySelectorAll('button[data-key]').forEach((b) => { const p = M.pressed ? M.pressed(b.dataset.key) : null; if (p == null) b.removeAttribute('aria-pressed'); else b.setAttribute('aria-pressed', p ? 'true' : 'false'); });
      ctrl.querySelectorAll('input[type=range][data-key]').forEach((el) => { const n = el.dataset.key.slice(7), v = M.val(n); if (document.activeElement !== el || c.busy) el.value = v; const f = M.fmt(n); el.setAttribute('aria-valuetext', f); const o = ctrl.querySelector(`[data-out="${n}"]`); if (o) o.textContent = f; });
    }
    M = IMPL[mode](c);
    const [vw, vh] = M.view;
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('aria-label', t(M.label));
    ctrl.innerHTML = M.controls();
    const prev = {};
    ctrl.querySelectorAll('input[type=range][data-key]').forEach((el) => { prev[el.dataset.key] = el.value; });
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.tagName === 'INPUT') return;
      const key = el.dataset.key;
      if (c.busy) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      M.act(key, el);
      c.refresh();
    }
    function onInput(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type=range][data-key]')) return;
      const key = el.dataset.key;
      if (c.busy) { el.value = prev[key]; return; }
      if (!api.allowed(key)) { el.value = prev[key]; api.nudge(key); return; }
      prev[key] = el.value;
      M.slide(key.slice(7), +el.value);
      c.refresh();
    }
    function onChange(e) { const el = e.target; if (el.matches && el.matches('input[type=range][data-key]') && M.change && !c.busy && api.allowed(el.dataset.key)) M.change(el.dataset.key.slice(7), +el.value); }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('g[data-key]')) { e.preventDefault(); e.target.closest('g[data-key]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
    c.refresh();
    if (M.start) M.start();
    return {
      destroy() {
        stops.forEach((s) => { try { s(); } catch (e) { /* already stopped */ } });
        if (M.destroy) M.destroy();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey);
      },
    };
  }

  NCA_T.register({
    id: 'earth',
    css: CSS,
    validate(c) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      const e = [];
      Object.keys(c).forEach((k) => { if (k !== 'mode' && k !== 'region') e.push(`unknown key: ${k} (the earth template takes mode and region only)`); });
      if (!MODES.includes(c.mode)) e.push(`mode: one of ${MODES.join(', ')}`);
      if (c.region != null && !REGIONS.includes(c.region)) e.push(`region: 'india' or 'world'`);
      return e;
    },
    keys(c) {
      if (!c || !MODES.includes(c.mode)) return { targets: [], events: [] };
      const s = spec(c.mode, c.region || defRegion(c.mode));
      return { targets: s.t, events: s.e };
    },
    demo: { mode: 'monsoon', region: 'india' },
    modes: MODES,
    // Pure models, for tests under Node.
    model: { dewPoint, esat, airT, airP, layerAt, ROCK, SEDROCK, TEX, MON },
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
