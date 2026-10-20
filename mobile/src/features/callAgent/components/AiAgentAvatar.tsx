import { Image, type ImageStyle, type StyleProp } from 'react-native';

type Props = {
  size: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
};

/**
 * The canonical Updata AI Agent identity. Keeping the asset reference here prevents
 * the home hero and navigation from quietly drifting to different artwork again.
 */
export function AiAgentAvatar({ size, accessibilityLabel, testID, style }: Props) {
  const announced = Boolean(accessibilityLabel);

  return (
    <Image
      source={require('../../../../assets/ai-agent-orb.png')}
      resizeMode="contain"
      accessible={announced}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!announced}
      importantForAccessibility={announced ? 'yes' : 'no-hide-descendants'}
      accessibilityIgnoresInvertColors
      testID={testID}
      style={[{ width: size, height: size }, style]}
    />
  );
}
