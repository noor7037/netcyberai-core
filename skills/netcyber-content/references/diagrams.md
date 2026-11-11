# Diagram cookbook (the `diagram` step)

A diagram must let a student explain the **whole topic** with the text covered: every key term labelled with its short
meaning, every stage of a process drawn, cause beside effect, before beside after. Use 2–3 diagrams when one cannot
carry it all. They are inline SVG inside the chapter JSON; the reader fills every label in the current language.

## The frame

```json
{ "type": "diagram",
  "title": { "en": "How a convex lens forms a real image", "hi": "उत्तल लेंस असली प्रतिबिंब कैसे बनाता है" },
  "svg": "<svg viewBox=\"0 0 360 260\" xmlns=\"http://www.w3.org/2000/svg\"><style>.c9t8d1-ray{stroke:#E8702A;stroke-width:2;fill:none;stroke-dasharray:6 6;animation:c9t8d1-flow 1.6s linear infinite}@keyframes c9t8d1-flow{to{stroke-dashoffset:-12}}</style> … <text data-t=\"lens\" x=\"170\" y=\"30\" font-size=\"14\" fill=\"#1C1B1A\" text-anchor=\"middle\"/> … </svg>",
  "texts": { "lens": { "en": "Convex lens: thick in the middle", "hi": "उत्तल लेंस: बीच में मोटा" } },
  "caption": { "en": "…", "hi": "…" }, "alt": { "en": "…", "hi": "…" }, "notice": [ { "en": "…", "hi": "…" } ] }
```

## Rules (the checker enforces the hard ones)

- One `<svg>` with a `viewBox` about 360 wide (360 × 220 to 360 × 420). Under 12 KB.
- Every word is an empty `<text data-t="key" …/>` with `texts[key]` in both languages. A `<text>` may hold only
  digits, symbols or a formula directly.
- Labels: `font-size` ≥ 13, short (≤ 4–5 words; put the longer meaning in a second label line or in `notice`), placed
  where they do not overlap at 360 px; use `text-anchor`.
- **Prefix every class and keyframe** with `<chapter>t<NN>d<N>-` (e.g. `m3t2d1-`). A shared name once blanked a chapter.
- Motion: CSS `@keyframes` only, gentle (2–4 s loops), on what really moves (rays, current, blood, particles, a needle).
  The reader stops motion under reduced motion, so the still frame must also tell the story.
- No `<script>`, no `on…=`, no `<image>`, no `<foreignObject>`, no external `href`.
- Locked Family colours: ink `#1C1B1A`, muted `#4B5563`, line `#E7E1D6`, paper `#FFFDF9`, saffron `#E8702A` (action,
  rays), saffron-deep `#C2410C`, teal `#0F766E` (correct, current, healthy), plum `#6D28D9`, blush/red `#B42318`, sky
  `#0369A1`; tints `#E4F3EA` `#FBF1D3` `#EFE9FB` `#FBE6E3` `#E3EEF9`. Never colour as the only cue: add shape or label.

## Exactness by subject

- **Optics:** rays straight, arrowheads in the direction of travel, principal axis, F, 2F, C marked at true
  proportional positions; the image where the formula puts it.
- **Electricity / magnetism:** conventional current + → −, standard circuit symbols, field lines N → S outside, closed
  loops, never crossing; Fleming's rule axes perpendicular.
- **Chemistry:** particles to scale relative to each other; arrows from reactants to products; equations in the
  text, not in the art (or as formula-only `<text>`).
- **Biology:** correct orientation (heart: the patient's left on the page's right), flow direction arrows, organs in
  proportion.
- **Maths:** compute coordinates (do not eyeball): plotted points on true scales, right angles that are right, equal
  lengths equal, tick marks for equal sides, arcs for angles.
- **Geography:** north arrow, scale bar if distances matter, not a real map tracing.

## Patterns that work

| Topic shape | Diagram |
| --- | --- |
| Process | numbered stages left → right or a loop, an animated token moving through |
| Cause → effect | two panels with an arrow, the changed variable highlighted |
| Compare | side-by-side columns with the same layout, differences highlighted |
| Structure | the object with leader lines to labels, then a zoomed inset of the key part |
| Law / formula | the quantities drawn as things (lengths, areas, bars) with the equation built from them |
| Classification | a tree or a sorted grid with one example per class |
| Time | a timeline with spaced, labelled events |

Check every diagram yourself in both languages at 360 px before you finish (the smoke test renders the reader;
labels must not overlap or run off the edge).
