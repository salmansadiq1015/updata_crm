'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Power, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { aiAdminService } from '@/modules/ai/services/ai-admin-service';
import {
  AiAdminBackLink,
  AiAdminHeader,
  AiAdminPageShell,
} from '@/modules/ai/components/admin/ai-admin-ui';

const QUERY_KEY = ['ai', 'admin', 'governance'];

const RISK_BADGE = {
  LOW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  HIGH: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  CRITICAL: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function AgentRow({ agent, onToggle, isPending, t }) {
  const actionCount = (agent.allowedActions || []).length;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            agent.isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{agent.name}</span>
            <Badge variant="outline" className="font-mono text-[11px]">{agent.key}</Badge>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                RISK_BADGE[agent.approvalRule] || RISK_BADGE.MEDIUM
              }`}
            >
              {t('ai.agents.approvalFrom')} {agent.approvalRule}
            </span>
          </div>
          {/* Purposes are seeded in German; fall back to the stored text when
              an agent has no translation yet. */}
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t(`ai.agents.purpose.${agent.key}`, agent.purpose)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {actionCount > 0
              ? `${t('ai.agents.actions')}: ${(agent.allowedActions || []).join(', ')}`
              : t('ai.agents.noActionsYet')}
          </p>
          {!agent.isEnabled && agent.disabledReason ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {t('ai.agents.disabledReason')}: {agent.disabledReason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:pt-1">
        <span className="text-xs text-muted-foreground">
          {agent.isEnabled ? t('ai.agents.active') : t('ai.agents.inactive')}
        </span>
        <Switch
          checked={Boolean(agent.isEnabled)}
          disabled={isPending}
          onCheckedChange={(checked) => onToggle(agent, checked)}
          aria-label={`${agent.name} ${agent.isEnabled ? t('ai.agents.inactive') : t('ai.agents.active')}`}
        />
      </div>
    </div>
  );
}

export default function AiAgentsAdminPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const governanceQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => aiAdminService.getGovernance(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, isEnabled, reason }) => aiAdminService.setAgentEnabled(key, isEnabled, reason),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showSuccess(variables.isEnabled ? t('ai.agents.enabled') : t('ai.agents.disabled'));
    },
    onError: (err) => showError(err),
  });

  const stopMutation = useMutation({
    mutationFn: ({ active, reason }) => aiAdminService.setEmergencyStop(active, reason),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      showSuccess(variables.active ? t('ai.agents.stopActivated') : t('ai.agents.stopReleased'));
      setStopDialogOpen(false);
    },
    onError: (err) => showError(err),
  });

  const data = governanceQuery.data;
  const agents = data?.agents || [];
  const stopActive = Boolean(data?.emergencyStop?.active);
  const activeCount = agents.filter((agent) => agent.isEnabled).length;

  const handleToggle = (agent, checked) => {
    toggleMutation.mutate({
      key: agent.key,
      isEnabled: checked,
      reason: checked ? null : t('ai.agents.disabledManually'),
    });
  };

  return (
    <AiAdminPageShell className="space-y-6">
      <AiAdminBackLink label={t('ai.admin.back')} />

      <AiAdminHeader
        icon={ShieldCheck}
        title={t('ai.agents.title')}
        subtitle={t('ai.agents.subtitle')}
        actions={(
          <Button
            variant={stopActive ? 'default' : 'destructive'}
            className="gap-2"
            onClick={() => setStopDialogOpen(true)}
            disabled={stopMutation.isPending}
          >
            <Power className="h-4 w-4" />
            {stopActive ? t('ai.agents.releaseStop') : t('ai.agents.emergencyStop')}
          </Button>
        )}
      />

      {stopActive ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">{t('ai.agents.stopBannerTitle')}</p>
            <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
              {t('ai.agents.stopBannerText')}
              {data?.emergencyStop?.reason ? ` — ${data.emergencyStop.reason}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-sm leading-6 text-muted-foreground">{t('ai.agents.hint')}</p>
      </div>

      <div className="rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            {t('ai.agents.listTitle')}
          </span>
          <span className="text-xs text-muted-foreground">
            {activeCount} / {agents.length} {t('ai.agents.active').toLowerCase()}
          </span>
        </div>

        {governanceQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={agent.key}
              agent={agent}
              onToggle={handleToggle}
              isPending={toggleMutation.isPending || stopActive}
              t={t}
            />
          ))
        )}
      </div>

      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stopActive ? t('ai.agents.releaseStop') : t('ai.agents.emergencyStop')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stopActive ? t('ai.agents.releaseStopConfirm') : t('ai.agents.emergencyStopConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                stopMutation.mutate({
                  active: !stopActive,
                  reason: stopActive ? null : t('ai.agents.stoppedManually'),
                });
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiAdminPageShell>
  );
}
