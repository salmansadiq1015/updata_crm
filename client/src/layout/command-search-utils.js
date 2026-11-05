export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[-/]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// Keep labels, route names and aliases searchable in every interface language.
export function rankSearchItems(items, query) {
  const term = normalizeSearch(query);
  if (!term) return items;
  return items.map((item, index) => {
    const label = normalizeSearch(item.label);
    const text = normalizeSearch([item.label, item.href, ...(item.keywords || [])].join(' '));
    const matches = term.split(' ').every(token => text.includes(token));
    const score = !matches ? 0 : label === term ? 4 : label.startsWith(term) ? 3 : label.includes(term) ? 2 : 1;
    return { item, score, index };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.item);
}

export function getSearchPages(sections, hasPermission, t) {
  const pages = new Map();
  for (const section of sections) {
    for (const parent of section.items) {
      // Match the sidebar: grouped leaves have their own permission contracts.
      for (const item of parent.children || [parent]) {
        if (!item.href || item.disabled || (item.permission && !hasPermission(item.permission))) continue;
        const existing = pages.get(item.href);
        const label = t(item.labelKey);
        const keywords = [label, item.labelKey.split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2'), parent.children ? t(parent.labelKey) : ''];
        if (existing) existing.keywords.push(...keywords);
        else pages.set(item.href, { ...item, label, section: t(section.titleKey), keywords });
      }
    }
  }
  return [...pages.values()];
}
