/**
 * VAT calculation utility for QOP module.
 * Handles line-item totals, VAT breakdown, global discounts, and Swiss 5-Rappen rounding.
 */

/**
 * Round a number to 2 decimal places to avoid floating-point drift.
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Swiss 5-Rappen rounding: round to the nearest 0.05.
 * @param {number} amount
 * @returns {number}
 */
export function roundToFiveRappen(amount) {
  return Math.round(amount * 20) / 20;
}

/**
 * Calculate totals for a set of line items.
 *
 * @param {Array} lineItems
 * @param {number} globalDiscountPercent - overall discount applied after line totals
 * @param {string} currency - 'CHF' triggers 5-Rappen rounding
 * @returns {{ lineItems, subtotal, vatBreakdown, grandTotal, roundingAmount, grandTotalRounded }}
 */
export function calculateTotals(lineItems, globalDiscountPercent = 0, currency = 'CHF') {
  // 1. Compute each line total
  const computed = lineItems.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const disc = Number(item.discountPercent) || 0;
    const lineTotal = round2(qty * price * (1 - disc / 100));
    return { ...item, lineTotal };
  });

  // 2. Subtotal = sum of all line totals
  const subtotal = round2(computed.reduce((sum, li) => sum + li.lineTotal, 0));

  // 3. Discounted subtotal
  const discountedSubtotal = round2(subtotal * (1 - globalDiscountPercent / 100));

  // 4. Group by VAT rate
  const vatMap = new Map();
  for (const li of computed) {
    const rate = Number(li.vatRate) || 0;
    const existing = vatMap.get(rate) || 0;
    vatMap.set(rate, existing + li.lineTotal);
  }

  const vatBreakdown = [];
  let totalVat = 0;
  for (const [rate, rawBase] of vatMap) {
    const base = round2(rawBase * (1 - globalDiscountPercent / 100));
    const amount = round2(base * rate / 100);
    vatBreakdown.push({ rate, base, amount });
    totalVat += amount;
  }
  totalVat = round2(totalVat);

  // 5. Grand total
  const grandTotal = round2(discountedSubtotal + totalVat);

  // 6. 5-Rappen rounding for CHF
  let grandTotalRounded = grandTotal;
  let roundingAmount = 0;
  if (currency === 'CHF') {
    grandTotalRounded = roundToFiveRappen(grandTotal);
    roundingAmount = round2(grandTotalRounded - grandTotal);
  }

  return {
    lineItems: computed,
    subtotal,
    vatBreakdown,
    grandTotal,
    roundingAmount,
    grandTotalRounded,
  };
}
