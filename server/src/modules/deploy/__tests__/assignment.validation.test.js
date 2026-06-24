import { describe, expect, it } from '@jest/globals';
import { createAssignmentSchema } from '../assignment.validation.js';

const employeeId = '665f1d5f0f1d5f0f1d5f0001';

function createPayload(overrides = {}) {
  return {
    employeeIds: [employeeId],
    orderId: null,
    projectId: null,
    assignmentType: 'SERVICE_CALL',
    title: null,
    startDatetime: '2026-07-01T08:00:00.000Z',
    endDatetime: '2026-07-01T09:00:00.000Z',
    isFullDay: false,
    priority: 'NORMAL',
    instructions: null,
    requiredSkills: [],
    recommendedSkills: [],
    requiredCertifications: [],
    recommendedCertifications: [],
    customerId: null,
    siteId: null,
    colorCode: null,
    isCustomerAppointment: false,
    appointment: null,
    recurrence: null,
    ...overrides,
  };
}

describe('assignment create validation', () => {
  it('accepts the create form payload when optional sections are disabled', () => {
    const { error, value } = createAssignmentSchema.body.validate(createPayload(), {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    expect(error).toBeUndefined();
    expect(value.title).toBeNull();
    expect(value.instructions).toBeNull();
    expect(value.appointment).toBeNull();
    expect(value.recurrence).toBeNull();
  });

  it('still requires appointment details when customer appointment is enabled', () => {
    const { error } = createAssignmentSchema.body.validate(createPayload({
      isCustomerAppointment: true,
      appointment: null,
    }), { abortEarly: false });

    expect(error?.details.map((detail) => detail.path.join('.'))).toContain('appointment');
  });
});
