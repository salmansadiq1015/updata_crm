'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiHelpOverlay({ onClose }) {
  const { t } = useLanguage();
  const commands = [
    { trigger: t('ai.help.task.trigger', 'Aufgabe erstellen fuer...'), result: t('ai.help.task.result', 'Erstellt eine neue Aufgabe') },
    { trigger: t('ai.help.notification.trigger', 'Benachrichtigung senden an...'), result: t('ai.help.notification.result', 'Sendet eine interne Benachrichtigung') },
    { trigger: t('ai.help.lead.trigger', 'Lead fuer Kunden erstellen...'), result: t('ai.help.lead.result', 'Startet die Lead-Erfassung') },
    { trigger: t('ai.help.report.trigger', 'Bericht aufnehmen'), result: t('ai.help.report.result', 'Startet die Berichtsdiktation') },
    { trigger: t('ai.help.order.trigger', 'Auftrag erstellen fuer...'), result: t('ai.help.order.result', 'Startet die Auftragserstellung') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-sm">{t('ai.panel.helpTrigger', 'Was kann ich sagen?')}</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="flex flex-col gap-3">
          {commands.map(({ trigger, result }) => (
            <li key={trigger} className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">&quot;{trigger}&quot;</span>
              <span className="text-xs text-muted-foreground">{result}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
