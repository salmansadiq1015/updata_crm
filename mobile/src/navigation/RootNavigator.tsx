import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen';
import { SessionErrorScreen } from '@/features/auth/screens/SessionErrorScreen';
import { SessionLoadingScreen } from '@/features/auth/screens/SessionLoadingScreen';
import { AiAgentCampaignDetailScreen } from '@/features/aiAgent/screens/AiAgentCampaignDetailScreen';
import { SimSmsCampaignDetailScreen } from '@/features/smsAgent/screens/SimSmsCampaignDetailScreen';
import { SimSmsCampaignsScreen } from '@/features/smsAgent/screens/SimSmsCampaignsScreen';
import { CallAudioCheckScreen } from '@/features/communication/screens/CallAudioCheckScreen';
import { CallCampaignCreateScreen } from '@/features/callCampaign/screens/CallCampaignCreateScreen';
import { CallCampaignDetailScreen } from '@/features/callCampaign/screens/CallCampaignDetailScreen';
import { CallCampaignRunScreen } from '@/features/callCampaign/screens/CallCampaignRunScreen';
import { CallCampaignsScreen } from '@/features/callCampaign/screens/CallCampaignsScreen';
import { SimSmsConversationScreen } from '@/features/smsAgent/screens/SimSmsConversationScreen';
import { SimSmsLaunchScreen } from '@/features/smsAgent/screens/SimSmsLaunchScreen';
import { AiAgentCampaignsScreen } from '@/features/aiAgent/screens/AiAgentCampaignsScreen';
import { AiAgentLaunchScreen } from '@/features/aiAgent/screens/AiAgentLaunchScreen';
import { AiCallDetailScreen } from '@/features/aiAgent/screens/AiCallDetailScreen';
import { AiCallHistoryScreen } from '@/features/aiAgent/screens/AiCallHistoryScreen';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { CallAgentLeadPickerScreen } from '@/features/callAgent/screens/CallAgentLeadPickerScreen';
import { CallAgentSettingsScreen } from '@/features/callAgent/screens/CallAgentSettingsScreen';
import { CallAgentTestScreen } from '@/features/callAgent/screens/CallAgentTestScreen';
import { CallQueueScreen } from '@/features/callQueue/screens/CallQueueScreen';
import { CallSessionScreen } from '@/features/communication/screens/CallSessionScreen';
import { CommunicationQueueScreen } from '@/features/communication/screens/CommunicationQueueScreen';
import { SmsComposeScreen } from '@/features/communication/screens/SmsComposeScreen';
import { FollowUpsScreen } from '@/features/followUps/screens/FollowUpsScreen';
import { LeadDetailScreen } from '@/features/leads/screens/LeadDetailScreen';
import { LeadFormScreen } from '@/features/leads/screens/LeadFormScreen';
import { useTheme } from '@/theme/ThemeProvider';

import { linking } from './linking';
import { MainNavigator } from './MainNavigator';
import { navigationTheme } from './navigationTheme';
import type { RootStackParamList } from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const status = useSessionStore((state) => state.status);
  const theme = useMemo(() => navigationTheme(scheme, colors), [scheme, colors]);

  if (status === 'restoring') return <SessionLoadingScreen />;

  return (
    <NavigationContainer theme={theme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          headerTitleStyle: { fontFamily: 'Geist-SemiBold' },
          headerShadowVisible: false,
          animation: 'slide_from_right',
        }}
      >
        {status === 'authenticated' ? (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainNavigator} />
            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
              options={{ headerShown: true, title: t('leads.details'), headerBackTitle: t('common.back') }}
            />
            <Stack.Screen
              name="LeadForm"
              component={LeadFormScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params?.leadId ? t('leadForm.editTitle') : t('leadForm.createTitle'),
                headerBackTitle: t('common.back'),
              })}
            />
            <Stack.Screen
              name="FollowUps"
              component={FollowUpsScreen}
              options={{ headerShown: true, title: t('followUps.title'), headerBackTitle: t('common.back') }}
            />
            <Stack.Screen
              name="CallSession"
              component={CallSessionScreen}
              options={{
                headerShown: true,
                title: t('communication.callTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="SmsCompose"
              component={SmsComposeScreen}
              options={{
                headerShown: true,
                title: t('communication.smsTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CommunicationQueue"
              component={CommunicationQueueScreen}
              options={{
                headerShown: true,
                title: t('communication.queue.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="AiAgentLaunch"
              component={AiAgentLaunchScreen}
              options={{
                headerShown: true,
                title: t('aiAgent.launchTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="AiAgentCampaigns"
              component={AiAgentCampaignsScreen}
              options={{
                headerShown: true,
                title: t('aiAgent.campaignsTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="AiAgentCampaignDetail"
              component={AiAgentCampaignDetailScreen}
              options={{
                headerShown: true,
                title: t('aiAgent.detailTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="SimSmsLaunch"
              component={SimSmsLaunchScreen}
              options={{ headerShown: true, title: t('smsAgent.title'), headerBackTitle: t('common.back') }}
            />
            <Stack.Screen
              name="CallCampaigns"
              component={CallCampaignsScreen}
              options={{
                headerShown: true,
                title: t('callCampaign.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallCampaignCreate"
              component={CallCampaignCreateScreen}
              options={{
                headerShown: true,
                title: t('callCampaign.create.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallCampaignDetail"
              component={CallCampaignDetailScreen}
              options={{
                headerShown: true,
                title: t('callCampaign.detail.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallCampaignRun"
              component={CallCampaignRunScreen}
              options={{
                headerShown: true,
                title: t('callCampaign.run.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallAudioCheck"
              component={CallAudioCheckScreen}
              options={{
                headerShown: true,
                title: t('communication.callCheck.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="SimSmsCampaigns"
              component={SimSmsCampaignsScreen}
              options={{
                headerShown: true,
                title: t('smsAgent.campaignsTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="SimSmsCampaignDetail"
              component={SimSmsCampaignDetailScreen}
              options={{ headerShown: true, title: t('smsAgent.title'), headerBackTitle: t('common.back') }}
            />
            <Stack.Screen
              name="SimSmsConversation"
              component={SimSmsConversationScreen}
              options={{
                headerShown: true,
                title: t('smsAgent.conversation.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="AiCallHistory"
              component={AiCallHistoryScreen}
              options={{
                headerShown: true,
                title: t('aiAgent.callHistory.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="AiCallDetail"
              component={AiCallDetailScreen}
              options={{
                headerShown: true,
                title: t('aiAgent.callHistory.detailTitle'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallAgentSettings"
              component={CallAgentSettingsScreen}
              options={{
                headerShown: true,
                title: t('callAgent.settings.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallAgentLeadPicker"
              component={CallAgentLeadPickerScreen}
              options={{
                headerShown: true,
                title: t('callAgent.picker.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallAgentTest"
              component={CallAgentTestScreen}
              options={{
                headerShown: true,
                title: t('callAgent.test.title'),
                headerBackTitle: t('common.back'),
              }}
            />
            <Stack.Screen
              name="CallQueue"
              component={CallQueueScreen}
              options={{
                headerShown: true,
                title: t('callQueue.title'),
                headerBackTitle: t('common.back'),
              }}
            />
          </Stack.Group>
        ) : status === 'restore_failed' ? (
          <Stack.Screen name="SessionError" component={SessionErrorScreen} />
        ) : (
          // `navigationKey` remounts the stack on sign-out so no private screen
          // stays in history; the pop animation shows the user where they are.
          <Stack.Group navigationKey="signed-out" screenOptions={{ animationTypeForReplace: 'pop' }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
