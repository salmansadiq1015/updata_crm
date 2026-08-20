import { redirect } from 'next/navigation';
import { TaskWorkspace } from '@/modules/tasks/ui/task-workspace';

export default async function TaskListPage({ params }) {
  const { listId } = await params;
  // "All tasks" is what /tasks itself now shows, tiles included — one address
  // for one view, rather than the same list with and without its header.
  if (listId === 'all') redirect('/tasks');
  return <TaskWorkspace listId={listId} />;
}
