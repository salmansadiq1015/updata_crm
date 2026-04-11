import toast from 'react-hot-toast';

export const showSuccess = (message) =>
  toast.success(message, { duration: 3000 });

export const showError = (message) =>
  toast.error(message || 'Ein Fehler ist aufgetreten', { duration: 5000 });

export const showLoading = (message) =>
  toast.loading(message || 'Wird geladen...');

export const dismissToast = (id) =>
  toast.dismiss(id);

export const showPromise = (promise, { loading, success, error }) =>
  toast.promise(promise, { loading, success, error });
