'use client';

import { useMutation } from '@tanstack/react-query';
import { deviceService } from '../services/device-service';

export function useDeviceRegistration() {
  const register = useMutation({
    mutationFn: (data) => deviceService.registerDevice(data),
  });

  const deactivate = useMutation({
    mutationFn: (deviceId) => deviceService.deactivateDevice(deviceId),
  });

  return { register, deactivate };
}
