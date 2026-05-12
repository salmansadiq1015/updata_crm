'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, X, FolderOpen, Link } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import apiClient from '@/lib/api/client';

function Checkbox({ checked, onCheckedChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`h-4 w-4 shrink-0 rounded border transition-colors flex items-center justify-center ${
        checked ? 'bg-primary border-primary' : 'border-input bg-background'
      }`}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </button>
  );
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CreateGroupDialog({ open, onClose }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedProject, setSelectedProject] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const debouncedSearch = useDebounce(searchTerm.toLowerCase().trim(), 300);

  const { createGroupRoom } = useChatMutations();

  // Step 1: fetch projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['pm', 'projects', 'list-for-chat'],
    queryFn: () => apiClient.get('/pm/projects?limit=100').then(r => r.data?.data ?? r.data),
    enabled: open && step === 1,
    staleTime: 60_000,
  });
  const allProjects = Array.isArray(projectsData)
    ? projectsData
    : Array.isArray(projectsData?.items)
    ? projectsData.items
    : [];

  const debouncedProjectSearch = useDebounce(searchTerm.toLowerCase().trim(), 300);
  const filteredProjects = debouncedProjectSearch
    ? allProjects.filter(p =>
        (p.name ?? '').toLowerCase().includes(debouncedProjectSearch) ||
        (p.projectNumber ?? '').toLowerCase().includes(debouncedProjectSearch)
      )
    : allProjects;

  // Step 3: fetch users
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => apiClient.get('/users?status=active&limit=100').then(r => r.data?.data ?? r.data),
    enabled: open && step === 3,
    staleTime: 60_000,
  });
  const users = Array.isArray(usersData) ? usersData : [];

  const filteredUsers = debouncedSearch
    ? users.filter(u => {
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        return fullName.includes(debouncedSearch) || email.includes(debouncedSearch);
      })
    : users;

  function getInitials(user) {
    return `${(user.firstName ?? '')[0] ?? ''}${(user.lastName ?? '')[0] ?? ''}`.toUpperCase();
  }

  function getRoleLabel(role) {
    return typeof role === 'string' ? role : role?.name ?? '';
  }

  function getSelectedUser(id) {
    return users.find(u => u._id === id);
  }

  function handleSelectProject(project) {
    setSelectedProject(project);
    setName(project.name);
    setSearchTerm('');
    setStep(2);
  }

  function handleSkipProject() {
    setSelectedProject(null);
    setSearchTerm('');
    setStep(2);
  }

  function handleClose() {
    setStep(1);
    setSelectedProject(null);
    setName('');
    setDescription('');
    setSearchTerm('');
    setSelectedIds([]);
    onClose();
  }

  function handleCreate() {
    createGroupRoom.mutate(
      {
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        memberIds: selectedIds,
        ...(selectedProject && { projectId: selectedProject._id }),
      },
      {
        onSuccess: room => {
          router.push(`/field-ops/chat?chatId=${room._id}`);
          handleClose();
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">

        {/* ── Step 1: Select Project ── */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {t('chat.selectProject')}
              </DialogTitle>
              <DialogDescription className="sr-only">{t('chat.selectProjectDesc')}</DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3 pt-0">
              <Input
                autoFocus
                placeholder={t('chat.searchProject')}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />

              <ScrollArea className="h-64">
                {projectsLoading ? (
                  <div className="space-y-2 py-1 pr-3">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3 px-2 py-2">
                        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t('common.noProjects')}</p>
                ) : (
                  <ul className="space-y-1 py-1 pr-3">
                    {filteredProjects.map(project => (
                      <li key={project._id}>
                        <button
                          type="button"
                          onClick={() => handleSelectProject(project)}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(project.name ?? '')[0]?.toUpperCase() ?? 'P'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-none">{project.name}</p>
                            {project.projectNumber && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                #{project.projectNumber}
                              </p>
                            )}
                          </div>
                          {project.status && (
                            <Badge variant="secondary" className="shrink-0 capitalize text-xs">
                              {project.status.toLowerCase().replace('_', ' ')}
                            </Badge>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
              <Button variant="ghost" onClick={handleSkipProject}>{t('common.skip')}</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Group Info ── */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('chat.newGroup')}
              </DialogTitle>
              <DialogDescription className="sr-only">{t('chat.groupInfoDesc')}</DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4 pt-0">
              {selectedProject && (
                <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                  <Link className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs text-primary font-medium truncate">
                    {t('chat.linkedTo', { name: selectedProject.name })}
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t('chat.groupName')} <span className="text-destructive">*</span>
                </label>
                <Input
                  autoFocus
                  placeholder={t('chat.groupNamePlaceholder')}
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 100))}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  {t('common.descriptionOptional')}
                </label>
                <textarea
                  className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder={t('chat.groupDescriptionPlaceholder')}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setSearchTerm(''); setStep(1); }}>{t('common.back')}</Button>
              <Button onClick={() => { setSearchTerm(''); setStep(3); }} disabled={!name.trim()}>
                {t('common.next')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 3: Add Members ── */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('chat.addMembers')}
              </DialogTitle>
              <DialogDescription className="sr-only">{t('chat.addMembersDesc')}</DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3 pt-0">
              <Input
                autoFocus
                placeholder={t('chat.searchByNameEmail')}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />

              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedIds.map(id => {
                    const user = getSelectedUser(id);
                    if (!user) return null;
                    return (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1 pr-1">
                        <span className="text-xs">{user.firstName} {user.lastName}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds(prev => prev.filter(i => i !== id))}
                          className="ml-0.5 rounded-full hover:bg-accent p-0.5"
                          aria-label={t('common.removeName', { name: user.firstName })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              <ScrollArea className="h-64">
                {usersLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loadingUsers')}</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t('common.noUsers')}</p>
                ) : (
                  <ul className="space-y-1 py-1 pr-3">
                    {filteredUsers.map(user => (
                      <li key={user._id}>
                        <label className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent">
                          <Checkbox
                            checked={selectedIds.includes(user._id)}
                            onCheckedChange={checked => {
                              setSelectedIds(prev =>
                                checked ? [...prev, user._id] : prev.filter(id => id !== user._id)
                              );
                            }}
                          />
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-none">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                          {user.role && (
                            <Badge variant="secondary" className="shrink-0 capitalize text-xs">
                              {getRoleLabel(user.role)}
                            </Badge>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setSearchTerm(''); setStep(2); }}>{t('common.back')}</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || createGroupRoom.isPending}>
                {createGroupRoom.isPending ? t('common.creating') : t('chat.createGroup')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
