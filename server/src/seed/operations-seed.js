import logger from '../shared/logger/index.js';

/**
 * Working content the office needs on day one: the text blocks used in offers,
 * the catalogue of standard works, and the categories office hours are booked
 * against.
 *
 * This runs on every boot, like the permission and department seeds, so a
 * fresh production database opens on filled screens rather than empty ones.
 * Every entry is matched by its name: an item the customer has edited or
 * deleted is never recreated or overwritten.
 */

// Wording supplied by the customer for the introduction of an offer, in the
// polite and the familiar form, plus the cantonal subsidy notices.
const TEXT_BLOCKS = [
  {
    title: 'Einleitung Offerte (Sie-Form)',
    bodyHtml: '<p>Gemäss unserer netten Besichtigung entnehmen Sie folgend unsere Offerte. '
      + 'Es würde uns ausserordentlich freuen, wenn wir für Sie diese Arbeiten ausführen dürften. '
      + 'Ein Anliegen unserer Firma ist es, unsere Kundschaft zur vollen Zufriedenheit zu bedienen. '
      + 'Nach Überprüfung unserer Offerte stehen wir Ihnen selbstverständlich für weitere Fragen und '
      + 'Anliegen zur Verfügung. Ihrem Auftrag sehen wir mit grossem Interesse entgegen.</p>',
  },
  {
    title: 'Einleitung Offerte (Du-Form)',
    bodyHtml: '<p>Gemäss unserer netten Besichtigung findest Du nachfolgend unsere Offerte. '
      + 'Es würde uns ausserordentlich freuen, wenn wir diese Arbeiten für Dich ausführen dürften. '
      + 'Nach Überprüfung unserer Offerte stehen wir Dir selbstverständlich für weitere Fragen und '
      + 'Anliegen zur Verfügung. Deinem Auftrag sehen wir mit grossem Interesse entgegen.</p>',
  },
  {
    title: 'Fördergelder Basel-Land',
    bodyHtml: '<p><strong>Fördergelder Basel-Land</strong></p>'
      + '<p><strong>Standard</strong><br>Für Luft-Wasser-Wärmepumpen gibt es 5\'000 - 200.- / kWth Fr. Fördergelder.</p>'
      + '<p><strong>Neu: Energieprämie Basel-Land</strong><br>Für Eigentümer mit &lt;150\'000.00 Fr. steuerbarem '
      + 'Einkommen und &lt;350\'000.00 Fr. steuerbarem Vermögen werden zusätzlich 20% der Investition in die '
      + 'neue Heizung bezahlt!</p>'
      + '<p><strong>Damit sind Förderungen von 17\'000.00 - 25\'000.00 Fr. möglich!</strong></p>',
  },
  {
    title: 'Fördergelder Basel-Stadt',
    bodyHtml: '<p><strong>Fördergelder Basel-Stadt</strong></p>'
      + '<p>Für Luft-Wasser-Wärmepumpen gibt es 9\'500.00 - 11\'500.00 Fr. Fördergelder.<br>'
      + 'Für Erdsonden-Wärmepumpen gibt es mindestens 30\'000.00 Fr. Fördergelder.<br>'
      + 'Jedoch maximal 40% der Investitionskosten.</p>',
  },
  {
    title: 'Fördergelder Solothurn',
    bodyHtml: '<p><strong>Fördergelder Kanton Solothurn</strong></p>'
      + '<p>Analog Basel-Land / Basel-Stadt — die aktuellen Beträge bitte ergänzen.</p>',
  },
];

/**
 * Standard works and their usual duration, taken from the customer's own
 * "sanitaer_service_arbeiten" list. Durations are stored in minutes so that
 * both 1.5 h and 45 min stay exact.
 *
 * "Brenner-Revision Ölheizung" is deliberately absent: the customer's list
 * leaves its duration open, and a work proposing zero minutes would be worse
 * than no entry at all.
 */
const WORK_TYPES = [
  { name: 'Waschtisch ersetzen', hours: 1.5, note: 'Muss zuerst bestellt werden' },
  { name: 'WC ersetzen UP', hours: 1.5, note: 'Unterputz Spülkasten. Muss zuerst bestellt werden' },
  { name: 'WC ersetzen AP', hours: 2.5, note: 'Aufputz Spülkasten. Muss zuerst bestellt werden' },
  { name: 'AP-Spülkasten ersetzen', hours: 1, note: 'Aufputz Spülkasten. Muss zuerst bestellt werden' },
  { name: 'Armatur austauschen Waschtisch', hours: 0.75 },
  { name: 'Armatur austauschen Küche', hours: 1 },
  { name: 'Siphon reinigen / ersetzen', hours: 1, note: '0.5 - 1 h je nach Aufwand' },
  { name: 'Boiler entkalken <300L', hours: 1.5 },
  { name: 'Boiler entkalken >300L', hours: 2 },
  { name: 'Verstopfte Abwasserleitung leicht', hours: 0.75 },
  { name: 'Verstopfte Abwasserleitung schwer', hours: 2 },
  { name: 'WC Service klein', hours: 0.5, note: 'Füllventil + HKD ersetzen' },
  { name: 'WC Service Gross', hours: 1, note: 'Füllventil + HKD ersetzen und entkalken' },
  { name: 'Oberteil ersetzen EFH', hours: 0.75 },
  { name: 'Oberteil ersetzen MFH', hours: 1 },
  { name: 'Dusch WC', hours: 1, note: 'Offerte / Beratung' },
  { name: 'Thermostat ersetzen', hours: 0.75 },
];

const OFFICE_WORK_CATEGORIES = [
  'Administration',
  'Sitzungen',
  'Weiterbildung',
  'Interne Arbeiten',
];

export async function seedOperations(adminUserId) {
  if (!adminUserId) {
    logger.warn('No admin user available — skipping operations seed', { module: 'seed' });
    return;
  }

  const [{ default: TextBlock }, { default: WorkType }, { default: OfficeWorkCategory }] = await Promise.all([
    import('../modules/catalog/textBlock.model.js'),
    import('../modules/deploy/workType.model.js'),
    import('../modules/mobile/officeWorkCategory.model.js'),
  ]);

  // Upsert rather than check-then-create: two server instances booting at the
  // same time would both find nothing and both insert, which is exactly how
  // duplicates appear. $setOnInsert also guarantees an entry the customer has
  // since edited is left untouched.
  const upsert = async (Model, filter, doc) => {
    const res = await Model.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
    return Boolean(res?.upsertedCount);
  };

  let created = 0;

  for (const block of TEXT_BLOCKS) {
    if (await upsert(TextBlock, { title: block.title }, {
      ...block, status: 'ACTIVE', createdBy: adminUserId,
    })) created += 1;
  }

  for (const [index, work] of WORK_TYPES.entries()) {
    if (await upsert(WorkType, { name: work.name }, {
      name: work.name,
      standardDurationMin: Math.round(work.hours * 60),
      description: work.note || null,
      sortOrder: index,
      isActive: true,
      createdBy: adminUserId,
    })) created += 1;
  }

  for (const [index, name] of OFFICE_WORK_CATEGORIES.entries()) {
    if (await upsert(OfficeWorkCategory, { name }, { name, sortOrder: index, isActive: true })) created += 1;
  }

  logger.info(`Operations seed complete: ${created} new entries`, {
    module: 'seed',
    action: 'operations',
    textBlocks: TEXT_BLOCKS.length,
    workTypes: WORK_TYPES.length,
    officeCategories: OFFICE_WORK_CATEGORIES.length,
  });
}

export default seedOperations;
