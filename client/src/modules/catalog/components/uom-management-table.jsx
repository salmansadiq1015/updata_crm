'use client';

import { useState } from 'react';
import { Trash2, Pencil, Lock } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useUnits } from '../hooks/use-unit-queries';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import { UomFormDialog } from './uom-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';

export function UomManagementTable() {
  const { t } = useLanguage();
  const { data: units = [], isLoading } = useUnits();
  const { deleteUnit } = useUnitMutations();
  const [dialogUnit, setDialogUnit] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = () => { setDialogUnit(null); setDialogOpen(true); };
  const openEdit = (u) => { setDialogUnit(u); setDialogOpen(true); };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading units...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end px-1">
        <Button size="sm" onClick={openCreate}>+ {t('catalog.units.create')}</Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t('catalog.units.code')}</TableHead>
              <TableHead>{t('catalog.units.nameDe')}</TableHead>
              <TableHead>{t('catalog.units.nameFr')}</TableHead>
              <TableHead>{t('catalog.units.nameIt')}</TableHead>
              <TableHead>{t('catalog.units.baseUnit')}</TableHead>
              <TableHead>{t('catalog.units.conversionFactor')}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No units defined.</TableCell>
              </TableRow>
            ) : units.map((unit) => (
              <TableRow key={unit.code}>
                <TableCell className="font-mono font-medium">
                  {unit.code}
                  {unit.isSystem && <Lock className="inline ml-1.5 w-3 h-3 text-muted-foreground" />}
                </TableCell>
                <TableCell>{unit.nameDe}</TableCell>
                <TableCell>{unit.nameFr}</TableCell>
                <TableCell>{unit.nameIt}</TableCell>
                <TableCell>{unit.baseUnitCode ?? '—'}</TableCell>
                <TableCell>{unit.conversionFactor ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={unit.isSystem} onClick={() => openEdit(unit)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {unit.isSystem || (unit.usageCount ?? 0) > 0 ? (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete unit &quot;{unit.code}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteUnit.mutate(unit.code)}
                            >Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <UomFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} unit={dialogUnit} />
    </div>
  );
}
