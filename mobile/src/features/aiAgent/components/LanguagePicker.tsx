import { Check, ChevronDown, Languages } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import { filterLanguages } from '../domain/agentDomain';
import type { AgentLanguage } from '../types';

type ListProps = {
  languages: readonly AgentLanguage[];
  value: string;
  onSelect: (code: string) => void;
};

/** Searchable list of the server's AI agent languages (native name first). */
export function LanguageList({ languages, value, onSelect }: ListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterLanguages(languages, query), [languages, query]);

  return (
    <View className="gap-3">
      <AppSearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('aiAgent.language.search')}
        accessibilityLabel={t('aiAgent.language.search')}
      />
      {filtered.length === 0 ? (
        <AppText tone="muted">{t('aiAgent.language.noMatch', { query: query.trim() })}</AppText>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={t('aiAgent.language.label')}>
        {filtered.map((language) => {
          const selected = language.code.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={language.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${language.nativeName}, ${language.name}`}
              onPress={() => onSelect(language.code)}
              className="min-h-12 flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted"
            >
              <View className="flex-1">
                <AppText variant="title" numberOfLines={1}>
                  {language.nativeName || language.name}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {language.name} · {language.code}
                </AppText>
              </View>
              {language.support === 'limited' ? (
                <AppBadge label={t('aiAgent.language.limited')} variant="warning" />
              ) : null}
              {selected ? <Icon icon={Check} size="sm" color="primary" /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type PickerProps = ListProps & { loading?: boolean };

/** Field showing the chosen language; opens the searchable list in a modal. */
export function LanguagePicker({ languages, value, onSelect, loading }: PickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = languages.find((language) => language.code.toLowerCase() === value.toLowerCase());
  // "Deutsch · German", but just "English" when both names are the same.
  const label = current
    ? current.nativeName === current.name
      ? current.name
      : `${current.nativeName} · ${current.name}`
    : value;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('aiAgent.language.label')}: ${label}`}
        accessibilityHint={t('aiAgent.language.choose')}
        disabled={loading}
        onPress={() => setOpen(true)}
        className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:bg-muted"
      >
        <Icon icon={Languages} size="sm" color="mutedForeground" />
        <AppText className="flex-1" numberOfLines={1}>
          {loading ? t('common.loading') : label}
        </AppText>
        <Icon icon={ChevronDown} size="sm" color="mutedForeground" />
      </Pressable>
      {current?.support === 'limited' ? (
        <AppText variant="caption" tone="warning">
          {t('aiAgent.language.limitedHint')}
        </AppText>
      ) : null}
      <AppModal
        visible={open}
        title={t('aiAgent.language.choose')}
        onClose={() => setOpen(false)}
        footer={<AppButton title={t('common.close')} variant="ghost" onPress={() => setOpen(false)} />}
      >
        <LanguageList
          languages={languages}
          value={value}
          onSelect={(code) => {
            onSelect(code);
            setOpen(false);
          }}
        />
      </AppModal>
    </>
  );
}
