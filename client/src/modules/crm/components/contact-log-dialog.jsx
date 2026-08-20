'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { contactLogService } from '@/modules/crm/services/contact-log-service';
import { contactService } from '@/modules/crm/services/contact-service';
import { taskService } from '@/modules/tasks/services/task-service';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { CONTACT_CHANNEL_META } from '@/modules/crm/constants/contact-log-constants';

const NONE = 'none';

/** Local datetime string an <input type="datetime-local"> accepts. */
function toLocalInput(date) {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const blankForm = () => ({
  occurredAt: toLocalInput(),
  employeeId: NONE,
  contactId: NONE,
  channel: 'phone',
  channelLabel: '',
  subject: '',
  note: '',
  agreements: '',
  openPoints: '',
  followUpAt: '',
  createFollowUpTask: false,
  followUpDepartmentId: NONE,
});

/**
 * The Kundenkontakt mask: when, with whom, through which channel, what was
 * said, what was agreed, what stays open, and what to come back to.
 * `links` carries the record the entry is being logged from (object, project,
 * order, assignment) so it shows up there too.
 */
export function ContactLogDialog({ open, onOpenChange, customerId, entry = null, links = {} }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isEdit = !!entry?._id;
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    if (!open) return;
    if (entry?._id) {
      setForm({
        occurredAt: toLocalInput(entry.occurredAt),
        employeeId: entry.employeeId?._id || NONE,
        contactId: entry.contactId?._id || NONE,
        channel: entry.channel || 'phone',
        channelLabel: entry.channelLabel || '',
        subject: entry.subject || '',
        note: entry.note || '',
        agreements: entry.agreements || '',
        openPoints: entry.openPoints || '',
        followUpAt: entry.followUpAt ? toLocalInput(entry.followUpAt).slice(0, 10) : '',
        createFollowUpTask: false,
        followUpDepartmentId: NONE,
      });
    } else {
      setForm(blankForm());
    }
  }, [open, entry]);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const { data: users = [] } = useUserDirectory({ enabled: open });
  const { data: contacts = [] } = useQuery({
    queryKey: ['crm', 'contacts', 'byCustomer', customerId],
    queryFn: () => contactService.listByCustomer(customerId),
    enabled: open && !!customerId,
    staleTime: 60_000,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['tasks', 'departments'],
    queryFn: () => taskService.listDepartments(),
    enabled: open && form.createFollowUpTask,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm', 'contact-log'] });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : null,
        employeeId: form.employeeId === NONE ? null : form.employeeId,
        contactId: form.contactId === NONE ? null : form.contactId,
        channel: form.channel,
        channelLabel: form.channel === 'other' ? form.channelLabel.trim() || null : null,
        subject: form.subject.trim() || null,
        note: form.note.trim(),
        agreements: form.agreements.trim() || null,
        openPoints: form.openPoints.trim() || null,
        followUpAt: form.followUpAt ? new Date(form.followUpAt).toISOString() : null,
      };
      if (isEdit) return contactLogService.update(entry._id, payload);
      return contactLogService.create(customerId, {
        ...payload,
        ...links,
        createFollowUpTask: !!form.createFollowUpTask && !!form.followUpAt,
        followUpDepartmentId: form.followUpDepartmentId === NONE ? null : form.followUpDepartmentId,
      });
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['tasks'] });
      showSuccess(isEdit
        ? t('crm.contactLog.updated', 'Kontakteintrag aktualisiert')
        : t('crm.contactLog.created', 'Kontakteintrag erfasst'));
      onOpenChange(false);
    },
    onError: (err) => showError(err),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-primary" />
            {isEdit
              ? t('crm.contactLog.editTitle', 'Kundenkontakt bearbeiten')
              : t('crm.contactLog.newTitle', 'Kundenkontakt erfassen')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.contactLog.dialogDesc', 'Halten Sie fest, wann und worüber mit dem Kunden gesprochen wurde.')}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (form.note.trim()) save.mutate(); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('crm.contactLog.occurredAt', 'Datum und Uhrzeit')} required>
              <Input
                type="datetime-local"
                value={form.occurredAt}
                onChange={(e) => set('occurredAt')(e.target.value)}
                disabled={save.isPending}
              />
            </Field>
            <Field label={t('crm.contactLog.employee', 'Mitarbeiter')}>
              <Select value={form.employeeId} onValueChange={set('employeeId')} disabled={save.isPending}>
                <SelectTrigger><SelectValue placeholder={t('crm.contactLog.employeeSelf', 'Ich')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('crm.contactLog.employeeSelf', 'Ich')}</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('crm.contactLog.channel', 'Art des Kontakts')} required>
              <Select value={form.channel} onValueChange={set('channel')} disabled={save.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTACT_CHANNEL_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.contactLog.channel.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            {form.channel === 'other' ? (
              <Field label={t('crm.contactLog.channelLabel', 'Bezeichnung')}>
                <Input value={form.channelLabel} onChange={(e) => set('channelLabel')(e.target.value)} disabled={save.isPending} />
              </Field>
            ) : (
              <Field label={t('crm.contactLog.contactPerson', 'Ansprechpartner')}>
                <Select value={form.contactId} onValueChange={set('contactId')} disabled={save.isPending}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                        {c.role ? ` · ${c.role}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <Field label={t('crm.contactLog.subject', 'Betreff')}>
            <Input
              value={form.subject}
              onChange={(e) => set('subject')(e.target.value)}
              placeholder={t('crm.contactLog.subjectPlaceholder', 'z.B. Störung Heizung, Terminabsprache')}
              disabled={save.isPending}
            />
          </Field>

          <Field label={t('crm.contactLog.note', 'Gesprächsnotiz')} required>
            <Textarea rows={4} value={form.note} onChange={(e) => set('note')(e.target.value)} disabled={save.isPending} autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('crm.contactLog.agreements', 'Vereinbarungen')}>
              <Textarea rows={3} value={form.agreements} onChange={(e) => set('agreements')(e.target.value)} disabled={save.isPending} />
            </Field>
            <Field label={t('crm.contactLog.openPoints', 'Offene Punkte')}>
              <Textarea rows={3} value={form.openPoints} onChange={(e) => set('openPoints')(e.target.value)} disabled={save.isPending} />
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <Field label={t('crm.contactLog.followUpAt', 'Wiedervorlage')}>
              <Input type="date" value={form.followUpAt} onChange={(e) => set('followUpAt')(e.target.value)} disabled={save.isPending} />
            </Field>
            {!isEdit && form.followUpAt && (
              <>
                <label className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={form.createFollowUpTask}
                    onCheckedChange={(v) => set('createFollowUpTask')(!!v)}
                    disabled={save.isPending}
                  />
                  {t('crm.contactLog.createTask', 'Aufgabe für die Wiedervorlage erstellen')}
                </label>
                {form.createFollowUpTask && (
                  <Field label={t('crm.contactLog.taskDepartment', 'Abteilung der Aufgabe')}>
                    <Select value={form.followUpDepartmentId} onValueChange={set('followUpDepartmentId')} disabled={save.isPending}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('crm.sites.tasksNoDepartment', 'Ohne Abteilung')}</SelectItem>
                        {departments.map((dep) => (
                          <SelectItem key={dep._id} value={dep._id}>{dep.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={!form.note.trim() || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save', 'Speichern')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-muted-foreground">
        {label}{required && <span className="ml-1 text-red-400">*</span>}
      </Label>
      {children}
    </div>
  );
}
