import crmAddressBookService from './crmAddressBook.service.js';

class AddressBookController {
  async list(req, res, next) {
    try {
      const data = await crmAddressBookService.listChanges(req.query.lastSyncTimestamp);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }
}

const addressBookController = new AddressBookController();
export default addressBookController;
