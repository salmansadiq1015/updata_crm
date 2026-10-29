'use client';

import { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useDeleteTeam, useGovernanceSettings, useSaveTeam, useTeams } from '../hooks/use-governance';
import type { Team, TeamMemberRole } from '../types/governance-types';

const ROLES: TeamMemberRole[] = ['member', 'supervisor', 'manager'];
type DirectoryUser = { _id: string; firstName?: string; lastName?: string; email?: string };
const nameOf = (u?: { firstName?: string; lastName?: string; email?: string } | null, fallback = '') =>
  (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : '') || fallback;

interface Draft {
  name: string;
  description: string;
  shareUnassigned: boolean;
  sources: string;
  members: Array<{ userId: string; role: TeamMemberRole }>;
}

const toDraft = (team?: Team | null): Draft => ({
  name: team?.name ?? '',
  description: team?.description ?? '',
  shareUnassigned: team?.leadScope.shareUnassigned ?? false,
  sources: (team?.leadScope.sources ?? []).join(', '),
  members: (team?.members ?? []).map((m) => ({ userId: m.userId, role: m.role })),
});

/** Team administration: membership, roles and the optional shared lead pool. */
export function TeamAdmin() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('team:manage');
  const teams = useTeams(true);
  const settings = useGovernanceSettings();
  const remove = useDeleteTeam();
  const [editing, setEditing] = useState<Team | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);

  return (
    <div className="space-y-4">
      {settings.data && settings.data.leadAccessMode !== 'team' && (
        <p className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-xs text-muted-foreground">
          {t('governance.teams.companyModeNotice', 'Lead access is company-wide (LEAD_ACCESS_MODE=company). Teams take effect on lead visibility once team mode is enabled; supervisor escalation already uses them.')}
        </p>
      )}
      <div className="flex justify-end">
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}><Plus aria-hidden />{t('governance.teams.new', 'New team')}</Button>
        )}
      </div>

      {teams.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t('common.loading', 'Loading…')}</div>
      ) : teams.isError ? (
        <p role="alert" className="text-sm text-destructive">{t('governance.teams.error', 'Teams could not be loaded.')}</p>
      ) : !teams.data?.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('governance.teams.empty', 'No teams yet.')}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.data.map((team) => {
            const supervisors = team.members.filter((m) => m.role !== 'member');
            return (
              <li key={team.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{team.name}</h3>
                    {team.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{team.description}</p>}
                  </div>
                  {!team.isActive && <Badge className="" variant="secondary">{t('governance.teams.inactive', 'Inactive')}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('governance.teams.counts', '{members} members · {supervisors} supervisors/managers', { members: team.members.length, supervisors: supervisors.length })}
                </p>
                {team.leadScope.shareUnassigned && (
                  <p className="text-xs text-foreground">
                    {t('governance.teams.pool', 'Shares unassigned leads')}
                    {team.leadScope.sources.length ? ` (${team.leadScope.sources.join(', ')})` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {team.members.slice(0, 8).map((m) => (
                    <span key={m.userId} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                      {nameOf(m.user, m.userId)}{m.role !== 'member' ? ` · ${t(`governance.teams.role.${m.role}`, m.role)}` : ''}
                    </span>
                  ))}
                  {team.members.length > 8 && <span className="text-[11px] text-muted-foreground">+{team.members.length - 8}</span>}
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setEditing(team)}><Pencil aria-hidden />{t('common.edit', 'Edit')}</Button>
                  {canManage && (
                    <Button size="xs" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(team)}><Trash2 aria-hidden />{t('common.delete', 'Delete')}</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TeamEditor team={editing === 'new' ? null : editing} membershipOnly={!canManage} onClose={() => setEditing(null)} />
      )}

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open: boolean) => { if (!open) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('governance.teams.deleteTitle', 'Delete team?')}</DialogTitle>
            <DialogDescription>{t('governance.teams.deleteBody', 'Members lose the lead visibility this team gave them. Leads are not changed.')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                await remove.mutateAsync(confirmDelete.id);
                showSuccess(t('governance.teams.deleted', 'Team deleted'));
                setConfirmDelete(null);
              }}
            >
              {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}{t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamEditor({ team, membershipOnly, onClose }: { team: Team | null; membershipOnly: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const save = useSaveTeam();
  const users = useUserDirectory({ limit: 200 });
  const directory = useMemo(() => (users.data ?? []) as DirectoryUser[], [users.data]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(team));
  const [candidate, setCandidate] = useState('');
  const known = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of directory) map.set(u._id, nameOf(u, u._id));
    for (const m of team?.members ?? []) if (!map.has(m.userId)) map.set(m.userId, nameOf(m.user, m.userId));
    return map;
  }, [directory, team]);
  const available = directory.filter((u) => !draft.members.some((m) => m.userId === u._id));
  const nameMissing = !draft.name.trim();

  const submit = async () => {
    const members = draft.members;
    const input = membershipOnly
      ? { members }
      : {
        name: draft.name.trim(),
        description: draft.description.trim(),
        members,
        leadScope: {
          shareUnassigned: draft.shareUnassigned,
          sources: draft.sources.split(',').map((s) => s.trim()).filter(Boolean),
        },
      };
    await save.mutateAsync({ id: team?.id, input });
    showSuccess(team ? t('governance.teams.saved', 'Team saved') : t('governance.teams.created', 'Team created'));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{team ? t('governance.teams.editTitle', 'Edit team') : t('governance.teams.newTitle', 'New team')}</DialogTitle>
          <DialogDescription>{t('governance.teams.editorHint', 'Supervisors and managers see leads assigned to every member of this team. Managers may also edit its membership.')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!membershipOnly && (
            <>
              <label className="block space-y-1 text-xs font-medium">
                {t('governance.teams.name', 'Name')}
                <Input value={draft.name} maxLength={120} aria-invalid={nameMissing} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="block space-y-1 text-xs font-medium">
                {t('governance.teams.descriptionLabel', 'Description')}
                <Textarea className="" rows={2} maxLength={500} value={draft.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...draft, description: e.target.value })} />
              </label>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <label className="flex items-center justify-between gap-3 text-xs font-medium">
                  {t('governance.teams.shareUnassigned', 'Members see unassigned leads (shared pool)')}
                  <Switch className="" checked={draft.shareUnassigned} onCheckedChange={(v: boolean) => setDraft({ ...draft, shareUnassigned: v })} />
                </label>
                {draft.shareUnassigned && (
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    {t('governance.teams.sources', 'Only these lead sources (comma-separated, empty = all)')}
                    <Input value={draft.sources} placeholder="google_places, import" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, sources: e.target.value })} />
                  </label>
                )}
              </div>
            </>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">{t('governance.teams.members', 'Members')}</legend>
            <div className="flex gap-2">
              <Select value={candidate} onValueChange={setCandidate}>
                <SelectTrigger className="flex-1" aria-label={t('governance.teams.addMember', 'Add member')}>
                  <SelectValue placeholder={t('governance.teams.pickUser', 'Choose a user…')} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((u) => <SelectItem key={u._id} value={u._id}>{nameOf(u, u._id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={!candidate}
                onClick={() => { setDraft({ ...draft, members: [...draft.members, { userId: candidate, role: 'member' }] }); setCandidate(''); }}
              >
                <Plus aria-hidden />{t('governance.teams.add', 'Add')}
              </Button>
            </div>
            {!draft.members.length ? (
              <p className="text-xs text-muted-foreground">{t('governance.teams.noMembers', 'No members yet.')}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {draft.members.map((m, index) => (
                  <li key={m.userId} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{known.get(m.userId) || m.userId}</span>
                    <Select
                      value={m.role}
                      onValueChange={(role: string) => {
                        const members = [...draft.members];
                        members[index] = { ...m, role: role as TeamMemberRole };
                        setDraft({ ...draft, members });
                      }}
                    >
                      <SelectTrigger className="w-36" aria-label={t('governance.teams.roleFor', 'Role for {name}', { name: known.get(m.userId) || m.userId })}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`governance.teams.role.${r}`, r)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('governance.teams.removeMember', 'Remove {name}', { name: known.get(m.userId) || m.userId })}
                      onClick={() => setDraft({ ...draft, members: draft.members.filter((x) => x.userId !== m.userId) })}
                    >
                      <UserMinus aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          {save.isError && <p role="alert" className="text-xs text-destructive">{(save.error as { message?: string })?.message}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button disabled={(!membershipOnly && nameMissing) || save.isPending} onClick={() => void submit().catch(() => {})}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}{t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TeamAdmin;
