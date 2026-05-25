import migrationService from './migration.service.js';

class MigrationController {
  async createRun(req, res, next) {
    try {
      const result = await migrationService.createRun(req.body, req.user);
      res.status(201).success(result);
    } catch (error) {
      next(error);
    }
  }

  async listRuns(req, res, next) {
    try {
      const result = await migrationService.listRuns(req._validatedQuery || req.query);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async getRun(req, res, next) {
    try {
      const result = await migrationService.getRun(req.params.runId);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async addSourceRecords(req, res, next) {
    try {
      const result = await migrationService.addSourceRecords(req.params.runId, req.body.domain, req.body.records);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async start(req, res, next) {
    try {
      const result = await migrationService.start(req.params.runId, req.user);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async pause(req, res, next) {
    try {
      const result = await migrationService.pause(req.params.runId, req.user);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async resume(req, res, next) {
    try {
      const result = await migrationService.resume(req.params.runId, req.user);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async cancel(req, res, next) {
    try {
      const result = await migrationService.cancel(req.params.runId, req.user);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async rollback(req, res, next) {
    try {
      const result = await migrationService.rollback(req.params.runId, req.body, req.user);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async progress(req, res, next) {
    try {
      const result = await migrationService.getProgress(req.params.runId);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async errors(req, res, next) {
    try {
      const result = await migrationService.listErrors(req.params.runId, req._validatedQuery || req.query);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async exportErrors(req, res, next) {
    try {
      const csv = await migrationService.exportErrorsCsv(req.params.runId, req._validatedQuery || req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="migration-errors-${req.params.runId}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  async validationReport(req, res, next) {
    try {
      const result = await migrationService.validationReport(req.params.runId);
      res.success(result);
    } catch (error) {
      next(error);
    }
  }

  async generateSpotCheck(req, res, next) {
    try {
      const result = await migrationService.generateSpotCheck(req.params.runId, req.body, req.user);
      res.status(201).success(result);
    } catch (error) {
      next(error);
    }
  }
}

const migrationController = new MigrationController();
export default migrationController;
