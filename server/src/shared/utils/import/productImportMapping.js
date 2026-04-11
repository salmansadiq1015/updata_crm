// Canonical mapping from German/English headers to internal product fields.
// Keys are normalised (trimmed, case-insensitive comparison applied at runtime).

const SUPPLIERS = [
  "sanitas",
  "troesch",
  "meier",
  "tobler",
  "buderus",
  "other",
  "internal",
];

const UNITS = [
  "piece",
  "meter",
  "liter",
  "kg",
  "set",
  "pair",
  "roll",
  "box",
  "hour",
  "flat_rate",
  "other",
];

export const PRODUCT_IMPORT_HEADER_MAP = {
  // ID (bexio external id)
  id: "externalId",
  "external id": "externalId",

  // Produktart
  produktart: "productType",
  "product type": "productType",

  // Produktcode → SKU
  produktcode: "sku",
  "product code": "sku",
  sku: "sku",

  // Produktname
  produktname: "name",
  "product name": "name",
  name: "name",

  // Produktbeschreibung HTML
  "produktbeschreibung html": "descriptionHtml",
  "product description html": "descriptionHtml",
  "product description (html)": "descriptionHtml",

  // Produktbeschreibung
  produktbeschreibung: "description",
  "product description": "description",
  description: "description",

  // Währung
  "währung": "currency",
  currency: "currency",

  // Einheit
  einheit: "unit",
  unit: "unit",

  // Hauptgruppe
  hauptgruppe: "mainGroup",
  "main group": "mainGroup",

  // Untergruppe
  untergruppe: "subgroup",
  subgroup: "subgroup",

  // Einkaufspreis → costPrice
  einkaufspreis: "costPrice",
  "purchase price": "costPrice",
  "cost price": "costPrice",

  // Verkaufspreis → unitPrice
  verkaufspreis: "unitPrice",
  "sales price": "unitPrice",
  "unit price": "unitPrice",

  // Ertragskonto
  ertragskonto: "revenueAccount",
  "revenue account": "revenueAccount",

  // Aufwandkonto
  aufwandkonto: "expenseAccount",
  "expense account": "expenseAccount",

  // MwSt Umsatzsteuer
  "mwst umsatzsteuer": "vatOutputTax",
  "vat (output tax)": "vatOutputTax",
  "vat output tax": "vatOutputTax",

  // MwSt Vorsteuer
  "mwst vorsteuer": "vatInputTax",
  "vat (input tax)": "vatInputTax",
  "vat input tax": "vatInputTax",

  // Produktcode Lieferant
  "produktcode lieferant": "supplierProductCode",
  "supplier product code": "supplierProductCode",

  // Produktname Lieferant
  "produktname lieferant": "supplierProductName",
  "supplier product name": "supplierProductName",

  // Produktbeschreibung Lieferant
  "produktbeschreibung lieferant": "supplierProductDescription",
  "supplier product description": "supplierProductDescription",

  // Zuschlag in %
  "zuschlag in %": "surchargePercent",
  "surcharge in %": "surchargePercent",
  surcharge: "surchargePercent",

  // Profitmarge in %
  "profitmarge in %": "profitMarginPercent",
  "profit margin in %": "profitMarginPercent",
  "profit margin": "profitMarginPercent",

  // Bemerkungen
  bemerkungen: "notes",
  notes: "notes",
  "notes / remarks": "notes",

  // Produkt mit Lager
  "produkt mit lager": "hasInventory",
  "product with inventory": "hasInventory",

  // Lagerort
  lagerort: "storageLocation",
  "storage location": "storageLocation",

  // Mindestbestand
  mindestbestand: "minimumStock",
  "minimum stock level": "minimumStock",
  "minimum stock": "minimumStock",

  // Lagerplatz
  lagerplatz: "storageBin",
  "storage bin": "storageBin",
  "shelf location": "storageBin",

  // Lagerbestand
  lagerbestand: "currentStock",
  "stock on hand": "currentStock",
  "current stock": "currentStock",

  // Lieferant
  lieferant: "supplier",
  supplier: "supplier",

  // Ansprechpartner
  ansprechpartner: "contactPerson",
  "contact person": "contactPerson",

  // Breite
  breite: "dimensions.width",
  width: "dimensions.width",

  // Höhe
  "höhe": "dimensions.height",
  height: "dimensions.height",

  // Volumen
  volumen: "dimensions.volume",
  volume: "dimensions.volume",

  // Gewicht
  gewicht: "dimensions.weight",
  weight: "dimensions.weight",

  // Staffelpreise
  staffelpreise: "tieredPrices",
  "tiered prices": "tieredPrices",

  // Kategorie
  kategorie: "category",
  category: "category",

  // MwSt / Tax Rate (general)
  "tax rate": "taxRate",
  steuersatz: "taxRate",
};

export const normaliseHeader = (header) =>
  (header || "").trim().toLowerCase();

export const mapHeaderToField = (header) => {
  const norm = normaliseHeader(header);
  // Direct match
  const direct = PRODUCT_IMPORT_HEADER_MAP[norm];
  if (direct) return direct;
  // Try splitting "German / English" bilingual headers
  if (norm.includes("/")) {
    for (const part of norm.split("/")) {
      const match = PRODUCT_IMPORT_HEADER_MAP[part.trim()];
      if (match) return match;
    }
  }
  return null;
};

export const normaliseSupplier = (value) => {
  if (!value) return { supplier: "other", supplierNameFreeText: "" };
  const v = value.toString().trim().toLowerCase();
  if (SUPPLIERS.includes(v)) return { supplier: v, supplierNameFreeText: "" };
  return { supplier: "other", supplierNameFreeText: value.toString().trim() };
};

export const normaliseUnit = (value) => {
  if (!value) return "piece";
  const v = value.toString().trim().toLowerCase();

  // Direct match
  if (UNITS.includes(v)) return v;

  // German → English mappings
  const map = {
    "stück": "piece",
    stk: "piece",
    stck: "piece",
    pcs: "piece",
    meter: "meter",
    m: "meter",
    liter: "liter",
    l: "liter",
    kilogramm: "kg",
    kilogram: "kg",
    satz: "set",
    paar: "pair",
    rolle: "roll",
    karton: "box",
    schachtel: "box",
    stunde: "hour",
    std: "hour",
    h: "hour",
    pauschal: "flat_rate",
    pauschale: "flat_rate",
  };

  return map[v] || "other";
};

export const parseBoolean = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const v = value.toString().trim().toLowerCase();
  if (["ja", "yes", "1", "true", "wahr", "y", "j"].includes(v)) return true;
  if (["nein", "no", "0", "false", "falsch", "n"].includes(v)) return false;
  return null;
};

export const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  let str = value.toString().replace(/'/g, "").replace(/\s/g, "").trim();
  // German format: dots as thousands, comma as decimal (e.g. 1.234,56)
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }
  // Otherwise dots are decimal separators (e.g. 10.50)
  const n = Number(str);
  return isNaN(n) ? null : n;
};

export const parseTieredPrices = (value) => {
  if (!value) return [];
  const str = value.toString().trim();
  if (!str) return [];

  // Expected format: "5:10.00;10:9.50;50:8.00" or "5=10.00,10=9.50"
  const entries = str.split(/[;|]/).map((e) => e.trim()).filter(Boolean);
  const result = [];

  for (const entry of entries) {
    const parts = entry.split(/[:=]/);
    if (parts.length === 2) {
      const fromQuantity = parseNumber(parts[0]);
      const unitPrice = parseNumber(parts[1]);
      if (fromQuantity !== null && unitPrice !== null && fromQuantity >= 1 && unitPrice >= 0) {
        result.push({ fromQuantity, unitPrice });
      }
    }
  }

  return result;
};

export const normaliseCurrency = (value) => {
  if (!value) return "CHF";
  const v = value.toString().trim().toUpperCase();
  if (["CHF", "EUR", "USD"].includes(v)) return v;
  return "CHF";
};

// Template headers for downloadable CSV template (German / English)
export const TEMPLATE_HEADERS = [
  "Produktcode / SKU",
  "Produktname / Product Name",
  "Produktbeschreibung / Description",
  "Kategorie / Category",
  "Einheit / Unit",
  "Verkaufspreis / Sales Price",
  "Einkaufspreis / Cost Price",
  "Währung / Currency",
  "Produktart / Product Type",
  "Produktbeschreibung HTML / Description HTML",
  "Hauptgruppe / Main Group",
  "Untergruppe / Subgroup",
  "Ertragskonto / Revenue Account",
  "Aufwandkonto / Expense Account",
  "MwSt Umsatzsteuer / VAT Output Tax",
  "MwSt Vorsteuer / VAT Input Tax",
  "Produktcode Lieferant / Supplier Product Code",
  "Produktname Lieferant / Supplier Product Name",
  "Produktbeschreibung Lieferant / Supplier Product Description",
  "Lieferant / Supplier",
  "Zuschlag in % / Surcharge %",
  "Profitmarge in % / Profit Margin %",
  "Bemerkungen / Notes",
  "Produkt mit Lager / Has Inventory",
  "Lagerort / Storage Location",
  "Lagerplatz / Storage Bin",
  "Mindestbestand / Minimum Stock",
  "Lagerbestand / Current Stock",
  "Ansprechpartner / Contact Person",
  "Breite / Width",
  "Höhe / Height",
  "Volumen / Volume",
  "Gewicht / Weight",
  "Staffelpreise / Tiered Prices",
];
