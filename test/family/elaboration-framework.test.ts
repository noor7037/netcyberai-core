import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  checkBlock,
  checkStoredBlock,
  completeResponse,
  coreBlocks,
  type Block,
} from "@/lib/family/blocks";
import {
  ELAB_KEYS,
  elaborationBlock,
  elaborationSpeech,
  leadLevel,
  stepAtSentence,
  stepSay,
  type Elaboration,
} from "@/lib/family/elaboration";
import { cardSvg, withPics } from "@/lib/family/elaboration-pics";
import { spokenSentences } from "@/lib/family/call";
import { chapterDiagrams } from "@/lib/family/tutor-context";
import { defaultPlan, checkPlan, BANDS } from "@/lib/ai/teaching/plan-shape";
import { resolverPrompt } from "@/lib/ai/prompts/family.resolver";
import { ELABORATION_RULE } from "@/lib/ai/prompts/family.resolver/elaboration-prompt";
import { isElaboration } from "@/lib/ai/prompts/family.resolver/v19";
import { ElaborationView } from "@/components/family/blocks/ElaborationView";
import { familyWords } from "@/lib/family/words";
import { UNDERSTAND_KEYS } from "@/lib/family/understand-words";

// The NetCyberAI Elaboration Framework (founder, 16 Nov 2026): every answer is five steps in order, each with a picture, the
// text and a voice line. Made-up content; no network.

const raw = {
  type: "elaboration",
  term: "Equal fractions",
  icon: "🫓",
  definition: {
    text: "Equal fractions name the same part of a whole.",
    say: "Equal fractions name the same part of a whole.",
  },
  levels: {
    basic: "Half a roti and two quarters of a roti are the same amount.",
    intermediate:
      "Multiply the top and the bottom by the same number and the fraction keeps its value.",
    advanced:
      "Equal fractions are one rational number written with different numerators and denominators: a/b = ka/kb.",
    say: "Basic: half and two quarters are the same. Intermediate: multiply top and bottom by the same number. Advanced: a over b equals k a over k b.",
  },
  real_life: {
    text: "At the sweet shop, half a kilo of laddoos weighs the same as two packets of a quarter kilo.",
    say: "At the sweet shop, half a kilo is the same as two quarter kilo packets.",
    icon: "🛒",
  },
  try_it: {
    question: "Is 2/4 equal to 1/2?",
    options: ["Yes", "No", "Only sometimes"],
    answer: 0,
    right: "Cut each half again and you get two quarters.",
    hint: "Draw a roti and cut it in half, then cut each half again.",
    say: "Is two quarters equal to one half?",
  },
  future: {
    text: "You will use equal fractions to add fractions, read ratios and work with percentages in science.",
    say: "Equal fractions help you add fractions, read ratios and work with percentages.",
    icon: "🚀",
  },
};
const block = (): Elaboration => elaborationBlock(raw, false)!;
const words = familyWords("en", UNDERSTAND_KEYS);
const hiWords = familyWords("hi", UNDERSTAND_KEYS);

describe("the elaboration block", () => {
  it("has the five steps in this order", () =>
    expect([...ELAB_KEYS]).toEqual([
      "definition",
      "levels",
      "real_life",
      "try_it",
      "future",
    ]));
  it("is read from the model line, whole", () => {
    const b = checkBlock(raw) as Elaboration;
    expect(b.type).toBe("elaboration");
    expect(b.pics).toEqual([null, null, null, null, null]);
    expect(Object.keys(b.levels).slice(0, 3)).toEqual([
      "basic",
      "intermediate",
      "advanced",
    ]);
  });
  it.each(["definition", "levels", "real_life", "try_it", "future"])(
    "is dropped whole when %s is missing",
    (k) => {
      const o: Record<string, unknown> = { ...raw };
      delete o[k];
      expect(checkBlock(o)).toBeNull();
    },
  );
  it("is dropped when a level, an option list or the right answer is wrong", () => {
    expect(
      checkBlock({ ...raw, levels: { ...raw.levels, advanced: "" } }),
    ).toBeNull();
    expect(
      checkBlock({ ...raw, try_it: { ...raw.try_it, options: ["Yes"] } }),
    ).toBeNull();
    expect(
      checkBlock({ ...raw, try_it: { ...raw.try_it, answer: 3 } }),
    ).toBeNull();
    expect(
      checkBlock({
        ...raw,
        try_it: { ...raw.try_it, options: ["Yes", "Yes"] },
      }),
    ).toBeNull();
  });
  it("never takes pictures or the lead level from the model, and keeps the ones the server kept", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>';
    const fromModel = checkBlock({
      ...raw,
      lead: "advanced",
      pics: ELAB_KEYS.map(() => ({ svg, caption: "c", kind: "card" })),
    }) as Elaboration;
    expect(fromModel.pics.every((p) => p === null)).toBe(true);
    expect(fromModel.lead).toBe("basic");
    const stored = checkStoredBlock({
      ...raw,
      lead: "advanced",
      pics: ELAB_KEYS.map(() => ({ svg, caption: "c", kind: "card" })),
    }) as Elaboration;
    expect(stored.pics.every((p) => p?.svg === svg)).toBe(true);
    expect(stored.lead).toBe("advanced");
    const bad = checkStoredBlock({
      ...raw,
      pics: ELAB_KEYS.map(() => ({
        svg: "<svg><script>1</script></svg>",
        caption: "c",
      })),
    }) as Elaboration;
    expect(bad.pics.every((p) => p === null)).toBe(true);
  });
  it("is the whole answer: the one core block, shown first", () => {
    expect(coreBlocks(["elaboration"])).toEqual(["elaboration"]);
    expect(
      completeResponse([block() as Block], coreBlocks(["elaboration"])),
    ).not.toBeNull();
  });
});

describe("the five pictures", () => {
  const dia = [
    {
      title: "Half: one of two equal parts",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="3"/></svg>',
      caption: "A roti cut into two equal parts",
      text: "Half one of two equal parts roti equal fractions half",
    },
  ];
  it("gives every step a picture, and a card when no diagram fits", () => {
    const b = withPics(block(), [], "What are equal fractions?", 3);
    expect(b.pics).toHaveLength(5);
    for (const p of b.pics) {
      expect(p?.svg.startsWith("<svg")).toBe(true);
      expect(p?.kind).toBe("card");
      expect(p?.caption.length).toBeGreaterThan(0);
    }
    expect(b.pics[0]!.svg).toContain("Equal fractions");
    expect(checkStoredBlock(b)).not.toBeNull();
  });
  it("uses the chapter diagram only when it matches the question (never an unrelated one)", () => {
    expect(
      withPics(block(), dia, "What are equal fractions?", 3).pics[0]?.kind,
    ).toBe("diagram");
    const chem = [
      {
        title: "From reactants to product",
        svg: dia[0].svg,
        caption: "reactants",
        text: "From reactants to product chemical reaction magnesium",
      },
    ];
    expect(
      withPics(block(), chem, "What are equal fractions?", 3).pics.every(
        (p) => p?.kind === "card",
      ),
    ).toBe(true);
  });
  it("sets the lead level from the class", () => {
    expect([1, 2, 5].map(leadLevel)).toEqual(["basic", "basic", "basic"]);
    expect([6, 8, 10].map(leadLevel)).toEqual([
      "intermediate",
      "intermediate",
      "intermediate",
    ]);
    expect([11, 12].map(leadLevel)).toEqual(["advanced", "advanced"]);
    expect(withPics(block(), [], "x", 9).lead).toBe("intermediate");
  });
  it("writes the labels of a real chapter diagram in the child language (no blank panel)", async () => {
    const en = await chapterDiagrams("u.c10.science.jesc1.ch01", "en");
    const hi = await chapterDiagrams("u.c10.science.jesc1.ch01", "hi");
    expect(en[0].svg).toContain(">Reactant<");
    expect(en[0].svg).not.toMatch(/data-t="[a-z]+"[^>]*\/>/);
    expect(hi[0].svg).toContain("अभिकारक");
  });
  it("draws a card for a term with markup in it safely", () =>
    expect(cardSvg("future", 5, "<b>x & y</b>", undefined)).not.toContain(
      "<b>",
    ));
});

describe("the voice", () => {
  it("speaks the five steps in order, one line each", () => {
    const says = stepSay(block());
    expect(says).toHaveLength(5);
    expect(elaborationSpeech(block())).toEqual(says);
    const sentences = spokenSentences([block()], Infinity);
    const at = says.map((s) =>
      sentences.findIndex((x) => s.startsWith(x.slice(0, 20))),
    );
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("moves the board with the sentence being spoken", () => {
    const b = block();
    const sentences = spokenSentences([b], Infinity);
    const seen = sentences.map((_, i) => stepAtSentence(b, sentences, i));
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(4);
    expect([...seen].sort((a, c) => a - c)).toEqual(seen);
  });
});

describe("the reply on screen: five steps, each with a picture, text and voice", () => {
  const full = withPics(block(), [], "What are equal fractions?", 3);
  const html = (w: typeof words, b: Elaboration = full) =>
    renderToStaticMarkup(h(ElaborationView, { b, w, tone: "mathematics" }));
  it.each([
    ["en", words],
    ["hi", hiWords],
  ] as const)("in %s", (_l, w) => {
    const out = html(w);
    const steps = [
      ...out.matchAll(
        /<li [^>]*data-elab-step="(\d)"[^>]*data-elab-key="(\w+)"[\s\S]*?(?=<li [^>]*data-elab-step=|<\/ol>)/g,
      ),
    ];
    expect(steps.map((m) => m[2])).toEqual([...ELAB_KEYS]);
    expect(steps.map((m) => m[1])).toEqual(["1", "2", "3", "4", "5"]);
    for (const m of steps) {
      expect(m[0]).toMatch(/<img [^>]*data-elab-img/); // a picture to see
      expect(m[0]).not.toMatch(/data-elab-listen/); // v21: read by the answer's one button at the top
      expect(m[0].replace(/<[^>]+>/g, " ").trim().length).toBeGreaterThan(20); // text to read
    }
    // the three levels, in order, and the one for this class leads
    expect(
      [...out.matchAll(/data-elab-level="(\w+)"/g)].map((m) => m[1]),
    ).toEqual(["basic", "intermediate", "advanced"]);
    expect(out).toMatch(/data-elab-level="basic" data-lead/);
    // the whiteboard beside the conversation
    expect(out).toContain("data-whiteboard");
    // the try-it has its choices
    expect([...out.matchAll(/data-elab-option="\d"/g)]).toHaveLength(3);
  });
  it("names its steps in Hindi", () =>
    expect(html(hiWords)).toContain(hiWords["fam.elab.step.real_life"]));
});

describe("the plan, the prompt and the block order", () => {
  it("is the one block for every class under the framework", () => {
    for (const classLevel of [1, 2, 3, 5, 6, 8, 10, 12])
      expect(
        defaultPlan(
          {
            classLevel,
            subject: "mathematics",
            lang: "en",
            visualFirst: true,
            oneBoard: true,
            elaborate: true,
          },
          "medium",
        ).blocks,
      ).toEqual(["elaboration"]);
    for (const band of BANDS) expect(band).toBeTruthy();
    const raw = JSON.stringify({
      t: "concept",
      b: "c6_8",
      d: "full",
      k: ["explanation", "figure", "check", "practice"],
      v: [],
      l: "en",
    });
    expect(
      checkPlan(raw, {
        classLevel: 7,
        subject: "science",
        lang: "en",
        elaborate: true,
      }).plan.blocks,
    ).toEqual(["elaboration"]);
  });
  it("is the default of prompt v19 for a question, for every class, in en and hi", () => {
    const p = resolverPrompt("v19", false);
    expect(p.elaborate).toBe(true);
    for (const classLevel of [1, 3, 8, 12]) {
      for (const [language, replyLang] of [
        ["en", "en"],
        ["hi", "hi"],
      ] as const) {
        const ask = {
          board: "CBSE",
          classLevel,
          subject: null,
          openSubjects: ["mathematics"],
          classSubjects: ["mathematics"],
          chapter: null,
          topic: null,
          question: "fractions",
          language,
          style: language,
          followUp: false,
          misconception: null,
          replyLang,
          motherTongue: "hi",
        } as never;
        expect(isElaboration(ask)).toBe(true);
        const sys = p.system(ask);
        expect(sys).toContain(ELABORATION_RULE);
        for (const key of [
          '"definition"',
          '"levels"',
          '"real_life"',
          '"try_it"',
          '"future"',
        ])
          expect(sys).toContain(key);
        // the five steps are asked for in this order
        const at = [
          '"definition"',
          '"levels"',
          '"real_life"',
          '"try_it"',
          '"future"',
        ].map((k) => sys.indexOf(k, sys.indexOf('{"type":"elaboration"')));
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        expect(sys).toContain("Write ONLY these 1 blocks");
        expect(sys).not.toContain('"type":"explanation"');
        expect(sys).not.toMatch(/\bboard block\b/);
        expect(sys).toContain("{{name}}");
      }
    }
  });
  it("keeps a lesson taught from the syllabus on its own blocks", () => {
    const plan = defaultPlan(
      { classLevel: 8, subject: "science", lang: "en", oneBoard: true },
      "full",
    );
    const ask = {
      board: "CBSE",
      classLevel: 8,
      subject: "science",
      openSubjects: ["science"],
      classSubjects: ["science"],
      chapter: "Motion",
      topic: null,
      question: null,
      language: "en",
      style: "en",
      followUp: false,
      misconception: null,
      plan,
    } as never;
    expect(isElaboration(ask)).toBe(false);
    expect(resolverPrompt("v19", false).system(ask)).not.toContain(
      ELABORATION_RULE,
    );
  });
  it("is not on for older prompts", () =>
    expect(resolverPrompt("v18", false).elaborate).toBeUndefined());
});

import { activeElabStep } from "@/components/family/blocks/ElaborationView";
describe("active step precedence", () => {
  it("follows the voice when nothing is picked, step 0 when silent", () => {
    expect(activeElabStep(2, null)).toBe(2);
    expect(activeElabStep(null, null)).toBe(0);
  });
  it("a pick wins until the spoken step changes", () => {
    expect(activeElabStep(1, { step: 3, over: 1 })).toBe(3);
    expect(activeElabStep(2, { step: 3, over: 1 })).toBe(2);
    expect(activeElabStep(null, { step: 4, over: null })).toBe(4);
  });
});
