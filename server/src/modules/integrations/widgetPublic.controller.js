import widgetSubmissionService from './widgetSubmission.service.js';

class WidgetPublicController {
  async submit(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await widgetSubmissionService.submit(req.body, meta);
      return res.success({
        data: {
          submissionId: result.submissionId,
          referenceNumber: result.referenceNumber,
          confirmationMessage: result.confirmationMessage,
        },
        message: 'Submission received successfully',
        statusCode: 201,
      });
    } catch (err) { next(err); }
  }

  async uploadAttachment(req, res, next) {
    try {
      const data = await widgetSubmissionService.uploadAttachment(req.params.submissionId, req.file);
      return res.success({ data, message: 'Attachment uploaded successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getConfig(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await widgetSubmissionService.getPublicConfig(query.widgetId);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const widgetPublicController = new WidgetPublicController();
export default widgetPublicController;
