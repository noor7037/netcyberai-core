// Help Center guides (C129): one task per guide, 3 to 7 steps, written from
// the screens as they are today. Button and field names are quoted exactly
// as the screen shows them (the app's screens are in English, so the Hindi
// text keeps those names in English, in quotes).
//
// Hindi is a first translation and has NOT been reviewed by the founder:
// HINDI_REVIEWED stays false, and every Hindi page says so, until Noor
// approves it. test/help/help.test.ts checks every guide has both
// languages, 3 to 7 steps, and related guides that exist.

export type HelpLang = 'en' | 'hi';
export const HELP_LANGS: readonly HelpLang[] = ['en', 'hi'];
export const HINDI_REVIEWED = false;

export type L = Record<HelpLang, string>;

export type HelpCategoryId = 'account' | 'students' | 'daily' | 'support';
export const HELP_CATEGORIES: readonly { id: HelpCategoryId; label: L }[] = [
  { id: 'account', label: { en: 'Sign-in and account', hi: 'साइन-इन और खाता' } },
  { id: 'students', label: { en: 'Students and families', hi: 'विद्यार्थी और परिवार' } },
  { id: 'daily', label: { en: 'Daily work', hi: 'रोज़ का काम' } },
  { id: 'support', label: { en: 'Getting started and support', hi: 'शुरुआत और सहायता' } },
];

// Who the guide is for: everyone, the office (principal and school admin),
// or teachers too.
export type HelpAudience = 'everyone' | 'office' | 'office_and_teachers';
export const AUDIENCE_LABEL: Record<HelpAudience, L> = {
  everyone: { en: 'For everyone', hi: 'सभी के लिए' },
  office: { en: 'For the principal and school admin', hi: 'प्रिंसिपल और स्कूल एडमिन के लिए' },
  office_and_teachers: { en: 'For the office and teachers', hi: 'कार्यालय और शिक्षकों के लिए' },
};

export type HelpArticle = {
  slug: string;
  category: HelpCategoryId;
  audience: HelpAudience;
  title: L;
  summary: L;
  steps: readonly L[]; // 3 to 7
  tips?: readonly L[];
  // Where the task starts, when it is a page of the app or the website.
  start?: { href: string; label: L };
  related: readonly string[];
  // Extra words people search with (English, Hindi and Hinglish).
  keywords: readonly string[];
};

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'sign-in',
    category: 'account',
    audience: 'everyone',
    title: { en: 'Sign in, with or without an authenticator app', hi: 'साइन इन करें, authenticator ऐप के साथ या उसके बिना' },
    summary: {
      en: 'Password first, then one 6-digit code: from your authenticator app if you have one, otherwise from our email.',
      hi: 'पहले पासवर्ड, फिर एक 6 अंकों का कोड: authenticator ऐप हो तो उससे, नहीं तो हमारे ईमेल से।',
    },
    steps: [
      { en: 'Open the sign-in page. Enter your email or mobile number and your password, then press “Sign in”.', hi: 'साइन-इन पेज खोलें। अपना ईमेल या मोबाइल नंबर और पासवर्ड लिखें, फिर “Sign in” दबाएँ।' },
      { en: 'If your account has an authenticator app: open it on your phone and type the 6-digit code shown for NetCyberAI. It changes every 30 seconds.', hi: 'अगर आपके खाते में authenticator ऐप जुड़ा है: फ़ोन पर ऐप खोलें और NetCyberAI के लिए दिख रहा 6 अंकों का कोड लिखें। यह हर 30 सेकंड में बदलता है।' },
      { en: 'If it has none: open the email we just sent you and type its 6-digit code. Only the newest email’s code works.', hi: 'अगर ऐप नहीं जुड़ा है: हमारा अभी भेजा गया ईमेल खोलें और उसका 6 अंकों का कोड लिखें। केवल सबसे नए ईमेल का कोड चलता है।' },
      { en: 'On your own device, tick “Remember this device for 30 days” to skip the email code here next time.', hi: 'अपने निजी डिवाइस पर “Remember this device for 30 days” पर टिक करें, ताकि अगली बार यहाँ ईमेल कोड न माँगा जाए।' },
      { en: 'If you work in more than one school, choose the school to open. You can switch later without signing out.', hi: 'अगर आप एक से ज़्यादा स्कूलों में काम करते हैं, तो जो स्कूल खोलना है उसे चुनें। बाद में साइन आउट किए बिना बदल सकते हैं।' },
    ],
    tips: [
      { en: 'The two codes are different: the authenticator code is never emailed, and the email code is never in the app.', hi: 'दोनों कोड अलग हैं: authenticator का कोड कभी ईमेल नहीं होता, और ईमेल का कोड कभी ऐप में नहीं होता।' },
      { en: 'No email after a minute? Check spam, then use “Send a new code”.', hi: 'एक मिनट में ईमेल नहीं आया? Spam देखें, फिर “Send a new code” दबाएँ।' },
      { en: 'You can also choose “Email me a sign-in code instead” and sign in without typing your password.', hi: 'आप “Email me a sign-in code instead” चुनकर बिना पासवर्ड लिखे भी साइन इन कर सकते हैं।' },
    ],
    start: { href: '/login', label: { en: 'Sign-in page', hi: 'साइन-इन पेज' } },
    related: ['forgot-password', 'set-up-authenticator', 'send-staff-reset-code'],
    keywords: ['login', 'log in', 'otp', 'code', 'mfa', '2fa', 'two factor', 'लॉगिन', 'ओटीपी', 'कोड', 'login nahi ho raha', 'sign in nahi ho raha'],
  },
  {
    slug: 'forgot-password',
    category: 'account',
    audience: 'everyone',
    title: { en: 'Forgot your password', hi: 'पासवर्ड भूल गए' },
    summary: { en: 'Get a 6-digit code by email and choose a new password.', hi: 'ईमेल पर 6 अंकों का कोड पाएँ और नया पासवर्ड चुनें।' },
    steps: [
      { en: 'On the sign-in page, choose “Forgot password?” under the password box.', hi: 'साइन-इन पेज पर पासवर्ड बॉक्स के नीचे “Forgot password?” चुनें।' },
      { en: 'Enter the email or mobile number your school registered and press “Send code”. We email you a 6-digit code.', hi: 'स्कूल में दर्ज अपना ईमेल या मोबाइल नंबर लिखें और “Send code” दबाएँ। हम आपको 6 अंकों का कोड ईमेल करते हैं।' },
      { en: 'Type the code from that email, then your new password twice. Use 8 to 72 characters.', hi: 'उस ईमेल का कोड लिखें, फिर नया पासवर्ड दो बार लिखें। 8 से 72 अक्षर रखें।' },
      { en: 'Press “Save password and sign in”. If your account has an authenticator app, type its 6-digit code to finish.', hi: '“Save password and sign in” दबाएँ। अगर खाते में authenticator ऐप जुड़ा है, तो पूरा करने के लिए उसका 6 अंकों का कोड लिखें।' },
      { en: 'You are signed in, and signed out on every other device.', hi: 'आप साइन इन हो गए हैं, और बाकी सभी डिवाइस से साइन आउट हो गए हैं।' },
    ],
    tips: [
      { en: 'Only accounts your school created get an email. No email? Ask your principal or school admin to send you a reset code.', hi: 'ईमेल केवल उन्हीं खातों को जाता है जो आपके स्कूल ने बनाए हैं। ईमेल नहीं आया? अपने प्रिंसिपल या स्कूल एडमिन से reset code भेजने को कहें।' },
      { en: 'A short sentence is easy to remember and hard to guess.', hi: 'एक छोटा वाक्य याद रखना आसान और अनुमान लगाना मुश्किल होता है।' },
    ],
    start: { href: '/login', label: { en: 'Sign-in page', hi: 'साइन-इन पेज' } },
    related: ['sign-in', 'send-staff-reset-code'],
    keywords: ['reset password', 'password bhool gaya', 'password reset', 'new password', 'पासवर्ड रीसेट', 'नया पासवर्ड'],
  },
  {
    slug: 'set-up-authenticator',
    category: 'account',
    audience: 'everyone',
    title: { en: 'Set up an authenticator app', hi: 'Authenticator ऐप सेट करें' },
    summary: {
      en: 'Add an app on your phone that shows a 6-digit code at every sign-in. Optional for school staff; safer than the email code.',
      hi: 'फ़ोन पर एक ऐप जोड़ें जो हर साइन-इन पर 6 अंकों का कोड दिखाता है। स्कूल स्टाफ़ के लिए वैकल्पिक; ईमेल कोड से ज़्यादा सुरक्षित।',
    },
    steps: [
      { en: 'Install Google Authenticator or Microsoft Authenticator from your phone’s app store.', hi: 'अपने फ़ोन के app store से Google Authenticator या Microsoft Authenticator इंस्टॉल करें।' },
      { en: 'In NetCyberAI, open “My account”. Under “Authenticator app”, press “Set up authenticator app”.', hi: 'NetCyberAI में “My account” खोलें। “Authenticator app” के नीचे “Set up authenticator app” दबाएँ।' },
      { en: 'Confirm it is you: type your current password and press “Continue”.', hi: 'पुष्टि करें कि यह आप ही हैं: अपना मौजूदा पासवर्ड लिखें और “Continue” दबाएँ।' },
      { en: 'Scan the QR code with the app on your phone. If you cannot scan, type the setup key shown instead.', hi: 'फ़ोन के ऐप से QR कोड स्कैन करें। स्कैन न हो सके तो दिखाई गई setup key लिखें।' },
      { en: 'Type the 6-digit code the app now shows and press “Turn on authenticator”.', hi: 'ऐप में अब दिख रहा 6 अंकों का कोड लिखें और “Turn on authenticator” दबाएँ।' },
      { en: 'From now on every sign-in asks for your password and then this app’s code, with no email code.', hi: 'अब से हर साइन-इन पर पासवर्ड और फिर इस ऐप का कोड माँगा जाएगा, ईमेल कोड नहीं।' },
    ],
    tips: [
      { en: 'New phone? Use “Replace authenticator” on the same page. The new one is added first; the old one stops only after the new one works.', hi: 'नया फ़ोन? उसी पेज पर “Replace authenticator” दबाएँ। पहले नया जुड़ता है; पुराना तभी बंद होता है जब नया काम करने लगे।' },
      { en: 'Lost the phone with the app? Raise a ticket or contact NetCyberAI support; we remove it and you set up a new one.', hi: 'ऐप वाला फ़ोन खो गया? टिकट बनाएँ या NetCyberAI सहायता से संपर्क करें; हम उसे हटा देते हैं और आप नया सेट करते हैं।' },
    ],
    start: { href: '/app/account', label: { en: 'My account', hi: 'मेरा खाता (My account)' } },
    related: ['sign-in', 'forgot-password', 'raise-a-ticket'],
    keywords: ['2fa', 'mfa', 'totp', 'google authenticator', 'microsoft authenticator', 'qr', 'two step', 'security', 'सुरक्षा', 'ऑथेंटिकेटर'],
  },
  {
    slug: 'send-staff-reset-code',
    category: 'account',
    audience: 'office',
    title: { en: 'Send a staff member a password reset code', hi: 'स्टाफ़ सदस्य को पासवर्ड reset code भेजें' },
    summary: { en: 'When a teacher or colleague cannot sign in, email them a reset code from the Staff page.', hi: 'जब कोई शिक्षक या सहकर्मी साइन इन न कर पाए, तो Staff पेज से उन्हें reset code ईमेल करें।' },
    steps: [
      { en: 'Open “Staff” from the menu.', hi: 'मेनू से “Staff” खोलें।' },
      { en: 'Find the person: type their name, email or role in the search box.', hi: 'व्यक्ति को खोजें: search बॉक्स में उनका नाम, ईमेल या role लिखें।' },
      { en: 'If their account may be in the wrong hands, tick “Also sign them out on every device”.', hi: 'अगर खाता किसी और के हाथ में होने का शक हो, तो “Also sign them out on every device” पर टिक करें।' },
      { en: 'Press “Email reset code” beside their name. The code goes to the email on their account.', hi: 'उनके नाम के पास “Email reset code” दबाएँ। कोड उनके खाते में दर्ज ईमेल पर जाता है।' },
      { en: 'Tell them to open the sign-in page, choose “Forgot password?” and enter that code with a new password.', hi: 'उनसे कहें कि साइन-इन पेज खोलें, “Forgot password?” चुनें और वह कोड नए पासवर्ड के साथ लिखें।' },
    ],
    tips: [
      { en: 'You never see or choose their password.', hi: 'आप उनका पासवर्ड कभी नहीं देखते और न चुनते हैं।' },
      { en: '“No email on file” means no code can be sent. Raise a ticket so NetCyberAI can help.', hi: '“No email on file” का मतलब है कि कोड नहीं भेजा जा सकता। टिकट बनाएँ ताकि NetCyberAI मदद कर सके।' },
      { en: 'Wait a minute before sending a second code to the same person.', hi: 'उसी व्यक्ति को दूसरा कोड भेजने से पहले एक मिनट रुकें।' },
    ],
    start: { href: '/app/staff', label: { en: 'Staff', hi: 'Staff' } },
    related: ['forgot-password', 'sign-in', 'raise-a-ticket'],
    keywords: ['teacher cannot login', 'staff password', 'reset code', 'teacher login nahi ho raha', 'शिक्षक लॉगिन', 'स्टाफ पासवर्ड'],
  },
  {
    slug: 'add-a-student',
    category: 'students',
    audience: 'office',
    title: { en: 'Add a student', hi: 'विद्यार्थी जोड़ें' },
    summary: { en: 'Add one student by hand, then add their guardian.', hi: 'एक विद्यार्थी को हाथ से जोड़ें, फिर उनके अभिभावक को जोड़ें।' },
    steps: [
      { en: 'Open “Students”. If the class does not exist yet, press “Manage classes”, type its name (for example 8-A) and press “Add”.', hi: '“Students” खोलें। अगर कक्षा अभी नहीं बनी है, तो “Manage classes” दबाएँ, उसका नाम लिखें (जैसे 8-A) और “Add” दबाएँ।' },
      { en: 'Press “Add student”.', hi: '“Add student” दबाएँ।' },
      { en: 'Fill in “Full name”, and if you have them “Admission number”, “Class”, “Roll number” and “Date of birth”.', hi: '“Full name” भरें, और उपलब्ध हों तो “Admission number”, “Class”, “Roll number” और “Date of birth” भी।' },
      { en: 'Press “Save”. The student starts as “pending consent”: in the attendance list with a “Consent pending” tag, and no message goes to the family yet.', hi: '“Save” दबाएँ। विद्यार्थी “pending consent” स्थिति से शुरू होता है: हाज़िरी सूची में “Consent pending” के निशान के साथ दिखता है, और परिवार को अभी कोई संदेश नहीं जाता।' },
      { en: 'Open the student and press “Add guardian”: name, “Phone (WhatsApp)”, email and relation.', hi: 'विद्यार्थी को खोलें और “Add guardian” दबाएँ: नाम, “Phone (WhatsApp)”, ईमेल और संबंध।' },
      { en: 'Under “Consent”, press “Verify” beside the guardian, then “Grant” for the two purposes marked “required for service”. The student becomes active.', hi: '“Consent” के नीचे अभिभावक के पास “Verify” दबाएँ, फिर “required for service” वाले दोनों उद्देश्यों के लिए “Grant” दबाएँ। विद्यार्थी सक्रिय हो जाता है।' },
    ],
    tips: [
      { en: 'Adding many students? Import them from a CSV file instead.', hi: 'बहुत से विद्यार्थी जोड़ने हैं? उन्हें CSV फ़ाइल से import करें।' },
      { en: 'If the guardian’s phone or email is already on record, the screen suggests a possible sibling.', hi: 'अगर अभिभावक का फ़ोन या ईमेल पहले से दर्ज है, तो स्क्रीन संभावित भाई-बहन (possible sibling) सुझाती है।' },
    ],
    start: { href: '/app/students', label: { en: 'Students', hi: 'Students' } },
    related: ['import-students-csv', 'link-siblings', 'student-id-cards'],
    keywords: ['new admission', 'new student', 'add class', 'guardian', 'parent', 'naya student', 'नया विद्यार्थी', 'दाखिला', 'अभिभावक', 'कक्षा'],
  },
  {
    slug: 'import-students-csv',
    category: 'students',
    audience: 'office',
    title: { en: 'Import students from a CSV file', hi: 'CSV फ़ाइल से विद्यार्थी import करें' },
    summary: { en: 'Add a whole class or school at once from a spreadsheet saved as CSV.', hi: 'CSV के रूप में सेव की गई spreadsheet से पूरी कक्षा या पूरा स्कूल एक साथ जोड़ें।' },
    steps: [
      { en: 'Create the classes first: “Students” → “Manage classes”. A row’s class must match an existing class name exactly.', hi: 'पहले कक्षाएँ बनाएँ: “Students” → “Manage classes”। हर row की कक्षा का नाम किसी मौजूदा कक्षा से ठीक-ठीक मिलना चाहिए।' },
      { en: 'Prepare the file with these column names: name (required), admission_no, class_name, roll_no, dob (as YYYY-MM-DD). Save it as CSV.', hi: 'फ़ाइल इन column नामों के साथ तैयार करें: name (ज़रूरी), admission_no, class_name, roll_no, dob (YYYY-MM-DD रूप में)। इसे CSV के रूप में सेव करें।' },
      { en: 'In “Students”, press “Import CSV” and choose the file.', hi: '“Students” में “Import CSV” दबाएँ और फ़ाइल चुनें।' },
      { en: 'Press “Check file” first. It lists every row with a problem and imports nothing.', hi: 'पहले “Check file” दबाएँ। यह गड़बड़ी वाली हर row दिखाता है और कुछ भी import नहीं करता।' },
      { en: 'Fix the rows in your file, choose it again, and press “Import”.', hi: 'अपनी फ़ाइल में वे rows ठीक करें, फ़ाइल फिर चुनें और “Import” दबाएँ।' },
      { en: 'Read the result: how many were imported and skipped, and why. Every imported student starts as “pending consent”.', hi: 'नतीजा पढ़ें: कितने import हुए, कितने छूटे, और क्यों। हर import किया गया विद्यार्थी “pending consent” से शुरू होता है।' },
    ],
    tips: [
      { en: 'Uploading the exact same file again is safe: it does not create duplicates.', hi: 'वही फ़ाइल दोबारा upload करना सुरक्षित है: इससे duplicate नहीं बनते।' },
      { en: 'Optional columns guardian_phone and guardian_email are used only to suggest possible siblings; you confirm each one.', hi: 'वैकल्पिक columns guardian_phone और guardian_email केवल संभावित भाई-बहन सुझाने के लिए हैं; हर एक की पुष्टि आप करते हैं।' },
    ],
    start: { href: '/app/students', label: { en: 'Students', hi: 'Students' } },
    related: ['add-a-student', 'link-siblings'],
    keywords: ['excel', 'spreadsheet', 'bulk', 'upload', 'csv', 'sheet', 'bulk upload', 'एक्सेल', 'सूची', 'अपलोड'],
  },
  {
    slug: 'link-siblings',
    category: 'students',
    audience: 'office',
    title: { en: 'Link brothers and sisters into one family', hi: 'भाई-बहनों को एक परिवार में जोड़ें' },
    summary: { en: 'Link siblings so the school sees one family. Nothing is linked until the office confirms it.', hi: 'भाई-बहनों को जोड़ें ताकि स्कूल को एक परिवार दिखे। कार्यालय की पुष्टि के बिना कुछ नहीं जुड़ता।' },
    steps: [
      { en: 'Open “Students” and open one of the children.', hi: '“Students” खोलें और बच्चों में से किसी एक को खोलें।' },
      { en: 'In the “Siblings” panel, press “+ Link a sibling”.', hi: '“Siblings” पैनल में “+ Link a sibling” दबाएँ।' },
      { en: 'Find the brother or sister by name, admission number or guardian phone.', hi: 'भाई या बहन को नाम, admission number या अभिभावक के फ़ोन से खोजें।' },
      { en: 'Press “Link as sibling” beside the right student. Both now show in one family, with its guardians.', hi: 'सही विद्यार्थी के पास “Link as sibling” दबाएँ। अब दोनों एक परिवार में, उसके अभिभावकों के साथ दिखते हैं।' },
      { en: 'Linked the wrong child? Press “Remove from family” beside them. The other children stay in the family.', hi: 'ग़लत बच्चा जुड़ गया? उसके पास “Remove from family” दबाएँ। बाकी बच्चे परिवार में बने रहते हैं।' },
    ],
    tips: [
      { en: 'When you add a guardian whose phone or email is already on record, the screen shows “Possible sibling”. Press “Link to this guardian and family” only if it is the same person.', hi: 'जब आप ऐसा अभिभावक जोड़ते हैं जिसका फ़ोन या ईमेल पहले से दर्ज है, तो स्क्रीन “Possible sibling” दिखाती है। “Link to this guardian and family” तभी दबाएँ जब वह वही व्यक्ति हो।' },
      { en: 'The same guardian entered twice? Use “Merge duplicate guardians” in the family panel.', hi: 'एक ही अभिभावक दो बार दर्ज है? परिवार पैनल में “Merge duplicate guardians” का उपयोग करें।' },
      { en: 'A teacher sees a family only through students of their own classes.', hi: 'शिक्षक को परिवार केवल अपनी कक्षाओं के विद्यार्थियों के ज़रिए दिखता है।' },
    ],
    start: { href: '/app/students', label: { en: 'Students', hi: 'Students' } },
    related: ['add-a-student', 'import-students-csv'],
    keywords: ['sibling', 'brother', 'sister', 'family', 'same parent', 'bhai behen', 'भाई', 'बहन', 'परिवार', 'सिबलिंग'],
  },
  {
    slug: 'student-id-cards',
    category: 'students',
    audience: 'office_and_teachers',
    title: { en: 'Issue a student ID card and scan its QR code', hi: 'विद्यार्थी का ID card जारी करें और उसका QR कोड स्कैन करें' },
    summary: { en: 'Each card carries a QR code that opens that student’s record for staff of your school only.', hi: 'हर कार्ड पर एक QR कोड होता है जो केवल आपके स्कूल के स्टाफ़ के लिए उस विद्यार्थी का रिकॉर्ड खोलता है।' },
    steps: [
      { en: 'Open “Students”, open the student, and press “ID card”.', hi: '“Students” खोलें, विद्यार्थी को खोलें और “ID card” दबाएँ।' },
      { en: 'Press “Issue ID card”. The card appears with its QR code.', hi: '“Issue ID card” दबाएँ। कार्ड अपने QR कोड के साथ दिखता है।' },
      { en: 'Press “Print” and print it on card paper.', hi: '“Print” दबाएँ और इसे कार्ड पेपर पर प्रिंट करें।' },
      { en: 'To use it: press “Scan” in the app and point the phone’s camera at the card. The student’s record opens.', hi: 'उपयोग के लिए: ऐप में “Scan” दबाएँ और फ़ोन का कैमरा कार्ड की ओर करें। विद्यार्थी का रिकॉर्ड खुल जाता है।' },
      { en: 'Card lost? Open the same page and press “Report lost / revoke”. The old QR code stops working at once.', hi: 'कार्ड खो गया? वही पेज खोलें और “Report lost / revoke” दबाएँ। पुराना QR कोड तुरंत बंद हो जाता है।' },
      { en: 'To give a new card, press “Reissue (invalidates current card)” and print again.', hi: 'नया कार्ड देने के लिए “Reissue (invalidates current card)” दबाएँ और फिर प्रिंट करें।' },
    ],
    tips: [
      { en: 'A card from another school, or a revoked one, shows a message and opens nothing.', hi: 'किसी दूसरे स्कूल का या रद्द किया गया कार्ड केवल एक संदेश दिखाता है और कुछ नहीं खोलता।' },
      { en: 'The QR code holds no personal details: it is only a key that your school’s signed-in staff can use.', hi: 'QR कोड में कोई निजी जानकारी नहीं होती: यह केवल एक चाबी है जिसे आपके स्कूल का साइन-इन किया हुआ स्टाफ़ ही इस्तेमाल कर सकता है।' },
    ],
    start: { href: '/app/students', label: { en: 'Students', hi: 'Students' } },
    related: ['add-a-student', 'mark-attendance'],
    keywords: ['id card', 'identity card', 'qr', 'scan', 'lost card', 'reissue', 'print card', 'पहचान पत्र', 'आईडी कार्ड', 'स्कैन'],
  },
  {
    slug: 'mark-attendance',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Mark attendance for a class', hi: 'कक्षा की उपस्थिति दर्ज करें' },
    summary: { en: 'Everyone starts as present. Tap only the students who are absent, late or on leave, then submit. It works with no internet too.', hi: 'सभी शुरू में present माने जाते हैं। केवल absent, late या छुट्टी वाले विद्यार्थियों पर टैप करें, फिर submit करें। इंटरनेट न हो तब भी चलता है।' },
    steps: [
      { en: 'Open “Attendance” and choose the class under “Class”.', hi: '“Attendance” खोलें और “Class” के नीचे कक्षा चुनें।' },
      { en: 'Every student is “Present” to begin with. For a student who is not, tap “Absent”, “Late” or “On leave” beside their name. “Present all” puts everyone back to present.', hi: 'शुरू में हर विद्यार्थी “Present” होता है। जो नहीं है, उसके नाम के पास “Absent”, “Late” या “On leave” पर टैप करें। “Present all” से सब फिर present हो जाते हैं।' },
      { en: 'Check the list once, then press “Submit attendance” at the bottom. With no internet it is kept on the phone, the line at the top says how many changes are waiting, and it is sent when the internet is back.', hi: 'सूची एक बार जाँचें, फिर नीचे “Submit attendance” दबाएँ। इंटरनेट न हो तो हाज़िरी फ़ोन पर रहती है, ऊपर की पंक्ति बताती है कि कितने बदलाव भेजने बाकी हैं, और इंटरनेट आते ही भेज दी जाती है।' },
      { en: 'Made a mistake after submitting? Tap the right status beside the student. If a note is asked for, type the “Reason for the change” and press “Save correction”.', hi: 'Submit करने के बाद ग़लती दिखी? विद्यार्थी के पास सही status पर टैप करें। अगर कारण माँगा जाए, तो “Reason for the change” लिखें और “Save correction” दबाएँ।' },
      { en: 'A past date shows “Locked (past date)” and cannot be changed here.', hi: 'पिछली तारीख़ पर “Locked (past date)” दिखता है और उसे यहाँ बदला नहीं जा सकता।' },
    ],
    tips: [
      { en: 'A teacher sees only their own classes. The office sees every class.', hi: 'शिक्षक को केवल अपनी कक्षाएँ दिखती हैं। कार्यालय को सभी कक्षाएँ दिखती हैं।' },
      { en: '“No students in this class” means the class has no students yet. A student whose consent is pending is listed, with a “Consent pending” tag.', hi: '“No students in this class” का मतलब है कि कक्षा में अभी विद्यार्थी नहीं हैं। जिस विद्यार्थी की सहमति बाकी है, वह “Consent pending” के निशान के साथ दिखता है।' },
      { en: 'If someone else marked the class first, their marks stay. You see “Already marked differently” and can press “Save mine as a correction”.', hi: 'अगर किसी और ने कक्षा की हाज़िरी पहले लगा दी, तो उनकी हाज़िरी रहती है। आपको “Already marked differently” दिखता है और आप “Save mine as a correction” दबा सकते हैं।' },
      { en: 'The office can enter or correct a past day: choose the “Day”, write the “Reason”, then tap the mark. The school sets how many days back in Settings.', hi: 'दफ़्तर पिछले दिन की हाज़िरी दर्ज या ठीक कर सकता है: “Day” चुनें, “Reason” लिखें, फिर निशान पर टैप करें। कितने दिन पीछे तक, यह स्कूल Settings में तय करता है।' },
      { en: 'Marks made with no internet that arrive after the day ended are not lost: they wait for the office, which presses “Apply these marks” or “Dismiss”.', hi: 'बिना इंटरनेट के लगी हाज़िरी अगर दिन ख़त्म होने के बाद पहुँचे तो खोती नहीं: वह दफ़्तर का इंतज़ार करती है, जो “Apply these marks” या “Dismiss” दबाता है।' },
      { en: 'Every correction is recorded with who made it and why.', hi: 'हर सुधार इस जानकारी के साथ दर्ज होता है कि किसने और क्यों किया।' },
    ],
    start: { href: '/app/attendance', label: { en: 'Attendance', hi: 'Attendance' } },
    related: ['student-id-cards', 'add-a-student', 'raise-a-ticket'],
    keywords: ['attendance', 'absent', 'present', 'late', 'roll call', 'register', 'haziri', 'हाज़िरी', 'उपस्थिति', 'अनुपस्थित'],
  },
  {
    slug: 'use-my-day',
    category: 'daily',
    audience: 'everyone',
    title: { en: 'Start your day from My Day', hi: 'मेरा दिन से अपना दिन शुरू करें' },
    summary: {
      en: 'My Day opens when you sign in. It lists what is waiting for you today, counted from your school’s own records, and each card opens the right screen in one tap.',
      hi: 'साइन इन करते ही मेरा दिन खुलता है। इसमें आज के बाकी काम दिखते हैं, जो आपके स्कूल के अपने रिकॉर्ड से गिने जाते हैं, और हर कार्ड एक टैप में सही स्क्रीन खोलता है।',
    },
    steps: [
      { en: 'Sign in. My Day opens by itself; you can always return to it from My Day at the top of the menu.', hi: 'साइन इन करें। मेरा दिन अपने-आप खुलता है; मेनू में सबसे ऊपर मेरा दिन से कभी भी यहाँ लौट सकते हैं।' },
      { en: 'Read the cards under things need you today. A teacher sees their own classes; the office and the principal see the whole school.', hi: 'आज … काम आपका इंतज़ार कर रहे हैं के नीचे के कार्ड पढ़ें। शिक्षक को अपनी कक्षाएँ दिखती हैं; दफ़्तर और प्रधानाचार्य को पूरा स्कूल।' },
      { en: 'Tap a card to open it. For example, Mark attendance: 5-A opens Attendance with that class already chosen.', hi: 'खोलने के लिए कार्ड पर टैप करें। जैसे हाज़िरी लगाएँ: 5-A से हाज़िरी खुलती है और वह कक्षा पहले से चुनी होती है।' },
      { en: 'When the work is done the card moves to Done today. With nothing waiting, the page says so.', hi: 'काम पूरा होने पर कार्ड आज हो चुके काम में चला जाता है। कुछ बाकी न हो तो पेज वही बताता है।' },
    ],
    tips: [
      { en: 'Why this? under a card says, in one line, the rule that put it there.', hi: 'कार्ड के नीचे यह क्यों दिख रहा है? एक पंक्ति में बताता है कि वह किस नियम से यहाँ आया।' },
      { en: 'There is no attendance card on a Sunday.', hi: 'रविवार को हाज़िरी का कार्ड नहीं आता।' },
    ],
    start: { href: '/app/my-day', label: { en: 'My Day', hi: 'मेरा दिन' } },
    related: ['mark-attendance', 'add-a-student', 'raise-a-ticket'],
    keywords: ['home', 'today', 'my day', 'dashboard', 'tasks', 'cards', 'आज', 'मेरा दिन', 'होम', 'aaj ka kaam'],
  },
  {
    slug: 'student-page',
    category: 'students',
    audience: 'office',
    title: { en: 'A student’s page: guardians, verification and consent', hi: 'विद्यार्थी का पेज: अभिभावक, पुष्टि और सहमति' },
    summary: {
      en: 'Each student has one page. Guardians are linked and verified there, and each consent a guardian gives or withdraws is recorded there.',
      hi: 'हर विद्यार्थी का एक पेज होता है। वहीं अभिभावक जोड़े और उनकी पुष्टि की जाती है, और अभिभावक की दी या वापस ली गई हर सहमति वहीं दर्ज होती है।',
    },
    steps: [
      { en: 'Open Students and tap the student’s name.', hi: 'Students खोलें और विद्यार्थी के नाम पर टैप करें।' },
      { en: 'Under “Guardians”, press “+ Add guardian” and enter the parent’s name, relation and mobile number.', hi: '“Guardians” के नीचे “+ Add guardian” दबाएँ और अभिभावक का नाम, रिश्ता और मोबाइल नंबर भरें।' },
      { en: 'Under “Consent”, press “Verify” beside the guardian and choose how you confirmed who they are.', hi: '“Consent” के नीचे अभिभावक के पास “Verify” दबाएँ और चुनें कि आपने उनकी पहचान कैसे पक्की की।' },
      { en: 'For each purpose the guardian agrees to, press “Grant”. If they later change their mind, press “Withdraw”.', hi: 'अभिभावक जिस-जिस उद्देश्य के लिए हाँ कहें, उसके लिए “Grant” दबाएँ। बाद में मन बदलें तो “Withdraw” दबाएँ।' },
    ],
    tips: [
      { en: '“Edit” changes the student’s details. “ID card” makes the card with its QR code.', hi: '“Edit” से विद्यार्थी की जानकारी बदलती है। “ID card” से QR कोड वाला कार्ड बनता है।' },
      { en: 'When a parent asks to see, correct or delete their child’s data, press “+ Log request” so it is followed to the end.', hi: 'जब कोई अभिभावक अपने बच्चे का डेटा देखने, सुधारने या हटाने को कहे, “+ Log request” दबाएँ ताकि वह अंत तक पूरा हो।' },
      { en: 'When both purposes marked “required for service” are granted by a verified guardian, the student becomes active. Withdrawing either one returns the student to “pending consent”.', hi: 'जब पुष्टि किया हुआ अभिभावक “required for service” वाले दोनों उद्देश्यों की सहमति दे देता है, विद्यार्थी सक्रिय हो जाता है। इनमें से कोई एक वापस लेने पर विद्यार्थी फिर “pending consent” में चला जाता है।' },
      { en: 'Consent is never edited: a change is recorded as a new line, and the old one stays in the history.', hi: 'सहमति कभी बदली नहीं जाती: बदलाव नई पंक्ति में दर्ज होता है, और पुरानी पंक्ति इतिहास में रहती है।' },
    ],
    start: { href: '/app/students', label: { en: 'Students', hi: 'Students' } },
    related: ['add-a-student', 'link-siblings', 'student-id-cards'],
    keywords: ['guardian', 'parent', 'consent', 'verify', 'pending consent', 'profile', 'data request', 'अभिभावक', 'सहमति', 'पुष्टि', 'consent kaise le', 'parent kaise jode'],
  },
  {
    slug: 'taught-today',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Record what was taught today', hi: 'आज क्या पढ़ाया, यह दर्ज करें' },
    summary: {
      en: 'One tap per class and subject says what happened in today’s lesson. It is what the daily message to parents will be built from.',
      hi: 'हर कक्षा और विषय के लिए एक टैप बताता है कि आज के पाठ में क्या हुआ। अभिभावकों को जाने वाला रोज़ का संदेश इसी से बनेगा।',
    },
    steps: [
      { en: 'Open Academics. Each row is one class and subject you teach.', hi: 'Academics खोलें। हर पंक्ति एक कक्षा और विषय है जो आप पढ़ाते हैं।' },
      { en: 'A row that shows “Not recorded” has nothing saved for today yet.', hi: 'जिस पंक्ति में “Not recorded” लिखा है, उसमें आज के लिए अभी कुछ सेव नहीं हुआ।' },
      { en: 'Tap what happened: “Taught”, “Partly taught”, “Delayed” or “Not taught”. It is saved at once.', hi: 'जो हुआ उस पर टैप करें: “Taught”, “Partly taught”, “Delayed” या “Not taught”। यह तुरंत सेव हो जाता है।' },
      { en: 'Made a mistake? Tap the right one; the newest choice replaces the earlier one for today.', hi: 'ग़लती हो गई? सही विकल्प पर टैप करें; आज के लिए नया चुनाव पुराने की जगह ले लेता है।' },
    ],
    tips: [
      { en: 'No rows? A teacher sees only the classes and subjects assigned to them. Ask your school admin to assign yours.', hi: 'कोई पंक्ति नहीं? शिक्षक को सिर्फ़ वही कक्षाएँ और विषय दिखते हैं जो उन्हें दिए गए हैं। अपने स्कूल एडमिन से कहें।' },
    ],
    start: { href: '/app/syllabus', label: { en: 'Taught today', hi: 'Taught today' } },
    related: ['mark-attendance', 'use-my-day', 'raise-a-ticket'],
    keywords: ['syllabus', 'lesson', 'topic', 'taught', 'academics', 'class log', 'पाठ', 'पढ़ाया', 'सिलेबस', 'aaj kya padhaya'],
  },
  {
    slug: 'timetable',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Fill and read the timetable', hi: 'समय-सारणी भरें और देखें' },
    summary: {
      en: 'The office fills each class’s week, one period at a time or from a CSV file. A teacher sees their own week. A teacher can never be in two classes at once.',
      hi: 'दफ़्तर हर कक्षा का हफ़्ता भरता है, एक-एक पीरियड या CSV फ़ाइल से। शिक्षक को अपना हफ़्ता दिखता है। एक शिक्षक एक ही समय पर दो कक्षाओं में नहीं हो सकता।',
    },
    steps: [
      { en: 'Open “Timetable” and choose the class under “Class”. Each block is a day; each line is a period.', hi: '“Timetable” खोलें और “Class” के नीचे कक्षा चुनें। हर खाना एक दिन है; हर पंक्ति एक पीरियड।' },
      { en: 'Tap a period. Choose the “Subject” and the “Teacher”, then press “Save period”.', hi: 'किसी पीरियड पर टैप करें। “Subject” और “Teacher” चुनें, फिर “Save period” दबाएँ।' },
      { en: 'If that teacher is already teaching another class at that time, the period is not saved and the screen names the other class. Choose another teacher or another period.', hi: 'अगर वह शिक्षक उस समय पहले से दूसरी कक्षा पढ़ा रहा है, तो पीरियड सेव नहीं होता और स्क्रीन दूसरी कक्षा का नाम बताती है। दूसरा शिक्षक या दूसरा पीरियड चुनें।' },
      { en: 'To empty a period, tap it and press “Clear this period”.', hi: 'पीरियड खाली करने के लिए उस पर टैप करें और “Clear this period” दबाएँ।' },
      { en: 'To fill many periods at once, open “Import from a CSV file”, choose the file and press “Import”.', hi: 'एक साथ कई पीरियड भरने के लिए “Import from a CSV file” खोलें, फ़ाइल चुनें और “Import” दबाएँ।' },
    ],
    tips: [
      { en: 'A CSV file with any problem or clash imports nothing. The screen lists each line to correct.', hi: 'जिस CSV फ़ाइल में कोई गड़बड़ी या टकराव हो, उससे कुछ भी इम्पोर्ट नहीं होता। स्क्रीन ठीक करने वाली हर पंक्ति बताती है।' },
      { en: 'A teacher sees only their own periods and their own classes’ timetable, and cannot change it.', hi: 'शिक्षक को केवल अपने पीरियड और अपनी कक्षाओं की समय-सारणी दिखती है, और वह उसे बदल नहीं सकता।' },
      { en: 'How many periods a day has is set by the office in Settings.', hi: 'एक दिन में कितने पीरियड हैं, यह दफ़्तर Settings में तय करता है।' },
    ],
    start: { href: '/app/timetable', label: { en: 'Timetable', hi: 'Timetable' } },
    related: ['mark-attendance', 'taught-today', 'use-my-day'],
    keywords: ['timetable', 'period', 'periods', 'schedule', 'clash', 'csv', 'time table', 'समय-सारणी', 'टाइम टेबल', 'पीरियड'],
  },
  {
    slug: 'compliance-screen',
    category: 'daily',
    audience: 'office',
    title: { en: 'Read the Compliance screen', hi: 'Compliance स्क्रीन को समझें' },
    summary: {
      en: 'Three things in one place: your state’s fee-notice rule, how long each kind of record is kept, and every time NetCyberAI staff opened your school’s data.',
      hi: 'एक जगह तीन चीज़ें: आपके राज्य का फ़ीस नोटिस नियम, हर तरह का रिकॉर्ड कितने समय रखा जाता है, और NetCyberAI के स्टाफ़ ने कब-कब आपके स्कूल का डेटा खोला।',
    },
    steps: [
      { en: 'Open Compliance from the menu.', hi: 'मेनू से Compliance खोलें।' },
      { en: '“Haryana Form 6 fee advisory” says whether that rule applies to your school, and shows the “Filing deadline” when it does.', hi: '“Haryana Form 6 fee advisory” बताता है कि वह नियम आपके स्कूल पर लागू है या नहीं, और लागू होने पर “Filing deadline” दिखाता है।' },
      { en: '“Data retention” lists each kind of record and how long it is kept before it is removed.', hi: '“Data retention” में हर तरह का रिकॉर्ड और उसे हटाने से पहले रखने की अवधि दी है।' },
      { en: '“Support access to this school” lists each time NetCyberAI staff viewed your data, with the time and the reason given first.', hi: '“Support access to this school” में हर वह बार दर्ज है जब NetCyberAI के स्टाफ़ ने आपका डेटा देखा, समय और पहले दिए गए कारण के साथ।' },
    ],
    tips: [
      { en: 'Consent and parents’ data requests are recorded on each student’s page, not here.', hi: 'सहमति और अभिभावकों के डेटा अनुरोध हर विद्यार्थी के पेज पर दर्ज होते हैं, यहाँ नहीं।' },
      { en: 'If the fee advisory does not apply to your state, the screen says so and there is nothing to do.', hi: 'अगर फ़ीस नोटिस का नियम आपके राज्य पर लागू नहीं है, स्क्रीन यही बताती है और कुछ करने की ज़रूरत नहीं।' },
    ],
    start: { href: '/app/compliance', label: { en: 'Compliance', hi: 'Compliance' } },
    related: ['student-page', 'raise-a-ticket'],
    keywords: ['compliance', 'retention', 'form 6', 'fee notice', 'support access', 'audit', 'dpdp', 'नियम', 'डेटा', 'रिकॉर्ड', 'kisne data dekha'],
  },
  {
    slug: 'whatsapp-settings',
    category: 'support',
    audience: 'office',
    title: { en: 'Settings: what is switched on, and your school’s WhatsApp', hi: 'सेटिंग: क्या चालू है, और आपके स्कूल का WhatsApp' },
    summary: {
      en: 'Settings shows which parts of NetCyberAI your school has, and lets you connect the school’s own WhatsApp number. Most schools set WhatsApp up together with NetCyberAI.',
      hi: 'सेटिंग में दिखता है कि NetCyberAI के कौन-से हिस्से आपके स्कूल में चालू हैं, और यहीं से स्कूल का अपना WhatsApp नंबर जोड़ा जाता है। ज़्यादातर स्कूल WhatsApp को NetCyberAI के साथ मिलकर सेट करते हैं।',
    },
    steps: [
      { en: 'Open Settings from the menu.', hi: 'मेनू से Settings खोलें।' },
      { en: 'The first list shows each part, whether it is on, and what changes when it is off. To change one, raise a ticket.', hi: 'पहली सूची में हर हिस्सा है: वह चालू है या नहीं, और बंद होने पर क्या बदलता है। बदलने के लिए टिकट भेजें।' },
      { en: 'Under “WhatsApp Business Account”, press “Connect your own WhatsApp Business Account”.', hi: '“WhatsApp Business Account” के नीचे “Connect your own WhatsApp Business Account” दबाएँ।' },
      { en: 'Enter the “WABA ID”, the “Phone number ID (Meta)”, the “Access token” and the “Webhook verify token” from your Meta Business account, then save.', hi: 'अपने Meta Business खाते से “WABA ID”, “Phone number ID (Meta)”, “Access token” और “Webhook verify token” भरें, फिर सेव करें।' },
    ],
    tips: [
      { en: 'Not sure where to find these? Raise a ticket and NetCyberAI will set it up with you.', hi: 'ये कहाँ मिलेंगे, पक्का नहीं? टिकट भेजें, NetCyberAI आपके साथ मिलकर सेट कर देगा।' },
      { en: 'Until your own number is connected and checked, your school’s messages do not go out from your own number.', hi: 'जब तक आपका अपना नंबर जुड़कर जाँच नहीं लिया जाता, आपके स्कूल के संदेश आपके अपने नंबर से नहीं जाते।' },
    ],
    start: { href: '/app/settings', label: { en: 'Settings', hi: 'Settings' } },
    related: ['raise-a-ticket', 'compliance-screen'],
    keywords: ['settings', 'whatsapp', 'waba', 'token', 'modules', 'switch', 'plan', 'सेटिंग', 'व्हाट्सऐप', 'whatsapp kaise jode'],
  },
  {
    slug: 'make-a-certificate',
    category: 'daily',
    audience: 'office',
    title: { en: 'Make a certificate with the free certificate tool', hi: 'मुफ़्त certificate tool से प्रमाणपत्र बनाएँ' },
    summary: {
      en: 'Certificates inside the school app are not built yet. Until then, the free tool on our website makes transfer, bonafide, character, study and achievement certificates as a PDF.',
      hi: 'स्कूल ऐप के अंदर प्रमाणपत्र अभी नहीं बने हैं। तब तक हमारी वेबसाइट का मुफ़्त tool transfer, bonafide, character, study और achievement प्रमाणपत्र PDF के रूप में बनाता है।',
    },
    steps: [
      { en: 'Open “Free tools” on the NetCyberAI website and choose the certificate you need.', hi: 'NetCyberAI वेबसाइट पर “Free tools” खोलें और जो प्रमाणपत्र चाहिए उसे चुनें।' },
      { en: 'Fill in your school’s details and add the school logo. Add the signatory’s name and designation.', hi: 'अपने स्कूल का विवरण भरें और स्कूल का logo जोड़ें। हस्ताक्षरकर्ता का नाम और पद लिखें।' },
      { en: 'Fill in the student’s details exactly as in your school records.', hi: 'विद्यार्थी का विवरण ठीक वैसा भरें जैसा स्कूल के रिकॉर्ड में है।' },
      { en: 'Press “1. Generate” and check every detail in the preview.', hi: '“1. Generate” दबाएँ और preview में हर विवरण जाँचें।' },
      { en: 'Press “2. Download PDF”, or “3. Print”.', hi: '“2. Download PDF” या “3. Print” दबाएँ।' },
      { en: 'Download the register of certificates you made before closing the tab, and keep it with your school records.', hi: 'टैब बंद करने से पहले बनाए गए प्रमाणपत्रों का register डाउनलोड करें और उसे स्कूल के रिकॉर्ड के साथ रखें।' },
    ],
    tips: [
      { en: 'Nothing is uploaded or saved: the form, logo and certificate stay in your browser tab. Closing the tab clears them.', hi: 'कुछ भी upload या सेव नहीं होता: फ़ॉर्म, logo और प्रमाणपत्र आपके browser टैब में ही रहते हैं। टैब बंद करते ही वे मिट जाते हैं।' },
      { en: 'Save your school profile as a file on your device and load it next time to skip typing.', hi: 'अपने स्कूल की profile को डिवाइस पर फ़ाइल के रूप में सेव करें और अगली बार उसे load करें, ताकि दोबारा लिखना न पड़े।' },
      { en: 'This tool does not read your student records and keeps no issue register for you. That comes with certificates inside the app.', hi: 'यह tool आपके विद्यार्थी रिकॉर्ड नहीं पढ़ता और आपके लिए कोई issue register नहीं रखता। यह सुविधा ऐप के अंदर के प्रमाणपत्रों के साथ आएगी।' },
    ],
    start: { href: '/free-tools', label: { en: 'Free tools', hi: 'Free tools' } },
    related: ['student-id-cards', 'raise-a-ticket'],
    keywords: ['tc', 'transfer certificate', 'bonafide', 'character certificate', 'study certificate', 'pdf', 'प्रमाणपत्र', 'टीसी', 'बोनाफाइड', 'सर्टिफिकेट'],
  },
  {
    slug: 'raise-a-ticket',
    category: 'support',
    audience: 'everyone',
    title: { en: 'Raise a support ticket', hi: 'सहायता टिकट बनाएँ' },
    summary: { en: 'Ask NetCyberAI for help and follow the answer in the app.', hi: 'NetCyberAI से मदद माँगें और जवाब ऐप में ही देखें।' },
    steps: [
      { en: 'Open “Raise Ticket” under “Help” in the menu and press “Raise a ticket”.', hi: 'मेनू में “Help” के नीचे “Raise Ticket” खोलें और “Raise a ticket” दबाएँ।' },
      { en: 'Choose what it is about and, if you know it, which part of the app.', hi: 'चुनें कि यह किस बारे में है और, पता हो तो, ऐप का कौन-सा हिस्सा।' },
      { en: 'Write a short subject, then what you were doing, what you expected and what you saw.', hi: 'एक छोटा subject लिखें, फिर लिखें कि आप क्या कर रहे थे, क्या उम्मीद थी और क्या दिखा।' },
      { en: 'Add up to 5 screenshots if they help (PNG, JPEG or WebP, 4 MB each).', hi: 'ज़रूरत हो तो 5 तक screenshot जोड़ें (PNG, JPEG या WebP, हर एक 4 MB तक)।' },
      { en: 'Press “Raise ticket”. Note the reference, for example T-1A2B3C4D.', hi: '“Raise ticket” दबाएँ। reference नोट कर लें, जैसे T-1A2B3C4D।' },
      { en: 'Open the ticket to read replies. When it says “Waiting on school”, reply so work can continue.', hi: 'जवाब पढ़ने के लिए टिकट खोलें। जब “Waiting on school” लिखा हो, तो जवाब दें ताकि काम आगे बढ़े।' },
      { en: 'When it is “Resolved”, press “Yes, it is solved: close”, or “Not solved: reopen”.', hi: 'जब “Resolved” लिखा हो, तो “Yes, it is solved: close” या “Not solved: reopen” दबाएँ।' },
    ],
    tips: [
      { en: 'Never put a password or a one-time code in a ticket.', hi: 'टिकट में कभी पासवर्ड या one-time code न लिखें।' },
      { en: 'Hide anything private before you take a screenshot.', hi: 'Screenshot लेने से पहले कोई भी निजी जानकारी छिपा दें।' },
      { en: 'The principal and school admin see all of the school’s tickets. Everyone else sees only their own.', hi: 'प्रिंसिपल और स्कूल एडमिन को स्कूल के सभी टिकट दिखते हैं। बाकी सभी को केवल अपने टिकट दिखते हैं।' },
    ],
    start: { href: '/app/help/ticket', label: { en: 'Support tickets', hi: 'सहायता टिकट' } },
    related: ['sign-in', 'mark-attendance'],
    keywords: ['support', 'help', 'problem', 'issue', 'complaint', 'bug', 'error', 'madad', 'मदद', 'समस्या', 'शिकायत', 'टिकट'],
  },
  {
    slug: 'register-your-school',
    category: 'support',
    audience: 'everyone',
    title: { en: 'Register your school', hi: 'अपना स्कूल रजिस्टर करें' },
    summary: { en: 'For a school that is not on NetCyberAI yet: apply online; the principal gets an invitation once it is approved.', hi: 'उस स्कूल के लिए जो अभी NetCyberAI पर नहीं है: ऑनलाइन आवेदन करें; मंज़ूरी के बाद प्रिंसिपल को निमंत्रण मिलता है।' },
    steps: [
      { en: 'Open the “Register your school” page on the NetCyberAI website.', hi: 'NetCyberAI वेबसाइट पर “Register your school” पेज खोलें।' },
      { en: 'Step 1, “About your school”: school name, city or town, state, board, approximate number of students, and the principal’s name, email and mobile.', hi: 'Step 1, “About your school”: स्कूल का नाम, शहर या क़स्बा, राज्य, बोर्ड, विद्यार्थियों की अनुमानित संख्या, और प्रिंसिपल का नाम, ईमेल और मोबाइल।' },
      { en: 'Press “Continue: email me a code”. We send a 6-digit code to the principal’s email.', hi: '“Continue: email me a code” दबाएँ। हम प्रिंसिपल के ईमेल पर 6 अंकों का कोड भेजते हैं।' },
      { en: 'Step 2, “Confirm your email”: type that code and press “Confirm and send application”. The code works for 15 minutes.', hi: 'Step 2, “Confirm your email”: वह कोड लिखें और “Confirm and send application” दबाएँ। कोड 15 मिनट तक चलता है।' },
      { en: 'Our team reviews the application. Once approved, the principal gets an email invitation to set a password.', hi: 'हमारी टीम आवेदन की समीक्षा करती है। मंज़ूरी के बाद प्रिंसिपल को पासवर्ड सेट करने का ईमेल निमंत्रण मिलता है।' },
      { en: 'The principal signs in and invites the staff from the “Staff” page.', hi: 'प्रिंसिपल साइन इन करके “Staff” पेज से स्टाफ़ को आमंत्रित करते हैं।' },
    ],
    tips: [
      { en: 'No code? Check spam, then use “Send a new code”.', hi: 'कोड नहीं आया? Spam देखें, फिर “Send a new code” दबाएँ।' },
      { en: 'Parents and students never need an account.', hi: 'माता-पिता और विद्यार्थियों को कभी खाता बनाने की ज़रूरत नहीं होती।' },
      { en: 'The details are used only to review the application and contact the principal.', hi: 'यह जानकारी केवल आवेदन की समीक्षा और प्रिंसिपल से संपर्क के लिए उपयोग होती है।' },
    ],
    start: { href: '/register-school', label: { en: 'Register your school', hi: 'Register your school' } },
    related: ['sign-in', 'raise-a-ticket'],
    keywords: ['new school', 'onboarding', 'apply', 'application', 'signup', 'sign up', 'join', 'नया स्कूल', 'आवेदन', 'पंजीकरण', 'रजिस्ट्रेशन'],
  },
];

export function helpArticle(slug: string): HelpArticle | null {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function isHelpLang(v: unknown): v is HelpLang {
  return v === 'en' || v === 'hi';
}

// Words of the Help Center's own screens.
export const HELP_TEXT = {
  title: { en: 'Help Center', hi: 'सहायता केंद्र' },
  intro: { en: 'Step-by-step guides for what you can do in NetCyberAI today.', hi: 'NetCyberAI में आज जो काम हो सकते हैं, उनकी क़दम-दर-क़दम गाइड।' },
  search: { en: 'Search the guides', hi: 'गाइड खोजें' },
  searchHint: { en: 'For example: password, attendance, CSV', hi: 'जैसे: पासवर्ड, हाज़िरी, CSV' },
  results: { en: 'guides found', hi: 'गाइड मिलीं' },
  resultOne: { en: 'guide found', hi: 'गाइड मिली' },
  noResults: { en: 'No guide matches that.', hi: 'इससे मिलती कोई गाइड नहीं मिली।' },
  noResultsDo: { en: 'Try a shorter word, or raise a ticket and we will help.', hi: 'कोई छोटा शब्द आज़माएँ, या टिकट बनाएँ और हम मदद करेंगे।' },
  allGuides: { en: 'All guides', hi: 'सभी गाइड' },
  steps: { en: 'Steps', hi: 'क़दम' },
  tips: { en: 'Good to know', hi: 'ध्यान रखें' },
  startHere: { en: 'Start here', hi: 'यहाँ से शुरू करें' },
  related: { en: 'Related guides', hi: 'संबंधित गाइड' },
  stuck: { en: 'Still stuck?', hi: 'अब भी अटके हैं?' },
  stuckDo: { en: 'Raise a ticket and NetCyberAI will answer in the app.', hi: 'टिकट बनाएँ, NetCyberAI ऐप में ही जवाब देगा।' },
  raise: { en: 'Raise a ticket', hi: 'टिकट बनाएँ' },
  back: { en: 'All guides', hi: 'सभी गाइड' },
  language: { en: 'Language', hi: 'भाषा' },
  notFound: { en: 'This guide does not exist.', hi: 'यह गाइड मौजूद नहीं है।' },
  screensInEnglish: { en: '', hi: 'ऐप की स्क्रीन अभी अंग्रेज़ी में हैं, इसलिए बटनों के नाम अंग्रेज़ी में ही लिखे गए हैं।' },
  unreviewed: {
    en: 'The Hindi version is a first translation and has not been reviewed yet.',
    hi: 'यह हिंदी अनुवाद पहला मसौदा है और अभी इसकी समीक्षा नहीं हुई है। कोई बात साफ़ न हो तो अंग्रेज़ी संस्करण देखें।',
  },
} as const satisfies Record<string, L>;
