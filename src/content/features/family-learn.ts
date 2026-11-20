import type { FeatureDetail } from './types';

// The five Family learning feature pages (C533). Every sentence follows what the Family app does today
// (src/lib/family, src/components/family, the fam.* words) and docs/website/ECOSYSTEM_FACTS.md.
export const features: FeatureDetail[] = [
  {
    slug: 'family-ai-tutor',
    audience: 'family',
    name: 'AI tutor',
    blurb: 'Ask by typing, speaking or a photo',
    icon: 'tutor',
    tone: 'intelligence',
    title: 'An AI tutor that answers in your child’s own language',
    lead:
      'Your child types, speaks or photographs a book page, and the tutor explains it in English, Hindi or Hinglish. A concept comes with pictures, simulations and short videos chosen for that topic, and a sum is explained first, then solved step by step.',
    metaDescription:
      'A tutor for school subjects that answers in English, Hindi or Hinglish, explains with pictures and short videos, solves sums step by step and takes calls.',
    howItWorks: [
      { title: 'Ask in any way', detail: 'Your child types a question, speaks it, or takes a photo of a book page or homework question. They can also ask a doubt while reading a chapter.' },
      { title: 'Hear it in their language', detail: 'The answer comes in the language set for the child: English, Hindi or Hinglish.' },
      { title: 'See the idea', detail: 'A concept is explained with pictures, simulations, 3D models and short videos chosen for that topic, followed by questions to check understanding.' },
      { title: 'Sums, step by step', detail: 'A sum is explained first, then solved in small steps, and ends with “Samajh aaya? Ya dobara alag tareeke se samjhaun?”.' },
      { title: 'Say it did not land', detail: 'The tutor remembers the chat. Reply “samajh nahi aaya” and it explains the same problem another way, not a new topic.' },
      { title: 'Or call the tutor', detail: 'Your child can talk to the tutor on a voice call and see pictures and steps appear on a board as it explains.' },
    ],
    whatYouGet: [
      'Answers in English, Hindi or Hinglish, matched to your child',
      'Explanations with pictures, simulations, 3D models and short videos for the topic',
      'Sums taught first, then solved step by step',
      'A tutor that remembers the chat and can re-explain the same problem',
      'Typing, speaking, photos and a voice call, so a child can ask the way they like',
      'A Learning Vault where only you, behind your PIN, can see and clear what was asked',
    ],
    whoUsesIt: [
      { role: 'Child', text: 'Asks any school question in their own words and gets it explained until it makes sense.' },
      { role: 'Parent', text: 'Switches on what the child may use, and sees the questions and files in the Learning Vault.' },
    ],
    faqs: [
      { question: 'Is it safe for my child?', answer: 'Every question and every answer goes through a safety check. Questions are for school subjects, and personal details such as an ID card in a photo are refused.' },
      { question: 'Do photos and voice need my permission?', answer: 'Yes. Photos and files, and speaking or calling, each need a parent to say yes in the parent area first. A recording is turned into words and not kept.' },
      { question: 'What if my child does not understand the answer?', answer: 'They reply “samajh nahi aaya” and the tutor explains the same problem in a different way.' },
      { question: 'Does it work without a NetCyberAI school?', answer: 'Yes. The Family app is for any family, with or without a NetCyberAI school.' },
      { question: 'What does it cost?', answer: 'Ask us about Family plans.' },
    ],
    related: ['check-my-work', 'study-chapters-labs', 'parent-controls-progress'],
  },
  {
    slug: 'check-my-work',
    audience: 'family',
    name: 'Check my work',
    blurb: 'Your own working, marked step by step',
    icon: 'check',
    tone: 'success',
    title: 'Check my work: a photo of your own working, marked',
    lead:
      'Your child photographs the working they wrote by hand and the app marks it line by line. It shows which steps are right and where the first mistake is, so they learn from it instead of just seeing a tick or a cross.',
    metaDescription:
      'Take a photo of your own handwritten sum and get it marked step by step. Plain arithmetic is checked by the app itself, so a right line is never called wrong.',
    howItWorks: [
      { title: 'Choose Check my work', detail: 'In the tutor, your child picks Check my work and takes a photo of their own answer. It must be a photo, not a PDF.' },
      { title: 'The working is read', detail: 'The app reads the question and each line of the child’s working from the photo. A blurry photo is not guessed at: it asks for a clearer one.' },
      { title: 'Each step is marked', detail: 'Every step is marked right or not yet, with a short reason.' },
      { title: 'Sums are settled by arithmetic', detail: 'Where a line is plain arithmetic, the app works it out itself, so a correct line is never marked wrong.' },
      { title: 'Learn from the mistake', detail: 'Your child can ask for a hint or for the idea to be explained another way.' },
    ],
    whatYouGet: [
      'Marking of the child’s own working, one step at a time',
      'Plain arithmetic checked by the app, not left to guesswork',
      'A clear message when the photo cannot be read, instead of a made-up answer',
      'Hints and another way to understand, not just the final answer',
      'A typed version too: a child can type “Check my work” with a sum',
    ],
    whoUsesIt: [
      { role: 'Child', text: 'Finds out where a sum went wrong, in their own handwriting, without waiting for a teacher.' },
      { role: 'Parent', text: 'Switches photos on once in the parent area. A homework photo is read once and not kept.' },
    ],
    faqs: [
      { question: 'Is it safe for my child?', answer: 'The photo and the marking go through a safety check, and a photo that seems to show an ID card or ID number is refused and not kept.' },
      { question: 'Does it need my permission?', answer: 'Yes. A parent switches on photos and files in the parent area before a child can send one.' },
      { question: 'What if the handwriting is hard to read?', answer: 'The app says it could not read the working and asks for a clearer photo in good light, with one sum on each line.' },
      { question: 'Does it give the answer?', answer: 'It marks the child’s steps and gives hints. The aim is for the child to find and fix the mistake.' },
    ],
    related: ['family-ai-tutor', 'study-chapters-labs', 'parent-controls-progress'],
  },
  {
    slug: 'study-chapters-labs',
    audience: 'family',
    name: 'Chapters and labs',
    blurb: 'Interactive chapters, tests and revision',
    icon: 'academics',
    tone: 'product',
    title: 'Interactive chapters, labs and tests in one place',
    lead:
      'Study has chapters your child can read, listen to and explore, with animated diagrams, labs and simulations. Today it covers Classes 1, 2 and 3, and Class 10 Science and Mathematics, and more classes are being added.',
    metaDescription:
      'Interactive chapters with animated diagrams, labs and simulations, chapter tests, quizzes and revision. Works with a data saver and chapters saved for offline.',
    howItWorks: [
      { title: 'Open a chapter', detail: 'Your child picks a subject and a chapter in Study, and can read it or hear it read aloud, sentence by sentence.' },
      { title: 'Explore it', detail: 'Animated diagrams, labs and simulations sit inside the chapter, with questions to check as they go.' },
      { title: 'Ask a doubt', detail: 'A doubt can be asked right where they are reading, and the tutor answers about that part.' },
      { title: 'Take the chapter test', detail: 'Each chapter has a test. Choice questions are marked by the app, and written or photo answers are kept for a parent or teacher to read.' },
      { title: 'Revise what was learnt', detail: 'After a session with the tutor, a short quiz is made from it and comes back for review on later days.' },
      { title: 'Save data', detail: 'Turn on the data saver for text first with no pictures or videos, or save a chapter on the phone to open without internet.' },
    ],
    whatYouGet: [
      'Chapters for Classes 1, 2 and 3, and Class 10 Science and Mathematics',
      'Read-aloud for a chapter’s text',
      'Animated diagrams, labs and simulations inside the chapter',
      'Chapter tests, and quick quizzes made from what the child asked the tutor',
      'Review quizzes that come back later so the learning sticks',
      'A data saver, and chapters saved for offline on the phone',
    ],
    whoUsesIt: [
      { role: 'Child', text: 'Reads, listens, tries a lab and tests themselves, all in one chapter.' },
      { role: 'Parent', text: 'Sees chapter tests the child sent, and a weekly report after a week with the tutor.' },
    ],
    faqs: [
      { question: 'Which classes are covered?', answer: 'Classes 1, 2 and 3, and Class 10 Science and Mathematics. More classes are being added.' },
      { question: 'Is it safe for my child?', answer: 'Chapters are authored content. Anything the tutor says in answer to a question goes through a safety check first.' },
      { question: 'Does it work without internet?', answer: 'A chapter saved for offline opens without a connection, and answers given offline are checked when the internet is back. Asking the tutor needs internet.' },
      { question: 'Are written answers marked?', answer: 'No. The app marks choice questions only. Written and photo answers are kept for a parent or teacher to read against the points given.' },
      { question: 'What does it cost?', answer: 'Ask us about Family plans.' },
    ],
    related: ['family-ai-tutor', 'your-own-syllabus', 'parent-controls-progress'],
  },
  {
    slug: 'your-own-syllabus',
    audience: 'family',
    name: 'Your own syllabus',
    blurb: 'Add your child’s own school syllabus',
    icon: 'timetable',
    tone: 'action',
    title: 'Add your child’s own syllabus, or ask for a chapter',
    lead:
      'If your child’s class or board is not in the app yet, a parent can add the chapters of their own books, read from a PDF of the contents or from photos. Your child then sees them in Study and can ask the tutor to explain any chapter or topic.',
    metaDescription:
      'Add your child’s own syllabus from a PDF or photos of the contents pages, or ask us for a missing chapter. Your child studies it in the app.',
    howItWorks: [
      { title: 'Choose child and subject', detail: 'In the parent area, pick the child and the subject the syllabus is for.' },
      { title: 'Add the contents', detail: 'Upload a PDF of the contents or syllabus pages, take photos of the contents pages, or type the chapters yourself.' },
      { title: 'Check every line', detail: 'The chapters and topics read from the book are shown as a draft. Fix a name, remove a line, reorder, or add one that is missing.' },
      { title: 'Save', detail: 'Nothing reaches your child until you save. Then the chapters show in Study.' },
      { title: 'Study and ask', detail: 'Your child opens a chapter or topic and asks the tutor to explain it.' },
      { title: 'Ask for a chapter', detail: 'If a chapter is missing, send its name, with a PDF if you can. You can follow the request in Study.' },
    ],
    whatYouGet: [
      'Your child’s own chapters and topics in Study',
      'Reading from a PDF or contents-page photos, or typing, with a check before anything is saved',
      'A parent who stays in charge: edit, replace or delete the syllabus any time',
      'A way to ask for a missing chapter, reviewed by our team before it appears',
    ],
    whoUsesIt: [
      { role: 'Child', text: 'Studies the chapters from their own school books and asks the tutor about any of them.' },
      { role: 'Parent', text: 'Sets the syllabus up once, checks it and keeps control of it.' },
    ],
    faqs: [
      { question: 'Is it safe for my child?', answer: 'Please send contents pages only, with no names, faces or ID cards. A page that seems to show personal details is refused. The photo is read once and not kept.' },
      { question: 'Does it need my permission?', answer: 'Yes. Learning must be switched on in Privacy before a syllabus can be added.' },
      { question: 'Does it read the whole book?', answer: 'No. It takes the chapter and topic names. The tutor then explains a chapter or topic when your child asks.' },
      { question: 'What if my PDF is a scan?', answer: 'A scan has no text to read. Take photos of the contents pages instead, or type the chapters.' },
      { question: 'What happens to a chapter request?', answer: 'It is received, then prepared by our team, and shown as published when ready. A PDF you send is seen only by our reviewer and is removed afterwards.' },
    ],
    related: ['study-chapters-labs', 'family-ai-tutor', 'parent-controls-progress'],
  },
  {
    slug: 'english-speaking-practice',
    audience: 'family',
    name: 'Spoken English',
    blurb: 'Short daily lessons and live talk',
    icon: 'chat',
    tone: 'communication',
    title: 'Spoken English in short lessons, and live practice',
    lead:
      'The English course teaches speaking in short daily lessons, grouped into units, at a level for your child’s age. Live practice lets your child talk with an English partner on everyday topics and hear the reply.',
    metaDescription:
      'A spoken-English course in short daily lessons and units, with live conversation practice on everyday topics. A parent switches it on and sees progress.',
    howItWorks: [
      { title: 'Start with a check', detail: 'A quick starting check places your child at the right unit, and later checks show how far they have come.' },
      { title: 'One short lesson a day', detail: 'Lessons mix new words, sentence patterns, listening, speaking and review. A unit opens after the one before it.' },
      { title: 'Learn with Hindi help', detail: 'Words and sentences come with pictures and a line in Hindi where the level needs it.' },
      { title: 'Review comes back', detail: 'Words and sentences return on later days so they are remembered.' },
      { title: 'Talk it out', detail: 'In live practice, your child picks a topic such as my day, school or the market, taps to talk, checks the words, sends, and hears the partner reply.' },
      { title: 'See what was practised', detail: 'Each talk ends with a recap of what was practised and new words. There are no marks in live practice.' },
    ],
    whatYouGet: [
      'A spoken-English course in short daily lessons and units',
      'Levels for different ages, with a placement check and later progress checks',
      'Pictures and Hindi lines to help understanding',
      'Live conversation practice on everyday topics',
      'A weekly goal, and a parent report that never compares your child with other children',
    ],
    whoUsesIt: [
      { role: 'Child', text: 'Practises speaking a little every day without fear of being wrong.' },
      { role: 'Parent', text: 'Switches on the course and voice practice, sets a weekly goal and sees progress and ideas to try at home.' },
    ],
    faqs: [
      { question: 'Is it safe for my child?', answer: 'In live practice, every reply from the partner passes a safety check before it is shown, and the talk stays on the topic. Only the words are kept, never the recording.' },
      { question: 'Does it need my permission?', answer: 'Yes. A parent switches on the English course in the parent area, and live practice also needs voice practice switched on.' },
      { question: 'Is my child’s voice kept?', answer: 'No. The voice is turned into words and the recording is not kept. The words your child sent can be seen in the parent area.' },
      { question: 'Is my child scored on how they sound?', answer: 'No. The app does not score pronunciation, and live practice has no marks.' },
      { question: 'What does it cost?', answer: 'Ask us about Family plans.' },
    ],
    related: ['family-ai-tutor', 'parent-controls-progress', 'study-chapters-labs'],
  },
];
