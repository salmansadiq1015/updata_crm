'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function FieldOpsChatSidebarItem({ order, isActive }) {
  const router = useRouter();
  const projectId = order.projectId || order.project_id;
  const customerName = order.customerName || order.customer_name || '?';
  const orderNumber = order.orderNumber || order.order_number || order._id?.slice(-6) || '—';
  const orderType = order.type || order.order_type || '';

  const initials = customerName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <button
      onClick={() => router.push(`/field-ops/chat/${projectId}`)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
        'hover:bg-muted/60',
        isActive
          ? 'bg-primary/[0.08] border-l-2 border-l-primary'
          : 'border-l-2 border-l-transparent'
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="text-sm font-medium">{initials || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{customerName}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">#{orderNumber}</span>
          {orderType && (
            <span className="text-xs text-muted-foreground truncate">· {orderType}</span>
          )}
        </div>
      </div>
    </button>
  );
}
