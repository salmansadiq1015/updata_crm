import { PermissionsAndroid, Platform } from 'react-native';

import { ensurePermission, requestPermission } from '../permissionsService';

const MIC = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

describe('permissionsService', () => {
  const check = jest.spyOn(PermissionsAndroid, 'check');
  const request = jest.spyOn(PermissionsAndroid, 'request');

  beforeEach(() => {
    check.mockReset();
    request.mockReset();
    Platform.OS = 'android';
  });

  it('does not show a dialog when already granted', async () => {
    check.mockResolvedValue(true);
    await expect(ensurePermission(MIC)).resolves.toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('requests with the rationale and maps every outcome', async () => {
    const rationale = { title: 'Microphone', message: 'Needed for calls', buttonPositive: 'OK' };
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    await expect(requestPermission(MIC, rationale)).resolves.toBe('granted');
    await expect(requestPermission(MIC, rationale)).resolves.toBe('denied');
    await expect(requestPermission(MIC, rationale)).resolves.toBe('blocked');
    expect(request).toHaveBeenCalledWith(MIC, rationale);
  });

  it('reports failures as unavailable instead of throwing', async () => {
    request.mockRejectedValue(new Error('no activity'));
    await expect(requestPermission(MIC)).resolves.toBe('unavailable');
  });
});
