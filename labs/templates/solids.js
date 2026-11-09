// Template: 3D shapes (solids). Turn, unfold, count, measure, fill and cut the solids of school mensuration: cube,
// cuboid, cylinder, cone, sphere, hemisphere, regular prism and pyramid, frustum, and five combined solids.
// Everything is drawn by a small 3D engine in SVG (no library): meshes, flat and smooth shading, edges, silhouettes.
// The geometry is real: nets are folded by hinge rotations (polyhedra) and by exact bending (a rectangle rolls into a
// cylinder, a sector wraps into a cone), so every net shown folds into its solid. Areas and volumes use the NCERT
// formulas with π = 22/7 or 3.14 as the lab chooses; fill mode pours whole-number counts that are true
// (3 cones fill a cylinder, 4 cones of height r fill a sphere, 3 pyramids fill a prism); cross-sections are computed
// by slicing the mesh with a plane and the shape's name is found by measuring the cut face. Config:
//   { solid: 'cube'|'cuboid'|'cylinder'|'cone'|'sphere'|'hemisphere'|'prism'|'pyramid'|'frustum'|'combination',
//     dims?: { l?, b?, h?, r?, r2? } in cm, mode: 'turn'|'net'|'count'|'surface'|'volume'|'fill'|'cut',
//     pi?: '22/7'|'3.14', sides?: 3–8 (prism, pyramid), combo?: 'capsule'|'icecream'|'tent'|'dome'|'cubedome',
//     cut?: 'horizontal'|'vertical'|'slant'|'corner', ask?: false (hide the question) }
// Dims by solid: cube l (side); cuboid l b h; cylinder r h; cone r h (or r l, l = slant height); sphere r;
// hemisphere r; prism and pyramid l (base side) h; frustum r (bottom radius) r2 (top radius) h; combos: capsule r h
// (h = cylinder part), icecream r h (h = cone height), tent r h l (h = cylinder part, l = slant height of the cone),
// dome r h, cubedome l (cube side) r (dome radius, 2r ≤ l).
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex } = L;
  const ease = L.ease, lerp = L.lerp, tween = L.tween;
  const reduced = () => L.reducedMotion();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const T2 = (en, hi) => ({ en, hi });
  const PI = Math.PI, DEG = PI / 180;

  // ---------------------------------------------------------------- vectors
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cen = (P) => { const c = [0, 0, 0]; for (const p of P) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return mul(c, 1 / P.length); };
  function newell(P) {
    const n = [0, 0, 0];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  // Rotation matrix (row-major 3×3) about a unit axis k by angle t (Rodrigues).
  function rod(k, t) {
    const c = Math.cos(t), s = Math.sin(t), v = 1 - c, [x, y, z] = k;
    return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v];
  }
  const mv = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
  const mm = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
  const ID = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  const apply = (T, p) => add(mv(T.R, p), T.t);
  const compose = (A, B) => ({ R: mm(A.R, B.R), t: add(mv(A.R, B.t), A.t) });
  const hingeT = (H, D, t) => { const R = rod(D, t); return { R, t: sub(H, mv(R, H)) }; };

  // ---------------------------------------------------------------- numbers, words
  const WN = { faces: [T2('face', 'फलक'), T2('faces', 'फलक')], edges: [T2('edge', 'किनारा'), T2('edges', 'किनारे')], vertices: [T2('vertex', 'शीर्ष'), T2('vertices', 'शीर्ष')], flat: [T2('flat face', 'समतल फलक'), T2('flat faces', 'समतल फलक')], curved: [T2('curved surface', 'वक्र पृष्ठ'), T2('curved surfaces', 'वक्र पृष्ठ')] };
  const wn = (k, n) => WN[k][n === 1 ? 0 : 1];
  const fmt = (x) => { if (!isFinite(x)) return '–'; const r = Math.round(x * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''); };
  const U = { cm: T2('cm', 'सेमी'), cm2: T2('cm²', 'सेमी²'), cm3: T2('cm³', 'सेमी³') };
  const SOLIDS = ['cube', 'cuboid', 'cylinder', 'cone', 'sphere', 'hemisphere', 'prism', 'pyramid', 'frustum', 'combination'];
  const MODES = ['turn', 'net', 'count', 'surface', 'volume', 'fill', 'cut'];
  const COMBOS = ['capsule', 'icecream', 'tent', 'dome', 'cubedome'];
  const CUTS = ['horizontal', 'vertical', 'slant', 'corner'];
  const POLY = ['cube', 'cuboid', 'prism', 'pyramid'];
  const NGON = { 3: T2('triangle', 'त्रिभुज'), 4: T2('square', 'वर्ग'), 5: T2('pentagon', 'पंचभुज'), 6: T2('hexagon', 'षट्भुज'), 7: T2('heptagon', 'सप्तभुज'), 8: T2('octagon', 'अष्टभुज') };
  const NGADJ = { 3: T2('Triangular', 'त्रिभुजाकार'), 4: T2('Square', 'वर्गाकार'), 5: T2('Pentagonal', 'पंचभुजाकार'), 6: T2('Hexagonal', 'षट्भुजाकार'), 7: T2('Heptagonal', 'सप्तभुजाकार'), 8: T2('Octagonal', 'अष्टभुजाकार') };
  const INFO = {
    cube: { n: T2('Cube', 'घन'), dims: ['l'], def: { l: 4 }, ex: [T2('a dice', 'पासा'), T2('an ice cube', 'बर्फ़ का टुकड़ा'), T2('a sugar cube', 'चीनी का क्यूब')] },
    cuboid: { n: T2('Cuboid', 'घनाभ'), dims: ['l', 'b', 'h'], def: { l: 6, b: 4, h: 3 }, ex: [T2('a brick', 'ईंट'), T2('a matchbox', 'माचिस की डिब्बी'), T2('a book', 'किताब')] },
    cylinder: { n: T2('Cylinder', 'बेलन'), dims: ['r', 'h'], def: { r: 7, h: 10 }, ex: [T2('a gas cylinder', 'गैस सिलेंडर'), T2('a candle', 'मोमबत्ती'), T2('a water pipe', 'पानी का पाइप')] },
    cone: { n: T2('Cone', 'शंकु'), dims: ['r', 'h'], def: { r: 3, h: 4 }, ex: [T2('an ice-cream cone', 'आइसक्रीम कोन'), T2('a birthday cap', 'जन्मदिन की टोपी'), T2('a mehndi cone', 'मेहंदी कोन')] },
    sphere: { n: T2('Sphere', 'गोला'), dims: ['r'], def: { r: 7 }, ex: [T2('a football', 'फ़ुटबॉल'), T2('a laddoo', 'लड्डू'), T2('a globe', 'ग्लोब')] },
    hemisphere: { n: T2('Hemisphere', 'अर्धगोला'), dims: ['r'], def: { r: 7 }, ex: [T2('a bowl', 'कटोरी'), T2('half a coconut shell', 'नारियल का आधा खोल'), T2('a dome', 'गुंबद')] },
    prism: { n: T2('Prism', 'प्रिज़्म'), dims: ['l', 'h'], def: { l: 4, h: 8 }, ex: [T2('a glass prism', 'काँच का प्रिज़्म'), T2('a tent', 'तंबू')] },
    pyramid: { n: T2('Pyramid', 'पिरामिड'), dims: ['l', 'h'], def: { l: 6, h: 4 }, ex: [T2('the pyramids of Egypt', 'मिस्र के पिरामिड'), T2('a pyramid paperweight', 'पिरामिड वाला पेपरवेट')] },
    frustum: { n: T2('Frustum of a cone', 'शंकु का छिन्नक'), dims: ['r', 'r2', 'h'], def: { r: 14, r2: 7, h: 12 }, ex: [T2('a bucket', 'बाल्टी'), T2('a glass tumbler', 'गिलास'), T2('a lamp shade', 'लैंप शेड')] },
  };
  const COMBO = {
    capsule: { n: T2('Capsule: a cylinder with a hemisphere at each end', 'कैप्सूल: बेलन के दोनों सिरों पर अर्धगोले'), dims: ['r', 'h'], def: { r: 3.5, h: 7 }, ex: [T2('a medicine capsule', 'दवा का कैप्सूल')] },
    icecream: { n: T2('Ice-cream cone: a cone with a hemisphere on top', 'आइसक्रीम कोन: शंकु पर अर्धगोला'), dims: ['r', 'h'], def: { r: 3.5, h: 12 }, ex: [T2('an ice-cream cone with a scoop', 'स्कूप वाला आइसक्रीम कोन')] },
    tent: { n: T2('Tent: a cylinder with a cone on top', 'तंबू: बेलन पर शंकु'), dims: ['r', 'h', 'l'], def: { r: 6, h: 4, l: 10 }, ex: [T2('a circus tent', 'सर्कस का तंबू')] },
    dome: { n: T2('A cylinder with a hemisphere on top', 'बेलन पर अर्धगोला'), dims: ['r', 'h'], def: { r: 7, h: 10 }, ex: [T2('a building with a dome', 'गुंबद वाली इमारत')] },
    cubedome: { n: T2('A cube with a hemisphere on top', 'घन पर अर्धगोला'), dims: ['l', 'r'], def: { l: 7, r: 3.5 }, ex: [T2('a toy block with a dome', 'गुंबद वाला खिलौना ब्लॉक')] },
  };
  const PARTS = { capsule: T2('a cylinder and two hemispheres', 'एक बेलन और दो अर्धगोले'), icecream: T2('a cone and a hemisphere', 'एक शंकु और एक अर्धगोला'), tent: T2('a cylinder and a cone', 'एक बेलन और एक शंकु'), dome: T2('a cylinder and a hemisphere', 'एक बेलन और एक अर्धगोला'), cubedome: T2('a cube and a hemisphere', 'एक घन और एक अर्धगोला') };
  const PRISMEX = { 3: [T2('a glass prism', 'काँच का प्रिज़्म'), T2('a tent', 'तंबू')], 4: [T2('a tall box with square ends', 'वर्गाकार सिरों वाला लंबा डिब्बा')], 6: [T2('an unsharpened pencil', 'बिना छिली पेंसिल'), T2('a honeycomb cell', 'मधुमक्खी के छत्ते का खाना')] };

  // ---------------------------------------------------------------- config → model
  function dimKeys(solid, combo) { return solid === 'combination' ? COMBO[combo || 'icecream'].dims : INFO[solid].dims; }
  function norm(c) {
    const solid = c.solid, combo = solid === 'combination' ? c.combo || 'icecream' : null;
    const n = solid === 'prism' || solid === 'pyramid' ? c.sides || (solid === 'prism' ? 3 : 4) : 0;
    const def = combo ? COMBO[combo].def : INFO[solid].def;
    const given = c.dims || {};
    const d = Object.assign({}, def, given);
    if (solid === 'cone') { if (given.l != null && given.h == null) d.h = Math.sqrt(given.l * given.l - d.r * d.r); delete d.l; }
    const piS = String(c.pi) === '3.14' ? '3.14' : '22/7';
    return { solid, combo, n, d, piS, P: piS === '3.14' ? 3.14 : 22 / 7, key: combo || solid };
  }
  const nameOf = (m) => (m.combo ? COMBO[m.combo].n : m.solid === 'prism' ? T2(NGADJ[m.n].en + ' prism', NGADJ[m.n].hi + ' प्रिज़्म') : m.solid === 'pyramid' ? T2(NGADJ[m.n].en + ' pyramid', NGADJ[m.n].hi + ' पिरामिड') : INFO[m.solid].n);
  const examplesOf = (m) => (m.combo ? COMBO[m.combo].ex : m.solid === 'prism' ? PRISMEX[m.n] || [T2('a glass prism', 'काँच का प्रिज़्म')] : INFO[m.solid].ex);
  function symOf(m, k) {
    if (k === 'l' && (m.solid === 'cube' || m.solid === 'prism' || m.solid === 'pyramid' || m.combo === 'cubedome')) return 'a';
    if (m.solid === 'frustum') return k === 'r' ? 'r₁' : k === 'r2' ? 'r₂' : k;
    return k;
  }
  function dimName(m, k) {
    if (k === 'r') return m.solid === 'frustum' ? T2('bottom radius', 'नीचे की त्रिज्या') : m.combo === 'cubedome' ? T2('radius of the dome', 'गुंबद की त्रिज्या') : T2('radius', 'त्रिज्या');
    if (k === 'r2') return T2('top radius', 'ऊपर की त्रिज्या');
    if (k === 'b') return T2('breadth', 'चौड़ाई');
    if (k === 'l') {
      if (m.combo === 'tent') return T2('slant height of the cone', 'शंकु की तिर्यक ऊँचाई');
      if (symOf(m, 'l') === 'a') return m.solid === 'prism' || m.solid === 'pyramid' ? T2('side of the base', 'आधार की भुजा') : T2('side', 'भुजा');
      return T2('length', 'लंबाई');
    }
    if (m.combo === 'capsule') return T2('length of the cylinder part', 'बेलन वाले भाग की लंबाई');
    if (m.combo === 'tent' || m.combo === 'dome') return T2('height of the cylinder part', 'बेलन वाले भाग की ऊँचाई');
    if (m.combo === 'icecream') return T2('height of the cone', 'शंकु की ऊँचाई');
    return T2('height', 'ऊँचाई');
  }
  const tentConeH = (d) => Math.sqrt(Math.max(0, d.l * d.l - d.r * d.r));
  function heightOf(m) {
    const d = m.d;
    switch (m.solid) {
      case 'cube': return d.l;
      case 'sphere': return 2 * d.r;
      case 'hemisphere': return d.r;
      case 'combination': return { capsule: d.h + 2 * d.r, icecream: d.h + d.r, tent: d.h + tentConeH(d), dome: d.h + d.r, cubedome: d.l + d.r }[m.combo];
      default: return d.h;
    }
  }
  const apothem = (n, a) => a / (2 * Math.tan(PI / n));
  const ngonArea = (n, a) => (n * a * a) / (4 * Math.tan(PI / n));

  // ---------------------------------------------------------------- formulas (exact NCERT forms, π as the lab says)
  function measures(m) {
    const d = m.d, p = m.piS, P = m.P;
    const F = (label, sym, sb, val) => ({ label, sym, sub: sb, val });
    const W = (v, en, hi) => ({ v, why: T2(en, hi) });
    const CSA = T2('Curved surface area', 'वक्र पृष्ठीय क्षेत्रफल'), TSA = T2('Total surface area', 'संपूर्ण पृष्ठीय क्षेत्रफल');
    const VOL = T2('Volume', 'आयतन'), SA = T2('Surface area', 'पृष्ठीय क्षेत्रफल');
    const r = d.r, h = d.h;
    const SLANT = (lv, sb) => ({ label: T2('Slant height', 'तिर्यक ऊँचाई'), sym: 'l', sub: sb, val: lv });
    switch (m.solid) {
      case 'cube': { const a = d.l; return {
        csa: F(T2('Lateral surface area (4 side faces)', 'पार्श्व पृष्ठीय क्षेत्रफल (4 बगल के फलक)'), '4a²', `4 × ${a} × ${a}`, 4 * a * a),
        tsa: F(TSA, '6a²', `6 × ${a} × ${a}`, 6 * a * a), vol: F(VOL, 'a³', `${a} × ${a} × ${a}`, a ** 3),
        wt: [W(4 * a * a, 'That counts only the 4 side faces. A cube has 6 faces.', 'इसमें केवल 4 बगल के फलक गिने गए। घन के 6 फलक होते हैं।'), W(a ** 3, 'That is the volume (a × a × a), not the area.', 'यह आयतन (a × a × a) है, क्षेत्रफल नहीं।'), W(6 * a, 'The area of one face is a × a, not a.', 'एक फलक का क्षेत्रफल a × a होता है, a नहीं।')],
        wv: [W(6 * a * a, 'That is the surface area. Volume is a × a × a.', 'यह पृष्ठीय क्षेत्रफल है। आयतन a × a × a होता है।'), W(3 * a, 'Adding the sides does not measure the space inside: multiply them.', 'भुजाएँ जोड़ने से अंदर की जगह नहीं मिलती: उन्हें गुणा करो।'), W(a * a, 'That is the area of one face. Multiply by the height a too.', 'यह एक फलक का क्षेत्रफल है। ऊँचाई a से भी गुणा करो।')] }; }
      case 'cuboid': { const { l, b } = d; return {
        csa: F(T2('Lateral surface area (4 walls)', 'पार्श्व पृष्ठीय क्षेत्रफल (4 दीवारें)'), '2h(l + b)', `2 × ${h} × (${l} + ${b})`, 2 * h * (l + b)),
        tsa: F(TSA, '2(lb + bh + hl)', `2 × (${l}×${b} + ${b}×${h} + ${h}×${l})`, 2 * (l * b + b * h + h * l)), vol: F(VOL, 'l × b × h', `${l} × ${b} × ${h}`, l * b * h),
        wt: [W(l * b + b * h + h * l, 'Each face has an equal face opposite it: count every pair twice.', 'हर फलक के सामने एक बराबर फलक होता है: हर जोड़ी को दो बार गिनो।'), W(2 * h * (l + b), 'That is only the 4 walls. Add the top and the bottom too.', 'यह केवल 4 दीवारें हैं। ऊपर और नीचे के फलक भी जोड़ो।'), W(l * b * h, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W(2 * (l * b + b * h + h * l), 'That is the surface area. Volume is l × b × h.', 'यह पृष्ठीय क्षेत्रफल है। आयतन l × b × h होता है।'), W(l + b + h, 'Adding does not measure the space inside: multiply.', 'जोड़ने से अंदर की जगह नहीं मिलती: गुणा करो।'), W(l * b, 'That is only the base. Multiply by the height too.', 'यह केवल आधार है। ऊँचाई से भी गुणा करो।')] }; }
      case 'cylinder': return {
        csa: F(CSA, '2πrh', `2 × ${p} × ${r} × ${h}`, 2 * P * r * h), tsa: F(TSA, '2πr(r + h)', `2 × ${p} × ${r} × (${r} + ${h})`, 2 * P * r * (r + h)), vol: F(VOL, 'πr²h', `${p} × ${r} × ${r} × ${h}`, P * r * r * h),
        wt: [W(2 * P * r * h, 'That is only the curved surface. Add the two circles.', 'यह केवल वक्र पृष्ठ है। दोनों वृत्त भी जोड़ो।'), W(2 * P * r * h + P * r * r, 'A cylinder has two circular faces, top and bottom.', 'बेलन के दो वृत्ताकार फलक होते हैं, ऊपर और नीचे।'), W(P * r * r * h, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W(2 * P * r * h, 'That is the curved surface area. Volume is base area πr² × height.', 'यह वक्र पृष्ठीय क्षेत्रफल है। आयतन = आधार का क्षेत्रफल πr² × ऊँचाई।'), W(P * r * h, 'The base area is πr²: the radius must be squared.', 'आधार का क्षेत्रफल πr² है: त्रिज्या का वर्ग करना होता है।'), W((P * r * r * h) / 3, 'That is a cone. A cylinder holds 3 times as much.', 'यह शंकु का आयतन है। बेलन में इसका 3 गुना आता है।')] };
      case 'cone': { const l = Math.hypot(r, h); return {
        slant: SLANT(l, `√(${r}² + ${h}²)`),
        csa: F(CSA, 'πrl', `${p} × ${r} × ${fmt(l)}`, P * r * l), tsa: F(TSA, 'πr(l + r)', `${p} × ${r} × (${fmt(l)} + ${r})`, P * r * (l + r)), vol: F(VOL, '⅓πr²h', `⅓ × ${p} × ${r} × ${r} × ${h}`, (P * r * r * h) / 3),
        wt: [W(P * r * l, 'That is only the curved surface. Add the circular base πr².', 'यह केवल वक्र पृष्ठ है। वृत्ताकार आधार πr² भी जोड़ो।'), W(P * r * (h + r), 'Use the slant height l, not the height h, for the curved surface.', 'वक्र पृष्ठ के लिए तिर्यक ऊँचाई l लो, ऊँचाई h नहीं।'), W((P * r * r * h) / 3, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W(P * r * r * h, 'That is the cylinder. A cone holds only ⅓ of it.', 'यह बेलन का आयतन है। शंकु में उसका केवल ⅓ आता है।'), W((P * r * r * l) / 3, 'Volume uses the height h, not the slant height l.', 'आयतन में ऊँचाई h लगती है, तिर्यक ऊँचाई l नहीं।'), W(P * r * l, 'That is the curved surface area.', 'यह वक्र पृष्ठीय क्षेत्रफल है।')] }; }
      case 'sphere': return {
        tsa: F(SA, '4πr²', `4 × ${p} × ${r} × ${r}`, 4 * P * r * r), vol: F(VOL, '⁴⁄₃πr³', `⁴⁄₃ × ${p} × ${r} × ${r} × ${r}`, (4 * P * r ** 3) / 3),
        wt: [W(2 * P * r * r, 'That is only half the sphere (a hemisphere’s curved surface).', 'यह केवल आधा गोला है (अर्धगोले का वक्र पृष्ठ)।'), W(P * r * r, 'That is one circle. A sphere’s surface equals 4 such circles.', 'यह एक वृत्त है। गोले का पृष्ठ ऐसे 4 वृत्तों के बराबर होता है।'), W((4 * P * r ** 3) / 3, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W(4 * P * r * r, 'That is the surface area. Volume is ⁴⁄₃πr³.', 'यह पृष्ठीय क्षेत्रफल है। आयतन ⁴⁄₃πr³ होता है।'), W((2 * P * r ** 3) / 3, 'That is a hemisphere: half of the sphere.', 'यह अर्धगोला है: गोले का आधा।'), W(4 * P * r ** 3, 'Divide by 3: the volume is ⁴⁄₃πr³.', '3 से भाग दो: आयतन ⁴⁄₃πr³ है।')] };
      case 'hemisphere': return {
        csa: F(CSA, '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r), tsa: F(TSA, '3πr²', `3 × ${p} × ${r} × ${r}`, 3 * P * r * r), vol: F(VOL, '⅔πr³', `⅔ × ${p} × ${r} × ${r} × ${r}`, (2 * P * r ** 3) / 3),
        wt: [W(2 * P * r * r, 'That is only the curved surface. Add the flat circle πr².', 'यह केवल वक्र पृष्ठ है। समतल वृत्त πr² भी जोड़ो।'), W(4 * P * r * r, 'That is a whole sphere.', 'यह पूरे गोले का है।'), W((2 * P * r ** 3) / 3, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W((4 * P * r ** 3) / 3, 'That is the whole sphere. A hemisphere is half.', 'यह पूरा गोला है। अर्धगोला उसका आधा होता है।'), W(3 * P * r * r, 'That is the total surface area.', 'यह संपूर्ण पृष्ठीय क्षेत्रफल है।'), W(2 * P * r ** 3, 'Divide by 3: the volume is ⅔πr³.', '3 से भाग दो: आयतन ⅔πr³ है।')] };
      case 'prism': case 'pyramid': {
        const n = m.n, a = d.l, B = ngonArea(n, a), Pm = n * a;
        const bSym = n === 3 ? '√3/4 × a²' : n === 4 ? 'a²' : n === 6 ? '3√3/2 × a²' : `${n}a² ÷ (4 tan ${fmt(180 / n)}°)`;
        const bSub = n === 3 ? `√3/4 × ${a} × ${a}` : n === 4 ? `${a} × ${a}` : n === 6 ? `3√3/2 × ${a} × ${a}` : `${n} × ${a} × ${a} ÷ (4 × ${fmt(Math.tan(PI / n))})`;
        const base = { label: T2('Area of the base B', 'आधार का क्षेत्रफल B'), sym: bSym, sub: bSub, val: B };
        if (m.solid === 'prism') return {
          base, csa: F(T2('Lateral surface area', 'पार्श्व पृष्ठीय क्षेत्रफल'), 'perimeter × h', `${n} × ${a} × ${h}`, Pm * h),
          tsa: F(TSA, 'perimeter × h + 2B', `${fmt(Pm * h)} + 2 × ${fmt(B)}`, Pm * h + 2 * B), vol: F(VOL, 'B × h', `${fmt(B)} × ${h}`, B * h),
          wt: [W(Pm * h, 'That is only the side faces. Add the two ends.', 'यह केवल बगल के फलक हैं। दोनों सिरे भी जोड़ो।'), W(Pm * h + B, 'A prism has two equal ends, not one.', 'प्रिज़्म के दो बराबर सिरे होते हैं, एक नहीं।'), W(B * h, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
          wv: [W(Pm * h, 'That is the area of the side faces. Volume is base area × height.', 'यह बगल के फलकों का क्षेत्रफल है। आयतन = आधार का क्षेत्रफल × ऊँचाई।'), W(B, 'That is only the base. Multiply by the height.', 'यह केवल आधार है। ऊँचाई से गुणा करो।'), W((B * h) / 3, 'That is a pyramid. A prism holds 3 times as much.', 'यह पिरामिड का है। प्रिज़्म में इसका 3 गुना आता है।')] };
        const ap = apothem(n, a), s = Math.hypot(h, ap);
        return {
          base, slant: { label: T2('Slant height of a face', 'फलक की तिर्यक ऊँचाई'), sym: 's', sub: `√(${h}² + ${fmt(ap)}²)`, val: s },
          csa: F(T2('Lateral surface area', 'पार्श्व पृष्ठीय क्षेत्रफल'), '½ × perimeter × s', `½ × ${n} × ${a} × ${fmt(s)}`, (Pm * s) / 2),
          tsa: F(TSA, '½ × perimeter × s + B', `${fmt((Pm * s) / 2)} + ${fmt(B)}`, (Pm * s) / 2 + B), vol: F(VOL, '⅓ × B × h', `⅓ × ${fmt(B)} × ${h}`, (B * h) / 3),
          wt: [W((Pm * s) / 2, 'That is only the triangles. Add the base.', 'यह केवल त्रिभुज हैं। आधार भी जोड़ो।'), W((Pm * h) / 2 + B, 'Each triangle’s height is the slant height s, not h.', 'हर त्रिभुज की ऊँचाई तिर्यक ऊँचाई s है, h नहीं।'), W((B * h) / 3, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
          wv: [W(B * h, 'That is a prism. A pyramid holds only ⅓ of it.', 'यह प्रिज़्म का है। पिरामिड में उसका केवल ⅓ आता है।'), W((B * s) / 3, 'Volume uses the height h, not the slant height.', 'आयतन में ऊँचाई h लगती है, तिर्यक ऊँचाई नहीं।'), W((Pm * s) / 2 + B, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] };
      }
      case 'frustum': { const R = d.r, q = d.r2, l = Math.hypot(h, R - q); return {
        slant: SLANT(l, `√(${h}² + (${R} − ${q})²)`),
        csa: F(CSA, 'πl(r₁ + r₂)', `${p} × ${fmt(l)} × (${R} + ${q})`, P * l * (R + q)),
        tsa: F(TSA, 'πl(r₁ + r₂) + πr₁² + πr₂²', `${fmt(P * l * (R + q))} + ${p} × ${R}² + ${p} × ${q}²`, P * l * (R + q) + P * R * R + P * q * q),
        vol: F(VOL, '⅓πh(r₁² + r₂² + r₁r₂)', `⅓ × ${p} × ${h} × (${R}² + ${q}² + ${R}×${q})`, (P * h * (R * R + q * q + R * q)) / 3),
        wt: [W(P * l * (R + q), 'That is only the curved surface. Add both circles.', 'यह केवल वक्र पृष्ठ है। दोनों वृत्त भी जोड़ो।'), W(P * h * (R + q) + P * R * R + P * q * q, 'Use the slant height l for the curved surface, not h.', 'वक्र पृष्ठ के लिए तिर्यक ऊँचाई l लो, h नहीं।'), W((P * h * (R * R + q * q + R * q)) / 3, 'That is the volume, not the area.', 'यह आयतन है, क्षेत्रफल नहीं।')],
        wv: [W((P * h * (R * R + q * q)) / 3, 'The formula also has the term r₁r₂.', 'सूत्र में r₁r₂ वाला पद भी होता है।'), W(P * h * (R * R + q * q + R * q), 'Multiply by ⅓.', '⅓ से गुणा करो।'), W(P * R * R * h, 'That treats it as a cylinder; the top is narrower.', 'इसमें इसे बेलन मान लिया; ऊपर का भाग पतला है।')] }; }
      default: return comboMeasures(m, F, W, TSA, VOL);
    }
  }
  function comboMeasures(m, F, W, TSA, VOL) {
    const d = m.d, p = m.piS, P = m.P, r = d.r, h = d.h;
    const SAo = T2('Surface area of the whole solid (outside)', 'पूरे ठोस का पृष्ठीय क्षेत्रफल (बाहरी)');
    switch (m.combo) {
      case 'capsule': return {
        parts: [[T2('cylinder: 2πrh', 'बेलन: 2πrh'), 2 * P * r * h], [T2('two hemispheres: 2 × 2πr²', 'दो अर्धगोले: 2 × 2πr²'), 4 * P * r * r]],
        tsa: F(SAo, '2πrh + 4πr²', `2 × ${p} × ${r} × ${h} + 4 × ${p} × ${r}²`, 2 * P * r * h + 4 * P * r * r), vol: F(VOL, 'πr²h + ⁴⁄₃πr³', `${p} × ${r}² × ${h} + ⁴⁄₃ × ${p} × ${r}³`, P * r * r * h + (4 * P * r ** 3) / 3),
        wt: [W(2 * P * r * (r + h) + 4 * P * r * r, 'The circles where the parts join are inside: they are not on the outside.', 'जहाँ भाग जुड़ते हैं वे वृत्त अंदर हैं: वे बाहर नहीं दिखते।'), W(2 * P * r * h + 2 * P * r * r, 'There is a hemisphere at both ends.', 'दोनों सिरों पर अर्धगोला है।'), W(P * r * r * h + (4 * P * r ** 3) / 3, 'That is the volume.', 'यह आयतन है।')],
        wv: [W(P * r * r * h + (2 * P * r ** 3) / 3, 'There are two hemispheres: together they make a sphere.', 'दो अर्धगोले हैं: मिलकर एक गोला बनता है।'), W(P * r * r * (h + 2 * r), 'The rounded ends hold less than a cylinder would.', 'गोल सिरों में बेलन से कम जगह होती है।'), W(2 * P * r * h + 4 * P * r * r, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] };
      case 'icecream': { const l = Math.hypot(r, h); return {
        slant: { label: T2('Slant height of the cone', 'शंकु की तिर्यक ऊँचाई'), sym: 'l', sub: `√(${r}² + ${h}²)`, val: l },
        parts: [[T2('cone: πrl', 'शंकु: πrl'), P * r * l], [T2('hemisphere: 2πr²', 'अर्धगोला: 2πr²'), 2 * P * r * r]],
        tsa: F(SAo, 'πrl + 2πr²', `${p} × ${r} × ${fmt(l)} + 2 × ${p} × ${r}²`, P * r * l + 2 * P * r * r), vol: F(VOL, '⅓πr²h + ⅔πr³', `⅓ × ${p} × ${r}² × ${h} + ⅔ × ${p} × ${r}³`, (P * r * r * h) / 3 + (2 * P * r ** 3) / 3),
        wt: [W(P * r * l + 3 * P * r * r, 'The circle where the cone meets the hemisphere is hidden inside.', 'जहाँ शंकु और अर्धगोला मिलते हैं वह वृत्त अंदर छिपा है।'), W(P * r * h + 2 * P * r * r, 'The cone’s curved surface uses the slant height l.', 'शंकु के वक्र पृष्ठ में तिर्यक ऊँचाई l लगती है।'), W((P * r * r * h) / 3 + (2 * P * r ** 3) / 3, 'That is the volume.', 'यह आयतन है।')],
        wv: [W((P * r * r * h) / 3 + (4 * P * r ** 3) / 3, 'The top is half a sphere, not a whole one.', 'ऊपर आधा गोला है, पूरा नहीं।'), W(P * r * r * h + (2 * P * r ** 3) / 3, 'A cone is ⅓ of a cylinder.', 'शंकु बेलन का ⅓ होता है।'), W(P * r * l + 2 * P * r * r, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] }; }
      case 'tent': { const l = d.l, hc = tentConeH(d); return {
        slant: { label: T2('Height of the cone part', 'शंकु वाले भाग की ऊँचाई'), sym: 'h₂', sub: `√(${l}² − ${r}²)`, val: hc },
        parts: [[T2('floor: πr²', 'फ़र्श: πr²'), P * r * r], [T2('cylinder wall: 2πrh', 'बेलन की दीवार: 2πrh'), 2 * P * r * h], [T2('cone roof: πrl', 'शंकु की छत: πrl'), P * r * l]],
        tsa: F(SAo, 'πr² + 2πrh + πrl', `${p} × ${r}² + 2 × ${p} × ${r} × ${h} + ${p} × ${r} × ${l}`, P * r * r + 2 * P * r * h + P * r * l),
        vol: F(VOL, 'πr²h + ⅓πr²h₂', `${p} × ${r}² × ${h} + ⅓ × ${p} × ${r}² × ${fmt(hc)}`, P * r * r * h + (P * r * r * hc) / 3),
        wt: [W(2 * P * r * h + P * r * l, 'That is only the canvas. The solid also has the floor.', 'यह केवल कैनवास है। ठोस का फ़र्श भी होता है।'), W(2 * P * r * (r + h) + P * r * (l + r), 'The circle where the roof meets the wall is inside.', 'जहाँ छत दीवार से मिलती है वह वृत्त अंदर है।'), W(P * r * r * h + (P * r * r * hc) / 3, 'That is the volume.', 'यह आयतन है।')],
        wv: [W(P * r * r * (h + hc), 'The roof is a cone: only ⅓ of a cylinder.', 'छत शंकु है: बेलन का केवल ⅓।'), W(P * r * r * h + (P * r * r * l) / 3, 'Use the cone’s height, not its slant height l.', 'शंकु की ऊँचाई लो, तिर्यक ऊँचाई l नहीं।'), W(P * r * r + 2 * P * r * h + P * r * l, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] }; }
      case 'dome': return {
        parts: [[T2('floor: πr²', 'फ़र्श: πr²'), P * r * r], [T2('cylinder wall: 2πrh', 'बेलन की दीवार: 2πrh'), 2 * P * r * h], [T2('dome: 2πr²', 'गुंबद: 2πr²'), 2 * P * r * r]],
        tsa: F(SAo, 'πr² + 2πrh + 2πr²', `${p} × ${r}² + 2 × ${p} × ${r} × ${h} + 2 × ${p} × ${r}²`, 3 * P * r * r + 2 * P * r * h), vol: F(VOL, 'πr²h + ⅔πr³', `${p} × ${r}² × ${h} + ⅔ × ${p} × ${r}³`, P * r * r * h + (2 * P * r ** 3) / 3),
        wt: [W(4 * P * r * r + 2 * P * r * h, 'The circle under the dome is hidden inside.', 'गुंबद के नीचे का वृत्त अंदर छिपा है।'), W(2 * P * r * r + 2 * P * r * h, 'Do not forget the floor.', 'फ़र्श को मत भूलो।'), W(P * r * r * h + (2 * P * r ** 3) / 3, 'That is the volume.', 'यह आयतन है।')],
        wv: [W(P * r * r * h + (4 * P * r ** 3) / 3, 'The dome is half a sphere.', 'गुंबद आधा गोला है।'), W(P * r * r * (h + r), 'The dome holds less than a cylinder of height r.', 'गुंबद में ऊँचाई r वाले बेलन से कम जगह है।'), W(3 * P * r * r + 2 * P * r * h, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] };
      default: { const a = d.l; return {
        parts: [[T2('cube: 6a²', 'घन: 6a²'), 6 * a * a], [T2('minus the circle the dome covers: − πr²', 'गुंबद के नीचे ढका वृत्त घटाओ: − πr²'), -P * r * r], [T2('dome: 2πr²', 'गुंबद: 2πr²'), 2 * P * r * r]],
        tsa: F(SAo, '6a² − πr² + 2πr²', `6 × ${a}² − ${p} × ${r}² + 2 × ${p} × ${r}²`, 6 * a * a + P * r * r), vol: F(VOL, 'a³ + ⅔πr³', `${a}³ + ⅔ × ${p} × ${r}³`, a ** 3 + (2 * P * r ** 3) / 3),
        wt: [W(6 * a * a + 2 * P * r * r, 'The dome covers a circle of the top face: subtract πr².', 'गुंबद ऊपर के फलक का एक वृत्त ढक देता है: πr² घटाओ।'), W(6 * a * a, 'Add the dome’s curved surface.', 'गुंबद का वक्र पृष्ठ भी जोड़ो।'), W(a ** 3 + (2 * P * r ** 3) / 3, 'That is the volume.', 'यह आयतन है।')],
        wv: [W(a ** 3 + (4 * P * r ** 3) / 3, 'The dome is half a sphere.', 'गुंबद आधा गोला है।'), W(a ** 3, 'Add the dome’s volume too.', 'गुंबद का आयतन भी जोड़ो।'), W(6 * a * a + P * r * r, 'That is the surface area.', 'यह पृष्ठीय क्षेत्रफल है।')] }; }
    }
  }
  // Faces, edges and vertices (NCERT counts), and flat/curved surfaces for round solids.
  function counts(m) {
    const n = m.n;
    switch (m.solid) {
      case 'cube': case 'cuboid': return { poly: 1, F: 6, E: 12, V: 8 };
      case 'prism': return { poly: 1, F: n + 2, E: 3 * n, V: 2 * n };
      case 'pyramid': return { poly: 1, F: n + 1, E: 2 * n, V: n + 1 };
      case 'cylinder': return { flat: 2, curved: 1, E: 2, V: 0 };
      case 'cone': return { flat: 1, curved: 1, E: 1, V: 1 };
      case 'sphere': return { flat: 0, curved: 1, E: 0, V: 0 };
      case 'hemisphere': return { flat: 1, curved: 1, E: 1, V: 0 };
      case 'frustum': return { flat: 2, curved: 1, E: 2, V: 0 };
      default: return null;
    }
  }

  // ---------------------------------------------------------------- meshes
  // A face: its own vertices and polygons (outward winding); boundary edges are drawn, seams only on the silhouette.
  function Face(o) { return Object.assign({ verts: [], polys: [], vk: new Map() }, o); }
  function vidx(f, p) {
    const k = Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4);
    let i = f.vk.get(k);
    if (i == null) { i = f.verts.length; f.verts.push(p); f.vk.set(k, i); }
    return i;
  }
  function addPoly(f, pts, c) {
    let ids = pts.map((p) => vidx(f, p));
    ids = ids.filter((v, i) => v !== ids[(i + 1) % ids.length]);
    if (ids.length < 3) return;
    if (c) { const P = ids.map((i) => f.verts[i]); if (dot(newell(P), sub(cen(P), c)) < 0) ids.reverse(); }
    f.polys.push(ids);
  }
  function finish(f) {
    const m = new Map();
    const key = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
    f.polys.forEach((p, pi) => p.forEach((a, k) => { const kk = key(a, p[(k + 1) % p.length]); if (!m.has(kk)) m.set(kk, []); m.get(kk).push(pi); }));
    // per polygon edge: 'e' (a real edge) or the index of the neighbouring polygon of the same smooth face
    f.fl = f.polys.map((p, pi) => p.map((a, k) => { const l = m.get(key(a, p[(k + 1) % p.length])); return l.length === 1 ? 'e' : l[0] === pi ? l[1] : l[0]; }));
    delete f.vk;
    return f;
  }
  const NB = 64; // segments around a round solid
  function revolve(segs, c, tf, N = NB) {
    return segs.map((sg) => {
      const f = Face({ name: sg.name, kind: sg.disk ? 'flat' : 'curved', role: sg.role, info: sg.info, ck: sg.ck });
      const ring = (rho, y) => (rho < 1e-9 ? [tf([0, y, 0])] : Array.from({ length: N }, (_, i) => { const a = (2 * PI * (i + 0.5)) / N; return tf([rho * Math.cos(a), y, rho * Math.sin(a)]); }));
      if (sg.disk) addPoly(f, ring(sg.pts[0][0], sg.pts[0][1]), c);
      else for (let j = 0; j + 1 < sg.pts.length; j++) {
        const A = ring(sg.pts[j][0], sg.pts[j][1]), B = ring(sg.pts[j + 1][0], sg.pts[j + 1][1]);
        for (let i = 0; i < N; i++) {
          const g = (R, k) => R[R.length === 1 ? 0 : k % N];
          addPoly(f, [g(A, i), g(A, i + 1), g(B, i + 1), g(B, i)], c);
        }
      }
      return finish(f);
    });
  }
  const arc = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  // Regular n-gon of side a in the x–z plane, one edge facing the front (+z), vertices counter-clockwise from above.
  function regBase(n, a) { const R = a / (2 * Math.sin(PI / n)); return Array.from({ length: n }, (_, i) => { const t = PI / 2 + PI / n + (2 * PI * i) / n; return [R * Math.cos(t), R * Math.sin(t)]; }); }
  const rectBase = (l, b) => [[-l / 2, b / 2], [-l / 2, -b / 2], [l / 2, -b / 2], [l / 2, b / 2]];
  const NMF = {
    bottom: T2('bottom face', 'नीचे का फलक'), top: T2('top face', 'ऊपर का फलक'), side: (i) => T2('side face ' + i, 'बगल का फलक ' + i), tri: (i) => T2('triangular face ' + i, 'त्रिभुजाकार फलक ' + i),
    curved: T2('curved surface', 'वक्र पृष्ठ'), base: T2('flat circular face', 'समतल वृत्ताकार फलक'), topc: T2('top circular face', 'ऊपर का वृत्ताकार फलक'),
  };
  const SH = { square: T2('square', 'वर्ग'), rect: T2('rectangle', 'आयत'), circle: T2('circle', 'वृत्त'), triangle: T2('triangle', 'त्रिभुज'), curved: T2('curved surface', 'वक्र पृष्ठ') };
  const eqv = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, a, b);

  function geometry(m, flip) {
    const d = m.d, H = heightOf(m), p = m.piS, P = m.P;
    const tf = flip ? (q) => [q[0], H - q[1], q[2]] : (q) => q;
    const rl = (r) => (flip ? (r === 'top' ? 'bottom' : r === 'bottom' ? 'top' : r) : r);
    const I = (shape, sym, sb, val) => ({ shape, sym, sub: sb, val });
    const circ = (r, y, role, nm, sym, ck) => ({ disk: true, pts: [[r, y]], role: rl(role), name: nm, ck, info: I(SH.circle, sym, `${p} × ${r} × ${r}`, P * r * r) });
    const curv = (pts, nm, sym, sb, val, ck, role) => ({ pts, name: nm, ck, role: role || 'side', info: I(SH.curved, sym, sb, val) });
    const hemiUp = (r, y0) => arc(16, (t) => [r * Math.cos((PI * t) / 2), y0 + r * Math.sin((PI * t) / 2)]);
    const hemiDown = (r, y0) => arc(16, (t) => [r * Math.sin((PI * t) / 2), y0 + r - r * Math.cos((PI * t) / 2)]);
    let faces;
    function prismFaces(base, h, shBase, side, cks) {
      const c = tf([0, h / 2, 0]), n = base.length;
      const P0 = base.map(([x, z]) => tf([x, 0, z])), P1 = base.map(([x, z]) => tf([x, h, z]));
      const out = [];
      const fb = Face({ name: flip ? NMF.top : NMF.bottom, kind: 'flat', role: rl('bottom'), info: shBase, ck: cks.base }); addPoly(fb, P0, c); out.push(finish(fb));
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, e = Math.hypot(base[j][0] - base[i][0], base[j][1] - base[i][1]); const f = Face({ name: NMF.side(i + 1), kind: 'flat', role: 'side', info: side(i, e), ck: cks.side(i) }); addPoly(f, [P0[i], P0[j], P1[j], P1[i]], c); out.push(finish(f)); }
      const ft = Face({ name: flip ? NMF.bottom : NMF.top, kind: 'flat', role: rl('top'), info: shBase, ck: cks.base }); addPoly(ft, P1, c); out.push(finish(ft));
      return out;
    }
    const alt = (n) => (i) => (i === n - 1 && n % 2 ? 'D' : i % 2 ? 'C' : 'B');
    switch (m.solid) {
      case 'cube': case 'cuboid': {
        const l = m.solid === 'cube' ? d.l : d.l, b = m.solid === 'cube' ? d.l : d.b, h = m.solid === 'cube' ? d.l : d.h;
        const sq = m.solid === 'cube';
        const fw = (x, y, sx, sy) => I(eqv(x, y) ? SH.square : SH.rect, `${sx} × ${sy}`, `${x} × ${y}`, x * y);
        faces = prismFaces(rectBase(l, b), h, sq ? fw(l, l, 'a', 'a') : fw(l, b, 'l', 'b'), (i) => (i % 2 ? (sq ? fw(l, l, 'a', 'a') : fw(l, h, 'l', 'h')) : sq ? fw(l, l, 'a', 'a') : fw(b, h, 'b', 'h')), { base: 'A', side: (i) => (i % 2 ? 'B' : 'C') });
        break;
      }
      case 'prism': {
        const n = m.n, a = d.l, h = d.h, B = ngonArea(n, a);
        faces = prismFaces(regBase(n, a), h, I(NGON[n], 'B', fmt(B), B), () => I(eqv(a, h) ? SH.square : SH.rect, 'a × h', `${a} × ${h}`, a * h), { base: 'A', side: alt(n) });
        break;
      }
      case 'pyramid': {
        const n = m.n, a = d.l, h = d.h, B = ngonArea(n, a), s = Math.hypot(h, apothem(n, a)), base = regBase(n, a), c = tf([0, h / 3, 0]);
        const P0 = base.map(([x, z]) => tf([x, 0, z])), A = tf([0, h, 0]);
        faces = [];
        const fb = Face({ name: NMF.bottom, kind: 'flat', role: rl('bottom'), info: I(NGON[n], 'B', fmt(B), B), ck: 'A' }); addPoly(fb, P0, c); faces.push(finish(fb));
        for (let i = 0; i < n; i++) { const f = Face({ name: NMF.tri(i + 1), kind: 'flat', role: 'side', info: I(SH.triangle, '½ × a × s', `½ × ${a} × ${fmt(s)}`, (a * s) / 2), ck: alt(n)(i) }); addPoly(f, [P0[i], P0[(i + 1) % n], A], c); faces.push(finish(f)); }
        break;
      }
      case 'cylinder': { const { r, h } = d; faces = revolve([circ(r, 0, 'bottom', NMF.base, 'πr²', 'A'), curv([[r, 0], [r, h]], NMF.curved, '2πrh', `2 × ${p} × ${r} × ${h}`, 2 * P * r * h, 'B'), circ(r, h, 'top', NMF.topc, 'πr²', 'A')], tf([0, h / 2, 0]), tf); break; }
      case 'cone': { const { r, h } = d, l = Math.hypot(r, h); faces = revolve([circ(r, 0, 'bottom', NMF.base, 'πr²', 'A'), curv([[r, 0], [0, h]], NMF.curved, 'πrl', `${p} × ${r} × ${fmt(l)}`, P * r * l, 'B')], tf([0, h / 3, 0]), tf); break; }
      case 'sphere': { const r = d.r; faces = revolve([curv(arc(32, (t) => [r * Math.sin(PI * t), r - r * Math.cos(PI * t)]), NMF.curved, '4πr²', `4 × ${p} × ${r} × ${r}`, 4 * P * r * r, 'B')], tf([0, r, 0]), tf); break; }
      case 'hemisphere': { const r = d.r; faces = revolve([circ(r, 0, 'bottom', NMF.base, 'πr²', 'A'), curv(hemiUp(r, 0), NMF.curved, '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r, 'B', 'top')], tf([0, r * 0.4, 0]), tf); break; }
      case 'frustum': { const { r, r2, h } = d, l = Math.hypot(h, r - r2); faces = revolve([circ(r, 0, 'bottom', NMF.base, 'πr₁²', 'A'), curv([[r, 0], [r2, h]], NMF.curved, 'πl(r₁ + r₂)', `${p} × ${fmt(l)} × (${r} + ${r2})`, P * l * (r + r2), 'B'), circ(r2, h, 'top', NMF.topc, 'πr₂²', 'A')], tf([0, h / 2, 0]), tf); break; }
      default: {
        const r = d.r, h = d.h;
        const HM = (nm) => T2(nm.en, nm.hi);
        const hemiF = (pts, which) => curv(pts, HM(which === 'top' ? T2('hemisphere (top)', 'अर्धगोला (ऊपर)') : T2('hemisphere (bottom)', 'अर्धगोला (नीचे)')), '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r, which === 'top' ? 'D' : 'D');
        const cylF = (y0, y1, ck) => curv([[r, y0], [r, y1]], T2('cylinder part', 'बेलन वाला भाग'), '2πrh', `2 × ${p} × ${r} × ${h}`, 2 * P * r * h, ck);
        const floor = circ(r, 0, 'bottom', T2('floor (circle)', 'फ़र्श (वृत्त)'), 'πr²', 'A');
        if (m.combo === 'capsule') faces = revolve([hemiF(hemiDown(r, 0), 'bottom'), cylF(r, r + h, 'E'), hemiF(hemiUp(r, r + h), 'top')], tf([0, (h + 2 * r) / 2, 0]), tf);
        else if (m.combo === 'icecream') { const l = Math.hypot(r, h); faces = revolve([curv([[0, 0], [r, h]], T2('cone part', 'शंकु वाला भाग'), 'πrl', `${p} × ${r} × ${fmt(l)}`, P * r * l, 'W'), Object.assign(curv(hemiUp(r, h), T2('hemisphere part', 'अर्धगोला वाला भाग'), '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r, 'K'), { role: rl('top') })], tf([0, (h + r) / 2, 0]), tf); }
        else if (m.combo === 'tent') { const l = d.l, hc = tentConeH(d); faces = revolve([floor, cylF(0, h, 'T'), curv([[r, h], [0, h + hc]], T2('cone roof', 'शंकु की छत'), 'πrl', `${p} × ${r} × ${l}`, P * r * l, 'V')], tf([0, (h + hc) / 2, 0]), tf); }
        else if (m.combo === 'dome') faces = revolve([floor, cylF(0, h, 'S'), curv(hemiUp(r, h), T2('dome (hemisphere)', 'गुंबद (अर्धगोला)'), '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r, 'E')], tf([0, (h + r) / 2, 0]), tf);
        else {
          const a = d.l;
          const box = prismFaces(rectBase(a, a), a, I(SH.square, 'a × a', `${a} × ${a}`, a * a), () => I(SH.square, 'a × a', `${a} × ${a}`, a * a), { base: 'A', side: (i) => (i % 2 ? 'B' : 'C') });
          const top = box[box.length - 1];
          top.info = I(T2('square with a circle covered', 'वर्ग जिसका एक वृत्त ढका है'), 'a² − πr²', `${a} × ${a} − ${p} × ${r} × ${r}`, a * a - P * r * r);
          faces = box.concat(revolve([curv(hemiUp(r, a), T2('dome (hemisphere)', 'गुंबद (अर्धगोला)'), '2πr²', `2 × ${p} × ${r} × ${r}`, 2 * P * r * r, 'E')], tf([0, a, 0]), tf));
        }
      }
    }
    return { faces, H };
  }
  function boundR(faces, c) { let R = 0; faces.forEach((f) => f.verts.forEach((v) => { R = Math.max(R, len(sub(v, c))); })); return R || 1; }
  const soupOf = (faces) => { const out = []; faces.forEach((f, fi) => f.polys.forEach((p, pi) => out.push({ fi, pi, pts: p.map((i) => f.verts[i]), fl: f.fl[pi] }))); return out; };
  // Unit-cube grid lines on the faces of a box [-l/2,l/2]×[y0,y1]×[-b/2,b/2] (whole-number sides).
  function gridLines(l, b, y0, y1) {
    const S = [], x0 = -l / 2, x1 = l / 2, z0 = -b / 2, z1 = b / 2;
    for (let i = 1; i < l; i++) { const x = x0 + i; S.push([[x, y0, z1], [x, y1, z1], [0, 0, 1]], [[x, y0, z0], [x, y1, z0], [0, 0, -1]], [[x, y1, z0], [x, y1, z1], [0, 1, 0]], [[x, y0, z0], [x, y0, z1], [0, -1, 0]]); }
    for (let i = 1; i < b; i++) { const z = z0 + i; S.push([[x1, y0, z], [x1, y1, z], [1, 0, 0]], [[x0, y0, z], [x0, y1, z], [-1, 0, 0]], [[x0, y1, z], [x1, y1, z], [0, 1, 0]], [[x0, y0, z], [x1, y0, z], [0, -1, 0]]); }
    for (let y = Math.ceil(y0 + 1e-6); y < y1 - 1e-6; y++) S.push([[x0, y, z1], [x1, y, z1], [0, 0, 1]], [[x0, y, z0], [x1, y, z0], [0, 0, -1]], [[x1, y, z0], [x1, y, z1], [1, 0, 0]], [[x0, y, z0], [x0, y, z1], [-1, 0, 0]]);
    return S;
  }

  // ---------------------------------------------------------------- slicing
  // Clip a polygon soup by the plane n·p = d (keep below or above) and close it with the cut face (convex solids).
  function clipSoup(soup, n, dd, below, capCol) {
    const eps = 1e-7;
    const out = [], hits = [];
    const sd = (p) => dot(n, p) - dd;
    const inside = (s) => (below ? s <= eps : s >= -eps);
    for (const sp of soup) {
      const P = sp.pts, F = sp.fl, k = P.length, o = [], of = [];
      for (let i = 0; i < k; i++) {
        const A = P[i], B = P[(i + 1) % k], sa = sd(A), sb = sd(B), ia = inside(sa), ib = inside(sb);
        if (Math.abs(sa) <= eps) hits.push(A);
        if (ia) { o.push(A); of.push(F[i]); }
        if (ia !== ib) {
          const t = sa / (sa - sb), I = add(A, mul(sub(B, A), t));
          hits.push(I);
          if (ia) { o.push(I); of.push('c'); } else { o.push(I); of.push(F[i]); }
        }
      }
      if (o.length >= 3) out.push({ fi: sp.fi, pi: sp.pi, pts: o, fl: of });
    }
    const cap = capOf(hits, n, below);
    if (cap) out.push({ fi: -1, pi: 0, pts: cap, fl: cap.map(() => 'c'), col: capCol });
    return { polys: out, cap };
  }
  function planeBasis(n) {
    const up = [0, 1, 0];
    let v = sub(up, mul(n, dot(up, n)));
    if (len(v) < 0.2) v = [0, 0, -1];
    v = nrm(sub(v, mul(n, dot(v, n))));
    return { u: nrm(cross(v, n)), v };
  }
  function capOf(hits, n, below) {
    const seen = new Map(), pts = [];
    hits.forEach((p) => { const k = p.map((x) => Math.round(x * 1e5)).join(','); if (!seen.has(k)) { seen.set(k, 1); pts.push(p); } });
    if (pts.length < 3) return null;
    const c = cen(pts), { u, v } = planeBasis(n);
    pts.sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
    if (dot(newell(pts), below ? n : mul(n, -1)) < 0) pts.reverse();
    return pts;
  }
  // Name a cut face from its measured outline (ordered convex polygon in the plane).
  const SHN = {
    circle: T2('circle', 'वृत्त'), ellipse: T2('ellipse (oval)', 'दीर्घवृत्त (अंडाकार)'), semicircle: T2('semicircle', 'अर्धवृत्त'), segment: T2('part of a circle', 'वृत्त का भाग'),
    triangle: T2('triangle', 'त्रिभुज'), eqtri: T2('equilateral triangle', 'समबाहु त्रिभुज'), isotri: T2('isosceles triangle', 'समद्विबाहु त्रिभुज'),
    square: T2('square', 'वर्ग'), rectangle: T2('rectangle', 'आयत'), rhombus: T2('rhombus', 'समचतुर्भुज'), parallelogram: T2('parallelogram', 'समांतर चतुर्भुज'), trapezium: T2('trapezium', 'समलंब चतुर्भुज'), quad: T2('quadrilateral', 'चतुर्भुज'),
    pentagon: T2('pentagon', 'पंचभुज'), hexagon: T2('hexagon', 'षट्भुज'), rhex: T2('regular hexagon', 'सम षट्भुज'), heptagon: T2('heptagon', 'सप्तभुज'), octagon: T2('octagon', 'अष्टभुज'),
    stadium: T2('rectangle with round ends', 'गोल सिरों वाला आयत'), mixed1: T2('curved shape with one straight edge', 'एक सीधी भुजा वाला वक्र आकार'), curved: T2('curved shape', 'वक्र आकार'),
    pentagonish: T2('shape with straight and curved edges', 'सीधी और वक्र भुजाओं वाला आकार'),
  };
  const FAMILY = { square: ['rectangle', 'rhombus', 'parallelogram', 'quad'], rectangle: ['parallelogram', 'quad'], rhombus: ['parallelogram', 'quad'], eqtri: ['triangle', 'isotri'], isotri: ['triangle'], rhex: ['hexagon'], circle: ['ellipse'], semicircle: ['segment'] };
  function classify(P0) {
    let P = P0.slice();
    const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const size = Math.max(...P.map((p) => Math.abs(p[0]))) + Math.max(...P.map((p) => Math.abs(p[1]))) || 1;
    P = P.filter((p, i) => d2(p, P[(i + 1) % P.length]) > size * 1e-4);
    const turn = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); };
    for (let again = true; again && P.length > 3;) {
      again = false;
      for (let i = 0; i < P.length; i++) { if (turn(P[(i - 1 + P.length) % P.length], P[i], P[(i + 1) % P.length]) < 1.2 * DEG) { P.splice(i, 1); again = true; break; } }
    }
    const n = P.length;
    if (n < 3) return 'curved';
    const corner = P.map((b, i) => turn(P[(i - 1 + n) % n], b, P[(i + 1) % n]) > 21 * DEG);
    const E = P.map((a, i) => d2(a, P[(i + 1) % n]));
    const per = E.reduce((s, x) => s + x, 0);
    const eq = (a, b, t = 0.025) => Math.abs(a - b) <= t * Math.max(a, b);
    if (corner.every(Boolean) && n <= 8) {
      if (n === 3) return eq(E[0], E[1]) && eq(E[1], E[2]) ? 'eqtri' : eq(E[0], E[1]) || eq(E[1], E[2]) || eq(E[0], E[2]) ? 'isotri' : 'triangle';
      if (n === 4) {
        const dir = (i) => { const a = P[i], b = P[(i + 1) % 4]; return [(b[0] - a[0]) / E[i], (b[1] - a[1]) / E[i]]; };
        const par = (i, j) => Math.abs(dir(i)[0] * dir(j)[1] - dir(i)[1] * dir(j)[0]) < 0.02;
        const right = [0, 1, 2, 3].every((i) => Math.abs(dir(i)[0] * dir((i + 1) % 4)[0] + dir(i)[1] * dir((i + 1) % 4)[1]) < 0.03);
        const allEq = E.every((x) => eq(x, E[0]));
        if (right) return allEq ? 'square' : 'rectangle';
        if (allEq) return 'rhombus';
        const p1 = par(0, 2), p2 = par(1, 3);
        return p1 && p2 ? 'parallelogram' : p1 || p2 ? 'trapezium' : 'quad';
      }
      if (n === 6) return E.every((x) => eq(x, E[0], 0.03)) ? 'rhex' : 'hexagon';
      return { 5: 'pentagon', 7: 'heptagon', 8: 'octagon' }[n];
    }
    const longE = E.map((x) => x > per * 0.09);
    const k = longE.filter(Boolean).length;
    if (k === 0) {
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      const rs = P.map((p) => d2(p, c)), rm = rs.reduce((s, x) => s + x, 0) / rs.length;
      if ((Math.max(...rs) - Math.min(...rs)) / rm < 0.03) return 'circle';
      // principal axes
      const mc = [xs.reduce((s, x) => s + x, 0) / n, ys.reduce((s, x) => s + x, 0) / n];
      let sxx = 0, syy = 0, sxy = 0;
      P.forEach((p) => { const x = p[0] - mc[0], y = p[1] - mc[1]; sxx += x * x; syy += y * y; sxy += x * y; });
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), cu = Math.cos(th), su = Math.sin(th);
      const Q = P.map((p) => [(p[0] - mc[0]) * cu + (p[1] - mc[1]) * su, -(p[0] - mc[0]) * su + (p[1] - mc[1]) * cu]);
      const qx = Q.map((q) => q[0]), qy = Q.map((q) => q[1]);
      const ox = (Math.min(...qx) + Math.max(...qx)) / 2, oy = (Math.min(...qy) + Math.max(...qy)) / 2, A = (Math.max(...qx) - Math.min(...qx)) / 2, B = (Math.max(...qy) - Math.min(...qy)) / 2;
      if (Q.every((q) => Math.abs(((q[0] - ox) / A) ** 2 + ((q[1] - oy) / B) ** 2 - 1) < 0.06)) return 'ellipse';
      return 'curved';
    }
    if (k === 1) {
      const i = longE.indexOf(true), a = P[i], b = P[(i + 1) % n], M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], R = E[i] / 2;
      const rest = P.filter((_, j) => j !== i && j !== (i + 1) % n);
      if (rest.every((q) => Math.abs(d2(q, M) - R) < 0.03 * R)) return 'semicircle';
      // a circle through a, b and the farthest point
      const far = rest.reduce((f, q) => (Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) > Math.abs((b[0] - a[0]) * (f[1] - a[1]) - (b[1] - a[1]) * (f[0] - a[0])) ? q : f), rest[0]);
      const cc = circum(a, b, far);
      if (cc && rest.every((q) => Math.abs(d2(q, cc.c) - cc.r) < 0.03 * cc.r)) return 'segment';
      return 'mixed1';
    }
    if (k === 2) {
      const [i, j] = longE.map((x, ii) => (x ? ii : -1)).filter((x) => x >= 0);
      const di = [P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]], dj = [P[(j + 1) % n][0] - P[j][0], P[(j + 1) % n][1] - P[j][1]];
      if (Math.abs(di[0] * dj[1] - di[1] * dj[0]) / (E[i] * E[j]) < 0.02 && eq(E[i], E[j], 0.03)) return 'stadium';
    }
    return 'pentagonish';
  }
  function circum(a, b, c) {
    const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(D) < 1e-12) return null;
    const A2 = a[0] ** 2 + a[1] ** 2, B2 = b[0] ** 2 + b[1] ** 2, C2 = c[0] ** 2 + c[1] ** 2;
    const x = (A2 * (b[1] - c[1]) + B2 * (c[1] - a[1]) + C2 * (a[1] - b[1])) / D, y = (A2 * (c[0] - b[0]) + B2 * (a[0] - c[0]) + C2 * (b[0] - a[0])) / D;
    return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
  }
  const CUTN = { horizontal: [0, 1, 0], vertical: [1, 0, 0], slant: nrm([Math.sin(35 * DEG), Math.cos(35 * DEG), 0]), corner: nrm([1, 1, 1]) };
  function section(faces, dir, t) {
    const n = CUTN[dir], soup = soupOf(faces);
    let lo = Infinity, hi = -Infinity;
    soup.forEach((s) => s.pts.forEach((p) => { const v = dot(n, p); lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    const dd = lerp(lo, hi, clamp(t, 0.04, 0.96));
    const A = clipSoup(soup, n, dd, true, '#FFD23F'), B = clipSoup(soup, n, dd, false, '#FFD23F');
    let shape = 'curved', flat = null;
    if (A.cap) { const { u, v } = planeBasis(n), c = cen(A.cap); flat = A.cap.map((p) => [dot(sub(p, c), u), dot(sub(p, c), v)]); shape = classify(flat); }
    return { n, dd, below: A.polys, above: B.polys, cap: A.cap, flat, shape };
  }

  // ---------------------------------------------------------------- nets: hinge trees with exact bending
  // Net faces lie in the table plane y = 0 (x, z); the side facing up becomes the inside. Folding turns each face
  // about its hinge (on its parent) and bends curved pieces: a strip rolls into a cylinder (curl), a sector wraps into
  // a cone (keeping its arc's midpoint and tangent fixed), so the pieces close up exactly at full fold.
  const hasNet = (m) => !m.combo && m.solid !== 'sphere' && m.solid !== 'hemisphere';
  function netOf(m) {
    const d = m.d, NF = [];
    const mk = (o, polys) => { const f = Face({ name: o.name, kind: o.kind || 'flat' }); polys.forEach((pl) => addPoly(f, pl.map(([x, z]) => [x, 0, z]))); finish(f); NF.push(Object.assign(o, { F: f })); return NF.length - 1; };
    const disk = (cx, cz, r, N = NB) => [Array.from({ length: N }, (_, i) => { const a = (2 * PI * (i + 0.5)) / N; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; })];
    const cen2 = (P) => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
    function flower(base, h, shp) {
      const n = base.length, cB = cen2(base);
      mk({ parent: -1, lp: cB, label: shp.base }, [base]);
      const outw = (i) => { const p = base[i], q = base[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]], L0 = Math.hypot(e[0], e[1]); const u = [e[0] / L0, e[1] / L0]; let o = [u[1], -u[0]]; const mdl = [(p[0] + q[0]) / 2 - cB[0], (p[1] + q[1]) / 2 - cB[1]]; if (o[0] * mdl[0] + o[1] * mdl[1] < 0) o = [-o[0], -o[1]]; return { p, q, u, o, L0 }; };
      for (let i = 0; i < n; i++) { const { p, q, u, o, L0 } = outw(i); const R = [p, q, [q[0] + h * o[0], q[1] + h * o[1]], [p[0] + h * o[0], p[1] + h * o[1]]]; mk({ parent: 0, H: p, D: u, ang: PI / 2, lp: cen2(R), label: shp.side(i, L0) }, [R]); }
      const { p, q, u, o } = outw(n - 1);
      const L0p = [(p[0] + q[0]) / 2 + (h / 2) * o[0], (p[1] + q[1]) / 2 + (h / 2) * o[1]];
      const top = base.map((v) => { const s = (v[0] - L0p[0]) * o[0] + (v[1] - L0p[1]) * o[1]; return [v[0] - 2 * s * o[0], v[1] - 2 * s * o[1]]; });
      mk({ parent: n, H: [p[0] + h * o[0], p[1] + h * o[1]], D: u, ang: PI / 2, lp: cen2(top), label: shp.base }, [top.slice().reverse()]);
    }
    const dimL = (a, b) => `${fmt(a)} × ${fmt(b)}`;
    const shapeW = (a, b) => (eqv(a, b) ? SH.square : SH.rect);
    switch (m.solid) {
      case 'cube': flower(rectBase(d.l, d.l), d.l, { base: [SH.square, dimL(d.l, d.l)], side: () => [SH.square, dimL(d.l, d.l)] }); break;
      case 'cuboid': flower(rectBase(d.l, d.b), d.h, { base: [shapeW(d.l, d.b), dimL(d.l, d.b)], side: (i, e) => [shapeW(e, d.h), dimL(e, d.h)] }); break;
      case 'prism': flower(regBase(m.n, d.l), d.h, { base: [NGON[m.n], `${fmt(d.l)}`], side: () => [shapeW(d.l, d.h), dimL(d.l, d.h)] }); break;
      case 'pyramid': {
        const n = m.n, a = d.l, base = regBase(n, a), cB = [0, 0], ap = apothem(n, a), s = Math.hypot(d.h, ap), dih = Math.atan2(d.h, ap);
        mk({ parent: -1, lp: cB, label: [NGON[n], fmt(a)] }, [base]);
        for (let i = 0; i < n; i++) {
          const p = base[i], q = base[(i + 1) % n], u = [(q[0] - p[0]) / a, (q[1] - p[1]) / a]; let o = [u[1], -u[0]]; const md = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; if (o[0] * md[0] + o[1] * md[1] < 0) o = [-o[0], -o[1]];
          const A = [md[0] + s * o[0], md[1] + s * o[1]];
          mk({ parent: 0, H: p, D: u, ang: PI - dih, lp: cen2([p, q, A]), label: [SH.triangle, `s = ${fmt(s)}`] }, [[p, q, A]]);
        }
        break;
      }
      case 'cylinder': {
        const { r, h } = d, W2 = PI * r, N = NB;
        mk({ parent: -1, lp: [0, 0], label: [SH.circle, `r = ${fmt(r)}`], kind: 'flat' }, disk(0, 0, r));
        const strips = Array.from({ length: N }, (_, i) => { const x0 = -W2 + (2 * W2 * i) / N, x1 = -W2 + (2 * W2 * (i + 1)) / N; return [[x0, r], [x1, r], [x1, r + h], [x0, r + h]]; });
        mk({ parent: 0, H: [0, r], D: [1, 0], ang: PI / 2, deform: { type: 'curl', o: [0, r], t: [1, 0], k1: 1 / r }, lp: [0, r + h / 2], label: [SH.rect, `2πr × h = ${fmt(2 * m.P * r)} × ${fmt(h)}`], kind: 'curved' }, strips);
        mk({ parent: 1, H: [0, r + h], D: [1, 0], ang: PI / 2, lp: [0, 2 * r + h], label: [SH.circle, `r = ${fmt(r)}`] }, disk(0, 2 * r + h, r));
        break;
      }
      case 'cone': case 'frustum': {
        const R = d.r, q = m.solid === 'cone' ? 0 : d.r2, h = d.h, Lf = Math.hypot(h, R - q), L1 = (Lf * R) / (R - q), L2 = L1 - Lf, s0 = R / L1, a0 = Math.asin(s0);
        const th = 2 * PI * s0, Az = R + L1, N = NB;
        const g = (rho, ph) => [rho * Math.sin(ph), Az - rho * Math.cos(ph)];
        mk({ parent: -1, lp: [0, 0], label: [SH.circle, `r = ${fmt(R)}`] }, disk(0, 0, R));
        const polys = [];
        for (let i = 0; i < N; i++) { const p0 = -th / 2 + (th * i) / N, p1 = -th / 2 + (th * (i + 1)) / N; polys.push(L2 < 1e-9 ? [[0, Az], g(L1, p0), g(L1, p1)] : [g(L2, p0), g(L1, p0), g(L1, p1), g(L2, p1)]); }
        const secLabel = m.solid === 'cone' ? [T2('sector', 'त्रिज्यखंड'), `l = ${fmt(Lf)}`] : [T2('part of a ring', 'वलय का भाग'), `l = ${fmt(Lf)}`];
        mk({ parent: 0, H: [0, R], D: [1, 0], ang: PI / 2 + a0, deform: { type: 'cone', A: [0, Az], m: [0, -1], p: [1, 0], s0 }, lp: [0, R + Lf * 0.42], label: secLabel, kind: 'curved' }, polys);
        if (q > 0) mk({ parent: 1, H: [0, R + Lf], D: [1, 0], ang: PI / 2 - a0, lp: [0, R + Lf + q], label: [SH.circle, `r = ${fmt(q)}`] }, disk(0, R + Lf + q, q));
        break;
      }
      default: return null;
    }
    // hinge sense: the face lifts (its centroid goes up) when it turns
    NF.forEach((f) => {
      if (f.parent < 0) return;
      const c = cen(f.F.verts), H3 = [f.H[0], 0, f.H[1]], D3 = [f.D[0], 0, f.D[1]];
      f.sg = apply(hingeT(H3, D3, 0.1), c)[1] > 0 ? 1 : -1;
      f.H3 = H3; f.D3 = D3;
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    NF.forEach((f) => f.F.verts.forEach((v) => { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); }));
    return { faces: NF, box: [x0, x1, z0, z1] };
  }
  function deformPt(df, q, f) {
    if (!df) return q;
    const up = [0, 1, 0];
    if (df.type === 'curl') {
      const o = [df.o[0], 0, df.o[1]], t = [df.t[0], 0, df.t[1]], u = dot(sub(q, o), t), w = sub(sub(q, o), mul(t, u)), k = f * df.k1;
      if (k < 1e-7) return q;
      return add(add(o, w), add(mul(t, Math.sin(k * u) / k), mul(up, (1 - Math.cos(k * u)) / k)));
    }
    const A = [df.A[0], 0, df.A[1]], mm3 = [df.m[0], 0, df.m[1]], p3 = [df.p[0], 0, df.p[1]], v = sub(q, A), rho = len(v);
    if (rho < 1e-9) return A;
    const ph = Math.atan2(dot(v, p3), dot(v, mm3)), sA = 1 - f * (1 - df.s0), cA = Math.sqrt(Math.max(0, 1 - sA * sA)), ps = ph / sA;
    const ax = add(mul(mm3, cA), mul(up, sA)), e1 = sub(mul(mm3, sA), mul(up, cA));
    const gdir = add(mul(ax, cA), mul(add(mul(e1, Math.cos(ps)), mul(p3, Math.sin(ps))), sA));
    return add(A, mul(gdir, rho));
  }
  // The net at fold f (0 flat, 1 closed), as a soup in world coordinates (solid on the table, axis up).
  function netSoup(net, f) {
    const T = [];
    const out = [];
    net.faces.forEach((nf, i) => {
      T[i] = nf.parent < 0 ? ID : compose(T[nf.parent], hingeT(nf.H3, nf.D3, nf.sg * nf.ang * f));
      const V = nf.F.verts.map((q) => apply(T[i], deformPt(nf.deform, q, f)));
      nf.F.polys.forEach((p, pi) => out.push({ fi: i, pi, pts: p.map((k) => V[k]), fl: nf.F.fl[pi] }));
    });
    return out;
  }

  // ---------------------------------------------------------------- fill: containers, scoops and water levels
  function fillPlan(m) {
    const d = m.d;
    if (m.solid === 'cube' || m.solid === 'cuboid') { const l = d.l, b = m.solid === 'cube' ? d.l : d.b, h = m.solid === 'cube' ? d.l : d.h; return { kind: 'cubes', l, b, h, N: h }; }
    const cyl = { solid: 'cylinder', d: { r: d.r, h: d.h } }, cone = (h) => ({ solid: 'cone', d: { r: d.r, h } });
    switch (m.solid) {
      case 'cylinder': case 'cone': return { kind: 'scoop', cont: cyl, scoop: cone(d.h), N: 3, sn: T2('cone', 'शंकु') };
      case 'sphere': return { kind: 'scoop', cont: { solid: 'sphere', d: { r: d.r } }, scoop: cone(d.r), N: 4, sn: T2('cone', 'शंकु') };
      case 'hemisphere': return { kind: 'scoop', cont: { solid: 'hemisphere', d: { r: d.r }, flip: 1 }, scoop: cone(d.r), N: 2, sn: T2('cone', 'शंकु') };
      case 'prism': case 'pyramid': return { kind: 'scoop', cont: { solid: 'prism', n: m.n, d: { l: d.l, h: d.h } }, scoop: { solid: 'pyramid', n: m.n, d: { l: d.l, h: d.h } }, N: 3, sn: T2('pyramid', 'पिरामिड') };
      case 'frustum': return { kind: 'tap', cont: { solid: 'frustum', d: { r: d.r, r2: d.r2, h: d.h }, flip: 1 } };
      default: return { kind: 'tap', cont: { solid: 'combination', combo: m.combo, d: Object.assign({}, d) } };
    }
  }
  // Horizontal cross-section area of a container at height y (true π, for drawing the water level).
  function crossArea(c, y) {
    const d = c.d, r = d.r, s = (x) => Math.max(0, x);
    switch (c.solid) {
      case 'cylinder': return PI * r * r;
      case 'sphere': return PI * s(r * r - (y - r) ** 2);
      case 'hemisphere': return PI * s(r * r - (r - y) ** 2); // a bowl (flat side up)
      case 'prism': return ngonArea(c.n, d.l);
      case 'cuboid': return d.l * d.b;
      case 'frustum': { const rho = d.r2 + ((d.r - d.r2) * y) / d.h; return PI * rho * rho; } // bucket: narrow end down
      default: {
        const h = d.h;
        switch (c.combo) {
          case 'capsule': return y < r ? PI * s(r * r - (r - y) ** 2) : y <= r + h ? PI * r * r : PI * s(r * r - (y - r - h) ** 2);
          case 'icecream': return y < h ? PI * ((r * y) / h) ** 2 : PI * s(r * r - (y - h) ** 2);
          case 'tent': { const hc = tentConeH(d); return y < h ? PI * r * r : PI * (r * s(1 - (y - h) / hc)) ** 2; }
          case 'dome': return y < h ? PI * r * r : PI * s(r * r - (y - h) ** 2);
          default: return y < d.l ? d.l * d.l : PI * s(r * r - (y - d.l) ** 2);
        }
      }
    }
  }
  function volBelow(c, H, y) { const n = 160, dy = Math.min(y, H) / n; let v = 0; for (let i = 0; i < n; i++) v += crossArea(c, (i + 0.5) * dy) * dy; return v; }
  function levelFor(c, H, V) { let lo = 0, hi = H; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (volBelow(c, H, mid) < V) lo = mid; else hi = mid; } return (lo + hi) / 2; }
  const asModel = (c) => ({ solid: c.solid, combo: c.combo || null, n: c.n || 0, d: c.d, piS: '22/7', P: 22 / 7 });

  // ---------------------------------------------------------------- questions
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(a, seed) { let x = seed || 1; const r = () => { x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return x / 4294967296; }; const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
  function numQ(q, right, wrongs, unit, seed, extra) {
    const seen = new Set([fmt(right)]), opts = [{ v: right, ok: true }];
    wrongs.forEach((w) => { if (opts.length < 4 && w.v > 0 && !seen.has(fmt(w.v))) { seen.add(fmt(w.v)); opts.push({ v: w.v, ok: false, why: w.why }); } });
    (extra || []).forEach((w) => { if (opts.length < 3 && w.v > 0 && !seen.has(fmt(w.v))) { seen.add(fmt(w.v)); opts.push({ v: w.v, ok: false, why: w.why }); } });
    return { q, unit, opts: shuffle(opts, seed) };
  }
  const netShapes = (m) => {
    const d = m.d, cnt = {};
    const addS = (k, n) => { cnt[k] = (cnt[k] || 0) + n; };
    switch (m.solid) {
      case 'cube': addS('square', 6); break;
      case 'cuboid': [[d.l, d.b], [d.b, d.h], [d.l, d.h]].forEach(([a, b]) => addS(eqv(a, b) ? 'square' : 'rectangle', 2)); break;
      case 'prism': addS('n' + m.n, 2); addS(eqv(d.l, d.h) ? 'square' : 'rectangle', m.n); if (m.n === 4) { cnt.square = (cnt.square || 0) + (cnt.n4 || 0); delete cnt.n4; } break;
      case 'pyramid': addS('n' + m.n, 1); addS('triangle', m.n); if (m.n === 3) { cnt.triangle += cnt.n3; delete cnt.n3; } if (m.n === 4) { cnt.square = cnt.n4; delete cnt.n4; } break;
      case 'cylinder': addS('circle', 2); addS('rectangle', 1); break;
      case 'cone': addS('circle', 1); addS('sector', 1); break;
      case 'frustum': addS('circle', 2); addS('ring', 1); break;
    }
    return cnt;
  };
  const SW = { square: ['square', 'squares', 'वर्ग'], rectangle: ['rectangle', 'rectangles', 'आयत'], triangle: ['triangle', 'triangles', 'त्रिभुज'], circle: ['circle', 'circles', 'वृत्त'], sector: ['sector', 'sectors', 'त्रिज्यखंड'], ring: ['part of a ring', 'parts of a ring', 'वलय का भाग'], n5: ['pentagon', 'pentagons', 'पंचभुज'], n6: ['hexagon', 'hexagons', 'षट्भुज'], n7: ['heptagon', 'heptagons', 'सप्तभुज'], n8: ['octagon', 'octagons', 'अष्टभुज'], n3: ['triangle', 'triangles', 'त्रिभुज'] };
  function shapesText(cnt) {
    const ks = Object.keys(cnt).filter((k) => cnt[k] > 0);
    return T2(ks.map((k) => `${cnt[k]} ${cnt[k] === 1 ? SW[k][0] : SW[k][1]}`).join(' and '), ks.map((k) => `${cnt[k]} ${SW[k][2]}`).join(' और '));
  }

  // ---------------------------------------------------------------- styles
  const CSS = `.sl { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; color: var(--ink); font-family: var(--font-body); }
.sl.sl-wide { grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); align-items: start; }
.sl-stage { position: relative; border-radius: 20px; border: 1px solid var(--line); padding: 4px 4px 10px; background: radial-gradient(120% 95% at 28% 0%, #FFFFFF 0%, #EEF3FC 45%, #DCE6F7 100%); box-shadow: 0 10px 30px rgba(6,18,51,.08); overflow: hidden; }
:root[data-theme="dark"] .sl-stage { background: radial-gradient(120% 95% at 28% 0%, #24366F 0%, #14214D 50%, #0B1433 100%); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sl-stage { background: radial-gradient(120% 95% at 28% 0%, #24366F 0%, #14214D 50%, #0B1433 100%); } }
.sl-svg { display: block; width: 100%; height: auto; touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: grab; border-radius: 16px; }
.sl-svg:active { cursor: grabbing; }
.sl-svg:focus-visible { outline: 3px solid #8B3DFF; outline-offset: -3px; }
.sl-svg text { font-family: var(--font-body); pointer-events: none; }
.sl-bg, .sl-back, .sl-top { pointer-events: none; }
.sl-face { cursor: pointer; outline: none; }
.sl-face:focus-visible { filter: drop-shadow(0 0 5px #8B3DFF) drop-shadow(0 0 2px #8B3DFF); }
.sl-ed { fill: none; stroke: #0B1433; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; opacity: .82; }
.sl-hid { fill: none; stroke: #0B1433; stroke-width: 1.8; stroke-dasharray: 7 7; opacity: .42; }
.sl-cutl { fill: none; stroke: #B45309; stroke-width: 2.6; stroke-linejoin: round; }
.sl-dim { stroke: #0B1433; stroke-width: 2.2; fill: none; }
.sl-dim.dash { stroke-dasharray: 6 5; }
.sl-pill rect { fill: #FFFFFF; stroke: rgba(6,18,51,.25); stroke-width: 1.5; }
.sl-pill text { font-weight: 700; font-size: 19px; fill: #0F172A; }
.sl-badge circle { fill: #8B3DFF; stroke: #fff; stroke-width: 3; }
.sl-badge text { font-family: var(--font-display); font-weight: 800; font-size: 22px; fill: #fff; }
.sl-vdot { fill: #FFD23F; stroke: #0B1433; stroke-width: 2; }
.sl-rot { display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 6px; }
.sl-rb { min-width: 46px; min-height: 46px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; font: 700 .95rem var(--font-body); box-shadow: 0 2px 0 rgba(6,18,51,.12); transition: transform .12s; }
.sl-rb svg { width: 22px; height: 22px; flex: none; }
.sl-rb:active { transform: translateY(1px); }
.sl-rb[aria-pressed="true"] { background: #8B3DFF; border-color: #8B3DFF; color: #fff; }
.sl-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sl-head { display: flex; gap: 12px; align-items: center; }
.sl-ico { width: 52px; height: 52px; border-radius: 16px; flex: none; display: grid; place-items: center; background: linear-gradient(140deg, #8B3DFF, #1D4ED8); box-shadow: 0 6px 16px rgba(29,78,216,.28); }
.sl-ico svg { width: 34px; height: 34px; }
.sl-head h3 { font: 800 1.35rem/1.15 var(--font-display); margin: 0; }
.sl-dims { margin: 2px 0 0; color: var(--ink-2); font-weight: 600; font-size: .95rem; }
.sl-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.sl-btn { min-height: 48px; border: 0; border-radius: 14px; padding: 0 18px; font: 700 1rem var(--font-body); color: #fff; background: linear-gradient(180deg, #3B6EF0, #1D4ED8); box-shadow: 0 3px 0 rgba(6,18,51,.28); display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: transform .12s, filter .12s; flex: 1 1 auto; }
.sl-btn svg { width: 22px; height: 22px; flex: none; }
.sl-btn:hover { filter: brightness(1.06); }
.sl-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(6,18,51,.28); }
.sl-btn.grape { background: linear-gradient(180deg, #A266FF, #7C2DF0); }
.sl-btn.plain { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; }
.sl-btn[aria-pressed="true"] { background: linear-gradient(180deg, #A266FF, #7C2DF0); color: #fff; box-shadow: 0 0 0 3px rgba(139,61,255,.3); }
.sl-btn:disabled { opacity: .5; cursor: default; }
.sl-sliders { display: grid; gap: 8px; }
.sl-sl { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 12px 4px; }
.sl-sl span { font-weight: 700; font-size: .95rem; }
.sl-sl output { font: 800 1.08rem var(--font-display); color: var(--grape); }
.sl-sl input { grid-column: 1 / -1; width: 100%; min-height: 36px; accent-color: #8B3DFF; margin: 0; }
.sl-out { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-height: 52px; }
.sl-out p { margin: 0; }
.sl-f { border-left: 4px solid #8B3DFF; padding: 2px 0 2px 10px; display: flex; flex-direction: column; gap: 2px; }
.sl-f b { font-size: .9rem; color: var(--ink-2); }
.sl-f span { font: 600 1.06rem/1.35 var(--font-body); overflow-wrap: anywhere; }
.sl-f .val { font: 800 1.2rem var(--font-display); color: var(--ink); }
.sl-f.hide .val { color: var(--ink-2); }
.sl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sl-chip { border-radius: 999px; padding: 5px 12px; background: var(--sunk); font-weight: 700; font-size: .92rem; border: 1px solid var(--line); }
.sl-chip b { font-family: var(--font-display); color: var(--grape); font-size: 1.05rem; }
.sl-note { font-size: .93rem; color: var(--ink-2); }
.sl-big { font: 800 1.25rem var(--font-display); }
.sl-photo { width: 100%; max-height: 160px; object-fit: cover; border-radius: 12px; }
.sl-sec { display: flex; gap: 12px; align-items: center; }
.sl-sec svg { width: 120px; height: 90px; flex: none; background: var(--sunk); border-radius: 12px; }
.sl-q { background: var(--sun-t); border: 1.5px solid #F5B90A; border-radius: 16px; padding: 12px 14px; }
.sl-q > p { margin: 0 0 8px; font-weight: 800; }
.sl-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sl-opt { min-height: 48px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1rem/1.2 var(--font-body); padding: 6px 10px; transition: transform .12s, background .2s; }
.sl-opt:active { transform: scale(.98); }
.sl-opt.right { background: var(--good); border-color: var(--good); color: #fff; }
:root[data-theme="dark"] .sl-opt.right { color: #08201D; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sl-opt.right { color: #08201D; } }
.sl-opt.wrong { background: var(--bad-t); border-color: var(--bad); }
.sl-why { margin: 8px 0 0; font-weight: 600; }
.sl-why:empty { display: none; }
.sl-tiny .sl-rb { padding: 0 9px; }
.sl-tiny .sl-rb span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: reduce) { .sl-btn, .sl-rb, .sl-opt { transition: none; } }`;

  const ICON = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18.5 2.5v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(24 0) scale(-1 1)"/></svg>',
    turnL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5.5 2.5v4.6h4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    turnR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18.5 2.5v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spin: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M17 6.5l3 1.5-1 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
    unfold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    fold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
    pour: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h9l-2 7H6z" fill="currentColor" opacity=".9"/><path d="M10 12c0 3 4 3 4 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="12" y="17" width="9" height="5" rx="1.5" fill="currentColor"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    knife: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20L17 6l3 1-12 13z" fill="currentColor"/><path d="M17 6l3-3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    cube: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4l14 8v16l-14 8-14-8V12z" fill="#FFD23F"/><path d="M20 20l14-8v16l-14 8z" fill="#22C55E"/><path d="M20 20L6 12v16l14 8z" fill="#02CFF9"/><path d="M20 4l14 8-14 8-14-8z" fill="#FFE98A"/></svg>',
  };
  const COLK = { A: '#FFC93C', B: '#3B82F6', C: '#22C55E', D: '#FF6B57', E: '#14B8A6', W: '#E3A15B', K: '#FF8FB8', T: '#FF8A3D', V: '#8B3DFF', S: '#F4D9A6' };
  const WATER = '#2F8FE8';
  const DARK = '#0B1433';
  const LIGHT = nrm([-0.45, 0.68, 0.58]), HALF = nrm(add(LIGHT, [0, 0, 1]));

  // ---------------------------------------------------------------- the view
  function solids(root, config, api) {
    const t = (x) => api.t(x);
    const m0 = norm(config);
    let m = m0;
    const mode = config.mode;
    const ask = config.ask !== false;
    const S = { yaw: -34 * DEG, pitch: 24 * DEG, spin: mode === 'turn' && !reduced(), fold: 1, marked: [], sel: -1, cutDir: config.cut || 'horizontal', cutPos: 0.5, gap: 0, blade: 1, build: 1, pours: 0, frac: 0, pourT: -1, tap: 0, busy: false, wide: false, qa: { done: false, tries: 0, picked: -1, why: null }, countedSent: false, unfolded: false };
    let G = null, NET = null, PLAN = null, FILLG = null, SEC = null, raf = 0, spinRaf = 0, ro = null, stops = [], dragRot = 0;
    const svgNS = 'http://www.w3.org/2000/svg';
    let VB = [640, 500];

    // --- static layout
    const keysOf = keysFor(config);
    const has = (k) => keysOf.targets.includes(k);
    const sliderKeys = dimSliders(config);
    root.innerHTML = `<div class="sl">
      <div class="sl-stage">
        <svg class="sl-svg" viewBox="0 0 640 500" role="group" tabindex="0" aria-roledescription="3D model" aria-label="${esc(t(nameOf(m)))}: ${esc(t(T2('drag or use the arrow keys to turn it', 'घुमाने के लिए खींचो या तीर वाली कुंजियाँ दबाओ')))}">
          <defs><radialGradient id="sl-shadow"><stop offset="0" stop-color="#061233" stop-opacity=".34"/><stop offset="1" stop-color="#061233" stop-opacity="0"/></radialGradient>
          <linearGradient id="sl-stream" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7CC4FF"/><stop offset="1" stop-color="${WATER}"/></linearGradient></defs>
          <g class="sl-bg"></g><g class="sl-back"></g><g class="sl-main"></g><g class="sl-top"></g>
        </svg>
        <div class="sl-rot" data-key="rotate" role="group" aria-label="${esc(t(T2('Turn the shape', 'आकार घुमाओ')))}">
          <button type="button" class="sl-rb" data-act="left" aria-label="${esc(t(T2('Turn left', 'बाएँ घुमाओ')))}">${ICON.turnL}</button>
          <button type="button" class="sl-rb" data-act="up" aria-label="${esc(t(T2('Tilt to see the top', 'ऊपर से देखने के लिए झुकाओ')))}">${ICON.down}</button>
          <button type="button" class="sl-rb" data-act="spin" aria-pressed="${S.spin}">${ICON.spin}<span>${esc(t(T2('Spin', 'घुमाओ')))}</span></button>
          <button type="button" class="sl-rb" data-act="down" aria-label="${esc(t(T2('Tilt to see the bottom', 'नीचे से देखने के लिए झुकाओ')))}">${ICON.up}</button>
          <button type="button" class="sl-rb" data-act="right" aria-label="${esc(t(T2('Turn right', 'दाएँ घुमाओ')))}">${ICON.turnR}</button>
        </div>
      </div>
      <div class="sl-side">
        <div class="sl-head"><div class="sl-ico">${ICON.cube}</div><div><h3 class="sl-name"></h3><p class="sl-dims"></p></div></div>
        <div class="sl-acts"></div>
        ${sliderKeys.length || mode === 'cut' ? '<div class="sl-sliders"></div>' : ''}
        <div class="sl-out" aria-live="polite"></div>
        ${ask ? '<div class="sl-q" data-key="answer" role="group"></div>' : ''}
      </div>
    </div>`;
    const wrap = root.querySelector('.sl'), svg = root.querySelector('.sl-svg');
    const L1 = { bg: svg.querySelector('.sl-bg'), back: svg.querySelector('.sl-back'), main: svg.querySelector('.sl-main'), top: svg.querySelector('.sl-top') };
    const out = root.querySelector('.sl-out'), acts = root.querySelector('.sl-acts'), qbox = root.querySelector('.sl-q'), sliders = root.querySelector('.sl-sliders');

    // --- geometry (rebuilt when a slider changes)
    let R0 = 0;
    function rebuild() {
      const g = geometry(m, false);
      const c = [0, g.H / 2, 0];
      G = { faces: g.faces, H: g.H, c, R: boundR(g.faces, c), soup: soupOf(g.faces) };
      NET = hasNet(m) && (mode === 'net' || mode === 'surface') ? netOf(m) : null;
      if (mode === 'fill') {
        PLAN = fillPlan(m);
        if (PLAN.kind === 'cubes') { const cm = { solid: 'cuboid', d: { l: PLAN.l, b: PLAN.b, h: PLAN.h } }; FILLG = { cont: geometry(asModel(cm), false), contM: cm }; }
        else { const cg = geometry(asModel(PLAN.cont), !!PLAN.cont.flip); FILLG = { cont: cg, cap: volBelow(PLAN.cont, cg.H, cg.H) }; if (PLAN.scoop) FILLG.scoop = geometry(asModel(PLAN.scoop), true); }
      }
      if (mode === 'cut') SEC = section(G.faces, S.cutDir, S.cutPos);
      if (!R0) R0 = G.R;
      groups = null;
    }
    const camScale = () => Math.min(VB[0], VB[1]) * Math.min(0.4 / R0, 0.4 / G.R);
    function cam(o) {
      o = Object.assign({ yaw: S.yaw, pitch: S.pitch, c: G.c, s: camScale(), D: 9 * G.R, cx: VB[0] / 2, cy: VB[1] / 2 + 6 }, o || {});
      const cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
      o.rot = (v) => { const x1 = v[0] * cyw + v[2] * syw, z1 = -v[0] * syw + v[2] * cyw; return [x1, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp]; };
      o.unrot = (v) => { const y1 = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp; return [v[0] * cyw - z1 * syw, y1, v[0] * syw + z1 * cyw]; };
      o.p = (w) => { const q = o.rot(sub(w, o.c)), k = o.D / (o.D - q[2]); return [o.cx + o.s * q[0] * k, o.cy - o.s * q[1] * k, q[0], q[1], q[2]]; };
      return o;
    }
    function shade(col, n) {
      const lam = Math.max(0, dot(n, LIGHT)), k = Math.round((0.5 + 0.5 * lam) * 160) / 160, s = Math.round(Math.pow(Math.max(0, dot(n, HALF)), 16) * 0.34 * 80) / 80;
      return mixHex(mixHex(DARK, col, k), '#FFFFFF', s);
    }
    const pt = (q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1);
    // Render a polygon soup. Returns per-face groups (convex, culled) or one painter-sorted string.
    function render(soup, C, o) {
      o = o || {};
      const pr = soup.map((sp) => {
        const q = sp.pts.map(C.p), cam3 = q.map((v) => [v[2], v[3], v[4]]);
        const n = nrm(newell(cam3)), mc = cen(cam3);
        return { sp, q, n, vis: dot(n, [-mc[0], -mc[1], C.D - mc[2]]) > 0, z: mc[2] };
      });
      const vm = new Map(); pr.forEach((x) => vm.set(x.sp.fi + ':' + x.sp.pi, x.vis));
      const colOf = (sp) => sp.col || (o.col ? o.col(sp.fi) : '#3B82F6');
      if (o.painter) {
        pr.sort((a, b) => a.z - b.z);
        return pr.map((x) => { const n = x.vis ? x.n : mul(x.n, -1), f = shade(colOf(x.sp), n); let ed = ''; x.sp.fl.forEach((fl, k) => { if (fl === 'e' || fl === 'c') ed += 'M' + pt(x.q[k]) + 'L' + pt(x.q[(k + 1) % x.q.length]); }); return `<path d="M${x.q.map(pt).join('L')}Z" fill="${f}" stroke="${f}" stroke-width=".8" stroke-linejoin="round"/>${ed ? `<path class="sl-ed" d="${ed}"/>` : ''}`; }).join('');
      }
      const groups = new Map();
      let back = '';
      for (const x of pr) {
        const fi = x.sp.fi;
        if (!groups.has(fi)) groups.set(fi, { b: new Map(), ed: '', cut: '', z: 0, n: 0 });
        const g = groups.get(fi);
        if (x.vis) {
          const f = shade(colOf(x.sp), x.n);
          g.b.set(f, (g.b.get(f) || '') + 'M' + x.q.map(pt).join('L') + 'Z');
          g.z += x.z; g.n++;
        }
        x.sp.fl.forEach((fl, k) => {
          const seg = 'M' + pt(x.q[k]) + 'L' + pt(x.q[(k + 1) % x.q.length]);
          if (fl === 'e') { if (x.vis) g.ed += seg; else if (o.hidden) back += seg; }
          else if (fl === 'c') { if (x.vis) g.cut += seg; }
          else if (x.vis && vm.get(fi + ':' + fl) === false) g.ed += seg;
        });
      }
      const html = new Map();
      groups.forEach((g, fi) => {
        let s = '';
        [...g.b.keys()].sort().forEach((f) => { s += `<path d="${g.b.get(f)}" fill="${f}" stroke="${f}" stroke-width="1.1" stroke-linejoin="round"/>`; });
        if (g.ed) s += `<path class="sl-ed" d="${g.ed}"${o.edgeStyle ? ` style="${o.edgeStyle}"` : ''}/>`;
        if (g.cut) s += `<path class="sl-cutl" d="${g.cut}"/>`;
        html.set(fi, { html: s, z: g.n ? g.z / g.n : -1e9 });
      });
      return { html, back: back ? `<path class="sl-hid" d="${back}"/>` : '' };
    }
    const joinGroups = (r) => [...r.html.values()].sort((a, b) => a.z - b.z).map((g) => g.html).join('');

    // --- colours
    const marked = (fi) => S.marked.indexOf(fi);
    function faceCol(fi) {
      const f = G.faces[fi];
      const base = COLK[f && f.ck] || '#3B82F6';
      if (mode === 'count') return marked(fi) >= 0 ? base : '#CBD5E1';
      if (mode === 'surface' && S.sel >= 0 && S.sel !== fi) return mixHex(base, '#FFFFFF', 0.55);
      return base;
    }

    // --- persistent face groups (focusable faces for count and surface)
    let groups = null;
    const keyed = has('face:0');
    function ensureGroups() {
      if (groups && groups.length === G.faces.length) return;
      L1.main.innerHTML = '';
      groups = G.faces.map((f, i) => {
        const g = document.createElementNS(svgNS, 'g');
        if (keyed) { g.setAttribute('class', 'sl-face'); g.setAttribute('data-key', 'face:' + i); g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.dataset.fi = i; }
        L1.main.appendChild(g);
        return g;
      });
    }
    function faceAria(i) {
      const f = G.faces[i];
      if (mode === 'count') { const k = marked(i); return `${t(f.name)}: ${k >= 0 ? t(T2('counted, number ', 'गिना गया, संख्या ')) + (k + 1) : t(T2('not counted yet', 'अभी नहीं गिना'))}`; }
      return `${t(f.name)}: ${t(T2('tap to see its area', 'इसका क्षेत्रफल देखने के लिए टैप करो'))}`;
    }

    // --- drawing
    function shadow(C, R, H) {
      const b = C.p([0, 0, 0]), rx = R * C.s * 0.95, ry = Math.max(8, rx * Math.abs(Math.sin(C.pitch)) * 0.55 + 6);
      return `<ellipse cx="${b[0].toFixed(1)}" cy="${(b[1] + 4).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#sl-shadow)"/>`;
    }
    function pill(x, y, text, o) {
      const fs = VB[0] < 500 ? 23 : 19, w = Math.max(40, text.length * fs * 0.54 + 18), hh = Math.round(fs * 1.7);
      const fill = o && o.fill ? ` style="fill:${o.fill};stroke:none"` : '';
      return `<g class="sl-pill" transform="translate(${clamp(x, w / 2 + 4, VB[0] - w / 2 - 4).toFixed(1)} ${clamp(y, 18, VB[1] - 18).toFixed(1)})"><rect x="${(-w / 2).toFixed(1)}" y="${-hh / 2}" width="${w.toFixed(1)}" height="${hh}" rx="${hh / 2}"${fill}/><text text-anchor="middle" y="${(fs * 0.36).toFixed(1)}" style="font-size:${fs}px${o && o.ink ? ';fill:' + o.ink : ''}">${esc(text)}</text></g>`;
    }
    function dimLine(C, a, b, label, dash, side) {
      const A = C.p(a), B = C.p(b);
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], L0 = Math.hypot(dx, dy) || 1;
      let nx = -dy / L0, ny = dx / L0;
      if (side && nx * side[0] + ny * side[1] < 0) { nx = -nx; ny = -ny; }
      return `<path class="sl-dim${dash ? ' dash' : ''}" d="M${pt(A)}L${pt(B)}"/><circle cx="${A[0].toFixed(1)}" cy="${A[1].toFixed(1)}" r="4" fill="#0B1433"/><circle cx="${B[0].toFixed(1)}" cy="${B[1].toFixed(1)}" r="4" fill="#0B1433"/>` + pill(mx + nx * 26, my + ny * 26, label);
    }
    // Dimension marks placed on the side of the solid that faces the viewer.
    function annotations(C) {
      const d = m.d, u3 = (() => { const v = C.unrot([1, 0, 0.25]); const h = Math.hypot(v[0], v[2]) || 1; return [v[0] / h, 0, v[2] / h]; })();
      const cm = t(U.cm), lab = (k, v) => `${symOf(m, k)} = ${fmt(v)} ${cm}`;
      const out2 = [];
      const R = (r, y) => [u3[0] * r, y, u3[2] * r];
      const right = [1, 0];
      if (POLY.includes(m.solid) || m.combo === 'cubedome') {
        const base = m.solid === 'cuboid' ? rectBase(d.l, d.b) : m.solid === 'cube' || m.combo === 'cubedome' ? rectBase(d.l, d.l) : regBase(m.n, d.l);
        const hh = m.solid === 'cube' || m.combo === 'cubedome' ? d.l : d.h;
        let bi = 0, bz = -Infinity;
        base.forEach((b, i) => { const z = C.p([b[0], 0, b[1]])[4]; if (z > bz) { bz = z; bi = i; } });
        const n = base.length, P3 = (i, y) => [base[(i + n) % n][0], y, base[(i + n) % n][1]];
        const nb = C.p(P3(bi + 1, 0))[4] > C.p(P3(bi - 1, 0))[4] ? bi + 1 : bi - 1;
        const along = (i, j) => (Math.abs(base[(i + n) % n][0] - base[(j + n) % n][0]) > Math.abs(base[(i + n) % n][1] - base[(j + n) % n][1]) ? 'x' : 'z');
        if (m.solid === 'cuboid') {
          const other = nb === bi + 1 ? bi - 1 : bi + 1;
          [nb, other].forEach((j) => out2.push(dimLine(C, P3(bi, 0), P3(j, 0), along(bi, j) === 'x' ? lab('l', d.l) : lab('b', d.b), false, [0, 1])));
        } else out2.push(dimLine(C, P3(bi, 0), P3(nb, 0), lab('l', d.l), false, [0, 1]));
        if (m.solid === 'pyramid') out2.push(dimLine(C, [0, 0, 0], [0, d.h, 0], lab('h', d.h), true, right));
        else if (m.solid !== 'cube' && m.combo !== 'cubedome') out2.push(dimLine(C, P3(bi, 0), P3(bi, hh), lab('h', hh), false, right));
        if (m.combo === 'cubedome') out2.push(dimLine(C, [0, d.l, 0], R(d.r, d.l), lab('r', d.r), true, [0, -1]));
        return out2.join('');
      }
      const r = d.r, h = d.h;
      switch (m.solid) {
        case 'cylinder': out2.push(dimLine(C, [0, h, 0], R(r, h), lab('r', r), false, [0, -1]), dimLine(C, R(r, 0), R(r, h), lab('h', h), false, right)); break;
        case 'cone': out2.push(dimLine(C, [0, 0, 0], R(r, 0), lab('r', r), true, [0, 1]), dimLine(C, [0, 0, 0], [0, h, 0], lab('h', h), true, [-1, 0]), dimLine(C, R(r, 0), [0, h, 0], `l = ${fmt(Math.hypot(r, h))} ${cm}`, false, right)); break;
        case 'sphere': out2.push(dimLine(C, [0, r, 0], R(r, r), lab('r', r), false, [0, -1])); break;
        case 'hemisphere': out2.push(dimLine(C, [0, 0, 0], R(r, 0), lab('r', r), true, [0, 1])); break;
        case 'frustum': out2.push(dimLine(C, [0, 0, 0], R(r, 0), lab('r', r), true, [0, 1]), dimLine(C, [0, h, 0], R(d.r2, h), lab('r2', d.r2), false, [0, -1]), dimLine(C, R(r, 0), R(d.r2, h), `l = ${fmt(Math.hypot(h, r - d.r2))} ${cm}`, false, right)); break;
        default:
          if (m.combo === 'capsule') out2.push(dimLine(C, R(r, r), R(r, r + h), lab('h', h), false, right), dimLine(C, [0, r + h, 0], R(r, r + h), lab('r', r), true, [0, -1]));
          else if (m.combo === 'icecream') out2.push(dimLine(C, [0, h, 0], R(r, h), lab('r', r), true, [0, -1]), dimLine(C, [0, 0, 0], [0, h, 0], lab('h', h), true, [-1, 0]));
          else if (m.combo === 'tent') out2.push(dimLine(C, R(r, 0), R(r, h), lab('h', h), false, right), dimLine(C, R(r, h), [0, h + tentConeH(d), 0], lab('l', d.l), false, right), dimLine(C, [0, 0, 0], R(r, 0), lab('r', r), true, [0, 1]));
          else if (m.combo === 'dome') out2.push(dimLine(C, R(r, 0), R(r, h), lab('h', h), false, right), dimLine(C, [0, h, 0], R(r, h), lab('r', r), true, [0, -1]));
      }
      return out2.join('');
    }
    function drawSolid() {
      const C = cam();
      ensureGroups();
      const r = render(G.soup, C, { col: faceCol, hidden: mode === 'count' || mode === 'turn' });
      L1.bg.innerHTML = shadow(C, G.R * 0.8, G.H);
      L1.back.innerHTML = r.back;
      const act = document.activeElement;
      const order = G.faces.map((_, i) => i).sort((a, b) => ((r.html.get(a) || { z: -1e9 }).z) - ((r.html.get(b) || { z: -1e9 }).z));
      let changed = false;
      order.forEach((fi, k) => { if (L1.main.children[k] !== groups[fi]) changed = true; });
      if (changed) order.forEach((fi) => L1.main.appendChild(groups[fi]));
      if (changed && act && groups.includes(act)) act.focus({ preventScroll: true });
      groups.forEach((g, i) => {
        const h = r.html.get(i);
        g.innerHTML = h ? h.html : '';
        if (mode === 'count') g.setAttribute('opacity', '0.86');
        if (keyed) g.setAttribute('aria-label', faceAria(i));
      });
      let top = '';
      if (mode === 'count') {
        // vertex dots for polyhedra and number badges on counted faces
        if (counts(m) && counts(m).poly) {
          const seen = new Set();
          G.faces.forEach((f) => f.verts.forEach((v) => { const k = v.map((x) => Math.round(x * 1000)).join(','); if (seen.has(k)) return; seen.add(k); const q = C.p(v); const vis = q[4] > -G.R * 0.05 || isFront(C, v); top += `<circle class="sl-vdot" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${vis ? 5.5 : 3.5}" opacity="${vis ? 1 : 0.45}"/>`; }));
        }
        S.marked.forEach((fi, k) => { const c3 = faceCentroid(fi); const q = C.p(c3); const front = r.html.get(fi) && r.html.get(fi).z > -1e9; top += `<g class="sl-badge" opacity="${front ? 1 : 0.4}" transform="translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})"><circle r="19"/><text text-anchor="middle" y="8">${k + 1}</text></g>`; });
      }
      if ((mode === 'surface' || mode === 'volume') && !S.busy && S.sel < 0) top += annotations(C);
      if (mode === 'surface' && S.sel >= 0) { const f = G.faces[S.sel], q = C.p(faceCentroid(S.sel)); top += pill(q[0], q[1], `${fmt(f.info.val)} ${t(U.cm2)}`, { fill: '#8B3DFF', ink: '#FFFFFF' }); }
      L1.top.innerHTML = top;
    }
    function isFront(C, v) {
      // a vertex is in front if any face that holds it faces the viewer
      return G.faces.some((f) => f.polys.some((p) => p.some((i) => len(sub(f.verts[i], v)) < 1e-6) && (() => { const q = p.map((i) => C.rot(sub(f.verts[i], C.c))); const n = newell(q), mc = cen(q); return dot(n, [-mc[0], -mc[1], C.D - mc[2]]) > 0; })()));
    }
    function faceCentroid(fi) {
      const f = G.faces[fi];
      if (f.kind === 'flat') return cen(f.verts);
      // a point on the curved surface that faces the viewer most
      const C = cam(); let best = null, bz = -Infinity;
      f.polys.forEach((p) => { const c3 = cen(p.map((i) => f.verts[i])); const z = C.rot(sub(c3, C.c))[2]; if (z > bz) { bz = z; best = c3; } });
      return best;
    }
    function drawNet() {
      const fe = ease(S.fold);
      const [x0, x1, z0, z1] = NET.box, w = x1 - x0, hh = z1 - z0;
      const ns = Math.min((VB[0] * 0.9) / w, (VB[1] * 0.86) / hh), nc = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
      let yaw = ((S.yaw % (2 * PI)) + 3 * PI) % (2 * PI) - PI;
      const co = { yaw: yaw * fe, pitch: lerp(90 * DEG, S.pitch, fe), c: [lerp(nc[0], G.c[0], fe), lerp(nc[1], G.c[1], fe), lerp(nc[2], G.c[2], fe)], s: lerp(ns, camScale(), fe), D: lerp(10 * Math.max(w, hh), 9 * G.R, fe) };
      let C = cam(co);
      const soup = netSoup(NET, S.fold);
      // keep the moving net inside the frame: shrink and centre it (not at the very end, so the closed solid does not jump)
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      soup.forEach((sp) => sp.pts.forEach((p) => { const q = C.p(p); bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); }));
      const wt = Math.min(1, 4 * (1 - fe)), pad = 34;
      const fk = Math.min(1, (VB[0] - 2 * pad) / (bx1 - bx0 || 1), (VB[1] - 2 * pad) / (by1 - by0 || 1)), sk = lerp(1, fk, wt);
      const mx = C.cx + ((bx0 + bx1) / 2 - C.cx) * sk, my = C.cy + ((by0 + by1) / 2 - C.cy) * sk;
      C = cam(Object.assign(co, { s: co.s * sk, cx: C.cx + (VB[0] / 2 - mx) * wt, cy: C.cy + (VB[1] / 2 - my) * wt }));
      groups = null;
      L1.bg.innerHTML = S.fold > 0.5 ? shadow(C, G.R * 0.8, G.H) : '';
      L1.back.innerHTML = '';
      L1.main.innerHTML = render(soup, C, { painter: true, col: (fi) => COLK[G.faces[fi] && G.faces[fi].ck] || '#3B82F6' });
      let top = '';
      if (S.fold < 0.02) NET.faces.forEach((nf, i) => {
        const q = C.p([nf.lp[0], 0, nf.lp[1]]);
        const txt = mode === 'surface' ? `${fmt(G.faces[i].info.val)} ${t(U.cm2)}` : t(nf.label[0]);
        top += pill(q[0], q[1] - (mode === 'surface' ? 0 : 12), txt);
        if (mode !== 'surface') top += `<text x="${q[0].toFixed(1)}" y="${(q[1] + 26).toFixed(1)}" text-anchor="middle" style="font-weight:700;font-size:18px;fill:#0B1433">${esc(nf.label[1] + ' ' + t(U.cm))}</text>`;
      });
      L1.top.innerHTML = top;
    }
    function drawCut() {
      const C = cam(), n = SEC.n;
      const off = mul(n, S.gap * G.R * 0.8);
      const A = SEC.above.map((sp) => Object.assign({}, sp, { pts: sp.pts.map((p) => add(p, off)) }));
      const ra = render(A, C, { col: faceCol }), rb = render(SEC.below, C, { col: faceCol });
      const za = cen(A.flatMap((s) => s.pts)), zb = cen(SEC.below.flatMap((s) => s.pts));
      const first = C.rot(sub(za, C.c))[2] < C.rot(sub(zb, C.c))[2];
      groups = null;
      L1.bg.innerHTML = shadow(C, G.R * 0.8, G.H);
      L1.back.innerHTML = '';
      const ga = `<g opacity="${(1 - 0.9 * S.gap).toFixed(2)}">${joinGroups(ra)}</g>`;
      L1.main.innerHTML = first ? ga + joinGroups(rb) : joinGroups(rb) + ga;
      let top = '';
      if (S.blade > 0 && SEC.cap) {
        const { u, v } = planeBasis(n), c0 = cen(SEC.cap), s = G.R * 1.25;
        const Q = [add(add(c0, mul(u, s)), mul(v, s)), add(sub(c0, mul(u, s)), mul(v, s)), sub(sub(c0, mul(u, s)), mul(v, s)), sub(add(c0, mul(u, s)), mul(v, s))].map(C.p);
        top += `<path d="M${Q.map(pt).join('L')}Z" fill="#FFFFFF" fill-opacity="${(0.28 * S.blade).toFixed(2)}" stroke="#8B3DFF" stroke-width="3" stroke-opacity="${(0.9 * S.blade).toFixed(2)}" stroke-dasharray="10 8"/>`;
      }
      L1.top.innerHTML = top;
    }
    function waterOf(contFaces, y, col) {
      const soup = soupOf(contFaces);
      const r = clipSoup(soup, [0, 1, 0], y, true, col);
      return r.polys.map((p) => Object.assign(p, { col }));
    }
    function glass(cg, C, o) {
      const faces = cg.faces.filter((f) => !(o.open && f.role === 'top'));
      const soup = [];
      faces.forEach((f, fi) => f.polys.forEach((p, pi) => soup.push({ fi, pi, pts: p.map((i) => f.verts[i]), fl: f.fl[pi] })));
      const pr = soup.map((sp) => { const q = sp.pts.map(C.p), c3 = q.map((v) => [v[2], v[3], v[4]]), n = nrm(newell(c3)), mc = cen(c3); return { sp, q, vis: dot(n, [-mc[0], -mc[1], C.D - mc[2]]) > 0 }; });
      const vm = new Map(); pr.forEach((x) => vm.set(x.sp.fi + ':' + x.sp.pi, x.vis));
      let bk = '', fr = '', be = '', fe2 = '';
      pr.forEach((x) => {
        const d = 'M' + x.q.map(pt).join('L') + 'Z';
        if (x.vis) fr += d; else bk += d;
        x.sp.fl.forEach((fl, k) => {
          const seg = 'M' + pt(x.q[k]) + 'L' + pt(x.q[(k + 1) % x.q.length]);
          if (fl === 'e') { if (x.vis) fe2 += seg; else be += seg; }
          else if (typeof fl === 'number' && x.vis && vm.get(x.sp.fi + ':' + fl) === false) fe2 += seg;
          else if (typeof fl === 'number' && o.open && !x.vis && vm.get(x.sp.fi + ':' + fl) === true) fe2 += seg;
        });
      });
      const tint = o.tint || '#BFD9FF';
      return {
        back: `<path d="${bk}" fill="${tint}" fill-opacity=".45" stroke="none"/><path d="${be}" fill="none" stroke="#1E3A8A" stroke-opacity=".35" stroke-width="1.8"/>`,
        front: `<path d="${fr}" fill="#FFFFFF" fill-opacity=".16" stroke="none"/><path d="${fe2}" fill="none" stroke="#1E3A8A" stroke-opacity=".8" stroke-width="2.4" stroke-linejoin="round"/>`,
      };
    }
    function cubesSVG(C, l, b, y0, y1, col) {
      const g = geometry(asModel({ solid: 'cuboid', d: { l, b, h: y1 - y0 } }), false);
      const soup = soupOf(g.faces).map((s) => Object.assign(s, { pts: s.pts.map((p) => [p[0], p[1] + y0, p[2]]), col }));
      const r = render(soup, C, {});
      let lines = '';
      gridLines(l, b, y0, y1).forEach(([a, bb, nn]) => { const q = C.rot(nn); const mid = C.rot(sub(mul(add(a, bb), 0.5), C.c)); if (dot(q, [-mid[0], -mid[1], C.D - mid[2]]) > 0) lines += 'M' + pt(C.p(a)) + 'L' + pt(C.p(bb)); });
      return joinGroups(r) + (lines ? `<path d="${lines}" fill="none" stroke="#7A3E00" stroke-opacity=".55" stroke-width="1.6"/>` : '');
    }
    // fill mode (and the build-up in volume mode)
    function drawFill() {
      const building = mode === 'volume';
      groups = null;
      let main = '', top = '', bg = '';
      if (building) {
        const C = cam();
        const gl = glass({ faces: G.faces }, C, { tint: '#E9DDFF' });
        const cubes = (m.solid === 'cube' || m.solid === 'cuboid') && integerBox();
        const y = S.build * G.H;
        let water = '';
        if (cubes) { const [l, b, h] = boxDims(); const k = Math.floor(S.build * h + 1e-6), fr = S.build * h - k; water = (k > 0 ? cubesSVG(C, l, b, 0, k, '#FFB547') : '') + (fr > 0.02 && k < h ? cubesSVG(C, l, b, k + (1 - ease(Math.min(1, fr * 1.25))) * 3, k + 1 + (1 - ease(Math.min(1, fr * 1.25))) * 3, '#FFB547') : ''); }
        else if (y > 1e-6) water = joinGroups(render(waterOf(G.faces, y, COLK.V), C, {}));
        bg = shadow(C, G.R * 0.8, G.H);
        main = gl.back + water + gl.front;
      } else if (PLAN.kind === 'cubes') {
        const { l, b, h } = PLAN, gm = { faces: FILLG.cont.faces };
        const C = cam({ c: [0, h / 2, 0] });
        const gl = glass(gm, C, { open: true });
        const k = S.pours, fr = S.pourT >= 0 ? ease(S.pourT) : 1;
        let water = k > 0 ? cubesSVG(C, l, b, 0, k, '#FFB547') : '';
        if (S.pourT >= 0 && k < h) { const dy = (1 - fr) * (h + 2); water += cubesSVG(C, l, b, k + dy, k + 1 + dy, '#FFB547'); }
        bg = shadow(C, G.R * 0.8, h);
        main = gl.back + water + gl.front;
      } else {
        const cg = FILLG.cont, H = cg.H, cR = boundR(cg.faces, [0, H / 2, 0]);
        const sg = FILLG.scoop, sR = sg ? boundR(sg.faces, [0, sg.H / 2, 0]) : 0;
        const s = Math.min((VB[1] * (sg ? 0.38 : 0.31)) / cR, (VB[0] * 0.8) / (2.3 * (cR + sR) + 1e-9));
        const total = 2 * sR * s + (sg ? 40 : 0) + 2 * cR * s, x0 = (VB[0] - total) / 2;
        const cy = Math.max(H, sg ? sg.H : 0) / 2;
        const Cc = cam({ c: [0, cy, 0], s, D: 6 * Math.max(cR, sR), cx: sg ? x0 + 2 * sR * s + 40 + cR * s : VB[0] / 2, cy: VB[1] / 2 + (sg ? 16 : 40) });
        const lvlV = S.frac * FILLG.cap;
        const y = lvlV > 0 ? levelFor(PLAN.cont, H, lvlV) : 0;
        const open = PLAN.cont.solid === 'cylinder' || PLAN.cont.solid === 'prism' || PLAN.cont.solid === 'hemisphere' || PLAN.cont.solid === 'frustum';
        const gl = glass(cg, Cc, { open });
        const water = y > H * 0.003 ? joinGroups(render(waterOf(cg.faces, Math.min(y, H * 0.9999), WATER), Cc, {})) : '';
        bg = shadow(Cc, cR * 0.8, H);
        main = gl.back + water + gl.front;
        const surf = Cc.p([0, Math.max(y, 0), 0]);
        if (sg) {
          const Cs = cam({ c: [0, cy, 0], s, D: 6 * Math.max(cR, sR), cx: x0 + sR * s, cy: VB[1] / 2 + 16 });
          bg += shadow(Cs, sR * 0.6, sg.H);
          const pT = S.pourT;
          const ph = pT < 0 ? 0 : pT < 0.3 ? ease(pT / 0.3) : pT < 0.78 ? 1 : 1 - ease((pT - 0.78) / 0.22);
          const pivot = Cs.p([0, sg.H, 0]), rimTop = Cc.p([0, H, 0]);
          const tx = (rimTop[0] - pivot[0] - 30) * ph, ty = (rimTop[1] - pivot[1] - 70) * ph, rot = 118 * ph;
          const sw = pT < 0 ? 1 : pT < 0.3 ? 1 : pT < 0.78 ? 1 - (pT - 0.3) / 0.48 : (pT - 0.78) / 0.22;
          const sgl = glass(sg, Cs, { open: true, tint: '#FFE2C2' });
          const swater = sw > 0.02 ? `<g opacity="${sw.toFixed(2)}">${joinGroups(render(waterOf(sg.faces, sg.H * 0.985, WATER), Cs, {}))}</g>` : '';
          main = `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${rot.toFixed(1)} ${pivot[0].toFixed(1)} ${pivot[1].toFixed(1)})">${sgl.back}${swater}${sgl.front}</g>` + main;
          if (pT >= 0.3 && pT < 0.8) {
            const lip = [pivot[0] + tx + 18, pivot[1] + ty + 6];
            const k = (pT - 0.3) / 0.5;
            top += `<path d="M${lip[0].toFixed(1)} ${lip[1].toFixed(1)}C${(lip[0] + 26).toFixed(1)} ${(lip[1] + 10).toFixed(1)} ${surf[0].toFixed(1)} ${((lip[1] + surf[1]) / 2).toFixed(1)} ${surf[0].toFixed(1)} ${surf[1].toFixed(1)}" fill="none" stroke="#4FA8F5" stroke-width="${(9 * Math.sin(PI * Math.min(1, k * 1.1)) + 2).toFixed(1)}" stroke-linecap="round" opacity=".9"/>`;
          }
        } else {
          const rimTop = Cc.p([0, H, 0]);
          const tapX = rimTop[0], tapY = Math.max(36, rimTop[1] - 70);
          top += `<g><rect x="${(tapX - 70).toFixed(1)}" y="${(tapY - 30).toFixed(1)}" width="70" height="16" rx="6" fill="#94A3B8"/><rect x="${(tapX - 14).toFixed(1)}" y="${(tapY - 30).toFixed(1)}" width="20" height="30" rx="6" fill="#64748B"/><rect x="${(tapX - 40).toFixed(1)}" y="${(tapY - 44).toFixed(1)}" width="26" height="12" rx="5" fill="${S.tap ? '#22C55E' : '#FF6B57'}"/></g>`;
          if (S.tap) top += `<path d="M${(tapX - 4).toFixed(1)} ${tapY.toFixed(1)}L${(tapX - 4).toFixed(1)} ${surf[1].toFixed(1)}" stroke="#4FA8F5" stroke-width="9" stroke-linecap="round" opacity=".92"/><path d="M${(tapX - 6).toFixed(1)} ${tapY.toFixed(1)}L${(tapX - 6).toFixed(1)} ${surf[1].toFixed(1)}" stroke="#D6ECFF" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
        }
      }
      L1.bg.innerHTML = bg;
      L1.back.innerHTML = '';
      L1.main.innerHTML = main;
      L1.top.innerHTML = top;
    }
    function draw() {
      if (!G) return;
      if (mode === 'fill' || (mode === 'volume' && S.build < 1)) drawFill();
      else if (mode === 'cut') drawCut();
      else if (NET && S.fold < 0.999) drawNet();
      else drawSolid();
    }
    const queue = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    // --- panel
    const boxDims = () => (m.solid === 'cube' ? [m.d.l, m.d.l, m.d.l] : [m.d.l, m.d.b, m.d.h]);
    const integerBox = () => boxDims().every((x) => Number.isInteger(x) && x <= 12);
    function dimsLine() {
      const cm = t(U.cm);
      return dimKeys(m.solid, m.combo).map((k) => `${symOf(m, k)} = ${fmt(m.d[k])} ${cm}`).join(' · ') + (m.solid === 'cone' ? ` · l = ${fmt(Math.hypot(m.d.r, m.d.h))} ${cm}` : '') + (m.piS && (mode === 'surface' || mode === 'volume' || mode === 'fill') && !POLY.includes(m.solid) ? ` · π = ${m.piS}` : '');
    }
    function fBlock(F, unit, hideVal) {
      return `<div class="sl-f${hideVal ? ' hide' : ''}"><b>${esc(t(F.label))}</b><span>= ${esc(F.sym)}</span><span>= ${esc(F.sub)}</span><span class="val">= ${hideVal ? '?' : esc(fmt(F.val) + ' ' + t(unit))}</span></div>`;
    }
    function panel() {
      root.querySelector('.sl-name').textContent = t(nameOf(m));
      root.querySelector('.sl-dims').textContent = dimsLine();
      const M = measures(m), reveal = !ask || S.qa.done || S.qa.tries >= 2;
      let h = '';
      const ct = counts(m);
      if (mode === 'turn') {
        h += `<div class="sl-chips">${ct ? (ct.poly ? [['faces', ct.F], ['edges', ct.E], ['vertices', ct.V]] : [['flat', ct.flat], ['curved', ct.curved], ['edges', ct.E], ['vertices', ct.V]]).map(([w, v]) => `<span class="sl-chip"><b>${v}</b> ${esc(t(wn(w, v)))}</span>`).join('') : `<span class="sl-chip">${esc(t(T2('Made of ', 'इनसे बना: ')))}<b>${esc(t(PARTS[m.combo]))}</b></span>`}</div>`;
        h += `<p class="sl-note">${esc(t(T2('Shaped like this: ', 'ऐसे आकार की चीज़ें: ')))}${esc(examplesOf(m).map(t).join(', '))}</p>`;
        const img = api.asset ? api.asset('solids-' + m.key) : null;
        if (img) h += `<img class="sl-photo" src="${esc(img)}" alt="${esc(t(examplesOf(m)[0]))}">`;
        h += `<p class="sl-note">${esc(t(T2('Drag the shape or use the buttons to turn it. The views show it from the front, the side and the top.', 'आकार को खींचो या बटन से घुमाओ। दृश्य बटन इसे सामने, बगल और ऊपर से दिखाते हैं।')))}</p>`;
      } else if (mode === 'net') {
        h += S.unfolded ? `<p class="sl-big">${esc(t(T2('The net: ', 'जाल: ')))}${esc(t(shapesText(netShapes(m))))}</p>` + netNote(M) : `<p>${esc(t(T2('Tap Unfold to open the shape out flat into its net.', 'जाल देखने के लिए "खोलो" दबाओ: आकार खुलकर समतल हो जाएगा।')))}</p>`;
      } else if (mode === 'count') {
        const nF = G.faces.length, k = S.marked.length;
        h += `<p class="sl-big">${esc(t(ct.poly ? T2('Faces counted: ', 'गिने गए फलक: ') : T2('Surfaces counted: ', 'गिने गए पृष्ठ: ')))}${k}</p>`;
        if (k < nF) h += `<p class="sl-note">${esc(t(T2('Tap each face once. Turn the shape to find the faces at the back.', 'हर फलक पर एक बार टैप करो। पीछे के फलक ढूँढने के लिए आकार घुमाओ।')))}</p>`;
        else {
          if (ct.poly) h += `<div class="sl-chips"><span class="sl-chip"><b>${ct.F}</b> ${esc(t(wn('faces', ct.F)))}</span>${reveal ? `<span class="sl-chip"><b>${ct.E}</b> ${esc(t(wn('edges', ct.E)))}</span><span class="sl-chip"><b>${ct.V}</b> ${esc(t(wn('vertices', ct.V)))}</span>` : ''}</div>` + (reveal ? `<p>${esc(t(T2("Euler's formula: F + V − E = ", 'ऑयलर का सूत्र: F + V − E = ')))}${ct.F} + ${ct.V} − ${ct.E} = <b>${ct.F + ct.V - ct.E}</b></p>` : '');
          else h += `<div class="sl-chips"><span class="sl-chip"><b>${ct.flat}</b> ${esc(t(wn('flat', ct.flat)))}</span><span class="sl-chip"><b>${ct.curved}</b> ${esc(t(wn('curved', ct.curved)))}</span>${reveal ? `<span class="sl-chip"><b>${ct.E}</b> ${esc(t(wn('edges', ct.E)))}</span><span class="sl-chip"><b>${ct.V}</b> ${esc(t(wn('vertices', ct.V)))}</span>` : ''}</div>`;
        }
      } else if (mode === 'surface') {
        if (M.slant) h += `<p>${esc(t(M.slant.label))}: ${esc(M.slant.sym)} = ${esc(M.slant.sub)} = <b>${fmt(M.slant.val)} ${esc(t(U.cm))}</b></p>`;
        if (M.base) h += `<p>${esc(t(M.base.label))} = ${esc(M.base.sub)} = <b>${fmt(M.base.val)} ${esc(t(U.cm2))}</b></p>`;
        if (M.parts) h += `<div class="sl-chips">${M.parts.map(([w, v]) => `<span class="sl-chip">${esc(t(w))}${reveal ? ` = <b>${fmt(v)}</b>` : ''}</span>`).join('')}</div>`;
        if (M.csa) h += fBlock(M.csa, U.cm2, false);
        h += fBlock(M.tsa, U.cm2, !reveal);
        if (S.sel >= 0) { const f = G.faces[S.sel]; h += `<p>${esc(t(T2('This face: ', 'यह फलक: ')))}${esc(t(f.info.shape))}, ${esc(f.info.sym)} = ${esc(f.info.sub)} = <b>${fmt(f.info.val)} ${esc(t(U.cm2))}</b></p>`; }
        else h += `<p class="sl-note">${esc(t(NET ? T2('Tap a face to see its area, or unfold the shape to see every face flat.', 'किसी फलक का क्षेत्रफल देखने के लिए उस पर टैप करो, या सारे फलक समतल देखने के लिए आकार खोलो।') : T2('Tap a part to see its area.', 'किसी भाग का क्षेत्रफल देखने के लिए उस पर टैप करो।')))}</p>`;
        if (m.solid === 'sphere') h += `<p class="sl-note">${esc(t(T2('A sphere cannot be opened flat. Its surface equals exactly 4 circles of the same radius: 4 × πr².', 'गोले को खोलकर समतल नहीं किया जा सकता। उसका पृष्ठ उसी त्रिज्या के ठीक 4 वृत्तों के बराबर होता है: 4 × πr²।')))}</p>`;
      } else if (mode === 'volume') {
        if (M.base) h += `<p>${esc(t(M.base.label))} = ${esc(M.base.sub)} = <b>${fmt(M.base.val)} ${esc(t(U.cm2))}</b></p>`;
        if (M.slant && m.combo === 'tent') h += `<p>${esc(t(M.slant.label))}: ${esc(M.slant.sym)} = ${esc(M.slant.sub)} = <b>${fmt(M.slant.val)} ${esc(t(U.cm))}</b></p>`;
        h += fBlock(M.vol, U.cm3, !reveal);
        if (reveal) h += `<p class="sl-note">= ${fmt(M.vol.val / 1000)} ${esc(t(T2('litres (1000 cm³ = 1 litre)', 'लीटर (1000 सेमी³ = 1 लीटर)')))}</p>`;
        if ((m.solid === 'cube' || m.solid === 'cuboid') && integerBox()) { const [l, b, hh] = boxDims(); h += `<p class="sl-note">${esc(t(T2(`Each layer has ${l} × ${b} = ${l * b} cubes of 1 cm³; there are ${hh} layers.`, `हर परत में ${l} × ${b} = ${l * b} घन (1 सेमी³ के) हैं; कुल ${hh} परतें हैं।`)))}</p>`; }
        else h += `<p class="sl-note">${esc(t(volNote()))}</p>`;
      } else if (mode === 'fill') {
        h += fillText(M);
      } else if (mode === 'cut') {
        h += cutText();
      }
      out.innerHTML = h;
      if (qbox) drawQ();
    }
    function netNote(M) {
      const d = m.d, cm = t(U.cm);
      if (m.solid === 'cylinder') return `<p class="sl-note">${esc(t(T2(`The rectangle's length is the circle's circumference: 2πr = ${fmt(2 * m.P * d.r)} ${cm}. Its width is the height h = ${fmt(d.h)} ${cm}.`, `आयत की लंबाई वृत्त की परिधि के बराबर है: 2πr = ${fmt(2 * m.P * d.r)} ${cm}। उसकी चौड़ाई ऊँचाई h = ${fmt(d.h)} ${cm} है।`)))}</p>`;
      if (m.solid === 'cone') return `<p class="sl-note">${esc(t(T2(`The sector's radius is the slant height l = ${fmt(Math.hypot(d.r, d.h))} ${cm}; its curved edge is as long as the base circle: 2πr = ${fmt(2 * m.P * d.r)} ${cm}.`, `त्रिज्यखंड की त्रिज्या तिर्यक ऊँचाई l = ${fmt(Math.hypot(d.r, d.h))} ${cm} है; उसका वक्र किनारा आधार वृत्त जितना लंबा है: 2πr = ${fmt(2 * m.P * d.r)} ${cm}।`)))}</p>`;
      if (m.solid === 'frustum') return `<p class="sl-note">${esc(t(T2('The curved part opens into a part of a ring: a big sector with a small sector cut away.', 'वक्र भाग खुलकर वलय का एक भाग बनता है: एक बड़े त्रिज्यखंड में से छोटा त्रिज्यखंड कटा हुआ।')))}</p>`;
      const ct = counts(m);
      return `<p class="sl-note">${esc(t(T2(`Each face of the solid is one piece of the net: ${ct.F} faces, ${ct.F} pieces. Folding along the edges closes it up again.`, `ठोस का हर फलक जाल का एक टुकड़ा है: ${ct.F} फलक, ${ct.F} टुकड़े। किनारों पर मोड़ने से यह फिर बंद हो जाता है।`)))}</p>`;
    }
    function volNote() {
      switch (m.combo || m.solid) {
        case 'cylinder': return T2('A cylinder is a stack of equal circles: base area πr² × height.', 'बेलन बराबर वृत्तों का ढेर है: आधार का क्षेत्रफल πr² × ऊँचाई।');
        case 'prism': return T2('A prism is a stack of equal bases: base area × height.', 'प्रिज़्म बराबर आधारों का ढेर है: आधार का क्षेत्रफल × ऊँचाई।');
        case 'cone': return T2('A cone holds exactly ⅓ of the cylinder with the same base and height.', 'शंकु में ठीक उतने ही आधार और ऊँचाई वाले बेलन का ⅓ आता है।');
        case 'pyramid': return T2('A pyramid holds exactly ⅓ of the prism with the same base and height.', 'पिरामिड में ठीक उतने ही आधार और ऊँचाई वाले प्रिज़्म का ⅓ आता है।');
        case 'sphere': return T2('A sphere holds ⅔ of the cylinder that just fits around it.', 'गोले में उसे ठीक घेरने वाले बेलन का ⅔ आता है।');
        case 'hemisphere': return T2('A hemisphere is half a sphere: ½ × ⁴⁄₃πr³ = ⅔πr³.', 'अर्धगोला आधा गोला है: ½ × ⁴⁄₃πr³ = ⅔πr³।');
        case 'frustum': return T2('A frustum is a big cone with a small cone cut off the top.', 'छिन्नक एक बड़ा शंकु है जिसके ऊपर से छोटा शंकु काट दिया गया है।');
        default: return T2('The volume of the solid is the sum of the volumes of its parts.', 'ठोस का आयतन उसके भागों के आयतनों का योग है।');
      }
    }
    function fillText(M) {
      const P2 = PLAN;
      if (P2.kind === 'cubes') {
        const per = P2.l * P2.b;
        return `<p class="sl-big">${esc(t(T2('Layers: ', 'परतें: ')))}${S.pours} / ${P2.h} · ${esc(t(T2('cubes: ', 'घन: ')))}${S.pours * per}</p><p class="sl-note">${esc(t(S.pours >= P2.h ? T2(`Full! ${P2.l} × ${P2.b} × ${P2.h} = ${per * P2.h} cubes of 1 cm³, so the volume is ${per * P2.h} cm³.`, `भर गया! ${P2.l} × ${P2.b} × ${P2.h} = ${per * P2.h} घन (1 सेमी³ के), इसलिए आयतन ${per * P2.h} सेमी³ है।`) : T2(`Each layer has ${P2.l} × ${P2.b} = ${per} cubes of 1 cm³.`, `हर परत में ${P2.l} × ${P2.b} = ${per} घन (1 सेमी³ के) हैं।`)))}</p>`;
      }
      if (P2.kind === 'scoop') {
        const fullTxt = {
          cylinder: T2(`3 cones fill the cylinder: the cone's volume is ⅓ of the cylinder's (⅓πr²h).`, '3 शंकु बेलन को भर देते हैं: शंकु का आयतन बेलन का ⅓ है (⅓πr²h)।'),
          sphere: T2('4 cones (radius r, height r) fill the sphere: 4 × ⅓πr³ = ⁴⁄₃πr³.', '4 शंकु (त्रिज्या r, ऊँचाई r) गोले को भर देते हैं: 4 × ⅓πr³ = ⁴⁄₃πr³।'),
          hemisphere: T2('2 cones (radius r, height r) fill the bowl: 2 × ⅓πr³ = ⅔πr³.', '2 शंकु (त्रिज्या r, ऊँचाई r) कटोरे को भर देते हैं: 2 × ⅓πr³ = ⅔πr³।'),
          prism: T2(`3 pyramids fill the prism with the same base and height: a pyramid's volume is ⅓ × base × height.`, '3 पिरामिड उतने ही आधार और ऊँचाई वाले प्रिज़्म को भर देते हैं: पिरामिड का आयतन ⅓ × आधार × ऊँचाई है।'),
        }[P2.cont.solid];
        const contName = { cylinder: T2('cylinder', 'बेलन'), sphere: T2('sphere', 'गोला'), hemisphere: T2('bowl (hemisphere)', 'कटोरा (अर्धगोला)'), prism: T2('prism', 'प्रिज़्म') }[P2.cont.solid];
        return `<p class="sl-big">${esc(t(T2('Poured: ', 'डाले गए: ')))}${S.pours} ${esc(t(S.pours === 1 ? P2.sn : T2(P2.sn.en + 's', P2.sn.hi)))}</p><p class="sl-note">${esc(t(S.pours >= P2.N ? fullTxt : T2(`Fill the ${contName.en} with water from the ${P2.sn.en}. Tap the button to pour one.`, `${P2.sn.hi} से पानी डालकर ${contName.hi} भरो। एक बार डालने के लिए बटन दबाओ।`)))}</p>`;
      }
      const V = S.frac * FILLG.cap, cap = M.vol.val;
      return `<p class="sl-big">${esc(t(T2('Water: ', 'पानी: ')))}${fmt((S.frac * cap))} ${esc(t(U.cm3))}</p><p class="sl-note">${esc(t(S.frac >= 1 ? T2(`Full! It holds ${fmt(cap)} cm³ = ${fmt(cap / 1000)} litres. Watch: the water rises at a different speed where the shape is wider or narrower.`, `भर गया! इसमें ${fmt(cap)} सेमी³ = ${fmt(cap / 1000)} लीटर पानी आता है। देखो: जहाँ आकार चौड़ा या पतला है, वहाँ पानी अलग गति से चढ़ता है।`) : T2('Turn on the tap to fill it with water.', 'पानी भरने के लिए नल खोलो।')))}</p>` + (V < 0 ? '' : '');
    }
    function cutText() {
      const dirW = { horizontal: T2('across, parallel to the base', 'आधार के समांतर, आड़ा'), vertical: T2('straight down', 'सीधा ऊपर से नीचे'), slant: T2('at a slant', 'तिरछा'), corner: T2('across a corner', 'एक कोने पर से') }[S.cutDir];
      let s = `<p class="sl-note">${esc(t(T2('Cut: ', 'काट: ')))}${esc(t(dirW))}</p>`;
      if (S.gap > 0.5 && SEC.flat) {
        const xs = SEC.flat.map((p) => p[0]), ys = SEC.flat.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs) || 1, hh = Math.max(...ys) - Math.min(...ys) || 1, k = Math.min(100 / w, 70 / hh);
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        const d = 'M' + SEC.flat.map((p) => `${(60 + (p[0] - cx) * k).toFixed(1)} ${(45 - (p[1] - cy) * k).toFixed(1)}`).join('L') + 'Z';
        s += `<div class="sl-sec"><svg viewBox="0 0 120 90" role="img" aria-label="${esc(t(SHN[SEC.shape]))}"><path d="${d}" fill="#FFD23F" stroke="#B45309" stroke-width="2.5" stroke-linejoin="round"/></svg><div><p class="sl-note">${esc(t(T2('The cut face is a', 'कटा हुआ फलक है:')))}</p><p class="sl-big">${esc(t(ask && !S.qa.done && S.qa.tries < 2 ? T2('? (answer below)', '? (नीचे उत्तर दो)') : SHN[SEC.shape]))}</p></div></div>`;
      } else s += `<p>${esc(t(T2('The purple frame shows where the knife will cut. Move it with the slider, then tap Cut.', 'बैंगनी फ़्रेम दिखाता है कि चाकू कहाँ काटेगा। स्लाइडर से उसे खिसकाओ, फिर "काटो" दबाओ।')))}</p>`;
      return s;
    }
    // --- question card
    let Q = null;
    function buildQ() {
      const M = measures(m), ct = counts(m), seed = hash(JSON.stringify([mode, m.key, m.d, m.n, S.cutDir, Math.round(S.cutPos * 20)]));
      const unit2 = U.cm2, unit3 = U.cm3;
      switch (mode) {
        case 'turn': {
          const others = shuffle(SOLIDS.filter((s) => s !== m.solid && s !== 'combination'), seed).slice(0, 3);
          const opts = [{ v: examplesOf(m)[0], ok: true }].concat(others.map((s) => ({ v: INFO[s].ex[0], ok: false, why: T2(`That is shaped like a ${INFO[s].n.en.toLowerCase()}.`, `उसका आकार ${INFO[s].n.hi} जैसा है।`) })));
          return { q: T2('Which of these has the same shape?', 'इनमें से किसका आकार ऐसा ही है?'), opts: shuffle(opts, seed + 1) };
        }
        case 'net': {
          const right = shapesText(netShapes(m));
          const pool = [{ square: 6 }, { circle: 2, rectangle: 1 }, { circle: 1, sector: 1 }, { n3: 2, rectangle: 3 }, { square: 1, triangle: 4 }, { rectangle: 6 }, { circle: 1, rectangle: 1 }, { circle: 2, ring: 1 }, { square: 2, rectangle: 4 }, { triangle: 4 }].map(shapesText).filter((x) => x.en !== right.en);
          const opts = [{ v: right, ok: true }].concat(shuffle(pool, seed).slice(0, 3).map((v) => ({ v, ok: false, why: T2('Unfold the shape and count its pieces.', 'आकार को खोलो और उसके टुकड़े गिनो।') })));
          return { q: T2('Which shapes make the net of this solid?', 'इस ठोस का जाल किन आकारों से बनता है?'), opts: shuffle(opts, seed + 1) };
        }
        case 'count': {
          const why = ct.poly ? T2('An edge is a line where two faces meet. Turn the shape and count each edge once.', 'किनारा वह रेखा है जहाँ दो फलक मिलते हैं। आकार घुमाकर हर किनारा एक बार गिनो।') : T2('An edge is where two surfaces meet. A circle where a flat face meets the curved surface is an edge.', 'किनारा वह है जहाँ दो पृष्ठ मिलते हैं। जहाँ समतल फलक वक्र पृष्ठ से मिलता है वह वृत्त एक किनारा है।');
          const W = ct.poly ? [{ v: ct.F, why: T2('That is the number of faces, not edges.', 'यह फलकों की संख्या है, किनारों की नहीं।') }, { v: ct.V, why: T2('That is the number of vertices (corners).', 'यह शीर्षों (कोनों) की संख्या है।') }, { v: ct.E - 2, why }, { v: ct.E + 2, why }, { v: ct.E * 2, why: T2('Each edge is shared by two faces: count it once.', 'हर किनारा दो फलकों में साझा है: उसे एक बार गिनो।') }] : [0, 1, 2, 3].filter((x) => x !== ct.E).map((v) => ({ v, why }));
          const qq = numQ(T2('How many edges does it have?', 'इसके कितने किनारे हैं?'), ct.E, W.filter((w) => w.v >= 0).map((w) => ({ v: w.v === 0 ? 1e-9 : w.v, why: w.why })), null, seed);
          qq.opts.forEach((o) => { if (o.v < 1e-6) o.v = 0; });
          if (!ct.poly && ct.E > 0 && !qq.opts.some((o) => o.v === 0)) qq.opts.push({ v: 0, ok: false, why });
          return qq;
        }
        case 'surface': return numQ(m.solid === 'sphere' ? T2('What is its surface area?', 'इसका पृष्ठीय क्षेत्रफल कितना है?') : m.combo ? T2('What is the surface area of the whole solid?', 'पूरे ठोस का पृष्ठीय क्षेत्रफल कितना है?') : T2('What is its total surface area?', 'इसका संपूर्ण पृष्ठीय क्षेत्रफल कितना है?'), M.tsa.val, M.wt, unit2, seed, [{ v: M.tsa.val * 2, why: T2('Check the formula again: that is double.', 'सूत्र फिर से देखो: यह दोगुना है।') }]);
        case 'volume': return numQ(T2('What is its volume?', 'इसका आयतन कितना है?'), M.vol.val, M.wv, unit3, seed, [{ v: M.vol.val * 2, why: T2('Check the formula again: that is double.', 'सूत्र फिर से देखो: यह दोगुना है।') }]);
        case 'fill': {
          if (PLAN.kind === 'cubes') { const { l, b, h } = PLAN; return numQ(T2('How many 1 cm cubes fill the box?', 'डिब्बे में 1 सेमी के कितने घन आएँगे?'), l * b * h, [{ v: l * b, why: T2('That is only one layer. Count the layers too.', 'यह केवल एक परत है। परतें भी गिनो।') }, { v: l + b + h, why: T2('Multiply length, breadth and height; do not add.', 'लंबाई, चौड़ाई और ऊँचाई का गुणा करो; जोड़ो मत।') }, { v: 2 * (l * b + b * h + h * l), why: T2('That counts the squares on the outside, not the cubes inside.', 'यह बाहर के वर्ग गिनता है, अंदर के घन नहीं।') }], null, seed); }
          if (PLAN.kind === 'scoop') { const N = PLAN.N, why = T2('Pour and count, or compare the two volume formulas.', 'पानी डालकर गिनो, या दोनों आयतन के सूत्रों की तुलना करो।'); return numQ(T2(`How many full ${PLAN.sn.en}s of water will fill it?`, `कितने भरे ${PLAN.sn.hi} का पानी इसे भर देगा?`), N, [N - 1, N + 1, N + 2, 2 * N].map((v) => ({ v, why })), null, seed); }
          return numQ(T2('How much water can it hold?', 'इसमें कितना पानी आएगा?'), M.vol.val, M.wv, unit3, seed);
        }
        case 'cut': {
          const right = SEC.shape, fam = FAMILY[right] || [];
          const pool = ['circle', 'square', 'rectangle', 'triangle', 'ellipse', 'rhex', 'semicircle', 'trapezium'].filter((k) => k !== right && !fam.includes(k) && !(FAMILY[k] || []).includes(right));
          const opts = [{ v: SHN[right], ok: true }].concat(shuffle(pool, seed).slice(0, 3).map((k) => ({ v: SHN[k], ok: false, why: T2('Look at the yellow cut face from straight in front.', 'पीले कटे फलक को ठीक सामने से देखो।') })));
          return { q: T2('What shape is the cut face?', 'कटा हुआ फलक किस आकार का है?'), opts: shuffle(opts, seed + 1) };
        }
      }
      return null;
    }
    const optLabel = (o, unit) => (typeof o.v === 'number' ? `${fmt(o.v)}${unit ? ' ' + t(unit) : ''}` : t(o.v));
    function drawQ() {
      if (!Q) Q = buildQ();
      if (!Q) { qbox.innerHTML = ''; return; }
      qbox.innerHTML = `<p>${esc(t(Q.q))}</p><div class="sl-opts">${Q.opts.map((o, i) => `<button type="button" class="sl-opt${S.qa.done && o.ok ? ' right' : ''}${S.qa.picked === i && !o.ok ? ' wrong' : ''}" data-opt="${i}"${S.qa.done ? ' disabled' : ''}>${esc(optLabel(o, Q.unit))}</button>`).join('')}</div><p class="sl-why" aria-live="polite">${S.qa.done ? esc(t(T2('Right!', 'सही!'))) : S.qa.why ? esc(t(S.qa.why)) : ''}</p>`;
    }
    function resetQ() { Q = null; S.qa = { done: false, tries: 0, picked: -1, why: null }; }

    // --- controls
    function actions() {
      let h = '';
      const B = (key, icon, label, cls, extra) => `<button type="button" class="sl-btn ${cls || ''}" data-key="${key}" ${extra || ''}>${icon}<span>${esc(t(label))}</span></button>`;
      if (mode === 'turn') h += ['front', 'side', 'top'].map((v) => B('view:' + v, ICON.eye, { front: T2('Front view', 'सामने से'), side: T2('Side view', 'बगल से'), top: T2('Top view', 'ऊपर से') }[v], 'plain')).join('');
      if (has('unfold')) h += B('unfold', S.unfolded ? ICON.fold : ICON.unfold, S.unfolded ? T2('Fold it back', 'वापस मोड़ो') : T2('Unfold', 'खोलो'), '', `aria-pressed="${S.unfolded}"`);
      if (mode === 'count') h += B('reset', ICON.reset, T2('Count again', 'फिर से गिनो'), 'plain');
      if (mode === 'volume') h += B('fill', ICON.pour, (m.solid === 'cube' || m.solid === 'cuboid') && integerBox() ? T2('Build it with 1 cm cubes', '1 सेमी के घनों से बनाओ') : T2('Fill it up from the base', 'आधार से ऊपर तक भरो'), 'grape');
      if (mode === 'fill') {
        const lbl = PLAN.kind === 'cubes' ? T2('Add a layer of cubes', 'घनों की एक परत डालो') : PLAN.kind === 'scoop' ? T2(`Pour one ${PLAN.sn.en}`, `एक ${PLAN.sn.hi} डालो`) : T2('Turn on the tap', 'नल खोलो');
        const full = PLAN.kind === 'tap' ? S.frac >= 1 : S.pours >= PLAN.N;
        h += B('fill', ICON.pour, lbl, 'grape', full ? 'disabled' : '') + B('reset', ICON.reset, T2('Empty it', 'ख़ाली करो'), 'plain');
      }
      if (mode === 'cut') {
        h += cutDirs(m).map((dd) => B('cut:' + dd, ICON.knife, { horizontal: T2('Cut across', 'आड़ा काटो'), vertical: T2('Cut down', 'खड़ा काटो'), slant: T2('Cut at a slant', 'तिरछा काटो'), corner: T2('Cut off a corner', 'कोना काटो') }[dd], S.cutDir === dd ? '' : 'plain', `aria-pressed="${S.cutDir === dd}"`)).join('');
        if (S.gap > 0.5) h += B('reset', ICON.reset, T2('Join it again', 'फिर से जोड़ो'), 'plain');
      }
      acts.innerHTML = h;
      acts.hidden = !h;
    }
    function sliderRow() {
      if (!sliders) return;
      let h = '';
      sliderKeys.forEach((k) => { const r = sliderRange(m0, k); h += `<label class="sl-sl" data-key="slider:${k}"><span>${esc(symOf(m, k))}: ${esc(t(dimName(m, k)))}</span><output>${fmt(m.d[k])} ${esc(t(U.cm))}</output><input type="range" min="${r[0]}" max="${r[1]}" step="${r[2]}" value="${m.d[k]}" data-dim="${k}"></label>`; });
      if (mode === 'cut') h += `<label class="sl-sl" data-key="slider:cut"><span>${esc(t(T2('Where to cut', 'कहाँ काटना है')))}</span><output>${Math.round(S.cutPos * 100)}%</output><input type="range" min="4" max="96" step="1" value="${Math.round(S.cutPos * 100)}" data-dim="cut"></label>`;
      sliders.innerHTML = h;
    }
    function full() { actions(); panel(); draw(); }

    // --- view tweens
    const run = (ms, step, done) => { const s = tween(ms, step, () => { stops = stops.filter((x) => x !== s); if (done) done(); }); stops.push(s); return s; };
    function turnTo(yaw, pitch, ms, done) {
      const y0 = S.yaw, p0 = S.pitch;
      let dy = yaw - y0; dy = ((dy % (2 * PI)) + 3 * PI) % (2 * PI) - PI;
      run(ms, (k) => { const e = ease(k); S.yaw = y0 + dy * e; S.pitch = lerp(p0, pitch, e); draw(); }, done);
    }
    function setSpin(on) {
      S.spin = on && !reduced();
      const b = root.querySelector('[data-act="spin"]'); if (b) b.setAttribute('aria-pressed', String(S.spin));
      cancelAnimationFrame(spinRaf);
      if (!S.spin) return;
      let last = performance.now();
      const f = (now) => { if (!S.spin) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!S.busy) { S.yaw += dt * 0.6; draw(); } spinRaf = requestAnimationFrame(f); };
      spinRaf = requestAnimationFrame(f);
    }
    function rotated(amount) { dragRot += Math.abs(amount); if (dragRot >= 15 * DEG) { dragRot = 0; api.emit('rotated'); } }

    // --- actions
    function doUnfold() {
      if (S.busy) return;
      S.busy = true; setSpin(false);
      const to = S.unfolded ? 1 : 0, from = S.fold;
      if (to === 1) S.sel = -1;
      run(2600, (k) => { S.fold = lerp(from, to, k); draw(); }, () => {
        S.busy = false; S.fold = to; S.unfolded = to === 0;
        api.emit(S.unfolded ? 'unfolded' : 'folded');
        api.record(t(S.unfolded ? T2('Unfolded the shape into its net', 'आकार को खोलकर जाल बनाया') : T2('Folded the net back into the shape', 'जाल को मोड़कर फिर आकार बनाया')));
        full();
      });
    }
    function markFace(fi) {
      if (mode === 'count') {
        if (S.marked.includes(fi)) { api.toast(T2('You have counted this one already.', 'इसे तुम पहले ही गिन चुके हो।')); return; }
        S.marked.push(fi);
        api.emit('face:' + fi);
        api.record(t(T2('Counted ', 'गिना: ')) + t(G.faces[fi].name));
        if (S.marked.length === G.faces.length && !S.countedSent) { S.countedSent = true; api.emit('counted'); api.speak(t(T2(`${G.faces.length} in all.`, `कुल ${G.faces.length}।`))); }
        panel(); draw();
      } else if (mode === 'surface') {
        S.sel = S.sel === fi ? -1 : fi;
        if (S.sel >= 0) { api.emit('face:' + fi); api.record(t(T2('Looked at the area of the ', 'क्षेत्रफल देखा: ')) + t(G.faces[fi].name)); }
        panel(); draw();
      }
    }
    function doFill() {
      if (S.busy) return;
      if (mode === 'volume') {
        S.busy = true; setSpin(false);
        const cubes = (m.solid === 'cube' || m.solid === 'cuboid') && integerBox();
        const ms = cubes ? Math.min(6000, boxDims()[2] * 650) : 3200;
        S.build = 0;
        run(ms, (k) => { S.build = cubes ? k : ease(k); draw(); }, () => { S.build = 1; S.busy = false; api.emit('filled'); api.record(t(T2('Filled the shape from the base up', 'आकार को आधार से ऊपर तक भरा'))); full(); });
        return;
      }
      if (PLAN.kind === 'tap') {
        if (S.frac >= 1) return;
        S.busy = true; S.tap = 1;
        const f0 = S.frac;
        run(4200 * (1 - f0), (k) => { S.frac = lerp(f0, 1, k); draw(); if (Math.round(k * 20) % 4 === 0) panel(); }, () => { S.frac = 1; S.tap = 0; S.busy = false; api.emit('poured'); api.emit('filled'); api.record(t(T2('Filled it with water from the tap', 'नल के पानी से भरा'))); api.celebrate && api.celebrate(); full(); });
        return;
      }
      const N = PLAN.N;
      if (S.pours >= N) return;
      S.busy = true; setSpin(false);
      const f0 = S.pours / N, f1 = (S.pours + 1) / N;
      run(PLAN.kind === 'cubes' ? 700 : 2600, (k) => { S.pourT = k; if (PLAN.kind === 'scoop') S.frac = k < 0.3 ? f0 : k < 0.78 ? lerp(f0, f1, ease((k - 0.3) / 0.48)) : f1; draw(); }, () => {
        S.pourT = -1; S.pours++; S.frac = S.pours / N; S.busy = false;
        api.emit('poured');
        api.record(t(PLAN.kind === 'cubes' ? T2('Added a layer of cubes', 'घनों की एक परत डाली') : T2(`Poured one ${PLAN.sn.en}`, `एक ${PLAN.sn.hi} डाला`)));
        if (S.pours >= N) { api.emit('filled'); api.celebrate && api.celebrate(); }
        full();
      });
    }
    function doCut(dir) {
      if (S.busy) return;
      S.cutDir = dir;
      SEC = section(G.faces, dir, S.cutPos);
      resetQ();
      S.busy = true; setSpin(false);
      S.gap = 0; S.blade = 1;
      actions(); panel();
      const n = CUTN[dir], hz = Math.hypot(n[0], n[2]);
      turnTo(hz > 0.1 ? Math.atan2(-n[0], n[2]) + 28 * DEG : S.yaw, clamp(Math.atan2(n[1], hz), 14 * DEG, 50 * DEG), 1400);
      run(1400, (k) => { S.blade = 1 - Math.max(0, (k - 0.25) / 0.75); S.gap = ease(Math.max(0, (k - 0.15) / 0.85)); draw(); }, () => {
        S.busy = false; S.gap = 1; S.blade = 0;
        api.emit('cut:' + dir);
        api.record(t(T2('Cut the shape: the cut face is a ', 'आकार काटा: कटा फलक है ')) + t(SHN[SEC.shape]));
        full();
      });
    }
    function answer(i) {
      if (!Q || S.qa.done) return;
      const o = Q.opts[i];
      S.qa.picked = i;
      if (o.ok) { S.qa.done = true; S.qa.why = null; api.emit('answered:right'); api.celebrate && api.celebrate(); api.record(t(T2('Answered right: ', 'सही उत्तर: ')) + optLabel(o, Q.unit)); }
      else { S.qa.tries++; S.qa.why = o.why || T2('Not quite. Look again.', 'पूरी तरह सही नहीं। फिर से देखो।'); api.emit('answered:wrong'); api.record(t(T2('Answered: ', 'उत्तर दिया: ')) + optLabel(o, Q.unit)); }
      panel();
      const b = qbox.querySelector(`[data-opt="${i}"]`); if (b && !S.qa.done) b.focus();
    }
    function setDim(k, v, done) {
      if (k === 'cut') { S.cutPos = v / 100; SEC = section(G.faces, S.cutDir, S.cutPos); S.gap = 0; S.blade = 1; resetQ(); if (done) { api.emit('set:cut'); } actions(); panel(); draw(); const o = sliders.querySelector('[data-dim="cut"]'); if (o) o.parentNode.querySelector('output').textContent = Math.round(v) + '%'; return; }
      const d = Object.assign({}, m.d, { [k]: v });
      const st = sliderRange(m0, k)[2];
      if (m.solid === 'frustum') { if (k === 'r' && d.r2 >= d.r) d.r2 = Math.max(st, d.r - st); if (k === 'r2' && d.r2 >= d.r) d.r2 = d.r - st; }
      if (m.combo === 'tent') { if (k === 'r' && d.l <= d.r) d.l = d.r + st; if (k === 'l' && d.l <= d.r) d.l = d.r + st; }
      if (m.combo === 'cubedome') { if (k === 'l' && 2 * d.r > d.l) d.r = Math.floor(d.l / 2 / st) * st; if (k === 'r' && 2 * d.r > d.l) d.r = Math.floor(d.l / 2 / st) * st; }
      Object.keys(d).forEach((kk) => { d[kk] = Math.round(d[kk] * 100) / 100; });
      m = Object.assign({}, m, { d });
      rebuild(); resetQ();
      sliders.querySelectorAll('input[data-dim]').forEach((inp) => { const kk = inp.dataset.dim; if (kk !== 'cut') { inp.value = m.d[kk]; inp.parentNode.querySelector('output').textContent = `${fmt(m.d[kk])} ${t(U.cm)}`; } });
      if (S.sel >= G.faces.length) S.sel = -1;
      if (done) { api.emit('set:' + k); api.record(t(T2('Changed ', 'बदला: ')) + `${symOf(m, k)} = ${fmt(m.d[k])} ${t(U.cm)}`); }
      actions(); panel(); draw();
    }

    // --- events
    function onClick(e) {
      if (justDragged) { justDragged = false; return; }
      const opt = e.target.closest('[data-opt]');
      if (opt) { if (!api.allowed('answer')) { api.nudge('answer'); return; } answer(+opt.dataset.opt); return; }
      const rb = e.target.closest('[data-act]');
      if (rb) {
        if (!api.allowed('rotate')) { api.nudge('rotate'); return; }
        const a = rb.dataset.act;
        if (a === 'spin') { setSpin(!S.spin); if (S.spin) api.emit('rotated'); if (reduced()) { turnTo(S.yaw + PI / 2, S.pitch, 0); api.emit('rotated'); } return; }
        setSpin(false);
        const step = 45 * DEG;
        if (a === 'left') turnTo(S.yaw - step, S.pitch, 450);
        if (a === 'right') turnTo(S.yaw + step, S.pitch, 450);
        if (a === 'up') turnTo(S.yaw, clamp(S.pitch + 25 * DEG, -80 * DEG, 88 * DEG), 400);
        if (a === 'down') turnTo(S.yaw, clamp(S.pitch - 25 * DEG, -80 * DEG, 88 * DEG), 400);
        api.emit('rotated');
        return;
      }
      const el = e.target.closest('[data-key]');
      if (!el || el.disabled) return;
      const key = el.dataset.key;
      if (key.startsWith('slider:') || key === 'answer' || key === 'rotate') return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('face:')) { if (S.busy) return; markFace(+key.slice(5)); }
      else if (key === 'unfold') doUnfold();
      else if (key === 'fill') doFill();
      else if (key.startsWith('cut:')) doCut(key.slice(4));
      else if (key.startsWith('view:')) {
        if (S.busy) return;
        const v = key.slice(5); setSpin(false);
        const to = { front: [0, 0], side: [-PI / 2, 0], top: [0, 89 * DEG] }[v];
        S.busy = true;
        turnTo(to[0], to[1], 700, () => { S.busy = false; api.emit('viewed:' + v); api.record(t(T2('Looked at the ', 'देखा: ')) + t({ front: T2('front view', 'सामने का दृश्य'), side: T2('side view', 'बगल का दृश्य'), top: T2('top view', 'ऊपर का दृश्य') }[v])); });
      } else if (key === 'reset') {
        if (S.busy) return;
        if (mode === 'count') { S.marked = []; S.countedSent = false; }
        if (mode === 'fill') { S.pours = 0; S.frac = 0; }
        if (mode === 'cut') { S.gap = 0; S.blade = 1; }
        api.emit('reset');
        full();
      }
    }
    function onKey(e) {
      const g = e.target.closest && e.target.closest('g[data-key]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
      if (e.target === svg && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (!api.allowed('rotate')) { api.nudge('rotate'); return; }
        setSpin(false);
        if (e.key === 'ArrowLeft') S.yaw -= 15 * DEG; if (e.key === 'ArrowRight') S.yaw += 15 * DEG;
        if (e.key === 'ArrowUp') S.pitch = clamp(S.pitch + 10 * DEG, -80 * DEG, 88 * DEG); if (e.key === 'ArrowDown') S.pitch = clamp(S.pitch - 10 * DEG, -80 * DEG, 88 * DEG);
        rotated(15 * DEG); draw();
      }
    }
    function onFocus(e) {
      const g = e.target.closest && e.target.closest('g.sl-face');
      if (!g || S.busy || (NET && S.fold < 1)) return;
      // turn the focused face toward the viewer so a keyboard user can see what they count
      const fi = +g.dataset.fi, f = G.faces[fi];
      const C = cam(), c3 = faceCentroid(fi), q = C.rot(sub(c3, C.c));
      if (q[2] > 0 && f.polys.length) return;
      const n = nrm(sub(c3, G.c));
      setSpin(false);
      turnTo(Math.atan2(-n[0], n[2]) + 20 * DEG, clamp(Math.atan2(n[1], Math.hypot(n[0], n[2])), -70 * DEG, 80 * DEG) * 0.85 + 8 * DEG, 500);
    }
    function onInput(e) {
      const inp = e.target.closest('input[data-dim]');
      if (!inp) return;
      const k = inp.dataset.dim, key = 'slider:' + k;
      if (!api.allowed(key)) { api.nudge(key); inp.value = k === 'cut' ? Math.round(S.cutPos * 100) : m.d[k]; return; }
      if (S.busy) { inp.value = k === 'cut' ? Math.round(S.cutPos * 100) : m.d[k]; return; }
      setDim(k, +inp.value, e.type === 'change');
    }
    let drag = null, justDragged = false;
    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      if (S.busy && !(mode === 'fill')) return;
      drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch, moved: false, id: e.pointerId };
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      if (!drag.moved) {
        if (!api.allowed('rotate')) { api.nudge('rotate'); drag = null; return; }
        drag.moved = true; setSpin(false);
        try { svg.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
      }
      const w = svg.getBoundingClientRect().width || 400;
      const ny = drag.yaw + (dx / w) * 3.2, np = clamp(drag.pitch + (dy / w) * 2.6, -80 * DEG, 88 * DEG);
      rotated(Math.abs(ny - S.yaw) + Math.abs(np - S.pitch));
      S.yaw = ny; S.pitch = np;
      queue();
    }
    function onUp(e) { if (drag && drag.moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 60); } drag = null; }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);

    // --- start
    rebuild();
    sliderRow();
    full();
    setSpin(S.spin);
    const fit = () => {
      const w = root.clientWidth || 800, wide = w >= 760, nv = wide ? [640, 500] : w < 520 ? [460, 400] : [600, 440];
      wrap.classList.toggle('sl-tiny', w < 430);
      if (wide !== S.wide) { S.wide = wide; wrap.classList.toggle('sl-wide', wide); }
      if (nv[0] !== VB[0] || nv[1] !== VB[1]) { VB = nv; svg.setAttribute('viewBox', `0 0 ${VB[0]} ${VB[1]}`); draw(); }
    };
    fit();
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(fit); ro.observe(root); }
    return {
      destroy() {
        S.spin = false; cancelAnimationFrame(spinRaf); cancelAnimationFrame(raf); stops.forEach((s) => s());
        if (ro) ro.disconnect();
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.removeEventListener('focusin', onFocus);
        root.removeEventListener('input', onInput); root.removeEventListener('change', onInput);
      },
    };
  }

  // ---------------------------------------------------------------- config rules (pure)
  const cutDirs = (m) => (POLY.includes(m.solid) ? CUTS : CUTS.filter((c) => c !== 'corner'));
  function dimSliders(c) {
    if (!['surface', 'volume'].includes(c.mode)) return [];
    return dimKeys(c.solid, c.combo);
  }
  function sliderRange(m, k) {
    const v = m.d[k], vals = Object.values(m.d);
    const step = vals.every((x) => Number.isInteger(x)) ? 1 : vals.every((x) => Number.isInteger(x * 2)) ? 0.5 : 0.1;
    const max = Math.min(100, Math.max(20, Math.ceil((2 * v) / step) * step));
    return [step, max, step];
  }
  function keysFor(c) {
    const T = ['rotate'], E = ['rotated'];
    let m = null;
    try { m = norm(c); } catch (x) { return { targets: T, events: E }; }
    const nf = (() => { try { return geometry(m, false).faces.length; } catch (x) { return 0; } })();
    const faces = Array.from({ length: nf }, (_, i) => 'face:' + i);
    switch (c.mode) {
      case 'turn': T.push('view:front', 'view:side', 'view:top'); E.push('viewed:front', 'viewed:side', 'viewed:top'); break;
      case 'net': T.push('unfold'); E.push('unfolded', 'folded'); break;
      case 'count': T.push(...faces, 'reset'); E.push(...faces, 'counted', 'reset'); break;
      case 'surface': T.push(...faces); E.push(...faces); if (hasNet(m)) { T.push('unfold'); E.push('unfolded', 'folded'); } break;
      case 'volume': T.push('fill'); E.push('filled'); break;
      case 'fill': T.push('fill', 'reset'); E.push('poured', 'filled', 'reset'); break;
      case 'cut': { const ds = cutDirs(m); T.push(...ds.map((d) => 'cut:' + d), 'slider:cut', 'reset'); E.push(...ds.map((d) => 'cut:' + d), 'set:cut', 'reset'); break; }
    }
    dimSliders(c).forEach((k) => { T.push('slider:' + k); E.push('set:' + k); });
    if (c.ask !== false) { T.push('answer'); E.push('answered:right', 'answered:wrong'); }
    return { targets: T, events: E };
  }
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['solid', 'dims', 'mode', 'pi', 'sides', 'combo', 'cut', 'ask'].includes(k)) e.push('unknown key: ' + k); });
    if (!SOLIDS.includes(c.solid)) return e.concat(['solid: one of ' + SOLIDS.join(', ')]);
    if (!MODES.includes(c.mode)) e.push('mode: one of ' + MODES.join(', '));
    if (c.pi != null && !['22/7', '3.14'].includes(String(c.pi))) e.push("pi: '22/7' or '3.14'");
    if (c.ask != null && typeof c.ask !== 'boolean') e.push('ask: true or false');
    if (c.sides != null) {
      if (c.solid !== 'prism' && c.solid !== 'pyramid') e.push('sides: only for a prism or a pyramid');
      else if (!Number.isInteger(c.sides) || c.sides < 3 || c.sides > 8) e.push('sides: a whole number from 3 to 8');
    }
    if (c.combo != null && c.solid !== 'combination') e.push('combo: only when solid is combination');
    if (c.solid === 'combination' && c.combo != null && !COMBOS.includes(c.combo)) return e.concat(['combo: one of ' + COMBOS.join(', ')]);
    if (c.cut != null) {
      if (c.mode !== 'cut') e.push('cut: only in cut mode');
      else if (!CUTS.includes(c.cut)) e.push('cut: one of ' + CUTS.join(', '));
      else if (c.cut === 'corner' && !POLY.includes(c.solid)) e.push('cut: corner cuts are only for cube, cuboid, prism and pyramid');
    }
    const keys = dimKeys(c.solid, c.combo).concat(c.solid === 'cone' ? ['l'] : []);
    if (c.dims != null) {
      if (typeof c.dims !== 'object' || Array.isArray(c.dims)) e.push('dims: an object of lengths in cm');
      else Object.keys(c.dims).forEach((k) => {
        const v = c.dims[k];
        if (!keys.includes(k)) e.push(`dims.${k}: not used by a ${c.solid}${c.combo ? ' (' + c.combo + ')' : ''} (use ${keys.join(', ')})`);
        else if (typeof v !== 'number' || !isFinite(v) || v < 0.1 || v > 100) e.push(`dims.${k}: a length from 0.1 to 100 cm`);
        else if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) e.push(`dims.${k}: at most 2 decimal places`);
      });
    }
    if (e.length) return e;
    const m = norm(c), d = m.d, g = c.dims || {};
    if (c.solid === 'cone') {
      if (g.l != null && g.l <= d.r) e.push('dims.l: the slant height must be longer than the radius');
      if (g.l != null && g.h != null && Math.abs(g.l * g.l - g.r ** 2 - g.h * g.h) > 0.02 * g.l * g.l) e.push('dims: l, r and h must fit l² = r² + h² (or give only two of them)');
      if (g.l != null && g.r == null) e.push('dims.r: give the radius with the slant height');
    }
    if (c.solid === 'frustum' && !(d.r2 < d.r)) e.push('dims.r2: the top radius must be smaller than the bottom radius r');
    if (m.combo === 'tent' && !(d.l > d.r)) e.push('dims.l: the slant height of the cone must be longer than the radius');
    if (m.combo === 'cubedome' && 2 * d.r > d.l) e.push('dims.r: the dome must fit on the cube (2r ≤ side l)');
    if (c.mode === 'net' && !hasNet(m)) e.push(c.solid === 'combination' ? 'net mode: a combined solid has no single net; use its parts' : `net mode: a ${c.solid} has no net (its curved surface cannot be flattened without stretching or tearing)`);
    if (c.mode === 'count' && c.solid === 'combination') e.push('count mode: not for a combined solid');
    if (c.mode === 'cut' && m.combo === 'cubedome') e.push('cut mode: not for a cube with a dome');
    if (c.mode === 'fill' && (c.solid === 'cube' || c.solid === 'cuboid')) {
      const bx = c.solid === 'cube' ? [d.l, d.l, d.l] : [d.l, d.b, d.h];
      if (!bx.every((x) => Number.isInteger(x) && x <= 10)) e.push('fill mode: a cube or cuboid is filled with 1 cm cubes, so its sides must be whole numbers up to 10 cm');
    }
    return e;
  }

  NCA_T.register({
    id: 'solids',
    css: CSS,
    validate,
    keys: keysFor,
    demo: { solid: 'cylinder', dims: { r: 7, h: 10 }, mode: 'surface', pi: '22/7' },
    // pure parts for tests under Node
    model: { norm, measures, counts, geometry, netOf, netSoup, section, classify, fillPlan, crossArea, volBelow, heightOf },
    mount(root, config, api) { return solids(root, config, api); },
  });
})();
