import { jest, describe, expect, test } from '@jest/globals';

async function loadEntityService({ entities = new Map(), duplicate = null } = {}) {
  jest.resetModules();

  const store = new Map(entities);
  const repository = {
    findAll: jest.fn(async () => Array.from(store.values())),
    findById: jest.fn(async (id) => store.get(String(id)) || null),
    findByCode: jest.fn(async (code) => duplicate || Array.from(store.values()).find((entity) => entity.entityCode === code) || null),
    create: jest.fn(async (data) => {
      const entity = { _id: 'entity-new', ...data };
      store.set(entity._id, entity);
      return entity;
    }),
    updateById: jest.fn(async (id, data) => {
      const entity = { ...(store.get(String(id)) || { _id: id }), ...data };
      store.set(String(id), entity);
      return entity;
    }),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/accountingEntity.repository.js', () => ({
    default: repository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/accountingEntity.service.js')).default;
  return { service, repository, auditService };
}

describe('accounting entity service', () => {
  test('creates normalized company entities without a parent', async () => {
    const { service, repository } = await loadEntityService();

    const entity = await service.create({
      entityCode: ' mb-ch ',
      name: 'MB Switzerland',
      type: 'COMPANY',
      parentId: 'ignored-parent',
      baseCurrency: 'CHF',
    }, 'user-1');

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      entityCode: 'MB-CH',
      type: 'COMPANY',
      parentId: null,
      createdBy: 'user-1',
    }));
    expect(entity).toEqual(expect.objectContaining({ _id: 'entity-new' }));
  });

  test('requires branch entities to point at an existing company', async () => {
    const { service } = await loadEntityService();

    await expect(service.create({
      entityCode: 'ZH',
      name: 'Zurich Branch',
      type: 'BRANCH',
      parentId: 'missing-company',
    }, 'user-1')).rejects.toMatchObject({ code: 'ACCT_ENTITY_INVALID', statusCode: 400 });
  });

  test('creates branch entities under company parents', async () => {
    const company = { _id: 'company-1', entityCode: 'MB-CH', name: 'MB Switzerland', type: 'COMPANY' };
    const { service, repository } = await loadEntityService({
      entities: new Map([[company._id, company]]),
    });

    await service.create({
      entityCode: 'ZH',
      name: 'Zurich Branch',
      type: 'BRANCH',
      parentId: company._id,
      baseCurrency: 'CHF',
    }, 'user-1');

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      entityCode: 'ZH',
      type: 'BRANCH',
      parentId: 'company-1',
    }));
  });

  test('rejects duplicate entity codes before writing', async () => {
    const { service, repository } = await loadEntityService({
      duplicate: { _id: 'existing-entity', entityCode: 'MB-CH' },
    });

    await expect(service.create({
      entityCode: 'MB-CH',
      name: 'Duplicate',
      type: 'COMPANY',
    }, 'user-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
