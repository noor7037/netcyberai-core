// Template: Sky and space. Sun, Earth and Moon: phases of the Moon, day and night, seasons, eclipses, the solar
// system, the night sky (real star positions), Kepler orbits and Earth satellites. The astronomy is computed, not
// scripted: the Moon's phase and tithi from its elongation; sunrise, sunset, day length and noon Sun height from the
// Sun's declination and the place's latitude; seasons from the 23.44° tilt; eclipses from the Moon's 5.1° orbit tilt
// and real angular sizes; planets from real periods and J2000 mean longitudes; stars from real right ascension and
// declination turned into the sky of an Indian city; orbits from Kepler's equation and the vis-viva law; satellites
// from v = √(GM/r). Optional 3D view (three.js r128 from cdnjs) for moon-phases, day-night and seasons; the 2D view is
// complete without it. Config:
//   { mode: 'moon-phases'|'day-night'|'seasons'|'eclipse'|'solar-system'|'constellations'|'orbits'|'satellite',
//     startDay?: number (see DAYRANGE), place?: an Indian city id (day-night, seasons, constellations) }
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp, mixHex } = L;
  const reduced = L.reducedMotion;
  const T2 = (en, hi) => ({ en, hi });
  const TAU = Math.PI * 2, RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const mod = (a, n) => ((a % n) + n) % n;
  const wrap180 = (d) => mod(d + 180, 360) - 180;
  const f = (v) => Math.round(v * 10) / 10;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const MONTH = 29.530589;        // synodic month, days
  const TILT = 23.44;             // Earth's axial tilt, degrees
  const MOON_INC = 5.145;         // tilt of the Moon's orbit to the Earth's orbit, degrees
  const GM = 398600.4418, RE = 6371, SIDEREAL_MIN = 1436.07; // km³/s², km, minutes
  const J2026 = 9496.5;           // days from J2000.0 to 1 January 2026, 0 h UT
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const MODES = ['moon-phases', 'day-night', 'seasons', 'eclipse', 'solar-system', 'constellations', 'orbits', 'satellite'];
  const DAYRANGE = {
    'moon-phases': [0, 29.5, 'day of the Moon\'s month'], eclipse: [0, 29.5, 'day of the Moon\'s month'],
    'day-night': [1, 365, 'day of the year'], seasons: [1, 365, 'day of the year'], constellations: [1, 365, 'day of the year'],
    'solar-system': [0, 10957, 'days after 1 January 2026'], orbits: [0, 36500, 'days after the planet is closest to the Sun'],
    satellite: [0, 365, 'not used'],
  };
  const PLACED = ['day-night', 'seasons', 'constellations'];

  // ---------------------------------------------------------------- places (latitude °N, longitude °E)
  const PLACES = {
    delhi: { lat: 28.61, lon: 77.21, n: T2('Delhi', 'दिल्ली') },
    mumbai: { lat: 19.08, lon: 72.88, n: T2('Mumbai', 'मुंबई') },
    kolkata: { lat: 22.57, lon: 88.36, n: T2('Kolkata', 'कोलकाता') },
    chennai: { lat: 13.08, lon: 80.27, n: T2('Chennai', 'चेन्नई') },
    bengaluru: { lat: 12.97, lon: 77.59, n: T2('Bengaluru', 'बेंगलुरु') },
    bhopal: { lat: 23.26, lon: 77.41, n: T2('Bhopal', 'भोपाल') },
    guwahati: { lat: 26.14, lon: 91.74, n: T2('Guwahati', 'गुवाहाटी') },
    srinagar: { lat: 34.08, lon: 74.8, n: T2('Srinagar', 'श्रीनगर') },
    kanyakumari: { lat: 8.09, lon: 77.54, n: T2('Kanyakumari', 'कन्याकुमारी') },
  };
  const CITIES = [
    { lat: 51.51, lon: -0.13, n: T2('London', 'लंदन') },
    { lat: 40.71, lon: -74.01, n: T2('New York', 'न्यूयॉर्क') },
    { lat: 35.68, lon: 139.69, n: T2('Tokyo', 'टोक्यो') },
  ];

  // ---------------------------------------------------------------- calendar and clock words
  const MON = [['January', 'जनवरी', 31], ['February', 'फ़रवरी', 28], ['March', 'मार्च', 31], ['April', 'अप्रैल', 30], ['May', 'मई', 31], ['June', 'जून', 30],
    ['July', 'जुलाई', 31], ['August', 'अगस्त', 31], ['September', 'सितंबर', 30], ['October', 'अक्टूबर', 31], ['November', 'नवंबर', 30], ['December', 'दिसंबर', 31]];
  function dateOf(N) {
    let d = Math.floor(mod(N - 1, 365)), m = 0;
    while (d >= MON[m][2]) { d -= MON[m][2]; m++; }
    return { m, en: `${d + 1} ${MON[m][0]}`, hi: `${d + 1} ${MON[m][1]}` };
  }
  function clock(h) {
    h = mod(h, 24);
    let H = Math.floor(h), m = Math.round((h - H) * 60);
    if (m === 60) { m = 0; H = (H + 1) % 24; }
    const h12 = ((H + 11) % 12) + 1, mm = String(m).padStart(2, '0');
    const part = H >= 4 && H < 12 ? 'सुबह' : H >= 12 && H < 16 ? 'दोपहर' : H >= 16 && H < 19 ? 'शाम' : 'रात';
    return { en: `${h12}:${mm} ${H < 12 ? 'am' : 'pm'}`, hi: `${part} ${h12}:${mm}` };
  }
  function dur(h) {
    let H = Math.floor(h), m = Math.round((h - H) * 60);
    if (m === 60) { m = 0; H++; }
    return { en: `${H} h ${m} min`, hi: `${H} घंटे ${m} मिनट` };
  }
  const nf = (x, d = 0) => Number(x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------------------------------------------------------------- the Moon
  const PHASES = [
    { key: 'new_moon', n: T2('New moon', 'अमावस्या (नया चाँद)'), see: T2('Not seen: it is in the sky with the Sun.', 'दिखता नहीं: यह दिन में सूरज के साथ आकाश में होता है।') },
    { key: 'waxing_crescent', n: T2('Waxing crescent', 'शुक्ल पक्ष का हँसिया चाँद'), see: T2('In the evening, low in the west after sunset.', 'शाम को, सूर्यास्त के बाद पश्चिम में नीचे।') },
    { key: 'first_quarter', n: T2('First quarter (half moon)', 'शुक्ल पक्ष का आधा चाँद (अष्टमी)'), see: T2('From afternoon to midnight.', 'दोपहर से आधी रात तक।') },
    { key: 'waxing_gibbous', n: T2('Waxing gibbous', 'शुक्ल पक्ष, लगभग पूरा चाँद'), see: T2('In the evening and most of the night.', 'शाम को और रात के अधिकांश भाग में।') },
    { key: 'full_moon', n: T2('Full moon', 'पूर्णिमा (पूरा चाँद)'), see: T2('All night: it rises at sunset and sets at sunrise.', 'पूरी रात: सूर्यास्त पर उगता है और सूर्योदय पर डूबता है।') },
    { key: 'waning_gibbous', n: T2('Waning gibbous', 'कृष्ण पक्ष, लगभग पूरा चाँद'), see: T2('Late evening, through the night, into the morning.', 'देर शाम से रात भर, सुबह तक।') },
    { key: 'last_quarter', n: T2('Last quarter (half moon)', 'कृष्ण पक्ष का आधा चाँद (अष्टमी)'), see: T2('From midnight to the morning.', 'आधी रात से सुबह तक।') },
    { key: 'waning_crescent', n: T2('Waning crescent', 'कृष्ण पक्ष का हँसिया चाँद'), see: T2('Before sunrise, low in the east.', 'सूर्योदय से पहले, पूर्व में नीचे।') },
  ];
  function phaseOf(day) {
    const d = mod(day, MONTH), q = MONTH / 4;
    for (let k = 0; k < 4; k++) if (Math.abs(mod(d - k * q + MONTH / 2, MONTH) - MONTH / 2) <= 1) return PHASES[k * 2];
    return PHASES[Math.min(7, Math.floor(d / q) * 2 + 1)];
  }
  const TITHI = [['Pratipada', 'प्रतिपदा'], ['Dwitiya', 'द्वितीया'], ['Tritiya', 'तृतीया'], ['Chaturthi', 'चतुर्थी'], ['Panchami', 'पंचमी'], ['Shashthi', 'षष्ठी'], ['Saptami', 'सप्तमी'],
    ['Ashtami', 'अष्टमी'], ['Navami', 'नवमी'], ['Dashami', 'दशमी'], ['Ekadashi', 'एकादशी'], ['Dwadashi', 'द्वादशी'], ['Trayodashi', 'त्रयोदशी'], ['Chaturdashi', 'चतुर्दशी']];
  // A tithi is the time the Moon takes to gain 12° on the Sun (30 in a month).
  function tithiOf(day) {
    const i = Math.min(29, Math.floor((mod(day, MONTH) / MONTH) * 30));
    if (i === 14) return T2('Purnima', 'पूर्णिमा');
    if (i === 29) return T2('Amavasya', 'अमावस्या');
    const p = i < 15 ? T2('Shukla', 'शुक्ल') : T2('Krishna', 'कृष्ण'), j = i % 15;
    return { en: `${p.en} ${TITHI[j][0]}`, hi: `${p.hi} ${TITHI[j][1]}` };
  }

  // ---------------------------------------------------------------- the Sun from a place on Earth
  const declination = (N, tilt) => -tilt * Math.cos((TAU * (N + 10)) / 365);
  function dayHours(lat, dec) {
    const x = -Math.tan(lat * RAD) * Math.tan(dec * RAD);
    if (x <= -1) return 24;
    if (x >= 1) return 0;
    return (2 * Math.acos(x) * DEG) / 15;
  }
  const noonAlt = (lat, dec) => 90 - Math.abs(lat - dec);
  const sunDistMkm = (N) => 149.6 * (1 - 0.0167 * Math.cos((TAU * (N - 3)) / 365.25));
  // A direction on the sky from (hour angle °, declination °) at latitude lat: [east, north, up].
  function enu(Hdeg, dec, lat) {
    const H = Hdeg * RAD, d = dec * RAD, p = lat * RAD;
    return [-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p), Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(H) * Math.cos(p)];
  }
  function sunAltAz(lat, dec, tau) {
    const v = enu(15 * (tau - 12), dec, lat);
    return { alt: Math.asin(clamp(v[2], -1, 1)) * DEG, az: mod(Math.atan2(v[0], v[1]) * DEG, 360) };
  }
  const SEASONS = { spring: T2('Spring', 'वसंत'), summer: T2('Summer', 'ग्रीष्म (गर्मी)'), autumn: T2('Autumn', 'शरद'), winter: T2('Winter', 'शीत (सर्दी)') };
  const northSeason = (N) => (N >= 80 && N < 172 ? 'spring' : N >= 172 && N < 266 ? 'summer' : N >= 266 && N < 356 ? 'autumn' : 'winter');
  const SOUTH = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
  const KEYDAYS = [
    { N: 80, key: 'march-equinox', n: T2('21 March: equinox', '21 मार्च: विषुव') },
    { N: 172, key: 'june-solstice', n: T2('21 June: summer solstice', '21 जून: ग्रीष्म संक्रांति') },
    { N: 266, key: 'september-equinox', n: T2('23 September: equinox', '23 सितंबर: विषुव') },
    { N: 356, key: 'december-solstice', n: T2('22 December: winter solstice', '22 दिसंबर: शीत संक्रांति') },
  ];
  // India's seasons as the India Meteorological Department names them.
  const imdSeason = (m) => (m <= 1 ? T2('Winter', 'शीत ऋतु') : m <= 4 ? T2('Summer (hot season)', 'ग्रीष्म ऋतु') : m <= 8 ? T2('Monsoon', 'वर्षा ऋतु (मानसून)') : T2('After the monsoon', 'मानसून के बाद की ऋतु'));

  // ---------------------------------------------------------------- planets (a in AU, diameter km, period days, J2000 mean longitude °)
  const PT = { rocky: T2('Rocky planet', 'चट्टानी ग्रह'), gas: T2('Gas giant', 'गैस दानव'), ice: T2('Ice giant', 'हिम दानव') };
  const PLANETS = [
    { id: 'mercury', n: T2('Mercury', 'बुध'), a: 0.387, d: 4879, P: 87.97, L0: 252.25, rr: 64, sz: 5, col: '#B4ADA5', type: 'rocky', moons: T2('0', '0'), temp: 167,
      day: T2('59 Earth days', 'पृथ्वी के 59 दिन'), fact: T2('The closest planet to the Sun and the smallest. It has almost no air, so it is very hot by day and very cold at night.', 'सूरज के सबसे पास और सबसे छोटा ग्रह। इस पर लगभग हवा नहीं है, इसलिए दिन में बहुत गर्म और रात में बहुत ठंडा रहता है।') },
    { id: 'venus', n: T2('Venus', 'शुक्र'), a: 0.723, d: 12104, P: 224.7, L0: 181.98, rr: 86, sz: 8, col: '#E8C27E', type: 'rocky', moons: T2('0', '0'), temp: 464,
      day: T2('243 Earth days (it spins backwards)', 'पृथ्वी के 243 दिन (उल्टी दिशा में घूमता है)'), fact: T2('The hottest planet: thick clouds of carbon dioxide trap the heat. It is the brightest planet in our sky, the "morning star" or "evening star".', 'सबसे गर्म ग्रह: कार्बन डाइऑक्साइड के घने बादल ऊष्मा को रोक लेते हैं। यह हमारे आकाश का सबसे चमकीला ग्रह है, "भोर का तारा" या "साँझ का तारा"।') },
    { id: 'earth', n: T2('Earth', 'पृथ्वी'), a: 1, d: 12756, P: 365.256, L0: 100.46, rr: 110, sz: 8.5, col: '#2F7FD8', type: 'rocky', moons: T2('1', '1'), temp: 15,
      day: T2('24 hours', '24 घंटे'), fact: T2('The only planet known to have life. It has liquid water and air with oxygen.', 'अकेला ग्रह जिस पर जीवन ज्ञात है। इस पर तरल पानी और ऑक्सीजन वाली हवा है।') },
    { id: 'mars', n: T2('Mars', 'मंगल'), a: 1.524, d: 6792, P: 686.98, L0: 355.45, rr: 132, sz: 6.5, col: '#D2553A', type: 'rocky', moons: T2('2', '2'), temp: -65,
      day: T2('24 hours 37 minutes', '24 घंटे 37 मिनट'), fact: T2('The red planet: its soil has iron oxide, like rust. India\'s Mangalyaan reached Mars in 2014.', 'लाल ग्रह: इसकी मिट्टी में आयरन ऑक्साइड (जंग जैसा) है। भारत का मंगलयान 2014 में मंगल पर पहुँचा।') },
    { id: 'jupiter', n: T2('Jupiter', 'बृहस्पति'), a: 5.203, d: 142984, P: 4332.6, L0: 34.4, rr: 200, sz: 19, col: '#D9A86C', type: 'gas', moons: T2('more than 90', '90 से अधिक'), temp: -110,
      day: T2('about 10 hours', 'लगभग 10 घंटे'), fact: T2('The biggest planet: more than 1,300 Earths could fit inside it. Its Great Red Spot is a storm bigger than the Earth.', 'सबसे बड़ा ग्रह: इसमें 1,300 से अधिक पृथ्वियाँ समा सकती हैं। इसका "बड़ा लाल धब्बा" पृथ्वी से भी बड़ा तूफ़ान है।') },
    { id: 'saturn', n: T2('Saturn', 'शनि'), a: 9.537, d: 120536, P: 10759, L0: 49.94, rr: 254, sz: 16, col: '#E6CF8E', type: 'gas', moons: T2('more than 140', '140 से अधिक'), temp: -140,
      day: T2('about 10.7 hours', 'लगभग 10.7 घंटे'), fact: T2('Famous for its bright rings of ice and rock. It is so light for its size that it would float in a giant tub of water.', 'बर्फ़ और चट्टान के चमकीले छल्लों के लिए प्रसिद्ध। अपने आकार के हिसाब से यह इतना हल्का है कि पानी के विशाल टब में तैर जाए।') },
    { id: 'uranus', n: T2('Uranus', 'अरुण (यूरेनस)'), a: 19.19, d: 51118, P: 30688, L0: 313.23, rr: 310, sz: 11, col: '#8FD8E0', type: 'ice', moons: T2('more than 25', '25 से अधिक'), temp: -195,
      day: T2('about 17 hours (it spins backwards)', 'लगभग 17 घंटे (उल्टी दिशा में)'), fact: T2('It is tipped over and spins on its side. Methane gas gives it a blue-green colour.', 'यह एक ओर लुढ़का हुआ है और करवट के बल घूमता है। मीथेन गैस इसे नीला-हरा रंग देती है।') },
    { id: 'neptune', n: T2('Neptune', 'वरुण (नेप्च्यून)'), a: 30.07, d: 49528, P: 60182, L0: 304.88, rr: 366, sz: 11, col: '#4A6FE0', type: 'ice', moons: T2('more than 14', '14 से अधिक'), temp: -200,
      day: T2('about 16 hours', 'लगभग 16 घंटे'), fact: T2('The farthest planet, with the fastest winds. It was found by mathematics before anyone saw it.', 'सबसे दूर का ग्रह, जहाँ सबसे तेज़ हवाएँ चलती हैं। इसे देखे जाने से पहले गणित से खोजा गया था।') },
  ];
  const PLANET = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

  // ---------------------------------------------------------------- real stars: [RA hours, Dec °, magnitude, colour?]
  const ST = {
    dubhe: [11.062, 61.75, 1.8, '#FFE2B8'], merak: [11.031, 56.38, 2.4], phecda: [11.897, 53.69, 2.4], megrez: [12.257, 57.03, 3.3], alioth: [12.9, 55.96, 1.8], mizar: [13.399, 54.93, 2.2], alkaid: [13.792, 49.31, 1.9], alcor: [13.42, 54.99, 4.0],
    polaris: [2.53, 89.26, 2.0, '#FFF4D6'], kochab: [14.845, 74.16, 2.1, '#FFD6A8'], pherkad: [15.345, 71.83, 3.0], yildun: [17.537, 86.59, 4.4], epsumi: [16.766, 82.04, 4.2], zetumi: [15.734, 77.79, 4.3], etaumi: [16.292, 75.76, 5.0],
    caph: [0.153, 59.15, 2.3], schedar: [0.675, 56.54, 2.2, '#FFD9B0'], gamcas: [0.945, 60.72, 2.4], ruchbah: [1.43, 60.24, 2.7], segin: [1.907, 63.67, 3.4],
    betelgeuse: [5.919, 7.41, 0.5, '#FFA36C'], rigel: [5.242, -8.2, 0.1, '#C9DCFF'], bellatrix: [5.419, 6.35, 1.6, '#D6E4FF'], saiph: [5.796, -9.67, 2.1], alnitak: [5.679, -1.94, 1.8], alnilam: [5.604, -1.2, 1.7], mintaka: [5.533, -0.3, 2.2], meissa: [5.585, 9.93, 3.4],
    sirius: [6.752, -16.72, -1.46, '#E6EFFF'],
    antares: [16.49, -26.43, 1.0, '#FF8A5C'], graffias: [16.091, -19.81, 2.6], dschubba: [16.006, -22.62, 2.3], pisco: [15.981, -26.11, 2.9], sigsco: [16.353, -25.59, 2.9], tausco: [16.598, -28.22, 2.8], epssco: [16.836, -34.29, 2.3],
    musco: [16.864, -38.05, 3.0], zetsco: [16.91, -42.36, 3.6], etasco: [17.203, -43.24, 3.3], thesco: [17.622, -43.0, 1.9], iotsco: [17.793, -40.13, 3.0], kapsco: [17.708, -39.03, 2.4], shaula: [17.56, -37.1, 1.6], upssco: [17.513, -37.3, 2.7],
    alcyone: [3.791, 24.11, 2.9, '#D9E6FF'], atlas: [3.82, 24.05, 3.6], electra: [3.748, 24.11, 3.7], maia: [3.763, 24.37, 3.9], merope: [3.772, 23.95, 4.2], taygeta: [3.753, 24.47, 4.3], pleione: [3.819, 24.14, 5.0],
    vega: [18.616, 38.78, 0.03, '#DDE8FF'], capella: [5.278, 46.0, 0.08, '#FFF0C8'], arcturus: [14.261, 19.18, -0.05, '#FFCF94'], aldebaran: [4.599, 16.51, 0.85, '#FFB37A'], procyon: [7.655, 5.22, 0.34],
    regulus: [10.14, 11.97, 1.35], spica: [13.42, -11.16, 0.97, '#D6E4FF'], deneb: [20.69, 45.28, 1.25], altair: [19.846, 8.87, 0.77], castor: [7.577, 31.89, 1.6], pollux: [7.755, 28.03, 1.14, '#FFDDB0'], canopus: [6.399, -52.7, -0.74],
  };
  const STAR_NAMES = {
    dubhe: T2('Kratu', 'क्रतु'), merak: T2('Pulaha', 'पुलह'), phecda: T2('Pulastya', 'पुलस्त्य'), megrez: T2('Atri', 'अत्रि'), alioth: T2('Angiras', 'अंगिरा'), mizar: T2('Vasishtha', 'वसिष्ठ'), alkaid: T2('Marichi', 'मरीचि'), alcor: T2('Arundhati', 'अरुंधती'),
    polaris: T2('Pole Star', 'ध्रुव तारा'), betelgeuse: T2('Betelgeuse (Ardra)', 'आर्द्रा'), rigel: T2('Rigel', 'राइजेल'), sirius: T2('Sirius', 'लुब्धक'), antares: T2('Antares (Jyeshtha)', 'ज्येष्ठा'), alcyone: T2('Krittika', 'कृत्तिका'),
    vega: T2('Vega (Abhijit)', 'अभिजित'), arcturus: T2('Arcturus (Swati)', 'स्वाति'), spica: T2('Spica (Chitra)', 'चित्रा'), aldebaran: T2('Aldebaran (Rohini)', 'रोहिणी'), regulus: T2('Regulus (Magha)', 'मघा'), canopus: T2('Canopus (Agastya)', 'अगस्त्य'),
  };
  const CONS = {
    'great-bear': { n: T2('Saptarishi (Great Bear)', 'सप्तर्षि'), stars: ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid', 'alcor'],
      lines: [['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'dubhe'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid']],
      find: T2('Seven bright stars in the north shaped like a big ladle. The two stars at the end of the bowl point to the Pole Star.', 'उत्तर में सात चमकीले तारे, एक बड़ी कलछी जैसे। कटोरे के सिरे के दो तारे ध्रुव तारे की ओर इशारा करते हैं।'),
      fact: T2('In India the seven stars are named after seven sages. Look closely at Vasishtha: a faint star, Arundhati, sits beside it.', 'भारत में ये सात तारे सात ऋषियों के नाम पर हैं। वसिष्ठ को ध्यान से देखो: उसके पास एक धुँधला तारा, अरुंधती, है।') },
    'little-bear': { n: T2('Little Bear', 'लघु सप्तर्षि'), stars: ['polaris', 'yildun', 'epsumi', 'zetumi', 'kochab', 'pherkad', 'etaumi'],
      lines: [['polaris', 'yildun'], ['yildun', 'epsumi'], ['epsumi', 'zetumi'], ['zetumi', 'kochab'], ['kochab', 'pherkad'], ['pherkad', 'etaumi'], ['etaumi', 'zetumi']],
      find: T2('A smaller, fainter ladle. The Pole Star is the bright star at the end of its handle.', 'एक छोटी, धुँधली कलछी। ध्रुव तारा इसके हत्थे के सिरे का चमकीला तारा है।'),
      fact: T2('Most of its stars are faint: you need a dark sky away from city lights.', 'इसके ज़्यादातर तारे धुँधले हैं: शहर की रोशनी से दूर अँधेरे आकाश में दिखते हैं।') },
    cassiopeia: { n: T2('Cassiopeia (Sharmishtha)', 'शर्मिष्ठा (कैसियोपिया)'), stars: ['caph', 'schedar', 'gamcas', 'ruchbah', 'segin'],
      lines: [['caph', 'schedar'], ['schedar', 'gamcas'], ['gamcas', 'ruchbah'], ['ruchbah', 'segin']],
      find: T2('Five stars in the shape of a W or an M, on the other side of the Pole Star from the Saptarishi.', 'W या M के आकार के पाँच तारे, ध्रुव तारे के दूसरी ओर, सप्तर्षि के सामने।'),
      fact: T2('It turns round the Pole Star all night, so it looks like a W at one time and an M at another.', 'यह रात भर ध्रुव तारे के चारों ओर घूमता है, इसलिए कभी W और कभी M जैसा दिखता है।') },
    orion: { n: T2('Orion (Mriga)', 'मृग (ओरायन)'), stars: ['betelgeuse', 'rigel', 'bellatrix', 'saiph', 'alnitak', 'alnilam', 'mintaka', 'meissa'],
      lines: [['meissa', 'betelgeuse'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ['alnitak', 'alnilam'], ['alnilam', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel']],
      find: T2('A hunter with three stars in a row for a belt. Easy to see on winter evenings (December to February).', 'एक शिकारी, जिसकी पेटी में तीन तारे एक पंक्ति में हैं। सर्दियों की शामों (दिसंबर से फ़रवरी) में आसानी से दिखता है।'),
      fact: T2('Betelgeuse (Ardra), at the shoulder, is a red giant star; Rigel, at the foot, is blue-white. Follow the belt down to reach Sirius.', 'कंधे पर आर्द्रा (बेटेलज्यूज़) एक लाल दानव तारा है; पैर पर राइजेल नीला-सफ़ेद है। पेटी की सीध में नीचे जाओ तो लुब्धक मिलता है।') },
    scorpius: { n: T2('Scorpius (Vrishchik)', 'वृश्चिक'), stars: ['graffias', 'dschubba', 'pisco', 'sigsco', 'antares', 'tausco', 'epssco', 'musco', 'zetsco', 'etasco', 'thesco', 'iotsco', 'kapsco', 'shaula', 'upssco'],
      lines: [['graffias', 'dschubba'], ['dschubba', 'pisco'], ['dschubba', 'sigsco'], ['sigsco', 'antares'], ['antares', 'tausco'], ['tausco', 'epssco'], ['epssco', 'musco'], ['musco', 'zetsco'], ['zetsco', 'etasco'], ['etasco', 'thesco'], ['thesco', 'iotsco'], ['iotsco', 'kapsco'], ['kapsco', 'shaula'], ['shaula', 'upssco']],
      find: T2('A scorpion with a long curved tail, low in the south on summer evenings (May to July).', 'लंबी मुड़ी पूँछ वाला बिच्छू, गर्मी की शामों (मई से जुलाई) में दक्षिण में नीचे।'),
      fact: T2('Its red heart is the star Antares (Jyeshtha), a giant hundreds of times wider than the Sun.', 'इसका लाल दिल ज्येष्ठा (एंटारेस) तारा है, जो सूरज से सैकड़ों गुना चौड़ा दानव है।') },
    pleiades: { n: T2('Krittika (Pleiades)', 'कृत्तिका'), stars: ['alcyone', 'atlas', 'electra', 'maia', 'merope', 'taygeta', 'pleione'], lines: [],
      find: T2('A tiny, misty group of stars, like a little dipper. Seen on evenings from November to March.', 'तारों का एक छोटा, धुँधला झुंड, एक नन्ही कलछी जैसा। नवंबर से मार्च की शामों में दिखता है।'),
      fact: T2('It is a cluster: hundreds of young stars born together. Most people see six or seven of them.', 'यह एक तारा-गुच्छ है: साथ जन्मे सैकड़ों नए तारे। ज़्यादातर लोग इनमें से छह-सात देख पाते हैं।') },
    'pole-star': { n: T2('Pole Star (Dhruv tara)', 'ध्रुव तारा'), stars: ['polaris'], lines: [],
      find: T2('Follow the two pointer stars of the Saptarishi. It is not the brightest star, but it is the one that stays still.', 'सप्तर्षि के दो सूचक तारों की सीध में देखो। यह सबसे चमकीला नहीं, पर यह अपनी जगह टिका रहता है।'),
      fact: T2('It sits almost exactly above the Earth\'s North Pole, so the whole sky seems to turn round it. Its height above the horizon equals your latitude.', 'यह लगभग ठीक पृथ्वी के उत्तरी ध्रुव के ऊपर है, इसलिए पूरा आकाश इसके चारों ओर घूमता दिखता है। क्षितिज से इसकी ऊँचाई तुम्हारे अक्षांश के बराबर होती है।') },
    sirius: { n: T2('Sirius (Lubdhak)', 'लुब्धक (साइरस)'), stars: ['sirius'], lines: [],
      find: T2('The brightest star of the night sky. Follow Orion\'s belt down and to the left.', 'रात के आकाश का सबसे चमकीला तारा। मृग की पेटी की सीध में नीचे बाईं ओर देखो।'),
      fact: T2('It looks bright because it is big and close: light from it takes about 8.6 years to reach us.', 'यह बड़ा और पास होने से चमकीला दिखता है: इसका प्रकाश हम तक पहुँचने में लगभग 8.6 वर्ष लेता है।') },
  };
  const CONS_IDS = Object.keys(CONS);
  const NAMED = [...new Set(CONS_IDS.flatMap((k) => CONS[k].stars))];

  // ---------------------------------------------------------------- Kepler orbits (a AU, e) and Earth satellites (h km)
  const ORB = {
    mercury: { a: 0.387, e: 0.2056, n: PLANET.mercury.n, col: '#B4ADA5' }, venus: { a: 0.723, e: 0.0068, n: PLANET.venus.n, col: '#E8C27E' },
    earth: { a: 1, e: 0.0167, n: PLANET.earth.n, col: '#2F7FD8' }, mars: { a: 1.524, e: 0.0934, n: PLANET.mars.n, col: '#D2553A' },
    jupiter: { a: 5.203, e: 0.0489, n: PLANET.jupiter.n, col: '#D9A86C' }, halley: { a: 17.83, e: 0.967, n: T2('Halley\'s comet', 'हैली धूमकेतु'), col: '#BFE9FF' },
  };
  const ORB_IDS = Object.keys(ORB);
  const SATS = {
    iss: { h: 420, n: T2('Space station (ISS)', 'अंतरिक्ष स्टेशन (ISS)'), note: T2('Astronauts live and work on it.', 'इस पर अंतरिक्ष यात्री रहते और काम करते हैं।') },
    gps: { h: 20200, n: T2('Navigation satellite (GPS)', 'नेविगेशन उपग्रह (GPS)'), note: T2('Phones use signals from several of these to find where they are.', 'फ़ोन अपनी जगह जानने के लिए ऐसे कई उपग्रहों के संकेत लेते हैं।') },
    geo: { h: 35786, n: T2('Weather and TV satellite (INSAT, GSAT)', 'मौसम और टीवी उपग्रह (INSAT, GSAT)'), note: T2('It goes round once in 23 h 56 min, the time the Earth takes to spin once, so it stays above the same place.', 'यह 23 घंटे 56 मिनट में एक चक्कर लगाता है, उतने ही समय में पृथ्वी एक बार घूमती है, इसलिए यह एक ही जगह के ऊपर टिका रहता है।') },
  };
  const SAT_IDS = Object.keys(SATS);
  const satV = (h) => Math.sqrt(GM / (RE + h));                        // km/s
  const satT = (h) => (TAU * Math.sqrt(Math.pow(RE + h, 3) / GM)) / 60; // minutes
  const H_MIN = 160, H_MAX = 40000;
  function kepler(M, e) { let E = e < 0.8 ? M : Math.PI; for (let i = 0; i < 30; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-10) break; } return E; }

  // ---------------------------------------------------------------- drawing helpers (pure strings)
  // The lit part of a disk: e = 0 dark (new), π/2 half, π full; the lit edge faces +x (rotate the result to aim it).
  function litPath(cx, cy, r, e) {
    e = mod(e, TAU);
    const c = Math.cos(e), rx = f(Math.abs(c) * r), top = `${f(cx)} ${f(cy - r)}`, bot = `${f(cx)} ${f(cy + r)}`;
    if (e <= Math.PI) return `M${top}A${r} ${r} 0 0 1 ${bot}A${rx} ${r} 0 0 ${c > 0 ? 0 : 1} ${top}Z`;
    return `M${top}A${r} ${r} 0 0 0 ${bot}A${rx} ${r} 0 0 ${c > 0 ? 1 : 0} ${top}Z`;
  }
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function starField(w, h, n, seed) {
    const r = rng(seed);
    let o = '';
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, big = r() < 0.12, op = 0.3 + r() * 0.6, tw = r() < 0.3;
      o += `<circle cx="${f(x)}" cy="${f(y)}" r="${big ? 1.6 : f(0.5 + r() * 0.7)}" fill="#fff" opacity="${f(op)}"${tw ? ` class="sk-tw" style="animation-delay:${f(r() * 3)}s"` : ''}/>`;
    }
    return o;
  }

  const CSS = `.sk { container-type: inline-size; font-family: var(--font-body); color: var(--ink); }
.sk-wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@container (min-width: 760px) { .sk-wrap { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; } }
.sk-left { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sk-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.sk-badge { font: 800 1.05rem/1.2 var(--font-display); color: #fff; background: linear-gradient(90deg, #6D28D9, #4400F0); border-radius: 999px; padding: 6px 14px; box-shadow: 0 4px 14px rgba(68,0,240,.25); }
.sk-hint { color: var(--ink-2); font-weight: 600; font-size: .95rem; }
.sk-stage { position: relative; border-radius: 18px; overflow: hidden; background: #050816; box-shadow: 0 10px 30px rgba(6,18,51,.28), inset 0 0 0 1px rgba(159,182,255,.14); }
.sk-svg { display: block; width: 100%; height: auto; touch-action: none; user-select: none; -webkit-user-select: none; }
.sk-3d { width: 100%; aspect-ratio: 800 / 460; display: grid; place-items: center; color: #9FB6FF; font-weight: 700; }
.sk-3d canvas { display: block; width: 100% !important; height: 100% !important; cursor: grab; touch-action: none; }
.sk-3dnote { position: absolute; left: 10px; bottom: 8px; color: #C9D5F5; font-size: .8rem; background: rgba(5,8,22,.6); padding: 2px 8px; border-radius: 8px; pointer-events: none; }
.sk-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.sk-ctl, .sk-side { background: linear-gradient(180deg, #111A44, #0B1230); color: #E8EDF8; border-radius: 16px; padding: 12px 14px; box-shadow: 0 6px 20px rgba(6,18,51,.22); }
.sk-ctl { display: flex; flex-direction: column; gap: 10px; }
.sk-sl label { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: .95rem; }
.sk-sl output { font: 800 1rem var(--font-display); color: #FFD23F; white-space: nowrap; }
.sk-sl input[type=range] { width: 100%; min-height: 44px; accent-color: #FFD23F; cursor: pointer; margin: 0; }
.sk-row { display: flex; flex-wrap: wrap; gap: 8px; }
.sk-btn { min-height: 44px; border-radius: 12px; border: 1.5px solid rgba(159,182,255,.35); background: rgba(255,255,255,.07); color: #E8EDF8; font: 700 .92rem var(--font-body); padding: 0 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: transform .12s, background .2s, border-color .2s; }
.sk-btn:hover { background: rgba(255,255,255,.14); }
.sk-btn:active { transform: translateY(1px); }
.sk-btn[aria-pressed="true"] { background: linear-gradient(180deg, #A266FF, #8B3DFF); border-color: #C4A1FF; color: #fff; }
.sk-btn .sw { width: 12px; height: 12px; border-radius: 50%; flex: none; box-shadow: inset 0 -2px 3px rgba(0,0,0,.35); }
.sk-play { background: linear-gradient(180deg, #FFE070, #FFB21F); color: #1E293B; border-color: #FFD23F; font-size: 1rem; padding: 0 18px; }
.sk-play[aria-pressed="true"] { background: linear-gradient(180deg, #FFE070, #FF9A1F); border-color: #FFD23F; color: #1E293B; }
.sk-play:hover { background: linear-gradient(180deg, #FFE68A, #FFC23F); }
.sk-play svg { width: 16px; height: 16px; }
.sk-side { display: flex; flex-direction: column; gap: 10px; }
.sk-ssvg { display: block; width: 100%; max-width: 320px; margin: 0 auto; height: auto; border-radius: 12px; }
.sk-big { margin: 0; font: 800 1.25rem/1.25 var(--font-display); color: #FFD23F; }
.sk-facts { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 6px 12px; margin: 0; font-size: .92rem; }
.sk-facts dt { color: #9FB6FF; font-weight: 600; }
.sk-facts dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.sk-note { margin: 0; color: #C9D5F5; font-size: .9rem; line-height: 1.45; }
.sk-h { fill: transparent; stroke: transparent; cursor: pointer; outline: none; }
.sk-h.drag { cursor: grab; }
.sk-h:hover { stroke: rgba(255,210,63,.55); stroke-width: 2; }
.sk-h:focus-visible { stroke: #FFD23F; stroke-width: 3; stroke-dasharray: 6 4; }
.sk :focus-visible { outline: 3px solid #FFD23F; outline-offset: 2px; }
.sk-svg text, .sk-ssvg text { font-family: var(--font-body); font-weight: 700; paint-order: stroke; stroke: rgba(5,8,22,.75); stroke-width: 3px; stroke-linejoin: round; }
.sk-svg text.sk-dk, .sk-ssvg text.sk-dk { stroke: none; }
.sk-tw { animation: sk-tw 2.6s ease-in-out infinite alternate; }
@keyframes sk-tw { from { opacity: .25; } to { opacity: 1; } }
.sk-pulse { animation: sk-pulse 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes sk-pulse { 0%, 100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.25); opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .sk-tw, .sk-pulse { animation: none; } .sk-btn { transition: none; } }`;

  // ---------------------------------------------------------------- optional 3D view (three.js r128); the 2D view never depends on it
  function make3D(box, kind, get) {
    return L.loadScript(THREE_URL).then(() => {
      const T = window.THREE;
      if (!T) throw new Error('three.js missing');
      const helio = kind === 'seasons';
      const w0 = box.clientWidth || 640, h0 = Math.round((w0 * 460) / 800);
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w0, h0);
      box.innerHTML = '';
      box.appendChild(renderer.domElement);
      const scene = new T.Scene();
      scene.background = new T.Color('#050816');
      const cam = new T.PerspectiveCamera(42, w0 / h0, 0.1, 400);
      const r = rng(11), pts = new Float32Array(1200 * 3);
      for (let i = 0; i < 1200; i++) { const u = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - u * u); pts.set([120 * s * Math.cos(a), 120 * u, 120 * s * Math.sin(a)], i * 3); }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pts, 3));
      scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.35 })));
      const tex = (fn, s) => { const c = document.createElement('canvas'); c.width = s * 2; c.height = s; fn(c.getContext('2d'), s * 2, s); return new T.CanvasTexture(c); };
      const earthTex = tex((g, W, H) => {
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2B6FD0'); gr.addColorStop(0.5, '#1F5FBF'); gr.addColorStop(1, '#2B6FD0');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = '#F2F6FA'; g.fillRect(0, 0, W, H * 0.06); g.fillRect(0, H * 0.94, W, H * 0.06);
        g.globalAlpha = 0.45; const q = rng(5);
        for (let i = 0; i < 46; i++) { g.beginPath(); g.ellipse(q() * W, H * 0.12 + q() * H * 0.76, 16 + q() * 34, 3 + q() * 6, 0, 0, TAU); g.fill(); }
      }, 256);
      const moonTex = tex((g, W, H) => { g.fillStyle = '#BDB9AF'; g.fillRect(0, 0, W, H); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(80,76,70,${0.15 + (i % 5) / 20})`; g.beginPath(); g.arc((i * 97) % W, (i * 61) % H, 3 + (i % 9), 0, TAU); g.fill(); } }, 128);
      const ER = helio ? 0.9 : 1.2;
      const earthG = new T.Group(), tiltG = new T.Group();
      const earth = new T.Mesh(new T.SphereGeometry(ER, 48, 48), new T.MeshPhongMaterial({ map: earthTex, shininess: 14 }));
      tiltG.add(earth); earthG.add(tiltG); scene.add(earthG);
      const axis = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, ER * 2.8, 8), new T.MeshBasicMaterial({ color: 0xffd23f }));
      tiltG.add(axis);
      const pin = new T.Mesh(new T.SphereGeometry(0.075, 16, 16), new T.MeshBasicMaterial({ color: 0xff7a1a }));
      earth.add(pin);
      const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,120,1)'); gr.addColorStop(0.4, 'rgba(255,170,40,.45)'); gr.addColorStop(1, 'rgba(255,140,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
      const sunPos = helio ? new T.Vector3(0, 0, 0) : new T.Vector3(-11, 0, 0);
      const sun = new T.Mesh(new T.SphereGeometry(helio ? 1.7 : 1.3, 32, 32), new T.MeshBasicMaterial({ color: 0xffd23f }));
      sun.position.copy(sunPos); scene.add(sun);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
      glow.scale.set(helio ? 9 : 7.5, helio ? 9 : 7.5, 1); glow.position.copy(sunPos); scene.add(glow);
      if (helio) scene.add(new T.PointLight(0xffffff, 1.7, 0)); else { const dl = new T.DirectionalLight(0xffffff, 1.4); dl.position.copy(sunPos); scene.add(dl); }
      scene.add(new T.AmbientLight(0x223355, 0.4));
      const ringR = helio ? 7 : 4.2;
      let moon = null;
      if (helio || kind === 'moon-phases') {
        const ring = new T.Mesh(new T.RingGeometry(ringR - 0.03, ringR + 0.03, 160), new T.MeshBasicMaterial({ color: 0x8ea9ff, transparent: true, opacity: 0.4, side: T.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; scene.add(ring);
      }
      if (kind === 'moon-phases') { moon = new T.Mesh(new T.SphereGeometry(0.36, 36, 36), new T.MeshPhongMaterial({ map: moonTex, shininess: 2 })); scene.add(moon); }
      let yaw = 0, pitch = helio ? 0.5 : 0.62;
      const dist = helio ? 17 : 11.5;
      const place = () => { cam.position.set(dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)); cam.lookAt(0, 0, 0); };
      function update() {
        const s = get();
        const lat = s.lat * RAD;
        pin.position.set(ER * Math.cos(lat), ER * Math.sin(lat), 0);
        if (kind === 'moon-phases') {
          const th = Math.PI + (TAU * s.day) / MONTH;
          moon.position.set(4.2 * Math.cos(th), 0, -4.2 * Math.sin(th));
          pin.visible = false;
          earth.rotation.y = s.spin;
        } else if (kind === 'day-night') {
          earth.rotation.y = Math.PI + (TAU * (s.tau - 12)) / 24;
          tiltG.rotation.z = 0;
        } else {
          const th = Math.PI + (TAU * (s.N - 172)) / 365.24;
          earthG.position.set(7 * Math.cos(th), 0, -7 * Math.sin(th));
          tiltG.rotation.z = s.tilt ? -TILT * RAD : 0;
          earth.rotation.y = s.spin;
        }
        place();
        renderer.render(scene, cam);
      }
      let drag = null;
      const cv = renderer.domElement;
      const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; cv.setPointerCapture(e.pointerId); };
      const move = (e) => { if (!drag) return; yaw = drag.yaw - (e.clientX - drag.x) * 0.01; pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.01, 0.05, 1.45); update(); };
      const up = () => { drag = null; };
      cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const w = box.clientWidth; if (!w) return; const h = Math.round((w * 460) / 800); renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); update(); }) : null;
      if (ro) ro.observe(box);
      update();
      return { update, destroy() { if (ro) ro.disconnect(); renderer.dispose(); box.innerHTML = ''; } };
    });
  }

  // ---------------------------------------------------------------- the player shell (shared by every mode)
  const MODE = {};
  const TOG = {
    labels: T2('Names', 'नाम'), orbit: T2('Orbit path', 'कक्षा का रास्ता'), tilt: T2('Tilt of the axis', 'अक्ष का झुकाव'), '3d': T2('3D view', '3D दृश्य'),
    scale: T2('True sizes', 'असली आकार'), lines: T2('Star patterns', 'तारों की आकृति'), trails: T2('Star trails', 'तारों के रास्ते'), areas: T2('Equal areas', 'बराबर क्षेत्रफल'),
  };
  let uid = 0;
  function sky(root, cfg, api) {
    const P = 'sk' + (++uid) + '-';
    const place = PLACES[cfg.place || 'delhi'];
    const S = { playing: false, last: {}, spin: 0, tg: { labels: true, orbit: true, tilt: true, '3d': false, scale: false, lines: true, trails: false, areas: true } };
    let lang = api.lang(), narrow = false, alive = true, raf = 0, lastT = 0, acc = 0, dragging = null, three = null, ro = null, hsSig = '', factsHTML = '';
    const t = (x) => api.t(x);
    const X = {
      S, P, cfg, api, place, t,
      F: () => (narrow ? (M.vbN ? 1.45 : 1.85) : 1),
      B: () => (narrow ? (M.vbN ? 1.2 : 1.4) : 1),
      narrow: () => narrow,
      txt(x, y, s, o) {
        o = o || {};
        return `<text x="${f(x)}" y="${f(y)}" font-size="${f((o.size || 14) * (o.fixed ? 1 : X.F()))}" fill="${o.fill || '#DCE5FF'}" text-anchor="${o.anchor || 'middle'}"${/^#(0B1838|1E293B|7A3B00)/i.test(o.fill || '') ? ' class="sk-dk"' : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.op ? ` opacity="${o.op}"` : ''}>${esc(typeof s === 'string' ? s : t(s))}</text>`;
      },
      sun: (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.7)}" fill="url(#${P}glow)"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${P}sun)"/>`,
      ball(x, y, r, fill, e, rot, dark) {
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${dark || '#101A3A'}"/><g transform="rotate(${f(rot)} ${f(x)} ${f(y)})"><path d="${litPath(x, y, r, e)}" fill="${fill}"/></g>`;
      },
      track(kind, val, ev, rec) {
        if (S.last[kind] === val) return;
        const first = !(kind in S.last);
        S.last[kind] = val;
        if (first) return;
        if (ev) api.emit(ev);
        if (rec) api.record(t(rec));
      },
    };
    const M = MODE[cfg.mode](X);
    if (M.autoplay && !reduced()) S.playing = true;

    const DEFS = `<radialGradient id="${P}sun" cx=".45" cy=".42" r=".6"><stop offset="0" stop-color="#FFF8CC"/><stop offset=".5" stop-color="#FFD23F"/><stop offset="1" stop-color="#FF8F1F"/></radialGradient>
      <radialGradient id="${P}glow"><stop offset="0" stop-color="#FFD978" stop-opacity=".8"/><stop offset=".45" stop-color="#FFB13B" stop-opacity=".28"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/></radialGradient>
      <radialGradient id="${P}ocean" cx=".62" cy=".4" r=".75"><stop offset="0" stop-color="#7CC4FF"/><stop offset=".55" stop-color="#2A74D6"/><stop offset="1" stop-color="#16489B"/></radialGradient>
      <radialGradient id="${P}moon" cx=".55" cy=".4" r=".75"><stop offset="0" stop-color="#FBF8EE"/><stop offset="1" stop-color="#C9C2AE"/></radialGradient>
      <radialGradient id="${P}space" cx=".55" cy=".45" r=".85"><stop offset="0" stop-color="#16225A"/><stop offset=".6" stop-color="#0A1033"/><stop offset="1" stop-color="#04061A"/></radialGradient>
      <linearGradient id="${P}ray" x1="0" x2="1"><stop offset="0" stop-color="#FFD23F" stop-opacity=".7"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></linearGradient>
      <marker id="${P}arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9FB6FF"/></marker>
      <marker id="${P}arrY" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFD23F"/></marker>`;
    const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2l11 6-11 6z" fill="currentColor"/></svg>';
    const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor"/></svg>';
    let svg, dyn, hs, ssvg, big, facts, note, box3d;

    function shell() {
      const sl = (M.sliders || []).map((s, i) => `<div class="sk-sl"><label for="${P}s${i}">${esc(t(s.label))} <output id="${P}o${i}"></output></label><input type="range" id="${P}s${i}" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.get()}"></div>`).join('');
      const bt = (M.buttons ? M.buttons() : []).map((b) => `<button type="button" class="sk-btn" data-key="${esc(b.key)}" aria-pressed="${b.pressed ? 'true' : 'false'}">${b.sw ? `<span class="sw" style="background:${b.sw}"></span>` : ''}${esc(t(b.label))}</button>`).join('');
      const tg = (M.toggles || []).map((k) => `<button type="button" class="sk-btn" data-key="toggle:${k}" aria-pressed="${S.tg[k] ? 'true' : 'false'}">${esc(t(TOG[k]))}</button>`).join('');
      root.innerHTML = `<div class="sk" data-mode="${esc(cfg.mode)}"><svg class="sk-defs" aria-hidden="true" focusable="false"><defs>${DEFS}</defs></svg><div class="sk-wrap"><div class="sk-left">
        <div class="sk-head"><span class="sk-badge">${esc(t(M.title))}</span><span class="sk-hint">${esc(t(M.hint))}</span></div>
        <div class="sk-stage"><svg class="sk-svg" viewBox="0 0 800 460" role="img" aria-label="${esc(t(M.aria))}"><rect width="800" height="460" fill="url(#${P}space)"/><g class="sk-bg">${M.bg ? M.bg() : starField(800, 460, 150, 7)}</g><g class="sk-dyn"></g><g class="sk-hs"></g></svg><div class="sk-3d" hidden></div></div>
        <div class="sk-ctl">${sl}<div class="sk-row">${M.noPlay ? '' : `<button type="button" class="sk-btn sk-play" data-key="play"></button>`}${bt}</div>${tg ? `<div class="sk-row">${tg}</div>` : ''}</div>
      </div><aside class="sk-side"><svg class="sk-ssvg" viewBox="${M.svb}" aria-hidden="true"></svg><p class="sk-big" aria-live="polite"></p><dl class="sk-facts"></dl><p class="sk-note"></p></aside></div></div>`;
      svg = root.querySelector('.sk-svg'); dyn = root.querySelector('.sk-dyn'); hs = root.querySelector('.sk-hs');
      ssvg = root.querySelector('.sk-ssvg'); big = root.querySelector('.sk-big'); facts = root.querySelector('.sk-facts'); note = root.querySelector('.sk-note');
      box3d = root.querySelector('.sk-3d');
      hsSig = ''; factsHTML = '';
      if (three) { three.destroy(); three = null; }
      if (S.tg['3d']) open3D();
    }
    function updateHandles(list) {
      const sig = lang + '|' + list.map((h) => h.key).join('|');
      if (sig !== hsSig) {
        hsSig = sig;
        hs.innerHTML = list.map((h) => `<circle class="sk-h${h.key.startsWith('drag:') ? ' drag' : ''}" data-key="${esc(h.key)}" role="button" tabindex="0" aria-label="${esc(t(h.label))}" cx="${f(h.x)}" cy="${f(h.y)}" r="${f(h.r)}"/>`).join('');
        return;
      }
      list.forEach((h, i) => { const el = hs.children[i]; if (!el) return; el.setAttribute('cx', f(h.x)); el.setAttribute('cy', f(h.y)); el.setAttribute('r', f(h.r)); });
    }
    function render() {
      if (!alive) return;
      if (api.lang() !== lang) { lang = api.lang(); shell(); }
      const vb = narrow && M.vbN ? M.vbN : '0 0 800 460';
      if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
      dyn.innerHTML = M.scene();
      updateHandles(M.handles ? M.handles() : []);
      ssvg.innerHTML = M.side();
      const info = M.info();
      if (big.textContent !== info.big) big.textContent = info.big;
      const fh = info.facts.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(t(v))}</dd>`).join('');
      if (fh !== factsHTML) { factsHTML = fh; facts.innerHTML = fh; }
      const nt = t(info.note || '');
      if (note.textContent !== nt) note.textContent = nt;
      (M.sliders || []).forEach((s, i) => {
        const inp = root.querySelector('#' + P + 's' + i), out = root.querySelector('#' + P + 'o' + i);
        if (inp && document.activeElement !== inp) inp.value = String(s.get());
        if (inp && document.activeElement === inp && !dragging && Math.abs(+inp.value - s.get()) > +s.step * 1.5) inp.value = String(s.get());
        if (out) out.textContent = t(s.out());
        if (inp) inp.setAttribute('aria-valuetext', t(s.out()));
      });
      const pb = root.querySelector('[data-key="play"]');
      if (pb) { const lab = S.playing ? (M.pauseLabel || T2('Pause', 'रोको')) : (M.playLabel || T2('Play', 'चलाओ')); const h = (S.playing ? PAUSE : PLAY) + esc(t(lab)); if (pb.innerHTML !== h) pb.innerHTML = h; pb.setAttribute('aria-pressed', S.playing ? 'true' : 'false'); }
      (M.buttons ? M.buttons() : []).forEach((b) => { const el = root.querySelector(`.sk-ctl [data-key="${b.key}"]`); if (el) el.setAttribute('aria-pressed', b.pressed ? 'true' : 'false'); });
      (M.toggles || []).forEach((k) => { const el = root.querySelector(`[data-key="toggle:${k}"]`); if (el) el.setAttribute('aria-pressed', S.tg[k] ? 'true' : 'false'); });
      if (M.track) M.track();
      if (three) three.update();
    }
    function open3D() {
      svg.style.display = 'none';
      box3d.hidden = false;
      box3d.textContent = t(T2('Opening space in 3D…', 'अंतरिक्ष 3D में खुल रहा है…'));
      make3D(box3d, cfg.mode, () => Object.assign({ lat: place.lat }, S, { tilt: S.tg.tilt })).then((th) => {
        if (!alive || !S.tg['3d']) { th.destroy(); return; }
        three = th;
        const n = document.createElement('div'); n.className = 'sk-3dnote'; n.textContent = t(T2('Drag to turn the view', 'दृश्य घुमाने के लिए खींचो'));
        box3d.parentNode.appendChild(n);
        render();
      }).catch(() => {
        if (!alive) return;
        S.tg['3d'] = false; close3D();
        api.toast(T2('The 3D view could not open here, so you see the flat view.', '3D दृश्य यहाँ नहीं खुल पाया, इसलिए सपाट दृश्य दिख रहा है।'));
        render();
      });
    }
    function close3D() {
      if (three) { three.destroy(); three = null; }
      box3d.hidden = true; box3d.innerHTML = ''; svg.style.display = '';
      const n = root.querySelector('.sk-3dnote'); if (n) n.remove();
    }

    function loop(now) {
      raf = 0;
      if (!alive || !S.playing) { lastT = 0; return; }
      let dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
      lastT = now;
      if (reduced()) { acc += dt; if (acc < 0.8) { raf = requestAnimationFrame(loop); return; } dt = acc; acc = 0; }
      if (!dragging && dt > 0) { S.spin += dt * 0.5; M.tick(dt); render(); }
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf && S.playing) { lastT = 0; raf = requestAnimationFrame(loop); } }

    function act(key) {
      if (key === 'play') {
        S.playing = !S.playing;
        if (S.playing) { api.emit('play'); api.record(t(T2('Pressed play', 'चलाओ दबाया'))); kick(); }
      } else if (key.startsWith('toggle:')) {
        const k = key.slice(7);
        S.tg[k] = !S.tg[k];
        api.emit('toggled:' + k);
        api.record(t(TOG[k]) + ': ' + t(S.tg[k] ? T2('on', 'चालू') : T2('off', 'बंद')));
        if (k === '3d') { if (S.tg[k]) open3D(); else close3D(); }
        if (M.toggled) M.toggled(k);
      } else if (M.act) M.act(key);
      render();
    }
    function svgPoint(e) {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.tagName === 'INPUT') return;
      const key = el.dataset.key;
      if (key.startsWith('drag:')) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      act(key);
    }
    function onKey(e) {
      const el = e.target.closest && e.target.closest('.sk-h');
      if (!el) return;
      const key = el.dataset.key;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
      if (d && key.startsWith('drag:') && M.step) {
        e.preventDefault();
        if (!api.allowed(key)) { api.nudge(key); return; }
        S.playing = false; M.step(key, d); render(); api.emit('moved');
      } else if ((e.key === 'Enter' || e.key === ' ') && !key.startsWith('drag:')) {
        e.preventDefault();
        if (!api.allowed(key)) { api.nudge(key); return; }
        act(key);
      }
    }
    function onDown(e) {
      const el = e.target.closest && e.target.closest('.sk-h.drag');
      if (!el) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      e.preventDefault();
      dragging = key;
      if (M.pauseOnDrag !== false) S.playing = false;
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    }
    function onMove(e) {
      if (!dragging) return;
      const p = svgPoint(e);
      if (p) { M.drag(dragging, p); render(); }
    }
    function onUp() {
      if (!dragging) return;
      const k = dragging;
      dragging = null;
      if (M.dragEnd) M.dragEnd(k);
      api.emit('moved');
      api.record(t(T2('Moved it by dragging', 'खींचकर हिलाया')));
      render(); kick();
    }
    function onInput(e) {
      const inp = e.target;
      if (!inp.matches || !inp.matches('input[type=range][data-key]')) return;
      const i = +inp.id.slice((P + 's').length), s = M.sliders[i], key = inp.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); inp.value = String(s.get()); return; }
      if (s.time) S.playing = false;
      s.set(+inp.value);
      render();
    }
    function onChange(e) {
      const inp = e.target;
      if (!inp.matches || !inp.matches('input[type=range][data-key]')) return;
      const i = +inp.id.slice((P + 's').length), s = M.sliders[i], key = inp.dataset.key;
      if (!api.allowed(key)) return;
      if (s.snap) s.snap();
      api.emit('moved');
      api.record(t(s.label) + ': ' + t(s.out()));
      render(); kick();
    }

    shell();
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    narrow = (root.clientWidth || 800) < 560;
    render();
    kick();
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { const n = (root.clientWidth || 800) < 560; if (n !== narrow) { narrow = n; hsSig = ''; render(); } });
      ro.observe(root);
    }
    return {
      destroy() {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        if (three) three.destroy();
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
        root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp);
      },
    };
  }

  // ---------------------------------------------------------------- the Moon as seen from India (side panel and icons)
  function moonFace(X, cx, cy, r, day, id) {
    const e = (TAU * mod(day, MONTH)) / MONTH;
    const cr = [[-0.3, -0.25, 0.2], [0.28, 0.3, 0.15], [0.12, -0.45, 0.11], [-0.22, 0.42, 0.13], [0.45, -0.1, 0.09], [-0.5, 0.1, 0.1]];
    return `<defs><clipPath id="${X.P}${id}"><path d="${litPath(cx, cy, r, e)}"/></clipPath></defs>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#272C3B"/>
      <path d="${litPath(cx, cy, r, e)}" fill="url(#${X.P}moon)"/>
      <g clip-path="url(#${X.P}${id})" fill="#8E8775" opacity=".35">${cr.map(([x, y, s]) => `<circle cx="${f(cx + x * r)}" cy="${f(cy + y * r)}" r="${f(s * r)}"/>`).join('')}</g>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>`;
  }

  MODE['moon-phases'] = (X) => {
    const { S, t } = X;
    S.day = X.cfg.startDay != null ? X.cfg.startDay : 4;
    const C = { x: 480, y: 232 }, R = 160;
    const ang = (d) => Math.PI + (TAU * d) / MONTH;
    const pos = (d, rr) => ({ x: C.x + rr * Math.cos(ang(d)), y: C.y - rr * Math.sin(ang(d)) });
    return {
      title: T2('Phases of the Moon', 'चाँद की कलाएँ'),
      hint: T2('Drag the Moon round the Earth, or play a whole month.', 'चाँद को पृथ्वी के चारों ओर खींचो, या पूरा महीना चलाओ।'),
      aria: T2('Top view from above the North Pole: the Sun far to the left, the Earth in the middle and the Moon going round the Earth.', 'उत्तरी ध्रुव के ऊपर से दृश्य: बाईं ओर दूर सूरज, बीच में पृथ्वी और पृथ्वी के चारों ओर घूमता चाँद।'),
      svb: '0 0 240 240',
      vbN: '150 8 600 448',
      playLabel: T2('Play a whole month', 'पूरा महीना चलाओ'),
      sliders: [{ key: 'slider', min: 0, max: 29.5, step: 0.1, time: true, label: T2('Day of the Moon\'s month', 'चंद्र मास का दिन'), get: () => f(S.day), set: (v) => { S.day = v; }, out: () => nf(S.day, 1) }],
      toggles: ['labels', '3d'],
      tick(dt) { S.day = mod(S.day + dt * 2.2, MONTH); },
      scene() {
        const F = X.F();
        let o = X.sun(-40, C.y, 78);
        for (let k = 0; k < 7; k++) { const y = 52 + k * 60; o += `<line x1="70" y1="${y}" x2="${C.x - R - 30}" y2="${y}" stroke="#FFD23F" stroke-opacity=".42" stroke-width="2.5" marker-end="url(#${X.P}arrY)"/>`; }
        o += X.txt(26, 30, T2('Sunlight', 'धूप'), { anchor: 'start', fill: '#FFD23F', size: 15 });
        o += `<circle cx="${C.x}" cy="${C.y}" r="${R}" fill="none" stroke="#8EA9FF" stroke-opacity=".5" stroke-width="2" stroke-dasharray="5 7"/>`;
        const a1 = -0.95, a2 = -0.6, rr = R + 16;
        o += `<path d="M${f(C.x + rr * Math.cos(a1))} ${f(C.y - rr * Math.sin(a1))}A${rr} ${rr} 0 0 0 ${f(C.x + rr * Math.cos(a2))} ${f(C.y - rr * Math.sin(a2))}" fill="none" stroke="#9FB6FF" stroke-width="2.5" marker-end="url(#${X.P}arr)"/>`;
        if (S.tg.labels) {
          for (let k = 0; k < 8; k++) {
            const d = (k * MONTH) / 8, q = pos(d, R), g = pos(d, R + 46);
            o += X.ball(q.x, q.y, 6, '#CFC8B6', Math.PI / 2, 180, '#3A4058');
            if (!X.narrow() || k % 2 === 0) o += moonFace(X, g.x, g.y, 12, d, 'g' + k);
          }
          o += X.txt(C.x - R - 4, C.y + 74 + (F - 1) * 10, PHASES[0].n, { size: 13, anchor: 'middle', fill: '#C9D5F5' });
          o += X.txt(C.x + R + 2, C.y + 74 + (F - 1) * 10, PHASES[4].n, { size: 13, fill: '#C9D5F5' });
        }
        const m = pos(S.day, R);
        o += `<line x1="${C.x}" y1="${C.y}" x2="${f(m.x)}" y2="${f(m.y)}" stroke="#FFD23F" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 5"/>`;
        o += X.ball(C.x, C.y, 40, `url(#${X.P}ocean)`, Math.PI / 2, 180, '#0D1B44');
        o += `<circle cx="${C.x}" cy="${C.y}" r="40" fill="none" stroke="#9CC8FF" stroke-opacity=".5" stroke-width="2"/>`;
        o += X.txt(C.x, C.y + 62, T2('Earth', 'पृथ्वी'), { size: 15 });
        o += `<circle cx="${f(m.x)}" cy="${f(m.y)}" r="25" fill="#FFD23F" opacity=".1" class="sk-pulse"/>`;
        o += X.ball(m.x, m.y, 17, `url(#${X.P}moon)`, Math.PI / 2, 180, '#2A2F40');
        o += X.txt(m.x, m.y - 28, T2('Moon', 'चाँद'), { size: 14, fill: '#FFE9A8' });
        return o;
      },
      handles() { const m = pos(S.day, R); return [{ key: 'drag:moon', x: m.x, y: m.y, r: 30, label: T2('The Moon: drag it round the Earth, or use the arrow keys', 'चाँद: इसे पृथ्वी के चारों ओर खींचो, या तीर वाली कुंजियाँ दबाओ') }]; },
      drag(k, p) { const th = Math.atan2(-(p.y - C.y), p.x - C.x); S.day = mod(((th - Math.PI) / TAU) * MONTH, MONTH); },
      step(k, d) { S.day = mod(S.day + d * 0.5, MONTH); },
      side() {
        return `<rect width="240" height="240" rx="14" fill="#070C24"/>${starField(240, 240, 40, 3)}${moonFace(X, 120, 120, 92, S.day, 'big')}`;
      },
      info() {
        const p = phaseOf(S.day), e = (TAU * mod(S.day, MONTH)) / MONTH;
        return {
          big: t(p.n),
          facts: [
            [T2('Seen from', 'कहाँ से'), T2('India (the Earth\'s northern half)', 'भारत (पृथ्वी का उत्तरी भाग)')],
            [T2('Lit part we see', 'दिखने वाला चमकता भाग'), nf(((1 - Math.cos(e)) / 2) * 100) + '%'],
            [T2('Tithi', 'तिथि'), tithiOf(S.day)],
            [T2('Rises at about', 'लगभग कब उगता है'), clock(6 + (S.day * 24) / MONTH)],
            [T2('Best seen', 'कब दिखता है'), p.see],
          ],
          note: T2('The Sun always lights half of the Moon. As the Moon goes round the Earth in about 29.5 days, we see different amounts of that lit half.', 'सूरज हमेशा चाँद का आधा भाग रोशन करता है। लगभग 29.5 दिनों में पृथ्वी का चक्कर लगाते हुए चाँद का वह रोशन आधा भाग हमें अलग-अलग मात्रा में दिखता है।'),
        };
      },
      track() { const p = phaseOf(S.day); X.track('phase', p.key, 'phase:' + p.key, p.n); },
    };
  };

  MODE['day-night'] = (X) => {
    const { S, t, place } = X;
    S.N = X.cfg.startDay != null ? X.cfg.startDay : 80;
    S.tau = 9;
    const C = { x: 480, y: 230 }, R = 172;
    const ang = (tau) => Math.PI + (TAU * (tau - 12)) / 24;
    const pt = (phi, tau) => { const r = R * Math.cos(phi * RAD), a = ang(tau); return [f(C.x + r * Math.cos(a)), f(C.y - r * Math.sin(a))]; };
    const dec = () => declination(S.N, TILT);
    function shade() {
      const d = dec(), half = (phi) => dayHours(phi, d) / 2, pts = [];
      const top = 90 - Math.abs(d), lats = [];
      for (let p = 0; p < top; p += 1.5) lats.push(p);
      lats.push(top);
      if (d >= 0) {
        for (let x = 18; x <= 30.001; x += 0.25) pts.push(pt(0, x));
        lats.forEach((p) => pts.push(pt(p, 12 - half(p))));
        lats.slice().reverse().forEach((p) => pts.push(pt(p, 12 + half(p))));
        return `<circle cx="${C.x}" cy="${C.y}" r="${R}" fill="url(#${X.P}day)"/><path d="M${pts.join('L')}Z" fill="#071533" opacity=".86" stroke="#FFD23F" stroke-opacity=".55" stroke-width="2"/>`;
      }
      for (let x = 6; x <= 18.001; x += 0.25) pts.push(pt(0, x));
      lats.forEach((p) => pts.push(pt(p, 12 + half(p))));
      lats.slice().reverse().forEach((p) => pts.push(pt(p, 12 - half(p))));
      return `<circle cx="${C.x}" cy="${C.y}" r="${R}" fill="#071533"/><path d="M${pts.join('L')}Z" fill="url(#${X.P}day)" stroke="#FFD23F" stroke-opacity=".55" stroke-width="2"/>`;
    }
    const sunInfo = () => { const d = dec(), D = dayHours(place.lat, d); return { d, D, rise: 12 - D / 2, set: 12 + D / 2, s: sunAltAz(place.lat, d, S.tau) }; };
    return {
      title: T2('Day and night', 'दिन और रात'),
      hint: T2('Turn the Earth: drag the orange pin, or play a whole day.', 'पृथ्वी को घुमाओ: नारंगी पिन को खींचो, या पूरा दिन चलाओ।'),
      aria: T2('The Earth seen from above the North Pole, with the Sun on the left. The half facing the Sun has day.', 'उत्तरी ध्रुव के ऊपर से पृथ्वी, बाईं ओर सूरज। सूरज की ओर वाले आधे भाग में दिन है।'),
      svb: '0 0 300 190',
      vbN: '170 34 560 430',
      playLabel: T2('Play a whole day', 'पूरा दिन चलाओ'),
      sliders: [{ key: 'slider', min: 0, max: 24, step: 0.25, time: true, label: T2('Time of day (Sun time)', 'दिन का समय (सूर्य-समय)'), get: () => f(S.tau), set: (v) => { S.tau = v; }, out: () => clock(S.tau) }],
      toggles: ['labels', '3d'],
      tick(dt) { S.tau = mod(S.tau + dt * 2, 24); },
      scene() {
        let o = `<defs><radialGradient id="${X.P}day" cx=".3" cy=".5" r=".8"><stop offset="0" stop-color="#8FD0FF"/><stop offset=".6" stop-color="#3F8FE6"/><stop offset="1" stop-color="#2765BF"/></radialGradient></defs>`;
        o += X.sun(-40, C.y, 78);
        for (let k = 0; k < 7; k++) { const y = 50 + k * 60; o += `<line x1="70" y1="${y}" x2="${C.x - R - 18}" y2="${y}" stroke="#FFD23F" stroke-opacity=".42" stroke-width="2.5" marker-end="url(#${X.P}arrY)"/>`; }
        o += X.txt(26, 30, T2('Sunlight', 'धूप'), { anchor: 'start', fill: '#FFD23F', size: 15 });
        o += shade();
        [30, 60].forEach((p) => { o += `<circle cx="${C.x}" cy="${C.y}" r="${f(R * Math.cos(p * RAD))}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-dasharray="3 5"/>`; });
        for (let lon = 0; lon < 360; lon += 15) {
          const q = pt(0, S.tau + (lon - place.lon) / 15);
          o += `<line x1="${C.x}" y1="${C.y}" x2="${q[0]}" y2="${q[1]}" stroke="#fff" stroke-opacity="${lon === 0 ? 0.4 : 0.14}" stroke-width="1"/>`;
        }
        o += `<circle cx="${C.x}" cy="${C.y}" r="${R}" fill="none" stroke="#9CC8FF" stroke-opacity=".6" stroke-width="2"/>`;
        o += `<circle cx="${C.x}" cy="${C.y}" r="4" fill="#fff"/>`;
        const rr = R + 16, a1 = 2.2, a2 = 2.75;
        o += `<path d="M${f(C.x + rr * Math.cos(a1))} ${f(C.y - rr * Math.sin(a1))}A${rr} ${rr} 0 0 0 ${f(C.x + rr * Math.cos(a2))} ${f(C.y - rr * Math.sin(a2))}" fill="none" stroke="#9FB6FF" stroke-width="2.5" marker-end="url(#${X.P}arr)"/>`;
        if (S.tg.labels) {
          o += X.txt(C.x, C.y - 12, T2('North Pole', 'उत्तरी ध्रुव'), { size: 13, fill: '#fff' });
          o += X.txt(C.x - R * 0.55, C.y + 6, T2('DAY', 'दिन'), { size: 22, fill: '#FFFFFF', op: 0.85 });
          o += X.txt(C.x + R * 0.55, C.y + 6, T2('NIGHT', 'रात'), { size: 22, fill: '#BFD0FF', op: 0.85 });
          if (!X.narrow()) CITIES.forEach((c) => {
            const lt = S.tau + (c.lon - place.lon) / 15, q = pt(c.lat, lt);
            o += `<circle cx="${q[0]}" cy="${q[1]}" r="4.5" fill="#C4A1FF" stroke="#fff" stroke-width="1.5"/>`;
            o += X.txt(+q[0], +q[1] - 9, `${t(c.n)} ${t(clock(lt))}`, { size: 12, fill: '#EDE4FF' });
          });
          o += X.txt(C.x + R + 4, 444, T2('Earth turns from west to east, once in 24 hours', 'पृथ्वी पश्चिम से पूर्व की ओर 24 घंटे में एक बार घूमती है'), { size: 13, anchor: 'end', fill: '#9FB6FF' });
        }
        const q = pt(place.lat, S.tau);
        o += `<circle cx="${q[0]}" cy="${q[1]}" r="16" fill="#FF7A1A" opacity=".22" class="sk-pulse"/><circle cx="${q[0]}" cy="${q[1]}" r="8" fill="#FF7A1A" stroke="#fff" stroke-width="2.5"/>`;
        o += X.txt(+q[0], +q[1] + 26, place.n, { size: 15, fill: '#FFE1C2' });
        return o;
      },
      handles() { const q = pt(place.lat, S.tau); return [{ key: 'drag:earth', x: +q[0], y: +q[1], r: 26, label: T2('Your place on the Earth: drag it round to turn the Earth, or use the arrow keys', 'पृथ्वी पर तुम्हारी जगह: पृथ्वी घुमाने के लिए इसे खींचो, या तीर वाली कुंजियाँ दबाओ') }]; },
      drag(k, p) { const a = Math.atan2(-(p.y - C.y), p.x - C.x); S.tau = mod(12 + ((a - Math.PI) / TAU) * 24, 24); },
      step(k, d) { S.tau = mod(S.tau + d * 0.5, 24); },
      side() {
        const I = sunInfo(), alt = I.s.alt;
        const k = clamp((alt + 8) / 16, 0, 1);
        const topC = alt > 0 ? mixHex('#24336E', '#2F80ED', clamp(alt / 12, 0, 1)) : mixHex('#050B24', '#24336E', k);
        const botC = alt > 0 ? mixHex('#FF9E6B', '#A8D8FF', clamp(alt / 12, 0, 1)) : mixHex('#142457', '#FF9E6B', k);
        const x = (az) => 20 + (mod(az, 360) / 360) * 260, y = (a) => 150 - (a / 90) * 130;
        let path = [];
        for (let tt = I.rise; tt <= I.set + 0.001 && I.D > 0; tt += 0.25) { const s = sunAltAz(place.lat, I.d, tt); path.push(`${f(x(s.az))} ${f(y(Math.max(0, s.alt)))}`); }
        if (I.D >= 24) path = [];
        let o = `<defs><linearGradient id="${X.P}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${topC}"/><stop offset="1" stop-color="${botC}"/></linearGradient></defs><rect width="300" height="190" rx="12" fill="url(#${X.P}sky)"/>`;
        if (alt < -4) o += starField(300, 140, 34, 9);
        if (path.length > 1) o += `<path d="M${path.join('L')}" fill="none" stroke="#FFF2B0" stroke-opacity=".7" stroke-width="2" stroke-dasharray="2 5"/>`;
        if (alt > -1.5) o += `<circle cx="${f(x(I.s.az))}" cy="${f(y(alt))}" r="26" fill="url(#${X.P}glow)"/><circle cx="${f(x(I.s.az))}" cy="${f(y(alt))}" r="11" fill="url(#${X.P}sun)"/>`;
        o += `<path d="M0 150 L30 150 L34 138 L46 138 L50 150 L120 150 Q130 132 140 150 L196 150 L200 134 L214 134 L218 150 L262 150 Q272 128 282 150 L300 150 L300 178 Q300 190 288 190 L12 190 Q0 190 0 178Z" fill="${alt > 0 ? '#2F6B3A' : '#0E2030'}"/>`;
        [['N', 'उ', 0], ['E', 'पू', 90], ['S', 'द', 180], ['W', 'प', 270], ['N', 'उ', 360]].forEach(([en, hi, az]) => { o += X.txt(az === 360 ? 280 : x(az), 176, T2(en, hi), { size: 13, fill: '#fff', fixed: true }); });
        return o;
      },
      info() {
        const I = sunInfo(), day = I.s.alt > 0;
        const ist = S.tau + (82.5 - place.lon) / 15;
        const fx = [
          [T2('Date', 'तारीख़'), dateOf(S.N)],
          [T2('Sun time', 'सूर्य-समय'), clock(S.tau)],
          [T2('Clock time (IST)', 'घड़ी का समय (IST)'), clock(ist)],
          [T2('Sunrise', 'सूर्योदय'), I.D >= 24 || I.D <= 0 ? T2('none today', 'आज नहीं') : clock(I.rise + (82.5 - place.lon) / 15)],
          [T2('Sunset', 'सूर्यास्त'), I.D >= 24 || I.D <= 0 ? T2('none today', 'आज नहीं') : clock(I.set + (82.5 - place.lon) / 15)],
          [T2('Length of the day', 'दिन की लंबाई'), dur(I.D)],
        ];
        if (day) fx.push([T2('Shadow of a 1 m stick', '1 मीटर डंडे की छाया'), I.s.alt < 3 ? T2('very long', 'बहुत लंबी') : nf(1 / Math.tan(I.s.alt * RAD), 2) + ' m']);
        return {
          big: t(day ? T2('Day in ', 'दिन: ') : T2('Night in ', 'रात: ')) + t(place.n),
          facts: fx,
          note: T2('The Earth turns once in 24 hours. The half facing the Sun has day; the other half has night. Sunrise and sunset times are about right, to a few minutes.', 'पृथ्वी 24 घंटे में एक बार घूमती है। सूरज की ओर वाले आधे भाग में दिन और दूसरे आधे में रात होती है। सूर्योदय और सूर्यास्त के समय कुछ मिनट तक सही हैं।'),
        };
      },
      track() {
        const I = sunInfo(), state = I.s.alt > 0 ? 'day' : 'night';
        const prev = X.S.last.dn;
        X.track('dn', state, 'phase:' + state, state === 'day' ? T2('Day came', 'दिन हुआ') : T2('Night came', 'रात हुई'));
        if (prev && prev !== state) X.api.emit(state === 'day' ? 'phase:sunrise' : 'phase:sunset');
        const tm = mod(S.tau, 24), noon = Math.abs(tm - 12) < 0.3, mid = tm < 0.3 || tm > 23.7;
        if (S._init && noon && !S._noon) X.api.emit('phase:noon');
        if (S._init && mid && !S._mid) X.api.emit('phase:midnight');
        S._noon = noon; S._mid = mid; S._init = true;
      },
    };
  };

  // ---------------------------------------------------------------- seasons: the Earth round the Sun with its axis tilted
  const PSI = 22 * RAD, SPS = Math.sin(PSI), CPS = Math.cos(PSI); // the camera looks down on the Earth's orbit from 22° above it
  const VIEW = [0, SPS, CPS];
  const proj = (w) => [w[0], -w[1] * CPS + w[2] * SPS];
  function globe(X, x, y, r, n, s, lat) {
    const pr = (w) => [f(x + r * w[0]), f(y + r * (-w[1] * CPS + w[2] * SPS))];
    const alpha = Math.acos(clamp(dot(s, VIEW), -1, 1)), sp = proj(s), rot = Math.atan2(sp[1], sp[0]) * DEG;
    const a = norm([n[1], -n[0], 0]), b = cross(n, a);
    const circle = (phi, stroke, w, dash) => {
      const sf = Math.sin(phi * RAD), cf = Math.cos(phi * RAD);
      let d = '', pen = false;
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * TAU, p = [0, 1, 2].map((k) => sf * n[k] + cf * (Math.cos(th) * a[k] + Math.sin(th) * b[k]));
        if (dot(p, VIEW) > 0) { const q = pr(p); d += (pen ? 'L' : 'M') + q[0] + ' ' + q[1]; pen = true; } else pen = false;
      }
      return d ? `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>` : '';
    };
    const nb = pr(n.map((v) => -1.45 * v)), nt = pr(n.map((v) => 1.45 * v)), np = pr(n), nl = pr(n.map((v) => 1.75 * v));
    let o = `<line x1="${nb[0]}" y1="${nb[1]}" x2="${nt[0]}" y2="${nt[1]}" stroke="#FFD23F" stroke-width="2.5" stroke-opacity=".8"/>`;
    o += X.ball(x, y, r, `url(#${X.P}ocean)`, Math.PI - alpha, rot, '#0B1838');
    o += circle(66.56, '#BFE3FF', 1.2, '3 4') + circle(-66.56, '#BFE3FF', 1.2, '3 4') + circle(23.44, '#FFB13B', 1.6, '4 3') + circle(-23.44, '#FFB13B', 1.6, '4 3') + circle(0, '#FFFFFF', 1.8);
    if (lat != null) o += circle(lat, '#FF7A1A', 2.4);
    if (dot(s, VIEW) > 0.05) { const q = pr(s); o += `<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="#FFF3A0" stroke="#FF8F1F" stroke-width="1.5"/>`; }
    o += `<line x1="${np[0]}" y1="${np[1]}" x2="${nt[0]}" y2="${nt[1]}" stroke="#FFD23F" stroke-width="2.5"/>`;
    o += X.txt(+nl[0], +nl[1] + 4, T2('N', 'उ'), { size: 13, fill: '#FFD23F' });
    o += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="none" stroke="#9CC8FF" stroke-opacity=".45" stroke-width="1.5"/>`;
    return o;
  }

  MODE.seasons = (X) => {
    const { S, t, place } = X;
    S.N = X.cfg.startDay != null ? X.cfg.startDay : 172;
    const C = { x: 400, y: 214 }, R = 300;
    const th = (N) => Math.PI + (TAU * (N - 172)) / 365.24;
    const world = (N) => [R * Math.cos(th(N)), 0, -R * Math.sin(th(N))];
    const scr = (N) => { const w = world(N), q = proj(w); return { x: C.x + q[0], y: C.y + q[1], z: w[2] }; };
    const dec = () => declination(S.N, S.tg.tilt ? TILT : 0);
    const keyDay = () => KEYDAYS.find((k) => Math.abs(wrap180(((S.N - k.N) / 365) * 360)) <= 2.2);
    return {
      title: T2('Seasons', 'ऋतुएँ'),
      hint: T2('Move the Earth round the Sun and watch the tilted axis.', 'पृथ्वी को सूरज के चारों ओर घुमाओ और झुके हुए अक्ष को देखो।'),
      aria: T2('The Earth going round the Sun in a year, with its axis tilted the same way all year.', 'एक साल में सूरज का चक्कर लगाती पृथ्वी, जिसका अक्ष पूरे साल एक ही ओर झुका रहता है।'),
      svb: '0 0 260 230',
      vbN: '40 40 720 380',
      playLabel: T2('Play a whole year', 'पूरा साल चलाओ'),
      sliders: [{ key: 'slider', min: 1, max: 365, step: 1, time: true, label: T2('Day of the year', 'साल का दिन'), get: () => Math.round(S.N), set: (v) => { S.N = v; }, out: () => dateOf(S.N) }],
      toggles: ['tilt', 'orbit', 'labels', '3d'],
      tick(dt) { S.N = mod(S.N - 1 + dt * 30, 365) + 1; },
      scene() {
        let o = '';
        if (S.tg.orbit) o += `<ellipse cx="${C.x}" cy="${C.y}" rx="${R}" ry="${f(R * SPS)}" fill="none" stroke="#8EA9FF" stroke-opacity=".5" stroke-width="2" stroke-dasharray="6 7"/>`;
        const ar = scr(225), ar2 = scr(245);
        if (S.tg.orbit) o += `<path d="M${f(ar.x)} ${f(ar.y)}L${f(ar2.x)} ${f(ar2.y)}" stroke="#9FB6FF" stroke-width="2.5" marker-end="url(#${X.P}arr)"/>`;
        if (S.tg.labels) KEYDAYS.forEach((k) => {
          const p = scr(k.N), dx = p.x - C.x, dy = p.y - C.y, l = Math.hypot(dx, dy / SPS) || 1;
          o += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="4" fill="#9FB6FF"/>`;
          o += X.txt(p.x + (dx / l) * 20, dy > 1 ? p.y + 26 : p.y - 14 - (Math.abs(dy) < 1 ? 46 * X.B() : 0), dateOf(k.N), { size: 13, fill: '#C9D5F5' });
        });
        const e = scr(S.N), w = world(S.N), s = norm(w.map((v) => -v));
        const n = S.tg.tilt ? [Math.sin(TILT * RAD), Math.cos(TILT * RAD), 0] : [0, 1, 0];
        const earth = `<line x1="${f(C.x)}" y1="${f(C.y)}" x2="${f(e.x)}" y2="${f(e.y)}" stroke="#FFD23F" stroke-width="8" stroke-opacity=".16"/>` + globe(X, e.x, e.y, 34 * X.B(), n, s, place.lat);
        const sun = X.sun(C.x, C.y, 44) + (S.tg.labels ? X.txt(C.x, C.y + 6, T2('Sun', 'सूरज'), { size: 15, fill: '#7A3B00' }) : '');
        o += e.z < 0 ? earth + sun : sun + earth;
        return o;
      },
      handles() { const e = scr(S.N); return [{ key: 'drag:earth', x: e.x, y: e.y, r: 40 * X.B(), label: T2('The Earth: drag it along its orbit, or use the arrow keys', 'पृथ्वी: इसे कक्षा पर खींचो, या तीर वाली कुंजियाँ दबाओ') }]; },
      drag(k, p) { const a = Math.atan2(-(p.y - C.y) / SPS, p.x - C.x); S.N = Math.round(mod(171 + ((a - Math.PI) / TAU) * 365.24, 365) + 1); },
      step(k, d) { S.N = mod(S.N - 1 + d * 5, 365) + 1; },
      side() {
        const d = dec(), alt = noonAlt(place.lat, d), D = dayHours(place.lat, d);
        const north = d > place.lat, sx = 130, gy = 168, stick = 56;
        const sh = Math.min(118, stick / Math.tan(alt * RAD)), dir = north ? -1 : 1;
        const tipX = sx + dir * sh, sunX = sx - dir * Math.cos(alt * RAD) * 92, sunY = gy - stick - Math.sin(alt * RAD) * 92;
        let o = `<defs><linearGradient id="${X.P}nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B8BEB"/><stop offset="1" stop-color="#BFE3FF"/></linearGradient></defs><rect width="260" height="230" rx="12" fill="url(#${X.P}nsky)"/>`;
        o += X.txt(12, 22, `${t(T2('Noon Sun', 'दोपहर का सूरज'))}: ${nf(alt, 0)}°`, { size: 13, fill: '#fff', fixed: true, anchor: 'start' });
        o += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="24" fill="url(#${X.P}glow)"/><circle cx="${f(sunX)}" cy="${f(sunY)}" r="11" fill="url(#${X.P}sun)"/>`;
        o += `<line x1="${f(sunX)}" y1="${f(sunY)}" x2="${f(tipX)}" y2="${gy}" stroke="#FF8F1F" stroke-width="2" stroke-dasharray="4 4"/>`;
        o += `<rect x="0" y="${gy}" width="260" height="62" fill="#5B8C3A"/><rect x="0" y="${gy}" width="260" height="4" fill="#3F6B28"/>`;
        o += `<line x1="${sx}" y1="${gy + 1}" x2="${f(tipX)}" y2="${gy + 1}" stroke="#1B2A1A" stroke-width="7" stroke-linecap="round" opacity=".7"/>`;
        o += `<line x1="${sx}" y1="${gy}" x2="${sx}" y2="${gy - stick}" stroke="#7A4A22" stroke-width="5" stroke-linecap="round"/>`;
        o += X.txt(14, gy - 8, T2('S', 'द'), { size: 13, fill: '#0B1838', fixed: true }) + X.txt(246, gy - 8, T2('N', 'उ'), { size: 13, fill: '#0B1838', fixed: true });
        o += `<rect x="12" y="194" width="236" height="22" rx="11" fill="#0B1838"/><rect x="${f(12 + 236 * (0.5 - D / 48))}" y="194" width="${f((236 * D) / 24)}" height="22" rx="11" fill="#FFD23F"/>`;
        o += X.txt(130, 210, `${t(T2('Day', 'दिन'))} ${t(dur(D))}`, { size: 12, fill: '#1E293B', fixed: true });
        return o;
      },
      info() {
        const d = dec(), dt = dateOf(S.N), ns = northSeason(Math.round(S.N));
        const kd = keyDay();
        const big = !S.tg.tilt ? t(T2('No tilt: no seasons', 'झुकाव नहीं: कोई ऋतु नहीं')) : kd ? t(kd.n) : `${t(dt)}: ${t(T2('', ''))}${t(SEASONS[ns])} ${t(T2('in the north', 'उत्तर में'))}`;
        return {
          big,
          facts: [
            [T2('Northern half (India)', 'उत्तरी भाग (भारत)'), S.tg.tilt ? SEASONS[ns] : '—'],
            [T2('Southern half', 'दक्षिणी भाग'), S.tg.tilt ? SEASONS[SOUTH[ns]] : '—'],
            [T2('India\'s season (IMD)', 'भारत की ऋतु (IMD)'), imdSeason(dt.m)],
            [T2('Sun overhead at', 'सूरज सिर के ठीक ऊपर'), Math.abs(d) < 0.3 ? T2('the equator', 'भूमध्य रेखा पर') : `${nf(Math.abs(d), 1)}° ${t(d > 0 ? T2('N', 'उ') : T2('S', 'द'))}`],
            [T2('Day length in ', 'दिन की लंबाई: ') , ''],
            [T2('Noon Sun height', 'दोपहर में सूरज की ऊँचाई'), nf(noonAlt(place.lat, d), 0) + '°'],
            [T2('Distance from the Sun', 'सूरज से दूरी'), `${nf(sunDistMkm(S.N), 1)} ${t(T2('million km', 'मिलियन किमी'))}`],
          ].map((r) => (r[1] === '' ? [`${t(r[0])}${t(place.n)}`, dur(dayHours(place.lat, d))] : r)),
          note: S.tg.tilt
            ? T2('The Earth\'s axis is tilted by 23.5° and always points the same way in space. When our half leans towards the Sun, its rays fall more directly and days are longer: summer. Distance is not the reason: the Earth is closest to the Sun in early January.', 'पृथ्वी का अक्ष 23.5° झुका है और अंतरिक्ष में हमेशा एक ही दिशा में रहता है। जब हमारा भाग सूरज की ओर झुकता है, तो किरणें सीधी पड़ती हैं और दिन लंबे होते हैं: गर्मी। दूरी इसका कारण नहीं है: जनवरी की शुरुआत में पृथ्वी सूरज के सबसे पास होती है।')
            : T2('Without the tilt, the Sun would be overhead at the equator all year, every place would have 12-hour days, and there would be no seasons.', 'झुकाव के बिना सूरज पूरे साल भूमध्य रेखा के ऊपर रहता, हर जगह दिन 12 घंटे का होता, और कोई ऋतु नहीं होती।'),
        };
      },
      track() {
        if (!S.tg.tilt) return;
        const ns = northSeason(Math.round(S.N));
        X.track('season', ns, 'season:' + ns, SEASONS[ns]);
        const kd = keyDay();
        X.track('keyday', kd ? kd.key : '', kd ? 'season:' + kd.key : null, kd ? kd.n : null);
      },
    };
  };

  // ---------------------------------------------------------------- eclipses
  MODE.eclipse = (X) => {
    const { S, t } = X;
    S.day = X.cfg.startDay != null ? X.cfg.startDay : 12;
    S.nodes = 'eclipse';
    const C = { x: 440, y: 140 }, R = 108, SV = { x: 440, y: 372 };
    const elong = () => (360 * mod(S.day, MONTH)) / MONTH;              // degrees from the Sun
    const beta = (eDeg) => MOON_INC * Math.sin((eDeg - (S.nodes === 'eclipse' ? 0 : 90)) * RAD); // the Moon's height above the Earth's orbit, °
    const state = () => {
      const e = elong(), b = beta(e), ss = Math.hypot(wrap180(e), b), sa = Math.hypot(wrap180(e - 180), b);
      return { e, b, ss, sa, solar: ss < 1.48, lunar: sa < 0.96 };
    };
    const ang = () => Math.PI + (TAU * S.day) / MONTH;
    const mpos = () => ({ x: C.x + R * Math.cos(ang()), y: C.y - R * Math.sin(ang()) });
    function snap() { const d = mod(S.day, MONTH); if (Math.abs(wrap180((d / MONTH) * 360)) < 7) S.day = 0; else if (Math.abs(d - MONTH / 2) < 0.6) S.day = MONTH / 2; }
    return {
      title: T2('Eclipses', 'ग्रहण'),
      hint: T2('Move the Moon to new moon or full moon. Is it lined up?', 'चाँद को अमावस्या या पूर्णिमा पर लाओ। क्या वह एक सीध में है?'),
      aria: T2('Top view and side view of the Sun, the Earth and the Moon, with their shadows.', 'सूरज, पृथ्वी और चाँद का ऊपर से और बगल से दृश्य, उनकी छायाओं के साथ।'),
      svb: '0 0 240 240',
      playLabel: T2('Play a month', 'एक महीना चलाओ'),
      sliders: [{ key: 'slider', min: 0, max: 29.5, step: 0.05, time: true, label: T2('Day of the Moon\'s month', 'चंद्र मास का दिन'), get: () => f(S.day * 2) / 2, set: (v) => { S.day = v; }, out: () => nf(S.day, 1), snap }],
      buttons: () => [
        { key: 'month:eclipse', label: T2('Eclipse season', 'ग्रहण का मौसम'), pressed: S.nodes === 'eclipse' },
        { key: 'month:ordinary', label: T2('Ordinary month', 'साधारण महीना'), pressed: S.nodes === 'ordinary' },
      ],
      toggles: ['labels'],
      act(key) { if (key.startsWith('month:')) { S.nodes = key.slice(6); X.api.emit(key); X.api.record(t(key === 'month:eclipse' ? T2('Chose an eclipse season', 'ग्रहण का मौसम चुना') : T2('Chose an ordinary month', 'साधारण महीना चुना'))); } },
      tick(dt) { const st = state(); S.day = mod(S.day + dt * (Math.min(st.ss, st.sa) < 4 ? 0.35 : 1.6), MONTH); },
      scene() {
        const st = state(), m = mpos();
        let o = X.sun(-40, C.y, 64);
        for (let k = 0; k < 4; k++) { const y = 74 + k * 44; o += `<line x1="58" y1="${y}" x2="${C.x - R - 26}" y2="${y}" stroke="#FFD23F" stroke-opacity=".42" stroke-width="2.5"/>`; }
        o += `<path d="M${C.x} ${C.y - 26}L${C.x + 330} ${C.y - 11}L${C.x + 330} ${C.y + 11}L${C.x} ${C.y + 26}Z" fill="#000" opacity=".5"/>`;
        o += `<circle cx="${C.x}" cy="${C.y}" r="${R}" fill="none" stroke="#8EA9FF" stroke-opacity=".5" stroke-width="2" stroke-dasharray="5 7"/>`;
        if (Math.abs(wrap180(st.e)) < 25) o += `<path d="M${f(m.x)} ${f(m.y - 11)}L${C.x} ${f(C.y - 5 + (m.y - C.y) * 0.1)}L${C.x} ${f(C.y + 5 + (m.y - C.y) * 0.1)}L${f(m.x)} ${f(m.y + 11)}Z" fill="#000" opacity=".55"/>`;
        o += X.ball(C.x, C.y, 26, `url(#${X.P}ocean)`, Math.PI / 2, 180, '#0D1B44');
        o += X.ball(m.x, m.y, 12, `url(#${X.P}moon)`, Math.PI / 2, 180, '#2A2F40');
        if (S.tg.labels) {
          o += X.txt(C.x, C.y + 46, T2('Earth', 'पृथ्वी'), { size: 14 }) + X.txt(m.x, m.y - 20, T2('Moon', 'चाँद'), { size: 13, fill: '#FFE9A8' });
          o += X.txt(C.x + 250, C.y - 34, T2('Earth\'s shadow', 'पृथ्वी की छाया'), { size: 13, fill: '#9FB6FF' });
          o += X.txt(20, 22, T2('Seen from above', 'ऊपर से देखने पर'), { size: 13, anchor: 'start', fill: '#9FB6FF' });
        }
        o += `<rect x="0" y="268" width="800" height="192" fill="#0A1238" opacity=".65"/><line x1="0" y1="268" x2="800" y2="268" stroke="#8EA9FF" stroke-opacity=".25"/>`;
        o += X.txt(20, 292, T2('Seen from the side (the Moon\'s tilt drawn 5 times bigger)', 'बगल से देखने पर (चाँद का झुकाव 5 गुना बड़ा दिखाया है)'), { size: 13, anchor: 'start', fill: '#9FB6FF' });
        o += X.sun(-30, SV.y, 46);
        o += `<line x1="40" y1="${SV.y}" x2="800" y2="${SV.y}" stroke="#FFD23F" stroke-opacity=".35" stroke-dasharray="4 6"/>`;
        o += `<path d="M${SV.x} ${SV.y - 15}L${SV.x + 330} ${SV.y - 7}L${SV.x + 330} ${SV.y + 7}L${SV.x} ${SV.y + 15}Z" fill="#000" opacity=".55"/>`;
        let path = '';
        for (let k = 0; k <= 72; k++) { const e = k * 5, a = Math.PI + e * RAD; path += (k ? 'L' : 'M') + f(SV.x + R * Math.cos(a)) + ' ' + f(SV.y - R * Math.sin(5 * beta(e) * RAD)); }
        o += `<path d="${path}" fill="none" stroke="#C4A1FF" stroke-opacity=".7" stroke-width="2"/>`;
        const sy = SV.y - R * Math.sin(5 * st.b * RAD);
        o += X.ball(SV.x, SV.y, 15, `url(#${X.P}ocean)`, Math.PI / 2, 180, '#0D1B44');
        o += X.ball(m.x, sy, 8, `url(#${X.P}moon)`, Math.PI / 2, 180, '#2A2F40');
        if (S.tg.labels) {
          const where = Math.abs(st.b) < 0.4 ? T2('in line', 'सीध में') : st.b > 0 ? T2('above the line', 'रेखा के ऊपर') : T2('below the line', 'रेखा के नीचे');
          o += X.txt(m.x, sy + (st.b > 0 ? -16 : 26), where, { size: 12, fill: '#E7DBFF' });
        }
        if (st.solar || st.lunar) o += X.txt(400, 250, st.solar ? T2('Solar eclipse!', 'सूर्य ग्रहण!') : T2('Lunar eclipse!', 'चंद्र ग्रहण!'), { size: 22, fill: '#FFD23F' });
        return o;
      },
      handles() { const m = mpos(); return [{ key: 'drag:moon', x: m.x, y: m.y, r: 26, label: T2('The Moon: drag it round the Earth, or use the arrow keys', 'चाँद: इसे पृथ्वी के चारों ओर खींचो, या तीर वाली कुंजियाँ दबाओ') }]; },
      drag(k, p) { const th = Math.atan2(-(p.y - C.y), p.x - C.x); S.day = mod(((th - Math.PI) / TAU) * MONTH, MONTH); },
      dragEnd: snap,
      step(k, d) { S.day = mod(S.day + d * 0.25, MONTH); snap(); },
      side() {
        const st = state();
        let o = `<rect width="240" height="240" rx="14" fill="#070C24"/>`;
        if (Math.abs(wrap180(st.e)) < 30) {
          const k = 150, sep = st.ss, app = Math.max(0, sep - 0.95), ux = sep ? -wrap180(st.e) / sep : 0, uy = sep ? -st.b / sep : 0;
          const mx = 120 - ux * app * k, my = 120 + uy * app * k, cover = Math.max(0, 1 - app / 0.526);
          o = `<rect width="240" height="240" rx="14" fill="${mixHex('#3B7BD8', '#060A1E', clamp(cover * 1.2, 0, 1))}"/>`;
          if (cover > 0.97) o += `<circle cx="120" cy="120" r="70" fill="url(#${X.P}glow)"/><circle cx="120" cy="120" r="48" fill="#FFF8E0" opacity=".55"/>`;
          o += `<circle cx="120" cy="120" r="40" fill="url(#${X.P}sun)"/>`;
          if (app < 0.8) o += `<circle cx="${f(mx)}" cy="${f(my)}" r="39" fill="#0A0D18"/>`;
        } else if (Math.abs(wrap180(st.e - 180)) < 30) {
          const k = 80, dx = -wrap180(st.e - 180) * k, dy = -st.b * k, mx = 120 + dx, my = 120 + dy;
          o += `<defs><clipPath id="${X.P}lm"><circle cx="${f(mx)}" cy="${f(my)}" r="21"/></clipPath></defs>`;
          o += `<circle cx="120" cy="120" r="100" fill="none" stroke="#9FB6FF" stroke-opacity=".3" stroke-dasharray="3 5"/><circle cx="120" cy="120" r="56" fill="none" stroke="#FF8A5C" stroke-opacity=".45" stroke-dasharray="3 5"/>`;
          o += `<circle cx="${f(mx)}" cy="${f(my)}" r="21" fill="url(#${X.P}moon)"/>`;
          o += `<g clip-path="url(#${X.P}lm)"><circle cx="120" cy="120" r="100" fill="#000" opacity=".18"/><circle cx="120" cy="120" r="56" fill="#8E2F1A" opacity=".88"/></g>`;
        } else {
          o += starField(240, 240, 30, 4) + moonFace(X, 120, 120, 70, S.day, 'ec');
        }
        return o;
      },
      info() {
        const st = state(), p = phaseOf(S.day);
        let big = t(p.n), note;
        if (st.solar) { big = t(T2('Solar eclipse', 'सूर्य ग्रहण')); note = T2('The Moon is exactly between the Sun and the Earth, and its shadow falls on the Earth. Never look at the Sun directly: use proper eclipse glasses.', 'चाँद ठीक सूरज और पृथ्वी के बीच है, और उसकी छाया पृथ्वी पर पड़ती है। सूरज को कभी सीधे मत देखो: सही ग्रहण-चश्मा पहनो।'); }
        else if (st.lunar) { big = t(st.sa < 0.44 ? T2('Total lunar eclipse', 'पूर्ण चंद्र ग्रहण') : T2('Partial lunar eclipse', 'आंशिक चंद्र ग्रहण')); note = T2('The Earth is exactly between the Sun and the Moon, and the Moon moves into the Earth\'s shadow. It turns a coppery red: a little sunlight bends through the Earth\'s air onto it. It is safe to watch.', 'पृथ्वी ठीक सूरज और चाँद के बीच है, और चाँद पृथ्वी की छाया में आ जाता है। यह ताँबे जैसा लाल हो जाता है: पृथ्वी की हवा से मुड़कर थोड़ी धूप उस पर पड़ती है। इसे देखना सुरक्षित है।'); }
        else if (Math.min(Math.abs(wrap180(st.e)), Math.abs(wrap180(st.e - 180))) < 2.5) note = T2('No eclipse this time: the Moon passes a little above or below the line from the Sun to the Earth, because its orbit is tilted by about 5°.', 'इस बार ग्रहण नहीं: चाँद सूरज से पृथ्वी तक की रेखा के थोड़ा ऊपर या नीचे से निकल जाता है, क्योंकि उसकी कक्षा लगभग 5° झुकी है।');
        else note = T2('A solar eclipse can happen only at new moon, and a lunar eclipse only at full moon, and only when the Moon is also on the line. That happens in two "eclipse seasons" a year.', 'सूर्य ग्रहण केवल अमावस्या पर और चंद्र ग्रहण केवल पूर्णिमा पर हो सकता है, और तभी जब चाँद भी सीध में हो। ऐसा साल में दो "ग्रहण के मौसमों" में होता है।');
        if (st.solar) big += ': ' + t(st.ss < 0.9 ? T2('total in a narrow strip, partial around it', 'एक पतली पट्टी में पूर्ण, आसपास आंशिक') : T2('partial', 'आंशिक'));
        return {
          big,
          facts: [
            [T2('Moon\'s phase', 'चाँद की कला'), p.n],
            [T2('Moon above or below the line', 'चाँद रेखा से ऊपर या नीचे'), `${nf(Math.abs(st.b), 1)}°`],
            [T2('Moon\'s orbit tilt', 'चाँद की कक्षा का झुकाव'), '5.1°'],
          ],
          note,
        };
      },
      track() {
        const st = state(), p = phaseOf(S.day);
        X.track('phase', p.key, 'phase:' + p.key, p.n);
        const at = Math.min(Math.abs(wrap180(st.e)), Math.abs(wrap180(st.e - 180))) < 2.5;
        const v = st.solar ? 'solar' : st.lunar ? 'lunar' : at ? 'none' : '';
        X.track('ecl', v, v ? 'eclipse:' + v : null, v === 'solar' ? T2('Saw a solar eclipse', 'सूर्य ग्रहण देखा') : v === 'lunar' ? T2('Saw a lunar eclipse', 'चंद्र ग्रहण देखा') : v === 'none' ? T2('Lined up, but no eclipse', 'सीध में आया, पर ग्रहण नहीं') : null);
      },
    };
  };

  // ---------------------------------------------------------------- the solar system
  MODE['solar-system'] = (X) => {
    const { S, t } = X;
    S.days = X.cfg.startDay != null ? X.cfg.startDay : 0;
    S.pick = 'earth';
    const C = { x: 400, y: 236 }, Q = 0.48;
    const belt = (() => { const r = rng(21), a = []; for (let i = 0; i < 170; i++) a.push([2.2 + r() * 1.1, r() * 360, r()]); return a; })();
    const lonOf = (p) => mod(p.L0 + (360 * (J2026 + S.days)) / p.P, 360) * RAD;
    const posOf = (p) => { const L = lonOf(p); return { x: C.x + p.rr * Math.cos(L), y: C.y - p.rr * Q * Math.sin(L) }; };
    const sizeOf = (p) => (S.tg.scale ? Math.max(0.8, (19 * p.d) / 142984) : p.sz);
    const year = () => 2026 + S.days / 365.25;
    function planet(p) {
      const q = posOf(p), r = sizeOf(p), a = Math.atan2(C.y - q.y, C.x - q.x);
      const id = X.P + 'pg' + p.id, hl = mixHex(p.col, '#FFFFFF', 0.45), dk = mixHex(p.col, '#000000', 0.62);
      let o = `<defs><radialGradient id="${id}" cx="${f(0.5 + 0.32 * Math.cos(a))}" cy="${f(0.5 + 0.32 * Math.sin(a))}" r=".75"><stop offset="0" stop-color="${hl}"/><stop offset=".45" stop-color="${p.col}"/><stop offset="1" stop-color="${dk}"/></radialGradient></defs>`;
      const ring = (half) => `<path d="M${f(q.x - r * 2.2)} ${f(q.y)}A${f(r * 2.2)} ${f(r * 0.75)} 0 0 ${half} ${f(q.x + r * 2.2)} ${f(q.y)}" fill="none" stroke="#E9D9A6" stroke-opacity=".85" stroke-width="${f(Math.max(1, r * 0.35))}"/>`;
      if (p.id === 'saturn') o += ring(1);
      if (S.pick === p.id) o += `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(Math.max(r + 7, 12))}" fill="none" stroke="#FFD23F" stroke-width="2.5" class="sk-pulse"/>`;
      o += `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(r)}" fill="url(#${id})"/>`;
      if (p.id === 'jupiter' && r > 6) [-0.45, -0.15, 0.2, 0.5].forEach((dy, i) => { const hc = Math.sqrt(1 - dy * dy) * r; o += `<line x1="${f(q.x - hc)}" y1="${f(q.y + dy * r)}" x2="${f(q.x + hc)}" y2="${f(q.y + dy * r)}" stroke="${i % 2 ? '#B9814C' : '#F2DDB8'}" stroke-opacity=".55" stroke-width="${f(r * 0.14)}"/>`; });
      if (p.id === 'saturn') o += ring(0);
      if (S.tg.labels) o += X.txt(q.x, q.y + Math.max(r, 5) + 15, p.n, { size: 12.5, fill: S.pick === p.id ? '#FFD23F' : '#DCE5FF' });
      return o;
    }
    return {
      title: T2('The solar system', 'सौरमंडल'),
      hint: T2('Tap a planet to meet it. Play to see the planets go round.', 'किसी ग्रह से मिलने के लिए उसे टैप करो। ग्रहों को घूमते देखने के लिए चलाओ।'),
      aria: T2('The Sun in the middle and the eight planets on their orbits, in their real order.', 'बीच में सूरज और अपनी कक्षाओं पर आठों ग्रह, अपने असली क्रम में।'),
      svb: '0 0 260 150',
      autoplay: true,
      sliders: [{ key: 'slider', min: 0, max: 10957, step: 1, time: true, label: T2('Date', 'तारीख़'), get: () => Math.round(S.days), set: (v) => { S.days = v; }, out: () => { const y = Math.floor(year()), d = dateOf(1 + Math.floor((year() - y) * 365.25)); return { en: `${d.en} ${y}`, hi: `${d.hi} ${y}` }; } }],
      buttons: () => PLANETS.map((p) => ({ key: 'planet:' + p.id, label: p.n, pressed: S.pick === p.id, sw: p.col })),
      toggles: ['orbit', 'labels', 'scale'],
      tick(dt) { S.days = mod(S.days + dt * 55, 10957); },
      act(key) { if (key.startsWith('planet:')) { const id = key.slice(7); S.pick = id; X.api.emit('picked:' + id); X.api.speak(t(PLANET[id].n)); X.api.record(t(T2('Looked at ', 'देखा: ')) + t(PLANET[id].n)); } },
      scene() {
        let o = '';
        if (S.tg.orbit) PLANETS.forEach((p) => { o += `<ellipse cx="${C.x}" cy="${C.y}" rx="${p.rr}" ry="${f(p.rr * Q)}" fill="none" stroke="${S.pick === p.id ? '#FFD23F' : '#8EA9FF'}" stroke-opacity="${S.pick === p.id ? 0.7 : 0.32}" stroke-width="1.5"/>`; });
        const bd = belt.map(([a, l, k]) => { const L = (l + (360 * (J2026 + S.days)) / (365.25 * Math.pow(a, 1.5))) * RAD, rr = 150 + ((a - 2.2) / 1.1) * 32; return { x: C.x + rr * Math.cos(L), y: C.y - rr * Q * Math.sin(L), k }; });
        const back = PLANETS.filter((p) => posOf(p).y < C.y), front = PLANETS.filter((p) => posOf(p).y >= C.y);
        o += bd.filter((b) => b.y < C.y).map((b) => `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${b.k > 0.8 ? 1.3 : 0.8}" fill="#C8B79A" opacity=".55"/>`).join('');
        o += back.sort((a, b) => posOf(a).y - posOf(b).y).map(planet).join('');
        o += X.sun(C.x, C.y, 24);
        o += bd.filter((b) => b.y >= C.y).map((b) => `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${b.k > 0.8 ? 1.3 : 0.8}" fill="#C8B79A" opacity=".55"/>`).join('');
        o += front.sort((a, b) => posOf(a).y - posOf(b).y).map(planet).join('');
        if (S.tg.labels) o += X.txt(C.x, C.y + 5, T2('Sun', 'सूरज'), { size: 13, fill: '#7A3B00' });
        o += X.txt(12, 450, S.tg.scale ? T2('Planet sizes to scale with each other (the Sun is not); distances not to scale', 'ग्रहों के आकार आपस में सही अनुपात में (सूरज नहीं); दूरियाँ अनुपात में नहीं') : T2('Sizes and distances are not to scale', 'आकार और दूरियाँ अनुपात में नहीं हैं'), { size: 12, anchor: 'start', fill: '#9FB6FF' });
        return o;
      },
      handles() { return PLANETS.map((p) => { const q = posOf(p); return { key: 'planet:' + p.id, x: q.x, y: q.y, r: Math.max(sizeOf(p) + 6, 15), label: p.n }; }); },
      side() {
        const p = PLANET[S.pick], E = PLANET.earth, img = X.api.asset('planet-' + p.id);
        const big = Math.max(p.d, E.d), R0 = p.id === 'saturn' ? 34 : 52, rp = (R0 * p.d) / big, re = (R0 * E.d) / big;
        let o = `<rect width="260" height="150" rx="12" fill="#070C24"/>${starField(260, 150, 26, 5)}`;
        const draw = (x, q, r) => `<defs><radialGradient id="${X.P}sd${q.id}" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="${mixHex(q.col, '#FFFFFF', 0.45)}"/><stop offset=".5" stop-color="${q.col}"/><stop offset="1" stop-color="${mixHex(q.col, '#000000', 0.6)}"/></radialGradient></defs>`
          + (q.id === 'saturn' ? `<ellipse cx="${x}" cy="72" rx="${f(r * 2.1)}" ry="${f(r * 0.5)}" fill="none" stroke="#E9D9A6" stroke-width="${f(Math.max(1, r * 0.3))}" opacity=".8"/>` : '')
          + `<circle cx="${x}" cy="72" r="${f(Math.max(r, 1))}" fill="url(#${X.P}sd${q.id})"/>`;
        if (img) o += `<image href="${esc(img)}" x="${f(80 - rp)}" y="${f(72 - rp)}" width="${f(2 * rp)}" height="${f(2 * rp)}" preserveAspectRatio="xMidYMid slice"/>`;
        else o += draw(80, p, rp);
        if (p.id !== 'earth') { o += draw(200, E, re); o += X.txt(200, 140, E.n, { size: 12, fixed: true }); }
        o += X.txt(80, 140, p.n, { size: 12, fixed: true, fill: '#FFD23F' });
        o += X.txt(130, 16, T2('Sizes to scale', 'आकार सही अनुपात में'), { size: 11, fixed: true, fill: '#9FB6FF' });
        return o;
      },
      info() {
        const p = PLANET[S.pick], i = PLANETS.indexOf(p) + 1, yr = p.P / 365.25;
        return {
          big: t(p.n),
          facts: [
            [T2('Place from the Sun', 'सूरज से क्रम'), `${i} / 8`],
            [T2('Distance from the Sun', 'सूरज से दूरी'), `${nf(p.a * 149.6, 1)} ${t(T2('million km', 'मिलियन किमी'))}`],
            [T2('Width (diameter)', 'चौड़ाई (व्यास)'), `${nf(p.d)} km (${nf(p.d / 12756, 2)} × ${t(PLANET.earth.n)})`],
            [T2('One year (one trip round the Sun)', 'एक वर्ष (सूरज का एक चक्कर)'), yr < 2 ? `${nf(p.P)} ${t(T2('Earth days', 'पृथ्वी दिवस'))}` : `${nf(yr, 1)} ${t(T2('Earth years', 'पृथ्वी वर्ष'))}`],
            [T2('One spin (its day)', 'एक घूर्णन (उसका दिन)'), p.day],
            [T2('Moons', 'उपग्रह (चंद्रमा)'), p.moons],
            [T2('Average temperature', 'औसत तापमान'), `${p.temp > 0 ? '' : '−'}${Math.abs(p.temp)} °C`],
            [T2('Kind', 'प्रकार'), PT[p.type]],
          ],
          note: p.fact,
        };
      },
      track() { X.track('orbit', Math.floor(S.days / 365.256), 'orbit', T2('The Earth went once round the Sun', 'पृथ्वी ने सूरज का एक चक्कर पूरा किया')); },
    };
  };

  // ---------------------------------------------------------------- the night sky from an Indian city
  MODE.constellations = (X) => {
    const { S, t, place } = X;
    S.N = X.cfg.startDay != null ? X.cfg.startDay : 30;
    S.tau = 20.5; S.view = 'south'; S.pick = 'orion';
    S.tg.labels = true;
    const faint = (() => { const r = rng(33), a = []; for (let i = 0; i < 220; i++) a.push([r() * 24, Math.asin(r() * 2 - 1) * DEG, r()]); return a; })();
    const lst = (tau) => 280.46061837 + 360.98564736629 * (J2026 + (S.N - 1) + (tau - 5.5) / 24) + place.lon;
    function basis() {
      const az0 = S.view === 'north' ? 0 : 180, a0 = (S.view === 'north' ? clamp(place.lat + 14, 30, 70) : 40) * RAD;
      const c = [Math.cos(a0) * Math.sin(az0 * RAD), Math.cos(a0) * Math.cos(az0 * RAD), Math.sin(a0)];
      const u = norm([-Math.sin(a0) * c[0], -Math.sin(a0) * c[1], 1 - Math.sin(a0) * c[2]]), r = cross(c, u);
      return { c, u, r, s: 175 / (2 * Math.tan(a0 / 2)) };
    }
    const proj2 = (B, p) => { const d = dot(p, B.c); if (d < -0.3) return null; const k = 2 / (1 + d); return { x: 400 + B.s * k * dot(p, B.r), y: 236 - B.s * k * dot(p, B.u), up: p[2] }; };
    const dir = (ra, de, tau) => enu(lst(tau) - ra * 15, de, place.lat);
    const sR = (m) => clamp(3.4 - 0.62 * m, 0.9, 5.4);
    const above = (id) => CONS[id].stars.some((s) => dir(ST[s][0], ST[s][1], S.tau)[2] > 0);
    return {
      title: T2('Stars and constellations', 'तारे और तारामंडल'),
      hint: T2('Move the time and watch the sky turn. Tap a star pattern to find it.', 'समय बदलो और आकाश को घूमते देखो। किसी तारा-आकृति को खोजने के लिए उसे टैप करो।'),
      aria: T2('The night sky as seen from the chosen city, with the real stars in their real places.', 'चुने हुए शहर से दिखता रात का आकाश, असली तारे अपनी असली जगहों पर।'),
      svb: '0 0 240 170',
      vbN: '170 50 460 395',
      sliders: [{ key: 'slider', min: 18, max: 30, step: 0.1, time: true, label: T2('Time tonight', 'आज रात का समय'), get: () => f(S.tau), set: (v) => { S.tau = v; }, out: () => clock(S.tau) }],
      playLabel: T2('Play the night', 'रात चलाओ'),
      buttons: () => [
        { key: 'view:north', label: T2('Look north', 'उत्तर की ओर देखो'), pressed: S.view === 'north' },
        { key: 'view:south', label: T2('Look south', 'दक्षिण की ओर देखो'), pressed: S.view === 'south' },
      ].concat(CONS_IDS.map((id) => ({ key: 'const:' + id, label: CONS[id].n, pressed: S.pick === id }))),
      toggles: ['lines', 'labels', 'trails'],
      tick(dt) { S.tau += dt * 0.9; if (S.tau > 30) S.tau = 18; },
      act(key) {
        if (key.startsWith('view:')) { S.view = key.slice(5); X.api.emit(key); X.api.record(t(key === 'view:north' ? T2('Looked north', 'उत्तर की ओर देखा') : T2('Looked south', 'दक्षिण की ओर देखा'))); }
        if (key.startsWith('const:')) {
          const id = key.slice(6); S.pick = id; X.api.emit('picked:' + id); X.api.speak(t(CONS[id].n)); X.api.record(t(T2('Looked for ', 'खोजा: ')) + t(CONS[id].n));
          const north = ['great-bear', 'little-bear', 'cassiopeia', 'pole-star'].includes(id);
          if (north && S.view !== 'north') { S.view = 'north'; X.api.emit('view:north'); }
          if (!north && S.view !== 'south') { S.view = 'south'; X.api.emit('view:south'); }
        }
      },
      scene() {
        const B = basis(), F = X.F();
        let o = '';
        faint.forEach(([ra, de, k]) => { const q = proj2(B, dir(ra, de, S.tau)); if (q && q.up > 0) o += `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(0.5 + k * 0.6)}" fill="#fff" opacity="${f(0.2 + k * 0.35)}"/>`; });
        const P2 = {};
        Object.keys(ST).forEach((id) => { const s = ST[id], q = proj2(B, dir(s[0], s[1], S.tau)); if (q) P2[id] = q; });
        if (S.tg.trails) NAMED.forEach((id) => {
          let d = '', pen = false;
          for (let x = 18; x <= S.tau + 0.001; x += 0.2) { const q = proj2(B, dir(ST[id][0], ST[id][1], x)); if (q && q.up > -0.05) { d += (pen ? 'L' : 'M') + f(q.x) + ' ' + f(q.y); pen = true; } else pen = false; }
          if (d) o += `<path d="${d}" fill="none" stroke="#BFD4FF" stroke-opacity=".35" stroke-width="1.5"/>`;
        });
        if (S.tg.lines) CONS_IDS.forEach((cid) => CONS[cid].lines.forEach(([a, b]) => { const p = P2[a], q = P2[b]; if (p && q && p.up > -0.02 && q.up > -0.02) o += `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}" stroke="${S.pick === cid ? '#FFD23F' : '#8EA9FF'}" stroke-opacity="${S.pick === cid ? 0.85 : 0.45}" stroke-width="${S.pick === cid ? 2 : 1.3}"/>`; }));
        if ((S.pick === 'great-bear' || S.pick === 'pole-star') && P2.merak && P2.polaris && P2.merak.up > 0) o += `<line x1="${f(P2.merak.x)}" y1="${f(P2.merak.y)}" x2="${f(P2.polaris.x)}" y2="${f(P2.polaris.y)}" stroke="#FFD23F" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="4 6"/>`;
        Object.keys(P2).forEach((id) => {
          const q = P2[id], s = ST[id]; if (q.up < 0) return;
          const r = sR(s[2]) * (X.narrow() ? 1.35 : 1), col = s[3] || '#FFFFFF', on = CONS[S.pick].stars.includes(id);
          if (s[2] < 1.6 || on) o += `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(r * (on ? 3.4 : 2.6))}" fill="${on ? '#FFD23F' : col}" opacity="${on ? 0.22 : 0.16}"/>`;
          o += `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(r)}" fill="${col}"/>`;
          if (S.tg.labels && STAR_NAMES[id] && (s[2] < 1.2 || id === 'polaris' || (on && CONS[S.pick].stars.length > 1)) && !(X.narrow() && !on && id !== 'polaris')) o += X.txt(q.x + 7, q.y - 7, STAR_NAMES[id], { size: 11.5, anchor: 'start', fill: on ? '#FFE9A8' : '#C9D5F5' });
        });
        if (S.tg.labels) CONS_IDS.forEach((cid) => {
          const c = CONS[cid]; if (c.stars.length < 2) return;
          const qs = c.stars.map((s) => P2[s]).filter((q) => q && q.up > 0); if (qs.length < c.stars.length / 2) return;
          const x = qs.reduce((a, q) => a + q.x, 0) / qs.length, y = cid === 'pleiades' ? Math.min(...qs.map((q) => q.y)) - 12 : Math.max(...qs.map((q) => q.y)) + 22;
          o += X.txt(x, y, c.n, { size: 13, fill: S.pick === cid ? '#FFD23F' : '#9FB6FF' });
        });
        let hz = '';
        const az0 = S.view === 'north' ? 0 : 180;
        for (let a = -120; a <= 120; a += 3) { const q = proj2(B, [Math.sin((az0 + a) * RAD), Math.cos((az0 + a) * RAD), 0]); if (q) hz += (hz ? 'L' : 'M') + f(q.x) + ' ' + f(q.y); }
        o += `<defs><linearGradient id="${X.P}gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14304A"/><stop offset="1" stop-color="#050C16"/></linearGradient></defs>`;
        o += `<path d="${hz}L1200 1200L-400 1200Z" fill="url(#${X.P}gr)"/><path d="${hz}" fill="none" stroke="#3E6E8E" stroke-width="2"/>`;
        const dirs = S.view === 'north' ? [[-90, T2('W', 'प')], [-45, T2('NW', 'उप')], [0, T2('N', 'उ')], [45, T2('NE', 'उपू')], [90, T2('E', 'पू')]] : [[-90, T2('E', 'पू')], [-45, T2('SE', 'दपू')], [0, T2('S', 'द')], [45, T2('SW', 'दप')], [90, T2('W', 'प')]];
        dirs.forEach(([a, w]) => { const q = proj2(B, [Math.sin((az0 + a) * RAD), Math.cos((az0 + a) * RAD), 0]); if (q && q.x > 10 && q.x < 790) o += X.txt(q.x, Math.min(452, q.y + 22 * F), w, { size: 15, fill: '#FFD23F' }); });
        return o;
      },
      side() {
        const c = CONS[S.pick];
        let o = `<rect width="240" height="170" rx="12" fill="#070C24"/>`;
        const ra0 = c.stars.reduce((a, s) => a + ST[s][0], 0) / c.stars.length, de0 = c.stars.reduce((a, s) => a + ST[s][1], 0) / c.stars.length;
        const pts = c.stars.map((s) => { const dra = wrap180((ST[s][0] - ra0) * 15); return [-dra * Math.cos(ST[s][1] * RAD), ST[s][1] - de0, s]; });
        const span = Math.max(4, ...pts.map((p) => Math.abs(p[0])), ...pts.map((p) => Math.abs(p[1]) * 1.4));
        const k = c.stars.length === 1 ? 0 : 92 / span, mp = {};
        pts.forEach(([x, y, s]) => { mp[s] = [120 + x * k, 85 - y * k]; });
        c.lines.forEach(([a, b]) => { o += `<line x1="${f(mp[a][0])}" y1="${f(mp[a][1])}" x2="${f(mp[b][0])}" y2="${f(mp[b][1])}" stroke="#FFD23F" stroke-opacity=".7" stroke-width="1.6"/>`; });
        pts.forEach(([, , s]) => { const r = sR(ST[s][2]) * (c.stars.length === 1 ? 2.4 : 1.25); o += `<circle cx="${f(mp[s][0])}" cy="${f(mp[s][1])}" r="${f(r * 2.4)}" fill="${ST[s][3] || '#fff'}" opacity=".18"/><circle cx="${f(mp[s][0])}" cy="${f(mp[s][1])}" r="${f(r)}" fill="${ST[s][3] || '#fff'}"/>`; });
        return o;
      },
      info() {
        const c = CONS[S.pick], up = above(S.pick);
        return {
          big: t(c.n),
          facts: [
            [T2('Now', 'अभी'), up ? T2('above the horizon', 'क्षितिज के ऊपर') : T2('below the horizon: try another time', 'क्षितिज के नीचे: कोई और समय आज़माओ')],
            [T2('Time and date', 'समय और तारीख़'), `${t(clock(S.tau))}, ${t(dateOf(S.N + (S.tau >= 24 ? 1 : 0)))}`],
            [T2('Seen from', 'कहाँ से'), `${t(place.n)} (${nf(place.lat, 1)}° ${t(T2('N', 'उ'))})`],
            [T2('Pole Star height', 'ध्रुव तारे की ऊँचाई'), `${nf(place.lat, 0)}° ${t(T2('above the north horizon', 'उत्तरी क्षितिज से ऊपर'))}`],
            [T2('How to find it', 'कैसे खोजें'), c.find],
          ],
          note: c.fact,
        };
      },
    };
  };

  // ---------------------------------------------------------------- Kepler's laws
  MODE.orbits = (X) => {
    const { S, t } = X;
    S.a = 1.5; S.e = 0.5; S.pick = null; S.years = 0;
    S.M = X.cfg.startDay != null ? mod((TAU * X.cfg.startDay) / (365.25 * Math.pow(S.a, 1.5)), TAU) : 0;
    const aFromX = (x) => 0.3 * Math.pow(100, x / 100), xFromA = (a) => (100 * Math.log(a / 0.3)) / Math.log(100);
    const geo = () => {
      const a = S.a, e = S.e, b = a * Math.sqrt(1 - e * e), s = Math.min(680 / (2 * a), 360 / (2 * b));
      return { a, e, b, s, Sx: 400 - s * a * e, Sy: 236 };
    };
    const at = (G, M) => { const E = kepler(mod(M, TAU), G.e); return { x: G.Sx - G.s * G.a * (Math.cos(E) - G.e), y: G.Sy + G.s * G.b * Math.sin(E), E, r: G.a * (1 - G.e * Math.cos(E)) }; };
    const vel = (r) => 29.78 * Math.sqrt(Math.max(0, 2 / r - 1 / S.a));
    const period = () => Math.pow(S.a, 1.5);
    const col = () => (S.pick ? ORB[S.pick].col : '#FF7A1A');
    let lastM = S.M;
    return {
      title: T2('Orbits and Kepler\'s laws', 'कक्षाएँ और केप्लर के नियम'),
      hint: T2('Change the shape and size of the orbit and watch the speed.', 'कक्षा का आकार और माप बदलो और चाल देखो।'),
      aria: T2('A planet going round the Sun on an ellipse, with the Sun at one focus.', 'दीर्घवृत्त पर सूरज का चक्कर लगाता ग्रह, सूरज एक नाभि पर।'),
      svb: '0 0 260 120',
      autoplay: true,
      pauseOnDrag: true,
      sliders: [
        { key: 'slider', min: 0, max: 0.97, step: 0.01, label: T2('Shape: how stretched (eccentricity e)', 'आकार: कितनी खिंची (उत्केंद्रता e)'), get: () => S.e, set: (v) => { S.e = v; S.pick = null; }, out: () => nf(S.e, 2) },
        { key: 'slider:size', min: 0, max: 100, step: 0.5, label: T2('Size: average distance (a)', 'माप: औसत दूरी (a)'), get: () => f(xFromA(S.a)), set: (v) => { S.a = aFromX(v); S.pick = null; }, out: () => `${nf(S.a, 2)} AU` },
      ],
      buttons: () => ORB_IDS.map((id) => ({ key: 'planet:' + id, label: ORB[id].n, pressed: S.pick === id, sw: ORB[id].col })),
      toggles: ['orbit', 'areas', 'labels'],
      tick(dt) { S.M += (dt * TAU) / 8; S.years += (dt * period()) / 8; },
      act(key) { if (key.startsWith('planet:')) { const id = key.slice(7); S.pick = id; S.a = ORB[id].a; S.e = ORB[id].e; S.M = 0; lastM = 0; X.api.emit('picked:' + id); X.api.record(t(T2('Chose ', 'चुना: ')) + t(ORB[id].n)); } },
      scene() {
        const G = geo(), p = at(G, S.M), cx = G.Sx + G.s * G.a * G.e;
        let o = '';
        if (S.tg.areas) for (let k = 0; k < 12; k++) {
          let d = `M${f(G.Sx)} ${f(G.Sy)}`;
          for (let j = 0; j <= 10; j++) { const q = at(G, ((k + j / 10) * TAU) / 12); d += `L${f(q.x)} ${f(q.y)}`; }
          o += `<path d="${d}Z" fill="${k % 2 ? '#14B8A6' : '#8B3DFF'}" opacity=".26"/>`;
        }
        if (S.tg.orbit) o += `<ellipse cx="${f(cx)}" cy="${G.Sy}" rx="${f(G.s * G.a)}" ry="${f(G.s * G.b)}" fill="none" stroke="#8EA9FF" stroke-opacity=".7" stroke-width="2"/>`;
        const pe = at(G, 0), ap = at(G, Math.PI);
        o += `<circle cx="${f(pe.x)}" cy="${f(pe.y)}" r="4" fill="#FFD23F"/><circle cx="${f(ap.x)}" cy="${f(ap.y)}" r="4" fill="#9FB6FF"/>`;
        if (S.tg.labels) {
          o += X.txt(pe.x, pe.y - 14, T2('closest', 'सबसे पास'), { size: 13, fill: '#FFD23F' }) + X.txt(ap.x, ap.y - 14, T2('farthest', 'सबसे दूर'), { size: 13, fill: '#BFD0FF' });
          if (S.tg.areas) o += X.txt(400, 450, T2('Each coloured slice is swept in the same time, and all slices have the same area', 'हर रंगीन टुकड़ा बराबर समय में बनता है, और सबका क्षेत्रफल बराबर है'), { size: 13, fill: '#C9D5F5' });
        }
        o += X.sun(G.Sx, G.Sy, 16);
        const E = p.E, tx = G.s * G.a * Math.sin(E), ty = G.s * G.b * Math.cos(E), tl = Math.hypot(tx, ty) || 1, v = vel(p.r), vmax = vel(G.a * (1 - G.e)), L2 = 26 + (70 * v) / (vmax || 1);
        o += `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(p.x + (tx / tl) * L2)}" y2="${f(p.y + (ty / tl) * L2)}" stroke="#FFD23F" stroke-width="3" marker-end="url(#${X.P}arrY)"/>`;
        o += `<line x1="${f(G.Sx)}" y1="${f(G.Sy)}" x2="${f(p.x)}" y2="${f(p.y)}" stroke="#fff" stroke-opacity=".35" stroke-dasharray="3 5"/>`;
        o += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="11" fill="${col()}" stroke="#fff" stroke-width="2"/>`;
        if (S.tg.labels) o += X.txt(p.x, p.y + 28, S.pick ? ORB[S.pick].n : T2('Planet', 'ग्रह'), { size: 13 });
        return o;
      },
      handles() { const p = at(geo(), S.M); return [{ key: 'drag:planet', x: p.x, y: p.y, r: 24, label: T2('The planet: drag it along its orbit, or use the arrow keys', 'ग्रह: इसे कक्षा पर खींचो, या तीर वाली कुंजियाँ दबाओ') }]; },
      drag(k, q) { const G = geo(); const cE = G.e - (q.x - G.Sx) / (G.s * G.a), sE = (q.y - G.Sy) / (G.s * G.b), E = Math.atan2(sE, cE); S.M = mod(E - G.e * Math.sin(E), TAU); lastM = S.M; },
      step(k, d) { S.M = mod(S.M + (d * TAU) / 24, TAU); lastM = S.M; },
      side() {
        const T = period(), a3 = Math.pow(S.a, 3);
        let o = `<rect width="260" height="120" rx="12" fill="#070C24"/>`;
        o += X.txt(130, 30, T2('Kepler\'s third law: T² = a³', 'केप्लर का तीसरा नियम: T² = a³'), { size: 14, fixed: true, fill: '#FFD23F' });
        o += X.txt(130, 64, `T² = ${nf(T, 2)}² = ${nf(T * T, 2)}`, { size: 15, fixed: true, fill: '#fff' });
        o += X.txt(130, 92, `a³ = ${nf(S.a, 2)}³ = ${nf(a3, 2)}`, { size: 15, fixed: true, fill: '#fff' });
        o += X.txt(130, 112, T2('(T in years, a in AU)', '(T वर्षों में, a AU में)'), { size: 11, fixed: true, fill: '#9FB6FF' });
        return o;
      },
      info() {
        const G = geo(), p = at(G, S.M), T = period();
        return {
          big: t(S.pick ? ORB[S.pick].n : T2('Your planet', 'तुम्हारा ग्रह')),
          facts: [
            [T2('Distance from the Sun now', 'अभी सूरज से दूरी'), `${nf(p.r, 2)} AU (${nf(p.r * 149.6, 0)} ${t(T2('million km', 'मिलियन किमी'))})`],
            [T2('Speed now', 'अभी की चाल'), `${nf(vel(p.r), 1)} km/s`],
            [T2('Closest / farthest', 'सबसे पास / सबसे दूर'), `${nf(S.a * (1 - S.e), 2)} / ${nf(S.a * (1 + S.e), 2)} AU`],
            [T2('Fastest ÷ slowest speed', 'सबसे तेज़ ÷ सबसे धीमी चाल'), nf((1 + S.e) / (1 - S.e), 2)],
            [T2('Time for one orbit (T)', 'एक चक्कर का समय (T)'), T < 2 ? `${nf(T * 365.25, 0)} ${t(T2('days', 'दिन'))}` : `${nf(T, 1)} ${t(T2('years', 'वर्ष'))}`],
            [T2('Time passed', 'बीता समय'), `${nf(S.years, 1)} ${t(T2('years', 'वर्ष'))}`],
          ],
          note: T2('The Sun\'s gravity keeps the planet on an ellipse with the Sun at one focus. Close to the Sun the planet moves fastest; far away it moves slowest. 1 AU is the Earth\'s average distance from the Sun.', 'सूरज का गुरुत्व ग्रह को दीर्घवृत्त पर रखता है, जिसकी एक नाभि पर सूरज है। सूरज के पास ग्रह सबसे तेज़ चलता है; दूर सबसे धीमा। 1 AU पृथ्वी की सूरज से औसत दूरी है।'),
        };
      },
      track() {
        const a = mod(lastM, TAU), b = S.M - lastM;
        if (b > 0 && b < Math.PI) {
          if (a + b >= TAU) { X.api.emit('orbit'); X.api.emit('perihelion'); X.api.record(t(T2('Went once round the Sun', 'सूरज का एक चक्कर पूरा किया'))); }
          if (a < Math.PI && a + b >= Math.PI) X.api.emit('aphelion');
        }
        S.M = mod(S.M, TAU); lastM = S.M;
      },
    };
  };

  // ---------------------------------------------------------------- Earth satellites
  MODE.satellite = (X) => {
    const { S, t } = X;
    S.h = 420; S.pick = 'iss'; S.sat = 1.2; S.earth = 1.2; S.min = 0;
    const C = { x: 400, y: 232 }, PX = 210 / (RE + H_MAX), ER = RE * PX;
    const xFromH = (h) => (1000 * Math.log(h / H_MIN)) / Math.log(H_MAX / H_MIN), hFromX = (x) => H_MIN * Math.pow(H_MAX / H_MIN, x / 1000);
    const near = (h, g) => Math.abs(h - g) / g < 0.025;
    const hr = () => (S.h < 1000 ? Math.round(S.h / 10) * 10 : Math.round(S.h / 100) * 100);
    const shown = () => (near(S.h, 35786) ? 35786 : hr());
    const pTxt = (m) => (m < 120 ? { en: `${nf(m)} min`, hi: `${nf(m)} मिनट` } : dur(m / 60));
    return {
      title: T2('Satellites round the Earth', 'पृथ्वी के उपग्रह'),
      hint: T2('Change the height. Higher satellites go slower and take longer.', 'ऊँचाई बदलो। ऊँचे उपग्रह धीमे चलते हैं और ज़्यादा समय लेते हैं।'),
      aria: T2('The Earth from above the North Pole and a satellite going round it, drawn to scale.', 'उत्तरी ध्रुव के ऊपर से पृथ्वी और उसका चक्कर लगाता उपग्रह, सही अनुपात में।'),
      svb: '0 0 260 170',
      vbN: '170 14 460 432',
      autoplay: true,
      sliders: [{ key: 'slider', min: 0, max: 1000, step: 1, label: T2('Height above the ground', 'ज़मीन से ऊँचाई'), get: () => Math.round(xFromH(S.h)), set: (v) => { S.h = hFromX(v); S.pick = null; }, out: () => `${nf(shown())} km`, snap: () => { if (near(S.h, 35786)) S.h = 35786; } }],
      buttons: () => SAT_IDS.map((id) => ({ key: 'sat:' + id, label: SATS[id].n, pressed: S.pick === id })),
      toggles: ['labels'],
      tick(dt) {
        const m = dt * 30;
        S.min += m;
        S.sat += (TAU * m) / satT(S.h);
        S.earth += (TAU * m) / SIDEREAL_MIN;
      },
      act(key) { if (key.startsWith('sat:')) { const id = key.slice(4); S.pick = id; S.h = SATS[id].h; if (id === 'geo') S.sat = S.earth; X.api.emit('picked:' + id); X.api.record(t(T2('Chose ', 'चुना: ')) + t(SATS[id].n)); } },
      scene() {
        const r = (RE + S.h) * PX;
        let o = X.sun(-36, C.y, 50);
        o += X.txt(20, 30, T2('Sunlight', 'धूप'), { anchor: 'start', fill: '#FFD23F', size: 14 });
        if (S.tg.labels) SAT_IDS.forEach((id) => { const rr = (RE + SATS[id].h) * PX; o += `<circle cx="${C.x}" cy="${C.y}" r="${f(rr)}" fill="none" stroke="#8EA9FF" stroke-opacity=".22" stroke-dasharray="2 5"/>`; if (id !== 'iss') o += X.txt(C.x + rr * 0.72, C.y - rr * 0.72, SATS[id].n.en.split(' (')[0] === 'Navigation satellite' ? T2('GPS', 'GPS') : T2('Geostationary', 'भूस्थिर'), { size: 12, fill: '#9FB6FF' }); });
        o += `<circle cx="${C.x}" cy="${C.y}" r="${f(r)}" fill="none" stroke="#FFD23F" stroke-opacity=".75" stroke-width="2" stroke-dasharray="6 5"/>`;
        o += X.ball(C.x, C.y, ER, `url(#${X.P}ocean)`, Math.PI / 2, 180, '#0D1B44');
        const ia = S.earth, ix = C.x + ER * 0.92 * Math.cos(ia), iy = C.y - ER * 0.92 * Math.sin(ia);
        o += `<circle cx="${f(ix)}" cy="${f(iy)}" r="4" fill="#FF7A1A" stroke="#fff" stroke-width="1.5"/>`;
        if (S.tg.labels) o += X.txt(ix, iy - 9, T2('India', 'भारत'), { size: 11.5, fill: '#FFE1C2' });
        const sx = C.x + r * Math.cos(S.sat), sy = C.y - r * Math.sin(S.sat), rot = -S.sat * DEG;
        o += `<g transform="translate(${f(sx)} ${f(sy)}) rotate(${f(rot)}) scale(.6)"><rect x="-4" y="-16" width="8" height="10" fill="#4A7BD8" stroke="#BFD4FF"/><rect x="-4" y="6" width="8" height="10" fill="#4A7BD8" stroke="#BFD4FF"/><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#E8EDF8"/><circle r="2.5" fill="#FFD23F"/></g>`;
        o += `<circle cx="${f(sx)}" cy="${f(sy)}" r="12" fill="#FFD23F" opacity=".16" class="sk-pulse"/>`;
        o += X.txt(400, 440, T2('Drawn to scale. Time runs 1,800 times faster than real.', 'सही अनुपात में बना है। समय असली से 1,800 गुना तेज़ चलता है।'), { size: 12, fill: '#9FB6FF' });
        return o;
      },
      side() {
        const x = (h) => 36 + (h / H_MAX) * 210, y = (v) => 140 - (v / 8) * 118;
        let d = '';
        for (let h = 0; h <= H_MAX; h += 500) d += (h ? 'L' : 'M') + f(x(h)) + ' ' + f(y(satV(h)));
        let o = `<rect width="260" height="170" rx="12" fill="#070C24"/><line x1="36" y1="140" x2="250" y2="140" stroke="#9FB6FF" stroke-opacity=".5"/><line x1="36" y1="18" x2="36" y2="140" stroke="#9FB6FF" stroke-opacity=".5"/>`;
        [0, 2, 4, 6, 8].forEach((v) => { o += X.txt(28, y(v) + 4, String(v), { size: 10, fixed: true, anchor: 'end', fill: '#9FB6FF' }); });
        [0, 10, 20, 30, 40].forEach((k) => { o += X.txt(x(k * 1000), 154, String(k), { size: 10, fixed: true, fill: '#9FB6FF' }); });
        o += `<path d="${d}" fill="none" stroke="#14B8A6" stroke-width="2.5"/>`;
        o += `<circle cx="${f(x(S.h))}" cy="${f(y(satV(S.h)))}" r="6" fill="#FFD23F" stroke="#fff" stroke-width="2"/>`;
        o += X.txt(150, 14, T2('speed (km/s) and height (thousand km)', 'चाल (किमी/से) और ऊँचाई (हज़ार किमी)'), { size: 10.5, fixed: true, fill: '#C9D5F5' });
        return o;
      },
      info() {
        const v = satV(S.h), T = satT(S.h), g = 9.81 * Math.pow(RE / (RE + S.h), 2), geo = near(S.h, 35786);
        return {
          big: t(S.pick ? SATS[S.pick].n : geo ? T2('Geostationary orbit', 'भूस्थिर कक्षा') : T2('Your satellite', 'तुम्हारा उपग्रह')),
          facts: [
            [T2('Height', 'ऊँचाई'), `${nf(shown())} km`],
            [T2('Speed', 'चाल'), `${nf(v, 2)} km/s (${nf(v * 3600)} km/h)`],
            [T2('Time for one orbit', 'एक चक्कर का समय'), pTxt(T)],
            [T2('Orbits in one day', 'एक दिन में चक्कर'), nf(1440 / T, 1)],
            [T2('Gravity there', 'वहाँ गुरुत्व'), `${nf(g, 2)} m/s² (${nf((g / 9.81) * 100)}%)`],
          ],
          note: geo ? SATS.geo.note : S.pick ? SATS[S.pick].note : T2('Gravity pulls the satellite towards the Earth; its sideways speed keeps it falling round the Earth instead of into it. Higher up, gravity is weaker, so it needs less speed. To escape the Earth completely takes 11.2 km/s.', 'गुरुत्व उपग्रह को पृथ्वी की ओर खींचता है; उसकी बगल की चाल उसे पृथ्वी पर गिरने की बजाय उसके चारों ओर "गिरते" रहने देती है। ऊपर गुरुत्व कम होता है, इसलिए कम चाल चाहिए। पृथ्वी से पूरी तरह छूटने के लिए 11.2 किमी/से चाहिए।'),
        };
      },
      track() {
        X.track('geo', near(S.h, 35786), near(S.h, 35786) ? 'geostationary' : null, near(S.h, 35786) ? T2('Reached geostationary height', 'भूस्थिर ऊँचाई पर पहुँचे') : null);
        X.track('lap', Math.floor(S.sat / TAU), 'orbit', null);
      },
    };
  };

  // ---------------------------------------------------------------- registration
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (!['mode', 'startDay', 'place'].includes(k)) e.push('unknown key: ' + k + ' (use mode, startDay, place)'); });
    if (!MODES.includes(c.mode)) { e.push('mode must be one of: ' + MODES.join(', ')); return e; }
    if (c.startDay != null) {
      const r = DAYRANGE[c.mode];
      if (typeof c.startDay !== 'number' || !isFinite(c.startDay)) e.push('startDay must be a number');
      else if (c.startDay < r[0] || c.startDay > r[1]) e.push(`startDay in ${c.mode} is the ${r[2]}: ${r[0]} to ${r[1]}`);
    }
    if (c.place != null) {
      if (!PLACES[c.place]) e.push('unknown place: ' + c.place + ' (use ' + Object.keys(PLACES).join(', ') + ')');
      else if (!PLACED.includes(c.mode)) e.push('place is used only in ' + PLACED.join(', '));
    }
    return e;
  }
  function keys(c) {
    const m = c && MODES.includes(c.mode) ? c.mode : 'moon-phases';
    const T = ['slider', 'play'], E = ['play', 'moved'];
    const tog = (...a) => a.forEach((k) => { T.push('toggle:' + k); E.push('toggled:' + k); });
    const phases = PHASES.map((p) => 'phase:' + p.key);
    if (m === 'moon-phases') { T.push('drag:moon'); tog('labels', '3d'); E.push(...phases); }
    if (m === 'day-night') { T.push('drag:earth'); tog('labels', '3d'); E.push('phase:day', 'phase:night', 'phase:sunrise', 'phase:sunset', 'phase:noon', 'phase:midnight'); }
    if (m === 'seasons') { T.push('drag:earth'); tog('tilt', 'orbit', 'labels', '3d'); E.push(...Object.keys(SEASONS).map((s) => 'season:' + s), ...KEYDAYS.map((k) => 'season:' + k.key)); }
    if (m === 'eclipse') { T.push('drag:moon', 'month:eclipse', 'month:ordinary'); tog('labels'); E.push('eclipse:solar', 'eclipse:lunar', 'eclipse:none', 'month:eclipse', 'month:ordinary', ...phases); }
    if (m === 'solar-system') { T.push(...PLANETS.map((p) => 'planet:' + p.id)); tog('orbit', 'labels', 'scale'); E.push(...PLANETS.map((p) => 'picked:' + p.id), 'orbit'); }
    if (m === 'constellations') { T.push('view:north', 'view:south', ...CONS_IDS.map((k) => 'const:' + k)); tog('lines', 'labels', 'trails'); E.push('view:north', 'view:south', ...CONS_IDS.map((k) => 'picked:' + k)); }
    if (m === 'orbits') { T.push('slider:size', 'drag:planet', ...ORB_IDS.map((k) => 'planet:' + k)); tog('orbit', 'areas', 'labels'); E.push(...ORB_IDS.map((k) => 'picked:' + k), 'orbit', 'perihelion', 'aphelion'); }
    if (m === 'satellite') { T.push(...SAT_IDS.map((k) => 'sat:' + k)); tog('labels'); E.push(...SAT_IDS.map((k) => 'picked:' + k), 'orbit', 'geostationary'); }
    return { targets: T, events: E };
  }

  NCA_T.register({
    id: 'sky',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'seasons', startDay: 172, place: 'delhi' },
    modes: MODES,
    places: Object.keys(PLACES),
    // Pure astronomy, for tests under Node.
    model: { phaseOf, tithiOf, declination, dayHours, noonAlt, sunAltAz, sunDistMkm, satV, satT, kepler, enu, PLANETS, ST, CONS },
    mount(root, config, api) { return sky(root, config, api); },
  });
})();
