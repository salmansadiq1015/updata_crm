import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { translations } from '@/lib/i18n/translations';
import { userExperienceTranslations } from '@/lib/i18n/user-experience-translations';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { UserForm } from '../components/user-form';
import { getUserDepartmentLabel, getUserPositionLabel, getUserDateLocale } from '../utils/user-display';
import { buildUserFormSchema } from '../validations/user';

const t = (key, fallback, vars = {}) => (translations.en[key] ?? fallback ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

describe('English user-management experience', () => {
  it('uses the selected locale in the actual bulk-action bar', () => {
    render(<LanguageProvider initialLocale="en"><BulkActionsBar count={2} onClear={() => {}}>Actions</BulkActionsBar></LanguageProvider>);
    expect(screen.getByRole('toolbar', { name: '2 selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    expect(screen.queryByText(/ausgewählt|Aufheben/)).not.toBeInTheDocument();
  });

  it('translates the default confirmation actions', () => {
    render(<LanguageProvider initialLocale="en"><ConfirmDialog open onOpenChange={() => {}} onConfirm={() => {}} title="Delete user?" /></LanguageProvider>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.queryByText(/Abbrechen|Bestätigen/)).not.toBeInTheDocument();
  });

  it('translates the modal and field-validation messages', () => {
    render(<LanguageProvider initialLocale="en"><UserForm open onOpenChange={() => {}} onSubmit={() => {}} /></LanguageProvider>);
    expect(screen.getByRole('heading', { name: 'New User' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'User setup steps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    const result = buildUserFormSchema(t).safeParse({});
    expect(result.success).toBe(false);
    const invalidNames = buildUserFormSchema(t).safeParse({ firstName: '', lastName: '', email: 'wrong', roleId: '', password: 'weak', confirmPassword: '' });
    expect(invalidNames.error.issues.map((issue) => issue.message)).toContain('Enter a first name.');
    expect(invalidNames.error.issues.map((issue) => issue.message)).toContain('Enter a valid email address.');
  });

  it('translates known saved department and position values while preserving custom text', () => {
    expect(getUserDepartmentLabel('Technik', t)).toBe('Field Service');
    expect(getUserPositionLabel('Administration', 'Mitarbeiter Administration', t)).toBe('Administration Employee');
    expect(getUserPositionLabel('Custom department', 'Custom position', t)).toBe('Custom position');
  });

  it.each(['de', 'fr', 'ar'])('covers all new user-experience strings in %s', (locale) => {
    expect(Object.keys(userExperienceTranslations[locale]).sort()).toEqual(Object.keys(userExperienceTranslations.en).sort());
    expect(Object.values(userExperienceTranslations[locale]).every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
  });
});


it('provides an authored English translation for every German user-management key', () => {
  const keys = Object.keys(translations.de).filter((key) => key.startsWith('users.'));
  expect(keys.length).toBeGreaterThan(100);
  for (const key of keys) {
    expect(translations.en[key], key).toBeTypeOf('string');
    expect(translations.en[key].length, key).toBeGreaterThan(0);
    expect(translations.en[key].match(/\{\w+\}/g) || [], key)
      .toEqual(translations.de[key].match(/\{\w+\}/g) || []);
  }
});

it('uses English across every edit step, including saved German presets and password controls', async () => {
  const user = userEvent.setup();
  render(<LanguageProvider initialLocale="en"><UserForm open onOpenChange={() => {}} onSubmit={() => {}}
    roles={[{ _id: 'role-1', name: 'Techniker' }]} defaultValues={{
      _id: 'user-1', firstName: 'Alex', lastName: 'Smith', email: 'alex@example.com',
      department: 'Technik', position: 'Servicetechniker', role: { _id: 'role-1', name: 'Techniker' },
    }} /></LanguageProvider>);
  for (const name of ['Personal', 'Contact', 'Work', 'Address', 'Access']) {
    await user.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(screen.getByRole('heading', { name, exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Persönlich|Geburtsdatum|Kürzel|Zurück|Weiter|Zugang|Schritt/)).not.toBeInTheDocument();
    if (name === 'Work') {
      expect(screen.getAllByText('Field Service')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Service Technician')[0]).toBeInTheDocument();
    }
    if (name === 'Address') expect(screen.queryByDisplayValue('Schweiz')).not.toBeInTheDocument();
    if (name === 'Access') {
      expect(screen.getByLabelText('Password', { exact: true })).toBeInTheDocument();
      expect(screen.getByText(/Leave both fields blank/)).toBeInTheDocument();
      expect(screen.getAllByText('English')[0]).toBeInTheDocument();
    }
  }
});

it('formats user dates using the selected locale', () => {
  expect(getUserDateLocale('en')).toBe('en-GB');
  expect(getUserDateLocale('de')).toBe('de-CH');
  expect(getUserDateLocale('fr')).toBe('fr-CH');
  expect(getUserDateLocale('ar')).toBe('ar');
  expect(getUserDateLocale(undefined)).toBe('en-GB');
});
