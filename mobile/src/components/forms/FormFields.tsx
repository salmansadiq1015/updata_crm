// React Hook Form bindings for the shared inputs, so every form shows labels,
// field errors and disabled states the same way.
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { AppInput, type AppInputProps } from '@/components/ui/AppInput';
import { AppPasswordInput, type AppPasswordInputProps } from '@/components/ui/AppPasswordInput';

type FieldBinding<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
};

export function FormTextField<T extends FieldValues>({
  control,
  name,
  ...props
}: FieldBinding<T> & Omit<AppInputProps, 'value' | 'onChangeText' | 'onBlur' | 'error'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppInput
          ref={field.ref}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...props}
        />
      )}
    />
  );
}

export function FormPasswordField<T extends FieldValues>({
  control,
  name,
  ...props
}: FieldBinding<T> & Omit<AppPasswordInputProps, 'value' | 'onChangeText' | 'onBlur' | 'error'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <AppPasswordInput
          ref={field.ref}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...props}
        />
      )}
    />
  );
}
