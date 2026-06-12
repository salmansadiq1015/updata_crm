'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { numberingService } from '@/modules/qop/services/numbering-service';

function SequenceCard({ seq, de, onSave }) {
  const [form, setForm] = useState({
    prefix: seq.prefix || '',
    separator: seq.separator || '-',
    yearFormat: seq.yearFormat || 'YYYY',
    paddingLength: seq.paddingLength || 4,
    resetsAnnually: seq.resetsAnnually ?? true,
  });
  const [preview, setPreview] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handlePreview = async () => {
    try {
      const res = await numberingService.preview(seq._id);
      setPreview(res?.data?.preview || '');
    } catch {
      setPreview('Error');
    }
  };

  const TYPE_LABELS = {
    quotation: de ? 'Offerten' : 'Quotations',
    order: de ? 'Aufträge' : 'Orders',
    invoice: de ? 'Rechnungen' : 'Invoices',
  };

  return (
    <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{TYPE_LABELS[seq.documentType] ?? seq.documentType}</h3>
        <span className="text-xs text-muted-foreground font-mono">
          {(seq.currentValue ?? 0).toLocaleString()} {de ? 'bisher' : 'issued'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Präfix' : 'Prefix'}</Label>
          <Input className="h-8" value={form.prefix} onChange={(e) => set('prefix', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Trennzeichen' : 'Separator'}</Label>
          <Input className="h-8 w-16" value={form.separator} onChange={(e) => set('separator', e.target.value)} maxLength={3} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Jahresformat' : 'Year Format'}</Label>
          <Select value={form.yearFormat} onValueChange={(v) => set('yearFormat', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY">YYYY (2026)</SelectItem>
              <SelectItem value="YY">YY (26)</SelectItem>
              <SelectItem value="none">{de ? 'Kein Jahr' : 'No year'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Stellen (Sequenz)' : 'Sequence Padding'}</Label>
          <Input
            type="number"
            className="h-8"
            min={1}
            max={8}
            value={form.paddingLength}
            onChange={(e) => set('paddingLength', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={form.resetsAnnually} onCheckedChange={(v) => set('resetsAnnually', v)} />
        <Label className="text-sm">{de ? 'Jährlicher Reset' : 'Annual reset'}</Label>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={handlePreview}>
          {de ? 'Vorschau' : 'Preview'}
        </Button>
        {preview && (
          <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{preview}</span>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => onSave(seq._id, form)}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export default function NumberingPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const qc = useQueryClient();

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['qop', 'numbering-sequences'],
    queryFn: numberingService.list,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });

  const updateSeq = useMutation({
    mutationFn: ({ id, data }) => numberingService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qop', 'numbering-sequences'] }),
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Nummerierung' : 'Document Numbering'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de
            ? 'Nummernkreise für Offerten, Aufträge und Rechnungen konfigurieren.'
            : 'Configure number sequences for quotations, orders, and invoices.'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{de ? 'Laden...' : 'Loading...'}</div>
      ) : sequences.map((seq) => (
        <SequenceCard
          key={seq._id}
          seq={seq}
          de={de}
          onSave={(id, data) => updateSeq.mutate({ id, data })}
        />
      ))}
    </div>
  );
}
