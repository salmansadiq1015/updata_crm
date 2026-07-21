'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '@/modules/mobile/services/order-service';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

const FIELD_OPS_KEY = ['field-ops', 'orders', 'all'];

export function useFieldOpsOrderMutations() {
  const queryClient = useQueryClient();
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: FIELD_OPS_KEY });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.list() });
  };

  const invalidateDetail = (id) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.history(id) });
  };

  const createOrder = useMutation({
    mutationFn: (data) => orderService.createOrder(data),
    onSuccess: () => {
      invalidateList();
      showSuccess(de ? 'Einsatz erstellt' : 'Assignment created');
    },
    onError: (err) => showError(err.message || (de ? 'Einsatz konnte nicht erstellt werden' : 'Assignment could not be created')),
  });

  const updateOrder = useMutation({
    mutationFn: ({ id, data }) => orderService.updateOrder(id, data),
    onSuccess: (_, { id }) => {
      invalidateList();
      invalidateDetail(id);
      showSuccess(de ? 'Einsatz aktualisiert' : 'Assignment updated');
    },
    onError: (err) => showError(err.message || (de ? 'Aktualisierung fehlgeschlagen' : 'Update failed')),
  });

  const deleteOrder = useMutation({
    mutationFn: (id) => orderService.deleteOrder(id),
    onSuccess: () => {
      invalidateList();
      showSuccess(de ? 'Einsatz geloescht' : 'Assignment deleted');
    },
    onError: (err) => showError(err.message || (de ? 'Loeschen fehlgeschlagen' : 'Delete failed')),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids) => orderService.bulkDeleteOrders(ids),
    onSuccess: (_, ids) => {
      invalidateList();
      showSuccess(de ? `${ids.length} Einsaetze geloescht` : `${ids.length} orders deleted`);
    },
    onError: (err) => showError(err.message || (de ? 'Massenloeschung fehlgeschlagen' : 'Bulk delete failed')),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => orderService.updateOrderStatus(id, status),
    onSuccess: (_, { id }) => {
      invalidateList();
      invalidateDetail(id);
      showSuccess(de ? 'Status aktualisiert' : 'Status updated');
    },
    onError: (err) => showError(err.message || (de ? 'Statusaktualisierung fehlgeschlagen' : 'Status update failed')),
  });

  const exportOrders = useMutation({
    mutationFn: (filters) => orderService.exportOrders(filters),
    onSuccess: (blob) => {
      downloadBlob(blob, `orders-${new Date().toISOString().slice(0, 10)}.csv`);
      showSuccess(de ? 'Export erstellt' : 'Export created');
    },
    onError: (err) => showError(err.message || (de ? 'Export fehlgeschlagen' : 'Export failed')),
  });

  const importOrders = useMutation({
    mutationFn: orderService.importOrders,
    onSuccess: (result, variables) => {
      if (!variables?.dryRun && result?.created > 0) {
        invalidateList();
      }
      const message = variables?.dryRun
        ? (de ? 'Import geprueft' : 'Import validated')
        : (de ? `${result?.created ?? 0} Einsaetze importiert` : `${result?.created ?? 0} orders imported`);
      showSuccess(message);
    },
    onError: (err) => showError(err.message || (de ? 'Import fehlgeschlagen' : 'Import failed')),
  });

  const downloadImportTemplate = useMutation({
    mutationFn: orderService.downloadImportTemplate,
    onSuccess: (blob) => {
      downloadBlob(blob, 'order-import-template.csv');
      showSuccess(de ? 'Referenzdatei geladen' : 'Reference file downloaded');
    },
    onError: (err) => showError(err.message || (de ? 'Referenzdatei konnte nicht geladen werden' : 'Reference file could not be downloaded')),
  });

  return {
    createOrder,
    updateOrder,
    deleteOrder,
    bulkDelete,
    updateStatus,
    exportOrders,
    importOrders,
    downloadImportTemplate,
  };
}

function downloadBlob(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
