'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Filter, Save, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { searchService } from '../services/search-service';
import { useQopDepartments } from '../hooks/use-qop-queries';

const EMPTY_FILTERS = {
  type: 'all', status: '', dateFrom: '', dateTo: '',
  amountMin: '', amountMax: '', departmentId: '',
};

export function QopAdvancedFilters({ onFiltersChange }) {
  const { t } = useLanguage();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [presetName, setPresetName] = useState('');

  const { data: presets = [] } = useQuery({
    queryKey: ['qop', 'search-presets'],
    queryFn: () => searchService.listPresets(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });

  const { data: departments = [] } = useQopDepartments();

  const savePreset = useMutation({
    mutationFn: () => searchService.savePreset(presetName, filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qop', 'search-presets'] });
      setPresetName('');
    },
  });

  const deletePreset = useMutation({
    mutationFn: (id) => searchService.deletePreset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qop', 'search-presets'] }),
  });

  const set = (field, value) => {
    const next = { ...filters, [field]: value };
    setFilters(next);
    onFiltersChange(next);
  };

  const applyPreset = (preset) => {
    setFilters(preset.filters);
    onFiltersChange(preset.filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    onFiltersChange(EMPTY_FILTERS);
  };

  const handleExport = async () => {
    try {
      const res = await searchService.exportCsv(filters);
      // Blob responses skip the success-envelope unwrap, so the interceptor returns
      // the raw axios response: the CSV Blob lives on res.data.
      const payload = res?.data ?? res;
      const blob = payload instanceof Blob ? payload : new Blob([payload], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qop-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Filter className="h-4 w-4 mr-1.5" />
          {t('qop.filter.toggle', 'Filter')}
          {open ? <ChevronUp className="h-4 w-4 ml-1.5" /> : <ChevronDown className="h-4 w-4 ml-1.5" />}
        </Button>

        {presets.map((p) => (
          <div key={p._id} className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyPreset(p)}>
              {p.name}
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => deletePreset.mutate(p._id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}

        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1.5" />{t('qop.filter.exportCsv', 'CSV Export')}
        </Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.type', 'Typ')}</Label>
              <Select value={filters.type} onValueChange={(v) => set('type', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all', 'Alle')}</SelectItem>
                  <SelectItem value="quotation">{t('qop.filter.quotation', 'Offerte')}</SelectItem>
                  <SelectItem value="order">{t('qop.filter.order', 'Auftrag')}</SelectItem>
                  <SelectItem value="invoice">{t('qop.filter.invoice', 'Rechnung')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.status', 'Status')}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. DRAFT"
                value={filters.status}
                onChange={(e) => set('status', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.department', 'Abteilung')}</Label>
              <Select value={filters.departmentId || 'ALL'} onValueChange={(v) => set('departmentId', v === 'ALL' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all', 'Alle')}</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department._id} value={department._id}>
                      {department.code ? `${department.code} · ${department.name}` : department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.dateFrom', 'Von (Datum)')}</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filters.dateFrom}
                onChange={(e) => set('dateFrom', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.dateTo', 'Bis (Datum)')}</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filters.dateTo}
                onChange={(e) => set('dateTo', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.amountMin', 'Betrag Min')}</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                placeholder="0"
                value={filters.amountMin}
                onChange={(e) => set('amountMin', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('qop.filter.amountMax', 'Betrag Max')}</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                placeholder="999999"
                value={filters.amountMax}
                onChange={(e) => set('amountMax', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 items-end flex-wrap">
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              {t('qop.filter.clear', 'Filter löschen')}
            </Button>
            <div className="flex-1" />
            <Input
              className="h-8 text-xs w-40"
              placeholder={t('qop.filter.presetName', 'Preset Name...')}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button
              size="sm" variant="outline"
              onClick={() => savePreset.mutate()}
              disabled={!presetName || savePreset.isPending}
            >
              <Save className="h-4 w-4 mr-1.5" />{t('common.save', 'Speichern')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
