'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCIConfig } from '../../hooks/useCIQueries';
import { useUpdateCIConfig } from '../../hooks/useCIMutations';

export function CIConfigForm() {
  const { data: config, isLoading } = useCIConfig();
  const update = useUpdateCIConfig();
  const [form, setForm] = useState({
    companyName: '', vatNumber: '', iban: '', qrIban: '', bankName: '',
    street: '', zip: '', city: '', phone: '', email: '',
    primaryFont: 'Museo Sans', fontLight: 'Museo Sans 300', fontMedium: 'Museo Sans 500', fontBold: 'Museo Sans 700',
    primaryColor: '#1B3F8B', secondaryColor: '#D4002A',
    primaryCmyk: 'C100 / M85 / Y2 / K0', secondaryCmyk: 'C10 / M100 / Y95 / K2',
  });

  useEffect(() => {
    if (!config) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      companyName: config.companyName || '',
      vatNumber:   config.companyDetails?.vatNumber || '',
      iban:        config.companyDetails?.bankDetails?.iban || '',
      qrIban:      config.companyDetails?.bankDetails?.qrIban || '',
      bankName:    config.companyDetails?.bankDetails?.bankName || '',
      street:      config.companyDetails?.address?.street || '',
      zip:         config.companyDetails?.address?.zip || '',
      city:        config.companyDetails?.address?.city || '',
      phone:       config.companyDetails?.phone || '',
      email:       config.companyDetails?.email || '',
      primaryFont: config.fonts?.primary || 'Museo Sans',
      fontLight:   config.fonts?.weights?.light?.name || 'Museo Sans 300',
      fontMedium:  config.fonts?.weights?.medium?.name || 'Museo Sans 500',
      fontBold:    config.fonts?.weights?.bold?.name || 'Museo Sans 700',
      primaryColor: config.colors?.primary || '#1B3F8B',
      secondaryColor: config.colors?.secondary || '#D4002A',
      primaryCmyk: config.colors?.primaryCmyk || 'C100 / M85 / Y2 / K0',
      secondaryCmyk: config.colors?.secondaryCmyk || 'C10 / M100 / Y95 / K2',
    });
  }, [config]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => update.mutate({
    companyName: form.companyName,
    companyDetails: {
      vatNumber: form.vatNumber,
      bankDetails: { iban: form.iban, qrIban: form.qrIban, bankName: form.bankName },
      address:   { street: form.street, zip: form.zip, city: form.city },
      phone:     form.phone,
      email:     form.email,
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

  if (isLoading) return <div className="py-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          ['Company Name', 'companyName', 'MB Boiler & Heizung AG'],
          ['VAT Number',   'vatNumber',   'CHE-000.000.000 MWST'],
          ['IBAN',         'iban',         'CH00 0000 0000 0000 0000 0'],
          ['QR-IBAN',      'qrIban',       'CH00 3000 0000 0000 0000 0'],
          ['Bank Name',    'bankName',     ''],
          ['Street',       'street',       ''],
          ['ZIP',          'zip',          ''],
          ['City',         'city',         ''],
          ['Phone',        'phone',        ''],
          ['Email',        'email',        ''],
        ].map(([label, key, placeholder]) => (
          <div key={key}>
            <Label className="text-sm">{label}</Label>
            <Input value={form[key]} onChange={set(key)} placeholder={placeholder} className="mt-1" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          ['Primary Font', 'primaryFont', 'Museo Sans'],
          ['Light Font', 'fontLight', 'Museo Sans 300'],
          ['Medium Font', 'fontMedium', 'Museo Sans 500'],
          ['Bold Font', 'fontBold', 'Museo Sans 700'],
          ['Blue HEX', 'primaryColor', '#1B3F8B'],
          ['Red HEX', 'secondaryColor', '#D4002A'],
          ['Blue CMYK', 'primaryCmyk', 'C100 / M85 / Y2 / K0'],
          ['Red CMYK', 'secondaryCmyk', 'C10 / M100 / Y95 / K2'],
        ].map(([label, key, placeholder]) => (
          <div key={key}>
            <Label className="text-sm">{label}</Label>
            <Input value={form[key]} onChange={set(key)} placeholder={placeholder} className="mt-1" />
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save CI Configuration'}
      </Button>
      {update.isSuccess && <p className="text-xs text-green-600">Saved successfully.</p>}
    </div>
  );
}
