export function getDisplayErrorCode(error) {
  return (
    error?.digest ||
    error?.code ||
    error?.requestId ||
    error?.statusCode ||
    error?.response?.data?.error?.code ||
    error?.response?.data?.code ||
    error?.response?.status ||
    (error?.name && error.name !== 'Error' ? error.name : null) ||
    null
  );
}

export function getDisplayErrorMessage(error, fallback) {
  return error?.message || error?.response?.data?.error?.message || error?.response?.data?.message || fallback;
}
