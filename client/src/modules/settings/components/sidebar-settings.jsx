'use client';

import { useState } from 'react';
import { navSectionDefs } from '@/layout/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSidebarVisibility, useSaveSidebarVisibility } from '../hooks/use-sidebar-visibility';

export function SidebarSettings() {
  const { t } = useLanguage();
  const query = useSidebarVisibility();
  const save = useSaveSidebarVisibility();
  const [draft, setDraft] = useState(null);
  const hidden = draft ?? query.data?.hiddenMenus ?? [];

  if (query.isPending) return <p role="status">{t('sidebarSettings.loading')}</p>;
  if (query.isError) return <div role="alert">{t('sidebarSettings.loadError')} <Button onClick={() => query.refetch()}>{t('sidebarSettings.retry')}</Button></div>;

  const toggle = (id, enabled) => setDraft(enabled ? hidden.filter((key) => key !== id) : [...hidden, id]);
  const renderMenu = (item, parentHidden = false) => {
    const id = item.key || item.href;
    const locked = item.href === '/admin/settings';
    const isHidden = hidden.includes(id);
    return (
      <div key={id} className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span className={parentHidden ? 'text-muted-foreground' : ''}>{t(item.labelKey)}</span>
          <Switch aria-label={t(item.labelKey)} checked={locked || !isHidden} disabled={locked || parentHidden || save.isPending} onCheckedChange={(enabled) => toggle(id, enabled)} />
        </div>
        {item.children && <div className="space-y-2 pl-6">{item.children.map((child) => renderMenu(child, parentHidden || isHidden))}</div>}
      </div>
    );
  };

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{t('sidebarSettings.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('sidebarSettings.description')}</p>
      </div>
      <div className="flex gap-2">
        <Button disabled={draft === null || save.isPending} onClick={() => save.mutate(hidden, { onSuccess: () => setDraft(null) })}>{t(save.isPending ? 'sidebarSettings.saving' : 'sidebarSettings.save')}</Button>
        <Button variant="outline" disabled={save.isPending} onClick={() => setDraft([])}>{t('sidebarSettings.showAll')}</Button>
        <Button variant="ghost" disabled={draft === null || save.isPending} onClick={() => setDraft(null)}>{t('sidebarSettings.cancel')}</Button>
      </div>
      {save.isError && <p role="alert" className="text-destructive">{t('sidebarSettings.saveError')}</p>}
      {save.isSuccess && draft === null && <p role="status">{t('sidebarSettings.saved')}</p>}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {navSectionDefs.map((section) => <div key={section.titleKey} className="space-y-3"><h3 className="font-medium">{t(section.titleKey)}</h3>{section.items.map((item) => renderMenu(item))}</div>)}
      </div>
    </section>
  );
}
