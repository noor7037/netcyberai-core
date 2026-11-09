// Template: Plant lab. Grow plants and change light, water, soil, air and temperature; parts of a plant, the leaf
// and photosynthesis, transpiration, germination, tropisms, the flower and its fertilisation, seed dispersal, leaf
// types and root types. The biology is computed, not scripted: growth, photosynthesis, transpiration and germination
// follow the limiting-factor rules taught in school (no light = no food, too little or too much water = wilting,
// seeds need water, air and warmth but not light, and so on). A lab can only choose among the plants and modes listed
// here. Config:
//   { mode: 'grow'|'parts'|'photosynthesis'|'transpiration'|'germination'|'tropism'|'flower'|'seed-dispersal'|'leaf-types'|'root-types',
//     plant?: 'bean'|'gram'|'maize'|'mustard'|'hibiscus'|'tulsi'|'mango'|'balsam',
//     variables?: ['light','water','soil','air','temperature'] (the sliders shown; each mode allows only the ones that matter),
//     pots?: 1-4 (grow and germination only) }
(function () {
  'use strict';
  const L = window.NCA_LIB;
  const { esc, lerp, clamp, ease, mixHex } = L;
  const reduced = L.reducedMotion;
  const T2 = (en, hi) => ({ en, hi });
  const r1 = (v) => Math.round(v * 10) / 10;
  const fx = (v) => (Math.round(v * 10) / 10).toString();
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const sat = (x, K) => (x / (x + K)) / (100 / (100 + K)); // 0..100 -> 0..1, saturating

  // ---------------------------------------------------------------- the plants (all numbers are school-level)
  const PLANTS = {
    bean: {
      n: T2('Bean', 'बीन (सेम)'), cls: 'dicot', H: 35, k: 0.1, Topt: 27, Tw: 19, gr: 1, col: '#3FA34D', seedCol: '#9B3B3B', seedSize: 1.15, seedShape: 'kidney',
      leaf: 'ovate', form: 'trifoliate', ven: 'reticulate', margin: 'entire', phyllo: 'alternate', root: 'tap', nod: true, germ: 'epigeal', cot: 2,
      fruit: 'pod', flowerCol: '#E4D4FB', petals: 5, stamens: 10, sdisp: 'pod',
      flowerFact: T2('Pea-like flower with 5 petals. It has 10 stamens and one pistil.', 'मटर जैसा फूल, 5 पंखुड़ियाँ। इसमें 10 पुंकेसर और 1 स्त्रीकेसर होता है।'),
      fruitName: T2('pod', 'फली'),
    },
    gram: {
      n: T2('Gram (chana)', 'चना'), cls: 'dicot', H: 18, k: 0.1, Topt: 22, Tw: 18, gr: 0.9, col: '#6BAF54', seedCol: '#C9A66B', seedSize: 0.95, seedShape: 'beak',
      leaf: 'oblong', form: 'pinnate', ven: 'reticulate', margin: 'serrate', phyllo: 'alternate', root: 'tap', nod: true, germ: 'hypogeal', cot: 2,
      fruit: 'pod2', flowerCol: '#D9A8EE', petals: 5, stamens: 10, sdisp: 'pod',
      flowerFact: T2('Pea-like flower with 5 petals. It has 10 stamens and one pistil.', 'मटर जैसा फूल, 5 पंखुड़ियाँ। इसमें 10 पुंकेसर और 1 स्त्रीकेसर होता है।'),
      fruitName: T2('pod', 'फली'),
    },
    maize: {
      n: T2('Maize', 'मक्का'), cls: 'monocot', H: 60, k: 0.13, Topt: 30, Tw: 20, gr: 1.1, col: '#4CAF50', seedCol: '#F2C230', seedSize: 0.95, seedShape: 'grain',
      leaf: 'linear', form: null, ven: 'parallel', margin: 'wavy', phyllo: 'alternate', root: 'fibrous', nod: false, germ: 'hypogeal', cot: 1,
      fruit: 'cob', flowerCol: '#E8C95A', petals: 0, stamens: 3, sdisp: 'burr',
      flowerFact: T2('Maize has separate male flowers (the tassel) and female flowers (the cob).', 'मक्के में नर फूल (झंडा) और मादा फूल (भुट्टा) अलग-अलग होते हैं।'),
      fruitName: T2('cob', 'भुट्टा'),
    },
    mustard: {
      n: T2('Mustard', 'सरसों'), cls: 'dicot', H: 28, k: 0.11, Topt: 20, Tw: 17, gr: 1.4, col: '#58B04A', seedCol: '#5A3A28', seedSize: 0.5, seedShape: 'round',
      leaf: 'lobed', form: null, ven: 'reticulate', margin: 'lobed', phyllo: 'alternate', root: 'tap', nod: false, germ: 'epigeal', cot: 2,
      fruit: 'siliqua', flowerCol: '#FFD23F', petals: 4, stamens: 6, sdisp: 'pod',
      flowerFact: T2('Yellow flower with 4 petals in a cross. It has 6 stamens (4 long, 2 short) and one pistil.', 'पीला फूल, 4 पंखुड़ियाँ क्रॉस की तरह। 6 पुंकेसर (4 लंबे, 2 छोटे) और 1 स्त्रीकेसर।'),
      fruitName: T2('pod (siliqua)', 'फली (सिलिक्वा)'),
    },
    hibiscus: {
      n: T2('Hibiscus (gudhal)', 'गुड़हल'), cls: 'dicot', H: 16, k: 0.08, Topt: 28, Tw: 18, gr: 0.7, col: '#2F9A4A', seedCol: '#7B5E3B', seedSize: 0.7, seedShape: 'round',
      leaf: 'ovate', form: null, ven: 'reticulate', margin: 'serrate', phyllo: 'alternate', root: 'tap', nod: false, germ: 'epigeal', cot: 2,
      fruit: 'capsule', flowerCol: '#E11D48', petals: 5, stamens: 99, sdisp: 'pod',
      flowerFact: T2('Big flower with 5 petals. Its many stamens are joined into one tube around the style.', 'बड़ा फूल, 5 पंखुड़ियाँ। इसके बहुत से पुंकेसर जुड़कर वर्तिका के चारों ओर एक नली बनाते हैं।'),
      fruitName: T2('capsule', 'संपुटी (कैप्सूल)'),
    },
    tulsi: {
      n: T2('Tulsi (holy basil)', 'तुलसी'), cls: 'dicot', H: 20, k: 0.09, Topt: 28, Tw: 18, gr: 1.1, col: '#3B9E55', seedCol: '#2D2A26', seedSize: 0.45, seedShape: 'round',
      leaf: 'ovate', form: null, ven: 'reticulate', margin: 'crenate', phyllo: 'opposite', root: 'tap', nod: false, germ: 'epigeal', cot: 2,
      fruit: 'nutlets', flowerCol: '#C4B1F7', petals: 5, stamens: 4, sdisp: 'pod',
      flowerFact: T2('Small flowers on a spike. The 5 petals join into two lips. It has 4 stamens.', 'मंजरी पर छोटे फूल। 5 पंखुड़ियाँ जुड़कर दो होंठ बनाती हैं। 4 पुंकेसर होते हैं।'),
      fruitName: T2('four small nutlets', 'चार छोटे मेवे (नटलेट)'),
    },
    mango: {
      n: T2('Mango', 'आम'), cls: 'dicot', H: 14, k: 0.07, Topt: 30, Tw: 19, gr: 0.5, col: '#2E7D3A', seedCol: '#D9C9A3', seedSize: 1.7, seedShape: 'flat',
      leaf: 'lanceolate', form: null, ven: 'reticulate', margin: 'wavy', phyllo: 'alternate', root: 'tap', nod: false, germ: 'hypogeal', cot: 2,
      fruit: 'drupe', flowerCol: '#F6D79C', petals: 5, stamens: 5, sdisp: 'mango',
      flowerFact: T2('Tiny flowers in big bunches, each with 5 petals. It has 5 stamens but often only 1 or 2 make pollen.', 'बड़े गुच्छों में नन्हे फूल, हर फूल में 5 पंखुड़ियाँ। 5 पुंकेसर होते हैं, पर अक्सर केवल 1-2 ही पराग बनाते हैं।'),
      fruitName: T2('mango (a drupe)', 'आम (गुठलीदार फल)'),
    },
    balsam: {
      n: T2('Balsam (gulmehndi)', 'गुलमेहंदी'), cls: 'dicot', H: 30, k: 0.1, Topt: 25, Tw: 17, gr: 1, col: '#4DAA57', seedCol: '#6B4F3A', seedSize: 0.6, seedShape: 'round',
      leaf: 'lanceolate', form: null, ven: 'reticulate', margin: 'serrate', phyllo: 'alternate', root: 'tap', nod: false, germ: 'epigeal', cot: 2,
      fruit: 'capsule2', flowerCol: '#EC4899', petals: 5, stamens: 5, sdisp: 'balsam',
      flowerFact: T2('Pink flower with 5 petals (two pairs are joined) and 5 stamens. Its ripe fruit bursts when touched.', 'गुलाबी फूल, 5 पंखुड़ियाँ (दो जोड़े जुड़े हुए) और 5 पुंकेसर। पका फल छूते ही फट जाता है।'),
      fruitName: T2('capsule that bursts', 'फटने वाला संपुट'),
    },
  };
  const PLANT_IDS = Object.keys(PLANTS);

  // ---------------------------------------------------------------- variables and which mode allows which
  const VARS = {
    light: { icon: '☀', name: T2('Light', 'प्रकाश'), min: 0, max: 100, step: 5, ideal: 80, poor: 0 },
    water: { icon: '💧', name: T2('Water', 'पानी'), min: 0, max: 100, step: 5, ideal: 55, poor: 5 },
    soil: { icon: '🌱', name: T2('Soil', 'मिट्टी'), min: 0, max: 2, step: 1, ideal: 2, poor: 0 },
    air: { icon: '🌬', name: T2('Air', 'हवा'), min: 0, max: 100, step: 5, ideal: 80, poor: 0 },
    temperature: { icon: '🌡', name: T2('Temperature', 'तापमान'), min: 5, max: 45, step: 1, ideal: 28, poor: 5 },
  };
  const VAR_IDS = Object.keys(VARS);
  const MODEVARS = {
    grow: { all: VAR_IDS, def: VAR_IDS },
    photosynthesis: { all: ['light', 'water', 'air', 'temperature'], def: ['light', 'air', 'temperature'] },
    transpiration: { all: ['light', 'water', 'air', 'temperature'], def: ['light', 'water', 'air', 'temperature'] },
    germination: { all: ['light', 'water', 'air', 'temperature'], def: ['water', 'air', 'temperature'] },
    tropism: { all: ['light', 'water'], def: ['light', 'water'] },
  };
  const MODES = ['grow', 'parts', 'photosynthesis', 'transpiration', 'germination', 'tropism', 'flower', 'seed-dispersal', 'leaf-types', 'root-types'];
  const MODE_NAME = {
    grow: T2('Grow a plant', 'पौधा उगाओ'), parts: T2('Parts of a plant', 'पौधे के भाग'), photosynthesis: T2('Photosynthesis', 'प्रकाश संश्लेषण'),
    transpiration: T2('Transpiration', 'वाष्पोत्सर्जन'), germination: T2('Germination', 'अंकुरण'), tropism: T2('Plant movements', 'पौधों की गति (अनुवर्तन)'),
    flower: T2('Flower to fruit', 'फूल से फल'), 'seed-dispersal': T2('Seed dispersal', 'बीजों का प्रकीर्णन'), 'leaf-types': T2('Types of leaves', 'पत्तियों के प्रकार'),
    'root-types': T2('Types of roots', 'जड़ों के प्रकार'),
  };
  const DEFAULT_PLANT = { grow: 'bean', parts: 'hibiscus', photosynthesis: 'hibiscus', transpiration: 'tulsi', germination: 'bean', tropism: 'bean', flower: 'hibiscus', 'seed-dispersal': null, 'leaf-types': 'mango', 'root-types': 'bean' };
  const PLANT_OK = { flower: PLANT_IDS.filter((p) => p !== 'maize'), 'seed-dispersal': ['bean', 'gram', 'mango', 'balsam'] };
  // The value a variable has when the lab hides its slider, per mode.
  const FIXED = { transpiration: { air: 30, water: 100 }, tropism: { light: 80, water: 70 } };
  const fixedVal = (mode, v) => ((FIXED[mode] && FIXED[mode][v] != null) ? FIXED[mode][v] : VARS[v].ideal);
  const VLABEL = {
    grow: { air: T2('Air (carbon dioxide)', 'हवा (कार्बन डाइऑक्साइड)') },
    photosynthesis: { light: T2('Light from the lamp', 'लैंप का प्रकाश'), air: T2('Carbon dioxide (baking soda)', 'कार्बन डाइऑक्साइड (खाने का सोडा)'), water: T2('Water in the plant', 'पौधे में पानी') },
    transpiration: { light: T2('Sunlight on the leaves', 'पत्तियों पर धूप'), air: T2('Wind', 'हवा का बहाव'), water: T2('Water in the flask (ml)', 'फ्लास्क में पानी (मिली)') },
    germination: { air: T2('Air (oxygen)', 'हवा (ऑक्सीजन)'), light: T2('Light', 'प्रकाश') },
    tropism: { light: T2('Brightness of the lamp', 'लैंप की चमक'), water: T2('Wetness of the wet side', 'गीली तरफ़ की नमी') },
  };
  const vName = (mode, v) => (VLABEL[mode] && VLABEL[mode][v]) || VARS[v].name;
  const SOILS = [
    { n: T2('Sandy soil', 'रेतीली मिट्टी'), ret: 0.7, nut: 0.5, col: '#E2C98B' },
    { n: T2('Clay soil', 'चिकनी मिट्टी'), ret: 1.1, nut: 0.8, col: '#A9633A' },
    { n: T2('Loamy soil', 'दोमट मिट्टी'), ret: 1.0, nut: 1.0, col: '#5A3A26' },
  ];

  // ---------------------------------------------------------------- the models (pure functions)
  const tempF = (P, T) => Math.max(0, 1 - Math.pow((T - P.Topt) / P.Tw, 2));
  const moist = (v) => clamp(v.water * SOILS[v.soil].ret, 0, 100);
  const waterF = (m) => (m < 35 ? smooth(8, 35, m) : m <= 70 ? 1 : lerp(1, 0.2, (m - 70) / 30));
  const turgorT = (m) => (m < 12 ? (m / 12) * 0.3 : m < 30 ? 0.3 + 0.7 * ((m - 12) / 18) : m <= 75 ? 1 : lerp(1, 0.3, (m - 75) / 25));
  const chloroT = (l) => (l <= 10 ? (l / 10) * 0.25 : 0.25 + 0.75 * smooth(10, 40, l));
  function growStatus(P, s, v) {
    const m = moist(v), dark = v.light < 8;
    if (s.dead) return { k: 'dead', t: T2('Dead: it could not get what it needs', 'मर गया: उसे ज़रूरी चीज़ें नहीं मिलीं') };
    if (s.Tg < 0.5) return m < 30 ? { k: 'bad', t: T2('Wilting: too little water', 'मुरझा रहा है: पानी बहुत कम') } : { k: 'bad', t: T2('Wilting: too much water, roots cannot breathe', 'मुरझा रहा है: ज़्यादा पानी, जड़ें साँस नहीं ले पा रहीं') };
    if (dark) return { k: 'bad', t: T2('Pale and thin: no light, no food', 'पीला और पतला: प्रकाश नहीं, भोजन नहीं') };
    if (tempF(P, v.temperature) < 0.15) return { k: 'bad', t: v.temperature < P.Topt ? T2('Too cold: growth has almost stopped', 'बहुत ठंड: बढ़ना लगभग रुक गया') : T2('Too hot: growth has almost stopped', 'बहुत गर्मी: बढ़ना लगभग रुक गया') };
    if (v.air < 12) return { k: 'bad', t: T2('Almost no carbon dioxide: little food made', 'कार्बन डाइऑक्साइड लगभग नहीं: भोजन कम बन रहा') };
    if (s.G < 0.6) return { k: 'warn', t: v.light < 35 ? T2('Pale leaves: not enough light', 'पीली पत्तियाँ: प्रकाश कम') : T2('Pale leaves: poor soil', 'पीली पत्तियाँ: मिट्टी में पोषक तत्व कम') };
    if (m < 22 || m > 72) return { k: 'warn', t: m < 22 ? T2('A little thirsty', 'थोड़ा प्यासा') : T2('A little too wet', 'थोड़ा ज़्यादा गीला') };
    return { k: 'good', t: T2('Healthy and growing', 'स्वस्थ और बढ़ रहा है') };
  }
  function newGrow(P, v) { return { h: P.H * 0.1, G: chloroT(v.light) * (0.5 + 0.5 * SOILS[v.soil].nut), Tg: turgorT(moist(v)), V: 1, reserve: 1, dead: false, wilted: false, hist: [P.H * 0.1] };
  }
  function stepGrow(P, s, v, dt) {
    if (s.dead) { s.Tg = Math.max(0, s.Tg - dt * 0.4); return; }
    const m = moist(v), dark = v.light < 8, nut = SOILS[v.soil].nut;
    const ft = tempF(P, v.temperature);
    s.Tg += (turgorT(m) - s.Tg) * Math.min(1, dt * 2.2);
    s.G += (chloroT(v.light) * (0.5 + 0.5 * nut) - s.G) * Math.min(1, dt * 0.7);
    let drive;
    if (dark) { drive = s.reserve > 0 ? 1.25 * ft : 0; s.reserve = Math.max(0, s.reserve - dt * 0.13); } else drive = sat(v.light, 25) * sat(v.air, 25) * ft;
    const cap = P.H * (dark ? 1.3 : 1);
    s.h += P.k * Math.max(0, cap - s.h) * drive * (0.35 + 0.65 * nut) * smooth(0.15, 0.7, s.Tg) * dt;
    let dv = 0.05;
    if (dark && s.reserve <= 0) dv = -0.12;
    if (s.Tg < 0.2) dv = Math.min(dv, -0.1);
    if (v.temperature > P.Topt + P.Tw * 0.95) dv = Math.min(dv, -0.1);
    s.V = clamp(s.V + dv * dt, 0, 1);
    if (s.V <= 0) s.dead = true;
  }
  // Photosynthesis: Blackman's law, the factor in shortest supply sets the rate.
  const enzymeF = (T) => (T <= 32 ? smooth(5, 32, T) : 1 - smooth(34, 46, T));
  function photo(v) {
    const fl = sat(v.light, 30), fc = sat(v.air, 30), ft = enzymeF(v.temperature), fw = v.water < 8 ? 0.15 : 1;
    const pairs = [['light', fl], ['air', fc], ['temperature', ft], ['water', fw]];
    let lim = pairs[0];
    pairs.forEach((p) => { if (p[1] < lim[1]) lim = p; });
    const rate = Math.min(fl, fc) * ft * fw;
    return { rate, limit: lim[1] >= 0.85 ? 'none' : lim[0], bubbles: Math.round(36 * rate), fl, fc, ft, fw };
  }
  // Transpiration in ml per hour for one leafy shoot.
  function trans(v) {
    let open = 0.15 + 0.85 * sat(v.light, 25);
    if (v.temperature > 40) open *= 0.7;
    const dry = v.water < 12;
    if (dry) open = 0.08;
    const wind = 0.6 + 0.9 * (v.air / 100);
    const warm = 0.35 + 1.65 * clamp((v.temperature - 5) / 40, 0, 1);
    return { open, rate: 2.4 * open * wind * warm, dry, wind, warm };
  }
  // Germination: progress per day, 0 when a need is missing. Light plays no part.
  function germ(P, v) {
    const flooded = v.water > 88;
    const wf = v.water < 20 ? 0 : smooth(20, 45, v.water);
    let af = v.air < 15 ? 0 : smooth(15, 50, v.air);
    if (flooded) af *= 0.2;
    const T = v.temperature;
    const tf = T < 8 || T > 42 ? 0 : Math.max(0.05, tempF({ Topt: P.Topt, Tw: P.Tw + 5 }, T));
    const why = v.water < 20 ? 'water' : v.air < 15 || flooded ? 'air' : tf === 0 ? 'temperature' : null;
    return { rate: 0.2 * P.gr * wf * af * tf, why };
  }
  // Tropisms (angles in degrees, t in hours).
  const tropAngle = {
    photo: (t, light) => 60 * sat(light, 25) * (1 - Math.exp(-t / 18)),
    geo: (t) => 90 * (1 - Math.exp(-t / 20)),
    hydro: (t, wet) => 50 * sat(wet, 20) * (1 - Math.exp(-t / 20)),
    thigmo: (t) => Math.min(4, t / 12),
  };

  // ---------------------------------------------------------------- leaf drawing (leaf points up from 0,0 to 0,-Ln)
  const WR = { ovate: 0.72, lanceolate: 0.3, linear: 0.1, lobed: 0.8, oblong: 0.42 };
  function halfW(shape, t, Ln, margin) {
    const wr = WR[shape] || 0.7;
    let p;
    if (shape === 'ovate') p = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
    else if (shape === 'lanceolate') p = Math.sin(Math.PI * Math.pow(t, 0.85));
    else if (shape === 'linear') p = Math.min(1, t * 14, (1 - t) * 6);
    else if (shape === 'oblong') p = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.5);
    else p = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
    let hw = (wr * Ln / 2) * Math.max(0, p);
    const env = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.5);
    if (margin === 'serrate') { const N = shape === 'oblong' ? 8 : 12; hw *= 1 + 0.1 * env * (((t * N) % 1) - 0.4) * 2; }
    else if (margin === 'crenate') { hw *= 1 + 0.07 * env * (Math.abs(Math.sin(Math.PI * t * 10)) - 0.5) * 2; }
    else if (margin === 'wavy') { hw *= 1 + 0.05 * env * Math.sin(t * Math.PI * 12); }
    else if (margin === 'lobed') { hw *= 1 + 0.32 * env * Math.sin(t * Math.PI * 6 + 0.6); }
    return hw;
  }
  const LD = {};
  function leafD(shape, Ln, margin) {
    const key = shape + '|' + fx(Ln) + '|' + margin;
    return LD[key] || (LD[key] = leafD0(shape, Ln, margin));
  }
  function leafD0(shape, Ln, margin) {
    const n = 72, R = [], Lf = [];
    for (let i = 0; i <= n; i++) { const t = i / n, hw = halfW(shape, t, Ln, margin), y = -Ln * t; R.push(`L${fx(hw)} ${fx(y)}`); Lf.push(`L${fx(-hw)} ${fx(y)}`); }
    return 'M0 0 ' + R.join(' ') + ' ' + Lf.reverse().join(' ') + 'Z';
  }
  const VD = {};
  function veinsD(shape, Ln, ven, margin) {
    const key = shape + '|' + fx(Ln) + '|' + ven;
    return VD[key] || (VD[key] = veinsD0(shape, Ln, ven, margin));
  }
  function veinsD0(shape, Ln, ven, margin) {
    const hwAt = (t) => halfW(shape, t, Ln, 'entire');
    if (ven === 'parallel') {
      let d = '';
      for (let k = -3; k <= 3; k++) { if (!k) continue; let s = ''; for (let i = 1; i <= 9; i++) { const t = i / 10; s += `${i === 1 ? 'M' : 'L'}${fx(k * hwAt(t) * 0.27)} ${fx(-Ln * t)} `; } d += s; }
      return d;
    }
    let d = '';
    for (let j = 1; j <= 6; j++) {
      const t0 = (j / 7) * 0.8 + 0.03, t1 = Math.min(0.97, t0 + 0.2);
      [-1, 1].forEach((sd) => { d += `M0 ${fx(-Ln * t0)} Q${fx(sd * hwAt(t0 + 0.1) * 0.6)} ${fx(-Ln * (t0 + 0.05))} ${fx(sd * hwAt(t1) * 0.86)} ${fx(-Ln * t1)} `; });
    }
    for (let j = 1; j <= 5; j++) { const t = j / 6.4; [-1, 1].forEach((sd) => { d += `M${fx(sd * hwAt(t) * 0.2)} ${fx(-Ln * t)} l${fx(sd * hwAt(t) * 0.35)} ${fx(-Ln * 0.07)} `; }); }
    return d;
  }
  // One leaf (or compound leaf) of a plant in local coordinates; returns SVG.
  function leafSVG(pid, Ln, o) {
    o = o || {};
    const P = PLANTS[pid], fill = o.fill || P.col, dark = mixHex(fill, '#0B3D1E', 0.45), veinCol = mixHex(fill, '#FFFFFF', 0.45);
    const one = (shape, len, mg, extra) => `<g ${extra || ''}><path d="${leafD(shape, len, mg)}" fill="${fill}" stroke="${dark}" stroke-width="${len > 40 ? 1.4 : 0.8}" stroke-linejoin="round"/>${o.noVeins ? '' : `<path d="${veinsD(shape, len, P.ven, mg)}" fill="none" stroke="${veinCol}" stroke-width="${len > 40 ? 1 : 0.5}" opacity=".75"/><path d="M0 0 L0 ${fx(-len * 0.96)}" stroke="${veinCol}" stroke-width="${len > 40 ? 1.8 : 0.9}" stroke-linecap="round"/>`}</g>`;
    if (P.form === 'trifoliate') {
      const s = Ln * 0.58;
      return `<path d="M0 0 L0 ${fx(-Ln * 0.42)}" stroke="${dark}" stroke-width="${Ln > 40 ? 3 : 1.3}"/>` + one('ovate', s, 'entire', `transform="translate(0 ${fx(-Ln * 0.4)})"`) + one('ovate', s * 0.8, 'entire', `transform="translate(0 ${fx(-Ln * 0.24)}) rotate(-72)"`) + one('ovate', s * 0.8, 'entire', `transform="translate(0 ${fx(-Ln * 0.24)}) rotate(72)"`);
    }
    if (P.form === 'pinnate') {
      let s = `<path d="M0 0 L0 ${fx(-Ln)}" stroke="${dark}" stroke-width="${Ln > 40 ? 2.4 : 1.1}"/>`;
      for (let i = 0; i < 4; i++) { const y = -Ln * (0.2 + i * 0.19), sz = Ln * 0.26; s += one('oblong', sz, 'serrate', `transform="translate(0 ${fx(y)}) rotate(-70)"`) + one('oblong', sz, 'serrate', `transform="translate(0 ${fx(y - Ln * 0.04)}) rotate(70)"`); }
      return s + one('oblong', Ln * 0.27, 'serrate', `transform="translate(0 ${fx(-Ln * 0.96)})"`);
    }
    return one(P.leaf, Ln, o.margin || P.margin);
  }

  // ---------------------------------------------------------------- icons, css, texts
  const ICON = {
    light: '<circle cx="12" cy="12" r="5" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.5"/><g stroke="#F5B90A" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></g>',
    water: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#38BDF8" stroke="#0284C7" stroke-width="1.5"/><path d="M9 14a3 3 0 0 0 2 3" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
    soil: '<path d="M2 20c3-8 7-11 10-11s7 3 10 11z" fill="#8B5A3C"/><circle cx="9" cy="16" r="1.3" fill="#E3C7A9"/><circle cx="15" cy="15" r="1.1" fill="#E3C7A9"/><circle cx="12" cy="18" r="1" fill="#E3C7A9"/>',
    air: '<g fill="none" stroke="#0EA5E9" stroke-width="2" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/></g>',
    temperature: '<rect x="10" y="3" width="4" height="12" rx="2" fill="#fff" stroke="#DC2626" stroke-width="1.5"/><circle cx="12" cy="18" r="3.6" fill="#DC2626"/><rect x="11.2" y="8" width="1.6" height="9" fill="#DC2626"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4.5" height="16" rx="1" fill="currentColor"/><rect x="13.5" y="4" width="4.5" height="16" rx="1" fill="currentColor"/>',
    reset: '<path d="M5 12a7 7 0 1 0 2.3-5.2M5 4v4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    next: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const ico = (n, s) => `<svg viewBox="0 0 24 24" width="${s || 22}" height="${s || 22}" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;
  const POTCOL = ['#2563EB', '#FF7A1A', '#8B3DFF', '#14B8A6', '#E11D48', '#F5B90A', '#0F766E', '#6D28D9'];

  const CSS = `
.pl{display:grid;gap:12px;grid-template-columns:minmax(0,1fr);color:var(--ink);font-family:var(--font-body);min-width:0}
.pl *{box-sizing:border-box}
.pl-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.pl-title{flex:1 1 150px;min-width:0;font-family:var(--font-display);font-weight:800;font-size:1.2rem;line-height:1.15}
.pl-title small{display:block;font-family:var(--font-body);font-weight:600;font-size:.84rem;color:var(--ink-2)}
.pl-day{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:#0F766E;color:#fff;font-family:var(--font-display);font-weight:800;font-size:1.05rem;white-space:nowrap}
.pl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding:0 16px;border:0;border-radius:12px;background:var(--action);color:#1E293B;font-weight:800;font-size:1rem;box-shadow:0 2px 0 rgba(6,18,51,.18);transition:transform .12s}
.pl-btn:active{transform:translateY(1px)}
.pl-btn.alt{background:var(--surface);color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.pl-main{display:grid;gap:12px;grid-template-columns:minmax(0,1fr);align-items:start}
@media(min-width:880px){.pl-main{grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr)}.pl-stage:not(.pl-tall){position:sticky;top:8px}}
.pl-stage,.pl-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.pl-svg{display:block;width:100%;height:auto;border-radius:18px;background:#E8F5FF;box-shadow:0 6px 18px rgba(6,18,51,.12);touch-action:manipulation}
.pl-svg text{font-family:var(--font-body)}
.pl-svg [data-svgpart],.pl-svg [data-svgpot]{cursor:pointer}
.pl-svg [data-svgpart]:focus-visible,.pl-svg [data-svgpot]:focus-visible{outline:3px solid var(--cyan);outline-offset:3px}
.pl-hl{filter:drop-shadow(0 0 4px #FFD23F) drop-shadow(0 0 9px #FFB000);animation:pl-pulse 1.3s ease-in-out infinite}
@keyframes pl-pulse{50%{filter:drop-shadow(0 0 8px #FFD23F) drop-shadow(0 0 18px #FF9B00)}}
@media(prefers-reduced-motion:reduce){.pl-hl{animation:none}.pl-btn{transition:none}}
.pl-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px;min-width:0}
.pl-h{font-family:var(--font-display);font-weight:800;font-size:1rem;margin:0 0 6px;color:var(--ink)}
.pl-pots{display:flex;flex-wrap:wrap;gap:8px}
.pl-pot{display:inline-flex;align-items:center;gap:8px;min-height:44px;min-width:44px;padding:4px 12px;border:2px solid var(--line);border-radius:12px;background:var(--surface);font-weight:700;color:var(--ink);text-align:left}
.pl-pot i{width:14px;height:14px;border-radius:50%;flex:none;display:inline-block}
.pl-pot[aria-pressed="true"]{border-color:var(--ink);background:var(--sun-t)}
.pl-sl{display:grid;gap:0;padding:6px 0;border-top:1px dashed var(--line)}
.pl-sl:first-of-type{border-top:0}
.pl-sl label{display:flex;align-items:center;gap:8px;font-weight:700}
.pl-sl label b{margin-left:auto;font-family:var(--font-display);font-size:1.02rem}
.pl-sl input[type=range]{width:100%;min-height:44px;margin:0;accent-color:#16A34A;cursor:pointer}
.pl-chip{display:inline-block;align-self:start;border-radius:999px;padding:1px 10px;font-size:.84rem;font-weight:700;background:var(--good-t);color:var(--good)}
.pl-chip.low,.pl-chip.high{background:var(--sun-t);color:var(--ink)}
.pl-chip.bad{background:var(--bad-t);color:var(--bad)}
.pl-parts{display:flex;flex-wrap:wrap;gap:8px}
.pl-pb{min-height:44px;min-width:44px;padding:4px 12px;border:2px solid var(--line);border-radius:999px;background:var(--surface);font-weight:700;color:var(--ink);display:inline-flex;align-items:center;gap:6px}
.pl-pb[aria-pressed="true"]{border-color:var(--ink);background:var(--sun-t)}
.pl-pb.done::after{content:"\\2713";color:var(--good);font-weight:900}
.pl-info{background:var(--sun-t);border-radius:14px;padding:10px 12px;min-height:76px;color:var(--ink)}
.pl-info b{display:block;font-family:var(--font-display);font-size:1.05rem;margin-bottom:2px}
.pl-info p{margin:0 0 4px}
.pl-eq{font-family:var(--font-display);font-weight:700;text-align:center;font-size:1.02rem;padding:8px 6px;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow-wrap:anywhere}
.pl-eq small{display:block;font-family:var(--font-body);font-weight:600;color:var(--ink-2);font-size:.8rem}
.pl-quiz{background:var(--surface);border:2px solid var(--royal-t);border-radius:16px;padding:12px}
.pl-quiz p{margin:0 0 8px;font-weight:700}
.pl-opts{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.pl-opt{min-height:44px;padding:6px 12px;border:2px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font-weight:700;text-align:left}
.pl-opt.right{border-color:var(--good);background:var(--good-t);color:var(--good)}
.pl-opt.wrong{border-color:var(--bad);background:var(--bad-t);color:var(--bad)}
.pl-why{margin:8px 0 0;font-weight:500}
.pl-chart{width:100%;height:auto;display:block}
.pl-chart text{font-family:var(--font-body);font-size:10px;fill:var(--ink-2)}
.pl-leg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.84rem;font-weight:600;color:var(--ink-2);margin-top:2px}
.pl-leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px}
`;

  const PARTS = {
    parts: ['root', 'stem', 'branch', 'leaf', 'bud', 'flower', 'fruit', 'seed'],
    photosynthesis: ['light', 'co2', 'water', 'chloroplast', 'glucose', 'oxygen'],
    transpiration: ['stoma', 'guard-cell', 'xylem', 'vapour'],
    germination: ['seed-coat', 'radicle', 'plumule', 'cotyledon', 'endosperm'],
    tropism: ['shoot', 'root', 'auxin'],
    flower: ['sepal', 'petal', 'filament', 'anther', 'stigma', 'style', 'ovary', 'ovule'],
    'seed-dispersal': ['dandelion', 'maple', 'coconut', 'burr', 'mango', 'balsam', 'pod'],
    'leaf-types': ['lamina', 'midrib', 'veins', 'petiole', 'margin', 'apex'],
    'root-types': ['root-cap', 'root-hair', 'main-root', 'lateral-root', 'nodule'],
  };
  // name {en,hi} and what it does {en,hi} for every part key in every mode
  const PI = {
    root: [T2('Root', 'जड़'), T2('The root holds the plant in the soil. It soaks up water and minerals.', 'जड़ पौधे को मिट्टी में थामे रखती है। यह पानी और खनिज सोखती है।')],
    stem: [T2('Stem', 'तना'), T2('The stem holds the plant up. It carries water up and food down.', 'तना पौधे को सीधा रखता है। यह पानी ऊपर और भोजन नीचे पहुँचाता है।')],
    branch: [T2('Branch', 'शाखा'), T2('A branch grows out of the stem. It carries more leaves, flowers and fruits.', 'शाखा तने से निकलती है। उस पर और पत्तियाँ, फूल व फल लगते हैं।')],
    leaf: [T2('Leaf', 'पत्ती'), T2('The leaf makes food for the plant using sunlight. It also lets out water vapour.', 'पत्ती सूर्य के प्रकाश से पौधे के लिए भोजन बनाती है। यह जलवाष्प भी छोड़ती है।')],
    bud: [T2('Bud', 'कली'), T2('A bud is a young shoot packed tight. It grows into a new branch, leaf or flower.', 'कली कसकर बँधा नन्हा अंकुर है। यह नई शाखा, पत्ती या फूल बनती है।')],
    flower: [T2('Flower', 'फूल'), T2('The flower makes seeds. After pollination it turns into a fruit.', 'फूल बीज बनाता है। परागण के बाद यह फल बन जाता है।')],
    fruit: [T2('Fruit', 'फल'), T2('The fruit grows from the flower. It protects the seeds inside.', 'फल फूल से बनता है। यह अंदर के बीजों की रक्षा करता है।')],
    seed: [T2('Seed', 'बीज'), T2('A seed holds a baby plant and its food. It can grow into a new plant.', 'बीज में नन्हा पौधा और उसका भोजन होता है। इससे नया पौधा उगता है।')],
    light: [T2('Sunlight', 'सूर्य का प्रकाश'), T2('Sunlight is the energy. The leaf uses it to make food. No light, no food.', 'सूर्य का प्रकाश ऊर्जा देता है। पत्ती इससे भोजन बनाती है। प्रकाश नहीं तो भोजन नहीं।')],
    co2: [T2('Carbon dioxide', 'कार्बन डाइऑक्साइड'), T2('Carbon dioxide gas comes from the air through tiny pores (stomata) in the leaf.', 'कार्बन डाइऑक्साइड गैस हवा से पत्ती के छोटे छिद्रों (रंध्रों) से अंदर आती है।')],
    water: [T2('Water', 'पानी'), T2('Water comes up from the roots through tubes called xylem.', 'पानी जड़ों से जाइलम नामक नलियों में चढ़कर पत्ती तक आता है।')],
    chloroplast: [T2('Chloroplast', 'हरितलवक (क्लोरोप्लास्ट)'), T2('Chloroplasts hold the green colour (chlorophyll). The food is made here.', 'हरितलवकों में हरा रंग (क्लोरोफिल) होता है। भोजन यहीं बनता है।')],
    glucose: [T2('Glucose (food)', 'ग्लूकोज़ (भोजन)'), T2('Glucose is the food. The plant uses it to grow or stores it as starch.', 'ग्लूकोज़ पौधे का भोजन है। पौधा इससे बढ़ता है या इसे मंड (स्टार्च) के रूप में जमा करता है।')],
    oxygen: [T2('Oxygen', 'ऑक्सीजन'), T2('Oxygen is made as a by-product. It leaves the leaf and we breathe it in.', 'ऑक्सीजन साथ में बनती है। यह पत्ती से बाहर निकलती है और हम इसमें साँस लेते हैं।')],
    stoma: [T2('Stoma', 'रंध्र'), T2('A stoma is a tiny pore in the leaf. Water vapour goes out and air comes in through it.', 'रंध्र पत्ती का नन्हा छिद्र है। इससे जलवाष्प बाहर जाती है और हवा अंदर आती है।')],
    'guard-cell': [T2('Guard cells', 'द्वार कोशिकाएँ'), T2('Two guard cells open and close the stoma. In light they fill with water and the pore opens.', 'दो द्वार कोशिकाएँ रंध्र को खोलती और बंद करती हैं। प्रकाश में ये पानी से फूलती हैं और छिद्र खुलता है।')],
    xylem: [T2('Xylem', 'जाइलम'), T2('Xylem tubes carry water from the roots all the way up to the leaves.', 'जाइलम की नलियाँ पानी को जड़ों से पत्तियों तक पहुँचाती हैं।')],
    vapour: [T2('Water vapour', 'जलवाष्प'), T2('Water leaves the leaf as vapour. This pulls more water up from the roots.', 'पानी पत्ती से वाष्प बनकर निकलता है। इससे जड़ों से और पानी ऊपर खिंचता है।')],
    'seed-coat': [T2('Seed coat', 'बीज चोल'), T2('The seed coat is the skin. It protects the baby plant inside.', 'बीज चोल बीज की ऊपरी परत है। यह अंदर के नन्हे पौधे की रक्षा करती है।')],
    radicle: [T2('Radicle', 'मूलांकुर'), T2('The radicle comes out first. It becomes the root.', 'मूलांकुर सबसे पहले बाहर आता है। यह जड़ बनता है।')],
    plumule: [T2('Plumule', 'प्रांकुर'), T2('The plumule is the baby shoot. It grows up into the stem and leaves.', 'प्रांकुर नन्हा तना है। यह ऊपर बढ़कर तना और पत्तियाँ बनाता है।')],
    cotyledon: [T2('Cotyledon', 'बीजपत्र'), T2('The cotyledon is the first leaf. It stores food for the baby plant.', 'बीजपत्र पहली पत्ती है। इसमें नन्हे पौधे के लिए भोजन जमा रहता है।')],
    endosperm: [T2('Endosperm', 'भ्रूणपोष'), T2('In maize the food is stored in the endosperm. A bean has no endosperm: its cotyledons store the food.', 'मक्के में भोजन भ्रूणपोष में जमा रहता है। सेम में भ्रूणपोष नहीं होता, भोजन बीजपत्रों में रहता है।')],
    shoot: [T2('Shoot', 'प्ररोह (तना)'), T2('A shoot grows towards light and away from the ground.', 'तना प्रकाश की ओर और धरती से दूर बढ़ता है।')],
    auxin: [T2('Auxin', 'ऑक्सिन'), T2('Auxin is a plant hormone. It gathers on the shaded side and makes those cells grow longer, so the shoot bends towards the light.', 'ऑक्सिन पौधे का हार्मोन है। यह छाया वाली ओर जमा होकर उन कोशिकाओं को लंबा करता है, इसलिए तना प्रकाश की ओर मुड़ता है।')],
    sepal: [T2('Sepal', 'बाह्यदल'), T2('Sepals are the green leaves at the base. They protect the bud.', 'बाह्यदल आधार पर हरी पत्तियाँ हैं। ये कली की रक्षा करते हैं।')],
    petal: [T2('Petal', 'पंखुड़ी'), T2('Petals are bright. Their colour and smell call insects to the flower.', 'पंखुड़ियाँ चटकीली होती हैं। उनका रंग और गंध कीड़ों को फूल तक बुलाते हैं।')],
    filament: [T2('Filament', 'पुतंतु'), T2('The filament is the thin stalk that holds up the anther.', 'पुतंतु वह पतली डंडी है जो परागकोश को थामती है।')],
    anther: [T2('Anther', 'परागकोश'), T2('The anther makes pollen, the yellow dust. Anther and filament together are the stamen.', 'परागकोश पीली धूल, यानी पराग बनाता है। परागकोश और पुतंतु मिलकर पुंकेसर बनाते हैं।')],
    stigma: [T2('Stigma', 'वर्तिकाग्र'), T2('The stigma is sticky at the top. Pollen sticks to it.', 'वर्तिकाग्र ऊपर से चिपचिपा होता है। पराग इससे चिपक जाता है।')],
    style: [T2('Style', 'वर्तिका'), T2('The style is the tube between stigma and ovary. The pollen tube grows down it.', 'वर्तिका वर्तिकाग्र और अंडाशय के बीच की नली है। परागनली इसमें नीचे बढ़ती है।')],
    ovary: [T2('Ovary', 'अंडाशय'), T2('The ovary is the swollen base of the pistil. After fertilisation it becomes the fruit.', 'अंडाशय स्त्रीकेसर का फूला आधार है। निषेचन के बाद यह फल बन जाता है।')],
    ovule: [T2('Ovule', 'बीजांड'), T2('An ovule holds the female cell. After fertilisation it becomes a seed.', 'बीजांड में मादा कोशिका होती है। निषेचन के बाद यह बीज बन जाता है।')],
    dandelion: [T2('Dandelion seed', 'सिंहपर्णी (डेंडेलियन) का बीज'), T2('Wind carries it. Its fluffy hairs work like a parachute, so it floats far.', 'हवा इसे उड़ा ले जाती है। इसके रोएँदार बाल पैराशूट जैसे काम करते हैं, इसलिए यह दूर तक तैरता है।')],
    maple: [T2('Maple seed', 'मेपल का बीज'), T2('Wind carries it. The flat wing makes it spin like a helicopter and glide away from the tree.', 'हवा इसे ले जाती है। चपटा पंख इसे हेलिकॉप्टर की तरह घुमाता है और पेड़ से दूर ले जाता है।')],
    coconut: [T2('Coconut', 'नारियल'), T2('Water carries it. The fibre husk is light and full of air, so it floats on the sea.', 'पानी इसे ले जाता है। रेशों वाला खोल हल्का और हवा से भरा होता है, इसलिए यह समुद्र में तैरता है।')],
    burr: [T2('Burr (hooked seed)', 'काँटेदार (हुकदार) बीज'), T2('Animals carry it. Tiny hooks cling to fur or clothes and drop off far away.', 'जानवर इसे ले जाते हैं। नन्हे हुक बालों या कपड़ों में फँस जाते हैं और दूर जाकर गिर जाते हैं।')],
    mango: [T2('Mango', 'आम'), T2('Animals carry it. Birds, bats and people eat the sweet pulp and drop the stone far away.', 'जानवर इसे ले जाते हैं। पक्षी, चमगादड़ और लोग मीठा गूदा खाते हैं और गुठली दूर फेंक देते हैं।')],
    balsam: [T2('Balsam pod', 'गुलमेहंदी की फली'), T2('The ripe pod bursts open when touched and throws its seeds out. This is explosion.', 'पकी फली छूते ही फट जाती है और बीज दूर फेंक देती है। यह विस्फोट से प्रकीर्णन है।')],
    pod: [T2('Bean or gram pod', 'सेम या चने की फली'), T2('The dry pod twists and splits with a snap. The seeds are flung away from the plant.', 'सूखी फली ऐंठकर चटाख से फट जाती है। बीज पौधे से दूर जा गिरते हैं।')],
    lamina: [T2('Blade (lamina)', 'पर्णफलक'), T2('The blade is the flat green part. It catches sunlight and makes food.', 'पर्णफलक पत्ती का चपटा हरा भाग है। यह प्रकाश पकड़कर भोजन बनाता है।')],
    midrib: [T2('Midrib', 'मध्य शिरा'), T2('The midrib is the thick vein in the middle. It holds the blade up.', 'मध्य शिरा बीच की मोटी शिरा है। यह पर्णफलक को सहारा देती है।')],
    veins: [T2('Veins', 'शिराएँ'), T2('Veins carry water into the leaf and food out. They can form a net (reticulate) or run side by side (parallel).', 'शिराएँ पत्ती में पानी लाती और भोजन बाहर ले जाती हैं। ये जाल जैसी (जालिकावत) या साथ-साथ (समानांतर) हो सकती हैं।')],
    petiole: [T2('Petiole', 'पर्णवृंत'), T2('The petiole is the stalk that joins the leaf to the stem.', 'पर्णवृंत वह डंठल है जो पत्ती को तने से जोड़ता है।')],
    margin: [T2('Margin', 'किनारा (पर्णकिनारा)'), T2('The margin is the edge of the leaf. It can be smooth, toothed or wavy.', 'किनारा पत्ती का छोर है। यह चिकना, दाँतेदार या लहरदार हो सकता है।')],
    apex: [T2('Apex', 'शीर्ष'), T2('The apex is the tip of the leaf.', 'शीर्ष पत्ती की नोक है।')],
    'main-root': [T2('Main root', 'मुख्य जड़'), T2('The main root (tap root) is one thick root that goes deep.', 'मुख्य जड़ (मूसला जड़) एक मोटी जड़ है जो गहराई तक जाती है।')],
    'root-cap': [T2('Root cap', 'मूल टोपी'), T2('The root cap covers the tip like a helmet. It protects the root as it pushes through soil.', 'मूल टोपी जड़ की नोक को हेलमेट की तरह ढकती है। मिट्टी में धँसते समय यह जड़ की रक्षा करती है।')],
    'root-hair': [T2('Root hairs', 'मूल रोम'), T2('Root hairs are tiny threads. They soak up water and minerals from the soil.', 'मूल रोम बारीक धागे जैसे होते हैं। ये मिट्टी से पानी और खनिज सोखते हैं।')],
    'lateral-root': [T2('Lateral roots', 'पार्श्व जड़ें'), T2('Lateral roots are side branches of the root. They spread out and take in more water.', 'पार्श्व जड़ें जड़ की बगल की शाखाएँ हैं। ये फैलकर और पानी सोखती हैं।')],
    nodule: [T2('Root nodules', 'मूल ग्रंथियाँ'), T2('Lumps on bean and gram roots. Tiny bacteria (Rhizobium) inside turn nitrogen from the air into food for the plant.', 'सेम और चने की जड़ों की गाँठें। इनमें रहने वाले राइज़ोबियम जीवाणु हवा की नाइट्रोजन को पौधे के काम की बना देते हैं।')],
  };
  const partName = (k, mode, pid) => {
    if (k === 'root' && mode === 'tropism') return T2('Root', 'जड़');
    if (k === 'cotyledon' && pid && PLANTS[pid] && PLANTS[pid].cot === 1) return T2('Cotyledon (scutellum)', 'बीजपत्र (स्कुटेलम)');
    return PI[k][0];
  };
  const partText = (k, mode, pid) => {
    if (mode === 'tropism' && k === 'root') return T2('A root grows towards water and down towards the ground.', 'जड़ पानी की ओर और धरती की ओर नीचे बढ़ती है।');
    if (k === 'main-root') {
      return pid && PLANTS[pid].root === 'fibrous'
        ? T2('No main root here. This plant has many thin roots of about the same size (fibrous roots).', 'यहाँ कोई मुख्य जड़ नहीं है। इस पौधे में लगभग बराबर की बहुत सी पतली जड़ें हैं (झकड़ा जड़)।')
        : T2('The main root (tap root) is one thick root that goes deep. Smaller roots branch from it.', 'मुख्य जड़ (मूसला जड़) एक मोटी जड़ है जो गहराई तक जाती है। छोटी जड़ें इससे निकलती हैं।');
    }
    if (k === 'nodule' && pid && !PLANTS[pid].nod) return T2('This plant has no root nodules. Look at bean or gram, which are legumes.', 'इस पौधे में मूल ग्रंथियाँ नहीं होतीं। सेम या चने को देखो, ये दलहनी पौधे हैं।');
    if (k === 'petiole' && pid === 'maize') return T2('Maize has no petiole. The base of the leaf wraps round the stem like a sheath.', 'मक्के में पर्णवृंत नहीं होता। पत्ती का आधार तने के चारों ओर म्यान की तरह लिपटा होता है।');
    if (k === 'cotyledon' && pid && PLANTS[pid].cot === 1) return T2('Maize has one cotyledon (a seed with one cotyledon is a monocot). It passes food from the endosperm to the baby plant.', 'मक्के में एक बीजपत्र होता है (एक बीजपत्र वाला बीज एकबीजपत्री कहलाता है)। यह भ्रूणपोष का भोजन नन्हे पौधे तक पहुँचाता है।');
    if (k === 'cotyledon' && pid) return T2('The bean-type seed has two cotyledons (a dicot). They store food for the baby plant.', 'सेम जैसे बीज में दो बीजपत्र होते हैं (द्विबीजपत्री)। इनमें नन्हे पौधे के लिए भोजन जमा रहता है।');
    if (k === 'endosperm' && pid && PLANTS[pid].cls !== 'monocot') return T2('This seed has no separate endosperm. Its cotyledons store the food.', 'इस बीज में अलग भ्रूणपोष नहीं होता। भोजन बीजपत्रों में जमा रहता है।');
    if (k === 'flower' && pid === 'maize') return T2('Maize has separate flowers: the tassel on top is male, the silky cob is female. After pollination the cob grows grains.', 'मक्के के फूल अलग-अलग होते हैं: ऊपर का झंडा नर है और रेशमी भुट्टा मादा। परागण के बाद भुट्टे में दाने बनते हैं।');
    return PI[k][1];
  };
  const STATUS_SHORT = (t) => ({ en: t.en.split(':')[0], hi: t.hi.split(':')[0] });
  const LEAFTXT = {
    shape: { ovate: T2('egg-shaped (ovate)', 'अंडाकार'), lanceolate: T2('long and pointed (lanceolate)', 'भाले जैसी (लंबी, नुकीली)'), linear: T2('long and narrow like a strap', 'पट्टी जैसी लंबी और पतली'), lobed: T2('deeply lobed', 'कटे हुए खंडों वाली'), oblong: T2('small and oblong leaflets', 'छोटी, लंबोतरी पत्तिकाएँ') },
    margin: { entire: T2('smooth (entire)', 'चिकना'), serrate: T2('toothed like a saw (serrate)', 'आरी जैसा दाँतेदार'), crenate: T2('with rounded teeth', 'गोल दाँतों वाला'), wavy: T2('wavy', 'लहरदार'), lobed: T2('lobed', 'कटा हुआ') },
    ven: { reticulate: T2('net-like (reticulate)', 'जाल जैसी (जालिकावत)'), parallel: T2('side by side (parallel)', 'साथ-साथ (समानांतर)') },
    phyllo: { alternate: T2('alternate: one leaf at each node', 'एकांतर: हर गाँठ पर एक पत्ती'), opposite: T2('opposite: two leaves at each node', 'सम्मुख: हर गाँठ पर दो पत्तियाँ') },
  };

  // ---------------------------------------------------------------- scene helpers
  const DEFS = `<defs>
<linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#EAF8FF"/></linearGradient>
<linearGradient id="pl-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDEBFA"/><stop offset="1" stop-color="#F4F8FD"/></linearGradient>
<linearGradient id="pl-pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D2683D"/><stop offset=".45" stop-color="#EE9468"/><stop offset="1" stop-color="#B9532D"/></linearGradient>
<linearGradient id="pl-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".25" stop-color="#fff" stop-opacity=".08"/><stop offset=".8" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>
<linearGradient id="pl-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8EAFF"/><stop offset="1" stop-color="#53B5EC"/></linearGradient>
<linearGradient id="pl-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5A3C"/><stop offset="1" stop-color="#4E3220"/></linearGradient>
<linearGradient id="pl-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0A869"/><stop offset="1" stop-color="#B9783A"/></linearGradient>
<radialGradient id="pl-glow"><stop offset="0" stop-color="#FFF3A6" stop-opacity=".95"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
<linearGradient id="pl-petal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
</defs>`;
  const pill = (x, y, txt, bg, fg, fs, lang) => {
    fs = (fs || 11) * 1.15;
    const h = fs + 10, w = Math.round(String(txt).length * fs * (lang === 'hi' ? 0.7 : 0.58) + 16);
    return `<g><rect x="${fx(x - w / 2)}" y="${fx(y - h / 2)}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/><text x="${fx(x)}" y="${fx(y + fs * 0.36)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${fg}">${esc(txt)}</text></g>`;
  };
  const STC = { good: ['#0F766E', '#fff'], warn: ['#F5B90A', '#1E293B'], bad: ['#B42318', '#fff'], dead: ['#4B5563', '#fff'] };
  const potSVG = (cx, y, pw, soilCol, m) => {
    const bw = pw - 22;
    return `<path d="M${fx(cx - pw / 2)} ${y} L${fx(cx + pw / 2)} ${y} L${fx(cx + bw / 2)} ${y + 56} Q${cx} ${y + 62} ${fx(cx - bw / 2)} ${y + 56}Z" fill="url(#pl-pot)"/>`
      + `<rect x="${fx(cx - pw / 2 - 5)}" y="${y - 8}" width="${pw + 10}" height="15" rx="6" fill="#C25A33"/><rect x="${fx(cx - pw / 2 - 2)}" y="${y - 6}" width="${pw + 4}" height="4" rx="2" fill="#fff" opacity=".25"/>`
      + `<ellipse cx="${cx}" cy="${y - 7}" rx="${fx(pw / 2 - 2)}" ry="6" fill="${soilCol}"/>`
      + (m > 74 ? `<ellipse cx="${cx}" cy="${y - 8}" rx="${fx(pw / 2 - 8)}" ry="4" fill="#7CCBF5" opacity=".75"/>` : '')
      + (m < 20 ? `<path d="M${fx(cx - 18)} ${y - 8} l8 3 l-3 3 M${fx(cx + 6)} ${y - 9} l9 2 l-2 3" stroke="#3E2A1B" stroke-width="1.2" fill="none"/>` : '');
  };
  const sunSVG = (x, y, light, dark) => {
    const k = clamp(light / 100, 0, 1), r = 8 + 9 * k;
    if (dark) return `<path d="M${x + 6} ${y - 11} a12 12 0 1 0 6 20 a10 10 0 0 1 -6 -20z" fill="#C9D3F5" opacity=".9"/>`;
    let rays = '';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rays += `<line x1="${fx(x + Math.cos(a) * (r + 3))}" y1="${fx(y + Math.sin(a) * (r + 3))}" x2="${fx(x + Math.cos(a) * (r + 3 + 8 * k))}" y2="${fx(y + Math.sin(a) * (r + 3 + 8 * k))}" stroke="#F5B90A" stroke-width="2.4" stroke-linecap="round" opacity="${fx(0.25 + 0.75 * k)}"/>`; }
    return `<circle cx="${x}" cy="${y}" r="${fx(r * 2.4)}" fill="url(#pl-glow)" opacity="${fx(0.2 + 0.8 * k)}"/>${rays}<circle cx="${x}" cy="${y}" r="${fx(r)}" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.6" opacity="${fx(0.45 + 0.55 * k)}"/>`;
  };
  const selRing = (x, y, w, h, on, col) => `<rect x="${fx(x)}" y="${fx(y)}" width="${fx(w)}" height="${fx(h)}" rx="16" fill="${on ? col : 'none'}" fill-opacity=".10" stroke="${on ? col : 'transparent'}" stroke-width="3"/>`;
  const dropSVG = (x, y, s, col) => `<path d="M${x} ${y - 6 * s} c${3 * s} ${4 * s} ${4.5 * s} ${6 * s} ${4.5 * s} ${8.5 * s} a${4.5 * s} ${4.5 * s} 0 0 1 ${-9 * s} 0 c0 ${-2.5 * s} ${1.5 * s} ${-4.5 * s} ${4.5 * s} ${-8.5 * s}z" fill="${col || '#38BDF8'}"/>`;
  // a leafy tip: pair of small leaves
  const tipLeaves = (pid, x, y, ang, Ln, fill) => `<g transform="translate(${fx(x)} ${fx(y)}) rotate(${fx(ang)})">${leafSVG(pid, Ln, { fill, noVeins: Ln < 16 })}</g>`;

  // ---------------------------------------------------------------- GROW
  function growPlantSVG(pid, st, v, cx, y0) {
    const P = PLANTS[pid], sc = 150 / P.H;
    const hpx = Math.max(12, st.h * sc);
    const dark = v.light < 8, wilt = st.dead ? 1 : clamp(1 - st.Tg / 0.8, 0, 1);
    const eti = dark ? 1 : clamp((30 - v.light) / 30, 0, 1) * 0.5;
    const G = clamp(st.G, 0, 1);
    const stemCol = st.dead ? '#7A5A34' : mixHex('#EDE7A6', '#4E9A45', G);
    const leafCol = st.dead ? '#8B6B3E' : mixHex('#E2D56E', P.col, G);
    const tipx = cx + (st.dead ? hpx * 0.8 : wilt * hpx * 0.5), tipy = y0 - hpx * (st.dead ? 0.25 : 1 - wilt * 0.4);
    const c1x = cx + (tipx - cx) * 0.1, c1y = y0 - hpx * 0.6;
    const B = (t) => [(1 - t) * (1 - t) * cx + 2 * (1 - t) * t * c1x + t * t * tipx, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * c1y + t * t * tipy];
    const sw = 4.4 - 2.4 * eti;
    let g = `<path d="M${cx} ${y0} Q${fx(c1x)} ${fx(c1y)} ${fx(tipx)} ${fx(tipy)}" fill="none" stroke="${stemCol}" stroke-width="${fx(sw)}" stroke-linecap="round"/>`;
    const frac = clamp(st.h / P.H, 0, 1.3);
    const nL = clamp(Math.floor(2 + 6 * frac), 2, 8);
    const Ln = (11 + 27 * Math.min(frac, 1)) * (1 - 0.55 * eti) * (P.leaf === 'linear' ? 1.9 : P.form ? 1.25 : 1);
    for (let i = 0; i < nL; i++) {
      const t = 0.3 + 0.62 * (nL === 1 ? 1 : i / (nL - 1)), pt = B(t), side = i % 2 ? 1 : -1;
      const ang = side * (st.dead ? 150 : lerp(P.leaf === 'linear' ? 38 : 58, 150, wilt));
      g += `<g transform="translate(${fx(pt[0])} ${fx(pt[1])}) rotate(${fx(ang)}) scale(${fx(0.62 + 0.38 * (1 - i / nL))})">${leafSVG(pid, Ln, { fill: leafCol, noVeins: Ln < 17 })}</g>`;
    }
    if (!st.dead) {
      const tl = Ln * 0.62;
      g += tipLeaves(pid, tipx, tipy, -lerp(26, 120, wilt), tl, leafCol) + tipLeaves(pid, tipx, tipy, lerp(26, 120, wilt), tl, leafCol);
    }
    return g;
  }
  function sceneGrow(S, X) {
    const N = S.pots.length, cw = 420 / N, y0 = 226, P = PLANTS[S.plant];
    let s = `<rect width="420" height="330" fill="url(#pl-sky)"/><path d="M0 232 Q90 196 200 226 T420 214 V330 H0Z" fill="#BDE7A6"/><path d="M0 258 Q120 228 240 252 T420 244 V330 H0Z" fill="#9CD684"/><rect y="282" width="420" height="48" fill="url(#pl-bench)"/><rect y="282" width="420" height="4" fill="#fff" opacity=".35"/>`;
    S.pots.forEach((pot, i) => {
      const cx = cw * (i + 0.5), v = pot.v, st = pot.st, sel = i === S.sel, pw = Math.min(104, cw - 18), dark = v.light < 8;
      const stat = growStatus(P, st, v), sc = STC[stat.k], m = moist(v);
      let g = selRing(cx - cw / 2 + 3, 3, cw - 6, 324, sel, POTCOL[i % POTCOL.length]);
      g += sunSVG(cx, 32, v.light, dark);
      g += potSVG(cx, y0, pw, mixHex(SOILS[v.soil].col, '#2E1B10', clamp(m / 160, 0, 0.55)), m);
      g += growPlantSVG(S.plant, st, v, cx, y0 - 8);
      if (dark) g += `<rect x="${fx(cx - cw / 2 + 5)}" y="5" width="${fx(cw - 10)}" height="274" rx="14" fill="#0B1230" opacity=".5"/>`;
      g += `<text x="${fx(cx)}" y="304" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" stroke="#7A4A1E" stroke-width="3" paint-order="stroke">${esc(X.t(T2('Pot ', 'गमला ')) + (i + 1))}</text>`;
      g += pill(cx, 320, X.t(stat.k === 'good' ? T2('Healthy', 'स्वस्थ') : STATUS_SHORT(stat.t)), sc[0], sc[1], 12, X.lang);
      s += `<g data-svgpot="${i + 1}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(X.t(T2('Pot ', 'गमला ')) + (i + 1) + ': ' + X.t(stat.t))}">${g}</g>`;
    });
    return { main: s, vb: [420, 330] };
  }
  function chartSVG(S, X) {
    const P = PLANTS[S.plant], W = 300, H = 130, x0 = 30, y0 = H - 20, x1 = W - 8, y1 = 10, ymax = Math.ceil(P.H * 1.3 / 5) * 5, dmax = S.maxDay;
    const px = (d) => x0 + (d / dmax) * (x1 - x0), py = (h) => y0 - (h / ymax) * (y0 - y1);
    let s = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="var(--line)"/><line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}" stroke="var(--line)"/>`;
    [0, 0.5, 1].forEach((k) => { const h = Math.round(ymax * k); s += `<text x="${x0 - 4}" y="${py(h) + 3}" text-anchor="end">${h}</text><line x1="${x0}" y1="${py(h)}" x2="${x1}" y2="${py(h)}" stroke="var(--line)" stroke-dasharray="2 4"/>`; });
    [0, 7, 14, 21].forEach((d) => { s += `<text x="${px(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`; });
    s += `<text x="${x0 + 2}" y="8">${esc(X.t(T2('Height (cm) by day', 'दिन के साथ ऊँचाई (सेमी)')))}</text>`;
    S.pots.forEach((pot, i) => {
      const pts = pot.st.hist.map((h, d) => `${fx(px(d))},${fx(py(Math.min(h, ymax)))}`);
      const last = pot.st.h;
      pts.push(`${fx(px(Math.min(S.day, dmax)))},${fx(py(Math.min(last, ymax)))}`);
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${POTCOL[i % POTCOL.length]}" stroke-width="${i === S.sel ? 3.2 : 2}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${fx(px(Math.min(S.day, dmax)))}" cy="${fx(py(Math.min(last, ymax)))}" r="3.5" fill="${POTCOL[i % POTCOL.length]}"/>`;
    });
    return `<svg class="pl-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(X.t(T2('Graph of plant height against days', 'दिनों के साथ पौधे की ऊँचाई का ग्राफ़')))}">${s}</svg>`;
  }

  // ---------------------------------------------------------------- GERMINATION
  function seedBody(P, x, y, b) {
    const c = P.seedCol, hi = `<ellipse cx="${fx(x - b * 0.35)}" cy="${fx(y - b * 0.35)}" rx="${fx(b * 0.35)}" ry="${fx(b * 0.2)}" fill="#fff" opacity=".3"/>`;
    if (P.seedShape === 'kidney') return `<path d="M${fx(x - b * 1.3)} ${y} C${fx(x - b * 1.3)} ${fx(y - b * 1.1)} ${fx(x + b * 1.3)} ${fx(y - b * 1.1)} ${fx(x + b * 1.3)} ${y} C${fx(x + b * 1.3)} ${fx(y + b * 0.8)} ${fx(x + b * 0.3)} ${fx(y + b * 0.8)} ${x} ${fx(y + b * 0.35)} C${fx(x - b * 0.3)} ${fx(y + b * 0.8)} ${fx(x - b * 1.3)} ${fx(y + b * 0.8)} ${fx(x - b * 1.3)} ${y}Z" fill="${c}"/>${hi}`;
    if (P.seedShape === 'beak') return `<path d="M${fx(x - b * 1.1)} ${fx(y + b * 0.2)} Q${fx(x - b * 1.1)} ${fx(y - b * 1.1)} ${fx(x)} ${fx(y - b * 0.95)} Q${fx(x + b * 1.15)} ${fx(y - b * 0.9)} ${fx(x + b * 1.2)} ${fx(y + b * 0.1)} Q${fx(x + b * 0.9)} ${fx(y + b * 1.0)} ${fx(x)} ${fx(y + b * 1.1)} Q${fx(x - b * 0.8)} ${fx(y + b * 1.0)} ${fx(x - b * 1.1)} ${fx(y + b * 0.2)}Z" fill="${c}"/><path d="M${fx(x - b * 0.9)} ${fx(y - b * 0.8)} l${fx(-b * 0.4)} ${fx(-b * 0.55)} l${fx(b * 0.7)} ${fx(b * 0.2)}Z" fill="${c}"/>${hi}`;
    if (P.seedShape === 'grain') return `<path d="M${fx(x - b * 0.9)} ${fx(y - b * 0.9)} Q${x} ${fx(y - b * 1.25)} ${fx(x + b * 0.9)} ${fx(y - b * 0.9)} L${fx(x + b * 1.05)} ${fx(y + b * 0.4)} Q${x} ${fx(y + b * 1.3)} ${fx(x - b * 1.05)} ${fx(y + b * 0.4)}Z" fill="${c}"/><ellipse cx="${x}" cy="${fx(y + b * 0.1)}" rx="${fx(b * 0.35)}" ry="${fx(b * 0.55)}" fill="#E4A91A" opacity=".7"/>${hi}`;
    if (P.seedShape === 'flat') return `<ellipse cx="${x}" cy="${y}" rx="${fx(b * 1.5)}" ry="${fx(b * 0.9)}" fill="${c}" stroke="#B9A57A" stroke-width="1"/><path d="M${fx(x - b * 1.2)} ${fx(y - b * 0.3)} q${fx(b * 1.2)} ${fx(b * 0.5)} ${fx(b * 2.4)} 0" stroke="#fff" stroke-width="1" fill="none" opacity=".55"/>${hi}`;
    return `<ellipse cx="${x}" cy="${y}" rx="${fx(b * 1.1)}" ry="${fx(b)}" fill="${c}"/>${hi}`;
  }
  function seedSVG(pid, p, x, y) {
    const P = PLANTS[pid], b = 6.5 * P.seedSize * (1 + 0.45 * smooth(0, 0.18, p)), cream = '#F6EDC8', epi = P.germ === 'epigeal';
    const rise = epi ? -20 * smooth(0.55, 0.85, p) : 0;
    let g = '';
    if (p >= 0.3) {
      const lr = 34 * smooth(0.3, 0.95, p);
      g += `<path d="M${x} ${fx(y + b * 0.6)} q-4 ${fx(lr * 0.5)} 2 ${fx(lr)}" stroke="${cream}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      if (p > 0.5) for (let i = 1; i <= 4; i++) { const yy = y + b * 0.6 + lr * (i / 5); g += `<path d="M${fx(x - 0.8)} ${fx(yy)} l-4 2 M${fx(x + 0.4)} ${fx(yy + 1)} l4 2" stroke="#fff" stroke-width=".9"/>`; }
    }
    const sy = y + rise;
    if (p >= 0.55) {
      const ls = 28 * smooth(0.55, 0.95, p);
      if (epi) g += `<path d="M${x} ${fx(y + b * 0.6)} L${x} ${fx(sy)}" stroke="#DDE9A1" stroke-width="3.2" stroke-linecap="round"/>`;
      else {
        const hook = p < 0.8, by = y - b * 0.8;
        g += hook ? `<path d="M${x} ${fx(by)} q0 ${fx(-ls)} ${fx(ls * 0.4)} ${fx(-ls * 0.6)}" stroke="#D3E58D" stroke-width="3" fill="none" stroke-linecap="round"/>` : `<path d="M${x} ${fx(by)} L${x} ${fx(by - ls)}" stroke="#BCD96E" stroke-width="3" stroke-linecap="round"/>`;
        if (p > 0.85) g += tipLeaves(pid, x, by - ls, -25, 14, P.col) + tipLeaves(pid, x, by - ls, 25, 14, P.col);
      }
    }
    if (p >= 0.18 && p < 0.35) g += seedBody(P, x, sy, b) + `<path d="M${fx(x - b)} ${fx(sy + b * 0.1)} l${fx(b * 0.7)} ${fx(-b * 0.3)} l${fx(b * 0.5)} ${fx(b * 0.35)} l${fx(b * 0.7)} ${fx(-b * 0.2)}" stroke="#F6EDC8" stroke-width="1.6" fill="none"/>`;
    else if (epi && p > 0.85) {
      g += `<ellipse cx="${fx(x - 6)}" cy="${fx(sy)}" rx="${fx(b * 0.9)}" ry="${fx(b * 0.55)}" fill="#8CC152" transform="rotate(-28 ${fx(x - 6)} ${fx(sy)})"/><ellipse cx="${fx(x + 6)}" cy="${fx(sy)}" rx="${fx(b * 0.9)}" ry="${fx(b * 0.55)}" fill="#8CC152" transform="rotate(28 ${fx(x + 6)} ${fx(sy)})"/>`;
      g += `<path d="M${x} ${fx(sy)} L${x} ${fx(sy - 12)}" stroke="#BCD96E" stroke-width="2.4"/>` + tipLeaves(pid, x, sy - 12, -28, 14, P.col) + tipLeaves(pid, x, sy - 12, 28, 14, P.col);
    } else g += seedBody(P, x, sy, b);
    return g;
  }
  function germStage(p) { return p >= 0.85 ? T2('Seedling', 'पौधा') : p >= 0.6 ? T2('Shoot out', 'तना निकला') : p >= 0.35 ? T2('Root out', 'जड़ निकली') : p >= 0.15 ? T2('Swelling', 'फूल रहा') : T2('Dry seed', 'सूखा बीज'); }
  const NEED = { water: T2('Needs water', 'पानी चाहिए'), air: T2('Needs air', 'हवा चाहिए'), temperature: T2('Needs warmth', 'गर्मी चाहिए') };
  function sceneGerm(S, X) {
    const N = S.pots.length, cw = 420 / N, P = PLANTS[S.plant], hasLight = S.vars.includes('light');
    let s = `<rect width="420" height="330" fill="url(#pl-wall)"/><rect y="254" width="420" height="76" fill="url(#pl-bench)"/><rect y="254" width="420" height="4" fill="#fff" opacity=".4"/>`;
    S.pots.forEach((pot, i) => {
      const cx = cw * (i + 0.5), v = pot.v, sel = i === S.sel, jw = Math.min(84, cw - 22), jx = cx - jw / 2, jy = 70, jh = 184;
      const flooded = v.water > 88, lowAir = v.air < 15, dry = v.water < 20, cold = v.temperature < 12, hot = v.temperature > 38, dark = hasLight && v.light < 8;
      const gr = germ(P, v);
      let g = selRing(cx - cw / 2 + 3, 6, cw - 6, 320, sel, POTCOL[i % POTCOL.length]);
      const wet = flooded || lowAir;
      g += `<clipPath id="pl-jc${i}"><rect x="${fx(jx)}" y="${jy}" width="${fx(jw)}" height="${jh}" rx="12"/></clipPath><g clip-path="url(#pl-jc${i})">`;
      g += `<rect x="${fx(jx)}" y="${jy}" width="${fx(jw)}" height="${jh}" fill="#F8FBFF"/>`;
      g += `<rect x="${fx(jx)}" y="190" width="${fx(jw)}" height="${jy + jh - 190}" fill="${dry ? '#EADFC8' : '#D5E6F3'}"/>`;
      for (let k = 0; k < 9; k++) g += `<circle cx="${fx(jx + 8 + ((k * 37) % Math.max(10, jw - 16)))}" cy="${200 + ((k * 23) % 48)}" r="${6 + (k % 3) * 2}" fill="#fff" opacity=".55"/>`;
      if (!dry && !wet) g += `<rect x="${fx(jx)}" y="236" width="${fx(jw)}" height="${jy + jh - 236}" fill="#53B5EC" opacity=".45"/>` + [0, 1, 2].map((k) => dropSVG(jx + 16 + k * (jw - 32) / 2, 244, 0.8, '#38BDF8')).join('');
      if (wet) g += `<rect x="${fx(jx)}" y="${jy + 22}" width="${fx(jw)}" height="${jh - 22}" fill="url(#pl-water)" opacity=".78"/>`;
      if (lowAir) g += `<rect x="${fx(jx)}" y="${jy + 22}" width="${fx(jw)}" height="12" fill="#E9B824" opacity=".92"/>`;
      g += `</g>`;
      g += seedSVG(S.plant, pot.p, cx - jw * 0.2, 202) + seedSVG(S.plant, Math.max(0, pot.p - 0.03), cx + jw * 0.2, 206);
      g += `<rect x="${fx(jx)}" y="${jy}" width="${fx(jw)}" height="${jh}" rx="12" fill="url(#pl-glass)" stroke="#8FA9C4" stroke-width="2"/>`;
      g += `<rect x="${fx(jx - 3)}" y="${jy - 6}" width="${fx(jw + 6)}" height="9" rx="4" fill="#CFE0F0" stroke="#8FA9C4"/>`;
      if (lowAir) g += `<rect x="${fx(cx - jw * 0.3)}" y="${jy - 20}" width="${fx(jw * 0.6)}" height="18" rx="4" fill="#C58B4B" stroke="#8B5A2B"/>`;
      if (cold) { g += `<rect x="${fx(jx)}" y="${jy}" width="${fx(jw)}" height="${jh}" rx="12" fill="#9AD1FF" opacity=".28"/>`; for (let k = 0; k < 7; k++) { const fxx = jx + 8 + ((k * 29) % Math.max(10, jw - 16)), fy = jy + 14 + ((k * 41) % 150); g += `<path d="M${fxx - 4} ${fy} h8 M${fxx} ${fy - 4} v8 M${fxx - 3} ${fy - 3} l6 6 M${fxx + 3} ${fy - 3} l-6 6" stroke="#fff" stroke-width="1.4"/>`; } }
      if (hot) { g += `<rect x="${fx(jx)}" y="${jy}" width="${fx(jw)}" height="${jh}" rx="12" fill="#FF9B7A" opacity=".22"/>`; for (let k = 0; k < 3; k++) g += `<path d="M${fx(jx + 12 + k * jw / 3)} ${jy - 14} q4 -6 0 -12 q-4 -6 0 -12" stroke="#E5533D" stroke-width="2" fill="none" stroke-linecap="round"/>`; }
      if (dark) g += `<rect x="${fx(cx - cw / 2 + 5)}" y="8" width="${fx(cw - 10)}" height="316" rx="14" fill="#0B1230" opacity=".5"/>`;
      else if (hasLight) g += sunSVG(cx + jw * 0.5, 40, v.light, false);
      const stage = pot.p >= 0.05 || S.day > 0 ? (gr.rate === 0 && pot.p < 0.35 && S.day > 0.5 ? T2(NEED[gr.why].en, NEED[gr.why].hi) : germStage(pot.p)) : germStage(0);
      const bad = gr.rate === 0 && pot.p < 0.35 && S.day > 0.5;
      g += `<text x="${fx(cx)}" y="276" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" stroke="#7A4A1E" stroke-width="3" paint-order="stroke">${esc(X.t(T2('Jar ', 'जार ')) + (i + 1))}</text>`;
      g += pill(cx, 300, X.t(stage), bad ? '#B42318' : pot.p >= 0.35 ? '#0F766E' : '#475569', '#fff', 10.5, X.lang);
      s += `<g data-svgpot="${i + 1}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(X.t(T2('Jar ', 'जार ')) + (i + 1) + ': ' + X.t(stage))}">${g}</g>`;
    });
    return { main: s, vb: [420, 330], aux: seedAnatomy(S, X) };
  }
  function seedAnatomy(S, X) {
    const P = PLANTS[S.plant], mono = P.cls === 'monocot', c = P.seedCol;
    const part = (k, inner) => `<g data-svgpart="${k}" role="button" tabindex="0" aria-label="${esc(X.t(partName(k, 'germination', S.plant)))}" class="${S.selPart === k ? 'pl-hl' : ''}">${inner}</g>`;
    const lab = (k, x, y, tx, ty) => `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="#334155" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="2.6" fill="#334155"/>` + pill(tx + (tx > 210 ? 56 : -56), ty, X.t(partName(k, 'germination', S.plant)), '#fff', '#1E293B', 11, X.lang);
    let s = `<rect width="420" height="250" fill="url(#pl-wall)"/>`;
    s += `<text x="210" y="24" text-anchor="middle" font-size="14" font-weight="800" fill="#1E293B">${esc(X.t(T2('Inside a ', 'अंदर से देखो: ')) + X.t(P.n).toLowerCase() + X.t(T2(' seed', ' का बीज')))}</text>`;
    if (!mono) {
      s += part('seed-coat', `<path d="M110 130 C110 60 310 60 310 130 C310 200 110 200 110 130Z" fill="${c}" stroke="#5B3A2A" stroke-width="3"/>`);
      s += part('cotyledon', `<path d="M122 130 C122 78 206 78 206 130 C206 182 122 182 122 130Z" fill="#F7E7B4" stroke="#C9B26A" stroke-width="2"/><path d="M214 130 C214 78 298 78 298 130 C298 182 214 182 214 130Z" fill="#F7E7B4" stroke="#C9B26A" stroke-width="2"/>`);
      s += part('radicle', `<path d="M200 150 q-14 18 -30 20 q10 -22 24 -40z" fill="#E8C770" stroke="#B9902D" stroke-width="2"/>`);
      s += part('plumule', `<path d="M204 128 q2 -32 12 -34 q8 16 -2 36z" fill="#7CC050" stroke="#3F8A2A" stroke-width="2"/>`);
      s += lab('seed-coat', 130, 100, 60, 56) + lab('cotyledon', 150, 150, 60, 170) + lab('radicle', 172, 166, 130, 224) + lab('plumule', 211, 100, 330, 56);
    } else {
      s += part('seed-coat', `<path d="M120 70 Q210 40 300 70 L318 160 Q210 232 102 160Z" fill="${c}" stroke="#B07E10" stroke-width="3"/>`);
      s += part('endosperm', `<path d="M136 84 Q210 62 284 84 L298 152 Q210 212 122 152Z" fill="#FFF3C9" stroke="#E0C471" stroke-width="2"/>`);
      s += part('cotyledon', `<path d="M214 100 q30 4 36 40 q-4 36 -34 44 q-14 -40 -2 -84z" fill="#F4D77A" stroke="#C69A1F" stroke-width="2"/>`);
      s += part('plumule', `<path d="M190 150 q-4 -30 8 -52 q12 22 4 52z" fill="#7CC050" stroke="#3F8A2A" stroke-width="2"/>`);
      s += part('radicle', `<path d="M184 164 q-2 22 10 34 q10 -12 8 -36z" fill="#E8C770" stroke="#B9902D" stroke-width="2"/>`);
      s += lab('seed-coat', 126, 78, 56, 52) + lab('endosperm', 150, 140, 56, 150) + lab('cotyledon', 244, 130, 336, 120) + lab('plumule', 194, 108, 334, 56) + lab('radicle', 192, 190, 330, 214);
    }
    return s;
  }

  // ---------------------------------------------------------------- TROPISM
  function sceneTrop(S, X) {
    const t = S.t, vL = S.pots[0].v.light, vW = S.pots[0].v.water, P = PLANTS[S.plant];
    const th = { photo: tropAngle.photo(t, vL), geo: tropAngle.geo(t), hydro: tropAngle.hydro(t, vW), thigmo: tropAngle.thigmo(t) };
    S.ang = th;
    const cells = [[5, 5], [215, 5], [5, 200], [215, 200]];
    const names = [T2('Towards light', 'प्रकाश की ओर'), T2('Up and down', 'ऊपर और नीचे'), T2('Towards water', 'पानी की ओर'), T2('Climbing', 'चढ़ना')];
    let s = `<rect width="420" height="395" fill="url(#pl-wall)"/>`;
    const seedlingLeaves = (x, y, a, n) => tipLeaves(S.plant, x, y, -a, n, P.col) + tipLeaves(S.plant, x, y, a, n, P.col);
    cells.forEach((c, i) => {
      const ox = c[0], oy = c[1], sel = S.sel === i;
      let g = `<rect x="${ox}" y="${oy}" width="200" height="190" rx="16" fill="#fff" fill-opacity=".72" stroke="${sel ? POTCOL[i] : '#D4DCEE'}" stroke-width="${sel ? 4 : 1.5}"/>`;
      if (i === 0) {
        const bx = ox + 120, by = oy + 124, r = th.photo * Math.PI / 180, Ln = 56;
        const tx = bx - Math.sin(r) * Ln, ty = by - 8 - Math.cos(r) * Ln;
        const lamp = ox + 28, ly = oy + 78, k = clamp(vL / 100, 0, 1);
        g += `<circle cx="${lamp}" cy="${ly}" r="32" fill="url(#pl-glow)" opacity="${fx(k)}"/>`;
        for (let a = 0; a < 3; a++) g += `<path d="M${lamp + 12} ${ly + (a - 1) * 10} L${bx - 14} ${by - 52 + a * 16}" stroke="#F5B90A" stroke-width="2" stroke-dasharray="5 5" opacity="${fx(0.15 + 0.7 * k)}"/>`;
        g += `<circle cx="${lamp}" cy="${ly}" r="10" fill="${k > 0 ? '#FFD23F' : '#CBD5E1'}" stroke="#F5B90A" stroke-width="2"/><rect x="${lamp - 4}" y="${ly + 9}" width="8" height="10" fill="#64748B"/>`;
        g += potSVG(bx, by, 50, '#5A3A26', 50);
        g += `<path d="M${bx} ${by - 8} Q${bx} ${fx(by - 8 - Ln * 0.55)} ${fx(tx)} ${fx(ty)}" fill="none" stroke="#6DB44A" stroke-width="4.4" stroke-linecap="round"/>` + seedlingLeaves(tx, ty, 38, 18);
        const nd = Math.round(th.photo / 60 * 9) + (t > 0 ? 1 : 0);
        for (let j = 0; j < nd; j++) { const u = (j + 1) / (nd + 1); g += `<circle cx="${fx(lerp(bx, tx, u) + 5.5)}" cy="${fx(lerp(by - 8, ty, u))}" r="1.9" fill="#FF7A1A" stroke="#fff" stroke-width=".6"/>`; }
        if (nd > 2) g += `<text x="${ox + 192}" y="${oy + 46}" text-anchor="end" font-size="9.5" font-weight="700" fill="#C2410C">${esc(X.t(T2('auxin on shaded side', 'छाया वाली तरफ़ ऑक्सिन')))}</text>`;
      } else if (i === 1) {
        const fxx = ox + 76, fy = oy + 108;
        g += `<rect x="${ox + 14}" y="${oy + 72}" width="62" height="72" rx="9" fill="url(#pl-pot)"/><ellipse cx="${fxx}" cy="${fy}" rx="7" ry="33" fill="#5A3A26"/>`;
        const trace = (y0, dir, len, ang) => { let x = fxx, y = y0, d = `M${fx(x)} ${fx(y)} `; const n = 14; for (let j = 0; j < n; j++) { const a = (ang * Math.pow((j + 1) / n, 1.3)) * Math.PI / 180; x += Math.cos(a) * len / n; y += dir * Math.sin(a) * len / n; d += `L${fx(x)} ${fx(y)} `; } return [d, x, y]; };
        const sh = trace(fy - 10, -1, 56, th.geo), rt = trace(fy + 10, 1, 56, th.geo);
        g += `<path d="${rt[0]}" fill="none" stroke="#F6EDC8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${sh[0]}" fill="none" stroke="#6DB44A" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>` + seedlingLeaves(sh[1], sh[2], 40, 16);
        g += `<path d="M${ox + 172} ${oy + 78} v36 m-6 -8 l6 9 l6 -9" stroke="#334155" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="${ox + 172}" y="${oy + 134}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${esc(X.t(T2('gravity', 'गुरुत्व')))}</text>`;
      } else if (i === 2) {
        const sx = ox + 100, sy = oy + 70, k = clamp(vW / 100, 0, 1);
        g += `<rect x="${ox + 14}" y="${sy}" width="172" height="104" rx="10" fill="#D8B98A"/><rect x="${ox + 100}" y="${sy}" width="86" height="104" fill="#6B4630"/><rect x="${ox + 100}" y="${sy}" width="86" height="104" fill="#3B82C4" opacity="${fx(0.45 * k)}"/>`;
        for (let j = 0; j < Math.round(k * 8); j++) g += dropSVG(ox + 114 + (j % 4) * 19, sy + 22 + Math.floor(j / 4) * 40, 0.9, '#7CCBF5');
        let x = sx, y = sy, d = `M${sx} ${sy} `;
        const n = 16;
        for (let j = 0; j < n; j++) { const a = (th.hydro * Math.pow((j + 1) / n, 1.2)) * Math.PI / 180; x += Math.sin(a) * 80 / n; y += Math.cos(a) * 80 / n; d += `L${fx(x)} ${fx(y)} `; }
        g += `<path d="${d}" fill="none" stroke="#F6EDC8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M${sx} ${sy} L${sx} ${sy - 24}" stroke="#6DB44A" stroke-width="4" stroke-linecap="round"/>` + seedlingLeaves(sx, sy - 24, 40, 16);
        g += `<text x="${ox + 56}" y="${oy + 184}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${esc(X.t(T2('dry', 'सूखी')))}</text><text x="${ox + 143}" y="${oy + 184}" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">${esc(X.t(T2('wet', 'गीली')))}</text>`;
      } else {
        const sx = ox + 116, base = oy + 156, c = th.thigmo;
        g += `<path d="M${ox + 60} ${base} h112 v16 h-112z" fill="#8B5A3C"/>`;
        let back = '', front = '';
        const N = Math.max(0, Math.floor(c * 14)), pts = [];
        for (let j = 0; j <= N; j++) { const ph = j * (Math.PI * 2 / 14); pts.push([sx + 10 * Math.cos(ph), base - 3 - j * 1.9, Math.sin(ph) > 0]); }
        for (let j = 1; j < pts.length; j++) { const seg = `M${fx(pts[j - 1][0])} ${fx(pts[j - 1][1])} L${fx(pts[j][0])} ${fx(pts[j][1])} `; if (pts[j][2]) front += seg; else back += seg; }
        const topP = pts.length ? pts[pts.length - 1] : [sx - 14, base];
        g += `<path d="${back}" stroke="#6DB44A" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="${sx - 3.5}" y="${oy + 40}" width="7" height="${base - oy - 40}" rx="3" fill="#A9783F"/><path d="${front}" stroke="#78C255" stroke-width="4.4" fill="none" stroke-linecap="round"/>`;
        if (c < 0.05) g += `<path d="M${sx - 28} ${base} Q${sx - 30} ${base - 36} ${sx - 24} ${base - 64}" stroke="#6DB44A" stroke-width="4" fill="none" stroke-linecap="round"/>` + seedlingLeaves(sx - 24, base - 64, 35, 14);
        else g += `<path d="M${fx(topP[0])} ${fx(topP[1])} q${fx(8 + Math.sin(S.clock * 2) * 2)} -12 ${fx(12)} -24" stroke="#78C255" stroke-width="3.6" fill="none" stroke-linecap="round"/>` + seedlingLeaves(topP[0] + 12, topP[1] - 24, 40, 13);
        g += `<path d="M${sx - 28} ${base} L${fx(pts.length ? pts[0][0] : sx)} ${base - 3}" stroke="#6DB44A" stroke-width="4" stroke-linecap="round"/>`;
      }
      s += `<g data-svgpot="${i + 1}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(X.t(names[i]))}">${g}${pill(ox + 100, oy + 18, X.t(names[i]), POTCOL[i], '#fff', 12, X.lang)}</g>`;
    });
    return { main: s, vb: [420, 395] };
  }

  // ---------------------------------------------------------------- PHOTOSYNTHESIS
  function scenePhoto(S, X) {
    const v = S.pots[0].v, pr = S.pr, k = clamp(v.light / 100, 0, 1), P = PLANTS[S.plant];
    let s = `<rect width="420" height="330" fill="url(#pl-wall)"/><rect y="288" width="420" height="42" fill="url(#pl-bench)"/><rect y="288" width="420" height="4" fill="#fff" opacity=".4"/>`;
    // lamp and beam
    s += `<polygon points="84,${150 - 16} 150,70 150,262 84,${150 + 16}" fill="#FFE680" opacity="${fx(0.05 + 0.3 * k)}"/>`;
    s += `<rect x="40" y="170" width="10" height="118" fill="#64748B"/><rect x="26" y="284" width="38" height="6" rx="3" fill="#475569"/><path d="M40 150 L88 134 L88 166 Z" fill="#334155"/>`;
    s += `<circle cx="84" cy="150" r="${fx(14 + 18 * k)}" fill="url(#pl-glow)" opacity="${fx(0.25 + 0.75 * k)}"/><circle cx="84" cy="150" r="9" fill="${k > 0.02 ? '#FFE15C' : '#CBD5E1'}" stroke="#F5B90A" stroke-width="2"/>`;
    for (let i = 0; i < 5; i++) s += `<line x1="96" y1="${150 + (i - 2) * 22}" x2="${fx(130 + 14 * k)}" y2="${150 + (i - 2) * 30}" stroke="#F5B90A" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="6 6" opacity="${fx(0.1 + 0.8 * k)}"/>`;
    // beaker
    s += `<rect x="150" y="70" width="180" height="214" rx="10" fill="url(#pl-water)" opacity=".88"/>`;
    for (let i = 0; i < Math.round(v.air / 12); i++) s += `<circle cx="${160 + ((i * 53) % 160)}" cy="${250 + ((i * 17) % 30)}" r="1.8" fill="#fff" opacity=".9"/>`;
    s += `<path d="M150 44 L150 274 Q150 284 160 284 L320 284 Q330 284 330 274 L330 44" fill="url(#pl-glass)" stroke="#8FA9C4" stroke-width="3"/><path d="M146 44 h8 M326 44 h8" stroke="#8FA9C4" stroke-width="3"/><rect x="158" y="80" width="6" height="160" rx="3" fill="#fff" opacity=".4"/>`;
    // funnel, plant, test tube
    s += `<path d="M205 256 L291 256 L255 200 L255 150 L241 150 L241 200 Z" fill="#fff" fill-opacity=".35" stroke="#8FA9C4" stroke-width="2.4" stroke-linejoin="round"/>`;
    const gh = 4 + S.gas * 70;
    s += `<g><rect x="231" y="92" width="34" height="86" rx="17" fill="#CDEBFF" fill-opacity=".55" stroke="#8FA9C4" stroke-width="2.4"/><rect x="233" y="94" width="30" height="${fx(gh)}" rx="14" fill="#fff" opacity="${fx(S.gas > 0.01 ? 0.88 : 0)}"/>${S.gas > 0.12 ? `<text x="248" y="${fx(98 + gh / 2)}" text-anchor="middle" font-size="10" font-weight="800" fill="#0369A1">O₂</text>` : ''}</g>`;
    s += `<g data-svgpart="oxygen" role="button" tabindex="0" aria-label="${esc(X.t(PI.oxygen[0]))}" class="${S.selPart === 'oxygen' ? 'pl-hl' : ''}"><rect x="229" y="90" width="38" height="90" fill="transparent"/></g>`;
    for (let i = 0; i < 7; i++) {
      const bx = 218 + i * 9, h = 24 + (i % 3) * 8;
      s += `<path d="M${bx} 276 q${i % 2 ? 6 : -6} ${-h / 2} 0 ${-h} q${i % 2 ? -5 : 5} ${-h / 2} ${i % 2 ? 4 : -4} ${-h * 0.8}" stroke="#2F9A4A" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      for (let j = 1; j <= 3; j++) s += `<path d="M${bx + (i % 2 ? 1 : -1)} ${276 - j * h * 0.55} l${j % 2 ? 6 : -6} -3 M${bx} ${276 - j * h * 0.55} l${j % 2 ? -5 : 5} -3" stroke="#3FB55C" stroke-width="1.8" stroke-linecap="round"/>`;
    }
    S.bub.forEach((b) => { s += `<circle cx="${fx(b.x)}" cy="${fx(b.y)}" r="${fx(b.r)}" fill="#fff" fill-opacity=".8" stroke="#7DC8F0" stroke-width="1"/>`; });
    // thermometer
    const th = clamp((v.temperature - 5) / 40, 0, 1);
    s += `<rect x="346" y="76" width="12" height="150" rx="6" fill="#fff" stroke="#94A3B8" stroke-width="2"/><rect x="350" y="${fx(226 - 148 * th)}" width="4" height="${fx(148 * th + 6)}" rx="2" fill="#DC2626"/><circle cx="352" cy="236" r="10" fill="#DC2626" stroke="#94A3B8" stroke-width="2"/><text x="352" y="262" text-anchor="middle" font-size="12" font-weight="800" fill="#1E293B">${v.temperature}°C</text>`;
    s += pill(78, 206, X.t(T2('Lamp', 'लैंप')), '#334155', '#fff', 11, X.lang) + pill(212, 304, X.t(T2('Hydrilla (water plant)', 'हाइड्रिला (जलीय पौधा)')), '#0F766E', '#fff', 11, X.lang) + `<path d="M248 38 L248 90" stroke="#0369A1" stroke-width="1.6" stroke-dasharray="4 4"/>` + pill(248, 24, X.t(T2('Oxygen gas collects here', 'ऑक्सीजन गैस यहाँ जमा होती है')), '#fff', '#0369A1', 11, X.lang);
    return { main: s, vb: [420, 330], aux: leafCS(S, X, P) };
  }
  function leafCS(S, X, P) {
    const pr = S.pr, v = S.pots[0].v, k = pr.rate, kl = clamp(v.light / 100, 0, 1), ph = S.running ? (S.clock * 0.45) % 1 : 0.35;
    const part = (key, inner) => `<g data-svgpart="${key}" role="button" tabindex="0" aria-label="${esc(X.t(PI[key][0]))}" class="${S.selPart === key ? 'pl-hl' : ''}">${inner}</g>`;
    const leaf = mixHex('#8FD36A', P.col, 0.35);
    let s = `<rect width="420" height="300" fill="url(#pl-sky)"/>`;
    s += `<rect x="30" y="82" width="360" height="5" rx="2" fill="#F2D277"/><rect x="30" y="87" width="360" height="22" fill="#D3EDB0" stroke="#A7D07C"/>`;
    for (let i = 1; i < 12; i++) s += `<line x1="${30 + i * 30}" y1="87" x2="${30 + i * 30}" y2="109" stroke="#A7D07C"/>`;
    s += `<rect x="30" y="109" width="360" height="54" fill="${leaf}"/>`;
    let chl = '';
    for (let i = 0; i < 12; i++) {
      s += `<rect x="${33 + i * 30}" y="111" width="25" height="50" rx="9" fill="${mixHex(leaf, '#4E9A45', 0.2)}" stroke="#5FA84D"/>`;
      for (let j = 0; j < 3; j++) chl += `<ellipse cx="${45 + i * 30 + ((j * 5) % 7) - 3}" cy="${124 + j * 14}" rx="7" ry="4.6" fill="${k > 0.35 ? '#2F9A3E' : '#2B7D3A'}" stroke="${k > 0.5 ? '#D9FF9A' : '#1F5E2C'}" stroke-width="${k > 0.5 ? 1.6 : 1}"/>`;
    }
    s += `<rect x="30" y="163" width="360" height="59" fill="#B8E39A"/>`;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) s += `<ellipse cx="${55 + c * 44 + (r ? 22 : 0)}" cy="${181 + r * 28}" rx="17" ry="12" fill="#9CD27E" stroke="#6FB257"/>`;
    s += `<rect x="30" y="222" width="360" height="22" fill="#D3EDB0" stroke="#A7D07C"/><rect x="30" y="244" width="360" height="5" rx="2" fill="#F2D277"/>`;
    const open = v.water < 8 ? 0.15 : 0.35 + 0.65 * sat(v.light, 25), gap = 3 + 12 * open;
    s += `<path d="M${fx(270 - gap / 2)} 222 C${fx(246 - gap / 2)} 220 ${fx(246 - gap / 2)} 246 ${fx(270 - gap / 2)} 244 C${fx(266 - gap / 2)} 238 ${fx(266 - gap / 2)} 228 ${fx(270 - gap / 2)} 222Z" fill="#6DBE55" stroke="#3F8A2A" stroke-width="1.6"/><path d="M${fx(270 + gap / 2)} 222 C${fx(294 + gap / 2)} 220 ${fx(294 + gap / 2)} 246 ${fx(270 + gap / 2)} 244 C${fx(274 + gap / 2)} 238 ${fx(274 + gap / 2)} 228 ${fx(270 + gap / 2)} 222Z" fill="#6DBE55" stroke="#3F8A2A" stroke-width="1.6"/>`;
    s += `<rect x="${fx(270 - gap / 2)}" y="221" width="${fx(gap)}" height="24" fill="#F6FBFF"/>`;
    // vein with xylem and phloem
    s += `<circle cx="110" cy="190" r="26" fill="#E8F5D6" stroke="#6FB257" stroke-width="2"/>` + [-8, 0, 8].map((dx) => `<circle cx="${110 + dx}" cy="${180 + Math.abs(dx) * 0.2}" r="5" fill="#5BB6F0" stroke="#2477B0"/>`).join('') + [-9, 9].map((dx) => `<circle cx="${110 + dx}" cy="203" r="4.4" fill="#FFB347" stroke="#C97A12"/>`).join('');
    s += `<text x="110" y="226" text-anchor="middle" font-size="9" font-weight="700" fill="#1E293B">${esc(X.t(T2('vein', 'शिरा')))}</text>`;
    // chloroplasts
    s += part('chloroplast', chl);
    // light rays
    let rays = '';
    const nr = 2 + Math.round(kl * 3);
    for (let i = 0; i < nr; i++) { const x = 70 + i * (300 / nr) + 25; rays += `<line x1="${x - 18}" y1="8" x2="${x}" y2="76" stroke="#FFC400" stroke-width="${fx(2 + 3 * kl)}" stroke-linecap="round" opacity="${fx(0.2 + 0.8 * kl)}"/><path d="M${x - 5} 68 l5 9 l5 -9" fill="none" stroke="#FFC400" stroke-width="2.4" stroke-linecap="round" opacity="${fx(0.2 + 0.8 * kl)}"/>`; }
    s += part('light', `<circle cx="36" cy="26" r="${fx(10 + 7 * kl)}" fill="#FFD23F" stroke="#F5B90A" stroke-width="2" opacity="${fx(0.4 + 0.6 * kl)}"/>${rays}<rect x="60" y="4" width="320" height="76" fill="transparent"/>`);
    // CO2 in, O2 out, water up, glucose
    const sc = clamp(pr.fc, 0.1, 1);
    s += part('co2', `<path d="M256 292 L261 252" stroke="#7C3AED" stroke-width="${fx(2 + 3 * sc)}" stroke-linecap="round" opacity="${fx(0.3 + 0.7 * sc)}"/><path d="M255 258 l6 -10 l5 11" fill="#7C3AED" opacity="${fx(0.3 + 0.7 * sc)}"/>` + pill(236, 284, 'CO₂', '#EDE4FF', '#5B21B6', 11, 'en'));
    s += part('oxygen', `<path d="M286 248 L293 290" stroke="#0891B2" stroke-width="${fx(2 + 3 * k)}" stroke-linecap="round" opacity="${fx(0.3 + 0.7 * Math.min(1, k + 0.15))}"/><path d="M286 280 l7 12 l5 -12" fill="#0891B2" opacity="${fx(0.3 + 0.7 * Math.min(1, k + 0.15))}"/>` + pill(310, 284, 'O₂', '#D5F6FB', '#0E7490', 11, 'en'));
    s += part('water', `<path d="M96 288 L96 232" stroke="#2477B0" stroke-width="${fx(2 + 2.5 * pr.fw)}" stroke-linecap="round"/><path d="M89 240 l7 -12 l7 12" fill="#2477B0"/>` + pill(96, 276, 'H₂O', '#DCEFFF', '#1D4ED8', 11, 'en'));
    s += part('glucose', `<path d="M140 190 L150 200" stroke="#F59E0B" stroke-width="2"/><polygon points="168,184 176,180 184,184 184,194 176,198 168,194" fill="#FFB347" stroke="#C97A12" stroke-width="1.6"/>` + pill(176, 214, X.t(T2('food', 'भोजन')), '#FFF1D6', '#9A5B05', 10.5, X.lang));
    if (S.running && k > 0.02) {
      for (let i = 0; i < 3; i++) {
        const u = (ph + i / 3) % 1;
        s += `<circle cx="${fx(lerp(258, 266, u))}" cy="${fx(lerp(280, 222, u))}" r="3.4" fill="#7C3AED" opacity="${fx(sc)}"/><circle cx="${fx(lerp(286, 292, u))}" cy="${fx(lerp(224, 270, u))}" r="3.4" fill="#06B6D4" opacity="${fx(Math.min(1, k + 0.2))}"/><circle cx="96" cy="${fx(lerp(256, 130, u))}" r="3.4" fill="#2477B0"/><circle cx="${fx(lerp(120, 176, u))}" cy="${fx(lerp(150, 190, u))}" r="3" fill="#F59E0B" opacity="${fx(k)}"/>`;
      }
    }
    s += `<text x="390" y="274" text-anchor="end" font-size="9.5" fill="#355C2D" font-weight="700">${esc(X.t(T2('leaf cut across', 'पत्ती की अनुप्रस्थ काट')))}</text>`;
    return s;
  }

  // ---------------------------------------------------------------- TRANSPIRATION
  function sceneTrans(S, X) {
    const P = PLANTS[S.plant], v = S.pots[0].v, tr = S.tr, k = clamp(v.light / 100, 0, 1), wilt = S.wilt;
    let s = `<rect width="420" height="330" fill="url(#pl-sky)"/><rect y="290" width="420" height="40" fill="url(#pl-bench)"/><rect y="290" width="420" height="4" fill="#fff" opacity=".4"/>`;
    s += sunSVG(382, 44, v.light, false);
    for (let i = 0; i < Math.round(v.air / 20); i++) { const y = 80 + i * 36, off = ((S.clock * 60 + i * 40) % 90) - 20; s += `<path d="M${fx(off)} ${y} h${fx(26 + v.air / 4)}" stroke="#6BA8D6" stroke-width="2.2" stroke-linecap="round" opacity=".6"/><path d="M${fx(off + 26 + v.air / 4)} ${y} q6 0 6 -6" stroke="#6BA8D6" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".6"/>`; }
    const flask = (cx, ml, withLeaves, label) => {
      const wy = 286 - (ml / 100) * 62;
      let g = `<path d="M${cx - 14} 196 L${cx - 14} 226 L${cx - 58} 286 L${cx + 58} 286 L${cx + 14} 226 L${cx + 14} 196Z" fill="#fff" fill-opacity=".35"/>`;
      g += `<clipPath id="pl-fc${cx}"><path d="M${cx - 14} 196 L${cx - 14} 226 L${cx - 58} 286 L${cx + 58} 286 L${cx + 14} 226 L${cx + 14} 196Z"/></clipPath><g clip-path="url(#pl-fc${cx})"><rect x="${cx - 60}" y="${fx(wy)}" width="120" height="${fx(290 - wy)}" fill="#F26B6B" opacity=".75"/><rect x="${cx - 60}" y="${fx(wy - 5)}" width="120" height="6" fill="#E9B824"/></g>`;
      g += `<path d="M${cx - 14} 196 L${cx - 14} 226 L${cx - 58} 286 L${cx + 58} 286 L${cx + 14} 226 L${cx + 14} 196" fill="none" stroke="#8FA9C4" stroke-width="3" stroke-linejoin="round"/><path d="M${cx - 52} 280 L${cx - 20} 232" stroke="#fff" stroke-width="4" opacity=".5" stroke-linecap="round"/>`;
      for (let i = 0; i <= 4; i++) g += `<line x1="${cx + 40 - (4 - i) * 0 - i * 2}" y1="${fx(286 - i * 15.5)}" x2="${cx + 50 - i * 2}" y2="${fx(286 - i * 15.5)}" stroke="#64748B" stroke-width="1.4"/>`;
      g += `<rect x="${cx - 17}" y="188" width="34" height="12" rx="3" fill="#C58B4B" stroke="#8B5A2B"/>`;
      g += `<path d="M${cx} 276 L${cx} 70" stroke="#7A9A4A" stroke-width="5" stroke-linecap="round"/>`;
      if (withLeaves) {
        for (let i = 0; i < 6; i++) {
          const y = 150 - i * 16, side = i % 2 ? 1 : -1, ang = side * lerp(60, 145, wilt);
          g += `<g transform="translate(${cx} ${y}) rotate(${fx(ang)})">${leafSVG(S.plant, 38, { fill: mixHex(P.col, '#C9B458', wilt * 0.6), noVeins: true })}</g>`;
        }
        g += tipLeaves(S.plant, cx, 68, -lerp(25, 110, wilt), 28, mixHex(P.col, '#C9B458', wilt * 0.6)) + tipLeaves(S.plant, cx, 68, lerp(25, 110, wilt), 28, mixHex(P.col, '#C9B458', wilt * 0.6));
        const nv = Math.round(clamp(tr.rate * 2.2, 0, 7));
        for (let i = 0; i < nv; i++) {
          const u = ((S.clock * 0.6 + i / 7) % 1), x = cx - 30 + ((i * 37) % 60) + u * (14 + v.air / 3), y = 70 - u * 52;
          g += `<path d="M${fx(x)} ${fx(y)} q4 -5 0 -10 q-4 -5 0 -10" stroke="#38BDF8" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="${fx(1 - u)}"/>`;
        }
      } else {
        g += `<path d="M${cx} 120 l-14 -12 M${cx} 100 l12 -10 M${cx} 140 l12 -8" stroke="#7A9A4A" stroke-width="3" stroke-linecap="round"/>`;
      }
      g += pill(cx, 20, label, withLeaves ? '#0F766E' : '#64748B', '#fff', 11, X.lang);
      g += pill(cx, 308, X.t(T2('Water: ', 'पानी: ')) + Math.round(ml) + ' ml', '#fff', '#B42318', 11, X.lang);
      return g;
    };
    s += flask(120, S.ml, true, X.t(T2('With leaves', 'पत्तियों सहित')));
    s += flask(300, v.water, false, X.t(T2('No leaves (control)', 'बिना पत्ती (नियंत्रण)')));
    return { main: s, vb: [420, 330], aux: stomaView(S, X) };
  }
  function stomaView(S, X) {
    const tr = S.tr, open = tr.open, g = 3 + 22 * open, cx = 250;
    const part = (key, inner) => `<g data-svgpart="${key}" role="button" tabindex="0" aria-label="${esc(X.t(PI[key][0]))}" class="${S.selPart === key ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="250" fill="url(#pl-sky)"/><rect y="40" width="420" height="82" fill="#A9DB8D"/>`;
    for (let c = 0; c < 6; c++) s += `<ellipse cx="${60 + c * 64}" cy="${80 + (c % 2) * 6}" rx="24" ry="28" fill="#BCE6A0" stroke="#7FBB63"/>`;
    s += `<rect y="122" width="420" height="40" fill="#D3EDB0" stroke="#A7D07C"/>`;
    s += part('stoma', `<rect x="${fx(cx - g / 2)}" y="121" width="${fx(g)}" height="42" fill="#EAF8FF"/><rect x="${fx(cx - 40)}" y="118" width="80" height="48" fill="transparent"/>`);
    s += part('guard-cell', `<path d="M${fx(cx - g / 2)} 122 C${fx(cx - g / 2 - 40)} 112 ${fx(cx - g / 2 - 40)} 172 ${fx(cx - g / 2)} 162 C${fx(cx - g / 2 - 8)} 148 ${fx(cx - g / 2 - 8)} 136 ${fx(cx - g / 2)} 122Z" fill="#69BC52" stroke="#3F8A2A" stroke-width="2"/><path d="M${fx(cx + g / 2)} 122 C${fx(cx + g / 2 + 40)} 112 ${fx(cx + g / 2 + 40)} 172 ${fx(cx + g / 2)} 162 C${fx(cx + g / 2 + 8)} 148 ${fx(cx + g / 2 + 8)} 136 ${fx(cx + g / 2)} 122Z" fill="#69BC52" stroke="#3F8A2A" stroke-width="2"/>` + [0, 1].map((i) => `<ellipse cx="${fx(cx + (i ? 1 : -1) * (g / 2 + 14))}" cy="${142 + i * 4}" rx="4" ry="3" fill="#2E7D32"/>`).join(''));
    // xylem
    s += part('xylem', `<rect x="40" y="40" width="46" height="210" fill="#CFE8FF" stroke="#2477B0" stroke-width="3"/><rect x="40" y="40" width="46" height="210" fill="url(#pl-water)" opacity=".6"/>`);
    for (let i = 0; i < 4; i++) { const y = 232 - (((S.clock * 70 * (0.3 + tr.rate / 3)) + i * 55) % 210); s += `<path d="M63 ${fx(y)} v-18 m-6 7 l6 -9 l6 9" stroke="#1D4ED8" stroke-width="2.6" fill="none" stroke-linecap="round"/>`; }
    s += pill(63, 28, X.t(PI.xylem[0]), '#fff', '#1D4ED8', 11, X.lang);
    // vapour
    const n = Math.round(clamp(tr.rate * 2.4 * (tr.open > 0.3 ? 1 : 0.4), 0, 9));
    let vp = '';
    for (let i = 0; i < Math.max(2, n); i++) { const u = ((S.clock * 0.5 + i / 9) % 1), x = cx + Math.sin(i * 2.1 + u * 6) * (g / 2 + 10), y = 160 + u * 62; vp += `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(3 + u * 2)}" fill="#fff" stroke="#38BDF8" stroke-width="1.6" opacity="${fx((1 - u) * (n ? 1 : 0.3))}"/>`; }
    s += part('vapour', vp + `<rect x="${cx - 44}" y="162" width="88" height="70" fill="transparent"/>`);
    s += pill(cx, 28, X.t(open > 0.6 ? T2('Stoma open', 'रंध्र खुला') : open > 0.3 ? T2('Stoma half open', 'रंध्र आधा खुला') : T2('Stoma shut', 'रंध्र बंद')), open > 0.3 ? '#0F766E' : '#B42318', '#fff', 11, X.lang);
    s += `<text x="372" y="96" text-anchor="end" font-size="10" font-weight="700" fill="#2D5A25">${esc(X.t(T2('inside the leaf', 'पत्ती के अंदर')))}</text><text x="372" y="236" text-anchor="end" font-size="10" font-weight="700" fill="#355C7D">${esc(X.t(T2('air outside', 'बाहर की हवा')))}</text>`;
    return s;
  }

  // ---------------------------------------------------------------- FLOWER
  const FSTAGE = [[0.28, T2('1. Pollination: pollen reaches the stigma', '1. परागण: पराग वर्तिकाग्र तक पहुँचता है')], [0.5, T2('2. The pollen tube grows down', '2. परागनली नीचे बढ़ती है')], [0.62, T2('3. Fertilisation', '3. निषेचन')], [1.01, T2('4. Ovary grows into a fruit', '4. अंडाशय बढ़कर फल बनता है')]];
  function sceneFlower(S, X) {
    const P = PLANTS[S.plant], t = S.t, col = P.flowerCol;
    const wither = smooth(0.6, 0.85, t), grow = smooth(0.62, 1, t), pol = t >= 0.25, tube = smooth(0.28, 0.5, t);
    const part = (key, inner) => `<g data-svgpart="${key}" role="button" tabindex="0" aria-label="${esc(X.t(PI[key][0]))}" class="${S.selPart === key ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="330" fill="url(#pl-sky)"/><circle cx="60" cy="52" r="60" fill="url(#pl-glow)" opacity=".6"/>`;
    s += `<rect x="203" y="284" width="14" height="46" fill="#5CA44F"/>`;
    s += part('sepal', `<path d="M198 280 C172 278 150 266 142 242 C170 246 190 258 204 276Z" fill="#5CA44F" stroke="#3F8A2A" stroke-width="1.6"/><path d="M222 280 C248 278 270 266 278 242 C250 246 230 258 216 276Z" fill="#5CA44F" stroke="#3F8A2A" stroke-width="1.6"/>`);
    s += `<ellipse cx="210" cy="282" rx="26" ry="9" fill="#6DB44A" stroke="#3F8A2A" stroke-width="1.6"/>`;
    const pw = (d, w2) => `<path d="${d}" fill="${col}" stroke="${mixHex(col, '#7A1F3D', 0.35)}" stroke-width="2"/><path d="${d}" fill="url(#pl-petal)"/>`;
    const wo = 1 - wither, dy = 34 * wither;
    s += `<g opacity="${fx(wo)}" transform="translate(0 ${fx(dy)})">` + part('petal',
      pw('M200 268 C148 260 88 200 96 112 C132 142 184 184 210 258Z') + pw('M220 268 C272 260 332 200 324 112 C288 142 236 184 210 258Z')
      + pw('M204 270 C168 262 128 214 134 150 C158 176 192 206 210 262Z') + pw('M216 270 C252 262 292 214 286 150 C262 176 228 206 210 262Z')) + `</g>`;
    // stamens
    const ns = P.stamens === 99 ? 0 : Math.min(P.stamens, 4);
    let st = '', stCover = '';
    const anther = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="12" fill="#F5B90A" stroke="#B7860B" stroke-width="1.6"/>`;
    const pollenDots = (x, y, n) => Array.from({ length: n }, (_, i) => `<circle cx="${fx(x - 5 + (i * 7) % 11)}" cy="${fx(y - 6 + (i * 5) % 12)}" r="1.9" fill="#FFF3A6" stroke="#E0A300" stroke-width=".6"/>`).join('');
    const dep = t < 0.12 ? 7 : 3;
    if (P.stamens === 99) {
      stCover += `<rect x="203" y="138" width="14" height="116" rx="5" fill="#F6C9D6" stroke="#B05577" stroke-width="1.6"/>` + [[-12, 150], [12, 158], [-14, 172], [14, 180], [-11, 194], [11, 200]].map((a) => `<path d="M${210 + Math.sign(a[0]) * 7} ${a[1] + 4} L${210 + a[0]} ${a[1]}" stroke="#B05577" stroke-width="1.6"/>` + anther(210 + a[0] * 1.3, a[1] - 2).replace('rx="8" ry="12"', 'rx="5" ry="7"')).join('');
    } else {
      const defs = [[-1, 168, 146, 205, 270], [1, 252, 146, 215, 270], [-1, 190, 162, 207, 270], [1, 230, 162, 213, 270]];
      for (let i = 0; i < ns; i++) { const d = defs[i]; st += `<path d="M${d[3]} ${d[4]} C${fx(d[3] + d[0] * 18)} 220 ${d[1]} 190 ${d[1]} ${d[2] + 12}" fill="none" stroke="#C9D6A0" stroke-width="3" stroke-linecap="round"/>`; }
    }
    const fil = P.stamens === 99 ? '' : part('filament', st);
    const ant = P.stamens === 99 ? part('anther', stCover) : part('anther', [[168, 146], [252, 146], [190, 162], [230, 162]].slice(0, ns).map((a) => anther(a[0], a[1]) + pollenDots(a[0], a[1], dep)).join(''));
    s += `<g opacity="${fx(wo)}">${fil}${ant}</g>`;
    // pistil
    const oc = mixHex('#BFE08E', P.fruit === 'drupe' ? '#F4B63A' : '#6FBF4A', grow), os = 1 + 0.95 * grow;
    s += part('style', `<rect x="206" y="128" width="8" height="104" rx="4" fill="#C8E6A0" stroke="#7FAE4F" stroke-width="1.4"/>`);
    const stigCol = P.stamens === 99 ? '#E11D48' : '#F59E0B';
    s += part('stigma', `<ellipse cx="210" cy="124" rx="${P.stamens === 99 ? 15 : 11}" ry="8" fill="${stigCol}" stroke="#92400E" stroke-width="1.4"/><ellipse cx="206" cy="121" rx="4" ry="2" fill="#fff" opacity=".6"/>` + (pol ? [0, 1, 2, 3].map((i) => `<circle cx="${203 + i * 5}" cy="${118 + (i % 2) * 3}" r="2.2" fill="#FFF3A6" stroke="#E0A300" stroke-width=".7"/>`).join('') : ''));
    const ovules = [[203, 236], [217, 236], [203, 253], [217, 253]];
    s += `<g transform="translate(210 262) scale(${fx(os)}) translate(-210 -262)">` + part('ovary', `<ellipse cx="210" cy="244" rx="21" ry="29" fill="${oc}" stroke="#5E8F32" stroke-width="2"/>`)
      + part('ovule', ovules.map((o, i) => (t > 0.62 ? `<ellipse cx="${o[0]}" cy="${o[1]}" rx="${fx(4.4 + 2.2 * grow)}" ry="${fx(3.4 + 1.8 * grow)}" fill="${P.seedCol}" stroke="#3E2A1B" stroke-width="1"/>` : `<circle cx="${o[0]}" cy="${o[1]}" r="5.2" fill="#FFF3B0" stroke="#C9A500" stroke-width="1.4"/>`)).join('')) + `</g>`;
    if (tube > 0) {
      const len = 108 * tube;
      s += `<path d="M210 128 L210 232 Q208 240 203 236" fill="none" stroke="#F97316" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${fx(len)} 400"/>`;
    }
    if (t > 0.5 && t < 0.66) { const f = Math.sin(((t - 0.5) / 0.16) * Math.PI); s += `<g opacity="${fx(f)}"><circle cx="203" cy="236" r="${fx(8 + 12 * f)}" fill="url(#pl-glow)"/><path d="M203 222 v28 M189 236 h28 M193 226 l20 20 M213 226 l-20 20" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/></g>`; }
    // bee
    if (t > 0.02 && t < 0.32) {
      const seg = t < 0.1 ? [[392, 50], [176, 140], (t - 0.02) / 0.08] : t < 0.15 ? [[176, 140], [176, 140], 0] : t < 0.25 ? [[176, 140], [210, 112], (t - 0.15) / 0.1] : [[210, 112], [400, 36], (t - 0.25) / 0.07];
      const e = ease(clamp(seg[2], 0, 1)), bx = lerp(seg[0][0], seg[1][0], e), by = lerp(seg[0][1], seg[1][1], e) + Math.sin(S.clock * 30) * 1.5;
      s += `<g transform="translate(${fx(bx)} ${fx(by)})"><ellipse cx="-4" cy="-8" rx="9" ry="4" fill="#fff" opacity=".8" stroke="#94A3B8" transform="rotate(-25 -4 -8)"/><ellipse cx="4" cy="-8" rx="9" ry="4" fill="#fff" opacity=".8" stroke="#94A3B8" transform="rotate(25 4 -8)"/><ellipse cx="0" cy="0" rx="10" ry="6.4" fill="#FFD23F" stroke="#1E293B" stroke-width="1.4"/><path d="M-3 -6 v12 M3 -6 v12" stroke="#1E293B" stroke-width="2.4"/><circle cx="-10" cy="0" r="3.2" fill="#1E293B"/></g>`;
    }
    const lab = (key, ax, ay, side, ly) => {
      if (!(S.selPart === key || S.found.has(key))) return '';
      const px = side < 0 ? 54 : 366;
      return `<line x1="${ax}" y1="${ay}" x2="${side < 0 ? 100 : 320}" y2="${ly}" stroke="#334155" stroke-width="1.3"/><circle cx="${ax}" cy="${ay}" r="3" fill="#334155"/>` + pill(px, ly, X.t(PI[key][0]), '#fff', '#1E293B', 11, X.lang);
    };
    s += lab('petal', 118, 150, -1, 96) + lab('anther', 168, 146, -1, 146) + lab('filament', 180, 214, -1, 200) + lab('sepal', 154, 256, -1, 262)
      + lab('stigma', 218, 122, 1, 62) + lab('style', 214, 178, 1, 142) + lab('ovary', 228, 240, 1, 222) + lab('ovule', 217, 253, 1, 272);
    let sn = FSTAGE.find((a) => t < a[0]);
    s += pill(210, 18, X.t(t <= 0 ? T2('Press play to follow a flower becoming a fruit', 'फूल से फल बनने को देखने के लिए प्ले दबाओ') : sn[1]), t >= 1 ? '#0F766E' : '#1E293B', '#fff', 11, X.lang);
    return { main: s, vb: [420, 330] };
  }

  // ---------------------------------------------------------------- SEED DISPERSAL
  const DISP = {
    dandelion: { agent: T2('Wind', 'हवा'), dist: 0.78, col: '#7AA2D6' },
    maple: { agent: T2('Wind', 'हवा'), dist: 0.6, col: '#7AA2D6' },
    coconut: { agent: T2('Water', 'पानी'), dist: 1, col: '#2F86C9' },
    burr: { agent: T2('Animals', 'जानवर'), dist: 0.86, col: '#B7791F' },
    mango: { agent: T2('Animals (birds, bats)', 'जानवर (पक्षी, चमगादड़)'), dist: 0.68, col: '#B7791F' },
    balsam: { agent: T2('Explosion', 'विस्फोट'), dist: 0.42, col: '#D9467D' },
    pod: { agent: T2('Explosion', 'विस्फोट'), dist: 0.3, col: '#D9467D' },
  };
  function seedIcon(type, x, y, rot, sc) {
    const t = `transform="translate(${fx(x)} ${fx(y)}) rotate(${fx(rot)}) scale(${sc || 1})"`;
    if (type === 'dandelion') return `<g ${t}><path d="M0 0 L0 12" stroke="#6B5B3E" stroke-width="2"/><path d="M0 0 L-11 -9 M0 0 L-6 -13 M0 0 L0 -14 M0 0 L6 -13 M0 0 L11 -9" stroke="#8D9AB5" stroke-width="1.2"/><path d="M-11 -9 Q0 -20 11 -9" fill="#fff" fill-opacity=".7" stroke="#8D9AB5" stroke-width="1"/><circle cx="0" cy="13" r="2.6" fill="#6B5B3E"/></g>`;
    if (type === 'maple') return `<g ${t}><path d="M0 0 C6 -4 18 -8 28 -22 C30 -8 18 4 0 4Z" fill="#E8C27A" stroke="#A9772A" stroke-width="1.4"/><ellipse cx="0" cy="2" rx="5" ry="4" fill="#B9822E" stroke="#7A5416"/></g>`;
    if (type === 'coconut') return `<g ${t}><ellipse cx="0" cy="0" rx="12" ry="14" fill="#9C6B3C" stroke="#5E3F1F" stroke-width="1.6"/><circle cx="-3" cy="-4" r="1.8" fill="#3E2A1B"/><circle cx="3" cy="-4" r="1.8" fill="#3E2A1B"/><circle cx="0" cy="1" r="1.8" fill="#3E2A1B"/></g>`;
    if (type === 'burr') return `<g ${t}><circle r="6" fill="#8D6E2F"/>${Array.from({ length: 10 }, (_, i) => `<path d="M${fx(Math.cos(i * 0.628) * 5)} ${fx(Math.sin(i * 0.628) * 5)} L${fx(Math.cos(i * 0.628) * 10)} ${fx(Math.sin(i * 0.628) * 10)}" stroke="#5E4A18" stroke-width="1.3"/>`).join('')}</g>`;
    if (type === 'mango') return `<g ${t}><ellipse cx="0" cy="0" rx="10" ry="13" fill="#F4B63A" stroke="#B9791A" stroke-width="1.5" transform="rotate(20)"/><path d="M-2 -13 q3 -6 7 -5" stroke="#4E7A2A" stroke-width="2" fill="none"/></g>`;
    if (type === 'balsam' || type === 'pod') return `<g ${t}><ellipse rx="3.6" ry="2.8" fill="${type === 'pod' ? '#8B3A3A' : '#6B4F3A'}" stroke="#2B1B10" stroke-width=".8"/></g>`;
    return '';
  }
  function sceneDisp(S, X) {
    const type = S.selPart || 'dandelion', D = DISP[type], t = S.t, ground = 252, landX = 70 + 290 * D.dist;
    let s = `<rect width="420" height="330" fill="url(#pl-sky)"/>`;
    const sea = type === 'coconut';
    s += `<path d="M0 ${ground} Q100 ${ground - 26} 210 ${ground - 6} T420 ${ground - 10} V330 H0Z" fill="#B7E39C"/><rect y="${ground + 6}" width="420" height="80" fill="url(#pl-ground)" opacity=".92"/>`;
    if (sea) {
      s += `<rect x="130" y="${ground - 8}" width="290" height="90" fill="#4FB4EA"/><path d="M130 ${ground - 8} q18 -7 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/><path d="M386 ${ground - 8} L420 ${ground - 14} V${ground + 82} H386Z" fill="#F2DDA0"/>`;
    }
    // parent
    const parent = () => {
      if (type === 'dandelion') return `<path d="M62 ${ground} L62 190" stroke="#4E9A45" stroke-width="3.4"/>` + (t < 0.08 ? `<circle cx="62" cy="180" r="19" fill="#fff" stroke="#C4CDE0"/>` + Array.from({ length: 12 }, (_, i) => `<path d="M62 180 L${fx(62 + Math.cos(i * 0.52) * 19)} ${fx(180 + Math.sin(i * 0.52) * 19)}" stroke="#AAB6D0"/>`).join('') : `<circle cx="62" cy="184" r="5" fill="#E3D6A5" stroke="#B8A767"/>`);
      if (type === 'maple') return `<rect x="52" y="150" width="14" height="${ground - 150}" fill="#7A5230"/><circle cx="59" cy="118" r="48" fill="#E8793A"/><circle cx="36" cy="136" r="30" fill="#D9602A"/><circle cx="84" cy="136" r="30" fill="#F29548"/>`;
      if (type === 'coconut') return `<path d="M50 ${ground} Q60 170 74 80" stroke="#8B5E34" stroke-width="12" fill="none" stroke-linecap="round"/>` + [[-50, -8], [-24, -24], [10, -20], [40, -6], [-34, 14]].map((a) => `<path d="M74 80 q${a[0] / 2} ${a[1] - 14} ${a[0]} ${a[1] + 10}" stroke="#2E8B3E" stroke-width="7" fill="none" stroke-linecap="round"/>`).join('') + (t < 0.05 ? seedIcon('coconut', 82, 90, 0, 0.8) + seedIcon('coconut', 66, 94, 0, 0.8) : '');
      if (type === 'burr') return `<path d="M48 ${ground} q-4 -50 6 -80 M56 ${ground} q4 -40 22 -64 M52 ${ground} q-14 -34 -26 -50" stroke="#5E8F32" stroke-width="5" fill="none" stroke-linecap="round"/>` + [[54, 172], [80, 192], [26, 202]].map((a) => seedIcon('burr', a[0], a[1], 0, 0.9)).join('');
      if (type === 'mango') return `<rect x="50" y="140" width="18" height="${ground - 140}" fill="#6B4A2B"/><circle cx="58" cy="100" r="54" fill="#2E7D3A"/><circle cx="30" cy="124" r="32" fill="#256B31"/><circle cx="88" cy="124" r="32" fill="#2F8A3F"/>` + (t < 0.05 ? seedIcon('mango', 40, 128, 0, 0.9) + seedIcon('mango', 78, 112, 0, 0.9) : seedIcon('mango', 40, 128, 0, 0.9));
      if (type === 'balsam') return `<path d="M60 ${ground} q-4 -60 4 -112" stroke="#6DB44A" stroke-width="6" fill="none" stroke-linecap="round"/>` + [[46, 190, -30], [78, 172, 30], [50, 150, -24]].map((a) => `<g transform="translate(${a[0]} ${a[1]}) rotate(${a[2]})">${leafSVG('balsam', 34, { fill: '#4DAA57' })}</g>`).join('') + (t < 0.12 ? `<g transform="translate(64 134)"><path d="M0 0 c-6 8 -6 20 0 28 c6 -8 6 -20 0 -28z" fill="#8BC34A" stroke="#4E7A2A" stroke-width="1.6"/></g>` : `<g transform="translate(64 134)"><path d="M0 0 c-12 8 -16 18 -12 26 M0 0 c10 6 18 14 14 24" stroke="#8BC34A" stroke-width="3" fill="none" stroke-linecap="round"/></g>`);
      return `<path d="M60 ${ground} q-4 -60 6 -108" stroke="#6DB44A" stroke-width="5" fill="none" stroke-linecap="round"/>` + [[50, 200, -34], [78, 176, 34]].map((a) => `<g transform="translate(${a[0]} ${a[1]}) rotate(${a[2]})">${leafSVG('bean', 36, { fill: '#3FA34D', noVeins: true })}</g>`).join('') + `<g transform="translate(66 144) rotate(${fx(t < 0.12 ? 8 : 8 + 35 * smooth(0.12, 0.2, t))})"><path d="M0 0 C-4 14 -2 30 4 44" stroke="${t < 0.12 ? '#8B6B3E' : '#6B4F2A'}" stroke-width="9" fill="none" stroke-linecap="round"/></g>`;
    };
    s += parent();
    const sprout = (x) => { const u = smooth(0.9, 1, t); if (u <= 0) return ''; return `<path d="M${fx(x)} ${ground + 2} L${fx(x)} ${fx(ground + 2 - 22 * u)}" stroke="#4E9A45" stroke-width="3" stroke-linecap="round"/>` + tipLeaves('bean', x, ground + 2 - 22 * u, -40, 12 * u + 1, '#4DAA57') + tipLeaves('bean', x, ground + 2 - 22 * u, 40, 12 * u + 1, '#4DAA57'); };
    if (type === 'dandelion' || type === 'maple') {
      const e = ease(clamp(t / 0.9, 0, 1)), x = lerp(66, landX, e), y0 = type === 'maple' ? 170 : 180;
      const y = lerp(y0, ground - 8, Math.pow(clamp(t / 0.9, 0, 1), type === 'maple' ? 1.15 : 1.5)) + (type === 'dandelion' ? 12 * Math.sin(t * 16) * (1 - t) : 0);
      s += (t > 0 ? seedIcon(type, x, y, type === 'maple' ? t * 1500 : 12 * Math.sin(t * 12), 1.2) : seedIcon(type, 62, y0, type === 'maple' ? 0 : 0, 1.2)) + sprout(landX);
      for (let i = 0; i < 4; i++) { const off = ((S.clock * 70 + i * 90) % 380) - 20; s += `<path d="M${fx(off)} ${70 + i * 28} h40 q8 0 8 -7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="${t > 0 && t < 0.92 ? 0.85 : 0.35}"/>`; }
      if (type === 'maple' && t === 0) s += seedIcon('maple', 76, 170, 0, 1.2);
    } else if (type === 'coconut') {
      let x, y;
      if (t < 0.18) { const u = t / 0.18; x = lerp(82, 128, u); y = lerp(90, ground - 14, u * u); } else if (t < 0.88) { const u = (t - 0.18) / 0.7; x = lerp(128, landX, u); y = ground - 14 + Math.sin(u * 22) * 3; } else { x = landX; y = ground - 6; }
      s += seedIcon('coconut', t === 0 ? 82 : x, t === 0 ? 90 : y, t > 0.18 ? Math.sin(t * 20) * 8 : 0, 1) + sprout(landX);
      s += `<path d="M130 ${ground + 14} q18 -7 36 0 t36 0 t36 0 t36 0 t36 0 t36 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>`;
    } else if (type === 'burr') {
      const e = ease(clamp(t / 0.85, 0, 1)), ax = lerp(46, landX, e), bob = Math.sin(t * 60) * 1.6, ay = ground - 30 + bob;
      const drop = t > 0.85 ? smooth(0.85, 0.96, t) : 0;
      s += `<g transform="translate(${fx(ax)} ${fx(ay)})"><ellipse cx="0" cy="0" rx="26" ry="13" fill="#C9A06B" stroke="#7A5230" stroke-width="1.6"/><circle cx="26" cy="-6" r="9" fill="#C9A06B" stroke="#7A5230" stroke-width="1.6"/><path d="M30 -14 l5 -8 l2 9" fill="#7A5230"/><circle cx="29" cy="-7" r="1.6" fill="#1E293B"/><path d="M-26 -4 q-12 -8 -14 -20" stroke="#7A5230" stroke-width="3.6" fill="none" stroke-linecap="round"/>${[-16, -4, 14, 24].map((lx, i) => `<path d="M${lx} 10 l${Math.sin(t * 60 + i * 1.6) * 5} 20" stroke="#7A5230" stroke-width="4" stroke-linecap="round"/>`).join('')}</g>`;
      s += seedIcon('burr', ax - 6, ay - 12 + drop * 28, 0, 0.9) + sprout(landX - 6);
    } else if (type === 'mango') {
      let bx, by;
      if (t < 0.55) { const u = t / 0.55; bx = lerp(64, landX - 10, u); by = lerp(96, 70, Math.sin(u * Math.PI)) + lerp(0, 0, u); } else { const u = (t - 0.55) / 0.45; bx = lerp(landX - 10, 410, u); by = 70 - 30 * u; }
      s += `<g transform="translate(${fx(bx)} ${fx(by)})"><ellipse cx="0" cy="0" rx="14" ry="8" fill="#3B6EA8"/><circle cx="14" cy="-3" r="6" fill="#3B6EA8"/><path d="M19 -3 l7 2 l-7 2z" fill="#F59E0B"/><path d="M-12 0 l-14 -4 l4 8z" fill="#2B5486"/><path d="M-2 -2 q${fx(-6)} ${fx(-14 + Math.sin(t * 50) * 6)} ${fx(-16)} -2" stroke="#2B5486" stroke-width="4" fill="none" stroke-linecap="round"/></g>`;
      const sx = t < 0.55 ? bx + 4 : landX - 6, sy = t < 0.55 ? by + 12 : lerp(76, ground - 10, ease(clamp((t - 0.55) / 0.3, 0, 1)));
      s += (t === 0 ? '' : seedIcon('mango', sx, t < 0.55 ? sy : sy, 0, 0.9)) + sprout(landX - 6);
    } else {
      const seeds = type === 'balsam' ? [0.5, 0.7, 0.9, 1, 0.6] : [0.45, 0.8, 0.6, 1];
      const px = type === 'balsam' ? 64 : 68, py = type === 'balsam' ? 136 : 150, u = clamp((t - 0.15) / 0.55, 0, 1);
      seeds.forEach((d, i) => {
        const dx = (landX - 64) * d * (i % 2 ? 1 : 0.9), x = px + dx * ease(u), y = py - 70 * d * 1.1 * 4 * u * (1 - u) + (ground - 8 - py) * u * u;
        if (t >= 0.15) s += seedIcon(type, x, Math.min(y, ground - 6), u * 360, 1.1); else s += seedIcon(type, px + (i - 2) * 3, py + 10 + i * 4, 0, 0.9);
      });
      seeds.forEach((d) => { if (t > 0.9) s += sprout(64 + (landX - 64) * d); });
    }
    // distance bar
    const far = D.dist > 0.8 ? T2('very far from the parent', 'पौधे से बहुत दूर') : D.dist > 0.55 ? T2('far from the parent', 'पौधे से दूर') : T2('a short way from the parent', 'पौधे से थोड़ी दूर');
    s += `<path d="M64 ${ground + 22} L${fx(landX)} ${ground + 22}" stroke="#fff" stroke-width="3" stroke-dasharray="6 6" opacity="${t > 0.6 ? 1 : 0.4}"/><path d="M${fx(landX - 7)} ${ground + 16} l8 6 l-8 6" stroke="#fff" stroke-width="3" fill="none" opacity="${t > 0.6 ? 1 : 0.4}"/>`;
    s += pill(210, 18, X.t(T2('Carried by: ', 'ले जाने वाला: ')) + X.t(D.agent), D.col, '#fff', 12, X.lang) + pill(210, 296, X.t(far), '#fff', '#1E293B', 11, X.lang);
    return { main: s, vb: [420, 330] };
  }

  // ---------------------------------------------------------------- PARTS OF A PLANT
  function fruitSVG(kind, x, y) {
    if (kind === 'pod') return `<path d="M${x} ${y} c4 16 2 34 10 50" stroke="#3F7F2E" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M${x} ${y} c4 16 2 34 10 50" stroke="#7CC255" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    if (kind === 'pod2') return `<ellipse cx="${x}" cy="${y + 17}" rx="11" ry="16" fill="#8BC34A" stroke="#4E7A2A" stroke-width="2"/><path d="M${x - 3} ${y + 31} l3 8 l3 -8z" fill="#4E7A2A"/>`;
    if (kind === 'siliqua') return `<path d="M${x} ${y} c3 14 0 28 6 42" stroke="#4E7A2A" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M${x} ${y} c3 14 0 28 6 42" stroke="#8BC34A" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (kind === 'capsule') return `<path d="M${x} ${y} C${x - 14} ${y + 6} ${x - 14} ${y + 28} ${x} ${y + 40} C${x + 14} ${y + 28} ${x + 14} ${y + 6} ${x} ${y}Z" fill="#A5C25A" stroke="#5E7A2A" stroke-width="2"/><path d="M${x} ${y} V${y + 40} M${x - 6} ${y + 4} Q${x - 7} ${y + 24} ${x} ${y + 40} M${x + 6} ${y + 4} Q${x + 7} ${y + 24} ${x} ${y + 40}" stroke="#5E7A2A" stroke-width="1.2" fill="none"/>`;
    if (kind === 'capsule2') return `<path d="M${x} ${y} c-8 10 -8 24 0 36 c8 -12 8 -26 0 -36z" fill="#8BC34A" stroke="#4E7A2A" stroke-width="2"/>`;
    if (kind === 'drupe') return `<ellipse cx="${x}" cy="${y + 22}" rx="15" ry="21" fill="#F4B63A" stroke="#B9791A" stroke-width="2" transform="rotate(14 ${x} ${y + 22})"/><path d="M${x - 10} ${y + 8} q8 -8 18 -2 q-6 10 -18 2z" fill="#7CB342" opacity=".8"/><path d="M${x} ${y} q2 -8 8 -8" stroke="#4E7A2A" stroke-width="2.4" fill="none"/>`;
    return `<path d="M${x} ${y} v40" stroke="#5E8F32" stroke-width="2.4"/>` + [0, 1, 2, 3, 4].map((i) => `<circle cx="${x + (i % 2 ? 4 : -4)}" cy="${y + 8 + i * 7}" r="2.8" fill="#3E2A1B"/>`).join('');
  }
  function flowerTop(pid, x, y, r) {
    const P = PLANTS[pid], n = P.petals || 5, col = P.flowerCol, dark = mixHex(col, '#6B1D3A', 0.35);
    if (pid === 'tulsi') { let g = `<path d="M${x} ${y + 12} L${x} ${y - 20}" stroke="#7A5C9E" stroke-width="2"/>`; for (let i = 0; i < 6; i++) g += `<ellipse cx="${x + (i % 2 ? 5 : -5)}" cy="${y - 16 + i * 5}" rx="4.4" ry="3" fill="${col}" stroke="${dark}" stroke-width=".9"/>`; return g; }
    if (pid === 'mango') { let g = ''; for (let i = 0; i < 9; i++) g += `<circle cx="${x + Math.cos(i * 2.4) * (4 + i * 1.6)}" cy="${y + Math.sin(i * 2.4) * (3 + i * 1.3)}" r="3.4" fill="${col}" stroke="#C48A2C" stroke-width=".8"/><circle cx="${x + Math.cos(i * 2.4) * (4 + i * 1.6)}" cy="${y + Math.sin(i * 2.4) * (3 + i * 1.3)}" r="1" fill="#E5533D"/>`; return g; }
    let g = '';
    for (let i = 0; i < n; i++) { const a = (i / n) * 360 + (n === 4 ? 45 : 0); g += `<ellipse cx="${x}" cy="${y - r * 0.55}" rx="${fx(r * (n === 4 ? 0.42 : 0.48))}" ry="${fx(r * 0.62)}" fill="${col}" stroke="${dark}" stroke-width="1.2" transform="rotate(${a} ${x} ${y})"/>`; }
    g += `<circle cx="${x}" cy="${y}" r="${fx(r * 0.2)}" fill="${pid === 'hibiscus' ? '#7F1D3A' : '#F5B90A'}"/>`;
    if (pid === 'hibiscus') g += `<path d="M${x} ${y} L${x + r * 0.5} ${y - r * 0.7}" stroke="#F5B90A" stroke-width="3" stroke-linecap="round"/><circle cx="${fx(x + r * 0.5)}" cy="${fx(y - r * 0.7)}" r="3" fill="#E11D48"/>`;
    return g;
  }
  function sceneParts(S, X) {
    const pid = S.plant, P = PLANTS[pid], mono = pid === 'maize', woody = pid === 'mango';
    const part = (k, inner) => `<g data-svgpart="${k}" role="button" tabindex="0" aria-label="${esc(X.t(PI[k][0]))}" class="${S.selPart === k ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="215" fill="url(#pl-sky)"/><circle cx="360" cy="40" r="60" fill="url(#pl-glow)" opacity=".7"/><path d="M0 206 Q100 192 210 204 T420 200 V215 H0Z" fill="#8FD07A"/><rect y="215" width="420" height="145" fill="url(#pl-ground)"/>`;
    // roots
    let rt = '';
    const rstroke = (d, w) => `<path d="${d}" fill="none" stroke="#9C7B3E" stroke-width="${w + 2}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#F1E2B8" stroke-width="${w}" stroke-linecap="round"/>`;
    if (!mono) {
      rt += rstroke('M210 212 C208 250 214 290 206 345', 8);
      ['M209 238 C180 242 160 260 140 290', 'M211 250 C240 254 262 270 282 300', 'M208 272 C188 276 176 296 164 322', 'M210 286 C232 290 244 306 254 332', 'M209 224 C186 224 170 236 150 248', 'M211 230 C236 228 254 238 274 254'].forEach((d) => { rt += rstroke(d, 3.4); });
    } else {
      [[110, 300], [140, 332], [172, 344], [198, 346], [224, 346], [252, 340], [282, 326], [312, 298], [160, 268], [262, 270]].forEach((e) => { rt += rstroke(`M210 214 C${210 + (e[0] - 210) * 0.2} 250 ${210 + (e[0] - 210) * 0.7} ${214 + (e[1] - 214) * 0.5} ${e[0]} ${e[1]}`, 3); });
    }
    s += part('root', rt);
    // stem, branches, leaves
    if (mono) {
      let g = `<rect x="203" y="62" width="14" height="153" rx="6" fill="#74B84E" stroke="#3F8A2A" stroke-width="2"/>` + [200, 164, 128, 94].map((y) => `<rect x="201" y="${y}" width="18" height="5" rx="2" fill="#4E9A45"/>`).join('');
      s += part('stem', g);
      let lv = '';
      [[198, 60, 120], [166, -62, 110], [132, 56, 96], [100, -54, 80]].forEach((a) => { lv += `<g transform="translate(210 ${a[0]}) rotate(${a[1]})">${leafSVG(pid, a[2], { noVeins: false })}</g>`; });
      s += part('leaf', lv);
      s += part('bud', `<path d="M214 202 C226 196 232 186 230 176 C220 182 214 190 214 202Z" fill="#B5E06A" stroke="#4E7A2A" stroke-width="1.6"/>`);
      let tas = ''; for (let i = -3; i <= 3; i++) tas += `<path d="M210 62 Q${210 + i * 8} 40 ${210 + i * 14} 24" stroke="#D9B33A" stroke-width="3" fill="none" stroke-linecap="round"/>` + `<circle cx="${210 + i * 14}" cy="24" r="2.6" fill="#F4D77A"/>`;
      s += part('flower', tas);
      s += part('fruit', `<g transform="translate(236 150) rotate(-16)"><path d="M0 -30 C14 -26 16 24 0 38 C-14 24 -12 -26 0 -30Z" fill="#8BC34A" stroke="#4E7A2A" stroke-width="2"/><path d="M-6 -22 C2 -10 -2 10 0 28" stroke="#6FA83A" stroke-width="2" fill="none"/><path d="M-4 -30 q-8 -14 -18 -16 M0 -32 q2 -14 -2 -22 M4 -30 q10 -10 18 -12" stroke="#E4C76B" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`);
      s += `<circle cx="62" cy="168" r="38" fill="#FFF8E7" stroke="#B9902D" stroke-width="2.4" stroke-dasharray="5 4"/>`;
      s += part('seed', [[-14, -8], [0, -10], [14, -6], [-8, 8], [8, 10]].map((a) => `<path d="M${62 + a[0] - 7} ${168 + a[1] - 6} h14 l1 11 q-8 6 -16 0z" fill="${P.seedCol}" stroke="#B07E10" stroke-width="1.2"/>`).join(''));
    } else {
      s += part('stem', `<path d="M210 216 C206 170 214 120 210 72" fill="none" stroke="${woody ? '#6B4A2B' : '#4E9A45'}" stroke-width="${woody ? 18 : 9}" stroke-linecap="round"/>`);
      s += part('branch', `<path d="M208 150 C180 142 160 128 140 112" fill="none" stroke="${woody ? '#6B4A2B' : '#4E9A45'}" stroke-width="${woody ? 9 : 5}" stroke-linecap="round"/><path d="M212 120 C240 112 258 100 280 86" fill="none" stroke="${woody ? '#6B4A2B' : '#4E9A45'}" stroke-width="${woody ? 9 : 5}" stroke-linecap="round"/>`);
      const Ln = P.form ? 56 : woody ? 70 : P.leaf === 'lobed' ? 52 : 46;
      let lv = '';
      [[211, 200, 64], [209, 180, -64], [212, 160, 60], [162, 128, -58], [176, 136, -92], [256, 100, 52], [240, 108, 90]].forEach((a) => { lv += `<g transform="translate(${a[0]} ${a[1]}) rotate(${a[2]})">${leafSVG(pid, Ln, { fill: mixHex(P.col, '#7FD070', 0.12) })}</g>`; });
      if (woody) lv += [[120, 74, -40], [300, 74, 50], [210, 40, 0]].map((a) => `<g transform="translate(${a[0]} ${a[1]}) rotate(${a[2]})">${leafSVG(pid, 64, {})}</g>`).join('');
      s += part('leaf', lv);
      s += part('bud', `<path d="M210 74 C201 62 205 48 210 42 C215 48 219 62 210 74Z" fill="#A9E06A" stroke="#4E7A2A" stroke-width="1.8"/>`);
      s += part('flower', flowerTop(pid, 282, 80, pid === 'hibiscus' ? 22 : 15));
      s += part('fruit', fruitSVG(P.fruit, 140, 116));
      s += `<path d="M140 126 L90 152" stroke="#B9902D" stroke-width="1.6" stroke-dasharray="4 4"/><circle cx="62" cy="168" r="38" fill="#FFF8E7" stroke="#B9902D" stroke-width="2.4" stroke-dasharray="5 4"/>`;
      let sd = '';
      if (pid === 'mango') sd = `<ellipse cx="62" cy="168" rx="30" ry="22" fill="#F4B63A" stroke="#B9791A" stroke-width="1.6"/><ellipse cx="62" cy="168" rx="19" ry="10" fill="${P.seedCol}" stroke="#A58E5C" stroke-width="1.4"/>`;
      else sd = `<ellipse cx="62" cy="168" rx="30" ry="${P.fruit === 'pod' || P.fruit === 'siliqua' ? 14 : 22}" fill="#BFE08E" stroke="#5E8F32" stroke-width="1.6"/>` + [-16, 0, 16].map((dx, i) => `<ellipse cx="${62 + dx}" cy="${168 + (i % 2 ? 3 : -3)}" rx="${fx(3.4 + 4 * P.seedSize)}" ry="${fx(2.8 + 3.4 * P.seedSize)}" fill="${P.seedCol}" stroke="#3E2A1B" stroke-width="1"/>`).join('');
      s += part('seed', sd);
    }
    // labels
    const A = mono
      ? { root: [226, 262, 370, 292], stem: [217, 200, 370, 214], leaf: [250, 110, 370, 150], bud: [226, 188, 370, 60], flower: [226, 30, 370, 16], fruit: [250, 150, 370, 108], seed: [62, 206, 62, 236] }
      : { root: [216, 262, 372, 292], stem: [212, 192, 372, 214], branch: [250, 106, 372, 124], leaf: [236, 176, 372, 168], bud: [213, 56, 110, 28], flower: [294, 76, 372, 56], fruit: [140, 130, 62, 98], seed: [62, 206, 62, 236] };
    Object.keys(A).forEach((k) => {
      if (!(S.selPart === k || S.found.has(k))) return;
      const a = A[k], right = a[2] > 200, lx = right ? a[2] - 46 : a[2] + 40;
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${k === 'seed' ? a[0] : lx}" y2="${k === 'seed' ? a[3] - 11 : a[3]}" stroke="#1E293B" stroke-width="1.4"/><circle cx="${a[0]}" cy="${a[1]}" r="3" fill="#1E293B"/>` + pill(a[2], a[3], X.t(PI[k][0]), '#fff', '#1E293B', 11.5, X.lang).replace('<g>', '<g>');
    });
    return { main: s, vb: [420, 330 + 30] };
  }

  // ---------------------------------------------------------------- LEAF TYPES
  function leafPieces(pid, Ln) {
    const P = PLANTS[pid], hw = (t) => halfW(P.leaf, t, Ln, 'entire');
    if (P.form === 'trifoliate') {
      const s = Ln * 0.58;
      return { leaflets: [{ shape: 'ovate', len: s, margin: 'entire', tf: `translate(0 ${fx(-Ln * 0.4)})` }, { shape: 'ovate', len: s * 0.8, margin: 'entire', tf: `translate(0 ${fx(-Ln * 0.24)}) rotate(-72)` }, { shape: 'ovate', len: s * 0.8, margin: 'entire', tf: `translate(0 ${fx(-Ln * 0.24)}) rotate(72)` }], rachis: `M0 0 L0 ${fx(-Ln * 0.42)}`, apex: [0, -Ln * 0.4 - s], anch: { lamina: [-s * 0.2, -Ln * 0.4 - s * 0.55], veins: [s * 0.1, -Ln * 0.4 - s * 0.4], midrib: [0, -Ln * 0.3], petiole: [0, 26], margin: [-s * 0.34, -Ln * 0.4 - s * 0.5] } };
    }
    if (P.form === 'pinnate') {
      const L2 = [];
      for (let i = 0; i < 4; i++) { const y = -Ln * (0.2 + i * 0.19), sz = Ln * 0.26; L2.push({ shape: 'oblong', len: sz, margin: 'serrate', tf: `translate(0 ${fx(y)}) rotate(-70)` }, { shape: 'oblong', len: sz, margin: 'serrate', tf: `translate(0 ${fx(y - Ln * 0.04)}) rotate(70)` }); }
      L2.push({ shape: 'oblong', len: Ln * 0.27, margin: 'serrate', tf: `translate(0 ${fx(-Ln * 0.96)})` });
      return { leaflets: L2, rachis: `M0 0 L0 ${fx(-Ln)}`, apex: [0, -Ln * 1.23], anch: { lamina: [-Ln * 0.25, -Ln * 0.5], veins: [Ln * 0.22, -Ln * 0.47], midrib: [0, -Ln * 0.3], petiole: [0, 26], margin: [-Ln * 0.3, -Ln * 0.43] } };
    }
    return { leaflets: [{ shape: P.leaf, len: Ln, margin: P.margin, tf: '' }], rachis: `M0 0 L0 ${fx(-Ln * 0.96)}`, apex: [0, -Ln], anch: { lamina: [hw(0.4) * 0.55, -Ln * 0.4], veins: [-hw(0.55) * 0.45, -Ln * 0.55], midrib: [0, -Ln * 0.72], petiole: [0, 26], margin: [hw(0.62) * 0.98, -Ln * 0.62] } };
  }
  function sceneLeaf(S, X) {
    const pid = S.spec, P = PLANTS[pid], Ln = P.leaf === 'linear' ? 232 : P.form ? 190 : 200, pc = leafPieces(pid, Ln);
    const col = mixHex('#8FD36A', P.col, 0.5), dark = mixHex(col, '#0B3D1E', 0.55), veinCol = mixHex(col, '#FFFFFF', 0.55);
    const OX = 210, OY = 250;
    const part = (k, inner) => `<g data-svgpart="${k}" role="button" tabindex="0" aria-label="${esc(X.t(PI[k][0]))}" class="${S.selPart === k ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="300" fill="url(#pl-wall)"/><circle cx="360" cy="40" r="70" fill="url(#pl-glow)" opacity=".5"/>`;
    s += `<path d="M110 284 Q210 270 310 284" stroke="#8B5A3C" stroke-width="14" fill="none" stroke-linecap="round"/><ellipse cx="210" cy="278" rx="10" ry="7" fill="#6B4A2B"/>`;
    let lam = '', vn = '', mg = '', mr = '';
    pc.leaflets.forEach((l) => {
      lam += `<path transform="${l.tf}" d="${leafD(l.shape, l.len, l.margin)}" fill="${col}"/>`;
      vn += `<path transform="${l.tf}" d="${veinsD(l.shape, l.len, P.ven, l.margin)}" fill="none" stroke="${veinCol}" stroke-width="1.8" stroke-linecap="round"/><path transform="${l.tf}" d="${veinsD(l.shape, l.len, P.ven, l.margin)}" fill="none" stroke="transparent" stroke-width="12"/>`;
      mg += `<path transform="${l.tf}" d="${leafD(l.shape, l.len, l.margin)}" fill="none" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path transform="${l.tf}" d="${leafD(l.shape, l.len, l.margin)}" fill="none" stroke="transparent" stroke-width="12"/>`;
      mr += `<path transform="${l.tf}" d="M0 0 L0 ${fx(-l.len * 0.96)}" stroke="${veinCol}" stroke-width="3" stroke-linecap="round"/><path transform="${l.tf}" d="M0 0 L0 ${fx(-l.len * 0.96)}" stroke="transparent" stroke-width="14"/>`;
    });
    if (P.form) mr += `<path d="${pc.rachis}" stroke="#7A9A4A" stroke-width="4" stroke-linecap="round"/><path d="${pc.rachis}" stroke="transparent" stroke-width="14"/>`;
    s += `<g transform="translate(${OX} ${OY})">`;
    s += part('petiole', pc.leaflets.length && P.leaf === 'linear' ? `<rect x="-11" y="-6" width="22" height="48" rx="6" fill="#74B84E" stroke="${dark}" stroke-width="2"/><rect x="-14" y="-8" width="28" height="50" fill="transparent"/>` : `<path d="M0 -4 L0 36" stroke="#9BBE5A" stroke-width="7" stroke-linecap="round"/><path d="M0 -4 L0 36" stroke="transparent" stroke-width="18"/>`);
    s += part('lamina', lam) + part('veins', vn) + part('midrib', mr) + part('margin', mg);
    s += part('apex', `<circle cx="${fx(pc.apex[0])}" cy="${fx(pc.apex[1] + 7)}" r="10" fill="none" stroke="${dark}" stroke-width="2.2" stroke-dasharray="4 3"/><circle cx="${fx(pc.apex[0])}" cy="${fx(pc.apex[1] + 7)}" r="14" fill="transparent"/>`);
    s += `</g>`;
    if (S.selPart && pc.anch[S.selPart] || S.selPart === 'apex') {
      const a = S.selPart === 'apex' ? [pc.apex[0], pc.apex[1] + 7] : pc.anch[S.selPart], ax = OX + a[0], ay = OY + a[1], right = a[0] <= 0 ? false : true, px = right ? 360 : 62, py = clamp(ay, 30, 270);
      s += `<line x1="${fx(ax)}" y1="${fx(ay)}" x2="${right ? 316 : 108}" y2="${fx(py)}" stroke="#1E293B" stroke-width="1.5"/><circle cx="${fx(ax)}" cy="${fx(ay)}" r="3.4" fill="#1E293B"/>` + pill(px, py, X.t(PI[S.selPart][0]), '#fff', '#1E293B', 11.5, X.lang);
    }
    s += pill(210, 18, X.t(P.n), '#0F766E', '#fff', 12, X.lang);
    return { main: s, vb: [420, 300] };
  }

  // ---------------------------------------------------------------- ROOT TYPES
  const cubic = (p0, p1, p2, p3, n) => { const a = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; a.push([v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]); } return a; };
  const polyD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${fx(p[0])} ${fx(p[1])}`).join(' ');
  function rootSystem(pid) {
    const P = PLANTS[pid], GY = 80, R = { main: [], lat: [], prop: [] };
    if (P.root === 'tap') {
      const m = cubic([210, GY], [206, 150], [214, 240], [204, 312], 24);
      R.main.push(m);
      [0.12, 0.2, 0.3, 0.4, 0.5, 0.62, 0.75].forEach((u, i) => {
        const p = m[Math.round(u * 24)], sd = i % 2 ? 1 : -1, len = 100 * (1 - u * 0.65);
        R.lat.push(cubic(p, [p[0] + sd * len * 0.35, p[1] + 4], [p[0] + sd * len * 0.75, p[1] + 16], [p[0] + sd * len, p[1] + 34 + u * 16], 14));
      });
    } else {
      [-78, -58, -38, -18, 0, 18, 38, 58, 78, -66, 66, -8].forEach((a, i) => {
        const r = (a * Math.PI) / 180, len = 150 + ((i * 37) % 70), ex = 210 + Math.sin(r) * len * 0.95, ey = GY + Math.cos(r) * len * 0.85 + 12;
        const pts = cubic([210 + (i % 3 - 1) * 3, GY + 2], [210 + (ex - 210) * 0.25, GY + 40], [210 + (ex - 210) * 0.75, GY + (ey - GY) * 0.5], [ex, ey], 16);
        (Math.abs(a) <= 18 ? R.main : R.lat).push(pts);
      });
      R.prop.push(cubic([203, 52], [190, 60], [184, 70], [180, GY + 26], 10), cubic([217, 58], [230, 64], [236, 72], [240, GY + 30], 10));
    }
    return R;
  }
  function sceneRoot(S, X) {
    const pid = S.spec, P = PLANTS[pid], R = rootSystem(pid), GY = 80;
    const part = (k, inner) => `<g data-svgpart="${k}" role="button" tabindex="0" aria-label="${esc(X.t(PI[k][0]))}" class="${S.selPart === k ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="${GY}" fill="url(#pl-sky)"/><rect y="${GY}" width="420" height="250" fill="url(#pl-ground)"/><path d="M0 ${GY} Q60 ${GY - 6} 120 ${GY} T250 ${GY} T420 ${GY - 2}" stroke="#7BC65C" stroke-width="7" fill="none"/>`;
    for (let i = 0; i < 26; i++) s += `<circle cx="${(i * 67) % 420}" cy="${GY + 24 + ((i * 41) % 220)}" r="${2 + (i % 3)}" fill="#fff" opacity=".13"/>`;
    // water to roots when running
    const rstroke = (d, w) => `<path d="${d}" fill="none" stroke="#9C7B3E" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#F4E8C4" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // plant above ground
    const lf = (x, y, a, ln) => `<g transform="translate(${x} ${y}) rotate(${a})">${leafSVG(pid, ln, { noVeins: true })}</g>`;
    if (pid === 'maize') s += `<rect x="204" y="14" width="12" height="70" rx="5" fill="#74B84E" stroke="#3F8A2A"/>` + lf(210, 44, -58, 70) + lf(210, 28, 56, 62);
    else s += `<path d="M210 ${GY} L210 24" stroke="#4E9A45" stroke-width="7" stroke-linecap="round"/>` + lf(210, 56, -64, P.form ? 40 : 34) + lf(210, 38, 64, P.form ? 40 : 34) + lf(210, 24, 10, 26);
    let mainG = '', latG = '', hairG = '', capG = '', nodG = '', propG = '';
    R.prop.forEach((pp) => { propG += rstroke(polyD(pp), 4.4); });
    R.main.forEach((pp, i) => { mainG += rstroke(polyD(pp), P.root === 'tap' ? 9 : 3.4); const e = pp[pp.length - 1]; capG += `<path d="M${fx(e[0] - (P.root === 'tap' ? 6 : 3.5))} ${fx(e[1] - 2)} Q${fx(e[0])} ${fx(e[1] + (P.root === 'tap' ? 14 : 8))} ${fx(e[0] + (P.root === 'tap' ? 6 : 3.5))} ${fx(e[1] - 2)}Z" fill="#B88A3A" stroke="#7A5A1E" stroke-width="1.2"/>`; });
    R.lat.forEach((pp) => {
      latG += rstroke(polyD(pp), P.root === 'tap' ? 3.4 : 3);
      const e = pp[pp.length - 1]; capG += `<circle cx="${fx(e[0])}" cy="${fx(e[1])}" r="3" fill="#B88A3A"/>`;
      for (let j = Math.floor(pp.length * 0.7); j < pp.length - 1; j += 2) hairG += `<path d="M${fx(pp[j][0])} ${fx(pp[j][1])} l${j % 4 ? 5 : -5} ${fx(3)} M${fx(pp[j][0])} ${fx(pp[j][1])} l${j % 4 ? -4 : 4} ${fx(-3)}" stroke="#fff" stroke-width="1" opacity=".9"/>`;
    });
    if (P.nod) R.lat.forEach((pp, i) => { const p = pp[4 + (i % 3)]; nodG += `<circle cx="${fx(p[0])}" cy="${fx(p[1])}" r="${5 + (i % 2)}" fill="#F7B6C6" stroke="#B94F72" stroke-width="1.6"/><circle cx="${fx(p[0] - 1.5)}" cy="${fx(p[1] - 1.5)}" r="1.6" fill="#fff" opacity=".7"/>`; });
    s += part('lateral-root', latG) + part('main-root', propG + mainG) + part('nodule', nodG) + part('root-hair', hairG + `<rect x="0" y="0" width="0" height="0" fill="transparent"/>`) + part('root-cap', capG);
    if (S.running) {
      const all = R.main.concat(R.lat);
      all.forEach((pp, i) => {
        for (let d = 0; d < 2; d++) {
          const f = (S.clock * 0.35 + i * 0.173 + d * 0.5) % 1, idx = Math.round((1 - f) * (pp.length - 1)), p = pp[idx];
          s += `<circle cx="${fx(p[0])}" cy="${fx(p[1])}" r="3.4" fill="#38BDF8" stroke="#fff" stroke-width="1" opacity=".95"/>`;
        }
      });
      for (let d = 0; d < 4; d++) { const f = (S.clock * 0.5 + d / 4) % 1; s += `<circle cx="210" cy="${fx(GY - f * 56)}" r="3.4" fill="#38BDF8" stroke="#fff" stroke-width="1"/>`; }
    }
    s += pill(112, 312, X.t(P.n) + ' · ' + X.t(P.root === 'tap' ? T2('tap root', 'मूसला जड़') : T2('fibrous roots', 'झकड़ा जड़')), P.root === 'tap' ? '#B45309' : '#0F766E', '#fff', 11.5, X.lang);
    s += `<text x="10" y="${GY + 14}" font-size="10" font-weight="700" fill="#fff" opacity=".85">${esc(X.t(T2('under the ground', 'ज़मीन के नीचे')))}</text>`;
    return { main: s, vb: [420, 330], aux: rootTip(S, X) };
  }
  function rootTip(S, X) {
    const part = (k, inner) => `<g data-svgpart="${k}" role="button" tabindex="0" aria-label="${esc(X.t(PI[k][0]))}" class="${S.selPart === k ? 'pl-hl' : ''}">${inner}</g>`;
    let s = `<rect width="420" height="250" fill="url(#pl-ground)"/>`;
    for (let i = 0; i < 22; i++) s += `<circle cx="${(i * 53) % 420}" cy="${(i * 37) % 250}" r="${2 + (i % 3)}" fill="#fff" opacity=".12"/><path d="M${(i * 71) % 420} ${(i * 43) % 250} q4 -6 8 0" stroke="#7CCBF5" stroke-width="2" fill="none" opacity=".5"/>`;
    s += `<g transform="translate(-76 0)">`;
    s += `<path d="M178 14 L178 150 Q178 188 210 188 Q242 188 242 150 L242 14Z" fill="#F4E8C4" stroke="#9C7B3E" stroke-width="2.4"/>`;
    s += `<rect x="178" y="14" width="64" height="86" fill="#F4E8C4" opacity="0"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) s += `<rect x="${182 + c * 30}" y="${22 + r * 20}" width="26" height="17" rx="4" fill="none" stroke="#C9B27A"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s += `<rect x="${184 + c * 14}" y="${118 + r * 12}" width="12" height="10" rx="2" fill="#F9E9B0" stroke="#C9B27A"/>`;
    s += part('root-cap', `<path d="M170 152 Q170 204 210 206 Q250 204 250 152 Q230 176 210 176 Q190 176 170 152Z" fill="#B88A3A" stroke="#7A5A1E" stroke-width="2.2"/><path d="M170 152 Q170 210 210 212 Q250 210 250 152" fill="none" stroke="transparent" stroke-width="12"/>`);
    let h = '';
    for (let i = 0; i < 7; i++) { const y = 24 + i * 12; h += `<path d="M178 ${y} q-26 ${i % 2 ? -6 : 4} -48 ${i % 2 ? 4 : -4}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M242 ${y + 6} q26 ${i % 2 ? 4 : -6} 48 ${i % 2 ? -4 : 4}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`; }
    s += part('root-hair', h + `<rect x="112" y="14" width="64" height="90" fill="transparent"/><rect x="244" y="14" width="64" height="90" fill="transparent"/>`);
    if (S.running) for (let i = 0; i < 6; i++) { const f = (S.clock * 0.6 + i / 6) % 1, side = i % 2 ? 1 : -1, y = 26 + (i % 3) * 24; s += `<circle cx="${fx(210 + side * (96 - 70 * f))}" cy="${y}" r="3.6" fill="#38BDF8" stroke="#fff" stroke-width="1"/>`; }
    s += `</g>`;
    const lab = (y, en, hi) => `<text x="236" y="${y}" font-size="11.5" font-weight="700" fill="#fff">${esc(X.t(T2(en, hi)))}</text>`;
    s += lab(62, 'Root hairs absorb water', 'मूल रोम पानी सोखते हैं') + lab(128, 'Cells stretch and grow', 'कोशिकाएँ लंबी होती हैं') + lab(160, 'Cells divide', 'कोशिकाएँ बँटती हैं');
    s += pill(210, 232, X.t(T2('Tip of a root, magnified', 'जड़ की नोक, बड़ी करके')), '#fff', '#1E293B', 11, X.lang);
    return s;
  }

  // ---------------------------------------------------------------- questions
  function quizFor(mode, pid) {
    const P = pid && PLANTS[pid];
    const Q = (q, opts, a, why) => ({ q, opts, a, why });
    const O = (en, hi) => T2(en, hi);
    const nm = (P, en, hi) => T2(en.replace('{p}', P.n.en), hi.replace('{p}', P.n.hi));
    const bank = {
      grow: [
        Q(O('A plant is kept in a dark cupboard. What happens after some days?', 'एक पौधे को अँधेरी अलमारी में रखा गया। कुछ दिन बाद क्या होता है?'), [O('It grows tall, pale and weak, then dies', 'वह लंबा, पीला और कमज़ोर होकर मर जाता है'), O('It grows fat and dark green', 'वह मोटा और गहरा हरा हो जाता है'), O('It grows exactly as before', 'वह पहले जैसा ही बढ़ता है')], 0, O('Leaves need light to make food. In the dark the plant uses up the food stored in its seed and then dies.', 'पत्तियों को भोजन बनाने के लिए प्रकाश चाहिए। अँधेरे में पौधा बीज में जमा भोजन खत्म कर देता है और फिर मर जाता है।')),
        Q(O('Why does a plant wilt when it gets far too much water?', 'बहुत ज़्यादा पानी मिलने पर पौधा क्यों मुरझा जाता है?'), [O('Too much light falls on it', 'उस पर बहुत प्रकाश पड़ता है'), O('Its roots cannot get air and stop working', 'जड़ों को हवा नहीं मिलती और वे काम करना बंद कर देती हैं'), O('Its leaves drink the water too fast', 'पत्तियाँ पानी बहुत तेज़ पी लेती हैं')], 1, O('Water fills the spaces in the soil. Roots need air to breathe, so they stop taking in water.', 'पानी मिट्टी की खाली जगह भर देता है। जड़ों को साँस के लिए हवा चाहिए, इसलिए वे पानी लेना बंद कर देती हैं।')),
        Q(O('Which soil is best for most plants?', 'अधिकतर पौधों के लिए कौन सी मिट्टी सबसे अच्छी है?'), [O('Sandy soil', 'रेतीली मिट्टी'), O('Clay soil', 'चिकनी मिट्टी'), O('Loamy soil', 'दोमट मिट्टी')], 2, O('Loam holds enough water, lets air in and has plenty of nutrients.', 'दोमट मिट्टी में पर्याप्त पानी रुकता है, हवा आती-जाती है और पोषक तत्व भी खूब होते हैं।')),
        Q(O('Which gas from the air do plants use to make food?', 'पौधे भोजन बनाने के लिए हवा की कौन सी गैस लेते हैं?'), [O('Carbon dioxide', 'कार्बन डाइऑक्साइड'), O('Nitrogen', 'नाइट्रोजन'), O('Oxygen', 'ऑक्सीजन')], 0, O('Leaves take in carbon dioxide. With water and sunlight they turn it into food.', 'पत्तियाँ कार्बन डाइऑक्साइड लेती हैं। पानी और प्रकाश से वे इसे भोजन में बदलती हैं।')),
      ],
      parts: [
        Q(O('Which part takes in water from the soil?', 'कौन सा भाग मिट्टी से पानी सोखता है?'), [O('Leaf', 'पत्ती'), O('Root', 'जड़'), O('Flower', 'फूल')], 1, O('Roots, especially the tiny root hairs, soak up water and minerals.', 'जड़ें, खासकर नन्हे मूल रोम, पानी और खनिज सोखते हैं।')),
        Q(O('Which part makes food using sunlight?', 'कौन सा भाग प्रकाश से भोजन बनाता है?'), [O('Leaf', 'पत्ती'), O('Root', 'जड़'), O('Stem', 'तना')], 0, O('The green leaf is the food factory of the plant.', 'हरी पत्ती पौधे का भोजन बनाने का कारखाना है।')),
        Q(O('Which part grows into a fruit?', 'कौन सा भाग बढ़कर फल बनता है?'), [O('Stem', 'तना'), O('Bud', 'कली'), O('Flower', 'फूल')], 2, O('After pollination the flower\'s ovary grows into the fruit, and the seeds are inside.', 'परागण के बाद फूल का अंडाशय फल बन जाता है और बीज उसके अंदर होते हैं।')),
        P && Q(nm(P, 'What kind of roots does {p} have?', '{p} में किस तरह की जड़ें होती हैं?'), [O('One thick main root (tap root)', 'एक मोटी मुख्य जड़ (मूसला जड़)'), O('Many thin roots of the same size (fibrous)', 'एक जैसी बहुत सी पतली जड़ें (झकड़ा जड़)')], P.root === 'tap' ? 0 : 1, P.root === 'tap' ? O('Plants with net-veined leaves, like this one, usually have a tap root.', 'जाल जैसी शिराओं वाली पत्तियों वाले पौधों में आम तौर पर मूसला जड़ होती है।') : O('Grass-like plants such as maize have fibrous roots.', 'मक्के जैसे घास कुल के पौधों में झकड़ा जड़ें होती हैं।')),
      ],
      photosynthesis: [
        Q(O('Which gas is in the bubbles from the water plant?', 'जलीय पौधे से निकलने वाले बुलबुलों में कौन सी गैस है?'), [O('Carbon dioxide', 'कार्बन डाइऑक्साइड'), O('Oxygen', 'ऑक्सीजन'), O('Hydrogen', 'हाइड्रोजन')], 1, O('Photosynthesis gives out oxygen. A glowing splinter would burn brighter in this gas.', 'प्रकाश संश्लेषण में ऑक्सीजन निकलती है। इस गैस में जलती हुई तीली और तेज़ जलती है।')),
        Q(O('You turn the lamp down low. What happens to the bubbles?', 'तुम लैंप की चमक कम कर देते हो। बुलबुलों का क्या होगा?'), [O('There are fewer bubbles', 'बुलबुले कम हो जाएँगे'), O('There are more bubbles', 'बुलबुले बढ़ जाएँगे'), O('Nothing changes', 'कुछ नहीं बदलेगा')], 0, O('Light is the energy for making food. Less light means less photosynthesis.', 'प्रकाश भोजन बनाने की ऊर्जा है। कम प्रकाश यानी कम प्रकाश संश्लेषण।')),
        Q(O('Which gas does the leaf take in to make food?', 'पत्ती भोजन बनाने के लिए कौन सी गैस लेती है?'), [O('Oxygen', 'ऑक्सीजन'), O('Carbon dioxide', 'कार्बन डाइऑक्साइड'), O('Steam', 'भाप')], 1, O('Carbon dioxide enters through the stomata. Add more and the bubbles speed up, until light or warmth becomes the limit.', 'कार्बन डाइऑक्साइड रंध्रों से अंदर आती है। इसे बढ़ाओ तो बुलबुले तेज़ होते हैं, जब तक प्रकाश या गर्मी सीमा न बन जाए।')),
        Q(O('What food does the leaf make?', 'पत्ती कौन सा भोजन बनाती है?'), [O('Glucose (a sugar)', 'ग्लूकोज़ (एक शर्करा)'), O('Salt', 'नमक'), O('Oil', 'तेल')], 0, O('Glucose is made first. The plant uses it to grow or stores it as starch.', 'पहले ग्लूकोज़ बनता है। पौधा इससे बढ़ता है या इसे मंड के रूप में जमा करता है।')),
      ],
      transpiration: [
        Q(O('Through which tiny pores does a leaf let out water vapour?', 'पत्ती किन नन्हे छिद्रों से जलवाष्प छोड़ती है?'), [O('Stomata', 'रंध्र'), O('Root hairs', 'मूल रोम'), O('Veins', 'शिराएँ')], 0, O('Stomata are the leaf\'s pores. This loss of water vapour is called transpiration.', 'रंध्र पत्ती के छिद्र हैं। जलवाष्प के इस निकलने को वाष्पोत्सर्जन कहते हैं।')),
        Q(O('When does a plant lose water fastest?', 'पौधा सबसे तेज़ पानी कब खोता है?'), [O('A cool, still, cloudy day', 'ठंडे, शांत और बादल वाले दिन'), O('A hot, windy, sunny day', 'गर्म, हवादार और धूप वाले दिन'), O('At night', 'रात में')], 1, O('Heat, wind and sunlight (which opens the stomata) all speed up transpiration.', 'गर्मी, हवा और धूप (जो रंध्र खोलती है) तीनों वाष्पोत्सर्जन को तेज़ करती हैं।')),
        Q(O('Why is there a second flask with a twig that has no leaves?', 'बिना पत्तियों वाली टहनी वाला दूसरा फ्लास्क क्यों रखा गया है?'), [O('To show the water is lost through the leaves', 'यह दिखाने के लिए कि पानी पत्तियों से निकलता है'), O('To make the plant grow', 'पौधे को बढ़ाने के लिए'), O('For decoration', 'सजावट के लिए')], 0, O('The oil stops evaporation, so only the leaves can be the reason the first flask loses water. This is a control.', 'तेल वाष्पन रोकता है, इसलिए पहले फ्लास्क का पानी घटने का कारण केवल पत्तियाँ हो सकती हैं। यह नियंत्रण प्रयोग है।')),
        Q(O('What does transpiration do for the plant?', 'वाष्पोत्सर्जन पौधे के लिए क्या करता है?'), [O('It stops the roots working', 'जड़ों को काम करने से रोकता है'), O('It pulls water up from the roots and cools the leaves', 'जड़ों से पानी ऊपर खींचता है और पत्तियों को ठंडा रखता है'), O('It makes the leaves red', 'पत्तियों को लाल बनाता है')], 1, O('As water leaves the leaf, more is pulled up the xylem from the roots.', 'पत्ती से पानी निकलता है तो जाइलम में जड़ों से और पानी ऊपर खिंचता है।')),
      ],
      germination: [
        Q(O('Which of these does a seed NOT need to germinate?', 'अंकुरण के लिए बीज को इनमें से किसकी ज़रूरत नहीं होती?'), [O('Light', 'प्रकाश'), O('Water', 'पानी'), O('Air (oxygen)', 'हवा (ऑक्सीजन)')], 0, O('Seeds sprout in the dark soil. Water, air and warmth are what they need. Light matters later, for the leaves.', 'बीज अँधेरी मिट्टी में अंकुरित होते हैं। उन्हें पानी, हवा और गर्मी चाहिए। प्रकाश बाद में, पत्तियों के लिए काम आता है।')),
        Q(O('Which part of the seed comes out first?', 'बीज का कौन सा भाग सबसे पहले बाहर आता है?'), [O('The plumule (shoot)', 'प्रांकुर (तना)'), O('The radicle (root)', 'मूलांकुर (जड़)'), O('The seed coat', 'बीज चोल')], 1, O('The radicle comes out first and grows down to hold the seedling and drink water.', 'मूलांकुर पहले निकलकर नीचे बढ़ता है; यह पौधे को थामता और पानी सोखता है।')),
        Q(O('A seed sits in boiled water covered with a layer of oil. It does not germinate. Why?', 'एक बीज उबले पानी में है, ऊपर तेल की परत है। वह अंकुरित नहीं होता। क्यों?'), [O('It gets no air (oxygen)', 'उसे हवा (ऑक्सीजन) नहीं मिलती'), O('It gets too much light', 'उसे बहुत प्रकाश मिलता है'), O('The water is too clean', 'पानी बहुत साफ़ है')], 0, O('Boiling drives out dissolved air and the oil keeps new air out. Seeds breathe, so they need oxygen.', 'उबालने से घुली हवा निकल जाती है और तेल नई हवा को आने नहीं देता। बीज साँस लेते हैं, इसलिए उन्हें ऑक्सीजन चाहिए।')),
        Q(O('Where does the baby plant of a bean seed get its first food?', 'सेम के बीज में नन्हे पौधे को पहला भोजन कहाँ से मिलता है?'), [O('From the cotyledons', 'बीजपत्रों से'), O('From the sunlight', 'सूर्य के प्रकाश से'), O('From the air', 'हवा से')], 0, O('The two cotyledons store food, so the seedling can grow before it has green leaves.', 'दो बीजपत्र भोजन जमा रखते हैं, इसलिए हरी पत्तियाँ बनने से पहले ही पौधा बढ़ सकता है।')),
      ],
      tropism: [
        Q(O('A shoot bends towards a window. This is called…', 'एक तना खिड़की की ओर मुड़ जाता है। इसे कहते हैं…'), [O('growth towards light (phototropism)', 'प्रकाश की ओर वृद्धि (प्रकाशानुवर्तन)'), O('growth away from water', 'पानी से दूर वृद्धि'), O('wilting', 'मुरझाना')], 0, O('Plants cannot walk, but they can grow towards light. That helps the leaves catch more sunlight.', 'पौधे चल नहीं सकते, पर प्रकाश की ओर बढ़ सकते हैं। इससे पत्तियों को ज़्यादा धूप मिलती है।')),
        Q(O('Which part of a plant grows downwards, towards gravity?', 'पौधे का कौन सा भाग गुरुत्व की ओर, नीचे बढ़ता है?'), [O('The shoot', 'तना'), O('The root', 'जड़'), O('The leaf', 'पत्ती')], 1, O('Roots grow down and shoots grow up, even when a seedling is laid on its side.', 'जड़ें नीचे और तना ऊपर बढ़ता है, चाहे अंकुर को लिटा दिया जाए।')),
        Q(O('Auxin collects on which side of a shoot that is bending towards light?', 'प्रकाश की ओर झुकते तने में ऑक्सिन किस तरफ़ जमा होता है?'), [O('The side facing the light', 'प्रकाश वाली तरफ़'), O('The shaded side', 'छाया वाली तरफ़'), O('It spreads evenly', 'बराबर फैल जाता है')], 1, O('Auxin makes cells grow longer. The longer shaded side pushes the tip over towards the light.', 'ऑक्सिन कोशिकाओं को लंबा करता है। छाया वाली तरफ़ लंबी हो जाती है और नोक को प्रकाश की ओर मोड़ देती है।')),
        Q(O('A climbing bean twines round a stick. What does it respond to?', 'चढ़ने वाली सेम एक डंडी पर लिपटती है। वह किस पर प्रतिक्रिया करती है?'), [O('Touch', 'स्पर्श'), O('Sound', 'ध्वनि'), O('Smell', 'गंध')], 0, O('The side touching the stick grows less, the other side grows more, so the stem coils round.', 'डंडी को छूने वाली तरफ़ कम बढ़ती है और दूसरी तरफ़ ज़्यादा, इसलिए तना लिपट जाता है।')),
      ],
      flower: [
        Q(O('Which part makes pollen?', 'पराग कौन सा भाग बनाता है?'), [O('Stigma', 'वर्तिकाग्र'), O('Anther', 'परागकोश'), O('Ovule', 'बीजांड')], 1, O('The anther, at the top of the filament, makes the yellow pollen.', 'पुतंतु के सिरे पर लगा परागकोश पीला पराग बनाता है।')),
        Q(O('Where must pollen land for the flower to make seeds?', 'फूल में बीज बनने के लिए पराग को कहाँ पहुँचना चाहिए?'), [O('On the petal', 'पंखुड़ी पर'), O('On the stigma', 'वर्तिकाग्र पर'), O('On the sepal', 'बाह्यदल पर')], 1, O('The sticky stigma holds the pollen. This landing is called pollination.', 'चिपचिपा वर्तिकाग्र पराग को पकड़ लेता है। इस पहुँचने को परागण कहते हैं।')),
        Q(O('After fertilisation, the ovule becomes a…', 'निषेचन के बाद बीजांड बन जाता है…'), [O('seed', 'बीज'), O('petal', 'पंखुड़ी'), O('leaf', 'पत्ती')], 0, O('Each fertilised ovule becomes a seed. The ovary around them becomes the fruit.', 'हर निषेचित बीजांड एक बीज बनता है। उनके चारों ओर का अंडाशय फल बन जाता है।')),
        Q(O('Why are petals bright and sweet-smelling?', 'पंखुड़ियाँ चटकीली और खुशबूदार क्यों होती हैं?'), [O('To call insects that carry pollen', 'पराग ले जाने वाले कीड़ों को बुलाने के लिए'), O('To make food', 'भोजन बनाने के लिए'), O('To drink water', 'पानी पीने के लिए')], 0, O('Bees and butterflies come for nectar and carry pollen from flower to flower.', 'मधुमक्खियाँ और तितलियाँ मकरंद के लिए आती हैं और एक फूल से दूसरे फूल तक पराग ले जाती हैं।')),
      ],
      'seed-dispersal': [
        Q(O('Why can a dandelion seed fly so far?', 'सिंहपर्णी (डेंडेलियन) का बीज इतनी दूर क्यों उड़ पाता है?'), [O('Its fluffy hairs act like a parachute', 'इसके रोएँदार बाल पैराशूट जैसे काम करते हैं'), O('It is very heavy', 'यह बहुत भारी होता है'), O('It has legs', 'इसके पैर होते हैं')], 0, O('The light, fluffy seed is carried by wind. Spreading seeds stops the young plants from crowding the parent.', 'हल्का, रोएँदार बीज हवा के साथ उड़ता है। बीज फैलने से नन्हे पौधे माँ पौधे के पास भीड़ नहीं लगाते।')),
        Q(O('How do hooked burr seeds travel?', 'हुकदार (काँटेदार) बीज कैसे यात्रा करते हैं?'), [O('They stick to the fur of animals', 'वे जानवरों के बालों में चिपक जाते हैं'), O('They float on water', 'वे पानी पर तैरते हैं'), O('They burst open', 'वे फटकर बिखरते हैं')], 0, O('The tiny hooks cling to fur or clothes and drop off somewhere far away.', 'नन्हे हुक बालों या कपड़ों में फँस जाते हैं और कहीं दूर जाकर गिर जाते हैं।')),
        Q(O('What carries a coconut across the sea?', 'नारियल को समुद्र पार कौन ले जाता है?'), [O('Wind', 'हवा'), O('Water', 'पानी'), O('Birds', 'पक्षी')], 1, O('The coconut\'s husk is light and full of air, so it floats on the waves for a long way.', 'नारियल का रेशेदार खोल हल्का और हवा से भरा होता है, इसलिए वह लहरों पर दूर तक तैरता है।')),
        Q(O('How does a ripe balsam (gulmehndi) pod spread its seeds?', 'पकी गुलमेहंदी की फली अपने बीज कैसे फैलाती है?'), [O('It bursts and throws them out', 'वह फटकर उन्हें बाहर फेंक देती है'), O('Animals eat it', 'जानवर उसे खा जाते हैं'), O('The wind blows it away', 'हवा उसे उड़ा ले जाती है')], 0, O('The pod dries and builds up tension. At a touch it springs open, an explosion of seeds.', 'फली सूखकर तन जाती है। छूते ही वह झटके से खुल जाती है और बीज दूर जा गिरते हैं।')),
      ],
      'leaf-types': [
        Q(O('Which leaf has parallel veins?', 'किस पत्ती की शिराएँ समानांतर होती हैं?'), [O('Mango', 'आम'), O('Maize', 'मक्का'), O('Hibiscus', 'गुड़हल')], 1, O('Maize, a grass-type plant, has veins running side by side. Most other plants have net-like veins.', 'मक्के की पत्ती में शिराएँ साथ-साथ चलती हैं। अधिकतर दूसरे पौधों में शिराएँ जाल जैसी होती हैं।')),
        Q(O('A leaf with several leaflets on one stalk is called…', 'एक डंठल पर कई पत्तिकाओं वाली पत्ती कहलाती है…'), [O('a simple leaf', 'सरल पत्ती'), O('a compound leaf', 'संयुक्त पत्ती'), O('a needle', 'सुई')], 1, O('Bean (3 leaflets) and gram (many leaflets) have compound leaves. A simple leaf has one blade.', 'सेम (3 पत्तिकाएँ) और चने (कई पत्तिकाएँ) की पत्तियाँ संयुक्त होती हैं। सरल पत्ती में एक ही फलक होता है।')),
        P && Q(nm(P, 'How are the veins in the {p} leaf?', '{p} की पत्ती में शिराएँ कैसी हैं?'), [O('Net-like (reticulate)', 'जाल जैसी (जालिकावत)'), O('Side by side (parallel)', 'साथ-साथ (समानांतर)')], P.ven === 'reticulate' ? 0 : 1, P.ven === 'reticulate' ? O('Look at the small veins joining the big ones to make a net.', 'देखो, छोटी शिराएँ बड़ी शिराओं से जुड़कर जाल बनाती हैं।') : O('The veins run along the leaf from base to tip, side by side.', 'शिराएँ पत्ती के आधार से नोक तक साथ-साथ चलती हैं।')),
        Q(O('What is the stalk of a leaf called?', 'पत्ती के डंठल को क्या कहते हैं?'), [O('Petiole', 'पर्णवृंत'), O('Midrib', 'मध्य शिरा'), O('Apex', 'शीर्ष')], 0, O('The petiole joins the blade to the stem.', 'पर्णवृंत पर्णफलक को तने से जोड़ता है।')),
      ],
      'root-types': [
        Q(O('Which plant has fibrous roots?', 'किस पौधे में झकड़ा जड़ें होती हैं?'), [O('Maize', 'मक्का'), O('Mustard', 'सरसों'), O('Mango', 'आम')], 0, O('Maize has many thin roots of about the same size. The others have a tap root.', 'मक्के में लगभग बराबर की बहुत सी पतली जड़ें होती हैं। बाकी में मूसला जड़ होती है।')),
        Q(O('What do root hairs do?', 'मूल रोम क्या करते हैं?'), [O('Soak up water and minerals', 'पानी और खनिज सोखते हैं'), O('Make food', 'भोजन बनाते हैं'), O('Make seeds', 'बीज बनाते हैं')], 0, O('Thousands of tiny root hairs give the root a huge surface for drinking.', 'हज़ारों नन्हे मूल रोम जड़ को पानी सोखने के लिए बहुत बड़ी सतह दे देते हैं।')),
        Q(O('The lumps on gram and bean roots hold tiny living things. What do they do for the plant?', 'चने और सेम की जड़ों की गाँठों में नन्हे जीव रहते हैं। वे पौधे के लिए क्या करते हैं?'), [O('Bacteria that turn air\'s nitrogen into plant food', 'जीवाणु जो हवा की नाइट्रोजन को पौधे के भोजन में बदलते हैं'), O('Insects that give light', 'कीड़े जो रोशनी देते हैं'), O('Worms that make holes', 'कीड़े जो छेद बनाते हैं')], 0, O('The bacteria (Rhizobium) make nitrogen usable. That is why farmers grow gram to enrich the soil.', 'राइज़ोबियम जीवाणु नाइट्रोजन को उपयोगी बना देते हैं। इसीलिए किसान चना उगाकर मिट्टी उपजाऊ बनाते हैं।')),
        P && Q(nm(P, 'What kind of roots does {p} have?', '{p} में किस तरह की जड़ें होती हैं?'), [O('Tap root', 'मूसला जड़'), O('Fibrous roots', 'झकड़ा जड़ें')], P.root === 'tap' ? 0 : 1, P.root === 'tap' ? O('One main root goes deep and side roots branch from it.', 'एक मुख्य जड़ गहराई तक जाती है और उससे बगल की जड़ें निकलती हैं।') : O('Many thin roots spread out, with no main root.', 'बहुत सी पतली जड़ें फैलती हैं, कोई मुख्य जड़ नहीं होती।')),
      ],
    };
    return (bank[mode] || []).filter(Boolean);
  }

  const INTRO = {
    grow: T2('Pick a pot, change the sliders, then press play to watch 3 weeks go by. Which pot grows best?', 'एक गमला चुनो, स्लाइडर बदलो, फिर 3 हफ़्ते का समय चलाने के लिए प्ले दबाओ। कौन सा गमला सबसे अच्छा बढ़ता है?'),
    parts: T2('Tap a part of the plant, or a button, to find out what it does.', 'पौधे के किसी भाग को या बटन को छुओ और जानो कि वह क्या करता है।'),
    photosynthesis: T2('Press play. The pondweed gives out bubbles of oxygen while it makes food. Change the sliders and count the bubbles.', 'प्ले दबाओ। जलीय पौधा भोजन बनाते समय ऑक्सीजन के बुलबुले छोड़ता है। स्लाइडर बदलो और बुलबुले गिनो।'),
    transpiration: T2('Press play. The red water in the flask with leaves goes down as the leaves let out water vapour. The flask without leaves stays full.', 'प्ले दबाओ। पत्तियों वाले फ्लास्क का लाल पानी घटता है क्योंकि पत्तियाँ जलवाष्प छोड़ती हैं। बिना पत्तियों वाला फ्लास्क भरा रहता है।'),
    germination: T2('Each jar has seeds. Give each jar different conditions, then press play to watch 8 days. Which seeds sprout?', 'हर जार में बीज हैं। हर जार को अलग हालात दो, फिर 8 दिन देखने के लिए प्ले दबाओ। कौन से बीज अंकुरित होते हैं?'),
    tropism: T2('Four experiments run together. Press play and watch the plants move over 2 days. Tap an experiment to read about it.', 'चार प्रयोग साथ चलते हैं। प्ले दबाओ और 2 दिन में पौधों को हिलते देखो। पढ़ने के लिए किसी प्रयोग को छुओ।'),
    flower: T2('Press play to follow a flower: pollination, the pollen tube, fertilisation, and the fruit. Tap any part to name it.', 'फूल का सफ़र देखने के लिए प्ले दबाओ: परागण, परागनली, निषेचन और फल। किसी भी भाग को छूकर नाम जानो।'),
    'seed-dispersal': T2('Choose a seed, then press play to see how it travels away from its parent plant.', 'एक बीज चुनो, फिर प्ले दबाओ और देखो कि वह माँ पौधे से दूर कैसे जाता है।'),
    'leaf-types': T2('Pick a plant, then tap the parts of its leaf. Compare the veins, the edge and the shape.', 'एक पौधा चुनो, फिर उसकी पत्ती के भागों को छुओ। शिराओं, किनारे और आकार की तुलना करो।'),
    'root-types': T2('Pick a plant to see its roots. Press play to watch water travel from the soil up into the plant.', 'जड़ें देखने के लिए एक पौधा चुनो। मिट्टी से पानी को पौधे में चढ़ते देखने के लिए प्ले दबाओ।'),
  };
  const TROPTXT = [
    T2('Phototropism: the shoot grows towards the light. Auxin gathers on the shaded side, those cells grow longer, and the tip bends over to the lamp.', 'प्रकाशानुवर्तन: तना प्रकाश की ओर बढ़ता है। ऑक्सिन छाया वाली तरफ़ जमा होता है, वे कोशिकाएँ लंबी होती हैं और नोक लैंप की ओर झुक जाती है।'),
    T2('Geotropism: even lying on its side, the shoot turns up (away from gravity) and the root turns down (towards gravity).', 'गुरुत्वानुवर्तन: लेटे होने पर भी तना ऊपर (गुरुत्व से दूर) और जड़ नीचे (गुरुत्व की ओर) मुड़ती है।'),
    T2('Hydrotropism: a root bends towards the wetter soil. Drag the water slider to 0 and the bending stops.', 'जलानुवर्तन: जड़ गीली मिट्टी की ओर मुड़ती है। पानी का स्लाइडर 0 कर दो तो मुड़ना रुक जाता है।'),
    T2('Thigmotropism: the stem touches the stick and coils round it, so the plant can climb up towards the light.', 'स्पर्शानुवर्तन: तना डंडी को छूकर उसके चारों ओर लिपट जाता है, जिससे पौधा प्रकाश की ओर चढ़ पाता है।'),
  ];
  const GROWWHY = {
    dead: T2('Once the roots and leaves are dead, the plant cannot recover.', 'जब जड़ें और पत्तियाँ मर जाती हैं तो पौधा ठीक नहीं हो सकता।'),
    dry: T2('Roots cannot find water, so the cells lose water and the leaves droop. Water it soon and it may recover.', 'जड़ों को पानी नहीं मिलता, कोशिकाओं का पानी घट जाता है और पत्तियाँ लटक जाती हैं। जल्दी पानी दो तो यह ठीक हो सकता है।'),
    wet: T2('Water fills the spaces in the soil, so roots cannot breathe and stop taking in water. The plant wilts even though there is plenty of water.', 'पानी मिट्टी की खाली जगह भर देता है, इसलिए जड़ें साँस नहीं ले पातीं और पानी लेना बंद कर देती हैं। इतना पानी होने पर भी पौधा मुरझा जाता है।'),
    dark: T2('Leaves need light to make food. Without it the plant lives on the food stored in its seed, stretches thin and pale (no chlorophyll), then dies.', 'पत्तियों को भोजन बनाने के लिए प्रकाश चाहिए। इसके बिना पौधा बीज में जमा भोजन पर जीता है, पतला और पीला (क्लोरोफिल के बिना) होकर लंबा खिंचता है, फिर मर जाता है।'),
    temp: T2('The chemicals that run the plant work too slowly when it is cold, and are harmed when it is too hot.', 'पौधे के भीतर की रासायनिक क्रियाएँ ठंड में बहुत धीमी चलती हैं और बहुत गर्मी में खराब हो जाती हैं।'),
    air: T2('Without carbon dioxide the leaf cannot make food, so the plant barely grows.', 'कार्बन डाइऑक्साइड के बिना पत्ती भोजन नहीं बना सकती, इसलिए पौधा मुश्किल से बढ़ता है।'),
    pale: T2('The green colour (chlorophyll) needs enough light and nutrients from the soil.', 'हरा रंग (क्लोरोफिल) बनने के लिए पर्याप्त प्रकाश और मिट्टी के पोषक तत्व चाहिए।'),
    wetish: T2('Not quite the right amount of water. Aim for soil that is moist but not soaked.', 'पानी बिलकुल सही मात्रा में नहीं है। मिट्टी नम रखो, पर भीगी हुई नहीं।'),
    ok: T2('Light, water, air, warmth and soil are all about right, so the plant makes plenty of food and grows.', 'प्रकाश, पानी, हवा, गर्मी और मिट्टी सब ठीक हैं, इसलिए पौधा खूब भोजन बनाकर बढ़ता है।'),
  };
  function growWhy(P, st, v) {
    const m = moist(v);
    if (st.dead) return 'dead';
    if (st.Tg < 0.5) return m < 30 ? 'dry' : 'wet';
    if (v.light < 8) return 'dark';
    if (tempF(P, v.temperature) < 0.15) return 'temp';
    if (v.air < 12) return 'air';
    if (st.G < 0.6) return 'pale';
    if (m < 22 || m > 72) return 'wetish';
    return 'ok';
  }
  const LIMIT = { none: T2('nothing: all are plentiful', 'कुछ नहीं: सब भरपूर हैं'), light: T2('light', 'प्रकाश'), air: T2('carbon dioxide', 'कार्बन डाइऑक्साइड'), temperature: T2('temperature', 'तापमान'), water: T2('water', 'पानी') };
  function hint(mode, id, val, P) {
    const g = (cls, en, hi) => ({ cls, t: T2(en, hi) });
    if (id === 'light') {
      if (mode === 'germination') return g('ok', 'Seeds do not need light to sprout', 'अंकुरण के लिए बीज को प्रकाश नहीं चाहिए');
      return val < 8 ? g('bad', 'No light', 'प्रकाश नहीं') : val < 35 ? g('low', 'Dim', 'धुँधला') : g('ok', 'Bright', 'तेज़');
    }
    if (id === 'water') {
      if (mode === 'germination') return val < 20 ? g('bad', 'Too dry: seeds sleep', 'बहुत सूखा: बीज सोते रहते हैं') : val > 88 ? g('bad', 'Flooded: no air', 'पानी भरा: हवा नहीं') : g('ok', 'Damp: good', 'नम: अच्छा');
      if (mode === 'tropism') return val < 15 ? g('low', 'Both sides dry: no bending', 'दोनों तरफ़ सूखा: मुड़ना नहीं') : g('ok', 'One side wet', 'एक तरफ़ गीला');
      if (mode === 'transpiration') return val < 12 ? g('bad', 'Flask nearly empty', 'फ्लास्क लगभग खाली') : g('ok', 'Plenty of water', 'भरपूर पानी');
      return val < 12 ? g('bad', 'Very dry', 'बहुत सूखा') : val < 30 ? g('low', 'Dry', 'सूखा') : val <= 70 ? g('ok', 'Just right', 'बिलकुल सही') : g('high', 'Too wet', 'बहुत गीला');
    }
    if (id === 'soil') return g(val === 2 ? 'ok' : 'low', ['Drains fast, few nutrients', 'Holds water, less air', 'Best: water, air and nutrients'][val], ['पानी जल्दी बह जाता है, पोषक तत्व कम', 'पानी रुकता है, हवा कम', 'सबसे अच्छी: पानी, हवा और पोषक तत्व'][val]);
    if (id === 'air') {
      if (mode === 'germination') return val < 15 ? g('bad', 'No oxygen', 'ऑक्सीजन नहीं') : val < 50 ? g('low', 'Little air', 'थोड़ी हवा') : g('ok', 'Plenty of air', 'भरपूर हवा');
      if (mode === 'transpiration') return val < 15 ? g('low', 'Still air', 'शांत हवा') : val < 60 ? g('ok', 'Gentle breeze', 'हल्की हवा') : g('high', 'Strong wind', 'तेज़ हवा');
      return val < 12 ? g('bad', 'Almost no CO₂', 'CO₂ लगभग नहीं') : val < 40 ? g('low', 'A little CO₂', 'थोड़ी CO₂') : g('ok', 'Plenty of CO₂', 'भरपूर CO₂');
    }
    if (id === 'temperature') {
      if (mode === 'germination') return val < 8 ? g('bad', 'Too cold: seeds sleep', 'बहुत ठंड: बीज सोते रहते हैं') : val > 42 ? g('bad', 'Too hot', 'बहुत गर्म') : g('ok', 'Warm enough', 'पर्याप्त गर्म');
      if (mode === 'photosynthesis') { const f = enzymeF(val); return f < 0.15 ? g('bad', val < 20 ? 'Too cold for enzymes' : 'Too hot: enzymes damaged', val < 20 ? 'एंज़ाइम के लिए बहुत ठंड' : 'बहुत गर्म: एंज़ाइम खराब'.toString()) : f < 0.7 ? g('low', val < 20 ? 'Cool' : 'Hot', val < 20 ? 'ठंडा' : 'गर्म') : g('ok', 'Good', 'अच्छा'); }
      if (mode === 'transpiration') return val < 15 ? g('low', 'Cool', 'ठंडा') : val > 35 ? g('high', 'Hot', 'गर्म') : g('ok', 'Warm', 'गुनगुना');
      const f = tempF(P, val);
      return f < 0.15 ? g('bad', val < P.Topt ? 'Too cold' : 'Too hot', val < P.Topt ? 'बहुत ठंड' : 'बहुत गर्मी') : f < 0.6 ? g('low', val < P.Topt ? 'Cool' : 'Hot', val < P.Topt ? 'ठंडा' : 'गर्म') : g('ok', 'Good for this plant', 'इस पौधे के लिए अच्छा');
    }
    return g('ok', '', '');
  }
  const valText = (id, val, mode) => (mode === 'transpiration' && id === 'water' ? T2(val + ' ml', val + ' मिली') : id === 'soil' ? SOILS[val].n : id === 'temperature' ? T2(val + ' °C', val + ' °C') : T2(val + ' %', val + ' %'));
  const CSS2 = `
.pl-facts{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.pl-facts li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.pl-facts b{min-width:6.5em;color:var(--ink-2);font-weight:700}
.pl-photo{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--line)}
.pl-pot svg{flex:none}
.pl-big{font-family:var(--font-display);font-weight:800;font-size:1.5rem;line-height:1.1}
.pl-read{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline}
`;

  // ---------------------------------------------------------------- the template
  const SCENES = { grow: sceneGrow, parts: sceneParts, photosynthesis: scenePhoto, transpiration: sceneTrans, germination: sceneGerm, tropism: sceneTrop, flower: sceneFlower, 'seed-dispersal': sceneDisp, 'leaf-types': sceneLeaf, 'root-types': sceneRoot };
  const AUXVB = { photosynthesis: [420, 300], transpiration: [420, 250], germination: [420, 250], 'root-types': [420, 250] };
  const HAS_PLAY = ['grow', 'photosynthesis', 'transpiration', 'germination', 'tropism', 'flower', 'seed-dispersal', 'root-types'];
  const varsOf = (c) => (MODEVARS[c.mode] ? (c.variables || MODEVARS[c.mode].def) : []);
  const potCount = (c) => (c.mode === 'grow' ? c.pots || 3 : c.mode === 'germination' ? c.pots || Math.min(4, 1 + varsOf(c).length) : c.mode === 'tropism' ? 4 : c.mode === 'leaf-types' || c.mode === 'root-types' ? PLANT_IDS.length : 0);
  const partsFor = (mode, pid) => {
    let a = PARTS[mode] || [];
    if (mode === 'parts' && pid === 'maize') a = a.filter((k) => k !== 'branch');
    if (mode === 'germination' && !(pid && PLANTS[pid].cls === 'monocot')) a = a.filter((k) => k !== 'endosperm');
    return a;
  };
  const POTHEAD = { grow: T2('Choose a pot', 'एक गमला चुनो'), germination: T2('Choose a jar', 'एक जार चुनो'), tropism: T2('Choose an experiment', 'एक प्रयोग चुनो'), 'leaf-types': T2('Choose a plant', 'एक पौधा चुनो'), 'root-types': T2('Choose a plant', 'एक पौधा चुनो') };
  const PARTHEAD = { parts: T2('Find the parts', 'भाग ढूँढो'), photosynthesis: T2('What goes in, what comes out', 'क्या अंदर जाता है, क्या बाहर आता है'), transpiration: T2('Look closer', 'पास से देखो'), germination: T2('Inside the seed', 'बीज के अंदर'), tropism: T2('Learn about', 'जानो'), flower: T2('Parts of the flower', 'फूल के भाग'), 'seed-dispersal': T2('Choose a seed', 'एक बीज चुनो'), 'leaf-types': T2('Parts of the leaf', 'पत्ती के भाग'), 'root-types': T2('Parts of the root', 'जड़ के भाग') };
  let uidCounter = 0;

  function mount(root, config, api) {
    const mode = config.mode, MV = MODEVARS[mode], vars = varsOf(config).slice();
    const pid = config.plant || DEFAULT_PLANT[mode], P = pid ? PLANTS[pid] : null;
    const uid = 'pl' + (++uidCounter);
    const S = {
      mode, plant: pid, vars, spec: pid, sel: 0, selPart: null, found: new Set(), day: 0, histDay: 0, t: 0, clock: 0, running: false, done: false,
      maxDay: mode === 'germination' ? 8 : 21, pots: [], pr: null, tr: null, gas: 0, count: 0, bub: [], spawn: 0, ml: 100, used: 0, wilt: 0, fired: {}, msg: null,
      qi: 0, qDone: false, qWrong: new Set(), touched: false, lang: api.lang(), ang: null,
    };
    if (mode === 'seed-dispersal') S.selPart = (P && P.sdisp) || 'dandelion';
    if (mode === 'leaf-types' || mode === 'root-types') S.sel = Math.max(0, PLANT_IDS.indexOf(pid));
    let raf = 0, last = 0, destroyed = false;
    const fire = (e) => { if (!S.fired[e]) { S.fired[e] = 1; api.emit(e); } };
    const baseV = () => { const v = {}; VAR_IDS.forEach((id) => { v[id] = fixedVal(mode, id); }); return v; };
    const PHOTO = api.asset ? api.asset('plant-' + (pid || mode)) : null;

    function initPots() {
      const n = potCount(config), shared = baseV();
      S.pots = [];
      for (let i = 0; i < Math.max(n, 1); i++) {
        let v;
        if (mode === 'tropism') v = shared;
        else { v = baseV(); if ((mode === 'grow' || mode === 'germination') && i > 0 && vars.length) { const id = vars[(i - 1) % vars.length]; v[id] = VARS[id].poor; } }
        const pot = { v };
        if (mode === 'grow') pot.st = newGrow(P, v);
        if (mode === 'germination') pot.p = 0;
        S.pots.push(pot);
      }
      S.ml = S.pots[0].v.water;
      recompute();
    }
    function recompute() {
      const v = S.pots[0].v;
      S.pr = photo(v);
      S.tr = trans(Object.assign({}, v, { water: S.ml }));
    }
    initPots();

    // ---- markup
    const title = T2('', '');
    root.innerHTML = `<div class="pl">
      <div class="pl-bar"><div class="pl-title"></div><span class="pl-day" hidden></span><button type="button" class="pl-btn" data-key="play" hidden></button><button type="button" class="pl-btn alt" data-key="reset" hidden></button></div>
      <div class="pl-main">
        <div class="pl-stage"><svg class="pl-svg pl-m" role="group"></svg><svg class="pl-svg pl-a" role="group" hidden></svg><div class="pl-eq" hidden></div></div>
        <div class="pl-side"><div class="pl-card pl-c-pots" hidden></div><div class="pl-card pl-c-sl" hidden></div><div class="pl-card pl-c-pb" hidden></div><div class="pl-info" aria-live="polite"></div><div class="pl-card pl-extra" hidden></div></div>
      </div>
      <div class="pl-quiz" data-key="answer"></div></div>`;
    const $ = (s) => root.querySelector(s);
    const elTitle = $('.pl-title'), elDay = $('.pl-day'), elPlay = $('[data-key="play"]'), elReset = $('[data-key="reset"]');
    const elStage = $('.pl-stage'), svgM = $('.pl-m'), svgA = $('.pl-a'), elEq = $('.pl-eq'), cPots = $('.pl-c-pots'), cSl = $('.pl-c-sl'), cPb = $('.pl-c-pb'), elInfo = $('.pl-info'), elExtra = $('.pl-extra'), elQuiz = $('.pl-quiz');
    if (HAS_PLAY.includes(mode)) { elPlay.hidden = false; elReset.hidden = false; }

    const X = () => ({ t: api.t, lang: api.lang() });
    const potLabel = (i) => (mode === 'grow' ? api.t(T2('Pot ', 'गमला ')) + (i + 1) : mode === 'germination' ? api.t(T2('Jar ', 'जार ')) + (i + 1) : mode === 'tropism' ? api.t([T2('Light', 'प्रकाश'), T2('Gravity', 'गुरुत्व'), T2('Water', 'पानी'), T2('Touch', 'स्पर्श')][i]) : api.t(PLANTS[PLANT_IDS[i]].n));

    function buildBar() {
      const sub = P && mode !== 'tropism' && mode !== 'seed-dispersal' && mode !== 'leaf-types' && mode !== 'root-types' ? api.t(P.n) : '';
      elTitle.innerHTML = `${esc(api.t(MODE_NAME[mode]))}${sub ? `<small>${esc(sub)}</small>` : ''}`;
      if (PHOTO) elTitle.insertAdjacentHTML('beforebegin', `<img class="pl-photo" src="${esc(PHOTO)}" alt="" onerror="this.remove()">`);
      svgM.setAttribute('aria-label', api.t(MODE_NAME[mode]));
      svgA.setAttribute('aria-label', api.t(MODE_NAME[mode]) + ' (2)');
      elReset.innerHTML = `${ico('reset', 20)}<span>${esc(api.t(T2('Start again', 'फिर से शुरू')))}</span>`;
      if (mode === 'photosynthesis') { elEq.hidden = false; elEq.innerHTML = `${L.sub('6CO2')} + ${L.sub('6H2O')} ⟶ ${L.sub('C6H12O6')} + ${L.sub('6O2')}<small>${esc(api.t(T2('carbon dioxide + water, in sunlight, with chlorophyll, gives glucose + oxygen', 'कार्बन डाइऑक्साइड + पानी, प्रकाश और क्लोरोफिल में, ग्लूकोज़ + ऑक्सीजन बनाते हैं')))}</small>`; }
    }
    function playLabel() {
      return S.running ? { ic: 'pause', t: T2('Pause', 'रोको') } : S.done ? { ic: 'play', t: T2('Play again', 'फिर चलाओ') } : { ic: 'play', t: T2('Play', 'चलाओ') };
    }
    function buildPanel() {
      const act = document.activeElement, keep = act && root.contains(act) && act.getAttribute('data-key');
      const x = X();
      // pots
      const np = potCount(config);
      cPots.hidden = !np;
      if (np) {
        cPots.innerHTML = `<h3 class="pl-h">${esc(api.t(POTHEAD[mode]))}</h3><div class="pl-pots">${S.pots.slice(0, np).map((p, i) => `<button type="button" class="pl-pot" data-key="pot:${i + 1}" aria-pressed="${i === S.sel}">${mode === 'leaf-types' ? `<svg viewBox="-18 -30 36 34" width="28" height="28" aria-hidden="true">${leafSVG(PLANT_IDS[i], 26, { noVeins: true })}</svg>` : `<i style="background:${POTCOL[i % POTCOL.length]}"></i>`}${esc(potLabel(i))}</button>`).join('')}</div>`;
      }
      // sliders
      cSl.hidden = !vars.length;
      if (vars.length) {
        const pot = S.pots[Math.min(S.sel, S.pots.length - 1)];
        const who = mode === 'grow' || mode === 'germination' ? api.t(T2(' for ', ' — ')) + potLabel(S.sel) : '';
        cSl.innerHTML = `<h3 class="pl-h">${esc(api.t(T2('Change the conditions', 'हालात बदलो')))}${esc(who)}</h3>` + vars.map((id) => {
          const V = VARS[id], val = pot.v[id];
          return `<div class="pl-sl" data-key="slider:${id}"><label for="${uid}-${id}">${ico(id, 22)}<span>${esc(api.t(vName(mode, id)))}</span><b data-val="${id}"></b></label><input id="${uid}-${id}" type="range" data-var="${id}" min="${V.min}" max="${V.max}" step="${V.step}" value="${val}"><span class="pl-chip" data-chip="${id}"></span></div>`;
        }).join('');
      }
      // parts
      const pl = partsFor(mode, mode === 'leaf-types' || mode === 'root-types' ? S.spec : S.plant);
      cPb.hidden = !pl.length;
      if (pl.length) {
        const pp = mode === 'leaf-types' || mode === 'root-types' ? S.spec : S.plant;
        cPb.innerHTML = `<h3 class="pl-h">${esc(api.t(PARTHEAD[mode]))}${mode === 'parts' ? ` <span class="muted">${S.found.size}/${pl.length}</span>` : ''}</h3><div class="pl-parts">${pl.map((k) => `<button type="button" class="pl-pb${S.found.has(k) && mode !== 'seed-dispersal' ? ' done' : ''}" data-key="part:${k}" aria-pressed="${S.selPart === k}">${esc(api.t(partName(k, mode, pp)))}</button>`).join('')}</div>`;
      }
      elPlay.innerHTML = `${ico(playLabel().ic, 20)}<span>${esc(api.t(playLabel().t))}</span>`;
      updateSliders();
      if (keep) { const n = root.querySelector(`[data-key="${keep}"]`); if (n && n.focus) n.focus({ preventScroll: true }); }
    }
    function updateSliders() {
      const pot = S.pots[Math.min(S.sel, S.pots.length - 1)], Pp = P || PLANTS.bean;
      vars.forEach((id) => {
        const val = pot.v[id], b = cSl.querySelector(`[data-val="${id}"]`), ch = cSl.querySelector(`[data-chip="${id}"]`), inp = cSl.querySelector(`input[data-var="${id}"]`);
        if (!b) return;
        const vt = api.t(valText(id, val, mode)), h = hint(mode, id, val, Pp);
        b.textContent = vt; ch.textContent = api.t(h.t); ch.className = 'pl-chip ' + h.cls;
        if (inp) { if (+inp.value !== val) inp.value = val; inp.setAttribute('aria-valuetext', vt + ', ' + api.t(h.t)); }
      });
    }
    function quizHTML() {
      const bank = quizFor(mode, mode === 'leaf-types' || mode === 'root-types' ? S.spec : S.plant);
      if (!bank.length) return '';
      const q = bank[S.qi % bank.length];
      return `<p>${esc(api.t(T2('Quick question', 'एक छोटा सवाल')))}: ${esc(api.t(q.q))}</p><div class="pl-opts">${q.opts.map((o, i) => `<button type="button" class="pl-opt${S.qDone && i === q.a ? ' right' : S.qWrong.has(i) ? ' wrong' : ''}" data-opt="${i}">${esc(api.t(o))}</button>`).join('')}</div>`
        + (S.qDone ? `<p class="pl-why"><b>${esc(api.t(T2('Yes! ', 'हाँ! ')))}</b>${esc(api.t(q.why))}</p><button type="button" class="pl-btn alt" data-next="1">${esc(api.t(T2('Next question', 'अगला सवाल')))} ${ico('next', 20)}</button>` : S.qWrong.size ? `<p class="pl-why">${esc(api.t(T2('Not quite. Look at the picture again and try once more.', 'ठीक नहीं। चित्र को फिर देखो और एक बार और कोशिश करो।')))}</p>` : '');
    }
    function buildQuiz() { const h = quizHTML(); elQuiz.hidden = !h; elQuiz.innerHTML = h; }

    // ---- information and read-outs
    function infoState() {
      const x = X(), t = api.t;
      if (S.msg) return `<b>${esc(t(S.msg.title))}</b><p>${esc(t(S.msg.body))}</p>`;
      if (!S.touched) return `<b>${esc(t(MODE_NAME[mode]))}</b><p>${esc(t(INTRO[mode]))}</p>`;
      if (mode === 'grow') {
        const pot = S.pots[S.sel], st = pot.st, stat = growStatus(P, st, pot.v);
        return `<b>${esc(potLabel(S.sel))}: ${esc(t(stat.t))}</b><p>${esc(t(GROWWHY[growWhy(P, st, pot.v)]))}</p>`;
      }
      if (mode === 'germination') {
        const pot = S.pots[S.sel], g = germ(P, pot.v);
        const body = g.rate === 0 ? T2(`This seed is waiting. ${g.why === 'water' ? 'It needs water to swell and wake up.' : g.why === 'air' ? 'It needs air (oxygen) to breathe.' : 'It needs warmth to wake up.'} Light is not needed.`, `यह बीज इंतज़ार कर रहा है। ${g.why === 'water' ? 'जागने और फूलने के लिए इसे पानी चाहिए।' : g.why === 'air' ? 'साँस लेने के लिए इसे हवा (ऑक्सीजन) चाहिए।' : 'जागने के लिए इसे गर्मी चाहिए।'} प्रकाश की ज़रूरत नहीं है।`) : T2('Water, air and warmth are all there, so the seed swells, the radicle comes out first, then the shoot. Light is not needed yet.', 'पानी, हवा और गर्मी सब हैं, इसलिए बीज फूलता है, पहले मूलांकुर निकलता है, फिर तना। अभी प्रकाश की ज़रूरत नहीं।');
        return `<b>${esc(potLabel(S.sel))}: ${esc(t(germStage(pot.p)))}</b><p>${esc(t(body))}</p>`;
      }
      if (mode === 'tropism') return `<b>${esc(potLabel(S.sel))}</b><p>${esc(t(TROPTXT[S.sel]))}</p>`;
      if (mode === 'photosynthesis') {
        const pr = S.pr;
        const body = pr.limit === 'none' ? T2('Light, carbon dioxide and warmth are all plentiful, so the plant works at nearly full speed. Lower one of them to see it become the limit.', 'प्रकाश, कार्बन डाइऑक्साइड और गर्मी सब भरपूर हैं, इसलिए पौधा लगभग पूरी गति से काम करता है। इनमें से किसी एक को घटाओ और देखो कि वही सीमा बन जाता है।') : pr.rate < 0.03 ? T2('Almost no food is being made, so there are almost no bubbles. Find out which factor is missing.', 'लगभग कोई भोजन नहीं बन रहा, इसलिए बुलबुले भी लगभग नहीं हैं। पता करो कौन सी चीज़ कम है।') : T2(`The rate is held back by ${LIMIT[pr.limit].en}. Make that bigger and the bubbles speed up; changing the others does little.`, `गति को ${LIMIT[pr.limit].hi} रोक रहा है। उसे बढ़ाओ तो बुलबुले तेज़ होंगे; बाकी बदलने से कम फ़र्क पड़ेगा।`);
        return `<b>${esc(t(T2('Limiting factor', 'सीमित करने वाला कारक')))}: ${esc(t(LIMIT[pr.limit]))}</b><p>${esc(t(body))}</p>`;
      }
      if (mode === 'transpiration') {
        const tr = S.tr;
        return `<b>${esc(t(tr.dry ? T2('The plant is short of water', 'पौधे में पानी की कमी है') : tr.open > 0.6 ? T2('Stomata open: water vapour escapes', 'रंध्र खुले हैं: जलवाष्प निकलती है') : T2('Stomata mostly shut: little water lost', 'रंध्र लगभग बंद: कम पानी निकलता है')))}</b><p>${esc(t(T2('Light opens the stomata. Heat and wind carry the vapour away faster. If the roots find no water, the guard cells close and the leaves droop.', 'प्रकाश रंध्र खोलता है। गर्मी और हवा वाष्प को जल्दी दूर ले जाती हैं। जड़ों को पानी न मिले तो द्वार कोशिकाएँ बंद हो जाती हैं और पत्तियाँ लटक जाती हैं।')))}</p>`;
      }
      if (mode === 'flower') return `<b>${esc(t(PLANTS[S.plant].n))}</b><p>${esc(t(PLANTS[S.plant].flowerFact))}</p>`;
      if (mode === 'seed-dispersal') return `<b>${esc(t(PI[S.selPart][0]))}</b><p>${esc(t(PI[S.selPart][1]))}</p>`;
      if (mode === 'root-types') return `<b>${esc(t(PLANTS[S.spec].n))}</b><p>${esc(t(INTRO[mode]))}</p>`;
      return `<b>${esc(t(MODE_NAME[mode]))}</b><p>${esc(t(INTRO[mode]))}</p>`;
    }
    function refreshInfo() { const h = infoState(); if (elInfo.innerHTML !== h) elInfo.innerHTML = h; }
    function factsHTML() {
      const t = api.t, Pp = PLANTS[S.spec];
      let rows;
      if (mode === 'leaf-types') rows = [[T2('Type', 'प्रकार'), Pp.form === 'trifoliate' ? T2('compound: 3 leaflets on one stalk', 'संयुक्त: एक डंठल पर 3 पत्तिकाएँ') : Pp.form === 'pinnate' ? T2('compound: many leaflets along one stalk', 'संयुक्त: एक डंठल पर कई पत्तिकाएँ') : T2('simple: one blade', 'सरल: एक ही फलक')], [T2('Veins', 'शिराएँ'), LEAFTXT.ven[Pp.ven]], [T2('Shape', 'आकार'), LEAFTXT.shape[Pp.leaf]], [T2('Edge', 'किनारा'), Pp.form === 'pinnate' ? LEAFTXT.margin.serrate : LEAFTXT.margin[Pp.margin]], [T2('On the stem', 'तने पर'), LEAFTXT.phyllo[Pp.phyllo]]];
      else rows = [[T2('Roots', 'जड़ें'), Pp.root === 'tap' ? T2('tap root: one thick main root with side roots', 'मूसला जड़: एक मोटी मुख्य जड़ और बगल की जड़ें') : T2('fibrous: many thin roots, no main root', 'झकड़ा: बहुत सी पतली जड़ें, कोई मुख्य जड़ नहीं')], [T2('Leaf veins', 'पत्ती की शिराएँ'), LEAFTXT.ven[Pp.ven]], [T2('Seed', 'बीज'), Pp.cot === 2 ? T2('two cotyledons (dicot)', 'दो बीजपत्र (द्विबीजपत्री)') : T2('one cotyledon (monocot)', 'एक बीजपत्र (एकबीजपत्री)')], [T2('Nodules', 'मूल ग्रंथियाँ'), Pp.nod ? T2('yes, with Rhizobium bacteria', 'हाँ, राइज़ोबियम जीवाणुओं वाली') : T2('none', 'नहीं हैं')]];
      return `<h3 class="pl-h">${esc(t(PLANTS[S.spec].n))}</h3><ul class="pl-facts">${rows.map((r) => `<li><b>${esc(t(r[0]))}</b><span>${esc(t(r[1]))}</span></li>`).join('')}</ul>`;
    }
    function extraHTML() {
      const t = api.t, x = X();
      if (mode === 'grow') return chartSVG(S, x) + `<div class="pl-leg">${S.pots.map((p, i) => `<span><i style="background:${POTCOL[i % POTCOL.length]}"></i>${esc(potLabel(i))}: ${r1(p.st.h)} ${esc(t(T2('cm', 'सेमी')))}</span>`).join('')}</div>`;
      if (mode === 'germination') return `<h3 class="pl-h">${esc(t(T2('Progress of each jar', 'हर जार की प्रगति')))}</h3><div class="pl-leg" style="display:grid;gap:6px">${S.pots.map((p, i) => `<span style="display:flex;align-items:center;gap:8px"><i style="background:${POTCOL[i % POTCOL.length]}"></i><span style="min-width:5em">${esc(potLabel(i))}</span><span style="flex:1;height:10px;border-radius:5px;background:var(--sunk);overflow:hidden"><span style="display:block;height:100%;width:${Math.round(p.p * 100)}%;background:${POTCOL[i % POTCOL.length]}"></span></span></span>`).join('')}</div>`;
      if (mode === 'tropism') { const a = S.ang || { photo: 0, geo: 0, hydro: 0, thigmo: 0 }; return `<h3 class="pl-h">${esc(t(T2('How far they have bent', 'कितना मुड़े')))}</h3><div class="pl-read"><span>${esc(t(T2('Light', 'प्रकाश')))}: <b>${Math.round(a.photo)}°</b></span><span>${esc(t(T2('Gravity', 'गुरुत्व')))}: <b>${Math.round(a.geo)}°</b></span><span>${esc(t(T2('Water', 'पानी')))}: <b>${Math.round(a.hydro)}°</b></span><span>${esc(t(T2('Coils', 'फेरे')))}: <b>${fx(a.thigmo)}</b></span></div>`; }
      if (mode === 'photosynthesis') return `<h3 class="pl-h">${esc(t(T2('Bubble counter', 'बुलबुला गणक')))}</h3><div class="pl-read"><span class="pl-big">${S.pr.bubbles}</span><span>${esc(t(T2('bubbles per minute', 'बुलबुले प्रति मिनट')))}</span></div><div class="pl-read"><span>${esc(t(T2('Counted so far', 'अब तक गिने')))}: <b>${S.count}</b></span><span>${esc(t(T2('Limiting factor', 'सीमित करने वाला कारक')))}: <b>${esc(t(LIMIT[S.pr.limit]))}</b></span></div>`;
      if (mode === 'transpiration') return `<h3 class="pl-h">${esc(t(T2('Measurements', 'माप')))}</h3><div class="pl-read"><span class="pl-big">${r1(S.used)} ml</span><span>${esc(t(T2('water lost by the leaves', 'पत्तियों से निकला पानी')))}</span></div><div class="pl-read"><span>${esc(t(T2('Rate', 'दर')))}: <b>${r1(S.tr.rate)} ml/${esc(t(T2('hour', 'घंटा')))}</b></span><span>${esc(t(T2('Control flask', 'नियंत्रण फ्लास्क')))}: <b>0 ml</b></span></div>`;
      if (mode === 'flower') { const st = FSTAGE.find((a) => S.t < a[0]); return `<h3 class="pl-h">${esc(t(T2('Where are we?', 'अभी क्या हो रहा है?')))}</h3><p style="margin:0">${esc(t(S.t <= 0 ? T2('Not started yet.', 'अभी शुरू नहीं हुआ।') : st[1]))}</p>`; }
      if (mode === 'leaf-types' || mode === 'root-types') return factsHTML();
      if (mode === 'seed-dispersal') return `<h3 class="pl-h">${esc(t(T2('Carried by', 'ले जाने वाला')))}</h3><p style="margin:0"><b>${esc(t(DISP[S.selPart].agent))}</b></p>`;
      return '';
    }
    function dayText() {
      if (mode === 'grow') return api.t(T2('Day ', 'दिन ')) + Math.floor(S.day + 1e-6) + ' / ' + S.maxDay;
      if (mode === 'germination') return api.t(T2('Day ', 'दिन ')) + Math.floor(S.day + 1e-6) + ' / ' + S.maxDay;
      if (mode === 'tropism') return api.t(T2('Hour ', 'घंटा ')) + Math.floor(S.t) + ' / 48';
      if (mode === 'transpiration') return api.t(T2('Hour ', 'घंटा ')) + Math.floor(S.t) + ' / 24';
      if (mode === 'photosynthesis') { const s = Math.floor(S.clock * 4); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
      return '';
    }
    function updateDyn() {
      const dt = dayText();
      elDay.hidden = !dt; if (dt && elDay.textContent !== dt) elDay.textContent = dt;
      const h = extraHTML();
      elExtra.hidden = !h; if (h && elExtra.innerHTML !== h) elExtra.innerHTML = h;
      if (HAS_PLAY.includes(mode)) { const pl = `${ico(playLabel().ic, 20)}<span>${esc(api.t(playLabel().t))}</span>`; if (elPlay.innerHTML !== pl) elPlay.innerHTML = pl; elPlay.setAttribute('aria-pressed', String(S.running)); }
    }
    function setSvg(el, inner, vb) {
      const act = document.activeElement;
      let sel = null;
      if (act && el.contains(act)) { const a = act.getAttribute('data-svgpart') != null ? 'data-svgpart' : act.getAttribute('data-svgpot') != null ? 'data-svgpot' : null; if (a) sel = `[${a}="${act.getAttribute(a)}"]`; }
      el.setAttribute('viewBox', `0 0 ${vb[0]} ${vb[1]}`);
      el.innerHTML = DEFS + inner;
      if (sel) { const n = el.querySelector(sel); if (n) n.focus({ preventScroll: true }); }
    }
    function draw() {
      const lang = api.lang();
      if (lang !== S.lang) { S.lang = lang; buildBar(); buildPanel(); buildQuiz(); }
      const sc = SCENES[mode](S, X());
      setSvg(svgM, sc.main, sc.vb);
      elStage.classList.toggle('pl-tall', !!sc.aux);
      if (sc.aux) { svgA.removeAttribute('hidden'); setSvg(svgA, sc.aux, AUXVB[mode]); } else svgA.setAttribute('hidden', '');
      updateDyn();
    }

    // ---- the time loop
    function end() { S.running = false; S.done = true; }
    function advance(dt) {
      S.clock += dt;
      if (mode === 'grow') {
        let d = dt * 2.2;
        while (d > 1e-9) {
          const h = Math.min(0.1, d);
          S.pots.forEach((p) => stepGrow(P, p.st, p.v, h));
          S.day += h; d -= h;
          while (S.histDay < Math.floor(S.day + 1e-6)) { S.histDay++; S.pots.forEach((p) => p.st.hist.push(p.st.h)); }
          if (S.day >= S.maxDay - 1e-9) { S.day = S.maxDay; end(); break; }
        }
        S.pots.forEach((p) => { if (p.st.h > p.st.hist[0] * 1.8 + 0.5) fire('grew'); if (p.st.Tg < 0.5) fire('wilted'); });
      } else if (mode === 'germination') {
        let d = dt * 1.4;
        while (d > 1e-9) {
          const h = Math.min(0.1, d);
          S.pots.forEach((p) => { p.p = Math.min(1, p.p + germ(P, p.v).rate * h); });
          S.day += h; d -= h;
          if (S.day >= S.maxDay - 1e-9) { S.day = S.maxDay; end(); break; }
        }
        if (S.pots.some((p) => p.p >= 0.35)) fire('germinated');
      } else if (mode === 'tropism') {
        S.t = Math.min(48, S.t + dt * 5.5);
        S.ang = null;
        const v = S.pots[0].v;
        const a = { photo: tropAngle.photo(S.t, v.light), geo: tropAngle.geo(S.t), hydro: tropAngle.hydro(S.t, v.water), thigmo: tropAngle.thigmo(S.t) };
        S.ang = a;
        if (a.photo > 15 || a.geo > 15 || a.hydro > 15) fire('bent');
        if (S.t >= 48) end();
      } else if (mode === 'photosynthesis') {
        S.spawn += (S.pr.bubbles / 60) * 4 * dt;
        while (S.spawn >= 1) { S.spawn -= 1; S.bub.push({ x: 236 + ((S.count * 7) % 22), y: 262, r: 2.4 + (S.count % 3) * 0.5 }); S.count++; fire('bubbles'); }
        S.bub.forEach((b) => { b.y -= 62 * dt; b.x += (248 - b.x) * Math.min(1, dt * 1.6); });
        S.bub = S.bub.filter((b) => { if (b.y < 178) { S.gas = Math.min(1, S.gas + 0.012); return false; } return true; });
      } else if (mode === 'transpiration') {
        const dh = dt * 2.2;
        S.t = Math.min(24, S.t + dh);
        recompute();
        const loss = Math.min(S.ml, S.tr.rate * dh);
        S.ml -= loss; S.used += loss;
        S.wilt += ((S.ml < 12 ? 1 : 0) - S.wilt) * Math.min(1, dt * 1.5);
        recompute();
        if (S.used >= 3) fire('transpired');
        if (S.wilt > 0.5) fire('wilted');
        if (S.t >= 24) end();
      } else if (mode === 'flower') {
        S.t = Math.min(1, S.t + dt / 14);
        if (S.t >= 0.25) fire('pollinated');
        if (S.t >= 0.62) fire('fertilised');
        if (S.t >= 1) { fire('grew'); end(); }
      } else if (mode === 'seed-dispersal') {
        S.t = Math.min(1, S.t + dt / 6.5);
        if (S.t >= 1) { fire('dispersed'); end(); }
      } else if (mode === 'root-types') {
        if (S.clock >= 2) fire('absorbed');
      }
    }
    function finishSync() {
      if (mode === 'photosynthesis') { S.clock += 3; S.gas = Math.min(1, S.pr.rate * 0.8); S.count = Math.round(S.pr.bubbles * 0.2); S.bub = []; if (S.pr.bubbles > 0) fire('bubbles'); S.running = false; }
      else if (mode === 'root-types') { S.clock = 3; fire('absorbed'); S.running = false; }
      else { let n = 0; while (S.running && n++ < 4000) advance(0.1); }
    }
    function tick(now) {
      raf = 0;
      if (destroyed) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (S.running) {
        advance(dt);
        draw();
        if (S.running) raf = requestAnimationFrame(tick); else { buildPanel(); refreshInfo(); }
      }
    }
    function startLoop() { if (!raf && !destroyed) { last = performance.now(); raf = requestAnimationFrame(tick); } }

    // ---- actions
    function reset() {
      S.running = false; S.done = false; S.day = 0; S.histDay = 0; S.t = 0; S.clock = 0; S.gas = 0; S.count = 0; S.bub = []; S.spawn = 0; S.fired = {}; S.wilt = 0; S.used = 0; S.ang = null;
      S.ml = S.pots[0].v.water;
      S.pots.forEach((p) => { if (mode === 'grow') p.st = newGrow(P, p.v); if (mode === 'germination') p.p = 0; });
      S.msg = null; S.touched = true;
      recompute();
    }
    function togglePlay() {
      S.touched = true; S.msg = null;
      if (S.running) { S.running = false; }
      else {
        if (S.done || (mode === 'flower' && S.t >= 1) || (mode === 'seed-dispersal' && S.t >= 1)) reset();
        S.running = true; S.fired = {};
        api.emit('played');
        api.record(api.t(T2('Pressed play: ', 'प्ले दबाया: ')) + api.t(MODE_NAME[mode]));
        if (reduced()) { finishSync(); } else startLoop();
      }
      buildPanel(); draw(); refreshInfo();
    }
    function selectPot(i) {
      if (i < 0 || i >= potCount(config)) return;
      S.sel = i; S.msg = null; S.touched = true;
      if (mode === 'leaf-types' || mode === 'root-types') { S.spec = PLANT_IDS[i]; S.selPart = null; S.qi = 0; S.qDone = false; S.qWrong = new Set(); if (mode === 'root-types') { S.running = false; S.clock = 0; S.fired = {}; } }
      api.emit('picked:' + (i + 1));
      api.record(api.t(T2('Chose ', 'चुना: ')) + potLabel(i));
      buildPanel(); buildQuiz(); draw(); refreshInfo();
      api.speak(potLabel(i));
    }
    function selectPart(k) {
      const pp = mode === 'leaf-types' || mode === 'root-types' ? S.spec : S.plant;
      if (!partsFor(mode, pp).includes(k)) return;
      S.selPart = k; S.touched = true;
      if (mode === 'seed-dispersal') { S.t = 0; S.running = false; S.done = false; S.fired = {}; S.msg = null; } else { S.found.add(k); S.msg = { title: partName(k, mode, pp), body: partText(k, mode, pp) }; }
      api.emit('identified:' + k);
      api.record(api.t(T2('Looked at: ', 'देखा: ')) + api.t(partName(k, mode, pp)));
      buildPanel(); draw(); refreshInfo();
      api.speak(api.t(partName(k, mode, pp)));
    }
    function answerQ(i) {
      const bank = quizFor(mode, mode === 'leaf-types' || mode === 'root-types' ? S.spec : S.plant);
      if (!bank.length || S.qDone) return;
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      const q = bank[S.qi % bank.length];
      if (i === q.a) { S.qDone = true; api.record(api.t(T2('Answered correctly: ', 'सही उत्तर दिया: ')) + api.t(q.q)); api.emit('answered:right'); }
      else { S.qWrong.add(i); api.record(api.t(T2('Answered wrongly: ', 'गलत उत्तर दिया: ')) + api.t(q.q)); api.emit('answered:wrong'); }
      buildQuiz();
      const n = elQuiz.querySelector(S.qDone ? '[data-next]' : `[data-opt="${i}"]`); if (n) n.focus({ preventScroll: true });
    }
    function act(key) {
      if (!key || key.startsWith('slider:') || key === 'answer') return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'play') togglePlay();
      else if (key === 'reset') { reset(); api.emit('reset'); api.record(api.t(T2('Started again', 'फिर से शुरू किया'))); buildPanel(); draw(); refreshInfo(); }
      else if (key.startsWith('pot:')) selectPot(+key.slice(4) - 1);
      else if (key.startsWith('part:')) selectPart(key.slice(5));
    }
    function onClick(e) {
      const el = e.target.closest('[data-opt],[data-next],[data-svgpot],[data-svgpart],[data-key]');
      if (!el || !root.contains(el)) return;
      if (el.dataset.opt != null) answerQ(+el.dataset.opt);
      else if (el.dataset.next != null) { S.qi++; S.qDone = false; S.qWrong = new Set(); buildQuiz(); const b = elQuiz.querySelector('[data-opt]'); if (b) b.focus({ preventScroll: true }); }
      else if (el.dataset.svgpot) act('pot:' + el.dataset.svgpot);
      else if (el.dataset.svgpart) act('part:' + el.dataset.svgpart);
      else act(el.dataset.key);
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-svgpot],[data-svgpart]') && e.target.tagName.toLowerCase() === 'g') { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    const lastVal = {};
    function onInput(e) {
      const inp = e.target;
      if (!inp.matches || !inp.matches('input[data-var]')) return;
      const id = inp.dataset.var, key = 'slider:' + id;
      if (!api.allowed(key)) { inp.value = lastVal[id] != null ? lastVal[id] : inp.value; api.nudge(key); return; }
      const pot = S.pots[Math.min(S.sel, S.pots.length - 1)];
      pot.v[id] = +inp.value; lastVal[id] = +inp.value;
      S.touched = true; S.msg = null;
      if (mode === 'transpiration' && id === 'water') { S.ml = pot.v.water; S.used = 0; S.wilt = S.ml < 12 && S.running ? S.wilt : 0; }
      recompute(); updateSliders(); draw(); refreshInfo();
      api.emit('set:' + id);
    }
    function onChange(e) {
      const inp = e.target;
      if (inp.matches && inp.matches('input[data-var]')) api.record(api.t(T2('Set ', 'तय किया: ')) + api.t(vName(mode, inp.dataset.var)) + ' = ' + api.t(valText(inp.dataset.var, +inp.value, mode)));
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);

    buildBar(); buildPanel(); buildQuiz(); refreshInfo(); draw();
    vars.forEach((id) => { lastVal[id] = S.pots[Math.min(S.sel, S.pots.length - 1)].v[id]; });
    return {
      destroy() {
        destroyed = true; S.running = false;
        if (raf) cancelAnimationFrame(raf);
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
      },
    };
  }

  NCA_T.register({
    id: 'plant',
    css: CSS + CSS2,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'plant', 'variables', 'pots'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
      if (c.plant != null) {
        if (!PLANTS[c.plant]) e.push('unknown plant: ' + c.plant + ' (use ' + PLANT_IDS.join(', ') + ')');
        else if (PLANT_OK[c.mode] && !PLANT_OK[c.mode].includes(c.plant)) e.push('plant ' + c.plant + ' cannot be shown in mode ' + c.mode + ' (use ' + PLANT_OK[c.mode].join(', ') + ')');
      }
      const MV = MODEVARS[c.mode];
      if (c.variables != null) {
        if (!MV) e.push('variables: mode ' + c.mode + ' has no sliders');
        else if (!Array.isArray(c.variables) || !c.variables.length) e.push('variables: a non-empty array');
        else {
          c.variables.forEach((v) => { if (!VARS[v]) e.push('unknown variable: ' + v); else if (!MV.all.includes(v)) e.push('variable ' + v + ' does not apply to mode ' + c.mode + ' (use ' + MV.all.join(', ') + ')'); });
          if (new Set(c.variables).size !== c.variables.length) e.push('variables: each once');
        }
      }
      if (c.pots != null) {
        if (c.mode !== 'grow' && c.mode !== 'germination') e.push('pots: only for modes grow and germination');
        else if (!Number.isInteger(c.pots) || c.pots < 1 || c.pots > 4) e.push('pots: a whole number from 1 to 4');
      }
      return e;
    },
    keys(c) {
      const targets = [], events = ['answered:right', 'answered:wrong'];
      if (!c || !MODES.includes(c.mode)) return { targets: ['answer'], events };
      const mode = c.mode, pid = c.plant || DEFAULT_PLANT[mode];
      varsOf(c).forEach((v) => { targets.push('slider:' + v); events.push('set:' + v); });
      const np = potCount(c);
      for (let i = 1; i <= np; i++) { targets.push('pot:' + i); events.push('picked:' + i); }
      if (HAS_PLAY.includes(mode)) { targets.push('play', 'reset'); events.push('played', 'reset'); }
      partsFor(mode, mode === 'leaf-types' || mode === 'root-types' ? null : pid).forEach((k) => { targets.push('part:' + k); events.push('identified:' + k); });
      if (mode === 'germination' && pid && PLANTS[pid].cls === 'monocot' && !targets.includes('part:endosperm')) { targets.push('part:endosperm'); events.push('identified:endosperm'); }
      targets.push('answer');
      const extra = { grow: ['grew', 'wilted'], photosynthesis: ['bubbles'], transpiration: ['transpired', 'wilted'], germination: ['germinated'], tropism: ['bent'], flower: ['pollinated', 'fertilised', 'grew'], 'seed-dispersal': ['dispersed'], 'root-types': ['absorbed'] };
      (extra[mode] || []).forEach((e) => events.push(e));
      return { targets, events };
    },
    demo: { mode: 'grow', plant: 'bean', variables: ['light', 'water', 'soil', 'air', 'temperature'], pots: 3 },
    plants: PLANT_IDS,
    modes: MODES,
    model: { PLANTS, tempF, moist, newGrow, stepGrow, growStatus, photo, trans, germ, tropAngle, enzymeF },
    mount,
  });
})();
