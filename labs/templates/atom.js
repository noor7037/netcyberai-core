// Template: Atom builder. Build atoms from protons, neutrons and electrons; fill shells (K, L, M, N); explore isotopes
// and average atomic mass; pick any of the 118 elements in the periodic table and see periodic trends from real data;
// compare the Thomson, Rutherford and Bohr models, run the gold-foil experiment and make a hydrogen atom give out light.
// Config:
//   { mode: 'build'|'shells'|'isotopes'|'table'|'models',
//     target?: element symbol (H to Ca for build and shells; H to Ca, Co, I or U for isotopes; any of 118 for table),
//     show?: ['charge','mass','valency','config'] (build, shells, isotopes; default all four) }
// Rules in code: the element is set by the proton count; shells hold 2, 8, 8, 2 for Z <= 20 (Bohr-Bury); an atom
// takes extra electrons only where real chemistry allows it (H-, N3-, O2-, F-, P3-, S2-, Cl-); a nucleus is called
// real only when it is a known isotope (natural abundances from IUPAC); configurations follow the aufbau order with
// the known exceptions (Cr, Cu, Mo, Ag, Au, ...); hydrogen energies E = -13.6/n^2 eV; light wavelength = 1240/dE nm.
(function () {
  const L = window.NCA_LIB;
  const { esc, tween, ease, lerp, mixHex } = L;
  const reduced = L.reducedMotion;

  // ---------------------------------------------------------------- element data (index = Z - 1)
  const SYM = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
  const NAME_EN = 'Hydrogen|Helium|Lithium|Beryllium|Boron|Carbon|Nitrogen|Oxygen|Fluorine|Neon|Sodium|Magnesium|Aluminium|Silicon|Phosphorus|Sulphur|Chlorine|Argon|Potassium|Calcium|Scandium|Titanium|Vanadium|Chromium|Manganese|Iron|Cobalt|Nickel|Copper|Zinc|Gallium|Germanium|Arsenic|Selenium|Bromine|Krypton|Rubidium|Strontium|Yttrium|Zirconium|Niobium|Molybdenum|Technetium|Ruthenium|Rhodium|Palladium|Silver|Cadmium|Indium|Tin|Antimony|Tellurium|Iodine|Xenon|Caesium|Barium|Lanthanum|Cerium|Praseodymium|Neodymium|Promethium|Samarium|Europium|Gadolinium|Terbium|Dysprosium|Holmium|Erbium|Thulium|Ytterbium|Lutetium|Hafnium|Tantalum|Tungsten|Rhenium|Osmium|Iridium|Platinum|Gold|Mercury|Thallium|Lead|Bismuth|Polonium|Astatine|Radon|Francium|Radium|Actinium|Thorium|Protactinium|Uranium|Neptunium|Plutonium|Americium|Curium|Berkelium|Californium|Einsteinium|Fermium|Mendelevium|Nobelium|Lawrencium|Rutherfordium|Dubnium|Seaborgium|Bohrium|Hassium|Meitnerium|Darmstadtium|Roentgenium|Copernicium|Nihonium|Flerovium|Moscovium|Livermorium|Tennessine|Oganesson'.split('|');
  const NAME_HI = '\u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928|\u0939\u0940\u0932\u093f\u092f\u092e|\u0932\u0940\u0925\u093f\u092f\u092e|\u092c\u0947\u0930\u093f\u0932\u093f\u092f\u092e|\u092c\u094b\u0930\u0949\u0928|\u0915\u093e\u0930\u094d\u092c\u0928|\u0928\u093e\u0907\u091f\u094d\u0930\u094b\u091c\u0928|\u0911\u0915\u094d\u0938\u0940\u091c\u0928|\u092b\u094d\u0932\u0941\u0913\u0930\u0940\u0928|\u0928\u093f\u0911\u0928|\u0938\u094b\u0921\u093f\u092f\u092e|\u092e\u0948\u0917\u094d\u0928\u0940\u0936\u093f\u092f\u092e|\u0910\u0932\u0941\u092e\u093f\u0928\u093f\u092f\u092e|\u0938\u093f\u0932\u093f\u0915\u0949\u0928|\u092b\u0949\u0938\u094d\u092b\u094b\u0930\u0938|\u0938\u0932\u094d\u092b\u093c\u0930 (\u0917\u0902\u0927\u0915)|\u0915\u094d\u0932\u094b\u0930\u0940\u0928|\u0906\u0930\u094d\u0917\u0928|\u092a\u094b\u091f\u0948\u0936\u093f\u092f\u092e|\u0915\u0948\u0932\u094d\u0936\u093f\u092f\u092e|\u0938\u094d\u0915\u0948\u0902\u0921\u093f\u092f\u092e|\u091f\u093e\u0907\u091f\u0947\u0928\u093f\u092f\u092e|\u0935\u0948\u0928\u0947\u0921\u093f\u092f\u092e|\u0915\u094d\u0930\u094b\u092e\u093f\u092f\u092e|\u092e\u0948\u0902\u0917\u0928\u0940\u091c\u093c|\u0906\u092f\u0930\u0928 (\u0932\u094b\u0939\u093e)|\u0915\u094b\u092c\u093e\u0932\u094d\u091f|\u0928\u093f\u0915\u0947\u0932|\u0915\u0949\u092a\u0930 (\u0924\u093e\u0901\u092c\u093e)|\u091c\u093c\u093f\u0902\u0915 (\u091c\u0938\u094d\u0924\u093e)|\u0917\u0948\u0932\u093f\u092f\u092e|\u091c\u0930\u094d\u092e\u0947\u0928\u093f\u092f\u092e|\u0906\u0930\u094d\u0938\u0947\u0928\u093f\u0915|\u0938\u0947\u0932\u0947\u0928\u093f\u092f\u092e|\u092c\u094d\u0930\u094b\u092e\u0940\u0928|\u0915\u094d\u0930\u093f\u092a\u094d\u091f\u0949\u0928|\u0930\u0941\u092c\u093f\u0921\u093f\u092f\u092e|\u0938\u094d\u091f\u094d\u0930\u0949\u0928\u094d\u0936\u093f\u092f\u092e|\u0907\u091f\u094d\u0930\u093f\u092f\u092e|\u091c\u093c\u0930\u094d\u0915\u094b\u0928\u093f\u092f\u092e|\u0928\u093e\u092f\u094b\u092c\u093f\u092f\u092e|\u092e\u0949\u0932\u093f\u092c\u094d\u0921\u0947\u0928\u092e|\u091f\u0947\u0915\u094d\u0928\u0940\u0936\u093f\u092f\u092e|\u0930\u0942\u0925\u0947\u0928\u093f\u092f\u092e|\u0930\u094b\u0921\u093f\u092f\u092e|\u092a\u0948\u0932\u0947\u0921\u093f\u092f\u092e|\u0938\u093f\u0932\u094d\u0935\u0930 (\u091a\u093e\u0901\u0926\u0940)|\u0915\u0948\u0921\u092e\u093f\u092f\u092e|\u0907\u0902\u0921\u093f\u092f\u092e|\u091f\u093f\u0928 (\u0930\u093e\u0901\u0917\u093e)|\u0910\u0902\u091f\u093f\u092e\u0928\u0940|\u091f\u0947\u0932\u094d\u092f\u0942\u0930\u093f\u092f\u092e|\u0906\u092f\u094b\u0921\u0940\u0928|\u091c\u093c\u0947\u0928\u0949\u0928|\u0938\u0940\u091c\u093c\u093f\u092f\u092e|\u092c\u0947\u0930\u093f\u092f\u092e|\u0932\u0948\u0902\u0925\u0947\u0928\u092e|\u0938\u0940\u0930\u093f\u092f\u092e|\u092a\u094d\u0930\u0947\u0938\u093f\u092f\u094b\u0921\u093f\u092e\u093f\u092f\u092e|\u0928\u093f\u092f\u094b\u0921\u093f\u092e\u093f\u092f\u092e|\u092a\u094d\u0930\u094b\u092e\u0947\u0925\u093f\u092f\u092e|\u0938\u092e\u0947\u0930\u093f\u092f\u092e|\u092f\u0942\u0930\u094b\u092a\u093f\u092f\u092e|\u0917\u0948\u0921\u094b\u0932\u093f\u0928\u093f\u092f\u092e|\u091f\u0930\u094d\u092c\u093f\u092f\u092e|\u0921\u093f\u0938\u094d\u092a\u094d\u0930\u094b\u0938\u093f\u092f\u092e|\u0939\u094b\u0932\u094d\u092e\u093f\u092f\u092e|\u0905\u0930\u094d\u092c\u093f\u092f\u092e|\u0925\u0942\u0932\u093f\u092f\u092e|\u0907\u091f\u0930\u094d\u092c\u093f\u092f\u092e|\u0932\u094d\u092f\u0942\u091f\u0940\u0936\u093f\u092f\u092e|\u0939\u0948\u092b\u093c\u094d\u0928\u093f\u092f\u092e|\u091f\u0948\u0902\u091f\u0932\u092e|\u091f\u0902\u0917\u0938\u094d\u091f\u0928|\u0930\u0940\u0928\u093f\u092f\u092e|\u0911\u0938\u094d\u092e\u093f\u092f\u092e|\u0907\u0930\u093f\u0921\u093f\u092f\u092e|\u092a\u094d\u0932\u0948\u091f\u093f\u0928\u092e|\u0917\u094b\u0932\u094d\u0921 (\u0938\u094b\u0928\u093e)|\u092e\u0930\u094d\u0915\u0930\u0940 (\u092a\u093e\u0930\u093e)|\u0925\u0948\u0932\u093f\u092f\u092e|\u0932\u0947\u0921 (\u0938\u0940\u0938\u093e)|\u092c\u093f\u0938\u094d\u092e\u0925|\u092a\u094b\u0932\u094b\u0928\u093f\u092f\u092e|\u0910\u0938\u094d\u091f\u093e\u091f\u0940\u0928|\u0930\u0947\u0921\u0949\u0928|\u092b\u094d\u0930\u093e\u0902\u0938\u093f\u092f\u092e|\u0930\u0947\u0921\u093f\u092f\u092e|\u0910\u0915\u094d\u091f\u093f\u0928\u093f\u092f\u092e|\u0925\u094b\u0930\u093f\u092f\u092e|\u092a\u094d\u0930\u094b\u091f\u0948\u0915\u094d\u091f\u093f\u0928\u093f\u092f\u092e|\u092f\u0942\u0930\u0947\u0928\u093f\u092f\u092e|\u0928\u0947\u092a\u094d\u091f\u094d\u092f\u0942\u0928\u093f\u092f\u092e|\u092a\u094d\u0932\u0942\u091f\u094b\u0928\u093f\u092f\u092e|\u0905\u092e\u0947\u0930\u093f\u0936\u093f\u092f\u092e|\u0915\u094d\u092f\u0942\u0930\u093f\u092f\u092e|\u092c\u0930\u094d\u0915\u0947\u0932\u093f\u092f\u092e|\u0915\u0948\u0932\u093f\u092b\u093c\u094b\u0930\u094d\u0928\u093f\u092f\u092e|\u0906\u0907\u0902\u0938\u094d\u091f\u0940\u0928\u093f\u092f\u092e|\u092b\u093c\u0930\u094d\u092e\u093f\u092f\u092e|\u092e\u0947\u0902\u0921\u0947\u0932\u0940\u0935\u093f\u092f\u092e|\u0928\u094b\u092c\u0947\u0932\u093f\u092f\u092e|\u0932\u0949\u0930\u0947\u0928\u094d\u0938\u093f\u092f\u092e|\u0930\u0926\u0930\u092b\u093c\u094b\u0930\u094d\u0921\u093f\u092f\u092e|\u0921\u0941\u092c\u094d\u0928\u093f\u092f\u092e|\u0938\u0940\u092c\u094b\u0930\u094d\u0917\u093f\u092f\u092e|\u092c\u094b\u0930\u093f\u092f\u092e|\u0939\u0948\u0938\u093f\u092f\u092e|\u092e\u093e\u0907\u091f\u0928\u0947\u0930\u093f\u092f\u092e|\u0921\u093e\u0930\u094d\u092e\u0938\u094d\u091f\u0948\u0921\u091f\u093f\u092f\u092e|\u0930\u0949\u0928\u094d\u091f\u091c\u0947\u0928\u093f\u092f\u092e|\u0915\u094b\u092a\u0930\u0928\u093f\u0938\u093f\u092f\u092e|\u0928\u093f\u0939\u094b\u0928\u093f\u092f\u092e|\u092b\u093c\u094d\u0932\u0947\u0930\u094b\u0935\u093f\u092f\u092e|\u092e\u0949\u0938\u094d\u0915\u094b\u0935\u093f\u092f\u092e|\u0932\u093f\u0935\u0930\u092e\u094b\u0930\u093f\u092f\u092e|\u091f\u0947\u0928\u0947\u0938\u0940\u0928|\u0913\u0917\u093e\u0928\u0947\u0938\u0928'.split('|');
  // Standard atomic weights (u); for elements with no stable isotope, the mass number of the longest-lived one.
  const MASS = '1.008 4.003 6.94 9.012 10.81 12.011 14.007 15.999 18.998 20.180 22.990 24.305 26.982 28.085 30.974 32.06 35.45 39.95 39.098 40.078 44.956 47.867 50.942 51.996 54.938 55.845 58.933 58.693 63.546 65.38 69.723 72.630 74.922 78.971 79.904 83.798 85.468 87.62 88.906 91.224 92.906 95.95 98 101.07 102.91 106.42 107.87 112.41 114.82 118.71 121.76 127.60 126.90 131.29 132.91 137.33 138.91 140.12 140.91 144.24 145 150.36 151.96 157.25 158.93 162.50 164.93 167.26 168.93 173.05 174.97 178.49 180.95 183.84 186.21 190.23 192.22 195.08 196.97 200.59 204.38 207.2 208.98 209 210 222 223 226 227 232.04 231.04 238.03 237 244 243 247 247 251 252 257 258 259 266 267 268 269 270 269 278 281 282 285 286 289 290 293 294 294'.split(' ');
  const NOSTABLE = (z) => z === 43 || z === 61 || (z >= 84 && z !== 90 && z !== 91 && z !== 92);
  const num = (s) => (s === '-' ? null : Number(s));
  // Pauling electronegativity (none for He, Ne, Ar; data to U).
  const ENEG = '2.20 - 0.98 1.57 2.04 2.55 3.04 3.44 3.98 - 0.93 1.31 1.61 1.90 2.19 2.58 3.16 - 0.82 1.00 1.36 1.54 1.63 1.66 1.55 1.83 1.88 1.91 1.90 1.65 1.81 2.01 2.18 2.55 2.96 3.00 0.82 0.95 1.22 1.33 1.6 2.16 1.9 2.2 2.28 2.20 1.93 1.69 1.78 1.96 2.05 2.1 2.66 2.6 0.79 0.89 1.10 1.12 1.13 1.14 1.13 1.17 1.2 1.2 1.1 1.22 1.23 1.24 1.25 1.1 1.27 1.3 1.5 2.36 1.9 2.2 2.20 2.28 2.54 2.00 1.62 2.33 2.02 2.0 2.2 2.2 0.79 0.9 1.1 1.3 1.5 1.38'.split(' ').map(num);
  // First ionisation enthalpy, kJ/mol (NIST ionisation energies; data to Ra).
  const IE1 = '1312 2372 520 900 801 1086 1402 1314 1681 2081 496 738 578 787 1012 1000 1251 1521 419 590 633 659 651 653 717 763 760 737 746 906 579 762 947 941 1140 1351 403 550 600 640 652 684 702 710 720 804 731 868 558 709 834 869 1008 1170 376 503 538 534 527 533 540 545 547 593 566 573 581 589 597 603 524 659 728 759 756 814 865 864 890 1007 589 716 703 812 899 1037 393 509'.split(' ').map(num);
  // Covalent radius, pm (Cordero et al.; data to Cm).
  const RAD = '31 28 128 96 84 76 71 66 57 58 166 141 121 111 107 105 102 106 203 176 170 160 153 139 139 132 126 124 132 122 122 120 119 120 120 116 220 195 190 175 164 154 147 146 142 139 145 144 142 139 139 138 139 140 244 215 207 204 203 201 199 198 198 196 194 192 192 189 190 187 187 175 170 162 151 144 141 136 136 132 145 146 148 140 150 150 260 221 215 206 200 196 190 187 180 169'.split(' ').map(num);
  const Z_OF = Object.fromEntries(SYM.map((s, i) => [s, i + 1]));
  const NM = (z) => ({ en: NAME_EN[z - 1], hi: NAME_HI[z - 1] });

  // Isotopes: [mass number, natural abundance %, flags] (r radioactive, t trace in nature, s made by people).
  const ISO = {
    H: [[1, 99.985], [2, 0.015], [3, 0, 'rt']], He: [[3, 0.0001], [4, 99.9999]], Li: [[6, 7.59], [7, 92.41]], Be: [[9, 100], [10, 0, 'rt']],
    B: [[10, 19.9], [11, 80.1]], C: [[12, 98.93], [13, 1.07], [14, 0, 'rt']], N: [[14, 99.636], [15, 0.364]], O: [[16, 99.757], [17, 0.038], [18, 0.205]],
    F: [[19, 100]], Ne: [[20, 90.48], [21, 0.27], [22, 9.25]], Na: [[23, 100], [24, 0, 'rs']], Mg: [[24, 78.99], [25, 10.0], [26, 11.01]],
    Al: [[27, 100]], Si: [[28, 92.23], [29, 4.68], [30, 3.09]], P: [[31, 100], [32, 0, 'rs']], S: [[32, 94.99], [33, 0.75], [34, 4.25], [36, 0.01]],
    Cl: [[35, 75.76], [37, 24.24]], Ar: [[36, 0.3336], [38, 0.0629], [40, 99.6035]], K: [[39, 93.2581], [40, 0.0117, 'r'], [41, 6.7302]],
    Ca: [[40, 96.94], [42, 0.647], [43, 0.135], [44, 2.086], [46, 0.004], [48, 0.187]],
    Co: [[59, 100], [60, 0, 'rs']], I: [[127, 100], [131, 0, 'rs']], U: [[234, 0.0054, 'r'], [235, 0.7204, 'r'], [238, 99.2742, 'r']],
  };
  const USES = {
    'H-2': { en: 'Heavy water (D\u2082O) made from it is used in nuclear reactors.', hi: '\u0907\u0938\u0938\u0947 \u092c\u0928\u093e \u092d\u093e\u0930\u0940 \u091c\u0932 (D\u2082O) \u0928\u093e\u092d\u093f\u0915\u0940\u092f \u0930\u093f\u090f\u0915\u094d\u091f\u0930\u094b\u0902 \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'C-14': { en: 'Used to find the age of old wood, bones and cloth (carbon dating).', hi: '\u092a\u0941\u0930\u093e\u0928\u0940 \u0932\u0915\u0921\u093c\u0940, \u0939\u0921\u094d\u0921\u093f\u092f\u094b\u0902 \u0914\u0930 \u0915\u092a\u0921\u093c\u0947 \u0915\u0940 \u0906\u092f\u0941 \u091c\u093e\u0928\u0928\u0947 \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948 (\u0915\u093e\u0930\u094d\u092c\u0928 \u0921\u0947\u091f\u093f\u0902\u0917)\u0964' },
    'K-40': { en: 'Used to find the age of very old rocks.', hi: '\u092c\u0939\u0941\u0924 \u092a\u0941\u0930\u093e\u0928\u0940 \u091a\u091f\u094d\u091f\u093e\u0928\u094b\u0902 \u0915\u0940 \u0906\u092f\u0941 \u091c\u093e\u0928\u0928\u0947 \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'Na-24': { en: 'Used as a tracer to find leaks in buried pipes.', hi: '\u091c\u093c\u092e\u0940\u0928 \u092e\u0947\u0902 \u0926\u092c\u0947 \u092a\u093e\u0907\u092a\u094b\u0902 \u0915\u093e \u0930\u093f\u0938\u093e\u0935 \u0922\u0942\u0901\u0922\u0928\u0947 \u092e\u0947\u0902 \u0905\u0928\u0941\u0930\u0947\u0916\u0915 \u0915\u0947 \u0930\u0942\u092a \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'P-32': { en: 'Used as a tracer to study how plants take up fertiliser.', hi: '\u092a\u094c\u0927\u0947 \u0909\u0930\u094d\u0935\u0930\u0915 \u0915\u0948\u0938\u0947 \u0932\u0947\u0924\u0947 \u0939\u0948\u0902, \u092f\u0939 \u091c\u093e\u0928\u0928\u0947 \u092e\u0947\u0902 \u0905\u0928\u0941\u0930\u0947\u0916\u0915 \u0915\u0947 \u0930\u0942\u092a \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'Co-60': { en: 'Used in hospitals to treat cancer.', hi: '\u0905\u0938\u094d\u092a\u0924\u093e\u0932\u094b\u0902 \u092e\u0947\u0902 \u0915\u0948\u0902\u0938\u0930 \u0915\u0947 \u0907\u0932\u093e\u091c \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'I-131': { en: 'Used to treat goitre and other thyroid problems.', hi: '\u0918\u0947\u0902\u0918\u093e \u0914\u0930 \u0925\u093e\u092f\u0930\u0949\u0907\u0921 \u0915\u0940 \u0926\u0942\u0938\u0930\u0940 \u092c\u0940\u092e\u093e\u0930\u093f\u092f\u094b\u0902 \u0915\u0947 \u0907\u0932\u093e\u091c \u092e\u0947\u0902 \u0915\u093e\u092e \u0906\u0924\u093e \u0939\u0948\u0964' },
    'U-235': { en: 'The fuel of nuclear power plants.', hi: '\u0928\u093e\u092d\u093f\u0915\u0940\u092f \u092c\u093f\u091c\u0932\u0940\u0918\u0930\u094b\u0902 \u0915\u093e \u0908\u0902\u0927\u0928\u0964' },
  };
  const commonA = (sym) => ISO[sym].slice().sort((a, b) => b[1] - a[1])[0][0];
  const isoOf = (sym, A) => (ISO[sym] || []).find((x) => x[0] === A);
  // How many extra electrons an atom really takes (H-, N3-, O2-, F-, P3-, S2-, Cl-); metals and others take none.
  const anionCap = (z) => ({ 1: 1, 7: 3, 8: 2, 9: 1, 15: 3, 16: 2, 17: 1 })[z] || 0;

  // ---------------------------------------------------------------- periodic-table rules
  function place(z) {
    if (z === 1) return { period: 1, group: 1 };
    if (z === 2) return { period: 1, group: 18 };
    const s2 = (z0, p) => { const k = z - z0; return { period: p, group: k <= 2 ? k : k + 10 }; };
    if (z <= 10) return s2(2, 2);
    if (z <= 18) return s2(10, 3);
    if (z <= 36) return { period: 4, group: z - 18 };
    if (z <= 54) return { period: 5, group: z - 36 };
    const far = (z0, p) => { const k = z - z0; if (k <= 3) return { period: p, group: k }; if (k <= 17) return { period: p, group: null, f: k - 3 }; return { period: p, group: k - 14 }; };
    if (z <= 86) return far(54, 6);
    return far(86, 7);
  }
  const CATS = {
    alkali: { c: '#FF6B57', fg: '#1E293B', en: 'Alkali metal', hi: '\u0915\u094d\u0937\u093e\u0930 \u0927\u093e\u0924\u0941' },
    alkaline: { c: '#FF7A1A', fg: '#1E293B', en: 'Alkaline earth metal', hi: '\u0915\u094d\u0937\u093e\u0930\u0940\u092f \u092e\u0943\u0926\u093e \u0927\u093e\u0924\u0941' },
    transition: { c: '#2563EB', fg: '#FFFFFF', en: 'Transition metal', hi: '\u0938\u0902\u0915\u094d\u0930\u092e\u0923 \u0927\u093e\u0924\u0941' },
    post: { c: '#14B8A6', fg: '#1E293B', en: 'Other metal', hi: '\u0905\u0928\u094d\u092f \u0927\u093e\u0924\u0941' },
    metalloid: { c: '#22C55E', fg: '#1E293B', en: 'Metalloid', hi: '\u0909\u092a\u0927\u093e\u0924\u0941' },
    nonmetal: { c: '#F5B90A', fg: '#1E293B', en: 'Non-metal', hi: '\u0905\u0927\u093e\u0924\u0941' },
    halogen: { c: '#02CFF9', fg: '#1E293B', en: 'Halogen', hi: '\u0939\u0948\u0932\u094b\u091c\u0928' },
    noble: { c: '#8B3DFF', fg: '#FFFFFF', en: 'Noble gas', hi: '\u0909\u0924\u094d\u0915\u0943\u0937\u094d\u091f \u0917\u0948\u0938' },
    lanth: { c: '#0F766E', fg: '#FFFFFF', en: 'Lanthanoid', hi: '\u0932\u0948\u0902\u0925\u0947\u0928\u0949\u092f\u0921' },
    actin: { c: '#4400F0', fg: '#FFFFFF', en: 'Actinoid', hi: '\u0910\u0915\u094d\u091f\u093f\u0928\u0949\u092f\u0921' },
  };
  function category(z) {
    if ([3, 11, 19, 37, 55, 87].includes(z)) return 'alkali';
    if ([4, 12, 20, 38, 56, 88].includes(z)) return 'alkaline';
    if ([2, 10, 18, 36, 54, 86, 118].includes(z)) return 'noble';
    if ([9, 17, 35, 53, 85, 117].includes(z)) return 'halogen';
    if ([5, 14, 32, 33, 51, 52].includes(z)) return 'metalloid';
    if ([1, 6, 7, 8, 15, 16, 34].includes(z)) return 'nonmetal';
    if (z >= 58 && z <= 71) return 'lanth';
    if (z >= 90 && z <= 103) return 'actin';
    const g = place(z).group;
    if (g >= 3 && g <= 12) return 'transition';
    return 'post';
  }
  const BLOCKS = { s: { c: '#FF6B57', fg: '#1E293B' }, p: { c: '#FFD23F', fg: '#1E293B' }, d: { c: '#2563EB', fg: '#FFFFFF' }, f: { c: '#0F766E', fg: '#FFFFFF' } };
  function block(z) {
    if (z === 2) return 's';
    const pl = place(z);
    if (pl.f) return 'f';
    const g = pl.group;
    if (g <= 2) return 's';
    if (g >= 13) return 'p';
    return 'd';
  }
  // Aufbau (n + l) order, with the known exceptions written after the noble-gas core.
  const ORDER = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1], [6, 0], [4, 3], [5, 2], [6, 1], [7, 0], [5, 3], [6, 2], [7, 1]];
  const LCAP = [2, 6, 10, 14];
  const LET = 'spdf';
  const NOBLE = [2, 10, 18, 36, 54, 86];
  const EXC = { 24: '3d5 4s1', 29: '3d10 4s1', 41: '4d4 5s1', 42: '4d5 5s1', 44: '4d7 5s1', 45: '4d8 5s1', 46: '4d10', 47: '4d10 5s1', 57: '5d1 6s2', 58: '4f1 5d1 6s2', 64: '4f7 5d1 6s2', 78: '4f14 5d9 6s1', 79: '4f14 5d10 6s1', 89: '6d1 7s2', 90: '6d2 7s2', 91: '5f2 6d1 7s2', 92: '5f3 6d1 7s2', 93: '5f4 6d1 7s2', 96: '5f7 6d1 7s2' };
  const coreOf = (z) => NOBLE.filter((g) => g < z).pop() || 0;
  function aufbau(z) {
    const out = []; let left = z;
    for (const [n, l] of ORDER) { if (!left) break; const k = Math.min(left, LCAP[l]); out.push([n, l, k]); left -= k; }
    return out;
  }
  function subshells(z) {
    if (!EXC[z]) return aufbau(z);
    const core = aufbau(coreOf(z));
    return core.concat(EXC[z].split(' ').map((t) => [Number(t[0]), LET.indexOf(t[1]), Number(t.slice(2))]));
  }
  function configHTML(z) {
    const c = coreOf(z);
    const all = subshells(z);
    const rest = all.slice(aufbau(c).length).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return (c ? `[${SYM[c - 1]}] ` : '') + rest.map(([n, l, k]) => `${n}${LET[l]}<sup>${k}</sup>`).join(' ');
  }
  // Electrons per shell. For Z <= 20 the school (Bohr-Bury) rule: K 2, L 8, M 8, then N.
  function fill(e) { const caps = [2, 8, 8, 2]; const out = []; let left = e; for (const c of caps) { if (left <= 0) break; const k = Math.min(left, c); out.push(k); left -= k; } return out; }
  function shellsOf(z) { if (z <= 20) return fill(z); const by = []; subshells(z).forEach(([n, , k]) => { by[n - 1] = (by[n - 1] || 0) + k; }); return Array.from(by, (v) => v || 0); }
  function valency(z) {
    if (z === 1) return 1;
    if ([2, 10, 18].includes(z)) return 0;
    const sh = fill(z); const v = sh[sh.length - 1];
    return v <= 4 ? v : 8 - v;
  }
  function valencyMain(z) { const b = block(z); if (b === 'd' || b === 'f') return null; if (z <= 20) return valency(z); const g = place(z).group; return g <= 2 ? g : g === 18 ? 0 : g <= 14 ? g - 10 : 18 - g; }
  const GASES = [1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86];
  const stateOf = (z) => (z >= 100 ? 'unknown' : GASES.includes(z) ? 'gas' : z === 35 || z === 80 ? 'liquid' : 'solid');
  const SHELL = 'KLMNOPQ';

  const W = (en, hi) => ({ en, hi });
  const T = {
    proton: W('Protons', '\u092a\u094d\u0930\u094b\u091f\u0949\u0928'), neutron: W('Neutrons', '\u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928'), electron: W('Electrons', '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928'),
    proton1: W('proton', '\u092a\u094d\u0930\u094b\u091f\u0949\u0928'), neutron1: W('neutron', '\u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928'), electron1: W('electron', '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928'),
    add: W('Add a', '\u091c\u094b\u0921\u093c\u094b \u090f\u0915'), remove: W('Take out a', '\u0928\u093f\u0915\u093e\u0932\u094b \u090f\u0915'),
  };
  const fmt = (x, d) => (x == null ? '\u2014' : Number(x).toFixed(d));
  const minus = '\u2212';
  const ionSym = (sym, q) => (q === 0 ? esc(sym) : `${esc(sym)}<sup>${Math.abs(q) > 1 ? Math.abs(q) : ''}${q > 0 ? '+' : minus}</sup>`);
  const notation = (sym, z, A, q) => `<span class="at-nota" aria-hidden="true"><span class="at-ss"><sup>${A}</sup><sub>${z}</sub></span>${ionSym(sym, q)}</span>`;

  // A wavelength (nm) as a colour (visible light only).
  function waveColour(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else if (nm <= 750) { r = 1; }
    const h = (v) => Math.round(255 * Math.min(1, v * 0.9 + 0.1)).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  let uidN = 0;

  // ---------------------------------------------------------------- CSS
  const CSS = `.at { container-type: inline-size; display: grid; gap: 12px; min-width: 0; }
.at-main { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@container (min-width: 720px) { .at-main { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } }
.at-view { position: relative; border-radius: 18px; overflow: hidden; background: radial-gradient(circle at 50% 42%, #22337D 0%, #0E1A4A 52%, #061233 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.07), 0 10px 26px rgba(6,18,51,.22); }
.at-svg { display: block; width: 100%; height: auto; max-height: 520px; margin: 0 auto; }
.at-svg text { font-family: var(--font-body); }
.at-ring-l { font: 700 13px var(--font-display); fill: #9FB4FF; }
.at-cap { font: 600 11px var(--font-body); fill: #B8C6F0; }
.at-svgt { font: 700 14px var(--font-display); fill: #FFFFFF; }
.at-svgs { font: 600 12px var(--font-body); fill: #C9D5F5; }
.at-new { animation: at-in .6s cubic-bezier(.2,.9,.3,1.25) both; transform-box: fill-box; transform-origin: center; }
@keyframes at-in { from { transform: translate(var(--dx, 0px), var(--dy, -70px)) scale(.3); opacity: 0; } }
.at-glowp { animation: at-pulse 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes at-pulse { 50% { opacity: .55; transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) { .at-new, .at-glowp { animation: none; } }
.at-goal { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: linear-gradient(90deg, #F3ECFF, #E6F7FF); border: 1px solid #D9CCF7; color: #2A1A5E; border-radius: 14px; padding: 8px 12px; font-weight: 700; }
.at-goal.done { background: linear-gradient(90deg, #DDF7EE, #E6F7FF); border-color: #9EE2CC; color: #0B3B30; }
.at-goal-i { width: 30px; height: 30px; border-radius: 50%; flex: none; background: radial-gradient(circle, #fff 0 22%, #8B3DFF 23% 44%, #fff 45% 62%, #8B3DFF 63%); }
.at-goal.done .at-goal-i { background: radial-gradient(circle, #fff 0 30%, #0F766E 31%); }
.at-parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 8px; }
.at-part { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 8px 10px; display: grid; gap: 6px; justify-items: center; }
@container (max-width: 560px) { .at-parts { grid-template-columns: minmax(0, 1fr); } .at-part { display: flex; justify-content: space-between; padding: 6px 10px; } }
.at-part-h { display: flex; flex-wrap: wrap; justify-content: center; text-align: center; align-items: center; gap: 8px; font: 700 1rem var(--font-display); color: var(--ink); }
.at-ball { width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; font: 800 13px/1 var(--font-display); color: #1E293B; background: radial-gradient(circle at 34% 30%, rgba(255,255,255,.85) 0 14%, transparent 42%), var(--c); box-shadow: 0 2px 5px rgba(6,18,51,.25); }
.at-ctr { display: flex; align-items: center; gap: 8px; }
.at-btn { min-width: 48px; min-height: 48px; border-radius: 14px; border: 0; font: 800 1.5rem/1 var(--font-display); color: #1E293B; background: var(--c); box-shadow: 0 3px 0 rgba(6,18,51,.28), 0 6px 14px rgba(6,18,51,.16); transition: transform .12s, box-shadow .12s, opacity .2s; }
.at-btn:hover { filter: brightness(1.05); }
.at-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(6,18,51,.28); }
.at-btn.at-minus { background: var(--sunk); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; }
.at-btn:focus-visible, .at-chip:focus-visible, .at-cell:focus-visible, .at-el:focus-visible { outline: 3px solid var(--royal); outline-offset: 2px; }
.at-count { font: 800 1.6rem/1 var(--font-display); min-width: 2.2ch; text-align: center; color: var(--ink); }
.at-panel { display: grid; gap: 10px; min-width: 0; }
.at-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; min-width: 0; }
.at-card h3 { margin: 0 0 6px; font: 700 1.05rem var(--font-display); color: var(--ink); }
.at-card p { margin: 4px 0; color: var(--ink); }
.at-id { display: flex; gap: 14px; align-items: center; }
.at-tile { position: relative; flex: none; width: 92px; height: 104px; border-radius: 16px; background: linear-gradient(150deg, var(--c, #8B3DFF), var(--c2, #4400F0)); color: var(--fg, #fff); display: grid; place-items: center; box-shadow: 0 8px 18px rgba(6,18,51,.22), inset 0 1px 0 rgba(255,255,255,.35); }
.at-tile .tz { position: absolute; top: 6px; left: 9px; font: 700 .85rem var(--font-display); }
.at-tile .ts { font: 800 2.3rem/1 var(--font-display); margin-top: 6px; }
.at-tile:not(.empty) { text-shadow: 0 1px 2px rgba(6,18,51,.45); }
.at-tile .tm { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font: 600 .72rem var(--font-body); opacity: .95; }
.at-tile.empty { background: repeating-linear-gradient(45deg, var(--sunk) 0 8px, var(--surface) 8px 16px); color: var(--ink-2); border: 2px dashed var(--line); box-shadow: none; }
.at-idt { min-width: 0; }
.at-idt .nm { font: 800 1.35rem/1.15 var(--font-display); color: var(--ink); }
.at-nota { font: 800 1.5rem var(--font-display); color: var(--royal); display: inline-flex; align-items: center; }
.at-nota sup { font-size: .55em; align-self: flex-start; margin-top: .1em; }
.at-ss { display: inline-flex; flex-direction: column; font-size: .55em; line-height: 1; margin-right: 2px; text-align: right; }
.at-ss sup, .at-ss sub { font-size: 1em; margin: 0; vertical-align: baseline; }
.at-tag { display: inline-block; border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: .82rem; margin: 4px 4px 0 0; }
.at-tag.ok { background: var(--good-t); color: var(--ink); border: 1px solid var(--good); }
.at-tag.warn { background: var(--sun-t); color: var(--ink); border: 1px solid #F5B90A; }
.at-tag.bad { background: var(--bad-t); color: var(--ink); border: 1px solid var(--bad); }
.at-tag.ion { background: var(--grape-t); color: var(--ink); border: 1px solid var(--grape); }
.at-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; margin: 8px 0 0; }
.at-dl dt { color: var(--ink-2); font-weight: 600; }
.at-dl dd { margin: 0; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.at-msg { margin: 0; background: var(--sunk); border-radius: 12px; padding: 10px 14px; color: var(--ink); min-height: 48px; border-left: 5px solid var(--grape); }
.at-els { display: flex; flex-wrap: wrap; gap: 6px; }
.at-el { min-width: 48px; min-height: 48px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 800 1.05rem var(--font-display); display: grid; place-items: center; line-height: 1; padding: 2px 4px; }
.at-el small { font: 600 .62rem var(--font-body); color: var(--ink-2); }
.at-el[aria-pressed="true"] { background: linear-gradient(150deg, #8B3DFF, #4400F0); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(68,0,240,.35); }
.at-el[aria-pressed="true"] small { color: #E9DDFF; }
.at-isos { display: grid; gap: 6px; margin-top: 6px; }
.at-iso { display: grid; grid-template-columns: 64px minmax(0, 1fr) 72px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 10px; font-weight: 700; color: var(--ink); }
.at-iso.cur { background: var(--grape-t); outline: 2px solid var(--grape); }
.at-bar { height: 14px; border-radius: 7px; background: var(--sunk); overflow: hidden; }
.at-bar i { display: block; height: 100%; border-radius: 7px; background: linear-gradient(90deg, #8B3DFF, #02CFF9); min-width: 3px; }
.at-iso .pc { text-align: right; font-size: .85rem; color: var(--ink-2); }
.at-math { font: 700 1rem var(--font-display); color: var(--royal); overflow-wrap: anywhere; }
.at-seg { display: flex; flex-wrap: wrap; gap: 8px; }
.at-chip { min-height: 48px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); padding: 4px 16px; font: 700 .98rem var(--font-display); display: inline-flex; align-items: center; gap: 6px; }
.at-chip small { font: 600 .75rem var(--font-body); color: var(--ink-2); }
.at-chip[aria-pressed="true"] { background: linear-gradient(150deg, #8B3DFF, #4400F0); color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(68,0,240,.3); }
.at-chip[aria-pressed="true"] small { color: #E9DDFF; }
.at-chip.at-go { background: linear-gradient(150deg, #FFD23F, #F5B90A); color: #1E293B; border-color: #E0A800; }
.at-chip.at-go[aria-pressed="true"] { box-shadow: 0 4px 14px rgba(245,185,10,.45); }
.at-chip:disabled { opacity: .55; }
.at-tally { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.at-tally div { background: var(--sunk); border-radius: 12px; padding: 8px; text-align: center; color: var(--ink); font-size: .85rem; font-weight: 600; }
.at-tally b { display: block; font: 800 1.5rem var(--font-display); }
.at-lv { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.at-lv .at-chip { justify-content: center; padding: 4px 6px; }
.at-lvsvg { width: 100%; height: auto; display: block; }
.at-lvsvg text { font: 600 12px var(--font-body); fill: var(--ink); }
.at-list { margin: 6px 0 0; padding-left: 20px; color: var(--ink); }
.at-list li { margin: 3px 0; }
.at-tw { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 8px; max-width: 100%; }
.at-pt { display: grid; grid-template-columns: 18px repeat(18, minmax(44px, 1fr)); grid-template-rows: auto repeat(7, minmax(48px, auto)) 10px repeat(2, minmax(48px, auto)); gap: 3px; min-width: 870px; }
@container (min-width: 1000px) { .at-pt { min-width: 0; } }
.at-gh { font: 600 .66rem var(--font-body); color: var(--ink-2); display: grid; place-items: end center; min-height: 0; }
.at-ph { font: 700 .72rem var(--font-display); color: var(--ink-2); display: grid; place-items: center; }
.at-gap { grid-column: 1 / -1; min-height: 6px; height: 6px; }
.at-flab { font: 600 .7rem/1.1 var(--font-body); color: var(--ink-2); display: grid; place-items: center end; padding-right: 6px; text-align: right; }
.at-cell { border: 0; border-radius: 9px; padding: 2px 1px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bgc); color: var(--fgc); line-height: 1.05; position: relative; transition: transform .15s, box-shadow .15s; min-width: 0; }
.at-cell .z { font: 600 .6rem var(--font-body); opacity: .9; }
.at-cell .s { font: 800 1.02rem var(--font-display); }
.at-cell:hover { transform: scale(1.08); z-index: 2; box-shadow: 0 4px 12px rgba(6,18,51,.3); }
.at-cell[aria-pressed="true"] { outline: 3px solid var(--ink); outline-offset: 1px; transform: scale(1.12); z-index: 3; box-shadow: 0 6px 16px rgba(6,18,51,.35); }
.at-cell.pred { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.18) 0 4px, transparent 4px 8px); }
.at-cell.nod { background: var(--sunk); color: var(--ink-2); }
.at-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: .85rem; color: var(--ink); align-items: center; }
.at-legend span { display: inline-flex; align-items: center; gap: 6px; }
.at-legend i { width: 14px; height: 14px; border-radius: 4px; background: var(--c); display: inline-block; }
.at-scale { display: inline-block; width: 140px; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #D9F5FD, #02CFF9, #2563EB, #4400F0); vertical-align: middle; }
.at-two { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 760px) { .at-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.at-chart { width: 100%; height: auto; max-height: 190px; display: block; }
.at-swipe { display: none; font-size: .82rem; color: var(--ink-2); margin: 0; }
@container (max-width: 860px) { .at-swipe { display: block; } }
.at-chart text { font: 600 10px var(--font-body); fill: var(--ink-2); }
.at-chart .hl { fill: var(--ink); font-weight: 800; }
.at-note { font-size: .85rem; color: var(--ink-2); margin: 6px 0 0; }`;

  // ---------------------------------------------------------------- shared atom drawing
  function defs(u) {
    const rg = (id, a, b, c) => `<radialGradient id="${u}${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
    return `<defs>${rg('p', '#FFD0C8', '#FF6B57', '#C53A27')}${rg('n', '#F4F7FB', '#A3B1C6', '#5D6B82')}${rg('e', '#E2FDFF', '#02CFF9', '#0280A6')}${rg('g', '#FFF1B8', '#FFD23F', '#C99400')}
      <radialGradient id="${u}glow"><stop offset="0" stop-color="#FFD23F" stop-opacity=".5"/><stop offset=".6" stop-color="#FF7A1A" stop-opacity=".12"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient>
      <radialGradient id="${u}th" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFD6E0"/><stop offset=".6" stop-color="#FF8FA8"/><stop offset="1" stop-color="#D9466C"/></radialGradient>
      <radialGradient id="${u}au"><stop offset="0" stop-color="#FFE58A" stop-opacity=".55"/><stop offset="1" stop-color="#F5B90A" stop-opacity=".05"/></radialGradient></defs>`;
  }
  const STARS = Array.from({ length: 28 }, (_, i) => [((i * 97) % 440) - 220, ((i * 151 + 37) % 440) - 220, 0.6 + ((i * 7) % 5) * 0.25]);
  const starsSVG = () => `<g aria-hidden="true">${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".35"/>`).join('')}</g>`;
  function ball(u, kind, x, y, r, cls, extra) {
    const sign = kind === 'p' ? '+' : '';
    return `<g class="${cls || ''}" ${extra || ''}><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="url(#${u}${kind})" stroke="rgba(6,18,51,.35)" stroke-width=".8"/>${sign && r >= 6 ? `<text x="${x.toFixed(1)}" y="${(y + r * 0.42).toFixed(1)}" text-anchor="middle" font-size="${(r * 1.25).toFixed(1)}" font-weight="800" fill="${kind === 'p' ? '#fff' : '#06324A'}" style="pointer-events:none">${sign}</text>` : ''}</g>`;
  }
  // Nucleus: protons and neutrons evenly mixed, packed in a sunflower spiral.
  function nucleus(u, p, n, fresh) {
    const N = p + n;
    if (!N) return `<g aria-hidden="true"><circle r="34" fill="none" stroke="#9FB4FF" stroke-width="2" stroke-dasharray="6 6" opacity=".7"/><text y="10" text-anchor="middle" font-size="30" font-weight="800" fill="#9FB4FF">?</text></g>`;
    const r = N <= 12 ? 10 : N <= 28 ? 8.5 : 7;
    const c = r * 1.06;
    const kinds = [];
    for (let k = 0; k < N; k++) kinds.push(Math.floor(((k + 1) * p) / N) > Math.floor((k * p) / N) ? 'p' : 'n');
    let out = `<circle r="${(c * Math.sqrt(N) + r) * 1.9}" fill="url(#${u}glow)" class="at-glowp"/>`;
    for (let k = N - 1; k >= 0; k--) {
      const rr = N === 1 ? 0 : c * Math.sqrt(k + 0.5);
      const a = k * 2.39996;
      const isNew = fresh && fresh.part === kinds[k] && fresh.index === k;
      out += ball(u, kinds[k], rr * Math.cos(a), rr * Math.sin(a), r, isNew ? 'at-new' : '', isNew ? `style="--dx:${kinds[k] === 'p' ? -150 : 150}px;--dy:160px"` : '');
    }
    return `<g aria-hidden="true">${out}</g>`;
  }
  function bigNucleus(u, p, n) {
    const N = 70; let out = `<circle r="96" fill="url(#${u}glow)" class="at-glowp"/>`;
    const f = p / (p + n);
    for (let k = N - 1; k >= 0; k--) { const rr = 4.6 * Math.sqrt(k + 0.5); const a = k * 2.39996; out += ball(u, Math.floor((k + 1) * f) > Math.floor(k * f) ? 'p' : 'n', rr * Math.cos(a), rr * Math.sin(a), 5.2); }
    return `<g aria-hidden="true">${out}</g>`;
  }
  const ORDER8 = [0, 4, 2, 6, 1, 5, 3, 7];
  const ringR = (count) => (count <= 4 ? [84, 120, 156, 192].slice(0, count) : Array.from({ length: count }, (_, i) => 66 + i * (130 / (count - 1))));

  // ---------------------------------------------------------------- build, shells, isotopes
  function atomLab(root, cfg, api, mode) {
    const u = 'at' + (++uidN) + '-';
    const show = new Set(cfg.show || ['charge', 'mass', 'valency', 'config']);
    const S = { p: 0, n: 0, e: 0, fresh: null, angle: [0, 0, 0, 0, 0, 0, 0], goalDone: false };
    const target = cfg.target || null;
    let isoSym = null;
    function setElement(z, electrons) { const sym = SYM[z - 1]; S.p = z; S.n = commonA(sym) - z; S.e = electrons; }
    if (mode === 'shells') setElement(Z_OF[target || 'Na'], 0);
    if (mode === 'isotopes') { isoSym = target || 'Cl'; setElement(Z_OF[isoSym], Z_OF[isoSym]); }
    const big = () => S.p > 20;
    const sym = () => (S.p ? SYM[S.p - 1] : null);
    const known = () => S.p > 0 && !!isoOf(sym(), S.p + S.n);
    const maxN = () => { const l = ISO[sym()] || []; return l.length ? Math.max(...l.map((x) => x[0])) - S.p + 1 : 0; };
    const minN = () => (mode === 'isotopes' ? Math.max(0, Math.min(...ISO[isoSym].map((x) => x[0])) - S.p - 1) : 0);
    const shells = () => (big() ? shellsOf(S.p) : fill(S.e));

    const partCard = (kind, colour) => `<div class="at-part" role="group" aria-label="${esc(api.t(T[kind]))}">
        <div class="at-part-h"><span class="at-ball" style="--c:${colour}" aria-hidden="true">${kind === 'proton' ? '+' : kind === 'electron' ? minus : ''}</span>${esc(api.t(T[kind]))}</div>
        <div class="at-ctr">
          <button type="button" class="at-btn at-minus" data-key="remove:${kind}" aria-label="${esc(api.t(T.remove) + ' ' + api.t(T[kind + '1']))}">${minus}</button>
          <span class="at-count" data-count="${kind}" aria-live="polite">0</span>
          <button type="button" class="at-btn" style="--c:${colour}" data-key="add:${kind}" aria-label="${esc(api.t(T.add) + ' ' + api.t(T[kind + '1']))}">+</button>
        </div></div>`;
    const goal = mode === 'build' && target ? `<div class="at-goal" data-goal><span class="at-goal-i" aria-hidden="true"></span><span>${esc(api.t({ en: 'Goal: build a neutral ', hi: '\u0932\u0915\u094d\u0937\u094d\u092f: \u090f\u0915 \u0909\u0926\u093e\u0938\u0940\u0928 ' }))}${esc(api.t(NM(Z_OF[target])))} (${esc(target)})${esc(api.t({ en: ' atom', hi: ' \u092a\u0930\u092e\u093e\u0923\u0941 \u092c\u0928\u093e\u0913' }))}</span></div>` : '';
    const parts = mode === 'build' ? ['proton', 'neutron', 'electron'] : mode === 'shells' ? ['electron'] : ['neutron'];
    const COL = { proton: '#FF6B57', neutron: '#B7C3D4', electron: '#02CFF9' };
    const els = mode === 'shells' ? `<div class="at-card"><h3>${esc(api.t({ en: 'Choose an element', hi: '\u0915\u094b\u0908 \u0924\u0924\u094d\u0935 \u091a\u0941\u0928\u094b' }))}</h3><div class="at-els" role="group">${SYM.slice(0, 20).map((s, i) => `<button type="button" class="at-el" data-key="element:${s}" aria-pressed="false" aria-label="${esc(api.t(NM(i + 1)))}"><span>${s}</span><small>${i + 1}</small></button>`).join('')}</div></div>` : '';
    root.innerHTML = `<div class="at">${goal}
      <div class="at-main">
        <div class="at-view"><svg class="at-svg" viewBox="-220 -220 440 440" role="img" aria-label="${esc(api.t({ en: 'Model of the atom', hi: '\u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u093e \u092e\u0949\u0921\u0932' }))}"></svg></div>
        <div class="at-panel"><div class="at-parts">${parts.map((k) => partCard(k, COL[k])).join('')}</div><div class="at-card at-info"></div></div>
      </div>
      <p class="at-msg" aria-live="polite"></p>${els}
    </div>`;
    const svg = root.querySelector('svg');
    const info = root.querySelector('.at-info');
    const msgEl = root.querySelector('.at-msg');
    let msg = null;

    function svgAtom() {
      const sh = shells();
      const capsZ = [2, 8, 8, 2];
      const nRings = big() ? sh.length : Math.max(mode === 'shells' ? fill(S.p + anionCap(S.p)).length : 0, sh.length, mode === 'build' ? 3 : 0);
      const R = ringR(Math.max(nRings, 1)).slice(0, nRings);
      let rings = '';
      let elec = '';
      R.forEach((r, i) => {
        const cnt = sh[i] || 0;
        const full = !big() && cnt === capsZ[i] && i < 3;
        rings += `<circle r="${r}" fill="none" stroke="${full ? '#5EE0C9' : '#6F86D6'}" stroke-width="${full ? 2.4 : 1.6}" ${cnt ? '' : 'stroke-dasharray="5 7"'} opacity="${cnt ? 0.95 : 0.5}"/>`;
        const lx = r * Math.cos(-0.72), ly = r * Math.sin(-0.72);
        rings += `<g aria-hidden="true"><circle cx="${lx}" cy="${ly}" r="11" fill="#0E1A4A" stroke="${full ? '#5EE0C9' : '#6F86D6'}"/><text x="${lx}" y="${ly + 4.5}" text-anchor="middle" class="at-ring-l">${SHELL[i]}</text></g>`;
        let g = '';
        if (big()) {
          for (let j = 0; j < cnt; j++) { const a = (j / cnt) * Math.PI * 2; g += ball(u, 'e', r * Math.cos(a), r * Math.sin(a), cnt > 18 ? 3.2 : 4.2); }
        } else {
          const cap = capsZ[i];
          const order = cap === 8 ? ORDER8 : [0, 1];
          for (let j = 0; j < cap; j++) { const a = (j / cap) * Math.PI * 2 - Math.PI / 2; g += `<circle cx="${(r * Math.cos(a)).toFixed(1)}" cy="${(r * Math.sin(a)).toFixed(1)}" r="5" fill="none" stroke="#6F86D6" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>`; }
          for (let j = 0; j < cnt; j++) {
            const slot = order[j]; const a = (slot / cap) * Math.PI * 2 - Math.PI / 2;
            const isNew = S.fresh && S.fresh.part === 'e' && S.fresh.shell === i && S.fresh.index === j;
            g += ball(u, 'e', r * Math.cos(a), r * Math.sin(a), 8, isNew ? 'at-new' : '', isNew ? `style="--dx:${(-Math.cos(a) * 90).toFixed(0)}px;--dy:${(-Math.sin(a) * 90).toFixed(0)}px"` : '');
          }
        }
        elec += `<g data-rot="${i}" transform="rotate(${S.angle[i].toFixed(1)})">${g}</g>`;
      });
      const nuc = big() ? bigNucleus(u, S.p, S.n) : nucleus(u, S.p, S.n, S.fresh && S.fresh.part !== 'e' ? { part: S.fresh.part, index: S.fresh.index } : null);
      const capLine = big() ? '' : `<text x="0" y="212" text-anchor="middle" class="at-cap">${esc(api.t({ en: 'Shells hold: K 2 \u00b7 L 8 \u00b7 M 8 \u00b7 N 2 (up to calcium)', hi: '\u0915\u094b\u0936 \u092e\u0947\u0902 \u091c\u0917\u0939: K 2 \u00b7 L 8 \u00b7 M 8 \u00b7 N 2 (\u0915\u0948\u0932\u094d\u0936\u093f\u092f\u092e \u0924\u0915)' }))}</text>`;
      const scale = `<text x="0" y="-204" text-anchor="middle" class="at-cap">${esc(api.t({ en: 'Not to scale: a real nucleus is far smaller', hi: '\u092a\u0948\u092e\u093e\u0928\u0947 \u092a\u0930 \u0928\u0939\u0940\u0902: \u0905\u0938\u0932\u0940 \u0928\u093e\u092d\u093f\u0915 \u092c\u0939\u0941\u0924 \u0939\u0940 \u091b\u094b\u091f\u093e \u0939\u0948' }))}</text>`;
      svg.innerHTML = `${defs(u)}${starsSVG()}${rings}${elec}${nuc}${capLine}${scale}`;
    }

    function infoHTML() {
      const z = S.p, A = S.p + S.n, q = S.p - S.e;
      if (!z) {
        return `<div class="at-id"><div class="at-tile empty"><span class="ts">?</span></div><div class="at-idt"><div class="nm">${esc(api.t({ en: 'No atom yet', hi: '\u0905\u092d\u0940 \u0915\u094b\u0908 \u092a\u0930\u092e\u093e\u0923\u0941 \u0928\u0939\u0940\u0902' }))}</div><p class="muted">${esc(api.t({ en: 'The number of protons decides which element it is.', hi: '\u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0915\u0940 \u0938\u0902\u0916\u094d\u092f\u093e \u0924\u092f \u0915\u0930\u0924\u0940 \u0939\u0948 \u0915\u093f \u092f\u0939 \u0915\u094c\u0928-\u0938\u093e \u0924\u0924\u094d\u0935 \u0939\u0948\u0964' }))}</p></div></div>`;
      }
      const s = SYM[z - 1];
      const cat = CATS[category(z)];
      const k = known();
      const iso = isoOf(s, A);
      let tags = '';
      if (k) tags += `<span class="at-tag ok">${esc(s)}-${A}</span>`;
      else tags += `<span class="at-tag bad">${esc(api.t({ en: 'Not a stable nucleus', hi: '\u0938\u094d\u0925\u093f\u0930 \u0928\u093e\u092d\u093f\u0915 \u0928\u0939\u0940\u0902' }))}</span>`;
      if (iso && iso[2] && iso[2].includes('r')) tags += `<span class="at-tag warn">${esc(api.t({ en: 'Radioactive', hi: '\u0930\u0947\u0921\u093f\u092f\u094b\u0927\u0930\u094d\u092e\u0940' }))}</span>`;
      if (mode === 'shells' && q > 0 && !S.removed) tags += `<span class="at-tag warn">${esc(api.t({ en: `Electrons placed: ${S.e} of ${z}`, hi: `\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0930\u0916\u0947: ${z} \u092e\u0947\u0902 \u0938\u0947 ${S.e}` }))}</span>`;
      else tags += q === 0 ? `<span class="at-tag ok">${esc(api.t({ en: 'Neutral atom', hi: '\u0909\u0926\u093e\u0938\u0940\u0928 \u092a\u0930\u092e\u093e\u0923\u0941' }))}</span>` : `<span class="at-tag ion">${esc(api.t(q > 0 ? { en: 'Positive ion (cation)', hi: '\u0927\u0928\u093e\u092f\u0928' } : { en: 'Negative ion (anion)', hi: '\u090b\u0923\u093e\u092f\u0928' }))}</span>`;
      const rows = [[api.t({ en: 'Atomic number Z = protons', hi: '\u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u0902\u0916\u094d\u092f\u093e Z = \u092a\u094d\u0930\u094b\u091f\u0949\u0928' }), z]];
      if (show.has('mass')) rows.push([api.t({ en: 'Mass number A = p + n', hi: '\u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u0938\u0902\u0916\u094d\u092f\u093e A = p + n' }), `${S.p} + ${S.n} = ${A}`]);
      if (show.has('charge')) rows.push([api.t({ en: 'Charge', hi: '\u0906\u0935\u0947\u0936' }), q === 0 ? `0 (${S.p} \u2212 ${S.e})` : `${q > 0 ? '+' : minus}${Math.abs(q)} (${S.p} \u2212 ${S.e})`]);
      if (show.has('config')) rows.push([api.t({ en: 'Electrons in shells', hi: '\u0915\u094b\u0936\u094b\u0902 \u092e\u0947\u0902 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928' }), S.e ? shells().map((c, i) => `${SHELL[i]} ${c}`).join(', ') + ` <span class="muted">(${shells().join(', ')})</span>` : '\u2014']);
      if (show.has('valency') && z <= 20) rows.push([api.t({ en: 'Valency of ' + NAME_EN[z - 1], hi: NAME_HI[z - 1] + ' \u0915\u0940 \u0938\u0902\u092f\u094b\u091c\u0915\u0924\u093e' }), `${valency(z)}`]);
      return `<div class="at-id"><div class="at-tile" style="--c:${mixHex(cat.c, '#061233', 0.2)};--c2:${mixHex(cat.c, '#061233', 0.55)};--fg:#fff"><span class="tz">${z}</span><span class="ts">${esc(s)}</span><span class="tm">${esc(MASS[z - 1])} u</span></div>
        <div class="at-idt"><div class="nm">${esc(api.t(NM(z)))}</div>${notation(s, z, A, q)}<div>${tags}</div></div></div>
        <dl class="at-dl">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b}</dd>`).join('')}</dl>${mode === 'isotopes' ? isoHTML() : ''}`;
    }

    function isoHTML() {
      const s = isoSym; const list = ISO[s]; const A = S.p + S.n;
      const nat = list.filter((x) => x[1] > 0);
      const rows = list.map(([a, ab, fl]) => `<div class="at-iso ${a === A ? 'cur' : ''}"><span>${esc(s)}-${a}</span><span class="at-bar" aria-hidden="true"><i style="width:${Math.max(ab, 0.4)}%"></i></span><span class="pc">${ab ? (ab < 0.01 ? ab.toFixed(4) : ab < 1 ? ab.toFixed(3) : ab.toFixed(2)) + '%' : esc(api.t(fl && fl.includes('s') ? { en: 'made by us', hi: '\u092e\u093e\u0928\u0935-\u0928\u093f\u0930\u094d\u092e\u093f\u0924' } : { en: 'trace', hi: '\u0905\u0902\u0936 \u092e\u093e\u0924\u094d\u0930' }))}</span></div>`).join('');
      let avg = '';
      if (nat.length > 1) {
        const v = nat.reduce((t, [a, ab]) => t + a * ab, 0) / 100;
        avg = `<p><b>${esc(api.t({ en: 'Average atomic mass', hi: '\u0914\u0938\u0924 \u092a\u0930\u092e\u093e\u0923\u0941 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928' }))}</b></p><p class="at-math">(${nat.map(([a, ab]) => `${a} \u00d7 ${ab}`).join(' + ')}) \u00f7 100 \u2248 ${v.toFixed(2)} u</p><p class="at-note">${esc(api.t({ en: `Worked with mass numbers. The exact value in the periodic table is ${MASS[S.p - 1]} u.`, hi: `\u092f\u0939 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u0938\u0902\u0916\u094d\u092f\u093e\u0913\u0902 \u0938\u0947 \u0928\u093f\u0915\u093e\u0932\u093e \u0939\u0948\u0964 \u0906\u0935\u0930\u094d\u0924 \u0938\u093e\u0930\u0923\u0940 \u092e\u0947\u0902 \u0938\u091f\u0940\u0915 \u092e\u093e\u0928 ${MASS[S.p - 1]} u \u0939\u0948\u0964` }))}</p>`;
      } else if (nat.length === 1) avg = `<p class="at-note">${esc(api.t({ en: `Nature has only one stable isotope of ${NAME_EN[S.p - 1]}, so its atomic mass is close to ${nat[0][0]} u.`, hi: `\u092a\u094d\u0930\u0915\u0943\u0924\u093f \u092e\u0947\u0902 ${NAME_HI[S.p - 1]} \u0915\u093e \u0915\u0947\u0935\u0932 \u090f\u0915 \u0938\u094d\u0925\u093f\u0930 \u0938\u092e\u0938\u094d\u0925\u093e\u0928\u093f\u0915 \u0939\u0948, \u0907\u0938\u0932\u093f\u090f \u0907\u0938\u0915\u093e \u092a\u0930\u092e\u093e\u0923\u0941 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u0932\u0917\u092d\u0917 ${nat[0][0]} u \u0939\u0948\u0964` }))}</p>`;
      const isobars = Object.keys(ISO).filter((k) => k !== s && ISO[k].some((x) => x[0] === A)).map((k) => `${k}-${A}`);
      const use = USES[`${s}-${A}`];
      return `<h3 style="margin-top:12px">${esc(api.t({ en: 'Isotopes of ', hi: '\u0938\u092e\u0938\u094d\u0925\u093e\u0928\u093f\u0915: ' }))}${esc(api.t(NM(S.p)))}</h3><div class="at-isos">${rows}</div>${avg}
        ${use ? `<p><span class="at-tag warn">${esc(s)}-${A}</span> ${esc(api.t(use))}</p>` : ''}
        ${isobars.length && known() ? `<p class="at-note">${esc(api.t({ en: 'Isobars (same mass number, different element): ', hi: '\u0938\u092e\u092d\u093e\u0930\u093f\u0915 (\u0938\u092e\u093e\u0928 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u0938\u0902\u0916\u094d\u092f\u093e, \u0905\u0932\u0917 \u0924\u0924\u094d\u0935): ' }))}${esc(isobars.join(', '))}</p>` : ''}`;
    }

    function statusText() {
      const z = S.p, A = S.p + S.n, q = S.p - S.e;
      if (msg) return msg;
      if (!z) return api.t({ en: 'Tap + under Protons to start. One proton makes hydrogen.', hi: '\u0936\u0941\u0930\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0915\u0947 \u0928\u0940\u091a\u0947 + \u0926\u092c\u093e\u0913\u0964 \u090f\u0915 \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0938\u0947 \u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928 \u092c\u0928\u0924\u093e \u0939\u0948\u0964' });
      const nm = api.t(NM(z));
      if (!known()) return api.t({ en: `No stable ${NAME_EN[z - 1].toLowerCase()} atom has ${S.n} neutrons. A nucleus with ${z} protons and ${S.n} neutrons is radioactive: it breaks apart, some quickly, some over many years. Change the neutrons.`, hi: `${S.n} \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u0935\u093e\u0932\u093e \u0915\u094b\u0908 \u0938\u094d\u0925\u093f\u0930 ${NAME_HI[z - 1]} \u092a\u0930\u092e\u093e\u0923\u0941 \u0928\u0939\u0940\u0902 \u0939\u094b\u0924\u093e\u0964 ${z} \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0914\u0930 ${S.n} \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u0935\u093e\u0932\u093e \u0928\u093e\u092d\u093f\u0915 \u0930\u0947\u0921\u093f\u092f\u094b\u0927\u0930\u094d\u092e\u0940 \u0939\u0948: \u0935\u0939 \u091f\u0942\u091f \u091c\u093e\u0924\u093e \u0939\u0948, \u0915\u094b\u0908 \u091c\u0932\u094d\u0926\u0940, \u0915\u094b\u0908 \u092c\u0939\u0941\u0924 \u0935\u0930\u094d\u0937\u094b\u0902 \u092e\u0947\u0902\u0964 \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u092c\u0926\u0932\u094b\u0964` });
      if (mode === 'shells' && S.e < z && !S.removed) return api.t({ en: `${nm} has ${z} protons, so a neutral atom needs ${z} electrons. Placed: ${S.e}. Tap + to add the next one.`, hi: `${nm} \u092e\u0947\u0902 ${z} \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u0909\u0926\u093e\u0938\u0940\u0928 \u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u094b ${z} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u091a\u093e\u0939\u093f\u090f\u0964 \u0905\u092d\u0940: ${S.e}\u0964 \u0905\u0917\u0932\u093e \u091c\u094b\u0921\u093c\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f + \u0926\u092c\u093e\u0913\u0964` });
      if (q === 0) {
        const sh = fill(z); const v = sh[sh.length - 1];
        if (mode === 'isotopes') return api.t({ en: `${nm}-${A}: ${z} protons, ${S.n} neutrons. Every isotope of ${nm} has ${z} protons and ${z} electrons, so they react the same way; only the mass changes.`, hi: `${nm}-${A}: ${z} \u092a\u094d\u0930\u094b\u091f\u0949\u0928, ${S.n} \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928\u0964 ${nm} \u0915\u0947 \u0939\u0930 \u0938\u092e\u0938\u094d\u0925\u093e\u0928\u093f\u0915 \u092e\u0947\u0902 ${z} \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0914\u0930 ${z} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0939\u094b\u0924\u0947 \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u0909\u0928\u0915\u0940 \u0930\u093e\u0938\u093e\u092f\u0928\u093f\u0915 \u0905\u092d\u093f\u0915\u094d\u0930\u093f\u092f\u093e\u090f\u0901 \u090f\u0915 \u091c\u0948\u0938\u0940 \u0939\u094b\u0924\u0940 \u0939\u0948\u0902; \u0915\u0947\u0935\u0932 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u092c\u0926\u0932\u0924\u093e \u0939\u0948\u0964` });
        if ([2, 10, 18].includes(z)) return api.t({ en: `A neutral ${nm} atom. Its outer shell is full, so it hardly reacts: valency 0.`, hi: `\u090f\u0915 \u0909\u0926\u093e\u0938\u0940\u0928 ${nm} \u092a\u0930\u092e\u093e\u0923\u0941\u0964 \u0907\u0938\u0915\u093e \u092c\u093e\u0939\u0930\u0940 \u0915\u094b\u0936 \u092d\u0930\u093e \u0939\u0948, \u0907\u0938\u0932\u093f\u090f \u092f\u0939 \u0932\u0917\u092d\u0917 \u0905\u092d\u093f\u0915\u094d\u0930\u093f\u092f\u093e \u0928\u0939\u0940\u0902 \u0915\u0930\u0924\u093e: \u0938\u0902\u092f\u094b\u091c\u0915\u0924\u093e 0\u0964` });
        return api.t({ en: `A neutral ${nm} atom: ${z} protons and ${z} electrons, so the charge is 0. It has ${v} electron${v > 1 ? 's' : ''} in its outer shell, so its valency is ${valency(z)}.`, hi: `\u090f\u0915 \u0909\u0926\u093e\u0938\u0940\u0928 ${nm} \u092a\u0930\u092e\u093e\u0923\u0941: ${z} \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0914\u0930 ${z} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928, \u0907\u0938\u0932\u093f\u090f \u0906\u0935\u0947\u0936 0 \u0939\u0948\u0964 \u0907\u0938\u0915\u0947 \u092c\u093e\u0939\u0930\u0940 \u0915\u094b\u0936 \u092e\u0947\u0902 ${v} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u0938\u0902\u092f\u094b\u091c\u0915\u0924\u093e ${valency(z)} \u0939\u0948\u0964` });
      }
      const s = SYM[z - 1]; const ion = `${s}${Math.abs(q) > 1 ? Math.abs(q) : ''}${q > 0 ? '+' : minus}`;
      if (q > 0) return api.t({ en: `This is the ion ${ion}: ${q} electron${q > 1 ? 's' : ''} fewer than protons, so it is positive.${q > 3 ? ' Pulling off this many electrons needs a huge amount of energy.' : ''}`, hi: `\u092f\u0939 \u0906\u092f\u0928 ${ion} \u0939\u0948: \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0938\u0947 ${q} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0915\u092e, \u0907\u0938\u0932\u093f\u090f \u092f\u0939 \u0927\u0928\u093e\u0935\u0947\u0936\u093f\u0924 \u0939\u0948\u0964${q > 3 ? ' \u0907\u0924\u0928\u0947 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u093f\u0915\u093e\u0932\u0928\u0947 \u092e\u0947\u0902 \u092c\u0939\u0941\u0924 \u0905\u0927\u093f\u0915 \u090a\u0930\u094d\u091c\u093e \u0932\u0917\u0924\u0940 \u0939\u0948\u0964' : ''}` });
      return api.t({ en: `This is the ion ${ion}: ${-q} extra electron${q < -1 ? 's' : ''}, so it is negative.${fill(S.e).length && [2, 10, 18].includes(S.e) ? ' Now its outer shell is full, like a noble gas.' : ''}`, hi: `\u092f\u0939 \u0906\u092f\u0928 ${ion} \u0939\u0948: ${-q} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0905\u0927\u093f\u0915, \u0907\u0938\u0932\u093f\u090f \u092f\u0939 \u090b\u0923\u093e\u0935\u0947\u0936\u093f\u0924 \u0939\u0948\u0964${[2, 10, 18].includes(S.e) ? ' \u0905\u092c \u0907\u0938\u0915\u093e \u092c\u093e\u0939\u0930\u0940 \u0915\u094b\u0936 \u0909\u0924\u094d\u0915\u0943\u0937\u094d\u091f \u0917\u0948\u0938 \u0915\u0940 \u0924\u0930\u0939 \u092d\u0930\u093e \u0939\u0948\u0964' : ''}` });
    }

    function draw() {
      svgAtom();
      info.innerHTML = infoHTML();
      msgEl.textContent = statusText();
      root.querySelectorAll('[data-count]').forEach((c) => { c.textContent = S[c.dataset.count[0]]; });
      root.querySelectorAll('.at-el').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'element:' + sym())));
      const g = root.querySelector('[data-goal]');
      if (g) g.classList.toggle('done', S.goalDone);
    }

    function after(kind) {
      const z = S.p, A = S.p + S.n, q = S.p - S.e;
      if (kind === 'electron+' && !big()) {
        const sh = fill(S.e); const i = sh.length - 1; const caps = [2, 8, 8];
        if (i < 3 && sh[i] === caps[i]) {
          api.emit('shell-full');
          const more = S.e < Math.min(20, S.p + anionCap(S.p));
          const ionNow = S.e > S.p ? `${SYM[S.p - 1]}${S.e - S.p > 1 ? S.e - S.p : ''}${minus}` : '';
          msg = api.t({ en: `The ${SHELL[i]} shell is full with ${caps[i]} electrons.${more ? ` The next electron must go into the ${SHELL[i + 1]} shell.` : ''}${ionNow ? ` ${ionNow} now has a full outer shell, like a noble gas.` : ''}`, hi: `${SHELL[i]} \u0915\u094b\u0936 ${caps[i]} \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0938\u0947 \u092d\u0930 \u0917\u092f\u093e\u0964${more ? ` \u0905\u0917\u0932\u093e \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 ${SHELL[i + 1]} \u0915\u094b\u0936 \u092e\u0947\u0902 \u091c\u093e\u090f\u0917\u093e\u0964` : ''}${ionNow ? ` \u0905\u092c ${ionNow} \u0915\u093e \u092c\u093e\u0939\u0930\u0940 \u0915\u094b\u0936 \u0909\u0924\u094d\u0915\u0943\u0937\u094d\u091f \u0917\u0948\u0938 \u0915\u0940 \u0924\u0930\u0939 \u092d\u0930\u093e \u0939\u0948\u0964` : ''}` });
        }
      }
      if (z > 0 && !(mode === 'shells' && kind === 'electron+' && q > 0)) api.emit(q === 0 ? 'neutral' : 'ion');
      if (known()) api.emit(`isotope:${SYM[z - 1]}-${A}`);
      if (known() && q === 0 && (mode !== 'isotopes')) {
        api.emit('built:' + SYM[z - 1]);
        if (target && target === SYM[z - 1] && mode === 'build' && !S.goalDone) { S.goalDone = true; api.celebrate(); }
        if (mode === 'shells' && kind === 'electron+') api.celebrate();
      }
      draw();
      msg = null;
    }

    function change(key) {
      const [act, part] = key.split(':');
      const z = S.p;
      if (part === 'proton') {
        if (act === 'add') {
          if (S.p >= 20) { api.toast({ en: 'This lab builds elements up to calcium (20 protons).', hi: '\u092f\u0939 \u0932\u0948\u092c \u0915\u0948\u0932\u094d\u0936\u093f\u092f\u092e (20 \u092a\u094d\u0930\u094b\u091f\u0949\u0928) \u0924\u0915 \u0915\u0947 \u0924\u0924\u094d\u0935 \u092c\u0928\u093e\u0924\u0940 \u0939\u0948\u0964' }); return; }
          S.p++; S.fresh = { part: 'p', index: indexOfNew('p') };
        } else {
          if (!S.p) return;
          if (S.p === 1 && (S.n || S.e)) { api.toast({ en: 'Take out the neutrons and electrons first.', hi: '\u092a\u0939\u0932\u0947 \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u0914\u0930 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u093f\u0915\u093e\u0932\u094b\u0964' }); return; }
          if (S.e > S.p - 1 + anionCap(S.p - 1)) { api.toast({ en: 'Take out an electron first: the smaller atom cannot hold so many.', hi: '\u092a\u0939\u0932\u0947 \u090f\u0915 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u093f\u0915\u093e\u0932\u094b: \u091b\u094b\u091f\u093e \u092a\u0930\u092e\u093e\u0923\u0941 \u0907\u0924\u0928\u0947 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u0939\u0940\u0902 \u0930\u0916 \u0938\u0915\u0924\u093e\u0964' }); return; }
          S.p--; S.fresh = null;
        }
      } else if (part === 'neutron') {
        if (act === 'add') {
          if (!S.p) { api.toast({ en: 'Add a proton first.', hi: '\u092a\u0939\u0932\u0947 \u090f\u0915 \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u091c\u094b\u0921\u093c\u094b\u0964' }); return; }
          if (S.n >= maxN()) { api.toast({ en: `No ${NAME_EN[z - 1].toLowerCase()} nucleus holds that many neutrons.`, hi: `${NAME_HI[z - 1]} \u0915\u093e \u0915\u094b\u0908 \u0928\u093e\u092d\u093f\u0915 \u0907\u0924\u0928\u0947 \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u0928\u0939\u0940\u0902 \u0930\u0916\u0924\u093e\u0964` }); return; }
          S.n++; S.fresh = { part: 'n', index: indexOfNew('n') };
        } else {
          if (S.n <= minN()) { if (S.n > 0) api.toast({ en: `No ${NAME_EN[z - 1].toLowerCase()} nucleus has fewer neutrons than this.`, hi: `${NAME_HI[z - 1]} \u0915\u0947 \u0915\u093f\u0938\u0940 \u0928\u093e\u092d\u093f\u0915 \u092e\u0947\u0902 \u0907\u0938\u0938\u0947 \u0915\u092e \u0928\u094d\u092f\u0942\u091f\u094d\u0930\u0949\u0928 \u0928\u0939\u0940\u0902 \u0939\u094b\u0924\u0947\u0964` }); return; }
          S.n--; S.fresh = null;
        }
      } else if (part === 'electron') {
        if (act === 'add') {
          if (!S.p) { api.toast({ en: 'Add a proton first: the protons hold the electrons.', hi: '\u092a\u0939\u0932\u0947 \u090f\u0915 \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u091c\u094b\u0921\u093c\u094b: \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0939\u0940 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928\u094b\u0902 \u0915\u094b \u092a\u0915\u0921\u093c\u0947 \u0930\u0916\u0924\u0947 \u0939\u0948\u0902\u0964' }); return; }
          if (S.e >= S.p + anionCap(S.p)) {
            api.toast(anionCap(S.p) ? { en: `${NAME_EN[z - 1]} takes at most ${anionCap(S.p)} extra electron${anionCap(S.p) > 1 ? 's' : ''}.`, hi: `${NAME_HI[z - 1]} \u0905\u0927\u093f\u0915 \u0938\u0947 \u0905\u0927\u093f\u0915 ${anionCap(S.p)} \u0905\u0924\u093f\u0930\u093f\u0915\u094d\u0924 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0932\u0947\u0924\u093e \u0939\u0948\u0964` } : { en: `${NAME_EN[z - 1]} does not take extra electrons.`, hi: `${NAME_HI[z - 1]} \u0905\u0924\u093f\u0930\u093f\u0915\u094d\u0924 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u0939\u0940\u0902 \u0932\u0947\u0924\u093e\u0964` });
            return;
          }
          S.e++; if (S.e >= S.p) S.removed = false; const sh = fill(S.e); S.fresh = { part: 'e', shell: sh.length - 1, index: sh[sh.length - 1] - 1 };
        } else {
          if (!S.e) return;
          S.e--; S.fresh = null; S.removed = S.e < S.p && mode === 'shells' ? true : S.removed;
        }
      }
      api.record(api.t(act === 'add' ? { en: 'Added a ', hi: '\u091c\u094b\u0921\u093c\u093e \u090f\u0915 ' } : { en: 'Took out a ', hi: '\u0928\u093f\u0915\u093e\u0932\u093e \u090f\u0915 ' }) + api.t(T[part + '1']) + ` \u2192 p ${S.p}, n ${S.n}, e ${S.e}${S.p ? ' (' + SYM[S.p - 1] + ')' : ''}`);
      after(part + (act === 'add' ? '+' : '-'));
    }
    function indexOfNew(kind) {
      const N = S.p + S.n; const p = S.p;
      for (let k = N - 1; k >= 0; k--) { const isP = Math.floor(((k + 1) * p) / N) > Math.floor((k * p) / N); if ((kind === 'p') === isP) return k; }
      return -1;
    }

    function onClick(ev) {
      const b = ev.target.closest('[data-key]');
      if (!b || !root.contains(b)) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('element:')) {
        const s = key.slice(8); const z = Z_OF[s];
        setElement(z, 0); S.fresh = null; S.removed = false; S.angle = S.angle.map(() => 0);
        api.emit('picked:' + s); api.speak(api.t(NM(z)));
        api.record(api.t({ en: 'Chose ', hi: '\u091a\u0941\u0928\u093e: ' }) + api.t(NM(z)));
        msg = null; draw();
        return;
      }
      change(key);
    }
    root.addEventListener('click', onClick);

    let raf = 0, last = 0;
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      root.querySelectorAll('[data-rot]').forEach((g) => { const i = +g.dataset.rot; S.angle[i] = (S.angle[i] + dt * (26 / (i + 1))) % 360; g.setAttribute('transform', `rotate(${S.angle[i].toFixed(2)})`); });
      raf = requestAnimationFrame(frame);
    }
    draw();
    if (!reduced() && window.requestAnimationFrame) raf = requestAnimationFrame(frame);
    return { destroy() { cancelAnimationFrame(raf); root.removeEventListener('click', onClick); } };
  }

  // ---------------------------------------------------------------- periodic table
  const TRENDS = {
    cat: { en: 'Type', hi: '\u092a\u094d\u0930\u0915\u093e\u0930' }, block: { en: 'Block', hi: '\u092c\u094d\u0932\u0949\u0915' },
    en: { en: 'Electronegativity', hi: '\u0935\u093f\u0926\u094d\u092f\u0941\u0924-\u090b\u0923\u093e\u0924\u094d\u092e\u0915\u0924\u093e' }, ie: { en: 'Ionisation enthalpy', hi: '\u0906\u092f\u0928\u0928 \u090f\u0928\u094d\u0925\u0948\u0932\u094d\u092a\u0940' }, rad: { en: 'Atomic size', hi: '\u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u093e \u0906\u0915\u093e\u0930' },
  };
  const DATA = { en: { arr: ENEG, unit: '', d: 2 }, ie: { arr: IE1, unit: ' kJ/mol', d: 0 }, rad: { arr: RAD, unit: ' pm', d: 0 } };
  const heat = (t) => (t < 0.33 ? mixHex('#D9F5FD', '#02CFF9', t / 0.33) : t < 0.66 ? mixHex('#02CFF9', '#2563EB', (t - 0.33) / 0.33) : mixHex('#2563EB', '#4400F0', (t - 0.66) / 0.34));
  function cellColour(z, by) {
    if (by === 'cat') { const c = CATS[category(z)]; return [c.c, c.fg]; }
    if (by === 'block') { const b = BLOCKS[block(z)]; return [b.c, b.fg]; }
    const { arr } = DATA[by]; const v = arr[z - 1];
    if (v == null) return null;
    const vals = arr.filter((x) => x != null); const lo = Math.min(...vals), hi = Math.max(...vals);
    const t = (v - lo) / (hi - lo);
    return [heat(t), t > 0.42 ? '#FFFFFF' : '#1E293B'];
  }
  function tableLab(root, cfg, api) {
    const S = { pick: cfg.target ? Z_OF[cfg.target] : null, by: 'cat' };
    const cells = [];
    const pos = (z) => { const p = place(z); if (p.f) return { row: p.period === 6 ? 10 : 11, col: 1 + 3 + p.f }; return { row: p.period + 1, col: p.group + 1 }; };
    let html = '';
    for (let g = 1; g <= 18; g++) html += `<div class="at-gh" style="grid-row:1;grid-column:${g + 1}" aria-hidden="true">${g}</div>`;
    for (let p = 1; p <= 7; p++) html += `<div class="at-ph" style="grid-row:${p + 1};grid-column:1" aria-hidden="true">${p}</div>`;
    html += `<div class="at-gap" style="grid-row:9" aria-hidden="true"></div>`;
    html += `<div class="at-flab" style="grid-row:10;grid-column:2 / span 3">${esc(api.t({ en: 'Lanthanoids 58\u201371', hi: '\u0932\u0948\u0902\u0925\u0947\u0928\u0949\u092f\u0921 58\u201371' }))}</div><div class="at-flab" style="grid-row:11;grid-column:2 / span 3">${esc(api.t({ en: 'Actinoids 90\u2013103', hi: '\u0910\u0915\u094d\u091f\u093f\u0928\u0949\u092f\u0921 90\u2013103' }))}</div>`;
    for (let z = 1; z <= 118; z++) { const { row, col } = pos(z); html += `<button type="button" class="at-cell${z >= 104 ? ' pred' : ''}" data-key="element:${SYM[z - 1]}" aria-pressed="false" aria-label="${esc(api.t(NM(z)))}, ${z}" style="grid-row:${row};grid-column:${col}"><span class="z">${z}</span><span class="s">${SYM[z - 1]}</span></button>`; }
    root.innerHTML = `<div class="at">
      <div class="at-seg" role="group" aria-label="${esc(api.t({ en: 'Colour the table by', hi: '\u0938\u093e\u0930\u0923\u0940 \u0915\u094b \u0907\u0938\u0915\u0947 \u0905\u0928\u0941\u0938\u093e\u0930 \u0930\u0902\u0917\u094b' }))}">${Object.keys(TRENDS).map((k) => `<button type="button" class="at-chip" data-key="trend:${k}" aria-pressed="${k === S.by}">${esc(api.t(TRENDS[k]))}</button>`).join('')}</div>
      <div class="at-tw"><div class="at-pt" role="group" aria-label="${esc(api.t({ en: 'Periodic table', hi: '\u0906\u0935\u0930\u094d\u0924 \u0938\u093e\u0930\u0923\u0940' }))}">${html}</div></div>
      <p class="at-swipe">${esc(api.t({ en: 'Swipe the table sideways to see all 18 groups.', hi: '\u0938\u092d\u0940 18 \u0935\u0930\u094d\u0917 \u0926\u0947\u0916\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0938\u093e\u0930\u0923\u0940 \u0915\u094b \u092c\u0917\u0932 \u092e\u0947\u0902 \u0938\u0930\u0915\u093e\u0913\u0964' }))}</p>
      <div class="at-legend"></div>
      <div class="at-two"><div class="at-card at-detail" aria-live="polite"></div><div class="at-card at-trend"></div></div>
    </div>`;
    root.querySelectorAll('.at-cell').forEach((c) => cells.push(c));
    const legend = root.querySelector('.at-legend'), detail = root.querySelector('.at-detail'), trend = root.querySelector('.at-trend');

    function paint() {
      cells.forEach((c, i) => {
        const z = i + 1; const col = cellColour(z, S.by);
        c.classList.toggle('nod', !col);
        if (col) { c.style.setProperty('--bgc', col[0]); c.style.setProperty('--fgc', col[1]); }
        c.setAttribute('aria-pressed', String(S.pick === z));
      });
      root.querySelectorAll('[data-key^="trend:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'trend:' + S.by)));
      if (S.by === 'cat') legend.innerHTML = Object.values(CATS).map((c) => `<span><i style="--c:${c.c}"></i>${esc(api.t(c))}</span>`).join('') + `<span class="muted">${esc(api.t({ en: 'Striped: made in labs, properties predicted', hi: '\u0927\u093e\u0930\u0940\u0926\u093e\u0930: \u092a\u094d\u0930\u092f\u094b\u0917\u0936\u093e\u0932\u093e \u092e\u0947\u0902 \u092c\u0928\u0947, \u0917\u0941\u0923 \u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924' }))}</span>`;
      else if (S.by === 'block') legend.innerHTML = Object.entries(BLOCKS).map(([k, b]) => `<span><i style="--c:${b.c}"></i>${k}-${esc(api.t({ en: 'block', hi: '\u092c\u094d\u0932\u0949\u0915' }))}</span>`).join('') + `<span class="muted">${esc(api.t({ en: 'The block is the subshell that gets the last electron.', hi: '\u092c\u094d\u0932\u0949\u0915 \u0935\u0939 \u0909\u092a\u0915\u094b\u0936 \u0939\u0948 \u091c\u093f\u0938\u092e\u0947\u0902 \u0905\u0902\u0924\u093f\u092e \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u091c\u093e\u0924\u093e \u0939\u0948\u0964' }))}</span>`;
      else { const { arr, unit, d } = DATA[S.by]; const vals = arr.filter((x) => x != null); legend.innerHTML = `<span>${fmt(Math.min(...vals), d)}${esc(unit)}</span><span class="at-scale" aria-hidden="true"></span><span>${fmt(Math.max(...vals), d)}${esc(unit)}</span><span><i style="--c:var(--sunk)"></i>${esc(api.t({ en: 'no data', hi: '\u0906\u0901\u0915\u0921\u093c\u093e \u0928\u0939\u0940\u0902' }))}</span>`; }
      detailHTML(); trendHTML();
    }
    function detailHTML() {
      const z = S.pick;
      if (!z) { detail.innerHTML = `<h3>${esc(api.t({ en: 'Tap any element', hi: '\u0915\u093f\u0938\u0940 \u092d\u0940 \u0924\u0924\u094d\u0935 \u092a\u0930 \u091f\u0948\u092a \u0915\u0930\u094b' }))}</h3><p>${esc(api.t({ en: 'Elements are arranged by atomic number. Elements in the same group (column) have the same number of outer electrons, so they behave alike.', hi: '\u0924\u0924\u094d\u0935 \u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u0902\u0916\u094d\u092f\u093e \u0915\u0947 \u0915\u094d\u0930\u092e \u092e\u0947\u0902 \u0930\u0916\u0947 \u0917\u090f \u0939\u0948\u0902\u0964 \u090f\u0915 \u0939\u0940 \u0935\u0930\u094d\u0917 (\u0938\u094d\u0924\u0902\u092d) \u0915\u0947 \u0924\u0924\u094d\u0935\u094b\u0902 \u092e\u0947\u0902 \u092c\u093e\u0939\u0930\u0940 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u092c\u0930\u093e\u092c\u0930 \u0939\u094b\u0924\u0947 \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u0909\u0928\u0915\u0947 \u0917\u0941\u0923 \u092e\u093f\u0932\u0924\u0947-\u091c\u0941\u0932\u0924\u0947 \u0939\u0948\u0902\u0964' }))}</p>`; return; }
      const s = SYM[z - 1], pl = place(z), cat = CATS[category(z)], b = block(z);
      const st = { gas: W('Gas', '\u0917\u0948\u0938'), liquid: W('Liquid', '\u0926\u094d\u0930\u0935'), solid: W('Solid', '\u0920\u094b\u0938'), unknown: W('Not known', '\u091c\u094d\u091e\u093e\u0924 \u0928\u0939\u0940\u0902') }[stateOf(z)];
      const v = valencyMain(z);
      const rows = [
        [W('Atomic number', '\u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u0902\u0916\u094d\u092f\u093e'), z],
        [W('Atomic mass', '\u092a\u0930\u092e\u093e\u0923\u0941 \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928'), `${NOSTABLE(z) ? '[' + MASS[z - 1] + ']' : MASS[z - 1]} u`],
        [W('Group, period', '\u0935\u0930\u094d\u0917, \u0906\u0935\u0930\u094d\u0924'), `${pl.group || (b === 'f' ? api.t({ en: 'f-block', hi: 'f-\u092c\u094d\u0932\u0949\u0915' }) : '\u2014')}, ${pl.period}`],
        [W('Block, type', '\u092c\u094d\u0932\u0949\u0915, \u092a\u094d\u0930\u0915\u093e\u0930'), `${b}, ${esc(api.t(cat))}`],
        [W('State at room temperature', '\u0915\u092e\u0930\u0947 \u0915\u0947 \u0924\u093e\u092a \u092a\u0930 \u0905\u0935\u0938\u094d\u0925\u093e'), esc(api.t(st))],
        [W('Electronic configuration', '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928\u093f\u0915 \u0935\u093f\u0928\u094d\u092f\u093e\u0938'), configHTML(z) + (z >= 104 ? ` <span class="muted">(${esc(api.t({ en: 'predicted', hi: '\u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924' }))})</span>` : '')],
        [W('Electrons in shells', '\u0915\u094b\u0936\u094b\u0902 \u092e\u0947\u0902 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928'), shellsOf(z).join(', ')],
      ];
      if (v != null) rows.push([W('Valency', '\u0938\u0902\u092f\u094b\u091c\u0915\u0924\u093e'), v]);
      rows.push([W('Electronegativity', '\u0935\u093f\u0926\u094d\u092f\u0941\u0924-\u090b\u0923\u093e\u0924\u094d\u092e\u0915\u0924\u093e'), fmt(ENEG[z - 1], 2)], [W('1st ionisation enthalpy', '\u092a\u094d\u0930\u0925\u092e \u0906\u092f\u0928\u0928 \u090f\u0928\u094d\u0925\u0948\u0932\u094d\u092a\u0940'), IE1[z - 1] == null ? '\u2014' : IE1[z - 1] + ' kJ/mol'], [W('Covalent radius', '\u0938\u0939\u0938\u0902\u092f\u094b\u091c\u0915 \u0924\u094d\u0930\u093f\u091c\u094d\u092f\u093e'), RAD[z - 1] == null ? '\u2014' : RAD[z - 1] + ' pm']);
      detail.innerHTML = `<div class="at-id"><div class="at-tile" style="--c:${mixHex(cat.c, '#061233', 0.2)};--c2:${mixHex(cat.c, '#061233', 0.55)};--fg:#fff"><span class="tz">${z}</span><span class="ts">${esc(s)}</span><span class="tm">${esc(MASS[z - 1])}</span></div><div class="at-idt"><div class="nm">${esc(api.t(NM(z)))}</div><div class="muted">${esc(api.t(cat))}</div></div></div>
        <dl class="at-dl">${rows.map(([a, b2]) => `<dt>${esc(api.t(a))}</dt><dd>${b2}</dd>`).join('')}</dl>`;
    }
    function bars(list, key, z, title) {
      const { arr, d } = DATA[key];
      const items = list.map((x) => [x, arr[x - 1]]);
      const vals = items.map((x) => x[1]).filter((v) => v != null);
      if (vals.length < 2) return '';
      const max = Math.max(...vals);
      const w = 460, h = 120, n = items.length, bw = (w - 10) / n;
      const lab = n <= 18;
      return `<p><b>${esc(title)}</b></p><svg class="at-chart" viewBox="0 0 ${w} ${h + 26}" role="img" aria-label="${esc(title)}">${items.map(([x, v], i) => {
        const bh = v == null ? 0 : Math.max(2, (v / max) * (h - 16));
        const X = 5 + i * bw; const hl = x === z;
        return `<rect x="${(X + bw * 0.12).toFixed(1)}" y="${(h - bh + 4).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${hl ? '#FF7A1A' : '#8B3DFF'}" opacity="${v == null ? 0 : hl ? 1 : 0.75}"/>${hl ? `<text x="${(X + bw / 2).toFixed(1)}" y="${(h - bh).toFixed(1)}" text-anchor="middle" class="hl">${fmt(v, d)}</text>` : ''}${lab || hl ? `<text x="${(X + bw / 2).toFixed(1)}" y="${h + 18}" text-anchor="middle" class="${hl ? 'hl' : ''}">${SYM[x - 1]}</text>` : ''}`;
      }).join('')}</svg>`;
    }
    function trendHTML() {
      const by = S.by, z = S.pick;
      const LINES = {
        en: W('Electronegativity (how strongly an atom pulls shared electrons) rises across a period and falls down a group. Fluorine is the highest.', '\u0935\u093f\u0926\u094d\u092f\u0941\u0924-\u090b\u0923\u093e\u0924\u094d\u092e\u0915\u0924\u093e (\u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u093e\u091d\u093e \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928\u094b\u0902 \u0915\u094b \u0915\u093f\u0924\u0928\u0940 \u091c\u093c\u094b\u0930 \u0938\u0947 \u0916\u0940\u0902\u091a\u0924\u093e \u0939\u0948) \u0906\u0935\u0930\u094d\u0924 \u092e\u0947\u0902 \u092c\u093e\u090f\u0901 \u0938\u0947 \u0926\u093e\u090f\u0901 \u092c\u0922\u093c\u0924\u0940 \u0939\u0948 \u0914\u0930 \u0935\u0930\u094d\u0917 \u092e\u0947\u0902 \u0928\u0940\u091a\u0947 \u091c\u093e\u0928\u0947 \u092a\u0930 \u0918\u091f\u0924\u0940 \u0939\u0948\u0964 \u092b\u094d\u0932\u0941\u0913\u0930\u0940\u0928 \u0915\u0940 \u0938\u092c\u0938\u0947 \u0905\u0927\u093f\u0915 \u0939\u0948\u0964'),
        ie: W('Ionisation enthalpy (energy to pull off the outermost electron) rises across a period and falls down a group. Noble gases are highest, alkali metals lowest.', '\u0906\u092f\u0928\u0928 \u090f\u0928\u094d\u0925\u0948\u0932\u094d\u092a\u0940 (\u0938\u092c\u0938\u0947 \u092c\u093e\u0939\u0930\u0940 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0928\u093f\u0915\u093e\u0932\u0928\u0947 \u0915\u0940 \u090a\u0930\u094d\u091c\u093e) \u0906\u0935\u0930\u094d\u0924 \u092e\u0947\u0902 \u092c\u0922\u093c\u0924\u0940 \u0939\u0948 \u0914\u0930 \u0935\u0930\u094d\u0917 \u092e\u0947\u0902 \u0928\u0940\u091a\u0947 \u0918\u091f\u0924\u0940 \u0939\u0948\u0964 \u0909\u0924\u094d\u0915\u0943\u0937\u094d\u091f \u0917\u0948\u0938\u094b\u0902 \u0915\u0940 \u0938\u092c\u0938\u0947 \u0905\u0927\u093f\u0915, \u0915\u094d\u0937\u093e\u0930 \u0927\u093e\u0924\u0941\u0913\u0902 \u0915\u0940 \u0938\u092c\u0938\u0947 \u0915\u092e\u0964'),
        rad: W('Atoms get smaller across a period (more protons pull the shells in) and bigger down a group (a new shell is added each time).', '\u0906\u0935\u0930\u094d\u0924 \u092e\u0947\u0902 \u092c\u093e\u090f\u0901 \u0938\u0947 \u0926\u093e\u090f\u0901 \u092a\u0930\u092e\u093e\u0923\u0941 \u091b\u094b\u091f\u0947 \u0939\u094b\u0924\u0947 \u091c\u093e\u0924\u0947 \u0939\u0948\u0902 (\u0905\u0927\u093f\u0915 \u092a\u094d\u0930\u094b\u091f\u0949\u0928 \u0915\u094b\u0936\u094b\u0902 \u0915\u094b \u0905\u0902\u0926\u0930 \u0916\u0940\u0902\u091a\u0924\u0947 \u0939\u0948\u0902) \u0914\u0930 \u0935\u0930\u094d\u0917 \u092e\u0947\u0902 \u0928\u0940\u091a\u0947 \u092c\u0921\u093c\u0947 \u0939\u094b\u0924\u0947 \u0939\u0948\u0902 (\u0939\u0930 \u092c\u093e\u0930 \u090f\u0915 \u0928\u092f\u093e \u0915\u094b\u0936 \u091c\u0941\u0921\u093c\u0924\u093e \u0939\u0948)\u0964'),
        cat: W('Metals sit on the left and in the middle, non-metals on the right, and metalloids along the zig-zag line between them.', '\u0927\u093e\u0924\u0941\u090f\u0901 \u092c\u093e\u0908\u0902 \u0913\u0930 \u0914\u0930 \u092c\u0940\u091a \u092e\u0947\u0902 \u0939\u0948\u0902, \u0905\u0927\u093e\u0924\u0941\u090f\u0901 \u0926\u093e\u0908\u0902 \u0913\u0930, \u0914\u0930 \u0909\u092a\u0927\u093e\u0924\u0941\u090f\u0901 \u0909\u0928\u0915\u0947 \u092c\u0940\u091a \u0915\u0940 \u091f\u0947\u0922\u093c\u0940-\u092e\u0947\u0922\u093c\u0940 \u0930\u0947\u0916\u093e \u092a\u0930\u0964'),
        block: W('s-block: groups 1\u20132. p-block: groups 13\u201318. d-block: groups 3\u201312. f-block: the two rows below.', 's-\u092c\u094d\u0932\u0949\u0915: \u0935\u0930\u094d\u0917 1\u20132\u0964 p-\u092c\u094d\u0932\u0949\u0915: \u0935\u0930\u094d\u0917 13\u201318\u0964 d-\u092c\u094d\u0932\u0949\u0915: \u0935\u0930\u094d\u0917 3\u201312\u0964 f-\u092c\u094d\u0932\u0949\u0915: \u0928\u0940\u091a\u0947 \u0915\u0940 \u0926\u094b \u092a\u0902\u0915\u094d\u0924\u093f\u092f\u093e\u0901\u0964'),
      };
      let out = `<h3>${esc(api.t(TRENDS[by]))}</h3><p>${esc(api.t(LINES[by]))}</p>`;
      if (DATA[by] && z) {
        const pl = place(z);
        const period = []; for (let k = 1; k <= 118; k++) { const q = place(k); if (q.period === pl.period) period.push(k); }
        out += bars(period, by, z, api.t({ en: `Across period ${pl.period}`, hi: `\u0906\u0935\u0930\u094d\u0924 ${pl.period} \u092e\u0947\u0902 \u092c\u093e\u090f\u0901 \u0938\u0947 \u0926\u093e\u090f\u0901` }));
        if (pl.group) { const grp = []; for (let k = 1; k <= 118; k++) if (place(k).group === pl.group) grp.push(k); out += bars(grp, by, z, api.t({ en: `Down group ${pl.group}`, hi: `\u0935\u0930\u094d\u0917 ${pl.group} \u092e\u0947\u0902 \u090a\u092a\u0930 \u0938\u0947 \u0928\u0940\u091a\u0947` })); }
      } else if (DATA[by]) out += `<p class="at-note">${esc(api.t({ en: 'Tap an element to see its period and group as bar charts.', hi: '\u0915\u093f\u0938\u0940 \u0924\u0924\u094d\u0935 \u092a\u0930 \u091f\u0948\u092a \u0915\u0930\u094b, \u0909\u0938\u0915\u0947 \u0906\u0935\u0930\u094d\u0924 \u0914\u0930 \u0935\u0930\u094d\u0917 \u0915\u0947 \u092c\u093e\u0930 \u091a\u093e\u0930\u094d\u091f \u0926\u0947\u0916\u094b\u0964' }))}</p>`;
      trend.innerHTML = out;
    }
    function onClick(ev) {
      const b = ev.target.closest('[data-key]');
      if (!b || !root.contains(b)) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('element:')) {
        const s = key.slice(8); S.pick = Z_OF[s]; paint();
        api.emit('picked:' + s); api.speak(api.t(NM(S.pick)));
        api.record(api.t({ en: 'Picked ', hi: '\u091a\u0941\u0928\u093e: ' }) + api.t(NM(S.pick)));
      } else if (key.startsWith('trend:')) {
        S.by = key.slice(6); paint(); api.emit(key);
        api.record(api.t({ en: 'Coloured the table by ', hi: '\u0938\u093e\u0930\u0923\u0940 \u0915\u094b \u0930\u0902\u0917\u093e: ' }) + api.t(TRENDS[S.by]));
      }
    }
    root.addEventListener('click', onClick);
    paint();
    return { destroy() { root.removeEventListener('click', onClick); } };
  }

  // ---------------------------------------------------------------- models of the atom
  const MODELS = {
    thomson: { year: '1904', who: W('J. J. Thomson', '\u091c\u0947. \u091c\u0947. \u091f\u0949\u092e\u0938\u0928'), name: W('Thomson', '\u091f\u0949\u092e\u0938\u0928'),
      say: W('A ball of positive charge with electrons dotted through it, like seeds in a watermelon. The plus and minus charges are equal, so the atom is neutral.', '\u0927\u0928\u093e\u0935\u0947\u0936 \u0915\u0940 \u090f\u0915 \u0917\u0947\u0902\u0926 \u091c\u093f\u0938\u092e\u0947\u0902 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u091c\u0917\u0939-\u091c\u0917\u0939 \u0927\u0901\u0938\u0947 \u0939\u0948\u0902, \u091c\u0948\u0938\u0947 \u0924\u0930\u092c\u0942\u091c\u093c \u092e\u0947\u0902 \u092c\u0940\u091c\u0964 \u0927\u0928 \u0914\u0930 \u090b\u0923 \u0906\u0935\u0947\u0936 \u092c\u0930\u093e\u092c\u0930 \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u092a\u0930\u092e\u093e\u0923\u0941 \u0909\u0926\u093e\u0938\u0940\u0928 \u0939\u0948\u0964'),
      good: W('Explains why an atom is neutral and that it contains electrons.', '\u092c\u0924\u093e\u0924\u093e \u0939\u0948 \u0915\u093f \u092a\u0930\u092e\u093e\u0923\u0941 \u0909\u0926\u093e\u0938\u0940\u0928 \u0915\u094d\u092f\u094b\u0902 \u0939\u0948 \u0914\u0930 \u0909\u0938\u092e\u0947\u0902 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0939\u094b\u0924\u0947 \u0939\u0948\u0902\u0964'),
      bad: W('Cannot explain why a few alpha particles bounce back from a gold foil.', '\u092f\u0939 \u0928\u0939\u0940\u0902 \u092c\u0924\u093e \u092a\u093e\u0924\u093e \u0915\u093f \u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0938\u0947 \u0915\u0941\u091b \u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 \u0935\u093e\u092a\u0938 \u0915\u094d\u092f\u094b\u0902 \u0932\u094c\u091f\u0924\u0947 \u0939\u0948\u0902\u0964') },
    rutherford: { year: '1911', who: W('Ernest Rutherford', '\u0905\u0930\u094d\u0928\u0947\u0938\u094d\u091f \u0930\u0926\u0930\u092b\u093c\u094b\u0930\u094d\u0921'), name: W('Rutherford', '\u0930\u0926\u0930\u092b\u093c\u094b\u0930\u094d\u0921'),
      say: W('All the positive charge and nearly all the mass sit in a tiny nucleus at the centre. Electrons move around it. Most of the atom is empty space.', '\u0938\u093e\u0930\u093e \u0927\u0928\u093e\u0935\u0947\u0936 \u0914\u0930 \u0932\u0917\u092d\u0917 \u0938\u093e\u0930\u093e \u0926\u094d\u0930\u0935\u094d\u092f\u092e\u093e\u0928 \u0915\u0947\u0902\u0926\u094d\u0930 \u0915\u0947 \u090f\u0915 \u092c\u0939\u0941\u0924 \u091b\u094b\u091f\u0947 \u0928\u093e\u092d\u093f\u0915 \u092e\u0947\u0902 \u0939\u0948\u0964 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0909\u0938\u0915\u0947 \u091a\u093e\u0930\u094b\u0902 \u0913\u0930 \u0918\u0942\u092e\u0924\u0947 \u0939\u0948\u0902\u0964 \u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u093e \u0905\u0927\u093f\u0915\u0924\u0930 \u092d\u093e\u0917 \u0916\u093c\u093e\u0932\u0940 \u0939\u0948\u0964'),
      good: W('Explains the gold-foil result: most alpha particles pass straight through, a few are turned back by the nucleus.', '\u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0915\u093e \u092a\u0930\u093f\u0923\u093e\u092e \u0938\u092e\u091d\u093e\u0924\u093e \u0939\u0948: \u0905\u0927\u093f\u0915\u0924\u0930 \u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 \u0938\u0940\u0927\u0947 \u0928\u093f\u0915\u0932 \u091c\u093e\u0924\u0947 \u0939\u0948\u0902, \u0915\u0941\u091b \u0928\u093e\u092d\u093f\u0915 \u0938\u0947 \u091f\u0915\u0930\u093e\u0915\u0930 \u0932\u094c\u091f\u0924\u0947 \u0939\u0948\u0902\u0964'),
      bad: W('A charge moving in a circle should keep losing energy and fall into the nucleus, so this atom could not be stable.', '\u0917\u094b\u0932 \u0918\u0942\u092e\u0924\u093e \u0906\u0935\u0947\u0936 \u0932\u0917\u093e\u0924\u093e\u0930 \u090a\u0930\u094d\u091c\u093e \u0916\u094b\u0915\u0930 \u0928\u093e\u092d\u093f\u0915 \u092e\u0947\u0902 \u0917\u093f\u0930 \u091c\u093e\u0928\u093e \u091a\u093e\u0939\u093f\u090f, \u0907\u0938\u0932\u093f\u090f \u0910\u0938\u093e \u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u094d\u0925\u093f\u0930 \u0928\u0939\u0940\u0902 \u0930\u0939 \u0938\u0915\u0924\u093e\u0964') },
    bohr: { year: '1913', who: W('Niels Bohr', '\u0928\u0940\u0932\u094d\u0938 \u092c\u094b\u0930'), name: W('Bohr', '\u092c\u094b\u0930'),
      say: W('Electrons move only in certain orbits (shells K, L, M, \u2026), each with a fixed energy. In these orbits they do not lose energy. An electron gives out or takes in light only when it jumps between orbits.', '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0915\u0947\u0935\u0932 \u0915\u0941\u091b \u0928\u093f\u0936\u094d\u091a\u093f\u0924 \u0915\u0915\u094d\u0937\u093e\u0913\u0902 (\u0915\u094b\u0936 K, L, M, \u2026) \u092e\u0947\u0902 \u0918\u0942\u092e\u0924\u0947 \u0939\u0948\u0902, \u0939\u0930 \u090f\u0915 \u0915\u0940 \u090a\u0930\u094d\u091c\u093e \u0924\u092f \u0939\u0948\u0964 \u0907\u0928 \u0915\u0915\u094d\u0937\u093e\u0913\u0902 \u092e\u0947\u0902 \u0935\u0947 \u090a\u0930\u094d\u091c\u093e \u0928\u0939\u0940\u0902 \u0916\u094b\u0924\u0947\u0964 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u090f\u0915 \u0915\u0915\u094d\u0937\u093e \u0938\u0947 \u0926\u0942\u0938\u0930\u0940 \u092e\u0947\u0902 \u0915\u0942\u0926\u0928\u0947 \u092a\u0930 \u0939\u0940 \u092a\u094d\u0930\u0915\u093e\u0936 \u0926\u0947\u0924\u093e \u092f\u093e \u0932\u0947\u0924\u093e \u0939\u0948\u0964'),
      good: W('Explains why atoms are stable and why hydrogen gives out light of only certain colours.', '\u092c\u0924\u093e\u0924\u093e \u0939\u0948 \u0915\u093f \u092a\u0930\u092e\u093e\u0923\u0941 \u0938\u094d\u0925\u093f\u0930 \u0915\u094d\u092f\u094b\u0902 \u0939\u0948\u0902 \u0914\u0930 \u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928 \u0915\u0947\u0935\u0932 \u0915\u0941\u091b \u0916\u093c\u093e\u0938 \u0930\u0902\u0917\u094b\u0902 \u0915\u093e \u092a\u094d\u0930\u0915\u093e\u0936 \u0915\u094d\u092f\u094b\u0902 \u0926\u0947\u0924\u093e \u0939\u0948\u0964'),
      bad: W('Works exactly only for hydrogen-like atoms with one electron.', '\u0915\u0947\u0935\u0932 \u090f\u0915 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0935\u093e\u0932\u0947 \u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928 \u091c\u0948\u0938\u0947 \u092a\u0930\u092e\u093e\u0923\u0941\u0913\u0902 \u0915\u0947 \u0932\u093f\u090f \u0939\u0940 \u0938\u091f\u0940\u0915 \u0939\u0948\u0964') },
  };
  const EH = (n) => -13.6 / (n * n);
  const SERIES = { 1: W('Lyman series (ultraviolet)', '\u0932\u093e\u0907\u092e\u0928 \u0936\u094d\u0930\u0947\u0923\u0940 (\u092a\u0930\u093e\u092c\u0948\u0902\u0917\u0928\u0940)'), 2: W('Balmer series', '\u092c\u093e\u092e\u0930 \u0936\u094d\u0930\u0947\u0923\u0940'), 3: W('Paschen series (infrared)', '\u092a\u093e\u0936\u0928 \u0936\u094d\u0930\u0947\u0923\u0940 (\u0905\u0935\u0930\u0915\u094d\u0924)'), 4: W('Brackett series (infrared)', '\u092c\u094d\u0930\u0948\u0915\u0947\u091f \u0936\u094d\u0930\u0947\u0923\u0940 (\u0905\u0935\u0930\u0915\u094d\u0924)') };

  function modelsLab(root, cfg, api) {
    const u = 'at' + (++uidN) + '-';
    const S = { model: 'thomson', view: 'model', level: 1, r: 8, jump: null, tally: [0, 0, 0], running: false, shots: [], t0: 0, emitted: false, photon: null };
    root.innerHTML = `<div class="at">
      <div class="at-seg" role="group" aria-label="${esc(api.t({ en: 'Models of the atom', hi: '\u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u0947 \u092e\u0949\u0921\u0932' }))}">${Object.keys(MODELS).map((m) => `<button type="button" class="at-chip" data-key="model:${m}" aria-pressed="false">${esc(api.t(MODELS[m].name))}<small>${MODELS[m].year}</small></button>`).join('')}
        <button type="button" class="at-chip at-go" data-key="gold-foil" aria-pressed="false">${esc(api.t({ en: 'Gold-foil experiment', hi: '\u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0915\u093e \u092a\u094d\u0930\u092f\u094b\u0917' }))}</button></div>
      <div class="at-main">
        <div class="at-view"><svg class="at-svg" viewBox="-220 -220 440 440" role="img" aria-label="${esc(api.t({ en: 'Model of the atom', hi: '\u092a\u0930\u092e\u093e\u0923\u0941 \u0915\u093e \u092e\u0949\u0921\u0932' }))}"></svg></div>
        <div class="at-panel"><div class="at-card at-info"></div>
          <div class="at-card at-levels" hidden><h3>${esc(api.t({ en: 'Energy levels of hydrogen', hi: '\u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928 \u0915\u0947 \u090a\u0930\u094d\u091c\u093e \u0938\u094d\u0924\u0930' }))}</h3><svg class="at-lvsvg" viewBox="0 0 300 196" aria-hidden="true"></svg>
            <div class="at-lv" role="group" aria-label="${esc(api.t({ en: 'Move the electron to orbit', hi: '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0915\u094b \u0907\u0938 \u0915\u0915\u094d\u0937\u093e \u092e\u0947\u0902 \u0932\u0947 \u091c\u093e\u0913' }))}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="at-chip" data-key="level:${n}" aria-pressed="${n === 1}" aria-label="${esc(api.t({ en: 'Orbit n = ', hi: '\u0915\u0915\u094d\u0937\u093e n = ' }))}${n}">n=${n}</button>`).join('')}</div></div>
        </div>
      </div>
      <p class="at-msg" aria-live="polite"></p>
    </div>`;
    const svg = root.querySelector('.at-svg'), info = root.querySelector('.at-info'), levels = root.querySelector('.at-levels'), msgEl = root.querySelector('.at-msg');
    const lvsvg = root.querySelector('.at-lvsvg');

    function sceneModel() {
      const m = S.model;
      if (m === 'thomson') {
        const spiral = Array.from({ length: 24 }, (_, i) => { const ang = i * 2.39996, r = 27 * Math.sqrt(i + 0.5); return [r * Math.cos(ang), r * Math.sin(ang)]; });
        const pts = spiral.filter((_, i) => i % 2 === 1), plus = spiral.filter((_, i) => i % 2 === 0);
        return `<circle r="160" fill="url(#${u}th)" stroke="#FFB3C4" stroke-width="2"/>${plus.map(([x, y]) => `<text x="${x.toFixed(0)}" y="${(y + 5).toFixed(0)}" text-anchor="middle" font-size="26" font-weight="800" fill="#8E1238" opacity=".8">+</text>`).join('')}
          ${pts.map(([x, y], i) => `<g data-jig="${i}" data-x="${x}" data-y="${y}">${ball(u, 'e', x, y, 10)}</g>`).join('')}
          <text x="0" y="200" text-anchor="middle" class="at-svgs">${esc(api.t({ en: 'Positive sphere with electrons in it: 12 plus, 12 minus', hi: '\u0927\u0928\u093e\u0935\u0947\u0936\u093f\u0924 \u0917\u094b\u0932\u093e \u091c\u093f\u0938\u092e\u0947\u0902 \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0927\u0901\u0938\u0947 \u0939\u0948\u0902: 12 \u0927\u0928, 12 \u090b\u0923' }))}</text>`;
      }
      if (m === 'rutherford') {
        const orb = [0, 60, 120].map((r) => `<ellipse rx="170" ry="62" fill="none" stroke="#6F86D6" stroke-width="1.6" opacity=".8" transform="rotate(${r})"/>`).join('');
        return `${orb}<circle r="34" fill="url(#${u}glow)" class="at-glowp"/>${ball(u, 'p', 0, 0, 9)}
          ${[0, 1, 2].map((i) => `<g data-orb="${i}">${ball(u, 'e', 170, 0, 9)}</g>`).join('')}
          <text x="0" y="-198" text-anchor="middle" class="at-svgs">${esc(api.t({ en: 'Tiny heavy nucleus; electrons go round it', hi: '\u092c\u0939\u0941\u0924 \u091b\u094b\u091f\u093e \u092d\u093e\u0930\u0940 \u0928\u093e\u092d\u093f\u0915; \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0909\u0938\u0915\u0947 \u091a\u093e\u0930\u094b\u0902 \u0913\u0930 \u0918\u0942\u092e\u0924\u0947 \u0939\u0948\u0902' }))}</text>
          <text x="0" y="206" text-anchor="middle" class="at-cap">${esc(api.t({ en: 'Not to scale: the real nucleus would be far too small to see', hi: '\u092a\u0948\u092e\u093e\u0928\u0947 \u092a\u0930 \u0928\u0939\u0940\u0902: \u0905\u0938\u0932\u0940 \u0928\u093e\u092d\u093f\u0915 \u0926\u093f\u0916\u0928\u0947 \u092e\u0947\u0902 \u092c\u0939\u0941\u0924 \u0939\u0940 \u091b\u094b\u091f\u093e \u0939\u094b\u0917\u093e' }))}</text>`;
      }
      const orbits = [1, 2, 3, 4, 5].map((n) => `<circle r="${8 * n * n}" fill="none" stroke="${n === S.level ? '#5EE0C9' : '#6F86D6'}" stroke-width="${n === S.level ? 2.4 : 1.4}" opacity=".9"/>${n > 1 ? `<text x="${(8 * n * n * 0.71 + 6).toFixed(0)}" y="${(-8 * n * n * 0.71).toFixed(0)}" class="at-ring-l">n=${n}</text>` : ''}`).join('');
      return `${orbits}${ball(u, 'p', 0, 0, 5)}<g data-bohr>${ball(u, 'e', S.r, 0, 7)}</g><g data-photon></g>
        <text x="-212" y="-200" class="at-svgs">${esc(api.t({ en: 'Hydrogen: orbit radius = 0.053 \u00d7 n\u00b2 nm (drawn to scale)', hi: '\u0939\u093e\u0907\u0921\u094d\u0930\u094b\u091c\u0928: \u0915\u0915\u094d\u0937\u093e \u0915\u0940 \u0924\u094d\u0930\u093f\u091c\u094d\u092f\u093e = 0.053 \u00d7 n\u00b2 nm (\u092a\u0948\u092e\u093e\u0928\u0947 \u092a\u0930)' }))}</text>`;
    }
    function sceneFoil() {
      const nuc = []; for (let y = -176; y <= 176; y += 44) nuc.push(y);
      return `<text x="-208" y="-200" class="at-svgs">${esc(api.t({ en: 'Alpha particles (\u03b1) \u2192', hi: '\u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 (\u03b1) \u2192' }))}</text>
        <rect x="-2" y="-210" width="44" height="420" fill="#F5B90A" opacity=".12"/>
        ${nuc.map((y) => `<circle cx="20" cy="${y}" r="21" fill="url(#${u}au)"/><circle cx="20" cy="${y}" r="2.6" fill="url(#${u}g)"/>`).join('')}
        <text x="20" y="-196" text-anchor="middle" class="at-svgs">${esc(api.t({ en: 'Gold atoms (zoomed in)', hi: '\u0938\u094b\u0928\u0947 \u0915\u0947 \u092a\u0930\u092e\u093e\u0923\u0941 (\u092c\u0921\u093c\u093e \u0915\u0930\u0915\u0947)' }))}</text>
        <g data-alphas></g>`;
    }
    function draw() {
      svg.innerHTML = defs(u) + starsSVG() + (S.view === 'foil' ? sceneFoil() : sceneModel());
      root.querySelectorAll('[data-key^="model:"]').forEach((b) => b.setAttribute('aria-pressed', String(S.view === 'model' && b.dataset.key === 'model:' + S.model)));
      root.querySelector('[data-key="gold-foil"]').setAttribute('aria-pressed', String(S.view === 'foil'));
      levels.hidden = !(S.view === 'model' && S.model === 'bohr');
      if (S.view === 'foil') {
        info.innerHTML = `<h3>${esc(api.t({ en: 'Rutherford\u2019s gold-foil experiment (1909\u20131911)', hi: '\u0930\u0926\u0930\u092b\u093c\u094b\u0930\u094d\u0921 \u0915\u093e \u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0935\u093e\u0932\u093e \u092a\u094d\u0930\u092f\u094b\u0917 (1909\u20131911)' }))}</h3><p>${esc(api.t({ en: 'Fast, positive alpha particles are fired at a very thin gold foil. Watch where they go.', hi: '\u0924\u0947\u091c\u093c, \u0927\u0928\u093e\u0935\u0947\u0936\u093f\u0924 \u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 \u092c\u0939\u0941\u0924 \u092a\u0924\u0932\u0940 \u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u092a\u0930 \u091b\u094b\u0921\u093c\u0947 \u091c\u093e\u0924\u0947 \u0939\u0948\u0902\u0964 \u0926\u0947\u0916\u094b \u0935\u0947 \u0915\u0939\u093e\u0901 \u091c\u093e\u0924\u0947 \u0939\u0948\u0902\u0964' }))}</p>
          <div class="at-tally"><div><b data-t="0">${S.tally[0]}</b>${esc(api.t({ en: 'went straight', hi: '\u0938\u0940\u0927\u0947 \u0928\u093f\u0915\u0932\u0947' }))}</div><div><b data-t="1">${S.tally[1]}</b>${esc(api.t({ en: 'turned a little', hi: '\u0925\u094b\u0921\u093c\u0947 \u092e\u0941\u0921\u093c\u0947' }))}</div><div><b data-t="2">${S.tally[2]}</b>${esc(api.t({ en: 'bounced back', hi: '\u0935\u093e\u092a\u0938 \u0932\u094c\u091f\u0947' }))}</div></div>
          <p class="at-note">${esc(api.t({ en: 'The nuclei here are drawn much bigger, so more particles turn than in the real experiment, where only about 1 in many thousands bounced back.', hi: '\u092f\u0939\u093e\u0901 \u0928\u093e\u092d\u093f\u0915 \u092c\u0939\u0941\u0924 \u092c\u0921\u093c\u0947 \u0926\u093f\u0916\u093e\u090f \u0939\u0948\u0902, \u0907\u0938\u0932\u093f\u090f \u0905\u0938\u0932\u0940 \u092a\u094d\u0930\u092f\u094b\u0917 \u0938\u0947 \u0905\u0927\u093f\u0915 \u0915\u0923 \u092e\u0941\u0921\u093c\u0924\u0947 \u0939\u0948\u0902; \u0905\u0938\u0932\u0940 \u092a\u094d\u0930\u092f\u094b\u0917 \u092e\u0947\u0902 \u0915\u0908 \u0939\u091c\u093c\u093e\u0930 \u092e\u0947\u0902 \u0938\u0947 \u0932\u0917\u092d\u0917 \u090f\u0915 \u0939\u0940 \u0932\u094c\u091f\u0924\u093e \u0925\u093e\u0964' }))}</p>`;
      } else {
        const M = MODELS[S.model];
        info.innerHTML = `<h3>${esc(api.t(M.name))} ${esc(api.t({ en: 'model', hi: '\u092e\u0949\u0921\u0932' }))} <span class="muted">\u00b7 ${esc(api.t(M.who))}, ${M.year}</span></h3><p>${esc(api.t(M.say))}</p>
          <ul class="at-list"><li><b>${esc(api.t({ en: 'Strength: ', hi: '\u0916\u093c\u0942\u092c\u0940: ' }))}</b>${esc(api.t(M.good))}</li><li><b>${esc(api.t({ en: 'Problem: ', hi: '\u0915\u092e\u0940: ' }))}</b>${esc(api.t(M.bad))}</li></ul>`;
      }
      levelsSVG();
      root.querySelectorAll('[data-key^="level:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'level:' + S.level)));
    }
    function levelsSVG() {
      const y = (E) => 34 + (-E / 13.6) * 132;
      let out = `<text x="4" y="12">${esc(api.t({ en: 'n=4: \u22120.85 \u00b7 n=5: \u22120.54 \u00b7 0 = electron set free', hi: 'n=4: \u22120.85 \u00b7 n=5: \u22120.54 \u00b7 0 = \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u092e\u0941\u0915\u094d\u0924' }))}</text><line x1="60" y1="${y(0)}" x2="250" y2="${y(0)}" stroke="currentColor" stroke-dasharray="3 4" opacity=".4"/>`;
      for (let n = 1; n <= 5; n++) {
        const Y = y(EH(n)); const cur = n === S.level;
        out += `<line x1="60" y1="${Y.toFixed(1)}" x2="250" y2="${Y.toFixed(1)}" stroke="${cur ? '#0F766E' : '#6F86D6'}" stroke-width="${cur ? 3 : 2}"/>`;
        if (n <= 3) out += `<text x="4" y="${(Y + 4).toFixed(1)}">n=${n}</text><text x="256" y="${(Y + 4).toFixed(1)}">${EH(n).toFixed(2).replace('-', minus)}</text>`;
        if (cur) out += `<circle cx="155" cy="${Y.toFixed(1)}" r="6" fill="#02CFF9" stroke="#0280A6"/>`;
      }
      if (S.photon) { const a = y(EH(S.photon.from)), b = y(EH(S.photon.to)); out += `<line x1="200" y1="${a}" x2="200" y2="${b}" stroke="${S.photon.colour}" stroke-width="3" marker-end=""/><path d="M195 ${b + (b > a ? -8 : 8)} L200 ${b} L205 ${b + (b > a ? -8 : 8)}" fill="none" stroke="${S.photon.colour}" stroke-width="3"/>`; }
      out += `<text x="60" y="190">${esc(api.t({ en: 'Energy in eV: E = \u221213.6 \u00f7 n\u00b2', hi: '\u090a\u0930\u094d\u091c\u093e eV \u092e\u0947\u0902: E = \u221213.6 \u00f7 n\u00b2' }))}</text>`;
      lvsvg.innerHTML = out;
    }

    // Rutherford scattering: deflection angle from the impact parameter b, tan(\u03b8/2) = d / (2b).
    function fire() {
      S.view = 'foil'; S.tally = [0, 0, 0]; S.emitted = false; draw();
      const g = svg.querySelector('[data-alphas]');
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const D = 0.3, N = 44, shots = [];
      for (let i = 0; i < N; i++) {
        let y = -200 + rnd() * 400;
        if (i === 9) y = 88 - 0.08; if (i === 23) y = -44 + 0.5; if (i === 33) y = 1.0;
        const yn = Math.max(-176, Math.min(176, Math.round(y / 44) * 44));
        const b = Math.max(0.1, Math.abs(y - yn)); const side = y < yn ? -1 : 1;
        const th = 2 * Math.atan(D / (2 * b));
        const px = 20 - D / 2, s = 26, cx = Math.cos(th), sy = side * Math.sin(th);
        const d = `M-215 ${y.toFixed(2)} L${(px - s).toFixed(2)} ${y.toFixed(2)} Q${px.toFixed(2)} ${y.toFixed(2)} ${(px + s * cx).toFixed(2)} ${(y + s * sy).toFixed(2)} L${(px + 330 * cx).toFixed(2)} ${(y + 330 * sy).toFixed(2)}`;
        const deg = (th * 180) / Math.PI;
        shots.push({ d, deg, cls: deg < 10 ? 0 : deg < 90 ? 1 : 2 });
      }
      g.innerHTML = shots.map((s, i) => `<path id="${u}a${i}" d="${s.d}" fill="none" stroke="${['#FFD23F', '#FF7A1A', '#FF6B57'][s.cls]}" stroke-width="${s.cls ? 2 : 1.2}" opacity="${s.cls ? 0.95 : 0.55}"/><circle id="${u}b${i}" r="4" fill="#FFD23F" stroke="#B45309" opacity="0"/>`).join('');
      S.shots = shots.map((s, i) => { const p = g.querySelector('#' + u + 'a' + i); const len = p.getTotalLength(); p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; return Object.assign(s, { p, c: g.querySelector('#' + u + 'b' + i), len, counted: false }); });
      S.running = true; S.t0 = performance.now();
      api.record(api.t({ en: 'Fired alpha particles at the gold foil', hi: '\u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u092a\u0930 \u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 \u091b\u094b\u0921\u093c\u0947' }));
      msgEl.textContent = api.t({ en: 'Alpha particles are on their way\u2026', hi: '\u0910\u0932\u094d\u092b\u093c\u093e \u0915\u0923 \u091a\u0932 \u092a\u0921\u093c\u0947\u2026' });
      if (reduced() || !window.requestAnimationFrame) { S.shots.forEach((s) => { s.p.style.strokeDashoffset = '0'; count(s); }); finishFoil(); }
    }
    function count(s) {
      if (s.counted) return; s.counted = true; S.tally[s.cls]++;
      const el = info.querySelector(`[data-t="${s.cls}"]`); if (el) el.textContent = S.tally[s.cls];
      if (s.cls === 2 && !S.emitted) { S.emitted = true; api.emit('deflected'); msgEl.textContent = api.t({ en: 'One bounced back! It must have hit something tiny, heavy and positive: the nucleus.', hi: '\u090f\u0915 \u0915\u0923 \u0935\u093e\u092a\u0938 \u0932\u094c\u091f\u093e! \u0935\u0939 \u0915\u093f\u0938\u0940 \u092c\u0939\u0941\u0924 \u091b\u094b\u091f\u0940, \u092d\u093e\u0930\u0940 \u0914\u0930 \u0927\u0928\u093e\u0935\u0947\u0936\u093f\u0924 \u091a\u0940\u091c\u093c \u0938\u0947 \u091f\u0915\u0930\u093e\u092f\u093e \u0939\u094b\u0917\u093e: \u0928\u093e\u092d\u093f\u0915 \u0938\u0947\u0964' }); }
    }
    function finishFoil() {
      S.running = false;
      msgEl.textContent = api.t({ en: `Most went straight through (${S.tally[0]}), ${S.tally[1]} turned a little and ${S.tally[2]} bounced back. So the atom is mostly empty space with a tiny positive nucleus.`, hi: `\u0905\u0927\u093f\u0915\u0924\u0930 \u0915\u0923 \u0938\u0940\u0927\u0947 \u0928\u093f\u0915\u0932 \u0917\u090f (${S.tally[0]}), ${S.tally[1]} \u0925\u094b\u0921\u093c\u0947 \u092e\u0941\u0921\u093c\u0947 \u0914\u0930 ${S.tally[2]} \u0935\u093e\u092a\u0938 \u0932\u094c\u091f\u0947\u0964 \u0907\u0938\u0932\u093f\u090f \u092a\u0930\u092e\u093e\u0923\u0941 \u091c\u093c\u094d\u092f\u093e\u0926\u093e\u0924\u0930 \u0916\u093c\u093e\u0932\u0940 \u0939\u0948 \u0914\u0930 \u092c\u0940\u091a \u092e\u0947\u0902 \u090f\u0915 \u092c\u0939\u0941\u0924 \u091b\u094b\u091f\u093e \u0927\u0928\u093e\u0935\u0947\u0936\u093f\u0924 \u0928\u093e\u092d\u093f\u0915 \u0939\u0948\u0964` });
      if (!S.emitted && (S.tally[1] || S.tally[2])) { S.emitted = true; api.emit('deflected'); }
    }

    function jumpTo(n) {
      if (S.jump || n === S.level) return;
      const from = S.level; const dE = EH(n) - EH(from); const nm = 1239.84 / Math.abs(dE);
      const vis = nm >= 380 && nm <= 750; const colour = vis ? waveColour(nm) : nm < 380 ? '#B794F6' : '#F87171';
      const kind = vis ? 'visible' : nm < 380 ? 'uv' : 'ir';
      S.jump = true; S.photon = { from, to: n, colour };
      const r0 = 8 * from * from, r1 = 8 * n * n;
      const done = () => {
        S.level = n; S.r = r1; S.jump = null; draw();
        api.emit('level:' + n);
        const band = vis ? api.t({ en: 'visible light', hi: '\u0926\u0943\u0936\u094d\u092f \u092a\u094d\u0930\u0915\u093e\u0936' }) : nm < 380 ? api.t({ en: 'ultraviolet (invisible)', hi: '\u092a\u0930\u093e\u092c\u0948\u0902\u0917\u0928\u0940 (\u0905\u0926\u0943\u0936\u094d\u092f)' }) : api.t({ en: 'infrared (invisible)', hi: '\u0905\u0935\u0930\u0915\u094d\u0924 (\u0905\u0926\u0943\u0936\u094d\u092f)' });
        if (dE < 0) {
          api.emit('photon:' + kind);
          msgEl.textContent = api.t({ en: `The electron fell from n=${from} to n=${n} and gave out light: energy ${Math.abs(dE).toFixed(2)} eV, wavelength ${nm.toFixed(0)} nm, ${band}. ${api.t(SERIES[n])}.`, hi: `\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 n=${from} \u0938\u0947 n=${n} \u092a\u0930 \u0917\u093f\u0930\u093e \u0914\u0930 \u092a\u094d\u0930\u0915\u093e\u0936 \u0928\u093f\u0915\u0932\u093e: \u090a\u0930\u094d\u091c\u093e ${Math.abs(dE).toFixed(2)} eV, \u0924\u0930\u0902\u0917\u0926\u0948\u0930\u094d\u0918\u094d\u092f ${nm.toFixed(0)} nm, ${band}\u0964 ${api.t(SERIES[n])}\u0964` });
          photonWave(colour, r1);
        } else {
          msgEl.textContent = api.t({ en: `To jump from n=${from} up to n=${n} the electron had to take in exactly ${dE.toFixed(2)} eV of energy (light of ${nm.toFixed(0)} nm).`, hi: `n=${from} \u0938\u0947 \u090a\u092a\u0930 n=${n} \u092a\u0930 \u0915\u0942\u0926\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0915\u094b \u0920\u0940\u0915 ${dE.toFixed(2)} eV \u090a\u0930\u094d\u091c\u093e (${nm.toFixed(0)} nm \u0915\u093e \u092a\u094d\u0930\u0915\u093e\u0936) \u0932\u0947\u0928\u0940 \u092a\u0921\u093c\u0940\u0964` });
        }
        api.record(`n=${from} \u2192 n=${n}${dE < 0 ? `, ${nm.toFixed(0)} nm` : ''}`);
      };
      tween(700, (t) => { S.r = lerp(r0, r1, ease(t)); }, done);
    }
    function photonWave(colour, r) {
      const g = svg.querySelector('[data-photon]'); if (!g) return;
      let d = `M${r} 0`; for (let x = 0; x <= 150; x += 3) d += ` L${(r + x).toFixed(1)} ${(-x * 0.9 + Math.sin(x / 5) * 7).toFixed(1)}`;
      g.innerHTML = `<path d="${d}" fill="none" stroke="${colour}" stroke-width="3.5" stroke-linecap="round" opacity=".95"/>`;
      const p = g.firstChild; const len = p.getTotalLength(); p.style.strokeDasharray = `${len}`;
      tween(1100, (t) => { p.style.strokeDashoffset = `${len * (1 - t)}`; }, () => { setTimeout(() => { if (p.parentNode) p.style.opacity = '0.35'; }, 700); });
    }

    let raf = 0;
    function frame(now) {
      const t = now / 1000;
      if (S.view === 'model') {
        if (S.model === 'thomson') svg.querySelectorAll('[data-jig]').forEach((g) => { const i = +g.dataset.jig; g.setAttribute('transform', `translate(${(Math.sin(t * 2 + i) * 1.6).toFixed(2)} ${(Math.cos(t * 1.7 + i * 2) * 1.6).toFixed(2)})`); });
        else if (S.model === 'rutherford') svg.querySelectorAll('[data-orb]').forEach((g) => { const i = +g.dataset.orb; const a = t * (1.1 + i * 0.25) + i * 2; const x = 170 * Math.cos(a), y = 62 * Math.sin(a); const rot = (i * 60 * Math.PI) / 180; g.setAttribute('transform', `translate(${(x * Math.cos(rot) - y * Math.sin(rot) - 170).toFixed(2)} ${(x * Math.sin(rot) + y * Math.cos(rot)).toFixed(2)})`); });
        else { const g = svg.querySelector('[data-bohr]'); if (g) { const a = t * (2.2 / Math.pow(S.level, 1.5)); g.setAttribute('transform', `rotate(${(((a * 180) / Math.PI) % 360).toFixed(2)})`); const c = g.querySelector('circle'); const tt = g.querySelector('text'); if (c) c.setAttribute('cx', S.r.toFixed(2)); if (tt) tt.setAttribute('x', S.r.toFixed(2)); } }
      } else if (S.running) {
        const el = now - S.t0; let alive = false;
        S.shots.forEach((s, i) => {
          const k = (el - i * 85) / 1500;
          if (k < 0) { alive = true; return; }
          const q = Math.min(1, k);
          s.p.style.strokeDashoffset = `${s.len * (1 - q)}`;
          const pt = s.p.getPointAtLength(s.len * q); s.c.setAttribute('cx', pt.x.toFixed(1)); s.c.setAttribute('cy', pt.y.toFixed(1)); s.c.setAttribute('opacity', q < 1 ? 1 : 0);
          if (q > 0.45) count(s);
          if (q < 1) alive = true;
        });
        if (!alive) finishFoil();
      }
      raf = requestAnimationFrame(frame);
    }

    function onClick(ev) {
      const b = ev.target.closest('[data-key]');
      if (!b || !root.contains(b)) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('model:')) {
        S.model = key.slice(6); S.view = 'model'; S.running = false; S.photon = null; draw();
        msgEl.textContent = api.t(S.model === 'bohr' ? { en: 'Tap n=2 \u2026 n=5 to lift the electron, then a lower n to make it give out light.', hi: '\u0907\u0932\u0947\u0915\u094d\u091f\u094d\u0930\u0949\u0928 \u0915\u094b \u090a\u092a\u0930 \u0932\u0947 \u091c\u093e\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f n=2 \u2026 n=5 \u0926\u092c\u093e\u0913, \u092b\u093f\u0930 \u092a\u094d\u0930\u0915\u093e\u0936 \u0928\u093f\u0915\u0932\u0935\u093e\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0915\u094b\u0908 \u0928\u093f\u091a\u0932\u093e n \u0926\u092c\u093e\u0913\u0964' } : S.model === 'thomson' ? { en: 'Now try the gold-foil experiment and see if this model can explain it.', hi: '\u0905\u092c \u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0935\u093e\u0932\u093e \u092a\u094d\u0930\u092f\u094b\u0917 \u0915\u0930\u094b \u0914\u0930 \u0926\u0947\u0916\u094b \u0915\u093f \u0915\u094d\u092f\u093e \u092f\u0939 \u092e\u0949\u0921\u0932 \u0909\u0938\u0947 \u0938\u092e\u091d\u093e \u092a\u093e\u0924\u093e \u0939\u0948\u0964' } : { en: 'Compare: where is the positive charge in this model?', hi: '\u0924\u0941\u0932\u0928\u093e \u0915\u0930\u094b: \u0907\u0938 \u092e\u0949\u0921\u0932 \u092e\u0947\u0902 \u0927\u0928\u093e\u0935\u0947\u0936 \u0915\u0939\u093e\u0901 \u0939\u0948?' });
        api.emit(key); api.record(api.t({ en: 'Looked at the model: ', hi: '\u092e\u0949\u0921\u0932 \u0926\u0947\u0916\u093e: ' }) + api.t(MODELS[S.model].name));
      } else if (key === 'gold-foil') {
        if (S.running) return;
        fire();
      } else if (key.startsWith('level:')) {
        jumpTo(Number(key.slice(6)));
      }
    }
    root.addEventListener('click', onClick);
    draw();
    msgEl.textContent = api.t({ en: 'Tap a model to compare them, then run the gold-foil experiment.', hi: '\u092e\u0949\u0921\u0932\u094b\u0902 \u0915\u0940 \u0924\u0941\u0932\u0928\u093e \u0915\u0947 \u0932\u093f\u090f \u0915\u093f\u0938\u0940 \u092a\u0930 \u091f\u0948\u092a \u0915\u0930\u094b, \u092b\u093f\u0930 \u0938\u094b\u0928\u0947 \u0915\u0940 \u092a\u0928\u094d\u0928\u0940 \u0935\u093e\u0932\u093e \u092a\u094d\u0930\u092f\u094b\u0917 \u091a\u0932\u093e\u0913\u0964' });
    if (!reduced() && window.requestAnimationFrame) raf = requestAnimationFrame(frame);
    return { destroy() { cancelAnimationFrame(raf); S.running = false; root.removeEventListener('click', onClick); } };
  }

  // ---------------------------------------------------------------- register
  const MODES = ['build', 'shells', 'isotopes', 'table', 'models'];
  const SHOW = ['charge', 'mass', 'valency', 'config'];
  NCA_T.register({
    id: 'atom',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'target', 'show'].includes(k)) e.push('unknown config key: ' + k); });
      if (!MODES.includes(c.mode)) { e.push(`mode: one of ${MODES.join(', ')}`); return e; }
      if (c.target != null) {
        const z = Z_OF[c.target];
        if (typeof c.target !== 'string' || !z) e.push('unknown element symbol: ' + c.target);
        else if ((c.mode === 'build' || c.mode === 'shells') && z > 20) e.push(`target: ${c.mode} mode takes H to Ca (Z 1\u201320)`);
        else if (c.mode === 'isotopes' && !ISO[c.target]) e.push(`target: isotopes mode knows ${Object.keys(ISO).join(', ')}`);
        else if (c.mode === 'models') e.push('target: models mode does not take an element');
      }
      if (c.show != null) {
        if (!['build', 'shells', 'isotopes'].includes(c.mode)) e.push('show: only for build, shells and isotopes modes');
        else if (!Array.isArray(c.show) || !c.show.length) e.push('show: a non-empty array of ' + SHOW.join(', '));
        else { c.show.forEach((s) => { if (!SHOW.includes(s)) e.push('show: unknown item ' + s); }); if (new Set(c.show).size !== c.show.length) e.push('show: repeated item'); }
      }
      return e;
    },
    keys(c) {
      const mode = c && c.mode;
      if (mode === 'build') return { targets: ['add:proton', 'add:neutron', 'add:electron', 'remove:proton', 'remove:neutron', 'remove:electron'], events: ['built:*', 'neutral', 'ion', 'isotope:*', 'shell-full'] };
      if (mode === 'shells') return { targets: ['add:electron', 'remove:electron', 'element:*'], events: ['built:*', 'neutral', 'ion', 'shell-full', 'picked:*', 'isotope:*'] };
      if (mode === 'isotopes') { const s = (c.target && ISO[c.target]) ? c.target : 'Cl'; return { targets: ['add:neutron', 'remove:neutron'], events: ISO[s].map(([a]) => `isotope:${s}-${a}`).concat(['neutral']) }; }
      if (mode === 'table') return { targets: ['element:*', 'trend:cat', 'trend:block', 'trend:en', 'trend:ie', 'trend:rad'], events: ['picked:*', 'trend:cat', 'trend:block', 'trend:en', 'trend:ie', 'trend:rad'] };
      if (mode === 'models') return { targets: ['model:thomson', 'model:rutherford', 'model:bohr', 'gold-foil', 'level:*'], events: ['model:thomson', 'model:rutherford', 'model:bohr', 'deflected', 'level:*', 'photon:visible', 'photon:uv', 'photon:ir'] };
      return { targets: [], events: [] };
    },
    demo: { mode: 'build', target: 'Na', show: ['charge', 'mass', 'valency', 'config'] },
    elements: SYM,
    mount(root, config, api) {
      const m = config.mode;
      if (m === 'table') return tableLab(root, config, api);
      if (m === 'models') return modelsLab(root, config, api);
      return atomLab(root, config, api, m);
    },
  });
})();
