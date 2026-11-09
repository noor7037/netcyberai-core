// Template: Microscope. Prepare a slide, stain it, focus (coarse then fine), change the lens and look: cells, tissues,
// microbes, stomata and more. Every slide is drawn as a micrograph from real sizes in micrometres: the field of view
// of each lens, the scale bar, which parts can be seen at which lens, and what each stain really colours are computed
// in code (nuclei and bacteria take methylene blue, lignin takes safranin, starch turns blue-black with iodine, living
// yeast removes methylene blue, an unstained specimen is nearly transparent, a stain kills a living animal).
// Config: { slide: 'onion-peel' | 'cheek-cells' | 'leaf-peel' | 'stomata' | 'blood-smear' | 'amoeba' | 'paramecium' |
//   'yeast' | 'bread-mould' | 'pollen' | 'root-tip' | 'xylem' | 'muscle' | 'nerve' | 'bacteria' | 'spirogyra',
//   stain?: 'none' | 'iodine' | 'methylene-blue' | 'safranin', task?: 'focus' | 'identify' | 'count' | 'draw' }
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex } = L;
  const T2 = (en, hi) => ({ en, hi });
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- random numbers (deterministic, so a slide always looks the same)
  function h32(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rngOf = (sd, i, j) => rng(Math.imul(sd, 0x9E3779B1) ^ Math.imul(i + 7919, 0x85EBCA6B) ^ Math.imul(j + 104729, 0xC2B2AE35));

  // ---------------------------------------------------------------- stains: which structure takes which stain, and the colour it turns
  // kinds: nuc (nucleus, chromosomes), cyto (cytoplasm, general body), wall (cellulose wall), lign (lignified wall),
  // starch, bact (bacteria), vac (clear sap, takes almost nothing)
  const STAINS = ['none', 'iodine', 'methylene-blue', 'safranin'];
  const STAIN_COL = { iodine: '#9A5A12', 'methylene-blue': '#1E3FB0', safranin: '#D02A4A' };
  const AFF = {
    iodine: { chr: 0.7, nuc: 0.55, cyto: 0.34, wall: 0.3, lign: 0.34, starch: 1, bact: 0.34, vac: 0.06 },
    'methylene-blue': { chr: 0.95, nuc: 0.78, cyto: 0.4, wall: 0.14, lign: 0.3, starch: 0, bact: 1, vac: 0.05 },
    safranin: { chr: 0.95, nuc: 0.7, cyto: 0.24, wall: 0.3, lign: 1, starch: 0, bact: 0.55, vac: 0.04 },
  };
  const stainColour = (s, kind) => (s === 'iodine' && kind === 'starch' ? '#1A1744' : STAIN_COL[s]);
  const STAIN_NAME = {
    none: T2('Fresh slide', 'ताज़ा स्लाइड'), iodine: T2('Iodine', 'आयोडीन'),
    'methylene-blue': T2('Methylene blue', 'मेथिलीन ब्लू'), safranin: T2('Safranin', 'सैफ़्रेनिन'),
  };
  const STAIN_NOTE = {
    iodine: T2('Iodine turns starch blue-black and colours the nucleus and cytoplasm yellow-brown.', 'आयोडीन स्टार्च को नीला-काला कर देता है और केंद्रक व कोशिकाद्रव्य को पीला-भूरा रंगता है।'),
    'methylene-blue': T2('Methylene blue colours the nucleus and bacteria deep blue.', 'मेथिलीन ब्लू केंद्रक और जीवाणुओं को गहरा नीला रंगता है।'),
    safranin: T2('Safranin colours the nucleus and woody (lignified) walls red.', 'सैफ़्रेनिन केंद्रक और काष्ठीय (लिग्निन वाली) दीवारों को लाल रंगता है।'),
  };

  // ---------------------------------------------------------------- the parts a child can find (shared texts; a slide chooses which and from which lens)
  const PART = {
    'cell-wall': [T2('Cell wall', 'कोशिका भित्ति'), T2('The firm outline around each cell.', 'हर कोशिका के चारों ओर की मज़बूत रेखा।'), T2('It gives a plant cell its fixed shape and strength.', 'यह पादप कोशिका को निश्चित आकार और मज़बूती देती है।')],
    membrane: [T2('Cell membrane', 'कोशिका झिल्ली'), T2('The thin edge of the flat cell. There is no hard wall outside it.', 'चपटी कोशिका का पतला किनारा। इसके बाहर कोई कठोर दीवार नहीं।'), T2('It lets useful things in and keeps harmful things out.', 'यह उपयोगी चीज़ों को भीतर आने देती है और हानिकारक को रोकती है।')],
    nucleus: [T2('Nucleus', 'केंद्रक'), T2('A small round, darker spot.', 'एक छोटा गोल, गहरा धब्बा।'), T2('It controls the cell and carries its instructions.', 'यह कोशिका को नियंत्रित करता है और उसके निर्देश रखता है।')],
    cytoplasm: [T2('Cytoplasm', 'कोशिकाद्रव्य'), T2('The grainy, jelly-like material inside the cell.', 'कोशिका के भीतर का दानेदार, लेसदार पदार्थ।'), T2('Most of the cell’s chemical work happens here.', 'कोशिका के अधिकतर रासायनिक कार्य यहीं होते हैं।')],
    vacuole: [T2('Large vacuole', 'बड़ी रिक्तिका'), T2('The big clear space in the middle of the cell.', 'कोशिका के बीच की बड़ी साफ़ जगह।'), T2('It stores water and cell sap and keeps the cell firm.', 'यह पानी और कोशिका-रस जमा करती है और कोशिका को तनी रखती है।')],
    'epidermal-cell': [T2('Epidermal cell', 'बाह्यत्वचा कोशिका'), T2('Wavy-edged cells fitted together like a jigsaw.', 'टेढ़े-मेढ़े किनारों वाली कोशिकाएँ, पहेली की तरह जुड़ी हुई।'), T2('Together they form a protective skin over the leaf.', 'ये मिलकर पत्ती पर सुरक्षा की त्वचा बनाती हैं।')],
    'guard-cell': [T2('Guard cell', 'रक्षक कोशिका'), T2('Two bean-shaped green cells facing each other.', 'आमने-सामने दो सेम के आकार की हरी कोशिकाएँ।'), T2('They open and close the pore by changing shape.', 'ये अपना आकार बदलकर छिद्र को खोलती और बंद करती हैं।')],
    stoma: [T2('Stoma (pore)', 'रंध्र (छिद्र)'), T2('The small gap between two guard cells.', 'दो रक्षक कोशिकाओं के बीच का छोटा अंतराल।'), T2('Air, carbon dioxide and water vapour pass through it.', 'इससे हवा, कार्बन डाइऑक्साइड और जलवाष्प आते-जाते हैं।')],
    chloroplast: [T2('Chloroplast', 'हरितलवक'), T2('Tiny green ovals.', 'छोटे हरे अंडाकार।'), T2('It holds chlorophyll and makes food using sunlight.', 'इसमें क्लोरोफ़िल होता है; यह धूप से भोजन बनाता है।')],
    rbc: [T2('Red blood cell', 'लाल रुधिर कणिका'), T2('Small round pink discs, paler in the middle, with no nucleus.', 'छोटी गोल गुलाबी तश्तरियाँ, बीच में हल्की, बिना केंद्रक की।'), T2('It carries oxygen using haemoglobin.', 'यह हीमोग्लोबिन की मदद से ऑक्सीजन ले जाती है।')],
    wbc: [T2('White blood cell', 'श्वेत रुधिर कणिका'), T2('A bigger cell with a dark, lobed core. There are only a few.', 'बड़ी कोशिका जिसका केंद्र गहरा और खंडित है। ये बहुत कम होती हैं।'), T2('It fights germs and keeps us safe from infection.', 'यह रोगाणुओं से लड़ती है और संक्रमण से बचाती है।')],
    platelet: [T2('Platelet', 'बिंबाणु (प्लेटलेट)'), T2('Tiny purple bits, much smaller than red cells.', 'छोटे बैंगनी टुकड़े, लाल कणिकाओं से बहुत छोटे।'), T2('It helps blood to clot when we get a cut.', 'चोट लगने पर यह रक्त को जमाने में मदद करता है।')],
    pseudopodium: [T2('Pseudopodium', 'पादाभ (कूटपाद)'), T2('A finger-like bulge that keeps changing shape.', 'उँगली जैसा उभार जो आकार बदलता रहता है।'), T2('It helps the Amoeba move and catch food.', 'यह अमीबा को चलने और भोजन पकड़ने में मदद करता है।')],
    'contractile-vacuole': [T2('Contractile vacuole', 'संकुचनशील रिक्तिका'), T2('A clear round bubble that slowly fills and then bursts out.', 'साफ़ गोल बुलबुला जो धीरे-धीरे भरता है और फिर खाली हो जाता है।'), T2('It pumps extra water out of the cell.', 'यह कोशिका से फ़ालतू पानी बाहर निकालती है।')],
    'food-vacuole': [T2('Food vacuole', 'खाद्य रिक्तिका'), T2('A small bubble with food inside.', 'भीतर भोजन वाला छोटा बुलबुला।'), T2('Food is digested inside it.', 'भोजन इसी के भीतर पचता है।')],
    cilia: [T2('Cilia', 'पक्ष्माभ (सिलिया)'), T2('Tiny hairs all around the edge, beating together.', 'किनारे पर चारों ओर महीन बाल, जो साथ-साथ हिलते हैं।'), T2('They sweep the cell along and push food to its mouth.', 'ये कोशिका को आगे बढ़ाते हैं और भोजन को मुख की ओर धकेलते हैं।')],
    'oral-groove': [T2('Oral groove', 'मुख खाँच'), T2('A slanting groove on one side of the body.', 'शरीर के एक ओर तिरछी खाँच।'), T2('Food is swept into the cell through this groove.', 'भोजन इसी खाँच से कोशिका में पहुँचता है।')],
    macronucleus: [T2('Macronucleus', 'बृहत् केंद्रक'), T2('The large bean-shaped core in the middle.', 'बीच में बड़ा सेम के आकार का केंद्र।'), T2('It controls the daily work of the cell.', 'यह कोशिका के रोज़ के कामों को नियंत्रित करता है।')],
    bud: [T2('Bud', 'मुकुल (कली)'), T2('A small round bump growing out of a bigger cell.', 'बड़ी कोशिका से निकलता छोटा गोल उभार।'), T2('It grows into a new yeast cell. This is budding.', 'यह बढ़कर नई यीस्ट कोशिका बनता है। इसे मुकुलन कहते हैं।')],
    hypha: [T2('Hypha', 'कवकतंतु (हाइफ़ा)'), T2('A thin tube that branches into a web. It has no cross walls.', 'पतली नली जो जाल की तरह शाखाएँ बनाती है। इसमें आड़ी दीवारें नहीं होतीं।'), T2('It spreads over the bread and absorbs food.', 'यह डबलरोटी पर फैलकर भोजन सोखता है।')],
    sporangiophore: [T2('Sporangiophore', 'बीजाणुधानीधर'), T2('A stalk that stands up from the web.', 'जाल से ऊपर उठा हुआ डंठल।'), T2('It holds the spore case high so spores can fly away.', 'यह बीजाणुधानी को ऊँचा रखता है ताकि बीजाणु उड़ सकें।')],
    sporangium: [T2('Sporangium', 'बीजाणुधानी'), T2('A dark round ball on top of a stalk.', 'डंठल के ऊपर गहरी गोल गेंद।'), T2('It is the case full of spores.', 'यह बीजाणुओं से भरा डिब्बा है।')],
    spores: [T2('Spores', 'बीजाणु'), T2('Tiny dark oval grains scattered near a broken case.', 'टूटी बीजाणुधानी के पास बिखरे छोटे गहरे अंडाकार दाने।'), T2('Each spore can grow into a new mould.', 'हर बीजाणु से नई फफूँद उग सकती है।')],
    'pollen-grain': [T2('Pollen grain', 'परागकण'), T2('A yellow-brown round grain.', 'पीला-भूरा गोल दाना।'), T2('It carries the male cell of a flower.', 'यह फूल की नर कोशिका ले जाता है।')],
    exine: [T2('Exine (outer wall)', 'बाह्यचोल (बाहरी दीवार)'), T2('The tough, spiky or ridged outer coat.', 'कड़ी, काँटेदार या उभारदार बाहरी परत।'), T2('It protects the pollen and helps it stick to insects.', 'यह परागकण की रक्षा करती है और कीटों से चिपकने में मदद करती है।')],
    'germ-pore': [T2('Germ pore', 'जनन छिद्र'), T2('A round thin patch in the wall.', 'दीवार में एक गोल पतला स्थान।'), T2('The pollen tube comes out through it.', 'परागनलिका इसी से बाहर निकलती है।')],
    'pollen-tube': [T2('Pollen tube', 'परागनलिका'), T2('A long thin tube growing out of a grain.', 'दाने से निकलती लंबी पतली नली।'), T2('It carries the male cells to the ovule for fertilisation.', 'यह नर कोशिकाओं को निषेचन के लिए बीजांड तक ले जाती है।')],
    prophase: [T2('Prophase cell', 'पूर्वावस्था की कोशिका'), T2('A nucleus where the chromosomes show as thin dark threads.', 'ऐसा केंद्रक जिसमें गुणसूत्र पतले गहरे धागों जैसे दिखते हैं।'), T2('Chromosomes shorten and thicken and get ready to divide.', 'गुणसूत्र छोटे और मोटे होकर विभाजन के लिए तैयार होते हैं।')],
    metaphase: [T2('Metaphase cell', 'मध्यावस्था की कोशिका'), T2('Dark chromosomes lined up in one row across the middle.', 'गहरे गुणसूत्र बीच में एक पंक्ति में सजे हुए।'), T2('Chromosomes line up at the equator before they separate.', 'अलग होने से पहले गुणसूत्र मध्य रेखा पर आ जाते हैं।')],
    anaphase: [T2('Anaphase cell', 'पश्चावस्था की कोशिका'), T2('Two sets of chromosomes moving apart to opposite ends.', 'गुणसूत्रों के दो समूह विपरीत सिरों की ओर जाते हुए।'), T2('The two copies of every chromosome are pulled apart.', 'हर गुणसूत्र की दो प्रतियाँ अलग खींच ली जाती हैं।')],
    telophase: [T2('Telophase cell', 'अंत्यावस्था की कोशिका'), T2('Two new groups at the two ends and a new wall forming between them.', 'दोनों सिरों पर दो नए समूह और बीच में बनती नई दीवार।'), T2('Two new nuclei form and the cell splits into two cells.', 'दो नए केंद्रक बनते हैं और कोशिका दो कोशिकाओं में बँट जाती है।')],
    vessel: [T2('Xylem vessel', 'जाइलम वाहिका'), T2('A long empty tube with red rings or spirals on its wall.', 'लंबी खाली नली जिसकी दीवार पर लाल छल्ले या सर्पिल हैं।'), T2('It carries water and minerals up from the roots.', 'यह जड़ों से पानी और खनिज ऊपर ले जाती है।')],
    lignin: [T2('Lignin thickening', 'लिग्निन मोटाई'), T2('The hard red spiral band inside the vessel wall.', 'वाहिका की दीवार के भीतर कठोर लाल सर्पिल पट्टी।'), T2('Hard lignin makes the tube strong so it does not collapse.', 'कठोर लिग्निन नली को मज़बूत रखता है ताकि वह पिचके नहीं।')],
    parenchyma: [T2('Parenchyma cell', 'मृदूतक कोशिका'), T2('A thin-walled brick-shaped cell with a nucleus.', 'पतली दीवार वाली ईंट जैसी कोशिका, जिसमें केंद्रक है।'), T2('It stores food and fills the space between other cells.', 'यह भोजन जमा करती है और दूसरी कोशिकाओं के बीच जगह भरती है।')],
    fibre: [T2('Fibre', 'तंतु (रेशा)'), T2('A very narrow cell with thick red walls.', 'बहुत पतली कोशिका जिसकी दीवारें मोटी और लाल हैं।'), T2('It makes the stem strong and stiff.', 'यह तने को मज़बूत और कड़ा बनाता है।')],
    'skeletal-fibre': [T2('Skeletal muscle fibre', 'कंकाल पेशी तंतु'), T2('A long, thick, striped cell with many nuclei.', 'लंबी, मोटी, धारीदार कोशिका जिसमें कई केंद्रक हैं।'), T2('It pulls on bones when we choose to move.', 'हम जब चाहें तब यह हड्डियों को खींचकर हिलाता है।')],
    striations: [T2('Striations', 'धारियाँ'), T2('Dark and light bands repeating across the fibre.', 'तंतु पर बार-बार आती गहरी और हल्की पट्टियाँ।'), T2('They show the repeating units that slide to make the muscle shorten.', 'ये दोहराई जाने वाली इकाइयाँ हैं जो फिसलकर पेशी को छोटा करती हैं।')],
    'cardiac-fibre': [T2('Cardiac muscle fibre', 'हृदय पेशी तंतु'), T2('A short striped cell that branches, with one central nucleus.', 'छोटी धारीदार कोशिका जो शाखित है, बीच में एक केंद्रक।'), T2('It beats the heart again and again without tiring.', 'यह बिना थके हृदय को बार-बार धड़काती है।')],
    'intercalated-disc': [T2('Intercalated disc', 'अंतर्विष्ट पट्टिका'), T2('A dark cross-line where two heart cells join.', 'गहरी आड़ी रेखा जहाँ हृदय की दो कोशिकाएँ जुड़ती हैं।'), T2('It passes the signal quickly so the heart beats together.', 'यह संकेत तेज़ी से पहुँचाती है ताकि हृदय साथ-साथ धड़के।')],
    'smooth-fibre': [T2('Smooth muscle fibre', 'चिकनी पेशी तंतु'), T2('A long cell pointed at both ends, with no stripes and one central nucleus.', 'दोनों सिरों पर नुकीली लंबी कोशिका, बिना धारियों के, बीच में एक केंद्रक।'), T2('It works on its own, for example to move food along the gut.', 'यह अपने आप काम करती है, जैसे आँत में भोजन आगे खिसकाना।')],
    'cell-body': [T2('Cell body (cyton)', 'कोशिका काय (साइटॉन)'), T2('The large star-shaped part with a big pale nucleus.', 'बड़ा तारे जैसा भाग जिसमें बड़ा हल्का केंद्रक है।'), T2('It makes what the neuron needs and decides its work.', 'यह न्यूरॉन की ज़रूरत की चीज़ें बनाती है और उसका काम तय करती है।')],
    dendrite: [T2('Dendrite', 'द्रुमिका (डेंड्राइट)'), T2('Short branching threads coming from the cell body.', 'कोशिका काय से निकले छोटे शाखित धागे।'), T2('It receives the message from the next neuron.', 'यह अगले न्यूरॉन से संदेश ग्रहण करती है।')],
    axon: [T2('Axon', 'ऐक्सॉन'), T2('One long thin fibre leaving the cell body.', 'कोशिका काय से निकला एक लंबा पतला तंतु।'), T2('It carries the message away to other cells.', 'यह संदेश को दूसरी कोशिकाओं तक ले जाता है।')],
    myelin: [T2('Myelin sheath', 'मायलिन आवरण'), T2('Pale sausage-like covers along the axon.', 'ऐक्सॉन पर चढ़े हल्के सॉसेज जैसे आवरण।'), T2('It insulates the axon and makes the message travel faster.', 'यह ऐक्सॉन को ढककर संदेश की गति बढ़ाता है।')],
    node: [T2('Node of Ranvier', 'रेनवियर का नोड'), T2('A tiny gap between two myelin covers.', 'दो मायलिन आवरणों के बीच छोटी दरार।'), T2('The message jumps from one node to the next.', 'संदेश एक नोड से अगले नोड पर कूदता है।')],
    bacillus: [T2('Bacillus (rod)', 'दंडाणु (छड़ आकार)'), T2('A short stick-shaped bacterium.', 'छोटी छड़ जैसा जीवाणु।'), T2('Rod bacteria such as Lactobacillus turn milk into curd.', 'लैक्टोबैसिलस जैसे छड़ जीवाणु दूध को दही बनाते हैं।')],
    coccus: [T2('Coccus (ball)', 'गोलाणु (गोल)'), T2('A tiny round bacterium, often in pairs or chains.', 'छोटा गोल जीवाणु, अक्सर जोड़ों या लड़ियों में।'), T2('Round bacteria can live alone, in pairs, in chains or in clusters.', 'गोल जीवाणु अकेले, जोड़ों, लड़ियों या गुच्छों में रह सकते हैं।')],
    spirillum: [T2('Spirillum (spiral)', 'सर्पिलाणु (सर्पिल)'), T2('A bacterium twisted like a spring.', 'स्प्रिंग की तरह मुड़ा जीवाणु।'), T2('Spiral bacteria have a twisted body and some cause disease.', 'सर्पिल जीवाणुओं का शरीर मुड़ा होता है और कुछ रोग फैलाते हैं।')],
    pyrenoid: [T2('Pyrenoid', 'पाइरेनॉइड'), T2('Small round dots along the green ribbon.', 'हरी पट्टी पर छोटे गोल बिंदु।'), T2('It makes and stores starch, the food of the alga.', 'यह स्टार्च बनाता और जमा करता है, जो शैवाल का भोजन है।')],
    ribbon: [T2('Spiral chloroplast', 'सर्पिल हरितलवक'), T2('A green ribbon twisting like a spring along the cell.', 'कोशिका में स्प्रिंग की तरह घूमती हरी पट्टी।'), T2('It makes food by photosynthesis.', 'यह प्रकाश-संश्लेषण से भोजन बनाता है।')],
  };

  // A slide lists its parts as [id, lowest lens (0 = 4x, 1 = 10x, 2 = 40x) at which the part can be told apart, optional look override].
  const partsOf = (S) => S.parts.map(([id, min, look]) => ({ id, min, n: PART[id][0], look: look || PART[id][1], job: PART[id][2] }));

  // ---------------------------------------------------------------- the lenses: 10x eyepiece; field-of-view diameters (micrometres) for a 1x slide scale
  const LENSES = [{ id: '4x', x: 4, fov: 4500, dof: 3.0, spread: 5.0, z: 0 }, { id: '10x', x: 10, fov: 1800, dof: 1.2, spread: 2.5, z: 0.7 }, { id: '40x', x: 40, fov: 450, dof: 0.35, spread: 1.0, z: -1.1 }];
  const LNAME = [T2('low power', 'कम क्षमता'), T2('medium power', 'मध्यम क्षमता'), T2('high power', 'उच्च क्षमता')];

  const SLIDES = {};
  const ORDER = ['onion-peel', 'cheek-cells', 'leaf-peel', 'stomata', 'blood-smear', 'amoeba', 'paramecium', 'yeast', 'bread-mould', 'pollen', 'root-tip', 'xylem', 'muscle', 'nerve', 'bacteria', 'spirogyra'];
  const TASKS = ['focus', 'identify', 'count', 'draw'];
  // helper used by the slides to describe themselves
  function slide(id, def) { def.id = id; def.sd = ORDER.indexOf(id) + 1; def.ext = def.ext || { x: 2250 * def.s, y: 2250 * def.s }; def.z0 = 32 + Math.round(h32(def.sd, 3, 9) * 36); SLIDES[id] = def; }

  // ---------------------------------------------------------------- small drawing helpers (all in micrometres; the renderer sets the transform)
  const ell = (c, x, y, rx, ry, rot) => { c.beginPath(); c.ellipse(x, y, Math.max(rx, 1e-6), Math.max(ry, 1e-6), rot || 0, 0, TAU); };
  const fs = (c, fill, stroke, lw) => { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } };
  const rr = (c, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const rg = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const poly = (c, pts, close) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); };
  const angd = (a, b) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const dots = (c, r, n, cx, cy, rad, size, col) => { c.fillStyle = col; for (let q = 0; q < n; q++) { const a = r() * TAU, d = Math.sqrt(r()) * rad; c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.5 + r()), 0, TAU); c.fill(); } };

  // ---------------------------------------------------------------- 1. onion peel
  slide('onion-peel', {
    s: 1, bg: '#F8F5E9', ext: { x: 1800, y: 900 }, tint: '#C9D9A0',
    name: T2('Onion peel', 'प्याज़ का छिलका'), kind: T2('Plant cells', 'पादप कोशिकाएँ'),
    parts: [['cell-wall', 0], ['nucleus', 2, T2('A small round spot pressed against the wall, with an even darker dot inside.', 'दीवार से सटा छोटा गोल धब्बा, जिसके भीतर और गहरा बिंदु है।')], ['cytoplasm', 2], ['vacuole', 2]],
    count: T2('cells', 'कोशिकाएँ'), core: ['cell-wall', 'nucleus', 'vacuole'],
    real: T2('One onion peel cell is about 0.25 mm long.', 'प्याज़ के छिलके की एक कोशिका लगभग 0.25 मिमी लंबी होती है।'),
    fact: T2('The thin skin of an onion scale is a single layer of cells, so light passes through it. A plant cell has a cell wall and a big vacuole. Onion cells have no chloroplasts because the bulb grows in the dark.', 'प्याज़ की परत की पतली झिल्ली कोशिकाओं की एक ही परत है, इसलिए प्रकाश आर-पार जाता है। पादप कोशिका में कोशिका भित्ति और बड़ी रिक्तिका होती है। प्याज़ की कोशिकाओं में हरितलवक नहीं होते, क्योंकि कंद अँधेरे में बढ़ता है।'),
    draw(E) {
      const { c } = E, H = 72;
      const ey = (j) => j * H + (h32(j, 5, 2) - 0.5) * 10;
      const ex = (i, j) => i * 270 + (((j % 2) + 2) % 2 ? 135 : 0) + (h32(i, j, 1) - 0.5) * 70;
      const j0 = Math.floor(E.y0 / H) - 1, j1 = Math.floor(E.y1 / H) + 1;
      const i0 = Math.floor((E.x0 - 140) / 270) - 1, i1 = Math.floor((E.x1 + 140) / 270) + 1;
      const cCyto = E.col('cyto', '#E4DEC0'), cVac = E.col('vac', '#F8F6EA'), cWall = E.col('wall', '#B3A978'), cNuc = E.col('nuc', '#C9C29B'), cNu2 = E.col('nuc', '#9E9665');
      const lwWall = E.w(3.2, 1.1);
      for (let j = j0; j <= j1; j++) {
        const ya = ey(j), yb = ey(j + 1);
        for (let i = i0; i <= i1; i++) {
          const xa = ex(i, j), xb = ex(i + 1, j), w = xb - xa, h = yb - ya;
          rr(c, xa, ya, w, h, 10); fs(c, cCyto);
          rr(c, xa + 7, ya + 7, w - 14, h - 14, 16); fs(c, cVac, 'rgba(120,115,80,0.25)', E.w(0.7, 0.5));
          rr(c, xa, ya, w, h, 10); c.strokeStyle = cWall; c.lineWidth = lwWall; c.stroke();
          const top = h32(i, j, 4) > 0.5, nx = xa + w * (0.2 + 0.6 * h32(i, j, 6)), ny = top ? ya + 8 : yb - 8;
          if (E.k * 8 > 1.4) {
            ell(c, nx, ny, 9.5, 7.5); fs(c, cNuc, cNu2, E.w(1, 0.8));
            if (E.k * 2.4 > 1.2) { c.beginPath(); c.arc(nx + 1, ny, 2.6, 0, TAU); fs(c, cNu2); }
          }
          if (E.near(xa + w / 2, ya + h / 2, 1.4 * w)) {
            E.cnt(xa + w / 2, ya + h / 2);
            E.mark('cell-wall', xa + w / 2, ya, 9); E.mark('nucleus', nx, ny, 10); E.mark('cytoplasm', xa + 3.5, ya + h / 2, 6); E.mark('vacuole', xa + w / 2, ya + h / 2, 24);
          }
        }
      }
    },
  });

  // ---------------------------------------------------------------- 2. cheek cells
  slide('cheek-cells', {
    s: 1, bg: '#F7F5F7', ext: { x: 2000, y: 1200 }, tint: '#D8D0DC',
    name: T2('Cheek cells', 'गाल की कोशिकाएँ'), kind: T2('Animal cells', 'जंतु कोशिकाएँ'),
    parts: [['membrane', 1], ['nucleus', 2, T2('A small round, darker spot near the middle of the flat cell.', 'चपटी कोशिका के बीच के पास छोटा गोल, गहरा धब्बा।')], ['cytoplasm', 2]],
    count: T2('cells', 'कोशिकाएँ'), core: ['membrane', 'nucleus', 'cytoplasm'],
    real: T2('A cheek cell is about 0.06 mm across and very thin.', 'गाल की एक कोशिका लगभग 0.06 मिमी चौड़ी और बहुत पतली होती है।'),
    fact: T2('Gently scraped from the inside of the cheek, these flat cells show an animal cell: a membrane, cytoplasm and a nucleus, but no cell wall and no big vacuole. Unstained, they are almost invisible.', 'गाल के भीतर से हल्के से खुरची ये चपटी कोशिकाएँ जंतु कोशिका दिखाती हैं: झिल्ली, कोशिकाद्रव्य और केंद्रक, पर कोई कोशिका भित्ति या बड़ी रिक्तिका नहीं। बिना रंग के ये लगभग दिखती ही नहीं।'),
    draw(E) {
      const { c } = E;
      const cF = E.col('cyto', '#E8E3EA'), cE = E.col('cyto', '#B5ACBC'), cN = E.col('nuc', '#B7ADC0'), cN2 = E.col('nuc', '#8E839A'), cG = E.col('cyto', '#CFC7D6');
      E.tiles(170, 80, (i, j, R, ox, oy) => {
        for (let q = 0; q < 2; q++) {
          if (R() > (q ? 0.35 : 0.88)) { R(); R(); R(); R(); R(); continue; }
          const x = ox + 20 + R() * 130, y = oy + 20 + R() * 130, Rb = 29 + R() * 12, p1 = R() * TAU, p2 = R() * TAU;
          const pts = [];
          for (let a = 0; a < 14; a++) { const t = (a / 14) * TAU; pts.push([x + Math.cos(t) * Rb * (1 + 0.16 * Math.sin(3 * t + p1) + 0.09 * Math.sin(5 * t + p2)), y + Math.sin(t) * Rb * 0.9 * (1 + 0.16 * Math.sin(3 * t + p1) + 0.09 * Math.sin(5 * t + p2))]); }
          c.globalAlpha = 0.9; poly(c, pts, true); c.lineJoin = 'round'; fs(c, cF, cE, E.w(1.3, 1)); c.globalAlpha = 1;
          if (E.k * Rb > 14) { c.strokeStyle = cG; c.lineWidth = E.w(0.8, 0.8); poly(c, [[x - Rb * 0.7, y + Rb * 0.2], [x - Rb * 0.2, y + Rb * 0.5], [x + Rb * 0.4, y + Rb * 0.45]], false); c.stroke(); }
          if (E.k > 0.45) dots(c, R, 36, x, y, Rb * 0.8, 0.5, cG);
          const nx = x + (R() - 0.5) * 8, ny = y + (R() - 0.5) * 7;
          if (E.k * 5 > 1.1) { ell(c, nx, ny, 5.4, 5, p1); fs(c, cN, cN2, E.w(0.8, 0.8)); }
          if (E.near(x, y, Rb * 1.4)) {
            E.cnt(x, y); const a = p1 + 1; E.mark('membrane', x + Math.cos(a) * Rb, y + Math.sin(a) * Rb * 0.9, 7); E.mark('nucleus', nx, ny, 6); E.mark('cytoplasm', x - Math.cos(a) * Rb * 0.55, y - Math.sin(a) * Rb * 0.5, 8);
          }
        }
      });
    },
  });

  // ---------------------------------------------------------------- 3 and 4. leaf epidermis (jigsaw cells made from a real Voronoi diagram) with stomata
  function epiderm(E, Cs, pSt, off, o) {
    const { c } = E, cache = {};
    const site = (i, j) => { const key = i + ',' + j; if (cache[key]) return cache[key]; const r = rngOf(60 + off, i, j); return (cache[key] = { x: (i + 0.5 + (r() - 0.5) * 0.66) * Cs, y: (j + 0.5 + (r() - 0.5) * 0.66) * Cs, st: r() < pSt, a: r() * Math.PI, o: r(), q: r() }); };
    const clip = (pts, s, n) => {
      const mx = (s.x + n.x) / 2, my = (s.y + n.y) / 2, dx = n.x - s.x, dy = n.y - s.y, out = [];
      for (let q = 0; q < pts.length; q++) {
        const p = pts[q], r = pts[(q + 1) % pts.length], dp = (p[0] - mx) * dx + (p[1] - my) * dy, dr = (r[0] - mx) * dx + (r[1] - my) * dy;
        if (dp <= 0) out.push(p);
        if ((dp <= 0) !== (dr <= 0)) { const t = dp / (dp - dr); out.push([p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t]); }
      }
      return out;
    };
    const i0 = Math.floor(E.x0 / Cs) - 1, i1 = Math.floor(E.x1 / Cs) + 1, j0 = Math.floor(E.y0 / Cs) - 1, j1 = Math.floor(E.y1 / Cs) + 1;
    const simple = Cs * E.k < 9;
    const cF = E.col('cyto', o.cell), cW = E.col('wall', o.wall), cN = E.col('nuc', o.nuc), cN2 = E.col('nuc', o.nuc2), lw = E.w(1.7, 1);
    const stomata = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const s = site(i, j);
      let pts = [[s.x - Cs * 1.4, s.y - Cs * 1.4], [s.x + Cs * 1.4, s.y - Cs * 1.4], [s.x + Cs * 1.4, s.y + Cs * 1.4], [s.x - Cs * 1.4, s.y + Cs * 1.4]];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) pts = clip(pts, s, site(i + di, j + dj));
      if (pts.length < 3) continue;
      if (!simple) {
        const w = [];
        for (let q = 0; q < pts.length; q++) {
          let a = pts[q], b = pts[(q + 1) % pts.length], flip = false;
          if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) { const t = a; a = b; b = t; flip = true; }
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
          const hh = h32(Math.round(a[0] * 4), Math.round(a[1] * 4), Math.round(b[0] * 4) + 31 * Math.round(b[1] * 4));
          const amp = Cs * 0.075 * (0.4 + hh), fr = 1 + Math.floor(hh * 7.3) % 2, ph = hh * TAU, seg = [];
          for (let m = 0; m < 6; m++) { const u = m / 6, d = amp * Math.sin(u * Math.PI * 2 * fr + ph) * Math.sin(u * Math.PI); seg.push([a[0] + (b[0] - a[0]) * u + nx * d, a[1] + (b[1] - a[1]) * u + ny * d]); }
          if (flip) seg.reverse();
          for (const p of seg) w.push(p);
        }
        pts = w;
      }
      poly(c, pts, true); c.lineJoin = 'round'; fs(c, cF, cW, lw);
      if (!s.st && E.k * 4.5 > 1.2) { ell(c, s.x + (s.o - 0.5) * 8, s.y + (s.q - 0.5) * 8, 4.8, 4.2, s.a); fs(c, cN, cN2, E.w(0.7, 0.7)); }
      if (s.st) stomata.push(s); else if (E.near(s.x, s.y, Cs * 1.2)) { if (o.countCells) E.cnt(s.x, s.y); E.mark('epidermal-cell', s.x + Cs * 0.2, s.y + Cs * 0.12, Cs * 0.3); if (!s.st) E.mark('nucleus', s.x + (s.o - 0.5) * 8, s.y + (s.q - 0.5) * 8, 6); }
    }
    for (const s of stomata) {
      const open = o.open(s), pw = open * 3.4, ca = Math.cos(s.a), sa = Math.sin(s.a);
      c.save(); c.translate(s.x, s.y); c.rotate(s.a);
      const gR = E.col('cyto', '#BBD9A2');
      ell(c, 0, 0, 17.5, 8 + pw); fs(c, rg(c, 0, 0, 1, 16, [[0, gR], [1, E.col('cyto', '#A5C98C')]]), E.col('wall', '#6E9A5A'), E.w(1.2, 1));
      if (E.k * 16 > 4) { c.beginPath(); c.ellipse(0, 0, 12.5, Math.max(pw, 0.05), 0, 0, TAU); fs(c, '#2C3A30'); c.strokeStyle = E.col('wall', '#4C6E42'); c.lineWidth = E.w(0.9, 0.8); if (pw < 0.4) { c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); } c.stroke(); }
      if (E.k * 16 > 5) { c.fillStyle = '#3F9E3D'; for (let m = 0; m < 6; m++) for (const sg of [-1, 1]) { const u = (m + 0.5) / 6 * 2 - 1; ell(c, u * 11.5, sg * (pw + 4.6 + 0.8 * Math.cos(u * 1.4)), 2.4, 1.6, 0); c.fill(); } }
      c.restore();
      if (E.near(s.x, s.y, 40)) {
        E.mark('stoma', s.x, s.y, Math.max(pw, 3) + 3); E.mark('guard-cell', s.x - sa * (pw + 5.5), s.y + ca * (pw + 5.5), 7); E.mark('chloroplast', s.x + ca * 7 + sa * (pw + 4.8), s.y + sa * 7 - ca * (pw + 4.8), 3.2);
        if (o.countStomata) E.cnt(s.x, s.y);
      }
    }
  }
  slide('leaf-peel', {
    s: 1, bg: '#F3F7EA', ext: { x: 1700, y: 1100 }, tint: '#B9DDA0',
    name: T2('Leaf peel (epidermis)', 'पत्ती का छिलका (बाह्यत्वचा)'), kind: T2('Plant tissue', 'पादप ऊतक'),
    parts: [['epidermal-cell', 1], ['nucleus', 2], ['guard-cell', 1], ['stoma', 1], ['chloroplast', 2, T2('Tiny green ovals inside the guard cells. The ordinary skin cells have none.', 'रक्षक कोशिकाओं में छोटे हरे अंडाकार। साधारण त्वचा कोशिकाओं में ये नहीं होते।')]],
    count: T2('skin cells', 'त्वचा कोशिकाएँ'), core: ['epidermal-cell', 'guard-cell', 'stoma'],
    real: T2('A skin cell is about 0.06 mm wide. A pore is about 0.02 mm long.', 'त्वचा की कोशिका लगभग 0.06 मिमी चौड़ी होती है। रंध्र लगभग 0.02 मिमी लंबा होता है।'),
    fact: T2('Peel a thin skin from the underside of a leaf. The skin cells fit together like a jigsaw with no gaps. Between them are a few tiny pores, the stomata, each with two green guard cells.', 'पत्ती के निचले तल से पतला छिलका उतारो। त्वचा की कोशिकाएँ बिना खाली जगह के पहेली की तरह जुड़ी होती हैं। बीच-बीच में कुछ छोटे छिद्र, रंध्र, होते हैं जिनमें दो हरी रक्षक कोशिकाएँ होती हैं।'),
    draw(E) { epiderm(E, 62, 0.11, 0, { cell: '#E8F0DA', wall: '#A8B58A', nuc: '#C4CDA8', nuc2: '#8F9B72', countCells: true, open: (s) => 0.35 + 0.65 * s.o }); },
  });
  slide('stomata', {
    s: 0.8, bg: '#F1F7E8', ext: { x: 1400, y: 900 }, tint: '#A6D58D',
    name: T2('Stomata', 'रंध्र'), kind: T2('Leaf surface', 'पत्ती की सतह'),
    parts: [['stoma', 1], ['guard-cell', 1], ['epidermal-cell', 1], ['chloroplast', 2]],
    count: T2('stomata', 'रंध्र'), core: ['stoma', 'guard-cell', 'chloroplast'],
    real: T2('One pore is about 0.02 mm long. A leaf can have over 100 pores in every square millimetre.', 'एक रंध्र लगभग 0.02 मिमी लंबा होता है। पत्ती के हर वर्ग मिलीमीटर में 100 से अधिक रंध्र हो सकते हैं।'),
    fact: T2('Stomata are the tiny doors of a leaf. When the guard cells are full of water they bend apart and the pore opens; when they lose water the pore closes. Some pores here are open and some are closed.', 'रंध्र पत्ती के छोटे दरवाज़े हैं। जब रक्षक कोशिकाएँ पानी से भरती हैं तो मुड़कर अलग होती हैं और छिद्र खुलता है; पानी घटने पर छिद्र बंद हो जाता है। यहाँ कुछ रंध्र खुले हैं और कुछ बंद।'),
    draw(E) { epiderm(E, 44, 0.3, 7, { cell: '#E9F1DC', wall: '#A8B58A', nuc: '#C4CDA8', nuc2: '#8F9B72', countStomata: true, open: (s) => (s.q < 0.28 ? s.q * 0.5 : 0.5 + 0.5 * s.o) }); },
  });

  // ---------------------------------------------------------------- 5. blood smear
  slide('blood-smear', {
    s: 0.12, bg: '#FAF1EE', ext: { x: 300, y: 300 }, tint: '#EDA9A6',
    name: T2('Human blood smear', 'मानव रक्त स्मीयर'), kind: T2('Blood cells', 'रक्त कोशिकाएँ'),
    parts: [['rbc', 0], ['wbc', 1], ['nucleus', 2, T2('The dark purple core of a white cell, in 2 to 5 lobes. Red cells have none.', 'श्वेत कणिका का गहरा बैंगनी केंद्र, 2 से 5 खंडों में। लाल कणिकाओं में नहीं होता।')], ['platelet', 2]],
    count: T2('red blood cells', 'लाल रुधिर कणिकाएँ'), core: ['rbc', 'wbc', 'platelet'],
    real: T2('A red blood cell is about 0.007 mm wide. White cells are about twice as big.', 'लाल रुधिर कणिका लगभग 0.007 मिमी चौड़ी होती है। श्वेत कणिकाएँ लगभग दुगनी बड़ी होती हैं।'),
    note: T2('Blood cells are tiny, so this slide is shown with a stronger objective, like the 100x oil lens in a lab. White cells are really much rarer than shown.', 'रक्त कोशिकाएँ बहुत छोटी हैं, इसलिए यह स्लाइड अधिक क्षमता वाले ऑब्जेक्टिव से दिखाई गई है, जैसे प्रयोगशाला का 100x ऑयल लेंस। असल में श्वेत कणिकाएँ दिखाए से बहुत कम होती हैं।'),
    fact: T2('Red cells are round discs thinner in the middle and have no nucleus. White cells are bigger and have a nucleus; without a stain you can hardly see it. Platelets are tiny pieces that help blood to clot.', 'लाल कणिकाएँ बीच में पतली गोल तश्तरियाँ होती हैं और उनमें केंद्रक नहीं होता। श्वेत कणिकाएँ बड़ी होती हैं और उनमें केंद्रक होता है; रंग के बिना वह मुश्किल से दिखता है। बिंबाणु छोटे टुकड़े हैं जो रक्त जमाने में मदद करते हैं।'),
    draw(E) {
      const { c } = E, T = 100;
      const e1 = E.col('cyto', '#E9A8A2', 0.5), e2 = E.col('cyto', '#F6D7D1', 0.5), e3 = E.col('cyto', '#D88E88', 0.5);
      E.tiles(T, 8, (i, j, R, ox, oy) => {
        for (let q = 0; q < 105; q++) {
          const x = ox + R() * T, y = oy + R() * T, r = 3.5 + R() * 0.5;
          if (E.k * r < 2.2) { c.fillStyle = e1; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
          else { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = rg(c, x, y, r * 0.15, r, [[0, e2], [0.45, e2], [0.8, e1], [1, e3]]); c.fill(); c.strokeStyle = e3; c.lineWidth = E.w(0.25, 0.6); c.stroke(); }
          if (E.near(x, y, 6)) { E.cnt(x, y); E.mark('rbc', x, y, 4); }
        }
      }, 0);
      const cN = E.col('nuc', '#CDBCD6'), cN2 = E.col('nuc', '#9F8AAE'), cY = E.col('cyto', '#E8DFEA'), cP = E.col('nuc', '#D3BFE0');
      E.tiles(T, 20, (i, j, R, ox, oy) => {
        let nw = Math.floor(T * T / 4200 + R());
        while (nw-- > 0) {
          const x = ox + R() * T, y = oy + R() * T, ty = R() < 0.65, r = ty ? 6.3 : 5.2, rot = R() * TAU;
          c.beginPath(); c.arc(x, y, r, 0, TAU); fs(c, cY, E.col('cyto', '#C4B5C9'), E.w(0.3, 0.6));
          if (ty) {
            const lobes = [[-3.1, -1.7], [0, 2.4], [3.2, -1.2], [2.2, 3.3]], pts = lobes.map(([a, b]) => [x + a * Math.cos(rot) - b * Math.sin(rot), y + a * Math.sin(rot) + b * Math.cos(rot)]);
            c.strokeStyle = cN2; c.lineWidth = E.w(0.7, 0.8); poly(c, pts, false); c.stroke();
            for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], 2.3, 0, TAU); fs(c, cN, cN2, E.w(0.3, 0.6)); }
          } else { c.beginPath(); c.arc(x, y, 3.9, 0, TAU); fs(c, cN, cN2, E.w(0.3, 0.6)); }
          if (E.near(x, y, 8)) { E.mark('wbc', x + (ty ? 0 : 4.2), y + (ty ? -5 : 0), 3); E.mark('nucleus', x, y, 3.4); }
        }
        let np = Math.floor(T * T / 1500 + R());
        while (np-- > 0) {
          const x = ox + R() * T, y = oy + R() * T, g = 2 + Math.floor(R() * 3);
          for (let m = 0; m < g; m++) { c.beginPath(); c.arc(x + (R() - 0.5) * 3, y + (R() - 0.5) * 3, 0.85 + R() * 0.45, 0, TAU); fs(c, cP); }
          if (E.near(x, y, 4)) E.mark('platelet', x, y, 2.2);
        }
      }, 500);
    },
  });

  // ---------------------------------------------------------------- 6. Amoeba (alive: it flows; a stain kills it and it stops)
  slide('amoeba', {
    s: 1, live: true, bg: '#EEF3EE', ext: { x: 2600, y: 2000 }, tint: '#C4D9C2',
    name: T2('Amoeba (pond water)', 'अमीबा (तालाब का पानी)'), kind: T2('Single-celled animal', 'एककोशिकीय जंतु'),
    parts: [['pseudopodium', 1], ['nucleus', 2, T2('A round, slightly darker disc inside the grainy cytoplasm. It is hard to see without a stain.', 'दानेदार कोशिकाद्रव्य के भीतर गोल, थोड़ी गहरी तश्तरी। रंग के बिना कठिनाई से दिखता है।')], ['contractile-vacuole', 2], ['food-vacuole', 2]],
    count: T2('amoebae', 'अमीबा'), core: ['pseudopodium', 'nucleus', 'contractile-vacuole'],
    real: T2('An Amoeba is about 0.3 mm to 0.5 mm long, just visible to sharp eyes.', 'अमीबा लगभग 0.3 से 0.5 मिमी लंबा होता है, तेज़ आँखों को मुश्किल से दिखता है।'),
    fact: T2('Amoeba is one cell that lives in pond water. It flows forward by pushing out pseudopodia. A stain kills it, so a stained Amoeba stops moving.', 'अमीबा तालाब के पानी में रहने वाली एक कोशिका है। यह पादाभ निकालकर आगे बहता है। रंग डालने से यह मर जाता है, इसलिए रंगा हुआ अमीबा हिलना बंद कर देता है।'),
    draw(E) {
      const { c, t } = E, T = 1700;
      const cE = E.col('cyto', '#E4EBD8'), cEd = E.col('cyto', '#A9B99C'), cEn = E.col('cyto', '#CAD6BA'), cGr = E.col('cyto', '#AAB89A'), cN = E.col('nuc', '#B3BDA0'), cN2 = E.col('nuc', '#808B6C'), cV = E.col('vac', '#F5FAF1');
      E.tiles(T, 600, (i, j, R, ox, oy) => {
        for (let q = 0; q < 10; q++) { c.fillStyle = 'rgba(120,130,110,0.25)'; c.beginPath(); c.arc(ox + R() * T, oy + R() * T, 2 + R() * 6, 0, TAU); c.fill(); }
        const has = R() < 0.8 || (i === 0 && j === 0), org = i === 0 && j === 0, hx = org ? 0 : ox + T * (0.25 + 0.5 * R()), hy = org ? 0 : oy + T * (0.25 + 0.5 * R()), ph = R() * TAU, sp = 0.6 + 0.8 * R(), base = 150 + R() * 35, ph2 = R() * TAU;
        if (!has) return;
        const x = hx + 110 * Math.sin(0.13 * t * sp + ph), y = hy + 90 * Math.cos(0.11 * t * sp + ph * 1.3);
        const pa = ph + 2.2 * Math.sin(0.17 * t * sp + ph), pb = pa + 2.5;
        const rad = (a) => base * (1 + 0.09 * Math.sin(2 * a + 0.4 * t * sp + ph) + 0.07 * Math.sin(3 * a - 0.3 * t * sp) + 0.04 * Math.sin(5 * a + 0.5 * t)) + 120 * Math.exp(-Math.pow(angd(a, pa), 2) / 0.1) * (0.7 + 0.3 * Math.sin(0.5 * t * sp + ph2)) + 70 * Math.exp(-Math.pow(angd(a, pb), 2) / 0.07) * (0.5 + 0.5 * Math.sin(0.33 * t + ph));
        const N = 90, outer = [], inner = [];
        for (let m = 0; m < N; m++) { const a = (m / N) * TAU, r = rad(a); outer.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); inner.push([x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8]); }
        c.lineJoin = 'round'; poly(c, outer, true); fs(c, cE, cEd, E.w(2, 1.1));
        poly(c, inner, true); fs(c, cEn);
        if (E.k > 0.12) { c.fillStyle = cGr; const gr = rng(i * 131 + j * 17 + 5); for (let m = 0; m < 90; m++) { const a = gr() * TAU + 0.04 * t, d = Math.sqrt(gr()) * base * 0.7; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6 + gr() * 2.4, 0, TAU); c.fill(); } }
        const q0 = ph + 0.07 * t;
        const nx = x + 38 * Math.cos(q0), ny = y + 38 * Math.sin(q0);
        ell(c, nx, ny, 23, 21); fs(c, cN, cN2, E.w(2, 1)); c.beginPath(); c.arc(nx + 3, ny, 8, 0, TAU); fs(c, cN2);
        const u = (0.06 * t + ph2) % 1, cr = u < 0.9 ? 5 + 24 * (u / 0.9) : 5 + 24 * Math.max(0, 1 - (u - 0.9) * 10), vx = x + 78 * Math.cos(q0 + 2.4), vy = y + 78 * Math.sin(q0 + 2.4);
        c.beginPath(); c.arc(vx, vy, cr, 0, TAU); fs(c, cV, cEd, E.w(1.5, 1));
        for (let m = 0; m < 3; m++) { const a = q0 + 0.9 + m * 2.1, d = 92 + 8 * m, fx = x + d * Math.cos(a), fy = y + d * Math.sin(a), fr = 13 + 3 * m; c.beginPath(); c.arc(fx, fy, fr, 0, TAU); fs(c, cV, cEd, E.w(1.3, 1)); c.beginPath(); c.arc(fx + 2, fy - 1, fr * 0.4, 0, TAU); fs(c, m === 1 ? '#6C8F4A' : '#8AA25A'); }
        if (E.near(x, y, base * 2)) {
          E.cnt(x, y); const pr = rad(pa);
          E.mark('pseudopodium', x + Math.cos(pa) * pr * 0.88, y + Math.sin(pa) * pr * 0.88, 45); E.mark('nucleus', nx, ny, 23); E.mark('contractile-vacuole', vx, vy, Math.max(cr, 14));
          E.mark('food-vacuole', x + 98 * Math.cos(q0 + 3.0), y + 98 * Math.sin(q0 + 3.0), 17);
        }
      });
    },
  });

  // ---------------------------------------------------------------- 7. Paramecium (alive: it swims with its cilia)
  slide('paramecium', {
    s: 1, live: true, bg: '#EFF4EE', ext: { x: 2600, y: 2000 }, tint: '#CBD9E6',
    name: T2('Paramecium (pond water)', 'पैरामीशियम (तालाब का पानी)'), kind: T2('Single-celled animal', 'एककोशिकीय जंतु'),
    parts: [['cilia', 2], ['oral-groove', 2], ['macronucleus', 2], ['contractile-vacuole', 2], ['food-vacuole', 2]],
    count: T2('Paramecia', 'पैरामीशियम'), core: ['cilia', 'macronucleus', 'contractile-vacuole'],
    real: T2('A Paramecium is about 0.2 mm long, shaped like a slipper.', 'पैरामीशियम लगभग 0.2 मिमी लंबा और चप्पल के आकार का होता है।'),
    fact: T2('Paramecium is a slipper-shaped single cell covered with cilia. Beating together, the cilia make it swim and sweep food into the oral groove. A stain stops it at once.', 'पैरामीशियम चप्पल के आकार की एककोशिकीय जीव है जो पक्ष्माभों से ढकी है। पक्ष्माभ साथ-साथ चलकर इसे तैराते हैं और भोजन को मुख खाँच में पहुँचाते हैं। रंग डालते ही यह रुक जाता है।'),
    draw(E) {
      const { c, t } = E, T = 1500, Ln = 215, Wd = 56;
      const hw = (u) => (Wd / 2) * (Math.pow(u, 0.75) * Math.pow(1 - u, 0.55)) / 0.413;
      const cB = E.col('cyto', '#E6ECDC'), cBd = E.col('cyto', '#A7B49C'), cCi = E.col('cyto', '#A9B49E'), cGr = E.col('cyto', '#B5C0A8'), cN = E.col('nuc', '#B4BDA2'), cN2 = E.col('nuc', '#808B6C'), cV = E.col('vac', '#F5FAF1');
      E.tiles(T, 520, (i, j, R, ox, oy) => {
        for (let q = 0; q < 14; q++) { c.fillStyle = 'rgba(120,130,110,0.22)'; c.beginPath(); c.arc(ox + R() * T, oy + R() * T, 1.5 + R() * 5, 0, TAU); c.fill(); }
        const org = i === 0 && j === 0, has = R() < 0.9 || org, hx = org ? 0 : ox + T * (0.3 + 0.4 * R()), hy = org ? 0 : oy + T * (0.3 + 0.4 * R()), ph = R() * TAU, sp = 0.7 + 0.5 * R();
        if (!has) return;
        const w = 0.07 * sp, ax = 400, ay = 250, h0x = org ? -ax * Math.cos(w * 3 + ph) : hx, h0y = org ? -ay * Math.sin(w * 3 + ph) : hy, x = h0x + ax * Math.cos(w * t + ph), y = h0y + ay * Math.sin(w * t + ph);
        const th = Math.atan2(ay * Math.cos(w * t + ph), -ax * Math.sin(w * t + ph)) + 0.1 * Math.sin(2.6 * t + ph);
        const ct = Math.cos(th), st = Math.sin(th), W = (lx, ly) => [x + lx * ct - ly * st, y + lx * st + ly * ct];
        c.save(); c.translate(x, y); c.rotate(th);
        const top = [], bot = [];
        for (let m = 0; m <= 36; m++) { const u = m / 36, lx = (0.5 - u) * Ln, h = hw(u); top.push([lx, -h]); bot.push([lx, h]); }
        if (E.k * 7 > 2) {
          c.strokeStyle = cCi; c.lineWidth = E.w(0.9, 0.9); c.beginPath();
          for (let m = 1; m < 36; m += 1) for (const sd of [-1, 1]) { const u = m / 36, lx = (0.5 - u) * Ln, h = hw(u) * sd, tilt = 0.55 * Math.sin(TAU * (u * 3 - t * 5.5)); c.moveTo(lx, h); c.lineTo(lx - 7 * Math.sin(tilt), h + sd * 7 * Math.cos(tilt)); }
          c.stroke();
        }
        poly(c, top.concat(bot.reverse()), true); fs(c, cB, cBd, E.w(1.6, 1));
        const rnd = rng(Math.imul(i, 7919) + j * 31 + 11);
        if (E.k > 0.12) { c.fillStyle = cGr; for (let m = 0; m < 70; m++) { const lx = (rnd() - 0.5) * Ln * 0.85, ly = (rnd() - 0.5) * Wd * 0.8; c.beginPath(); c.arc(lx, ly, 0.9 + rnd() * 1.3, 0, TAU); c.fill(); } }
        c.strokeStyle = cBd; c.lineWidth = E.w(1.8, 1); c.beginPath(); c.moveTo(0.3 * Ln, -hw(0.2) * 0.62); c.quadraticCurveTo(0.12 * Ln, -hw(0.4) * 0.1, -0.03 * Ln, hw(0.5) * 0.1); c.stroke();
        c.strokeStyle = cGr; c.lineWidth = E.w(1.6, 1); c.beginPath(); c.moveTo(0.3 * Ln, -hw(0.2) * 0.48); c.quadraticCurveTo(0.12 * Ln, 0, -0.03 * Ln, hw(0.5) * 0.2); c.stroke();
        const fvA = [];
        for (let m = 0; m < 5; m++) { const a = 0.6 * t + m * 1.3 + ph, lx = -0.1 * Ln + 40 * Math.cos(a) * 0.9, ly = 13 * Math.sin(a) + (m % 2 ? 5 : -5); fvA.push([lx, ly]); c.beginPath(); c.arc(lx, ly, 6 + (m % 3) * 1.4, 0, TAU); fs(c, cV, cBd, E.w(0.9, 0.8)); c.beginPath(); c.arc(lx + 1, ly, 2.1, 0, TAU); fs(c, '#8AA25A'); }
        c.save(); c.translate(0.02 * Ln, 0.0); c.rotate(-0.15); ell(c, 0, 0, 25, 11); fs(c, cN, cN2, E.w(1.5, 1)); c.restore();
        c.beginPath(); c.arc(0.1 * Ln, -12, 3.4, 0, TAU); fs(c, cN2);
        const cvs = [];
        for (const [ox2, pp] of [[0.3, 0], [-0.32, 0.5]]) {
          const u = (0.18 * t + pp + ph) % 1, rr2 = u < 0.88 ? 2 + 9 * (u / 0.88) : 2 + 9 * Math.max(0, 1 - (u - 0.88) * 8), lx = ox2 * Ln, ly = 15 * (ox2 > 0 ? 1 : -0.3);
          c.strokeStyle = cBd; c.lineWidth = E.w(0.7, 0.7); c.beginPath(); for (let m = 0; m < 7; m++) { const a = (m / 7) * TAU; c.moveTo(lx + Math.cos(a) * rr2, ly + Math.sin(a) * rr2); c.lineTo(lx + Math.cos(a) * (rr2 + 11), ly + Math.sin(a) * (rr2 + 11)); } c.stroke();
          c.beginPath(); c.arc(lx, ly, rr2, 0, TAU); fs(c, cV, cBd, E.w(1, 0.8)); cvs.push([lx, ly]);
        }
        c.restore();
        if (E.near(x, y, Ln)) {
          E.cnt(x, y); const m1 = W(0.02 * Ln, 0), g1 = W(0.12 * Ln, -hw(0.4) * 0.32), cv = W(cvs[0][0], cvs[0][1]), fv = W(fvA[1][0], fvA[1][1]), ci = W(-0.18 * Ln, hw(0.72) + 4);
          E.mark('macronucleus', m1[0], m1[1], 24); E.mark('oral-groove', g1[0], g1[1], 14); E.mark('contractile-vacuole', cv[0], cv[1], 14); E.mark('food-vacuole', fv[0], fv[1], 9); E.mark('cilia', ci[0], ci[1], 12);
        }
      });
    },
  });

  // ---------------------------------------------------------------- 8. yeast (living cells take up methylene blue and turn it colourless; dead cells stay blue)
  slide('yeast', {
    s: 0.1, bg: '#F6F4EA', ext: { x: 250, y: 250 }, tint: '#E5E1B5',
    name: T2('Yeast', 'यीस्ट (ख़मीर)'), kind: T2('Fungus cells', 'कवक कोशिकाएँ'),
    parts: [['cell-wall', 1], ['bud', 1], ['nucleus', 2, T2('A small dot beside the big vacuole. It is easier to see after a stain.', 'बड़ी रिक्तिका के पास छोटा बिंदु। रंग के बाद आसानी से दिखता है।')], ['vacuole', 2]],
    count: T2('yeast cells', 'यीस्ट कोशिकाएँ'), core: ['cell-wall', 'bud', 'vacuole'],
    real: T2('A yeast cell is about 0.006 mm wide, smaller than a cheek cell.', 'यीस्ट की कोशिका लगभग 0.006 मिमी चौड़ी होती है, गाल की कोशिका से छोटी।'),
    note: T2('Yeast cells are tiny, so the picture uses a stronger objective than the 40x lens, like the oil lens in a lab.', 'यीस्ट कोशिकाएँ बहुत छोटी हैं, इसलिए चित्र 40x लेंस से अधिक क्षमता वाले ऑब्जेक्टिव से दिखाया गया है, जैसे प्रयोगशाला का ऑयल लेंस।'),
    fact: T2('Yeast is a fungus made of one oval cell. A new cell grows out as a small bud and then breaks off. This is budding. Living yeast removes methylene blue, so only the dead cells stay blue.', 'यीस्ट एक अंडाकार कोशिका वाला कवक है। नई कोशिका छोटी कली के रूप में निकलती है और फिर अलग हो जाती है। इसे मुकुलन कहते हैं। जीवित यीस्ट मेथिलीन ब्लू का रंग हटा देता है, इसलिए केवल मृत कोशिकाएँ नीली रहती हैं।'),
    sx: { 'methylene-blue': T2('Living yeast cells remove the blue colour, so most cells stay pale. Only the dead cells stay blue.', 'जीवित यीस्ट कोशिकाएँ नीला रंग हटा देती हैं, इसलिए अधिकतर कोशिकाएँ हल्की रहती हैं। केवल मृत कोशिकाएँ नीली रहती हैं।') },
    draw(E) {
      const { c } = E, T = 70, mb = E.stainNow === 'methylene-blue' || E.stainPrev === 'methylene-blue';
      E.tiles(T, 8, (i, j, R, ox, oy) => {
        for (let q = 0; q < 34; q++) {
          const x = ox + R() * T, y = oy + R() * T, r = 2.5 + R() * 0.9, a = R() * TAU, hasBud = R() < 0.45, ba = R() * TAU, dead = R() < 0.14, chain = R() < 0.2, ry = r * (0.82 + 0.15 * R());
          const m = mb ? (dead ? 1 : 0.04) : 1;
          const fill = E.col('bact', '#E4E6D4', m), edge = E.col('wall', '#9FA68C', m), vacC = E.col('vac', '#F4F7EC'), nC = E.col('nuc', '#B9C0A8', mb ? m : 1);
          const drawCell = (cx, cy, rx, ryy, ang) => { ell(c, cx, cy, rx, ryy, ang); fs(c, fill, edge, E.w(0.45, 1)); };
          drawCell(x, y, r, ry, a);
          let bx = 0, by = 0, br = 0;
          if (hasBud) { br = r * (0.3 + 0.2 * R()); bx = x + Math.cos(ba) * (r + br * 0.55); by = y + Math.sin(ba) * (r + br * 0.55); drawCell(bx, by, br, br * 0.92, ba); if (chain) drawCell(bx + Math.cos(ba + 0.4) * br * 1.5, by + Math.sin(ba + 0.4) * br * 1.5, br * 0.6, br * 0.55, ba); }
          if (E.k * r > 12) {
            c.beginPath(); c.arc(x + r * 0.22, y + r * 0.18, r * 0.42, 0, TAU); fs(c, vacC, edge, E.w(0.2, 0.7));
            c.beginPath(); c.arc(x - r * 0.4, y - r * 0.3, r * 0.2, 0, TAU); fs(c, nC);
            c.fillStyle = E.col('cyto', '#C2C8B0', mb ? m : 1); for (let p = 0; p < 7; p++) { c.beginPath(); c.arc(x + (R() - 0.5) * r * 1.5, y + (R() - 0.5) * r * 1.2, 0.18, 0, TAU); c.fill(); }
          } else { R(); R(); R(); R(); R(); R(); R(); R(); R(); R(); R(); R(); R(); R(); }
          if (E.near(x, y, 10)) {
            E.cnt(x, y); E.mark('cell-wall', x + Math.cos(a) * r, y + Math.sin(a) * ry, 1.4); E.mark('vacuole', x + r * 0.22, y + r * 0.18, r * 0.42); E.mark('nucleus', x - r * 0.4, y - r * 0.3, r * 0.3);
            if (hasBud) E.mark('bud', bx, by, br * 1.1);
          }
        }
      }, 0);
    },
  });

  // ---------------------------------------------------------------- 9. bread mould (Rhizopus): aseptate hyphae, sporangiophores, sporangia, spores
  slide('bread-mould', {
    s: 1, bg: '#F5F3EA', ext: { x: 2400, y: 1800 }, tint: '#CFCBBA',
    name: T2('Bread mould (Rhizopus)', 'ब्रेड की फफूँद (राइज़ोपस)'), kind: T2('Fungus', 'कवक'),
    parts: [['hypha', 0], ['sporangiophore', 0], ['sporangium', 0], ['spores', 2]],
    count: T2('spore cases (sporangia)', 'बीजाणुधानियाँ'), core: ['hypha', 'sporangium', 'spores'],
    real: T2('A spore case is about 0.15 mm wide. A hypha is thinner than a hair, about 0.01 mm.', 'बीजाणुधानी लगभग 0.15 मिमी चौड़ी होती है। कवकतंतु बाल से भी पतला, लगभग 0.01 मिमी होता है।'),
    fact: T2('A mould is a fungus. Its body is a web of fine threads called hyphae that spread over food and absorb it. Upright stalks carry round spore cases. When a case breaks, thousands of spores float away.', 'फफूँद एक कवक है। इसका शरीर कवकतंतुओं (हाइफ़ा) के महीन धागों का जाल है जो भोजन पर फैलकर उसे सोखता है। सीधे डंठल गोल बीजाणुधानी उठाते हैं। टूटने पर हज़ारों बीजाणु हवा में उड़ जाते हैं।'),
    draw(E) {
      const { c } = E, T = 700;
      const cH = E.col('cyto', '#CDD3BD'), cI = E.col('cyto', '#EEF0E2'), cNu = E.col('nuc', '#A9B393'), lw = E.w(10, 1.3);
      const hypha = (pts) => { c.lineCap = 'round'; c.lineJoin = 'round'; poly(c, pts, false); c.strokeStyle = cH; c.lineWidth = lw; c.stroke(); c.strokeStyle = cI; c.lineWidth = lw * 0.62; c.stroke(); };
      const walk = (R, x, y, a, len, depth, out) => {
        const pts = [[x, y]]; let n = Math.ceil(len / 60);
        for (let m = 0; m < n; m++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 60; y += Math.sin(a) * 60; pts.push([x, y]); if (depth < 1 && R() < 0.2) out.push([x, y, a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5), 120 + R() * 220]); }
        return pts;
      };
      E.tiles(T, 800, (i, j, R, ox, oy) => {
        for (let q = 0; q < 5; q++) {
          const out = [], pts = walk(R, ox + R() * T, oy + R() * T, R() * TAU, 450 + R() * 450, 0, out);
          hypha(pts); out.forEach((b) => hypha(walk(R, b[0], b[1], b[2], b[3], 1, [])));
          if (E.k > 0.5) { c.fillStyle = cNu; for (let m = 1; m < pts.length; m++) { c.beginPath(); c.arc(pts[m][0] + 2, pts[m][1] - 1, 2.4, 0, TAU); c.fill(); } }
        }
      });
      E.tiles(T, 400, (i, j, R, ox, oy) => {
        const n = R() < 0.55 ? 1 : 0, bx = ox + R() * T, by = oy + R() * T, a = R() * TAU, len = 110 + R() * 90, rad = 62 + R() * 28, burst = R() < 0.35, sx = bx + Math.cos(a) * len, sy = by + Math.sin(a) * len, rnd = rng(i * 57 + j * 91 + 3);
        if (!n) return;
        c.lineCap = 'round'; c.strokeStyle = E.col('cyto', '#B8B8A0'); c.lineWidth = E.w(17, 1.5); c.beginPath(); c.moveTo(bx, by); c.lineTo(sx, sy); c.stroke();
        c.strokeStyle = E.col('cyto', '#E3E3D0'); c.lineWidth = E.w(10, 1); c.beginPath(); c.moveTo(bx, by); c.lineTo(sx, sy); c.stroke();
        if (!burst) {
          c.beginPath(); c.arc(sx, sy, rad, 0, TAU); fs(c, rg(c, sx - rad * 0.3, sy - rad * 0.3, rad * 0.1, rad * 1.05, [[0, E.col('cyto', '#7C7A66')], [0.6, E.col('cyto', '#4A483B')], [1, E.col('cyto', '#2A2820')]]), E.col('cyto', '#1D1C16'), E.w(1.5, 1));
          if (E.k * rad > 14) { c.fillStyle = 'rgba(210,205,170,0.35)'; for (let m = 0; m < 40; m++) { const aa = rnd() * TAU, d = Math.sqrt(rnd()) * rad * 0.9; c.beginPath(); c.arc(sx + Math.cos(aa) * d, sy + Math.sin(aa) * d, 3.5, 0, TAU); c.fill(); } }
        } else {
          c.beginPath(); for (let m = 0; m <= 18; m++) { const aa = (m / 18) * TAU, rr2 = rad * (0.5 + 0.25 * rnd()); m ? c.lineTo(sx + Math.cos(aa) * rr2, sy + Math.sin(aa) * rr2) : c.moveTo(sx + Math.cos(aa) * rr2, sy + Math.sin(aa) * rr2); } c.closePath(); fs(c, E.col('cyto', '#85836F'), E.col('cyto', '#3C3A2F'), E.w(1.2, 1));
          c.beginPath(); c.arc(sx, sy, rad * 0.22, 0, TAU); fs(c, E.col('cyto', '#D9D8C2'), E.col('cyto', '#9A9984'), E.w(1, 1));
          const sc = E.col('cyto', '#3F3C30'); for (let m = 0; m < 70; m++) { const aa = rnd() * TAU, d = rad * 0.45 + rnd() * rad * 1.6; ell(c, sx + Math.cos(aa) * d, sy + Math.sin(aa) * d, 4.2, 3.4, rnd() * TAU); fs(c, sc, '#26241C', E.w(0.5, 0.5)); }
        }
        if (E.near(sx, sy, rad * 2.5)) {
          E.cnt(sx, sy); E.mark(burst ? 'spores' : 'sporangium', sx + (burst ? rad * 0.8 : 0), sy + (burst ? rad * 0.5 : 0), rad * (burst ? 0.5 : 0.9)); E.mark('sporangiophore', bx + (sx - bx) * 0.4, by + (sy - by) * 0.4, 14);
          E.mark('hypha', bx, by, 16); if (burst) E.mark('sporangium', sx, sy, rad * 0.5);
        }
      }, 900);
    },
  });

  // ---------------------------------------------------------------- 10. pollen grains (spiny and smooth types, some with a pollen tube)
  slide('pollen', {
    s: 0.5, bg: '#FAF6E8', ext: { x: 1100, y: 800 }, tint: '#F0D36A',
    name: T2('Pollen grains', 'परागकण'), kind: T2('Flower', 'पुष्प'),
    parts: [['pollen-grain', 0], ['exine', 2], ['germ-pore', 2], ['pollen-tube', 1]],
    count: T2('pollen grains', 'परागकण'), core: ['pollen-grain', 'exine', 'pollen-tube'],
    real: T2('Pollen grains are about 0.03 to 0.05 mm wide. Each plant species has its own shape.', 'परागकण लगभग 0.03 से 0.05 मिमी चौड़े होते हैं। हर पौधे की प्रजाति का अपना आकार होता है।'),
    fact: T2('Pollen grains are made in the anther of a flower. Some are spiky, some smooth with furrows. In sugar solution some grow a pollen tube through a germ pore, as they do on a stigma.', 'परागकण फूल के परागकोश में बनते हैं। कुछ काँटेदार होते हैं, कुछ चिकने और खाँचेदार। शर्करा के घोल में कुछ जनन छिद्र से परागनलिका उगाते हैं, जैसा वे वर्तिकाग्र पर करते हैं।'),
    draw(E) {
      const { c } = E, T = 130;
      const tubeF = E.col('cyto', '#EFE0A8'), tubeE = E.col('lign', '#B8963A');
      const grains = [];
      E.tiles(T, 450, (i, j, R, ox, oy) => {
        const org = i === 0 && j === 0, has = R() < 0.62 || org, x = org ? -14 : ox + 15 + R() * (T - 30), y = org ? 6 : oy + 15 + R() * (T - 30), spiny = org || R() < 0.6, rot = R() * TAU, rad = 19 + R() * 4, tube = !org && R() < 0.28, ta = R() * TAU, tl = 120 + R() * 300, ph = R() * TAU;
        if (!has) return;
        if (tube) {
          const pts = [[x, y]]; let tx = x + Math.cos(ta) * rad, ty = y + Math.sin(ta) * rad;
          for (let m = 0; m <= 14; m++) { const u = m / 14; pts.push([tx + Math.cos(ta) * tl * u + Math.cos(ta + Math.PI / 2) * 14 * Math.sin(u * 5 + ph) * u, ty + Math.sin(ta) * tl * u + Math.sin(ta + Math.PI / 2) * 14 * Math.sin(u * 5 + ph) * u]); }
          c.lineCap = 'round'; c.lineJoin = 'round'; poly(c, pts, false); c.strokeStyle = tubeE; c.lineWidth = E.w(5, 1.1); c.stroke(); c.strokeStyle = tubeF; c.lineWidth = E.w(3, 0.6); c.stroke();
          if (E.near(pts[8][0], pts[8][1], 10)) E.mark('pollen-tube', pts[8][0], pts[8][1], 7);
        }
        grains.push({ x, y, spiny, rot, rad, ta, tube });
      });
      for (const g of grains) {
        const { x, y, rot } = g, ex = E.col('lign', '#E2BC52'), ex2 = E.col('lign', '#B98C1E'), ins = E.col('cyto', '#F2DC8E'), pore = E.col('cyto', '#F8EFC6');
        if (g.spiny) {
          const r = g.rad;
          if (E.k * r > 6) { c.strokeStyle = ex2; c.lineWidth = E.w(1.3, 0.8); c.beginPath(); for (let m = 0; m < 30; m++) { const a = (m / 30) * TAU + rot; c.moveTo(x + Math.cos(a) * (r - 0.5), y + Math.sin(a) * (r - 0.5)); c.lineTo(x + Math.cos(a) * (r + 4.5), y + Math.sin(a) * (r + 4.5)); } c.stroke(); }
          c.beginPath(); c.arc(x, y, r, 0, TAU); fs(c, rg(c, x - r * 0.3, y - r * 0.3, r * 0.1, r * 1.1, [[0, '#FFF0B0'], [0.5, ex], [1, ex2]]), ex2, E.w(1.4, 1));
          c.beginPath(); c.arc(x, y, r * 0.74, 0, TAU); fs(c, ins, ex2, E.w(0.6, 0.6));
          if (E.k * r > 8) for (let m = 0; m < 3; m++) { const a = rot + m * 2.1, d = r * 0.5; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 3.6, 0, TAU); fs(c, pore, ex2, E.w(0.7, 0.7)); }
          if (E.near(x, y, 40)) { E.cnt(x, y); E.mark('pollen-grain', x, y, r * 0.5); E.mark('exine', x + Math.cos(rot + 0.5) * (r + 1.5), y + Math.sin(rot + 0.5) * (r + 1.5), 6); E.mark('germ-pore', x + Math.cos(rot) * r * 0.5, y + Math.sin(rot) * r * 0.45, 4.4); }
        } else {
          const rx = g.rad + 1, ry = g.rad * 0.7;
          c.save(); c.translate(x, y); c.rotate(rot);
          ell(c, 0, 0, rx, ry); fs(c, rg(c, -rx * 0.3, -ry * 0.3, 2, rx * 1.2, [[0, '#FFF3C0'], [0.5, E.col('lign', '#EACB6C')], [1, ex2]]), ex2, E.w(1.2, 1));
          if (E.k * rx > 7) { c.strokeStyle = ex2; c.lineWidth = E.w(0.9, 0.7); c.beginPath(); for (const o of [-0.5, 0, 0.5]) { c.moveTo(-rx * 0.92, o * ry * 0.9); c.quadraticCurveTo(0, o * ry * 1.2, rx * 0.92, o * ry * 0.9); } c.stroke(); c.beginPath(); c.arc(rx * 0.7, 0, 2.4, 0, TAU); fs(c, pore, ex2, E.w(0.6, 0.6)); }
          c.restore();
          if (E.near(x, y, 40)) { E.cnt(x, y); E.mark('pollen-grain', x, y, ry * 0.7); E.mark('exine', x + Math.cos(rot + 1.4) * rx * 0.2 - Math.sin(rot) * ry * 0.95, y + Math.sin(rot) * rx * 0.2 + Math.cos(rot) * ry * 0.95, 6); E.mark('germ-pore', x + Math.cos(rot) * rx * 0.7, y + Math.sin(rot) * rx * 0.7, 4.4); }
        }
      }
    },
  });

  // ---------------------------------------------------------------- 11. onion root tip (squash): interphase and the four stages of mitosis (onion has 16 chromosomes)
  slide('root-tip', {
    s: 0.25, bg: '#F8F1F4', ext: { x: 450, y: 350 }, tint: '#E3A6BC',
    name: T2('Onion root tip', 'प्याज़ की जड़ का सिरा'), kind: T2('Dividing cells', 'विभाजित होती कोशिकाएँ'),
    parts: [['cell-wall', 1], ['nucleus', 2, T2('A round nucleus with a smooth edge and a dot inside. The cell is not dividing.', 'चिकने किनारे और भीतर बिंदु वाला गोल केंद्रक। कोशिका विभाजित नहीं हो रही।')], ['prophase', 2], ['metaphase', 2], ['anaphase', 2], ['telophase', 2]],
    count: T2('cells', 'कोशिकाएँ'), core: ['nucleus', 'metaphase', 'anaphase'],
    real: T2('A root tip cell is about 0.02 mm across. An onion cell has 16 chromosomes.', 'जड़ के सिरे की कोशिका लगभग 0.02 मिमी की होती है। प्याज़ की कोशिका में 16 गुणसूत्र होते हैं।'),
    note: T2('Root tip cells are small, so the picture uses a stronger objective than the 40x lens. Here about 1 cell in 5 is dividing.', 'जड़ के सिरे की कोशिकाएँ छोटी हैं, इसलिए चित्र 40x लेंस से अधिक क्षमता वाले ऑब्जेक्टिव से दिखाया गया है। यहाँ लगभग हर 5 में से 1 कोशिका विभाजित हो रही है।'),
    fact: T2('The tip of a root keeps growing because its cells keep dividing. Dividing goes through four stages: prophase, metaphase, anaphase and telophase. Safranin colours the chromosomes red so you can count them.', 'जड़ का सिरा बढ़ता रहता है क्योंकि उसकी कोशिकाएँ बार-बार विभाजित होती हैं। विभाजन के चार चरण हैं: पूर्वावस्था, मध्यावस्था, पश्चावस्था और अंत्यावस्था। सैफ़्रेनिन गुणसूत्रों को लाल रंगता है ताकि उन्हें गिना जा सके।'),
    draw(E) {
      const { c } = E, CW = 20, CH = 28;
      const cF = E.col('cyto', '#F1E7ED'), cWl = E.col('wall', '#C8B7C3'), cN = E.col('nuc', '#D5C4D5'), cN2 = E.col('nuc', '#AA94AB'), cCh = E.col('chr', '#C0A8C2'), cSp = E.col('cyto', '#D8C9D6');
      const ex = (i) => i * CW + (h32(i, 0, 7) - 0.5) * 4, ey = (i, j) => j * CH + h32(i, 1, 2) * CH + (h32(i, j, 8) - 0.5) * 4;
      const i0 = Math.floor(E.x0 / CW) - 1, i1 = Math.floor(E.x1 / CW) + 1;
      for (let i = i0; i <= i1; i++) {
        const j0 = Math.floor((E.y0 - CH) / CH) - 1, j1 = Math.floor(E.y1 / CH) + 1;
        for (let j = j0; j <= j1; j++) {
          const xa = ex(i), xb = ex(i + 1), ya = ey(i, j), yb = ey(i, j + 1), w = xb - xa, h = yb - ya, mx = xa + w / 2, my = ya + h / 2;
          rr(c, xa, ya, w, h, 3); fs(c, cF, cWl, E.w(1.1, 0.9));
          const u = h32(i, j, 11), o = (h32(i, j, 12) - 0.5) * 0.6, hr = E.k * 6 > 1.5;
          const rnd = rng(i * 977 + j * 13 + 1);
          let part = 'nucleus';
          c.save(); c.translate(mx, my); c.rotate(o);
          if (u < 0.8) {
            ell(c, 0, 0, 6.2, 6.4); fs(c, cN, cN2, E.w(0.8, 0.8)); if (hr) { c.beginPath(); c.arc(1, -1, 1.8, 0, TAU); fs(c, E.col('chr', '#8E7490')); c.fillStyle = cCh; for (let m = 0; m < 10; m++) { c.beginPath(); c.arc((rnd() - 0.5) * 8, (rnd() - 0.5) * 8, 0.7, 0, TAU); c.fill(); } }
          } else if (u < 0.85) {
            part = 'prophase'; ell(c, 0, 0, 6.8, 6.8); fs(c, cN, cN2, E.w(0.8, 0.8));
            c.strokeStyle = cCh; c.lineWidth = E.w(1.1, 0.8); c.lineCap = 'round'; c.beginPath(); for (let m = 0; m < 16; m++) { const a = rnd() * TAU, d = rnd() * 4.2, x1 = Math.cos(a) * d, y1 = Math.sin(a) * d, a2 = rnd() * TAU; c.moveTo(x1, y1); c.quadraticCurveTo(x1 + Math.cos(a2) * 3, y1 + Math.sin(a2) * 3, x1 + Math.cos(a2 + 1) * 3.5, y1 + Math.sin(a2 + 1) * 3.5); } c.stroke();
          } else if (u < 0.9) {
            part = 'metaphase'; c.strokeStyle = cSp; c.lineWidth = E.w(0.4, 0.5); c.beginPath(); for (const sg of [-1, 1]) for (let m = -3; m <= 3; m++) { c.moveTo(m * 1.8, 0); c.lineTo(m * 0.5, sg * 11); } c.stroke();
            c.strokeStyle = cCh; c.lineWidth = E.w(1.5, 1); c.lineCap = 'round'; c.beginPath(); for (let m = 0; m < 16; m++) { const px = -7 + (m / 15) * 14, py = (rnd() - 0.5) * 2.2, a = (rnd() - 0.5) * 1.3; c.moveTo(px - Math.sin(a) * 1.8, py - Math.cos(a) * 1.8); c.lineTo(px + Math.sin(a) * 1.8, py + Math.cos(a) * 1.8); } c.stroke();
          } else if (u < 0.94) {
            part = 'anaphase'; c.strokeStyle = cSp; c.lineWidth = E.w(0.4, 0.5); c.beginPath(); for (const sg of [-1, 1]) for (let m = -3; m <= 3; m++) { c.moveTo(m * 0.6, sg * 4.2); c.lineTo(m * 0.9, sg * 11.5); } c.stroke();
            c.strokeStyle = cCh; c.lineWidth = E.w(1.3, 1); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); for (const sg of [-1, 1]) for (let m = 0; m < 16; m++) { const px = -6.5 + (m / 15) * 13, py = sg * (4.4 + rnd() * 0.8); c.moveTo(px - 1.1, py + sg * 2.2); c.lineTo(px, py); c.lineTo(px + 1.1, py + sg * 2.2); } c.stroke();
          } else {
            part = 'telophase'; for (const sg of [-1, 1]) { ell(c, 0, sg * 7.3, 6.2, 2.9); fs(c, cCh, cN2, E.w(0.7, 0.7)); }
            c.strokeStyle = cWl; c.lineWidth = E.w(1.1, 0.8); c.setLineDash([2.5, 1.4]); c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); c.setLineDash([]);
          }
          c.restore();
          if (E.near(mx, my, 20)) { E.cnt(mx, my); E.mark(part, mx, my, 8); E.mark('cell-wall', mx, ya + 1, 4); }
        }
      }
    },
  });

  // ---------------------------------------------------------------- 12. xylem (long section of a stem, safranin colours lignin red)
  const xcols = (() => {
    let cols = null;
    return () => {
      if (cols) return cols;
      cols = []; const r = rng(4242); let x = -1800, q = 0;
      while (x < 1800) { const u = r(); let type, w; if (u < 0.36) { type = 'v'; w = 50 + r() * 24; } else if (u < 0.55) { type = 'f'; w = 11 + r() * 5; } else { type = 'p'; w = 30 + r() * 12; } cols.push({ x, w, type, k: r(), q: q++ }); x += w + (type === 'p' ? 0 : 1.5); }
      return cols;
    };
  })();
  slide('xylem', {
    s: 0.6, bg: '#F8F4E6', ext: { x: 1300, y: 1500 }, tint: '#E86A7E',
    name: T2('Xylem (stem, long section)', 'जाइलम (तना, लंबाई में काट)'), kind: T2('Plant tissue', 'पादप ऊतक'),
    parts: [['vessel', 0], ['lignin', 2, T2('The hard spiral, ring or pitted band on the wall. It turns bright red with safranin.', 'दीवार पर कठोर सर्पिल, छल्ला या गड्ढेदार पट्टी। सैफ़्रेनिन से यह चटक लाल हो जाती है।')], ['parenchyma', 1], ['nucleus', 2, T2('A small oval spot in the centre of a living parenchyma cell. Vessels have none, because they are dead.', 'जीवित मृदूतक कोशिका के बीच का छोटा अंडाकार धब्बा। वाहिकाओं में नहीं होता, क्योंकि वे मृत हैं।')], ['fibre', 1]],
    count: T2('vessels crossing the middle line', 'बीच की रेखा को काटने वाली वाहिकाएँ'), core: ['vessel', 'lignin', 'parenchyma'],
    real: T2('A vessel is about 0.06 mm wide but can be many centimetres long.', 'वाहिका लगभग 0.06 मिमी चौड़ी होती है, पर कई सेंटीमीटर लंबी हो सकती है।'),
    fact: T2('Xylem carries water up from the roots. Its vessels are dead, empty tubes with hard lignin on the wall in rings, spirals or pits. Safranin stains lignin red, so the tubes stand out from the soft cells around them.', 'जाइलम जड़ों से पानी ऊपर ले जाता है। इसकी वाहिकाएँ मृत, खाली नलियाँ हैं जिनकी दीवार पर कठोर लिग्निन छल्लों, सर्पिलों या गड्ढों में होता है। सैफ़्रेनिन लिग्निन को लाल रंगता है, इसलिए नलियाँ आसपास की कोमल कोशिकाओं से अलग दिखती हैं।'),
    sx: { safranin: T2('Safranin turns the lignin red, so the hard bands of the vessels shine out.', 'सैफ़्रेनिन लिग्निन को लाल कर देता है, इसलिए वाहिकाओं की कठोर पट्टियाँ चमक उठती हैं।') },
    draw(E) {
      const { c } = E, cols = xcols();
      const lig = E.col('lign', '#D4C28A'), lig2 = E.col('lign', '#E6DAB0'), cell = E.col('wall', '#D8D1B6'), lum = E.col('vac', '#F8F5E8'), cy = E.col('cyto', '#F0ECD9'), nuc = E.col('nuc', '#C9BC96'), nuc2 = E.col('nuc', '#A39870');
      for (const col of cols) {
        if (col.x > E.x1 || col.x + col.w < E.x0) continue;
        const xl = col.x, xr = col.x + col.w, mid = xl + col.w / 2, ya = E.y0 - 2, yb = E.y1 + 2;
        if (col.type === 'p') {
          const ye = (j) => j * 96 + (h32(col.q, j, 3) - 0.5) * 16;
          for (let j = Math.floor(E.y0 / 96) - 1; j <= Math.floor(E.y1 / 96) + 1; j++) {
            const a = ye(j), b = ye(j + 1);
            c.beginPath(); c.rect(xl, a, col.w, b - a); fs(c, cy, cell, E.w(1.6, 1));
            if (E.k * 5 > 1.2) { ell(c, mid, (a + b) / 2, 5.5, 4.2); fs(c, nuc, nuc2, E.w(0.6, 0.7)); }
            if (E.near(mid, (a + b) / 2, 50)) { E.mark('parenchyma', mid, (a + b) / 2 + 20, col.w * 0.35); E.mark('nucleus', mid, (a + b) / 2, 6); }
          }
        } else if (col.type === 'f') {
          c.fillStyle = lig2; c.fillRect(xl, ya, col.w, yb - ya); c.fillStyle = lum; c.fillRect(mid - 1.4, ya, 2.8, yb - ya);
          c.strokeStyle = lig; c.lineWidth = E.w(2.4, 1); c.beginPath(); c.moveTo(xl, ya); c.lineTo(xl, yb); c.moveTo(xr, ya); c.lineTo(xr, yb); c.stroke();
          if (E.near(mid, E.cy, 60)) E.mark('fibre', mid, E.cy + 10, col.w);
        } else {
          c.fillStyle = lum; c.fillRect(xl, ya, col.w, yb - ya);
          const kind = col.k < 0.45 ? 'spiral' : col.k < 0.7 ? 'ring' : 'pit', pitch = kind === 'spiral' ? 17 : 24, ok = pitch * E.k > 3.2;
          c.strokeStyle = lig; c.lineCap = 'butt';
          if (kind === 'pit') {
            c.fillStyle = lig; c.fillRect(xl, ya, 8, yb - ya); c.fillRect(xr - 8, ya, 8, yb - ya);
            if (ok) { c.fillStyle = lum; for (let yy = Math.floor(ya / 14) * 14; yy < yb; yy += 14) for (const px of [xl + 4, xr - 4]) { ell(c, px, yy + (h32(col.q, yy, 1) * 6), 2.4, 1.5); c.fill(); } }
          } else if (ok) {
            c.lineWidth = E.w(3.6, 1); c.beginPath();
            for (let yy = Math.floor(ya / pitch) * pitch; yy < yb; yy += pitch) { if (kind === 'spiral') { c.moveTo(xl, yy); c.lineTo(xr, yy + 14); } else { c.moveTo(xl, yy); c.lineTo(xr, yy); } }
            c.stroke();
          } else { c.globalAlpha = 0.45; c.fillStyle = lig; c.fillRect(xl, ya, col.w, yb - ya); c.globalAlpha = 1; }
          c.strokeStyle = lig; c.lineWidth = E.w(3.4, 1.2); c.beginPath(); c.moveTo(xl, ya); c.lineTo(xl, yb); c.moveTo(xr, ya); c.lineTo(xr, yb); c.stroke();
          if (E.near(mid, E.cy, 80)) {
            E.cnt(mid, E.cy); E.mark('vessel', mid, E.cy - 22, col.w * 0.3);
            const yy = Math.round(E.cy / pitch) * pitch; E.mark('lignin', kind === 'pit' ? xl + 4 : mid, kind === 'pit' ? E.cy : yy + (kind === 'spiral' ? 4.5 : 0), 5);
          }
        }
      }
    },
  });

  // ---------------------------------------------------------------- 13. muscle: smooth (left), skeletal (middle), cardiac (right); drag the slide sideways to visit them
  const MUSC = { a: -410, b: 410 };
  slide('muscle', {
    s: 0.5, bg: '#F5E9EB', ext: { x: 1100, y: 420 }, tint: '#E8B3BC',
    name: T2('Muscle tissue', 'पेशी ऊतक'), kind: T2('Three kinds of muscle', 'तीन प्रकार की पेशियाँ'),
    parts: [['skeletal-fibre', 0], ['striations', 2], ['nucleus', 1, T2('A small dark oval. Skeletal fibres have many, close to the edge; cardiac and smooth cells have one in the middle.', 'छोटा गहरा अंडाकार। कंकाल तंतु में कई होते हैं, किनारे पर; हृदय और चिकनी पेशी की कोशिका में एक, बीच में।')], ['cardiac-fibre', 1], ['intercalated-disc', 2], ['smooth-fibre', 1]],
    count: T2('muscle cells or fibres', 'पेशी कोशिकाएँ या तंतु'), core: ['skeletal-fibre', 'striations', 'smooth-fibre'],
    real: T2('A skeletal fibre is about 0.06 mm wide but can be centimetres long. Heart cells are about 0.1 mm long.', 'कंकाल पेशी तंतु लगभग 0.06 मिमी चौड़ा होता है पर सेंटीमीटरों लंबा हो सकता है। हृदय की कोशिकाएँ लगभग 0.1 मिमी लंबी होती हैं।'),
    fact: T2('Slide the specimen sideways. On the left is smooth muscle: pointed cells, no stripes. In the middle is skeletal muscle: long, striped fibres with many nuclei. On the right is cardiac muscle: striped, branching cells with dark joints.', 'नमूने को बगल में खिसकाओ। बाईं ओर चिकनी पेशी है: नुकीली कोशिकाएँ, बिना धारियों के। बीच में कंकाल पेशी है: लंबे धारीदार तंतु जिनमें कई केंद्रक हैं। दाईं ओर हृदय पेशी है: धारीदार शाखित कोशिकाएँ, गहरे जोड़ों वाली।'),
    where(x) { return x < MUSC.a ? T2('Smooth muscle (involuntary)', 'चिकनी पेशी (अनैच्छिक)') : x > MUSC.b ? T2('Cardiac muscle (involuntary)', 'हृदय पेशी (अनैच्छिक)') : T2('Skeletal muscle (voluntary)', 'कंकाल पेशी (ऐच्छिक)'); },
    draw(E) {
      const { c } = E;
      const sk = E.col('cyto', '#EACBD0'), skE = E.col('cyto', '#C79EA9'), band = E.col('cyto', '#D8A8B3'), nuc = E.col('nuc', '#A892B2'), nuc2 = E.col('nuc', '#80698C'), disc = E.col('nuc', '#9C82A2');
      c.fillStyle = E.col('cyto', '#EBD3D8'); c.fillRect(MUSC.a - 12, E.y0, 24, E.y1 - E.y0); c.fillRect(MUSC.b - 12, E.y0, 24, E.y1 - E.y0);
      const region = (xa, xb, fn) => { const a = Math.max(xa, E.x0 - 5), b = Math.min(xb, E.x1 + 5); if (a >= b) return; c.save(); c.beginPath(); c.rect(a, E.y0 - 5, b - a, E.y1 - E.y0 + 10); c.clip(); fn(a, b); c.restore(); };
      const cxm = (a, b) => clamp(E.cx, a + 10, b - 10);
      region(MUSC.a + 12, MUSC.b - 12, (a, b) => {
        for (let j = Math.floor(E.y0 / 58) - 1; j <= Math.floor(E.y1 / 58) + 1; j++) {
          const y = j * 58 + 2, h = 54, g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, skE); g.addColorStop(0.18, sk); g.addColorStop(0.82, sk); g.addColorStop(1, skE);
          rr(c, a - 20, y, b - a + 40, h, 6); fs(c, g, skE, E.w(1.2, 1));
          if (E.k * 2.5 >= 2.6) { c.strokeStyle = band; c.lineWidth = 1.25; c.beginPath(); for (let xx = Math.floor(a / 2.5) * 2.5; xx < b; xx += 2.5) { c.moveTo(xx, y + 1); c.lineTo(xx, y + h - 1); } c.stroke(); c.strokeStyle = skE; c.lineWidth = Math.max(0.25, 0.7 / E.k); c.beginPath(); for (let xx = Math.floor(a / 2.5) * 2.5 + 1.25; xx < b; xx += 2.5) { c.moveTo(xx, y + 1); c.lineTo(xx, y + h - 1); } c.stroke(); }
          else { c.globalAlpha = 0.25; c.fillStyle = band; c.fillRect(a, y + 3, b - a, h - 6); c.globalAlpha = 1; }
          for (let s = Math.floor(a / 140) - 1; s <= Math.floor(b / 140) + 1; s++) { const r = rngOf(131, s, j), nx = s * 140 + r() * 120, top = r() < 0.5; if (nx < a - 10 || nx > b + 10) continue; ell(c, nx, top ? y + 4.4 : y + h - 4.4, 8.5, 3.4); fs(c, nuc, nuc2, E.w(0.6, 0.7)); if (E.near(nx, y + 4, 12)) E.mark('nucleus', nx, top ? y + 4.4 : y + h - 4.4, 6); }
          const mx = cxm(a, b); if (E.near(mx, y + h / 2, 70)) { E.cnt(mx, y + h / 2); E.mark('skeletal-fibre', mx, y + h / 2 - 10, 20); const sx = Math.round(mx / 2.5) * 2.5; E.mark('striations', sx, y + h / 2 + 10, 4); }
        }
      });
      region(MUSC.b + 12, 1e5, (a, b) => {
        const rowy = (j) => j * 24 + 3, dpos = (j, m) => m * 105 + h32(j, 5, 1) * 105;
        for (let j = Math.floor(E.y0 / 24) - 1; j <= Math.floor(E.y1 / 24) + 1; j++) {
          for (let m = Math.floor(a / 105) - 1; m <= Math.floor(b / 105) + 1; m++) if (h32(j, m, 2) < 0.42) { const d = dpos(j, m); c.beginPath(); c.moveTo(d - 4, rowy(j) + 9); c.lineTo(d + 22, rowy(j + 1) + 9); c.lineWidth = 14; c.lineCap = 'butt'; c.strokeStyle = skE; c.stroke(); c.lineWidth = 11.6; c.strokeStyle = sk; c.stroke(); }
        }
        for (let j = Math.floor(E.y0 / 24) - 1; j <= Math.floor(E.y1 / 24) + 1; j++) {
          const y = rowy(j), h = 17;
          rr(c, a - 20, y, b - a + 40, h, 4); fs(c, E.col('cyto', '#E5BCC4'), skE, E.w(0.9, 0.9));
          if (E.k * 2.5 >= 2.6) { c.strokeStyle = band; c.globalAlpha = 0.6; c.lineWidth = 1.2; c.beginPath(); for (let xx = Math.floor(a / 2.5) * 2.5; xx < b; xx += 2.5) { c.moveTo(xx, y + 1); c.lineTo(xx, y + h - 1); } c.stroke(); c.globalAlpha = 1; }
          for (let m = Math.floor(a / 105) - 1; m <= Math.floor(b / 105) + 1; m++) {
            const d = dpos(j, m), nxm = d + 52;
            if (E.k * 6 > 1.2) { c.strokeStyle = disc; c.lineWidth = E.w(2.4, 1.2); c.lineJoin = 'miter'; c.beginPath(); c.moveTo(d - 1.6, y); c.lineTo(d + 1.6, y + h * 0.35); c.lineTo(d - 1.6, y + h * 0.7); c.lineTo(d + 1.6, y + h); c.stroke(); }
            ell(c, nxm, y + h / 2, 6.5, 4.4); fs(c, nuc, nuc2, E.w(0.6, 0.7));
            if (E.near(nxm, y + h / 2, 60)) { E.cnt(nxm, y + h / 2); E.mark('nucleus', nxm, y + h / 2, 6); E.mark('cardiac-fibre', nxm + 24, y + h / 2, 11); E.mark('intercalated-disc', d, y + h / 2, 5); }
          }
        }
      });
      region(-1e5, MUSC.a - 12, (a, b) => {
        for (let j = Math.floor(E.y0 / 9.5) - 1; j <= Math.floor(E.y1 / 9.5) + 1; j++) {
          const yc = j * 9.5 + 4.5; let xs = Math.floor(a / 160) * 160 - 160 + h32(j, 1, 3) * 120;
          for (let m = 0; m < 14 && xs < b + 160; m++) {
            const r = rngOf(171, j, m + 100), len = 130 + r() * 50;
            if (xs + len > a - 10) {
              c.beginPath(); c.moveTo(xs, yc); c.quadraticCurveTo(xs + len / 2, yc - 8.4, xs + len, yc); c.quadraticCurveTo(xs + len / 2, yc + 8.4, xs, yc); fs(c, E.col('cyto', '#E9D3DA'), skE, E.w(0.7, 0.8));
              ell(c, xs + len / 2, yc, 9, 1.9); fs(c, nuc, nuc2, E.w(0.5, 0.6));
              if (E.near(xs + len / 2, yc, 50)) { E.cnt(xs + len / 2, yc); E.mark('smooth-fibre', xs + len * 0.3, yc, 10); E.mark('nucleus', xs + len / 2, yc, 7); }
            }
            xs += len - 20 + r() * 6;
          }
        }
      });
    },
  });

  // ---------------------------------------------------------------- 14. nerve: motor neurons from a smear, with dendrites, a myelinated axon and nodes of Ranvier
  slide('nerve', {
    s: 2, bg: '#F5EDF3', ext: { x: 3200, y: 2600 }, tint: '#C7B0D8',
    name: T2('Neuron (nerve cell)', 'न्यूरॉन (तंत्रिका कोशिका)'), kind: T2('Nerve tissue', 'तंत्रिका ऊतक'),
    parts: [['cell-body', 1], ['nucleus', 2, T2('A big pale round core with one dark dot (the nucleolus) inside the cell body.', 'कोशिका काय के भीतर बड़ा हल्का गोल केंद्र, जिसमें एक गहरा बिंदु (केंद्रिका) है।')], ['dendrite', 1], ['axon', 1], ['myelin', 2], ['node', 2]],
    count: T2('neurons', 'न्यूरॉन'), core: ['cell-body', 'dendrite', 'axon'],
    real: T2('The cell body is about 0.07 mm wide, but one axon can be over a metre long. Here the axon is cut short.', 'कोशिका काय लगभग 0.07 मिमी चौड़ी होती है, पर एक ऐक्सॉन एक मीटर से भी लंबा हो सकता है। यहाँ ऐक्सॉन छोटा काटा गया है।'),
    fact: T2('A neuron has a cell body, short branching dendrites that receive messages, and one long axon that sends them on. A fatty myelin sheath covers the axon with tiny gaps, the nodes of Ranvier, where the message jumps.', 'न्यूरॉन में कोशिका काय, संदेश ग्रहण करने वाली छोटी शाखित द्रुमिकाएँ और संदेश आगे भेजने वाला एक लंबा ऐक्सॉन होता है। वसा का मायलिन आवरण ऐक्सॉन को ढकता है और बीच में छोटी दरारें, रेनवियर के नोड, होती हैं जहाँ संदेश कूदता है।'),
    sx: { 'methylene-blue': T2('Methylene blue colours the dark granules in the cell body (Nissl bodies) and the nuclei blue.', 'मेथिलीन ब्लू कोशिका काय के गहरे कणों (निस्ल कायों) और केंद्रकों को नीला रंगता है।') },
    draw(E) {
      const { c } = E, T = 800;
      const gl = E.col('nuc', '#B8A4C4'), gl2 = E.col('nuc', '#8E7A9E');
      E.tiles(T, 100, (i, j, R, ox, oy) => { for (let q = 0; q < 36; q++) { const x = ox + R() * T, y = oy + R() * T; c.beginPath(); c.arc(x, y, 3.4 + R() * 1.2, 0, TAU); fs(c, gl, gl2, E.w(0.5, 0.5)); } }, 0);
      const cS = E.col('cyto', '#DCCFE2'), cSe = E.col('cyto', '#A58DB0'), cD = E.col('cyto', '#C8B5D0'), cAx = E.col('cyto', '#B09AC0'), cM = E.col('vac', '#F4EEF1'), cMe = E.col('vac', '#C7B4C2'), cNu = E.col('vac', '#EEE6F1'), cNe = E.col('nuc', '#8F76A0'), cNi = E.col('nuc', '#8B6D9A'), cNs = E.col('nuc', '#A28EB0');
      E.tiles(T, 1700, (i, j, R, ox, oy) => {
        const org = i === 0 && j === 0; if (R() > 0.65 && !org) return;
        const x = org ? 0 : ox + 150 + R() * 500, y = org ? 0 : oy + 150 + R() * 500, nd = 4 + Math.floor(R() * 3), base = R() * TAU, slot = TAU / (nd + 1), ph = R() * TAU, rnd = rng(i * 1301 + j * 77 + 9);
        const da = [], aa = base + nd * slot + (R() - 0.5) * 0.3; for (let m = 0; m < nd; m++) da.push(base + m * slot + (R() - 0.5) * 0.4);
        const dend = (px, py, a, len, w, depth) => {
          const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len, bend = (R() - 0.5) * len * 0.35;
          c.lineCap = 'round'; c.strokeStyle = cD; c.lineWidth = Math.max(w, 1.5 / E.k); c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo((px + ex) / 2 - Math.sin(a) * bend, (py + ey) / 2 + Math.cos(a) * bend, ex, ey); c.stroke();
          if (depth < 2) { dend(ex, ey, a + 0.45 + R() * 0.3, len * 0.72, w * 0.7, depth + 1); dend(ex, ey, a - 0.45 - R() * 0.3, len * 0.72, w * 0.7, depth + 1); }
        };
        for (const a of da) dend(x + Math.cos(a) * 24, y + Math.sin(a) * 24, a, 80 + R() * 60, 8, 0);
        const ux = Math.cos(aa), uy = Math.sin(aa), nx = -uy, ny = ux, pt = (s) => [x + ux * s + nx * 22 * Math.sin(s / 190 + ph), y + uy * s + ny * 22 * Math.sin(s / 190 + ph)];
        const ap = []; for (let s = 20; s <= 1560; s += 30) ap.push(pt(s));
        const sub = (a, b) => ap.filter((p, m) => 20 + m * 30 >= a && 20 + m * 30 <= b);
        c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = cAx; c.lineWidth = Math.max(3.2, 1.4 / E.k); poly(c, ap, false); c.stroke();
        c.lineCap = 'butt';
        for (let m = 0; m < 4; m++) {
          const s0 = 90 + m * 345, pts = sub(s0, s0 + 330); if (pts.length < 2) continue;
          c.strokeStyle = cMe; c.lineWidth = Math.max(16, 2.4 / E.k); poly(c, pts, false); c.stroke(); c.strokeStyle = cM; c.lineWidth = Math.max(12.6, 1.6 / E.k); poly(c, pts, false); c.stroke();
          const mid = pt(s0 + 165); if (E.k * 9 > 1.2) { ell(c, mid[0] + nx * 6, mid[1] + ny * 6, 9, 3.2, aa); fs(c, cNs, cNe, E.w(0.6, 0.6)); }
          if (E.near(mid[0], mid[1], 60)) { E.mark('myelin', mid[0], mid[1], 13); const nd2 = pt(s0 + 337); E.mark('node', nd2[0], nd2[1], 8); }
        }
        const r0 = (a) => { let r = 30; for (const d of da) r += 15 * Math.exp(-Math.pow(angd(a, d), 2) / 0.06); return r + 13 * Math.exp(-Math.pow(angd(a, aa), 2) / 0.05); };
        const sp = []; for (let m = 0; m < 56; m++) { const a = (m / 56) * TAU; sp.push([x + Math.cos(a) * r0(a), y + Math.sin(a) * r0(a)]); }
        c.lineJoin = 'round'; poly(c, sp, true); fs(c, rg(c, x - 8, y - 8, 4, 50, [[0, E.col('cyto', '#E7DCEB')], [1, cS]]), cSe, E.w(1.6, 1));
        const nuX = x + (R() - 0.5) * 8, nuY = y + (R() - 0.5) * 8;
        if (E.k * 28 > 5) { c.fillStyle = cNs; for (let m = 0; m < 46; m++) { const a = rnd() * TAU, d = 14 + Math.sqrt(rnd()) * 24; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9 + rnd() * 0.9, 0, TAU); c.fill(); } }
        c.beginPath(); c.arc(nuX, nuY, 12, 0, TAU); fs(c, cNu, cNe, E.w(1.2, 0.9));
        if (E.k * 6 > 1) { c.beginPath(); c.arc(nuX + 1.5, nuY, 3.2, 0, TAU); fs(c, cNi); }
        if (E.near(x, y, 80)) {
          E.cnt(x, y); E.mark('cell-body', x + Math.cos(da[0] + slot / 2) * 28, y + Math.sin(da[0] + slot / 2) * 28, 14); E.mark('nucleus', nuX, nuY, 12);
          E.mark('dendrite', x + Math.cos(da[0]) * 88, y + Math.sin(da[0]) * 88, 12); const ap0 = pt(60); E.mark('axon', ap0[0], ap0[1], 9);
        }
      }, 300);
    },
  });

  // ---------------------------------------------------------------- 15. bacteria (rods, balls and spirals; almost invisible until stained; they jiggle until fixed by a stain)
  slide('bacteria', {
    s: 0.06, live: true, bg: '#F6F3E7', ext: { x: 140, y: 140 }, tint: '#9DB0E4',
    name: T2('Bacteria (curd smear)', 'जीवाणु (दही का स्मीयर)'), kind: T2('Microbes', 'सूक्ष्मजीव'),
    parts: [['bacillus', 1], ['coccus', 1], ['spirillum', 1]],
    count: T2('rod-shaped bacteria', 'छड़ के आकार के जीवाणु'), core: ['bacillus', 'coccus', 'spirillum'],
    real: T2('A bacterium is only about 0.001 to 0.005 mm long, a thousand times smaller than a millimetre.', 'जीवाणु केवल लगभग 0.001 से 0.005 मिमी लंबा होता है, एक मिलीमीटर का हज़ारवाँ भाग।'),
    note: T2('Bacteria are so small that a real lab uses the 100x oil lens. This slide shows the field that lens gives, so the 40x button here stands for that strong lens.', 'जीवाणु इतने छोटे हैं कि असली प्रयोगशाला में 100x ऑयल लेंस लगता है। यह स्लाइड उसी लेंस का दृश्य दिखाती है, इसलिए यहाँ 40x बटन उस शक्तिशाली लेंस के लिए है।'),
    fact: T2('Bacteria are single cells with no nucleus. They come in three shapes: rods, balls and spirals. Unstained, they are nearly invisible and jiggle in the water. A stain fixes them and makes them stand out.', 'जीवाणु बिना केंद्रक वाली एककोशिकीय जीव हैं। इनके तीन आकार होते हैं: छड़, गोले और सर्पिल। बिना रंग के ये लगभग दिखते नहीं और पानी में काँपते रहते हैं। रंग इन्हें स्थिर करके उभार देता है।'),
    draw(E) {
      const { c, t } = E, T = 24;
      const col = E.col('bact', '#CBC8BA'), lw = E.w(0.8, 1.3);
      E.tiles(T, 6, (i, j, R, ox, oy) => {
        c.lineCap = 'round'; c.lineJoin = 'round';
        for (let q = 0; q < 14; q++) {
          const x0 = ox + R() * T, y0 = oy + R() * T, a = R() * TAU, ph = R() * TAU, u = R(), len = 1.9 + R() * 1.2;
          const x = x0 + 0.22 * (Math.sin(6.1 * t + ph) + 0.6 * Math.sin(11.3 * t + 2 * ph)), y = y0 + 0.22 * (Math.cos(5.3 * t + ph) + 0.6 * Math.sin(12.7 * t + ph));
          const aa = a + 0.12 * Math.sin(3 * t + ph);
          c.strokeStyle = col; c.fillStyle = col;
          if (u < 0.5) { c.lineWidth = lw; c.beginPath(); c.moveTo(x - Math.cos(aa) * len / 2, y - Math.sin(aa) * len / 2); c.lineTo(x + Math.cos(aa) * len / 2, y + Math.sin(aa) * len / 2); c.stroke(); if (E.near(x, y, 4)) { E.cnt(x, y); E.mark('bacillus', x, y, 1.5); } }
          else if (u < 0.86) { const n = 1 + Math.floor(R() * 5), rr2 = 0.46; for (let m = 0; m < n; m++) { const px = x + Math.cos(aa + m * 0.25) * m * rr2 * 1.9, py = y + Math.sin(aa + m * 0.25) * m * rr2 * 1.9; c.beginPath(); c.arc(px, py, Math.max(rr2, 0.7 / E.k), 0, TAU); c.fill(); } if (E.near(x, y, 4)) E.mark('coccus', x, y, 1.2); }
          else { c.lineWidth = lw; c.beginPath(); for (let m = 0; m <= 14; m++) { const s = (m / 14 - 0.5) * 4.6, off = 0.55 * Math.sin(m / 14 * TAU * 1.6); const px = x + Math.cos(aa) * s - Math.sin(aa) * off, py = y + Math.sin(aa) * s + Math.cos(aa) * off; m ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); if (E.near(x, y, 4)) E.mark('spirillum', x, y, 2.2); }
        }
        c.fillStyle = 'rgba(140,135,115,0.18)'; for (let q = 0; q < 6; q++) { c.beginPath(); c.arc(ox + R() * T, oy + R() * T, 0.12 + R() * 0.2, 0, TAU); c.fill(); }
      }, 0);
    },
  });

  // ---------------------------------------------------------------- 16. Spirogyra: filament of cylindrical cells, spiral chloroplast ribbons, pyrenoids (starch), nucleus on strands
  slide('spirogyra', {
    s: 1, bg: '#F2F7EA', ext: { x: 2200, y: 1800 }, tint: '#6FC070',
    name: T2('Spirogyra (pond alga)', 'स्पाइरोगायरा (तालाब की शैवाल)'), kind: T2('Green alga', 'हरी शैवाल'),
    parts: [['ribbon', 1], ['pyrenoid', 2], ['nucleus', 2, T2('A round, pale disc in the middle of the cell, held by thin strands.', 'कोशिका के बीच में पतले धागों से टिका गोल, हल्का चकत्ता।')], ['cell-wall', 1], ['vacuole', 2]],
    count: T2('cells', 'कोशिकाएँ'), core: ['ribbon', 'pyrenoid', 'nucleus'],
    real: T2('A Spirogyra cell is about 0.035 mm wide and 0.1 mm long. Cells join end to end in a thread.', 'स्पाइरोगायरा की कोशिका लगभग 0.035 मिमी चौड़ी और 0.1 मिमी लंबी होती है। कोशिकाएँ सिरे से सिरा जुड़कर धागा बनाती हैं।'),
    fact: T2('Spirogyra grows as green slimy threads in ponds. Each cell has a green chloroplast twisted like a spring. Iodine turns the starch around the pyrenoids blue-black, which shows that the alga makes food by photosynthesis.', 'स्पाइरोगायरा तालाबों में हरे चिपचिपे धागों के रूप में उगती है। हर कोशिका में स्प्रिंग की तरह मुड़ा हरा हरितलवक होता है। आयोडीन पाइरेनॉइड के चारों ओर के स्टार्च को नीला-काला कर देता है, जिससे पता चलता है कि शैवाल प्रकाश-संश्लेषण से भोजन बनाती है।'),
    sx: { iodine: T2('Iodine turns the starch around the pyrenoids blue-black. The nucleus turns yellow-brown.', 'आयोडीन पाइरेनॉइड के चारों ओर के स्टार्च को नीला-काला करता है। केंद्रक पीला-भूरा हो जाता है।') },
    draw(E) {
      const { c } = E, T = 520;
      const cF = E.col('cyto', '#E7F2DC'), cW = E.col('wall', '#9DB58C'), cV = E.col('vac', '#F1F8E8'), cN = E.col('nuc', '#C8D6B6'), cN2 = E.col('nuc', '#8CA078'), cSt = E.col('cyto', '#BBD0A8');
      const rf = '#3FA64A', rb = '#2D8139';
      E.tiles(T, 700, (i, j, R, ox, oy) => {
        const org = i === 0 && j === 0; if (R() > 0.85 && !org) return;
        const sx = org ? -120 : ox + R() * T, sy = org ? -30 : oy + R() * T, a = org ? 0.35 : R() * TAU, W = 33 + R() * 8, rib = R() < 0.5 ? 2 : 3, pitch = 62 + R() * 22;
        let u = 0; const ca = Math.cos(a), sa = Math.sin(a);
        c.save(); c.translate(sx, sy); c.rotate(a);
        const cells = []; while (u < 900) { const len = 92 + R() * 50; cells.push([u, u + len]); u += len; }
        rr(c, -6, -W / 2 - 3, u + 12, W + 6, W / 2 + 3); fs(c, 'rgba(210,225,200,0.35)');
        for (const [u0, u1] of cells) {
          rr(c, u0, -W / 2, u1 - u0, W, 5); fs(c, cF, cW, E.w(1.8, 1));
          rr(c, u0 + 3, -W / 2 + 3, u1 - u0 - 6, W - 6, 4); fs(c, cV);
        }
        c.restore();
        for (const [u0, u1] of cells) {
          c.save(); c.translate(sx, sy); c.rotate(a);
          const detail = E.k * W > 8;
          if (detail) {
            for (let r2 = 0; r2 < rib; r2++) {
              const phi = (r2 / rib) * TAU + u0 * 0.1, A = W / 2 - 4.2; let prev = null;
              c.lineCap = 'round';
              for (let s = u0 + 3; s <= u1 - 3; s += 3) { const ang = (s / pitch) * TAU + phi, y = A * Math.sin(ang), front = Math.cos(ang) > 0; if (prev) { c.strokeStyle = front ? rf : rb; c.globalAlpha = front ? 1 : 0.7; c.lineWidth = E.w(5.4, 1.1); c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(s, y); c.stroke(); } prev = [s, y]; }
              c.globalAlpha = 1;
              if (E.k * 3 > 1.5) for (let s = u0 + 10 + r2 * 5; s <= u1 - 8; s += 21) { const ang = (s / pitch) * TAU + phi; if (Math.cos(ang) > -0.15) { c.beginPath(); c.arc(s, A * Math.sin(ang), 3.1, 0, TAU); fs(c, E.col('starch', '#E9F4D2'), E.col('starch', '#B9D7A0'), E.w(0.6, 0.6)); } }
            }
            const mx = (u0 + u1) / 2;
            c.strokeStyle = cSt; c.lineWidth = E.w(0.9, 0.7); c.beginPath(); for (let m = 0; m < 6; m++) { const aa = (m / 6) * TAU + 0.3; c.moveTo(mx, 0); c.lineTo(mx + Math.cos(aa) * 14, Math.sin(aa) * W * 0.42); } c.stroke();
            c.beginPath(); c.arc(mx, 0, 7.5, 0, TAU); fs(c, cN, cN2, E.w(1, 0.8)); c.beginPath(); c.arc(mx + 1, 0, 2.6, 0, TAU); fs(c, cN2);
          } else { c.fillStyle = 'rgba(63,166,74,0.55)'; c.fillRect(u0 + 4, -W / 2 + 4, u1 - u0 - 8, W - 8); }
          c.restore();
          const mx = (u0 + u1) / 2, wx = sx + mx * ca, wy = sy + mx * sa;
          if (E.near(wx, wy, 70)) {
            E.cnt(wx, wy);
            const rx = (x, y) => [sx + x * ca - y * sa, sy + x * sa + y * ca];
            const A0 = W / 2 - 4.2, phi0 = u0 * 0.1, pr = rx(mx, 0), wl = rx(u1, W * 0.3), va = rx(mx + 32, -W * 0.28);
            let sp = u0 + 10; while (sp < u1 - 8 && Math.cos((sp / pitch) * TAU + phi0) < -0.1) sp += 3;
            const ph0 = rx(sp, A0 * Math.sin((sp / pitch) * TAU + phi0)), rb0 = rx(sp + 9, A0 * Math.sin(((sp + 9) / pitch) * TAU + phi0));
            E.mark('nucleus', pr[0], pr[1], 8); E.mark('cell-wall', wl[0], wl[1], 5); E.mark('ribbon', rb0[0], rb0[1], 5); E.mark('pyrenoid', ph0[0], ph0[1], 4); E.mark('vacuole', va[0], va[1], 10);
          }
        }
      }, 0);
    },
  });

  // ---------------------------------------------------------------- the words of the interface
  const UI = {
    lens: T2('Lens', 'लेंस'), focus: T2('Focus', 'फ़ोकस'), coarse: T2('Coarse knob', 'मोटा नॉब'), fine: T2('Fine knob', 'बारीक नॉब'),
    coarseSub: T2('big turns, to find the picture', 'बड़े घुमाव, चित्र ढूँढने के लिए'), fineSub: T2('tiny turns, to make it sharp', 'छोटे घुमाव, उसे साफ़ करने के लिए'),
    sharp: T2('Sharpness', 'स्पष्टता'), s3: T2('Very blurry', 'बहुत धुंधला'), s2: T2('Blurry', 'धुंधला'), s1: T2('Almost sharp', 'लगभग साफ़'), s0: T2('Sharp!', 'साफ़!'),
    stain: T2('Stain', 'रंजक (स्टेन)'), stainSub: T2('one drop of colour on the slide', 'स्लाइड पर रंग की एक बूँद'),
    parts: T2('Parts to find', 'ढूँढने के भाग'), partsSub: T2('Tap a name and the microscope shows it.', 'नाम दबाओ, सूक्ष्मदर्शी उसे दिखाएगा।'),
    move: T2('Move the slide', 'स्लाइड खिसकाओ'), left: T2('Left', 'बाएँ'), right: T2('Right', 'दाएँ'), up: T2('Up', 'ऊपर'), down: T2('Down', 'नीचे'), centre: T2('Centre', 'बीच में'),
    about: T2('About this slide', 'इस स्लाइड के बारे में'), total: T2('Total magnification', 'कुल आवर्धन'), field: T2('Field of view', 'दृश्य क्षेत्र'),
    across: T2('across', 'चौड़ा'), eyepiece: T2('lens × 10 eyepiece', 'लेंस × 10 नेत्रिका'),
    focusTitle: T2('Focus the picture', 'चित्र को साफ़ करो'),
    f1: T2('Turn the coarse knob until shapes appear.', 'आकृतियाँ दिखने तक मोटा नॉब घुमाओ।'), f2: T2('Turn the fine knob until the picture is sharp.', 'चित्र साफ़ होने तक बारीक नॉब घुमाओ।'),
    f3: T2('Change to a stronger lens.', 'अधिक क्षमता वाला लेंस चुनो।'), f4: T2('Focus again with the fine knob.', 'बारीक नॉब से फिर साफ़ करो।'),
    findTitle: T2('Find the part', 'भाग पहचानो'), arrowQ: T2('What is the part the arrow points to?', 'तीर जिस भाग की ओर है, वह क्या है?'),
    score: T2('Right', 'सही'), next: T2('Next question', 'अगला प्रश्न'), needView: T2('Make the arrow appear first: choose the {l} lens, make it sharp and keep the part in the circle.', 'पहले तीर दिखाओ: {l} लेंस चुनो, चित्र साफ़ करो और भाग को गोले में रखो।'),
    countTitle: T2('Count', 'गिनती'), countQ: T2('Count the {n} you can see in the circle.', 'गोले में जितनी {n} दिख रही हैं, गिनो।'), countHint: T2('Count each one once. Slide the specimen if you need to, but do not move it while you check.', 'हर एक को एक बार गिनो। ज़रूरत हो तो नमूना खिसकाओ, पर जाँचते समय मत हिलाओ।'),
    check: T2('Check', 'जाँचो'), minus: T2('One less', 'एक कम'), plus: T2('One more', 'एक ज़्यादा'), yourCount: T2('Your count', 'तुम्हारी गिनती'),
    drawTitle: T2('Draw what you see', 'जो दिखे वह बनाओ'), drawQ: T2('Draw one or two cells with a pencil, then tap the parts you have drawn to label them (★ means you must label it).', 'पेंसिल से एक-दो कोशिकाएँ बनाओ, फिर बनाए हुए भागों के नाम दबाकर उन्हें नाम दो (★ वाले ज़रूरी हैं)।'),
    clear: T2('Clear drawing', 'चित्र मिटाओ'), checkDraw: T2('Check my drawing', 'मेरा चित्र जाँचो'), pad: T2('Drawing paper', 'चित्र बनाने का काग़ज़'),
    rules: T2('A good science drawing has a title, thin sharp lines, labels on the right joined by straight lines, and the magnification.', 'अच्छे विज्ञान चित्र में शीर्षक, पतली साफ़ रेखाएँ, दाईं ओर सीधी रेखाओं से जुड़े नाम और आवर्धन होता है।'),
    done: T2('Done', 'हो गया'),
  };
  const MSG = {
    focusFirst: T2('Make the picture sharp first: turn the coarse knob, then the fine knob.', 'पहले चित्र साफ़ करो: पहले मोटा नॉब, फिर बारीक नॉब घुमाओ।'),
    tooSmall: T2('The {n} is too small to tell apart at this lens. Try the {l} lens.', 'इस लेंस में {n} बहुत छोटा है, पहचान नहीं आता। {l} लेंस आज़माओ।'),
    notHere: T2('There is no {n} in this part of the slide. Slide the specimen a little.', 'स्लाइड के इस भाग में {n} नहीं है। नमूने को थोड़ा खिसकाओ।'),
    zoomed: T2('{x}x lens: the circle now shows about {f}. The picture is a little blurry, so focus again with the fine knob.', '{x}x लेंस: अब गोले में लगभग {f} दिखता है। चित्र थोड़ा धुंधला है, इसलिए बारीक नॉब से फिर साफ़ करो।'),
    sharpNow: T2('Sharp! Now look closely at the picture.', 'साफ़! अब चित्र को ध्यान से देखो।'),
    liveDead: T2('The stain kills the living animal, so it stops moving.', 'रंग जीवित जंतु को मार देता है, इसलिए वह हिलना बंद कर देता है।'),
    fresh: T2('A fresh slide, no stain. See how pale the parts are without colour.', 'ताज़ा स्लाइड, कोई रंग नहीं। देखो, रंग के बिना भाग कितने फीके हैं।'),
    freshLive: T2('A fresh sample: the living animals swim and move again.', 'ताज़ा नमूना: जीवित जंतु फिर तैरते और हिलते हैं।'),
    right: T2('Right! It is the {n}.', 'सही! यह {n} है।'), wrong: T2('Not this one. Hint: {h}', 'यह नहीं। संकेत: {h}'), thatIs: T2('{n}: {h}', '{n}: {h}'),
    cRight: T2('Right! There are {n}.', 'सही! कुल {n} हैं।'), cWrong: T2('Not quite. I counted {n}. Look at the numbers on the picture and count again.', 'बिलकुल नहीं। मैंने {n} गिनी। चित्र पर लगी संख्याएँ देखकर फिर गिनो।'),
    cMany: T2('There are too many to count here. Use a stronger lens or move the slide to a thinner part.', 'यहाँ गिनने के लिए बहुत ज़्यादा हैं। अधिक क्षमता वाला लेंस लगाओ या स्लाइड के कम भरे भाग पर जाओ।'),
    cNone: T2('Nothing to count in the circle. Slide the specimen.', 'गोले में गिनने को कुछ नहीं है। नमूना खिसकाओ।'),
    dNone: T2('Draw first. Use the paper below.', 'पहले चित्र बनाओ। नीचे के काग़ज़ पर बनाओ।'), dMiss: T2('Good drawing. Still to label: {n}. Find each part, then tap its name.', 'अच्छा चित्र। नाम देना बाकी है: {n}। हर भाग ढूँढो और उसका नाम दबाओ।'),
    dRight: T2('Well done! You drew it and labelled every important part.', 'शाबाश! तुमने चित्र बनाया और हर ज़रूरी भाग को नाम दिया।'),
    tapQuiz: T2('Choose a name below.', 'नीचे से नाम चुनो।'),
    allowed: T2('Not yet.', 'अभी नहीं।'),
  };
  const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m));

  const css = `
.sc-root{--sc-ac:#059669;display:grid;gap:14px;grid-template-columns:minmax(0,1fr);color:var(--ink,#1E293B);font-family:var(--font-body,Mukta,system-ui,sans-serif);max-width:1120px;margin:0 auto;font-size:16px;line-height:1.45}
.sc-root *{box-sizing:border-box}
.sc-root.sc-wide{grid-template-columns:minmax(300px,560px) minmax(0,1fr);align-items:start}
.sc-left{display:flex;flex-direction:column;gap:10px;min-width:0}
.sc-right{display:flex;flex-direction:column;gap:10px;min-width:0}
.sc-eye{position:relative;border-radius:26px;padding:10px;background:linear-gradient(145deg,#1b2a44,#0a1020);box-shadow:0 10px 28px rgba(6,18,51,.35),inset 0 0 0 2px rgba(255,255,255,.07);width:100%;max-width:560px;margin:0 auto}
.sc-cv{display:block;width:100%;aspect-ratio:1/1;border-radius:50%;background:#070b12;touch-action:none;cursor:grab;outline-offset:3px}
.sc-cv:active{cursor:grabbing}
.sc-cv:focus-visible{outline:3px solid #FFD23F}
.sc-badge{position:absolute;left:14px;top:12px;max-width:62%;padding:4px 10px;border-radius:999px;background:rgba(6,18,51,.72);color:#fff;font:600 13px/1.3 var(--font-body,Mukta,sans-serif);pointer-events:none;backdrop-filter:blur(3px)}
.sc-region{position:absolute;right:14px;bottom:12px;max-width:60%;padding:4px 10px;border-radius:999px;background:rgba(255,210,63,.95);color:#1E293B;font:700 13px/1.3 var(--font-body,Mukta,sans-serif);pointer-events:none}
.sc-region:empty{display:none}
.sc-row{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap;width:100%;max-width:560px;margin:0 auto}
.sc-pan{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px) ;gap:4px;justify-content:center;flex:0 0 auto}
.sc-pan button{min-width:44px;min-height:44px;border-radius:12px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font-size:20px;line-height:1;cursor:pointer;padding:0}
.sc-pan button:hover{border-color:var(--sc-ac)}
.sc-pan .sc-pu{grid-column:2;grid-row:1}.sc-pan .sc-pl{grid-column:1;grid-row:2}.sc-pan .sc-pc{grid-column:2;grid-row:2;font-size:16px}.sc-pan .sc-pr{grid-column:3;grid-row:2}.sc-pan .sc-pd{grid-column:2;grid-row:3}
.sc-meter{flex:1 1 130px;min-width:120px;background:var(--surface,#fff);border:2px solid var(--line,#CBD5E1);border-radius:16px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.sc-mlab{display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:14px}
.sc-mbar{height:14px;border-radius:8px;background:linear-gradient(90deg,#FF6B57,#FFD23F 55%,#22C55E);position:relative;overflow:hidden}
.sc-mbar i{position:absolute;right:0;top:0;bottom:0;background:var(--sunk,#E2E8F0);transition:width .25s}
.sc-say{min-height:3.2em;background:var(--surface,#fff);border:2px solid var(--line,#CBD5E1);border-left:6px solid var(--sc-ac);border-radius:14px;padding:10px 14px;font-size:15.5px;width:100%;max-width:560px;margin:0 auto}
.sc-card{background:var(--surface,#fff);border:2px solid var(--line,#CBD5E1);border-radius:18px;padding:12px 14px;box-shadow:0 2px 8px rgba(6,18,51,.06)}
.sc-card h3{margin:0 0 6px;font:700 17px/1.2 var(--font-display,'Baloo 2',sans-serif);color:var(--ink,#1E293B)}
.sc-sub{margin:0 0 8px;font-size:14px;color:var(--ink-2,#475569)}
.sc-top{display:flex;gap:12px;align-items:center}
.sc-top svg{flex:0 0 auto;width:112px;height:auto}
.sc-top b{font:700 19px/1.15 var(--font-display,'Baloo 2',sans-serif);display:block}
.sc-top p{margin:2px 0;font-size:14px;color:var(--ink-2,#475569)}
.sc-lens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sc-lens button{min-height:58px;border-radius:14px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:4px;transition:transform .15s,background .15s}
.sc-lens button b{font:800 22px/1 var(--font-display,'Baloo 2',sans-serif)}
.sc-lens button span{font-size:12.5px;color:var(--ink-2,#475569)}
.sc-lens button[aria-pressed=true]{background:var(--sc-ac);border-color:var(--sc-ac);color:#fff;transform:translateY(-2px);box-shadow:0 5px 12px rgba(5,150,105,.35)}
.sc-lens button[aria-pressed=true] span{color:#fff}
.sc-krow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;align-items:center;margin-bottom:6px}
.sc-krow .sc-kt{grid-column:1/3;display:flex;justify-content:space-between;gap:8px;font-weight:700}
.sc-krow .sc-kt small{font-weight:400;color:var(--ink-2,#475569);font-size:13px}
.sc-krow .sc-ks{display:flex;gap:6px;align-items:center;grid-column:1/3}
.sc-ks button{flex:0 0 44px;min-width:44px;height:44px;border-radius:50%;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font-size:22px;cursor:pointer;padding:0;line-height:1}
.sc-rng{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:44px;background:transparent;margin:0;cursor:pointer}
.sc-rng::-webkit-slider-runnable-track{height:12px;border-radius:7px;background:linear-gradient(90deg,#14B8A6,#2563EB)}
.sc-rng::-webkit-slider-thumb{-webkit-appearance:none;width:34px;height:34px;border-radius:50%;margin-top:-11px;background:#fff;border:5px solid #FF7A1A;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.sc-rng::-moz-range-track{height:12px;border-radius:7px;background:linear-gradient(90deg,#14B8A6,#2563EB)}
.sc-rng::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#fff;border:5px solid #FF7A1A}
.sc-rng.sc-fi::-webkit-slider-thumb{border-color:#8B3DFF}
.sc-rng.sc-fi::-moz-range-thumb{border-color:#8B3DFF}
.sc-rng:focus-visible{outline:3px solid #FFD23F;outline-offset:2px;border-radius:8px}
.sc-stains{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sc-stains button{min-height:48px;border-radius:14px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);cursor:pointer;display:flex;align-items:center;gap:8px;padding:6px 10px;font:600 15px/1.2 var(--font-body,Mukta,sans-serif);text-align:left}
.sc-stains button i{flex:0 0 22px;height:22px;border-radius:50%;border:2px solid rgba(0,0,0,.2)}
.sc-stains button[aria-pressed=true]{border-color:var(--sc-ac);box-shadow:0 0 0 3px rgba(5,150,105,.25)}
.sc-chips{display:flex;flex-wrap:wrap;gap:8px}
.sc-chip{min-height:44px;border-radius:999px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);cursor:pointer;padding:6px 14px;font:600 15px/1.2 var(--font-body,Mukta,sans-serif)}
.sc-chip.sc-ok{border-color:#22C55E;background:rgba(34,197,94,.12)}
.sc-chip:hover{border-color:var(--sc-ac)}
.sc-steps{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.sc-steps li{display:flex;gap:10px;align-items:center;font-size:15px;padding:6px 10px;border-radius:12px;background:var(--sunk,#F1F5F9)}
.sc-steps li b{flex:0 0 26px;height:26px;border-radius:50%;background:#CBD5E1;color:#fff;display:grid;place-items:center;font-size:14px}
.sc-steps li.sc-on{background:rgba(34,197,94,.14)}
.sc-steps li.sc-on b{background:#22C55E}
.sc-q{font-weight:700;margin:0 0 8px}
.sc-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sc-opts button,.sc-btn{min-height:48px;border-radius:14px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);cursor:pointer;padding:6px 12px;font:600 15px/1.2 var(--font-body,Mukta,sans-serif)}
.sc-opts button:disabled{opacity:.45;cursor:not-allowed}
.sc-opts button.sc-bad{border-color:#FF6B57;background:rgba(255,107,87,.12);text-decoration:line-through}
.sc-opts button.sc-good,.sc-btn.sc-go{border-color:#22C55E;background:rgba(34,197,94,.16)}
.sc-btn.sc-pri{background:var(--sc-ac);border-color:var(--sc-ac);color:#fff}
.sc-note{margin:8px 0 0;font-size:14px;color:var(--ink-2,#475569)}
.sc-step{display:flex;align-items:center;gap:10px;margin:6px 0}
.sc-step output{min-width:56px;text-align:center;font:800 28px/1 var(--font-display,'Baloo 2',sans-serif)}
.sc-step button[data-c]{min-width:48px;min-height:48px;border-radius:50%;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font-size:24px;cursor:pointer;padding:0}
.sc-pad{display:block;width:100%;height:170px;border-radius:12px;border:2px dashed var(--line,#CBD5E1);background:#fff;touch-action:none;cursor:crosshair}
.sc-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.sc-about summary{cursor:pointer;font:700 16px/1.2 var(--font-display,'Baloo 2',sans-serif);min-height:44px;display:flex;align-items:center}
.sc-about p{margin:6px 0}
.sc-ord1{order:1}.sc-ord2{order:2}.sc-ord3{order:3}.sc-ord4{order:4}.sc-ord5{order:5}.sc-ord6{order:6}.sc-ord7{order:7}
.sc-wide .sc-ord1,.sc-wide .sc-ord2,.sc-wide .sc-ord3,.sc-wide .sc-ord4,.sc-wide .sc-ord5,.sc-wide .sc-ord6,.sc-wide .sc-ord7{order:0}
@media (prefers-reduced-motion: reduce){.sc-root *{transition:none!important;animation:none!important}}
`;

  // ---------------------------------------------------------------- the checkable parts of the template
  function validate(config) {
    const errs = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) return ['config must be an object like { slide: "onion-peel" }'];
    for (const k of Object.keys(config)) if (!['slide', 'stain', 'task'].includes(k)) errs.push(`unknown config key "${k}" (allowed: slide, stain, task)`);
    if (typeof config.slide !== 'string' || !SLIDES[config.slide]) errs.push(`slide must be one of: ${ORDER.join(', ')}`);
    if (config.stain !== undefined && !STAINS.includes(config.stain)) errs.push(`stain must be one of: ${STAINS.join(', ')}`);
    if (config.task !== undefined && !TASKS.includes(config.task)) errs.push(`task must be one of: ${TASKS.join(', ')}`);
    return errs;
  }
  function keys(config) {
    const S = config && SLIDES[config.slide], task = config && TASKS.includes(config.task) ? config.task : 'focus';
    const targets = ['knob:coarse', 'knob:fine', 'lens:4x', 'lens:10x', 'lens:40x', 'stain:none', 'stain:iodine', 'stain:methylene-blue', 'stain:safranin', 'pan:*'];
    const events = ['focused', 'zoomed:4x', 'zoomed:10x', 'zoomed:40x', 'stained'];
    if (task === 'identify' || !S) targets.push('part:*'); else S.parts.forEach(([id]) => targets.push('part:' + id));
    if (S) S.parts.forEach(([id]) => events.push('identified:' + id)); else events.push('identified:*');
    if (task !== 'focus') { targets.push('answer'); events.push('answered:right', 'answered:wrong'); }
    return { targets, events };
  }

  // ---------------------------------------------------------------- the microscope
  function scope(root, config, api) {
    const SL = SLIDES[config.slide], parts = partsOf(SL), task = TASKS.includes(config.task) ? config.task : 'focus';
    const doc = root.ownerDocument || document, win = doc.defaultView || window;
    const tr = (x) => api.t(x), lang = () => (api.lang ? api.lang() : 'en');
    const reduced = L.reducedMotion;
    const startStain = STAINS.includes(config.stain) ? config.stain : 'none';
    const fovOf = (li) => LENSES[li].fov * SL.s;
    const lenTxt = (um) => (um >= 1000 ? (um / 1000).toFixed(um >= 10000 ? 0 : 1) + (lang() === 'hi' ? ' मिमी' : ' mm') : (um >= 100 ? Math.round(um) : um >= 10 ? Math.round(um * 10) / 10 : Math.round(um * 100) / 100) + ' µm');
    const S = {
      lens: 0, lf: Math.log(fovOf(0)), zb: 0, cx: 0, cy: 0, coarse: 50, fine: 50, stain: startStain, stPrev: 'none', stT: startStain === 'none' ? 0 : 1,
      liveT: 3, killed: !!SL.live && startStain !== 'none', dirty: true, dirtyC: true, lvUp: 0, inst: [], cnts: [], mark: null, quiz: null, qn: 0, score: 0, ident: new Set(), flags: {}, latched: false, sharpT: 0, reveal: null,
      strokes: 0, count: 0, lastQ: null, bView: 4, live: '', lastLang: lang(), lastReady: null,
    };
    S.coarse = task === 'focus' ? clamp(SL.z0 + (SL.z0 > 50 ? -26 : 26), 0, 100) : SL.z0;
    const zOf = () => S.coarse + (S.fine - 50) * 0.06, z0Of = () => SL.z0 + LENSES[S.lens].z;
    const blurOf = () => clamp((Math.abs(zOf() - z0Of()) - LENSES[S.lens].dof) / LENSES[S.lens].spread, 0, 4);
    S.latched = blurOf() < 0.12;

    root.innerHTML = `
<div class="sc-root">
 <div class="sc-left">
  <div class="sc-eye"><canvas class="sc-cv" tabindex="0" role="img"></canvas><div class="sc-badge" aria-hidden="true"></div><div class="sc-region"></div></div>
  <div class="sc-row">
   <div class="sc-pan" role="group" aria-label="${esc(tr(UI.move))}">
    <button type="button" class="sc-pu" data-key="pan:up" data-d="up"></button><button type="button" class="sc-pl" data-key="pan:left" data-d="left"></button>
    <button type="button" class="sc-pc" data-key="pan:centre" data-d="centre"></button><button type="button" class="sc-pr" data-key="pan:right" data-d="right"></button><button type="button" class="sc-pd" data-key="pan:down" data-d="down"></button>
   </div>
   <div class="sc-meter"><div class="sc-mlab"><span class="sc-mt"></span><b class="sc-mv"></b></div><div class="sc-mbar" aria-hidden="true"><i></i></div></div>
  </div>
  <div class="sc-say" aria-live="polite"></div>
 </div>
 <div class="sc-right">
  <section class="sc-card sc-top sc-ord6"></section>
  <section class="sc-card sc-ord1"><h3 class="sc-t-lens"></h3><div class="sc-lens" role="group"></div></section>
  <section class="sc-card sc-ord2"><h3 class="sc-t-focus"></h3>
   <div class="sc-krow" data-key="knob:coarse"><div class="sc-kt"><span class="sc-k1"></span><small class="sc-k1s"></small></div><div class="sc-ks"><button type="button" data-k="coarse" data-s="-4" aria-label="-">&minus;</button><input class="sc-rng" type="range" min="0" max="100" step="1" data-k="coarse"><button type="button" data-k="coarse" data-s="4" aria-label="+">+</button></div></div>
   <div class="sc-krow" data-key="knob:fine"><div class="sc-kt"><span class="sc-k2"></span><small class="sc-k2s"></small></div><div class="sc-ks"><button type="button" data-k="fine" data-s="-3" aria-label="-">&minus;</button><input class="sc-rng sc-fi" type="range" min="0" max="100" step="1" data-k="fine"><button type="button" data-k="fine" data-s="3" aria-label="+">+</button></div></div>
  </section>
  <section class="sc-card sc-ord3"><h3 class="sc-t-stain"></h3><p class="sc-sub sc-t-stains"></p><div class="sc-stains" role="group"></div></section>
  <section class="sc-card sc-task sc-ord4"></section>
  <section class="sc-card sc-ord5 sc-partsbox"><h3 class="sc-t-parts"></h3><p class="sc-sub sc-t-partss"></p><div class="sc-chips"></div></section>
  <details class="sc-card sc-about sc-ord7"><summary class="sc-t-about"></summary><div class="sc-abt"></div></details>
 </div>
</div>`;
    const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
    const rootEl = $('.sc-root'), cv = $('.sc-cv'), dctx = cv.getContext('2d'), F = doc.createElement('canvas'), fc = F.getContext('2d');
    const lv = [F]; const lvc = [fc];
    const sayEl = $('.sc-say'), taskEl = $('.sc-task');
    let destroyed = false, raf = 0, last = 0, stopZoom = null, stopStain = null, lastScene = 0, qReady = false;
    const timers = [];

    // ---------------- helpers for the interface
    const say = (txt) => { S.sayTxt = txt; sayEl.textContent = txt; };
    const toast = (m) => { try { api.toast(m); } catch (e) { /* the toast is optional */ } };
    const allow = (key) => { if (api.allowed(key)) return true; api.nudge(key); return false; };
    const stainDot = { none: 'conic-gradient(#fff,#e2e8f0,#fff)', iodine: STAIN_COL.iodine, 'methylene-blue': STAIN_COL['methylene-blue'], safranin: STAIN_COL.safranin };
    const partName = (id) => tr(PART[id][0]);
    const lensTxtShort = (i) => LENSES[i].id;

    function buildStatic() {
      $('.sc-lens').innerHTML = LENSES.map((l, i) => `<button type="button" data-key="lens:${l.id}" data-l="${i}" aria-pressed="${i === S.lens}"><b>${l.x}×</b><span>${esc(tr(LNAME[i]))}</span></button>`).join('');
      $('.sc-stains').innerHTML = STAINS.map((s) => `<button type="button" data-key="stain:${s}" data-s="${s}" aria-pressed="${s === S.stain}"><i style="background:${stainDot[s]}"></i>${esc(tr(STAIN_NAME[s]))}</button>`).join('');
    }
    function applyText() {
      $('.sc-t-lens').textContent = tr(UI.lens); $('.sc-t-focus').textContent = tr(UI.focus); $('.sc-t-stain').textContent = tr(UI.stain); $('.sc-t-stains').textContent = tr(UI.stainSub);
      $('.sc-t-parts').textContent = tr(UI.parts); $('.sc-t-partss').textContent = tr(UI.partsSub); $('.sc-t-about').textContent = tr(UI.about);
      $('.sc-k1').textContent = tr(UI.coarse); $('.sc-k1s').textContent = tr(UI.coarseSub); $('.sc-k2').textContent = tr(UI.fine); $('.sc-k2s').textContent = tr(UI.fineSub);
      $('.sc-mt').textContent = tr(UI.sharp);
      const arrows = { up: '▲', left: '◀', centre: '●', right: '▶', down: '▼' };
      $$('.sc-pan button').forEach((b) => { b.textContent = arrows[b.dataset.d]; b.setAttribute('aria-label', tr(UI.move) + ': ' + tr(UI[b.dataset.d])); b.title = tr(UI[b.dataset.d]); });
      $$('.sc-ks button').forEach((b) => b.setAttribute('aria-label', tr(b.dataset.k === 'coarse' ? UI.coarse : UI.fine) + (+b.dataset.s > 0 ? ' +' : ' −')));
      $$('.sc-rng').forEach((r) => r.setAttribute('aria-label', tr(r.dataset.k === 'coarse' ? UI.coarse : UI.fine) + ' — ' + tr(r.dataset.k === 'coarse' ? UI.coarseSub : UI.fineSub)));
      buildStatic();
      $('.sc-abt').innerHTML = `<p>${esc(tr(SL.fact))}</p><p><b>${esc(tr(SL.real))}</b></p>${SL.note ? `<p class="sc-note">${esc(tr(SL.note))}</p>` : ''}`;
      cv.setAttribute('aria-label', tr(SL.name) + '. ' + tr(SL.fact));
      renderTop(); renderTask(); renderParts();
    }
    function microscopeSVG() {
      return `<svg viewBox="0 0 140 170" aria-hidden="true" focusable="false">
<defs><linearGradient id="sc-g1" x1="0" x2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient><radialGradient id="sc-g2"><stop offset="0" stop-color="#FFF3B0"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient></defs>
<rect x="18" y="148" width="104" height="15" rx="7.5" fill="#061233"/><rect x="24" y="150" width="92" height="3" rx="1.5" fill="#2563EB" opacity=".7"/>
<path d="M100 148 C130 138 130 86 104 50" stroke="url(#sc-g1)" stroke-width="14" fill="none" stroke-linecap="round"/>
<rect x="52" y="26" width="58" height="24" rx="9" fill="url(#sc-g1)"/><rect x="62" y="4" width="18" height="28" rx="5" fill="#061233"/><rect x="64" y="6" width="5" height="22" rx="2.5" fill="#fff" opacity=".25"/>
<ellipse cx="70" cy="56" rx="24" ry="6.5" fill="#0F766E"/>
<rect class="sc-o" data-i="0" x="49" y="56" width="9" height="15" rx="3.5"/><rect class="sc-o" data-i="1" x="66" y="58" width="9" height="21" rx="3.5"/><rect class="sc-o" data-i="2" x="83" y="56" width="9" height="27" rx="3.5"/>
<ellipse cx="65" cy="124" rx="22" ry="8" fill="url(#sc-g2)"/><rect x="30" y="103" width="70" height="8" rx="4" fill="#334155"/>
<rect x="44" y="97" width="44" height="7" rx="2" fill="#E0F2FE" opacity=".95"/><ellipse class="sc-spec" cx="66" cy="100" rx="9" ry="2.2" fill="${SL.tint}"/>
<g transform="translate(116 104)"><circle r="13" fill="#FF7A1A" stroke="#fff" stroke-width="1.5"/><g class="sc-kc"><circle cx="0" cy="-8" r="2.6" fill="#fff"/><circle cx="7" cy="4" r="2.6" fill="#fff"/><circle cx="-7" cy="4" r="2.6" fill="#fff"/></g><circle r="6.5" fill="#8B3DFF" stroke="#fff" stroke-width="1.2"/><g class="sc-kf"><line x1="0" y1="-5.5" x2="0" y2="0" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g></g></svg>`;
    }
    function renderTop() {
      const tot = LENSES[S.lens].x * 10, fov = Math.exp(S.lf);
      $('.sc-top').innerHTML = `${microscopeSVG()}<div><b>${esc(tr(SL.name))}</b><p>${esc(tr(SL.kind))}</p><p>${esc(tr(UI.total))}: <b style="display:inline;font-size:15px">${tot}×</b> (${LENSES[S.lens].x}× ${esc(tr(UI.eyepiece))})</p><p>${esc(tr(UI.field))}: ${esc(lenTxt(fov))} ${esc(tr(UI.across))}</p></div>`;
      paintScopeSvg();
    }
    function paintScopeSvg() {
      $$('.sc-o').forEach((o) => o.setAttribute('fill', +o.dataset.i === S.lens ? '#FFD23F' : '#94A3B8'));
      const kc = $('.sc-kc'), kf = $('.sc-kf'); if (kc) kc.setAttribute('transform', `rotate(${S.coarse * 7.2})`); if (kf) kf.setAttribute('transform', `rotate(${S.fine * 10.8})`);
    }
    function renderParts() {
      const box = $('.sc-partsbox'); if (task === 'identify') { box.style.display = 'none'; return; }
      box.style.display = '';
      $('.sc-chips').innerHTML = parts.map((p) => `<button type="button" class="sc-chip${S.ident.has(p.id) ? ' sc-ok' : ''}" data-key="part:${p.id}" data-p="${p.id}">${S.ident.has(p.id) ? '✓ ' : ''}${task === 'draw' && SL.core.includes(p.id) ? '★ ' : ''}${esc(tr(p.n))}</button>`).join('');
    }
    function stepList() {
      const f = S.flags, st = [[tr(UI.f1), f.coarse], [tr(UI.f2), f.fine], [tr(UI.f3), f.zoom], [tr(UI.f4), f.refocus]];
      return `<ol class="sc-steps">${st.map((s, i) => `<li class="${s[1] ? 'sc-on' : ''}"><b>${s[1] ? '✓' : i + 1}</b><span>${esc(s[0])}</span></li>`).join('')}</ol>`;
    }
    function nextQuestion() {
      const order = parts.filter((p) => p.id !== S.lastQ);
      const rot = order.map((p, i) => order[(i + S.qn) % order.length]);
      const ready = rot.find((p) => p.min <= S.lens && bestInst(p.id));
      const pick = ready || rot.find((p) => p.min <= S.lens) || rot[0];
      const wrong = parts.filter((p) => p.id !== pick.id).sort((a, b) => h32(S.qn, a.id.length, a.id.charCodeAt(0)) - h32(S.qn, b.id.length, b.id.charCodeAt(0))).slice(0, Math.min(3, parts.length - 1));
      const opts = wrong.concat(pick).sort((a, b) => h32(S.qn + 1, a.id.length, a.id.charCodeAt(1) || 0) - h32(S.qn + 1, b.id.length, b.id.charCodeAt(1) || 0));
      S.quiz = { id: pick.id, opts: opts.map((p) => p.id), bad: new Set(), solved: false }; S.lastQ = pick.id; S.qn++;
    }
    function renderTask() {
      const el = taskEl;
      if (task === 'focus') {
        el.innerHTML = `<h3>${esc(tr(UI.focusTitle))}</h3>${stepList()}`;
      } else if (task === 'identify') {
        if (!S.quiz) nextQuestion();
        const q = S.quiz, p = parts.find((x) => x.id === q.id), vis = !!bestInst(q.id) && S.bView < 1.1 && S.lens >= p.min, minL = LENSES[Math.max(0, p.min)].x + '×';
        qReady = vis;
        el.innerHTML = `<h3>${esc(tr(UI.findTitle))} <small style="font-weight:400">· ${esc(tr(UI.score))}: ${S.score}</small></h3><p class="sc-q">${esc(tr(UI.arrowQ))}</p>
<div class="sc-opts" data-key="answer" role="group">${q.opts.map((id) => `<button type="button" data-key="part:${id}" data-o="${id}" class="${q.bad.has(id) ? 'sc-bad' : q.solved && id === q.id ? 'sc-good' : ''}"${(vis && !q.solved) && !q.bad.has(id) ? '' : ' disabled'}>${esc(partName(id))}</button>`).join('')}</div>
${vis || q.solved ? '' : `<p class="sc-note">${esc(fmt(tr(UI.needView), { l: minL }))}</p>`}${q.solved ? `<div class="sc-acts"><button type="button" class="sc-btn sc-pri" data-nx="1">${esc(tr(UI.next))}</button></div>` : ''}`;
      } else if (task === 'count') {
        el.innerHTML = `<h3>${esc(tr(UI.countTitle))}</h3><p class="sc-q">${esc(fmt(tr(UI.countQ), { n: tr(SL.count) }))}</p><p class="sc-sub">${esc(tr(UI.countHint))}</p>
<div class="sc-step" role="group" aria-label="${esc(tr(UI.yourCount))}"><button type="button" data-c="-1" aria-label="${esc(tr(UI.minus))}">&minus;</button><output aria-live="off">${S.count}</output><button type="button" data-c="1" aria-label="${esc(tr(UI.plus))}">+</button>
<button type="button" class="sc-btn sc-pri" data-key="answer" data-chk="1">${esc(tr(UI.check))}</button></div>`;
      } else {
        el.innerHTML = `<h3>${esc(tr(UI.drawTitle))}</h3><p class="sc-q">${esc(tr(UI.drawQ))}</p><canvas class="sc-pad" aria-label="${esc(tr(UI.pad))}" role="img"></canvas><p class="sc-sub" style="margin:6px 0 0">${esc(tr(UI.rules))}</p>
<div class="sc-acts"><button type="button" class="sc-btn" data-clr="1">${esc(tr(UI.clear))}</button><button type="button" class="sc-btn sc-pri" data-key="answer" data-chk="1">${esc(tr(UI.checkDraw))}</button></div>`;
        initPad();
      }
    }

    // ---------------- the drawing pad (task: draw)
    let padLines = [];
    function initPad() {
      const pad = $('.sc-pad'); if (!pad) return;
      const w = Math.max(200, pad.clientWidth || 300), dpr = Math.min(win.devicePixelRatio || 1, 2); pad.width = Math.round(w * dpr); pad.height = Math.round(170 * dpr);
      const px = pad.getContext('2d'); px.scale(dpr, dpr);
      const paint = () => { px.clearRect(0, 0, w, 170); px.strokeStyle = 'rgba(100,116,139,.12)'; px.lineWidth = 1; for (let x = 20; x < w; x += 20) { px.beginPath(); px.moveTo(x, 0); px.lineTo(x, 170); px.stroke(); } for (let y = 20; y < 170; y += 20) { px.beginPath(); px.moveTo(0, y); px.lineTo(w, y); px.stroke(); }
        px.strokeStyle = '#334155'; px.lineWidth = 2; px.lineCap = 'round'; px.lineJoin = 'round'; padLines.forEach((l) => { px.beginPath(); l.forEach((p, i) => (i ? px.lineTo(p[0], p[1]) : px.moveTo(p[0], p[1]))); if (l.length === 1) px.lineTo(l[0][0] + 0.1, l[0][1]); px.stroke(); }); };
      paint(); let cur = null;
      const pos = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      pad.addEventListener('pointerdown', (e) => { cur = [pos(e)]; padLines.push(cur); try { pad.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } paint(); });
      pad.addEventListener('pointermove', (e) => { if (!cur) return; const p = pos(e), q = cur[cur.length - 1]; S.strokes += Math.hypot(p[0] - q[0], p[1] - q[1]); cur.push(p); paint(); });
      const end = () => { cur = null; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      pad.__paint = paint;
    }

    // ---------------- instances (the points of interest the slide reported when it was drawn)
    function geom() { const W = cv.width, k = (W * 0.96) / Math.exp(S.lf); return { W, k, Rv: (W * 0.48) / k }; }
    function bestInst(id) {
      const { Rv } = geom(); let best = null, bd = 1e18;
      for (const q of S.inst) { if (q.p !== id) continue; const d = Math.hypot(q.x - S.cx, q.y - S.cy); if (d < Rv * 0.84 && d < bd) { bd = d; best = q; } }
      return best;
    }

    // ---------------- drawing a frame
    function sizeCanvases() {
      const w = Math.max(240, Math.round(cv.clientWidth || 320)), dpr = Math.min(win.devicePixelRatio || 1, 1.6), size = Math.round(w * dpr);
      if (cv.width === size) return;
      cv.width = cv.height = size; F.width = F.height = size; lv.length = 1; lvc.length = 1; S.dirty = true; S.lvUp = 0;
    }
    function level(i) {
      if (!lv[i]) { const c = doc.createElement('canvas'); lv[i] = c; lvc[i] = c.getContext('2d'); }
      const w = Math.max(8, Math.ceil(F.width / Math.pow(2, i)));
      if (lv[i].width !== w) { lv[i].width = w; lv[i].height = w; S.lvUp = Math.min(S.lvUp, i - 1); }
      return lv[i];
    }
    function makeEnv(W, k) {
      const cc = {}, Rv = (W * 0.48) / k, inst = [], cnts = [], cx = S.cx, cy = S.cy, hw = W / 2 / k;
      const aff = (s, kind, mbm) => (s === 'none' ? 0 : (AFF[s][kind] || 0) * (s === 'methylene-blue' && mbm != null ? mbm : 1));
      const E = {
        c: fc, k, cx, cy, x0: cx - hw, x1: cx + hw, y0: cy - hw, y1: cy + hw, t: S.liveT, lens: S.lens, inst, cnts, stainNow: S.stain, stainPrev: S.stPrev, Rv,
        col(kind, base, mbm) {
          const key = kind + base + (mbm == null ? '' : mbm); if (cc[key]) return cc[key];
          let c1 = base, w = aff(S.stPrev, kind, mbm) * (1 - S.stT); if (w > 0.002) c1 = mixHex(c1, stainColour(S.stPrev, kind), w);
          w = aff(S.stain, kind, mbm) * S.stT; if (w > 0.002) c1 = mixHex(c1, stainColour(S.stain, kind), w);
          return (cc[key] = c1);
        },
        w: (um, minPx) => Math.max(um, minPx / k),
        near: (x, y, m) => Math.hypot(x - cx, y - cy) < Rv + m,
        mark(p, x, y, r) { if (Math.hypot(x - cx, y - cy) < Rv * 1.1) inst.push({ p, x, y, r }); },
        cnt(x, y) { if (Math.hypot(x - cx, y - cy) < Rv * 1.05) cnts.push([x, y]); },
        tiles(T, m, fn, salt) {
          const i0 = Math.floor((E.x0 - m) / T), i1 = Math.floor((E.x1 + m) / T), j0 = Math.floor((E.y0 - m) / T), j1 = Math.floor((E.y1 + m) / T);
          if ((i1 - i0 + 1) * (j1 - j0 + 1) > 5000) return;
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, rngOf(SL.sd + (salt || 0), i, j), i * T, j * T);
        },
      };
      return E;
    }
    function renderScene() {
      const W = F.width, k = (W * 0.96) / Math.exp(S.lf), E = makeEnv(W, k);
      fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalAlpha = 1; fc.fillStyle = SL.bg; fc.fillRect(0, 0, W, W);
      fc.setTransform(k, 0, 0, k, W / 2 - S.cx * k, W / 2 - S.cy * k);
      fc.save();
      try { SL.draw(E); } catch (e) { S.err = e; }
      fc.restore(); fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalAlpha = 1; fc.lineCap = 'butt'; fc.setLineDash([]);
      S.inst = E.inst; S.cnts = E.cnts; S.lvUp = 0; S.dirty = false;
    }
    let grain = null;
    function grainPattern() {
      if (grain) return grain;
      const g = doc.createElement('canvas'); g.width = g.height = 96; const x = g.getContext('2d'), id = x.createImageData(96, 96), r = rng(77);
      for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      x.putImageData(id, 0, 0); return (grain = dctx.createPattern(g, 'repeat'));
    }
    function composite(now) {
      const W = cv.width, R = W * 0.48, b = clamp(S.bView, 0, 4);
      dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.fillStyle = '#05080f'; dctx.fillRect(0, 0, W, W);
      dctx.save(); dctx.beginPath(); dctx.arc(W / 2, W / 2, R, 0, TAU); dctx.clip(); dctx.imageSmoothingEnabled = true; dctx.imageSmoothingQuality = 'high';
      const lo = Math.floor(b), fr = b - lo, need = Math.min(4, Math.ceil(b));
      while (S.lvUp < need) { const n = S.lvUp + 1, c = level(n); lvc[n].imageSmoothingEnabled = true; lvc[n].clearRect(0, 0, c.width, c.height); lvc[n].drawImage(lv[n - 1], 0, 0, c.width, c.height); S.lvUp = n; }
      dctx.drawImage(lo === 0 ? F : lv[lo], 0, 0, W, W);
      if (fr > 0.02 && lo < 4) { dctx.globalAlpha = fr; dctx.drawImage(lv[lo + 1], 0, 0, W, W); dctx.globalAlpha = 1; }
      const vg = dctx.createRadialGradient(W / 2, W / 2, R * 0.55, W / 2, W / 2, R); vg.addColorStop(0, 'rgba(255,248,225,0)'); vg.addColorStop(0.8, 'rgba(20,16,0,.10)'); vg.addColorStop(1, 'rgba(0,0,0,.42)'); dctx.fillStyle = vg; dctx.fillRect(0, 0, W, W);
      dctx.globalAlpha = 0.045; dctx.fillStyle = grainPattern(); dctx.fillRect(0, 0, W, W); dctx.globalAlpha = 1;
      dctx.restore();
      dctx.beginPath(); dctx.arc(W / 2, W / 2, R, 0, TAU); dctx.lineWidth = Math.max(3, W * 0.012); dctx.strokeStyle = '#0b1220'; dctx.stroke();
      dctx.beginPath(); dctx.arc(W / 2, W / 2, R + W * 0.006, 0, TAU); dctx.lineWidth = Math.max(1.5, W * 0.004); dctx.strokeStyle = 'rgba(255,255,255,.18)'; dctx.stroke();
      overlays(now, W, R);
    }
    const niceLen = (um) => { const p = Math.pow(10, Math.floor(Math.log10(um))), m = um / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
    function overlays(now, W, R) {
      const k = (W * 0.96) / Math.exp(S.lf), u = W / 560, f = (px) => px * Math.max(1, u * 1.15);
      // scale bar
      const L1 = niceLen((R * 0.7) / k), bw = L1 * k, bx = W / 2 - bw / 2, by = W / 2 + R * 0.84;
      dctx.lineWidth = f(5); dctx.lineCap = 'butt'; dctx.strokeStyle = 'rgba(0,0,0,.65)'; dctx.beginPath(); dctx.moveTo(bx - 1, by); dctx.lineTo(bx + bw + 1, by); dctx.stroke();
      dctx.lineWidth = f(3); dctx.strokeStyle = '#fff'; dctx.beginPath(); dctx.moveTo(bx, by); dctx.lineTo(bx + bw, by); dctx.stroke();
      dctx.font = `700 ${f(13)}px Mukta, system-ui, sans-serif`; dctx.textAlign = 'center'; dctx.lineWidth = f(3); dctx.strokeStyle = 'rgba(0,0,0,.7)'; dctx.fillStyle = '#fff';
      const lab = lenTxt(L1); dctx.strokeText(lab, W / 2, by - f(7)); dctx.fillText(lab, W / 2, by - f(7));
      const pulse = reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(now / 180);
      const toScr = (q) => [W / 2 + (q.x - S.cx) * k, W / 2 + (q.y - S.cy) * k];
      const label = (txt, x, y) => {
        dctx.font = `700 ${f(14)}px Mukta, system-ui, sans-serif`; const tw = dctx.measureText(txt).width + f(16), th = f(24); let lx = clamp(x - tw / 2, W * 0.03, W * 0.97 - tw), ly = clamp(y, W * 0.03, W * 0.97 - th);
        dctx.fillStyle = 'rgba(6,18,51,.88)'; dctx.beginPath(); dctx.roundRect ? dctx.roundRect(lx, ly, tw, th, f(12)) : dctx.rect(lx, ly, tw, th); dctx.fill(); dctx.fillStyle = '#fff'; dctx.textAlign = 'center'; dctx.fillText(txt, lx + tw / 2, ly + th * 0.69);
      };
      if (S.mark) {
        if (now - S.mark.t0 > 5200) S.mark = null;
        else { const q = bestInst(S.mark.id); if (q) { const [sx, sy] = toScr(q), rr0 = Math.max(q.r * k, f(22)) + pulse * f(5); dctx.lineWidth = f(4); dctx.strokeStyle = 'rgba(0,0,0,.6)'; dctx.beginPath(); dctx.arc(sx, sy, rr0, 0, TAU); dctx.stroke(); dctx.lineWidth = f(2.5); dctx.strokeStyle = '#FFD23F'; dctx.beginPath(); dctx.arc(sx, sy, rr0, 0, TAU); dctx.stroke(); label(partName(S.mark.id), sx, sy - rr0 - f(32)); } }
      }
      if (task === 'identify' && S.quiz && !S.quiz.solved) {
        const q = bestInst(S.quiz.id), p = parts.find((x) => x.id === S.quiz.id);
        if (q && S.lens >= p.min) {
          const [sx, sy] = toScr(q), off = f(54) + pulse * f(8), tx = sx + off * 0.8, ty = sy - off * 0.8, gap = Math.max(q.r * k * 0.8, f(10));
          const ex = sx + gap * 0.7, ey = sy - gap * 0.7;
          dctx.lineCap = 'round'; dctx.lineJoin = 'round';
          for (const [w2, col] of [[f(8), 'rgba(255,255,255,.95)'], [f(4.5), '#FF7A1A']]) { dctx.lineWidth = w2; dctx.strokeStyle = col; dctx.beginPath(); dctx.moveTo(tx, ty); dctx.lineTo(ex, ey); dctx.stroke(); const a = Math.atan2(ey - ty, ex - tx); dctx.beginPath(); dctx.moveTo(ex - Math.cos(a - 0.5) * f(14), ey - Math.sin(a - 0.5) * f(14)); dctx.lineTo(ex, ey); dctx.lineTo(ex - Math.cos(a + 0.5) * f(14), ey - Math.sin(a + 0.5) * f(14)); dctx.stroke(); }
        }
      }
      if (S.reveal) {
        if (now - S.reveal.t0 > 7000) S.reveal = null;
        else { dctx.font = `800 ${f(13)}px Mukta, system-ui, sans-serif`; dctx.textAlign = 'center'; S.reveal.list.forEach((p, i) => { const sx = W / 2 + (p[0] - S.cx) * k, sy = W / 2 + (p[1] - S.cy) * k; dctx.beginPath(); dctx.arc(sx, sy, f(11), 0, TAU); dctx.fillStyle = '#FF7A1A'; dctx.fill(); dctx.lineWidth = f(2); dctx.strokeStyle = '#fff'; dctx.stroke(); dctx.fillStyle = '#fff'; dctx.fillText(String(i + 1), sx, sy + f(4.5)); }); }
      }
    }

    // ---------------- focus, zoom, stain, pan
    function updateMeter() {
      const b = S.bView, lvl = b < 0.12 ? 0 : b < 0.7 ? 1 : b < 2 ? 2 : 3;
      $('.sc-mbar i').style.width = Math.round(clamp(b / 4, 0, 1) * 100) + '%'; $('.sc-mv').textContent = tr(UI['s' + lvl]);
      if (S.live !== lvl) { S.live = lvl; }
    }
    function setKnob(kind, v, fromUser) {
      v = clamp(Math.round(v), 0, 100); if (S[kind] === v) return;
      const key = 'knob:' + kind; if (fromUser && !allow(key)) { syncKnobs(); return; }
      S[kind] = v; S.flags[kind] = true; syncKnobs(); S.dirtyC = true; paintScopeSvg();
      if (task === 'focus') renderTask();
    }
    function syncKnobs() { $$('.sc-rng').forEach((r) => { r.value = S[r.dataset.k]; }); }
    function setLens(i) {
      const id = LENSES[i].id; if (!allow('lens:' + id) || i === S.lens) { if (i === S.lens) say(fmt(tr(MSG.zoomed), { x: LENSES[i].x, f: lenTxt(Math.exp(S.lf)) }).split('.')[0] + '.'); return; }
      const from = S.lf, to = Math.log(fovOf(i)); S.lens = i; if (i > 0) S.flags.zoom = true; if (stopZoom) stopZoom();
      stopZoom = L.tween(650, (t) => { S.lf = from + (to - from) * L.ease(t); S.zb = reduced() ? 0 : 1.6 * Math.sin(Math.PI * t); S.dirty = true; }, () => { S.zb = 0; S.lf = to; S.dirty = true; stopZoom = null; renderTop(); });
      $$('.sc-lens button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.l === i)));
      renderTop(); api.emit('zoomed:' + id); api.record(tr(T2('Changed to the ', 'बदला: ')) + LENSES[i].x + (lang() === 'hi' ? '× लेंस' : 'x lens'));
      say(fmt(tr(MSG.zoomed), { x: LENSES[i].x, f: lenTxt(fovOf(i)) + ' ' + tr(UI.across) }));
      S.mark = null; if (task === 'focus') renderTask(); if (task === 'identify') renderTask();
    }
    function setStain(name) {
      if (!allow('stain:' + name)) return; if (name === S.stain) { say(name === 'none' ? tr(MSG.fresh) : tr(STAIN_NOTE[name])); return; }
      S.stPrev = S.stain; S.stain = name; S.stT = 0; if (stopStain) stopStain();
      stopStain = L.tween(950, (t) => { S.stT = t; S.dirty = true; }, () => { S.stT = 1; S.stPrev = 'none'; S.dirty = true; stopStain = null; });
      if (SL.live) S.killed = name !== 'none';
      $$('.sc-stains button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === name)));
      if (name === 'none') { say(SL.live ? tr(MSG.freshLive) : tr(MSG.fresh)); api.record(tr(T2('Used a fresh slide', 'ताज़ा स्लाइड ली'))); }
      else { say((SL.sx && SL.sx[name] ? tr(SL.sx[name]) : tr(STAIN_NOTE[name])) + (SL.live ? ' ' + tr(MSG.liveDead) : '')); api.emit('stained'); api.record(tr(T2('Stained the slide with ', 'स्लाइड पर रंग डाला: ')) + tr(STAIN_NAME[name])); }
    }
    function panBy(dx, dy) { S.cx = clamp(S.cx + dx, -SL.ext.x, SL.ext.x); S.cy = clamp(S.cy + dy, -SL.ext.y, SL.ext.y); S.dirty = true; S.mark = null; updateRegion(); }
    function updateRegion() { const r = $('.sc-region'); r.textContent = SL.where ? tr(SL.where(S.cx)) : ''; }
    function panBtn(d) {
      if (!allow('pan:' + d)) return; const st = Math.exp(S.lf) * 0.2;
      if (d === 'centre') { S.cx = 0; S.cy = 0; S.dirty = true; S.mark = null; updateRegion(); return; }
      panBy(d === 'left' ? -st : d === 'right' ? st : 0, d === 'up' ? -st : d === 'down' ? st : 0);
    }

    // ---------------- finding parts, quiz, count, draw
    function showPart(id) {
      const p = parts.find((x) => x.id === id), nm = tr(p.n);
      if (S.lens < p.min) { say(fmt(tr(MSG.tooSmall), { n: nm, l: LENSES[p.min].x + '×' })); return false; }
      if (S.bView > 1.0) { say(tr(MSG.focusFirst)); return false; }
      if (!bestInst(id)) { say(fmt(tr(MSG.notHere), { n: nm })); return false; }
      S.mark = { id, t0: performance.now() }; say(fmt(tr(MSG.thatIs), { n: nm, h: tr(p.job) }) + ' ' + tr(p.look));
      if (!S.ident.has(id)) { S.ident.add(id); renderParts(); }
      api.emit('identified:' + id); api.record(tr(T2('Found the ', 'ढूँढा: ')) + nm); try { api.speak(nm); } catch (e) { /* optional */ }
      return true;
    }
    function answerQuiz(id) {
      const q = S.quiz; if (!q || q.solved) return; const key = 'part:' + id; if (!allow(key)) return;
      const right = parts.find((p) => p.id === q.id), picked = parts.find((p) => p.id === id);
      if (id === q.id) {
        q.solved = true; S.score++; say(fmt(tr(MSG.right), { n: tr(right.n) }) + ' ' + tr(right.job)); api.emit('identified:' + id); api.emit('answered:right'); api.record(tr(T2('Named the ', 'नाम बताया: ')) + tr(right.n)); S.ident.add(id);
        if (S.score % 3 === 0) { try { api.celebrate(); } catch (e) { /* optional */ } }
      } else { q.bad.add(id); say(fmt(tr(MSG.wrong), { h: tr(right.look) }) + ' (' + tr(picked.n) + ': ' + tr(picked.look) + ')'); api.emit('answered:wrong'); api.record(tr(T2('Mixed up a part with the ', 'भाग को ग़लत समझा: ')) + tr(picked.n)); }
      renderTask();
    }
    function countInView() { const { W, k } = { W: cv.width, k: (cv.width * 0.96) / Math.exp(S.lf) }, R = (W * 0.46) / k; return S.cnts.filter((p) => Math.hypot(p[0] - S.cx, p[1] - S.cy) < R); }
    function checkCount() {
      if (!allow('answer')) return; if (S.bView > 1.0) { say(tr(MSG.focusFirst)); return; }
      const list = countInView(), n = list.length;
      if (n === 0) { say(tr(MSG.cNone)); return; } if (n > 40) { say(tr(MSG.cMany)); return; }
      const tol = n > 12 ? 1 : 0;
      if (Math.abs(S.count - n) <= tol) { say(fmt(tr(MSG.cRight), { n })); api.emit('answered:right'); api.record(tr(T2('Counted correctly: ', 'सही गिना: ')) + n); try { api.celebrate(); } catch (e) { /* optional */ } }
      else { S.reveal = { list: list.slice().sort((a, b) => a[0] - b[0]), t0: performance.now() }; say(fmt(tr(MSG.cWrong), { n })); api.emit('answered:wrong'); api.record(tr(T2('Counted ', 'गिना: ')) + S.count + tr(T2(' but there were ', ' पर थीं ')) + n); }
    }
    function checkDraw() {
      if (!allow('answer')) return;
      if (S.strokes < 150) { say(tr(MSG.dNone)); api.emit('answered:wrong'); return; }
      const miss = SL.core.filter((id) => !S.ident.has(id));
      if (miss.length) { say(fmt(tr(MSG.dMiss), { n: miss.map(partName).join(', ') })); api.emit('answered:wrong'); return; }
      say(tr(MSG.dRight)); api.emit('answered:right'); api.record(tr(T2('Drew and labelled the slide', 'चित्र बनाकर नाम दिए'))); try { api.celebrate(); } catch (e) { /* optional */ }
    }

    // ---------------- events
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); timers.push(() => el.removeEventListener(ev, fn, opt)); };
    on(root, 'click', (e) => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.l != null) setLens(+b.dataset.l);
      else if (b.dataset.s && b.closest('.sc-stains')) setStain(b.dataset.s);
      else if (b.dataset.k) { const kind = b.dataset.k; setKnob(kind, S[kind] + +b.dataset.s, true); }
      else if (b.dataset.d) panBtn(b.dataset.d);
      else if (b.dataset.p) { if (allow('part:' + b.dataset.p)) showPart(b.dataset.p); }
      else if (b.dataset.o) answerQuiz(b.dataset.o);
      else if (b.dataset.nx) { nextQuestion(); S.mark = null; renderTask(); say(''); }
      else if (b.dataset.c) { S.count = clamp(S.count + +b.dataset.c, 0, 99); const o = taskEl.querySelector('output'); if (o) o.textContent = S.count; }
      else if (b.dataset.clr) { padLines = []; S.strokes = 0; const pad = $('.sc-pad'); if (pad && pad.__paint) pad.__paint(); }
      else if (b.dataset.chk) { if (task === 'count') checkCount(); else checkDraw(); }
    });
    on(root, 'input', (e) => { const r = e.target.closest('.sc-rng'); if (r) setKnob(r.dataset.k, +r.value, true); });
    let drag = null;
    on(cv, 'pointerdown', (e) => { if (!api.allowed('pan:drag')) { drag = { x: e.clientX, y: e.clientY, tap: true, blocked: true }; return; } drag = { x: e.clientX, y: e.clientY, cx: S.cx, cy: S.cy, moved: false, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } });
    on(cv, 'pointermove', (e) => {
      if (!drag || drag.blocked) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return; drag.moved = true; const s = cv.width / cv.clientWidth, k = (cv.width * 0.96) / Math.exp(S.lf);
      S.cx = clamp(drag.cx - (dx * s) / k, -SL.ext.x, SL.ext.x); S.cy = clamp(drag.cy - (dy * s) / k, -SL.ext.y, SL.ext.y); S.dirty = true; S.mark = null; updateRegion();
    });
    on(cv, 'pointerup', (e) => {
      const d = drag; drag = null; if (!d) return;
      if (d.blocked) { api.nudge('pan:drag'); return; }
      if (d.moved) return;
      const r = cv.getBoundingClientRect(), s = cv.width / r.width, k = (cv.width * 0.96) / Math.exp(S.lf), wx = S.cx + ((e.clientX - r.left) * s - cv.width / 2) / k, wy = S.cy + ((e.clientY - r.top) * s - cv.width / 2) / k;
      let hit = null, hr = 1e18;
      for (const q of S.inst) { const rad = Math.max(q.r, (20 * s) / k), d2 = Math.hypot(q.x - wx, q.y - wy); if (d2 <= rad && (rad < hr || (rad === hr && d2 < hit.d))) { hit = { q, d: d2 }; hr = rad; } }
      if (task === 'identify') { say(tr(MSG.tapQuiz)); return; }
      if (hit && allow('part:' + hit.q.p)) showPart(hit.q.p);
    });
    on(cv, 'pointercancel', () => { drag = null; });
    on(cv, 'keydown', (e) => { const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (m) { e.preventDefault(); panBtn(m); } });

    // ---------------- the loop
    function tick(now) {
      if (destroyed) return; raf = win.requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
      if (lang() !== S.lastLang) { S.lastLang = lang(); applyText(); updateRegion(); S.dirtyC = true; }
      if (cv.clientWidth && Math.round(cv.clientWidth * Math.min(win.devicePixelRatio || 1, 1.6)) !== cv.width) sizeCanvases();
      const moving = !!SL.live && !S.killed && !reduced();
      if (moving) S.liveT += dt;
      const bt = blurOf(), bv = clamp(bt + S.zb, 0, 4);
      if (Math.abs(bv - S.bView) > 0.003) { S.bView = bv; S.dirtyC = true; updateMeter(); }
      // the focused event: sharp for a third of a second after having been blurred
      if (bt > 0.6) { S.latched = false; S.sharpT = 0; }
      else if (bt < 0.12 && S.zb < 0.05 && !S.latched) { S.sharpT += dt; if (S.sharpT > 0.3) { S.latched = true; api.emit('focused'); api.record(tr(T2('Focused the picture at ', 'चित्र साफ़ किया: ')) + LENSES[S.lens].x + '×'); if (S.flags.zoom) S.flags.refocus = true; S.flags.fine = S.flags.fine || S.flags.coarse; say(tr(MSG.sharpNow)); if (task === 'focus') renderTask(); } }
      if (task === 'identify') { const rd = !!(S.quiz && bestInst(S.quiz.id) && S.bView < 1.1 && S.lens >= parts.find((p) => p.id === S.quiz.id).min); if (rd !== qReady && !S.quiz.solved) renderTask(); }
      const needScene = S.dirty || (moving && now - lastScene > 33);
      if (needScene) { lastScene = now; renderScene(); }
      if (needScene || S.dirtyC || S.mark || S.reveal || (task === 'identify' && S.quiz && !S.quiz.solved)) { composite(now); S.dirtyC = false; }
      if (!S.badge || S.badgeKey !== S.lens + lang()) { S.badgeKey = S.lens + lang(); $('.sc-badge').textContent = tr(SL.name) + ' · ' + LENSES[S.lens].x * 10 + '×'; }
    }

    // ---------------- start
    const ro = win.ResizeObserver ? new win.ResizeObserver(() => { rootEl.classList.toggle('sc-wide', root.clientWidth >= 780); sizeCanvases(); S.dirty = true; if (task === 'draw') { const pad = $('.sc-pad'); if (pad && pad.__paint) pad.__paint(); } }) : null;
    if (ro) ro.observe(root); else { rootEl.classList.toggle('sc-wide', (root.clientWidth || 360) >= 780); const rz = () => { rootEl.classList.toggle('sc-wide', root.clientWidth >= 780); sizeCanvases(); S.dirty = true; }; win.addEventListener('resize', rz); timers.push(() => win.removeEventListener('resize', rz)); }
    rootEl.classList.toggle('sc-wide', (root.clientWidth || 360) >= 780);
    applyText(); syncKnobs(); sizeCanvases(); updateMeter(); updateRegion();
    say(S.latched ? tr(SL.real) : tr(MSG.focusFirst));
    last = performance.now(); raf = win.requestAnimationFrame(tick);
    return {
      destroy() { destroyed = true; win.cancelAnimationFrame(raf); if (stopZoom) stopZoom(); if (stopStain) stopStain(); if (ro) ro.disconnect(); timers.forEach((f) => f()); },
    };
  }

  NCA_T.register({
    id: 'scope',
    css,
    validate,
    keys,
    demo: { slide: 'onion-peel', stain: 'iodine', task: 'identify' },
    mount(root, config, api) { return scope(root, config, api); },
  });
})();
