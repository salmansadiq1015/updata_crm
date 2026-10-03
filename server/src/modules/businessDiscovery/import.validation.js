import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { LEAD_IMPORT_MODE } from './leadImportJob.model.js';
import {
  importBody,
  importPreview,
  sessionIdParam,
  resultIdParam,
} from './discovery.validation.js';

/**
 * Route-level validation for the lead-import endpoints (mounted under
 * /business-discovery). Composes the module's existing import schemas
 * (discovery.validation.js) into { params, query, body } shapes per route, and
 * adds the two import-only schemas the shared file does not provide (Add One
 * body + import-job id param).
 */

const IMPORT_MODES = Object.values(LEAD_IMPORT_MODE);

// GET /sessions/:id/import/preview?mode=
export const importPreviewRoute = {
  params: sessionIdParam.params,
  query: importPreview.query,
};

// POST /sessions/:id/import { mode, selection }
export const importSessionRoute = {
  params: sessionIdParam.params,
  body: importBody.body,
};

// POST /results/:resultId/import { mode? } — Add One
export const importResultRoute = {
  params: resultIdParam.params,
  body: Joi.object({
    mode: Joi.string().valid(...IMPORT_MODES).default(LEAD_IMPORT_MODE.NEW),
  }).default({}),
};

// GET /import-jobs/:jobId
export const importJobIdParam = {
  params: Joi.object({ jobId: objectId.required() }),
};

export default {
  importPreviewRoute,
  importSessionRoute,
  importResultRoute,
  importJobIdParam,
};
