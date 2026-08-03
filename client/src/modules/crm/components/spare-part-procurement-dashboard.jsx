'use client';

import { useState } from 'react';
import { Package, Upload } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
export function SparePartProcurementDashboard() {
  const { t } = useLanguage();
  const tx = (key) => t(`crm.procurement.${key}`);
  const [activeTab, setActiveTab] = useState('inventory');
  const [prefillPart, setPrefillPart] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);

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

      <ProcurementKpiCards activeTab={activeTab} onTabChange={handleTabChange} />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="mt-0">
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
