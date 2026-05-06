import { use } from 'react';
import { TaskDetailPage } from '@/modules/tasks/ui/task-detail-page';

type Params = Promise<{ listId: string; taskId: string }>;

export default function TaskDetailRoute({ params }: { params: Params }) {
  const { listId, taskId } = use(params);
  return <TaskDetailPage taskId={taskId} listId={listId} />;
}
