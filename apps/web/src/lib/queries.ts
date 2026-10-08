'use client';

/**
 * Hooks TanStack Query sobre a API. As chaves ficam centralizadas aqui para
 * as invalidações serem consistentes.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Activity,
  BoardColumn,
  ContactTemplate,
  Signature,
  WorkspaceSettings,
  Dashboard,
  ImportJob,
  Today,
  DoNotContact,
  DuplicateCheckResult,
  Lead,
  LeadCreateInput,
  Me,
  Sector,
} from '@vndesign/core';
import { api } from './api-client';

export const qk = {
  me: ['me'] as const,
  sectors: (archived = false) => ['sectors', { archived }] as const,
  leads: (query: Record<string, unknown>) => ['leads', query] as const,
  lead: (id: string) => ['lead', id] as const,
  activities: (id: string) => ['activities', id] as const,
  dnc: ['do-not-contact'] as const,
  pref: (key: string) => ['pref', key] as const,
};

export interface LeadListResponse {
  data: Lead[];
  meta: { page: number; limit: number; total: number };
}

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<{ data: Me }>('/me').then((r) => r.data), staleTime: 300_000 });
}

export function useSectors(includeArchived = false) {
  return useQuery({
    queryKey: qk.sectors(includeArchived),
    queryFn: () =>
      api<{ data: Sector[] }>('/sectors', { query: { include_archived: includeArchived || undefined } }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useLeads(query: Record<string, string | number | string[] | undefined>) {
  return useQuery({
    queryKey: qk.leads(query),
    queryFn: ({ signal }) => api<LeadListResponse>('/leads', { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: qk.lead(id),
    queryFn: () => api<{ data: Lead }>(`/leads/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useActivities(id: string) {
  return useQuery({
    queryKey: qk.activities(id),
    queryFn: () => api<{ data: Activity[] }>(`/leads/${id}/activities`).then((r) => r.data),
  });
}

export function useDoNotContact() {
  return useQuery({ queryKey: qk.dnc, queryFn: () => api<{ data: DoNotContact[] }>('/do-not-contact').then((r) => r.data) });
}

export function checkDuplicates(
  body: { company_name?: string; website?: string | null; email?: string | null; exclude_id?: string | null },
  signal?: AbortSignal,
) {
  return api<{ data: DuplicateCheckResult }>('/leads/check-duplicates', { method: 'POST', body, signal }).then((r) => r.data);
}

/** Invalida tudo o que depende de um lead (lista, ficha e linha do tempo). */
export function useInvalidateLead() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['sectors'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    if (id) {
      void qc.invalidateQueries({ queryKey: qk.lead(id) });
      void qc.invalidateQueries({ queryKey: qk.activities(id) });
    }
  };
}

export function useUpdateLead(id: string) {
  const invalidate = useInvalidateLead();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<LeadCreateInput>) =>
      api<{ data: Lead }>(`/leads/${id}`, { method: 'PATCH', body: patch }).then((r) => r.data),
    onSuccess: (lead) => {
      qc.setQueryData(qk.lead(id), lead);
      invalidate(id);
    },
  });
}

export function useLogActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; body?: string; payload?: Record<string, unknown> }) =>
      api<{ data: Activity }>(`/leads/${id}/activities`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.activities(id) }),
  });
}

export function usePreference<T>(key: string) {
  return useQuery({
    queryKey: qk.pref(key),
    queryFn: () => api<{ data: { value: T | null } }>(`/preferences/${key}`).then((r) => r.data.value),
    staleTime: Infinity,
  });
}

export function useSetPreference<T>(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: T) => api(`/preferences/${key}`, { method: 'PUT', body: { value } }),
    onMutate: (value) => qc.setQueryData(qk.pref(key), value),
  });
}

// -----------------------------------------------------------------------------
// Fase B: Kanban, dashboard e importação
// -----------------------------------------------------------------------------
export function useBoard(query: Record<string, string | string[] | undefined>) {
  return useQuery<BoardColumn[]>({
    queryKey: ['board', query],
    queryFn: ({ signal }) => api<{ data: BoardColumn[] }>('/board', { query, signal }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ data: Dashboard }>('/dashboard').then((r) => r.data) });
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api<{ data: Today }>('/dashboard/today').then((r) => r.data) });
}

export function useImports() {
  return useQuery({ queryKey: ['imports'], queryFn: () => api<{ data: ImportJob[] }>('/imports').then((r) => r.data) });
}

// -----------------------------------------------------------------------------
// Fase C: modelos, assinatura, definições e follow-up
// -----------------------------------------------------------------------------
export type SettingsWithMail = WorkspaceSettings & { mail_configured: boolean };

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ data: ContactTemplate[] }>('/templates').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useSignature() {
  return useQuery({ queryKey: ['signature'], queryFn: () => api<{ data: Signature }>('/signature').then((r) => r.data) });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<{ data: SettingsWithMail }>('/settings').then((r) => r.data) });
}

export function useFollowUp(id: string) {
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: (body: { action: 'done' | 'snooze'; days?: number | null; note?: string }) =>
      api<{ data: Lead }>(`/leads/${id}/follow-up`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => invalidate(id),
  });
}
