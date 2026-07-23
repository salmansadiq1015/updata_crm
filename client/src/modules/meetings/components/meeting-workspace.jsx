'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Building2,
  Check,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Link2,
  ExternalLink,
  ListChecks,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  PhoneOff,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';
import { userService } from '@/modules/users/services/user-service';
import { customerService } from '@/modules/crm/services/customer-service';
import { projectService } from '@/modules/pm/services/project-service';
import {
  ATTENDANCE_META,
  ATTENDANCE_STATUSES,
  ONLINE_PROVIDERS,
  PARTICIPANT_ROLES,
  RSVP_META,
  RSVP_STATUSES,
  STATUS_META,
  TASK_PRIORITIES,
} from '../constants/meeting-constants';
import { useInfiniteMeetings, useMeeting, useMeetingFiles, useMeetingMutations } from '../hooks/use-meetings';

function getId(value) {
  if (!value) return '';
  if (typeof value === 'object') return value._id || value.id || '';
  return value;
}

function getUserName(user) {
  if (!user) return '';
  if (typeof user !== 'object') return user;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user._id;
}

function getInitials(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'M';
}

function normalizeOptionResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function formatDateTime(value, locale = 'de') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function defaultFormState() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    agenda: '',
    startAt: toDatetimeLocal(start),
    endAt: toDatetimeLocal(end),
    location: '',
    onlineProvider: 'INTERNAL',
    joinUrl: '',
    projectId: '',
    projectLabel: '',
    customerId: '',
    customerLabel: '',
    participants: [],
    reminders: [1440, 60],
  };
}

function formFromMeeting(meeting) {
  if (!meeting) return defaultFormState();
  return {
    title: meeting.title || '',
    description: meeting.description || '',
    agenda: meeting.agenda || '',
    startAt: toDatetimeLocal(meeting.startAt),
    endAt: toDatetimeLocal(meeting.endAt),
    location: meeting.location || '',
    onlineProvider: meeting.onlineMeeting?.provider || 'NONE',
    joinUrl: meeting.onlineMeeting?.joinUrl || '',
    projectId: getId(meeting.projectId),
    projectLabel: meeting.projectId?.name || meeting.projectId?.projectNumber || '',
    customerId: getId(meeting.customerId),
    customerLabel: meeting.customerId?.name || meeting.customerId?.customerNumber || '',
    participants: (meeting.participants || []).map((participant) => ({
      userId: getId(participant.userId),
      email: participant.email || '',
      displayName: participant.displayName || getUserName(participant.userId),
      role: participant.role || 'REQUIRED',
      rsvpStatus: participant.rsvpStatus || 'PENDING',
      attendanceStatus: participant.attendanceStatus || 'UNKNOWN',
    })),
    reminders: (meeting.reminders || []).map((reminder) => reminder.minutesBefore),
  };
}

function StatusBadge({ status, locale }) {
  const meta = STATUS_META[status] || STATUS_META.SCHEDULED;
  return (
    <Badge variant="outline" className={cn('border', meta.className)}>
      {locale === 'de' ? meta.label : meta.labelEn}
    </Badge>
  );
}

function RsvpBadge({ status, locale }) {
  const meta = RSVP_META[status] || RSVP_META.PENDING;
  return (
    <Badge variant="outline" className={cn('border', meta.className)}>
      {locale === 'de' ? meta.label : meta.labelEn}
    </Badge>
  );
}

function OptionSearch({ type, value, label, onSelect, onClear }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(search.trim(), 250);
  const isProject = type === 'project';
  const isSearching = debounced.trim().length >= 2;
  const recentParams = isProject
    ? { limit: 12, sortBy: 'updatedAt', sortOrder: 'desc' }
    : { limit: 12, sortBy: 'name', sortOrder: 'asc' };

  const query = useQuery({
    queryKey: isProject
      ? isSearching
        ? queryKeys.pm.projects.search(debounced)
        : queryKeys.pm.projects.list(recentParams)
      : isSearching
        ? queryKeys.crm.customers.search(debounced)
        : queryKeys.crm.customers.list(recentParams),
    queryFn: async () => {
      if (isProject) {
        return isSearching
          ? projectService.searchProjects(debounced, 12)
          : projectService.getProjects(recentParams);
      }
      return isSearching
        ? customerService.searchCustomers(debounced, 12)
        : customerService.getCustomers(recentParams);
    },
    enabled: open,
    staleTime: 60_000,
  });

  const items = useMemo(
    () => normalizeOptionResults(query.data).filter((item) => getId(item)),
    [query.data],
  );
  const placeholder = isProject
    ? t('meetings.form.searchProject', 'Projekt suchen...')
    : t('meetings.form.searchCustomer', 'Kunde suchen...');
  const EntityIcon = isProject ? CheckSquare : Building2;
  const getTitle = (item) => (
    isProject
      ? item.name || item.projectNumber || getId(item)
      : item.name || item.ownerName || item.customerNumber || getId(item)
  );
  const getSubtitle = (item) => (
    isProject
      ? [item.projectNumber, item.status].filter(Boolean).join(' · ')
      : [item.customerNumber, item.email].filter(Boolean).join(' · ')
  );
  const handleSelect = (item) => {
    const id = getId(item);
    if (!id) return;
    onSelect(id, getTitle(item));
    setSearch('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{isProject ? t('meetings.form.project', 'Projekt') : t('meetings.form.customer', 'Kunde')}</Label>
      {value ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/70 px-3.5 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <EntityIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">{label || value}</span>
          </span>
          <Button type="button" size="icon-sm" variant="ghost" className="rounded-full" onClick={onClear} aria-label={t('common.clear', 'Clear')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              className="h-11 rounded-xl bg-background/70 pl-9"
              placeholder={placeholder}
            />
          </div>
          {open && items.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg">
              {items.map((item) => {
                const id = getId(item);
                const title = getTitle(item);
                const subtitle = isProject
                  ? [item.projectNumber, item.status].filter(Boolean).join(' · ')
                  : [item.customerNumber, item.email].filter(Boolean).join(' · ');
                return (
                  <button
                    type="button"
                    key={id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(item);
                    }}
                    onClick={() => handleSelect(item)}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {getInitials(title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{title}</span>
                      {(getSubtitle(item) || subtitle) && <span className="block truncate text-xs text-muted-foreground">{getSubtitle(item) || subtitle}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {open && !query.isFetching && items.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
              {t('common.noResults', 'No records found')}
            </p>
          )}
          {query.isFetching && <p className="text-xs text-muted-foreground">{t('common.searching', 'Suche läuft...')}</p>}
        </>
      )}
    </div>
  );
}

function ParticipantPicker({ participants, onChange }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [externalEmail, setExternalEmail] = useState('');
  const debounced = useDebounce(search, 250);

  const usersQuery = useQuery({
    queryKey: queryKeys.users.directory({ search: debounced, limit: 12 }),
    queryFn: () => userService.getDirectory({ search: debounced, limit: 12 }),
    enabled: pickerOpen,
    staleTime: 60_000,
  });
  const selectedUserIds = useMemo(
    () => new Set(participants.map((participant) => participant.userId).filter(Boolean)),
    [participants],
  );
  const availableUsers = useMemo(
    () => (Array.isArray(usersQuery.data) ? usersQuery.data : []).filter((user) => !selectedUserIds.has(getId(user))),
    [selectedUserIds, usersQuery.data],
  );

  const addUser = (user) => {
    const id = getId(user);
    if (!id || participants.some((participant) => participant.userId === id)) return;
    onChange([
      ...participants,
      {
        userId: id,
        email: user.email || '',
        displayName: getUserName(user),
        role: 'REQUIRED',
        rsvpStatus: 'PENDING',
        attendanceStatus: 'UNKNOWN',
      },
    ]);
    setSearch('');
    setPickerOpen(false);
  };

  const addExternal = () => {
    const email = externalEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || participants.some((participant) => participant.email === email)) return;
    onChange([
      ...participants,
      {
        userId: '',
        email,
        displayName: email,
        role: 'OPTIONAL',
        rsvpStatus: 'PENDING',
        attendanceStatus: 'UNKNOWN',
      },
    ]);
    setExternalEmail('');
  };

  const updateParticipant = (index, patch) => {
    onChange(participants.map((participant, idx) => (idx === index ? { ...participant, ...patch } : participant)));
  };

  const removeParticipant = (index) => {
    onChange(participants.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-sm font-semibold">{t('meetings.form.participants', 'Teilnehmer')}</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="mt-2 h-11 w-full justify-start gap-2 rounded-xl bg-background/70 px-3.5 text-left font-normal text-muted-foreground">
                <UserPlus className="h-4 w-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">{t('meetings.form.searchUsers', 'Benutzer suchen...')}</span>
                <Search className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[70] w-[--radix-popover-trigger-width] gap-2 rounded-xl p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('meetings.form.searchUsers', 'Benutzer suchen...')}
                  className="h-10 rounded-lg pl-9 text-sm"
                />
              </div>
              <div className="max-h-64 overflow-y-auto pr-1">
                {availableUsers.length > 0 ? (
                  availableUsers.map((user) => {
                    const name = getUserName(user);
                    return (
                      <button
                        key={getId(user)}
                        type="button"
                        onClick={() => addUser(user)}
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {getInitials(name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {usersQuery.isFetching ? t('common.searching', 'Searching...') : t('common.noResults', 'No records found')}
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-sm font-semibold">{t('meetings.form.externalParticipant', 'Externe E-Mail')}</Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={externalEmail}
              onChange={(event) => setExternalEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addExternal();
                }
              }}
              className="h-11 rounded-xl bg-background/70"
              placeholder="partner@example.com"
            />
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={addExternal}>
              <Plus className="h-4 w-4" />
              {t('common.add', 'Add')}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {participants.map((participant, index) => (
          <div key={`${participant.userId || participant.email}-${index}`} className="grid gap-3 rounded-xl border border-border/70 bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(participant.displayName || participant.email || participant.userId)}
              </span>
              <span className="min-w-0">
                <p className="truncate text-sm font-semibold">{participant.displayName || participant.email || participant.userId}</p>
                <p className="truncate text-xs text-muted-foreground">{participant.email || participant.userId}</p>
              </span>
            </div>
            <Select value={participant.role} onValueChange={(role) => updateParticipant(index, { role })}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[80]">
                {PARTICIPANT_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>{t(`meetings.roles.${role}`, role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" variant="ghost" className="rounded-xl text-muted-foreground hover:text-destructive" onClick={() => removeParticipant(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {participants.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
            {t('common.noResults', 'No records found')}
          </p>
        )}
      </div>
    </div>
  );
}

function MeetingFormDialog({ open, onOpenChange, meeting, onSubmit, isPending }) {
  const { t, locale } = useLanguage();
  const [form, setForm] = useState(defaultFormState);

  useEffect(() => {
    if (open) setForm(formFromMeeting(meeting));
  }, [meeting, open]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const isEdit = Boolean(meeting?._id);
  const providerLabel = t(`meetings.providers.${form.onlineProvider}`, form.onlineProvider.replaceAll('_', ' '));

  const submit = (event) => {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      agenda: form.agenda.trim(),
      startAt: fromDatetimeLocal(form.startAt),
      endAt: fromDatetimeLocal(form.endAt),
      location: form.location.trim(),
      onlineMeeting: {
        provider: form.onlineProvider,
        joinUrl: form.joinUrl.trim(),
      },
      projectId: form.projectId || null,
      customerId: form.customerId || null,
      participants: form.participants.map((participant) => ({
        userId: participant.userId || null,
        email: participant.email || null,
        displayName: participant.displayName || '',
        role: participant.role,
        rsvpStatus: participant.rsvpStatus,
        attendanceStatus: participant.attendanceStatus,
      })),
      reminderMinutesBefore: form.reminders,
    };
    if (isEdit) payload.expectedVersion = meeting.version;
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="bg-card/95 pr-16">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <CalendarPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl">
                  {isEdit ? t('meetings.form.editTitle', 'Meeting bearbeiten') : t('meetings.form.createTitle', 'Meeting planen')}
                </DialogTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1.5 rounded-lg px-2.5 py-1">
                    <Clock3 className="h-3.5 w-3.5 text-primary" />
                    {form.startAt ? formatDateTime(fromDatetimeLocal(form.startAt), locale) : t('meetings.form.start', 'Start')}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 rounded-lg px-2.5 py-1">
                    <Video className="h-3.5 w-3.5 text-primary" />
                    {providerLabel}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 rounded-lg px-2.5 py-1">
                    <UsersRound className="h-3.5 w-3.5 text-primary" />
                    {form.participants.length}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-6 bg-muted/10 px-4 py-5 sm:px-7">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>{t('meetings.form.title', 'Titel')}</Label>
                  <Input required className="h-11 rounded-xl bg-background/70" value={form.title} onChange={(event) => patch('title', event.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('meetings.form.start', 'Start')}</Label>
                    <Input required type="datetime-local" className="h-11 rounded-xl bg-background/70" value={form.startAt} onChange={(event) => patch('startAt', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('meetings.form.end', 'Ende')}</Label>
                    <Input required type="datetime-local" className="h-11 rounded-xl bg-background/70" value={form.endAt} onChange={(event) => patch('endAt', event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('meetings.form.agenda', 'Agenda')}</Label>
                  <Textarea className="min-h-28 rounded-xl bg-background/70" value={form.agenda} onChange={(event) => patch('agenda', event.target.value)} rows={5} />
                </div>
                <div className="space-y-2">
                  <Label>{t('meetings.form.description', 'Beschreibung')}</Label>
                  <Textarea className="min-h-24 rounded-xl bg-background/70" value={form.description} onChange={(event) => patch('description', event.target.value)} rows={3} />
                </div>
                <ParticipantPicker participants={form.participants} onChange={(participants) => patch('participants', participants)} />
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('meetings.form.location', 'Ort')}</Label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-11 rounded-xl bg-background/70 pl-9" value={form.location} onChange={(event) => patch('location', event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('meetings.form.onlineProvider', 'Online Meeting')}</Label>
                  <Select value={form.onlineProvider} onValueChange={(provider) => patch('onlineProvider', provider)}>
                    <SelectTrigger className="h-11 rounded-xl bg-background/70"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[80]">
                      {ONLINE_PROVIDERS.map((provider) => (
                        <SelectItem key={provider} value={provider}>{t(`meetings.providers.${provider}`, provider.replaceAll('_', ' '))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.onlineProvider !== 'NONE' && form.onlineProvider !== 'INTERNAL' && (
                  <div className="space-y-2">
                    <Label>{t('meetings.form.joinUrl', 'Join-Link')}</Label>
                    <div className="relative">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="h-11 rounded-xl bg-background/70 pl-9" value={form.joinUrl} onChange={(event) => patch('joinUrl', event.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                )}
                <OptionSearch
                  type="project"
                  value={form.projectId}
                  label={form.projectLabel}
                  onSelect={(projectId, projectLabel) => setForm((current) => ({ ...current, projectId, projectLabel }))}
                  onClear={() => setForm((current) => ({ ...current, projectId: '', projectLabel: '' }))}
                />
                <OptionSearch
                  type="customer"
                  value={form.customerId}
                  label={form.customerLabel}
                  onSelect={(customerId, customerLabel) => setForm((current) => ({ ...current, customerId, customerLabel }))}
                  onClear={() => setForm((current) => ({ ...current, customerId: '', customerLabel: '' }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Abbrechen')}</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('meetings.form.create', 'Meeting erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeetingList({ meetings, selectedId, onSelect, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading }) {
  const { t, locale } = useLanguage();
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: meetings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 118,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= meetings.length - 4 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, meetings.length, virtualItems]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
        <Video className="h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">{t('meetings.empty.title', 'Keine Meetings gefunden')}</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t('meetings.empty.desc', 'Planen Sie ein Meeting oder passen Sie die Filter an.')}</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-[calc(100dvh-290px)] min-h-[420px] overflow-auto rounded-lg border bg-card">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const meeting = meetings[virtualRow.index];
          const selected = selectedId === meeting._id;
          return (
            <button
              key={meeting._id}
              type="button"
              onClick={() => onSelect(meeting._id)}
              className={cn(
                'absolute left-0 right-0 block w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/40',
                selected && 'bg-primary/[0.04]',
              )}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{meeting.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meeting.agenda || meeting.description || t('meetings.noAgenda', 'Keine Agenda hinterlegt')}</p>
                </div>
                <StatusBadge status={meeting.status} locale={locale} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> <span className="truncate">{formatDateTime(meeting.startAt, locale)}</span></span>
                <span className="flex min-w-0 items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" /> {meeting.participants?.length || 0}</span>
              </div>
            </button>
          );
        })}
      </div>
      {isFetchingNextPage && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
    </div>
  );
}

function MeetingSummary({ meeting }) {
  const { t, locale } = useLanguage();
  const accepted = meeting.participants?.filter((participant) => participant.rsvpStatus === 'ACCEPTED').length || 0;
  const present = meeting.participants?.filter((participant) => participant.attendanceStatus === 'PRESENT').length || 0;
  const decisions = meeting.decisions?.length || 0;
  const tasks = meeting.taskIds?.length || 0;

  const tiles = [
    { label: t('meetings.summary.rsvp', 'Zugesagt'), value: `${accepted}/${meeting.participants?.length || 0}`, icon: UserCheck },
    { label: t('meetings.summary.present', 'Anwesend'), value: present, icon: CheckCircle2 },
    { label: t('meetings.summary.decisions', 'Entscheidungen'), value: decisions, icon: ListChecks },
    { label: t('meetings.summary.tasks', 'Folgeaufgaben'), value: tasks, icon: CheckSquare },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
          <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
        </div>
      ))}
      <div className="rounded-lg border bg-card px-4 py-3 sm:col-span-2 xl:col-span-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.detail.time', 'Zeit')}</p>
        <p className="mt-1 text-sm">{formatDateTime(meeting.startAt, locale)} - {formatDateTime(meeting.endAt, locale)}</p>
      </div>
    </div>
  );
}

function OnlineMeetingDialog({ meeting, open, onOpenChange }) {
  const { t, locale } = useLanguage();
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  useEffect(() => {
    if (!open || meeting?.onlineMeeting?.provider !== 'INTERNAL') return undefined;
    let active = true;

    navigator.mediaDevices?.getUserMedia({ audio: true, video: true })
      .then((mediaStream) => {
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(mediaStream);
        setMediaError('');
        setAudioEnabled(true);
        setVideoEnabled(true);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      })
      .catch(() => {
        if (active) setMediaError(t('meetings.room.mediaError', 'Kamera oder Mikrofon konnte nicht gestartet werden.'));
      });

    return () => {
      active = false;
      setStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [meeting?.onlineMeeting?.provider, open, t]);

  useEffect(() => {
    if (videoRef.current && stream && videoEnabled) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoEnabled]);

  const toggleTrack = (kind) => {
    const tracks = kind === 'audio' ? stream?.getAudioTracks() : stream?.getVideoTracks();
    if (!tracks?.length) return;
    const nextEnabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = nextEnabled; });
    if (kind === 'audio') setAudioEnabled(nextEnabled);
    if (kind === 'video') setVideoEnabled(nextEnabled);
  };

  if (!meeting) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('meetings.room.title', 'Online-Meeting')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="relative aspect-video overflow-hidden rounded-lg border bg-black">
              {stream && videoEnabled ? (
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-white/80">
                  <VideoOff className="h-10 w-10" />
                  <p className="mt-2 text-sm">{t('meetings.room.cameraOff', 'Kamera aus')}</p>
                </div>
              )}
              {mediaError && (
                <div className="absolute inset-x-3 bottom-3 rounded-md bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground">
                  {mediaError}
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.room.currentMeeting', 'Aktuelles Meeting')}</p>
                <p className="mt-1 font-semibold">{meeting.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(meeting.startAt, locale)} - {formatDateTime(meeting.endAt, locale)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.detail.agenda', 'Agenda')}</p>
                <p className="mt-1 line-clamp-5 text-sm text-muted-foreground">{meeting.agenda || t('meetings.noAgenda', 'Keine Agenda hinterlegt')}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UsersRound className="h-4 w-4" />
                {t('meetings.room.participants', '{count} Teilnehmer', { count: meeting.participants?.length || 0 })}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => toggleTrack('audio')} disabled={!stream}>
              {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => toggleTrack('video')} disabled={!stream}>
              {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
          </div>
          <Button type="button" variant="destructive" className="gap-2" onClick={() => onOpenChange(false)}>
            <PhoneOff className="h-4 w-4" />
            {t('meetings.room.leave', 'Verlassen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetail({ meetingId, onEdit }) {
  const { t, locale } = useLanguage();
  const searchParams = useSearchParams();
  const { data: meeting, isLoading } = useMeeting(meetingId, Boolean(meetingId));
  const { data: files = [] } = useMeetingFiles(meetingId);
  const mutations = useMeetingMutations();
  const [roomOpen, setRoomOpen] = useState(false);
  const [rsvp, setRsvp] = useState('ACCEPTED');
  const [attendance, setAttendance] = useState([]);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState({ title: '', description: '', ownerId: '', dueDate: '' });
  const [taskDraft, setTaskDraft] = useState({ title: '', assigneeId: '', dueDate: '', priority: 'MEDIUM', decisionId: '' });

  useEffect(() => {
    if (!meeting) return;
    setAttendance((meeting.participants || []).filter((participant) => participant.userId).map((participant) => ({
      userId: getId(participant.userId),
      attendanceStatus: participant.attendanceStatus || 'UNKNOWN',
    })));
    setMinutes(meeting.minutes?.summary || '');
    setRsvp('ACCEPTED');
  }, [meeting]);

  useEffect(() => {
    if (meeting?._id && searchParams.get('join') === '1') setRoomOpen(true);
  }, [meeting?._id, searchParams]);

  if (!meetingId) {
    return (
      <div className="flex min-h-[560px] flex-col items-center justify-center rounded-lg border border-dashed bg-card text-center">
        <Video className="h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">{t('meetings.detail.emptyTitle', 'Meeting auswählen')}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('meetings.detail.emptyDesc', 'Wählen Sie links ein Meeting aus, um Agenda, Teilnehmer, Protokoll und Folgeaufgaben zu bearbeiten.')}</p>
      </div>
    );
  }

  if (isLoading || !meeting) {
    return <Skeleton className="min-h-[560px] rounded-lg" />;
  }

  const joinUrl = meeting.onlineMeeting?.joinUrl;
  const isInternalOnline = meeting.onlineMeeting?.provider === 'INTERNAL';
  const assignableParticipants = (meeting.participants || [])
    .map((participant) => ({
      id: getId(participant.userId),
      label: participant.displayName || getUserName(participant.userId) || participant.email,
    }))
    .filter((participant) => participant.id);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{meeting.title}</h2>
            <StatusBadge status={meeting.status} locale={locale} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{meeting.location || t('meetings.detail.noLocation', 'Kein Ort hinterlegt')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {joinUrl && isInternalOnline && (
            <Button className="gap-2" onClick={() => setRoomOpen(true)}>
              <ExternalLink className="h-4 w-4" />
              {t('meetings.actions.join', 'Beitreten')}
            </Button>
          )}
          {joinUrl && !isInternalOnline && (
            <Button asChild className="gap-2">
              <a href={joinUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('meetings.actions.join', 'Beitreten')}
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => onEdit(meeting)}>{t('common.edit', 'Bearbeiten')}</Button>
          <Button
            variant="outline"
            onClick={() => mutations.cancel.mutate({ id: meeting._id, data: { reason: t('meetings.cancel.defaultReason', 'Abgesagt') } })}
            disabled={meeting.status === 'CANCELLED'}
          >
            {t('meetings.actions.cancel', 'Absagen')}
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <MeetingSummary meeting={meeting} />

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="overview">{t('meetings.tabs.overview', 'Übersicht')}</TabsTrigger>
            <TabsTrigger value="people">{t('meetings.tabs.people', 'Teilnehmer')}</TabsTrigger>
            <TabsTrigger value="minutes">{t('meetings.tabs.minutes', 'Protokoll')}</TabsTrigger>
            <TabsTrigger value="decisions">{t('meetings.tabs.decisions', 'Entscheidungen')}</TabsTrigger>
            <TabsTrigger value="files">{t('meetings.tabs.files', 'Dokumente')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.detail.agenda', 'Agenda')}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{meeting.agenda || t('meetings.noAgenda', 'Keine Agenda hinterlegt')}</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.detail.links', 'Verknüpfungen')}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p>{t('meetings.form.project', 'Projekt')}: {meeting.projectId?.name || meeting.projectId?.projectNumber || '-'}</p>
                  <p>{t('meetings.form.customer', 'Kunde')}: {meeting.customerId?.name || meeting.customerId?.customerNumber || '-'}</p>
                  <p>{t('meetings.summary.tasks', 'Folgeaufgaben')}: {meeting.taskIds?.length || 0}</p>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('meetings.detail.rsvp', 'RSVP')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select value={rsvp} onValueChange={setRsvp}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RSVP_STATUSES.map((status) => <SelectItem key={status} value={status}>{RSVP_META[status]?.[locale === 'de' ? 'label' : 'labelEn'] || status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => mutations.rsvp.mutate({ id: meeting._id, rsvpStatus: rsvp })}>{t('meetings.actions.saveRsvp', 'Antwort speichern')}</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="people" className="space-y-3">
            {(meeting.participants || []).map((participant) => (
              <div key={`${participant.userId?._id || participant.userId || participant.email}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_120px_180px]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{participant.displayName || getUserName(participant.userId) || participant.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{participant.email || participant.userId?.email || participant.role}</p>
                </div>
                <RsvpBadge status={participant.rsvpStatus} locale={locale} />
                {participant.userId ? (
                  <Select
                    value={attendance.find((item) => item.userId === getId(participant.userId))?.attendanceStatus || 'UNKNOWN'}
                    onValueChange={(attendanceStatus) => setAttendance((current) => current.map((item) => (
                      item.userId === getId(participant.userId) ? { ...item, attendanceStatus } : item
                    )))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_STATUSES.map((status) => <SelectItem key={status} value={status}>{ATTENDANCE_META[status]?.[locale === 'de' ? 'label' : 'labelEn'] || status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <span className="text-xs text-muted-foreground">{t('meetings.people.external', 'Extern')}</span>}
              </div>
            ))}
            <Button onClick={() => mutations.attendance.mutate({ id: meeting._id, attendees: attendance })}>{t('meetings.actions.saveAttendance', 'Teilnahme speichern')}</Button>
          </TabsContent>

          <TabsContent value="minutes" className="space-y-4">
            <Textarea value={minutes} onChange={(event) => setMinutes(event.target.value)} rows={8} placeholder={t('meetings.minutes.placeholder', 'Protokoll, Ergebnisse und offene Punkte...')} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => mutations.minutes.mutate({ id: meeting._id, data: { summary: minutes } })}>{t('meetings.actions.saveMinutes', 'Protokoll speichern')}</Button>
              <Button variant="outline" onClick={() => mutations.minutes.mutate({ id: meeting._id, data: { summary: minutes, markCompleted: true } })}>{t('meetings.actions.completeMeeting', 'Meeting abschliessen')}</Button>
            </div>
            <div className="rounded-lg border p-4">
              <Label>{t('meetings.note.quick', 'Meeting-Notiz')}</Label>
              <div className="mt-2 flex gap-2">
                <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('meetings.note.placeholder', 'Kurze Notiz...')} />
                <Button onClick={() => {
                  mutations.note.mutate({ id: meeting._id, data: { content: note } }, { onSuccess: () => setNote('') });
                }}>{t('common.add', 'Hinzufügen')}</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="decisions" className="space-y-4">
            <div className="grid gap-3 rounded-lg border p-4 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
              <Input value={decision.title} onChange={(event) => setDecision((current) => ({ ...current, title: event.target.value }))} placeholder={t('meetings.decision.title', 'Entscheidung')} />
              <Input type="date" value={decision.dueDate} onChange={(event) => setDecision((current) => ({ ...current, dueDate: event.target.value }))} />
              <Button onClick={() => {
                mutations.decision.mutate({ id: meeting._id, data: decision }, { onSuccess: () => setDecision({ title: '', description: '', ownerId: '', dueDate: '' }) });
              }}>{t('common.add', 'Hinzufügen')}</Button>
              <Textarea className="xl:col-span-3" value={decision.description} onChange={(event) => setDecision((current) => ({ ...current, description: event.target.value }))} placeholder={t('meetings.decision.description', 'Begründung / Kontext')} />
            </div>

            {(meeting.decisions || []).map((item) => (
              <div key={item._id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                  </div>
                  {item.taskId ? (
                    <Badge variant="success">{t('meetings.decision.taskLinked', 'Aufgabe erstellt')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTaskDraft((current) => ({ ...current, decisionId: item._id, title: item.title }))}
                    >
                      {t('meetings.actions.createTask', 'Aufgabe erstellen')}
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">{t('meetings.task.title', 'Folgeaufgabe')}</p>
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_160px_160px_auto]">
                <Input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t('tasks.form.title', 'Titel')} />
                <Select value={taskDraft.assigneeId || 'self'} onValueChange={(assigneeId) => setTaskDraft((current) => ({ ...current, assigneeId: assigneeId === 'self' ? '' : assigneeId }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">{t('meetings.task.assignSelf', 'Mir zuweisen')}</SelectItem>
                    {assignableParticipants.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>{participant.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                <Select value={taskDraft.priority} onValueChange={(priority) => setTaskDraft((current) => ({ ...current, priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{t(`tasks.priority.${priority}`, priority)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => {
                  mutations.task.mutate({ id: meeting._id, data: taskDraft }, { onSuccess: () => setTaskDraft({ title: '', assigneeId: '', dueDate: '', priority: 'MEDIUM', decisionId: '' }) });
                }}>{t('common.create', 'Erstellen')}</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <div className="rounded-lg border border-dashed p-4">
              <Label>{t('meetings.files.upload', 'Dokument anhängen')}</Label>
              <Input
                className="mt-2"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) mutations.uploadFile.mutate({ id: meeting._id, file });
                  event.target.value = '';
                }}
              />
            </div>
            <div className="space-y-2">
              {files.length === 0 && <p className="text-sm text-muted-foreground">{t('meetings.files.empty', 'Keine Dokumente angehängt')}</p>}
              {files.map((file) => (
                <div key={file._id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm"><Paperclip className="h-4 w-4" /><span className="truncate">{file.originalName}</span></span>
                  <Button size="sm" variant="outline" onClick={() => mutations.downloadFile.mutate(file._id)}>
                    {t('common.download', 'Download')}
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <OnlineMeetingDialog meeting={meeting} open={roomOpen} onOpenChange={setRoomOpen} />
    </div>
  );
}

export function MeetingWorkspace() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [scope, setScope] = useState('upcoming');
  const [selectedId, setSelectedId] = useState(searchParams.get('meetingId') || '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const debouncedSearch = useDebounce(search, 300);
  const mutations = useMeetingMutations();

  useEffect(() => {
    const id = searchParams.get('meetingId') || '';
    if (id && id !== selectedId) setSelectedId(id);
  }, [searchParams, selectedId]);

  const filters = useMemo(() => ({
    q: debouncedSearch || undefined,
    status,
    scope,
    sortBy: scope === 'past' ? 'startAt' : 'startAt',
    sortOrder: scope === 'past' ? 'desc' : 'asc',
    limit: 50,
  }), [debouncedSearch, scope, status]);

  const meetingsQuery = useInfiniteMeetings(filters);
  const meetings = useMemo(() => meetingsQuery.data?.pages?.flatMap((page) => page?.data || []) || [], [meetingsQuery.data]);

  const selectMeeting = (id) => {
    setSelectedId(id);
    router.replace(`/scheduling/meetings?meetingId=${id}`, { scroll: false });
  };

  const handleCreate = (payload) => {
    mutations.create.mutate(payload, {
      onSuccess: (meeting) => {
        setDialogOpen(false);
        setSelectedId(meeting._id);
        router.replace(`/scheduling/meetings?meetingId=${meeting._id}`, { scroll: false });
      },
    });
  };

  const handleUpdate = (payload) => {
    if (!editTarget?._id) return;
    mutations.update.mutate({ id: editTarget._id, data: payload }, {
      onSuccess: () => {
        setEditTarget(null);
        setDialogOpen(false);
      },
    });
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title={t('meetings.title', 'Meetings')}
        description={t('meetings.description', 'Planen, durchführen und verfolgen Sie Besprechungen mit Teilnehmern, Protokollen, Entscheidungen und Folgeaufgaben.')}
        icon={Video}
        count={meetings.length}
      >
        <Button onClick={() => { setEditTarget(null); setDialogOpen(true); }} className="gap-2">
          <CalendarPlus className="h-4 w-4" />
          {t('meetings.actions.new', 'Meeting planen')}
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.42fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={t('meetings.search', 'Meetings suchen...')} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">{t('meetings.scope.upcoming', 'Bevorstehend')}</SelectItem>
                  <SelectItem value="past">{t('meetings.scope.past', 'Vergangen')}</SelectItem>
                  <SelectItem value="all">{t('meetings.scope.all', 'Alle')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all', 'Alle')}</SelectItem>
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{locale === 'de' ? meta.label : meta.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <MeetingList
            meetings={meetings}
            selectedId={selectedId}
            onSelect={selectMeeting}
            hasNextPage={meetingsQuery.hasNextPage}
            fetchNextPage={meetingsQuery.fetchNextPage}
            isFetchingNextPage={meetingsQuery.isFetchingNextPage}
            isLoading={meetingsQuery.isLoading}
          />
        </div>

        <MeetingDetail meetingId={selectedId} onEdit={(meeting) => { setEditTarget(meeting); setDialogOpen(true); }} />
      </div>

      {meetingsQuery.isFetching && !meetingsQuery.isFetchingNextPage && (
        <div className="fixed bottom-4 right-4 rounded-full border bg-card px-3 py-2 text-xs shadow-lg">
          <span className="inline-flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" />{t('common.refreshing', 'Aktualisiere...')}</span>
        </div>
      )}

      <MeetingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={editTarget}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        isPending={mutations.create.isPending || mutations.update.isPending}
      />
    </div>
  );
}

export default MeetingWorkspace;
