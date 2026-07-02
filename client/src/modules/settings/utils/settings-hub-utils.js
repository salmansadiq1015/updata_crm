import {
  SETTINGS_HEALTH_META,
  SETTINGS_HUB_DEFAULT_CATEGORY,
} from '../constants/settings-hub';

const EMPTY_ITEMS = [];
const EMPTY_CATEGORIES = [];

export function canAccessSettingsItem(item, hasPermission) {
  if (!item?.permission) return true;
  return Boolean(hasPermission?.(item.permission));
}

export function getVisibleSettingsItems(items, hasPermission) {
  return (items || EMPTY_ITEMS).filter((item) => canAccessSettingsItem(item, hasPermission));
}

export function getVisibleSettingsCategories(categories, visibleItems) {
  const visibleCategoryIds = new Set((visibleItems || EMPTY_ITEMS).map((item) => item.category));
  return (categories || EMPTY_CATEGORIES).filter((category) => (
    category.id === SETTINGS_HUB_DEFAULT_CATEGORY || visibleCategoryIds.has(category.id)
  ));
}

export function filterSettingsHubItems(items, { category, search, translate }) {
  const query = String(search || '').trim().toLowerCase();
  const activeCategory = category || SETTINGS_HUB_DEFAULT_CATEGORY;

  return (items || EMPTY_ITEMS).filter((item) => {
    const categoryMatches = activeCategory === SETTINGS_HUB_DEFAULT_CATEGORY || item.category === activeCategory;
    if (!categoryMatches) return false;
    if (!query) return true;

    const haystack = [
      item.id,
      item.href,
      item.permission,
      translate?.(item.titleKey) || '',
      translate?.(item.descriptionKey) || '',
      translate?.(item.badgeKey) || '',
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

export function getSettingsHealthMeta(status) {
  return SETTINGS_HEALTH_META[status] || SETTINGS_HEALTH_META.unknown;
}

export function buildSettingsHubStats(visibleItems, visibleCategories, healthStatus) {
  const categoryCount = Math.max((visibleCategories || EMPTY_CATEGORIES).length - 1, 0);
  const protectedCount = (visibleItems || EMPTY_ITEMS).filter((item) => Boolean(item.permission)).length;
  const healthMeta = getSettingsHealthMeta(healthStatus);

  return {
    available: (visibleItems || EMPTY_ITEMS).length,
    categories: categoryCount,
    protected: protectedCount,
    healthStatus: healthStatus || 'unknown',
    healthLabelKey: healthMeta.labelKey,
    healthProgress: healthMeta.progress,
  };
}

export function groupSettingsItemsByCategory(items) {
  return (items || EMPTY_ITEMS).reduce((groups, item) => {
    const current = groups[item.category] || [];
    return { ...groups, [item.category]: [...current, item] };
  }, {});
}
