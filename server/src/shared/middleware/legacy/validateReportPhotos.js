/**
 * Validation middleware for addReportPhotos.
 * Expects JSON body: { photos: [{ url: string, key: string }] }
 * Fails early with 400 if body is missing, malformed, or invalid.
 */
export const validateAddReportPhotos = (req, res, next) => {
  const body = req.body;

  // Body must exist (JSON must have been parsed)
  if (body == null || typeof body !== "object") {
    return res.fail({
      status: 400,
      message: "Request body must be JSON with a photos array.",
      code: "INVALID_BODY",
    });
  }

  const { photos } = body;

  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return res.fail({
      status: 400,
      message: "Please provide a non-empty array of photo objects with url and key.",
      code: "MISSING_PHOTOS",
    });
  }

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (photo == null || typeof photo !== "object") {
      return res.fail({
        status: 400,
        message: `Photo ${i + 1}: must be an object with url and key.`,
        code: "INVALID_PHOTO",
      });
    }
    if (!photo.url || typeof photo.url !== "string" || !photo.url.trim()) {
      return res.fail({
        status: 400,
        message: `Photo ${i + 1}: url is required and must be a non-empty string.`,
        code: "INVALID_PHOTO",
      });
    }
    if (!photo.key || typeof photo.key !== "string" || !photo.key.trim()) {
      return res.fail({
        status: 400,
        message: `Photo ${i + 1}: key is required and must be a non-empty string.`,
        code: "INVALID_PHOTO",
      });
    }
  }

  next();
};
