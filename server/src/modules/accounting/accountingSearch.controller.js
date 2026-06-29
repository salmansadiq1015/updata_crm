import accountingSearchService from './accountingSearch.service.js';

class AccountingSearchController {
  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await accountingSearchService.search(query);
      return res.success({
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }
}

const accountingSearchController = new AccountingSearchController();
export default accountingSearchController;
