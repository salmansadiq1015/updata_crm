export function defaultAccountingEntityForm() {
  return {
    entityCode: '',
    name: '',
    legalName: '',
    type: 'COMPANY',
    parentId: '',
    baseCurrency: 'CHF',
    taxIdentifier: '',
    fiscalYearStartMonth: 1,
  };
}

export function buildAccountingEntityPayload(form = {}) {
  const payload = {
    entityCode: String(form.entityCode || '').trim().toUpperCase(),
    name: String(form.name || '').trim(),
    legalName: String(form.legalName || '').trim(),
    type: form.type || 'COMPANY',
    baseCurrency: form.baseCurrency || 'CHF',
    taxIdentifier: String(form.taxIdentifier || '').trim(),
    fiscalYearStartMonth: Number(form.fiscalYearStartMonth || 1),
  };
  if (payload.type === 'BRANCH') payload.parentId = form.parentId || null;
  return payload;
}

export function isAccountingEntityFormValid(form = {}) {
  if (!String(form.entityCode || '').trim()) return false;
  if (!String(form.name || '').trim()) return false;
  if (form.type === 'BRANCH' && !form.parentId) return false;
  return true;
}

export function splitAccountingEntities(entities = []) {
  const companies = entities.filter((entity) => entity.type === 'COMPANY');
  const branches = entities.filter((entity) => entity.type === 'BRANCH');
  return { companies, branches };
}
