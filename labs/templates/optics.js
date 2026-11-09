// Template: Optics bench. Plane, concave and convex mirrors, convex and concave lenses, a glass slab, a prism, the
// human eye with its defects and their correction, two thin lenses in contact, a pinhole camera and shadows.
// Every picture comes from the real formulas with the NCERT sign convention (light travels left to right; the pole or
// optical centre is the origin; distances against the light are negative): mirror 1/v + 1/u = 1/f, lens
// 1/v - 1/u = 1/f, m = -v/u (mirror) and v/u (lens), Snell's law n = sin i / sin r, the critical angle, the prism
// deviation D = i + e - A, lens power P = 1/f with P = P1 + P2 for lenses in contact, the eye's range 25 cm to
// infinity. Config:
//   { element: 'plane'|'concave-mirror'|'convex-mirror'|'convex-lens'|'concave-lens'|'slab'|'prism'|'eye'|
//              'combination'|'pinhole'|'shadow',
//     f?: cm 5–40, n?: 1.0–2.5, object?: cm from the element, eye?: 'normal'|'myopia'|'hypermetropia',
//     corrective?: boolean (eye: start with the right glasses on), white_light?: boolean (prism),
//     angle?: degrees 0–85 (slab, prism), f2?: cm 5–40 (combination: the second lens) }
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp, lerp } = L;
  const ELEMENTS = ['plane', 'concave-mirror', 'convex-mirror', 'convex-lens', 'concave-lens', 'slab', 'prism', 'eye', 'combination', 'pinhole', 'shadow'];
  const EYES = ['normal', 'myopia', 'hypermetropia'];
  const LENS_PICKS = ['none', 'convex', 'concave'];
  const KNOWN = ['element', 'f', 'f2', 'n', 'object', 'eye', 'corrective', 'white_light', 'angle'];
  const CSS = `.op { display: flex; flex-direction: column; gap: 12px; }
.op-svg { width: 100%; height: auto; display: block; border-radius: 16px; background: #0B1026; }
.op-svg text { font-family: var(--font-body); }
.op-lbl { font-size: 13px; font-weight: 700; fill: #DCE5FF; }
.op-lbl.dim { fill: #9FB0D8; font-weight: 600; font-size: 12px; }
.op-big { font-family: var(--font-display); font-weight: 800; font-size: 15px; fill: #FFD23F; }
.op-narrow .op-lbl { font-size: 18px; } .op-narrow .op-lbl.dim { font-size: 16px; } .op-narrow .op-big { font-size: 21px; }
.op-obj, .op-screen { cursor: grab; }
.op-obj:focus, .op-screen:focus, .op-btn:focus-visible { outline: none; }
.op-obj:focus .op-ring, .op-screen:focus .op-ring { stroke: #FFD23F; stroke-width: 3; opacity: 1; }
.op-ring { fill: none; stroke: #FFD23F; stroke-width: 2; opacity: 0; stroke-dasharray: 5 4; }
.op-obj:hover .op-ring, .op-screen:hover .op-ring { opacity: .7; }
.op-drag .op-obj, .op-drag .op-screen { cursor: grabbing; }
.op-ctl { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.op-sl { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px 8px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.op-sl label { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-weight: 700; font-size: .95rem; }
.op-sl output { font-family: var(--font-display); font-weight: 800; color: var(--royal); font-size: 1.15rem; white-space: nowrap; }
.op-sl input[type=range] { width: 100%; height: 44px; margin: 0; accent-color: #2563EB; cursor: pointer; }
.op-row { display: flex; flex-wrap: wrap; gap: 8px; }
.op-btn { border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; min-height: 44px; padding: 0 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: all .2s; }
.op-btn:hover { border-color: var(--royal); }
.op-btn[aria-pressed="true"] { background: var(--royal); border-color: var(--royal); color: #fff; }
:root[data-theme="dark"] .op-btn[aria-pressed="true"] { color: #061233; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .op-btn[aria-pressed="true"] { color: #061233; } }
.op-btn .op-ic { width: 26px; height: 18px; flex: none; }
.op-out { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.op-out p { margin: 0; }
.op-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.op-tag { border-radius: 999px; padding: 3px 12px; font-weight: 700; font-size: .86rem; background: var(--sunk); color: var(--ink); }
.op-tag.real { background: #FF7A1A; color: #1E293B; }
.op-tag.virtual { background: #8B3DFF; color: #fff; }
.op-tag.inf { background: #02CFF9; color: #1E293B; }
.op-tag.good { background: #22C55E; color: #1E293B; }
.op-tag.warn { background: #FFD23F; color: #1E293B; }
.op-eq { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; color: var(--royal); line-height: 1.35; }
.op-note { color: var(--ink-2); font-size: .95rem; }
@keyframes op-flicker { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.06, .94) } }
.op-flame { transform-origin: 50% 100%; transform-box: fill-box; animation: op-flicker 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .op-flame { animation: none; } .op-btn { transition: none; } }`;

  // ---- words (every label a child sees, in both languages) ----
  const W = {
    bench: { en: 'Optics bench', hi: 'प्रकाशिकी बेंच' },
    object: { en: 'Object (candle)', hi: 'वस्तु (मोमबत्ती)' },
    objDist: { en: 'Object distance', hi: 'वस्तु की दूरी' },
    lampDist: { en: 'Object distance from the lamp', hi: 'लैंप से वस्तु की दूरी' },
    focal: { en: 'Focal length', hi: 'फ़ोकस दूरी' },
    focal1: { en: 'Focal length of lens 1', hi: 'लेंस 1 की फ़ोकस दूरी' },
    angle: { en: 'Angle of incidence', hi: 'आपतन कोण' },
    index: { en: 'Refractive index of glass', hi: 'काँच का अपवर्तनांक' },
    rays: { en: 'Show rays', hi: 'किरणें दिखाओ' },
    white: { en: 'White light', hi: 'सफ़ेद प्रकाश' },
    screen: { en: 'Screen (drag it)', hi: 'पर्दा (इसे खींचो)' },
    screenAt: { en: 'Screen at', hi: 'पर्दा यहाँ' },
    dragHint: { en: 'Drag the candle or move the slider.', hi: 'मोमबत्ती को खींचो या स्लाइडर चलाओ।' },
    image: { en: 'Image', hi: 'प्रतिबिंब' },
    noImage: { en: 'No image forms: the rays come out parallel.', hi: 'कोई प्रतिबिंब नहीं बनता: किरणें समानांतर निकलती हैं।' },
    atInf: { en: 'at infinity', hi: 'अनंत पर' },
    real: { en: 'Real', hi: 'वास्तविक' },
    virtual: { en: 'Virtual', hi: 'आभासी' },
    inverted: { en: 'Inverted', hi: 'उल्टा' },
    erect: { en: 'Erect', hi: 'सीधा' },
    magnified: { en: 'Magnified', hi: 'बड़ा' },
    diminished: { en: 'Diminished', hi: 'छोटा' },
    sameSize: { en: 'Same size', hi: 'समान आकार' },
    sharp: { en: 'Sharp on the screen!', hi: 'पर्दे पर साफ़ प्रतिबिंब!' },
    blurry: { en: 'Blurry on the screen', hi: 'पर्दे पर धुँधला' },
    noScreen: { en: 'A virtual image cannot be caught on a screen.', hi: 'आभासी प्रतिबिंब पर्दे पर नहीं मिलता।' },
    inFront: { en: 'in front of the mirror', hi: 'दर्पण के सामने' },
    behind: { en: 'behind the mirror', hi: 'दर्पण के पीछे' },
    rightSide: { en: 'on the other side of the lens', hi: 'लेंस की दूसरी ओर' },
    leftSide: { en: 'on the same side as the object', hi: 'वस्तु की ओर ही' },
    lateral: { en: 'Left and right are swapped (lateral inversion).', hi: 'बायाँ और दायाँ बदल जाते हैं (पार्श्व परिवर्तन)।' },
    planeNote: { en: 'The image is as far behind the mirror as the candle is in front, and the same size.', hi: 'प्रतिबिंब दर्पण के पीछे उतनी ही दूर बनता है जितनी मोमबत्ती सामने है, और उतना ही बड़ा।' },
    mirrorF: { en: 'Mirror formula', hi: 'दर्पण सूत्र' },
    lensF: { en: 'Lens formula', hi: 'लेंस सूत्र' },
    magn: { en: 'Magnification', hi: 'आवर्धन' },
    power: { en: 'Power', hi: 'क्षमता' },
    refr: { en: 'Angle of refraction', hi: 'अपवर्तन कोण' },
    snell: { en: "Snell's law", hi: 'स्नेल का नियम' },
    shift: { en: 'Sideways shift', hi: 'पार्श्व विस्थापन' },
    slabNote: { en: 'The ray bends towards the normal entering the glass and away from it leaving; it comes out parallel to how it went in, only shifted sideways.', hi: 'किरण काँच में घुसते समय अभिलंब की ओर मुड़ती है और निकलते समय अभिलंब से दूर; वह उसी दिशा में निकलती है, बस थोड़ा खिसक कर।' },
    grazing: { en: 'The ray just grazes the surface.', hi: 'किरण सतह को छूकर निकलती है।' },
    emerge: { en: 'Angle of emergence', hi: 'निर्गत कोण' },
    dev: { en: 'Angle of deviation', hi: 'विचलन कोण' },
    critical: { en: 'Critical angle', hi: 'क्रांतिक कोण' },
    tir: { en: 'Total internal reflection!', hi: 'पूर्ण आंतरिक परावर्तन!' },
    tirNote: { en: 'Inside the glass the ray meets the second face at more than the critical angle, so it cannot come out: it reflects back inside.', hi: 'काँच के अंदर किरण दूसरी सतह पर क्रांतिक कोण से बड़े कोण पर पड़ती है, इसलिए बाहर नहीं निकल पाती: वह अंदर ही परावर्तित हो जाती है।' },
    dispersed: { en: 'White light splits into seven colours: violet bends the most, red the least.', hi: 'सफ़ेद प्रकाश सात रंगों में बँट जाता है: बैंगनी सबसे ज़्यादा मुड़ता है, लाल सबसे कम।' },
    prismNote: { en: 'The prism bends the ray towards its thick base. Deviation D = i + e − A.', hi: 'प्रिज़्म किरण को अपने मोटे आधार की ओर मोड़ता है। विचलन D = i + e − A।' },
    minDev: { en: 'near minimum deviation', hi: 'न्यूनतम विचलन के पास' },
    colours: [{ en: 'Violet', hi: 'बैंगनी' }, { en: 'Indigo', hi: 'जामुनी' }, { en: 'Blue', hi: 'नीला' }, { en: 'Green', hi: 'हरा' }, { en: 'Yellow', hi: 'पीला' }, { en: 'Orange', hi: 'नारंगी' }, { en: 'Red', hi: 'लाल' }],
    eye: { en: 'Eye', hi: 'आँख' },
    retina: { en: 'retina', hi: 'रेटिना' },
    eyeLens: { en: 'eye lens', hi: 'नेत्र लेंस' },
    cornea: { en: 'cornea', hi: 'कॉर्निया' },
    glasses: { en: 'Glasses', hi: 'चश्मा' },
    lensNone: { en: 'No glasses', hi: 'बिना चश्मा' },
    lensConvex: { en: 'Convex lens', hi: 'उत्तल लेंस' },
    lensConcave: { en: 'Concave lens', hi: 'अवतल लेंस' },
    lens2: { en: 'Second lens', hi: 'दूसरा लेंस' },
    none: { en: 'None', hi: 'कोई नहीं' },
    eyeNormal: { en: 'Normal eye', hi: 'सामान्य आँख' },
    eyeMyopia: { en: 'Myopia (short sight)', hi: 'निकट दृष्टि दोष' },
    eyeHyper: { en: 'Hypermetropia (long sight)', hi: 'दूर दृष्टि दोष' },
    onRetina: { en: 'Sharp image on the retina', hi: 'रेटिना पर साफ़ प्रतिबिंब' },
    beforeRetina: { en: 'Image forms in front of the retina: blurry', hi: 'प्रतिबिंब रेटिना से पहले बनता है: धुँधला' },
    afterRetina: { en: 'Image forms behind the retina: blurry', hi: 'प्रतिबिंब रेटिना के पीछे बनता है: धुँधला' },
    tooClose: { en: 'Closer than 25 cm, even a normal eye cannot focus.', hi: '25 सेमी से पास, सामान्य आँख भी फ़ोकस नहीं कर पाती।' },
    farPoint: { en: 'Far point', hi: 'दूर बिंदु' },
    nearPoint: { en: 'Near point', hi: 'निकट बिंदु' },
    corrected: { en: 'Corrected! The right lens brings the image onto the retina.', hi: 'ठीक हो गया! सही लेंस प्रतिबिंब को रेटिना पर ले आता है।' },
    wrongLens: { en: 'This lens makes it worse. Try the other one.', hi: 'यह लेंस और बिगाड़ देता है। दूसरा आज़माओ।' },
    normalNoNeed: { en: 'A normal eye needs no glasses: this lens only spoils the focus.', hi: 'सामान्य आँख को चश्मा नहीं चाहिए: यह लेंस फ़ोकस बिगाड़ देता है।' },
    accomm: { en: 'The eye lens changes shape (accommodation) to focus from 25 cm to very far.', hi: 'नेत्र लेंस अपना आकार बदलकर (समंजन) 25 सेमी से बहुत दूर तक फ़ोकस करता है।' },
    myopiaNote: { en: 'A myopic eye cannot see far: the eye is too long or the lens too strong, so distant things focus in front of the retina. A concave lens corrects it.', hi: 'निकट दृष्टि वाली आँख दूर नहीं देख पाती: आँख लंबी या लेंस ज़्यादा शक्तिशाली है, इसलिए दूर की चीज़ें रेटिना से पहले फ़ोकस होती हैं। अवतल लेंस इसे ठीक करता है।' },
    hyperNote: { en: 'A hypermetropic eye cannot see near: close things focus behind the retina. A convex lens corrects it.', hi: 'दूर दृष्टि वाली आँख पास नहीं देख पाती: पास की चीज़ें रेटिना के पीछे फ़ोकस होती हैं। उत्तल लेंस इसे ठीक करता है।' },
    combNote: { en: 'Two thin lenses in contact act like one lens: P = P1 + P2.', hi: 'सटे हुए दो पतले लेंस एक लेंस की तरह काम करते हैं: P = P1 + P2।' },
    combined: { en: 'Combined', hi: 'संयुक्त' },
    pinhole: { en: 'Pinhole camera', hi: 'सूची-छिद्र कैमरा' },
    pinholeNote: { en: 'Light travels in straight lines through the tiny hole, so the top of the candle lands at the bottom: the image is inverted, and it grows when the screen moves away from the hole.', hi: 'प्रकाश छोटे छेद से सीधी रेखा में जाता है, इसलिए मोमबत्ती का ऊपरी भाग नीचे पहुँचता है: प्रतिबिंब उल्टा बनता है, और पर्दा छेद से दूर जाने पर बड़ा हो जाता है।' },
    holeToScreen: { en: 'Hole to screen', hi: 'छेद से पर्दा' },
    imgHeight: { en: 'Image height', hi: 'प्रतिबिंब की ऊँचाई' },
    shadow: { en: 'Shadow', hi: 'छाया' },
    shadowNote: { en: 'Light cannot pass through an opaque object, so a dark shadow falls on the screen. Bring the object nearer the lamp and the shadow grows.', hi: 'अपारदर्शी वस्तु से प्रकाश नहीं गुज़र पाता, इसलिए पर्दे पर काली छाया बनती है। वस्तु को लैंप के पास लाओ तो छाया बड़ी हो जाती है।' },
    shadowH: { en: 'Shadow height', hi: 'छाया की ऊँचाई' },
    lampToScreen: { en: 'Lamp to screen', hi: 'लैंप से पर्दा' },
    cm: { en: 'cm', hi: 'सेमी' },
    deg: { en: '°', hi: '°' },
    F: { en: 'F', hi: 'F' },
    C: { en: 'C', hi: 'C' },
    P: { en: 'P', hi: 'P' },
    O: { en: 'O', hi: 'O' },
    glass: { en: 'glass', hi: 'काँच' },
    air: { en: 'air', hi: 'हवा' },
    normalLine: { en: 'normal', hi: 'अभिलंब' },
    names: {
      plane: { en: 'Plane mirror', hi: 'समतल दर्पण' }, 'concave-mirror': { en: 'Concave mirror', hi: 'अवतल दर्पण' }, 'convex-mirror': { en: 'Convex mirror', hi: 'उत्तल दर्पण' },
      'convex-lens': { en: 'Convex lens', hi: 'उत्तल लेंस' }, 'concave-lens': { en: 'Concave lens', hi: 'अवतल लेंस' }, slab: { en: 'Glass slab', hi: 'काँच की पट्टी' },
      prism: { en: 'Prism', hi: 'प्रिज़्म' }, eye: { en: 'The eye', hi: 'आँख' }, combination: { en: 'Two lenses in contact', hi: 'सटे हुए दो लेंस' },
      pinhole: { en: 'Pinhole camera', hi: 'सूची-छिद्र कैमरा' }, shadow: { en: 'Shadows', hi: 'छाया' },
    },
    moved: { en: 'Moved the candle to', hi: 'मोमबत्ती यहाँ ले गए:' },
    setF: { en: 'Set the focal length to', hi: 'फ़ोकस दूरी रखी:' },
    setAngle: { en: 'Set the angle of incidence to', hi: 'आपतन कोण रखा:' },
    setN: { en: 'Set the refractive index to', hi: 'अपवर्तनांक रखा:' },
    movedScreen: { en: 'Moved the screen to', hi: 'पर्दा यहाँ ले गए:' },
    putLens: { en: 'Put on', hi: 'लगाया:' },
    raysOn: { en: 'Showed the rays', hi: 'किरणें दिखाईं' },
    raysOff: { en: 'Hid the rays', hi: 'किरणें छिपाईं' },
    whiteOn: { en: 'Switched to white light', hi: 'सफ़ेद प्रकाश चालू किया' },
    whiteOff: { en: 'Switched to one colour', hi: 'एक रंग का प्रकाश चालू किया' },
  };

  // ---- physics ----
  const DEG = Math.PI / 180;
  const fmt = (x, d = 1) => (Math.abs(x) >= 1000 ? '∞' : (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0$/, ''));
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
  // Mirror: u, f signed (NCERT); returns { v, m, kind }. Lens: same with the lens formula.
  function mirrorImage(uMag, fSigned) {
    const u = -uMag;
    if (Math.abs(u - fSigned) < 0.05 && fSigned < 0) return { v: Infinity, m: Infinity, kind: 'at-infinity' };
    const v = 1 / (1 / fSigned - 1 / u);
    const m = -v / u;
    return { v, m, kind: v < 0 ? 'real' : 'virtual' };
  }
  function lensImage(uMag, fSigned) {
    const u = -uMag;
    if (Math.abs(uMag - fSigned) < 0.05 && fSigned > 0) return { v: Infinity, m: Infinity, kind: 'at-infinity' };
    const v = 1 / (1 / fSigned + 1 / u);
    const m = v / u;
    return { v, m, kind: v > 0 ? 'real' : 'virtual' };
  }
  const asinDeg = (s) => Math.asin(clamp(s, -1, 1)) / DEG;
  // Refractive index of glass for each colour: dispersion grows with (n − 1), violet highest, red lowest.
  const COLOURS = [['#8B3DFF', 1.0], ['#4400F0', 0.68], ['#2563EB', 0.42], ['#22C55E', 0.05], ['#FFD23F', -0.2], ['#FF7A1A', -0.45], ['#E5484D', -0.75]];
  const nFor = (n, k) => n + 0.022 * ((n - 1) / 0.52) * k;
  function prismPath(i, n, A) {
    const r1 = asinDeg(Math.sin(i * DEG) / n);
    const r2 = A - r1;
    const crit = n > 1 ? asinDeg(1 / n) : 90;
    if (r2 >= crit - 1e-9 || n <= 1 && r2 > 90) return { r1, r2, crit, tir: true };
    const e = asinDeg(n * Math.sin(r2 * DEG));
    return { r1, r2, crit, tir: false, e, D: i + e - A };
  }
  // Eye: distances in cm; image distance behind the eye lens for an object at u, given the eye's power range.
  const EYE = { len: 2.3, nearNormal: 25 };
  function eyeState(kind, u, pick) {
    // Normal: P ranges so that objects from 25 cm to infinity focus on the retina. Myopia: the relaxed eye is too
    // strong (far point 100 cm). Hypermetropia: the eye cannot strengthen enough (near point 75 cm).
    const Pret = 100 / EYE.len; // dioptres needed for a far object on the retina (len in cm → 1/m)
    const Pmin = kind === 'myopia' ? Pret + 1 : Pret; // relaxed eye
    const Pmax = kind === 'hypermetropia' ? Pret + 100 / 75 : Pret + 100 / 25; // fully accommodated
    const Pg = pick === 'convex' ? +1.333 : pick === 'concave' ? -1 : 0; // glasses: +1.33 D (f = 75 cm) or −1 D (f = −100 cm)
    const need = Pret + 100 / u - Pg; // eye power that would put this object on the retina (with the glasses)
    const P = clamp(need, Pmin, Pmax);
    const v = 100 / (P + Pg - 100 / u); // where the image really forms, cm behind the eye lens
    const d = v - EYE.len; // + behind the retina, − in front
    return { P, Pg, v, d, ok: Math.abs(d) < 0.03, farPoint: kind === 'myopia' ? 100 : Infinity, nearPoint: kind === 'hypermetropia' ? 75 : 25 };
  }

  // ---- scene helpers ----
  const Y0 = 250, HCM = 14; // the element's pole / optical centre, the principal axis, the candle's height
  const RAY = ['#FF7A1A', '#8B3DFF', '#22C55E'];
  const sceneDefs = `<defs>
      <linearGradient id="op-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101A3F"/><stop offset="1" stop-color="#0B1026"/></linearGradient>
      <linearGradient id="op-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2340"/><stop offset="1" stop-color="#1A1530"/></linearGradient>
      <linearGradient id="op-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FE6FF" stop-opacity=".55"/><stop offset=".5" stop-color="#DDF7FF" stop-opacity=".25"/><stop offset="1" stop-color="#9FE6FF" stop-opacity=".55"/></linearGradient>
      <linearGradient id="op-mirror" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E8F1FF"/><stop offset="1" stop-color="#8FB3E6"/></linearGradient>
      <radialGradient id="op-glow"><stop offset="0" stop-color="#FFF4C2" stop-opacity=".9"/><stop offset="1" stop-color="#FFB020" stop-opacity="0"/></radialGradient>
      <radialGradient id="op-lamp"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".4" stop-color="#FFE38A"/><stop offset="1" stop-color="#FF9A1F" stop-opacity=".2"/></radialGradient>
      <filter id="op-blur"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id="op-soft"><feGaussianBlur stdDeviation="1"/></filter>
      <pattern id="op-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#1C2B5E" stroke-width="1"/></pattern>
    </defs>`;
  const backdropFor = (VW) => `${sceneDefs}<rect width="${VW}" height="460" fill="url(#op-sky)"/><rect width="${VW}" height="460" fill="url(#op-grid)" opacity=".55"/>`;
  // A candle standing at (0,0), height h px upward. ghost = a virtual image (pale, dashed).
  function candle(h, ghost, mark) {
    const body = Math.max(4, h * 0.62), fw = Math.max(3, h * 0.14), fh = h - body;
    const st = ghost ? 'stroke="#C4A5FF" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"' : '';
    return `<g>${ghost ? '' : `<ellipse cx="0" cy="${-h + fh * 0.45}" rx="${fw * 2.6}" ry="${fh * 1.3}" fill="url(#op-glow)"/>`}
      <rect x="${-fw}" y="${-body}" width="${fw * 2}" height="${body}" rx="${fw * 0.5}" fill="${ghost ? '#6B4FBF' : '#F5E6C8'}" fill-opacity="${ghost ? 0.45 : 1}" ${st}/>
      ${ghost ? '' : `<rect x="${-fw}" y="${-body}" width="${fw * 0.5}" height="${body}" rx="${fw * 0.25}" fill="#fff" opacity=".35"/>`}
      <line x1="0" y1="${-body}" x2="0" y2="${-body - fh * 0.3}" stroke="#444" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
      <path class="${ghost ? '' : 'op-flame'}" d="M0 ${-h} C ${fw * 1.6} ${-h + fh * 0.5} ${fw * 1.1} ${-body - fh * 0.1} 0 ${-body - fh * 0.1} C ${-fw * 1.1} ${-body - fh * 0.1} ${-fw * 1.6} ${-h + fh * 0.5} 0 ${-h} Z" fill="${ghost ? '#C4A5FF' : '#FF9A1F'}" fill-opacity="${ghost ? 0.55 : 1}" ${st}/>
      ${mark ? `<circle cx="${-fw * 1.9}" cy="${-body * 0.55}" r="${Math.max(2.5, fw * 0.45)}" fill="#02CFF9" stroke="#061233" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
      ${ghost ? '' : `<path d="M0 ${-h + fh * 0.35} C ${fw * 0.7} ${-h + fh * 0.65} ${fw * 0.5} ${-body - fh * 0.15} 0 ${-body - fh * 0.15} C ${-fw * 0.5} ${-body - fh * 0.15} ${-fw * 0.7} ${-h + fh * 0.65} 0 ${-h + fh * 0.35} Z" fill="#FFF3B0"/>`}
    </g>`;
  }
  const ln = (x1, y1, x2, y2, c, dash, w = 2.5) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${dash ? 'stroke-dasharray="7 5" opacity=".8"' : ''}/>`;
  // A ray from (x1,y1) that passes through (x2,y2): solid on to the frame edge, with an arrow head.
  function rayThrough(x1, y1, x2, y2, c, solidTo) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const far = solidTo != null ? solidTo : 900;
    const ex = x1 + ux * far, ey = y1 + uy * far;
    const mx = x1 + ux * Math.min(far, len * 0.55), my = y1 + uy * Math.min(far, len * 0.55);
    return ln(x1, y1, ex, ey, c) + arrow(mx, my, ux, uy, c);
  }
  const arrow = (x, y, ux, uy, c) => `<path d="M${(x - ux * 7 - uy * 5).toFixed(1)} ${(y - uy * 7 + ux * 5).toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}L${(x - ux * 7 + uy * 5).toFixed(1)} ${(y - uy * 7 - ux * 5).toFixed(1)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const txt = (x, y, s, cls = 'op-lbl', anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`;
  const axisMark = (x, label) => `<circle cx="${x}" cy="${Y0}" r="4" fill="#FFD23F"/>${txt(x, Y0 + 20, label, 'op-big')}`;
  const wordsOf = (tx, kind, m) => [kind === 'real' ? tx(W.real) : tx(W.virtual), m < 0 ? tx(W.inverted) : tx(W.erect), Math.abs(Math.abs(m) - 1) < 0.02 ? tx(W.sameSize) : Math.abs(m) > 1 ? tx(W.magnified) : tx(W.diminished)];

  function optics(root, cfg, api) {
    const el = cfg.element;
    const tx = (x) => api.t(x);
    const isMirror = el === 'concave-mirror' || el === 'convex-mirror';
    const isLens = el === 'convex-lens' || el === 'concave-lens' || el === 'combination';
    const S = {
      u: cfg.object != null ? cfg.object : el === 'eye' ? 300 : el === 'shadow' ? 40 : el === 'pinhole' ? 40 : 30,
      f: cfg.f != null ? cfg.f : 15, f2: cfg.f2 != null ? cfg.f2 : 20, n: cfg.n != null ? cfg.n : 1.5,
      angle: cfg.angle != null ? cfg.angle : el === 'prism' ? 45 : 40,
      white: !!cfg.white_light, rays: true,
      pick: el === 'eye' ? (cfg.corrective ? (cfg.eye === 'hypermetropia' ? 'convex' : cfg.eye === 'myopia' ? 'concave' : 'none') : 'none') : el === 'combination' && cfg.f2 != null ? 'convex' : 'none',
      eye: cfg.eye || 'normal',
      screen: el === 'pinhole' ? 15 : el === 'shadow' ? 80 : 50, sharp: false, lastKind: null, res: {},
    };
    const uMax = el === 'eye' ? 600 : 100, uMin = el === 'eye' ? 10 : 5;
    S.u = clamp(S.u, uMin, uMax);

    root.innerHTML = `<div class="op">
      <svg class="op-svg" viewBox="0 0 800 460" role="group" aria-label="${esc(tx(W.bench))}: ${esc(tx(W.names[el]))}"></svg>
      <div class="op-ctl"></div>
      <div class="op-row"></div>
      <div class="op-out" aria-live="polite"></div>
    </div>`;
    const svg = root.querySelector('svg'), ctl = root.querySelector('.op-ctl'), row = root.querySelector('.op-row'), out = root.querySelector('.op-out');
    // Two layouts: a wide scene (800 units) and a narrow one for phones (440 units), so text and controls stay big.
    let VW = 800, X0 = 470, narrow = false, sMax = 7;
    function layout() {
      const w = root.clientWidth || 800;
      narrow = w < 560; VW = narrow ? 440 : 800; X0 = el === 'concave-mirror' ? (narrow ? 300 : 540) : el === 'convex-lens' || el === 'combination' ? (narrow ? 200 : 400) : narrow ? 262 : 470; sMax = narrow ? 4.5 : 7;
      svg.setAttribute('viewBox', `0 0 ${VW} 460`);
      svg.classList.toggle('op-narrow', narrow);
    }
    const backdrop = () => backdropFor(VW);

    // ---- controls (built once; labels refreshed on each draw so a language switch shows) ----
    const sliders = [];
    if (el === 'eye') sliders.push({ key: 'object', min: 10, max: 600, step: 1, label: W.objDist, unit: W.cm, get: () => S.u, set: (v) => { S.u = v; }, say: W.moved });
    else if (['plane', 'concave-mirror', 'convex-mirror', 'convex-lens', 'concave-lens', 'combination', 'pinhole'].includes(el)) sliders.push({ key: 'object', min: 5, max: 100, step: 1, label: W.objDist, unit: W.cm, get: () => S.u, set: (v) => { S.u = v; }, say: W.moved });
    else if (el === 'shadow') sliders.push({ key: 'object', min: 5, max: 100, step: 1, label: W.lampDist, unit: W.cm, get: () => S.u, set: (v) => { S.u = v; }, say: W.moved });
    if (isMirror || isLens) sliders.push({ key: 'f', min: 5, max: 40, step: 1, label: el === 'combination' ? W.focal1 : W.focal, unit: W.cm, get: () => S.f, set: (v) => { S.f = v; }, say: W.setF });
    if (el === 'slab' || el === 'prism') {
      sliders.push({ key: 'angle', min: 0, max: 85, step: 1, label: W.angle, unit: W.deg, get: () => S.angle, set: (v) => { S.angle = v; }, say: W.setAngle });
      sliders.push({ key: 'n', min: 1, max: 2.5, step: 0.01, label: W.index, unit: '', get: () => S.n, set: (v) => { S.n = v; }, say: W.setN });
    }
    ctl.innerHTML = sliders.map((s) => `<div class="op-sl" data-key="slider:${s.key}"><label for="op-${s.key}"><span>${esc(tx(s.label))}</span><output id="op-${s.key}-o" for="op-${s.key}"></output></label><input type="range" id="op-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.get()}" aria-label="${esc(tx(s.label))}"></div>`).join('');
    sliders.forEach((s) => {
      const inp = ctl.querySelector('#op-' + s.key);
      let announced = null;
      inp.addEventListener('input', () => {
        if (!api.allowed('slider:' + s.key)) { api.nudge('slider:' + s.key); inp.value = s.get(); return; }
        s.set(Number(inp.value));
        draw();
        clearTimeout(announced);
        announced = setTimeout(() => { api.record(`${tx(s.say)} ${fmt(s.get(), s.key === 'n' ? 2 : 0)} ${tx(s.unit)}`.trim()); changed(); }, 250);
      });
    });
    const toggles = [{ key: 'toggle:rays', label: W.rays, on: () => S.rays, flip: () => { S.rays = !S.rays; api.record(tx(S.rays ? W.raysOn : W.raysOff)); }, ic: '<path d="M2 9h22m-6-5 6 5-6 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' }];
    if (el === 'prism') toggles.push({ key: 'toggle:white', label: W.white, on: () => S.white, flip: () => { S.white = !S.white; api.record(tx(S.white ? W.whiteOn : W.whiteOff)); if (S.white) api.emit('dispersed'); }, ic: '<rect x="1" y="2" width="24" height="14" rx="3" fill="#fff" stroke="currentColor"/>' });
    const picks = el === 'eye' || el === 'combination' ? LENS_PICKS : [];
    const lensIcon = (t) => t === 'convex' ? '<path d="M13 1c5 3 5 13 0 16c-5-3-5-13 0-16z" fill="#9FE6FF" stroke="currentColor" stroke-width="1.4"/>' : t === 'concave' ? '<path d="M8 1h10c-3 5-3 11 0 16H8c3-5 3-11 0-16z" fill="#9FE6FF" stroke="currentColor" stroke-width="1.4"/>' : '<circle cx="13" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/>';
    row.innerHTML = toggles.map((t) => `<button type="button" class="op-btn" data-key="${t.key}" aria-pressed="${t.on()}"><svg class="op-ic" viewBox="0 0 26 18" aria-hidden="true">${t.ic}</svg><span>${esc(tx(t.label))}</span></button>`).join('')
      + (picks.length ? `<span class="op-tags" role="group" aria-label="${esc(tx(el === 'eye' ? W.glasses : W.lens2))}">` + picks.map((p) => `<button type="button" class="op-btn" data-key="lens:${p}" aria-pressed="${S.pick === p}"><svg class="op-ic" viewBox="0 0 26 18" aria-hidden="true">${lensIcon(p)}</svg><span>${esc(tx(p === 'none' ? (el === 'eye' ? W.lensNone : W.none) : p === 'convex' ? W.lensConvex : W.lensConcave))}</span></button>`).join('') + '</span>' : '');
    row.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-key]');
      if (!b) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      const t = toggles.find((x) => x.key === key);
      if (t) { t.flip(); b.setAttribute('aria-pressed', String(t.on())); draw(); if (key === 'toggle:rays') api.emit('moved'); return; }
      if (key.startsWith('lens:')) {
        S.pick = key.slice(5);
        row.querySelectorAll('[data-key^="lens:"]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === key)));
        api.record(`${tx(W.putLens)} ${tx(S.pick === 'none' ? W.none : S.pick === 'convex' ? W.lensConvex : W.lensConcave)}`);
        draw();
        changed();
      }
    });

    // ---- dragging the candle and the screen (pointer + keyboard) ----
    let drag = null;
    const toScene = (ev) => { const r = svg.getBoundingClientRect(); return (ev.clientX - r.left) / r.width * 800; };
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-key="object"], [data-key="screen"]');
      if (!g || !S.res.s) return;
      const key = g.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      drag = { key, x0: toScene(e), u0: S.u, sc0: S.screen, ox0: S.res.objX };
      svg.setPointerCapture(e.pointerId);
      root.querySelector('.op').classList.add('op-drag');
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (toScene(e) - drag.x0) / S.res.s;
      if (drag.key === 'object' && S.res.uFromX) S.u = S.res.uFromX(drag.ox0 + dx * S.res.s);
      else if (drag.key === 'object') S.u = clamp(Math.round(drag.u0 - dx * (S.res.objDir || 1)), uMin, uMax);
      else S.screen = clamp(Math.round(drag.sc0 + dx * (S.res.scrDir || 1)), S.res.scrMin, S.res.scrMax);
      draw();
    });
    const endDrag = () => {
      if (!drag) return;
      const k = drag.key; drag = null;
      root.querySelector('.op').classList.remove('op-drag');
      if (k === 'object') api.record(`${tx(W.moved)} ${fmt(S.u, 0)} ${tx(W.cm)}`); else api.record(`${tx(W.movedScreen)} ${fmt(S.screen, 0)} ${tx(W.cm)}`);
      changed();
    };
    svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest('[data-key="object"], [data-key="screen"]');
      if (!g) return;
      const key = g.dataset.key, step = e.shiftKey ? 10 : 2;
      let d = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step; else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step; else if (e.key === 'Enter' || e.key === ' ') d = 5; else return;
      e.preventDefault();
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'object') { const nu = S.u + d * (S.res.objDir || 1) * -1; S.u = nu > uMax ? uMin : nu < uMin ? uMax : nu; api.record(`${tx(W.moved)} ${fmt(S.u, 0)} ${tx(W.cm)}`); }
      else { const ns = S.screen + d * (S.res.scrDir || 1); S.screen = ns > S.res.scrMax ? S.res.scrMin : ns < S.res.scrMin ? S.res.scrMax : ns; api.record(`${tx(W.movedScreen)} ${fmt(S.screen, 0)} ${tx(W.cm)}`); }
      draw(); changed();
      const again = svg.querySelector(`[data-key="${key}"]`); if (again) again.focus();
    });

    // After the child changes something: tell the engine what the picture now shows.
    function changed() {
      api.emit('moved');
      const r = S.res;
      if (r.kind) api.emit('image:' + r.kind);
      if (r.sharp) api.emit('image:sharp');
      if (r.refracted) api.emit('refracted');
      if (r.tir) api.emit('tir');
      if (r.dispersed) api.emit('dispersed');
      if (r.corrected) api.emit('corrected');
      if (r.celebrate) api.celebrate();
    }
    // The handle around a draggable thing (shown on hover/focus).
    const ring = (x, y, w, h) => `<rect class="op-ring" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
    const objGroup = (x, h, inner) => `<g class="op-obj" data-key="object" role="button" tabindex="0" aria-label="${esc(tx(W.object))}: ${fmt(S.u, 0)} ${esc(tx(W.cm))}" transform="translate(${x.toFixed(1)} ${Y0})"><rect x="-26" y="${-h - 16}" width="52" height="${h + 24}" fill="transparent"/>${ring(-22, -h - 12, 44, h + 18)}${inner}</g>`;
    const screenGroup = (x, h, label, solid) => `<g class="op-screen" data-key="screen" role="button" tabindex="0" aria-label="${esc(tx(W.screen))}: ${fmt(S.screen, 0)} ${esc(tx(W.cm))}" transform="translate(${x.toFixed(1)} ${Y0})"><rect x="-22" y="${-h - 14}" width="44" height="${2 * h + 28}" fill="transparent"/>${ring(-16, -h - 10, 32, 2 * h + 20)}<rect x="-4" y="${-h}" width="8" height="${2 * h}" rx="3" fill="#F6F1E4" fill-opacity="${solid ? 1 : 0.55}" stroke="#E9DFC6"/><rect x="-10" y="${h}" width="20" height="8" rx="3" fill="#8A7F6C"/>${x > VW - 70 ? txt(14, h + 24, label, 'op-lbl dim', 'end') : x < 70 ? txt(-14, h + 24, label, 'op-lbl dim', 'start') : txt(0, h + 24, label, 'op-lbl dim')}</g>`;

    // ---- the picture for each element: fills S.res (scale, image kind, flags) and returns { svg, out } ----
    const tags = (list) => `<div class="op-tags">${list.map(([c, t]) => `<span class="op-tag ${c}">${esc(t)}</span>`).join('')}</div>`;
    const hatch = (x, side, hh) => Array.from({ length: Math.floor(hh / 7) }, (_, i) => ln(x, Y0 - hh + i * 14 + 4, x + side * 10, Y0 - hh + i * 14 - 6, '#8FB3E6', false, 1.5)).join('');
    const mirrorShape = (kind, hh) => {
      const sag = kind === 'plane' ? 0 : kind === 'concave' ? -22 : 22;
      const d = kind === 'plane' ? `M${X0} ${Y0 - hh}V${Y0 + hh}` : `M${X0 + sag} ${Y0 - hh}Q${X0 - sag} ${Y0} ${X0 + sag} ${Y0 + hh}`;
      return `<g aria-hidden="true"><path d="${d}" fill="none" stroke="#5B7EC9" stroke-width="12" stroke-linecap="round" opacity=".5"/><path d="${d}" fill="none" stroke="url(#op-mirror)" stroke-width="6" stroke-linecap="round"/>${kind === 'plane' ? hatch(X0 + 3, 1, hh) : ''}</g>`;
    };
    const lensShape = (x, kind, hh, thick = 1) => {
      const w = 16 * thick;
      const d = kind === 'convex' ? `M${x} ${Y0 - hh}Q${x + w * 2} ${Y0} ${x} ${Y0 + hh}Q${x - w * 2} ${Y0} ${x} ${Y0 - hh}Z`
        : `M${x - w} ${Y0 - hh}H${x + w}Q${x + w * 0.2} ${Y0} ${x + w} ${Y0 + hh}H${x - w}Q${x - w * 0.2} ${Y0} ${x - w} ${Y0 - hh}Z`;
      return `<path d="${d}" fill="url(#op-glass)" stroke="#BDEFFF" stroke-width="2.5" stroke-linejoin="round"/>`;
    };
    const axis = () => ln(20, Y0, VW - 20, Y0, '#5A6FA6', false, 1.5) + `<path d="M20 ${Y0}h${VW - 40}" stroke="#9FB0D8" stroke-width="1" stroke-dasharray="2 8"/>`;

    function drawCurved() {
      const mirror = isMirror;
      const concave = el === 'concave-mirror', convexL = el === 'convex-lens';
      let fS = mirror ? (concave ? -S.f : S.f) : (el === 'concave-lens' ? -S.f : S.f);
      let P1 = 0, P2 = 0;
      if (el === 'combination') {
        P1 = 100 / S.f; P2 = S.pick === 'convex' ? 100 / S.f2 : S.pick === 'concave' ? -100 / S.f2 : 0;
        fS = Math.abs(P1 + P2) < 1e-6 ? Infinity : 100 / (P1 + P2);
      }
      const im = !isFinite(fS) ? { v: -S.u, m: 1, kind: 'virtual' } : mirror ? mirrorImage(S.u, fS) : lensImage(S.u, fS);
      const vAbs = isFinite(im.v) ? Math.abs(im.v) : 0;
      const roomL = X0 - 60, roomR = VW - X0 - 30;
      const imgRoom = isFinite(im.v) ? ((mirror ? im.v < 0 : im.v < 0) ? roomL : roomR) / Math.max(1, Math.min(vAbs, 220)) : 9;
      let s = clamp(Math.min(sMax, roomL / S.u, imgRoom, isFinite(fS) ? roomL / (2 * Math.abs(fS)) : 9, !mirror && isFinite(fS) ? roomR / (2 * Math.abs(fS)) : 9), 1.2, sMax);
      const mAbs = isFinite(im.m) ? Math.abs(im.m) : 0;
      if (mAbs > 0 && mAbs < 40) s = Math.max(1.2, Math.min(s, (im.m < 0 ? 175 : 190) / (Math.max(1, mAbs) * HCM)));
      const h = HCM * s, xo = X0 - S.u * s, yt = Y0 - h, hh = narrow ? 100 : 118;
      const fx = X0 + (isFinite(fS) ? fS * s : 0);
      const realSide = mirror ? -1 : 1;
      const screenOk = (concave || convexL || el === 'combination');
      const scrMax = Math.max(10, Math.min(100, Math.floor((realSide < 0 ? X0 - 40 : VW - X0 - 24) / s)));
      S.screen = clamp(S.screen, 5, scrMax);
      Object.assign(S.res, { s, kind: im.kind, objDir: 1, scrDir: realSide, scrMin: 5, scrMax, sharp: false });
      const xi = isFinite(im.v) ? X0 + im.v * s : null;
      const yi = xi != null ? Y0 - im.m * h : null;
      let g = backdrop() + axis();
      // focal points and centre of curvature / 2F
      if (isFinite(fS)) {
        const F1 = X0 - Math.abs(fS) * s, F2 = X0 + Math.abs(fS) * s;
        if (mirror) {
          const Fm = concave ? F1 : F2, Cm = concave ? X0 - 2 * Math.abs(fS) * s : X0 + 2 * Math.abs(fS) * s;
          g += axisMark(Fm, tx(W.F)) + axisMark(Cm, tx(W.C)) + `<circle cx="${X0}" cy="${Y0}" r="4" fill="#FFD23F"/>` + txt(X0 + (concave ? 16 : -16), Y0 + 20, tx(W.P), 'op-big');
        } else g += axisMark(F1, 'F₁') + axisMark(F2, 'F₂') + axisMark(X0 - 2 * Math.abs(fS) * s, '2F₁') + axisMark(X0 + 2 * Math.abs(fS) * s, '2F₂') + axisMark(X0, tx(W.O));
      }
      // the element
      if (mirror) g += mirrorShape(concave ? 'concave' : 'convex', hh);
      else if (el === 'combination') g += lensShape(X0 - 9, 'convex', hh) + (S.pick !== 'none' ? lensShape(X0 + 9, S.pick, hh) : `<path d="M${X0 + 9} ${Y0 - hh}V${Y0 + hh}" stroke="#9FB0D8" stroke-dasharray="4 4" fill="none"/>`);
      else g += lensShape(X0, convexL ? 'convex' : 'concave', hh);
      // rays
      if (S.rays) {
        const rays = [];
        const toImage = (px, py, dirx, diry, c) => {
          if (im.kind === 'real' && xi != null) { const len = Math.hypot(xi - px, yi - py); rays.push(rayThrough(px, py, xi, yi, c, len * 1.35)); }
          else if (im.kind === 'virtual' && xi != null) { rays.push(rayThrough(px, py, px + dirx, py + diry, c)); rays.push(ln(px, py, xi, yi, c, true, 2)); }
          else rays.push(rayThrough(px, py, px + dirx, py + diry, c));
        };
        // ray 1: parallel to the axis, then through (or away from) F
        rays.push(ln(xo, yt, X0, yt, RAY[0]) + arrow((xo + X0) / 2, yt, 1, 0, RAY[0]));
        if (mirror) { const Fm = concave ? X0 - Math.abs(fS) * s : X0 + Math.abs(fS) * s; const dx = concave ? Fm - X0 : X0 - Fm, dy = concave ? Y0 - yt : yt - Y0; toImage(X0, yt, dx, dy, RAY[0]); }
        else if (!isFinite(fS)) rays.push(rayThrough(X0, yt, X0 + 100, yt, RAY[0]));
        else { const F = fS > 0 ? X0 + fS * s : X0 + fS * s; const dx = fS > 0 ? F - X0 : X0 - F, dy = fS > 0 ? Y0 - yt : yt - Y0; toImage(X0, yt, dx, dy, RAY[0]); }
        // ray 2: to the pole (reflects at the same angle) or through the optical centre (straight on)
        rays.push(ln(xo, yt, X0, Y0, RAY[1]) + arrow((xo + X0) / 2, (yt + Y0) / 2, (X0 - xo) / Math.hypot(X0 - xo, Y0 - yt), (Y0 - yt) / Math.hypot(X0 - xo, Y0 - yt), RAY[1]));
        if (mirror) toImage(X0, Y0, -(X0 - xo), Y0 - yt, RAY[1]); else toImage(X0, Y0, X0 - xo, Y0 - yt, RAY[1]);
        // ray 3: concave mirror through C, convex lens through F1
        if (mirror && concave && isFinite(fS)) {
          const Cx = X0 - 2 * Math.abs(fS) * s;
          if (Math.abs(Cx - xo) > 2) { const y3 = yt + (Y0 - yt) * (X0 - xo) / (Cx - xo); if (Math.abs(y3 - Y0) < hh) { rays.push(ln(xo, yt, X0, y3, RAY[2]) + arrow((xo + X0) / 2, (yt + y3) / 2, 1, (y3 - yt) / Math.abs(X0 - xo), RAY[2])); toImage(X0, y3, xo - X0, yt - y3, RAY[2]); } }
        } else if (!mirror && isFinite(fS) && fS > 0 && el !== 'combination') {
          const F1 = X0 - fS * s;
          if (Math.abs(F1 - xo) > 2) { const y3 = yt + (Y0 - yt) * (X0 - xo) / (F1 - xo); if (Math.abs(y3 - Y0) < hh) { rays.push(ln(xo, yt, X0, y3, RAY[2]) + arrow((xo + X0) / 2, (yt + y3) / 2, 1, 0, RAY[2])); toImage(X0, y3, 100, 0, RAY[2]); } }
        }
        g += `<g aria-hidden="true">${rays.join('')}</g>`;
      }
      // the screen
      if (screenOk) {
        const xs = X0 + realSide * S.screen * s;
        const sharp = im.kind === 'real' && Math.abs(S.screen - vAbs) <= 2.5;
        const near = im.kind === 'real' && Math.abs(S.screen - vAbs) <= 14;
        S.res.sharp = sharp;
        let onScreen = '';
        if (near) { const b = sharp ? 0 : 1 + Math.abs(S.screen - vAbs) * 0.45; onScreen = `<g opacity="${sharp ? 1 : 0.7}" ${sharp ? '' : `filter="url(#op-blur)"`} transform="scale(${Math.abs(im.m).toFixed(3)} ${im.m.toFixed(3)})">${candle(h, false)}</g>`; if (!sharp) onScreen = `<g style="filter: blur(${b.toFixed(1)}px)">${onScreen}</g>`; }
        g += screenGroup(xs, 120, `${tx(W.screenAt)} ${fmt(S.screen, 0)} ${tx(W.cm)}`).replace('</g>', onScreen + '</g>');
      }
      // the image
      if (xi != null && Math.abs(im.m) < 40) g += `<g aria-hidden="true" transform="translate(${xi.toFixed(1)} ${Y0}) scale(${Math.abs(im.m).toFixed(3)} ${im.m.toFixed(3)})" opacity="${im.kind === 'real' ? 0.95 : 1}">${candle(h, im.kind === 'virtual')}</g>` + txt(xi, yi + (im.m > 0 ? -14 : 22), tx(W.image), 'op-lbl');
      g += objGroup(xo, h, candle(h, false));
      g += txt(xo, Y0 + 40, `${fmt(S.u, 0)} ${tx(W.cm)}`, 'op-lbl dim');
      g += txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      // the words
      const uS = -S.u, where = im.kind === 'real' ? (mirror ? tx(W.inFront) : tx(W.rightSide)) : (mirror ? tx(W.behind) : tx(W.leftSide));
      let o = '';
      if (im.kind === 'at-infinity') o = tags([['inf', `${tx(W.image)} ${tx(W.atInf)}`]]) + `<p>${esc(tx(W.noImage))}</p>`;
      else o = tags(wordsOf(tx, im.kind, im.m).map((t, i) => [i === 0 ? im.kind : '', t]).concat(S.res.sharp ? [['good', tx(W.sharp)]] : screenOk && im.kind === 'real' ? [['', tx(W.blurry)]] : screenOk ? [['warn', tx(W.noScreen)]] : [])) + `<p>${esc(tx(W.image))}: ${fmt(vAbs)} ${esc(tx(W.cm))} ${esc(where)}.</p>`;
      const eqMain = mirror ? `1/v + 1/u = 1/f` : `1/v − 1/u = 1/f`;
      const vals = `u = ${signed(uS)} ${tx(W.cm)}, f = ${isFinite(fS) ? signed(fS) : '∞'} ${tx(W.cm)}, v = ${im.kind === 'at-infinity' ? '∞' : signed(im.v) + ' ' + tx(W.cm)}`;
      o += `<div class="op-eq">${esc(eqMain)}  →  ${esc(vals)}</div>`;
      o += `<p class="op-note">${esc(tx(W.magn))} m = ${mirror ? '−v/u' : 'v/u'} = ${im.kind === 'at-infinity' ? '∞' : signed(im.m)}${!mirror && isFinite(fS) ? `  ·  ${esc(tx(W.power))} P = 1/f = ${signed(100 / fS)} D` : ''}</p>`;
      if (el === 'combination') o += `<p class="op-note">P₁ = ${signed(P1)} D, P₂ = ${signed(P2)} D, ${esc(tx(W.combined))} P = ${signed(P1 + P2)} D. ${esc(tx(W.combNote))}</p>`;
      return { svg: g, out: o };
    }

    function drawPlane() {
      const s = clamp(Math.min(sMax, (X0 - 60) / S.u, (VW - X0 - 30) / S.u), 1.2, sMax);
      const h = HCM * s, xo = X0 - S.u * s, xi = X0 + S.u * s, yt = Y0 - h;
      Object.assign(S.res, { s, kind: 'virtual', objDir: 1 });
      let g = backdrop() + axis() + mirrorShape('plane', 130) + txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      if (S.rays) {
        const r = [];
        [[yt, yt - 40], [yt, Y0 - 10]].forEach(([y0, ym], k) => {
          const px = X0, py = ym;
          const dx = px - xo, dy = py - y0;
          r.push(ln(xo, y0, px, py, RAY[k]) + arrow((xo + px) / 2, (y0 + py) / 2, dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy), RAY[k]));
          r.push(rayThrough(px, py, px - dx, py + dy, RAY[k]));
          r.push(ln(px, py, xi, yt, RAY[k], true, 2));
        });
        g += `<g aria-hidden="true">${r.join('')}</g>`;
      }
      g += `<g aria-hidden="true" transform="translate(${xi.toFixed(1)} ${Y0}) scale(-1 1)">${candle(h, true, true)}</g>` + txt(xi, Y0 + 20, `${fmt(S.u, 0)} ${tx(W.cm)}`, 'op-lbl dim') + txt(xi, yt - 14, tx(W.image), 'op-lbl');
      g += objGroup(xo, h, candle(h, false, true)) + txt(xo, Y0 + 20, `${fmt(S.u, 0)} ${tx(W.cm)}`, 'op-lbl dim');
      const o = tags([['virtual', tx(W.virtual)], ['', tx(W.erect)], ['', tx(W.sameSize)]]) + `<p>${esc(tx(W.image))}: ${fmt(S.u, 0)} ${esc(tx(W.cm))} ${esc(tx(W.behind))}. ${esc(tx(W.planeNote))}</p><p class="op-note">${esc(tx(W.lateral))}</p>`;
      return { svg: g, out: o };
    }

    // An angle arc at (cx,cy) from direction a1 to a2 (degrees, SVG sense), with a label.
    const arcLbl = (cx, cy, a1, a2, r, c, label) => {
      const p = (a) => [cx + r * Math.cos(a * DEG), cy + r * Math.sin(a * DEG)];
      let d = a2 - a1; while (d > 180) d -= 360; while (d < -180) d += 360;
      if (Math.abs(d) < 0.5) return '';
      const [x1, y1] = p(a1), [x2, y2] = p(a1 + d), [lx, ly] = p(a1 + d / 2);
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${c}" stroke-width="2"/>` + txt(lx + (lx - cx) * 0.55, ly + (ly - cy) * 0.55 + 5, label, 'op-lbl');
    };
    const normal = (x, y, ang, len = 70) => `<line x1="${(x - Math.cos(ang * DEG) * len).toFixed(1)}" y1="${(y - Math.sin(ang * DEG) * len).toFixed(1)}" x2="${(x + Math.cos(ang * DEG) * len).toFixed(1)}" y2="${(y + Math.sin(ang * DEG) * len).toFixed(1)}" stroke="#9FB0D8" stroke-width="1.5" stroke-dasharray="6 5"/>`;
    const dirLine = (x, y, ang, len, c, w = 3) => ln(x, y, x + Math.cos(ang * DEG) * len, y + Math.sin(ang * DEG) * len, c, false, w) + arrow(x + Math.cos(ang * DEG) * len * 0.6, y + Math.sin(ang * DEG) * len * 0.6, Math.cos(ang * DEG), Math.sin(ang * DEG), c);

    function drawSlab() {
      const i = S.angle, n = S.n, r = asinDeg(Math.sin(i * DEG) / n);
      const T = 6, px = narrow ? 17 : 22, tPx = T * px, RL = narrow ? 130 : 170; // slab 6 cm thick
      const P = [VW * 0.42, narrow ? 175 : 150], Q = [P[0] + Math.tan(r * DEG) * tPx, P[1] + tPx];
      const shift = T * Math.sin((i - r) * DEG) / Math.cos(r * DEG);
      Object.assign(S.res, { s: px, refracted: i > 0 && n > 1 });
      let g = backdrop() + txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      const sx0 = VW * 0.12, sw = VW * 0.76;
      g += `<rect x="${sx0}" y="${P[1]}" width="${sw}" height="${tPx}" rx="4" fill="url(#op-glass)" stroke="#BDEFFF" stroke-width="2.5"/>` + txt(sx0 + 20, P[1] + 22, tx(W.glass), 'op-lbl dim', 'start') + txt(sx0 + 20, P[1] - 10, tx(W.air), 'op-lbl dim', 'start') + txt(sx0 + 20, P[1] + tPx + 20, tx(W.air), 'op-lbl dim', 'start');
      const ai = 90 - i, ar = 90 - r; // direction angles (SVG: 90° is straight down)
      if (S.rays) g += normal(P[0], P[1], 90, 80) + normal(Q[0], Q[1], 90, 80);
      // the straight-through path for comparison
      g += ln(P[0], P[1], P[0] + Math.cos(ai * DEG) * RL * 1.9, P[1] + Math.sin(ai * DEG) * RL * 1.9, '#6B7BB0', true, 1.5);
      g += `<g aria-hidden="true">${dirLine(P[0] - Math.cos(ai * DEG) * RL, P[1] - Math.sin(ai * DEG) * RL, ai, RL, '#FFD23F')}`;
      g += ln(P[0], P[1], Q[0], Q[1], '#FF7A1A', false, 3) + arrow((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, Math.cos(ar * DEG), Math.sin(ar * DEG), '#FF7A1A');
      g += dirLine(Q[0], Q[1], ai, RL, '#FFD23F') + '</g>';
      if (S.rays) {
        g += arcLbl(P[0], P[1], 270, 270 - i, 46, '#FFD23F', `i = ${fmt(i, 0)}°`) + arcLbl(P[0], P[1], 90, 90 - r, 46, '#FF7A1A', `r = ${fmt(r, 0)}°`) + arcLbl(Q[0], Q[1], 90, 90 - i, 40, '#FFD23F', `e = ${fmt(i, 0)}°`);
        if (shift > 0.05) { const E = [Q[0] + Math.cos(ai * DEG) * RL * 0.8, Q[1] + Math.sin(ai * DEG) * RL * 0.8], pp = [Math.sin(ai * DEG), -Math.cos(ai * DEG)], E2 = [E[0] + pp[0] * shift * px, E[1] + pp[1] * shift * px]; g += ln(E[0], E[1], E2[0], E2[1], '#02CFF9', false, 2.5) + arrow(E2[0], E2[1], pp[0], pp[1], '#02CFF9') + arrow(E[0], E[1], -pp[0], -pp[1], '#02CFF9') + txt((E[0] + E2[0]) / 2 + pp[0] * 14 + 10, (E[1] + E2[1]) / 2 + pp[1] * 14 + 14, `${fmt(shift, 1)} ${tx(W.cm)}`, 'op-lbl'); }
      }
      const o = tags([['', `i = ${fmt(i, 0)}°`], ['real', `r = ${fmt(r, 1)}°`], ['', `e = ${fmt(i, 0)}°`], ['inf', `${tx(W.shift)} ${fmt(shift, 1)} ${tx(W.cm)}`]])
        + `<div class="op-eq">${esc(tx(W.snell))}: n = sin i / sin r = ${i > 0 ? `${fmt(Math.sin(i * DEG), 3)} / ${fmt(Math.sin(r * DEG), 3)} = ` : ''}${fmt(n, 2)}</div><p class="op-note">${esc(tx(W.slabNote))}</p>`;
      return { svg: g, out: o };
    }

    function drawPrism() {
      const A = 60, n = S.n, i = S.angle;
      const half = narrow ? 100 : 140, apex = [VW / 2, narrow ? 104 : 92], baseY = apex[1] + 2 * half * 0.866, bl = [VW / 2 - half, baseY], br = [VW / 2 + half, baseY], RL = narrow ? 120 : 190;
      const M1 = [(apex[0] + bl[0]) / 2, (apex[1] + bl[1]) / 2];
      const inN = 30; // the inward normal of the left face points 30° below the x axis
      Object.assign(S.res, { s: 1, refracted: true, tir: false, dispersed: false });
      let g = backdrop() + txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      g += `<path d="M${apex[0]} ${apex[1]}L${br[0]} ${br[1]}L${bl[0]} ${bl[1]}Z" fill="url(#op-glass)" stroke="#BDEFFF" stroke-width="2.5" stroke-linejoin="round"/>` + txt(apex[0], apex[1] - 12, `A = ${A}°`, 'op-lbl');
      const list = S.white ? COLOURS.map(([c, k]) => [c, nFor(n, k)]) : [['#FFD23F', n]];
      const inc = inN - i;
      const parts = [];
      let anyTir = false, allTir = true, firstPath = null;
      list.forEach(([c, nk], idx) => {
        const p = prismPath(i, nk, A);
        const dirIn = inN - p.r1;
        // where the inner ray meets the right face (apex → br)
        const fx = br[0] - apex[0], fy = br[1] - apex[1];
        const dx = Math.cos(dirIn * DEG), dy = Math.sin(dirIn * DEG);
        const den = dx * fy - dy * fx;
        const t = ((apex[0] - M1[0]) * fy - (apex[1] - M1[1]) * fx) / den;
        const M2 = [M1[0] + dx * t, M1[1] + dy * t];
        const w = S.white ? 2.2 : 3;
        parts.push(ln(M1[0], M1[1], M2[0], M2[1], c, false, w) + (idx === 0 ? arrow((M1[0] + M2[0]) / 2, (M1[1] + M2[1]) / 2, dx, dy, c) : ''));
        if (p.tir) {
          anyTir = true;
          const refl = 120 - dirIn; // reflected inside off the right face (face direction 60°)
          const tb = (bl[1] - M2[1]) / Math.sin(refl * DEG);
          const B = [M2[0] + Math.cos(refl * DEG) * tb, M2[1] + Math.sin(refl * DEG) * tb];
          parts.push(ln(M2[0], M2[1], B[0], B[1], c, false, w) + arrow((M2[0] + B[0]) / 2, (M2[1] + B[1]) / 2, Math.cos(refl * DEG), Math.sin(refl * DEG), c));
          const ib = Math.abs(refl - 90);
          if (Math.sin(ib * DEG) * nk < 1) { const eb = asinDeg(nk * Math.sin(ib * DEG)); const outA = 90 + Math.sign(refl - 90) * eb; parts.push(dirLine(B[0], B[1], outA, 110, c, w)); }
          else parts.push(dirLine(B[0], B[1], 180 - refl, 90, c, w));
        } else {
          allTir = false;
          const outA = -30 + p.e;
          parts.push(dirLine(M2[0], M2[1], outA, narrow ? 150 : 260, c, w));
        }
        if (idx === 0) firstPath = Object.assign({ M2 }, p);
        if (idx === list.length - 1 && S.white) firstPath.last = Object.assign({ M2 }, p);
      });
      S.res.tir = anyTir; S.res.dispersed = S.white && !allTir;
      g += `<g aria-hidden="true">${dirLine(M1[0] - Math.cos(inc * DEG) * RL, M1[1] - Math.sin(inc * DEG) * RL, inc, RL, S.white ? '#FFFFFF' : '#FFD23F')}${parts.join('')}</g>`;
      if (S.rays) {
        g += normal(M1[0], M1[1], inN, 70) + normal(firstPath.M2[0], firstPath.M2[1], -30, 70);
        g += arcLbl(M1[0], M1[1], inN + 180, inc + 180, 44, '#FFD23F', `i = ${fmt(i, 0)}°`) + arcLbl(M1[0], M1[1], inN, inN - firstPath.r1, 44, '#FF7A1A', `r₁ = ${fmt(firstPath.r1, 0)}°`);
        if (!firstPath.tir) g += arcLbl(firstPath.M2[0], firstPath.M2[1], -30, -30 + firstPath.e, 40, '#FFD23F', `e = ${fmt(firstPath.e, 0)}°`);
      }
      const p = firstPath;
      let o;
      if (p.tir) o = tags([['warn', tx(W.tir)], ['', `${tx(W.critical)} = ${fmt(p.crit, 1)}°`], ['', `r₂ = ${fmt(p.r2, 1)}°`]]) + `<p>${esc(tx(W.tirNote))}</p>`;
      else {
        const near = Math.abs(i - p.e) < 2.5;
        o = tags([['', `i = ${fmt(i, 0)}°`], ['real', `r₁ = ${fmt(p.r1, 1)}°`], ['real', `r₂ = ${fmt(p.r2, 1)}°`], ['', `e = ${fmt(p.e, 1)}°`], ['inf', `D = ${fmt(p.D, 1)}°`]].concat(near ? [['good', tx(W.minDev)]] : []));
        o += `<div class="op-eq">D = i + e − A = ${fmt(i, 0)} + ${fmt(p.e, 1)} − ${A} = ${fmt(p.D, 1)}°  ·  r₁ + r₂ = A</div>`;
        if (S.white && p.last && !p.last.tir) o += `<p>${esc(tx(W.dispersed))} ${esc(tx(W.colours[0]))}: D = ${fmt(p.D, 1)}°, ${esc(tx(W.colours[6]))}: D = ${fmt(p.last.D, 1)}°.</p>`;
        o += `<p class="op-note">${esc(tx(W.prismNote))} ${esc(tx(W.critical))}: sin C = 1/n → C = ${fmt(p.crit, 1)}°.</p>`;
      }
      return { svg: g, out: o };
    }

    function drawEye() {
      const st = eyeState(S.eye, S.u, S.pick);
      const t = (Math.log(S.u) - Math.log(10)) / (Math.log(600) - Math.log(10));
      const k = narrow ? 0.78 : 1;
      const xo = narrow ? 128 - t * 100 : 300 - t * 250, h = narrow ? 70 - t * 34 : 96 - t * 48, yt = Y0 - h;
      const EL = narrow ? 236 : 545, RET = EL + 200 * k, ppc = 200 * k / EYE.len, GX = EL - 105 * k;
      Object.assign(S.res, { s: 1 / 0.5, objDir: 1, kind: null, sharp: st.ok, corrected: st.ok && S.pick !== 'none' && ((S.eye === 'myopia' && S.pick === 'concave') || (S.eye === 'hypermetropia' && S.pick === 'convex')), celebrate: false });
      const xBase = narrow ? 128 : 300, xRange = narrow ? 100 : 250;
      S.res.s = 1; S.res.objX = xo;
      S.res.uFromX = (x) => clamp(Math.round(Math.exp(Math.log(10) + (xBase - x) / xRange * (Math.log(600) - Math.log(10)))), 10, 600);
      let g = backdrop() + txt(VW / 2, 30, `${tx(W.names[el])}: ${tx(S.eye === 'normal' ? W.eyeNormal : S.eye === 'myopia' ? W.eyeMyopia : W.eyeHyper)}`, 'op-big');
      // the eyeball (cut open), cornea, lens, retina
      const fat = 1 + (st.P - (100 / EYE.len)) * 0.16;
      g += `<g aria-hidden="true"><ellipse cx="${EL + 100 * k}" cy="${Y0}" rx="${112 * k}" ry="${104 * k}" fill="#F6E7D8" stroke="#C9A98F" stroke-width="3"/>
        <path d="M${EL + 117 * k} ${Y0 - 96 * k}A${104 * k} ${104 * k} 0 0 1 ${EL + 117 * k} ${Y0 + 96 * k}" fill="none" stroke="#E5484D" stroke-width="${7 * k}" stroke-linecap="round"/>
        <path d="M${EL - 9 * k} ${Y0 - 58 * k}Q${EL - 45 * k} ${Y0} ${EL - 9 * k} ${Y0 + 58 * k}" fill="#BDEFFF" fill-opacity=".45" stroke="#7CC9E8" stroke-width="3"/>
        <path d="M${EL} ${Y0 - 48 * k}Q${EL + 16 * fat * k} ${Y0} ${EL} ${Y0 + 48 * k}Q${EL - 16 * fat * k} ${Y0} ${EL} ${Y0 - 48 * k}Z" fill="url(#op-glass)" stroke="#BDEFFF" stroke-width="2.5"/>
        <rect x="${EL - 6}" y="${Y0 - 80 * k}" width="12" height="${30 * k}" rx="5" fill="#C9A98F"/><rect x="${EL - 6}" y="${Y0 + 50 * k}" width="12" height="${30 * k}" rx="5" fill="#C9A98F"/>
        ${txt(EL, Y0 + 104 * k + 16, tx(W.eyeLens), 'op-lbl dim')}${txt(EL + 150 * k, Y0 - 104 * k - 12, tx(W.retina), 'op-lbl dim')}${txt(EL - 40 * k, Y0 - 76 * k, tx(W.cornea), 'op-lbl dim')}</g>`;
      // glasses
      if (S.pick !== 'none') g += `<g aria-hidden="true">${lensShape(GX, S.pick, 70 * k, 0.8 * k)}<rect x="${GX - 30 * k}" y="${Y0 + 74 * k}" width="${60 * k}" height="8" rx="4" fill="#5B7EC9"/>${txt(GX, Y0 + 104 * k + 16, `${tx(S.pick === 'convex' ? W.lensConvex : W.lensConcave)} ${signed(st.Pg)} D`, 'op-lbl dim')}</g>`;
      // rays: the tip of the candle through the lens edges to where they meet
      // The real focusing error is a fraction of a millimetre; it is drawn 6 times larger so the eye can see it.
      const fx = clamp(RET + st.d * ppc * 6, EL + 50 * k, RET + 120 * k);
      const hi = 8 * st.v / S.u; // cm, object taken as 8 cm tall
      const fyi = Y0 + hi * ppc;
      if (S.rays) {
        const a = 40 * k, spread = (S.pick === 'convex' ? 30 : S.pick === 'concave' ? 50 : 40) * k;
        const rays = [1, -1].map((k, idx) => {
          const c = RAY[idx];
          const gy = Y0 + k * a, ey = Y0 + k * spread;
          let d = S.pick !== 'none' ? ln(xo, yt, GX, gy, c) + ln(GX, gy, EL, ey, c) : ln(xo, yt, EL, ey, c);
          d += arrow((xo + (S.pick !== 'none' ? GX : EL)) / 2, (yt + (S.pick !== 'none' ? gy : ey)) / 2, 1, 0, c);
          // after the eye lens: to the focus, then on to the retina
          const endX = Math.max(fx, RET);
          const slope = (fyi - ey) / (fx - EL);
          const yAt = (x) => ey + slope * (x - EL);
          const stopX = Math.min(RET + 2, endX);
          d += ln(EL, ey, stopX, yAt(stopX), c, false, 2.5);
          if (fx > RET + 1) d += ln(RET, yAt(RET), fx, fyi, c, true, 2);
          return d;
        });
        g += `<g aria-hidden="true">${rays.join('')}</g>`;
      }
      // what lands on the retina
      const blur = Math.min(10, Math.abs(st.d) * 14);
      const retinaImg = `<g transform="translate(${RET - 4} ${Y0}) scale(${(Math.abs(hi) / 8 * (ppc * 8 / h)).toFixed(3)} ${(-Math.abs(hi) / 8 * (ppc * 8 / h)).toFixed(3)})">${candle(h, false)}</g>`;
      g += `<g aria-hidden="true" ${st.ok ? '' : `style="filter: blur(${blur.toFixed(1)}px)" opacity=".8"`}>${retinaImg}</g>`;
      if (!st.ok) g += `<circle cx="${fx.toFixed(1)}" cy="${fyi.toFixed(1)}" r="5" fill="#FFD23F" stroke="#061233" stroke-width="1.5"/>`;
      g += objGroup(xo, h, candle(h, false)) + txt(xo, Y0 + 20, `${S.u >= 600 ? '∞' : fmt(S.u, 0) + ' ' + tx(W.cm)}`, 'op-lbl dim');
      // the words
      const status = st.ok ? ['good', tx(W.onRetina)] : st.d < 0 ? ['warn', tx(W.beforeRetina)] : ['warn', tx(W.afterRetina)];
      let o = tags([status].concat(S.res.corrected ? [['good', tx(W.corrected)]] : []));
      if (S.eye === 'normal') o += `<p>${esc(tx(W.accomm))}${S.pick !== 'none' ? ' ' + esc(tx(W.normalNoNeed)) : S.u < 25 ? ' ' + esc(tx(W.tooClose)) : ''}</p>`;
      else if (S.eye === 'myopia') o += `<p>${esc(tx(W.myopiaNote))} ${esc(tx(W.farPoint))}: 100 ${esc(tx(W.cm))}.${S.pick === 'convex' ? ' ' + esc(tx(W.wrongLens)) : ''}</p>`;
      else o += `<p>${esc(tx(W.hyperNote))} ${esc(tx(W.nearPoint))}: 75 ${esc(tx(W.cm))}.${S.pick === 'concave' ? ' ' + esc(tx(W.wrongLens)) : ''}</p>`;
      o += `<div class="op-eq">${esc(tx(W.power))}: ${esc(tx(W.eyeLens))} P = ${fmt(st.P, 1)} D${S.pick !== 'none' ? `, ${esc(tx(W.glasses))} P = ${signed(st.Pg)} D (f = ${signed(100 / st.Pg)} ${esc(tx(W.cm))})` : ''}</div>`;
      return { svg: g, out: o };
    }

    function drawPinhole() {
      const XH = VW * 0.52, s = clamp(Math.min(sMax, (XH - 50) / S.u), 1.2, sMax);
      const h = HCM * s, xo = XH - S.u * s, yt = Y0 - h, xs = XH + S.screen * s, hi = HCM * S.screen / S.u, hpx = hi * s;
      Object.assign(S.res, { s, kind: 'real', objDir: 1, scrDir: 1, scrMin: 5, scrMax: 30 });
      let g = backdrop() + txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      const boxR = XH + 30 * s + 14;
      g += `<g aria-hidden="true"><rect x="${XH}" y="${Y0 - 120}" width="${boxR - XH}" height="240" rx="8" fill="#1E1A33" stroke="#4A4070" stroke-width="3"/><rect x="${XH - 3}" y="${Y0 - 6}" width="6" height="12" rx="3" fill="#FFD23F"/>${txt(XH, Y0 - 128, tx(W.pinhole), 'op-lbl dim')}</g>`;
      if (S.rays) {
        const c1 = RAY[0], c2 = RAY[1];
        g += `<g aria-hidden="true">${ln(xo, yt, XH, Y0, c1) + arrow((xo + XH) / 2, (yt + Y0) / 2, (XH - xo) / Math.hypot(XH - xo, Y0 - yt), (Y0 - yt) / Math.hypot(XH - xo, Y0 - yt), c1) + ln(XH, Y0, xs, Y0 + hpx, c1)}
          ${ln(xo, Y0 - 2, XH, Y0, c2) + ln(XH, Y0, xs, Y0 - 2 * S.screen / S.u, c2)}
          <path d="M${XH} ${Y0}L${xs} ${Y0 - 2 * S.screen / S.u}L${xs} ${Y0 + hpx}Z" fill="#FFD23F" opacity=".12"/></g>`;
      }
      const img = `<g transform="translate(0 0) scale(${(hi / HCM).toFixed(3)} ${(-hi / HCM).toFixed(3)})">${candle(h, false)}</g>`;
      g += screenGroup(xs, 110, `${tx(W.holeToScreen)} ${fmt(S.screen, 0)} ${tx(W.cm)}`, true).replace('</g>', `<g opacity=".95">${img}</g></g>`);
      g += objGroup(xo, h, candle(h, false)) + txt(xo, Y0 + 20, `${fmt(S.u, 0)} ${tx(W.cm)}`, 'op-lbl dim');
      const o = tags([['real', tx(W.real)], ['', tx(W.inverted)], [hi > HCM ? 'warn' : '', hi > HCM + 0.01 ? tx(W.magnified) : Math.abs(hi - HCM) < 0.01 ? tx(W.sameSize) : tx(W.diminished)]])
        + `<div class="op-eq">${esc(tx(W.imgHeight))} = ${HCM} × ${fmt(S.screen, 0)} / ${fmt(S.u, 0)} = ${fmt(hi, 1)} ${esc(tx(W.cm))}</div><p class="op-note">${esc(tx(W.pinholeNote))}</p>`;
      return { svg: g, out: o };
    }

    function drawShadow() {
      const XL = narrow ? 40 : 70, s = clamp(Math.min(6, (VW - XL - 70) / Math.max(S.screen, S.u, 20)), 1, 6);
      const h = HCM * s, xo = XL + S.u * s, xs = XL + S.screen * s, behind = S.screen > S.u;
      const sh = behind ? HCM * S.screen / S.u : 0, shPx = sh * s;
      Object.assign(S.res, { s, kind: null, objDir: -1, scrDir: 1, scrMin: 10, scrMax: 100 });
      let g = backdrop() + txt(VW / 2, 30, tx(W.names[el]), 'op-big');
      // light on the screen, then the shadow
      const top = Y0 - 150, bot = Y0 + 150;
      g += `<g aria-hidden="true"><polygon points="${XL},${Y0} ${xs},${top} ${xs},${bot}" fill="#FFD23F" opacity=".10"/></g>`;
      g += screenGroup(xs, 150, `${tx(W.lampToScreen)} ${fmt(S.screen, 0)} ${tx(W.cm)}`, true).replace('</g>', `<rect x="-4" y="-150" width="8" height="300" rx="3" fill="#FFF4C2"/>` + (behind ? `<rect x="-5" y="${(-Math.min(shPx, 300) / 2).toFixed(1)}" width="10" height="${Math.min(shPx, 300).toFixed(1)}" rx="2" fill="#1E1A33"/>` : '') + '</g>');
      if (S.rays && behind) {
        const umbra = `<polygon points="${xo},${Y0 - h / 2} ${xs},${Y0 - shPx / 2} ${xs},${Y0 + shPx / 2} ${xo},${Y0 + h / 2}" fill="#0B1026" opacity=".75"/>`;
        g += `<g aria-hidden="true">${umbra}${ln(XL, Y0, xs, Y0 - shPx / 2, RAY[0]) + ln(XL, Y0, xs, Y0 + shPx / 2, RAY[1])}${arrow((XL + xo) / 2, Y0 - h / 4, 1, -(h / 4) / ((xo - XL) || 1), RAY[0])}</g>`;
      } else if (S.rays) g += `<g aria-hidden="true">${ln(XL, Y0, xs, Y0 - 100, RAY[0]) + ln(XL, Y0, xs, Y0 + 100, RAY[1])}</g>`;
      // the lamp
      g += `<g aria-hidden="true"><rect x="${XL - 14}" y="${Y0 + 24}" width="28" height="70" rx="6" fill="#4A4070"/><circle cx="${XL}" cy="${Y0}" r="34" fill="url(#op-lamp)"/><circle cx="${XL}" cy="${Y0}" r="12" fill="#FFFFFF"/></g>`;
      // the opaque card on a stick
      const card = `<rect x="-12" y="${-h / 2}" width="24" height="${h}" rx="5" fill="#A0522D" stroke="#5C2E12" stroke-width="2"/><rect x="-2" y="${h / 2}" width="4" height="${150 - h / 2}" fill="#8A7F6C"/>`;
      g += `<g class="op-obj" data-key="object" role="button" tabindex="0" aria-label="${esc(tx(W.lampDist))}: ${fmt(S.u, 0)} ${esc(tx(W.cm))}" transform="translate(${xo.toFixed(1)} ${Y0})"><rect x="-26" y="${-h / 2 - 16}" width="52" height="${h + 32}" fill="transparent"/>${ring(-22, -h / 2 - 12, 44, h + 24)}${card}</g>` + txt(xo, Y0 + 172, `${fmt(S.u, 0)} ${tx(W.cm)}`, 'op-lbl dim');
      const o = tags(behind ? [['', `${tx(W.shadowH)}: ${fmt(sh, 1)} ${tx(W.cm)}`], [sh > HCM + 0.01 ? 'warn' : '', sh > HCM + 0.01 ? tx(W.magnified) : tx(W.sameSize)]] : [['warn', tx(W.shadow) + ': 0']])
        + `<div class="op-eq">${esc(tx(W.shadowH))} = ${HCM} × ${fmt(S.screen, 0)} / ${fmt(S.u, 0)} = ${fmt(sh, 1)} ${esc(tx(W.cm))}</div><p class="op-note">${esc(tx(W.shadowNote))}</p>`;
      return { svg: g, out: o };
    }

    const DRAW = { plane: drawPlane, 'concave-mirror': drawCurved, 'convex-mirror': drawCurved, 'convex-lens': drawCurved, 'concave-lens': drawCurved, combination: drawCurved, slab: drawSlab, prism: drawPrism, eye: drawEye, pinhole: drawPinhole, shadow: drawShadow };
    function draw() {
      S.res = {};
      const r = DRAW[el]();
      svg.innerHTML = r.svg;
      out.innerHTML = r.out;
      sliders.forEach((s) => { const o = ctl.querySelector('#op-' + s.key + '-o'); if (o) o.textContent = s.key === 'object' && el === 'eye' && s.get() >= 600 ? '∞' : `${fmt(s.get(), s.key === 'n' ? 2 : 0)} ${tx(s.unit)}`.trim(); const lb = ctl.querySelector(`label[for="op-${s.key}"] span`); if (lb) lb.textContent = tx(s.label); const inp = ctl.querySelector('#op-' + s.key); if (inp && Number(inp.value) !== s.get()) inp.value = s.get(); });
      toggles.forEach((t) => { const b = row.querySelector(`[data-key="${t.key}"] span`); if (b) b.textContent = tx(t.label); });
    }
    layout();
    draw();
    const onResize = () => { const was = narrow; layout(); if (was !== narrow) draw(); };
    window.addEventListener('resize', onResize);
    return { destroy() { drag = null; window.removeEventListener('resize', onResize); } };
  }

  NCA_T.register({
    id: 'optics',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      if (!ELEMENTS.includes(c.element)) e.push('element: one of ' + ELEMENTS.join(', '));
      const num = (k, lo, hi) => { if (c[k] == null) return; if (typeof c[k] !== 'number' || !isFinite(c[k]) || c[k] < lo || c[k] > hi) e.push(`${k}: a number from ${lo} to ${hi}`); };
      num('f', 5, 40); num('f2', 5, 40); num('n', 1, 2.5); num('angle', 0, 85);
      num('object', c.element === 'eye' ? 10 : 5, c.element === 'eye' ? 600 : 100);
      if (c.eye != null && !EYES.includes(c.eye)) e.push('eye: one of ' + EYES.join(', '));
      if (c.corrective != null && typeof c.corrective !== 'boolean') e.push('corrective: true or false');
      if (c.white_light != null && typeof c.white_light !== 'boolean') e.push('white_light: true or false');
      if (c.white_light && c.element !== 'prism') e.push('white_light: only the prism disperses light');
      if (c.corrective && c.element !== 'eye') e.push('corrective: only for the eye');
      if (c.eye && c.eye !== 'normal' && c.element !== 'eye') e.push('eye: only for the eye');
      if (c.corrective && c.element === 'eye' && (c.eye || 'normal') === 'normal') e.push('corrective: a normal eye needs no glasses');
      if (c.f2 != null && c.element !== 'combination') e.push('f2: only for two lenses in contact');
      Object.keys(c).forEach((k) => { if (!KNOWN.includes(k)) e.push('unknown key: ' + k); });
      return e;
    },
    keys(c) {
      const el = c && c.element;
      const T = ['toggle:rays'], E = ['moved'];
      if (['plane', 'concave-mirror', 'convex-mirror', 'convex-lens', 'concave-lens', 'combination', 'pinhole', 'shadow', 'eye'].includes(el)) T.push('object', 'slider:object');
      if (['concave-mirror', 'convex-mirror', 'convex-lens', 'concave-lens', 'combination'].includes(el)) T.push('slider:f');
      if (el === 'slab' || el === 'prism') { T.push('slider:angle', 'slider:n'); E.push('refracted'); }
      if (el === 'prism') { T.push('toggle:white'); E.push('tir', 'dispersed'); }
      if (el === 'eye' || el === 'combination') T.push('lens:none', 'lens:convex', 'lens:concave');
      if (['concave-mirror', 'convex-lens', 'combination', 'pinhole', 'shadow'].includes(el)) T.push('screen');
      if (el === 'plane' || el === 'convex-mirror' || el === 'concave-lens') E.push('image:virtual');
      if (el === 'concave-mirror' || el === 'convex-lens' || el === 'combination') E.push('image:real', 'image:virtual', 'image:at-infinity', 'image:sharp');
      if (el === 'pinhole') E.push('image:real');
      if (el === 'eye') E.push('image:sharp', 'corrected');
      return { targets: T, events: E };
    },
    demo: { element: 'concave-mirror', f: 15, object: 40 },
    elements: ELEMENTS,
    mount(root, config, api) { return optics(root, config, api); },
  });
})();
