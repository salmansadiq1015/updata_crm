'use client';

import { Toaster } from 'react-hot-toast';

export function ToastProvider({ children }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        containerClassName="toast-container"
        toastOptions={{
          duration: 4000,
          className: '!bg-card !text-card-foreground !border !border-border !rounded-xl !text-sm !shadow-lg',
          success: {
            className: '!bg-card !text-card-foreground !border !border-border !rounded-xl !text-sm !shadow-lg',
          },
          error: {
            className: '!bg-card !text-card-foreground !border !border-border !rounded-xl !text-sm !shadow-lg',
            duration: 5000,
          },
        }}
      />
    </>
  );
}
