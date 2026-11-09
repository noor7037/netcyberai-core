// Template: Periodic table explorer. The first 54 elements with real data (mass, electronegativity, first ionisation
// energy, covalent radius, electron shells), four ways to colour the table, five trends, and the history of the idea:
// Dobereiner's triads, Newlands' octaves, Mendeleev's table with its gaps, and the modern table. Config:
//   { highlight?: 'families'|'groups'|'periods'|'metals'|'blocks'|'trend:size'|'trend:metallic'|'trend:electronegativity'
//                 |'trend:ionisation'|'trend:valency',
//     focus?: [symbols], history?: 'dobereiner'|'newlands'|'mendeleev'|'modern' }
// highlight only applies to the modern table, so it cannot be combined with another history view.
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex, tween, ease } = L;

  const CSS = `.pt { container-type: inline-size; color: var(--ink); font-family: var(--font-body); }
.pt * { box-sizing: border-box; }
.pt button { font-family: inherit; cursor: pointer; }
.pt-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.pt-tab { min-height: 44px; flex: 1 1 130px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; padding: 4px 10px; font-weight: 700; font-size: .92rem; line-height: 1.15; text-align: center; transition: all .18s; }
.pt-tab small { display: block; font-weight: 500; font-size: .74rem; color: var(--ink-2); }
.pt-tab:hover { border-color: #9333EA; }
.pt-tab[aria-pressed="true"] { background: #6D28D9; border-color: #6D28D9; color: #fff; box-shadow: 0 4px 12px rgba(109,40,217,.35); }
.pt-tab[aria-pressed="true"] small { color: #E9D5FF; }
.pt-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.pt-chips .pt-lbl { font-weight: 700; font-size: .8rem; color: var(--ink-2); margin-right: 2px; }
.pt-chip { min-height: 44px; padding: 4px 13px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font-weight: 700; font-size: .86rem; transition: all .18s; }
.pt-chip:hover { border-color: #9333EA; }
.pt-chip[aria-pressed="true"] { background: #8B3DFF; border-color: #8B3DFF; color: #fff; }
.pt-live { background: var(--surface); border: 1px solid var(--line); border-left: 5px solid #8B3DFF; border-radius: 12px; padding: 9px 13px; margin: 0 0 10px; min-height: 48px; font-size: .95rem; line-height: 1.35; }
.pt-live b { font-family: var(--font-display); }
.pt-board { background: linear-gradient(160deg, #F5F3FF, #EEF2FF); border-radius: 16px; padding: 8px 6px 10px; border: 1px solid #DDD6FE; }
:root[data-theme="dark"] .pt-board { background: linear-gradient(160deg, #1E1B4B, #172554); border-color: #3730A3; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pt-board { background: linear-gradient(160deg, #1E1B4B, #172554); border-color: #3730A3; } }
.pt-grid { display: grid; grid-template-columns: 14px repeat(18, minmax(0, 1fr)); gap: 2px; }
.pt-gh, .pt-ph { font: 700 9px var(--font-body); color: var(--ink-2); display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all .2s; }
.pt-gh.on, .pt-ph.on { background: #6D28D9; color: #fff; transform: scale(1.12); }
.pt-c { position: relative; aspect-ratio: 1 / 1.12; border: 1.5px solid rgba(30,41,59,.18); border-radius: 6px; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; transition: transform .15s, opacity .25s, box-shadow .2s, background-color .35s; overflow: hidden; }
.pt-c b { font: 700 clamp(9px, 2.6cqw, 17px) var(--font-display); }
.pt-c i { position: absolute; top: 1px; left: 2px; font: 600 7px var(--font-body); font-style: normal; opacity: .8; display: none; }
.pt-c u { text-decoration: none; font: 700 9px var(--font-body); display: none; margin-top: 1px; }
.pt-c:hover { transform: scale(1.12); z-index: 3; box-shadow: 0 4px 12px rgba(6,18,51,.3); }
.pt-c.dim { opacity: .42; }
.pt-c.rel { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #6D28D9; z-index: 2; }
.pt-c.foc { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #FF7A1A; z-index: 2; animation: pt-pulse 1.8s ease-in-out infinite; }
.pt-c.sel { transform: scale(1.12); z-index: 4; box-shadow: 0 0 0 1.5px #fff, 0 0 0 3.5px #1D4ED8, 0 6px 14px rgba(6,18,51,.4); animation: none; }
.pt-note-cell { grid-row: 2 / 3; grid-column: 4 / 15; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 4px; font-size: clamp(9px, 2.4cqw, 13px); line-height: 1.2; color: var(--ink); }
.pt-note-cell span { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 3px 8px; font-weight: 600; }
.pt-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 9px; font-size: .8rem; color: var(--ink); align-items: center; padding: 0 4px; }
.pt-legend span.sw { display: inline-flex; align-items: center; gap: 5px; }
.pt-legend em { width: 14px; height: 14px; border-radius: 4px; display: inline-block; border: 1px solid rgba(30,41,59,.25); }
.pt-scale { width: 150px; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #F3E8FF, #5B21B6); border: 1px solid rgba(30,41,59,.25); }
.pt-chart { margin-top: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 8px 8px 4px; }
.pt-chart svg { width: 100%; height: auto; display: block; }
.pt-chart p { margin: 2px 4px 4px; font-size: .78rem; color: var(--ink-2); }
.pt-bar { transform-box: fill-box; transform-origin: bottom; }
.pt-anim .pt-bar { animation: pt-grow .7s ease-out both; }
.pt-card { margin-top: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; box-shadow: 0 6px 20px rgba(6,18,51,.08); }
.pt-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pt-tile { width: 64px; height: 72px; border-radius: 12px; border: 2px solid rgba(30,41,59,.3); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1E293B; flex: none; position: relative; box-shadow: 0 4px 10px rgba(6,18,51,.15); }
.pt-tile i { position: absolute; top: 3px; left: 6px; font: 700 .72rem var(--font-body); font-style: normal; }
.pt-tile b { font: 800 1.9rem/1 var(--font-display); }
.pt-card h3 { margin: 0; font: 800 1.35rem/1.1 var(--font-display); }
.pt-card h3 + div { color: var(--ink-2); font-size: .85rem; }
.pt-step { margin-left: auto; display: flex; gap: 6px; }
.pt-step button { width: 44px; height: 44px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sunk); color: var(--ink); font-size: 1.1rem; font-weight: 800; }
.pt-step button:hover { border-color: #9333EA; }
.pt-cardbody { display: grid; gap: 12px; grid-template-columns: 1fr; align-items: center; }
.pt-bohr { width: 100%; max-width: 230px; margin: 0 auto; display: block; }
.pt-orb { transform-origin: 100px 100px; animation: pt-spin 24s linear infinite; }
.pt-orb.o1 { animation-duration: 10s; } .pt-orb.o2 { animation-duration: 16s; animation-direction: reverse; } .pt-orb.o3 { animation-duration: 22s; } .pt-orb.o4 { animation-duration: 30s; animation-direction: reverse; } .pt-orb.o5 { animation-duration: 38s; }
.pt-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.pt-stat { background: var(--sunk); border-radius: 10px; padding: 6px 9px; border: 1.5px solid transparent; }
.pt-stat small { display: block; color: var(--ink-2); font-size: .72rem; font-weight: 600; }
.pt-stat b { font-size: .95rem; }
.pt-stat.on { border-color: #8B3DFF; background: var(--surface); box-shadow: 0 0 0 2px rgba(139,61,255,.25); }
.pt-fact { margin: 10px 0 0; font-size: .93rem; line-height: 1.4; }
.pt-fact b { color: var(--royal); }
.pt-card.pt-empty { text-align: center; color: var(--ink-2); padding: 18px; }
.pt-tri { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.pt-tri .pt-tile { width: 100%; height: 96px; }
.pt-tri button.pt-tile { cursor: pointer; transition: transform .15s; }
.pt-tri button.pt-tile:hover { transform: translateY(-3px); }
.pt-tri button.pt-tile.sel { outline: 3px solid #1D4ED8; outline-offset: 2px; }
.pt-tile em { font: 600 .74rem var(--font-body); font-style: normal; margin-top: 2px; }
.pt-tile s { text-decoration: none; font: 700 .8rem var(--font-body); margin-top: 3px; }
.pt-line svg { width: 100%; height: auto; display: block; margin-top: 8px; background: var(--surface); border-radius: 12px; border: 1px solid var(--line); }
.pt-table { width: 100%; border-collapse: separate; border-spacing: 2px; table-layout: fixed; }
.pt-nh { font: 700 .72rem var(--font-body); text-align: center; color: var(--ink-2); padding: 2px; }
.pt-nc { width: 100%; min-height: 54px; border-radius: 10px; border: 1.5px solid rgba(30,41,59,.2); background: #DDD6FE; color: #1E293B; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 2px 1px 0; transition: transform .15s, box-shadow .2s, opacity .25s; }
.pt-nc b { font: 800 clamp(.8rem, 3.4cqw, 1.2rem) var(--font-display); line-height: 1.05; }
.pt-nc i { position: absolute; top: 1px; left: 3px; font: 700 .6rem var(--font-body); font-style: normal; }
.pt-nc u { text-decoration: none; font: 800 .72rem var(--font-body); }
.pt-nc:hover { transform: scale(1.06); }
.pt-nc.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #1D4ED8; z-index: 2; position: relative; }
.pt-nc.rel { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #FF7A1A; background: #FED7AA; }
.pt-nc.foc { outline: 3px solid #FF7A1A; outline-offset: 1px; }
.pt-nc.fit-yes { background: #BBF7D0; } .pt-nc.fit-part { background: #FDE68A; } .pt-nc.fit-no { background: #FECACA; }
.pt-nc.plain { background: #DDD6FE; }
.pt-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
.pt-btn { min-height: 44px; padding: 6px 16px; border-radius: 12px; border: 0; background: #1D4ED8; color: #fff; font-weight: 700; font-size: .92rem; box-shadow: 0 3px 8px rgba(29,78,216,.3); }
.pt-btn.ghost { background: var(--sunk); color: var(--ink); box-shadow: none; border: 1.5px solid var(--line); }
.pt-btn[aria-pressed="true"] { background: #0F766E; }
.pt-mend { display: grid; grid-template-columns: 22px repeat(7, minmax(0, 1fr)) minmax(0, 3.2fr); gap: 3px; }
.pt-mend .pt-gh { min-height: 24px; font-size: .75rem; }
.pt-mc { min-height: 46px; border-radius: 9px; border: 1.5px solid rgba(30,41,59,.2); background: #DDD6FE; color: #1E293B; display: flex; align-items: center; justify-content: center; font: 800 clamp(.8rem, 3.4cqw, 1.15rem) var(--font-display); transition: transform .15s, box-shadow .2s; padding: 0; }
.pt-mc:hover { transform: scale(1.07); }
.pt-mc.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #1D4ED8; }
.pt-mc.foc { outline: 3px solid #FF7A1A; outline-offset: 1px; }
.pt-mw { display: flex; }
.pt-mw > .pt-mc { flex: 1; }
.pt-mc.gap b { font: 700 .62rem/1.05 var(--font-body); }
.pt-mc.gap { background: repeating-linear-gradient(45deg, #FEF3C7, #FEF3C7 6px, #FDE68A 6px, #FDE68A 12px); border-style: dashed; border-color: #B45309; color: #78350F; font-size: .8rem; line-height: 1.05; flex-direction: column; gap: 1px; }
.pt-mc.found { background: #BBF7D0; animation: pt-pop .6s ease-out; }
.pt-mc.found.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #1D4ED8; }
.pt-mc.gap.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #B45309; }
.pt-mrow { display: flex; gap: 2px; width: 100%; height: 100%; }
.pt-mrow button { flex: 1; min-width: 0; min-height: 44px; font-size: clamp(.7rem, 2.8cqw, 1.05rem) !important; border: 0; background: transparent; font: inherit; color: inherit; border-radius: 7px; }
.pt-mrow button.sel { background: #fff; box-shadow: inset 0 0 0 2px #1D4ED8; }
.pt-mrow button:hover { background: rgba(255,255,255,.55); }
.pt-vs { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: .9rem; }
.pt-vs th, .pt-vs td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; }
.pt-vs th { color: var(--ink-2); font-size: .76rem; }
.pt-vs td.ok { color: var(--good); font-weight: 700; }
.pt-leg2 { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; font-size: .8rem; }
@keyframes pt-spin { to { transform: rotate(360deg); } }
@keyframes pt-pulse { 0%, 100% { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #FF7A1A; } 50% { box-shadow: 0 0 0 2px #fff, 0 0 0 7px rgba(255,122,26,.45); } }
@keyframes pt-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes pt-pop { 0% { transform: scale(.4); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .pt-orb, .pt-c.foc, .pt-anim .pt-bar, .pt-mc.found { animation: none !important; } .pt * { transition: none !important; } }
@container (min-width: 520px) { .pt-c i { display: block; } .pt-c u { display: block; } .pt-c b { font-size: clamp(11px, 2.6cqw, 20px); } .pt-gh, .pt-ph { font-size: 11px; } }
@container (min-width: 700px) { .pt-cardbody { grid-template-columns: 230px 1fr; } .pt-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (min-width: 1000px) { .pt-modern { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: start; } .pt-modern .pt-card { margin-top: 0; position: sticky; top: 8px; } .pt-cardbody { grid-template-columns: 1fr !important; } .pt-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }`;

  const T = (en, hi) => ({ en, hi });

  // ---- Data: Z 1 to 54. [symbol, English name, Hindi name, atomic mass, electronegativity (Pauling), first ionisation
  // energy kJ/mol, covalent radius pm]. Noble gases He, Ne, Ar have no electronegativity; the covalent radius is not
  // comparable for noble gases, so their size is left out of the size trend.
  const RAW = [
    ['H', 'Hydrogen', 'हाइड्रोजन', 1.008, 2.20, 1312, 31], ['He', 'Helium', 'हीलियम', 4.003, null, 2372, null],
    ['Li', 'Lithium', 'लिथियम', 6.94, 0.98, 520, 128], ['Be', 'Beryllium', 'बेरिलियम', 9.012, 1.57, 900, 96],
    ['B', 'Boron', 'बोरॉन', 10.81, 2.04, 801, 84], ['C', 'Carbon', 'कार्बन', 12.011, 2.55, 1086, 76],
    ['N', 'Nitrogen', 'नाइट्रोजन', 14.007, 3.04, 1402, 71], ['O', 'Oxygen', 'ऑक्सीजन', 15.999, 3.44, 1314, 66],
    ['F', 'Fluorine', 'फ़्लुओरीन', 18.998, 3.98, 1681, 57], ['Ne', 'Neon', 'नियॉन', 20.18, null, 2081, null],
    ['Na', 'Sodium', 'सोडियम', 22.99, 0.93, 496, 166], ['Mg', 'Magnesium', 'मैग्नीशियम', 24.305, 1.31, 738, 141],
    ['Al', 'Aluminium', 'ऐलुमिनियम', 26.982, 1.61, 578, 121], ['Si', 'Silicon', 'सिलिकॉन', 28.085, 1.90, 787, 111],
    ['P', 'Phosphorus', 'फ़ॉस्फ़ोरस', 30.974, 2.19, 1012, 107], ['S', 'Sulphur', 'सल्फ़र (गंधक)', 32.06, 2.58, 1000, 105],
    ['Cl', 'Chlorine', 'क्लोरीन', 35.45, 3.16, 1251, 102], ['Ar', 'Argon', 'आर्गन', 39.948, null, 1521, null],
    ['K', 'Potassium', 'पोटैशियम', 39.098, 0.82, 419, 203], ['Ca', 'Calcium', 'कैल्शियम', 40.078, 1.00, 590, 176],
    ['Sc', 'Scandium', 'स्कैंडियम', 44.956, 1.36, 633, 170], ['Ti', 'Titanium', 'टाइटेनियम', 47.867, 1.54, 659, 160],
    ['V', 'Vanadium', 'वैनेडियम', 50.942, 1.63, 651, 153], ['Cr', 'Chromium', 'क्रोमियम', 51.996, 1.66, 653, 139],
    ['Mn', 'Manganese', 'मैंगनीज़', 54.938, 1.55, 717, 139], ['Fe', 'Iron', 'आयरन (लोहा)', 55.845, 1.83, 763, 132],
    ['Co', 'Cobalt', 'कोबाल्ट', 58.933, 1.88, 760, 126], ['Ni', 'Nickel', 'निकेल', 58.693, 1.91, 737, 124],
    ['Cu', 'Copper', 'कॉपर (ताँबा)', 63.546, 1.90, 745, 132], ['Zn', 'Zinc', 'ज़िंक (जस्ता)', 65.38, 1.65, 906, 122],
    ['Ga', 'Gallium', 'गैलियम', 69.723, 1.81, 579, 122], ['Ge', 'Germanium', 'जर्मेनियम', 72.63, 2.01, 762, 120],
    ['As', 'Arsenic', 'आर्सेनिक', 74.922, 2.18, 947, 119], ['Se', 'Selenium', 'सेलेनियम', 78.971, 2.55, 941, 120],
    ['Br', 'Bromine', 'ब्रोमीन', 79.904, 2.96, 1140, 120], ['Kr', 'Krypton', 'क्रिप्टन', 83.798, 3.00, 1351, 116],
    ['Rb', 'Rubidium', 'रुबिडियम', 85.468, 0.82, 403, 220], ['Sr', 'Strontium', 'स्ट्रॉन्शियम', 87.62, 0.95, 550, 195],
    ['Y', 'Yttrium', 'इट्रियम', 88.906, 1.22, 600, 190], ['Zr', 'Zirconium', 'ज़िरकोनियम', 91.224, 1.33, 640, 175],
    ['Nb', 'Niobium', 'नायोबियम', 92.906, 1.60, 652, 164], ['Mo', 'Molybdenum', 'मॉलिब्डेनम', 95.95, 2.16, 684, 154],
    ['Tc', 'Technetium', 'टेक्नीशियम', 98, 1.90, 702, 147], ['Ru', 'Ruthenium', 'रूथेनियम', 101.07, 2.20, 710, 146],
    ['Rh', 'Rhodium', 'रोडियम', 102.906, 2.28, 720, 142], ['Pd', 'Palladium', 'पैलेडियम', 106.42, 2.20, 804, 139],
    ['Ag', 'Silver', 'चाँदी (सिल्वर)', 107.868, 1.93, 731, 145], ['Cd', 'Cadmium', 'कैडमियम', 112.414, 1.69, 868, 144],
    ['In', 'Indium', 'इंडियम', 114.818, 1.78, 558, 142], ['Sn', 'Tin', 'टिन (राँगा)', 118.71, 1.96, 709, 139],
    ['Sb', 'Antimony', 'ऐंटीमनी', 121.76, 2.05, 834, 139], ['Te', 'Tellurium', 'टेल्यूरियम', 127.6, 2.10, 869, 138],
    ['I', 'Iodine', 'आयोडीन', 126.904, 2.66, 1008, 139], ['Xe', 'Xenon', 'ज़ेनॉन', 131.293, 2.60, 1170, 140],
  ];
  // Electron shells for the elements whose filling is not the plain 2, 8, 8 / 18 pattern (the d-block).
  const SHELL_D = { 21: [2, 8, 9, 2], 22: [2, 8, 10, 2], 23: [2, 8, 11, 2], 24: [2, 8, 13, 1], 25: [2, 8, 13, 2], 26: [2, 8, 14, 2], 27: [2, 8, 15, 2], 28: [2, 8, 16, 2], 29: [2, 8, 18, 1], 30: [2, 8, 18, 2],
    39: [2, 8, 18, 9, 2], 40: [2, 8, 18, 10, 2], 41: [2, 8, 18, 12, 1], 42: [2, 8, 18, 13, 1], 43: [2, 8, 18, 13, 2], 44: [2, 8, 18, 15, 1], 45: [2, 8, 18, 16, 1], 46: [2, 8, 18, 18], 47: [2, 8, 18, 18, 1], 48: [2, 8, 18, 18, 2] };
  const shellsOf = (z) => (SHELL_D[z] ? SHELL_D[z].slice()
    : z <= 2 ? [z] : z <= 10 ? [2, z - 2] : z <= 18 ? [2, 8, z - 10] : z <= 20 ? [2, 8, 8, z - 18]
      : z <= 36 ? [2, 8, 18, z - 28] : z <= 38 ? [2, 8, 18, 8, z - 36] : [2, 8, 18, 18, z - 46]);
  const periodOf = (z) => (z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : 5);
  const groupOf = (z) => { if (z === 1) return 1; if (z === 2) return 18; const o = z <= 10 ? z - 2 : z <= 18 ? z - 10 : z <= 36 ? z - 18 : z - 36; return (z <= 18 && o > 2) ? o + 10 : o; };
  const METALLOID = ['B', 'Si', 'Ge', 'As', 'Sb', 'Te'];
  const POST = ['Al', 'Ga', 'In', 'Sn'];
  const GAS = [1, 2, 7, 8, 9, 10, 17, 18, 36, 54];
  // Usual valencies of the d-block elements (they vary; these are the common ones).
  const DVAL = { Sc: [3], Ti: [4], V: [5], Cr: [3], Mn: [2], Fe: [2, 3], Co: [2, 3], Ni: [2], Cu: [1, 2], Zn: [2], Y: [3], Zr: [4], Nb: [5], Mo: [6], Tc: [7], Ru: [3], Rh: [3], Pd: [2], Ag: [1], Cd: [2] };
  const MAINVAL = { 1: 1, 2: 2, 13: 3, 14: 4, 15: 3, 16: 2, 17: 1, 18: 0 };
  // Metallic character is shown on a teaching scale 0 to 100, built from the textbook rule (it falls across a period
  // and rises down a group); it is not a measured quantity. The d-block elements are all metals, so they sit together.
  const METBASE = { 1: 84, 2: 72, 13: 50, 14: 34, 15: 22, 16: 12, 17: 4, 18: 0 };

  const E = RAW.map((r, i) => {
    const z = i + 1, p = periodOf(z), g = groupOf(z), sh = shellsOf(z);
    const d = g >= 3 && g <= 12;
    let fam;
    if (z === 1) fam = 'nonmetal'; else if (g === 1) fam = 'alkali'; else if (g === 2) fam = 'alkaline'; else if (d) fam = 'transition';
    else if (METALLOID.includes(r[0])) fam = 'metalloid'; else if (POST.includes(r[0])) fam = 'post'; else if (g === 17) fam = 'halogen'; else if (g === 18) fam = 'noble'; else fam = 'nonmetal';
    const cls = (fam === 'metalloid') ? 'metalloid' : (['nonmetal', 'halogen', 'noble'].includes(fam) ? 'nonmetal' : 'metal');
    const blk = d ? 'd' : (g <= 2 || z === 2) ? 's' : 'p';
    const val = d ? null : (z === 1 ? 1 : MAINVAL[g]);
    const vel = d ? sh[sh.length - 1] : (z === 2 ? 2 : g <= 2 ? g : g - 10);
    let met = 0;
    if (z === 1) met = 18; else if (g === 18) met = 0; else if (d) met = 66 + 4 * (p - 4); else met = Math.min(100, METBASE[g] + 6 * (p - 2));
    return { z, sym: r[0], name: T(r[1], r[2]), mass: r[3], en: r[4], ie: r[5], r: r[6], p, g, sh, fam, cls, blk, val, vel, met,
      state: z === 35 ? 'liquid' : GAS.includes(z) ? 'gas' : 'solid', dval: DVAL[r[0]] || null };
  });
  const BYSYM = Object.fromEntries(E.map((e) => [e.sym, e]));
  const SYMS = E.map((e) => e.sym);

  const FAM = {
    alkali: { c: '#FDA4AF', n: T('Alkali metals', 'क्षार धातुएँ') }, alkaline: { c: '#FDBA74', n: T('Alkaline earth metals', 'क्षारीय मृदा धातुएँ') },
    transition: { c: '#93C5FD', n: T('Transition metals', 'संक्रमण धातुएँ') }, post: { c: '#C4B5FD', n: T('Other metals', 'अन्य धातुएँ') },
    metalloid: { c: '#FDE047', n: T('Metalloids', 'उपधातुएँ') }, nonmetal: { c: '#86EFAC', n: T('Non-metals', 'अधातुएँ') },
    halogen: { c: '#5EEAD4', n: T('Halogens', 'हैलोजन') }, noble: { c: '#E9D5FF', n: T('Noble gases', 'उत्कृष्ट गैसें') },
  };
  const CLS = { metal: { c: '#93C5FD', n: T('Metals', 'धातुएँ') }, metalloid: { c: '#FDE047', n: T('Metalloids', 'उपधातुएँ') }, nonmetal: { c: '#86EFAC', n: T('Non-metals', 'अधातुएँ') } };
  const BLK = { s: { c: '#FDBA74', n: T('s-block', 's-ब्लॉक') }, p: { c: '#86EFAC', n: T('p-block', 'p-ब्लॉक') }, d: { c: '#93C5FD', n: T('d-block', 'd-ब्लॉक') } };
  const PER = ['#BFDBFE', '#A7F3D0', '#FDE68A', '#FBCFE8', '#DDD6FE'];
  const grpColour = (g) => `hsl(${Math.round((g - 1) * 20)}, 78%, 76%)`;
  const GRPNAME = { 1: T('Alkali metals', 'क्षार धातुएँ'), 2: T('Alkaline earth metals', 'क्षारीय मृदा धातुएँ'), 13: T('Boron family', 'बोरॉन परिवार'), 14: T('Carbon family', 'कार्बन परिवार'),
    15: T('Nitrogen family', 'नाइट्रोजन परिवार'), 16: T('Oxygen family', 'ऑक्सीजन परिवार'), 17: T('Halogens', 'हैलोजन'), 18: T('Noble gases', 'उत्कृष्ट गैसें') };
  const grpName = (e) => (e.sym === 'H' ? T('Group 1 (hydrogen is special)', 'समूह 1 (हाइड्रोजन विशेष है)') : GRPNAME[e.g] || T('Transition elements', 'संक्रमण तत्व'));
  const STATE = { gas: T('Gas', 'गैस'), liquid: T('Liquid', 'द्रव'), solid: T('Solid', 'ठोस') };
  const FACT = {
    1: T('The lightest element, and the fuel of the Sun.', 'सबसे हल्का तत्व, और सूर्य का ईंधन।'), 2: T('Fills balloons: it is light and does not burn.', 'गुब्बारों में भरी जाती है: हल्की है और जलती नहीं।'),
    3: T('Used in rechargeable batteries.', 'रिचार्जेबल बैटरियों में काम आता है।'), 6: T('Found in coal, diamond and all living things.', 'कोयले, हीरे और सभी जीवों में मिलता है।'),
    7: T('About four-fifths of the air we breathe.', 'हमारी साँस की हवा का लगभग चार-पाँचवाँ भाग।'), 8: T('We need it to breathe, and for things to burn.', 'साँस लेने और चीज़ें जलने के लिए ज़रूरी।'),
    9: T('Fluoride in toothpaste helps protect teeth.', 'टूथपेस्ट का फ़्लुओराइड दाँतों की रक्षा करता है।'), 10: T('Glows red-orange in advertising signs.', 'विज्ञापन-बोर्डों में लाल-नारंगी चमकती है।'),
    11: T('A soft metal that reacts fiercely with water, so it is kept in kerosene.', 'नरम धातु, पानी से तेज़ अभिक्रिया करती है, इसलिए मिट्टी के तेल में रखी जाती है।'),
    12: T('Burns with a dazzling white flame.', 'चमकदार सफ़ेद लौ के साथ जलता है।'), 13: T('A light metal used for foil, pans and aeroplanes.', 'हल्की धातु; पन्नी, बर्तन और हवाई जहाज़ में काम आती है।'),
    14: T('Sand and computer chips are made from it.', 'रेत और कंप्यूटर चिप इससे बनते हैं।'), 16: T('A yellow solid, called gandhak in Hindi.', 'पीला ठोस, जिसे हिंदी में गंधक कहते हैं।'),
    17: T('Used to make drinking water safe.', 'पीने का पानी सुरक्षित करने में काम आती है।'), 18: T('Fills electric bulbs so the thin wire does not burn.', 'बिजली के बल्बों में भरी जाती है ताकि पतला तार न जले।'),
    19: T('Plants need it; it is in fertilisers.', 'पौधों को चाहिए; उर्वरकों में मिलता है।'), 20: T('Makes bones and teeth strong.', 'हड्डियों और दाँतों को मज़बूत बनाता है।'),
    26: T('Iron: used for tools, bridges and trains.', 'लोहा: औज़ार, पुल और रेल में काम आता है।'), 29: T('A reddish metal used in wires and utensils.', 'लाल-भूरी धातु; तार और बर्तनों में काम आती है।'),
    30: T('Coats iron to stop rust (galvanising).', 'लोहे पर चढ़ाकर जंग रोकता है (जस्तीकरण)।'), 35: T('The only non-metal that is a liquid at room temperature.', 'कमरे के ताप पर द्रव मिलने वाला एकमात्र अधातु।'),
    47: T('A shiny metal used in jewellery and coins.', 'चमकदार धातु; गहनों और सिक्कों में काम आती है।'), 50: T('A tin coat protects food cans.', 'टिन की परत डिब्बों की रक्षा करती है।'),
    53: T('Iodised salt gives our body iodine.', 'आयोडीन युक्त नमक हमारे शरीर को आयोडीन देता है।'),
  };

  const band = (v) => (v >= 80 ? T('Very high', 'बहुत अधिक') : v >= 60 ? T('High', 'अधिक') : v >= 40 ? T('Medium', 'मध्यम') : v >= 20 ? T('Low', 'कम') : T('Very low', 'बहुत कम'));
  const TREND = {
    size: { name: T('Atomic size', 'परमाणु का आकार'), get: (e) => e.r, fmt: (v) => v + ' pm', lo: T('small', 'छोटा'), hi: T('large', 'बड़ा'),
      across: T('gets smaller', 'छोटा होता जाता है'), down: T('gets bigger', 'बड़ा होता जाता है'),
      why: T('Across a period, more protons pull the same shell in tighter. Down a group, each element has one more shell.', 'आवर्त में दाएँ जाने पर प्रोटॉन बढ़ते हैं और वही कोश कसकर खिंचता है। समूह में नीचे जाने पर एक कोश और जुड़ जाता है।'),
      note: T('Size here is the covalent radius. Noble gases are grey: their sizes are measured another way and cannot be compared fairly.', 'यहाँ आकार सहसंयोजक त्रिज्या है। उत्कृष्ट गैसें धूसर हैं: उनका आकार दूसरी विधि से मापा जाता है, इसलिए तुलना ठीक नहीं।') },
    metallic: { name: T('Metallic character', 'धात्विक गुण'), get: (e) => e.met, fmt: (v) => api0t(band(v)), lo: T('weak', 'कम'), hi: T('strong', 'अधिक'),
      across: T('gets weaker', 'घटता जाता है'), down: T('gets stronger', 'बढ़ता जाता है'),
      why: T('Metals lose electrons easily. Atoms on the left have few outer electrons to lose; atoms lower down hold them more loosely.', 'धातुएँ इलेक्ट्रॉन आसानी से त्यागती हैं। बाईं ओर के परमाणुओं में त्यागने को कम इलेक्ट्रॉन होते हैं; नीचे के परमाणु उन्हें ढीला पकड़ते हैं।'),
      note: T('This is a teaching scale from very low to very high, not a measured number.', 'यह बहुत कम से बहुत अधिक तक की सीखने की पैमाना-रेखा है, मापा हुआ अंक नहीं।') },
    electronegativity: { name: T('Electronegativity', 'विद्युत ऋणात्मकता'), get: (e) => e.en, fmt: (v) => v.toFixed(2), lo: T('low', 'कम'), hi: T('high', 'अधिक'),
      across: T('gets higher', 'बढ़ती जाती है'), down: T('gets lower', 'घटती जाती है'),
      why: T('A small atom with many protons pulls shared electrons hard. Fluorine is the strongest puller.', 'अधिक प्रोटॉन वाला छोटा परमाणु साझे इलेक्ट्रॉनों को ज़ोर से खींचता है। फ़्लुओरीन सबसे ज़ोर से खींचता है।'),
      note: T('Pauling scale. Helium, neon and argon have no value, so they are grey.', 'पॉलिंग पैमाना। हीलियम, नियॉन और आर्गन का मान नहीं है, इसलिए वे धूसर हैं।') },
    ionisation: { name: T('Ionisation energy', 'आयनन ऊर्जा'), get: (e) => e.ie, fmt: (v) => v + ' kJ/mol', lo: T('low', 'कम'), hi: T('high', 'अधिक'),
      across: T('rises (with small dips)', 'बढ़ती है (छोटी गिरावटों के साथ)'), down: T('falls', 'घटती जाती है'),
      why: T('It is the energy to remove the outermost electron. It is harder in a small atom, easier in a big one.', 'यह सबसे बाहरी इलेक्ट्रॉन निकालने की ऊर्जा है। छोटे परमाणु में यह कठिन है, बड़े में आसान।'),
      note: T('First ionisation energy. Small dips: Be to B, and N to O, because of how the electrons are arranged.', 'पहली आयनन ऊर्जा। छोटी गिरावट: Be से B और N से O पर, इलेक्ट्रॉनों की व्यवस्था के कारण।') },
    valency: { name: T('Valency', 'संयोजकता'), get: (e) => e.val, fmt: (v) => String(v), lo: T('0', '0'), hi: T('4', '4'),
      across: T('goes 1, 2, 3, 4, 3, 2, 1, 0', '1, 2, 3, 4, 3, 2, 1, 0 होती है'), down: T('stays the same in a group', 'समूह में वही रहती है'),
      why: T('Valency is how many electrons an atom gains, loses or shares to get a full outer shell.', 'संयोजकता वह संख्या है जितने इलेक्ट्रॉन परमाणु पूरा बाहरी कोश पाने के लिए लेता, देता या साझा करता है।'),
      note: T('Transition elements show several valencies, so they are grey.', 'संक्रमण तत्व कई संयोजकताएँ दिखाते हैं, इसलिए वे धूसर हैं।') },
  };
  let api0t = (x) => L.tx(x, 'en');

  const HIST = {
    dobereiner: { n: T('Döbereiner', 'डोबेराइनर'), s: T('1829 · triads', '1829 · त्रिक') },
    newlands: { n: T('Newlands', 'न्यूलैंड्स'), s: T('1865 · octaves', '1865 · अष्टक') },
    mendeleev: { n: T('Mendeleev', 'मेंडेलीव'), s: T('1869 · gaps', '1869 · खाली स्थान') },
    modern: { n: T('Modern table', 'आधुनिक सारणी'), s: T('atomic number', 'परमाणु क्रमांक') },
  };
  const HIGHLIGHTS = ['families', 'groups', 'periods', 'metals', 'blocks'];
  const TRENDS = Object.keys(TREND);
  const HL_ALL = HIGHLIGHTS.concat(TRENDS.map((t) => 'trend:' + t));
  const HL_NAME = { families: T('Families', 'परिवार'), groups: T('Groups', 'समूह'), periods: T('Periods', 'आवर्त'), metals: T('Metals', 'धातु'), blocks: T('Blocks', 'ब्लॉक') };

  // Dobereiner's triads, with today's masses. Barium (Z 56) is past the table, so it is kept here.
  const BA = { sym: 'Ba', name: T('Barium', 'बेरियम'), mass: 137.33, fam: 'alkaline' };
  const TRIADS = [
    { syms: ['Li', 'Na', 'K'], like: T('Soft, shiny metals that react with water and make alkalis.', 'नरम, चमकीली धातुएँ जो पानी से अभिक्रिया करके क्षार बनाती हैं।') },
    { syms: ['Ca', 'Sr', 'Ba'], like: T('Similar metals whose compounds make lime-like, alkaline solutions.', 'मिलती-जुलती धातुएँ, जिनके यौगिक चूने जैसे क्षारीय विलयन बनाते हैं।') },
    { syms: ['S', 'Se', 'Te'], like: T('Non-metal-like solids that each combine with two hydrogen atoms.', 'अधातु जैसे ठोस, जो हर एक दो हाइड्रोजन परमाणुओं से जुड़ते हैं।') },
    { syms: ['Cl', 'Br', 'I'], like: T('Coloured halogens that react with metals to make salts.', 'रंगीन हैलोजन जो धातुओं से अभिक्रिया करके लवण बनाते हैं।') },
  ];
  const triadEl = (s) => (s === 'Ba' ? BA : BYSYM[s]);

  // Newlands' table of 1865, 7 columns (his "Do Re Mi Fa So La Ti"). Newlands wrote G for beryllium and Bo for boron.
  // fit: does the element resemble the others in its column? (yes / part / no), judged by today's groups.
  const NL = [['H', 'part'], ['Li', 'yes'], ['Be', 'yes'], ['B', 'yes'], ['C', 'yes'], ['N', 'yes'], ['O', 'yes'],
    ['F', 'yes'], ['Na', 'yes'], ['Mg', 'yes'], ['Al', 'yes'], ['Si', 'yes'], ['P', 'yes'], ['S', 'yes'],
    ['Cl', 'yes'], ['K', 'yes'], ['Ca', 'yes'], ['Cr', 'no'], ['Ti', 'part'], ['Mn', 'no'], ['Fe', 'no'],
    ['Co,Ni', 'no'], ['Cu', 'no'], ['Zn', 'part'], ['Y', 'part'], ['In', 'no'], ['As', 'yes'], ['Se', 'yes'],
    ['Br', 'yes'], ['Rb', 'yes'], ['Sr', 'yes'], ['Ce,La', 'no'], ['Zr', 'part'], ['Di,Mo', 'no'], ['Rh,Ru', 'no']].map((c, i) => ({ n: i + 1, syms: c[0].split(','), fit: c[1] }));
  const NOTES = ['Do', 'Re', 'Mi', 'Fa', 'So', 'La', 'Ti'];

  // Mendeleev's table of 1871: eight groups (I to VIII), seven series. "gap" cells were empty spaces he predicted.
  const MEND = [
    ['H'], ['Li', 'Be', 'B', 'C', 'N', 'O', 'F'], ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl'],
    ['K', 'Ca', 'gap:Sc', 'Ti', 'V', 'Cr', 'Mn', ['Fe', 'Co', 'Ni']], ['Cu', 'Zn', 'gap:Ga', 'gap:Ge', 'As', 'Se', 'Br'],
    ['Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'gap:Tc', ['Ru', 'Rh', 'Pd']], ['Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I'],
  ];
  const GAPS = {
    Sc: { eka: T('eka-boron', 'एका-बोरॉन'), ek: T('eka-B', 'एका-B'), year: 1879, rows: [[T('Atomic mass', 'परमाणु द्रव्यमान'), '44', '44.96'], [T('Oxide', 'ऑक्साइड'), 'Eb₂O₃', 'Sc₂O₃']], sentence: T('He said an unknown metal sits below boron, with mass about 44 and an oxide Eb₂O₃. Scandium was found in 1879, and fits.', 'उसने कहा कि बोरॉन के नीचे एक अज्ञात धातु है, जिसका द्रव्यमान लगभग 44 और ऑक्साइड Eb₂O₃ होगा। 1879 में स्कैंडियम मिला, और वह मेल खाता है।') },
    Ga: { eka: T('eka-aluminium', 'एका-ऐलुमिनियम'), ek: T('eka-Al', 'एका-Al'), year: 1875, rows: [[T('Atomic mass', 'परमाणु द्रव्यमान'), '68', '69.72'], [T('Density (g/cm³)', 'घनत्व (g/cm³)'), '5.9', '5.91'], [T('Oxide', 'ऑक्साइड'), 'Ea₂O₃', 'Ga₂O₃']], sentence: T('He said a metal below aluminium would be dense and melt easily. Gallium was found in 1875, and melts in your hand.', 'उसने कहा कि ऐलुमिनियम के नीचे की धातु भारी होगी और आसानी से पिघलेगी। 1875 में गैलियम मिला, जो हथेली की गर्मी से पिघल जाता है।') },
    Ge: { eka: T('eka-silicon', 'एका-सिलिकॉन'), ek: T('eka-Si', 'एका-Si'), year: 1886, rows: [[T('Atomic mass', 'परमाणु द्रव्यमान'), '72', '72.63'], [T('Density (g/cm³)', 'घनत्व (g/cm³)'), '5.5', '5.32'], [T('Oxide', 'ऑक्साइड'), 'EsO₂', 'GeO₂']], sentence: T('He described a grey element below silicon with valency 4. Germanium, found in 1886, matched closely.', 'उसने सिलिकॉन के नीचे के एक धूसर तत्व का वर्णन किया, जिसकी संयोजकता 4 है। 1886 में मिला जर्मेनियम लगभग ठीक मेल खाया।') },
    Tc: { eka: T('eka-manganese', 'एका-मैंगनीज़'), ek: T('eka-Mn', 'एका-Mn'), year: 1937, rows: [[T('Atomic mass', 'परमाणु द्रव्यमान'), '100', '98']], sentence: T('He left a gap below manganese. Technetium, the first element made by people in a laboratory, filled it in 1937.', 'उसने मैंगनीज़ के नीचे जगह खाली छोड़ी। 1937 में टेक्नीशियम ने उसे भरा, जो प्रयोगशाला में मनुष्यों द्वारा बनाया गया पहला तत्व है।') },
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  // ---- value helpers, shared by validate-free drawing
  function range(fn) { const v = E.map(fn).filter((x) => x != null); return [Math.min(...v), Math.max(...v)]; }
  const RANGES = {}; TRENDS.forEach((k) => { RANGES[k] = range(TREND[k].get); });

  function colourOf(e, hl) {
    if (hl.startsWith('trend:')) {
      const k = hl.slice(6), v = TREND[k].get(e);
      if (v == null) return { bg: '#E2E8F0', fg: '#475569' };
      const [lo, hi] = RANGES[k], t = (v - lo) / (hi - lo || 1);
      return { bg: mixHex('#F3E8FF', '#5B21B6', t), fg: t > 0.5 ? '#FFFFFF' : '#1E293B' };
    }
    const dark = '#1E293B';
    if (hl === 'groups') return { bg: grpColour(e.g), fg: dark };
    if (hl === 'periods') return { bg: PER[e.p - 1], fg: dark };
    if (hl === 'metals') return { bg: CLS[e.cls].c, fg: dark };
    if (hl === 'blocks') return { bg: BLK[e.blk].c, fg: dark };
    return { bg: FAM[e.fam].c, fg: dark };
  }
  const relatedTo = (a, b, hl) => (hl === 'groups' ? a.g === b.g : hl === 'periods' ? a.p === b.p : hl === 'metals' ? a.cls === b.cls : hl === 'blocks' ? a.blk === b.blk : hl === 'families' ? a.fam === b.fam : false);

  // ---- template
  function mount(root, cfg, api) {
    const t = (x) => api.t(x);
    api0t = (x) => api.t(x);
    cfg = cfg || {};
    const S = { hist: cfg.history || 'modern', hl: cfg.highlight || 'families', sel: cfg.focus && cfg.focus[0] ? BYSYM[cfg.focus[0]].z : null,
      triad: 0, nsel: null, reveal: false, gapSel: null, found: new Set(), msg: null, anim: true, tweenStop: null, lastKey: null };
    const focus = new Set(cfg.focus || []);
    const lang = () => (api.lang ? api.lang() : 'en');

    const elLabel = (e) => `${t(e.name)}, ${t(T('atomic number', 'परमाणु क्रमांक'))} ${e.z}`;
    const live = (m) => { S.msg = m; };

    function introMsg() {
      if (S.hist === 'dobereiner') return T('Döbereiner (1829) noticed groups of three similar elements. In each triad the middle element has about the average mass of the other two. Pick a triad.', 'डोबेराइनर (1829) ने तीन मिलते-जुलते तत्वों के समूह देखे। हर त्रिक में बीच के तत्व का द्रव्यमान बाकी दोनों के औसत के लगभग बराबर है। कोई त्रिक चुनो।');
      if (S.hist === 'newlands') return T('Newlands (1865) lined up elements by mass and saw every eighth one repeat, like notes in music. Tap an element.', 'न्यूलैंड्स (1865) ने तत्वों को द्रव्यमान से सजाया और देखा कि हर आठवाँ तत्व दोहराता है, जैसे संगीत के सुर। किसी तत्व पर टैप करो।');
      if (S.hist === 'mendeleev') return T('Mendeleev (1869) left gaps for elements nobody had found. Tap a gap to see what he predicted.', 'मेंडेलीव (1869) ने उन तत्वों के लिए खाली जगह छोड़ी जो अभी खोजे नहीं गए थे। खाली जगह पर टैप करके देखो उसने क्या अनुमान लगाया।');
      if (S.hl.startsWith('trend:')) { const k = TREND[S.hl.slice(6)]; return { en: `${k.name.en}: across a period it ${k.across.en}; down a group it ${k.down.en}.`, hi: `${k.name.hi}: आवर्त में दाएँ जाने पर ${k.across.hi}; समूह में नीचे जाने पर ${k.down.hi}।` }; }
      return T('Tap any element to see its atom. Try the colour buttons to find patterns.', 'किसी भी तत्व पर टैप करो और उसका परमाणु देखो। पैटर्न खोजने के लिए रंग वाले बटन आज़माओ।');
    }

    // --- parts
    function tabs() {
      return `<div class="pt-tabs" role="group" aria-label="${esc(t(T('How the table was found', 'सारणी कैसे बनी')))}">${Object.keys(HIST).map((h) =>
        `<button type="button" class="pt-tab" data-key="history:${h}" aria-pressed="${S.hist === h}">${esc(t(HIST[h].n))}<small>${esc(t(HIST[h].s))}</small></button>`).join('')}</div>`;
    }
    function chips() {
      const hlBtn = (h) => `<button type="button" class="pt-chip" data-key="highlight:${h}" aria-pressed="${S.hl === h}">${esc(t(HL_NAME[h]))}</button>`;
      const trBtn = (k) => `<button type="button" class="pt-chip" data-key="trend:${k}" aria-pressed="${S.hl === 'trend:' + k}">${esc(t(TREND[k].name))}</button>`;
      return `<div class="pt-chips" role="group" aria-label="${esc(t(T('Colour the table by', 'सारणी को इससे रंगो')))}"><span class="pt-lbl">${esc(t(T('Colour by', 'रंग')))}</span>${HIGHLIGHTS.map(hlBtn).join('')}</div>
        <div class="pt-chips" role="group" aria-label="${esc(t(T('Trends', 'रुझान')))}"><span class="pt-lbl">${esc(t(T('Trend', 'रुझान')))}</span>${TRENDS.map(trBtn).join('')}</div>`;
    }
    function gridHTML() {
      const sel = S.sel ? E[S.sel - 1] : null, hl = S.hl;
      const cells = E.map((e) => {
        const c = colourOf(e, hl);
        const isSel = sel && sel.z === e.z;
        let dim = false, rel = false;
        if (sel && !hl.startsWith('trend:')) { rel = !isSel && relatedTo(sel, e, hl); dim = !isSel && !rel; }
        else if (focus.size && !focus.has(e.sym) && !isSel) dim = true;
        const v = hl.startsWith('trend:') ? TREND[hl.slice(6)].get(e) : null;
        const vt = hl.startsWith('trend:') ? (v == null ? '–' : hl === 'trend:metallic' ? '' : hl === 'trend:size' ? v : hl === 'trend:ionisation' ? v : hl === 'trend:electronegativity' ? v.toFixed(1) : v) : '';
        return `<button type="button" class="pt-c${isSel ? ' sel' : ''}${dim ? ' dim' : ''}${rel ? ' rel' : ''}${focus.has(e.sym) ? ' foc' : ''}" data-key="element:${e.sym}" aria-pressed="${!!isSel}" aria-label="${esc(elLabel(e) + (hl.startsWith('trend:') ? ', ' + t(TREND[hl.slice(6)].name) + ' ' + (v == null ? t(T('no value', 'मान नहीं')) : hl === 'trend:metallic' ? t(band(v)) : TREND[hl.slice(6)].fmt(v)) : ''))}" style="grid-row:${e.p + 1};grid-column:${e.g + 1};background:${c.bg};color:${c.fg}"><i>${e.z}</i><b>${esc(e.sym)}</b>${vt !== '' ? `<u>${esc(vt)}</u>` : ''}</button>`;
      }).join('');
      const heads = Array.from({ length: 18 }, (_, i) => `<div class="pt-gh${sel && sel.g === i + 1 ? ' on' : ''}" style="grid-row:1;grid-column:${i + 2}" aria-hidden="true">${i + 1}</div>`).join('');
      const pheads = Array.from({ length: 5 }, (_, i) => `<div class="pt-ph${sel && sel.p === i + 1 ? ' on' : ''}" style="grid-row:${i + 2};grid-column:1" aria-hidden="true">${i + 1}</div>`).join('');
      let gapNote = '';
      if (hl.startsWith('trend:')) {
        const k = TREND[hl.slice(6)];
        gapNote = `<div class="pt-note-cell"><span>→ ${esc(t(T('Across a period:', 'आवर्त में दाएँ:')))} ${esc(t(k.across))}</span><span>↓ ${esc(t(T('Down a group:', 'समूह में नीचे:')))} ${esc(t(k.down))}</span></div>`;
      }
      return `<div class="pt-grid" role="group" aria-label="${esc(t(T('Periodic table, elements 1 to 54', 'आवर्त सारणी, तत्व 1 से 54')))}">${heads}${pheads}${gapNote}${cells}</div>`;
    }
    function legendHTML() {
      const hl = S.hl;
      let items;
      if (hl.startsWith('trend:')) {
        const k = hl.slice(6), tr = TREND[k], [lo, hi] = RANGES[k];
        const fmt = (v) => (k === 'metallic' ? t(band(v)) : tr.fmt(k === 'electronegativity' ? +v.toFixed(2) : v));
        return `<div class="pt-legend"><span>${esc(fmt(lo))}</span><span class="pt-scale" role="img" aria-label="${esc(t(tr.name))}: ${esc(t(T('light to dark', 'हल्का से गहरा')))} = ${esc(t(tr.lo))} → ${esc(t(tr.hi))}"></span><span>${esc(fmt(hi))}</span><span class="sw"><em style="background:#E2E8F0"></em>${esc(t(T('no value', 'मान नहीं')))}</span></div>`;
      }
      if (hl === 'groups') return `<div class="pt-legend"><span>${esc(t(T('Each column is a group. Same colour = same group = similar behaviour.', 'हर स्तंभ एक समूह है। एक रंग = एक समूह = मिलता-जुलता व्यवहार।')))}</span></div>`;
      if (hl === 'periods') items = PER.map((c, i) => [c, T(`Period ${i + 1}: ${i + 1} shell${i ? 's' : ''}`, `आवर्त ${i + 1}: ${i + 1} कोश`)]);
      else if (hl === 'metals') items = Object.values(CLS).map((x) => [x.c, x.n]);
      else if (hl === 'blocks') items = Object.values(BLK).map((x) => [x.c, x.n]);
      else items = Object.values(FAM).map((x) => [x.c, x.n]);
      return `<div class="pt-legend">${items.map((i) => `<span class="sw"><em style="background:${i[0]}"></em>${esc(t(i[1]))}</span>`).join('')}</div>`;
    }
    function chartHTML() {
      if (!S.hl.startsWith('trend:')) return '';
      const k = S.hl.slice(6), tr = TREND[k], [lo, hi] = RANGES[k];
      const W = 540, H = 110, bw = 8, top = 8;
      const bars = E.map((e, i) => {
        const v = tr.get(e), x = 6 + i * 9.8;
        if (v == null) return `<circle cx="${x + bw / 2}" cy="${H - 4}" r="2" fill="#94A3B8"/>`;
        const h = 6 + ((v - lo) / (hi - lo || 1)) * (H - top - 8), isSel = S.sel === e.z;
        return `<rect class="pt-bar" x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="2" fill="${isSel ? '#FF7A1A' : e.p % 2 ? '#7C3AED' : '#F5B90A'}" opacity="${isSel ? 1 : 0.85}" style="animation-delay:${i * 8}ms"/>`;
      }).join('');
      const seps = [2, 10, 18, 36].map((z) => `<line x1="${6 + z * 9.8 - 1}" x2="${6 + z * 9.8 - 1}" y1="0" y2="${H}" stroke="#94A3B8" stroke-dasharray="3 3"/>`).join('');
      const labs = [[0, 'H'], [2, 'Li'], [10, 'Na'], [18, 'K'], [36, 'Rb'], [53, 'Xe']].map(([i, s]) => `<text x="${6 + i * 9.8 + 4}" y="${H + 13}" text-anchor="middle" font-size="10" fill="currentColor" font-family="var(--font-body)">${s}</text>`).join('');
      return `<div class="pt-chart"><svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${esc(t(tr.name))}, ${esc(t(T('for elements 1 to 54. The pattern repeats in every period.', 'तत्व 1 से 54 के लिए। हर आवर्त में पैटर्न दोहराता है।')))}">${seps}${bars}${labs}</svg>
        <p>${esc(t(tr.why))} ${esc(t(tr.note))}</p></div>`;
    }

    function bohr(e) {
      const R = [20, 38, 56, 74, 92], col = FAM[e.fam].c;
      const rings = e.sh.map((n, i) => `<circle cx="100" cy="100" r="${R[i]}" fill="none" stroke="#94A3B8" stroke-width="1.2" stroke-dasharray="2 3"/>`).join('');
      const orbs = e.sh.map((n, i) => {
        const dots = Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n - Math.PI / 2; const outer = i === e.sh.length - 1; return `<circle cx="${(100 + R[i] * Math.cos(a)).toFixed(1)}" cy="${(100 + R[i] * Math.sin(a)).toFixed(1)}" r="${outer ? 4.2 : 3.6}" fill="${outer ? '#F5B90A' : '#2563EB'}" stroke="#fff" stroke-width="1"/>`; }).join('');
        return `<g class="pt-orb o${i + 1}">${dots}</g>`;
      }).join('');
      return `<svg class="pt-bohr" viewBox="0 0 200 200" role="img" aria-label="${esc(t(T('Electrons in shells', 'कोशों में इलेक्ट्रॉन')))}: ${e.sh.join(', ')}"><rect width="200" height="200" rx="18" fill="#0B1B4A"/>${rings}<circle cx="100" cy="100" r="13" fill="${col}" stroke="#fff" stroke-width="1.5"/><text x="100" y="105" text-anchor="middle" font-size="12" font-weight="800" fill="#1E293B" font-family="var(--font-display)">${e.z}+</text>${orbs}</svg>`;
    }
    function cardHTML() {
      if (!S.sel) return `<section class="pt-card pt-empty" aria-label="${esc(t(T('Element card', 'तत्व कार्ड')))}">${esc(t(T('Pick an element to see its atom here.', 'यहाँ परमाणु देखने के लिए कोई तत्व चुनो।')))}</section>`;
      const e = E[S.sel - 1], hl = S.hl.startsWith('trend:') ? S.hl.slice(6) : '';
      const c = FAM[e.fam].c;
      const valTxt = e.val != null ? String(e.val) : e.dval ? `${t(T('varies', 'बदलती है'))} (${e.dval.join(', ')})` : '';
      const stat = (id, label, val) => `<div class="pt-stat${hl && hl === id ? ' on' : ''}"><small>${esc(t(label))}</small><b>${esc(val)}</b></div>`;
      const stats = [
        stat('', T('Atomic mass', 'परमाणु द्रव्यमान'), e.mass),
        stat('', T('Group · Period', 'समूह · आवर्त'), `${e.g} · ${e.p}`),
        stat('', T('Electrons in shells', 'कोशों में इलेक्ट्रॉन'), e.sh.join(', ')),
        stat('', T('Outer electrons', 'बाहरी इलेक्ट्रॉन'), e.vel),
        stat('valency', T('Valency', 'संयोजकता'), valTxt),
        stat('size', T('Atomic size', 'परमाणु का आकार'), e.r == null ? t(T('not compared', 'तुलना नहीं')) : e.r + ' pm'),
        stat('metallic', T('Metallic character', 'धात्विक गुण'), t(band(e.met))),
        stat('electronegativity', T('Electronegativity', 'विद्युत ऋणात्मकता'), e.en == null ? t(T('no value', 'मान नहीं')) : e.en.toFixed(2)),
        stat('ionisation', T('Ionisation energy', 'आयनन ऊर्जा'), e.ie + ' kJ/mol'),
        stat('', T('Kind · State', 'प्रकार · अवस्था'), `${t(CLS[e.cls].n)} · ${t(STATE[e.state])}`),
      ].join('');
      const grp = `${t(T('Group', 'समूह'))} ${e.g}: ${t(grpName(e))}. ${t(T('Period', 'आवर्त'))} ${e.p} ${t(T('means', 'का अर्थ है'))} ${e.p} ${t(T(e.p === 1 ? 'shell' : 'shells', 'कोश'))}.`;
      return `<section class="pt-card" aria-label="${esc(t(T('Element card', 'तत्व कार्ड')))}: ${esc(t(e.name))}">
        <div class="pt-card-head"><div class="pt-tile" style="background:${c}"><i>${e.z}</i><b>${esc(e.sym)}</b></div>
          <div><h3>${esc(t(e.name))}</h3><div>${esc(t(T('Atomic number', 'परमाणु क्रमांक')))} ${e.z} · ${esc(t(FAM[e.fam].n))}</div></div>
          <div class="pt-step"><button type="button" data-key="step:prev" aria-label="${esc(t(T('Previous element', 'पिछला तत्व')))}">◀</button><button type="button" data-key="step:next" aria-label="${esc(t(T('Next element', 'अगला तत्व')))}">▶</button></div></div>
        <div class="pt-cardbody">${bohr(e)}<div class="pt-stats">${stats}</div></div>
        <p class="pt-fact"><b>${esc(grp)}</b>${FACT[e.z] ? ' ' + esc(t(FACT[e.z])) : ''}</p></section>`;
    }

    // --- views
    function modernView() {
      return `<div class="pt-modern"><div><div class="pt-board">${gridHTML()}</div>${legendHTML()}${chartHTML()}</div>${cardHTML()}</div>`;
    }
    function tilesFor(syms) {
      return `<div class="pt-tri">${syms.map((s) => {
        const e = triadEl(s), inTable = !!BYSYM[s], c = FAM[e.fam].c;
        const inner = `<b>${esc(e.sym)}</b><em>${esc(t(e.name))}</em><s>${esc(e.mass)}</s>`;
        return inTable ? `<button type="button" class="pt-tile${S.sel === e.z ? ' sel' : ''}" style="background:${c}" data-key="element:${s}" aria-label="${esc(elLabel(e))}, ${esc(t(T('mass', 'द्रव्यमान')))} ${e.mass}">${inner}</button>`
          : `<div class="pt-tile" style="background:${c}" role="group" aria-label="${esc(t(e.name))}, ${esc(t(T('mass', 'द्रव्यमान')))} ${e.mass}">${inner}</div>`;
      }).join('')}</div>`;
    }
    function lineSVG(a, b, c, k) {
      const lo = a - 6, hi = c + 6, X = (m) => 22 + ((m - lo) / (hi - lo)) * 276;
      const avg = (a + c) / 2, mk = X(a + (avg - a) * k);
      const dot = (m, col, lab, up) => `<circle cx="${X(m)}" cy="46" r="7" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${X(m)}" y="${up ? 26 : 74}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="var(--font-body)">${esc(lab)}</text>`;
      const [s1, s2, s3] = TRIADS[S.triad].syms, e2 = triadEl(s2);
      return `<svg viewBox="0 0 320 86" role="img" aria-label="${esc(t(T('Number line of atomic masses', 'परमाणु द्रव्यमानों की संख्या-रेखा')))}"><line x1="16" x2="304" y1="46" y2="46" stroke="#94A3B8" stroke-width="3" stroke-linecap="round"/>
        ${dot(a, '#2563EB', s1 + ' ' + a, true)}${dot(c, '#2563EB', s3 + ' ' + c, true)}${dot(e2.mass, '#14B8A6', s2 + ' ' + e2.mass, false)}
        <path d="M${mk} 30 l8 16 -8 16 -8 -16z" fill="#FF7A1A" stroke="#fff" stroke-width="1.5"/></svg>`;
    }
    function dobView() {
      const tr = TRIADS[S.triad], [a, b, c] = tr.syms.map((s) => triadEl(s)), avg = (a.mass + c.mass) / 2, diff = Math.abs(avg - b.mass);
      const picker = `<div class="pt-chips" role="group" aria-label="${esc(t(T('Triads', 'त्रिक')))}">${TRIADS.map((x, i) => `<button type="button" class="pt-chip" data-key="triad:${i + 1}" aria-pressed="${S.triad === i}">${esc(x.syms.join('–'))}</button>`).join('')}</div>`;
      return `<div class="pt-board" style="padding:10px">${picker}${tilesFor(tr.syms)}<div class="pt-line">${lineSVG(a.mass, b.mass, c.mass, S.k == null ? 1 : S.k)}</div></div>
        <p class="pt-live" style="margin-top:10px">(${a.mass} + ${c.mass}) ÷ 2 = <b>${avg.toFixed(2)}</b> ≈ ${esc(b.sym)} ${b.mass} (${esc(t(T('difference', 'अंतर')))} ${diff.toFixed(2)}). ${esc(t(tr.like))}</p>
        <p class="pt-fact" style="margin:0 2px 6px">${esc(t(T('But there were only a few triads, and many elements fit none. The idea was good but not enough.', 'पर केवल कुछ ही त्रिक थे और बहुत-से तत्व किसी में नहीं बैठते थे। विचार अच्छा था, पर काफ़ी नहीं।')))}</p>${S.sel ? cardHTML() : ''}`;
    }
    function nlView() {
      const sel = S.nsel ? NL[S.nsel - 1] : null;
      const part = (c) => sel && c.n !== sel.n && Math.abs(c.n - sel.n) % 7 === 0;
      const cellHTML = (c) => {
        const all = c.syms.every((s) => BYSYM[s]);
        const key = c.syms.length === 1 && BYSYM[c.syms[0]] ? `element:${c.syms[0]}` : `newlands:${c.n}`;
        const lab = c.syms.map((s) => (s === 'Di' ? 'Di' : s)).join(' ');
        const cls = ['pt-nc', sel && sel.n === c.n ? 'sel' : '', part(c) ? 'rel' : '', S.reveal ? 'fit-' + c.fit : 'plain', c.syms.some((s) => focus.has(s)) ? 'foc' : ''].join(' ');
        const mark = S.reveal ? `<u aria-hidden="true">${c.fit === 'yes' ? '✓' : c.fit === 'part' ? '~' : '✗'}</u>` : '';
        const nm = c.syms.map((s) => (BYSYM[s] ? t(BYSYM[s].name) : s)).join(' & ');
        return `<td><button type="button" class="${cls}" data-key="${key}" aria-pressed="${!!(sel && sel.n === c.n)}" aria-label="${esc(`${t(T('Number', 'क्रमांक'))} ${c.n}: ${nm}${S.reveal ? ', ' + t(c.fit === 'yes' ? T('fits its column', 'अपने स्तंभ में ठीक बैठता है') : c.fit === 'part' ? T('fits partly', 'आंशिक रूप से बैठता है') : T('does not fit', 'नहीं बैठता')) : ''}`)}"><i>${c.n}</i><b>${esc(lab)}</b>${mark}</button></td>`;
      };
      const rows = [0, 1, 2, 3, 4].map((r) => `<tr>${NL.slice(r * 7, r * 7 + 7).map(cellHTML).join('')}</tr>`).join('');
      return `<div class="pt-board" style="padding:8px"><table class="pt-table" aria-label="${esc(t(T("Newlands' table of 1865", 'न्यूलैंड्स की 1865 की सारणी')))}"><thead><tr>${NOTES.map((n) => `<th class="pt-nh" scope="col">${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
        <div class="pt-row"><button type="button" class="pt-btn" data-key="newlands:reveal" aria-pressed="${S.reveal}">${esc(t(S.reveal ? T('Hide the check', 'जाँच छिपाओ') : T('Check: does each fit?', 'जाँचो: क्या सब ठीक बैठते हैं?')))}</button></div>
        ${S.reveal ? `<div class="pt-leg2"><span>✓ ${esc(t(T('fits its column', 'स्तंभ में ठीक')))}</span><span>~ ${esc(t(T('fits partly', 'आंशिक')))}</span><span>✗ ${esc(t(T("does not fit", 'नहीं बैठता')))}</span></div>` : ''}</div>
        <p class="pt-fact" style="margin:10px 2px 6px">${esc(t(S.reveal ? T('The pattern works well up to calcium. After that it breaks: iron under oxygen and sulphur is wrong, no gaps were left for new elements, and the noble gases were not found yet.', 'यह पैटर्न कैल्शियम तक ठीक चलता है। उसके बाद टूट जाता है: ऑक्सीजन और सल्फ़र के नीचे आयरन ग़लत है, नए तत्वों के लिए जगह नहीं छोड़ी गई, और उत्कृष्ट गैसें अभी खोजी नहीं गई थीं।') : T('Newlands wrote G for beryllium and Bo for boron; here they have today\'s symbols.', 'न्यूलैंड्स ने बेरिलियम के लिए G और बोरॉन के लिए Bo लिखा था; यहाँ आज के प्रतीक दिए हैं।')))}</p>${S.sel ? cardHTML() : ''}`;
    }
    function mendView() {
      const cell = (x, ri, ci) => {
        if (Array.isArray(x)) return `<div class="pt-mc" style="padding:2px" role="group"><div class="pt-mrow">${x.map((s) => `<button type="button" class="${S.sel === BYSYM[s].z ? 'sel' : ''}" data-key="element:${s}" aria-label="${esc(elLabel(BYSYM[s]))}" style="font:800 1rem var(--font-display)">${s}</button>`).join('')}</div></div>`;
        const style = `style="grid-row:${ri + 2};grid-column:${ci + 2}"`;
        if (x.startsWith('gap:')) {
          const s = x.slice(4), g = GAPS[s], found = S.found.has(s);
          if (found) return `<button type="button" class="pt-mc found${S.sel === BYSYM[s].z ? ' sel' : ''}${focus.has(s) ? ' foc' : ''}" data-key="element:${s}" aria-label="${esc(elLabel(BYSYM[s]))}" ${style}>${s}</button>`;
          return `<button type="button" class="pt-mc gap${S.gapSel === s ? ' sel' : ''}" data-key="gap:${s}" aria-label="${esc(t(T('Empty space', 'खाली जगह')))}: ${esc(t(g.eka))}" ${style}><span>?</span><b>${esc(t(g.ek))}</b></button>`;
        }
        return `<button type="button" class="pt-mc${S.sel === BYSYM[x].z ? ' sel' : ''}${focus.has(x) ? ' foc' : ''}" data-key="element:${x}" aria-label="${esc(elLabel(BYSYM[x]))}" ${style}>${x}</button>`;
      };
      const body = MEND.map((row, ri) => row.map((x, ci) => (Array.isArray(x) ? `<div class="pt-mw" style="grid-row:${ri + 2};grid-column:${ci + 2}">${cell(x, ri, ci)}</div>` : cell(x, ri, ci))).join('')).join('');
      const heads = ROMAN.map((r, i) => `<div class="pt-gh" style="grid-row:1;grid-column:${i + 2}" aria-hidden="true">${r}</div>`).join('');
      const series = MEND.map((_, i) => `<div class="pt-ph" style="grid-row:${i + 2};grid-column:1" aria-hidden="true">${i + 1}</div>`).join('');
      let gapCard = '';
      if (S.gapSel) {
        const g = GAPS[S.gapSel], f = S.found.has(S.gapSel);
        gapCard = `<section class="pt-card" aria-label="${esc(t(g.eka))}"><h3 style="font-size:1.1rem">${esc(t(g.eka))} → ${esc(t(BYSYM[S.gapSel].name))} (${g.year})</h3><p class="pt-fact" style="margin-top:6px">${esc(t(g.sentence))}</p>
          <table class="pt-vs"><thead><tr><th></th><th>${esc(t(T('Mendeleev predicted', 'मेंडेलीव का अनुमान')))}</th><th>${esc(t(T('Found', 'वास्तव में')))}</th></tr></thead><tbody>${g.rows.map((r) => `<tr><td>${esc(t(r[0]))}</td><td>${esc(r[1])}</td><td class="ok">${esc(r[2])}</td></tr>`).join('')}</tbody></table>
          ${f ? '' : ''}</section>`;
      }
      return `<div class="pt-board" style="padding:8px"><div class="pt-mend" role="group" aria-label="${esc(t(T("Mendeleev's table", 'मेंडेलीव की सारणी')))}"><div class="pt-gh" style="grid-row:1;grid-column:1" aria-hidden="true"></div>${heads}${series}${body}</div>
        <p class="pt-leg2" style="margin:8px 4px 0">${esc(t(T('Columns are groups I to VIII; rows are series. He also swapped tellurium and iodine so that they sat with similar elements. The noble gases were found later and got a new group 0.', 'स्तंभ समूह I से VIII हैं; पंक्तियाँ श्रेणियाँ हैं। उसने टेल्यूरियम और आयोडीन की जगह बदली ताकि वे मिलते-जुलते तत्वों के साथ बैठें। उत्कृष्ट गैसें बाद में मिलीं और उन्हें नया समूह 0 मिला।')))}</p></div>${gapCard}${S.sel ? cardHTML() : ''}`;
    }

    function draw() {
      const view = S.hist === 'dobereiner' ? dobView() : S.hist === 'newlands' ? nlView() : S.hist === 'mendeleev' ? mendView() : null;
      const m = S.msg || introMsg();
      root.innerHTML = `<div class="pt${S.anim ? ' pt-anim' : ''}">${tabs()}${S.hist === 'modern' ? chips() : ''}<p class="pt-live" aria-live="polite">${esc(t(m))}</p>${S.hist === 'modern' ? modernView() : view}</div>`;
      S.anim = false;
      if (S.lastKey) { const el = root.querySelector(`[data-key="${CSS_ESC(S.lastKey)}"]`); if (el && document.activeElement !== el) try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    const CSS_ESC = (s) => String(s).replace(/"/g, '\\"');

    function selectEl(z, quiet) {
      const e = E[z - 1];
      S.sel = z;
      S.msg = { en: `${e.name.en}: group ${e.g}, period ${e.p}. ${e.sh.length} shell${e.sh.length > 1 ? 's' : ''} with ${e.sh.join(', ')} electrons; valency ${e.val != null ? e.val : 'varies'}.`, hi: `${e.name.hi}: समूह ${e.g}, आवर्त ${e.p}। ${e.sh.length} कोश, इलेक्ट्रॉन ${e.sh.join(', ')}; संयोजकता ${e.val != null ? e.val : 'बदलती है'}।` };
      draw();
      if (!quiet) { api.emit('picked:' + e.sym); api.speak(t(e.name)); api.record(api.t({ en: 'Looked at ', hi: 'देखा: ' }) + t(e.name)); }
    }

    function act(key) {
      if (key.startsWith('element:')) {
        const e = BYSYM[key.slice(8)]; if (!e) return;
        if (S.hist === 'newlands') { const c = NL.find((x) => x.syms.length === 1 && x.syms[0] === e.sym); S.nsel = c ? c.n : null; }
        if (S.hist === 'mendeleev') S.gapSel = S.found.has(e.sym) ? e.sym : S.gapSel;
        selectEl(e.z);
        if (S.hist === 'newlands' && S.nsel) {
          const c = NL[S.nsel - 1], others = NL.filter((x) => x.n !== c.n && (x.n - c.n) % 7 === 0).map((x) => x.syms.join(' & '));
          S.msg = { en: `${e.name.en} is number ${c.n}. Its column partners: ${others.join(', ')}.`, hi: `${e.name.hi} क्रमांक ${c.n} है। इसके स्तंभ के साथी: ${others.join(', ')}।` }; draw();
        }
      } else if (key.startsWith('highlight:') || (key.startsWith('trend:') && TREND[key.slice(6)])) {
        S.hl = key.startsWith('trend:') ? key : 'highlight:' === key.slice(0, 10) ? key.slice(10) : key; S.msg = null; S.anim = true; draw();
        api.emit(key); api.record(api.t({ en: 'Coloured the table by ', hi: 'सारणी का रंग चुना: ' }) + (S.hl.startsWith('trend:') ? t(TREND[S.hl.slice(6)].name) : t(HL_NAME[S.hl])));
        if (S.hl.startsWith('trend:')) api.speak(t(introMsg()));
      } else if (key.startsWith('history:')) {
        const h = key.slice(8); if (!HIST[h]) return;
        S.hist = h; S.msg = null; S.nsel = null; S.gapSel = null; S.k = null;
        if (h === 'modern' && cfg.highlight) S.hl = cfg.highlight;
        draw(); api.emit(key); api.record(api.t({ en: 'Opened ', hi: 'खोला: ' }) + t(HIST[h].n));
        if (h === 'dobereiner') animateTriad();
      } else if (key === 'step:prev' || key === 'step:next') {
        if (!S.sel) return;
        const z = key === 'step:next' ? (S.sel % 54) + 1 : ((S.sel + 52) % 54) + 1;
        if (S.hist === 'newlands') { const c = NL.find((x) => x.syms.length === 1 && x.syms[0] === E[z - 1].sym); S.nsel = c ? c.n : null; }
        selectEl(z);
      } else if (key.startsWith('triad:')) {
        const i = +key.slice(6) - 1; if (!(i >= 0 && i < TRIADS.length)) return;
        S.triad = i; S.msg = null; draw(); api.emit(key); api.record(api.t({ en: 'Looked at the triad ', hi: 'त्रिक देखा: ' }) + TRIADS[i].syms.join(', '));
        animateTriad();
      } else if (key === 'newlands:reveal') {
        S.reveal = !S.reveal; S.msg = null; draw(); api.emit('newlands:reveal'); api.record(api.t({ en: S.reveal ? 'Checked which elements fit' : 'Hid the check', hi: S.reveal ? 'जाँचा कि कौन-से तत्व ठीक बैठते हैं' : 'जाँच छिपाई' }));
      } else if (key.startsWith('newlands:')) {
        const n = +key.slice(9), c = NL[n - 1]; if (!c) return;
        S.nsel = n; S.sel = null;
        const others = NL.filter((x) => x.n !== n && (x.n - n) % 7 === 0).map((x) => x.syms.join(' & '));
        S.msg = { en: `Number ${n}: ${c.syms.join(' & ')}. Column partners: ${others.join(', ')}.`, hi: `क्रमांक ${n}: ${c.syms.join(' & ')}। स्तंभ के साथी: ${others.join(', ')}।` };
        draw(); api.emit(key);
      } else if (key.startsWith('gap:')) {
        const s = key.slice(4); const g = GAPS[s]; if (!g) return;
        S.gapSel = s; S.found.add(s); S.sel = BYSYM[s].z;
        S.msg = { en: `Mendeleev left a gap and called it ${g.eka.en}. It was found later: ${BYSYM[s].name.en}.`, hi: `मेंडेलीव ने जगह खाली छोड़ी और उसे ${g.eka.hi} कहा। वह बाद में मिला: ${BYSYM[s].name.hi}।` };
        draw(); api.emit(key); api.speak(t(BYSYM[s].name)); api.record(api.t({ en: 'Opened the gap for ', hi: 'खाली जगह खोली: ' }) + t(g.eka));
      }
    }
    function animateTriad() {
      if (S.tweenStop) S.tweenStop();
      S.k = 0;
      S.tweenStop = tween(1200, (k) => {
        S.k = ease(k);
        const tr = TRIADS[S.triad].syms.map((s) => triadEl(s)); const box = root.querySelector('.pt-line');
        if (box) box.innerHTML = lineSVG(tr[0].mass, tr[1].mass, tr[2].mass, S.k);
      });
    }

    root.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      S.lastKey = key;
      act(key);
    });

    draw();
    if (S.hist === 'dobereiner') animateTriad();
    return { destroy() { if (S.tweenStop) S.tweenStop(); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'periodic',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['highlight', 'focus', 'history'].includes(k)) e.push('unknown key: ' + k); });
      if (c.highlight !== undefined && !HL_ALL.includes(c.highlight)) e.push('highlight: one of ' + HL_ALL.join(', '));
      if (c.history !== undefined && !HIST[c.history]) e.push('history: one of ' + Object.keys(HIST).join(', '));
      if (c.history && c.history !== 'modern' && c.highlight !== undefined) e.push('highlight only applies to the modern table; remove it or use history: modern');
      if (c.focus !== undefined) {
        if (!Array.isArray(c.focus) || c.focus.length < 1 || c.focus.length > 12) e.push('focus: 1 to 12 element symbols');
        else c.focus.forEach((s) => { if (!SYMS.includes(s)) e.push('unknown element symbol in focus: ' + s); });
        if (Array.isArray(c.focus) && new Set(c.focus).size !== c.focus.length) e.push('focus: symbols must not repeat');
      }
      return e;
    },
    keys(c) {
      const targets = ['element:*', 'step:prev', 'step:next', 'history:dobereiner', 'history:newlands', 'history:mendeleev', 'history:modern', 'triad:*', 'newlands:*', 'gap:Sc', 'gap:Ga', 'gap:Ge', 'gap:Tc']
        .concat(HIGHLIGHTS.map((h) => 'highlight:' + h), TRENDS.map((k) => 'trend:' + k));
      const events = ['picked:*', 'history:*', 'highlight:*', 'trend:*', 'triad:*', 'newlands:*', 'gap:*'];
      return { targets, events };
    },
    demo: { highlight: 'trend:size', focus: ['Li', 'Na', 'K'] },
    elements: SYMS,
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
