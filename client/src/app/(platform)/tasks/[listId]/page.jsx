'use client';

import { use } from 'react';
import { TasksTable } from '@/modules/tasks/components/tasks-table';
import { PageHeader } from '@/shared/components/page-header';
import { useTaskLists } from '@/modules/tasks/hooks/use-task-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { CheckSquare } from 'lucide-react';

export default function TaskListPage({ params }) {
  const { listId } = use(params);
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: lists = [] } = useTaskLists();

  const isAll = listId === 'all';
  const list = isAll ? null : lists.find((l) => l._id === listId);
  const title = isAll
    ? (de ? 'Alle Aufgaben' : 'All Tasks')
    : (list?.name ?? (de ? 'Aufgaben' : 'Tasks'));

  return (
    <div className="flex flex-col gap-4 h-full">
      <PageHeader
        icon={CheckSquare}
        title={title}
        description={isAll
          ? (de ? 'Alle Ihre Aufgaben auf einen Blick' : 'All your tasks at a glance')
          : (list ? (de ? `Aufgaben in "${list.name}"` : `Tasks in "${list.name}"`) : '')}
      />
      <TasksTable listId={isAll ? undefined : listId} />
    </div>
  );
}
