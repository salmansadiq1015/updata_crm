import toast from 'react-hot-toast';

export const showSuccess = (message) =>
  toast.success(message, { duration: 3000 });

/**
 * Display an error toast.
 *
 * Accepts either:
 *   - a string:              showError('Fehler beim Speichern')
 *   - a normalized error:    showError(err)     where err = { message, isCanceled, ... }
 *   - any Error instance:    showError(err)
 *
 * Canceled requests (React Query aborts during navigation, etc.) are
 * silently ignored — they're never user-facing failures.
 */
export const showError = (input) => {
  // Silent drop for canceled requests
  if (input && typeof input === 'object' && input.isCanceled) return;

  let message;
  if (!input) {
    message = 'Ein Fehler ist aufgetreten';
  } else if (typeof input === 'string') {
    message = input;
  } else if (typeof input === 'object') {
    // Normalized error shape ({ message, statusCode, ... }) or any Error/thrown value
    message = input.message || input.error?.message || 'Ein Fehler ist aufgetreten';
  } else {
    message = String(input);
  }

  toast.error(message, { duration: 5000 });
};

export const showLoading = (message) =>
  toast.loading(message || 'Wird geladen...');

export const dismissToast = (id) =>
  toast.dismiss(id);

export const showPromise = (promise, { loading, success, error }) =>
  toast.promise(promise, { loading, success, error });
