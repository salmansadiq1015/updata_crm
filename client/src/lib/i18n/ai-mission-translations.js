/**
 * AI calling agent — goal-driven ("mission") conversation mode.
 * key: [en, de, fr, ar] — expanded per locale below; workflow-translations.test.js checks completeness.
 */
const labels = {
  "aiMission.tab": ["Conversation mode", "Gesprächsmodus", "Mode de conversation", "وضع المحادثة"],
  "aiMission.mode": ["Conversation mode", "Gesprächsmodus", "Mode de conversation", "وضع المحادثة"],
  "aiMission.mode.questions": ["Structured questions", "Strukturierte Fragen", "Questions structurées", "أسئلة منظمة"],
  "aiMission.mode.questions.hint": ["The agent asks the configured questions in order — the classic behaviour.", "Der Agent stellt die konfigurierten Fragen der Reihe nach – das bisherige Verhalten.", "L'agent pose les questions configurées dans l'ordre — le comportement classique.", "يطرح الوكيل الأسئلة المكوّنة بالترتيب — السلوك المعتاد."],
  "aiMission.mode.mission": ["Goal-driven mission", "Zielorientierte Mission", "Mission orientée objectif", "مهمة موجهة بالهدف"],
  "aiMission.mode.mission.hint": ["The agent pursues an objective naturally and collects the required information in any order.", "Der Agent verfolgt ein Ziel im natürlichen Gespräch und sammelt die nötigen Informationen in beliebiger Reihenfolge.", "L'agent poursuit un objectif naturellement et recueille les informations requises dans n'importe quel ordre.", "يسعى الوكيل إلى هدف بشكل طبيعي ويجمع المعلومات المطلوبة بأي ترتيب."],
  "aiMission.objective": ["Objective — what should the conversation achieve?", "Ziel – was soll das Gespräch erreichen?", "Objectif — que doit accomplir la conversation ?", "الهدف — ما الذي يجب أن تحققه المحادثة؟"],
  "aiMission.objectivePlaceholder": ["Find out whether the company plans a heating replacement this year and who decides.", "Herausfinden, ob die Firma dieses Jahr einen Heizungsersatz plant und wer entscheidet.", "Savoir si l'entreprise prévoit de remplacer son chauffage cette année et qui décide.", "معرفة ما إذا كانت الشركة تخطط لاستبدال التدفئة هذا العام ومن يتخذ القرار."],
  "aiMission.persona": ["Persona — how should the agent come across?", "Persona – wie soll der Agent wirken?", "Persona — comment l'agent doit-il se présenter ?", "الشخصية — كيف يجب أن يظهر الوكيل؟"],
  "aiMission.personaPlaceholder": ["A calm, knowledgeable energy advisor from a Swiss family business.", "Eine ruhige, kompetente Energieberaterin eines Schweizer Familienunternehmens.", "Un conseiller en énergie calme et compétent d'une entreprise familiale suisse.", "مستشار طاقة هادئ وخبير من شركة عائلية سويسرية."],
  "aiMission.completion": ["Completion — when is the mission done?", "Abschluss – wann ist die Mission erfüllt?", "Fin — quand la mission est-elle accomplie ?", "الإكمال — متى تكتمل المهمة؟"],
  "aiMission.completionPlaceholder": ["We know the interest, the timeline and the decision maker — or the person declined.", "Wir kennen Interesse, Zeitrahmen und Entscheider – oder die Person hat abgelehnt.", "Nous connaissons l'intérêt, l'échéance et le décideur — ou la personne a refusé.", "نعرف الاهتمام والإطار الزمني وصاحب القرار — أو رفض الشخص."],
  "aiMission.behavior": ["Conversation behaviour", "Gesprächsverhalten", "Comportement de conversation", "سلوك المحادثة"],
  "aiMission.behavior.naturalConversation": ["Talk naturally and react to what the person says", "Natürlich sprechen und auf das Gesagte eingehen", "Parler naturellement et réagir à ce que dit la personne", "التحدث بشكل طبيعي والتفاعل مع ما يقوله الشخص"],
  "aiMission.behavior.skipAnswered": ["Skip information the person already gave", "Bereits genannte Informationen überspringen", "Ne pas redemander une information déjà donnée", "تخطي المعلومات التي قدمها الشخص بالفعل"],
  "aiMission.behavior.clarifyAmbiguous": ["Clarify vague or ambiguous answers", "Vage oder mehrdeutige Antworten klären", "Clarifier les réponses vagues ou ambiguës", "توضيح الإجابات الغامضة أو الملتبسة"],
  "aiMission.behavior.respectRefusals": ["Accept refusals and move on", "Ablehnungen akzeptieren und weitermachen", "Accepter les refus et passer à la suite", "قبول الرفض والمتابعة"],
  "aiMission.alwaysOn": ["Always on: one question at a time, never inventing answers, honouring stop and do-not-contact requests.", "Immer aktiv: eine Frage nach der anderen, nie Antworten erfinden, Stopp- und Nicht-kontaktieren-Wünsche respektieren.", "Toujours actif : une question à la fois, jamais de réponse inventée, respect des demandes d'arrêt et de non-contact.", "مفعّل دائمًا: سؤال واحد في كل مرة، وعدم اختلاق إجابات، واحترام طلبات التوقف وعدم الاتصال."],
  "aiMission.required": ["Required information", "Erforderliche Informationen", "Informations requises", "المعلومات المطلوبة"],
  "aiMission.optional": ["Optional information", "Optionale Informationen", "Informations facultatives", "معلومات اختيارية"],
  "aiMission.infoHint": ["The information to collect comes from “Conversation questions” (required or optional). Business facts and approved answers come from the agent’s knowledge base. Results stay structured and validated, so workflows can branch on them.", "Die zu sammelnden Informationen stammen aus den „Gesprächsfragen“ (erforderlich oder optional). Fakten und freigegebene Antworten kommen aus der Wissensbasis des Agenten. Die Ergebnisse bleiben strukturiert und validiert, damit Workflows danach verzweigen können.", "Les informations à recueillir proviennent des « Questions de conversation » (requises ou facultatives). Les faits et réponses approuvées viennent de la base de connaissances de l'agent. Les résultats restent structurés et validés pour que les workflows puissent s'en servir.", "تأتي المعلومات المطلوب جمعها من «أسئلة المحادثة» (مطلوبة أو اختيارية). وتأتي الحقائق والإجابات المعتمدة من قاعدة معرفة الوكيل. تبقى النتائج منظمة وموثقة لتتمكن مسارات العمل من التفرع بناءً عليها."],
};

const pick = (i) => Object.fromEntries(Object.entries(labels).map(([key, values]) => [key, values[i]]));
export const aiMissionTranslations = { en: pick(0), de: pick(1), fr: pick(2), ar: pick(3) };
export default aiMissionTranslations;
