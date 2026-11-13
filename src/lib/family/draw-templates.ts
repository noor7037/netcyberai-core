// Syllabus-linked drawing templates (C514): pure data and lookups, safe for the phone (no database, no message file).
// Each outline is original line art drawn for NetCyberAI (strokes only, one viewBox, no script, no external reference,
// no bitmap) and served as a static file at /draw/templates/<id>.svg, so the phone can keep it for offline use. The
// manifest below names its classes, subject, catalog chapter (a key in data/catalog/cbse-*.csv, or null when no chapter
// of the board's catalog is the template's own), words in English and Hindi, themed colours and whether a parent must
// allow it first. A completion is counted, never the drawing; nothing here scores art.

import type { DrawTemplate } from './draw-contract';

export type DrawLang = 'en' | 'hi';
type Words = { en: string; hi: string };

export type DrawTemplateEntry = {
  id: string;
  classes: readonly [number, number];
  subject: string;
  chapterKey: string | null;
  title: Words;
  task: Words;
  labels: { en: readonly string[]; hi: readonly string[] };
  palette: readonly string[];
  // A parent turns on "Allow all drawing activities" for the child before this one opens.
  parentGate: boolean;
};

// The Control switch the templates live under: the drawing board's (W16). The studio slice may give drawing its own
// module; then this one name changes.
export const DRAW_MODULE = 'tutor_board';

export const DRAW_TEMPLATE_ID =/^[a-z0-9][a-z0-9.-]{2,79}$/;
export const templateSrc = (id: string) => `/draw/templates/${id}.svg`;

const L = (en: string[], hi: string[]) => ({ en, hi });

export const DRAW_TEMPLATES: readonly DrawTemplateEntry[] = [
  // ---- Classes 1 to 4, guided -----------------------------------------------------------------------------------------
  {
    id: 'c01.english.my-family-tree', classes: [1, 3], subject: 'english', chapterKey: null, parentGate: true,
    title: { en: 'My family tree', hi: 'मेरा परिवार' },
    task: { en: 'Draw the people in your family in the boxes and write who they are.', hi: 'डिब्बों में अपने परिवार के लोग बनाओ और लिखो कि वे कौन हैं।' },
    labels: L(['Me', 'Mother', 'Father', 'Grandmother', 'Grandfather', 'Sister', 'Brother'], ['मैं', 'माँ', 'पिता', 'दादी', 'दादा', 'बहन', 'भाई']),
    palette: ['#E4572E', '#F3A712', '#29335C', '#669BBC', '#A8C686', '#8E5572'],
  },
  {
    id: 'c03.evs.parts-of-a-plant', classes: [3, 5], subject: 'evs', chapterKey: null, parentGate: false,
    title: { en: 'Parts of a plant', hi: 'पौधे के भाग' },
    task: { en: 'Colour the plant and label its five parts.', hi: 'पौधे में रंग भरो और उसके पाँच भागों के नाम लिखो।' },
    labels: L(['Root', 'Stem', 'Leaf', 'Flower', 'Fruit'], ['जड़', 'तना', 'पत्ती', 'फूल', 'फल']),
    palette: ['#2E7D32', '#81C784', '#8D6E63', '#F06292', '#FFB300', '#E53935'],
  },
  {
    id: 'c01.maths.shapes-town', classes: [1, 3], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Shapes town', hi: 'आकारों का शहर' },
    task: { en: 'Colour every circle red, every triangle green and every square blue. Then add a shape of your own.', hi: 'हर गोले को लाल, हर त्रिभुज को हरा और हर वर्ग को नीला रंगो। फिर अपना एक आकार जोड़ो।' },
    labels: L(['Circle', 'Square', 'Triangle', 'Rectangle'], ['गोला', 'वर्ग', 'त्रिभुज', 'आयत']),
    palette: ['#E53935', '#43A047', '#1E88E5', '#FDD835', '#8E24AA', '#6D4C41'],
  },
  {
    id: 'c01.maths.number-line-hop', classes: [1, 3], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Number line hop', hi: 'संख्या रेखा पर छलांग' },
    task: { en: 'Write 0 to 10 in the boxes. Help the frog hop from 2 to 7, one hop at a time. How many hops?', hi: 'डिब्बों में 0 से 10 लिखो। मेंढक को 2 से 7 तक एक-एक करके कुदाओ। कितनी छलांगें लगीं?' },
    labels: L(['Start', 'Stop', 'Hop'], ['शुरू', 'रुको', 'छलांग']),
    palette: ['#43A047', '#1E88E5', '#FB8C00', '#E53935', '#5E35B1'],
  },
  {
    id: 'c03.evs.healthy-plate', classes: [3, 5], subject: 'evs', chapterKey: null, parentGate: false,
    title: { en: 'A healthy plate', hi: 'सेहतमंद थाली' },
    task: { en: 'Draw a food in each part of the plate and milk in the glass. Name each food group.', hi: 'थाली के हर हिस्से में एक खाना बनाओ और गिलास में दूध। हर खाने के समूह का नाम लिखो।' },
    labels: L(['Grains', 'Pulses', 'Vegetables', 'Fruits', 'Milk'], ['अनाज', 'दालें', 'सब्ज़ियाँ', 'फल', 'दूध']),
    palette: ['#F9A825', '#8D6E63', '#43A047', '#E53935', '#FB8C00', '#90CAF9'],
  },
  {
    id: 'c03.evs.good-habits', classes: [3, 4], subject: 'evs', chapterKey: null, parentGate: false,
    title: { en: 'Good habits', hi: 'अच्छी आदतें' },
    task: { en: 'Draw yourself doing each good habit and write its name.', hi: 'हर अच्छी आदत करते हुए खुद को बनाओ और उसका नाम लिखो।' },
    labels: L(['Brush your teeth', 'Wash your hands', 'Sleep on time', 'Drink water'], ['दाँत साफ़ करो', 'हाथ धोओ', 'समय पर सोओ', 'पानी पियो']),
    palette: ['#29B6F6', '#66BB6A', '#FFCA28', '#5C6BC0', '#EF5350'],
  },
  {
    id: 'c03.evs.seasons-wheel', classes: [3, 5], subject: 'evs', chapterKey: null, parentGate: false,
    title: { en: 'Seasons wheel', hi: 'ऋतुओं का पहिया' },
    task: { en: 'Name the season in each part and draw what you wear or eat in it.', hi: 'हर हिस्से में ऋतु का नाम लिखो और उसमें तुम क्या पहनते या खाते हो, वह बनाओ।' },
    labels: L(['Summer', 'Rainy season', 'Winter', 'Spring'], ['गर्मी', 'बरसात', 'सर्दी', 'वसंत']),
    palette: ['#FFB300', '#039BE5', '#90A4AE', '#EC407A', '#7CB342', '#FF7043'],
  },
  {
    id: 'c02.maths.clock-face', classes: [2, 4], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Clock face', hi: 'घड़ी का चेहरा' },
    task: { en: 'Write 1 to 12 at the long marks. Draw the hands to show 3 o’clock.', hi: 'लंबे निशानों पर 1 से 12 लिखो। 3 बजे का समय दिखाने के लिए सुइयाँ बनाओ।' },
    labels: L(['Hour hand', 'Minute hand'], ['घंटे की सुई', 'मिनट की सुई']),
    palette: ['#1E88E5', '#E53935', '#FDD835', '#43A047', '#6D4C41'],
  },

  // ---- Science and EVS: life cycles and systems ------------------------------------------------------------------------
  {
    id: 'c03.science.frog-life-cycle', classes: [3, 8], subject: 'science', chapterKey: null, parentGate: false,
    title: { en: 'Life cycle of a frog', hi: 'मेंढक का जीवन चक्र' },
    task: { en: 'Follow the arrows: colour each stage and label it.', hi: 'तीरों के साथ चलो: हर अवस्था में रंग भरो और उसका नाम लिखो।' },
    labels: L(['Eggs', 'Tadpole', 'Tadpole with legs', 'Froglet', 'Adult frog'], ['अंडे', 'टैडपोल', 'पैरों वाला टैडपोल', 'नन्हा मेंढक', 'वयस्क मेंढक']),
    palette: ['#2E7D32', '#66BB6A', '#A5D6A7', '#6D4C41', '#A1887F', '#4FC3F7'],
  },
  {
    id: 'c03.science.butterfly-life-cycle', classes: [3, 8], subject: 'science', chapterKey: null, parentGate: false,
    title: { en: 'Life cycle of a butterfly', hi: 'तितली का जीवन चक्र' },
    task: { en: 'Follow the arrows: colour the four stages and label each one.', hi: 'तीरों के साथ चलो: चारों अवस्थाओं में रंग भरो और हर एक का नाम लिखो।' },
    labels: L(['Egg', 'Caterpillar (larva)', 'Pupa', 'Butterfly (adult)'], ['अंडा', 'इल्ली (लार्वा)', 'प्यूपा', 'तितली (वयस्क)']),
    palette: ['#FB8C00', '#FDD835', '#7CB342', '#8E24AA', '#29B6F6', '#6D4C41'],
  },
  {
    id: 'c03.evs.plant-from-seed', classes: [3, 6], subject: 'science', chapterKey: null, parentGate: false,
    title: { en: 'From seed to plant', hi: 'बीज से पौधा' },
    task: { en: 'Colour how a seed grows into a plant and label each stage.', hi: 'बीज के पौधा बनने की हर अवस्था में रंग भरो और नाम लिखो।' },
    labels: L(['Seed', 'Root and shoot', 'Seedling', 'Young plant', 'Plant with flowers'], ['बीज', 'जड़ और अंकुर', 'नन्हा पौधा', 'बढ़ता पौधा', 'फूलों वाला पौधा']),
    palette: ['#8D6E63', '#A1887F', '#7CB342', '#2E7D32', '#F06292', '#FFCA28'],
  },
  {
    id: 'c04.science.water-cycle', classes: [4, 9], subject: 'science', chapterKey: null, parentGate: false,
    title: { en: 'The water cycle', hi: 'जल चक्र' },
    task: { en: 'Colour the picture and label each step where the arrows show it.', hi: 'चित्र में रंग भरो और जहाँ तीर दिखाते हैं, वहाँ हर चरण का नाम लिखो।' },
    labels: L(['Evaporation', 'Condensation', 'Precipitation', 'Collection'], ['वाष्पीकरण', 'संघनन', 'वर्षण', 'संग्रहण']),
    palette: ['#0277BD', '#4FC3F7', '#B3E5FC', '#FFB300', '#78909C', '#558B2F'],
  },
  {
    id: 'c05.science.food-chain', classes: [5, 10], subject: 'science', chapterKey: 'cbse.c10.science.u5.ch01', parentGate: false,
    title: { en: 'A food chain', hi: 'एक आहार शृंखला' },
    task: { en: 'Draw each living thing in its box: grass, grasshopper, frog, snake, eagle. The arrows show who is eaten by whom. Label the producer and the consumers.', hi: 'हर डिब्बे में जीव बनाओ: घास, टिड्डा, मेंढक, साँप, बाज़। तीर बताते हैं कि किसे कौन खाता है। उत्पादक और उपभोक्ताओं के नाम लिखो।' },
    labels: L(['Producer', 'Herbivore', 'Carnivore', 'Sun'], ['उत्पादक', 'शाकाहारी', 'मांसाहारी', 'सूर्य']),
    palette: ['#7CB342', '#33691E', '#FFB300', '#6D4C41', '#8D6E63', '#455A64'],
  },
  {
    id: 'c06.science.parts-of-a-flower', classes: [6, 9], subject: 'science', chapterKey: 'cbse.c9.science.u1.ch03', parentGate: false,
    title: { en: 'Parts of a flower', hi: 'फूल के भाग' },
    task: { en: 'Colour the cut flower and label its parts on the dotted lines.', hi: 'कटे हुए फूल में रंग भरो और बिंदु वाली रेखाओं पर उसके भागों के नाम लिखो।' },
    labels: L(['Petal', 'Sepal', 'Stigma', 'Style', 'Ovary', 'Anther', 'Filament'], ['पंखुड़ी', 'बाह्यदल', 'वर्तिकाग्र', 'वर्तिका', 'अंडाशय', 'परागकोश', 'तंतु']),
    palette: ['#EC407A', '#F8BBD0', '#7CB342', '#FFCA28', '#8E24AA', '#2E7D32'],
  },

  // ---- Mathematics --------------------------------------------------------------------------------------------------------
  {
    id: 'c01.maths.pattern-strip', classes: [1, 4], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Continue the pattern', hi: 'पैटर्न आगे बढ़ाओ' },
    task: { en: 'Find the rule in each row and draw the shapes that come next in the empty boxes.', hi: 'हर पंक्ति का नियम पहचानो और खाली डिब्बों में आगे आने वाले आकार बनाओ।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
  },
  {
    id: 'c03.maths.symmetry', classes: [3, 7], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Complete the other half', hi: 'दूसरा आधा पूरा करो' },
    task: { en: 'The dotted line is a line of symmetry. Draw the other half of each picture so both sides match.', hi: 'बिंदु वाली रेखा सममिति रेखा है। हर चित्र का दूसरा आधा ऐसे बनाओ कि दोनों ओर एक जैसे हों।' },
    labels: L(['Line of symmetry'], ['सममिति रेखा']),
    palette: ['#5E35B1', '#FB8C00', '#00897B', '#E91E63', '#FDD835'],
  },
  {
    id: 'c03.maths.fraction-pizza', classes: [3, 6], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Fraction pizzas', hi: 'भिन्न वाले पिज़्ज़ा' },
    task: { en: 'Colour 1/2 of the first pizza, 3/4 of the second and 5/8 of the third. Write the fraction under each.', hi: 'पहले पिज़्ज़ा का 1/2, दूसरे का 3/4 और तीसरे का 5/8 भाग रंगो। हर एक के नीचे भिन्न लिखो।' },
    labels: L(['1/2', '1/4', '3/4', '1/8', '5/8'], ['1/2', '1/4', '3/4', '1/8', '5/8']),
    palette: ['#FFB300', '#E53935', '#43A047', '#8D6E63', '#FFF176'],
  },
  {
    id: 'c05.maths.tessellation', classes: [5, 8], subject: 'mathematics', chapterKey: null, parentGate: false,
    title: { en: 'Tile the floor', hi: 'फ़र्श पर टाइलें' },
    task: { en: 'Hexagons fit together with no gaps. Continue the tiles to fill the box, then colour a pattern.', hi: 'षट्भुज बिना जगह छोड़े आपस में जुड़ते हैं। डिब्बा भरने तक टाइलें बनाते जाओ, फिर कोई पैटर्न रंगो।' },
    labels: L(['Hexagon'], ['षट्भुज']),
    palette: ['#00897B', '#FFB300', '#3949AB', '#E53935', '#F5F5F5', '#6D4C41'],
  },
  {
    id: 'c09.maths.growing-pattern', classes: [9, 9], subject: 'mathematics', chapterKey: 'cbse.c9.mathematics.u2.ch02', parentGate: false,
    title: { en: 'A growing pattern', hi: 'बढ़ता हुआ पैटर्न' },
    task: { en: 'The shapes use 1, 3 and 5 squares. Draw the fourth shape in the dotted box, write the number of squares under each, and the rule for the nth term.', hi: 'आकारों में 1, 3 और 5 वर्ग हैं। बिंदु वाले डिब्बे में चौथा आकार बनाओ, हर एक के नीचे वर्गों की संख्या लिखो, और n-वें पद का नियम लिखो।' },
    labels: L(['Term', 'Common difference', 'nth term'], ['पद', 'सार्व अंतर', 'n-वाँ पद']),
    palette: ['#3949AB', '#00ACC1', '#FDD835', '#E53935', '#43A047'],
  },

  // ---- Social science and art-integrated, Classes 6 to 10 -------------------------------------------------------------
  {
    id: 'c07.social.mughal-jama', classes: [7, 9], subject: 'social_science', chapterKey: null, parentGate: true,
    title: { en: 'Mughal-era dress: the jama', hi: 'मुग़ल काल की पोशाक: जामा' },
    task: { en: 'Colour the jama, a long robe tied at the side, worn with a sash and a turban. Add patterns and label each part.', hi: 'जामा में रंग भरो, एक लंबा चोगा जो बगल में बाँधा जाता था, पटके और पगड़ी के साथ पहना जाता था। नमूने बनाओ और हर भाग का नाम लिखो।' },
    labels: L(['Jama', 'Patka (sash)', 'Turban', 'Pyjama'], ['जामा', 'पटका', 'पगड़ी', 'पायजामा']),
    palette: ['#1B5E20', '#880E4F', '#0D47A1', '#4A148C', '#FFB300', '#F5E6C8'],
  },
  {
    id: 'c07.social.mughal-peshwaz', classes: [7, 9], subject: 'social_science', chapterKey: null, parentGate: true,
    title: { en: 'Mughal-era dress: the peshwaz', hi: 'मुग़ल काल की पोशाक: पेशवाज़' },
    task: { en: 'Colour the peshwaz, a long, flowing robe, worn with a dupatta and churidar. Add borders and label each part.', hi: 'पेशवाज़ में रंग भरो, एक लंबा, घेरदार चोगा, जो दुपट्टे और चूड़ीदार के साथ पहना जाता था। किनारियाँ बनाओ और हर भाग का नाम लिखो।' },
    labels: L(['Peshwaz', 'Dupatta', 'Churidar'], ['पेशवाज़', 'दुपट्टा', 'चूड़ीदार']),
    palette: ['#880E4F', '#004D40', '#1A237E', '#B71C1C', '#FFB300', '#F5E6C8'],
  },
  {
    id: 'c07.social.mughal-jali-arch', classes: [7, 10], subject: 'social_science', chapterKey: null, parentGate: false,
    title: { en: 'An arch with a jali', hi: 'जाली वाली मेहराब' },
    task: { en: 'Colour the pointed arch and its jali, a stone screen cut into a lattice. Repeat the pattern evenly.', hi: 'नुकीली मेहराब और उसकी जाली में रंग भरो, जाली पत्थर में काटा गया झरोखा है। नमूने को बराबर दोहराओ।' },
    labels: L(['Arch', 'Jali'], ['मेहराब', 'जाली']),
    palette: ['#D7CCC8', '#BF360C', '#F5E6C8', '#1B5E20', '#0D47A1', '#FFB300'],
  },
  {
    id: 'c06.art.warli-frame', classes: [6, 10], subject: 'social_science', chapterKey: null, parentGate: false,
    title: { en: 'A Warli-style scene', hi: 'वारली शैली का दृश्य' },
    task: { en: 'Warli art, from Maharashtra, makes people from circles and triangles in white on an earth-red ground. Add more people, a tree and a home in that style.', hi: 'महाराष्ट्र की वारली कला में गोलों और त्रिभुजों से लोग बनाए जाते हैं, गेरुए रंग की ज़मीन पर सफ़ेद रंग से। उसी शैली में और लोग, एक पेड़ और एक घर बनाओ।' },
    labels: L(['Circle', 'Triangle'], ['गोला', 'त्रिभुज']),
    palette: ['#8D3B1F', '#A0522D', '#FFFFFF', '#5D2E17', '#D7B899'],
  },
  {
    id: 'c06.art.madhubani-border', classes: [6, 10], subject: 'social_science', chapterKey: null, parentGate: false,
    title: { en: 'A Madhubani-style border', hi: 'मधुबनी शैली की किनारी' },
    task: { en: 'Madhubani art, from the Mithila region of Bihar, fills shapes with double lines and bright colours. Fill the fish, the flowers and the border in that style.', hi: 'बिहार के मिथिला क्षेत्र की मधुबनी कला में आकारों को दोहरी रेखाओं और चटक रंगों से भरा जाता है। उसी शैली में मछलियाँ, फूल और किनारी भरो।' },
    labels: L(['Fish', 'Lotus', 'Border'], ['मछली', 'कमल', 'किनारी']),
    palette: ['#C62828', '#FDD835', '#1565C0', '#2E7D32', '#EF6C00', '#212121'],
  },
  {
    id: 'c06.art.gond-dots', classes: [6, 10], subject: 'social_science', chapterKey: null, parentGate: false,
    title: { en: 'A Gond-style tree', hi: 'गोंड शैली का पेड़' },
    task: { en: 'Gond art, from central India, fills shapes with dots, dashes and lines. One leaf is started: fill the others and the bird in your own patterns.', hi: 'मध्य भारत की गोंड कला में आकारों को बिंदुओं, छोटी रेखाओं और लकीरों से भरा जाता है। एक पत्ती शुरू की है: बाकी पत्तियाँ और चिड़िया अपने नमूनों से भरो।' },
    labels: L(['Dots', 'Dashes', 'Lines'], ['बिंदु', 'छोटी रेखाएँ', 'लकीरें']),
    palette: ['#E65100', '#2E7D32', '#1565C0', '#FDD835', '#AD1457', '#212121'],
  },
  {
    id: 'c06.social.compass-rose-legend', classes: [6, 8], subject: 'social_science', chapterKey: null, parentGate: false,
    title: { en: 'Compass rose and legend', hi: 'दिशा सूचक और संकेत सूची' },
    task: { en: 'Write N, E, S and W on the compass rose. In the legend, write what each map symbol means.', hi: 'दिशा सूचक पर उ, पू, द और प लिखो। संकेत सूची में लिखो कि नक्शे का हर चिह्न क्या बताता है।' },
    labels: L(['North', 'South', 'East', 'West', 'Legend', 'Mountain', 'River', 'House', 'Tree'], ['उत्तर', 'दक्षिण', 'पूर्व', 'पश्चिम', 'संकेत सूची', 'पहाड़', 'नदी', 'घर', 'पेड़']),
    palette: ['#1565C0', '#2E7D32', '#6D4C41', '#C62828', '#FDD835'],
  },
  {
    id: 'c10.science.circuit', classes: [10, 10], subject: 'science', chapterKey: 'cbse.c10.science.u4.ch01', parentGate: false,
    title: { en: 'Draw and label a circuit', hi: 'परिपथ बनाओ और नाम लिखो' },
    task: { en: 'Label the cell, the key, the bulb, the ammeter (in series) and the voltmeter (in parallel with the bulb). Draw an arrow for the direction of current.', hi: 'सेल, कुंजी, बल्ब, ऐमीटर (श्रेणी में) और वोल्टमीटर (बल्ब के समांतर) के नाम लिखो। धारा की दिशा के लिए एक तीर बनाओ।' },
    labels: L(['Cell', 'Key', 'Bulb', 'Ammeter', 'Voltmeter', 'Current'], ['सेल', 'कुंजी', 'बल्ब', 'ऐमीटर', 'वोल्टमीटर', 'धारा']),
    palette: ['#C62828', '#1565C0', '#FDD835', '#424242', '#2E7D32'],
  },
  {
    id: 'c09.science.plant-and-animal-cell', classes: [9, 9], subject: 'science', chapterKey: 'cbse.c9.science.u1.ch01', parentGate: false,
    title: { en: 'Plant cell and animal cell', hi: 'पादप कोशिका और जंतु कोशिका' },
    task: { en: 'Label both cells and write under each which one it is. Which parts does only the plant cell have?', hi: 'दोनों कोशिकाओं के भागों के नाम लिखो और नीचे लिखो कि कौन-सी कौन है। कौन-से भाग केवल पादप कोशिका में होते हैं?' },
    labels: L(['Cell wall', 'Cell membrane', 'Nucleus', 'Cytoplasm', 'Vacuole', 'Chloroplast', 'Mitochondrion'], ['कोशिका भित्ति', 'कोशिका झिल्ली', 'केंद्रक', 'कोशिकाद्रव्य', 'रिक्तिका', 'हरितलवक', 'सूत्रकणिका']),
    palette: ['#2E7D32', '#A5D6A7', '#F48FB1', '#7E57C2', '#FFCC80', '#4FC3F7'],
  },
];

// A template's subject may be taught under another name in a class (EVS until Class 5; Physics or Biology for ICSE
// Classes 9 and 10; History and Geography for Classes 11 and 12): the card shows it under whichever the class has.
const SUBJECT_ALIASES: Record<string, readonly string[]> = {
  science: ['science', 'evs', 'biology', 'physics'],
  evs: ['evs', 'science'],
  social_science: ['social_science', 'history', 'geography'],
  mathematics: ['mathematics'],
  english: ['english'],
};

const byId = new Map(DRAW_TEMPLATES.map((t) => [t.id, t]));
export const drawTemplate = (id: unknown): DrawTemplateEntry | null => (typeof id === 'string' && DRAW_TEMPLATE_ID.test(id) ? (byId.get(id) ?? null) : null);

export const fitsClass = (t: DrawTemplateEntry, classLevel: number) => classLevel >= t.classes[0] && classLevel <= t.classes[1];

// The subject this class studies the template under, or null when the class has none of its names.
export function subjectFor(t: DrawTemplateEntry, classSubjects: readonly string[]): string | null {
  return (SUBJECT_ALIASES[t.subject] ?? [t.subject]).find((s) => classSubjects.includes(s)) ?? null;
}

// The templates a child of this class sees, each with the subject its class studies it under, in the manifest's order.
export function templatesFor(classLevel: number, classSubjects: readonly string[]): { template: DrawTemplateEntry; subject: string }[] {
  const out: { template: DrawTemplateEntry; subject: string }[] = [];
  for (const t of DRAW_TEMPLATES) {
    if (!fitsClass(t, classLevel)) continue;
    const subject = subjectFor(t, classSubjects);
    if (subject) out.push({ template: t, subject });
  }
  return out;
}

// Grouped by subject, subjects in the class's own order.
export function groupBySubject(list: { template: DrawTemplateEntry; subject: string }[], classSubjects: readonly string[]): { subject: string; templates: DrawTemplateEntry[] }[] {
  const order = [...classSubjects];
  const groups = new Map<string, DrawTemplateEntry[]>();
  for (const x of list) groups.set(x.subject, [...(groups.get(x.subject) ?? []), x.template]);
  return [...groups].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([subject, templates]) => ({ subject, templates }));
}

// The one "Draw it" template for a lesson: the template whose chapter is this one, else (for a lesson with no template of
// its own) none. A subject-only match would show the same card on every chapter of the subject, so it is not used.
export function templateForChapter(keys: readonly (string | null | undefined)[], classLevel: number): DrawTemplateEntry | null {
  const wanted = keys.filter((k): k is string => !!k);
  return DRAW_TEMPLATES.find((t) => t.chapterKey !== null && wanted.includes(t.chapterKey) && fitsClass(t, classLevel)) ?? null;
}

// Locked until a parent allows drawing activities for the child.
export const isLocked = (t: DrawTemplateEntry, allowed: boolean) => t.parentGate && !allowed;

// The template in the shape the studio takes (the contract), in the child's language, with its outline's text.
export function toStudioTemplate(t: DrawTemplateEntry, lang: DrawLang, outlineSvg: string, subject: string, classLevel: number): DrawTemplate {
  return { id: t.id, title: t.title[lang], task: t.task[lang], outlineSvg, palette: t.palette, labels: t.labels[lang], subject, classLevel, chapterKey: t.chapterKey };
}

// ---- the tutor ----------------------------------------------------------------------------------------------------------
// When a template drawing is sent to the tutor, the phone puts this marker before the child's question; the server reads
// only the id from it and writes the tutor's instruction from this manifest (never from text the phone sent).
const MARKER = /^\[draw:([a-z0-9][a-z0-9.-]{2,79})\]\s*/;
export const drawMarker = (id: string) => `[draw:${id}] `;

export function readDrawMarker(text: string): { templateId: string | null; text: string } {
  const m = MARKER.exec(text);
  if (!m) return { templateId: null, text };
  return { templateId: drawTemplate(m[1]) ? m[1] : null, text: text.slice(m[0].length) };
}

export const NO_ART_JUDGEMENT =
  'Respond only to the ideas: what is shown, what is labelled, and what is missing, mixed up or in the wrong order in the subject. Never judge or mention neatness, colouring, drawing skill or how good the picture looks, and never compare the student with anyone. Praise the effort and the specific ideas the student got right, not talent.';

// The line the tutor is given for a template drawing (English: the system prompt's language).
export function drawTutorLine(id: string): string | null {
  const t = drawTemplate(id);
  if (!t) return null;
  const labels = t.labels.en.length ? ` The labels it expects: ${t.labels.en.join(', ')}.` : '';
  return `The student's drawing is on our template "${t.title.en}" (task: ${t.task.en}).${labels} ${NO_ART_JUDGEMENT}`;
}
