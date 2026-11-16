# Lab embeds, measured 16 Nov 2026 (v21)

Each host was fetched with `curl -sIL` (status and framing headers), then loaded in headless Chromium inside a sandboxed iframe
(`allow-scripts allow-same-origin allow-popups allow-forms`) on a blank page served with the Family app's production CSP
`frame-src` (`node scripts/sims/check_embeds.mjs`).

| Host | Sample | Status | Framing headers | Chromium iframe | Decision |
| --- | --- | --- | --- | --- | --- |
| PhET (en) | `phet.colorado.edu/sims/html/energy-forms-and-changes/latest/energy-forms-and-changes_en.html` | 200 | none | LOADED | embed |
| PhET (hi) | same, `_hi.html` | 200 | none | LOADED | embed |
| NASA Eyes | `eyes.nasa.gov/apps/solar-system/` | 200 | none | LOADED | embed |
| Virtual Labs (Amrita) | `vlab.amrita.edu/?sub=1&brch=74&sim=191&cnt=1` (Projectile Motion) | 200 | none (https) | LOADED | embed (source `vlabs`) |
| Virtual Labs home | `www.vlab.co.in` | 200 | none | not used | only an index of the institutes; the labs live on `vlab.amrita.edu` |
| OLabs | `www.olabs.edu.in/?sub=96&brch=50&sim=1&cnt=1` | 403 to scripts | `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self' https://www.youtube.com` | BLOCKED (`chrome-error://`) | link card only (source `olabs`) |

Other measurements: `http://vlab.amrita.edu/` answers 403 and `http://www.olabs.edu.in/` redirects to https, so only https
addresses are used (an http page cannot be framed inside our https page). `olabs.edu.in` (no www) sends
`X-Frame-Options: ALLOW-FROM https://www.olabs.edu.in` and redirects to `www`; framing is refused all the same.

## What the code does

- `SIM_HOSTS` has `vlabs: ['vlab.amrita.edu']` and `olabs: ['www.olabs.edu.in']`. `LINK_ONLY_HOSTS` (sim-hosts.ts) lists the hosts that
  refuse framing; `simMode()` gives `link` for them, `iframe` for the rest. No column was added to the table.
- `SimCard` shows the tap-to-load sandboxed frame for `iframe` hosts, and `LabLinkCard` for `link` hosts: title, source credit, one
  "Open lab" link (`target="_blank"`, `rel="noopener noreferrer"`, 44 px). Words: `fam.elab.labOpen`, `fam.elab.labNote` (en, hi,
  understand-words).
- `FAMILY_FRAME_HOSTS` in next.config.js gains `vlab.amrita.edu` and loses `www.geogebra.org`; `www.olabs.edu.in` is not in the
  `frame-src`, because it is never framed.
- Migration `20261116220000_sims_more_sources.sql` replaces the `source` check (adds `olabs`, `vlabs`, drops `geogebra`); no row is touched.

## OLabs rows

OLabs answers scripts with 403 (and its pages with 500 now and then), so the builder cannot fetch the lab pages. The rows come from the
site's own lab listing (subject pages `?sub=1` Physics, `73` Chemistry, `79` Biology, `80` Maths, `96` Science Classes 6 to 8), saved
in `scripts/sims/olabs-listing.json` as `[subject, class, query, title]`; the title is the listing's own image name for the lab. A link
card opens the lab on OLabs' own site in a new tab, so a lab address that moved would show the site's own page. Re-capture the listing
from a browser if the site changes.

## Virtual Labs scope

Amrita's labs are written for university students. The 24 kept map to Classes 7 to 12 topics they plainly show (heat transfer by
conduction, convection and radiation, projectile motion, collisions, Kirchhoff's laws, acid-base titration, Doppler effect and so on).
Labs that are clearly degree-level (Anderson's bridge, Kater's pendulum and the like) are not seeded.
