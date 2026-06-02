'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sparePartService } from '@/modules/crm/services/spare-part-service';
import { useSparePartMutations } from '@/modules/crm/hooks/use-spare-part-mutations';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmptyState } from '@/shared/components/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Package, Hash, Factory, ShoppingCart, Loader2 } from 'lucide-react';
import {
  SPARE_PART_CATEGORY_META,
  SPARE_PART_ORDER_STATUS_META,
  SPARE_PART_ORDER_URGENCY_META,
} from '@/modules/crm/constants/crm-constants';

export function InstallationSparePartsPanel({ installationId }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');

  const [flagTarget, setFlagTarget] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.spareParts.byInstallation(installationId),
    queryFn: () => sparePartService.getByInstallation(installationId),
    enabled: !!installationId,
  });

  const { flagForOrdering } = useSparePartMutations({
    onFlagOrder: () => setFlagTarget(null),
  });

  if (isLoading) return <SparePartsSkeleton />;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-white/6 bg-[#0D1117] p-8">
        <EmptyState
          title={t('crm.spareParts.empty', 'Keine Ersatzteile verknüpft')}
          description={t('crm.spareParts.emptyDesc', 'Dieser Installation sind keine Ersatzteile zugeordnet.')}
          icon={Package}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-2">
      {items.map((item) => (
        <SparePartRow
          key={item._id}
          item={item}
          canWrite={canWrite}
          onFlag={() => setFlagTarget(item)}
          t={t}
        />
      ))}

      <FlagOrderDialog
        item={flagTarget}
        installationId={installationId}
        onOpenChange={(v) => !v && setFlagTarget(null)}
        flagMutation={flagForOrdering}
        t={t}
      />
    </div>
  );
}

function SparePartRow({ item, canWrite, onFlag, t }) {
  const part = item.sparePartId || {};
  const catMeta = part.category ? SPARE_PART_CATEGORY_META[part.category] : null;
  const statusMeta = item.orderStatus ? SPARE_PART_ORDER_STATUS_META[item.orderStatus] : null;
  const urgencyMeta = item.orderUrgency ? SPARE_PART_ORDER_URGENCY_META[item.orderUrgency] : null;
  const isOpenOrder = item.orderStatus === 'requested' || item.orderStatus === 'ordered';

  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-3.5 hover:border-white/10 hover:bg-white/4 transition-all">
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 shrink-0 rounded-lg flex items-center justify-center', catMeta?.bg || 'bg-white/5')}>
          <Package className={cn('h-4 w-4', catMeta?.color || 'text-white/40')} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[13px] font-semibold text-white/80 truncate">
              {part.name || t('crm.spareParts.unknownPart', 'Unbekanntes Teil')}
            </p>
            {catMeta && (
              <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md', catMeta.bg, catMeta.color)}>
                {t(`crm.spareParts.category.${part.category}`, catMeta.label)}
              </span>
            )}
            {statusMeta && (
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md', statusMeta.bg, statusMeta.color)}>
                <span className={cn('h-1 w-1 rounded-full', statusMeta.dot)} />
                {t(`crm.spareParts.orderStatus.${item.orderStatus}`, statusMeta.label)}
              </span>
            )}
            {item.needsOrdering && urgencyMeta && isOpenOrder && (
              <span className={cn('inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md', urgencyMeta.bg, urgencyMeta.color)}>
                {t(`crm.spareParts.urgency.${item.orderUrgency}`, urgencyMeta.label)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-xs text-white/40 flex-wrap">
            {part.partNumber && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Hash className="h-2.5 w-2.5" /> {part.partNumber}
              </span>
            )}
            {part.manufacturer && (
              <span className="inline-flex items-center gap-1">
                <Factory className="h-2.5 w-2.5" /> {part.manufacturer}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {t('crm.spareParts.quantity', 'Menge')}: <span className="text-white/60 font-medium">{item.quantity ?? 1}</span>
            </span>
          </div>
        </div>

        {canWrite && !isOpenOrder && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0 border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white/80"
            onClick={onFlag}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> {t('crm.spareParts.flagOrder', 'Bestellen')}
          </Button>
        )}
      </div>
    </div>
  );
}

function FlagOrderDialog({ item, installationId, onOpenChange, flagMutation, t }) {
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState('normal');
  const [notes, setNotes] = useState('');

  const open = !!item;
  const part = item?.sparePartId || {};

  // Reset form whenever a new part is targeted.
  const targetId = item?._id;
  const [lastTarget, setLastTarget] = useState(null);
  if (open && targetId !== lastTarget) {
    setLastTarget(targetId);
    setQuantity(item.quantity ?? 1);
    setUrgency('normal');
    setNotes('');
  }

  const submit = () => {
    flagMutation.mutate({
      installationId,
      sparePartId: part._id || part.id,
      data: {
        quantity: Number(quantity) || 1,
        urgency,
        notes: notes.trim() || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col rounded-2xl border border-white/8 bg-[#0D1117] shadow-2xl">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
              <ShoppingCart className="h-5 w-5 text-amber-400" />
            </div>
            <DialogTitle className="text-[16px] font-semibold text-white/90">
              {t('crm.spareParts.flagOrderTitle', 'Ersatzteil bestellen')}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-white/55">
            {part.name}{part.partNumber ? ` · ${part.partNumber}` : ''}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-white/60 block">
                {t('crm.spareParts.orderQuantity', 'Menge')}
              </Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="bg-white/4 border-white/10 rounded-lg h-9 text-[13px] text-white/90 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-white/60 block">
                {t('crm.spareParts.orderUrgency', 'Dringlichkeit')}
              </Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger className="bg-white/4 border-white/10 rounded-lg h-9 text-[13px] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SPARE_PART_ORDER_URGENCY_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {t(`crm.spareParts.urgency.${key}`, meta.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium text-white/60 block">
              {t('crm.spareParts.orderNotes', 'Notizen')}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('crm.spareParts.orderNotesPlaceholder', 'Optionale Bestellnotiz')}
              rows={3}
              className="bg-white/4 border-white/10 rounded-lg text-[13px] text-white/90 placeholder:text-white/25 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={flagMutation.isPending}
            className="text-white/55 hover:text-white/80 hover:bg-white/5"
          >
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button
            onClick={submit}
            disabled={flagMutation.isPending}
            className="gap-2 bg-amber-500 text-white hover:bg-amber-600"
          >
            {flagMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('crm.spareParts.flagOrderConfirm', 'Bestellung anfragen')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SparePartsSkeleton() {
  return (
    <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-white/2 p-3.5 flex gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
