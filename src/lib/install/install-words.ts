// Plain words for the two install pages, English and Hindi. Kept here, not in the shared message files, so the
// install pages stay one small slice.
export type InstallLang = 'en' | 'hi';

export const INSTALL_WORDS = {
  en: {
    install: 'Install',
    open: 'Open the app',
    installedNote: 'The app is already on this phone.',
    ios: 'Tap Share, then Add to Home Screen.',
    desktop: 'Open this page on your Android phone.',
    menu: 'Tap the browser menu (three dots), then Install app or Add to Home screen.',
    address: 'This page address',
    after: 'After installing',
    family: {
      name: 'NetCyberAI Family',
      what: 'An AI tutor, study chapters and practice for your child, with a parent area.',
      steps: ['Open the NetCyberAI Family app from your home screen.', 'Sign in with your phone or email code.', 'Add your child and start learning.'],
    },
    teacher: {
      name: 'NetCyberAI Teacher',
      what: 'Your day, attendance and classes, on your phone.',
      steps: ['Open the NetCyberAI Teacher app from your home screen.', 'Sign in with your school login.', 'See your day and take attendance.'],
    },
  },
  hi: {
    install: 'इंस्टॉल करें',
    open: 'ऐप खोलें',
    installedNote: 'ऐप इस फ़ोन में पहले से है।',
    ios: 'Share दबाएँ, फिर Add to Home Screen दबाएँ।',
    desktop: 'इस पेज को अपने Android फ़ोन पर खोलें।',
    menu: 'ब्राउज़र का मेन्यू (तीन बिंदु) दबाएँ, फिर Install app या Add to Home screen दबाएँ।',
    address: 'इस पेज का पता',
    after: 'इंस्टॉल के बाद',
    family: {
      name: 'NetCyberAI Family',
      what: 'आपके बच्चे के लिए AI ट्यूटर, पढ़ाई के अध्याय और अभ्यास, और माता-पिता के लिए अलग हिस्सा।',
      steps: ['होम स्क्रीन से NetCyberAI Family ऐप खोलें।', 'अपने फ़ोन या ईमेल के कोड से साइन इन करें।', 'अपने बच्चे को जोड़ें और पढ़ाई शुरू करें।'],
    },
    teacher: {
      name: 'NetCyberAI Teacher',
      what: 'आपका दिन, उपस्थिति और कक्षाएँ, आपके फ़ोन पर।',
      steps: ['होम स्क्रीन से NetCyberAI Teacher ऐप खोलें।', 'अपने स्कूल के लॉगिन से साइन इन करें।', 'अपना दिन देखें और उपस्थिति लें।'],
    },
  },
} as const;
