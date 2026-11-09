// Template: Waves and sound. Make waves and sounds and see the physics behind them: a vibrating tuning fork sending
// compressions and rarefactions through air, water or steel (and nothing through a vacuum); a stretched string
// (pluck it, or drive it to find its natural frequencies); an air column, open or closed at one end, driven by a
// speaker until it resonates; an echo off a cliff, the sea bed (SONAR) or the end of a steel rail, with the 0.1 s
// rule; a mass on a spring; a simple pendulum on Earth, the Moon, Mars or Jupiter; uniform circular motion and SHM;
// Young's double slit; single-slit diffraction; and the electromagnetic and sound spectra.
// Every number comes from the real formula: v = fλ with the speed of sound in each medium (25 °C), fₙ = (n/2L)√(T/μ),
// open pipe fₙ = nv/2L, closed pipe fₙ = (2n−1)v/4L, echo t = 2d/v, T = 2π√(m/k), the pendulum solved exactly
// (so large swings are slightly slower than 2π√(l/g)), fringe width β = λD/d, central maximum 2λD/a, c = fλ.
// Fast vibrations are shown slowed down, and the picture says by how much. Sound plays through Web Audio only after a
// tap on the sound button, at a safe low volume. Config:
//   { mode: 'vibrate'|'string'|'pipe'|'echo'|'spring'|'pendulum'|'shm'|'interference'|'diffraction'|'spectrum',
//     medium?: 'air'|'water'|'steel'   (vibrate and echo: the starting medium; pipe: air only; spectrum: giving a
//                                       medium opens the sound spectrum in that medium, without it the EM spectrum),
//     play_sound?: boolean              (sound modes only: the sound button starts switched on) }
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp, lerp, mixHex } = L;
  const reduced = L.reducedMotion;
  const PI = Math.PI, TAU = 2 * PI;
  const T = (en, hi) => ({ en, hi });

  const MODES = ['vibrate', 'string', 'pipe', 'echo', 'spring', 'pendulum', 'shm', 'interference', 'diffraction', 'spectrum'];
  const SOUND_MODES = ['vibrate', 'string', 'pipe', 'echo', 'spectrum'];
  const MEDIUM_MODES = ['vibrate', 'echo', 'pipe', 'spectrum'];
  const CFG_KEYS = ['mode', 'medium', 'play_sound'];
  // Speed of sound at 25 °C (m/s).
  const MED = {
    air: { v: 346, n: T('Air', 'वायु'), at: T('air, 25 °C', 'वायु, 25 °C'), scale: 100, bar: 1, tint: '#E0F2FE', dot: ['#93C5FD', '#1D4ED8'] },
    water: { v: 1498, n: T('Water', 'पानी'), at: T('water, 25 °C', 'पानी, 25 °C'), scale: 40, bar: 2, tint: '#BFDBFE', dot: ['#7DD3FC', '#0C4A6E'] },
    steel: { v: 5960, n: T('Steel', 'स्टील'), at: T('steel', 'स्टील'), scale: 10, bar: 5, tint: '#E2E8F0', dot: ['#94A3B8', '#1E293B'] },
    vacuum: { v: 0, n: T('Vacuum', 'निर्वात'), at: T('vacuum', 'निर्वात'), scale: 100, bar: 1, tint: '#F8FAFC', dot: ['#CBD5E1', '#CBD5E1'] },
  };
  const MU = 0.005;            // string: mass per unit length, kg/m (a steel sonometer wire)
  const C = 3e8;               // speed of light, m/s
  const PLANET = {
    earth: { g: 9.8, n: T('Earth', 'पृथ्वी'), sky: ['#7DD3FC', '#E0F2FE'], ground: '#4ADE80', ink: '#0F172A' },
    moon: { g: 1.62, n: T('Moon', 'चंद्रमा'), sky: ['#0B1026', '#26304F'], ground: '#9CA3AF', ink: '#F1F5F9' },
    mars: { g: 3.71, n: T('Mars', 'मंगल'), sky: ['#F59E0B', '#FDE7C8'], ground: '#C2410C', ink: '#1E293B' },
    jupiter: { g: 24.79, n: T('Jupiter', 'बृहस्पति'), sky: ['#B45309', '#FDE68A'], ground: '#92400E', ink: '#1E293B' },
  };
  const SAFE = 0.07;           // the loudest any sound may be (Web Audio gain)

  const W = {
    play: T('Start', 'शुरू करो'), stop: T('Stop', 'रोको'), soundOn: T('Sound on', 'आवाज़ चालू'), soundOff: T('Sound off', 'आवाज़ बंद'),
    slowed: (n) => T(`Slowed down ${n}×`, `${n} गुना धीमा`), notScale: T('Picture not to scale', 'चित्र पैमाने पर नहीं'),
    readings: T('Readings', 'माप'), scene: T('Wave scene', 'तरंग का दृश्य'), controls: T('Controls', 'नियंत्रण'),
    medium: T('Medium', 'माध्यम'), freq: T('Frequency', 'आवृत्ति'), wl: T('Wavelength', 'तरंगदैर्ध्य'), speed: T('Wave speed', 'तरंग की चाल'),
    period: T('Time period', 'आवर्तकाल'), loud: T('Loudness', 'प्रबलता'), length: T('Length', 'लंबाई'), tension: T('Tension', 'तनाव'),
    f1: T('Lowest note f₁', 'सबसे नीचा स्वर f₁'), drive: T('Vibrator', 'कंपित्र'), loops: T('Loops', 'लूप'), dist: T('Distance', 'दूरी'),
    time: T('Time', 'समय'), echoT: T('Echo after', 'प्रतिध्वनि'), mass: T('Mass', 'द्रव्यमान'), k: T('Spring constant', 'स्प्रिंग नियतांक'),
    measured: T('Measured', 'मापा गया'), formula: T('Formula', 'सूत्र'), swings: T('Oscillations', 'दोलन'), gravity: T('Gravity g', 'गुरुत्व g'),
    disp: T('Displacement x', 'विस्थापन x'), vel: T('Velocity v', 'वेग v'), acc: T('Acceleration a', 'त्वरण a'), phase: T('Angle ωt', 'कोण ωt'),
    colour: T('Colour', 'रंग'), slits: T('Slit gap d', 'झिरियों की दूरी d'), screenD: T('Screen distance D', 'पर्दे की दूरी D'),
    fringe: T('Fringe width β', 'फ्रिंज चौड़ाई β'), slitW: T('Slit width a', 'झिरी की चौड़ाई a'), central: T('Central band', 'केंद्रीय पट्टी'),
    band: T('Band', 'पट्टी'), screen: T('On the screen (real size)', 'पर्दे पर (असली माप)'), heard: T('heard!', 'सुनाई दी!'), noSound: T('no sound', 'कोई ध्वनि नहीं'),
    compress: T('C = compression', 'C = संपीडन'), rare: T('R = rarefaction', 'R = विरलन'), pressure: T('pressure', 'दाब'), distance: T('distance →', 'दूरी →'),
    node: T('N = node', 'N = निस्पंद'), anti: T('A = antinode', 'A = प्रस्पंद'), natural: T('Natural frequencies', 'प्राकृतिक आवृत्तियाँ'),
    open: T('Open at both ends', 'दोनों सिरे खुले'), closed: T('Closed at one end', 'एक सिरा बंद'), vacuumJar: T('Air pumped out: vacuum', 'हवा निकाल दी: निर्वात'),
    equil: T('rest position', 'विराम स्थिति'), restoring: T('pull back F = −kx', 'वापसी बल F = −kx'), cycleDone: T('one full oscillation', 'एक पूरा दोलन'),
    holds: T('the ear holds a sound for 0.1 s', 'कान ध्वनि को 0.1 s तक रखता है'), clap: T('clap', 'ताली'), echo: T('echo', 'प्रतिध्वनि'),
    realTime: T('You hear real time', 'आवाज़ असली समय में'), human: T('humans hear', 'मनुष्य सुनते हैं'),
  };

  // ---------------------------------------------------------------- number formatting
  const num = (x, d = 2) => {
    if (!isFinite(x)) return '–';
    let s = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s.replace('-', '−');
  };
  const sig = (x, n = 3) => { if (!isFinite(x) || x === 0) return num(x); const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return num(x, Math.min(d, 6)); };
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x, n = 3) {
    if (!isFinite(x) || x === 0) return num(x);
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = x / Math.pow(10, e);
    if (Math.abs(m) >= 9.995) { m /= 10; e += 1; }
    if (e >= -2 && e <= 3) return sig(x, n);
    return `${num(m, n - 1)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
  }
  // Wavelengths (in m) in a sensible unit.
  function lenU(m) {
    const a = Math.abs(m);
    const U = [[1e3, 'km'], [1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm'], [1e-9, 'nm'], [1e-12, 'pm'], [1e-15, 'fm']];
    for (const [f, u] of U) if (a >= f * 0.9995) return a / f >= 1000 && f === 1e3 ? `${sci(m / f)} ${u}` : `${sig(m / f, 3)} ${u}`;
    return `${sci(m / 1e-15)} fm`;
  }
  function freqU(f) {
    const U = [[1e12, 'THz'], [1e9, 'GHz'], [1e6, 'MHz'], [1e3, 'kHz'], [1, 'Hz']];
    if (f >= 1e15) return `${sci(f)} Hz`;
    for (const [k, u] of U) if (f >= k * 0.9995) return `${sig(f / k, 3)} ${u}`;
    return `${sig(f, 2)} Hz`;
  }

  // ---------------------------------------------------------------- light colour from wavelength (nm)
  function wlRGB(w) {
    let r = 0, g = 0, b = 0;
    if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; }
    else if (w < 490) { g = (w - 440) / 50; b = 1; }
    else if (w < 510) { g = 1; b = -(w - 510) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; }
    else if (w < 645) { r = 1; g = -(w - 645) / 65; }
    else if (w <= 780) { r = 1; }
    const f = w < 420 ? 0.3 + 0.7 * (w - 380) / 40 : w > 700 ? 0.3 + 0.7 * (780 - w) / 80 : 1;
    return [r, g, b].map((c) => Math.round(255 * Math.pow(Math.max(0, c * f), 0.8)));
  }
  const rgbHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const COLNAME = [[450, T('violet', 'बैंगनी')], [495, T('blue', 'नीला')], [570, T('green', 'हरा')], [590, T('yellow', 'पीला')], [620, T('orange', 'नारंगी')], [800, T('red', 'लाल')]];
  const colName = (nm) => COLNAME.find(([lim]) => nm < lim)[1];

  // ---------------------------------------------------------------- spectra (NCERT Class 12 ranges; Class 9 sound ranges)
  const EM = [
    { id: 'radio', lo: 0, hi: 3e9, c: '#F97316', n: T('Radio waves', 'रेडियो तरंगें'), lam: T('longer than 0.1 m', '0.1 m से लंबी'), src: T('Charges moving up and down in an antenna', 'ऐंटेना में ऊपर-नीचे चलते आवेश'), use: T('Radio, TV broadcasts and mobile phones', 'रेडियो, टीवी प्रसारण और मोबाइल फ़ोन') },
    { id: 'micro', lo: 3e9, hi: 3e11, c: '#EAB308', n: T('Microwaves', 'सूक्ष्म तरंगें'), lam: T('0.1 m to 1 mm', '0.1 m से 1 mm'), src: T('Special vacuum tubes (klystron, magnetron)', 'विशेष निर्वात नलिकाएँ (क्लाइस्ट्रॉन, मैग्नेट्रॉन)'), use: T('Radar, microwave ovens, satellite links', 'रडार, माइक्रोवेव ओवन, उपग्रह संचार') },
    { id: 'ir', lo: 3e11, hi: C / 700e-9, c: '#DC2626', n: T('Infrared', 'अवरक्त'), lam: T('1 mm to 700 nm', '1 mm से 700 nm'), src: T('Hot bodies and vibrating molecules', 'गर्म वस्तुएँ और कंपन करते अणु'), use: T('TV remotes, warmth from the Sun, night-vision cameras', 'टीवी रिमोट, सूर्य की गर्माहट, रात में देखने वाले कैमरे') },
    { id: 'visible', lo: C / 700e-9, hi: C / 400e-9, c: '#22C55E', n: T('Visible light', 'दृश्य प्रकाश'), lam: T('700 nm to 400 nm', '700 nm से 400 nm'), src: T('The Sun, bulbs and other glowing hot things', 'सूर्य, बल्ब और दूसरी चमकती गर्म चीज़ें'), use: T('Seeing: the only band our eyes can detect', 'देखना: केवल इसी पट्टी को हमारी आँखें पहचानती हैं') },
    { id: 'uv', lo: C / 400e-9, hi: 3e17, c: '#8B3DFF', n: T('Ultraviolet', 'पराबैंगनी'), lam: T('400 nm to 1 nm', '400 nm से 1 nm'), src: T('The Sun and special lamps', 'सूर्य और विशेष लैंप'), use: T('Killing germs in water; the ozone layer stops most of it', 'पानी के कीटाणु मारना; ओज़ोन परत इसका अधिकांश भाग रोक लेती है') },
    { id: 'xray', lo: 3e17, hi: 3e20, c: '#2563EB', n: T('X-rays', 'एक्स-किरणें'), lam: T('1 nm to 0.001 nm', '1 nm से 0.001 nm'), src: T('Fast electrons hitting a metal target', 'धातु के लक्ष्य से टकराते तेज़ इलेक्ट्रॉन'), use: T('Seeing bones in hospitals', 'अस्पताल में हड्डियाँ देखना') },
    { id: 'gamma', lo: 3e20, hi: Infinity, c: '#0F766E', n: T('Gamma rays', 'गामा किरणें'), lam: T('shorter than 0.001 nm', '0.001 nm से छोटी'), src: T('Radioactive nuclei', 'रेडियोधर्मी नाभिक'), use: T('Treating cancer; keeping food fresh longer', 'कैंसर का इलाज; भोजन को अधिक समय तक ताज़ा रखना') },
  ];
  const SND = [
    { id: 'infrasound', lo: 0, hi: 20, c: '#8B3DFF', n: T('Infrasound', 'अवश्रव्य ध्वनि'), lam: T('below 20 Hz', '20 Hz से कम'), src: T('Earthquakes, elephants, whales, rhinos', 'भूकंप, हाथी, व्हेल, गैंडे'), use: T('Too low for us to hear', 'इतनी नीची कि हम सुन नहीं सकते') },
    { id: 'audible', lo: 20, hi: 20000, c: '#22C55E', n: T('Audible sound', 'श्रव्य ध्वनि'), lam: T('20 Hz to 20 kHz', '20 Hz से 20 kHz'), src: T('Voices, music, bells, drums', 'आवाज़ें, संगीत, घंटियाँ, ढोल'), use: T('The range a human ear can hear', 'मनुष्य का कान इतनी ही ध्वनि सुन सकता है') },
    { id: 'ultrasound', lo: 20000, hi: Infinity, c: '#2563EB', n: T('Ultrasound', 'पराश्रव्य ध्वनि'), lam: T('above 20 kHz', '20 kHz से अधिक'), src: T('Bats, dolphins, porpoises; special machines', 'चमगादड़, डॉल्फ़िन, पॉरपॉइज़; विशेष मशीनें'), use: T('SONAR, cleaning, and ultrasound scans of the body (1–10 MHz)', 'सोनार, सफ़ाई, और शरीर का अल्ट्रासाउंड स्कैन (1–10 MHz)') },
  ];
  const bandOf = (list, f) => list.find((b) => f >= b.lo && f < b.hi) || list[list.length - 1];

  // ---------------------------------------------------------------- sliders per mode
  // value ranges are the only values a child (or a lab) can ever set
  function sliderDefs(mode, medium, view) {
    const S = (k, min, max, step, def, unit, label, fmt) => ({ k, min, max, step, def, unit, label, fmt });
    switch (mode) {
      case 'vibrate': return [
        S('frequency', 100, 1000, 10, 300, 'Hz', T('Frequency: vibrations each second', 'आवृत्ति: हर सेकंड में कंपन')),
        S('amplitude', 1, 10, 1, 5, '', T('Amplitude: how big the vibration is', 'आयाम: कंपन कितना बड़ा है'), (v) => `${v} / 10`)];
      case 'string': return [
        S('length', 0.3, 1, 0.05, 0.6, 'm', T('Length of the string L', 'तार की लंबाई L')),
        S('tension', 10, 200, 5, 80, 'N', T('Tension T (pull on the string)', 'तनाव T (तार पर खिंचाव)')),
        S('frequency', 20, 700, 1, 60, 'Hz', T('Vibrator frequency', 'कंपित्र की आवृत्ति')),
        S('amplitude', 1, 10, 1, 6, '', T('How hard you pluck', 'कितनी ज़ोर से छेड़ते हो'), (v) => `${v} / 10`)];
      case 'pipe': return [
        S('length', 0.2, 1.2, 0.01, 0.5, 'm', T('Length of the air column L', 'वायु-स्तंभ की लंबाई L')),
        S('frequency', 50, 2000, 1, 120, 'Hz', T('Speaker frequency', 'स्पीकर की आवृत्ति'))];
      case 'echo': {
        const r = { air: [5, 200, 1, 100], water: [50, 3000, 10, 1500], steel: [20, 1000, 5, 500] }[medium] || [5, 200, 1, 100];
        const lab = { air: T('Distance to the cliff d', 'चट्टान की दूरी d'), water: T('Depth of the sea bed d', 'समुद्र तल की गहराई d'), steel: T('Length of the steel rail d', 'स्टील की पटरी की लंबाई d') }[medium] || T('Distance d', 'दूरी d');
        return [S('distance', r[0], r[1], r[2], r[3], 'm', lab)];
      }
      case 'spring': return [
        S('mass', 0.1, 2, 0.1, 0.5, 'kg', T('Mass m', 'द्रव्यमान m')),
        S('stiffness', 5, 100, 1, 20, 'N/m', T('Spring constant k (stiffness)', 'स्प्रिंग नियतांक k (कठोरता)')),
        S('amplitude', 2, 10, 1, 6, 'cm', T('Pull distance A', 'खींचने की दूरी A'))];
      case 'pendulum': return [
        S('length', 0.2, 2, 0.05, 1, 'm', T('Length of the string l', 'धागे की लंबाई l')),
        S('amplitude', 2, 30, 1, 10, '°', T('Starting angle', 'शुरुआती कोण'))];
      case 'shm': return [
        S('frequency', 0.1, 1, 0.05, 0.25, 'Hz', T('Frequency f', 'आवृत्ति f')),
        S('amplitude', 1, 5, 0.5, 4, 'cm', T('Amplitude A', 'आयाम A'))];
      case 'interference': return [
        S('frequency', 430, 750, 5, 545, 'THz', T('Colour of light (frequency)', 'प्रकाश का रंग (आवृत्ति)'), (v) => `${v} THz · ${Math.round(C / (v * 1e12) * 1e9)} nm`),
        S('distance', 0.1, 1, 0.05, 0.3, 'mm', T('Gap between the slits d', 'झिरियों के बीच की दूरी d')),
        S('length', 0.5, 2, 0.1, 1, 'm', T('Distance to the screen D', 'पर्दे की दूरी D'))];
      case 'diffraction': return [
        S('frequency', 430, 750, 5, 545, 'THz', T('Colour of light (frequency)', 'प्रकाश का रंग (आवृत्ति)'), (v) => `${v} THz · ${Math.round(C / (v * 1e12) * 1e9)} nm`),
        S('distance', 0.02, 0.3, 0.01, 0.1, 'mm', T('Width of the slit a', 'झिरी की चौड़ाई a')),
        S('length', 0.5, 2, 0.1, 1, 'm', T('Distance to the screen D', 'पर्दे की दूरी D'))];
      case 'spectrum': return view === 'sound'
        ? [S('frequency', 0, 7, 0.02, 2.64, 'Hz', T('Frequency (slide to change)', 'आवृत्ति (बदलने के लिए खिसकाओ)'), (v) => freqU(Math.pow(10, v)))]
        : [S('frequency', 4, 21, 0.05, 14.75, 'Hz', T('Frequency (slide to change)', 'आवृत्ति (बदलने के लिए खिसकाओ)'), (v) => `${sci(Math.pow(10, v))} Hz`)];
      default: return [];
    }
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `.wv { container-type: inline-size; color: var(--ink); font-family: var(--font-body); }
.wv * { box-sizing: border-box; }
.wv-grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 820px) { .wv-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
.wv-read { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 6px; margin-bottom: 10px; }
.wv-read div { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 5px 7px; text-align: center; min-width: 0; box-shadow: 0 1px 2px rgba(6,18,51,.05); }
.wv-read small { display: block; font-size: .72rem; line-height: 1.2; font-weight: 700; color: var(--ink-2); overflow-wrap: anywhere; }
.wv-read b { display: block; font: 800 1.08rem/1.25 var(--font-display); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; color: var(--ink); }
.wv-read b.hot { color: #0F766E; }
.wv-stage { position: relative; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 22px rgba(6,18,51,.16); background: #0B1226; }
.wv-svg { width: 100%; height: auto; display: block; }
.wv-cv { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
.wv-stage .wv-svg.over { position: relative; background: transparent; }
.wv-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.wv-btn { min-height: 48px; line-height: 1.15; text-align: center; border: 0; border-radius: 12px; padding: 4px 16px; font: 700 1rem var(--font-body); display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); cursor: pointer; transition: transform .12s, box-shadow .2s, background .2s; }
.wv-btn:active { transform: scale(.97); }
.wv-btn:focus-visible, .wv-chip:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.wv-btn svg { width: 20px; height: 20px; flex: none; }
.wv-go { background: linear-gradient(180deg, #FF8F3D, #FF7A1A); color: #1E293B; border-color: #F06A0A; box-shadow: 0 4px 12px rgba(255,122,26,.35); flex: 1 1 160px; font-size: 1.05rem; }
.wv-go[aria-pressed="true"] { background: linear-gradient(180deg, #2563EB, #1D4ED8); border-color: #1D4ED8; color: #fff; box-shadow: 0 4px 12px rgba(29,78,216,.35); }
.wv-pluck { background: linear-gradient(180deg, #FFE27A, #FFD23F); color: #1E293B; border-color: #E8B800; flex: 1 1 120px; }
.wv-snd[aria-pressed="true"] { background: #DFF5F0; border-color: #0F766E; color: #0F5A53; }
.wv-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.wv-chips > span { width: 100%; font-size: .8rem; font-weight: 700; color: var(--ink-2); }
.wv-chip { flex: 1 1 0; min-width: 72px; min-height: 44px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; font: 700 .92rem var(--font-body); cursor: pointer; padding: 4px 10px; line-height: 1.15; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: all .18s; }
.wv-chip i { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1.5px rgba(0,0,0,.18); }
.wv-chip:hover { border-color: #0891B2; }
.wv-chip[aria-pressed="true"] { background: #0E7490; border-color: #0E7490; color: #fff; box-shadow: 0 4px 12px rgba(8,145,178,.3); }
.wv-side { display: grid; gap: 8px; align-content: start; }
.wv-sl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px 2px; }
.wv-sl span { font-weight: 700; font-size: .9rem; min-width: 0; }
.wv-sl output { font: 800 1.02rem var(--font-display); color: #0E7490; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.wv-sl input[type=range] { grid-column: 1 / -1; width: 100%; height: 44px; margin: 0; -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
.wv-sl input[type=range]::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #67E8F9, #0891B2 55%, #1D4ED8); }
.wv-sl input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #0891B2; margin-top: -9px; box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.wv-sl input[type=range]::-moz-range-track { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #67E8F9, #0891B2 55%, #1D4ED8); }
.wv-sl input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid #0891B2; }
.wv-sl.rain input[type=range]::-webkit-slider-runnable-track { background: linear-gradient(90deg, #E11D1D, #FF7A1A, #F5D90A, #22C55E, #2563EB, #7C3AED); }
.wv-sl.rain input[type=range]::-moz-range-track { background: linear-gradient(90deg, #E11D1D, #FF7A1A, #F5D90A, #22C55E, #2563EB, #7C3AED); }
.wv-sl input:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; border-radius: 8px; }
.wv-nat { font-size: .82rem; color: var(--ink-2); grid-column: 1 / -1; padding-bottom: 4px; }
.wv-nat b { color: #0E7490; font-variant-numeric: tabular-nums; }
.wv-live { background: var(--surface); border: 1px solid var(--line); border-left: 5px solid #0891B2; border-radius: 12px; padding: 9px 13px; min-height: 48px; line-height: 1.45; font-size: .95rem; }
.wv-live.ok { border-left-color: #22C55E; background: linear-gradient(90deg, rgba(34,197,94,.10), transparent 60%), var(--surface); }
.wv-live.warn { border-left-color: #FF7A1A; }
.wv-formula { display: grid; gap: 6px; }
.wv-f { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; align-items: baseline; background: var(--sunk); border-radius: 10px; padding: 7px 10px; font-size: .9rem; }
.wv-f b { font-family: var(--font-display); color: var(--royal); white-space: nowrap; font-size: 1rem; }
.wv-f span { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@container (max-width: 430px) { .wv-f { grid-template-columns: minmax(0, 1fr); } .wv-read { grid-template-columns: repeat(3, minmax(0, 1fr)); } .wv-read b { font-size: .98rem; } .wv-btn { padding: 0 12px; } .wv-snd { flex: 1 1 100%; } }
.wv-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; border-top: 6px solid var(--wv-band, #0891B2); }
.wv-card h3 { font-size: 1.25rem; margin: 0 0 4px; }
.wv-card p { margin: 2px 0; font-size: .92rem; }
.wv-card p b { color: var(--ink-2); font-weight: 700; }
.wv-t { font-family: var(--font-body); }
.wv-t-s { font: 700 14px var(--font-body); }
.wv-t-m { font: 700 16px var(--font-body); }
.wv-t-b { font: 800 20px var(--font-display); }
@media (prefers-reduced-motion: reduce) { .wv-btn, .wv-chip { transition: none; } }`;

  // ---------------------------------------------------------------- SVG helpers
  function arrow(x1, y1, x2, y2, col, w = 3.5) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return '';
    const ux = dx / len, uy = dy / len, hx = x2 - ux * 10, hy = y2 - uy * 10;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${(hx - uy * 6).toFixed(1)},${(hy + ux * 6).toFixed(1)} ${(hx + uy * 6).toFixed(1)},${(hy - ux * 6).toFixed(1)}" fill="${col}"/>`;
  }
  const dbl = (x1, x2, y, col) => `${arrow((x1 + x2) / 2, y, x1, y, col, 2.2)}${arrow((x1 + x2) / 2, y, x2, y, col, 2.2)}`;
  // FK: text scale for the scene; bigger on a narrow stage so labels stay readable on a phone
  let FK = 1;
  function pill(x, y, text, bg = '#FFFFFF', fg = '#1E293B', anchor = 'middle', size = 14) {
    size *= FK;
    const w = String(text).length * size * 0.55 + 18;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    return `<g><rect x="${x0.toFixed(1)}" y="${(y - size * 0.85).toFixed(1)}" width="${w.toFixed(1)}" height="${(size * 1.7).toFixed(1)}" rx="${(size * 0.85).toFixed(1)}" fill="${bg}" opacity=".94" stroke="rgba(30,41,59,.16)"/><text x="${(x0 + w / 2).toFixed(1)}" y="${(y + size * 0.36).toFixed(1)}" text-anchor="middle" style="font:700 ${size}px var(--font-body);fill:${fg}">${esc(text)}</text></g>`;
  }
  const txt = (x, y, s, size = 14, fill = '#1E293B', anchor = 'middle', weight = 700) => `<text x="${x.toFixed ? x.toFixed(1) : x}" y="${y.toFixed ? y.toFixed(1) : y}" text-anchor="${anchor}" style="font:${weight} ${(size * FK).toFixed(1)}px var(--font-body);fill:${fill}">${esc(s)}</text>`;
  const pathOf = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  // A fixed pseudo-random sequence so particle jitter is the same every draw.
  const rnd = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    pluck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12c3-6 5-6 7 0s4 6 6 0 4-6 7 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  // ---------------------------------------------------------------- the template
  function mount(root, cfg, api) {
    const t = (x) => api.t(x);
    const mode = cfg.mode;
    const isSound = SOUND_MODES.includes(mode);
    let medium = cfg.medium || 'air';
    let view = mode === 'spectrum' ? (cfg.medium ? 'sound' : 'em') : null;
    let pipeType = 'closed', planet = 'earth', cover = false;
    let defs = sliderDefs(mode, medium, view);
    const P = {};
    defs.forEach((d) => { P[d.k] = d.def; });
    const S = {
      on: false, t0: performance.now() / 1000, now: 0, raf: 0, segs: [], pluck: null, dAmp: 0, resOn: false, run: null,
      lastTxt: 0, cycles: 0, echo: null, emittedFringes: false, lastBand: null, wavePhase: 0, trace: [],
    };
    const nowS = () => performance.now() / 1000 - S.t0;
    const VB = { vibrate: 340, string: 300, pipe: 300, echo: 330, spring: 330, pendulum: 380, shm: 330, interference: 340, diffraction: 340, spectrum: 300 }[mode];
    const usesCanvas = mode === 'interference' || mode === 'diffraction';

    // ----- sound (Web Audio only after a tap; never louder than SAFE) -----
    const AU = { on: !!cfg.play_sound && isSound, ctx: null, master: null, tone: null };
    function actx(gesture) {
      if (!AU.on) return null;
      if (!AU.ctx) {
        if (!gesture) return null;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { AU.ctx = new AC(); AU.master = AU.ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(AU.ctx.destination); } catch (e) { AU.ctx = null; return null; }
      }
      if (AU.ctx.state === 'suspended' && gesture) AU.ctx.resume();
      return AU.ctx;
    }
    function toneSet(f, g, gesture) {
      const c = actx(gesture); if (!c) return;
      g = clamp(g, 0, SAFE); f = clamp(f, 20, 20000);
      if (!AU.tone) {
        const o = c.createOscillator(), gn = c.createGain();
        o.type = 'sine'; o.frequency.value = f; gn.gain.value = 0; o.connect(gn); gn.connect(AU.master); o.start();
        AU.tone = { o, gn };
      }
      const n = c.currentTime;
      AU.tone.o.frequency.setTargetAtTime(f, n, 0.015);
      AU.tone.gn.gain.setTargetAtTime(g, n, 0.05);
    }
    function toneOff() {
      if (!AU.tone || !AU.ctx) { AU.tone = null; return; }
      const { o, gn } = AU.tone, n = AU.ctx.currentTime;
      gn.gain.setTargetAtTime(0, n, 0.04);
      try { o.stop(n + 0.4); } catch (e) { /* already stopped */ }
      AU.tone = null;
    }
    function pluckSnd(f1, amp, decay) {
      const c = actx(true); if (!c) return;
      const n0 = c.currentTime;
      for (let n = 1; n <= 6; n++) {
        const f = f1 * n; if (f > 18000) break;
        const b = Math.abs(Math.sin(n * PI * 0.25)) / (n * n);
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; o.type = 'sine';
        const peak = clamp(SAFE * 0.9 * (amp / 10) * b / 0.71, 0, SAFE);
        g.gain.setValueAtTime(0, n0); g.gain.linearRampToValueAtTime(peak, n0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, n0 + (decay || 2.6) / n);
        o.connect(g); g.connect(AU.master); o.start(n0); o.stop(n0 + (decay || 2.6) / n + 0.05);
      }
    }
    function clickSnd(at, gain) {
      const c = actx(true); if (!c) return;
      const len = Math.floor(c.sampleRate * 0.06), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 7));
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = buf; g.gain.value = clamp(gain, 0, SAFE * 2.2); s.connect(g); g.connect(AU.master); s.start(c.currentTime + at);
    }

    // ----- physics for the current settings -----
    const med = () => MED[medium];
    const f1String = () => (1 / (2 * P.length)) * Math.sqrt(P.tension / MU);
    const vString = () => Math.sqrt(P.tension / MU);
    const vAir = MED.air.v;
    const pipeF = (n) => (pipeType === 'open' ? n * vAir / (2 * P.length) : (2 * n - 1) * vAir / (4 * P.length));
    const lamNm = () => C / (P.frequency * 1e12) * 1e9;
    const fSpec = () => Math.pow(10, P.frequency);
    const echoT = () => 2 * P.distance / med().v;
    const omegaSp = () => Math.sqrt(P.stiffness / P.mass);
    const Tsp = () => TAU / omegaSp();
    const Tpend = () => TAU * Math.sqrt(P.length / PLANET[planet].g);

    // ----- DOM -----
    const chips = [];
    if (mode === 'vibrate') chips.push({ title: W.medium, items: ['air', 'water', 'steel', 'vacuum'].map((m) => ({ key: 'medium:' + m, label: MED[m].n, on: () => medium === m, dot: { air: '#BAE6FD', water: '#3B82F6', steel: '#64748B', vacuum: '#F8FAFC' }[m] })) });
    if (mode === 'echo') chips.push({ title: W.medium, items: ['air', 'water', 'steel'].map((m) => ({ key: 'medium:' + m, label: { air: T('Air: cliff', 'वायु: चट्टान'), water: T('Water: SONAR', 'पानी: सोनार'), steel: T('Steel: rail', 'स्टील: पटरी') }[m], on: () => medium === m, dot: { air: '#BAE6FD', water: '#3B82F6', steel: '#64748B' }[m] })) });
    if (mode === 'pipe') chips.push({ title: T('Pipe', 'नली'), items: [{ key: 'pipe:closed', label: W.closed, on: () => pipeType === 'closed' }, { key: 'pipe:open', label: W.open, on: () => pipeType === 'open' }] });
    if (mode === 'pendulum') chips.push({ title: T('Where is the pendulum?', 'लोलक कहाँ है?'), items: Object.keys(PLANET).map((p) => ({ key: 'planet:' + p, label: PLANET[p].n, on: () => planet === p, dot: { earth: '#3B82F6', moon: '#CBD5E1', mars: '#EA580C', jupiter: '#D97706' }[p] })) });
    if (mode === 'interference') chips.push({ title: T('Slits', 'झिरियाँ'), items: [{ key: 'slit:both', label: T('Both slits open', 'दोनों झिरियाँ खुली'), on: () => !cover }, { key: 'slit:cover', label: T('Cover one slit', 'एक झिरी ढको'), on: () => cover }] });
    if (mode === 'spectrum') chips.push({ title: T('Which spectrum?', 'कौन-सा स्पेक्ट्रम?'), items: [{ key: 'view:em', label: T('Light and EM waves', 'प्रकाश और विद्युत-चुंबकीय तरंगें'), on: () => view === 'em' }, { key: 'view:sound', label: T('Sound', 'ध्वनि'), on: () => view === 'sound' }] });
    const hasPluck = mode === 'vibrate' || mode === 'string';
    const GO = {
      vibrate: [T('Make it vibrate', 'कंपन शुरू करो'), T('Stop vibrating', 'कंपन रोको')], string: [T('Switch on the vibrator', 'कंपित्र चालू करो'), T('Switch off the vibrator', 'कंपित्र बंद करो')],
      pipe: [T('Switch on the speaker', 'स्पीकर चालू करो'), T('Switch off the speaker', 'स्पीकर बंद करो')], echo: [T('Clap!', 'ताली बजाओ!'), T('Clap!', 'ताली बजाओ!')],
      spring: [T('Pull and let go', 'खींचकर छोड़ो'), T('Stop', 'रोको')], pendulum: [T('Pull and let go', 'खींचकर छोड़ो'), T('Stop', 'रोको')], shm: [W.play, W.stop],
      interference: [T('Switch on the light', 'प्रकाश चालू करो'), T('Switch off the light', 'प्रकाश बंद करो')], diffraction: [T('Switch on the light', 'प्रकाश चालू करो'), T('Switch off the light', 'प्रकाश बंद करो')],
      spectrum: [T('Send the wave', 'तरंग भेजो'), T('Pause the wave', 'तरंग रोको')],
    }[mode];
    const PLUCK = mode === 'vibrate' ? T('Strike once', 'एक चोट करो') : T('Pluck the string', 'तार छेड़ो');
    const INTRO = {
      vibrate: T('Press “Make it vibrate”. Watch the particles of the medium bunch up (compressions) and spread out (rarefactions) as the sound travels to the ear.', '“कंपन शुरू करो” दबाओ। देखो, ध्वनि कान तक जाते समय माध्यम के कण पास-पास (संपीडन) और दूर-दूर (विरलन) होते हैं।'),
      string: T('Pluck the string, then change its tension or length and pluck again. Or switch on the vibrator and slowly change its frequency to find the natural frequencies.', 'तार छेड़ो, फिर उसका तनाव या लंबाई बदलकर दोबारा छेड़ो। या कंपित्र चालू करो और उसकी आवृत्ति धीरे-धीरे बदलकर प्राकृतिक आवृत्तियाँ खोजो।'),
      pipe: T('Switch on the speaker and slowly change its frequency (or the length). When it matches a natural frequency of the air column, the air shakes hard: resonance.', 'स्पीकर चालू करो और उसकी आवृत्ति (या लंबाई) धीरे-धीरे बदलो। जब यह वायु-स्तंभ की किसी प्राकृतिक आवृत्ति से मिलती है, हवा ज़ोर से काँपती है: अनुनाद।'),
      echo: T('Clap and watch the sound travel, bounce back and return. An echo is heard only if it comes back at least 0.1 s after the clap.', 'ताली बजाओ और ध्वनि को जाते, टकराकर लौटते देखो। प्रतिध्वनि तभी सुनाई देती है जब वह ताली के कम से कम 0.1 s बाद लौटे।'),
      spring: T('Press “Pull and let go”. Change the mass or the spring and see how the time for one oscillation changes.', '“खींचकर छोड़ो” दबाओ। द्रव्यमान या स्प्रिंग बदलो और देखो एक दोलन का समय कैसे बदलता है।'),
      pendulum: T('Press “Pull and let go” and time one full swing. Change the length, or take the pendulum to the Moon.', '“खींचकर छोड़ो” दबाओ और एक पूरे झूले का समय देखो। लंबाई बदलो, या लोलक को चंद्रमा पर ले जाओ।'),
      shm: T('Press Start. The red dot goes round the circle at a steady speed; its shadow on the line moves back and forth in simple harmonic motion.', 'शुरू करो दबाओ। लाल बिंदु वृत्त पर एक जैसी चाल से घूमता है; रेखा पर उसकी छाया आगे-पीछे सरल आवर्त गति करती है।'),
      interference: T('Switch on the light. Waves from the two slits overlap: where crest meets crest you get a bright fringe, where crest meets trough a dark one.', 'प्रकाश चालू करो। दोनों झिरियों से निकली तरंगें मिलती हैं: जहाँ शृंग से शृंग मिले वहाँ चमकीली फ्रिंज, जहाँ शृंग से गर्त मिले वहाँ काली।'),
      diffraction: T('Switch on the light. The light spreads out after passing the narrow slit. Make the slit narrower and watch the bright central band get wider.', 'प्रकाश चालू करो। पतली झिरी से निकलकर प्रकाश फैल जाता है। झिरी और पतली करो और देखो बीच की चमकीली पट्टी चौड़ी होती है।'),
      spectrum: T('Slide the frequency. As the frequency goes up, the wavelength gets shorter, because the speed stays the same.', 'आवृत्ति खिसकाओ। आवृत्ति बढ़ने पर तरंगदैर्ध्य छोटी होती जाती है, क्योंकि चाल वही रहती है।'),
    }[mode];

    const sliderHTML = () => defs.map((d) => `<label class="wv-sl ${d.k === 'frequency' && (mode === 'interference' || mode === 'diffraction') ? 'rain' : ''}"><span>${esc(t(d.label))}</span><output></output><input type="range" data-key="slider:${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${P[d.k]}" aria-label="${esc(t(d.label))}">${(mode === 'string' && d.k === 'frequency') || (mode === 'pipe' && d.k === 'frequency') ? '<div class="wv-nat"></div>' : ''}</label>`).join('');
    root.innerHTML = `<div class="wv wv-${mode}"><div class="wv-grid">
      <div class="wv-left">
        <div class="wv-read" role="group" aria-label="${esc(t(W.readings))}"></div>
        <div class="wv-stage">${usesCanvas ? '<canvas class="wv-cv" aria-hidden="true"></canvas>' : ''}<svg class="wv-svg ${usesCanvas ? 'over' : ''}" viewBox="0 0 640 ${VB}" role="img" aria-label="${esc(t(W.scene))}"></svg></div>
        <div class="wv-btns" role="group" aria-label="${esc(t(W.controls))}">
          <button type="button" class="wv-btn wv-go" data-key="play" aria-pressed="false"></button>
          ${hasPluck ? `<button type="button" class="wv-btn wv-pluck" data-key="pluck">${ICON.pluck}<span>${esc(t(PLUCK))}</span></button>` : ''}
          ${isSound ? `<button type="button" class="wv-btn wv-snd" data-key="toggle:sound" aria-pressed="${AU.on}"></button>` : ''}
        </div>
        ${chips.map((g) => `<div class="wv-chips" role="group" aria-label="${esc(t(g.title))}"><span>${esc(t(g.title))}</span>${g.items.map((it) => `<button type="button" class="wv-chip" data-key="${it.key}" aria-pressed="${it.on()}">${it.dot ? `<i style="background:${it.dot}"></i>` : ''}${esc(t(it.label))}</button>`).join('')}</div>`).join('')}
      </div>
      <div class="wv-side">
        <div class="wv-sliders">${sliderHTML()}</div>
        ${mode === 'spectrum' ? '<div class="wv-card"></div>' : ''}
        <div class="wv-live" aria-live="polite"></div>
        <div class="wv-formula"></div>
      </div></div></div>`;
    const svg = root.querySelector('.wv-svg'), readEl = root.querySelector('.wv-read'), liveEl = root.querySelector('.wv-live'), formEl = root.querySelector('.wv-formula');
    const goBtn = root.querySelector('[data-key="play"]'), sndBtn = root.querySelector('[data-key="toggle:sound"]'), cardEl = root.querySelector('.wv-card');
    const cv = root.querySelector('.wv-cv');
    const sliderEl = (k) => root.querySelector(`input[data-key="slider:${k}"]`);
    function live(x, cls) { liveEl.textContent = t(x); liveEl.className = 'wv-live' + (cls ? ' ' + cls : ''); }
    function syncButtons() {
      const on = mode === 'echo' ? false : S.on;
      goBtn.setAttribute('aria-pressed', String(on));
      goBtn.innerHTML = `${on ? ICON.stop : ICON.play}<span>${esc(t(GO[on ? 1 : 0]))}</span>`;
      if (sndBtn) { sndBtn.setAttribute('aria-pressed', String(AU.on)); sndBtn.innerHTML = `${AU.on ? ICON.sound : ICON.mute}<span>${esc(t(AU.on ? W.soundOn : W.soundOff))}</span>`; }
      root.querySelectorAll('.wv-chip').forEach((b) => { const it = chips.flatMap((g) => g.items).find((i) => i.key === b.dataset.key); if (it) b.setAttribute('aria-pressed', String(it.on())); });
    }
    function syncSliders() {
      defs.forEach((d) => {
        const inp = sliderEl(d.k); if (!inp) return;
        inp.value = P[d.k];
        inp.parentElement.querySelector('output').textContent = d.fmt ? d.fmt(P[d.k]) : `${num(P[d.k], 2)} ${d.unit}`;
      });
      const nat = root.querySelector('.wv-nat');
      if (nat) {
        const fs = mode === 'string' ? [1, 2, 3, 4, 5].map((n) => n * f1String()) : [1, 2, 3, 4, 5].map(pipeF);
        nat.innerHTML = `${esc(t(W.natural))}: ${fs.filter((f) => f <= 2100).map((f) => `<b>${Math.round(f)}</b>`).join(', ')} Hz`;
      }
    }

    // ----- readouts and formulae (text) -----
    function tile(lab, val, hot) { return `<div><small>${esc(t(lab))}</small><b class="${hot ? 'hot' : ''}">${esc(val)}</b></div>`; }
    function fline(name, body) { return `<div class="wv-f"><b>${esc(name)}</b><span>${esc(body)}</span></div>`; }
    function texts() {
      let r = '', f = '';
      if (mode === 'vibrate') {
        const v = med().v, lam = v / P.frequency;
        r = tile(W.freq, `${P.frequency} Hz`) + tile(W.wl, medium === 'vacuum' ? '–' : `${sig(lam, 3)} m`) + tile(W.speed, medium === 'vacuum' ? '0' : `${v} m/s`) + tile(W.period, `${sig(1000 / P.frequency, 3)} ms`) + tile(W.loud, t(P.amplitude >= 7 ? T('loud', 'तेज़') : P.amplitude <= 3 ? T('soft', 'धीमी') : T('medium', 'मध्यम')));
        f = medium === 'vacuum'
          ? fline(t(W.medium), t(T('No particles in a vacuum, so sound cannot travel: v = 0.', 'निर्वात में कण नहीं होते, इसलिए ध्वनि नहीं चल सकती: v = 0।')))
          : fline('v = f × λ', `${v} = ${P.frequency} × ${sig(lam, 3)} m (${t(med().at)})`) + fline('T = 1 / f', `1 / ${P.frequency} = ${sig(1 / P.frequency, 3)} s`)
            + fline(t(W.loud), t(T(`Energy grows as amplitude²: amplitude ${P.amplitude} carries ${P.amplitude * P.amplitude}× the energy of amplitude 1.`, `ऊर्जा आयाम² के साथ बढ़ती है: आयाम ${P.amplitude} में आयाम 1 से ${P.amplitude * P.amplitude} गुना ऊर्जा है।`)));
      } else if (mode === 'string') {
        const f1 = f1String(), v = vString(), kL = PI * P.frequency / f1, n = Math.round(P.frequency / f1);
        r = tile(W.f1, `${sig(f1, 3)} Hz`) + tile(W.speed, `${sig(v, 3)} m/s`) + tile(W.length, `${num(P.length)} m`) + tile(W.tension, `${P.tension} N`) + tile(W.drive, S.on ? `${P.frequency} Hz` : t(T('off', 'बंद')), S.resOn) + tile(W.loops, S.resOn ? String(n) : '–', S.resOn);
        f = fline('v = √(T / μ)', `√(${P.tension} / ${MU}) = ${sig(v, 3)} m/s  (μ = 5 g/m)`) + fline('f₁ = v / 2L', `${sig(v, 3)} / (2 × ${num(P.length)}) = ${sig(f1, 3)} Hz`) + fline('fₙ = n × f₁', t(T(`2f₁ = ${sig(2 * f1, 3)} Hz, 3f₁ = ${sig(3 * f1, 3)} Hz: n loops fit on the string`, `2f₁ = ${sig(2 * f1, 3)} Hz, 3f₁ = ${sig(3 * f1, 3)} Hz: तार पर n लूप बनते हैं`)));
        void kL;
      } else if (mode === 'pipe') {
        const f1 = pipeF(1), n = nearestPipe();
        r = tile(W.length, `${num(P.length)} m`) + tile(W.f1, `${sig(f1, 3)} Hz`) + tile(T('Speaker', 'स्पीकर'), S.on ? `${P.frequency} Hz` : t(T('off', 'बंद')), S.resOn) + tile(W.wl, `${sig(vAir / P.frequency, 3)} m`) + tile(T('Harmonic', 'संनादी'), S.resOn ? (pipeType === 'open' ? `${n}f₁` : `${2 * n - 1}f₁`) : '–', S.resOn);
        f = pipeType === 'open'
          ? fline('fₙ = n v / 2L', `f₁ = ${vAir} / (2 × ${num(P.length)}) = ${sig(f1, 3)} Hz; ${t(T('then 2f₁, 3f₁, 4f₁ … (all harmonics)', 'फिर 2f₁, 3f₁, 4f₁ … (सभी संनादी)'))}`)
          : fline('fₙ = (2n − 1) v / 4L', `f₁ = ${vAir} / (4 × ${num(P.length)}) = ${sig(f1, 3)} Hz; ${t(T('then 3f₁, 5f₁ … (odd harmonics only)', 'फिर 3f₁, 5f₁ … (केवल विषम संनादी)'))}`);
        f += fline('v', `${vAir} m/s (${t(MED.air.at)})`);
      } else if (mode === 'echo') {
        const v = med().v, te = echoT(), dmin = v * 0.1 / 2;
        r = tile(W.dist, `${P.distance} m`) + tile(W.speed, `${v} m/s`) + tile(W.echoT, `${sig(te, 3)} s`, te >= 0.1) + tile(T('Echo heard?', 'प्रतिध्वनि?'), t(te >= 0.1 ? T('yes', 'हाँ') : T('no, too soon', 'नहीं, बहुत जल्दी')), te >= 0.1);
        f = fline('t = 2d / v', `2 × ${P.distance} / ${v} = ${sig(te, 3)} s`) + fline(t(T('Shortest distance', 'सबसे कम दूरी')), `d = v × 0.1 s / 2 = ${sig(dmin, 3)} m (${t(med().at)})`);
      } else if (mode === 'spring') {
        const Tt = Tsp();
        r = tile(W.mass, `${num(P.mass)} kg`) + tile(W.k, `${P.stiffness} N/m`) + tile(W.period, `${sig(Tt, 3)} s`) + tile(W.freq, `${sig(1 / Tt, 3)} Hz`) + tile(W.time, `${num(S.run ? S.run.t : 0, 1)} s`) + tile(W.swings, String(S.cycles), S.cycles > 0);
        f = fline('T = 2π√(m / k)', `2π√(${num(P.mass)} / ${P.stiffness}) = ${sig(Tt, 3)} s`) + fline('F = −kx', t(T(`at the furthest point: ${P.stiffness} × ${num(P.amplitude / 100)} m = ${sig(P.stiffness * P.amplitude / 100, 3)} N back towards rest`, `सबसे दूर के बिंदु पर: ${P.stiffness} × ${num(P.amplitude / 100)} m = ${sig(P.stiffness * P.amplitude / 100, 3)} N विराम की ओर`)));
      } else if (mode === 'pendulum') {
        const Tt = Tpend(), g = PLANET[planet].g;
        r = tile(W.length, `${num(P.length)} m`) + tile(W.gravity, `${g} m/s²`) + tile(T('Formula T', 'सूत्र से T'), `${sig(Tt, 3)} s`) + tile(T('Measured T', 'मापा T'), S.measured ? `${sig(S.measured, 3)} s` : '–', !!S.measured) + tile(W.time, `${num(S.run ? S.run.t : 0, 1)} s`) + tile(W.swings, String(S.cycles), S.cycles > 0);
        f = fline('T = 2π√(l / g)', `2π√(${num(P.length)} / ${g}) = ${sig(Tt, 3)} s`) + fline(t(T('Big swings', 'बड़े झूले')), t(T('The formula is for small swings. A wide swing takes a little longer; the measured time shows it.', 'सूत्र छोटे झूलों के लिए है। चौड़ा झूला थोड़ा ज़्यादा समय लेता है; मापा गया समय यह दिखाता है।')));
      } else if (mode === 'shm') {
        const w = TAU * P.frequency, ph = S.run ? w * S.run.t : 0, A = P.amplitude;
        const x = A * Math.sin(ph), v = A * w * Math.cos(ph), a = -w * w * x;
        r = tile(W.disp, `${num(x, 1)} cm`) + tile(W.vel, `${num(v, 1)} cm/s`) + tile(W.acc, `${num(a, 1)} cm/s²`) + tile(W.phase, `${Math.round(((ph * 180 / PI) % 360 + 360) % 360)}°`) + tile(W.period, `${sig(1 / P.frequency, 3)} s`) + tile(W.swings, String(S.cycles), S.cycles > 0);
        f = fline('x = A sin ωt', `ω = 2πf = ${sig(w, 3)} rad/s`) + fline('v = Aω cos ωt', t(T(`fastest at the middle: ${sig(A * w, 3)} cm/s`, `बीच में सबसे तेज़: ${sig(A * w, 3)} cm/s`))) + fline('a = −ω² x', t(T(`always points to the middle; biggest at the ends: ${sig(w * w * A, 3)} cm/s²`, `हमेशा बीच की ओर; सिरों पर सबसे बड़ा: ${sig(w * w * A, 3)} cm/s²`)));
      } else if (mode === 'interference') {
        const lam = lamNm(), beta = lam * 1e-9 * P.length / (P.distance * 1e-3) * 1e3;
        r = tile(W.colour, `${Math.round(lam)} nm · ${t(colName(lam))}`) + tile(W.slits, `${num(P.distance)} mm`) + tile(W.screenD, `${num(P.length, 1)} m`) + tile(W.fringe, cover ? '–' : `${sig(beta, 3)} mm`, S.on && !cover);
        f = fline('β = λD / d', `${Math.round(lam)} nm × ${num(P.length, 1)} m / ${num(P.distance)} mm = ${sig(beta, 3)} mm`) + fline(t(T('Bright', 'चमकीली')), t(T('path difference = 0, λ, 2λ … (crest meets crest)', 'पथांतर = 0, λ, 2λ … (शृंग से शृंग)'))) + fline(t(T('Dark', 'काली')), t(T('path difference = λ/2, 3λ/2 … (crest meets trough)', 'पथांतर = λ/2, 3λ/2 … (शृंग से गर्त)')));
      } else if (mode === 'diffraction') {
        const lam = lamNm(), w = 2 * lam * 1e-9 * P.length / (P.distance * 1e-3) * 1e3;
        r = tile(W.colour, `${Math.round(lam)} nm · ${t(colName(lam))}`) + tile(W.slitW, `${num(P.distance)} mm`) + tile(W.screenD, `${num(P.length, 1)} m`) + tile(W.central, `${sig(w, 3)} mm`, S.on);
        f = fline('2λD / a', `2 × ${Math.round(lam)} nm × ${num(P.length, 1)} m / ${num(P.distance)} mm = ${sig(w, 3)} mm`) + fline(t(T('Dark bands', 'काली पट्टियाँ')), t(T('where a sin θ = λ, 2λ, 3λ …', 'जहाँ a sin θ = λ, 2λ, 3λ …')));
      } else if (mode === 'spectrum') {
        const fq = fSpec();
        if (view === 'em') {
          const lam = C / fq, b = bandOf(EM, fq);
          r = tile(W.freq, `${sci(fq)} Hz`) + tile(W.wl, lenU(lam)) + tile(W.band, t(b.n), true) + tile(W.speed, '3 × 10⁸ m/s');
          f = fline('c = f × λ', `3 × 10⁸ m/s = ${sci(fq)} Hz × ${lenU(lam)}`);
          if (cardEl) { cardEl.style.setProperty('--wv-band', b.id === 'visible' ? rgbHex(wlRGB(clamp(lam * 1e9, 400, 700))) : b.c); cardEl.innerHTML = `<h3>${esc(t(b.n))}${b.id === 'visible' ? ` · ${esc(t(colName(lam * 1e9)))}` : ''}</h3><p><b>${esc(t(W.wl))}:</b> ${esc(t(b.lam))}</p><p><b>${esc(t(T('Made by', 'स्रोत')))}:</b> ${esc(t(b.src))}</p><p><b>${esc(t(T('Used for', 'उपयोग')))}:</b> ${esc(t(b.use))}</p>`; }
        } else {
          const v = med().v, lam = v / fq, b = bandOf(SND, fq);
          r = tile(W.freq, freqU(fq)) + tile(W.wl, lenU(lam)) + tile(W.band, t(b.n), true) + tile(W.speed, `${v} m/s`);
          f = fline('v = f × λ', `${v} m/s = ${freqU(fq)} × ${lenU(lam)} (${t(med().at)})`);
          if (cardEl) { cardEl.style.setProperty('--wv-band', b.c); cardEl.innerHTML = `<h3>${esc(t(b.n))}</h3><p><b>${esc(t(W.freq))}:</b> ${esc(t(b.lam))}</p><p><b>${esc(t(T('Who makes it', 'कौन बनाता है')))}:</b> ${esc(t(b.src))}</p><p><b>${esc(t(T('Good to know', 'जानने योग्य')))}:</b> ${esc(t(b.use))}</p>`; }
        }
      }
      readEl.innerHTML = r;
      formEl.innerHTML = f;
    }
    function nearestPipe() {
      const f = P.frequency, f1 = pipeF(1);
      return pipeType === 'open' ? Math.max(1, Math.round(f / f1)) : Math.max(1, Math.round((f / f1 + 1) / 2));
    }

    // ================================================================ scenes
    // ---- vibrate: a tuning fork, particles of the medium, the ear, and a pressure graph ----
    const VX0 = 104, VX1 = 556, SLOW_V = 200;
    function vibSource(tau) {
      for (let i = S.segs.length - 1; i >= 0; i--) {
        const g = S.segs[i];
        if (tau >= g.t0 && tau < g.t1) {
          const amp = g.A * (g.dec != null ? Math.exp(-(tau - g.dec) / 1.6) : 1);
          return amp * Math.sin(g.ph0 + TAU * g.f / SLOW_V * (tau - g.t0));
        }
      }
      return 0;
    }
    function vibSegPhase(g, at) { return g.ph0 + TAU * g.f / SLOW_V * (at - g.t0); }
    function vibAmpPx() {
      const m = med(); if (medium === 'vacuum') return P.amplitude * 1.3;
      const lamPx = m.v / P.frequency * m.scale;
      return Math.min(P.amplitude * 1.3, 0.8 * lamPx / TAU);
    }
    function vibStart(strike) {
      const n = S.now, cur = S.segs[S.segs.length - 1];
      let ph0 = 0, dec = strike ? n : null;
      if (cur && cur.t1 === Infinity) { ph0 = vibSegPhase(cur, n) % TAU; cur.t1 = n; if (!strike && cur.dec != null) dec = null; }
      S.segs.push({ t0: n, t1: Infinity, f: P.frequency, A: vibAmpPx(), ph0, dec });
    }
    function vibStop() { const cur = S.segs[S.segs.length - 1]; if (cur && cur.t1 === Infinity) cur.t1 = S.now; }
    function vibChange() {
      const cur = S.segs[S.segs.length - 1];
      if (cur && cur.t1 === Infinity) { const strike = cur.dec != null; const dec = cur.dec; vibStart(strike); if (strike) S.segs[S.segs.length - 1].dec = dec; }
    }
    function sceneVibrate() {
      const m = med(), vac = medium === 'vacuum', n = S.now;
      const vPx = vac ? 0 : m.v * m.scale / SLOW_V;
      const s = (x) => (vac || reduced() ? 0 : vibSource(n - (x - VX0) / vPx));
      // reduced motion: a still snapshot of a steady wave filling the medium
      const still = reduced() && !vac && (S.on || S.segs.length);
      const lamPx = vac ? 1 : m.v / P.frequency * m.scale, kPx = TAU / lamPx, Apx = vibAmpPx();
      const sx = (x) => (still ? Apx * Math.sin(-kPx * (x - VX0)) : s(x));
      let o = `<defs><linearGradient id="wv-vbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0F9FF"/><stop offset="1" stop-color="#DBEAFE"/></linearGradient>
        <linearGradient id="wv-fork" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#94A3B8"/><stop offset=".5" stop-color="#F1F5F9"/><stop offset="1" stop-color="#64748B"/></linearGradient>
        <linearGradient id="wv-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2E8F0"/><stop offset=".5" stop-color="#CBD5E1"/><stop offset="1" stop-color="#94A3B8"/></linearGradient>
        <linearGradient id="wv-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BAE6FD"/><stop offset="1" stop-color="#60A5FA"/></linearGradient></defs>
        <rect width="640" height="${VB}" fill="url(#wv-vbg)"/>`;
      // medium box
      const fill = medium === 'steel' ? 'url(#wv-steel)' : medium === 'water' ? 'url(#wv-water)' : vac ? '#F8FAFC' : '#E0F2FE';
      o += `<rect x="${VX0 - 6}" y="40" width="${VX1 - VX0 + 12}" height="160" rx="14" fill="${fill}" stroke="#93C5FD" stroke-width="2"/>`;
      // particles
      if (!vac) {
        const cols = 50, rows = 8, gx = (VX1 - VX0) / cols;
        let dots = '';
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const x0 = VX0 + gx * (i + 0.5) + (medium === 'steel' ? 0 : (rnd(i * 31 + j) - 0.5) * 3), y = 54 + j * 19 + (medium === 'steel' ? 0 : (rnd(i * 7 + j * 13) - 0.5) * 5);
            const d = sx(x0), dd = (sx(x0 + 1) - sx(x0 - 1)) / 2;
            const dens = clamp(-dd / Math.max(0.05, Apx * kPx), -1, 1);
            const col = mixHex(m.dot[0], m.dot[1], 0.35 + 0.5 * (dens + 1) / 2);
            dots += `<circle cx="${(x0 + d).toFixed(1)}" cy="${y.toFixed(1)}" r="${medium === 'steel' ? 3.6 : 3.2}" fill="${col}"/>`;
          }
        }
        o += dots;
      } else {
        o += `<path d="M${VX0 - 30} 214V100Q${VX0 - 30} 22 ${(VX0 + VX1) / 2} 22T${VX1 + 30} 100V214" fill="rgba(186,230,253,.25)" stroke="#7DD3FC" stroke-width="3"/>${pill((VX0 + VX1) / 2, 120, t(W.vacuumJar), '#FFFFFF', '#0F172A', 'middle', 15)}`;
      }
      // tuning fork
      const src = reduced() ? (S.on ? Apx : 0) : vibSource(n);
      const pr = src * 0.7;
      o += `<g transform="translate(62 0)"><rect x="-4" y="168" width="8" height="58" rx="3" fill="url(#wv-fork)"/><path d="M-16 64V150Q-16 170 0 170Q16 170 16 150V64" fill="none" stroke="#64748B" stroke-width="0"/>
        <g transform="translate(${(-pr).toFixed(2)} 0)"><rect x="-22" y="52" width="10" height="104" rx="4" fill="url(#wv-fork)" stroke="#475569" stroke-width="1"/></g>
        <g transform="translate(${pr.toFixed(2)} 0)"><rect x="12" y="52" width="10" height="104" rx="4" fill="url(#wv-fork)" stroke="#475569" stroke-width="1"/></g>
        <path d="M-17 150Q-17 176 0 176Q17 176 17 150" fill="none" stroke="url(#wv-fork)" stroke-width="10"/>
        <rect x="-26" y="224" width="52" height="10" rx="4" fill="#7C2D12"/></g>`;
      if (S.on || (S.segs.length && Math.abs(src) > 0.2)) o += `<path d="M30 60q-8 8 0 16M94 60q8 8 0 16" stroke="#F59E0B" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".9"/>`;
      // ear
      const endS = vac ? 0 : Math.max(Math.abs(sx(VX1 - 4)), Math.abs(sx(VX1 - 14)));
      const heard = !vac && (still || endS > 0.3);
      o += `<g transform="translate(598 120)"><path d="M-14 -30C10 -42 34 -22 28 4C24 20 12 22 10 34C8 44 -6 46 -10 36" fill="#F6C9A4" stroke="#C2410C" stroke-width="2.5" stroke-linecap="round"/><path d="M-2 -14C10 -18 18 -8 14 4C12 10 6 10 4 16" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round"/></g>`;
      if (heard) o += `<g stroke="#16A34A" stroke-width="3" fill="none" stroke-linecap="round"><path d="M566 104q8 16 0 32"/><path d="M574 96q12 24 0 48" opacity=".6"/></g>${pill(598, 186, t(W.heard), '#DCFCE7', '#14532D', 'middle', 14)}`;
      else if (vac && S.on) o += pill(598, 186, t(W.noSound), '#FEE2E2', '#7F1D1D', 'middle', 14);
      // labels
      o += pill(VX0 + 8, 26, `${t(m.n)} · ${vac ? '0' : m.v} m/s`, '#FFFFFF', '#0F172A', 'start', 14);
      if (!vac) o += `<g transform="translate(${VX1 - m.bar * m.scale} 26)"><line x1="0" x2="${m.bar * m.scale}" stroke="#0F172A" stroke-width="3"/><line x1="0" x2="0" y1="-6" y2="6" stroke="#0F172A" stroke-width="3"/><line x1="${m.bar * m.scale}" x2="${m.bar * m.scale}" y1="-6" y2="6" stroke="#0F172A" stroke-width="3"/>${txt(m.bar * m.scale / 2, -8, `${m.bar} m`, 13, '#0F172A')}</g>`;
      // pressure graph
      const gy = 276, amp = P.amplitude * 3.6;
      o += `<rect x="${VX0 - 6}" y="214" width="${VX1 - VX0 + 12}" height="118" rx="12" fill="#FFFFFF" stroke="#BFDBFE"/><line x1="${VX0}" x2="${VX1}" y1="${gy}" y2="${gy}" stroke="#94A3B8" stroke-dasharray="4 4"/>`;
      o += `<g transform="translate(${VX0 - 16} ${gy + 16}) rotate(-90)">${txt(0, 0, t(W.pressure), 13, '#475569', 'middle')}</g>` + txt(VX1 - 4, 326, t(W.distance), 13, '#475569', 'end');
      if (!vac) {
        const pts = [];
        for (let x = VX0; x <= VX1; x += 3) { const dd = (sx(x + 1) - sx(x - 1)) / 2; pts.push([x, gy - clamp(-dd / Math.max(0.05, Apx * kPx), -1.2, 1.2) * amp]); }
        o += `<path d="${pathOf(pts)}" fill="none" stroke="#0891B2" stroke-width="3" stroke-linejoin="round"/>`;
        // find compressions (peaks) to label C, R and λ
        const peaks = [], troughs = [];
        for (let i = 1; i < pts.length - 1; i++) {
          if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1] && gy - pts[i][1] > amp * 0.6) peaks.push(pts[i][0]);
          if (pts[i][1] > pts[i - 1][1] && pts[i][1] >= pts[i + 1][1] && pts[i][1] - gy > amp * 0.6) troughs.push(pts[i][0]);
        }
        if (peaks.length) o += txt(peaks[0], gy - amp - 6, 'C', 15, '#1D4ED8');
        if (troughs.length) o += txt(troughs[0], gy + amp + 17, 'R', 15, '#B45309');
        if (peaks.length >= 2) o += dbl(peaks[0], peaks[1], 240, '#7C3AED') + pill((peaks[0] + peaks[1]) / 2, 240, `λ = ${sig(m.v / P.frequency, 3)} m`, '#EDE9FE', '#4C1D95', 'middle', 13);
        if (peaks.length || troughs.length) o += txt(VX1 - 4, 230, `${t(W.compress)} · ${t(W.rare)}`, 12, '#475569', 'end', 600);
      }
      if (!S.on && !S.segs.length) o += pill((VX0 + VX1) / 2, gy - 30, t(T('Press a button below to start', 'शुरू करने के लिए नीचे बटन दबाओ')), '#FFF7ED', '#7C2D12', 'middle', 14);
      o += pill(320, VB - 6 - 6, reduced() ? t(W.notScale) : t(W.slowed(SLOW_V)), '#0F172A', '#F8FAFC', 'middle', 12);
      return o;
    }

    // ---- string: a sonometer wire with a vibrator at one end and a hanging weight ----
    const SX0 = 74, SSC = 480, SLOW_S = 80, SY = 120;
    function sceneString() {
      const Lpx = P.length * SSC, X1 = SX0 + Lpx, n = S.now, f1 = f1String();
      const pts = [];
      let env = null;
      const kL = PI * P.frequency / f1;
      const D = Math.sqrt(Math.pow(Math.sin(kL), 2) + 0.03 * 0.03);
      for (let i = 0; i <= 90; i++) {
        const xf = i / 90, x = SX0 + xf * Lpx;
        let y = 0;
        if (S.pluck) {
          const tt = n - S.pluck.t0, h = S.pluck.h;
          for (let k = 1; k <= 6; k++) {
            const b = 2 * h / (k * k * PI * PI * 0.25 * 0.75) * Math.sin(k * PI * 0.25);
            y += b * Math.sin(k * PI * xf) * (reduced() ? 1 : Math.cos(TAU * k * f1 / SLOW_S * tt) * Math.exp(-tt * k / 2.6));
          }
        }
        if (S.on) {
          const a = 1.6 * S.dAmp * Math.sin(kL * (1 - xf));
          y += a * (reduced() ? 1 : Math.sin(TAU * P.frequency / SLOW_S * n));
        }
        pts.push([x, SY - y]);
      }
      if (S.on && S.dAmp * 1.6 / D > 4) {
        env = [];
        for (let i = 0; i <= 90; i++) { const xf = i / 90; env.push([SX0 + xf * Lpx, 1.6 * S.dAmp * Math.abs(Math.sin(kL * (1 - xf)))]); }
      }
      let o = `<defs><linearGradient id="wv-sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FEF3C7"/><stop offset="1" stop-color="#FDE68A"/></linearGradient>
        <linearGradient id="wv-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B45309"/><stop offset="1" stop-color="#78350F"/></linearGradient>
        <linearGradient id="wv-wire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5E7EB"/><stop offset="1" stop-color="#6B7280"/></linearGradient></defs>
        <rect width="640" height="${VB}" fill="url(#wv-sbg)"/>`;
      o += `<rect x="24" y="178" width="582" height="34" rx="8" fill="url(#wv-wood)"/><rect x="24" y="178" width="582" height="6" rx="3" fill="#D97706" opacity=".7"/>`;
      // length scale
      o += `<g>${dbl(SX0, X1, 236, '#1E293B')}${pill((SX0 + X1) / 2, 236, `L = ${num(P.length)} m`, '#FFFFFF', '#0F172A', 'middle', 14)}</g>`;
      // vibrator
      const vib = S.on ? 1.6 * Math.sin(TAU * P.frequency / SLOW_S * n) * Math.sin(kL) * S.dAmp : 0;
      o += `<g><rect x="16" y="${SY - 26}" width="46" height="52" rx="8" fill="#1D4ED8"/><rect x="22" y="${SY - 18}" width="34" height="10" rx="3" fill="#93C5FD"/>${txt(39, SY + 18, 'f', 15, '#FFFFFF')}<circle cx="39" cy="${SY - 34}" r="5" fill="${S.on ? '#22C55E' : '#64748B'}"/></g>`;
      o += `<line x1="62" y1="${SY}" x2="${SX0}" y2="${(SY - vib).toFixed(1)}" stroke="#334155" stroke-width="3"/>`;
      // bridges
      o += `<path d="M${SX0 - 10} 178L${SX0} ${SY + 2}L${SX0 + 10} 178Z" fill="#FDE68A" stroke="#92400E" stroke-width="2"/><path d="M${X1 - 10} 178L${X1} ${SY + 2}L${X1 + 10} 178Z" fill="#FDE68A" stroke="#92400E" stroke-width="2"/>`;
      // envelope and wire
      if (env) o += `<path d="${pathOf(env.map(([x, a]) => [x, SY - a]))}" fill="none" stroke="#0891B2" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/><path d="${pathOf(env.map(([x, a]) => [x, SY + a]))}" fill="none" stroke="#0891B2" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/>`;
      o += `<path d="${pathOf(pts)}" fill="none" stroke="#475569" stroke-width="3.2" stroke-linecap="round"/><path d="${pathOf(pts)}" fill="none" stroke="#E5E7EB" stroke-width="1.2" opacity=".9"/>`;
      // the wire over the pulley to the weight
      o += `<line x1="${X1}" y1="${SY}" x2="604" y2="${SY - 2}" stroke="#475569" stroke-width="3"/><circle cx="610" cy="${SY + 8}" r="12" fill="#CBD5E1" stroke="#334155" stroke-width="3"/><line x1="622" y1="${SY + 8}" x2="622" y2="250" stroke="#475569" stroke-width="2.5"/>`;
      const wh = 18 + P.tension / 200 * 30;
      o += `<rect x="606" y="250" width="32" height="${wh.toFixed(1)}" rx="5" fill="#334155"/>${txt(600, 250 + wh / 2 + 5, `${P.tension} N`, 13, '#1E293B', 'end')}`;
      // nodes and antinodes at resonance
      if (S.on && S.resOn) {
        const nl = Math.round(P.frequency / f1);
        for (let j = 0; j <= nl; j++) o += txt(SX0 + j * Lpx / nl, SY + 4 + (j === 0 || j === nl ? 40 : 30), 'N', 14, '#B42318');
        for (let j = 0; j < nl; j++) o += txt(SX0 + (j + 0.5) * Lpx / nl, 52, 'A', 14, '#0E7490');
        o += pill(320, 26, `${t(T('Resonance', 'अनुनाद'))}: ${nl} ${t(nl === 1 ? T('loop', 'लूप') : T('loops', 'लूप'))} · ${t(W.node)} · ${t(W.anti)}`, '#0F766E', '#FFFFFF', 'middle', 14);
      } else if (S.pluck && n - S.pluck.t0 < 3) {
        o += pill(320, 26, `${t(T('Sounds', 'स्वर'))} f₁ = ${sig(f1, 3)} Hz`, '#FFFFFF', '#0F172A', 'middle', 14);
      }
      o += pill(320, VB - 14, reduced() ? t(W.notScale) : t(W.slowed(SLOW_S)), '#0F172A', '#F8FAFC', 'middle', 12);
      return o;
    }

    // ---- pipe: an air column driven by a speaker ----
    const PX0 = 96, PSC = 430, SLOW_P = 200, PY = 140;
    function pipeResp() {
      const k = TAU * P.frequency / vAir, kL = k * P.length;
      const F = pipeType === 'open' ? Math.sin(kL) : Math.cos(kL);
      return { k, kL, F, R: 1 / Math.sqrt(F * F + 0.05 * 0.05) };
    }
    function scenePipe() {
      const Lpx = P.length * PSC, X1 = PX0 + Lpx, n = S.now, r = pipeResp();
      const kPx = r.k / PSC;
      const capA = 0.8 / kPx;
      const a0 = 0.5;
      const amp = Math.min(capA, a0 * S.dAmp);
      const env = (x) => (pipeType === 'open' ? Math.cos(r.k * (P.length - (x - PX0) / PSC)) : Math.sin(r.k * (P.length - (x - PX0) / PSC)));
      const ph = reduced() ? 1 : Math.sin(TAU * P.frequency / SLOW_P * n);
      let o = `<defs><linearGradient id="wv-pbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ECFEFF"/><stop offset="1" stop-color="#CFFAFE"/></linearGradient>
        <linearGradient id="wv-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".9"/><stop offset=".5" stop-color="#E0F2FE" stop-opacity=".5"/><stop offset="1" stop-color="#BAE6FD" stop-opacity=".9"/></linearGradient>
        <radialGradient id="wv-cone" cx=".3" cy=".5" r=".8"><stop offset="0" stop-color="#94A3B8"/><stop offset="1" stop-color="#1E293B"/></radialGradient></defs>
        <rect width="640" height="${VB}" fill="url(#wv-pbg)"/>`;
      // tube
      o += `<rect x="${PX0}" y="${PY - 42}" width="${Lpx.toFixed(1)}" height="84" rx="6" fill="url(#wv-glass)" stroke="#0891B2" stroke-width="2.5"/>`;
      // envelope (displacement amplitude, drawn bigger so it can be seen)
      if (S.on && S.dAmp > 0.5) {
        const e = Math.min(30, 30 * S.dAmp / 20), up = [], dn = [];
        for (let x = PX0; x <= X1; x += 4) { const v = Math.abs(env(x)) * e; up.push([x, PY - v]); dn.push([x, PY + v]); }
        o += `<path d="${pathOf(up)}L${pathOf(dn.reverse()).slice(1)}Z" fill="#22D3EE" opacity=".22"/><path d="${pathOf(up)}" fill="none" stroke="#0891B2" stroke-width="2" stroke-dasharray="5 4"/><path d="${pathOf(dn.reverse())}" fill="none" stroke="#0891B2" stroke-width="2" stroke-dasharray="5 4"/>`;
      }
      // air particles
      let dots = '';
      const gx = 8;
      for (let x0 = PX0 + 5; x0 < X1 - 3; x0 += gx) {
        for (let j = 0; j < 5; j++) {
          const y = PY - 30 + j * 15 + (rnd(x0 * 3 + j) - 0.5) * 4;
          const d = S.on ? amp * env(x0) * ph : 0;
          const dd = S.on ? -amp * r.k / PSC * (pipeType === 'open' ? -Math.sin(r.k * (P.length - (x0 - PX0) / PSC)) : -Math.cos(r.k * (P.length - (x0 - PX0) / PSC))) * ph : 0;
          const dens = clamp(-dd / 0.8, -1, 1);
          dots += `<circle cx="${(x0 + d).toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${mixHex('#93C5FD', '#1E3A8A', 0.3 + 0.55 * (dens + 1) / 2)}"/>`;
        }
      }
      o += dots;
      // closed end
      if (pipeType === 'closed') o += `<rect x="${X1 - 3}" y="${PY - 48}" width="14" height="96" rx="4" fill="#0E7490"/>`;
      else o += `<rect x="${X1 - 2}" y="${PY - 46}" width="5" height="10" fill="#0891B2"/><rect x="${X1 - 2}" y="${PY + 36}" width="5" height="10" fill="#0891B2"/>`;
      // speaker
      const cone = S.on ? 1.8 * Math.sin(TAU * P.frequency / SLOW_P * n) * (reduced() ? 0 : 1) : 0;
      o += `<g transform="translate(${(PX0 - 40 + cone).toFixed(1)} ${PY})"><rect x="-30" y="-36" width="30" height="72" rx="6" fill="#334155"/><path d="M0 -34L26 -18V18L0 34Z" fill="url(#wv-cone)"/><circle cx="8" cy="0" r="7" fill="#0F172A"/></g>`;
      if (S.on) o += `<g stroke="#F59E0B" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M${PX0 - 8} ${PY - 56}q10 8 0 16"/><path d="M${PX0 - 8} ${PY + 40}q10 8 0 16"/></g>`;
      // N / A at resonance
      if (S.on && S.resOn) {
        const marks = [];
        for (let x = PX0; x <= X1 + 0.5; x += 1) {
          const e1 = env(x);
          const prev = env(x - 1);
          if (x > PX0 && Math.sign(e1) !== Math.sign(prev)) marks.push([x, 'N']);
        }
        // antinodes: where |env| peaks (also the open ends)
        for (let x = PX0 + 1; x < X1; x += 1) { const a = Math.abs(env(x - 1)), b = Math.abs(env(x)), c = Math.abs(env(x + 1)); if (b >= a && b > c && b > 0.98) marks.push([x, 'A']); }
        if (pipeType === 'closed') marks.push([X1, 'N']);
        if (Math.abs(env(X1)) > 0.98) marks.push([X1, 'A']);
        if (Math.abs(env(PX0)) > 0.98) marks.push([PX0, 'A']);
        marks.forEach(([x, k]) => { o += txt(x, k === 'N' ? PY + 64 : PY - 52, k, 15, k === 'N' ? '#B42318' : '#0E7490'); });
        o += pill(320, 28, `${t(T('Resonance', 'अनुनाद'))}! · ${t(W.node)} · ${t(W.anti)}`, '#0F766E', '#FFFFFF', 'middle', 14);
      } else o += pill(320, 28, t(pipeType === 'open' ? W.open : W.closed), '#FFFFFF', '#0F172A', 'middle', 14);
      o += `<g>${dbl(PX0, X1, 222, '#1E293B')}${pill((PX0 + X1) / 2, 222, `L = ${num(P.length)} m`, '#FFFFFF', '#0F172A', 'middle', 14)}</g>`;
      // loudness meter
      const lev = S.on ? clamp(S.dAmp / 20, 0, 1) : 0;
      o += `<g transform="translate(140 262)"><rect width="360" height="16" rx="8" fill="#E2E8F0"/><rect width="${(360 * lev).toFixed(1)}" height="16" rx="8" fill="${lev > 0.8 ? '#16A34A' : '#0891B2'}"/>${txt(-8, 13, t(W.loud), 13, '#334155', 'end')}</g>`;
      o += pill(320, VB - 8, t(W.slowed(SLOW_P)), '#0F172A', '#F8FAFC', 'middle', 11);
      return o;
    }

    // ---- echo: a pulse that travels, reflects (image method) and returns ----
    function echoGeom() {
      if (medium === 'water') {
        const B = 112 + (P.distance - 50) / (3000 - 50) * 150;
        return { kind: 'v', S: [320, 92], R: B, clip: [0, 86, 640, B - 86] };
      }
      if (medium === 'steel') {
        const E = 90 + (P.distance - 20) / (1000 - 20) * 520;
        return { kind: 'h', S: [74, 150], R: E, clip: [70, 140, E - 70, 20] };
      }
      const Wx = 120 + (P.distance - 5) / (200 - 5) * 440;
      return { kind: 'h', S: [92, 172], R: Wx, clip: [92, 40, Wx - 92, 190] };
    }
    function sceneEcho() {
      const g = echoGeom(), E = S.echo, n = S.now;
      const dPx = g.kind === 'h' ? g.R - g.S[0] : g.R - g.S[1];
      let o = '';
      if (medium === 'water') {
        o += `<defs><linearGradient id="wv-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#0C4A6E"/></linearGradient><linearGradient id="wv-sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BAE6FD"/><stop offset="1" stop-color="#F0F9FF"/></linearGradient></defs>
          <rect width="640" height="90" fill="url(#wv-sky2)"/><rect y="86" width="640" height="${VB - 86}" fill="url(#wv-sea)"/>
          <path d="M0 ${g.R}Q80 ${g.R - 10} 160 ${g.R}T320 ${g.R}T480 ${g.R}T640 ${g.R}V${VB}H0Z" fill="#A16207"/><path d="M0 ${g.R}Q80 ${g.R - 10} 160 ${g.R}T320 ${g.R}T480 ${g.R}T640 ${g.R}" fill="none" stroke="#FDE68A" stroke-width="3"/>
          <g transform="translate(320 86)"><path d="M-70 -18H70L52 4H-52Z" fill="#DC2626"/><rect x="-30" y="-40" width="50" height="22" rx="3" fill="#F8FAFC"/><rect x="-24" y="-35" width="10" height="9" fill="#38BDF8"/><rect x="-8" y="-35" width="10" height="9" fill="#38BDF8"/><rect x="-4" y="4" width="8" height="6" fill="#0F172A"/></g>
          ${pill(470, 40, t(T('SONAR ship', 'सोनार जहाज़')), '#FFFFFF', '#0F172A', 'middle', 14)}${pill(560, g.R + 22, t(T('sea bed', 'समुद्र तल')), '#FEF3C7', '#713F12', 'middle', 13)}
          <g>${arrow(600, 100, 600, g.R - 4, '#F8FAFC', 2.2)}${arrow(600, g.R - 4, 600, 100, '#F8FAFC', 2.2)}${pill(560, (100 + g.R) / 2, `d = ${P.distance} m`, '#FFFFFF', '#0F172A', 'middle', 14)}</g>`;
      } else if (medium === 'steel') {
        o += `<defs><linearGradient id="wv-rbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1F5F9"/><stop offset="1" stop-color="#CBD5E1"/></linearGradient><linearGradient id="wv-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2E8F0"/><stop offset=".4" stop-color="#94A3B8"/><stop offset="1" stop-color="#475569"/></linearGradient></defs>
          <rect width="640" height="${VB}" fill="url(#wv-rbg)"/><rect y="190" width="640" height="40" fill="#A8A29E"/>`;
        for (let x = 40; x < g.R + 20; x += 34) o += `<rect x="${x}" y="172" width="18" height="34" rx="2" fill="#78350F"/>`;
        o += `<rect x="70" y="140" width="${(g.R - 70).toFixed(1)}" height="20" rx="3" fill="url(#wv-rail)" stroke="#334155" stroke-width="1.5"/><rect x="${(g.R - 4).toFixed(1)}" y="136" width="8" height="28" rx="2" fill="#334155"/>
          <g transform="translate(52 118) rotate(${E && n - E.t0 < 0.2 && !reduced() ? -25 : 0})"><rect x="-6" y="-48" width="8" height="52" rx="3" fill="#92400E"/><rect x="-18" y="-60" width="32" height="18" rx="4" fill="#475569"/></g>
          <g>${dbl(70, g.R, 112, '#0F172A')}${pill((70 + g.R) / 2, 112, `d = ${P.distance} m`, '#FFFFFF', '#0F172A', 'middle', 14)}</g>${pill(140, 34, t(T('Tap one end of a long steel rail', 'लंबी स्टील पटरी के एक सिरे पर चोट')), '#FFFFFF', '#0F172A', 'start', 14)}`;
      } else {
        o += `<defs><linearGradient id="wv-esky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#DBEAFE"/></linearGradient><linearGradient id="wv-rock" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A8A29E"/><stop offset="1" stop-color="#57534E"/></linearGradient></defs>
          <rect width="640" height="${VB}" fill="url(#wv-esky)"/><circle cx="560" cy="48" r="22" fill="#FDE047"/><rect y="228" width="640" height="${VB - 228}" fill="#4ADE80"/><rect y="228" width="640" height="6" fill="#16A34A"/>
          <path d="M${g.R} 228V70L${g.R + 18} 52L${g.R + 40} 64L${g.R + 70} 40L640 46V228Z" fill="url(#wv-rock)" stroke="#44403C" stroke-width="2"/>
          <g transform="translate(70 228)"><circle cx="0" cy="-74" r="12" fill="#F6C9A4"/><path d="M-12 -80Q0 -96 12 -80" fill="#1E293B"/><rect x="-11" y="-62" width="22" height="34" rx="8" fill="#FF7A1A"/><path d="M-6 -28V0M6 -28V0" stroke="#1E3A8A" stroke-width="7" stroke-linecap="round"/><path d="M10 -56L22 -60M10 -50L22 -46" stroke="#F6C9A4" stroke-width="6" stroke-linecap="round"/></g>
          <g>${dbl(92, g.R, 252, '#0F172A')}${pill((92 + g.R) / 2, 252, `d = ${P.distance} m`, '#FFFFFF', '#0F172A', 'middle', 14)}</g>`;
      }
      // pulse rings
      if (E) {
        const ta = n - E.t0, rr = ta / E.dur * 2 * dPx;
        const [cx, cy] = g.S, ix = g.kind === 'h' ? 2 * g.R - cx : cx, iy = g.kind === 'v' ? 2 * g.R - cy : cy;
        const [kx, ky, kw, kh] = g.clip;
        o += `<clipPath id="wv-eclip"><rect x="${kx}" y="${ky}" width="${Math.max(0, kw).toFixed(1)}" height="${Math.max(0, kh).toFixed(1)}"/></clipPath><g clip-path="url(#wv-eclip)" fill="none">`;
        if (ta <= E.dur + 0.3 || reduced()) {
          const rings = reduced() ? [] : [0, 10, 20];
          rings.forEach((dr, j) => {
            const r1 = rr - dr; if (r1 <= 2) return;
            const op = (0.95 - j * 0.28).toFixed(2), col = medium === 'water' ? '#FDE047' : '#EA580C';
            if (r1 < dPx) o += `<circle cx="${cx}" cy="${cy}" r="${r1.toFixed(1)}" stroke="${col}" stroke-width="${medium === 'steel' ? 6 : 4}" opacity="${op}"/>`;
            else if (r1 < 2 * dPx + 4) o += `<circle cx="${ix}" cy="${iy}" r="${r1.toFixed(1)}" stroke="${medium === 'water' ? '#A7F3D0' : '#7C3AED'}" stroke-width="${medium === 'steel' ? 6 : 4}" opacity="${op}"/>`;
          });
        }
        o += '</g>';
        if (E.back) o += pill(g.S[0] + (medium === 'water' ? 130 : 70), g.S[1] - (medium === 'steel' ? 50 : 80) + (medium === 'water' ? 60 : 0), E.te >= 0.1 ? `${t(W.echo)}! ${sig(E.te, 3)} s` : t(T('too soon: no echo', 'बहुत जल्दी: प्रतिध्वनि नहीं')), E.te >= 0.1 ? '#DCFCE7' : '#FEF3C7', E.te >= 0.1 ? '#14532D' : '#713F12', 'middle', 15);
      }
      // timeline (real time)
      const te = echoT(), tMax = Math.max(0.25, te * 1.2), X0 = 70, X1 = 600, ty = 300;
      const tx = (s) => X0 + s / tMax * (X1 - X0);
      o += `<rect x="20" y="${ty - 28}" width="600" height="52" rx="12" fill="#FFFFFF" opacity=".92"/>`;
      o += `<rect x="${X0}" y="${ty - 8}" width="${(tx(Math.min(0.1, tMax)) - X0).toFixed(1)}" height="16" fill="#FDE68A"/><line x1="${X0}" x2="${X1}" y1="${ty}" y2="${ty}" stroke="#334155" stroke-width="2"/>`;
      o += `<line x1="${tx(0.1).toFixed(1)}" x2="${tx(0.1).toFixed(1)}" y1="${ty - 12}" y2="${ty + 12}" stroke="#B45309" stroke-width="2" stroke-dasharray="3 3"/>${txt(tx(0.1) + 4, ty - 14, '0.1 s', 12, '#92400E', 'start')}`;
      o += `<circle cx="${X0}" cy="${ty}" r="6" fill="#EA580C"/>${txt(X0, ty + 20, `${t(W.clap)} 0 s`, 12, '#334155', 'start')}`;
      o += `<circle cx="${tx(te).toFixed(1)}" cy="${ty}" r="6" fill="#7C3AED"/>${txt(tx(te), ty + 20, `${t(W.echo)} ${sig(te, 3)} s`, 12, '#4C1D95', te > tMax * 0.75 ? 'end' : 'middle')}`;
      if (FK < 1.2) o += txt(X1, ty - 14, t(W.holds), 11, '#475569', 'end', 600);
      if (E) { const ta = Math.min(n - E.t0, E.dur) / E.slow; o += `<line x1="${tx(ta).toFixed(1)}" x2="${tx(ta).toFixed(1)}" y1="${ty - 14}" y2="${ty + 10}" stroke="#0F172A" stroke-width="3"/>`; }
      o += pill(20, 16 + (medium === 'water' ? 0 : 0), E ? `${t(W.slowed(E.slow))} · ${t(W.realTime)}` : t(W.slowed(echoSlow())), '#0F172A', '#F8FAFC', 'start', 12);
      return o;
    }
    function echoSlow() { const te = echoT(); return [1, 2, 5, 10, 20, 50, 100, 200].find((k) => te * k >= 1.5) || 200; }

    // ---- spring: a block on a smooth table ----
    function sceneSpring() {
      const r = S.run, A = P.amplitude * 10, w = omegaSp();
      const x = r ? A * Math.cos(w * r.t) : A;
      const xe = 340, bw = 46 + 26 * Math.sqrt(P.mass), bx = xe + x - bw / 2;
      let o = `<defs><linearGradient id="wv-kbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5F3FF"/><stop offset="1" stop-color="#DDD6FE"/></linearGradient><linearGradient id="wv-blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FB923C"/><stop offset="1" stop-color="#C2410C"/></linearGradient><linearGradient id="wv-tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94A3B8"/><stop offset="1" stop-color="#475569"/></linearGradient></defs>
        <rect width="640" height="${VB}" fill="url(#wv-kbg)"/><rect x="20" y="40" width="26" height="150" fill="#64748B"/><path d="M20 40l26 0M20 60l26-20M20 90l26-30M20 120l26-30M20 150l26-30M20 180l26-30" stroke="#334155" stroke-width="2"/>
        <rect x="20" y="190" width="600" height="14" rx="3" fill="url(#wv-tab)"/>${txt(330, 222, t(T('smooth table: no friction', 'चिकनी मेज़: कोई घर्षण नहीं')), 12, '#475569')}`;
      // spring coils
      const sx0 = 46, sx1 = bx, coils = 14, yc = 160, pts = [[sx0, yc]];
      for (let i = 0; i <= coils * 2; i++) { const xx = sx0 + 10 + (sx1 - sx0 - 20) * i / (coils * 2); pts.push([xx, yc + (i === 0 || i === coils * 2 ? 0 : i % 2 ? -14 : 14)]); }
      pts.push([sx1, yc]);
      o += `<path d="${pathOf(pts)}" fill="none" stroke="#7C3AED" stroke-width="3.5" stroke-linejoin="round"/>`;
      o += `<line x1="${xe}" x2="${xe}" y1="56" y2="196" stroke="#0F172A" stroke-dasharray="5 5" stroke-width="2"/>${txt(xe, 50, t(W.equil), 12, '#0F172A')}`;
      o += `<line x1="${xe - A}" x2="${xe - A}" y1="66" y2="196" stroke="#94A3B8" stroke-dasharray="3 5"/><line x1="${xe + A}" x2="${xe + A}" y1="66" y2="196" stroke="#94A3B8" stroke-dasharray="3 5"/>${txt(xe + A + 4, 76, `+${P.amplitude} cm`, 12, '#475569', 'start')}${txt(xe - A - 4, 76, `−${P.amplitude} cm`, 12, '#475569', 'end')}`;
      o += `<rect x="${bx.toFixed(1)}" y="${190 - bw * 0.8}" width="${bw.toFixed(1)}" height="${(bw * 0.8).toFixed(1)}" rx="8" fill="url(#wv-blk)" stroke="#7C2D12" stroke-width="2"/>${txt(bx + bw / 2, 190 - bw * 0.4 + 5, `${num(P.mass)} kg`, 14, '#1E293B')}`;
      if (Math.abs(x) > 3) o += arrow(bx + bw / 2, 190 - bw * 0.8 - 14, bx + bw / 2 - clamp(x * 0.9, -90, 90), 190 - bw * 0.8 - 14, '#B42318', 3) + txt(bx + bw / 2, 190 - bw * 0.8 - 26, t(W.restoring), 12, '#7F1D1D');
      if (!r) o += `<g transform="translate(${(bx + bw + 16).toFixed(1)} ${170 - bw * 0.4})"><path d="M0 0h18q8 0 8 8v8q0 8-8 8H0z" fill="#F6C9A4" stroke="#C2410C" stroke-width="2"/></g>`;
      // x–t trace
      o += graphTrace(250, 320, (tt) => A * Math.cos(w * tt), A, '#7C3AED');
      return o;
    }
    // a rolling x–t graph for spring and pendulum: the latest 8 s
    function graphTrace(y0, y1, fx, A, col) {
      const r = S.run, X0 = 40, X1 = 610, cy = (y0 + y1) / 2, h = (y1 - y0) / 2 - 6, win = 8;
      let o = `<rect x="20" y="${y0 - 14}" width="600" height="${y1 - y0 + 22}" rx="12" fill="#FFFFFF" opacity=".95"/><line x1="${X0}" x2="${X1}" y1="${cy}" y2="${cy}" stroke="#CBD5E1"/>${txt(X0 + 2, y0 - 2, 'x', 13, '#475569', 'start')}${txt(X1, y1 + 4, `${t(W.time)} →`, 12, '#475569', 'end')}`;
      if (!r) return o;
      const tEnd = r.t, tStart = Math.max(0, tEnd - win), pts = [];
      for (let k = 0; k <= 160; k++) { const tt = tStart + (tEnd - tStart) * k / 160; pts.push([X0 + (tt - tStart) / win * (X1 - X0), cy - fx(tt) / A * h]); }
      if (pts.length > 1) o += `<path d="${pathOf(pts)}" fill="none" stroke="${col}" stroke-width="3"/>`;
      return o;
    }

    // ---- pendulum: exact (nonlinear) swing, integrated with RK4 ----
    function pendStep(dt) {
      const r = S.run, g = PLANET[planet].g, l = P.length;
      const f = (th, om) => [om, -(g / l) * Math.sin(th)];
      const h = 1 / 400;
      let left = dt;
      while (left > 1e-9) {
        const s = Math.min(h, left);
        const [a1, b1] = f(r.th, r.om), [a2, b2] = f(r.th + a1 * s / 2, r.om + b1 * s / 2), [a3, b3] = f(r.th + a2 * s / 2, r.om + b2 * s / 2), [a4, b4] = f(r.th + a3 * s, r.om + b3 * s);
        const omOld = r.om, tOld = r.t;
        r.th += s * (a1 + 2 * a2 + 2 * a3 + a4) / 6; r.om += s * (b1 + 2 * b2 + 2 * b3 + b4) / 6; r.t += s;
        // a full oscillation ends when the bob is back at the start side and turns round (ω goes + → −)
        if (omOld > 0 && r.om <= 0) {
          const tc = tOld + s * omOld / (omOld - r.om);
          S.measured = tc - r.lastC; r.lastC = tc; S.cycles++;
          cycleDone();
        }
        left -= s;
      }
    }
    function scenePendulum() {
      const pl = PLANET[planet], r = S.run, th = r ? r.th : P.amplitude * PI / 180;
      const px = 320, py = 34, Lp = P.length * 140, bx = px + Lp * Math.sin(th), by = py + Lp * Math.cos(th);
      let o = `<defs><linearGradient id="wv-psky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pl.sky[0]}"/><stop offset="1" stop-color="${pl.sky[1]}"/></linearGradient><radialGradient id="wv-bob" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFE4B5"/><stop offset=".5" stop-color="#F59E0B"/><stop offset="1" stop-color="#92400E"/></radialGradient></defs>
        <rect width="640" height="${VB}" fill="url(#wv-psky)"/>`;
      if (planet === 'moon') for (let i = 0; i < 30; i++) o += `<circle cx="${(rnd(i) * 640).toFixed(0)}" cy="${(rnd(i + 50) * 200).toFixed(0)}" r="${(0.8 + rnd(i + 9) * 1.4).toFixed(1)}" fill="#F8FAFC" opacity=".8"/>`;
      if (planet === 'jupiter') o += `<g opacity=".25"><rect y="80" width="640" height="18" fill="#7C2D12"/><rect y="150" width="640" height="10" fill="#7C2D12"/></g>`;
      o += `<rect y="${VB - 34}" width="640" height="34" fill="${pl.ground}"/><rect x="200" y="22" width="240" height="14" rx="4" fill="#475569"/>`;
      // amplitude arc and the vertical
      const A0 = P.amplitude * PI / 180;
      o += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + Lp + 30}" stroke="${pl.ink}" stroke-opacity=".35" stroke-dasharray="4 5"/>`;
      o += `<path d="M${(px + (Lp + 22) * Math.sin(-A0)).toFixed(1)} ${(py + (Lp + 22) * Math.cos(A0)).toFixed(1)}A${Lp + 22} ${Lp + 22} 0 0 0 ${(px + (Lp + 22) * Math.sin(A0)).toFixed(1)} ${(py + (Lp + 22) * Math.cos(A0)).toFixed(1)}" fill="none" stroke="${pl.ink}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="3 4"/>`;
      o += `<line x1="${px}" y1="${py}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${pl.ink}" stroke-width="2"/><circle cx="${px}" cy="${py}" r="5" fill="#0F172A"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="16" fill="url(#wv-bob)" stroke="#78350F" stroke-width="1.5"/>`;
      o += txt(px + 34, py + 44, `${Math.round(th * 180 / PI)}°`, 16, pl.ink, 'start');
      o += pill(24, VB - 52, `${t(pl.n)} · g = ${pl.g} m/s²`, '#FFFFFF', '#0F172A', 'start', 14);
      o += pill(616, VB - 52, `l = ${num(P.length)} m`, '#FFFFFF', '#0F172A', 'end', 14);
      if (S.measured) o += pill(616, 60, `T = ${sig(S.measured, 3)} s`, '#DCFCE7', '#14532D', 'end', 15);
      return o;
    }

    // ---- shm: the reference circle and its shadow ----
    function sceneShm() {
      const w = TAU * P.frequency, tt = S.run ? S.run.t : 0, ph = w * tt, R = P.amplitude * 26, cx = 150, cy = 165;
      const qx = cx + R * Math.cos(ph), qy = cy - R * Math.sin(ph), sy = qy;
      let o = `<defs><linearGradient id="wv-hbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F172A"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient></defs><rect width="640" height="${VB}" fill="url(#wv-hbg)"/>`;
      o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(59,130,246,.12)" stroke="#60A5FA" stroke-width="2.5"/><line x1="${cx}" y1="${cy - R - 14}" x2="${cx}" y2="${cy + R + 14}" stroke="#FDE68A" stroke-width="3"/>`;
      o += `<line x1="${cx}" y1="${cy}" x2="${qx.toFixed(1)}" y2="${qy.toFixed(1)}" stroke="#F8FAFC" stroke-width="2"/><line x1="${qx.toFixed(1)}" y1="${qy.toFixed(1)}" x2="${cx}" y2="${sy.toFixed(1)}" stroke="#F8FAFC" stroke-dasharray="4 4" opacity=".7"/>`;
      const arcR = Math.min(26, R * 0.5), a = ((ph % TAU) + TAU) % TAU;
      if (a > 0.05) o += `<path d="M${cx + arcR} ${cy}A${arcR} ${arcR} 0 ${a > PI ? 1 : 0} 0 ${(cx + arcR * Math.cos(a)).toFixed(1)} ${(cy - arcR * Math.sin(a)).toFixed(1)}" fill="none" stroke="#FDE68A" stroke-width="2"/>`;
      o += `<circle cx="${qx.toFixed(1)}" cy="${qy.toFixed(1)}" r="8" fill="#EF4444" stroke="#fff" stroke-width="2"/>`;
      // the shadow particle with v and a arrows
      const v = R * w * Math.cos(ph), acc = -w * w * (R * Math.sin(ph));
      o += arrow(cx + 18, sy, cx + 18, sy - clamp(v * 0.12, -110, 110), '#22C55E', 3.5) + arrow(cx - 18, sy, cx - 18, sy - clamp(acc * 0.04, -110, 110), '#FB923C', 3.5);
      o += `<circle cx="${cx}" cy="${sy.toFixed(1)}" r="10" fill="#FDE047" stroke="#0F172A" stroke-width="2"/>`;
      o += txt(cx + 26, 30, 'v', 15, '#4ADE80', 'start') + txt(cx - 26, 30, 'a', 15, '#FDBA74', 'end');
      // x–t trace to the right (newest at the left edge, like a chart recorder)
      const GX = 300, pps = 80;
      o += `<rect x="${GX - 6}" y="${cy - 140}" width="336" height="280" rx="12" fill="rgba(15,23,42,.55)" stroke="#334155"/><line x1="${GX}" x2="630" y1="${cy}" y2="${cy}" stroke="#475569"/>${txt(GX + 4, cy - 124, 'x = A sin ωt', 14, '#FDE68A', 'start')}${txt(626, cy + 132, `← ${t(W.time)}`, 12, '#CBD5E1', 'end')}`;
      o += `<line x1="${cx + 10}" y1="${sy.toFixed(1)}" x2="${GX}" y2="${sy.toFixed(1)}" stroke="#FDE047" stroke-dasharray="2 4" opacity=".6"/>`;
      if (S.run) {
        const pts = [];
        for (let k = 0; k <= 200; k++) { const age = k / 200 * (330 / pps), tau = tt - age; if (tau < 0) break; pts.push([GX + age * pps, cy - R * Math.sin(w * tau)]); }
        if (pts.length > 1) o += `<path d="${pathOf(pts)}" fill="none" stroke="#FDE047" stroke-width="3"/>`;
        // mark one period
        const Tp = 1 / P.frequency;
        if (Tp * pps < 320 && tt > Tp) o += `<g>${dbl(GX, GX + Tp * pps, cy + 150 - 22, '#A5B4FC')}${pill(GX + Tp * pps / 2, cy + 150 - 22, `T = ${sig(Tp, 3)} s`, '#312E81', '#E0E7FF', 'middle', 12)}</g>`;
      }
      o += pill(20, 22, `A = ${num(P.amplitude, 1)} cm`, '#1E293B', '#F8FAFC', 'start', 13);
      return o;
    }

    // ---- interference and diffraction: a computed wave field on a canvas, the real pattern on the screen ----
    const FW = 380;      // the field occupies x 0..380 of the 640-wide view
    const SCX = 430;     // the screen strip
    let img = null, off = null;
    function fieldParams() {
      const lam = lamNm();
      const lv = lam / 32;                      // a schematic wavelength in view units (12–22)
      if (mode === 'interference') {
        const ratio = P.distance * 1e-3 / (lam * 1e-9);
        const rv = 1.6 + 3.2 * (Math.log(ratio) - Math.log(133)) / (Math.log(2500) - Math.log(133));
        const dv = clamp(rv, 1.4, 5) * lv;
        return { lv, sources: cover ? [[110, 170 - dv / 2]] : [[110, 170 - dv / 2], [110, 170 + dv / 2]], dv };
      }
      const ratio = P.distance * 1e-3 / (lam * 1e-9);
      const rv = 0.9 + 3.6 * (Math.log(ratio) - Math.log(28)) / (Math.log(750) - Math.log(28));
      const av = clamp(rv, 0.8, 4.6) * lv, N = 13, src = [];
      for (let i = 0; i < N; i++) src.push([110, 170 - av / 2 + av * i / (N - 1)]);
      return { lv, sources: src, av };
    }
    function screenI(yMm) {
      const lam = lamNm() * 1e-9, D = P.length, y = yMm * 1e-3;
      const sinc2 = (b) => (Math.abs(b) < 1e-6 ? 1 : Math.pow(Math.sin(b) / b, 2));
      if (mode === 'interference') {
        const a = 0.04e-3; // each slit is 0.04 mm wide
        const env = sinc2(PI * a * y / (lam * D));
        if (cover) return env;
        return env * Math.pow(Math.cos(PI * P.distance * 1e-3 * y / (lam * D)), 2);
      }
      return sinc2(PI * P.distance * 1e-3 * y / (lam * D));
    }
    const SCR = () => (mode === 'interference' ? 10 : 25);   // the screen shows ±10 mm or ±25 mm
    function drawCanvas() {
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const Wc = Math.max(1, Math.round(rect.width * dpr)), Hc = Math.max(1, Math.round(rect.height * dpr));
      if (cv.width !== Wc || cv.height !== Hc) { cv.width = Wc; cv.height = Hc; }
      const ctx = cv.getContext('2d'); if (!ctx) return;
      const sx = Wc / 640, sy = Hc / VB;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, Wc, Hc);
      const col = wlRGB(lamNm());
      // field
      const fp = fieldParams(), k = TAU / fp.lv, cell = 3, gw = Math.ceil(FW / cell), gh = Math.ceil(VB / cell);
      if (!off) { off = document.createElement('canvas'); }
      if (off.width !== gw || off.height !== gh) { off.width = gw; off.height = gh; img = null; }
      const oc = off.getContext('2d');
      if (!img) img = oc.createImageData(gw, gh);
      const d = img.data, ph = reduced() ? 0 : S.now * 2.4 * TAU / 3;
      const on = S.on;
      for (let j = 0; j < gh; j++) {
        const y = j * cell + cell / 2;
        for (let i = 0; i < gw; i++) {
          const x = i * cell + cell / 2;
          let v = 0, wgt = 0.35;
          if (!on) v = 0;
          else if (x < 110) { v = Math.cos(k * x - ph); wgt = 0.55; }
          else {
            let re = 0;
            for (const [qx, qy] of fp.sources) { const r = Math.hypot(x - qx, y - qy) + 0.5; re += Math.cos(k * (r + 110) - ph) / Math.sqrt(r); }
            v = re / fp.sources.length * 6; wgt = 0.5;
          }
          const b = on ? clamp(0.5 + wgt * v, 0, 1) : 0.06;
          const p = (j * gw + i) * 4;
          d[p] = col[0] * b; d[p + 1] = col[1] * b; d[p + 2] = col[2] * b; d[p + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, gw, gh, 0, 0, gw * cell * sx, gh * cell * sy);
      // barrier with slits
      ctx.fillStyle = '#CBD5E1';
      const slits = mode === 'interference' ? (cover ? [[170 - fp.dv / 2, 3]] : [[170 - fp.dv / 2, 3], [170 + fp.dv / 2, 3]]) : [[170, fp.av / 2]];
      const ys = [0];
      slits.forEach(([c, hw]) => { ys.push(c - hw, c + hw); });
      ys.push(VB);
      for (let i = 0; i < ys.length; i += 2) ctx.fillRect((110 - 4) * sx, ys[i] * sy, 8 * sx, Math.max(0, ys[i + 1] - ys[i]) * sy);
      if (mode === 'interference' && cover) { ctx.fillStyle = '#F59E0B'; ctx.fillRect((110 - 6) * sx, (170 + fp.dv / 2 - 7) * sy, 12 * sx, 14 * sy); }
      // the screen: the real intensity pattern
      const R = SCR();
      for (let py = 0; py < VB; py += 1) {
        const yMm = (py - 170) / 150 * R;
        const I = on ? screenI(yMm) : 0;
        ctx.fillStyle = `rgb(${Math.round(col[0] * I)},${Math.round(col[1] * I)},${Math.round(col[2] * I)})`;
        ctx.fillRect(SCX * sx, py * sy, 34 * sx, Math.ceil(sy) + 1);
      }
      // intensity graph
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1 * sx;
      ctx.beginPath(); ctx.moveTo(526 * sx, 20 * sy); ctx.lineTo(526 * sx, 320 * sy); ctx.stroke();
      if (on) {
        ctx.strokeStyle = rgbHex(col); ctx.lineWidth = 2.5 * sx; ctx.beginPath();
        for (let py = 20; py <= 320; py += 1) { const yMm = (py - 170) / 150 * R, I = screenI(yMm); const X = (526 + I * 104) * sx, Y = py * sy; if (py === 20) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
        ctx.stroke();
      }
    }
    function sceneLight() {
      const R = SCR(), fp = fieldParams();
      let o = '';
      o += pill(8, VB - 16, t(W.notScale), '#0F172A', '#E2E8F0', 'start', 11);
      o += txt(SCX + 17, 14, t(T('screen', 'पर्दा')), 12, '#E2E8F0');
      o += txt(580, 14, t(T('brightness', 'चमक')), 12, '#E2E8F0');
      // mm ticks for the screen
      const step = mode === 'interference' ? 5 : 10;
      for (let mm = -R; mm <= R; mm += step) { const y = 170 + mm / R * 150; o += `<line x1="${SCX + 34}" x2="${SCX + 42}" y1="${y}" y2="${y}" stroke="#94A3B8"/>${txt(SCX + 46, y + 4, `${num(mm)} mm`, 10, '#CBD5E1', 'start', 600)}`; }
      o += `<line x1="${SCX + 34}" x2="${SCX + 34}" y1="20" y2="320" stroke="#94A3B8"/>`;
      // a light source on the left
      o += `<g transform="translate(16 170)"><rect x="0" y="-16" width="40" height="32" rx="6" fill="#334155" stroke="#64748B"/><circle cx="34" cy="0" r="6" fill="${S.on ? rgbHex(wlRGB(lamNm())) : '#475569'}"/></g>`;
      if (mode === 'interference') {
        if (!cover) { o += txt(98, 170 - fp.dv / 2 - 10, 'S₁', 13, '#F8FAFC', 'end') + txt(98, 170 + fp.dv / 2 + 20, 'S₂', 13, '#F8FAFC', 'end'); }
        if (S.on && !cover) {
          const beta = lamNm() * 1e-9 * P.length / (P.distance * 1e-3) * 1e3;
          const bp = beta / R * 150;
          if (bp > 10 && bp < 140) o += `<g>${arrow(SCX - 6, 170, SCX - 6, 170 - bp, '#FDE68A', 2)}${arrow(SCX - 6, 170 - bp, SCX - 6, 170, '#FDE68A', 2)}${txt(SCX - 10, 170 - bp / 2 + 4, 'β', 14, '#FDE68A', 'end')}</g>`;
        }
      } else if (S.on) {
        const y1 = lamNm() * 1e-9 * P.length / (P.distance * 1e-3) * 1e3, yp = y1 / R * 150;
        if (yp < 148) o += `<g>${arrow(SCX - 6, 170 - yp, SCX - 6, 170 + yp, '#FDE68A', 2)}${arrow(SCX - 6, 170 + yp, SCX - 6, 170 - yp, '#FDE68A', 2)}</g>${txt(SCX - 10, 170 + 4, '2λD/a', 12, '#FDE68A', 'end')}`;
      }
      if (!S.on) o += pill(200, 170, t(T('Light is off', 'प्रकाश बंद है')), '#1E293B', '#F8FAFC', 'middle', 14);
      return o;
    }

    // ---- spectrum: a log band with the current frequency ----
    function sceneSpectrum() {
      const list = view === 'em' ? EM : SND, lo = view === 'em' ? 4 : 0, hi = view === 'em' ? 21 : 7, X0 = 30, X1 = 610, Y = 168;
      const xOf = (lf) => X0 + (lf - lo) / (hi - lo) * (X1 - X0);
      const fq = fSpec(), lf = P.frequency, b = bandOf(list, fq);
      let o = `<defs><linearGradient id="wv-vis" x1="0" y1="0" x2="1" y2="0">${[700, 650, 600, 570, 530, 490, 450, 400].map((w, i) => `<stop offset="${(i / 7).toFixed(2)}" stop-color="${rgbHex(wlRGB(w))}"/>`).join('')}</linearGradient><linearGradient id="wv-spbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1226"/><stop offset="1" stop-color="#1E1B4B"/></linearGradient></defs><rect width="640" height="${VB}" fill="url(#wv-spbg)"/>`;
      // the wave (schematic: drawn wavelength shrinks as f rises)
      const lv = 260 * Math.pow(10, -(lf - lo) / (hi - lo) * Math.log10(260 / 7));
      const wcol = view === 'em' && b.id === 'visible' ? rgbHex(wlRGB(clamp(C / fq * 1e9, 400, 700))) : b.c;
      const ph = reduced() || !S.on ? 0 : S.wavePhase;
      const pts = [];
      for (let x = 30; x <= 610; x += Math.max(1, Math.min(3, lv / 10))) pts.push([x, 58 - 26 * Math.sin(TAU * (x - 30) / lv - ph)]);
      o += `<path d="${pathOf(pts)}" fill="none" stroke="${wcol}" stroke-width="3" stroke-linejoin="round"/>`;
      o += txt(610, VB - 8, t(W.notScale), 11, '#94A3B8', 'end', 600);
      // bands
      list.forEach((bd, i) => {
        const a = xOf(Math.max(lo, bd.lo > 0 ? Math.log10(bd.lo) : lo)), z = xOf(Math.min(hi, isFinite(bd.hi) ? Math.log10(bd.hi) : hi));
        if (z <= a) return;
        o += bd.id === 'visible' ? `<rect x="${a.toFixed(1)}" y="${Y - 20}" width="${(z - a).toFixed(1)}" height="40" fill="url(#wv-vis)"/>` : `<rect x="${a.toFixed(1)}" y="${Y - 20}" width="${(z - a).toFixed(1)}" height="40" fill="${bd.c}" opacity="${bd === b ? 1 : 0.55}"/>`;
        const mid = (a + z) / 2, narrow = z - a < 50;
        const row = narrow ? (i % 2 ? 1 : 0) : 0;
        o += narrow
          ? `<line x1="${mid.toFixed(1)}" x2="${mid.toFixed(1)}" y1="${Y + 20}" y2="${Y + 36 + row * 20}" stroke="#94A3B8"/>${txt(mid, Y + 50 + row * 20, t(bd.n), 12, bd === b ? '#FFFFFF' : '#CBD5E1', mid > 560 ? 'end' : 'middle')}`
          : txt(mid, Y + 6, t(bd.n), z - a > 120 ? 15 : 12, '#0F172A', 'middle', 800);
      });
      o += `<rect x="${X0}" y="${Y - 20}" width="${X1 - X0}" height="40" fill="none" stroke="#E2E8F0" stroke-width="1.5" rx="2"/>`;
      // frequency ticks
      for (let e = Math.ceil(lo); e <= hi; e += view === 'em' ? 2 : 1) { const x = xOf(e); o += `<line x1="${x}" x2="${x}" y1="${Y - 26}" y2="${Y - 20}" stroke="#94A3B8"/>${txt(x, Y - 30, `10${String(e).split('').map((c) => SUP[c]).join('')}`, 11, '#CBD5E1', 'middle', 600)}`; }
      o += txt(X0, Y - 44, `${t(W.freq)} (Hz) →`, 12, '#E2E8F0', 'start');
      if (view === 'sound') {
        // the human range and the zoom labels
        const a = xOf(Math.log10(20)), z = xOf(Math.log10(20000));
        o += `<g>${dbl(a, z, Y + 66, '#86EFAC')}${pill((a + z) / 2, Y + 66, t(W.human), '#14532D', '#DCFCE7', 'middle', 12)}</g>`;
      } else {
        const a = xOf(Math.log10(C / 700e-9)), z = xOf(Math.log10(C / 400e-9));
        o += `<path d="M${a} ${Y + 20}L250 ${Y + 74}H390L${z} ${Y + 20}" fill="rgba(255,255,255,.08)" stroke="#94A3B8" stroke-dasharray="3 3"/><rect x="250" y="${Y + 74}" width="140" height="18" fill="url(#wv-vis)" rx="3"/>${txt(250, Y + 108, '700 nm', 11, '#CBD5E1', 'start', 600)}${txt(390, Y + 108, '400 nm', 11, '#CBD5E1', 'end', 600)}`;
        if (b.id === 'visible') { const wl = C / fq * 1e9, xm = 250 + (700 - wl) / 300 * 140; o += `<path d="M${xm.toFixed(1)} ${Y + 72}l-6-10h12z" fill="#FFFFFF"/>`; }
      }
      // pointer
      const xp = xOf(lf);
      o += `<path d="M${xp.toFixed(1)} ${Y - 22}l-9-14h18z" fill="#FFFFFF" stroke="#0F172A"/><line x1="${xp.toFixed(1)}" x2="${xp.toFixed(1)}" y1="${Y - 20}" y2="${Y + 20}" stroke="#FFFFFF" stroke-width="3"/>`;
      return o;
    }

    // ================================================================ the loop
    let myK = 1;
    function measureK() { const w = svg.getBoundingClientRect().width; myK = w > 0 ? clamp(560 / w, 1, 1.55) : 1; }
    function frame() {
      FK = myK;
      let o = '';
      if (mode === 'vibrate') o = sceneVibrate();
      else if (mode === 'string') o = sceneString();
      else if (mode === 'pipe') o = scenePipe();
      else if (mode === 'echo') o = sceneEcho();
      else if (mode === 'spring') o = sceneSpring();
      else if (mode === 'pendulum') o = scenePendulum();
      else if (mode === 'shm') o = sceneShm();
      else if (usesCanvas) { drawCanvas(); o = sceneLight(); }
      else if (mode === 'spectrum') o = sceneSpectrum();
      svg.innerHTML = o;
    }
    let lastT = null;
    function tick(ms) {
      const n = ms / 1000 - S.t0;
      const dt = lastT == null ? 0 : clamp(n - lastT, 0, 0.1);
      lastT = n; S.now = n;
      step(dt);
      frame();
      if (n - S.lastTxt > 0.12 && (mode === 'shm' || mode === 'spring' || mode === 'pendulum') && S.run) { S.lastTxt = n; texts(); }
      S.raf = requestAnimationFrame(tick);
    }
    // advance the physics by dt seconds
    function step(dt) {
      if (mode === 'vibrate') {
        const m = med(), vPx = m.v * m.scale / SLOW_V || 1, keep = (VX1 - VX0) / vPx + 0.5;
        S.segs = S.segs.filter((g) => g.t1 === Infinity || S.now - g.t1 < keep);
        const cur = S.segs[S.segs.length - 1];
        if (cur && cur.dec != null && S.now - cur.dec > 8 && cur.t1 === Infinity) cur.t1 = S.now;
      } else if (mode === 'string' || mode === 'pipe') {
        const target = S.on ? (mode === 'string' ? 1 / Math.sqrt(Math.pow(Math.sin(PI * P.frequency / f1String()), 2) + 0.03 * 0.03) : pipeResp().R) : 0;
        S.dAmp += (target - S.dAmp) * (reduced() ? 1 : clamp(dt / 0.45, 0, 1));
        if (S.pluck && S.now - S.pluck.t0 > 7) S.pluck = null;
        if (S.on && AU.tone) toneSet(P.frequency, 0.012 + 0.05 * clamp(S.dAmp / (mode === 'string' ? 33 : 20), 0, 1));
      } else if (mode === 'echo') {
        const E = S.echo;
        if (E && !E.back && S.now - E.t0 >= E.dur) echoBack();
        if (E && S.now - E.t0 > E.dur + 2.5) S.echo = Object.assign(E, { done: true });
      } else if (mode === 'spring' && S.run && S.on) {
        S.run.t += dt;
        const c = Math.floor(S.run.t / Tsp());
        if (c > S.cycles) { S.cycles = c; cycleDone(); }
      } else if (mode === 'pendulum' && S.run && S.on) pendStep(dt);
      else if (mode === 'shm' && S.run && S.on) {
        S.run.t += dt;
        const c = Math.floor(S.run.t * P.frequency);
        if (c > S.cycles) { S.cycles = c; cycleDone(); }
      } else if (mode === 'spectrum' && S.on) S.wavePhase += dt * TAU * 0.8;
    }

    // ================================================================ events
    function cycleDone() {
      if (S.cycles !== 1 && !(mode === 'shm' && S.cycles <= 3)) return;
      api.emit('period');
      const Tt = mode === 'spring' ? Tsp() : mode === 'pendulum' ? S.measured : 1 / P.frequency;
      api.record(t(T(`One full oscillation took ${sig(Tt, 3)} s`, `एक पूरे दोलन में ${sig(Tt, 3)} s लगे`)));
      if (S.cycles === 1) live(T(`One full oscillation took ${sig(Tt, 3)} s. That is the time period T.`, `एक पूरे दोलन में ${sig(Tt, 3)} s लगे। यही आवर्तकाल T है।`), 'ok');
    }
    function checkResonance() {
      if (mode !== 'string' && mode !== 'pipe') return;
      let res = false;
      if (S.on) {
        if (mode === 'string') { const f1 = f1String(); res = Math.abs(Math.sin(PI * P.frequency / f1)) < 0.07 && P.frequency > 0.9 * f1; }
        else res = Math.abs(pipeResp().F) < 0.06;
      }
      if (res && !S.resOn) {
        S.resOn = true;
        api.emit('resonance');
        const n = mode === 'string' ? Math.round(P.frequency / f1String()) : nearestPipe();
        api.record(t(T(`Resonance at ${P.frequency} Hz`, `${P.frequency} Hz पर अनुनाद`)));
        live(mode === 'string'
          ? T(`Resonance! ${P.frequency} Hz matches a natural frequency of the string, so it shakes hard in ${n} loop${n > 1 ? 's' : ''}.`, `अनुनाद! ${P.frequency} Hz तार की एक प्राकृतिक आवृत्ति से मेल खाती है, इसलिए तार ${n} लूप में ज़ोर से काँपता है।`)
          : T(`Resonance! ${P.frequency} Hz matches a natural frequency of the air column, so the sound becomes loud.`, `अनुनाद! ${P.frequency} Hz वायु-स्तंभ की एक प्राकृतिक आवृत्ति से मेल खाती है, इसलिए ध्वनि तेज़ हो जाती है।`), 'ok');
      } else if (!res && S.resOn) S.resOn = false;
    }
    function echoBack() {
      const E = S.echo; E.back = true;
      if (E.te >= 0.1) {
        api.emit('echo');
        api.record(t(T(`Heard an echo after ${sig(E.te, 3)} s`, `${sig(E.te, 3)} s बाद प्रतिध्वनि सुनी`)));
        live(T(`Echo! The sound went ${P.distance} m and came back in ${sig(E.te, 3)} s. That is more than 0.1 s, so you hear it as a separate sound.`, `प्रतिध्वनि! ध्वनि ${P.distance} m गई और ${sig(E.te, 3)} s में लौट आई। यह 0.1 s से अधिक है, इसलिए यह अलग ध्वनि के रूप में सुनाई देती है।`), 'ok');
      } else {
        api.record(t(T('The reflection came back too soon to be an echo', 'परावर्तित ध्वनि प्रतिध्वनि बनने के लिए बहुत जल्दी लौटी')));
        live(T(`The sound came back in only ${sig(E.te, 3)} s. That is less than 0.1 s, so it mixes with the clap and you hear no separate echo. Move further away.`, `ध्वनि केवल ${sig(E.te, 3)} s में लौट आई। यह 0.1 s से कम है, इसलिए यह ताली में मिल जाती है और अलग प्रतिध्वनि नहीं सुनाई देती। और दूर जाओ।`), 'warn');
      }
    }
    function startEcho() {
      const te = echoT(), slow = echoSlow();
      S.echo = { t0: S.now, te, slow, dur: te * slow, back: false };
      clickSnd(0, 0.12);
      if (AU.ctx && AU.on) clickSnd(te, 0.05);
      api.record(t(T(`Clapped ${P.distance} m from the reflector`, `परावर्तक से ${P.distance} m दूर ताली बजाई`)));
      live(T('The sound travels out…', 'ध्वनि आगे बढ़ रही है…'));
      if (reduced()) { S.echo.t0 = S.now - S.echo.dur; echoBack(); }
    }
    function playToggle() {
      if (mode === 'echo') { startEcho(); return; }
      S.on = !S.on;
      if (mode === 'vibrate') {
        if (S.on) { vibStart(false); if (medium !== 'vacuum') toneSet(P.frequency, SAFE * P.amplitude / 10, true); api.emit('vibrating'); api.record(t(T(`Made the fork vibrate at ${P.frequency} Hz`, `काँटे को ${P.frequency} Hz पर कंपित किया`))); live(medium === 'vacuum' ? T('The fork vibrates, but there are no particles to pass the vibration on. No sound reaches the ear.', 'काँटा कंपन करता है, पर कंपन आगे पहुँचाने के लिए कोई कण नहीं हैं। कान तक कोई ध्वनि नहीं पहुँचती।') : T('The vibrating prongs push and pull the particles next to them. The disturbance moves on to the ear; the particles only move back and forth.', 'कंपन करती भुजाएँ पास के कणों को धकेलती और खींचती हैं। विक्षोभ कान तक जाता है; कण केवल आगे-पीछे होते हैं।')); }
        else { vibStop(); toneOff(); }
      } else if (mode === 'string' || mode === 'pipe') {
        if (S.on) { toneSet(P.frequency, 0.015, true); api.emit('vibrating'); api.record(t(T(`Switched on at ${P.frequency} Hz`, `${P.frequency} Hz पर चालू किया`))); live(mode === 'string' ? T('The vibrator shakes one end. Change its frequency slowly and look for a big, steady pattern.', 'कंपित्र एक सिरे को हिलाता है। उसकी आवृत्ति धीरे-धीरे बदलो और बड़ा, स्थिर पैटर्न खोजो।') : T('The speaker pushes the air at the open end. Change the frequency slowly until the air column shakes hard.', 'स्पीकर खुले सिरे पर हवा को धकेलता है। आवृत्ति धीरे-धीरे बदलो जब तक वायु-स्तंभ ज़ोर से न काँपे।')); }
        else { toneOff(); S.resOn = false; }
        checkResonance();
      } else if (mode === 'spring' || mode === 'pendulum' || mode === 'shm') {
        if (S.on) {
          S.run = { t: 0, th: P.amplitude * PI / 180, om: 0, lastC: 0 }; S.cycles = 0; S.measured = null;
          api.emit('vibrating'); api.record(t(T('Started the oscillation', 'दोलन शुरू किया')));
          live(mode === 'shm' ? T('Watch the yellow shadow: fastest in the middle, stopping for a moment at each end.', 'पीली छाया देखो: बीच में सबसे तेज़, हर सिरे पर एक पल रुकती है।') : T('Count one full oscillation: there, back, and there again.', 'एक पूरा दोलन गिनो: वहाँ जाना, लौटना, और फिर वहीं आना।'));
          if (reduced()) {
            if (mode === 'pendulum') { pendStep(10 * Tpend() + 0.01); S.on = false; }
            else { const Tt = mode === 'spring' ? Tsp() : 1 / P.frequency; S.run.t = Tt * 1.25; S.cycles = 1; cycleDone(); S.on = false; }
          }
        } else { api.record(t(T('Stopped', 'रोका'))); }
      } else if (usesCanvas) {
        if (S.on) { api.record(t(T('Switched on the light', 'प्रकाश चालू किया'))); lightResult(); }
        else S.emittedFringes = false;
      } else if (mode === 'spectrum') {
        if (S.on && view === 'sound') soundSpectrumTone(true);
        if (!S.on) toneOff();
      }
      syncButtons(); texts();
    }
    function lightResult() {
      if (!S.on) return;
      if (mode === 'interference' && cover) { live(T('With one slit there is no second wave to meet, so the stripes disappear. You see one broad patch of light.', 'एक झिरी से मिलने वाली दूसरी तरंग नहीं होती, इसलिए धारियाँ गायब हो जाती हैं। प्रकाश का एक चौड़ा धब्बा दिखता है।'), 'warn'); return; }
      api.emit('fringes');
      if (mode === 'interference') { const beta = lamNm() * 1e-9 * P.length / (P.distance * 1e-3) * 1e3; live(T(`Bright and dark fringes, each ${sig(beta, 3)} mm apart (β = λD/d).`, `चमकीली और काली फ्रिंज, हर एक ${sig(beta, 3)} mm की दूरी पर (β = λD/d)।`), 'ok'); }
      else { const w = 2 * lamNm() * 1e-9 * P.length / (P.distance * 1e-3) * 1e3; live(T(`A bright central band ${sig(w, 3)} mm wide, with fainter bands on each side.`, `बीच में ${sig(w, 3)} mm चौड़ी चमकीली पट्टी, दोनों ओर हल्की पट्टियाँ।`), 'ok'); }
    }
    function soundSpectrumTone(gesture) {
      const fq = fSpec();
      if (fq >= 20 && fq <= 20000) { toneSet(fq, 0.04, gesture); return true; }
      toneOff(); return false;
    }
    function pluck() {
      if (mode === 'vibrate') {
        if (S.on) { S.on = false; }
        vibStart(true);
        if (medium !== 'vacuum' && AU.on) pluckSnd(P.frequency, P.amplitude * 1.4, 4);
        toneOff();
        api.emit('vibrating'); api.record(t(T('Struck the fork once', 'काँटे पर एक बार चोट की')));
        live(medium === 'vacuum' ? T('The fork rings, but no sound can travel through a vacuum.', 'काँटा बजता है, पर निर्वात में ध्वनि नहीं चल सकती।') : T('One strike: the vibration slowly dies away, so the sound gets softer and softer.', 'एक चोट: कंपन धीरे-धीरे थमता है, इसलिए ध्वनि धीमी होती जाती है।'));
      } else {
        if (S.on) { S.on = false; toneOff(); S.resOn = false; }
        S.pluck = { t0: S.now, h: P.amplitude * 5 };
        pluckSnd(f1String(), P.amplitude, 2.6);
        api.emit('vibrating');
        const f1 = f1String();
        if (S.lastPluckF != null && Math.abs(f1 - S.lastPluckF) > 0.5) api.emit(f1 > S.lastPluckF ? 'pitch:high' : 'pitch:low');
        S.lastPluckF = f1;
        api.record(t(T(`Plucked the string: ${sig(f1, 3)} Hz`, `तार छेड़ा: ${sig(f1, 3)} Hz`)));
        live(T(`The string vibrates mostly at its lowest natural frequency, f₁ = ${sig(f1, 3)} Hz, with weaker higher harmonics mixed in.`, `तार मुख्य रूप से अपनी सबसे नीची प्राकृतिक आवृत्ति f₁ = ${sig(f1, 3)} Hz पर कंपन करता है, साथ में हल्के ऊँचे संनादी भी।`));
      }
      syncButtons(); texts();
    }

    // ----- clicks -----
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.tagName === 'INPUT') return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'play') playToggle();
      else if (key === 'pluck') pluck();
      else if (key === 'toggle:sound') {
        AU.on = !AU.on;
        if (AU.on) {
          actx(true);
          if (mode === 'vibrate' && S.on && medium !== 'vacuum') toneSet(P.frequency, SAFE * P.amplitude / 10, true);
          if ((mode === 'string' || mode === 'pipe') && S.on) toneSet(P.frequency, 0.015, true);
          if (mode === 'spectrum' && S.on && view === 'sound') soundSpectrumTone(true);
        } else toneOff();
        api.record(t(AU.on ? T('Turned the sound on', 'आवाज़ चालू की') : T('Turned the sound off', 'आवाज़ बंद की')));
        syncButtons();
      } else if (key.startsWith('medium:')) {
        const m = key.slice(7); if (m === medium) return;
        medium = m;
        if (mode === 'vibrate') { const was = S.on; S.segs = []; if (was) { vibStart(false); if (m === 'vacuum') toneOff(); else toneSet(P.frequency, SAFE * P.amplitude / 10, true); } }
        if (mode === 'echo') { defs = sliderDefs(mode, medium, view); P.distance = defs[0].def; rebuildSliders(); S.echo = null; }
        api.record(t(T(`Changed the medium to ${MED[m].n.en.toLowerCase()}`, `माध्यम बदलकर ${MED[m].n.hi} किया`)));
        live(m === 'vacuum' ? T('All the air is pumped out of the jar. Nothing is left to carry the sound.', 'जार से सारी हवा निकाल दी गई। ध्वनि ले जाने के लिए कुछ नहीं बचा।')
          : T(`Sound travels at ${MED[m].v} m/s in ${MED[m].n.en.toLowerCase()}. ${mode === 'vibrate' ? 'The frequency stays the same, so the wavelength changes: λ = v / f.' : ''}`, `${MED[m].n.hi} में ध्वनि ${MED[m].v} m/s से चलती है। ${mode === 'vibrate' ? 'आवृत्ति वही रहती है, इसलिए तरंगदैर्ध्य बदलती है: λ = v / f।' : ''}`));
      } else if (key.startsWith('pipe:')) {
        const before = pipeF(1);
        pipeType = key.slice(5);
        const after = pipeF(1);
        if (after !== before) api.emit(after > before ? 'pitch:high' : 'pitch:low');
        api.record(t(pipeType === 'open' ? T('Opened both ends of the pipe', 'नली के दोनों सिरे खोले') : T('Closed one end of the pipe', 'नली का एक सिरा बंद किया')));
        live(pipeType === 'open' ? T(`Open at both ends: the lowest note is f₁ = v/2L = ${sig(after, 3)} Hz, an octave higher than the closed pipe.`, `दोनों सिरे खुले: सबसे नीचा स्वर f₁ = v/2L = ${sig(after, 3)} Hz, बंद नली से एक सप्तक ऊँचा।`) : T(`Closed at one end: the lowest note is f₁ = v/4L = ${sig(after, 3)} Hz, and only odd harmonics are possible.`, `एक सिरा बंद: सबसे नीचा स्वर f₁ = v/4L = ${sig(after, 3)} Hz, और केवल विषम संनादी संभव हैं।`));
        S.resOn = false; checkResonance();
      } else if (key.startsWith('planet:')) {
        planet = key.slice(7); S.run = null; S.on = false; S.cycles = 0; S.measured = null;
        api.record(t(T(`Took the pendulum to ${PLANET[planet].n.en}`, `लोलक को ${PLANET[planet].n.hi} पर ले गए`)));
        live(T(`On ${PLANET[planet].n.en}, g = ${PLANET[planet].g} m/s². The formula gives T = ${sig(Tpend(), 3)} s. Let it go to check.`, `${PLANET[planet].n.hi} पर g = ${PLANET[planet].g} m/s² है। सूत्र से T = ${sig(Tpend(), 3)} s आता है। छोड़कर जाँचो।`));
      } else if (key.startsWith('slit:')) {
        cover = key === 'slit:cover';
        api.record(t(cover ? T('Covered one slit', 'एक झिरी ढकी') : T('Opened both slits', 'दोनों झिरियाँ खोलीं')));
        if (S.on) lightResult();
      } else if (key.startsWith('view:')) {
        const v = key.slice(5); if (v === view) return;
        view = v; defs = sliderDefs(mode, medium, view); P.frequency = defs[0].def; rebuildSliders(); toneOff();
        S.lastBand = null; bandEvent();
        api.record(t(view === 'sound' ? T('Looked at the sound spectrum', 'ध्वनि स्पेक्ट्रम देखा') : T('Looked at the electromagnetic spectrum', 'विद्युत-चुंबकीय स्पेक्ट्रम देखा')));
        if (S.on && view === 'sound') soundSpectrumTone(true);
      }
      syncButtons(); syncSliders(); texts();
      if (reduced()) frame();
    }
    function bandEvent() {
      if (mode !== 'spectrum') return;
      const b = bandOf(view === 'em' ? EM : SND, fSpec());
      if (b.id !== S.lastBand) {
        if (S.lastBand != null) { api.emit('band:' + b.id); live(T(`Now in: ${b.n.en}.`, `अब: ${b.n.hi}।`)); }
        S.lastBand = b.id;
      }
    }
    function rebuildSliders() {
      root.querySelector('.wv-sliders').innerHTML = sliderHTML();
      bindSliders();
    }
    // ----- sliders -----
    function bindSliders() {
      defs.forEach((d) => {
        const inp = sliderEl(d.k); if (!inp) return;
        let startV = P[d.k], startF = null;
        const key = 'slider:' + d.k;
        const pitchNow = () => (mode === 'string' ? f1String() : mode === 'pipe' ? pipeF(1) : P.frequency);
        inp.addEventListener('pointerdown', () => { startV = P[d.k]; startF = pitchNow(); });
        inp.addEventListener('focus', () => { startV = P[d.k]; startF = pitchNow(); });
        inp.addEventListener('input', () => {
          if (!api.allowed(key)) { api.nudge(key); inp.value = P[d.k]; return; }
          if (startF == null) { startV = P[d.k]; startF = pitchNow(); }
          P[d.k] = parseFloat(inp.value);
          onSlide(d.k);
          syncSliders();
          if (reduced()) frame();
        });
        inp.addEventListener('change', () => {
          if (!api.allowed(key)) return;
          const v = P[d.k];
          api.record(t(T(`Set ${t(d.label).toLowerCase()} to ${d.fmt ? d.fmt(v) : num(v, 2) + ' ' + d.unit}`, `${t(d.label)} = ${d.fmt ? d.fmt(v) : num(v, 2) + ' ' + d.unit} किया`)));
          slideDone(d.k, startV, startF);
          startV = v; startF = pitchNow();
        });
      });
    }
    function onSlide(k) {
      if (mode === 'vibrate') { vibChange(); if (S.on && medium !== 'vacuum') toneSet(P.frequency, SAFE * P.amplitude / 10, false); }
      else if (mode === 'string' || mode === 'pipe') checkResonance();
      else if (mode === 'spring' || mode === 'pendulum' || mode === 'shm') {
        if (mode === 'shm' && S.run) { /* keep running smoothly: keep the phase */ const ph = S.run.t * (S.prevF || P.frequency); S.run.t = ph / P.frequency; }
        else { S.run = null; S.on = false; S.cycles = 0; S.measured = null; }
        S.prevF = P.frequency;
      } else if (usesCanvas) { /* the canvas redraws every frame */ }
      else if (mode === 'spectrum') { bandEvent(); if (S.on && view === 'sound') soundSpectrumTone(false); }
      else if (mode === 'echo') S.echo = null;
      texts(); syncButtons();
    }
    function slideDone(k, v0, f0) {
      const v = P[k];
      if (v === v0) return;
      if (mode === 'vibrate' && k === 'frequency') { api.emit(v > v0 ? 'pitch:high' : 'pitch:low'); live(v > v0 ? T(`Higher frequency (${v} Hz): a higher pitch, and shorter waves.`, `ऊँची आवृत्ति (${v} Hz): ऊँचा तारत्व, और छोटी तरंगें।`) : T(`Lower frequency (${v} Hz): a lower pitch, and longer waves.`, `नीची आवृत्ति (${v} Hz): नीचा तारत्व, और लंबी तरंगें।`)); }
      if ((mode === 'vibrate' || mode === 'string') && k === 'amplitude') { api.emit(v > v0 ? 'loud' : 'soft'); live(v > v0 ? T('Bigger amplitude: a louder sound. The pitch does not change.', 'बड़ा आयाम: तेज़ ध्वनि। तारत्व नहीं बदलता।') : T('Smaller amplitude: a softer sound. The pitch does not change.', 'छोटा आयाम: धीमी ध्वनि। तारत्व नहीं बदलता।')); }
      if ((mode === 'string' && (k === 'length' || k === 'tension')) || (mode === 'pipe' && k === 'length')) {
        const f1 = mode === 'string' ? f1String() : pipeF(1);
        if (f0 != null && Math.abs(f1 - f0) > 0.01) {
          api.emit(f1 > f0 ? 'pitch:high' : 'pitch:low');
          const why = mode === 'pipe' ? T('a shorter air column gives a higher note', 'छोटा वायु-स्तंभ ऊँचा स्वर देता है') : k === 'length' ? T('a shorter string gives a higher note', 'छोटा तार ऊँचा स्वर देता है') : T('a tighter string gives a higher note', 'ज़्यादा कसा तार ऊँचा स्वर देता है');
          live(T(`Lowest note now ${sig(f1, 3)} Hz (${f1 > f0 ? 'higher' : 'lower'} pitch): ${why.en}.`, `सबसे नीचा स्वर अब ${sig(f1, 3)} Hz (${f1 > f0 ? 'ऊँचा' : 'नीचा'} तारत्व): ${why.hi}।`));
        }
      }
      if (mode === 'spectrum' && view === 'sound' && k === 'frequency') api.emit(v > v0 ? 'pitch:high' : 'pitch:low');
      if (usesCanvas && S.on) lightResult();
      if (mode === 'echo') { const te = echoT(); live(te >= 0.1 ? T(`At ${P.distance} m the echo returns after ${sig(te, 3)} s. Clap to hear it.`, `${P.distance} m पर प्रतिध्वनि ${sig(te, 3)} s बाद लौटती है। सुनने के लिए ताली बजाओ।`) : T(`At ${P.distance} m the sound returns after only ${sig(te, 3)} s: less than 0.1 s.`, `${P.distance} m पर ध्वनि केवल ${sig(te, 3)} s में लौटती है: 0.1 s से कम।`), te >= 0.1 ? '' : 'warn'); }
    }

    // ----- start -----
    root.addEventListener('click', onClick);
    measureK();
    let roK = null;
    if (window.ResizeObserver) { roK = new ResizeObserver(() => { measureK(); if (reduced()) frame(); }); roK.observe(svg); }
    bindSliders();
    syncButtons(); syncSliders(); texts();
    live(INTRO);
    if (mode === 'spectrum') S.lastBand = bandOf(view === 'em' ? EM : SND, fSpec()).id;
    let ro = null;
    if (reduced()) {
      frame();
      if (usesCanvas && window.ResizeObserver) { ro = new ResizeObserver(() => frame()); ro.observe(root.querySelector('.wv-stage')); }
      // in reduced motion every change redraws once (see onClick and the sliders)
    } else S.raf = requestAnimationFrame(tick);
    return {
      destroy() {
        cancelAnimationFrame(S.raf);
        if (ro) ro.disconnect();
        if (roK) roK.disconnect();
        root.removeEventListener('click', onClick);
        toneOff();
        if (AU.ctx) { try { AU.ctx.close(); } catch (e) { /* ignore */ } AU.ctx = null; }
      },
    };
  }

  // ---------------------------------------------------------------- registration
  const EVENTS = {
    vibrate: ['vibrating', 'pitch:high', 'pitch:low', 'loud', 'soft'],
    string: ['vibrating', 'pitch:high', 'pitch:low', 'loud', 'soft', 'resonance'],
    pipe: ['vibrating', 'resonance', 'pitch:high', 'pitch:low'],
    echo: ['echo'],
    spring: ['vibrating', 'period'],
    pendulum: ['vibrating', 'period'],
    shm: ['vibrating', 'period'],
    interference: ['fringes'],
    diffraction: ['fringes'],
    spectrum: ['pitch:high', 'pitch:low', 'band:*'],
  };
  NCA_T.register({
    id: 'waves',
    css: CSS,
    validate(c) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      if (!MODES.includes(c.mode)) return ['mode: one of ' + MODES.join(', ')];
      const e = [];
      Object.keys(c).forEach((k) => { if (!CFG_KEYS.includes(k)) e.push('unknown key: ' + k + ' (allowed: ' + CFG_KEYS.join(', ') + ')'); });
      if (c.medium != null) {
        if (!['air', 'water', 'steel'].includes(c.medium)) e.push("medium: 'air', 'water' or 'steel'");
        else if (!MEDIUM_MODES.includes(c.mode)) e.push(`medium: not used in mode ${c.mode} (only ${MEDIUM_MODES.join(', ')})`);
        else if (c.mode === 'pipe' && c.medium !== 'air') e.push("medium: the pipe is an air column, so only 'air'");
      }
      if (c.play_sound != null) {
        if (typeof c.play_sound !== 'boolean') e.push('play_sound: true or false');
        else if (c.play_sound && !SOUND_MODES.includes(c.mode)) e.push(`play_sound: mode ${c.mode} makes no sound (sound modes: ${SOUND_MODES.join(', ')})`);
      }
      return e;
    },
    keys(c) {
      const m = c && c.mode;
      if (!MODES.includes(m)) return { targets: [], events: [] };
      const sl = sliderDefs(m, (c && c.medium) || 'air', m === 'spectrum' ? (c.medium ? 'sound' : 'em') : null).map((d) => 'slider:' + d.k);
      const targets = ['play'].concat(m === 'vibrate' || m === 'string' ? ['pluck'] : [], sl);
      if (m === 'vibrate') targets.push('medium:air', 'medium:water', 'medium:steel', 'medium:vacuum');
      if (m === 'echo') targets.push('medium:air', 'medium:water', 'medium:steel');
      if (m === 'pipe') targets.push('pipe:open', 'pipe:closed');
      if (m === 'pendulum') targets.push('planet:earth', 'planet:moon', 'planet:mars', 'planet:jupiter');
      if (m === 'interference') targets.push('slit:both', 'slit:cover');
      if (m === 'spectrum') targets.push('view:em', 'view:sound');
      if (SOUND_MODES.includes(m)) targets.push('toggle:sound');
      return { targets, events: EVENTS[m].slice() };
    },
    demo: { mode: 'vibrate', medium: 'air', play_sound: false },
    modes: MODES.slice(),
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
