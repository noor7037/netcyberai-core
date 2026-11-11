# Labs: choosing, writing and building them

A lab is a guided simulation the child operates: **predict → do → explain → check → explore**. It sits in the topic
after the idea has a name. Every topic that has an NCERT activity, a natural experiment, a process to explore or a
skill to practise gets one. `why_no_lab` is only for topics where doing adds nothing beyond the diagrams.

## 1. Choose

1. Open `lab-library.md` (every template, its config, targets and events). Pick the template that models the idea
   **honestly** (it computes the behaviour; it does not just show pictures).
2. Look at the chapter's existing labs in `labs/defs/c<NN>/<subject>/<chapter key>.json`: keep the good ones (fix
   their Hindi to your `TERMS.md`), improve weak ones, add what is missing.
3. Nothing fits → build a template (§3).

## 2. Write a lab (in the chapter's labs file; format `labs/CONTRACT.md` §3)

- 5–12 steps: one `predict` (2–4 options, the answer id), `do` steps with a `target` the template declares and an
  `expect` event it emits, one `explain`, one `check` (1–3 items: `q`, `options`, `answer`, `why`, `wrong` with an
  explanation for every wrong option), and `explore` last.
- A `do` step's `target` must be the control the child presses (use the template's `*` patterns, e.g. `inc:*`, when
  several controls are fine). Never target one control while the child must use another — the lab would block them.
- Never show the answer, formula or method before the topic teaches it.
- Describe only what the simulation really does (if the pH reaches 1.3, do not say 7).
- Bilingual, with the same terms as the chapter.
- Then test it: `node labs/scripts/check.mjs <labs file>` → 0 problems; if you can, play it in a browser
  (`labs/index.html?embed=1&lang=hi#<lab id>` after the lead adds it to the index).

## 3. Build a new template (lead agent only)

Copy `assets/template-skeleton.js` to `labs/templates/<id>.js` and read `labs/CONTRACT.md` §2. Models to study:
`labs/templates/balance.js` (counting and rules), `labs/templates/scatter.js` (two modes, a scene and a slider),
`circuit.js` (a full simulator), `sort.js` (cards and bins).

Design rules:

- **General, reusable, configurable.** Think "what is the family of activities?" — a compass-and-ruler construction
  bench, a probability experiment runner, a map with layers, a budget simulator, a body-system explorer, a code
  sandbox, a sentence builder. The config chooses the case; `validate` rejects impossible configs.
- **Honest model.** Compute physics, chemistry, probability, geometry, finance from the real rules. If the real thing
  is unsafe or impossible (surgery, explosions, the Sun's core), model the idea safely and say what is simplified.
- **Contract:** `NCA_T.register({ id, css, validate, keys, demo, mount })`; `keys(config)` returns every `targets`
  pattern and `events` name; `mount(root, config, api)` uses `api.t` for every visible word, `api.allowed(key)` before
  acting (call `api.nudge()` if not), `api.emit(event)` for every event `keys` lists, `api.record`, `api.celebrate`;
  returns `{ destroy }`.
- **UI:** buttons/inputs with `data-key`; ≥ 44 px targets; keyboard usable; CSS classes prefixed with the id; Family
  colours via the CSS variables (`--ink`, `--surface`, `--action`, `--good`, `--bad` …); no motion under
  `prefers-reduced-motion`; no sideways scroll at 360 px; no network, no libraries, no storage of personal data.
- **Test:** `node labs/scripts/check.mjs --templates-only` and `node labs/scripts/smoke.mjs <id>` (390 and 1280 px,
  English and Hindi), then look at `labs/.smoke/<id>-390-hi.png`.
- **Register it:** add the catalogue entry (same fields as `labs/catalogue.json`) to
  `content-inbox/c<NN>-<subject>/catalogue-additions.json` and list it in `DONE`. Claude Code reviews and publishes
  it into the library.
