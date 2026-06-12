'use client';

import Link from 'next/link';
import { BarChart3, BookOpen, MessageSquareText, Mic, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiAdminHeader, AiAdminPageShell } from '@/modules/ai/components/admin/ai-admin-ui';

const LINKS = [
  { href: '/admin/ai/analytics', icon: BarChart3, labelKey: 'ai.admin.accuracyUsage', descKey: 'ai.admin.accuracyUsageDesc' },
  { href: '/admin/ai/vocabulary', icon: BookOpen, labelKey: 'ai.admin.vocabulary', descKey: 'ai.admin.vocabularyDesc' },
  { href: '/admin/ai/commands', icon: Mic, labelKey: 'ai.admin.commands', descKey: 'ai.admin.commandsDesc' },
];

export default function AdminAiPage() {
  const { t } = useLanguage();

  return (
    <AiAdminPageShell className="space-y-8">
      <AiAdminHeader
        icon={Sparkles}
        title={t('ai.admin.title')}
        subtitle={t('ai.admin.subtitle')}
        actions={(
          <Button asChild variant="outline" className="gap-2">
            <Link href="/ai">
              <MessageSquareText className="h-4 w-4" />
              {t('ai.admin.openAssistant')}
            </Link>
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {LINKS.map(({ href, icon: Icon, labelKey, descKey }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-border bg-card/70 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <span className="font-semibold text-foreground">{t(labelKey)}</span>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(descKey)}</p>
          </Link>
        ))}
      </div>
    </AiAdminPageShell>
  );
}
