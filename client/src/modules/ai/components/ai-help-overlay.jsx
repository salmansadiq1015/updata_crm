'use client';

import { Command, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

const HELP_COMMANDS = {
  de: [
    ['heutige aufträge', 'Öffnet Ihre heutigen Einsätze'],
    ['alle aufträge anzeigen', 'Öffnet die Auftragsliste'],
    ['kunde mueller suchen', 'Startet die Kundensuche'],
    ['firma erstellen muster ag inhaber max muster uid che-123.456.789', 'Erstellt eine Firma mit Inhaber und UID'],
    ['neuer auftrag', 'Startet die Auftragserstellung'],
    ['zeige dashboard', 'Öffnet das Dashboard'],
    ['ki assistent öffnen', 'Öffnet den Assistenten'],
    ['meine aufgaben', 'Öffnet Aufgaben'],
    ['zeige kalender', 'Öffnet die Einsatzplanung'],
    ['kundenliste anzeigen', 'Öffnet CRM Kunden'],
    ['buchhaltung anzeigen', 'Öffnet Finanzen'],
    ['meine einsätze', 'Öffnet Field-Ops Aufträge'],
    ['benachrichtigungen', 'Öffnet Meldungen'],
    ['status erledigt', 'Aktualisiert den aktuellen Datensatz nach Bestätigung'],
    ['zeige projekte', 'Öffnet Projekte'],
    ['materialkatalog', 'Öffnet den Katalog'],
    ['bericht diktieren', 'Startet die Berichtsdiktation'],
    ['adresse erfassen', 'Startet Adresseingabe per Sprache'],
    ['einstellungen', 'Öffnet Einstellungen'],
    ['was kann ich sagen', 'Zeigt diese Hilfe'],
    ['team chat öffnen', 'Öffnet den Team-Chat'],
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-md sm:items-center">
      <div className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a1020] p-5 text-slate-100 shadow-[0_28px_100px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(78,116,219,0.18),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(208,10,25,0.14),transparent_30%)]" />
        <div className="relative z-10 mb-4 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-300/10 text-brand-200 ring-1 ring-brand-200/20">
              <Command className="h-5 w-5" />
            </span>
            <p className="font-semibold text-sm text-white">{t('ai.panel.helpTrigger')}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} title={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="relative z-10 grid gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {commands.map(([trigger, result]) => (
            <li key={trigger} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <span className="text-sm font-semibold text-white">&quot;{trigger}&quot;</span>
              <span className="text-xs leading-5 text-slate-400">{result}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
