'use client';

import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import { showError, showSuccess } from '@/lib/toast';
import { useAssignmentPolicy, useSaveAssignmentPolicy } from '../hooks/use-lead-workflow';
import type { AssignmentPolicy, AssignmentRule, AssignmentStrategy } from '../types/lead-workflow-types';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, useLanguage,
} from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';

/**
 * Admin settings (lead:assign-policy): automatic assignment of new unassigned
 * leads (round-robin / least-loaded, optional source/city/business-type rules),
 * the first-response SLA (optionally in business hours) and escalation of
 * unanswered leads and overdue follow-ups to supervisors.
 */

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_FALLBACK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function UserPicker({ users, value, onChange, label }: { users: LeadUser[]; value: string[]; onChange: (ids: string[]) => void; label: string }) {
  const selected = new Set(value);
  return (
    <div role="group" aria-label={label} className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
      {users.map((u) => (
        <Check key={u.id} checked={selected.has(u.id)} onChange={(on) => onChange(on ? [...value, u.id] : value.filter((id) => id !== u.id))}>
          {getUserDisplayName(u) || u.id}
        </Check>
      ))}
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function AssignmentPolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLanguage();
  const policy = useAssignmentPolicy(open);
  const save = useSaveAssignmentPolicy();
  const usersQuery = useWorkspaceUsers();
  const users = (usersQuery.data ?? []) as LeadUser[];
  const [draft, setDraft] = useState<AssignmentPolicy | null>(null);
  useEffect(() => { if (open && policy.data) setDraft(policy.data); }, [open, policy.data]);

  const set = (patch: Partial<AssignmentPolicy>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setSla = (patch: Partial<AssignmentPolicy['sla']>) => setDraft((d) => (d ? { ...d, sla: { ...d.sla, ...patch } } : d));
  const setHours = (patch: Partial<AssignmentPolicy['sla']['businessHours']>) => setDraft((d) => (d ? { ...d, sla: { ...d.sla, businessHours: { ...d.sla.businessHours, ...patch } } } : d));
  const setEsc = (patch: Partial<AssignmentPolicy['escalation']>) => setDraft((d) => (d ? { ...d, escalation: { ...d.escalation, ...patch } } : d));
  const setRule = (i: number, patch: Partial<AssignmentRule>) => setDraft((d) => (d ? { ...d, rules: d.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) } : d));

  const submit = () => {
    if (!draft) return;
    save.mutate({
      enabled: draft.enabled,
      strategy: draft.strategy,
      eligibleUserIds: draft.eligibleUserIds,
      rules: draft.rules.filter((r) => r.userIds.length).map((r) => ({
        name: r.name || null,
        match: { source: r.match.source || null, city: r.match.city || null, businessType: r.match.businessType || null },
        userIds: r.userIds,
        strategy: r.strategy,
      })),
      sla: draft.sla,
      escalation: draft.escalation,
    }, {
      onSuccess: () => { showSuccess(t('leads.policy.saved', 'Assignment policy saved')); onOpenChange(false); },
      onError: (err) => showError(err),
    });
  };

  const strategyOptions: { value: AssignmentStrategy; label: string }[] = [
    { value: 'round_robin', label: t('leads.policy.roundRobin', 'Round-robin') },
    { value: 'least_loaded', label: t('leads.policy.leastLoaded', 'Least open leads') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leads.policy.title', 'Lead assignment, response SLA and escalation')}</DialogTitle>
          <DialogDescription>{t('leads.policy.description', 'New leads without an owner are assigned automatically. Leads that already have an owner are never reassigned.')}</DialogDescription>
        </DialogHeader>
        {!draft ? (
          policy.isError
            ? <p className="text-sm text-destructive">{t('leads.policy.loadError', 'The policy could not be loaded.')}</p>
            : <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label={t('common.loading', 'Loading…')} />
        ) : (
          <div className="space-y-4">
            <Fieldset legend={t('leads.policy.assignment', 'Automatic assignment')}>
              <Check checked={draft.enabled} onChange={(v) => set({ enabled: v })}>{t('leads.policy.enabled', 'Assign new unassigned leads automatically')}</Check>
              <div className="space-y-1">
                <Label htmlFor="policy-strategy">{t('leads.policy.strategy', 'Strategy')}</Label>
                <select id="policy-strategy" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft.strategy} onChange={(e) => set({ strategy: e.target.value as AssignmentStrategy })}>
                  {strategyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <p className="text-xs font-medium">{t('leads.policy.eligible', 'Eligible users (only active users receive leads)')}</p>
              <UserPicker users={users} value={draft.eligibleUserIds} onChange={(ids) => set({ eligibleUserIds: ids })} label={t('leads.policy.eligible', 'Eligible users (only active users receive leads)')} />
              <div className="space-y-2">
                <p className="text-xs font-medium">{t('leads.policy.rules', 'Rules (first match wins; empty fields match anything)')}</p>
                {draft.rules.map((rule, i) => (
                  <div key={rule._id ?? i} className="space-y-2 rounded-lg border border-border/60 p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Input aria-label={t('leads.policy.ruleSource', 'Source')} placeholder={t('leads.policy.ruleSource', 'Source')} value={rule.match.source ?? ''} onChange={(e) => setRule(i, { match: { ...rule.match, source: e.target.value } })} />
                      <Input aria-label={t('leads.policy.ruleCity', 'City')} placeholder={t('leads.policy.ruleCity', 'City')} value={rule.match.city ?? ''} onChange={(e) => setRule(i, { match: { ...rule.match, city: e.target.value } })} />
                      <Input aria-label={t('leads.policy.ruleBusinessType', 'Business type')} placeholder={t('leads.policy.ruleBusinessType', 'Business type')} value={rule.match.businessType ?? ''} onChange={(e) => setRule(i, { match: { ...rule.match, businessType: e.target.value } })} />
                    </div>
                    <UserPicker users={users} value={rule.userIds} onChange={(ids) => setRule(i, { userIds: ids })} label={t('leads.policy.ruleUsers', 'Users for this rule')} />
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => set({ rules: draft.rules.filter((_, idx) => idx !== i) })}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.policy.removeRule', 'Remove rule')}
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="gap-1" onClick={() => set({ rules: [...draft.rules, { name: null, match: { source: null, city: null, businessType: null }, userIds: [], strategy: null }] })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.policy.addRule', 'Add rule')}
                </Button>
              </div>
            </Fieldset>

            <Fieldset legend={t('leads.policy.sla', 'First-response SLA')}>
              <Check checked={draft.sla.enabled} onChange={(v) => setSla({ enabled: v })}>{t('leads.policy.slaEnabled', 'Start a response deadline when a lead gets an owner')}</Check>
              <NumberField label={t('leads.policy.slaMinutes', 'Respond within (minutes)')} value={draft.sla.firstResponseMinutes} min={5} max={20160} onChange={(v) => setSla({ firstResponseMinutes: v })} />
              <Check checked={draft.sla.businessHours.enabled} onChange={(v) => setHours({ enabled: v })}>{t('leads.policy.businessHours', 'Count business hours only')}</Check>
              {draft.sla.businessHours.enabled && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="policy-tz">{t('leads.policy.timezone', 'Timezone')}</Label>
                      <Input id="policy-tz" value={draft.sla.businessHours.timezone} onChange={(e) => setHours({ timezone: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="policy-start">{t('leads.policy.start', 'From')}</Label>
                      <Input id="policy-start" type="time" value={draft.sla.businessHours.start} onChange={(e) => setHours({ start: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="policy-end">{t('leads.policy.end', 'To')}</Label>
                      <Input id="policy-end" type="time" value={draft.sla.businessHours.end} onChange={(e) => setHours({ end: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3" role="group" aria-label={t('leads.policy.days', 'Working days')}>
                    {DAYS.map((d) => (
                      <Check key={d} checked={draft.sla.businessHours.days.includes(d)} onChange={(on) => setHours({ days: on ? [...draft.sla.businessHours.days, d].sort() : draft.sla.businessHours.days.filter((x) => x !== d) })}>
                        {t(`leads.policy.day.${d}`, DAY_FALLBACK[d - 1])}
                      </Check>
                    ))}
                  </div>
                </div>
              )}
            </Fieldset>

            <Fieldset legend={t('leads.policy.escalation', 'Escalation')}>
              <Check checked={draft.escalation.enabled} onChange={(v) => setEsc({ enabled: v })}>{t('leads.policy.escalationEnabled', 'Escalate unanswered leads and overdue follow-ups')}</Check>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <NumberField label={t('leads.policy.escalateAfter', 'Escalate each level after (minutes overdue)')} value={draft.escalation.afterMinutes} min={5} max={20160} onChange={(v) => setEsc({ afterMinutes: v })} />
                <NumberField label={t('leads.policy.maxLevel', 'Maximum level')} value={draft.escalation.maxLevel} min={1} max={5} onChange={(v) => setEsc({ maxLevel: v })} />
                <NumberField label={t('leads.policy.followUpAfter', 'Escalate follow-ups after (minutes overdue)')} value={draft.escalation.followUpAfterMinutes} min={5} max={20160} onChange={(v) => setEsc({ followUpAfterMinutes: v })} />
              </div>
              <p className="text-xs font-medium">{t('leads.policy.escalationUsers', 'Supervisors to notify (empty: everyone with this permission)')}</p>
              <UserPicker users={users} value={draft.escalation.userIds} onChange={(ids) => setEsc({ userIds: ids })} label={t('leads.policy.escalationUsers', 'Supervisors to notify (empty: everyone with this permission)')} />
            </Fieldset>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} disabled={!draft || save.isPending} className="gap-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white">
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t('leads.policy.save', 'Save policy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
