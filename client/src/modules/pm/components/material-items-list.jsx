'use client';

import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArticlePickerDialog } from '@/modules/catalog/components/article-picker-dialog';
import { Plus, Trash2, Package, Search } from 'lucide-react';

export function MaterialItemsList({ control, register, setValue, getValues, language }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'materialOrderDetails.items',
  });

  // index of the row currently picking a catalog article (null = closed)
  const [pickerIndex, setPickerIndex] = useState(null);

  const handleArticleSelect = (snapshot) => {
    if (pickerIndex == null) return;
    const base = `materialOrderDetails.items.${pickerIndex}`;
    setValue?.(`${base}.catalogItemId`, snapshot.catalogArticleId || null, { shouldDirty: true });
    setValue?.(`${base}.catalogSnapshot`, snapshot.catalogSnapshot || null, { shouldDirty: true });
    if (snapshot.name) setValue?.(`${base}.description`, snapshot.name, { shouldDirty: true });
    if (snapshot.unitOfMeasure) setValue?.(`${base}.unit`, snapshot.unitOfMeasure, { shouldDirty: true });
    setPickerIndex(null);
  };

  const clearCatalogLink = (index) => {
    setValue?.(`materialOrderDetails.items.${index}.catalogItemId`, null, { shouldDirty: true });
    setValue?.(`materialOrderDetails.items.${index}.catalogSnapshot`, null, { shouldDirty: true });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{language === 'de' ? 'Materialposten' : 'Material Items'}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => append({ description: '', quantity: 1, unit: '', catalogItemId: null })}
        >
          <Plus className="h-3 w-3 mr-1" />
          {language === 'de' ? 'Position' : 'Item'}
        </Button>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => {
            const catalogItemId = getValues?.(`materialOrderDetails.items.${index}.catalogItemId`);
            return (
              <div key={field.id} className="space-y-1">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Input
                      {...register(`materialOrderDetails.items.${index}.description`)}
                      placeholder={language === 'de' ? 'Beschreibung' : 'Description'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min={1}
                      {...register(`materialOrderDetails.items.${index}.quantity`, { valueAsNumber: true })}
                      placeholder={language === 'de' ? 'Menge' : 'Qty'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      {...register(`materialOrderDetails.items.${index}.unit`)}
                      placeholder={language === 'de' ? 'Einheit' : 'Unit'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={language === 'de' ? 'Katalogartikel auswählen' : 'Pick catalog article'}
                    onClick={() => setPickerIndex(index)}
                  >
                    <Package className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {catalogItemId && (
                  <div className="flex items-center gap-1.5 pl-0.5">
                    <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                      <Package className="h-2.5 w-2.5" />
                      {language === 'de' ? 'Katalogartikel verknüpft' : 'Catalog article linked'}
                    </Badge>
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-destructive underline"
                      onClick={() => clearCatalogLink(index)}
                    >
                      {language === 'de' ? 'Entfernen' : 'Unlink'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">
          {language === 'de' ? 'Keine Materialposten hinzugefügt.' : 'No material items added.'}
        </p>
      )}

      <ArticlePickerDialog
        open={pickerIndex != null}
        onClose={() => setPickerIndex(null)}
        onSelect={handleArticleSelect}
      />
    </div>
  );
}
