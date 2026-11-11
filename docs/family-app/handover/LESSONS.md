# Lessons: mistakes already made, and the rule that prevents each

Every writer session reads this file in full before writing. Claude Code adds to it after every review. A rule that a
program can check is also added to `reader/scripts/check.mjs`. Last updated 11 Nov 2026, after the 13 Class 10 Science
chapters and Noor's feedback parts 1 and 2.

## A. Science and facts

1. **A slip in the science is the worst mistake.** Examples caught: "magnesium ribbon → powder" called a change of
   state (both are solids); "a splint simply goes out" given as the hydrogen test (hydrogen burns with a pop; going
   out is carbon dioxide). Rule: check every fact, sign, unit and direction twice; if unsure, leave it out.
2. **Activity numbers from memory were wrong** (1.2/1.3 swapped; 1.8 is silver chloride, not the iron nail). Rule:
   take every activity number and title from the current NCERT text, never from memory.
3. **Heat over the arrow vs "+ heat" on the product side** were mixed up. Rule: a condition needed for the reaction
   goes over the arrow; heat given out goes on the product side.
4. **NCERT has misprints** (Table 11.2 prints nichrome as 100 × 10⁻⁶ Ω m). Rule: use the true value; if NCERT differs,
   say "NCERT's table prints …" only where a student would meet it.
5. **A balanced equation shown in a lab before balancing is taught.** Rule: never show an answer, formula or method
   before the topic that teaches it; in early labs use word equations.
6. **Science beyond the chapter** slipped in without a label. Rule: mark it "for the curious", keep it short.

## B. Structure and completeness

7. **Topics with only text.** Rule: every topic has diagrams that explain the WHOLE topic (every key term shown with its
   meaning) — the checker fails the topic otherwise.
8. **Topics with no lab although NCERT has an activity** (pH in daily life, Tyndall effect, series resistors, heating
   effect, electromagnet, soap). Rule: a lab wherever a template can model it honestly; otherwise `why_no_lab` and a
   `lab_requests` entry.
9. **Open loops**: a hook ("why does a cut apple turn brown?") never answered; a skeletal equation never finished.
   Rule: every hook has a `close`; every started example is finished.
10. **Pools too small** (5 per topic, 10 per test) and **the correct answer in the same position** (option B in 45 of
    82). Rule: 8 per topic, 20 per test, positions spread (checker).
11. **Test mix wrong** (40/35/25). Rule: 50/20/30 by marks; mark a genuinely data-based MCQ `"comp": true` and never a
    plain one.
12. **A worked example missing in some topics.** Rule: every topic, with a faded "your turn".

## C. Hindi (Noor's part 2 rules)

13. **Shuddh Hindi where students speak simply.** Replace: फाटक→गेट, रंग (paint)→पेंट, प्रयोगशाला→लैब,
    परीक्षण/जाँच (a test)→टेस्ट, अध्याय→चैप्टर, विषय (topic)→टॉपिक, अंक (marks)→मार्क्स, चरण→स्टेप, आदर्श
    उत्तर→मॉडल आंसर, धूसर→ग्रे, चूर्ण→पाउडर, तश्तरी→प्लेट/चाइना डिश, प्रायः→अक्सर, स्वयं→ख़ुद, पंक्ति→लाइन,
    पक्ष (side)→तरफ़, भाग (part)→हिस्सा, आवश्यक→ज़रूरी, उपयोग→इस्तेमाल, विधि→तरीक़ा, वायु→हवा, भार→वज़न,
    कठोर→सख़्त, वास्तविक→असली, संबंध→लेना-देना, वायुरोधी→एयरटाइट, परखनली→टेस्ट ट्यूब (परखनली) first time.
14. **Keep the NCERT science terms** (अभिकारक, उत्पाद, अभिक्रिया, उपचयन, अपचयन, क्षारक …) with the English in brackets
    the first time in a topic. क्षारक is base; क्षार is alkali.
15. **Two names for one thing** (लेड/सीसा, ज़िंक/जस्ता, लोहा/आयरन, ताँबा/कॉपर, संकेत/लक्षण, पानी/जल, गतिविधि/
    क्रियाकलाप). Rule: one form per concept across the chapter and its labs; elements in English form with the Hindi
    name in brackets the first time in a topic.
16. **Gender drift** (जंग लगता/लगती; हाइड्रोजन पाता/पाती). Rule: जंग, हाइड्रोजन, ऑक्सीजन are feminine; fix each noun's
    gender once.
17. **Register drift** (करें inside तुम text). Rule: तुम everywhere except quoted board wording.
18. **Calques**: "follow the oxygen" → ऑक्सीजन का पीछा करो (wrong; देखो ऑक्सीजन कहाँ गई); "both go into 6" (wrong;
    जो 2 और 3 दोनों से पूरी कटती है); "pays the opposite price". Rule: write the Hindi fresh from the idea.
19. **Clause wedged before a postposition** (आयनों, जिन्हें आयन कहते हैं, में). Rule: split into two sentences.
20. **Incomplete or wrong verbs** (…जो रिबन को आग पकड़ने से रोकती।; गंध को देखो). Rule: every sentence has a complete
    verb that fits its subject.
21. **Hindi options with extra words** like "(असंतुलित)" that the English lacks — they give the answer away
    (checker).
22. **English words left in Hindi prose** (heat, sunlight, grey) and equations outside `{{eq:…}}` (checker).
23. **Units and digits** mixed (2 g / 2 ग्राम; चार for 4). Rule: digits as in English, one unit style.
24. **Word swaps alone are not enough.** Several Class 10 chapters were fixed by find-and-replace and still read
    awkwardly. Rule: read every Hindi sentence you write as a whole.

## D. Visuals and images

25. **Words baked into a picture** (an SVG with "Mg + O₂ → MgO" drawn in). Rule: every word is a `data-t` label; images
    carry no text.
26. **A diagram's animation name clashed with the page** (`@keyframes rise` blanked chapter 1). Rule: prefix every
    class and keyframe with the diagram's own id.
27. **Claiming what an image does not show** (a "cut planaria" image showing whole worms; a heart drawn mirror-wise;
    two pupils of different people). Rule: describe only what the image shows; Claude Code flags mismatches.
28. **Ray, current and field directions** must be exact (arrowheads the way light travels; current + to −; field
    N to S outside).

## E. Labs

29. **A guided step that blocks the action it asks for** (a step targeting one button while the child must press
    others). Rule: target the control the child must use (`inc:*` patterns where the template allows).
30. **Lab Hindi different from the reader's Hindi.** Rule: the same terms in both.
31. **Labs claiming more than the template shows** (a pH reaching 7 after one spoon). Rule: describe only what the
    simulation really does.
32. **A topic left without the lab it needs because no template existed.** Rule (Noor, 11 Nov 2026): build the new
    template (PROMPT §2a) as a general, reusable type; it joins the library for every later class.

## F. From the Class 10 Mathematics review (11 Nov 2026)

33. **Diagrams that are only boxes of words** (flowcharts) are not visuals. Show the mathematics itself: area/tile
    models, plotted graphs from computed points, number lines, constructions, solids, charts to scale.
34. **A viewBox wider than ~360 shrinks every label** (720 wide → labels at half size). Keep the viewBox ~360 wide and
    labels 13+ (checker: never under ~11 at phone width).
35. **Half the topics without a lab** — maths has something to do in almost every topic (plot, drag, build, measure,
    simulate). At most 30% of a chapter's topics may go without (checker).
36. **Leaving the starter labs file unchanged.** Rewrite it for your topics, in spoken Hindi.
37. **Lab check items in the wrong shape** (`answer: "a"`, `why` as an array). Lab items use `answer: <index>`,
    `why: {en, hi}`, `wrong: ["", {en, hi}, …]`; read `assets/example-labs.json`.
38. **Targets and events the template does not declare** (they make the guided lab freeze). Check every `do` step
    against the template's `keys()` for YOUR config (modes change them).
39. **Units in Hindi words** (सेमी). Units and digits stay exactly as in English (cm, m, km/h, 4).
40. **Referencing planned image names that the founder made differently.** Use the files that actually exist in
    `labs/assets/<class>/<subject>/` (a set may be one combined image; there may be extra "master poster" images) and
    use all of them.

