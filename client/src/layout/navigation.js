import {
  Activity,
  AlertTriangle,
  LifeBuoy,
  Bell,
  BellRing,
  BookOpen,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock4,
  Contact,
  Eraser,
  FileCheck,
  FileText,
  Files,
  FolderKanban,
  Grid3X3,
  Hash,
  LayoutDashboard,
  LayoutTemplate,
  MapPinned,
  MessageSquare,
  MonitorSmartphone,
  Percent,
  PlugZap,
  Radar,
  Receipt,
  RefreshCw,
  Ruler,
  ScrollText,
  PhoneCall,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Truck,
  Type,
  UserPlus,
  Users,
  Video,
  Webhook,
  Wrench,
  Zap,
} from 'lucide-react';
import { PERMISSIONS } from '@/shared/constants/permissions';

// Nav model. A section item is either a leaf (link) or a group (parent w/ children).
const originalNavSectionDefs = [
  // Navigation follows the business process: the cross-cutting tools first,
  // then a chantier from customer enquiry to closing. Client feedback: new
  // staff should find their way by following the work, not the module names.
  {
    titleKey: 'sidebar.mainMenu',
    items: [
      { type: 'leaf', labelKey: 'sidebar.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsChat', href: '/field-ops/chat', icon: MessageSquare, permission: 'mobile:read' },
      { type: 'leaf', labelKey: 'deploy.tabs.calendar', href: '/scheduling/calendar', icon: CalendarDays, permission: 'scheduling:read' },
      { type: 'leaf', labelKey: 'sidebar.tasks', href: '/tasks', icon: CheckSquare, permission: 'tasks:read' },
      { type: 'leaf', labelKey: 'sidebar.notifications', href: '/notifications', icon: Bell, permission: 'notifications:feed' },
      { type: 'leaf', labelKey: 'sidebar.ai', href: '/ai', icon: Sparkles, permission: 'ai:sessions' },
      { type: 'leaf', labelKey: 'sidebar.employmentManagement', href: '/settings/users', icon: Users, permission: 'users:read' },
    ],
  },
  {
    titleKey: 'sidebar.business',
    items: [
      // Object first, then customer: the client anchors a job on the building.
      { type: 'leaf', labelKey: 'sidebar.sites', href: '/crm/sites', icon: MapPinned, permission: 'crm:read' },
      { type: 'leaf', labelKey: 'sidebar.customers', href: '/crm/customers', icon: Contact, permission: 'crm:read' },
      { type: 'leaf', labelKey: 'sidebar.addressBook', href: '/crm/address-book', icon: BookOpen, permission: 'crm:read' },
      { type: 'leaf', labelKey: 'sidebar.leadGeneration', href: '/lead-generation', icon: Radar, permission: 'discovery:read' },
      { type: 'leaf', labelKey: 'sidebar.leads', href: '/leads', icon: UserPlus, permission: 'lead:read' },
      { type: 'leaf', labelKey: 'sidebar.leadFollowUps', href: '/leads/follow-ups', icon: CalendarClock, permission: 'lead:read' },
      { type: 'leaf', labelKey: 'sidebar.aiCalling', href: '/ai-calling', icon: PhoneCall, permission: 'ai-calling:read' },
      { type: 'leaf', labelKey: 'sidebar.simCalls', href: '/sim-calls', icon: Smartphone, permission: 'ai-calling:read' },
      { type: 'leaf', labelKey: 'governance.nav.campaignPerformance', href: '/campaign-performance', icon: TrendingUp, permission: 'analytics:attribution:read' },
      { type: 'leaf', labelKey: 'sidebar.smsOps', href: '/sms-ops', icon: LifeBuoy, permission: 'ai-calling:read' },
      { type: 'leaf', labelKey: 'sidebar.quotes', href: '/quotes', icon: FileText, permission: 'quotations:read' },
      { type: 'leaf', labelKey: 'sidebar.projects', href: '/projects', icon: FolderKanban, permission: 'projects:read' },
      { type: 'leaf', labelKey: 'sidebar.procurement', href: '/crm/spare-parts/procurement', icon: ShoppingCart, permission: 'crm:read' },
      {
        type: 'group', key: 'scheduling', labelKey: 'sidebar.scheduling', icon: CalendarClock,
        basePath: '/scheduling', permission: 'scheduling:read',
        children: [
          { type: 'leaf', labelKey: 'deploy.tabs.meetings', href: '/scheduling/meetings', icon: Video, permission: PERMISSIONS.MEETINGS_READ },
          { type: 'leaf', labelKey: 'deploy.tabs.dashboard', href: '/scheduling/dashboard', icon: LayoutDashboard, permission: 'scheduling:read' },
          { type: 'leaf', labelKey: 'deploy.tabs.coarse', href: '/scheduling/coarse', icon: Grid3X3, permission: 'scheduling:read' },
          { type: 'leaf', labelKey: 'deploy.tabs.conflicts', href: '/scheduling/conflicts', icon: AlertTriangle, permission: 'scheduling:read' },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsOrders', href: '/field-ops/orders', icon: ClipboardList, permission: 'mobile:read' },
      {
        // Service was split across two sections: maintenance sat under CRM,
        // the reports under field ops.
        type: 'group', key: 'service', labelKey: 'sidebar.serviceReports', icon: Wrench,
        basePath: '/crm/asset-maintenance', permission: 'crm:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.assetMaintenance', href: '/crm/asset-maintenance', icon: Wrench, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.fieldOpsReports', href: '/field-ops/reports', icon: FileCheck, permission: 'mobile:read' },
          { type: 'leaf', labelKey: 'sidebar.fieldOpsTime', href: '/field-ops/time', icon: Clock4, permission: PERMISSIONS.TIME_TRACKING_READ },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.accounting', href: '/accounting', icon: Receipt, permission: 'accounting:read' },
      { type: 'leaf', labelKey: 'sidebar.documents', href: '/documents', icon: Files, permission: PERMISSIONS.DOCUMENTS_READ },
      { type: 'leaf', labelKey: 'sidebar.vehicles', href: '/vehicles', icon: Truck, permission: 'vehicles:read' },
      { type: 'leaf', labelKey: 'sidebar.newsletters', href: '/crm/newsletters', icon: MessageSquare, permission: 'crm:read' },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    items: [
      {
        type: 'group', key: 'catalog', labelKey: 'sidebar.catalog', icon: Boxes,
        basePath: '/catalog', permission: PERMISSIONS.CATALOG_READ,
        children: [
          { type: 'leaf', labelKey: 'sidebar.catalog', href: '/catalog', icon: Boxes, permission: PERMISSIONS.CATALOG_READ },
          { type: 'leaf', labelKey: 'catalog.textBlocks.title', href: '/catalog/text-blocks', icon: Type, permission: PERMISSIONS.CATALOG_WRITE },
          { type: 'leaf', labelKey: 'catalog.prices.title', href: '/catalog/prices', icon: TrendingUp, permission: PERMISSIONS.CATALOG_PRICE },
          { type: 'leaf', labelKey: 'catalog.connections.title', href: '/catalog/connections', icon: PlugZap, permission: PERMISSIONS.CATALOG_ADMIN },
          { type: 'leaf', labelKey: 'catalog.markups.title', href: '/catalog/markups', icon: Percent, permission: PERMISSIONS.CATALOG_PRICE },
          { type: 'leaf', labelKey: 'catalog.units.title', href: '/catalog/settings/units', icon: Ruler, permission: PERMISSIONS.CATALOG_ADMIN },
          { type: 'leaf', labelKey: 'catalog.igh.title', href: '/catalog/igh', icon: RefreshCw, permission: PERMISSIONS.CATALOG_ADMIN },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.users', href: '/settings/users', icon: Users, permission: 'users:read' },
      { type: 'leaf', labelKey: 'sidebar.roles', href: '/settings/roles', icon: ShieldCheck, permission: 'roles:read' },
      { type: 'leaf', labelKey: 'sidebar.audit', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
      { type: 'leaf', labelKey: 'governance.nav.teams', href: '/settings/teams', icon: Users, permission: 'team:read' },
      { type: 'leaf', labelKey: 'governance.nav.accessLog', href: '/settings/access-log', icon: ShieldCheck, permission: 'audit:read' },
      { type: 'leaf', labelKey: 'sidebar.departments', href: '/admin/departments', icon: Building2, permission: 'quotations:admin' },
      { type: 'leaf', labelKey: 'sidebar.numbering', href: '/admin/numbering', icon: Hash, permission: 'quotations:admin' },
      { type: 'leaf', labelKey: 'sidebar.reminders', href: '/admin/reminders', icon: BellRing, permission: 'quotations:admin' },
      { type: 'leaf', labelKey: 'sidebar.notificationOperations', href: '/admin/notifications', icon: BellRing, permission: PERMISSIONS.NOTIFICATIONS_METRICS_READ },
      {
        type: 'group', key: 'ai-admin', labelKey: 'sidebar.aiAdmin', icon: Sparkles,
        basePath: '/admin/ai', permission: 'ai:analytics:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.aiMain', href: '/ai', icon: MessageSquare, permission: 'ai:sessions' },
          { type: 'leaf', labelKey: 'sidebar.aiOverview', href: '/admin/ai', icon: Sparkles, permission: 'ai:analytics:read' },
          { type: 'leaf', labelKey: 'sidebar.aiAnalytics', href: '/admin/ai/analytics', icon: Activity, permission: 'ai:analytics:read' },
          { type: 'leaf', labelKey: 'sidebar.aiVocabulary', href: '/admin/ai/vocabulary', icon: BookOpen, permission: 'ai:vocabulary:manage' },
          { type: 'leaf', labelKey: 'sidebar.aiCommands', href: '/admin/ai/commands', icon: MonitorSmartphone, permission: 'ai:commands:manage' },
          { type: 'leaf', labelKey: 'sidebar.aiAgents', href: '/admin/ai/agents', icon: ShieldCheck, permission: 'ai:agents:manage' },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.templates', href: '/admin/templates', icon: LayoutTemplate, permission: 'templates:read' },
      { type: 'leaf', labelKey: 'sidebar.cleanup', href: '/admin/cleanup', icon: Eraser, permission: 'crm:admin' },
      { type: 'leaf', labelKey: 'sidebar.migration', href: '/admin/migration', icon: RefreshCw, permission: PERMISSIONS.SETTINGS_ADMIN },
      { type: 'leaf', labelKey: 'sidebar.integrations', href: '/admin/integrations', icon: Zap, permission: 'integrations:admin' },
      { type: 'leaf', labelKey: 'sidebar.widget', href: '/admin/integrations/widget/submissions', icon: Webhook, permission: 'integrations:widget:manage' },
      { type: 'leaf', labelKey: 'sidebar.mobileApp', href: '/admin/apk', icon: Smartphone, permission: PERMISSIONS.SETTINGS_READ },
      { type: 'leaf', labelKey: 'sidebar.settings', href: '/admin/settings', icon: Settings, permission: PERMISSIONS.SETTINGS_READ },
    ],
  },
];

// Group the existing navigation model without changing permission or role UI contracts.
const growthRoutes = new Set(['/leads', '/lead-generation', '/leads/follow-ups']);
const communicationRoutes = new Set(['/ai-calling', '/sim-calls', '/sms-ops']);
const insightRoutes = new Set(['/campaign-performance']);
const originalBusinessItems = originalNavSectionDefs[1].items;
export const navSectionDefs = [
  originalNavSectionDefs[0],
  { titleKey: 'experience.nav.growth', items: originalBusinessItems.filter(item => growthRoutes.has(item.href)) },
  { titleKey: 'experience.nav.communication', items: originalBusinessItems.filter(item => communicationRoutes.has(item.href)) },
  { titleKey: 'experience.nav.insights', items: originalBusinessItems.filter(item => insightRoutes.has(item.href)) },
  { ...originalNavSectionDefs[1], items: originalBusinessItems.filter(item => !growthRoutes.has(item.href) && !communicationRoutes.has(item.href) && !insightRoutes.has(item.href)) },
  ...originalNavSectionDefs.slice(2),
];

// A dedicated child page owns its route; detail routes still belong to the
// closest menu entry (e.g. /leads/123 belongs to Leads, not Follow-ups).
const leafHrefs = [...new Set(navSectionDefs.flatMap((section) =>
  section.items.flatMap((item) => (item.children || [item]).map((leaf) => leaf.href)),
))].sort((a, b) => b.length - a.length);

export function isNavigationLeafActive(href, pathname) {
  const activeHref = leafHrefs.find((route) => pathname === route || pathname.startsWith(`${route}/`));
  return activeHref === href;
}
