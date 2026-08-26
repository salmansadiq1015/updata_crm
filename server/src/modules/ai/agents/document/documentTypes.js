/**
 * The one vocabulary of document types, shared by every agent that talks
 * about paperwork.
 *
 * Document AI classifies against it, Behörden AI decides whether a procedure
 * has been filed with it, and Quality AI checks a closing checklist with it.
 * Those three had grown their own term lists, and they had already drifted:
 * Behörden matched a Fördergesuch on the fragment "foerder", which also
 * matches a Förderabschluss — a document filed at the end of a job was being
 * read as one filed at the start.
 *
 * Order matters. The list runs most specific first, and matching stops at the
 * first hit, so "Förderabschluss" can never be mistaken for "Fördergesuch".
 */

/** Categories the project document store accepts. */
export const DOCUMENT_CATEGORIES = Object.freeze(['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER']);

export const DOCUMENT_TYPES = Object.freeze([
  // ─── Authority procedures ────────────────────────────────────
  {
    key: 'FOERDERABSCHLUSS',
    label: 'Förderabschluss',
    terms: ['foerderabschluss', 'foerder-abschluss', 'abschluss foerderung', 'schlussabrechnung foerderung'],
    category: 'CONTRACTS',
  },
  {
    key: 'FOERDERGESUCH',
    label: 'Fördergesuch',
    terms: ['foerdergesuch', 'foerderantrag', 'foerderzusage', 'foerderung', 'foerder'],
    category: 'CONTRACTS',
  },
  {
    key: 'BOHRBEWILLIGUNG',
    label: 'Bohrbewilligung',
    terms: ['bohrbewilligung', 'bohrgesuch', 'sondenbewilligung'],
    category: 'CONTRACTS',
  },
  {
    key: 'BAUMELDUNG',
    label: 'Baumeldung bzw. Baubewilligung',
    terms: ['baumeldung', 'baugesuch', 'baubewilligung', 'bauanzeige'],
    category: 'CONTRACTS',
  },
  {
    key: 'SCHALLSCHUTZ',
    label: 'Schallschutznachweis',
    terms: ['schallschutz', 'schallnachweis', 'laermschutz', 'laermgutachten'],
    category: 'REPORTS',
  },
  {
    key: 'WPSM',
    label: 'WPSM-Einverständniserklärung',
    terms: ['wpsm', 'einverstaendniserklaerung', 'einverstaendnis'],
    category: 'CONTRACTS',
  },

  // ─── Commissioning and handover ──────────────────────────────
  {
    key: 'IBN_PROTOKOLL',
    label: 'IBN-Protokoll',
    terms: ['ibn-protokoll', 'ibn protokoll', 'inbetriebnahmeprotokoll', 'inbetriebnahme', 'ibn'],
    category: 'REPORTS',
  },
  {
    key: 'ABNAHME',
    label: 'Abnahmeprotokoll',
    terms: ['abnahmeprotokoll', 'abnahme', 'uebergabeprotokoll', 'uebergabe'],
    category: 'REPORTS',
  },
  {
    key: 'MESSPROTOKOLL',
    label: 'Messprotokoll',
    terms: ['messprotokoll', 'abgasmessung', 'messbericht', 'feuerungskontrolle'],
    category: 'REPORTS',
  },

  // ─── Plant documentation ─────────────────────────────────────
  {
    key: 'SCHEMA',
    label: 'Anlagenschema',
    terms: ['prinzipschema', 'anlagenschema', 'hydraulikschema', 'schema', 'grundriss', 'plan'],
    category: 'PLANS',
  },
  {
    key: 'GARANTIE',
    label: 'Garantie- und Herstellerunterlagen',
    terms: ['garantieschein', 'garantie', 'herstellerunterlagen', 'bedienungsanleitung', 'betriebsanleitung', 'datenblatt'],
    category: 'CONTRACTS',
  },
  {
    key: 'ENTSORGUNG',
    label: 'Entsorgungsnachweis',
    terms: ['entsorgungsnachweis', 'entsorgung', 'altgeraet', 'recycling'],
    category: 'CONTRACTS',
  },

  // ─── Day-to-day trade paperwork ──────────────────────────────
  {
    key: 'RAPPORT',
    label: 'Rapport',
    terms: ['servicerapport', 'arbeitsrapport', 'rapport', 'servicebericht'],
    category: 'REPORTS',
  },
  {
    key: 'LIEFERSCHEIN',
    label: 'Lieferschein',
    terms: ['lieferschein', 'lieferung', 'wareneingang'],
    category: 'CORRESPONDENCE',
  },
  {
    key: 'RECHNUNG',
    label: 'Rechnung',
    terms: ['rechnung', 'faktura', 'invoice'],
    category: 'CORRESPONDENCE',
    scope: 'accounting',
  },
  {
    key: 'OFFERTE',
    label: 'Offerte',
    terms: ['offerte', 'angebot', 'kostenvoranschlag'],
    category: 'CORRESPONDENCE',
  },
  {
    key: 'VERTRAG',
    label: 'Vertrag',
    terms: ['vertrag', 'wartungsvertrag', 'servicevertrag', 'auftragsbestaetigung'],
    category: 'CONTRACTS',
  },
  {
    key: 'KORRESPONDENZ',
    label: 'Korrespondenz',
    terms: ['schreiben', 'brief', 'mail', 'korrespondenz', 'protokoll besprechung'],
    category: 'CORRESPONDENCE',
  },
  {
    key: 'FOTOS',
    label: 'Fotos',
    // "photo" as well as "foto": on a Swiss site a phone names its files in
    // whatever language it was set up in, and the office keeps that name.
    terms: ['foto', 'photo', 'bild', 'aufnahme', 'baustelle', 'img'],
    category: 'PHOTOS',
  },
]);

const BY_KEY = new Map(DOCUMENT_TYPES.map((type) => [type.key, type]));

export function documentType(key) {
  return BY_KEY.get(key) || null;
}

export function documentTypeLabel(key) {
  return BY_KEY.get(key)?.label || key;
}

/** Folds Swiss and German spellings onto one form so both match one term list. */
export function foldForMatching(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[_\-.]+/g, ' ');
}

/**
 * The first type whose vocabulary appears in the text, or null.
 *
 * Returns the term that matched alongside the type: a classification the
 * office cannot check is not worth approving, and "erkannt an Bohrbewilligung"
 * is checkable in a way that "erkannt" is not.
 *
 * `only` narrows the search to a set of keys — Quality AI asks about the types
 * its checklist expects, not about every type that exists.
 */
export function matchDocumentType(text, { only = null } = {}) {
  const haystack = foldForMatching(text);
  if (!haystack.trim()) return null;
  for (const type of DOCUMENT_TYPES) {
    if (only && !only.includes(type.key)) continue;
    const matched = type.terms.find((term) => haystack.includes(foldForMatching(term)));
    if (matched) return { ...type, matchedTerm: matched };
  }
  return null;
}

/**
 * Images are recognised by what they are, not by what somebody named them.
 *
 * The extension matters more than the MIME type here: project documents do
 * not store one, so "scan.png" arrives with nothing but its name.
 */
export const IMAGE_MIME = /^image\//i;
const IMAGE_EXTENSION = /\.(jpe?g|png|gif|heic|heif|webp|bmp|tiff?)$/i;

export function looksLikeImage({ fileName = '', mimeType = '' } = {}) {
  return IMAGE_MIME.test(mimeType) || IMAGE_EXTENSION.test(fileName);
}
