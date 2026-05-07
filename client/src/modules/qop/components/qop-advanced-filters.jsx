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
import { searchService } from '../services/search-service';

const EMPTY_FILTERS = {
  type: 'all', status: '', dateFrom: '', dateTo: '',
  amountMin: '', amountMax: '',
};

export function QopAdvancedFilters({ onFiltersChange }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [presetName, setPresetName] = useState('');

  const { data: presets = [] } = useQuery({
    queryKey: ['qop', 'search-presets'],
    queryFn: () => searchService.listPresets(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });

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
      const blob = new Blob([res], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qop-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silently fail */ }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Filter className="h-4 w-4 mr-1.5" />
          {de ? 'Filter' : 'Filters'}
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
          <Download className="h-4 w-4 mr-1.5" />{de ? 'CSV Export' : 'Export CSV'}
        </Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Typ' : 'Type'}</Label>
              <Select value={filters.type} onValueChange={(v) => set('type', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{de ? 'Alle' : 'All'}</SelectItem>
                  <SelectItem value="quotation">{de ? 'Offerte' : 'Quotation'}</SelectItem>
                  <SelectItem value="order">{de ? 'Auftrag' : 'Order'}</SelectItem>
                  <SelectItem value="invoice">{de ? 'Rechnung' : 'Invoice'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Status' : 'Status'}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. DRAFT"
                value={filters.status}
                onChange={(e) => set('status', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Von (Datum)' : 'Date From'}</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filters.dateFrom}
                onChange={(e) => set('dateFrom', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Bis (Datum)' : 'Date To'}</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={filters.dateTo}
                onChange={(e) => set('dateTo', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Betrag Min' : 'Amount Min'}</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                placeholder="0"
                value={filters.amountMin}
                onChange={(e) => set('amountMin', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Betrag Max' : 'Amount Max'}</Label>
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
              {de ? 'Filter löschen' : 'Clear filters'}
            </Button>
            <div className="flex-1" />
            <Input
              className="h-8 text-xs w-40"
              placeholder={de ? 'Preset Name...' : 'Preset name...'}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button
              size="sm" variant="outline"
              onClick={() => savePreset.mutate()}
              disabled={!presetName || savePreset.isPending}
            >
              <Save className="h-4 w-4 mr-1.5" />{de ? 'Speichern' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
