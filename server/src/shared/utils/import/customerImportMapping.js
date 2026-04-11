// Legacy file — not used by current module architecture.
// Original import path no longer exists.
const CUSTOMER_LANGUAGES = ['DE', 'FR', 'IT', 'EN'];
const CORRESPONDENCE_WAYS = ['EMAIL', 'POST', 'PHONE'];

// Canonical mapping from German/English headers to internal customer fields
// Keys are normalised (trimmed, case-insensitive comparison is applied at runtime).
export const CUSTOMER_IMPORT_HEADER_MAP = {
  // Kontakt Nr.
  "kontakt nr.": "contactNumber",
  "contact no.": "contactNumber",
  "contact no": "contactNumber",
  "contact number": "contactNumber",

  // Kontaktart
  "kontaktart": "contactType",
  "contact type": "contactType",

  // Kontaktart Beschreibung
  "kontaktart beschreibung": "contactTypeDescription",
  "contact type description": "contactTypeDescription",

  // Firma
  firma: "companyName",
  company: "companyName",

  // Firmennamen-Zusatz
  "firmennamen-zusatz": "companyNameSuffix",
  "company name suffix": "companyNameSuffix",
  "company name addition": "companyNameSuffix",

  // Nachname
  nachname: "lastName",
  "last name": "lastName",

  // Vorname
  vorname: "firstName",
  "first name": "firstName",

  // Kontakt Nr. der verknüpften Firma
  "kontakt nr. der verknüpften firma": "linkedCompanyContactNumber",
  "contact no. of linked company": "linkedCompanyContactNumber",

  // Name der verknüpften Firma
  "name der verknüpften firma": "linkedCompanyName",
  "name of linked company": "linkedCompanyName",

  // Verknüpfungsinformation
  verknüpfungsinformation: "linkInformation",
  "link information": "linkInformation",
  "relationship info": "linkInformation",

  // Anrede
  anrede: "salutation",
  salutation: "salutation",

  // Titel
  titel: "title",
  title: "title",

  // Geburtstag
  geburtstag: "dateOfBirth",
  "date of birth": "dateOfBirth",
  birthday: "dateOfBirth",

  // Adresse (free text) - mapped into addressLine2
  adresse: "addressLine2",
  address: "addressLine2",

  // Strasse
  strasse: "address.street",
  street: "address.street",

  // Haus-Nr.
  "haus-nr.": "address.streetNumber",
  "haus-nr": "address.streetNumber",
  "house no.": "address.streetNumber",
  "house no": "address.streetNumber",

  // Adresszusatz
  adresszusatz: "addressLine2",
  "address line 2": "addressLine2",
  "address addition": "addressLine2",

  // PLZ
  plz: "address.zip",
  "postal code": "address.zip",
  zipcode: "address.zip",

  // Ort
  ort: "address.city",
  city: "address.city",

  // Land
  land: "address.country",
  country: "address.country",

  // E-Mail
  "e-mail": "email",
  email: "email",

  // E-Mail 2
  "e-mail 2": "email2",
  "email 2": "email2",
  "secondary email": "email2",

  // Telefon
  telefon: "phone",
  phone: "phone",

  // Telefon 2
  "telefon 2": "phone2",
  "phone 2": "phone2",

  // Mobile
  mobile: "mobile",
  "cell phone": "mobile",

  // Fax
  fax: "fax",

  // Website
  website: "website",
  "web site": "website",

  // Skype
  skype: "skype",

  // Sprache
  sprache: "language",
  language: "language",

  // Korrespondenzweg
  korrespondenzweg: "correspondenceWay",
  "preferred communication method": "correspondenceWay",

  // Ansprechpartner
  ansprechpartner: "companyContactPerson",
  "contact person": "companyContactPerson",

  // MWST-Nummer
  "mwst-nummer": "vatNumber",
  "vat number": "vatNumber",

  // Anzahl Mitarbeitende
  "anzahl mitarbeitende": "numberOfEmployees",
  "number of employees": "numberOfEmployees",

  // Handelsregister-Nr.
  "handelsregister-nr.": "commercialRegisterNumber",
  "handelsregister-nr": "commercialRegisterNumber",
  "commercial register no.": "commercialRegisterNumber",

  // Umsatzsteuer-Identifikationsnummer
  "umsatzsteuer-identifikationsnummer": "vatIdentificationNumber",
  "vat identification number": "vatIdentificationNumber",

  // Kategorie
  kategorie: "category",
  category: "category",

  // Branche
  branche: "industry",
  industry: "industry",

  // Bemerkungen
  bemerkungen: "notes",
  "notes / remarks": "notes",
};

export const normaliseHeader = (header) =>
  (header || "").trim().toLowerCase();

export const mapHeaderToField = (header) =>
  CUSTOMER_IMPORT_HEADER_MAP[normaliseHeader(header)] || null;

export const normaliseLanguage = (value) => {
  if (!value) return "de";
  const v = value.toString().trim().toLowerCase();
  if (["de", "deutsch", "german"].includes(v)) return "de";
  if (["en", "english", "englisch"].includes(v)) return "en";
  if (["fr", "französisch", "french"].includes(v)) return "fr";
  if (["it", "italienisch", "italian"].includes(v)) return "it";
  return CUSTOMER_LANGUAGES.includes(v) ? v : "other";
};

export const normaliseCorrespondenceWay = (value) => {
  if (!value) return "email";
  const v = value.toString().trim().toLowerCase();
  if (v.includes("mail")) return "email";
  if (v.includes("telefon") || v.includes("phone")) return "phone";
  if (v.includes("post")) return "mail";
  if (v.includes("sms")) return "sms";
  if (v.includes("portal")) return "portal";
  return CORRESPONDENCE_WAYS.includes(v) ? v : "other";
};

export const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(
    value
      .toString()
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
  return isNaN(n) ? null : n;
};

