import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type MainTabParamList = {
  Dashboard: undefined;
  Leads: undefined;
  /** "Updata Call Agent": the highlighted centre tab. */
  CallAgent: undefined;
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
  // Create (no leadId) or edit a lead. Not deep-linkable.
  LeadForm: { leadId?: string } | undefined;
  FollowUps: undefined;
  // Not deep-linkable: a contact attempt starts only from an explicit tap in the app.
  // `queueId`: the call belongs to the SIM call queue (shows "Next lead" after the outcome).
  CallSession: {
    leadId: string;
    operationId?: string;
    destinationField?: 'phone' | 'mobile';
    queueId?: string;
  };
  // SIM call queue (not deep-linkable): the user calls chosen leads one by one.
  CallQueue: undefined;
  SmsCompose: { leadId: string; operationId?: string; destinationField?: 'phone' | 'mobile' };
  CommunicationQueue: undefined;
  // AI agent (not deep-linkable: a campaign starts only from an explicit selection in the app).
  AiAgentLaunch: { leadIds: string[]; initialChannel?: 'call' | 'sms' };
  AiAgentCampaigns: undefined;
  AiAgentCampaignDetail: { kind: 'call' | 'sms'; campaignId: string };
  AiCallHistory: { leadId: string };
  // AI SMS from this phone's SIM (private build only; not deep-linkable).
  SimSmsLaunch: { leadIds: string[] };
  SimSmsCampaigns: undefined;
  CallAudioCheck: undefined;
  CallCampaigns: undefined;
  MobileReadiness: undefined;
  SmsQueue: { leadIds: string[] };
  CallCampaignCreate: { leadIds: string[] };
  CallCampaignDetail: { campaignId: string };
  CallCampaignRun: { campaignId: string };
  SimSmsCampaignDetail: { campaignId: string };
  SimSmsConversation: { conversationId: string };
  AiCallDetail: { callId: string };
  // Call Agent tab. Settings are deep-linkable (they start nothing); the picker and
  // the test screen are reached only from an explicit tap.
  CallAgentSettings: undefined;
  CallAgentLeadPicker: { purpose: 'call' | 'sms' | 'test' | 'queue' | 'campaign' | 'simSms' | 'smsQueue' };
  CallAgentTest: { leadId?: string } | undefined;
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
