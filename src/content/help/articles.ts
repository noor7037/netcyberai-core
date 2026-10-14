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
      { en: 'If the row shows “Next on the syllabus:”, one tap on “Taught today” records that topic as taught.', hi: 'अगर पंक्ति में “Next on the syllabus:” दिखे, तो “Taught today” पर एक टैप उस विषय-बिंदु को पढ़ाया हुआ दर्ज कर देता है।' },
      { en: 'Or type the “Topic taught” and tap what happened: “Taught”, “Partly taught”, “Delayed” or “Not taught”. It is saved at once.', hi: 'या “Topic taught” लिखें और जो हुआ उस पर टैप करें: “Taught”, “Partly taught”, “Delayed” या “Not taught”। यह तुरंत सेव हो जाता है।' },
      { en: 'A row that shows “Not recorded” has nothing saved for today yet.', hi: 'जिस पंक्ति में “Not recorded” लिखा है, उसमें आज के लिए अभी कुछ सेव नहीं है।' },
      { en: 'Made a mistake? Tap the right one; the newest choice replaces the earlier one for today.', hi: 'ग़लती हो गई? सही विकल्प पर टैप करें; आज के लिए नया चुनाव पुराने की जगह ले लेता है।' },
      { en: 'To plan the year, open “Syllabus map” in the row, write one topic per line as Chapter | Topic, and press “Add topics”.', hi: 'साल की योजना के लिए पंक्ति में “Syllabus map” खोलें, हर पंक्ति में एक विषय-बिंदु Chapter | Topic के रूप में लिखें, और “Add topics” दबाएँ।' },
    ],
    tips: [
      { en: 'One tap also fills the classwork log and prepares the day’s message to parents. Nothing is sent to parents yet.', hi: 'एक टैप से कक्षा-कार्य का रजिस्टर भी भरता है और अभिभावकों का दिन का संदेश तैयार होता है। अभी अभिभावकों को कुछ भेजा नहीं जाता।' },
      { en: 'With no internet the tap is kept on the phone and sent when the internet is back.', hi: 'इंटरनेट न हो तो टैप फ़ोन पर रहता है और इंटरनेट आते ही भेज दिया जाता है।' },
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
    slug: 'daily-pulse-message',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Prepare the day’s message to parents', hi: 'अभिभावकों के लिए दिन का संदेश तैयार करें' },
    summary: {
      en: 'When you record a lesson in Taught today, its message to parents is written for you in English, Hindi and Hinglish, with the day’s homework. Read it, change it if you wish, and mark it ready.',
      hi: 'Taught today में पाठ दर्ज करते ही अभिभावकों का संदेश अंग्रेज़ी, हिंदी और हिंग्लिश में, दिन के गृहकार्य के साथ, अपने-आप लिख जाता है। पढ़ें, चाहें तो बदलें, और तैयार करें।',
    },
    steps: [
      { en: 'Record the lesson in Taught today. Set the day’s homework in Homework, if there is any.', hi: 'Taught today में पाठ दर्ज करें। अगर गृहकार्य है तो Homework में दें।' },
      { en: 'Open “Daily Pulse”. Under “Today’s messages to parents” there is one message for each lesson.', hi: '“Daily Pulse” खोलें। “Today’s messages to parents” के नीचे हर पाठ का एक संदेश है।' },
      { en: 'Tap “English”, “Hindi” or “Hinglish” to read each one. Change the words if you wish, then press “Save the words”.', hi: 'हर एक को पढ़ने के लिए “English”, “Hindi” या “Hinglish” टैप करें। चाहें तो शब्द बदलें, फिर “Save the words” दबाएँ।' },
      { en: 'Press “Mark ready”. “Back to draft” takes it back.', hi: '“Mark ready” दबाएँ। “Back to draft” से वापस ड्राफ़्ट हो जाता है।' },
      { en: 'When the words are right, press “Send to parents”. The message goes to the guardians of that class who have agreed to the Daily Pulse.', hi: 'जब शब्द सही हों, तो “Send to parents” दबाएँ। संदेश उस कक्षा के उन अभिभावकों को जाता है जिन्होंने Daily Pulse के लिए सहमति दी है।' },
    ],
    tips: [
      { en: 'Nothing goes to parents by itself: a person marks the message ready and a person sends it. Until WhatsApp is connected for your school, a sent message is recorded and reaches no phone.', hi: 'अभिभावकों को कुछ भी अपने आप नहीं जाता: एक व्यक्ति संदेश को तैयार चिह्नित करता है और एक व्यक्ति उसे भेजता है। जब तक आपके स्कूल के लिए WhatsApp जुड़ा नहीं है, भेजा गया संदेश दर्ज होता है और किसी फ़ोन तक नहीं पहुँचता।' },
      { en: 'A parent can answer 1 if the child understood, or 2 if the child needs help. An answer of 2 puts the child in the needs-help list for their teacher.', hi: 'अभिभावक जवाब में 1 लिख सकते हैं अगर बच्चे को समझ आया, या 2 अगर बच्चे को मदद चाहिए। 2 लिखने पर बच्चा अपने शिक्षक की मदद वाली सूची में आ जाता है।' },
      { en: 'A lesson marked “Not taught” has no message: parents are never told a lesson happened when it did not.', hi: '“Not taught” वाले पाठ का कोई संदेश नहीं बनता: अभिभावकों को कभी नहीं बताया जाता कि पाठ हुआ जबकि वह नहीं हुआ।' },
      { en: 'If you change the lesson in Taught today, its message is written again and goes back to draft.', hi: 'अगर आप Taught today में पाठ बदलते हैं, तो उसका संदेश फिर से लिखा जाता है और वापस ड्राफ़्ट हो जाता है।' },
    ],
    start: { href: '/app/pulse', label: { en: 'Daily Pulse', hi: 'Daily Pulse' } },
    related: ['taught-today', 'set-homework', 'needs-help-queue'],
    keywords: ['pulse', 'daily pulse', 'message', 'parents', 'hinglish', 'ready', 'draft', 'संदेश', 'अभिभावक', 'पल्स'],
  },
  {
    slug: 'needs-help-queue',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Follow up a student who needs help', hi: 'मदद चाहने वाले विद्यार्थी का फ़ॉलो-अप करें' },
    summary: {
      en: 'Daily Pulse lists the students who need a follow-up from you, with a suggestion. After you act, record what happened.',
      hi: 'Daily Pulse उन विद्यार्थियों की सूची दिखाता है जिन्हें आपके फ़ॉलो-अप की ज़रूरत है, एक सुझाव के साथ। काम करने के बाद दर्ज करें कि क्या हुआ।',
    },
    steps: [
      { en: 'Open “Daily Pulse”. Each card is one student, why they need help, and a “Suggested follow-up:”.', hi: '“Daily Pulse” खोलें। हर कार्ड एक विद्यार्थी है, उसे मदद क्यों चाहिए, और एक “Suggested follow-up:”।' },
      { en: 'Help the student in the way that fits. The suggestion is only a starting point.', hi: 'जो तरीक़ा ठीक लगे, उससे विद्यार्थी की मदद करें। सुझाव सिर्फ़ शुरुआत के लिए है।' },
      { en: 'Write a line under “What happened”, then tap “Done”. If no follow-up was needed after all, tap “Not needed”.', hi: '“What happened” के नीचे एक पंक्ति लिखें, फिर “Done” टैप करें। अगर फ़ॉलो-अप की ज़रूरत ही नहीं थी, तो “Not needed” टैप करें।' },
      { en: 'To note a student yourself, use “Add a student who needs help”: choose the class and the student, say what is needed, and press “Add to the queue”.', hi: 'विद्यार्थी को ख़ुद जोड़ने के लिए “Add a student who needs help” इस्तेमाल करें: कक्षा और विद्यार्थी चुनें, बताएँ क्या चाहिए, और “Add to the queue” दबाएँ।' },
    ],
    tips: [
      { en: 'A teacher sees only the students of their own classes. The office sees every class.', hi: 'शिक्षक को केवल अपनी कक्षाओं के विद्यार्थी दिखते हैं। दफ़्तर को सभी कक्षाएँ दिखती हैं।' },
      { en: 'The list is in the order the students were added. It does not rank children.', hi: 'सूची उसी क्रम में है जिसमें विद्यार्थी जोड़े गए। यह बच्चों की कोई रैंकिंग नहीं है।' },
      { en: 'Nothing is sent to parents from this screen. When WhatsApp sending starts, a parent’s reply will add the student here.', hi: 'इस स्क्रीन से अभिभावकों को कुछ नहीं भेजा जाता। WhatsApp शुरू होने पर अभिभावक का जवाब विद्यार्थी को यहाँ जोड़ देगा।' },
    ],
    start: { href: '/app/pulse', label: { en: 'Daily Pulse', hi: 'Daily Pulse' } },
    related: ['taught-today', 'mark-attendance', 'use-my-day'],
    keywords: ['needs help', 'follow up', 'follow-up', 'pulse', 'daily pulse', 'queue', 'मदद', 'फ़ॉलो-अप', 'पल्स'],
  },
  {
    slug: 'set-homework',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Set homework and check who has done it', hi: 'गृहकार्य दें और देखें किसने किया' },
    summary: {
      en: 'Write a homework once, copy it to every section it is for, and mark each student done or not done.',
      hi: 'गृहकार्य एक बार लिखें, जिन-जिन सेक्शन के लिए है उनमें कॉपी करें, और हर विद्यार्थी पर किया या नहीं किया लगाएँ।',
    },
    steps: [
      { en: 'Open “Homework”, then “Set homework”. Choose the “Subject” and the “Due date”, and write “What to do”.', hi: '“Homework” खोलें, फिर “Set homework”। “Subject” और “Due date” चुनें, और “What to do” लिखें।' },
      { en: 'Under “For which sections”, tick every section the homework is for. Each one gets its own copy.', hi: '“For which sections” के नीचे उन सभी सेक्शन पर निशान लगाएँ जिनके लिए गृहकार्य है। हर एक को अपनी कॉपी मिलती है।' },
      { en: 'If you wish, add “A photo or a PDF (optional)” of the page or worksheet. Then press the button to set it.', hi: 'चाहें तो पन्ने या वर्कशीट की “A photo or a PDF (optional)” जोड़ें। फिर देने के लिए बटन दबाएँ।' },
      { en: 'On the due date, press “Check who has done it” on a section’s homework. Tap “Done” or “Not done” beside each student, or “All done”, then “Save”.', hi: 'तारीख़ वाले दिन किसी सेक्शन के गृहकार्य पर “Check who has done it” दबाएँ। हर विद्यार्थी के पास “Done” या “Not done” टैप करें, या “All done”, फिर “Save”।' },
      { en: 'To correct a homework, press “Change”. Tick the sections whose copy should change; the others keep it as it was given.', hi: 'गृहकार्य ठीक करने के लिए “Change” दबाएँ। जिन सेक्शन की कॉपी बदलनी है उन पर निशान लगाएँ; बाकी की वैसी ही रहती है जैसी दी गई थी।' },
    ],
    tips: [
      { en: 'Checking works with no internet: it is kept on the phone and sent when the internet is back. Setting and changing a homework need the internet.', hi: 'जाँचना बिना इंटरनेट के भी चलता है: यह फ़ोन पर रहता है और इंटरनेट आते ही भेज दिया जाता है। गृहकार्य देने और बदलने के लिए इंटरनेट चाहिए।' },
      { en: 'A teacher sets homework only for their own classes. The office can set it for any class.', hi: 'शिक्षक सिर्फ़ अपनी कक्षाओं को गृहकार्य दे सकता है। दफ़्तर किसी भी कक्षा को दे सकता है।' },
      { en: 'Parents do not receive homework yet. That starts with WhatsApp.', hi: 'अभी अभिभावकों को गृहकार्य नहीं भेजा जाता। यह WhatsApp के साथ शुरू होगा।' },
    ],
    start: { href: '/app/homework', label: { en: 'Homework', hi: 'Homework' } },
    related: ['taught-today', 'needs-help-queue', 'mark-attendance'],
    keywords: ['homework', 'home work', 'assignment', 'worksheet', 'due', 'sections', 'गृहकार्य', 'होमवर्क'],
  },
  {
    slug: 'homework-recovery',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Help a student catch up on missed homework', hi: 'छूटे गृहकार्य की भरपाई में विद्यार्थी की मदद करें' },
    summary: {
      en: 'Homework Recovery lists the students who have not done several homeworks lately and suggests a catch-up plan. You approve it or dismiss it.',
      hi: 'Homework Recovery उन विद्यार्थियों की सूची दिखाता है जिन्होंने हाल में कई गृहकार्य नहीं किए, और भरपाई की योजना सुझाता है। आप उसे मंज़ूर या ख़ारिज करते हैं।',
    },
    steps: [
      { en: 'Open “Homework Recovery”. Each card is one student and the homeworks marked “Not done”.', hi: '“Homework Recovery” खोलें। हर कार्ड एक विद्यार्थी और उसके “Not done” वाले गृहकार्य हैं।' },
      { en: 'Read the suggested plan: one homework a school day, the oldest first.', hi: 'सुझाई गई योजना पढ़ें: हर स्कूल-दिन एक गृहकार्य, सबसे पुराना पहले।' },
      { en: 'Press “Approve the plan” to keep it, or “Dismiss” if the student does not need one.', hi: 'रखने के लिए “Approve the plan” दबाएँ, या अगर विद्यार्थी को ज़रूरत नहीं तो “Dismiss”।' },
    ],
    tips: [
      { en: 'A student is listed only from homework you marked “Not done” in Homework. Homework left unchecked is not counted.', hi: 'विद्यार्थी केवल उन गृहकार्यों से सूची में आता है जिन पर आपने Homework में “Not done” लगाया। बिना जाँचा गृहकार्य नहीं गिना जाता।' },
      { en: 'Nothing is sent to parents yet. An approved plan waits for the message that starts with WhatsApp.', hi: 'अभी अभिभावकों को कुछ नहीं भेजा जाता। मंज़ूर योजना उस संदेश का इंतज़ार करती है जो WhatsApp के साथ शुरू होगा।' },
      { en: 'The list is by name. It does not rank children, and students and parents never see it.', hi: 'सूची नाम के क्रम में है। यह बच्चों की रैंकिंग नहीं है, और विद्यार्थी व अभिभावक इसे कभी नहीं देखते।' },
    ],
    start: { href: '/app/recovery', label: { en: 'Homework Recovery', hi: 'Homework Recovery' } },
    related: ['set-homework', 'needs-help-queue', 'daily-pulse-message'],
    keywords: ['recovery', 'catch up', 'catch-up', 'missed homework', 'not done', 'भरपाई', 'छूटा गृहकार्य'],
  },
  {
    slug: 'teacher-copilot',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Get a first draft from Teacher Copilot', hi: 'Teacher Copilot से पहला मसौदा लें' },
    summary: {
      en: 'Copilot writes a first draft of a lesson plan, a worksheet or the day’s message from a topic on your syllabus map. You read it, change it and approve it.',
      hi: 'Copilot आपके पाठ्यक्रम के नक्शे के विषय-बिंदु से पाठ-योजना, वर्कशीट या दिन के संदेश का पहला मसौदा लिखता है। आप उसे पढ़ते, बदलते और मंज़ूर करते हैं।',
    },
    steps: [
      { en: 'Open “Teacher Copilot”. Under “What to draft”, choose “Lesson plan”, “Worksheet” or “Message to parents”.', hi: '“Teacher Copilot” खोलें। “What to draft” के नीचे “Lesson plan”, “Worksheet” या “Message to parents” चुनें।' },
      { en: 'Choose the “Class and subject” and the “Topic”, then press “Write a draft”.', hi: '“Class and subject” और “Topic” चुनें, फिर “Write a draft” दबाएँ।' },
      { en: 'Read the draft and change what is needed. A draft can be wrong.', hi: 'मसौदा पढ़ें और जो ज़रूरी हो बदलें। मसौदा ग़लत हो सकता है।' },
      { en: 'Press “Approve and save” to keep it under your name, or “Discard”.', hi: 'अपने नाम से रखने के लिए “Approve and save” दबाएँ, या “Discard”।' },
    ],
    tips: [
      { en: 'Only the class level, the subject and the topic are sent to write a draft. Nothing about any student, parent or teacher is sent.', hi: 'मसौदा लिखने के लिए सिर्फ़ कक्षा का स्तर, विषय और विषय-बिंदु भेजे जाते हैं। किसी विद्यार्थी, अभिभावक या शिक्षक के बारे में कुछ नहीं भेजा जाता।' },
      { en: 'Nothing is kept until you approve, and nothing is sent to parents from here.', hi: 'आपकी मंज़ूरी तक कुछ नहीं रखा जाता, और यहाँ से अभिभावकों को कुछ नहीं भेजा जाता।' },
      { en: 'Each school has a monthly limit. If the screen says Copilot is not switched on, nothing is needed from you.', hi: 'हर स्कूल की एक मासिक सीमा है। अगर स्क्रीन कहे कि Copilot चालू नहीं है, तो आपसे कुछ नहीं चाहिए।' },
    ],
    start: { href: '/app/teacher-copilot', label: { en: 'Teacher Copilot', hi: 'Teacher Copilot' } },
    related: ['taught-today', 'daily-pulse-message', 'set-homework'],
    keywords: ['copilot', 'ai', 'draft', 'lesson plan', 'worksheet', 'मसौदा', 'पाठ-योजना', 'वर्कशीट'],
  },
  {
    slug: 'fee-structures',
    category: 'daily',
    audience: 'office',
    title: { en: 'Set what each class pays', hi: 'तय करें कि हर कक्षा कितना देती है' },
    summary: {
      en: 'Name what the school charges for, then set each class’s amounts. A change starts from a date and never rewrites the earlier amounts.',
      hi: 'स्कूल किस-किस की फ़ीस लेता है, यह नाम दें, फिर हर कक्षा की राशियाँ तय करें। बदलाव एक तारीख़ से शुरू होता है और पहले की राशियाँ कभी नहीं बदलता।',
    },
    steps: [
      { en: 'Open “Fees”. Under “Fee heads”, type a name such as Tuition and press “Add head”.', hi: '“Fees” खोलें। “Fee heads” के नीचे ट्यूशन जैसा नाम लिखें और “Add head” दबाएँ।' },
      { en: 'Under “Fee structure by class”, choose the “Class” and the “Session”.', hi: '“Fee structure by class” के नीचे “Class” और “Session” चुनें।' },
      { en: 'Choose the date under “Applies from”, type the “Amount in rupees” for each head and choose “How often”.', hi: '“Applies from” के नीचे तारीख़ चुनें, हर मद की “Amount in rupees” लिखें और “How often” चुनें।' },
      { en: 'Press “Save as a new version”. The page shows “In force now” on the version that applies today.', hi: '“Save as a new version” दबाएँ। जो रूप आज लागू है उस पर “In force now” दिखता है।' },
      { en: 'To change fees later, press “Start from these amounts”, change what is needed, choose the new date and save again.', hi: 'बाद में फ़ीस बदलने के लिए “Start from these amounts” दबाएँ, जो ज़रूरी हो बदलें, नई तारीख़ चुनें और फिर सेव करें।' },
    ],
    tips: [
      { en: 'Nothing saved here is ever changed or deleted. A mistake is corrected by a new version from the same or a later date.', hi: 'यहाँ सेव की हुई कोई चीज़ कभी बदली या हटाई नहीं जाती। ग़लती नए रूप से ठीक होती है।' },
      { en: 'Only the principal, the school admin and the accountant see fees. Teachers do not.', hi: 'फ़ीस केवल प्रिंसिपल, स्कूल एडमिन और अकाउंटेंट को दिखती है। शिक्षकों को नहीं।' },
      { en: 'A fee head that is no longer used can be retired with “Retire”. It stays on the structures already made.', hi: 'जो मद अब इस्तेमाल नहीं होता उसे “Retire” से बंद किया जा सकता है। पहले बने ढाँचों में वह बना रहता है।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['add-a-student', 'raise-a-ticket'],
    keywords: ['fees', 'fee', 'fee structure', 'fee head', 'tuition', 'amount', 'फ़ीस', 'शुल्क', 'ट्यूशन'],
  },
  {
    slug: 'raise-fee-dues',
    category: 'daily',
    audience: 'office',
    title: { en: 'Raise a month’s fee dues, with concessions', hi: 'महीने की फ़ीस की देय राशि बनाएँ, रियायतों के साथ' },
    summary: {
      en: 'Each month the office raises the dues for a class. Every student on the rolls gets a line for each head due, less any approved concession.',
      hi: 'हर महीने दफ़्तर कक्षा की देय राशि बनाता है। नामांकित हर विद्यार्थी को हर देय मद की एक पंक्ति मिलती है, मंज़ूर रियायत घटाकर।',
    },
    steps: [
      { en: 'Open “Fees”. Under “Raise dues for a month”, choose the “Class”, the “Month” and the “Due date”.', hi: '“Fees” खोलें। “Raise dues for a month” के नीचे “Class”, “Month” और “Due date” चुनें।' },
      { en: 'Press “Raise dues”. The page lists every line, with what was billed, what was conceded and what is to pay.', hi: '“Raise dues” दबाएँ। पेज हर पंक्ति दिखाता है: कितना बिल बना, कितनी रियायत, कितना देना है।' },
      { en: 'To give a concession, go to “Concessions”: choose the “Student”, the “Kind of concession”, a percentage or an amount, write the “Reason” and press “Propose concession”.', hi: 'रियायत देने के लिए “Concessions” में जाएँ: “Student”, “Kind of concession”, प्रतिशत या राशि चुनें, “Reason” लिखें और “Propose concession” दबाएँ।' },
      { en: 'The principal or the school admin presses “Approve” in “Concessions of the school”. Until then the concession applies to nothing.', hi: 'प्रिंसिपल या स्कूल एडमिन “Concessions of the school” में “Approve” दबाते हैं। तब तक रियायत किसी पर लागू नहीं होती।' },
      { en: 'For a child admitted under RTE, press “Mark as RTE”, give the “Class at admission” and “Admitted on”, then “Save RTE mark”.', hi: 'RTE के तहत दाख़िल बच्चे के लिए “Mark as RTE” दबाएँ, “Class at admission” और “Admitted on” दें, फिर “Save RTE mark”।' },
    ],
    tips: [
      { en: 'For brothers and sisters: switch on “Sibling concession” in “Settings” under “Fees”, then press “Check sibling concessions” here. It proposes one for each child the rule covers, only in families the office has linked; each waits for “Approve”.', hi: 'भाई-बहनों के लिए: “Settings” में “Fees” के नीचे “Sibling concession” चालू करें, फिर यहाँ “Check sibling concessions” दबाएँ। नियम में आने वाले हर बच्चे के लिए एक रियायत प्रस्तावित होती है, सिर्फ़ उन परिवारों में जिन्हें दफ़्तर ने जोड़ा है; हर एक “Approve” का इंतज़ार करती है।' },
      { en: 'Raising the same month twice is safe: it adds only the lines that are missing, for example for a student who joined later.', hi: 'वही महीना दो बार बनाना सुरक्षित है: सिर्फ़ छूटी हुई पंक्तियाँ जुड़ती हैं, जैसे बाद में आए विद्यार्थी की।' },
      { en: 'A due that has been raised is never changed. A concession approved later applies to the months raised after it.', hi: 'बन चुकी देय राशि कभी नहीं बदलती। बाद में मंज़ूर रियायत उसके बाद बने महीनों पर लागू होती है।' },
      { en: 'A student whose parent’s consent is still awaited is billed like any other; consent decides messages, not fees. A student who has left or is inactive is not billed.', hi: 'जिस विद्यार्थी के अभिभावक की सहमति अभी बाकी है, उसका बिल बाकी सबकी तरह बनता है; सहमति संदेशों का फ़ैसला करती है, फ़ीस का नहीं। जो विद्यार्थी स्कूल छोड़ चुका है या निष्क्रिय है, उसका बिल नहीं बनता।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['fee-structures', 'add-a-student'],
    keywords: ['dues', 'fees', 'raise dues', 'concession', 'discount', 'rte', 'scholarship', 'sibling', 'देय', 'रियायत', 'छूट'],
  },
  {
    slug: 'take-fee-payment',
    category: 'daily',
    audience: 'office',
    title: { en: 'Take a fee payment and give a receipt', hi: 'फ़ीस का भुगतान लें और रसीद दें' },
    summary: {
      en: 'Find the student, see what is owed, type what was received and how. One press gives one numbered receipt to print.',
      hi: 'विद्यार्थी चुनें, देखें कितना बाकी है, कितना मिला और कैसे, यह लिखें। एक बार दबाने पर एक नंबर वाली रसीद बनती है।',
    },
    steps: [
      { en: 'Open “Fees”. Under “Take a payment”, choose the “Class” and the “Student”. The dues still owed are listed, oldest first.', hi: '“Fees” खोलें। “Take a payment” के नीचे “Class” और “Student” चुनें। बाकी देय राशियाँ दिखती हैं, सबसे पुरानी पहले।' },
      { en: 'Type the “Amount received, in rupees”, choose “How it was paid” and, for a cheque or UPI, the reference.', hi: '“Amount received, in rupees” लिखें, “How it was paid” चुनें और चेक या UPI हो तो संदर्भ लिखें।' },
      { en: 'Press “Take payment”. The money goes to the oldest due first.', hi: '“Take payment” दबाएँ। रकम सबसे पुरानी देय राशि में पहले जाती है।' },
      { en: 'Press “Open the receipt to print”, then “Print”.', hi: '“Open the receipt to print” दबाएँ, फिर “Print”।' },
    ],
    tips: [
      { en: 'Under “Payment link for the family”, the office can make one link for everything the family owes. Until online payment is switched on for your school it says so, and the payment is taken at the counter.', hi: '“Payment link for the family” के नीचे दफ़्तर परिवार के पूरे बकाये के लिए एक लिंक बना सकता है। जब तक आपके स्कूल के लिए ऑनलाइन भुगतान चालू नहीं होता, वहाँ यही लिखा रहता है और भुगतान काउंटर पर लिया जाता है।' },
      { en: 'With the family ticked, “What the family owes” lists each child’s amount and one total.', hi: 'परिवार पर निशान लगाने पर “What the family owes” में हर बच्चे की राशि और एक कुल जोड़ दिखता है।' },
      { en: 'If a parent wants the money to go to a particular due, tick “Choose which dues this money is for (otherwise the oldest first)” and type the amount beside each.', hi: 'अगर अभिभावक चाहें कि रकम किसी ख़ास देय में जाए, तो “Choose which dues this money is for (otherwise the oldest first)” पर निशान लगाएँ और हर एक के पास राशि लिखें।' },
      { en: 'For brothers and sisters, tick “Take it for the whole family (brothers and sisters together)”. One receipt covers them all.', hi: 'भाई-बहनों के लिए “Take it for the whole family (brothers and sisters together)” पर निशान लगाएँ। एक रसीद सबके लिए बनती है।' },
      { en: 'A wrong receipt is not edited. The principal or the school admin presses “Reverse” and writes why; the dues are then owed again and the number is not used again.', hi: 'ग़लत रसीद बदली नहीं जाती। प्रिंसिपल या स्कूल एडमिन “Reverse” दबाकर कारण लिखते हैं; देय राशि फिर बाकी हो जाती है और वह नंबर दोबारा इस्तेमाल नहीं होता।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['raise-fee-dues', 'fee-structures'],
    keywords: ['payment', 'receipt', 'cash', 'cheque', 'upi', 'fees', 'collect', 'reverse', 'भुगतान', 'रसीद', 'नकद'],
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
    slug: 'fees-overdue-late-fee',
    category: 'daily',
    audience: 'office',
    title: { en: 'Overdue fees and the late fee', hi: 'बकाया फ़ीस और विलंब शुल्क' },
    summary: {
      en: 'Each night the app marks every fee past its due date with money still owed as overdue, part paid or not. A late fee is charged only if the school sets one.',
      hi: 'हर रात ऐप उस हर फ़ीस को बकाया चिह्नित करता है जिसकी जमा तारीख़ निकल चुकी है और पैसा बाकी है, चाहे कुछ हिस्सा जमा हो। विलंब शुल्क तभी लगता है जब स्कूल उसे तय करे।',
    },
    steps: [
      { en: 'Open “Fees”. The box at the top shows “Overdue”: the money still owed on fees past their due date.', hi: '“Fees” खोलें। ऊपर के बॉक्स में “Overdue” दिखता है: जमा तारीख़ निकल चुकी फ़ीस पर बाकी पैसा।' },
      { en: 'Under “Take a payment”, choose the student. A due past its date is marked “Overdue”.', hi: '“Take a payment” के नीचे विद्यार्थी चुनें। जिस देय राशि की तारीख़ निकल चुकी है, उस पर “Overdue” लिखा होता है।' },
      { en: 'To charge a late fee, the principal or the school admin opens “Settings”, and under “Fees” switches on “Charge a late fee”, types the “Late fee, in rupees” and the “Days of grace before a late fee”, and presses “Save these settings”.', hi: 'विलंब शुल्क लगाने के लिए प्रिंसिपल या स्कूल एडमिन “Settings” खोलते हैं, “Fees” के नीचे “Charge a late fee” चालू करते हैं, “Late fee, in rupees” और “Days of grace before a late fee” लिखते हैं, और “Save these settings” दबाते हैं।' },
    ],
    tips: [
      { en: 'A part-paid fee past its date counts as overdue on what is left, not on the full amount.', hi: 'कुछ हिस्सा जमा हो चुकी फ़ीस की तारीख़ निकलने पर सिर्फ़ बाकी रकम बकाया गिनी जाती है, पूरी रकम नहीं।' },
      { en: 'A late fee is a new due beside the fee. The fee itself is never changed, and each fee gets one late fee at most.', hi: 'विलंब शुल्क फ़ीस के साथ एक नई देय राशि है। फ़ीस ख़ुद कभी नहीं बदलती, और हर फ़ीस पर ज़्यादा से ज़्यादा एक विलंब शुल्क लगता है।' },
      { en: 'Switching the late fee on never fines the past: only fees falling due from that day on.', hi: 'विलंब शुल्क चालू करने से पुरानी फ़ीस पर जुर्माना नहीं लगता: सिर्फ़ उस दिन से देय होने वाली फ़ीस पर।' },
      { en: 'To go back to no late fee, press “Reset to default” under “Charge a late fee”.', hi: 'विलंब शुल्क हटाने के लिए “Charge a late fee” के नीचे “Reset to default” दबाएँ।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['take-fee-payment', 'raise-fee-dues'],
    keywords: ['overdue', 'late fee', 'fine', 'fees', 'due date', 'बकाया', 'विलंब शुल्क', 'जुर्माना'],
  },
  {
    slug: 'verify-upi-payment',
    category: 'daily',
    audience: 'office',
    title: { en: 'Verify a UPI payment a parent has made', hi: 'अभिभावक के UPI भुगतान की जाँच करें' },
    summary: {
      en: 'A parent pays the school’s own UPI ID and enters the UTR. The receipt goes out only when someone at the school has found that payment in the school’s bank.',
      hi: 'अभिभावक स्कूल की अपनी UPI ID पर भुगतान करके UTR लिखते हैं। रसीद तभी जाती है जब स्कूल में कोई उस भुगतान को स्कूल के बैंक में देख ले।',
    },
    steps: [
      { en: 'Open “Fees”. Payments waiting for you are at the top, each with the family, the amount and the UTR.', hi: '“Fees” खोलें। जाँच का इंतज़ार कर रहे भुगतान सबसे ऊपर हैं: परिवार, राशि और UTR के साथ।' },
      { en: 'Look for that UTR in the school’s own bank app or statement.', hi: 'स्कूल के अपने बैंक ऐप या स्टेटमेंट में वह UTR ढूँढें।' },
      { en: 'If it is there, press “Found in bank”, type the “Amount seen in the bank, in rupees”, tick the box and press “Confirm and issue the receipt”.', hi: 'अगर वह वहाँ है, तो “Found in bank” दबाएँ, “Amount seen in the bank, in rupees” लिखें, बॉक्स पर निशान लगाएँ और “Confirm and issue the receipt” दबाएँ।' },
      { en: 'If it is not there, press “Not found”. The parent is asked to check the UTR or contact the office.', hi: 'अगर वह वहाँ नहीं है, तो “Not found” दबाएँ। अभिभावक से UTR जाँचने या दफ़्तर से संपर्क करने को कहा जाता है।' },
    ],
    tips: [
      { en: 'A screenshot from a parent is never proof. Only what you see in the school’s bank is.', hi: 'अभिभावक का स्क्रीनशॉट कभी सबूत नहीं है। सबूत सिर्फ़ वही है जो आप स्कूल के बैंक में देखते हैं।' },
      { en: 'If the bank shows a different amount, type the amount you saw. That is what is credited; anything extra goes to the refund list.', hi: 'अगर बैंक में अलग राशि दिखे, तो वही लिखें जो आपने देखी। वही जमा होती है; अतिरिक्त रकम वापसी सूची में जाती है।' },
      { en: 'Above the amount your school has set, the principal must also confirm before the receipt goes out.', hi: 'स्कूल की तय की हुई रकम से ऊपर, रसीद जाने से पहले प्रिंसिपल की पुष्टि भी ज़रूरी है।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['take-fee-payment', 'fees-overdue-late-fee'],
    keywords: ['upi', 'utr', 'verify', 'bank', 'payment', 'receipt', 'यूपीआई', 'जाँच', 'भुगतान'],
  },
  {
    slug: 'upload-bank-statement',
    category: 'daily',
    audience: 'office',
    title: { en: 'Give the school’s bank statement', hi: 'स्कूल का बैंक स्टेटमेंट दें' },
    summary: {
      en: 'The bank statement is the proof of what reached the school. You download it from net banking and give it here; only the money that came in is kept.',
      hi: 'बैंक स्टेटमेंट इस बात का सबूत है कि स्कूल तक क्या पहुँचा। आप इसे नेट बैंकिंग से डाउनलोड करके यहाँ देते हैं; सिर्फ़ आया हुआ पैसा रखा जाता है।',
    },
    steps: [
      { en: 'In your bank’s net banking, download the account statement as a CSV file.', hi: 'अपने बैंक की नेट बैंकिंग में खाते का स्टेटमेंट CSV फ़ाइल के रूप में डाउनलोड करें।' },
      { en: 'Open “Fees” and go to “Bank statements”. The first time, the principal or school admin uses “Add a bank account”.', hi: '“Fees” खोलें और “Bank statements” पर जाएँ। पहली बार प्रिंसिपल या स्कूल एडमिन “Add a bank account” से खाता जोड़ते हैं।' },
      { en: 'Fill “Statement from” and “Statement to”, choose the file and read the statement.', hi: '“Statement from” और “Statement to” भरें, फ़ाइल चुनें और स्टेटमेंट पढ़वाएँ।' },
      { en: 'Check the number of payments and the total against your statement. If they are wrong, correct the columns and press “Read again with these columns”.', hi: 'भुगतानों की संख्या और कुल राशि अपने स्टेटमेंट से मिलाएँ। ग़लत हों तो कॉलम ठीक करके “Read again with these columns” दबाएँ।' },
      { en: 'When they are right, confirm. Only then are the rows kept, and each is checked against the payments waiting.', hi: 'सही होने पर पुष्टि करें। तभी पंक्तियाँ रखी जाती हैं, और हर एक को इंतज़ार कर रहे भुगतानों से मिलाया जाता है।' },
      { en: 'Under “Money in the bank waiting for a person”, match each credit to its family with “Credit this to the family”, or set it aside with “Not a fee”. Both ask why.', hi: '“Money in the bank waiting for a person” के नीचे हर रकम को “Credit this to the family” से उसके परिवार से मिलाएँ, या “Not a fee” से अलग रखें। दोनों में कारण पूछा जाता है।' },
    ],
    tips: [
      { en: 'Giving the same statement twice, or one that overlaps the last, is safe: only new rows are added.', hi: 'वही स्टेटमेंट दो बार देना, या पिछले से मिलता-जुलता स्टेटमेंट देना सुरक्षित है: सिर्फ़ नई पंक्तियाँ जुड़ती हैं।' },
      { en: 'If you see “Does not continue from the statement before it”, a statement in between may be missing. Download and give that one too.', hi: 'अगर “Does not continue from the statement before it” दिखे, तो बीच का कोई स्टेटमेंट छूटा हो सकता है। उसे भी डाउनलोड करके दें।' },
      { en: 'A payment is confirmed by itself only when the bank’s line carries the family’s payment reference, or the UTR the parent entered with the same amount. The amount or the date alone is never enough.', hi: 'भुगतान अपने आप तभी पक्का होता है जब बैंक की पंक्ति में परिवार का भुगतान संदर्भ हो, या अभिभावक का लिखा UTR उसी राशि के साथ हो। सिर्फ़ राशि या तारीख़ कभी काफ़ी नहीं है।' },
      { en: 'The principal sees “Confirmed by hand, but not in the bank statement” in red when a payment someone confirmed is missing from the statement.', hi: 'जब किसी की पुष्टि किया हुआ भुगतान स्टेटमेंट में न हो, तो प्रिंसिपल को “Confirmed by hand, but not in the bank statement” लाल रंग में दिखता है।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['verify-upi-payment', 'take-fee-payment'],
    keywords: ['bank', 'statement', 'csv', 'upload', 'reconcile', 'fees', 'बैंक', 'स्टेटमेंट'],
  },
  {
    slug: 'follow-up-unpaid-fees',
    category: 'daily',
    audience: 'office',
    title: { en: 'Follow up unpaid fees', hi: 'बकाया फ़ीस का फ़ॉलो-अप करें' },
    summary: {
      en: 'One list of the families whose fees are past their date, with what the office last did. Note calls, promises to pay and hardship, and keep track of money to give back.',
      hi: 'उन परिवारों की एक सूची जिनकी फ़ीस की तारीख़ निकल चुकी है, और दफ़्तर ने पिछली बार क्या किया। कॉल, भुगतान के वादे और आर्थिक कठिनाई दर्ज करें, और लौटाए जाने वाले पैसे का हिसाब रखें।',
    },
    steps: [
      { en: 'Open “Fees” and go to “Follow up unpaid fees”. The family that has waited longest is first.', hi: '“Fees” खोलें और “Follow up unpaid fees” पर जाएँ। सबसे लंबे समय से बाक़ी परिवार सबसे पहले है।' },
      { en: 'After speaking to a family, press “Note a call” and write what was said.', hi: 'परिवार से बात करने के बाद “Note a call” दबाएँ और जो बात हुई वह लिखें।' },
      { en: 'If they give a date, press “Promise to pay” and fill “They will pay by”.', hi: 'अगर वे तारीख़ दें, तो “Promise to pay” दबाएँ और “They will pay by” भरें।' },
      { en: 'If the family cannot pay, press “Hardship”, write what they told you and the concession to request. The principal or school admin then decides it under concessions.', hi: 'अगर परिवार भुगतान नहीं कर सकता, तो “Hardship” दबाएँ, उन्होंने जो बताया वह और माँगी जाने वाली रियायत लिखें। फिर प्रिंसिपल या स्कूल एडमिन रियायतों में उस पर फ़ैसला करते हैं।' },
    ],
    tips: [
      { en: 'While a promise or hardship is open, that family is sent no reminder. Close it when it ends.', hi: 'जब तक वादा या आर्थिक कठिनाई खुली है, उस परिवार को कोई रिमाइंडर नहीं जाता। ख़त्म होने पर उसे बंद करें।' },
      { en: 'Reminders go by email only if the principal or school admin has switched on “Email fee reminders to guardians” in Settings. They go 3 days before a fee is due, on the day and 7 days after, to guardians who have an email address and have agreed to messages from the school.', hi: 'रिमाइंडर ईमेल से तभी जाते हैं जब प्रिंसिपल या स्कूल एडमिन ने Settings में “Email fee reminders to guardians” चालू किया हो। वे फ़ीस की तारीख़ से 3 दिन पहले, उसी दिन और 7 दिन बाद उन अभिभावकों को जाते हैं जिनका ईमेल पता है और जिन्होंने स्कूल के संदेशों के लिए सहमति दी है।' },
      { en: 'When you choose a student under “Take a payment”, “Fee clearance for a transfer or leaving certificate” shows whether fees are still owed. Only the principal or school admin can “Let it through”, with a reason.', hi: '“Take a payment” में विद्यार्थी चुनने पर “Fee clearance for a transfer or leaving certificate” दिखाता है कि फ़ीस बाक़ी है या नहीं। सिर्फ़ प्रिंसिपल या स्कूल एडमिन कारण के साथ “Let it through” कर सकते हैं।' },
      { en: 'Hardship only asks for a concession. Nothing is taken off the fees until someone other than you approves it.', hi: 'आर्थिक कठिनाई सिर्फ़ रियायत माँगती है। जब तक आपके अलावा कोई और मंज़ूर न करे, फ़ीस में से कुछ नहीं घटता।' },
      { en: 'Under “Refund list” is money that arrived and could not be put against a fee. The school gives it back itself; the principal or school admin then uses “Record that it was given back”.', hi: '“Refund list” में वह पैसा है जो आया पर किसी फ़ीस में नहीं लग सका। स्कूल उसे ख़ुद लौटाता है; फिर प्रिंसिपल या स्कूल एडमिन “Record that it was given back” से दर्ज करते हैं।' },
    ],
    start: { href: '/app/fees', label: { en: 'Fees', hi: 'Fees' } },
    related: ['fees-overdue-late-fee', 'take-fee-payment'],
    keywords: ['follow up', 'overdue', 'promise', 'hardship', 'refund', 'recovery', 'fees', 'बकाया', 'वादा', 'वापसी'],
  },
  {
    slug: 'see-a-guardian',
    category: 'students',
    audience: 'office_and_teachers',
    title: { en: 'See everything about one guardian', hi: 'एक अभिभावक के बारे में सब कुछ देखें' },
    summary: {
      en: 'The Parents screen shows a guardian’s children, what they have agreed to, whether messages reach their number, and their data requests.',
      hi: 'Parents स्क्रीन पर अभिभावक के बच्चे, उनकी सहमति, संदेश उनके नंबर तक पहुँचते हैं या नहीं, और उनके डेटा अनुरोध दिखते हैं।',
    },
    steps: [
      { en: 'Open “Parents” and type the guardian’s name or their child’s name.', hi: '“Parents” खोलें और अभिभावक का नाम या उनके बच्चे का नाम लिखें।' },
      { en: 'Tap the guardian. “Their number” says whether messages can go to it.', hi: 'अभिभावक पर दबाएँ। “Their number” बताता है कि उस पर संदेश जा सकते हैं या नहीं।' },
      { en: 'Under “Children and consent”, each kind of message shows “Agreed” or “Not agreed” for each child.', hi: '“Children and consent” में हर बच्चे के लिए हर तरह के संदेश पर “Agreed” या “Not agreed” दिखता है।' },
      { en: 'The principal or school admin presses “Record agreement” or “Record withdrawal” when the parent tells the school.', hi: 'जब अभिभावक स्कूल को बताएँ, तो प्रिंसिपल या स्कूल एडमिन “Record agreement” या “Record withdrawal” दबाते हैं।' },
    ],
    tips: [
      { en: 'A change in consent applies from the very next message.', hi: 'सहमति में बदलाव अगले ही संदेश से लागू होता है।' },
      { en: 'A teacher sees only the guardians of children in their own classes, and the last four digits of the number.', hi: 'शिक्षक को सिर्फ़ अपनी कक्षाओं के बच्चों के अभिभावक दिखते हैं, और नंबर के आख़िरी चार अंक।' },
      { en: 'Under “Language of messages” the office can choose English or Hindi for one guardian.', hi: '“Language of messages” में कार्यालय एक अभिभावक के लिए अंग्रेज़ी या हिन्दी चुन सकता है।' },
    ],
    start: { href: '/app/parents', label: { en: 'Parents', hi: 'Parents' } },
    related: ['message-states', 'answer-a-parent'],
    keywords: ['parent', 'guardian', 'consent', 'language', 'stop', 'number', 'अभिभावक', 'सहमति'],
  },
  {
    slug: 'message-states',
    category: 'daily',
    audience: 'office',
    title: { en: 'See where each message to a parent got to', hi: 'देखें कि अभिभावक को गया हर संदेश कहाँ तक पहुँचा' },
    summary: {
      en: 'Every WhatsApp message your school sends is listed with its state: sent, delivered, read, failed, or held back with the reason.',
      hi: 'आपके स्कूल का भेजा हर WhatsApp संदेश अपनी स्थिति के साथ सूची में है: भेजा गया, पहुँचा, पढ़ा गया, विफल, या कारण के साथ रोका गया।',
    },
    steps: [
      { en: 'Open “Communication”. “Messages to parents” lists the last days, newest first.', hi: '“Communication” खोलें। “Messages to parents” में पिछले दिनों के संदेश हैं, सबसे नया पहले।' },
      { en: 'Tap “Failed” to see the messages that could not be delivered, then check that guardian’s number on the student’s page.', hi: 'जो संदेश नहीं पहुँच सके उन्हें देखने के लिए “Failed” दबाएँ, फिर विद्यार्थी के पेज पर उस अभिभावक का नंबर जाँचें।' },
      { en: 'Tap “Held back” to see what was not sent and why.', hi: 'क्या नहीं भेजा गया और क्यों, यह देखने के लिए “Held back” दबाएँ।' },
    ],
    tips: [
      { en: 'A message held back because the parent has not agreed is not sent later by itself. Record the parent’s consent on the student’s page first.', hi: 'अभिभावक की सहमति न होने से रोका गया संदेश बाद में अपने आप नहीं जाता। पहले विद्यार्थी के पेज पर अभिभावक की सहमति दर्ज करें।' },
      { en: 'While WhatsApp is not connected, the page says so: messages are recorded, and none reaches a phone.', hi: 'जब तक WhatsApp जुड़ा नहीं है, पेज यह बताता है: संदेश दर्ज होते हैं, पर कोई भी फ़ोन तक नहीं पहुँचता।' },
    ],
    start: { href: '/app/communication', label: { en: 'Communication', hi: 'Communication' } },
    related: ['whatsapp-settings', 'mark-attendance'],
    keywords: ['message', 'whatsapp', 'delivered', 'read', 'failed', 'held', 'communication', 'संदेश', 'पहुँचा'],
  },
  {
    slug: 'send-a-notice',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Send a notice to a class’s parents', hi: 'किसी कक्षा के अभिभावकों को नोटिस भेजें' },
    summary: {
      en: 'Staff write a notice for a class. The principal approves it, and only then does it go to that class’s guardians on WhatsApp.',
      hi: 'स्टाफ़ किसी कक्षा के लिए नोटिस लिखता है। प्रिंसिपल उसे मंज़ूर करते हैं, और तभी वह उस कक्षा के अभिभावकों को WhatsApp पर जाता है।',
    },
    steps: [
      { en: 'Open “Communication” and find “Notices to parents”.', hi: '“Communication” खोलें और “Notices to parents” देखें।' },
      { en: 'Choose the class, write the notice as parents will read it, and press “Send for approval”.', hi: 'कक्षा चुनें, नोटिस वैसा लिखें जैसा अभिभावक पढ़ेंगे, और “Send for approval” दबाएँ।' },
      { en: 'The principal reads it and presses “Approve and send”, or “Do not approve” with a reason the writer sees.', hi: 'प्रिंसिपल उसे पढ़कर “Approve and send” दबाते हैं, या “Do not approve” के साथ कारण लिखते हैं जो लिखने वाले को दिखता है।' },
      { en: 'After it is sent, the notice shows how many guardians it was delivered to and how many read it.', hi: 'भेजे जाने के बाद नोटिस दिखाता है कि वह कितने अभिभावकों तक पहुँचा और कितनों ने पढ़ा।' },
    ],
    tips: [
      { en: 'A teacher writes only for a class of their own. A notice for “All classes” is written by the principal or the school admin.', hi: 'शिक्षक सिर्फ़ अपनी कक्षा के लिए लिखते हैं। “All classes” का नोटिस प्रिंसिपल या स्कूल एडमिन लिखते हैं।' },
      { en: 'A notice cannot be edited after it is written. If the words are wrong, the principal does not approve it and it is written again.', hi: 'लिखने के बाद नोटिस बदला नहीं जा सकता। शब्द ग़लत हों, तो प्रिंसिपल उसे मंज़ूर नहीं करते और वह फिर लिखा जाता है।' },
      { en: 'A parent who has not agreed to messages, or who wrote STOP, is not sent the notice.', hi: 'जिस अभिभावक ने संदेशों की सहमति नहीं दी, या STOP लिखा, उसे नोटिस नहीं भेजा जाता।' },
    ],
    start: { href: '/app/communication', label: { en: 'Communication', hi: 'Communication' } },
    related: ['message-states', 'answer-a-parent'],
    keywords: ['notice', 'circular', 'class', 'parents', 'approve', 'whatsapp', 'नोटिस', 'सूचना'],
  },
  {
    slug: 'plan-a-ptm',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Plan a parent-teacher meeting', hi: 'अभिभावक-शिक्षक बैठक तय करें' },
    summary: {
      en: 'The office plans a meeting day and invites parents on WhatsApp. A parent books a time by replying, and the teacher marks who came.',
      hi: 'कार्यालय बैठक का दिन तय करता है और अभिभावकों को WhatsApp पर बुलाता है। अभिभावक जवाब देकर समय लेते हैं, और शिक्षक दर्ज करते हैं कि कौन आया।',
    },
    steps: [
      { en: 'Open “PTM Scheduler”. Under “Plan a meeting day”, give the name, the date, the times and the classes, then press “Make the meeting”.', hi: '“PTM Scheduler” खोलें। “Plan a meeting day” में नाम, तारीख़, समय और कक्षाएँ भरें, फिर “Make the meeting” दबाएँ।' },
      { en: 'Check the teachers and times, then press “Invite the parents”. Each parent gets one message from each of their children’s class teachers.', hi: 'शिक्षक और समय जाँचें, फिर “Invite the parents” दबाएँ। हर अभिभावक को अपने बच्चों के हर कक्षा-शिक्षक की ओर से एक संदेश मिलता है।' },
      { en: 'A parent replies with a time, such as 10:30, and that time shows their name. For a parent who phones, choose them and press “Book this time”.', hi: 'अभिभावक एक समय लिखकर भेजते हैं, जैसे 10:30, और उस समय पर उनका नाम दिखता है। फ़ोन करने वाले अभिभावक को चुनकर “Book this time” दबाएँ।' },
      { en: 'On the day, the teacher presses “Came” or “Did not come” for each parent and can add a note.', hi: 'बैठक के दिन शिक्षक हर अभिभावक के लिए “Came” या “Did not come” दबाते हैं और टिप्पणी जोड़ सकते हैं।' },
    ],
    tips: [
      { en: 'A time can be booked by one parent only. A parent who asks for a taken time is told which times are free.', hi: 'एक समय सिर्फ़ एक अभिभावक ले सकता है। लिया हुआ समय माँगने वाले अभिभावक को बताया जाता है कि कौन-से समय ख़ाली हैं।' },
      { en: 'Each parent who has booked is reminded the day before.', hi: 'समय ले चुके हर अभिभावक को एक दिन पहले याद दिलाया जाता है।' },
      { en: '“Cancel the meeting” tells every parent who had booked.', hi: '“Cancel the meeting” समय ले चुके हर अभिभावक को बता देता है।' },
    ],
    start: { href: '/app/ptm', label: { en: 'PTM Scheduler', hi: 'PTM Scheduler' } },
    related: ['send-a-notice', 'answer-a-parent'],
    keywords: ['ptm', 'meeting', 'parent teacher', 'slot', 'book', 'reminder', 'बैठक', 'समय'],
  },
  {
    slug: 'invite-to-an-event',
    category: 'daily',
    audience: 'office',
    title: { en: 'Invite parents to a school event', hi: 'अभिभावकों को स्कूल के कार्यक्रम में बुलाएँ' },
    summary: {
      en: 'Add an event for some classes or for every class, invite the parents on WhatsApp, and see how many are coming.',
      hi: 'कुछ कक्षाओं या सभी कक्षाओं के लिए कार्यक्रम जोड़ें, अभिभावकों को WhatsApp पर बुलाएँ, और देखें कितने आ रहे हैं।',
    },
    steps: [
      { en: 'Open “Events”. Under “Add an event”, give the name, the date, where it is and who is invited, then press “Save the event”.', hi: '“Events” खोलें। “Add an event” में नाम, तारीख़, जगह और किसे बुलाना है भरें, फिर “Save the event” दबाएँ।' },
      { en: 'Check the event in the list, then press “Invite the parents”. Only the classes you chose are told.', hi: 'सूची में कार्यक्रम जाँचें, फिर “Invite the parents” दबाएँ। सिर्फ़ चुनी हुई कक्षाओं को बताया जाता है।' },
      { en: 'Parents reply YES or NO. The event shows how many were invited, how many are coming and how many are not.', hi: 'अभिभावक YES या NO लिखते हैं। कार्यक्रम पर दिखता है कि कितने बुलाए गए, कितने आ रहे हैं और कितने नहीं।' },
    ],
    tips: [
      { en: 'Everyone invited who has not said NO is reminded the day before.', hi: 'जिन बुलाए गए अभिभावकों ने NO नहीं कहा, उन्हें एक दिन पहले याद दिलाया जाता है।' },
      { en: '“Cancel the event” tells every parent who was invited.', hi: '“Cancel the event” हर बुलाए गए अभिभावक को बता देता है।' },
      { en: 'A parent who has not agreed to school messages, or who wrote STOP, is not sent the invitation.', hi: 'जिस अभिभावक ने स्कूल के संदेशों की सहमति नहीं दी, या STOP लिखा, उसे बुलावा नहीं भेजा जाता।' },
    ],
    start: { href: '/app/events', label: { en: 'Events', hi: 'Events' } },
    related: ['send-a-notice', 'plan-a-ptm'],
    keywords: ['event', 'function', 'sports day', 'invite', 'rsvp', 'cancel', 'कार्यक्रम', 'बुलावा'],
  },
  {
    slug: 'handle-a-complaint',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Record and settle a parent’s complaint', hi: 'अभिभावक की शिकायत दर्ज करें और सुलझाएँ' },
    summary: {
      en: 'A complaint is recorded with who will look into it and by when. The parent is told when it is noted and when it is closed.',
      hi: 'शिकायत इस बात के साथ दर्ज होती है कि उसे कौन देखेगा और कब तक। दर्ज होने और बंद होने पर अभिभावक को बताया जाता है।',
    },
    steps: [
      { en: 'Open “Complaints”. Under “Record a complaint”, find the guardian and write what they said.', hi: '“Complaints” खोलें। “Record a complaint” में अभिभावक को खोजें और लिखें कि उन्होंने क्या कहा।' },
      { en: 'The principal or school admin chooses who will look into it and by when, then presses “Record the complaint”.', hi: 'प्रिंसिपल या स्कूल एडमिन चुनते हैं कि इसे कौन देखेगा और कब तक, फिर “Record the complaint” दबाते हैं।' },
      { en: 'While you look into it, write what you find and press “Add as a note”. Notes stay inside the school.', hi: 'इसे देखते समय जो पता चले वह लिखकर “Add as a note” दबाएँ। टिप्पणियाँ स्कूल के भीतर रहती हैं।' },
      { en: 'When it is settled, write what was done and press “Close, and tell the parent this”.', hi: 'सुलझ जाने पर लिखें कि क्या किया गया और “Close, and tell the parent this” दबाएँ।' },
    ],
    tips: [
      { en: 'A complaint cannot be closed without your words: the parent reads them.', hi: 'आपके शब्दों के बिना शिकायत बंद नहीं हो सकती: अभिभावक उन्हें पढ़ते हैं।' },
      { en: 'A complaint not settled by its due time is passed to the principal and shows on the principal’s My Day.', hi: 'जो शिकायत अपने समय तक नहीं सुलझती वह प्रिंसिपल को सौंप दी जाती है और उनके My Day पर दिखती है।' },
      { en: 'A complaint about a member of staff is not shown to that person until the principal has seen it.', hi: 'स्टाफ़ के किसी सदस्य के बारे में शिकायत उस व्यक्ति को तब तक नहीं दिखती जब तक प्रिंसिपल उसे देख न लें।' },
    ],
    start: { href: '/app/complaints', label: { en: 'Complaints', hi: 'Complaints' } },
    related: ['answer-a-parent', 'see-a-guardian'],
    keywords: ['complaint', 'concern', 'grievance', 'escalate', 'principal', 'close', 'शिकायत', 'समस्या'],
  },
  {
    slug: 'what-to-do-at-home',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Tell a parent what they can do at home', hi: 'अभिभावक को बताएँ कि वे घर पर क्या कर सकते हैं' },
    summary: {
      en: 'A draft answer is put together from what the child’s class was taught this week and the child’s own homework. You read it and approve it before it goes.',
      hi: 'जवाब का मसौदा इस हफ़्ते बच्चे की कक्षा में जो पढ़ाया गया और बच्चे के अपने होमवर्क से बनता है। जाने से पहले आप उसे पढ़कर मंज़ूर करते हैं।',
    },
    steps: [
      { en: 'Open “Parent AI · What to Do?”. Under “Draft an answer for a parent”, find the guardian and choose the child.', hi: '“Parent AI · What to Do?” खोलें। “Draft an answer for a parent” में अभिभावक को खोजें और बच्चा चुनें।' },
      { en: 'Press “Draft the answer”. The draft appears under “Answers” with “What this answer used”.', hi: '“Draft the answer” दबाएँ। मसौदा “Answers” में “What this answer used” के साथ दिखता है।' },
      { en: 'Read it and change the words if you need to. Then press “Approve and send”, or “Discard”.', hi: 'इसे पढ़ें और ज़रूरत हो तो शब्द बदलें। फिर “Approve and send” या “Discard” दबाएँ।' },
    ],
    tips: [
      { en: 'Nothing goes to a parent until a person has approved it.', hi: 'किसी व्यक्ति की मंज़ूरी के बिना अभिभावक को कुछ नहीं जाता।' },
      { en: 'The draft uses only this child’s class topics and this child’s own homework. No other child’s work is in it.', hi: 'मसौदा सिर्फ़ इस बच्चे की कक्षा के विषय और इस बच्चे का अपना होमवर्क इस्तेमाल करता है। किसी और बच्चे का काम इसमें नहीं होता।' },
      { en: 'If nothing has been recorded as taught this week, there is nothing to base an answer on. Record what was taught in Daily Pulse first.', hi: 'अगर इस हफ़्ते कुछ पढ़ाया गया दर्ज नहीं है, तो जवाब का कोई आधार नहीं है। पहले Daily Pulse में दर्ज करें कि क्या पढ़ाया गया।' },
    ],
    start: { href: '/app/parent-ai', label: { en: 'Parent AI · What to Do?', hi: 'Parent AI · What to Do?' } },
    related: ['answer-a-parent', 'daily-pulse-message'],
    keywords: ['home', 'help', 'parent ai', 'what to do', 'homework', 'tip', 'घर', 'मदद'],
  },
  {
    slug: 'answer-a-parent',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Answer a parent who wrote back', hi: 'जवाब लिखने वाले अभिभावक को उत्तर दें' },
    summary: {
      en: 'When a parent replies to a message from the school, it appears as a conversation. You can answer in your own words for 24 hours after they write.',
      hi: 'जब कोई अभिभावक स्कूल के संदेश का जवाब देता है, तो वह एक बातचीत के रूप में दिखता है। उनके लिखने के बाद 24 घंटे तक आप अपने शब्दों में जवाब दे सकते हैं।',
    },
    steps: [
      { en: 'Open “Communication”. “What parents wrote back” lists each conversation, new ones first.', hi: '“Communication” खोलें। “What parents wrote back” में हर बातचीत है, नई सबसे पहले।' },
      { en: 'Tap a conversation to read everything the parent wrote and everything the school sent to that number.', hi: 'अभिभावक ने जो लिखा और स्कूल ने उस नंबर पर जो भेजा, वह सब पढ़ने के लिए बातचीत पर दबाएँ।' },
      { en: 'Write in “Your reply” and press “Send reply”. It goes within a minute.', hi: '“Your reply” में लिखें और “Send reply” दबाएँ। यह एक मिनट के भीतर जाता है।' },
    ],
    tips: [
      { en: 'After 24 hours without a new message from the parent, a reply in your own words can no longer be sent. If they write again, you can answer.', hi: 'अभिभावक का नया संदेश आए बिना 24 घंटे बीत जाएँ, तो अपने शब्दों में जवाब नहीं भेजा जा सकता। वे फिर लिखें, तो आप जवाब दे सकते हैं।' },
      { en: 'A parent who writes STOP gets no more WhatsApp messages from the school. When they ask for messages again, the principal or school admin uses “Start messages again” and writes how they asked.', hi: 'जो अभिभावक STOP लिखता है, उसे स्कूल से और WhatsApp संदेश नहीं मिलते। जब वे फिर संदेश माँगें, तो प्रिंसिपल या स्कूल एडमिन “Start messages again” दबाकर लिखते हैं कि उन्होंने कैसे कहा।' },
      { en: 'A teacher sees only the conversations of parents of their own classes.', hi: 'शिक्षक को सिर्फ़ अपनी कक्षाओं के अभिभावकों की बातचीत दिखती है।' },
    ],
    start: { href: '/app/communication', label: { en: 'Communication', hi: 'Communication' } },
    related: ['message-states', 'mark-attendance'],
    keywords: ['reply', 'parent', 'whatsapp', 'conversation', 'stop', 'answer', 'जवाब', 'अभिभावक', 'बातचीत'],
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
      { en: 'Under “How each part is set up”, each part of the app has its own settings, each with a sentence on what it changes. Change a value and press “Save these settings”; “Reset to default” puts back the starting value.', hi: '“How each part is set up” के नीचे ऐप के हर हिस्से की अपनी सेटिंग हैं, हर एक के साथ एक वाक्य कि वह क्या बदलती है। मान बदलें और “Save these settings” दबाएँ; “Reset to default” शुरुआती मान वापस रख देता है।' },
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
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  {
    slug: 'staff-leave',
    category: 'daily',
    audience: 'everyone',
    title: { en: 'Ask for leave, and decide a leave request', hi: 'छुट्टी माँगें, और छुट्टी की माँग तय करें' },
    summary: {
      en: 'A member of staff asks for whole days of leave on their own account page. The principal or the school admin decides, and nobody decides their own.',
      hi: 'स्टाफ़ का सदस्य अपने खाते के पेज पर पूरे दिनों की छुट्टी माँगता है। प्रिंसिपल या स्कूल एडमिन तय करते हैं, और कोई अपनी माँग ख़ुद तय नहीं करता।',
    },
    steps: [
      { en: 'Open “My account”. Under “My leave”, choose the “First day” and the “Last day”, then the “Kind of leave”, and write the “Reason”.', hi: '“My account” खोलें। “My leave” में “First day” और “Last day” चुनें, फिर “Kind of leave”, और “Reason” लिखें।' },
      { en: 'Press “Ask for leave”. The request shows under “My requests” as “Waiting”.', hi: '“Ask for leave” दबाएँ। माँग “My requests” में “Waiting” के रूप में दिखती है।' },
      { en: 'The principal or the school admin opens “Staff”. Under “Leave requests waiting” they press “Approve”, or write a note and press “Refuse”.', hi: 'प्रिंसिपल या स्कूल एडमिन “Staff” खोलते हैं। “Leave requests waiting” में वे “Approve” दबाते हैं, या टिप्पणी लिखकर “Refuse” दबाते हैं।' },
      { en: 'Open “My account” again to read the answer. To take a request back, press “Withdraw”.', hi: 'जवाब पढ़ने के लिए “My account” फिर खोलें। माँग वापस लेने के लिए “Withdraw” दबाएँ।' },
      { en: 'When someone phones in, the principal or the school admin fills in “Record leave for a member of staff” on “Staff” and presses “Record leave”.', hi: 'जब कोई फ़ोन करके बताए, तो प्रिंसिपल या स्कूल एडमिन “Staff” पर “Record leave for a member of staff” भरते हैं और “Record leave” दबाते हैं।' },
    ],
    tips: [
      { en: 'Only you, the principal and the school admin can read a leave request and its reason.', hi: 'छुट्टी की माँग और उसका कारण सिर्फ़ आप, प्रिंसिपल और स्कूल एडमिन पढ़ सकते हैं।' },
      { en: 'Nobody decides their own request: the principal’s is decided by the school admin, and the school admin’s by the principal.', hi: 'कोई अपनी माँग ख़ुद तय नहीं करता: प्रिंसिपल की माँग स्कूल एडमिन तय करते हैं, और स्कूल एडमिन की प्रिंसिपल।' },
      { en: 'You can withdraw a request while it waits, or approved leave before its first day. After that, the principal or the school admin cancels it.', hi: 'माँग जब तक इंतज़ार में है, या मंज़ूर छुट्टी अपने पहले दिन से पहले, आप वापस ले सकते हैं। उसके बाद प्रिंसिपल या स्कूल एडमिन उसे रद्द करते हैं।' },
      { en: 'To change the days, withdraw the request and ask again. Leave is for whole days.', hi: 'दिन बदलने के लिए माँग वापस लें और फिर माँगें। छुट्टी पूरे दिनों की होती है।' },
    ],
    start: { href: '/app/account', label: { en: 'My account', hi: 'मेरा खाता (My account)' } },
    related: ['send-staff-reset-code', 'use-my-day'],
    keywords: ['leave', 'day off', 'sick leave', 'casual leave', 'approve leave', 'refuse leave', 'withdraw leave', 'chutti', 'chhutti', 'छुट्टी', 'अवकाश'],
  },
  // p5-8b end
  // p5-8c begin
  {
    slug: 'cover-a-class',
    category: 'daily',
    audience: 'office_and_teachers',
    title: { en: 'Give a class a teacher when its own teacher is on leave', hi: 'जब कक्षा के शिक्षक छुट्टी पर हों, तो कक्षा को दूसरा शिक्षक दें' },
    summary: {
      en: 'Proxy Auto lists the periods of every teacher on approved leave, with the free teachers for each. A person assigns with one tap; nothing is assigned by itself.',
      hi: 'Proxy Auto उन सभी शिक्षकों के पीरियड दिखाता है जिनकी छुट्टी मंज़ूर है, और हर पीरियड के लिए खाली शिक्षक। सौंपना एक व्यक्ति का एक टैप है; अपने आप कुछ नहीं सौंपा जाता।',
    },
    steps: [
      { en: 'Open “Proxy Auto”. It opens on “Today”. To plan ahead, press “Tomorrow” or choose “Another day”.', hi: '“Proxy Auto” खोलें। यह “Today” पर खुलता है। आगे की तैयारी के लिए “Tomorrow” दबाएँ या “Another day” चुनें।' },
      { en: 'Each period of a teacher on leave is marked “Needs cover”. Under “Free teachers”, every name says why it is offered.', hi: 'छुट्टी पर गए शिक्षक के हर पीरियड पर “Needs cover” लिखा होता है। “Free teachers” में हर नाम के साथ लिखा है कि वह क्यों सुझाया गया।' },
      { en: 'Press “Assign” beside the teacher you choose. The period is now marked “Covered”.', hi: 'जिस शिक्षक को चुनें उसके सामने “Assign” दबाएँ। अब पीरियड पर “Covered” लिखा दिखेगा।' },
      { en: 'To change it, press “Undo”, then assign another teacher.', hi: 'बदलने के लिए “Undo” दबाएँ, फिर किसी दूसरे शिक्षक को सौंपें।' },
      { en: 'The teacher opens “Proxy Auto” and reads “Your covers”. The same periods show on My Day. No message is sent.', hi: 'शिक्षक “Proxy Auto” खोलकर “Your covers” पढ़ते हैं। वही पीरियड My Day पर भी दिखते हैं। कोई संदेश नहीं भेजा जाता।' },
    ],
    tips: [
      { en: 'An empty list means no teacher’s leave is approved for that day. The principal or the school admin approves leave, or records it for someone who phoned in, on “Staff”.', hi: 'सूची खाली होने का मतलब है कि उस दिन के लिए किसी शिक्षक की छुट्टी मंज़ूर नहीं है। प्रिंसिपल या स्कूल एडमिन “Staff” पर छुट्टी मंज़ूर करते हैं, या फ़ोन करके बताने वाले की छुट्टी वहीं दर्ज करते हैं।' },
      { en: 'The order is: teaches the subject, then the fewest periods that day, then the fewest covers that week. You may choose any free teacher on the list.', hi: 'क्रम यह है: जो वह विषय पढ़ाते हैं, फिर जिनके उस दिन सबसे कम पीरियड हैं, फिर जिनकी उस हफ़्ते सबसे कम एवज़ी है। आप सूची के किसी भी खाली शिक्षक को चुन सकते हैं।' },
      { en: 'A period is covered once, and a teacher covers one class in a period. A second tap for the same period or the same teacher is refused.', hi: 'एक पीरियड की एवज़ी एक ही बार तय होती है, और एक शिक्षक एक पीरियड में एक ही कक्षा लेते हैं। उसी पीरियड या उसी शिक्षक के लिए दूसरा टैप नहीं माना जाता।' },
      { en: 'If leave is cancelled after a cover was assigned, the cover moves to “Covers no longer needed”. Undo it there.', hi: 'अगर एवज़ी सौंपने के बाद छुट्टी रद्द हो जाए, तो वह एवज़ी “Covers no longer needed” में चली जाती है। उसे वहीं वापस लें।' },
    ],
    start: { href: '/app/proxy', label: { en: 'Proxy Auto', hi: 'एवज़ी शिक्षक (Proxy Auto)' } },
    related: ['staff-leave', 'timetable'],
    keywords: ['proxy', 'cover', 'substitute', 'substitution', 'arrangement', 'free period', 'absent teacher', 'evazi', 'एवज़ी', 'प्रॉक्सी', 'अनुपस्थित शिक्षक'],
  },
  // p5-8c end
  // p5-8d begin
  {
    slug: 'read-the-dashboard',
    category: 'daily',
    audience: 'office',
    title: { en: 'Read the dashboard and open the rows behind a number', hi: 'डैशबोर्ड पढ़ें और किसी संख्या के पीछे की पंक्तियाँ खोलें' },
    summary: {
      en: 'The dashboard shows the school’s numbers for today, 7 days or 30 days, counted from the school’s own records. A number opens the rows behind it, and every number says how it is counted.',
      hi: 'डैशबोर्ड आज, 7 दिन या 30 दिन की स्कूल की संख्याएँ दिखाता है, जो स्कूल के अपने रिकॉर्ड से गिनी जाती हैं। संख्या अपने पीछे की पंक्तियाँ खोलती है, और हर संख्या बताती है कि वह कैसे गिनी जाती है।',
    },
    steps: [
      { en: 'Open “Dashboard” from the menu. The dark band at the top says how many things need you today; tap one to go straight to it.', hi: 'मेनू से “Dashboard” खोलें। ऊपर की गहरी पट्टी बताती है कि आज कितने काम आपका इंतज़ार कर रहे हैं; किसी पर टैप करें और सीधे वहाँ पहुँचें।' },
      { en: 'Read “Needs your attention”. Each line has one button that opens the place to deal with it.', hi: '“Needs your attention” पढ़ें। हर पंक्ति में एक बटन है जो उस काम की जगह खोलता है।' },
      { en: 'Choose the days: “Today”, “7 days” or “30 days”. Numbers about a span of days change; each number says which days it is about.', hi: 'दिन चुनें: “Today”, “7 days” या “30 days”। कई दिनों वाली संख्याएँ बदलती हैं; हर संख्या बताती है कि वह किन दिनों की है।' },
      { en: 'Tap a number to open the rows behind it: the classes not marked, the fee entries overdue, the messages held back. The list’s title says how many rows it has; a number that is not a link has no such list yet.', hi: 'किसी संख्या पर टैप करके उसके पीछे की पंक्तियाँ खोलें: बिना हाज़िरी की कक्षाएँ, तारीख़ निकली फ़ीस, रोके गए संदेश। सूची का शीर्षक बताता है कि उसमें कितनी पंक्तियाँ हैं; जो संख्या लिंक नहीं है, उसकी ऐसी सूची अभी नहीं है।' },
      { en: 'Open “Why this?” under a number to read how it is counted, what it is counted from, and when.', hi: 'किसी संख्या के नीचे “Why this?” खोलें और पढ़ें कि वह कैसे, किससे और कब गिनी गई।' },
      { en: 'On a chart, press “Table” to read the same numbers as a list. “Download as a spreadsheet (CSV)” saves what is on the screen.', hi: 'किसी चार्ट पर “Table” दबाएँ और वही संख्याएँ सूची के रूप में पढ़ें। “Download as a spreadsheet (CSV)” स्क्रीन पर जो है उसे सेव करता है।' },
    ],
    tips: [
      { en: 'A number you do not see is one your role cannot read, or its module is switched off. It is never shown as zero.', hi: 'जो संख्या आपको नहीं दिखती, उसे आपकी भूमिका पढ़ नहीं सकती या उसका मॉड्यूल बंद है। उसे कभी शून्य के रूप में नहीं दिखाया जाता।' },
      { en: '“Not set up yet” means the thing it counts has not been started: for example, no fee raised or no monthly budget.', hi: '“Not set up yet” का मतलब है कि जो चीज़ गिनी जाती है वह अभी शुरू नहीं हुई: जैसे कोई फ़ीस नहीं लगाई गई या मासिक बजट तय नहीं है।' },
      { en: 'The dashboard is for the principal and the school admin. Everyone else starts from My Day.', hi: 'डैशबोर्ड प्रिंसिपल और स्कूल एडमिन के लिए है। बाक़ी सब मेरा दिन से शुरू करते हैं।' },
    ],
    start: { href: '/app/dashboard', label: { en: 'Dashboard', hi: 'Dashboard' } },
    related: ['use-my-day', 'message-states'],
    keywords: ['dashboard', 'numbers', 'tiles', 'attention', 'export', 'csv', 'spreadsheet', 'why this', 'range', 'डैशबोर्ड', 'संख्या', 'रिपोर्ट'],
  },
  // p5-8d end
  // p5-8e begin
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  {
    slug: 'run-a-report',
    category: 'daily',
    audience: 'office',
    title: { en: 'Run a report and download it as a CSV file', hi: 'रिपोर्ट निकालें और उसे CSV फ़ाइल के रूप में डाउनलोड करें' },
    summary: {
      en: 'A report is one table about your school for the days you choose, with a total row. The CSV file has exactly the rows on the screen.',
      hi: 'रिपोर्ट आपके चुने दिनों के लिए स्कूल की एक तालिका है, कुल की पंक्ति के साथ। CSV फ़ाइल में ठीक वही पंक्तियाँ होती हैं जो स्क्रीन पर हैं।',
    },
    steps: [
      { en: 'Open “Reports” from the menu. Under “Your reports” you see the reports your role may read.', hi: 'मेनू से “Reports” खोलें। “Your reports” के नीचे वे रिपोर्ट दिखती हैं जो आपकी भूमिका पढ़ सकती है।' },
      { en: 'Choose a report, for example “Daily collection” or “Attendance by class”. It opens below the list.', hi: 'कोई रिपोर्ट चुनें, जैसे “Daily collection” या “Attendance by class”। वह सूची के नीचे खुलती है।' },
      { en: 'Choose the days: “Today”, “7 days” or “30 days”. For any other days, type them under “Two dates” and press “Show these days”.', hi: 'दिन चुनें: “Today”, “7 days” या “30 days”। किसी और दिनों के लिए उन्हें “Two dates” के नीचे लिखें और “Show these days” दबाएँ।' },
      { en: 'Read the table. The last row, “Total”, adds up the rows above it.', hi: 'तालिका पढ़ें। आख़िरी पंक्ति “Total” ऊपर की पंक्तियों का जोड़ है।' },
      { en: 'Open “Why this?” under the table to read what a row is and how it is counted.', hi: 'तालिका के नीचे “Why this?” खोलें और पढ़ें कि एक पंक्ति क्या है और वह कैसे गिनी जाती है।' },
      { en: 'Press “Download CSV” to save the same rows and total as a file that opens in any spreadsheet.', hi: '“Download CSV” दबाएँ और वही पंक्तियाँ और कुल एक फ़ाइल में सेव करें जो किसी भी स्प्रेडशीट में खुलती है।' },
    ],
    tips: [
      { en: 'The accountant sees the fee reports, the academic coordinator the attendance and homework reports, and the principal and school admin all of them.', hi: 'अकाउंटेंट को फ़ीस की रिपोर्ट दिखती हैं, एकेडमिक कोऑर्डिनेटर को हाज़िरी और होमवर्क की, और प्रिंसिपल व स्कूल एडमिन को सभी।' },
      { en: 'Each download is written to the audit trail: who, which report and which days. The rows themselves are not copied there.', hi: 'हर डाउनलोड ऑडिट रिकॉर्ड में लिखा जाता है: किसने, कौन-सी रिपोर्ट और कौन-से दिन। पंक्तियाँ वहाँ कॉपी नहीं होतीं।' },
      { en: 'A report covers at most 366 days at a time. Rows come in the order of a date or a name, never from most to least.', hi: 'एक रिपोर्ट एक बार में ज़्यादा से ज़्यादा 366 दिन की होती है। पंक्तियाँ तारीख़ या नाम के क्रम में आती हैं, ज़्यादा से कम के क्रम में कभी नहीं।' },
    ],
    start: { href: '/app/reports', label: { en: 'Reports', hi: 'Reports' } },
    related: ['read-the-dashboard', 'follow-up-unpaid-fees', 'mark-attendance'],
    keywords: ['report', 'reports', 'csv', 'export', 'download', 'collection', 'defaulters', 'dues', 'absentees', 'attendance report', 'total', 'रिपोर्ट', 'वसूली', 'बकाया', 'अनुपस्थित'],
  },
  // p5-8h end
  // p5-8i begin
  // p5-8i end
  // p5-8j begin
  // p5-8j end
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
