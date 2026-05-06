import { use } from 'react';
import { TaskWorkspace } from '@/modules/tasks/ui/task-workspace';

export default function TaskListPage({ params }) {
  const { listId } = use(params);
  return <TaskWorkspace listId={listId === 'all' ? undefined : listId} />;
}
