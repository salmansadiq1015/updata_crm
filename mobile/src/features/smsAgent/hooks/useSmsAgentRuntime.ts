// Mounted once inside the signed-in navigator (private build only): starts the
// agent when a campaign is running, wakes the loop on native SMS events and on
// foreground, and stops it on sign-out.
import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getEnv } from '@/config/env';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { telephony } from '@/services/telephony/telephonyService';

import { smsAgentLoop } from '../domain/agentLoop';
import { ensureSmsAgentRunning, stopSmsAgent, syncWatchedNumbers } from '../services/agentControl';
import { sendDeviceHeartbeat } from '../services/heartbeatService';

export function useSmsAgentRuntime() {
  const userId = useSessionStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId || getEnv().distribution !== 'private') return;
    void syncWatchedNumbers().then(() => ensureSmsAgentRunning());
    void sendDeviceHeartbeat('foreground');

    const wake = () => {
      if (smsAgentLoop.getStatus().running) smsAgentLoop.kick();
      else void ensureSmsAgentRunning();
    };
    const received = telephony.addSmsReceivedListener(wake);
    const status = telephony.addSmsStatusListener(wake);
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void syncWatchedNumbers();
      void sendDeviceHeartbeat('foreground');
      wake();
    });
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) wake();
    });

    return () => {
      received?.remove();
      status?.remove();
      appState.remove();
      online();
      void stopSmsAgent();
    };
  }, [userId]);
}
