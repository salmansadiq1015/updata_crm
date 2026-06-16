'use client';

import { useState } from 'react';
import { Package, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/shared/components/page-header';
import { ProcurementKpiCards } from './procurement/kpi-cards';
import { InventoryTab } from './procurement/inventory-tab';
import { ReorderTab } from './procurement/reorder-tab';
import { PurchaseOrdersTab } from './procurement/purchase-orders-tab';
import { GoodsReceiptTab } from './procurement/goods-receipt-tab';
import { MovementHistoryTab } from './procurement/movement-history-tab';
import { DeliveryNoteScanner } from './procurement/delivery-note-scanner';
import { useLanguage } from '@/lib/i18n/language-context';
import { useLowStock } from '@/modules/crm/hooks/use-procurement-queries';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'inventory', labelKey: 'tabs.inventory' },
  { value: 'reorders', labelKey: 'tabs.reorders' },
  { value: 'orders', labelKey: 'tabs.orders' },
  { value: 'receipt', labelKey: 'tabs.receipt' },
  { value: 'movements', labelKey: 'tabs.movements' },
];

export function SparePartProcurementDashboard() {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const [activeTab, setActiveTab] = useState('inventory');
  const [prefillPart, setPrefillPart] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const { data: lowStockResult } = useLowStock({ limit: 1 });
  const reorderCount = lowStockResult?.pagination?.total ?? lowStockResult?.data?.length ?? 0;

  const handleCreateOrderForPart = (part) => {
    setPrefillPart(part);
    setActiveTab('orders');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'orders') setPrefillPart(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tx('dashboard.title')}
        description={tx('dashboard.description')}
        icon={Package}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setScannerOpen(true)}
        >
          <Upload className="h-4 w-4" />
          {tx('actions.scanDeliveryNote')}
        </Button>
      </PageHeader>

      <ProcurementKpiCards onTabChange={handleTabChange} />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-9 gap-0.5 bg-muted/40 p-0.5 rounded-lg">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-8 rounded-md px-3 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {tx(tab.labelKey)}
              {tab.value === 'reorders' && reorderCount > 0 && (
                <span className={cn(
                  'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  activeTab === 'reorders'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
                )}>
                  {reorderCount > 99 ? '99+' : reorderCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4">
          <TabsContent value="inventory" className="mt-0">
            <InventoryTab onCreateOrder={handleCreateOrderForPart} />
          </TabsContent>

          <TabsContent value="reorders" className="mt-0">
            <ReorderTab onCreateOrder={handleCreateOrderForPart} />
          </TabsContent>

          <TabsContent value="orders" className="mt-0">
            <PurchaseOrdersTab
              prefillPart={prefillPart}
              onPrefillClear={() => setPrefillPart(null)}
            />
          </TabsContent>

          <TabsContent value="receipt" className="mt-0">
            <GoodsReceiptTab />
          </TabsContent>

          <TabsContent value="movements" className="mt-0">
            <MovementHistoryTab />
          </TabsContent>
        </div>
      </Tabs>

      <DeliveryNoteScanner open={scannerOpen} onOpenChange={setScannerOpen} />
    </div>
  );
}
