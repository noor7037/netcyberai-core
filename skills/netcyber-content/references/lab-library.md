# Lab templates you may use

Generated from `labs/catalogue.json` (57 templates). Use the exact config keys, targets and events. `<id>` means one of the ids in your config; `*` matches any. You may not invent templates: if none fits, add a `lab_requests` entry.

## `beaker` — Beaker bench (बीकर बेंच)

Pour, mix, heat and test: real reactions, indicators, pH and gases.

- Subjects: science 6–10, chemistry 11–12, evs 3–5
- Config: `{ items: [substance id ×1–6], start?: [substance id], tools?: ['lamp'|'ph'|'electrolysis'|'limewater'|'splint'], hideEq?: boolean (true hides the balanced equation in the result card, for labs met before balancing is taught) }. The template's own substance list (zinc, hcl, pbno3, ki, cuso4, feso4, nail, copperwire, cao, water, soda, vinegar, naoh, bluelitmus, redlitmus, phenol, …) is extended by the builder to cover school chemistry: magnesium, sodium carbonate, lime water, ferrous sulphate crystals, silver chloride, salt solution, sugar, lemon juice, soap solution, universal indicator, turmeric, china rose, copper oxide, iron filings, sulphur, starch solution, iodine, alcohol, ethanoic acid, Benedict's-free biology tests (starch-iodine), milk, egg white, chalk, ammonium chloride, etc. Unknown ids fail validate().`
- Targets: `pick:<id>`, `beaker`, `clean`, `tool:<tool>`
- Events: `pick:<id>`, `add:<id>`, `reacted`, `clean`, `heated`, `tested:<tool>`, `ph:<0-14>`
- Notes: Every reaction from a checked table; indicators by acid/base/neutral rule; pH meter shows the substance's real pH band; gas tests: hydrogen pops, oxygen relights a glowing splint, CO2 turns lime water milky. Spirit lamp heating for thermal decomposition and water of crystallisation; electrolysis of water gives 2:1 hydrogen:oxygen.

## `particles` — Particle world (कणों की दुनिया)

See the particles inside solids, liquids and gases; heat, dissolve, diffuse and separate mixtures.

- Subjects: science 6–9, chemistry 11 (states, gas laws), evs 4–5
- Config: `{ mode: 'states'|'dissolve'|'diffusion'|'separate'|'gaslaw', substance?: 'water'|'wax'|'salt'|'sugar'|'ink'|'perfume'|'air', method?: 'filter'|'evaporate'|'distil'|'decant'|'magnet'|'sieve'|'chromatography'|'centrifuge'|'sublimation', mixture?: string id from the template's list }`
- Targets: `heat`, `cool`, `add`, `stir`, `run`, `slider:temp`, `slider:pressure`, `method:<method>`
- Events: `state:solid`, `state:liquid`, `state:gas`, `dissolved`, `spread`, `separated`, `changed:temp`, `changed:pressure`
- Notes: Particle motion speed from temperature; melting and boiling points of the chosen substance true; gas law mode keeps PV/T consistent.

## `atom` — Atom builder (परमाणु निर्माता)

Build atoms from protons, neutrons and electrons; shells, valency, isotopes and the periodic table.

- Subjects: science 9, chemistry 11 (structure of atom, periodic table), physics 12 (atoms, nuclei)
- Config: `{ mode: 'build'|'shells'|'isotopes'|'table'|'models', target?: element symbol (H to Ca for build/shells; any for table), show?: ['charge','mass','valency','config'] }`
- Targets: `add:proton`, `add:neutron`, `add:electron`, `remove:<particle>`, `element:<symbol>`, `model:<thomson|rutherford|bohr>`, `gold-foil`
- Events: `built:<symbol>`, `neutral`, `ion`, `isotope:<symbol>-<mass>`, `shell-full`, `picked:<symbol>`, `model:<name>`, `deflected`
- Notes: Element identity from proton count; shells 2,8,8 for Z ≤ 20; Rutherford scattering animation; periodic trends from real data.

## `molecule` — Molecule builder (अणु निर्माता)

Join atoms by sharing or giving electrons; see shapes, name carbon compounds.

- Subjects: science 9–10, chemistry 11–12
- Config: `{ mode: 'covalent'|'ionic'|'carbon'|'shapes'|'isomers', target?: formula or name the child should build (e.g. 'CH4','C2H4','NaCl','MgCl2','ethanol'), atoms?: ['C','H','O','N','Cl','Na','Mg'] }`
- Targets: `atom:<symbol>`, `bond:single`, `bond:double`, `bond:triple`, `group:<functional group>`, `view:dot`, `view:3d`, `transfer`
- Events: `built:<formula>`, `bonded`, `named:<name>`, `transferred`, `view:<name>`, `octet`
- Notes: Valency rules enforced; IUPAC names for alkanes, alkenes, alkynes up to C6 and the NCERT functional groups; VSEPR shapes for the NCERT list.

## `periodic` — Periodic table explorer (आवर्त सारणी)

Tap elements, see trends in size, metallic character and valency.

- Subjects: science 10 (formative), chemistry 11
- Config: `{ highlight?: 'groups'|'periods'|'metals'|'blocks'|'trend:size'|'trend:metallic'|'trend:electronegativity'|'trend:ionisation', focus?: [symbols], history?: 'dobereiner'|'newlands'|'mendeleev'|'modern' }`
- Targets: `element:<symbol>`, `trend:<name>`, `history:<name>`
- Events: `picked:<symbol>`, `trend:<name>`, `history:<name>`
- Notes: Real data for Z 1–54 at least; Döbereiner triads and Newlands octaves shown truthfully.

## `optics` — Optics bench (प्रकाशिकी बेंच)

Mirrors, lenses, glass slabs and prisms; rays and images from the real formulas.

- Subjects: science 6–10, physics 12 (ray and wave optics), evs 5
- Config: `{ element: 'plane'|'concave-mirror'|'convex-mirror'|'convex-lens'|'concave-lens'|'slab'|'prism'|'eye'|'combination'|'pinhole'|'shadow', f?: cm (5–40), n?: refractive index (1.0–2.5), object?: cm from the element, eye?: 'normal'|'myopia'|'hypermetropia', corrective?: boolean, white_light?: boolean }`
- Targets: `object`, `slider:object`, `slider:f`, `slider:angle`, `slider:n`, `lens:<type>`, `screen`, `toggle:rays`, `toggle:white`
- Events: `moved`, `image:real`, `image:virtual`, `image:at-infinity`, `image:sharp`, `refracted`, `tir`, `dispersed`, `corrected`
- Notes: Mirror and lens formulas with the NCERT sign convention; Snell's law; total internal reflection at the critical angle; dispersion order VIBGYOR; eye accommodation range 25 cm to infinity.

## `circuit` — Circuit builder (परिपथ निर्माता)

Build circuits with cells, bulbs, resistors, switches and meters; Ohm's law, series, parallel, power and house wiring.

- Subjects: science 6–10, physics 12 (current electricity, semiconductors), evs 5
- Config: `{ mode: 'free'|'ohm'|'series-parallel'|'resistivity'|'power'|'house'|'conductors'|'kirchhoff'|'wheatstone'|'diode'|'logic', parts?: ['cell','battery','bulb','resistor','switch','ammeter','voltmeter','rheostat','fuse','led','diode','wire:<material>'], preset?: string id of a starting layout }`
- Targets: `part:<part>`, `board`, `switch`, `slider:<name>`, `material:<name>`, `fault:short`, `fault:overload`, `appliance:<name>`
- Events: `closed`, `open`, `lit`, `reading:ammeter`, `reading:voltmeter`, `series`, `parallel`, `fused`, `tripped`, `plotted`, `conducts`, `insulates`
- Notes: Readings from Ohm's law and Kirchhoff's rules; resistance from ρl/A with real resistivities; bulbs' brightness from power; fuse melts above rating; house mode with live, neutral, earth, MCB.

## `field` — Fields lab (क्षेत्र प्रयोगशाला)

Magnetic and electric fields: magnets, compasses, current-carrying wires, coils, motors, induction and charges.

- Subjects: science 6, 8, 10, physics 12 (charges, fields, magnetism, EMI, AC)
- Config: `{ source: 'bar-magnet'|'two-magnets'|'wire'|'loop'|'solenoid'|'force-on-wire'|'motor'|'induction'|'charges'|'earth', show?: 'filings'|'compass'|'lines'|'vectors', charges?: [{q: -3..3, x, y}] }`
- Targets: `switch`, `reverse`, `magnet`, `compass`, `coil`, `slider:current`, `slider:turns`, `charge:<n>`, `sprinkle`
- Events: `on`, `off`, `reversed`, `moved`, `deflected`, `induced`, `rotated`, `attract`, `repel`, `lines`
- Notes: Right-hand thumb rule and Fleming's left-hand rule directions correct; induced current only while flux changes; Coulomb's law for charges.

## `motion` — Motion lab (गति प्रयोगशाला)

Make things move and see distance, speed, velocity and acceleration as numbers and graphs.

- Subjects: science 7–9, physics 11 (kinematics, projectile, circular motion), maths 9–11 (graphs)
- Config: `{ mode: '1d'|'graph-match'|'free-fall'|'projectile'|'circular'|'relative', vehicle?: 'car'|'cycle'|'ball'|'train'|'auto', u?: m/s, a?: m/s², angle?: degrees, g?: 9.8 }`
- Targets: `play`, `reset`, `slider:<u|a|angle|speed>`, `graph`, `drag:object`
- Events: `moving`, `stopped`, `landed`, `matched`, `graph:<dt|vt|at>`, `max-height`, `range`
- Notes: Equations of motion exact; graphs drawn from the same data; projectile range and height exact; no air resistance unless stated.

## `forces` — Forces and machines (बल और मशीनें)

Push, pull, friction, pressure, floating, levers, pulleys and Newton's laws.

- Subjects: science 6–9, physics 11 (laws of motion, work-energy, rotation, gravitation, fluids), evs 4–5
- Config: `{ mode: 'push'|'friction'|'newton2'|'collision'|'pressure'|'buoyancy'|'lever'|'pulley'|'inclined'|'energy'|'gravity'|'spring', surface?: 'ice'|'glass'|'wood'|'carpet'|'sand', object?: string, mass?: kg, fluid?: 'water'|'salt-water'|'oil' }`
- Targets: `push`, `slider:<force|mass|angle|depth|load|effort>`, `object:<name>`, `surface:<name>`, `fluid:<name>`, `release`, `fulcrum`
- Events: `moved`, `stopped`, `floats`, `sinks`, `balanced`, `lifted`, `collided`, `measured`
- Notes: F = ma; friction coefficients per surface; Archimedes' principle with real densities; lever and pulley mechanical advantage exact; momentum and energy conserved where they should be.

## `waves` — Waves and sound (तरंगें और ध्वनि)

Make waves and sounds; pitch, loudness, echoes, strings, pipes and interference.

- Subjects: science 8–9 (sound), physics 11 (waves, oscillations), physics 12 (wave optics, EM waves)
- Config: `{ mode: 'vibrate'|'string'|'pipe'|'echo'|'spring'|'pendulum'|'shm'|'interference'|'diffraction'|'spectrum', medium?: 'air'|'water'|'steel', play_sound?: boolean }`
- Targets: `pluck`, `slider:<frequency|amplitude|length|tension|distance>`, `medium:<name>`, `play`, `toggle:sound`
- Events: `vibrating`, `pitch:high`, `pitch:low`, `loud`, `soft`, `echo`, `resonance`, `fringes`, `period`
- Notes: Speed of sound per medium; v = fλ; string and pipe harmonics; pendulum T = 2π√(l/g); sound through Web Audio only after a tap, at a safe volume.

## `heat` — Heat lab (ऊष्मा प्रयोगशाला)

Temperature, conduction, convection, radiation, expansion and thermodynamics.

- Subjects: science 6–7, physics 11 (thermal properties, thermodynamics, kinetic theory), evs 4–5
- Config: `{ mode: 'thermometer'|'conduction'|'convection'|'radiation'|'expansion'|'mixing'|'cycle'|'sea-breeze', materials?: ['copper','steel','glass','wood','plastic'] }`
- Targets: `heat`, `slider:<temp|time>`, `material:<name>`, `mix`, `thermometer`
- Events: `reading`, `conducted`, `convected`, `expanded`, `equilibrium`, `cycle-done`
- Notes: Conductivities ranked truly; Celsius/Fahrenheit/Kelvin conversions exact; mixing by heat balance.

## `measure` — Measuring lab (मापन प्रयोगशाला)

Measure length, mass, volume, time and temperature with real instruments, from a scale to a vernier.

- Subjects: maths 1–6, evs 3–5, science 6, physics 11 (units, errors, vernier, screw gauge)
- Config: `{ instrument: 'scale'|'tape'|'balance'|'cylinder'|'clock'|'stopwatch'|'thermometer'|'vernier'|'screw-gauge'|'hand-span', object?: string, units?: 'cm'|'mm'|'m'|'g'|'kg'|'mL'|'L' }`
- Targets: `object:<name>`, `instrument`, `slider:<name>`, `read`, `answer`
- Events: `placed`, `aligned`, `measured`, `answered:right`, `answered:wrong`
- Notes: Least count and zero error for vernier and screw gauge; real object sizes; parallax shown.

## `data` — Data and graphs (आँकड़े और ग्राफ़)

Collect data, make tables, bar graphs, pictographs, pie charts, histograms and line graphs; find mean, median and mode.

- Subjects: maths 2–12 (data handling, statistics), economics 11 (statistics), geography 11–12 (practical work), science (experiment data)
- Config: `{ chart: 'tally'|'pictograph'|'bar'|'double-bar'|'pie'|'histogram'|'line'|'scatter'|'ogive'|'frequency-polygon', data: [{ label: {en,hi} or string, value: number }] or { rows: [[x, y]] }, ask?: 'mean'|'median'|'mode'|'range'|'max'|'min'|'correlation' }`
- Targets: `bar:<i>`, `add-row`, `chart:<type>`, `answer`, `slider:<i>`
- Events: `plotted`, `changed`, `answered:right`, `answered:wrong`, `sorted`
- Notes: Statistics computed exactly; charts drawn to scale; data must be the lab's own given numbers (no invented statistics about real places presented as fact).

## `number-line` — Number line (संख्या रेखा)

Jump, zoom and place numbers: counting, integers, fractions, decimals and real numbers.

- Subjects: maths 1–10
- Config: `{ min: number, max: number, step?: number, mode: 'count'|'add'|'subtract'|'place'|'compare'|'zoom'|'integers'|'irrational', start?: number, jumps?: [number], ask?: number or expression string like '-3+5' or 'sqrt(2)' }`
- Targets: `jump:+`, `jump:-`, `slider:value`, `marker`, `zoom`, `answer`
- Events: `landed:<n>`, `placed`, `compared`, `zoomed`, `answered:right`, `answered:wrong`
- Notes: Exact arithmetic (no float drift shown); √2 constructed by the spiral method in irrational mode.

## `fractions` — Fraction kitchen (भिन्न रसोई)

Cut a roti or a chocolate bar into equal parts; compare, add and find equivalent fractions.

- Subjects: maths 2–7
- Config: `{ object: 'roti'|'bar'|'pizza'|'jar', bars: [{ n: 1–12, k?: shaded count, lock?: boolean }] (1–2 bars), op?: 'compare'|'add'|'subtract'|'equivalent' }`
- Targets: `cut:<i>`, `piece:<i>`
- Events: `cut:<i>:<n>`, `shade:<i>:<k>/<n>`, `equal`
- Notes: Port the prototype (docs/family-app/mockups/netcyberai-labs/templates.js) and add pizza and jar looks and add/subtract.

## `place-value` — Place value blocks (स्थानीय मान के ब्लॉक)

Ones, tens, hundreds and thousands with blocks and an abacus; regroup to add and subtract.

- Subjects: maths 1–5
- Config: `{ mode: 'build'|'abacus'|'add'|'subtract'|'expand'|'compare', target?: integer 0–99999, a?: integer, b?: integer, places?: 2–5 }`
- Targets: `add:<ones|tens|hundreds|thousands>`, `remove:<place>`, `regroup`, `bead:<place>`, `answer`
- Events: `built:<n>`, `regrouped`, `answered:right`, `answered:wrong`
- Notes: Indian place names (lakh appear at 6 digits if places=6).

## `shapes` — Geometry studio (ज्यामिति स्टूडियो)

Draw and construct with ruler, compass and protractor; angles, triangles, circles, symmetry, congruence and similarity.

- Subjects: maths 1–10 (shapes, angles, triangles, quadrilaterals, circles, constructions, symmetry, transformations)
- Config: `{ mode: 'identify'|'angle'|'triangle'|'quadrilateral'|'circle'|'construct'|'symmetry'|'congruence'|'similarity'|'transform'|'tangram'|'pythagoras', task?: string id from the template's list (e.g. 'bisect-angle','perpendicular-bisector','triangle-sss','tangent-from-point','divide-segment'), given?: { lengths?: [cm], angles?: [deg] } }`
- Targets: `tool:ruler`, `tool:compass`, `tool:protractor`, `point:<name>`, `drag:<point>`, `slider:<name>`, `mirror`, `piece:<n>`, `answer`
- Events: `drawn`, `measured:<value>`, `constructed`, `symmetric`, `congruent`, `similar`, `proved`, `answered:right`, `answered:wrong`
- Notes: Geometry exact (measures shown to 1 decimal); constructions only with the allowed tools; theorems demonstrated, never asserted wrongly.

## `solids` — 3D shapes (त्रिविमीय आकार)

Turn, unfold and fill solids: nets, faces, edges, surface area and volume.

- Subjects: maths 1–10 (shapes around us, nets, mensuration, surface areas and volumes), maths 12 (3D geometry)
- Config: `{ solid: 'cube'|'cuboid'|'cylinder'|'cone'|'sphere'|'hemisphere'|'prism'|'pyramid'|'frustum'|'combination', dims?: { l?, b?, h?, r? } in cm, mode: 'turn'|'net'|'count'|'surface'|'volume'|'fill'|'cut' }`
- Targets: `rotate`, `unfold`, `fill`, `slider:<l|b|h|r>`, `face:<n>`, `answer`
- Events: `unfolded`, `filled`, `counted`, `answered:right`, `answered:wrong`
- Notes: Formulas exact with π = 22/7 or 3.14 as the lab says; nets valid; three.js optional, canvas fallback required.

## `algebra` — Algebra balance (बीजगणित तराज़ू)

Balance equations, use algebra tiles, expand and factorise.

- Subjects: maths 6–11 (equations, expressions, identities, polynomials, linear equations, quadratics)
- Config: `{ mode: 'balance'|'tiles'|'expand'|'factorise'|'pattern'|'solve-pair', equation?: string like '3x+5=20' or '(x+2)(x+3)', unknown?: 'x' }`
- Targets: `side:left`, `side:right`, `op:<+|-|×|÷>`, `tile:<x2|x|1|-x|-1>`, `answer`, `slider:x`
- Events: `balanced`, `solved:<value>`, `expanded`, `factorised`, `answered:right`, `answered:wrong`
- Notes: Symbolic steps checked exactly; only operations applied to both sides keep the balance.

## `grapher` — Graph studio (ग्राफ़ स्टूडियो)

Plot points, lines and curves; change a, b, c and see the graph move; slopes, areas and limits.

- Subjects: maths 6–12 (coordinates, linear equations, polynomials, trigonometric functions, calculus, linear programming), physics and economics graphs
- Config: `{ mode: 'points'|'line'|'pair'|'quadratic'|'polynomial'|'trig'|'exp-log'|'derivative'|'integral'|'inequality'|'lp', expr?: string (a safe expression parsed by the template, no eval), params?: { a?: [min,max,start], b?, c? }, points?: [[x,y]] }`
- Targets: `point:add`, `slider:<a|b|c|x>`, `zoom`, `answer`, `tangent`, `area`
- Events: `plotted`, `changed`, `intersect`, `root`, `max`, `min`, `answered:right`, `answered:wrong`
- Notes: A small expression parser (numbers, x, + − × ÷ ^, sin cos tan, sqrt, log, ln, exp, abs, π, e); never eval.

## `trig` — Trigonometry wheel (त्रिकोणमिति चक्र)

Unit circle, ratios, heights and distances with a real clinometer.

- Subjects: maths 10–11
- Config: `{ mode: 'ratios'|'unit-circle'|'heights'|'identities'|'graphs', angle?: degrees, scene?: 'tower'|'tree'|'kite'|'building'|'river', ask?: 'height'|'distance'|'angle' }`
- Targets: `slider:angle`, `drag:observer`, `answer`, `toggle:<ratio>`
- Events: `changed`, `measured`, `answered:right`, `answered:wrong`
- Notes: Standard angles exact (0, 30, 45, 60, 90); identities shown numerically.

## `probability` — Chance lab (संभावना प्रयोगशाला)

Toss coins, roll dice, spin spinners and draw cards; watch experimental probability approach the theory.

- Subjects: maths 6–12
- Config: `{ device: 'coin'|'die'|'two-dice'|'spinner'|'bag'|'cards', spinner?: [{label, weight}], bag?: [{colour, count}], ask?: string id of an event from the template's list (e.g. 'head','even','sum-7','red','ace') }`
- Targets: `toss`, `toss:10`, `toss:100`, `answer`, `reset`
- Events: `tossed`, `trend`, `answered:right`, `answered:wrong`
- Notes: Fair random draws; theoretical probabilities exact fractions.

## `money` — Shop and money (दुकान और पैसे)

Indian coins and notes; buy, pay and get change; profit, loss, discount and interest.

- Subjects: maths 1–8, economics 11–12 (basic), business studies
- Config: `{ mode: 'count'|'pay'|'change'|'bill'|'profit-loss'|'discount'|'simple-interest'|'compound-interest'|'budget', items?: [{ name: {en,hi}, price: rupees }], budget?: rupees, rate?: percent, years?: number }`
- Targets: `coin:<value>`, `note:<value>`, `item:<i>`, `pay`, `answer`, `slider:<rate|years|price>`
- Events: `paid`, `change:<amount>`, `answered:right`, `answered:wrong`, `over-budget`
- Notes: Current Indian denominations (₹1, 2, 5, 10, 20 coins; ₹10, 20, 50, 100, 200, 500 notes); arithmetic exact in paise.

## `clock` — Clock and calendar (घड़ी और कैलेंडर)

Set the time, read clocks, count days, weeks and months.

- Subjects: maths 1–5, evs 3
- Config: `{ mode: 'read'|'set'|'elapsed'|'calendar'|'24h', time?: 'HH:MM', ask?: 'HH:MM' or a duration in minutes, month?: 1–12 }`
- Targets: `hand:hour`, `hand:minute`, `day:<n>`, `answer`
- Events: `set:<HH:MM>`, `answered:right`, `answered:wrong`
- Notes: Hour hand moves with minutes; real calendar month lengths.

## `pattern` — Pattern maker (पैटर्न निर्माता)

Continue and create patterns with shapes, colours and numbers; sequences and progressions.

- Subjects: maths 1–11 (patterns, AP, GP, sequences)
- Config: `{ kind: 'shapes'|'colours'|'numbers'|'ap'|'gp'|'figurate', seed: [items or numbers], rule?: string like '+3' or '×2' or 'abb', show?: integer }`
- Targets: `tile:<i>`, `answer`, `next`, `slider:<a|d|r|n>`
- Events: `extended`, `rule-found`, `sum`, `answered:right`, `answered:wrong`
- Notes: AP and GP terms and sums exact.

## `matrix` — Matrices and vectors (आव्यूह और सदिश)

Add and multiply matrices, find determinants; draw and add vectors in 2D and 3D.

- Subjects: maths 11–12 (matrices, determinants, vectors, 3D geometry), physics 11 (vectors)
- Config: `{ mode: 'matrix-add'|'matrix-multiply'|'determinant'|'inverse'|'vector-add'|'dot'|'cross'|'line-3d', a?: number[][], b?: number[][], u?: [x,y,z], v?: [x,y,z] }`
- Targets: `cell:<r>-<c>`, `drag:<vector>`, `answer`, `op:<name>`
- Events: `computed`, `answered:right`, `answered:wrong`, `resultant`
- Notes: Exact rational arithmetic.

## `sky` — Sky and space (आकाश और अंतरिक्ष)

Sun, Earth and Moon in 3D: day and night, seasons, phases, eclipses, the solar system and stars.

- Subjects: evs 3–5, science 6–8, geography 6 and 11, physics 11 (gravitation, satellites)
- Config: `{ mode: 'moon-phases'|'day-night'|'seasons'|'eclipse'|'solar-system'|'constellations'|'orbits'|'satellite', startDay?: number }`
- Targets: `slider`, `play`, `planet:<name>`, `toggle:<orbit|tilt|labels>`, `drag:<body>`
- Events: `phase:<name>`, `play`, `season:<name>`, `eclipse:<solar|lunar>`, `picked:<planet>`, `orbit`
- Notes: Port the prototype; Earth's 23.5° tilt for seasons; real planet order and relative facts; three.js r128 with a 2D fallback.

## `earth` — Earth lab (पृथ्वी प्रयोगशाला)

Layers of the Earth, rocks, soil, volcanoes, earthquakes, the water cycle, weather and climate.

- Subjects: evs 3–5, science 6–9, geography 6–12 (landforms, interior, rocks, weathering, atmosphere, water, climate)
- Config: `{ mode: 'layers'|'rock-cycle'|'soil'|'volcano'|'earthquake'|'plates'|'water-cycle'|'weather'|'winds'|'monsoon'|'erosion'|'groundwater'|'atmosphere-layers', region?: 'india'|'world' }`
- Targets: `slider:<name>`, `play`, `layer:<name>`, `rock:<name>`, `toggle:<name>`, `drop`
- Events: `revealed:<name>`, `erupted`, `shook`, `rained`, `eroded`, `formed:<rock>`, `cycle-done`
- Notes: Layer depths and temperatures from NCERT; monsoon winds over India in the right directions and months.

## `map` — Map explorer (मानचित्र अन्वेषक)

India and world maps with layers: rivers, mountains, states, climate, soils, crops, resources, industries, routes and historical places.

- Subjects: evs 3–5, social science 6–10, geography 11–12, history 6–12, economics (resources)
- Config: `{ base: 'india'|'world'|'asia'|'state:<code>', layers: [layer ids from the template's list: 'states','rivers','mountains','plateaus','deserts','climate','rainfall','soils','forests','crops:<crop>','minerals:<mineral>','industries','ports','railways','national-parks','dams','historic:<period>','latitude','time-zones'], task?: 'locate'|'label'|'compare'|'route', places?: [place ids], ask?: string }`
- Targets: `place:<id>`, `layer:<id>`, `zoom`, `pin`, `answer`
- Events: `located:<id>`, `layer:<id>`, `answered:right`, `answered:wrong`, `labelled`
- Notes: Map shapes from public-domain data (Natural Earth, or official Survey of India outlines); India's boundaries as officially depicted by the Government of India; no invented statistics. Bundle simplified GeoJSON inside the template.

## `globe` — Globe lab (ग्लोब प्रयोगशाला)

Latitude, longitude, time zones, the Indian Standard Time, heat zones and directions.

- Subjects: social science 6, geography 11, evs 4–5 (directions)
- Config: `{ mode: 'grid'|'time'|'zones'|'directions'|'scale', place?: string }`
- Targets: `rotate`, `slider:<lat|long>`, `place:<id>`, `answer`
- Events: `located`, `time:<HH:MM>`, `answered:right`, `answered:wrong`
- Notes: IST at 82°30′E; 15° per hour.

## `timeline` — Timeline (समयरेखा)

Place events, people and inventions in time; BCE and CE; cause and effect.

- Subjects: social science 6–10 (history), history 11–12, political science 12, science (history of ideas)
- Config: `{ range: [start year, end year] (negative = BCE), events: [{ id, year, label: {en,hi}, detail?: {en,hi}, image?: asset id }], task: 'order'|'place'|'cause-effect'|'compare' }`
- Targets: `event:<id>`, `slot:<year>`, `answer`, `zoom`
- Events: `placed:<id>`, `ordered`, `answered:right`, `answered:wrong`
- Notes: Years must come from the NCERT chapter; no invented dates.

## `scenario` — Role play (भूमिका निभाओ)

Step into a situation and choose what to do: a voter, a panchayat member, a consumer, a manager, a judge.

- Subjects: social science 6–10 (civics, economics), political science 11–12, business studies 11–12, sociology, psychology, evs (safety, health), english (situations)
- Config: `{ setting: string, role: {en,hi}, scenes: [{ id, text: {en,hi}, image?: asset id, choices: [{ id, text: {en,hi}, next: scene id or 'end', feedback: {en,hi}, good?: boolean }] }] (2–8 scenes) }`
- Targets: `choice:<scene>:<choice>`, `next`, `restart`
- Events: `chose:<choice>`, `ended`, `ended:good`
- Notes: Branching graph validated (every next exists, every path ends); no real living politicians or parties.

## `economy` — Economy simulator (अर्थव्यवस्था सिम्युलेटर)

Markets, demand and supply, production, costs, national income, money, banks and budgets.

- Subjects: social science 9–10 (economics), economics 11–12, business studies 12 (financial markets)
- Config: `{ mode: 'demand-supply'|'elasticity'|'costs'|'revenue'|'production'|'circular-flow'|'national-income'|'money-creation'|'multiplier'|'budget'|'exchange-rate'|'sectors'|'credit', params?: object of numbers named by the mode }`
- Targets: `slider:<name>`, `shift:<demand|supply>:<left|right>`, `play`, `answer`, `toggle:<name>`
- Events: `equilibrium`, `shifted`, `computed`, `answered:right`, `answered:wrong`
- Notes: Textbook models exactly (linear demand and supply, cost curves, Keynesian multiplier 1/(1−MPC), money multiplier 1/rr); illustrative numbers, never presented as real data.

## `ledger` — Accounts book (लेखा पुस्तक)

Journal, ledger, trial balance and final accounts: post real transactions and watch them balance.

- Subjects: accountancy 11–12
- Config: `{ mode: 'equation'|'journal'|'ledger'|'cash-book'|'trial-balance'|'brs'|'depreciation'|'final-accounts'|'partnership'|'shares'|'ratios'|'cash-flow', business?: string name, transactions: [{ id, date: 'YYYY-MM-DD', text: {en,hi}, amount: rupees, debit?: account, credit?: account }], method?: 'slm'|'wdv' }`
- Targets: `txn:<id>`, `account:<name>`, `debit`, `credit`, `post`, `balance`, `answer`
- Events: `journalised:<id>`, `posted:<id>`, `balanced`, `tallied`, `answered:right`, `answered:wrong`
- Notes: Double entry checked; debit and credit rules (modern and traditional); the accounting equation always holds; Indian formats (₹).

## `business` — Business builder (व्यवसाय निर्माता)

Run a small business: forms of organisation, management, marketing mix, finance and consumer protection.

- Subjects: business studies 11–12, economics (entrepreneurship), social science 10 (consumer rights)
- Config: `{ mode: 'form-of-org'|'org-chart'|'planning'|'marketing-mix'|'pricing'|'break-even'|'working-capital'|'consumer'|'trade-channels', business?: { name: {en,hi}, type: string }, params?: object }`
- Targets: `choice:<id>`, `slider:<name>`, `drag:<card>`, `slot:<id>`, `answer`
- Events: `decided`, `placed`, `break-even`, `answered:right`, `answered:wrong`
- Notes: Break-even = fixed cost / (price − variable cost) exact.

## `code` — Code lab (कोड प्रयोगशाला)

Algorithms step by step: blocks, flowcharts, Python-like code, sorting, searching, stacks and queues.

- Subjects: computer science 11–12, informatics practices 11–12, maths (algorithms), vocational
- Config: `{ mode: 'blocks'|'flowchart'|'trace'|'sort'|'search'|'stack'|'queue'|'recursion'|'binary'|'boolean', algorithm?: 'bubble'|'insertion'|'selection'|'linear'|'binary', data?: [numbers], program?: [lines of a tiny safe language the template interprets: set, print, if, else, while, for, functions] }`
- Targets: `step`, `run`, `reset`, `block:<id>`, `slider:speed`, `answer`
- Events: `stepped`, `done`, `output`, `answered:right`, `answered:wrong`
- Notes: Its own tiny interpreter; never eval; loop limit to stop infinite loops.

## `logic` — Logic gates and bits (लॉजिक गेट और बिट)

Binary numbers, AND, OR, NOT, NAND, NOR and truth tables; how computers store data.

- Subjects: computer science 11–12, physics 12 (logic gates), maths 11 (logic)
- Config: `{ mode: 'binary'|'gates'|'truth-table'|'encoding'|'adder', gates?: ['AND','OR','NOT','NAND','NOR','XOR'], value?: integer }`
- Targets: `bit:<i>`, `input:<name>`, `gate:<name>`, `answer`
- Events: `toggled`, `output:<0|1>`, `converted`, `answered:right`, `answered:wrong`
- Notes: Truth tables exact.

## `table` — Data table lab (डेटा तालिका प्रयोगशाला)

Tables, SQL queries, sorting, filtering and simple data analysis on a sample dataset.

- Subjects: informatics practices 11–12, computer science 12 (databases), maths and economics (data)
- Config: `{ mode: 'sql'|'sort-filter'|'group'|'join'|'spreadsheet', tables: { <name>: { columns: [string], rows: [[...]] } }, task?: { en, hi } }`
- Targets: `run`, `column:<name>`, `filter`, `answer`
- Events: `queried`, `result`, `answered:right`, `answered:wrong`
- Notes: A small SQL subset interpreted by the template (SELECT, WHERE, ORDER BY, GROUP BY, COUNT, SUM, AVG, MIN, MAX, JOIN); sample data invented and labelled as sample.

## `scope` — Microscope (सूक्ष्मदर्शी)

Prepare a slide, focus and zoom: cells, tissues, microbes, stomata and more.

- Subjects: science 6–10, biology 11–12
- Config: `{ slide: string id from the template's list ('onion-peel','cheek-cells','leaf-peel','stomata','blood-smear','amoeba','paramecium','yeast','bread-mould','pollen','root-tip','xylem','muscle','nerve','bacteria','spirogyra'), stain?: 'none'|'iodine'|'methylene-blue'|'safranin', task?: 'focus'|'identify'|'count'|'draw' }`
- Targets: `knob:coarse`, `knob:fine`, `lens:<4x|10x|40x>`, `stain:<name>`, `part:<name>`, `answer`
- Events: `focused`, `zoomed:<x>`, `stained`, `identified:<part>`, `answered:right`, `answered:wrong`
- Notes: Slides drawn as realistic canvas/SVG micrographs; uses asset images when the founder adds them.

## `body` — Body explorer (शरीर अन्वेषक)

Open the human body system by system and follow food, air, blood, urine and nerve signals.

- Subjects: evs 3–5, science 6–10, biology 11–12, physical education
- Config: `{ system: 'skeleton'|'muscles'|'digestive'|'respiratory'|'circulatory'|'heart'|'excretory'|'nervous'|'brain'|'eye'|'ear'|'skin'|'endocrine'|'reproductive'|'teeth'|'immune', flow?: 'food'|'air'|'blood'|'urine'|'signal', task?: 'explore'|'label'|'trace'|'order' }`
- Targets: `part:<name>`, `play`, `layer:<name>`, `rotate`, `answer`
- Events: `picked:<part>`, `traced`, `ordered`, `answered:right`, `answered:wrong`
- Notes: Anatomically correct positions; calm, textbook register for the reproductive system (labels and diagrams only); uses 3DM asset views when available, SVG otherwise.

## `plant` — Plant lab (पौधा प्रयोगशाला)

Grow plants and change light, water and soil; parts of a plant, photosynthesis, transpiration and germination.

- Subjects: evs 1–5, science 6–10, biology 11–12 (plant physiology, morphology)
- Config: `{ mode: 'grow'|'parts'|'photosynthesis'|'transpiration'|'germination'|'tropism'|'flower'|'seed-dispersal'|'leaf-types'|'root-types', plant?: 'bean'|'gram'|'maize'|'mustard'|'hibiscus'|'tulsi'|'mango'|'balsam', variables?: ['light','water','soil','air','temperature'] }`
- Targets: `slider:<variable>`, `play`, `part:<name>`, `pot:<n>`, `answer`
- Events: `grew`, `wilted`, `bent`, `germinated`, `bubbles`, `identified:<part>`, `answered:right`, `answered:wrong`
- Notes: Growth responds truthfully to the variables (no light, no photosynthesis); time-lapse with a day counter.

## `cross` — Genetics cross (आनुवंशिक संकरण)

Cross plants and animals, fill Punnett squares, count ratios; DNA, chromosomes and sex determination.

- Subjects: science 10, biology 12 (inheritance, molecular basis)
- Config: `{ mode: 'monohybrid'|'dihybrid'|'test-cross'|'incomplete-dominance'|'blood-groups'|'sex'|'dna'|'pedigree', trait?: 'height'|'seed-shape'|'seed-colour'|'flower-colour', parents?: [genotype, genotype] }`
- Targets: `parent:<n>`, `cross`, `cell:<r>-<c>`, `grow`, `answer`
- Events: `crossed`, `filled`, `grown`, `ratio`, `answered:right`, `answered:wrong`
- Notes: Mendelian ratios exact; random offspring counts approach them.

## `eco` — Ecosystem (पारितंत्र)

Food chains, food webs, energy flow, cycles of matter, habitats, adaptation and waste.

- Subjects: evs 1–5, science 6–10, biology 12 (ecology), geography 11 (biodiversity)
- Config: `{ mode: 'chain'|'web'|'pyramid'|'cycle:<carbon|nitrogen|water|oxygen>'|'habitat'|'adaptation'|'waste'|'population', organisms?: [ids from the template's list], habitat?: 'pond'|'forest'|'desert'|'grassland'|'mountain'|'sea'|'farm' }`
- Targets: `card:<id>`, `link`, `sun`, `bin:<green|blue>`, `play`, `answer`
- Events: `linked`, `energy`, `sorted`, `balanced`, `cycle-done`, `answered:right`, `answered:wrong`
- Notes: 10 per cent energy rule; organisms placed at true trophic levels; Indian species.

## `balance` — Balance the equation (समीकरण बैलेंस करो)

Change coefficients with − and +; an atom counter turns green when both sides match.

- Subjects: chemistry (Classes 9–12)
- Config: `{ equations: [{ id, left: [formula], right: [formula], name?: {en,hi} }] (1–8) }`
- Targets: `eq:<id>`, `inc:<n>`, `dec:<n>`, `reset`
- Events: `picked:<id>`, `balanced:<id>`, `changed`, `balanced`, `smallest`
- Notes: Never balances for the child; names the atom that is still off; asks for the smallest whole numbers.

## `scatter` — Light scattering (प्रकाश का बिखरना)

Tyndall effect in a dark room, and why the sky is blue and the sunset red.

- Subjects: physics, chemistry (Classes 9–12)
- Config: `{ mode: 'tyndall', liquids?: [water|salt|sugar|copper-sulphate|milk|soap|starch|muddy] (2–6) } | { mode: 'sky' }`
- Targets: `liquid:<id>`, `liquid:*`, `torch`, `noon`, `sunset`, `sun`
- Events: `shone:<id>`, `beam-seen`, `beam-hidden`, `picked`, `noon`, `sunset`, `moved`
- Notes: Particle size, not colour, decides whether the beam's path shows.

## `sort` — Sort it (छाँटो)

Drag cards into the right groups; every card explains itself.

- Subjects: every subject
- Config: `{ bins: [{ id, label: {en,hi} }] (2–5), cards: [{ id, text: {en,hi}, image?: asset id, bin: bin id, why: {en,hi} }] (4–16) }`
- Targets: `card:<id>`, `bin:<id>`, `check`, `reset`
- Events: `placed:<id>`, `correct:<id>`, `wrong:<id>`, `sorted`
- Notes: Tap a card then a bin (and drag where available).

## `match` — Match pairs (जोड़ी मिलाओ)

Match terms, pictures, words and meanings, causes and effects.

- Subjects: every subject
- Config: `{ pairs: [{ id, left: {en,hi}, right: {en,hi}, why?: {en,hi}, image?: asset id }] (3–10), style?: 'lines'|'cards' }`
- Targets: `left:<id>`, `right:<id>`, `check`
- Events: `matched:<id>`, `mismatch`, `all-matched`

## `sequence` — Put in order (क्रम में लगाओ)

Order steps of a process, a story, a life cycle or a procedure.

- Subjects: every subject
- Config: `{ items: [{ id, text: {en,hi}, image?: asset id }] in the correct order (3–10), cyclic?: boolean }`
- Targets: `item:<id>`, `slot:<n>`, `check`
- Events: `placed:<id>`, `ordered`, `wrong-order`
- Notes: Shuffle at start; cyclic accepts any rotation.

## `words` — Word builder (शब्द निर्माता)

Build words from sounds and letters in English, Hindi and Sanskrit; matras, syllables, prefixes and suffixes.

- Subjects: english 1–5, hindi 1–8, sanskrit 6–10
- Config: `{ mode: 'phonics'|'matra'|'syllables'|'affix'|'compound'|'sandhi'|'spelling', lang: 'en'|'hi'|'sa', words?: [{ w: string, pic?: picture id or asset id, meaning?: {en,hi} }], extra?: string, consonants?: [string], matras?: [string], examples?: { string: string }, parts?: [string] }`
- Targets: `listen`, `tiles`, `next`, `pick:<letter>`, `matra:<sign>`, `part:<part>`
- Events: `listen`, `word:<word>`, `next`, `pick:<letter>`, `make:<akshar>`, `joined:<word>`
- Notes: Port the prototype; add syllables, prefixes/suffixes, compound words, Sanskrit sandhi (simple svar sandhi) with true rules.

## `grammar` — Sentence workshop (वाक्य कार्यशाला)

Build and change sentences: parts of speech, tenses, voice, narration, punctuation and Hindi and Sanskrit grammar.

- Subjects: english 1–12, hindi 1–12, sanskrit 6–12
- Config: `{ mode: 'build'|'tag'|'transform'|'punctuate'|'fix'|'combine', lang: 'en'|'hi'|'sa', items: [{ id, words?: [string], sentence?: string, answer: string or [string], tags?: [string], rule: {en,hi} }] (2–8), tagset?: ['noun','pronoun','verb','adjective','adverb','preposition','conjunction','interjection','article'] or the Hindi/Sanskrit equivalents }`
- Targets: `word:<i>`, `tag:<name>`, `item:<id>`, `answer`, `next`
- Events: `built:<id>`, `tagged:<id>`, `answered:right`, `answered:wrong`, `done`
- Notes: Answers are the lab's own; the template compares normalised text and shows the rule.

## `reader` — Story and poem studio (कहानी और कविता स्टूडियो)

Listen to a short passage, see it as picture panels, find meanings, feel the rhythm and answer about it.

- Subjects: english 1–12, hindi 1–12, sanskrit 6–12
- Config: `{ mode: 'panels'|'rhythm'|'vocab'|'character'|'emotion-map'|'read-along', lang: 'en'|'hi'|'sa', passage: { title: {en,hi} or string, lines: [string] } (our own short retelling or summary, never the textbook text), words?: [{ w, meaning: {en,hi} }], characters?: [{ id, name, traits: [{en,hi}] }] }`
- Targets: `line:<i>`, `word:<w>`, `play`, `character:<id>`, `beat`, `answer`
- Events: `played`, `found:<w>`, `beat-ok`, `picked:<id>`, `answered:right`, `answered:wrong`
- Notes: Copyright: never paste textbook passages or poems; use a short original retelling and the lesson's key words.

## `writing` — Writing frames (लेखन ढाँचे)

Build a letter, notice, report, diary entry, essay or speech from its parts in the right order and format.

- Subjects: english 4–12, hindi 4–12
- Config: `{ kind: 'formal-letter'|'informal-letter'|'notice'|'report'|'diary'|'essay'|'speech'|'email'|'advertisement'|'invitation'|'article', lang: 'en'|'hi', parts: [{ id, text: {en,hi} or string, slot: string }] }`
- Targets: `part:<id>`, `slot:<slot>`, `check`
- Events: `placed:<id>`, `complete`, `wrong-slot`
- Notes: Formats follow CBSE writing conventions.

## `mind` — Mind lab (मन प्रयोगशाला)

Try classic psychology experiments on yourself: memory, attention, perception, illusions and learning.

- Subjects: psychology 11–12, science (senses), sociology (methods)
- Config: `{ experiment: 'memory-span'|'serial-position'|'stroop'|'reaction-time'|'illusion:<muller-lyer|ponzo|kanizsa>'|'attention-split'|'learning-curve'|'survey', trials?: integer }`
- Targets: `start`, `respond`, `answer`, `next`
- Events: `trial`, `result`, `answered:right`, `answered:wrong`
- Notes: Results stay in the page; no personal data stored; explain that it is a demonstration, not a test of the child.

## `society` — Society explorer (समाज अन्वेषक)

Families, communities, institutions, diversity and change, explored through cards, maps of relationships and simple surveys.

- Subjects: sociology 11–12, social science 6–10, evs 1–5 (family and friends)
- Config: `{ mode: 'family-tree'|'web'|'institutions'|'change'|'survey'|'compare', nodes?: [{ id, label: {en,hi} }], links?: [[from, to, {en,hi}]], questions?: [{ id, q: {en,hi}, options: [{en,hi}] }] }`
- Targets: `node:<id>`, `link`, `option:<id>`, `answer`
- Events: `linked`, `answered`, `complete`, `answered:right`, `answered:wrong`
- Notes: Neutral, respectful, no stereotypes; survey answers kept on the device only.

## `govern` — Democracy lab (लोकतंत्र प्रयोगशाला)

Hold an election, pass a law, see how the three organs and levels of government work, and read the Constitution's key ideas.

- Subjects: social science 6–10 (civics, democratic politics), political science 11–12
- Config: `{ mode: 'election'|'law-making'|'organs'|'levels'|'rights'|'federalism'|'courts'|'panchayat'|'budget-session', options?: object }`
- Targets: `vote:<id>`, `stage:<id>`, `card:<id>`, `play`, `answer`
- Events: `counted`, `passed`, `rejected`, `placed`, `answered:right`, `answered:wrong`
- Notes: Procedures as the Constitution and NCERT describe; fictional candidates and parties only.

## `art` — Colour and pattern studio (रंग और पैटर्न स्टूडियो)

Mix colours, make rangoli and symmetrical patterns, explore Indian art forms.

- Subjects: arts 3–8, maths (symmetry), evs
- Config: `{ mode: 'mix'|'rangoli'|'symmetry'|'art-form', art_form?: 'madhubani'|'warli'|'gond'|'kalamkari'|'pattachitra' }`
- Targets: `colour:<name>`, `canvas`, `tool:<name>`, `answer`
- Events: `mixed:<colour>`, `drawn`, `answered:right`, `answered:wrong`
- Notes: Primary/secondary colour mixing true (paint model).
