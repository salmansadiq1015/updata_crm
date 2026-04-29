'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9097/api/v1';

const REQUEST_TYPES = [
  { key: 'heizungsstoerung', label: 'Heizungsstörung' },
  { key: 'wartung', label: 'Wartung' },
  { key: 'neuinstallation', label: 'Neuinstallation' },
  { key: 'beratung', label: 'Beratung' },
  { key: 'other', label: 'Sonstiges' },
];

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  requestType: '',
  description: '',
};

export default function WidgetEmbed({ widgetId }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error

  // Derive branding from config
  const primaryColor = config?.branding?.primaryColor || '#0056b3';
  const companyName = config?.branding?.companyName || '';

  // Fetch widget config on mount
  useEffect(() => {
    if (!widgetId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/public/widget/config?widgetId=${encodeURIComponent(widgetId)}`
        );
        if (!res.ok) throw new Error('Config fetch failed');
        const json = await res.json();
        if (!cancelled) setConfig(json.data || json);
      } catch {
        if (!cancelled) setConfigError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [widgetId]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validate = useCallback(() => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Pflichtfeld';
    if (!form.email.trim()) {
      errs.email = 'Pflichtfeld';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Ungültige E-Mail-Adresse';
    }
    if (!form.requestType) errs.requestType = 'Pflichtfeld';
    if (!form.description.trim()) errs.description = 'Pflichtfeld';
    return errs;
  }, [form]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setStatus('submitting');
    setErrors({});

    try {
      const body = {
        widgetId: widgetId || undefined,
        contact: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          address: form.company.trim()
            ? { street: form.company.trim() }
            : undefined,
        },
        requestType: form.requestType,
        description: form.description.trim(),
      };

      const res = await fetch(`${API_URL}/public/widget/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Submission failed');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [form, widgetId, validate]);

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
        {/* Header */}
        {companyName && (
          <div style={styles.header}>
            <h2 style={styles.title}>Kontaktformular</h2>
            {companyName && <p style={styles.subtitle}>{companyName}</p>}
          </div>
        )}
        {!companyName && (
          <div style={styles.header}>
            <h2 style={styles.title}>Kontaktformular</h2>
          </div>
        )}

        {/* Config error */}
        {configError && (
          <div style={styles.alertError}>
            Widget-Konfiguration konnte nicht geladen werden.
          </div>
        )}

        {/* Success state */}
        {status === 'success' && (
          <div style={styles.alertSuccess}>
            <svg style={styles.alertIcon} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div>
              <p style={styles.alertTitle}>Vielen Dank!</p>
              <p style={styles.alertText}>
                {config?.confirmationMessageDe ||
                  'Vielen Dank! Wir melden uns bei Ihnen.'}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div style={styles.alertError}>
            <p>Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={styles.retryLink}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Form */}
        {status !== 'success' && (
          <form onSubmit={handleSubmit} noValidate style={styles.form}>
            {/* Name */}
            <FieldGroup label="Name" required error={errors.name}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Max Mustermann"
                style={{
                  ...styles.input,
                  ...(errors.name ? styles.inputError : {}),
                }}
              />
            </FieldGroup>

            {/* Email */}
            <FieldGroup label="E-Mail" required error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="max@beispiel.ch"
                style={{
                  ...styles.input,
                  ...(errors.email ? styles.inputError : {}),
                }}
              />
            </FieldGroup>

            {/* Phone */}
            <FieldGroup label="Telefon">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+41 79 123 45 67"
                style={styles.input}
              />
            </FieldGroup>

            {/* Company */}
            <FieldGroup label="Firma">
              <input
                type="text"
                value={form.company}
                onChange={(e) => setField('company', e.target.value)}
                placeholder="Firmenname (optional)"
                style={styles.input}
              />
            </FieldGroup>

            {/* Request Type */}
            <FieldGroup label="Anliegen" required error={errors.requestType}>
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
                  Bitte wählen...
                </option>
                {(config?.requestTypes?.length
                  ? config.requestTypes.filter((rt) => rt.isActive !== false)
                  : REQUEST_TYPES
                ).map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {rt.labelDe || rt.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Description */}
            <FieldGroup label="Nachricht" required error={errors.description}>
              <textarea
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Beschreiben Sie Ihr Anliegen..."
                rows={4}
                style={{
                  ...styles.input,
                  ...styles.textarea,
                  ...(errors.description ? styles.inputError : {}),
                }}
              />
            </FieldGroup>

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
                  Wird gesendet...
                </span>
              ) : (
                'Anfrage senden'
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
