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
import { nameFiller } from "../../src/lib/family/name-token";


// The visual sources print a summary line with console.log; the harness reads stdout as JSON, so logs go to stderr.
console.log = console.error;
console.info = console.error;

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


// ---- Prompt v21 proofs (16 Nov 2026): the model's v21 line (extras, q3d, {{name}}, 2 to 5 questions, full steps) written by hand, then
// the app's own parser, picture fill (live keyless sources, real 3D and animation lookup), the server's name swap and the sim match.
type V21 = {
  question: string; classLevel: number; subject: string; replyLang: "hi" | "en" | "hinglish"; name: string; sim: boolean; simSource?: string; videos?: "hi" | "en";
  line: Record<string, unknown>;
};
const chk = (question: string, options: string[], answer: number, right: string, hint: string) => ({ question, options, answer, right, hint });

const V21S: Record<string, V21> = {
  // 1. Harshit, Class 5, Hindi: the energy question, with the PhET simulation and two videos.
  harshit: {
    question: "ऊर्जा — वस्तुएँ कैसे कार्य करती हैं?", classLevel: 5, subject: "science", replyLang: "hi", name: "Harshit", sim: true, videos: "hi",
    line: {
      type: "elaboration", term: "ऊर्जा", topic_en: "energy", topic_local: "ऊर्जा", icon: "⚡",
      definition: { text: "ऊर्जा वह शक्ति है जिससे कोई भी काम होता है। जब पंखा घूमता है, बल्ब जलता है या साइकिल चलती है, तब ऊर्जा काम कर रही होती है। ऊर्जा दिखती नहीं, पर उसका असर हम हर जगह देखते हैं। {{name}}, बिना ऊर्जा के कोई भी वस्तु कुछ नहीं कर सकती।", say: "ऊर्जा वह शक्ति है जिससे कोई भी काम होता है। पंखा, बल्ब और साइकिल सब ऊर्जा से चलते हैं।", q: "energy electricity light bulb" },
      levels: {
        basic: "ऊर्जा कई रूपों में मिलती है: गर्मी, रोशनी, बिजली, आवाज़ और गति। सूरज हमें गर्मी और रोशनी देता है, जिससे दिन में कपड़े सूखते हैं और पौधे खाना बनाते हैं। बैटरी में बिजली की ऊर्जा जमा रहती है, जिससे टॉर्च जलती है। खाना खाने से हमारे शरीर को ऊर्जा मिलती है और हम दौड़-भाग कर पाते हैं।",
        intermediate: "ऊर्जा एक रूप से दूसरे रूप में बदलती रहती है। रसोई में गैस का चूल्हा जलाने पर रासायनिक ऊर्जा गर्मी बन जाती है। मिक्सर में बिजली की ऊर्जा घूमने की ऊर्जा बन जाती है। हर बदलाव में ऊर्जा नष्ट नहीं होती, बस रूप बदल लेती है।",
        advanced: "ऊर्जा न बनाई जा सकती है, न नष्ट की जा सकती है; वह सिर्फ़ एक रूप से दूसरे रूप में बदलती है। इसीलिए पंखा चलने पर थोड़ी गर्मी भी निकलती है और उसकी मोटर छूने पर गर्म लगती है।",
        say: "आसान: ऊर्जा के कई रूप हैं, जैसे गर्मी, रोशनी और बिजली। बीच का: ऊर्जा एक रूप से दूसरे में बदलती है। आगे का: ऊर्जा नष्ट नहीं होती, सिर्फ़ रूप बदलती है।",
        q: "forms of energy sun heat light",
      },
      real_life: { text: "गर्मी की छुट्टियों में जब तुम साइकिल चलाते हो तो खाने की ऊर्जा तुम्हारी टाँगों में गति बन जाती है। साइकिल की डायनमो वाली बत्ती में यही गति रोशनी में बदल जाती है। इसी तरह पवनचक्की में हवा की गति बिजली बनाती है। हमारे आसपास हर चलती चीज़ के पीछे कोई ऊर्जा होती है।", say: "साइकिल चलाने पर खाने की ऊर्जा गति बनती है और डायनमो की बत्ती जलती है।", icon: "🚲", q: "cycle dynamo light india" },
      try_it: { question: "घर में दो चीज़ें ढूँढो जो बिजली से चलती हैं। बताओ, बिजली की ऊर्जा किसमें बदलती है: रोशनी, गर्मी या गति?", right: "पंखे में बिजली गति बनती है, बल्ब में रोशनी और प्रेस में गर्मी।", hint: "चीज़ को चलते हुए देखो और सोचो कि वह क्या कर रही है।", say: "घर में बिजली से चलने वाली दो चीज़ें ढूँढो और बताओ ऊर्जा किसमें बदलती है।", q: "electric fan iron india" },
      future: { text: "आगे चलकर तुम पढ़ोगे कि कोयला, पेट्रोल, सूरज और हवा ऊर्जा के स्रोत हैं। कुछ स्रोत खत्म हो जाते हैं और कुछ बार-बार मिलते रहते हैं। इसलिए बिजली बचाना और सौर ऊर्जा अपनाना समझदारी है। यही ऊर्जा बचाना कल को सुरक्षित बनाता है।", say: "आगे तुम ऊर्जा के स्रोत पढ़ोगे। बिजली बचाओ और सौर ऊर्जा अपनाओ।", icon: "☀️", q: "solar panel village india" },
      extras: { home: "टॉर्च में सेल उलटा लगाकर देखो, बल्ब क्यों नहीं जलता? फिर सीधा लगाओ और बिजली का रास्ता पूरा होते देखो।", fact: "सूरज की जितनी ऊर्जा धरती पर एक घंटे में आती है, उतनी पूरी दुनिया एक साल में इस्तेमाल करती है।", india: "राजस्थान के भड़ला सोलर पार्क में लाखों पैनल सूरज की ऊर्जा से बिजली बनाते हैं।", trick: "याद रखो: ऊर्जा बदलती है, खोती नहीं। \"रूप बदले, रंग न खोए।\"", whatif: "अगर एक दिन सारी बिजली चली जाए तो तुम्हारा घर कैसे चलेगा?" },
      q3d: ["light bulb", "wind turbine", "bicycle", "solar panel", "battery"],
      checks: [
        chk("ऊर्जा क्या करती है?", ["कोई भी काम कराती है", "सिर्फ़ रोशनी देती है", "कुछ नहीं करती"], 0, "ऊर्जा से हर तरह का काम होता है।", "पहले चरण को फिर पढ़ो।"),
        chk("बल्ब में बिजली की ऊर्जा किसमें बदलती है?", ["रोशनी में", "आवाज़ में", "पानी में"], 0, "बल्ब बिजली को रोशनी में बदलता है।", "बल्ब जलने पर क्या दिखता है?"),
        chk("पंखा चलाने में कौन-सी ऊर्जा काम आती है?", ["बिजली की", "पानी की", "मिट्टी की"], 0, "पंखा बिजली की ऊर्जा से घूमता है।", "पंखे में तार कहाँ से आता है?"),
        chk("ऊर्जा के बारे में कौन-सी बात सही है?", ["वह सिर्फ़ रूप बदलती है", "वह खत्म हो जाती है", "वह बनाई जा सकती है"], 0, "ऊर्जा नष्ट नहीं होती, रूप बदलती है।", "तीसरे स्तर को देखो।"),
        chk("सौर ऊर्जा कहाँ से मिलती है?", ["सूरज से", "चाँद से", "कोयले से"], 0, "सौर ऊर्जा सूरज से आती है।", "सौर यानी सूरज का।"),
      ],
    },
  },
  // 2a. A Hinglish question, Class 4: the tutor answers in Hindi.
  hinglish4: {
    question: "pani ka chakra kaise chalta hai", classLevel: 4, subject: "science", replyLang: "hinglish", name: "Ananya", sim: false,
    line: {
      type: "elaboration", term: "जल चक्र", topic_en: "water cycle", topic_local: "जल चक्र", icon: "💧",
      definition: { text: "जल चक्र वह रास्ता है जिसमें पानी बार-बार समुद्र से बादल, बादल से बारिश और फिर नदी में पहुँचता है। {{name}}, यही कारण है कि धरती पर पानी कभी खत्म नहीं होता। यह चक्र सूरज की गर्मी से चलता है।", say: "जल चक्र में पानी समुद्र से बादल और बादल से बारिश बनकर लौटता है।", q: "water cycle" },
      levels: {
        basic: "सूरज की गर्मी से समुद्र, नदी और तालाब का पानी भाप बनकर ऊपर उठता है। इसे वाष्पीकरण कहते हैं। गीले कपड़े धूप में सूखते हैं, वह भी यही है। भाप हवा में मिल जाती है और दिखाई नहीं देती।",
        intermediate: "ऊपर ठंडी हवा में भाप ठंडी होकर पानी की छोटी बूँदें बन जाती है और बादल बनते हैं। इसे संघनन कहते हैं। जैसे ठंडे गिलास के बाहर पानी की बूँदें जम जाती हैं।",
        advanced: "जब बादलों की बूँदें भारी हो जाती हैं तो बारिश, ओले या बर्फ़ बनकर गिरती हैं। यह पानी नदियों में बहकर फिर समुद्र में पहुँचता है और चक्र दोबारा शुरू होता है।",
        say: "आसान: सूरज पानी को भाप बनाता है। बीच का: भाप ठंडी होकर बादल बनती है। आगे का: बादल से बारिश गिरती है और चक्र चलता रहता है।",
        q: "evaporation sun lake",
      },
      real_life: { text: "बरसात में जब हमारे गाँव के तालाब भर जाते हैं, तो वह पानी पिछली गर्मियों में भाप बना पानी ही होता है। छत पर रखी बाल्टी का पानी गर्मी में कम हो जाता है, क्योंकि वह भाप बनकर उड़ता है। वही पानी बादल बनकर फिर बरसता है।", say: "छत की बाल्टी का पानी भाप बनकर उड़ता है और बारिश बनकर लौटता है।", icon: "🪣", q: "monsoon rain village india" },
      try_it: { question: "एक कटोरी में पानी भरकर धूप में रखो और निशान लगा दो। शाम को देखो, पानी का स्तर क्या हुआ?", right: "पानी कम हो गया, क्योंकि कुछ भाप बनकर उड़ गया।", hint: "सोचो, सूरज की गर्मी पानी के साथ क्या करती है?", say: "कटोरी में पानी भरकर धूप में रखो और शाम को देखो।", q: "bowl water sun" },
      future: { text: "आगे तुम पढ़ोगे कि बारिश कितनी ज़रूरी है और बाढ़ और सूखा क्यों आते हैं। पानी बचाना और बारिश का पानी जमा करना भी इसी चक्र से जुड़ा है।", say: "आगे तुम बाढ़ और सूखे के बारे में पढ़ोगे। बारिश का पानी बचाओ।", icon: "🌧️", q: "rainwater harvesting india" },
      extras: { home: "एक पारदर्शी डिब्बे में गर्म पानी डालकर ढक्कन लगाओ। ढक्कन के नीचे बूँदें बनती देखो।", fact: "धरती का ज़्यादातर पानी समुद्र में है, पर वह नमकीन है और पीने लायक नहीं।", india: "भारत में गर्मियों में समुद्र की भाप से मॉनसून के बादल बनकर जून में केरल पहुँचते हैं।", trick: "याद रखो तीन शब्द: उड़ो, जमो, बरसो।", whatif: "अगर कभी बारिश न हो तो नदियों और तालाबों का क्या होगा?" },
      q3d: ["water cycle", "cloud", "sun", "pond", "raindrop"],
      checks: [
        chk("पानी भाप किससे बनता है?", ["सूरज की गर्मी से", "ठंड से", "हवा के शोर से"], 0, "गर्मी से पानी भाप बनता है।", "धूप में कपड़े क्यों सूखते हैं?"),
        chk("बादल कैसे बनते हैं?", ["भाप ठंडी होकर बूँदें बनने से", "धुएँ से", "मिट्टी से"], 0, "इसे संघनन कहते हैं।", "ठंडे गिलास के बाहर क्या दिखता है?"),
        chk("बारिश का पानी आखिर में कहाँ जाता है?", ["नदी से समुद्र में", "आसमान में ही रहता है", "खत्म हो जाता है"], 0, "पानी बहकर समुद्र में पहुँचता है।", "तीसरा चरण पढ़ो।"),
      ],
    },
  },
  // 2b. Class 2, English, short.
  class2: {
    question: "Why do we brush our teeth?", classLevel: 2, subject: "science", replyLang: "en", name: "Riya", sim: false,
    line: {
      type: "elaboration", term: "Brushing teeth", topic_en: "brushing teeth", topic_local: null, icon: "🪥",
      definition: { text: "We brush our teeth to keep them clean. Tiny bits of food stay in our mouth after we eat. Brushing takes them away, {{name}}!", say: "We brush our teeth to keep them clean and take away tiny bits of food.", q: "child brushing teeth" },
      levels: {
        basic: "Food bits stick to our teeth. Germs love them and make holes called cavities. Brushing washes the germs away.",
        intermediate: "A cavity hurts and the tooth can break. Brushing twice a day keeps the germs few.",
        advanced: "Sweets give germs sugar to eat, so we rinse our mouth after chocolates and toffees.",
        say: "Food bits stick to teeth and germs make holes. Brushing takes them away.",
        q: "toothbrush toothpaste",
      },
      real_life: { text: "In the morning Dadi gives you a brush and a pea-sized dot of paste. Brush all sides, then rinse. Do it again at night.", say: "Brush in the morning and at night.", icon: "🌙", q: "child toothbrush morning" },
      try_it: { question: "Count slowly to thirty while you brush the front teeth. Can you do it?", right: "Yes. Brushing for a short count keeps teeth clean.", hint: "Count one, two, three.", say: "Count to thirty while you brush.", q: "brushing teeth counting" },
      future: { text: "Clean teeth help you smile and bite hard foods like apples. Healthy habits now keep you strong when you grow up.", say: "Clean teeth help you smile and eat apples.", icon: "😁", q: "smiling child" },
      extras: { home: "Look in the mirror and count your teeth with a clean finger.", fact: "A grown-up has 32 teeth, but you have fewer now.", india: "Many families in India clean teeth with a neem twig, called datun.", trick: "Brush up, brush down, brush all around.", whatif: "What if we never brushed our teeth?" },
      q3d: ["tooth", "", "", "", ""],
      checks: [
        chk("When do we brush?", ["Morning and night", "Only on Sunday"], 0, "We brush twice a day.", "Think of morning and night."),
        chk("What makes holes in teeth?", ["Germs", "Water"], 0, "Germs make holes called cavities.", "Look at step two."),
      ],
    },
  },
  // 2c. Class 10 science, English, richer, with a formula.
  class10: {
    question: "How does a convex lens form an image?", classLevel: 10, subject: "science", replyLang: "en", name: "Kabir", sim: false,
    line: {
      type: "elaboration", term: "Image formation by a convex lens", topic_en: "convex lens", topic_local: null, icon: "🔍",
      definition: { text: "A convex lens is thicker in the middle and bends parallel rays of light so that they meet at one point, the principal focus. Because it brings rays together it is called a converging lens. The distance from the optical centre to the focus is the focal length f. Good thinking, {{name}}: an image forms where refracted rays actually meet or appear to meet. This is the idea behind a magnifying glass, a camera and the human eye.", say: "A convex lens bends parallel rays to meet at its focus, so it is a converging lens.", q: "convex lens ray diagram" },
      levels: {
        basic: "Three rays make the image easy to draw. A ray parallel to the principal axis passes through the focus after refraction. A ray through the optical centre goes straight, without bending. A ray through the focus emerges parallel to the axis. Where these rays cross, the image of that point forms.",
        intermediate: "The image depends on where the object stands. Beyond 2F the image is real, inverted and smaller, between F and 2F. At 2F the image is real, inverted and the same size at 2F. Between F and 2F the image is real, inverted and magnified, beyond 2F. Inside F the image is virtual, erect and magnified, on the same side as the object, which is how a magnifying glass works.",
        advanced: "The lens formula 1/v − 1/u = 1/f relates image distance v, object distance u and focal length f, with the Cartesian sign convention. Magnification m = v/u = h'/h; a negative m means an inverted image. The power of a lens is P = 1/f with f in metres, measured in dioptres; a lens of f = +25 cm has P = +4 D. For u = −30 cm and f = +10 cm, 1/v = 1/10 − 1/30 = 1/15, so v = +15 cm and m = −0.5.",
        say: "Three rays locate the image. Its nature depends on object distance. The lens formula is one by v minus one by u equals one by f.",
        q: "convex lens image formation",
      },
      real_life: { text: "A jeweller in a Delhi market holds a convex lens close to a gem and sees a large, erect, virtual image: the object lies inside F. A projector at a school function places the slide just beyond F, so a large real inverted image falls on the screen, which is why slides are put upside down. In the eye, the lens forms a real, inverted, smaller image on the retina and the brain turns it the right way up. A simple camera in a phone uses the same idea with a tiny lens.", say: "A magnifying glass, a projector and the eye all use convex lenses.", icon: "📽️", q: "magnifying glass jeweller" },
      try_it: { question: "An object is 30 cm from a convex lens of focal length 10 cm. Find the image distance and the magnification.", right: "v = +15 cm and m = −0.5, so the image is real, inverted and half the size.", hint: "Use 1/v = 1/f + 1/u with u = −30 cm and f = +10 cm.", say: "Find v and m for u of minus 30 centimetres and f of 10 centimetres.", q: "lens formula numerical" },
      future: { text: "In Class 12 you will meet lens combinations, the lens maker's formula 1/f = (n − 1)(1/R1 − 1/R2), the microscope and the telescope. Each one is an extension of what you derived here. Board examinations often ask a ray diagram with one numerical.", say: "Class 12 extends this to the lens maker's formula, the microscope and the telescope.", icon: "🔭", q: "telescope" },
      extras: { home: "Hold a magnifying glass between a window and a white wall; move it until a sharp inverted picture of the window forms. Measure the lens-to-wall distance: that is roughly f.", fact: "Spectacle lenses are labelled by power in dioptres; a +2.0 D lens has a focal length of 50 cm.", india: "The Kodaikanal and Hanle observatories use large lens and mirror systems to image distant stars.", trick: "For a real image remember 'F-2F-beyond': the farther the object, the smaller and nearer the image.", whatif: "What would the image look like if the object were placed exactly at F?" },
      q3d: ["convex lens", "magnifying glass", "microscope", "human eye", "telescope"],
      checks: [
        chk("Where does the image form when the object is beyond 2F?", ["Between F and 2F, real and smaller", "Beyond 2F, real and larger", "Same side, virtual"], 0, "Beyond 2F gives a real, inverted, diminished image between F and 2F.", "Recall the table in step 2."),
        chk("A convex lens has f = +25 cm. What is its power?", ["+4 D", "+0.25 D", "+25 D"], 0, "P = 1/f = 1/0.25 m = +4 D.", "Change f to metres first."),
        chk("A ray passing through the optical centre", ["goes straight without bending", "bends toward the axis", "turns back"], 0, "It emerges undeviated.", "Step 1, second ray."),
        chk("For u = -30 cm and f = +10 cm the magnification is", ["-0.5", "+2", "-2"], 0, "m = v/u = 15/(-30) = -0.5.", "Find v first."),
        chk("A magnifying glass gives a virtual image when the object is", ["inside F", "at 2F", "beyond 2F"], 0, "Inside F the image is virtual, erect and magnified.", "Look at step 2, last case."),
      ],
    },
  },
  // 3a. Class 11 physics: Virtual Labs embed (projectile motion).
  vlab: {
    question: "How is the range of a projectile found?", classLevel: 11, subject: "physics", replyLang: "en", name: "Meera", sim: true, simSource: "vlabs",
    line: {
      type: "elaboration", term: "Projectile motion", topic_en: "projectile motion", topic_local: null, icon: "🏏",
      definition: { text: "A projectile is an object thrown into the air that then moves only under gravity, such as a cricket ball hit by a batter. Its path is a parabola because the horizontal velocity stays constant while the vertical velocity changes at g = 9.8 m/s². The two motions are independent and can be analysed separately. Well started, {{name}}: splitting the velocity into components is the key step. For launch speed u at angle θ, the components are u cos θ and u sin θ.", say: "A projectile moves in a parabola under gravity; split the velocity into horizontal and vertical parts.", q: "cricket ball trajectory" },
      levels: {
        basic: "The horizontal component u cos θ never changes, because no horizontal force acts if air resistance is ignored. The vertical component u sin θ decreases on the way up and increases on the way down. At the highest point the vertical velocity is zero, but the horizontal velocity is still u cos θ. The ball therefore returns to launch level with the same speed it left.",
        intermediate: "Time of flight T = 2u sin θ / g. Maximum height H = u² sin²θ / (2g). Range R = u² sin 2θ / g. The range is greatest at θ = 45° because sin 2θ is then 1, and two angles that add to 90° give the same range.",
        advanced: "Eliminating t from x = u cos θ · t and y = u sin θ · t − ½gt² gives y = x tan θ − g x² / (2u² cos²θ), a parabola. With air drag the real path is shorter and steeper on the way down. For u = 20 m/s and θ = 30°, R = 400 × 0.866 / 9.8 ≈ 35.3 m.",
        say: "Split velocity into components. The range is u squared sine two theta over g, greatest at forty five degrees.",
        q: "projectile parabola",
      },
      real_life: { text: "When a fielder throws the ball from the boundary at Eden Gardens, the best angle for the longest throw is close to 45° on the ground. A water fountain in a Mughal garden shows many small parabolas at once. A javelin thrower in an athletics meet picks a lower angle of about 35° because the javelin is released above the ground and carries lift. In each case the same equations decide the path. Engineers also use them to plan where a rescue package dropped from a helicopter will land.", say: "A throw from the boundary, a fountain and a javelin all follow parabolas.", icon: "🏟️", q: "javelin throw athlete" },
      try_it: { question: "A ball is kicked at 20 m/s at 30° to the ground. Find its time of flight and range (g = 10 m/s²).", right: "T = 2 × 20 × 0.5 / 10 = 2 s and R = 400 × 0.866 / 10 ≈ 34.6 m.", hint: "Use T = 2u sin θ / g and R = u² sin 2θ / g.", say: "Find the time of flight and range for twenty metres per second at thirty degrees.", q: "football kick trajectory" },
      future: { text: "In Class 12 and engineering mathematics you will extend this to motion with air resistance, satellites and ballistic missiles. The same vector splitting returns in relative motion and in electric fields, where a charge in a uniform field also follows a parabola.", say: "The same vector idea returns in electric fields and relative motion.", icon: "🚀", q: "rocket launch sriharikota" },
      extras: { home: "Squirt water from a bottle at different angles on a school ground and mark where it lands: the farthest jet will come near 45°.", fact: "On the Moon, with g about one sixth of Earth's, the same throw goes about six times farther.", india: "ISRO's launch trajectories begin as near-vertical paths and then bend to a curve, planned with the same laws.", trick: "Remember 'x is steady, y is changing': constant sideways, gravity up and down.", whatif: "What if you throw at 60° instead of 30°: which goes higher and which goes farther?" },
      q3d: ["cricket ball", "", "", "", ""],
      checks: [
        chk("The horizontal velocity of a projectile (no air drag)", ["stays constant", "increases", "becomes zero at the top"], 0, "No horizontal force acts.", "Step 1, first sentence."),
        chk("The angle for the maximum range on level ground is", ["45°", "30°", "90°"], 0, "sin 2θ is largest at 45°.", "Use R = u² sin 2θ / g."),
        chk("At the highest point the vertical velocity is", ["zero", "u", "g"], 0, "It reverses direction there.", "Step 1."),
      ],
    },
  },
  // 3b. Class 11 physics: OLabs (link card), the inclined plane.
  olab: {
    question: "How does friction act on an inclined plane?", classLevel: 11, subject: "physics", replyLang: "en", name: "Meera", sim: true, simSource: "olabs",
    line: {
      type: "elaboration", term: "Inclined plane", topic_en: "inclined plane", topic_local: null, icon: "📐",
      definition: { text: "An inclined plane is a flat surface tilted at an angle θ to the horizontal, like a ramp. A block resting on it feels gravity mg, which splits into mg sin θ along the slope and mg cos θ pressing on the surface. Friction acts up the slope and opposes the tendency to slide, {{name}}. The block stays at rest as long as friction is enough to balance mg sin θ.", say: "On a ramp gravity splits into a part along the slope and a part into it; friction opposes sliding.", q: "inclined plane ramp" },
      levels: {
        basic: "The normal force is N = mg cos θ. The maximum static friction is f = μs N = μs mg cos θ. The block begins to slide when mg sin θ exceeds this, that is when tan θ is greater than μs. So the angle of repose is θ = tan⁻¹ μs.",
        intermediate: "Once the block moves, kinetic friction μk mg cos θ acts, with μk smaller than μs. The acceleration down the slope is a = g (sin θ − μk cos θ). On a smooth slope μ = 0 and a = g sin θ.",
        advanced: "Pulling a block up at constant speed needs a force F = mg (sin θ + μ cos θ) along the slope. The mechanical advantage of a smooth ramp is 1 / sin θ, which is why a long gentle ramp needs a smaller push but a longer path; the work done is unchanged.",
        say: "Normal force is mg cos theta. Sliding begins when tan theta exceeds mu s. Acceleration is g times sine theta minus mu k cos theta.",
        q: "inclined plane friction",
      },
      real_life: { text: "Loaders at a railway goods shed push sacks up a wooden ramp onto a truck because lifting them straight up needs far more force. A hill road in Shimla zigzags to lower the angle of the slope so that buses do not slip and need less engine force. Wheelchair ramps at a metro station follow a gentle slope for the same reason. In each case, a smaller angle means a smaller force along the slope, but a longer distance.", say: "A ramp to a truck and hill roads use gentle slopes to cut the force needed.", icon: "🚚", q: "loading ramp truck india" },
      try_it: { question: "A 5 kg block rests on a 30° slope with μs = 0.7. Will it slide? (tan 30° = 0.58)", right: "No. tan 30° = 0.58 is less than 0.7, so friction is enough and the block stays at rest.", hint: "Compare tan θ with μs.", say: "Will a five kilogram block slide on a thirty degree slope with mu s zero point seven?", q: "block on ramp" },
      future: { text: "Later you will meet the screw, the wedge and the roller, all of which are inclined planes in disguise. The resolution of forces here prepares you for equilibrium, banking of roads and circular motion on slopes.", say: "The screw and the wedge are inclined planes too.", icon: "🔩", q: "screw thread wedge" },
      extras: { home: "Tilt a wooden board slowly with a rubber on it. Measure the angle at which it starts to slide: that is your angle of repose.", fact: "A spiral staircase and a screw are inclined planes wrapped around a cylinder.", india: "The ghats of the Western Ghats have hairpin roads so that vehicles climb with a small slope.", trick: "Sin slides, cos presses: mg sin θ pulls down the slope, mg cos θ presses on it.", whatif: "What would happen if the ramp were perfectly smooth?" },
      q3d: ["inclined plane", "", "", "", ""],
      checks: [
        chk("The normal force on the block is", ["mg cos θ", "mg sin θ", "mg"], 0, "The component perpendicular to the slope.", "Step 1."),
        chk("The block slides when", ["tan θ is greater than μs", "tan θ is less than μs", "θ is zero"], 0, "mg sin θ exceeds the maximum friction.", "Compare the two forces."),
      ],
    },
  },
  // 5. One answer with a real 3D model and one of our animations (a wind turbine and a water wheel).
  wind: {
    question: "How does a windmill give energy?", classLevel: 5, subject: "science", replyLang: "en", name: "Harshit", sim: false,
    line: {
      type: "elaboration", term: "Windmill", topic_en: "windmill", topic_local: null, icon: "🌬️",
      definition: { text: "A windmill is a machine that uses the push of moving air to turn big blades. The turning blades turn a shaft, and the shaft can grind grain, lift water or make electricity. Wind is free and never runs out, so a windmill needs no fuel, {{name}}. In India many wind turbines stand along the coast of Tamil Nadu and Gujarat.", say: "A windmill uses moving air to turn blades that make energy.", q: "wind turbine" },
      levels: {
        basic: "Moving air carries energy of motion. When it hits the slanted blades, it pushes them round. Faster wind pushes harder, so the blades turn faster. When there is no wind, the blades stop.",
        intermediate: "Inside the turbine a generator is joined to the shaft. When the shaft spins, the generator changes the energy of motion into electrical energy. The electricity goes through wires to a transformer and then to our homes.",
        advanced: "A bigger turbine catches more wind, so the power grows quickly with the length of the blades and with wind speed. Engineers put turbines on hills and coasts where the wind is strong and steady.",
        say: "Wind pushes the blades, the shaft spins and the generator makes electricity.",
        q: "wind turbine blades",
      },
      real_life: { text: "On a village well, a small windmill pumps water without any diesel. A water wheel does the same job with flowing water in a hill stream. Both change the motion of air or water into useful work. Our grandparents used them to grind wheat at the chakki.", say: "A village windmill pumps water and a water wheel grinds wheat.", icon: "🌾", q: "windmill village well india" },
      try_it: { question: "Make a paper pinwheel and blow on it from near and from far. When does it spin faster?", right: "It spins faster when you blow harder or from near, because more moving air pushes it.", hint: "Think about the push of the air.", say: "Make a paper pinwheel and blow on it from near and far.", q: "paper pinwheel" },
      future: { text: "Wind, sun and water are renewable energy, which means they do not run out. Later you will learn why they keep the air cleaner than coal and petrol.", say: "Wind, sun and water are renewable energy.", icon: "🌍", q: "renewable energy" },
      extras: { home: "Hold a paper pinwheel out of a bus or an auto window and watch it spin faster as the speed rises.", fact: "The tip of a big turbine blade can move faster than a racing car.", india: "India is among the top countries in the world for wind power.", trick: "Wind pushes, blades turn, shaft spins, light glows.", whatif: "What if the wind stopped for a week in a windmill village?" },
      q3d: ["windmill", "generator", "", "", ""],
      checks: [
        chk("What turns the blades of a windmill?", ["Moving air", "Still air"], 0, "Moving air pushes the blades.", "Step 1."),
        chk("What does the generator make?", ["Electricity", "Wind"], 0, "It changes motion into electricity.", "Step 2."),
        chk("Which is a renewable source of energy?", ["Wind", "Coal"], 0, "Wind never runs out.", "Last step."),
      ],
    },
  },
};

async function buildV21(key: string) {
  const spec = V21S[key];
  const parsed = parseBlockLine(JSON.stringify(spec.line));
  if (parsed?.type !== "elaboration") throw new Error(`harness: the v21 line ${key} was refused by the block checker`);
  const built = withPics(parsed, [], spec.question, spec.classLevel);
  const filled = await fillElaboration(built, { subject: spec.subject, classLevel: spec.classLevel });
  // The server's own name swap (name-token.ts) over the whole block, as the stream route does after the answer returns.
  const block = nameFiller(spec.name)(filled);
  const child = { classLevel: spec.classLevel, firstName: spec.name, language: "hi" } as never;
  const intent = intentOf({ question: spec.question, child, subject: spec.subject === "physics" ? "physics" : "evs", replyLang: spec.replyLang, model: block.topic ? { en: block.topic.en, local: block.topic.local } : null });
  const topicLine = intentLine(intent);
  const sim = spec.sim
    ? matchSim(simRowsFromCsv(readFileSync(new URL("../seed/curated_sims.csv", import.meta.url), "utf8")).rows.filter((r) => (r.language === "hi" || r.language === "en") && (!spec.simSource || r.source === spec.simSource)), { subject: intent.subject, term: block.term, topicEn: block.topic?.en }, { classLevel: spec.classLevel })
    : null;
  if (sim) (block as unknown as Record<string, unknown>).sim = sim;
  const videos = spec.videos
    ? { type: "videos", topicKey: topicLine?.key ?? "harness.v21.energy", lang: spec.videos, items: [{ videoId: "dQw4w9WgXcQ", title: "ऊर्जा क्या है (harness stand-in)", channel: "Harness", seconds: 420 }, { videoId: "9bZkp7q19f0", title: "Forms of energy for kids (harness stand-in)", channel: "Harness", seconds: 360 }] }
    : null;
  const events = [
    { t: "meta", label: "ai_made", cached: false, title: null, subject: spec.subject, topicKey: null },
    { t: "block", block },
    ...(videos ? [{ t: "block", block: videos }] : []),
    { t: "done", complete: true, missing: [], cut: false },
  ];
  const kinds = block.pics.map((p) => p?.kind ?? null);
  return { question: spec.question, body: events.map((e) => `${JSON.stringify(e)}\n`).join(""), proof: { key, kinds, sim: sim ? `${sim.source}: ${sim.title}` : null, checks: block.checks.length } };
}

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
    JSON.stringify({ en: await build("en"), hi: await build("hi"), photo: await build("photo"), photoHi: await build("photoHi"), intent: await build("intent"), simfrac: await build("simfrac"), simfracEn: await build("simfracEn"), ...await (async () => { const o: Record<string, unknown> = {}; for (const k of Object.keys(V21S)) o[`v21_${k}`] = await buildV21(k); return o; })() }),
  );
})();
