import customVocabularyService from './customVocabulary.service.js';

class CustomVocabularyController {
  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const vocabulary = await customVocabularyService.create(req.body, req.user._id, meta);
      return res.success({ data: vocabulary, message: 'Custom vocabulary created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const vocabulary = await customVocabularyService.getById(req.params.id);
      return res.success({ data: vocabulary });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await customVocabularyService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const vocabulary = await customVocabularyService.update(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: vocabulary, message: 'Custom vocabulary updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await customVocabularyService.remove(req.params.id, req.user._id, meta);
      return res.success({ message: 'Custom vocabulary deleted successfully' });
    } catch (err) { next(err); }
  }
}

const customVocabularyController = new CustomVocabularyController();
export default customVocabularyController;
