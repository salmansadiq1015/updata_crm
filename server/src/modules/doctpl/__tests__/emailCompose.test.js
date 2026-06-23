import {
  afterEach, beforeAll, describe, expect, jest, test,
} from '@jest/globals';

const mockTemplateFindOne = jest.fn();
const mockCustomerFindById = jest.fn();

jest.unstable_mockModule('../documentTemplate.model.js', () => ({
  default: { findOne: mockTemplateFindOne },
}));

jest.unstable_mockModule('../../crm/customer.model.js', () => ({
  default: { findById: mockCustomerFindById },
}));

let emailService;

function templateQuery(result) {
  return { lean: jest.fn(async () => result) };
}
function customerQuery(result) {
  return { select: jest.fn(() => ({ lean: jest.fn(async () => result) })) };
}

beforeAll(async () => {
  emailService = (await import('../email.service.js')).default;
});

afterEach(() => jest.clearAllMocks());

describe('emailService.compose CRM recipient prefill (DOC-008)', () => {
  test('resolves the recipient from CRM when only a customerId is provided', async () => {
    mockTemplateFindOne.mockReturnValue(templateQuery(null));
    mockCustomerFindById.mockReturnValue(customerQuery({ email: 'kunde@example.com' }));

    const result = await emailService.compose({
      templateType: 'quotation',
      language: 'de',
      data: { documentNumber: 'OFF-1', customerId: '507f1f77bcf86cd799439011' },
    });

    expect(mockCustomerFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(result.to).toEqual(['kunde@example.com']);
  });

  test('prefers an explicitly supplied customerEmail without querying CRM', async () => {
    mockTemplateFindOne.mockReturnValue(templateQuery(null));

    const result = await emailService.compose({
      templateType: 'quotation',
      language: 'de',
      data: { documentNumber: 'OFF-1', customerEmail: 'explicit@example.com', customerId: '507f1f77bcf86cd799439011' },
    });

    expect(mockCustomerFindById).not.toHaveBeenCalled();
    expect(result.to).toEqual(['explicit@example.com']);
  });

  test('returns an empty recipient list when neither email nor customer is available', async () => {
    mockTemplateFindOne.mockReturnValue(templateQuery(null));

    const result = await emailService.compose({
      templateType: 'quotation',
      language: 'de',
      data: { documentNumber: 'OFF-1' },
    });

    expect(result.to).toEqual([]);
  });
});
