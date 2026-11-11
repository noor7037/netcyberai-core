# Prompt: write the concept-image plan for one subject

Used by Claude Code (or, if Noor chooses, another AI) before a subject is written. The result is the list of images
Noor generates and the only image names the writer AI may use.

## Standard (Noor, 9–11 Nov 2026)

Every image is a **concept image**: a student who looks at it understands the whole idea it serves.

- 3D where the idea is 3D or spatial: a set of views of one object (front, side, three-quarter, top), cutaways and
  cross-sections for the inside, exploded views for how parts fit, sequences of frames for a process, before/after
  pairs, real Indian scenes for applications.
- Exact: right geometry and proportions, true colours, correct anatomy and apparatus, correct directions.
- No words, numbers, letters or labels in any image; leave clear space around the parts the app will label with
  numbered pins.
- Plain light background for models and diagrams; natural light for photos; Indian settings; any gender in any role;
  no logos; no close-up faces of children.
- Several files of one set share the same object, style, light and camera distance.

## Inputs

The NCERT chapter texts of the subject (current edition), the subject's `labs/defs/c<NN>/<subject>/*.json` (topics and
old image rows), `docs/family-app/13_IMAGE_GUIDE.md` (naming), and an existing plan as a model
(`data/content/universal/image-plans/Class-10-Mathematics-images.csv`).

## Output

1. `data/content/universal/image-plans/<Class>-<Subject>-images.csv` (UTF-8 with BOM), one row per file, columns:
   `file_name, chapter, chapter_title, topic, image_id, set_role (single|front|side|34|top|cut|exploded|f1…),
   priority (P1|P2), kind (PHOTO|SCENE|3D-MODEL|3D-CUTAWAY|3D-EXPLODED|MULTI-VIEW|SEQUENCE|DIAGRAM-ART), concept,
   must_show, accuracy, composition, pin_targets, prompt (60–120 words, ready to paste, ends with "no text, no
   numbers, no labels"), negative_prompt`.
   File names: `C<NN>-<SUBJ>-CH<NN>-<NN>_<slug>[-suffix].png` (SUBJ: SCI, MAT, HIS, GEO, POL, ECO, ENG, HIN, PHY, CHE,
   BIO, ACC, BST, CSC …).
2. `<Class>-<Subject>-images.md`: how to generate, the per-chapter list, totals, the first 10 to make.

Cover every topic: each topic gets at least one image that explains it; 8–14 image IDs per chapter for science and
maths, fewer for languages (scene images for stories and poems, never a picture of the text).
