'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

function FormField({ label, required, error, description, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label className="text-sm font-medium text-foreground/85">
          {label}
          {required && (
            <span className="ml-0.5 text-destructive/70">*</span>
          )}
        </Label>
      )}
      {children}
      {description && !error && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {error}
        </p>
      )}
    </div>
  );
}

function FormSection({ title, description, children, className }) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function FormBody({ className, children }) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-6 sm:px-6', className)}>
      {children}
    </div>
  );
}

export { FormField, FormSection, FormBody };
