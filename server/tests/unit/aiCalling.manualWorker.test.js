import { describe, expect, it, jest } from '@jest/globals';
import { manualCampaignProcessor } from '../../scripts/lib/manual-campaign-processor.mjs';

describe('local manually started campaign worker', () => {
  it('skips old jobs and only handles jobs queued after this local run began', async () => {
    const process = jest.fn(async () => ({ dispatched: 1 }));
    const handle = manualCampaignProcessor(process, 1000);
    expect(await handle({ timestamp: 999, data: { kind: 'tick' } })).toMatchObject({ skipped: true });
    expect(await handle({ data: { kind: 'tick' } })).toMatchObject({ skipped: true });
    expect(process).not.toHaveBeenCalled();
    const job = { timestamp: 1001, data: { kind: 'tick' } };
    expect(await handle(job)).toEqual({ dispatched: 1 });
    expect(process).toHaveBeenCalledWith(job);
  });
});
