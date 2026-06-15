import catalogSearchService from './catalogSearch.service.js';

class CatalogSearchController {
  async recent(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await catalogSearchService.listRecent(req.user._id, query);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }
}

const catalogSearchController = new CatalogSearchController();
export default catalogSearchController;
