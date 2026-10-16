import { ScrollView, Text, View } from 'react-native';

import { palettes } from '@/theme/colors';

const c = palettes.light;

/**
 * Shown instead of the app when the build's environment is invalid. Rendered
 * without providers or i18n (they may depend on the broken configuration).
 * Configuration problems are listed in development builds only.
 */
export function ConfigErrorScreen({ issues, showIssues }: { issues: string[]; showIssues: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center', padding: 24 }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '600', color: c.foreground }}>
        App configuration error
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: c.mutedForeground }}>
        This build is missing required configuration. Contact your administrator.
      </Text>
      {showIssues ? (
        <ScrollView style={{ marginTop: 16, maxHeight: 240 }}>
          {issues.map((issue) => (
            <Text key={issue} style={{ fontSize: 13, color: c.destructive, marginBottom: 4 }}>
              • {issue}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
