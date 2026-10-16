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
import { AiAgentCampaignsScreen } from '@/features/aiAgent/screens/AiAgentCampaignsScreen';
import { AiAgentLaunchScreen } from '@/features/aiAgent/screens/AiAgentLaunchScreen';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { CallAgentLeadPickerScreen } from '@/features/callAgent/screens/CallAgentLeadPickerScreen';
import { CallAgentSettingsScreen } from '@/features/callAgent/screens/CallAgentSettingsScreen';
import { CallAgentTestScreen } from '@/features/callAgent/screens/CallAgentTestScreen';
import { CallSessionScreen } from '@/features/communication/screens/CallSessionScreen';
import { CommunicationQueueScreen } from '@/features/communication/screens/CommunicationQueueScreen';
import { SmsComposeScreen } from '@/features/communication/screens/SmsComposeScreen';
import { LeadDetailScreen } from '@/features/leads/screens/LeadDetailScreen';
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
