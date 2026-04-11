class QuotationController {
  async getQuotation(req, res, next) {
    try {
      // Placeholder until Quotation module (MOD-08) is built
      const response = {
        quotationNumber: null,
        lineItems: [],
        message: 'Quotation module not yet integrated',
      };

      // Strip price data if user lacks quotation:view-prices permission
      const hasViewPrices = req.user.permissions?.includes('quotation:view-prices');
      if (!hasViewPrices) {
        response.lineItems = response.lineItems.map(({ unit_price, total, discount, tax, ...rest }) => rest);
      }

      return res.success({ data: response });
    } catch (err) { next(err); }
  }
}

const quotationController = new QuotationController();
export default quotationController;
