'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

const HELP_COMMANDS = {
  de: [
    ['heutige auftraege', 'Oeffnet Ihre heutigen Einsaetze'],
    ['alle auftraege anzeigen', 'Oeffnet die Auftragsliste'],
    ['kunde mueller suchen', 'Startet die Kundensuche'],
    ['firma erstellen muster ag inhaber max muster uid che-123.456.789', 'Erstellt eine Firma mit Inhaber und UID'],
    ['neuer auftrag', 'Startet die Auftragserstellung'],
    ['zeige dashboard', 'Oeffnet das Dashboard'],
    ['ki assistent oeffnen', 'Oeffnet den Assistenten'],
    ['meine aufgaben', 'Oeffnet Aufgaben'],
    ['zeige kalender', 'Oeffnet die Einsatzplanung'],
    ['kundenliste anzeigen', 'Oeffnet CRM Kunden'],
    ['buchhaltung anzeigen', 'Oeffnet Finanzen'],
    ['meine einsätze', 'Öffnet Field-Ops Aufträge'],
    ['benachrichtigungen', 'Oeffnet Meldungen'],
    ['status erledigt', 'Aktualisiert den aktuellen Datensatz nach Bestätigung'],
    ['zeige projekte', 'Oeffnet Projekte'],
    ['materialkatalog', 'Oeffnet den Katalog'],
    ['bericht diktieren', 'Startet die Berichtsdiktation'],
    ['adresse erfassen', 'Startet Adresseingabe per Sprache'],
    ['einstellungen', 'Oeffnet Einstellungen'],
    ['was kann ich sagen', 'Zeigt diese Hilfe'],
    ['team chat oeffnen', 'Oeffnet den Team-Chat'],
  ],
  fr: [
    ['commandes du jour', 'Ouvre les interventions du jour'],
    ['afficher toutes les commandes', 'Ouvre la liste des commandes'],
    ['rechercher client mueller', 'Lance la recherche client'],
    ['nouvelle commande', 'Demarre la creation de commande'],
    ['tableau de bord', 'Ouvre le tableau de bord'],
    ['ouvrir assistant ia', 'Ouvre l assistant'],
    ['mes taches', 'Ouvre les taches'],
    ['calendrier', 'Ouvre la planification'],
    ['liste clients', 'Ouvre les clients CRM'],
    ['comptabilite', 'Ouvre les finances'],
    ['mes interventions', 'Ouvre les ordres terrain'],
    ['notifications', 'Ouvre les notifications'],
    ['statut termine', 'Met a jour le statut apres confirmation'],
    ['afficher projets', 'Ouvre les projets'],
    ['catalogue materiel', 'Ouvre le catalogue'],
    ['dicter rapport', 'Demarre la dictee du rapport'],
    ['saisir adresse', 'Demarre la saisie vocale d adresse'],
    ['parametres', 'Ouvre les parametres'],
    ['que puis-je dire', 'Affiche cette aide'],
    ['ouvrir chat equipe', 'Ouvre le chat equipe'],
  ],
  it: [
    ['ordini di oggi', 'Apre gli interventi di oggi'],
    ['mostra tutti gli ordini', 'Apre la lista ordini'],
    ['cerca cliente mueller', 'Avvia la ricerca cliente'],
    ['nuovo ordine', 'Avvia la creazione ordine'],
    ['mostra dashboard', 'Apre la dashboard'],
    ['apri assistente ia', 'Apre l assistente'],
    ['le mie attivita', 'Apre le attivita'],
    ['mostra calendario', 'Apre la pianificazione'],
    ['lista clienti', 'Apre i clienti CRM'],
    ['contabilita', 'Apre finanze'],
    ['i miei interventi', 'Apre gli ordini sul campo'],
    ['notifiche', 'Apre le notifiche'],
    ['stato completato', 'Aggiorna lo stato dopo conferma'],
    ['mostra progetti', 'Apre i progetti'],
    ['catalogo materiali', 'Apre il catalogo'],
    ['detta rapporto', 'Avvia la dettatura del rapporto'],
    ['inserisci indirizzo', 'Avvia l inserimento vocale indirizzo'],
    ['impostazioni', 'Apre le impostazioni'],
    ['cosa posso dire', 'Mostra questa guida'],
    ['apri chat team', 'Apre la chat del team'],
  ],
  en: [
    ['today orders', 'Opens today field assignments'],
    ['show all orders', 'Opens the order list'],
    ['search customer mueller', 'Starts customer search'],
    ['create company muster ltd owner max muster uid che-123.456.789', 'Creates a company with owner and UID'],
    ['new order', 'Starts order creation'],
    ['show dashboard', 'Opens the dashboard'],
    ['open ai assistant', 'Opens the assistant'],
    ['my tasks', 'Opens tasks'],
    ['show calendar', 'Opens scheduling'],
    ['customer list', 'Opens CRM customers'],
    ['open accounting', 'Opens finance'],
    ['my field jobs', 'Opens field orders'],
    ['notifications', 'Opens notifications'],
    ['mark status complete', 'Updates the current record after confirmation'],
    ['show projects', 'Opens projects'],
    ['material catalog', 'Opens the catalog'],
    ['dictate report', 'Starts report dictation'],
    ['capture address', 'Starts voice address entry'],
    ['settings', 'Opens settings'],
    ['what can I say', 'Shows this help'],
    ['open team chat', 'Opens team chat'],
  ],
};

export function AiHelpOverlay({ onClose }) {
  const { locale, t } = useLanguage();
  const commands = HELP_COMMANDS[locale] ?? HELP_COMMANDS.en;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-background border shadow-xl p-5 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <p className="font-semibold text-sm">{t('ai.panel.helpTrigger')}</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="grid gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {commands.map(([trigger, result]) => (
            <li key={trigger} className="flex flex-col gap-0.5 rounded-md border border-border/60 p-2.5">
              <span className="text-sm font-medium">&quot;{trigger}&quot;</span>
              <span className="text-xs text-muted-foreground">{result}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
