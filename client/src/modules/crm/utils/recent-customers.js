'use client';

// Quick-access list of the customer records the user opened most recently.
// Kept per browser in localStorage (no backend) — the point is a fast shortcut
// back into a fiche, e.g. after a typo in the search box (client feedback).

const STORAGE_KEY = 'mb:crm:recent-customers';
const MAX_ITEMS = 8;
export const RECENT_CUSTOMERS_EVENT = 'mb:recent-customers-changed';

export function getRecentCustomers() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((c) => c && c._id) : [];
  } catch {
    return [];
  }
}

export function recordRecentCustomer(customer) {
  if (typeof window === 'undefined' || !customer?._id) return;
  const entry = {
    _id: String(customer._id),
    name: customer.name || '',
    city: customer.city || '',
    customerNumber: customer.customerNumber || '',
    type: customer.type || '',
    at: Date.now(),
  };
  try {
    const next = [entry, ...getRecentCustomers().filter((c) => c._id !== entry._id)].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_CUSTOMERS_EVENT));
  } catch {
    // localStorage unavailable or over quota — non-critical convenience feature.
  }
}
