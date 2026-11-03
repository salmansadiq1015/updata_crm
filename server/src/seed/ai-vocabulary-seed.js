import CustomVocabulary from '../modules/ai/customVocabulary.model.js';
import logger from '../shared/logger/index.js';

const BRANDS = [
  'Viessmann', 'Vaillant', 'Buderus', 'Wolf', 'Bosch', 'Junkers', 'Remeha', 'Weishaupt',
  'Hoval', 'Stiebel Eltron', 'Daikin', 'Mitsubishi', 'Panasonic', 'LG', 'Samsung',
  'Geberit', 'Grohe', 'Hansgrohe', 'KWC', 'Franke', 'Blanco', 'Siemens', 'ABB',
  'Grundfos', 'Wilo', 'KSB', 'Oventrop', 'Danfoss', 'Belimo', 'Sauter', 'Siemens',
];

const EQUIPMENT = [
  'Vitodens', 'Vitocal', 'Vitocharge', 'Vitorond', 'ecoTEC', 'ecoFIT', 'aroTHERM',
  'aroSTOR', 'Logamax', 'Logano', 'Brennwertkessel', 'Niedertemperaturkessel',
  'Pelletkessel', 'Wärmepumpe', 'Luft-Wasser-Wärmepumpe', 'Sole-Wasser-Wärmepumpe',
  'Brennstoffzelle', 'Solaranlage', 'Pufferspeicher', 'Frischwassermodul',
  'Heizkreisverteiler', 'Bodenheizung', 'Radiator', 'Konvektor', 'Lüftungsgerät',
  'Kompaktgerät', 'Entfeuchter', 'Klimaanlage', 'Splitgerät', 'Multisplit',
  'Kältemaschine', 'Rückkühler', 'Abgasanlage', 'Schornstein', 'Abgasklappe',
  'Expansiongefäss', 'Sicherheitsventil', 'Mischventil', 'Regelventil',
  'Umwälzpumpe', 'Zirkulationspumpe', 'Entlüfter', 'Schlammabscheider',
  'Magnetitabscheider', 'Enthärtungsanlage', 'Osmoseanlage', 'Trinkwasserfilter',
  'Boiler', 'Warmwasserspeicher', 'Durchlauferhitzer', 'Plattenwärmetauscher',
];

const PARTS = [
  'Brenner', 'Gebläse', 'Zündelektrode', 'Ionisationselektrode', 'Flammwächter',
  'Düse', 'Ölpumpe', 'Gasventil', 'Magnetventil', 'Druckwächter', 'Temperaturfühler',
  'Raumthermostat', 'Aussentemperaturfühler', 'Vorlauffühler', 'Rücklauffühler',
  'Speicherfühler', 'Regelung', 'Steuerplatine', 'Bedienung', 'Display',
  'Dichtung', 'Dichtungssatz', 'O-Ring', 'Membran', 'Ausdehnungsmembran',
  'Kondensatpumpe', 'Kondensatleitung', 'Siphon', 'Rückschlagventil',
  'Kugelhahn', 'Absperrventil', 'Entleerungshahn', 'Manometer', 'Thermometer',
  'Druckminderer', 'Wasserfilter', 'Y-Sieb', 'Rohrschelle', 'Rohrbogen',
  'T-Stück', 'Reduzierung', 'Verschraubung', 'Pressfitting', 'Lötfitting',
  'Isolierung', 'Armaflex', 'Dämmung', 'Kabel', 'Anschlusskabel', 'Sicherung',
];

const ERRORS = [
  'Störung E1', 'Störung E2', 'Störung E3', 'Störung E4', 'Störung E5',
  'Störung E6', 'Störung E7', 'Störung E8', 'Störung E9', 'Störung F0',
  'Störung F1', 'Störung F2', 'Störung F3', 'Störung F4', 'Störung F5',
  'Flammenausfall', 'Zündfehler', 'Überhitzung', 'Unterdruck', 'Überdruck',
  'Durchflussmangel', 'Frostschutz', 'Kondensatablauf verstopft', 'Gebläsefehler',
  'Kommunikationsfehler', 'Sensorfehler', 'Gasdruck zu niedrig', 'Öldruck zu niedrig',
];

const ACTIONS = [
  'gereinigt', 'ersetzt', 'eingestellt', 'entlüftet', 'gespült', 'gedichtet',
  'montiert', 'demontiert', 'kalibriert', 'programmiert', 'gewartet', 'inspiziert',
  'Wartungsvertrag', 'Ersatzteil bestellt', 'Nachkontrolle', 'Funktionstest',
];

function buildTerms() {
  const terms = [];
  const add = (term, category, language = 'de', aliases = []) => {
    terms.push({ term, category, language, aliases, source: 'MANUAL', status: 'ACTIVE' });
  };

  for (const b of BRANDS) add(b, 'BRAND');
  for (const e of EQUIPMENT) add(e, 'EQUIPMENT');
  for (const p of PARTS) add(p, 'PART');
  for (const err of ERRORS) add(err, 'GENERAL');
  for (const a of ACTIONS) add(a, 'GENERAL');

  // Compound HVAC terms
  for (const brand of BRANDS.slice(0, 10)) {
    for (const model of ['200', '300', '100', '050', '111', '222']) {
      add(`${brand} ${model}`, 'EQUIPMENT', 'de', [`${brand}${model}`]);
    }
  }

  for (const part of PARTS.slice(0, 20)) {
    for (const action of ['neu', 'defekt', 'verschlissen']) {
      add(`${part} ${action}`, 'PART');
    }
  }

  // French / Italian / English equivalents for key terms
  const i18n = [
    { term: 'chaudière', category: 'EQUIPMENT', language: 'fr' },
    { term: 'pompe à chaleur', category: 'EQUIPMENT', language: 'fr' },
    { term: 'brûleur', category: 'PART', language: 'fr' },
    { term: 'caldaia', category: 'EQUIPMENT', language: 'it' },
    { term: 'pompa di calore', category: 'EQUIPMENT', language: 'it' },
    { term: 'bruciatore', category: 'PART', language: 'it' },
    { term: 'boiler', category: 'EQUIPMENT', language: 'en' },
    { term: 'heat pump', category: 'EQUIPMENT', language: 'en' },
    { term: 'burner', category: 'PART', language: 'en' },
  ];
  for (const entry of i18n) add(entry.term, entry.category, entry.language);

  // Expand to 500+ HVAC terms via systematic combinations
  const modifiers = ['defekt', 'neu', 'gereinigt', 'ersetzt', 'geprüft', 'eingestellt', 'entlüftet'];
  const systems = ['Heizung', 'Warmwasser', 'Kälte', 'Lüftung', 'Solar', 'Brenner', 'Pumpe', 'Regelung'];
  for (const sys of systems) {
    for (const mod of modifiers) {
      add(`${sys} ${mod}`, 'GENERAL');
    }
  }
  for (let i = 1; i <= 120; i += 1) {
    add(`Fehlercode E${i}`, 'GENERAL');
    add(`Störung F${i}`, 'GENERAL');
  }
  for (const kw of ['Vorlauf', 'Rücklauf', 'Speicher', 'Brennwert', 'Abgas', 'Kondensat', 'Druck', 'Temperatur']) {
    for (const unit of ['Sensor', 'Fühler', 'Ventil', 'Pumpe', 'Schalter', 'Regler']) {
      add(`${kw}${unit}`, 'PART');
      add(`${kw} ${unit}`, 'PART');
    }
  }

  return terms;
}

export async function seedAiVocabulary() {
  const terms = buildTerms();
  // Some source lists overlap (for example Siemens). Deduplicate before an
  // unordered bulk upsert so a fresh database cannot insert the same key twice.
  const uniqueTerms = [...new Map(terms.map((term) => [`${term.language}:${term.term}`, term])).values()];
  const now = new Date();
  const result = await CustomVocabulary.bulkWrite(uniqueTerms.map((term) => ({
    updateOne: {
      filter: { term: term.term, language: term.language, isDeleted: false },
      update: { $setOnInsert: { ...term, createdAt: now, updatedAt: now } },
      upsert: true,
      // Existing vocabulary, including administrator edits, stays untouched.
      timestamps: false,
    },
  })), { ordered: false });
  const created = result.upsertedCount;
  logger.info(`AI vocabulary seed: ${created} new terms (${terms.length} total defined)`, { module: 'seed' });
  return { created, total: terms.length };
}

export default seedAiVocabulary;
