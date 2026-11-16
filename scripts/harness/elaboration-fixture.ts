// The harness's Elaboration Framework answers (founder, 16 Nov 2026), for a real Class 3 Mathematics chapter ("Fair Share",
// reader/content/c03/mathematics). The model's own line is written out here (the harness calls no model); everything after it
// is the app's real code: the block is read by parseBlockLine, the five pictures and the lead level are chosen by withPics from
// the chapter's own diagrams, and the events are what the stream carries. Prints { en, hi } NDJSON. Run by family.mjs.
import { parseBlockLine } from "../../src/lib/family/blocks";
import { withPics } from "../../src/lib/family/elaboration-pics";
import { fillElaboration } from "../../src/lib/family/visuals/elab-fill";
import { chapterDiagrams } from "../../src/lib/family/tutor-context";
import { readFileSync } from "node:fs";
import { intentLine, intentOf } from "../../src/lib/family/intent";
import { matchSim, simRowsFromCsv } from "../../src/lib/family/curated-sims";
import { videoQuery } from "../../src/lib/family/videos";


const KEY = "u.c03.mathematics.cemm1.ch08";
const CLASS = 3;

const LINES = {
  en: {
    question: "What are equal fractions?",
    line: {
      type: "elaboration",
      term: "Equal fractions",
      icon: "🫓",
      definition: {
        text: "Equal fractions are different names for the same part of a whole.",
        say: "Equal fractions are different names for the same part of a whole.",
      },
      levels: {
        basic:
          "Half a roti and two quarters of a roti are the same amount of roti.",
        intermediate:
          "When we cut each half again, 1/2 becomes 2/4. We multiplied the top and the bottom by 2, so the amount did not change.",
        advanced:
          "Multiplying the top and the bottom by the same number gives an equal fraction: 1/2 = 2/4 = 3/6. They are all one number written in different ways.",
        say: "Basic: half a roti and two quarters are the same. Intermediate: multiply the top and the bottom by the same number. Advanced: one half, two quarters and three sixths are one number.",
      },
      real_life: {
        text: "At the sweet shop, half a kilo of laddoos weighs the same as two packets of a quarter kilo. Different packets, same amount.",
        say: "At the sweet shop, half a kilo of laddoos is the same as two quarter kilo packets.",
        icon: "🛒",
      },
      try_it: {
        question: "Priya eats 2/4 of a roti and Rohan eats 1/2. Who ate more?",
        right: "Two quarters make one half, so they ate the same.",
        hint: "Draw the roti and cut each half into two. Count the quarters.",
        say: "Priya eats two quarters and Rohan eats one half. Who ate more?",
      },
      future: {
        text: "Equal fractions help you add and compare fractions, read ratios and percentages, and later measure in science labs.",
        say: "Equal fractions help you add fractions, read percentages and measure in science.",
        icon: "🚀",
      },
      checks: [
        { question: "Which fraction is equal to 1/2?", options: ["1/3", "2/4", "3/5"], answer: 1, right: "2/4 is 1/2 written another way.", hint: "Multiply the top and the bottom of 1/2 by 2." },
      ],
    },
  },
  hi: {
    question: "बराबर भिन्न क्या होते हैं?",
    line: {
      type: "elaboration",
      term: "बराबर भिन्न",
      icon: "🫓",
      definition: {
        text: "बराबर भिन्न एक ही हिस्से के अलग-अलग नाम हैं।",
        say: "बराबर भिन्न एक ही हिस्से के अलग-अलग नाम हैं।",
      },
      levels: {
        basic: "आधी रोटी और चौथाई की दो रोटियाँ बराबर होती हैं।",
        intermediate:
          "हर आधे को फिर काटें तो 1/2 बनता है 2/4। हमने ऊपर और नीचे दोनों को 2 से गुणा किया, इसलिए मात्रा नहीं बदली।",
        advanced:
          "ऊपर और नीचे को एक ही संख्या से गुणा करने पर बराबर भिन्न मिलता है: 1/2 = 2/4 = 3/6। ये सब एक ही संख्या के अलग रूप हैं।",
        say: "आसान: आधी रोटी और दो चौथाई एक जैसे हैं। बीच का: ऊपर और नीचे को एक ही संख्या से गुणा करो। आगे का: आधा, दो चौथाई और तीन छठे एक ही संख्या हैं।",
      },
      real_life: {
        text: "मिठाई की दुकान पर आधा किलो लड्डू और पाव-पाव किलो के दो डिब्बे बराबर तौलते हैं। डिब्बे अलग, मात्रा वही।",
        say: "मिठाई की दुकान पर आधा किलो लड्डू और पाव-पाव किलो के दो डिब्बे बराबर होते हैं।",
        icon: "🛒",
      },
      try_it: {
        question: "प्रिया 2/4 रोटी खाती है और रोहन 1/2। किसने ज़्यादा खाई?",
        right: "दो चौथाई मिलकर एक आधा बनते हैं, इसलिए दोनों ने बराबर खाई।",
        hint: "रोटी बनाकर हर आधे के दो टुकड़े करो और चौथाई गिनो।",
        say: "प्रिया दो चौथाई खाती है और रोहन एक आधा। किसने ज़्यादा खाई?",
      },
      future: {
        text: "बराबर भिन्न से आप भिन्न जोड़ना और तुलना करना, प्रतिशत पढ़ना और आगे विज्ञान में नापना सीखेंगे।",
        say: "बराबर भिन्न से आप भिन्न जोड़ना, प्रतिशत पढ़ना और विज्ञान में नापना सीखेंगे।",
        icon: "🚀",
      },
      checks: [
        { question: "1/2 के बराबर कौन-सा भिन्न है?", options: ["1/3", "2/4", "3/5"], answer: 1, right: "2/4 वही 1/2 है, दूसरे रूप में।", hint: "1/2 के ऊपर और नीचे दोनों को 2 से गुणा करो।" },
      ],
    },
  },
  // The founder's live test question (16 Nov 2026): the model's own line, then the app's real code, with the pictures
  // found live (keyless sources: Commons, NASA, iNaturalist, Openverse).
  photo: {
    question: "how photosynthesis work and why trees die",
    line: {
      type: "elaboration",
      term: "Photosynthesis and why trees die",
      icon: "🌳",
      definition: { text: "Photosynthesis is how green plants use sunlight, water and air to make their own food.", say: "Photosynthesis is how green plants use sunlight, water and air to make their own food.", q: "green leaf sunlight" },
      levels: {
        basic: "A leaf catches sunlight and uses it to make food for the tree.",
        intermediate: "Leaves take in carbon dioxide from the air and roots take in water. Chlorophyll uses sunlight to turn them into glucose and oxygen.",
        advanced: "6CO2 + 6H2O + light gives C6H12O6 + 6O2. Light reactions in the thylakoids make ATP; the Calvin cycle in the stroma builds glucose.",
        say: "Basic: a leaf catches sunlight to make food. Intermediate: leaves take in air and roots take in water, and chlorophyll makes glucose and oxygen. Advanced: six carbon dioxide plus six water plus light gives glucose and six oxygen.",
        q: "chlorophyll leaf cells",
      },
      real_life: { text: "The big tree outside your school gives shade and fresh air because its leaves are busy making food in the sun.", say: "The big tree outside your school gives shade and fresh air because its leaves make food in the sun.", icon: "🏫", q: "banyan tree village" },
      try_it: { question: "Keep one potted plant in the sun and one in a dark cupboard for a week. What do you think happens to the leaves?", right: "The leaves in the cupboard turn pale and weak, because without light the plant cannot make food.", hint: "Think about what the leaf needs to make its food.", say: "Keep one potted plant in sun and one in a dark cupboard. What happens to the leaves?", q: "wilted plant leaves" },
      future: { text: "Trees die when they lose water, light or healthy roots, and protecting forests keeps our air clean and our climate steady.", say: "Trees die when they lose water, light or healthy roots, and protecting forests keeps our air clean.", icon: "🌍", q: "dead tree drought" },
      checks: [
        { question: "What do leaves use to make food?", options: ["Sunlight, water and air", "Only soil", "Only wind"], answer: 0, right: "Leaves use sunlight, water and carbon dioxide.", hint: "Think of the three things in the first line." },
        { question: "Which gas does a tree give out in photosynthesis?", options: ["Oxygen", "Smoke", "Nitrogen"], answer: 0, right: "Trees give out oxygen.", hint: "It is the gas we breathe in." },
      ],
    },
  },
  photoHi: {
    question: "प्रकाश संश्लेषण कैसे होता है और पेड़ क्यों मर जाते हैं",
    line: {
      type: "elaboration",
      term: "प्रकाश संश्लेषण और पेड़ों का मरना",
      icon: "🌳",
      definition: { text: "प्रकाश संश्लेषण वह तरीका है जिससे हरे पौधे धूप, पानी और हवा से अपना खाना बनाते हैं।", say: "प्रकाश संश्लेषण वह तरीका है जिससे हरे पौधे धूप, पानी और हवा से अपना खाना बनाते हैं।", q: "green leaf sunlight" },
      levels: {
        basic: "पत्ती धूप पकड़कर पेड़ के लिए खाना बनाती है।",
        intermediate: "पत्तियाँ हवा से कार्बन डाइऑक्साइड और जड़ें मिट्टी से पानी लेती हैं। क्लोरोफ़िल धूप की मदद से इनसे ग्लूकोज़ और ऑक्सीजन बनाता है।",
        advanced: "6CO2 + 6H2O + प्रकाश से C6H12O6 + 6O2 बनता है। प्रकाश अभिक्रिया में ATP बनता है और केल्विन चक्र में ग्लूकोज़।",
        say: "आसान: पत्ती धूप से खाना बनाती है। बीच का: पत्तियाँ हवा और जड़ें पानी लेती हैं, क्लोरोफ़िल ग्लूकोज़ बनाता है। आगे का: छह कार्बन डाइऑक्साइड और छह पानी प्रकाश में ग्लूकोज़ और ऑक्सीजन बनाते हैं।",
        q: "chlorophyll leaf cells",
      },
      real_life: { text: "स्कूल के बाहर का बड़ा पेड़ छाया और ताज़ी हवा देता है, क्योंकि उसकी पत्तियाँ धूप में खाना बनाने में लगी रहती हैं।", say: "स्कूल के बाहर का बड़ा पेड़ छाया और ताज़ी हवा देता है।", icon: "🏫", q: "big tree school" },
      try_it: { question: "एक गमले का पौधा धूप में और एक अँधेरी अलमारी में एक हफ़्ते रखो। पत्तियों का क्या होगा?", right: "अलमारी वाली पत्तियाँ पीली और कमज़ोर हो जाती हैं, क्योंकि धूप के बिना खाना नहीं बनता।", hint: "सोचो कि पत्ती को खाना बनाने के लिए क्या चाहिए।", say: "एक पौधा धूप में और एक अलमारी में रखो। पत्तियों का क्या होगा?" },
      future: { text: "पेड़ तब मरते हैं जब उन्हें पानी, धूप या स्वस्थ जड़ें नहीं मिलतीं। जंगल बचाने से हवा साफ़ रहती है।", say: "पेड़ पानी, धूप या स्वस्थ जड़ों के बिना मर जाते हैं। जंगल बचाओ।", icon: "🌍", q: "dead tree drought" },
      checks: [
        { question: "पत्तियाँ खाना बनाने के लिए क्या इस्तेमाल करती हैं?", options: ["धूप, पानी और हवा", "सिर्फ़ मिट्टी", "सिर्फ़ हवा का झोंका"], answer: 0, right: "पत्तियाँ धूप, पानी और कार्बन डाइऑक्साइड इस्तेमाल करती हैं।", hint: "तीन चीज़ें सोचो जो पौधे को चाहिए।" },
      ],
    },
  },

  // The intent proof (16 Nov 2026): a Class 3 child typed "Kachra prabandhan" (Hindi in Roman letters). The tutor answers in Hindi and names the
  // topic itself (topic_en, topic_local); the app's real code makes the topic key, the video queries, the photos and the simulation.
  intent: {
    question: "Kachra prabandhan",
    line: {
      type: "elaboration",
      term: "कचरा प्रबंधन",
      topic_en: "waste management",
      topic_local: "कचरा प्रबंधन",
      icon: "♻️",
      definition: { text: "कचरा प्रबंधन का मतलब है कचरे को सही तरह से इकट्ठा करना, अलग करना और दोबारा काम में लाना।", say: "कचरा प्रबंधन का मतलब है कचरे को सही तरह से इकट्ठा करना, अलग करना और दोबारा काम में लाना।", q: "waste segregation bins" },
      levels: {
        basic: "हम गीला और सूखा कचरा अलग-अलग डिब्बों में डालते हैं।",
        intermediate: "गीले कचरे से खाद बनती है और सूखे कचरे से प्लास्टिक और कागज़ दोबारा इस्तेमाल होते हैं। इससे शहर साफ़ रहता है और बीमारियाँ कम फैलती हैं।",
        advanced: "कचरा प्रबंधन में चार कदम हैं: इकट्ठा करना, अलग करना, दोबारा इस्तेमाल या रीसायकल करना और बचे हुए कचरे को सुरक्षित जगह डालना।",
        say: "आसान: गीला और सूखा कचरा अलग डिब्बों में डालो। बीच का: गीले से खाद बनती है और सूखा दोबारा इस्तेमाल होता है। आगे का: इकट्ठा करो, अलग करो, रीसायकल करो और बचा कचरा सुरक्षित डालो।",
        q: "recycling plastic paper",
      },
      real_life: { text: "सुबह कचरे वाली गाड़ी आती है तो हम हरे और नीले डिब्बे का कचरा अलग-अलग देते हैं।", say: "सुबह कचरे वाली गाड़ी आती है तो हम हरे और नीले डिब्बे का कचरा अलग-अलग देते हैं।", icon: "🚛", q: "garbage truck india" },
      try_it: { question: "तुम्हारे घर में आज कौन-कौन सा कचरा निकला? उसे गीले और सूखे में बाँटो।", right: "सब्ज़ी के छिलके गीले कचरे में और पुराना कागज़ सूखे कचरे में जाता है।", hint: "सोचो, कौन-सा कचरा सड़ जाता है?", say: "तुम्हारे घर में आज कौन-कौन सा कचरा निकला? उसे गीले और सूखे में बाँटो।", q: "compost kitchen waste" },
      future: { text: "आगे चलकर तुम पर्यावरण विज्ञान में प्रदूषण रोकना और रीसायकल करना सीखोगे।", say: "आगे चलकर तुम पर्यावरण विज्ञान में प्रदूषण रोकना और रीसायकल करना सीखोगे।", icon: "🌍", q: "recycling symbol" },
      checks: [{ question: "सब्ज़ी के छिलके किस कचरे में जाते हैं?", options: ["गीले कचरे में", "सूखे कचरे में"], answer: 0, right: "छिलके गीले कचरे में जाते हैं।", hint: "कौन-सा कचरा सड़ जाता है?" }],
    },
  },
  // A topic with an approved simulation: Class 3 fractions (PhET, from the seeded table's file), to show the tap-to-load card.
  simfrac: {
    question: "bhinn kya hota hai",
    line: {
      type: "elaboration",
      term: "भिन्न",
      topic_en: "fractions",
      topic_local: "भिन्न",
      icon: "🫓",
      definition: { text: "भिन्न किसी पूरी चीज़ का एक हिस्सा बताती है।", say: "भिन्न किसी पूरी चीज़ का एक हिस्सा बताती है।", q: "fraction roti" },
      levels: { basic: "आधी रोटी का मतलब है एक बटा दो।", intermediate: "नीचे की संख्या बताती है कि पूरा कितने बराबर हिस्सों में बँटा है, और ऊपर की संख्या कि हमारे पास कितने हिस्से हैं।", advanced: "भिन्न a/b में b शून्य नहीं हो सकता, क्योंकि शून्य हिस्सों में बाँटना संभव नहीं।", say: "आसान: आधी रोटी एक बटा दो है। बीच का: नीचे वाली संख्या कुल हिस्से बताती है। आगे का: b शून्य नहीं हो सकता।", q: "fraction pie" },
      real_life: { text: "पिज़्ज़ा के आठ टुकड़ों में से तीन खाओ तो तुमने तीन बटा आठ खाया।", say: "पिज़्ज़ा के आठ टुकड़ों में से तीन खाओ तो तुमने तीन बटा आठ खाया।", icon: "🍕", q: "pizza slices" },
      try_it: { question: "एक चॉकलेट के चार बराबर टुकड़े हैं। दो खाओ तो कितना भाग खाया?", right: "दो बटा चार, यानी आधा।", hint: "कुल टुकड़े नीचे और खाए हुए ऊपर लिखो।", say: "एक चॉकलेट के चार बराबर टुकड़े हैं। दो खाओ तो कितना भाग खाया?", q: "chocolate bar pieces" },
      future: { text: "भिन्न से आगे दशमलव और प्रतिशत सीखना आसान हो जाता है।", say: "भिन्न से आगे दशमलव और प्रतिशत सीखना आसान हो जाता है।", icon: "🚀", q: "percentage chart" },
      checks: [{ question: "आधा को किस भिन्न से लिखते हैं?", options: ["1/2", "2/1"], answer: 0, right: "आधा = 1/2।", hint: "ऊपर एक हिस्सा, नीचे दो हिस्से।" }],
    },
  },
  simfracEn: {
    question: "Why must the parts of a fraction be equal?",
    line: {
      type: "elaboration",
      term: "Fractions",
      topic_en: "fractions",
      topic_local: null,
      icon: "🫓",
      definition: { text: "A fraction names one equal part of a whole, so the parts must all be the same size.", say: "A fraction names one equal part of a whole, so the parts must all be the same size.", q: "fraction roti" },
      levels: {
        basic: "If a roti is cut into two unequal pieces, 'half' would not be fair.",
        intermediate: "The bottom number tells how many equal parts the whole is cut into. If the parts are not equal, the top number cannot say how much we have, because one part could be big and another small. So we first cut the whole into equal parts, then count the parts we take.",
        advanced: "A fraction a/b is defined as a parts out of b equal parts of one whole. Equal parts are what let us compare fractions, add them and place them on a number line, because every part then measures the same amount.",
        say: "Basic: unequal pieces are not fair. Intermediate: the bottom number counts equal parts. Advanced: equal parts let us compare and add fractions.",
        q: "fraction pie",
      },
      real_life: { text: "When three friends share a pizza, each must get an equal slice, or one friend gets more.", say: "When three friends share a pizza, each must get an equal slice.", icon: "🍕", q: "pizza slices" },
      try_it: { question: "Cut a paper into 4 parts, but make them unequal. Can you call one part a quarter?", right: "No. A quarter needs four equal parts.", hint: "Fold the paper in half, then in half again.", say: "Cut a paper into four unequal parts. Can you call one a quarter?", q: "paper fold" },
      future: { text: "Equal parts help you later with decimals, percentages and ratios.", say: "Equal parts help you later with decimals and percentages.", icon: "🚀", q: "percentage chart" },
      checks: [{ question: "Why do we cut a roti into equal parts for a fraction?", options: ["So each part is the same size", "So it looks nice"], answer: 0, right: "Equal parts make each fraction mean the same amount.", hint: "Think of sharing fairly." }],
    },
  },
} as const;

async function build(lang: "en" | "hi" | "photo" | "photoHi" | "intent" | "simfrac" | "simfracEn") {
  const { question, line } = LINES[lang];
  const parsed = parseBlockLine(JSON.stringify(line));
  if (parsed?.type !== "elaboration")
    throw new Error(
      `harness: the ${lang} elaboration line was refused by the block checker`,
    );
  const built = withPics(
    parsed,
    lang === "en" || lang === "hi" ? await chapterDiagrams(KEY, lang) : [],
    question,
    CLASS,
  );
  const block =
    lang === "en" || lang === "hi"
      ? built
      : await fillElaboration(built, { subject: lang === "simfrac" || lang === "simfracEn" ? "mathematics" : "science" });
  // The app's own intent step and match: the key and queries printed for the report, the simulation from the seed file.
  const child = { classLevel: CLASS, firstName: "Aarav", language: "hi" } as never;
  const intent = intentOf({ question, child, subject: lang === "simfrac" || lang === "simfracEn" ? "mathematics" : "evs", replyLang: lang === "simfracEn" ? "en" : "hinglish", model: block.topic ? { en: block.topic.en, local: block.topic.local } : null });
  const topicLine = intentLine(intent);
  const sim =
    lang === "intent" || lang === "simfrac" || lang === "simfracEn"
      ? matchSim(simRowsFromCsv(readFileSync(new URL("../seed/curated_sims.csv", import.meta.url), "utf8")).rows.filter((r) => r.language === "hi" || r.language === "en"), { subject: intent.subject, term: block.term, topicEn: block.topic?.en }, { classLevel: CLASS })
      : null;
  if (sim) (block as unknown as Record<string, unknown>).sim = sim;
  const videos =
    lang === "intent" && topicLine
      ? { type: "videos", topicKey: topicLine.key, lang: "hi", items: [{ videoId: "dQw4w9WgXcQ", title: "कचरा प्रबंधन क्या है (harness stand-in)", channel: "Harness", seconds: 420 }, { videoId: "9bZkp7q19f0", title: "Waste Management for kids (harness stand-in)", channel: "Harness", seconds: 360 }] }
      : null;
  const events = [
    {
      t: "meta",
      label: "ai_made",
      cached: false,
      title: null,
      subject: "mathematics",
      topicKey: null,
    },
    { t: "block", block },
    ...(videos ? [{ t: "block", block: videos }] : []),
    { t: "done", complete: true, missing: [], cut: false },
  ];
  return {
    question,
    body: events.map((e) => `${JSON.stringify(e)}\n`).join(""),
    diagrams: block.pics.filter((p) => p?.kind === "diagram").length,
    proof: { key: topicLine?.key ?? null, queryHi: topicLine ? videoQuery(topicLine, { classLevel: CLASS, language: "hi" }, "hi") : null, queryEn: topicLine ? videoQuery(topicLine, { classLevel: CLASS, language: "hi" }, "en") : null, sim: sim ? sim.title : null, photos: block.pics.filter((p) => p?.kind === "photo").length },
  };
}

void (async () => {
  process.stdout.write(
    JSON.stringify({ en: await build("en"), hi: await build("hi"), photo: await build("photo"), photoHi: await build("photoHi"), intent: await build("intent"), simfrac: await build("simfrac"), simfracEn: await build("simfracEn") }),
  );
})();
