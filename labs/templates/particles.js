// Template: Particle world. See the particles inside solids, liquids and gases; heat and cool them, dissolve
// solids, watch diffusion, separate mixtures and explore the gas laws. Every number comes from real data built in
// below (melting and boiling points, specific and latent heats, solubility tables, the viscosity of water, PV = nRT),
// so a lab can only choose among things that are true. Config:
//   { mode: 'states'|'dissolve'|'diffusion'|'separate'|'gaslaw',
//     substance?: states: water|wax|salt|air · dissolve: salt|sugar|wax · diffusion: ink|perfume · gaslaw: air,
//     temp?: starting °C (states, dissolve, diffusion), compare?: true (diffusion: a cold and a hot container),
//     mixture?: an id from MIX (separate), method?: one of that mixture's methods (separate),
//     hold?: 'none'|'temperature'|'pressure'|'volume' (gaslaw: which quantity stays fixed) }
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp, lerp, ease, mixHex } = L;
  const reduced = () => L.reducedMotion();
  const tx = (en, hi) => ({ en, hi });
  const K0 = 273.15;
  const R_GAS = 8.314;
  const randn = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const fmt = (v, d) => { const s = (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s.replace('-', '−'); };
  const interp = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) return lerp(tab[i - 1][1], tab[i][1], (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0])); return tab[tab.length - 1][1]; };
  const bez = (a, c, b, k) => ({ x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y });
  const mid = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

  // ---------- data ----------
  // States: melting and boiling points (°C, at 1 atm), specific heats c (J/g·K: solid, liquid, gas) and latent heats
  // (J/g). The heating curve below is drawn from these numbers, so its flat parts have their true relative lengths.
  const STATES = {
    water: { name: tx('Water', 'पानी'), forms: [tx('ice', 'बर्फ़'), tx('liquid water', 'द्रव पानी'), tx('steam (water vapour)', 'भाप (जलवाष्प)')], mp: 0, bp: 100, range: [-20, 120], start: -10, step: 1, c: [2.1, 4.18, 2.0], Lf: 334, Lv: 2257, floats: true, col: '#38BDF8',
      note: tx('Water melts at 0 °C and boils at 100 °C at sea level. Ice floats because it is lighter than the same amount of liquid water.', 'पानी 0 °C पर पिघलता है और समुद्र तल पर 100 °C पर उबलता है। बर्फ़ पानी पर तैरती है, क्योंकि वह उतने ही द्रव पानी से हल्की होती है।') },
    wax: { name: tx('Wax (paraffin)', 'मोम (पैराफ़िन)'), forms: [tx('solid wax', 'ठोस मोम'), tx('molten wax', 'पिघला मोम'), null], mp: 58, bp: null, range: [20, 100], start: 25, step: 1, c: [2.5, 2.9], Lf: 210, col: '#F59E0B',
      note: tx('Paraffin wax melts at about 58 °C. Wax catches fire long before it boils, so this jar only goes up to 100 °C.', 'पैराफ़िन मोम लगभग 58 °C पर पिघलता है। मोम उबलने से बहुत पहले जल उठता है, इसलिए यह जार 100 °C तक ही गर्म होता है।') },
    salt: { name: tx('Common salt', 'साधारण नमक'), forms: [tx('salt crystal', 'नमक का क्रिस्टल'), tx('molten salt', 'पिघला नमक'), tx('salt vapour', 'नमक की वाष्प')], mp: 801, bp: 1465, range: [25, 1600], start: 25, step: 5, c: [0.88, 1.14, 0.6], Lf: 482, Lv: 2930, ions: true, col: '#A78BFA',
      note: tx('Salt melts at 801 °C and boils at 1465 °C; only a furnace gets this hot. Its particles (sodium and chloride ions) hold each other very strongly.', 'नमक 801 °C पर पिघलता है और 1465 °C पर उबलता है; इतनी गर्मी केवल भट्ठी में मिलती है। इसके कण (सोडियम और क्लोराइड आयन) एक-दूसरे को बहुत मज़बूती से पकड़े रहते हैं।') },
    air: { name: tx('Nitrogen, the main gas in air', 'नाइट्रोजन, हवा की मुख्य गैस'), forms: [tx('solid nitrogen', 'ठोस नाइट्रोजन'), tx('liquid nitrogen', 'द्रव नाइट्रोजन'), tx('nitrogen gas', 'नाइट्रोजन गैस')], mp: -210, bp: -196, range: [-225, -180], start: -220, step: 1, c: [1.5, 2.04, 1.04], Lf: 25.7, Lv: 199, col: '#818CF8',
      note: tx('Air is a mixture of gases. Its main gas, nitrogen, turns liquid below −196 °C and solid below −210 °C.', 'हवा गैसों का मिश्रण है। इसकी मुख्य गैस नाइट्रोजन −196 °C से नीचे द्रव और −210 °C से नीचे ठोस बन जाती है।') },
  };
  // Dissolving: grams that dissolve in 100 g of water at each temperature (°C). The beaker holds 50 mL (50 g) of water.
  const SOLUB = {
    salt: [[0, 35.7], [20, 35.9], [40, 36.4], [60, 37.1], [80, 38.0], [100, 39.2]],
    sugar: [[0, 179.2], [20, 203.9], [40, 238.1], [60, 287.3], [80, 362.1], [100, 487.2]],
  };
  const WATER_G = 50;
  const DIS = {
    salt: { name: tx('Common salt', 'साधारण नमक'), g: 1, spoon: 5, max: 10, ions: true },
    sugar: { name: tx('Sugar', 'चीनी'), g: 2.5, spoon: 20, max: 12 },
    wax: { name: tx('Wax shavings', 'मोम की छीलन'), g: 1, spoon: 5, max: 4, insoluble: true },
  };
  // Diffusion: viscosity of water (mPa·s) by °C. In a liquid, D ∝ T/η (Stokes–Einstein); in a gas, D ∝ T^1.75.
  const VISC = [[0, 1.792], [10, 1.307], [20, 1.002], [30, 0.798], [40, 0.653], [50, 0.547], [60, 0.467], [70, 0.404], [80, 0.355], [90, 0.315], [100, 0.282]];
  const DIF = {
    ink: { name: tx('Ink in water', 'पानी में स्याही'), medium: 'liquid', range: [5, 90], start: 25, pair: [10, 60], col: '#C026D3', mcol: '#38BDF8' },
    perfume: { name: tx('Perfume in air', 'हवा में इत्र'), medium: 'gas', range: [0, 45], start: 25, pair: [10, 40], col: '#F472B6', mcol: '#93C5FD' },
  };
  // Separating mixtures. Each kind of particle has the properties the methods depend on.
  const SP = {
    water: { kind: 'liquid', col: '#60A5FA', r: 4.6, name: tx('water', 'पानी') },
    oil: { kind: 'liquid', light: true, col: '#FBBF24', r: 5, name: tx('oil', 'तेल') },
    milk: { kind: 'liquid', col: '#E2E8F0', r: 4.6, name: tx('skimmed milk', 'मलाई रहित दूध') },
    tea: { kind: 'liquid', col: '#D97706', r: 4.6, name: tx('tea', 'चाय') },
    sand: { kind: 'solid', dense: true, size: 'small', col: '#D4A373', r: 5, name: tx('sand', 'रेत') },
    chalk: { kind: 'solid', dense: true, size: 'tiny', col: '#F8FAFC', r: 3.4, name: tx('chalk powder', 'चॉक का पाउडर') },
    saltd: { kind: 'dissolved', col: '#F5F5F4', r: 3.2, crystal: true, name: tx('dissolved salt', 'घुला हुआ नमक') },
    salt: { kind: 'solid', dense: true, size: 'small', col: '#F8FAFC', r: 4.6, shape: 'cube', name: tx('salt', 'नमक') },
    iron: { kind: 'solid', dense: true, size: 'small', magnetic: true, col: '#94A3B8', r: 4.6, shape: 'filing', name: tx('iron filings', 'लोहे का बुरादा') },
    sulphur: { kind: 'solid', dense: true, size: 'small', col: '#FACC15', r: 4.6, name: tx('sulphur powder', 'गंधक का पाउडर') },
    flour: { kind: 'solid', size: 'tiny', col: '#FFF1D6', r: 3.4, name: tx('flour', 'आटा') },
    bran: { kind: 'solid', size: 'big', col: '#B45309', r: 7.5, shape: 'flake', name: tx('bran', 'चोकर') },
    pebble: { kind: 'solid', dense: true, size: 'big', col: '#94A3B8', r: 11, name: tx('pebbles', 'कंकड़') },
    leaves: { kind: 'solid', size: 'big', col: '#5B3A1A', r: 7, shape: 'flake', name: tx('tea leaves', 'चाय की पत्ती') },
    cream: { kind: 'fat', light: true, col: '#FEF3C7', r: 5, name: tx('cream (fat)', 'मलाई (वसा)') },
    dyeB: { kind: 'dye', col: '#3B82F6', rf: 0.82, r: 3.8, name: tx('blue dye', 'नीली डाई') },
    dyeY: { kind: 'dye', col: '#EAB308', rf: 0.55, r: 3.8, name: tx('yellow dye', 'पीली डाई') },
    dyeP: { kind: 'dye', col: '#EC4899', rf: 0.28, r: 3.8, name: tx('pink dye', 'गुलाबी डाई') },
    nh4cl: { kind: 'solid', dense: true, size: 'small', sublimes: true, col: '#C7D2FE', r: 4.6, shape: 'cube', name: tx('ammonium chloride', 'अमोनियम क्लोराइड') },
    camphor: { kind: 'solid', size: 'small', sublimes: true, col: '#CCFBF1', r: 4.6, name: tx('camphor', 'कपूर') },
  };
  const METHOD = {
    filter: { name: tx('Filtration', 'छानना (निस्यंदन)'), how: tx('Pour it through filter paper in a funnel. Bits too big for the paper’s tiny holes stay on the paper.', 'इसे कीप में रखे फ़िल्टर पेपर से डालो। जो कण पेपर के बारीक छेदों से बड़े हैं, वे पेपर पर रह जाते हैं।') },
    decant: { name: tx('Decantation', 'निथारना'), how: tx('Let the heavy bits settle at the bottom, then gently pour the top layer into another beaker.', 'भारी कणों को तली में बैठने दो, फिर ऊपर की परत को धीरे से दूसरे बीकर में डालो।') },
    evaporate: { name: tx('Evaporation', 'वाष्पन'), how: tx('Heat it in a china dish. The liquid turns into vapour and leaves; what was in it stays behind.', 'इसे चीनी मिट्टी की प्याली में गर्म करो। द्रव वाष्प बनकर उड़ जाता है; उसमें जो था, वह पीछे रह जाता है।') },
    distil: { name: tx('Distillation', 'आसवन'), how: tx('Boil it in a flask, cool the vapour in a condenser and collect the pure liquid.', 'इसे फ़्लास्क में उबालो, वाष्प को संघनित्र में ठंडा करो और शुद्ध द्रव इकट्ठा करो।') },
    magnet: { name: tx('Magnet', 'चुंबक'), how: tx('Move a magnet over the mixture. Only things made of iron, nickel or cobalt stick to it.', 'मिश्रण के ऊपर चुंबक घुमाओ। केवल लोहे, निकल या कोबाल्ट की चीज़ें उससे चिपकती हैं।') },
    sieve: { name: tx('Sieving', 'चालना (छलनी)'), how: tx('Shake the mixture in a sieve. Small bits fall through the holes; big bits stay on top.', 'मिश्रण को छलनी में हिलाओ। छोटे कण छेदों से नीचे गिरते हैं; बड़े कण ऊपर रह जाते हैं।') },
    chromatography: { name: tx('Chromatography', 'क्रोमैटोग्राफ़ी'), how: tx('Put a dot of ink on paper above the water. Water climbs the paper and carries each colour a different distance.', 'पानी से ऊपर कागज़ पर स्याही का बिंदु लगाओ। पानी कागज़ पर चढ़ता है और हर रंग को अलग दूरी तक ले जाता है।') },
    centrifuge: { name: tx('Centrifuge', 'अपकेंद्रण'), how: tx('Spin the tube very fast. Heavier particles are pushed to the bottom; lighter ones stay on top.', 'नली को बहुत तेज़ घुमाओ। भारी कण तली में चले जाते हैं; हल्के कण ऊपर रहते हैं।') },
    sublimation: { name: tx('Sublimation', 'ऊर्ध्वपातन'), how: tx('Heat it gently under an upside-down funnel. A solid that sublimes turns straight into vapour and becomes solid again on the cool funnel.', 'उलटी कीप के नीचे धीरे से गर्म करो। ऊर्ध्वपातित होने वाला ठोस सीधे वाष्प बनता है और ठंडी कीप पर फिर ठोस बन जाता है।') },
  };
  const ok = (en, hi) => ({ ok: true, note: tx(en, hi) });
  const no = (en, hi) => ({ ok: false, note: tx(en, hi) });
  const MIX = {
    'sand-water': { name: tx('Sand in water', 'पानी में रेत'), wet: true, parts: { water: 56, sand: 24 }, methods: {
      filter: ok('Sand stays on the filter paper and clear water drips into the beaker. Filtration worked.', 'रेत फ़िल्टर पेपर पर रह गई और साफ़ पानी बीकर में टपक गया। छानना सफल रहा।'),
      decant: ok('The heavy sand settled at the bottom, so the water could be poured off. Decantation worked.', 'भारी रेत तली में बैठ गई, इसलिए पानी को निथारकर अलग कर लिया। निथारना सफल रहा।'),
      evaporate: ok('The water went off as vapour and dry sand is left. It works, but the water is lost; filtering is quicker.', 'पानी वाष्प बनकर उड़ गया और सूखी रेत बची। यह काम करता है, पर पानी बेकार जाता है; छानना जल्दी होता है।'),
      magnet: no('Nothing sticks: sand is not attracted by a magnet.', 'कुछ नहीं चिपका: रेत चुंबक की ओर आकर्षित नहीं होती।') } },
    'chalk-water': { name: tx('Chalk powder in water', 'पानी में चॉक का पाउडर'), wet: true, parts: { water: 56, chalk: 30 }, methods: {
      filter: ok('The fine chalk is caught by the filter paper and clear water passes through.', 'बारीक चॉक फ़िल्टर पेपर पर रुक गया और साफ़ पानी नीचे निकल गया।'),
      centrifuge: ok('Spinning pushed the heavier chalk to the bottom of the tube; clear water stays above it.', 'घुमाने से भारी चॉक नली की तली में चला गया; ऊपर साफ़ पानी रह गया।'),
      evaporate: ok('The water left as vapour and the chalk powder stays in the dish, but the water is lost.', 'पानी वाष्प बनकर उड़ गया और चॉक प्याली में रह गया, पर पानी बेकार गया।'),
      sieve: no('Chalk powder is far finer than the holes of a sieve, so it falls through with the water.', 'चॉक का पाउडर छलनी के छेदों से बहुत बारीक है, इसलिए वह पानी के साथ नीचे गिर गया।') } },
    'salt-water': { name: tx('Salt dissolved in water', 'पानी में घुला नमक'), wet: true, parts: { water: 58, saltd: 22 }, methods: {
      evaporate: ok('The water evaporated and salt crystals are left in the dish. Salt is made from sea water this way.', 'पानी वाष्पित हो गया और प्याली में नमक के क्रिस्टल बचे। समुद्र के पानी से नमक इसी तरह बनता है।'),
      distil: ok('Pure water collected in the beaker and the salt stayed in the flask. Distillation gets back both.', 'शुद्ध पानी बीकर में इकट्ठा हुआ और नमक फ़्लास्क में रह गया। आसवन से दोनों वापस मिलते हैं।'),
      filter: no('Dissolved salt particles are far smaller than the holes in filter paper, so the water that comes through is still salty.', 'घुले हुए नमक के कण फ़िल्टर पेपर के छेदों से बहुत छोटे हैं, इसलिए नीचे आया पानी अब भी खारा है।'),
      decant: no('Dissolved salt never settles, so pouring off the top only pours the salt water.', 'घुला हुआ नमक कभी नीचे नहीं बैठता, इसलिए ऊपर से डालने पर खारा पानी ही जाता है।') } },
    'iron-sand': { name: tx('Iron filings and sand', 'लोहे का बुरादा और रेत'), parts: { iron: 24, sand: 30 }, methods: {
      magnet: ok('The iron filings jumped to the magnet and the sand is left on the plate.', 'लोहे का बुरादा चुंबक से चिपक गया और रेत प्लेट पर रह गई।'),
      sieve: no('Iron filings and sand grains are about the same size, so both fall through the sieve.', 'लोहे का बुरादा और रेत के दाने लगभग एक जैसे आकार के हैं, इसलिए दोनों छलनी से गिर गए।') } },
    'iron-sulphur': { name: tx('Iron filings and sulphur', 'लोहे का बुरादा और गंधक'), parts: { iron: 24, sulphur: 30 }, methods: {
      magnet: ok('The magnet pulled out the iron and yellow sulphur is left. This works because it is a mixture; heated together they would form iron sulphide, which a magnet cannot separate.', 'चुंबक ने लोहा खींच लिया और पीला गंधक बच गया। यह इसलिए हुआ क्योंकि यह मिश्रण है; साथ में गर्म करने पर आयरन सल्फ़ाइड बनता, जिसे चुंबक अलग नहीं कर सकता।'),
      sieve: no('Both powders are fine, so they fall through the holes together.', 'दोनों पाउडर बारीक हैं, इसलिए दोनों साथ में छेदों से गिर गए।') } },
    'flour-bran': { name: tx('Flour with bran', 'चोकर वाला आटा'), parts: { flour: 48, bran: 14 }, methods: {
      sieve: ok('Fine flour falls through the sieve and the bigger bran flakes stay on top, just as at home.', 'बारीक आटा छलनी से नीचे गिरा और बड़ा चोकर ऊपर रह गया, जैसे घर पर होता है।'),
      magnet: no('Neither flour nor bran is attracted by a magnet.', 'न आटा, न चोकर चुंबक की ओर आकर्षित होता है।') } },
    'sand-pebbles': { name: tx('Sand with pebbles', 'कंकड़ वाली रेत'), parts: { sand: 40, pebble: 7 }, methods: {
      sieve: ok('Sand falls through and the pebbles stay on the sieve, as builders do at a building site.', 'रेत नीचे गिरी और कंकड़ छलनी पर रह गए, जैसे मकान बनाते समय मिस्त्री करते हैं।'),
      magnet: no('Sand and pebbles are not attracted by a magnet.', 'रेत और कंकड़ चुंबक की ओर आकर्षित नहीं होते।') } },
    'tea-leaves': { name: tx('Tea with tea leaves', 'पत्ती वाली चाय'), wet: true, parts: { tea: 52, leaves: 12 }, methods: {
      filter: ok('The tea leaves stay behind and the tea passes through. A tea strainer is a kind of filter.', 'चाय की पत्ती पीछे रह गई और चाय नीचे निकल गई। चाय की छलनी भी एक तरह का फ़िल्टर है।'),
      magnet: no('Tea leaves are not attracted by a magnet.', 'चाय की पत्ती चुंबक की ओर आकर्षित नहीं होती।') } },
    'black-ink': { name: tx('Black sketch-pen ink', 'काले स्केच पेन की स्याही'), wet: true, parts: { water: 34, dyeB: 14, dyeY: 14, dyeP: 14 }, methods: {
      chromatography: ok('Water climbed the paper and carried each dye a different distance. The black ink was a mixture of colours.', 'पानी कागज़ पर चढ़ा और हर डाई को अलग दूरी तक ले गया। काली स्याही असल में रंगों का मिश्रण थी।'),
      filter: no('The dyes are dissolved, so they all pass through the filter paper together.', 'डाई घुली हुई हैं, इसलिए सब एक साथ फ़िल्टर पेपर से निकल गईं।'),
      evaporate: no('The water left, but all the dyes stay mixed together in one dark patch.', 'पानी उड़ गया, पर सारी डाई एक ही गहरे धब्बे में मिली रह गईं।') } },
    'cream-milk': { name: tx('Cream in milk', 'दूध में मलाई'), wet: true, parts: { milk: 52, cream: 22 }, methods: {
      centrifuge: ok('Spinning sent the lighter cream to the top and the heavier skimmed milk below. Dairies separate cream this way.', 'घुमाने से हल्की मलाई ऊपर आ गई और भारी, मलाई रहित दूध नीचे रहा। डेयरी में मलाई ऐसे ही अलग करते हैं।'),
      filter: no('The tiny drops of fat pass through filter paper along with the milk.', 'वसा की बहुत छोटी बूँदें दूध के साथ फ़िल्टर पेपर से निकल जाती हैं।') } },
    'oil-water': { name: tx('Oil and water', 'तेल और पानी'), wet: true, parts: { water: 44, oil: 34 }, methods: {
      decant: ok('Oil floats on water and does not mix, so the top oil layer can be poured off carefully. A separating funnel does this even better.', 'तेल पानी पर तैरता है और मिलता नहीं, इसलिए ऊपर की तेल की परत ध्यान से निथारी जा सकती है। पृथक्कारी कीप यह और अच्छे से करती है।'),
      centrifuge: ok('Spinning made two sharp layers: lighter oil on top and water below.', 'घुमाने से दो साफ़ परतें बनीं: ऊपर हल्का तेल और नीचे पानी।') } },
    'nh4cl-salt': { name: tx('Ammonium chloride and salt', 'अमोनियम क्लोराइड और नमक'), parts: { nh4cl: 28, salt: 28 }, methods: {
      sublimation: ok('Ammonium chloride turned straight into vapour and became solid again on the cool funnel. The salt stays in the dish.', 'अमोनियम क्लोराइड सीधे वाष्प बना और ठंडी कीप पर फिर ठोस बन गया। नमक प्याली में रह गया।'),
      sieve: no('Both are fine powders, so they fall through the sieve together.', 'दोनों बारीक पाउडर हैं, इसलिए साथ में छलनी से गिर गए।'),
      magnet: no('Neither substance is attracted by a magnet.', 'इनमें से कोई भी चुंबक की ओर आकर्षित नहीं होता।') } },
    'camphor-salt': { name: tx('Camphor and salt', 'कपूर और नमक'), parts: { camphor: 26, salt: 28 }, methods: {
      sublimation: ok('Camphor sublimes: it turned into vapour and formed solid again on the cool funnel. The salt stays in the dish.', 'कपूर ऊर्ध्वपातित होता है: वह वाष्प बना और ठंडी कीप पर फिर ठोस बन गया। नमक प्याली में रह गया।'),
      sieve: no('Both are small crystals, so they fall through together.', 'दोनों छोटे क्रिस्टल हैं, इसलिए साथ में गिर गए।') } },
  };
  const MODES = ['states', 'dissolve', 'diffusion', 'separate', 'gaslaw'];
  const MODE_SUBS = { states: Object.keys(STATES), dissolve: Object.keys(DIS), diffusion: Object.keys(DIF), gaslaw: ['air'] };
  const HOLDS = ['none', 'temperature', 'pressure', 'volume'];
  const GAS = { T: [150, 500], P: [50, 250], T0: 300, P0: 101.3, Vmax: 85 };

  // ---------- heating curve (states) ----------
  function buildCurve(S) {
    const [a, b] = S.range; const seg = []; let E = 0;
    const add = (type, T0, T1, dE) => { seg.push({ type, T0, T1, E0: E, E1: E + dE }); E += dE; };
    const top = S.bp != null && S.bp <= b ? S.bp : b;
    add('solid', a, S.mp, (S.mp - a) * S.c[0]);
    add('melt', S.mp, S.mp, S.Lf);
    add('liquid', S.mp, top, (top - S.mp) * S.c[1]);
    if (S.bp != null && S.bp <= b) { add('boil', S.bp, S.bp, S.Lv); add('gas', S.bp, b, (b - S.bp) * S.c[2]); }
    return { seg, Emax: E };
  }
  function atE(cv, E) {
    E = clamp(E, 0, cv.Emax);
    const s = cv.seg.find((x) => E <= x.E1) || cv.seg[cv.seg.length - 1];
    const f = s.E1 > s.E0 ? (E - s.E0) / (s.E1 - s.E0) : 1;
    const T = lerp(s.T0, s.T1, f);
    if (s.type === 'solid') return { T, m: 0, b: 0 };
    if (s.type === 'melt') return { T, m: f, b: 0 };
    if (s.type === 'liquid') return { T, m: 1, b: 0 };
    if (s.type === 'boil') return { T, m: 1, b: f };
    return { T, m: 1, b: 1 };
  }
  function eAtT(cv, T) {
    for (const s of cv.seg) {
      if (s.T0 === s.T1) { if (Math.abs(T - s.T0) < 1e-9) return (s.E0 + s.E1) / 2; continue; }
      if (T >= s.T0 && T <= s.T1) return lerp(s.E0, s.E1, (T - s.T0) / (s.T1 - s.T0));
    }
    return T <= cv.seg[0].T0 ? 0 : cv.Emax;
  }
  const phaseOf = (c) => (c.b >= 1 ? 'gas' : c.b > 0 ? 'boiling' : c.m >= 1 ? 'liquid' : c.m > 0 ? 'melting' : 'solid');

  // ---------- validation ----------
  function rangeFor(mode, sub) {
    if (mode === 'states') return STATES[sub || 'water'].range;
    if (mode === 'dissolve') return [0, 100];
    if (mode === 'diffusion') return DIF[sub || 'ink'].range;
    return null;
  }
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const known = ['mode', 'substance', 'method', 'mixture', 'temp', 'hold', 'compare'];
    Object.keys(c).forEach((k) => { if (!known.includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push('mode must be one of ' + MODES.join(', ')); return e; }
    const m = c.mode;
    if (c.substance != null) {
      if (m === 'separate') e.push('separate mode takes a mixture, not a substance');
      else if (!MODE_SUBS[m].includes(c.substance)) e.push(`substance "${c.substance}" is not possible in ${m} mode (choose ${MODE_SUBS[m].join(', ')})`);
    }
    if (m !== 'separate' && (c.mixture != null || c.method != null)) e.push('mixture and method belong to separate mode only');
    if (m === 'separate') {
      if (c.mixture != null && !MIX[c.mixture]) e.push('unknown mixture: ' + c.mixture);
      if (c.method != null) {
        if (!METHOD[c.method]) e.push('unknown method: ' + c.method);
        else {
          const mx = MIX[c.mixture || 'sand-water'];
          if (mx && !mx.methods[c.method]) e.push(`method "${c.method}" is not offered for mixture "${c.mixture || 'sand-water'}" (choose ${Object.keys(mx.methods).join(', ')})`);
        }
      }
    }
    if (c.temp != null) {
      const r = rangeFor(m, c.substance);
      if (!r) e.push('temp is only for states, dissolve and diffusion modes');
      else if (typeof c.temp !== 'number' || !isFinite(c.temp)) e.push('temp must be a number in °C');
      else if (MODE_SUBS[m].includes(c.substance || MODE_SUBS[m][0]) && (c.temp < r[0] || c.temp > r[1])) e.push(`temp must be between ${r[0]} and ${r[1]} °C here`);
      if (m === 'diffusion' && c.compare) e.push('compare uses its own two temperatures; leave out temp');
    }
    if (c.hold != null && (m !== 'gaslaw' || !HOLDS.includes(c.hold))) e.push('hold is for gaslaw mode: ' + HOLDS.join(', '));
    if (c.compare != null && (m !== 'diffusion' || typeof c.compare !== 'boolean')) e.push('compare is a true/false option of diffusion mode');
    return e;
  }
  function keys(c) {
    c = c || {};
    const m = c.mode;
    if (m === 'states') {
      const S = STATES[c.substance] || STATES.water;
      return { targets: ['heat', 'cool', 'slider:temp'], events: ['state:solid', 'state:liquid'].concat(S.bp != null && S.bp <= S.range[1] ? ['state:gas'] : [], ['changed:temp']) };
    }
    if (m === 'dissolve') {
      const D = DIS[c.substance] || DIS.salt;
      return { targets: ['add', 'stir', 'heat', 'slider:temp'], events: (D.insoluble ? [] : ['dissolved']).concat(['changed:temp']) };
    }
    if (m === 'diffusion') return c.compare ? { targets: ['add'], events: ['spread'] } : { targets: ['add', 'slider:temp'], events: ['spread', 'changed:temp'] };
    if (m === 'separate') {
      const mx = MIX[c.mixture] || MIX['sand-water'];
      const ms = c.method ? [c.method] : Object.keys(mx.methods);
      return { targets: ms.map((x) => 'method:' + x).concat(['run']), events: ['separated'] };
    }
    if (m === 'gaslaw') {
      const h = c.hold || 'none';
      const t = [];
      if (h !== 'temperature') t.push('heat', 'cool', 'slider:temp');
      if (h === 'none' || h === 'temperature') t.push('slider:pressure');
      return { targets: t, events: (h !== 'temperature' ? ['changed:temp'] : []).concat(h !== 'pressure' ? ['changed:pressure'] : []) };
    }
    return { targets: [], events: [] };
  }

  // ---------- drawing helpers ----------
  const sprites = {};
  function sprite(col, r) {
    const k = col + '|' + r;
    if (sprites[k]) return sprites[k];
    const off = Math.ceil(r + 2), sc = 3;
    const c = document.createElement('canvas');
    c.width = c.height = off * 2 * sc;
    const g = c.getContext('2d');
    g.scale(sc, sc);
    const grd = g.createRadialGradient(off - r * 0.35, off - r * 0.4, r * 0.08, off, off, r);
    grd.addColorStop(0, mixHex(col, '#ffffff', 0.7)); grd.addColorStop(0.5, col); grd.addColorStop(1, mixHex(col, '#000000', 0.35));
    g.fillStyle = grd; g.beginPath(); g.arc(off, off, r, 0, Math.PI * 2); g.fill();
    return (sprites[k] = { c, off });
  }
  function dot(ctx, col, r, x, y, a) { const s = sprite(col, r); ctx.globalAlpha = a == null ? 1 : a; ctx.drawImage(s.c, x - s.off, y - s.off, s.off * 2, s.off * 2); ctx.globalAlpha = 1; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function bg(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0B1640'); g.addColorStop(1, '#1A2C6E');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#9DB4FF'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function glassBeaker(ctx, x0, y0, x1, y1) {
    ctx.save();
    ctx.fillStyle = 'rgba(190,220,255,.07)'; rr(ctx, x0, y0, x1 - x0, y1 - y0, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(214,232,255,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0 - 6, y0); ctx.lineTo(x0, y0 + 4); ctx.lineTo(x0, y1 - 12); ctx.quadraticCurveTo(x0, y1, x0 + 12, y1); ctx.lineTo(x1 - 12, y1); ctx.quadraticCurveTo(x1, y1, x1, y1 - 12); ctx.lineTo(x1, y0 + 4); ctx.lineTo(x1 + 6, y0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0 + 9, y0 + 18); ctx.lineTo(x0 + 9, y1 - 22); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,232,255,.5)'; ctx.lineWidth = 1.5;
    for (let k = 1; k <= 4; k++) { const y = y1 - k * (y1 - y0) / 5; ctx.beginPath(); ctx.moveTo(x1 - 16, y); ctx.lineTo(x1 - 4, y); ctx.stroke(); }
    ctx.restore();
  }
  function flame(ctx, x, y, size, time) {
    if (size <= 0) return;
    const f = 1 + 0.08 * Math.sin(time * 19) + 0.05 * Math.sin(time * 31);
    const h = 34 * size * f, w = 12 * size;
    ctx.save();
    const g = ctx.createRadialGradient(x, y - h * 0.3, 1, x, y - h * 0.3, h);
    g.addColorStop(0, 'rgba(255,240,180,.95)'); g.addColorStop(0.4, 'rgba(255,140,40,.85)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.5, x, y - h); ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(96,165,250,.9)'; ctx.beginPath(); ctx.ellipse(x, y - 4, w * 0.45, 7 * size, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function burner(ctx, x, yTop, yBot, on, time) {
    ctx.save();
    ctx.fillStyle = '#475569'; rr(ctx, x - 10, yTop + 10, 20, yBot - yTop - 16, 3); ctx.fill();
    ctx.fillStyle = '#334155'; rr(ctx, x - 26, yBot - 8, 52, 8, 3); ctx.fill();
    ctx.fillStyle = '#64748B'; rr(ctx, x - 12, yTop + 6, 24, 6, 2); ctx.fill();
    ctx.restore();
    if (on) flame(ctx, x, yTop + 6, on, time);
  }
  function label(ctx, h, text, x, y, opt) {
    opt = opt || {};
    ctx.save();
    ctx.font = `${opt.weight || 700} ${h.fs(opt.size || 13)}px Mukta, "Noto Sans Devanagari", system-ui, sans-serif`;
    ctx.textAlign = opt.align || 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    if (opt.pill) {
      const ph = h.fs(opt.size || 13) + 8, px = opt.align === 'left' ? x - 6 : opt.align === 'right' ? x - w - 6 : x - w / 2 - 6;
      ctx.fillStyle = opt.pill; rr(ctx, px, y - ph / 2, w + 12, ph, ph / 2); ctx.fill();
    }
    ctx.fillStyle = opt.col || '#E8EEFF'; ctx.fillText(text, x, y);
    ctx.restore();
  }
  function thermo(ctx, h, x, y0, y1, frac, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; rr(ctx, x - 8, y0, 16, y1 - y0, 8); ctx.fill();
    ctx.fillStyle = '#E5484D';
    const top = lerp(y1 - 4, y0 + 6, clamp(frac, 0, 1));
    rr(ctx, x - 3.5, top, 7, y1 - top, 3); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y1 + 8, 12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y1 + 8, 8.5, 0, Math.PI * 2); ctx.fillStyle = '#E5484D'; ctx.fill();
    ctx.restore();
    if (text) label(ctx, h, text, x, y0 - 16, { pill: 'rgba(229,72,77,.92)', col: '#fff', size: 13 });
  }

  // Charts drawn as SVG strings for the side panel.
  function chartSVG(o) {
    // o: { xl, yl, x:[min,max], y:[min,max], lines:[{pts, cls}], dot:{x,y}, marks:[{y, text}], vmarks }
    const X0 = 46, X1 = 308, Y0 = 14, Y1 = 166;
    const sx = (v) => X0 + (v - o.x[0]) / (o.x[1] - o.x[0]) * (X1 - X0);
    const sy = (v) => Y1 - (v - o.y[0]) / (o.y[1] - o.y[0]) * (Y1 - Y0);
    const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('');
    let s = `<svg viewBox="0 0 320 200" class="pt-chartsvg" role="img" aria-label="${esc(o.aria || '')}">`;
    s += `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" class="pt-ch-bg" rx="6"/>`;
    (o.marks || []).forEach((mk) => { const y = sy(mk.y); s += `<line x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" class="pt-ch-mark"/><text x="${X1 - 4}" y="${y - 4}" text-anchor="end" class="pt-ch-mtext">${esc(mk.text)}</text>`; });
    (o.ticks || []).forEach((tk) => { s += `<text x="${X0 - 5}" y="${sy(tk) + 4}" text-anchor="end" class="pt-ch-tick">${esc(fmt(tk))}</text>`; });
    (o.xticks || []).forEach((tk) => { s += `<text x="${sx(tk)}" y="${Y1 + 13}" text-anchor="middle" class="pt-ch-tick">${esc(fmt(tk))}</text>`; });
    (o.lines || []).forEach((ln) => { s += `<path d="${path(ln.pts)}" class="${ln.cls}"/>`; });
    if (o.dot) s += `<circle cx="${sx(o.dot[0])}" cy="${sy(o.dot[1])}" r="6.5" class="pt-ch-dot"/>`;
    s += `<text x="${(X0 + X1) / 2}" y="196" text-anchor="middle" class="pt-ch-axis">${esc(o.xl)}</text>`;
    s += `<text x="12" y="${(Y0 + Y1) / 2}" text-anchor="middle" class="pt-ch-axis" transform="rotate(-90 12 ${(Y0 + Y1) / 2})">${esc(o.yl)}</text></svg>`;
    return s;
  }

  const CSS = `.pt-wrap { container-type: inline-size; display: flex; flex-direction: column; gap: 12px; color: var(--ink); }
.pt-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@container (min-width: 760px) { .pt-grid { grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr); align-items: start; } }
.pt-stage { position: relative; border-radius: 18px; overflow: hidden; background: #0B1640; box-shadow: 0 10px 30px rgba(6,18,51,.28), inset 0 0 0 1px rgba(157,180,255,.18); }
.pt-cv { display: block; width: 100%; height: auto; }
.pt-left { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pt-tag { position: absolute; left: 10px; bottom: 8px; max-width: calc(100% - 20px); background: rgba(6,18,51,.78); color: #fff; border-radius: 999px; padding: 3px 12px; font: 700 .85rem/1.5 var(--font-body); pointer-events: none; }
.pt-tag:empty { display: none; }
@container (max-width: 520px) { .pt-tag { display: none; } }
.pt-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pt-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; min-width: 0; }
.pt-card h3 { margin: 0 0 6px; font: 700 1rem/1.3 var(--font-display); color: var(--ink); }
.pt-card p { margin: 0; color: var(--ink-2); font-size: .92rem; line-height: 1.45; }
.pt-state { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.pt-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 14px; font: 800 1.05rem/1.4 var(--font-display); color: #fff; background: #1D4ED8; }
.pt-pill.solid { background: #1D4ED8; } .pt-pill.melting, .pt-pill.boiling, .pt-pill.sat { background: #8B3DFF; } .pt-pill.liquid { background: #0F766E; } .pt-pill.gas { background: #4400F0; } .pt-pill.done { background: #0F766E; } .pt-pill.wait { background: #061233; }
.pt-big { font: 800 1.35rem/1.2 var(--font-display); color: var(--ink); }
.pt-small { font-size: .82rem; color: var(--ink-2); }
.pt-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.pt-btn { min-height: 48px; min-width: 48px; padding: 0 16px; border-radius: 14px; border: 0; font: 700 1rem/1.2 var(--font-display); display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 3px 0 rgba(6,18,51,.25); transition: transform .12s, box-shadow .12s, filter .2s; flex: 1 1 auto; }
.pt-btn:hover { filter: brightness(1.06); } .pt-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(6,18,51,.25); }
.pt-btn:focus-visible, .pt-sl input:focus-visible { outline: 3px solid #02CFF9; outline-offset: 2px; }
.pt-hot { background: linear-gradient(180deg, #FF9A4D, #FF7A1A); color: #1E293B; }
.pt-cold { background: linear-gradient(180deg, #5BE3FF, #02CFF9); color: #1E293B; }
.pt-add { background: linear-gradient(180deg, #A366FF, #8B3DFF); color: #fff; }
.pt-stir { background: linear-gradient(180deg, #14968A, #0F766E); color: #fff; }
.pt-go { background: linear-gradient(180deg, #2E63F0, #1D4ED8); color: #fff; }
.pt-btn[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--surface), 0 0 0 6px #8B3DFF; }
.pt-meth { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 168px), 1fr)); gap: 8px; }
.pt-mbtn { min-height: 48px; border-radius: 12px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .98rem/1.2 var(--font-display); padding: 6px 10px; text-align: left; display: flex; align-items: center; gap: 8px; }
.pt-mbtn[aria-pressed="true"] { border-color: #8B3DFF; background: var(--grape-t); }
.pt-mbtn .pt-mi { width: 12px; height: 12px; border-radius: 4px; background: #8B3DFF; flex: none; opacity: .35; }
.pt-mbtn[aria-pressed="true"] .pt-mi { opacity: 1; }
.pt-sl { display: grid; gap: 2px; }
.pt-sl label { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: .95rem; }
.pt-sl output { font: 800 1rem var(--font-display); color: var(--royal); white-space: nowrap; }
.pt-sl input { width: 100%; height: 44px; accent-color: #8B3DFF; margin: 0; cursor: pointer; }
.pt-sl .pt-ends { display: flex; justify-content: space-between; font-size: .78rem; color: var(--ink-2); margin-top: -6px; }
.pt-read { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.pt-read > div { background: var(--sunk); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.pt-bar { height: 12px; border-radius: 999px; background: var(--sunk); overflow: hidden; border: 1px solid var(--line); }
.pt-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #14B8A6, #22C55E); border-radius: 999px; transition: width .3s; }
.pt-bar.sat i { background: linear-gradient(90deg, #8B3DFF, #FF6B57); }
.pt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.pt-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--sunk); font-size: .88rem; font-weight: 600; }
.pt-chip i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
.pt-chartsvg { width: 100%; height: auto; display: block; }
.pt-ch-bg { fill: var(--sunk); }
.pt-ch-mark { stroke: var(--ink-2); stroke-dasharray: 4 4; stroke-width: 1; opacity: .7; }
.pt-ch-mtext, .pt-ch-tick { fill: var(--ink-2); font: 600 11px var(--font-body); }
.pt-ch-axis { fill: var(--ink); font: 700 12px var(--font-body); }
.pt-ch-all { fill: none; stroke: var(--line); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
.pt-ch-done { fill: none; stroke: #FF7A1A; stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
.pt-ch-line { fill: none; stroke: #8B3DFF; stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
.pt-ch-dash { fill: none; stroke: #8B3DFF; stroke-width: 2; stroke-dasharray: 5 5; opacity: .7; }
.pt-ch-dot { fill: #FF7A1A; stroke: var(--surface); stroke-width: 3; }
.pt-live { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--royal-t); color: var(--ink); min-height: 48px; font-weight: 600; line-height: 1.45; }
.pt-photo { width: 100%; border-radius: 12px; display: block; }
@media (prefers-reduced-motion: reduce) { .pt-btn, .pt-bar i { transition: none; } }`;

  // ---------- mode: states ----------
  function statesCtl(cfg, api, h) {
    const id = cfg.substance || 'water';
    const S = STATES[id];
    const cv = buildCurve(S);
    const H = 440;
    let E = eAtT(cv, cfg.temp != null ? cfg.temp : S.start);
    let dir = 0, time = 0, lift = 0; // lift: how far the floating ice block is raised (negative lowers it)
    let cur = atE(cv, E), phase = phaseOf(cur), Emin = E, Emax = E;
    const cols = 10, rows = 6, d = 26, r = 10.5;
    const jar = { x0: 140, x1: 440, y0: 58, y1: 356 };
    const P = [];
    for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
      const hx = jar.x0 + (300 - cols * d) / 2 + d / 2 + c * d, hy = jar.y1 - 4 - d / 2 - row * d;
      // a solid that sinks in its own liquid melts from the top; ice (lighter than water) melts from below and rests on its meltwater
      P.push({ hx, hy, row, x: hx, y: hy, px: hx, py: hy, key: (S.floats ? row : rows - 1 - row) / (rows - 1) * 0.7 + Math.random() * 0.3, br: Math.random(), ph: Math.random() * 6.28, ph2: Math.random() * 6.28, col: S.ions ? ((row + c) % 2 ? '#22C55E' : '#A78BFA') : S.col, rr: S.ions ? ((row + c) % 2 ? 11 : 8) : r, st: 'solid' });
    }
    P.slice().sort((a, b) => b.key - a.key).forEach((p, i) => { p.mr = i / P.length; });
    P.slice().sort((a, b) => a.br - b.br).forEach((p, i) => { p.br = i / P.length; });
    const lo = S.range[0], hi = S.range[1];
    const names = (ph) => ({
      solid: tx('Solid', 'ठोस'), melting: tx('Melting', 'पिघल रहा है'), liquid: tx('Liquid', 'द्रव'), boiling: tx('Boiling', 'उबल रहा है'), gas: tx('Gas', 'गैस'),
    })[ph];
    const desc = (ph) => ({
      solid: tx('The particles are packed close together in fixed places. They only vibrate where they are, so a solid keeps its shape.', 'कण अपनी तय जगहों पर पास-पास जमे हैं। वे बस अपनी जगह पर काँपते हैं, इसलिए ठोस का आकार नहीं बदलता।'),
      melting: tx(`Heat is breaking particles free from their fixed places. The temperature stays at ${fmt(S.mp)} °C until all of it has melted.`, `ऊष्मा कणों को उनकी तय जगह से छुड़ा रही है। जब तक सब पिघल न जाए, तापमान ${fmt(S.mp)} °C पर ही रुका रहता है।`),
      liquid: tx('The particles are still close, but they slide past each other. That is why a liquid flows and takes the shape of its container.', 'कण अब भी पास-पास हैं, पर एक-दूसरे के ऊपर से फिसलते हैं। इसीलिए द्रव बहता है और बर्तन का आकार ले लेता है।'),
      boiling: tx(`Particles are escaping from the liquid as a gas. The temperature stays at ${fmt(S.bp)} °C until all of it has boiled.`, `कण द्रव से निकलकर गैस बन रहे हैं। जब तक सब उबल न जाए, तापमान ${fmt(S.bp)} °C पर ही रुका रहता है।`),
      gas: tx('The particles are far apart and move fast in every direction, so the gas fills the whole sealed jar.', 'कण एक-दूसरे से दूर हैं और हर दिशा में तेज़ी से चलते हैं, इसलिए गैस पूरे बंद जार में भर जाती है।'),
    })[ph];
    const form = (ph) => S.forms[ph === 'solid' || ph === 'melting' ? 0 : ph === 'gas' || ph === 'boiling' ? 2 : 1];
    const pct = (T) => (T - lo) / (hi - lo);
    let last = '';
    function side() {
      h.side.innerHTML = `
        <div class="pt-card"><div class="pt-state"><span class="pt-pill" data-r="pill"></span><span class="pt-big" data-r="temp"></span></div><p class="pt-small" data-r="form" style="margin-top:4px"></p></div>
        <div class="pt-btns">
          <button type="button" class="pt-btn pt-hot" data-key="heat" aria-pressed="false">${esc(api.t(tx('Heat', 'गर्म करो')))}</button>
          <button type="button" class="pt-btn pt-cold" data-key="cool" aria-pressed="false">${esc(api.t(tx('Cool', 'ठंडा करो')))}</button>
        </div>
        <div class="pt-card pt-sl"><label for="pt-st-t"><span>${esc(api.t(tx('Temperature', 'तापमान')))}</span><output data-r="tout"></output></label>
          <input id="pt-st-t" type="range" data-key="slider:temp" min="${lo}" max="${hi}" step="${S.step}" value="${Math.round(cur.T)}" aria-label="${esc(api.t(tx('Temperature in degrees Celsius', 'तापमान डिग्री सेल्सियस में')))}">
          <div class="pt-ends"><span>${fmt(lo)} °C</span><span>${fmt(hi)} °C</span></div></div>
        <div class="pt-card"><p data-r="desc"></p></div>
        <div class="pt-card"><h3>${esc(api.t(tx('Heating curve', 'तापन वक्र')))}</h3><div data-r="chart"></div><p class="pt-small">${esc(api.t(S.note))}</p></div>`;
      last = '';
      paint(true);
    }
    function paint(force) {
      const key = phase + '|' + fmt(cur.T, 0) + '|' + dir + '|' + Math.round(Emin) + '|' + Math.round(Emax);
      if (!force && key === last) return;
      last = key;
      const q = (k) => h.side.querySelector(`[data-r="${k}"]`);
      const pill = q('pill'); pill.className = 'pt-pill ' + phase; pill.textContent = api.t(names(phase));
      q('temp').textContent = `${fmt(cur.T)} °C`;
      q('form').textContent = `${api.t(S.name)} · ${api.t(form(phase))} · ${fmt(cur.T + K0)} K`;
      q('tout').textContent = `${fmt(cur.T)} °C`;
      q('desc').textContent = api.t(desc(phase));
      const sl = h.side.querySelector('[data-key="slider:temp"]'); if (sl && document.activeElement !== sl) sl.value = Math.round(cur.T);
      h.side.querySelector('[data-key="heat"]').setAttribute('aria-pressed', String(dir > 0));
      h.side.querySelector('[data-key="cool"]').setAttribute('aria-pressed', String(dir < 0));
      const pts = []; cv.seg.forEach((s) => { pts.push([s.E0, s.T0]); pts.push([s.E1, s.T1]); });
      const done = []; cv.seg.forEach((s) => { const a = Math.max(s.E0, Emin), b = Math.min(s.E1, Emax); if (b >= a) { done.push([a, atE(cv, a).T]); done.push([b, atE(cv, b).T]); } });
      const marks = [{ y: S.mp, text: api.t(tx('melts', 'पिघलता')) + ' ' + fmt(S.mp) + ' °C' }];
      if (S.bp != null && S.bp <= hi) marks.push({ y: S.bp, text: api.t(tx('boils', 'उबलता')) + ' ' + fmt(S.bp) + ' °C' });
      q('chart').innerHTML = chartSVG({ xl: api.t(tx('Heat given →', 'दी गई ऊष्मा →')), yl: api.t(tx('Temperature °C', 'तापमान °C')), x: [0, cv.Emax], y: [lo, hi], ticks: [lo, hi], marks, lines: [{ pts, cls: 'pt-ch-all' }, { pts: done, cls: 'pt-ch-done' }], dot: [E, cur.T], aria: api.t(tx('Heating curve: temperature against heat given', 'तापन वक्र: दी गई ऊष्मा के साथ तापमान')) });
      h.tag(api.t(tx('Magnified view: each ball is one particle', 'बड़ा करके देखो: हर गेंद एक कण है')));
    }
    function setE(nE) {
      E = clamp(nE, 0, cv.Emax); cur = atE(cv, E);
      Emin = Math.min(Emin, E); Emax = Math.max(Emax, E);
      const ph = phaseOf(cur);
      if (ph !== phase) {
        phase = ph;
        h.live(desc(ph));
        api.record(api.t(tx('Now ', 'अब ')) + api.t(names(ph)).toLowerCase() + ` (${fmt(cur.T)} °C)`);
        if (ph === 'solid' || ph === 'liquid' || ph === 'gas') api.emit('state:' + ph);
      }
    }
    function stopAtEnd() {
      if (dir > 0 && E >= cv.Emax) { dir = 0; api.toast(S.bp == null ? tx('This is as hot as this jar goes: wax would catch fire.', 'यह जार इससे ज़्यादा गर्म नहीं होता: मोम में आग लग जाएगी।') : tx('This is as hot as this lab goes.', 'यह लैब इससे ज़्यादा गर्म नहीं होती।')); }
      if (dir < 0 && E <= 0) { dir = 0; api.toast(tx('This is as cold as this lab goes.', 'यह लैब इससे ज़्यादा ठंडी नहीं होती।')); }
    }
    function jumpTarget(sign) {
      const bounds = [0].concat(cv.seg.map((s) => s.E1));
      const phaseEnds = cv.seg.filter((s) => s.type === 'melt' || s.type === 'boil').map((s) => (sign > 0 ? s.E1 : s.E0)).concat([sign > 0 ? cv.Emax : 0]);
      void bounds;
      return sign > 0 ? Math.min(...phaseEnds.filter((x) => x > E + 1e-6)) : Math.max(...phaseEnds.filter((x) => x < E - 1e-6));
    }
    function press(key) {
      if (key === 'heat' || key === 'cool') {
        const s = key === 'heat' ? 1 : -1;
        if ((s > 0 && E >= cv.Emax) || (s < 0 && E <= 0)) { dir = s; stopAtEnd(); return; }
        if (reduced()) { setE(jumpTarget(s)); dir = 0; }
        else dir = dir === s ? 0 : s;
        api.record(api.t(s > 0 ? tx('Turned on the heat', 'गर्म करना शुरू किया') : tx('Started cooling', 'ठंडा करना शुरू किया')));
        h.redraw();
      }
    }
    function slide(key, v, final) {
      dir = 0;
      setE(eAtT(cv, clamp(v, lo, hi)));
      if (final) { api.emit('changed:temp'); api.record(api.t(tx('Set the temperature to ', 'तापमान रखा: ')) + fmt(cur.T) + ' °C'); }
      h.redraw();
    }
    function physics(dt) {
      const Tk = cur.T + K0, TmK = S.mp + K0;
      const rel = clamp(Tk / TmK, 0.05, 3);
      const vib = 0.8 + 2.8 * clamp(rel, 0, 1.05);
      let nl = 0, ns = 0;
      for (const p of P) {
        const st = p.mr < cur.m ? (p.br < cur.b ? 'gas' : 'liquid') : 'solid';
        if (st !== p.st) {
          if (st === 'gas') { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8, v = 0.6 + Math.random() * 0.6; p.px = p.x - Math.cos(a) * v; p.py = p.y - Math.sin(a) * v; }
          if (p.st === 'solid') { p.px = p.x; p.py = p.y; }
          p.st = st;
        }
        if (st === 'liquid') nl++; else if (st === 'solid') ns++;
      }
      let want = 0;
      if (S.floats && ns && nl) {
        // the ice block rests on its meltwater: its lowest remaining row sits on the water surface
        let low = rows; for (const p of P) if (p.st === 'solid') low = Math.min(low, p.row);
        const water = nl * 4 * r * r * 1.08 / (jar.x1 - jar.x0 - 6);
        want = (jar.y1 - 4 - low * d) - (jar.y1 - 3 - water);
      }
      lift = lerp(lift, want, Math.min(1, dt * 2));
      // fixed small sub-steps; random thermal kicks scale with the square root of the step (Brownian motion)
      const n = Math.min(14, Math.max(1, Math.ceil(dt * 240))), h2 = dt / n;
      const vg = 190 * Math.sqrt(Tk / ((S.bp != null ? S.bp : S.mp + 200) + K0));
      const damp = Math.exp(-8 * h2), kick = 55 * Math.sqrt(2 * 8) * Math.sqrt(rel) * Math.sqrt(h2) * h2;
      for (let it = 0; it < n; it++) {
        // a real gas has no overall drift: remove the shared (centre-of-mass) motion so it never sloshes as a lump
        let ng = 0, gmx = 0, gmy = 0;
        for (const p of P) if (p.st === 'gas') { ng++; gmx += p.x - p.px; gmy += p.y - p.py; }
        if (ng) { gmx /= ng; gmy /= ng; }
        for (const p of P) {
          if (p.st === 'solid') {
            const tx_ = p.hx + vib * Math.sin(time * 13 * Math.sqrt(rel) + p.ph), ty = p.hy - lift + vib * Math.cos(time * 11 * Math.sqrt(rel) + p.ph2);
            const k = Math.min(1, h2 * 10);
            p.x = lerp(p.x, tx_, k); p.y = lerp(p.y, ty, k); p.px = p.x; p.py = p.y;
            continue;
          }
          let vx = p.x - p.px, vy = p.y - p.py;
          if (p.st === 'gas' && ng > 6) { vx -= gmx; vy -= gmy; }
          p.px = p.x; p.py = p.y;
          if (p.st === 'liquid') {
            vx *= damp; vy *= damp;
            vx += randn() * kick; vy += randn() * kick + 900 * h2 * h2;
            const sp = Math.hypot(vx, vy), cap = 520 * h2; if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
          } else {
            const sp = Math.hypot(vx, vy) / h2 || 1;
            const f = lerp(1, vg / sp, 0.08);
            vx *= f; vy *= f;
            vx += randn() * 0.02; vy += randn() * 0.02;
          }
          p.x += vx; p.y += vy;
        }
        for (let i = 0; i < P.length; i++) {
          const a = P[i];
          for (let j = i + 1; j < P.length; j++) {
            const b = P[j];
            const dx = b.x - a.x, dy = b.y - a.y, md = (a.rr + b.rr) * 0.98;
            if (dx > md || dx < -md || dy > md || dy < -md) continue;
            const dd = Math.hypot(dx, dy) || 0.01;
            if (dd >= md) continue;
            const o = (md - dd) / dd;
            const fa = a.st === 'solid' ? 0 : b.st === 'solid' ? 1 : 0.5, fb = b.st === 'solid' ? 0 : a.st === 'solid' ? 1 : 0.5;
            // pushes between liquid particles (or against the solid) must not turn into big speeds: move the
            // previous position too, so most of the push is not counted as velocity
            const keep = a.st === 'gas' || b.st === 'gas' ? 0 : 0.85;
            a.x -= dx * o * fa; a.y -= dy * o * fa; b.x += dx * o * fb; b.y += dy * o * fb;
            a.px -= dx * o * fa * keep; a.py -= dy * o * fa * keep; b.px += dx * o * fb * keep; b.py += dy * o * fb * keep;
          }
        }
        for (const p of P) {
          if (p.st === 'solid') continue;
          const r0 = p.rr;
          if (p.x < jar.x0 + r0 + 3) { p.x = jar.x0 + r0 + 3; p.px = p.st === 'gas' ? 2 * p.x - p.px : p.x; }
          if (p.x > jar.x1 - r0 - 3) { p.x = jar.x1 - r0 - 3; p.px = p.st === 'gas' ? 2 * p.x - p.px : p.x; }
          if (p.y < jar.y0 + r0 + 8) { p.y = jar.y0 + r0 + 8; p.py = p.st === 'gas' ? 2 * p.y - p.py : p.y; }
          if (p.y > jar.y1 - r0 - 3) { p.y = jar.y1 - r0 - 3; p.py = p.st === 'gas' ? 2 * p.y - p.py : p.y + (p.py - p.y) * 0.3; }
        }
      }
    }
    function step(dt) {
      time += dt;
      if (dir) { setE(E + dir * cv.Emax / 16 * dt); stopAtEnd(); }
      physics(dt);
      paint();
    }
    function settle() { for (let i = 0; i < 160; i++) physics(1 / 60); paint(); }
    function draw(ctx) {
      bg(ctx, 640, H);
      // bench
      ctx.fillStyle = '#25356F'; ctx.fillRect(0, 392, 640, 48);
      ctx.fillStyle = '#31448A'; ctx.fillRect(0, 390, 640, 4);
      // heat source
      if (dir > 0) { burner(ctx, 290, 360, 392, 1, time); }
      else if (dir < 0) {
        ctx.save(); const g = ctx.createLinearGradient(0, 358, 0, 392); g.addColorStop(0, '#BAE6FD'); g.addColorStop(1, '#38BDF8');
        ctx.fillStyle = g; rr(ctx, 150, 360, 280, 30, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 9; k++) { rr(ctx, 160 + k * 30, 366 + (k % 2) * 6, 18, 14, 4); ctx.fill(); }
        ctx.restore();
      } else { ctx.fillStyle = '#3B4E95'; rr(ctx, 230, 362, 120, 26, 6); ctx.fill(); }
      // jar
      ctx.save();
      ctx.fillStyle = 'rgba(190,220,255,.06)'; rr(ctx, jar.x0, jar.y0, jar.x1 - jar.x0, jar.y1 - jar.y0, 16); ctx.fill();
      if (dir > 0) { const g = ctx.createLinearGradient(0, jar.y1, 0, jar.y1 - 120); g.addColorStop(0, 'rgba(255,122,26,.28)'); g.addColorStop(1, 'rgba(255,122,26,0)'); ctx.fillStyle = g; ctx.fillRect(jar.x0, jar.y1 - 120, jar.x1 - jar.x0, 120); }
      if (dir < 0) { const g = ctx.createLinearGradient(0, jar.y1, 0, jar.y1 - 120); g.addColorStop(0, 'rgba(2,207,249,.25)'); g.addColorStop(1, 'rgba(2,207,249,0)'); ctx.fillStyle = g; ctx.fillRect(jar.x0, jar.y1 - 120, jar.x1 - jar.x0, 120); }
      ctx.restore();
      for (const p of P) dot(ctx, p.col, p.rr, p.x, p.y, 1);
      ctx.save(); ctx.strokeStyle = 'rgba(214,232,255,.85)'; ctx.lineWidth = 3.5; rr(ctx, jar.x0, jar.y0, jar.x1 - jar.x0, jar.y1 - jar.y0, 16); ctx.stroke();
      ctx.fillStyle = '#64748B'; rr(ctx, jar.x0 - 8, jar.y0 - 14, jar.x1 - jar.x0 + 16, 16, 6); ctx.fill();
      ctx.fillStyle = '#94A3B8'; rr(ctx, jar.x0 - 8, jar.y0 - 14, jar.x1 - jar.x0 + 16, 5, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(jar.x0 + 12, jar.y0 + 22); ctx.lineTo(jar.x0 + 12, jar.y1 - 30); ctx.stroke();
      ctx.restore();
      // thermometer with mp / bp marks
      const tx0 = 520, ty0 = 70, ty1 = 340;
      thermo(ctx, h, tx0, ty0, ty1, pct(cur.T), `${fmt(cur.T)} °C`);
      const markY = (T) => lerp(ty1 - 4, ty0 + 6, pct(T));
      [[S.mp, tx('melts', 'पिघलता')], S.bp != null && S.bp <= hi ? [S.bp, tx('boils', 'उबलता')] : null].filter(Boolean).forEach(([T, w]) => {
        const y = markY(T);
        ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx0 + 10, y); ctx.lineTo(tx0 + 22, y); ctx.stroke();
        label(ctx, h, `${fmt(T)}°`, tx0 + 26, y, { align: 'left', col: '#FFD23F', size: 12 });
        label(ctx, h, api.t(w), tx0 + 26, y + h.fs(12) + 2, { align: 'left', col: '#C7D2FE', size: 11, weight: 600 });
      });
      label(ctx, h, api.t(names(phase)), (jar.x0 + jar.x1) / 2, jar.y0 + 22, { pill: 'rgba(6,18,51,.75)', size: 14 });
      if (S.ions) {
        label(ctx, h, api.t(tx('sodium', 'सोडियम')), 70, 150, { pill: '#8B3DFF', col: '#fff', size: 12 });
        label(ctx, h, api.t(tx('chloride', 'क्लोराइड')), 70, 182, { pill: '#0F766E', col: '#fff', size: 12 });
      }
    }
    return { H, side, step, draw, press, slide, settle, sliderValue: () => Math.round(cur.T), init() { h.live(desc(phase)); } };
  }

  // ---------- mode: dissolve ----------
  function dissolveCtl(cfg, api, h) {
    const id = cfg.substance || 'salt';
    const D = DIS[id];
    const H = 440;
    const bk = { x0: 150, x1: 470, y0: 70, y1: 396 };
    const wr = { x0: 158, x1: 462, y0: 138, y1: 390 };
    let T = cfg.temp != null ? cfg.temp : 25, Tgoal = T, time = 0, stir = 0, acc = 0, acc2 = 0, spoons = 0, saidDone = true, heatT = 0;
    const W = [];
    for (let i = 0; i < 150; i++) { const x = lerp(wr.x0 + 10, wr.x1 - 10, Math.random()), y = lerp(wr.y0 + 10, wr.y1 - 10, Math.random()); W.push({ x, y, px: x, py: y, rr: 8, w: true }); }
    const U = []; // solute particles
    const heap = []; // particles in the solid, in slot order
    const maxG = () => (D.insoluble ? 0 : interp(SOLUB[id], T) * WATER_G / 100);
    const freeUnits = () => U.filter((p) => p.st === 'free').length / (D.ions ? 2 : 1);
    const dissolvedG = () => freeUnits() * D.g;
    const addedG = () => spoons * D.spoon;
    const slot = (k) => {
      if (D.insoluble) { const c = k % 18, row = Math.floor(k / 18); return { x: 200 + c * 13 + (row % 2) * 6, y: wr.y0 + 2 + row * 11 }; }
      let row = 0, n = 16, kk = k;
      while (kk >= n) { kk -= n; row++; n = Math.max(4, n - 2); }
      const sp = D.ions ? 10.5 : 15;
      return { x: 310 - (n - 1) * sp / 2 + kk * sp, y: wr.y1 - 6 - row * (D.ions ? 10 : 14) };
    };
    const rad = (kind) => (kind === 'na' ? 5.5 : kind === 'cl' ? 8 : kind === 'sugar' ? 7.5 : 6.5);
    const colr = (kind) => (kind === 'na' ? '#A78BFA' : kind === 'cl' ? '#22C55E' : kind === 'sugar' ? '#FDF2F8' : '#FDE68A');
    function addSpoon() {
      const units = Math.round(D.spoon / D.g);
      for (let i = 0; i < units; i++) {
        const kinds = D.ions ? ['na', 'cl'] : [id === 'sugar' ? 'sugar' : 'wax'];
        kinds.forEach((kind) => {
          const s = slot(heap.length);
          const p = { kind, x: 290 + Math.random() * 40, y: 40 + Math.random() * 20, px: 0, py: 0, st: 'heap', slot: heap.length, rr: rad(kind), col: colr(kind), sx: s.x, sy: s.y };
          p.px = p.x; p.py = p.y; heap.push(p); U.push(p);
        });
      }
      spoons++; saidDone = false;
    }
    function reslot() { heap.forEach((p, k) => { const s = slot(k); p.slot = k; p.sx = s.x; p.sy = s.y; }); }
    function dissolveOne() {
      const n = D.ions ? 2 : 1;
      for (let i = 0; i < n; i++) { const p = heap.pop(); p.st = 'free'; p.px = p.x; p.py = p.y; }
    }
    function crystalOne() {
      const take = D.ions ? ['na', 'cl'] : ['sugar'];
      take.forEach((kind) => { const p = U.find((q) => q.st === 'free' && q.kind === kind); if (p) { p.st = 'heap'; heap.push(p); } });
      reslot();
    }
    let lastStatus = '';
    function status() {
      if (!spoons) return 'empty';
      if (D.insoluble) return 'insoluble';
      if (!heap.length) return 'done';
      return dissolvedG() + D.g > maxG() + 1e-9 ? 'sat' : 'going';
    }
    const statusText = (s) => ({
      empty: tx('Only water so far. Add a spoonful.', 'अभी केवल पानी है। एक चम्मच डालो।'),
      going: tx('Dissolving…', 'घुल रहा है…'),
      done: tx('All dissolved', 'सब घुल गया'),
      sat: tx('Saturated', 'संतृप्त'),
      insoluble: tx('Does not dissolve', 'नहीं घुलता'),
    })[s];
    function side() {
      h.side.innerHTML = `
        <div class="pt-card"><div class="pt-state"><span class="pt-pill" data-r="pill"></span><span class="pt-small" data-r="what"></span></div></div>
        <div class="pt-btns">
          <button type="button" class="pt-btn pt-add" data-key="add">${esc(api.t(tx('Add a spoonful', 'एक चम्मच डालो')))}</button>
          <button type="button" class="pt-btn pt-stir" data-key="stir">${esc(api.t(tx('Stir', 'चलाओ')))}</button>
          <button type="button" class="pt-btn pt-hot" data-key="heat">${esc(api.t(tx('Heat', 'गर्म करो')))}</button>
        </div>
        <div class="pt-card pt-sl"><label for="pt-ds-t"><span>${esc(api.t(tx('Water temperature', 'पानी का तापमान')))}</span><output data-r="tout"></output></label>
          <input id="pt-ds-t" type="range" data-key="slider:temp" min="0" max="100" step="1" value="${Math.round(T)}" aria-label="${esc(api.t(tx('Water temperature in degrees Celsius', 'पानी का तापमान डिग्री सेल्सियस में')))}">
          <div class="pt-ends"><span>0 °C</span><span>100 °C</span></div></div>
        <div class="pt-read">
          <div><div class="pt-small">${esc(api.t(tx('Added', 'डाला')))}</div><div class="pt-big" data-r="added"></div></div>
          <div><div class="pt-small">${esc(api.t(tx('Dissolved', 'घुला')))}</div><div class="pt-big" data-r="dis"></div></div>
          <div><div class="pt-small">${esc(api.t(tx('Most that can dissolve now', 'अभी अधिकतम कितना घुल सकता है')))}</div><div class="pt-big" data-r="max"></div></div>
        </div>
        <div class="pt-card"><div class="pt-bar" data-r="bar"><i></i></div><p class="pt-small" data-r="note" style="margin-top:6px"></p></div>`;
      lastStatus = ''; paint(true);
    }
    let lastKey = '';
    function paint(force) {
      const s = status();
      const key = s + fmt(T) + fmt(dissolvedG(), 1) + spoons;
      if (!force && key === lastKey) return;
      lastKey = key;
      const q = (k) => h.side.querySelector(`[data-r="${k}"]`);
      q('pill').className = 'pt-pill ' + (s === 'done' ? 'done' : s === 'sat' ? 'sat' : s === 'insoluble' ? 'gas' : 'wait');
      q('pill').textContent = api.t(statusText(s));
      q('what').textContent = `${api.t(D.name)} · ${api.t(tx('50 mL water', '50 mL पानी'))} · ${fmt(T)} °C`;
      q('tout').textContent = `${fmt(T)} °C`;
      q('added').textContent = `${fmt(addedG())} g`;
      q('dis').textContent = D.insoluble ? '0 g' : `${fmt(Math.min(addedG(), dissolvedG()), 1)} g`;
      q('max').textContent = D.insoluble ? '0 g' : `${fmt(maxG(), 1)} g`;
      const bar = q('bar'); bar.className = 'pt-bar' + (s === 'sat' ? ' sat' : '');
      bar.querySelector('i').style.width = (D.insoluble ? 0 : clamp(dissolvedG() / maxG(), 0, 1) * 100) + '%';
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', api.t(tx('How full the water is of dissolved solid', 'पानी में कितना ठोस घुल चुका है')));
      q('note').textContent = api.t(id === 'salt' ? tx('Salt: about 36 g dissolves in 100 g of water, and warming hardly changes it.', 'नमक: 100 g पानी में लगभग 36 g घुलता है, और गर्म करने से यह बहुत कम बदलता है।')
        : id === 'sugar' ? tx('Sugar: about 204 g dissolves in 100 g of water at 20 °C, and more than twice as much in boiling water.', 'चीनी: 20 °C पर 100 g पानी में लगभग 204 g घुलती है, और उबलते पानी में इसका दोगुने से भी ज़्यादा।')
          : tx('Wax is not soluble in water, and it floats because it is lighter than water.', 'मोम पानी में अघुलनशील है, और पानी से हल्का होने के कारण तैरता है।'));
      const sl = h.side.querySelector('[data-key="slider:temp"]'); if (sl && document.activeElement !== sl) sl.value = Math.round(T);
      if (s !== lastStatus) {
        const was = lastStatus; lastStatus = s;
        if (was && s === 'sat') h.live(tx(`The water is saturated: no more can dissolve at ${fmt(T)} °C. The extra stays at the bottom. Try heating it.`, `पानी संतृप्त हो गया: ${fmt(T)} °C पर और नहीं घुल सकता। बाक़ी तली में रह जाता है। गर्म करके देखो।`));
        if (was && s === 'insoluble') h.live(tx('The wax floats and does not dissolve: water particles cannot pull wax particles apart.', 'मोम तैरता है और नहीं घुलता: पानी के कण मोम के कणों को अलग नहीं कर पाते।'));
      }
      h.tag(api.t(tx('Magnified view of the beaker', 'बीकर को बड़ा करके देखो')));
    }
    function press(key) {
      if (key === 'add') {
        if (spoons >= D.max) { api.toast(tx('That is enough for this beaker.', 'इस बीकर के लिए इतना काफ़ी है।')); return; }
        addSpoon();
        api.record(api.t(tx('Added a spoonful: ', 'एक चम्मच डाला: ')) + `${D.spoon} g ` + api.t(D.name));
        if (reduced()) settle();
      } else if (key === 'stir') {
        stir = 3; api.record(api.t(tx('Stirred', 'चलाया')));
        if (reduced()) settle();
      } else if (key === 'heat') {
        if (Tgoal >= 100) { api.toast(tx('The water is already boiling.', 'पानी पहले से उबल रहा है।')); return; }
        Tgoal = Math.min(100, Math.round(Tgoal) + 20); heatT = 2;
        api.record(api.t(tx('Heated the water to ', 'पानी गर्म किया: ')) + fmt(Tgoal) + ' °C');
        if (reduced()) { T = Tgoal; settle(); api.emit('changed:temp'); }
      }
      h.redraw();
    }
    function slide(key, v, final) {
      T = Tgoal = clamp(v, 0, 100);
      if (final) { api.emit('changed:temp'); api.record(api.t(tx('Set the water to ', 'पानी का तापमान रखा: ')) + fmt(T) + ' °C'); if (reduced()) settle(); }
      h.redraw();
    }
    function chem(dt) {
      if (D.insoluble) return;
      const rate = 1.4 * (stir > 0 ? 4 : 1) * (0.4 + T / 50);
      if (heap.length && dissolvedG() + D.g <= maxG() + 1e-9) { acc += rate * dt; while (acc >= 1 && heap.length && dissolvedG() + D.g <= maxG() + 1e-9) { dissolveOne(); acc -= 1; } }
      else acc = 0;
      if (dissolvedG() > maxG() + D.g * 0.5) { acc2 += 2 * dt; while (acc2 >= 1 && dissolvedG() > maxG() + D.g * 0.5) { crystalOne(); acc2 -= 1; } } else acc2 = 0;
      if (spoons && !heap.length && !saidDone) {
        saidDone = true;
        h.live(id === 'salt' ? tx('All the salt has dissolved. Water particles pulled the sodium and chloride particles apart and spread them through the water.', 'सारा नमक घुल गया। पानी के कणों ने सोडियम और क्लोराइड कणों को अलग करके पूरे पानी में फैला दिया।') : tx('All the sugar has dissolved. Its particles slipped into the spaces between water particles.', 'सारी चीनी घुल गई। इसके कण पानी के कणों के बीच की जगहों में समा गए।'));
        api.emit('dissolved'); api.record(api.t(tx('Everything dissolved', 'सब घुल गया')));
      }
    }
    function physics(dt) {
      const sp = Math.sqrt((T + K0) / 298);
      const jig = 1500 * sp;
      const all = W.concat(U.filter((p) => p.st === 'free'));
      const cx = 310, cy = 264;
      for (const p of all) {
        let vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
        p.px = p.x; p.py = p.y;
        vx += randn() * jig * dt * dt; vy += randn() * jig * dt * dt;
        if (stir > 0) { const dx = p.x - cx, dy = p.y - cy, dd = Math.hypot(dx, dy) || 1; vx += -dy / dd * 260 * dt * dt * 60; vy += dx / dd * 260 * dt * dt * 60; }
        p.x += vx; p.y += vy;
      }
      // soft repulsion on a grid
      const cell = 18, grid = new Map();
      all.forEach((p, i) => { const k = ((p.x / cell) | 0) * 1000 + ((p.y / cell) | 0); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); });
      for (let i = 0; i < all.length; i++) {
        const a = all[i], gx = (a.x / cell) | 0, gy = (a.y / cell) | 0;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const list = grid.get((gx + ox) * 1000 + gy + oy); if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = all[j], dx = b.x - a.x, dy = b.y - a.y, md = (a.rr + b.rr) * 0.92, dd = Math.hypot(dx, dy) || 0.01;
            if (dd >= md) continue;
            const o = (md - dd) / dd * 0.5;
            a.x -= dx * o; a.y -= dy * o; b.x += dx * o; b.y += dy * o;
          }
        }
      }
      // heap particles also push water away
      for (const q of heap) for (const p of all) { const dx = p.x - q.x, dy = p.y - q.y; if (Math.abs(dx) > 16 || Math.abs(dy) > 16) continue; const dd = Math.hypot(dx, dy) || 0.01, md = p.rr + q.rr; if (dd < md) { p.x += dx / dd * (md - dd); p.y += dy / dd * (md - dd); } }
      for (const p of all) { p.x = clamp(p.x, wr.x0 + p.rr, wr.x1 - p.rr); p.y = clamp(p.y, wr.y0 + p.rr + (D.insoluble && heap.length ? 14 : 0), wr.y1 - p.rr); }
      for (const p of heap) { const k = Math.min(1, dt * 6); p.x = lerp(p.x, p.sx + (D.insoluble ? Math.sin(time * 2 + p.slot) * 1.5 : 0), k); p.y = lerp(p.y, p.sy + (D.insoluble ? Math.cos(time * 1.7 + p.slot) * 1.2 : 0), k); }
    }
    function step(dt) {
      time += dt;
      if (stir > 0) stir -= dt;
      if (heatT > 0) heatT -= dt;
      if (Math.abs(T - Tgoal) > 0.01) { const was = T; T += clamp(Tgoal - T, -14 * dt, 14 * dt); if (Math.abs(T - Tgoal) <= 0.01 || (was - Tgoal) * (T - Tgoal) <= 0) { T = Tgoal; api.emit('changed:temp'); } }
      chem(dt); physics(dt); paint();
    }
    function settle() { for (let i = 0; i < 400; i++) { chem(1 / 30); } for (let i = 0; i < 90; i++) physics(1 / 60); for (const p of heap) { p.x = p.sx; p.y = p.sy; } paint(true); }
    function draw(ctx) {
      bg(ctx, 640, H);
      ctx.fillStyle = '#25356F'; ctx.fillRect(0, 398, 640, 42);
      // hot plate glow
      const glow = clamp((T - 25) / 75, 0, 1);
      ctx.save(); ctx.fillStyle = mixHex('#3B4E95', '#FF5A1F', glow); rr(ctx, 140, 396, 340, 12, 5); ctx.fill(); ctx.restore();
      if (heatT > 0 || T > 60) { ctx.save(); ctx.globalAlpha = 0.25 + 0.2 * glow; const g = ctx.createLinearGradient(0, 396, 0, 300); g.addColorStop(0, '#FF7A1A'); g.addColorStop(1, 'rgba(255,122,26,0)'); ctx.fillStyle = g; ctx.fillRect(wr.x0, 300, wr.x1 - wr.x0, 96); ctx.restore(); }
      ctx.save(); ctx.fillStyle = 'rgba(56,189,248,.16)'; ctx.fillRect(wr.x0, wr.y0, wr.x1 - wr.x0, wr.y1 - wr.y0); ctx.restore();
      ctx.save(); ctx.strokeStyle = 'rgba(186,230,253,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wr.x0, wr.y0); ctx.lineTo(wr.x1, wr.y0); ctx.stroke(); ctx.restore();
      for (const p of W) dot(ctx, '#38BDF8', 7.2, p.x, p.y, 0.85);
      for (const p of U) dot(ctx, p.col, p.rr, p.x, p.y, 1);
      if (stir > 0) { ctx.save(); const a = time * 6; ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(310 + Math.cos(a) * 60, 40); ctx.lineTo(310 + Math.cos(a) * 80, 330); ctx.stroke(); ctx.restore(); }
      glassBeaker(ctx, bk.x0, bk.y0, bk.x1, bk.y1);
      thermo(ctx, h, 540, 120, 330, T / 100, `${fmt(T)} °C`);
      if (spoons && D.ions) {
        label(ctx, h, api.t(tx('sodium', 'सोडियम')), 70, 150, { pill: '#8B3DFF', col: '#fff', size: 12 });
        label(ctx, h, api.t(tx('chloride', 'क्लोराइड')), 70, 182, { pill: '#0F766E', col: '#fff', size: 12 });
        label(ctx, h, api.t(tx('water', 'पानी')), 70, 214, { pill: '#1D4ED8', col: '#fff', size: 12 });
      } else {
        label(ctx, h, api.t(tx('water', 'पानी')), 70, 150, { pill: '#1D4ED8', col: '#fff', size: 12 });
        if (spoons) label(ctx, h, api.t(id === 'sugar' ? tx('sugar', 'चीनी') : tx('wax', 'मोम')), 70, 182, { pill: id === 'sugar' ? '#8B3DFF' : '#B45309', col: '#fff', size: 12 });
      }
    }
    return { H, side, step, draw, press, slide, settle, init() { h.live(D.insoluble ? tx('Add wax shavings to the water and watch what they do.', 'पानी में मोम की छीलन डालो और देखो क्या होता है।') : tx('Add a spoonful and watch the particles. Stirring and warm water make it dissolve faster.', 'एक चम्मच डालो और कणों को देखो। चलाने और गर्म पानी से यह जल्दी घुलता है।')); } };
  }

  // ---------- mode: diffusion ----------
  function diffusionCtl(cfg, api, h) {
    const id = cfg.substance || 'ink';
    const F = DIF[id];
    const gas = F.medium === 'gas';
    const H = 430;
    const boxes = cfg.compare
      ? [{ x0: 28, x1: 304, y0: 74, y1: 392, T: F.pair[0] }, { x0: 336, x1: 612, y0: 74, y1: 392, T: F.pair[1] }]
      : [{ x0: 110, x1: 470, y0: 60, y1: 392, T: cfg.temp != null ? cfg.temp : F.start }];
    let time = 0;
    boxes.forEach((b) => {
      b.top = gas ? b.y0 + 6 : b.y0 + 34;
      b.M = []; b.Dp = []; b.t0 = null; b.spread = false; b.mix = 0; b.drop = null;
      const n = Math.round((gas ? 40 : 150) * (b.x1 - b.x0) / 360 * (cfg.compare ? 1.1 : 1));
      for (let i = 0; i < n; i++) { const x = lerp(b.x0 + 8, b.x1 - 8, Math.random()), y = lerp(b.top + 8, b.y1 - 8, Math.random()); const a = Math.random() * 6.28; b.M.push({ x, y, a }); }
    });
    const Drel = (T) => (gas ? Math.pow((T + K0) / 298.15, 1.75) : ((T + K0) / 298.15) * (0.89 / interp(VISC, T)));
    const speed = (T) => 120 * Math.sqrt((T + K0) / 298.15);
    function drop() {
      boxes.forEach((b) => {
        b.Dp = []; b.spread = false; b.mix = 0; b.t0 = null;
        b.drop = gas ? null : { y: b.y0 - 40, x: (b.x0 + b.x1) / 2 };
        if (gas) spawn(b);
      });
    }
    function spawn(b) {
      const cx = gas ? b.x0 + 46 : (b.x0 + b.x1) / 2, cy = gas ? b.y1 - 70 : b.top + 26;
      const n = cfg.compare ? 64 : 90;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, rr_ = Math.sqrt(Math.random()) * 16; b.Dp.push({ x: cx + Math.cos(a) * rr_, y: cy + Math.sin(a) * rr_, a: Math.random() * 6.28 }); }
      b.t0 = time;
    }
    function mixIndex(b) {
      const c = new Array(9).fill(0), n = b.Dp.length; if (!n) return 0;
      b.Dp.forEach((p) => { const i = clamp(Math.floor((p.x - b.x0) / (b.x1 - b.x0) * 3), 0, 2), j = clamp(Math.floor((p.y - b.top) / (b.y1 - b.top) * 3), 0, 2); c[j * 3 + i]++; });
      const mu = n / 9; const sd = Math.sqrt(c.reduce((s, v) => s + (v - mu) * (v - mu), 0) / 9); const sdMax = Math.sqrt(((n - mu) * (n - mu) + 8 * mu * mu) / 9);
      b.minCell = Math.min(...c) / mu;
      return clamp(1 - sd / sdMax, 0, 1);
    }
    function move(b, dt) {
      const sp = speed(b.T), D = 950 * Drel(b.T);
      for (const p of b.M) {
        if (gas) { p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt; if (Math.random() < 3 * dt) p.a = Math.random() * 6.28; }
        else { p.x += randn() * Math.sqrt(2 * 60 * Drel(b.T) * dt); p.y += randn() * Math.sqrt(2 * 60 * Drel(b.T) * dt); }
        bounce(b, p);
      }
      const lam = 1.5 * Math.pow((b.T + K0) / 298.15, -0.75) * (sp / 120) * (sp / 120); // gives D ∝ T^1.75, as for real gases
      for (const p of b.Dp) {
        if (gas) { p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt; if (Math.random() < lam * dt) p.a = Math.random() * 6.28; }
        else { const s = Math.sqrt(2 * D * dt); p.x += randn() * s; p.y += randn() * s; }
        bounce(b, p);
      }
    }
    function bounce(b, p) {
      if (p.x < b.x0 + 6) { p.x = 2 * (b.x0 + 6) - p.x; p.a = Math.PI - p.a; }
      if (p.x > b.x1 - 6) { p.x = 2 * (b.x1 - 6) - p.x; p.a = Math.PI - p.a; }
      if (p.y < b.top + 6) { p.y = 2 * (b.top + 6) - p.y; p.a = -p.a; }
      if (p.y > b.y1 - 6) { p.y = 2 * (b.y1 - 6) - p.y; p.a = -p.a; }
      p.x = clamp(p.x, b.x0 + 6, b.x1 - 6); p.y = clamp(p.y, b.top + 6, b.y1 - 6);
    }
    let emitted = false;
    function check(b) {
      if (!b.Dp.length || b.spread) return;
      b.mix = mixIndex(b);
      if (b.minCell >= 0.35 && b.mix > 0.8) {
        b.spread = true; b.secs = time - b.t0;
        const others = boxes.filter((x) => x !== b);
        if (!emitted) {
          emitted = true; api.emit('spread');
          h.live(cfg.compare
            ? tx(`The ${b.T > others[0].T ? 'hot' : 'cold'} one spread out first. Hotter particles move faster, so they mix sooner.`, `${b.T > others[0].T ? 'गर्म' : 'ठंडे'} वाले में पहले फैलाव हुआ। गर्म कण तेज़ चलते हैं, इसलिए जल्दी मिल जाते हैं।`)
            : gas ? tx('The perfume particles have spread through the whole room. Gas particles move fast with big spaces between them, so smells travel quickly.', 'इत्र के कण पूरे कमरे में फैल गए। गैस के कण तेज़ चलते हैं और उनके बीच ख़ूब जगह होती है, इसलिए गंध जल्दी फैलती है।')
              : tx('The ink has spread through all the water by itself, without stirring. Moving water particles keep bumping the ink particles around: this is diffusion.', 'स्याही बिना चलाए अपने आप पूरे पानी में फैल गई। चलते हुए पानी के कण स्याही के कणों को धक्का देते रहते हैं: यही विसरण है।'));
        } else h.live(tx('Now the other one has spread out too. It took longer at the lower temperature.', 'अब दूसरे में भी फैलाव हो गया। कम तापमान पर इसमें ज़्यादा समय लगा।'));
        api.record(api.t(tx('Spread out at ', 'फैल गया: ')) + fmt(b.T) + ' °C');
      }
    }
    function side() {
      const one = (b, i) => `<div><div class="pt-small">${cfg.compare ? esc(api.t(i ? tx('Hot', 'गर्म') : tx('Cold', 'ठंडा'))) + ' · ' + fmt(b.T) + ' °C' : esc(api.t(tx('Mixed', 'मिला')))}</div><div class="pt-big" data-r="mix${i}">0%</div><div class="pt-small" data-r="sec${i}"></div></div>`;
      h.side.innerHTML = `
        <div class="pt-card"><h3>${esc(api.t(F.name))}</h3><p>${esc(api.t(gas ? tx('A room full of air. Spray a little perfume in one corner.', 'हवा से भरा कमरा। एक कोने में थोड़ा इत्र छिड़को।') : cfg.compare ? tx('Two beakers of still water, one cold and one hot. A drop of ink goes into each.', 'स्थिर पानी के दो बीकर, एक ठंडा और एक गर्म। हर एक में स्याही की एक बूँद डाली जाएगी।') : tx('A beaker of still water. Nobody stirs it.', 'स्थिर पानी का बीकर। इसे कोई नहीं चलाता।')))}</p></div>
        <div class="pt-btns"><button type="button" class="pt-btn pt-add" data-key="add">${esc(api.t(gas ? tx('Spray perfume', 'इत्र छिड़को') : tx('Drop the ink', 'स्याही डालो')))}</button></div>
        ${cfg.compare ? '' : `<div class="pt-card pt-sl"><label for="pt-df-t"><span>${esc(api.t(gas ? tx('Room temperature', 'कमरे का तापमान') : tx('Water temperature', 'पानी का तापमान')))}</span><output data-r="tout"></output></label>
          <input id="pt-df-t" type="range" data-key="slider:temp" min="${F.range[0]}" max="${F.range[1]}" step="1" value="${boxes[0].T}" aria-label="${esc(api.t(tx('Temperature in degrees Celsius', 'तापमान डिग्री सेल्सियस में')))}">
          <div class="pt-ends"><span>${F.range[0]} °C</span><span>${F.range[1]} °C</span></div></div>`}
        <div class="pt-read">${boxes.map(one).join('')}</div>
        <p class="pt-small">${esc(api.t(gas ? tx('Shown faster than real life. In a real room you smell perfume within seconds to minutes.', 'असल से तेज़ दिखाया गया है। असली कमरे में इत्र की गंध कुछ सेकंड से कुछ मिनट में आती है।') : tx('Shown many times faster than real life: in a real beaker ink takes hours to spread evenly.', 'असल से कई गुना तेज़ दिखाया गया है: असली बीकर में स्याही को बराबर फैलने में घंटों लगते हैं।')))}</p>`;
      paint(true);
    }
    let lk = '';
    function paint(force) {
      const key = boxes.map((b) => Math.round(b.mix * 100) + '|' + b.T + '|' + b.spread).join(',');
      if (!force && key === lk) return; lk = key;
      boxes.forEach((b, i) => {
        const m = h.side.querySelector(`[data-r="mix${i}"]`); if (m) m.textContent = Math.round((b.spread ? 1 : clamp(b.mix / 0.86, 0, 0.99)) * 100) + '%';
        const s = h.side.querySelector(`[data-r="sec${i}"]`); if (s) s.textContent = b.spread ? api.t(tx('Spread out', 'फैल गया')) + ` · ${fmt(b.secs, 0)} s` : b.Dp.length ? api.t(tx('Spreading…', 'फैल रहा है…')) : '';
      });
      const o = h.side.querySelector('[data-r="tout"]'); if (o) o.textContent = `${fmt(boxes[0].T)} °C`;
      const sl = h.side.querySelector('[data-key="slider:temp"]'); if (sl && document.activeElement !== sl) sl.value = boxes[0].T;
      h.tag(api.t(tx('Magnified view: tiny balls are particles', 'बड़ा करके देखो: छोटी गेंदें कण हैं')));
    }
    function press(key) {
      if (key !== 'add') return;
      drop(); emitted = false;
      api.record(api.t(gas ? tx('Sprayed perfume', 'इत्र छिड़का') : tx('Dropped ink into the water', 'पानी में स्याही डाली')));
      if (reduced()) { boxes.forEach((b) => { if (b.drop) { b.drop = null; spawn(b); } }); settle(); }
      h.redraw();
    }
    function slide(key, v, final) {
      boxes[0].T = clamp(Math.round(v), F.range[0], F.range[1]);
      if (final) { api.emit('changed:temp'); api.record(api.t(tx('Set the temperature to ', 'तापमान रखा: ')) + fmt(boxes[0].T) + ' °C'); }
      h.redraw();
    }
    function step(dt) {
      time += dt;
      boxes.forEach((b) => {
        if (b.drop) { b.drop.y += 420 * dt; if (b.drop.y >= b.top + 20) { b.drop = null; spawn(b); } }
        move(b, dt); check(b);
        if (b.Dp.length && !b.spread) b.mix = mixIndex(b);
      });
      paint();
    }
    function settle() {
      // reduced motion: run the same random walk quickly to the end and show the result
      for (let i = 0; i < 2400 && boxes.some((b) => b.Dp.length && !b.spread); i++) { time += 1 / 30; boxes.forEach((b) => { move(b, 1 / 30); check(b); }); }
      boxes.forEach((b) => { b.mix = b.Dp.length ? mixIndex(b) : 0; });
      paint(true);
    }
    function draw(ctx) {
      bg(ctx, 640, H);
      ctx.fillStyle = '#25356F'; ctx.fillRect(0, 394, 640, 36);
      boxes.forEach((b, i) => {
        ctx.save();
        if (gas) {
          ctx.fillStyle = 'rgba(147,197,253,.07)'; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
          ctx.strokeStyle = 'rgba(214,232,255,.7)'; ctx.lineWidth = 3; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
          // window and door so it reads as a room
          ctx.strokeStyle = 'rgba(214,232,255,.35)'; ctx.lineWidth = 2; ctx.strokeRect(b.x1 - 70, b.y0 + 40, 46, 56); ctx.beginPath(); ctx.moveTo(b.x1 - 47, b.y0 + 40); ctx.lineTo(b.x1 - 47, b.y0 + 96); ctx.stroke();
          ctx.strokeRect(b.x1 - 60, b.y1 - 110, 40, 110);
          // perfume bottle
          ctx.fillStyle = '#F9A8D4'; rr(ctx, b.x0 + 34, b.y1 - 44, 26, 34, 6); ctx.fill(); ctx.fillStyle = '#E2E8F0'; rr(ctx, b.x0 + 41, b.y1 - 54, 12, 11, 3); ctx.fill();
        } else {
          const warm = clamp((b.T - 20) / 60, 0, 1), cold = clamp((20 - b.T) / 15, 0, 1);
          ctx.fillStyle = `rgba(${Math.round(lerp(56, 255, warm))},${Math.round(lerp(189, 122, warm))},${Math.round(lerp(248, 26, warm))},${0.16 + 0.06 * warm + 0.05 * cold})`; ctx.fillRect(b.x0, b.top, b.x1 - b.x0, b.y1 - b.top);
          ctx.strokeStyle = 'rgba(186,230,253,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x0, b.top); ctx.lineTo(b.x1, b.top); ctx.stroke();
        }
        ctx.restore();
        for (const p of b.M) dot(ctx, F.mcol, gas ? 5 : 6, p.x, p.y, gas ? 0.75 : 0.6);
        for (const p of b.Dp) dot(ctx, F.col, gas ? 5 : 5.5, p.x, p.y, 1);
        if (!gas) {
          glassBeaker(ctx, b.x0, b.y0, b.x1, b.y1);
          // dropper
          ctx.save(); ctx.fillStyle = '#E2E8F0'; const dx = (b.x0 + b.x1) / 2; rr(ctx, dx - 7, b.y0 - 56, 14, 34, 4); ctx.fill(); ctx.fillStyle = '#7C3AED'; rr(ctx, dx - 10, b.y0 - 70, 20, 16, 6); ctx.fill(); ctx.restore();
          if (b.drop) dot(ctx, F.col, 9, b.drop.x, b.drop.y, 1);
        }
        if (b.drop == null && !b.Dp.length && gas) { /* waiting */ }
        const frac = (b.T - F.range[0]) / (F.range[1] - F.range[0]);
        if (cfg.compare) label(ctx, h, `${api.t(i ? tx('Hot', 'गर्म') : tx('Cold', 'ठंडा'))} · ${fmt(b.T)} °C`, (b.x0 + b.x1) / 2 + 60, b.y0 + 16, { pill: i ? '#C2410C' : '#0369A1', col: '#fff', size: 13 });
        else thermo(ctx, h, b.x1 + 70, 110, 340, frac, `${fmt(b.T)} °C`);
      });
    }
    return { H, side, step, draw, press, slide, settle, init() { h.live(gas ? tx('Spray the perfume and watch how its particles move among the air particles.', 'इत्र छिड़को और देखो कि उसके कण हवा के कणों के बीच कैसे चलते हैं।') : tx('Drop the ink and watch. Nobody will stir the water.', 'स्याही डालो और देखो। पानी को कोई नहीं चलाएगा।')); } };
  }

  // ---------- mode: separate ----------
  function separateCtl(cfg, api, h) {
    const mid_ = cfg.mixture || 'sand-water';
    const MX = MIX[mid_];
    const offered = cfg.method ? [cfg.method] : Object.keys(MX.methods);
    const H = 420;
    let method = cfg.method || null, t = 0, running = false, time = 0, ran = false;
    const parts = [];
    Object.entries(MX.parts).forEach(([sp, n]) => { for (let i = 0; i < n; i++) parts.push({ sp, s: SP[sp], u: Math.random(), v: Math.random(), w: Math.random(), d: Math.random(), rot: Math.random() * 6.28 }); });
    const has = (f) => parts.some((p) => f(p.s));
    const liquids = Object.keys(MX.parts).filter((k) => SP[k].kind === 'liquid');
    const twoLiquids = liquids.length > 1;
    const dishY = (cx, cy, hw, depth, x) => cy + depth * Math.sqrt(Math.max(0, 1 - Math.pow((x - cx) / hw, 2)));
    // where a particle sits before anything happens, for each scene
    const wetIn = (r, p) => ({ x: lerp(r.x0, r.x1, p.u), y: lerp(r.y0, r.y1, p.v) });
    function heapIn(cx, w, yb, hgt, p) { const x = cx + (p.u * 2 - 1) * w; const top = yb - hgt * (1 - Math.pow((x - cx) / w, 2)); return { x, y: lerp(yb - 3, top + 3, p.v) }; }
    const A = { x0: 66, x1: 194, y0: 272, y1: 390 };
    const SC = {
      none: { home: (p) => (MX.wet ? wetIn({ x0: 236, x1: 404, y0: 230, y1: 388 }, p) : heapIn(320, 140, 362, 70, p)), at: (p) => SC.none.home(p),
        draw(ctx) { if (MX.wet) glassBeaker(ctx, 226, 190, 414, 396); else plate(ctx, 320, 364, 170); } },
      filter: {
        home: (p) => wetIn(A, p),
        at(p, t) {
          const home = this.home(p), d = 0.04 + p.d * 0.4, k1 = ease(seg(t, d, d + 0.2));
          const top = { x: 322 + p.u * 96, y: 148 };
          if (k1 < 1) return { ...bez(home, { x: 250, y: 50 }, top, k1), a: 1 };
          if (p.s.kind === 'solid') { const y = 168 + p.v * 36, hw = (214 - y) / 68 * 54; return { ...mid(top, { x: 370 + (p.u * 2 - 1) * hw, y }, ease(seg(t, d + 0.2, d + 0.3))), a: 1 }; }
          const k2 = seg(t, d + 0.2, d + 0.3), k3 = seg(t, d + 0.3, d + 0.4), k4 = ease(seg(t, d + 0.4, d + 0.55));
          if (k3 <= 0) return { ...mid(top, { x: 370, y: 222 }, k2), a: 1 };
          if (k4 <= 0) return { ...mid({ x: 370, y: 222 }, { x: 370, y: 292 }, k3), a: 1 };
          return { ...mid({ x: 370, y: 292 }, { x: 308 + p.u * 124, y: 390 - p.v * 46 }, k4), a: 1 };
        },
        draw(ctx, t) {
          glassBeaker(ctx, 60, 236, 200, 396); glassBeaker(ctx, 300, 296, 440, 396);
          ctx.save(); ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(500, 396); ctx.lineTo(500, 70); ctx.stroke(); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(500, 152); ctx.lineTo(438, 152); ctx.stroke();
          ctx.fillStyle = '#475569'; rr(ctx, 470, 390, 70, 8, 3); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.moveTo(310, 144); ctx.lineTo(430, 144); ctx.lineTo(370, 216); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(296, 138); ctx.lineTo(362, 222); ctx.lineTo(362, 292); ctx.moveTo(444, 138); ctx.lineTo(378, 222); ctx.lineTo(378, 292); ctx.stroke();
          if (t > 0.03 && t < 0.7) { ctx.strokeStyle = 'rgba(96,165,250,.5)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(196, 238); ctx.quadraticCurveTo(250, 120, 330, 150); ctx.stroke(); }
          ctx.restore();
        },
      },
      decant: {
        home: (p) => wetIn(A, p),
        settled(p) {
          if (twoLiquids) return p.s.light ? { x: lerp(70, 190, p.u), y: lerp(276, 326, p.v) } : { x: lerp(70, 190, p.u), y: lerp(334, 388, p.v) };
          if (p.s.kind === 'solid' && p.s.dense) return { x: lerp(70, 190, p.u), y: 390 - p.v * 18 };
          return { x: lerp(70, 190, p.u), y: lerp(276, 362, p.v) };
        },
        poured: (p) => (twoLiquids ? !!p.s.light : !(p.s.kind === 'solid' && p.s.dense)),
        at(p, t) {
          const home = this.home(p), s = this.settled(p), k = ease(seg(t, 0, 0.3));
          const at0 = mid(home, s, k);
          if (!this.poured(p)) return { ...at0, a: 1 };
          const d = 0.36 + p.d * 0.42, k2 = ease(seg(t, d, d + 0.2));
          return { ...bez(at0, { x: 300, y: 110 }, { x: 428 + p.u * 124, y: 390 - p.v * 50 }, k2), a: 1 };
        },
        draw(ctx, t) {
          glassBeaker(ctx, 60, 236, 200, 396); glassBeaker(ctx, 420, 236, 560, 396);
          if (t > 0.34 && t < 0.98) { ctx.save(); ctx.strokeStyle = 'rgba(214,232,255,.45)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(204, 238); ctx.quadraticCurveTo(300, 140, 430, 250); ctx.stroke(); ctx.restore(); }
        },
      },
      evaporate: {
        home: (p) => { const x = 320 + (p.u * 2 - 1) * 96; return { x, y: lerp(232, dishY(320, 226, 120, 60, x) - 6, p.v) }; },
        at(p, t) {
          const home = this.home(p);
          if (p.s.kind === 'liquid') { const d = 0.08 + p.d * 0.7, k = seg(t, d, d + 0.22); return { x: home.x + Math.sin(k * 6 + p.w * 6) * 14 * k, y: lerp(home.y, 30, k), a: k > 0 ? 0.6 * (1 - k) : 1, vap: k > 0 }; }
          const x = 320 + (p.u * 2 - 1) * 70, rest = { x, y: dishY(320, 226, 120, 60, x) - 5 - p.v * 8 };
          return { ...mid(home, rest, ease(seg(t, 0.1, 0.92))), a: 1, cryst: t > 0.6 };
        },
        draw(ctx, t, time) {
          tripod(ctx, 320, 290, 392); burner(ctx, 320, 330, 392, running || (t > 0 && t < 1) ? 1 : 0, time);
          dish(ctx, 320, 226, 120, 60);
        },
      },
      distil: {
        home: (p) => { const x = 160 + (p.u * 2 - 1) * 48, cy = 268, rr_ = 60; const dy = Math.sqrt(Math.max(0, rr_ * rr_ - (x - 160) * (x - 160))); return { x, y: lerp(cy + 6, cy + dy - 6, p.v) }; },
        at(p, t) {
          const home = this.home(p);
          if (p.s.kind === 'liquid') {
            const d = 0.1 + p.d * 0.6;
            const k1 = seg(t, d, d + 0.07), k2 = seg(t, d + 0.07, d + 0.12), k3 = seg(t, d + 0.12, d + 0.26), k4 = ease(seg(t, d + 0.26, d + 0.32));
            if (k1 <= 0) return { ...home, a: 1 };
            if (k2 <= 0) return { ...mid(home, { x: 160 + (p.u - 0.5) * 10, y: 214 }, k1), a: 0.45, vap: true };
            if (k3 <= 0) return { ...mid({ x: 160, y: 214 }, { x: 168, y: 160 }, k2), a: 0.45, vap: true };
            if (k4 <= 0) return { ...mid({ x: 172, y: 160 }, { x: 470, y: 236 }, k3), a: k3 < 0.5 ? 0.45 : 1, vap: k3 < 0.5 };
            return { ...mid({ x: 470, y: 242 }, { x: 448 + p.u * 104, y: 392 - p.v * 44 }, k4), a: 1 };
          }
          const x = 160 + (p.u * 2 - 1) * 34;
          return { ...mid(home, { x, y: 322 - p.v * 10 }, ease(seg(t, 0.15, 0.9))), a: 1, cryst: t > 0.6 };
        },
        draw(ctx, t, time) {
          burner(ctx, 160, 346, 396, running || (t > 0 && t < 1) ? 1 : 0, time);
          ctx.save();
          ctx.fillStyle = 'rgba(190,220,255,.07)'; ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(160, 268, 64, -Math.PI / 2 + 0.16, Math.PI * 1.5 - 0.16); ctx.lineTo(150, 150); ctx.lineTo(170, 150); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#334155'; rr(ctx, 146, 140, 28, 12, 3); ctx.fill();
          // condenser
          ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(170, 156); ctx.lineTo(474, 234); ctx.moveTo(170, 166); ctx.lineTo(470, 244); ctx.stroke();
          ctx.save(); ctx.translate(320, 200); ctx.rotate(Math.atan2(78, 304)); ctx.fillStyle = 'rgba(56,189,248,.22)'; ctx.strokeStyle = 'rgba(186,230,253,.8)'; rr(ctx, -100, -16, 200, 32, 14); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(186,230,253,.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(80, 16); ctx.lineTo(80, 36); ctx.moveTo(-80, -16); ctx.lineTo(-80, -36); ctx.stroke(); ctx.restore();
          ctx.restore();
          glassBeaker(ctx, 440, 286, 560, 396);
          label(ctx, h, api.t(tx('cold water', 'ठंडा पानी')), 330, 250, { col: '#BAE6FD', size: 11, weight: 600 });
        },
      },
      magnet: {
        home: (p) => heapIn(300, 130, 360, 40, p),
        mag(t) { const k1 = ease(seg(t, 0.04, 0.28)), k2 = ease(seg(t, 0.62, 0.95)); return { x: lerp(300, 500, k2), y: lerp(lerp(60, 262, k1), 110, k2) }; },
        at(p, t) {
          const home = this.home(p);
          if (!p.s.magnetic) return { ...home, a: 1 };
          const m = this.mag(t), d = 0.28 + p.d * 0.26, k = ease(seg(t, d, d + 0.08));
          const spot = { x: m.x + (p.u * 2 - 1) * 72, y: m.y + 22 + p.v * 9 };
          return { ...mid(home, spot, k), a: 1 };
        },
        draw(ctx, t) { plate(ctx, 300, 362, 160); const m = this.mag(t); magnetBar(ctx, m.x, m.y); },
      },
      sieve: {
        shake: (t) => (t > 0.04 && t < 0.86 ? Math.sin(t * 90) * 7 : 0),
        home: (p) => ({ x: 320 + (p.u * 2 - 1) * 104, y: 194 - p.v * (MX.wet ? 40 : 26) - (p.s.size === 'big' ? 6 : 0) }),
        at(p, t) {
          const home = this.home(p), sx = this.shake(t);
          if (p.s.size === 'big') return { x: home.x + sx, y: home.y, a: 1 };
          const d = 0.06 + p.d * 0.66, k = seg(t, d, d + 0.12);
          const end = { x: 320 + (p.u * 2 - 1) * 110, y: 370 - p.v * (MX.wet ? 24 : 14) };
          return { x: lerp(home.x + sx, end.x, k), y: lerp(home.y, end.y, k * k), a: 1 };
        },
        draw(ctx, t) {
          plate(ctx, 320, 374, 150);
          const sx = this.shake(t);
          ctx.save(); ctx.translate(sx, 0);
          ctx.strokeStyle = 'rgba(203,213,225,.55)'; ctx.lineWidth = 1.2;
          for (let x = 214; x <= 426; x += 8) { ctx.beginPath(); ctx.moveTo(x, 196); ctx.lineTo(x, 210); ctx.stroke(); }
          ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(320, 203, 120, 9, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = '#B45309'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(320, 200, 124, 14, 0, Math.PI, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(196, 200); ctx.lineTo(196, 214); ctx.moveTo(444, 200); ctx.lineTo(444, 214); ctx.stroke();
          ctx.restore();
        },
      },
      chromatography: {
        front: (t) => 356 - 226 * ease(seg(t, 0.05, 0.9)),
        home(p) { if (p.s.kind === 'dye') { const a = p.u * 6.28, r0 = Math.sqrt(p.v) * 7; return { x: 320 + Math.cos(a) * r0, y: 336 + Math.sin(a) * r0 }; } return { x: lerp(258, 382, p.u), y: lerp(362, 390, p.v) }; },
        at(p, t) {
          if (p.s.kind !== 'dye') return { ...this.home(p), a: 0.8 };
          const fd = Math.max(0, 336 - this.front(t)), c = 336 - p.s.rf * fd, spread = 4 + 9 * (fd / 206);
          const k = clamp(fd / 30, 0, 1), hm = this.home(p);
          return { x: lerp(hm.x, 304 + p.u * 32, k), y: lerp(hm.y, c + (p.v * 2 - 1) * spread, k), a: 0.9 };
        },
        draw(ctx, t) {
          ctx.save();
          ctx.fillStyle = 'rgba(56,189,248,.25)'; ctx.fillRect(254, 356, 132, 38);
          ctx.fillStyle = '#F8FAFC'; ctx.fillRect(300, 96, 40, 290);
          const fy = this.front(t); ctx.fillStyle = 'rgba(147,197,253,.45)'; ctx.fillRect(300, fy, 40, 386 - fy);
          ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(300, 336); ctx.lineTo(340, 336); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#64748B'; rr(ctx, 280, 88, 80, 8, 3); ctx.fill();
          ctx.restore();
          glassBeaker(ctx, 250, 110, 390, 396);
          if (t > 0.1) label(ctx, h, api.t(tx('water rises', 'पानी ऊपर चढ़ता है')), 460, fy, { col: '#BAE6FD', size: 12, align: 'left' });
          label(ctx, h, api.t(tx('start line', 'आरंभ रेखा')), 400, 336, { col: '#CBD5E1', size: 11, align: 'left', weight: 600 });
        },
      },
      centrifuge: {
        layers: (() => {
          const order = Object.keys(MX.parts).sort((a, b) => rank(a) - rank(b)); // bottom first
          function rank(k) { const s = SP[k]; return s.kind === 'solid' && s.dense ? 0 : s.light ? 2 : 1; }
          const total = Object.values(MX.parts).reduce((a, b) => a + b, 0); let y = 372; const o = {};
          order.forEach((k) => { const hgt = MX.parts[k] / total * 214 * (SP[k].kind === 'solid' ? 0.6 : 1.12); o[k] = [y - hgt, y]; y -= hgt; });
          return o;
        })(),
        home: (p) => wetIn({ x0: 462, x1: 518, y0: 160, y1: 368 }, p),
        at(p, t) { const L_ = this.layers[p.sp], k = ease(seg(t, 0.12, 0.8)); return { ...mid(this.home(p), { x: lerp(462, 518, p.u), y: lerp(L_[0] + 3, L_[1] - 3, p.v) }, k), a: 1 }; },
        draw(ctx, t) {
          const spin = ease(seg(t, 0.04, 0.86)) * Math.PI * 2 * 14;
          ctx.save(); ctx.translate(190, 228);
          ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, 128, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#64748B'; ctx.lineWidth = 4; ctx.stroke();
          if (t > 0.05 && t < 0.85) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.stroke(); }
          ctx.rotate(spin);
          const mixCol = Object.keys(MX.parts).map((k) => SP[k].col);
          // four slots: our tube and, opposite it, a balance tube of water (a centrifuge must be balanced)
          for (let i = 0; i < 4; i++) {
            ctx.save(); ctx.rotate(i * Math.PI / 2); ctx.fillStyle = '#1E293B'; rr(ctx, 40, -14, 76, 28, 12); ctx.fill();
            if (i === 0) { const g = ctx.createLinearGradient(46, 0, 110, 0); g.addColorStop(0, mixCol[1] || mixCol[0]); g.addColorStop(1, mixCol[0]); ctx.fillStyle = g; rr(ctx, 46, -9, 64, 18, 8); ctx.fill(); }
            if (i === 2) { ctx.fillStyle = '#60A5FA'; rr(ctx, 46, -9, 64, 18, 8); ctx.fill(); }
            ctx.restore();
          }
          ctx.fillStyle = '#94A3B8'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          label(ctx, h, api.t(tx('Inside the tube', 'नली के अंदर')), 490, 80, { pill: 'rgba(6,18,51,.75)', size: 12 });
          ctx.save(); ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(454, 110); ctx.lineTo(454, 350); ctx.arc(490, 350, 36, Math.PI, 0, true); ctx.lineTo(526, 110); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(318, 228); ctx.lineTo(446, 228); ctx.stroke(); ctx.restore();
        },
      },
      sublimation: {
        home: (p) => { const x = 320 + (p.u * 2 - 1) * 78; return { x, y: lerp(300, dishY(320, 292, 110, 50, x) - 5, p.v) }; },
        at(p, t) {
          const home = this.home(p);
          if (!p.s.sublimes) return { ...home, a: 1 };
          const d = 0.12 + p.d * 0.6, k = seg(t, d, d + 0.16);
          const q = 0.2 + p.v * 0.7, left = p.u < 0.5;
          const wall = left ? mid({ x: 230, y: 284 }, { x: 314, y: 156 }, q) : mid({ x: 410, y: 284 }, { x: 326, y: 156 }, q);
          const end = { x: wall.x + (left ? 6 : -6), y: wall.y };
          if (k <= 0) return { ...home, a: 1 };
          return { ...mid(home, end, ease(k)), a: k < 1 ? 0.45 : 1, vap: k < 1, cryst: k >= 1 };
        },
        draw(ctx, t, time) {
          tripod(ctx, 320, 344, 392); burner(ctx, 320, 356, 392, running || (t > 0 && t < 1) ? 0.8 : 0, time);
          dish(ctx, 320, 292, 110, 50);
          ctx.save(); ctx.fillStyle = 'rgba(190,220,255,.08)'; ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(222, 290); ctx.lineTo(313, 152); ctx.lineTo(313, 90); ctx.lineTo(327, 90); ctx.lineTo(327, 152); ctx.lineTo(418, 290); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.ellipse(320, 86, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          label(ctx, h, api.t(tx('cotton plug', 'रुई का डाट')), 340, 82, { col: '#CBD5E1', size: 11, align: 'left', weight: 600 });
        },
      },
    };
    function plate(ctx, cx, cy, rw) { ctx.save(); const g = ctx.createLinearGradient(0, cy - 12, 0, cy + 14); g.addColorStop(0, '#E2E8F0'); g.addColorStop(1, '#94A3B8'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy + 4, rw, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(15,23,42,.18)'; ctx.beginPath(); ctx.ellipse(cx, cy, rw - 16, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    function dish(ctx, cx, cy, hw, depth) { ctx.save(); ctx.fillStyle = 'rgba(248,250,252,.14)'; ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, cy, hw, depth, 0, 0, Math.PI); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - hw - 6, cy); ctx.lineTo(cx + hw + 6, cy); ctx.stroke(); ctx.restore(); }
    function tripod(ctx, cx, yTop, yBot) { ctx.save(); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 100, yTop); ctx.lineTo(cx + 100, yTop); ctx.moveTo(cx - 86, yTop); ctx.lineTo(cx - 110, yBot); ctx.moveTo(cx + 86, yTop); ctx.lineTo(cx + 110, yBot); ctx.stroke(); ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 90, yTop - 4); ctx.lineTo(cx + 90, yTop - 4); ctx.stroke(); ctx.restore(); }
    function magnetBar(ctx, x, y) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#E5484D'; rr(ctx, -84, -16, 84, 32, 6); ctx.fill(); ctx.fillStyle = '#2563EB'; rr(ctx, 0, -16, 84, 32, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', -64, 1); ctx.fillText('S', 64, 1); ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -60); ctx.stroke(); ctx.restore(); }
    function drawPart(ctx, p, q) {
      const s = p.s, r0 = s.r, x = q.x, y = q.y;
      if (q.a <= 0.01) return;
      ctx.globalAlpha = q.a;
      if (q.vap) { dot(ctx, s.col, r0 * 0.9, x, y, q.a); ctx.globalAlpha = 1; return; }
      if (s.shape === 'filing') { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillStyle = '#CBD5E1'; ctx.fillRect(-r0 * 1.2, -1.6, r0 * 2.4, 3.2); ctx.fillStyle = '#475569'; ctx.fillRect(-r0 * 1.2, 0.6, r0 * 2.4, 1.2); ctx.restore(); }
      else if (s.shape === 'flake') { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillStyle = s.col; ctx.beginPath(); ctx.ellipse(0, 0, r0, r0 * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
      else if (s.shape === 'cube' || (s.crystal && q.cryst)) { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot * 0.2); ctx.fillStyle = s.col; const a = (s.crystal ? 4.2 : r0) * 1.6; ctx.fillRect(-a / 2, -a / 2, a, a); ctx.strokeStyle = 'rgba(100,116,139,.8)'; ctx.lineWidth = 1; ctx.strokeRect(-a / 2, -a / 2, a, a); ctx.restore(); }
      else dot(ctx, s.col, r0, x, y, q.a);
      ctx.globalAlpha = 1;
    }
    const scene = () => SC[method || 'none'];
    function side() {
      const chips = Object.keys(MX.parts).map((k) => `<span class="pt-chip"><i style="background:${SP[k].col}"></i>${esc(api.t(SP[k].name))}</span>`).join('');
      h.side.innerHTML = `
        <div class="pt-card"><h3>${esc(api.t(MX.name))}</h3><div class="pt-chips">${chips}</div></div>
        <div class="pt-card"><h3>${esc(api.t(offered.length > 1 ? tx('Choose a way to separate it', 'अलग करने का तरीक़ा चुनो') : tx('The method', 'तरीक़ा')))}</h3>
          <div class="pt-meth" role="group">${offered.map((m) => `<button type="button" class="pt-mbtn" data-key="method:${m}" aria-pressed="${method === m}"><span class="pt-mi"></span>${esc(api.t(METHOD[m].name))}</button>`).join('')}</div>
          <p class="pt-small" data-r="how" style="margin-top:8px"></p></div>
        <div class="pt-btns"><button type="button" class="pt-btn pt-go" data-key="run">${esc(api.t(tx('Start', 'शुरू करो')))}</button></div>
        <div class="pt-card" data-r="res" hidden><div class="pt-state"><span class="pt-pill" data-r="pill"></span></div><p data-r="note" style="margin-top:6px"></p></div>
        ${h.photo}`;
      paint();
    }
    function paint() {
      h.side.querySelectorAll('.pt-mbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'method:' + method)));
      const how = h.side.querySelector('[data-r="how"]'); how.textContent = method ? api.t(METHOD[method].how) : api.t(tx('Tap a method, then tap Start.', 'कोई तरीक़ा चुनो, फिर "शुरू करो" दबाओ।'));
      const run = h.side.querySelector('[data-key="run"]'); run.textContent = api.t(ran && !running ? tx('Again', 'फिर से') : running ? tx('Working…', 'हो रहा है…') : tx('Start', 'शुरू करो'));
      const res = h.side.querySelector('[data-r="res"]');
      if (ran && !running && method) {
        const out = MX.methods[method];
        res.hidden = false;
        const pill = h.side.querySelector('[data-r="pill"]'); pill.className = 'pt-pill ' + (out.ok ? 'done' : 'sat'); pill.textContent = api.t(out.ok ? tx('Separated', 'अलग हो गया') : tx('Not separated', 'अलग नहीं हुआ'));
        h.side.querySelector('[data-r="note"]').textContent = api.t(out.note);
      } else res.hidden = true;
      h.tag(method ? api.t(METHOD[method].name) : api.t(MX.name));
    }
    function finish() {
      running = false; ran = true; t = 1;
      const out = MX.methods[method];
      h.live(out.note);
      api.record(api.t(METHOD[method].name) + ': ' + api.t(out.ok ? tx('separated', 'अलग हुआ') : tx('did not separate', 'अलग नहीं हुआ')));
      if (out.ok) { api.emit('separated'); api.celebrate(); }
      paint(); h.redraw();
    }
    function press(key) {
      if (key.startsWith('method:')) {
        if (running) return;
        const m = key.slice(7); if (!offered.includes(m)) return;
        method = m; t = 0; ran = false;
        api.record(api.t(tx('Chose ', 'चुना: ')) + api.t(METHOD[m].name));
        api.speak(api.t(METHOD[m].name));
        paint(); h.redraw();
      } else if (key === 'run') {
        if (running) return;
        if (!method) { api.toast(tx('First choose a way to separate it.', 'पहले अलग करने का तरीक़ा चुनो।')); return; }
        t = 0; ran = false; running = true;
        if (reduced()) { finish(); return; }
        paint();
      }
    }
    function step(dt) { time += dt; if (running) { t = Math.min(1, t + dt / 7); if (t >= 1) finish(); } }
    function draw(ctx) {
      bg(ctx, 640, H);
      ctx.fillStyle = '#25356F'; ctx.fillRect(0, 396, 640, 24);
      const sc = scene();
      sc.draw(ctx, t, time);
      const jitter = !running && t === 0;
      for (const p of parts) {
        const q = sc.at(p, t);
        if (jitter && (p.s.kind === 'liquid' || p.s.kind === 'dissolved' || p.s.kind === 'fat' || (MX.wet && p.s.kind !== 'dye'))) { q.x += Math.sin(time * 3 + p.w * 20) * 1.6; q.y += Math.cos(time * 2.6 + p.d * 20) * 1.4; }
        drawPart(ctx, p, q);
      }
    }
    return { H, side, step, draw, press, slide() {}, settle() {}, init() { h.live(offered.length > 1 ? tx('Which way will separate this mixture? Choose one and start. You can try them all.', 'कौन-सा तरीक़ा इस मिश्रण को अलग करेगा? एक चुनो और शुरू करो। तुम सब आज़मा सकते हो।') : tx('Tap Start and watch what happens to each kind of particle.', '"शुरू करो" दबाओ और देखो कि हर तरह के कण के साथ क्या होता है।')); } };
  }

  // ---------- mode: gaslaw ----------
  function gaslawCtl(cfg, api, h) {
    const hold = cfg.hold || 'none';
    const H = 440;
    let T = GAS.T0, P = GAS.P0;
    const n = 1;
    const V0 = n * R_GAS * GAS.T0 / GAS.P0;
    const Vfix = V0;
    const vol = () => (hold === 'volume' ? Vfix : n * R_GAS * T / P);
    const pres = () => (hold === 'volume' ? n * R_GAS * T / Vfix : P);
    let Vshow = vol(), Ttarget = T, time = 0, fx = 0, fxDir = 0;
    const cyl = { x0: 176, x1: 394, yb: 358, ytop: 58 };
    const pistonY = (V) => cyl.yb - V / GAS.Vmax * (cyl.yb - cyl.ytop - 24);
    const G = [];
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; G.push({ x: lerp(cyl.x0 + 8, cyl.x1 - 8, Math.random()), y: lerp(pistonY(Vshow) + 20, cyl.yb - 8, Math.random()), a }); }
    const lawName = { none: tx('Combined gas law', 'संयुक्त गैस नियम'), temperature: tx("Boyle's law", 'बॉयल का नियम'), pressure: tx("Charles's law", 'चार्ल्स का नियम'), volume: tx("Gay-Lussac's law", 'गे-लुसैक का नियम') }[hold];
    const lawText = {
      none: tx('For a fixed amount of gas, P × V ÷ T stays the same (T in kelvin).', 'गैस की तय मात्रा के लिए P × V ÷ T हमेशा एक-सा रहता है (T केल्विन में)।'),
      temperature: tx('Temperature is kept fixed. Squeeze the gas harder and its volume gets smaller: P × V stays the same.', 'तापमान स्थिर रखा गया है। गैस को ज़्यादा दबाओ तो आयतन घटता है: P × V एक-सा रहता है।'),
      pressure: tx('Pressure is kept fixed. Heat the gas and it expands: V ÷ T stays the same (T in kelvin).', 'दाब स्थिर रखा गया है। गैस गर्म करो तो वह फैलती है: V ÷ T एक-सा रहता है (T केल्विन में)।'),
      volume: tx('The container is rigid, so the volume is fixed. Heat the gas and its pressure rises: P ÷ T stays the same.', 'बर्तन कड़ा है, इसलिए आयतन तय है। गैस गर्म करो तो दाब बढ़ता है: P ÷ T एक-सा रहता है।'),
    }[hold];
    const inv = () => (hold === 'temperature' ? `P × V = ${fmt(pres() * vol(), 0)} kPa·L` : hold === 'pressure' ? `V ÷ T = ${fmt(vol() / T, 4)} L/K` : hold === 'volume' ? `P ÷ T = ${fmt(pres() / T, 3)} kPa/K` : `P × V ÷ T = ${fmt(pres() * vol() / T, 2)} J/K`);
    function side() {
      const tSl = hold !== 'temperature', pSl = hold === 'none' || hold === 'temperature';
      h.side.innerHTML = `
        <div class="pt-card"><h3>${esc(api.t(lawName))}</h3><p>${esc(api.t(lawText))}</p></div>
        <div class="pt-read">
          <div><div class="pt-small">${esc(api.t(tx('Pressure P', 'दाब P')))}</div><div class="pt-big" data-r="P"></div></div>
          <div><div class="pt-small">${esc(api.t(tx('Volume V', 'आयतन V')))}</div><div class="pt-big" data-r="V"></div></div>
          <div><div class="pt-small">${esc(api.t(tx('Temperature T', 'तापमान T')))}</div><div class="pt-big" data-r="T"></div><div class="pt-small" data-r="TC"></div></div>
        </div>
        ${tSl ? `<div class="pt-btns"><button type="button" class="pt-btn pt-hot" data-key="heat">${esc(api.t(tx('Heat +25 K', 'गर्म करो +25 K')))}</button><button type="button" class="pt-btn pt-cold" data-key="cool">${esc(api.t(tx('Cool −25 K', 'ठंडा करो −25 K')))}</button></div>
        <div class="pt-card pt-sl"><label for="pt-gl-t"><span>${esc(api.t(tx('Temperature', 'तापमान')))}</span><output data-r="tout"></output></label><input id="pt-gl-t" type="range" data-key="slider:temp" min="${GAS.T[0]}" max="${GAS.T[1]}" step="1" value="${Math.round(T)}" aria-label="${esc(api.t(tx('Temperature in kelvin', 'तापमान केल्विन में')))}"><div class="pt-ends"><span>${GAS.T[0]} K</span><span>${GAS.T[1]} K</span></div></div>` : ''}
        ${pSl ? `<div class="pt-card pt-sl"><label for="pt-gl-p"><span>${esc(api.t(tx('Pressure on the piston', 'पिस्टन पर दाब')))}</span><output data-r="pout"></output></label><input id="pt-gl-p" type="range" data-key="slider:pressure" min="${GAS.P[0]}" max="${GAS.P[1]}" step="1" value="${Math.round(P)}" aria-label="${esc(api.t(tx('Pressure in kilopascals', 'दाब किलोपास्कल में')))}"><div class="pt-ends"><span>${GAS.P[0]} kPa</span><span>${GAS.P[1]} kPa</span></div></div>` : ''}
        <div class="pt-card"><div data-r="chart"></div><p class="pt-small" data-r="inv"></p><p class="pt-small">${esc(api.t(tx('1 mole of gas. 101.3 kPa is normal air pressure; 0 K is −273 °C.', '1 मोल गैस। 101.3 kPa सामान्य वायुदाब है; 0 K = −273 °C।')))}</p></div>`;
      paint(true);
    }
    let lk = '';
    function paint(force) {
      const key = fmt(T) + '|' + fmt(pres(), 1) + '|' + fmt(vol(), 1);
      if (!force && key === lk) return; lk = key;
      const q = (k) => h.side.querySelector(`[data-r="${k}"]`);
      q('P').textContent = `${fmt(pres(), 1)} kPa`; q('V').textContent = `${fmt(vol(), 1)} L`; q('T').textContent = `${fmt(T)} K`; q('TC').textContent = `${fmt(T - K0)} °C`;
      if (q('tout')) q('tout').textContent = `${fmt(T)} K`; if (q('pout')) q('pout').textContent = `${fmt(P, 1)} kPa`;
      q('inv').textContent = inv();
      const ts = h.side.querySelector('[data-key="slider:temp"]'); if (ts && document.activeElement !== ts) ts.value = Math.round(T);
      let o;
      if (hold === 'pressure') {
        const k = n * R_GAS / P;
        o = { xl: api.t(tx('Temperature T (K) →', 'तापमान T (K) →')), yl: api.t(tx('Volume V (L)', 'आयतन V (L)')), x: [0, 520], y: [0, 90], ticks: [0, 45, 90], xticks: [0, 250, 500], lines: [{ pts: [[0, 0], [GAS.T[0], k * GAS.T[0]]], cls: 'pt-ch-dash' }, { pts: [[GAS.T[0], k * GAS.T[0]], [GAS.T[1], k * GAS.T[1]]], cls: 'pt-ch-line' }], dot: [T, vol()] };
      } else if (hold === 'volume') {
        const k = n * R_GAS / Vfix;
        o = { xl: api.t(tx('Temperature T (K) →', 'तापमान T (K) →')), yl: api.t(tx('Pressure P (kPa)', 'दाब P (kPa)')), x: [0, 520], y: [0, 260], ticks: [0, 130, 260], xticks: [0, 250, 500], lines: [{ pts: [[0, 0], [GAS.T[0], k * GAS.T[0]]], cls: 'pt-ch-dash' }, { pts: [[GAS.T[0], k * GAS.T[0]], [GAS.T[1], k * GAS.T[1]]], cls: 'pt-ch-line' }], dot: [T, pres()] };
      } else {
        const pts = []; for (let V = n * R_GAS * T / 260; V <= 90; V += 1) pts.push([V, n * R_GAS * T / V]);
        o = { xl: api.t(tx('Volume V (L) →', 'आयतन V (L) →')), yl: api.t(tx('Pressure P (kPa)', 'दाब P (kPa)')), x: [0, 90], y: [0, 260], ticks: [0, 130, 260], xticks: [0, 45, 90], lines: [{ pts, cls: 'pt-ch-line' }], dot: [vol(), pres()] };
      }
      o.aria = api.t(tx('Graph of the gas law with the present point', 'गैस नियम का ग्राफ़ और अभी का बिंदु'));
      q('chart').innerHTML = chartSVG(o);
      h.tag(api.t(tx('Gas in a cylinder with a piston', 'पिस्टन वाले सिलिंडर में गैस')));
    }
    let pSaid = pres();
    function setT(v, final) {
      T = clamp(v, GAS.T[0], GAS.T[1]);
      if (final) {
        api.emit('changed:temp');
        if (hold === 'volume' && Math.abs(pres() - pSaid) > 1e-9) { pSaid = pres(); api.emit('changed:pressure'); }
        api.record(api.t(tx('Temperature now ', 'तापमान अब ')) + fmt(T) + ' K');
      }
    }
    function press(key) {
      if (key !== 'heat' && key !== 'cool') return;
      const s = key === 'heat' ? 1 : -1;
      const goal = clamp(Ttarget + 25 * s, GAS.T[0], GAS.T[1]);
      if (goal === Ttarget) { api.toast(s > 0 ? tx('This is as hot as this lab goes.', 'यह लैब इससे ज़्यादा गर्म नहीं होती।') : tx('This is as cold as this lab goes.', 'यह लैब इससे ज़्यादा ठंडी नहीं होती।')); return; }
      Ttarget = goal; fx = 1.6; fxDir = s;
      if (reduced()) { setT(Ttarget, true); Vshow = vol(); }
      h.redraw();
    }
    function slide(key, v, final) {
      if (key === 'slider:temp') { Ttarget = clamp(v, GAS.T[0], GAS.T[1]); setT(Ttarget, final); }
      else if (key === 'slider:pressure') { P = clamp(v, GAS.P[0], GAS.P[1]); if (final) { api.emit('changed:pressure'); api.record(api.t(tx('Pressure now ', 'दाब अब ')) + fmt(P, 1) + ' kPa'); } }
      if (reduced()) Vshow = vol();
      h.redraw();
    }
    function step(dt) {
      time += dt;
      if (fx > 0) fx -= dt;
      if (Math.abs(T - Ttarget) > 0.01) { T += clamp(Ttarget - T, -40 * dt, 40 * dt); if (Math.abs(T - Ttarget) <= 0.01) { T = Ttarget; setT(T, true); } }
      Vshow = lerp(Vshow, vol(), Math.min(1, dt * 4));
      const top = pistonY(Vshow) + 8, sp = 160 * Math.sqrt(T / 300);
      for (const p of G) {
        p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt;
        if (p.x < cyl.x0 + 6) { p.x = cyl.x0 + 6; p.a = Math.PI - p.a; }
        if (p.x > cyl.x1 - 6) { p.x = cyl.x1 - 6; p.a = Math.PI - p.a; }
        if (p.y < top + 6) { p.y = top + 6; p.a = -p.a; }
        if (p.y > cyl.yb - 6) { p.y = cyl.yb - 6; p.a = -p.a; }
      }
      paint();
    }
    function settle() { Vshow = vol(); const top = pistonY(Vshow) + 14; G.forEach((p) => { if (p.y < top) p.y = lerp(top, cyl.yb - 8, Math.random()); }); paint(true); }
    function draw(ctx) {
      bg(ctx, 640, H);
      ctx.fillStyle = '#25356F'; ctx.fillRect(0, 400, 640, 40);
      // heat or cold under the cylinder
      if (fx > 0 && fxDir > 0) { burner(ctx, 285, 366, 400, 1, time); }
      else if (fx > 0 && fxDir < 0) { ctx.save(); ctx.fillStyle = '#7DD3FC'; rr(ctx, 186, 368, 198, 26, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 6; k++) { rr(ctx, 196 + k * 31, 373 + (k % 2) * 5, 20, 14, 4); ctx.fill(); } ctx.restore(); }
      else { ctx.fillStyle = '#3B4E95'; rr(ctx, 226, 372, 120, 22, 6); ctx.fill(); }
      const py = pistonY(Vshow);
      const warm = clamp((T - 150) / 350, 0, 1);
      ctx.save(); const g = ctx.createLinearGradient(0, py, 0, cyl.yb); g.addColorStop(0, `rgba(${Math.round(lerp(56, 255, warm))},${Math.round(lerp(189, 122, warm))},${Math.round(lerp(248, 26, warm))},.10)`); g.addColorStop(1, `rgba(${Math.round(lerp(56, 255, warm))},${Math.round(lerp(189, 122, warm))},${Math.round(lerp(248, 26, warm))},.22)`); ctx.fillStyle = g; ctx.fillRect(cyl.x0, py, cyl.x1 - cyl.x0, cyl.yb - py); ctx.restore();
      const gc = warm < 0.5 ? mixHex('#38BDF8', '#A78BFA', warm * 2) : mixHex('#A78BFA', '#FF7A1A', warm * 2 - 1);
      for (const p of G) dot(ctx, gc, 6, p.x, p.y, 1);
      // cylinder walls
      ctx.save(); ctx.strokeStyle = 'rgba(214,232,255,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cyl.x0 - 3, cyl.ytop); ctx.lineTo(cyl.x0 - 3, cyl.yb + 3); ctx.lineTo(cyl.x1 + 3, cyl.yb + 3); ctx.lineTo(cyl.x1 + 3, cyl.ytop); ctx.stroke();
      // volume scale
      ctx.strokeStyle = 'rgba(214,232,255,.55)'; ctx.lineWidth = 1.5;
      for (let V = 0; V <= 80; V += 10) { const y = pistonY(V); ctx.beginPath(); ctx.moveTo(cyl.x0 - 5, y); ctx.lineTo(cyl.x0 - (V % 20 ? 11 : 17), y); ctx.stroke(); if (V % 20 === 0) label(ctx, h, `${V} L`, cyl.x0 - 22, y, { align: 'right', size: 11, weight: 600, col: '#C7D2FE' }); }
      // piston, rod and weights or clamps
      const pg = ctx.createLinearGradient(0, py - 16, 0, py); pg.addColorStop(0, '#CBD5E1'); pg.addColorStop(1, '#64748B'); ctx.fillStyle = pg; rr(ctx, cyl.x0, py - 16, cyl.x1 - cyl.x0, 16, 4); ctx.fill();
      ctx.fillStyle = '#94A3B8'; ctx.fillRect(280, cyl.ytop - 30, 10, py - 16 - cyl.ytop + 30);
      if (hold === 'volume') { ctx.fillStyle = '#E5484D'; [cyl.x0 - 14, cyl.x1 + 2].forEach((x) => { rr(ctx, x, py - 22, 12, 28, 3); ctx.fill(); }); label(ctx, h, api.t(tx('piston locked', 'पिस्टन बंद')), 285, cyl.ytop - 40, { pill: '#E5484D', col: '#fff', size: 12 }); }
      else { const nW = clamp(Math.round(P / 50), 1, 5); for (let k = 0; k < nW; k++) { const wy = py - 16 - (k + 1) * 18; ctx.fillStyle = k % 2 ? '#475569' : '#334155'; rr(ctx, 230 + k * 2, wy, 110 - k * 4, 16, 4); ctx.fill(); ctx.fillStyle = '#94A3B8'; ctx.fillRect(250, wy + 6, 70, 2); } }
      ctx.restore();
      // pressure gauge
      const gx = 540, gy = 120, gr = 58, ang = (p) => (-210 + clamp(p / 300, 0, 1) * 240) * Math.PI / 180;
      ctx.save(); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(gx, gy + gr); ctx.lineTo(gx, cyl.yb - 12); ctx.lineTo(cyl.x1 + 3, cyl.yb - 12); ctx.stroke();
      ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; for (let v = 0; v <= 300; v += 50) { const a = ang(v); ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * (gr - 12), gy + Math.sin(a) * (gr - 12)); ctx.lineTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4)); ctx.stroke(); }
      const a = ang(pres()); ctx.strokeStyle = '#E5484D'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * (gr - 14), gy + Math.sin(a) * (gr - 14)); ctx.stroke();
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(gx, gy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      label(ctx, h, `${fmt(pres(), 0)} kPa`, gx, gy + 26, { col: '#1E293B', size: 13 });
      thermo(ctx, h, 606, 236, 330, (T - GAS.T[0]) / (GAS.T[1] - GAS.T[0]), `${fmt(T)} K`);
    }
    return { H, side, step, draw, press, slide, settle, init() { h.live(hold === 'volume' ? tx('Heat or cool the gas and watch the pressure gauge.', 'गैस को गर्म या ठंडा करो और दाब-मापी देखो।') : hold === 'temperature' ? tx('Change the pressure on the piston and watch the volume.', 'पिस्टन पर दाब बदलो और आयतन देखो।') : tx('Heat or cool the gas and watch the piston move.', 'गैस को गर्म या ठंडा करो और पिस्टन को चलते देखो।')); } };
  }

  const CTRL = { states: statesCtl, dissolve: dissolveCtl, diffusion: diffusionCtl, separate: separateCtl, gaslaw: gaslawCtl };

  function mount(root, cfg, api) {
    cfg = Object.assign({}, cfg);
    const W = 640;
    root.innerHTML = `<div class="pt-wrap"><div class="pt-grid"><div class="pt-left"><div class="pt-stage"><canvas class="pt-cv"></canvas><div class="pt-tag" aria-hidden="true"></div></div><p class="pt-live" aria-live="polite"></p></div><div class="pt-side"></div></div></div>`;
    const cvs = root.querySelector('canvas'), ctx = cvs.getContext('2d');
    const sideEl = root.querySelector('.pt-side'), live = root.querySelector('.pt-live'), tagEl = root.querySelector('.pt-tag');
    let scale = 1, liveText = null, tagText = '';
    const assetId = 'particles-' + (cfg.mode === 'separate' ? (cfg.mixture || 'sand-water') : cfg.mode + '-' + (cfg.substance || ''));
    const photoUrl = api.asset ? api.asset(assetId) : null;
    const h = {
      side: sideEl,
      get photo() { return photoUrl ? `<img class="pt-photo" src="${esc(photoUrl)}" alt="${esc(api.t(tx('Photo of the real thing', 'असली चीज़ की फ़ोटो')))}">` : ''; },
      fs: (px) => Math.max(px, 12 / scale),
      live(text) { liveText = text; live.textContent = api.t(text); },
      tag(text) { if (text !== tagText) { tagText = text; tagEl.textContent = text; } },
      redraw() { if (reduced()) render(); },
    };
    const C = CTRL[cfg.mode](cfg, api, h);
    cvs.style.aspectRatio = `${W} / ${C.H}`;
    cvs.setAttribute('role', 'img');
    function aria() { cvs.setAttribute('aria-label', api.t(tx('Particle view. The panel beside it lists the readings.', 'कणों का दृश्य। बगल के पैनल में सारी रीडिंग लिखी हैं।'))); }
    function render() { ctx.clearRect(0, 0, W, C.H); C.draw(ctx); }
    function size() {
      const w = cvs.clientWidth || root.clientWidth || W;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      scale = w / W;
      cvs.width = Math.round(w * dpr); cvs.height = Math.round(w * C.H / W * dpr);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      render();
    }
    let lang = api.lang();
    C.side(); aria(); if (C.init) C.init();
    if (!photoUrl && cfg.mode !== 'separate') { /* fallback drawn in the canvas; no photo needed */ }
    else if (photoUrl && cfg.mode !== 'separate') sideEl.insertAdjacentHTML('beforeend', h.photo);
    const onClick = (e) => {
      const el = e.target.closest('button[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      C.press(key);
    };
    const sliderVal = {};
    const onInput = (e) => {
      const el = e.target; if (!el.matches || !el.matches('input[type="range"][data-key]')) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { if (sliderVal[key] != null) el.value = sliderVal[key]; if (e.type === 'change') api.nudge(key); return; }
      C.slide(key, Number(el.value), e.type === 'change');
      sliderVal[key] = el.value;
    };
    const onFocus = (e) => { const el = e.target; if (el.matches && el.matches('input[type="range"][data-key]')) sliderVal[el.dataset.key] = el.value; };
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('pointerdown', onFocus, true);
    root.addEventListener('focusin', onFocus);
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(size); ro.observe(cvs); }
    window.addEventListener('resize', size);
    let on = true, lastT = 0, raf = 0;
    const checkLang = () => { if (api.lang() !== lang) { lang = api.lang(); C.side(); aria(); if (liveText) live.textContent = api.t(liveText); if (photoUrl && cfg.mode !== 'separate') sideEl.insertAdjacentHTML('beforeend', h.photo); render(); } };
    const langTimer = setInterval(checkLang, 400);
    function frame(now) {
      if (!on) return;
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60; lastT = now;
      if (!reduced()) { C.step(dt); render(); }
      raf = requestAnimationFrame(frame);
    }
    if (reduced()) { C.settle(); }
    size();
    raf = requestAnimationFrame(frame);
    return {
      destroy() {
        on = false; cancelAnimationFrame(raf); clearInterval(langTimer);
        if (ro) ro.disconnect(); window.removeEventListener('resize', size);
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onInput);
        root.removeEventListener('pointerdown', onFocus, true); root.removeEventListener('focusin', onFocus);
      },
    };
  }

  NCA_T.register({
    id: 'particles',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'states', substance: 'water', temp: -10 },
    substances: MODE_SUBS,
    mixtures: Object.keys(MIX),
    methods: Object.keys(METHOD),
    mount,
  });
})();
