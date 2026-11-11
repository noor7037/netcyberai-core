# Images: using planned concept images, and writing image plans

## Using images in a chapter

- Only file names from the subject's image plan (`data/content/universal/image-plans/<Class>-<Subject>-images.csv`),
  without the extension. Never invent one. If a topic needs an image the plan lacks, add a row to
  `content-inbox/<…>/image-requests.csv` (same columns as the plan) and use a diagram meanwhile.
- A set (`-front`, `-side`, `-34`, `-top`, `-cut`, `-exploded`, `-f1`…) becomes one `figure` with `images` in order.
- `caption`, `alt`, `notice` ("what to notice") in both languages; `labels` on the plan's `pin_targets` with x/y as a
  percent of the image (estimate; Claude Code corrects pins on the real image). `img` is the frame index for a label.
- Describe only what the plan says the image shows; Claude Code checks every delivered image against its brief and
  reports mismatches before publishing.
- The chapter hook image is usually the plan's `…-01_…` scene.

## Writing an image plan (concept-image standard)

Follow `docs/family-app/handover/PROMPT_IMAGE_PLAN.md`. The essentials: every image explains a whole idea; 3D objects
as view sets, cutaways and exploded views; processes as frames; applications as real Indian scenes; exact geometry and
true colours; no words, numbers or labels in any image, with clear space for pins; one row per file with concept,
must-show, accuracy, composition, pin targets, a 60–120-word prompt and a negative prompt. Model plan:
`Class-10-Mathematics-images.csv`.
