CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, in a fresh window on the founder's Mac, for Noor, a non-technical founder. This builds Family App milestone M1, "the signature slice", which also builds the platform parts every app needs (Control → AI, Control → Content, Control → Apps v1), as a stack of PRs on base main, and stops after M1. Work by CLAUDE.md, challenge this brief with evidence where it is wrong, and report in plain words, founder actions first.

START
- Work in the netcyberai-core folder. Run `git fetch origin main` and start from the latest main; it includes C230-L and C230-M.
- You are the only builder. If another window or tool is working in this repository, stop and tell the founder.

READ ONCE
- CLAUDE.md, and Decision Log C230-H to C230-M.
- docs/34_ECOSYSTEM_AND_SYNC.md (how every app connects; Android; reviewers).
- docs/family-app:
  - 00;
  - 02 §4;
  - 03 §2, §3, §5, §6, §7, §11 and §14;
  - 07 §1 (the M1 row) and §3;
  - 09 §4;
  - 10 §1–§5 and §9;
  - 11.
- The mockups are in docs/family-app/mockups/, for look and scope only.
- Do not clone the founder's reference repository. Never open the weekend prototype.

WHY THIS IS A REBUILD
PR #198 tried M1 and was rejected and closed (C230-L). Its failures are your "never" list below. Do not reuse its branch or any of its code.

SCOPE: the M1 row of 07 §1, as a stack. Database and auth PRs stay under about 1,500 lines each.

1. M1-1 Schema (lead, serial).
   - Tables:
     - family: accounts, consent ledger (append-only: purpose, granted or withdrawn, time), children, attempts, topic progress;
     - content: boards, syllabus versions, units, chapters, topics (stable ids, English and Hindi titles, source URL and "checked on", status draft → in review → published, the importing account and the approver), responses (status, "AI-made" until checked);
     - Control: settings, app flags with audiences, audit.
   - Forced RLS with restrictive policies. Grants revoked from public, anon and authenticated. No foreign key into public.*.
   - A progress row must belong to a child of the same account (a composite key).
   - Tests: RLS with two accounts; scripts/check_family_boundary.py.
   - Apply to the test database first, then production, in PR order.
2. M1-2 Identity (lead, serial).
   - Sign-in code:
     - the email code is random, stored hashed, expires in 10 minutes, allows 5 tries, and is rate-limited;
     - it is sent by src/lib/email/sender.ts.
   - Session:
     - a signed family session (reuse src/lib/auth/jwt.ts signing) with its own cookie and claims type;
     - a staff session is refused on family APIs, and the reverse (tests).
   - Consent: an explicit study_core consent tap comes before any processing.
   - Add a child: first name only, class 6–10, CBSE, language (English or Hindi), explanation style (English, Hindi or Hinglish), state (no default).
   - The child switcher. Many families share one phone, so switching child is one tap.
   - Settings and privacy: see and delete answers; delete the account, which erases every family row.
3. M1-3 AI platform, thin (agent A, after M1-2).
   - Grow src/lib/ai/provider.ts into capability adapters and feature profiles.
   - Credentials:
     - sealed: encrypted at rest and decrypted only inside the server call;
     - write-only in Control → AI, and setting one needs the authenticator.
   - The family.resolver profile accepts only providers marked as cleared for minors. Choosing another provider is refused (test).
   - The pre-processor: no child identifier in the outgoing request, tested on the real request body.
   - Caps per family per day come from Control settings, and the cap message is tested.
   - Usage is metered without prompts.
   - The stand-in adapter is for tests only. With no key, the app says "Explanations are not switched on yet".
   - When this PR is up, ask the founder for the AI key in your report and tell him where to enter it (Control → AI). Never ask for a key in chat, a file or the repository.
4. M1-4 Content library, thin (agent B, beside M1-3).
   - Control → Content:
     - CSV import;
     - the importing account drafts and the founder approves; the same account can never approve its own draft;
     - staff preview before everyone;
     - a diff between versions;
     - one-step rollback.
   - Commit the CBSE 2026-27 Mathematics and Science catalog for classes 6–10 as a CSV in the PR, so the supervisor can check it:
     - draft it from the board's official curriculum document, with the source URL and page on every line, status "in review";
     - if the official 2026-27 document cannot be fetched or read, stop and list it as a gap. Never guess a chapter.
5. M1-5 Understand (after M1-3 and M1-4).
   - Inputs: chapter, topic or typed question.
   - Output: streamed typed JSON blocks (explanation, worked example, key points, diagram, check, practice, English moment, sources), validated against a schema and rendered only by our components.
   - Numbers in worked steps are recomputed. Links come from the allowlist.
   - Cache key: topic, class, language, style and prompt version.
   - Follow-ups: simpler, another example, explain differently, practise more.
   - Labels: "AI-made" until the founder approves; then "checked by NetCyberAI". Never "reviewed by a teacher".
6. M1-6 Learning and home (after M1-5).
   - Checks give a hint first. A wrong answer brings a different explanation plus 2–3 targeted items.
   - Progress moves only on checked answers.
   - One free subject per child, through the registry.
   - The parent's calm card.
   - The five-tab shell, where each tab shows only when its first module is live.
   - Hindi complete.
7. M1-7 Control → Apps v1 and Control → Family counts (agent C, beside M1-5).
   - Versions, flags with audiences, kill switch, banner, audit and rollback (10 §2, §7).
8. M1-8 Android readiness (lead, last).
   - Make the Family app ready to package as a Trusted Web Activity (docs/34 §8):
     - the web manifest (name, start URL /family, scope, colours from design-tokens.ts);
     - maskable icons;
     - an offline page;
     - a /.well-known/assetlinks.json route whose fingerprint comes from an environment variable;
     - the packaging configuration, with no keys in the repository.
   - Check on a 360 px budget-phone profile.
   - If the founder's Play account exists, build an internal-test package and give him the steps to install it. Otherwise list the account as a founder action.

NEVER (from #198 and the prototype audit)
- A fixed, guessable or logged sign-in code.
- An unsigned session token.
- Product data held in server memory.
- Consent recorded without the parent's tap.
- Invented "verified" dates, sources or reviewer names, or "NCERT" or "official" labels without a real source.
- Demo data outside src/demo-fixture/.
- Canned text shown as AI.
- A child's full name.
- A default state.
- Any code that locks or watches other apps (docs/34 §9 gates it).
- A placeholder git identity.
- No Co-Authored-By line and no model name anywhere.

MODELS AND AGENTS
- The strongest model for M1-1, M1-2 and M1-3 (auth, RLS, personal data, credentials).
- At most three agents at once, each in its own worktree with the template S brief (08 §2). Migrations stay serial with the lead.
- Decision Log rows C247–C255 are reserved for M1.

GATES (07 §3, including "Before a milestone is done")
- Reviews:
  - M1-1, M1-2 and M1-3: /code-review medium plus /security-review;
  - UI slices: /code-review low.
- Harness pictures of every family screen at 360, 390 and 1440 px, in English and Hindi, with reduced motion on and off.
- Run the full ci_local.sh once, on the top of the stack.

REPORT
- Use the Transparent Output Template, founder actions first, short.
- Include a demo script the founder can follow on his phone, in Hindi.
- Include every gate's real output and the quality evaluation's pass rates.
- If no AI key has been entered, say "M1 built, not done", and name the one founder action that closes it.
- Stop after the M1 stack.
