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
      what: "NetCyberAI Family is an app for parents and children. It gives your child an AI tutor, study chapters and practice, and it gives you a separate parent area. To install it on your phone, tap the big Install button below. On an iPhone, tap Share, then Add to Home Screen.",
      steps: ['Open the NetCyberAI Family app from your home screen.', 'Sign in with your phone or email code.', 'Add your child and start learning.'],
    },
    teacher: {
      name: 'NetCyberAI School',
      what: "Teachers use the NetCyberAI School app, the same app the principal and the office use. After you sign in with your own school login it shows your day, your classes and attendance, and only what a teacher may see. To install it, tap the big Install button below. On an iPhone, tap Share, then Add to Home Screen.",
      steps: ['Open the NetCyberAI School app from your home screen.', 'Sign in with your own school login.', 'See your day and take attendance.'],
    },
    school: {
      name: 'NetCyberAI School',
      what: "NetCyberAI School is the school's own app for the principal and the office. It opens your dashboard, every module you use and the Ask assistant from your phone's home screen, like any other app. To install it, tap the big Install button below. On an iPhone, tap Share, then Add to Home Screen.",
      steps: ['Open the NetCyberAI School app from your home screen.', 'Sign in with your school login.', 'Your dashboard opens; tap Ask to get work done.'],
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
      what: 'NetCyberAI Family माता-पिता और बच्चों के लिए एक ऐप है। इसमें आपके बच्चे के लिए AI ट्यूटर, पढ़ाई के अध्याय और अभ्यास हैं, और आपके लिए एक अलग माता-पिता वाला हिस्सा है। इसे अपने फ़ोन पर इंस्टॉल करने के लिए नीचे का बड़ा इंस्टॉल बटन दबाएँ। iPhone पर Share दबाएँ, फिर Add to Home Screen दबाएँ।',
      steps: ['होम स्क्रीन से NetCyberAI Family ऐप खोलें।', 'अपने फ़ोन या ईमेल के कोड से साइन इन करें।', 'अपने बच्चे को जोड़ें और पढ़ाई शुरू करें।'],
    },
    teacher: {
      name: 'NetCyberAI School',
      what: 'शिक्षक NetCyberAI School ऐप इस्तेमाल करते हैं, वही ऐप जो प्रधानाचार्य और ऑफ़िस इस्तेमाल करते हैं। अपने स्कूल के लॉगिन से साइन इन करने के बाद यह आपका दिन, आपकी कक्षाएँ और हाज़िरी दिखाता है, और सिर्फ़ वही जो एक शिक्षक देख सकता है। इंस्टॉल करने के लिए नीचे बड़ा Install बटन दबाएँ। iPhone पर Share दबाएँ, फिर Add to Home Screen दबाएँ।',
      steps: ['होम स्क्रीन से NetCyberAI School ऐप खोलें।', 'अपने स्कूल के लॉगिन से साइन इन करें।', 'अपना दिन देखें और हाज़िरी लें।'],
    },
    school: {
      name: 'NetCyberAI School',
      what: 'NetCyberAI School स्कूल का अपना ऐप है, प्रधानाचार्य और ऑफ़िस के लिए। इसमें आपका डैशबोर्ड, आपके सभी मॉड्यूल और Ask सहायक आपके फ़ोन की होम स्क्रीन से खुलते हैं, किसी भी दूसरे ऐप की तरह। इंस्टॉल करने के लिए नीचे बड़ा Install बटन दबाएँ। iPhone पर Share दबाएँ, फिर Add to Home Screen दबाएँ।',
      steps: ['होम स्क्रीन से NetCyberAI School ऐप खोलें।', 'अपने स्कूल के लॉगिन से साइन इन करें।', 'आपका डैशबोर्ड खुलेगा; काम करवाने के लिए Ask दबाएँ।'],
    },
  },
} as const;

