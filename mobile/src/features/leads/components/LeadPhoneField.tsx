import type { LucideIcon } from 'lucide-react-native';
import { getLocales } from 'expo-localization';
import { useMemo, useState, type Ref } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';

import type { LeadFormValues } from '../utils/leadForm';
import {
  DIAL_COUNTRIES,
  findDialCountry,
  hasCountryCode,
  suggestInternationalNumber,
} from '../utils/phoneNumber';

type Props = {
  control: Control<LeadFormValues>;
  name: 'phone' | 'mobile';
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

/**
 * Phone input that explains the CRM's "with country code" rule and offers a
 * one-tap conversion of a local number for a chosen country. The typed value is
 * only changed when the user taps the suggestion.
 */
export function LeadPhoneField({ control, name, label, icon, disabled }: Props) {
  const addressCountry = useWatch({ control, name: 'country' });
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <PhoneInput
          inputRef={field.ref}
          value={field.value ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          addressCountry={addressCountry}
          label={label}
          icon={icon}
          disabled={disabled}
        />
      )}
    />
  );
}

function PhoneInput({
  inputRef,
  value,
  onChange,
  onBlur,
  error,
  addressCountry,
  label,
  icon,
  disabled,
}: {
  inputRef: Ref<TextInput>;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  addressCountry: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  // Default: the lead's address country, else the phone's own region (e.g. PK), else CH.
  const deviceRegion = useMemo(() => {
    try {
      return getLocales()[0]?.regionCode ?? null;
    } catch {
      return null;
    }
  }, []);
  const defaultIso = findDialCountry(addressCountry)?.iso2 ?? findDialCountry(deviceRegion)?.iso2 ?? 'CH';
  const dialIso = picked ?? defaultIso;
  // The default country is listed first so it is visible without scrolling; picking another
  // chip does not reorder the row under the user's finger.
  const countries = useMemo(
    () => [...DIAL_COUNTRIES].sort((a, b) => Number(b.iso2 === defaultIso) - Number(a.iso2 === defaultIso)),
    [defaultIso],
  );
  const dial = findDialCountry(dialIso);

  const local = value.trim() !== '' && !hasCountryCode(value);
  const suggestion = local ? suggestInternationalNumber(value, dialIso) : null;

  return (
    <View className="gap-2">
      <AppInput
        ref={inputRef}
        label={label}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        error={error}
        helperText={t('leadForm.phoneHint')}
        leftIcon={icon}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        disabled={disabled}
      />
      {local ? (
        <View className="gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <AppText variant="caption" tone="muted">
            {t('leadForm.localNumberHint', { country: dialIso, code: dial ? `+${dial.dialCode}` : '' })}
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
            {countries.map((country) => (
              <AppChip
                key={country.iso2}
                label={`${country.iso2} +${country.dialCode}`}
                selected={country.iso2 === dialIso}
                onPress={() => setPicked(country.iso2)}
              />
            ))}
          </ScrollView>
          {suggestion ? (
            <AppButton
              title={t('leadForm.useSuggestion', { number: suggestion })}
              variant="soft"
              size="sm"
              className="self-start"
              disabled={disabled}
              onPress={() => onChange(suggestion)}
            />
          ) : (
            <AppText variant="caption" tone="warning">
              {t('leadForm.noSuggestion', { country: dialIso })}
            </AppText>
          )}
        </View>
      ) : null}
    </View>
  );
}
