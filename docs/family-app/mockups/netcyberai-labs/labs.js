// NetCyberAI Labs: lab definitions. A lab is settings for a template plus a guided script; it holds no code.
// Step kinds: do (one action on a glowing control; `expect` is the event that completes it), predict (a guess,
// not marked), explain, check (questions; every wrong option explained), explore (free play).
window.NCA_TEMPLATES = {
  beaker: { name: { en: 'Beaker bench', hi: 'बीकर बेंच' }, about: { en: 'Pour, mix and watch real reactions: gas, heat, colour, precipitate, indicators.', hi: 'डालो, मिलाओ और असली अभिक्रियाएँ देखो: गैस, ऊष्मा, रंग, अवक्षेप, सूचक।' }, colour: '#1D4ED8' },
  fractions: { name: { en: 'Fraction kitchen', hi: 'भिन्न रसोई' }, about: { en: 'Cut a roti or a chocolate bar into equal parts and compare fractions on a number line.', hi: 'रोटी या चॉकलेट को बराबर भागों में काटो और संख्या रेखा पर भिन्नों की तुलना करो।' }, colour: '#C2410C' },
  words: { name: { en: 'Word builder', hi: 'शब्द निर्माता' }, about: { en: 'Build words from sounds in English, or join letters and matras in Hindi.', hi: 'अंग्रेज़ी में ध्वनियों से शब्द बनाओ, या हिंदी में अक्षर और मात्रा जोड़ो।' }, colour: '#0F766E' },
  sky: { name: { en: 'Sky and space', hi: 'आकाश और अंतरिक्ष' }, about: { en: 'The Sun, the Earth and the Moon in 3D: phases, day and month.', hi: 'सूरज, पृथ्वी और चाँद 3D में: चाँद की कलाएँ, दिन और महीना।' }, colour: '#6D28D9' },
};

window.NCA_LABS = [
  {
    id: 'signs-of-reaction', template: 'beaker', subject: 'science', classes: [7, 10], minutes: 5,
    title: { en: 'Signs of a chemical reaction', hi: 'रासायनिक अभिक्रिया के लक्षण' },
    fits: [{ en: 'Class 10 Science · Chapter 1, Topic 1: Recognising a chemical reaction', hi: 'कक्षा 10 विज्ञान · अध्याय 1, विषय 1: रासायनिक अभिक्रिया को पहचानना' }, { en: 'Class 7 Science · physical and chemical changes', hi: 'कक्षा 7 विज्ञान · भौतिक और रासायनिक परिवर्तन' }],
    config: { items: ['zinc', 'hcl', 'pbno3', 'ki'] },
    steps: [
      { kind: 'do', target: 'pick:zinc', expect: 'pick:zinc', say: { en: 'Tap the zinc granules to pick them up.', hi: 'जस्ते के दानों पर टैप करके उन्हें उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'add:zinc', say: { en: 'Now tap the beaker to drop the zinc in.', hi: 'अब बीकर पर टैप करके जस्ता उसमें डालो।' } },
      { kind: 'predict', say: { en: 'Next you will pour dilute hydrochloric acid on the zinc. What do you think you will see?', hi: 'अब तुम जस्ते पर तनु हाइड्रोक्लोरिक अम्ल डालोगे। तुम्हें क्या लगता है, क्या दिखेगा?' }, options: [{ id: 'gas', en: 'Bubbles of gas', hi: 'गैस के बुलबुले' }, { id: 'ppt', en: 'A yellow solid', hi: 'एक पीला ठोस' }, { id: 'none', en: 'Nothing at all', hi: 'कुछ भी नहीं' }], answer: 'gas' },
      { kind: 'do', target: 'pick:hcl', expect: 'pick:hcl', say: { en: 'Pick up the bottle of dilute hydrochloric acid.', hi: 'तनु हाइड्रोक्लोरिक अम्ल की बोतल उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'reacted', say: { en: 'Pour it into the beaker. Watch the bubbles and the thermometer.', hi: 'इसे बीकर में डालो। बुलबुलों और थर्मामीटर पर नज़र रखो।' } },
      { kind: 'explain', say: { en: 'The bubbles are hydrogen gas. The thermometer rose, so heat was given out. A new substance, zinc chloride, is now dissolved in the liquid. Gas and a change in temperature are two signs of a chemical reaction.', hi: 'बुलबुले हाइड्रोजन गैस के हैं। थर्मामीटर ऊपर चढ़ा, यानी ऊष्मा निकली। अब द्रव में एक नया पदार्थ, ज़िंक क्लोराइड, घुला है। गैस निकलना और तापमान बदलना रासायनिक अभिक्रिया के दो लक्षण हैं।' } },
      { kind: 'check', items: [
        { q: { en: 'Which two signs did you see?', hi: 'तुमने कौन-से दो लक्षण देखे?' }, options: [{ en: 'Gas and a change in temperature', hi: 'गैस और तापमान में बदलाव' }, { en: 'Colour change and a precipitate', hi: 'रंग में बदलाव और अवक्षेप' }, { en: 'Light and a new smell', hi: 'प्रकाश और नई गंध' }], answer: 0, why: { en: 'The bubbles were hydrogen gas, and the thermometer rose because heat was given out.', hi: 'बुलबुले हाइड्रोजन गैस के थे, और ऊष्मा निकलने से थर्मामीटर चढ़ा।' }, wrong: ['', { en: 'The liquid stayed colourless and no solid formed.', hi: 'द्रव रंगहीन ही रहा और कोई ठोस नहीं बना।' }, { en: 'There was no flame and no new smell.', hi: 'न कोई लौ थी, न कोई नई गंध।' }] },
        { q: { en: 'What is the gas in the bubbles?', hi: 'बुलबुलों में कौन-सी गैस है?' }, options: [{ en: 'Oxygen', hi: 'ऑक्सीजन' }, { en: 'Hydrogen', hi: 'हाइड्रोजन' }, { en: 'Steam', hi: 'भाप' }], answer: 1, why: { en: 'Zinc takes the place of hydrogen in the acid, so hydrogen gas is set free: Zn + 2HCl gives ZnCl2 + H2.', hi: 'जस्ता अम्ल में हाइड्रोजन की जगह ले लेता है, इसलिए हाइड्रोजन गैस निकलती है।' }, wrong: [{ en: 'There is no free oxygen to give off here; the gas comes from the acid, which contains hydrogen.', hi: 'यहाँ ऑक्सीजन नहीं निकलती; गैस अम्ल से आती है, जिसमें हाइड्रोजन है।' }, '', { en: 'The beaker only gets warm, not boiling, so the bubbles are not steam.', hi: 'बीकर केवल गर्म होता है, उबलता नहीं, इसलिए बुलबुले भाप के नहीं हैं।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore on your own. Clean the beaker, then mix lead nitrate with potassium iodide. Which sign do you see this time?', hi: 'अब ख़ुद आज़माओ। बीकर साफ़ करो, फिर लेड नाइट्रेट में पोटैशियम आयोडाइड मिलाओ। इस बार कौन-सा लक्षण दिखता है?' } },
    ],
  },
  {
    id: 'indicator-test', template: 'beaker', subject: 'science', classes: [7, 10], minutes: 6,
    title: { en: 'Acid or base? The indicator test', hi: 'अम्ल या क्षार? सूचक परीक्षण' },
    fits: [{ en: 'Class 10 Science · Chapter 2: Acids, bases and salts (indicators)', hi: 'कक्षा 10 विज्ञान · अध्याय 2: अम्ल, क्षार और लवण (सूचक)' }, { en: 'Class 7 Science · acids, bases and salts', hi: 'कक्षा 7 विज्ञान · अम्ल, क्षार और लवण' }],
    config: { items: ['hcl', 'naoh', 'vinegar', 'bluelitmus', 'redlitmus', 'phenol'] },
    steps: [
      { kind: 'do', target: 'pick:hcl', expect: 'pick:hcl', say: { en: 'Pick up the dilute hydrochloric acid.', hi: 'तनु हाइड्रोक्लोरिक अम्ल उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'add:hcl', say: { en: 'Pour a little into the beaker.', hi: 'थोड़ा-सा बीकर में डालो।' } },
      { kind: 'predict', say: { en: 'You will add blue litmus to this acid. What colour do you think it will turn?', hi: 'तुम इस अम्ल में नीला लिटमस डालोगे। तुम्हें क्या लगता है, उसका रंग क्या होगा?' }, options: [{ id: 'red', en: 'Red', hi: 'लाल' }, { id: 'blue', en: 'It stays blue', hi: 'नीला ही रहेगा' }, { id: 'green', en: 'Green', hi: 'हरा' }], answer: 'red' },
      { kind: 'do', target: 'pick:bluelitmus', expect: 'pick:bluelitmus', say: { en: 'Pick up the blue litmus solution.', hi: 'नीला लिटमस विलयन उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'reacted', say: { en: 'Add it to the beaker and watch the colour.', hi: 'इसे बीकर में डालो और रंग देखो।' } },
      { kind: 'explain', say: { en: 'Acids turn blue litmus red. Bases turn red litmus blue. Phenolphthalein stays colourless in an acid and turns pink in a base. An indicator tells you which kind of substance you have without tasting or touching it.', hi: 'अम्ल नीले लिटमस को लाल कर देते हैं। क्षार लाल लिटमस को नीला कर देते हैं। फ़िनॉल्फ़्थेलिन अम्ल में रंगहीन रहता है और क्षार में गुलाबी हो जाता है। सूचक बिना चखे या छुए बता देता है कि पदार्थ किस प्रकार का है।' } },
      { kind: 'check', items: [
        { q: { en: 'A solution turns phenolphthalein pink. The solution is:', hi: 'एक विलयन फ़िनॉल्फ़्थेलिन को गुलाबी कर देता है। यह विलयन है:' }, options: [{ en: 'an acid', hi: 'अम्ल' }, { en: 'a base', hi: 'क्षार' }, { en: 'pure water', hi: 'शुद्ध पानी' }], answer: 1, why: { en: 'Phenolphthalein turns pink only in a base.', hi: 'फ़िनॉल्फ़्थेलिन केवल क्षार में गुलाबी होता है।' }, wrong: [{ en: 'In an acid, phenolphthalein stays colourless.', hi: 'अम्ल में फ़िनॉल्फ़्थेलिन रंगहीन रहता है।' }, '', { en: 'Pure water is neutral; phenolphthalein stays colourless in it.', hi: 'शुद्ध पानी उदासीन होता है; उसमें फ़िनॉल्फ़्थेलिन रंगहीन रहता है।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: clean the beaker and test sodium hydroxide with each indicator, then vinegar.', hi: 'आज़माओ: बीकर साफ़ करो और सोडियम हाइड्रॉक्साइड को हर सूचक से जाँचो, फिर सिरके को।' } },
    ],
  },
  {
    id: 'displacement', template: 'beaker', subject: 'science', classes: [10], minutes: 5,
    title: { en: 'Iron and copper sulphate: displacement', hi: 'लोहा और कॉपर सल्फेट: विस्थापन' },
    fits: [{ en: 'Class 10 Science · Chapter 1, Topic 5: Displacement reactions', hi: 'कक्षा 10 विज्ञान · अध्याय 1, विषय 5: विस्थापन अभिक्रियाएँ' }, { en: 'Class 10 Science · Chapter 3: Metals and non-metals (reactivity)', hi: 'कक्षा 10 विज्ञान · अध्याय 3: धातु और अधातु (अभिक्रियाशीलता)' }],
    config: { items: ['cuso4', 'nail', 'feso4', 'copperwire'] },
    steps: [
      { kind: 'do', target: 'pick:cuso4', expect: 'pick:cuso4', say: { en: 'Pick up the blue copper sulphate solution.', hi: 'नीला कॉपर सल्फेट विलयन उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'add:cuso4', say: { en: 'Pour it into the beaker.', hi: 'इसे बीकर में डालो।' } },
      { kind: 'predict', say: { en: 'You will drop an iron nail into it. What do you think will happen?', hi: 'तुम इसमें लोहे की कील डालोगे। तुम्हें क्या लगता है, क्या होगा?' }, options: [{ id: 'coat', en: 'The nail turns brown and the blue fades', hi: 'कील भूरी होगी और नीला रंग फीका पड़ेगा' }, { id: 'none', en: 'Nothing', hi: 'कुछ नहीं' }, { id: 'gas', en: 'It fizzes', hi: 'झाग बनेगा' }], answer: 'coat' },
      { kind: 'do', target: 'pick:nail', expect: 'pick:nail', say: { en: 'Pick up the iron nail.', hi: 'लोहे की कील उठाओ।' } },
      { kind: 'do', target: 'beaker', expect: 'reacted', say: { en: 'Drop it into the beaker. Watch the nail and the colour of the solution.', hi: 'इसे बीकर में डालो। कील और विलयन के रंग पर नज़र रखो।' } },
      { kind: 'explain', say: { en: 'Iron is more reactive than copper, so it pushes copper out of copper sulphate. The copper coats the nail, reddish-brown. The solution becomes pale green iron sulphate. This is a displacement reaction.', hi: 'लोहा ताँबे से अधिक अभिक्रियाशील है, इसलिए वह कॉपर सल्फेट से ताँबे को हटा देता है। ताँबा कील पर लाल-भूरी परत बनकर चढ़ जाता है। विलयन हल्का हरा आयरन सल्फेट बन जाता है। यह विस्थापन अभिक्रिया है।' } },
      { kind: 'check', items: [
        { q: { en: 'A copper wire is put in iron sulphate solution. What happens?', hi: 'आयरन सल्फेट विलयन में ताँबे का तार डाला जाता है। क्या होगा?' }, options: [{ en: 'Iron coats the wire', hi: 'तार पर लोहा चढ़ जाएगा' }, { en: 'Nothing happens', hi: 'कुछ नहीं होगा' }, { en: 'The solution turns blue at once', hi: 'विलयन तुरंत नीला हो जाएगा' }], answer: 1, why: { en: 'Copper is less reactive than iron, so it cannot push iron out. Try it in Explore.', hi: 'ताँबा लोहे से कम अभिक्रियाशील है, इसलिए लोहे को नहीं हटा सकता। एक्सप्लोर में आज़माकर देखो।' }, wrong: [{ en: 'That would need copper to be more reactive than iron; it is not.', hi: 'इसके लिए ताँबे को लोहे से अधिक अभिक्रियाशील होना चाहिए; ऐसा नहीं है।' }, '', { en: 'Blue copper sulphate forms only if copper reacts, and it does not.', hi: 'नीला कॉपर सल्फेट तभी बनेगा जब ताँबा अभिक्रिया करे, और ऐसा नहीं होता।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: clean the beaker, pour iron sulphate, and drop in the copper wire. Does anything happen?', hi: 'आज़माओ: बीकर साफ़ करो, आयरन सल्फेट डालो और ताँबे का तार डालो। क्या कुछ होता है?' } },
    ],
  },
  {
    id: 'halves', template: 'fractions', subject: 'maths', classes: [3, 4], minutes: 5,
    title: { en: 'Half a roti: halves and quarters', hi: 'आधी रोटी: आधा और चौथाई' },
    fits: [{ en: 'Class 3 Maths · halves and quarters', hi: 'कक्षा 3 गणित · आधा और चौथाई' }, { en: 'Class 4 Maths · fractions', hi: 'कक्षा 4 गणित · भिन्न' }],
    config: { object: 'roti', bars: [{ n: 1, k: 0 }] },
    steps: [
      { kind: 'do', target: 'cut:0', expect: 'cut:0:2', say: { en: 'Tap + to cut the roti into 2 equal pieces.', hi: '+ पर टैप करके रोटी को 2 बराबर टुकड़ों में काटो।' } },
      { kind: 'do', target: 'piece:0', expect: 'shade:0:1/2', say: { en: 'Tap one piece to give it to your friend.', hi: 'एक टुकड़े पर टैप करके उसे अपने दोस्त को दो।' } },
      { kind: 'predict', say: { en: 'Now we cut the roti into 4 equal pieces. How many pieces will make the same half?', hi: 'अब रोटी को 4 बराबर टुकड़ों में काटेंगे। कितने टुकड़े मिलकर वही आधा बनाएँगे?' }, options: [{ id: '1', en: '1 piece', hi: '1 टुकड़ा' }, { id: '2', en: '2 pieces', hi: '2 टुकड़े' }, { id: '3', en: '3 pieces', hi: '3 टुकड़े' }], answer: '2' },
      { kind: 'do', target: 'cut:0', expect: 'cut:0:4', say: { en: 'Cut the roti into 4 equal pieces.', hi: 'रोटी को 4 बराबर टुकड़ों में काटो।' } },
      { kind: 'do', target: 'piece:0', expect: 'shade:0:2/4', say: { en: 'Give your friend the same amount as before: half the roti.', hi: 'दोस्त को पहले जितना ही दो: आधी रोटी।' } },
      { kind: 'explain', say: { en: '2 pieces out of 4 is the same amount as 1 piece out of 2. We write 2/4 = 1/2. Half means one of two equal parts, however many pieces you cut it into.', hi: '4 में से 2 टुकड़े उतने ही हैं जितना 2 में से 1 टुकड़ा। हम लिखते हैं 2/4 = 1/2। आधा मतलब दो बराबर भागों में से एक, चाहे कितने भी टुकड़े करो।' } },
      { kind: 'check', items: [
        { q: { en: 'A roti is cut into 4 equal pieces. You eat 1. What part did you eat?', hi: 'एक रोटी के 4 बराबर टुकड़े हैं। तुमने 1 खाया। तुमने कितना भाग खाया?' }, options: ['1/2', '1/4', '4/1'], answer: 1, why: { en: 'One of four equal parts is one quarter, 1/4.', hi: 'चार बराबर भागों में से एक, एक चौथाई है: 1/4।' }, wrong: [{ en: '1/2 would be 2 of the 4 pieces.', hi: '1/2 होने के लिए 4 में से 2 टुकड़े चाहिए।' }, '', { en: 'The bottom number is how many equal parts there are, so it is 4, not 1.', hi: 'नीचे की संख्या बताती है कि कितने बराबर भाग हैं, इसलिए वह 4 है, 1 नहीं।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: cut the roti into 6 or 8 pieces and find half again.', hi: 'आज़माओ: रोटी को 6 या 8 टुकड़ों में काटो और फिर से आधा ढूँढो।' } },
    ],
  },
  {
    id: 'equivalent-fractions', template: 'fractions', subject: 'maths', classes: [5, 6], minutes: 5,
    title: { en: 'Same amount, new name: equivalent fractions', hi: 'वही मात्रा, नया नाम: तुल्य भिन्न' },
    fits: [{ en: 'Class 6 Maths · fractions (equivalent fractions)', hi: 'कक्षा 6 गणित · भिन्न (तुल्य भिन्न)' }, { en: 'Class 5 Maths · fractions', hi: 'कक्षा 5 गणित · भिन्न' }],
    config: { object: 'bar', bars: [{ n: 2, k: 1, lock: true }, { n: 1, k: 0 }] },
    steps: [
      { kind: 'do', target: 'cut:1', expect: 'cut:1:6', say: { en: 'The top bar shows 1/2. Cut the bottom bar into 6 equal pieces.', hi: 'ऊपर वाली चॉकलेट 1/2 दिखाती है। नीचे वाली को 6 बराबर टुकड़ों में काटो।' } },
      { kind: 'predict', say: { en: 'How many of the 6 pieces make half the bar?', hi: '6 में से कितने टुकड़े मिलकर आधी चॉकलेट बनाते हैं?' }, options: [{ id: '2', en: '2', hi: '2' }, { id: '3', en: '3', hi: '3' }, { id: '4', en: '4', hi: '4' }], answer: '3' },
      { kind: 'do', target: 'piece:1', expect: 'equal', say: { en: 'Shade pieces of the bottom bar until both bars show the same amount.', hi: 'नीचे वाली चॉकलेट के टुकड़े तब तक रंगो जब तक दोनों बराबर मात्रा न दिखाएँ।' } },
      { kind: 'explain', say: { en: '1/2 = 3/6. Multiply the top and the bottom by the same number, here 3, and you get an equivalent fraction: a new name for the same amount. Their points on the number line are the same.', hi: '1/2 = 3/6। ऊपर और नीचे की संख्या को एक ही संख्या से गुणा करो, यहाँ 3 से, तो तुल्य भिन्न मिलती है: उसी मात्रा का नया नाम। संख्या रेखा पर दोनों का बिंदु एक ही है।' } },
      { kind: 'check', items: [
        { q: { en: 'Which fraction is equivalent to 2/3?', hi: 'कौन-सी भिन्न 2/3 के तुल्य है?' }, options: ['4/6', '2/6', '3/4'], answer: 0, why: { en: 'Multiply top and bottom of 2/3 by 2: 4/6.', hi: '2/3 के ऊपर और नीचे को 2 से गुणा करो: 4/6।' }, wrong: ['', { en: 'Only the bottom was multiplied; the top must be multiplied by the same number.', hi: 'केवल नीचे की संख्या गुणा हुई; ऊपर की संख्या को भी उसी से गुणा करना होगा।' }, { en: 'Adding 1 to the top and bottom does not keep the amount the same.', hi: 'ऊपर और नीचे 1 जोड़ने से मात्रा वही नहीं रहती।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: cut the bottom bar into 4 or 8 pieces and match the half again.', hi: 'आज़माओ: नीचे वाली को 4 या 8 टुकड़ों में काटो और फिर से आधे से मिलाओ।' } },
    ],
  },
  {
    id: 'build-words', template: 'words', subject: 'english', classes: [1, 2], minutes: 4,
    title: { en: 'Sound it out: build three-letter words', hi: 'आवाज़ से शब्द: तीन अक्षर के शब्द बनाओ' },
    fits: [{ en: 'Class 1 English · letters, sounds and words', hi: 'कक्षा 1 अंग्रेज़ी · अक्षर, ध्वनि और शब्द' }, { en: 'Class 2 English · reading simple words', hi: 'कक्षा 2 अंग्रेज़ी · सरल शब्द पढ़ना' }],
    config: { mode: 'phonics', words: [{ w: 'cat', pic: 'cat' }, { w: 'sun', pic: 'sun' }, { w: 'bus', pic: 'bus' }], extra: 'mp' },
    steps: [
      { kind: 'do', target: 'listen', expect: 'listen', say: { en: 'Tap Listen to hear the word.', hi: 'शब्द सुनने के लिए "सुनो" पर टैप करो।' } },
      { kind: 'predict', say: { en: 'Which letter does "cat" start with?', hi: '"cat" किस अक्षर से शुरू होता है?' }, options: [{ id: 'c', en: 'c', hi: 'c' }, { id: 's', en: 's', hi: 's' }, { id: 't', en: 't', hi: 't' }], answer: 'c' },
      { kind: 'do', target: 'tiles', expect: 'word:cat', say: { en: 'Tap the letters in order to build the word.', hi: 'शब्द बनाने के लिए अक्षरों को क्रम से टैप करो।' } },
      { kind: 'explain', say: { en: 'Every word is made of sounds joined together. c, a, t: cat. Say each sound, then say them fast together.', hi: 'हर शब्द ध्वनियों को जोड़कर बनता है। c, a, t: cat। हर ध्वनि बोलो, फिर उन्हें जल्दी-जल्दी एक साथ बोलो।' } },
      { kind: 'do', target: 'next', expect: 'next', say: { en: 'Tap Next word.', hi: '"अगला शब्द" पर टैप करो।' } },
      { kind: 'do', target: 'tiles', expect: 'word:sun', say: { en: 'Build this word by its sounds.', hi: 'इस शब्द को उसकी ध्वनियों से बनाओ।' } },
      { kind: 'check', items: [
        { q: { en: 'Which word do the sounds b, u, s make?', hi: 'b, u, s ध्वनियाँ मिलकर कौन-सा शब्द बनाती हैं?' }, options: ['bus', 'sun', 'cat'], answer: 0, why: { en: 'b, u, s joined together make "bus".', hi: 'b, u, s जोड़ने पर "bus" बनता है।' }, wrong: ['', { en: '"sun" starts with the sound s, not b.', hi: '"sun" s ध्वनि से शुरू होता है, b से नहीं।' }, { en: '"cat" has the sounds c, a, t.', hi: '"cat" में c, a, t ध्वनियाँ हैं।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: build the next word, bus.', hi: 'आज़माओ: अगला शब्द bus बनाओ।' } },
    ],
  },
  {
    id: 'matra', template: 'words', subject: 'hindi', classes: [1, 2], minutes: 4, lang: 'hi',
    title: { en: 'Matra lab: add a vowel sign', hi: 'मात्रा लैब: मात्रा लगाओ' },
    fits: [{ en: 'Class 1 Hindi · matras (vowel signs)', hi: 'कक्षा 1 हिंदी · मात्राएँ' }, { en: 'Class 2 Hindi · making words', hi: 'कक्षा 2 हिंदी · शब्द बनाना' }],
    config: { mode: 'matra', consonants: ['क', 'म', 'ल', 'न'], matras: ['ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ'],
      examples: { 'का': 'काम', 'कि': 'किताब', 'की': 'कील', 'कु': 'कुर्सी', 'कू': 'कूदना', 'के': 'केला', 'कै': 'कैंची', 'को': 'कोयल', 'कौ': 'कौआ', 'मा': 'माला', 'मि': 'मिठाई', 'मी': 'मीनार', 'मु': 'मुर्गा', 'मू': 'मूली', 'मे': 'मेला', 'मो': 'मोर', 'ला': 'लाल', 'लि': 'लिफ़ाफ़ा', 'ली': 'लीची', 'लो': 'लोटा', 'ना': 'नाव', 'नी': 'नीला', 'नु': 'नुकीला', 'ने': 'नेता' } },
    steps: [
      { kind: 'do', target: 'pick:क', expect: 'pick:क', say: { en: 'Tap the letter क.', hi: 'अक्षर क पर टैप करो।' } },
      { kind: 'do', target: 'matra:ा', expect: 'make:का', say: { en: 'Now tap the aa sign ( ा ).', hi: 'अब आ की मात्रा ( ा ) पर टैप करो।' } },
      { kind: 'predict', say: { en: 'What will क become with the long ee sign ( ी )?', hi: 'क में बड़ी ई की मात्रा ( ी ) लगाने पर क्या बनेगा?' }, options: [{ id: 'कि', en: 'कि', hi: 'कि' }, { id: 'की', en: 'की', hi: 'की' }, { id: 'कु', en: 'कु', hi: 'कु' }], answer: 'की' },
      { kind: 'do', target: 'matra:ी', expect: 'make:की', say: { en: 'Tap the long ee sign ( ी ) and check your guess.', hi: 'बड़ी ई की मात्रा ( ी ) पर टैप करो और अपना अनुमान जाँचो।' } },
      { kind: 'explain', say: { en: 'A matra changes the sound of a letter. The short i sign ( ि ) is written before the letter but said after it: कि. The long ee sign ( ी ) is written after it: की.', hi: 'मात्रा अक्षर की आवाज़ बदल देती है। छोटी इ की मात्रा ( ि ) अक्षर से पहले लिखी जाती है, पर बोली बाद में जाती है: कि। बड़ी ई की मात्रा ( ी ) अक्षर के बाद लिखी जाती है: की।' } },
      { kind: 'check', items: [
        { q: { en: 'म + ू = ?', hi: 'म + ू = ?' }, options: ['मु', 'मू', 'मो'], answer: 1, why: { en: 'The long oo sign ( ू ) makes मू, as in मूली.', hi: 'बड़े ऊ की मात्रा ( ू ) से मू बनता है, जैसे मूली।' }, wrong: [{ en: 'मु has the short u sign ( ु ).', hi: 'मु में छोटे उ की मात्रा ( ु ) है।' }, '', { en: 'मो has the o sign ( ो ).', hi: 'मो में ओ की मात्रा ( ो ) है।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: pick any letter and try every matra. Listen to each one.', hi: 'आज़माओ: कोई भी अक्षर चुनो और हर मात्रा लगाकर देखो। हर एक को सुनो।' } },
    ],
  },
  {
    id: 'moon-phases', template: 'sky', subject: 'science', classes: [3, 6, 8], minutes: 6,
    title: { en: 'Why the Moon changes shape', hi: 'चाँद का आकार क्यों बदलता है' },
    fits: [{ en: 'Class 3 EVS · the sky and the Moon', hi: 'कक्षा 3 पर्यावरण · आकाश और चाँद' }, { en: 'Class 6 and Class 8 Science · the Moon and its phases', hi: 'कक्षा 6 और 8 विज्ञान · चाँद और उसकी कलाएँ' }],
    config: { startDay: 3 },
    steps: [
      { kind: 'do', target: 'slider', expect: 'phase:full', say: { en: 'Drag the slider until the Moon looks completely round from Earth: a full moon.', hi: 'स्लाइडर को तब तक खिसकाओ जब तक पृथ्वी से चाँद पूरा गोल न दिखे: पूर्णिमा।' } },
      { kind: 'predict', say: { en: 'At new moon we cannot see the Moon at all. Where do you think it is then?', hi: 'अमावस्या को चाँद बिल्कुल नहीं दिखता। तुम्हें क्या लगता है, तब वह कहाँ होता है?' }, options: [{ id: 'between', en: 'Between the Earth and the Sun', hi: 'पृथ्वी और सूरज के बीच' }, { id: 'behind', en: 'Behind the Earth, away from the Sun', hi: 'पृथ्वी के पीछे, सूरज से दूर' }, { id: 'gone', en: 'It leaves the sky', hi: 'वह आकाश छोड़ देता है' }], answer: 'between' },
      { kind: 'do', target: 'slider', expect: 'phase:new', say: { en: 'Move the slider to the new moon and check your guess.', hi: 'स्लाइडर को अमावस्या तक ले जाओ और अपना अनुमान जाँचो।' } },
      { kind: 'explain', say: { en: 'The Sun always lights half of the Moon. As the Moon goes round the Earth, we see different amounts of that lit half. At new moon the lit half faces away from us; at full moon it faces us. One round takes about 29.5 days.', hi: 'सूरज हमेशा चाँद के आधे हिस्से को रोशन करता है। चाँद पृथ्वी के चारों ओर घूमता है, तो हमें उस रोशन आधे का अलग-अलग हिस्सा दिखता है। अमावस्या को रोशन आधा हमसे दूर की ओर होता है; पूर्णिमा को हमारी ओर। एक चक्कर में लगभग 29.5 दिन लगते हैं।' } },
      { kind: 'check', items: [
        { q: { en: 'Why does the Moon seem to change shape?', hi: 'चाँद का आकार बदलता हुआ क्यों लगता है?' }, options: [{ en: 'We see different amounts of its sunlit half', hi: 'हमें उसके रोशन आधे का अलग-अलग हिस्सा दिखता है' }, { en: "The Earth's shadow covers part of it every night", hi: 'हर रात पृथ्वी की छाया उसका कुछ हिस्सा ढक लेती है' }, { en: 'It really grows and shrinks', hi: 'वह सच में बड़ा-छोटा होता है' }], answer: 0, why: { en: 'Half the Moon is always lit; its position decides how much of that half faces us.', hi: 'चाँद का आधा हिस्सा हमेशा रोशन रहता है; उसकी स्थिति तय करती है कि उस आधे का कितना हिस्सा हमारी ओर है।' }, wrong: ['', { en: "The Earth's shadow falls on the Moon only during a lunar eclipse, a few times a year, not every night.", hi: 'पृथ्वी की छाया चाँद पर केवल चंद्र ग्रहण में पड़ती है, साल में कुछ बार, हर रात नहीं।' }, { en: 'The Moon is always the same round ball; only the lit part we can see changes.', hi: 'चाँद हमेशा एक जैसा गोल रहता है; केवल हमें दिखने वाला रोशन हिस्सा बदलता है।' }] },
      ] },
      { kind: 'explore', say: { en: 'Explore: press Play a whole month and watch the shapes come back in order.', hi: 'आज़माओ: "पूरा महीना चलाओ" दबाओ और देखो कि आकार क्रम से कैसे लौटते हैं।' } },
    ],
  },
];
