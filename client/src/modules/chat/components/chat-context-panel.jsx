'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CalendarPlus,
  CheckSquare,
  FileText,
  FolderKanban,
  MessageSquare,
  Users,
  Wrench,
  Building2,
  ArrowUpRight,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  getInitials,
  getRoomDisplayName,
  getRoomKindLabel,
  getUserDisplayName,
  stableColor,
} from '../utils/chat-room-utils';

function idOf(value) {
  return value?._id || value || null;
}

function ActionLink({ href, icon: Icon, label, disabled }) {
  if (disabled) {
    return (
      <Button variant="secondary" className="h-auto min-h-11 w-full justify-start gap-3 rounded-2xl px-3 py-2" disabled>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm">{label}</span>
      </Button>
    );
  }

  return (
    <Button asChild variant="secondary" className="h-auto min-h-11 w-full justify-start gap-3 rounded-2xl px-3 py-2">
      <Link href={href}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm">{label}</span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </Link>
    </Button>
  );
}

function ContextRow({ icon: Icon, label, value, href }) {
  if (!value) return null;

  const content = (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/50 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
      {href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </div>
  );

  // `block` so the section's vertical spacing (space-y) applies — a default
  // inline <a> would ignore the margin and stick the rows together.
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

export function ChatContextPanel({ room, currentUserId, onManageLeads }) {
  const { t } = useLanguage();

  if (!room) {
    return (
      <aside className="hidden w-80 shrink-0 border-l border-border/60 bg-card/80 p-4 xl:block">
        <div className="h-full rounded-3xl border border-border/60 bg-muted/20" />
      </aside>
    );
  }

  const project = room.project || room.projectId;
  const order = room.order || room.orderId;
  const customer = room.customer || room.customerId;
  const projectId = idOf(project || order?.projectId);
  const orderId = idOf(order);
  const customerId = idOf(customer || project?.customerId || order?.customerId);
  const members = room.members ?? [];

  return (
    <aside className="mt-5">
      <div className="space-y-4">
        <section className="rounded-3xl border border-border/60 bg-background/55 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{getRoomDisplayName(room, currentUserId, t)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="rounded-full">{getRoomKindLabel(room, t)}</Badge>
                {room.isActive !== false && (
                  <Badge variant="outline" className="rounded-full border-emerald-500/35 text-emerald-600 dark:text-emerald-400">
                    {t('chat.active', 'Active')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">{t('chat.workspace.linkedLeads', 'Linked leads')}</p>{onManageLeads && <Button size="sm" variant="outline" onClick={onManageLeads}>{t('chat.workspace.manageLeads', 'Manage leads')}</Button>}</div>{(room.leadIds || []).map(lead => <ContextRow key={lead._id} icon={Users} label={lead.leadNumber} value={lead.name} href={`/leads/${lead._id}`} />)}</section>
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase text-muted-foreground">{t('chat.linkedRecords', 'Linked records')}</p>
          <ContextRow
            icon={FolderKanban}
            label={t('chat.project', 'Project')}
            value={project?.name || project?.projectNumber}
            href={projectId ? `/projects/${projectId}` : null}
          />
          <ContextRow
            icon={Wrench}
            label={t('chat.job', 'Job')}
            value={order?.orderNumber || order?.title}
            href={orderId ? `/field-ops/orders/${orderId}` : null}
          />
          <ContextRow
            icon={Building2}
            label={t('chat.customer', 'Customer')}
            value={customer?.name || project?.customerName || order?.customerName}
            href={customerId ? `/crm/customers/${customerId}` : null}
          />
        </section>

        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase text-muted-foreground">{t('chat.conversationActions', 'Actions')}</p>
          <ActionLink
            href={'/tasks'}
            icon={CheckSquare}
            label={t('chat.workspace.openTasks', 'Open tasks')}
          />
          <ActionLink
            href={'/scheduling/calendar'}
            icon={CalendarPlus}
            label={t('chat.workspace.openCalendar', 'Open calendar')}
          />
          <ActionLink
            href={'/documents'}
            icon={FileText}
            label={t('chat.openDocuments', 'Open documents')}
          />
        </section>

        <section className="rounded-3xl border border-border/60 bg-background/55 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t('chat.members', 'Members')}</p>
            <Badge variant="secondary" className="rounded-full">{members.length}</Badge>
          </div>
          <div className="space-y-2">
            {members.map((member) => {
              const user = member.userId;
              const name = getUserDisplayName(user) || t('chat.member', 'Member');
              return (
                <div key={String(user?._id || member.userId)} className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback style={{ backgroundColor: stableColor(name) }} className="text-[10px] font-semibold text-white">
                      {getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                  </div>
                </div>
              );
            })}

          </div>
        </section>

      </div>
    </aside>
  );
}
