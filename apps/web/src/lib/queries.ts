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
} from '@vndesign/core';
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
  const verb = { archive: 'arquivado', restore: 'reposto', delete: 'apagado' }[action];
  return `${leads} ${affected === 1 ? verb : `${verb}s`}.`;
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
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; minutes: number; notes?: string }) =>
      api<{ data: TimeEntry }>(`/leads/${leadId}/time`, { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', leadId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateTime(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { date?: string; minutes?: number; notes?: string } }) =>
      api<{ data: TimeEntry }>(`/time-entries/${id}`, { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', leadId] });
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
      void qc.invalidateQueries({ queryKey: ['time', 'running'] });
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

export function useProjectCalendar(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['project-calendar', from, to],
    queryFn: () => api<{ data: CalendarEvent[] }>('/projects/calendar', { query: { from, to } }).then((r) => r.data),
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
