import addressBookService from './addressBook.service.js';

class AddressBookController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await addressBookService.list(query);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }
}

const addressBookController = new AddressBookController();
export default addressBookController;
