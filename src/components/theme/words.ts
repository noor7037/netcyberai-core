// The theme picker's words, English and Hindi (C553).
export const THEME_WORDS = {
  en: {
    title: 'Look of the school app',
    lead: 'Choose the colours everyone at your school sees. Each person can still pick light or dark for themselves with the ☀ button at the top.',
    names: { classic: 'Classic blue', emerald: 'Emerald green', royal: 'Royal plum' },
    save: 'Use this look', saved: 'Saved. The school app now uses this look.', failed: 'Could not save. Please try again.', current: 'In use',
  },
  hi: {
    title: 'स्कूल ऐप का रूप',
    lead: 'वे रंग चुनें जो आपके स्कूल में सबको दिखें। हर व्यक्ति ऊपर ☀ बटन से अपने लिए हल्का या गहरा चुन सकता है।',
    names: { classic: 'क्लासिक नीला', emerald: 'पन्ना हरा', royal: 'रॉयल बैंगनी' },
    save: 'यह रूप चुनें', saved: 'सहेजा गया। स्कूल ऐप अब यही रूप दिखाता है।', failed: 'सहेजा नहीं जा सका। फिर से कोशिश करें।', current: 'अभी यही',
  },
} as const;
export const themeWords = (lang: string) => THEME_WORDS[lang === 'hi' ? 'hi' : 'en'];
