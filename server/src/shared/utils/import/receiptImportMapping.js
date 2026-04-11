// Canonical mapping from German/English headers to internal receipt fields.

export const RECEIPT_IMPORT_HEADER_MAP = {
  // Vendor / Lieferant
  lieferant: "vendor",
  vendor: "vendor",
  liefername: "vendor",
  "vendor name": "vendor",
  "supplier": "vendor",

  // Amount / Betrag
  betrag: "amount",
  amount: "amount",
  summe: "amount",
  total: "amount",
  gesamt: "amount",
  verkaufspreis: "amount",
  "sales price": "amount",
  "unit price": "amount",
  einkaufspreis: "amount",
  "purchase price": "amount",

  // Currency / Währung
  "währung": "currency",
  currency: "currency",

  // Receipt Date / Belegdatum
  belegdatum: "receiptDate",
  datum: "receiptDate",
  date: "receiptDate",
  "receipt date": "receiptDate",
  rechnungsdatum: "receiptDate",
  "invoice date": "receiptDate",

  // Category / Kategorie
  kategorie: "category",
  category: "category",
  hauptgruppe: "category",
  "main group": "category",

  // Customer / Kunde
  kunde: "customer",
  customer: "customer",
  kundenname: "customer",
  "customer name": "customer",

  // Order / Auftrag
  auftrag: "order",
  "auftragsnummer": "order",
  order: "order",
  "order number": "order",
  bestellnummer: "order",

  // Product / Produkt
  produkt: "product",
  product: "product",
  produktcode: "product",
  "product code": "product",
  produktname: "product",
  "product name": "product",
  sku: "product",

  // Description / Beschreibung
  beschreibung: "description",
  description: "description",
  produktbeschreibung: "description",
  "product description": "description",

  // Notes / Bemerkungen
  bemerkungen: "notes",
  notes: "notes",
  notizen: "notes",

  // Tax deductible / Steuerlich absetzbar
  "steuerlich absetzbar": "taxDeductible",
  "tax deductible": "taxDeductible",
  absetzbar: "taxDeductible",
};

export const normaliseHeader = (header) =>
  (header || "").trim().toLowerCase();

export const mapHeaderToField = (header) => {
  const norm = normaliseHeader(header);
  // Direct match
  const direct = RECEIPT_IMPORT_HEADER_MAP[norm];
  if (direct) return direct;
  // Try splitting "German / English" bilingual headers
  if (norm.includes("/")) {
    for (const part of norm.split("/")) {
      const match = RECEIPT_IMPORT_HEADER_MAP[part.trim()];
      if (match) return match;
    }
  }
  return null;
};

export const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  let str = value.toString().replace(/'/g, "").replace(/\s/g, "").trim();
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(str);
  return isNaN(n) ? null : n;
};

export const parseDate = (value) => {
  if (!value) return null;
  const str = value.toString().trim();
  if (!str) return null;

  // Try DD.MM.YYYY (German format)
  const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const d = new Date(`${deMatch[3]}-${deMatch[2].padStart(2, "0")}-${deMatch[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }

  // Try YYYY-MM-DD or ISO
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d <= new Date()) return d;
  return null;
};

export const parseBoolean = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const v = value.toString().trim().toLowerCase();
  if (["ja", "yes", "1", "true", "wahr", "y", "j"].includes(v)) return true;
  if (["nein", "no", "0", "false", "falsch", "n"].includes(v)) return false;
  return null;
};

export const normaliseCurrency = (value) => {
  if (!value) return "CHF";
  const v = value.toString().trim().toUpperCase();
  if (["CHF", "EUR", "USD"].includes(v)) return v;
  return "CHF";
};

// Template headers for downloadable CSV template (German / English)
export const TEMPLATE_HEADERS = [
  "Lieferant / Vendor",
  "Betrag / Amount",
  "Währung / Currency",
  "Belegdatum / Receipt Date",
  "Kategorie / Category",
  "Kunde / Customer",
  "Auftragsnummer / Order Number",
  "Produkt / Product",
  "Beschreibung / Description",
  "Bemerkungen / Notes",
  "Steuerlich absetzbar / Tax Deductible",
];
