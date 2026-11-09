// Template: Mind lab. Classic psychology experiments the child runs on themselves: memory span, the serial-position
// curve, the Stroop effect, reaction time, three visual illusions, divided attention, a learning curve and a survey.
// Every score is measured from what the child really does (timers, counts, true line lengths); nothing is scripted.
// Results stay in the page: nothing is stored or sent, and the screen says it is a demonstration, not a test of the child.
// Config:
//   { experiment: 'memory-span' | 'serial-position' | 'stroop' | 'reaction-time' | 'illusion:muller-lyer' |
//                 'illusion:ponzo' | 'illusion:kanizsa' | 'attention-split' | 'learning-curve' | 'survey',
//     trials?: integer }   (rounds; the allowed range depends on the experiment, see RANGE below)
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });

  const EXPERIMENTS = ['memory-span', 'serial-position', 'stroop', 'reaction-time', 'illusion', 'attention-split', 'learning-curve', 'survey'];
  const ILLUSIONS = ['muller-lyer', 'ponzo', 'kanizsa'];
  // [min, max, default] of `trials` for each experiment, and what it counts.
  const RANGE = {
    'memory-span': [2, 10, 5], 'serial-position': [8, 20, 12], stroop: [4, 20, 8], 'reaction-time': [3, 10, 5],
    illusion: [2, 8, 4], 'attention-split': [4, 12, 6], 'learning-curve': [3, 10, 6], survey: [1, 3, 3],
  };
  const baseOf = (e) => (typeof e === 'string' && e.indexOf('illusion:') === 0 ? 'illusion' : e);

  // ---------------------------------------------------------------- data
  const COLS = [
    { id: 'red', hex: '#EF4444', n: T2('red', 'लाल') },
    { id: 'blue', hex: '#3B82F6', n: T2('blue', 'नीला') },
    { id: 'green', hex: '#22C55E', n: T2('green', 'हरा') },
    { id: 'yellow', hex: '#FACC15', n: T2('yellow', 'पीला') },
  ];
  // Concrete, easy, familiar nouns (40) for the word-list experiment.
  const WORDS = [
    T2('mango', 'आम'), T2('book', 'किताब'), T2('tree', 'पेड़'), T2('cow', 'गाय'), T2('river', 'नदी'), T2('chair', 'कुर्सी'), T2('bus', 'बस'),
    T2('moon', 'चाँद'), T2('rain', 'बारिश'), T2('bird', 'चिड़िया'), T2('drum', 'ढोल'), T2('lamp', 'दीया'), T2('kite', 'पतंग'), T2('boat', 'नाव'),
    T2('shoe', 'जूता'), T2('apple', 'सेब'), T2('clock', 'घड़ी'), T2('bell', 'घंटी'), T2('fish', 'मछली'), T2('flower', 'फूल'), T2('cup', 'कप'),
    T2('door', 'दरवाज़ा'), T2('hat', 'टोपी'), T2('key', 'चाबी'), T2('ball', 'गेंद'), T2('star', 'तारा'), T2('road', 'सड़क'), T2('milk', 'दूध'),
    T2('rice', 'चावल'), T2('pen', 'कलम'), T2('bag', 'बस्ता'), T2('train', 'रेल'), T2('snake', 'साँप'), T2('hill', 'पहाड़'), T2('cloud', 'बादल'),
    T2('sun', 'सूरज'), T2('tiger', 'बाघ'), T2('horse', 'घोड़ा'), T2('window', 'खिड़की'), T2('tooth', 'दाँत'),
  ];
  // Survey: each topic is asked twice, in a plain way (A) and in a leading way (B) that says the opposite thing. A
  // person who answers both the same way ("agree" to both) is being pushed by the wording, not answering the idea.
  const TOPICS = [
    { id: 'homework', a: T2('Homework helps me learn.', 'होमवर्क से मुझे सीखने में मदद मिलती है।'),
      b: T2('Everyone knows homework is a waste of time. How much do you agree?', 'सब जानते हैं कि होमवर्क समय की बर्बादी है। आप कितने सहमत हैं?'),
      lo: T2('homework helps', 'होमवर्क उपयोगी है'), hi: T2('homework is a waste', 'होमवर्क बेकार है') },
    { id: 'sports', a: T2('Playing games at school is good for me.', 'स्कूल में खेलना मेरे लिए अच्छा है।'),
      b: T2('Games at school only steal time from study, don’t you think?', 'स्कूल के खेल सिर्फ़ पढ़ाई का समय खा जाते हैं, है ना?'),
      lo: T2('games are good', 'खेल अच्छे हैं'), hi: T2('games steal time', 'खेल समय खाते हैं') },
    { id: 'day', a: T2('The school day is about the right length.', 'स्कूल का दिन लगभग सही लंबाई का है।'),
      b: T2('Don’t you agree that the school day is far too long?', 'क्या आप नहीं मानते कि स्कूल का दिन बहुत ज़्यादा लंबा है?'),
      lo: T2('the day is right', 'दिन ठीक है'), hi: T2('the day is too long', 'दिन बहुत लंबा है') },
  ];
  const LIKERT = [T2('Strongly disagree', 'पूरी तरह असहमत'), T2('Disagree', 'असहमत'), T2('Not sure', 'पता नहीं'), T2('Agree', 'सहमत'), T2('Strongly agree', 'पूरी तरह सहमत')];

  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pickOne = (a) => a[rint(0, a.length - 1)];
  const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = rint(0, i); const x = r[i]; r[i] = r[j]; r[j] = x; } return r; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const now = () => (window.performance ? window.performance.now() : Date.now());
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));

  // ---------------------------------------------------------------- CSS
  const CSS = `
.md-app{--mp:#7E22CE;--mp2:#8B3DFF;max-width:780px;margin:0 auto;padding:4px 2px 10px;color:var(--ink,#0f172a);font-family:var(--font-body,inherit);outline:none;-webkit-tap-highlight-color:transparent}
.md-app *{box-sizing:border-box}
.md-top{display:flex;gap:12px;align-items:center;margin:0 0 10px}
.md-badge{flex:none;width:52px;height:52px;border-radius:16px;background:linear-gradient(145deg,#8B3DFF,#4400F0);display:grid;place-items:center;box-shadow:0 6px 16px rgba(68,0,240,.28)}
.md-title{margin:0;font:800 1.25rem/1.15 var(--font-display,inherit);color:var(--ink,#0f172a)}
.md-sub{margin:2px 0 0;font-size:.9rem;color:var(--ink-2,#475569)}
.md-prog{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:0 0 10px;min-height:14px}
.md-dot{width:12px;height:12px;border-radius:50%;background:var(--line,#cbd5e1);transition:background .25s,transform .25s}
.md-dot.on{background:var(--mp2)}.md-dot.cur{background:var(--sun,#FFD23F);transform:scale(1.25);box-shadow:0 0 0 3px rgba(255,210,63,.35)}
.md-dot.ok{background:#22C55E}.md-dot.no{background:#FF6B57}
.md-plabel{font-size:.85rem;color:var(--ink-2,#475569);margin-left:6px;font-weight:600}
.md-card{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:22px;padding:16px;box-shadow:0 10px 28px rgba(15,23,42,.08)}
.md-stim{position:relative;display:grid;place-items:center;min-height:190px;padding:14px;border-radius:18px;color:#fff;overflow:hidden;
  background:radial-gradient(120% 140% at 15% 0%,#5B21B6 0%,#2A1070 55%,#150A3C 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 18px rgba(21,10,60,.3)}
.md-stim:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 10%,rgba(2,207,249,.22),transparent 45%);pointer-events:none}
.md-stim>*{position:relative}
.md-big{font:800 5.4rem/1 var(--font-display,inherit);letter-spacing:.02em;text-shadow:0 4px 18px rgba(2,207,249,.5);animation:md-pop .28s ease-out}
.md-word{font:800 3.6rem/1.1 var(--font-display,inherit);text-align:center;animation:md-pop .2s ease-out}
@keyframes md-pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes md-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.md-p{margin:10px 0;font-size:1rem;line-height:1.5}.md-p.s{font-size:.9rem;color:var(--ink-2,#475569)}
.md-h{margin:14px 0 6px;font:700 1.02rem/1.25 var(--font-display,inherit)}
.md-steps{margin:8px 0 12px;padding:0;list-style:none;counter-reset:s;display:grid;gap:8px}
.md-steps li{counter-increment:s;display:flex;gap:10px;align-items:flex-start;font-size:.97rem;line-height:1.4}
.md-steps li:before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;background:var(--mp2);color:#fff;font-weight:800;display:grid;place-items:center;font-size:.85rem}
.md-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}
.md-row.c{justify-content:center}
.md-btn{min-height:48px;min-width:48px;padding:0 20px;border:0;border-radius:15px;font:700 1rem/1 var(--font-body,inherit);cursor:pointer;color:#fff;
  background:linear-gradient(145deg,#8B3DFF,#5B21B6);box-shadow:0 5px 0 #3B1480,0 8px 14px rgba(68,0,240,.25);transition:transform .08s,box-shadow .08s,filter .15s}
.md-btn:hover{filter:brightness(1.07)}.md-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #3B1480}
.md-btn:focus-visible,.md-pad:focus-visible,.md-chip:focus-visible,.md-cell:focus-visible,.md-lamp:focus-visible,.md-opt:focus-visible{outline:3px solid var(--sun,#FFD23F);outline-offset:2px}
.md-btn[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}
.md-btn.alt{background:var(--sunk,#f1f5f9);color:var(--ink,#0f172a);box-shadow:0 4px 0 var(--line,#cbd5e1)}
.md-btn.go{background:linear-gradient(145deg,#22C55E,#0F766E);box-shadow:0 5px 0 #0b4f4a}
.md-opts{display:grid;gap:10px;margin-top:12px}
.md-opts.c2{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.md-opt{min-height:52px;padding:10px 14px;border-radius:15px;border:2px solid var(--line,#cbd5e1);background:var(--surface,#fff);color:var(--ink,#0f172a);font:700 1rem/1.25 var(--font-body,inherit);cursor:pointer;text-align:center;transition:border-color .15s,background .15s,transform .08s}
.md-opt:hover{border-color:var(--mp2);background:var(--sunk,#f8fafc)}.md-opt:active{transform:scale(.98)}
.md-opt.sw{display:flex;gap:10px;align-items:center;justify-content:center}
.md-sw{width:22px;height:22px;border-radius:50%;border:2px solid rgba(15,23,42,.35);flex:none}
.md-opt.right{border-color:#22C55E;background:rgba(34,197,94,.16)}.md-opt.wrong{border-color:#FF6B57;background:rgba(255,107,87,.16)}
.md-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:330px;margin:12px auto 0}
.md-key{min-height:54px;border-radius:14px;border:0;font:800 1.5rem/1 var(--font-display,inherit);cursor:pointer;color:var(--ink,#0f172a);background:var(--sunk,#eef2f7);box-shadow:0 4px 0 var(--line,#cbd5e1)}
.md-key:active{transform:translateY(3px);box-shadow:0 1px 0 var(--line,#cbd5e1)}.md-key.act{background:var(--mp2);color:#fff;box-shadow:0 4px 0 #3B1480}.md-key.del{font-size:1.1rem}
.md-key:focus-visible{outline:3px solid var(--sun,#FFD23F);outline-offset:2px}.md-key[disabled]{opacity:.4}
.md-slots{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:6px 0;outline:none}
.md-slot{width:44px;height:56px;border-radius:12px;border:2px dashed rgba(255,255,255,.5);display:grid;place-items:center;font:800 1.9rem/1 var(--font-display,inherit);color:#fff;background:rgba(255,255,255,.08)}
.md-slot.f{border-style:solid;border-color:#02CFF9;background:rgba(2,207,249,.18)}
.md-slot.ok{border-color:#22C55E;background:rgba(34,197,94,.3)}.md-slot.bad{border-color:#FF6B57;background:rgba(255,107,87,.3)}
.md-cmp{font-size:.85rem;text-align:center;color:#d6c8ff;margin:6px 0 0}
.md-fb{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;margin-top:12px;font-size:.98rem;line-height:1.45;border:1px solid var(--line,#e2e8f0);background:var(--sunk,#f1f5f9)}
.md-fb.ok{background:rgba(34,197,94,.14);border-color:#22C55E}.md-fb.no{background:rgba(255,107,87,.14);border-color:#FF6B57}
.md-fb b{font-family:var(--font-display,inherit)}
.md-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:center}
.md-chip{min-height:46px;padding:0 16px;border-radius:23px;border:2px solid var(--line,#cbd5e1);background:var(--surface,#fff);color:var(--ink,#0f172a);font:700 1rem/1 var(--font-body,inherit);cursor:pointer;transition:all .15s}
.md-chip[aria-pressed=true]{background:var(--mp2);border-color:var(--mp2);color:#fff;transform:translateY(-2px);box-shadow:0 5px 12px rgba(139,61,255,.4)}
.md-pad{display:grid;place-items:center;width:100%;min-height:230px;border:0;border-radius:20px;color:#fff;font:800 2.2rem/1.1 var(--font-display,inherit);cursor:pointer;touch-action:manipulation;transition:background .08s;text-align:center;padding:12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.md-pad small{display:block;font:600 1rem/1.3 var(--font-body,inherit);margin-top:8px;opacity:.9}
.md-pad.w{background:linear-gradient(160deg,#B91C1C,#7F1D1D)}.md-pad.g{background:linear-gradient(160deg,#22C55E,#0F766E)}
.md-pad.e{background:linear-gradient(160deg,#F5B90A,#C2410C)}.md-pad.d{background:linear-gradient(160deg,#2563EB,#4400F0)}.md-pad.r{background:linear-gradient(160deg,#5B21B6,#2A1070)}
.md-lamps{display:flex;gap:14px;justify-content:center;margin:6px 0}
.md-lamp{width:84px;height:84px;border-radius:50%;border:4px solid rgba(255,255,255,.35);background:radial-gradient(circle at 35% 30%,#475569,#1e293b);cursor:pointer;color:#fff;font:800 1.1rem var(--font-display,inherit);transition:all .12s}
.md-lamp.on{background:radial-gradient(circle at 35% 30%,#FFF3B0,#FFD23F 55%,#F5B90A);border-color:#fff;box-shadow:0 0 34px 10px rgba(255,210,63,.75);color:#4a3200;transform:scale(1.07)}
.md-lamp.hit{background:radial-gradient(circle at 35% 30%,#86efac,#22C55E);border-color:#fff;color:#fff}
.md-sum{min-height:96px;text-align:center}.md-sum .q{font:800 2.2rem/1.1 var(--font-display,inherit);margin:4px 0 8px}
.md-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:340px;margin:0 auto}
.md-cell{aspect-ratio:1;min-height:70px;border-radius:16px;border:0;font:800 2rem/1 var(--font-display,inherit);cursor:pointer;color:#fff;background:linear-gradient(145deg,#8B3DFF,#4400F0);box-shadow:0 5px 0 #2a0a9a;transition:all .12s}
.md-cell:active{transform:translateY(3px);box-shadow:0 2px 0 #2a0a9a}.md-cell.done{background:linear-gradient(145deg,#22C55E,#0F766E);box-shadow:none;opacity:.5;transform:scale(.94)}
.md-cell.bad{animation:md-shake .3s}
.md-stat{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 10px}
.md-st{flex:1 1 120px;padding:12px 10px;border-radius:16px;background:var(--sunk,#f1f5f9);border:1px solid var(--line,#e2e8f0);text-align:center}
.md-st b{display:block;font:800 1.7rem/1.1 var(--font-display,inherit);color:var(--mp)}.md-st span{font-size:.82rem;color:var(--ink-2,#475569)}
.md-bar{display:grid;grid-template-columns:minmax(86px,32%) 1fr auto;gap:8px;align-items:center;margin:6px 0;font-size:.9rem}
.md-track{height:18px;border-radius:9px;background:var(--sunk,#e2e8f0);overflow:hidden}.md-track i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#8B3DFF,#02CFF9);transition:width .7s cubic-bezier(.2,.8,.2,1)}
.md-track i.o{background:linear-gradient(90deg,#FF7A1A,#FFD23F)}.md-track i.g{background:linear-gradient(90deg,#14B8A6,#22C55E)}
.md-bar b{font-variant-numeric:tabular-nums;min-width:56px;text-align:right}
.md-cols{display:flex;align-items:flex-end;gap:6px;height:130px;padding:6px 4px 0;border-bottom:2px solid var(--line,#cbd5e1)}
.md-col{flex:1;min-width:14px;max-width:60px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,#02CFF9,#8B3DFF);position:relative}
.md-col span{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.7rem;font-weight:700;white-space:nowrap}
.md-sqs{display:flex;gap:3px;flex-wrap:wrap;margin:4px 0 8px}
.md-sq{width:22px;height:22px;border-radius:6px;background:var(--sunk,#e2e8f0);border:1px solid var(--line,#cbd5e1);font-size:.62rem;display:grid;place-items:center;color:var(--ink-2,#475569)}
.md-sq.h{background:#22C55E;color:#fff;border-color:#16a34a}
.md-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:.85rem;margin:4px 0}.md-leg i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:5px;vertical-align:-1px}
.md-why{margin-top:14px;padding:14px;border-radius:16px;border:1px solid var(--line,#e2e8f0);background:var(--sunk,#f1f5f9)}
.md-why p{margin:4px 0;line-height:1.5}
.md-note{margin:12px 2px 0;font-size:.82rem;color:var(--ink-2,#475569);display:flex;gap:6px}
.md-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.md-fig{width:100%;height:auto;display:block;max-height:300px}
.md-range{width:100%;height:44px;accent-color:#8B3DFF;margin:6px 0}
.md-qn{font:700 1.25rem/1.35 var(--font-display,inherit);margin:6px 0 4px}
.md-tt{margin:8px 0 2px;font-size:.88rem;color:var(--ink-2,#475569)}
.md-timebar{height:10px;border-radius:5px;background:rgba(255,255,255,.2);overflow:hidden;margin-top:10px;width:min(320px,80%)}.md-timebar i{display:block;height:100%;background:#02CFF9;width:0}
@media (max-width:420px){.md-big{font-size:4.4rem}.md-word{font-size:2.8rem}.md-lamp{width:72px;height:72px}.md-title{font-size:1.1rem}.md-card{padding:12px;border-radius:18px}.md-slot{width:38px;height:50px}}
@media (prefers-reduced-motion:reduce){.md-big,.md-word{animation:none}.md-cell.bad{animation:none}.md-track i{transition:none}.md-lamp,.md-chip,.md-btn{transition:none}}
`;

  // ---------------------------------------------------------------- icons (drawn, no images)
  const ICON = {
    'memory-span': '<g fill="#fff" font-family="Baloo 2,sans-serif" font-weight="800" font-size="15"><text x="9" y="22">4</text><text x="21" y="22">7</text><text x="33" y="22">1</text><text x="15" y="39" fill="#02CFF9">?</text><text x="28" y="39" fill="#02CFF9">?</text></g>',
    'serial-position': '<g fill="#fff"><rect x="9" y="10" width="30" height="4" rx="2"/><rect x="9" y="19" width="22" height="4" rx="2" opacity=".6"/><rect x="9" y="28" width="26" height="4" rx="2" opacity=".6"/><rect x="9" y="37" width="30" height="4" rx="2"/></g>',
    stroop: '<g font-family="Baloo 2,sans-serif" font-weight="800" font-size="19"><text x="5" y="24" fill="#3B82F6">RED</text><text x="5" y="42" fill="#FACC15">BLUE</text></g>',
    'reaction-time': '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="27" r="14"/><path d="M24 27V19M24 13V9M19 8h10"/><path d="M24 27l7 4" stroke="#02CFF9"/></g>',
    illusion: '<g stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"><path d="M8 17h32M8 17l6-5M8 17l6 5M40 17l-6-5M40 17l-6 5"/><path d="M8 34h32M8 34l-4-5M8 34l-4 5M40 34l4-5M40 34l4 5" stroke="#02CFF9"/></g>',
    'attention-split': '<g><circle cx="14" cy="17" r="7" fill="#FFD23F"/><circle cx="34" cy="17" r="7" fill="#475569"/><path d="M9 38h8m4 0h6m4 0h6" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>',
    'learning-curve': '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8v32h34" stroke="#fff" stroke-width="3"/><path d="M11 14c6 18 12 20 28 22" stroke="#02CFF9" stroke-width="4"/></g>',
    survey: '<g fill="#fff"><rect x="10" y="7" width="28" height="34" rx="5" opacity=".95"/><g fill="#5B21B6"><rect x="15" y="14" width="18" height="3" rx="1.5"/><rect x="15" y="22" width="18" height="3" rx="1.5"/><rect x="15" y="30" width="11" height="3" rx="1.5"/></g></g>',
  };
  const brain = '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><path d="M24 9c-3-4-10-3-12 2-4 0-7 4-5 8-3 3-2 8 2 9 0 5 6 8 10 5 4 3 10 0 10-5 4-1 5-6 2-9 2-4-1-8-5-8-2-5-9-6-12-2z" fill="#fff" opacity=".95"/><path d="M24 9v30M16 18c3 0 5 2 5 5M32 18c-3 0-5 2-5 5M16 31c3 0 5-2 5-5M32 31c-3 0-5-2-5-5" stroke="#8B3DFF" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- the lab
  function mind(root, cfg, api) {
    const base = baseOf(cfg.experiment);
    const ill = base === 'illusion' ? cfg.experiment.slice(9) : null;
    const N = Number.isInteger(cfg.trials) ? cfg.trials : RANGE[base][2];
    const X = (en, hi) => esc(api.t({ en, hi }));        // escaped text in the chosen language
    const R = (en, hi) => api.t({ en, hi });             // raw text
    const TX = (o) => esc(api.t(o));
    const S = { phase: 'intro', res: null, prog: null, runs: 0 };
    const memo = {};                                      // survives "try again" (serial-position keeps both conditions)
    let alive = true, inst = null;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; };
    const cancel = (id) => { clearTimeout(id); timers.delete(id); };
    const clearAll = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };
    const emit = (e) => { try { api.emit(e); } catch (x) { /* the engine may not listen */ } };

    root.innerHTML = `<div class="md-app" tabindex="-1">
      <div class="md-top"><div class="md-badge">${brain}</div><div><h2 class="md-title"></h2><p class="md-sub"></p></div></div>
      <div class="md-prog" aria-hidden="true"></div>
      <div class="md-card" role="group"><div class="md-stage"></div></div>
      <p class="md-sr" aria-live="polite" role="status"></p>
      <p class="md-note"><span aria-hidden="true">ℹ️</span><span class="md-notet"></span></p></div>`;
    const app = root.querySelector('.md-app'), stage = root.querySelector('.md-stage');
    const live = (s) => { root.querySelector('.md-sr').textContent = s || ''; };

    // ---- the pieces every experiment shares
    const btn = (key, label, cls, extra) => `<button type="button" class="md-btn ${cls || ''}" data-key="${key}" ${extra || ''}>${esc(label)}</button>`;
    const dots = (i, total, marks) => {
      let h = '';
      for (let k = 0; k < total; k++) h += `<span class="md-dot ${marks && marks[k] ? marks[k] : k < i ? 'on' : k === i ? 'cur' : ''}"></span>`;
      return h;
    };
    const ICONSVG = (id) => `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">${ICON[id]}</svg>`;
    const META = {
      'memory-span': { t: T2('Memory span', 'स्मृति-विस्तार'), s: T2('How many digits can you hold in mind?', 'आप एक बार में कितने अंक याद रख पाते हैं?') },
      'serial-position': { t: T2('Serial position effect', 'क्रमिक स्थिति प्रभाव'), s: T2('Which words of a list do you remember best?', 'सूची के कौन-से शब्द सबसे अच्छे याद रहते हैं?') },
      stroop: { t: T2('Stroop effect', 'स्ट्रूप प्रभाव'), s: T2('Name the colour of the ink, not the word.', 'शब्द नहीं, स्याही का रंग बताओ।') },
      'reaction-time': { t: T2('Reaction time', 'प्रतिक्रिया-समय'), s: T2('How fast can you react?', 'आप कितनी जल्दी प्रतिक्रिया देते हैं?') },
      'illusion:muller-lyer': { t: T2('Müller-Lyer illusion', 'म्यूलर-लायर भ्रम'), s: T2('Can you trust your eyes about length?', 'क्या लंबाई के बारे में आँखों पर भरोसा कर सकते हैं?') },
      'illusion:ponzo': { t: T2('Ponzo illusion', 'पोंज़ो भ्रम'), s: T2('Two bars on a railway track.', 'रेल की पटरी पर दो पट्टियाँ।') },
      'illusion:kanizsa': { t: T2('Kanizsa triangle', 'कनिज़्सा त्रिभुज'), s: T2('A triangle that is not there.', 'एक त्रिभुज जो असल में है ही नहीं।') },
      'attention-split': { t: T2('Divided attention', 'विभाजित ध्यान'), s: T2('Is doing two things at once really possible?', 'क्या एक साथ दो काम करना सचमुच संभव है?') },
      'learning-curve': { t: T2('Learning curve', 'अधिगम वक्र'), s: T2('Does practice make you faster?', 'क्या अभ्यास से आप तेज़ होते हैं?') },
      survey: { t: T2('Survey: does wording matter?', 'सर्वेक्षण: क्या शब्द मायने रखते हैं?'), s: T2('Answer questions, then see how they nudged you.', 'सवालों के जवाब दो, फिर देखो शब्दों ने तुम्हें कैसे झुकाया।') },
    };
    const INTRO = {
      'memory-span': {
        what: T2('Psychologists measure short-term memory with a digit span: you see a few digits, then type them back in the same order. George Miller (1956) found that most adults manage about seven, give or take two.',
          'मनोवैज्ञानिक अल्पकालिक स्मृति को अंक-विस्तार से मापते हैं: कुछ अंक देखकर उन्हें उसी क्रम में दोहराना होता है। जॉर्ज मिलर (1956) ने पाया कि अधिकतर वयस्क लगभग सात अंक याद रखते हैं, दो कम या ज़्यादा।'),
        steps: [T2('Press Start. Digits appear one at a time.', 'शुरू दबाओ। अंक एक-एक करके दिखेंगे।'), T2('Watch closely. Do not write anything down.', 'ध्यान से देखो। कुछ लिखना नहीं है।'), T2('Tap the digits in the same order, then press Check.', 'वही अंक उसी क्रम में दबाओ, फिर जाँचो दबाओ।'), T2('Right answers make the next list longer. Wrong ones make it shorter.', 'सही उत्तर पर अगली सूची लंबी होगी, ग़लत पर छोटी।')],
      },
      'serial-position': {
        what: T2('Read a list of words, then try to recall it. People usually remember the first words and the last words best, and forget the middle. This is the serial position effect.',
          'शब्दों की सूची पढ़ो और फिर उसे याद करो। लोग आम तौर पर शुरू और अंत के शब्द सबसे अच्छे याद रखते हैं और बीच के भूल जाते हैं। इसे क्रमिक स्थिति प्रभाव कहते हैं।'),
        steps: [T2('Press Start. Words appear one at a time.', 'शुरू दबाओ। शब्द एक-एक करके दिखेंगे।'), T2('Read each word silently. Do not write.', 'हर शब्द मन में पढ़ो। लिखना नहीं है।'), T2('Tap the words you remember. Careful: some were never shown!', 'जो शब्द याद हैं उन्हें दबाओ। सावधान: कुछ शब्द दिखाए ही नहीं गए थे!'), T2('Then try again with a counting break and compare.', 'फिर गिनती के विराम के साथ दोबारा करो और तुलना करो।')],
      },
      stroop: {
        what: T2('Reading is so automatic that a word can get in the way of naming a colour. J. Ridley Stroop described this in 1935. You will do two rounds: one where the word and its ink agree, one where they do not.',
          'पढ़ना इतना स्वचालित है कि कोई शब्द रंग पहचानने में बाधा बन जाता है। जे. रिडली स्ट्रूप ने 1935 में इसका वर्णन किया। तुम दो दौर करोगे: एक में शब्द और स्याही का रंग मेल खाते हैं, दूसरे में नहीं।'),
        steps: [T2('A colour word appears in coloured ink.', 'एक रंग का शब्द रंगीन स्याही में दिखेगा।'), T2('Tap the button of the INK colour. Ignore what the word says.', 'स्याही के रंग वाला बटन दबाओ। शब्द क्या कहता है, उसे अनदेखा करो।'), T2('Go as fast as you can without mistakes. Keys 1 to 4 also work.', 'बिना ग़लती जितना तेज़ हो सके करो। कुंजी 1 से 4 भी चलती हैं।')],
      },
      'reaction-time': {
        what: T2('Reaction time is the gap between a signal and your response. The signal must travel to your brain, be understood, and tell your muscles to move. Pilots, sprinters and drivers all depend on it.',
          'प्रतिक्रिया-समय संकेत और तुम्हारी प्रतिक्रिया के बीच का अंतर है। संकेत दिमाग़ तक पहुँचता है, समझा जाता है और फिर माँसपेशियों को आदेश मिलता है। पायलट, धावक और चालक सब इस पर निर्भर हैं।'),
        steps: [T2('Press Start. The big pad turns red: wait.', 'शुरू दबाओ। बड़ा पैड लाल होगा: रुको।'), T2('When it turns green, tap it as fast as you can.', 'जब वह हरा हो जाए, जितना तेज़ हो सके उसे दबाओ।'), T2('Tapping too early is a false start. A tap under 100 ms is a guess, not a reaction.', 'जल्दी दबाना ग़लत शुरुआत है। 100 मिली-सेकंड से कम में दबाना अंदाज़ा है, प्रतिक्रिया नहीं।')],
      },
      illusion: {
        what: T2('An illusion is not a trick on your eyes, it is how your brain normally works, pushed into a case where its guess is wrong. You will judge, then check with real measurements.',
          'भ्रम आँखों की चाल नहीं है। यह तुम्हारे दिमाग़ के सामान्य काम करने का वह मामला है जहाँ उसका अनुमान ग़लत हो जाता है। तुम पहले अनुमान लगाओगे, फिर असली माप से जाँचोगे।'),
        steps: [T2('Look at the picture and answer by eye.', 'चित्र देखो और आँख से अनुमान लगाकर उत्तर दो।'), T2('The lab then shows the true measurement.', 'फिर प्रयोगशाला असली माप दिखाएगी।'), T2('At the end, use the slider to make it look right.', 'अंत में स्लाइडर से उसे सही दिखने लायक बनाओ।')],
      },
      'attention-split': {
        what: T2('Attention is limited. Psychologists test it by giving a person one task, then two at once. If the second task makes the first one worse, the person was really switching, not doing both.',
          'ध्यान सीमित होता है। मनोवैज्ञानिक पहले एक काम देते हैं, फिर दो एक साथ। अगर दूसरा काम पहले को बिगाड़ दे, तो व्यक्ति असल में दोनों नहीं कर रहा, बीच में बदल रहा है।'),
        steps: [T2('Round one: tap a lamp the moment it lights up.', 'पहला दौर: दीया जलते ही उसे दबाओ।'), T2('Round two: the same, and also answer a quick sum each time.', 'दूसरा दौर: वही, और हर बार एक छोटा जोड़-घटाव भी हल करो।'), T2('Compare your hits and speed in the two rounds.', 'दोनों दौर में अपने सही प्रहार और गति की तुलना करो।')],
      },
      'learning-curve': {
        what: T2('Practice improves skill quickly at first and then slowly. Plotting time against attempt gives a learning curve. You will tap the numbers 1 to 9 in order, on a new layout each time.',
          'अभ्यास से कौशल पहले तेज़ी से और फिर धीरे-धीरे बढ़ता है। प्रयास के सामने समय का आलेख अधिगम वक्र कहलाता है। तुम हर बार नई जगहों पर रखे 1 से 9 तक के अंक क्रम से दबाओगे।'),
        steps: [T2('Find 1, then 2, then 3, up to 9.', 'पहले 1 ढूँढो, फिर 2, फिर 3, 9 तक।'), T2('The clock starts at your first tap.', 'घड़ी पहले दबाने पर शुरू होती है।'), T2('Repeat. Does your time go down?', 'दोहराओ। क्या तुम्हारा समय घटता है?')],
      },
      survey: {
        what: T2('A survey collects answers to fixed questions. But the exact words of a question can push people toward an answer. You will answer plain questions and leading ones, then compare.',
          'सर्वेक्षण में निश्चित सवालों के जवाब इकट्ठे किए जाते हैं। लेकिन सवाल के सटीक शब्द लोगों को किसी जवाब की ओर धकेल सकते हैं। तुम सीधे और झुकाने वाले सवालों के जवाब दोगे, फिर तुलना करोगे।'),
        steps: [T2('Read each statement and choose how much you agree.', 'हर कथन पढ़ो और चुनो कि कितने सहमत हो।'), T2('There are no right answers. Say what you really think.', 'कोई जवाब सही या ग़लत नहीं है। जो सच में सोचते हो वही बताओ।'), T2('Then see whether the wording changed your answers.', 'फिर देखो कि शब्दों ने तुम्हारे जवाब बदले या नहीं।')],
      },
    };

    function head() {
      const m = META[cfg.experiment];
      root.querySelector('.md-title').textContent = R(m.t.en, m.t.hi);
      root.querySelector('.md-sub').textContent = R(m.s.en, m.s.hi);
      root.querySelector('.md-notet').textContent = R('This is a demonstration of a real experiment, not a test of you. Nothing you do here is saved or sent anywhere.',
        'यह एक असली प्रयोग का प्रदर्शन है, तुम्हारी परीक्षा नहीं। यहाँ जो भी करोगे वह कहीं सहेजा या भेजा नहीं जाता।');
      const pr = root.querySelector('.md-prog');
      if (S.phase === 'run' && S.prog) {
        pr.innerHTML = dots(S.prog.i, S.prog.total, S.prog.marks) + `<span class="md-plabel">${esc(S.prog.label || '')}</span>`;
      } else pr.innerHTML = '';
    }

    function render() {
      if (!alive) return;
      head();
      let h;
      if (S.phase === 'intro') h = introView();
      else if (S.phase === 'result') h = resultView();
      else h = inst.view();
      stage.innerHTML = h;
      if (!app.contains(document.activeElement) || document.activeElement === document.body) { try { app.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      if (inst && inst.after && S.phase === 'run') inst.after();
    }

    function introView() {
      const key = base === 'illusion' ? 'illusion' : base;
      const I = INTRO[key];
      let fig = '';
      if (base === 'illusion') {
        const p = ill === 'muller-lyer' ? { ratio: 1, tailsTop: true } : ill === 'ponzo' ? { ratio: 1 } : { rot: 0, line: false };
        fig = `<div class="md-stim" style="min-height:0;margin-bottom:12px">${drawIllusion(ill, p, false)}</div>`;
      } else {
        fig = `<div class="md-stim" style="min-height:96px;margin-bottom:12px"><div style="transform:scale(2)">${ICONSVG(base)}</div></div>`;
      }
      const left = N;
      const units = { 'memory-span': T2('rounds', 'दौर'), 'serial-position': T2('words', 'शब्द'), stroop: T2('words in each round', 'हर दौर में शब्द'), 'reaction-time': T2('taps', 'बार'),
        illusion: T2('questions plus one slider task', 'सवाल और एक स्लाइडर-कार्य'), 'attention-split': T2('lamps in each round', 'हर दौर में दीये'), 'learning-curve': T2('attempts', 'प्रयास'), survey: T2('topics, two questions each', 'विषय, हर एक पर दो सवाल') }[base];
      return `${fig}<p class="md-p">${TX(I.what)}</p>
        <h3 class="md-h">${X('How it works', 'यह कैसे चलता है')}</h3>
        <ol class="md-steps">${I.steps.map((s) => `<li>${TX(s)}</li>`).join('')}</ol>
        <p class="md-p s">${left} ${TX(units)}</p>
        <div class="md-row">${btn('start', R('Start', 'शुरू करो'), 'go')}</div>`;
    }

    function resultView() {
      const r = S.res;
      return `<h3 class="md-h" style="margin-top:0">${X('Your result', 'तुम्हारा परिणाम')}</h3>${r.body}
        <div class="md-why"><h3 class="md-h" style="margin-top:0">${X('What does it show?', 'यह क्या दिखाता है?')}</h3>${r.why.map((p) => `<p>${TX(p)}</p>`).join('')}
        ${r.think ? `<p><b>${X('Think about it:', 'सोचो:')}</b> ${TX(r.think)}</p>` : ''}</div>
        <div class="md-row">${btn('start', api.t(r.again || T2('Try again', 'फिर से करो')), 'go')}</div>`;
    }

    function finish(res) {
      clearAll();
      S.phase = 'result'; S.res = res; S.prog = null;
      render();
      emit('result');
      try { api.record(res.rec); } catch (e) { /* ignore */ }
      live(res.sr || R('Result ready.', 'परिणाम तैयार है।'));
      try { api.celebrate(); } catch (e) { /* ignore */ }
      stage.scrollIntoView && stage.scrollIntoView({ block: 'nearest', behavior: L.reducedMotion() ? 'auto' : 'smooth' });
    }

    function start() {
      clearAll();
      S.runs++;
      inst = MAKE[base]();
      S.phase = 'run'; S.res = null;
      inst.begin();
    }

    // ---- shared result widgets
    const stat = (v, label) => `<div class="md-st"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
    const bar = (label, val, max, text, cls) => `<div class="md-bar"><span>${esc(label)}</span><div class="md-track"><i class="${cls || ''}" style="width:${pct(val, max).toFixed(1)}%"></i></div><b>${esc(text)}</b></div>`;

    // ================================================================ memory span
    function memorySpan() {
      const st = { round: 0, len: 3, seq: [], shown: -1, stage: 'show', input: [], hist: [], ok: null };
      function startRound() {
        st.seq = [];
        for (let i = 0; i < st.len; i++) { let d; do { d = rint(0, 9); } while (i && d === st.seq[i - 1]); st.seq.push(d); }
        st.stage = 'show'; st.shown = -1; st.input = []; st.ok = null;
        S.prog = { i: st.round, total: N, label: `${R('Round', 'दौर')} ${st.round + 1}/${N}`, marks: st.hist.map((h) => (h.ok ? 'ok' : 'no')) };
        render();
        let k = 0;
        const step = () => {
          if (k < st.len) {
            st.shown = k; render(); live(String(st.seq[k]));
            later(() => { st.shown = -2; render(); k++; later(step, 250); }, 800);
          } else { st.stage = 'recall'; render(); live(R('Now type the digits.', 'अब अंक दबाओ।')); const sl = stage.querySelector('.md-slots'); if (sl) sl.focus({ preventScroll: true }); }
        };
        later(step, 700);
      }
      function check() {
        if (st.stage !== 'recall' || st.input.length !== st.len) return;
        st.ok = st.input.join('') === st.seq.join('');
        st.hist.push({ len: st.len, ok: st.ok });
        st.stage = 'fb';
        S.prog.marks = st.hist.map((h) => (h.ok ? 'ok' : 'no'));
        render();
        emit(st.ok ? 'answered:right' : 'answered:wrong');
        emit('trial');
        live(st.ok ? R('Correct!', 'सही!') : R('Not this time.', 'इस बार नहीं।'));
      }
      function next() {
        if (st.stage !== 'fb') return;
        st.round++;
        if (st.round >= N) { done(); return; }
        st.len = st.ok ? Math.min(12, st.len + 1) : Math.max(3, st.len - 1);
        startRound();
      }
      function done() {
        const okLens = st.hist.filter((h) => h.ok).map((h) => h.len);
        const span = okLens.length ? Math.max.apply(null, okLens) : 0;
        const body = `<div class="md-stat">${stat(span ? String(span) : '< 3', R('your digit span', 'तुम्हारा अंक-विस्तार'))}${stat(`${st.hist.filter((h) => h.ok).length}/${st.hist.length}`, R('rounds correct', 'सही दौर'))}</div>
          ${st.hist.map((h, i) => bar(`${R('Round', 'दौर')} ${i + 1}`, h.len, 12, `${h.len} ${h.ok ? '✓' : '✗'}`, h.ok ? 'g' : 'o')).join('')}`;
        finish({ body, rec: `Memory span: longest correct list ${span || 'under 3'} digits in ${st.hist.length} rounds.`,
          sr: R(`Your digit span is ${span || 'under 3'}.`, `तुम्हारा अंक-विस्तार ${span || '3 से कम'} है।`),
          why: [T2('Short-term memory holds only a few items at once. Most adults manage around 5 to 9 digits; the span grows as children get older, and it changes with tiredness and worry.', 'अल्पकालिक स्मृति एक बार में कुछ ही चीज़ें रख पाती है। अधिकतर वयस्क 5 से 9 अंक याद रखते हैं; बच्चों में उम्र के साथ यह बढ़ती है, और थकान या चिंता से बदलती है।'),
            T2('One short session is a rough guide. Scientists repeat the test many times with many people before they trust a number.', 'एक छोटा सत्र मोटा अंदाज़ा देता है। वैज्ञानिक किसी संख्या पर भरोसा करने से पहले यह परीक्षण कई लोगों के साथ कई बार दोहराते हैं।')],
          think: T2('Try grouping digits into chunks, like 98 76 54. Does it help?', 'अंकों को टुकड़ों में बाँटकर देखो, जैसे 98 76 54। क्या इससे मदद मिलती है?') });
      }
      return {
        begin: startRound,
        view() {
          if (st.stage === 'show') return `<div class="md-stim"><div class="md-big">${st.shown >= 0 ? st.seq[st.shown] : '·'}</div></div><p class="md-p s" style="text-align:center">${X('Watch closely and remember the order.', 'ध्यान से देखो और क्रम याद रखो।')}</p>`;
          if (st.stage === 'recall') {
            const slots = st.seq.map((_, i) => `<div class="md-slot ${i < st.input.length ? 'f' : ''}">${i < st.input.length ? st.input[i] : ''}</div>`).join('');
            const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" class="md-key" data-key="respond" data-d="${d}" aria-label="${d}">${d}</button>`).join('')
              + `<button type="button" class="md-key del" data-key="respond" data-d="del" aria-label="${X('Delete last digit', 'आख़िरी अंक मिटाओ')}">⌫</button>`
              + `<button type="button" class="md-key" data-key="respond" data-d="0" aria-label="0">0</button>`
              + `<button type="button" class="md-key act" data-key="answer" ${st.input.length === st.len ? '' : 'disabled'} aria-label="${X('Check', 'जाँचो')}">✓</button>`;
            return `<div class="md-stim" style="min-height:120px"><div class="md-slots" tabindex="-1" role="group" aria-label="${X('Your digits', 'तुम्हारे अंक')}">${slots}</div></div><div class="md-keys">${keys}</div>
              <p class="md-tt" style="text-align:center">${X('You can also use the keyboard: digits, Backspace, Enter.', 'कीबोर्ड भी चलता है: अंक, Backspace, Enter।')}</p>`;
          }
          const slots = st.seq.map((d, i) => `<div class="md-slot ${st.input[i] === d ? 'ok' : 'bad'}">${st.input[i]}</div>`).join('');
          return `<div class="md-stim" style="min-height:120px"><div class="md-slots">${slots}</div><div class="md-cmp">${X('Shown:', 'दिखाया गया:')} ${st.seq.join(' ')}</div></div>
            <div class="md-fb ${st.ok ? 'ok' : 'no'}"><b>${st.ok ? X('Correct!', 'सही!') : X('Not this time.', 'इस बार नहीं।')}</b><span>${st.ok ? X(`Next list: ${Math.min(12, st.len + 1)} digits.`, `अगली सूची: ${Math.min(12, st.len + 1)} अंक।`) : X(`Next list: ${Math.max(3, st.len - 1)} digits.`, `अगली सूची: ${Math.max(3, st.len - 1)} अंक।`)}</span></div>
            <div class="md-row">${btn('next', st.round + 1 >= N ? R('See result', 'परिणाम देखो') : R('Next round', 'अगला दौर'))}</div>`;
        },
        act(key, el) {
          if (key === 'respond' && st.stage === 'recall') {
            const d = el.dataset.d;
            if (d === 'del') st.input.pop(); else if (st.input.length < st.len) st.input.push(+d);
            render();
          } else if (key === 'answer') check(); else if (key === 'next') next();
        },
        keydown(e) {
          if (st.stage === 'recall') {
            if (/^[0-9]$/.test(e.key)) { if (api.allowed('respond')) { if (st.input.length < st.len) { st.input.push(+e.key); render(); } } else api.nudge('respond'); e.preventDefault(); }
            else if (e.key === 'Backspace') { if (api.allowed('respond')) { st.input.pop(); render(); } e.preventDefault(); }
            else if (e.key === 'Enter' && e.target === app || e.key === 'Enter' && e.target.classList.contains('md-slots')) { if (api.allowed('answer')) check(); else api.nudge('answer'); e.preventDefault(); }
          }
        },
      };
    }

    // ================================================================ serial position
    function serialPosition() {
      const cond = memo.nextCond || 'immediate';
      const used = new Set((memo.lastWords || []).map((w) => w.i));
      const idx = WORDS.map((_, i) => i);
      const fresh = shuffle(idx.filter((i) => !used.has(i))), old = shuffle(idx.filter((i) => used.has(i)));
      const pool = fresh.concat(old);
      const list = pool.slice(0, N).map((i) => ({ i, w: WORDS[i] }));
      const dist = pool.slice(N, N * 2).map((i) => ({ i, w: WORDS[i] }));
      const st = { stage: 'study', k: -1, sel: new Set(), opts: shuffle(list.concat(dist)), clock: 0 };
      function study() {
        S.prog = { i: 0, total: N, label: R('Read the words', 'शब्द पढ़ो') };
        render();
        let k = 0;
        const step = () => {
          if (k < N) {
            st.k = k; S.prog.i = k; render(); live(R(list[k].w.en, list[k].w.hi));
            later(() => { st.k = -2; render(); k++; later(step, 200); }, 1000);
          } else {
            emit('trial');
            if (cond === 'delayed') distract(); else recall();
          }
        };
        later(step, 700);
      }
      function distract() {
        st.stage = 'distract'; S.prog = null; render(); live(R('Count backwards in your head.', 'मन में उलटी गिनती करो।'));
        const bar = stage.querySelector('.md-timebar i');
        if (bar) { bar.style.transition = L.reducedMotion() ? 'none' : 'width 9s linear'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; })); }
        later(recall, 9000);
      }
      function recall() { st.stage = 'recall'; S.prog = null; render(); live(R('Tap the words you remember.', 'जो शब्द याद हैं उन्हें दबाओ।')); }
      function check() {
        if (st.stage !== 'recall' || !st.sel.size) return;
        const hits = list.map((x) => st.sel.has(x.i));
        const fa = [...st.sel].filter((i) => !list.some((x) => x.i === i)).length;
        memo.runs = memo.runs || {};
        memo.runs[cond] = { hits, fa };
        memo.lastWords = list;
        memo.nextCond = cond === 'immediate' ? 'delayed' : 'immediate';
        emit(fa === 0 ? 'answered:right' : 'answered:wrong');
        done(hits, fa);
      }
      const regions = (hits) => {
        const n = hits.length, a = hits.slice(0, 3), c = hits.slice(n - 3), m = hits.slice(3, n - 3);
        const f = (x) => (x.length ? (x.filter(Boolean).length / x.length) * 100 : 0);
        return { first: f(a), mid: f(m), last: f(c) };
      };
      function done(hits, fa) {
        const runs = memo.runs, rg = {};
        Object.keys(runs).forEach((c) => { rg[c] = regions(runs[c].hits); });
        const nm = { immediate: T2('Straight away', 'तुरंत'), delayed: T2('After counting', 'गिनती के बाद') };
        const one = (c) => {
          const r = runs[c];
          return `<h3 class="md-h">${TX(nm[c])}: ${r.hits.filter(Boolean).length}/${r.hits.length} ${X('recalled', 'याद रहे')}${r.fa ? `, ${r.fa} ${X('not on the list', 'सूची में नहीं थे')}` : ''}</h3>
            <div class="md-sqs" aria-hidden="true">${r.hits.map((h, i) => `<span class="md-sq ${h ? 'h' : ''}">${i + 1}</span>`).join('')}</div>
            ${bar(R('First 3 words', 'पहले 3 शब्द'), rg[c].first, 100, Math.round(rg[c].first) + '%')}${bar(R('Middle words', 'बीच के शब्द'), rg[c].mid, 100, Math.round(rg[c].mid) + '%', 'o')}${bar(R('Last 3 words', 'आख़िरी 3 शब्द'), rg[c].last, 100, Math.round(rg[c].last) + '%', 'g')}`;
        };
        let body = one(cond);
        const other = cond === 'immediate' ? 'delayed' : 'immediate';
        if (runs[other]) body += one(other);
        const why = [T2('The first words get extra rehearsal and move into long-term memory (the primacy effect). The last words are still sitting in short-term memory (the recency effect). The middle words get neither help.', 'पहले शब्दों को ज़्यादा दोहराया जाता है और वे दीर्घकालिक स्मृति में चले जाते हैं (प्राथमिकता प्रभाव)। आख़िरी शब्द अभी अल्पकालिक स्मृति में ही रहते हैं (नवीनता प्रभाव)। बीच के शब्दों को कोई मदद नहीं मिलती।')];
        if (runs.immediate && runs.delayed) {
          const dl = Math.round(rg.immediate.last - rg.delayed.last);
          why.push(dl > 0 ? T2(`With the counting break the last words dropped by ${dl} percentage points: the break pushed them out of short-term memory.`, `गिनती के विराम के बाद आख़िरी शब्द ${dl} प्रतिशत अंक घट गए: विराम ने उन्हें अल्पकालिक स्मृति से बाहर कर दिया।`)
            : T2('This time the last words did not drop after the break. One person and one list are noisy; scientists average many people.', 'इस बार विराम के बाद आख़िरी शब्द नहीं घटे। एक व्यक्ति और एक सूची में उतार-चढ़ाव होता है; वैज्ञानिक कई लोगों का औसत लेते हैं।'));
        } else {
          why.push(T2('Do it again: the next time there is a short counting break before you recall. The last words should be harder to recall.', 'फिर से करो: अगली बार याद करने से पहले गिनती का छोटा विराम होगा। तब आख़िरी शब्द याद करना कठिन होना चाहिए।'));
        }
        finish({ body, why, again: runs.immediate && runs.delayed ? T2('Try again', 'फिर से करो') : T2('Try with a counting break', 'गिनती के विराम के साथ करो'),
          rec: `Serial position (${cond}): recalled ${hits.filter(Boolean).length} of ${hits.length}; first3 ${Math.round(rg[cond].first)}%, middle ${Math.round(rg[cond].mid)}%, last3 ${Math.round(rg[cond].last)}%; ${fa} false.`,
          think: T2('Why do advertisers put the brand name at the start and at the end of an advert?', 'विज्ञापन बनाने वाले ब्रांड का नाम शुरू और अंत में क्यों रखते हैं?'),
          sr: R(`You recalled ${hits.filter(Boolean).length} of ${hits.length} words.`, `तुम्हें ${hits.length} में से ${hits.filter(Boolean).length} शब्द याद रहे।`) });
      }
      return {
        begin: study,
        view() {
          if (st.stage === 'study') return `<div class="md-stim"><div class="md-word">${st.k >= 0 ? TX(list[st.k].w) : '·'}</div></div><p class="md-p s" style="text-align:center">${X('Read each word silently. Remember as many as you can.', 'हर शब्द मन में पढ़ो। जितने हो सकें याद रखो।')}</p>`;
          if (st.stage === 'distract') return `<div class="md-stim"><div style="text-align:center"><div class="md-word" style="font-size:2.2rem">${X('Count backwards in your head', 'मन में उलटी गिनती करो')}</div><p style="font-size:1.4rem;font-weight:800;margin:10px 0 0">40, 37, 34, 31 …</p><div class="md-timebar"><i></i></div></div></div>`;
          return `<p class="md-p">${X(`Tap every word you remember from the list (${N} words were shown).`, `सूची के जो शब्द याद हैं उन सब को दबाओ (${N} शब्द दिखाए गए थे)।`)}</p>
            <div class="md-chips" role="group" aria-label="${X('Words', 'शब्द')}">${st.opts.map((o) => `<button type="button" class="md-chip" data-key="respond" data-w="${o.i}" aria-pressed="${st.sel.has(o.i)}">${TX(o.w)}</button>`).join('')}</div>
            <p class="md-tt" style="text-align:center">${X('Selected:', 'चुने गए:')} ${st.sel.size}</p>
            <div class="md-row c">${btn('answer', R('Check', 'जाँचो'), 'go', st.sel.size ? '' : 'disabled')}</div>`;
        },
        act(key, el) {
          if (key === 'respond' && st.stage === 'recall') {
            const i = +el.dataset.w;
            if (st.sel.has(i)) st.sel.delete(i); else st.sel.add(i);
            el.setAttribute('aria-pressed', String(st.sel.has(i)));
            const ans = stage.querySelector('[data-key="answer"]'); if (ans) ans.disabled = !st.sel.size;
            const tt = stage.querySelector('.md-tt'); if (tt) tt.textContent = `${R('Selected:', 'चुने गए:')} ${st.sel.size}`;
          } else if (key === 'answer') check();
        },
      };
    }

    // ================================================================ stroop
    function stroop() {
      const order = shuffle(['same', 'diff']);
      const st = { b: 0, i: 0, stage: 'fix', ink: null, word: null, t0: 0, data: { same: [], diff: [] }, ok: null, last: null };
      const cur = () => order[st.b];
      function trial() {
        let ink; do { ink = pickOne(COLS); } while (st.last && ink.id === st.last);
        st.last = ink.id;
        let word = ink;
        if (cur() === 'diff') { do { word = pickOne(COLS); } while (word.id === ink.id); }
        st.ink = ink; st.word = word; st.stage = 'fix';
        S.prog = { i: st.i, total: N, label: `${R('Round', 'दौर')} ${st.b + 1}/2 · ${st.i + 1}/${N}` };
        render();
        later(() => { st.stage = 'word'; render(); st.t0 = now(); }, 500);
      }
      function respond(id) {
        if (st.stage !== 'word') return;
        const rt = now() - st.t0, ok = id === st.ink.id;
        st.data[cur()].push({ rt, ok });
        st.ok = ok; st.stage = 'fb'; render();
        emit(ok ? 'answered:right' : 'answered:wrong'); emit('trial');
        st.i++;
        later(() => {
          if (st.i < N) trial();
          else if (st.b === 0) { st.stage = 'between'; S.prog = { i: N, total: N, label: R('Round 1 done', 'पहला दौर पूरा') }; render(); live(R('Round one done.', 'पहला दौर पूरा हुआ।')); }
          else done();
        }, 380);
      }
      function done() {
        const f = (k) => { const d = st.data[k], good = d.filter((x) => x.ok).map((x) => x.rt); return { rt: good.length ? mean(good) : 0, err: d.filter((x) => !x.ok).length, n: d.length }; };
        const a = f('same'), b = f('diff'), diff = b.rt - a.rt, mx = Math.max(a.rt, b.rt, 1) * 1.15;
        const body = `<div class="md-stat">${stat(Math.round(a.rt) + ' ms', R('word and ink agree', 'शब्द और रंग मेल खाते हैं'))}${stat(Math.round(b.rt) + ' ms', R('word and ink disagree', 'शब्द और रंग मेल नहीं खाते'))}${stat((diff >= 0 ? '+' : '') + Math.round(diff) + ' ms', R('the Stroop effect', 'स्ट्रूप प्रभाव'))}</div>
          ${bar(R('Agree', 'मेल खाते'), a.rt, mx, Math.round(a.rt) + ' ms')}${bar(R('Disagree', 'मेल नहीं'), b.rt, mx, Math.round(b.rt) + ' ms', 'o')}
          <p class="md-p s">${X(`Mistakes: ${a.err} when they agreed, ${b.err} when they disagreed. Only correct answers are used for the times.`, `ग़लतियाँ: मेल खाने पर ${a.err}, मेल न खाने पर ${b.err}। समय केवल सही उत्तरों से निकाला गया है।`)}</p>`;
        finish({ body, rec: `Stroop: agree ${Math.round(a.rt)} ms (${a.err} errors), disagree ${Math.round(b.rt)} ms (${b.err} errors), effect ${Math.round(diff)} ms.`,
          sr: R(`The Stroop effect was ${Math.round(diff)} milliseconds.`, `स्ट्रूप प्रभाव ${Math.round(diff)} मिली-सेकंड रहा।`),
          why: [diff > 0 ? T2('Reading a word is automatic: you cannot easily switch it off. When the word names a different colour, two answers fight in your brain and you need extra time to pick the right one.', 'शब्द पढ़ना स्वचालित है: उसे आसानी से बंद नहीं किया जा सकता। जब शब्द किसी और रंग का नाम बताता है, तो दिमाग़ में दो उत्तर टकराते हैं और सही चुनने में ज़्यादा समय लगता है।')
            : T2('This time you were not slower when the word disagreed. That can happen with a short run or a lucky streak. Most people are slower, so try again with more words.', 'इस बार शब्द के मेल न खाने पर तुम धीमे नहीं हुए। छोटे दौर या भाग्य से ऐसा हो सकता है। अधिकतर लोग धीमे पड़ते हैं, इसलिए ज़्यादा शब्दों के साथ फिर करो।'),
            T2('Which round came first was chosen at random, so that practice does not unfairly help one round.', 'कौन-सा दौर पहले आया, यह संयोग से चुना गया, ताकि अभ्यास का फ़ायदा किसी एक दौर को अनुचित रूप से न मिले।')],
          think: T2('Is it easier to name the colour of a patch or the colour of a word that says something else?', 'रंग के धब्बे का नाम बताना आसान है या किसी दूसरे रंग का नाम लिखे शब्द का रंग बताना?') });
      }
      return {
        begin: trial,
        view() {
          if (st.stage === 'between') return `<div class="md-stim"><div style="text-align:center"><div class="md-word" style="font-size:2rem">${X('Round 1 done. Now round 2.', 'पहला दौर पूरा। अब दूसरा दौर।')}</div><p style="max-width:34ch">${cur() === 'same' ? X('This time the word may name a DIFFERENT colour from its ink. Tap the ink colour.', 'इस बार शब्द स्याही से अलग रंग का नाम बता सकता है। स्याही का रंग दबाओ।') : X('This time the word and its ink always agree.', 'इस बार शब्द और उसकी स्याही हमेशा मेल खाएँगे।')}</p></div></div><div class="md-row c">${btn('next', R('Go', 'चलो'), 'go')}</div>`;
          let inner;
          if (st.stage === 'fix') inner = '<div class="md-word" style="opacity:.5">+</div>';
          else if (st.stage === 'fb') inner = `<div class="md-word" style="color:${st.ok ? '#86efac' : '#fca5a5'}">${st.ok ? '✓' : '✗'}</div>`;
          else inner = `<div class="md-word" style="color:${st.ink.hex}">${TX(st.word.n)}</div>`;
          const bs = COLS.map((c, i) => `<button type="button" class="md-opt sw" data-key="respond" data-c="${c.id}"><span class="md-sw" style="background:${c.hex}"></span>${TX(c.n)} <small aria-hidden="true">(${i + 1})</small></button>`).join('');
          return `<div class="md-stim" style="min-height:170px" aria-hidden="${st.stage === 'word' ? 'false' : 'true'}">${inner}</div><p class="md-p s" style="text-align:center;margin:8px 0 0">${X('Tap the colour of the INK.', 'स्याही का रंग दबाओ।')}</p><div class="md-opts c2" style="grid-template-columns:repeat(2,1fr)">${bs}</div>`;
        },
        act(key, el) { if (key === 'respond') respond(el.dataset.c); else if (key === 'next' && st.stage === 'between') { st.b = 1; st.i = 0; st.last = null; trial(); } },
        keydown(e) { const i = '1234'.indexOf(e.key); if (i >= 0 && e.key.length === 1 && st.stage === 'word') { if (api.allowed('respond')) respond(COLS[i].id); else api.nudge('respond'); e.preventDefault(); } },
      };
    }

    // ================================================================ reaction time
    function reactionTime() {
      const st = { stage: 'ready', times: [], early: 0, guess: false, t0: 0, tm: 0, rt: 0 };
      function arm() {
        st.stage = 'wait'; st.guess = false;
        S.prog = { i: st.times.length, total: N, label: `${R('Tap', 'बार')} ${st.times.length + 1}/${N}` };
        render(); live(R('Wait for green.', 'हरे होने का इंतज़ार करो।'));
        st.tm = later(() => { st.stage = 'go'; render(); st.t0 = now(); }, rint(1500, 4500));
      }
      function tap() {
        const t = now();
        if (st.stage === 'wait') { cancel(st.tm); st.early++; st.stage = 'early'; render(); live(R('Too soon! Wait for green.', 'बहुत जल्दी! हरे का इंतज़ार करो।')); }
        else if (st.stage === 'go') {
          const rt = t - st.t0; st.rt = rt;
          if (rt < 100) { st.early++; st.guess = true; st.stage = 'early'; render(); live(R('That was a guess, under 100 milliseconds.', 'यह अंदाज़ा था, 100 मिली-सेकंड से कम।')); }
          else { st.times.push(rt); st.stage = 'done'; S.prog.i = st.times.length; render(); emit('trial'); live(`${Math.round(rt)} ms`); }
        }
      }
      function done() {
        const ts = st.times, m = mean(ts), md = median(ts), best = Math.min.apply(null, ts), mx = Math.max.apply(null, ts) * 1.2;
        const body = `<div class="md-stat">${stat(Math.round(m) + ' ms', R('average', 'औसत'))}${stat(Math.round(md) + ' ms', R('median', 'माध्यिका'))}${stat(Math.round(best) + ' ms', R('fastest', 'सबसे तेज़'))}${stat(String(st.early), R('false starts', 'ग़लत शुरुआतें'))}</div>
          <div class="md-cols" role="img" aria-label="${X('Your reaction times', 'तुम्हारे प्रतिक्रिया-समय')}">${ts.map((v) => `<div class="md-col" style="height:${pct(v, mx).toFixed(0)}%"><span>${Math.round(v)}</span></div>`).join('')}</div>
          <p class="md-tt">${X('Each column is one tap, in milliseconds (1000 ms = 1 second).', 'हर स्तंभ एक बार दबाना है, मिली-सेकंड में (1000 मिली-सेकंड = 1 सेकंड)।')}</p>`;
        finish({ body, rec: `Reaction time: mean ${Math.round(m)} ms, median ${Math.round(md)} ms, best ${Math.round(best)} ms over ${ts.length} taps, ${st.early} false starts.`,
          sr: R(`Your average reaction time was ${Math.round(m)} milliseconds.`, `तुम्हारा औसत प्रतिक्रिया-समय ${Math.round(m)} मिली-सेकंड रहा।`),
          why: [T2('A simple visual reaction usually takes about 200 to 300 milliseconds on a screen. Part of it is the nerve signal and the brain’s decision; part is the screen and device delay.', 'पर्दे पर सरल दृश्य प्रतिक्रिया में आम तौर पर लगभग 200 से 300 मिली-सेकंड लगते हैं। इसका कुछ भाग तंत्रिका-संकेत और दिमाग़ का निर्णय है; कुछ भाग पर्दे और उपकरण की देरी है।'),
            T2('In sprint races a start under 100 ms is called a false start, because no human can react that fast. It must be a guess. The same rule was used here.', 'दौड़ में 100 मिली-सेकंड से कम की शुरुआत ग़लत शुरुआत मानी जाती है, क्योंकि कोई इंसान इतनी तेज़ प्रतिक्रिया नहीं दे सकता। वह अंदाज़ा ही होगा। यहाँ भी यही नियम लगाया गया।')],
          think: T2('Why should a driver keep a gap from the vehicle in front? Use your own time to work it out.', 'चालक को आगे वाले वाहन से दूरी क्यों रखनी चाहिए? अपने समय का उपयोग करके सोचो।') });
      }
      return {
        begin: arm,
        view() {
          const label = { wait: R('Wait…', 'रुको…'), go: R('TAP!', 'दबाओ!'), done: `${Math.round(st.times[st.times.length - 1])} ms`, early: st.guess ? R('A guess!', 'अंदाज़ा!') : R('Too soon!', 'बहुत जल्दी!') }[st.stage];
          const sub = { wait: R('Wait for the pad to turn green', 'पैड के हरे होने का इंतज़ार करो'), go: '', done: R('Nice. That is one reaction.', 'बढ़िया। यह एक प्रतिक्रिया रही।'), early: st.guess ? R('Under 100 ms is not a reaction. Wait for green.', '100 मिली-सेकंड से कम प्रतिक्रिया नहीं है। हरे का इंतज़ार करो।') : R('You tapped before green. Try this one again.', 'हरा होने से पहले दबा दिया। इसे फिर करो।') }[st.stage];
          const cls = { wait: 'w', go: 'g', done: 'd', early: 'e' }[st.stage];
          const nextBtn = st.stage === 'done' || st.stage === 'early' ? `<div class="md-row c">${btn('next', st.stage === 'early' ? R('Try this one again', 'इसे फिर करो') : st.times.length >= N ? R('See result', 'परिणाम देखो') : R('Next tap', 'अगला'), 'go')}</div>` : '';
          return `<button type="button" class="md-pad ${cls}" data-key="respond" ${st.stage === 'wait' || st.stage === 'go' ? '' : 'tabindex="-1"'} aria-label="${esc(label)}"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>${nextBtn}`;
        },
        act(key) {
          if (key === 'respond') tap();
          else if (key === 'next') { if (st.stage === 'early') arm(); else if (st.stage === 'done') { if (st.times.length >= N) done(); else arm(); } }
        },
        fast: true,
      };
    }

    // ================================================================ illusions
    function drawIllusion(kind, p, reveal) {
      const W = 360, H = 240, bg = kind === 'kanizsa' ? '#F1F5F9' : 'none';
      let g = '';
      if (kind === 'muller-lyer') {
        const A = 150, f = 34, th = 0.61, dx = f * Math.cos(th), dy = f * Math.sin(th);
        const line = (y, len, tails, col) => {
          const xl = 180 - len / 2, xr = 180 + len / 2, s = tails ? 1 : -1;
          return `<g stroke="${col}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M${xl} ${y}H${xr}"/>
            <path d="M${xl} ${y}l${-s * dx} ${-dy}M${xl} ${y}l${-s * dx} ${dy}M${xr} ${y}l${s * dx} ${-dy}M${xr} ${y}l${s * dx} ${dy}"/></g>`;
        };
        const tlen = A * p.ratio, ty = p.tailsTop ? 72 : 168, ay = p.tailsTop ? 168 : 72;
        g += line(ty, tlen, true, '#FFD23F') + line(ay, A, false, '#02CFF9');
        if (reveal) {
          const g1 = (x) => `<path d="M${x} 36V204" stroke="#fff" stroke-width="1.6" stroke-dasharray="5 4" opacity=".9"/>`;
          g += g1(180 - tlen / 2) + g1(180 + tlen / 2) + g1(180 - A / 2) + g1(180 + A / 2);
          g += `<g font-family="Baloo 2,sans-serif" font-weight="700" font-size="15" fill="#fff" text-anchor="middle"><text x="180" y="${ty - 20}">${Math.round(p.ratio * 100)}</text><text x="180" y="${ay - 20}">100</text></g>`;
        }
      } else if (kind === 'ponzo') {
        const xl = (y) => 60 + 105 * (230 - y) / 215, xr = (y) => 300 - 105 * (230 - y) / 215;
        g += `<path d="M60 230L165 15M300 230L195 15" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" fill="none"/>`;
        for (const y of [215, 190, 160, 125, 85, 40]) g += `<path d="M${xl(y)} ${y}H${xr(y)}" stroke="#FFD23F" stroke-width="2" opacity=".35"/>`;
        const B = 60, up = B * p.ratio;
        g += `<path d="M${180 - up / 2} 70H${180 + up / 2}" stroke="#FF6B57" stroke-width="10" stroke-linecap="round"/><path d="M${180 - B / 2} 175H${180 + B / 2}" stroke="#02CFF9" stroke-width="10" stroke-linecap="round"/>`;
        if (reveal) {
          const g1 = (x) => `<path d="M${x} 52V192" stroke="#fff" stroke-width="1.6" stroke-dasharray="5 4"/>`;
          g += g1(180 - up / 2) + g1(180 + up / 2) + g1(180 - B / 2) + g1(180 + B / 2);
        }
      } else {
        const V = [[180, 58], [100, 196], [260, 196]], cx = 180, cy = (58 + 196 + 196) / 3, r = 40, half = Math.PI / 6, rot = ((p.rot || 0) * Math.PI) / 180;
        if (p.line) g += `<path d="M${V[0][0]} ${V[0][1]}L${V[1][0]} ${V[1][1]}L${V[2][0]} ${V[2][1]}Z" fill="none" stroke="#0B1020" stroke-width="2" opacity=".7"/>`;
        V.forEach((v) => {
          const phi = Math.atan2(cy - v[1], cx - v[0]) + rot;
          const a1 = phi + half, a2 = phi - half;
          const x1 = v[0] + r * Math.cos(a1), y1 = v[1] + r * Math.sin(a1), x2 = v[0] + r * Math.cos(a2), y2 = v[1] + r * Math.sin(a2);
          g += `<path d="M${v[0]} ${v[1]}L${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 1 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="#0B1020"/>`;
          if (reveal) g += `<circle cx="${v[0]}" cy="${v[1]}" r="${r}" fill="none" stroke="#8B3DFF" stroke-width="2" stroke-dasharray="4 4"/>`;
        });
        if (reveal && !p.line) g += `<path d="M${V[0][0]} ${V[0][1]}L${V[1][0]} ${V[1][1]}L${V[2][0]} ${V[2][1]}Z" fill="none" stroke="#8B3DFF" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`;
      }
      const label = { 'muller-lyer': T2('Two lines with fins', 'पंखों वाली दो रेखाएँ'), ponzo: T2('Two bars between railway lines', 'पटरियों के बीच दो पट्टियाँ'), kanizsa: T2('Three black shapes with wedges cut out', 'तीन काली आकृतियाँ जिनमें कटे हुए फलक हैं') }[kind];
      return `<svg class="md-fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="${TX(label)}">${bg === 'none' ? '' : `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${bg}"/>`}${g}</svg>`;
    }

    function illusion() {
      const kind = ill;
      const POOL = [1, 1, 0.9, 1.1, 0.85, 1.15];
      const st = { r: 0, stage: 'ask', p: null, pick: null, ok: null, hist: [], set: 0, match: null };
      function params() {
        if (kind === 'kanizsa') {
          const t = pickOne(['aligned', 'aligned-line', 'rotated']);
          return { rot: t === 'rotated' ? rint(30, 45) : 0, line: t === 'aligned-line', truth: t === 'aligned-line' ? 'yes' : 'no' };
        }
        const ratio = pickOne(POOL);
        const truth = ratio === 1 ? 'equal' : null;
        return { ratio, tailsTop: Math.random() < 0.5, truth };
      }
      // which line is truly longer: for M-L the tails line is `ratio` of the arrow line; for Ponzo the upper bar is `ratio` of the lower
      function truthOf(p) {
        if (kind === 'kanizsa') return p.truth;
        if (p.ratio === 1) return 'equal';
        const tailsLonger = p.ratio > 1;
        if (kind === 'ponzo') return tailsLonger ? 'top' : 'bottom';
        return p.tailsTop === tailsLonger ? 'top' : 'bottom';
      }
      function newRound() {
        st.p = params(); st.stage = 'ask'; st.pick = null; st.ok = null;
        S.prog = { i: st.r, total: N + 1, label: `${R('Question', 'सवाल')} ${st.r + 1}/${N}`, marks: st.hist.map((h) => (h.ok ? 'ok' : 'no')) };
        render();
      }
      function answer(v) {
        if (st.stage !== 'ask') return;
        const truth = truthOf(st.p);
        st.pick = v; st.ok = v === truth; st.stage = 'rev';
        st.hist.push({ ok: st.ok });
        S.prog.marks = st.hist.map((h) => (h.ok ? 'ok' : 'no'));
        render();
        emit(st.ok ? 'answered:right' : 'answered:wrong'); emit('trial');
        live(st.ok ? R('Right.', 'सही।') : R('Fooled! Everyone is.', 'धोखा खा गए! सब खाते हैं।'));
      }
      function startMatch() {
        st.stage = 'match';
        st.p = kind === 'kanizsa' ? { rot: 0, line: false } : kind === 'ponzo' ? { ratio: 1 } : { ratio: 1, tailsTop: true };
        st.set = kind === 'kanizsa' ? 0 : pickOne([70, 130]);
        if (kind !== 'kanizsa') st.p.ratio = st.set / 100; else st.p.rot = 0;
        S.prog = { i: N, total: N + 1, label: R('Make it right', 'इसे सही करो'), marks: st.hist.map((h) => (h.ok ? 'ok' : 'no')) };
        render();
      }
      function done() {
        const fooled = st.hist.filter((h) => !h.ok).length, n = st.hist.length;
        let matchTxt = '', why;
        if (kind === 'kanizsa') {
          matchTxt = `${X('The triangle faded when you turned the shapes by', 'त्रिभुज तब ग़ायब हुआ जब तुमने आकृतियाँ इतनी घुमाईं:')} ${Math.round(st.set)}°`;
          why = [T2('The cut edges of the three shapes line up, so your brain assumes one white triangle lies in front and edges must be there. This is called an illusory contour. Turn the wedges and the edges no longer line up, so the triangle disappears.', 'तीनों आकृतियों के कटे किनारे एक सीध में हैं, इसलिए दिमाग़ मान लेता है कि सामने एक सफ़ेद त्रिभुज है और उसके किनारे होने चाहिए। इसे काल्पनिक रूपरेखा कहते हैं। फलकों को घुमाओ तो किनारे सीध में नहीं रहते और त्रिभुज ग़ायब हो जाता है।'),
            T2('Your brain fills in missing information all the time, because the real world is often partly hidden.', 'तुम्हारा दिमाग़ हर समय अधूरी जानकारी भर देता है, क्योंकि असली दुनिया में अक्सर चीज़ें आधी छिपी होती हैं।')];
        } else {
          const d = 100 - st.set;
          const who = kind === 'ponzo' ? R('upper bar', 'ऊपर वाली पट्टी') : R('line with outward fins', 'बाहर की ओर पंखों वाली रेखा');
          matchTxt = d > 3 ? `${R('To look equal you made the', 'बराबर दिखाने के लिए तुमने')} ${who} ${R(`${d}% shorter. So the illusion made it look about that much longer.`, `${d}% छोटा कर दिया। यानी भ्रम ने उसे लगभग उतना लंबा दिखाया।`)}`
            : d < -3 ? `${R('You made the', 'तुमने')} ${who} ${R(`${-d}% longer, the opposite of the usual push. The two were truly equal at 100%.`, `${-d}% लंबा किया, जो सामान्य झुकाव का उलटा है। असल में दोनों 100% पर बराबर थे।`)}`
              : R('You matched them almost exactly, within 3%. Great eyes, or you remembered the true lengths.', 'तुमने उन्हें लगभग ठीक मिला दिया, 3% के भीतर। बढ़िया नज़र, या तुम्हें असली लंबाइयाँ याद थीं।');
          why = kind === 'ponzo'
            ? [T2('The railway lines slope together like tracks going far away. Your brain reads the upper bar as farther, so it must be bigger to give the same picture on your eye. It stretches the upper bar in your mind. In the matching task, the two bars are truly equal at 100%.', 'पटरियाँ दूर जाती हुई मिलती दिखती हैं। दिमाग़ ऊपर की पट्टी को दूर मानता है, इसलिए उसे बड़ा समझ लेता है ताकि आँख पर वही तस्वीर बने। मिलान वाले कार्य में 100% पर दोनों पट्टियाँ सचमुच बराबर हैं।'),
              T2('Artists use the same depth cues to make flat drawings look deep.', 'कलाकार इन्हीं गहराई के संकेतों से सपाट चित्रों को गहरा दिखाते हैं।')]
            : [T2('The fins act like the corners of a room: outward fins look like the near corner of a building, inward fins like a far inside corner. Your brain adjusts the apparent length of the line for depth, even though the picture is flat. Measurement settles it.', 'पंख कमरे के कोनों जैसे लगते हैं: बाहर की ओर के पंख इमारत के पास वाले कोने जैसे और भीतर के पंख दूर के अंदरूनी कोने जैसे। चित्र सपाट होने पर भी दिमाग़ गहराई के हिसाब से लंबाई बदल देता है। माप से बात तय होती है।'),
              T2('One idea is that people who grow up among many straight-edged buildings are more fooled. Scientists still discuss it.', 'एक विचार यह है कि सीधे किनारों वाली बहुत-सी इमारतों के बीच पले लोग ज़्यादा धोखा खाते हैं। वैज्ञानिक इस पर अब भी चर्चा करते हैं।')];
        }
        const body = `<div class="md-stat">${stat(`${fooled}/${n}`, R('times your eyes were fooled', 'बार आँखें धोखा खा गईं'))}${kind === 'kanizsa' ? stat(Math.round(st.set) + '°', R('turn to remove it', 'हटाने के लिए घुमाव')) : stat((100 - st.set > 0 ? '-' : '+') + Math.abs(100 - st.set) + '%', R('your correction', 'तुम्हारा सुधार'))}</div>
          <div class="md-stim" style="min-height:0;margin:8px 0">${drawIllusion(kind, st.p, true)}</div><p class="md-p">${matchTxt}</p>`;
        finish({ body, why, rec: `Illusion ${kind}: fooled ${fooled} of ${n}; match setting ${Math.round(st.set)}${kind === 'kanizsa' ? ' degrees' : '%'}.`,
          think: T2('If you know it is an illusion, does it still look wrong? What does that tell you about the brain?', 'जब तुम्हें पता है कि यह भ्रम है, तब भी क्या वह ग़लत दिखता है? यह दिमाग़ के बारे में क्या बताता है?'),
          sr: R(`Your eyes were fooled ${fooled} times out of ${n}.`, `${n} में से ${fooled} बार तुम्हारी आँखें धोखा खा गईं।`) });
      }
      const OPT = {
        top: T2('The top line is longer', 'ऊपर की रेखा लंबी है'), bottom: T2('The bottom line is longer', 'नीचे की रेखा लंबी है'), equal: T2('They are equal', 'दोनों बराबर हैं'),
        yes: T2('Yes, a line is drawn there', 'हाँ, वहाँ रेखा खींची है'), no: T2('No, no line is drawn there', 'नहीं, वहाँ कोई रेखा नहीं खींची'),
      };
      return {
        begin: newRound,
        view() {
          if (st.stage === 'ask' || st.stage === 'rev') {
            const rev = st.stage === 'rev';
            const q = kind === 'kanizsa' ? X('You may see a white triangle in the middle. Is a line really drawn along its edges?', 'बीच में तुम्हें एक सफ़ेद त्रिभुज दिख सकता है। क्या उसके किनारों पर सचमुच रेखा खींची गई है?')
              : kind === 'ponzo' ? X('Which bar is longer?', 'कौन-सी पट्टी लंबी है?') : X('Which line is longer?', 'कौन-सी रेखा लंबी है?');
            const opts = kind === 'kanizsa' ? ['yes', 'no'] : kind === 'ponzo' ? ['top', 'bottom', 'equal'] : ['top', 'bottom', 'equal'];
            const truth = truthOf(st.p);
            const ob = opts.map((o) => `<button type="button" class="md-opt ${rev ? (o === truth ? 'right' : o === st.pick ? 'wrong' : '') : ''}" data-key="answer" data-v="${o}" ${rev ? 'disabled' : ''}>${TX(OPT[o])}</button>`).join('');
            let fb = '';
            if (rev) {
              let facts;
              if (kind === 'kanizsa') facts = truth === 'yes' ? X('A thin line really is drawn here. It is faint, but it is there.', 'यहाँ सचमुच एक पतली रेखा खींची है। वह हल्की है, पर है।') : st.p.rot ? X('The shapes are turned, so the edges do not line up and there is no triangle at all.', 'आकृतियाँ घुमा दी गई हैं, इसलिए किनारे सीध में नहीं हैं और कोई त्रिभुज है ही नहीं।') : X('No line is drawn. The dotted purple edges show where your brain added them.', 'कोई रेखा नहीं खींची है। बैंगनी बिंदीदार किनारे दिखाते हैं कि दिमाग़ ने कहाँ उन्हें जोड़ा।');
              else facts = truth === 'equal' ? X('Both are exactly the same length (100 and 100).', 'दोनों की लंबाई ठीक बराबर है (100 और 100)।') : kind === 'ponzo' ? X(`The ${truth === 'top' ? 'upper' : 'lower'} bar is really longer: ${Math.round(st.p.ratio * 100)} against 100 for the upper and lower.`, `${truth === 'top' ? 'ऊपर' : 'नीचे'} की पट्टी सचमुच लंबी है: ऊपर की ${Math.round(st.p.ratio * 100)}, नीचे की 100।`) : X(`The ${truth} line is really longer: the one with outward fins is ${Math.round(st.p.ratio * 100)}, the other 100.`, `${truth === 'top' ? 'ऊपर' : 'नीचे'} की रेखा सचमुच लंबी है: बाहर पंखों वाली ${Math.round(st.p.ratio * 100)} की है, दूसरी 100 की।`);
              fb = `<div class="md-fb ${st.ok ? 'ok' : 'no'}"><b>${st.ok ? X('Right!', 'सही!') : X('Fooled!', 'धोखा!')}</b><span>${facts} ${st.ok ? '' : X('Everyone is fooled sometimes, it is how brains work.', 'हर कोई कभी-कभी धोखा खाता है, दिमाग़ ऐसे ही काम करता है।')}</span></div>
                <div class="md-row">${btn('next', st.r + 1 >= N ? R('Now fix it with a slider', 'अब स्लाइडर से सही करो') : R('Next', 'अगला'))}</div>`;
            }
            return `<div class="md-stim" style="padding:8px">${drawIllusion(kind, st.p, rev)}</div><p class="md-qn">${q}</p><div class="md-opts ${kind === 'kanizsa' ? 'c2' : ''}">${ob}</div>${fb}`;
          }
          if (st.stage === 'match' || st.stage === 'matchrev') {
            const rev = st.stage === 'matchrev';
            const lab = kind === 'kanizsa' ? X('Slide until the white triangle disappears.', 'तब तक स्लाइड करो जब तक सफ़ेद त्रिभुज ग़ायब न हो जाए।')
              : kind === 'ponzo' ? X('Slide until the upper bar looks the same length as the lower bar.', 'तब तक स्लाइड करो जब तक ऊपर की पट्टी नीचे वाली के बराबर न दिखे।') : X('Slide until the yellow line looks as long as the blue line.', 'तब तक स्लाइड करो जब तक पीली रेखा नीली के बराबर लंबी न दिखे।');
            const mn = kind === 'kanizsa' ? 0 : 60, mx = kind === 'kanizsa' ? 45 : 140;
            const nxt = rev ? btn('next', R('See result', 'परिणाम देखो'), 'go') : btn('next', kind === 'kanizsa' ? R('Done', 'हो गया') : R('Measure', 'नापो'), 'go');
            return `<div class="md-stim" style="padding:8px">${drawIllusion(kind, st.p, rev)}</div><p class="md-qn">${lab}</p>
              <input class="md-range" type="range" data-key="respond" min="${mn}" max="${mx}" step="1" value="${st.set}" ${rev ? 'disabled' : ''} aria-label="${esc(R('Adjust the picture', 'चित्र को ठीक करो'))}">
              <p class="md-tt" style="text-align:center" id="md-rv">${kind === 'kanizsa' ? `${Math.round(st.set)}°` : `${Math.round(st.set)}%`}</p>
              ${rev ? `<div class="md-fb"><span>${kind === 'kanizsa' ? X('The dotted purple shapes are the full circles and the missing edges.', 'बैंगनी बिंदीदार आकृतियाँ पूरे गोले और ग़ायब किनारे हैं।') : X('Dashed white lines show the true ends. At 100% both are equal.', 'सफ़ेद बिंदीदार रेखाएँ असली सिरे दिखाती हैं। 100% पर दोनों बराबर हैं।')}</span></div>` : ''}
              <div class="md-row">${nxt}</div>`;
          }
          return '';
        },
        act(key, el, ev) {
          if (key === 'answer') answer(el.dataset.v);
          else if (key === 'next') {
            if (st.stage === 'rev') { st.r++; if (st.r >= N) startMatch(); else newRound(); }
            else if (st.stage === 'match') { st.stage = 'matchrev'; render(); }
            else if (st.stage === 'matchrev') done();
          } else if (key === 'respond' && st.stage === 'match') {
            st.set = +el.value;
            if (kind === 'kanizsa') st.p.rot = st.set; else st.p.ratio = st.set / 100;
            const fig = stage.querySelector('.md-stim'); if (fig) fig.innerHTML = drawIllusion(kind, st.p, false);
            const rv = stage.querySelector('#md-rv'); if (rv) rv.textContent = kind === 'kanizsa' ? `${Math.round(st.set)}°` : `${Math.round(st.set)}%`;
            if (ev && ev.type === 'change') emit('trial');
          }
        },
      };
    }

    // ================================================================ divided attention
    function attentionSplit() {
      const order = shuffle(['single', 'dual']);
      const st = { ph: 0, stage: 'play', k: 0, lit: -1, litAt: 0, tapped: false, sum: null, sumDone: false, tm: 0, data: { single: null, dual: null }, cur: null };
      const mode = () => order[st.ph];
      function makeSum() {
        let a = rint(6, 19), b = rint(3, 9), op = Math.random() < 0.5 ? '+' : '−';
        if (op === '−' && a <= b) a += b;
        const ans = op === '+' ? a + b : a - b;
        const o = new Set([ans]);
        while (o.size < 3) { const d = pickOne([-2, -1, 1, 2, 10]); if (ans + d > 0) o.add(ans + d); }
        return { q: `${a} ${op} ${b}`, ans, opts: shuffle([...o]) };
      }
      function phase() {
        st.cur = { hits: 0, miss: 0, wrong: 0, rts: [], sumRight: 0, sumTotal: 0 };
        st.data[mode()] = st.cur;
        st.k = 0; st.lit = -1; st.sum = null; st.stage = 'play';
        S.prog = { i: 0, total: N, label: `${mode() === 'single' ? R('Round: lamps only', 'दौर: केवल दीये') : R('Round: lamps and sums', 'दौर: दीये और जोड़-घटाव')}` };
        render();
        later(event, 1000);
      }
      function event() {
        if (st.k >= N) { endPhase(); return; }
        st.k++; st.lit = rint(0, 2); st.litAt = now(); st.tapped = false; st.sumDone = false;
        st.sum = mode() === 'dual' ? makeSum() : null;
        S.prog.i = st.k - 1;
        render(); live(`${R('Lamp', 'दीया')} ${st.lit + 1}`);
        st.tm = later(endEvent, 2000);
      }
      function endEvent() {
        if (!st.tapped) st.cur.miss++;
        if (st.sum && !st.sumDone) { st.cur.sumTotal++; emit('answered:wrong'); }
        st.lit = -1; st.sum = null; render(); emit('trial');
        later(event, rint(900, 1700));
      }
      function maybeEarly() { if (st.tapped && (!st.sum || st.sumDone)) { cancel(st.tm); st.tm = later(endEvent, 450); } }
      function endPhase() {
        if (st.ph === 0) { st.stage = 'between'; S.prog = { i: N, total: N, label: R('Round done', 'दौर पूरा') }; render(); live(R('Round done.', 'दौर पूरा हुआ।')); }
        else done();
      }
      function done() {
        const s = st.data.single, d = st.data.dual;
        const rt = (x) => (x.rts.length ? Math.round(mean(x.rts)) : 0);
        const row = (lab, x) => `<h3 class="md-h">${lab}</h3>${bar(R('Lamps hit', 'सही दीये'), x.hits, N, `${x.hits}/${N}`, 'g')}${bar(R('Average speed', 'औसत गति'), rt(x), 2000, x.rts.length ? rt(x) + ' ms' : '–')}${x === d ? bar(R('Sums right', 'जोड़-घटाव सही'), x.sumRight, N, `${x.sumRight}/${N}`) : ''}`;
        const body = row(R('Lamps only', 'केवल दीये'), s) + row(R('Lamps and sums together', 'दीये और जोड़-घटाव साथ'), d);
        const slower = s.rts.length && d.rts.length ? rt(d) - rt(s) : 0, lost = s.hits - d.hits;
        const verdict = (lost > 0 || slower > 40 || d.sumRight < N)
          ? T2(`With two tasks you ${lost > 0 ? `missed ${lost} more lamp${lost > 1 ? 's' : ''}` : 'hit as many lamps'}${slower > 40 ? ` and were ${slower} ms slower` : ''}, and got ${d.sumRight} of ${N} sums right. Attention is shared, so each job gets less.`, `दो काम करने पर तुमने ${lost > 0 ? `${lost} दीये ज़्यादा चूके` : 'उतने ही दीये पकड़े'}${slower > 40 ? ` और ${slower} मिली-सेकंड धीमे रहे` : ''}, और ${N} में से ${d.sumRight} जोड़-घटाव सही किए। ध्यान बँट जाता है, इसलिए हर काम को कम मिलता है।`)
          : T2('This time you kept up in both rounds. Try again with harder sums, because the sums here were easy. Scientists look for a cost when the second task is demanding.', 'इस बार तुम दोनों दौर में बराबर रहे। कठिन जोड़-घटाव से फिर करो, क्योंकि यहाँ के सवाल आसान थे। वैज्ञानिक तब कीमत ढूँढते हैं जब दूसरा काम कठिन हो।');
        finish({ body: body + `<p class="md-p">${TX(verdict)}</p>`, rec: `Divided attention: single ${s.hits}/${N} hits at ${rt(s)} ms; dual ${d.hits}/${N} hits at ${rt(d)} ms, sums ${d.sumRight}/${N}.`,
          sr: R('Both rounds are done.', 'दोनों दौर पूरे हुए।'),
          why: [T2('The brain can run well-practised jobs together, like walking and talking, but two jobs that both need thinking compete for limited attention. We switch quickly between them and lose some speed or accuracy.', 'दिमाग़ अच्छी तरह सीखे हुए काम एक साथ कर सकता है, जैसे चलना और बोलना, लेकिन सोच माँगने वाले दो काम सीमित ध्यान के लिए आपस में होड़ करते हैं। हम तेज़ी से उनके बीच बदलते हैं और कुछ गति या शुद्धता खो देते हैं।'),
            T2('This is why using a phone while crossing a road or driving is dangerous.', 'इसीलिए सड़क पार करते या गाड़ी चलाते समय फ़ोन का उपयोग ख़तरनाक है।')],
          think: T2('Which everyday jobs can you do together, and which cannot you?', 'रोज़ के कौन-से काम तुम साथ कर सकते हो और कौन-से नहीं?') });
      }
      function lampTap(i) {
        if (st.stage !== 'play') return;
        if (st.lit === i && !st.tapped) {
          st.tapped = true; st.cur.hits++; st.cur.rts.push(now() - st.litAt);
          render(); maybeEarly();
        } else st.cur.wrong++;
      }
      function sumTap(v) {
        if (!st.sum || st.sumDone) return;
        st.sumDone = true; st.cur.sumTotal++;
        const ok = v === st.sum.ans; if (ok) st.cur.sumRight++;
        emit(ok ? 'answered:right' : 'answered:wrong');
        render(); maybeEarly();
      }
      return {
        begin: phase,
        view() {
          if (st.stage === 'between') return `<div class="md-stim"><div style="text-align:center"><div class="md-word" style="font-size:2rem">${X('Round done.', 'दौर पूरा।')}</div><p style="max-width:34ch">${mode() === 'single' ? X('Next round: tap the lamp AND solve the sum. Do both!', 'अगला दौर: दीया दबाओ और जोड़-घटाव भी हल करो। दोनों करो!') : X('Next round: only the lamps again.', 'अगला दौर: फिर से केवल दीये।')}</p></div></div><div class="md-row c">${btn('next', R('Go', 'चलो'), 'go')}</div>`;
          const lamps = [0, 1, 2].map((i) => `<button type="button" class="md-lamp ${st.lit === i ? (st.tapped ? 'hit' : 'on') : ''}" data-key="respond" data-i="${i}" aria-label="${R('Lamp', 'दीया')} ${i + 1}${st.lit === i ? ' (' + R('lit', 'जला') + ')' : ''}">${i + 1}</button>`).join('');
          let sum = '';
          if (mode() === 'dual') {
            sum = st.sum ? `<div class="md-sum"><div class="q" aria-label="${esc(st.sum.q)}">${esc(st.sum.q)} = ?</div><div class="md-opts" style="grid-template-columns:repeat(3,1fr)">${st.sum.opts.map((o) => `<button type="button" class="md-opt" data-key="answer" data-v="${o}" ${st.sumDone ? 'disabled' : ''}>${o}</button>`).join('')}</div></div>` : `<div class="md-sum"><p class="md-tt" style="text-align:center;color:#d6c8ff">${X('A sum appears with each lamp…', 'हर दीये के साथ एक सवाल आएगा…')}</p></div>`;
          }
          return `<div class="md-stim" style="min-height:${mode() === 'dual' ? 150 : 130}px"><div><div class="md-lamps">${lamps}</div>${mode() === 'dual' ? '' : `<p style="text-align:center;margin:8px 0 0">${X('Tap a lamp when it lights up.', 'दीया जलते ही उसे दबाओ।')}</p>`}</div></div>${sum}`;
        },
        act(key, el) {
          if (key === 'respond') lampTap(+el.dataset.i);
          else if (key === 'answer') sumTap(+el.dataset.v);
          else if (key === 'next' && st.stage === 'between') { st.ph = 1; phase(); }
        },
        fast: true,
      };
    }

    // ================================================================ learning curve
    function learningCurve() {
      const st = { a: 0, nums: [], need: 1, t0: 0, err: 0, times: [], errs: [], stage: 'play', done: new Set() };
      function attempt() {
        st.nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); st.need = 1; st.t0 = 0; st.err = 0; st.done = new Set(); st.stage = 'play';
        S.prog = { i: st.a, total: N, label: `${R('Try', 'प्रयास')} ${st.a + 1}/${N}` };
        render();
      }
      function tap(n, el) {
        if (st.stage !== 'play') return;
        if (!st.t0) st.t0 = now();
        if (n === st.need) {
          st.done.add(n); st.need++;
          if (st.need > 9) {
            const t = now() - st.t0; st.times.push(t); st.errs.push(st.err); st.stage = 'done'; S.prog.i = st.a + 1;
            render(); emit('trial'); live(`${(t / 1000).toFixed(1)} ${R('seconds', 'सेकंड')}`);
          } else render();
        } else { st.err++; if (el) { el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); } }
      }
      function chart() {
        const ts = st.times.map((t) => t / 1000), W = 340, H = 170, pl = 34, pb = 24, pt = 12, pr = 10;
        const mx = Math.max.apply(null, ts) * 1.15, mn = 0;
        const X0 = (i) => pl + (ts.length > 1 ? (i / (ts.length - 1)) * (W - pl - pr) : (W - pl - pr) / 2), Y0 = (v) => pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb);
        const pts = ts.map((v, i) => `${X0(i).toFixed(1)},${Y0(v).toFixed(1)}`).join(' ');
        const grid = [0, 0.5, 1].map((f) => { const v = mx * f, y = Y0(v); return `<path d="M${pl} ${y}H${W - pr}" stroke="currentColor" opacity=".15"/><text x="${pl - 5}" y="${y + 4}" font-size="11" text-anchor="end" fill="currentColor" opacity=".75">${mx < 5 ? v.toFixed(1) : v.toFixed(0)}</text>`; }).join('');
        return `<svg viewBox="0 0 ${W} ${H}" class="md-fig" role="img" aria-label="${X('Time for each attempt, in seconds', 'हर प्रयास का समय, सेकंड में')}" style="color:var(--ink,#0f172a)">${grid}
          <polyline points="${pts}" fill="none" stroke="#8B3DFF" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${ts.map((v, i) => `<circle cx="${X0(i).toFixed(1)}" cy="${Y0(v).toFixed(1)}" r="5" fill="${st.errs[i] ? '#FF7A1A' : '#14B8A6'}" stroke="#fff" stroke-width="2"/><text x="${X0(i).toFixed(1)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".75">${i + 1}</text>`).join('')}
          <text x="${pl - 24}" y="${pt + 4}" font-size="10" fill="currentColor" opacity=".7">s</text></svg>`;
      }
      function done() {
        const ts = st.times, first = ts[0], last = ts[ts.length - 1], best = Math.min.apply(null, ts), imp = ((first - last) / first) * 100;
        const body = `<div class="md-stat">${stat((first / 1000).toFixed(1) + ' s', R('first try', 'पहला प्रयास'))}${stat((last / 1000).toFixed(1) + ' s', R('last try', 'आख़िरी प्रयास'))}${stat((imp >= 0 ? '' : '+') + Math.abs(Math.round(imp)) + '%', imp >= 0 ? R('faster', 'तेज़') : R('slower', 'धीमे'))}</div>
          ${chart()}<div class="md-leg"><span><i style="background:#14B8A6"></i>${X('no mistakes', 'कोई ग़लती नहीं')}</span><span><i style="background:#FF7A1A"></i>${X('with a mistake', 'ग़लती के साथ')}</span><span>${X('Best:', 'सबसे अच्छा:')} ${(best / 1000).toFixed(1)} s</span></div>`;
        finish({ body, rec: `Learning curve: first ${(first / 1000).toFixed(1)} s, last ${(last / 1000).toFixed(1)} s over ${ts.length} tries (${Math.round(imp)}% change).`,
          sr: R(`Your first time was ${(first / 1000).toFixed(1)} seconds and your last was ${(last / 1000).toFixed(1)} seconds.`, `तुम्हारा पहला समय ${(first / 1000).toFixed(1)} सेकंड और आख़िरी ${(last / 1000).toFixed(1)} सेकंड था।`),
          why: [imp > 5 ? T2('Your times came down with practice. Early on you learned where to scan and which numbers to find next; later, gains get smaller. This shape is the learning curve. Gains usually follow a power law: big at first, then small.', 'अभ्यास से तुम्हारे समय घटे। शुरुआत में तुमने सीखा कि कहाँ देखना है और अगला अंक कैसे ढूँढना है; बाद में लाभ छोटे होते जाते हैं। यह आकार ही अधिगम वक्र है। लाभ अक्सर घात-नियम का पालन करते हैं: पहले बड़े, फिर छोटे।')
            : T2('Your times did not fall this time. Tiredness, a slip or losing focus can hide learning in a short run. Real learning curves are clearer when many people are averaged or many more tries are made.', 'इस बार तुम्हारे समय नहीं घटे। थकान, कोई चूक या ध्यान भटकना छोटे दौर में सीखने को छिपा सकता है। जब कई लोगों का औसत लिया जाए या बहुत ज़्यादा प्रयास हों, तब वक्र साफ़ दिखता है।'),
            T2('The layout changed every time, so a better time means a better search skill, not remembering where the numbers sat.', 'हर बार नक्शा बदला, इसलिए बेहतर समय का मतलब ढूँढने का बेहतर कौशल है, अंकों की जगह याद रखना नहीं।')],
          think: T2('Think of cycling or a new game. Where were the biggest gains: at the start, or later?', 'साइकिल चलाना या कोई नया खेल सोचो। सबसे बड़ा सुधार कहाँ हुआ: शुरू में या बाद में?') });
      }
      return {
        begin: attempt,
        view() {
          const cells = st.nums.map((n) => `<button type="button" class="md-cell ${st.done.has(n) ? 'done' : ''}" data-key="respond" data-n="${n}" aria-label="${n}" ${st.stage === 'done' ? 'tabindex="-1"' : ''}>${n}</button>`).join('');
          const info = st.stage === 'done' ? `<div class="md-fb ok"><b>${(st.times[st.times.length - 1] / 1000).toFixed(1)} s</b><span>${st.err ? X(`${st.err} wrong tap${st.err > 1 ? 's' : ''}.`, `${st.err} ग़लत बार दबाया।`) : X('No mistakes.', 'कोई ग़लती नहीं।')}</span></div><div class="md-row c">${btn('next', st.a + 1 >= N ? R('See result', 'परिणाम देखो') : R('Next try', 'अगला प्रयास'), 'go')}</div>`
            : `<p class="md-p" style="text-align:center;font-weight:700">${X('Tap', 'दबाओ')} <span style="font-size:1.6rem;color:var(--mp)">${st.need}</span></p>`;
          return `<div class="md-grid3" role="group" aria-label="${X('Number grid', 'अंकों की तालिका')}">${cells}</div>${info}`;
        },
        act(key, el) {
          if (key === 'respond') tap(+el.dataset.n, el);
          else if (key === 'next' && st.stage === 'done') { st.a++; if (st.a >= N) done(); else attempt(); }
        },
      };
    }

    // ================================================================ survey
    function survey() {
      const topics = TOPICS.slice(0, N);
      const qs = topics.map((t) => ({ t, v: 'a' })).concat(topics.map((t) => ({ t, v: 'b' })));
      const st = { i: 0, ans: [] };
      function begin() { st.i = 0; st.ans = []; S.prog = { i: 0, total: qs.length, label: `${R('Question', 'सवाल')} 1/${qs.length}` }; render(); }
      function pick(v) {
        st.ans[st.i] = v; st.i++; emit('trial');
        if (st.i >= qs.length) { done(); return; }
        S.prog = { i: st.i, total: qs.length, label: `${R('Question', 'सवाल')} ${st.i + 1}/${qs.length}` };
        render();
      }
      function done() {
        let mattered = 0;
        const rows = topics.map((t, i) => {
          const a = st.ans[i], b = st.ans[topics.length + i], bpos = 6 - b, d = bpos - a;
          if (Math.abs(d) >= 2 || (a >= 4 && b >= 4)) mattered++;
          const msg = a >= 4 && b >= 4 ? T2('You agreed with both, though they say opposite things. Leading words can pull people to say "yes". This is acquiescence bias.', 'तुम दोनों से सहमत हुए, जबकि वे उलटी बात कहते हैं। झुकाने वाले शब्द लोगों को "हाँ" की ओर खींचते हैं। इसे सहमति-झुकाव कहते हैं।')
            : Math.abs(d) <= 1 ? T2('Your two answers agree. The wording did not push you much here.', 'तुम्हारे दोनों उत्तर मेल खाते हैं। यहाँ शब्दों ने तुम्हें ज़्यादा नहीं झुकाया।')
              : d < 0 ? T2(`The leading question pulled you toward "${t.hi.en}".`, `झुकाने वाले सवाल ने तुम्हें "${t.hi.hi}" की ओर खींचा।`) : T2('The leading question moved you the other way from what you first said.', 'झुकाने वाले सवाल ने तुम्हें पहले वाले उत्तर से उलटी ओर मोड़ा।');
          return `<h3 class="md-h">${TX(t.lo)} / ${TX(t.hi)}</h3>${bar(R('Plain question', 'सीधा सवाल'), a, 5, `${a}/5`)}${bar(R('Leading question, scored the same way', 'झुकाने वाला सवाल, उसी तरह अंक'), bpos, 5, `${bpos}/5`, 'o')}<p class="md-p s">${TX(msg)}</p>`;
        }).join('');
        const body = `<p class="md-p s">${X('Scores run from 1 (most negative) to 5 (most positive) about the same idea. The leading question was turned around so that both bars mean the same thing.', 'अंक 1 (सबसे नकारात्मक) से 5 (सबसे सकारात्मक) तक एक ही विचार के बारे में हैं। झुकाने वाले सवाल को पलट दिया गया है ताकि दोनों पट्टियों का मतलब एक ही हो।')}</p>${rows}
          <div class="md-stat">${stat(`${mattered}/${topics.length}`, R('topics where wording mattered', 'विषय जहाँ शब्दों ने असर डाला'))}</div>`;
        finish({ body, rec: `Survey: ${topics.length} topic(s), wording mattered on ${mattered}.`,
          sr: R('Survey done.', 'सर्वेक्षण पूरा हुआ।'),
          why: [T2('Good surveys use plain, neutral wording, ask many people, and choose them fairly (a sample). Leading questions, loaded words and crowded options all bend the answers.', 'अच्छे सर्वेक्षण सीधे, तटस्थ शब्द चुनते हैं, कई लोगों से पूछते हैं और उन्हें निष्पक्ष ढंग से चुनते हैं (प्रतिदर्श)। झुकाने वाले सवाल, भारी शब्द और भीड़ भरे विकल्प, सब उत्तरों को मोड़ देते हैं।'),
            T2('Your own answers are one person only. A survey of one person cannot tell us what a class, a school or a country thinks.', 'तुम्हारे उत्तर सिर्फ़ एक व्यक्ति के हैं। एक व्यक्ति का सर्वेक्षण यह नहीं बता सकता कि कक्षा, स्कूल या देश क्या सोचता है।')],
          think: T2('How would you write the question so that nobody is pushed either way?', 'तुम सवाल कैसे लिखोगे ताकि कोई भी किसी ओर न धकेला जाए?') });
      }
      return {
        begin,
        view() {
          const q = qs[st.i];
          const text = q.v === 'a' ? q.t.a : q.t.b;
          return `<p class="md-qn">${TX(text)}</p><div class="md-opts" role="group" aria-label="${X('Your answer', 'तुम्हारा उत्तर')}">${LIKERT.map((o, k) => `<button type="button" class="md-opt" data-key="answer" data-v="${k + 1}">${TX(o)}</button>`).join('')}</div>`;
        },
        act(key, el) { if (key === 'answer') pick(+el.dataset.v); },
      };
    }

    const MAKE = { 'memory-span': memorySpan, 'serial-position': serialPosition, stroop, 'reaction-time': reactionTime, illusion, 'attention-split': attentionSplit, 'learning-curve': learningCurve, survey };

    // ---- input routing: every control is a [data-key]; ask the engine before acting
    function route(key, el, ev) {
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'start') { start(); return; }
      if (S.phase === 'run' && inst) inst.act(key, el, ev);
    }
    const onClick = (e) => {
      const el = e.target.closest && e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      if (el.tagName === 'INPUT') return;
      if (el.classList.contains('md-pad') && e.detail > 0) return;   // a mouse or touch tap was already handled on pointerdown
      route(el.dataset.key, el, e);
    };
    const onDown = (e) => {
      const el = e.target.closest && e.target.closest('.md-pad[data-key], .md-lamp[data-key]');
      if (!el || !root.contains(el) || !(inst && inst.fast) || S.phase !== 'run') return;
      if (e.button && e.button !== 0) return;
      route(el.dataset.key, el, e);
      el.__md = now();
    };
    const onLampClick = (e) => {
      const el = e.target.closest && e.target.closest('.md-lamp[data-key]');
      if (!el || !root.contains(el)) return;
      e.stopPropagation();
      if (e.detail === 0) route(el.dataset.key, el, e);       // keyboard activation; pointer taps were handled on pointerdown
    };
    const onRange = (e) => {
      const el = e.target;
      if (!el.matches || !el.matches('input[data-key]')) return;
      if (!api.allowed(el.dataset.key)) { api.nudge(el.dataset.key); render(); return; }
      if (S.phase === 'run' && inst) inst.act(el.dataset.key, el, e);
    };
    const onKey = (e) => {
      if (S.phase === 'run' && inst && inst.keydown && !e.ctrlKey && !e.metaKey && !e.altKey) inst.keydown(e);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('click', onLampClick, true);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('input', onRange);
    root.addEventListener('change', onRange);
    root.addEventListener('keydown', onKey);

    render();
    return {
      destroy() {
        alive = false; clearAll();
        root.removeEventListener('click', onClick); root.removeEventListener('click', onLampClick, true);
        root.removeEventListener('pointerdown', onDown); root.removeEventListener('input', onRange);
        root.removeEventListener('change', onRange); root.removeEventListener('keydown', onKey);
      },
    };
  }

  NCA_T.register({
    id: 'mind',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['experiment', 'trials'].includes(k)) e.push('unknown key: ' + k); });
      const x = c.experiment;
      let b = null;
      if (typeof x !== 'string') e.push('experiment: a string such as "stroop" or "illusion:ponzo"');
      else if (x.indexOf('illusion:') === 0) {
        if (!ILLUSIONS.includes(x.slice(9))) e.push(`unknown illusion: ${x.slice(9)} (use ${ILLUSIONS.join(', ')})`); else b = 'illusion';
      } else if (x === 'illusion') e.push('illusion needs a name: illusion:' + ILLUSIONS.join(' | illusion:'));
      else if (!EXPERIMENTS.includes(x)) e.push(`unknown experiment: ${x} (use ${EXPERIMENTS.filter((n) => n !== 'illusion').concat(ILLUSIONS.map((n) => 'illusion:' + n)).join(', ')})`);
      else b = x;
      if (c.trials != null) {
        if (!Number.isInteger(c.trials)) e.push('trials: a whole number');
        else if (b && (c.trials < RANGE[b][0] || c.trials > RANGE[b][1])) e.push(`trials: ${RANGE[b][0]} to ${RANGE[b][1]} for ${b}`);
        else if (!b && (c.trials < 1 || c.trials > 20)) e.push('trials: 1 to 20');
      }
      return e;
    },
    keys(c) {
      const x = c && typeof c.experiment === 'string' ? c.experiment : '';
      const b = baseOf(x);
      const right = ['answered:right', 'answered:wrong'];
      const ev = ['trial', 'result'];
      let targets;
      if (b === 'memory-span' || b === 'serial-position') { targets = ['start', 'respond', 'answer'].concat(b === 'memory-span' ? ['next'] : []); ev.push(...right); }
      else if (b === 'stroop') { targets = ['start', 'respond', 'next']; ev.push(...right); }
      else if (b === 'reaction-time' || b === 'learning-curve') targets = ['start', 'respond', 'next'];
      else if (b === 'illusion') { targets = ['start', 'answer', 'next'].concat(x === 'illusion:kanizsa' || x === 'illusion:ponzo' || x === 'illusion:muller-lyer' ? ['respond'] : []); ev.push(...right); }
      else if (b === 'attention-split') { targets = ['start', 'respond', 'answer', 'next']; ev.push(...right); }
      else if (b === 'survey') targets = ['start', 'answer'];
      else { targets = ['start', 'respond', 'answer', 'next']; ev.push(...right); }
      return { targets, events: ev };
    },
    demo: { experiment: 'illusion:muller-lyer', trials: 4 },
    experiments: EXPERIMENTS.filter((n) => n !== 'illusion').concat(ILLUSIONS.map((n) => 'illusion:' + n)),
    mount(root, config, api) { return mind(root, config, api); },
  });
})();
