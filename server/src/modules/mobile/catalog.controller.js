import catalogService from './catalog.service.js';

class CatalogController {
  async search(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await catalogService.search(query.query, {
        source: query.source,
        category: query.category,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async sync(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = query.since
        ? await catalogService.incrementalSync(query.since)
        : await catalogService.fullSync();
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async listFavorites(req, res, next) {
    try {
      const data = await catalogService.listFavorites(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async addFavorite(req, res, next) {
    try {
      const data = await catalogService.addFavorite(req.user._id, req.params.itemId);
      return res.success({ data, message: 'Favorite added successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async removeFavorite(req, res, next) {
    try {
      await catalogService.removeFavorite(req.user._id, req.params.itemId);
      return res.success({ message: 'Favorite removed successfully' });
    } catch (err) { next(err); }
  }

  async listRecent(req, res, next) {
    try {
      const data = await catalogService.listRecent(req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const catalogController = new CatalogController();
export default catalogController;
