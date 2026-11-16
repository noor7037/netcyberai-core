// The harness's Elaboration Framework answers (founder, 16 Nov 2026), for a real Class 3 Mathematics chapter ("Fair Share",
// reader/content/c03/mathematics). The model's own line is written out here (the harness calls no model); everything after it
// is the app's real code: the block is read by parseBlockLine, the five pictures and the lead level are chosen by withPics from
// the chapter's own diagrams, and the events are what the stream carries. Prints { en, hi } NDJSON. Run by family.mjs.
import { parseBlockLine } from "../../src/lib/family/blocks";
import { withPics } from "../../src/lib/family/elaboration-pics";
import { fillElaboration } from "../../src/lib/family/visuals/elab-fill";
import { chapterDiagrams } from "../../src/lib/family/tutor-context";

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
} as const;

async function build(lang: "en" | "hi" | "photo") {
  const { question, line } = LINES[lang];
  const parsed = parseBlockLine(JSON.stringify(line));
  if (parsed?.type !== "elaboration")
    throw new Error(
      `harness: the ${lang} elaboration line was refused by the block checker`,
    );
  const built = withPics(
    parsed,
    lang === "photo" ? [] : await chapterDiagrams(KEY, lang),
    question,
    CLASS,
  );
  const block =
    lang === "photo"
      ? await fillElaboration(built, { subject: "science" })
      : built;
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
    { t: "done", complete: true, missing: [], cut: false },
  ];
  return {
    question,
    body: events.map((e) => `${JSON.stringify(e)}\n`).join(""),
    diagrams: block.pics.filter((p) => p?.kind === "diagram").length,
  };
}

void (async () => {
  process.stdout.write(
    JSON.stringify({ en: await build("en"), hi: await build("hi"), photo: await build("photo") }),
  );
})();
