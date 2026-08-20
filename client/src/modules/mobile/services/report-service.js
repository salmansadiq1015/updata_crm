import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function unwrapData(value) {
  return value?.data ?? value ?? null;
}

function entityId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || value.id || '';
}

function normalizeReport(report) {
  if (!report) return report;
  const id = report._id || report.id;
  const order = report.orderId ?? report.order_id;
  const project = report.projectId ?? report.project_id;
  const technician = report.technicianId ?? report.technician_id;
  const materialItems = report.materialItems ?? report.material_items ?? [];
  const reportDate = report.reportDate ?? report.report_date;
  const arrivalTime = report.arrivalTime ?? report.arrival_time;
  const departureTime = report.departureTime ?? report.departure_time;
  const workPerformed = report.workPerformed ?? report.work_performed ?? '';
  const nextSteps = report.nextSteps ?? report.next_steps ?? '';
  const followUpNeeded = report.followUpNeeded ?? report.follow_up_needed ?? false;
  const technicianNotes = report.technicianNotes ?? report.technician_notes ?? '';
  const customerSignature = report.customerSignature ?? report.customer_signature ?? '';
  const customerSignerName = report.customerSignerName ?? report.customer_signer_name ?? '';
  const billableMinutes = report.billableMinutes ?? report.billable_minutes ?? 0;
  const nonBillableMinutes = report.nonBillableMinutes ?? report.non_billable_minutes ?? 0;
  const submittedAt = report.submittedAt ?? report.submitted_at;

  return {
    ...report,
    _id: id,
    id,
    orderId: order,
    order_id: entityId(order),
    projectId: project,
    project_id: entityId(project),
    technicianId: technician,
    technician_id: entityId(technician),
    reportDate,
    report_date: reportDate,
    arrivalTime,
    arrival_time: arrivalTime,
    departureTime,
    departure_time: departureTime,
    workPerformed,
    work_performed: workPerformed,
    nextSteps,
    next_steps: nextSteps,
    followUpNeeded,
    follow_up_needed: followUpNeeded,
    technicianNotes,
    technician_notes: technicianNotes,
    customerSignature,
    customer_signature: customerSignature,
    customerSignerName,
    customer_signer_name: customerSignerName,
    materialItems,
    material_items: materialItems,
    billableMinutes,
    billable_minutes: billableMinutes,
    nonBillableMinutes,
    non_billable_minutes: nonBillableMinutes,
    submittedAt,
    submitted_at: submittedAt,
  };
}

function normalizeReports(reports) {
  return Array.isArray(reports) ? reports.map(normalizeReport) : [];
}

export const reportService = {
  async getReportsByOrder(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_REPORTS(orderId));
    return normalizeReports(Array.isArray(res.data) ? res.data : (res.data?.data ?? []));
  },

  async getAllReports(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORTS, { params: filters });
    return {
      data: normalizeReports(Array.isArray(res.data) ? res.data : (res.data?.data ?? [])),
      pagination: res.pagination || res.data?.pagination || null,
    };
  },

  async getReportSummary(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORTS_SUMMARY, { params: filters });
    return unwrapData(res);
  },

  async exportReports(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORTS_EXPORT, {
      params: filters,
      responseType: 'blob',
    });
    return res.data;
  },

  async importReports({ file, dryRun = false } = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('dryRun', dryRun ? 'true' : 'false');
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORTS_IMPORT, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrapData(res);
  },

  async downloadImportTemplate() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORTS_IMPORT_TEMPLATE, {
      responseType: 'blob',
    });
    return res.data;
  },

  async createReport(orderId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_REPORTS(orderId), data);
    return normalizeReport(unwrapData(res));
  },

  async generateReport(orderId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_REPORTS_GENERATE(orderId), data);
    return normalizeReport(unwrapData(res));
  },

  async getReport(reportId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId));
    return normalizeReport(unwrapData(res));
  },

  async updateReport(reportId, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId), data);
    return normalizeReport(unwrapData(res));
  },

  async approveReport(reportId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_APPROVE(reportId));
    return normalizeReport(unwrapData(res));
  },

  async rejectReport(reportId, rejectionNote) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_REJECT(reportId), { rejectionNote });
    return normalizeReport(unwrapData(res));
  },

  async markReportInvoiced(reportId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_MARK_INVOICED(reportId), data);
    return normalizeReport(unwrapData(res));
  },

  async createInvoiceFromReport(reportId, data = {}) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_CREATE_INVOICE(reportId), data);
    return normalizeReport(unwrapData(res));
  },

  async generateReportDocument(reportId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_GENERATE_DOC(reportId));
    return unwrapData(res);
  },

  async getReportHistory(reportId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORT_HISTORY(reportId), { params });
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  },

  async deleteReport(reportId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId));
    return res.data;
  },

  async bulkDeleteReports(ids) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORTS_BULK_DELETE, { ids });
    return res.data;
  },

  async archiveReport(reportId) {
    const res = await apiClient.patch(ENDPOINTS.MOBILE.REPORT_ARCHIVE(reportId));
    return res.data;
  },

  async unarchiveReport(reportId) {
    const res = await apiClient.patch(ENDPOINTS.MOBILE.REPORT_UNARCHIVE(reportId));
    return res.data;
  },

  async bulkArchiveReports(ids) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORTS_BULK_ARCHIVE, { ids });
    return res.data;
  },

  async submitReport(reportId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_SUBMIT(reportId));
    return normalizeReport(unwrapData(res));
  },
};

export { normalizeReport, normalizeReports };
