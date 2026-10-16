import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type MainTabParamList = {
  Dashboard: undefined;
  Leads: undefined;
  Notifications: undefined;
  Settings: undefined;
};

/**
 * One root stack whose screen set depends on the session (React Navigation's
 * auth-flow pattern): signed-out users simply have no private routes, so a
 * protected screen cannot be reached by navigation or by deep link.
 */
export type RootStackParamList = {
  // Signed out
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
  // Session could not be verified (offline at launch)
  SessionError: undefined;
  // Signed in
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  LeadDetail: { leadId: string };
  // Not deep-linkable: a contact attempt starts only from an explicit tap in the app.
  CallSession: { leadId: string; operationId?: string; destinationField?: 'phone' | 'mobile' };
  SmsCompose: { leadId: string; operationId?: string; destinationField?: 'phone' | 'mobile' };
  CommunicationQueue: undefined;
  // AI agent (not deep-linkable: a campaign starts only from an explicit selection in the app).
  AiAgentLaunch: { leadIds: string[] };
  AiAgentCampaigns: undefined;
  AiAgentCampaignDetail: { kind: 'call' | 'sms'; campaignId: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
    interface RootParamList extends RootStackParamList {}
  }
}
