CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, for Noor, a non-technical founder. P1 makes the app ready for the first pilot: 50 children of Class 5, studying EVS (C230-S). Work by CLAUDE.md; challenge anything wrong with evidence; report in plain words, founder actions first. P1 comes before M2b (the Focus Lock).

**Superseded in part (C230-T, 2026-10-22):** the founder moved the pilot to an internal demo (Class 6 Science, synthetic data) and deferred the cutover again. P1's built slices (open subjects, checked-only explanations, EVS Hindi names, channels, the runbook) stay. The next work is `W2_PLATFORM_PROMPT.md`.

WHAT THE PILOT IS
- **Who:** 50 children of Class 5, on a parent's phone, in the web app (netcyberai.com/family, added to the home screen).
  - The pilot does not wait for the Play Store or the Focus Lock.
- **What:** "Class 5 Science" is EVS. NCERT's subject is *The World Around Us*; its book is *Our Wondrous World* (हमारा अद्भुत संसार), filed as `evs`. It has 10 chapters and 67 topics.
- **How long:** two weeks.

WHAT A CLASS 5 CHILD GETS TODAY (queried on the test database, 2026-10-22)
- Class 5 EVS v1 is `in_review`, not released, so the Study page shows no chapters.
- All 67 topics have no Hindi name.
- No AI profile has a provider (`family.resolver = none`), so nothing can be explained, and there are 0 cached responses for Class 5 EVS.
- **The free-subject trap.** The first subject a child opens becomes the free one, so a child who taps Mathematics first loses EVS.
  - `family.free_subjects_per_child` is in Control, but no code reads it: changing it does nothing.
- **The state-board gap.** A child registered under a state board (`ST-xx`) gets no catalog, because only CBSE/NCERT and CISCE catalogs exist.

YOURS, IN THIS ORDER (one slice each; size and review rules as CLAUDE.md)
1. **Hindi topic names for Class 5 EVS.**
   - Take the 67 topic names from NCERT's Hindi edition (`ehev101`–`ehev110.pdf`), as #256 did, with the PDF and page per line.
   - Load them as v2, in review.
   - Never translate.
2. **The pilot subject is always open.**
   - Every pilot child can open EVS, whatever subject they tap first.
   - Either make `family.free_subjects_per_child` work, or add a Control setting that names subjects open to every child. Choose with evidence, and record it in the Decision Log.
   - A setting Control shows must never do nothing.
3. **Reviewed explanations before day 1.**
   - Once Noor has entered the AI key, make the explanation for every Class 5 EVS chapter and topic (77 lines × English and Hindi = 154) through the resolver.
   - They go to Control → Content → Responses to review.
   - A pilot child sees only reviewed responses for catalog lines. Typed questions stay live, under the existing safeguards.
   - Report how many passed, and how many were withdrawn and why.
4. **Video channels for Class 5 EVS (C230-R).**
   - Propose official education channels (for example NCERT's own), each channel ID checked against the channel's page, for Noor to approve in Control → Videos.
5. **The production cutover (C103), now scheduled by the supervisor.**
   - Real children's data never goes into the test database.
   - Write the runbook first: a clean replay of every migration on production; the schema fingerprint compared with test; the Vercel production variables switched to production; a sign-in smoke test; a rollback.
   - Do it only after Noor has approved the Supabase Pro plan, which brings backups and leaked-password protection (C296).
6. **The board of the pilot school.**
   - Map it to the catalog the school teaches from: a state board school that teaches from NCERT's books gets the NCERT catalog.
   - Wait for Noor's answer on the school's board before building this.
7. **Then M2b**, the Focus Lock (07's row, docs/34 §9). Write its plan file and a Decision Log row first.

DEFINITION OF DONE FOR P1
- A Class 5 test child, in Hindi and in English, sees EVS open with all 10 chapters and 67 topics named in their language.
- Every chapter and topic opens a reviewed explanation.
- The pilot runs on the production database, with backups on; the test database holds no real child.
- The harness photographs the Class 5 EVS screens at 390 and 1440, in English and Hindi, with no problem.

GATES: 07 §3, as before. No Co-Authored-By line and no model name anywhere.
