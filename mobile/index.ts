import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './src/app/App';
import { SMS_AGENT_TASK, smsAgentHeadlessTask } from './src/features/smsAgent/headlessTask';

// Registers the root component for both development and release builds.
registerRootComponent(App);
// Background loop of the AI SMS agent (started only by the private build's foreground service).
AppRegistry.registerHeadlessTask(SMS_AGENT_TASK, () => smsAgentHeadlessTask);
