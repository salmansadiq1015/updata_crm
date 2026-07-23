'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PackageSearch, Plus, Trash2, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { VAT_RATES } from '../constants/qop-constants';
import { ArticlePickerDialog } from '@/modules/catalog/components/article-picker-dialog';
import { CatalogLinePriceDrift } from './catalog-line-price-drift';
import { TextBlockPicker } from './text-block-picker';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { showError } from '@/lib/toast';

function calcLineTotal(qty, price, discount) {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const d = parseFloat(discount) || 0;
  return Math.round((q * p * (1 - d / 100)) * 100) / 100;
}

function calcTotals(items) {
  const subtotal = items.reduce((s, it) => s + (it.lineTotal || 0), 0);
  const vatMap = {};
  items.forEach((it) => {
    const rate = it.vatRate ?? 8.1;
    const base = it.lineTotal || 0;
    if (!vatMap[rate]) vatMap[rate] = { rate, base: 0, vat: 0 };
    vatMap[rate].base += base;
    vatMap[rate].vat += Math.round(base * (rate / 100) * 100) / 100;
  });
  const vatBreakdown = Object.values(vatMap);
  const grandTotal = Math.round((subtotal + vatBreakdown.reduce((s, v) => s + v.vat, 0)) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, vatBreakdown, grandTotal };
}

const UNITS = ['Stk', 'h', 'm', 'm²', 'm³', 'kg', 'l', 'psch', 'cm'];

const UNIT_QTY_STEP = {
  Stk: '1',
  psch: '1',
  m: '0.1',
  cm: '0.1',
  'm²': '0.1',
  'm³': '0.1',
};

let _uid = 0;
function uid() { return ++_uid; }

const LINE_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg'];
const LINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Per-line product image control: upload a PNG/JPG that will be printed above
 * the position on the generated offer/order/invoice PDF. Stores { fileId, url }
 * on the line item; the server loads the image bytes by fileId when rendering.
 */
function LineImageControl({ image, disabled, onChange, t }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [refetchedUrl, setRefetchedUrl] = useState('');
  const triedRefetch = useRef(false);

  // Prefer a freshly refetched URL, then the stored one. The stored preview URL
  // is a pre-signed link that can expire; when the <img> fails to load we fetch a
  // fresh URL by fileId once (see onError). The generated document never depends
  // on this URL — it renders server-side from the fileId. The control is remounted
  // (keyed by fileId at the call site) when the attached image changes.
  const displayUrl = refetchedUrl || image?.url || '';

  const refetchUrl = async () => {
    if (triedRefetch.current || !image?.fileId) return;
    triedRefetch.current = true;
    try {
      const res = await apiClient.get(ENDPOINTS.FILES.DOWNLOAD(image.fileId));
      const p = res?.data ?? res;
      if (p?.url) setRefetchedUrl(p.url);
    } catch {
      // Keep the thumbnail broken; the generated document still renders the image.
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!LINE_IMAGE_MIME.includes(file.type)) {
      showError(t('qop.lineItems.imageType', 'Nur PNG- oder JPG-Bilder werden auf der Offerte unterstützt.'));
      return;
    }
    if (file.size > LINE_IMAGE_MAX_BYTES) {
      showError(t('qop.lineItems.imageTooLarge', 'Bild ist zu gross (max. 5 MB).'));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('module', 'qop');
      form.append('bucket', 'images');
      form.append('category', 'line-item');
      const res = await apiClient.post(ENDPOINTS.FILES.UPLOAD, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const payload = res?.data ?? res;
      const fileId = payload?._id || payload?.id;
      if (!fileId) throw new Error('upload failed');
      onChange({ fileId, url: payload?.url || '' });
    } catch {
      showError(t('qop.lineItems.imageUploadError', 'Bild konnte nicht hochgeladen werden.'));
    } finally {
      setBusy(false);
    }
  };

  if (image?.fileId || image?.url) {
    return (
      <span className="relative group/img shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          onError={refetchUrl}
          alt={t('qop.lineItems.imageAlt', 'Positionsbild')}
          className="h-8 w-8 rounded border border-border object-cover"
        />
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title={t('qop.lineItems.imageRemove', 'Bild entfernen')}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover/img:flex"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </span>
    );
  }

  if (disabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={t('qop.lineItems.imageAdd', 'Bild hinzufügen')}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );
}

export function LineItemsEditor({ value = [], onChange, disabled = false }) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);

  const addItem = useCallback(() => {
    const newItem = {
      _uid: uid(),
      position: value.length + 1,
      articleNumber: '',
      description: '',
      quantity: 1,
      unit: 'Stk',
      unitPrice: 0,
      discountPercent: 0,
      vatRate: 8.1,
      lineTotal: 0,
      isOptional: false,
    };
    onChange([...value, newItem]);
  }, [value, onChange]);

  const addCatalogItem = useCallback((snapshot) => {
    const catalogSnapshot = snapshot.catalogSnapshot || null;
    const unitPrice = Number(
      snapshot.snapshotPrice
      ?? catalogSnapshot?.snapshotSalesPrice
      ?? catalogSnapshot?.snapshotBasePrice
      ?? 0,
    );
    const newItem = {
      _uid: uid(),
      position: value.length + 1,
      type: snapshot.type === 'MATERIAL' ? 'material' : 'service',
      catalogItemId: snapshot.catalogArticleId || catalogSnapshot?.catalogArticleId || null,
      catalogSnapshot,
      articleNumber: snapshot.articleNumber || catalogSnapshot?.articleNumber || '',
      description: snapshot.name || catalogSnapshot?.articleName || '',
      quantity: 1,
      unit: snapshot.unitOfMeasure || catalogSnapshot?.unitOfMeasure || 'Stk',
      unitPrice,
      discountPercent: 0,
      vatRate: 8.1,
      lineTotal: unitPrice,
      isOptional: false,
    };
    onChange([...value, newItem]);
    setPickerOpen(false);
  }, [value, onChange]);

  const removeItem = useCallback((idx) => {
    const next = value.filter((_, i) => i !== idx).map((it, i) => ({ ...it, position: i + 1 }));
    onChange(next);
  }, [value, onChange]);

  const updateItem = useCallback((idx, field, raw) => {
    const next = value.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: raw };
      if (field === 'unitPrice' && updated.catalogSnapshot) {
        const snapshotPrice = Number(
          updated.catalogSnapshot.snapshotSalesPrice
          ?? updated.catalogSnapshot.snapshotBasePrice
          ?? 0,
        );
        updated.catalogSnapshot = {
          ...updated.catalogSnapshot,
          manualPriceOverride: Number(raw) !== snapshotPrice,
        };
      }
      updated.lineTotal = calcLineTotal(updated.quantity, updated.unitPrice, updated.discountPercent);
      return updated;
    });
    onChange(next);
  }, [value, onChange]);

  const totals = useMemo(() => calcTotals(value), [value]);

  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Table header */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2rem_3rem_1fr_5rem_5rem_6rem_5rem_5rem_6rem_2rem] gap-0 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          <div className="px-2 py-2">#</div>
          <div className="px-2 py-2">{t('qop.lineItems.colArt', 'Art.')}</div>
          <div className="px-2 py-2">{t('qop.lineItems.colDescription', 'Beschreibung')}</div>
          <div className="px-2 py-2 text-right">{t('qop.lineItems.colQty', 'Menge')}</div>
          <div className="px-2 py-2">{t('qop.lineItems.colUnit', 'Einheit')}</div>
          <div className="px-2 py-2 text-right">{t('qop.lineItems.colUnitPrice', 'Einzelpreis')}</div>
          <div className="px-2 py-2 text-right">{t('qop.lineItems.colDiscount', 'Rabatt %')}</div>
          <div className="px-2 py-2 text-right">{t('qop.lineItems.colVat', 'MwSt %')}</div>
          <div className="px-2 py-2 text-right">{t('qop.lineItems.colTotal', 'Total')}</div>
          <div className="px-2 py-2" />
        </div>

        {/* Rows */}
        {value.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('qop.lineItems.empty', 'Noch keine Positionen. Klicken Sie auf „Position hinzufügen".')}
          </div>
        )}

        {value.map((item, idx) => (
          <div
            key={item._uid ?? idx}
            className={cn(
              'grid grid-cols-[2rem_3rem_1fr_5rem_5rem_6rem_5rem_5rem_6rem_2rem] gap-0 border-b border-border last:border-0',
              item.isOptional && 'bg-blue-50/30',
              'hover:bg-muted/30 transition-colors',
            )}
          >
            <div className="flex items-center justify-center text-xs text-muted-foreground font-mono px-1">
              {item.position}
            </div>
            <div className="flex items-center px-1 py-1">
              <Input
                value={item.articleNumber || item.catalogSnapshot?.articleNumber || ''}
                onChange={(e) => updateItem(idx, 'articleNumber', e.target.value)}
                disabled={disabled}
                className="h-7 text-xs px-1.5 border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
                placeholder="—"
              />
            </div>
            <div className="flex items-center px-1 py-1">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1">
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  disabled={disabled}
                  className="h-7 min-w-0 text-xs px-1.5 border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
                  placeholder={t('qop.lineItems.descriptionPlaceholder', 'Beschreibung...')}
                />
                {!disabled && (
                  <TextBlockPicker
                    onSelect={(text) => updateItem(idx, 'description', text)}
                  />
                )}
                <CatalogLinePriceDrift item={item} />
                <LineImageControl
                  key={item.image?.fileId || 'noimg'}
                  image={item.image}
                  disabled={disabled}
                  t={t}
                  onChange={(img) => updateItem(idx, 'image', img)}
                />
                </div>
                {item.catalogSnapshot && (
                  <div className="truncate px-1.5 text-[10px] leading-4 text-muted-foreground">
                    {[
                      item.catalogSnapshot.supplierName || item.catalogSnapshot.manufacturerName,
                      `${t('qop.lineItems.purchase', 'EK')} ${fmt(item.catalogSnapshot.snapshotPurchasePrice ?? 0)}`,
                      `${t('qop.lineItems.sales', 'VK')} ${fmt(item.catalogSnapshot.snapshotSalesPrice ?? item.catalogSnapshot.snapshotBasePrice ?? 0)}`,
                      item.catalogSnapshot.marginPercent !== null && item.catalogSnapshot.marginPercent !== undefined
                        ? `${t('qop.lineItems.margin', 'Marge')} ${fmt(item.catalogSnapshot.marginPercent)}%`
                        : null,
                      item.catalogSnapshot.manualPriceOverride ? t('qop.lineItems.manualPrice', 'Manuell') : null,
                    ].filter(Boolean).join(' | ')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center px-1 py-1">
              <Input
                type="number"
                min="0"
                step={UNIT_QTY_STEP[item.unit] || '0.01'}
                value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                disabled={disabled}
                className="h-7 text-xs px-1.5 text-right border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
              />
            </div>
            <div className="flex items-center px-1 py-1">
              <Select
                value={item.unit}
                onValueChange={(v) => updateItem(idx, 'unit', v)}
                disabled={disabled}
              >
                <SelectTrigger className="h-7 text-xs px-1.5 border-0 bg-transparent focus:ring-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center px-1 py-1">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                disabled={disabled}
                className="h-7 text-xs px-1.5 text-right border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
              />
            </div>
            <div className="flex items-center px-1 py-1">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={item.discountPercent}
                onChange={(e) => updateItem(idx, 'discountPercent', e.target.value)}
                disabled={disabled}
                className="h-7 text-xs px-1.5 text-right border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
              />
            </div>
            <div className="flex items-center px-1 py-1">
              <Select
                value={String(item.vatRate)}
                onValueChange={(v) => updateItem(idx, 'vatRate', parseFloat(v))}
                disabled={disabled}
              >
                <SelectTrigger className="h-7 text-xs px-1.5 border-0 bg-transparent focus:ring-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>
                      {r.value}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end px-2 py-1 text-xs tabular-nums font-medium">
              {fmt(item.lineTotal)}
            </div>
            <div className="flex items-center justify-center px-1 py-1">
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add item button */}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5 h-8">
            <PackageSearch className="h-3.5 w-3.5" />
            {t('qop.lineItems.addCatalog', 'Katalogartikel')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            {t('qop.lineItems.addFreeText', 'Freitextposition')}
          </Button>
        </div>
      )}

      {/* Totals summary */}
      {value.length > 0 && (
        <div className="self-end w-72 rounded-lg border border-border overflow-hidden">
          <div className="divide-y divide-border">
            <div className="flex justify-between px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t('qop.lineItems.subtotal', 'Zwischensumme')}</span>
              <span className="tabular-nums font-medium">{fmt(totals.subtotal)}</span>
            </div>
            {totals.vatBreakdown.map((v) => (
              <div key={v.rate} className="flex justify-between px-4 py-1.5 text-xs text-muted-foreground">
                <span>MwSt {v.rate}% ({t('qop.lineItems.vatOn', 'auf')} {fmt(v.base)})</span>
                <span className="tabular-nums">{fmt(v.vat)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 bg-muted/30 text-sm font-semibold">
              <span>{t('qop.lineItems.grandTotal', 'Gesamtbetrag')}</span>
              <span className="tabular-nums">{fmt(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}
      <ArticlePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addCatalogItem}
      />
    </div>
  );
}
