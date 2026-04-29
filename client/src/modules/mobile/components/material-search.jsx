'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import { Search, Plus, Trash2, Package, ScanBarcode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { CATALOG_SOURCE } from '../constants/mobile-constants';
import { catalogService } from '../services/catalog-service';
import { useNetworkStatus } from '../hooks/use-network-status';
import { db } from '../db/mobile-db';

const BarcodeScanner = lazy(() =>
  import('./barcode-scanner').then((m) => ({ default: m.BarcodeScanner }))
);

const UNIT_OPTIONS = ['Stk', 'Lfm', 'kg', 'l', 'Set', 'Paar', 'h'];

export function MaterialSearch({ items = [], onChange, disabled }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const isOnline = useNetworkStatus();

  const search = useCallback(
    async (q) => {
      if (!q || q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        if (isOnline) {
          const data = await catalogService.search(q, CATALOG_SOURCE.ALL, undefined, 20);
          setResults(Array.isArray(data) ? data : data?.items || []);
        } else {
          const local = await db.catalogItems
            .filter((item) => item.description?.toLowerCase().includes(q.toLowerCase()))
            .limit(20)
            .toArray();
          setResults(local);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [isOnline]
  );

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) {
      search(val);
    } else {
      setResults([]);
    }
  };

  const addFromCatalog = (catalogItem) => {
    const newItem = {
      catalogSource: catalogItem.catalog_source || CATALOG_SOURCE.INTERNAL,
      catalogItemId: catalogItem.id || '',
      description: catalogItem.description || catalogItem.name || '',
      quantity: 1,
      unit: catalogItem.unit || 'Stk',
    };
    onChange([...items, newItem]);
    setQuery('');
    setResults([]);
    setShowSearch(false);
  };

  const addCustomItem = () => {
    onChange([
      ...items,
      {
        catalogSource: CATALOG_SOURCE.CUSTOM,
        catalogItemId: '',
        description: '',
        quantity: 1,
        unit: 'Stk',
      },
    ]);
  };

  const updateItem = (index, field, value) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    onChange(updated);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="bg-card border border-border rounded-xl p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {item.catalogSource === CATALOG_SOURCE.CUSTOM ? (
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  placeholder={t('mobile.material.description', 'Materialbeschreibung')}
                  className="h-9 text-sm"
                  disabled={disabled}
                />
              ) : (
                <p className="text-sm font-medium">{item.description}</p>
              )}
              {item.catalogItemId && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.catalogSource} · {item.catalogItemId}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeItem(idx)}
              disabled={disabled}
              className="h-9 w-9 p-0 text-destructive hover:text-destructive"
              aria-label={t('mobile.common.delete', 'Löschen')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="w-24">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                className="h-9 text-sm"
                disabled={disabled}
              />
            </div>
            <div className="w-28">
              <Select
                value={item.unit}
                onValueChange={(val) => updateItem(idx, 'unit', val)}
                disabled={disabled}
              >
                <SelectTrigger size="sm" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onScan={(code) => {
              setShowScanner(false);
              setQuery(code);
              setShowSearch(true);
              search(code);
            }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {showSearch ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={handleSearchChange}
                placeholder={t('mobile.material.searchPlaceholder', 'Material suchen...')}
                className="pl-9 h-10"
                autoFocus
                disabled={disabled}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowScanner(true)}
              disabled={disabled}
              className="h-10 w-10 p-0 shrink-0"
              aria-label={t('mobile.material.scan', 'Scannen')}
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>
          {searching && (
            <p className="text-xs text-muted-foreground px-1">
              {t('mobile.material.searching', 'Suche...')}
            </p>
          )}
          {results.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={r.id || i}
                  type="button"
                  onClick={() => addFromCatalog(r)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted transition-colors border-b border-border last:border-b-0"
                >
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{r.description || r.name}</p>
                    {r.catalog_source && (
                      <p className="text-xs text-muted-foreground">{r.catalog_source}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomItem}
              disabled={disabled}
              className="flex-1"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('mobile.material.freeText', 'Freitext')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setQuery('');
                setResults([]);
              }}
            >
              {t('mobile.common.cancel', 'Abbrechen')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowSearch(true)}
          disabled={disabled}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {t('mobile.material.add', 'Material hinzufügen')}
        </Button>
      )}
    </div>
  );
}
