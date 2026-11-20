// Example data for the Family app phone mock on the public home page. It is
// an illustration of how the tutor answers, not a real child's chat.

export const familyShowcase = {
  subject: 'Mathematics',
  question: 'Is sum ka answer kaise nikalte hain? 2x + 3 = 11',
  concept: {
    title: 'Equation ek taraazu hai',
    body: 'Dono pallon par barabar weight ho to taraazu seedha rehta hai. Ek taraf kuch karo, to doosri taraf bhi wahi karo.',
  },
  stepsTitle: 'Step by step',
  steps: [
    'Dono taraf se 3 ghatao: 2x = 8',
    'Dono taraf ko 2 se bhaag do: x = 4',
    'Check karo: 2 × 4 + 3 = 11',
  ],
  followUp: 'Samajh aaya? Ya dobara alag tareeke se samjhaun?',
  replies: ['Samajh aaya', 'Dobara samjhao'],
  tabs: ['Tutor', 'Study', 'English', 'Draw', 'Future'],
} as const;
