import { describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import Meeting from '../meeting.model.js';

const userId = new mongoose.Types.ObjectId();

function meetingData(overrides = {}) {
  return {
    title: 'Planning Meeting',
    startAt: new Date('2026-07-01T10:00:00.000Z'),
    endAt: new Date('2026-07-01T11:00:00.000Z'),
    createdBy: userId,
    ...overrides,
  };
}

describe('Meeting model validation', () => {
  test('validates normal meeting timing without callback middleware errors', async () => {
    const meeting = new Meeting(meetingData());

    await expect(meeting.validate()).resolves.toBeUndefined();
  });

  test('rejects meetings that do not end after they start', async () => {
    const meeting = new Meeting(meetingData({
      endAt: new Date('2026-07-01T10:00:00.000Z'),
    }));

    await expect(meeting.validate()).rejects.toMatchObject({
      name: 'ValidationError',
      errors: {
        endAt: expect.objectContaining({
          message: 'Meeting end time must be after start time',
        }),
      },
    });
  });
});
