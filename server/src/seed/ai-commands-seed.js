import VoiceCommand from '../modules/ai/voiceCommand.model.js';
import logger from '../shared/logger/index.js';

const COMMAND_DEFINITIONS = [
  {
    intent: 'show_orders_today',
    actionType: 'NAVIGATE',
    actionTarget: '/field-ops/orders?filter=today',
    phrases: {
      de: ['heutige auftraege', 'meine auftraege heute', 'zeige meine heutigen auftraege'],
      fr: ['commandes du jour', 'mes commandes aujourd hui', 'afficher les commandes du jour'],
      it: ['ordini di oggi', 'i miei ordini oggi', 'mostra gli ordini di oggi'],
      en: ['today orders', 'my orders today', 'show my orders today'],
    },
  },
  {
    intent: 'show_orders',
    actionType: 'NAVIGATE',
    actionTarget: '/field-ops/orders',
    phrases: {
      de: ['alle auftraege', 'auftragsliste', 'zeige auftraege'],
      fr: ['toutes les commandes', 'liste des commandes', 'afficher les commandes'],
      it: ['tutti gli ordini', 'lista ordini', 'mostra ordini'],
      en: ['all orders', 'order list', 'show orders'],
    },
  },
  {
    intent: 'search_customer',
    actionType: 'SEARCH',
    actionTarget: '/crm/customers',
    phrases: {
      de: ['suche kunde', 'kunde suchen', 'finde kunde'],
      fr: ['chercher client', 'rechercher client', 'trouver client'],
      it: ['cerca cliente', 'trova cliente', 'ricerca cliente'],
      en: ['search customer', 'find customer', 'look up customer'],
    },
  },
  {
    intent: 'create_order',
    actionType: 'CREATE',
    actionTarget: '/orders/create',
    phrases: {
      de: ['neuer auftrag', 'auftrag erstellen', 'erstelle auftrag'],
      fr: ['nouvelle commande', 'creer commande', 'creer un ordre'],
      it: ['nuovo ordine', 'crea ordine', 'creare ordine'],
      en: ['new order', 'create order', 'start order'],
    },
  },
  {
    intent: 'show_dashboard',
    actionType: 'NAVIGATE',
    actionTarget: '/dashboard',
    phrases: {
      de: ['zeige dashboard', 'zum dashboard', 'startseite'],
      fr: ['tableau de bord', 'aller au tableau de bord', 'accueil'],
      it: ['mostra dashboard', 'vai alla dashboard', 'home'],
      en: ['show dashboard', 'go to dashboard', 'go home'],
    },
  },
  {
    intent: 'open_ai',
    actionType: 'NAVIGATE',
    actionTarget: '/ai',
    phrases: {
      de: ['oeffne assistent', 'ki assistent', 'sprachassistent'],
      fr: ['ouvrir assistant ia', 'assistant ia', 'assistant vocal'],
      it: ['apri assistente ia', 'assistente ia', 'assistente vocale'],
      en: ['open ai assistant', 'ai assistant', 'voice assistant'],
    },
  },
  {
    intent: 'show_tasks',
    actionType: 'NAVIGATE',
    actionTarget: '/tasks',
    phrases: {
      de: ['zeige aufgaben', 'meine aufgaben', 'aufgabenliste'],
      fr: ['afficher taches', 'mes taches', 'liste des taches'],
      it: ['mostra attivita', 'le mie attivita', 'lista attivita'],
      en: ['show tasks', 'my tasks', 'task list'],
    },
  },
  {
    intent: 'show_calendar',
    actionType: 'NAVIGATE',
    actionTarget: '/scheduling/calendar',
    phrases: {
      de: ['zeige kalender', 'termine', 'einsatzplan'],
      fr: ['afficher calendrier', 'rendez vous', 'planning'],
      it: ['mostra calendario', 'appuntamenti', 'pianificazione'],
      en: ['show calendar', 'appointments', 'schedule'],
    },
  },
  {
    intent: 'show_crm',
    actionType: 'NAVIGATE',
    actionTarget: '/crm/customers',
    phrases: {
      de: ['zeige kunden', 'kundenliste', 'crm'],
      fr: ['liste clients', 'afficher clients', 'crm'],
      it: ['lista clienti', 'mostra clienti', 'crm'],
      en: ['customer list', 'show customers', 'crm'],
    },
  },
  {
    intent: 'show_accounting',
    actionType: 'NAVIGATE',
    actionTarget: '/accounting',
    phrases: {
      de: ['buchhaltung', 'rechnungen', 'offene posten'],
      fr: ['comptabilite', 'factures', 'postes ouverts'],
      it: ['contabilita', 'fatture', 'partite aperte'],
      en: ['accounting', 'invoices', 'open items'],
    },
  },
  {
    intent: 'mobile_orders',
    actionType: 'NAVIGATE',
    actionTarget: '/field-ops/orders',
    phrases: {
      de: ['mobile auftraege', 'meine einsaetze', 'feldeinsaetze'],
      fr: ['interventions mobiles', 'mes interventions', 'ordres terrain'],
      it: ['interventi mobili', 'i miei interventi', 'ordini sul campo'],
      en: ['mobile orders', 'my field jobs', 'field orders'],
    },
  },
  {
    intent: 'mobile_notifications',
    actionType: 'NAVIGATE',
    actionTarget: '/notifications',
    phrases: {
      de: ['benachrichtigungen', 'mitteilungen', 'meldungen'],
      fr: ['notifications', 'messages', 'alertes'],
      it: ['notifiche', 'messaggi', 'avvisi'],
      en: ['notifications', 'messages', 'alerts'],
    },
  },
  {
    intent: 'status_complete',
    actionType: 'UPDATE',
    actionTarget: 'status:completed',
    requiresConfirmation: true,
    phrases: {
      de: ['status erledigt', 'als erledigt markieren', 'auftrag erledigt'],
      fr: ['statut termine', 'marquer comme termine', 'commande terminee'],
      it: ['stato completato', 'segna come completato', 'ordine completato'],
      en: ['status complete', 'mark complete', 'order completed'],
    },
  },
  {
    intent: 'show_projects',
    actionType: 'NAVIGATE',
    actionTarget: '/projects',
    phrases: {
      de: ['zeige projekte', 'projektliste', 'projekte'],
      fr: ['afficher projets', 'liste projets', 'projets'],
      it: ['mostra progetti', 'lista progetti', 'progetti'],
      en: ['show projects', 'project list', 'projects'],
    },
  },
  {
    intent: 'show_catalog',
    actionType: 'NAVIGATE',
    actionTarget: '/catalog',
    phrases: {
      de: ['katalog', 'artikel', 'materialkatalog'],
      fr: ['catalogue', 'articles', 'catalogue materiel'],
      it: ['catalogo', 'articoli', 'catalogo materiali'],
      en: ['catalog', 'articles', 'material catalog'],
    },
  },
  {
    intent: 'dictate_report',
    actionType: 'CREATE',
    actionTarget: 'report:dictate',
    phrases: {
      de: ['diktiere bericht', 'bericht diktieren', 'servicebericht'],
      fr: ['dicter rapport', 'rapport de service', 'enregistrer rapport'],
      it: ['detta rapporto', 'rapporto di servizio', 'registra rapporto'],
      en: ['dictate report', 'service report', 'record report'],
    },
  },
  {
    intent: 'capture_address',
    actionType: 'CREATE',
    actionTarget: 'address:capture',
    phrases: {
      de: ['adresse erfassen', 'adresse diktieren', 'neue adresse'],
      fr: ['saisir adresse', 'dicter adresse', 'nouvelle adresse'],
      it: ['inserisci indirizzo', 'detta indirizzo', 'nuovo indirizzo'],
      en: ['capture address', 'dictate address', 'new address'],
    },
  },
  {
    intent: 'show_settings',
    actionType: 'NAVIGATE',
    actionTarget: '/settings/sessions',
    phrases: {
      de: ['einstellungen', 'profil', 'benutzereinstellungen'],
      fr: ['parametres', 'profil', 'parametres utilisateur'],
      it: ['impostazioni', 'profilo', 'impostazioni utente'],
      en: ['settings', 'profile', 'user settings'],
    },
  },
  {
    intent: 'help_commands',
    actionType: 'NAVIGATE',
    actionTarget: 'help:commands',
    phrases: {
      de: ['was kann ich sagen', 'hilfe befehle', 'befehle anzeigen'],
      fr: ['que puis je dire', 'aide commandes', 'afficher commandes'],
      it: ['cosa posso dire', 'aiuto comandi', 'mostra comandi'],
      en: ['what can i say', 'help commands', 'show commands'],
    },
  },
  {
    intent: 'show_chat',
    actionType: 'NAVIGATE',
    actionTarget: '/field-ops/chat',
    phrases: {
      de: ['nachrichten', 'chat oeffnen', 'team chat'],
      fr: ['messages', 'ouvrir chat', 'chat equipe'],
      it: ['messaggi', 'apri chat', 'chat team'],
      en: ['messages', 'open chat', 'team chat'],
    },
  },
];

export const COMMANDS = COMMAND_DEFINITIONS.flatMap((definition) =>
  Object.entries(definition.phrases).map(([language, phrases]) => ({
    intent: definition.intent,
    language,
    phrases,
    actionType: definition.actionType,
    actionTarget: definition.actionTarget,
    actionParameters: definition.actionParameters || {},
    requiresConfirmation: !!definition.requiresConfirmation,
  })),
);

export async function seedAiCommands() {
  let created = 0;
  let updated = 0;

  for (const cmd of COMMANDS) {
    const exists = await VoiceCommand.findOne({ intent: cmd.intent, language: cmd.language, isDeleted: false });
    if (!exists) {
      await VoiceCommand.create({ ...cmd, isActive: true });
      created += 1;
      continue;
    }

    const changed = (
      exists.actionType !== cmd.actionType ||
      exists.actionTarget !== cmd.actionTarget ||
      exists.requiresConfirmation !== cmd.requiresConfirmation ||
      JSON.stringify(exists.actionParameters || {}) !== JSON.stringify(cmd.actionParameters || {}) ||
      JSON.stringify(exists.phrases || []) !== JSON.stringify(cmd.phrases)
    );

    if (changed) {
      await VoiceCommand.updateOne(
        { _id: exists._id },
        {
          $set: {
            phrases: cmd.phrases,
            actionType: cmd.actionType,
            actionTarget: cmd.actionTarget,
            actionParameters: cmd.actionParameters,
            requiresConfirmation: cmd.requiresConfirmation,
            isActive: true,
          },
        },
      );
      updated += 1;
    }
  }

  logger.info(`AI voice commands seed: ${created} new, ${updated} updated (${COMMANDS.length} defined)`, { module: 'seed' });
  return { created, updated, total: COMMANDS.length };
}

export default seedAiCommands;
