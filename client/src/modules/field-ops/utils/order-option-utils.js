const EMPTY_ORDER_ITEMS = Object.freeze([]);

export const FIELD_OPS_ORDER_PICKER_QUERY = Object.freeze({
  limit: 100,
  sortBy: 'startDatetime',
  sortOrder: 'desc',
});

export function toFieldOpsOrderItems(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  return EMPTY_ORDER_ITEMS;
}

export function getFieldOpsOrderId(order) {
  return order?._id || order?.id || order?.orderId || order?.order_id || '';
}

export function formatFieldOpsOrderOptionLabel(order, locale = 'en') {
  const fallbackTitle = locale === 'de' ? 'Ohne Titel' : 'Untitled';
  const assignmentNumber = order?.assignmentNumber || order?.assignment_number || order?.number;
  const title = order?.title || order?.description || fallbackTitle;

  return [assignmentNumber ? `#${assignmentNumber}` : '', title].filter(Boolean).join(' ');
}
