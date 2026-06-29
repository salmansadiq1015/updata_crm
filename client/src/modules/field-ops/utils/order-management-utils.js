const ACTIVE_ORDER_STATUSES = new Set(['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED']);
const FINAL_ORDER_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
const HIGH_ATTENTION_PRIORITIES = new Set(['HIGH', 'URGENT']);
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function toDateInputValue(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function getNextSevenDayRange(now = Date.now()) {
  const start = startOfDay(new Date(now));
  const end = endOfDay(new Date(start.getTime() + 6 * DAY_MS));
  return {
    dateFrom: toDateInputValue(start),
    dateTo: toDateInputValue(end),
  };
}

export function getOrderId(order) {
  return order?.id || order?._id || '';
}

export function getOrderDisplayNumber(order) {
  return (
    order?.assignmentNumber
    || order?.assignment_number
    || order?.orderNumber
    || order?.order_number
    || getOrderId(order).slice(-6)
    || '-'
  );
}

export function getOrderStartDate(order) {
  return normalizeDate(order?.startDatetime || order?.scheduledStart || order?.scheduled_start);
}

export function getOrderEndDate(order) {
  return normalizeDate(order?.endDatetime || order?.scheduledEnd || order?.scheduled_end);
}

export function getOrderReportStatus(order) {
  return order?.reportStatus || order?.report_status || order?.report?.status || null;
}

export function getOrderDocumentCount(order) {
  return Array.isArray(order?.documents) ? order.documents.length : 0;
}

export function isOrderUnassigned(order) {
  const employee = order?.employeeId || order?.employee_id;
  const employeeId = typeof employee === 'object' ? employee?._id || employee?.id : employee;
  const targetType = order?.assignmentTargetType || order?.assignment_target_type || 'EMPLOYEE';
  const targetId = order?.assignmentTargetId || order?.assignment_target_id;
  return !employeeId && targetType === 'EMPLOYEE' && !targetId;
}

export function isOrderOverdue(order, now = Date.now()) {
  if (!order || FINAL_ORDER_STATUSES.has(order.status)) return false;
  const dueDate = getOrderEndDate(order) || getOrderStartDate(order);
  return Boolean(dueDate && dueDate.getTime() < now);
}

export function isOrderDueToday(order, now = Date.now()) {
  const startDate = getOrderStartDate(order);
  if (!startDate) return false;
  const todayStart = startOfDay(new Date(now)).getTime();
  const todayEnd = endOfDay(new Date(now)).getTime();
  const timestamp = startDate.getTime();
  return timestamp >= todayStart && timestamp <= todayEnd;
}

export function isOrderUpcoming(order, now = Date.now(), days = 7) {
  const startDate = getOrderStartDate(order);
  if (!startDate || FINAL_ORDER_STATUSES.has(order?.status)) return false;
  const lower = startOfDay(new Date(now)).getTime();
  const upper = endOfDay(new Date(lower + Math.max(days - 1, 0) * DAY_MS)).getTime();
  const timestamp = startDate.getTime();
  return timestamp >= lower && timestamp <= upper;
}

export function computeStatusSummaryTotal(summary = {}) {
  return Object.values(summary).reduce((total, value) => total + Number(value || 0), 0);
}

export function computeOrderListMetrics(orders = [], now = Date.now()) {
  const initial = {
    visible: orders.length,
    active: 0,
    completed: 0,
    cancelled: 0,
    highAttention: 0,
    urgent: 0,
    unassigned: 0,
    overdue: 0,
    dueToday: 0,
    upcoming7Days: 0,
    reportsPending: 0,
    documents: 0,
    completionRate: 0,
  };

  const metrics = orders.reduce((acc, order) => {
    const status = order?.status;
    const priority = order?.priority || 'NORMAL';

    const active = ACTIVE_ORDER_STATUSES.has(status);
    if (active) acc.active += 1;
    if (status === 'COMPLETED') acc.completed += 1;
    if (status === 'CANCELLED') acc.cancelled += 1;
    if (HIGH_ATTENTION_PRIORITIES.has(priority)) acc.highAttention += 1;
    if (priority === 'URGENT') acc.urgent += 1;
    if (active && isOrderUnassigned(order)) acc.unassigned += 1;
    if (isOrderOverdue(order, now)) acc.overdue += 1;
    if (isOrderDueToday(order, now)) acc.dueToday += 1;
    if (isOrderUpcoming(order, now, 7)) acc.upcoming7Days += 1;
    if (status === 'COMPLETED' && !getOrderReportStatus(order)) acc.reportsPending += 1;
    acc.documents += getOrderDocumentCount(order);
    return acc;
  }, initial);

  metrics.completionRate = metrics.visible
    ? Math.round((metrics.completed / metrics.visible) * 100)
    : 0;

  return metrics;
}
