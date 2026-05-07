import { useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationService } from '../services/quotation-service';
import { orderService } from '../services/order-service';
import { invoiceService } from '../services/invoice-service';

export function useQuotationMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'quotations'] });

  const createQuotation = useMutation({ mutationFn: quotationService.create, onSuccess: invalidateList });
  const updateQuotation = useMutation({
    mutationFn: ({ id, data }) => quotationService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'quotations', 'detail', id] });
      invalidateList();
    },
  });
  const deleteQuotation = useMutation({ mutationFn: quotationService.remove, onSuccess: invalidateList });
  const duplicateQuotation = useMutation({ mutationFn: quotationService.duplicate, onSuccess: invalidateList });
  const sendQuotation = useMutation({
    mutationFn: quotationService.send,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['qop', 'quotations', 'detail', id] });
      invalidateList();
    },
  });
  const convertQuotation = useMutation({
    mutationFn: ({ id, selectedLineItemIds }) => quotationService.convert(id, { selectedLineItemIds }),
    onSuccess: () => {
      invalidateList();
      qc.invalidateQueries({ queryKey: ['qop', 'orders'] });
    },
  });
  const transitionQuotationStatus = useMutation({
    mutationFn: ({ id, targetStatus, reason }) => quotationService.transitionStatus(id, targetStatus, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'quotations', 'detail', id] });
      invalidateList();
    },
  });

  return {
    createQuotation, updateQuotation, deleteQuotation,
    duplicateQuotation, sendQuotation, convertQuotation, transitionQuotationStatus,
  };
}

export function useOrderMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'orders'] });

  const updateOrder = useMutation({
    mutationFn: ({ id, data }) => orderService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'orders', 'detail', id] });
      invalidateList();
    },
  });
  const transitionOrderStatus = useMutation({
    mutationFn: ({ id, targetStatus, reason }) => orderService.transitionStatus(id, targetStatus, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'orders', 'detail', id] });
      invalidateList();
    },
  });

  return { updateOrder, transitionOrderStatus };
}

export function useInvoiceMutations() {
  const qc = useQueryClient();
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['qop', 'invoices'] });

  const createInvoice = useMutation({ mutationFn: invoiceService.create, onSuccess: invalidateList });
  const createAdvanceInvoice = useMutation({ mutationFn: invoiceService.createAdvance, onSuccess: invalidateList });
  const createFinalInvoice = useMutation({ mutationFn: invoiceService.createFinal, onSuccess: invalidateList });
  const finalizeInvoice = useMutation({
    mutationFn: invoiceService.finalize,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['qop', 'invoices', 'detail', id] });
      invalidateList();
    },
  });
  const sendInvoice = useMutation({
    mutationFn: invoiceService.send,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['qop', 'invoices', 'detail', id] });
      invalidateList();
    },
  });
  const recordPayment = useMutation({
    mutationFn: ({ id, data }) => invoiceService.recordPayment(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'invoices', 'detail', id] });
      qc.invalidateQueries({ queryKey: ['qop', 'invoices', 'payments', id] });
      invalidateList();
    },
  });
  const transitionInvoiceStatus = useMutation({
    mutationFn: ({ id, targetStatus, reason }) => invoiceService.transitionStatus(id, targetStatus, reason),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'invoices', 'detail', id] });
      invalidateList();
    },
  });

  return {
    createInvoice, createAdvanceInvoice, createFinalInvoice,
    finalizeInvoice, sendInvoice, recordPayment, transitionInvoiceStatus,
  };
}
