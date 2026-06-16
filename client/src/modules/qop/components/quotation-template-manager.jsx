'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText, Plus, MoreVertical, Edit2, Trash2, Copy, Search, BarChart2,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotationTemplates, useRecurringItems } from '../hooks/use-qop-template-queries';
import { useQuotationTemplateMutations } from '../hooks/use-qop-template-mutations';
import { LineItemsEditor } from './line-items-editor';
import { CURRENCIES } from '../constants/qop-constants';

const EMPTY_TPL = () => ({
  name: '',
  description: '',
  category: '',
  language: 'de',
  currency: 'CHF',
  introduction: '',
  notes: '',
  paymentTerms: '',
  termsAndConditions: '',
  globalDiscountPercent: 0,
  lineItems: [],
  isActive: true,
});

function TemplateFormDialog({ open, onClose, template = null }) {
  const { t } = useLanguage();
  const isEdit = !!template;
  const [form, setForm] = useState(() => template ? {
    name: template.name || '',
    description: template.description || '',
    category: template.category || '',
    language: template.language || 'de',
    currency: template.currency || 'CHF',
    introduction: template.introduction || '',
    notes: template.notes || '',
    paymentTerms: template.paymentTerms || '',
    termsAndConditions: template.termsAndConditions || '',
    globalDiscountPercent: template.globalDiscountPercent || 0,
    lineItems: (template.lineItems || []).map((li, i) => ({ ...li, _uid: i })),
    isActive: template.isActive ?? true,
  } : EMPTY_TPL());

  const { createTemplate, updateTemplate } = useQuotationTemplateMutations();
  const isPending = createTemplate.isPending || updateTemplate.isPending;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const items = form.lineItems.map(({ _uid, ...li }) => ({
      type: li.type || 'service',
      position: li.position,
      description: li.description,
      unit: li.unit || undefined,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      discountPercent: Number(li.discountPercent) || 0,
      vatRate: Number(li.vatRate),
    }));
    const payload = { ...form, lineItems: items };
    if (isEdit) {
      await updateTemplate.mutateAsync({ id: template._id ?? template.id, data: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('qop.templates.editTitle', 'Vorlage bearbeiten') : t('qop.templates.newTitle', 'Neue Vorlage')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
              <Label>{t('qop.templates.name', 'Name')} *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={200} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.category', 'Kategorie')}</Label>
              <Input value={form.category} onChange={(e) => set('category', e.target.value)} maxLength={100} placeholder={t('qop.templates.categoryPlaceholder', 'z.B. Wartung, Installation')} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>{t('qop.templates.description', 'Beschreibung')}</Label>
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.language', 'Sprache')}</Label>
              <Select value={form.language} onValueChange={(v) => set('language', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.currency', 'Währung')}</Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.globalDiscount', 'Globalrabatt %')}</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.globalDiscountPercent} onChange={(e) => set('globalDiscountPercent', e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('qop.templates.introduction', 'Einleitung')}</Label>
            <Textarea rows={3} value={form.introduction} onChange={(e) => set('introduction', e.target.value)} maxLength={5000} className="resize-none text-sm" />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">{t('qop.templates.positions', 'Positionen')}</Label>
            <LineItemsEditor value={form.lineItems} onChange={(items) => set('lineItems', items)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.notes', 'Bemerkungen')}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={5000} className="resize-none text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.templates.paymentTerms', 'Zahlungsbedingungen')}</Label>
              <Textarea rows={2} value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} maxLength={1000} className="resize-none text-sm" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>{t('qop.templates.termsAndConditions', 'AGB')}</Label>
              <Textarea rows={3} value={form.termsAndConditions} onChange={(e) => set('termsAndConditions', e.target.value)} maxLength={10000} className="resize-none text-sm" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? t('common.saving', 'Speichern...') : isEdit ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecurringItemsPanel({ onInsert }) {
  const { t } = useLanguage();
  const { data: items = [], isLoading } = useRecurringItems({ limit: 15 });
  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground">{t('common.loading', 'Laden...')}</div>;
  if (items.length === 0) return <div className="py-4 text-center text-xs text-muted-foreground">{t('qop.templates.noRecurring', 'Noch keine häufigen Positionen')}</div>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onInsert && onInsert(item)}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted transition-colors border border-transparent hover:border-border"
        >
          <span className="flex-1 font-medium truncate">{item.description}</span>
          <span className="text-muted-foreground shrink-0">{item.unit || '—'}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">×{item.count}</Badge>
        </button>
      ))}
    </div>
  );
}

export function QuotationTemplateManager({ open, onClose }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState('templates');

  const { data: templates = [], isLoading } = useQuotationTemplates(search ? { search } : {});
  const { deleteTemplate } = useQuotationTemplateMutations();

  const filtered = search
    ? templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || (t.category || '').toLowerCase().includes(search.toLowerCase()))
    : templates;

  const handleDelete = async (tpl) => {
    if (!confirm(`${t('qop.templates.deleteConfirm', 'Vorlage wirklich löschen?')} "${tpl.name}"`)) return;
    await deleteTemplate.mutateAsync(tpl._id ?? tpl.id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('qop.templates.managerTitle', 'Angebotsvorlagen')}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {[
              { key: 'templates', label: t('qop.templates.tab', 'Vorlagen'), icon: FileText },
              { key: 'recurring', label: t('qop.templates.tabRecurring', 'Häufige Positionen'), icon: BarChart2 },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'templates' && (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9"
                      placeholder={t('qop.templates.search', 'Vorlagen suchen...')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => { setEditTemplate(null); setShowForm(true); }}>
                    <Plus className="h-4 w-4" />
                    {t('qop.templates.new', 'Neue Vorlage')}
                  </Button>
                </div>

                {isLoading && (
                  <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading', 'Laden...')}</div>
                )}

                {!isLoading && filtered.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {search ? t('qop.templates.noResults', 'Keine Vorlagen gefunden') : t('qop.templates.empty', 'Noch keine Vorlagen. Erstellen Sie Ihre erste Vorlage.')}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {filtered.map((tpl) => (
                    <div
                      key={tpl._id ?? tpl.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{tpl.name}</span>
                          {tpl.category && <Badge variant="outline" className="text-[10px] px-1.5">{tpl.category}</Badge>}
                          {!tpl.isActive && <Badge variant="secondary" className="text-[10px] px-1.5">{t('qop.templates.inactive', 'Inaktiv')}</Badge>}
                          {tpl.usageCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">×{tpl.usageCount} {t('qop.templates.uses', 'Verwendungen')}</span>
                          )}
                        </div>
                        {tpl.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>}
                        <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>{tpl.lineItems?.length || 0} {t('qop.templates.positions', 'Positionen')}</span>
                          <span>{tpl.currency}</span>
                          <span>{tpl.language?.toUpperCase()}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditTemplate(tpl); setShowForm(true); }}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" />
                            {t('common.edit', 'Bearbeiten')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(tpl)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {t('common.delete', 'Löschen')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'recurring' && (
              <div className="py-4 px-1">
                <p className="text-xs text-muted-foreground mb-3">
                  {t('qop.templates.recurringDesc', 'Häufig verwendete Positionen aus bestehenden Offerten:')}
                </p>
                <RecurringItemsPanel />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showForm && (
        <TemplateFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditTemplate(null); }}
          template={editTemplate}
        />
      )}
    </>
  );
}
