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
  LeadBulkActionInput,
  LeadBulkResult,
  RescheduleInput,
  RescheduleResult,
  AiEmailRequestInput,
  AiEmailResult,
  MapData,
  Proposal,
  ServicePackage,
  Service,
  ServiceCategoryItem,
  Activity,
  ApiToken,
  ApiTokenCreate,
  ApiTokenCreated,
  AuditApply,
  SiteAudit,
  AiVisibilityCheck,
  GeoBusiness,
  GeoFaqItem,
  LeadGeo,
  EmailTracking,
  BrandKit,
  LeadAccess,
  ClientProjects,
  ProjectCollaborator,
  LaunchChecklist,
  LaunchCheckKey,
  ProspectingFilter,
  ProspectingOutcome,
  ProspectingQueue,
  ProspectingResult,
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
  LeadTask,
  TaskTemplate,
  Me,
  Sector,
  LeadGenerationAdd,
  LeadGenerationAddResult,
  LeadGenerationRequestInput,
  LeadGenerationRun,
  LeadGenerationSchedule,
  BillingSummary,
  LeadMeeting,
  LeadMeetingCreateInput,
  LeadMeetingResult,
  LeadPayment,
  Project,
  ProjectInfo,
  ProjectStartResult,
  ProjectRevision,
  ProjectTime,
  ProjectDeliverable,
  RunningTimer,
  TimeEntry,
  CalendarEvent,
  Profitability,
  LeadContract,
  CalendarFeed,
  ProjectExpense,
  ProjectBriefing,
  LeadGenerationScheduleUpdate,
  LeadGenerationScheduleUpsertInput,
  MailAccount,
  CollaboratorPerson,
  InviteRole,
  MemberRole,
  Team,
  TeamInvite,
  TeamStats,
  TeamActivity,
  Pomodoro,
  PomodoroAction,
  PomodoroStats,
} from '@vndesign/core';
import { chunkReschedule } from '@vndesign/core';
import { api } from './api-client';

export const qk = {
  me: ['me'] as const,
  sectors: (archived = false) => ['sectors', { archived }] as const,
  services: (archived = false) => ['services', { archived }] as const,
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

/** Serviços do workspace (Definições → Serviços); com `includeArchived`, também os escondidos. */
export function useServices(includeArchived = false) {
  return useQuery({
    queryKey: qk.services(includeArchived),
    queryFn: () =>
      api<{ data: Service[] }>('/services', { query: { include_archived: includeArchived || undefined } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Categorias de serviços (Definições → Serviços), pela ordem definida. */
export function useServiceCategories() {
  return useQuery({
    queryKey: ['service-categories'],
    queryFn: () => api<{ data: ServiceCategoryItem[] }>('/service-categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Depois de mudar serviços ou categorias: listas, fichas e estatísticas mostram os nomes novos. */
export function useInvalidateServices() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['services', 'service-categories', 'leads', 'lead', 'board', 'dashboard', 'packages', 'task-templates']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
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

/** Invalida tudo o que depende de um lead (lista, Kanban, mapa, ficha, linha do tempo e propostas). */
export function useInvalidateLead() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['sectors'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['map'] });
    // Apagar/anonimizar pode acrescentar a empresa à lista "não contactar".
    void qc.invalidateQueries({ queryKey: qk.dnc });
    if (id) {
      void qc.invalidateQueries({ queryKey: qk.lead(id) });
      void qc.invalidateQueries({ queryKey: qk.activities(id) });
      void qc.invalidateQueries({ queryKey: ['proposals', id] });
      void qc.invalidateQueries({ queryKey: ['email-tracking', id] });
      // Passar a Cliente prepara o projeto (tarefas, prazo, pagamentos).
      void qc.invalidateQueries({ queryKey: ['tasks', id] });
      void qc.invalidateQueries({ queryKey: ['payments', id] });
      void qc.invalidateQueries({ queryKey: ['project', id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['tasks', id] });
    }
  };
}

/** Arquivar, repor ou apagar um ou vários leads (POST /leads/bulk). */
export function useBulkLeadAction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: (input: LeadBulkActionInput) =>
      api<{ data: LeadBulkResult }>('/leads/bulk', { method: 'POST', body: input }).then((r) => r.data),
    onSuccess: (_result, input) => {
      invalidate();
      if (input.action === 'delete') {
        for (const id of input.ids) qc.removeQueries({ queryKey: qk.lead(id) });
      } else {
        void qc.invalidateQueries({ queryKey: ['lead'] });
        void qc.invalidateQueries({ queryKey: ['activities'] });
      }
    },
  });
}

/** Mensagem curta para o resultado de uma ação em leads ("3 leads arquivados."). */
export function bulkResultMessage({ action, affected }: LeadBulkResult): string {
  const leads = affected === 1 ? '1 lead' : `${affected} leads`;
  const verb = {
    archive: 'arquivado',
    restore: 'reposto',
    delete: 'apagado',
    assign: 'atribuído',
    tag_add: 'com a etiqueta',
    tag_remove: 'sem a etiqueta',
    status: 'mudado de estado',
  }[action];
  if (action === 'tag_add' || action === 'tag_remove') return `${leads} ${verb}.`;
  if (action === 'status') return `${leads} ${affected === 1 ? 'mudou' : 'mudaram'} de estado.`;
  return `${leads} ${affected === 1 ? verb : `${verb}s`}.`;
}

/**
 * Muda o follow-up de vários leads e o prazo de várias tarefas (POST /reschedule,
 * em blocos de 200). Serve para "Pôr em dia", "Próximo follow-up" e "Anular".
 */
export function useReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RescheduleInput) => {
      const total: RescheduleResult = { leads: 0, tasks: 0 };
      for (const part of chunkReschedule(input)) {
        const r = (await api<{ data: RescheduleResult }>('/reschedule', { method: 'POST', body: part })).data;
        total.leads += r.leads;
        total.tasks += r.tasks;
      }
      return total;
    },
    onSettled: () => {
      for (const key of ['today', 'leads', 'lead', 'board', 'tasks', 'project-calendar', 'activities']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** Depois de mudar um setor (nome, ícone, arquivo): os leads mostram o setor embutido. */
export function useInvalidateSectors() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['sectors', 'leads', 'lead', 'board', 'map', 'dashboard', 'today']) {
      void qc.invalidateQueries({ queryKey: [key] });
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

export function useDashboard(enabled = true) {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ data: Dashboard }>('/dashboard').then((r) => r.data), enabled });
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
export type SettingsWithMail = WorkspaceSettings & { mail_configured: boolean; ai_configured?: boolean };

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

// -----------------------------------------------------------------------------
// Fase D — auditor de sites, tokens de integração
// -----------------------------------------------------------------------------
export function useAudits(leadId: string) {
  return useQuery({
    queryKey: ['audits', leadId],
    queryFn: () => api<{ data: SiteAudit[] }>(`/leads/${leadId}/audits`).then((r) => r.data),
  });
}

/** GEO: os testes "Aparece nas IAs?" do lead (consulta de novo enquanto um corre). */
export function useAiVisibility(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-visibility', leadId],
    queryFn: () => api<{ data: AiVisibilityCheck[] }>(`/leads/${leadId}/ai-visibility`).then((r) => r.data),
    enabled,
    refetchInterval: (query) => (query.state.data?.[0]?.status === 'running' ? 4_000 : false),
  });
}

export function useStartAiVisibility(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questions: string[]) =>
      api<{ data: AiVisibilityCheck }>(`/leads/${leadId}/ai-visibility`, { method: 'POST', body: { questions } }).then((r) => r.data),
    onSuccess: (check) => qc.setQueryData<AiVisibilityCheck[]>(['ai-visibility', leadId], (old) => [check, ...(old ?? [])].slice(0, 5)),
  });
}

/** Kit GEO do lead (dados do negócio, perguntas frequentes, perfil do Google). */
export function useLeadGeo(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['lead-geo', leadId],
    queryFn: () => api<{ data: LeadGeo }>(`/leads/${leadId}/geo`).then((r) => r.data),
    enabled,
  });
}

export function useLeadGeoAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { save: { business?: GeoBusiness; faq?: GeoFaqItem[] } } | { generate: 'faq' | 'google' }) =>
      ('save' in input
        ? api<{ data: LeadGeo }>(`/leads/${leadId}/geo`, { method: 'PATCH', body: input.save })
        : api<{ data: LeadGeo }>(`/leads/${leadId}/geo/${input.generate}`, { method: 'POST' })
      ).then((r) => r.data),
    onSuccess: (geo) => qc.setQueryData(['lead-geo', leadId], geo),
  });
}

export function useRunAudit(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url?: string }) =>
      api<{ data: SiteAudit }>(`/leads/${leadId}/audits`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (audit) => {
      qc.setQueryData<SiteAudit[]>(['audits', leadId], (old) => [audit, ...(old ?? [])]);
      void qc.invalidateQueries({ queryKey: qk.activities(leadId) });
    },
  });
}

/** Sessão de prospeção: a fila carrega-se uma vez (a ordem não muda a meio da sessão). */
export function useProspectingQueue(filter: ProspectingFilter) {
  return useQuery({
    queryKey: ['prospecting', filter],
    queryFn: () => api<{ data: ProspectingQueue }>(`/prospecting?filter=${filter}`).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useProspectingOutcome() {
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: ({ leadId, ...body }: { leadId: string; outcome: ProspectingOutcome; note?: string; days?: number }) =>
      api<{ data: ProspectingResult }>(`/leads/${leadId}/prospecting`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (result) => invalidate(result.lead.id),
  });
}

/** Emails enviados pela plataforma ao lead, com aberturas e cliques. */
export function useEmailTracking(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['email-tracking', leadId],
    queryFn: () => api<{ data: EmailTracking[] }>(`/leads/${leadId}/email-tracking`).then((r) => r.data),
    refetchInterval: 60_000,
    enabled,
  });
}

/** "Tirar imagens" do site (telemóvel e computador) para a última análise. */
export function useCaptureScreenshots(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ data: SiteAudit }>(`/leads/${leadId}/screenshots`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (audit) => {
      qc.setQueryData<SiteAudit[]>(['audits', leadId], (old) => (old ?? []).map((a) => (a.id === audit.id ? audit : a)));
    },
  });
}

export function useApplyAudit(leadId: string) {
  const invalidate = useInvalidateLead();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auditId, ...body }: { auditId: string; fields: AuditApply['fields']; problems_mode?: AuditApply['problems_mode'] }) =>
      api<{ data: Lead }>(`/leads/${leadId}/audits/${auditId}/apply`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (lead) => {
      qc.setQueryData(qk.lead(leadId), lead);
      invalidate(leadId);
    },
  });
}

export function useApiTokens() {
  return useQuery({ queryKey: ['tokens'], queryFn: () => api<{ data: ApiToken[] }>('/tokens').then((r) => r.data) });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiTokenCreate) =>
      api<{ data: ApiTokenCreated }>('/tokens', { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

export function useRevokeApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

// -----------------------------------------------------------------------------
// Fase E — propostas, email com IA, mapa
// -----------------------------------------------------------------------------
export function usePackages(includeArchived = false) {
  return useQuery({
    queryKey: ['packages', { includeArchived }],
    queryFn: () =>
      api<{ data: ServicePackage[] }>('/packages', { query: { archived: includeArchived ? 'true' : undefined } }).then((r) => r.data),
  });
}

export function useProposals(leadId: string) {
  return useQuery({
    queryKey: ['proposals', leadId],
    queryFn: () => api<{ data: Proposal[] }>(`/leads/${leadId}/proposals`).then((r) => r.data),
  });
}

export function useProposal(id: string | null) {
  return useQuery({
    queryKey: ['proposal', id],
    enabled: !!id,
    queryFn: () => api<{ data: Proposal }>(`/proposals/${id}`).then((r) => r.data),
  });
}

export function useAiEmail(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AiEmailRequestInput) =>
      api<{ data: AiEmailResult }>(`/leads/${leadId}/ai-email`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.activities(leadId) }),
  });
}

export function useMapData(query: Record<string, string | string[] | undefined>) {
  return useQuery({
    queryKey: ['map', query],
    queryFn: () => api<{ data: MapData }>('/map', { query }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

// -----------------------------------------------------------------------------
// Tarefas
// -----------------------------------------------------------------------------
export function useLeadTasks(leadId: string) {
  return useQuery({
    queryKey: ['tasks', leadId],
    queryFn: () => api<{ data: LeadTask[] }>(`/leads/${leadId}/tasks`).then((r) => r.data),
  });
}

export function useTaskTemplates() {
  return useQuery({
    queryKey: ['task-templates'],
    queryFn: () => api<{ data: TaskTemplate[] }>('/task-templates').then((r) => r.data),
    staleTime: 60_000,
  });
}

/** Depois de mudar tarefas: o progresso aparece na lista e no Kanban, e as datas em "Hoje". */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return (leadId: string) => {
    void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
    void qc.invalidateQueries({ queryKey: qk.activities(leadId) });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project-calendar'] });
  };
}

// -----------------------------------------------------------------------------
// Gerador de leads
// -----------------------------------------------------------------------------

export function useLeadGenerationRuns() {
  return useQuery({
    queryKey: ['lead-generation'],
    queryFn: () => api<{ data: LeadGenerationRun[] }>('/lead-generation').then((r) => r.data),
  });
}

/** Uma pesquisa; enquanto corre, consulta o estado a cada 4 s. */
export function useLeadGenerationRun(id: string | null) {
  return useQuery({
    queryKey: ['lead-generation', id],
    queryFn: () => api<{ data: LeadGenerationRun }>(`/lead-generation/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 4_000 : false),
  });
}

export function useStartLeadGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadGenerationRequestInput) =>
      api<{ data: LeadGenerationRun }>('/lead-generation', { method: 'POST', body }).then((r) => r.data),
    onSuccess: (run) => {
      qc.setQueryData(['lead-generation', run.id], run);
      void qc.invalidateQueries({ queryKey: ['lead-generation'], exact: true });
    },
  });
}

export function useAddGeneratedLeads(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadGenerationAdd) =>
      api<{ data: LeadGenerationAddResult }>(`/lead-generation/${runId}/add`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-generation'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: ['team-stats'] });
    },
  });
}

/** Pesquisas automáticas (semanais) do gerador de leads. */
export function useLeadGenerationSchedules() {
  return useQuery({
    queryKey: ['lead-generation-schedules'],
    queryFn: () => api<{ data: LeadGenerationSchedule[] }>('/lead-generation/schedules').then((r) => r.data),
  });
}

export function useSaveLeadGenerationSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: LeadGenerationScheduleUpsertInput | LeadGenerationScheduleUpdate }) =>
      api<{ data: LeadGenerationSchedule }>(id ? `/lead-generation/schedules/${id}` : '/lead-generation/schedules', {
        method: id ? 'PATCH' : 'POST',
        body,
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lead-generation-schedules'] }),
  });
}

export function useDeleteLeadGenerationSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/lead-generation/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lead-generation-schedules'] }),
  });
}

export function useRunLeadGenerationSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ data: LeadGenerationRun }>(`/lead-generation/schedules/${id}/run`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (run) => {
      qc.setQueryData(['lead-generation', run.id], run);
      void qc.invalidateQueries({ queryKey: ['lead-generation'], exact: true });
      void qc.invalidateQueries({ queryKey: ['lead-generation-schedules'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Email de envio
// -----------------------------------------------------------------------------

export function useMailAccount() {
  return useQuery({
    queryKey: ['mail-account'],
    queryFn: () => api<{ data: MailAccount | null }>('/mail-account').then((r) => r.data),
  });
}

// -----------------------------------------------------------------------------
// Pagamentos, projetos e reuniões
// -----------------------------------------------------------------------------

function useInvalidateMoney() {
  const qc = useQueryClient();
  return (leadId: string) => {
    void qc.invalidateQueries({ queryKey: ['payments', leadId] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['billing'] });
    void qc.invalidateQueries({ queryKey: ['activities', leadId] });
  };
}

export function usePayments(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['payments', leadId],
    queryFn: () => api<{ data: LeadPayment[] }>(`/leads/${leadId}/payments`).then((r) => r.data),
    enabled,
  });
}

export function useSavePayment(leadId: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      api<{ data: LeadPayment }>(id ? `/payments/${id}` : `/leads/${leadId}/payments`, { method: id ? 'PATCH' : 'POST', body }).then(
        (r) => r.data,
      ),
    onSuccess: () => invalidate(leadId),
  });
}

export function usePaymentPlan(leadId: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: { total: number; split: number[] }) =>
      api<{ data: LeadPayment[] }>(`/leads/${leadId}/payments/plan`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => invalidate(leadId),
  });
}

export function useDeletePayment(leadId: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) => api(`/payments/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(leadId),
  });
}

export function useBilling(enabled = true) {
  return useQuery({
    queryKey: ['billing'],
    queryFn: () => api<{ data: BillingSummary }>('/dashboard/billing').then((r) => r.data),
    enabled,
  });
}

export function useProjects(state: 'active' | 'completed', enabled = true) {
  return useQuery({
    queryKey: ['projects', state],
    queryFn: () => api<{ data: Project[] }>('/projects', { query: { state } }).then((r) => r.data),
    enabled,
  });
}

export function useSetProjectCompleted() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: ({ leadId, ...body }: { leadId: string; completed: boolean; portfolio_task?: boolean; upsell_months?: number | null }) =>
      api<{ data: Lead }>(`/leads/${leadId}/project`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (lead) => {
      invalidate(lead.id);
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['billing'] });
      void qc.invalidateQueries({ queryKey: ['tasks', lead.id] });
      void qc.invalidateQueries({ queryKey: ['project-calendar'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Ferramentas dos projetos (prazo, fase, revisões, horas, entregas, calendário)
// -----------------------------------------------------------------------------

/** Depois de mudar algo de um projeto: a página Projetos, o calendário e a linha do tempo. */
function useInvalidateProject() {
  const qc = useQueryClient();
  return (leadId: string) => {
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project-calendar'] });
    void qc.invalidateQueries({ queryKey: ['activities', leadId] });
  };
}

export function useProjectInfo(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['project', leadId],
    queryFn: () => api<{ data: ProjectInfo }>(`/leads/${leadId}/project`).then((r) => r.data),
    enabled,
  });
}

export function useUpdateProjectInfo(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (body: Partial<Pick<ProjectInfo, 'due_on' | 'stage' | 'revisions_included'>>) =>
      api<{ data: ProjectInfo }>(`/leads/${leadId}/project`, { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: (info) => {
      qc.setQueryData(['project', leadId], info);
      invalidate(leadId);
    },
  });
}

/** "Preparar o projeto": completa o que faltar (prazo, revisões, tarefas, plano de pagamentos). */
export function useStartProject(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ data: ProjectStartResult }>(`/leads/${leadId}/project/start`, { method: 'POST' }).then((r) => r.data),
    onSuccess: () => {
      for (const key of [['project', leadId], ['tasks', leadId], ['payments', leadId], ['projects'], ['activities', leadId], ['billing'], ['project-calendar']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useProjectShare(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: boolean; regenerate?: boolean }) =>
      api<{ data: ProjectInfo }>(`/leads/${leadId}/project/share`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (info) => qc.setQueryData(['project', leadId], info),
  });
}

export function useRevisions(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['revisions', leadId],
    queryFn: () => api<{ data: ProjectRevision[] }>(`/leads/${leadId}/revisions`).then((r) => r.data),
    enabled,
  });
}

export function useSaveRevision(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (body: { description: string; billable?: boolean }) =>
      api<{ data: ProjectRevision }>(`/leads/${leadId}/revisions`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (revision) => {
      // Já na lista (a seguinte abre logo com a contagem certa).
      qc.setQueryData<ProjectRevision[]>(['revisions', leadId], (list) => (list ? [...list, revision] : list));
      void qc.invalidateQueries({ queryKey: ['revisions', leadId] });
      invalidate(leadId);
    },
  });
}

export function useDeleteRevision(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (id: string) => api(`/revisions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['revisions', leadId] });
      invalidate(leadId);
    },
  });
}

export function useProjectTime(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['time', leadId],
    queryFn: () => api<{ data: ProjectTime }>(`/leads/${leadId}/time`).then((r) => r.data),
    enabled,
  });
}

export function useRunningTimer(enabled = true) {
  return useQuery({
    queryKey: ['time', 'running'],
    queryFn: () => api<{ data: RunningTimer }>('/time/running').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });
}

/** Pôr a contar (leadId) ou parar (null) o temporizador. */
export function useTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, start }: { leadId: string; start: boolean }) =>
      start
        ? api<{ data: TimeEntry }>(`/leads/${leadId}/time/start`, { method: 'POST', body: {} }).then((r) => r.data)
        : api<{ data: TimeEntry | null }>('/time/stop', { method: 'POST' }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time'] });
      void qc.invalidateQueries({ queryKey: ['pomodoro'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; minutes: number; notes?: string; task_id?: string | null }) =>
      api<{ data: TimeEntry }>(`/leads/${leadId}/time`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', leadId] });
      // O tempo de cada tarefa aparece na lista de tarefas.
      void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { date?: string; minutes?: number; notes?: string; task_id?: string | null } }) =>
      api<{ data: TimeEntry }>(`/time-entries/${id}`, { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', leadId] });
      // O tempo de cada tarefa aparece na lista de tarefas.
      void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/time-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', leadId] });
      // O tempo de cada tarefa aparece na lista de tarefas.
      void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
      void qc.invalidateQueries({ queryKey: ['time', 'running'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Pôr as horas do projeto a zero (apaga todos os registos). */
export function useClearTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ data: { deleted: number } }>(`/leads/${leadId}/time`, { method: 'DELETE' }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time'] });
      void qc.invalidateQueries({ queryKey: ['pomodoro'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeliverables(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['deliverables', leadId],
    queryFn: () => api<{ data: ProjectDeliverable[] }>(`/leads/${leadId}/deliverables`).then((r) => r.data),
    enabled,
  });
}

export function useSaveDeliverable(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<Pick<ProjectDeliverable, 'title' | 'url' | 'status'>> }) =>
      api<{ data: ProjectDeliverable }>(id ? `/deliverables/${id}` : `/leads/${leadId}/deliverables`, { method: id ? 'PATCH' : 'POST', body }).then(
        (r) => r.data,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliverables', leadId] });
      invalidate(leadId);
    },
  });
}

export function useDeleteDeliverable(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (id: string) => api(`/deliverables/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliverables', leadId] });
      invalidate(leadId);
    },
  });
}

// -----------------------------------------------------------------------------
// Contratos e calendário subscrito
// -----------------------------------------------------------------------------

export function useContracts(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['contracts', leadId],
    queryFn: () => api<{ data: LeadContract[] }>(`/leads/${leadId}/contracts`).then((r) => r.data),
    enabled,
  });
}

/** Criar (sem id), editar (id + body), marcar como enviado (sent) ou apagar (remove). */
export function useContractAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { create?: { proposal_id?: string | null }; id?: string; body?: Record<string, unknown>; sent?: boolean; remove?: boolean }) => {
      if (input.create) return api<{ data: LeadContract }>(`/leads/${leadId}/contracts`, { method: 'POST', body: input.create }).then((r) => r.data);
      if (input.remove) return api(`/contracts/${input.id}`, { method: 'DELETE' }).then(() => null);
      if (input.sent) return api<{ data: LeadContract }>(`/contracts/${input.id}/sent`, { method: 'POST' }).then((r) => r.data);
      return api<{ data: LeadContract }>(`/contracts/${input.id}`, { method: 'PATCH', body: input.body }).then((r) => r.data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contracts', leadId] });
      void qc.invalidateQueries({ queryKey: ['activities', leadId] });
    },
  });
}

export function useExpenses(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['expenses', leadId],
    queryFn: () => api<{ data: ProjectExpense[] }>(`/leads/${leadId}/expenses`).then((r) => r.data),
    enabled,
  });
}

/** Acrescentar (body) ou apagar (id) uma despesa. */
export function useExpenseAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body?: { description: string; amount: number; spent_on?: string }; id?: string }) =>
      input.id ? api(`/expenses/${input.id}`, { method: 'DELETE' }) : api(`/leads/${leadId}/expenses`, { method: 'POST', body: input.body }),
    onSuccess: () => {
      for (const key of [['expenses', leadId], ['time', leadId], ['projects'], ['profitability']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useLaunchChecklist(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['launch', leadId],
    queryFn: () => api<{ data: LaunchChecklist }>(`/leads/${leadId}/launch`).then((r) => r.data),
    enabled,
  });
}

/** Marcar pontos / mudar o endereço (body) ou verificar o site (check). */
export function useLaunchAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { check: true } | { body: { url?: string | null; checks?: Partial<Record<LaunchCheckKey, boolean>> } }) =>
      ('check' in input
        ? api<{ data: LaunchChecklist }>(`/leads/${leadId}/launch/check`, { method: 'POST' })
        : api<{ data: LaunchChecklist }>(`/leads/${leadId}/launch`, { method: 'PATCH', body: input.body })
      ).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['launch', leadId], data),
  });
}

export function useCollaborators(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['collaborators', leadId],
    queryFn: () => api<{ data: ProjectCollaborator[] }>(`/leads/${leadId}/collaborators`).then((r) => r.data),
    enabled,
  });
}

/** Página Colaboradores: todos, por pessoa. */
export function useAllCollaborators(enabled = true) {
  return useQuery({
    queryKey: ['collaborators', 'all'],
    queryFn: () => api<{ data: CollaboratorPerson[] }>('/collaborators').then((r) => r.data),
    enabled,
  });
}

/** Convidar para um projeto (qualquer) ou remover um convite — a partir da página Colaboradores. */
export function useCollaboratorsAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { invite: { lead_id: string; email: string; name?: string; send_email: boolean } } | { remove: string }) =>
      'invite' in input
        ? api<{ data: { collaborator: ProjectCollaborator; emailed: boolean } }>(`/leads/${input.invite.lead_id}/collaborators`, {
            method: 'POST',
            body: { email: input.invite.email, name: input.invite.name, send_email: input.invite.send_email },
          }).then((r) => r.data)
        : api(`/collaborators/${input.remove}`, { method: 'DELETE' }).then(() => null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

/** Convidar (invite) ou remover (remove) um colaborador. */
export function useCollaboratorAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { invite: { email: string; name?: string; send_email: boolean } } | { remove: string }) =>
      'invite' in input
        ? api<{ data: { collaborator: ProjectCollaborator; emailed: boolean } }>(`/leads/${leadId}/collaborators`, { method: 'POST', body: input.invite }).then(
            (r) => r.data,
          )
        : api(`/collaborators/${input.remove}`, { method: 'DELETE' }).then(() => null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

export function useClientProjects(leadId: string) {
  return useQuery({
    queryKey: ['client-projects', leadId],
    queryFn: () => api<{ data: ClientProjects }>(`/leads/${leadId}/client-projects`).then((r) => r.data),
  });
}

export function useCreateClientProject(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: (body: { title: string; services: string[]; estimated_value: number | null }) =>
      api<{ data: Lead }>(`/leads/${leadId}/client-projects`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: (lead) => {
      void qc.invalidateQueries({ queryKey: ['client-projects'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      invalidate(lead.id);
    },
  });
}

export function useBrandKit(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['brand-kit', leadId],
    queryFn: () => api<{ data: BrandKit }>(`/leads/${leadId}/brand-kit`).then((r) => r.data),
    enabled,
  });
}

/** Guardar cores/tipos de letra/links/notas (body), juntar ficheiros (files) ou apagar um (removeFile). */
export function useBrandKitAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: Record<string, unknown> } | { files: File[] } | { removeFile: number }) => {
      if ('body' in input) return api<{ data: BrandKit }>(`/leads/${leadId}/brand-kit`, { method: 'PATCH', body: input.body }).then((r) => r.data);
      if ('removeFile' in input) return api<{ data: BrandKit }>(`/leads/${leadId}/brand-kit/files/${input.removeFile}`, { method: 'DELETE' }).then((r) => r.data);
      const form = new FormData();
      for (const f of input.files) form.append('files', f);
      const res = await fetch(`/api/v1/leads/${leadId}/brand-kit/files`, { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as { data?: BrandKit; detail?: string; title?: string } | null;
      if (!res.ok || !json?.data) throw new Error(json?.detail ?? json?.title ?? 'Não foi possível juntar os ficheiros.');
      return json.data;
    },
    onSuccess: (kit) => qc.setQueryData(['brand-kit', leadId], kit),
  });
}

export function useAccesses(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['accesses', leadId],
    queryFn: () => api<{ data: LeadAccess[] }>(`/leads/${leadId}/accesses`).then((r) => r.data),
    enabled,
  });
}

export function useAccessAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body?: Record<string, unknown>; remove?: boolean }) =>
      input.remove
        ? api(`/accesses/${input.id}`, { method: 'DELETE' })
        : input.id
          ? api(`/accesses/${input.id}`, { method: 'PATCH', body: input.body })
          : api(`/leads/${leadId}/accesses`, { method: 'POST', body: input.body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accesses', leadId] }),
  });
}

export function useBriefing(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['briefing', leadId],
    queryFn: () => api<{ data: ProjectBriefing | null }>(`/leads/${leadId}/briefing`).then((r) => r.data),
    enabled,
  });
}

/** Pedir (ou voltar a pedir) o briefing, ou apagá-lo (remove). */
export function useBriefingAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { remove?: boolean } = {}) =>
      input.remove
        ? api(`/leads/${leadId}/briefing`, { method: 'DELETE' }).then(() => null)
        : api<{ data: ProjectBriefing }>(`/leads/${leadId}/briefing`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (briefing) => qc.setQueryData(['briefing', leadId], briefing),
  });
}

export function useCalendarFeed() {
  return useQuery({
    queryKey: ['calendar-feed'],
    queryFn: () => api<{ data: CalendarFeed }>('/calendar-feed').then((r) => r.data),
  });
}

export function useSetCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: boolean; regenerate?: boolean }) => api<{ data: CalendarFeed }>('/calendar-feed', { method: 'POST', body }).then((r) => r.data),
    onSuccess: (feed) => qc.setQueryData(['calendar-feed'], feed),
  });
}

export function useProfitability(enabled = true) {
  return useQuery({
    queryKey: ['profitability'],
    queryFn: () => api<{ data: Profitability }>('/stats/profitability').then((r) => r.data),
    enabled,
  });
}

export function useProjectCalendar(from: string, to: string, enabled = true, followups = false) {
  return useQuery({
    queryKey: ['project-calendar', from, to, followups],
    queryFn: () => api<{ data: CalendarEvent[] }>('/projects/calendar', { query: { from, to, followups: followups ? 'true' : undefined } }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useMeetings(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['meetings', leadId],
    queryFn: () => api<{ data: LeadMeeting[] }>(`/leads/${leadId}/meetings`).then((r) => r.data),
    enabled,
  });
}

export function useCreateMeeting(leadId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  return useMutation({
    mutationFn: (body: LeadMeetingCreateInput) =>
      api<{ data: LeadMeetingResult }>(`/leads/${leadId}/meetings`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => {
      invalidate(leadId);
      void qc.invalidateQueries({ queryKey: ['meetings', leadId] });
      void qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

export function useCancelMeeting(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notify }: { id: string; notify: boolean }) =>
      api<{ data: LeadMeeting }>(`/meetings/${id}/cancel`, { method: 'POST', body: { notify } }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meetings', leadId] });
      void qc.invalidateQueries({ queryKey: ['activities', leadId] });
      void qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Pomodoro
// -----------------------------------------------------------------------------
export function usePomodoro(enabled = true) {
  return useQuery({
    queryKey: ['pomodoro'],
    queryFn: () => api<{ data: Pomodoro }>('/pomodoro').then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });
}

/** Começar (leadId + tarefa) ou pausar/continuar/saltar/parar o pomodoro. */
export function usePomodoroAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { start: { lead_id: string; task_id?: string | null; phase?: 'work' | 'short_break' } } | { action: PomodoroAction }) =>
      'start' in input
        ? api<{ data: Pomodoro }>('/pomodoro', { method: 'POST', body: input.start }).then((r) => r.data)
        : api<{ data: Pomodoro }>('/pomodoro/action', { method: 'POST', body: { action: input.action } }).then((r) => r.data),
    onSuccess: (pomodoro) => {
      qc.setQueryData(['pomodoro'], pomodoro);
      void qc.invalidateQueries({ queryKey: ['time'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['pomodoro-stats'] });
    },
  });
}

export function usePomodoroStats(enabled = true) {
  return useQuery({
    queryKey: ['pomodoro-stats'],
    queryFn: () => api<{ data: PomodoroStats }>('/stats/pomodoros').then((r) => r.data),
    enabled,
  });
}

// -----------------------------------------------------------------------------
// Equipa de prospeção
// -----------------------------------------------------------------------------
export function useTeam(enabled = true) {
  return useQuery({ queryKey: ['team'], queryFn: () => api<{ data: Team }>('/team').then((r) => r.data), enabled });
}

/** Nomes dos membros (para o Responsável). */
export function useTeamNames(enabled = true) {
  return useQuery({
    queryKey: ['team', 'names'],
    queryFn: () => api<{ data: { user_id: string; name: string; role: MemberRole }[] }>('/team/names').then((r) => r.data),
    enabled,
    staleTime: 300_000,
  });
}

export function useTeamAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { invite: { email: string; name?: string; role: InviteRole; send_email: boolean } }
        | { revoke: string }
        | { role: { user_id: string; role: InviteRole } }
        | { remove: string },
    ) => {
      if ('invite' in input) return api<{ data: { invite: TeamInvite; emailed: boolean } }>('/team/invites', { method: 'POST', body: input.invite }).then((r) => r.data);
      if ('revoke' in input) return api(`/team/invites/${input.revoke}`, { method: 'DELETE' }).then(() => null);
      if ('role' in input) return api(`/team/members/${input.role.user_id}`, { method: 'PATCH', body: { role: input.role.role } }).then(() => null);
      return api(`/team/members/${input.remove}`, { method: 'DELETE' }).then(() => null);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      void qc.invalidateQueries({ queryKey: ['team-stats'] });
    },
  });
}

/** Equipa → Atividade: o que cada pessoa fez nos leads. */
export function useTeamActivity(query: { user?: string; days: number }, enabled = true) {
  return useQuery({
    queryKey: ['team-activity', query],
    queryFn: () => api<{ data: TeamActivity[] }>('/team/activity', { query }).then((r) => r.data),
    enabled,
  });
}

export function useTeamStats(enabled = true) {
  return useQuery({ queryKey: ['team-stats'], queryFn: () => api<{ data: TeamStats }>('/stats/team').then((r) => r.data), enabled });
}

/** O papel de quem está a usar a app (prospetor vê só a parte comercial). */
export function useRole(): MemberRole | null {
  const { data } = useMe();
  return data?.role ?? null;
}
