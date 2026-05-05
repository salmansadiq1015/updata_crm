import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { quotationService } from '../services/quotation-service';
import { orderService } from '../services/order-service';
import { invoiceService } from '../services/invoice-service';

const selectArray = (data) => (Array.isArray(data) ? data : (data?.data ?? data?.items ?? []));
const selectOne = (data) => data?.data ?? data;

// ── Quotations ────────────────────────────────────────────────────────────────

export function useQuotations(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.quotations(filters),
    queryFn: () => quotationService.list(filters),
    select: selectArray,
  });
}

export function useQuotationDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.quotationDetail(id),
    queryFn: () => quotationService.getById(id),
    enabled: !!id,
    select: selectOne,
  });
}

export function useQuotationHistory(id) {
  return useQuery({
    queryKey: queryKeys.qop.quotationHistory(id),
    queryFn: () => quotationService.getHistory(id),
    enabled: !!id,
    select: selectArray,
  });
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function useOrders(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.orders(filters),
    queryFn: () => orderService.list(filters),
    select: selectArray,
  });
}

export function useOrderDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.orderDetail(id),
    queryFn: () => orderService.getById(id),
    enabled: !!id,
    select: selectOne,
  });
}

export function useOrderInvoices(id) {
  return useQuery({
    queryKey: queryKeys.qop.orderInvoices(id),
    queryFn: () => orderService.getInvoices(id),
    enabled: !!id,
    select: selectArray,
  });
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export function useInvoices(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.invoices(filters),
    queryFn: () => invoiceService.list(filters),
    select: selectArray,
  });
}

export function useInvoiceDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.invoiceDetail(id),
    queryFn: () => invoiceService.getById(id),
    enabled: !!id,
    select: selectOne,
  });
}

export function useInvoicePayments(id) {
  return useQuery({
    queryKey: queryKeys.qop.invoicePayments(id),
    queryFn: () => invoiceService.getPayments(id),
    enabled: !!id,
    select: selectArray,
  });
}
