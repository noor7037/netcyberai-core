# 3D models: sources and licences (W19-D)

Every file under `public/models/` is listed here with where it came from, its licence and its author. A model key whose
source is `asset` in `src/lib/family/models/catalog.ts` must have a row here (test/family/models.test.ts checks it).
The other keys are `procedural`: built by our own code from simple shapes (`src/lib/family/models/procedural.ts`), with
no outside asset and nothing to credit.

## Anatomy assets (CC BY-SA 4.0)

| File | Size | Parts kept (node groups) | Cut from |
|---|---|---|---|
| `public/models/brain.glb` | 758 KB | frontal_lobe, parietal_lobe, temporal_lobe, occipital_lobe, cerebellum, midbrain, pons, medulla, hypothalamus | `systems/sinir.glb` |
| `public/models/eye.glb` | 119 KB | cornea, iris, lens, sclera, retina, vitreous, optic_nerve (right eye) | `systems/sinir.glb` |
| `public/models/heart.glb` | 206 KB | right_atrium, left_atrium, right_ventricle, left_ventricle, aorta, pulmonary_artery, vena_cava, pulmonary_veins, valves, coronary_arteries | `systems/dolasim.glb` |
| `public/models/lungs.glb` | 388 KB | trachea, bronchi, right_lung, left_lung, epiglottis | `systems/ic-organlar.glb` |
| `public/models/digestive.glb` | 658 KB | mouth, salivary_glands, pharynx, oesophagus, stomach, liver, gallbladder, pancreas, small_intestine, large_intestine, appendix | `systems/ic-organlar.glb` |
| `public/models/excretory.glb` | 60 KB | kidneys, ureters, bladder, urethra | `systems/ic-organlar.glb` |

**Source repository:** https://github.com/DrMuratAltun/anatomi-simulatoru, commit
`37e85dfbbb398e11ba33c8f0e411f06f9bba592f` (7 Aug 2026), files `systems/*.glb`. Its `LICENSE-DATA.md` licenses the
3D data under **CC BY-SA 4.0** (the code there is MIT; we took no code); its `ATTRIBUTION.md` names the upstream works.

**Attribution (required by the licence):**

- BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under CC BY-SA 2.1 Japan
  (https://lifesciencedb.jp/bp3d/).
- Z-Anatomy, the libre 3D atlas of anatomy, licensed under CC BY-SA 4.0 (https://www.z-anatomy.com/,
  https://github.com/Z-Anatomy/Models-of-human-anatomy).
- Converted to web glTF by Dr. Murat Altun (anatomi-simulatoru, CC BY-SA 4.0).

**What we changed:** kept only the meshes of the listed parts (by their Terminologia Anatomica names, side suffix
`.l`/`.r` read), grouped each part's meshes under one node named by our part key, dropped textures and materials (the
viewer colours each part from the logo tokens), welded, quantized and compressed the geometry (EXT_meshopt_compression,
glTF-Transform 4.2.1). Anatomical shape unchanged. The script and part lists are not shipped; the lists are the
catalogue's parts.

**ShareAlike:** these six files are derivative works and are distributed under **CC BY-SA 4.0**. Anyone who copies
them, or a model made from them, takes on the same licence. This does not reach our code or the rest of the app.

**Candidates checked and not used:** SustainHawaii/anatomy-viewer (CC BY-SA 4.0, from Z-Anatomy): its GLBs had every
system joined into a few meshes, so no part could be lit on its own. Sketchfab and 3d.nih.gov were not reachable from
the build sandbox.

## Procedural models (no outside asset)

plant_cell, animal_cell, flower, neuron, dc_motor, electromagnet, solar_system, earth_layers, atom, water_cycle, leaf:
schematics with correctly placed, correctly named parts, drawn by our code. Not to scale (the solar system's sizes and
distances, the magnified stomata); the screen calls them "a model", never "real".
