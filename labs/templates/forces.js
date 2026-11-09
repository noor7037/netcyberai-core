// Template: Forces and machines. Push and pull, friction on real surfaces, Newton's second law, collisions with
// momentum conserved, pressure (solid F/A and liquid p = \u03C1gh with Torricelli jets), floating and sinking by
// Archimedes' principle with real densities, the three classes of lever, pulleys, the inclined plane, the pendulum's
// energy swap, gravity on the planets (and g = g0(1 \u2212 d/R) below the surface), and Hooke's law for springs.
// Every number on screen comes from the real formula with g = 9.8 m/s\u00B2 (Earth); a lab can only pick among the
// objects, surfaces and liquids listed here, so it can never show an impossible result. Config:
//   { mode: 'push'|'friction'|'newton2'|'collision'|'pressure'|'buoyancy'|'lever'|'pulley'|'inclined'|'energy'|
//           'gravity'|'spring',
//     surface?: 'ice'|'glass'|'wood'|'carpet'|'sand'      (push, friction, newton2, inclined)
//     object?: string  (push: box|cart|ball; pressure: tank|brick-flat|brick-side|brick-end; buoyancy: cork|wood|ice|
//                       wax|apple|egg|stone|iron|block; lever: seesaw|wheelbarrow|tongs; pulley: fixed|movable|tackle;
//                       collision: elastic|sticky; energy: pendulum|skater; gravity: earth|moon|mars|jupiter|venus|
//                       mercury; spring: soft|medium|stiff)
//     mass?: kg (the mode's own range and step, see MASS below), fluid?: 'water'|'salt-water'|'oil' (buoyancy, pressure) }
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp, lerp, ease } = L;
  const reduced = L.reducedMotion;
  const G = 9.8;
  const T = (en, hi) => ({ en, hi });
  const n = (v, d = 1) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d) : '\u2013');
  const f1 = (v) => Math.round(v * 10) / 10;
  const MODES = ['push', 'friction', 'newton2', 'collision', 'pressure', 'buoyancy', 'lever', 'pulley', 'inclined', 'energy', 'gravity', 'spring'];

  // ---------- real data ----------
  // Typical coefficients for a wooden block (static, kinetic) and rolling resistance for a ball or wheels.
  const SURF = {
    ice: { mus: 0.10, muk: 0.05, roll: 0.02, sw: '#BFE7FB', name: T('Ice', '\u092C\u0930\u094D\u092B\u093C') },
    glass: { mus: 0.30, muk: 0.20, roll: 0.02, sw: '#9EDCF0', name: T('Glass', '\u0915\u093E\u0901\u091A') },
    wood: { mus: 0.45, muk: 0.30, roll: 0.03, sw: '#C98B4F', name: T('Wood', '\u0932\u0915\u0921\u093C\u0940') },
    carpet: { mus: 0.65, muk: 0.50, roll: 0.08, sw: '#B4232B', name: T('Carpet', '\u0915\u093E\u0932\u0940\u0928') },
    sand: { mus: 0.80, muk: 0.60, roll: 0.25, sw: '#EBCB8B', name: T('Sand', '\u0930\u0947\u0924') },
  };
  const FLUID = {
    water: { rho: 1000, c: '#4EA8F2', name: T('Water', '\u092A\u093E\u0928\u0940') },
    'salt-water': { rho: 1150, c: '#38C2C9', name: T('Very salty water', '\u092C\u0939\u0941\u0924 \u0928\u092E\u0915\u0940\u0928 \u092A\u093E\u0928\u0940') },
    oil: { rho: 920, c: '#F2C14E', name: T('Cooking oil', '\u0916\u093E\u0928\u0947 \u0915\u093E \u0924\u0947\u0932') },
  };
  const PUSHO = {
    box: { m: 20, roll: false, maxF: 300, name: T('Wooden crate', '\u0932\u0915\u0921\u093C\u0940 \u0915\u093E \u092C\u0915\u094D\u0938\u093E') },
    cart: { m: 10, roll: true, maxF: 60, name: T('Trolley', '\u091F\u094D\u0930\u0949\u0932\u0940') },
    ball: { m: 0.45, roll: true, maxF: 10, name: T('Football', '\u092B\u093C\u0941\u091F\u092C\u0949\u0932') },
  };
  // Densities in kg/m\u00B3, volumes in cm\u00B3 (real values; the block's density comes from its mass \u00F7 1 litre).
  const BUOY = {
    cork: { rho: 240, vol: 20, shape: 'box', w: 40, h: 30, c: '#C68B59', name: T('Cork', '\u0915\u0949\u0930\u094D\u0915') },
    wood: { rho: 600, vol: 400, shape: 'box', w: 76, h: 44, c: '#B7793E', name: T('Wooden block', '\u0932\u0915\u0921\u093C\u0940 \u0915\u093E \u0917\u0941\u091F\u0915\u093E') },
    ice: { rho: 917, vol: 30, shape: 'box', w: 40, h: 40, c: '#DDF3FF', name: T('Ice cube', '\u092C\u0930\u094D\u092B\u093C \u0915\u093E \u091F\u0941\u0915\u0921\u093C\u093E') },
    wax: { rho: 900, vol: 50, shape: 'box', w: 24, h: 70, c: '#FFF1C9', name: T('Candle', '\u092E\u094B\u092E\u092C\u0924\u094D\u0924\u0940') },
    apple: { rho: 800, vol: 200, shape: 'ball', w: 54, h: 54, c: '#E5484D', name: T('Apple', '\u0938\u0947\u092C') },
    egg: { rho: 1070, vol: 55, shape: 'ball', w: 40, h: 52, c: '#F4E3C3', name: T('Egg', '\u0905\u0902\u0921\u093E') },
    stone: { rho: 2600, vol: 100, shape: 'ball', w: 50, h: 44, c: '#8A8F98', name: T('Stone', '\u092A\u0924\u094D\u0925\u0930') },
    iron: { rho: 7870, vol: 20, shape: 'ball', w: 32, h: 32, c: '#5B6574', name: T('Iron ball', '\u0932\u094B\u0939\u0947 \u0915\u0940 \u0917\u0947\u0902\u0926') },
    block: { rho: null, vol: 1000, shape: 'box', w: 62, h: 62, c: '#8B3DFF', name: T('Test block (1 litre)', '\u091C\u093E\u0901\u091A \u0917\u0941\u091F\u0915\u093E (1 \u0932\u0940\u091F\u0930)') },
  };
  const BRICK = { m: 3, L: 22.5, W: 11, H: 7 };
  const FACES = {
    'brick-flat': { area: BRICK.L * BRICK.W, w: BRICK.L, h: BRICK.H, name: T('Lying flat', '\u0938\u092A\u093E\u091F \u0932\u093F\u091F\u093E\u0915\u0930') },
    'brick-side': { area: BRICK.L * BRICK.H, w: BRICK.L, h: BRICK.W, name: T('On its side', '\u0915\u0930\u0935\u091F \u092A\u0930') },
    'brick-end': { area: BRICK.W * BRICK.H, w: BRICK.H, h: BRICK.L, name: T('Standing on end', '\u0916\u0921\u093C\u0940 \u0915\u0930\u0915\u0947') },
  };
  const LEVERS = {
    seesaw: { cls: 1, name: T('See-saw (class 1)', '\u0938\u0940-\u0938\u0949 (\u092A\u0939\u0932\u0940 \u0936\u094D\u0930\u0947\u0923\u0940)'), like: T('Like a see-saw, scissors or a hand pump', '\u091C\u0948\u0938\u0947 \u0938\u0940-\u0938\u0949, \u0915\u0948\u0902\u091A\u0940 \u092F\u093E \u0939\u0948\u0902\u0921\u092A\u0902\u092A') },
    wheelbarrow: { cls: 2, name: T('Wheelbarrow (class 2)', '\u0939\u0925\u0920\u0947\u0932\u093E (\u0926\u0942\u0938\u0930\u0940 \u0936\u094D\u0930\u0947\u0923\u0940)'), like: T('Like a wheelbarrow, nutcracker or bottle opener', '\u091C\u0948\u0938\u0947 \u0939\u0925\u0920\u0947\u0932\u093E, \u0938\u0930\u094C\u0924\u093E \u092F\u093E \u092C\u094B\u0924\u0932 \u0916\u094B\u0932\u0928\u0947 \u0935\u093E\u0932\u093E') },
    tongs: { cls: 3, name: T('Tongs (class 3)', '\u091A\u093F\u092E\u091F\u093E (\u0924\u0940\u0938\u0930\u0940 \u0936\u094D\u0930\u0947\u0923\u0940)'), like: T('Like tongs, tweezers or your forearm', '\u091C\u0948\u0938\u0947 \u091A\u093F\u092E\u091F\u093E, \u091A\u093F\u092E\u091F\u0940 \u092F\u093E \u0924\u0941\u092E\u094D\u0939\u093E\u0930\u0940 \u092C\u093E\u0901\u0939') },
  };
  const PULLEYS = {
    fixed: { ma: 1, name: T('Fixed pulley', '\u0938\u094D\u0925\u093F\u0930 \u0918\u093F\u0930\u0928\u0940') },
    movable: { ma: 2, name: T('Movable pulley', '\u091A\u0932 \u0918\u093F\u0930\u0928\u0940') },
    tackle: { ma: 4, name: T('Block and tackle (4 ropes)', '\u0918\u093F\u0930\u0928\u0940-\u0924\u0902\u0924\u094D\u0930 (4 \u0930\u0938\u094D\u0938\u093F\u092F\u093E\u0901)') },
  };
  const COLL = { elastic: { name: T('Springy bumpers', '\u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 \u0935\u093E\u0932\u0947 \u092C\u0902\u092A\u0930') }, sticky: { name: T('Sticky pads', '\u091A\u093F\u092A\u0915\u0928\u0947 \u0935\u093E\u0932\u0947 \u092A\u0948\u0921') } };
  const SWING = { pendulum: { L: 1, name: T('Pendulum', '\u0932\u094B\u0932\u0915') }, skater: { L: 3, name: T('Skater on a half-pipe', '\u0905\u0930\u094D\u0927-\u092A\u093E\u0907\u092A \u092A\u0930 \u0938\u094D\u0915\u0947\u091F\u0930') } };
  // Surface gravity (m/s\u00B2) and mean radius (km).
  const PLANET = {
    earth: { g: 9.8, R: 6371, sky: ['#6FC0F5', '#DDF1FF'], ground: '#5DAA4B', disc: ['#2F7DE1', '#4CB05A'], name: T('Earth', '\u092A\u0943\u0925\u094D\u0935\u0940') },
    moon: { g: 1.62, R: 1737, sky: ['#070B1E', '#1E2A4A'], ground: '#B9BCC4', disc: ['#C9CCD3', '#8E939D'], name: T('Moon', '\u091A\u0902\u0926\u094D\u0930\u092E\u093E') },
    mars: { g: 3.71, R: 3390, sky: ['#E3A27A', '#F6D6B8'], ground: '#B5562E', disc: ['#C8552B', '#E08A5A'], name: T('Mars', '\u092E\u0902\u0917\u0932') },
    jupiter: { g: 24.79, R: 69911, sky: ['#2B2140', '#584679'], ground: '#D9B98A', disc: ['#D8B48A', '#B9764A'], gas: true, name: T('Jupiter', '\u092C\u0943\u0939\u0938\u094D\u092A\u0924\u093F') },
    venus: { g: 8.87, R: 6052, sky: ['#E2B85A', '#F6E3A8'], ground: '#C8893F', disc: ['#E9C46A', '#D9A441'], name: T('Venus', '\u0936\u0941\u0915\u094D\u0930') },
    mercury: { g: 3.70, R: 2440, sky: ['#070B1E', '#22243A'], ground: '#9C8F84', disc: ['#A9A097', '#7B7068'], name: T('Mercury', '\u092C\u0941\u0927') },
  };
  const SPRINGS = { soft: { k: 10, c: '#22C55E', name: T('Soft spring (10 N/m)', '\u0928\u0930\u092E \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 (10 N/m)') }, medium: { k: 25, c: '#2563EB', name: T('Medium spring (25 N/m)', '\u092E\u0927\u094D\u092F\u092E \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 (25 N/m)') }, stiff: { k: 50, c: '#E5484D', name: T('Stiff spring (50 N/m)', '\u0915\u0921\u093C\u093E \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 (50 N/m)') } };

  const OBJECTS = { push: PUSHO, pressure: Object.assign({ tank: {} }, FACES), buoyancy: BUOY, lever: LEVERS, pulley: PULLEYS, collision: COLL, energy: SWING, gravity: PLANET, spring: SPRINGS };
  const DEF_OBJ = { push: 'box', pressure: 'tank', buoyancy: 'egg', lever: 'seesaw', pulley: 'fixed', collision: 'elastic', energy: 'pendulum', gravity: 'earth', spring: 'medium' };
  const SURF_MODES = ['push', 'friction', 'newton2', 'inclined'];
  // What config.mass means in each mode: its range and slider step (kg).
  const MASS = { push: [0.1, 100, 0.05], friction: [0.5, 5, 0.5], newton2: [0.5, 10, 0.5], collision: [0.5, 5, 0.5], buoyancy: [0.1, 2, 0.05], lever: [1, 20, 1], pulley: [1, 100, 1], inclined: [1, 10, 1], energy: [0.1, 2, 0.1], gravity: [1, 100, 1], spring: [0.05, 0.5, 0.05] };
  const onStep = (v, s) => Math.abs(v / s - Math.round(v / s)) < 1e-6;

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object') return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['mode', 'surface', 'object', 'mass', 'fluid'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
    if (c.surface != null) {
      if (!SURF_MODES.includes(c.mode)) e.push(`surface is not used in mode ${c.mode}`);
      else if (!SURF[c.surface]) e.push('unknown surface: ' + c.surface);
    }
    if (c.fluid != null) {
      if (c.mode !== 'buoyancy' && c.mode !== 'pressure') e.push(`fluid is not used in mode ${c.mode}`);
      else if (!FLUID[c.fluid]) e.push('unknown fluid: ' + c.fluid);
      else if (c.mode === 'pressure' && c.object && c.object !== 'tank') e.push('fluid: only with the tank, not a brick');
    }
    if (c.object != null) {
      const tab = OBJECTS[c.mode];
      if (!tab) e.push(`object is not used in mode ${c.mode}`);
      else if (typeof c.object !== 'string' || !Object.prototype.hasOwnProperty.call(tab, c.object)) e.push(`unknown object for ${c.mode}: ${c.object}`);
    }
    if (c.mass != null) {
      const r = MASS[c.mode];
      if (!r) e.push(`mass is not used in mode ${c.mode}`);
      else if (typeof c.mass !== 'number' || !Number.isFinite(c.mass) || c.mass < r[0] || c.mass > r[1]) e.push(`mass: ${r[0]} to ${r[1]} kg in mode ${c.mode}`);
      else if (c.mode !== 'push' && !onStep(c.mass, r[2])) e.push(`mass: a multiple of ${r[2]} kg in mode ${c.mode}`);
      else if (c.mode === 'buoyancy' && (c.object || DEF_OBJ.buoyancy) !== 'block') e.push('mass: only for the test block (object: block); other objects have their real mass');
    }
    return e;
  }

  function keys(c) {
    const mode = c && c.mode;
    const ob = (tab) => Object.keys(tab).map((k) => 'object:' + k);
    const su = Object.keys(SURF).map((k) => 'surface:' + k);
    const fl = Object.keys(FLUID).map((k) => 'fluid:' + k);
    const brick = mode === 'pressure' && c.object && c.object !== 'tank';
    switch (mode) {
      case 'push': return { targets: ['push', 'slider:force'].concat(ob(PUSHO), su), events: ['moved', 'stopped', 'balanced'] };
      case 'friction': return { targets: ['push', 'slider:mass'].concat(su), events: ['moved', 'measured'] };
      case 'newton2': return { targets: ['push', 'slider:force', 'slider:mass'].concat(c.surface ? su : []), events: ['moved', 'stopped', 'measured'].concat(c.surface ? ['balanced'] : []) };
      case 'collision': return { targets: ['release', 'slider:mass', 'slider:load'].concat(ob(COLL)), events: ['moved', 'collided', 'stopped'] };
      case 'pressure': return brick ? { targets: ['slider:load'].concat(Object.keys(FACES).map((k) => 'object:' + k)), events: ['measured'] } : { targets: ['slider:depth', 'release'].concat(fl), events: ['measured'] };
      case 'buoyancy': return { targets: ['release'].concat(c.object === 'block' ? ['slider:mass'] : [], ob(BUOY), fl), events: ['floats', 'sinks'] };
      case 'lever': return { targets: ['slider:load', 'slider:effort', 'fulcrum'].concat(ob(LEVERS)), events: ['balanced', 'lifted'] };
      case 'pulley': return { targets: ['slider:load', 'slider:effort', 'push'].concat(ob(PULLEYS)), events: ['lifted', 'balanced'] };
      case 'inclined': return { targets: ['slider:angle', 'slider:mass', 'slider:force', 'release', 'push'].concat(su), events: ['moved', 'stopped', 'balanced', 'lifted'] };
      case 'energy': return { targets: ['release', 'slider:angle', 'slider:mass'].concat(ob(SWING)), events: ['moved', 'measured', 'stopped'] };
      case 'gravity': return { targets: ['release', 'slider:mass', 'slider:depth'].concat(ob(PLANET)), events: ['moved', 'stopped', 'measured'] };
      case 'spring': return { targets: ['slider:load', 'release'].concat(ob(SPRINGS)), events: ['measured', 'moved', 'stopped'] };
      default: return { targets: [], events: [] };
    }
  }

  // ---------- words ----------
  const W = {
    object: T('Object', '\u0935\u0938\u094D\u0924\u0941'), surface: T('Surface', '\u0938\u0924\u0939'), liquid: T('Liquid', '\u0926\u094D\u0930\u0935'), place: T('Place', '\u091C\u0917\u0939'), spring: T('Spring', '\u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917'),
    lever: T('Kind of lever', '\u0909\u0924\u094D\u0924\u094B\u0932\u0915 \u0915\u093E \u092A\u094D\u0930\u0915\u093E\u0930'), pulley: T('Pulley', '\u0918\u093F\u0930\u0928\u0940'), bumper: T('Bumpers', '\u092C\u0902\u092A\u0930'), brickFace: T('How the brick rests', '\u0908\u0902\u091F \u0915\u0948\u0938\u0947 \u0930\u0916\u0940 \u0939\u0948'),
    speed: T('Speed', '\u091A\u093E\u0932'), dist: T('Distance', '\u0926\u0942\u0930\u0940'), time: T('Time', '\u0938\u092E\u092F'), mass: T('Mass', '\u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), weight: T('Weight', '\u092D\u093E\u0930'),
    friction: T('friction', '\u0918\u0930\u094D\u0937\u0923'), force: T('Force', '\u092C\u0932'), load: T('Load', '\u092D\u093E\u0930'), effort: T('Effort', '\u0906\u092F\u093E\u0938'), fulcrum: T('Fulcrum', '\u0906\u0932\u0902\u092C'),
    normal: T('normal', '\u0905\u092D\u093F\u0932\u0902\u092C'), ff: T('fast-forward', '\u0924\u0947\u091C\u093C \u091A\u0932\u093E\u092F\u093E'), notScale: T('picture not to scale', '\u091A\u093F\u0924\u094D\u0930 \u092A\u0948\u092E\u093E\u0928\u0947 \u092A\u0930 \u0928\u0939\u0940\u0902'),
  };

  // ---------- CSS ----------
  const CSS = `.fz { display: flex; flex-direction: column; gap: 12px; }
.fz-main { display: grid; gap: 12px; }
.fz-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (min-width: 980px) { .fz-main { grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); align-items: start; } .fz-side .fz-ctl { grid-template-columns: 1fr; } }
.fz-chips { display: flex; flex-wrap: wrap; gap: 10px 20px; }
.fz-grp { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fz-gl { font-weight: 700; font-size: .85rem; color: var(--ink-2); letter-spacing: .01em; }
.fz-row { display: flex; flex-wrap: wrap; gap: 6px; }
.fz-chip { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .95rem var(--font-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: background .2s, border-color .2s, transform .15s; }
.fz-chip:hover { border-color: #2563EB; transform: translateY(-1px); }
.fz-chip[aria-pressed="true"] { background: #1D4ED8; border-color: #1D4ED8; color: #fff; box-shadow: 0 3px 10px rgba(29,78,216,.3); }
.fz-sw { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(15,23,42,.25); flex: none; }
.fz-svg { width: 100%; height: auto; display: block; border-radius: 16px; box-shadow: 0 6px 22px rgba(6,18,51,.14); background: #E9F1FB; }
.fz-svg text { font-family: var(--font-body); }
.fz-t { font-size: 19px; font-weight: 700; fill: #0F172A; paint-order: stroke; stroke: rgba(255,255,255,.92); stroke-width: 4px; stroke-linejoin: round; }
.fz-t.sm { font-size: 15px; font-weight: 600; }
.fz-t.big { font-family: var(--font-display); font-size: 25px; font-weight: 800; }
.fz-t.lt { fill: #F8FAFC; stroke: rgba(6,18,51,.8); }
.fz-t.nost { stroke: none; }
.fz-hud { font-size: 18px; font-weight: 700; fill: #0F172A; }
.fz-drag { cursor: grab; touch-action: none; }
.fz-drag:focus { outline: none; }
.fz-drag:focus .fz-ring, .fz-drag:hover .fz-ring { opacity: 1; }
.fz-ring { fill: none; stroke: #FFD23F; stroke-width: 3; stroke-dasharray: 6 4; opacity: 0; }
.fz-acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.fz-btn { min-height: 50px; padding: 0 22px; border-radius: 14px; border: 0; font: 800 1.08rem var(--font-display); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(180deg, #2F6BF0, #1D4ED8); color: #fff; box-shadow: 0 4px 0 #1E3A8A, 0 8px 16px rgba(29,78,216,.28); transition: transform .1s, box-shadow .1s, filter .2s; }
.fz-btn:hover { filter: brightness(1.07); }
.fz-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #1E3A8A; }
.fz-btn.alt { background: linear-gradient(180deg, #FFD23F, #F5B90A); color: #1E293B; box-shadow: 0 4px 0 #B7860B, 0 8px 16px rgba(245,185,10,.3); }
.fz-btn.ghost { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; font-size: .98rem; min-height: 46px; padding: 0 14px; }
.fz-btn .fz-ic { font-size: 1.2em; line-height: 1; }
.fz-ctl { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.fz-ctl:empty { display: none; }
.fz-sl { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px 8px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fz-sl label { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: .93rem; align-items: baseline; }
.fz-sl output { font-family: var(--font-display); font-weight: 800; font-size: 1.12rem; color: var(--royal); white-space: nowrap; }
.fz-slrow { display: flex; align-items: center; gap: 6px; }
.fz-slrow input { flex: 1; min-width: 0; height: 44px; margin: 0; accent-color: #2563EB; cursor: pointer; }
.fz-step { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sunk); color: var(--ink); font: 800 1.35rem var(--font-display); cursor: pointer; line-height: 1; }
.fz-step:hover { border-color: #2563EB; }
.fz-out { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.fz-out p { margin: 0; }
.fz-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.fz-tag { border-radius: 999px; padding: 3px 12px; font-weight: 700; font-size: .88rem; background: var(--sunk); color: var(--ink); }
.fz-tag.b { background: #2563EB; color: #fff; }
.fz-tag.o { background: #FF7A1A; color: #1E293B; }
.fz-tag.g { background: #22C55E; color: #1E293B; }
.fz-tag.y { background: #FFD23F; color: #1E293B; }
.fz-tag.p { background: #8B3DFF; color: #fff; }
.fz-tag.c { background: #02CFF9; color: #1E293B; }
.fz-tag.r { background: #FF6B57; color: #1E293B; }
.fz-eq { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; color: var(--royal); }
.fz-note { color: var(--ink); font-size: 1rem; }
.fz-tbl { border-collapse: collapse; font-size: .92rem; width: 100%; max-width: 520px; }
.fz-tbl th, .fz-tbl td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
.fz-tbl th { color: var(--ink-2); font-weight: 700; }
.fz-bar { display: inline-block; height: 10px; border-radius: 5px; vertical-align: middle; margin-right: 6px; }
.fz-chip:focus-visible, .fz-btn:focus-visible, .fz-step:focus-visible { outline: 3px solid #FFD23F; outline-offset: 2px; }
@media (max-width: 420px) { .fz-btn { flex: 1 1 auto; justify-content: center; } .fz-chips { gap: 8px 14px; } }
@media (prefers-reduced-motion: reduce) { .fz-chip, .fz-btn { transition: none; } }`;

  // ---------- SVG helpers ----------
  function arrow(x1, y1, x2, y2, c, w) {
    w = w || 5;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 4) return '';
    const ux = dx / len, uy = dy / len, hl = Math.min(16, len * 0.6), hw = w / 2 + 6;
    const bx = x2 - ux * hl, by = y2 - uy * hl;
    return `<g><line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><path d="M${f1(x2)} ${f1(y2)}L${f1(bx - uy * hw)} ${f1(by + ux * hw)}L${f1(bx + uy * hw)} ${f1(by - ux * hw)}z" fill="${c}" stroke="${c}" stroke-linejoin="round" stroke-width="1.5"/></g>`;
  }
  // K scales scene text up on a narrow screen (set by paint() before each draw), so labels stay readable at 360 px.
  let K = 1, VBH = 1000;
  const lbl = (x, y, s, cls, a, style) => { const fs = (cls && /\bbig\b/.test(cls) ? 25 : cls && /\bsm\b/.test(cls) ? 15 : 19) * K; return `<text x="${f1(x)}" y="${f1(y)}" class="fz-t${cls ? ' ' + cls : ''}" text-anchor="${a || 'middle'}" style="font-size:${f1(fs)}px${style ? ';' + style : ''}">${esc(s)}</text>`; };
  const hud = (x, y, lines, w, right) => {
    const lh = 25 * K, ww = Math.max((w || 0) * K, 24 + Math.max(...lines.map((l) => String(l).length)) * 9.6 * K), hh = 14 + lines.length * lh;
    if (right) x = right - ww;
    if (y + hh > VBH - 4) y = Math.max(4, VBH - 4 - hh);
    return `<g><rect x="${f1(x)}" y="${f1(y)}" width="${f1(ww)}" height="${f1(hh)}" rx="12" fill="#FFFFFF" fill-opacity=".92" stroke="#CBD5E1"/>${lines.map((l, i) => `<text x="${f1(x + 12)}" y="${f1(y + 7 + lh * (i + 0.78))}" class="fz-hud" style="font-size:${f1(18 * K)}px">${esc(l)}</text>`).join('')}</g>`;
  };
  const coil = (x, y1, y2, turns, w, c) => { let d = `M${x} ${y1}`; const h = (y2 - y1) / (turns * 2 + 2); d += ` L${x} ${y1 + h}`; for (let i = 0; i < turns * 2; i++) d += ` L${x + (i % 2 ? -w : w)} ${f1(y1 + h * (i + 1.5))}`; d += ` L${x} ${f1(y2 - h)} L${x} ${y2}`; return `<path d="${d}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`; };
  const hcoil = (x1, x2, y, turns, h, c) => { let d = `M${f1(x1)} ${y}`; const s = (x2 - x1) / (turns * 2 + 2); d += ` L${f1(x1 + s)} ${y}`; for (let i = 0; i < turns * 2; i++) d += ` L${f1(x1 + s * (i + 1.5))} ${y + (i % 2 ? -h : h)}`; d += ` L${f1(x2 - s)} ${y} L${f1(x2)} ${y}`; return `<path d="${d}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`; };
  // Sphere cap: the height fraction h/(2r) under the liquid when a fraction q of the volume is under.
  function capFrac(q) { if (q <= 0) return 0; if (q >= 1) return 1; let lo = 0, hi = 2; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if ((m * m * (3 - m)) / 4 < q) lo = m; else hi = m; } return (lo + hi) / 4; }

  function mount(root, cfg, api) {
    const t = (x) => api.t(x);
    const uid = 'fz' + Math.random().toString(36).slice(2, 8);
    const S = { mode: cfg.mode, msg: null, rate: 1 };
    let raf = 0, last = 0, alive = true, drag = false;
    root.innerHTML = `<div class="fz"><div class="fz-chips"></div><div class="fz-main"><div class="fz-stage"><svg class="fz-svg" role="group" aria-label="${esc(t(T('Forces lab', '\u092C\u0932 \u092A\u094D\u0930\u092F\u094B\u0917\u0936\u093E\u0932\u093E')))}"></svg></div><div class="fz-side"><div class="fz-acts"></div><div class="fz-ctl"></div><div class="fz-out" aria-live="polite"></div></div></div></div>`;
    const svg = root.querySelector('svg');
    const say = (m) => { if (m) S.msg = m; root.querySelector('.fz-out').innerHTML = M[S.mode].out(); };
    const rec = (x) => api.record(t(x));
    const grpOf = (label, kind, tab, cur, sw) => ({ label, items: Object.keys(tab).filter((k) => tab[k].name).map((id) => ({ key: kind + ':' + id, label: tab[id].name, on: id === cur, sw: sw ? sw(id) : null })) });
    const surfGrp = () => grpOf(W.surface, 'surface', SURF, S.surface, (id) => SURF[id].sw);
    const fluidGrp = () => grpOf(W.liquid, 'fluid', FLUID, S.fluid, (id) => FLUID[id].c);
    const out = (tags, eq, extra) => `<div class="fz-tags">${tags.filter(Boolean).map(([s, c]) => `<span class="fz-tag ${c || ''}">${esc(t(s))}</span>`).join('')}</div>${eq ? `<div class="fz-eq">${esc(t(eq))}</div>` : ''}${S.msg ? `<p class="fz-note">${esc(t(S.msg))}</p>` : ''}${extra || ''}`;
    const sky = (w, h, a, b) => `<defs><linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a || '#CFE8FF'}"/><stop offset="1" stop-color="${b || '#F4F9FF'}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${uid}-sky)"/>`;
    const surfPat = (ox, oy) => `<defs>
      <pattern id="${uid}-s-ice" width="60" height="40" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(ox || 0)} ${oy || 0})"><rect width="60" height="40" fill="#D7F0FC"/><path d="M6 32L26 10M34 38L54 16" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".85"/><path d="M0 2H60" stroke="#A9DDF7" stroke-width="2"/></pattern>
      <pattern id="${uid}-s-glass" width="80" height="40" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(ox || 0)} ${oy || 0})"><rect width="80" height="40" fill="#BDE6F4"/><path d="M0 4H80" stroke="#FFFFFF" stroke-width="3" opacity=".8"/><path d="M14 30l18-14M22 34l10-8" stroke="#FFFFFF" stroke-width="2.5" opacity=".7"/><path d="M79 0V40" stroke="#93CBE0" stroke-width="2"/></pattern>
      <pattern id="${uid}-s-wood" width="90" height="28" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(ox || 0)} ${oy || 0})"><rect width="90" height="28" fill="#C98B4F"/><path d="M0 0H90M0 14H90" stroke="#9A6233" stroke-width="2"/><path d="M30 0V14M70 14V28" stroke="#9A6233" stroke-width="2"/><path d="M8 7c10-3 20 3 30 0M48 21c10-3 20 3 30 0" stroke="#B37640" stroke-width="1.5" fill="none"/></pattern>
      <pattern id="${uid}-s-carpet" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(ox || 0)} ${oy || 0})"><rect width="24" height="24" fill="#B4232B"/><circle cx="6" cy="6" r="2.6" fill="#D9454D"/><circle cx="18" cy="18" r="2.6" fill="#D9454D"/><path d="M0 12l6-4 6 4 6-4 6 4" stroke="#F5B90A" stroke-width="1.4" fill="none" opacity=".7"/></pattern>
      <pattern id="${uid}-s-sand" width="40" height="30" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(ox || 0)} ${oy || 0})"><rect width="40" height="30" fill="#EBCB8B"/><circle cx="6" cy="8" r="1.8" fill="#C9A15A"/><circle cx="22" cy="4" r="1.4" fill="#B88E46"/><circle cx="31" cy="18" r="2" fill="#C9A15A"/><circle cx="12" cy="24" r="1.5" fill="#B88E46"/><circle cx="36" cy="28" r="1.2" fill="#D9B46E"/></pattern>
      <linearGradient id="${uid}-crate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6A967"/><stop offset="1" stop-color="#B9773A"/></linearGradient>
      <linearGradient id="${uid}-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C86F5"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
      <linearGradient id="${uid}-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA35C"/><stop offset="1" stop-color="#F06A0F"/></linearGradient>
      <linearGradient id="${uid}-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient>
      <radialGradient id="${uid}-ballg" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".75"/><stop offset=".4" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".28"/></radialGradient>
    </defs>`;
    const crate = (x, yb, w, h, txt) => `<g><rect x="${f1(x - w / 2)}" y="${f1(yb - h)}" width="${w}" height="${h}" rx="5" fill="url(#${uid}-crate)" stroke="#7A4A1E" stroke-width="3"/><path d="M${f1(x - w / 2 + 6)} ${f1(yb - h + 6)}L${f1(x + w / 2 - 6)} ${f1(yb - 6)}M${f1(x + w / 2 - 6)} ${f1(yb - h + 6)}L${f1(x - w / 2 + 6)} ${f1(yb - 6)}" stroke="#8A5626" stroke-width="5" opacity=".55"/><rect x="${f1(x - w / 2 + 3)}" y="${f1(yb - h + 3)}" width="${w - 6}" height="${h - 6}" rx="3" fill="none" stroke="#9A6233" stroke-width="2"/>${txt ? lbl(x, yb - h / 2 + 6, txt, 'sm') : ''}</g>`;
    const hand = (x, y, dir) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${dir < 0 ? -1 : 1} 1)"><rect x="-26" y="-12" width="30" height="24" rx="11" fill="#F2B48A" stroke="#B9774A" stroke-width="2"/><rect x="-46" y="-8" width="24" height="16" rx="5" fill="#2563EB"/><path d="M2 -6h-6M2 0h-6M2 6h-6" stroke="#B9774A" stroke-width="1.6"/></g>`;

    // ---------- modes ----------
    const M = {};

    // PUSH: a push or pull changes how fast something moves and its direction; friction slows it to a stop.
    const pushMaxF = () => PUSHO[S.obj].maxF * S.m / PUSHO[S.obj].m;
    const niceStep = (x) => [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => s >= x) || 50;
    const pushStep = () => niceStep(pushMaxF() / 30);
    const pushLimit = () => (PUSHO[S.obj].roll ? SURF[S.surface].roll : SURF[S.surface].mus) * S.m * G;
    const pushMu = () => (PUSHO[S.obj].roll ? SURF[S.surface].roll : SURF[S.surface].muk);
    const pushPlace = () => Object.assign(S, { x: 0, v: 0, x0: 0, pushT: 0, weakT: 0, moving: false, tRun: 0, rate: 1 });
    M.push = {
      vb: [640, 300],
      init() { S.obj = cfg.object || 'box'; S.surface = cfg.surface || 'wood'; S.m = cfg.mass != null ? cfg.mass : PUSHO[S.obj].m; const st = pushStep(); S.F = Math.round(pushMaxF() * 0.6 / st) * st; pushPlace(); S.msg = T('Set the force, then press the button. Watch the speed and the distance.', '\u092C\u0932 \u091A\u0941\u0928\u094B, \u092B\u093F\u0930 \u092C\u091F\u0928 \u0926\u092C\u093E\u0913\u0964 \u091A\u093E\u0932 \u0914\u0930 \u0926\u0942\u0930\u0940 \u0926\u0947\u0916\u094B\u0964'); },
      chips: () => [grpOf(W.object, 'object', PUSHO, S.obj), surfGrp()],
      sliders() { const st = pushStep(), mx = Math.ceil(pushMaxF() / st) * st; return [{ name: 'force', label: T('Force (+ push right, \u2212 pull left)', '\u092C\u0932 (+ \u0926\u093E\u090F\u0901 \u0927\u0915\u094D\u0915\u093E, \u2212 \u092C\u093E\u090F\u0901 \u0916\u093F\u0902\u091A\u093E\u0935)'), min: -mx, max: mx, step: st, get: () => S.F, set: (v) => { S.F = v; }, fmt: (v) => `${n(v, st < 1 ? 1 : 0)} N` }]; },
      buttons: () => [{ key: 'push', label: T('Push / pull!', '\u0927\u0915\u094D\u0915\u093E \u0926\u094B / \u0916\u0940\u0902\u091A\u094B!'), icon: '\u270B' }],
      chip(kind, id) { if (kind === 'object') { S.obj = id; S.m = PUSHO[id].m; const st = pushStep(); S.F = Math.round(pushMaxF() * 0.6 / st) * st; } else S.surface = id; stopRun(); pushPlace(); S.msg = T('Ready. Press the button to give it a push.', '\u0924\u0948\u092F\u093E\u0930\u0964 \u0927\u0915\u094D\u0915\u093E \u0926\u0947\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u092C\u091F\u0928 \u0926\u092C\u093E\u0913\u0964'); rebuild(); },
      act() {
        if (!S.F) { api.toast(T('Move the force slider away from zero first.', '\u092A\u0939\u0932\u0947 \u092C\u0932 \u0935\u093E\u0932\u0947 \u0938\u094D\u0932\u093E\u0907\u0921\u0930 \u0915\u094B \u0936\u0942\u0928\u094D\u092F \u0938\u0947 \u0939\u091F\u093E\u0913\u0964')); return; }
        if (S.v === 0 && Math.abs(S.F) <= pushLimit()) {
          S.weakT = 1.6; S.pushT = 0; api.emit('balanced');
          S.msg = T(`It does not move: friction pushes back just as hard (up to ${n(pushLimit(), 1)} N). The forces are balanced.`, `\u092F\u0939 \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u0924\u093E: \u0918\u0930\u094D\u0937\u0923 \u0909\u0924\u0928\u0947 \u0939\u0940 \u091C\u093C\u094B\u0930 \u0938\u0947 \u0909\u0932\u091F\u093E \u0927\u0915\u0947\u0932\u0924\u093E \u0939\u0948 (${n(pushLimit(), 1)} N \u0924\u0915)\u0964 \u092C\u0932 \u0938\u0902\u0924\u0941\u0932\u093F\u0924 \u0939\u0948\u0902\u0964`);
          rec(T(`Pushed with ${n(S.F, 1)} N: it did not move`, `${n(S.F, 1)} N \u0938\u0947 \u0927\u0915\u0947\u0932\u093E: \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u093E`)); say(); run(); return;
        }
        if (S.v === 0) { S.x0 = S.x; S.tRun = 0; }
        S.pushT = 0.3; S.rate = 1; S.weakT = 0; run();
      },
      step(dt) {
        if (S.weakT > 0) { S.weakT -= dt; return S.weakT > 0; }
        const mu = pushMu(), lim = pushLimit();
        const F = S.pushT > 0 ? S.F : 0;
        const wasPush = S.pushT > 0;
        S.pushT = Math.max(0, S.pushT - dt);
        if (wasPush && S.pushT === 0 && S.v !== 0) S.rate = clamp(Math.abs(S.v) / (mu * G) / 4, 1, 12);
        if (S.v === 0) {
          if (Math.abs(F) > lim) { S.v = 1e-9 * Math.sign(F); if (!S.moving) { S.moving = true; api.emit('moved'); rec(T(`Gave a force of ${n(S.F, 1)} N`, `${n(S.F, 1)} N \u0915\u093E \u092C\u0932 \u0932\u0917\u093E\u092F\u093E`)); } }
        }
        if (S.v !== 0) {
          const nv = S.v + ((F - Math.sign(S.v) * mu * S.m * G) / S.m) * dt;
          if (Math.sign(nv) !== Math.sign(S.v) && Math.abs(F) <= lim) S.v = 0; else S.v = nv;
          S.x += S.v * dt; S.tRun += dt;
        }
        if (S.v === 0 && S.pushT <= 0) {
          if (S.moving) {
            S.moving = false; S.rate = 1; const d = Math.abs(S.x - S.x0);
            S.msg = T(`It moved ${n(d, 2)} m in ${n(S.tRun, 1)} s, then friction (${t(SURF[S.surface].name)}) stopped it. Smoother surfaces let it go farther.`, `\u092F\u0939 ${n(d, 2)} m \u091A\u0932\u093E, ${n(S.tRun, 1)} s \u092E\u0947\u0902, \u092B\u093F\u0930 \u0918\u0930\u094D\u0937\u0923 (${SURF[S.surface].name.hi}) \u0928\u0947 \u0907\u0938\u0947 \u0930\u094B\u0915 \u0926\u093F\u092F\u093E\u0964 \u091A\u093F\u0915\u0928\u0940 \u0938\u0924\u0939 \u092A\u0930 \u092F\u0939 \u0914\u0930 \u0926\u0942\u0930 \u091C\u093E\u0924\u093E \u0939\u0948\u0964`);
            api.emit('stopped'); rec(T(`It stopped after ${n(d, 2)} m`, `${n(d, 2)} m \u092C\u093E\u0926 \u0930\u0941\u0915 \u0917\u092F\u093E`)); say();
          }
          return false;
        }
        return true;
      },
      svg() {
        const sc = 60, cam = S.x - 5.3, X = (S.x - cam) * sc, o = PUSHO[S.obj];
        let s = sky(640, 300, '#BFE3FF', '#F2F8FF') + surfPat(-cam * sc, 0);
        for (let k = 0; k < 3; k++) { const cx = ((k * 260 + 80 - cam * 14) % 780 + 780) % 780 - 70; s += `<g fill="#FFFFFF" opacity=".9"><ellipse cx="${f1(cx)}" cy="${50 + k * 18}" rx="42" ry="14"/><ellipse cx="${f1(cx + 26)}" cy="${42 + k * 18}" rx="26" ry="14"/></g>`; }
        s += `<rect x="0" y="220" width="640" height="80" fill="url(#${uid}-s-${S.surface})"/><rect x="0" y="218" width="640" height="4" fill="#0F172A" opacity=".18"/>`;
        for (let i = Math.floor(cam); i <= cam + 11; i++) { const px = (i - cam) * sc; s += `<line x1="${f1(px)}" y1="222" x2="${f1(px)}" y2="236" stroke="#0F172A" stroke-width="2" opacity=".5"/>${lbl(px, 256, `${i} m`, 'sm')}`; }
        const p0 = (S.x0 - cam) * sc;
        s += `<g><line x1="${f1(p0)}" y1="150" x2="${f1(p0)}" y2="220" stroke="#1E293B" stroke-width="3"/><path d="M${f1(p0)} 150h30l-8 9 8 9h-30z" fill="#22C55E"/></g>`;
        const w = S.obj === 'box' ? 76 : S.obj === 'cart' ? 92 : 44, h = S.obj === 'box' ? 62 : S.obj === 'cart' ? 52 : 44;
        if (S.obj === 'box') s += crate(X, 220, w, h, `${n(S.m, S.m < 1 ? 2 : 0)} kg`);
        else if (S.obj === 'cart') {
          const sp = (S.x / 0.1) * 57.3;
          s += `<g><rect x="${f1(X - 46)}" y="174" width="92" height="30" rx="6" fill="url(#${uid}-blue)" stroke="#1E3A8A" stroke-width="2.5"/><path d="M${f1(X + 46)} 178l14-26" stroke="#1E3A8A" stroke-width="5" stroke-linecap="round"/>${lbl(X, 194, `${n(S.m, 0)} kg`, 'sm lt')}${[-28, 28].map((dx) => `<g transform="translate(${f1(X + dx)} 209) rotate(${f1(sp)})"><circle r="11" fill="#1E293B"/><circle r="5" fill="#CBD5E1"/><path d="M0 -9V9M-9 0H9" stroke="#CBD5E1" stroke-width="2"/></g>`).join('')}</g>`;
        } else {
          const sp = (S.x / 0.11) * 57.3;
          s += `<g transform="translate(${f1(X)} 198) rotate(${f1(sp)})"><circle r="22" fill="#FFFFFF" stroke="#1E293B" stroke-width="2.5"/><path d="M0 -8L7.6 -2.5L4.7 6.5H-4.7L-7.6 -2.5Z" fill="#1E293B"/><path d="M0 -8V-21M7.6 -2.5L20 -6M4.7 6.5L12 17M-4.7 6.5L-12 17M-7.6 -2.5L-20 -6" stroke="#1E293B" stroke-width="2"/><circle r="22" fill="url(#${uid}-ballg)"/></g>`;
        }
        const ym = 220 - h / 2, side = X - w / 2;
        const showF = S.pushT > 0 || S.weakT > 0;
        if (showF) {
          if (S.F > 0) s += arrow(side - 100, ym, side - 6, ym, '#E5484D', 8) + hand(side - 112, ym, 1) + lbl(side - 60, ym - 18, `${t(W.force)} ${n(S.F, 1)} N`);
          else s += `<line x1="${f1(side)}" y1="${f1(ym)}" x2="${f1(side - 120)}" y2="${f1(ym)}" stroke="#8A5626" stroke-width="4"/>` + arrow(side - 20, ym - 16, side - 110, ym - 16, '#E5484D', 8) + hand(side - 128, ym, -1) + lbl(side - 66, ym - 30, `${t(W.force)} ${n(-S.F, 1)} N`);
        }
        const fr = S.weakT > 0 ? Math.abs(S.F) : S.v !== 0 ? pushMu() * S.m * G : 0;
        const dirF = S.weakT > 0 ? -Math.sign(S.F) : -Math.sign(S.v);
        if (fr > 0) { const ln = clamp((fr / pushMaxF()) * 160, 22, 120); s += arrow(X, 230, X + dirF * ln, 230, '#FF7A1A', 6) + lbl(X + dirF * ln / 2, 276, t(W.friction), 'sm', 'middle', 'fill:#9A3412'); }
        if (Math.abs(S.v) > 0.3) s += [0, 1, 2].map((k) => `<line x1="${f1(X - Math.sign(S.v) * (w / 2 + 12 + k * 4))}" y1="${f1(ym - 14 + k * 14)}" x2="${f1(X - Math.sign(S.v) * (w / 2 + 12 + k * 4 + clamp(Math.abs(S.v) * 8, 10, 46)))}" y2="${f1(ym - 14 + k * 14)}" stroke="#64748B" stroke-width="3" stroke-linecap="round" opacity=".6"/>`).join('');
        s += hud(12, 12, [`${t(W.speed)}: ${n(Math.abs(S.v), 2)} m/s`, `${t(W.dist)}: ${n(Math.abs(S.x - S.x0), 2)} m`].concat(S.rate > 1.05 ? [`\u23E9 ${t(W.ff)} \u00D7${n(S.rate, 1)}`] : []), 220);
        return s;
      },
      out() { return out([[T(`${t(PUSHO[S.obj].name)}: ${n(S.m, S.m < 1 ? 2 : 0)} kg`, `${PUSHO[S.obj].name.hi}: ${n(S.m, S.m < 1 ? 2 : 0)} kg`)], [SURF[S.surface].name, 'y'], [T(`Friction can hold up to ${n(pushLimit(), 1)} N`, `\u0918\u0930\u094D\u0937\u0923 ${n(pushLimit(), 1)} N \u0924\u0915 \u0930\u094B\u0915 \u0938\u0915\u0924\u093E \u0939\u0948`), 'o']], T('Net force = your force \u2212 friction;  acceleration = net force \u00F7 mass', '\u0915\u0941\u0932 \u092C\u0932 = \u0924\u0941\u092E\u094D\u0939\u093E\u0930\u093E \u092C\u0932 \u2212 \u0918\u0930\u094D\u0937\u0923;  \u0924\u094D\u0935\u0930\u0923 = \u0915\u0941\u0932 \u092C\u0932 \u00F7 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928')); },
    };

    // FRICTION: pull a block with a spring balance; it starts to slide at \u03BCs\u00B7m\u00B7g and keeps sliding at \u03BCk\u00B7m\u00B7g.
    M.friction = {
      vb: [640, 300],
      init() { S.surface = cfg.surface || 'wood'; S.m = cfg.mass != null ? cfg.mass : 2; S.read = 0; S.slide = 0; S.phase = 'idle'; S.tp = 0; S.res = {}; S.msg = T('Press "Pull slowly" and watch the spring balance. When does the block start to move?', '"\u0927\u0940\u0930\u0947 \u0916\u0940\u0902\u091A\u094B" \u0926\u092C\u093E\u0913 \u0914\u0930 \u0915\u092E\u093E\u0928\u0940\u0926\u093E\u0930 \u0924\u0941\u0932\u093E \u0926\u0947\u0916\u094B\u0964 \u0917\u0941\u091F\u0915\u093E \u0915\u092C \u0939\u093F\u0932\u0928\u093E \u0936\u0941\u0930\u0942 \u0915\u0930\u0924\u093E \u0939\u0948?'); },
      chips: () => [surfGrp()],
      sliders: () => [{ name: 'mass', label: T('Mass of the block', '\u0917\u0941\u091F\u0915\u0947 \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 0.5, max: 5, step: 0.5, get: () => S.m, set: (v) => { S.m = v; S.read = 0; S.slide = 0; S.phase = 'idle'; }, fmt: (v) => `${n(v, 1)} kg` }],
      buttons: () => [{ key: 'push', label: T('Pull slowly', '\u0927\u0940\u0930\u0947 \u0916\u0940\u0902\u091A\u094B'), icon: '\u27A1' }],
      chip(kind, id) { S.surface = id; stopRun(); S.read = 0; S.slide = 0; S.phase = 'idle'; S.msg = T(`Now on ${t(SURF[id].name)}. Pull again and compare.`, `\u0905\u092C ${SURF[id].name.hi} \u092A\u0930\u0964 \u092B\u093F\u0930 \u0916\u0940\u0902\u091A\u094B \u0914\u0930 \u0924\u0941\u0932\u0928\u093E \u0915\u0930\u094B\u0964`); rebuild(); },
      act() { if (S.phase === 'ramp' || S.phase === 'slide') return; S.read = 0; S.slide = 0; S.tp = 0; S.phase = 'ramp'; S.msg = T('Pulling harder and harder\u2026', '\u0914\u0930 \u091C\u093C\u094B\u0930 \u0938\u0947 \u0916\u0940\u0902\u091A \u0930\u0939\u0947 \u0939\u0948\u0902\u2026'); say(); run(); },
      step(dt) {
        const sf = SURF[S.surface], Fs = sf.mus * S.m * G, Fk = sf.muk * S.m * G;
        if (S.phase === 'ramp') { S.read += Math.max(4, Fs / 2.5) * dt; if (S.read >= Fs) { S.read = Fk; S.phase = 'slide'; S.tp = 0; api.emit('moved'); rec(T(`Block started to slide at ${n(Fs, 1)} N`, `\u0917\u0941\u091F\u0915\u093E ${n(Fs, 1)} N \u092A\u0930 \u0916\u093F\u0938\u0915\u0928\u0947 \u0932\u0917\u093E`)); } return true; }
        if (S.phase === 'slide') {
          S.tp += dt; S.slide += 0.35 * dt;
          if (S.tp >= 2) {
            S.phase = 'done'; S.res[S.surface] = { s: Fs, k: Fk, m: S.m };
            S.msg = T(`On ${t(sf.name)} the block needed ${n(Fs, 1)} N to start moving, but only ${n(Fk, 1)} N to keep it moving. Static friction is more than sliding friction.`, `${sf.name.hi} \u092A\u0930 \u0917\u0941\u091F\u0915\u0947 \u0915\u094B \u091A\u0932\u093E\u0928\u093E \u0936\u0941\u0930\u0942 \u0915\u0930\u0928\u0947 \u092E\u0947\u0902 ${n(Fs, 1)} N \u0932\u0917\u093E, \u092A\u0930 \u091A\u0932\u0924\u0947 \u0930\u0939\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0915\u0947\u0935\u0932 ${n(Fk, 1)} N\u0964 \u0938\u094D\u0925\u0948\u0924\u093F\u0915 \u0918\u0930\u094D\u0937\u0923 \u0938\u0930\u094D\u092A\u0940 \u0918\u0930\u094D\u0937\u0923 \u0938\u0947 \u0905\u0927\u093F\u0915 \u0939\u094B\u0924\u093E \u0939\u0948\u0964`);
            api.emit('measured'); say(); return false;
          }
          return true;
        }
        return false;
      },
      svg() {
        let s = sky(640, 300, '#EEF2FF', '#DCE4FA') + surfPat(0, 0);
        for (let i = 0; i < 16; i++) s += `<path d="M${i * 40} 0V200" stroke="#C7D2FE" stroke-width="1" opacity=".6"/>`;
        s += `<rect x="16" y="200" width="608" height="26" fill="url(#${uid}-s-${S.surface})" stroke="#64748B" stroke-width="1.5"/><rect x="16" y="226" width="608" height="18" fill="#8B5A2B"/><rect x="40" y="244" width="18" height="56" fill="#7A4A1E"/><rect x="582" y="244" width="18" height="56" fill="#7A4A1E"/>`;
        const bw = 70 + S.m * 8, bh = 40 + S.m * 5, bx = 70 + S.slide * 110, cy = 200 - bh / 2;
        s += crate(bx + bw / 2, 200, bw, bh, `${n(S.m, 1)} kg`);
        const hx = bx + bw, st = 26 + S.read * 2.2, bal = hx + 10 + st;
        s += `<circle cx="${f1(hx + 5)}" cy="${f1(cy)}" r="5" fill="none" stroke="#475569" stroke-width="3"/>` + hcoil(hx + 10, bal, cy, 7, 8, '#475569');
        s += `<g><rect x="${f1(bal)}" y="${f1(cy - 20)}" width="150" height="40" rx="10" fill="#FFFDF5" stroke="#334155" stroke-width="2.5"/>`;
        for (let v = 0; v <= 50; v += 5) { const px = bal + 12 + v * 2.5; s += `<line x1="${f1(px)}" y1="${f1(cy - 18)}" x2="${f1(px)}" y2="${f1(cy - (v % 10 ? 10 : 6))}" stroke="#334155" stroke-width="1.5"/>${v % 10 ? '' : `<text x="${f1(px)}" y="${f1(cy + 14)}" text-anchor="middle" style="font-size:${f1(10 * K)}px;font-weight:700;fill:#334155">${v}</text>`}`; }
        s += `<rect x="${f1(bal + 12 + Math.min(50, S.read) * 2.5 - 2)}" y="${f1(cy - 19)}" width="4" height="22" fill="#E5484D"/></g>`;
        s += hand(bal + 154, cy, -1);
        s += lbl(bal + 75, cy - 30, `${n(S.read, 1)} N`, 'big');
        if (S.read > 0.05) { const ln = clamp(S.read * 3, 18, 120); s += arrow(bx + bw / 2, 213, bx + bw / 2 - ln, 213, '#FF7A1A', 7) + lbl(bx + bw / 2 - ln / 2, 241, t(W.friction), 'sm lt'); }
        const st2 = S.phase === 'ramp' ? T('Not moving yet', '\u0905\u092D\u0940 \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u093E') : S.phase === 'slide' ? T('Sliding!', '\u0916\u093F\u0938\u0915 \u0930\u0939\u093E \u0939\u0948!') : S.phase === 'done' ? T('Measured', '\u092E\u093E\u092A \u0932\u093F\u092F\u093E') : T('Ready', '\u0924\u0948\u092F\u093E\u0930');
        s += hud(12, 12, [t(st2), `${t(SURF[S.surface].name)}`], 200);
        return s;
      },
      out() {
        const ids = Object.keys(S.res);
        const tbl = ids.length ? `<table class="fz-tbl"><tr><th>${esc(t(W.surface))}</th><th>${esc(t(T('Starts at', '\u091A\u0932\u0928\u093E \u0936\u0941\u0930\u0942')))}</th><th>${esc(t(T('Keeps moving at', '\u091A\u0932\u0924\u0947 \u0930\u0939\u0928\u0947 \u0915\u094B')))}</th></tr>${ids.map((id) => `<tr><td>${esc(t(SURF[id].name))} (${n(S.res[id].m, 1)} kg)</td><td><span class="fz-bar" style="width:${Math.round(S.res[id].s * 3)}px;background:#E5484D"></span>${n(S.res[id].s, 1)} N</td><td><span class="fz-bar" style="width:${Math.round(S.res[id].k * 3)}px;background:#FF7A1A"></span>${n(S.res[id].k, 1)} N</td></tr>`).join('')}</table>` : '';
        const sf = SURF[S.surface];
        return out([[SURF[S.surface].name, 'y'], [T(`Weight ${n(S.m * G, 1)} N`, `\u092D\u093E\u0930 ${n(S.m * G, 1)} N`)], [T(`\u03BC static ${sf.mus}, sliding ${sf.muk}`, `\u03BC \u0938\u094D\u0925\u0948\u0924\u093F\u0915 ${sf.mus}, \u0938\u0930\u094D\u092A\u0940 ${sf.muk}`), 'o']], T('Friction = \u03BC \u00D7 weight (weight = m \u00D7 9.8)', '\u0918\u0930\u094D\u0937\u0923 = \u03BC \u00D7 \u092D\u093E\u0930 (\u092D\u093E\u0930 = m \u00D7 9.8)'), tbl);
      },
    };

    // NEWTON2: a steady force on a cart: a = F/m (minus friction if a surface is set). Ticker-tape dots every 0.25 s.
    const n2fr = () => (S.surface ? SURF[S.surface].muk * S.m * G : 0);
    const n2lim = () => (S.surface ? SURF[S.surface].mus * S.m * G : 0);
    M.newton2 = {
      vb: [640, 290],
      init() { S.surface = cfg.surface || null; S.m = cfg.mass != null ? cfg.mass : 2; S.F = 10; S.x = 0; S.v = 0; S.tt = 0; S.dots = []; S.phase = 'idle'; S.rate = 1; S.msg = T('Choose the force and the mass, then press Go. Watch the dots on the tape spread out.', '\u092C\u0932 \u0914\u0930 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u091A\u0941\u0928\u094B, \u092B\u093F\u0930 "\u091A\u0932\u094B" \u0926\u092C\u093E\u0913\u0964 \u091F\u0947\u092A \u092A\u0930 \u092C\u093F\u0902\u0926\u0941\u0913\u0902 \u0915\u094B \u092B\u0948\u0932\u0924\u0947 \u0926\u0947\u0916\u094B\u0964'); },
      chips: () => (S.surface ? [surfGrp()] : []),
      sliders: () => [
        { name: 'force', label: T('Pulling force', '\u0916\u0940\u0902\u091A\u0928\u0947 \u0935\u093E\u0932\u093E \u092C\u0932'), min: 1, max: 20, step: 1, get: () => S.F, set: (v) => { S.F = v; }, fmt: (v) => `${n(v, 0)} N` },
        { name: 'mass', label: T('Mass of the cart', '\u0917\u093E\u0921\u093C\u0940 \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 0.5, max: 10, step: 0.5, get: () => S.m, set: (v) => { S.m = v; }, fmt: (v) => `${n(v, 1)} kg` }],
      buttons: () => [{ key: 'push', label: T('Go', '\u091A\u0932\u094B'), icon: '\u25B6' }],
      chip(kind, id) { S.surface = id; stopRun(); S.x = 0; S.v = 0; S.dots = []; S.phase = 'idle'; rebuild(); },
      act() {
        stopRun(); S.x = 0; S.v = 0; S.tt = 0; S.dots = [0]; S.rate = 1;
        if (S.surface && S.F <= n2lim()) { S.phase = 'idle'; api.emit('balanced'); S.msg = T(`The cart does not move: friction (up to ${n(n2lim(), 1)} N) balances your ${S.F} N.`, `\u0917\u093E\u0921\u093C\u0940 \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u0924\u0940: \u0918\u0930\u094D\u0937\u0923 (${n(n2lim(), 1)} N \u0924\u0915) \u0924\u0941\u092E\u094D\u0939\u093E\u0930\u0947 ${S.F} N \u0915\u094B \u0938\u0902\u0924\u0941\u0932\u093F\u0924 \u0915\u0930 \u0926\u0947\u0924\u093E \u0939\u0948\u0964`); say(); paint(); return; }
        const a = (S.F - n2fr()) / S.m; S.rate = clamp(Math.sqrt(7 / a) / 5, 1, 6); S.phase = 'run'; api.emit('moved'); rec(T(`Pulled ${S.m} kg with ${S.F} N`, `${S.m} kg \u0915\u094B ${S.F} N \u0938\u0947 \u0916\u0940\u0902\u091A\u093E`)); run();
      },
      step(dt) {
        if (S.phase !== 'run') return false;
        const a = (S.F - n2fr()) / S.m;
        S.v += a * dt; S.x += S.v * dt; S.tt += dt;
        if (S.tt >= S.dots.length * 0.25 - 1e-9) S.dots.push(S.x);
        if (S.x >= 3.5) {
          S.x = 3.5; S.phase = 'done'; S.rate = 1;
          const tt = Math.sqrt(7 / a); S.tt = tt; S.v = a * tt;
          S.msg = T(`Acceleration a = ${S.surface ? `(${S.F} \u2212 ${n(n2fr(), 1)})` : S.F} \u00F7 ${S.m} = ${n(a, 2)} m/s\u00B2. It covered 3.5 m in ${n(tt, 2)} s and reached ${n(a * tt, 2)} m/s. More force \u2192 more acceleration; more mass \u2192 less.`, `\u0924\u094D\u0935\u0930\u0923 a = ${S.surface ? `(${S.F} \u2212 ${n(n2fr(), 1)})` : S.F} \u00F7 ${S.m} = ${n(a, 2)} m/s\u00B2\u0964 \u0907\u0938\u0928\u0947 3.5 m, ${n(tt, 2)} s \u092E\u0947\u0902 \u0924\u092F \u0915\u093F\u090F \u0914\u0930 ${n(a * tt, 2)} m/s \u0924\u0915 \u092A\u0939\u0941\u0901\u091A\u0940\u0964 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u092C\u0932 \u2192 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0924\u094D\u0935\u0930\u0923; \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u2192 \u0915\u092E\u0964`);
          api.emit('stopped'); api.emit('measured'); rec(T(`Measured a = ${n(a, 2)} m/s\u00B2`, `a = ${n(a, 2)} m/s\u00B2 \u092E\u093E\u092A\u093E`)); say(); return false;
        }
        return true;
      },
      svg() {
        const px = (x) => 40 + x * 125;
        let s = sky(640, 290, '#E0F2FE', '#F8FAFC') + surfPat(0, 0);
        s += S.surface ? `<rect x="30" y="196" width="586" height="16" fill="url(#${uid}-s-${S.surface})" stroke="#64748B"/>` : `<rect x="30" y="200" width="586" height="10" rx="5" fill="url(#${uid}-metal)" stroke="#64748B"/>`;
        for (let k = 0; k <= 8; k++) s += `<line x1="${px(k / 2)}" y1="214" x2="${px(k / 2)}" y2="${k % 2 ? 222 : 228}" stroke="#334155" stroke-width="2"/>${k % 2 ? '' : lbl(px(k / 2), 244, `${k / 2} m`, 'sm')}`;
        s += `<rect x="602" y="160" width="14" height="44" rx="4" fill="#E5484D"/>`;
        const x0 = px(S.x), ln = 14 + S.F * 3.2;
        if (S.surface) s += crate(x0 + 35, 196, 70, 40, `${S.m} kg`);
        else s += `<g><rect x="${f1(x0)}" y="160" width="70" height="30" rx="6" fill="url(#${uid}-blue)" stroke="#1E3A8A" stroke-width="2.5"/>${lbl(x0 + 35, 181, `${S.m} kg`, 'sm lt')}<circle cx="${f1(x0 + 16)}" cy="194" r="7" fill="#1E293B"/><circle cx="${f1(x0 + 54)}" cy="194" r="7" fill="#1E293B"/></g>`;
        const fy = S.surface ? 176 : 175;
        s += arrow(x0 + 72, fy, x0 + 72 + ln, fy, '#E5484D', 7) + lbl(x0 + 72 + ln / 2, fy - 14, `${S.F} N`);
        if (S.surface && S.phase === 'run') s += arrow(x0 + 35, 205, x0 + 35 - clamp(n2fr() * 5, 16, 90), 205, '#FF7A1A', 5);
        s += `<rect x="30" y="256" width="586" height="18" rx="3" fill="#FFF7D6" stroke="#E2C66B"/>` + S.dots.map((d) => `<circle cx="${f1(px(d))}" cy="265" r="4" fill="#1E293B"/>`).join('');
        s += lbl(36, 284, t(T('Ticker tape: one dot every 0.25 s', '\u091F\u093F\u0915\u0930 \u091F\u0947\u092A: \u0939\u0930 0.25 s \u092A\u0930 \u090F\u0915 \u092C\u093F\u0902\u0926\u0941')), 'sm', 'start');
        const a = (S.F - n2fr()) / S.m;
        s += hud(12, 12, [`${t(W.time)}: ${n(S.tt, 2)} s`, `${t(W.speed)}: ${n(S.v, 2)} m/s`, `a = ${n(Math.max(0, a), 2)} m/s\u00B2`].concat(S.rate > 1.05 && S.phase === 'run' ? [`\u23E9 \u00D7${n(S.rate, 1)}`] : []), 200);
        return s;
      },
      out() { const a = (S.F - n2fr()) / S.m; return out([[T(`F = ${S.F} N`, `F = ${S.F} N`), 'r'], [T(`m = ${S.m} kg`, `m = ${S.m} kg`), 'b'], S.surface ? [T(`Friction ${n(n2fr(), 1)} N on ${t(SURF[S.surface].name)}`, `${SURF[S.surface].name.hi} \u092A\u0930 \u0918\u0930\u094D\u0937\u0923 ${n(n2fr(), 1)} N`), 'o'] : [T('Smooth track: no friction', '\u091A\u093F\u0915\u0928\u093E \u091F\u094D\u0930\u0948\u0915: \u0915\u094B\u0908 \u0918\u0930\u094D\u0937\u0923 \u0928\u0939\u0940\u0902'), 'c'], [T(`a = ${n(Math.max(0, a), 2)} m/s\u00B2`, `a = ${n(Math.max(0, a), 2)} m/s\u00B2`), 'g']], S.surface ? T('a = (F \u2212 friction) \u00F7 m', 'a = (F \u2212 \u0918\u0930\u094D\u0937\u0923) \u00F7 m') : T('F = m \u00D7 a,  so  a = F \u00F7 m', 'F = m \u00D7 a,  \u0907\u0938\u0932\u093F\u090F  a = F \u00F7 m')); },
    };

    // COLLISION: cart A at 2 m/s hits cart B at rest. Momentum is conserved; elastic keeps kinetic energy too.
    const U = 2, CW = 0.8;
    M.collision = {
      vb: [640, 272],
      init() { S.obj = cfg.object || 'elastic'; S.m = cfg.mass != null ? cfg.mass : 1; S.mb = 1; S.reset = () => Object.assign(S, { xa: 0.2, xb: 3.8, va: 0, vb: 0, phase: 'idle', ta: 0 }); S.reset(); S.msg = T('Press Release: cart A rolls at 2 m/s into cart B. Compare the momentum before and after.', '"\u091B\u094B\u0921\u093C\u094B" \u0926\u092C\u093E\u0913: \u0917\u093E\u0921\u093C\u0940 A 2 m/s \u0938\u0947 \u0917\u093E\u0921\u093C\u0940 B \u0938\u0947 \u091F\u0915\u0930\u093E\u0924\u0940 \u0939\u0948\u0964 \u091F\u0915\u094D\u0915\u0930 \u0938\u0947 \u092A\u0939\u0932\u0947 \u0914\u0930 \u092C\u093E\u0926 \u0915\u093E \u0938\u0902\u0935\u0947\u0917 \u0926\u0947\u0916\u094B\u0964'); },
      chips: () => [grpOf(W.bumper, 'object', COLL, S.obj)],
      sliders: () => [
        { name: 'mass', label: T('Mass of cart A (moving)', '\u0917\u093E\u0921\u093C\u0940 A \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 (\u091A\u0932\u0924\u0940)'), min: 0.5, max: 5, step: 0.5, get: () => S.m, set: (v) => { S.m = v; S.reset(); }, fmt: (v) => `${n(v, 1)} kg` },
        { name: 'load', label: T('Mass of cart B (at rest)', '\u0917\u093E\u0921\u093C\u0940 B \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 (\u0930\u0941\u0915\u0940 \u0939\u0941\u0908)'), min: 0.5, max: 5, step: 0.5, get: () => S.mb, set: (v) => { S.mb = v; S.reset(); }, fmt: (v) => `${n(v, 1)} kg` }],
      buttons: () => [{ key: 'release', label: T('Release cart A', '\u0917\u093E\u0921\u093C\u0940 A \u091B\u094B\u0921\u093C\u094B'), icon: '\u25B6' }],
      chip(kind, id) { S.obj = id; stopRun(); S.reset(); rebuild(); },
      act() { stopRun(); S.reset(); S.va = U; S.phase = 'before'; api.emit('moved'); rec(T(`Released cart A (${S.m} kg) towards cart B (${S.mb} kg)`, `\u0917\u093E\u0921\u093C\u0940 A (${S.m} kg) \u0915\u094B \u0917\u093E\u0921\u093C\u0940 B (${S.mb} kg) \u0915\u0940 \u0913\u0930 \u091B\u094B\u0921\u093C\u093E`)); run(); },
      step(dt) {
        const w = CW;
        if (S.phase === 'before') {
          S.xa += S.va * dt;
          if (S.xa + w >= S.xb) {
            S.xa = S.xb - w; const ma = S.m, mb = S.mb;
            if (S.obj === 'elastic') { S.va = ((ma - mb) / (ma + mb)) * U; S.vb = (2 * ma / (ma + mb)) * U; } else { S.va = S.vb = (ma * U) / (ma + mb); }
            S.pa = [S.va, S.vb]; S.phase = 'after'; S.ta = 0; api.emit('collided'); rec(T('The carts collided', '\u0917\u093E\u0921\u093C\u093F\u092F\u093E\u0901 \u091F\u0915\u0930\u093E\u0908\u0902'));
          }
          return true;
        }
        if (S.phase === 'after') {
          S.ta += dt; S.xa += S.va * dt; S.xb += S.vb * dt;
          if (S.xa < 0) { S.xa = 0; S.va = 0; } if (S.xb + w > 8) { S.xb = 8 - w; S.vb = 0; } if (S.xa + w > S.xb) { S.xa = S.xb - w; S.va = Math.min(S.va, S.vb); }
          if (S.ta >= 2.2) {
            S.phase = 'done';
            const [v1, v2] = S.pa, pb = S.m * U, pa = S.m * v1 + S.mb * v2, kb = 0.5 * S.m * U * U, ka = 0.5 * S.m * v1 * v1 + 0.5 * S.mb * v2 * v2;
            S.msg = S.obj === 'elastic'
              ? T(`Momentum before ${n(pb, 2)} kg\u00B7m/s = after ${n(pa, 2)} kg\u00B7m/s. Kinetic energy stays ${n(kb, 2)} J: a bouncy (elastic) collision. Cart A's push on B is equal and opposite to B's push on A.`, `\u0938\u0902\u0935\u0947\u0917 \u092A\u0939\u0932\u0947 ${n(pb, 2)} kg\u00B7m/s = \u092C\u093E\u0926 \u092E\u0947\u0902 ${n(pa, 2)} kg\u00B7m/s\u0964 \u0917\u0924\u093F\u091C \u090A\u0930\u094D\u091C\u093E ${n(kb, 2)} J \u0939\u0940 \u0930\u0939\u0924\u0940 \u0939\u0948: \u092F\u0939 \u092A\u094D\u0930\u0924\u094D\u092F\u093E\u0938\u094D\u0925 \u091F\u0915\u094D\u0915\u0930 \u0939\u0948\u0964 A \u0915\u093E B \u092A\u0930 \u092C\u0932 \u0914\u0930 B \u0915\u093E A \u092A\u0930 \u092C\u0932 \u092C\u0930\u093E\u092C\u0930 \u0914\u0930 \u0909\u0932\u091F\u0947 \u0939\u0948\u0902\u0964`)
              : T(`They stick and move together at ${n(v1, 2)} m/s. Momentum before ${n(pb, 2)} = after ${n(pa, 2)} kg\u00B7m/s, but kinetic energy drops from ${n(kb, 2)} J to ${n(ka, 2)} J (it becomes heat and sound).`, `\u0935\u0947 \u091A\u093F\u092A\u0915\u0915\u0930 ${n(v1, 2)} m/s \u0938\u0947 \u0938\u093E\u0925 \u091A\u0932\u0924\u0940 \u0939\u0948\u0902\u0964 \u0938\u0902\u0935\u0947\u0917 \u092A\u0939\u0932\u0947 ${n(pb, 2)} = \u092C\u093E\u0926 \u092E\u0947\u0902 ${n(pa, 2)} kg\u00B7m/s, \u092A\u0930 \u0917\u0924\u093F\u091C \u090A\u0930\u094D\u091C\u093E ${n(kb, 2)} J \u0938\u0947 \u0918\u091F\u0915\u0930 ${n(ka, 2)} J \u0930\u0939 \u091C\u093E\u0924\u0940 \u0939\u0948 (\u092F\u0939 \u090A\u0937\u094D\u092E\u093E \u0914\u0930 \u0906\u0935\u093E\u091C\u093C \u092C\u0928 \u091C\u093E\u0924\u0940 \u0939\u0948)\u0964`);
            api.emit('stopped'); say(); return false;
          }
          return true;
        }
        return false;
      },
      svg() {
        const px = (x) => 20 + x * 75;
        let s = sky(640, 272, '#E0F2FE', '#F8FAFC') + surfPat(0, 0);
        s += `<rect x="16" y="196" width="608" height="10" rx="5" fill="url(#${uid}-metal)" stroke="#64748B"/><rect x="10" y="160" width="10" height="44" rx="3" fill="#64748B"/><rect x="620" y="160" width="10" height="44" rx="3" fill="#64748B"/>`;
        for (let k = 0; k <= 8; k++) s += `<line x1="${px(k)}" y1="208" x2="${px(k)}" y2="216" stroke="#334155" stroke-width="2"/>${lbl(px(k), 234, `${k}`, 'sm')}`;
        const cw = CW * 75, cart = (x, m, fill, name, front) => { const h = 26 + m * 7, xp = px(x); return `<g><rect x="${f1(xp)}" y="${f1(188 - h)}" width="${cw}" height="${f1(h)}" rx="7" fill="url(#${fill})" stroke="#1E293B" stroke-width="2"/>${lbl(xp + cw / 2, 188 - h / 2 + 7, name, 'lt')}${lbl(xp + cw / 2, 258, `${m} kg`, 'sm')}<circle cx="${f1(xp + 13)}" cy="191" r="7" fill="#1E293B"/><circle cx="${f1(xp + cw - 13)}" cy="191" r="7" fill="#1E293B"/>${front}</g>`; };
        const ha = 26 + S.m * 7;
        const bump = S.obj === 'elastic' ? hcoil(px(S.xa) + cw, px(S.xa) + cw + (S.phase === 'after' && S.ta < 0.15 ? 4 : 10), 188 - ha / 2, 3, 6, '#334155') : `<rect x="${f1(px(S.xa) + cw - 3)}" y="${f1(188 - ha / 2 - 10)}" width="7" height="20" rx="2" fill="#F5B90A"/>`;
        s += cart(S.xa, S.m, `${uid}-blue`, 'A', bump);
        s += cart(S.xb, S.mb, `${uid}-orange`, 'B', S.obj === 'sticky' ? `<rect x="${f1(px(S.xb) - 4)}" y="${f1(188 - (26 + S.mb * 7) / 2 - 10)}" width="7" height="20" rx="2" fill="#F5B90A"/>` : '');
        const va = (x, v, m) => (Math.abs(v) > 0.02 ? arrow(px(x) + cw / 2, 188 - (26 + m * 7) - 16, px(x) + cw / 2 + v * 32, 188 - (26 + m * 7) - 16, '#16A34A', 6) + lbl(px(x) + cw / 2 + v * 16, 188 - (26 + m * 7) - 30, `${n(v, 2)} m/s`, 'sm') : '');
        s += va(S.xa, S.va, S.m) + va(S.xb, S.vb, S.mb);
        if (S.phase === 'after' && S.ta < 0.35) { const cx = px(S.xb), r = 10 + S.ta * 60; s += `<circle cx="${f1(cx)}" cy="150" r="${f1(r)}" fill="none" stroke="#FFD23F" stroke-width="4" opacity="${f1(1 - S.ta / 0.35)}"/>`; }
        // After the hit, show the momentum just after the collision (the end buffers are an outside force that stops the carts later).
        const after = S.phase === 'after' || S.phase === 'done', p = after ? S.m * S.pa[0] + S.mb * S.pa[1] : S.m * S.va + S.mb * S.vb;
        s += hud(12, 12, [`${t(after ? T('Total momentum after the hit', '\u091F\u0915\u094D\u0915\u0930 \u0915\u0947 \u092C\u093E\u0926 \u0915\u0941\u0932 \u0938\u0902\u0935\u0947\u0917') : T('Total momentum', '\u0915\u0941\u0932 \u0938\u0902\u0935\u0947\u0917'))}: ${n(p, 2)} kg\u00B7m/s`], 300);
        return s;
      },
      out() { const pb = S.m * U, kb = 0.5 * S.m * U * U; return out([[T(`A: ${S.m} kg at 2 m/s`, `A: ${S.m} kg, 2 m/s`), 'b'], [T(`B: ${S.mb} kg at rest`, `B: ${S.mb} kg, \u0930\u0941\u0915\u0940 \u0939\u0941\u0908`), 'o'], [T(`Momentum before: ${n(pb, 2)} kg\u00B7m/s`, `\u092A\u0939\u0932\u0947 \u0938\u0902\u0935\u0947\u0917: ${n(pb, 2)} kg\u00B7m/s`), 'g'], [T(`Kinetic energy before: ${n(kb, 2)} J`, `\u092A\u0939\u0932\u0947 \u0917\u0924\u093F\u091C \u090A\u0930\u094D\u091C\u093E: ${n(kb, 2)} J`), 'y']], T('momentum p = m \u00D7 v;  total p before = total p after', '\u0938\u0902\u0935\u0947\u0917 p = m \u00D7 v;  \u0915\u0941\u0932 p \u092A\u0939\u0932\u0947 = \u0915\u0941\u0932 p \u092C\u093E\u0926 \u092E\u0947\u0902')); },
    };

    // PRESSURE: tank (p = \u03C1gh, jets v = \u221A(2gh)) or a brick on sand (p = F \u00F7 A).
    const HOLES = [0.25, 0.5, 0.75];
    const STAND = 1.5;
    M.pressure = {
      vb: () => (S.brick ? [640, 320] : [640, 440]),
      init() {
        S.obj = cfg.object || 'tank'; S.brick = S.obj !== 'tank'; S.fluid = cfg.fluid || 'water'; S.depth = 0.5; S.open = false; S.jet = 0;
        S.load = 0; S.sink = 0; S.drop = 0;
        S.msg = S.brick ? T('Choose how the brick rests on the sand. Which way does it sink deepest?', '\u091A\u0941\u0928\u094B \u0915\u093F \u0908\u0902\u091F \u0930\u0947\u0924 \u092A\u0930 \u0915\u0948\u0938\u0947 \u0930\u0916\u0940 \u0939\u0948\u0964 \u0915\u093F\u0938 \u0924\u0930\u0939 \u0935\u0939 \u0938\u092C\u0938\u0947 \u0917\u0939\u0930\u0940 \u0927\u0901\u0938\u0924\u0940 \u0939\u0948?') : T('Move the pressure sensor deeper. Then open the holes in the side of the tank.', '\u0926\u093E\u092C-\u0938\u0902\u0935\u0947\u0926\u0915 \u0915\u094B \u0914\u0930 \u0917\u0939\u0930\u093E \u0932\u0947 \u091C\u093E\u0913\u0964 \u092B\u093F\u0930 \u091F\u0902\u0915\u0940 \u0915\u0940 \u0926\u0940\u0935\u093E\u0930 \u0915\u0947 \u091B\u0947\u0926 \u0916\u094B\u0932\u094B\u0964');
        if (S.brick) S.sink = this.sinkPx();
      },
      sinkPx() { const p = ((BRICK.m + S.load) * G) / (FACES[S.obj].area / 1e4); return clamp(2 + p / 1000 * 1.4, 2, 44); },
      chips() { return S.brick ? [grpOf(W.brickFace, 'object', FACES, S.obj)] : [fluidGrp()]; },
      sliders() {
        return S.brick ? [{ name: 'load', label: T('Extra weight on top', '\u090A\u092A\u0930 \u0930\u0916\u093E \u0905\u0924\u093F\u0930\u093F\u0915\u094D\u0924 \u092D\u093E\u0930'), min: 0, max: 20, step: 5, get: () => S.load, set: (v) => { S.load = v; }, fmt: (v) => `${v} kg` }]
          : [{ name: 'depth', label: T('Depth of the sensor', '\u0938\u0902\u0935\u0947\u0926\u0915 \u0915\u0940 \u0917\u0939\u0930\u093E\u0908'), min: 0, max: 100, step: 5, get: () => Math.round(S.depth * 100), set: (v) => { S.depth = v / 100; }, fmt: (v) => `${v} cm` }];
      },
      buttons() { return S.brick ? [] : [{ key: 'release', label: S.open ? T('Close the holes', '\u091B\u0947\u0926 \u092C\u0902\u0926 \u0915\u0930\u094B') : T('Open the holes', '\u091B\u0947\u0926 \u0916\u094B\u0932\u094B'), icon: '\uD83D\uDCA7', cls: 'alt' }]; },
      chip(kind, id) {
        if (kind === 'fluid') { S.fluid = id; this.slide(); rebuild(); return; }
        S.obj = id; S.drop = 1; rebuild();
        const to = this.sinkPx(), from = 2;
        stopRun();
        animate(900, (e) => { S.drop = 1 - e; S.sink = lerp(from, to, e); }, () => { this.measuredBrick(); });
      },
      measuredBrick() { const A = FACES[S.obj].area, F = (BRICK.m + S.load) * G, p = F / (A / 1e4); S.msg = T(`Pressure = ${n(F, 1)} N \u00F7 ${n(A / 1e4, 4)} m\u00B2 = ${n(p, 0)} Pa. The same weight on a smaller area gives more pressure, so it sinks deeper.`, `\u0926\u093E\u092C = ${n(F, 1)} N \u00F7 ${n(A / 1e4, 4)} m\u00B2 = ${n(p, 0)} Pa\u0964 \u0935\u0939\u0940 \u092D\u093E\u0930 \u0915\u092E \u0915\u094D\u0937\u0947\u0924\u094D\u0930\u092B\u0932 \u092A\u0930 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0926\u093E\u092C \u0926\u0947\u0924\u093E \u0939\u0948, \u0907\u0938\u0932\u093F\u090F \u0908\u0902\u091F \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0927\u0901\u0938\u0924\u0940 \u0939\u0948\u0964`); api.emit('measured'); rec(T(`Brick ${t(FACES[S.obj].name)}: ${n(p, 0)} Pa`, `\u0908\u0902\u091F ${FACES[S.obj].name.hi}: ${n(p, 0)} Pa`)); say(); },
      slide() {
        if (S.brick) { const from = S.sink, to = this.sinkPx(); animate(500, (e) => { S.sink = lerp(from, to, e); }, () => this.measuredBrick()); return; }
        const fl = FLUID[S.fluid], p = fl.rho * G * S.depth;
        S.msg = T(`At ${n(S.depth * 100, 0)} cm in ${t(fl.name)}: pressure = ${fl.rho} \u00D7 9.8 \u00D7 ${n(S.depth, 2)} = ${n(p, 0)} Pa (${n(p / 1000, 2)} kPa). Deeper means more pressure, pushing in every direction.`, `${fl.name.hi} \u092E\u0947\u0902 ${n(S.depth * 100, 0)} cm \u092A\u0930: \u0926\u093E\u092C = ${fl.rho} \u00D7 9.8 \u00D7 ${n(S.depth, 2)} = ${n(p, 0)} Pa (${n(p / 1000, 2)} kPa)\u0964 \u091C\u093F\u0924\u0928\u093E \u0917\u0939\u0930\u093E, \u0909\u0924\u0928\u093E \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0926\u093E\u092C, \u091C\u094B \u0939\u0930 \u0926\u093F\u0936\u093E \u092E\u0947\u0902 \u0927\u0915\u0947\u0932\u0924\u093E \u0939\u0948\u0964`);
        api.emit('measured'); say(); paint();
      },
      act() {
        S.open = !S.open; rebuild();
        if (!S.open) { S.jet = 0; paint(); return; }
        animate(1400, (e) => { S.jet = e; }, () => {
          const v = HOLES.map((d) => Math.sqrt(2 * G * d));
          S.msg = T(`Water leaves the holes at ${v.map((x) => n(x, 1)).join(', ')} m/s: v = \u221A(2 \u00D7 9.8 \u00D7 depth). The deepest hole squirts fastest and farthest, because the pressure there is the greatest.`, `\u091B\u0947\u0926\u094B\u0902 \u0938\u0947 \u092A\u093E\u0928\u0940 ${v.map((x) => n(x, 1)).join(', ')} m/s \u0938\u0947 \u0928\u093F\u0915\u0932\u0924\u093E \u0939\u0948: v = \u221A(2 \u00D7 9.8 \u00D7 \u0917\u0939\u0930\u093E\u0908)\u0964 \u0938\u092C\u0938\u0947 \u0917\u0939\u0930\u0947 \u091B\u0947\u0926 \u0938\u0947 \u0927\u093E\u0930 \u0938\u092C\u0938\u0947 \u0924\u0947\u091C\u093C \u0914\u0930 \u0938\u092C\u0938\u0947 \u0926\u0942\u0930 \u091C\u093E\u0924\u0940 \u0939\u0948, \u0915\u094D\u092F\u094B\u0902\u0915\u093F \u0935\u0939\u093E\u0901 \u0926\u093E\u092C \u0938\u092C\u0938\u0947 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0939\u0948\u0964`);
          api.emit('measured'); rec(T('Opened the holes', '\u091B\u0947\u0926 \u0916\u094B\u0932\u0947')); say();
        });
      },
      step: () => false,
      svg() {
        if (S.brick) {
          let s = sky(640, 320, '#FFF4DE', '#FDE7C4');
          s += `<rect x="40" y="226" width="560" height="80" rx="10" fill="#A0703A"/><rect x="52" y="232" width="536" height="66" rx="6" fill="#EBCB8B"/>`;
          for (let i = 0; i < 40; i++) s += `<circle cx="${60 + ((i * 53) % 520)}" cy="${240 + ((i * 29) % 52)}" r="${1.2 + (i % 3) * 0.6}" fill="#C9A15A"/>`;
          const fc = FACES[S.obj], w = fc.w * 7, h = fc.h * 7, x = 320 - w / 2, yb = 232 + S.sink - S.drop * 120;
          s += `<path d="M${f1(x - 8)} 232h${f1(w + 16)}" stroke="#C9A15A" stroke-width="6" stroke-linecap="round" opacity="${S.drop ? 0 : 0.8}"/>`;
          s += `<g><rect x="${f1(x)}" y="${f1(yb - h)}" width="${f1(w)}" height="${f1(h)}" rx="4" fill="#B4532A" stroke="#7C2D12" stroke-width="3"/><rect x="${f1(x + 5)}" y="${f1(yb - h + 5)}" width="${f1(w - 10)}" height="${f1(Math.min(10, h / 4))}" rx="3" fill="#D9774A" opacity=".7"/></g>`;
          for (let k = 0; k < S.load / 5; k++) s += `<g><rect x="${f1(320 - 34)}" y="${f1(yb - h - 22 * (k + 1))}" width="68" height="20" rx="6" fill="url(#${uid}-mt)" stroke="#334155" stroke-width="2"/>${lbl(320, yb - h - 22 * k - 7, '5 kg', 'sm nost')}</g>`;
          s += `<defs><linearGradient id="${uid}-mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CBD5E1"/><stop offset="1" stop-color="#64748B"/></linearGradient></defs>`;
          s += `<rect x="${f1(x)}" y="${f1(yb)}" width="${f1(w)}" height="${f1(Math.max(0, S.sink - 2))}" fill="#B4532A" opacity=".25"/>`;
          if (!S.drop) s += `<path d="M${f1(x + w + 14)} 232v${f1(S.sink)}" stroke="#E5484D" stroke-width="3"/>` + lbl(x + w + 22, 232 + S.sink / 2 + 5, t(T('sinks', '\u0927\u0901\u0938\u0928\u093E')), 'sm', 'start');
          const A = fc.area, p = ((BRICK.m + S.load) * G) / (A / 1e4);
          s += hud(12, 12, [`${t(T('Area', '\u0915\u094D\u0937\u0947\u0924\u094D\u0930\u092B\u0932'))}: ${n(A, 1)} cm\u00B2`, `${t(T('Pressure', '\u0926\u093E\u092C'))}: ${n(p, 0)} Pa`], 230);
          s += lbl(628, 314, t(W.notScale), 'sm', 'end');
          return s;
        }
        const fl = FLUID[S.fluid], sc = 140, top = 40, bot = top + sc, ground = bot + STAND * sc, tx0 = 60, tx1 = 200;
        let s = sky(640, 440, '#E6F4FF', '#F8FBFF');
        s += `<rect x="0" y="${ground}" width="640" height="${440 - ground}" fill="#9CCB6B"/><rect x="0" y="${ground}" width="640" height="4" fill="#6FA343"/>`;
        s += `<rect x="${tx0 + 10}" y="${bot}" width="14" height="${ground - bot}" fill="#64748B"/><rect x="${tx1 - 24}" y="${bot}" width="14" height="${ground - bot}" fill="#64748B"/><rect x="${tx0}" y="${bot}" width="${tx1 - tx0}" height="10" fill="#475569"/>`;
        s += `<rect x="${tx0}" y="${top}" width="${tx1 - tx0}" height="${sc}" fill="${fl.c}" opacity=".85"/><rect x="${tx0 + 8}" y="${top + 4}" width="10" height="${sc - 10}" rx="5" fill="#FFFFFF" opacity=".35"/>`;
        s += `<path d="M${tx0} ${top - 14}V${bot}H${tx1}V${top - 14}" fill="none" stroke="#334155" stroke-width="4"/>`;
        s += `<path d="M${tx0 + 20} ${top - 30}h40v10h-10v14" fill="none" stroke="#475569" stroke-width="6"/><rect x="${tx0 + 46}" y="${top - 6}" width="6" height="${6}" fill="${fl.c}"/>`;
        for (let k = 0; k <= 4; k++) s += `<line x1="${tx0 - 10}" y1="${top + k * sc / 4}" x2="${tx0}" y2="${top + k * sc / 4}" stroke="#334155" stroke-width="2"/>${lbl(tx0 - 14, top + k * sc / 4 + 5, `${k * 25}`, 'sm', 'end')}`;
        s += lbl(tx0 - 14, top - 18, 'cm', 'sm', 'end');
        HOLES.forEach((d) => {
          const hy = top + d * sc, v = Math.sqrt(2 * G * d), yAbove = (1 - d) + STAND, tl = Math.sqrt(2 * yAbove / G), tm = tl * S.jet;
          s += `<circle cx="${tx1}" cy="${f1(hy)}" r="4" fill="#1E293B"/>`;
          if (S.open && tm > 0) {
            let d2 = `M${tx1} ${f1(hy)}`; for (let i = 1; i <= 24; i++) { const tt = tm * i / 24; d2 += ` L${f1(tx1 + v * tt * sc)} ${f1(hy + 0.5 * G * tt * tt * sc)}`; }
            s += `<path d="${d2}" fill="none" stroke="${fl.c}" stroke-width="6" stroke-linecap="round" opacity=".9"/><path d="${d2}" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".6"/>`;
            if (S.jet >= 1) { const xr = tx1 + v * tl * sc; s += `<ellipse cx="${f1(xr)}" cy="${ground + 3}" rx="16" ry="4" fill="${fl.c}" opacity=".7"/>${lbl(xr, ground + (d === 0.5 ? 40 : 22), `${n(v * tl, 2)} m`, 'sm')}`; }
            s += lbl(tx1 + 10, hy - 8, `${n(v, 1)} m/s`, 'sm', 'start');
          }
        });
        const py = top + S.depth * sc, p = fl.rho * G * S.depth, al = 6 + p / 1000 * 2.2;
        s += `<path d="M130 ${top - 14}V${f1(py - 10)}" stroke="#1E293B" stroke-width="3"/><circle cx="130" cy="${f1(py)}" r="9" fill="#FFD23F" stroke="#1E293B" stroke-width="2.5"/>`;
        if (S.depth > 0) [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(([dx, dy]) => { s += arrow(130 + dx * (12 + al), py + dy * (12 + al), 130 + dx * 12, py + dy * 12, '#8B3DFF', 3); });
        s += `<path d="M130 ${top - 14}V${top - 26}H470V${70}" fill="none" stroke="#1E293B" stroke-width="3"/>`;
        const gx = 470, gy = 125, gr = 55, ang = -210 + clamp(p / 12000, 0, 1) * 240;
        s += `<circle cx="${gx}" cy="${gy}" r="${gr + 6}" fill="#334155"/><circle cx="${gx}" cy="${gy}" r="${gr}" fill="#FFFFFF"/>`;
        for (let k = 0; k <= 12; k += 2) { const a = (-210 + k / 12 * 240) * Math.PI / 180; s += `<line x1="${f1(gx + Math.cos(a) * (gr - 4))}" y1="${f1(gy + Math.sin(a) * (gr - 4))}" x2="${f1(gx + Math.cos(a) * (gr - 12))}" y2="${f1(gy + Math.sin(a) * (gr - 12))}" stroke="#334155" stroke-width="2"/><text x="${f1(gx + Math.cos(a) * (gr - 22))}" y="${f1(gy + Math.sin(a) * (gr - 22) + 4)}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:#334155">${k}</text>`; }
        const ar = ang * Math.PI / 180;
        s += `<line x1="${gx}" y1="${gy}" x2="${f1(gx + Math.cos(ar) * (gr - 10))}" y2="${f1(gy + Math.sin(ar) * (gr - 10))}" stroke="#E5484D" stroke-width="4" stroke-linecap="round"/><circle cx="${gx}" cy="${gy}" r="5" fill="#1E293B"/>${lbl(gx, gy + 34, 'kPa', 'sm')}`;
        s += lbl(gx, gy + gr + 30, `${n(p / 1000, 2)} kPa`, 'big');
        s += lbl(gx, gy + gr + 52, t(fl.name), 'sm');
        return s;
      },
      out() {
        if (S.brick) { const A = FACES[S.obj].area, F = (BRICK.m + S.load) * G; return out([[T(`Force (weight) ${n(F, 1)} N`, `\u092C\u0932 (\u092D\u093E\u0930) ${n(F, 1)} N`), 'r'], [T(`Area ${n(A, 1)} cm\u00B2`, `\u0915\u094D\u0937\u0947\u0924\u094D\u0930\u092B\u0932 ${n(A, 1)} cm\u00B2`), 'b'], [T(`Pressure ${n(F / (A / 1e4), 0)} Pa`, `\u0926\u093E\u092C ${n(F / (A / 1e4), 0)} Pa`), 'p']], T('pressure = force \u00F7 area', '\u0926\u093E\u092C = \u092C\u0932 \u00F7 \u0915\u094D\u0937\u0947\u0924\u094D\u0930\u092B\u0932')); }
        const fl = FLUID[S.fluid];
        return out([[fl.name, 'c'], [T(`density ${fl.rho} kg/m\u00B3`, `\u0918\u0928\u0924\u094D\u0935 ${fl.rho} kg/m\u00B3`)], [T(`depth ${n(S.depth * 100, 0)} cm`, `\u0917\u0939\u0930\u093E\u0908 ${n(S.depth * 100, 0)} cm`), 'b'], [T(`pressure ${n(fl.rho * G * S.depth, 0)} Pa`, `\u0926\u093E\u092C ${n(fl.rho * G * S.depth, 0)} Pa`), 'p']], T('liquid pressure p = \u03C1 \u00D7 g \u00D7 h  (plus the air pressure above, 101 kPa)', '\u0926\u094D\u0930\u0935 \u0915\u093E \u0926\u093E\u092C p = \u03C1 \u00D7 g \u00D7 h  (\u090A\u092A\u0930 \u0915\u0940 \u0935\u093E\u092F\u0941 \u0915\u093E \u0926\u093E\u092C 101 kPa \u0905\u0932\u0917 \u0938\u0947)'));
      },
    };

    // BUOYANCY: an object floats if its density is less than the liquid's; it then floats with \u03C1obj/\u03C1liquid under.
    const bRho = () => (S.obj === 'block' ? S.m / 0.001 : BUOY[S.obj].rho);
    const bMass = () => bRho() * BUOY[S.obj].vol / 1e6;
    const TK = { x0: 190, x1: 450, top: 120, bot: 370, fl: 160 };
    function bEq() {
      const o = BUOY[S.obj], q = bRho() / FLUID[S.fluid].rho;
      if (q < 1) { const hf = o.shape === 'ball' ? capFrac(q) : q; return { float: true, cy: TK.fl + hf * o.h - o.h / 2, q }; }
      return { float: false, cy: TK.bot - 4 - o.h / 2, q };
    }
    M.buoyancy = {
      vb: [640, 400],
      init() { S.obj = cfg.object || 'egg'; S.fluid = cfg.fluid || 'water'; S.m = cfg.mass != null ? cfg.mass : 0.8; S.held = true; S.cy = 60; S.vy = 0; S.splash = 0; S.done = false; S.msg = T('Pick an object and a liquid, then press Drop it in. Will it float or sink?', '\u0915\u094B\u0908 \u0935\u0938\u094D\u0924\u0941 \u0914\u0930 \u0926\u094D\u0930\u0935 \u091A\u0941\u0928\u094B, \u092B\u093F\u0930 "\u0926\u094D\u0930\u0935 \u092E\u0947\u0902 \u0921\u093E\u0932\u094B" \u0926\u092C\u093E\u0913\u0964 \u0935\u0939 \u0924\u0948\u0930\u0947\u0917\u0940 \u092F\u093E \u0921\u0942\u092C\u0947\u0917\u0940?'); },
      chips: () => [grpOf(W.object, 'object', BUOY, S.obj, (id) => BUOY[id].c), fluidGrp()],
      sliders: () => S.obj !== 'block' ? [] : [{ name: 'mass', label: T('Mass of the test block (1 litre)', '\u091C\u093E\u0901\u091A \u0917\u0941\u091F\u0915\u0947 \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 (1 \u0932\u0940\u091F\u0930)'), min: 0.1, max: 2, step: 0.05, get: () => S.m, set: (v) => { S.m = v; }, fmt: (v) => `${n(v, 2)} kg` }],
      buttons: () => [{ key: 'release', label: T('Drop it in', '\u0926\u094D\u0930\u0935 \u092E\u0947\u0902 \u0921\u093E\u0932\u094B'), icon: '\u2B07' }],
      chip(kind, id) {
        stopRun();
        if (kind === 'object') { S.obj = id; S.held = true; S.cy = 60; S.vy = 0; S.done = false; S.msg = T(`${t(BUOY[id].name)}: density ${n(bRho(), 0)} kg/m\u00B3. Drop it in!`, `${BUOY[id].name.hi}: \u0918\u0928\u0924\u094D\u0935 ${n(bRho(), 0)} kg/m\u00B3\u0964 \u0907\u0938\u0947 \u0921\u093E\u0932\u094B!`); rebuild(); return; }
        S.fluid = id; rebuild();
        if (!S.held) { S.done = false; run(); }
      },
      slide() { if (S.obj !== 'block') { api.toast(T('This slider changes the test block. Pick the test block first.', '\u092F\u0939 \u0938\u094D\u0932\u093E\u0907\u0921\u0930 \u091C\u093E\u0901\u091A \u0917\u0941\u091F\u0915\u0947 \u0915\u0947 \u0932\u093F\u090F \u0939\u0948\u0964 \u092A\u0939\u0932\u0947 \u091C\u093E\u0901\u091A \u0917\u0941\u091F\u0915\u093E \u091A\u0941\u0928\u094B\u0964')); } else if (!S.held) { S.done = false; run(); } say(); paint(); },
      act() { stopRun(); if (!S.held) { S.held = true; S.cy = 60; S.vy = 0; } S.held = false; S.done = false; S.vy = 0; S.splash = 0; rec(T(`Dropped the ${t(BUOY[S.obj].name)} into ${t(FLUID[S.fluid].name)}`, `${BUOY[S.obj].name.hi} \u0915\u094B ${FLUID[S.fluid].name.hi} \u092E\u0947\u0902 \u0921\u093E\u0932\u093E`)); run(); },
      step(dt) {
        if (S.held || S.done) return false;
        const eq = bEq(), o = BUOY[S.obj], bottom = S.cy + o.h / 2;
        const inF = bottom > TK.fl;
        if (!inF) S.vy += 900 * dt;
        else {
          if (S.splash === 0) S.splash = 0.001;
          if (eq.float) S.vy += (40 * (eq.cy - S.cy) - 6 * S.vy) * dt;
          else S.vy += (220 - S.vy) * 3 * dt;
        }
        if (S.splash > 0) S.splash += dt;
        S.cy += S.vy * dt;
        if (!eq.float && S.cy >= eq.cy) { S.cy = eq.cy; S.vy = 0; }
        if (Math.abs(S.cy - eq.cy) < 0.4 && Math.abs(S.vy) < 4 && S.splash > 0.8) {
          S.cy = eq.cy; S.done = true; this.finish(eq); return false;
        }
        return true;
      },
      finish(eq) {
        const fl = FLUID[S.fluid], m = bMass(), Wt = m * G, V = BUOY[S.obj].vol / 1e6;
        if (eq.float) {
          S.msg = T(`It floats: its density (${n(bRho(), 0)} kg/m\u00B3) is less than ${t(fl.name)} (${fl.rho} kg/m\u00B3). ${n(eq.q * 100, 0)}% of it is under the surface, where the upthrust equals its weight, ${n(Wt, 3)} N.`, `\u092F\u0939 \u0924\u0948\u0930\u0924\u0940 \u0939\u0948: \u0907\u0938\u0915\u093E \u0918\u0928\u0924\u094D\u0935 (${n(bRho(), 0)} kg/m\u00B3) ${fl.name.hi} (${fl.rho} kg/m\u00B3) \u0938\u0947 \u0915\u092E \u0939\u0948\u0964 \u0907\u0938\u0915\u093E ${n(eq.q * 100, 0)}% \u092D\u093E\u0917 \u0938\u0924\u0939 \u0915\u0947 \u0928\u0940\u091A\u0947 \u0939\u0948, \u091C\u0939\u093E\u0901 \u0909\u0924\u094D\u092A\u094D\u0932\u093E\u0935\u0928 \u092C\u0932 \u0907\u0938\u0915\u0947 \u092D\u093E\u0930 ${n(Wt, 3)} N \u0915\u0947 \u092C\u0930\u093E\u092C\u0930 \u0939\u0948\u0964`);
          api.emit('floats'); rec(T('It floated', '\u092F\u0939 \u0924\u0948\u0930\u0940'));
        } else {
          const B = fl.rho * V * G;
          S.msg = T(`It sinks: its density (${n(bRho(), 0)} kg/m\u00B3) is more than ${t(fl.name)} (${fl.rho} kg/m\u00B3). The upthrust (${n(B, 3)} N) is less than its weight (${n(Wt, 3)} N), so in the liquid it weighs only ${n(Wt - B, 3)} N.`, `\u092F\u0939 \u0921\u0942\u092C\u0924\u0940 \u0939\u0948: \u0907\u0938\u0915\u093E \u0918\u0928\u0924\u094D\u0935 (${n(bRho(), 0)} kg/m\u00B3) ${fl.name.hi} (${fl.rho} kg/m\u00B3) \u0938\u0947 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0939\u0948\u0964 \u0909\u0924\u094D\u092A\u094D\u0932\u093E\u0935\u0928 \u092C\u0932 (${n(B, 3)} N) \u0907\u0938\u0915\u0947 \u092D\u093E\u0930 (${n(Wt, 3)} N) \u0938\u0947 \u0915\u092E \u0939\u0948, \u0907\u0938\u0932\u093F\u090F \u0926\u094D\u0930\u0935 \u092E\u0947\u0902 \u0907\u0938\u0915\u093E \u092D\u093E\u0930 \u0915\u0947\u0935\u0932 ${n(Wt - B, 3)} N \u0932\u0917\u0924\u093E \u0939\u0948\u0964`);
          api.emit('sinks'); rec(T('It sank', '\u092F\u0939 \u0921\u0942\u092C\u0940'));
        }
        say();
      },
      svg() {
        const fl = FLUID[S.fluid], o = BUOY[S.obj];
        let s = sky(640, 400, '#E8F1FF', '#F7FAFF') + surfPat(0, 0);
        s += `<rect x="120" y="370" width="400" height="30" fill="#C98B4F"/><rect x="120" y="368" width="400" height="5" fill="#9A6233"/>`;
        s += `<rect x="${TK.x0}" y="${TK.fl}" width="${TK.x1 - TK.x0}" height="${TK.bot - TK.fl}" fill="${fl.c}" opacity=".78"/>`;
        if (S.splash > 0 && S.splash < 1) { const r = 10 + S.splash * 90; s += `<ellipse cx="320" cy="${TK.fl}" rx="${f1(r)}" ry="${f1(r * 0.18)}" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="${f1(1 - S.splash)}"/>`; }
        s += `<path d="M${TK.x0} ${TK.top}V${TK.bot}H${TK.x1}V${TK.top}" fill="none" stroke="#64748B" stroke-width="5" stroke-linejoin="round"/><path d="M${TK.x0 + 12} ${TK.top + 14}V${TK.bot - 14}" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity=".5"/>`;
        s += `<path d="M150 30H330V44" fill="none" stroke="#475569" stroke-width="6" stroke-linecap="round"/><rect x="140" y="24" width="16" height="346" fill="#94A3B8"/>`;
        if (S.held) s += `<line x1="330" y1="44" x2="330" y2="${f1(S.cy - o.h / 2)}" stroke="#334155" stroke-width="2"/>`;
        s += this.drawObj(320, S.cy);
        s += `<rect x="${TK.x0}" y="${TK.fl}" width="${TK.x1 - TK.x0}" height="${TK.bot - TK.fl}" fill="${fl.c}" opacity=".22"/><line x1="${TK.x0}" y1="${TK.fl}" x2="${TK.x1}" y2="${TK.fl}" stroke="#FFFFFF" stroke-width="3" opacity=".8"/>`;
        s += lbl(TK.x1 - 10, TK.bot - 14, `${t(fl.name)} \u00B7 ${fl.rho} kg/m\u00B3`, 'sm', 'end');
        if (!S.held && S.done) {
          const eq = bEq(), m = bMass(), Wt = m * G, V = o.vol / 1e6, B = eq.float ? Wt : fl.rho * V * G, sx = 320 + o.w / 2 + 34;
          const sc = 60 / Math.max(Wt, B);
          s += arrow(sx, S.cy, sx, S.cy + Wt * sc, '#E5484D', 6) + lbl(sx + 10, S.cy + Wt * sc - 2, t(W.weight), 'sm', 'start');
          s += arrow(sx + 30, S.cy, sx + 30, S.cy - B * sc, '#16A34A', 6) + lbl(sx + 40, S.cy - B * sc + 12, t(T('upthrust', '\u0909\u0924\u094D\u092A\u094D\u0932\u093E\u0935\u0928')), 'sm', 'start');
        }
        s += hud(0, 14, [`\u03C1 = ${n(bRho(), 0)} kg/m\u00B3`, `m = ${n(bMass() * 1000, 0)} g`], 0, 628);
        return s;
      },
      drawObj(x, cy) {
        const o = BUOY[S.obj], c = o.c, w = o.w, h = o.h;
        switch (S.obj) {
          case 'apple': return `<g><circle cx="${x}" cy="${f1(cy)}" r="${w / 2}" fill="${c}" stroke="#9F1D21" stroke-width="2"/><path d="M${x} ${f1(cy - h / 2)}l3 -12" stroke="#7C4A1E" stroke-width="4" stroke-linecap="round"/><path d="M${x + 3} ${f1(cy - h / 2 - 8)}c10 -8 18 -2 18 -2c-6 8 -14 6 -18 2z" fill="#22C55E"/><circle cx="${x}" cy="${f1(cy)}" r="${w / 2}" fill="url(#${uid}-ballg)"/></g>`;
          case 'egg': return `<g><ellipse cx="${x}" cy="${f1(cy)}" rx="${w / 2}" ry="${h / 2}" fill="${c}" stroke="#B8A27A" stroke-width="2"/><ellipse cx="${x}" cy="${f1(cy)}" rx="${w / 2}" ry="${h / 2}" fill="url(#${uid}-ballg)"/></g>`;
          case 'stone': return `<g><path d="M${x - 25} ${f1(cy + 4)}c0-14 10-22 24-22c16 0 26 8 26 20c0 12-10 20-26 20c-14 0-24-6-24-18z" fill="${c}" stroke="#4B5563" stroke-width="2"/><circle cx="${x - 6}" cy="${f1(cy - 6)}" r="4" fill="#A3A9B3"/><circle cx="${x + 10}" cy="${f1(cy + 6)}" r="3" fill="#6B7280"/></g>`;
          case 'iron': return `<g><circle cx="${x}" cy="${f1(cy)}" r="${w / 2}" fill="${c}" stroke="#1E293B" stroke-width="2"/><circle cx="${x}" cy="${f1(cy)}" r="${w / 2}" fill="url(#${uid}-ballg)"/></g>`;
          case 'wax': return `<g><rect x="${x - w / 2}" y="${f1(cy - h / 2)}" width="${w}" height="${h}" rx="4" fill="${c}" stroke="#D9B65A" stroke-width="2"/><path d="M${x} ${f1(cy - h / 2)}v-8" stroke="#1E293B" stroke-width="2"/></g>`;
          case 'ice': return `<g><rect x="${x - w / 2}" y="${f1(cy - h / 2)}" width="${w}" height="${h}" rx="7" fill="${c}" stroke="#7CC4EA" stroke-width="2" opacity=".95"/><path d="M${x - w / 2 + 7} ${f1(cy - h / 2 + 8)}l12 0" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/></g>`;
          case 'cork': return `<g><rect x="${x - w / 2}" y="${f1(cy - h / 2)}" width="${w}" height="${h}" rx="6" fill="${c}" stroke="#8A5A2E" stroke-width="2"/>${[[-10, -5], [6, 4], [-2, 8], [11, -7]].map(([a, b]) => `<circle cx="${x + a}" cy="${f1(cy + b)}" r="2" fill="#8A5A2E"/>`).join('')}</g>`;
          case 'block': return `<g><rect x="${x - w / 2}" y="${f1(cy - h / 2)}" width="${w}" height="${h}" rx="6" fill="${c}" stroke="#4400F0" stroke-width="2.5"/><text x="${x}" y="${f1(cy + 6)}" text-anchor="middle" style="font:800 15px var(--font-display);fill:#FFFFFF">${n(S.m, 2)}kg</text></g>`;
          default: return crate(x, cy + h / 2, w, h, '');
        }
      },
      out() { const fl = FLUID[S.fluid], q = bRho() / fl.rho; return out([[BUOY[S.obj].name, 'p'], [T(`density ${n(bRho(), 0)} kg/m\u00B3`, `\u0918\u0928\u0924\u094D\u0935 ${n(bRho(), 0)} kg/m\u00B3`)], [fl.name, 'c'], [T(`liquid ${fl.rho} kg/m\u00B3`, `\u0926\u094D\u0930\u0935 ${fl.rho} kg/m\u00B3`)], S.done && [q < 1 ? T('less dense \u2192 floats', '\u0915\u092E \u0918\u0928\u093E \u2192 \u0924\u0948\u0930\u0947\u0917\u093E') : T('denser \u2192 sinks', '\u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0918\u0928\u093E \u2192 \u0921\u0942\u092C\u0947\u0917\u093E'), q < 1 ? 'g' : 'r']].filter(Boolean), T('Archimedes: upthrust = weight of the liquid pushed aside', '\u0906\u0930\u094D\u0915\u093F\u092E\u093F\u0921\u0940\u091C\u093C: \u0909\u0924\u094D\u092A\u094D\u0932\u093E\u0935\u0928 \u092C\u0932 = \u0939\u091F\u093E\u090F \u0917\u090F \u0926\u094D\u0930\u0935 \u0915\u093E \u092D\u093E\u0930')); },
    };

    // LEVER: balanced when load \u00D7 load arm = effort \u00D7 effort arm (moments about the fulcrum). Beam 2 m, weightless.
    const LV = { L: 2, x0: 40, sc: 280, py: 220 };
    function lvGeo() {
      const c = LEVERS[S.obj].cls;
      if (c === 1) return { f: S.fx, pl: 0.1, pe: 1.9, up: false };
      if (c === 2) return { f: 0.05, pl: 0.65, pe: 1.95, up: true };
      return { f: 0.05, pl: 1.95, pe: 0.55, up: true };
    }
    function lvState() { const g = lvGeo(), Wt = S.load * G, dL = Math.abs(g.pl - g.f), dE = Math.abs(g.pe - g.f), ml = Wt * dL, me = S.eff * dE; const bal = Math.abs(me - ml) <= 0.02 * ml; return { g, Wt, dL, dE, ml, me, bal, lift: !bal && me > ml }; }
    M.lever = {
      vb: [640, 350],
      init() { S.obj = cfg.object || 'seesaw'; S.load = cfg.mass != null ? cfg.mass : 10; S.fx = 1.0; S.eff = 50; S.ang = 0; S.state = null; S.msg = T('Change the effort (and move the fulcrum) until the beam balances.', '\u0906\u092F\u093E\u0938 \u092C\u0926\u0932\u094B (\u0914\u0930 \u0906\u0932\u0902\u092C \u0916\u093F\u0938\u0915\u093E\u0913) \u091C\u092C \u0924\u0915 \u0921\u0902\u0921\u093E \u0938\u0902\u0924\u0941\u0932\u093F\u0924 \u0928 \u0939\u094B \u091C\u093E\u090F\u0964'); S.ang = this.target(); S.state = this.kind(); },
      chips: () => [grpOf(W.lever, 'object', LEVERS, S.obj)],
      sliders: () => [
        { name: 'load', label: T('Load', '\u092D\u093E\u0930'), min: 1, max: 20, step: 1, get: () => S.load, set: (v) => { S.load = v; }, fmt: (v) => `${v} kg (${n(v * G, 0)} N)` },
        { name: 'effort', label: T('Effort (your force)', '\u0906\u092F\u093E\u0938 (\u0924\u0941\u092E\u094D\u0939\u093E\u0930\u093E \u092C\u0932)'), min: 0, max: 800, step: 1, get: () => S.eff, set: (v) => { S.eff = v; }, fmt: (v) => `${v} N` }],
      buttons: () => (LEVERS[S.obj].cls === 1 ? [{ key: 'fulcrum', dir: -1, label: T('Fulcrum left', '\u0906\u0932\u0902\u092C \u092C\u093E\u090F\u0901'), icon: '\u25C0', cls: 'ghost' }, { key: 'fulcrum', dir: 1, label: T('Fulcrum right', '\u0906\u0932\u0902\u092C \u0926\u093E\u090F\u0901'), icon: '\u25B6', cls: 'ghost' }] : []),
      chip(kind, id) { S.obj = id; S.msg = T(t(LEVERS[id].like), LEVERS[id].like.hi); rebuild(); this.changed(true); },
      kind() { const s = lvState(); return s.bal ? 'bal' : s.lift ? 'lift' : 'down'; },
      target() { const s = lvState(); if (s.bal) return 0; const net = s.me - s.ml, mag = Math.min(1, Math.abs(net) / Math.max(1, s.ml)), lim = LEVERS[S.obj].cls === 1 ? 11 : 8; let a = (3 + 8 * mag) * Math.sign(net); a = clamp(a, -lim, lim); return s.g.up ? -a : a; },
      changed(quiet) {
        const k = this.kind(), s = lvState();
        if (k !== S.state || quiet) {
          S.state = k;
          if (k === 'bal') { S.msg = T(`Balanced! ${n(s.Wt, 0)} N \u00D7 ${n(s.dL, 2)} m = ${n(s.ml, 1)} N\u00B7m and ${S.eff} N \u00D7 ${n(s.dE, 2)} m = ${n(s.me, 1)} N\u00B7m. Mechanical advantage = load \u00F7 effort = ${n(s.Wt / S.eff, 2)}.`, `\u0938\u0902\u0924\u0941\u0932\u093F\u0924! ${n(s.Wt, 0)} N \u00D7 ${n(s.dL, 2)} m = ${n(s.ml, 1)} N\u00B7m \u0914\u0930 ${S.eff} N \u00D7 ${n(s.dE, 2)} m = ${n(s.me, 1)} N\u00B7m\u0964 \u092F\u093E\u0902\u0924\u094D\u0930\u093F\u0915 \u0932\u093E\u092D = \u092D\u093E\u0930 \u00F7 \u0906\u092F\u093E\u0938 = ${n(s.Wt / S.eff, 2)}\u0964`); api.emit('balanced'); rec(T(`Balanced with ${S.eff} N`, `${S.eff} N \u0938\u0947 \u0938\u0902\u0924\u0941\u0932\u093F\u0924`)); }
          else if (k === 'lift') { S.msg = T(`The load goes up: effort moment ${n(s.me, 1)} N\u00B7m is more than load moment ${n(s.ml, 1)} N\u00B7m.`, `\u092D\u093E\u0930 \u090A\u092A\u0930 \u0909\u0920\u0924\u093E \u0939\u0948: \u0906\u092F\u093E\u0938 \u0915\u093E \u0906\u0918\u0942\u0930\u094D\u0923 ${n(s.me, 1)} N\u00B7m \u092D\u093E\u0930 \u0915\u0947 \u0906\u0918\u0942\u0930\u094D\u0923 ${n(s.ml, 1)} N\u00B7m \u0938\u0947 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0939\u0948\u0964`); api.emit('lifted'); rec(T(`Lifted the load with ${S.eff} N`, `${S.eff} N \u0938\u0947 \u092D\u093E\u0930 \u0909\u0920\u093E\u092F\u093E`)); }
          else if (!quiet) S.msg = T(`Not enough: effort moment ${n(s.me, 1)} N\u00B7m is less than load moment ${n(s.ml, 1)} N\u00B7m. Balance needs ${n(s.ml / s.dE, 1)} N.`, `\u0915\u093E\u092B\u093C\u0940 \u0928\u0939\u0940\u0902: \u0906\u092F\u093E\u0938 \u0915\u093E \u0906\u0918\u0942\u0930\u094D\u0923 ${n(s.me, 1)} N\u00B7m \u092D\u093E\u0930 \u0915\u0947 \u0906\u0918\u0942\u0930\u094D\u0923 ${n(s.ml, 1)} N\u00B7m \u0938\u0947 \u0915\u092E \u0939\u0948\u0964 \u0938\u0902\u0924\u0941\u0932\u0928 \u0915\u0947 \u0932\u093F\u090F ${n(s.ml / s.dE, 1)} N \u091A\u093E\u0939\u093F\u090F\u0964`);
        }
        say(); run();
      },
      slide() { this.changed(false); },
      moveF(d) { if (LEVERS[S.obj].cls !== 1) return; const nf = clamp(Math.round((S.fx + d) * 20) / 20, 0.5, 1.5); if (nf === S.fx) { api.toast(T('The fulcrum cannot go further.', '\u0906\u0932\u0902\u092C \u0914\u0930 \u0906\u0917\u0947 \u0928\u0939\u0940\u0902 \u091C\u093E \u0938\u0915\u0924\u093E\u0964')); return; } S.fx = nf; rec(T(`Moved the fulcrum to ${n(nf, 2)} m`, `\u0906\u0932\u0902\u092C \u0915\u094B ${n(nf, 2)} m \u092A\u0930 \u0930\u0916\u093E`)); this.changed(false); },
      act(key, el) { this.moveF((+(el && el.dataset.dir) || 1) * 0.1); },
      step(dt) { const tg = this.target(); S.ang += (tg - S.ang) * Math.min(1, dt * 6); if (Math.abs(tg - S.ang) < 0.02) { S.ang = tg; return false; } return true; },
      svg() {
        const s0 = lvState(), g = s0.g, X = (p) => LV.x0 + p * LV.sc, fx = X(g.f), py = LV.py, a = S.ang * Math.PI / 180;
        const R = (p, dy) => { const dx = X(p) - fx; return [fx + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)]; };
        let s = sky(640, 350, '#E0F2FE', '#FEF9EC');
        s += `<rect x="0" y="318" width="640" height="32" fill="#9CCB6B"/><rect x="0" y="316" width="640" height="4" fill="#6FA343"/>`;
        const c1 = LEVERS[S.obj].cls === 1;
        s += `<g ${c1 ? `class="fz-drag" data-key="fulcrum" role="slider" tabindex="0" aria-label="${esc(t(W.fulcrum))}" aria-valuemin="0.5" aria-valuemax="1.5" aria-valuenow="${S.fx}"` : ''}><path d="M${fx} ${py + 8}L${fx - 30} 318H${fx + 30}Z" fill="url(#${uid}-tri)" stroke="#7C2D12" stroke-width="3" stroke-linejoin="round"/>${c1 ? `<circle cx="${fx}" cy="${py + 50}" r="44" class="fz-ring"/>` : ''}</g>`;
        s += `<defs><linearGradient id="${uid}-tri" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA35C"/><stop offset="1" stop-color="#D9480F"/></linearGradient><linearGradient id="${uid}-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6A967"/><stop offset="1" stop-color="#A86E37"/></linearGradient></defs>`;
        s += `<g transform="rotate(${f1(S.ang)} ${fx} ${py})"><rect x="${LV.x0}" y="${py - 8}" width="${LV.L * LV.sc}" height="16" rx="6" fill="url(#${uid}-beam)" stroke="#7A4A1E" stroke-width="2.5"/>`;
        for (let k = 0; k <= 20; k++) s += `<line x1="${X(k / 10)}" y1="${py - 8}" x2="${X(k / 10)}" y2="${py - (k % 5 ? 3 : 0)}" stroke="#7A4A1E" stroke-width="1.5"/>`;
        const bw = 44 + S.load * 1.5, bh = 34 + S.load * 1.2;
        s += `<g><rect x="${f1(X(g.pl) - bw / 2)}" y="${f1(py - 8 - bh)}" width="${f1(bw)}" height="${f1(bh)}" rx="8" fill="url(#${uid}-lb)" stroke="#4400F0" stroke-width="2.5"/>${lbl(X(g.pl), py - 8 - bh / 2 + 6, `${S.load} kg`, 'sm lt')}</g>`;
        s += `<defs><linearGradient id="${uid}-lb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A66BFF"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs></g>`;
        const [ex, ey] = R(g.pe, g.up ? 8 : -8);
        if (S.eff > 0) { const ln = 30 + Math.min(90, S.eff / 4); s += g.up ? arrow(ex, ey, ex, ey - ln, '#E5484D', 8) + lbl(ex, ey - ln - 10, `${t(W.effort)} ${S.eff} N`) : arrow(ex, ey - ln, ex, ey, '#E5484D', 8) + lbl(ex, ey - ln - 10, `${t(W.effort)} ${S.eff} N`); }
        const [lx, ly] = R(g.pl, 8);
        s += arrow(lx, ly + 2, lx, ly + 44, '#8B3DFF', 5);
        const [ax, ay] = R(g.f, 24), [bx, by] = R(g.pl, 24), [cx, cy] = R(g.pe, 24);
        s += `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="#8B3DFF" stroke-width="3" stroke-dasharray="6 4"/><line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(cx)}" y2="${f1(cy)}" stroke="#E5484D" stroke-width="3" stroke-dasharray="2 4" transform="translate(0 10)"/>`;
        s += lbl((ax + bx) / 2, (ay + by) / 2 + 22, `${n(s0.dL, 2)} m`, 'sm', 'middle', 'fill:#6D28D9') + lbl((ax + cx) / 2, (ay + cy) / 2 + 40, `${n(s0.dE, 2)} m`, 'sm', 'middle', 'fill:#B42318');
        s += lbl(fx, 340, t(W.fulcrum), 'sm');
        s += hud(12, 12, [t(LEVERS[S.obj].name), s0.bal ? `\u2696 ${t(T('Balanced', '\u0938\u0902\u0924\u0941\u0932\u093F\u0924'))}` : s0.lift ? `\u2B06 ${t(T('Load rises', '\u092D\u093E\u0930 \u0909\u0920\u0924\u093E \u0939\u0948'))}` : `\u2B07 ${t(T('Load stays down', '\u092D\u093E\u0930 \u0928\u0940\u091A\u0947 \u0930\u0939\u0924\u093E \u0939\u0948'))}`], 270);
        return s;
      },
      out() { const s = lvState(); return out([[T(`Load ${n(s.Wt, 0)} N \u00D7 ${n(s.dL, 2)} m = ${n(s.ml, 1)} N\u00B7m`, `\u092D\u093E\u0930 ${n(s.Wt, 0)} N \u00D7 ${n(s.dL, 2)} m = ${n(s.ml, 1)} N\u00B7m`), 'p'], [T(`Effort ${S.eff} N \u00D7 ${n(s.dE, 2)} m = ${n(s.me, 1)} N\u00B7m`, `\u0906\u092F\u093E\u0938 ${S.eff} N \u00D7 ${n(s.dE, 2)} m = ${n(s.me, 1)} N\u00B7m`), 'r'], [T(`Balance needs ${n(s.ml / s.dE, 1)} N`, `\u0938\u0902\u0924\u0941\u0932\u0928 \u0915\u0947 \u0932\u093F\u090F ${n(s.ml / s.dE, 1)} N`), 'y']], T('Balanced when load \u00D7 load arm = effort \u00D7 effort arm', '\u0938\u0902\u0924\u0941\u0932\u0928 \u0924\u092C, \u091C\u092C \u092D\u093E\u0930 \u00D7 \u092D\u093E\u0930-\u092D\u0941\u091C\u093E = \u0906\u092F\u093E\u0938 \u00D7 \u0906\u092F\u093E\u0938-\u092D\u0941\u091C\u093E')); },
    };

    // PULLEY: ideal (frictionless, light) pulleys: effort needed = load \u00F7 number of supporting ropes.
    const LIFT = 0.5;
    const pNeed = () => S.load * G / PULLEYS[S.obj].ma;
    M.pulley = {
      vb: [640, 440],
      init() { S.obj = cfg.object || 'fixed'; S.load = cfg.mass != null ? cfg.mass : 20; S.eff = 100; S.h = 0; S.phase = 'idle'; S.wasBal = false; S.msg = T('Set the effort and press Pull the rope. Which pulley needs the least effort?', '\u0906\u092F\u093E\u0938 \u091A\u0941\u0928\u094B \u0914\u0930 "\u0930\u0938\u094D\u0938\u0940 \u0916\u0940\u0902\u091A\u094B" \u0926\u092C\u093E\u0913\u0964 \u0915\u093F\u0938 \u0918\u093F\u0930\u0928\u0940 \u092E\u0947\u0902 \u0938\u092C\u0938\u0947 \u0915\u092E \u0906\u092F\u093E\u0938 \u0932\u0917\u0924\u093E \u0939\u0948?'); },
      chips: () => [grpOf(W.pulley, 'object', PULLEYS, S.obj)],
      sliders: () => [
        { name: 'load', label: T('Load', '\u092D\u093E\u0930'), min: 1, max: 100, step: 1, get: () => S.load, set: (v) => { S.load = v; S.h = 0; }, fmt: (v) => `${v} kg (${n(v * G, 0)} N)` },
        { name: 'effort', label: T('Effort (your pull)', '\u0906\u092F\u093E\u0938 (\u0924\u0941\u092E\u094D\u0939\u093E\u0930\u093E \u0916\u093F\u0902\u091A\u093E\u0935)'), min: 0, max: 1000, step: 1, get: () => S.eff, set: (v) => { S.eff = v; }, fmt: (v) => `${v} N` }],
      buttons: () => [{ key: 'push', label: T('Pull the rope', '\u0930\u0938\u094D\u0938\u0940 \u0916\u0940\u0902\u091A\u094B'), icon: '\u2B07' }],
      chip(kind, id) { S.obj = id; S.h = 0; S.phase = 'idle'; S.wasBal = false; stopRun(); S.msg = T(`${t(PULLEYS[id].name)}: ${PULLEYS[id].ma} rope${PULLEYS[id].ma > 1 ? 's hold' : ' holds'} the load.`, `${PULLEYS[id].name.hi}: ${PULLEYS[id].ma} \u0930\u0938\u094D\u0938\u0940 \u092D\u093E\u0930 \u0915\u094B \u0925\u093E\u092E\u0924\u0940 \u0939\u0948\u0964`); rebuild(); },
      slide() { const nd = pNeed(), bal = Math.abs(S.eff - nd) <= 0.02 * nd; if (bal && !S.wasBal) { api.emit('balanced'); S.msg = T(`${S.eff} N holds the ${n(S.load * G, 0)} N load still: effort = load \u00F7 ${PULLEYS[S.obj].ma}.`, `${S.eff} N, ${n(S.load * G, 0)} N \u0915\u0947 \u092D\u093E\u0930 \u0915\u094B \u0938\u094D\u0925\u093F\u0930 \u0925\u093E\u092E\u0947 \u0930\u0916\u0924\u093E \u0939\u0948: \u0906\u092F\u093E\u0938 = \u092D\u093E\u0930 \u00F7 ${PULLEYS[S.obj].ma}\u0964`); } S.wasBal = bal; say(); paint(); },
      act() {
        const nd = pNeed();
        if (S.eff < nd * 0.98) { S.msg = T(`Too little effort: ${S.eff} N cannot lift it. This pulley needs at least ${n(nd, 1)} N.`, `\u0906\u092F\u093E\u0938 \u0915\u092E \u0939\u0948: ${S.eff} N \u0938\u0947 \u092F\u0939 \u0928\u0939\u0940\u0902 \u0909\u0920\u0947\u0917\u093E\u0964 \u0907\u0938 \u0918\u093F\u0930\u0928\u0940 \u092E\u0947\u0902 \u0915\u092E \u0938\u0947 \u0915\u092E ${n(nd, 1)} N \u091A\u093E\u0939\u093F\u090F\u0964`); say(); api.toast(T('The load does not move. Pull harder.', '\u092D\u093E\u0930 \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u0924\u093E\u0964 \u0914\u0930 \u091C\u093C\u094B\u0930 \u0938\u0947 \u0916\u0940\u0902\u091A\u094B\u0964')); return; }
        stopRun(); S.h = 0; S.phase = 'lift'; run();
      },
      step(dt) {
        if (S.phase !== 'lift') return false;
        S.h = Math.min(LIFT, S.h + dt * 0.3);
        if (S.h >= LIFT) {
          S.phase = 'idle'; const ma = PULLEYS[S.obj].ma;
          S.msg = T(`Lifted ${S.load} kg by ${LIFT} m with ${n(pNeed(), 1)} N or more. You pulled ${n(LIFT * ma, 1)} m of rope: less force, more distance (work = ${n(S.load * G * LIFT, 0)} J either way).`, `${S.load} kg \u0915\u094B ${LIFT} m \u0909\u0920\u093E\u092F\u093E, ${n(pNeed(), 1)} N \u092F\u093E \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u092C\u0932 \u0938\u0947\u0964 \u0924\u0941\u092E\u0928\u0947 ${n(LIFT * ma, 1)} m \u0930\u0938\u094D\u0938\u0940 \u0916\u0940\u0902\u091A\u0940: \u0915\u092E \u092C\u0932, \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0926\u0942\u0930\u0940 (\u0915\u093E\u0930\u094D\u092F \u0926\u094B\u0928\u094B\u0902 \u0924\u0930\u0939 ${n(S.load * G * LIFT, 0)} J)\u0964`);
          api.emit('lifted'); rec(T(`Lifted ${S.load} kg with the ${t(PULLEYS[S.obj].name)}`, `${PULLEYS[S.obj].name.hi} \u0938\u0947 ${S.load} kg \u0909\u0920\u093E\u092F\u093E`)); say(); return false;
        }
        return true;
      },
      svg() {
        const ma = PULLEYS[S.obj].ma, lp = S.h * 100, pull = S.h * ma * 100;
        let s = sky(640, 440, '#EEF2FF', '#F8FAFC');
        s += `<rect x="0" y="410" width="640" height="30" fill="#CBD5E1"/><rect x="60" y="0" width="460" height="22" fill="#475569"/><path d="M60 22h460" stroke="#334155" stroke-width="3"/>`;
        const lw = Math.min(110, 70 + S.load * 0.5), lh = 54 + S.load * 0.3, lyb = 408 - lp, lyt = lyb - lh;
        const sheave = (x, y, r) => `<g><circle cx="${x}" cy="${f1(y)}" r="${r}" fill="url(#${uid}-metal)" stroke="#334155" stroke-width="3"/><circle cx="${x}" cy="${f1(y)}" r="${r * 0.3}" fill="#334155"/></g>`;
        const rope = (x1, y1, x2, y2) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="#A16207" stroke-width="4" stroke-linecap="round"/>`;
        let hx, hy, up = false, lx = 300;
        if (S.obj === 'fixed') {
          lx = 250; s += `<line x1="300" y1="22" x2="300" y2="90" stroke="#334155" stroke-width="5"/>` + rope(250, 90, 250, lyt) + rope(350, 90, 350, 200 + pull) + `<path d="M250 90a50 50 0 0 1 100 0" fill="none" stroke="#A16207" stroke-width="4"/>` + sheave(300, 90, 48).replace('stroke-width="3"', 'stroke-width="3"') ;
          s += `<path d="M250 90a50 50 0 0 1 100 0" fill="none" stroke="#A16207" stroke-width="4"/>`; hx = 350; hy = 200 + pull;
        } else if (S.obj === 'movable') {
          lx = 280; const py = lyt - 34;
          s += `<rect x="248" y="22" width="12" height="12" fill="#334155"/>` + rope(254, 30, 254, py) + rope(306, py, 306, 180 - pull) + sheave(280, py, 26) + `<path d="M254 ${f1(py)}a26 26 0 0 0 52 0" fill="none" stroke="#A16207" stroke-width="4"/><line x1="280" y1="${f1(py)}" x2="280" y2="${f1(lyt)}" stroke="#334155" stroke-width="5"/>`;
          hx = 306; hy = 180 - pull; up = true;
        } else {
          lx = 300; const ty = 80, by = lyt - 34;
          s += `<line x1="300" y1="22" x2="300" y2="${ty}" stroke="#334155" stroke-width="5"/><rect x="250" y="${ty - 26}" width="100" height="52" rx="16" fill="#64748B" opacity=".35"/><rect x="250" y="${f1(by - 26)}" width="100" height="52" rx="16" fill="#64748B" opacity=".35"/>`;
          [262, 288, 312, 338].forEach((x) => { s += rope(x, ty, x, by); });
          s += `<rect x="350" y="${ty - 18}" width="48" height="36" rx="14" fill="#64748B" opacity=".35"/>` + rope(341, ty - 16, 386, ty - 10) + rope(396, ty, 396, 160 + pull) + sheave(275, ty, 16) + sheave(325, ty, 16) + sheave(386, ty, 10) + sheave(275, by, 16) + sheave(325, by, 16);
          s += `<line x1="300" y1="${f1(by)}" x2="300" y2="${f1(lyt)}" stroke="#334155" stroke-width="5"/>`;
          hx = 396; hy = 160 + pull;
        }
        s += `<g><rect x="${f1(lx - lw / 2)}" y="${f1(lyt)}" width="${f1(lw)}" height="${f1(lh)}" rx="10" fill="url(#${uid}-lp)" stroke="#4400F0" stroke-width="2.5"/>${lbl(lx, lyt + lh / 2 + 6, `${S.load} kg`, 'lt')}</g><defs><linearGradient id="${uid}-lp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A66BFF"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>`;
        s += `<circle cx="${hx}" cy="${f1(hy)}" r="13" fill="#F2B48A" stroke="#B9774A" stroke-width="2.5"/>`;
        s += up ? arrow(hx + 24, hy + 30, hx + 24, hy - 30, '#E5484D', 7) : arrow(hx + 24, hy - 30, hx + 24, hy + 30, '#E5484D', 7);
        s += lbl(hx + 40, hy + 5, `${t(W.effort)} ${S.eff} N`, '', 'start');
        if (S.h > 0) s += `<path d="M${f1(lx - lw / 2 - 14)} 408v${f1(-lp)}" stroke="#16A34A" stroke-width="3"/>` + lbl(lx - lw / 2 - 20, 404 - lp / 2, `${n(S.h, 2)} m`, 'sm', 'end');
        s += hud(0, 34, [`${t(T('Ropes holding load', '\u092D\u093E\u0930 \u0925\u093E\u092E\u0928\u0947 \u0935\u093E\u0932\u0940 \u0930\u0938\u094D\u0938\u093F\u092F\u093E\u0901'))}: ${ma}`, `${t(T('Rope pulled', '\u0916\u0940\u0902\u091A\u0940 \u0917\u0908 \u0930\u0938\u094D\u0938\u0940'))}: ${n(S.h * ma, 2)} m`], 0, 628);
        return s;
      },
      out() { const ma = PULLEYS[S.obj].ma; return out([[PULLEYS[S.obj].name, 'b'], [T(`Load ${n(S.load * G, 0)} N`, `\u092D\u093E\u0930 ${n(S.load * G, 0)} N`), 'p'], [T(`Effort needed ${n(pNeed(), 1)} N`, `\u091C\u093C\u0930\u0942\u0930\u0940 \u0906\u092F\u093E\u0938 ${n(pNeed(), 1)} N`), 'r'], [T(`Mechanical advantage ${ma}`, `\u092F\u093E\u0902\u0924\u094D\u0930\u093F\u0915 \u0932\u093E\u092D ${ma}`), 'g']], T('effort = load \u00F7 number of ropes holding the load (ideal pulleys)', '\u0906\u092F\u093E\u0938 = \u092D\u093E\u0930 \u00F7 \u092D\u093E\u0930 \u0925\u093E\u092E\u0928\u0947 \u0935\u093E\u0932\u0940 \u0930\u0938\u094D\u0938\u093F\u092F\u094B\u0902 \u0915\u0940 \u0938\u0902\u0916\u094D\u092F\u093E (\u0906\u0926\u0930\u094D\u0936 \u0918\u093F\u0930\u0928\u0940)')); },
    };

    // INCLINED PLANE: slides when tan \u03B8 > \u03BCs, a = g(sin \u03B8 \u2212 \u03BCk cos \u03B8); pushing up needs mg(sin \u03B8 + \u03BC cos \u03B8).
    const IN = { L: 3, by: 338, x0: 30, b: 0.5 };
    const inSc = () => Math.min(165, 300 / (IN.L * Math.sin(S.ang * Math.PI / 180)));
    const inG = () => { const th = S.ang * Math.PI / 180, sf = SURF[S.surface]; return { th, sf, down: S.m * G * Math.sin(th), N: S.m * G * Math.cos(th), hold: sf.mus * S.m * G * Math.cos(th), fk: sf.muk * S.m * G * Math.cos(th) }; };
    M.inclined = {
      vb: [640, 360],
      init() { S.surface = cfg.surface || 'wood'; S.m = cfg.mass != null ? cfg.mass : 5; S.ang = 30; S.F = 40; S.s = 0; S.v = 0; S.phase = 'held'; S.msg = T('Press Let go. Does the block slide? Then try other angles and surfaces.', '"\u091B\u094B\u0921\u093C\u094B" \u0926\u092C\u093E\u0913\u0964 \u0915\u094D\u092F\u093E \u0917\u0941\u091F\u0915\u093E \u092B\u093F\u0938\u0932\u0924\u093E \u0939\u0948? \u092B\u093F\u0930 \u0926\u0942\u0938\u0930\u0947 \u0915\u094B\u0923 \u0914\u0930 \u0938\u0924\u0939\u0947\u0902 \u0906\u091C\u093C\u092E\u093E\u0913\u0964'); },
      chips: () => [surfGrp()],
      sliders: () => [
        { name: 'angle', label: T('Angle of the ramp', '\u0922\u0932\u093E\u0928 \u0915\u093E \u0915\u094B\u0923'), min: 5, max: 60, step: 1, get: () => S.ang, set: (v) => { S.ang = v; S.s = Math.min(S.s, IN.L - IN.b - 0.1); }, fmt: (v) => `${v}\u00B0` },
        { name: 'mass', label: T('Mass of the block', '\u0917\u0941\u091F\u0915\u0947 \u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 1, max: 10, step: 1, get: () => S.m, set: (v) => { S.m = v; }, fmt: (v) => `${v} kg` },
        { name: 'force', label: T('Your push up the ramp', '\u0922\u0932\u093E\u0928 \u092A\u0930 \u090A\u092A\u0930 \u0924\u0941\u092E\u094D\u0939\u093E\u0930\u093E \u0927\u0915\u094D\u0915\u093E'), min: 0, max: 150, step: 1, get: () => S.F, set: (v) => { S.F = v; }, fmt: (v) => `${v} N` }],
      buttons: () => [{ key: 'release', label: T('Let go', '\u091B\u094B\u0921\u093C\u094B'), icon: '\u25BC' }, { key: 'push', label: T('Push it up', '\u090A\u092A\u0930 \u0927\u0915\u0947\u0932\u094B'), icon: '\u25B2', cls: 'alt' }],
      chip(kind, id) { S.surface = id; stopRun(); S.phase = 'held'; S.v = 0; rebuild(); },
      act(key) {
        const q = inG(), end = IN.L - IN.b - 0.1;
        if (key === 'release') {
          if (S.s >= end - 1e-6) { api.toast(T('It is already at the bottom. Push it up first.', '\u092F\u0939 \u092A\u0939\u0932\u0947 \u0938\u0947 \u0928\u0940\u091A\u0947 \u0939\u0948\u0964 \u092A\u0939\u0932\u0947 \u0907\u0938\u0947 \u090A\u092A\u0930 \u0927\u0915\u0947\u0932\u094B\u0964')); return; }
          stopRun();
          if (q.down <= q.hold) { S.phase = 'still'; S.v = 0; api.emit('balanced'); S.msg = T(`It stays put: the pull down the slope (${n(q.down, 1)} N) is less than the most friction can hold (${n(q.hold, 1)} N).`, `\u092F\u0939 \u0935\u0939\u0940\u0902 \u0930\u0941\u0915\u093E \u0930\u0939\u0924\u093E \u0939\u0948: \u0922\u0932\u093E\u0928 \u092A\u0930 \u0928\u0940\u091A\u0947 \u0915\u093E \u0916\u093F\u0902\u091A\u093E\u0935 (${n(q.down, 1)} N) \u0909\u0938 \u0918\u0930\u094D\u0937\u0923 \u0938\u0947 \u0915\u092E \u0939\u0948 \u091C\u094B \u0905\u0927\u093F\u0915\u0924\u092E \u0930\u094B\u0915 \u0938\u0915\u0924\u093E \u0939\u0948 (${n(q.hold, 1)} N)\u0964`); rec(T(`At ${S.ang}\u00B0 it did not slide`, `${S.ang}\u00B0 \u092A\u0930 \u0928\u0939\u0940\u0902 \u092B\u093F\u0938\u0932\u093E`)); say(); paint(); return; }
          S.phase = 'slide'; S.v = 0; S.t0 = 0; api.emit('moved'); rec(T(`At ${S.ang}\u00B0 it slid down`, `${S.ang}\u00B0 \u092A\u0930 \u0928\u0940\u091A\u0947 \u092B\u093F\u0938\u0932\u093E`)); run(); return;
        }
        if (S.s <= 1e-6) { api.toast(T('It is already at the top. Let it go.', '\u092F\u0939 \u092A\u0939\u0932\u0947 \u0938\u0947 \u090A\u092A\u0930 \u0939\u0948\u0964 \u0907\u0938\u0947 \u091B\u094B\u0921\u093C\u094B\u0964')); return; }
        const need = q.down + q.hold;
        if (S.F <= need) { S.msg = T(`Not enough: to start it moving up you need more than ${n(need, 1)} N (pull down ${n(q.down, 1)} N + friction ${n(q.hold, 1)} N).`, `\u0915\u093E\u092B\u093C\u0940 \u0928\u0939\u0940\u0902: \u0907\u0938\u0947 \u090A\u092A\u0930 \u091A\u0932\u093E\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F ${n(need, 1)} N \u0938\u0947 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u091A\u093E\u0939\u093F\u090F (\u0928\u0940\u091A\u0947 \u0915\u093E \u0916\u093F\u0902\u091A\u093E\u0935 ${n(q.down, 1)} N + \u0918\u0930\u094D\u0937\u0923 ${n(q.hold, 1)} N)\u0964`); say(); api.toast(T('It does not move. Push harder.', '\u092F\u0939 \u0928\u0939\u0940\u0902 \u0939\u093F\u0932\u0924\u093E\u0964 \u0914\u0930 \u091C\u093C\u094B\u0930 \u0938\u0947 \u0927\u0915\u0947\u0932\u094B\u0964')); return; }
        stopRun(); S.phase = 'up'; api.emit('moved'); run();
      },
      step(dt) {
        const q = inG(), end = IN.L - IN.b - 0.1;
        if (S.phase === 'slide') {
          const a = G * (Math.sin(q.th) - q.sf.muk * Math.cos(q.th));
          S.v += a * dt; S.s += S.v * dt; S.t0 += dt;
          if (S.s >= end) { S.s = end; S.phase = 'bottom'; S.msg = T(`It slid ${n(end, 2)} m with acceleration ${n(a, 2)} m/s\u00B2 and reached ${n(S.v, 2)} m/s at the bottom.`, `\u092F\u0939 ${n(end, 2)} m \u092B\u093F\u0938\u0932\u093E, \u0924\u094D\u0935\u0930\u0923 ${n(a, 2)} m/s\u00B2, \u0914\u0930 \u0928\u0940\u091A\u0947 ${n(S.v, 2)} m/s \u0915\u0940 \u091A\u093E\u0932 \u092A\u0930 \u092A\u0939\u0941\u0901\u091A\u093E\u0964`); api.emit('stopped'); say(); S.v = 0; return false; }
          return true;
        }
        if (S.phase === 'up') {
          S.s -= 0.6 * dt;
          if (S.s <= 0) { S.s = 0; S.phase = 'held'; const lift = S.m * G, push = q.down + q.fk; S.msg = T(`Pushed to the top. Lifting it straight up needs ${n(lift, 1)} N; up this ramp it needs only ${n(push, 1)} N, over a longer distance.`, `\u090A\u092A\u0930 \u092A\u0939\u0941\u0901\u091A\u093E \u0926\u093F\u092F\u093E\u0964 \u0907\u0938\u0947 \u0938\u0940\u0927\u093E \u090A\u092A\u0930 \u0909\u0920\u093E\u0928\u0947 \u092E\u0947\u0902 ${n(lift, 1)} N \u0932\u0917\u0924\u093E; \u0907\u0938 \u0922\u0932\u093E\u0928 \u092A\u0930 \u0915\u0947\u0935\u0932 ${n(push, 1)} N \u0932\u0917\u0924\u093E \u0939\u0948, \u092A\u0930 \u0926\u0942\u0930\u0940 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0939\u0948\u0964`); api.emit('lifted'); rec(T('Pushed the block to the top', '\u0917\u0941\u091F\u0915\u0947 \u0915\u094B \u090A\u092A\u0930 \u0927\u0915\u0947\u0932\u093E')); say(); return false; }
          return true;
        }
        return false;
      },
      svg() {
        const q = inG(), th = q.th, c = Math.cos(th), sn = Math.sin(th), sc = inSc();
        const topX = IN.x0, topY = IN.by - IN.L * sn * sc, botX = IN.x0 + IN.L * c * sc;
        let s = sky(640, 360, '#E0F2FE', '#FFF8E7') + surfPat(0, 0);
        s += `<rect x="0" y="${IN.by}" width="640" height="20" fill="#9CCB6B"/>`;
        s += `<path d="M${topX} ${f1(topY)}L${f1(botX)} ${IN.by}H${topX}Z" fill="#E7D3B5" stroke="#8B5A2B" stroke-width="2.5"/>`;
        s += `<path d="M${topX} ${f1(topY)}L${f1(botX)} ${IN.by}" stroke="url(#${uid}-s-${S.surface})" stroke-width="12"/><path d="M${topX} ${f1(topY - 6)}L${f1(botX)} ${IN.by - 6}" stroke="#0F172A" stroke-width="1" opacity=".3"/>`;
        s += `<path d="M${f1(botX - 54)} ${IN.by}A54 54 0 0 1 ${f1(botX - 54 * c)} ${f1(IN.by - 54 * sn)}" fill="none" stroke="#1E293B" stroke-width="2.5"/>` + lbl(botX - 72, IN.by - 10, `${S.ang}\u00B0`, 'big', 'end');
        const d = S.s + IN.b / 2 + 0.05, b = IN.b * sc;
        const cx = topX + d * c * sc + sn * (b / 2 + 6), cy = topY + d * sn * sc - c * (b / 2 + 6);
        s += `<g transform="rotate(${f1(S.ang)} ${f1(cx)} ${f1(cy)})">${crate(cx, cy + b / 2, b, b, `${S.m}kg`)}</g>`;
        if (S.phase === 'held' && S.s <= 1e-6) { const px = topX + 0.02 * c * sc + sn * 10, pyy = topY + 0.02 * sn * sc - c * 10; s += `<circle cx="${f1(px)}" cy="${f1(pyy)}" r="7" fill="#E5484D" stroke="#7F1D1D" stroke-width="2"/>`; }
        const k = 80 / (S.m * G);
        s += arrow(cx, cy, cx, cy + S.m * G * k, '#E5484D', 5) + lbl(cx + 8, cy + S.m * G * k + 4, `mg ${n(S.m * G, 0)} N`, 'sm', 'start');
        s += arrow(cx, cy, cx + sn * q.N * k, cy - c * q.N * k, '#2563EB', 5) + lbl(cx + sn * q.N * k + 6, cy - c * q.N * k - 6, t(W.normal), 'sm', 'start');
        const fr = S.phase === 'slide' ? q.fk : S.phase === 'up' ? -q.fk : Math.min(q.down, q.hold);
        if (Math.abs(fr) > 0.01) s += arrow(cx, cy, cx - Math.sign(fr) * c * Math.abs(fr) * k, cy - Math.sign(fr) * sn * Math.abs(fr) * k, '#FF7A1A', 5);
        if (S.phase === 'up') s += arrow(cx + c * 60 + 10, cy + sn * 60, cx + c * 30, cy + sn * 30, '#16A34A', 7);
        s += hud(0, 14, [`${t(T('Down the slope', '\u0922\u0932\u093E\u0928 \u092A\u0930 \u0928\u0940\u091A\u0947'))}: ${n(q.down, 1)} N`, `${t(T('Friction can hold', '\u0918\u0930\u094D\u0937\u0923 \u0930\u094B\u0915 \u0938\u0915\u0924\u093E'))}: ${n(q.hold, 1)} N`, `${t(W.speed)}: ${n(Math.abs(S.phase === 'up' ? 0.6 : S.v), 2)} m/s`], 0, 628);
        return s;
      },
      out() { const q = inG(); return out([[SURF[S.surface].name, 'y'], [T(`mg sin \u03B8 = ${n(q.down, 1)} N`, `mg sin \u03B8 = ${n(q.down, 1)} N`), 'r'], [T(`\u03BCs mg cos \u03B8 = ${n(q.hold, 1)} N`, `\u03BCs mg cos \u03B8 = ${n(q.hold, 1)} N`), 'o'], [q.down > q.hold ? T('It will slide', '\u092F\u0939 \u092B\u093F\u0938\u0932\u0947\u0917\u093E') : T('Friction holds it', '\u0918\u0930\u094D\u0937\u0923 \u0907\u0938\u0947 \u0930\u094B\u0915 \u0932\u0947\u0917\u093E'), q.down > q.hold ? 'r' : 'g']], T('slides if tan \u03B8 > \u03BCs;  then a = g (sin \u03B8 \u2212 \u03BCk cos \u03B8)', '\u092B\u093F\u0938\u0932\u0924\u093E \u0939\u0948 \u092F\u0926\u093F tan \u03B8 > \u03BCs;  \u0924\u092C a = g (sin \u03B8 \u2212 \u03BCk cos \u03B8)')); },
    };

    // ENERGY: a pendulum (1 m) or a skater on a half-pipe (radius 3 m), no friction: PE + KE stays the same.
    const enL = () => SWING[S.obj].L;
    function rk(th, w, h) { const k = -G / enL(); const a1 = k * Math.sin(th), b1 = w; const a2 = k * Math.sin(th + b1 * h / 2), b2 = w + a1 * h / 2; const a3 = k * Math.sin(th + b2 * h / 2), b3 = w + a2 * h / 2; const a4 = k * Math.sin(th + b3 * h), b4 = w + a3 * h; return [th + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4), w + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4)]; }
    const periodExact = (a0) => 2 * Math.PI * Math.sqrt(enL() / G) * (1 + a0 * a0 / 16 + 11 * Math.pow(a0, 4) / 3072);
    M.energy = {
      vb: [640, 380],
      init() { S.obj = cfg.object || 'pendulum'; S.m = cfg.mass != null ? cfg.mass : 0.5; S.a0 = 40; S.th = S.a0 * Math.PI / 180; S.w = 0; S.on = false; S.tt = 0; S.turns = 0; S.lastW = 0; S.msg = T('Choose the starting angle and press Release. Watch the energy bars.', '\u0936\u0941\u0930\u0941\u0906\u0924\u0940 \u0915\u094B\u0923 \u091A\u0941\u0928\u094B \u0914\u0930 "\u091B\u094B\u0921\u093C\u094B" \u0926\u092C\u093E\u0913\u0964 \u090A\u0930\u094D\u091C\u093E \u0915\u0940 \u092A\u091F\u094D\u091F\u093F\u092F\u093E\u0901 \u0926\u0947\u0916\u094B\u0964'); },
      chips: () => [grpOf(W.object, 'object', SWING, S.obj)],
      sliders: () => [
        { name: 'angle', label: T('Starting angle', '\u0936\u0941\u0930\u0941\u0906\u0924\u0940 \u0915\u094B\u0923'), min: 10, max: 80, step: 5, get: () => S.a0, set: (v) => { S.a0 = v; if (!S.on) { S.th = v * Math.PI / 180; S.w = 0; } }, fmt: (v) => `${v}\u00B0` },
        { name: 'mass', label: T('Mass', '\u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 0.1, max: 2, step: 0.1, get: () => S.m, set: (v) => { S.m = v; }, fmt: (v) => `${n(v, 1)} kg` }],
      buttons() { return [{ key: 'release', label: S.on ? T('Stop', '\u0930\u094B\u0915\u094B') : T('Release', '\u091B\u094B\u0921\u093C\u094B'), icon: S.on ? '\u25A0' : '\u25B6' }]; },
      chip(kind, id) { stopRun(); S.obj = id; S.on = false; S.th = S.a0 * Math.PI / 180; S.w = 0; rebuild(); },
      slide() { paint(); say(); },
      act() {
        if (S.on) { stopRun(); S.on = false; S.th = S.a0 * Math.PI / 180; S.w = 0; api.emit('stopped'); rebuild(); paint(); return; }
        S.th = S.a0 * Math.PI / 180; S.w = 0; S.tt = 0; S.turns = 0; S.lastW = 0; S.on = true; rebuild();
        api.emit('moved'); rec(T(`Released from ${S.a0}\u00B0`, `${S.a0}\u00B0 \u0938\u0947 \u091B\u094B\u0921\u093C\u093E`));
        const a0 = S.a0 * Math.PI / 180, hgt = enL() * (1 - Math.cos(a0)), v = Math.sqrt(2 * G * hgt);
        S.vmax = v;
        if (reduced()) { this.measure(periodExact(a0)); S.on = false; rebuild(); return; }
        run();
      },
      measure(Tm) { const a0 = S.a0 * Math.PI / 180, hgt = enL() * (1 - Math.cos(a0)), v = Math.sqrt(2 * G * hgt), E = S.m * G * hgt; S.msg = T(`At the top all ${n(E, 2)} J is stored (potential) energy; at the bottom it is all movement (kinetic) energy, speed ${n(v, 2)} m/s. One full swing takes ${n(Tm, 2)} s, whatever the mass. (For small swings T = 2\u03C0\u221A(L/g) = ${n(2 * Math.PI * Math.sqrt(enL() / G), 2)} s; big swings take a little longer.)`, `\u090A\u092A\u0930 \u092A\u0942\u0930\u0940 ${n(E, 2)} J \u090A\u0930\u094D\u091C\u093E \u0938\u094D\u0925\u093F\u0924\u093F\u091C \u0939\u0948; \u0938\u092C\u0938\u0947 \u0928\u0940\u091A\u0947 \u092F\u0939 \u092A\u0942\u0930\u0940 \u0917\u0924\u093F\u091C \u090A\u0930\u094D\u091C\u093E \u0939\u0948, \u091A\u093E\u0932 ${n(v, 2)} m/s\u0964 \u090F\u0915 \u092A\u0942\u0930\u093E \u0926\u094B\u0932\u0928 ${n(Tm, 2)} s \u0932\u0947\u0924\u093E \u0939\u0948, \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u091A\u093E\u0939\u0947 \u091C\u094B \u0939\u094B\u0964 (\u091B\u094B\u091F\u0947 \u0926\u094B\u0932\u0928\u094B\u0902 \u0915\u0947 \u0932\u093F\u090F T = 2\u03C0\u221A(L/g) = ${n(2 * Math.PI * Math.sqrt(enL() / G), 2)} s; \u092C\u0921\u093C\u0947 \u0926\u094B\u0932\u0928 \u0925\u094B\u0921\u093C\u093E \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u0938\u092E\u092F \u0932\u0947\u0924\u0947 \u0939\u0948\u0902\u0964)`); api.emit('measured'); say(); },
      step(dt) {
        if (!S.on) return false;
        [S.th, S.w] = rk(S.th, S.w, dt); S.tt += dt;
        if (S.lastW !== 0 && Math.sign(S.w) !== Math.sign(S.lastW)) { S.turns++; if (S.turns === 2) this.measure(S.tt); }
        if (S.w !== 0) S.lastW = S.w;
        return true;
      },
      svg() {
        const px = 230, py = 36, R = 230, th = S.th, h = enL() * (1 - Math.cos(th)), v = enL() * Math.abs(S.w);
        const PE = S.m * G * h, KE = 0.5 * S.m * v * v, a0 = S.a0 * Math.PI / 180, E = S.m * G * enL() * (1 - Math.cos(a0));
        let s = sky(640, 380, '#EDE9FE', '#F8FAFC');
        const bx = px + R * Math.sin(th), by = py + R * Math.cos(th);
        if (S.obj === 'pendulum') {
          s += `<rect x="${px - 70}" y="20" width="140" height="16" rx="4" fill="#475569"/><path d="M${f1(px + R * Math.sin(-a0))} ${f1(py + R * Math.cos(a0))}A${R} ${R} 0 0 0 ${f1(px + R * Math.sin(a0))} ${f1(py + R * Math.cos(a0))}" fill="none" stroke="#8B3DFF" stroke-width="2" stroke-dasharray="6 6" opacity=".6"/>`;
          s += `<line x1="${px}" y1="${py}" x2="${f1(bx)}" y2="${f1(by)}" stroke="#334155" stroke-width="3"/><circle cx="${px}" cy="${py}" r="6" fill="#1E293B"/>`;
          const r = 12 + S.m * 8;
          s += `<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(r)}" fill="#F5B90A" stroke="#92400E" stroke-width="2.5"/><circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(r)}" fill="url(#${uid}-eg)"/>`;
        } else {
          s += `<path d="M${f1(px - R * Math.sin(1.4))} ${f1(py + R * Math.cos(1.4))}A${R} ${R} 0 0 0 ${f1(px + R * Math.sin(1.4))} ${f1(py + R * Math.cos(1.4))}L${f1(px + R * Math.sin(1.4))} 372L${f1(px - R * Math.sin(1.4))} 372Z" fill="#94A3B8" stroke="#334155" stroke-width="4"/>`;
          s += `<g transform="translate(${f1(bx)} ${f1(by)}) rotate(${f1(-th * 57.3)})"><rect x="-22" y="-8" width="44" height="6" rx="3" fill="#E5484D"/><circle cx="-14" cy="-1" r="3" fill="#1E293B"/><circle cx="14" cy="-1" r="3" fill="#1E293B"/><path d="M0 -10v-26" stroke="#2563EB" stroke-width="9" stroke-linecap="round"/><path d="M0 -26l-12 10M0 -26l12 -6" stroke="#2563EB" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="-44" r="8" fill="#F2B48A"/></g>`;
        }
        s += `<defs><radialGradient id="${uid}-eg" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".7"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".25"/></radialGradient></defs>`;
        const low = py + R;
        s += `<line x1="${px - 30}" y1="${low}" x2="${px + 30}" y2="${low}" stroke="#16A34A" stroke-width="2" stroke-dasharray="4 4"/>`;
        if (h > 0.005) s += `<line x1="${f1(bx + 26)}" y1="${f1(by)}" x2="${f1(bx + 26)}" y2="${low}" stroke="#2563EB" stroke-width="2"/>` + lbl(bx + 32, (by + low) / 2 + 5, `h ${n(h, 2)} m`, 'sm', 'start');
        const bar = (x, val, c, nm) => { const hh = E > 0 ? clamp(val / E, 0, 1) * 200 : 0; return `<rect x="${x}" y="70" width="32" height="200" rx="7" fill="#FFFFFF" stroke="#CBD5E1"/><rect x="${x}" y="${f1(270 - hh)}" width="32" height="${f1(hh)}" rx="7" fill="${c}"/>${lbl(x + 16, 292, nm, 'sm')}${lbl(x + 16, 292 + 20 * K, `${n(val, K > 1.1 ? 1 : 2)}`, 'sm')}`; };
        s += bar(500, PE, '#2563EB', 'PE') + bar(546, KE, '#FF7A1A', 'KE') + bar(592, PE + KE, '#22C55E', t(T('Total', '\u0915\u0941\u0932')));
        s += lbl(562, 56, t(T('Energy (J)', '\u090A\u0930\u094D\u091C\u093E (J)')), 'sm');
        s += hud(12, 300, [`${t(W.speed)}: ${n(v, 2)} m/s`, `${t(W.time)}: ${n(S.tt, 2)} s`], 190);
        return s;
      },
      out() { const a0 = S.a0 * Math.PI / 180, E = S.m * G * enL() * (1 - Math.cos(a0)); return out([[SWING[S.obj].name, 'p'], [T(`L = ${enL()} m`, `L = ${enL()} m`)], [T(`Total energy ${n(E, 2)} J`, `\u0915\u0941\u0932 \u090A\u0930\u094D\u091C\u093E ${n(E, 2)} J`), 'g'], [T(`Top speed ${n(Math.sqrt(2 * G * enL() * (1 - Math.cos(a0))), 2)} m/s`, `\u0938\u092C\u0938\u0947 \u091C\u093C\u094D\u092F\u093E\u0926\u093E \u091A\u093E\u0932 ${n(Math.sqrt(2 * G * enL() * (1 - Math.cos(a0))), 2)} m/s`), 'o']], T('PE = m g h,  KE = \u00BD m v\u00B2,  PE + KE stays the same (no friction)', 'PE = m g h,  KE = \u00BD m v\u00B2,  PE + KE \u0909\u0924\u0928\u093E \u0939\u0940 \u0930\u0939\u0924\u093E \u0939\u0948 (\u0918\u0930\u094D\u0937\u0923 \u0928\u0939\u0940\u0902)')); },
    };

    // GRAVITY: weight = m g on each body; a ball dropped from 20 m takes t = \u221A(2h/g); below the surface g = g0(1 \u2212 d/R).
    const HG = 20;
    const gNow = () => PLANET[S.obj].g * (1 - S.depth / 100);
    M.gravity = {
      vb: [640, 420],
      init() { S.obj = cfg.object || 'earth'; S.m = cfg.mass != null ? cfg.mass : 10; S.depth = 0; S.y = 0; S.tt = 0; S.on = false; S.msg = T('Pick a place and press Drop the ball. It falls 20 m. Compare the times.', '\u0915\u094B\u0908 \u091C\u0917\u0939 \u091A\u0941\u0928\u094B \u0914\u0930 "\u0917\u0947\u0902\u0926 \u0917\u093F\u0930\u093E\u0913" \u0926\u092C\u093E\u0913\u0964 \u092F\u0939 20 m \u0917\u093F\u0930\u0924\u0940 \u0939\u0948\u0964 \u0938\u092E\u092F \u0915\u0940 \u0924\u0941\u0932\u0928\u093E \u0915\u0930\u094B\u0964'); },
      chips: () => [grpOf(W.place, 'object', PLANET, S.obj, (id) => PLANET[id].disc[0])],
      sliders: () => [
        { name: 'mass', label: T('Mass on the spring scale', '\u0915\u092E\u093E\u0928\u0940\u0926\u093E\u0930 \u0924\u0941\u0932\u093E \u092A\u0930 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 1, max: 100, step: 1, get: () => S.m, set: (v) => { S.m = v; }, fmt: (v) => `${v} kg` },
        { name: 'depth', label: T('Depth below the surface (% of radius)', '\u0938\u0924\u0939 \u0915\u0947 \u0928\u0940\u091A\u0947 \u0917\u0939\u0930\u093E\u0908 (\u0924\u094D\u0930\u093F\u091C\u094D\u092F\u093E \u0915\u093E %)'), min: 0, max: 90, step: 10, get: () => S.depth, set: (v) => { S.depth = v; }, fmt: (v) => `${v}% (${n(PLANET[S.obj].R * v / 100, 0)} km)` }],
      buttons: () => [{ key: 'release', label: T('Drop the ball', '\u0917\u0947\u0902\u0926 \u0917\u093F\u0930\u093E\u0913'), icon: '\u2B07' }],
      chip(kind, id) { stopRun(); S.obj = id; S.y = 0; S.tt = 0; S.on = false; S.msg = T(`${t(PLANET[id].name)}: g = ${PLANET[id].g} m/s\u00B2.${PLANET[id].gas ? ' (Jupiter has no solid ground; this is at its cloud tops.)' : ''}`, `${PLANET[id].name.hi}: g = ${PLANET[id].g} m/s\u00B2\u0964${PLANET[id].gas ? ' (\u092C\u0943\u0939\u0938\u094D\u092A\u0924\u093F \u092A\u0930 \u0920\u094B\u0938 \u091C\u093C\u092E\u0940\u0928 \u0928\u0939\u0940\u0902 \u0939\u0948; \u092F\u0939 \u0909\u0938\u0915\u0947 \u092C\u093E\u0926\u0932\u094B\u0902 \u0915\u0947 \u090A\u092A\u0930 \u0915\u093E \u092E\u093E\u0928 \u0939\u0948\u0964)' : ''}`); rebuild(); },
      slide(name) { const g = gNow(); S.msg = name === 'depth' ? T(`${S.depth}% of the way to the centre, g = ${PLANET[S.obj].g} \u00D7 (1 \u2212 ${S.depth / 100}) = ${n(g, 2)} m/s\u00B2. Only the part of the planet below you pulls you.`, `\u0915\u0947\u0902\u0926\u094D\u0930 \u0915\u0940 \u0913\u0930 ${S.depth}% \u0917\u0939\u0930\u093E\u0908 \u092A\u0930 g = ${PLANET[S.obj].g} \u00D7 (1 \u2212 ${S.depth / 100}) = ${n(g, 2)} m/s\u00B2\u0964 \u0915\u0947\u0935\u0932 \u0924\u0941\u092E\u094D\u0939\u093E\u0930\u0947 \u0928\u0940\u091A\u0947 \u0935\u093E\u0932\u093E \u092D\u093E\u0917 \u0939\u0940 \u0924\u0941\u092E\u094D\u0939\u0947\u0902 \u0916\u0940\u0902\u091A\u0924\u093E \u0939\u0948\u0964`) : T(`Mass ${S.m} kg everywhere; weight here = ${S.m} \u00D7 ${n(g, 2)} = ${n(S.m * g, 1)} N.`, `\u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u0939\u0930 \u091C\u0917\u0939 ${S.m} kg; \u092F\u0939\u093E\u0901 \u092D\u093E\u0930 = ${S.m} \u00D7 ${n(g, 2)} = ${n(S.m * g, 1)} N\u0964`); api.emit('measured'); say(); paint(); },
      act() { stopRun(); S.y = 0; S.tt = 0; S.on = true; api.emit('moved'); rec(T(`Dropped the ball on ${t(PLANET[S.obj].name)}`, `${PLANET[S.obj].name.hi} \u092A\u0930 \u0917\u0947\u0902\u0926 \u0917\u093F\u0930\u093E\u0908`)); run(); },
      step(dt) {
        if (!S.on) return false;
        const g = gNow(); S.tt += dt; S.y = 0.5 * g * S.tt * S.tt;
        if (S.y >= HG) { S.y = HG; S.on = false; const tt = Math.sqrt(2 * HG / g); S.msg = T(`It fell 20 m in ${n(tt, 2)} s and hit the ground at ${n(g * tt, 1)} m/s. t = \u221A(2h \u00F7 g): stronger gravity, quicker fall. Every mass falls the same way (no air).`, `\u092F\u0939 20 m, ${n(tt, 2)} s \u092E\u0947\u0902 \u0917\u093F\u0930\u0940 \u0914\u0930 ${n(g * tt, 1)} m/s \u0938\u0947 \u091C\u093C\u092E\u0940\u0928 \u0938\u0947 \u091F\u0915\u0930\u093E\u0908\u0964 t = \u221A(2h \u00F7 g): \u0917\u0941\u0930\u0941\u0924\u094D\u0935 \u091C\u093F\u0924\u0928\u093E \u0924\u0947\u091C\u093C, \u0917\u093F\u0930\u0928\u093E \u0909\u0924\u0928\u093E \u091C\u0932\u094D\u0926\u0940\u0964 \u0939\u0930 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u090F\u0915 \u091C\u0948\u0938\u093E \u0917\u093F\u0930\u0924\u093E \u0939\u0948 (\u0939\u0935\u093E \u0928 \u0939\u094B \u0924\u094B)\u0964`); api.emit('stopped'); api.emit('measured'); say(); return false; }
        return true;
      },
      svg() {
        const P = PLANET[S.obj], dark = S.obj === 'moon' || S.obj === 'mercury' || S.obj === 'jupiter', g = gNow(), top = 60, gy = 380, sc = (gy - top) / HG;
        let s = sky(640, 420, P.sky[0], P.sky[1]);
        if (dark) for (let i = 0; i < 30; i++) s += `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 220}" r="${1 + (i % 3) * 0.5}" fill="#FFFFFF" opacity=".8"/>`;
        const ph = api.asset('planet-' + S.obj);
        s += `<g><clipPath id="${uid}-pc"><circle cx="560" cy="80" r="50"/></clipPath>${ph ? `<image href="${esc(ph)}" x="510" y="30" width="100" height="100" clip-path="url(#${uid}-pc)"/>` : `<circle cx="560" cy="80" r="50" fill="${P.disc[0]}"/><g clip-path="url(#${uid}-pc)">${S.obj === 'jupiter' ? [0, 1, 2, 3].map((k) => `<rect x="505" y="${44 + k * 20}" width="110" height="8" fill="${P.disc[1]}"/>`).join('') : `<circle cx="540" cy="66" r="18" fill="${P.disc[1]}"/><circle cx="582" cy="102" r="14" fill="${P.disc[1]}"/>`}<circle cx="560" cy="80" r="50" fill="url(#${uid}-ballg2)"/></g>`}`;
        if (S.depth > 0) s += `<path d="M560 80L610 80A50 50 0 0 0 560 30Z" fill="#F97316"/><path d="M560 80L605 80A45 45 0 0 0 560 35Z" fill="#FDE047" opacity=".6"/><circle cx="${f1(560 + 50 * (1 - S.depth / 100) * 0.7071)}" cy="${f1(80 - 50 * (1 - S.depth / 100) * 0.7071)}" r="5" fill="#E5484D" stroke="#FFFFFF" stroke-width="2"/>`;
        s += `</g><defs><radialGradient id="${uid}-ballg2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".35"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".35"/></radialGradient></defs>`;
        s += `<rect x="0" y="${gy}" width="640" height="${420 - gy}" fill="${P.ground}"/><rect x="0" y="${gy}" width="640" height="4" fill="#000000" opacity=".15"/>`;
        s += `<rect x="40" y="${top + 10}" width="70" height="${gy - top - 10}" fill="#CBD5E1" stroke="#475569" stroke-width="2.5"/>`;
        for (let k = 0; k < 8; k++) s += `<rect x="52" y="${top + 26 + k * 38}" width="18" height="16" fill="#64748B"/><rect x="80" y="${top + 26 + k * 38}" width="18" height="16" fill="#64748B"/>`;
        s += `<rect x="30" y="${top}" width="110" height="12" rx="3" fill="#475569"/>`;
        for (let k = 0; k <= HG; k += 5) s += `<line x1="150" y1="${f1(top + k * sc)}" x2="162" y2="${f1(top + k * sc)}" stroke="${dark ? '#E2E8F0' : '#1E293B'}" stroke-width="2"/>${lbl(170, top + k * sc + 5, `${HG - k} m`, dark ? 'sm lt' : 'sm', 'start')}`;
        const by = top - 14 + S.y * sc;
        s += `<circle cx="128" cy="${f1(Math.min(by, gy - 14))}" r="14" fill="#E5484D" stroke="#7F1D1D" stroke-width="2.5"/><circle cx="128" cy="${f1(Math.min(by, gy - 14))}" r="14" fill="url(#${uid}-ballg)"/>`;
        const stretch = clamp(S.m * g / 2479 * 110, 0, 110), sy = top + 34, mb = sy + 70 + stretch, mw = 40 + S.m * 0.3, mh = 28 + S.m * 0.22;
        s += `<rect x="360" y="${sy - 10}" width="140" height="10" rx="3" fill="#475569"/><rect x="424" y="${sy}" width="12" height="16" fill="#475569"/>` + coil(430, sy + 16, mb, 10, 11, '#E2E8F0') + coil(430, sy + 16, mb, 10, 11, '#334155').replace('stroke-width="3.5"', 'stroke-width="2"');
        s += `<rect x="${f1(430 - mw / 2)}" y="${f1(mb)}" width="${f1(mw)}" height="${f1(mh)}" rx="6" fill="url(#${uid}-blue)" stroke="#1E3A8A" stroke-width="2"/>`;
        s += lbl(430, mb + mh / 2 + 6, `${S.m} kg`, 'sm lt');
        s += hud(0, mb + mh + 12, [`g = ${n(g, 2)} m/s\u00B2`, `${t(W.weight)} = ${n(S.m * g, 1)} N`], 0, 520);
        s += hud(190, 12, [`${t(W.time)}: ${n(S.tt, 2)} s`, `${t(W.speed)}: ${n(g * S.tt, 1)} m/s`], 180);
        return s;
      },
      out() { const g = gNow(); return out([[PLANET[S.obj].name, 'b'], [T(`g = ${n(g, 2)} m/s\u00B2`, `g = ${n(g, 2)} m/s\u00B2`), 'y'], [T(`Mass ${S.m} kg`, `\u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 ${S.m} kg`)], [T(`Weight ${n(S.m * g, 1)} N`, `\u092D\u093E\u0930 ${n(S.m * g, 1)} N`), 'r'], g > 0 ? [T(`Fall time ${n(Math.sqrt(2 * HG / g), 2)} s`, `\u0917\u093F\u0930\u0928\u0947 \u0915\u093E \u0938\u092E\u092F ${n(Math.sqrt(2 * HG / g), 2)} s`), 'g'] : null], T('weight W = m \u00D7 g;   fall time t = \u221A(2h \u00F7 g)', '\u092D\u093E\u0930 W = m \u00D7 g;   \u0917\u093F\u0930\u0928\u0947 \u0915\u093E \u0938\u092E\u092F t = \u221A(2h \u00F7 g)')); },
    };

    // SPRING: Hooke's law F = k x; with a mass it bounces with period T = 2\u03C0\u221A(m/k).
    const SP = { top: 40, nat: 0.2, sc: 400, x: 200 };
    M.spring = {
      vb: [640, 420],
      init() { S.obj = cfg.object || 'medium'; S.load = cfg.mass != null ? Math.round(cfg.mass * 1000) : 200; S.ext = this.eq(); S.on = false; S.tt = 0; S.pts = S.load ? [{ s: S.obj, g: S.load, x: S.ext, F: (S.load / 1000) * G }] : []; S.msg = T('Add masses with the slider. How much does the spring stretch each time?', '\u0938\u094D\u0932\u093E\u0907\u0921\u0930 \u0938\u0947 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u091C\u094B\u0921\u093C\u094B\u0964 \u0939\u0930 \u092C\u093E\u0930 \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 \u0915\u093F\u0924\u0928\u093E \u0916\u093F\u0902\u091A\u0924\u093E \u0939\u0948?'); },
      eq() { return (S.load / 1000) * G / SPRINGS[S.obj].k; },
      chips: () => [grpOf(W.spring, 'object', SPRINGS, S.obj, (id) => SPRINGS[id].c)],
      sliders: () => [{ name: 'load', label: T('Mass hung on the spring', '\u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 \u092A\u0930 \u0932\u091F\u0915\u093E \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928'), min: 0, max: 500, step: 50, get: () => S.load, set: (v) => { S.load = v; }, fmt: (v) => `${v} g` }],
      buttons() { return [{ key: 'release', label: S.on ? T('Stop the bounce', '\u0909\u091B\u0932\u0928\u093E \u0930\u094B\u0915\u094B') : T('Pull down and let go', '\u0928\u0940\u091A\u0947 \u0916\u0940\u0902\u091A\u0915\u0930 \u091B\u094B\u0921\u093C\u094B'), icon: S.on ? '\u25A0' : '\u2195' }]; },
      chip(kind, id) { stopRun(); S.on = false; S.obj = id; rebuild(); this.slide(); },
      slide() {
        if (S.on) { stopRun(); S.on = false; rebuild(); }
        const from = S.ext, to = this.eq(), k = SPRINGS[S.obj].k, F = (S.load / 1000) * G;
        animate(600, (e) => { S.ext = lerp(from, to, e); }, () => {
          if (!S.pts.some((p) => p.s === S.obj && p.g === S.load)) S.pts.push({ s: S.obj, g: S.load, x: to, F });
          S.msg = T(`Force ${n(F, 2)} N stretches the ${t(SPRINGS[S.obj].name)} by ${n(to * 100, 1)} cm: x = F \u00F7 k = ${n(F, 2)} \u00F7 ${k}. Double the force, double the stretch.`, `${n(F, 2)} N \u0915\u093E \u092C\u0932 ${SPRINGS[S.obj].name.hi} \u0915\u094B ${n(to * 100, 1)} cm \u0916\u0940\u0902\u091A\u0924\u093E \u0939\u0948: x = F \u00F7 k = ${n(F, 2)} \u00F7 ${k}\u0964 \u092C\u0932 \u0926\u094B\u0917\u0941\u0928\u093E, \u0916\u093F\u0902\u091A\u093E\u0935 \u0926\u094B\u0917\u0941\u0928\u093E\u0964`);
          api.emit('measured'); rec(T(`${S.load} g \u2192 ${n(to * 100, 1)} cm`, `${S.load} g \u2192 ${n(to * 100, 1)} cm`)); say();
        });
      },
      act() {
        if (S.on) { stopRun(); S.on = false; S.ext = this.eq(); api.emit('stopped'); rebuild(); paint(); return; }
        if (!S.load) { api.toast(T('Hang a mass on the spring first.', '\u092A\u0939\u0932\u0947 \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 \u092A\u0930 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u0932\u091F\u0915\u093E\u0913\u0964')); return; }
        S.on = true; S.tt = 0; S.told = false; rebuild(); api.emit('moved');
        if (reduced()) { this.period(); S.on = false; S.ext = this.eq(); rebuild(); return; }
        run();
      },
      period() { const m = S.load / 1000, k = SPRINGS[S.obj].k, Tp = 2 * Math.PI * Math.sqrt(m / k); S.msg = T(`It bounces up and down once every ${n(Tp, 2)} s: T = 2\u03C0\u221A(m \u00F7 k) = 2\u03C0\u221A(${m} \u00F7 ${k}). A heavier mass or a softer spring bounces more slowly.`, `\u092F\u0939 \u0939\u0930 ${n(Tp, 2)} s \u092E\u0947\u0902 \u090F\u0915 \u092C\u093E\u0930 \u090A\u092A\u0930-\u0928\u0940\u091A\u0947 \u0939\u094B\u0924\u093E \u0939\u0948: T = 2\u03C0\u221A(m \u00F7 k) = 2\u03C0\u221A(${m} \u00F7 ${k})\u0964 \u092D\u093E\u0930\u0940 \u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 \u092F\u093E \u0928\u0930\u092E \u0938\u094D\u092A\u094D\u0930\u093F\u0902\u0917 \u0927\u0940\u0930\u0947 \u0909\u091B\u0932\u0924\u093E \u0939\u0948\u0964`); api.emit('measured'); say(); },
      step(dt) {
        if (!S.on) return false;
        const m = S.load / 1000, k = SPRINGS[S.obj].k, w = Math.sqrt(k / m);
        S.tt += dt; S.ext = this.eq() + 0.03 * Math.cos(w * S.tt);
        if (!S.told && S.tt >= 2 * Math.PI / w) { S.told = true; this.period(); }
        return true;
      },
      svg() {
        const sp = SPRINGS[S.obj], top = SP.top, bot = top + (SP.nat + S.ext) * SP.sc;
        let s = sky(640, 420, '#F0FDF4', '#F8FAFC');
        s += `<rect x="100" y="20" width="200" height="20" rx="4" fill="#475569"/>` + coil(SP.x, top, bot, 12, 16, sp.c);
        const nd = S.load / 50;
        s += `<line x1="${SP.x}" y1="${f1(bot)}" x2="${SP.x}" y2="${f1(bot + 12)}" stroke="#334155" stroke-width="3"/><rect x="${SP.x - 26}" y="${f1(bot + 12)}" width="52" height="5" fill="#334155"/>`;
        for (let i = 0; i < nd; i++) s += `<rect x="${SP.x - 24}" y="${f1(bot + 17 + i * 7)}" width="48" height="6" rx="2" fill="${i % 2 ? '#94A3B8' : '#CBD5E1'}" stroke="#475569"/>`;
        const r0 = top + SP.nat * SP.sc;
        s += `<rect x="248" y="${r0 - 6}" width="34" height="${0.6 * SP.sc + 12}" rx="4" fill="#FEF3C7" stroke="#B45309"/>`;
        for (let c = 0; c <= 60; c += 5) s += `<line x1="248" y1="${r0 + c * 4}" x2="${c % 10 ? 258 : 264}" y2="${r0 + c * 4}" stroke="#92400E" stroke-width="1.5"/>${c % 10 ? '' : `<text x="280" y="${r0 + c * 4 + 4}" text-anchor="end" style="font-size:${f1(10 * K)}px;font-weight:700;fill:#92400E">${c}</text>`}`;
        s += `<line x1="${SP.x + 10}" y1="${f1(bot)}" x2="252" y2="${f1(bot)}" stroke="#E5484D" stroke-width="2.5"/>` + lbl(255, r0 - 14, 'cm', 'sm', 'start');
        const gx = 360, gy = 340, gw = 250, gh = 260;
        s += `<rect x="${gx - 10}" y="${gy - gh - 30}" width="${gw + 30}" height="${gh + 70}" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>`;
        s += `<line x1="${gx}" y1="${gy}" x2="${gx + gw}" y2="${gy}" stroke="#1E293B" stroke-width="2"/><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - gh}" stroke="#1E293B" stroke-width="2"/>`;
        for (let k = 1; k <= 5; k++) s += `<line x1="${gx}" y1="${gy - k * gh / 5}" x2="${gx + gw}" y2="${gy - k * gh / 5}" stroke="#E2E8F0"/><text x="${gx - 4}" y="${gy - k * gh / 5 + 4}" text-anchor="end" style="font-size:${f1(10 * K)}px;font-weight:700;fill:#475569">${k}</text>`;
        for (let k = 1; k <= 5; k++) s += `<line x1="${gx + k * gw / 5}" y1="${gy}" x2="${gx + k * gw / 5}" y2="${gy - gh}" stroke="#E2E8F0"/><text x="${gx + k * gw / 5}" y="${gy + 14}" text-anchor="middle" style="font-size:${f1(10 * K)}px;font-weight:700;fill:#475569">${k * 10}</text>`;
        s += lbl(gx + gw / 2, gy + 32, t(T('stretch x (cm)', '\u0916\u093F\u0902\u091A\u093E\u0935 x (cm)')), 'sm') + lbl(gx + 4, gy - gh - 10, t(T('force F (N)', '\u092C\u0932 F (N)')), 'sm', 'start');
        Object.keys(SPRINGS).forEach((id) => { const ps = S.pts.filter((p) => p.s === id); if (ps.length >= 2) { const k = SPRINGS[id].k, xm = Math.min(0.5, 5 / k); s += `<line x1="${gx}" y1="${gy}" x2="${f1(gx + xm * 100 * gw / 50)}" y2="${f1(gy - k * xm * gh / 5)}" stroke="${SPRINGS[id].c}" stroke-width="2" opacity=".6"/>`; } });
        S.pts.forEach((p) => { s += `<circle cx="${f1(gx + p.x * 100 * gw / 50)}" cy="${f1(gy - p.F * gh / 5)}" r="5" fill="${SPRINGS[p.s].c}" stroke="#FFFFFF" stroke-width="1.5"/>`; });
        s += hud(12, 330, [`x = ${n(S.ext * 100, 1)} cm`, `F = ${n((S.load / 1000) * G, 2)} N`], 170);
        return s;
      },
      out() { const k = SPRINGS[S.obj].k, m = S.load / 1000; return out([[SPRINGS[S.obj].name, 'g'], [T(`Mass ${S.load} g \u2192 force ${n(m * G, 2)} N`, `\u0926\u094D\u0930\u0935\u094D\u092F\u092E\u093E\u0928 ${S.load} g \u2192 \u092C\u0932 ${n(m * G, 2)} N`), 'r'], [T(`Stretch ${n(this.eq() * 100, 1)} cm`, `\u0916\u093F\u0902\u091A\u093E\u0935 ${n(this.eq() * 100, 1)} cm`), 'b'], m > 0 ? [T(`Bounce time ${n(2 * Math.PI * Math.sqrt(m / k), 2)} s`, `\u0909\u091B\u093E\u0932 \u0915\u093E \u0938\u092E\u092F ${n(2 * Math.PI * Math.sqrt(m / k), 2)} s`), 'y'] : null], T('Hooke\'s law: F = k \u00D7 x', '\u0939\u0941\u0915 \u0915\u093E \u0928\u093F\u092F\u092E: F = k \u00D7 x')); },
    };

    // ---------- engine of the template ----------
    function rebuild() {
      const m = M[S.mode];
      root.querySelector('.fz-chips').innerHTML = (m.chips ? m.chips() : []).map((g) => `<div class="fz-grp" role="group" aria-label="${esc(t(g.label))}"><span class="fz-gl">${esc(t(g.label))}</span><div class="fz-row">${g.items.map((it) => `<button type="button" class="fz-chip" data-key="${esc(it.key)}" aria-pressed="${it.on ? 'true' : 'false'}">${it.sw ? `<span class="fz-sw" style="background:${it.sw}"></span>` : ''}${esc(t(it.label))}</button>`).join('')}</div></div>`).join('');
      root.querySelector('.fz-acts').innerHTML = (m.buttons ? m.buttons() : []).map((b) => `<button type="button" class="fz-btn ${b.cls || ''}" data-key="${esc(b.key)}"${b.dir ? ` data-dir="${b.dir}"` : ''}><span class="fz-ic" aria-hidden="true">${b.icon || ''}</span>${esc(t(b.label))}</button>`).join('');
      root.querySelector('.fz-ctl').innerHTML = (m.sliders ? m.sliders() : []).map((s) => { const id = `${uid}-${s.name}`, v = s.get(); return `<div class="fz-sl"><label for="${id}"><span>${esc(t(s.label))}</span><output id="${id}-o">${esc(s.fmt(v))}</output></label><div class="fz-slrow"><button type="button" class="fz-step" data-key="slider:${s.name}" data-step="-1" aria-label="${esc(t(T('Less', '\u0915\u092E')))}: ${esc(t(s.label))}">\u2212</button><input type="range" id="${id}" data-key="slider:${s.name}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"><button type="button" class="fz-step" data-key="slider:${s.name}" data-step="1" aria-label="${esc(t(T('More', '\u091C\u093C\u094D\u092F\u093E\u0926\u093E')))}: ${esc(t(s.label))}">+</button></div></div>`; }).join('');
      paint(); say();
    }
    function sliderDef(name) { return (M[S.mode].sliders() || []).find((s) => s.name === name); }
    function setSlider(name, v, input) {
      const d = sliderDef(name); if (!d) return;
      v = clamp(Math.round(v / d.step) * d.step, d.min, d.max); v = Math.round(v * 1000) / 1000;
      if (v === d.get()) { if (input) input.value = v; return; }
      d.set(v);
      const inp = root.querySelector(`#${uid}-${name}`); if (inp && inp !== input) inp.value = v;
      const o = root.querySelector(`#${uid}-${name}-o`); if (o) o.textContent = d.fmt(v);
      api.record(`${t(d.label)}: ${d.fmt(v)}`);
      if (M[S.mode].slide) M[S.mode].slide(name); else { paint(); say(); }
    }
    function paint() {
      if (!alive) return;
      const m = M[S.mode];
      const ae = document.activeElement, fk = ae && svg.contains(ae) && ae.getAttribute ? ae.getAttribute('data-key') : null;
      const vb = typeof m.vb === 'function' ? m.vb() : m.vb;
      svg.setAttribute('viewBox', `0 0 ${vb[0]} ${vb[1]}`);
      const sw = svg.getBoundingClientRect().width || vb[0];
      K = clamp(11.5 / (15 * sw / vb[0]), 1, 1.45); VBH = vb[1];
      svg.innerHTML = m.svg();
      if (fk) { const el = svg.querySelector(`[data-key="${fk}"]`); if (el) el.focus(); }
    }
    function frame(now) {
      raf = 0; if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let left = dt * (S.rate || 1), more = true;
      while (left > 1e-9 && more) { const h = Math.min(1 / 240, left); more = M[S.mode].step(h); left -= h; }
      paint();
      if (more) raf = requestAnimationFrame(frame);
    }
    function run() {
      if (!alive) return;
      if (reduced() || typeof requestAnimationFrame === 'undefined') { let k = 0; while (k++ < 200000 && M[S.mode].step(1 / 240)); paint(); return; }
      if (raf) return;
      last = performance.now(); raf = requestAnimationFrame(frame);
    }
    function stopRun() { if (raf) cancelAnimationFrame(raf); raf = 0; if (tw) { tw(); tw = null; } }
    let tw = null;
    function animate(ms, stepFn, done) { if (tw) tw(); tw = L.tween(ms, (k) => { stepFn(ease(k)); paint(); }, () => { tw = null; if (alive && done) done(); }); }

    const onClick = (e) => {
      if (!alive) return;
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.tagName === 'INPUT') return;
      if (el.closest('svg') && el.getAttribute('data-key') === 'fulcrum') return; // handled by drag and keys
      const key = el.getAttribute('data-key');
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (el.dataset.step) { const d = sliderDef(key.slice(7)); if (d) setSlider(d.name, d.get() + (+el.dataset.step) * d.step); return; }
      const i = key.indexOf(':'), kind = i > 0 ? key.slice(0, i) : key, id = i > 0 ? key.slice(i + 1) : '';
      const m = M[S.mode];
      if (kind === 'object' || kind === 'surface' || kind === 'fluid') { m.chip(kind, id); api.record(t(T('Chose ', '\u091A\u0941\u0928\u093E: ')) + el.textContent.trim()); return; }
      if (key === 'fulcrum') { m.act(key, el); return; }
      if (m.act) m.act(key, el);
    };
    root.addEventListener('click', onClick);
    const onInput = (e) => {
      if (!alive) return;
      const el = e.target; if (el.tagName !== 'INPUT') return;
      const key = el.dataset.key, name = key.slice(7), d = sliderDef(name); if (!d) return;
      if (!api.allowed(key)) { el.value = d.get(); api.nudge(key); return; }
      setSlider(name, +el.value, el);
    };
    root.addEventListener('input', onInput);
    // Dragging the fulcrum (class-1 lever), with arrow keys too.
    const sceneX = (ev) => { const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; return (ev.clientX - r.left) / r.width * vb.width; };
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-key="fulcrum"]'); if (!g) return;
      if (!api.allowed('fulcrum')) { api.nudge('fulcrum'); return; }
      drag = true; svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => { if (!drag || S.mode !== 'lever') return; const p = clamp(Math.round(((sceneX(e) - LV.x0) / LV.sc) * 20) / 20, 0.5, 1.5); if (p !== S.fx) { S.fx = p; M.lever.changed(false); } });
    const endDrag = () => { if (!drag) return; drag = false; rec(T(`Moved the fulcrum to ${n(S.fx, 2)} m`, `\u0906\u0932\u0902\u092C \u0915\u094B ${n(S.fx, 2)} m \u092A\u0930 \u0930\u0916\u093E`)); };
    svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest('[data-key="fulcrum"]'); if (!g) return;
      let d = 0; if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -0.05; else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = 0.05; else if (e.key === 'Enter' || e.key === ' ') d = S.fx >= 1.5 ? -1 : 0.1; else return;
      e.preventDefault();
      if (!api.allowed('fulcrum')) { api.nudge('fulcrum'); return; }
      M.lever.moveF(d);
    });

    M[S.mode].init.call(M[S.mode]);
    rebuild();
    return { destroy() { alive = false; stopRun(); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); } };
  }

  NCA_T.register({
    id: 'forces',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'buoyancy', object: 'egg', fluid: 'salt-water' },
    modes: MODES,
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
