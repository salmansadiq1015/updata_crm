/**
 * Interface wording of the customer page (labels, notices, states) in English,
 * Urdu and Roman Urdu. The conversation itself is in engine/assistantCopy.js.
 * Rendered into the HTML for the first paint and shipped in the bootstrap JSON
 * so a language switch updates the page without another request.
 * `{company}` / `{persona}` / `{minutes}` are filled on the page.
 */

export const PAGE_COPY = {
  en: {
    placeholder: 'Type your answer…', send: 'Send', offline: 'No connection. Your message will be sent when you are back online.', retry: 'Reconnecting…', done: 'This conversation is complete. Thank you!', verifyTitle: 'Welcome back', verifyText: 'To protect your answers, please enter the last 4 digits of the phone number this link was sent to.', verifyBtn: 'Continue', verifyFail: 'That did not match. Please try again.', locked: 'Too many attempts. Please try again in an hour.', paused: 'The assistant is paused right now. Please try again later.', closed: 'This conversation has ended.', listen: 'Listening…', speak: 'Read replies aloud', bigger: 'Larger text', of: 'of', error: 'Something went wrong. Please try again.',
    aiBadge: 'AI assistant', language: 'Language', options: 'Options', close: 'Close', minutes: 'About {minutes} min', answered: 'answered',
    notice: 'This is an automated assistant from {company}. Your answers are only used by {company} to follow up with you.',
    privacy: 'Privacy', terms: 'Terms', optOut: 'I don\'t want to be contacted', you: 'You', typing: '{persona} is typing',
    mic: 'Hold to talk', micDenied: 'The microphone is blocked. You can type your answer instead.', failed: 'Not sent.', tryAgain: 'Try again',
    doneTitle: 'Your answers were sent', doneText: 'You can close this page now.', preview: 'PREVIEW',
    verifyLabel: 'Last 4 digits',
  },
  roman_ur: {
    placeholder: 'Apna jawab likhein…', send: 'Bhejein', offline: 'Internet nahi hai. Connection wapas aate hi aap ka message bhej diya jayega.', retry: 'Dobara jor rahe hain…', done: 'Yeh guftagu mukammal ho gayi. Shukriya!', verifyTitle: 'Khush aamdeed', verifyText: 'Aap ke jawab mehfooz rakhne ke liye, jis number par yeh link bheja gaya us ke aakhri 4 hindse likhein.', verifyBtn: 'Jaari rakhein', verifyFail: 'Yeh match nahi hua. Dobara koshish karein.', locked: 'Bohat zyada koshishein. Ek ghante baad koshish karein.', paused: 'Assistant abhi band hai. Thori dair baad koshish karein.', closed: 'Yeh guftagu khatam ho chuki hai.', listen: 'Sun rahi hoon…', speak: 'Jawab parh kar sunayein', bigger: 'Bara text', of: '/', error: 'Masla aa gaya. Dobara koshish karein.',
    aiBadge: 'AI assistant', language: 'Zabaan', options: 'Options', close: 'Band karein', minutes: 'Taqreeban {minutes} minute', answered: 'jawab diye',
    notice: 'Yeh {company} ki automated assistant hai. Aap ke jawab sirf {company} aap se rabta karne ke liye istemal karegi.',
    privacy: 'Privacy', terms: 'Sharaait', optOut: 'Mujhe contact na karein', you: 'Aap', typing: '{persona} likh rahi hain',
    mic: 'Bolne ke liye dabaye rakhein', micDenied: 'Microphone band hai. Aap apna jawab likh sakte hain.', failed: 'Nahi gaya.', tryAgain: 'Dobara bhejein',
    doneTitle: 'Aap ke jawab bhej diye gaye', doneText: 'Ab aap yeh page band kar sakte hain.', preview: 'PREVIEW',
    verifyLabel: 'Aakhri 4 hindse',
  },
  ur: {
    placeholder: 'اپنا جواب لکھیں…', send: 'بھیجیں', offline: 'انٹرنیٹ نہیں ہے۔ کنکشن واپس آتے ہی آپ کا پیغام بھیج دیا جائے گا۔', retry: 'دوبارہ جوڑ رہے ہیں…', done: 'یہ گفتگو مکمل ہو گئی۔ شکریہ!', verifyTitle: 'خوش آمدید', verifyText: 'آپ کے جوابات محفوظ رکھنے کے لیے، جس نمبر پر یہ لنک بھیجا گیا اس کے آخری 4 ہندسے لکھیں۔', verifyBtn: 'جاری رکھیں', verifyFail: 'یہ میچ نہیں ہوا۔ دوبارہ کوشش کریں۔', locked: 'بہت زیادہ کوششیں۔ ایک گھنٹے بعد کوشش کریں۔', paused: 'اسسٹنٹ ابھی بند ہے۔ تھوڑی دیر بعد کوشش کریں۔', closed: 'یہ گفتگو ختم ہو چکی ہے۔', listen: 'سن رہی ہوں…', speak: 'جوابات سنائیں', bigger: 'بڑا متن', of: '/', error: 'مسئلہ آ گیا۔ دوبارہ کوشش کریں۔',
    aiBadge: 'AI اسسٹنٹ', language: 'زبان', options: 'ترتیبات', close: 'بند کریں', minutes: 'تقریباً {minutes} منٹ', answered: 'جوابات',
    notice: 'یہ {company} کی خودکار اسسٹنٹ ہے۔ آپ کے جوابات صرف {company} آپ سے رابطے کے لیے استعمال کرے گی۔',
    privacy: 'رازداری', terms: 'شرائط', optOut: 'مجھ سے رابطہ نہ کریں', you: 'آپ', typing: '{persona} لکھ رہی ہیں',
    mic: 'بولنے کے لیے دبائے رکھیں', micDenied: 'مائیکروفون بند ہے۔ آپ اپنا جواب لکھ سکتے ہیں۔', failed: 'نہیں گیا۔', tryAgain: 'دوبارہ بھیجیں',
    doneTitle: 'آپ کے جوابات بھیج دیے گئے', doneText: 'اب آپ یہ صفحہ بند کر سکتے ہیں۔', preview: 'پیش نظارہ',
    verifyLabel: 'آخری 4 ہندسے',
  },
};

export const pageCopy = (language) => PAGE_COPY[language] || PAGE_COPY.en;

/** Copy for the languages a campaign offers (keeps the bootstrap small). */
export const pageCopyFor = (languages = ['en']) => Object.fromEntries(
  [...new Set(['en', ...languages])].filter((l) => PAGE_COPY[l]).map((l) => [l, PAGE_COPY[l]]),
);
