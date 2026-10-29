export function buildNotificationDeepLink(entityType, entityId) {
  if (!entityType || !entityId) return null;
  const id = entityId.toString();

  switch (entityType) {
    case 'Task':
      return `/tasks?taskId=${id}`;
    case 'Meeting':
      return `/scheduling/meetings?meetingId=${id}`;
    case 'Assignment':
      return `/scheduling/calendar?assignmentId=${id}`;
    case 'Project':
      return `/projects/${id}`;
    case 'Quotation':
      return `/quotes?quotationId=${id}`;
    case 'Invoice':
      return `/quotes?invoiceId=${id}`;
    case 'ApInvoice':
      return `/accounting/payables?invoiceId=${id}`;
    case 'GeneratedDocument':
      return `/documents?documentId=${id}`;
    case 'MaintenanceInterval':
      return `/crm/maintenance?maintenanceId=${id}`;
    case 'Order':
      return `/field-ops/orders/${id}`;
    case 'WorkReport':
      return `/field-ops/reports?reportId=${id}`;
    case 'Lead':
      return `/leads?detail=${id}`;
    case 'WidgetSubmission':
      return `/admin/integrations/widget/submissions?submissionId=${id}`;
    default:
      return null;
  }
}
