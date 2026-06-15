import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { quotationService } from '../services/quotation-service';
import { orderService } from '../services/order-service';
import { invoiceService } from '../services/invoice-service';
import { searchService } from '../services/search-service';
import { reminderService } from '../services/reminder-service';
import { referenceService } from '../services/reference-service';

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
    queryFn: () => orderService.getBillingPlan(orderId),
    enabled: !!orderId,
    select: (r) => r.data,
  });
}

export function useQopCustomerSearch(query) {
  return useQuery({
    queryKey: ['qop', 'references', 'customers', query],
    queryFn: () => referenceService.searchCustomers(query),
    enabled: query.length >= 2,
    select: (r) => r.data ?? [],
  });
}

export function useQopDepartments() {
  return useQuery({
    queryKey: ['qop', 'references', 'departments'],
    queryFn: () => referenceService.listDepartments(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 5 * 60 * 1000,
  });
}

export function useQopCustomerProjects(customerId) {
  return useQuery({
    queryKey: ['qop', 'references', 'projects', customerId],
    queryFn: () => referenceService.listCustomerProjects(customerId),
    enabled: !!customerId,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useQopReminders(filters = {}) {
  return useQuery({
    queryKey: ['qop', 'reminders', filters],
    queryFn: () => quotationService.listReminders(filters),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    refetchInterval: 60 * 1000,
  });
}

export function useAppointmentReminders(filters = {}) {
  return useQuery({
    queryKey: ['qop', 'appointment-reminders', filters],
    queryFn: () => reminderService.listAppointmentReminders(filters),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    refetchInterval: 60 * 1000,
  });
}

export function useReminderSettings() {
  return useQuery({
    queryKey: ['qop', 'reminder-settings'],
    queryFn: reminderService.getSettings,
    select: (r) => r.data,
  });
}

export function useCustomerDocuments(customerId, filters = {}) {
  return useQuery({
    queryKey: ['qop', 'customer-docs', customerId, filters],
    queryFn: () => searchService.customerDocs(customerId, filters),
    enabled: !!customerId,
    select: (r) => {
      if (Array.isArray(r.data)) return r.data;
      if (Array.isArray(r.data?.documents)) return r.data.documents;
      return [
        ...(r.data?.quotations ?? []).map((doc) => ({ ...doc, documentType: 'quotation', documentNumber: doc.quotationNumber })),
        ...(r.data?.orders ?? []).map((doc) => ({ ...doc, documentType: 'order', documentNumber: doc.orderNumber })),
        ...(r.data?.invoices ?? []).map((doc) => ({ ...doc, documentType: 'invoice', documentNumber: doc.invoiceNumber })),
      ];
    },
  });
}

export function useProjectDocuments(projectId, filters = {}) {
  return useQuery({
    queryKey: ['qop', 'project-docs', projectId, filters],
    queryFn: () => searchService.projectDocs(projectId, filters),
    enabled: !!projectId,
    select: (r) => {
      if (Array.isArray(r.data)) return r.data;
      if (Array.isArray(r.data?.documents)) return r.data.documents;
      return [
        ...(r.data?.quotations ?? []).map((doc) => ({ ...doc, documentType: 'quotation', documentNumber: doc.quotationNumber })),
        ...(r.data?.orders ?? []).map((doc) => ({ ...doc, documentType: 'order', documentNumber: doc.orderNumber })),
        ...(r.data?.invoices ?? []).map((doc) => ({ ...doc, documentType: 'invoice', documentNumber: doc.invoiceNumber })),
      ];
    },
  });
}
