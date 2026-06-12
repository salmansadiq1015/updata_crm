'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { useSmallOrderMutations } from '@/modules/mobile/hooks/use-small-order-mutations';
import { createSmallOrderSchema } from '@/modules/mobile/validations/small-order';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { AiVoiceCapture } from '@/modules/ai/components/voice/ai-voice-capture';
import { SESSION_TYPES } from '@/modules/ai/constants/ai-constants';

const PRIORITY_OPTIONS = [
  { value: 'NORMAL', de: 'Normal', en: 'Normal' },
  { value: 'HIGH', de: 'Hoch', en: 'High' },
  { value: 'URGENT', de: 'Dringend', en: 'Urgent' },
];

export default function CreateSmallOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const { createOrder } = useSmallOrderMutations(projectId);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createSmallOrderSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'NORMAL',
      dueDate: null,
      assignedTo: '',
    },
  });

  const onSubmit = async (data) => {
    if (!projectId) {
      toast.error(lang === 'de' ? 'Projekt-ID fehlt' : 'Project ID missing');
      return;
    }
    try {
      await createOrder.mutateAsync(data);
      toast.success(lang === 'de' ? 'Kleinauftrag erstellt' : 'Small order created');
      router.back();
    } catch {
      toast.error(lang === 'de' ? 'Erstellung fehlgeschlagen' : 'Creation failed');
    }
  };

  if (!projectId) {
    return (
      <div className="flex flex-col min-h-full">
        <MobileHeader title={lang === 'de' ? 'Kleinauftrag' : 'Small Order'} showBack />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {lang === 'de' ? 'Kein Projekt ausgewählt' : 'No project selected'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={lang === 'de' ? 'Kleinauftrag erstellen' : 'Create Small Order'}
        showBack
      />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <AiVoiceCapture
            sessionType={SESSION_TYPES.ORDER_CREATION}
            contextModule="mobile"
            contextRecordType="project"
            contextRecordId={projectId}
            onComplete={(session) => {
              const text = session?.correctedTranscript || session?.rawTranscript;
              if (text) {
                setValue('title', text.slice(0, 120), { shouldDirty: true });
                setValue('description', text, { shouldDirty: true });
              }
              if (session?.result?.recordId) {
                toast.success(lang === 'de' ? 'Auftrag per Sprache erstellt' : 'Order created via voice');
                router.back();
              }
            }}
          />
          <FormField
            label={lang === 'de' ? 'Titel' : 'Title'}
            required
            error={errors.title?.message}
          >
            <Input
              {...register('title')}
              placeholder={lang === 'de' ? 'Kurzbeschreibung der Arbeit' : 'Brief work description'}
              disabled={isSubmitting}
              className="h-11"
            />
          </FormField>

          <FormField
            label={lang === 'de' ? 'Beschreibung' : 'Description'}
            error={errors.description?.message}
          >
            <Textarea
              {...register('description')}
              placeholder={lang === 'de' ? 'Details und Anweisungen...' : 'Details and instructions...'}
              disabled={isSubmitting}
              rows={4}
            />
          </FormField>

          <FormField
            label={lang === 'de' ? 'Priorität' : 'Priority'}
            required
            error={errors.priority?.message}
          >
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {lang === 'de' ? opt.de : opt.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField
            label={lang === 'de' ? 'Fälligkeitsdatum' : 'Due Date'}
            error={errors.dueDate?.message}
          >
            <Controller
              name="dueDate"
              control={control}
              render={({ field }) => (
                <Input
                  type="date"
                  value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                  onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                  disabled={isSubmitting}
                  className="h-11"
                />
              )}
            />
          </FormField>

          <FormField
            label={lang === 'de' ? 'Zuweisen an' : 'Assign To'}
            required
            error={errors.assignedTo?.message}
          >
            <Input
              {...register('assignedTo')}
              placeholder={lang === 'de' ? 'Mitarbeiter-ID' : 'Employee ID'}
              disabled={isSubmitting}
              className="h-11"
            />
          </FormField>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full h-12"
              disabled={isSubmitting || createOrder.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting || createOrder.isPending
                ? (lang === 'de' ? 'Wird erstellt...' : 'Creating...')
                : (lang === 'de' ? 'Kleinauftrag erstellen' : 'Create Small Order')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
