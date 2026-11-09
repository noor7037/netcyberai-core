// Template: Ecosystem. Food chains, food webs, the energy pyramid (10 per cent rule), cycles of carbon, nitrogen,
// water and oxygen, habitats, adaptation, waste sorting and predator-prey balance, with Indian species.
// The biology is in the data below: who eats whom, where each organism lives, what each cycle's processes are,
// which bin each kind of waste goes in. A lab can only choose among things listed here, so it can never show a
// food chain that does not exist. Config:
//   { mode: 'chain' | 'web' | 'pyramid' | 'cycle:carbon|nitrogen|water|oxygen' | 'habitat' | 'adaptation' | 'waste' | 'population',
//     organisms?: [ids from ECO.organisms (waste ids in waste mode)], habitat?: 'pond'|'forest'|'desert'|'grassland'|'mountain'|'sea'|'farm' }
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tx = L.tx;

  // ---------------------------------------------------------------- habitats
  const HABS = ['pond', 'forest', 'grassland', 'desert', 'mountain', 'sea', 'farm'];
  const HAB = {
    pond: { n: T2('pond', 'तालाब'), d: T2('Still fresh water with plants, insects, fish and frogs.', 'ठहरा हुआ मीठा पानी, जिसमें पौधे, कीट, मछलियाँ और मेंढक रहते हैं।') },
    forest: { n: T2('forest', 'वन'), d: T2('Many tall trees, shade and shelter, with deer, birds and big cats.', 'ऊँचे पेड़, छाया और आश्रय; यहाँ हिरण, पक्षी और बड़ी बिल्लियाँ रहती हैं।') },
    grassland: { n: T2('grassland', 'घास का मैदान'), d: T2('Wide open land covered with grass, with few trees.', 'घास से ढका खुला मैदान, जहाँ पेड़ कम होते हैं।') },
    desert: { n: T2('desert', 'मरुस्थल'), d: T2('Very little rain, hot days, cold nights and sandy soil.', 'बहुत कम वर्षा, गर्म दिन, ठंडी रातें और रेतीली मिट्टी।') },
    mountain: { n: T2('mountain', 'पर्वत'), d: T2('High, cold and windy land, with snow in winter.', 'ऊँची, ठंडी और हवादार भूमि, जहाँ सर्दियों में बर्फ गिरती है।') },
    sea: { n: T2('sea and coast', 'समुद्र और तट'), d: T2('Salty water, waves and a shore with mud and rocks.', 'खारा पानी, लहरें और कीचड़ व चट्टानों वाला तट।') },
    farm: { n: T2('farm', 'खेत'), d: T2('Land where people grow crops and keep animals.', 'वह भूमि जहाँ लोग फ़सल उगाते और पशु पालते हैं।') },
  };

  // ---------------------------------------------------------------- organisms
  // role: P producer, A animal (consumer), D decomposer. eats: ids of what it eats (used only when present in the set).
  const ORG = {};
  const org = (id, role, hab, n, fact, eats) => { ORG[id] = { id, role, hab, n, fact, eats: eats || [] }; };
  // producers
  org('grass', 'P', ['grassland', 'forest', 'farm'], T2('Grass', 'घास'), T2('Grass makes its own food from sunlight, water and carbon dioxide.', 'घास सूर्य के प्रकाश, जल और कार्बन डाइऑक्साइड से अपना भोजन स्वयं बनाती है।'));
  org('tree', 'P', ['forest'], T2('Teak tree', 'सागौन का पेड़'), T2('A tree makes food in its leaves and gives shelter and fruit to many animals.', 'पेड़ अपनी पत्तियों में भोजन बनाता है और कई जीवों को आश्रय व फल देता है।'));
  org('algae', 'P', ['pond'], T2('Algae', 'शैवाल'), T2('Algae are tiny green plants that float in water and make food using sunlight.', 'शैवाल छोटे हरे पौधे हैं जो पानी में तैरते हैं और सूर्य के प्रकाश से भोजन बनाते हैं।'));
  org('lotus', 'P', ['pond'], T2('Lotus', 'कमल'), T2('The lotus leaf floats on water, and its long stalk has air spaces.', 'कमल का पत्ता पानी पर तैरता है और उसके लंबे डंठल में हवा के खाली स्थान होते हैं।'));
  org('phyto', 'P', ['sea'], T2('Phytoplankton', 'पादप प्लवक'), T2('Tiny floating plants that make most of the food in the sea.', 'छोटे तैरते पौधे, जो समुद्र का अधिकतर भोजन बनाते हैं।'));
  org('seaweed', 'P', ['sea'], T2('Seaweed', 'समुद्री शैवाल'), T2('Seaweed is a large alga that grows on rocks near the shore.', 'समुद्री शैवाल किनारे की चट्टानों पर उगने वाली बड़ी शैवाल है।'));
  org('mangrove', 'P', ['sea'], T2('Mangrove', 'मैंग्रोव'), T2('Mangroves grow in salty mud on the coast; their roots stand out of the mud to get air.', 'मैंग्रोव तट के खारे कीचड़ में उगते हैं; उनकी जड़ें हवा लेने के लिए कीचड़ से बाहर निकली रहती हैं।'));
  org('wheat', 'P', ['farm'], T2('Wheat', 'गेहूँ'), T2('Wheat is a crop plant; we eat its grains.', 'गेहूँ एक फ़सल है; हम इसके दाने खाते हैं।'));
  org('paddy', 'P', ['farm'], T2('Paddy (rice plant)', 'धान'), T2('Paddy grows in standing water, and rice is its grain.', 'धान खड़े पानी में उगता है और चावल उसका दाना है।'));
  org('desertgrass', 'P', ['desert'], T2('Desert grass (sewan)', 'रेगिस्तानी घास (सेवण)'), T2('Its roots go deep into the sand to find water.', 'इसकी जड़ें पानी ढूँढने के लिए रेत में गहरी जाती हैं।'));
  org('khejri', 'P', ['desert'], T2('Khejri tree', 'खेजड़ी का पेड़'), T2('The khejri has deep roots that reach water far below the sand.', 'खेजड़ी की जड़ें बहुत गहरी होती हैं और रेत के नीचे दूर तक पानी खोज लेती हैं।'));
  org('alpine', 'P', ['mountain'], T2('Mountain grass and shrubs', 'पर्वतीय घास व झाड़ियाँ'), T2('Low plants that grow close to the ground to survive cold winds.', 'ठंडी हवा सहने के लिए ये पौधे ज़मीन से सटे छोटे रहते हैं।'));
  // animals
  org('grasshopper', 'A', ['grassland', 'farm', 'forest'], T2('Grasshopper', 'टिड्डा'), T2('It eats leaves and has strong back legs for jumping.', 'यह पत्तियाँ खाता है और कूदने के लिए इसकी पिछली टाँगें मज़बूत होती हैं।'), ['grass', 'wheat', 'paddy']);
  org('caterpillar', 'A', ['forest'], T2('Caterpillar', 'इल्ली'), T2('A caterpillar eats leaves and later becomes a butterfly or moth.', 'इल्ली पत्तियाँ खाती है और बाद में तितली या पतंगा बन जाती है।'), ['tree']);
  org('deer', 'A', ['forest', 'grassland'], T2('Chital (spotted deer)', 'चीतल'), T2('Chital eats grass and leaves, and its spots hide it among the trees.', 'चीतल घास और पत्तियाँ खाता है; उसके धब्बे उसे पेड़ों के बीच छिपा लेते हैं।'), ['grass']);
  org('rabbit', 'A', ['grassland', 'farm'], T2('Rabbit', 'खरगोश'), T2('A rabbit eats grass and has long ears to hear danger.', 'खरगोश घास खाता है और खतरा सुनने के लिए उसके कान लंबे होते हैं।'), ['grass', 'wheat']);
  org('mouse', 'A', ['grassland', 'farm', 'forest'], T2('Field rat', 'खेत का चूहा'), T2('Field rats eat grains and seeds.', 'खेत के चूहे अनाज और बीज खाते हैं।'), ['wheat', 'paddy', 'grass']);
  org('langur', 'A', ['forest'], T2('Langur', 'लंगूर'), T2('Langurs live on trees and eat leaves, flowers and fruits.', 'लंगूर पेड़ों पर रहते हैं और पत्तियाँ, फूल व फल खाते हैं।'), ['tree']);
  org('cow', 'A', ['farm'], T2('Cow', 'गाय'), T2('Cows eat grass and fodder, and give us milk.', 'गाय घास और चारा खाती है और हमें दूध देती है।'), ['grass', 'wheat', 'paddy']);
  org('zooplankton', 'A', ['pond', 'sea'], T2('Zooplankton', 'प्राणिप्लवक'), T2('Tiny floating animals that eat algae and other tiny plants.', 'छोटे तैरते जंतु, जो शैवाल और दूसरे छोटे पौधे खाते हैं।'), ['algae', 'phyto']);
  org('tadpole', 'A', ['pond'], T2('Tadpole', 'टैडपोल'), T2('A tadpole breathes with gills and eats water plants. It grows into a frog.', 'टैडपोल गलफड़ों से साँस लेता है और जलीय पौधे खाता है। वह बड़ा होकर मेंढक बनता है।'), ['algae', 'lotus']);
  org('waterbug', 'A', ['pond'], T2('Water boatman', 'जल-नाविक कीट'), T2('Water boatmen row with their long back legs and feed on algae.', 'जल-नाविक कीट अपनी लंबी पिछली टाँगों से चप्पू की तरह तैरते हैं और शैवाल खाते हैं।'), ['algae']);
  org('rohu', 'A', ['pond'], T2('Rohu', 'रोहू'), T2('Rohu is a fish of ponds and rivers that eats algae and tiny plants.', 'रोहू तालाब और नदी की मछली है, जो शैवाल और छोटे पौधे खाती है।'), ['algae']);
  org('catla', 'A', ['pond'], T2('Catla', 'कतला'), T2('Catla swims near the surface and eats zooplankton.', 'कतला सतह के पास तैरती है और प्राणिप्लवक खाती है।'), ['zooplankton']);
  org('sardine', 'A', ['sea'], T2('Sardine', 'सार्डिन'), T2('Sardines swim in big shoals and eat plankton.', 'सार्डिन बड़े झुंड में तैरती हैं और प्लवक खाती हैं।'), ['phyto', 'zooplankton']);
  org('marmot', 'A', ['mountain'], T2('Himalayan marmot', 'हिमालयी मर्मोट'), T2('Marmots eat mountain grass and sleep through the cold winter (hibernate).', 'मर्मोट पहाड़ी घास खाते हैं और कड़ाके की सर्दी में सोए रहते हैं (शीतनिद्रा)।'), ['alpine']);
  org('bharal', 'A', ['mountain'], T2('Bharal (blue sheep)', 'भरल (नीली भेड़)'), T2('Bharal graze on mountain grass and climb steep rocks with ease.', 'भरल पहाड़ी घास चरते हैं और खड़ी चट्टानों पर आसानी से चढ़ जाते हैं।'), ['alpine']);
  org('camel', 'A', ['desert'], T2('Camel', 'ऊँट'), T2('Camels eat thorny desert plants and can go many days without water.', 'ऊँट काँटेदार रेगिस्तानी पौधे खाते हैं और कई दिन बिना पानी के रह सकते हैं।'), ['khejri', 'desertgrass']);
  org('gerbil', 'A', ['desert'], T2('Desert gerbil', 'रेगिस्तानी जरबिल'), T2('Gerbils eat seeds and rest in burrows during the hot day.', 'जरबिल बीज खाते हैं और गर्म दिन में बिल में आराम करते हैं।'), ['desertgrass']);
  org('locust', 'A', ['desert', 'farm'], T2('Locust', 'टिड्डी'), T2('Locusts eat leaves and can fly in huge swarms.', 'टिड्डियाँ पत्तियाँ खाती हैं और विशाल झुंडों में उड़ सकती हैं।'), ['desertgrass', 'khejri', 'wheat']);
  org('turtle', 'A', ['sea'], T2('Green sea turtle', 'हरा समुद्री कछुआ'), T2('Green sea turtles feed on seaweed and sea grass.', 'हरे समुद्री कछुए समुद्री शैवाल और समुद्री घास खाते हैं।'), ['seaweed']);
  org('crab', 'A', ['sea'], T2('Crab', 'केकड़ा'), T2('Crabs live on the shore and eat seaweed and small bits of food.', 'केकड़े तट पर रहते हैं और समुद्री शैवाल व भोजन के छोटे टुकड़े खाते हैं।'), ['seaweed']);
  org('hen', 'A', ['farm'], T2('Hen', 'मुर्गी'), T2('Hens eat grains and insects.', 'मुर्गियाँ अनाज और कीड़े खाती हैं।'), ['wheat', 'paddy', 'grasshopper']);
  org('human', 'A', ['farm', 'pond'], T2('Human (farmer)', 'मनुष्य (किसान)'), T2('People eat both plants and animals, so we are omnivores.', 'लोग पौधे और जंतु दोनों खाते हैं, इसलिए हम सर्वाहारी हैं।'), ['wheat', 'paddy', 'hen', 'rohu', 'catla']);
  org('frog', 'A', ['pond', 'grassland', 'farm', 'forest'], T2('Frog', 'मेंढक'), T2('Frogs catch insects with a sticky tongue.', 'मेंढक अपनी चिपचिपी जीभ से कीट पकड़ते हैं।'), ['waterbug', 'grasshopper', 'caterpillar']);
  org('snake', 'A', ['grassland', 'farm', 'forest', 'pond'], T2('Rat snake (dhaman)', 'धामन साँप'), T2('Rat snakes eat rats and frogs. They are not poisonous.', 'धामन साँप चूहे और मेंढक खाते हैं। वे ज़हरीले नहीं होते।'), ['frog', 'mouse']);
  org('owl', 'A', ['farm', 'grassland', 'forest'], T2('Barn owl', 'खलिहान का उल्लू'), T2('Owls hunt rats at night.', 'उल्लू रात में चूहों का शिकार करते हैं।'), ['mouse', 'grasshopper', 'frog']);
  org('peacock', 'A', ['forest', 'grassland', 'farm'], T2('Peacock', 'मोर'), T2('Peacocks eat insects, seeds and even small snakes.', 'मोर कीड़े, बीज और छोटे साँप तक खाते हैं।'), ['grasshopper', 'caterpillar', 'snake']);
  org('fox', 'A', ['grassland', 'farm'], T2('Indian fox', 'भारतीय लोमड़ी'), T2('Foxes hunt rabbits, rats and insects.', 'लोमड़ियाँ खरगोश, चूहे और कीड़ों का शिकार करती हैं।'), ['rabbit', 'mouse', 'grasshopper', 'hen']);
  org('viper', 'A', ['desert'], T2('Saw-scaled viper', 'फुर्सा (सॉ-स्केल्ड वाइपर)'), T2('A small venomous desert snake that eats rodents and insects.', 'रेगिस्तान का छोटा ज़हरीला साँप, जो कृंतक और कीड़े खाता है।'), ['gerbil', 'locust']);
  org('eagle', 'A', ['grassland', 'forest', 'desert', 'mountain', 'farm'], T2('Eagle', 'बाज़ (ईगल)'), T2('Eagles have sharp eyes and strong claws to catch their prey.', 'बाज़ की आँखें तेज़ और पंजे मज़बूत होते हैं, जिनसे वह शिकार पकड़ता है।'), ['snake', 'viper', 'rabbit', 'mouse', 'gerbil', 'marmot', 'frog']);
  org('tiger', 'A', ['forest'], T2('Tiger', 'बाघ'), T2('Tigers hunt deer and are the top hunters of the forest.', 'बाघ हिरणों का शिकार करते हैं और वन के सबसे ऊपर के शिकारी हैं।'), ['deer', 'langur']);
  org('snowleopard', 'A', ['mountain'], T2('Snow leopard', 'हिम तेंदुआ'), T2('Snow leopards live high in the Himalaya and hunt bharal.', 'हिम तेंदुए हिमालय की ऊँचाइयों पर रहते हैं और भरल का शिकार करते हैं।'), ['bharal', 'marmot']);
  org('heron', 'A', ['pond'], T2('Pond heron', 'तालाब का बगुला'), T2('Herons stand still in shallow water and spear frogs and fish.', 'बगुले उथले पानी में चुपचाप खड़े रहकर मेंढक और मछलियाँ पकड़ते हैं।'), ['frog', 'rohu', 'catla', 'tadpole']);
  org('kingfisher', 'A', ['pond'], T2('Kingfisher', 'किलकिला'), T2('Kingfishers dive into the water to catch fish.', 'किलकिला पानी में गोता लगाकर मछली पकड़ता है।'), ['rohu', 'catla', 'tadpole']);
  org('tuna', 'A', ['sea'], T2('Tuna', 'ट्यूना'), T2('Tuna are fast sea fish that eat smaller fish.', 'ट्यूना तेज़ तैरने वाली समुद्री मछलियाँ हैं, जो छोटी मछलियाँ खाती हैं।'), ['sardine']);
  org('shark', 'A', ['sea'], T2('Shark', 'शार्क'), T2('Sharks hunt fish and turtles in the sea.', 'शार्क समुद्र में मछलियों और कछुओं का शिकार करती हैं।'), ['tuna', 'sardine', 'turtle']);
  org('seagull', 'A', ['sea'], T2('Seagull', 'समुद्री गल'), T2('Seagulls eat crabs and small fish.', 'समुद्री गल केकड़े और छोटी मछलियाँ खाते हैं।'), ['crab', 'sardine']);
  // decomposers
  org('fungi', 'D', ['forest', 'grassland', 'farm'], T2('Mushroom (fungus)', 'कवक (मशरूम)'), T2('Fungi grow on dead things and break them down into soil nutrients.', 'कवक मृत वस्तुओं पर उगते हैं और उन्हें तोड़कर मिट्टी के पोषक तत्व बना देते हैं।'));
  org('bacteria', 'D', HABS.slice(), T2('Bacteria', 'जीवाणु'), T2('Bacteria are tiny. Many of them break down dead plants and animals.', 'जीवाणु बहुत छोटे होते हैं। इनमें से कई मृत पौधों और जंतुओं को सड़ा देते हैं।'));
  org('earthworm', 'D', ['forest', 'grassland', 'farm'], T2('Earthworm', 'केंचुआ'), T2('Earthworms eat dead leaves and mix the soil. They are the farmer’s friend.', 'केंचुए सूखी पत्तियाँ खाते हैं और मिट्टी को पलटते हैं। वे किसान के मित्र हैं।'));

  const ORG_IDS = Object.keys(ORG);
  const eatsIn = (id, set) => ORG[id].eats.filter((e) => set.includes(e));
  // A food chain: an order of the set in which every organism eats the one before it, starting from a producer.
  function chainOrder(ids) {
    if (!ids.length) return null;
    const n = ids.length;
    const used = new Array(n).fill(false);
    const out = [];
    const go = () => {
      if (out.length === n) return true;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const id = ids[i];
        if (out.length === 0 ? ORG[id].role === 'P' : ORG[id].eats.includes(out[out.length - 1])) {
          used[i] = true; out.push(id);
          if (go()) return true;
          out.pop(); used[i] = false;
        }
      }
      return false;
    };
    return go() ? out.slice() : null;
  }
  // The habitats where every organism of the list lives.
  const commonHabs = (ids) => HABS.filter((h) => ids.every((id) => ORG[id].hab.includes(h)));
  // Layer in a web: producers 1, then one more than the highest food it eats.
  function webLevels(ids) {
    const lv = {};
    const f = (id) => {
      if (lv[id]) return lv[id];
      if (ORG[id].role === 'P') return (lv[id] = 1);
      const prey = eatsIn(id, ids);
      return (lv[id] = 1 + Math.max(0, ...prey.map(f)));
    };
    ids.forEach(f);
    return lv;
  }
  function webLinks(ids) {
    const out = [];
    ids.forEach((e) => eatsIn(e, ids).forEach((p) => out.push([p, e])));
    return out;
  }

  const DEF = {
    chain: { pond: ['algae', 'zooplankton', 'catla', 'kingfisher'], forest: ['grass', 'deer', 'tiger'], grassland: ['grass', 'grasshopper', 'frog', 'snake', 'eagle'], desert: ['desertgrass', 'gerbil', 'viper', 'eagle'], mountain: ['alpine', 'bharal', 'snowleopard'], sea: ['phyto', 'zooplankton', 'sardine', 'tuna', 'shark'], farm: ['wheat', 'mouse', 'snake', 'eagle'] },
    web: {
      pond: ['algae', 'lotus', 'zooplankton', 'tadpole', 'waterbug', 'rohu', 'catla', 'frog', 'heron'],
      forest: ['grass', 'tree', 'caterpillar', 'deer', 'langur', 'mouse', 'peacock', 'tiger', 'eagle'],
      grassland: ['grass', 'grasshopper', 'rabbit', 'mouse', 'frog', 'snake', 'fox', 'eagle'],
      desert: ['desertgrass', 'khejri', 'locust', 'gerbil', 'camel', 'viper', 'eagle'],
      mountain: ['alpine', 'marmot', 'bharal', 'snowleopard', 'eagle'],
      sea: ['phyto', 'seaweed', 'zooplankton', 'sardine', 'crab', 'turtle', 'tuna', 'shark', 'seagull'],
      farm: ['wheat', 'grasshopper', 'mouse', 'hen', 'frog', 'snake', 'owl', 'human'],
    },
    pop: { pond: ['algae', 'rohu', 'kingfisher'], forest: ['grass', 'deer', 'tiger'], grassland: ['grass', 'rabbit', 'fox'], desert: ['desertgrass', 'gerbil', 'viper'], mountain: ['alpine', 'bharal', 'snowleopard'], sea: ['phyto', 'sardine', 'tuna'], farm: ['wheat', 'mouse', 'owl'] },
    habitat: {
      pond: ['algae', 'lotus', 'tadpole', 'rohu', 'heron', 'camel', 'tiger'], forest: ['tree', 'deer', 'langur', 'peacock', 'tiger', 'shark', 'camel'],
      grassland: ['grass', 'rabbit', 'grasshopper', 'fox', 'eagle', 'shark', 'lotus'], desert: ['khejri', 'camel', 'gerbil', 'viper', 'desertgrass', 'lotus', 'shark'],
      mountain: ['alpine', 'marmot', 'bharal', 'snowleopard', 'eagle', 'lotus', 'camel'], sea: ['phyto', 'seaweed', 'sardine', 'turtle', 'shark', 'camel', 'tiger'],
      farm: ['wheat', 'paddy', 'cow', 'hen', 'mouse', 'earthworm', 'snowleopard'],
    },
  };

  // ---------------------------------------------------------------- adaptation (one question per organism)
  const ADAPT = {
    camel: { hab: 'desert', q: T2('Why do camels have broad, padded feet?', 'ऊँट के पैर चौड़े और गद्देदार क्यों होते हैं?'), o: [T2('So they do not sink into soft sand', 'ताकि वे नरम रेत में न धँसें'), T2('So they can swim in rivers', 'ताकि वे नदियों में तैर सकें'), T2('So they can climb steep rocks', 'ताकि वे खड़ी चट्टानों पर चढ़ सकें')], a: 0, w: T2('A broad foot spreads the weight over a larger area, like a snowshoe, so the camel walks on sand without sinking.', 'चौड़ा पैर भार को बड़े क्षेत्र में फैला देता है, इसलिए ऊँट रेत में धँसे बिना चलता है।') },
    khejri: { hab: 'desert', q: T2('Why does the khejri have very long roots?', 'खेजड़ी की जड़ें बहुत लंबी क्यों होती हैं?'), o: [T2('To reach water deep under the sand', 'रेत के नीचे गहरे पानी तक पहुँचने के लिए'), T2('To float on water', 'पानी पर तैरने के लिए'), T2('To catch insects', 'कीड़े पकड़ने के लिए')], a: 0, w: T2('In a desert the top sand is dry. Deep roots can drink from the water far below.', 'रेगिस्तान में ऊपर की रेत सूखी होती है। गहरी जड़ें नीचे के पानी को सोख लेती हैं।') },
    gerbil: { hab: 'desert', q: T2('Why does the desert gerbil stay in a burrow during the day?', 'रेगिस्तानी जरबिल दिन में बिल में क्यों रहता है?'), o: [T2('The burrow is cooler than the hot surface', 'बिल गर्म सतह से ठंडा रहता है'), T2('It cannot see at night', 'वह रात में देख नहीं पाता'), T2('It needs the burrow to find water to swim in', 'उसे तैरने के लिए बिल में पानी चाहिए')], a: 0, w: T2('The sand surface can be very hot at noon. Underground it stays much cooler, so the gerbil saves water and comes out at night.', 'दोपहर में रेत की सतह बहुत गर्म होती है। ज़मीन के नीचे ठंडक रहती है, इसलिए जरबिल पानी बचाता है और रात को बाहर निकलता है।') },
    snowleopard: { hab: 'mountain', q: T2('Why does the snow leopard have thick fur and a long, thick tail?', 'हिम तेंदुए के घने बाल और लंबी मोटी पूँछ क्यों होती है?'), o: [T2('To keep warm in the cold; it wraps its tail round itself', 'ठंड में गर्म रहने के लिए; वह पूँछ अपने चारों ओर लपेट लेता है'), T2('To swim in cold rivers', 'ठंडी नदियों में तैरने के लिए'), T2('To glow in the dark', 'अँधेरे में चमकने के लिए')], a: 0, w: T2('Thick fur traps warm air near the body. The tail also helps the cat balance on steep rocks.', 'घने बाल शरीर के पास गर्म हवा रोकते हैं। पूँछ खड़ी चट्टानों पर संतुलन बनाने में भी मदद करती है।') },
    bharal: { hab: 'mountain', q: T2('How do the hooves of a bharal help it on mountains?', 'पहाड़ों पर भरल के खुर उसकी कैसे मदद करते हैं?'), o: [T2('They grip rocky slopes so it does not slip', 'वे चट्टानी ढलानों को पकड़ते हैं ताकि वह फिसले नहीं'), T2('They help it dig deep tunnels', 'वे गहरी सुरंग खोदने में मदद करते हैं'), T2('They help it fly down the hill', 'वे पहाड़ से उड़कर उतरने में मदद करते हैं')], a: 0, w: T2('Hard hooves with a firm edge grip small ledges, so the bharal can climb steep rocks safely and escape from enemies.', 'सख़्त किनारे वाले खुर छोटे उभारों को पकड़ते हैं, इसलिए भरल खड़ी चट्टानों पर सुरक्षित चढ़ता है।') },
    marmot: { hab: 'mountain', q: T2('How does the Himalayan marmot survive the very cold winter?', 'हिमालयी मर्मोट बहुत ठंडी सर्दी कैसे बिताता है?'), o: [T2('It sleeps in a burrow for months (hibernation)', 'वह महीनों बिल में सोया रहता है (शीतनिद्रा)'), T2('It flies to a warm country', 'वह गर्म देश में उड़ जाता है'), T2('It grows green leaves', 'वह हरी पत्तियाँ उगाता है')], a: 0, w: T2('In winter there is little food. The marmot eats a lot in summer, stores fat, and hibernates, using very little energy.', 'सर्दी में भोजन कम मिलता है। मर्मोट गर्मी में खूब खाकर चर्बी जमा करता है और शीतनिद्रा में बहुत कम ऊर्जा खर्च करता है।') },
    lotus: { hab: 'pond', q: T2('Why does the lotus stalk have many air spaces?', 'कमल के डंठल में हवा के खाली स्थान क्यों होते हैं?'), o: [T2('They keep the leaf afloat and carry air down to the roots', 'वे पत्ते को तैराए रखते हैं और जड़ों तक हवा पहुँचाते हैं'), T2('They store sugar', 'वे शर्करा जमा करते हैं'), T2('They scare fish away', 'वे मछलियों को डराते हैं')], a: 0, w: T2('The roots sit in mud with very little air. Air spaces in the stalk bring air down and make the plant light enough to float.', 'जड़ें कीचड़ में रहती हैं जहाँ हवा कम होती है। डंठल के खाली स्थान हवा नीचे ले जाते हैं और पौधे को हल्का रखते हैं।') },
    rohu: { hab: 'pond', q: T2('What helps a fish like rohu breathe under water?', 'रोहू जैसी मछली पानी के अंदर साँस कैसे लेती है?'), o: [T2('Gills take oxygen dissolved in the water', 'गलफड़े पानी में घुली ऑक्सीजन लेते हैं'), T2('Lungs take air from the water', 'फेफड़े पानी से हवा लेते हैं'), T2('Its fins suck air from above', 'उसके पंख ऊपर से हवा खींचते हैं')], a: 0, w: T2('Water holds a little dissolved oxygen. The fish passes water over its gills, which pick up that oxygen.', 'पानी में थोड़ी ऑक्सीजन घुली होती है। मछली गलफड़ों के ऊपर से पानी गुज़ारती है और गलफड़े वह ऑक्सीजन ले लेते हैं।') },
    frog: { hab: 'pond', q: T2('Why does a frog have webbed back feet?', 'मेंढक के पिछले पैरों में झिल्ली क्यों होती है?'), o: [T2('To push against water and swim fast', 'पानी को धकेलकर तेज़ तैरने के लिए'), T2('To dig deep holes', 'गहरे गड्ढे खोदने के लिए'), T2('To climb trees', 'पेड़ों पर चढ़ने के लिए')], a: 0, w: T2('The skin between the toes works like a paddle. It pushes more water, so the frog swims faster.', 'उँगलियों के बीच की झिल्ली चप्पू जैसा काम करती है। वह ज़्यादा पानी धकेलती है, इसलिए मेंढक तेज़ तैरता है।') },
    heron: { hab: 'pond', q: T2('Why does a heron have long legs and a long beak?', 'बगुले की टाँगें और चोंच लंबी क्यों होती हैं?'), o: [T2('To wade in shallow water and spear fish', 'उथले पानी में चलने और मछली पकड़ने के लिए'), T2('To dig for seeds in the sand', 'रेत में बीज खोदने के लिए'), T2('To crack hard nuts', 'कड़े मेवे तोड़ने के लिए')], a: 0, w: T2('Long legs keep its body dry while it wades. The long, sharp beak quickly strikes fish and frogs.', 'लंबी टाँगें चलते समय शरीर को सूखा रखती हैं। लंबी नुकीली चोंच मछली और मेंढक को तेज़ी से पकड़ लेती है।') },
    eagle: { hab: 'grassland', q: T2('Why does an eagle have a hooked beak and strong claws?', 'बाज़ की चोंच मुड़ी हुई और पंजे मज़बूत क्यों होते हैं?'), o: [T2('To catch prey and tear its flesh', 'शिकार पकड़ने और उसका माँस फाड़ने के लिए'), T2('To crack seeds', 'बीज तोड़ने के लिए'), T2('To filter tiny plants from water', 'पानी से छोटे पौधे छानने के लिए')], a: 0, w: T2('Claws (talons) grip the prey and the sharp hooked beak tears the meat. These are the tools of a hunter.', 'पंजे शिकार को पकड़ते हैं और नुकीली मुड़ी चोंच माँस फाड़ती है। ये शिकारी के औज़ार हैं।') },
    tiger: { hab: 'forest', q: T2('How do a tiger’s stripes help it?', 'बाघ की धारियाँ उसकी कैसे मदद करती हैं?'), o: [T2('They hide it among tall grass and shadows (camouflage)', 'वे उसे ऊँची घास और परछाइयों में छिपा देती हैं (छद्मावरण)'), T2('They make it run faster', 'वे उसे तेज़ दौड़ाती हैं'), T2('They keep it dry in rain', 'वे उसे बारिश में सूखा रखती हैं')], a: 0, w: T2('Stripes break up the outline of the tiger, so the deer cannot easily see it as it creeps closer.', 'धारियाँ बाघ की आकृति को तोड़ देती हैं, इसलिए हिरण उसे पास आते हुए आसानी से नहीं देख पाता।') },
    deer: { hab: 'forest', q: T2('Why are a deer’s eyes on the sides of its head?', 'हिरण की आँखें सिर के दोनों ओर क्यों होती हैं?'), o: [T2('To see almost all around and spot enemies early', 'लगभग चारों ओर देखने और शत्रु को जल्दी पहचानने के लिए'), T2('To judge the distance of its prey', 'शिकार की दूरी का अंदाज़ा लगाने के लिए'), T2('To see only the sky', 'सिर्फ़ आकाश देखने के लिए')], a: 0, w: T2('Side eyes give a very wide view. An animal that is hunted needs to see danger from every direction.', 'दोनों ओर की आँखें बहुत चौड़ा दृश्य देती हैं। जिसका शिकार होता है, उसे हर दिशा से खतरा देखना पड़ता है।') },
    mangrove: { hab: 'sea', q: T2('Why do mangrove roots stick out of the mud?', 'मैंग्रोव की जड़ें कीचड़ से बाहर क्यों निकली रहती हैं?'), o: [T2('To take in air, because the mud has very little', 'हवा लेने के लिए, क्योंकि कीचड़ में हवा बहुत कम है'), T2('To scare crabs', 'केकड़ों को डराने के लिए'), T2('To make flowers', 'फूल बनाने के लिए')], a: 0, w: T2('Mud under salty water has almost no air. These breathing roots rise above the water like straws and also hold the tree against waves.', 'खारे पानी के नीचे के कीचड़ में हवा लगभग नहीं होती। ये श्वसन जड़ें नली की तरह ऊपर उठती हैं और पेड़ को लहरों में थामे रखती हैं।') },
    turtle: { hab: 'sea', q: T2('Why does a sea turtle have flippers instead of legs?', 'समुद्री कछुए के पैरों की जगह चप्पू जैसे पंख क्यों होते हैं?'), o: [T2('Flippers push water well, so it swims easily', 'चप्पू पानी को अच्छी तरह धकेलते हैं, इसलिए वह आसानी से तैरता है'), T2('Flippers help it climb trees', 'चप्पू उसे पेड़ पर चढ़ाते हैं'), T2('Flippers help it fly', 'चप्पू उसे उड़ाते हैं')], a: 0, w: T2('Wide flat flippers work like paddles. The turtle uses them to glide through the sea and to dig its nest on the beach.', 'चौड़े चपटे चप्पू पतवार का काम करते हैं। कछुआ उनसे समुद्र में तैरता है और तट पर घोंसला खोदता है।') },
    shark: { hab: 'sea', q: T2('Why is a shark’s body smooth and shaped like a torpedo?', 'शार्क का शरीर चिकना और टॉरपीडो जैसा क्यों होता है?'), o: [T2('It cuts through water easily (streamlined)', 'वह पानी को आसानी से चीरता है (धारा-रेखीय)'), T2('It helps the shark walk on land', 'यह शार्क को ज़मीन पर चलाता है'), T2('It keeps the shark warm in snow', 'यह शार्क को बर्फ़ में गर्म रखता है')], a: 0, w: T2('A pointed, smooth body meets less resistance from water, so a fast hunter swims quickly with less effort.', 'नुकीला, चिकना शरीर पानी का कम प्रतिरोध झेलता है। इसलिए तेज़ शिकारी कम मेहनत में तेज़ तैरता है।') },
    kingfisher: { hab: 'pond', q: T2('How does the kingfisher’s beak help it?', 'किलकिला की चोंच उसकी कैसे मदद करती है?'), o: [T2('It is long and pointed, so it can dive and grab a fish', 'वह लंबी और नुकीली है, इसलिए गोता लगाकर मछली पकड़ सकता है'), T2('It is flat, to filter mud', 'वह चपटी है, कीचड़ छानने के लिए'), T2('It is short, to crack nuts', 'वह छोटी है, मेवे तोड़ने के लिए')], a: 0, w: T2('A long pointed beak enters the water smoothly and grips a slippery fish.', 'लंबी नुकीली चोंच पानी में आसानी से घुसती है और फिसलनी मछली को पकड़ लेती है।') },
  };
  const ADAPT_DEFAULT = { pond: ['lotus', 'rohu', 'frog', 'heron'], forest: ['tiger', 'deer'], grassland: ['eagle', 'deer'], desert: ['camel', 'khejri', 'gerbil'], mountain: ['snowleopard', 'bharal', 'marmot'], sea: ['mangrove', 'turtle', 'shark'], farm: ['frog', 'eagle'] };

  // ---------------------------------------------------------------- cycles
  // nodes: id, label, icon kind, x/y (0..1). edges: f(rom), t(o), p(rocess), x (what happens), sun (needs sunlight).
  const CYC = {
    carbon: {
      n: T2('Carbon cycle', 'कार्बन चक्र'), start: 'air', needsSun: true,
      nodes: [
        { id: 'air', k: 'air', l: T2('CO₂ in air', 'हवा में CO₂'), x: 0.5, y: 0.1 },
        { id: 'plants', k: 'plant', l: T2('Plants', 'पौधे'), x: 0.15, y: 0.45 },
        { id: 'animals', k: 'animal', l: T2('Animals', 'जंतु'), x: 0.85, y: 0.45 },
        { id: 'soil', k: 'decomp', l: T2('Dead matter and decomposers', 'मृत पदार्थ व अपघटक'), x: 0.45, y: 0.78 },
        { id: 'fuels', k: 'fuel', l: T2('Coal and oil', 'कोयला व तेल'), x: 0.85, y: 0.88 },
      ],
      edges: [
        { f: 'air', t: 'plants', p: T2('Photosynthesis', 'प्रकाश-संश्लेषण'), sun: 1, x: T2('Green plants take in CO₂ and, using sunlight, make glucose. The carbon is now inside the plant.', 'हरे पौधे CO₂ लेते हैं और सूर्य के प्रकाश से ग्लूकोज़ बनाते हैं। अब कार्बन पौधे के अंदर है।') },
        { f: 'plants', t: 'air', p: T2('Respiration of plants', 'पौधों की श्वसन क्रिया'), x: T2('Plants also respire day and night. They break down food for energy and release CO₂.', 'पौधे दिन-रात श्वसन भी करते हैं। वे ऊर्जा के लिए भोजन तोड़ते हैं और CO₂ छोड़ते हैं।') },
        { f: 'plants', t: 'animals', p: T2('Eating', 'भोजन करना'), x: T2('An animal eats the plant. The carbon in the plant’s food now becomes part of the animal.', 'जंतु पौधे को खाता है। पौधे के भोजन का कार्बन अब जंतु का हिस्सा बन जाता है।') },
        { f: 'animals', t: 'air', p: T2('Respiration of animals', 'जंतुओं की श्वसन क्रिया'), x: T2('Animals breathe out CO₂ when their cells break down food to release energy.', 'जब जंतुओं की कोशिकाएँ ऊर्जा के लिए भोजन तोड़ती हैं तो वे CO₂ छोड़ते हैं।') },
        { f: 'plants', t: 'soil', p: T2('Leaves fall and plants die', 'पत्तियाँ गिरना व पौधों का मरना'), x: T2('Dead leaves and plants fall on the soil. Their carbon is now in dead matter.', 'सूखी पत्तियाँ और पौधे मिट्टी पर गिरते हैं। उनका कार्बन अब मृत पदार्थ में है।') },
        { f: 'animals', t: 'soil', p: T2('Death and waste of animals', 'जंतुओं की मृत्यु व अपशिष्ट'), x: T2('Dead animals and their dung add carbon to the soil.', 'मरे हुए जंतु और उनका गोबर मिट्टी में कार्बन जोड़ते हैं।') },
        { f: 'soil', t: 'air', p: T2('Decay', 'सड़ना-गलना'), x: T2('Bacteria and fungi break down dead matter. They respire and give CO₂ back to the air.', 'जीवाणु और कवक मृत पदार्थ को सड़ाते हैं। वे श्वसन करते हैं और CO₂ हवा में लौटाते हैं।') },
        { f: 'soil', t: 'fuels', p: T2('Buried for millions of years', 'लाखों वर्षों तक दबे रहना'), x: T2('Some dead plants and animals get buried deep. Over millions of years, heat and pressure turn them into coal and oil.', 'कुछ मृत पौधे और जंतु गहराई में दब जाते हैं। लाखों वर्षों में ताप और दाब उन्हें कोयला और तेल बना देते हैं।') },
        { f: 'fuels', t: 'air', p: T2('Burning', 'जलना (दहन)'), x: T2('When we burn coal, petrol or wood, the stored carbon goes into the air as CO₂. Too much burning raises the CO₂ in the air.', 'कोयला, पेट्रोल या लकड़ी जलाने पर जमा कार्बन CO₂ बनकर हवा में चला जाता है। बहुत ज़्यादा जलाने से हवा में CO₂ बढ़ती है।') },
      ],
    },
    nitrogen: {
      n: T2('Nitrogen cycle', 'नाइट्रोजन चक्र'), start: 'air', needsSun: false,
      nodes: [
        { id: 'air', k: 'air', l: T2('Nitrogen gas (N₂) in air', 'हवा में नाइट्रोजन गैस (N₂)'), x: 0.5, y: 0.1 },
        { id: 'soil', k: 'ground', l: T2('Nitrates in soil', 'मिट्टी में नाइट्रेट'), x: 0.15, y: 0.5 },
        { id: 'plants', k: 'plant', l: T2('Plants', 'पौधे'), x: 0.85, y: 0.3 },
        { id: 'animals', k: 'animal', l: T2('Animals', 'जंतु'), x: 0.85, y: 0.64 },
        { id: 'dead', k: 'decomp', l: T2('Dead matter and wastes', 'मृत पदार्थ व अपशिष्ट'), x: 0.45, y: 0.88 },
      ],
      edges: [
        { f: 'air', t: 'soil', p: T2('Nitrogen fixation', 'नाइट्रोजन स्थिरीकरण'), x: T2('Rhizobium bacteria in the root nodules of pulses (and lightning) change nitrogen gas into nitrates that plants can use.', 'दलहनी पौधों की जड़ों की गाँठों में रहने वाले राइज़ोबियम जीवाणु (और बिजली की चमक) नाइट्रोजन गैस को नाइट्रेट में बदलते हैं, जिसे पौधे ले सकते हैं।') },
        { f: 'soil', t: 'plants', p: T2('Absorption by roots', 'जड़ों द्वारा अवशोषण'), x: T2('Plant roots take in nitrates and use them to make proteins.', 'पौधों की जड़ें नाइट्रेट सोखती हैं और उनसे प्रोटीन बनाती हैं।') },
        { f: 'plants', t: 'animals', p: T2('Eating proteins', 'प्रोटीन खाना'), x: T2('Animals eat plants (or other animals) and get nitrogen in the form of proteins.', 'जंतु पौधों (या दूसरे जंतुओं) को खाते हैं और प्रोटीन के रूप में नाइट्रोजन पाते हैं।') },
        { f: 'plants', t: 'dead', p: T2('Plants die', 'पौधों का मरना'), x: T2('Dead plants and fallen leaves carry nitrogen compounds into the soil.', 'सूखे पौधे और गिरी पत्तियाँ नाइट्रोजन के यौगिक मिट्टी में पहुँचाते हैं।') },
        { f: 'animals', t: 'dead', p: T2('Death and waste (urea)', 'मृत्यु व अपशिष्ट (यूरिया)'), x: T2('Dead animals, dung and urine (urea) return nitrogen compounds to the soil.', 'मरे जंतु, गोबर और मूत्र (यूरिया) नाइट्रोजन के यौगिक मिट्टी में लौटाते हैं।') },
        { f: 'dead', t: 'soil', p: T2('Decomposition', 'अपघटन'), x: T2('Decomposers change dead matter into ammonia, and other bacteria change ammonia into nitrates. The soil is fertile again.', 'अपघटक मृत पदार्थ को अमोनिया में और दूसरे जीवाणु अमोनिया को नाइट्रेट में बदलते हैं। मिट्टी फिर उपजाऊ हो जाती है।') },
        { f: 'soil', t: 'air', p: T2('Denitrification', 'विनाइट्रीकरण'), x: T2('Some bacteria change nitrates back into nitrogen gas, which goes into the air. The cycle is complete.', 'कुछ जीवाणु नाइट्रेट को वापस नाइट्रोजन गैस बना देते हैं, जो हवा में चली जाती है। चक्र पूरा हो जाता है।') },
      ],
    },
    water: {
      n: T2('Water cycle', 'जल चक्र'), start: 'sea', needsSun: true,
      nodes: [
        { id: 'air', k: 'cloud', l: T2('Water vapour and clouds', 'जलवाष्प व बादल'), x: 0.5, y: 0.1 },
        { id: 'plants', k: 'plant', l: T2('Plants', 'पौधे'), x: 0.15, y: 0.4 },
        { id: 'land', k: 'land', l: T2('Land, rivers and glaciers', 'भूमि, नदियाँ व हिमनद'), x: 0.85, y: 0.42 },
        { id: 'sea', k: 'sea', l: T2('Sea and lakes', 'समुद्र व झीलें'), x: 0.2, y: 0.88 },
        { id: 'ground', k: 'ground', l: T2('Groundwater', 'भूजल'), x: 0.7, y: 0.88 },
      ],
      edges: [
        { f: 'sea', t: 'air', p: T2('Evaporation', 'वाष्पीकरण'), sun: 1, x: T2('The Sun heats the water. Some of it turns into invisible water vapour and rises.', 'सूर्य पानी को गर्म करता है। कुछ पानी अदृश्य जलवाष्प बनकर ऊपर उठता है।') },
        { f: 'land', t: 'air', p: T2('Evaporation from land', 'भूमि से वाष्पीकरण'), sun: 1, x: T2('Water from wet soil, rivers and puddles also evaporates in the sun.', 'गीली मिट्टी, नदियों और गड्ढों का पानी भी धूप में वाष्पित होता है।') },
        { f: 'plants', t: 'air', p: T2('Transpiration', 'वाष्पोत्सर्जन'), sun: 1, x: T2('Plants lose water vapour through tiny holes in their leaves, mostly in the sun.', 'पौधे अपनी पत्तियों के छोटे छिद्रों से, अधिकतर धूप में, जलवाष्प छोड़ते हैं।') },
        { f: 'air', t: 'land', p: T2('Condensation, then rain or snow', 'संघनन, फिर वर्षा या हिमपात'), x: T2('High up it is cold. Vapour condenses into tiny droplets that form clouds. When the drops grow heavy they fall as rain, hail or snow.', 'ऊपर ठंड होती है। वाष्प संघनित होकर छोटी बूँदें बनाती है, जिनसे बादल बनते हैं। बूँदें भारी होने पर वर्षा, ओले या बर्फ़ बनकर गिरती हैं।') },
        { f: 'air', t: 'sea', p: T2('Rain over the sea', 'समुद्र पर वर्षा'), x: T2('Most rain falls straight back into the oceans.', 'अधिकतर वर्षा सीधे महासागरों में ही गिरती है।') },
        { f: 'land', t: 'sea', p: T2('Run-off by rivers', 'नदियों द्वारा बहाव'), x: T2('Rain water flows down slopes into streams and rivers and returns to the sea.', 'वर्षा का पानी ढलानों से धाराओं और नदियों में बहकर समुद्र में लौट जाता है।') },
        { f: 'land', t: 'ground', p: T2('Infiltration', 'भूमि में रिसना'), x: T2('Some water soaks into the soil and fills the spaces between rocks. This is groundwater.', 'कुछ पानी मिट्टी में रिसकर चट्टानों के बीच की जगहों को भर देता है। यह भूजल है।') },
        { f: 'ground', t: 'plants', p: T2('Taken in by roots', 'जड़ों द्वारा सोखना'), x: T2('Plant roots absorb water from the soil and carry it up to the leaves.', 'पौधों की जड़ें मिट्टी से पानी सोखकर पत्तियों तक पहुँचाती हैं।') },
        { f: 'ground', t: 'sea', p: T2('Seepage', 'रिसकर बहना'), x: T2('Groundwater moves slowly underground and flows out into rivers and the sea.', 'भूजल धीरे-धीरे ज़मीन के नीचे बहकर नदियों और समुद्र में निकल जाता है।') },
      ],
    },
    oxygen: {
      n: T2('Oxygen cycle', 'ऑक्सीजन चक्र'), start: 'air', needsSun: true,
      nodes: [
        { id: 'air', k: 'air', l: T2('Oxygen (O₂) in air', 'हवा में ऑक्सीजन (O₂)'), x: 0.2, y: 0.1 },
        { id: 'animals', k: 'animal', l: T2('Animals and people', 'जंतु व मनुष्य'), x: 0.85, y: 0.34 },
        { id: 'fire', k: 'fire', l: T2('Burning fuels', 'ईंधन का जलना'), x: 0.5, y: 0.5 },
        { id: 'co2', k: 'air', l: T2('Carbon dioxide (CO₂) in air', 'हवा में कार्बन डाइऑक्साइड (CO₂)'), x: 0.7, y: 0.88 },
        { id: 'plants', k: 'plant', l: T2('Plants and algae', 'पौधे व शैवाल'), x: 0.15, y: 0.7 },
      ],
      edges: [
        { f: 'air', t: 'animals', p: T2('Breathing in', 'साँस लेना'), x: T2('Animals breathe in oxygen. Their cells use it to release energy from food.', 'जंतु ऑक्सीजन साँस में लेते हैं। उनकी कोशिकाएँ उससे भोजन से ऊर्जा निकालती हैं।') },
        { f: 'animals', t: 'co2', p: T2('Breathing out', 'साँस छोड़ना'), x: T2('Respiration makes carbon dioxide and water, and we breathe the CO₂ out.', 'श्वसन से कार्बन डाइऑक्साइड और जल बनते हैं; CO₂ हम साँस छोड़कर निकालते हैं।') },
        { f: 'air', t: 'fire', p: T2('Burning uses oxygen', 'जलने में ऑक्सीजन लगना'), x: T2('Fire needs oxygen. Wood, coal and petrol cannot burn without it.', 'आग को ऑक्सीजन चाहिए। लकड़ी, कोयला और पेट्रोल उसके बिना नहीं जल सकते।') },
        { f: 'fire', t: 'co2', p: T2('Burning gives CO₂', 'जलने से CO₂ बनना'), x: T2('Burning carbon fuels gives carbon dioxide and water vapour.', 'कार्बन वाले ईंधन जलने पर कार्बन डाइऑक्साइड और जलवाष्प बनती है।') },
        { f: 'co2', t: 'plants', p: T2('Photosynthesis takes in CO₂', 'प्रकाश-संश्लेषण में CO₂ लेना'), sun: 1, x: T2('In sunlight, green plants and algae take in CO₂ and water to make food.', 'सूर्य के प्रकाश में हरे पौधे और शैवाल CO₂ और जल से भोजन बनाते हैं।') },
        { f: 'plants', t: 'air', p: T2('Photosynthesis gives O₂', 'प्रकाश-संश्लेषण से O₂ मिलना'), sun: 1, x: T2('Photosynthesis also releases oxygen. This is how the air gets its oxygen back.', 'प्रकाश-संश्लेषण में ऑक्सीजन भी निकलती है। इसी से हवा को ऑक्सीजन वापस मिलती है।') },
      ],
    },
  };
  Object.keys(CYC).forEach((k) => CYC[k].edges.forEach((e, i) => { e.i = i; }));

  // ---------------------------------------------------------------- waste (India's two-bin rule: green wet, blue dry)
  // rot: index into ROT (how long it takes to rot or wear away).
  const WASTE = {
    banana: { bin: 'green', rot: 0, n: T2('Banana peel', 'केले का छिलका'), why: T2('Peels are plant matter. Bacteria and fungi rot them into compost in a few weeks.', 'छिलके पौधे का भाग हैं। जीवाणु और कवक उन्हें कुछ हफ़्तों में सड़ाकर खाद बना देते हैं।') },
    veg: { bin: 'green', rot: 0, n: T2('Vegetable scraps', 'सब्ज़ी के छिलके'), why: T2('Kitchen scraps are wet waste. They make good compost for plants.', 'रसोई का कचरा गीला कचरा है। इससे पौधों के लिए अच्छी खाद बनती है।') },
    tea: { bin: 'green', rot: 0, n: T2('Used tea leaves', 'इस्तेमाल की हुई चायपत्ती'), why: T2('Tea leaves come from a plant and rot easily, so they go with wet waste.', 'चायपत्ती पौधे से आती है और आसानी से सड़ती है, इसलिए वह गीले कचरे में जाती है।') },
    leaves: { bin: 'green', rot: 1, n: T2('Dry leaves', 'सूखी पत्तियाँ'), why: T2('Fallen leaves are plant waste. They rot into soil in a few months.', 'गिरी पत्तियाँ पौधे का कचरा हैं। वे कुछ महीनों में सड़कर मिट्टी बन जाती हैं।') },
    flowers: { bin: 'green', rot: 0, n: T2('Old flowers', 'पुराने फूल'), why: T2('Flowers are natural and biodegradable, so they go in the wet waste bin.', 'फूल प्राकृतिक और जैव-निम्नीकरणीय होते हैं, इसलिए वे गीले कचरे के डिब्बे में जाते हैं।') },
    rice: { bin: 'green', rot: 0, n: T2('Leftover rice', 'बचा हुआ चावल'), why: T2('Cooked food is wet waste. It rots fast, so never leave it in the open.', 'पका भोजन गीला कचरा है। यह जल्दी सड़ता है, इसलिए इसे खुले में न छोड़ें।') },
    newspaper: { bin: 'blue', rot: 0, n: T2('Old newspaper', 'पुराना अख़बार'), why: T2('Paper is dry waste. It can be recycled into new paper.', 'काग़ज़ सूखा कचरा है। उसे दोबारा काग़ज़ बनाने में काम में लिया जा सकता है।') },
    cardboard: { bin: 'blue', rot: 1, n: T2('Cardboard box', 'गत्ते का डिब्बा'), why: T2('Cardboard is dry waste and can be recycled.', 'गत्ता सूखा कचरा है और उसका पुनर्चक्रण हो सकता है।') },
    bottle: { bin: 'blue', rot: 3, n: T2('Plastic bottle', 'प्लास्टिक की बोतल'), why: T2('Plastic does not rot for hundreds of years. Put it in dry waste so it can be recycled.', 'प्लास्टिक सैकड़ों वर्षों तक नहीं सड़ता। उसे सूखे कचरे में डालें ताकि उसका पुनर्चक्रण हो।') },
    bag: { bin: 'blue', rot: 3, n: T2('Plastic bag', 'पॉलिथीन की थैली'), why: T2('Plastic bags last a very long time and harm animals that swallow them. Keep them dry and send them for recycling.', 'पॉलिथीन बहुत लंबे समय तक रहती है और निगलने वाले पशुओं को हानि पहुँचाती है। उसे सूखा रखकर पुनर्चक्रण के लिए दें।') },
    glass: { bin: 'blue', rot: 3, n: T2('Glass bottle', 'काँच की बोतल'), why: T2('Glass does not rot, but it can be melted and used again. Dry waste.', 'काँच सड़ता नहीं, पर उसे पिघलाकर दोबारा काम में लिया जा सकता है। सूखा कचरा।') },
    can: { bin: 'blue', rot: 2, n: T2('Tin can', 'टिन का डिब्बा'), why: T2('Metal takes decades to rust away. Recycle it as dry waste.', 'धातु को गलने में दशकों लगते हैं। उसे सूखे कचरे के रूप में पुनर्चक्रित करें।') },
    foil: { bin: 'blue', rot: 3, n: T2('Aluminium foil', 'एल्युमिनियम की पन्नी'), why: T2('Aluminium can be recycled again and again. Dry waste.', 'एल्युमिनियम का बार-बार पुनर्चक्रण हो सकता है। सूखा कचरा।') },
    cloth: { bin: 'blue', rot: 1, n: T2('Old cloth', 'पुराना कपड़ा'), why: T2('Cloth is dry waste. Better still, give it away or reuse it as a rag.', 'कपड़ा सूखा कचरा है। इससे भी अच्छा, उसे किसी को दे दें या पोंछे की तरह दोबारा काम में लें।') },
  };
  const ROT = [T2('days to weeks', 'कुछ दिन से हफ़्ते'), T2('a few months', 'कुछ महीने'), T2('decades', 'दशकों'), T2('hundreds of years', 'सैकड़ों वर्ष')];
  const BIN = {
    green: { n: T2('Green bin: wet waste', 'हरा डिब्बा: गीला कचरा'), s: T2('Wet waste', 'गीला कचरा'), c: '#16A34A', d: T2('Food and plant waste. It becomes compost.', 'भोजन और पौधों का कचरा। इससे खाद बनती है।') },
    blue: { n: T2('Blue bin: dry waste', 'नीला डिब्बा: सूखा कचरा'), s: T2('Dry waste', 'सूखा कचरा'), c: '#2563EB', d: T2('Paper, plastic, glass and metal. It goes for recycling.', 'काग़ज़, प्लास्टिक, काँच और धातु। यह पुनर्चक्रण के लिए जाता है।') },
  };
  const WASTE_DEFAULT = ['banana', 'newspaper', 'veg', 'bottle', 'leaves', 'glass', 'rice', 'can'];
  const WASTE_IDS = Object.keys(WASTE);

  // ---------------------------------------------------------------- energy (the 10 per cent rule)
  const ENERGY_TOP = 10000; // joules at the producers: an example number for the pyramid
  const energyAt = (level) => ENERGY_TOP / Math.pow(10, level - 1);
  const fmtJ = (v) => String(v) + ' J';
  const LEVEL_NAME = [T2('Producer', 'उत्पादक'), T2('Primary consumer', 'प्राथमिक उपभोक्ता'), T2('Secondary consumer', 'द्वितीयक उपभोक्ता'), T2('Tertiary consumer', 'तृतीयक उपभोक्ता'), T2('Quaternary consumer', 'चतुर्थ उपभोक्ता')];

  // ---------------------------------------------------------------- predator and prey model (relative to the balanced level = 1)
  // x producer, y herbivore, z carnivore.  x' = r x (1 - x/2) - a x y;  y' = y (c1 x - d1 z - m1);  z' = c2 z (y - 1).
  // The point (1,1,1) is the balance. These numbers make it stable: the three populations swing and settle.
  const POP = { r: 1.2, a: 0.6, c1: 0.9, d1: 0.5, m1: 0.4, c2: 0.6, dt: 0.02, years: 24, start: [1, 1.7, 0.45] };
  function popStep(s, years) {
    let { x, y, z } = s;
    const n = Math.max(1, Math.round(years / POP.dt)), h = years / n;
    for (let i = 0; i < n; i++) {
      const dx = POP.r * x * (1 - x / 2) - POP.a * x * y;
      const dy = y * (POP.c1 * x - POP.d1 * z - POP.m1);
      const dz = POP.c2 * z * (y - 1);
      x = Math.max(0, x + dx * h); y = Math.max(0, y + dy * h); z = Math.max(0, z + dz * h);
    }
    return { x, y, z };
  }

  // ---------------------------------------------------------------- drawings (64 x 64 boxes, all our own SVG)
  const ART = {};
  const eye = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + r * 0.2}" cy="${y}" r="${r * 0.55}" fill="#1E293B"/>`;
  const ground = (c) => `<ellipse cx="32" cy="58" rx="24" ry="3" fill="${c || '#000'}" opacity=".12"/>`;
  // a four-legged animal facing right. o: c body, l legs/dark, b belly, ear, tail, horn, stripes, spots, hump, s scale
  function quad(o) {
    const c = o.c, l = o.l || c, s = o.s || 1;
    let g = `<g transform="translate(32 57) scale(${s}) translate(-32 -57)">`;
    g += `<path d="M9 36 Q3 38 4 47" stroke="${o.tl || l}" stroke-width="${o.tail === 'thin' ? 1.8 : 4.5}" fill="none" stroke-linecap="round"/>`;
    if (o.tail === 'bushy') g += `<ellipse cx="7" cy="42" rx="4" ry="8" fill="${o.tl || l}" transform="rotate(20 7 42)"/>`;
    [[15, 0], [21, 1], [37, 1], [43, 0]].forEach(([x, back]) => { g += `<rect x="${x}" y="42" width="5" height="15" rx="2.5" fill="${back ? l : c}" ${back ? '' : `opacity="1"`}/>`; });
    g += `<ellipse cx="29" cy="38" rx="20" ry="11" fill="${c}"/>`;
    if (o.b) g += `<ellipse cx="29" cy="43" rx="15" ry="5" fill="${o.b}" opacity=".85"/>`;
    if (o.hump) g += `<ellipse cx="20" cy="25" rx="7" ry="8" fill="${c}"/><ellipse cx="34" cy="26" rx="6" ry="7" fill="${c}"/>`;
    if (o.mane) g += `<circle cx="45" cy="29" r="10" fill="${o.mane}"/>`;
    g += `<path d="M42 36 L49 22 L58 28 L48 44Z" fill="${c}"/>`;
    g += `<ellipse cx="53" cy="30" rx="${o.snout ? 9 : 7.5}" ry="6.5" fill="${o.h || c}"/>`;
    if (o.stripes) for (let i = 0; i < 5; i++) g += `<path d="M${15 + i * 7} ${28 + (i % 2)} q2 6 -1 12" stroke="#1E293B" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (o.spots) [[16, 35], [24, 31], [31, 38], [38, 33], [22, 42], [45, 38]].forEach(([x, y]) => { g += `<circle cx="${x}" cy="${y}" r="1.9" fill="${o.spots}"/>`; });
    if (o.ear === 'long') g += `<ellipse cx="49" cy="14" rx="2.8" ry="9" fill="${c}" transform="rotate(-8 49 14)"/><ellipse cx="55" cy="15" rx="2.6" ry="8" fill="${c}" transform="rotate(10 55 15)"/><ellipse cx="49" cy="14" rx="1.2" ry="6" fill="#F6B7C1" transform="rotate(-8 49 14)"/>`;
    if (o.ear === 'point') g += `<path d="M47 25 L48 16 L53 23Z" fill="${l}"/><path d="M54 24 L57 16 L59 25Z" fill="${l}"/>`;
    if (o.ear === 'round') g += `<circle cx="48" cy="23" r="4" fill="${l}"/><circle cx="55" cy="23" r="3.5" fill="${l}"/>`;
    if (o.ear === 'side') g += `<ellipse cx="47" cy="25" rx="6" ry="2.6" fill="${l}" transform="rotate(-25 47 25)"/>`;
    if (o.horn === 'antler') g += `<path d="M51 22 L50 10 M50 15 L45 11 M50 11 L53 6 M56 22 L58 10 M58 15 L62 11" stroke="#7A5230" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    if (o.horn === 'curve') g += `<path d="M51 23 Q47 12 54 10 M56 24 Q60 14 56 10" stroke="#F4EBD0" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (o.horn === 'ram') g += `<path d="M52 24 Q42 20 46 32 M57 25 Q60 18 55 17" stroke="${o.hc || '#8A7B5A'}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    g += eye(55, 28, 2.2);
    g += `<circle cx="60.6" cy="31" r="1.5" fill="${o.nose || '#1E293B'}"/>`;
    return g + '</g>';
  }
  // a bird facing right. o: c body, w wing, bk beak colour, comb, tail
  function bird(o) {
    const s = o.s || 1;
    let g = `<g transform="translate(32 57) scale(${s}) translate(-32 -57)">`;
    g += `<path d="M30 46 L28 56 M36 46 L36 56 M24 56 h8 M32 56 h8" stroke="${o.leg || '#E58A1A'}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M14 36 L2 30 L5 41 L2 48 L16 44Z" fill="${o.tc || o.w}"/>`;
    g += `<ellipse cx="30" cy="37" rx="18" ry="12" fill="${o.c}"/>`;
    if (o.b) g += `<ellipse cx="34" cy="42" rx="11" ry="7" fill="${o.b}"/>`;
    g += `<ellipse cx="26" cy="35" rx="11" ry="7" fill="${o.w}" transform="rotate(-12 26 35)"/>`;
    g += `<circle cx="46" cy="23" r="8" fill="${o.hc || o.c}"/>`;
    if (o.comb) g += `<path d="M42 16 q2 -6 4 -1 q2 -5 4 0 q2 -3 2 2z" fill="#E11D48"/><path d="M52 29 q2 5 -1 6" stroke="#E11D48" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    g += o.hook ? `<path d="M52 20 Q61 20 59 30 Q57 25 52 26Z" fill="${o.bk || '#F5B90A'}"/>` : `<path d="M52 21 L${58 + (o.bl || 0)} 25 L52 27Z" fill="${o.bk || '#F5B90A'}"/>`;
    g += eye(48, 22, 2.2);
    return g + '</g>';
  }
  // a fish facing left. o: c body, b belly, f fins, stripe
  function fish(o) {
    const s = o.s || 1;
    let g = `<g transform="translate(32 32) scale(${s}) translate(-32 -32)">`;
    g += `<path d="M46 32 L61 21 Q58 32 61 43Z" fill="${o.f || o.c}"/>`;
    g += `<path d="M24 22 Q32 10 42 23Z" fill="${o.f || o.c}"/><path d="M28 42 Q34 51 40 41Z" fill="${o.f || o.c}"/>`;
    g += `<path d="M5 32 Q18 15 36 20 Q50 24 49 32 Q50 40 36 44 Q18 49 5 32Z" fill="${o.c}"/>`;
    if (o.b) g += `<path d="M7 34 Q22 46 36 43 Q47 40 48 33 Q30 40 7 34Z" fill="${o.b}"/>`;
    if (o.stripe) g += `<path d="M20 22 Q16 32 20 42 M27 21 Q23 32 27 43" stroke="${o.stripe}" stroke-width="1.6" fill="none" opacity=".6"/>`;
    g += `<path d="M13 25 Q10 32 13 40" stroke="#000" stroke-opacity=".18" stroke-width="1.5" fill="none"/>`;
    g += eye(11, 30, 2.4);
    return g + '</g>';
  }
  const tuft = (x, c, h) => `<path d="M${x - 4} 58 Q${x - 3} ${58 - h} ${x - 7} ${58 - h - 8} Q${x + 2} ${58 - h * 0.7} ${x + 1} 58Z" fill="${c}"/>`;

  ART.grass = () => ground('#3E7B2F') + [[10, 26, '#3F9B3A'], [22, 38, '#56B24E'], [34, 30, '#3F9B3A'], [46, 40, '#56B24E'], [56, 24, '#3F9B3A']].map(([x, h, c]) => `<path d="M${x - 5} 58 Q${x - 2} ${58 - h * 0.6} ${x + 2} ${58 - h} Q${x + 4} ${58 - h * 0.5} ${x + 6} 58Z" fill="${c}"/>`).join('') + `<path d="M4 58 H60" stroke="#7A5A33" stroke-width="3" stroke-linecap="round"/>`;
  ART.tree = () => ground('#2D5A27') + `<path d="M28 58 L29 36 L35 36 L36 58Z" fill="#8B5E34"/><circle cx="32" cy="22" r="15" fill="#2F8F46"/><circle cx="20" cy="30" r="11" fill="#3FA85A"/><circle cx="44" cy="30" r="11" fill="#3FA85A"/><circle cx="32" cy="14" r="8" fill="#56BE6E"/>`;
  ART.algae = () => `<circle cx="14" cy="42" r="10" fill="#6AC259" opacity=".85"/><circle cx="30" cy="30" r="12" fill="#4FB04A" opacity=".9"/><circle cx="46" cy="42" r="10" fill="#7AD36A" opacity=".9"/><circle cx="32" cy="48" r="8" fill="#3F9B3A" opacity=".85"/><path d="M12 56 Q16 44 12 34 M30 56 Q36 40 30 22 M48 56 Q42 46 48 34" stroke="#2F7E2E" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  ART.lotus = () => `<ellipse cx="32" cy="52" rx="28" ry="7" fill="#2E9E5B"/><ellipse cx="32" cy="50" rx="26" ry="5" fill="#3FB56B"/><g transform="translate(32 40)">${[-60, -30, 0, 30, 60].map((a) => `<ellipse cx="0" cy="-10" rx="5.5" ry="13" fill="#F9A8D4" transform="rotate(${a})"/>`).join('')}<ellipse cx="0" cy="-8" rx="4" ry="10" fill="#FBCFE8"/><circle cx="0" cy="-3" r="4" fill="#FFD23F"/></g>`;
  ART.phyto = () => [[12, 16, 5, '#2FAE6B'], [30, 10, 4, '#4FC48A'], [48, 18, 6, '#2FAE6B'], [20, 32, 6, '#58C98F'], [42, 36, 5, '#2FAE6B'], [10, 48, 4, '#4FC48A'], [32, 50, 6, '#2FAE6B'], [54, 50, 4, '#58C98F'], [30, 30, 3, '#14B8A6']].map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#fff" opacity=".6"/>`).join('');
  ART.seaweed = () => ground('#0B4F9C') + `<path d="M14 58 Q4 44 14 32 Q22 20 12 6" stroke="#4D7C0F" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M32 58 Q22 42 33 30 Q42 18 32 4" stroke="#65A30D" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M50 58 Q42 46 51 36 Q58 26 50 14" stroke="#4D7C0F" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  ART.mangrove = () => `<path d="M6 56 H58" stroke="#5B8DB8" stroke-width="3" stroke-linecap="round"/><path d="M20 50 Q22 38 28 34 M44 50 Q42 38 36 34 M32 52 V34 M26 52 Q28 42 30 36 M38 52 Q36 42 34 36" stroke="#7A5A33" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M29 36 L31 22 L35 22 L35 36Z" fill="#8B5E34"/><circle cx="32" cy="14" r="11" fill="#2F8F46"/><circle cx="22" cy="20" r="8" fill="#3FA85A"/><circle cx="43" cy="20" r="8" fill="#3FA85A"/><path d="M14 56 v-4 M50 56 v-4 M9 56 v-3 M55 56 v-3" stroke="#7A5A33" stroke-width="2" stroke-linecap="round"/>`;
  ART.wheat = () => ground('#92400E') + [[14, 0], [26, 6], [38, 2], [50, 8]].map(([x, d]) => `<path d="M${x} 58 Q${x + 1} 40 ${x + d * 0.2} 22" stroke="#B88A2B" stroke-width="2" fill="none"/>` + [0, 1, 2, 3, 4].map((i) => `<ellipse cx="${x + d * 0.2 - 3}" cy="${22 - i * 5 + 3}" rx="2.4" ry="4.5" fill="#F2C23C" transform="rotate(-25 ${x + d * 0.2 - 3} ${22 - i * 5 + 3})"/><ellipse cx="${x + d * 0.2 + 3}" cy="${22 - i * 5}" rx="2.4" ry="4.5" fill="#E0A82C" transform="rotate(25 ${x + d * 0.2 + 3} ${22 - i * 5})"/>`).join('')).join('');
  ART.paddy = () => `<path d="M4 54 H60 V60 H4Z" fill="#5BB8E8" opacity=".6"/>` + [[16, 18], [32, 12], [48, 20]].map(([x, h]) => `<path d="M${x} 56 Q${x} 30 ${x + 4} ${h}" stroke="#4CAF50" stroke-width="2.4" fill="none"/><path d="M${x + 4} ${h} Q${x + 14} ${h - 2} ${x + 12} ${h + 14}" stroke="#D9B13B" stroke-width="2.4" fill="none"/><path d="M${x} 56 Q${x - 10} 40 ${x - 12} 28 M${x} 56 Q${x + 12} 42 ${x + 14} 34" stroke="#66BB6A" stroke-width="2.2" fill="none"/>`).join('') + [[28, 20], [44, 28], [62, 26]].map(([x, y]) => `<circle cx="${x - 6}" cy="${y + 2}" r="1.8" fill="#E8C75A"/><circle cx="${x - 3}" cy="${y + 7}" r="1.8" fill="#E8C75A"/>`).join('');
  ART.desertgrass = () => ground('#A16207') + [[12, 22], [24, 34], [36, 26], [48, 32], [58, 20]].map(([x, h]) => `<path d="M${x - 5} 58 Q${x - 2} ${58 - h * 0.5} ${x + 2} ${58 - h} Q${x + 3} ${58 - h * 0.4} ${x + 5} 58Z" fill="${h % 4 ? '#B5A642' : '#9CAF4B'}"/>`).join('');
  ART.khejri = () => ground('#A16207') + `<path d="M29 58 Q27 44 30 34 Q31 26 24 20 M31 36 Q38 30 44 22" stroke="#8B5E34" stroke-width="4.5" fill="none" stroke-linecap="round"/>` + [[22, 16], [30, 10], [40, 14], [46, 22], [16, 24], [34, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="#7FB34A"/><circle cx="${x + 3}" cy="${y - 2}" r="3.5" fill="#9BC85E"/>`).join('');
  ART.alpine = () => `<path d="M2 58 L18 36 L26 46 L36 30 L48 46 L62 58Z" fill="#9AA5B8"/><path d="M0 58 Q16 48 32 52 Q48 46 64 58Z" fill="#5E9B52"/>` + [[14, 50], [26, 47], [40, 49], [52, 47]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5" fill="${i % 2 ? '#4C8A44' : '#6DAF5F'}"/>`).join('') + `<circle cx="20" cy="46" r="2.2" fill="#C084FC"/><circle cx="46" cy="44" r="2.2" fill="#F472B6"/><circle cx="33" cy="45" r="2" fill="#FFD23F"/>`;
  ART.fungi = () => ground('#6B4F2A') + `<path d="M26 58 Q24 44 27 38 H37 Q40 44 38 58Z" fill="#F3E7CF"/><path d="M6 40 Q8 14 32 14 Q56 14 58 40 Q32 34 6 40Z" fill="#D9534F"/><circle cx="20" cy="26" r="3.6" fill="#FFF"/><circle cx="34" cy="22" r="4.2" fill="#FFF"/><circle cx="46" cy="30" r="3.2" fill="#FFF"/>`;
  ART.bacteria = () => `<g fill="#A21CAF" opacity=".95"><rect x="8" y="14" width="26" height="12" rx="6" transform="rotate(20 21 20)"/><rect x="30" y="34" width="26" height="12" rx="6" transform="rotate(-25 43 40)"/><rect x="6" y="40" width="20" height="10" rx="5" fill="#C026D3" transform="rotate(-8 16 45)"/></g><g fill="#fff" opacity=".6"><circle cx="14" cy="17" r="2"/><circle cx="46" cy="40" r="2"/></g><path d="M34 16 q6 -6 10 0 q4 6 10 0" stroke="#C026D3" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  ART.earthworm = () => `<path d="M6 44 Q14 28 22 42 Q30 56 38 40 Q46 24 56 34" stroke="#E08A8A" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M6 44 Q14 28 22 42 Q30 56 38 40 Q46 24 56 34" stroke="#F4B6B6" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/><circle cx="55" cy="34" r="1.5" fill="#1E293B"/><path d="M36 40 q2 -5 5 -4" stroke="#C86F6F" stroke-width="3" fill="none"/>`;
  // insects and small animals
  const hopper = (c, d) => `${ground()}<path d="M12 32 L24 44 L28 56" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M12 32 L6 40" stroke="${d}" stroke-width="2" fill="none"/><path d="M30 40 L38 48 L40 56 M36 38 L46 44 L48 54" stroke="${d}" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="34" rx="20" ry="7.5" fill="${c}" transform="rotate(-6 30 34)"/><path d="M14 30 Q30 20 52 30" stroke="${d}" stroke-width="1.5" fill="none" opacity=".5"/><ellipse cx="51" cy="28" rx="7" ry="6" fill="${c}"/>${eye(53, 26, 2.4)}<path d="M52 22 Q56 10 62 8 M49 22 Q50 12 54 6" stroke="${d}" stroke-width="1.4" fill="none"/>`;
  ART.grasshopper = () => hopper('#7DBB3C', '#4D7A1C');
  ART.locust = () => hopper('#D8B13A', '#8A6A12');
  ART.caterpillar = () => ground() + [[10, 46], [19, 42], [28, 40], [37, 41], [46, 44]].map(([x, y], i) => `<path d="M${x} ${y + 6} v8" stroke="#3F7D2C" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="8.2" fill="${i % 2 ? '#7BC74D' : '#5FB23A'}"/>`).join('') + `<circle cx="54" cy="46" r="8" fill="#F59E0B"/>${eye(57, 44, 2.2)}<path d="M52 38 q-2 -7 -6 -9 M57 39 q3 -6 7 -7" stroke="#3F7D2C" stroke-width="1.6" fill="none"/>`;
  ART.zooplankton = () => `<ellipse cx="30" cy="34" rx="18" ry="14" fill="#C7A3E8" opacity=".85"/><ellipse cx="30" cy="34" rx="18" ry="14" fill="none" stroke="#8B5CF6" stroke-width="2"/><circle cx="40" cy="30" r="4" fill="#fff"/><circle cx="41" cy="30" r="2" fill="#1E293B"/><ellipse cx="24" cy="38" rx="7" ry="5" fill="#8B5CF6" opacity=".5"/><path d="M46 28 Q56 22 58 12 M46 34 Q58 34 60 42 M14 44 l-6 8 M22 48 l-3 8 M30 48 l0 9" stroke="#8B5CF6" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  ART.tadpole = () => `<path d="M26 34 Q44 22 62 34 Q44 44 26 34Z" fill="#6B8E3A"/><ellipse cx="19" cy="34" rx="15" ry="12" fill="#4F6D2B"/><ellipse cx="17" cy="38" rx="9" ry="5" fill="#7E9B4F" opacity=".7"/>${eye(12, 29, 2.6)}`;
  ART.waterbug = () => `<path d="M16 28 L4 20 M24 24 L16 12 M40 26 L50 14 M46 32 L60 28 M18 44 L6 54 M34 46 L40 58" stroke="#5C4326" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M20 36 Q22 24 36 24 Q50 24 52 36 Q50 46 36 46 Q22 48 20 36Z" fill="#8B6A3E"/><path d="M26 30 Q36 28 46 32" stroke="#C9A36A" stroke-width="2" fill="none"/>${eye(46, 30, 2.4)}`;
  ART.frog = () => ground('#2E7D32') + `<path d="M10 56 L16 46 L26 50 M54 56 L50 46 L40 50" stroke="#3C9B3C" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 56 h10 M48 56 h10" stroke="#3C9B3C" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="32" cy="42" rx="19" ry="13" fill="#4CAF50"/><ellipse cx="32" cy="48" rx="12" ry="6" fill="#C8E6A0"/><ellipse cx="32" cy="31" rx="16" ry="10" fill="#57BC57"/>${eye(23, 22, 5)}${eye(41, 22, 5)}<path d="M24 34 Q32 39 40 34" stroke="#1E5E22" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  ART.rohu = () => fish({ c: '#8E9AA6', b: '#DDE3EA', f: '#D4533B', stripe: '#6B7682' });
  ART.catla = () => fish({ c: '#7D8C8F', b: '#E8E1CF', f: '#5B6B6E', s: 1.02 });
  ART.sardine = () => fish({ c: '#8FB0C9', b: '#EEF5FA', f: '#5E7E99', s: 0.86, stripe: '#2A4B6B' });
  ART.tuna = () => fish({ c: '#2B5C99', b: '#DCE8F4', f: '#1B3E6B', s: 1.06 });
  ART.shark = () => `<path d="M46 34 L62 20 Q58 34 62 46Z" fill="#6B7C8C"/><path d="M24 24 L34 6 L40 26Z" fill="#6B7C8C"/><path d="M26 40 L36 54 L42 40Z" fill="#6B7C8C"/><path d="M2 36 Q16 20 36 24 Q52 26 50 34 Q52 42 34 44 Q14 46 2 36Z" fill="#7C8EA0"/><path d="M4 38 Q24 48 48 36 Q34 44 4 38Z" fill="#E9EFF5"/><path d="M12 30 Q10 34 12 38" stroke="#4B5B6B" stroke-width="1.5" fill="none"/><path d="M16 36 l2 3 l2 -3 l2 3 l2 -3" stroke="#fff" stroke-width="1.2" fill="none"/>${eye(13, 31, 2.2)}`;
  ART.turtle = () => `<path d="M12 40 Q4 44 6 52 Q14 50 18 44ZM50 40 Q58 44 56 52 Q48 50 44 44Z" fill="#5E9B52"/><path d="M42 34 Q58 30 60 24" stroke="#7DB36C" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="59" cy="24" r="6" fill="#7DB36C"/>${eye(61, 22, 1.8)}<path d="M8 40 Q10 14 32 14 Q54 14 56 40Z" fill="#8A6B3A"/><path d="M12 38 Q14 20 32 19 Q50 20 52 38Z" fill="#A67F42"/><path d="M32 19 V38 M20 26 L26 38 M44 26 L38 38 M14 32 H50" stroke="#6B4F26" stroke-width="2" fill="none"/>`;
  ART.crab = () => `<path d="M14 40 L4 46 M16 44 L8 54 M50 40 L60 46 M48 44 L56 54" stroke="#D9422B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M12 28 Q4 14 14 10 Q20 14 14 22ZM52 28 Q60 14 50 10 Q44 14 50 22Z" fill="#E4573D"/><path d="M18 26 L12 28 M46 26 L52 28" stroke="#D9422B" stroke-width="4" stroke-linecap="round"/><ellipse cx="32" cy="38" rx="19" ry="13" fill="#EF6A4E"/><path d="M24 25 V20 M40 25 V20" stroke="#D9422B" stroke-width="2.5"/><circle cx="24" cy="18" r="3.4" fill="#fff"/><circle cx="40" cy="18" r="3.4" fill="#fff"/><circle cx="24" cy="18" r="1.6" fill="#1E293B"/><circle cx="40" cy="18" r="1.6" fill="#1E293B"/><path d="M26 40 Q32 44 38 40" stroke="#B3321C" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  ART.snake = () => ground('#3E7B2F') + `<path d="M6 52 Q14 40 24 50 Q34 60 42 46 Q50 32 36 30 Q24 28 30 18" stroke="#7A8A3A" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M6 52 Q14 40 24 50 Q34 60 42 46 Q50 32 36 30 Q24 28 30 18" stroke="#B6C26B" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 7"/><ellipse cx="32" cy="14" rx="8" ry="6" fill="#7A8A3A"/>${eye(34, 12, 2)}<path d="M38 16 l6 2 l-2 -3 M44 18 l4 2" stroke="#E11D48" stroke-width="1.4" fill="none"/>`;
  ART.viper = () => ground('#A16207') + `<path d="M6 50 Q14 38 24 48 Q34 58 42 44 Q50 30 36 28 Q26 26 32 18" stroke="#B9955B" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M6 50 Q14 38 24 48 Q34 58 42 44 Q50 30 36 28 Q26 26 32 18" stroke="#6B4F2A" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="3 6"/><path d="M26 14 Q32 8 40 14 Q42 20 34 22 Q26 22 26 14Z" fill="#B9955B"/>${eye(36, 15, 2)}<path d="M30 12 l4 4" stroke="#6B4F2A" stroke-width="1.6"/>`;
  ART.rabbit = () => quad({ c: '#CFC6BA', l: '#B8AEA0', b: '#F5F0E8', ear: 'long', tail: 'thin', s: 0.78, nose: '#F472B6' });
  ART.mouse = () => quad({ c: '#9C8C7A', l: '#7B6B5A', b: '#D9CDBD', ear: 'round', tail: 'thin', tl: '#D8A7A7', s: 0.62, nose: '#F472B6' });
  ART.gerbil = () => quad({ c: '#D9B27A', l: '#B98E55', b: '#F4E4C6', ear: 'round', tail: 'thin', tl: '#B98E55', s: 0.66, nose: '#F472B6' });
  ART.marmot = () => quad({ c: '#A88A62', l: '#7C6444', b: '#D8C3A0', ear: 'round', tail: 'bushy', s: 0.8 });
  ART.deer = () => quad({ c: '#C98A4E', l: '#A06A35', b: '#F4E6D0', ear: 'side', horn: 'antler', spots: '#FFF', tail: 'thin', s: 1 });
  ART.bharal = () => quad({ c: '#8E9CA6', l: '#6B7A85', b: '#E3E7EA', ear: 'side', horn: 'ram', tail: 'thin', s: 0.95 });
  ART.cow = () => quad({ c: '#F2EEE6', l: '#C9BFB0', b: '#FFFFFF', ear: 'side', horn: 'curve', spots: '#7A4A25', tail: 'thin', s: 1.02, nose: '#E8A0A0' });
  ART.langur = () => quad({ c: '#B7B2A5', l: '#4B4540', b: '#D9D5CB', h: '#2F2A26', ear: 'round', tail: 'thin', tl: '#8E897D', s: 0.95 });
  ART.camel = () => quad({ c: '#D9A85C', l: '#B8863C', b: '#EFD6A5', hump: 1, ear: 'round', tail: 'thin', snout: 1, s: 0.98 });
  ART.fox = () => quad({ c: '#E0752E', l: '#4B3A2B', b: '#FFFFFF', ear: 'point', tail: 'bushy', tl: '#E0752E', s: 0.9, snout: 1 });
  ART.tiger = () => quad({ c: '#F29A2E', l: '#D9801A', b: '#FFF2D6', stripes: 1, ear: 'round', tail: 'thin', tl: '#F29A2E', s: 1.02, snout: 1 });
  ART.snowleopard = () => quad({ c: '#CFD6DE', l: '#9CA7B3', b: '#F3F6F9', spots: '#475569', ear: 'round', tail: 'bushy', tl: '#B7C0CA', s: 0.98, snout: 1 });
  ART.hen = () => bird({ c: '#C2763A', w: '#A25B28', b: '#E4A266', comb: 1, bk: '#F5B90A', s: 0.9 });
  ART.seagull = () => bird({ c: '#FFFFFF', w: '#B7C3D0', tc: '#8896A5', bk: '#F5B90A', leg: '#E58A1A', s: 0.95 });
  ART.kingfisher = () => bird({ c: '#1D9BD1', w: '#0F6FA8', b: '#F59E0B', hc: '#1D9BD1', bk: '#1E293B', bl: 6, tc: '#0F6FA8', leg: '#E11D48', s: 0.8 });
  ART.eagle = () => bird({ c: '#7C4A25', w: '#5C3515', b: '#A06A3A', hc: '#F1E2C6', bk: '#F5B90A', hook: 1, tc: '#4A2B10', leg: '#F5B90A', s: 1.05 });
  ART.heron = () => `${ground()}<path d="M26 46 V58 M34 46 V58 M22 58 h8 M30 58 h8" stroke="#E5A23B" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M8 30 L2 26 L4 38 L2 44 L16 42Z" fill="#E9E5DA"/><ellipse cx="28" cy="36" rx="17" ry="11" fill="#F5F1E8"/><ellipse cx="24" cy="34" rx="11" ry="6" fill="#C9BFA8" transform="rotate(-10 24 34)"/><path d="M38 32 Q50 30 46 20 Q42 10 48 10" stroke="#F5F1E8" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="49" cy="9" r="5.5" fill="#F5F1E8"/><path d="M53 8 L63 10 L53 13Z" fill="#F5B90A"/>${eye(50, 8, 2)}<path d="M44 8 q-6 -2 -8 4" stroke="#8B5E34" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  ART.owl = () => `${ground()}<path d="M24 58 h8 M34 58 h8" stroke="#E5A23B" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="32" cy="38" rx="17" ry="19" fill="#C9A06A"/><ellipse cx="32" cy="42" rx="11" ry="13" fill="#F4E8D2"/><path d="M26 34 q3 6 6 0 q3 6 6 0 M24 44 q4 6 8 0 q4 6 8 0" stroke="#B88A55" stroke-width="1.6" fill="none"/><circle cx="32" cy="22" r="14" fill="#C9A06A"/><circle cx="25" cy="22" r="7" fill="#F4E8D2"/><circle cx="39" cy="22" r="7" fill="#F4E8D2"/><circle cx="25" cy="22" r="3.6" fill="#1E293B"/><circle cx="39" cy="22" r="3.6" fill="#1E293B"/><circle cx="26" cy="21" r="1.2" fill="#fff"/><circle cx="40" cy="21" r="1.2" fill="#fff"/><path d="M30 26 L32 31 L34 26Z" fill="#F5B90A"/><path d="M20 12 L24 18 M44 12 L40 18" stroke="#8B5E34" stroke-width="3" stroke-linecap="round"/>`;
  ART.peacock = () => `${ground()}<g transform="translate(18 34)">${[-70, -50, -30, -10, 10, 30, 50].map((a) => `<g transform="rotate(${a - 90})"><path d="M0 0 L22 0" stroke="#2F8F6A" stroke-width="1.4"/><ellipse cx="25" cy="0" rx="5" ry="3.2" fill="#0E9AA7"/><ellipse cx="25" cy="0" rx="2.6" ry="1.6" fill="#1D4ED8"/><circle cx="25.6" cy="0" r="0.9" fill="#FFD23F"/></g>`).join('')}</g><path d="M30 46 V58 M36 46 V58" stroke="#8B6B4A" stroke-width="2" stroke-linecap="round"/><ellipse cx="34" cy="40" rx="11" ry="9" fill="#1D5FD1"/><path d="M40 36 Q50 32 48 20" stroke="#1D5FD1" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="48" cy="17" r="5" fill="#1D5FD1"/><path d="M52 17 L58 19 L52 21Z" fill="#E8C75A"/>${eye(49, 16, 1.6)}<path d="M46 12 l-1 -5 M48 11 l1 -5 M50 12 l3 -4" stroke="#1D5FD1" stroke-width="1.4" stroke-linecap="round"/><circle cx="45" cy="6" r="1.4" fill="#0E9AA7"/><circle cx="49" cy="5" r="1.4" fill="#0E9AA7"/>`;
  ART.human = () => `${ground()}<circle cx="32" cy="14" r="8" fill="#C98E63"/><path d="M24 12 Q32 2 40 12Z" fill="#F3E7C9"/><path d="M22 52 L24 30 Q32 24 40 30 L42 52Z" fill="#2563EB"/><path d="M22 34 L14 46 M42 34 L50 46" stroke="#C98E63" stroke-width="5" stroke-linecap="round"/><path d="M27 52 V58 M37 52 V58" stroke="#C98E63" stroke-width="5" stroke-linecap="round"/><path d="M26 30 Q32 36 38 30" stroke="#F3E7C9" stroke-width="3" fill="none"/>`;

  // ---------------------------------------------------------------- icons for the cycle stages and for waste
  const NODE = {
    air: () => `<circle cx="32" cy="32" r="30" fill="#BFE3FA"/><path d="M14 42 Q10 42 10 36 Q10 30 17 30 Q18 22 27 22 Q35 22 37 29 Q46 28 46 36 Q46 42 40 42Z" fill="#fff"/><path d="M12 50 h30 M20 56 h34" stroke="#7FB8DF" stroke-width="2.4" stroke-linecap="round"/>`,
    cloud: () => `<circle cx="32" cy="32" r="30" fill="#A9D3F2"/><path d="M12 40 Q8 40 8 34 Q8 28 15 28 Q16 19 26 19 Q34 19 36 26 Q46 25 46 33 Q46 40 40 40Z" fill="#fff"/><path d="M20 46 l-2 6 M30 46 l-2 6 M40 46 l-2 6" stroke="#3B82F6" stroke-width="2.6" stroke-linecap="round"/>`,
    plant: () => `<circle cx="32" cy="32" r="30" fill="#CDEFC8"/><path d="M32 54 V30" stroke="#3F7D2C" stroke-width="3.4" stroke-linecap="round"/><path d="M32 40 Q18 40 16 26 Q30 26 32 40Z" fill="#3FA85A"/><path d="M32 34 Q46 34 48 20 Q34 20 32 34Z" fill="#56BE6E"/><path d="M22 54 h20" stroke="#8B5E34" stroke-width="3.4" stroke-linecap="round"/>`,
    animal: () => `<circle cx="32" cy="32" r="30" fill="#FDE6C8"/><g transform="translate(2 -2) scale(.9)">${ART.deer()}</g>`,
    decomp: () => `<circle cx="32" cy="32" r="30" fill="#E7D8BF"/><path d="M8 50 Q32 42 56 50 V54 H8Z" fill="#7A5A33"/><path d="M24 50 Q23 40 26 36 H34 Q37 40 36 50Z" fill="#F3E7CF"/><path d="M14 38 Q16 20 30 20 Q46 20 48 38 Q30 33 14 38Z" fill="#D9534F"/><circle cx="26" cy="28" r="2.6" fill="#fff"/><circle cx="37" cy="26" r="2.2" fill="#fff"/><circle cx="46" cy="50" r="2" fill="#A21CAF"/><circle cx="52" cy="46" r="1.6" fill="#A21CAF"/>`,
    fuel: () => `<circle cx="32" cy="32" r="30" fill="#D5D9E0"/><path d="M12 48 L22 34 L30 42 L38 28 L52 48Z" fill="#3B3F4A"/><path d="M20 48 L30 38 L38 46 L46 36 L54 48Z" fill="#23262E"/><path d="M26 30 l3 -8 l3 8 M36 24 l2 -6 l2 6" stroke="#F5B90A" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sea: () => `<circle cx="32" cy="32" r="30" fill="#9AD0F2"/><path d="M2 36 Q12 30 22 36 T42 36 T62 36 V62 H2Z" fill="#1D8FD1"/><path d="M2 46 Q12 40 22 46 T42 46 T62 46" stroke="#7CC4F0" stroke-width="2.6" fill="none"/><circle cx="46" cy="18" r="7" fill="#FFD23F"/>`,
    land: () => `<circle cx="32" cy="32" r="30" fill="#CFE8B8"/><path d="M2 46 L20 22 L30 36 L40 18 L62 46Z" fill="#8FA3B8"/><path d="M34 24 L40 18 L46 26Z" fill="#fff"/><path d="M2 46 H62 V62 H2Z" fill="#79B857"/><path d="M26 62 Q30 52 38 50 Q50 48 52 62" stroke="#4FA8E0" stroke-width="5" fill="none"/>`,
    ground: () => `<circle cx="32" cy="32" r="30" fill="#E3D2B6"/><path d="M4 22 H60" stroke="#79B857" stroke-width="6"/><path d="M4 28 H60 V40 H4Z" fill="#9A7448"/><path d="M4 40 H60 V52 H4Z" fill="#6E5333"/><path d="M14 44 q2 5 4 0 q-2 -5 -4 0 M34 34 q2 5 4 0 q-2 -5 -4 0 M46 46 q2 5 4 0 q-2 -5 -4 0" fill="#4FA8E0"/>`,
    fire: () => `<circle cx="32" cy="32" r="30" fill="#FFE2C2"/><path d="M32 8 Q44 22 44 36 Q44 52 32 54 Q20 52 20 38 Q20 28 28 22 Q28 30 32 32 Q36 24 32 8Z" fill="#FF7A1A"/><path d="M32 28 Q40 38 38 46 Q36 52 32 52 Q26 50 26 44 Q26 38 32 28Z" fill="#FFD23F"/>`,
  };

  // ---------------------------------------------------------------- waste drawings
  const WART = {
    banana: () => `<path d="M10 26 Q30 48 54 20 Q56 28 50 38 Q30 60 8 36Z" fill="#F7D23A"/><path d="M12 30 Q30 48 52 24" stroke="#C99A12" stroke-width="2" fill="none"/><path d="M50 20 l4 -6" stroke="#8B6B1A" stroke-width="4" stroke-linecap="round"/><circle cx="28" cy="44" r="2" fill="#7A5A12"/><circle cx="38" cy="40" r="1.6" fill="#7A5A12"/>`,
    veg: () => `<path d="M10 22 L34 18 L22 54Z" fill="#F08A24"/><path d="M14 28 l8 -1 M19 38 l6 -1" stroke="#C8651A" stroke-width="1.6"/><path d="M34 18 l6 -10 M34 18 l10 -4 M34 18 l2 -12" stroke="#3FA85A" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="42" r="9" fill="#7BC74D"/><path d="M40 38 Q46 42 52 38" stroke="#4F9A2C" stroke-width="2" fill="none"/>`,
    tea: () => `<path d="M12 30 H46 V40 Q46 52 29 52 Q12 52 12 40Z" fill="#F5F1E8" stroke="#C9BFA8" stroke-width="2"/><path d="M46 33 Q58 33 56 42 Q54 48 46 46" stroke="#C9BFA8" stroke-width="3" fill="none"/><path d="M18 36 Q28 30 40 36 Q40 44 28 46 Q18 44 18 36Z" fill="#7C5A2E"/><path d="M24 24 q-3 -4 0 -8 M32 24 q-3 -4 0 -8" stroke="#B8B8B8" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    leaves: () => `<path d="M8 40 Q14 12 40 12 Q38 40 8 40Z" fill="#C97A2C"/><path d="M8 40 L36 16" stroke="#8A4E15" stroke-width="2"/><path d="M26 50 Q32 28 54 30 Q52 52 26 50Z" fill="#D9A02E"/><path d="M26 50 L48 33" stroke="#9A6A12" stroke-width="2"/>`,
    flowers: () => `<g transform="translate(22 28)">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="0" cy="-9" r="6" fill="#FF8A1F" transform="rotate(${i * 45})"/>`).join('')}<circle r="6" fill="#E85D04"/></g><g transform="translate(44 40) scale(.7)">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="0" cy="-9" r="6" fill="#FFC21A" transform="rotate(${i * 45})"/>`).join('')}<circle r="6" fill="#F59E0B"/></g>`,
    rice: () => `<path d="M8 32 H56 Q54 54 32 54 Q10 54 8 32Z" fill="#E5E7EB"/><path d="M8 32 H56" stroke="#9CA3AF" stroke-width="3"/><path d="M12 32 Q16 16 32 14 Q48 16 52 32Z" fill="#FFFDF5"/>${[[22, 24], [30, 20], [38, 24], [28, 28], [44, 28], [18, 29]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.5" fill="#EDE8D2"/>`).join('')}`,
    newspaper: () => `<rect x="10" y="10" width="40" height="46" rx="3" fill="#F5F5F0" stroke="#B8B8B0" stroke-width="2"/><rect x="16" y="16" width="28" height="6" fill="#3B3F4A"/><path d="M16 28 h12 M16 34 h12 M16 40 h12 M32 28 h12 M32 34 h12 M32 40 h12 M16 46 h28" stroke="#8A8A84" stroke-width="2"/><rect x="42" y="14" width="14" height="42" rx="3" fill="#EDEDE6" stroke="#B8B8B0" stroke-width="2" opacity=".0"/>`,
    cardboard: () => `<path d="M8 22 L32 12 L56 22 V46 L32 56 L8 46Z" fill="#C8924F"/><path d="M8 22 L32 32 L56 22 M32 32 V56" stroke="#9A6A30" stroke-width="2.4" fill="none"/><path d="M32 32 L56 22 L56 46 L32 56Z" fill="#B07C3C"/><path d="M20 38 l8 4" stroke="#EFD9B0" stroke-width="3"/>`,
    bottle: () => `<rect x="24" y="6" width="16" height="7" rx="2" fill="#2563EB"/><path d="M26 13 H38 V20 Q46 26 46 34 V52 Q46 58 40 58 H24 Q18 58 18 52 V34 Q18 26 26 20Z" fill="#BFE3FA" opacity=".9" stroke="#7FB8DF" stroke-width="2"/><path d="M18 36 H46 M18 46 H46" stroke="#7FB8DF" stroke-width="1.6"/><rect x="18" y="38" width="28" height="6" fill="#2563EB" opacity=".75"/>`,
    bag: () => `<path d="M14 18 H50 L54 56 H10Z" fill="#E7F4FF" stroke="#8FC3E8" stroke-width="2"/><path d="M22 18 Q22 4 28 4 M42 18 Q42 4 36 4" stroke="#8FC3E8" stroke-width="3" fill="none"/><path d="M20 30 Q32 24 44 32 M18 42 Q32 38 46 46" stroke="#C9E4F7" stroke-width="2" fill="none"/><path d="M26 26 l6 -4" stroke="#fff" stroke-width="3" opacity=".8"/>`,
    glass: () => `<rect x="26" y="4" width="12" height="7" rx="2" fill="#3F7D2C"/><path d="M27 11 H37 V22 Q46 28 46 38 V52 Q46 58 40 58 H24 Q18 58 18 52 V38 Q18 28 27 22Z" fill="#4FA85A" opacity=".85" stroke="#2F7E3A" stroke-width="2"/><path d="M24 30 Q22 40 24 52" stroke="#fff" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/>`,
    can: () => `<ellipse cx="32" cy="14" rx="18" ry="6" fill="#B8BEC8"/><path d="M14 14 V50 Q14 58 32 58 Q50 58 50 50 V14 Q50 20 32 20 Q14 20 14 14Z" fill="#D9DEE6" stroke="#9CA3AF" stroke-width="2"/><rect x="14" y="26" width="36" height="18" fill="#E85D4A"/><path d="M14 26 H50 M14 44 H50" stroke="#B3321C" stroke-width="1.6"/><ellipse cx="32" cy="14" rx="14" ry="3.6" fill="#F3F4F6"/>`,
    foil: () => `<path d="M10 20 L30 8 L56 18 L50 48 L22 58 L8 42Z" fill="#D9DEE6" stroke="#9CA3AF" stroke-width="2"/><path d="M30 8 L26 30 L50 48 M26 30 L8 42 M26 30 L10 20" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/><path d="M26 30 L56 18" stroke="#9CA3AF" stroke-width="1.6" fill="none"/>`,
    cloth: () => `<path d="M10 14 H54 V54 H10Z" fill="#E56B8C"/><path d="M10 24 H54 M10 34 H54 M10 44 H54 M22 14 V54 M34 14 V54 M46 14 V54" stroke="#C9446A" stroke-width="2"/><path d="M10 14 L4 22 M54 54 L60 46" stroke="#E56B8C" stroke-width="3" stroke-linecap="round"/>`,
  };

  const iconSvg = (id, px, cls) => `<svg class="eco-ic ${cls || ''}" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true" focusable="false">${(WART[id] || ART[id] || (() => ''))()}</svg>`;

  // ---------------------------------------------------------------- scenes (backdrops, 360 x 200)
  const SCENE = {
    pond: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD3F4"/><stop offset="1" stop-color="#E8F7EC"/></linearGradient><linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58C1E8"/><stop offset="1" stop-color="#1B7DB0"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="302" cy="34" r="17" fill="#FFE27A"/><path d="M0 100 Q50 78 110 96 T230 90 T360 98 V112 H0Z" fill="#7BC77C"/><path d="M0 108 Q80 92 170 106 T360 104 V116 H0Z" fill="#5FB466"/><rect y="108" width="360" height="92" fill="url(#${u}b)"/><g stroke="#2F7E3A" stroke-width="3" stroke-linecap="round">${[14, 24, 34, 330, 340, 350].map((x, i) => `<path d="M${x} 112 V${82 - (i % 3) * 8}"/>`).join('')}</g><g fill="#8B5E34">${[14, 34, 340].map((x, i) => `<rect x="${x - 3}" y="${70 - (i % 3) * 8}" width="6" height="14" rx="3"/>`).join('')}</g><g fill="#3FB56B" opacity=".95"><ellipse cx="70" cy="150" rx="22" ry="6"/><ellipse cx="250" cy="170" rx="26" ry="7"/><ellipse cx="170" cy="130" rx="16" ry="4.5"/></g><g stroke="#fff" stroke-width="1.5" fill="none" opacity=".5"><ellipse cx="120" cy="170" rx="22" ry="4"/><ellipse cx="300" cy="140" rx="18" ry="3.5"/><ellipse cx="40" cy="185" rx="26" ry="4"/></g><circle cx="250" cy="166" r="3.4" fill="#F9A8D4"/><circle cx="70" cy="147" r="3" fill="#F9A8D4"/>`,
    forest: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE6C8"/><stop offset="1" stop-color="#E6F4CF"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="296" cy="30" r="15" fill="#FFF3A8" opacity=".9"/><path d="M0 120 Q60 90 130 110 T260 104 T360 112 V200 H0Z" fill="#6DAE5A"/>${[30, 110, 200, 290, 340].map((x, i) => `<rect x="${x - 4}" y="${70 + (i % 2) * 8}" width="9" height="60" rx="3" fill="#7A5230"/><circle cx="${x}" cy="${62 + (i % 2) * 8}" r="${24 - (i % 2) * 3}" fill="${i % 2 ? '#2F8F46' : '#237B3B'}"/><circle cx="${x - 14}" cy="${76 + (i % 2) * 8}" r="15" fill="#3FA85A"/><circle cx="${x + 14}" cy="${78 + (i % 2) * 8}" r="14" fill="#2F8F46"/>`).join('')}<path d="M0 150 Q90 130 180 148 T360 144 V200 H0Z" fill="#4C9444"/><path d="M0 176 Q100 160 200 174 T360 170 V200 H0Z" fill="#3B7D38"/><g fill="#2D6B2F">${[40, 130, 220, 310].map((x) => `<path d="M${x} 190 q-4 -16 -12 -20 q10 2 14 14 q2 -12 10 -16 q-4 12 -4 22Z"/>`).join('')}</g>`,
    grassland: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CD4F7"/><stop offset="1" stop-color="#F3F9DA"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="64" cy="36" r="17" fill="#FFE27A"/><g fill="#fff" opacity=".85"><ellipse cx="200" cy="40" rx="30" ry="9"/><ellipse cx="222" cy="34" rx="20" ry="8"/><ellipse cx="300" cy="62" rx="26" ry="7"/></g><path d="M0 110 Q90 80 190 104 T360 96 V200 H0Z" fill="#A8D86A"/><path d="M0 138 Q110 112 220 134 T360 128 V200 H0Z" fill="#86C456"/><path d="M0 170 Q120 150 240 168 T360 162 V200 H0Z" fill="#62AE45"/><rect x="288" y="82" width="5" height="34" fill="#7A5230"/><circle cx="290" cy="76" r="17" fill="#3FA85A"/><circle cx="280" cy="86" r="11" fill="#2F8F46"/><g stroke="#3E8E2E" stroke-width="2" stroke-linecap="round" fill="none">${[20, 60, 110, 150, 240, 320, 345].map((x, i) => `<path d="M${x} ${186 - (i % 3) * 9} q-3 -10 -6 -14 M${x} ${186 - (i % 3) * 9} q2 -10 6 -13"/>`).join('')}</g>`,
    desert: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD59A"/><stop offset="1" stop-color="#FFF1CF"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="276" cy="52" r="26" fill="#FF9F1C" opacity=".95"/><circle cx="276" cy="52" r="34" fill="#FFB84A" opacity=".35"/><path d="M0 120 Q70 84 150 112 T300 100 T360 110 V200 H0Z" fill="#EFC074"/><path d="M0 150 Q100 118 200 146 T360 136 V200 H0Z" fill="#E6AC55"/><path d="M0 180 Q120 160 240 178 T360 170 V200 H0Z" fill="#D9973F"/><path d="M40 130 Q80 120 120 132" stroke="#F8DCA0" stroke-width="2" fill="none" opacity=".7"/><g stroke="#8B7A2E" stroke-width="3" stroke-linecap="round" fill="#8FA33F"><path d="M308 148 V118" /><circle cx="308" cy="112" r="9"/><circle cx="298" cy="122" r="6"/><circle cx="319" cy="124" r="6"/></g><g fill="#6B4F2A"><circle cx="60" cy="170" r="3"/><circle cx="170" cy="186" r="2.4"/></g>`,
    mountain: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9DC3F2"/><stop offset="1" stop-color="#EAF3FF"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><path d="M-10 130 L70 36 L120 96 L170 20 L250 120 L300 64 L370 130Z" fill="#8C9DB8"/><path d="M70 36 L88 58 L74 54 L62 62 L52 54Z M170 20 L190 48 L174 44 L160 52 L150 40Z M300 64 L316 84 L302 80 L290 86Z" fill="#fff"/><path d="M0 140 Q80 112 170 134 T360 124 V200 H0Z" fill="#B9C9DC"/><path d="M0 166 Q100 146 200 164 T360 156 V200 H0Z" fill="#F2F7FD"/>${[22, 54, 306, 338].map((x, i) => `<path d="M${x} ${150 + (i % 2) * 6} l-9 22 h18Z M${x} ${138 + (i % 2) * 6} l-8 20 h16Z" fill="#2F7A55"/>`).join('')}<g fill="#DCE6F2"><ellipse cx="130" cy="186" rx="26" ry="5"/><ellipse cx="248" cy="182" rx="22" ry="4"/></g>`,
    sea: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9E0F8"/><stop offset="1" stop-color="#E2F6FF"/></linearGradient><linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#32A5DF"/><stop offset="1" stop-color="#0A4E94"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="70" cy="36" r="17" fill="#FFE27A"/><g fill="#fff" opacity=".85"><ellipse cx="220" cy="38" rx="30" ry="8"/><ellipse cx="248" cy="32" rx="18" ry="7"/></g><rect y="86" width="360" height="114" fill="url(#${u}b)"/><g stroke="#fff" stroke-width="2" fill="none" opacity=".55"><path d="M0 100 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0"/><path d="M0 126 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" opacity=".6"/></g><path d="M250 200 Q290 158 360 150 V200Z" fill="#E9CE94"/><path d="M0 200 Q40 176 120 190 V200Z" fill="#E9CE94" opacity=".5"/><g fill="#fff" opacity=".18"><path d="M40 140 l30 -30 h14 l-30 30Z"/><path d="M180 150 l40 -40 h12 l-40 40Z"/></g>`,
    farm: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD6F7"/><stop offset="1" stop-color="#FFF3CF"/></linearGradient></defs><rect width="360" height="200" fill="url(#${u}a)"/><circle cx="300" cy="34" r="17" fill="#FFE27A"/><path d="M0 100 Q100 80 200 98 T360 92 V200 H0Z" fill="#B8DA7A"/><rect x="40" y="70" width="52" height="36" fill="#D9534F"/><path d="M34 72 L66 48 L98 72Z" fill="#8B3A2F"/><rect x="58" y="86" width="16" height="20" fill="#F3E7CF"/><path d="M0 124 H360 V200 H0Z" fill="#A9743F"/>${[0, 1, 2, 3].map((i) => `<path d="M0 ${134 + i * 18} H360" stroke="#8A5A2E" stroke-width="2"/><path d="M0 ${130 + i * 18} q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#5FAE4A" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>`).join('')}`,
  };
  const sceneSvg = (hab, u, asset) => `<svg class="eco-bg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${(SCENE[hab] || SCENE.grassland)(u)}${asset ? `<image href="${esc(asset)}" width="360" height="200" preserveAspectRatio="xMidYMid slice" opacity=".92"/>` : ''}</svg>`;
  const sunSvg = (px) => `<svg viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true" focusable="false"><g stroke="#F5B90A" stroke-width="4" stroke-linecap="round">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M32 4 V12" transform="rotate(${i * 45} 32 32)"/>`).join('')}</g><circle cx="32" cy="32" r="14" fill="#FFD23F"/><circle cx="27" cy="28" r="4" fill="#FFF3A8" opacity=".8"/></svg>`;

  // ---------------------------------------------------------------- the plan: a config with its defaults filled in
  const MODES = ['chain', 'web', 'pyramid', 'cycle', 'habitat', 'adaptation', 'waste', 'population'];
  function plan(c) {
    const e = [];
    const out = { base: null, sub: null, ids: [], hab: 'grassland', custom: false };
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { e: ['config must be an object'], p: out };
    Object.keys(c).forEach((k) => { if (!['mode', 'organisms', 'habitat'].includes(k)) e.push('unknown key: ' + k); });
    if (typeof c.mode !== 'string') { e.push("mode: one of 'chain', 'web', 'pyramid', 'cycle:<carbon|nitrogen|water|oxygen>', 'habitat', 'adaptation', 'waste', 'population'"); return { e, p: out }; }
    const [base, sub] = c.mode.split(':');
    if (!MODES.includes(base)) { e.push('unknown mode: ' + c.mode); return { e, p: out }; }
    out.base = base; out.sub = sub || null;
    if (base === 'cycle') { if (!sub || !CYC[sub]) e.push("cycle mode needs 'cycle:carbon', 'cycle:nitrogen', 'cycle:water' or 'cycle:oxygen'"); }
    else if (sub) e.push(`mode '${base}' takes no ':${sub}'`);
    let habOk = true;
    if (c.habitat != null && !HABS.includes(c.habitat)) { e.push('unknown habitat: ' + c.habitat + ' (use ' + HABS.join(', ') + ')'); habOk = false; }
    const given = c.organisms != null;
    let ids = [];
    if (given) {
      if (!Array.isArray(c.organisms) || !c.organisms.length) e.push('organisms: a non-empty array of ids');
      else if (c.organisms.some((x) => typeof x !== 'string')) e.push('organisms: ids are strings');
      else {
        ids = c.organisms.slice();
        if (new Set(ids).size !== ids.length) e.push('organisms: each id once');
        const table = base === 'waste' ? WASTE : ORG;
        ids.forEach((id) => { if (!table[id]) e.push(`unknown ${base === 'waste' ? 'waste item' : 'organism'}: ${id}`); });
      }
    }
    if (e.length) return { e, p: out };
    out.custom = given;
    const inferHab = () => (c.habitat && habOk ? c.habitat : null);
    const fixHab = (list, word) => {
      const hs = commonHabs(list);
      if (!hs.length) { e.push(`${word}: these organisms do not live in one habitat`); return null; }
      if (c.habitat && !hs.includes(c.habitat)) { e.push(`${word}: not all of them live in the ${c.habitat}`); return null; }
      return c.habitat || hs[0];
    };
    const noDecomp = (list, word) => { if (list.some((id) => ORG[id].role === 'D')) e.push(`${word}: decomposers are not part of a food chain; use a habitat or a cycle for them`); };
    if (base === 'chain' || base === 'pyramid' || base === 'population') {
      const hab = inferHab() || 'grassland';
      if (!given) { out.ids = (base === 'population' ? DEF.pop : DEF.chain)[hab].slice(); out.hab = hab; }
      else {
        const lo = base === 'population' ? 3 : 3, hi = base === 'population' ? 3 : base === 'pyramid' ? 5 : 6;
        if (ids.length < lo || ids.length > hi) e.push(`organisms: ${lo === hi ? 'exactly ' + lo : lo + ' to ' + hi} ids for the ${base} mode`);
        noDecomp(ids, base);
        if (!e.length) {
          if (!chainOrder(ids)) e.push(`${base}: these organisms cannot be put in a food chain (start with a producer; each must eat the one before it)`);
          else out.hab = fixHab(ids, base) || out.hab;
          out.ids = ids;
        }
      }
    } else if (base === 'web') {
      const hab = inferHab() || 'pond';
      if (!given) { out.ids = DEF.web[hab].slice(); out.hab = hab; }
      else {
        if (ids.length < 4 || ids.length > 10) e.push('organisms: 4 to 10 ids for the web mode');
        noDecomp(ids, 'web');
        if (!e.length) {
          if (!ids.some((id) => ORG[id].role === 'P')) e.push('web: needs at least one producer');
          const links = webLinks(ids);
          ids.forEach((id) => { if (!links.some(([a, b]) => a === id || b === id)) e.push(`web: ${id} has no feeding link with the others`); });
          if (!e.length) out.hab = fixHab(ids, 'web') || out.hab;
          out.ids = ids;
        }
      }
    } else if (base === 'habitat') {
      if (given && !c.habitat) e.push('habitat: say which habitat the organisms are to be put in');
      const hab = inferHab() || 'pond';
      out.hab = hab;
      if (!given) out.ids = DEF.habitat[hab].slice();
      else {
        if (ids.length < 3 || ids.length > 10) e.push('organisms: 3 to 10 ids for the habitat mode');
        const mem = ids.filter((id) => ORG[id].hab.includes(hab)).length;
        if (mem < 1) e.push(`habitat: at least one organism must live in the ${hab}`);
        if (mem === ids.length) e.push(`habitat: include at least one organism that does not live in the ${hab}, to sort`);
        out.ids = ids;
      }
    } else if (base === 'adaptation') {
      let hab = inferHab();
      if (!given) { hab = hab || 'pond'; out.ids = ADAPT_DEFAULT[hab].slice(); }
      else {
        if (ids.length < 2 || ids.length > 8) e.push('organisms: 2 to 8 ids for the adaptation mode');
        ids.forEach((id) => { if (!ADAPT[id]) e.push(`adaptation: no adaptation question for ${id} (use ${Object.keys(ADAPT).join(', ')})`); });
        out.ids = ids; hab = hab || (ADAPT[ids[0]] && ADAPT[ids[0]].hab) || 'pond';
      }
      out.hab = hab;
    } else if (base === 'waste') {
      out.hab = inferHab() || 'farm';
      if (!given) out.ids = WASTE_DEFAULT.slice();
      else {
        if (ids.length < 4 || ids.length > 12) e.push('organisms: 4 to 12 waste ids for the waste mode');
        if (!ids.some((id) => WASTE[id] && WASTE[id].bin === 'green')) e.push('waste: include at least one wet-waste item (green bin)');
        if (!ids.some((id) => WASTE[id] && WASTE[id].bin === 'blue')) e.push('waste: include at least one dry-waste item (blue bin)');
        out.ids = ids;
      }
    } else if (base === 'cycle') {
      out.hab = inferHab() || ({ carbon: 'forest', nitrogen: 'farm', water: 'sea', oxygen: 'forest' }[sub] || 'forest');
      out.ids = ids;
    }
    return { e, p: out };
  }

  // ---------------------------------------------------------------- questions (each built from the data, never typed per lab)
  function buildQuiz(P) {
    const out = [];
    let sd = 0;
    const Q = (q, right, wrongs, why) => { const pos = (sd++ * 2 + 1) % (wrongs.length + 1); const o = wrongs.slice(); o.splice(pos, 0, right); out.push({ q, o, a: pos, w: why }); };
    const nm = (id) => ORG[id].n;
    const fill = (list, k) => {
      const base = [T2('None of these', 'इनमें से कोई नहीं'), T2('All of these', 'ये सभी')];
      return list.slice(0, k).concat(base).slice(0, k);
    };
    const num = (v) => Number(v.toPrecision(10));
    const J = (v) => T2(num(v) + ' J', num(v) + ' J');
    const b = P.base;
    if (b === 'chain' || b === 'pyramid') {
      const ord = chainOrder(P.ids) || P.ids;
      const n = ord.length;
      if (b === 'chain') {
        Q(T2('In this food chain, which one is the producer?', 'इस आहार शृंखला में उत्पादक कौन है?'), nm(ord[0]), [nm(ord[1]), nm(ord[n - 1])], T2('A producer makes its own food from sunlight. All other living things depend on it.', 'उत्पादक सूर्य के प्रकाश से अपना भोजन स्वयं बनाता है। बाकी सभी जीव उसी पर निर्भर हैं।'));
        Q(T2('Which way do the arrows of a food chain point?', 'आहार शृंखला के तीर किस ओर होते हैं?'), T2('From the food to the one that eats it', 'भोजन से उसे खाने वाले की ओर'), [T2('From the eater to its food', 'खाने वाले से उसके भोजन की ओर'), T2('Always from left to right on the page', 'हमेशा पन्ने पर बाएँ से दाएँ')], T2('Arrows show the way energy travels, so they point from the food to the eater.', 'तीर ऊर्जा के जाने की दिशा दिखाते हैं, इसलिए वे भोजन से खाने वाले की ओर होते हैं।'));
        const v = 1000 / Math.pow(10, n - 1);
        Q(T2(`The ${tx(nm(ord[0]), 'en').toLowerCase()} holds 1000 J of energy. About how much reaches the ${tx(nm(ord[n - 1]), 'en').toLowerCase()} at the end of the chain?`, `${tx(nm(ord[0]), 'hi')} में 1000 J ऊर्जा है। शृंखला के अंत में ${tx(nm(ord[n - 1]), 'hi')} तक लगभग कितनी पहुँचती है?`), J(v), [J(v * 10), J(v / 10)], T2(`Only about 10 per cent passes to the next level, ${n - 1} times: 1000 J becomes ${num(v)} J.`, `हर स्तर पर लगभग 10 प्रतिशत आगे जाता है, ${n - 1} बार: 1000 J घटकर ${num(v)} J रह जाता है।`));
      } else {
        Q(T2('Which level of the pyramid holds the most energy?', 'पिरामिड के किस स्तर में सबसे अधिक ऊर्जा है?'), T2('The bottom level (producers)', 'सबसे निचला स्तर (उत्पादक)'), [T2('The top level', 'सबसे ऊपर का स्तर'), T2('The middle level', 'बीच का स्तर')], T2('Producers capture the Sun’s energy first. Every step up receives only a part of it.', 'उत्पादक सबसे पहले सूर्य की ऊर्जा लेते हैं। हर ऊपर का स्तर उसका केवल एक भाग पाता है।'));
        const lv = n, v = energyAt(lv);
        Q(T2(`The producers hold 10 000 J. About how much energy reaches level ${lv}?`, `उत्पादकों में 10 000 J है। स्तर ${lv} तक लगभग कितनी ऊर्जा पहुँचती है?`), J(v), [J(v * 10), J(v / 10)], T2(`Each step keeps about 10 per cent: after ${lv - 1} steps, 10 000 J becomes ${num(v)} J.`, `हर चरण में लगभग 10 प्रतिशत बचता है: ${lv - 1} चरणों के बाद 10 000 J घटकर ${num(v)} J रह जाता है।`));
        Q(T2('Why are there so few animals at the top of a pyramid?', 'पिरामिड के सबसे ऊपर इतने कम जंतु क्यों होते हैं?'), T2('Little energy is left to reach the top', 'ऊपर तक बहुत कम ऊर्जा पहुँचती है'), [T2('Top animals are all very lazy', 'ऊपर के जंतु बहुत आलसी होते हैं'), T2('They eat the Sun directly', 'वे सीधे सूर्य को खाते हैं')], T2('Most of the energy at each level is used for living (moving, growing, keeping warm) or lost as heat. So the top can support only a few animals.', 'हर स्तर की अधिकतर ऊर्जा जीने (चलने, बढ़ने, गर्म रहने) में लग जाती है या ऊष्मा बनकर खो जाती है। इसलिए ऊपर थोड़े ही जंतु पल सकते हैं।'));
      }
    } else if (b === 'web') {
      const ids = P.ids, links = webLinks(ids);
      const eaters = (x) => links.filter(([p]) => p === x).map(([, e]) => e);
      let X = ids.slice().sort((a, c2) => eaters(c2).length - eaters(a).length)[0];
      const ex = eaters(X), non = ids.filter((id) => id !== X && !ex.includes(id));
      Q(T2(`Which of these eats ${tx(nm(X), 'en').toLowerCase()}?`, `इनमें से कौन ${tx(nm(X), 'hi')} को खाता है?`), nm(ex[0]), fill(non.map(nm), 2), T2(`In this web, ${ex.map((i) => tx(nm(i), 'en')).join(' and ')} eat${ex.length === 1 ? 's' : ''} ${tx(nm(X), 'en').toLowerCase()}. If it disappeared, they would lose a food.`, `इस जाल में ${ex.map((i) => tx(nm(i), 'hi')).join(' और ')} ${tx(nm(X), 'hi')} को खाते हैं। यदि यह खत्म हो जाए तो उनका एक भोजन चला जाएगा।`));
      const cnt = (x) => eatsIn(x, ids).length;
      const sorted = ids.slice().sort((a, c2) => cnt(c2) - cnt(a));
      if (cnt(sorted[0]) > cnt(sorted[1])) Q(T2('Which one has the most different foods to choose from?', 'किसके पास भोजन के सबसे अधिक विकल्प हैं?'), nm(sorted[0]), [nm(sorted[sorted.length - 1]), nm(sorted[Math.floor(sorted.length / 2)])].filter((x, i, arr) => arr.indexOf(x) === i && x !== nm(sorted[0])), T2(`It eats ${cnt(sorted[0])} kinds in this web. An animal with many foods survives better when one of them becomes scarce.`, `यह इस जाल में ${cnt(sorted[0])} तरह की चीज़ें खाता है। जिसके पास कई भोजन हों, वह एक के कम होने पर भी बेहतर बचा रहता है।`));
      Q(T2('Why is a food web safer for animals than a single food chain?', 'अकेली आहार शृंखला की तुलना में आहार जाल जंतुओं के लिए सुरक्षित क्यों है?'), T2('If one food runs short, an animal can eat something else', 'एक भोजन कम पड़े तो जंतु कुछ और खा सकता है'), [T2('Because animals in a web never get hungry', 'क्योंकि जाल में जंतु कभी भूखे नहीं होते'), T2('Because plants eat animals in a web', 'क्योंकि जाल में पौधे जंतुओं को खाते हैं')], T2('Many chains cross to form a web. This gives animals more than one food, so one loss does not end everything.', 'कई शृंखलाएँ मिलकर जाल बनाती हैं। इससे जंतुओं के पास एक से अधिक भोजन होते हैं, इसलिए एक की कमी से सब कुछ खत्म नहीं होता।'));
    } else if (b === 'cycle') {
      const R = QCYC[P.sub];
      R.forEach((r) => Q(r.q, r.r, r.w, r.y));
    } else if (b === 'habitat') {
      const h = P.hab, mem = P.ids.filter((id) => ORG[id].hab.includes(h)), out2 = P.ids.filter((id) => !ORG[id].hab.includes(h));
      Q(T2(`Which of these does NOT live in the ${tx(HAB[h].n, 'en')}?`, `इनमें से कौन ${tx(HAB[h].n, 'hi')} में नहीं रहता?`), nm(out2[0]), fill(mem.map(nm), 2), T2(`${tx(nm(out2[0]), 'en')} lives in a different habitat. Its body and food suit that place, not the ${tx(HAB[h].n, 'en')}.`, `${tx(nm(out2[0]), 'hi')} किसी दूसरे आवास में रहता है। उसका शरीर और भोजन उसी जगह के अनुकूल है, ${tx(HAB[h].n, 'hi')} के नहीं।`));
      Q(T2(`Which of these lives in the ${tx(HAB[h].n, 'en')}?`, `इनमें से कौन ${tx(HAB[h].n, 'hi')} में रहता है?`), nm(mem[0]), fill(out2.map(nm), 2), ORG[mem[0]].fact);
      const other = HABS.filter((x) => x !== h);
      Q(T2('Which sentence describes this habitat?', 'कौन-सा वाक्य इस आवास का वर्णन करता है?'), HAB[h].d, [HAB[other[(h.length) % other.length]].d, HAB[other[(h.length + 2) % other.length]].d], T2(`A habitat is the place where a living thing finds its food, water and shelter. ${HAB[h].d.en}`, `आवास वह स्थान है जहाँ जीव को भोजन, पानी और आश्रय मिलता है। ${HAB[h].d.hi}`));
    } else if (b === 'waste') {
      const ids = P.ids, wet = ids.filter((id) => WASTE[id].bin === 'green'), dry = ids.filter((id) => WASTE[id].bin === 'blue');
      Q(T2(`Which bin does ${tx(WASTE[wet[0]].n, 'en').toLowerCase()} go in?`, `${tx(WASTE[wet[0]].n, 'hi')} किस डिब्बे में जाता/जाती है?`), BIN.green.s, [BIN.blue.s, T2('Neither; throw it on the road', 'किसी में नहीं; सड़क पर फेंक दें')], WASTE[wet[0]].why);
      Q(T2('What useful thing can we make from wet waste?', 'गीले कचरे से हम कौन-सी उपयोगी चीज़ बना सकते हैं?'), T2('Compost (manure) for plants', 'पौधों के लिए खाद'), [T2('New plastic bottles', 'नई प्लास्टिक की बोतलें'), T2('Glass', 'काँच')], T2('Bacteria and fungi rot wet waste into compost, which feeds the soil.', 'जीवाणु और कवक गीले कचरे को सड़ाकर खाद बनाते हैं, जो मिट्टी को पोषण देती है।'));
      const slow = dry.slice().sort((a, c2) => WASTE[c2].rot - WASTE[a].rot)[0], fast = wet.slice().sort((a, c2) => WASTE[a].rot - WASTE[c2].rot)[0];
      Q(T2(`Which takes longer to rot: ${tx(WASTE[slow].n, 'en').toLowerCase()} or ${tx(WASTE[fast].n, 'en').toLowerCase()}?`, `किसे सड़ने में अधिक समय लगता है: ${tx(WASTE[slow].n, 'hi')} या ${tx(WASTE[fast].n, 'hi')}?`), WASTE[slow].n, [WASTE[fast].n, T2('Both take the same time', 'दोनों में बराबर समय लगता है')], T2(`${tx(WASTE[slow].n, 'en')} takes ${tx(ROT[WASTE[slow].rot], 'en')}; ${tx(WASTE[fast].n, 'en').toLowerCase()} takes ${tx(ROT[WASTE[fast].rot], 'en')}.`, `${tx(WASTE[slow].n, 'hi')} को ${tx(ROT[WASTE[slow].rot], 'hi')} लगते हैं; ${tx(WASTE[fast].n, 'hi')} को ${tx(ROT[WASTE[fast].rot], 'hi')}।`));
    } else if (b === 'population') {
      const [pl, hb, cr] = P.ids;
      Q(T2(`Many more ${tx(nm(cr), 'en').toLowerCase()}s are added. What happens to the ${tx(nm(hb), 'en').toLowerCase()}s soon after?`, `${tx(nm(cr), 'hi')} की संख्या बहुत बढ़ा दी जाती है। इसके बाद ${tx(nm(hb), 'hi')} का क्या होता है?`), T2('Their number falls, because more are eaten', 'उनकी संख्या घटती है, क्योंकि अधिक खाए जाते हैं'), [T2('Their number rises', 'उनकी संख्या बढ़ती है'), T2('Nothing changes', 'कुछ नहीं बदलता')], T2('More hunters take more prey. The prey number goes down. Then the hunters have less food and they go down too.', 'अधिक शिकारी अधिक शिकार खाते हैं। शिकार की संख्या घटती है। फिर शिकारियों को कम भोजन मिलता है और वे भी घटते हैं।'));
      Q(T2(`If all the ${tx(nm(cr), 'en').toLowerCase()}s were removed, what would happen to the ${tx(nm(hb), 'en').toLowerCase()}s at first?`, `यदि सभी ${tx(nm(cr), 'hi')} हटा दिए जाएँ तो ${tx(nm(hb), 'hi')} का पहले क्या होगा?`), T2('They would increase', 'वे बढ़ेंगे'), [T2('They would decrease', 'वे घटेंगे'), T2('They would turn into hunters', 'वे शिकारी बन जाएँगे')], T2(`With no hunters, fewer ${tx(nm(hb), 'en').toLowerCase()}s are eaten. But then they eat too much ${tx(nm(pl), 'en').toLowerCase()} and food runs short.`, `शिकारी न हों तो कम ${tx(nm(hb), 'hi')} खाए जाते हैं। पर तब वे बहुत अधिक ${tx(nm(pl), 'hi')} खा जाते हैं और भोजन कम पड़ जाता है।`));
      Q(T2('Over many years, what do the three lines on the graph do?', 'कई वर्षों में ग्राफ़ की तीनों रेखाएँ क्या करती हैं?'), T2('They swing up and down and slowly settle near a balance', 'वे ऊपर-नीचे होती हैं और धीरे-धीरे संतुलन के पास टिक जाती हैं'), [T2('They all keep rising for ever', 'सभी हमेशा बढ़ती रहती हैं'), T2('They all fall to zero', 'सभी शून्य तक गिर जाती हैं')], T2('Food limits the number of plant-eaters, and plant-eaters limit the number of hunters. Together they keep each other in balance.', 'भोजन शाकाहारियों की संख्या सीमित करता है और शाकाहारी शिकारियों की। मिलकर ये एक-दूसरे को संतुलन में रखते हैं।'));
    }
    return out;
  }
  const QCYC = {
    carbon: [
      { q: T2('Which process takes carbon dioxide out of the air?', 'कौन-सी क्रिया हवा से कार्बन डाइऑक्साइड लेती है?'), r: T2('Photosynthesis', 'प्रकाश-संश्लेषण'), w: [T2('Burning', 'जलना'), T2('Decay', 'सड़ना-गलना')], y: T2('Green plants use CO₂, water and sunlight to make food. So they take carbon out of the air.', 'हरे पौधे CO₂, जल और सूर्य के प्रकाश से भोजन बनाते हैं। इस तरह वे हवा से कार्बन लेते हैं।') },
      { q: T2('Which of these puts carbon dioxide back into the air?', 'इनमें से कौन हवा में कार्बन डाइऑक्साइड लौटाता है?'), r: T2('Burning petrol and wood', 'पेट्रोल और लकड़ी जलाना'), w: [T2('Plants making food', 'पौधों का भोजन बनाना'), T2('Rain falling', 'वर्षा होना')], y: T2('Burning carbon fuels, respiration and decay all release CO₂.', 'कार्बन ईंधनों का जलना, श्वसन और सड़न, तीनों CO₂ छोड़ते हैं।') },
      { q: T2('How are coal and oil formed?', 'कोयला और तेल कैसे बनते हैं?'), r: T2('From dead plants and animals buried for millions of years', 'लाखों वर्षों तक दबे मृत पौधों और जंतुओं से'), w: [T2('From rain water in a few days', 'कुछ दिनों में वर्षा के पानी से'), T2('From sand and wind', 'रेत और हवा से')], y: T2('Heat and pressure under the ground slowly change buried remains into fossil fuels.', 'ज़मीन के नीचे ताप और दाब दबे अवशेषों को धीरे-धीरे जीवाश्म ईंधन में बदल देते हैं।') },
    ],
    nitrogen: [
      { q: T2('Which tiny living things in the root nodules of pulses fix nitrogen?', 'दलहनी पौधों की जड़ों की गाँठों में कौन-से सूक्ष्म जीव नाइट्रोजन का स्थिरीकरण करते हैं?'), r: T2('Rhizobium bacteria', 'राइज़ोबियम जीवाणु'), w: [T2('Earthworms', 'केंचुए'), T2('Mushrooms', 'मशरूम')], y: T2('Rhizobium bacteria live in the root nodules and change nitrogen gas into nitrates. This is why farmers grow pulses to make soil fertile.', 'राइज़ोबियम जीवाणु जड़ों की गाँठों में रहकर नाइट्रोजन गैस को नाइट्रेट में बदलते हैं। इसीलिए किसान मिट्टी उपजाऊ बनाने के लिए दालें उगाते हैं।') },
      { q: T2('Why can plants not use the nitrogen gas in the air directly?', 'पौधे हवा की नाइट्रोजन गैस सीधे क्यों नहीं ले सकते?'), r: T2('It must first be changed into nitrates or other compounds', 'उसे पहले नाइट्रेट या दूसरे यौगिकों में बदलना पड़ता है'), w: [T2('There is no nitrogen in the air', 'हवा में नाइट्रोजन होती ही नहीं'), T2('Plants do not need nitrogen', 'पौधों को नाइट्रोजन की ज़रूरत नहीं होती')], y: T2('Air is about 78 per cent nitrogen, but the gas is very stable. Bacteria (and lightning) must change it into a usable form.', 'हवा में लगभग 78 प्रतिशत नाइट्रोजन है, पर यह गैस बहुत स्थिर है। जीवाणु (और बिजली) उसे उपयोगी रूप में बदलते हैं।') },
      { q: T2('How do animals get the nitrogen they need?', 'जंतुओं को आवश्यक नाइट्रोजन कैसे मिलती है?'), r: T2('By eating plants or other animals (proteins)', 'पौधे या दूसरे जंतु (प्रोटीन) खाकर'), w: [T2('By breathing in nitrogen gas', 'नाइट्रोजन गैस साँस में लेकर'), T2('By drinking only water', 'केवल पानी पीकर')], y: T2('Animals cannot use nitrogen gas. They get it as proteins in their food.', 'जंतु नाइट्रोजन गैस का उपयोग नहीं कर सकते। उन्हें वह भोजन के प्रोटीन से मिलती है।') },
    ],
    water: [
      { q: T2('What changes liquid water into water vapour?', 'द्रव जल को जलवाष्प में क्या बदलता है?'), r: T2('Evaporation', 'वाष्पीकरण'), w: [T2('Condensation', 'संघनन'), T2('Infiltration', 'भूमि में रिसना')], y: T2('Heat from the Sun makes water evaporate from seas, rivers, soil and leaves.', 'सूर्य की गर्मी से समुद्र, नदी, मिट्टी और पत्तियों का पानी वाष्पित होता है।') },
      { q: T2('How do clouds form?', 'बादल कैसे बनते हैं?'), r: T2('Water vapour cools and condenses into tiny droplets', 'जलवाष्प ठंडी होकर छोटी बूँदों में संघनित होती है'), w: [T2('Smoke turns into water', 'धुआँ पानी बन जाता है'), T2('The sea rises into the sky', 'समुद्र आकाश में उठ जाता है')], y: T2('Higher up the air is cold. Vapour cools, condenses on dust particles, and forms clouds of tiny droplets.', 'ऊपर हवा ठंडी होती है। वाष्प ठंडी होकर धूल कणों पर संघनित होती है और बूँदों के बादल बनाती है।') },
      { q: T2('What is transpiration?', 'वाष्पोत्सर्जन क्या है?'), r: T2('Plants giving out water vapour from their leaves', 'पौधों की पत्तियों से जलवाष्प निकलना'), w: [T2('Rain falling on leaves', 'पत्तियों पर वर्षा गिरना'), T2('Roots drinking water', 'जड़ों द्वारा पानी पीना')], y: T2('Roots take up water and the leaves lose a part of it as vapour through tiny holes (stomata).', 'जड़ें पानी लेती हैं और पत्तियाँ उसका कुछ भाग छोटे छिद्रों (रंध्रों) से वाष्प के रूप में छोड़ती हैं।') },
    ],
    oxygen: [
      { q: T2('Which process puts oxygen into the air?', 'कौन-सी क्रिया हवा में ऑक्सीजन डालती है?'), r: T2('Photosynthesis', 'प्रकाश-संश्लेषण'), w: [T2('Breathing', 'साँस लेना'), T2('Burning', 'जलना')], y: T2('Green plants and algae release oxygen when they make food in sunlight.', 'हरे पौधे और शैवाल सूर्य के प्रकाश में भोजन बनाते समय ऑक्सीजन छोड़ते हैं।') },
      { q: T2('Which of these use up oxygen?', 'इनमें से कौन ऑक्सीजन का उपयोग करते हैं?'), r: T2('Breathing and burning', 'साँस लेना और जलना'), w: [T2('Only breathing', 'केवल साँस लेना'), T2('Only photosynthesis', 'केवल प्रकाश-संश्लेषण')], y: T2('Respiration in living things and burning of fuels both need oxygen.', 'जीवों का श्वसन और ईंधनों का जलना, दोनों में ऑक्सीजन लगती है।') },
      { q: T2('Which living things make much of the oxygen we breathe?', 'हमारी साँस की अधिकतर ऑक्सीजन कौन-से जीव बनाते हैं?'), r: T2('Green plants and algae, including those in the sea', 'हरे पौधे और शैवाल, समुद्र के भी'), w: [T2('Only animals', 'केवल जंतु'), T2('Only fungi', 'केवल कवक')], y: T2('Plants on land and tiny algae in the oceans give us the oxygen in the air.', 'ज़मीन के पौधे और महासागरों की सूक्ष्म शैवाल हमें हवा की ऑक्सीजन देते हैं।') },
    ],
  };

  // ---------------------------------------------------------------- words the screens use
  const U = {
    quick: T2('Quick question', 'एक छोटा प्रश्न'), next: T2('Next question', 'अगला प्रश्न'), again: T2('Ask me again', 'फिर से पूछो'),
    right: T2('Correct!', 'सही!'), wrong: T2('Not quite. Try another answer.', 'ठीक नहीं। दूसरा उत्तर चुनो।'),
    link: T2('Link', 'जोड़ें'), play: T2('Show energy', 'ऊर्जा दिखाओ'), reset: T2('Start again', 'फिर से शुरू'), sun: T2('Sun', 'सूर्य'),
    place: T2('Put it here', 'यहाँ रखो'), run: T2('Play', 'चलाओ'), pause: T2('Pause', 'रोको'), add: T2('Add more', 'और जोड़ो'), remove: T2('Take away', 'हटाओ'),
    whatif: T2('What if one disappears?', 'अगर कोई एक गायब हो जाए?'), whatifOff: T2('Back to linking', 'जोड़ने पर लौटो'),
  };
  const MODENAME = {
    chain: T2('Food chain', 'आहार शृंखला'), web: T2('Food web', 'आहार जाल'), pyramid: T2('Energy pyramid', 'ऊर्जा पिरामिड'), habitat: T2('Habitats', 'आवास'),
    adaptation: T2('Adaptation', 'अनुकूलन'), waste: T2('Waste sorting', 'कचरा छाँटना'), population: T2('Predator and prey', 'शिकारी और शिकार'),
  };
  const HINT = {
    chain: T2('Tap a living thing, then press Link. A food chain starts with a plant, and every link is eater and food.', 'किसी जीव को छुओ, फिर “जोड़ें” दबाओ। आहार शृंखला पौधे से शुरू होती है और हर कड़ी में खाने वाला व उसका भोजन होता है।'),
    web: T2('Tap two living things that are linked by eating, then press Link.', 'खाने-खिलाने के रिश्ते वाले दो जीवों को छुओ, फिर “जोड़ें” दबाओ।'),
    pyramid: T2('Tap a living thing, then tap its level in the pyramid.', 'किसी जीव को छुओ, फिर पिरामिड में उसका स्तर छुओ।'),
    habitat: T2('Tap a living thing, then press “Put it here” if it lives in this habitat.', 'किसी जीव को छुओ। यदि वह इस आवास में रहता है तो “यहाँ रखो” दबाओ।'),
    adaptation: T2('Pick a living thing, then choose how its body helps it live in its home.', 'एक जीव चुनो, फिर चुनो कि उसका शरीर उसे अपने घर में रहने में कैसे मदद करता है।'),
    waste: T2('Tap a waste item, then tap the bin it belongs in.', 'कचरे की कोई चीज़ छुओ, फिर वह डिब्बा छुओ जिसमें वह जाती है।'),
    population: T2('Press Play and watch the numbers. Add or take away animals and see what happens.', '“चलाओ” दबाओ और संख्याएँ देखो। जंतु जोड़ो या हटाओ और देखो क्या होता है।'),
    cycle: T2('Tap the next stage. The glowing ones are where the cycle can go next.', 'अगला चरण छुओ। चमकते हुए चरण वे हैं जहाँ चक्र आगे जा सकता है।'),
  };

  const wrapText = (s, max) => {
    const words = String(s).split(' ');
    const lines = [];
    let cur = '';
    words.forEach((w) => { if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) lines.push(cur);
    if (lines.length > 2) { const rest = lines.slice(1).join(' '); return [lines[0], rest.length > max + 2 ? rest.slice(0, max) + '…' : rest]; }
    return lines;
  };
  const shuffle = (ids) => { const a = ids.slice().reverse(); const k = Math.max(1, Math.floor(a.length / 3)); return a.slice(k).concat(a.slice(0, k)); };
  let UID = 0;

  // ---------------------------------------------------------------- the player
  function eco(root, cfg, api) {
    const { e: errs, p: P } = plan(cfg);
    if (errs.length) { root.textContent = errs[0]; return { destroy() {} }; }
    const base = P.base;
    const t = (x) => api.t(x);
    const nmT = (id) => (base === 'waste' ? WASTE[id].n : ORG[id].n);
    const uid = 'eco' + (++UID) + '-';
    const bgAsset = api.asset ? api.asset('eco-' + P.hab) : null;
    let destroyed = false, ro = null, narrow = false, raf = 0;
    const timers = new Set(), stops = [];
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; };
    const stopAnim = () => { stops.splice(0).forEach((f) => f()); if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const clearTimers = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };
    const gate = (key) => { if (api.allowed(key)) return true; api.nudge(key); return false; };
    const emit = (ev) => api.emit(ev);

    root.innerHTML = `<div class="eco eco-m-${base}"><div class="eco-head"></div><div class="eco-main"></div><div class="eco-say eco-say-info" role="status" aria-live="polite"></div><div class="eco-quiz"></div></div>`;
    const elHead = root.querySelector('.eco-head'), elMain = root.querySelector('.eco-main'), elSay = root.querySelector('.eco-say'), elQuiz = root.querySelector('.eco-quiz');

    let sayMsg = null;
    const say = (kind, text) => { sayMsg = { kind, text }; paintSay(); };
    const paintSay = () => {
      if (!sayMsg) { elSay.className = 'eco-say eco-say-info'; elSay.textContent = ''; return; }
      elSay.className = 'eco-say eco-say-' + sayMsg.kind;
      elSay.textContent = typeof sayMsg.text === 'function' ? sayMsg.text() : t(sayMsg.text);
    };

    // ---- the quiz (the “answer” target)
    const quiz = base === 'adaptation' ? [] : buildQuiz(P);
    const Z = { i: 0, solved: false, wrong: [] };
    const quizHtml = () => {
      if (!quiz.length) return '';
      const q = quiz[Z.i];
      return `<section class="eco-qz" aria-label="${esc(t(U.quick))}"><h3>${esc(t(U.quick))} <small>${Z.i + 1}/${quiz.length}</small></h3><p class="eco-q">${esc(t(q.q))}</p>
        <div class="eco-opts" role="group" data-key="answer" aria-label="${esc(t(U.quick))}">${q.o.map((o, i) => `<button type="button" class="eco-opt ${Z.wrong.includes(i) ? 'eco-opt-bad' : ''} ${Z.solved && i === q.a ? 'eco-opt-good' : ''}" data-opt="${i}" ${Z.wrong.includes(i) || Z.solved ? 'aria-disabled="true"' : ''}>${esc(t(o))}</button>`).join('')}</div>
        <p class="eco-qwhy" aria-live="polite">${Z.solved ? `<b>${esc(t(U.right))}</b> ${esc(t(q.w))}` : Z.wrong.length ? esc(t(U.wrong)) : ''}</p>
        ${Z.solved ? `<button type="button" class="eco-btn eco-btn-soft" data-key="next">${esc(t(Z.i + 1 < quiz.length ? U.next : U.again))}</button>` : ''}</section>`;
    };
    function onOption(idx) {
      if (!quiz.length || Z.solved || Z.wrong.includes(idx)) return;
      if (!gate('answer')) return;
      const q = quiz[Z.i];
      if (idx === q.a) {
        Z.solved = true; emit('answered:right'); api.record('answered the question right: ' + tx(q.q, 'en')); drawQuiz();
      } else { Z.wrong.push(idx); emit('answered:wrong'); api.record('answered the question wrong: ' + tx(q.q, 'en')); drawQuiz(); }
    }
    const drawQuiz = () => { elQuiz.innerHTML = quizHtml(); };
    function nextQuestion() { Z.i = (Z.i + 1) % quiz.length; Z.solved = false; Z.wrong = []; drawQuiz(); const f = elQuiz.querySelector('.eco-opt'); if (f) f.focus(); }

    // ---- shared pieces
    const card = (id, o) => {
      o = o || {};
      return `<button type="button" class="eco-card ${o.sel ? 'eco-sel' : ''} ${o.used ? 'eco-used' : ''} ${o.bad ? 'eco-nope' : ''} ${o.fresh ? 'eco-pop' : ''}" data-key="card:${id}" aria-pressed="${o.sel ? 'true' : 'false'}" ${o.used ? 'aria-disabled="true"' : ''}>${iconSvg(id, 54)}<span class="eco-cn">${esc(t(nmT(id)))}</span>${o.tag ? `<span class="eco-tag">${esc(o.tag)}</span>` : ''}${o.used ? '<span class="eco-tick" aria-hidden="true">✓</span>' : ''}</button>`;
    };
    const sunBtn = (on, label) => `<button type="button" class="eco-sunb ${on ? 'eco-on' : ''}" data-key="sun" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(t(U.sun))}">${sunSvg(44)}<span>${esc(label || t(U.sun))}</span></button>`;
    const sceneBox = (inner, cls) => `<div class="eco-scene ${cls || ''}">${sceneSvg(P.hab, uid + 's', bgAsset)}<div class="eco-over">${inner}</div></div>`;
    const resetBtn = () => `<button type="button" class="eco-btn eco-btn-ghost" data-key="reset">${esc(t(U.reset))}</button>`;
    const short = (s) => s.replace(/\s*\([^)]*\)\s*$/, '');
    const nameEn = (id) => short(tx(nmT(id), 'en')), nameHi = (id) => short(tx(nmT(id), 'hi'));
    const pair = (en, hi) => T2(en, hi);
    const joinNames = (ids, lg) => ids.map((i) => tx(nmT(i), lg)).join(lg === 'hi' ? ', ' : ', ');

    // ================================================================ modes
    const M = {};
    let S = {};

    // ---- chain -------------------------------------------------------
    M.chain = {
      init() {
        const ord = chainOrder(P.ids);
        S = { ord, tray: shuffle(P.ids), chain: [], sel: null, sunOn: false, shown: 0, fresh: null, done: false };
      },
      main() {
        const { chain, tray, sel } = S;
        const n = P.ids.length;
        const slots = chain.map((id, i) => `<li class="eco-chip ${S.fresh === id ? 'eco-pop' : ''} ${S.sunOn && i === 0 ? 'eco-glow' : ''}"><span class="eco-arrow ${S.sunOn && i === 0 ? 'eco-flow' : ''}" aria-hidden="true"></span>${iconSvg(id, 56)}<b>${esc(t(ORG[id].n))}</b><em>${esc(t(LEVEL_NAME[Math.min(i, 4)]))}</em>${S.shown > i ? `<span class="eco-en" style="--w:${Math.max(3, 100 / Math.pow(10, i))}%"><i class="${i === S.shown - 1 ? 'eco-grow' : ''}"></i><span>${fmtJ(Number((1000 / Math.pow(10, i)).toPrecision(6)))}</span></span>` : ''}</li>`).join('');
        const empty = Array.from({ length: n - chain.length }, (_, i) => `<li class="eco-chip eco-slot" aria-hidden="true"><span class="eco-arrow"></span><span class="eco-q2">?</span></li>`).join('');
        const selName = sel ? t(ORG[sel].n) : '';
        const linkLabel = sel ? `${t(U.link)}: ${selName}` : t(U.link);
        return sceneBox(`<div class="eco-chainrow">${sunBtn(S.sunOn)}<ol class="eco-chain" aria-label="${esc(t(MODENAME.chain))}">${slots}${empty}</ol></div>`) +
          `<div class="eco-tray" role="group" aria-label="${esc(t(HAB[P.hab].n))}">${tray.map((id) => card(id, { sel: sel === id, used: chain.includes(id) })).join('')}</div>
          <div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="link">${esc(linkLabel)}</button><button type="button" class="eco-btn" data-key="play">${esc(t(U.play))}</button>${resetBtn()}</div>`;
      },
      after() {
        let prev = null;
        elMain.querySelectorAll('.eco-chain > li').forEach((li) => { if (prev !== null && li.offsetTop > prev + 4) li.classList.add('eco-rs'); prev = li.offsetTop; });
      },
      act(key) {
        if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (S.chain.includes(id)) { say('info', pair(`${nameEn(id)} is already in the chain.`, `${nameHi(id)} पहले से शृंखला में है।`)); return; }
          S.sel = S.sel === id ? null : id; S.fresh = null;
          if (S.sel) { emit('picked:' + id); say('info', ORG[id].fact); }
          draw();
        } else if (key === 'link') {
          const id = S.sel;
          if (!id) { say('info', pair('First tap a living thing in the tray, then press Link.', 'पहले ट्रे में कोई जीव छुओ, फिर “जोड़ें” दबाओ।')); return; }
          const tail = S.chain[S.chain.length - 1];
          if (!tail && ORG[id].role !== 'P') { say('bad', pair(`A food chain starts with a plant, because plants make food from sunlight. ${nameEn(id)} is an animal and has to eat something first.`, `आहार शृंखला पौधे से शुरू होती है, क्योंकि पौधे सूर्य के प्रकाश से भोजन बनाते हैं। ${nameHi(id)} जंतु है और उसे पहले कुछ खाना पड़ता है।`)); return; }
          if (tail && !ORG[id].eats.includes(tail)) {
            const prey = ORG[id].eats.filter((x) => P.ids.includes(x));
            if (ORG[id].role === 'P') say('bad', pair(`${nameEn(id)} is a plant. It makes its own food and does not eat ${nameEn(tail).toLowerCase()}.`, `${nameHi(id)} पौधा है। वह अपना भोजन खुद बनाता है और ${nameHi(tail)} को नहीं खाता।`));
            else say('bad', pair(`${nameEn(id)} does not eat ${nameEn(tail).toLowerCase()}.${prey.length ? ' It eats ' + joinNames(prey, 'en').toLowerCase() + '.' : ''} Look for who eats ${nameEn(tail).toLowerCase()}.`, `${nameHi(id)} ${nameHi(tail)} को नहीं खाता।${prey.length ? ' वह ' + joinNames(prey, 'hi') + ' खाता है।' : ''} देखो ${nameHi(tail)} को कौन खाता है।`));
            S.sel = null; draw(); return;
          }
          S.chain.push(id); S.sel = null; S.fresh = id; S.shown = 0;
          emit('linked'); api.record(tail ? `linked ${tail} to ${id} in a food chain` : `started a food chain with ${id}`);
          if (S.chain.length === P.ids.length) {
            S.done = true;
            const names = S.chain.map((x) => ORG[x].n);
            say('good', pair(`Food chain complete: ${names.map((x) => x.en).join(' → ')}. The arrows show the way energy goes, from food to eater.`, `आहार शृंखला पूरी हुई: ${names.map((x) => x.hi).join(' → ')}। तीर ऊर्जा के जाने की दिशा दिखाते हैं, भोजन से खाने वाले की ओर।`));
            api.celebrate();
          } else say('good', tail ? pair(`${nameEn(tail)} → ${nameEn(id)}: the arrow shows ${nameEn(id).toLowerCase()} eating ${nameEn(tail).toLowerCase()}. Who eats ${nameEn(id).toLowerCase()}?`, `${nameHi(tail)} → ${nameHi(id)}: तीर बताता है कि ${nameHi(id)} ${nameHi(tail)} को खाता है। ${nameHi(id)} को कौन खाता है?`) : pair(`${nameEn(id)} is the producer. It makes food from the Sun’s energy. Who eats it?`, `${nameHi(id)} उत्पादक है। वह सूर्य की ऊर्जा से भोजन बनाता है। उसे कौन खाता है?`));
          draw();
        } else if (key === 'sun') {
          S.sunOn = true; S.fresh = null; emit('energy');
          say('info', pair('Sunlight is the source of all the energy. Green plants capture it to make food; every animal in the chain gets its energy from that food.', 'सारी ऊर्जा का स्रोत सूर्य का प्रकाश है। हरे पौधे उसे पकड़कर भोजन बनाते हैं; शृंखला के सभी जंतुओं को ऊर्जा उसी भोजन से मिलती है।'));
          draw();
        } else if (key === 'play') {
          if (S.chain.length < 2) { say('info', pair('Link at least two living things first, then show the energy.', 'पहले कम से कम दो जीव जोड़ो, फिर ऊर्जा दिखाओ।')); return; }
          S.shown = 0; S.fresh = null;
          const total = S.chain.length;
          const stepTo = (k) => {
            S.shown = k; draw();
            if (k < total) later(() => stepTo(k + 1), L.reducedMotion() ? 0 : 800);
            else { emit('energy'); say('good', pair('Each step passes on only about 10 per cent of the energy. The rest is used for living or lost as heat. This is why food chains are short.', 'हर चरण में केवल लगभग 10 प्रतिशत ऊर्जा आगे जाती है। बाकी जीने में लग जाती है या ऊष्मा बनकर खो जाती है। इसीलिए आहार शृंखलाएँ छोटी होती हैं।')); }
          };
          clearTimers(); stepTo(1);
        } else if (key === 'reset') { clearTimers(); M.chain.init(); say('info', pair('Start again with a plant.', 'पौधे से फिर शुरू करो।')); draw(); }
      },
    };

    // ---- web ---------------------------------------------------------
    const webGeom = () => {
      const lv = webLevels(P.ids), max = Math.max(...Object.values(lv));
      const W = narrow ? 360 : 720, cap = narrow ? 4 : 7, gap = narrow ? 88 : 108;
      const rows = [];
      for (let l = max; l >= 1; l--) {
        const list = P.ids.filter((id) => lv[id] === l);
        for (let i = 0; i < list.length; i += cap) rows.push(list.slice(i, i + cap));
      }
      const RH = 104, pos = {};
      rows.forEach((r, ri) => r.forEach((id, i) => { const sp = Math.min(gap, (W - 20) / r.length); pos[id] = { x: W / 2 + (i - (r.length - 1) / 2) * sp, y: 52 + ri * RH }; }));
      return { W, H: rows.length * RH + 24, pos, lv };
    };
    M.web = {
      init() { S = { links: [], sel: [], sunOn: false, whatif: false, removed: [], fresh: null, pulse: false, geo: null }; },
      main() {
        const g = (S.geo = webGeom());
        const links = webLinks(P.ids);
        const total = links.length, found = S.links.length;
        const trouble = S.whatif ? webTrouble() : { starving: [], stressed: [] };
        const lines = S.links.map((k) => {
          const [p, e] = k.split('>');
          const a = g.pos[p], b = g.pos[e];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const x1 = a.x + (dx / d) * 30, y1 = a.y + (dy / d) * 30, x2 = b.x - (dx / d) * 33, y2 = b.y - (dy / d) * 33;
          return `<line class="eco-lk ${S.fresh === k ? 'eco-draw' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" marker-end="url(#${uid}ah)"/>`;
        }).join('');
        const nodes = P.ids.map((id) => {
          const p = g.pos[id], sel = S.sel.includes(id), rem = S.removed.includes(id);
          const cls = ['eco-nd', sel ? 'eco-sel' : '', rem ? 'eco-gone' : '', trouble.starving.includes(id) ? 'eco-starve' : '', trouble.stressed.includes(id) ? 'eco-stress' : '', S.sunOn && ORG[id].role === 'P' ? 'eco-glow' : ''].join(' ');
          const lines2 = wrapText(t(ORG[id].n), narrow ? 11 : 14);
          const label = lines2.map((s, i) => `<text x="${p.x}" y="${p.y + 42 + i * 13}" text-anchor="middle" class="eco-nt">${esc(s)}</text>`).join('');
          return `<g class="${cls}" role="button" tabindex="0" data-key="card:${id}" aria-pressed="${sel}" aria-label="${esc(t(ORG[id].n))}${rem ? ' (' + esc(t(T2('removed', 'हटाया गया'))) + ')' : ''}"><circle cx="${p.x}" cy="${p.y}" r="30" class="eco-nc"/><svg x="${p.x - 24}" y="${p.y - 24}" width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">${(ART[id] || (() => ''))()}</svg>${rem ? `<path d="M${p.x - 20} ${p.y - 20} L${p.x + 20} ${p.y + 20} M${p.x + 20} ${p.y - 20} L${p.x - 20} ${p.y + 20}" class="eco-x"/>` : ''}${label}</g>`;
        }).join('');
        const svg = `<svg class="eco-web" viewBox="0 0 ${g.W} ${g.H}" role="group" aria-label="${esc(t(MODENAME.web))}"><defs><marker id="${uid}ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#0F172A"/></marker></defs>${lines}<g class="eco-pulses"></g>${nodes}</svg>`;
        const count = `<span class="eco-count">${found} / ${total} <small>${esc(t(T2('links', 'कड़ियाँ')))}</small></span>`;
        const done = found === total;
        return sceneBox(`<div class="eco-webtop">${sunBtn(S.sunOn)}${count}</div>${svg}`, 'eco-scene-web') +
          `<div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="link" ${S.whatif ? 'aria-disabled="true"' : ''}>${esc(t(U.link))}${S.sel.length ? ': ' + S.sel.map((i) => esc(t(ORG[i].n))).join(' + ') : ''}</button><button type="button" class="eco-btn" data-key="play">${esc(t(U.play))}</button>${done || S.whatif ? `<button type="button" class="eco-btn" data-key="whatif" aria-pressed="${S.whatif}">${esc(t(S.whatif ? U.whatifOff : U.whatif))}</button>` : ''}${resetBtn()}</div>`;
      },
      act(key) {
        if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (S.whatif) { S.removed = S.removed.includes(id) ? S.removed.filter((x) => x !== id) : S.removed.concat(id); webWhatSay(id); draw(); return; }
          S.fresh = null;
          S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : S.sel.concat(id).slice(-2);
          if (S.sel.includes(id)) { emit('picked:' + id); say('info', ORG[id].fact); }
          draw();
        } else if (key === 'link') {
          if (S.whatif) return;
          if (S.sel.length < 2) { say('info', pair('Choose two living things first.', 'पहले दो जीव चुनो।')); return; }
          const [a, b] = S.sel;
          let eater = null, prey = null;
          if (ORG[a].eats.includes(b)) { eater = a; prey = b; } else if (ORG[b].eats.includes(a)) { eater = b; prey = a; }
          S.sel = [];
          if (!eater) {
            if (ORG[a].role === 'P' && ORG[b].role === 'P') say('bad', pair('Both are plants. Plants make their own food, so neither eats the other.', 'दोनों पौधे हैं। पौधे अपना भोजन खुद बनाते हैं, इसलिए कोई किसी को नहीं खाता।'));
            else say('bad', pair(`${nameEn(a)} and ${nameEn(b)} do not eat each other. Look for a living thing and the food it eats.`, `${nameHi(a)} और ${nameHi(b)} एक-दूसरे को नहीं खाते। ऐसा जीव और उसका भोजन ढूँढो।`));
            draw(); return;
          }
          const k = prey + '>' + eater;
          if (S.links.includes(k)) { say('info', pair('You have already linked these two.', 'ये दोनों पहले से जुड़े हैं।')); draw(); return; }
          S.links.push(k); S.fresh = k;
          emit('linked'); api.record(`linked ${prey} to ${eater} in a food web`);
          const total = webLinks(P.ids).length;
          if (S.links.length === total) { say('good', pair(`Food web complete! All ${total} feeding links found. Now try “${tx(U.whatif, 'en')}”.`, `आहार जाल पूरा हुआ! सभी ${total} कड़ियाँ मिल गईं। अब “${tx(U.whatif, 'hi')}” आज़माओ।`)); api.celebrate(); }
          else say('good', pair(`${nameEn(eater)} eats ${nameEn(prey).toLowerCase()}. The arrow goes from the food to the eater. ${total - S.links.length} links left.`, `${nameHi(eater)} ${nameHi(prey)} को खाता है। तीर भोजन से खाने वाले की ओर जाता है। ${total - S.links.length} कड़ियाँ बाकी हैं।`));
          draw();
        } else if (key === 'sun') {
          S.sunOn = true; S.fresh = null; emit('energy');
          say('info', pair('The Sun’s energy enters the web through the producers. They glow here because they are the only ones that can catch it.', 'सूर्य की ऊर्जा उत्पादकों के रास्ते जाल में आती है। यहाँ वे चमक रहे हैं, क्योंकि केवल वही उसे पकड़ सकते हैं।'));
          draw();
        } else if (key === 'play') {
          if (!S.links.length) { say('info', pair('Make some links first, then watch the energy move along them.', 'पहले कुछ कड़ियाँ बनाओ, फिर उन पर ऊर्जा को चलते देखो।')); return; }
          pulseWeb();
        } else if (key === 'whatif') {
          S.whatif = !S.whatif; S.removed = []; S.sel = [];
          say('info', S.whatif ? pair('Tap a living thing to take it away. Red rings show animals that lose ALL their food; orange rings show animals that lose SOME food.', 'किसी जीव को हटाने के लिए छुओ। लाल घेरा उन जंतुओं का है जिनका सारा भोजन चला जाता है; नारंगी घेरा उनका जिनका कुछ भोजन चला जाता है।') : pair('Back to linking.', 'फिर से जोड़ने पर लौटे।'));
          draw();
        } else if (key === 'reset') { stopAnim(); M.web.init(); say('info', pair('Start again: link who eats whom.', 'फिर से शुरू: जोड़ो कि कौन किसे खाता है।')); draw(); }
      },
      after() {},
    };
    function webTrouble() {
      const gone = new Set(S.removed);
      const starving = new Set();
      let changed = true;
      while (changed) {
        changed = false;
        P.ids.forEach((id) => {
          if (gone.has(id) || starving.has(id) || ORG[id].role === 'P') return;
          const prey = eatsIn(id, P.ids);
          if (prey.length && prey.every((p) => gone.has(p) || starving.has(p))) { starving.add(id); changed = true; }
        });
      }
      const stressed = P.ids.filter((id) => !gone.has(id) && !starving.has(id) && ORG[id].role !== 'P' && eatsIn(id, P.ids).some((p) => gone.has(p) || starving.has(p)));
      return { starving: Array.from(starving), stressed };
    }
    function webWhatSay(id) {
      const tr = webTrouble();
      if (!S.removed.length) { say('info', pair('Everything is back.', 'सब कुछ वापस आ गया।')); return; }
      const rem = S.removed;
      const st = tr.starving, sr = tr.stressed;
      say(st.length ? 'bad' : 'info', pair(
        `Without ${rem.map(nameEn).join(' and ').toLowerCase()}: ${st.length ? joinNames(st, 'en') + ' lose all their food' : 'nobody loses all food'}${sr.length ? '; ' + joinNames(sr, 'en') + ' lose part of their food' : ''}.`,
        `${rem.map(nameHi).join(' और ')} के बिना: ${st.length ? joinNames(st, 'hi') + ' का सारा भोजन खत्म' : 'किसी का सारा भोजन खत्म नहीं होता'}${sr.length ? '; ' + joinNames(sr, 'hi') + ' का कुछ भोजन खत्म' : ''}।`));
    }
    function pulseWeb() {
      stopAnim();
      const g = elMain.querySelector('.eco-pulses'), geo = S.geo;
      if (!g) return;
      const NS = 'http://www.w3.org/2000/svg';
      const ls = S.links.map((k) => k.split('>'));
      const dots = ls.map(([p, e]) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '5'); c.setAttribute('class', 'eco-dot'); c.setAttribute('cx', geo.pos[p].x); c.setAttribute('cy', geo.pos[p].y); g.appendChild(c); return c; });
      const stop = tween(2200, (k) => {
        ls.forEach(([p, e], i) => {
          const delay = ((geo.lv[p] || 1) - 1) * 0.18, kk = clamp((k - delay) / (1 - delay * 1.2), 0, 1);
          const a = geo.pos[p], b = geo.pos[e];
          dots[i].setAttribute('cx', a.x + (b.x - a.x) * kk); dots[i].setAttribute('cy', a.y + (b.y - a.y) * kk);
          dots[i].setAttribute('opacity', kk <= 0 || kk >= 1 ? 0 : 1);
        });
      }, () => { dots.forEach((d) => d.remove()); emit('energy'); say('info', pair('Energy moves along the arrows from food to eater, and only about 10 per cent goes on at each step.', 'ऊर्जा तीरों के साथ भोजन से खाने वाले की ओर जाती है, और हर चरण में केवल लगभग 10 प्रतिशत आगे जाती है।')); });
      stops.push(stop);
    }

    // ---- pyramid -----------------------------------------------------
    M.pyramid = {
      init() { S = { ord: chainOrder(P.ids), tray: shuffle(P.ids), placed: {}, sel: null, sunOn: false, shown: 0, fresh: null }; },
      main() {
        const n = P.ids.length, BH = 72, H = n * BH + 24, cx = 112, top = 12, bot = H - 12;
        const wAt = (y) => 36 + (214 * (y - top)) / (bot - top);
        const cols = ['#3FA85A', '#A5CF3A', '#FFC52E', '#FF8A3D', '#FF6B57'];
        const bands = [];
        for (let k = 1; k <= n; k++) {
          const y2 = bot - (k - 1) * BH, y1 = y2 - BH + 3;
          const w1 = wAt(y1), w2 = wAt(y2);
          const id = S.placed[k];
          const poly = `${cx - w1 / 2},${y1} ${cx + w1 / 2},${y1} ${cx + w2 / 2},${y2} ${cx - w2 / 2},${y2}`;
          const ymid = (y1 + y2) / 2;
          bands.push(`<g class="eco-band ${id ? 'eco-filled' : ''} ${S.fresh === k ? 'eco-pop' : ''} ${S.sel && !id ? 'eco-target' : ''}" role="button" tabindex="0" data-key="level:${k}" aria-label="${esc(t(T2('Level ', 'स्तर ')))}${k}${id ? ': ' + esc(t(ORG[id].n)) : ''}"><rect x="0" y="${y1}" width="360" height="${BH - 3}" fill="transparent"/><polygon points="${poly}" fill="${cols[k - 1]}"/>${id ? `<svg x="${cx - 22}" y="${ymid - 24}" width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">${ART[id]()}</svg>` : `<text x="${cx}" y="${ymid + 6}" text-anchor="middle" class="eco-bq">${k}</text>`}${id ? '' : `<text x="${cx}" y="${ymid + 24}" text-anchor="middle" class="eco-bs">${esc(t(T2('tap here', 'यहाँ छुओ')))}</text>`}
            ${wrapText(t(LEVEL_NAME[Math.min(k - 1, 4)]), 12).map((s, li) => `<text x="236" y="${ymid - 24 + li * 11}" class="eco-bl">${esc(s)}</text>`).join('')}${id ? `<text x="236" y="${ymid + 6}" class="eco-bn">${esc(wrapText(t(ORG[id].n), 15)[0])}</text>` : ''}
            ${S.shown >= k ? `<text x="236" y="${ymid + 24}" class="eco-be ${S.fresh === 'e' + k ? 'eco-pop' : ''}">${fmtJ(energyAt(k))}</text>` : ''}</g>`);
        }
        const svg = `<svg class="eco-pyr" viewBox="0 0 360 ${H}" role="group" aria-label="${esc(t(MODENAME.pyramid))}">${bands.join('')}<g class="eco-arrowup" aria-hidden="true"><path d="M340 ${bot - 6} V${top + 14}" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/><path d="M333 ${top + 22} L340 ${top + 8} L347 ${top + 22}" fill="none" stroke="#0F172A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
        const filled = Object.keys(S.placed).length;
        return sceneBox(`<div class="eco-pyrrow">${sunBtn(S.sunOn)}<span class="eco-count">${filled} / ${n} <small>${esc(t(T2('levels', 'स्तर')))}</small></span></div>${svg}`, 'eco-scene-pyr') +
          `<div class="eco-tray" role="group" aria-label="${esc(t(HAB[P.hab].n))}">${S.tray.map((id) => card(id, { sel: S.sel === id, used: Object.values(S.placed).includes(id) })).join('')}</div>
          <div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="play">${esc(t(U.play))}</button>${resetBtn()}</div>`;
      },
      act(key) {
        if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (Object.values(S.placed).includes(id)) { say('info', pair(`${nameEn(id)} is already in the pyramid.`, `${nameHi(id)} पहले से पिरामिड में है।`)); return; }
          S.sel = S.sel === id ? null : id; S.fresh = null;
          if (S.sel) { emit('picked:' + id); say('info', ORG[id].fact); }
          draw();
        } else if (key.startsWith('level:')) {
          const k = +key.slice(6);
          if (!S.sel) { say('info', pair('Tap a living thing in the tray first.', 'पहले ट्रे में कोई जीव छुओ।')); return; }
          if (S.placed[k]) { say('info', pair('This level is already filled.', 'यह स्तर पहले से भरा है।')); return; }
          const id = S.sel, true1 = S.ord.indexOf(id) + 1;
          if (true1 !== k) {
            const nm = LEVEL_NAME[Math.min(true1 - 1, 4)];
            say('bad', pair(`${nameEn(id)} is not on level ${k}. In this chain it is a ${nm.en.toLowerCase()}, on level ${true1}${true1 === 1 ? ' (the bottom: plants make the food)' : ''}.`, `${nameHi(id)} स्तर ${k} पर नहीं है। इस शृंखला में वह ${nm.hi} है, यानी स्तर ${true1}${true1 === 1 ? ' (सबसे नीचे: पौधे भोजन बनाते हैं)' : ''} पर।`));
            S.sel = null; draw(); return;
          }
          S.placed[k] = id; S.sel = null; S.fresh = k; S.shown = 0;
          emit('linked'); api.record(`put ${id} on level ${k} of the energy pyramid`);
          if (Object.keys(S.placed).length === P.ids.length) {
            emit('sorted'); say('good', pair('The pyramid is built. Producers are at the base because they hold the most energy. Now press “Show energy”.', 'पिरामिड बन गया। उत्पादक आधार पर हैं क्योंकि उनके पास सबसे अधिक ऊर्जा है। अब “ऊर्जा दिखाओ” दबाओ।')); api.celebrate();
          } else say('good', pair(`Yes! ${nameEn(id)} is on level ${k}.`, `सही! ${nameHi(id)} स्तर ${k} पर है।`));
          draw();
        } else if (key === 'sun') {
          S.sunOn = true; S.fresh = null; emit('energy');
          say('info', pair('Every bit of energy in the pyramid comes from the Sun. Producers store a small part of it as food.', 'पिरामिड की सारी ऊर्जा सूर्य से आती है। उत्पादक उसका थोड़ा भाग भोजन के रूप में जमा करते हैं।'));
          draw();
        } else if (key === 'play') {
          if (Object.keys(S.placed).length < P.ids.length) { say('info', pair('Fill every level of the pyramid first.', 'पहले पिरामिड के सारे स्तर भरो।')); return; }
          clearTimers();
          const n = P.ids.length;
          const stepTo = (k) => {
            S.shown = k; S.fresh = 'e' + k; draw();
            if (k < n) later(() => stepTo(k + 1), L.reducedMotion() ? 0 : 750);
            else { emit('energy'); say('good', pair(`Producers hold ${fmtJ(ENERGY_TOP)} (an example number). Each step up keeps only about 10 per cent: the top gets ${fmtJ(energyAt(n))}. That is why the pyramid narrows and top animals are few.`, `उत्पादकों के पास ${fmtJ(ENERGY_TOP)} है (उदाहरण की संख्या)। हर चरण ऊपर लगभग 10 प्रतिशत ही बचता है: सबसे ऊपर ${fmtJ(energyAt(n))} पहुँचती है। इसीलिए पिरामिड संकरा होता है और शीर्ष जंतु कम होते हैं।`)); }
          };
          stepTo(1);
        } else if (key === 'reset') { clearTimers(); M.pyramid.init(); say('info', pair('Start again: which level does each one belong on?', 'फिर से शुरू: कौन-सा जीव किस स्तर का है?')); draw(); }
      },
    };

    // ---- cycles ------------------------------------------------------
    const cyc = base === 'cycle' ? CYC[P.sub] : null;
    const cycGeo = () => {
      const W = narrow ? 360 : 720, H = narrow ? 470 : 440;
      const pos = {};
      cyc.nodes.forEach((n) => { pos[n.id] = { x: 54 + n.x * (W - 108), y: 50 + n.y * (H - 140) }; });
      return { W, H, pos };
    };
    const edgePath = (g, e) => {
      const a = g.pos[e.f], b = g.pos[e.t];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const r = 36;
      const x1 = a.x + ux * r, y1 = a.y + uy * r, x2 = b.x - ux * (r + 6), y2 = b.y - uy * (r + 6);
      const both = cyc.edges.some((o) => o.f === e.t && o.t === e.f);
      const off = both ? 26 : 14 + (e.i % 2) * 10;
      const sgn = both ? (e.f < e.t ? 1 : -1) : (e.i % 2 ? -1 : 1);
      const mx = (x1 + x2) / 2 - uy * off * sgn, my = (y1 + y2) / 2 + ux * off * sgn;
      return { d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, x1, y1, x2, y2, mx, my };
    };
    M.cycle = {
      init() { S = { at: cyc.start, visited: [], sunOn: false, busy: false, auto: false, fresh: null, tok: null }; },
      reach() { return cyc.edges.filter((e) => e.f === S.at); },
      main() {
        const g = (S.geo = cycGeo());
        const reach = M.cycle.reach().map((e) => e.t);
        const edges = cyc.edges.map((e) => {
          const p = edgePath(g, e), vis = S.visited.includes(e.i), now = e.f === S.at;
          return `<path d="${p.d}" class="eco-ed ${vis ? 'eco-vis' : ''} ${now && !vis ? 'eco-next' : ''} ${S.fresh === e.i ? 'eco-draw' : ''}" marker-end="url(#${uid}${vis ? 'ag' : 'ah'})"><title>${esc(t(e.p))}</title></path>`;
        }).join('');
        const nodes = cyc.nodes.map((n) => {
          const p = g.pos[n.id];
          const lines = wrapText(t(n.l), narrow ? 13 : 20);
          return `<g class="eco-cn2 ${n.id === S.at ? 'eco-here' : ''} ${reach.includes(n.id) ? 'eco-reach' : ''}" role="button" tabindex="0" data-key="card:${n.id}" aria-label="${esc(t(n.l))}"><circle cx="${p.x}" cy="${p.y}" r="36" class="eco-ring"/><svg x="${p.x - 32}" y="${p.y - 32}" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">${NODE[n.k]()}</svg>${lines.map((s, i) => `<text x="${p.x}" y="${p.y + 54 + i * 14}" text-anchor="middle" class="eco-nt">${esc(s)}</text>`).join('')}</g>`;
        }).join('');
        const sunG = cyc.needsSun ? `<g class="eco-sunsvg ${S.sunOn ? 'eco-on' : ''}" role="button" tabindex="0" data-key="sun" aria-pressed="${S.sunOn}" aria-label="${esc(t(U.sun))}"><svg x="${g.W - 74}" y="6" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">${sunSvg(64).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><text x="${g.W - 42}" y="80" text-anchor="middle" class="eco-nt">${esc(t(U.sun))}</text></g>` : '';
        const p0 = g.pos[S.at];
        const tok = `<circle class="eco-tok" cx="${p0.x}" cy="${p0.y - 40}" r="8"/>`;
        const svg = `<svg class="eco-cyc" viewBox="0 0 ${g.W} ${g.H}" role="group" aria-label="${esc(t(cyc.n))}"><defs><marker id="${uid}ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#475569"/></marker><marker id="${uid}ag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#15803D"/></marker></defs>${edges}${nodes}${sunG}${tok}</svg>`;
        const done = S.visited.length === cyc.edges.length;
        const chips = cyc.edges.map((e) => `<li class="${S.visited.includes(e.i) ? 'eco-got' : ''}">${S.visited.includes(e.i) ? '✓ ' + esc(t(e.p)) : '• ?'}</li>`).join('');
        return sceneBox(svg, 'eco-scene-cyc') + `<div class="eco-prog"><b>${S.visited.length} / ${cyc.edges.length}</b> <span>${esc(t(T2('processes found', 'क्रियाएँ मिलीं')))}</span><ul class="eco-chips" aria-label="${esc(t(T2('Processes found', 'मिली हुई क्रियाएँ')))}">${chips}</ul></div>
          <div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="play">${esc(t(done ? U.again : T2('Show me the cycle', 'चक्र दिखाओ')))}</button>${resetBtn()}</div>`;
      },
      act(key) {
        if (S.busy) return;
        if (key === 'sun') {
          if (!cyc.needsSun) return;
          S.sunOn = !S.sunOn; if (S.sunOn) { emit('energy'); say('info', pair('The Sun is shining. Energy from sunlight drives photosynthesis, evaporation and transpiration.', 'सूर्य चमक रहा है। सूर्य के प्रकाश की ऊर्जा से प्रकाश-संश्लेषण, वाष्पीकरण और वाष्पोत्सर्जन चलते हैं।')); } else say('info', pair('The Sun is switched off. Steps that need sunlight will wait.', 'सूर्य बंद है। जिन चरणों को धूप चाहिए, वे रुके रहेंगे।'));
          draw();
        } else if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (id === S.at) { const nd = cyc.nodes.find((n) => n.id === id); say('info', pair(`The cycle is at “${nd.l.en}” now. Tap one of the glowing stages to go on.`, `चक्र अभी “${nd.l.hi}” पर है। आगे जाने के लिए चमकते चरणों में से कोई छुओ।`)); return; }
          const e = cyc.edges.find((x) => x.f === S.at && x.t === id);
          if (!e) {
            const nd = cyc.nodes.find((n) => n.id === S.at), nxt = M.cycle.reach().map((x) => cyc.nodes.find((n) => n.id === x.t));
            say('bad', pair(`From “${nd.l.en}” the cycle cannot go straight there. It can go to: ${nxt.map((n) => n.l.en).join('; ')}.`, `“${nd.l.hi}” से चक्र सीधे वहाँ नहीं जा सकता। वह यहाँ जा सकता है: ${nxt.map((n) => n.l.hi).join('; ')}।`));
            return;
          }
          M.cycle.go(e);
        } else if (key === 'play') {
          M.cycle.tour();
        } else if (key === 'reset') { S.auto = false; clearTimers(); stopAnim(); M.cycle.init(); say('info', pair('The cycle starts again.', 'चक्र फिर से शुरू।')); draw(); }
      },
      go(e, cb) {
        if (e.sun && !S.sunOn) {
          if (!S.auto) { say('bad', pair(`${e.p.en} needs sunlight. Tap the Sun first.`, `${e.p.hi} के लिए धूप चाहिए। पहले सूर्य को छुओ।`)); return; }
          S.sunOn = true; emit('energy'); draw();
        }
        const g = S.geo, p = edgePath(g, e), first = !S.visited.includes(e.i);
        S.busy = true;
        const from = g.pos[e.f], to = g.pos[e.t];
        const tok = elMain.querySelector('.eco-tok');
        const finish = () => {
          S.at = e.t; S.busy = false;
          if (first) S.visited.push(e.i);
          S.fresh = first ? e.i : null;
          emit('linked'); api.record(`cycle step: ${e.f} to ${e.t} by ${e.p.en}`);
          const done = S.visited.length === cyc.edges.length;
          say(done ? 'good' : 'info', pair(`${e.p.en}: ${e.x.en}`, `${e.p.hi}: ${e.x.hi}`));
          draw();
          if (done && first) { emit('cycle-done'); api.celebrate(); say('good', pair(`Cycle complete! ${cyc.edges.length} processes found. Matter goes round and round; none of it is lost. ${e.p.en}: ${e.x.en}`, `चक्र पूरा हुआ! ${cyc.edges.length} क्रियाएँ मिलीं। पदार्थ घूमता रहता है; कुछ भी खोता नहीं। ${e.p.hi}: ${e.x.hi}`)); }
          if (cb) cb();
        };
        if (tok) {
          const stop = tween(950, (k) => {
            const x = (1 - k) * (1 - k) * p.x1 + 2 * (1 - k) * k * p.mx + k * k * p.x2, y = (1 - k) * (1 - k) * p.y1 + 2 * (1 - k) * k * p.my + k * k * p.y2;
            tok.setAttribute('cx', x); tok.setAttribute('cy', y);
          }, finish);
          stops.push(stop);
        } else finish();
      },
      tour() {
        if (S.visited.length === cyc.edges.length) { M.cycle.init(); draw(); }
        S.auto = true;
        const next = () => {
          if (!S.auto || destroyed) return;
          if (S.visited.length === cyc.edges.length) { S.auto = false; return; }
          // shortest walk from where we are to an edge not yet used
          const q = [[S.at, []]], seen = new Set([S.at]);
          let pathE = null;
          while (q.length && !pathE) {
            const [n, path] = q.shift();
            for (const e of cyc.edges.filter((x) => x.f === n)) {
              if (!S.visited.includes(e.i)) { pathE = path.concat(e); break; }
              if (!seen.has(e.t)) { seen.add(e.t); q.push([e.t, path.concat(e)]); }
            }
          }
          if (!pathE) { S.auto = false; return; }
          M.cycle.go(pathE[0], () => later(next, L.reducedMotion() ? 0 : 500));
        };
        next();
      },
    };

    // ---- habitat -----------------------------------------------------
    const habFoot = (id) => ORG[id].hab.slice(0, 2).map((h) => tx(HAB[h].n, 'en'));
    M.habitat = {
      init() { S = { tray: shuffle(P.ids), placed: [], rejected: [], sel: null, fresh: null }; },
      main() {
        const hn = t(HAB[P.hab].n);
        const mem = P.ids.filter((id) => ORG[id].hab.includes(P.hab));
        const living = S.placed.map((id) => `<li class="eco-lv ${S.fresh === id ? 'eco-pop' : ''}">${iconSvg(id, 52)}<span>${esc(t(ORG[id].n))}</span></li>`).join('');
        return sceneBox(`<div class="eco-habtop"><span class="eco-count">${esc(hn)}: ${S.placed.length} / ${mem.length}</span></div><p class="eco-hd">${esc(t(HAB[P.hab].d))}</p><ul class="eco-lvl" aria-label="${esc(hn)}">${living}</ul>`, 'eco-scene-hab') +
          `<div class="eco-tray" role="group">${S.tray.map((id) => card(id, { sel: S.sel === id, used: S.placed.includes(id), bad: S.rejected.includes(id), tag: S.rejected.includes(id) ? t(T2('lives elsewhere', 'कहीं और रहता है')) : '' })).join('')}</div>
          <div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="link">${esc(t(U.place))}</button>${resetBtn()}</div>`;
      },
      act(key) {
        if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (S.placed.includes(id)) return;
          S.sel = S.sel === id ? null : id; S.fresh = null;
          if (S.sel) { emit('picked:' + id); say('info', ORG[id].fact); }
          draw();
        } else if (key === 'link') {
          const id = S.sel;
          if (!id) { say('info', pair('Tap a living thing first.', 'पहले कोई जीव छुओ।')); return; }
          const hn = HAB[P.hab].n;
          if (ORG[id].hab.includes(P.hab)) {
            S.placed.push(id); S.sel = null; S.fresh = id;
            emit('sorted'); api.record(`placed ${id} in the ${P.hab}`);
            const mem = P.ids.filter((x) => ORG[x].hab.includes(P.hab));
            if (S.placed.length === mem.length) { say('good', pair(`${nameEn(id)} lives in the ${hn.en}. ${ORG[id].fact.en} All the ${hn.en} animals and plants are home!`, `${nameHi(id)} ${hn.hi} में रहता है। ${ORG[id].fact.hi} ${hn.hi} के सभी जीव घर पहुँच गए!`)); api.celebrate(); }
            else say('good', pair(`${nameEn(id)} lives in the ${hn.en}. ${ORG[id].fact.en}`, `${nameHi(id)} ${hn.hi} में रहता है। ${ORG[id].fact.hi}`));
          } else {
            if (!S.rejected.includes(id)) S.rejected.push(id);
            S.sel = null; S.fresh = null;
            const where = ORG[id].hab.filter((h) => h !== 'farm' || ORG[id].hab.length === 1).slice(0, 2);
            say('bad', pair(`${nameEn(id)} does not live in the ${hn.en}. It lives in the ${where.map((h) => tx(HAB[h].n, 'en')).join(' or ')}. ${ORG[id].fact.en}`, `${nameHi(id)} ${hn.hi} में नहीं रहता। वह ${where.map((h) => tx(HAB[h].n, 'hi')).join(' या ')} में रहता है। ${ORG[id].fact.hi}`));
          }
          draw();
        } else if (key === 'reset') { M.habitat.init(); say('info', pair('Start again: which ones live here?', 'फिर से शुरू: कौन-से जीव यहाँ रहते हैं?')); draw(); }
      },
    };

    // ---- adaptation --------------------------------------------------
    M.adaptation = {
      init() { S = { cur: P.ids[0], done: [], wrong: [], tray: P.ids.slice() }; },
      main() {
        const id = S.cur, A = ADAPT[id];
        const opts = A.o.map((o, i) => `<button type="button" class="eco-opt ${S.wrong.includes(i) ? 'eco-opt-bad' : ''} ${S.done.includes(id) && i === A.a ? 'eco-opt-good' : ''}" data-opt="${i}" ${S.wrong.includes(i) || S.done.includes(id) ? 'aria-disabled="true"' : ''}>${esc(t(o))}</button>`).join('');
        const bg = A.hab;
        return `<div class="eco-scene eco-scene-ad">${sceneSvg(bg, uid + 'a', null)}<div class="eco-over"><div class="eco-big ${S.done.includes(id) ? 'eco-pop' : ''}">${iconSvg(id, 112)}<b>${esc(t(ORG[id].n))}</b><em>${esc(t(HAB[bg].n))}</em></div></div></div>
          <section class="eco-qz"><p class="eco-q">${esc(t(A.q))}</p><div class="eco-opts" role="group" data-key="answer" aria-label="${esc(t(A.q))}">${opts}</div></section>
          <div class="eco-tray" role="group">${S.tray.map((x) => card(x, { sel: S.cur === x, used: S.done.includes(x) })).join('')}</div>
          <div class="eco-bar">${resetBtn()}</div>`;
      },
      act(key) {
        if (key.startsWith('card:')) { S.cur = key.slice(5); S.wrong = []; say('info', ORG[S.cur].fact); emit('picked:' + S.cur); draw(); }
        else if (key === 'reset') { M.adaptation.init(); say('info', pair('Start again.', 'फिर से शुरू।')); draw(); }
      },
      opt(i) {
        const id = S.cur, A = ADAPT[id];
        if (S.done.includes(id) || S.wrong.includes(i)) return;
        if (!gate('answer')) return;
        if (i === A.a) {
          S.done.push(id); emit('answered:right'); api.record(`adaptation of ${id}: right`);
          if (S.done.length === P.ids.length) { emit('sorted'); say('good', pair(A.w.en + ' Every living thing fits its home!', A.w.hi + ' हर जीव अपने घर के अनुकूल है!')); api.celebrate(); }
          else {
            const nx = P.ids.find((x) => !S.done.includes(x));
            say('good', pair('Right! ' + A.w.en, 'सही! ' + A.w.hi));
            void nx;
          }
        } else { S.wrong.push(i); emit('answered:wrong'); api.record(`adaptation of ${id}: wrong`); say('bad', pair('Not quite. Think about the place where it lives, then try again.', 'ठीक नहीं। सोचो वह कहाँ रहता है, फिर दोबारा कोशिश करो।')); }
        draw();
      },
    };

    // ---- waste -------------------------------------------------------
    const binSvg = (b, n, items, shake) => {
      const c = BIN[b].c;
      return `<svg viewBox="0 0 120 140" class="eco-binsvg ${shake ? 'eco-shake' : ''}" aria-hidden="true" focusable="false"><path d="M18 36 L28 128 Q29 134 36 134 H84 Q91 134 92 128 L102 36Z" fill="${c}"/><path d="M18 36 L102 36 L100 48 L20 48Z" fill="#000" opacity=".12"/><rect x="10" y="22" width="100" height="16" rx="6" fill="${c}"/><rect x="10" y="22" width="100" height="6" rx="3" fill="#fff" opacity=".28"/><rect x="48" y="12" width="24" height="12" rx="5" fill="${c}"/><path d="M38 56 V120 M60 56 V120 M82 56 V120" stroke="#fff" stroke-opacity=".28" stroke-width="3" stroke-linecap="round"/><g>${items.slice(-4).map((id, i) => `<svg x="${28 + i * 17}" y="${-4 + (i % 2) * 6}" width="30" height="30" viewBox="0 0 64 64">${WART[id]()}</svg>`).join('')}</g></svg>`;
    };
    M.waste = {
      init() { S = { tray: shuffle(P.ids), sorted: {}, sel: null, fresh: null, shake: null, clock: false }; },
      main() {
        const bins = ['green', 'blue'].map((b) => {
          const items = Object.keys(S.sorted).filter((id) => S.sorted[id] === b);
          return `<button type="button" class="eco-bin eco-bin-${b} ${S.fresh === b ? 'eco-pop' : ''}" data-key="bin:${b}" aria-label="${esc(t(BIN[b].n))}">${binSvg(b, items.length, items, S.shake === b)}<b>${esc(t(BIN[b].n))}</b><small>${esc(t(BIN[b].d))}</small><span class="eco-binct">${items.length}</span></button>`;
        }).join('');
        const clock = S.clock ? M.waste.clockHtml() : '';
        return sceneBox(`<div class="eco-bins">${bins}</div>`, 'eco-scene-waste') +
          `<div class="eco-tray" role="group">${S.tray.map((id) => card(id, { sel: S.sel === id, used: !!S.sorted[id] })).join('')}</div>${clock}
          <div class="eco-bar"><button type="button" class="eco-btn" data-key="play">${esc(t(T2('Rot clock', 'सड़ने की घड़ी')))}</button>${resetBtn()}</div>`;
      },
      clockHtml() {
        const ids = Object.keys(S.sorted).sort((a, b) => WASTE[a].rot - WASTE[b].rot);
        if (!ids.length) return '';
        return `<section class="eco-rot" aria-label="${esc(t(T2('How long to rot', 'सड़ने में कितना समय')))}"><h3>${esc(t(T2('How long does it take to rot?', 'सड़ने में कितना समय लगता है?')))}</h3><ul>${ids.map((id) => `<li><span class="eco-rn">${iconSvg(id, 28)} ${esc(t(WASTE[id].n))}</span><span class="eco-rb"><i style="--w:${[12, 38, 68, 100][WASTE[id].rot]}%"></i></span><span class="eco-rt">${esc(t(ROT[WASTE[id].rot]))}</span></li>`).join('')}</ul></section>`;
      },
      act(key) {
        if (key.startsWith('card:')) {
          const id = key.slice(5);
          if (S.sorted[id]) return;
          S.sel = S.sel === id ? null : id; S.fresh = null; S.shake = null;
          if (S.sel) { emit('picked:' + id); say('info', pair(`${nameEn(id)}: wet waste (green bin) or dry waste (blue bin)?`, `${nameHi(id)}: गीला कचरा (हरा डिब्बा) या सूखा कचरा (नीला डिब्बा)?`)); }
          draw();
        } else if (key.startsWith('bin:')) {
          const b = key.slice(4), id = S.sel;
          if (!id) { say('info', pair('Tap a waste item first, then the bin.', 'पहले कचरे की कोई चीज़ छुओ, फिर डिब्बा।')); return; }
          if (WASTE[id].bin === b) {
            S.sorted[id] = b; S.sel = null; S.fresh = b; S.shake = null;
            emit('sorted'); api.record(`sorted ${id} into the ${b} bin`);
            const left = P.ids.filter((x) => !S.sorted[x]).length;
            if (!left) { say('good', pair(WASTE[id].why.en + ' All sorted! Wet waste becomes compost; dry waste goes for recycling. Press “Rot clock”.', WASTE[id].why.hi + ' सब छँट गया! गीले कचरे से खाद बनती है; सूखा कचरा पुनर्चक्रण के लिए जाता है। “सड़ने की घड़ी” दबाओ।')); api.celebrate(); }
            else say('good', WASTE[id].why);
          } else {
            S.shake = b; S.fresh = null; S.sel = null;
            say('bad', pair(`Not the ${tx(BIN[b].s, 'en').toLowerCase()} bin. ${WASTE[id].why.en}`, `यह ${tx(BIN[b].s, 'hi')} का डिब्बा नहीं है। ${WASTE[id].why.hi}`));
          }
          draw();
        } else if (key === 'play') {
          if (!Object.keys(S.sorted).length) { say('info', pair('Sort some waste first, then see how long it takes to rot.', 'पहले कुछ कचरा छाँटो, फिर देखो उसे सड़ने में कितना समय लगता है।')); return; }
          S.clock = !S.clock; say('info', S.clock ? pair('Wet waste rots in weeks. Plastic and glass stay for hundreds of years, so we recycle them.', 'गीला कचरा हफ़्तों में सड़ जाता है। प्लास्टिक और काँच सैकड़ों वर्ष रहते हैं, इसलिए हम उनका पुनर्चक्रण करते हैं।') : pair('Rot clock hidden.', 'घड़ी छिपाई गई।'));
          draw();
        } else if (key === 'reset') { M.waste.init(); say('info', pair('Start again.', 'फिर से शुरू।')); draw(); }
      },
    };

    // ---- population --------------------------------------------------
    const COLP = ['#22A455', '#FF8A1F', '#E5484D'];
    M.population = {
      init() {
        const s = POP.start;
        S = { t: 0, v: [s[0], s[1], s[2]], hist: [], run: false, mode: 'add', dead: [false, false, false], calm: 0, fired: false, last: 0 };
        S.hist.push([0, s[0], s[1], s[2]]);
      },
      chart() {
        const W = 360, H = 190, X0 = 34, X1 = 348, Y0 = 14, Y1 = 160, YM = 2.6;
        const xs = (tt) => X0 + (tt / POP.years) * (X1 - X0), ys = (v) => Y1 - (Math.min(v, YM) / YM) * (Y1 - Y0);
        const grid = [0, 1, 2].map((v) => `<line x1="${X0}" x2="${X1}" y1="${ys(v)}" y2="${ys(v)}" class="eco-gl ${v === 1 ? 'eco-g1' : ''}"/><text x="${X0 - 5}" y="${ys(v) + 4}" text-anchor="end" class="eco-gt">${v === 1 ? '≈' : v}</text>`).join('');
        const xt = [0, 6, 12, 18, 24].map((v) => `<text x="${xs(v)}" y="${Y1 + 16}" text-anchor="middle" class="eco-gt">${v}</text>`).join('');
        const lines = [0, 1, 2].map((k) => `<path class="eco-pl" data-k="${k}" stroke="${COLP[k]}" d="${M.population.path(k, xs, ys)}"/>`).join('');
        const band = `<rect x="${X0}" y="${ys(1.2)}" width="${X1 - X0}" height="${ys(0.8) - ys(1.2)}" class="eco-bandg"/>`;
        return `<svg class="eco-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(T2('Graph of the three populations over the years', 'वर्षों में तीनों आबादियों का ग्राफ़')))}">${band}${grid}${xt}<text x="${(X0 + X1) / 2}" y="${H - 4}" text-anchor="middle" class="eco-gt">${esc(t(T2('years', 'वर्ष')))}</text><text x="6" y="12" class="eco-gt">${esc(t(T2('more ↑', 'अधिक ↑')))}</text>${lines}</svg>`;
      },
      path(k, xs, ys) { return S.hist.map((h, i) => `${i ? 'L' : 'M'}${xs(h[0]).toFixed(1)} ${ys(h[k + 1]).toFixed(1)}`).join(' '); },
      meters() {
        return P.ids.map((id, k) => {
          const v = S.v[k], pct = clamp((v / 2.6) * 100, 0, 100);
          const lvl = S.dead[k] ? T2('died out', 'समाप्त') : v < 0.5 ? T2('very low', 'बहुत कम') : v < 0.8 ? T2('low', 'कम') : v <= 1.2 ? T2('balanced', 'संतुलित') : v <= 1.7 ? T2('high', 'अधिक') : T2('very high', 'बहुत अधिक');
          return `<div class="eco-pm"><button type="button" class="eco-card" data-key="card:${id}" aria-label="${esc(t(S.mode === 'add' ? U.add : U.remove))}: ${esc(t(ORG[id].n))}">${iconSvg(id, 46)}<span class="eco-cn">${esc(t(ORG[id].n))}</span></button><div class="eco-meter" style="--c:${COLP[k]}"><i data-k="${k}" style="width:${pct}%"></i></div><small class="eco-lvlt" data-k="${k}">${esc(t(lvl))}</small></div>`;
        }).join('');
      },
      main() {
        return sceneBox(`<div class="eco-popwrap">${M.population.chart()}</div>`, 'eco-scene-pop') +
          `<div class="eco-pms">${M.population.meters()}</div>
          <div class="eco-bar"><button type="button" class="eco-btn eco-btn-main" data-key="play" aria-pressed="${S.run}">${esc(t(S.run ? U.pause : U.run))}</button><button type="button" class="eco-btn" data-key="popmode" aria-pressed="${S.mode === 'remove'}">${esc(t(S.mode === 'add' ? T2('Tapping: add more', 'छूने पर: और जोड़ो') : T2('Tapping: take away', 'छूने पर: हटाओ')))}</button>${resetBtn()}</div>`;
      },
      after() { M.population.refresh(); },
      refresh() {
        const old = elMain.querySelectorAll('.eco-meter i');
        old.forEach((i) => { const k = +i.dataset.k; i.style.width = clamp((S.v[k] / 2.6) * 100, 0, 100) + '%'; });
        elMain.querySelectorAll('.eco-lvlt').forEach((s) => {
          const k = +s.dataset.k, v = S.v[k];
          const lvl = S.dead[k] ? T2('died out', 'समाप्त') : v < 0.5 ? T2('very low', 'बहुत कम') : v < 0.8 ? T2('low', 'कम') : v <= 1.2 ? T2('balanced', 'संतुलित') : v <= 1.7 ? T2('high', 'अधिक') : T2('very high', 'बहुत अधिक');
          s.textContent = t(lvl);
        });
        const c = elMain.querySelector('.eco-chart');
        if (c) {
          const X0 = 34, X1 = 348, Y0 = 14, Y1 = 160, YM = 2.6;
          const xs = (tt) => X0 + (tt / POP.years) * (X1 - X0), ys = (v) => Y1 - (Math.min(v, YM) / YM) * (Y1 - Y0);
          c.querySelectorAll('.eco-pl').forEach((p) => p.setAttribute('d', M.population.path(+p.dataset.k, xs, ys)));
        }
      },
      tick(now) {
        raf = 0;
        if (!S.run || destroyed) return;
        const dt = clamp((now - S.last) / 1000, 0, 0.1); S.last = now;
        const adv = dt * 1.1; // years per second
        let s = { x: S.v[0], y: S.v[1], z: S.v[2] };
        s = popStep(s, adv);
        S.v = [s.x, s.y, s.z]; S.t += adv;
        S.v.forEach((v, k) => { if (v < 0.04 && !S.dead[k]) { S.dead[k] = true; S.v[k] = 0; M.population.diedOut(k); } });
        const lastH = S.hist[S.hist.length - 1];
        if (S.t - lastH[0] >= 0.2) S.hist.push([S.t, S.v[0], S.v[1], S.v[2]]);
        // balanced: all three alive and near 1 for two years in a row
        const near = S.v.every((v) => v >= 0.8 && v <= 1.2);
        S.calm = near ? S.calm + adv : 0;
        if (S.calm >= 2 && !S.fired && !S.dead.some(Boolean)) {
          S.fired = true; emit('balanced'); api.record('the predator and prey numbers balanced');
          say('good', pair('Balanced! The number of plants, plant-eaters and hunters now stay near the same. Each keeps the others in check.', 'संतुलन! पौधों, शाकाहारियों और शिकारियों की संख्या अब लगभग स्थिर है। हर एक दूसरों को सीमा में रखता है।')); api.celebrate();
        }
        M.population.refresh();
        if (S.t >= POP.years) { S.run = false; draw(); return; }
        raf = requestAnimationFrame((n) => M.population.tick(n));
      },
      diedOut(k) {
        const id = P.ids[k];
        say('bad', pair(`${nameEn(id)} has died out! Without it the others suffer too. Press “${tx(U.reset, 'en')}” to try again.`, `${nameHi(id)} समाप्त हो गया! उसके बिना बाकी भी संकट में आ जाते हैं। फिर कोशिश करने के लिए “${tx(U.reset, 'hi')}” दबाओ।`));
      },
      start() { if (S.t >= POP.years) { M.population.init(); } S.run = true; S.last = performance.now(); draw(); },
      act(key) {
        if (key === 'play') {
          if (S.run) { S.run = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } draw(); return; }
          say('info', pair('Watch the three lines. Tap an animal to add more or take some away.', 'तीनों रेखाओं को देखो। जंतु को छूकर और जोड़ो या कुछ हटाओ।'));
          M.population.start();
        } else if (key === 'popmode') { S.mode = S.mode === 'add' ? 'remove' : 'add'; draw(); }
        else if (key.startsWith('card:')) {
          const k = P.ids.indexOf(key.slice(5)), id = P.ids[k];
          if (S.dead[k] && S.mode === 'remove') return;
          if (S.mode === 'add') { S.v[k] = k === 0 ? Math.min(2, S.v[k] + 0.5) : S.v[k] + 0.6; S.dead[k] = false; } else { S.v[k] *= 0.3; if (S.v[k] < 0.04) { S.v[k] = 0; S.dead[k] = true; M.population.diedOut(k); } }
          S.fired = false; S.calm = 0;
          S.hist.push([S.t, S.v[0], S.v[1], S.v[2]]);
          if (!S.dead.some(Boolean)) say('info', S.mode === 'add' ? pair(`More ${nameEn(id).toLowerCase()} added. Watch what the others do.`, `और ${nameHi(id)} जोड़े गए। देखो बाकी क्या करते हैं।`) : pair(`Some ${nameEn(id).toLowerCase()} taken away. Watch what the others do.`, `कुछ ${nameHi(id)} हटाए गए। देखो बाकी क्या करते हैं।`));
          emit('picked:' + id);
          M.population.refresh();
          if (!S.run) draw();
        } else if (key === 'reset') { stopAnim(); M.population.init(); say('info', pair('Start again. Press Play.', 'फिर से शुरू। “चलाओ” दबाओ।')); draw(); }
      },
    };

    // ================================================================ drawing and events
    const mode = M[base];
    let focusKey = null;
    function draw() {
      const ae = document.activeElement;
      const fk = ae && root.contains(ae) ? (ae.dataset.key || (ae.dataset.opt != null ? 'opt:' + ae.dataset.opt : null)) : null;
      stopAnim();
      const head = `<span class="eco-badge">${esc(t(base === 'cycle' ? cyc.n : MODENAME[base]))}</span><span class="eco-hint">${esc(t(HINT[base]))}</span>`;
      elHead.innerHTML = head;
      elMain.innerHTML = mode.main();
      if (base !== 'adaptation') drawQuiz();
      if (mode.after) mode.after();
      paintSay();
      if (S.run && base === 'population' && !raf) raf = requestAnimationFrame((n) => M.population.tick(n));
      if (fk) {
        const el = fk.startsWith('opt:') ? root.querySelector(`[data-opt="${fk.slice(4)}"]`) : Array.from(root.querySelectorAll('[data-key]')).find((x) => x.dataset.key === fk);
        if (el && el.focus) el.focus({ preventScroll: true });
      }
    }
    function activate(el) {
      if (destroyed) return;
      const opt = el.closest('[data-opt]');
      if (opt && root.contains(opt)) { const i = +opt.dataset.opt; if (base === 'adaptation') mode.opt(i); else onOption(i); return; }
      const k = el.closest('[data-key]');
      if (!k || !root.contains(k)) return;
      const key = k.dataset.key;
      if (key === 'answer') return;
      if (key === 'next') { nextQuestion(); return; }
      if (key !== 'reset' && !gate(key)) return;
      mode.act(key);
    }
    const onClick = (e) => activate(e.target);
    const onKey = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && !(e.target.tagName === 'BUTTON')) { e.preventDefault(); activate(e.target); }
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    if (window.ResizeObserver && (base === 'web' || base === 'cycle')) {
      ro = new ResizeObserver(() => {
        const w = root.getBoundingClientRect().width;
        const nw = w > 0 && w < 600;
        if (nw !== narrow) { narrow = nw; if (!S.busy) draw(); }
      });
      ro.observe(root);
    }
    narrow = root.getBoundingClientRect().width > 0 && root.getBoundingClientRect().width < 600;
    mode.init();
    draw();
    return {
      destroy() {
        destroyed = true; stopAnim(); clearTimers();
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey);
        if (ro) ro.disconnect();
      },
    };
  }

  // ---------------------------------------------------------------- styles (every class starts with eco-)
  const CSS = `
.eco{display:grid;gap:12px;max-width:980px;margin:0 auto;font-family:var(--font-body);color:var(--ink);min-width:0}
.eco *{box-sizing:border-box}
.eco button{font-family:inherit}
.eco-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.eco-badge{background:#15803D;color:#fff;border-radius:999px;padding:5px 15px;font:800 15px/1.3 var(--font-display)}
.eco-hint{flex:1 1 240px;font-size:14px;line-height:1.45;color:var(--ink-2)}
.eco-scene{position:relative;border-radius:20px;overflow:hidden;border:1px solid var(--line);box-shadow:0 8px 22px rgba(15,23,42,.1);isolation:isolate;min-width:0}
.eco-bg{position:absolute;inset:0;width:100%;height:100%;z-index:-1}
.eco-over{position:relative;padding:12px 10px 14px;min-width:0}
.eco-ic{display:block;flex:none}
.eco-count{display:inline-block;background:rgba(255,255,255,.92);color:#0F172A;padding:6px 13px;border-radius:999px;font:800 14px/1.2 var(--font-display);box-shadow:0 2px 6px rgba(15,23,42,.15)}
.eco-count small{font:600 12px var(--font-body);color:#475569}
.eco-sunb{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-width:64px;min-height:68px;padding:4px 8px;border:2px solid transparent;border-radius:18px;background:rgba(255,255,255,.55);color:#0F172A;cursor:pointer;font:700 12px var(--font-body)}
.eco-sunb:hover,.eco-sunb:focus-visible{background:rgba(255,255,255,.9);border-color:#F5B90A}
.eco-sunb.eco-on{background:#FFF3A8;border-color:#F5B90A;animation:eco-pulse 2.4s ease-in-out infinite}
.eco-chainrow{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 0}
.eco-chain{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:12px 0;flex:1;min-width:0}
.eco-chip{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;width:96px;margin-left:26px;padding:6px 4px 8px;background:rgba(255,255,255,.93);color:#0F172A;border-radius:16px;text-align:center;box-shadow:0 4px 10px rgba(15,23,42,.14)}
.eco-chip b{font:700 12.5px/1.2 var(--font-body)}
.eco-chip em{font:600 10.5px/1.2 var(--font-body);font-style:normal;color:#475569}
.eco-slot{background:rgba(255,255,255,.4);border:2px dashed rgba(15,23,42,.35);box-shadow:none;min-height:94px;justify-content:center}
.eco-q2{font:800 30px var(--font-display);color:rgba(15,23,42,.4)}
.eco-arrow{position:absolute;left:-25px;top:28px;width:24px;height:14px}
.eco-arrow::before{content:"";position:absolute;left:1px;right:8px;top:5.5px;height:3px;background:#0F172A;border-radius:2px}
.eco-arrow::after{content:"";position:absolute;right:0;top:0;border-left:9px solid #0F172A;border-top:7px solid transparent;border-bottom:7px solid transparent}
.eco-arrow.eco-flow::before{background:#F5B90A;height:4px;top:5px}.eco-arrow.eco-flow::after{border-left-color:#F5B90A}
.eco-glow{animation:eco-pulse 2.4s ease-in-out infinite}
.eco-rs .eco-arrow{left:50%;top:-17px;transform:translateX(-50%) rotate(90deg)}
.eco-en{display:block;width:100%;margin-top:5px}
.eco-en i{display:block;height:9px;width:var(--w);min-width:3px;background:linear-gradient(90deg,#FFD23F,#FF7A1A);border-radius:5px}
.eco-en span{display:block;font:800 12px var(--font-body);margin-top:2px}
.eco-grow{animation:eco-g .7s ease-out}
.eco-tray{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.eco-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:96px;padding:8px 4px 6px;background:var(--surface);color:var(--ink);border:2px solid var(--line);border-radius:16px;cursor:pointer;font:600 12.5px/1.2 var(--font-body);text-align:center;transition:transform .15s,box-shadow .15s,border-color .15s}
.eco-card:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(15,23,42,.14)}
.eco-card.eco-sel{border-color:var(--royal);box-shadow:0 0 0 3px var(--royal-t)}
.eco-card.eco-used{opacity:.45}
.eco-card.eco-nope{opacity:.7;border-style:dashed;border-color:var(--bad)}
.eco-tick{position:absolute;top:4px;right:6px;color:var(--good);font-weight:800}
.eco-tag{font-size:10.5px;color:var(--bad);font-weight:700}
.eco-bar{display:flex;flex-wrap:wrap;gap:8px}
.eco-btn{min-height:44px;padding:0 20px;border-radius:999px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:700 15px var(--font-body);cursor:pointer;transition:transform .12s,box-shadow .12s}
.eco-btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(15,23,42,.15)}
.eco-btn-main{background:#1D4ED8;border-color:#1D4ED8;color:#fff}
.eco-btn-ghost{background:transparent}
.eco-btn-soft{background:var(--royal-t);border-color:var(--royal-t)}
.eco-btn[aria-pressed="true"]{border-color:var(--royal);background:var(--royal-t)}
.eco-btn-main[aria-pressed="true"]{background:#1D4ED8;color:#fff}
.eco button:focus-visible,.eco [role="button"]:focus-visible{outline:3px solid var(--royal);outline-offset:2px}
.eco-say{padding:11px 15px;border-radius:14px;font-size:15px;line-height:1.5;background:var(--sunk);border-left:5px solid var(--line);color:var(--ink)}
.eco-say:empty{padding:0;border:0;min-height:0}
.eco-say-good{background:var(--good-t);border-left-color:var(--good)}
.eco-say-bad{background:var(--bad-t);border-left-color:var(--bad)}
.eco-say-info{background:var(--sunk)}
.eco-qz{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px;display:grid;gap:8px}
.eco-qz h3{margin:0;font:800 16px var(--font-display)}.eco-qz h3 small{font:600 12px var(--font-body);color:var(--ink-2)}
.eco-q{margin:0;font:600 16px/1.45 var(--font-body)}
.eco-opts{display:grid;gap:8px}
.eco-opt{min-height:48px;padding:10px 14px;text-align:left;border-radius:12px;border:2px solid var(--line);background:var(--sunk);color:var(--ink);font:600 15px/1.35 var(--font-body);cursor:pointer}
.eco-opt:hover{border-color:var(--royal)}
.eco-opt-bad{border-color:var(--bad);background:var(--bad-t);opacity:.75}
.eco-opt-good{border-color:var(--good);background:var(--good-t)}
.eco-qwhy{margin:0;font-size:14px;line-height:1.5;color:var(--ink-2);min-height:0}
.eco-webtop,.eco-pyrrow{display:flex;align-items:center;gap:12px}
.eco-main{display:grid;gap:12px;min-width:0}
.eco-web,.eco-cyc{display:block;width:100%;height:auto}
.eco-pyr{display:block;width:100%;max-width:560px;height:auto;margin:0 auto}
.eco-nt{font:700 12.5px var(--font-body);fill:#0F172A;paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}
.eco-lk{stroke:#0F172A;stroke-width:2.6;stroke-linecap:round}
.eco-draw{animation:eco-d .8s ease forwards}
.eco-dot{fill:#FFD23F;stroke:#B45309;stroke-width:1.6}
.eco-nd,.eco-band,.eco-cn2,.eco-sunsvg{cursor:pointer;outline:none}
.eco-nc,.eco-ring{fill:rgba(255,255,255,.92);stroke:#fff;stroke-width:2;transition:stroke .15s}
.eco-nd:hover .eco-nc{stroke:#93C5FD;stroke-width:4}
.eco-nd.eco-sel .eco-nc,.eco-nd:focus-visible .eco-nc{stroke:#1D4ED8;stroke-width:5}
.eco-nd.eco-gone{opacity:.35}.eco-x{stroke:#E5484D;stroke-width:5;stroke-linecap:round}
.eco-starve .eco-nc{stroke:#E5484D;stroke-width:5}.eco-stress .eco-nc{stroke:#FF7A1A;stroke-width:5}
.eco-nd.eco-glow .eco-nc{fill:#FFF3A8;stroke:#F5B90A;stroke-width:4}
.eco-band polygon{stroke:#fff;stroke-width:2.5;transition:filter .15s}
.eco-band:hover polygon,.eco-band:focus-visible polygon{filter:brightness(1.08)}
.eco-band.eco-target polygon{stroke:#1D4ED8;stroke-width:3.5;stroke-dasharray:7 5}
.eco-bq{font:800 28px var(--font-display);fill:rgba(15,23,42,.5)}.eco-bs{font:600 10px var(--font-body);fill:rgba(15,23,42,.75)}
.eco-bl{font:700 10px var(--font-body);fill:#334155;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
.eco-bn{font:800 12px var(--font-body);fill:#0F172A;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
.eco-be{font:800 13px var(--font-display);fill:#9A3412;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
.eco-ed{fill:none;stroke:#64748B;stroke-width:2.6;stroke-linecap:round}
.eco-ed.eco-vis{stroke:#15803D;stroke-width:3.6}
.eco-ed.eco-next{stroke:#FF7A1A;stroke-width:3.2;stroke-dasharray:7 6;animation:eco-dash 1s linear infinite}
.eco-cn2:hover .eco-ring{stroke:#93C5FD;stroke-width:4}
.eco-cn2.eco-here .eco-ring{stroke:#1D4ED8;stroke-width:5}
.eco-cn2.eco-reach .eco-ring{stroke:#FF7A1A;stroke-width:5;animation:eco-pulse 1.5s ease-in-out infinite}
.eco-cn2:focus-visible .eco-ring{stroke:#1D4ED8;stroke-width:6}
.eco-tok{fill:#FFD23F;stroke:#fff;stroke-width:2.5;filter:drop-shadow(0 0 6px #F5B90A)}
.eco-sunsvg:not(.eco-on){opacity:.6;filter:grayscale(.55)}
.eco-sunsvg:focus-visible{outline:3px solid #1D4ED8}
.eco-prog{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px 14px;font-size:14px}
.eco-prog b{font:800 16px var(--font-display)}
.eco-chips{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0}
.eco-chips li{padding:4px 11px;border-radius:999px;background:var(--sunk);color:var(--ink-2);font:600 13px var(--font-body)}
.eco-chips li.eco-got{background:var(--good-t);color:var(--ink)}
.eco-habtop{margin-bottom:6px}
.eco-hd{margin:6px 0 0;background:rgba(255,255,255,.9);color:#0F172A;border-radius:12px;padding:7px 11px;font-size:14px;line-height:1.4}
.eco-lvl{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:0;min-height:96px;align-items:flex-end}
.eco-lv{display:flex;flex-direction:column;align-items:center;width:78px;padding:4px 2px;background:rgba(255,255,255,.88);color:#0F172A;border-radius:14px;font:600 11.5px/1.2 var(--font-body);text-align:center}
.eco-big{display:flex;flex-direction:column;align-items:center;gap:2px;width:fit-content;max-width:100%;margin:22px auto;padding:14px 26px;background:rgba(255,255,255,.9);color:#0F172A;border-radius:24px;box-shadow:0 8px 20px rgba(15,23,42,.18);text-align:center}
.eco-big b{font:800 18px var(--font-display)}.eco-big em{font:600 13px var(--font-body);font-style:normal;color:#475569}
.eco-bins{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:6px}
.eco-bin{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 8px 12px;border-radius:20px;border:3px solid;background:rgba(255,255,255,.92);color:#0F172A;cursor:pointer;min-height:44px;transition:transform .15s}
.eco-bin:hover{transform:translateY(-2px)}
.eco-bin-green{border-color:#16A34A}.eco-bin-blue{border-color:#2563EB}
.eco-binsvg{width:96px;height:112px;overflow:visible}
.eco-bin b{font:800 14px/1.25 var(--font-display)}.eco-bin small{font:500 12px/1.3 var(--font-body);color:#334155;text-align:center}
.eco-binct{position:absolute;top:8px;right:10px;min-width:26px;padding:2px 8px;border-radius:999px;background:#0F172A;color:#fff;font:700 13px var(--font-body);text-align:center}
.eco-shake{animation:eco-shake .45s}
.eco-rot{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px 14px}
.eco-rot h3{margin:0 0 8px;font:800 15px var(--font-display)}
.eco-rot ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.eco-rot li{display:grid;grid-template-columns:minmax(120px,170px) 1fr minmax(90px,130px);gap:10px;align-items:center;font-size:13px}
.eco-rn{display:flex;align-items:center;gap:6px;font-weight:600}
.eco-rb{height:11px;background:var(--sunk);border-radius:6px;overflow:hidden}
.eco-rb i{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,#22C55E,#F5B90A,#E5484D);border-radius:6px;animation:eco-g .9s ease-out}
.eco-rt{color:var(--ink-2);font-weight:600}
.eco-popwrap{background:rgba(255,255,255,.93);border-radius:14px;padding:6px 4px}
.eco-chart{display:block;width:100%;height:auto}
.eco-gl{stroke:#CBD5E1;stroke-width:1}.eco-g1{stroke:#94A3B8;stroke-dasharray:4 4}
.eco-gt{font:600 10px var(--font-body);fill:#475569}
.eco-bandg{fill:#22C55E;opacity:.14}
.eco-pl{fill:none;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.eco-pms{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.eco-pm{display:grid;gap:5px}
.eco-pm .eco-card{min-height:88px}
.eco-meter{height:12px;background:var(--sunk);border:1px solid var(--line);border-radius:7px;overflow:hidden}
.eco-meter i{display:block;height:100%;background:var(--c);border-radius:6px;transition:width .15s}
.eco-lvlt{text-align:center;color:var(--ink-2);font-weight:700;font-size:12.5px}
.eco-pop{animation:eco-pop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes eco-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes eco-g{from{width:0}}
@keyframes eco-d{from{stroke-dasharray:400;stroke-dashoffset:400}to{stroke-dasharray:400;stroke-dashoffset:0}}
@keyframes eco-dash{to{stroke-dashoffset:-26}}
@keyframes eco-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.18) drop-shadow(0 0 7px #F5B90A)}}
@keyframes eco-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
@media (max-width:520px){
  .eco-chip{width:88px;margin-left:24px}
  .eco-rot li{grid-template-columns:1fr;gap:3px}
  .eco-binsvg{width:80px;height:94px}
  .eco-tray{grid-template-columns:repeat(auto-fill,minmax(84px,1fr))}
  .eco-card{font-size:12px}
}
@media (prefers-reduced-motion:reduce){.eco *{animation:none!important;transition:none!important}}
`;

  // ---------------------------------------------------------------- registration
  const lastKeys = (list, extra) => list.concat(extra);
  NCA_T.register({
    id: 'eco',
    css: CSS,
    validate(c) { return plan(c).e; },
    keys(c) {
      let r;
      try { r = plan(c); } catch (err) { return { targets: [], events: [] }; }
      const p = r.p;
      if (!p.base) return { targets: [], events: [] };
      const b = p.base;
      const cards = b === 'cycle' ? (CYC[p.sub] ? CYC[p.sub].nodes.map((n) => 'card:' + n.id) : []) : p.ids.map((id) => 'card:' + id);
      const ans = ['answered:right', 'answered:wrong'];
      const picked = 'picked:*';
      let targets, events;
      if (b === 'chain') { targets = cards.concat(['link', 'sun', 'play', 'answer', 'reset']); events = ['linked', 'energy', picked].concat(ans); }
      else if (b === 'web') { targets = cards.concat(['link', 'sun', 'play', 'answer', 'whatif', 'reset']); events = ['linked', 'energy', picked].concat(ans); }
      else if (b === 'pyramid') { targets = cards.concat(p.ids.map((_, i) => 'level:' + (i + 1)), ['sun', 'play', 'answer', 'reset']); events = ['linked', 'sorted', 'energy', picked].concat(ans); }
      else if (b === 'cycle') { const cy = CYC[p.sub]; targets = cards.concat(cy && cy.needsSun ? ['sun'] : [], ['play', 'answer', 'reset']); events = ['linked', 'cycle-done', picked].concat(cy && cy.needsSun ? ['energy'] : [], ans); }
      else if (b === 'habitat') { targets = cards.concat(['link', 'answer', 'reset']); events = ['sorted', picked].concat(ans); }
      else if (b === 'adaptation') { targets = cards.concat(['answer', 'reset']); events = ['sorted', picked].concat(ans); }
      else if (b === 'waste') { targets = cards.concat(['bin:green', 'bin:blue', 'play', 'answer', 'reset']); events = ['sorted', picked].concat(ans); }
      else { targets = cards.concat(['play', 'popmode', 'answer', 'reset']); events = ['balanced', picked].concat(ans); }
      return { targets, events };
    },
    demo: { mode: 'web', habitat: 'pond', organisms: ['algae', 'lotus', 'zooplankton', 'tadpole', 'waterbug', 'rohu', 'catla', 'frog', 'heron'] },
    organisms: ORG_IDS,
    habitats: HABS,
    // The pure data and rules, for tests under Node.
    model: { ORG, CYC, WASTE, ADAPT, DEF, HAB, chainOrder, webLevels, webLinks, commonHabs, plan, buildQuiz, popStep, POP, energyAt, ART, WART, NODE, SCENE },
    iconSVG: (id, px) => iconSvg(id, px || 64),
    mount(root, config, api) { return eco(root, config, api); },
  });
})();
