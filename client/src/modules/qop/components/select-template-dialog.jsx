'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileText, Search, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotationTemplates } from '../hooks/use-qop-template-queries';

export function SelectTemplateDialog({ open, onClose, onSelect }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: templates = [], isLoading } = useQuotationTemplates({});

  const filtered = search
    ? templates.filter(
        (tpl) =>
          tpl.name.toLowerCase().includes(search.toLowerCase()) ||
          (tpl.category || '').toLowerCase().includes(search.toLowerCase()),
      )
    : templates;

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
    }
    onClose();
  };

  const handleBlank = () => {
    onSelect(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('qop.templates.selectTitle', 'Vorlage auswählen')}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder={t('qop.templates.search', 'Vorlagen suchen...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading', 'Laden...')}</div>
          )}

          {!isLoading && (
            <div className="flex flex-col gap-2 py-1">
              {filtered.map((tpl) => (
                <button
                  key={tpl._id ?? tpl.id}
                  type="button"
                  onClick={() => setSelected(selected?._id === tpl._id ? null : tpl)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected?._id === (tpl._id ?? tpl.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{tpl.name}</span>
                      {tpl.category && (
                        <Badge variant="outline" className="text-[10px] px-1.5">{tpl.category}</Badge>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>{tpl.lineItems?.length || 0} {t('qop.templates.positions', 'Positionen')}</span>
                      {tpl.usageCount > 0 && <span>×{tpl.usageCount} {t('qop.templates.uses', 'Verwendungen')}</span>}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && !isLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('qop.templates.noResults', 'Keine Vorlagen gefunden')}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={handleBlank} className="gap-1.5 sm:mr-auto">
            <Plus className="h-4 w-4" />
            {t('qop.templates.blankQuotation', 'Leere Offerte')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button type="button" disabled={!selected} onClick={handleConfirm}>
            {t('qop.templates.useTemplate', 'Vorlage verwenden')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
