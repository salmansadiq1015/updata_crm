import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { quotationService } from '../services/quotation-service';
import { orderService } from '../services/order-service';
import { invoiceService } from '../services/invoice-service';

export function useQuotationMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'quotations'] });
  const invalidateDetail = (id) => qc.invalidateQueries({ queryKey: queryKeys.qop.quotationDetail(id) });

  const create = useMutation({ mutationFn: quotationService.create, onSuccess: invalidateList });
  const update = useMutation({
    mutationFn: ({ id, data }) => quotationService.update(id, data),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });
  const remove = useMutation({ mutationFn: quotationService.remove, onSuccess: invalidateList });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => quotationService.updateStatus(id, status),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });
  const send = useMutation({
    mutationFn: (id) => quotationService.send(id),
    onSuccess: (_, id) => { invalidateDetail(id); invalidateList(); },
  });
  const convert = useMutation({
    mutationFn: (id) => quotationService.convert(id),
    onSuccess: () => { invalidateList(); qc.invalidateQueries({ queryKey: ['qop', 'orders'] }); },
  });
  const duplicate = useMutation({ mutationFn: (id) => quotationService.duplicate(id), onSuccess: invalidateList });

  return { create, update, remove, updateStatus, send, convert, duplicate };
}

export function useOrderMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'orders'] });
  const invalidateDetail = (id) => qc.invalidateQueries({ queryKey: queryKeys.qop.orderDetail(id) });

  const create = useMutation({ mutationFn: orderService.create, onSuccess: invalidateList });
  const update = useMutation({
    mutationFn: ({ id, data }) => orderService.update(id, data),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => orderService.updateStatus(id, status),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });

  return { create, update, updateStatus };
}

export function useInvoiceMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'invoices'] });
  const invalidateDetail = (id) => qc.invalidateQueries({ queryKey: queryKeys.qop.invoiceDetail(id) });

  const create = useMutation({ mutationFn: invoiceService.create, onSuccess: invalidateList });
  const update = useMutation({
    mutationFn: ({ id, data }) => invoiceService.update(id, data),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => invoiceService.updateStatus(id, status),
    onSuccess: (_, { id }) => { invalidateDetail(id); invalidateList(); },
  });
  const finalize = useMutation({
    mutationFn: (id) => invoiceService.finalize(id),
    onSuccess: (_, id) => { invalidateDetail(id); invalidateList(); },
  });
  const send = useMutation({
    mutationFn: (id) => invoiceService.send(id),
    onSuccess: (_, id) => { invalidateDetail(id); invalidateList(); },
  });
  const addPayment = useMutation({
    mutationFn: ({ id, data }) => invoiceService.addPayment(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.qop.invoicePayments(id) });
      invalidateDetail(id);
      invalidateList();
    },
  });

  return { create, update, updateStatus, finalize, send, addPayment };
}
