'use client';

import { useState, useMemo } from 'react';
import { Trash2, Pencil, Lock, Search, Ruler } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ListPage } from '@/components/ui/list-page';
import { TablePagination } from '@/components/ui/table-pagination';
import { useUnits } from '../hooks/use-unit-queries';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import { UomFormDialog } from './uom-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { useClientPagination } from '@/shared/hooks/use-client-pagination';

const PAGE_SIZE = 10;

export function UomManagementTable() {
  const { t } = useLanguage();
  const { data: units = [], isLoading, isError } = useUnits();
  const { deleteUnit } = useUnitMutations();
  const [search, setSearch] = useState('');
  const [dialogUnit, setDialogUnit] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) =>
      [u.code, u.nameDe, u.nameFr, u.nameIt].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [units, search]);

  const { page, setPage, pageItems, total } = useClientPagination(filtered, PAGE_SIZE);

  const openCreate = () => { setDialogUnit(null); setDialogOpen(true); };
  const openEdit = (u) => { setDialogUnit(u); setDialogOpen(true); };

  return (
    <ListPage>
      <ListPage.Toolbar>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('catalog.units.searchPlaceholder', 'Search units...')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{total} {t('common.results', 'results')}</span>
          <Button size="sm" onClick={openCreate}>+ {t('catalog.units.create')}</Button>
        </div>
      </ListPage.Toolbar>

      <ListPage.Body
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && total === 0}
        errorMessage={t('common.errorLoading', 'Could not load data')}
        empty={{ icon: Ruler, title: t('catalog.units.empty'), description: t('catalog.units.emptyHint', 'Add your first unit of measure.'), action: <Button size="sm" onClick={openCreate}>+ {t('catalog.units.create')}</Button> }}
      >
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t('catalog.units.code')}</TableHead>
                <TableHead>{t('catalog.units.nameDe')}</TableHead>
                <TableHead>{t('catalog.units.nameFr')}</TableHead>
                <TableHead>{t('catalog.units.nameIt')}</TableHead>
                <TableHead>{t('catalog.units.baseUnit')}</TableHead>
                <TableHead>{t('catalog.units.conversionFactor')}</TableHead>
                <TableHead className="text-right">{t('catalog.units.usage')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((unit) => (
                <TableRow key={unit.code}>
                  <TableCell className="font-mono font-medium">
                    {unit.code}
                    {unit.isSystem && <Lock className="ml-1.5 inline h-3 w-3 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>{unit.nameDe}</TableCell>
                  <TableCell>{unit.nameFr}</TableCell>
                  <TableCell>{unit.nameIt}</TableCell>
                  <TableCell>{unit.baseUnitCode ?? '—'}</TableCell>
                  <TableCell>{unit.conversionFactor ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{unit.usageCount ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={unit.isSystem} onClick={() => openEdit(unit)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {unit.isSystem || (unit.usageCount ?? 0) > 0 ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('catalog.units.deleteTitle', null, { code: unit.code })}</AlertDialogTitle>
                              <AlertDialogDescription>{t('common.cannotUndo')}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteUnit.mutate(unit.code)}>
                                {t('common.delete')}
                              </AlertDialogAction>
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
          <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </ListPage.Body>

      <UomFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} unit={dialogUnit} />
    </ListPage>
  );
}
