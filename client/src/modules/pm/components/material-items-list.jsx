'use client';

import { useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

export function MaterialItemsList({ control, register, language }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'materialOrderDetails.items',
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{language === 'de' ? 'Materialposten' : 'Material Items'}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => append({ description: '', quantity: 1, unit: '' })}
        >
          <Plus className="h-3 w-3 mr-1" />
          {language === 'de' ? 'Position' : 'Item'}
        </Button>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
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
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">
          {language === 'de' ? 'Keine Materialposten hinzugefügt.' : 'No material items added.'}
        </p>
      )}
    </div>
  );
}
