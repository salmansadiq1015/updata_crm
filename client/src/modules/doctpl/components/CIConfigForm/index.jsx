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
  });

  useEffect(() => {
    if (!config) return;
    setForm({
      companyName: config.companyName || '',
      vatNumber:   config.companyDetails?.vatNumber || '',
      iban:        config.companyDetails?.bankDetails?.iban || '',
      qrIban:      config.companyDetails?.bankDetails?.qrIban || '',
      bankName:    config.companyDetails?.bankName || '',
      street:      config.companyDetails?.address?.street || '',
      zip:         config.companyDetails?.address?.zip || '',
      city:        config.companyDetails?.address?.city || '',
      phone:       config.companyDetails?.phone || '',
      email:       config.companyDetails?.email || '',
    });
  }, [config]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => update.mutate({
    companyName: form.companyName,
    companyDetails: {
      vatNumber: form.vatNumber,
      bankName:  form.bankName,
      bankDetails: { iban: form.iban, qrIban: form.qrIban },
      address:   { street: form.street, zip: form.zip, city: form.city },
      phone:     form.phone,
      email:     form.email,
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
      <Button onClick={handleSave} disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save CI Configuration'}
      </Button>
      {update.isSuccess && <p className="text-xs text-green-600">Saved successfully.</p>}
    </div>
  );
}
