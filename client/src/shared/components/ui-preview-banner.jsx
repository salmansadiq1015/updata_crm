'use client';

import { Eye, X } from 'lucide-react';
import { useUiPreviewStore } from '@/stores/ui-preview-store';
import { useLanguage } from '@/lib/i18n/language-context';

/** Testmodus banner: shown while a Key User previews another role's UI config. */
export function UiPreviewBanner({ collapsed = false }) {
  const { t } = useLanguage();
  const preview = useUiPreviewStore((s) => s.preview);
  const clearPreview = useUiPreviewStore((s) => s.clearPreview);
  if (!preview) return null;

  return (
    <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">
          {t('roles.previewAs', 'Ansicht als')} <b>{preview.roleName}</b>
        </span>
      )}
      <button
        type="button"
        onClick={clearPreview}
        className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
        title={t('roles.previewEnd', 'Vorschau beenden')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
