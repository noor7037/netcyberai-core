# Visual sources v21: 3D, animation and the keyless picture sources

Checked live on 16 Nov 2026. "Verified" means a real request to the address in the table got the sample result shown.
Every adapter is a server-only file under `src/lib/family/visuals/`, loaded with `import()` at answer time. Each one
throws `RateLimited` on HTTP 429 (through `adapter-kit.ts` `getJson`), is called through `guarded(source, fn)`, and
fails quietly. A source with no key is skipped and logged once per server process.

## 3D models (`models3d.ts`, asked with the tutor's English `q3d` term for each step)

| Source | Endpoint | Key | Licence handling | Verified | Sample |
|---|---|---|---|---|---|
| PubChem | `pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{term}/cids/JSON` | none | public domain | yes | glucose: CID 5793 (3D SDF) |
| RCSB PDB | `search.rcsb.org/rcsbsearch/v2/query` | none | CC0 | yes | amylase: 1BVN |
| NASA 3D Resources | no API; `data/nasa3d.json` lists 95 models from `science.nasa.gov/3d-resources` (glb + png on `assets.science.nasa.gov`, each under 8 MB) | none | public domain | yes (index built from the live pages) | "Mars 2020 Perseverance Rover" |
| Khronos glTF samples | raw addresses in `KhronosGroup/glTF-Sample-Assets` (5 curated models, not copied) | none | CC0 or CC BY 4.0 per model (`metadata.json`) | yes | Fox (CC BY 4.0 + CC0, 163 kB) |
| Smithsonian 3D | `api.si.edu/openaccess/api/v1.0/search?q={term} AND online_media_type:"3D Models"` | `SMITHSONIAN_API_KEY` or `DATA_GOV_API_KEY` | media `3d_voyager` with `usage.access == "CC0"` only; Draco glb (about 2 MB) | yes (with the public `DEMO_KEY`) | "Cassiopeia A Supernova Remnant" |
| Sketchfab | `api.sketchfab.com/v3/search?type=models&downloadable=true` then `/v3/models/{uid}/download` | `SKETCHFAB_TOKEN` (download only) | CC0, CC BY, CC BY-SA; never NC, ND, Standard, Editorial; downloadable, not age-restricted, staff picks first | search yes; download not (no token here) | "Wind Turbine" / CC Attribution |
| Poly Pizza | `api.poly.pizza/v1.1/search/{term}` | `POLY_PIZZA_API_KEY` | CC0 or CC BY only | no (no key here; code unchanged from v20) | - |
| Poly Haven | `api.polyhaven.com/assets?t=models` (list cached a day), `/files/{id}` | none | all CC0 | yes | "potted plant": planter_box_01 |
| NIH 3D | none found (`3d.nih.gov/api/*` answers 404) | - | - | no: marked planned | - |
| BodyParts3D | OBJ bulk files only | - | CC BY-SA | marked planned | - |
| ambientCG | textures only | - | CC0 | marked planned (not a model) | - |
| Kenney, Quaternius | zip packs only | - | CC0 | marked planned | - |

Notes:
- Sketchfab's download address is signed and expires after a few minutes. The still picture (`media.sketchfab.com`) stays
  when it has expired. Before Sketchfab carries much traffic, the shared cache should keep a copy of the glb in storage.
- The viewer (`glb-viewer.ts`) now decodes Draco (decoder in `public/draco/`, about 250 kB, Apache 2.0, from the
  `three` package; fetched only for a Draco model) and loads a `.gltf` with its files. Every file a model names must be
  on the model's own host (Poly Haven textures are mapped to their `jpg/` folder).
- `raw.githubusercontent.com` is accepted only under `/KhronosGroup/glTF-Sample-Assets/` (`photo-hosts.ts` `HOST_PATH`).

## Animation

LottieFiles has no public key, so its API is never called. Instead `public/anim/` holds 15 small SVG animations we
drew ourselves (CC0, 14 kB in total, logo colours, CSS motion that stops under reduced motion), listed in
`public/anim/index.json` (id, title, English tags, licence, credit, source). `anim-source.ts` matches an English
term to a file. A step with a `q3d` term and no 3D model may show the animation (pic kind `animation`, address
`/anim/{id}.svg` only). The client part is `AnimPic.tsx`, loaded with `next/dynamic`.

Set: wind-turbine, water-cycle, heartbeat, pendulum, earth-orbit, day-night, electric-circuit, sound-wave,
plant-growth, photosynthesis, breathing, atom, volcano, gears, magnet.

## Picture sources

| Source | Endpoint | Key | Licence handling | Verified | Sample |
|---|---|---|---|---|---|
| The Met | `collectionapi.metmuseum.org/public/collection/v1.1/search` plus `/v1/objects/{id}`. The old `/v1/search` answers 410 (retired 1 Oct 2026). | none | `isPublicDomain === true` checked on each object (v1.1 ignores the filter) | yes | "sunflowers": Van Gogh, object 436524 |
| Cleveland Museum of Art | `openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1` | none | `share_license_status == "CC0"` | yes | "Elephant" (1982.10) |
| Iconify | `api.iconify.design/search?prefixes=noto,fluent-emoji-flat,twemoji` | none | only those 3 sets: Apache 2.0, MIT, CC BY 4.0 | yes | twemoji:sunflower |
| NASA Earth Observatory | `science.nasa.gov/wp-json/wp/v2/posts?search=&_embed=wp:featuredmedia` (only `/earth/earth-observatory/` posts) | none | public domain; skipped when the caption says copyright or courtesy | yes | "Extratropical Cyclone Whips Past Iceland" |
| Library of Congress | `loc.gov/photos/?fo=json` | - | - | no: bot challenge (403); planned | - |
| CDC PHIL | `phil.cdc.gov/api` redirects to the website | - | - | no JSON API; planned | - |
| ESA / Hubble / Webb | no JSON search | - | - | planned | - |
| OpenStax figures, Servier Medical Art, Mixkit | no public API | - | - | planned | - |
| unDraw | an undocumented site search only | - | its licence forbids building a collection | not called; planned | - |
| Openclipart | its JSON search redirects to the home page | - | - | planned | - |

The new picture adapters are registered in `SOURCES`. Adding them to the routes in `routeFor` is a job for the
infrastructure slice: Met and Cleveland for history and art, Earth Observatory for geography, Iconify for the
youngest classes.
