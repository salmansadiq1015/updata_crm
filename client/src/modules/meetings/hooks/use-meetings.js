'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { meetingService } from '../services/meeting-service';

export function useInfiniteMeetings(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.meetings.list(filters),
    queryFn: ({ pageParam }) => meetingService.list({ ...filters, cursor: pageParam, limit: filters.limit || 50 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.pagination?.nextCursor || undefined,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useMeeting(id, enabled = true) {
  return useQuery({
    queryKey: queryKeys.meetings.detail(id),
    queryFn: () => meetingService.getById(id),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
  });
}

export function useMeetingFiles(meetingId) {
  return useQuery({
    queryKey: queryKeys.meetings.files(meetingId),
    queryFn: () => meetingService.listFiles(meetingId),
    enabled: Boolean(meetingId),
    staleTime: 20_000,
  });
}

export function useMeetingMutations() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidateMeetings = (id) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() });
    if (id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.files(id) });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.feed({}) });
  };

  const mutationOptions = (messageKey, fallback, resolveId) => ({
    onSuccess: (result, variables) => {
      const id = resolveId?.(result, variables);
      invalidateMeetings(id);
      showSuccess(t(messageKey, fallback));
    },
    onError: showError,
  });

  return {
    create: useMutation({
      mutationFn: (data) => meetingService.create(data),
      ...mutationOptions('meetings.toast.created', 'Meeting erstellt', (result) => result?._id),
    }),
    update: useMutation({
      mutationFn: ({ id, data }) => meetingService.update(id, data),
      ...mutationOptions('meetings.toast.updated', 'Meeting aktualisiert', (_result, variables) => variables.id),
    }),
    remove: useMutation({
      mutationFn: (id) => meetingService.remove(id),
      ...mutationOptions('meetings.toast.deleted', 'Meeting geloescht', (_result, id) => id),
    }),
    cancel: useMutation({
      mutationFn: ({ id, data }) => meetingService.cancel(id, data),
      ...mutationOptions('meetings.toast.cancelled', 'Meeting abgesagt', (_result, variables) => variables.id),
    }),
    rsvp: useMutation({
      mutationFn: ({ id, rsvpStatus }) => meetingService.rsvp(id, rsvpStatus),
      ...mutationOptions('meetings.toast.rsvp', 'RSVP aktualisiert', (_result, variables) => variables.id),
    }),
    attendance: useMutation({
      mutationFn: ({ id, attendees }) => meetingService.updateAttendance(id, attendees),
      ...mutationOptions('meetings.toast.attendance', 'Teilnahme aktualisiert', (_result, variables) => variables.id),
    }),
    note: useMutation({
      mutationFn: ({ id, data }) => meetingService.addNote(id, data),
      ...mutationOptions('meetings.toast.note', 'Notiz gespeichert', (_result, variables) => variables.id),
    }),
    minutes: useMutation({
      mutationFn: ({ id, data }) => meetingService.updateMinutes(id, data),
      ...mutationOptions('meetings.toast.minutes', 'Protokoll gespeichert', (_result, variables) => variables.id),
    }),
    decision: useMutation({
      mutationFn: ({ id, data }) => meetingService.addDecision(id, data),
      ...mutationOptions('meetings.toast.decision', 'Entscheidung gespeichert', (_result, variables) => variables.id),
    }),
    task: useMutation({
      mutationFn: ({ id, data }) => meetingService.createTask(id, data),
      ...mutationOptions('meetings.toast.task', 'Folgeaufgabe erstellt', (_result, variables) => variables.id),
    }),
    uploadFile: useMutation({
      mutationFn: ({ id, file }) => meetingService.uploadFile(id, file),
      ...mutationOptions('meetings.toast.file', 'Dokument hochgeladen', (_result, variables) => variables.id),
    }),
    downloadFile: useMutation({
      mutationFn: (fileId) => meetingService.getFileDownloadUrl(fileId),
      onSuccess: (url) => {
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      },
      onError: showError,
    }),
  };
}
