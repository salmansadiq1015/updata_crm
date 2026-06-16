import deployEmployeeService from './employee.service.js';

class DeployEmployeeController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await deployEmployeeService.list(query);
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }
}

const deployEmployeeController = new DeployEmployeeController();
export default deployEmployeeController;
