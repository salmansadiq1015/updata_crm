// Dashboard intelligence copy, ordered en / fr / de / ar.
const rows = {
  "outcomeDetails": [
    "Conversation outcomes",
    "Résultats des conversations",
    "Gesprächsergebnisse",
    "نتائج المحادثات"
  ],
  "assistantTotal": [
    "Workflow runs",
    "Exécutions de workflows",
    "Workflow-Ausführungen",
    "عمليات سير العمل"
  ],
  "callingTotal": [
    "Call attempts",
    "Tentatives d’appel",
    "Anrufversuche",
    "محاولات الاتصال"
  ],
  "incomingTotal": [
    "Calls received",
    "Appels reçus",
    "Empfangene Anrufe",
    "المكالمات المستلمة"
  ],
  "leadsTotal": [
    "New leads",
    "Nouveaux prospects",
    "Neue Leads",
    "العملاء المحتملون الجدد"
  ],
  "moreWorkspaces": [
    "More workspaces",
    "Autres espaces",
    "Weitere Arbeitsbereiche",
    "مساحات عمل أخرى"
  ],
  "transferred": [
    "Transferred calls",
    "Appels transférés",
    "Weitergeleitete Anrufe",
    "المكالمات المحوّلة"
  ],
  "assistant": [
    "AI assistant",
    "Assistant IA",
    "KI-Assistent",
    "المساعد الذكي"
  ],
  "calling": [
    "AI calling",
    "Appels IA",
    "KI-Anrufe",
    "المكالمات الذكية"
  ],
  "incoming": [
    "Incoming calls",
    "Appels entrants",
    "Eingehende Anrufe",
    "المكالمات الواردة"
  ],
  "leads": [
    "Leads & follow-ups",
    "Prospects et suivis",
    "Leads & Nachverfolgung",
    "العملاء المحتملون والمتابعات"
  ],
  "workspace": [
    "Workspace overview",
    "Vue de l’espace de travail",
    "Arbeitsbereich-Übersicht",
    "نظرة عامة على مساحة العمل"
  ],
  "subtitle": [
    "Your business, conversations, and AI activity in one place.",
    "Votre activité, vos conversations et votre IA au même endroit.",
    "Geschäft, Gespräche und KI-Aktivität an einem Ort.",
    "أعمالك ومحادثاتك ونشاط الذكاء الاصطناعي في مكان واحد."
  ],
  "aiOverview": [
    "AI & growth at a glance",
    "IA et croissance en un coup d’œil",
    "KI & Wachstum im Überblick",
    "الذكاء الاصطناعي والنمو في لمحة"
  ],
  "features": [
    "Explore your workspace",
    "Explorer votre espace de travail",
    "Arbeitsbereiche entdecken",
    "استكشف مساحة عملك"
  ],
  "featuresDesc": [
    "A quick overview of the tools available to you.",
    "Un aperçu des outils à votre disposition.",
    "Ein Überblick über Ihre verfügbaren Werkzeuge.",
    "نظرة سريعة على الأدوات المتاحة لك."
  ],
  "open": [
    "Open workspace",
    "Ouvrir l’espace",
    "Arbeitsbereich öffnen",
    "افتح مساحة العمل"
  ],
  "viewAnalytics": [
    "View analytics",
    "Voir les analyses",
    "Analysen ansehen",
    "عرض التحليلات"
  ],
  "period": [
    "Selected period",
    "Période sélectionnée",
    "Gewählter Zeitraum",
    "الفترة المحددة"
  ],
  "personal": [
    "Your activity",
    "Votre activité",
    "Ihre Aktivität",
    "نشاطك"
  ],
  "owner": [
    "Your agents and calls",
    "Vos agents et appels",
    "Ihre Agenten und Anrufe",
    "وكلاؤك ومكالماتك"
  ],
  "team": [
    "Team incoming calls",
    "Appels entrants de l’équipe",
    "Eingehende Teamanrufe",
    "مكالمات الفريق الواردة"
  ],
  "personalIncoming": [
    "Calls owned by or assigned to you",
    "Appels dont vous êtes responsable",
    "Eigene oder zugewiesene Anrufe",
    "المكالمات التي تملكها أو المسندة إليك"
  ],
  "assistantDesc": [
    "Workflow runs started in the selected period.",
    "Exécutions démarrées pendant la période sélectionnée.",
    "Im gewählten Zeitraum gestartete Abläufe.",
    "عمليات سير العمل التي بدأت خلال الفترة المحددة."
  ],
  "callingDesc": [
    "Production call attempts created in the selected period. Test calls are excluded.",
    "Tentatives d’appels créées pendant la période. Les tests sont exclus.",
    "Anrufversuche im gewählten Zeitraum. Testanrufe sind ausgeschlossen.",
    "محاولات الاتصال الفعلية خلال الفترة المحددة، باستثناء مكالمات الاختبار."
  ],
  "incomingDesc": [
    "Incoming calls received in the selected period. Test calls are excluded.",
    "Appels reçus pendant la période, hors appels de test.",
    "Eingegangene Anrufe im gewählten Zeitraum, ohne Testanrufe.",
    "المكالمات الواردة خلال الفترة المحددة، باستثناء مكالمات الاختبار."
  ],
  "leadsDesc": [
    "Leads created in the selected period and their current outcomes.",
    "Prospects créés pendant la période et leurs résultats actuels.",
    "Im gewählten Zeitraum erstellte Leads und ihre aktuellen Ergebnisse.",
    "العملاء المحتملون الذين أُنشئوا خلال الفترة ونتائجهم الحالية."
  ],
  "total": [
    "Total activity",
    "Activité totale",
    "Gesamtaktivität",
    "إجمالي النشاط"
  ],
  "completed": [
    "Completed",
    "Terminés",
    "Abgeschlossen",
    "مكتملة"
  ],
  "answered": [
    "Answered",
    "Répondus",
    "Angenommen",
    "تم الرد عليها"
  ],
  "qualified": [
    "Qualified",
    "Qualifiés",
    "Qualifiziert",
    "مؤهلون"
  ],
  "converted": [
    "Converted",
    "Convertis",
    "Konvertiert",
    "تم تحويلهم"
  ],
  "missed": [
    "Missed calls",
    "Appels manqués",
    "Verpasste Anrufe",
    "المكالمات الفائتة"
  ],
  "aiHandled": [
    "Handled by AI",
    "Traités par l’IA",
    "Von KI bearbeitet",
    "تمت معالجتها بالذكاء الاصطناعي"
  ],
  "awaiting": [
    "Awaiting approval",
    "En attente d’approbation",
    "Warten auf Freigabe",
    "بانتظار الموافقة"
  ],
  "failed": [
    "Failed",
    "Échecs",
    "Fehlgeschlagen",
    "فاشلة"
  ],
  "active": [
    "In progress",
    "En cours",
    "In Bearbeitung",
    "قيد التنفيذ"
  ],
  "answerRate": [
    "Answer rate",
    "Taux de réponse",
    "Annahmequote",
    "معدل الرد"
  ],
  "successRate": [
    "Completion rate",
    "Taux de réalisation",
    "Abschlussquote",
    "معدل الإكمال"
  ],
  "agents": [
    "Calling agents",
    "Agents d’appel",
    "Anrufagenten",
    "وكلاء الاتصال"
  ],
  "activeAgents": [
    "Active agents",
    "Agents actifs",
    "Aktive Agenten",
    "الوكلاء النشطون"
  ],
  "activeCampaigns": [
    "Open campaigns",
    "Campagnes ouvertes",
    "Offene Kampagnen",
    "الحملات المفتوحة"
  ],
  "live": [
    "Live incoming calls",
    "Appels entrants en cours",
    "Laufende eingehende Anrufe",
    "المكالمات الواردة الجارية"
  ],
  "overdueFollowUps": [
    "Overdue follow-ups",
    "Suivis en retard",
    "Überfällige Nachverfolgungen",
    "المتابعات المتأخرة"
  ],
  "leadInventory": [
    "Your lead portfolio",
    "Votre portefeuille de prospects",
    "Ihr Lead-Bestand",
    "قائمة عملائك المحتملين"
  ],
  "inventory": [
    "Current workspace",
    "Espace actuel",
    "Aktueller Arbeitsbereich",
    "مساحة العمل الحالية"
  ],
  "inventoryDesc": [
    "Current totals, independent of the selected period.",
    "Totaux actuels, indépendants de la période sélectionnée.",
    "Aktuelle Bestände, unabhängig vom gewählten Zeitraum.",
    "الإجماليات الحالية، بغض النظر عن الفترة المحددة."
  ],
  "activityTrend": [
    "Activity over time",
    "Activité dans le temps",
    "Aktivität im Zeitverlauf",
    "النشاط بمرور الوقت"
  ],
  "outcomes": [
    "Activity by status",
    "Activité par statut",
    "Aktivität nach Status",
    "النشاط حسب الحالة"
  ],
  "pipeline": [
    "Lead pipeline",
    "Pipeline de prospects",
    "Lead-Pipeline",
    "مسار العملاء المحتملين"
  ],
  "pipelineDesc": [
    "Current status of all leads in your portfolio.",
    "Statut actuel de tous vos prospects.",
    "Aktueller Status aller Leads in Ihrem Bestand.",
    "الحالة الحالية لجميع عملائك المحتملين."
  ],
  "attention": [
    "Needs your attention",
    "Votre attention est requise",
    "Benötigt Ihre Aufmerksamkeit",
    "بحاجة إلى انتباهك"
  ],
  "upToDate": [
    "No pending action in this period",
    "Aucune action en attente sur cette période",
    "Keine offene Aktion in diesem Zeitraum",
    "لا توجد إجراءات معلقة خلال هذه الفترة"
  ],
  "unavailable": [
    "This overview could not be loaded",
    "Impossible de charger cette vue",
    "Diese Übersicht konnte nicht geladen werden",
    "تعذر تحميل هذه النظرة العامة"
  ],
  "unavailableDesc": [
    "Retry, or open the workspace to view its latest activity.",
    "Réessayez ou ouvrez l’espace pour voir son activité.",
    "Erneut versuchen oder aktuelle Aktivitäten im Arbeitsbereich ansehen.",
    "أعد المحاولة أو افتح مساحة العمل لعرض أحدث الأنشطة."
  ],
  "notAvailable": [
    "Analytics are not available for this workspace.",
    "Les analyses ne sont pas disponibles pour cet espace.",
    "Für diesen Arbeitsbereich sind keine Analysen verfügbar.",
    "التحليلات غير متاحة لمساحة العمل هذه."
  ],
  "discovery": [
    "Lead discovery",
    "Recherche de prospects",
    "Lead-Suche",
    "اكتشاف العملاء المحتملين"
  ],
  "messaging": [
    "Messaging & outreach",
    "Messagerie et campagnes",
    "Nachrichten & Kontaktaufnahme",
    "الرسائل والتواصل"
  ],
  "sms": [
    "SMS operations",
    "Opérations SMS",
    "SMS-Betrieb",
    "عمليات الرسائل القصيرة"
  ],
  "featureCalling": [
    "Agents, campaigns, and call outcomes",
    "Agents, campagnes et résultats d’appels",
    "Agenten, Kampagnen und Anrufergebnisse",
    "الوكلاء والحملات ونتائج المكالمات"
  ],
  "featureIncoming": [
    "Reception, handoffs, and follow-up",
    "Réception, transferts et suivi",
    "Annahme, Übergaben und Nachverfolgung",
    "الاستقبال والتحويل والمتابعة"
  ],
  "featureAssistant": [
    "Workflow automation and approvals",
    "Automatisation et approbations",
    "Automatisierte Abläufe und Freigaben",
    "أتمتة سير العمل والموافقات"
  ],
  "featureDiscovery": [
    "Find and enrich new opportunities",
    "Trouver et enrichir des opportunités",
    "Chancen finden und anreichern",
    "ابحث عن فرص جديدة وأثرِ معلوماتها"
  ],
  "featureMessaging": [
    "Campaigns and customer conversations",
    "Campagnes et conversations clients",
    "Kampagnen und Kundengespräche",
    "الحملات ومحادثات العملاء"
  ],
  "state.pending": [
    "Pending",
    "En attente",
    "Ausstehend",
    "معلقة"
  ],
  "state.running": [
    "Running",
    "En cours",
    "Läuft",
    "جارية"
  ],
  "state.awaiting_confirmation": [
    "Awaiting approval",
    "En attente d’approbation",
    "Warten auf Freigabe",
    "بانتظار الموافقة"
  ],
  "state.completed": [
    "Completed",
    "Terminés",
    "Abgeschlossen",
    "مكتملة"
  ],
  "state.failed": [
    "Failed",
    "Échecs",
    "Fehlgeschlagen",
    "فاشلة"
  ],
  "state.cancelled": [
    "Cancelled",
    "Annulé",
    "Abgebrochen",
    "ملغاة"
  ],
  "state.queued": [
    "Queued",
    "En file",
    "Warteschlange",
    "في قائمة الانتظار"
  ],
  "state.initiating": [
    "Initiating",
    "Initialisation",
    "Startet",
    "بدء الاتصال"
  ],
  "state.ringing": [
    "Ringing",
    "Sonnerie",
    "Klingelt",
    "يرن"
  ],
  "state.in_progress": [
    "In progress",
    "En cours",
    "In Bearbeitung",
    "قيد التنفيذ"
  ],
  "state.processing_results": [
    "Processing",
    "Traitement",
    "Verarbeitung",
    "قيد المعالجة"
  ],
  "state.no_answer": [
    "No answer",
    "Sans réponse",
    "Keine Antwort",
    "لم يتم الرد"
  ],
  "state.busy": [
    "Busy",
    "Occupé",
    "Besetzt",
    "مشغول"
  ],
  "state.voicemail": [
    "Voicemail",
    "Messagerie vocale",
    "Mailbox",
    "بريد صوتي"
  ],
  "state.needs_reconcile": [
    "Needs review",
    "À vérifier",
    "Prüfung nötig",
    "تحتاج مراجعة"
  ],
  "state.detected": [
    "Detected",
    "Détecté",
    "Erkannt",
    "تم الكشف"
  ],
  "state.received": [
    "Received",
    "Reçu",
    "Empfangen",
    "مستلمة"
  ],
  "state.identifying": [
    "Identifying",
    "Identification",
    "Identifizierung",
    "جارٍ التعرف"
  ],
  "state.answering": [
    "Answering",
    "Réponse en cours",
    "Wird angenommen",
    "جارٍ الرد"
  ],
  "state.answered": [
    "Answered",
    "Répondus",
    "Angenommen",
    "تم الرد عليها"
  ],
  "state.connecting_audio": [
    "Connecting audio",
    "Connexion audio",
    "Audioverbindung",
    "توصيل الصوت"
  ],
  "state.ai_active": [
    "AI active",
    "IA active",
    "KI aktiv",
    "الذكاء الاصطناعي نشط"
  ],
  "state.human_active": [
    "Human active",
    "Humain actif",
    "Mensch aktiv",
    "موظف نشط"
  ],
  "state.transferring": [
    "Transferring",
    "Transfert",
    "Weiterleitung",
    "جارٍ التحويل"
  ],
  "state.wrapping_up": [
    "Wrapping up",
    "Finalisation",
    "Abschluss",
    "إنهاء"
  ],
  "state.missed": [
    "Missed calls",
    "Appels manqués",
    "Verpasste Anrufe",
    "المكالمات الفائتة"
  ],
  "state.rejected": [
    "Rejected",
    "Rejeté",
    "Abgewiesen",
    "مرفوضة"
  ],
  "state.interrupted": [
    "Interrupted",
    "Interrompu",
    "Unterbrochen",
    "منقطعة"
  ],
  "state.new": [
    "New",
    "Nouveau",
    "Neu",
    "جديد"
  ],
  "state.contacted": [
    "Contacted",
    "Contacté",
    "Kontaktiert",
    "تم التواصل"
  ],
  "state.qualified": [
    "Qualified",
    "Qualifiés",
    "Qualifiziert",
    "مؤهلون"
  ],
  "state.unqualified": [
    "Unqualified",
    "Non qualifié",
    "Nicht qualifiziert",
    "غير مؤهل"
  ],
  "state.converted": [
    "Converted",
    "Convertis",
    "Konvertiert",
    "تم تحويلهم"
  ],
  "state.unknown": [
    "Unknown",
    "Inconnu",
    "Unbekannt",
    "غير معروف"
  ]
};

export const dashboardIntelligenceTranslations = Object.fromEntries(
  ["en", "fr", "de", "ar"].map((locale, index) => [locale, Object.fromEntries(
    Object.entries(rows).map(([key, values]) => [`dashboard.intelligence.${key}`, values[index]])
  )])
);
