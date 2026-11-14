// Syllabus-linked drawing templates (C514): pure data and lookups, safe for the phone (no database, no message file).
// Each outline is original line art drawn for NetCyberAI (strokes only, one viewBox, no script, no external reference,
// no bitmap) and served as a static file at /draw/templates/<id>.svg, so the phone can keep it for offline use. The
// manifest below names its classes, subject, catalog chapter (a key in data/catalog/cbse-*.csv, or null when no chapter
// of the board's catalog is the template's own), words in English and Hindi, themed colours and whether a parent must
// allow it first. A completion is counted, never the drawing; nothing here scores art.

import type { DrawTemplate } from './draw-contract';

export type DrawLang = 'en' | 'hi';
export type DrawCategory = 'colour' | 'learn' | 'play' | 'art';
export const DRAW_CATEGORIES: readonly DrawCategory[] = ['colour', 'learn', 'play', 'art'];
export const DRAW_CATEGORY_LABEL: Record<DrawCategory, { en: string; hi: string }> = {
  colour: { en: 'Colour', hi: 'रंग भरो' },
  learn: { en: 'Learn', hi: 'सीखो' },
  play: { en: 'Play', hi: 'खेलो' },
  art: { en: 'Art', hi: 'कला' },
};
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
  // C517: guided steps for LKG to Class 4 (engagement mode), and a line of background context; both optional.
  steps?: readonly { en: string; hi: string; at?: { x: number; y: number } }[];
  context?: Words;
  // C517: an activity kind. Such a template shows under its kind (for every class in range), not under a school subject.
  cat?: DrawCategory;
};

// The Control switch the templates live under: the drawing board's (W16). The studio slice may give drawing its own
// module; then this one name changes.
export const DRAW_MODULE = 'draw';

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
  // ---- Art-integrated, Classes 9 and 10 (CBSE art-integrated learning) -----------------------------------------------------
  {
    id: 'c09.maths.jali-tile', classes: [9, 9], subject: 'mathematics', chapterKey: 'cbse.c9.mathematics.u4.ch04', parentGate: false,
    title: { en: 'A jali tile of quadrilaterals', hi: 'चतुर्भुजों की जाली टाइल' },
    task: { en: 'Join the midpoints of a rectangle to get a rhombus, then of the rhombus to get a rectangle. Name each shape, colour the tile like a jali, and name the two shapes below.', hi: 'आयत की भुजाओं के मध्य-बिंदु जोड़ने पर समचतुर्भुज बनता है, उसके मध्य-बिंदु जोड़ने पर फिर आयत। हर आकार का नाम लिखो, टाइल को जाली की तरह रंगो और नीचे के दो आकारों के नाम लिखो।' },
    labels: L(['Rectangle', 'Rhombus', 'Parallelogram', 'Trapezium'], ['आयत', 'समचतुर्भुज', 'समांतर चतुर्भुज', 'समलंब चतुर्भुज']),
    palette: ['#00897B', '#F9A825', '#8E24AA', '#E53935', '#3949AB'],
  },
  {
    id: 'c09.science.sound-wave', classes: [9, 9], subject: 'science', chapterKey: 'cbse.c9.science.u3.ch04', parentGate: false,
    title: { en: 'Draw and label a sound wave', hi: 'ध्वनि तरंग बनाओ और नाम लिखो' },
    task: { en: 'Colour the wave like a ribbon. Label a crest, a trough, the amplitude and the wavelength. What happens to the wave when the sound is louder?', hi: 'तरंग को रिबन की तरह रंगो। शिखर, गर्त, आयाम और तरंगदैर्ध्य के नाम लिखो। ध्वनि तेज़ होने पर तरंग का क्या होता है?' },
    labels: L(['Crest', 'Trough', 'Amplitude', 'Wavelength'], ['शिखर', 'गर्त', 'आयाम', 'तरंगदैर्ध्य']),
    palette: ['#1E88E5', '#00ACC1', '#FDD835', '#E53935', '#7E57C2'],
  },
  {
    id: 'c09.science.states-of-matter', classes: [9, 9], subject: 'science', chapterKey: 'cbse.c9.science.u2.ch01', parentGate: false,
    title: { en: 'Particles in solid, liquid and gas', hi: 'ठोस, द्रव और गैस के कण' },
    task: { en: 'Colour the particles of each box. Write the state under each one. Which box has the particles closest together, and which the farthest apart?', hi: 'हर डिब्बे के कणों में रंग भरो। हर एक के नीचे अवस्था का नाम लिखो। किसमें कण सबसे पास हैं और किसमें सबसे दूर?' },
    labels: L(['Solid', 'Liquid', 'Gas'], ['ठोस', 'द्रव', 'गैस']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'],
  },
  {
    id: 'c09.english.poem-storyboard', classes: [9, 10], subject: 'english', chapterKey: null, parentGate: false,
    title: { en: 'A poem or story in four pictures', hi: 'चार चित्रों में कविता या कहानी' },
    task: { en: 'Pick a poem or a story from your book. Draw its four main moments in order, and write one line under each picture.', hi: 'अपनी किताब की कोई कविता या कहानी चुनो। उसके चार मुख्य क्षण क्रम से बनाओ और हर चित्र के नीचे एक पंक्ति लिखो।' },
    labels: L(['Beginning', 'Problem', 'Turning point', 'Ending'], ['शुरुआत', 'समस्या', 'मोड़', 'अंत']),
    palette: ['#EF5350', '#FFCA28', '#26A69A', '#5C6BC0', '#8D6E63'],
  },
  {
    id: 'c10.maths.circle-rangoli', classes: [10, 10], subject: 'mathematics', chapterKey: 'cbse.c10.mathematics.u4.ch02', parentGate: false,
    title: { en: 'A circle rangoli with tangents', hi: 'स्पर्श रेखाओं वाली वृत्त रंगोली' },
    task: { en: 'Label the centre, a radius, the chord, the two tangents, the points of contact and the outside point. Measure the two tangents from the outside point. Colour it as a rangoli.', hi: 'केंद्र, त्रिज्या, जीवा, दोनों स्पर्श रेखाएँ, स्पर्श बिंदु और बाहर का बिंदु पहचानकर नाम लिखो। बाहर के बिंदु से दोनों स्पर्श रेखाओं की लंबाई नापो। इसे रंगोली की तरह रंगो।' },
    labels: L(['Centre', 'Radius', 'Chord', 'Tangent', 'Point of contact', 'External point'], ['केंद्र', 'त्रिज्या', 'जीवा', 'स्पर्श रेखा', 'स्पर्श बिंदु', 'बाहरी बिंदु']),
    palette: ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA'],
  },
  {
    id: 'c10.science.convex-lens', classes: [10, 10], subject: 'science', chapterKey: 'cbse.c10.science.u3', parentGate: false,
    title: { en: 'Ray diagram of a convex lens', hi: 'उत्तल लेंस का किरण आरेख' },
    task: { en: 'The object is at 2F. Finish the ray through the optical centre, find where the rays meet, and draw the image there. Is it real or virtual, and inverted or upright?', hi: 'वस्तु 2F पर है। प्रकाश केंद्र से जाने वाली किरण पूरी करो, देखो किरणें कहाँ मिलती हैं और वहाँ प्रतिबिंब बनाओ। वह वास्तविक है या आभासी, उलटा है या सीधा?' },
    labels: L(['Convex lens', 'Principal axis', 'Optical centre', 'Principal focus F', '2F', 'Object', 'Image'], ['उत्तल लेंस', 'मुख्य अक्ष', 'प्रकाश केंद्र', 'मुख्य फोकस F', '2F', 'वस्तु', 'प्रतिबिंब']),
    palette: ['#1565C0', '#E53935', '#FDD835', '#43A047', '#424242'],
  },
  {
    id: 'c10.science.human-eye', classes: [10, 10], subject: 'science', chapterKey: 'cbse.c10.science.u3', parentGate: false,
    title: { en: 'The human eye', hi: 'मानव नेत्र' },
    task: { en: 'Colour the eye and label its parts. Draw the path of light from the cornea to the retina with arrows. Where is the image formed?', hi: 'आँख में रंग भरो और उसके भागों के नाम लिखो। कॉर्निया से दृष्टिपटल तक प्रकाश का मार्ग तीरों से बनाओ। प्रतिबिंब कहाँ बनता है?' },
    labels: L(['Cornea', 'Iris', 'Pupil', 'Lens', 'Ciliary muscles', 'Retina', 'Optic nerve'], ['कॉर्निया', 'परितारिका', 'पुतली', 'नेत्र लेंस', 'पक्ष्माभी पेशियाँ', 'दृष्टिपटल', 'दृक् तंत्रिका']),
    palette: ['#6D4C41', '#1E88E5', '#212121', '#F48FB1', '#EF5350', '#FFCC80'],
  },
  {
    id: 'c10.social.resource-poster', classes: [10, 10], subject: 'social_science', chapterKey: 'cbse.c10.social_science.u2.ch01', parentGate: false,
    title: { en: 'A poster to save resources', hi: 'संसाधन बचाने का पोस्टर' },
    task: { en: 'Write a slogan in the banner. Draw three ways to save or reuse a resource in the circles and write a line under each.', hi: 'बैनर में एक नारा लिखो। तीनों गोलों में किसी संसाधन को बचाने या दोबारा काम में लाने के तीन तरीके बनाओ और हर एक के नीचे एक पंक्ति लिखो।' },
    labels: L(['Slogan', 'Save', 'Reuse', 'Replace'], ['नारा', 'बचाओ', 'दोबारा उपयोग', 'बदलो']),
    palette: ['#2E7D32', '#8BC34A', '#FFB300', '#1E88E5', '#E53935'],
  },
  // ---- C517: Colour, Learn, Play and Art activities (LKG to Class 12), grouped by kind, not by subject -----------------
  {
    id: 'c-1.colour.big-apple', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A big red apple', hi: 'एक बड़ा लाल सेब' },
    task: { en: 'Colour the apple red and its leaf green.', hi: 'सेब को लाल और उसकी पत्ती को हरा रंगो।' },
    labels: L([], []),
    palette: ['#E53935', '#43A047', '#8D6E63', '#FDD835', '#FB8C00'],
    steps: [{ en: 'Colour the apple red.', hi: 'सेब को लाल रंगो।' }, { en: 'Colour the leaf green.', hi: 'पत्ती को हरा रंगो।' }, { en: 'Colour the stem brown.', hi: 'डंठल को भूरा रंगो।' }],
    context: { en: 'A is for apple', hi: 'अ से अनार, A से apple' },
  },
  {
    id: 'c-1.colour.happy-sun', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'The happy sun', hi: 'खुश सूरज' },
    task: { en: 'Colour the sun yellow and its rays orange.', hi: 'सूरज को पीला और उसकी किरणों को नारंगी रंगो।' },
    labels: L([], []),
    palette: ['#FDD835', '#FB8C00', '#E53935', '#29B6F6', '#43A047'],
    steps: [{ en: 'Colour the round sun yellow.', hi: 'गोल सूरज को पीला रंगो।' }, { en: 'Colour every ray orange.', hi: 'हर किरण को नारंगी रंगो।' }, { en: 'Draw a blue sky around it.', hi: 'उसके चारों ओर नीला आसमान बनाओ।' }],
    context: { en: 'Good morning, sun!', hi: 'सुप्रभात, सूरज!' },
  },
  {
    id: 'c-1.colour.fish-bowl', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A fish in a bowl', hi: 'कटोरे में मछली' },
    task: { en: 'Colour the fish, the water and the plants.', hi: 'मछली, पानी और पौधों में रंग भरो।' },
    labels: L([], []),
    palette: ['#FB8C00', '#29B6F6', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Colour the fish orange.', hi: 'मछली को नारंगी रंगो।' }, { en: 'Colour the water light blue.', hi: 'पानी को हल्का नीला रंगो।' }, { en: 'Colour the plants green.', hi: 'पौधों को हरा रंगो।' }, { en: 'Draw one more fish.', hi: 'एक और मछली बनाओ।' }],
    context: { en: 'Swim, little fish!', hi: 'तैरो, नन्ही मछली!' },
  },
  {
    id: 'c-1.colour.balloon-bunch', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'Three balloons', hi: 'तीन गुब्बारे' },
    task: { en: 'Colour each balloon a different colour.', hi: 'हर गुब्बारे को अलग रंग से रंगो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#EC407A', '#8E24AA'],
    steps: [{ en: 'Colour the first balloon red.', hi: 'पहले गुब्बारे को लाल रंगो।' }, { en: 'Colour the middle balloon yellow.', hi: 'बीच वाले गुब्बारे को पीला रंगो।' }, { en: 'Colour the last balloon blue.', hi: 'आख़िरी गुब्बारे को नीला रंगो।' }],
    context: { en: 'One, two, three balloons', hi: 'एक, दो, तीन गुब्बारे' },
  },
  {
    id: 'c-1.colour.ice-cream', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'An ice cream cone', hi: 'आइसक्रीम कोन' },
    task: { en: 'Colour the scoops, the cone and the cherry.', hi: 'आइसक्रीम, कोन और चेरी में रंग भरो।' },
    labels: L([], []),
    palette: ['#F48FB1', '#FFF59D', '#A1887F', '#E53935', '#81C784'],
    steps: [{ en: 'Colour the top scoop pink.', hi: 'ऊपर वाली आइसक्रीम को गुलाबी रंगो।' }, { en: 'Colour the bottom scoop your favourite colour.', hi: 'नीचे वाली को अपने मनपसंद रंग से रंगो।' }, { en: 'Colour the cone brown.', hi: 'कोन को भूरा रंगो।' }, { en: 'Colour the cherry red.', hi: 'चेरी को लाल रंगो।' }],
    context: { en: 'Yummy!', hi: 'वाह, स्वादिष्ट!' },
  },
  {
    id: 'c00.colour.butterfly', classes: [0, 3], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A pretty butterfly', hi: 'सुंदर तितली' },
    task: { en: 'Colour both wings the same, like a mirror.', hi: 'दोनों पंख एक जैसे रंगो, जैसे शीशे में।' },
    labels: L([], []),
    palette: ['#8E24AA', '#EC407A', '#FDD835', '#29B6F6', '#43A047', '#FB8C00'],
    steps: [{ en: 'Colour the left top wing.', hi: 'बाईं ओर का ऊपर वाला पंख रंगो।' }, { en: 'Colour the right top wing the same.', hi: 'दाईं ओर का ऊपर वाला पंख भी वैसा ही रंगो।' }, { en: 'Colour the two small wings.', hi: 'दोनों छोटे पंख रंगो।' }, { en: 'Colour the spots.', hi: 'धब्बों में रंग भरो।' }],
    context: { en: 'Flutter, flutter!', hi: 'फुर्र, फुर्र!' },
  },
  {
    id: 'c00.colour.house-garden', classes: [0, 3], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'My house and garden', hi: 'मेरा घर और बगीचा' },
    task: { en: 'Colour the house, the tree, the flowers and the sun.', hi: 'घर, पेड़, फूल और सूरज में रंग भरो।' },
    labels: L([], []),
    palette: ['#E53935', '#FFCC80', '#43A047', '#8D6E63', '#FDD835', '#29B6F6'],
    steps: [{ en: 'Colour the roof red.', hi: 'छत को लाल रंगो।' }, { en: 'Colour the walls and the door.', hi: 'दीवारों और दरवाज़े में रंग भरो।' }, { en: 'Colour the tree and the flowers.', hi: 'पेड़ और फूलों में रंग भरो।' }, { en: 'Colour the sun yellow.', hi: 'सूरज को पीला रंगो।' }],
    context: { en: 'Home, sweet home', hi: 'मेरा प्यारा घर' },
  },
  {
    id: 'c00.colour.rainbow-clouds', classes: [0, 3], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A rainbow', hi: 'इंद्रधनुष' },
    task: { en: 'Colour the rainbow: red on the outside, then orange, yellow and green.', hi: 'इंद्रधनुष रंगो: सबसे बाहर लाल, फिर नारंगी, पीला और हरा।' },
    labels: L([], []),
    palette: ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA'],
    steps: [{ en: 'Colour the outside band red.', hi: 'सबसे बाहर की पट्टी लाल रंगो।' }, { en: 'Colour the next band orange.', hi: 'अगली पट्टी नारंगी रंगो।' }, { en: 'Colour the next band yellow.', hi: 'अगली पट्टी पीली रंगो।' }, { en: 'Colour the inside band green.', hi: 'सबसे अंदर की पट्टी हरी रंगो।' }],
    context: { en: 'After the rain', hi: 'बारिश के बाद' },
  },
  {
    id: 'c01.colour.elephant', classes: [1, 4], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A big elephant', hi: 'बड़ा हाथी' },
    task: { en: 'Colour the elephant grey and draw where it lives.', hi: 'हाथी को स्लेटी रंगो और बनाओ कि वह कहाँ रहता है।' },
    labels: L(['Trunk', 'Ear', 'Tail', 'Tusk'], ['सूँड़', 'कान', 'पूँछ', 'दाँत']),
    palette: ['#90A4AE', '#F48FB1', '#43A047', '#8D6E63', '#29B6F6'],
    steps: [{ en: 'Colour the elephant grey.', hi: 'हाथी को स्लेटी रंगो।' }, { en: 'Colour the inside of its ear pink.', hi: 'उसके कान के अंदर गुलाबी रंग भरो।' }, { en: 'Draw grass and trees around it.', hi: 'उसके चारों ओर घास और पेड़ बनाओ।' }],
    context: { en: 'The elephant has a long trunk', hi: 'हाथी की सूँड़ लंबी होती है' },
  },
  {
    id: 'c01.colour.train', classes: [1, 4], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'Choo-choo train', hi: 'छुक-छुक रेलगाड़ी' },
    task: { en: 'Colour the engine, the coach and the wheels.', hi: 'इंजन, डिब्बे और पहियों में रंग भरो।' },
    labels: L(['Engine', 'Coach', 'Wheel', 'Smoke'], ['इंजन', 'डिब्बा', 'पहिया', 'धुआँ']),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#424242', '#90A4AE'],
    steps: [{ en: 'Colour the engine red.', hi: 'इंजन को लाल रंगो।' }, { en: 'Colour the coach yellow.', hi: 'डिब्बे को पीला रंगो।' }, { en: 'Colour the wheels black.', hi: 'पहियों को काला रंगो।' }, { en: 'Colour the smoke grey.', hi: 'धुएँ को स्लेटी रंगो।' }],
    context: { en: 'Choo-choo!', hi: 'छुक-छुक!' },
  },
  {
    id: 'c01.colour.peacock', classes: [1, 4], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'The peacock', hi: 'मोर' },
    task: { en: 'Colour our national bird. Its feathers are blue and green.', hi: 'हमारे राष्ट्रीय पक्षी में रंग भरो। उसके पंख नीले और हरे होते हैं।' },
    labels: L(['Feathers', 'Crest', 'Beak'], ['पंख', 'कलगी', 'चोंच']),
    palette: ['#1565C0', '#00897B', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Colour the body blue.', hi: 'शरीर को नीला रंगो।' }, { en: 'Colour the feathers green.', hi: 'पंखों को हरा रंगो।' }, { en: 'Colour the eye spots blue and yellow.', hi: 'पंखों की आँखों को नीला और पीला रंगो।' }],
    context: { en: 'Our national bird', hi: 'हमारा राष्ट्रीय पक्षी' },
  },
  {
    id: 'c-1.learn.trace-lines', classes: [-1, 1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Trace the lines', hi: 'रेखाओं पर चलो' },
    task: { en: 'Start at each big dot and follow the dotted line to the end.', hi: 'हर बड़े बिंदु से शुरू करो और बिंदु वाली रेखा पर अंत तक चलो।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'],
    steps: [{ en: 'Trace the straight line.', hi: 'सीधी रेखा पर चलो।' }, { en: 'Trace the zigzag line.', hi: 'टेढ़ी-मेढ़ी रेखा पर चलो।' }, { en: 'Trace the wavy line.', hi: 'लहर वाली रेखा पर चलो।' }, { en: 'Trace the hills.', hi: 'पहाड़ों वाली रेखा पर चलो।' }],
    context: { en: 'Slow and steady', hi: 'धीरे-धीरे, आराम से' },
  },
  {
    id: 'c-1.learn.trace-shapes', classes: [-1, 1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Trace the shapes', hi: 'आकारों पर चलो' },
    task: { en: 'Trace each shape on its dots, then colour it.', hi: 'हर आकार के बिंदुओं पर चलो, फिर उसमें रंग भरो।' },
    labels: L(['Circle', 'Square', 'Triangle', 'Star'], ['गोला', 'वर्ग', 'त्रिभुज', 'तारा']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Trace the circle.', hi: 'गोले पर चलो।' }, { en: 'Trace the square.', hi: 'वर्ग पर चलो।' }, { en: 'Trace the triangle.', hi: 'त्रिभुज पर चलो।' }, { en: 'Trace the star.', hi: 'तारे पर चलो।' }],
    context: { en: 'Shapes all around', hi: 'चारों ओर आकार' },
  },
  {
    id: 'c00.learn.trace-numbers', classes: [0, 2], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Numbers 1 to 5', hi: '1 से 5 तक गिनती' },
    task: { en: 'Trace each number, then colour that many circles under it.', hi: 'हर संख्या पर चलो, फिर उसके नीचे उतने ही गोले रंगो।' },
    labels: L([], []),
    palette: ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5'],
    steps: [{ en: 'Trace 1 and colour one circle.', hi: '1 पर चलो और एक गोला रंगो।' }, { en: 'Trace 2 and colour two circles.', hi: '2 पर चलो और दो गोले रंगो।' }, { en: 'Trace 3 and colour three circles.', hi: '3 पर चलो और तीन गोले रंगो।' }, { en: 'Trace 4 and 5 and colour their circles.', hi: '4 और 5 पर चलो और उनके गोले रंगो।' }],
    context: { en: 'Count with me', hi: 'मेरे साथ गिनो' },
  },
  {
    id: 'c00.learn.trace-letters', classes: [0, 2], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'A, B, C', hi: 'अक्षर A, B, C' },
    task: { en: 'Trace A, B and C, then colour the apple, the ball and the cat.', hi: 'A, B और C पर चलो, फिर सेब, गेंद और बिल्ली में रंग भरो।' },
    labels: L(['Apple', 'Ball', 'Cat'], ['सेब', 'गेंद', 'बिल्ली']),
    palette: ['#E53935', '#1E88E5', '#FB8C00', '#43A047', '#8E24AA'],
    steps: [{ en: 'Trace A. A is for apple.', hi: 'A पर चलो। A से apple, यानी सेब।' }, { en: 'Trace B. B is for ball.', hi: 'B पर चलो। B से ball, यानी गेंद।' }, { en: 'Trace C. C is for cat.', hi: 'C पर चलो। C से cat, यानी बिल्ली।' }, { en: 'Colour the apple, the ball and the cat.', hi: 'सेब, गेंद और बिल्ली में रंग भरो।' }],
    context: { en: 'A B C', hi: 'A B C' },
  },
  {
    id: 'c01.learn.big-small', classes: [1, 2], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Big and small', hi: 'बड़ा और छोटा' },
    task: { en: 'Trace the big ball and the small ball. Then draw one big thing and one small thing.', hi: 'बड़ी और छोटी गेंद पर चलो। फिर एक बड़ी और एक छोटी चीज़ बनाओ।' },
    labels: L(['Big', 'Small'], ['बड़ा', 'छोटा']),
    palette: ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#8D6E63'],
    steps: [{ en: 'Trace the big ball.', hi: 'बड़ी गेंद पर चलो।' }, { en: 'Trace the small ball.', hi: 'छोटी गेंद पर चलो।' }, { en: 'Draw a big tree and a small flower.', hi: 'एक बड़ा पेड़ और एक छोटा फूल बनाओ।' }],
    context: { en: 'Big or small?', hi: 'बड़ा या छोटा?' },
  },
  {
    id: 'c01.learn.my-body', classes: [1, 3], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'My body', hi: 'मेरा शरीर' },
    task: { en: 'Draw the face and clothes, then label the parts of the body.', hi: 'चेहरा और कपड़े बनाओ, फिर शरीर के भागों के नाम लिखो।' },
    labels: L(['Head', 'Eyes', 'Nose', 'Mouth', 'Hands', 'Legs', 'Feet'], ['सिर', 'आँखें', 'नाक', 'मुँह', 'हाथ', 'पैर', 'पंजे']),
    palette: ['#FFCC80', '#8D6E63', '#E53935', '#1E88E5', '#43A047'],
    steps: [{ en: 'Draw the eyes, nose and mouth.', hi: 'आँखें, नाक और मुँह बनाओ।' }, { en: 'Draw your clothes.', hi: 'अपने कपड़े बनाओ।' }, { en: 'Put the word Head on the head.', hi: 'सिर पर Head शब्द रखो।' }, { en: 'Put Hands and Legs in their places.', hi: 'Hands और Legs सही जगह पर रखो।' }],
    context: { en: 'This is me!', hi: 'यह मैं हूँ!' },
  },
  {
    id: 'c02.learn.weather-chart', classes: [2, 4], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Weather chart', hi: 'मौसम चार्ट' },
    task: { en: 'Colour each kind of weather. Draw what you wear in it.', hi: 'हर तरह के मौसम में रंग भरो। उसमें तुम क्या पहनते हो, वह बनाओ।' },
    labels: L(['Sunny', 'Cloudy', 'Rainy', 'Windy'], ['धूप', 'बादल', 'बारिश', 'तेज़ हवा']),
    palette: ['#FDD835', '#90A4AE', '#29B6F6', '#43A047', '#FB8C00'],
    steps: [{ en: 'Colour the sunny box.', hi: 'धूप वाला डिब्बा रंगो।' }, { en: 'Colour the cloudy box.', hi: 'बादल वाला डिब्बा रंगो।' }, { en: 'Colour the rainy box.', hi: 'बारिश वाला डिब्बा रंगो।' }, { en: 'Colour the windy box.', hi: 'तेज़ हवा वाला डिब्बा रंगो।' }],
    context: { en: 'What is the weather today?', hi: 'आज मौसम कैसा है?' },
  },
  {
    id: 'c03.learn.land-water-air', classes: [3, 5], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Land, water and air', hi: 'ज़मीन, पानी और हवा' },
    task: { en: 'Draw one thing that moves in the sky, one on the road and one on the water.', hi: 'आसमान में, सड़क पर और पानी पर चलने वाली एक-एक चीज़ बनाओ।' },
    labels: L(['Air', 'Land', 'Water'], ['हवा', 'ज़मीन', 'पानी']),
    palette: ['#29B6F6', '#90A4AE', '#1565C0', '#E53935', '#FDD835'],
    steps: [{ en: 'Draw something that flies in the sky.', hi: 'आसमान में उड़ने वाली कोई चीज़ बनाओ।' }, { en: 'Draw something on the road.', hi: 'सड़क पर चलने वाली कोई चीज़ बनाओ।' }, { en: 'Draw something on the water.', hi: 'पानी पर चलने वाली कोई चीज़ बनाओ।' }],
    context: { en: 'How do we travel?', hi: 'हम कैसे सफ़र करते हैं?' },
  },
  {
    id: 'c00.art.draw-face', classes: [0, 3], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Draw a face', hi: 'चेहरा बनाओ' },
    task: { en: 'Draw the eyes, nose, mouth and hair. Make it happy, silly or surprised!', hi: 'आँखें, नाक, मुँह और बाल बनाओ। चेहरा खुश, मज़ेदार या हैरान बनाओ!' },
    labels: L([], []),
    palette: ['#FFCC80', '#8D6E63', '#212121', '#E53935', '#1E88E5', '#F48FB1'],
    steps: [{ en: 'Draw two eyes.', hi: 'दो आँखें बनाओ।' }, { en: 'Draw a nose.', hi: 'नाक बनाओ।' }, { en: 'Draw a big smile.', hi: 'बड़ी मुस्कान बनाओ।' }, { en: 'Draw the hair.', hi: 'बाल बनाओ।' }],
    context: { en: 'Who is this?', hi: 'यह कौन है?' },
  },
  {
    id: 'c01.art.dot-to-dot-star', classes: [1, 4], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Join the dots', hi: 'बिंदु मिलाओ' },
    task: { en: 'Join the dots to make a big star, then colour it.', hi: 'बिंदुओं को मिलाकर बड़ा तारा बनाओ, फिर उसमें रंग भरो।' },
    labels: L([], []),
    palette: ['#FDD835', '#FB8C00', '#1E88E5', '#8E24AA', '#E53935'],
    steps: [{ en: 'Start at the top dot and join to the next.', hi: 'सबसे ऊपर के बिंदु से शुरू करके अगले से मिलाओ।' }, { en: 'Keep joining all the way round.', hi: 'पूरा घूमते हुए मिलाते रहो।' }, { en: 'Colour your star.', hi: 'अपने तारे में रंग भरो।' }],
    context: { en: 'Twinkle, twinkle', hi: 'टिमटिम तारे' },
  },
  {
    id: 'c01.art.rangoli-grid', classes: [1, 5], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Dot rangoli', hi: 'बिंदु रंगोली' },
    task: { en: 'Join the dots around the dotted petals to make your own rangoli, then colour it.', hi: 'बिंदु वाली पंखुड़ियों के चारों ओर बिंदु मिलाकर अपनी रंगोली बनाओ, फिर रंग भरो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#43A047', '#1E88E5', '#EC407A', '#FB8C00'],
    steps: [{ en: 'Trace the dotted petals.', hi: 'बिंदु वाली पंखुड़ियों पर चलो।' }, { en: 'Join more dots to make a pattern.', hi: 'और बिंदु मिलाकर पैटर्न बनाओ।' }, { en: 'Colour your rangoli brightly.', hi: 'अपनी रंगोली को चटकीले रंगों से भरो।' }],
    context: { en: 'Happy festivals', hi: 'त्योहार मुबारक' },
  },
  {
    id: 'c02.art.diya', classes: [2, 5], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Decorate a diya', hi: 'दीया सजाओ' },
    task: { en: 'Colour the flame and decorate the diya with your own pattern.', hi: 'लौ में रंग भरो और दीये को अपने पैटर्न से सजाओ।' },
    labels: L([], []),
    palette: ['#FB8C00', '#FDD835', '#E53935', '#8D6E63', '#8E24AA'],
    steps: [{ en: 'Colour the flame yellow and orange.', hi: 'लौ को पीला और नारंगी रंगो।' }, { en: 'Colour the diya.', hi: 'दीये में रंग भरो।' }, { en: 'Add dots and lines to decorate it.', hi: 'सजाने के लिए बिंदु और रेखाएँ बनाओ।' }],
    context: { en: 'A light for Diwali', hi: 'दिवाली का दीया' },
  },
  {
    id: 'c02.art.kite-festival', classes: [2, 5], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Kite festival', hi: 'पतंग उत्सव' },
    task: { en: 'Decorate the two kites and draw a third one flying with them.', hi: 'दोनों पतंगों को सजाओ और उनके साथ उड़ती एक तीसरी पतंग बनाओ।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#FB8C00'],
    steps: [{ en: 'Colour the first kite.', hi: 'पहली पतंग में रंग भरो।' }, { en: 'Colour the second kite.', hi: 'दूसरी पतंग में रंग भरो।' }, { en: 'Draw one more kite in the sky.', hi: 'आसमान में एक और पतंग बनाओ।' }],
    context: { en: 'Makar Sankranti', hi: 'मकर संक्रांति' },
  },
  {
    id: 'c03.art.mandala', classes: [3, 8], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'A mandala', hi: 'मंडला' },
    task: { en: 'Colour the mandala ring by ring. Use the same colour all the way round each ring.', hi: 'मंडला को घेरा-दर-घेरा रंगो। हर घेरे में पूरा एक ही रंग भरो।' },
    labels: L([], []),
    palette: ['#8E24AA', '#1E88E5', '#00897B', '#FDD835', '#FB8C00', '#E53935'],
    steps: [{ en: 'Colour the centre.', hi: 'बीच वाले हिस्से में रंग भरो।' }, { en: 'Colour the petals.', hi: 'पंखुड़ियों में रंग भरो।' }, { en: 'Colour the outer ring.', hi: 'बाहरी घेरे में रंग भरो।' }],
    context: { en: 'Round and round', hi: 'गोल-गोल' },
  },
  {
    id: 'c04.art.underwater-scene', classes: [4, 7], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Under the sea', hi: 'समुद्र के नीचे' },
    task: { en: 'Colour the sea and add more sea animals: a crab, a turtle or an octopus.', hi: 'समुद्र में रंग भरो और और समुद्री जीव जोड़ो: केकड़ा, कछुआ या ऑक्टोपस।' },
    labels: L([], []),
    palette: ['#1565C0', '#29B6F6', '#FB8C00', '#43A047', '#F48FB1', '#FDD835'],
    steps: [{ en: 'Colour the two fish.', hi: 'दोनों मछलियों में रंग भरो।' }, { en: 'Colour the seaweed and the coral.', hi: 'समुद्री घास और मूँगे में रंग भरो।' }, { en: 'Draw one more sea animal.', hi: 'एक और समुद्री जीव बनाओ।' }],
    context: { en: 'Deep blue sea', hi: 'गहरा नीला समुद्र' },
  },
  {
    id: 'c-1.play.maze-bunny', classes: [-1, 2], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Help the bunny', hi: 'खरगोश की मदद करो' },
    task: { en: 'Draw a line from the bunny to the carrot without touching the walls.', hi: 'दीवारों को छुए बिना खरगोश से गाजर तक रेखा बनाओ।' },
    labels: L([], []),
    palette: ['#E53935', '#43A047', '#FB8C00', '#1E88E5', '#8E24AA'],
    steps: [{ en: 'Put your finger on the bunny.', hi: 'अपनी उँगली खरगोश पर रखो।' }, { en: 'Draw a line along the paths to the carrot.', hi: 'रास्तों पर चलते हुए गाजर तक रेखा बनाओ।' }, { en: 'Colour the carrot orange.', hi: 'गाजर को नारंगी रंगो।' }],
    context: { en: 'Hop, hop, hop!', hi: 'फुदक, फुदक!' },
  },
  {
    id: 'c00.play.match-pairs', classes: [0, 2], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Match the shapes', hi: 'आकार मिलाओ' },
    task: { en: 'Draw a line from each shape to the same shape on the other side.', hi: 'हर आकार से दूसरी ओर के उसी आकार तक रेखा बनाओ।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Join the circle to the circle.', hi: 'गोले को गोले से मिलाओ।' }, { en: 'Join the square to the square.', hi: 'वर्ग को वर्ग से मिलाओ।' }, { en: 'Join the triangle and the star.', hi: 'त्रिभुज और तारे को मिलाओ।' }],
    context: { en: 'Find the twin', hi: 'जुड़वाँ ढूँढो' },
  },
  {
    id: 'c01.play.maze-bigger', classes: [1, 4], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'The long maze', hi: 'लंबी भूलभुलैया' },
    task: { en: 'Start at the star and find the way to the flag.', hi: 'तारे से शुरू करो और झंडे तक का रास्ता ढूँढो।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Start at the star.', hi: 'तारे से शुरू करो।' }, { en: 'Go down and up through the gaps.', hi: 'खुली जगहों से नीचे-ऊपर जाओ।' }, { en: 'Reach the flag!', hi: 'झंडे तक पहुँचो!' }],
    context: { en: 'Which way?', hi: 'किधर जाएँ?' },
  },
  {
    id: 'c02.play.tic-tac-toe', classes: [2, 6], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Noughts and crosses', hi: 'काटा-गोला' },
    task: { en: 'Play with someone at home: one draws X, the other draws O. Three in a row wins!', hi: 'घर पर किसी के साथ खेलो: एक X बनाए, दूसरा O। एक लाइन में तीन बनाने वाला जीतता है!' },
    labels: L(['X', 'O'], ['X', 'O']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#424242'],
    steps: [{ en: 'Pick X or O.', hi: 'X या O चुनो।' }, { en: 'Take turns to draw in the boxes.', hi: 'बारी-बारी से खानों में बनाओ।' }, { en: 'Play all four games!', hi: 'चारों खेल खेलो!' }],
    context: { en: 'Your turn!', hi: 'तुम्हारी बारी!' },
  },
  {
    id: 'c03.play.design-tshirt', classes: [3, 8], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Design a T-shirt', hi: 'टी-शर्ट डिज़ाइन करो' },
    task: { en: 'Colour the T-shirt and draw your own design in the dotted box.', hi: 'टी-शर्ट में रंग भरो और बिंदु वाले डिब्बे में अपना डिज़ाइन बनाओ।' },
    labels: L([], []),
    palette: ['#1E88E5', '#E53935', '#FDD835', '#43A047', '#212121', '#EC407A'],
    steps: [{ en: 'Colour the T-shirt.', hi: 'टी-शर्ट में रंग भरो।' }, { en: 'Draw a picture in the box.', hi: 'डिब्बे में एक चित्र बनाओ।' }, { en: 'Add stickers if you like.', hi: 'चाहो तो स्टिकर लगाओ।' }],
    context: { en: 'My style', hi: 'मेरा अंदाज़' },
  },
  {
    id: 'c03.play.comic-strip', classes: [3, 8], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Make a comic', hi: 'कॉमिक बनाओ' },
    task: { en: 'Tell a short story in three pictures. Write what the characters say in the bubbles.', hi: 'तीन चित्रों में एक छोटी कहानी बताओ। बुलबुलों में लिखो कि पात्र क्या कहते हैं।' },
    labels: L([], []),
    palette: ['#FDD835', '#E53935', '#1E88E5', '#43A047', '#FFCC80', '#424242'],
    steps: [{ en: 'Draw the start of your story.', hi: 'अपनी कहानी की शुरुआत बनाओ।' }, { en: 'Draw what happens next.', hi: 'आगे क्या हुआ, वह बनाओ।' }, { en: 'Draw the ending.', hi: 'कहानी का अंत बनाओ।' }, { en: 'Write words in the bubbles.', hi: 'बुलबुलों में शब्द लिखो।' }],
    context: { en: 'Once upon a time', hi: 'एक बार की बात है' },
  },
  {
    id: 'c04.play.design-robot', classes: [4, 8], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Design a robot', hi: 'रोबोट डिज़ाइन करो' },
    task: { en: 'Give your robot buttons, lights and a job. What does it help with?', hi: 'अपने रोबोट को बटन, बत्तियाँ और एक काम दो। वह किस काम में मदद करता है?' },
    labels: L([], []),
    palette: ['#90A4AE', '#1E88E5', '#E53935', '#FDD835', '#43A047', '#424242'],
    steps: [{ en: 'Colour the robot.', hi: 'रोबोट में रंग भरो।' }, { en: 'Draw buttons in the dotted box.', hi: 'बिंदु वाले डिब्बे में बटन बनाओ।' }, { en: 'Give it a name.', hi: 'उसे एक नाम दो।' }],
    context: { en: 'Beep boop!', hi: 'बीप-बूप!' },
  },
  {
    id: 'c06.art.perspective-street', classes: [6, 10], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'One-point perspective street', hi: 'एक-बिंदु परिप्रेक्ष्य वाली सड़क' },
    task: { en: 'Use the dotted guides to the vanishing point to draw buildings on both sides of the street.', hi: 'विलोप बिंदु तक जाती बिंदु-रेखाओं की मदद से सड़क के दोनों ओर इमारतें बनाओ।' },
    labels: L(['Horizon line', 'Vanishing point'], ['क्षितिज रेखा', 'विलोप बिंदु']),
    palette: ['#90A4AE', '#8D6E63', '#29B6F6', '#FDD835', '#424242'],

  },
  {
    id: 'c06.art.portrait-proportions', classes: [6, 12], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Draw a face in proportion', hi: 'अनुपात में चेहरा बनाओ' },
    task: { en: 'The eyes sit on the middle line, the nose on the next and the mouth below. Draw a face using the guides.', hi: 'आँखें बीच की रेखा पर, नाक अगली पर और मुँह उसके नीचे आता है। रेखाओं की मदद से चेहरा बनाओ।' },
    labels: L(['Eyes', 'Nose', 'Mouth', 'Hairline'], ['आँखें', 'नाक', 'मुँह', 'बालों की रेखा']),
    palette: ['#FFCC80', '#8D6E63', '#E57373', '#212121', '#5D4037'],

  },
  {
    id: 'c07.art.zentangle', classes: [7, 12], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Zentangle patterns', hi: 'ज़ेनटैंगल पैटर्न' },
    task: { en: 'Fill each section with a different repeating pattern: lines, dots, circles, waves.', hi: 'हर हिस्से में अलग दोहराता पैटर्न भरो: रेखाएँ, बिंदु, गोले, लहरें।' },
    labels: L([], []),
    palette: ['#212121', '#5C6BC0', '#00897B', '#E53935', '#FDD835'],

  },
  {
    id: 'c06.art.cartoon-construction', classes: [6, 10], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Draw a cartoon character', hi: 'कार्टून पात्र बनाओ' },
    task: { en: 'Build your character on the circles and guide lines, then add a face, clothes and colour.', hi: 'गोलों और रेखाओं पर अपना पात्र बनाओ, फिर चेहरा, कपड़े और रंग जोड़ो।' },
    labels: L([], []),
    palette: ['#FFCC80', '#1E88E5', '#E53935', '#FDD835', '#43A047', '#424242'],

  },
  {
    id: 'c06.play.comic-six', classes: [6, 12], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Six-panel comic', hi: 'छह खानों का कॉमिक' },
    task: { en: 'Plan a story with a beginning, a problem and an ending across six panels.', hi: 'छह खानों में शुरुआत, समस्या और अंत वाली कहानी बनाओ।' },
    labels: L([], []),
    palette: ['#FDD835', '#E53935', '#1E88E5', '#43A047', '#FFCC80', '#424242'],

  },
  {
    id: 'c06.play.board-game', classes: [6, 10], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Design a board game', hi: 'बोर्ड गेम डिज़ाइन करो' },
    task: { en: 'Number the squares, add more ladders and snakes, and write the rules of your game.', hi: 'खानों पर नंबर लिखो, और सीढ़ियाँ और साँप जोड़ो, और अपने खेल के नियम लिखो।' },
    labels: L(['Start', 'Finish'], ['शुरू', 'अंत']),
    palette: ['#E53935', '#43A047', '#FDD835', '#1E88E5', '#8D6E63', '#8E24AA'],

  },
  {
    id: 'c08.play.event-poster', classes: [8, 12], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Make an event poster', hi: 'कार्यक्रम का पोस्टर बनाओ' },
    task: { en: 'Plan a poster for a school event: a big title, a picture in the dotted box, and the date, time and place.', hi: 'स्कूल के किसी कार्यक्रम का पोस्टर बनाओ: बड़ा शीर्षक, बिंदु वाले डिब्बे में चित्र, और तारीख़, समय और जगह।' },
    labels: L(['Title', 'Date', 'Time', 'Place'], ['शीर्षक', 'तारीख़', 'समय', 'जगह']),
    palette: ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#212121'],

  },
  {
    id: 'c09.play.app-screen', classes: [9, 12], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Design an app screen', hi: 'ऐप की स्क्रीन डिज़ाइन करो' },
    task: { en: 'Design one screen of an app that helps your class. Name it, draw its buttons and say what each one does.', hi: 'अपनी कक्षा की मदद करने वाले ऐप की एक स्क्रीन बनाओ। उसका नाम लिखो, बटन बनाओ और बताओ कि हर बटन क्या करता है।' },
    labels: L([], []),
    palette: ['#1E88E5', '#00897B', '#FDD835', '#E53935', '#424242'],

  },
  {
    id: 'c11.art.still-life', classes: [11, 12], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Still life: light and shade', hi: 'स्थिर चित्र: प्रकाश और छाया' },
    task: { en: 'Pick where the light comes from. Shade each solid darker on the side away from the light and draw its shadow.', hi: 'तय करो कि रोशनी कहाँ से आ रही है। हर ठोस को रोशनी से दूर वाली तरफ़ गहरा करो और उसकी छाया बनाओ।' },
    labels: L(['Light', 'Shadow'], ['प्रकाश', 'छाया']),
    palette: ['#424242', '#757575', '#BDBDBD', '#8D6E63', '#FFCC80'],

  },
  {
    id: 'c06.learn.pixel-art', classes: [6, 12], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Pixel art', hi: 'पिक्सेल आर्ट' },
    task: { en: 'Colour whole squares to make a picture: a heart, a face or a game character.', hi: 'पूरे खाने रंगकर एक चित्र बनाओ: दिल, चेहरा या किसी खेल का पात्र।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#43A047', '#1E88E5', '#212121', '#FFCC80'],

  },
  {
    id: 'c07.learn.mind-map', classes: [7, 12], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Mind map', hi: 'माइंड मैप' },
    task: { en: 'Write a chapter or topic in the middle and six ideas around it. Add pictures to remember them.', hi: 'बीच में कोई अध्याय या विषय लिखो और उसके चारों ओर छह बातें। याद रखने के लिए चित्र जोड़ो।' },
    labels: L([], []),
    palette: ['#1E88E5', '#00897B', '#FDD835', '#E53935', '#8E24AA', '#FB8C00'],

  },
  {
    id: 'c11.learn.flowchart', classes: [11, 12], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Draw a flowchart', hi: 'फ़्लोचार्ट बनाओ' },
    task: { en: 'Write the steps of a process in the boxes: start, a step, a yes/no question, two results and the end.', hi: 'किसी प्रक्रिया के चरण डिब्बों में लिखो: शुरू, एक चरण, हाँ/ना वाला प्रश्न, दो परिणाम और अंत।' },
    labels: L(['Start', 'Yes', 'No', 'End'], ['शुरू', 'हाँ', 'ना', 'अंत']),
    palette: ['#1E88E5', '#43A047', '#E53935', '#FDD835', '#424242'],

  },
  // ---- C517 (second pass): Nursery from scratch, more for LKG, Class 4 grown, Class 5's own ---------------------------
  // Nursery (-2): big shapes, one or two things to do, no reading needed.
  {
    id: 'c-2.colour.red-ball', classes: [-2, -1], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A big ball', hi: 'एक बड़ी गेंद' },
    task: { en: 'Colour the ball red.', hi: 'गेंद को लाल रंगो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#FB8C00'],
    steps: [{ en: 'Colour the ball red.', hi: 'गेंद को लाल रंगो।' }, { en: 'Colour the stripes yellow and blue.', hi: 'धारियों को पीला और नीला रंगो।' }],
    context: { en: 'Bounce, bounce!', hi: 'उछल, उछल!' },
  },
  {
    id: 'c-2.colour.yellow-banana', classes: [-2, -1], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A yellow banana', hi: 'एक पीला केला' },
    task: { en: 'Colour the banana yellow.', hi: 'केले को पीला रंगो।' },
    labels: L([], []),
    palette: ['#FDD835', '#8D6E63', '#43A047', '#FB8C00', '#E53935'],
    steps: [{ en: 'Colour the banana yellow.', hi: 'केले को पीला रंगो।' }, { en: 'Colour the top of the banana brown.', hi: 'केले के ऊपरी सिरे को भूरा रंगो।' }],
    context: { en: 'B is for banana', hi: 'क से केला' },
  },
  {
    id: 'c-2.colour.big-flower', classes: [-2, -1], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A big flower', hi: 'एक बड़ा फूल' },
    task: { en: 'Colour the petals pink and the middle yellow.', hi: 'पंखुड़ियों को गुलाबी और बीच को पीला रंगो।' },
    labels: L([], []),
    palette: ['#F06292', '#FDD835', '#43A047', '#8E24AA', '#FB8C00'],
    steps: [{ en: 'Colour the petals pink.', hi: 'पंखुड़ियों को गुलाबी रंगो।' }, { en: 'Colour the middle yellow.', hi: 'बीच को पीला रंगो।' }, { en: 'Colour the stem and leaves green.', hi: 'डंडी और पत्तियों को हरा रंगो।' }],
    context: { en: 'Smell the flower', hi: 'फूल सूँघो' },
  },
  {
    id: 'c-2.colour.blue-fish', classes: [-2, -1], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A blue fish', hi: 'एक नीली मछली' },
    task: { en: 'Colour the fish blue and its tail orange.', hi: 'मछली को नीला और उसकी पूँछ को नारंगी रंगो।' },
    labels: L([], []),
    palette: ['#1E88E5', '#FB8C00', '#FDD835', '#29B6F6', '#43A047'],
    steps: [{ en: 'Colour the fish blue.', hi: 'मछली को नीला रंगो।' }, { en: 'Colour the tail orange.', hi: 'पूँछ को नारंगी रंगो।' }, { en: 'Colour the eye yellow.', hi: 'आँख को पीला रंगो।' }],
    context: { en: 'Swim, swim, swim', hi: 'तैर, तैर, तैर' },
  },
  {
    id: 'c-2.learn.trace-big-shapes', classes: [-2, -1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Trace big shapes', hi: 'बड़ी आकृतियों पर चलो' },
    task: { en: 'Put your finger on the dots and trace the circle, the plus, the wave and the line.', hi: 'बिंदुओं पर उँगली रखकर गोले, जोड़ के निशान, लहर और सीधी रेखा पर चलो।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Trace the big circle.', hi: 'बड़े गोले पर चलो।' }, { en: 'Trace the plus.', hi: 'जोड़ के निशान पर चलो।' }, { en: 'Trace the wave.', hi: 'लहर पर चलो।' }, { en: 'Trace the straight line.', hi: 'सीधी रेखा पर चलो।' }],
    context: { en: 'Round and round', hi: 'गोल-गोल' },
  },
  {
    id: 'c-2.learn.count-to-three', classes: [-2, -1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Count to three', hi: 'तीन तक गिनो' },
    task: { en: 'Count the apples in each row and write the number in the box.', hi: 'हर पंक्ति के सेब गिनो और डिब्बे में संख्या लिखो।' },
    labels: L(['One', 'Two', 'Three'], ['एक', 'दो', 'तीन']),
    palette: ['#E53935', '#43A047', '#FDD835', '#8D6E63', '#1E88E5'],
    steps: [{ en: 'Count the one apple. Write 1.', hi: 'एक सेब गिनो। 1 लिखो।' }, { en: 'Count the two apples. Write 2.', hi: 'दो सेब गिनो। 2 लिखो।' }, { en: 'Count the three apples. Write 3.', hi: 'तीन सेब गिनो। 3 लिखो।' }, { en: 'Colour the apples red.', hi: 'सेबों को लाल रंगो।' }],
    context: { en: '1, 2, 3!', hi: '1, 2, 3!' },
  },
  {
    id: 'c-2.learn.traffic-light', classes: [-2, -1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'The traffic light', hi: 'ट्रैफ़िक की बत्ती' },
    task: { en: 'Colour the top light red, the middle light yellow and the bottom light green.', hi: 'ऊपर की बत्ती को लाल, बीच की को पीला और नीचे की को हरा रंगो।' },
    labels: L(['Stop', 'Get ready', 'Go'], ['रुको', 'तैयार हो जाओ', 'चलो']),
    palette: ['#E53935', '#FDD835', '#43A047', '#424242', '#90A4AE'],
    steps: [{ en: 'Colour the top light red. Red means stop.', hi: 'ऊपर की बत्ती को लाल रंगो। लाल का मतलब रुको।' }, { en: 'Colour the middle light yellow.', hi: 'बीच की बत्ती को पीला रंगो।' }, { en: 'Colour the bottom light green. Green means go.', hi: 'नीचे की बत्ती को हरा रंगो। हरे का मतलब चलो।' }],
    context: { en: 'Red means stop', hi: 'लाल का मतलब रुको' },
  },
  {
    id: 'c-2.play.snail-path', classes: [-2, 0], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Help the snail', hi: 'घोंघे की मदद करो' },
    task: { en: 'Draw a line along the path from the snail to the leaf.', hi: 'रास्ते पर घोंघे से पत्ते तक रेखा बनाओ।' },
    labels: L([], []),
    palette: ['#43A047', '#E53935', '#FB8C00', '#1E88E5', '#8E24AA'],
    steps: [{ en: 'Put your finger on the snail.', hi: 'अपनी उँगली घोंघे पर रखो।' }, { en: 'Draw slowly along the path.', hi: 'रास्ते पर धीरे-धीरे रेखा बनाओ।' }, { en: 'Colour the leaf green.', hi: 'पत्ते को हरा रंगो।' }],
    context: { en: 'Slow and steady', hi: 'धीरे-धीरे' },
  },
  {
    id: 'c-2.play.pop-balloons', classes: [-2, 0], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Pop the balloons', hi: 'गुब्बारे फोड़ो' },
    task: { en: 'Make a dot on every balloon, then colour each one a different colour.', hi: 'हर गुब्बारे पर एक बिंदु बनाओ, फिर हर एक में अलग रंग भरो।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#8E24AA', '#FB8C00'],
    steps: [{ en: 'Make a dot on each balloon.', hi: 'हर गुब्बारे पर एक बिंदु बनाओ।' }, { en: 'Colour every balloon.', hi: 'हर गुब्बारे में रंग भरो।' }],
    context: { en: 'Pop, pop, pop!', hi: 'फट, फट, फट!' },
  },
  {
    id: 'c-2.art.dab-tree', classes: [-2, 0], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Dab the tree', hi: 'पेड़ पर छापे लगाओ' },
    task: { en: 'Colour the trunk brown. Dab green dots with your finger all over the leaves.', hi: 'तने को भूरा रंगो। पत्तों पर उँगली से हरे बिंदु लगाओ।' },
    labels: L([], []),
    palette: ['#8D6E63', '#43A047', '#81C784', '#F06292', '#FDD835'],
    steps: [{ en: 'Colour the trunk brown.', hi: 'तने को भूरा रंगो।' }, { en: 'Dab green dots on the leaves.', hi: 'पत्तों पर हरे बिंदु लगाओ।' }, { en: 'Dab a few pink flowers.', hi: 'कुछ गुलाबी फूल लगाओ।' }],
    context: { en: 'A tree for the birds', hi: 'चिड़ियों के लिए एक पेड़' },
  },
  {
    id: 'c-2.art.draw-rain', classes: [-2, 0], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Rain, rain', hi: 'झम-झम बारिश' },
    task: { en: 'Colour the cloud grey. Trace each line to make the rain fall.', hi: 'बादल को स्लेटी रंगो। हर रेखा पर चलकर बारिश बनाओ।' },
    labels: L([], []),
    palette: ['#90A4AE', '#29B6F6', '#1E88E5', '#FDD835', '#43A047'],
    steps: [{ en: 'Colour the cloud grey.', hi: 'बादल को स्लेटी रंगो।' }, { en: 'Trace the rain lines.', hi: 'बारिश की रेखाओं पर चलो।' }, { en: 'Colour the puddle blue.', hi: 'पोखर को नीला रंगो।' }],
    context: { en: 'Pitter patter', hi: 'टप-टप' },
  },
  // LKG (-1): more of each kind.
  {
    id: 'c-1.colour.umbrella', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A rainy-day umbrella', hi: 'बारिश की छतरी' },
    task: { en: 'Colour each part of the umbrella a different colour.', hi: 'छतरी के हर हिस्से में अलग रंग भरो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#8E24AA', '#8D6E63'],
    steps: [{ en: 'Colour the top of the umbrella red.', hi: 'छतरी के ऊपरी हिस्से को लाल रंगो।' }, { en: 'Colour the bottom edge yellow.', hi: 'नीचे के किनारे को पीला रंगो।' }, { en: 'Colour the handle brown.', hi: 'हत्थे को भूरा रंगो।' }],
    context: { en: 'Open the umbrella', hi: 'छतरी खोलो' },
  },
  {
    id: 'c-1.colour.kitten', classes: [-1, 2], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A little kitten', hi: 'एक नन्ही बिल्ली' },
    task: { en: 'Colour the kitten and give it a pink nose.', hi: 'बिल्ली में रंग भरो और उसकी नाक गुलाबी बनाओ।' },
    labels: L([], []),
    palette: ['#FB8C00', '#8D6E63', '#F48FB1', '#212121', '#FDD835'],
    steps: [{ en: 'Colour the face orange.', hi: 'चेहरे को नारंगी रंगो।' }, { en: 'Colour the nose pink.', hi: 'नाक को गुलाबी रंगो।' }, { en: 'Colour the two eyes.', hi: 'दोनों आँखों में रंग भरो।' }],
    context: { en: 'Meow, meow!', hi: 'म्याऊँ, म्याऊँ!' },
  },
  {
    id: 'c-1.learn.trace-123', classes: [-1, 1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Trace 1, 2, 3', hi: '1, 2, 3 पर चलो' },
    task: { en: 'Trace the numbers 1, 2 and 3 with your finger.', hi: 'अपनी उँगली से 1, 2 और 3 पर चलो।' },
    labels: L(['One', 'Two', 'Three'], ['एक', 'दो', 'तीन']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Trace 1. One nose.', hi: '1 पर चलो। एक नाक।' }, { en: 'Trace 2. Two eyes.', hi: '2 पर चलो। दो आँखें।' }, { en: 'Trace 3. Three stars.', hi: '3 पर चलो। तीन तारे।' }],
    context: { en: '1, 2, 3', hi: '1, 2, 3' },
  },
  {
    id: 'c-1.learn.count-to-five', classes: [-1, 1], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Count to five', hi: 'पाँच तक गिनो' },
    task: { en: 'Count the balls in each box and write the number in the dotted box.', hi: 'हर डिब्बे में गेंदें गिनो और बिंदु वाले डिब्बे में संख्या लिखो।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#FB8C00'],
    steps: [{ en: 'Count the balls in the first box. Write the number.', hi: 'पहले डिब्बे की गेंदें गिनो। संख्या लिखो।' }, { en: 'Count the balls in the second box. Write the number.', hi: 'दूसरे डिब्बे की गेंदें गिनो। संख्या लिखो।' }, { en: 'Count the balls in the third box. Write the number.', hi: 'तीसरे डिब्बे की गेंदें गिनो। संख्या लिखो।' }],
    context: { en: 'Count with me', hi: 'मेरे साथ गिनो' },
  },
  {
    id: 'c-1.play.maze-fish', classes: [-1, 2], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Help the fish', hi: 'मछली की मदद करो' },
    task: { en: 'Draw a line from the fish to the bowl without touching the walls.', hi: 'दीवारों को छुए बिना मछली से कटोरे तक रेखा बनाओ।' },
    labels: L([], []),
    palette: ['#FB8C00', '#1E88E5', '#43A047', '#E53935', '#8E24AA'],
    steps: [{ en: 'Put your finger on the fish.', hi: 'अपनी उँगली मछली पर रखो।' }, { en: 'Follow the gaps: down, up, down, up, down.', hi: 'खुली जगहों से जाओ: नीचे, ऊपर, नीचे, ऊपर, नीचे।' }, { en: 'Reach the bowl!', hi: 'कटोरे तक पहुँचो!' }],
    context: { en: 'Swim home', hi: 'तैरकर घर चलो' },
  },
  {
    id: 'c-1.play.odd-one-out', classes: [-1, 2], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Find the odd one', hi: 'अलग वाला ढूँढो' },
    task: { en: 'In each row, draw a ring around the shape that is different.', hi: 'हर पंक्ति में जो आकार अलग है, उसके चारों ओर गोला बनाओ।' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Look at the first row. Ring the square.', hi: 'पहली पंक्ति देखो। वर्ग के चारों ओर गोला बनाओ।' }, { en: 'Look at the second row. Ring the triangle.', hi: 'दूसरी पंक्ति देखो। त्रिभुज के चारों ओर गोला बनाओ।' }, { en: 'Look at the third row. Ring the circle.', hi: 'तीसरी पंक्ति देखो। गोले के चारों ओर गोला बनाओ।' }],
    context: { en: 'Which one is different?', hi: 'कौन सा अलग है?' },
  },
  {
    id: 'c-1.art.dab-flower', classes: [-1, 2], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Dab a flower', hi: 'फूल पर छापे लगाओ' },
    task: { en: 'Dab a colour with your finger in every petal. Colour the middle yellow.', hi: 'हर पंखुड़ी में उँगली से रंग लगाओ। बीच को पीला रंगो।' },
    labels: L([], []),
    palette: ['#F06292', '#E53935', '#FDD835', '#43A047', '#8E24AA', '#FB8C00'],
    steps: [{ en: 'Dab a colour in the top petal.', hi: 'ऊपर की पंखुड़ी में रंग लगाओ।' }, { en: 'Dab a different colour in each of the other petals.', hi: 'बाकी हर पंखुड़ी में अलग रंग लगाओ।' }, { en: 'Colour the middle yellow.', hi: 'बीच को पीला रंगो।' }],
    context: { en: 'A flower for you', hi: 'तुम्हारे लिए एक फूल' },
  },
  {
    id: 'c-1.art.shape-house', classes: [-1, 2], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Shapes make a house', hi: 'आकारों से घर' },
    task: { en: 'Trace the triangle roof, the walls, the door and the round window to build a house.', hi: 'घर बनाने के लिए त्रिभुज वाली छत, दीवारों, दरवाज़े और गोल खिड़की पर चलो।' },
    labels: L(['Roof', 'Wall', 'Door', 'Window'], ['छत', 'दीवार', 'दरवाज़ा', 'खिड़की']),
    palette: ['#E53935', '#FDD835', '#8D6E63', '#1E88E5', '#43A047'],
    steps: [{ en: 'Trace the triangle roof.', hi: 'त्रिभुज वाली छत पर चलो।' }, { en: 'Trace the walls.', hi: 'दीवारों पर चलो।' }, { en: 'Trace the door and the round window.', hi: 'दरवाज़े और गोल खिड़की पर चलो।' }, { en: 'Colour your house.', hi: 'अपने घर में रंग भरो।' }],
    context: { en: 'Build a house', hi: 'घर बनाओ' },
  },
  // Class 4: its own Colour, Learn, Play and Art.
  {
    id: 'c04.colour.hot-air-balloon', classes: [4, 6], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'Hot air balloon', hi: 'गरम हवा का गुब्बारा' },
    task: { en: 'Colour the balloon in bright stripes and add a bird or a cloud.', hi: 'गुब्बारे में चमकीली धारियाँ रंगो और एक चिड़िया या बादल जोड़ो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#8D6E63', '#FB8C00'],
    steps: [{ en: 'Colour the balloon in stripes.', hi: 'गुब्बारे में धारियाँ रंगो।' }, { en: 'Colour the basket brown.', hi: 'टोकरी को भूरा रंगो।' }, { en: 'Draw a bird in the sky.', hi: 'आसमान में एक चिड़िया बनाओ।' }],
    context: { en: 'Up, up and away', hi: 'ऊपर, और ऊपर' },
  },
  {
    id: 'c04.colour.owl', classes: [4, 6], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'The wise owl', hi: 'समझदार उल्लू' },
    task: { en: 'Colour the owl’s feathers, big eyes and beak. Add a branch with leaves.', hi: 'उल्लू के पंख, बड़ी आँखें और चोंच में रंग भरो। पत्तों वाली एक डाल जोड़ो।' },
    labels: L([], []),
    palette: ['#8D6E63', '#A1887F', '#FDD835', '#FB8C00', '#424242', '#43A047'],
    steps: [{ en: 'Colour the feathers brown.', hi: 'पंखों को भूरा रंगो।' }, { en: 'Colour the big eyes yellow.', hi: 'बड़ी आँखों को पीला रंगो।' }, { en: 'Draw leaves on the branch.', hi: 'डाल पर पत्ते बनाओ।' }],
    context: { en: 'Who? Who?', hi: 'कौन? कौन?' },
  },
  {
    id: 'c04.learn.compass-directions', classes: [4, 7], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'The compass', hi: 'दिशा सूचक' },
    task: { en: 'Write North, South, East and West in the boxes. Colour the north needle red.', hi: 'डिब्बों में उत्तर, दक्षिण, पूर्व और पश्चिम लिखो। उत्तर की सुई को लाल रंगो।' },
    labels: L(['North', 'South', 'East', 'West'], ['उत्तर', 'दक्षिण', 'पूर्व', 'पश्चिम']),
    palette: ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#424242'],
    steps: [{ en: 'Write North in the top box.', hi: 'ऊपर वाले डिब्बे में उत्तर लिखो।' }, { en: 'Write South in the bottom box.', hi: 'नीचे वाले डिब्बे में दक्षिण लिखो।' }, { en: 'Write East on the right and West on the left.', hi: 'दाईं ओर पूर्व और बाईं ओर पश्चिम लिखो।' }, { en: 'Colour the north needle red.', hi: 'उत्तर की सुई को लाल रंगो।' }],
    context: { en: 'Where is north?', hi: 'उत्तर किधर है?' },
  },
  {
    id: 'c04.learn.road-signs', classes: [4, 7], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Road signs', hi: 'सड़क के चिह्न' },
    task: { en: 'Colour each sign the way it looks on the road. Then draw a sign for your school.', hi: 'हर चिह्न में वैसा रंग भरो जैसा वह सड़क पर दिखता है। फिर अपने स्कूल के लिए एक चिह्न बनाओ।' },
    labels: L(['Must do', 'Be careful', 'Information'], ['ज़रूर करो', 'सावधान', 'जानकारी']),
    palette: ['#1E88E5', '#E53935', '#FDD835', '#43A047', '#424242'],
    steps: [{ en: 'Colour the round sign blue.', hi: 'गोल चिह्न को नीला रंगो।' }, { en: 'Colour the triangle sign yellow.', hi: 'तिकोने चिह्न को पीला रंगो।' }, { en: 'Colour the box sign green.', hi: 'डिब्बे वाले चिह्न को हरा रंगो।' }, { en: 'Draw a sign for your school gate.', hi: 'अपने स्कूल के फाटक के लिए एक चिह्न बनाओ।' }],
    context: { en: 'Stop, look, go', hi: 'रुको, देखो, चलो' },
  },
  {
    id: 'c04.play.treasure-map', classes: [4, 8], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Treasure map', hi: 'खज़ाने का नक्शा' },
    task: { en: 'Draw a route from the ship to the X, past the palm tree. Write a clue in the dotted box.', hi: 'जहाज़ से X तक, ताड़ के पेड़ के पास से होकर, रास्ता बनाओ। बिंदु वाले डिब्बे में एक सुराग लिखो।' },
    labels: L(['Start', 'Treasure'], ['शुरू', 'खज़ाना']),
    palette: ['#8D6E63', '#FDD835', '#1E88E5', '#43A047', '#E53935', '#FB8C00'],
    steps: [{ en: 'Find the ship. This is the start.', hi: 'जहाज़ ढूँढो। यहीं से शुरू होगा।' }, { en: 'Draw the route past the palm tree.', hi: 'ताड़ के पेड़ के पास से रास्ता बनाओ।' }, { en: 'Reach the X.', hi: 'X तक पहुँचो।' }, { en: 'Write a clue in the box.', hi: 'डिब्बे में एक सुराग लिखो।' }],
    context: { en: 'X marks the spot', hi: 'खज़ाना यहाँ है' },
  },
  {
    id: 'c04.play.word-grid', classes: [4, 8], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'The word grid', hi: 'शब्दों का जाल' },
    task: { en: 'Write a letter in every box and hide three words. Ask someone at home to find them.', hi: 'हर डिब्बे में एक अक्षर लिखो और तीन शब्द छिपाओ। घर पर किसी से उन्हें ढूँढने को कहो।' },
    labels: L(['Across', 'Down'], ['आड़े', 'खड़े']),
    palette: ['#1E88E5', '#E53935', '#43A047', '#FDD835', '#8E24AA'],
    steps: [{ en: 'Write one word across.', hi: 'एक शब्द आड़ा लिखो।' }, { en: 'Write one word down.', hi: 'एक शब्द खड़ा लिखो।' }, { en: 'Fill the other boxes with letters.', hi: 'बाकी डिब्बों में अक्षर भरो।' }],
    context: { en: 'Find the words', hi: 'शब्द ढूँढो' },
  },
  {
    id: 'c04.art.pattern-border', classes: [4, 8], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'A pattern border', hi: 'पैटर्न वाली किनारी' },
    task: { en: 'Colour the triangles and circles in a repeating pattern, like red, yellow, blue.', hi: 'त्रिभुजों और गोलों में दोहराते हुए रंग भरो, जैसे लाल, पीला, नीला।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00'],
    steps: [{ en: 'Pick three colours.', hi: 'तीन रंग चुनो।' }, { en: 'Colour the top triangles in a pattern.', hi: 'ऊपर के त्रिभुजों में पैटर्न से रंग भरो।' }, { en: 'Colour the circles in the same pattern.', hi: 'गोलों में उसी पैटर्न से रंग भरो।' }, { en: 'Colour the bottom triangles.', hi: 'नीचे के त्रिभुजों में रंग भरो।' }],
    context: { en: 'Repeat, repeat', hi: 'दोहराओ, दोहराओ' },
  },
  {
    id: 'c04.art.sunset-landscape', classes: [4, 8], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'A sunset', hi: 'सूर्यास्त' },
    task: { en: 'Colour the sky orange and pink, the hills dark and the water gold. Add birds and a tree.', hi: 'आसमान को नारंगी और गुलाबी, पहाड़ियों को गहरा और पानी को सुनहरा रंगो। चिड़ियाँ और एक पेड़ जोड़ो।' },
    labels: L([], []),
    palette: ['#FB8C00', '#F06292', '#8E24AA', '#FDD835', '#424242', '#1E88E5'],
    steps: [{ en: 'Colour the sky orange and pink.', hi: 'आसमान को नारंगी और गुलाबी रंगो।' }, { en: 'Colour the setting sun yellow.', hi: 'ढलते सूरज को पीला रंगो।' }, { en: 'Colour the hills and the water.', hi: 'पहाड़ियों और पानी में रंग भरो।' }, { en: 'Add birds and a tree.', hi: 'चिड़ियाँ और एक पेड़ जोड़ो।' }],
    context: { en: 'Evening sky', hi: 'शाम का आसमान' },
  },
  // Class 5: its own Colour, Learn, Play and Art (not a guided class, so no steps).
  {
    id: 'c05.colour.sailboat', classes: [5, 7], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'Sailboat', hi: 'पाल वाली नाव' },
    task: { en: 'Colour the sails, the boat and the waves. Add a sun and a gull.', hi: 'पालों, नाव और लहरों में रंग भरो। एक सूरज और एक समुद्री पक्षी जोड़ो।' },
    labels: L([], []),
    palette: ['#E53935', '#FDD835', '#1E88E5', '#29B6F6', '#8D6E63', '#43A047'],
  },
  {
    id: 'c05.colour.sunflower', classes: [5, 7], subject: 'colour', cat: 'colour', chapterKey: null, parentGate: false,
    title: { en: 'A sunflower', hi: 'सूरजमुखी' },
    task: { en: 'Colour the petals yellow and the middle brown. Shade the leaves in two greens.', hi: 'पंखुड़ियों को पीला और बीच को भूरा रंगो। पत्तों में हरे के दो रंग भरो।' },
    labels: L([], []),
    palette: ['#FDD835', '#FB8C00', '#8D6E63', '#2E7D32', '#81C784'],
  },
  {
    id: 'c05.learn.fraction-bars', classes: [5, 8], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Fraction bars', hi: 'भिन्न की पट्टियाँ' },
    task: { en: 'Shade the whole bar, one half, one quarter and one eighth, each in its own colour. Write the fraction next to each bar.', hi: 'पूरी पट्टी, आधा, चौथाई और आठवाँ भाग अलग-अलग रंगों से रंगो। हर पट्टी के पास भिन्न लिखो।' },
    labels: L(['Whole', 'Half', 'Quarter', 'Eighth'], ['पूरा', 'आधा', 'चौथाई', 'आठवाँ']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
  },
  {
    id: 'c05.learn.symmetry-butterfly', classes: [5, 8], subject: 'learn', cat: 'learn', chapterKey: null, parentGate: false,
    title: { en: 'Symmetry: the butterfly', hi: 'सममिति: तितली' },
    task: { en: 'Draw the right wing to match the left, then colour both wings the same way.', hi: 'दाएँ पंख को बाएँ पंख जैसा बनाओ, फिर दोनों पंखों में एक जैसे रंग भरो।' },
    labels: L(['Line of symmetry'], ['सममिति रेखा']),
    palette: ['#8E24AA', '#E53935', '#FB8C00', '#1E88E5', '#FDD835', '#43A047'],
  },
  {
    id: 'c05.play.triangle-puzzle', classes: [5, 9], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'The triangle puzzle', hi: 'त्रिभुज की पहेली' },
    task: { en: 'Colour all 12 triangles so that no two triangles that touch have the same colour. How few colours can you use?', hi: 'सभी 12 त्रिभुजों में ऐसे रंग भरो कि जो त्रिभुज एक-दूसरे को छूएँ, उनका रंग एक न हो। कम से कम कितने रंग लगे?' },
    labels: L([], []),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'],
  },
  {
    id: 'c05.play.shape-sudoku', classes: [5, 9], subject: 'play', cat: 'play', chapterKey: null, parentGate: false,
    title: { en: 'Shape sudoku', hi: 'आकारों की सुडोकू' },
    task: { en: 'Draw a circle, a square, a triangle and a diamond in every row, every column and every 2 by 2 box. The first row is done.', hi: 'हर पंक्ति, हर स्तंभ और हर 2 गुणा 2 के खाने में गोला, वर्ग, त्रिभुज और समचतुर्भुज बनाओ। पहली पंक्ति पूरी है।' },
    labels: L(['Circle', 'Square', 'Triangle', 'Diamond'], ['गोला', 'वर्ग', 'त्रिभुज', 'समचतुर्भुज']),
    palette: ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'],
  },
  {
    id: 'c05.art.honeycomb-tiles', classes: [5, 10], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'Honeycomb tiles', hi: 'छत्ते जैसी टाइलें' },
    task: { en: 'Colour the hexagons in a pattern that repeats. Tiles that fit together with no gaps make a tessellation.', hi: 'षट्भुजों में ऐसा पैटर्न बनाओ जो दोहराता हो। बिना खाली जगह के जुड़ने वाली टाइलों से टेसेलेशन बनता है।' },
    labels: L([], []),
    palette: ['#FDD835', '#FB8C00', '#E53935', '#1E88E5', '#43A047', '#8E24AA'],
  },
  {
    id: 'c05.art.city-skyline', classes: [5, 10], subject: 'art', cat: 'art', chapterKey: null, parentGate: false,
    title: { en: 'City skyline at night', hi: 'रात में शहर' },
    task: { en: 'Colour the buildings dark, light up some windows yellow and add the moon and stars.', hi: 'इमारतों को गहरा रंगो, कुछ खिड़कियों में पीली रोशनी भरो और चाँद और तारे जोड़ो।' },
    labels: L([], []),
    palette: ['#424242', '#5E35B1', '#FDD835', '#FB8C00', '#90A4AE', '#1E88E5'],
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
  if (t.cat) return t.cat;
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
  const rank = (k: string) => (DRAW_CATEGORIES.includes(k as DrawCategory) ? 1000 + DRAW_CATEGORIES.indexOf(k as DrawCategory) : order.indexOf(k));
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0])).map(([subject, templates]) => ({ subject, templates }));
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
  return {
    id: t.id, title: t.title[lang], task: t.task[lang], outlineSvg, palette: t.palette, labels: t.labels[lang], subject, classLevel, chapterKey: t.chapterKey,
    ...(t.steps ? { steps: t.steps.map((x) => ({ text: x[lang], ...(x.at ? { at: x.at } : {}) })) } : {}),
    ...(t.context ? { context: t.context[lang] } : {}),
  };
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
