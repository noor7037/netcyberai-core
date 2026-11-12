# Class 1 Family reader — first publishable slice

**Included in this change:** one complete chapter in English, Hindi and Mathematics, four short topics per chapter.

- Original bilingual inline SVG visuals for each topic.
- Existing Class 1 interactive lab definitions reused by exact IDs.
- Class 1 formative checks: three questions drawn from four; no pass gate and no chapter exam.
- Existing signed-in Family reader, selected child and progress store retained.
- CBSE catalogue IDs attached for the first board mapping only. The source catalogue is still marked `in_review`; this content does not claim official board approval.

## What remains

The repository has Class 1 lab-definition plans for 41 numbered chapters: 9 English, 19 Hindi and 13 Mathematics. This slice supplies the first three reader chapters. The remaining 38 numbered chapters need their complete lessons, visuals, labs/real-world activity decisions and subject/language review. Four additional unnumbered Hindi activities need separate mapping.

## Release checks

1. `node reader/scripts/index.mjs`
2. `node reader/scripts/check.mjs reader/content/c01`
3. `node reader/scripts/check_books.mjs`
4. Family app typecheck/build and signed-in Class 1 runtime test on phone and desktop, in English and Hindi.
5. Class 1 educator review and native Hindi review.
6. Founder review and explicit merge/deploy approval.

No production deployment is performed by this change.
