# 13 — Image guide for NetCyberAI lessons and labs

> **Concept-image standard (Noor, 9–11 Nov 2026) — supersedes the "simple image" briefs below where they differ.**
> Every image explains a whole idea: 3D objects as a set of views (front, side, three-quarter, top), cutaways and
> exploded views for insides, frames for processes, real Indian scenes for applications; exact geometry and colours;
> no words in any image. Plans use the columns in `handover/PROMPT_IMAGE_PLAN.md`; the first such plan is
> `data/content/universal/image-plans/Class-10-Mathematics-images.csv`.


**Who / for whom / what:** the build lead for Noor, who makes the images. Every chapter's image plan (one row per
image, in `data/content/universal/image-plans/`) follows these rules, so the images look like one product, teach
the idea, and drop straight into the reader and the labs.

---

## 1. What our images are for

Not book illustrations. Each image has one teaching job: make a child *see* the idea. So every image is:

- **Real-looking:** photographic or high-quality 3D render, true colours, true proportions, real Indian settings.
- **About one idea:** the thing the step teaches is big, sharp and in the centre; nothing else competes.
- **Free of words:** no labels, arrows, numbers or captions baked in. The app adds them on top, in English or
  Hindi, and can highlight or animate them. One image then serves both languages.
- **Original:** made by you for NetCyberAI. Never a copy or a close redraw of a textbook figure, a website image or
  another brand's artwork.

## 2. The eight kinds of image (the plan names one for each row)

| Code | Kind | What it is | Format |
|---|---|---|---|
| **OBJ** | Object cut-out | One real object on a transparent background, for labs and drag-and-drop: a beaker, zinc granules, a leaf, a coin, a magnet | PNG with transparency, object fills about 80% |
| **SCN** | Scene | A real Indian situation that opens a topic: a rusty gate in the monsoon, a vegetable market, a farm at sowing time | JPG, 16:9 |
| **CUT** | Cut-away or inside view | What you cannot normally see: inside the heart, a leaf in cross-section, layers of the Earth, inside a dry cell | PNG or JPG, 4:3, clean neutral background |
| **SEQ** | Sequence | 3 to 6 frames of the same thing changing, same camera, same light: a nail on day 1, 3, 7, 14; Moon phases; a seed growing | Separate files, numbered, same size |
| **MAC** | Close-up or microscope | Magnified views: onion peel cells, a crystal, a fabric weave, iron filings around a magnet | JPG, square |
| **3DM** | 3D model views | One object shown from 4 to 6 fixed angles (front, side, top, three-quarter, inside), so the app can turn it | PNG with transparency, same size and centre |
| **MAP** | Map or terrain base | Relief, rivers, a city block, a historical site, without any names or borders drawn in | JPG or PNG, 16:9 or 4:3 |
| **DIA** | Diagram base | A clean drawing the app labels: a circuit layout, a balance sheet form, a timeline strip, a flowchart frame | PNG or SVG, white or transparent |

## 3. Rules for every image

1. **Size:** at least 2048 px on the long side (cut-outs at least 1500 px). Larger is better.
2. **Light:** soft, even, natural light. Cut-outs and 3D views lit from the top left, with a soft shadow kept on a
   separate layer if possible.
3. **True science:** colours and shapes must be right: copper sulphate solution is clear blue, rust is reddish
   brown, a dicot leaf has net veins, a parallel circuit really is parallel. The plan's "Must be right" column lists
   what to check.
4. **Indian context:** Indian homes, schools, markets, fields, food, festivals, money (₹), plants, animals and
   people of all regions; girls and boys equally; no stereotypes.
5. **Safety:** anyone handling chemicals, fire or electricity wears goggles (and gloves where needed) and works
   with an adult. Never show a child doing something unsafe.
6. **People:** no identifiable child unless a parent has given written consent for this use. Hands, backs and
   distant figures are fine. No real public figures except historical portraits that are free to use.
7. **Nothing to remove:** no text, logos, brand names, watermarks, signatures or school names in the picture.
8. **Age fit:** Classes 1–2: bright, simple, one big object, friendly. Classes 3–5: real objects and places,
   uncluttered. Classes 6–8: real detail, measurement visible (rulers, scales, thermometers). Classes 9–12: precise,
   technical, true to scale.
9. **Colour-blind friendly:** when two things must be told apart, they differ in shape or pattern too, not only in
   red against green.

## 4. Names and delivery

- **File name:** the image ID from the plan, then a short word. Example: `C10-SCI-CH01-03_zinc-in-acid.jpg`.
- **Shared images:** objects used in many chapters (beaker, test tube, Indian rupee coins, world map base) have IDs
  starting `LIB-`, for example `LIB-LAB-beaker-250ml.png`. Make each once; every chapter reuses it.
- **Folders:** one folder per class and subject, for example `Class-10/Science/`, with all its chapters' files
  inside; a `Library/` folder for the `LIB-` images.
- **Sequences and 3D views:** add `-f1`, `-f2` … or `-front`, `-side`, `-top`, `-34`, `-inside`.
- **Tick the row:** in the plan sheet, set Status to "Done" for each image you deliver; add a note if you changed
  anything.

## 5. If you make images with an AI image tool

The plan's "Prompt" column is written to paste into an image generator. Then check the image against the "Must be
right" column before you keep it: AI tools often get science wrong (extra fingers, wrong colours, impossible
circuits, mirrored text, wrong maps). Redo it rather than keep a wrong one; a wrong picture teaches the wrong thing.
Make sure the tool's terms let you use the image commercially.
