'use client';

/**
 * Hooks TanStack Query sobre a API. As chaves ficam centralizadas aqui para
 * as invalidações serem consistentes.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  GoalProgress,
  SiteMonitor,
  SiteMonitorListItem,
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
  GoogleConfirm,
  LeadGeo,
  EmailTracking,
  BrandKit,
  LeadAccess,
  ClientProjects,
  ProjectCollaborator,
  LaunchChecklist,
  LaunchCheckKey,
  ProspectingMode,
  ProspectingView,
  Replies,
  ProspectingOutcome,
  LostReason,
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
  LeadPayment,
  Project,
  ProjectInfo,
  ProjectStartResult,
  ProjectRevision,
  ProjectTime,
  ProjectDeliverable,
  ClientRequest,
  AutomationRule,
  AutomationRuleCreate,
  RecurringSummary,
  Renewal,
  RenewalCreate,
  RunningTimer,
  TimeEntry,
  CalendarEvent,
  Profitability,
  LeadContract,
  CalendarFeed,
  ProjectExpense,
  ProjectBriefing,
  Testimonial,
  TestimonialListItem,
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
import { chunkReschedule,
  ACTIVITY_TYPE_LABELS,
  TEAM_ACTIVITY_PAGE,
  type ActivityType,
  type LeadCityCount,
  type LeadTagCount,
  type CustomField,
  type DashboardPeriod,
  type DashboardPeriodNumbers,
} from '@vndesign/core';
import { api } from './api-client';
import { announceQueued, isQueuedOffline } from './outbox';

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
  return useQuery({ queryKey: qk.me, queryFn: boot('me', (b) => b.me, () => api<{ data: Me }>('/me').then((r) => r.data)), staleTime: 300_000 });
}

export function useSectors(includeArchived = false) {
  return useQuery({
    queryKey: qk.sectors(includeArchived),
    queryFn: boot(
      `sectors:${includeArchived}`,
      (b) => (includeArchived ? b.sectors_all : b.sectors),
      () => api<{ data: Sector[] }>('/sectors', { query: { include_archived: includeArchived || undefined } }).then((r) => r.data),
    ),
    staleTime: 60_000,
  });
}

/** Serviços do workspace (Definições → Serviços); com `includeArchived`, também os escondidos. */
export function useServices(includeArchived = false) {
  return useQuery({
    queryKey: qk.services(includeArchived),
    queryFn: boot(
      `services:${includeArchived}`,
      (b) => (includeArchived ? b.services_all : b.services),
      () => api<{ data: Service[] }>('/services', { query: { include_archived: includeArchived || undefined } }).then((r) => r.data),
    ),
    staleTime: 5 * 60_000,
  });
}

/** Categorias de serviços (Definições → Serviços), pela ordem definida. */
export function useServiceCategories() {
  return useQuery({
    queryKey: ['service-categories'],
    queryFn: boot('service-categories', (b) => b.service_categories, () => api<{ data: ServiceCategoryItem[] }>('/service-categories').then((r) => r.data)),
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

/** `enabled: false`: não pede (ex.: a pesquisa de um diálogo fechado). */
export function useLeads(query: Record<string, string | number | string[] | undefined>, enabled = true) {
  return useQuery({
    queryKey: qk.leads(query),
    queryFn: ({ signal }) => api<LeadListResponse>('/leads', { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Cidades dos leads (para sugerir no filtro "Cidade"). */
export function useLeadCities() {
  return useQuery({
    queryKey: ['lead-cities'],
    queryFn: () => api<{ data: LeadCityCount[] }>('/leads/cities').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useLead(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.lead(id),
    queryFn: () => api<{ data: Lead }>(`/leads/${id}`).then((r) => r.data),
    enabled: Boolean(id) && enabled,
  });
}

/** Partes da ficha que vêm no bundle (cada uma com a chave da cache do cartão: [parte, id]). */
const BUNDLE_PARTS = ['tasks', 'activities', 'audits', 'proposals', 'project', 'payments', 'contracts', 'client-projects', 'revisions', 'time'] as const;
const BUNDLE_PROJECT_PARTS = ['deliverables', 'expenses', 'launch', 'collaborators', 'brand-kit', 'accesses', 'briefing', 'testimonial', 'client-requests', 'renewals'] as const;

function fetchLeadBundle(qc: ReturnType<typeof useQueryClient>, id: string) {
  return api<{ data: { lead: Lead; parts: Record<string, unknown> } }>(`/leads/${id}/bundle`).then(({ data }) => {
    qc.setQueryData(qk.lead(id), data.lead);
    for (const part of [...BUNDLE_PARTS, ...BUNDLE_PROJECT_PARTS]) if (part in data.parts) qc.setQueryData([part, id], data.parts[part]);
    return true;
  });
}

/**
 * A ficha do lead num só pedido: guarda o lead e cada cartão na cache (com a chave
 * de cada um), para os cartões abrirem já com dados em vez de 20 pedidos.
 * Se falhar, cada cartão pede o seu como antes.
 */
export function useLeadBundle(id: string) {
  const qc = useQueryClient();
  return useQuery({ queryKey: ['lead-bundle', id], queryFn: () => fetchLeadBundle(qc, id), enabled: Boolean(id), staleTime: 30_000, retry: false });
}

/**
 * Prepara a ficha de um lead (tudo, num pedido) antes de lá chegar:
 * o "Lead seguinte" abre logo. Os dados ficam frescos 30 s (não pede outra vez ao abrir).
 */
export function usePrefetchLead() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.prefetchQuery({ queryKey: ['lead-bundle', id], queryFn: () => fetchLeadBundle(qc, id), staleTime: 30_000, retry: false });
  };
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
  body: { company_name?: string; website?: string | null; email?: string | null; social_links?: string[] | null; exclude_id?: string | null },
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
    // Clientes antigos: um email enviado tira o cliente da lista.
    void qc.invalidateQueries({ queryKey: ['reconnect'] });
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

/** O que se pode mudar sem rede (fica guardado e vai quando a rede voltar). */
const OFFLINE_LEAD_FIELDS = new Set(['status', 'lost_reason', 'retry_on', 'channel']);

export function useUpdateLead(id: string) {
  const invalidate = useInvalidateLead();
  const qc = useQueryClient();
  return useMutation({
    // Corre mesmo sem rede (por omissão ficava em pausa): sem rede, vai para a fila do aparelho.
    networkMode: 'always',
    mutationFn: async (patch: Partial<LeadCreateInput>) => {
      const cached = qc.getQueryData<Lead>(qk.lead(id));
      const offlineOk = !!cached && Object.keys(patch).every((k) => OFFLINE_LEAD_FIELDS.has(k));
      try {
        return (
          await api<{ data: Lead }>(`/leads/${id}`, {
            method: 'PATCH',
            body: patch,
            ...(offlineOk ? { offline: `Estado · #${cached!.number} ${cached!.company_name}` } : {}),
          })
        ).data;
      } catch (error) {
        if (!isQueuedOffline(error) || !cached) throw error;
        announceQueued();
        // Sem rede: a ficha mostra já o estado novo (o servidor acerta o resto quando receber).
        return { ...cached, ...patch } as Lead;
      }
    },
    onSuccess: (lead) => {
      qc.setQueryData(qk.lead(id), lead);
      // A lista da Prospeção não se recarrega a meio da sessão (a ordem fica), mas os dados
      // do lead acompanham a ficha (ex.: o email de prospeção guardado lá é o que vai ser enviado).
      qc.setQueriesData<ProspectingQueue>({ queryKey: ['prospecting'] }, (old) =>
        old ? { ...old, items: old.items.map((item) => (item.lead.id === id ? { ...item, lead: { ...item.lead, ...lead } } : item)) } : old,
      );
      invalidate(id);
    },
  });
}

export function useLogActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    // Corre mesmo sem rede (por omissão ficava em pausa): sem rede, vai para a fila do aparelho.
    networkMode: 'always',
    /** null: sem rede, ficou guardado para enviar depois. */
    mutationFn: async (body: { type: string; body?: string; payload?: Record<string, unknown> }): Promise<Activity | null> => {
      const lead = qc.getQueryData<Lead>(qk.lead(id));
      const what = ACTIVITY_TYPE_LABELS[body.type as ActivityType] ?? 'Registo';
      try {
        return (await api<{ data: Activity }>(`/leads/${id}/activities`, { method: 'POST', body, offline: lead ? `${what} · #${lead.number} ${lead.company_name}` : what })).data;
      } catch (error) {
        if (!isQueuedOffline(error)) throw error;
        announceQueued();
        return null;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.activities(id) });
      void qc.invalidateQueries({ queryKey: ['reconnect'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Dashboard num só pedido: ao abrir, o Dashboard pede /dashboard/bundle e cada cartão usa a
// sua parte (em vez de 12 pedidos). Se a resposta não chegar, cada cartão pede a sua.
// -----------------------------------------------------------------------------
type DashboardBundle = {
  dashboard: Dashboard | null;
  today: Today | null;
  period: DashboardPeriodNumbers | null;
  goals: GoalProgress | null;
  replies: Replies | null;
  projects: Project[] | null;
  billing: BillingSummary | null;
  site_monitors: SiteMonitorListItem[] | null;
  reconnect: unknown[] | null;
};
/**
 * Pedido único (o inicial da aplicação ou o do Dashboard): começa ao desenhar a página, antes
 * de os cartões se abrirem; cada parte usa-o UMA vez (ao abrir) e só nos primeiros segundos —
 * depois de uma mudança, cada uma pede os seus dados frescos, como sempre.
 */
function makeBundle<B>(path: string, freshMs = 5000) {
  let current: { at: number; promise: Promise<B | null>; used: Set<string> } | null = null;
  return {
    start() {
      if (typeof window === 'undefined') return;
      if (current && Date.now() - current.at < freshMs) return;
      current = {
        at: Date.now(),
        used: new Set(),
        promise: api<{ data: B }>(path)
          .then((r) => r.data)
          .catch(() => null),
      };
    },
    async take<T>(key: string, pick: (b: B) => T | null | undefined): Promise<T | undefined> {
      const c = current;
      if (!c || Date.now() - c.at > freshMs || c.used.has(key)) return undefined;
      c.used.add(key);
      const b = await c.promise;
      const v = b ? pick(b) : undefined;
      return v === null ? undefined : v;
    },
  };
}

const dashboardBundle = makeBundle<DashboardBundle>('/dashboard/bundle');

/** Começa o pedido único do Dashboard (chamado ao desenhar o Dashboard, antes dos cartões). */
export function startDashboardBundle() {
  dashboardBundle.start();
}

const fromBundle = <T>(key: string, pick: (b: DashboardBundle) => T | null | undefined) => dashboardBundle.take(key, pick);

/** Os cartões do Dashboard que vêm no pedido único (para o cartão "Clientes antigos"). */
export function bundled<T>(key: string, pick: (b: DashboardBundle) => T | null | undefined, fallback: () => Promise<T>): () => Promise<T> {
  return async () => (await fromBundle(key, pick)) ?? fallback();
}

// O pedido único das Estatísticas (as secções que se veem ao abrir).
type StatsBundle = Record<string, unknown> & { dashboard: Dashboard | null; accounting: { month: string; report: unknown } | null };
const statsBundle = makeBundle<StatsBundle>('/stats/bundle');

/** Começa o pedido único das Estatísticas (antes de as secções se abrirem). */
export function startStatsBundle() {
  statsBundle.start();
}

/** Uma secção das Estatísticas: a sua parte do pedido único, ou o pedido de sempre. */
export function statsPart<T>(key: string, pick: (b: StatsBundle) => T | null | undefined, fallback: () => Promise<T>): () => Promise<T> {
  return async () => (await statsBundle.take(key, pick)) ?? fallback();
}

// O pedido inicial da aplicação: o que todas as páginas pedem ao abrir.
type AppBootstrap = {
  me: Me | null;
  settings: SettingsWithMail | null;
  time_running: RunningTimer | null;
  pomodoro: Pomodoro | null;
  team_names: { user_id: string; name: string; role: MemberRole; avatar_url: string | null }[] | null;
  services: Service[] | null;
  services_all: Service[] | null;
  service_categories: ServiceCategoryItem[] | null;
  sectors: Sector[] | null;
  sectors_all: Sector[] | null;
  lead_tags: LeadTagCount[] | null;
  custom_fields: CustomField[] | null;
  mail_account: { value: MailAccount | null } | null;
  signature: Signature | null;
  templates: ContactTemplate[] | null;
  task_templates: TaskTemplate[] | null;
  preferences: Record<string, unknown> | null;
};
const appBootstrap = makeBundle<AppBootstrap>('/app/bootstrap', 8000);

/** Começa o pedido inicial (chamado pela moldura da aplicação, antes das páginas). */
export function startAppBootstrap() {
  appBootstrap.start();
}

/** Uma parte do pedido inicial (ou o pedido de sempre, se não vier). */
export function boot<T>(key: string, pick: (b: AppBootstrap) => T | null | undefined, fallback: () => Promise<T>): () => Promise<T> {
  return async () => (await appBootstrap.take(key, pick)) ?? fallback();
}

export function usePreference<T>(key: string) {
  return useQuery({
    queryKey: qk.pref(key),
    queryFn: async () => {
      // As preferências vêm no pedido inicial (todas: a que não está lá ainda não foi escolhida).
      const fromBoot = await appBootstrap.take(`pref:${key}`, (b) => (b.preferences ? { value: (b.preferences[key] ?? null) as T | null } : null));
      if (fromBoot) return fromBoot.value;
      return api<{ data: { value: T | null } }>(`/preferences/${key}`).then((r) => r.data.value);
    },
    staleTime: Infinity,
  });
}

export function useSetPreference<T>(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: T) => api(`/preferences/${key}`, { method: 'PUT', body: { value } }),
    // Cancela a leitura em curso: se chegasse depois, apagava o valor acabado de mudar.
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: qk.pref(key) });
      qc.setQueryData(qk.pref(key), value);
    },
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
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: bundled('dashboard', (b) => b.dashboard, statsPart('dashboard', (b) => b.dashboard, () => api<{ data: Dashboard }>('/dashboard').then((r) => r.data))),
    enabled,
  });
}

/** Dashboard: os números de um período com o anterior (para comparar). */
export function useDashboardPeriod(period: DashboardPeriod | null) {
  return useQuery({
    queryKey: ['dashboard-period', period],
    queryFn: bundled(
      `period:${period}`,
      (b) => (period === 'month' ? b.period : null),
      () => api<{ data: DashboardPeriodNumbers }>('/dashboard/period', { query: { period: period ?? undefined } }).then((r) => r.data),
    ),
    enabled: period !== null,
  });
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: bundled('today', (b) => b.today, () => api<{ data: Today }>('/dashboard/today').then((r) => r.data)) });
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
    queryFn: boot('templates', (b) => b.templates, () => api<{ data: ContactTemplate[] }>('/templates').then((r) => r.data)),
    staleTime: 60_000,
  });
}

export function useSignature() {
  return useQuery({ queryKey: ['signature'], queryFn: boot('signature', (b) => b.signature, () => api<{ data: Signature }>('/signature').then((r) => r.data)) });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: boot('settings', (b) => b.settings, () => api<{ data: SettingsWithMail }>('/settings').then((r) => r.data)) });
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
    mutationFn: (input: { save: { business?: GeoBusiness; faq?: GeoFaqItem[]; google_confirm?: GoogleConfirm } } | { generate: 'faq' | 'google' }) =>
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
export function useProspectingQueue(filter: ProspectingView, mode: ProspectingMode) {
  return useQuery({
    queryKey: ['prospecting', filter, mode],
    queryFn: () => api<{ data: ProspectingQueue }>('/prospecting', { query: { filter, mode } }).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useProspectingOutcome() {
  const invalidate = useInvalidateLead();
  const qc = useQueryClient();
  return useMutation({
    // Corre mesmo sem rede (por omissão ficava em pausa): sem rede, vai para a fila do aparelho.
    networkMode: 'always',
    mutationFn: async ({
      leadId,
      ...body
    }: {
      leadId: string;
      outcome: ProspectingOutcome;
      note?: string;
      days?: number;
      lost_reason?: LostReason | null;
      retry_on?: string | null;
      channel?: 'phone' | 'whatsapp' | 'email';
      /** Para a fila sem rede ("#12 Café Central"). */
      label?: string;
    }): Promise<ProspectingResult | null> => {
      const { label, ...payload } = body;
      try {
        return (await api<{ data: ProspectingResult }>(`/leads/${leadId}/prospecting`, { method: 'POST', body: payload, offline: `Prospeção · ${label ?? 'lead'}` })).data;
      } catch (error) {
        if (!isQueuedOffline(error)) throw error;
        announceQueued();
        // null: sem rede, ficou guardado (o servidor regista quando a rede voltar).
        return null;
      }
    },
    onSuccess: (result) => {
      if (!result) return;
      invalidate(result.lead.id);
      void qc.invalidateQueries({ queryKey: ['goals'] });
    },
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
export function useLeadTasks(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['tasks', leadId],
    queryFn: () => api<{ data: LeadTask[] }>(`/leads/${leadId}/tasks`).then((r) => r.data),
    enabled,
  });
}

export function useTaskTemplates() {
  return useQuery({
    queryKey: ['task-templates'],
    queryFn: boot('task-templates', (b) => b.task_templates, () => api<{ data: TaskTemplate[] }>('/task-templates').then((r) => r.data)),
    staleTime: 60_000,
  });
}

/** Depois de mudar tarefas: o progresso aparece na lista e no Kanban, e as datas em "Hoje". */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  /** leadId null: uma tarefa solta (sem lead). */
  return (leadId: string | null) => {
    if (leadId) {
      void qc.invalidateQueries({ queryKey: ['tasks', leadId] });
      void qc.invalidateQueries({ queryKey: qk.activities(leadId) });
    }
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project-calendar'] });
    void qc.invalidateQueries({ queryKey: ['my-tasks'] });
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
export function useLeadGenerationSchedules(enabled = true) {
  return useQuery({
    queryKey: ['lead-generation-schedules'],
    queryFn: () => api<{ data: LeadGenerationSchedule[] }>('/lead-generation/schedules').then((r) => r.data),
    enabled,
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

/** Lista "Respostas" (Dashboard): respostas dos leads dos últimos 14 dias. */
export function useReplies(days = 14) {
  return useQuery({
    queryKey: ['replies', days],
    queryFn: bundled(`replies:${days}`, (b) => (days === 14 ? b.replies : null), () => api<{ data: Replies }>('/replies', { query: { days } }).then((r) => r.data)),
  });
}

/** "Já tratei" num lead: as respostas que chegaram até agora deixam de estar por responder. */
export function useMarkRepliesHandled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => api(`/leads/${leadId}/replies/handled`, { method: 'POST' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['replies'] }),
  });
}

export function useMailAccount() {
  return useQuery({
    queryKey: ['mail-account'],
    queryFn: async () => {
      const fromBoot = await appBootstrap.take('mail-account', (b) => b.mail_account);
      return fromBoot ? fromBoot.value : api<{ data: MailAccount | null }>('/mail-account').then((r) => r.data);
    },
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
    queryFn: bundled('billing', (b) => b.billing, () => api<{ data: BillingSummary }>('/dashboard/billing').then((r) => r.data)),
    enabled,
  });
}

export function useProjects(state: 'active' | 'completed', enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['projects', state],
    queryFn: async () => {
      const projects =
        (await fromBundle(`projects:${state}`, (b) => (state === 'active' ? b.projects : null))) ?? (await api<{ data: Project[] }>('/projects', { query: { state } })).data;
      // As tarefas de cada projeto já vêm aqui: ficam na cache e a lista não as pede uma a uma.
      for (const p of projects) if (p.task_items) qc.setQueryData(['tasks', p.lead.id], p.task_items);
      return projects;
    },
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
    queryFn: boot('time-running', (b) => b.time_running, () => api<{ data: RunningTimer }>('/time/running').then((r) => r.data)),
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
// O que falta o cliente enviar
// -----------------------------------------------------------------------------
export function useClientRequests(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['client-requests', leadId],
    queryFn: () => api<{ data: ClientRequest[] }>(`/leads/${leadId}/client-requests`).then((r) => r.data),
    enabled,
  });
}

export function useSaveClientRequest(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<Pick<ClientRequest, 'title' | 'note' | 'status'>> }) =>
      api<{ data: ClientRequest }>(id ? `/client-requests/${id}` : `/leads/${leadId}/client-requests`, { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['client-requests', leadId] }),
  });
}

export function useDeleteClientRequest(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/client-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['client-requests', leadId] }),
  });
}

// -----------------------------------------------------------------------------
// Regras automáticas
// -----------------------------------------------------------------------------
export function useAutomationRules(enabled = true) {
  return useQuery({ queryKey: ['automation-rules'], queryFn: () => api<{ data: AutomationRule[] }>('/automation-rules').then((r) => r.data), enabled });
}

export function useSaveAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<AutomationRuleCreate> }) =>
      api<{ data: AutomationRule }>(id ? `/automation-rules/${id}` : '/automation-rules', { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/automation-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useRunAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ data: { applied: number } }>(`/automation-rules/${id}/run`, { method: 'POST' }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['automation-rules'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Renovações e avenças
// -----------------------------------------------------------------------------
export function useRenewals(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['renewals', leadId],
    queryFn: () => api<{ data: Renewal[] }>(`/leads/${leadId}/renewals`).then((r) => r.data),
    enabled,
  });
}

export function useRecurringSummary(enabled = true) {
  return useQuery({
    queryKey: ['renewals', 'summary'],
    queryFn: statsPart('recurring', (b) => b.recurring as RecurringSummary | null, () => api<{ data: RecurringSummary }>('/renewals/summary').then((r) => r.data)),
    enabled,
  });
}

export function useSaveRenewal(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<RenewalCreate> }) =>
      api<{ data: Renewal }>(id ? `/renewals/${id}` : `/leads/${leadId}/renewals`, { method: id ? 'PATCH' : 'POST', body }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['renewals'] }),
  });
}

export function useRenewRenewal(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, record_payment }: { id: string; record_payment: boolean }) =>
      api<{ data: Renewal }>(`/renewals/${id}/renew`, { method: 'POST', body: { record_payment } }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['renewals'] });
      void qc.invalidateQueries({ queryKey: ['payments', leadId] });
      void qc.invalidateQueries({ queryKey: qk.activities(leadId) });
    },
  });
}

export function useDeleteRenewal(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/renewals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['renewals', leadId] });
      void qc.invalidateQueries({ queryKey: ['renewals', 'summary'] });
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

export function useClientProjects(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['client-projects', leadId],
    queryFn: () => api<{ data: ClientProjects }>(`/leads/${leadId}/client-projects`).then((r) => r.data),
    enabled,
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

export function useTestimonial(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['testimonial', leadId],
    queryFn: () => api<{ data: Testimonial | null }>(`/leads/${leadId}/testimonial`).then((r) => r.data),
    enabled,
  });
}

/** Criar o link do testemunho do cliente, ou apagá-lo (remove). */
export function useTestimonialAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { remove?: boolean } = {}) =>
      input.remove
        ? api(`/leads/${leadId}/testimonial`, { method: 'DELETE' }).then(() => null)
        : api<{ data: Testimonial }>(`/leads/${leadId}/testimonial`, { method: 'POST' }).then((r) => r.data),
    onSuccess: (testimonial) => {
      qc.setQueryData(['testimonial', leadId], testimonial);
      void qc.invalidateQueries({ queryKey: ['testimonials'] });
    },
  });
}

/** Todos os testemunhos (Definições → Testemunhos). */
export function useTestimonials() {
  return useQuery({ queryKey: ['testimonials'], queryFn: () => api<{ data: TestimonialListItem[] }>('/testimonials').then((r) => r.data) });
}

export function useUpdateTestimonial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; featured?: boolean; remove?: boolean }) =>
      input.remove
        ? api(`/testimonials/${input.id}`, { method: 'DELETE' }).then(() => null)
        : api<{ data: TestimonialListItem }>(`/testimonials/${input.id}`, { method: 'PATCH', body: { featured: input.featured } }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['testimonials'] });
      void qc.invalidateQueries({ queryKey: ['testimonial'] });
    },
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
    queryFn: statsPart('profitability', (b) => b.profitability as Profitability | null, () => api<{ data: Profitability }>('/stats/profitability').then((r) => r.data)),
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

// -----------------------------------------------------------------------------
// Pomodoro
// -----------------------------------------------------------------------------
export function usePomodoro(enabled = true) {
  return useQuery({
    queryKey: ['pomodoro'],
    queryFn: boot('pomodoro', (b) => b.pomodoro, () => api<{ data: Pomodoro }>('/pomodoro').then((r) => r.data)),
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
    queryFn: statsPart('pomodoros', (b) => b.pomodoros as PomodoroStats | null, () => api<{ data: PomodoroStats }>('/stats/pomodoros').then((r) => r.data)),
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
    queryFn: boot('team-names', (b) => b.team_names, () => api<{ data: { user_id: string; name: string; role: MemberRole; avatar_url: string | null }[] }>('/team/names').then((r) => r.data)),
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

/** Equipa → Atividade, por páginas: "Carregar mais" pede os anteriores ao último registo. */
export function useTeamActivity(query: { user?: string; days: number; group?: string }, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['team-activity', query],
    queryFn: ({ pageParam }) =>
      api<{ data: TeamActivity[] }>('/team/activity', { query: { ...query, before: pageParam } }).then((r) => r.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= TEAM_ACTIVITY_PAGE ? last[last.length - 1]!.created_at : undefined),
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

// -----------------------------------------------------------------------------
// Metas do mês
// -----------------------------------------------------------------------------
export function useGoals(month?: string, enabled = true) {
  return useQuery({
    queryKey: ['goals', month ?? 'now'],
    queryFn: bundled(`goals:${month ?? 'now'}`, (b) => (month ? null : b.goals), () => api<{ data: GoalProgress }>('/goals', { query: month ? { month } : {} }).then((r) => r.data)),
    staleTime: 60_000,
    enabled,
  });
}

// -----------------------------------------------------------------------------
// Sites dos clientes (vigiar)
// -----------------------------------------------------------------------------
type LeadSiteMonitor = SiteMonitor & { domain_renewal_on: string | null };
export function useSiteMonitor(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['site-monitor', leadId],
    queryFn: () => api<{ data: LeadSiteMonitor | null }>(`/leads/${leadId}/site-monitor`).then((r) => r.data),
    enabled,
  });
}
export function useSiteMonitors(enabled = true) {
  return useQuery({
    queryKey: ['site-monitors'],
    queryFn: bundled('site-monitors', (b) => b.site_monitors, () => api<{ data: SiteMonitorListItem[] }>('/site-monitors').then((r) => r.data)),
    staleTime: 5 * 60_000,
    enabled,
  });
}
export function useSiteMonitorActions(leadId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['site-monitor', leadId] });
    void qc.invalidateQueries({ queryKey: ['site-monitors'] });
    // "Falso alarme" / site de volta: sai a tarefa automática "Contactar…: o site está em baixo".
    void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('task') });
  };
  return {
    create: useMutation({
      mutationFn: (body: { url?: string }) => api<{ data: SiteMonitor }>(`/leads/${leadId}/site-monitor`, { method: 'POST', body }).then((r) => r.data),
      onSettled: done,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; url?: string; active?: boolean; domain_expires_on?: string | null; false_alarm?: boolean }) =>
        api<{ data: SiteMonitor }>(`/site-monitors/${id}`, { method: 'PATCH', body }).then((r) => r.data),
      onSettled: done,
    }),
    check: useMutation({
      mutationFn: (id: string) => api<{ data: SiteMonitor }>(`/site-monitors/${id}/check`, { method: 'POST' }).then((r) => r.data),
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/site-monitors/${id}`, { method: 'DELETE' }),
      onSettled: done,
    }),
  };
}
