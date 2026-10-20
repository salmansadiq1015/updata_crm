import { Languages, Pencil, Sparkles, Volume2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';
import { brand } from '@/theme/colors';

import { AiAgentAvatar } from './AiAgentAvatar';

type Props = {
  name: string;
  /** Native name of the conversation language (or the code while the list loads). */
  languageLabel: string;
  voice: string;
  configured: boolean;
  onEdit: () => void;
};

/** Brand-gradient identity card for the AI agent: who calls, in which language, with which voice. */
export function AgentHero({ name, languageLabel, voice, configured, onEdit }: Props) {
  const { t } = useTranslation();
  const press = usePressScale();

  return (
    <GradientSurface className="gap-5 rounded-4xl p-5">
      <View className="flex-row items-center gap-4">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-white/25 bg-white/10">
          <AiAgentAvatar size={68} accessibilityLabel={t('callAgent.hero.avatarA11y', { name })} />
          <View className="absolute -bottom-1 -end-1">
            <IconContainer icon={Sparkles} tone="inverse" size="sm" round />
          </View>
        </View>
        <View className="flex-1 gap-0.5">
          <AppText variant="overline" className="text-white/70">
            {t('callAgent.title')}
          </AppText>
          <AppText variant="h2" className="text-white" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" className="text-white/75" numberOfLines={2}>
            {configured ? t('callAgent.hero.configured') : t('callAgent.hero.notConfigured')}
          </AppText>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <HeroChip icon={Languages} label={t('callAgent.hero.language')} value={languageLabel} />
        <HeroChip icon={Volume2} label={t('callAgent.hero.voice')} value={voice} />
      </View>

      <Animated.View style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={configured ? t('callAgent.hero.editA11y') : t('callAgent.hero.setUp')}
          onPress={onEdit}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 active:opacity-90"
        >
          <Pencil size={16} color={brand.navy} strokeWidth={2.2} accessibilityElementsHidden />
          <AppText variant="label" className="font-geist-semibold" style={{ color: brand.navy }}>
            {configured ? t('callAgent.hero.edit') : t('callAgent.hero.setUp')}
          </AppText>
        </Pressable>
      </Animated.View>
    </GradientSurface>
  );
}

function HeroChip({ icon, label, value }: { icon: typeof Languages; label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className="min-h-9 flex-row items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5"
    >
      <Icon icon={icon} size="xs" color="primaryForeground" />
      <AppText variant="caption" className="text-white/70">
        {label}
      </AppText>
      <AppText variant="label" className="text-white" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}
