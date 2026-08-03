'use client';

import { TaskDepartmentBoard } from '@/modules/tasks/components/task-department-board';

export default function TasksBoardPage() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <TaskDepartmentBoard />
    </div>
  );
}
