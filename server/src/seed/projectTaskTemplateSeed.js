/**
 * Standard task checklists opened with a project.
 *
 * The geothermal template reproduces the nine tasks the client listed in the
 * 09.05.2026 specification for an Erdsonden-Wärmepumpe. The others follow the
 * same twelve task types the document enumerates, trimmed to what each job
 * actually needs.
 */
import ProjectTaskTemplate from '../modules/pm/projectTaskTemplate.model.js';
import logger from '../shared/logger/index.js';

const TEMPLATES = [
  {
    key: 'ERDSONDEN_WP',
    name: 'Erdsonden-Wärmepumpe',
    description: 'Sole-Wasser-Wärmepumpe mit Erdsonde — bewilligungspflichtig, Baustart erst nach Bohrbewilligung.',
    projectType: 'NEW_INSTALLATION',
    priority: 10,
    matchTerms: ['erdsonde', 'erdsonden-wärmepumpe', 'sole-wasser', 'sole-wasser-wärmepumpe', 'geothermie', 'erdwärme', 'bohrung'],
    tasks: [
      { title: 'Bohrbewilligung einholen', description: 'Kantonale Bohrbewilligung beantragen. Ohne Bewilligung kein Baustart.', offsetDays: 0, priority: 'URGENT', handoffTo: 'BEHOERDEN', blocksStart: true },
      { title: 'Fördergesuch einreichen', description: 'Fördergesuch beim Kanton vorbereiten und zur Freigabe vorlegen.', offsetDays: 2, priority: 'HIGH', handoffTo: 'BEHOERDEN' },
      { title: 'WPSM-Einverständniserklärung', description: 'WPSM-Unterlagen vorbereiten und unterzeichnen lassen.', offsetDays: 3, priority: 'HIGH', handoffTo: 'BEHOERDEN' },
      { title: 'Material bestellen', description: 'Wärmepumpe, Speicher und Zubehör bestellen; Liefertermine festhalten.', offsetDays: 5, priority: 'HIGH', handoffTo: 'MATERIAL' },
      { title: 'Bohrtermin vereinbaren', description: 'Termin mit dem Bohrunternehmen abstimmen — erst nach vorliegender Bewilligung.', offsetDays: 10, priority: 'HIGH', handoffTo: 'DISPO' },
      { title: 'Nachbarschaft informieren', description: 'Anwohner über Bohrarbeiten, Dauer und Lärm informieren (Entwurf zur Freigabe).', offsetDays: 12, priority: 'MEDIUM', handoffTo: 'CUSTOMER' },
      { title: 'Baustellen-Terminplan erstellen', description: 'Ablauf mit Monteuren und Partnerfirmen abstimmen.', offsetDays: 14, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'IBN-Termin planen', description: 'Inbetriebnahme mit Kunde und Lieferant terminieren, IBN-Protokoll vorbereiten.', offsetDays: 30, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'Förderabschluss einreichen', description: 'Nach IBN den Förderabschluss mit Bankverbindung des Kunden einreichen.', offsetDays: 45, priority: 'MEDIUM', handoffTo: 'BEHOERDEN' },
    ],
  },
  {
    key: 'LUFT_WASSER_WP',
    name: 'Luft-Wasser-Wärmepumpe',
    description: 'Aussenaufgestellte Luft-Wasser-Wärmepumpe — Baumeldung, Schallschutz, Fördergelder.',
    projectType: 'NEW_INSTALLATION',
    priority: 20,
    matchTerms: ['luft-wasser-wärmepumpe', 'luft-wasser', 'lw-wp', 'wärmepumpe', 'heizungsersatz'],
    tasks: [
      { title: 'Baumeldung einreichen', description: 'Baumeldung bzw. Baugesuch je nach Gemeinde vorbereiten.', offsetDays: 0, priority: 'HIGH', handoffTo: 'BEHOERDEN', blocksStart: true },
      { title: 'Fördergesuch einreichen', description: 'Fördergesuch beim Kanton vorbereiten und zur Freigabe vorlegen.', offsetDays: 2, priority: 'HIGH', handoffTo: 'BEHOERDEN' },
      { title: 'Schallschutznachweis prüfen', description: 'Aufstellort und Abstand zur Nachbarschaft beurteilen.', offsetDays: 3, priority: 'HIGH', blocksStart: true },
      { title: 'Material bestellen', description: 'Wärmepumpe, Speicher und Zubehör bestellen.', offsetDays: 5, priority: 'HIGH', handoffTo: 'MATERIAL' },
      { title: 'Monteure einplanen', description: 'Einsatz mit qualifizierten Monteuren planen.', offsetDays: 10, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'Kunde über Starttermin informieren', description: 'Startinformation an den Kunden (Entwurf zur Freigabe).', offsetDays: 12, priority: 'MEDIUM', handoffTo: 'CUSTOMER' },
      { title: 'IBN-Termin planen', description: 'Inbetriebnahme terminieren und IBN-Protokoll vorbereiten.', offsetDays: 25, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'Förderabschluss einreichen', description: 'Nach IBN den Förderabschluss einreichen.', offsetDays: 40, priority: 'MEDIUM', handoffTo: 'BEHOERDEN' },
    ],
  },
  {
    key: 'BOILER_SPEICHER',
    name: 'Boiler- oder Speicherersatz',
    description: 'Ersatz von Boiler oder Hygienespeicher — kein Bewilligungsverfahren.',
    projectType: 'RENOVATION',
    priority: 30,
    matchTerms: ['boiler', 'hygienespeicher', 'speicher', 'wassererwärmer'],
    tasks: [
      { title: 'Material bestellen', description: 'Boiler bzw. Speicher und Anschlussmaterial bestellen.', offsetDays: 0, priority: 'HIGH', handoffTo: 'MATERIAL' },
      { title: 'Montagetermin vereinbaren', description: 'Termin mit dem Kunden abstimmen.', offsetDays: 3, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'Demontage und Entsorgung planen', description: 'Entsorgung des Altgeräts organisieren.', offsetDays: 5, priority: 'LOW' },
      { title: 'Dokumentation abschliessen', description: 'Rapport, Fotos und Garantieunterlagen ablegen.', offsetDays: 12, priority: 'LOW', handoffTo: 'QUALITY' },
    ],
  },
  {
    key: 'STANDARD',
    name: 'Standardprojekt',
    description: 'Grundcheckliste, wenn kein spezifischer Anlagetyp erkannt wurde.',
    projectType: 'NEW_INSTALLATION',
    priority: 900,
    isFallback: true,
    matchTerms: [],
    tasks: [
      { title: 'Projektunterlagen prüfen', description: 'Offerte, Objektdaten und Kundenangaben auf Vollständigkeit prüfen.', offsetDays: 0, priority: 'MEDIUM' },
      { title: 'Bewilligungsbedarf klären', description: 'Prüfen, ob Baumeldung, Baugesuch oder Bewilligung nötig ist.', offsetDays: 1, priority: 'HIGH', handoffTo: 'BEHOERDEN', blocksStart: true },
      { title: 'Material bestellen', description: 'Materialbedarf ermitteln und bestellen.', offsetDays: 3, priority: 'HIGH', handoffTo: 'MATERIAL' },
      { title: 'Monteure einplanen', description: 'Einsatz planen und Termin mit dem Kunden abstimmen.', offsetDays: 7, priority: 'MEDIUM', handoffTo: 'DISPO' },
      { title: 'Kunde über Starttermin informieren', description: 'Startinformation an den Kunden (Entwurf zur Freigabe).', offsetDays: 9, priority: 'MEDIUM', handoffTo: 'CUSTOMER' },
      { title: 'Abschlussdokumentation prüfen', description: 'Rapporte, Fotos und Unterlagen auf Vollständigkeit prüfen.', offsetDays: 25, priority: 'MEDIUM', handoffTo: 'QUALITY' },
    ],
  },
];

export async function seedProjectTaskTemplates() {
  let created = 0;
  for (const template of TEMPLATES) {
    const result = await ProjectTaskTemplate.updateOne(
      { key: template.key },
      {
        $set: {
          name: template.name,
          description: template.description,
          projectType: template.projectType,
          priority: template.priority,
          matchTerms: template.matchTerms,
          isFallback: Boolean(template.isFallback),
          tasks: template.tasks,
        },
        $setOnInsert: { isActive: true, isDeleted: false },
      },
      { upsert: true },
    );
    if (result?.upsertedCount) created += 1;
  }

  if (created) {
    logger.info('Project task templates seeded', {
      module: 'seed', action: 'projectTaskTemplates', created, total: TEMPLATES.length,
    });
  }
  return { created, total: TEMPLATES.length };
}

export default seedProjectTaskTemplates;
