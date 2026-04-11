/**
 * Validation middleware for uploadSignature.
 * Expects JSON body: { url: string, key: string, signerName?: string }
 * Fails early with 400 if body is missing, malformed, or invalid.
 */
export const validateUploadSignature = (req, res, next) => {
  const body = req.body;

  if (body == null || typeof body !== "object") {
    return res.fail({
      status: 400,
      message: "Request body must be JSON with url and key.",
      code: "INVALID_BODY",
    });
  }

  const { url, key } = body;

  if (!url || typeof url !== "string" || !url.trim()) {
    return res.fail({
      status: 400,
      message: "Signature url is required and must be a non-empty string.",
      code: "MISSING_SIGNATURE_URL",
    });
  }

  if (!key || typeof key !== "string" || !key.trim()) {
    return res.fail({
      status: 400,
      message: "Signature key is required and must be a non-empty string.",
      code: "MISSING_SIGNATURE_KEY",
    });
  }

  next();
};
