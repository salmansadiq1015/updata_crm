'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export function FieldOpsChatHeader({ order }) {
  if (!order) {
    return (
      <div className="h-[60px] shrink-0 border-b flex items-center px-4 gap-3">
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 bg-muted animate-pulse rounded w-32" />
          <div className="h-2.5 bg-muted animate-pulse rounded w-20" />
        </div>
      </div>
    );
  }

  const customerName = order.customerName || order.customer_name || '?';
  const orderNumber = order.orderNumber || order.order_number || order._id?.slice(-6) || '—';
  const orderType = order.type || order.order_type;

  const initials = customerName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="h-[60px] shrink-0 border-b flex items-center px-4 gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs font-medium">{initials || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{customerName}</span>
          {orderType && (
            <Badge variant="secondary" className="text-xs shrink-0">{orderType}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">#{orderNumber}</p>
      </div>
    </div>
  );
}
