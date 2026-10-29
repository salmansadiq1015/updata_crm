/**
 * Starter benchmark suite — clearly labelled SAMPLE content written for illustration.
 *
 * These cases are NOT reviewed ground truth: they are seeded with reviewed:false, so no
 * run produces an official score from them until a person checks each transcript and
 * expected answer and approves it. They contain no audio (no recordings are fabricated).
 */

export const SAMPLE_SUITE = {
  name: 'SAMPLE — Lead qualification (Urdu / English / mixed)',
  description: 'Starter examples to show how benchmark cases work. Every case is unreviewed sample content: review and correct each one (or replace it with real, consented call transcripts) before relying on any score.',
  questionnaire: {
    questions: [
      { fieldKey: 'interested', label: 'Interested', text: 'Are you interested in a short demo?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'business_type', label: 'Business type', text: 'What kind of business do you run?', type: 'single_choice', order: 2,
        options: [{ value: 'restaurant', label: 'Restaurant' }, { value: 'retail', label: 'Retail shop' }, { value: 'clinic', label: 'Clinic' }, { value: 'other', label: 'Other' }] },
      { fieldKey: 'employees', label: 'Employees', text: 'How many people work there?', type: 'integer', order: 3, min: 0, max: 100000 },
      { fieldKey: 'monthly_budget', label: 'Monthly budget (PKR)', text: 'What monthly budget do you have in mind?', type: 'currency', order: 4 },
      { fieldKey: 'email', label: 'Email', text: 'Which email should we send details to?', type: 'email', order: 5 },
    ],
  },
};

// An agent turn's fieldKey records which question it asks (used to align the lead's reply).
const agent = (text, fieldKey = null) => ({ speaker: 'agent', text, ...(fieldKey ? { fieldKey } : {}) });
const lead = (text, extra = {}) => ({ speaker: 'lead', text, ...extra });

export const SAMPLE_CASES = [
  {
    title: 'SAMPLE — English, clean line',
    language: 'en', conditions: ['clean'],
    notes: 'Straightforward English answers, one per question.',
    turns: [
      agent('Are you interested in a short demo?', 'interested'), lead('Yes, sure.'),
      agent('What kind of business do you run?', 'business_type'), lead('We run a restaurant.'),
      agent('How many people work there?', 'employees'), lead('About 12 people.'),
      agent('What monthly budget do you have in mind?', 'monthly_budget'), lead('Around 50,000 rupees a month.'),
      agent('Which email should we send details to?', 'email'), lead("It's ali at example dot com."),
    ],
    groundTruth: {
      answers: [
        { fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'restaurant' },
        { fieldKey: 'employees', expected: 12 }, { fieldKey: 'monthly_budget', expected: 50000 },
        { fieldKey: 'email', expected: 'ali@example.com' },
      ],
      extraction: [{ category: 'budget', value: 50000 }],
    },
  },
  {
    title: 'SAMPLE — Urdu script, clean line',
    language: 'ur', conditions: ['clean'],
    notes: 'Urdu-script replies. The budget is said in words ("پچاس ہزار" = 50,000), which tests number handling.',
    turns: [
      agent('کیا آپ ایک مختصر ڈیمو میں دلچسپی رکھتے ہیں؟', 'interested'), lead('جی ہاں، ضرور۔'),
      agent('آپ کا کاروبار کس قسم کا ہے؟', 'business_type'), lead('ہماری کلینک ہے، clinic۔'),
      agent('وہاں کتنے لوگ کام کرتے ہیں؟', 'employees'), lead('۸ لوگ'),
      agent('آپ کے ذہن میں ماہانہ بجٹ کتنا ہے؟', 'monthly_budget'), lead('تقریباً پچاس ہزار روپے'),
      agent('تفصیلات کس ای میل پر بھیجیں؟', 'email'), lead('پتہ نہیں، بعد میں بتا دوں گا'),
    ],
    groundTruth: {
      answers: [
        { fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'clinic' },
        { fieldKey: 'employees', expected: 8 }, { fieldKey: 'monthly_budget', expected: 50000 },
        { fieldKey: 'email', expectUnknown: true },
      ],
      extraction: [{ category: 'budget', value: 50000 }],
    },
  },
  {
    title: 'SAMPLE — Roman Urdu, clean line',
    language: 'ur', conditions: ['clean'],
    notes: 'Urdu written in Latin script. "30 hazar" means 30,000.',
    turns: [
      agent('Kya aap demo mein interested hain?', 'interested'), lead('Haan ji, bilkul.'),
      agent('Aap ka business kis type ka hai?', 'business_type'), lead('Meri retail shop hai.'),
      agent('Kitne log kaam karte hain?', 'employees'), lead('5 log hain.'),
      agent('Monthly budget kitna hai?', 'monthly_budget'), lead('Taqreeban 30 hazar.'),
      agent('Email kya hai?', 'email'), lead('sara.khan@example.pk'),
    ],
    groundTruth: {
      answers: [
        { fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'retail' },
        { fieldKey: 'employees', expected: 5 }, { fieldKey: 'monthly_budget', expected: 30000 },
        { fieldKey: 'email', expected: 'sara.khan@example.pk' },
      ],
      extraction: [{ category: 'budget', value: 30000 }],
    },
  },
  {
    title: 'SAMPLE — Urdu-English code-switching',
    language: 'mixed', conditions: ['clean'],
    notes: 'Mixed Urdu and English within single replies; the email is volunteered early.',
    turns: [
      agent('Are you interested in a short demo?', 'interested'), lead('Haan, interested hoon, lekin pehle details chahiye.'),
      agent('What kind of business do you run?', 'business_type'), lead('Restaurant hai, aur email bhi note kar lein: bilal@example.com', { fieldKey: 'business_type' }),
      lead('bilal@example.com', { fieldKey: 'email' }),
      agent('How many people work there?', 'employees'), lead('Around 20 log.'),
      agent('Monthly budget?', 'monthly_budget'), lead('Abhi budget fix nahi hai.'),
    ],
    groundTruth: {
      answers: [
        { fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'restaurant' },
        { fieldKey: 'employees', expected: 20 }, { fieldKey: 'email', expected: 'bilal@example.com' },
      ],
      extraction: [{ category: 'objection', value: 'needs details first' }],
    },
  },
  {
    title: 'SAMPLE — Interruption (overlapping turns)',
    language: 'en', conditions: ['interruption'],
    notes: 'The lead answers before the agent finishes the question (overlapping start/end times).',
    turns: [
      { ...agent('Are you interested in a short demo of our—', 'interested'), startMs: 0, endMs: 2100 },
      { ...lead('Yes yes, go on.'), startMs: 1500, endMs: 2600 },
      { ...agent('Great. What kind of business do you', 'business_type'), startMs: 3000, endMs: 4400 },
      { ...lead('Clinic. Dental clinic.'), startMs: 3900, endMs: 5200 },
      { ...agent('How many people work there?', 'employees'), startMs: 5600, endMs: 7000 },
      { ...lead('Fifteen. 15.'), startMs: 7400, endMs: 8300 },
    ],
    groundTruth: {
      answers: [{ fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'clinic' }, { fieldKey: 'employees', expected: 15 }],
      extraction: [],
    },
  },
  {
    title: 'SAMPLE — Noisy line with ASR-style errors',
    language: 'en', conditions: ['noise'],
    notes: 'Transcript as a speech recogniser might produce it on a noisy line (dropped words, misspellings). Expected answers are what the lead actually said.',
    turns: [
      agent('Are you interested in a short demo?', 'interested'), lead('yeah we r intrested'),
      agent('What kind of business do you run?', 'business_type'), lead('its a retale shop'),
      agent('How many people work there?', 'employees'), lead('like ten'),
      agent('What monthly budget do you have in mind?', 'monthly_budget'), lead('maybe forty thousand'),
      agent('Which email should we send details to?', 'email'), lead('omar at exmaple dot com'),
    ],
    groundTruth: {
      answers: [
        { fieldKey: 'interested', expected: true }, { fieldKey: 'business_type', expected: 'retail' },
        { fieldKey: 'employees', expected: 10 }, { fieldKey: 'monthly_budget', expected: 40000 },
        { fieldKey: 'email', expected: 'omar@example.com' },
      ],
      extraction: [{ category: 'budget', value: 40000 }],
    },
  },
];
