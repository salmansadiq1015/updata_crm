// Deep links: `updata://leads/<id>`, `updata://reset-password?token=…`, the tabs
// and `updata://call-agent/settings`. A link to a route the current session does
// not have (e.g. a lead while signed out) is ignored by React Navigation instead
// of exposing the screen.
import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './navigationTypes';

export const linking: LinkingOptions<RootStackParamList> = {
  // The `scheme` in app.config.ts. Dev, staging and production builds share it;
  // Android lets the user pick when several are installed.
  prefixes: ['updata://'],
  config: {
    screens: {
      Login: 'login',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      Main: {
        screens: {
          Dashboard: 'dashboard',
          Leads: 'leads',
          CallAgent: 'call-agent',
          Notifications: 'notifications',
          Settings: 'settings',
        },
      },
      LeadDetail: 'leads/:leadId',
      AiCallHistory: 'leads/:leadId/ai-calls',
      AiCallDetail: 'ai-calls/:callId',
      CallAgentSettings: 'call-agent/settings',
    },
  },
};
