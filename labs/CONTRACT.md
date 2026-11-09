# NetCyberAI Labs: the contract every template and every lab follows

**Read this whole file before writing a template or a lab.** It is short on purpose. The founder's goal: a premium,
colourful, interactive lab for every topic that needs one, Classes 1–12, every subject, in English and Hindi, that a
child can use without help. Same engine everywhere; a template is built once and reused by many labs; a lab is
settings only (JSON), never code.

## 1. Folder layout

```
labs/
  index.html            the gallery and player (the engine) — do not edit unless your brief says so
  engine.js, styles.css the engine and its styles
  lib.js                shared helpers (NCA_LIB) and the template registry (NCA_T)
  catalogue.json        every template: id, what it does, its config shape, its control keys and events
  templates/<id>.js     one file per template
  defs/c<NN>/<subject_id>/<chapter key>.json   the labs of one chapter (NN = 01..12)
  assets/               images (the founder's photos, added later); assets/manifest.json maps asset id → file
  scripts/check.mjs     the checker: run `node labs/scripts/check.mjs` (add a path to check only that folder)
  scripts/index.mjs     builds labs/index.json from defs/
```

## 2. A template (`labs/templates/<id>.js`)

Plain browser JavaScript, no build step, no imports. It registers itself:

```js
(function () {
  const { esc, tx, tween, svgSub, eqHTML, loadScript } = window.NCA_LIB;
  NCA_T.register({
    id: 'optics',
    css: `.op-… { … }`,                // all its CSS, class names prefixed with its own short prefix
    validate(config) { return [] },   // pure: an array of error strings for a bad config; [] when good
    keys(config) { return { targets: ['object', 'lens', 'slider:*'], events: ['moved:*', 'image:real', 'image:virtual'] } },
    demo: { … },                      // a config that shows the template well (used by the gallery and the checker)
    mount(root, config, api) {        // draw into root; return { destroy() {} }
      …
      return { destroy() { /* stop animations, remove listeners on window */ } };
    },
  });
})();
```

- `validate` and `keys` must be pure and work under Node (no `document`, no `window` other than `NCA_LIB`).
- `keys(config).targets`: every value a lab's guided "do" step may put in `target`. Put `data-key="<target>"` on the
  matching control so the engine's spotlight finds it. `events`: every value a "do" step may put in `expect`.
  A trailing `*` is a wildcard (`pick:*`).
- **The `api` the engine gives you:**
  - `api.allowed(key)` → true if the child may use this control now. Call it before acting on any control; if false
    call `api.nudge(key)` and do nothing.
  - `api.emit(event)` → tell the engine what happened. Emit every event listed in `keys().events` when it happens.
  - `api.t(text)` → a `{en, hi}` text (or plain string) in the chosen language. **All words a child sees go through
    `api.t`; write both English and Hindi.** Read `api.lang()` at draw time, so a language switch shows on the next draw.
  - `api.speak(text, lang?)`, `api.record(line)` (one line for the tutor's log of what the child did),
    `api.toast(text)`, `api.celebrate()`.
  - `api.asset(id)` → the URL of a founder's image if it has been added, else `null`. Always draw a good fallback
    yourself (SVG or canvas) so the lab is complete without any image; use the image when it exists.
- **Domain rules live in the template, checked in code:** formulas, reactions, ratios, map data, grammar rules. A
  lab can only choose among things the template knows to be true. Never let a config set an impossible result.
- **Quality bar (this is a premium product):**
  - Colourful, polished, real-looking: gradients, soft shadows, smooth motion (requestAnimationFrame or CSS), clear
    big controls. Use the design tokens (CSS variables) listed in §6; template scenes may use their own fixed colours
    (a lab bench, a night sky) when they read well in both light and dark page themes.
  - Works on a 360 px phone and a 1440 px desktop: SVG with a viewBox or canvas sized to its container; controls at
    least 44 px; no sideways page scroll.
  - Respects reduced motion (`NCA_LIB.reducedMotion()`; `tween` already does).
  - Accessible: buttons are `<button>`, SVG controls get `role="button" tabindex="0"` and react to Enter and Space,
    every control has an accessible name, live results in an `aria-live="polite"` element.
  - No network except loading a pinned library from cdnjs.cloudflare.com with `NCA_LIB.loadScript` (only if the
    template truly needs one, e.g. three.js r128 for 3D); always fall back to 2D if it fails.
  - No `eval`, no `innerHTML` with unescaped config text (use `esc`), no external images.
- Look at `labs/templates/beaker.js` as the worked example.

## 3. A lab (`labs/defs/c<NN>/<subject_id>/<chapter key>.json`)

One file per chapter. The chapter key comes from `data/content/universal/syllabus/chapters.csv`.

```json
{
  "chapter_key": "u.c10.science.jesc1.ch01",
  "class": 10, "subject_id": "science", "title": "Chemical Reactions and Equations",
  "source": "https://ncert.nic.in/textbook/pdf/jesc101.pdf",
  "topics": [
    { "n": "1.1", "title": "Chemical equations", "labs": ["c10-science-jesc1-ch01-balance"], "why_no_lab": null },
    { "n": "1.3", "title": "Corrosion and rancidity", "labs": [], "why_no_lab": "Best taught by the photo sequence and the reader" }
  ],
  "labs": [ { …lab… } ],
  "images": [ { …image row… } ]
}
```

**A lab:**

```json
{
  "id": "c10-science-jesc1-ch01-signs",          // c<class>-<subject_id>-<book>-ch<nn>-<short slug>; letters, digits, -
  "topic": "1.1",
  "template": "beaker",
  "title": { "en": "Signs of a chemical reaction", "hi": "रासायनिक अभिक्रिया के लक्षण" },
  "minutes": 5,
  "level": "core",                                  // core (every child) or stretch (for the curious)
  "config": { …exactly the shape catalogue.json gives for this template… },
  "steps": [ …see below… ]
}
```

**Steps**, in this order, 5 to 10 in all: one or more `do` steps, one `predict` before the key `do`, an `explain`, a
`check` with 1–3 items, and a final `explore`.

| kind | fields |
|---|---|
| `do` | `target` (one of the template's targets), `expect` (one of its events), `say` {en, hi}: one short instruction naming the control the child should touch |
| `predict` | `say` {en, hi}, `options` [{ id, en, hi } × 2–4], `answer` (an option id) |
| `explain` | `say` {en, hi}: 2–4 sentences: what happened and why |
| `check` | `items`: [{ `q` {en,hi}, `options` [ {en,hi} or plain strings × 2–4 ], `answer` (index from 0), `why` {en,hi}, `wrong` [one per option: "" at the answer, otherwise {en,hi} saying what thinking leads there and why it fails] }] |
| `explore` | `say` {en, hi}: what to try freely |

- The `do` steps must be possible in order on the template from the config's starting state, and each `expect` must
  be an event the template really emits at that moment. The checker tests targets and events against `keys()`.
- Words: short sentences a child of that class reads without help; Indian everyday examples; true to the NCERT
  chapter; never copied from the textbook. Hindi: natural, simple, standard school terms (Devanagari).
- Safety: never ask a child to do something dangerous for real; labs show it virtually with an adult-only note.

**Image rows** (`images`), 5–8 per chapter, the format of `data/content/universal/plans/c10-science.json`:
`{ "n": 1, "kind": "OBJ|SCN|CUT|SEQ|MAC|3DM|MAP|DIA", "topic": "1.2", "use": "…", "shows": "…", "view": "…",
"right": "…", "avoid": "…" }`. Rules: `docs/family-app/13_IMAGE_GUIDE.md`. Reuse library images
(`data/content/universal/plans/library.json`) instead of repeating them.

## 4. When a lab is needed

Every topic gets a decision. A lab when doing, moving, building, sorting or experimenting makes the idea clearer than
reading: experiments, processes, cause and effect, geometry and graphs, maps and timelines, language building blocks,
accounting entries, algorithms. No lab when a photo, a story or the reader teaches it better; then `why_no_lab`
says so in one sentence. Most science, maths, geography, economics, accountancy and computer science topics get a
lab; literature lessons usually get one language lab per chapter (vocabulary, sequencing the story, grammar from the
lesson, poem rhythm) rather than one per paragraph.

## 5. Model of a good guided lab

`labs/defs/c10/science/u.c10.science.jesc1.ch01.json` is the reference (converted from the reviewed prototype).

## 6. Design tokens (CSS variables the page defines in light and dark)

`--bg --surface --sunk --line --ink --ink-2 --night --royal --royal-t --grape --grape-t --cyan --action --good
--good-t --bad --bad-t --sun --sun-t --stage`, fonts `--font-display` (Baloo 2) and `--font-body` (Mukta; both
have Devanagari). Logo colours for fills: royal #1D4ED8, electric #2563EB, cyan #02CFF9, turquoise #14B8A6,
emerald #0F766E, leaf #22C55E, grape #8B3DFF, violet #4400F0, tangerine #FF7A1A, coral #FF6B57, sunshine #FFD23F,
gold #F5B90A, midnight #061233. White text only on royal, electric, emerald, grape, violet, midnight; dark text
(#1E293B) on cyan, turquoise, leaf, tangerine, coral, sunshine, gold.
