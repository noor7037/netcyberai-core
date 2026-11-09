// Template: Data and graphs. Collect data, tally it, and draw it as a tally chart, pictograph, bar graph, double bar
// graph, pie chart, histogram, frequency polygon, ogive (cumulative frequency curve), line graph or scatter plot.
// Every statistic (mean, median, mode, range, grouped mean / median / mode by the school formulas, Pearson
// correlation) is computed exactly from the numbers on the screen, and every chart is drawn to scale from them, so the
// picture, the table and the answers always agree. The child can plot the rows one by one, drag a bar or a point, move
// a slider, sort, switch between charts of the same data, and answer a question. Config:
//   { chart: 'tally'|'pictograph'|'bar'|'double-bar'|'pie'|'histogram'|'line'|'scatter'|'ogive'|'frequency-polygon',
//     data: [{ label: {en,hi}|string, value, value2? }]      (bar, tally, pictograph, pie, double-bar, line by label)
//         | [{ label: '10-20' | lo, hi, value }]               (grouped: histogram, frequency-polygon, ogive)
//         | { rows: [[x, y], …] },                            (line and scatter)
//     ask?: 'mean'|'median'|'mode'|'range'|'max'|'min'|'correlation',
//     title?, xlabel?, ylabel? ({en,hi}), unit? (what one picture stands for), icon?, series? ([{en,hi},{en,hi}]),
//     show? (rows plotted at the start, 0..n), views? (the charts the child may switch between),
//     cumulative? ('less'|'more'|'both', ogive) }
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rd = (x) => Math.round(x * 1e6) / 1e6;
  const fmt = (x) => { if (x == null || !isFinite(x)) return '–'; const r = Math.round(x * 100) / 100; return String(r === 0 ? 0 : r).replace('-', '−'); };

  const CHARTS = ['tally', 'pictograph', 'bar', 'double-bar', 'pie', 'histogram', 'line', 'scatter', 'ogive', 'frequency-polygon'];
  const GROUP = { cat: ['bar', 'pictograph', 'tally', 'pie'], grp: ['histogram', 'frequency-polygon', 'ogive'], xy: ['line', 'scatter'], dbl: ['double-bar'] };
  const KIND = (c) => (GROUP.cat.includes(c) ? 'cat' : GROUP.grp.includes(c) ? 'grp' : GROUP.dbl.includes(c) ? 'dbl' : 'xy');
  const ASKS = ['mean', 'median', 'mode', 'range', 'max', 'min', 'correlation'];
  const ICONS = ['star', 'apple', 'book', 'flower', 'ball', 'smile'];
  const KEYS = ['chart', 'data', 'ask', 'title', 'xlabel', 'ylabel', 'unit', 'icon', 'series', 'show', 'views', 'cumulative'];
  const PAL = ['#2563EB', '#FF7A1A', '#14B8A6', '#8B3DFF', '#F5B90A', '#FF6B57', '#22C55E', '#02CFF9'];
  const INK = '#1E293B', INK2 = '#475569', GRID = '#D6DFEC';

  const NAME = {
    tally: T2('Tally chart', 'टैली चार्ट'), pictograph: T2('Pictograph', 'चित्रालेख'), bar: T2('Bar graph', 'दंड आलेख'),
    'double-bar': T2('Double bar graph', 'द्वि-दंड आलेख'), pie: T2('Pie chart', 'पाई चार्ट'), histogram: T2('Histogram', 'आयतचित्र'),
    line: T2('Line graph', 'रेखा ग्राफ़'), scatter: T2('Scatter plot', 'प्रकीर्ण आलेख'), ogive: T2('Ogive', 'तोरण (संचयी वक्र)'),
    'frequency-polygon': T2('Frequency polygon', 'बारंबारता बहुभुज'),
  };
  const W = {
    mean: T2('Mean', 'माध्य'), median: T2('Median', 'माध्यिका'), mode: T2('Mode', 'बहुलक'), range: T2('Range', 'परिसर'),
    max: T2('Biggest', 'सबसे बड़ा'), min: T2('Smallest', 'सबसे छोटा'), correlation: T2('Pattern', 'पैटर्न'), total: T2('Total', 'कुल'),
    corr: T2('Correlation r', 'सहसंबंध r'), modal: T2('Modal class', 'बहुलक वर्ग'),
    item: T2('Item', 'वस्तु'), number: T2('Number', 'संख्या'), cls: T2('Class', 'वर्ग'), freq: T2('Frequency', 'बारंबारता'),
    plot: T2('Plot next row', 'अगली पंक्ति आलेखित करो'), plotted: T2('All rows plotted', 'सभी पंक्तियाँ आलेखित'),
    sort: T2('Sort small to big', 'छोटे से बड़े क्रम में लगाओ'), unsort: T2('Original order', 'पहले जैसा क्रम'),
    reset: T2('Reset numbers', 'संख्याएँ पहले जैसी करो'), trend: T2('Show trend line', 'प्रवृत्ति रेखा दिखाओ'), trendOff: T2('Hide trend line', 'प्रवृत्ति रेखा छिपाओ'),
    yours: T2('Your answer', 'तुम्हारा उत्तर'), check: T2('Check', 'जाँचो'), views: T2('Show the same data as', 'यही आँकड़े इस रूप में देखो'),
    table: T2('The numbers', 'संख्याएँ'), stats: T2('What the numbers say', 'संख्याएँ क्या बताती हैं'), question: T2('Question', 'प्रश्न'),
    each: T2('each', 'प्रत्येक'), stands: T2('stands for', 'का मान'), none: T2('none repeats', 'कोई नहीं दोहराई'),
    plotAll: T2('Plot every row first.', 'पहले सभी पंक्तियाँ आलेखित करो।'), sorted: T2('Sorted from small to big.', 'छोटे से बड़े क्रम में लग गया।'),
    adj: T2('Heights are adjusted because the classes are not equal in width.', 'वर्गों की चौड़ाई बराबर नहीं है, इसलिए ऊँचाइयाँ समायोजित की गई हैं।'),
    n: T2('Total', 'कुल'), less: T2('Less than', 'से कम'), more: T2('More than', 'से अधिक'), cum: T2('Cumulative frequency', 'संचयी बारंबारता'),
    pos: T2('Positive: when one goes up, the other goes up', 'धनात्मक: एक बढ़े तो दूसरा भी बढ़ता है'),
    neg: T2('Negative: when one goes up, the other comes down', 'ऋणात्मक: एक बढ़े तो दूसरा घटता है'),
    nocorr: T2('No pattern', 'कोई पैटर्न नहीं'), ok: T2('Correct!', 'सही!'), no: T2('Not yet.', 'अभी नहीं।'),
    posS: T2('positive', 'धनात्मक'), negS: T2('negative', 'ऋणात्मक'), noS: T2('none', 'कोई नहीं'),
    pctl: T2('Percent', 'प्रतिशत'), deg: T2('Angle', 'कोण'), unclear: T2('The dots are in between: move one so the pattern is clear.', 'बिंदु बीच की स्थिति में हैं: एक को हिलाओ ताकि पैटर्न साफ़ दिखे।'),
    nomode: T2('No number repeats the most right now. Press "Reset numbers" and try again.', 'अभी कोई संख्या सबसे अधिक बार नहीं आती। "संख्याएँ पहले जैसी करो" दबाओ और फिर कोशिश करो।'),
    notnum: T2('Type a number.', 'एक संख्या लिखो।'), hintDrag: T2('Drag a bar up or down, or use the sliders.', 'दंड को ऊपर-नीचे खींचो, या स्लाइडर चलाओ।'),
    hintTap: T2('Tap a mark to read its number. Use the sliders to change the numbers.', 'किसी चिह्न को छुओ और उसकी संख्या पढ़ो। संख्याएँ बदलने के लिए स्लाइडर चलाओ।'),
    count: T2('Count', 'गिनती'),
  };
  const QTEXT = {
    mean: T2('Find the mean of the numbers. Round to 1 decimal place if needed.', 'इन संख्याओं का माध्य निकालो। ज़रूरत हो तो एक दशमलव तक पूर्णांकित करो।'),
    median: T2('Find the median: the middle number when they are in order.', 'माध्यिका निकालो: क्रम में लगाने पर बीच की संख्या।'),
    mode: T2('Find the mode: the number that appears most often.', 'बहुलक निकालो: जो संख्या सबसे अधिक बार आती है।'),
    range: T2('Find the range: biggest minus smallest.', 'परिसर निकालो: सबसे बड़ी संख्या में से सबसे छोटी घटाओ।'),
    max: T2('Which one has the biggest number?', 'किसकी संख्या सबसे बड़ी है?'),
    min: T2('Which one has the smallest number?', 'किसकी संख्या सबसे छोटी है?'),
    correlation: T2('What pattern do the dots show?', 'बिंदु कौन-सा पैटर्न दिखाते हैं?'),
    gmean: T2('Find the mean using the middle value (class mark) of each class. Round to 1 decimal place.', 'हर वर्ग के मध्य मान (वर्ग चिह्न) से माध्य निकालो। एक दशमलव तक पूर्णांकित करो।'),
    gmedian: T2('Find the median of this grouped data using the cumulative frequency. Round to 1 decimal place.', 'संचयी बारंबारता से इस समूहित आँकड़े की माध्यिका निकालो। एक दशमलव तक पूर्णांकित करो।'),
    gmode: T2('Find the mode using the modal class (the class with the highest frequency). Round to 1 decimal place.', 'बहुलक वर्ग (सबसे अधिक बारंबारता वाला वर्ग) से बहुलक निकालो। एक दशमलव तक पूर्णांकित करो।'),
  };
  const HINT = {
    mean: T2('Add all the numbers, then divide by how many numbers there are.', 'सब संख्याएँ जोड़ो, फिर संख्याओं की गिनती से भाग दो।'),
    median: T2('Put the numbers in order first (try the sort button). Take the middle one, or the average of the two middle ones.', 'पहले संख्याओं को क्रम में लगाओ (सॉर्ट बटन दबाओ)। बीच की संख्या लो, या बीच की दो का औसत।'),
    mode: T2('Look for the number that appears again and again.', 'वह संख्या खोजो जो बार-बार आती है।'),
    range: T2('Subtract the smallest number from the biggest.', 'सबसे बड़ी संख्या में से सबसे छोटी घटाओ।'),
    max: T2('Look for the tallest bar or the highest number.', 'सबसे ऊँचा दंड या सबसे बड़ी संख्या खोजो।'),
    min: T2('Look for the shortest bar or the lowest number.', 'सबसे छोटा दंड या सबसे कम संख्या खोजो।'),
    correlation: T2('Look at the dots from left to right. Do they climb, fall, or scatter?', 'बिंदुओं को बाएँ से दाएँ देखो। वे चढ़ते हैं, उतरते हैं, या बिखरे हैं?'),
    gmean: T2('Multiply each class mark by its frequency, add them up, and divide by the total frequency.', 'हर वर्ग चिह्न को उसकी बारंबारता से गुणा करो, जोड़ो और कुल बारंबारता से भाग दो।'),
    gmedian: T2('Find the class where the cumulative frequency first reaches half of the total. Then use l + ((N/2 − cf) ÷ f) × h.', 'वह वर्ग खोजो जहाँ संचयी बारंबारता पहली बार कुल की आधी हो। फिर l + ((N/2 − cf) ÷ f) × h लगाओ।'),
    gmode: T2('Find the class with the highest frequency, then use l + ((f1 − f0) ÷ (2f1 − f0 − f2)) × h.', 'सबसे अधिक बारंबारता वाला वर्ग खोजो, फिर l + ((f1 − f0) ÷ (2f1 − f0 − f2)) × h लगाओ।'),
  };

  // ---------------------------------------------------------------- pure maths
  const isNum = (v) => typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e6;
  const isTx = (v) => (typeof v === 'string' && v.trim() !== '' && v.length <= 40) || (!!v && typeof v === 'object' && !Array.isArray(v) && typeof v.en === 'string' && typeof v.hi === 'string' && v.en.trim() !== '' && v.hi.trim() !== '' && v.en.length <= 80 && v.hi.length <= 80);
  const divides = (step, v) => Math.abs(v / step - Math.round(v / step)) < 1e-7;
  const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const niceScale = (mx) => { if (!(mx > 0)) mx = 1; const step = niceStep(mx / 5); return { min: 0, max: rd(Math.ceil(mx / step - 1e-9) * step), step }; };
  const niceRange = (lo, hi) => { if (!(hi - lo > 0)) { hi = lo + 1; } const step = niceStep((hi - lo) / 5); return { min: rd(Math.floor(lo / step + 1e-9) * step), max: rd(Math.ceil(hi / step - 1e-9) * step), step }; };
  const ticks = (sc) => { const out = []; for (let k = 0; k <= 40; k++) { const v = rd(sc.min + k * sc.step); if (v > sc.max + 1e-9) break; out.push(v); } return out; };

  function listStats(ys) {
    const n = ys.length, sum = rd(ys.reduce((a, b) => a + b, 0)), sorted = ys.slice().sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const cnt = {};
    ys.forEach((v) => { const k = rd(v); cnt[k] = (cnt[k] || 0) + 1; });
    const best = Math.max(...Object.values(cnt));
    const tops = Object.keys(cnt).filter((k) => cnt[k] === best);
    const mode = best > 1 && tops.length === 1 ? +tops[0] : null;
    const mx = Math.max(...ys), mn = Math.min(...ys);
    return { n, sum, mean: sum / n, median, mode, modeCount: best, range: rd(mx - mn), max: mx, min: mn, sorted,
      argmax: ys.map((v, i) => (v === mx ? i : -1)).filter((i) => i >= 0), argmin: ys.map((v, i) => (v === mn ? i : -1)).filter((i) => i >= 0) };
  }
  function groupStats(lo, hi, f) {
    const n = f.length, N = rd(f.reduce((a, b) => a + b, 0));
    const mids = lo.map((l, i) => (l + hi[i]) / 2);
    const sfx = rd(f.reduce((a, v, i) => a + v * mids[i], 0));
    const cf = []; f.reduce((a, v, i) => (cf[i] = a + v), 0);
    let mi = 0; while (mi < n - 1 && cf[mi] < N / 2) mi++;
    const cfPrev = mi ? cf[mi - 1] : 0, h = hi[mi] - lo[mi];
    const median = f[mi] > 0 ? lo[mi] + ((N / 2 - cfPrev) / f[mi]) * h : null;
    const fm = Math.max(...f), tops = f.map((v, i) => (v === fm ? i : -1)).filter((i) => i >= 0);
    let mode = null, modal = null;
    if (tops.length === 1) {
      modal = tops[0];
      const f1 = f[modal], f0 = modal ? f[modal - 1] : 0, f2 = modal < n - 1 ? f[modal + 1] : 0, den = 2 * f1 - f0 - f2;
      if (den > 0) mode = lo[modal] + ((f1 - f0) / den) * (hi[modal] - lo[modal]);
    }
    return { n, N, mids, sfx, mean: N > 0 ? sfx / N : null, cf, medianClass: mi, median, mode, modal };
  }
  function pearson(xs, ys) {
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    if (sxx < 1e-12 || syy < 1e-12) return { r: null, slope: null, icpt: null };
    const slope = sxy / sxx;
    return { r: sxy / Math.sqrt(sxx * syy), slope, icpt: my - slope * mx };
  }
  const corrClass = (r) => (r == null ? null : r >= 0.5 ? 'pos' : r <= -0.5 ? 'neg' : Math.abs(r) < 0.3 ? 'none' : 'mid');
  const parseRange = (s) => { const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)$/); return m ? [+m[1], +m[2]] : null; };

  // Reads and checks a config. Returns { errors: [], m: model }.
  function normalise(config) {
    const err = [];
    const bad = (s) => { err.push(s); };
    if (!config || typeof config !== 'object' || Array.isArray(config)) return { errors: ['config must be an object'] };
    Object.keys(config).forEach((k) => { if (!KEYS.includes(k)) bad(`unknown config key "${k}"`); });
    const chart = config.chart;
    if (!CHARTS.includes(chart)) { bad(`chart must be one of ${CHARTS.join(', ')}`); return { errors: err }; }
    const kind = KIND(chart);
    ['title', 'xlabel', 'ylabel'].forEach((k) => { if (config[k] != null && !isTx(config[k])) bad(`${k} must be {en,hi} text`); });
    const m = { chart, kind, ask: config.ask || null, title: config.title, xlabel: config.xlabel, ylabel: config.ylabel, unit: 1, icon: 'star', labels: [], ys: [], ys2: null, xs: null, lo: null, hi: null, xcat: false, series: null, cumulative: config.cumulative || 'less' };
    const d = config.data;
    const isRows = !!d && !Array.isArray(d) && typeof d === 'object' && Array.isArray(d.rows);
    if (!Array.isArray(d) && !isRows) { bad('data must be a list of {label, value} or { rows: [[x, y]] }'); return { errors: err }; }
    if (isRows && Object.keys(d).some((k) => k !== 'rows')) bad('data object may only have "rows"');
    if (isRows && kind !== 'xy') bad(`${chart} needs data as a list of {label, value}`);
    if (!isRows && chart === 'scatter') bad('scatter needs data as { rows: [[x, y]] }');
    if (config.unit != null) { if (!isNum(config.unit) || config.unit <= 0) bad('unit must be a positive number'); else m.unit = config.unit; }
    if (config.unit != null && chart !== 'pictograph' && !(config.views || []).includes('pictograph') && !(kind === 'cat')) bad('unit is only for pictographs');
    if (config.icon != null) { if (!ICONS.includes(config.icon)) bad(`icon must be one of ${ICONS.join(', ')}`); else m.icon = config.icon; }
    if (config.cumulative != null && (chart !== 'ogive' || !['less', 'more', 'both'].includes(config.cumulative))) bad('cumulative ("less"|"more"|"both") is only for the ogive');
    if (chart === 'double-bar') {
      if (!Array.isArray(config.series) || config.series.length !== 2 || !config.series.every(isTx)) bad('double-bar needs series: [{en,hi},{en,hi}]');
      else m.series = config.series;
    } else if (config.series != null) bad('series is only for the double-bar');
    if (err.length) return { errors: err };

    const lim = { cat: [2, 12], dbl: [2, 8], grp: [3, 12], xy: [2, 24] }[kind];
    const rows = isRows ? d.rows : d;
    const n = rows.length;
    if (chart === 'tally') lim[1] = 8;
    if (chart === 'pie') lim[1] = 8;
    if (chart === 'scatter') { lim[0] = 4; lim[1] = 30; }
    if (n < lim[0] || n > lim[1]) bad(`${chart} needs ${lim[0]} to ${lim[1]} rows (got ${n})`);
    if (err.length) return { errors: err };
    const nonneg = kind !== 'xy';
    if (isRows) {
      rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1])) bad(`rows[${i}] must be [x, y] with finite numbers`);
      });
      if (!err.length) {
        for (let i = 1; i < n; i++) if (chart === 'line' ? !(rows[i][0] > rows[i - 1][0]) : false) bad('line graph x values must increase');
        m.xs = rows.map((r) => r[0]); m.ys = rows.map((r) => r[1]);
        m.labels = m.xs.map((x) => String(x));
      }
    } else {
      rows.forEach((r, i) => {
        if (!r || typeof r !== 'object') { bad(`data[${i}] must be an object`); return; }
        const allowed = ['label', 'value', 'value2', 'lo', 'hi'];
        Object.keys(r).forEach((k) => { if (!allowed.includes(k)) bad(`data[${i}] has unknown field "${k}"`); });
        if (!isNum(r.value)) bad(`data[${i}].value must be a number`);
        else if (nonneg && r.value < 0) bad(`data[${i}].value cannot be negative`);
        if (kind === 'dbl') { if (!isNum(r.value2) || r.value2 < 0) bad(`data[${i}].value2 must be a non-negative number`); }
        else if (r.value2 != null) bad(`data[${i}].value2 is only for the double-bar`);
        if (kind === 'grp') {
          let lo = r.lo, hi = r.hi;
          if ((lo == null || hi == null) && r.label != null) { const p = parseRange(r.label); if (p) { lo = p[0]; hi = p[1]; } }
          if (!isNum(lo) || !isNum(hi) || !(hi > lo)) bad(`data[${i}] needs a class like label "10-20" (or lo and hi) with hi > lo`);
          else { (m.lo = m.lo || []).push(lo); (m.hi = m.hi || []).push(hi); }
          if (r.value !== undefined && isNum(r.value) && r.value !== Math.round(r.value)) bad(`data[${i}].value (a frequency) must be a whole number`);
        } else {
          if (!isTx(r.label)) bad(`data[${i}].label must be text or {en,hi}`);
          else m.labels.push(r.label);
          if (r.lo != null || r.hi != null) bad(`data[${i}].lo/hi are only for grouped charts`);
        }
        m.ys.push(r.value);
        if (kind === 'dbl') (m.ys2 = m.ys2 || []).push(r.value2);
      });
      if (!err.length && kind !== 'grp') {
        const seen = {};
        m.labels.forEach((lb) => { const k = typeof lb === 'string' ? lb : lb.en; if (seen[k]) bad(`label "${k}" is used twice`); seen[k] = 1; });
        if (kind === 'xy') { m.xcat = true; m.xs = m.ys.map((_, i) => i); }
      }
    }
    if (err.length) return { errors: err };
    if (kind === 'grp') {
      for (let i = 1; i < n; i++) if (Math.abs(m.lo[i] - m.hi[i - 1]) > 1e-9) bad('classes must touch: each class starts where the one before ends');
      m.labels = m.lo.map((l, i) => `${fmt(l)}–${fmt(m.hi[i])}`);
      if (m.ys.reduce((a, b) => a + b, 0) <= 0) bad('total frequency must be above 0');
    }
    if (chart === 'line' && !m.xcat && !isRows) bad('line graph needs data');
    if (err.length) return { errors: err };

    // which charts the child may switch between
    const all = m.ys.concat(m.ys2 || []);
    const maxv = Math.max(...all), minv = Math.min(...all);
    const unitOk = (u) => all.every((v) => divides(u / 2, v));
    // slider step: the coarsest step every number sits on
    let step = null;
    const need = [1, 0.5, 0.25, 0.1, 0.05, 0.01];
    const group = chart === 'line' && isRows ? GROUP.xy : (GROUP[kind] || [chart]);
    const feasible = {};
    group.forEach((c) => {
      let ok = true;
      if (c === 'tally') ok = n <= 8 && all.every((v) => v === Math.round(v)) && maxv <= 30;
      if (c === 'pictograph') ok = unitOk(m.unit) && maxv / m.unit <= 20;
      if (c === 'pie') ok = n >= 2 && n <= 8 && minv > 0;
      if (c === 'scatter') ok = isRows && n >= 4 && n <= 30;
      feasible[c] = ok;
    });
    if (config.views != null) {
      if (!Array.isArray(config.views) || !config.views.length) bad('views must be a non-empty list of chart names');
      else config.views.forEach((v) => { if (!group.includes(v)) bad(`views: "${v}" cannot show this data (allowed: ${group.join(', ')})`); else if (!feasible[v]) bad(`views: "${v}" cannot draw these numbers truthfully`); });
      if (Array.isArray(config.views) && !config.views.includes(chart)) bad('views must include the chart itself');
    }
    if (!feasible[chart]) bad(`${chart} cannot draw these numbers truthfully (check the counts, whole numbers, unit and that pie slices are above 0)`);
    if (err.length) return { errors: err };
    m.views = config.views ? group.filter((g) => config.views.includes(g)) : group.filter((g) => feasible[g]);
    const needNums = all.slice();
    if (m.views.includes('pictograph')) needNums.push(m.unit / 2);
    for (const c of need) { if (needNums.every((v) => divides(c, v))) { step = c; break; } }
    if (step == null) { bad('numbers may have at most 2 decimal places'); return { errors: err }; }
    if (m.views.includes('tally') && step < 1) step = 1;
    m.step = step;
    if (kind === 'xy') {
      const span = Math.max(maxv - minv, Math.abs(maxv) * 0.1, step * 4);
      let lo = minv - span * 0.35, hi = maxv + span * 0.35;
      if (minv >= 0) lo = Math.max(0, lo);
      m.smin = Math.floor(lo / step) * step; m.smax = Math.ceil(hi / step) * step;
      if (m.smax - m.smin < step * 4) m.smax = m.smin + step * 4;
    } else {
      m.smin = m.views.includes('pie') ? step : 0;
      m.smax = Math.max(Math.ceil((maxv * 1.5) / step) * step, maxv + 3 * step);
      if (m.views.includes('tally')) m.smax = Math.min(m.smax, 30);
      if (m.views.includes('pictograph')) m.smax = Math.min(m.smax, 20 * m.unit);
      if (m.smax < maxv) m.smax = maxv;
    }
    m.smin = rd(m.smin); m.smax = rd(m.smax);
    const show = config.show;
    if (show != null && !(Number.isInteger(show) && show >= 0 && show <= n)) bad(`show must be a whole number from 0 to ${n}`);
    m.show = show == null ? n : show;
    m.n = n;

    // the question
    const ask = config.ask;
    if (ask != null) {
      if (!ASKS.includes(ask)) bad(`ask must be one of ${ASKS.join(', ')}`);
      else {
        const okAsk = { cat: ['mean', 'median', 'mode', 'range', 'max', 'min'], dbl: ['mean', 'median', 'mode', 'range', 'max', 'min'], xy: chart === 'scatter' ? ['correlation'] : ['mean', 'median', 'mode', 'range', 'max', 'min'], grp: ['mean', 'median', 'mode'] }[kind];
        if (!okAsk.includes(ask)) bad(`ask "${ask}" does not fit a ${chart}`);
        else if (kind === 'grp') {
          const g = groupStats(m.lo, m.hi, m.ys);
          if (ask === 'median' && g.median == null) bad('median class has frequency 0');
          if (ask === 'mode' && g.mode == null) bad('grouped mode needs one class with the highest frequency');
        } else if (ask === 'correlation') {
          const c = corrClass(pearson(m.xs, m.ys).r);
          if (!c || c === 'mid') bad('the dots are not clearly positive, negative or without a pattern (|r| between 0.3 and 0.5, or no spread)');
        } else {
          const s = listStats(m.ys);
          if (ask === 'mode' && s.mode == null) bad('mode needs one number that repeats most often');
          if (ask === 'max' && s.argmax.length !== 1) bad('the biggest number is tied');
          if (ask === 'min' && s.argmin.length !== 1) bad('the smallest number is tied');
        }
      }
    }
    return { errors: err, m };
  }

  // ---------------------------------------------------------------- icons (drawn in a 20 × 20 box)
  const ICON = {
    star: (c) => `<path d="M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6L10 14.9 4.7 17.9l1.2-6L1.4 7.8l6-.7z" fill="${c}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>`,
    apple: (c) => `<path d="M10 5.5c-2-1.6-6-.8-6 4 0 4 2.6 8 4.4 8 .9 0 1-.5 1.6-.5s.7.5 1.6.5c1.8 0 4.4-4 4.4-8 0-4.8-4-5.6-6-4z" fill="${c}"/><path d="M10 5.5c0-1.8.8-3 2.2-3.8" stroke="#6B3E1B" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M12 2.4c1.6-.4 2.8.2 3.2 1.4-1.4.5-2.8 0-3.2-1.4z" fill="#22C55E"/>`,
    book: (c) => `<rect x="3" y="2" width="14" height="16" rx="2" fill="${c}"/><rect x="5.5" y="2" width="1.6" height="16" fill="#fff" opacity=".55"/><rect x="9" y="6" width="5.5" height="1.6" rx=".8" fill="#fff" opacity=".8"/><rect x="9" y="9.5" width="4" height="1.6" rx=".8" fill="#fff" opacity=".8"/>`,
    flower: (c) => `<g fill="${c}">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="10" cy="5.2" rx="2.9" ry="3.8" transform="rotate(${a} 10 10)"/>`).join('')}</g><circle cx="10" cy="10" r="2.6" fill="#FFD23F" stroke="#fff" stroke-width=".8"/>`,
    ball: (c) => `<circle cx="10" cy="10" r="8.2" fill="${c}"/><path d="M2.5 8.5c4 1.6 11 1.6 15 0M2.5 11.5c4-1.6 11-1.6 15 0M10 1.8v16.4" stroke="#fff" stroke-width="1.1" fill="none" opacity=".8"/>`,
    smile: (c) => `<circle cx="10" cy="10" r="8.4" fill="${c}"/><circle cx="7" cy="8" r="1.2" fill="#1E293B"/><circle cx="13" cy="8" r="1.2" fill="#1E293B"/><path d="M5.8 11.5c1.2 3 7.2 3 8.4 0" stroke="#1E293B" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  };
  const ICONNAME = { star: T2('star', 'तारा'), apple: T2('apple', 'सेब'), book: T2('book', 'किताब'), flower: T2('flower', 'फूल'), ball: T2('ball', 'गेंद'), smile: T2('smiley', 'मुस्कान') };

  const CSS = `
.dt-wrap{--dt-ink:#1E293B;--dt-ink2:#475569;display:grid;gap:14px;font-family:var(--font-body,system-ui,sans-serif);color:var(--ink,#1E293B);min-width:0}
.dt-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
.dt-title{font-family:var(--font-display,inherit);font-weight:800;font-size:1.2rem;margin:0}
.dt-kind{font-size:.85rem;font-weight:700;color:var(--ink-2,#475569);background:var(--sunk,#EEF2F8);border-radius:999px;padding:2px 10px}
.dt-tabs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dt-tabs>span{font-size:.85rem;font-weight:700;color:var(--ink-2,#475569);margin-inline-end:2px}
.dt-tab{min-height:44px;padding:0 14px;border-radius:999px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font-weight:700;font-family:inherit;font-size:.92rem;cursor:pointer}
.dt-tab[aria-pressed=true]{background:#16A34A;border-color:#16A34A;color:#fff}
.dt-main{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:880px){.dt-main{grid-template-columns:minmax(0,1.35fr) minmax(300px,1fr);align-items:start}.dt-main>div:first-child{position:sticky;top:8px}}
.dt-chart{background:linear-gradient(180deg,#fff,#EEF6FF);border:1.5px solid #D6E2F3;border-radius:20px;box-shadow:0 8px 24px rgba(30,64,175,.10);padding:8px;min-width:0;overflow:hidden}
.dt-chart svg{display:block;width:100%;height:auto;touch-action:pan-y;font-family:var(--font-body,system-ui,sans-serif);-webkit-user-select:none;user-select:none}
.dt-chart [data-key^="bar:"]{cursor:pointer;outline:none}
.dt-chart .dt-drag{cursor:ns-resize;touch-action:none}
.dt-chart [data-key]:focus-visible .dt-focus{stroke:#061233;stroke-width:3;stroke-dasharray:5 3}
.dt-pop{animation:dt-pop .5s ease both}
@keyframes dt-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.dt-pop{animation:none}}
.dt-read{margin:6px 8px 4px;min-height:1.5em;font-weight:700;font-size:.95rem;color:var(--dt-ink)}
.dt-side{display:grid;gap:12px;min-width:0}
.dt-card{background:var(--surface,#fff);border:1.5px solid var(--line,#E2E8F0);border-radius:16px;padding:12px;min-width:0}
.dt-card h3{margin:0 0 8px;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2,#475569);font-weight:800}
.dt-actions{display:flex;flex-wrap:wrap;gap:8px}
.dt-btn{min-height:44px;padding:0 16px;border-radius:12px;border:0;background:var(--sunk,#EEF2F8);color:var(--ink,#1E293B);font-weight:700;font-family:inherit;font-size:.92rem;cursor:pointer}
.dt-btn.go{background:#16A34A;color:#fff}
.dt-btn[disabled]{opacity:.55;cursor:default}
.dt-btn:focus-visible,.dt-tab:focus-visible,.dt-chip:focus-visible,.dt-inp:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
.dt-tbl{display:grid;gap:2px}
.dt-row{display:grid;grid-template-columns:minmax(64px,.9fr) 44px minmax(90px,1.6fr);gap:8px;align-items:center;min-height:44px;border-radius:10px;padding:0 6px}
.dt-row.dt-two{grid-template-columns:52px minmax(0,1fr);row-gap:0;padding:6px;border-bottom:1px solid var(--line,#E2E8F0)}
.dt-row.dt-two.hd{display:none}
.dt-row.dt-two .nm{grid-column:1/-1;min-height:24px}
.dt-row b[data-s]::before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:6px;background:var(--c)}
.dt-row.hd{min-height:30px;font-size:.78rem;font-weight:800;color:var(--ink-2,#475569)}
.dt-row.sel{background:color-mix(in srgb,#16A34A 14%,transparent)}
.dt-row.off{opacity:.45}
.dt-row b{font-weight:800;font-variant-numeric:tabular-nums;text-align:end}
.dt-row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.92rem}
.dt-row input[type=range]{-webkit-appearance:none;appearance:none;width:100%;min-height:44px;margin:0;background:transparent;cursor:pointer}
.dt-row input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:linear-gradient(90deg,#BBF7D0,#86EFAC)}
.dt-row input[type=range]::-moz-range-track{height:8px;border-radius:99px;background:linear-gradient(90deg,#BBF7D0,#86EFAC)}
.dt-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;margin-top:-9px;border-radius:50%;background:#16A34A;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.dt-row input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#16A34A;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.dt-row input[type=range]:disabled{opacity:.45;cursor:default}
.dt-row input[type=range]:focus-visible{outline:3px solid #2563EB;outline-offset:2px;border-radius:8px}
.dt-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.dt-stat{border-radius:12px;padding:8px 10px;background:var(--sunk,#EEF2F8)}
.dt-stat small{display:block;font-size:.75rem;font-weight:800;color:var(--ink-2,#475569);text-transform:uppercase;letter-spacing:.03em}
.dt-stat strong{display:block;font-family:var(--font-display,inherit);font-size:1.35rem;line-height:1.2;font-variant-numeric:tabular-nums}
.dt-stat span{display:block;font-size:.78rem;color:var(--ink-2,#475569);overflow-wrap:anywhere}
.dt-stat.hid strong{color:var(--ink-2,#64748B)}
.dt-ask p{margin:0 0 8px;font-weight:700}
.dt-ansrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dt-inp{min-height:44px;width:120px;border-radius:12px;border:2px solid var(--line,#CBD5E1);padding:0 12px;font-size:1.1rem;font-weight:700;font-family:inherit;background:var(--surface,#fff);color:var(--ink,#1E293B)}
.dt-chips{display:flex;flex-wrap:wrap;gap:8px}
.dt-chip{min-height:44px;padding:6px 14px;border-radius:12px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font-weight:700;font-family:inherit;font-size:.92rem;cursor:pointer;text-align:start}
.dt-chip.right{background:#16A34A;border-color:#16A34A;color:#fff}
.dt-chip.wrong{border-color:var(--bad,#DC2626);background:var(--bad-t,#FEE2E2)}
.dt-fb{margin-top:8px;font-weight:600;font-size:.92rem;line-height:1.4}
.dt-fb.good{color:var(--good,#15803D)}
.dt-fb.bad{color:var(--bad,#B91C1C)}
.dt-note{font-size:.82rem;color:var(--ink-2,#475569);margin:2px 8px 6px}
.dt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

  // ---------------------------------------------------------------- the template
  function build(root, config, api) {
    const v = normalise(config);
    if (v.errors.length) throw new Error('data: ' + v.errors.join('; '));
    const m = v.m;
    const uid = 'dt' + Math.random().toString(36).slice(2, 7);
    const t = (x) => api.t(x);
    const lang = () => (api.lang ? api.lang() : 'en');
    const lab = (i) => t(m.labels[i]);
    const reduced = L.reducedMotion;
    const s = {
      chart: m.chart, items: m.ys.map((y, i) => ({ k: i, label: m.labels[i], y, y2: m.ys2 ? m.ys2[i] : 0, x: m.xs ? m.xs[i] : i, lo: m.lo ? m.lo[i] : 0, hi: m.hi ? m.hi[i] : 0 })),
      shown: m.show, grow: null, sel: -1, trend: false, sorted: false, solved: false, drag: null, ax: null, focus: null, W: 0,
    };
    const orig = JSON.parse(JSON.stringify(s.items));
    const n = m.n;
    const stops = [];
    const winL = [];
    let destroyed = false;
    const cleanup = () => { stops.splice(0).forEach((f) => f()); };

    root.innerHTML = `<div class="dt-wrap">
      <div class="dt-head"><h2 class="dt-title" data-r="title"></h2><span class="dt-kind" data-r="kind"></span></div>
      <div class="dt-tabs" data-r="tabs" role="group"></div>
      <div class="dt-main">
        <div><div class="dt-chart" data-r="chart"><div data-r="svg"></div><div class="dt-read" data-r="read" aria-live="polite"></div><div class="dt-note" data-r="note"></div></div></div>
        <div class="dt-side">
          <div class="dt-card"><div class="dt-actions" data-r="actions"></div></div>
          <div class="dt-card"><h3 data-r="tblh"></h3><div class="dt-tbl" data-r="tbl"></div></div>
          <div class="dt-card"><h3 data-r="stath"></h3><div class="dt-stats" data-r="stats"></div></div>
          <div class="dt-card dt-ask" data-r="askcard" hidden><h3 data-r="askh"></h3><p data-r="askq"></p><div data-r="askui"></div><div class="dt-fb" data-r="fb" aria-live="polite"></div></div>
        </div>
      </div>
      <div class="dt-sr" aria-live="polite" data-r="live"></div></div>`;
    const R = {};
    root.querySelectorAll('[data-r]').forEach((e) => { R[e.dataset.r] = e; });
    const live = (txt) => { R.live.textContent = ''; setTimeout(() => { if (!destroyed) R.live.textContent = txt; }, 30); };

    const ys = () => s.items.map((i) => i.y);
    const isDrag = () => ['bar', 'double-bar', 'histogram', 'frequency-polygon', 'line', 'scatter'].includes(s.chart);
    const unequal = () => m.kind === 'grp' && s.items.some((it) => Math.abs(it.hi - it.lo - (s.items[0].hi - s.items[0].lo)) > 1e-9);

    // ---- scales
    function curMax() { return Math.max(...s.items.map((i) => Math.max(i.y, m.ys2 ? i.y2 : 0))); }
    function axisFor() {
      if (s.drag && s.ax) return s.ax;
      let mx;
      if (m.kind === 'grp') {
        const w0 = Math.min(...s.items.map((i) => i.hi - i.lo));
        mx = Math.max(...s.items.map((i) => (i.y * w0) / (i.hi - i.lo)));
        mx = Math.max(mx, Math.max(...orig.map((i) => (i.y * w0) / (i.hi - i.lo))) * 0.0);
      } else mx = curMax();
      const base = Math.max(mx, Math.max(...m.ys.concat(m.ys2 || [])) * 0.9);
      if (m.kind === 'xy') return (s.ax = niceRange(m.smin, m.smax));
      return (s.ax = niceScale(Math.max(mx, base) * 1.1));
    }

    // ---- stats
    function computeStats() {
      if (m.kind === 'grp') {
        const g = groupStats(s.items.map((i) => i.lo), s.items.map((i) => i.hi), ys());
        return g;
      }
      if (s.chart === 'scatter') { const p = pearson(s.items.map((i) => i.x), ys()); return Object.assign(p, { cls: corrClass(p.r) }); }
      return listStats(ys());
    }
    function cards() {
      const st = computeStats(), out = [];
      const add = (key, name, val, sub, ask) => out.push({ key, name, val, sub, ask });
      const list = (arr) => arr.map(fmt).join(', ');
      if (m.kind === 'grp') {
        add('n', W.n, fmt(st.N), '', false);
        add('mean', W.mean, st.mean == null ? '–' : fmt(Math.round(st.mean * 100) / 100), st.mean == null ? '' : `Σfx ÷ Σf = ${fmt(st.sfx)} ÷ ${fmt(st.N)}`, m.ask === 'mean');
        add('median', W.median, st.median == null ? '–' : fmt(Math.round(st.median * 100) / 100), st.median == null ? '' : `l=${fmt(s.items[st.medianClass].lo)}, cf=${fmt(st.medianClass ? st.cf[st.medianClass - 1] : 0)}, f=${fmt(s.items[st.medianClass].y)}, h=${fmt(s.items[st.medianClass].hi - s.items[st.medianClass].lo)}`, m.ask === 'median');
        add('mode', W.mode, st.mode == null ? '–' : fmt(Math.round(st.mode * 100) / 100), st.modal == null ? '' : `${t(W.modal)}: ${s.items[st.modal].label ? m.labels[st.modal] : ''}`.replace(/: $/, ''), m.ask === 'mode');
      } else if (s.chart === 'scatter') {
        add('r', W.corr, st.r == null ? '–' : fmt(Math.round(st.r * 100) / 100), st.cls ? (st.cls === 'pos' ? W.posS : st.cls === 'neg' ? W.negS : st.cls === 'none' ? W.noS : '') : '', m.ask === 'correlation');
      } else {
        const sum = fmt(st.sum);
        add('mean', W.mean, fmt(Math.round(st.mean * 100) / 100), st.n <= 6 ? `(${ys().map(fmt).join(' + ')}) ÷ ${st.n} = ${sum} ÷ ${st.n}` : `${sum} ÷ ${st.n}`, m.ask === 'mean');
        add('median', W.median, fmt(st.median), st.n <= 10 ? list(st.sorted) : '', m.ask === 'median');
        add('mode', W.mode, st.mode == null ? '–' : fmt(st.mode), st.mode == null ? W.none : { en: `${st.modeCount} times`, hi: `${st.modeCount} बार` }, m.ask === 'mode');
        add('range', W.range, fmt(st.range), `${fmt(st.max)} − ${fmt(st.min)}`, m.ask === 'range');
        add('max', W.max, fmt(st.max), st.argmax.length === 1 ? m.labels[st.argmax[0]] : '', m.ask === 'max');
        add('min', W.min, fmt(st.min), st.argmin.length === 1 ? m.labels[st.argmin[0]] : '', m.ask === 'min');
      }
      return out;
    }
    function drawStats() {
      const allIn = s.shown >= n;
      R.stats.innerHTML = cards().map((c) => {
        const hide = c.ask && !s.solved;
        const sub = typeof c.sub === 'string' && !m.labels.includes(c.sub) ? c.sub : t(c.sub || '');
        const value = !allIn ? '–' : hide ? '?' : c.val;
        return `<div class="dt-stat${hide ? ' hid' : ''}"><small>${esc(t(c.name))}</small><strong>${esc(value)}</strong><span>${esc(allIn && !hide ? sub : '')}</span></div>`;
      }).join('');
    }

    // ---- drawing
    const f = (x) => Math.round(x * 100) / 100;
    const txt = (x, y, str, o = {}) => `<text x="${f(x)}" y="${f(y)}" font-size="${o.fs || 12}" fill="${o.fill || INK2}" text-anchor="${o.a || 'middle'}" font-weight="${o.w || 600}"${o.rot ? ` transform="rotate(${o.rot} ${f(x)} ${f(y)})"` : ''}${o.extra || ''}>${esc(str)}</text>`;
    function wrap(str, maxc) {
      const words = String(str).split(/\s+/), lines = [''];
      for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length <= maxc || !cur) lines[lines.length - 1] = (cur + ' ' + w).trim(); else if (lines.length < 2) lines.push(w); else lines[1] = (lines[1] + ' ' + w).trim(); }
      return lines.map((l) => (l.length > maxc ? l.slice(0, Math.max(1, maxc - 1)) + '…' : l));
    }
    const vis = (i) => ({ on: i < s.shown, p: s.grow && s.grow.i === i ? s.grow.p : 1 });
    const colour = (i) => PAL[i % PAL.length];
    function defs(k) {
      let d = '';
      PAL.forEach((c, i) => { d += `<linearGradient id="${uid}g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.mixHex(c, '#FFFFFF', 0.28)}"/><stop offset="1" stop-color="${c}"/></linearGradient>`; });
      return `<defs>${d}${k || ''}</defs>`;
    }
    const grad = (i) => `url(#${uid}g${i % PAL.length})`;
    const mark = (key, label, inner, drag, extra) => `<g data-key="${key}" role="button" tabindex="0" aria-label="${esc(label)}"${drag ? ' class="dt-drag"' : ''}${extra || ''}>${inner}</g>`;
    const selRing = (on) => (on ? ' stroke="#061233" stroke-width="2.5"' : ' stroke="#fff" stroke-width="1"');

    function axes(c, sc, o = {}) {
      let g = '';
      ticks(sc).forEach((tv) => {
        const y = c.Y(tv);
        g += `<line x1="${c.ml}" x2="${c.ml + c.pw}" y1="${f(y)}" y2="${f(y)}" stroke="${tv === sc.min ? INK2 : GRID}" stroke-width="${tv === sc.min ? 1.6 : 1}"/>` + txt(c.ml - 6, y + 4, fmt(tv), { a: 'end', fs: c.fs });
      });
      if (m.ylabel) g += txt(12, c.mt + c.ph / 2, t(m.ylabel), { rot: -90, fs: c.fs, fill: INK, w: 700 });
      if (m.xlabel) g += txt(c.ml + c.pw / 2, c.H - 6, t(m.xlabel), { fs: c.fs, fill: INK, w: 700 });
      return g;
    }
    function base(Wd, Hd, o = {}) {
      const fs = Wd < 420 ? 11 : 12.5;
      const ml = (o.ml || 40) + (m.ylabel ? 16 : 0), mr = o.mr || 12, mt = o.mt || 20, mb = (o.mb || 54) + (m.xlabel ? 12 : 0);
      return { W: Wd, H: Hd, fs, ml, mr, mt, mb, pw: Wd - ml - mr, ph: Hd - mt - mb };
    }

    function drawBars(Wd) {
      const dbl = m.kind === 'dbl';
      const Hd = Math.round(clamp(Wd * 0.7, 250, 380));
      const c = base(Wd, Hd, { mt: dbl ? 40 : 22 });
      const sc = axisFor();
      c.Y = (vv) => c.mt + c.ph * (1 - vv / sc.max);
      let g = axes(c, sc);
      const band = c.pw / n, bw = Math.min(band * (dbl ? 0.84 : 0.66), dbl ? 90 : 68);
      const maxc = Math.max(3, Math.floor(band / (c.fs * 0.56)));
      s.geo = { c, sc };
      const bar = (i, x, w, val, key, ci, shownRow, label, ser) => {
        const { on, p } = vis(i % n);
        const keySel = s.sel === (key);
        if (!on) return mark(`bar:${key}`, `${label}: –`, `<rect x="${f(x)}" y="${f(c.Y(0) - 14)}" width="${f(w)}" height="14" rx="5" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="4 3"/><rect class="dt-focus" x="${f(x - 2)}" y="${f(c.Y(sc.max))}" width="${f(w + 4)}" height="${f(c.ph)}" fill="none"/>`, false);
        const h = Math.max(0, (c.Y(0) - c.Y(val)) * p), y = c.Y(0) - h, r = Math.min(7, w / 2, h);
        const d = h > 0.5 ? `M${f(x)} ${f(c.Y(0))}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(c.Y(0))}Z` : '';
        const inner = `<path d="${d}" fill="${grad(ci)}"${selRing(keySel)} stroke-linejoin="round"/>` +
          `<rect class="dt-focus" x="${f(x - 2)}" y="${f(Math.min(y, c.Y(0) - 14) - 2)}" width="${f(w + 4)}" height="${f(Math.max(h, 14) + 4)}" fill="transparent"/>` +
          (p > 0.6 ? txt(x + w / 2, y - 6, fmt(val), { fs: c.fs, fill: INK, w: 800 }) : '');
        return mark(`bar:${key}`, `${label}${ser ? ' (' + ser + ')' : ''}: ${fmt(val)}`, inner, true);
      };
      s.items.forEach((it, i) => {
        const x0 = c.ml + band * i + (band - bw) / 2;
        const label = lab(i);
        if (dbl) {
          const w = bw / 2 - 1;
          g += bar(i, x0, w, it.y, i, 0, 1, label, t(m.series[0])) + bar(i, x0 + w + 2, w, it.y2, n + i, 1, 1, label, t(m.series[1]));
        } else g += bar(i, x0, bw, it.y, i, i, 1, label);
        const ls = wrap(label, maxc);
        ls.forEach((l, k) => { g += txt(c.ml + band * i + band / 2, c.Y(0) + 16 + k * (c.fs + 2), l, { fs: c.fs - (band < 52 ? 1 : 0), fill: INK, w: 700 }); });
      });
      if (dbl) {
        const lx = c.ml; let x = lx;
        m.series.forEach((sr, k) => { g += `<rect x="${x}" y="8" width="14" height="14" rx="4" fill="${grad(k)}"/>` + txt(x + 20, 20, t(sr), { a: 'start', fs: c.fs, fill: INK, w: 700 }); x += 34 + t(sr).length * c.fs * 0.6; });
      }
      return { Hd, g };
    }

    function drawHist(Wd) {
      const Hd = Math.round(clamp(Wd * 0.7, 250, 380));
      const c = base(Wd, Hd, { mb: 46 });
      const sc = axisFor();
      const poly = s.chart === 'frequency-polygon';
      const lo0 = s.items[0].lo, hiN = s.items[n - 1].hi;
      let x0 = lo0, x1 = hiN;
      if (poly) { x0 = lo0 - (s.items[0].hi - s.items[0].lo); x1 = hiN + (s.items[n - 1].hi - s.items[n - 1].lo); }
      c.Y = (vv) => c.mt + c.ph * (1 - vv / sc.max);
      const X = (vv) => c.ml + (c.pw * (vv - x0)) / (x1 - x0);
      const w0 = Math.min(...s.items.map((i) => i.hi - i.lo));
      const adj = (it) => (it.y * w0) / (it.hi - it.lo);
      s.geo = { c, sc, adj: (it) => (it.hi - it.lo) / w0 };
      let g = axes(c, sc);
      const edges = poly ? s.items.map((i) => (i.lo + i.hi) / 2) : [s.items[0].lo].concat(s.items.map((i) => i.hi));
      const every = c.pw / edges.length < 34 ? 2 : 1;
      edges.forEach((e, k) => { if (k % every === 0) g += `<line x1="${f(X(e))}" x2="${f(X(e))}" y1="${f(c.Y(0))}" y2="${f(c.Y(0) + 4)}" stroke="${INK2}"/>` + txt(X(e), c.Y(0) + 17, fmt(e), { fs: c.fs - 0.5 }); });
      const pts = [];
      s.items.forEach((it, i) => {
        const { on, p } = vis(i);
        const xa = X(it.lo), xb = X(it.hi), h = on ? (c.Y(0) - c.Y(adj(it))) * p : 0;
        if (!poly) {
          const inner = on ? `<rect x="${f(xa)}" y="${f(c.Y(0) - h)}" width="${f(xb - xa)}" height="${f(h)}" fill="${grad(i)}"${selRing(s.sel === i)}/>` + (p > 0.6 ? txt((xa + xb) / 2, c.Y(0) - h - 6, fmt(it.y), { fs: c.fs, fill: INK, w: 800 }) : '') : `<rect x="${f(xa)}" y="${f(c.Y(0) - 14)}" width="${f(xb - xa)}" height="14" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="4 3"/>`;
          g += mark(`bar:${i}`, `${m.labels[i]}: ${fmt(it.y)}`, inner + `<rect class="dt-focus" x="${f(xa)}" y="${f(c.mt)}" width="${f(xb - xa)}" height="${f(c.ph)}" fill="transparent"/>`, on);
        } else {
          if (on) g += `<rect x="${f(xa)}" y="${f(c.Y(adj(it)))}" width="${f(xb - xa)}" height="${f(c.Y(0) - c.Y(adj(it)))}" fill="${grad(i)}" opacity=".16"/>`;
          pts.push({ i, on, x: X((it.lo + it.hi) / 2), y: c.Y(on ? adj(it) * p : 0), v: adj(it) });
        }
      });
      if (poly) {
        const first = { x: X(x0 + (s.items[0].hi - s.items[0].lo) * 0.5), y: c.Y(0) }, last = { x: X(x1 - (s.items[n - 1].hi - s.items[n - 1].lo) * 0.5), y: c.Y(0) };
        const on = pts.filter((q) => q.on);
        if (on.length) {
          const path = [first].concat(on).concat(on.length === n ? [last] : []);
          g += `<polyline points="${path.map((q) => `${f(q.x)},${f(q.y)}`).join(' ')}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
        g += `<circle cx="${f(first.x)}" cy="${f(first.y)}" r="4" fill="#fff" stroke="#2563EB" stroke-width="2"/><circle cx="${f(last.x)}" cy="${f(last.y)}" r="4" fill="#fff" stroke="#2563EB" stroke-width="2"/>`;
        pts.forEach((q) => {
          const inner = q.on ? `<circle class="dt-focus" cx="${f(q.x)}" cy="${f(q.y)}" r="${s.sel === q.i ? 9 : 7}" fill="#FF7A1A" stroke="#fff" stroke-width="2"/><circle cx="${f(q.x)}" cy="${f(q.y)}" r="18" fill="transparent"/>` + txt(q.x, q.y - 13, fmt(s.items[q.i].y), { fs: c.fs, fill: INK, w: 800 }) : `<circle class="dt-focus" cx="${f(q.x)}" cy="${f(q.y)}" r="7" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="3 2"/>`;
          g += mark(`bar:${q.i}`, `${m.labels[q.i]}: ${fmt(s.items[q.i].y)}`, inner, q.on);
        });
      }
      return { Hd, g };
    }

    function drawOgive(Wd) {
      const Hd = Math.round(clamp(Wd * 0.74, 260, 400));
      const c = base(Wd, Hd, { mb: 48 });
      const N = rd(ys().reduce((a, b) => a + b, 0));
      const sc = niceScale(N * 1.02);
      c.Y = (vv) => c.mt + c.ph * (1 - vv / sc.max);
      const lo0 = s.items[0].lo, hiN = s.items[n - 1].hi;
      const X = (vv) => c.ml + (c.pw * (vv - lo0)) / (hiN - lo0);
      let g = axes(c, sc);
      const edges = [lo0].concat(s.items.map((i) => i.hi));
      const every = c.pw / edges.length < 34 ? 2 : 1;
      edges.forEach((e, k) => { if (k % every === 0) g += txt(X(e), c.Y(0) + 17, fmt(e), { fs: c.fs - 0.5 }); });
      const cf = []; ys().reduce((a, vv, i) => (cf[i] = a + vv), 0);
      const lessP = [[lo0, 0]].concat(s.items.map((it, i) => [it.hi, cf[i]]));
      const moreP = s.items.map((it, i) => [it.lo, N - (i ? cf[i - 1] : 0)]).concat([[hiN, 0]]);
      const full = s.shown >= n;
      const med = groupStats(s.items.map((i) => i.lo), s.items.map((i) => i.hi), ys()).median;
      const showLess = m.cumulative !== 'more', showMore = m.cumulative !== 'less';
      const line = (pts, upto, col, dash) => {
        const use = pts.slice(0, upto);
        return use.length > 1 ? `<polyline points="${use.map((q) => `${f(X(q[0]))},${f(c.Y(q[1]))}`).join(' ')}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${dash ? ' stroke-dasharray="7 5"' : ''}/>` : '';
      };
      if (showLess) g += line(lessP, s.shown + 1, '#2563EB');
      if (showMore) g += line(moreP, showLess && !full ? 0 : s.shown + 1 > n ? n + 1 : s.shown + 1, '#FF7A1A');
      if (full && med != null && !(m.ask === 'median' && !s.solved)) {
        const my = c.Y(N / 2), mx = X(med);
        g += `<path d="M${c.ml} ${f(my)}H${f(mx)}V${f(c.Y(0))}" fill="none" stroke="#8B3DFF" stroke-width="2.2" stroke-dasharray="5 4"/>` +
          `<circle cx="${f(mx)}" cy="${f(my)}" r="5" fill="#8B3DFF"/>` + txt(c.ml + 4, my - 5, 'N/2', { a: 'start', fs: c.fs, fill: '#6D28D9', w: 800 }) + txt(mx, c.Y(0) - 6, fmt(Math.round(med * 100) / 100), { fs: c.fs, fill: '#6D28D9', w: 800 }).replace('text-anchor="middle"', 'text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3"');
      }
      lessP.forEach((q, k) => {
        if (k === 0) { if (showLess) g += `<circle cx="${f(X(q[0]))}" cy="${f(c.Y(0))}" r="4" fill="#2563EB"/>`; return; }
        const i = k - 1, on = i < s.shown;
        if (!showLess && !(showMore)) return;
        const px = showLess ? X(q[0]) : X(s.items[i].lo), py = showLess ? c.Y(q[1]) : c.Y(moreP[i][1]);
        const inner = on ? `<circle class="dt-focus" cx="${f(px)}" cy="${f(py)}" r="${s.sel === i ? 9 : 6.5}" fill="${showLess ? '#2563EB' : '#FF7A1A'}" stroke="#fff" stroke-width="2"/><circle cx="${f(px)}" cy="${f(py)}" r="18" fill="transparent"/>` : `<circle class="dt-focus" cx="${f(px)}" cy="${f(py)}" r="6" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="3 2"/>`;
        g += mark(`bar:${i}`, `${m.labels[i]}: ${on ? fmt(showLess ? cf[i] : moreP[i][1]) : '–'}`, inner, false);
      });
      let lx = c.ml + 6;
      if (showLess) { g += `<rect x="${lx}" y="${c.mt - 12}" width="14" height="5" rx="2" fill="#2563EB"/>` + txt(lx + 20, c.mt - 6, t(W.less), { a: 'start', fs: c.fs - 1, fill: INK, w: 700 }); lx += 90; }
      if (showMore) g += `<rect x="${lx}" y="${c.mt - 12}" width="14" height="5" rx="2" fill="#FF7A1A"/>` + txt(lx + 20, c.mt - 6, t(W.more), { a: 'start', fs: c.fs - 1, fill: INK, w: 700 });
      s.geo = { c, sc };
      return { Hd, g };
    }

    function drawXY(Wd) {
      const sat = s.chart === 'scatter';
      const Hd = Math.round(clamp(Wd * 0.72, 250, 390));
      const c = base(Wd, Hd, { mb: 44, mr: 16 });
      const sc = axisFor();
      c.Y = (vv) => c.mt + c.ph * (1 - (vv - sc.min) / (sc.max - sc.min));
      let g = '';
      ticks(sc).forEach((tv) => { const y = c.Y(tv); g += `<line x1="${c.ml}" x2="${c.ml + c.pw}" y1="${f(y)}" y2="${f(y)}" stroke="${GRID}"/>` + txt(c.ml - 6, y + 4, fmt(tv), { a: 'end', fs: c.fs }); });
      if (sc.min < 0 && sc.max > 0) g += `<line x1="${c.ml}" x2="${c.ml + c.pw}" y1="${f(c.Y(0))}" y2="${f(c.Y(0))}" stroke="${INK2}" stroke-width="1.6"/>`;
      g += `<line x1="${c.ml}" x2="${c.ml}" y1="${c.mt}" y2="${c.mt + c.ph}" stroke="${INK2}" stroke-width="1.6"/><line x1="${c.ml}" x2="${c.ml + c.pw}" y1="${c.mt + c.ph}" y2="${c.mt + c.ph}" stroke="${INK2}" stroke-width="1.6"/>`;
      if (m.ylabel) g += txt(12, c.mt + c.ph / 2, t(m.ylabel), { rot: -90, fs: c.fs, fill: INK, w: 700 });
      if (m.xlabel) g += txt(c.ml + c.pw / 2, c.H - 6, t(m.xlabel), { fs: c.fs, fill: INK, w: 700 });
      let X;
      if (m.xcat) {
        const band = c.pw / n; X = (it) => c.ml + band * (it.k + 0.5);
        const maxc = Math.max(3, Math.floor(band / (c.fs * 0.56)));
        s.items.forEach((it, i) => { wrap(lab(i), maxc).forEach((l, k) => { g += txt(X(it), c.mt + c.ph + 16 + k * (c.fs + 2), l, { fs: c.fs - (band < 40 ? 1 : 0), fill: INK, w: 700 }); }); });
      } else {
        const xr = niceRange(Math.min(...m.xs), Math.max(...m.xs));
        X = (it) => c.ml + 10 + ((c.pw - 20) * (it.x - xr.min)) / (xr.max - xr.min);
        ticks(xr).forEach((tv) => { const x = c.ml + 10 + ((c.pw - 20) * (tv - xr.min)) / (xr.max - xr.min); g += `<line x1="${f(x)}" x2="${f(x)}" y1="${c.mt + c.ph}" y2="${c.mt + c.ph + 4}" stroke="${INK2}"/>` + txt(x, c.mt + c.ph + 17, fmt(tv), { fs: c.fs - 0.5 }); if (sat) g += `<line x1="${f(x)}" x2="${f(x)}" y1="${c.mt}" y2="${c.mt + c.ph}" stroke="${GRID}" opacity=".6"/>`; });
      }
      s.geo = { c, sc };
      const pts = s.items.map((it, i) => { const { on, p } = vis(i); const prev = i ? s.items[i - 1].y : it.y; return { i, on, x: X(it), y: c.Y(on && p < 1 ? prev + (it.y - prev) * p : it.y) }; });
      const on = pts.filter((q) => q.on);
      if (!sat && on.length > 1) {
        const pl = on.map((q) => `${f(q.x)},${f(q.y)}`).join(' ');
        g += `<defs><linearGradient id="${uid}ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563EB" stop-opacity=".28"/><stop offset="1" stop-color="#2563EB" stop-opacity="0"/></linearGradient></defs>`;
        g += `<polygon points="${f(on[0].x)},${f(c.mt + c.ph)} ${pl} ${f(on[on.length - 1].x)},${f(c.mt + c.ph)}" fill="url(#${uid}ar)"/><polyline points="${pl}" fill="none" stroke="#2563EB" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      if (sat && s.trend && s.shown >= n) {
        const pr = pearson(s.items.map((i) => i.x), ys());
        if (pr.slope != null) {
          const xs = s.items.map((i) => i.x), xa = Math.min(...xs), xb = Math.max(...xs);
          const yA = clamp(pr.slope * xa + pr.icpt, sc.min, sc.max), yB = clamp(pr.slope * xb + pr.icpt, sc.min, sc.max);
          g += `<line x1="${f(X({ x: xa, k: 0 }))}" y1="${f(c.Y(yA))}" x2="${f(X({ x: xb, k: 0 }))}" y2="${f(c.Y(yB))}" stroke="#8B3DFF" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round"/>`;
        }
      }
      const labels = !sat && n <= 12 && c.pw / n > 26;
      pts.forEach((q) => {
        const it = s.items[q.i];
        const inner = q.on ? `<circle class="dt-focus" cx="${f(q.x)}" cy="${f(q.y)}" r="${s.sel === q.i ? 9 : sat ? 7 : 6.5}" fill="${sat ? PAL[q.i % PAL.length] : '#fff'}" stroke="${sat ? '#fff' : '#2563EB'}" stroke-width="${sat ? 2 : 3.2}"/><circle cx="${f(q.x)}" cy="${f(q.y)}" r="18" fill="transparent"/>` + (labels ? txt(q.x, q.y - 13, fmt(it.y), { fs: c.fs, fill: INK, w: 800 }) : '') : `<circle class="dt-focus" cx="${f(q.x)}" cy="${f(q.y)}" r="6.5" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="3 2"/>`;
        g += mark(`bar:${q.i}`, `${sat ? `${fmt(it.x)}, ` : m.labels[q.i] + ': '}${q.on ? fmt(it.y) : '–'}`, inner, q.on);
      });
      return { Hd, g };
    }

    function drawPie(Wd) {
      const wide = Wd >= 520;
      const r = wide ? Math.min(150, Wd * 0.24) : Math.min(120, Wd / 2 - 24);
      const rowH = 26;
      const Hd = wide ? Math.max(2 * r + 36, n * rowH + 60) : 2 * r + 30 + n * rowH + 26;
      const cx = wide ? 24 + r : Wd / 2, cy = 18 + r;
      const tot = ys().reduce((a, b) => a + b, 0);
      let a0 = -90, g = '';
      const pt = (ang, rr) => [cx + rr * Math.cos((ang * Math.PI) / 180), cy + rr * Math.sin((ang * Math.PI) / 180)];
      s.items.forEach((it, i) => {
        const { on, p } = vis(i);
        const full = (it.y / tot) * 360, ang = full * (on ? p : 1), a1 = a0 + ang;
        const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r), big = ang > 180 ? 1 : 0;
        const d = `M${f(cx)} ${f(cy)}L${f(x0)} ${f(y0)}A${r} ${r} 0 ${big} 1 ${f(x1)} ${f(y1)}Z`;
        const mid = a0 + full / 2, [lx, ly] = pt(mid, r * 0.62);
        const inner = on ? `<path d="${d}" fill="${grad(i)}"${selRing(s.sel === i)} stroke-linejoin="round" transform="${s.sel === i ? `translate(${f(Math.cos((mid * Math.PI) / 180) * 7)} ${f(Math.sin((mid * Math.PI) / 180) * 7)})` : ''}"/>` + (full > 24 && p > 0.7 ? txt(lx, ly + 4, `${fmt((it.y / tot) * 100)}%`, { fs: 12.5, fill: [4, 7, 2, 6].includes(i % 8) ? INK : '#fff', w: 800 }) : '') :
          `<path d="${d}" fill="none" stroke="${GRID}" stroke-width="2" stroke-dasharray="4 3"/>`;
        g += mark(`bar:${i}`, `${m.labels[i]}: ${fmt(it.y)}`, inner + `<path class="dt-focus" d="${d}" fill="transparent"/>`, false);
        a0 += full;
      });
      // legend
      const lx = wide ? Wd * 0.56 : Math.max(10, Wd / 2 - 118), ly0 = wide ? 22 : 2 * r + 38;
      s.items.forEach((it, i) => {
        const y = ly0 + i * rowH, on = i < s.shown;
        g += `<rect x="${lx}" y="${y - 12}" width="14" height="14" rx="4" fill="${grad(i)}" opacity="${on ? 1 : 0.35}"/>` + txt(lx + 22, y, lab(i), { a: 'start', fs: 12.5, fill: INK, w: 700 }) +
          (on ? txt(lx + 218, y, `${fmt(it.y)} · ${fmt(Math.round((it.y / tot) * 3600) / 10)}° `, { a: 'end', fs: 12, fill: INK2, w: 600 }) : '');
      });
      return { Hd, g, pie: true };
    }

    function iconG(kind, col, x, y, size, half) {
      const sc = size / 20;
      return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(sc)})"${half ? ` clip-path="url(#${uid}half)"` : ''}>${ICON[kind](col)}</g>`;
    }
    function drawPicto(Wd) {
      const labW = clamp(Wd * 0.28, 70, 130), unit = m.unit;
      const maxIcons = Math.max(...s.items.map((i) => Math.ceil(i.y / unit - 1e-9)), 1);
      const size = clamp((Wd - labW - 24) / maxIcons - 3, 14, 30), rowH = Math.max(size + 14, 38);
      const Hd = 40 + n * rowH + 8;
      let g = `<defs><clipPath id="${uid}half"><rect x="0" y="0" width="10" height="20"/></clipPath></defs>`;
      g += iconG(m.icon, '#F5B90A', 12, 10, 20, false) + txt(38, 25, `= ${fmt(unit)}  (${t(ICONNAME[m.icon])})`, { a: 'start', fs: 13, fill: INK, w: 800 });
      s.items.forEach((it, i) => {
        const y = 40 + i * rowH, { on, p } = vis(i), cnt = (it.y / unit) * (on ? p : 1);
        let inner = `<rect class="dt-focus" x="6" y="${y}" width="${f(Wd - 12)}" height="${rowH - 4}" rx="10" fill="${s.sel === i ? 'rgba(22,163,74,.14)' : i % 2 ? 'rgba(37,99,235,.05)' : 'transparent'}"/>`;
        wrap(lab(i), Math.floor(labW / 6.8)).forEach((l, k, arr) => { inner += txt(14, y + rowH / 2 + 1 + (k - (arr.length - 1) / 2) * 13, l, { a: 'start', fs: 12.5, fill: INK, w: 700 }); });
        if (!on) inner += `<line x1="${labW}" x2="${f(Wd - 14)}" y1="${y + rowH / 2 - 2}" y2="${y + rowH / 2 - 2}" stroke="${GRID}" stroke-width="2" stroke-dasharray="4 3"/>`;
        else {
          const full = Math.floor(cnt + 1e-9), half = cnt - full > 0.25;
          for (let k = 0; k < full; k++) inner += iconG(m.icon, colour(i), labW + k * (size + 3), y + (rowH - 4 - size) / 2, size, false);
          if (half) inner += iconG(m.icon, colour(i), labW + full * (size + 3), y + (rowH - 4 - size) / 2, size, true);
          inner += txt(labW + Math.ceil(cnt) * (size + 3) + 4, y + rowH / 2 + 3, p > 0.7 ? fmt(it.y) : '', { a: 'start', fs: 12.5, fill: INK, w: 800 });
        }
        g += mark(`bar:${i}`, `${lab(i)}: ${on ? fmt(it.y) : '–'}`, inner, false);
      });
      return { Hd, g };
    }
    function drawTally(Wd) {
      const labW = clamp(Wd * 0.28, 70, 120), rowH = 44;
      const Hd = 12 + n * rowH + 8;
      const maxG = Math.max(...s.items.map((i) => Math.ceil(i.y / 5)), 1);
      const gw = Math.min(40, (Wd - labW - 70) / maxG), sp = (gw - 10) / 4;
      let g = '';
      s.items.forEach((it, i) => {
        const y = 12 + i * rowH, { on, p } = vis(i), cnt = Math.round(it.y * (on ? p : 1));
        let inner = `<rect class="dt-focus" x="6" y="${y}" width="${f(Wd - 12)}" height="${rowH - 4}" rx="10" fill="${s.sel === i ? 'rgba(22,163,74,.14)' : i % 2 ? 'rgba(37,99,235,.05)' : 'transparent'}"/>`;
        wrap(lab(i), Math.floor(labW / 6.8)).forEach((l, k, arr) => { inner += txt(14, y + rowH / 2 - 1 + (k - (arr.length - 1) / 2) * 13, l, { a: 'start', fs: 12.5, fill: INK, w: 700 }); });
        if (!on) inner += `<line x1="${labW}" x2="${f(Wd - 14)}" y1="${y + rowH / 2 - 2}" y2="${y + rowH / 2 - 2}" stroke="${GRID}" stroke-width="2" stroke-dasharray="4 3"/>`;
        let k = 0, gi = 0;
        while (k < cnt) {
          const inG = Math.min(5, cnt - k), x0 = labW + gi * gw;
          for (let q = 0; q < Math.min(inG, 4); q++) inner += `<line x1="${f(x0 + q * sp + 2)}" x2="${f(x0 + q * sp + 2)}" y1="${y + 6}" y2="${y + rowH - 10}" stroke="${colour(i)}" stroke-width="3.4" stroke-linecap="round"/>`;
          if (inG === 5) inner += `<line x1="${f(x0 - 2)}" y1="${y + rowH - 14}" x2="${f(x0 + 4 * sp + 6)}" y2="${y + 10}" stroke="${colour(i)}" stroke-width="3.4" stroke-linecap="round"/>`;
          k += inG; gi++;
        }
        if (on) inner += txt(Wd - 14, y + rowH / 2 + 3, p > 0.7 ? `= ${fmt(it.y)}` : '', { a: 'end', fs: 13.5, fill: INK, w: 800 });
        g += mark(`bar:${i}`, `${lab(i)}: ${on ? fmt(it.y) : '–'}`, inner, false);
      });
      return { Hd, g };
    }

    function drawChart() {
      if (destroyed) return;
      const Wd = Math.max(300, Math.round(R.chart.clientWidth - 16) || 340);
      s.W = Wd;
      const fn = { bar: drawBars, 'double-bar': drawBars, histogram: drawHist, 'frequency-polygon': drawHist, ogive: drawOgive, line: drawXY, scatter: drawXY, pie: drawPie, pictograph: drawPicto, tally: drawTally }[s.chart];
      const out = fn(Wd);
      const rowsTxt = s.items.slice(0, s.shown).map((it, i) => `${m.labels[i] != null && !m.xs ? lab(i) : lab(i)}: ${fmt(it.y)}`).join('; ');
      R.svg.innerHTML = `<svg viewBox="0 0 ${Wd} ${out.Hd}" width="${Wd}" height="${out.Hd}" role="group" aria-label="${esc(t(NAME[s.chart]) + '. ' + rowsTxt)}">${defs()}${out.g}</svg>`;
      if (s.focus) { const e = R.svg.querySelector(`[data-key="${s.focus}"]`); if (e) try { e.focus({ preventScroll: true }); } catch (_) {} }
    }

    // ---- table
    function buildTable() {
      const two = m.kind === 'dbl';
      const head = m.kind === 'grp' ? [W.cls, W.freq] : s.chart === 'scatter' || (m.xs && !m.xcat) ? [m.xlabel || T2('x', 'x'), m.ylabel || T2('y', 'y')] : [m.xlabel || W.item, m.ylabel || W.number];
      let h = `<div class="dt-row hd${two ? ' dt-two' : ''}" role="row"><span>${esc(t(head[0]))}</span>` + (two ? `<span></span><span>${esc(t(m.series[0]))}</span><span></span><span>${esc(t(m.series[1]))}</span>` : `<span></span><span>${esc(t(head[1]))}</span>`) + '</div>';
      s.items.forEach((it, i) => {
        const a11y = t(T2('Change the number for ', 'संख्या बदलो: ')) + (m.xs && !m.xcat ? fmt(it.x) : lab(i));
        const rng = (idx, k) => `<input type="range" data-key="slider:${idx}" data-i="${idx}" min="${m.smin}" max="${m.smax}" step="${m.step}" value="${k}" aria-label="${esc(a11y)}${two ? ' (' + esc(t(m.series[idx >= n ? 1 : 0])) + ')' : ''}">`;
        h += `<div class="dt-row${two ? ' dt-two' : ''}" data-row="${i}"><span class="nm" data-nm></span>` + (two ? `<b data-s data-v="${i}" style="--c:${PAL[0]}"></b>${rng(i, it.y)}<b data-s data-v="${n + i}" style="--c:${PAL[1]}"></b>${rng(n + i, it.y2)}` : `<b data-v="${i}"></b>${rng(i, it.y)}`) + '</div>';
      });
      R.tbl.innerHTML = h;
    }
    function updateTable() {
      const cap = (i) => (m.kind === 'grp' ? m.labels[i] : m.xs && !m.xcat ? fmt(s.items[i].x) : lab(i));
      R.tbl.querySelectorAll('[data-row]').forEach((row) => {
        const i = +row.dataset.row, on = i < s.shown, it = s.items[i];
        row.classList.toggle('off', !on);
        row.classList.toggle('sel', s.sel === i || s.sel === n + i);
        row.querySelector('[data-nm]').textContent = cap(i);
        row.querySelectorAll('[data-v]').forEach((b) => { const idx = +b.dataset.v; b.textContent = on ? fmt(idx >= n ? it.y2 : it.y) : '–'; });
        row.querySelectorAll('input').forEach((inp) => { const idx = +inp.dataset.i; inp.disabled = !on; const val = idx >= n ? it.y2 : it.y; if (+inp.value !== val) inp.value = val; });
      });
    }
    function buildTabs() {
      if (m.views.length < 2) { R.tabs.hidden = true; return; }
      R.tabs.innerHTML = `<span>${esc(t(W.views))}</span>` + m.views.map((c) => `<button type="button" class="dt-tab" data-key="chart:${c}" data-c="${c}" aria-pressed="${c === s.chart}">${esc(t(NAME[c]))}</button>`).join('');
    }
    function buildActions() {
      let h = `<button type="button" class="dt-btn go" data-key="add-row" data-a="add"></button>`;
      if (m.kind === 'cat' || m.kind === 'dbl') h += `<button type="button" class="dt-btn" data-key="sort" data-a="sort"></button>`;
      if (m.chart === 'scatter') h += `<button type="button" class="dt-btn" data-key="trend" data-a="trend"></button>`;
      h += `<button type="button" class="dt-btn" data-key="reset" data-a="reset"></button>`;
      R.actions.innerHTML = h;
    }
    function updateActions() {
      const add = R.actions.querySelector('[data-a=add]');
      add.textContent = s.shown >= n ? t(W.plotted) : `${t(W.plot)} (${s.shown}/${n})`;
      add.disabled = s.shown >= n;
      const so = R.actions.querySelector('[data-a=sort]'); if (so) so.textContent = t(s.sorted ? W.unsort : W.sort);
      const tr = R.actions.querySelector('[data-a=trend]'); if (tr) { tr.textContent = t(s.trend ? W.trendOff : W.trend); tr.hidden = s.chart !== 'scatter'; }
      R.actions.querySelector('[data-a=reset]').textContent = t(W.reset);
    }

    // ---- the question
    let ansVal = '';
    const askKind = () => (m.kind === 'grp' ? 'g' + m.ask : m.ask);
    function buildAsk() {
      if (!m.ask) { R.askcard.hidden = true; return; }
      R.askcard.hidden = false;
      R.askh.textContent = t(W.question);
      let q = t(QTEXT[askKind()]);
      if (m.kind === 'dbl') q += ' (' + t(m.series[0]) + ')';
      R.askq.textContent = q;
      if (m.ask === 'max' || m.ask === 'min') {
        R.askui.innerHTML = `<div class="dt-chips" data-key="answer" role="group" aria-label="${esc(q)}">` + m.labels.map((_, i) => `<button type="button" class="dt-chip" data-pick="${i}">${esc(lab(i))}</button>`).join('') + '</div>';
      } else if (m.ask === 'correlation') {
        R.askui.innerHTML = `<div class="dt-chips" data-key="answer" role="group" aria-label="${esc(q)}">` + [['pos', W.pos], ['neg', W.neg], ['none', W.nocorr]].map(([id, w]) => `<button type="button" class="dt-chip" data-pick="${id}">${esc(t(w))}</button>`).join('') + '</div>';
      } else {
        R.askui.innerHTML = `<div class="dt-ansrow"><input class="dt-inp" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(t(W.yours))}" placeholder="${esc(t(W.yours))}" value="${esc(ansVal)}"><button type="button" class="dt-btn go" data-key="answer" data-chk>${esc(t(W.check))}</button></div>`;
      }
    }
    function judge(pick) {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      if (s.shown < n) { R.fb.className = 'dt-fb bad'; R.fb.textContent = t(W.plotAll); return; }
      let ok = false, bad = '';
      const st = computeStats();
      if (m.ask === 'max' || m.ask === 'min') {
        const set = m.ask === 'max' ? st.argmax : st.argmin;
        ok = set.includes(+pick);
      } else if (m.ask === 'correlation') {
        if (st.cls === 'mid' || st.cls == null) { R.fb.className = 'dt-fb bad'; R.fb.textContent = t(W.unclear); return; }
        ok = st.cls === pick;
      } else {
        const want = m.kind === 'grp' ? st[m.ask] : m.ask === 'mean' ? st.mean : st[m.ask];
        if (want == null) { R.fb.className = 'dt-fb bad'; R.fb.textContent = t(m.ask === 'mode' ? W.nomode : W.notnum); return; }
        const inp = R.askui.querySelector('input'); ansVal = inp.value;
        const num = Number(String(inp.value).trim().replace(',', '.'));
        if (!inp.value.trim() || !isFinite(num)) { R.fb.className = 'dt-fb bad'; R.fb.textContent = t(W.notnum); return; }
        ok = Math.abs(num - want) <= 0.05 + 1e-9;
      }
      if (ok) {
        s.solved = true;
        R.fb.className = 'dt-fb good';
        R.fb.textContent = t(W.ok);
        if (R.askui.querySelector('.dt-chips')) { const b = R.askui.querySelector(`[data-pick="${pick}"]`); if (b) b.classList.add('right'); }
        drawStats();
        const c = cards().find((x) => x.key === (m.ask === 'correlation' ? 'r' : m.ask));
        if (c) { const sub = typeof c.sub === 'string' && !m.labels.includes(c.sub) ? c.sub : t(c.sub || ''); R.fb.textContent = `${t(W.ok)} ${t(c.name)} = ${c.val}${sub ? ' (' + sub + ')' : ''}`; }
        api.record(`answered the ${m.ask} question correctly`);
        api.emit('answered:right');
        api.celebrate();
        live(R.fb.textContent);
      } else {
        const b = R.askui.querySelector(`[data-pick="${pick}"]`); if (b) { b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 1200); }
        R.fb.className = 'dt-fb bad';
        R.fb.textContent = t(W.no) + ' ' + t(HINT[askKind()]);
        api.record(`answered the ${m.ask} question wrongly`);
        api.emit('answered:wrong');
        live(R.fb.textContent);
      }
    }

    // ---- everything that follows a change of numbers
    function readout() {
      if (s.sel < 0) { R.read.textContent = t(isDrag() ? W.hintDrag : W.hintTap); return; }
      const i = s.sel % n, it = s.items[i], second = m.kind === 'dbl' && s.sel >= n;
      const nm = m.xs && !m.xcat ? fmt(it.x) : lab(i);
      R.read.textContent = `${nm}: ${fmt(second ? it.y2 : it.y)}${m.kind === 'dbl' ? ' (' + t(m.series[second ? 1 : 0]) + ')' : ''}`;
    }
    function refresh(parts = 'all') {
      drawChart(); readout(); drawStats(); updateTable(); updateActions();
      R.note.textContent = unequal() && m.kind === 'grp' && s.chart !== 'ogive' ? t(W.adj) : '';
    }
    function setLang() {
      R.title.textContent = m.title ? t(m.title) : t(NAME[s.chart]);
      R.title.hidden = false;
      R.kind.textContent = m.title ? t(NAME[s.chart]) : '';
      R.kind.hidden = !m.title;
      R.tblh.textContent = t(W.table); R.stath.textContent = t(W.stats);
    }
    function select(i) { s.sel = i; refresh(); api.emit('selected:' + (i % n)); }

    // ---- actions
    function addRow() {
      if (!api.allowed('add-row')) { api.nudge('add-row'); return; }
      if (s.shown >= n) return;
      s.shown++;
      const i = s.shown - 1;
      s.sel = i;
      s.grow = { i, p: 0 };
      api.record(`plotted row ${s.shown} of ${n}`);
      api.emit('plotted');
      live(`${lab(i)}: ${fmt(s.items[i].y)}`);
      stops.push(tween(650, (p) => { s.grow = { i, p: L.ease(p) }; refresh(); }, () => { s.grow = null; refresh(); }));
    }
    function setValue(idx, val, endOfChange) {
      const i = idx % n, it = s.items[i], second = idx >= n;
      val = clamp(Math.round(val / m.step) * m.step, m.smin, m.smax);
      val = rd(val);
      const old = second ? it.y2 : it.y;
      if (second) it.y2 = val; else it.y = val;
      return val !== old;
    }
    function doSort() {
      if (!api.allowed('sort')) { api.nudge('sort'); return; }
      if (s.shown < n) { toast(t(W.plotAll)); return; }
      if (!s.sorted) s.items.sort((a, b) => a.y - b.y || a.k - b.k); else s.items.sort((a, b) => a.k - b.k);
      s.sorted = !s.sorted; s.sel = -1;
      if (s.sorted) { api.record('sorted the data from small to big'); api.emit('sorted'); live(t(W.sorted)); }
      m.labels = s.items.map((i) => i.label);
      refresh();
    }
    function toast(x) { if (api.toast) api.toast(x); }
    function doReset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      s.items = JSON.parse(JSON.stringify(orig)); m.labels = s.items.map((i) => i.label); s.sorted = false; s.sel = -1; s.ax = null;
      refresh(); api.record('reset the numbers'); api.emit('changed');
    }
    function setChart(c) {
      if (!api.allowed('chart:' + c)) { api.nudge('chart:' + c); return; }
      if (c === s.chart) return;
      s.chart = c; s.ax = null; s.sel = -1;
      R.tabs.querySelectorAll('.dt-tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
      setLang(); refresh(); updateActions();
      R.svg.classList.remove('dt-pop'); void R.svg.offsetWidth; R.svg.classList.add('dt-pop');
      api.record('looked at the data as a ' + NAME[c].en);
      api.emit('plotted');
      live(t(NAME[c]));
    }

    // ---- events
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('.dt-tab'); if (tab) { setChart(tab.dataset.c); return; }
      const act = e.target.closest('[data-a]');
      if (act) {
        const a = act.dataset.a;
        if (a === 'add') addRow(); else if (a === 'sort') doSort(); else if (a === 'reset') doReset();
        else if (a === 'trend') { if (!api.allowed('trend')) { api.nudge('trend'); return; } if (s.shown < n) { toast(t(W.plotAll)); return; } s.trend = !s.trend; refresh(); }
        return;
      }
      const pick = e.target.closest('[data-pick]'); if (pick) { judge(pick.dataset.pick); return; }
      if (e.target.closest('[data-chk]')) judge();
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.matches('.dt-inp') && e.key === 'Enter') { judge(); return; }
      const mk = e.target.closest && e.target.closest('svg [data-key^="bar:"]');
      if (!mk) return;
      const idx = +mk.dataset.key.slice(4), key = mk.dataset.key;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.focus = key; select(idx); return; }
      if (isDrag() && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && idx % n < s.shown) {
        e.preventDefault();
        if (!api.allowed(key)) { api.nudge(key); return; }
        s.focus = key;
        const it = s.items[idx % n], cur = idx >= n ? it.y2 : it.y;
        if (setValue(idx, cur + (e.key === 'ArrowUp' ? 1 : -1) * m.step * (m.chart === 'histogram' ? 1 : 1))) { s.sel = idx; refresh(); api.record(`changed ${lab(idx % n)} to ${fmt(idx >= n ? it.y2 : it.y)}`); api.emit('changed'); }
      }
    });
    root.addEventListener('input', (e) => {
      const inp = e.target.closest('input[type=range]'); if (!inp) return;
      const idx = +inp.dataset.i;
      if (!api.allowed('slider:' + idx)) { api.nudge('slider:' + idx); inp.value = idx >= n ? s.items[idx - n].y2 : s.items[idx].y; return; }
      if (setValue(idx, +inp.value)) { s.sel = idx; drawChart(); readout(); drawStats(); R.tbl.querySelectorAll('[data-v]').forEach((b) => { const k = +b.dataset.v; if (k === idx) b.textContent = fmt(k >= n ? s.items[k - n].y2 : s.items[k].y); }); R.tbl.querySelectorAll('[data-row]').forEach((r) => r.classList.toggle('sel', +r.dataset.row === idx % n)); }
    });
    root.addEventListener('change', (e) => {
      const inp = e.target.closest('input[type=range]'); if (!inp) return;
      const idx = +inp.dataset.i;
      api.record(`moved a slider: ${lab(idx % n)} is now ${fmt(idx >= n ? s.items[idx - n].y2 : s.items[idx].y)}`);
      api.emit('changed'); live(R.read.textContent);
    });
    // drag a bar or a point
    R.svg.addEventListener('pointerdown', (e) => {
      const mk = e.target.closest('[data-key^="bar:"]'); if (!mk) return;
      const idx = +mk.dataset.key.slice(4);
      s.drag = { idx, key: mk.dataset.key, y0: e.clientY, moved: false, pid: e.pointerId, v0: idx >= n ? s.items[idx - n].y2 : s.items[idx % n].y };
      s.ax = s.geo && s.geo.sc;
      const mv = (ev) => {
        const d = s.drag; if (!d) return;
        if (!d.moved && Math.abs(ev.clientY - d.y0) < 5) return;
        if (!isDrag() || idx % n >= s.shown) return;
        if (!d.moved) { if (!api.allowed(d.key)) { api.nudge(d.key); s.drag = null; cl(); return; } d.moved = true; }
        ev.preventDefault();
        const g = s.geo, rect = R.svg.querySelector('svg').getBoundingClientRect(), py = ((ev.clientY - rect.top) * (s.W ? R.svg.querySelector('svg').viewBox.baseVal.width / rect.width : 1));
        let val = g.sc.min + (1 - (py - g.c.mt) / g.c.ph) * (g.sc.max - g.sc.min);
        if (g.adj) val *= g.adj(s.items[idx % n]);
        if (setValue(idx, val)) { s.sel = idx; s.focus = null; drawChart(); readout(); drawStats(); updateTable(); }
      };
      const up = () => {
        const d = s.drag; cl(); s.drag = null;
        if (!d) return;
        if (d.moved) { const it = s.items[idx % n]; api.record(`dragged ${lab(idx % n)} to ${fmt(idx >= n ? it.y2 : it.y)}`); api.emit('changed'); live(R.read.textContent); refresh(); }
        else { s.focus = null; select(idx); }
      };
      const cl = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
      window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      winL.push(cl);
    });
    R.svg.addEventListener('click', (e) => { s.focus = null; });

    // ---- start
    buildTabs(); buildActions(); buildTable(); buildAsk(); setLang(); refresh();
    let lastLang = lang();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      const w = Math.max(300, Math.round(R.chart.clientWidth - 16));
      if (Math.abs(w - s.W) > 6 || lang() !== lastLang) {
        if (lang() !== lastLang) { lastLang = lang(); buildTabs(); buildAsk(); setLang(); }
        drawChart(); readout(); drawStats(); updateTable(); updateActions();
      }
    }) : null;
    if (ro) ro.observe(R.chart);
    return { destroy() { destroyed = true; cleanup(); winL.forEach((f2) => f2()); if (ro) ro.disconnect(); } };
  }

  // ---------------------------------------------------------------- demo and keys
  const demo = {
    chart: 'histogram',
    title: T2('Marks of 40 children in a quiz', 'क्विज़ में 40 बच्चों के अंक'),
    xlabel: T2('Marks', 'अंक'), ylabel: T2('Number of children', 'बच्चों की संख्या'),
    data: [
      { label: '0-10', value: 3 }, { label: '10-20', value: 7 }, { label: '20-30', value: 12 }, { label: '30-40', value: 10 }, { label: '40-50', value: 8 },
    ],
    ask: 'median', show: 2,
  };

  NCA_T.register({
    id: 'data',
    css: CSS,
    demo,
    validate(config) { return normalise(config).errors; },
    keys(config) {
      const v = normalise(config);
      if (v.errors.length) return { targets: [], events: [] };
      const m = v.m, n = m.n, targets = ['add-row', 'reset'];
      for (let i = 0; i < n; i++) targets.push('bar:' + i);
      if (m.kind === 'dbl') for (let i = 0; i < n; i++) targets.push('bar:' + (n + i));
      const sl = m.kind === 'dbl' ? 2 * n : n;
      for (let i = 0; i < sl; i++) targets.push('slider:' + i);
      if (m.views.length > 1) m.views.forEach((c) => targets.push('chart:' + c));
      if (m.kind === 'cat' || m.kind === 'dbl') targets.push('sort');
      if (m.views.includes('scatter')) targets.push('trend');
      if (m.ask) targets.push('answer');
      const events = ['plotted', 'changed', 'selected:*'];
      if (m.kind === 'cat' || m.kind === 'dbl') events.push('sorted');
      if (m.ask) events.push('answered:right', 'answered:wrong');
      return { targets, events };
    },
    mount(root, config, api) { return build(root, config, api); },
  });
})();
