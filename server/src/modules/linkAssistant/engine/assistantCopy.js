/**
 * Deterministic assistant wording in English, Urdu and Roman Urdu. Used for the
 * pre-generated greeting (instant first message), safety-critical replies
 * (opt-out, human hand-off, "are you human?") and as the full fallback when the
 * language model is unavailable, over budget or failing — the conversation keeps
 * working, it just sounds plainer.
 */

const T = {
  en: {
    greeting: ({ name, persona, company, reason, minutes }) =>
      `Hi${name ? ` ${name}` : ''}! I'm ${persona}, an AI assistant from ${company}. ${reason ? `${reason} ` : ''}`
      + `I have a few quick questions — it takes about ${minutes} minutes. Shall we start?`,
    start: 'Yes, let\'s start',
    notNow: 'Not now',
    noContact: 'Don\'t contact me',
    acks: ['Thanks!', 'Got it.', 'Perfect, noted.', 'Great, thank you.', 'Thank you, that helps.'],
    clarify: (q) => `Sorry, I didn't quite get that. ${q}`,
    confirm: (label, value) => `Just to confirm: ${label} — ${value}. Is that right?`,
    yes: 'Yes, correct',
    no: 'No, change it',
    summary: 'Here is what you told me:',
    submitAsk: 'Shall I send these answers to the team?',
    submit: 'Yes, send',
    edit: 'Change an answer',
    editWhich: 'Which answer would you like to change?',
    thanks: ({ company }) => `Thank you! Your answers have been sent to the ${company} team. They will contact you if anything else is needed. You can close this page now.`,
    optedOut: ({ company }) => `Understood. ${company} will not contact you again about this, and your number has been removed from this campaign. Take care!`,
    human: ({ company }) => `Of course. I've asked a member of the ${company} team to contact you personally — usually within one working day. Is there anything you'd like me to note for them?`,
    areYouHuman: ({ persona, company }) => `I'm ${persona}, an AI assistant from ${company} — not a person. Everything you share is reviewed by a real member of our team. Shall we continue?`,
    busy: 'No problem! When would be a good time for our team to call you? (for example "tomorrow 5pm")',
    callbackNoted: (when) => `Thanks — I've noted "${when}". Our team will call you then. Have a good day!`,
    faqUnknown: 'Good question — I don\'t have that information, so I\'ve passed it to our team and they will get back to you. ',
    trouble: 'Sorry, I\'m having trouble right now. Your answers so far are saved — please try again in a moment.',
    notNowReply: 'No problem. You can open this link again any time and continue where you left off.',
    letsContinue: 'Let\'s continue.',
    noNote: 'No, that\'s all',
    shallWeStart: 'Shall we start?',
    continueWith: (q) => `Let's continue: ${q}`,
    yesNoHint: ' (yes / no)',
    progress: (n, total) => `${n} of ${total}`,
    unknownValue: 'not known',
  },
  roman_ur: {
    greeting: ({ name, persona, company, reason, minutes }) =>
      `Assalam o Alaikum${name ? ` ${name}` : ''}! Main ${persona} hoon, ${company} ki AI assistant. ${reason ? `${reason} ` : ''}`
      + `Mere paas kuch chhote sawal hain — sirf ${minutes} minute lagenge. Shuru karein?`,
    start: 'Ji, shuru karein',
    notNow: 'Abhi nahi',
    noContact: 'Mujhe contact na karein',
    acks: ['Shukriya!', 'Theek hai, note kar liya.', 'Bohat acha, shukriya.', 'Ji, samajh gayi.', 'Shukriya, is se madad milegi.'],
    clarify: (q) => `Maazrat, main theek se samajh nahi saki. ${q}`,
    confirm: (label, value) => `Tasdeeq ke liye: ${label} — ${value}. Kya yeh sahi hai?`,
    yes: 'Ji, sahi hai',
    no: 'Nahi, badalna hai',
    summary: 'Aap ne yeh jawab diye:',
    submitAsk: 'Kya main yeh jawab team ko bhej doon?',
    submit: 'Ji, bhej dein',
    edit: 'Jawab badlein',
    editWhich: 'Aap kaunsa jawab badalna chahte hain?',
    thanks: ({ company }) => `Shukriya! Aap ke jawab ${company} ki team ko bhej diye gaye hain. Zaroorat hui to woh aap se rabta karenge. Ab aap yeh page band kar sakte hain.`,
    optedOut: ({ company }) => `Theek hai. ${company} is silsile mein aap se dobara rabta nahi karegi, aur aap ka number is campaign se hata diya gaya hai. Khush rahein!`,
    human: ({ company }) => `Zaroor. Main ne ${company} ki team ke ek member ko kaha hai ke woh khud aap se rabta karein — aam tor par ek working day ke andar. Kya un ke liye kuch note karna hai?`,
    areYouHuman: ({ persona, company }) => `Main ${persona} hoon, ${company} ki AI assistant — insaan nahi. Aap jo bhi batayenge, hamari team ka ek asli member usay dekhta hai. Kya hum jaari rakhein?`,
    busy: 'Koi baat nahi! Hamari team aap ko kab call kare? (misaal ke tor par "kal shaam 5 baje")',
    callbackNoted: (when) => `Shukriya — main ne "${when}" note kar liya hai. Hamari team us waqt call karegi. Allah Hafiz!`,
    faqUnknown: 'Acha sawal hai — yeh maloomat mere paas nahi, is liye main ne aap ka sawal team ko bhej diya hai, woh aap ko jawab denge. ',
    trouble: 'Maazrat, abhi masla aa raha hai. Aap ke ab tak ke jawab mehfooz hain — thori dair baad dobara koshish karein.',
    notNowReply: 'Koi baat nahi. Aap yeh link kabhi bhi dobara khol kar wahin se jaari rakh sakte hain.',
    letsContinue: 'Chaliye aage barhte hain.',
    noNote: 'Nahi, bas',
    shallWeStart: 'Shuru karein?',
    continueWith: (q) => `Chaliye aage barhte hain: ${q}`,
    yesNoHint: ' (ji / nahi)',
    progress: (n, total) => `${n} / ${total}`,
    unknownValue: 'maloom nahi',
  },
  ur: {
    greeting: ({ name, persona, company, reason, minutes }) =>
      `السلام علیکم${name ? ` ${name}` : ''}! میں ${persona} ہوں، ${company} کی AI اسسٹنٹ۔ ${reason ? `${reason} ` : ''}`
      + `میرے پاس چند مختصر سوالات ہیں — صرف ${minutes} منٹ لگیں گے۔ کیا ہم شروع کریں؟`,
    start: 'جی، شروع کریں',
    notNow: 'ابھی نہیں',
    noContact: 'مجھ سے رابطہ نہ کریں',
    acks: ['شکریہ!', 'ٹھیک ہے، نوٹ کر لیا۔', 'بہت اچھا، شکریہ۔', 'جی، سمجھ گئی۔', 'شکریہ، اس سے مدد ملے گی۔'],
    clarify: (q) => `معذرت، میں ٹھیک سے سمجھ نہیں سکی۔ ${q}`,
    confirm: (label, value) => `تصدیق کے لیے: ${label} — ${value}۔ کیا یہ درست ہے؟`,
    yes: 'جی، درست ہے',
    no: 'نہیں، بدلنا ہے',
    summary: 'آپ نے یہ جوابات دیے:',
    submitAsk: 'کیا میں یہ جوابات ٹیم کو بھیج دوں؟',
    submit: 'جی، بھیج دیں',
    edit: 'جواب بدلیں',
    editWhich: 'آپ کون سا جواب بدلنا چاہتے ہیں؟',
    thanks: ({ company }) => `شکریہ! آپ کے جوابات ${company} کی ٹیم کو بھیج دیے گئے ہیں۔ ضرورت ہوئی تو وہ آپ سے رابطہ کریں گے۔ اب آپ یہ صفحہ بند کر سکتے ہیں۔`,
    optedOut: ({ company }) => `ٹھیک ہے۔ ${company} اس سلسلے میں آپ سے دوبارہ رابطہ نہیں کرے گی، اور آپ کا نمبر اس مہم سے ہٹا دیا گیا ہے۔ خوش رہیں!`,
    human: ({ company }) => `ضرور۔ میں نے ${company} کی ٹیم کے ایک رکن سے کہا ہے کہ وہ خود آپ سے رابطہ کریں — عام طور پر ایک ورکنگ ڈے کے اندر۔ کیا ان کے لیے کچھ نوٹ کرنا ہے؟`,
    areYouHuman: ({ persona, company }) => `میں ${persona} ہوں، ${company} کی AI اسسٹنٹ — انسان نہیں۔ آپ جو بھی بتائیں گے، ہماری ٹیم کا ایک حقیقی رکن اسے دیکھتا ہے۔ کیا ہم جاری رکھیں؟`,
    busy: 'کوئی بات نہیں! ہماری ٹیم آپ کو کب کال کرے؟ (مثال کے طور پر "کل شام 5 بجے")',
    callbackNoted: (when) => `شکریہ — میں نے "${when}" نوٹ کر لیا ہے۔ ہماری ٹیم اس وقت کال کرے گی۔ اللہ حافظ!`,
    faqUnknown: 'اچھا سوال ہے — یہ معلومات میرے پاس نہیں، اس لیے میں نے آپ کا سوال ٹیم کو بھیج دیا ہے، وہ آپ کو جواب دیں گے۔ ',
    trouble: 'معذرت، ابھی مسئلہ آ رہا ہے۔ آپ کے اب تک کے جوابات محفوظ ہیں — تھوڑی دیر بعد دوبارہ کوشش کریں۔',
    notNowReply: 'کوئی بات نہیں۔ آپ یہ لنک کبھی بھی دوبارہ کھول کر وہیں سے جاری رکھ سکتے ہیں۔',
    letsContinue: 'چلیے آگے بڑھتے ہیں۔',
    noNote: 'نہیں، بس',
    shallWeStart: 'کیا ہم شروع کریں؟',
    continueWith: (q) => `چلیے آگے بڑھتے ہیں: ${q}`,
    yesNoHint: ' (جی / نہیں)',
    progress: (n, total) => `${n} / ${total}`,
    unknownValue: 'معلوم نہیں',
  },
};

export function copyFor(language) {
  return T[language] || T.en;
}

/** Pick an acknowledgement that differs from the previous one (no robotic repetition). */
export function pickAck(language, turn) {
  const acks = copyFor(language).acks;
  return acks[Math.abs(Number(turn) || 0) % acks.length];
}

/** The question as asked, with a yes/no hint for boolean questions. */
export function questionText(question, language) {
  const base = String(question.text || question.label || '').trim();
  return question.type === 'boolean' ? `${base}${copyFor(language).yesNoHint}` : base;
}

/** Display a validated value for read-back / summary. */
export function displayValue(value, language) {
  if (value === null || value === undefined || value === '') return copyFor(language).unknownValue;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? copyFor(language).yes.split(',')[0] : copyFor(language).no.split(',')[0];
  return String(value);
}

export const COPY_LANGUAGES = Object.keys(T);
