'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCIConfig } from '../../hooks/useCIQueries';
import { useUpdateCIConfig } from '../../hooks/useCIMutations';

const COMPANY_FIELDS = [
  ['doctpl.ci.companyName', 'companyName', 'Updata'],
  ['doctpl.ci.vatNumber', 'vatNumber', 'CHE-000.000.000 MWST'],
  ['doctpl.ci.iban', 'iban', 'CH00 0000 0000 0000 0000 0'],
  ['doctpl.ci.qrIban', 'qrIban', 'CH00 3000 0000 0000 0000 0'],
  ['doctpl.ci.bankName', 'bankName', ''],
  ['doctpl.ci.street', 'street', ''],
  ['doctpl.ci.zip', 'zip', ''],
  ['doctpl.ci.city', 'city', ''],
  ['doctpl.ci.phone', 'phone', ''],
  ['doctpl.ci.email', 'email', ''],
];

const BRAND_FIELDS = [
  ['doctpl.ci.primaryFont', 'primaryFont', 'Museo Sans'],
  ['doctpl.ci.lightFont', 'fontLight', 'Museo Sans 300'],
  ['doctpl.ci.mediumFont', 'fontMedium', 'Museo Sans 500'],
  ['doctpl.ci.boldFont', 'fontBold', 'Museo Sans 700'],
  ['doctpl.ci.primaryColor', 'primaryColor', '#1B3F8B'],
  ['doctpl.ci.secondaryColor', 'secondaryColor', '#D4002A'],
  ['doctpl.ci.primaryCmyk', 'primaryCmyk', 'C100 / M85 / Y2 / K0'],
  ['doctpl.ci.secondaryCmyk', 'secondaryCmyk', 'C10 / M100 / Y95 / K2'],
];

const DEFAULT_FORM = {
  companyName: '',
  vatNumber: '',
  iban: '',
  qrIban: '',
  bankName: '',
  street: '',
  zip: '',
  city: '',
  phone: '',
  email: '',
  primaryFont: 'Museo Sans',
  fontLight: 'Museo Sans 300',
  fontMedium: 'Museo Sans 500',
  fontBold: 'Museo Sans 700',
  primaryColor: '#1B3F8B',
  secondaryColor: '#D4002A',
  primaryCmyk: 'C100 / M85 / Y2 / K0',
  secondaryCmyk: 'C10 / M100 / Y95 / K2',
};

function toForm(config) {
  if (!config) return DEFAULT_FORM;
  return {
    companyName: config.companyName || '',
    vatNumber: config.companyDetails?.vatNumber || '',
    iban: config.companyDetails?.bankDetails?.iban || '',
    qrIban: config.companyDetails?.bankDetails?.qrIban || '',
    bankName: config.companyDetails?.bankDetails?.bankName || '',
    street: config.companyDetails?.address?.street || '',
    zip: config.companyDetails?.address?.zip || '',
    city: config.companyDetails?.address?.city || '',
    phone: config.companyDetails?.phone || '',
    email: config.companyDetails?.email || '',
    primaryFont: config.fonts?.primary || 'Museo Sans',
    fontLight: config.fonts?.weights?.light?.name || 'Museo Sans 300',
    fontMedium: config.fonts?.weights?.medium?.name || 'Museo Sans 500',
    fontBold: config.fonts?.weights?.bold?.name || 'Museo Sans 700',
    primaryColor: config.colors?.primary || '#1B3F8B',
    secondaryColor: config.colors?.secondary || '#D4002A',
    primaryCmyk: config.colors?.primaryCmyk || 'C100 / M85 / Y2 / K0',
    secondaryCmyk: config.colors?.secondaryCmyk || 'C10 / M100 / Y95 / K2',
  };
}

export function CIConfigForm() {
  const { t } = useLanguage();
  const { data: config, isLoading } = useCIConfig();
  const update = useUpdateCIConfig();
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!config) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(toForm(config));
  }, [config]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSave = () => update.mutate({
    companyName: form.companyName,
    companyDetails: {
      vatNumber: form.vatNumber,
      bankDetails: { iban: form.iban, qrIban: form.qrIban, bankName: form.bankName },
      address: { street: form.street, zip: form.zip, city: form.city },
      phone: form.phone,
      email: form.email,
    },
    fonts: {
      primary: form.primaryFont,
      weights: {
        light: { name: form.fontLight },
        medium: { name: form.fontMedium },
        bold: { name: form.fontBold },
      },
    },
    colors: {
      primary: form.primaryColor,
      secondary: form.secondaryColor,
      primaryCmyk: form.primaryCmyk,
      secondaryCmyk: form.secondaryCmyk,
    },
  });

  if (isLoading) return <div className="py-4 text-sm text-muted-foreground">{t('doctpl.ci.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COMPANY_FIELDS.map(([labelKey, key, placeholder]) => (
          <div key={key}>
            <Label className="text-sm">{t(labelKey)}</Label>
            <Input value={form[key]} onChange={set(key)} placeholder={placeholder} className="mt-1" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BRAND_FIELDS.map(([labelKey, key, placeholder]) => (
          <div key={key}>
            <Label className="text-sm">{t(labelKey)}</Label>
            <Input value={form[key]} onChange={set(key)} placeholder={placeholder} className="mt-1" />
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={update.isPending}>
        {update.isPending ? t('doctpl.templates.saving') : t('doctpl.ci.save')}
      </Button>
      {update.isSuccess && <p className="text-xs text-green-600">{t('doctpl.ci.saved')}</p>}
    </div>
  );
}
