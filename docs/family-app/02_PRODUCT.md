# 02 — Product: one family app, two modes

**Revised 2026-10-20 (C230-I).** The study core is now a dynamic learning loop (§4), not a pre-written library;
English, careers and opportunities are full experiences (§6–§8); the free plan is one subject per child (§10,
`05`).

## 1. Mission

**Make every school day easier to understand and every exam easier to prepare for, for the child and the parent, in
the family's own language.** A feature that does not help a child understand, practise, check their understanding,
or take a real next step is not built.

## 2. Users

| User | What they need | How they use the app |
|---|---|---|
| **Parent** (the account holder, an adult) | To know how the child is doing and how to help, without calling the school or paying for coaching first | Phone, a few minutes a day: summaries, the plan's exam date, opportunities, school fees if linked |
| **Student** (a child profile; own device by pairing after launch) | To understand a topic, practise, revise to a plan, improve English, see where their subjects can lead | The parent's phone or a paired device; 15–30 minutes a day |
| **School** (indirect) | Families who read what it sends | Only when the school is on NetCyberAI and the family links |

## 3. Two modes in one app

- **Standalone:** any family, any school. The learning loop, English, careers and opportunities work with no school.
- **Connected:** a child linked to a NetCyberAI school (`03` §4) also gets the school's information (§9) and the
  school's own syllabus and day feed the learning loop. Unlinking removes the school's information at once; the
  family's own learning record stays.

One account holds several children; each is standalone or connected on their own. The home shows modules from the
registry by mode, entitlement and flag; nothing is hard-coded.

## 4. The learning loop ("Understand", internally the Concept Resolver)

**Name:** inside the code and docs it is the **Concept Resolver**. "Single-shot" is dropped because follow-ups and
practice are the point, and "dynamic" says nothing a reader needs. The family sees **Understand** (Hindi:
**समझें**).

**Inputs** (any of them):
- a topic picked from the child's syllabus;
- a search;
- a typed or spoken question;
- a photo or screenshot of a textbook page, worksheet or question.

**The response** is assembled for this child (class, board, language, the topic's place in their syllabus, what they
got wrong before on it) from **typed blocks** chosen to fit the question:

| Block | Used when | Notes |
|---|---|---|
| Explanation | always | Simple words, an everyday Indian example or analogy, then steps; English terms beside the family's language |
| Worked example | problems | Every numeric step checked by a calculator, not trusted from the model (`03` §6) |
| Diagram | structures, processes, relations | Mind map, flowchart or concept map drawn by our renderer from a structured description |
| Graph or construction | maths, physics | Interactive plot, number line, fraction model, geometry construction |
| Timeline or map | history, geography | Events with dates; places on our own outline maps |
| Simulation | where one materially helps | Only vetted simulations whose licence allows our use (`03` §6, gate L7) |
| Video | when a suitable one exists | From the video finder (§5); the response never depends on it |
| Understanding check | always | 2–3 short questions that test the idea, with feedback on each answer |
| Practice | always | A few questions; mistakes feed the mastery loop (§4.2) |
| English moment | relevant topics | 3–5 lines (§6.1) |
| Sources | facts, definitions, dates | Links to official pages (the NCERT chapter, the board) from an allowlist; never invented URLs |

**Follow-ups** stay on the topic: "simpler", "another example", "explain differently", "show me a diagram",
"practise more". This is not an open chat.

**Reliability:**
- Every response is marked as AI-made until a reviewer approves it.
- Responses for frequently asked topics are queued for review; once approved, they carry a "reviewed" mark and are
  served from the cache.
- "Report a mistake" on every block withdraws a reviewed response until it is fixed.
- The model never produces code or HTML: it fills the fields of known blocks, and our components draw them.

### 4.1 Chapter to confidence

The loop every input leads into: **input → explanation → understanding check → practice → the topic's progress on the
child's syllabus → a revisit later.** Progress means checked understanding, never "opened" or "read". It is one flow,
not a separate feature.

### 4.2 Misconception to mastery

- Practice and check questions carry wrong options written to catch specific misunderstandings (each tagged with the
  misconception it reveals).
- A wrong answer brings an explanation of that exact gap from a different angle, two or three targeted questions, and a
  revisit after 3 and 10 days.
- A topic counts as **mastered** when it is answered correctly on two separate days at least a week apart.
- **Gate L2:** only the child's own answers are used, the parent can see and delete them, and nothing else about
  behaviour is recorded.

### 4.3 Tonight's practice (connected children)

Practice on exactly what the class covered today, from the Teacher App's taught-today log. Only NetCyberAI can do this.
It is a learning tool, so the subject entitlement applies (§10).

### 4.4 Revision plan, exam-day kit and past papers

- A day-by-day plan to an exam date, reflowing from today when a day is missed.
- The exam-day kit: countdown, paper pattern and checklist, with the board's official link.
- Practice from the board's **published sample papers and marking schemes** (CBSE publishes both on
  cbseacademic.nic.in), mapped to syllabus topics.

## 5. Video inside the response

- **Found per topic, not hand-curated:**
  - The video finder searches official and reviewer-approved channels first, then the wider catalogue.
  - It ranks candidates on what the provider gives: title, description, chapter timestamps, duration, language,
    channel, whether captions exist, and whether it may be embedded and is made for children.
  - It keeps the best few per topic and language, and sends the child to the right timestamp when the description has
    chapters.
- **Limits:**
  - YouTube's official API does not hand out captions of other people's videos, so relevance is judged from metadata,
    and confirmed by a reviewer for promoted picks.
  - Search quota is about 100 searches a day by default, with no paid tier, so results are cached per topic and
    refreshed within YouTube's data-storage rules.
- **Honest player:**
  - The privacy-enhanced embed, no autoplay, tap to load.
  - The screen says plainly that the video comes from YouTube, which may show ads and suggestions. We do not hide or
    block them, because the provider's terms forbid it.
- **No video, no problem:** the response stands on its own.
- **Not used:** transcript scrapers (against the provider's terms); embedding DIKSHA or NCERT videos inside the paid
  tier (non-commercial licence: we link out instead).

## 6. English

### 6.1 The English moment (free, inside responses)

Three to five lines tied to the topic:
- one or two key words with their meaning in the support language;
- one model sentence;
- one pattern to reuse;
- a "say it" prompt.

Shown in simple English with Hindi or the chosen support language where it helps.

### 6.2 The 90-day English programme (Family Plus)

| Part | Design |
|---|---|
| Levels | CEFR-aligned: Pre-A1 to B1 for school students, A2 to B2 for older students and parents |
| Day | 15–20 minutes: a story or dialogue, 5–8 words in spaced repetition, one grammar point, interactive practice, a speaking task, a short writing task |
| Skills | Grammar, vocabulary, sentence building, everyday conversation, listening, speaking, reading, writing, comprehension, confidence |
| Contexts | School, everyday life, the child's career interests (§7); later the domain packs (§6.4) |
| Support language | Explanations in Hindi or the selected language when needed, fading as the level rises |
| Progress | Assessed, never ticked: a skill counts only after correct answers on two separate days at least a week apart |
| Assessment | A placement test on day 0, a checkpoint each week, and full assessments on days 45 and 90 (reading, listening, vocabulary and grammar items; speaking and writing on a fixed rubric) |

**The fluency guarantee is withdrawn.**
- Cambridge English estimates about 200 guided learning hours to move one CEFR level (`01` E16). Ninety days at 20
  minutes is about 30 hours.
- **What we promise:** measured progress, shown to the family.
  - The day-0 and day-90 assessment scores, side by side.
  - The can-do statements achieved (for example "introduce myself and my school", "describe a process in my
    subject", "answer five common interview questions").
  - The words retained on spaced checks.

### 6.3 The English practice partner (after launch, a pilot behind a flag)

- **What it is:** a voice conversation with roleplay (school, everyday life, an interview), pronunciation and
  vocabulary feedback, and a transcript the family can read and delete.
- **Feasible technically:**
  - realtime voice APIs answer in under a second;
  - browsers on Android and iOS support it, with a server-issued short-lived token so no key reaches the phone.
- **Cost:** at current published rates, voice costs roughly $0.02 to $0.10 a minute depending on provider (`01` E17).
  A 15-minute daily default would cost about $10–45 per active child a month, far above any family price the pilot is
  likely to bear.
  - The limit stays configurable in Control.
  - The default, and whether this is in Plus or an add-on, is a founder decision taken on measured cost
    (`00` decisions).
- **Child safety before any pilot:**
  - The provider's terms must allow minors: OpenAI asks for zero data retention for under-13 data and parental consent
    from 13 to 17, and some Google generative AI terms have restricted under-18 use (`01` E18).
  - A separate consent purpose (`voice_practice`); age 13+ at first.
  - Push-to-talk, topic-bound roleplays, moderation, no audio kept by us.

### 6.4 Domain packs (after launch)

Interviews, office communication, business, IT and technology, finance and corporate English, and medical terminology
(vocabulary only, never medical advice):
- 20–30 scenario lessons each, with roleplay;
- for class 11–12 students and parents;
- built on the core programme's engine.

## 7. Careers: the pathway explorer

- **For:** class 8–12 students and parents.
- **Journey:**
  1. Where you are: class or qualification, stream, subjects.
  2. Interests, strengths and constraints: a short questionnaire, and the parent's input.
  3. Pathways as a branching map and a timeline: eligibility, required subjects, entrance exams, recognised courses,
     skills, projects, internships and milestones.
  4. The next three actions.
- **Accuracy rule:** pathways come from a **vetted pathway graph**.
  - Every step (for example "MBBS needs Physics, Chemistry and Biology in class 12 and NEET-UG") carries its official
    source and the day it was checked.
  - The AI explains and personalises routes **through the graph**; it cannot invent a step.
  - Cross-stream moves (Arts to IT or analytics, Commerce to law or civil services, Science to the judiciary through a
    law degree) appear only where a real route exists, with its prerequisites and restrictions.
  - Long horizons such as "chief executive" are shown as typical stages with plain uncertainty, never as a route that
    guarantees the role.
- **Trends:** sector and occupation information from the National Career Service and NCO-2015, and labour data from the
  Periodic Labour Force Survey, each with its source and year. No salary or demand claim without a source.
- **Coverage:** India first. About 100–150 occupations and every common route from class 10 and class 12 to work at
  launch, extended by reviewers. Never "complete worldwide".

## 8. Opportunities and readiness

- **Types:** scholarships, government schemes, competitive and entrance exams, olympiads, admissions; recruitment
  notices open to class 10/12 pass students later.
- **Each item:**
  - eligibility as structured rules plus the conditions in the notice's own words;
  - deadlines, fees, a document checklist and the application steps;
  - the official notification and application link;
  - the day it was last checked.
- **Matching** uses only the profile fields the parent chose to give (class, state, category, income band, gender) and
  says **"likely eligible: check these conditions"** or **"not eligible because …"**. Never "eligible", and never a
  promise of success.
- **The readiness tracker, per child:**
  - matched items;
  - the family's own yes/no against each required document (no document images by default, never an Aadhaar
    number);
  - deadlines with reminders;
  - the next action.
- **Freshness:**
  - Nothing is shown before a person approves it.
  - Each item carries "last checked".
  - A closed item archives itself.
  - An item past its check interval is hidden until rechecked.
- **Scope:** central sources and one pilot state first; more states as reviewer capacity allows (`07` §4).
- **Free always.**

## 9. School information (connected children only)

| # | Module | Source in the school system |
|---|---|---|
| C1 | Today at school | attendance, taught-today log, homework |
| C3 | Fees, Pay Now, receipts | fee ledger, family payment link, receipts; its own section, never beside learning |
| C4 | Attendance calendar | attendance, school calendar; an unmarked day says "not marked" |
| C5 | Report cards, notices, events | published exams, class notices, school events |
| C6 | PTM booking | PTM slots, by the reply path's rules |
| C7 | Homework hand-in | homework; the Aadhaar rule on every file |
| C8 | Study material | the child's teachers' shared material |
| C9 | How to help at home | Parent AI (C196), the school's module |
| C10 | **Daily Pulse** | The Pulse built in P2. The day's dinner-table question about what was taught; the parent answers "Answered well" or "Needs teacher follow-up". The second feeds the teacher's existing follow-up queue. One Pulse per class per school day at most, inside quiet hours. |

All of these work by WhatsApp too where the school's WhatsApp is live (C84). Bulk files and sensitive details never go
by WhatsApp.

## 10. Free and paid at a glance (detail in `05`)

| Always free | Family Plus (or sponsored by the school) |
|---|---|
| All school information (§9) for linked children | All subjects in the learning loop |
| The learning loop for **one subject per child** | Custom syllabus set-up from uploaded index pages for more subjects |
| English moments; opportunities and readiness; career exploration; the weekly summary; the Learning Vault | The 90-day English programme; higher doubt and photo limits; saved career plans with reminders; vault export |

## 11. Learning Vault

- The child's own timeline: checked progress, practice history, milestones, and documents the family keeps.
- School-issued certificates carry their existing verification link (`/verify/<token>`, C228), so a reader can confirm
  them; items the family adds are marked "added by family".
- After launch: an admission dossier as a PDF.
- At 18, the student can take the vault over.
- It never shows money, and it stays when a school link ends.

## 12. Syllabus

| Source | How it arrives | Who sees it |
|---|---|---|
| The school's syllabus (connected) | Kept by the school in its syllabus map (P2); a school-side import from index pages, once per class, subject and year, is an ERP Setup slice, not a family-app one | The school's linked children, read through School Link |
| The catalog (any family) | Chapters and topics from the boards' official curriculum documents, starting with CBSE classes 6–10 | Every family |
| A family's own (standalone) | The parent photographs the contents or syllabus pages (up to 5 images or a 10-page PDF; not the whole book); extraction proposes units, chapters and topics; unclear lines are asked, never guessed; the parent confirms | That family only; matched to the catalog when it is the same book |

Only structure is kept (titles of units, chapters and topics). Uploaded pages are deleted once the syllabus is
confirmed, or after 7 days at most.

## 13. Not built, and why

| Not built | Why |
|---|---|
| Advertising of any kind | DPDP section 9(3) bars targeted advertising at children; trust |
| Ranks, leaderboards, class comparisons; punishing streaks | The Constitution's rule for parents; anxiety (`01` E4) |
| Open chat, or chat between children | Child safety; the resolver stays on the topic |
| AI-generated videos; 3D models as a default | Cost and accuracy; vetted 2D components and simulations do the job |
| Model-written code or HTML in the app | Security: only our own components render |
| Focus Hours with parental monitoring | A web app cannot control other apps, and monitoring a child is a DPDP risk. After launch: a child-started study timer that pauses our own notifications, with nothing reported unless the child logs it. |
| A positive class story feed | Teacher workload and media consent; revisit with pilot schools |
| Selling or sharing family data; loans; sales calls; copying NCERT or DIKSHA text | Law and trust (`01`) |
| "Guaranteed fluency", "guaranteed eligibility", "X% accuracy" | No unsupported claims |

## 14. Gates that hold the launch, not the build

| Gate | What must be true | Who |
|---|---|---|
| L1 | The lawyer approves the privacy notice, the consent words and method (Rule 10), transient processing of textbook photos, and the disclaimers on careers and opportunities | Founder with the lawyer |
| L2 | The lawyer says whether the mastery loop is "behavioural monitoring" for a non-school fiduciary, and its limits | Founder with the lawyer |
| L3 | An AI provider whose current terms allow use by children (with zero retention where required), a key, and caps (P-AI) | Founder |
| L4 | Reviewers for promoted responses, opportunities and career pathways | Founder appoints; Control queues |
| L5 | The live server key (roadmap action 8) | Founder |
| L6 | YouTube API terms complied with (branding, data refresh, privacy disclosure) and a quota extension applied for before scale | Build + founder |
| L7 | Licences for third-party interactive content confirmed (PhET's commercial use; GeoGebra and Desmos only under a licence) | Founder |

## 15. Definition of done for the first public release (`07` FA-7)

1. A parent signs up and consents, adds two children of different classes, and their homes differ by class.
2. Each child has a syllabus (catalog, school, or confirmed from index pages) and an entitlement of one free subject.
3. From a topic, a search, a question or a photo, the child gets a response with fitting blocks, checks and practice;
   progress moves only on checked understanding; mistakes come back.
4. A video appears when a suitable one exists, with the honest player note, and is absent otherwise.
5. A linked child gets C1–C10; unlinking removes them in the same request.
6. Opportunities show only approved items, "likely eligible" with conditions, and reminders; career pathways show only
   vetted steps with sources.
7. The English moment appears on relevant topics; the 90-day programme measures progress on days 0, 45 and 90.
8. Control shows counts, flags, AI routing, budgets, health and the review queues, and no child's personal data.
9. Every screen passes the family rules: English and Hindi, 360 to 1440 px, 44 px targets, reduced motion, a data-saver
   mode.
10. Gates L1–L7 are closed.

## 16. Silent failures to guard against

| Failure | Guard |
|---|---|
| Another family's child appears | RLS on `family.*` keyed to the account, tested with two accounts on every table |
| School data still visible after unlinking | Link status checked on every school read; a same-request test |
| A wrong worked answer | Numeric steps recomputed by a calculator; a mismatch drops the block |
| An invented source link | Links only from allowlisted domains; checked to resolve |
| A child's name, number or photo of a person reaches a model | Pre-processor on text; images screened; a CI test inspects the provider call |
| Model output runs as code | Only typed blocks render; a test feeds script into every block field |
| AI or video quota runs out silently | Caps and quotas in Control; a clear message at the limit; the response degrades without video |
| A stale opportunity shown as open | Hidden past its check interval; archived after its last date |
| A career step that does not exist | Pathways only from vetted graph edges with sources |
| A family charged for school information | The registry test: no school-information module carries a paid entitlement |
| The phone keeps a family's pages after sign-out | The service worker never stores `/api`; sign-out clears it; tested |
