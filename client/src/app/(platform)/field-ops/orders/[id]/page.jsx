'use client';
import { use } from 'react';
import { FieldOpsOrderDetailTabs } from '@/modules/field-ops/components/orders/field-ops-order-detail-tabs';
export default function FieldOpsOrderDetailPage({ params }) {
  const { id } = use(params);
  return <FieldOpsOrderDetailTabs orderId={id} />;
}
