import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { quotationService } from '../services/quotation-service';
import { orderService } from '../services/order-service';
import { invoiceService } from '../services/invoice-service';
import { searchService } from '../services/search-service';

export function useQuotations(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.quotations(filters),
    queryFn: () => quotationService.list(filters),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useQuotationDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.quotationDetail(id),
    queryFn: () => quotationService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useQuotationHistory(id) {
  return useQuery({
    queryKey: queryKeys.qop.quotationHistory(id),
    queryFn: () => quotationService.getHistory(id),
    enabled: !!id,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useOrders(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.orders(filters),
    queryFn: () => orderService.list(filters),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useOrderDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.orderDetail(id),
    queryFn: () => orderService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useOrderInvoices(id) {
  return useQuery({
    queryKey: queryKeys.qop.orderInvoices(id),
    queryFn: () => orderService.getInvoices(id),
    enabled: !!id,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useOrderHistory(id) {
  return useQuery({
    queryKey: queryKeys.qop.orderHistory(id),
    queryFn: () => orderService.getHistory(id),
    enabled: !!id,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useInvoices(filters = {}) {
  return useQuery({
    queryKey: queryKeys.qop.invoices(filters),
    queryFn: () => invoiceService.list(filters),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useInvoiceDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.invoiceDetail(id),
    queryFn: () => invoiceService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useInvoicePayments(id) {
  return useQuery({
    queryKey: queryKeys.qop.invoicePayments(id),
    queryFn: () => invoiceService.getPayments(id),
    enabled: !!id,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useInvoiceHistory(id) {
  return useQuery({
    queryKey: queryKeys.qop.invoiceHistory(id),
    queryFn: () => invoiceService.getHistory(id),
    enabled: !!id,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useQopSearch(params = {}) {
  return useQuery({
    queryKey: queryKeys.qop.search(params),
    queryFn: () => searchService.search(params),
    enabled: !!params.q,
    select: (r) => r.data ?? [],
  });
}

export function useQopPipeline() {
  return useQuery({
    queryKey: queryKeys.qop.pipeline(),
    queryFn: () => searchService.pipeline(),
    select: (r) => r.data,
  });
}

export function useInvoiceAging() {
  return useQuery({
    queryKey: queryKeys.qop.aging(),
    queryFn: () => searchService.invoiceAging(),
    select: (r) => r.data,
  });
}

export function useBillingPlan(orderId) {
  return useQuery({
    queryKey: ['qop', 'billing-plan', orderId],
    queryFn: () => apiClient.get(ENDPOINTS.QOP.ORDER_BILLING_PLAN(orderId)),
    enabled: !!orderId,
    select: (r) => r.data,
  });
}

export function useCustomerDocuments(customerId, filters = {}) {
  return useQuery({
    queryKey: ['qop', 'customer-docs', customerId, filters],
    queryFn: () => searchService.customerDocs(customerId, filters),
    enabled: !!customerId,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}
