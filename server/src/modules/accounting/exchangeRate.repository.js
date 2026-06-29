import ExchangeRate from './exchangeRate.model.js';

class ExchangeRateRepository {
  async upsertDailyRate(data, options = {}) {
    return ExchangeRate.findOneAndUpdate(
      {
        baseCurrency: data.baseCurrency,
        quoteCurrency: data.quoteCurrency,
        rateDate: data.rateDate,
      },
      {
        $set: {
          rate: data.rate,
          source: data.source,
          note: data.note || '',
          updatedBy: data.updatedBy || data.createdBy,
        },
        $setOnInsert: {
          baseCurrency: data.baseCurrency,
          quoteCurrency: data.quoteCurrency,
          rateDate: data.rateDate,
          createdBy: data.createdBy,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        session: options.session || null,
      },
    ).lean();
  }

  async findWithFilters(filters = {}) {
    const query = {};
    if (filters.baseCurrency) query.baseCurrency = filters.baseCurrency;
    if (filters.quoteCurrency) query.quoteCurrency = filters.quoteCurrency;
    if (filters.startDate || filters.endDate) {
      query.rateDate = {};
      if (filters.startDate) query.rateDate.$gte = filters.startDate;
      if (filters.endDate) query.rateDate.$lte = filters.endDate;
    }

    return ExchangeRate.find(query)
      .sort({ rateDate: -1, baseCurrency: 1, quoteCurrency: 1, _id: -1 })
      .limit(filters.limit || 100)
      .lean();
  }

  async findRateAsOf({ baseCurrency, quoteCurrency, asOfDate }, options = {}) {
    return ExchangeRate.findOne({
      baseCurrency,
      quoteCurrency,
      rateDate: { $lte: asOfDate },
    })
      .sort({ rateDate: -1, _id: -1 })
      .session(options.session || null)
      .lean();
  }
}

const exchangeRateRepository = new ExchangeRateRepository();
export default exchangeRateRepository;
