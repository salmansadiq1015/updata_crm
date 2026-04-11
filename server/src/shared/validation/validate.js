import { ValidationError } from '../errors/AppError.js';

/**
 * Express middleware factory for Joi schema validation.
 *
 * Usage in routes:
 *   router.post('/files/upload', validate({ body: uploadSchema }), controller.upload);
 *   router.get('/files', validate({ query: listSchema }), controller.list);
 *
 * Validates body, query, and params independently.
 * Strips unknown fields for security (prevents NoSQL injection via extra fields).
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const allErrors = [];

    for (const [source, schema] of Object.entries(schemas)) {
      if (!schema) continue;

      const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        const details = error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, "'"),
          type: d.type,
        }));
        allErrors.push(...details);
      } else {
        // Replace with validated + sanitized values
        // Express v5: req.query is read-only (getter). Store validated query on req._validatedQuery
        if (source === 'query') {
          req._validatedQuery = value;
        } else {
          req[source] = value;
        }
      }
    }

    if (allErrors.length > 0) {
      return next(new ValidationError('Validation failed', allErrors));
    }

    next();
  };
}

export default validate;
