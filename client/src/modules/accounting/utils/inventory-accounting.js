export function defaultInventoryFilters() {
  return {
    currency: 'CHF',
    costingMethod: 'WEIGHTED_AVERAGE',
    startDate: '',
    endDate: '',
  };
}

export function buildInventoryValuationParams(filters = {}) {
  return {
    currency: filters.currency,
    costingMethod: filters.costingMethod,
    limit: 1000,
  };
}

export function buildInventoryMovementParams(filters = {}) {
  return Object.fromEntries(
    Object.entries({
      currency: filters.currency,
      costingMethod: filters.costingMethod,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      limit: 250,
    }).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function buildInventoryPostingPayload(filters = {}) {
  return {
    currency: filters.currency,
    costingMethod: filters.costingMethod,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    limit: 250,
  };
}

export function movementDirectionLabel(quantity) {
  return Number(quantity || 0) >= 0 ? 'Incoming' : 'Outgoing';
}

export function movementDirectionClass(quantity) {
  return Number(quantity || 0) >= 0
    ? 'bg-emerald-500/15 text-emerald-100 border-emerald-300/20'
    : 'bg-rose-500/15 text-rose-100 border-rose-300/20';
}
