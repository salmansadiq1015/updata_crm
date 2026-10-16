// Feedback toasts (sonner-native — the native counterpart of the web CRM's sonner).
// Use for outcomes of user actions; persistent problems belong in inline states.
import { toast } from 'sonner-native';

import { i18next } from '@/i18n';

import { errorMessageKey } from './errorMessages';

export const showSuccessToast = (message: string) => toast.success(message);
export const showInfoToast = (message: string) => toast.info(message);
export const showWarningToast = (message: string) => toast.warning(message);
export const showErrorToast = (message: string) => toast.error(message);

/** Map any API error to its localized message and show it. */
export const showApiErrorToast = (error: unknown) => toast.error(i18next.t(errorMessageKey(error)));
