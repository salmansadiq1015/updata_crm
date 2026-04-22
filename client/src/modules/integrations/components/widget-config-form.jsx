'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { widgetService } from '@/modules/integrations/services/widget-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PageHeader } from '@/shared/components/page-header';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Palette, FormInput, Shield, MessageSquare, Save, Loader2 } from 'lucide-react';

export function WidgetConfigForm() {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('integrations:widget:manage');

  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.integrations.widget.config(),
    queryFn: () => widgetService.getConfig(),
  });

  const [form, setForm] = useState(null);

  useEffect(() => {
    if (config) setForm(JSON.parse(JSON.stringify(config)));
  }, [config]);

  const updateMut = useMutation({
    mutationFn: (body) => widgetService.updateConfig(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.widget.config() });
      showSuccess('Konfiguration gespeichert');
    },
    onError: (err) => showError(err.message),
  });

  if (isLoading || !form) return <ConfigSkeleton />;

  const save = () => {
    const payload = {
      branding: form.branding,
      fields: form.fields,
      requestTypes: form.requestTypes,
      captcha: form.captcha,
      confirmationMessageDe: form.confirmationMessageDe,
      languages: form.languages,
      maxFilesPerSubmission: Number(form.maxFilesPerSubmission),
      maxFileSizeMb: Number(form.maxFileSizeMb),
      rateLimitPerHour: Number(form.rateLimitPerHour),
    };
    updateMut.mutate(payload);
  };

  const setBranding = (patch) => setForm({ ...form, branding: { ...form.branding, ...patch } });
  const setField = (key, patch) => setForm({
    ...form,
    fields: { ...form.fields, [key]: { ...form.fields[key], ...patch } },
  });
  const setCaptcha = (patch) => setForm({ ...form, captcha: { ...form.captcha, ...patch } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Widget-Konfiguration"
        description="Branding, Felder, Anti-Spam & Limits des Website-Widgets."
      >
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={save} disabled={updateMut.isPending}>
            {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="branding" className="space-y-4">
        <TabsList>
          <TabsTrigger value="branding" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Branding</TabsTrigger>
          <TabsTrigger value="fields" className="gap-1.5"><FormInput className="h-3.5 w-3.5" /> Felder</TabsTrigger>
          <TabsTrigger value="captcha" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Anti-Spam</TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Nachrichten</TabsTrigger>
        </TabsList>

        <TabsContent value="branding">
          <Card>
            <CardContent className="p-5 space-y-4 max-w-xl">
              <Field label="Firmenname">
                <Input
                  value={form.branding?.companyName || ''}
                  onChange={(e) => setBranding({ companyName: e.target.value })}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Primärfarbe (Hex)">
                <div className="flex items-center gap-3">
                  <Input
                    value={form.branding?.primaryColor || ''}
                    onChange={(e) => setBranding({ primaryColor: e.target.value })}
                    disabled={!canManage}
                    className="font-mono flex-1"
                  />
                  <div
                    className="h-9 w-9 rounded-lg border border-border shrink-0"
                    style={{ backgroundColor: form.branding?.primaryColor || '#0056b3' }}
                  />
                </div>
              </Field>
              <Field label="Logo-URL">
                <Input
                  value={form.branding?.logoUrl || ''}
                  onChange={(e) => setBranding({ logoUrl: e.target.value })}
                  disabled={!canManage}
                  placeholder="https://..."
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields">
          <Card>
            <CardContent className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">
                Sichtbarkeit und Pflichtstatus der Widget-Felder. Zumindest E-Mail oder Telefon sollte als Pflichtfeld gesetzt sein.
              </p>
              {Object.entries(form.fields || {}).map(([key, cfg]) => (
                <FieldConfigRow
                  key={key}
                  fieldKey={key}
                  config={cfg}
                  disabled={!canManage}
                  onChange={(patch) => setField(key, patch)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="captcha">
          <Card>
            <CardContent className="p-5 space-y-4 max-w-xl">
              <Field label="Provider">
                <Input
                  value={form.captcha?.provider || ''}
                  onChange={(e) => setCaptcha({ provider: e.target.value })}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Site Key (public)">
                <Input
                  value={form.captcha?.siteKey || ''}
                  onChange={(e) => setCaptcha({ siteKey: e.target.value })}
                  disabled={!canManage}
                  className="font-mono"
                />
              </Field>
              <Field label="Schwellwert (0.0 – 1.0)">
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.captcha?.threshold ?? 0.3}
                  onChange={(e) => setCaptcha({ threshold: Number(e.target.value) })}
                  disabled={!canManage}
                />
              </Field>

              <Separator />

              <Field label="Rate-Limit pro Stunde (pro IP)">
                <Input
                  type="number"
                  min="1"
                  value={form.rateLimitPerHour ?? 10}
                  onChange={(e) => setForm({ ...form, rateLimitPerHour: Number(e.target.value) })}
                  disabled={!canManage}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Max. Dateien">
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    value={form.maxFilesPerSubmission ?? 3}
                    onChange={(e) => setForm({ ...form, maxFilesPerSubmission: Number(e.target.value) })}
                    disabled={!canManage}
                  />
                </Field>
                <Field label="Max. Dateigrösse (MB)">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={form.maxFileSizeMb ?? 10}
                    onChange={(e) => setForm({ ...form, maxFileSizeMb: Number(e.target.value) })}
                    disabled={!canManage}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardContent className="p-5 space-y-4">
              <Field label="Bestätigungstext (Deutsch)">
                <Textarea
                  rows={4}
                  value={form.confirmationMessageDe || ''}
                  onChange={(e) => setForm({ ...form, confirmationMessageDe: e.target.value })}
                  disabled={!canManage}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldConfigRow({ fieldKey, config, disabled, onChange }) {
  const labels = {
    contactName: 'Name',
    contactEmail: 'E-Mail',
    contactPhone: 'Telefon',
    contactAddress: 'Adresse',
    preferredWindow: 'Wunschtermin',
    photoUpload: 'Foto-Upload',
  };
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium">{labels[fieldKey] || fieldKey}</p>
        <p className="text-[11px] font-mono text-muted-foreground">{fieldKey}</p>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!config?.visible}
            onCheckedChange={(v) => onChange({ visible: v })}
            disabled={disabled}
          />
          <Label className="text-xs font-medium cursor-pointer">Sichtbar</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!config?.required}
            onCheckedChange={(v) => onChange({ required: v })}
            disabled={disabled || !config?.visible}
          />
          <Label className={cn('text-xs font-medium cursor-pointer', !config?.visible && 'opacity-40')}>
            Pflichtfeld
          </Label>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-80" /></div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
