'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoleSchema } from '@/lib/validations/role';
import { useQuery } from '@tanstack/react-query';
import { roleService } from '@/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Shield, Key, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const actionColors = {
  read: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  write: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  delete: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  admin: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export function RoleForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const isEdit = !!defaultValues?._id;
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [permSearch, setPermSearch] = useState('');

  const { data: permissions } = useQuery({
    queryKey: queryKeys.roles.permissions(),
    queryFn: () => roleService.getPermissions(),
    enabled: open,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    if (defaultValues) {
      const perms = defaultValues.permissions?.map((p) => p._id || p) || [];
      reset({ name: defaultValues.name || '', description: defaultValues.description || '', permissions: perms });
      setSelectedPerms(perms);
    } else {
      reset({ name: '', description: '', permissions: [] });
      setSelectedPerms([]);
    }
    setPermSearch('');
  }, [defaultValues, reset]);

  const togglePermission = (permId) => {
    setSelectedPerms((prev) => {
      const next = prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId];
      setValue('permissions', next, { shouldValidate: true });
      return next;
    });
  };

  const toggleModule = (modulePerms) => {
    const moduleIds = modulePerms.map((p) => p._id);
    const allSelected = moduleIds.every((id) => selectedPerms.includes(id));
    setSelectedPerms((prev) => {
      const next = allSelected
        ? prev.filter((id) => !moduleIds.includes(id))
        : [...new Set([...prev, ...moduleIds])];
      setValue('permissions', next, { shouldValidate: true });
      return next;
    });
  };

  const allPerms = permissions || [];
  const grouped = allPerms.reduce((acc, perm) => {
    const module = perm.module || 'other';
    if (!acc[module]) acc[module] = [];
    acc[module].push(perm);
    return acc;
  }, {});

  const filteredGrouped = Object.entries(grouped).filter(([module]) =>
    !permSearch || module.toLowerCase().includes(permSearch.toLowerCase())
  );

  const selectAll = () => {
    const allIds = allPerms.map((p) => p._id);
    setSelectedPerms(allIds);
    setValue('permissions', allIds, { shouldValidate: true });
  };

  const deselectAll = () => {
    setSelectedPerms([]);
    setValue('permissions', [], { shouldValidate: true });
  };

  const handleFormSubmit = async (data) => {
    data.permissions = selectedPerms;
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg">{isEdit ? 'Rolle bearbeiten' : 'Neue Rolle'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Passen Sie die Rollenberechtigungen an.' : 'Erstellen Sie eine neue Rolle mit spezifischen Berechtigungen.'}
          </DialogDescription>
        </DialogHeader>

        <Separator className="shrink-0" />

        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-5 shrink-0">
            {/* Role Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Rolleninformationen
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">Name</Label>
                  <Input
                    id="name"
                    placeholder="z.B. Projektleiter"
                    className="h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background"
                    {...register('name')}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs">Beschreibung (optional)</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    placeholder="Kurze Beschreibung der Rolle..."
                    className="rounded-lg bg-muted/40 border-border/60 focus:bg-background resize-none"
                    {...register('description')}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator className="shrink-0" />

          {/* Permissions */}
          <div className="px-6 pt-4 pb-2 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Key className="h-3.5 w-3.5" />
                Berechtigungen
                <Badge variant="outline" className="font-mono text-[0.6rem] ml-1">
                  {selectedPerms.length}/{allPerms.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                  Alle
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                  Keine
                </Button>
              </div>
            </div>
            {errors.permissions && <p className="text-xs text-destructive">{errors.permissions.message}</p>}
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Module filtern..."
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="h-9 rounded-lg bg-muted/40 border-border/60 pl-9 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
            <div className="space-y-4 pr-2">
              {filteredGrouped.map(([module, perms]) => {
                const moduleSelected = perms.filter((p) => selectedPerms.includes(p._id)).length;
                const allModuleSelected = moduleSelected === perms.length;
                return (
                  <div key={module} className="rounded-xl border border-border/40 overflow-hidden">
                    {/* Module header */}
                    <button
                      type="button"
                      onClick={() => toggleModule(perms)}
                      className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider capitalize">{module}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[0.6rem] font-mono">
                          {moduleSelected}/{perms.length}
                        </Badge>
                        <div className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center transition-colors',
                          allModuleSelected ? 'bg-primary border-primary' : 'border-border'
                        )}>
                          {allModuleSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </div>
                    </button>
                    {/* Permission items */}
                    <div className="grid grid-cols-2 gap-1 p-2">
                      {perms.map((perm) => {
                        const isSelected = selectedPerms.includes(perm._id);
                        const colorClass = actionColors[perm.action] || 'bg-muted text-muted-foreground';
                        return (
                          <button
                            type="button"
                            key={perm._id}
                            onClick={() => togglePermission(perm._id)}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all border',
                              isSelected
                                ? colorClass
                                : 'border-transparent hover:bg-muted/50 text-muted-foreground'
                            )}
                          >
                            <div className={cn(
                              'h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors shrink-0',
                              isSelected ? 'bg-current border-current' : 'border-muted-foreground/30'
                            )}>
                              {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <span className="font-medium capitalize">{perm.action}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <Separator className="shrink-0" />

          <div className="flex justify-end gap-2 px-6 py-4 shrink-0">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" className="rounded-lg shadow-sm gap-1.5" disabled={isLoading}>
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
