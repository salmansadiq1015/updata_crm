import ReconciliationLearningRule from './reconciliationLearning.model.js';

function normalizePartyName(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeIban(value) {
  const normalized = String(value || '').replace(/\s+/g, '').toUpperCase();
  return normalized || null;
}

class ReconciliationLearningRepository {
  normalizePartyName(value) {
    return normalizePartyName(value);
  }

  normalizeIban(value) {
    return normalizeIban(value);
  }

  async recordManualMatch({
    direction,
    targetType,
    entityId,
    partyName,
    partyIban,
    currency = 'CHF',
    transactionId,
    invoiceId,
    userId,
  }, options = {}) {
    const normalizedPartyName = normalizePartyName(partyName);
    const normalizedIban = normalizeIban(partyIban);

    if (!normalizedPartyName && !normalizedIban) return null;

    const identity = normalizedIban
      ? { partyIban: normalizedIban }
      : { normalizedPartyName };

    return ReconciliationLearningRule.findOneAndUpdate(
      {
        direction,
        targetType,
        entityId,
        ...identity,
      },
      {
        $set: {
          normalizedPartyName,
          partyIban: normalizedIban,
          currency,
          lastMatchedAt: new Date(),
          lastTransactionId: transactionId,
          lastInvoiceId: invoiceId,
          isActive: true,
        },
        $setOnInsert: { createdBy: userId },
        $inc: { matchCount: 1 },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: options.session,
      },
    ).lean();
  }

  async findCandidate({ direction, targetType, partyName, partyIban, currency }) {
    const normalizedPartyName = normalizePartyName(partyName);
    const normalizedIban = normalizeIban(partyIban);

    const or = [];
    if (normalizedIban) or.push({ partyIban: normalizedIban });
    if (normalizedPartyName) or.push({ normalizedPartyName });
    if (!or.length) return null;

    const matches = await ReconciliationLearningRule.find({
      direction,
      targetType,
      isActive: true,
      ...(currency ? { currency } : {}),
      $or: or,
    })
      .sort({ matchCount: -1, lastMatchedAt: -1, _id: 1 })
      .limit(2)
      .lean();

    if (matches.length !== 1) return null;
    return matches[0];
  }
}

const reconciliationLearningRepository = new ReconciliationLearningRepository();
export default reconciliationLearningRepository;
