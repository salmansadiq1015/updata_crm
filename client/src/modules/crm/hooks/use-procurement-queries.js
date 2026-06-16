'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { sparePartService } from '@/modules/crm/services/spare-part-service';
import { supplierService } from '@/modules/crm/services/supplier-service';
import { purchaseOrderService } from '@/modules/crm/services/purchase-order-service';

export function useProcurementStats() {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.stats(),
    queryFn: () => purchaseOrderService.getStats(),
    staleTime: 30_000,
  });
}

export function useInventory(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.list(filters),
    queryFn: () => sparePartService.list(filters),
    staleTime: 30_000,
  });
}

export function useLowStock(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.lowStock(filters),
    queryFn: () => purchaseOrderService.getLowStock(filters),
    staleTime: 30_000,
  });
}

export function useSuppliers(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.suppliers.list(filters),
    queryFn: () => supplierService.list(filters),
    staleTime: 60_000,
  });
}

export function useSupplierDetail(id) {
  return useQuery({
    queryKey: queryKeys.crm.suppliers.detail(id),
    queryFn: () => supplierService.getById(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function usePurchaseOrders(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.purchaseOrders.list(filters),
    queryFn: () => purchaseOrderService.list(filters),
    staleTime: 30_000,
  });
}

export function usePurchaseOrderDetail(id) {
  return useQuery({
    queryKey: queryKeys.crm.purchaseOrders.detail(id),
    queryFn: () => purchaseOrderService.getById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useInventoryMovements(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.movements(filters),
    queryFn: () => purchaseOrderService.getMovements(filters),
    staleTime: 30_000,
  });
}

export function usePartMovements(partId) {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.movementsByPart(partId),
    queryFn: () => purchaseOrderService.getMovementsByPart(partId),
    enabled: !!partId,
    staleTime: 30_000,
  });
}

export function useOrderRequests(filters = {}) {
  return useQuery({
    queryKey: queryKeys.crm.spareParts.orderRequests(filters),
    queryFn: () => sparePartService.listOrderRequests(filters),
    staleTime: 30_000,
  });
}
