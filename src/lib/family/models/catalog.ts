// The 3D model catalogue (W19-D): the things a Science answer in Classes 6 to 10 may show as a model the child can turn,
// each with its parts named in English and Hindi. The tutor names a model by key and the parts it explains (`focus`);
// our code draws it and highlights the part. Pure data: no three.js, no DOM.
//
// `source`: `asset`, a part-segmented glTF under public/models/<key>.glb, cut from an open anatomy atlas (licence record:
// docs/reference/3d-models.md); `procedural`, built by our own code from simple shapes (./procedural.ts), a schematic
// with its parts in the right places. Neither is a photograph: the screen calls both "a model".
// A part with `group` names no shape of its own: it stands for its members (the cerebrum is the four lobes).
// `also`: other names a sentence may use for the part (singular forms, the textbook's other word, the Hindi spelling in
// common use); ./spoken.ts finds a part by its label or one of these.
// `words`: what a question, its syllabus line or the block's title must carry for the model to be shown (./fit.ts).

import type { colors } from '@/lib/design-tokens';
import type { ModelKey } from '../blocks';

export type { ModelKey } from '../blocks';

export type ModelTone = keyof typeof colors;
export type ModelPart = { key: string; en: string; hi: string; also?: readonly string[]; tone: ModelTone; group?: readonly string[] };
export type ModelEntry = { title: { en: string; hi: string }; source: 'asset' | 'procedural'; classes: readonly number[]; words: readonly string[]; parts: readonly ModelPart[] };
export type ModelLang = 'en' | 'hi';

const p = (key: string, en: string, hi: string, tone: ModelTone, also?: readonly string[], group?: readonly string[]): ModelPart => ({ key, en, hi, tone, ...(also ? { also } : {}), ...(group ? { group } : {}) });

export const MODELS: Record<ModelKey, ModelEntry> = {
  brain: {
    title: { en: 'The human brain', hi: 'मानव मस्तिष्क' },
    source: 'asset',
    classes: [6, 7, 8, 9, 10],
    words: ['brain', 'cerebrum', 'cerebellum', 'medulla', 'hypothalamus', 'nervous system', 'मस्तिष्क', 'दिमाग', 'प्रमस्तिष्क', 'अनुमस्तिष्क', 'मेडुला', 'तंत्रिका तंत्र'],
    parts: [
      p('frontal_lobe', 'Frontal lobe', 'अग्र पालि', 'peach', ['frontal', 'ललाट पालि']),
      p('parietal_lobe', 'Parietal lobe', 'पार्श्विका पालि', 'gold', ['parietal']),
      p('temporal_lobe', 'Temporal lobe', 'शंख पालि', 'turquoise', ['temporal']),
      p('occipital_lobe', 'Occipital lobe', 'पश्चकपाल पालि', 'coral', ['occipital']),
      p('cerebellum', 'Cerebellum', 'अनुमस्तिष्क', 'grape', ['little brain']),
      p('midbrain', 'Midbrain', 'मध्यमस्तिष्क', 'azure', ['mid-brain', 'मध्य मस्तिष्क']),
      p('pons', 'Pons', 'पोंस', 'cyan', ['पॉन्स']),
      p('medulla', 'Medulla', 'मेडुला', 'royal', ['medulla oblongata', 'मेरुशीर्ष']),
      p('hypothalamus', 'Hypothalamus', 'हाइपोथैलेमस', 'tangerine', ['अधश्चेतक']),
      p('cerebrum', 'Cerebrum', 'प्रमस्तिष्क', 'peach', ['fore-brain', 'forebrain', 'अग्रमस्तिष्क'], ['frontal_lobe', 'parietal_lobe', 'temporal_lobe', 'occipital_lobe']),
      p('brain_stem', 'Brain stem', 'मस्तिष्क स्तंभ', 'royal', ['brainstem', 'hindbrain', 'पश्चमस्तिष्क'], ['midbrain', 'pons', 'medulla']),
    ],
  },
  heart: {
    title: { en: 'The human heart', hi: 'मानव हृदय' },
    source: 'asset',
    classes: [7, 10],
    words: ['heart', 'atrium', 'atria', 'ventricle', 'aorta', 'circulat', 'blood vessel', 'हृदय', 'दिल', 'अलिंद', 'निलय', 'महाधमनी', 'परिसंचरण', 'रक्त वाहिका'],
    parts: [
      p('right_atrium', 'Right atrium', 'दायाँ अलिंद', 'azure', ['दाहिना अलिंद', 'दायां अलिंद']),
      p('left_atrium', 'Left atrium', 'बायाँ अलिंद', 'coral', ['बायां अलिंद']),
      p('right_ventricle', 'Right ventricle', 'दायाँ निलय', 'royal', ['दाहिना निलय', 'दायां निलय']),
      p('left_ventricle', 'Left ventricle', 'बायाँ निलय', 'tangerine', ['बायां निलय']),
      p('aorta', 'Aorta', 'महाधमनी', 'coral'),
      p('pulmonary_artery', 'Pulmonary artery', 'फुफ्फुसीय धमनी', 'azure', ['pulmonary arteries', 'pulmonary trunk', 'फुफ्फुस धमनी']),
      p('vena_cava', 'Vena cava', 'महाशिरा', 'royal', ['vena cavae', 'venae cavae', 'महा शिरा']),
      p('pulmonary_veins', 'Pulmonary veins', 'फुफ्फुसीय शिराएँ', 'gold', ['pulmonary vein', 'फुफ्फुसीय शिरा', 'फुफ्फुस शिरा']),
      p('valves', 'Valves', 'वाल्व', 'sunshine', ['valve', 'कपाट']),
      p('coronary_arteries', 'Coronary arteries', 'हृद धमनियाँ', 'tangerine', ['coronary artery', 'कोरोनरी धमनी']),
    ],
  },
  eye: {
    title: { en: 'The human eye', hi: 'मानव नेत्र' },
    source: 'asset',
    classes: [8, 10],
    words: ['eye', 'retina', 'cornea', 'iris', 'pupil', 'optic nerve', 'vision', 'eyesight', 'आँख', 'आंख', 'नेत्र', 'दृष्टि', 'रेटिना', 'कॉर्निया', 'पुतली'],
    parts: [
      p('cornea', 'Cornea', 'कॉर्निया', 'cyan', ['स्वच्छ मंडल', 'कार्निया']),
      p('iris', 'Iris', 'परितारिका', 'tangerine', ['pupil', 'आइरिस', 'पुतली']),
      p('lens', 'Lens', 'लेंस', 'sunshine', ['eye lens', 'नेत्र लेंस', 'अभिनेत्र लेंस']),
      p('sclera', 'Sclera', 'श्वेत पटल', 'offWhite', ['white of the eye', 'दृढ़ पटल']),
      p('retina', 'Retina', 'दृष्टिपटल', 'coral', ['रेटिना']),
      p('vitreous', 'Vitreous humour', 'काचाभ द्रव', 'turquoise', ['vitreous humor', 'vitreous body', 'काचाभ']),
      p('optic_nerve', 'Optic nerve', 'दृक् तंत्रिका', 'gold', ['दृष्टि तंत्रिका', 'प्रकाशिक तंत्रिका']),
    ],
  },
  lungs: {
    title: { en: 'The lungs and windpipe', hi: 'फेफड़े और श्वासनली' },
    source: 'asset',
    classes: [7, 10],
    words: ['lung', 'breath', 'respirat', 'trachea', 'windpipe', 'bronch', 'फेफड़', 'फेफडे', 'श्वसन', 'श्वास', 'साँस', 'सांस'],
    parts: [
      p('trachea', 'Trachea', 'श्वासनली', 'azure', ['windpipe', 'श्वास नली']),
      p('bronchi', 'Bronchi', 'श्वसनी', 'royal', ['bronchus', 'bronchiole', 'श्वसनिका', 'श्वसनियाँ']),
      p('right_lung', 'Right lung', 'दायाँ फेफड़ा', 'coral', ['दायां फेफड़ा', 'दाहिना फेफड़ा']),
      p('left_lung', 'Left lung', 'बायाँ फेफड़ा', 'peach', ['बायां फेफड़ा']),
      p('epiglottis', 'Epiglottis', 'कंठच्छद', 'gold', ['घाँटी ढक्कन']),
    ],
  },
  digestive: {
    title: { en: 'The digestive system', hi: 'पाचन तंत्र' },
    source: 'asset',
    classes: [7, 10],
    words: ['digest', 'stomach', 'intestine', 'food pipe', 'oesophagus', 'esophagus', 'alimentary', 'liver', 'pancreas', 'पाचन', 'आमाशय', 'आँत', 'आंत', 'आहार नाल', 'ग्रसिका', 'यकृत', 'अग्न्याशय'],
    parts: [
      p('mouth', 'Mouth and tongue', 'मुँह और जीभ', 'coral', ['mouth', 'tongue', 'buccal cavity', 'मुख', 'मुँह', 'मुंह', 'जीभ', 'मुखगुहा']),
      p('salivary_glands', 'Salivary glands', 'लार ग्रंथियाँ', 'gold', ['salivary gland', 'लार ग्रंथि', 'लार ग्रन्थि']),
      p('pharynx', 'Pharynx', 'ग्रसनी', 'peach', ['throat', 'गला']),
      p('oesophagus', 'Oesophagus', 'ग्रसिका', 'tangerine', ['esophagus', 'food pipe', 'भोजन नली', 'ग्रासनली']),
      p('stomach', 'Stomach', 'आमाशय', 'grape', ['जठर']),
      p('liver', 'Liver', 'यकृत', 'coral', ['लीवर', 'जिगर']),
      p('gallbladder', 'Gall bladder', 'पित्ताशय', 'leaf', ['gallbladder', 'bile', 'पित्त']),
      p('pancreas', 'Pancreas', 'अग्न्याशय', 'sunshine', ['अग्नाशय']),
      p('small_intestine', 'Small intestine', 'छोटी आँत', 'turquoise', ['duodenum', 'छोटी आंत', 'क्षुद्रांत्र', 'ग्रहणी']),
      p('large_intestine', 'Large intestine', 'बड़ी आँत', 'azure', ['colon', 'बड़ी आंत', 'बृहदांत्र']),
      p('appendix', 'Appendix', 'परिशेषिका', 'cyan', ['अपेंडिक्स', 'आंत्रपुच्छ']),
    ],
  },
  excretory: {
    title: { en: 'The excretory system', hi: 'उत्सर्जन तंत्र' },
    source: 'asset',
    classes: [10],
    words: ['excret', 'kidney', 'urine', 'urinary', 'nephron', 'bladder', 'उत्सर्जन', 'वृक्क', 'गुर्दे', 'गुर्दा', 'मूत्र'],
    parts: [
      p('kidneys', 'Kidneys', 'वृक्क', 'coral', ['kidney', 'गुर्दे', 'गुर्दा']),
      p('ureters', 'Ureters', 'मूत्रवाहिनी', 'gold', ['ureter', 'मूत्रवाहिनियाँ']),
      p('bladder', 'Urinary bladder', 'मूत्राशय', 'sunshine', ['bladder']),
      p('urethra', 'Urethra', 'मूत्रमार्ग', 'azure'),
    ],
  },
  plant_cell: {
    title: { en: 'A plant cell', hi: 'पादप कोशिका' },
    source: 'procedural',
    classes: [8, 9],
    words: ['cell', 'chloroplast', 'vacuole', 'cell wall', 'कोशिका', 'हरितलवक', 'रिक्तिका'],
    parts: [
      p('cell_wall', 'Cell wall', 'कोशिका भित्ति', 'emerald', ['कोशिका दीवार']),
      p('cell_membrane', 'Cell membrane', 'कोशिका झिल्ली', 'gold', ['plasma membrane', 'cell membrane', 'प्लाज़्मा झिल्ली', 'प्लैज्मा झिल्ली', 'कोशिका कला']),
      p('cytoplasm', 'Cytoplasm', 'कोशिकाद्रव्य', 'peach', ['जीवद्रव्य', 'कोशिका द्रव्य']),
      p('nucleus', 'Nucleus', 'केंद्रक', 'grape', ['केन्द्रक']),
      p('vacuole', 'Vacuole', 'रिक्तिका', 'cyan', ['रसधानी']),
      p('chloroplasts', 'Chloroplasts', 'हरितलवक', 'leaf', ['chloroplast', 'हरित लवक']),
      p('mitochondria', 'Mitochondria', 'माइटोकॉन्ड्रिया', 'tangerine', ['mitochondrion', 'सूत्रकणिका']),
    ],
  },
  animal_cell: {
    title: { en: 'An animal cell', hi: 'जंतु कोशिका' },
    source: 'procedural',
    classes: [8, 9],
    words: ['cell', 'mitochondri', 'golgi', 'lysosome', 'कोशिका', 'माइटोकॉन्ड्रिया', 'गॉल्जी', 'लयनकाय'],
    parts: [
      p('cell_membrane', 'Cell membrane', 'कोशिका झिल्ली', 'gold', ['plasma membrane', 'प्लाज़्मा झिल्ली', 'प्लैज्मा झिल्ली', 'कोशिका कला']),
      p('cytoplasm', 'Cytoplasm', 'कोशिकाद्रव्य', 'peach', ['जीवद्रव्य', 'कोशिका द्रव्य']),
      p('nucleus', 'Nucleus', 'केंद्रक', 'grape', ['केन्द्रक']),
      p('mitochondria', 'Mitochondria', 'माइटोकॉन्ड्रिया', 'tangerine', ['mitochondrion', 'सूत्रकणिका']),
      p('golgi', 'Golgi apparatus', 'गॉल्जी उपकरण', 'azure', ['golgi body', 'golgi bodies', 'गॉल्जी काय', 'गॉल्जी']),
      p('lysosomes', 'Lysosomes', 'लयनकाय', 'coral', ['lysosome', 'लाइसोसोम']),
      p('vacuole', 'Vacuole', 'रिक्तिका', 'cyan', ['रसधानी']),
    ],
  },
  flower: {
    title: { en: 'The parts of a flower', hi: 'फूल के भाग' },
    source: 'procedural',
    classes: [6, 7, 8, 10],
    words: ['flower', 'pollinat', 'stamen', 'pistil', 'carpel', 'petal', 'sepal', 'anther', 'stigma', 'फूल', 'पुष्प', 'परागण', 'पुंकेसर', 'स्त्रीकेसर', 'पंखुड़ी', 'परागकोश', 'वर्तिकाग्र'],
    parts: [
      p('petals', 'Petals', 'पंखुड़ियाँ', 'coral', ['petal', 'पंखुड़ी', 'दल']),
      p('sepals', 'Sepals', 'बाह्यदल', 'leaf', ['sepal']),
      p('filament', 'Filament', 'तंतु', 'sunshine', ['तन्तु', 'पुतंतु']),
      p('anther', 'Anther', 'परागकोश', 'tangerine', ['anthers', 'पराग कोश']),
      p('stigma', 'Stigma', 'वर्तिकाग्र', 'grape'),
      p('style', 'Style', 'वर्तिका', 'azure'),
      p('ovary', 'Ovary', 'अंडाशय', 'turquoise', ['अण्डाशय']),
      p('receptacle', 'Receptacle', 'पुष्पासन', 'emerald', ['thalamus']),
      p('stalk', 'Stalk', 'पुष्पवृंत', 'emerald', ['pedicel', 'डंठल']),
      p('stamen', 'Stamen', 'पुंकेसर', 'tangerine', ['stamens'], ['filament', 'anther']),
      p('pistil', 'Pistil', 'स्त्रीकेसर', 'grape', ['carpel', 'स्त्री केसर', 'अंडप'], ['stigma', 'style', 'ovary']),
    ],
  },
  neuron: {
    title: { en: 'A nerve cell (neuron)', hi: 'तंत्रिका कोशिका (न्यूरॉन)' },
    source: 'procedural',
    classes: [8, 10],
    words: ['neuron', 'neurone', 'nerve cell', 'nerve', 'axon', 'dendrite', 'synapse', 'तंत्रिका', 'न्यूरॉन', 'तंत्रिकाक्ष', 'द्रुमिका'],
    parts: [
      p('dendrites', 'Dendrites', 'द्रुमिकाएँ', 'tangerine', ['dendrite', 'द्रुमिका', 'द्रुमाकृतिक']),
      p('cell_body', 'Cell body', 'कोशिका काय', 'peach', ['cyton', 'कोशिकाकाय', 'साइटॉन']),
      p('nucleus', 'Nucleus', 'केंद्रक', 'grape', ['केन्द्रक']),
      p('axon', 'Axon', 'तंत्रिकाक्ष', 'azure', ['एक्सॉन']),
      p('myelin', 'Myelin sheath', 'माइलिन आवरण', 'gold', ['myelin', 'माइलिन']),
      p('nerve_endings', 'Nerve endings', 'तंत्रिका सिरे', 'coral', ['nerve ending', 'axon terminal', 'axon ending', 'तंत्रिका अंत']),
    ],
  },
  dc_motor: {
    title: { en: 'An electric motor', hi: 'विद्युत मोटर' },
    source: 'procedural',
    classes: [10],
    words: ['motor', 'fleming', 'armature', 'commutator', 'left-hand rule', 'left hand rule', 'मोटर', 'फ्लेमिंग', 'दिक्परिवर्तक', 'आर्मेचर', 'बाएँ हाथ', 'बाएं हाथ'],
    parts: [
      p('magnet_n', 'North pole of the magnet', 'चुंबक का उत्तरी ध्रुव', 'coral', ['north pole', 'उत्तरी ध्रुव']),
      p('magnet_s', 'South pole of the magnet', 'चुंबक का दक्षिणी ध्रुव', 'azure', ['south pole', 'दक्षिणी ध्रुव']),
      p('coil', 'Coil (armature)', 'कुंडली (आर्मेचर)', 'tangerine', ['coil', 'armature', 'कुंडली', 'कुण्डली', 'आर्मेचर']),
      p('commutator', 'Split-ring commutator', 'विभक्त वलय दिक्परिवर्तक', 'gold', ['split ring', 'split-ring', 'commutator', 'विभक्त वलय', 'दिक्परिवर्तक']),
      p('brushes', 'Brushes', 'ब्रश', 'slate', ['brush', 'carbon brush', 'ब्रुश']),
      p('axle', 'Axle', 'धुरी', 'offWhite', ['shaft', 'धुरा']),
      p('battery', 'Battery', 'बैटरी', 'leaf', ['cell', 'सेल']),
      p('magnet', 'Magnet', 'चुंबक', 'coral', ['magnets', 'field magnet', 'चुम्बक'], ['magnet_n', 'magnet_s']),
    ],
  },
  electromagnet: {
    title: { en: 'An electromagnet', hi: 'विद्युत चुंबक' },
    source: 'procedural',
    classes: [7, 10],
    words: ['electromagnet', 'electric magnet', 'solenoid', 'magnetic effect', 'विद्युत चुंबक', 'विद्युत चुम्बक', 'विद्युतचुंबक', 'परिनालिका', 'चुंबकीय प्रभाव'],
    parts: [
      p('core', 'Iron core', 'लोहे का क्रोड', 'slate', ['iron nail', 'nail', 'soft iron', 'iron core', 'लोहे की कील', 'कील', 'क्रोड']),
      p('coil', 'Coil of wire', 'तार की कुंडली', 'tangerine', ['coil', 'wire', 'कुंडली', 'कुण्डली', 'तार']),
      p('battery', 'Battery', 'बैटरी', 'leaf', ['cell', 'सेल']),
      p('switch', 'Switch', 'स्विच', 'azure', ['key', 'कुंजी']),
      p('clips', 'Paper clips', 'पेपर क्लिप', 'gold', ['paper clip', 'paperclip', 'pins', 'आलपिन', 'पिन']),
    ],
  },
  solar_system: {
    title: { en: 'The solar system', hi: 'सौर मंडल' },
    source: 'procedural',
    classes: [6, 8],
    words: ['solar system', 'planet', 'mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune', 'asteroid', 'सौर मंडल', 'सौरमंडल', 'सौर परिवार', 'ग्रह', 'क्षुद्रग्रह'],
    parts: [
      p('sun', 'Sun', 'सूर्य', 'gold', ['सूरज']),
      p('mercury', 'Mercury', 'बुध', 'slate'),
      p('venus', 'Venus', 'शुक्र', 'peach'),
      p('earth', 'Earth', 'पृथ्वी', 'azure', ['धरती']),
      p('mars', 'Mars', 'मंगल', 'coral'),
      p('asteroid_belt', 'Asteroid belt', 'क्षुद्रग्रह पट्टी', 'offWhite', ['asteroids', 'asteroid', 'क्षुद्रग्रह']),
      p('jupiter', 'Jupiter', 'बृहस्पति', 'tangerine', ['गुरु']),
      p('saturn', 'Saturn', 'शनि', 'sunshine'),
      p('uranus', 'Uranus', 'अरुण', 'cyan', ['यूरेनस']),
      p('neptune', 'Neptune', 'वरुण', 'royal', ['नेपच्यून']),
    ],
  },
  earth_layers: {
    title: { en: 'Inside the Earth', hi: 'पृथ्वी की आंतरिक संरचना' },
    source: 'procedural',
    classes: [6, 7, 8],
    words: ['crust', 'mantle', 'inner core', 'outer core', "earth's core", 'core of the earth', 'inside the earth', 'interior of the earth', 'layers of the earth', 'structure of the earth', 'भूपर्पटी', 'मेंटल', 'प्रावार', 'क्रोड', 'पृथ्वी की परत', 'पृथ्वी की आंतरिक', 'पृथ्वी का आंतरिक'],
    parts: [
      p('crust', 'Crust', 'भूपर्पटी', 'emerald', ['पर्पटी']),
      p('mantle', 'Mantle', 'मेंटल', 'tangerine', ['प्रावार']),
      p('outer_core', 'Outer core', 'बाह्य क्रोड', 'gold', ['बाहरी क्रोड']),
      p('inner_core', 'Inner core', 'आंतरिक क्रोड', 'coral', ['भीतरी क्रोड']),
      p('core', 'Core', 'क्रोड', 'gold', ['कोर'], ['outer_core', 'inner_core']),
    ],
  },
  atom: {
    title: { en: 'An atom (carbon)', hi: 'एक परमाणु (कार्बन)' },
    source: 'procedural',
    classes: [8, 9],
    words: ['atom', 'electron', 'proton', 'neutron', 'परमाणु', 'इलेक्ट्रॉन', 'प्रोटॉन', 'न्यूट्रॉन'],
    parts: [
      p('protons', 'Protons', 'प्रोटॉन', 'coral', ['proton']),
      p('neutrons', 'Neutrons', 'न्यूट्रॉन', 'azure', ['neutron']),
      p('electrons', 'Electrons', 'इलेक्ट्रॉन', 'gold', ['electron']),
      p('k_shell', 'K shell', 'K कोश', 'turquoise', ['first shell', 'पहला कोश']),
      p('l_shell', 'L shell', 'L कोश', 'grape', ['second shell', 'दूसरा कोश']),
      p('nucleus', 'Nucleus', 'नाभिक', 'coral', ['नाभिकीय'], ['protons', 'neutrons']),
      p('shells', 'Shells (orbits)', 'कोश (कक्षाएँ)', 'turquoise', ['shell', 'orbit', 'energy level', 'कक्षा', 'कक्षाएँ', 'ऊर्जा स्तर'], ['k_shell', 'l_shell']),
    ],
  },
  water_cycle: {
    title: { en: 'The water cycle', hi: 'जल चक्र' },
    source: 'procedural',
    classes: [6, 7, 9],
    words: ['water cycle', 'evaporat', 'condens', 'precipitation', 'rain', 'cloud', 'जल चक्र', 'जलचक्र', 'वाष्पन', 'वाष्पीकरण', 'संघनन', 'वर्षा', 'बारिश', 'बादल', 'वर्षण'],
    parts: [
      p('sun', 'Sun', 'सूर्य', 'gold', ['सूरज']),
      p('sea', 'Sea', 'समुद्र', 'royal', ['ocean', 'lake', 'सागर', 'महासागर']),
      p('evaporation', 'Evaporation', 'वाष्पीकरण', 'cyan', ['evaporate', 'water vapour', 'water vapor', 'वाष्पन', 'जलवाष्प', 'भाप']),
      p('clouds', 'Clouds (condensation)', 'बादल (संघनन)', 'offWhite', ['cloud', 'condensation', 'condense', 'बादल', 'संघनन', 'मेघ']),
      p('rain', 'Rain (precipitation)', 'वर्षा (वर्षण)', 'azure', ['rain', 'precipitation', 'वर्षा', 'बारिश', 'वर्षण']),
      p('mountains', 'Mountains', 'पहाड़', 'emerald', ['mountain', 'hill', 'पर्वत', 'पहाड़ों']),
      p('river', 'River', 'नदी', 'turquoise', ['runoff', 'run-off', 'stream', 'नदियाँ', 'नदियां']),
    ],
  },
  leaf: {
    title: { en: 'A leaf and its stomata', hi: 'पत्ती और उसके रंध्र' },
    source: 'procedural',
    classes: [6, 7, 10],
    words: ['leaf', 'leaves', 'stomata', 'stoma', 'photosynthesis', 'transpiration', 'पत्ती', 'पत्ते', 'पत्तियाँ', 'पर्ण', 'रंध्र', 'प्रकाश संश्लेषण', 'वाष्पोत्सर्जन'],
    parts: [
      p('blade', 'Leaf blade', 'पर्णफलक', 'leaf', ['lamina', 'पर्ण फलक']),
      p('midrib', 'Midrib', 'मध्यशिरा', 'emerald', ['मध्य शिरा']),
      p('veins', 'Veins', 'शिराएँ', 'emerald', ['vein', 'शिरा', 'शिराएं', 'शिराविन्यास']),
      p('petiole', 'Petiole', 'पर्णवृंत', 'emerald', ['leaf stalk', 'डंठल']),
      p('stomata', 'Stomata', 'रंध्र', 'slate', ['stoma', 'pore', 'स्टोमेटा']),
      p('guard_cells', 'Guard cells', 'द्वार कोशिकाएँ', 'gold', ['guard cell', 'रक्षक कोशिका', 'द्वार कोशिका']),
    ],
  },
};

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];
export const isModelKey = (v: unknown): v is ModelKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(MODELS, v);
export const isModelPart = (model: ModelKey, part: unknown): part is string => typeof part === 'string' && MODELS[model].parts.some((p) => p.key === part);
export const modelEntry = (key: ModelKey): ModelEntry => MODELS[key];
export const modelPart = (key: ModelKey, part: string): ModelPart | undefined => MODELS[key].parts.find((x) => x.key === part);
// The parts a key stands for: itself, or its group's members.
export const partMembers = (key: ModelKey, part: string): readonly string[] => modelPart(key, part)?.group ?? [part];
export const partLabel = (key: ModelKey, part: string, lang: ModelLang): string => modelPart(key, part)?.[lang] ?? part;
// The shapes drawn (every part that is not a group).
export const drawnParts = (key: ModelKey): ModelPart[] => MODELS[key].parts.filter((x) => !x.group);
export const MODEL_ASSET_MAX_BYTES = 1_500_000;
export const modelAssetPath = (key: ModelKey): string | null => (MODELS[key].source === 'asset' ? `/models/${key}.glb` : null);
