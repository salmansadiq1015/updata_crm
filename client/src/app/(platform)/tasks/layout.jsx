'use client';

import { useState } from 'react';
import { TaskListSidebar } from '@/modules/tasks/components/task-list-sidebar';
import { useRouter, usePathname } from 'next/navigation';

export default function TasksLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const activeListId = (() => {
    const match = pathname.match(/^\/tasks\/(.+)$/);
    if (!match) return null;
    return match[1] === 'all' ? null : match[1];
  })();

  const handleSelectList = (listId) => {
    if (!listId) {
      router.push('/tasks/all');
    } else {
      router.push(`/tasks/${listId}`);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <TaskListSidebar activeListId={activeListId} onSelectList={handleSelectList} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
