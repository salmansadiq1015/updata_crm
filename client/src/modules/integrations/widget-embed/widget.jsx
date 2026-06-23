'use client';

import { useState, useEffect, useCallback } from 'react';

import { widgetPublicService } from '@/modules/integrations/services/widget-service';

// CRM-014 AC-4: Sanitär category added (value 'sanitaer'). Existing kept.
const REQUEST_TYPES = [
  { key: 'heizungsstoerung', label: 'Heizungsstörung' },
  { key: 'wartung', label: 'Wartung' },
  { key: 'neuinstallation', label: 'Neuinstallation' },
  { key: 'beratung', label: 'Beratung' },
  { key: 'sanitaer', label: 'Sanitär' },
  { key: 'other', label: 'Sonstiges' },
];

// CRM-014 AC-5: priority selector. Mittel is the default.
const PRIORITIES = [
  { key: 'niedrig', label: 'Niedrig' },
  { key: 'mittel', label: 'Mittel' },
  { key: 'hoch', label: 'Hoch' },
];

// CRM-014 AC-15: UI string translations for the labels/controls owned here.
// Strings not present for a locale fall back to the German ('de') value.
const LOCALES = ['de', 'fr', 'it', 'en'];

const LOCALE_NAMES = { de: 'DE', fr: 'FR', it: 'IT', en: 'EN' };

const UI_STRINGS = {
  de: {
    title: 'Kontaktformular',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    company: 'Firma',
    address: 'Adresse',
    street: 'Strasse',
    zip: 'PLZ',
    city: 'Ort',
    requestType: 'Anliegen',
    preferredWindow: 'Wunschtermin',
    photoUpload: 'Foto',
    priority: 'Priorität',
    description: 'Nachricht',
    selectPlaceholder: 'Bitte wählen...',
    namePlaceholder: 'Max Mustermann',
    emailPlaceholder: 'max@beispiel.ch',
    phonePlaceholder: '+41 79 123 45 67',
    companyPlaceholder: 'Firmenname (optional)',
    streetPlaceholder: 'Bahnhofstrasse 1',
    zipPlaceholder: '8001',
    cityPlaceholder: 'Zuerich',
    preferredWindowPlaceholder: 'z.B. Montag Vormittag',
    descriptionPlaceholder: 'Beschreiben Sie Ihr Anliegen...',
    photoHelp: 'JPEG oder PNG bis 10 MB',
    submit: 'Anfrage senden',
    submitting: 'Wird gesendet...',
    required: 'Pflichtfeld',
    invalidEmail: 'Ungültige E-Mail-Adresse',
    contactRequired: 'Bitte E-Mail oder Telefon angeben',
    configError: 'Widget-Konfiguration konnte nicht geladen werden.',
    thankYou: 'Vielen Dank!',
    confirmation: 'Vielen Dank! Wir melden uns bei Ihnen.',
    submitError: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    invalidFileType: 'Bitte JPEG oder PNG hochladen',
    fileTooLarge: 'Die Datei ist zu gross',
    photoUploadFailed: 'Die Anfrage wurde gespeichert, aber das Foto konnte nicht hochgeladen werden.',
    retry: 'Erneut versuchen',
  },
  fr: {
    title: 'Formulaire de contact',
    name: 'Nom',
    email: 'E-mail',
    phone: 'Téléphone',
    company: 'Entreprise',
    address: 'Adresse',
    street: 'Rue',
    zip: 'NPA',
    city: 'Lieu',
    requestType: 'Demande',
    preferredWindow: 'Creneau souhaite',
    photoUpload: 'Photo',
    priority: 'Priorité',
    description: 'Message',
    selectPlaceholder: 'Veuillez choisir...',
    namePlaceholder: 'Jean Dupont',
    emailPlaceholder: 'jean@exemple.ch',
    phonePlaceholder: '+41 79 123 45 67',
    companyPlaceholder: "Nom de l'entreprise (facultatif)",
    streetPlaceholder: 'Rue 1',
    zipPlaceholder: '8001',
    cityPlaceholder: 'Zurich',
    preferredWindowPlaceholder: 'p.ex. lundi matin',
    descriptionPlaceholder: 'Décrivez votre demande...',
    submit: 'Envoyer la demande',
    submitting: 'Envoi en cours...',
    required: 'Champ obligatoire',
    invalidEmail: 'Adresse e-mail invalide',
    contactRequired: 'Veuillez indiquer un e-mail ou un téléphone',
    configError: 'La configuration du widget n’a pas pu être chargée.',
    thankYou: 'Merci !',
    confirmation: 'Merci ! Nous vous recontacterons.',
    submitError: 'Une erreur est survenue. Veuillez réessayer.',
    retry: 'Réessayer',
  },
  it: {
    title: 'Modulo di contatto',
    name: 'Nome',
    email: 'E-mail',
    phone: 'Telefono',
    company: 'Azienda',
    address: 'Indirizzo',
    street: 'Via',
    zip: 'CAP',
    city: 'Luogo',
    requestType: 'Richiesta',
    preferredWindow: 'Finestra preferita',
    photoUpload: 'Foto',
    priority: 'Priorità',
    description: 'Messaggio',
    selectPlaceholder: 'Si prega di scegliere...',
    namePlaceholder: 'Mario Rossi',
    emailPlaceholder: 'mario@esempio.ch',
    phonePlaceholder: '+41 79 123 45 67',
    companyPlaceholder: "Nome dell'azienda (facoltativo)",
    streetPlaceholder: 'Via 1',
    zipPlaceholder: '8001',
    cityPlaceholder: 'Zurigo',
    preferredWindowPlaceholder: 'es. lunedi mattina',
    descriptionPlaceholder: 'Descriva la sua richiesta...',
    submit: 'Invia richiesta',
    submitting: 'Invio in corso...',
    required: 'Campo obbligatorio',
    invalidEmail: 'Indirizzo e-mail non valido',
    contactRequired: 'Si prega di indicare e-mail o telefono',
    configError: 'Impossibile caricare la configurazione del widget.',
    thankYou: 'Grazie!',
    confirmation: 'Grazie! La ricontatteremo.',
    submitError: 'Si è verificato un errore. Si prega di riprovare.',
    retry: 'Riprova',
  },
  en: {
    title: 'Contact form',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    address: 'Address',
    street: 'Street',
    zip: 'Postal code',
    city: 'City',
    requestType: 'Request',
    preferredWindow: 'Preferred time',
    photoUpload: 'Photo',
    priority: 'Priority',
    description: 'Message',
    selectPlaceholder: 'Please select...',
    namePlaceholder: 'John Doe',
    emailPlaceholder: 'john@example.ch',
    phonePlaceholder: '+41 79 123 45 67',
    companyPlaceholder: 'Company name (optional)',
    streetPlaceholder: 'Main Street 1',
    zipPlaceholder: '8001',
    cityPlaceholder: 'Zurich',
    preferredWindowPlaceholder: 'e.g. Monday morning',
    descriptionPlaceholder: 'Describe your request...',
    submit: 'Send request',
    submitting: 'Sending...',
    required: 'Required field',
    invalidEmail: 'Invalid email address',
    contactRequired: 'Please provide an email or phone number',
    configError: 'Widget configuration could not be loaded.',
    thankYou: 'Thank you!',
    confirmation: 'Thank you! We will get back to you.',
    submitError: 'An error occurred. Please try again.',
    retry: 'Try again',
  },
};

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  addressStreet: '',
  addressZip: '',
  addressCity: '',
  requestType: '',
  priority: 'mittel',
  preferredWindow: '',
  description: '',
  photoFile: null,
};

const DEFAULT_MAX_FILE_SIZE_MB = 10;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png'];

export default function WidgetEmbed({ widgetId }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [locale, setLocale] = useState('de'); // CRM-014 AC-15
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [uploadWarning, setUploadWarning] = useState('');

  // Derive branding from config
  const primaryColor = config?.branding?.primaryColor || '#0056b3';
  const companyName = config?.branding?.companyName || '';
  const logoUrl = config?.branding?.logoUrl || ''; // CRM-014 AC-14
  const maxFileSizeMb = Number(config?.maxFileSizeMb || DEFAULT_MAX_FILE_SIZE_MB);

  // CRM-014 AC-15: restrict the locale selector to configured languages when provided.
  const availableLocales = (() => {
    const configured = Array.isArray(config?.languages)
      ? config.languages
          .map((l) => String(l || '').toLowerCase())
          .filter((l) => LOCALES.includes(l))
      : [];
    return configured.length ? configured : LOCALES;
  })();

  // Active UI string table (falls back to German per-key).
  const t = (key) => UI_STRINGS[locale]?.[key] ?? UI_STRINGS.de[key];

  const isFieldVisible = (key) => config?.fields?.[key]?.visible !== false;
  const isFieldRequired = (key, fallback = false) =>
    isFieldVisible(key) && (config?.fields?.[key]?.required ?? fallback) === true;

  // CRM-014 AC-15: per-category translated label from config when available.
  const localizedRequestLabel = (rt) => {
    if (!rt) return '';
    const byLocale = {
      de: rt.labelDe,
      fr: rt.labelFr,
      it: rt.labelIt,
      en: rt.labelEn,
    };
    return byLocale[locale] || rt.labelDe || rt.label || rt.key;
  };

  // CRM-014 AC-15: per-locale confirmation message from config when available.
  const localizedConfirmation = () => {
    if (confirmationMessage) return confirmationMessage;
    const byLocale = {
      de: config?.confirmationMessageDe,
      fr: config?.confirmationMessageFr,
      it: config?.confirmationMessageIt,
      en: config?.confirmationMessageEn,
    };
    return byLocale[locale] || config?.confirmationMessageDe || t('confirmation');
  };

  // Fetch widget config on mount
  useEffect(() => {
    if (!widgetId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await widgetPublicService.getConfig(widgetId);
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setConfigError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [widgetId]);

  // CRM-014 AC-15: when config restricts languages and the current locale is not
  // among them, snap to the first configured language.
  useEffect(() => {
    if (!Array.isArray(config?.languages) || config.languages.length === 0) return;
    const allowed = config.languages
      .map((l) => String(l || '').toLowerCase())
      .filter((l) => LOCALES.includes(l));
    if (allowed.length && !allowed.includes(locale)) {
      setLocale(allowed[0]);
    }
  }, [config, locale]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setUploadWarning('');
    setErrors((prev) => {
      // Email/phone share the combined "contact" error (CRM-014 AC-3).
      const clearKey = key === 'email' || key === 'phone'
        ? 'contact'
        : key.startsWith('address')
          ? 'address'
          : key;
      if (!prev[key] && !prev[clearKey]) return prev;
      const next = { ...prev };
      delete next[key];
      delete next[clearKey];
      return next;
    });
  }, []);

  const handleFileChange = useCallback((event) => {
    setField('photoFile', event.target.files?.[0] || null);
  }, [setField]);

  const validate = useCallback(() => {
    const errs = {};
    if (isFieldRequired('contactName', true) && !form.name.trim()) errs.name = t('required');

    // CRM-014 AC-3: require at least one of email/phone. Only error if BOTH empty.
    const emailVisible = isFieldVisible('contactEmail');
    const phoneVisible = isFieldVisible('contactPhone');
    const emailRequired = isFieldRequired('contactEmail');
    const phoneRequired = isFieldRequired('contactPhone');
    const hasEmail = !!form.email.trim();
    const hasPhone = !!form.phone.trim();
    if (emailRequired && !hasEmail) errs.email = t('required');
    if (phoneRequired && !hasPhone) errs.phone = t('required');
    if (!emailRequired && !phoneRequired && (emailVisible || phoneVisible) && !hasEmail && !hasPhone) {
      errs.contact = t('contactRequired');
    } else if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      // Validate email format only when an email was actually entered.
      errs.email = t('invalidEmail');
    }

    if (!form.requestType) errs.requestType = t('required');
    if (isFieldRequired('contactAddress')) {
      const hasAddress = [form.addressStreet, form.addressZip, form.addressCity].some((value) => value.trim());
      if (!hasAddress) errs.address = t('required');
    }
    if (isFieldRequired('preferredWindow') && !form.preferredWindow.trim()) {
      errs.preferredWindow = t('required');
    }
    if (isFieldRequired('photoUpload') && !form.photoFile) {
      errs.photoFile = t('required');
    } else if (form.photoFile) {
      if (!ALLOWED_PHOTO_TYPES.includes(form.photoFile.type)) {
        errs.photoFile = t('invalidFileType');
      } else if (form.photoFile.size > maxFileSizeMb * 1024 * 1024) {
        errs.photoFile = `${t('fileTooLarge')} (${maxFileSizeMb} MB)`;
      }
    }
    if (!form.description.trim()) errs.description = t('required');
    return errs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, locale, config, maxFileSizeMb]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setStatus('submitting');
    setErrors({});
    setUploadWarning('');
    setConfirmationMessage('');

    try {
      const body = {
        widgetId: widgetId || undefined,
        contact: {
          name: form.name.trim(),
          // CRM-014 AC-3: send whichever of email/phone are filled.
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: [form.addressStreet, form.addressZip, form.addressCity].some((value) => value.trim())
            ? {
                street: form.addressStreet.trim() || undefined,
                zip: form.addressZip.trim() || undefined,
                city: form.addressCity.trim() || undefined,
              }
            : undefined,
        },
        requestType: form.requestType,
        priority: form.priority, // CRM-014 AC-5
        preferredWindow: form.preferredWindow.trim() || undefined,
        description: form.description.trim(),
        language: locale, // CRM-014 AC-15
      };

      const result = await widgetPublicService.submit(body);
      setConfirmationMessage(result?.confirmationMessage || '');

      if (form.photoFile && result?.submissionId) {
        try {
          await widgetPublicService.uploadAttachment(result.submissionId, form.photoFile);
        } catch {
          setUploadWarning(t('photoUploadFailed'));
        }
      }

      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [form, widgetId, validate, locale, t]);

  // --- CSS custom properties for theming ---
  const cssVars = {
    '--widget-primary': primaryColor,
    '--widget-primary-hover': adjustBrightness(primaryColor, -15),
    '--widget-bg': '#ffffff',
    '--widget-text': '#1a1a2e',
    '--widget-muted': '#6b7280',
    '--widget-border': '#e5e7eb',
    '--widget-error': '#dc2626',
    '--widget-success-bg': '#f0fdf4',
    '--widget-success-border': '#bbf7d0',
    '--widget-success-text': '#166534',
    '--widget-error-bg': '#fef2f2',
    '--widget-error-border': '#fecaca',
    '--widget-error-text': '#991b1b',
    '--widget-radius': '8px',
    '--widget-font': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  // --- Render ---
  return (
    <div style={{ ...cssVars, ...styles.root }}>
      <div style={styles.container}>
        {/* Language selector (CRM-014 AC-15) — only when more than one option */}
        {availableLocales.length > 1 && (
          <div style={styles.langBar}>
            {availableLocales.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                style={{
                  ...styles.langButton,
                  ...(locale === loc ? styles.langButtonActive : {}),
                }}
                aria-pressed={locale === loc}
              >
                {LOCALE_NAMES[loc] || loc.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div style={styles.header}>
          {/* Logo (CRM-014 AC-14). Plain <img>: the logo is an arbitrary
              tenant-supplied external URL, unsuitable for next/image's
              configured-domains model. */}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={companyName || t('title')}
              style={styles.logo}
            />
          )}
          <h2 style={styles.title}>{t('title')}</h2>
          {companyName && <p style={styles.subtitle}>{companyName}</p>}
        </div>

        {/* Config error */}
        {configError && (
          <div style={styles.alertError}>
            {t('configError')}
          </div>
        )}

        {/* Success state */}
        {status === 'success' && (
          <>
            <div style={styles.alertSuccess}>
              <svg style={styles.alertIcon} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <p style={styles.alertTitle}>{t('thankYou')}</p>
                <p style={styles.alertText}>
                  {localizedConfirmation()}
                </p>
              </div>
            </div>
            {uploadWarning && (
              <div style={styles.alertError}>
                {uploadWarning}
              </div>
            )}
          </>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div style={styles.alertError}>
            <p>{t('submitError')}</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={styles.retryLink}
            >
              {t('retry')}
            </button>
          </div>
        )}

        {/* Form */}
        {status !== 'success' && (
          <form onSubmit={handleSubmit} noValidate style={styles.form}>
            {/* Name */}
            {isFieldVisible('contactName') && (
              <FieldGroup label={t('name')} required={isFieldRequired('contactName', true)} error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={t('namePlaceholder')}
                  style={{
                    ...styles.input,
                    ...(errors.name ? styles.inputError : {}),
                  }}
                />
              </FieldGroup>
            )}

            {/* Email — CRM-014 AC-3: no longer required on its own */}
            {isFieldVisible('contactEmail') && (
              <FieldGroup label={t('email')} required={isFieldRequired('contactEmail')} error={errors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  style={{
                    ...styles.input,
                    ...(errors.email || errors.contact ? styles.inputError : {}),
                  }}
                />
              </FieldGroup>
            )}

            {/* Phone — CRM-014 AC-3: either email or phone required */}
            {isFieldVisible('contactPhone') && (
              <FieldGroup label={t('phone')} required={isFieldRequired('contactPhone')} error={errors.phone || errors.contact}>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder={t('phonePlaceholder')}
                  style={{
                    ...styles.input,
                    ...(errors.phone || errors.contact ? styles.inputError : {}),
                  }}
                />
              </FieldGroup>
            )}

            {/* Address */}
            {isFieldVisible('contactAddress') && (
              <FieldGroup label={t('address')} required={isFieldRequired('contactAddress')} error={errors.address}>
                <div style={styles.addressGrid}>
                  <input
                    type="text"
                    value={form.addressStreet}
                    onChange={(e) => setField('addressStreet', e.target.value)}
                    placeholder={t('streetPlaceholder')}
                    style={{
                      ...styles.input,
                      ...(errors.address ? styles.inputError : {}),
                    }}
                  />
                  <div style={styles.addressRow}>
                    <input
                      type="text"
                      value={form.addressZip}
                      onChange={(e) => setField('addressZip', e.target.value)}
                      placeholder={t('zipPlaceholder')}
                      style={{
                        ...styles.input,
                        ...(errors.address ? styles.inputError : {}),
                      }}
                    />
                    <input
                      type="text"
                      value={form.addressCity}
                      onChange={(e) => setField('addressCity', e.target.value)}
                      placeholder={t('cityPlaceholder')}
                      style={{
                        ...styles.input,
                        ...(errors.address ? styles.inputError : {}),
                      }}
                    />
                  </div>
                </div>
              </FieldGroup>
            )}

            {/* Request Type */}
            <FieldGroup label={t('requestType')} required error={errors.requestType}>
              <select
                value={form.requestType}
                onChange={(e) => setField('requestType', e.target.value)}
                style={{
                  ...styles.input,
                  ...styles.select,
                  ...(errors.requestType ? styles.inputError : {}),
                  color: form.requestType ? 'var(--widget-text)' : 'var(--widget-muted)',
                }}
              >
                <option value="" disabled>
                  {t('selectPlaceholder')}
                </option>
                {(config?.requestTypes?.length
                  ? config.requestTypes.filter((rt) => rt.isActive !== false)
                  : REQUEST_TYPES
                ).map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {localizedRequestLabel(rt)}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Priority — CRM-014 AC-5 */}
            <FieldGroup label={t('priority')}>
              <select
                value={form.priority}
                onChange={(e) => setField('priority', e.target.value)}
                style={{
                  ...styles.input,
                  ...styles.select,
                }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Preferred window */}
            {isFieldVisible('preferredWindow') && (
              <FieldGroup label={t('preferredWindow')} required={isFieldRequired('preferredWindow')} error={errors.preferredWindow}>
                <input
                  type="text"
                  value={form.preferredWindow}
                  onChange={(e) => setField('preferredWindow', e.target.value)}
                  placeholder={t('preferredWindowPlaceholder')}
                  style={{
                    ...styles.input,
                    ...(errors.preferredWindow ? styles.inputError : {}),
                  }}
                />
              </FieldGroup>
            )}

            {/* Description */}
            <FieldGroup label={t('description')} required error={errors.description}>
              <textarea
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                rows={4}
                style={{
                  ...styles.input,
                  ...styles.textarea,
                  ...(errors.description ? styles.inputError : {}),
                }}
              />
            </FieldGroup>

            {/* Photo */}
            {isFieldVisible('photoUpload') && (
              <FieldGroup label={t('photoUpload')} required={isFieldRequired('photoUpload')} error={errors.photoFile}>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileChange}
                  style={{
                    ...styles.input,
                    ...styles.fileInput,
                    ...(errors.photoFile ? styles.inputError : {}),
                  }}
                />
                <p style={styles.helpText}>{t('photoHelp')}</p>
              </FieldGroup>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === 'submitting'}
              style={{
                ...styles.button,
                opacity: status === 'submitting' ? 0.7 : 1,
                cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
              }}
            >
              {status === 'submitting' ? (
                <span style={styles.buttonContent}>
                  <Spinner />
                  {t('submitting')}
                </span>
              ) : (
                t('submit')
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function FieldGroup({ label, required, error, children }) {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.label}>
        {label}
        {required && <span style={styles.required}> *</span>}
      </label>
      {children}
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      style={styles.spinner}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray="31.42 31.42"
      >
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 12 12" to="360 12 12"
          dur="0.8s" repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

/* ---------- Helpers ---------- */

function adjustBrightness(hex, percent) {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
    const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
}

/* ---------- Styles ---------- */

const styles = {
  root: {
    fontFamily: 'var(--widget-font)',
    color: 'var(--widget-text)',
    lineHeight: 1.5,
    boxSizing: 'border-box',
    minHeight: '100%',
    backgroundColor: 'var(--widget-bg)',
  },
  container: {
    maxWidth: 520,
    margin: '0 auto',
    padding: '24px 16px',
  },
  langBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
    marginBottom: 8,
  },
  langButton: {
    padding: '4px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--widget-muted)',
    backgroundColor: 'transparent',
    border: '1px solid var(--widget-border)',
    borderRadius: 'var(--widget-radius)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  langButtonActive: {
    color: '#ffffff',
    backgroundColor: 'var(--widget-primary)',
    borderColor: 'var(--widget-primary)',
  },
  logo: {
    display: 'block',
    maxHeight: 56,
    maxWidth: '100%',
    width: 'auto',
    margin: '0 auto 12px',
    objectFit: 'contain',
  },
  header: {
    marginBottom: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 4px',
    color: 'var(--widget-text)',
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--widget-muted)',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  addressGrid: {
    display: 'grid',
    gap: 8,
  },
  addressRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(72px, 0.35fr) minmax(0, 1fr)',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--widget-text)',
  },
  required: {
    color: 'var(--widget-error)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid var(--widget-border)',
    borderRadius: 'var(--widget-radius)',
    backgroundColor: 'var(--widget-bg)',
    color: 'var(--widget-text)',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  inputError: {
    borderColor: 'var(--widget-error)',
    boxShadow: '0 0 0 2px rgba(220, 38, 38, 0.15)',
  },
  select: {
    appearance: 'auto',
    cursor: 'pointer',
  },
  textarea: {
    resize: 'vertical',
    minHeight: 100,
  },
  fileInput: {
    padding: '8px 10px',
  },
  helpText: {
    fontSize: 12,
    color: 'var(--widget-muted)',
    margin: 0,
  },
  errorText: {
    fontSize: 12,
    color: 'var(--widget-error)',
    margin: 0,
  },
  button: {
    width: '100%',
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: 'var(--widget-primary)',
    border: 'none',
    borderRadius: 'var(--widget-radius)',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    fontFamily: 'inherit',
    marginTop: 4,
  },
  buttonContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    width: 18,
    height: 18,
    display: 'inline-block',
  },
  alertSuccess: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: 'var(--widget-success-bg)',
    border: '1px solid var(--widget-success-border)',
    borderRadius: 'var(--widget-radius)',
    color: 'var(--widget-success-text)',
    fontSize: 14,
    marginBottom: 16,
  },
  alertError: {
    padding: 16,
    backgroundColor: 'var(--widget-error-bg)',
    border: '1px solid var(--widget-error-border)',
    borderRadius: 'var(--widget-radius)',
    color: 'var(--widget-error-text)',
    fontSize: 14,
    marginBottom: 16,
  },
  alertIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    marginTop: 2,
  },
  alertTitle: {
    fontWeight: 600,
    margin: '0 0 4px',
  },
  alertText: {
    margin: 0,
  },
  retryLink: {
    background: 'none',
    border: 'none',
    color: 'var(--widget-error-text)',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
    marginTop: 8,
    fontSize: 13,
    fontFamily: 'inherit',
  },
};
