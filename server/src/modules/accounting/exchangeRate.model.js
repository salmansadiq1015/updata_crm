import mongoose from 'mongoose';

export const EXCHANGE_RATE_SOURCES = ['MANUAL', 'SNB', 'ECB', 'OPEN_BANKING', 'IMPORT', 'API'];

const currencyPattern = /^[A-Z]{3}$/;

function startOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

const exchangeRateSchema = new mongoose.Schema(
  {
    baseCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: currencyPattern,
      maxlength: 3,
    },
    quoteCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: currencyPattern,
      maxlength: 3,
    },
    rate: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    rateDate: {
      type: Date,
      required: true,
    },
    source: {
      type: String,
      enum: EXCHANGE_RATE_SOURCES,
      default: 'MANUAL',
      uppercase: true,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

exchangeRateSchema.index(
  { baseCurrency: 1, quoteCurrency: 1, rateDate: 1 },
  { unique: true },
);
exchangeRateSchema.index({ baseCurrency: 1, quoteCurrency: 1, rateDate: -1 });
exchangeRateSchema.index({ quoteCurrency: 1, baseCurrency: 1, rateDate: -1 });

exchangeRateSchema.pre('validate', function normalizeExchangeRate(next) {
  if (this.baseCurrency) this.baseCurrency = String(this.baseCurrency).toUpperCase();
  if (this.quoteCurrency) this.quoteCurrency = String(this.quoteCurrency).toUpperCase();
  if (this.source) this.source = String(this.source).toUpperCase();
  if (this.rateDate) this.rateDate = startOfUtcDay(this.rateDate);

  if (this.baseCurrency && this.quoteCurrency && this.baseCurrency === this.quoteCurrency) {
    this.invalidate('quoteCurrency', 'Quote currency must be different from base currency');
  }
  next();
});

const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);
export default ExchangeRate;
