// Multiple matching destinations require manual review; never pick a winner by order.
export function matchBankCategoryRule(transaction, rules = []) {
  const text = `${transaction.bookingText || ''} ${transaction.payerPayeeName || ''}`.toLocaleLowerCase();
  const direction = transaction.amount > 0 ? 'IN' : transaction.amount < 0 ? 'OUT' : null;
  const matching = rules.filter(rule => rule.direction === direction && rule.keyword?.trim().length >= 2 && text.includes(rule.keyword.trim().toLocaleLowerCase()));
  const destinations = new Set(matching.map(rule => String(rule.accountId)));
  return destinations.size === 1 ? matching[0].accountId : null;
}
