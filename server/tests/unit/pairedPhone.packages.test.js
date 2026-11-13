import { beforeEach, expect, it, jest } from '@jest/globals';

const access = jest.fn();
jest.unstable_mockModule('node:fs/promises', () => ({ access }));
const { downloadFirmware, firmwarePackage } = await import('../../src/modules/pairedPhone/gatewayPackage.js');
beforeEach(() => jest.clearAllMocks());

it('serves the fixed compiled firmware artifact and forwards stream errors', async () => {
  access.mockResolvedValue();
  const res = { download: jest.fn() }, next = jest.fn();
  await downloadFirmware({}, res, next);
  expect(access).toHaveBeenCalledWith(firmwarePackage);
  expect(res.download).toHaveBeenCalledWith(firmwarePackage, 'updata-esp32-firmware.tgz', expect.any(Function));
  const error = new Error('download interrupted');
  res.download.mock.calls[0][2](error);
  expect(next).toHaveBeenCalledWith(error);
});

it('returns an actionable 503 if the compiled firmware is missing', async () => {
  access.mockRejectedValue(new Error('ENOENT'));
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), download: jest.fn() };
  await downloadFirmware({}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'FIRMWARE_PACKAGE_UNAVAILABLE', message: expect.stringContaining('Repository access is not needed') }) }));
  expect(res.download).not.toHaveBeenCalled();
});
