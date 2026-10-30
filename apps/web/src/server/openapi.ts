/**
 * Documento OpenAPI 3.1 da API /api/v1, gerado a partir dos schemas Zod de
 * @vndesign/core (a mesma fonte usada para validar os pedidos).
 * Servido em /api/v1/openapi.json e apresentado em /docs/api.
 */
import {
  ApplyTaskTemplateSchema,
  LeadTaskCreateSchema,
  LeadTaskReorderSchema,
  LeadTaskSchema,
  LeadTaskUpdateSchema,
  TaskTemplateCreateSchema,
  TaskTemplateSchema,
  TaskTemplateUpdateSchema,
  AiEmailRequestSchema,
  AiEmailResultSchema,
  LeadEmailSendResultSchema,
  LeadEmailSendSchema,
  MailAccountSchema,
  MailAccountUpsertSchema,
  ReplyCheckResultSchema,
  FollowUpDraftSchema,
  LeadPaymentSchema,
  LeadPaymentCreateSchema,
  LeadPaymentUpdateSchema,
  PaymentPlanSchema,
  ProjectSchema,
  ProjectsQuerySchema,
  ProjectCompleteSchema,
  ProjectInfoSchema,
  ProjectInfoUpdateSchema,
  ProjectShareSchema,
  ProjectStartResultSchema,
  ProjectRevisionSchema,
  ProjectRevisionCreateSchema,
  ProjectTimeSchema,
  TimeEntrySchema,
  TimeEntryCreateSchema,
  TimeEntryUpdateSchema,
  TimeStartSchema,
  RunningTimerSchema,
  ProjectDeliverableSchema,
  ProjectDeliverableCreateSchema,
  ProjectDeliverableUpdateSchema,
  CalendarEventSchema,
  ProfitabilitySchema,
  CalendarFeedSchema,
  LeadContractSchema,
  ContractCreateSchema,
  ContractUpdateSchema,
  ContractAcceptSchema,
  ClientDeliverableActionSchema,
  ProjectExpenseSchema,
  ProjectExpenseCreateSchema,
  ProjectBriefingSchema,
  CalendarFeedUpdateSchema,
  CalendarQuerySchema,
  BillingSummarySchema,
  LeadMeetingSchema,
  LeadMeetingCreateSchema,
  LeadMeetingResultSchema,
  AiProviderCreateSchema,
  AiProviderSchema,
  AiProviderTestResultSchema,
  AiProviderUpdateSchema,
  LeadGenerationAddResultSchema,
  LeadGenerationAddSchema,
  LeadGenerationRequestSchema,
  LeadGenerationRunSchema,
  LeadGenerationScheduleSchema,
  LeadGenerationScheduleUpdateSchema,
  LeadGenerationScheduleUpsertSchema,
  GeocodeBatchResultSchema,
  LeadLocationSchema,
  MapDataSchema,
  ProposalCreateSchema,
  ProposalSchema,
  ProposalUpdateSchema,
  ServicePackageCreateSchema,
  ServicePackageSchema,
  ServicePackageUpdateSchema,
  ApiTokenCreateSchema,
  ApiTokenCreatedSchema,
  ApiTokenSchema,
  AuditApplySchema,
  IntegrationImportResultSchema,
  IntegrationImportSchema,
  PushSubscriptionCreateSchema,
  PushSubscriptionDeleteSchema,
  SiteAuditRequestSchema,
  SCREENSHOT_DEVICES,
  MEMBER_ROLES,
  TeamAcceptSchema,
  TeamInviteCreateSchema,
  TeamInviteSchema,
  TeamMemberUpdateSchema,
  TeamSchema,
  TeamStatsSchema,
  CollaboratorPersonSchema,
  ContactFindingsSchema,
  PomodoroActionSchema,
  PomodoroSchema,
  PomodoroStartSchema,
  PomodoroStatsSchema,
  LeadAccessUpsertSchema,
  LeadAccessSchema,
  BrandKitUpdateSchema,
  BrandKitSchema,
  ClientProjectsSchema,
  ClientProjectCreateSchema,
  CollabTimeActionSchema,
  CollabProjectSchema,
  CollabProjectSummarySchema,
  CollaboratorAcceptSchema,
  CollaboratorInviteSchema,
  ProjectCollaboratorSchema,
  UserSessionSchema,
  LaunchChecklistSchema,
  LaunchChecklistUpdateSchema,
  SharePayloadSchema,
  SharedLeadDraftSchema,
  ProspectingQuerySchema,
  RepliesQuerySchema,
  RepliesSchema,
  ProspectingOutcomeSchema,
  ProspectingQueueSchema,
  ProspectingResultSchema,
  EmailTrackingSchema,
  SiteAuditSchema,
  AiVisibilityCheckSchema,
  SiteFormToggleSchema,
  LeadGeoSchema,
  LeadGeoUpdateSchema,
  MeetingNotesInputSchema,
  MeetingNotesResultSchema,
  TaskSearchQuerySchema,
  TaskListQuerySchema,
  TaskListItemSchema,
  NotificationClearQuerySchema,
  NotificationListSchema,
  NotificationReadSchema,
  CommentCreateSchema,
  TaskSearchResultSchema,
  TeamActivityQuerySchema,
  TeamActivitySchema,
  AiVisibilityRequestSchema,
  ActivityCreateSchema,
  ContactTemplateCreateSchema,
  ContactTemplateSchema,
  ContactTemplateUpdateSchema,
  FollowUpSchema,
  RenderTemplateRequestSchema,
  RenderedTemplateSchema,
  SignatureSchema,
  SignatureUpdateSchema,
  WorkspaceSettingsSchema,
  WorkspaceSettingsUpdateSchema,
  BoardColumnSchema,
  DashboardPeriodQuerySchema,
  DashboardPeriodSchema,
  DashboardSchema,
  ImportAnalysisSchema,
  ImportCommitSchema,
  ImportJobSchema,
  ImportPreviewRequestSchema,
  ImportPreviewSchema,
  LeadMoveSchema,
  TodaySchema,
  ActivitySchema,
  DoNotContactCreateSchema,
  DoNotContactSchema,
  DuplicateCheckResultSchema,
  LeadBulkActionSchema,
  LeadBulkResultSchema,
  DuplicateCheckSchema,
  DuplicateGroupSchema,
  DuplicateIgnoreSchema,
  LeadCityCountSchema,
  LeadTagCountSchema,
  LeadTagRenameSchema,
  LeadSummarySchema,
  CardScanInputSchema,
  LeadTextInputSchema,
  ReconnectQuerySchema,
  ReconnectClientSchema,
  CardScanResultSchema,
  TrashItemSchema,
  TrashIdsSchema,
  CustomFieldSchema,
  CustomFieldCreateSchema,
  CustomFieldUpdateSchema,
  PeriodCompareQuerySchema,
  PeriodCompareSchema,
  LostReasonCountSchema,
  NoteSearchQuerySchema,
  NoteSearchResultSchema,
  RescheduleResultSchema,
  RescheduleSchema,
  LeadAnonymizeSchema,
  LeadCreateSchema,
  LeadListQuerySchema,
  LeadMergeSchema,
  LeadSchema,
  LeadUpdateSchema,
  MeSchema,
  EmailStatsSchema,
  EmailStatsQuerySchema,
  EmailCheckSchema,
  EmailCheckQuerySchema,
  ProfileSchema,
  ProfileUpdateSchema,
  PaginationMetaSchema,
  PreferenceValueSchema,
  ProblemSchema,
  SectorCreateSchema,
  ServiceCategoryCreateSchema,
  ServiceCategorySchema,
  ServiceCategoryUpdateSchema,
  ServiceCreateSchema,
  ServiceReorderSchema,
  ServiceSchema,
  ServiceUpdateSchema,
  SectorSchema,
  SectorUpdateSchema,
} from '@vndesign/core';
import { z } from 'zod';
import { createDocument, type ZodOpenApiOperationObject, type ZodOpenApiResponsesObject } from 'zod-openapi';

const data = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
});
const ok = (schema: z.ZodType, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});
const body = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const common: ZodOpenApiResponsesObject = {
  '400': problem('Pedido inválido (erros por campo em `errors`)'),
  '401': problem('Não autenticado'),
};
const withNotFound: ZodOpenApiResponsesObject = { ...common, '404': problem('Não encontrado') };

const leadId = z.object({ id: z.uuid().meta({ description: 'ID do lead' }) });
const idParam = z.object({ id: z.uuid() });

function op(o: ZodOpenApiOperationObject): ZodOpenApiOperationObject {
  return o;
}

let cached: ReturnType<typeof createDocument> | undefined;

export function getOpenApiDocument() {
  cached ??= createDocument({
    openapi: '3.1.0',
    info: {
      title: 'VNDesign Leads API',
      version: '1.0.0',
      description: [
        'API REST da plataforma de prospeção VNDesign Leads (usada pela web, pela futura app móvel e por integrações).',
        '',
        '**Autenticação**',
        '- Web: sessão (cookies Supabase).',
        '- App móvel: `Authorization: Bearer <access token Supabase>`.',
        '- Integrações: tokens pessoais `Authorization: Bearer vnd_…` (criados em Definições → Acesso externo (API)).',
        '  Só funcionam nos endpoints marcados com um scope (`leads:import`, `leads:read`, `leads:write`).',
        '',
        '**Convenções**: JSON em snake_case; datas `AAAA-MM-DD`; valores em euros; erros em `application/problem+json` com mensagens em pt-PT.',
        'Respostas de sucesso vêm em `{ "data": … }` (listas também com `meta`).',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiToken: { type: 'http', scheme: 'bearer', bearerFormat: 'vnd_…', description: 'Token de integração' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sb-<projeto>-auth-token' },
      },
    },
    tags: [
      { name: 'Conta' },
      { name: 'Leads' },
      { name: 'Kanban' },
      { name: 'Scripts e follow-up' },
      { name: 'Dashboard' },
      { name: 'Importação e exportação' },
      { name: 'Atividade' },
      { name: 'Setores' },
      { name: 'Serviços' },
      { name: 'Não contactar' },
      { name: 'Preferências' },
      { name: 'Auditor de sites' },
      { name: 'Integrações' },
      { name: 'Notificações' },
      { name: 'Tarefas' },
      { name: 'Propostas' },
      { name: 'Email com IA' },
      { name: 'Gerador de leads' },
      { name: 'Fornecedores de IA' },
      { name: 'Email' },
      { name: 'Projetos', description: 'Pagamentos dos clientes e projetos em curso' },
      { name: 'Equipa', description: 'Equipa de prospeção: convites, papéis, responsável pelos leads e estatísticas' },
      { name: 'Reuniões' },
      { name: 'Contratos', description: 'Contratos gerados a partir da proposta e aceites online' },
      { name: 'Colaboradores', description: 'Pessoas convidadas para um projeto e o portal delas' },
      { name: 'Mapa' },
    ],
    paths: {
      '/me': {
        get: op({ tags: ['Conta'], summary: 'Utilizador e workspace atuais', responses: { '200': ok(data(MeSchema)), ...common } }),
      },
      '/email-check': {
        get: op({
          tags: ['Leads'],
          summary: 'Verificar um email: o domínio existe e recebe emails? (MX; só um aviso)',
          requestParams: { query: EmailCheckQuerySchema },
          responses: { '200': ok(data(EmailCheckSchema)), ...common },
        }),
      },
      '/me/profile': {
        get: op({ tags: ['Conta'], summary: 'O meu nome a mostrar e a foto', responses: { '200': ok(data(ProfileSchema)), ...common } }),
        patch: op({
          tags: ['Conta'],
          summary: 'Mudar o nome a mostrar (alcunha; null = usa o nome da assinatura)',
          requestBody: body(ProfileUpdateSchema),
          responses: { '200': ok(data(ProfileSchema)), ...common },
        }),
      },
      '/me/avatar': {
        post: op({
          tags: ['Conta'],
          summary: 'Foto nova (multipart, campo "file": JPEG, PNG ou WebP até 1 MB)',
          responses: { '200': ok(data(ProfileSchema)), '422': problem('Sem foto, formato inválido ou demasiado grande'), ...common },
        }),
        delete: op({ tags: ['Conta'], summary: 'Tirar a foto (voltam as iniciais)', responses: { '200': ok(data(ProfileSchema)), ...common } }),
      },
      '/avatars/{userId}': {
        get: op({
          tags: ['Conta'],
          summary: 'A foto de alguém da equipa (redireciona para um link temporário)',
          requestParams: { path: z.object({ userId: z.uuid() }) },
          responses: { '302': { description: 'Link temporário' }, '404': problem('Sem foto'), ...common },
        }),
      },
      '/meta': {
        get: op({
          tags: ['Conta'],
          summary: 'Estados, canais, opções e setores com rótulos pt-PT',
          responses: { '200': ok(z.object({ data: z.record(z.string(), z.unknown()) })), ...common },
        }),
      },
      '/leads': {
        get: op({
          tags: ['Leads'],
          summary: 'Listar leads',
          requestParams: { query: LeadListQuerySchema },
          responses: {
            '200': ok(z.object({ data: z.array(LeadSchema), meta: PaginationMetaSchema })),
            ...common,
          },
        }),
        post: op({
          tags: ['Leads'],
          summary: 'Criar lead (com deteção de duplicados)',
          requestParams: {
            query: z.object({
              force: z.enum(['true', 'false']).optional().meta({ description: 'Criar mesmo havendo duplicados' }),
            }),
          },
          requestBody: body(LeadCreateSchema),
          responses: {
            '201': ok(data(LeadSchema), 'Criado'),
            ...common,
            '409': problem('Duplicado forte (mesmo nome normalizado, website ou email) — ver `duplicates`'),
            '422': problem('Empresa na lista "não contactar" — ver `do_not_contact`'),
          },
        }),
      },
      '/leads/check-duplicates': {
        post: op({
          tags: ['Leads'],
          summary: 'Verificar duplicados e lista "não contactar" sem gravar',
          requestBody: body(DuplicateCheckSchema),
          responses: { '200': ok(data(DuplicateCheckResultSchema)), ...common },
        }),
      },
      '/leads/cities': {
        get: op({
          tags: ['Leads'],
          summary: 'Cidades dos leads, com o número de leads (mais usadas primeiro)',
          responses: { '200': ok(data(z.array(LeadCityCountSchema))), ...common },
        }),
      },
      '/leads/tags': {
        get: op({
          tags: ['Leads'],
          summary: 'Etiquetas usadas, com o número de leads (mais usadas primeiro)',
          responses: { '200': ok(data(z.array(LeadTagCountSchema))), ...common },
        }),
        patch: op({
          tags: ['Leads'],
          summary: 'Renomear uma etiqueta em todos os leads (para uma que já existe = juntar; to = null apaga)',
          requestBody: body(LeadTagRenameSchema),
          responses: { '200': ok(data(z.object({ affected: z.int() }))), ...common },
        }),
      },
      '/leads/duplicates': {
        get: op({
          tags: ['Leads'],
          summary: 'Grupos de leads com o mesmo email, site ou nome, com o principal sugerido (limpeza de duplicados)',
          responses: { '200': ok(data(z.array(DuplicateGroupSchema))), ...common },
        }),
      },
      '/leads/duplicates/ignore': {
        post: op({
          tags: ['Leads'],
          summary: '"Não são duplicados": o grupo deixa de aparecer na limpeza',
          requestBody: body(DuplicateIgnoreSchema),
          responses: { '204': { description: 'Guardado' }, ...common },
        }),
      },
      '/leads/bulk': {
        post: op({
          tags: ['Leads'],
          summary: 'Arquivar, repor, apagar, mudar o responsável, pôr/tirar uma etiqueta ou mudar o estado de vários leads de uma vez (máx. 200; só com sessão)',
          requestBody: body(LeadBulkActionSchema),
          responses: { '200': ok(data(LeadBulkResultSchema)), ...common },
        }),
      },
      '/leads/{id}': {
        get: op({
          tags: ['Leads'],
          summary: 'Ficha do lead',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
        patch: op({
          tags: ['Leads'],
          summary: 'Editar lead (regras de estado: "contactado" agenda follow-up a +3 dias)',
          requestParams: { path: leadId },
          requestBody: body(LeadUpdateSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Leads'],
          summary: 'Apagar lead definitivamente (RGPD)',
          requestParams: {
            path: leadId,
            query: z.object({
              add_to_do_not_contact: z.enum(['true', 'false']).optional(),
              reason: z.string().optional(),
            }),
          },
          responses: { '204': { description: 'Apagado' }, ...withNotFound },
        }),
      },
      '/leads/{id}/move': {
        post: op({
          tags: ['Kanban'],
          summary: 'Mover no Kanban (estado e posição)',
          requestParams: { path: leadId },
          requestBody: body(LeadMoveSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/board': {
        get: op({
          tags: ['Kanban'],
          summary: 'Colunas do Kanban (aceita os filtros de /leads)',
          requestParams: { query: LeadListQuerySchema },
          responses: { '200': ok(data(z.array(BoardColumnSchema))), ...common },
        }),
      },
      '/dashboard': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Resumo, contagens por setor/estado/canal, funil e evolução semanal',
          responses: { '200': ok(data(DashboardSchema)), ...common },
        }),
      },
      '/dashboard/period': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Leads novos, contactados e clientes ganhos de um período (este mês ou 30 dias), com o período anterior',
          requestParams: { query: DashboardPeriodQuerySchema },
          responses: { '200': ok(data(DashboardPeriodSchema)), ...common },
        }),
      },
      '/dashboard/today': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Follow-ups em atraso, para hoje e próximos 7 dias',
          responses: { '200': ok(data(TodaySchema)), ...common },
        }),
      },
      '/leads/export': {
        get: op({
          tags: ['Importação e exportação'],
          summary: 'Exportar leads (CSV para Excel pt-PT ou XLSX); aceita os filtros de /leads',
          requestParams: { query: z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx') }) },
          responses: {
            '200': {
              description: 'Ficheiro',
              content: {
                'text/csv': { schema: z.string() },
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: z.string() },
              },
            },
            ...common,
          },
        }),
      },
      '/imports/analyze': {
        post: op({
          tags: ['Importação e exportação'],
          summary: 'Ler um ficheiro CSV/XLSX: cabeçalho, linhas e mapeamento sugerido',
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: z.object({
                  file: z.string().meta({ format: 'binary' }),
                  sheet: z.string().optional().meta({ description: 'Nome da folha (XLSX)' }),
                }),
              },
            },
          },
          responses: { '200': ok(data(ImportAnalysisSchema)), ...common, '413': problem('Ficheiro demasiado grande'), '415': problem('Formato não suportado') },
        }),
      },
      '/imports/preview': {
        post: op({
          tags: ['Importação e exportação'],
          summary: 'Validar linhas e detetar duplicados (não grava)',
          requestBody: body(ImportPreviewRequestSchema),
          responses: { '200': ok(data(ImportPreviewSchema)), ...common },
        }),
      },
      '/imports': {
        get: op({
          tags: ['Importação e exportação'],
          summary: 'Histórico de importações',
          responses: { '200': ok(data(z.array(ImportJobSchema))), ...common },
        }),
        post: op({
          tags: ['Importação e exportação'],
          summary: 'Gravar a importação (criar / juntar / ignorar por linha)',
          requestBody: body(ImportCommitSchema),
          responses: { '201': ok(data(ImportJobSchema), 'Importado'), ...common },
        }),
      },
      '/templates': {
        get: op({ tags: ['Scripts e follow-up'], summary: 'Modelos de contacto', responses: { '200': ok(data(z.array(ContactTemplateSchema))), ...common } }),
        post: op({
          tags: ['Scripts e follow-up'],
          summary: 'Criar modelo',
          requestBody: body(ContactTemplateCreateSchema),
          responses: { '201': ok(data(ContactTemplateSchema), 'Criado'), ...common },
        }),
      },
      '/templates/{id}': {
        get: op({ tags: ['Scripts e follow-up'], summary: 'Modelo', requestParams: { path: idParam }, responses: { '200': ok(data(ContactTemplateSchema)), ...withNotFound } }),
        patch: op({
          tags: ['Scripts e follow-up'],
          summary: 'Editar modelo',
          requestParams: { path: idParam },
          requestBody: body(ContactTemplateUpdateSchema),
          responses: { '200': ok(data(ContactTemplateSchema)), ...withNotFound },
        }),
        delete: op({ tags: ['Scripts e follow-up'], summary: 'Apagar modelo', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, ...withNotFound } }),
      },
      '/leads/{id}/render-template': {
        post: op({
          tags: ['Scripts e follow-up'],
          summary: 'Preencher um modelo (ou texto) com os dados do lead e a assinatura',
          requestParams: { path: leadId },
          requestBody: body(RenderTemplateRequestSchema),
          responses: { '200': ok(data(RenderedTemplateSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/follow-up': {
        post: op({
          tags: ['Scripts e follow-up'],
          summary: 'Follow-up feito (com nova data opcional) ou adiar',
          requestParams: { path: leadId },
          requestBody: body(FollowUpSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/signature': {
        get: op({ tags: ['Conta'], summary: 'Assinatura do utilizador', responses: { '200': ok(data(SignatureSchema)), ...common } }),
        put: op({ tags: ['Conta'], summary: 'Atualizar assinatura', requestBody: body(SignatureUpdateSchema), responses: { '200': ok(data(SignatureSchema)), ...common } }),
      },
      '/settings': {
        get: op({
          tags: ['Conta'],
          summary: 'Definições do workspace (+ mail_configured)',
          responses: { '200': ok(data(WorkspaceSettingsSchema.extend({ mail_configured: z.boolean() }))), ...common },
        }),
        patch: op({
          tags: ['Conta'],
          summary: 'Atualizar definições (dono/admin)',
          requestBody: body(WorkspaceSettingsUpdateSchema),
          responses: { '200': ok(data(WorkspaceSettingsSchema.extend({ mail_configured: z.boolean() }))), ...common, '403': problem('Sem permissão') },
        }),
      },
      '/settings/test-digest': {
        post: op({
          tags: ['Conta'],
          summary: 'Enviar já um resumo diário de teste',
          responses: { '200': ok(data(z.object({ sent_to: z.string(), subject: z.string() }))), ...common, '422': problem('Email por configurar') },
        }),
      },
      '/cron/daily-digest': {
        get: op({
          tags: ['Scripts e follow-up'],
          summary: 'Enviar o resumo diário (cron). Authorization: Bearer CRON_SECRET',
          security: [],
          requestParams: { query: z.object({ dry_run: z.enum(['true', 'false']).optional() }) },
          responses: { '200': ok(z.object({ data: z.array(z.record(z.string(), z.unknown())) })), '401': problem('CRON_SECRET inválido') },
        }),
      },
      '/leads/{id}/merge': {
        post: op({
          tags: ['Leads'],
          summary: 'Juntar duplicados ao lead',
          requestParams: { path: leadId },
          requestBody: body(LeadMergeSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/anonymize': {
        post: op({
          tags: ['Leads'],
          summary: 'Anonimizar lead (RGPD)',
          requestParams: { path: leadId },
          requestBody: body(LeadAnonymizeSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/activities': {
        get: op({
          tags: ['Atividade'],
          summary: 'Linha do tempo do lead',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(ActivitySchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Atividade'],
          summary: 'Registar nota, chamada, email copiado/enviado…',
          requestParams: { path: leadId },
          requestBody: body(ActivityCreateSchema),
          responses: { '201': ok(data(ActivitySchema), 'Criado'), ...withNotFound },
        }),
      },
      '/leads/{id}/comments': {
        post: op({
          tags: ['Atividade'],
          summary: 'Comentário da equipa na linha do tempo, com @menções (cada pessoa mencionada recebe um aviso)',
          requestParams: { path: leadId },
          requestBody: body(CommentCreateSchema),
          responses: { '201': ok(data(ActivitySchema), 'Criado'), ...withNotFound },
        }),
      },
      '/leads/{id}/activities/{activityId}': {
        delete: op({
          tags: ['Atividade'],
          summary: 'Apagar um registo manual próprio (nota, chamada, email enviado, comentário)',
          requestParams: { path: z.object({ id: z.uuid(), activityId: z.uuid() }) },
          responses: { '204': { description: 'Apagada' }, ...withNotFound },
        }),
      },
      '/sectors': {
        get: op({
          tags: ['Setores'],
          summary: 'Listar setores',
          requestParams: { query: z.object({ include_archived: z.enum(['true', 'false']).optional() }) },
          responses: { '200': ok(data(z.array(SectorSchema))), ...common },
        }),
        post: op({
          tags: ['Setores'],
          summary: 'Criar setor',
          requestBody: body(SectorCreateSchema),
          responses: { '201': ok(data(SectorSchema), 'Criado'), ...common, '409': problem('Nome repetido') },
        }),
      },
      '/sectors/{id}': {
        patch: op({
          tags: ['Setores'],
          summary: 'Editar ou arquivar setor',
          requestParams: { path: idParam },
          requestBody: body(SectorUpdateSchema),
          responses: { '200': ok(data(SectorSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Setores'],
          summary: 'Apagar setor sem leads',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound, '409': problem('Setor com leads') },
        }),
      },
      '/service-categories': {
        get: op({
          tags: ['Serviços'],
          summary: 'Listar categorias de serviços',
          responses: { '200': ok(data(z.array(ServiceCategorySchema))), ...common },
        }),
        post: op({
          tags: ['Serviços'],
          summary: 'Criar categoria (a chave é gerada a partir do nome)',
          requestBody: body(ServiceCategoryCreateSchema),
          responses: { '201': ok(data(ServiceCategorySchema), 'Criada'), ...common, '409': problem('Nome repetido') },
        }),
      },
      '/service-categories/reorder': {
        post: op({
          tags: ['Serviços'],
          summary: 'Mudar a ordem das categorias',
          requestBody: body(ServiceReorderSchema),
          responses: { '200': ok(data(z.array(ServiceCategorySchema))), ...common },
        }),
      },
      '/service-categories/{id}': {
        patch: op({
          tags: ['Serviços'],
          summary: 'Editar categoria (nome, ícone, portefólio de design no email com IA)',
          requestParams: { path: idParam },
          requestBody: body(ServiceCategoryUpdateSchema),
          responses: { '200': ok(data(ServiceCategorySchema)), ...withNotFound, '409': problem('Nome repetido') },
        }),
        delete: op({
          tags: ['Serviços'],
          summary: 'Apagar categoria sem serviços nem pacotes',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagada' }, ...withNotFound, '409': problem('Categoria em uso') },
        }),
      },
      '/services': {
        get: op({
          tags: ['Serviços'],
          summary: 'Listar serviços (Definições → Serviços)',
          requestParams: { query: z.object({ include_archived: z.enum(['true', 'false']).optional() }) },
          responses: { '200': ok(data(z.array(ServiceSchema))), ...common },
        }),
        post: op({
          tags: ['Serviços'],
          summary: 'Criar serviço (a chave é gerada a partir do nome)',
          requestBody: body(ServiceCreateSchema),
          responses: { '201': ok(data(ServiceSchema), 'Criado'), ...common, '409': problem('Nome repetido') },
        }),
      },
      '/services/reorder': {
        post: op({
          tags: ['Serviços'],
          summary: 'Mudar a ordem dos serviços',
          requestBody: body(ServiceReorderSchema),
          responses: { '200': ok(data(z.array(ServiceSchema))), ...common },
        }),
      },
      '/services/{id}': {
        patch: op({
          tags: ['Serviços'],
          summary: 'Editar, esconder ou voltar a mostrar um serviço',
          requestParams: { path: idParam },
          requestBody: body(ServiceUpdateSchema),
          responses: { '200': ok(data(ServiceSchema)), ...withNotFound, '409': problem('Nome repetido') },
        }),
        delete: op({
          tags: ['Serviços'],
          summary: 'Apagar serviço sem leads',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound, '409': problem('Serviço com leads') },
        }),
      },
      '/do-not-contact': {
        get: op({
          tags: ['Não contactar'],
          summary: 'Lista "não contactar"',
          responses: { '200': ok(data(z.array(DoNotContactSchema))), ...common },
        }),
        post: op({
          tags: ['Não contactar'],
          summary: 'Acrescentar empresa à lista',
          requestBody: body(DoNotContactCreateSchema),
          responses: { '201': ok(data(DoNotContactSchema), 'Criado'), ...common },
        }),
      },
      '/do-not-contact/{id}': {
        delete: op({
          tags: ['Não contactar'],
          summary: 'Remover da lista',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Removido' }, ...withNotFound },
        }),
      },
      '/leads/import': {
        post: op({
          tags: ['Integrações'],
          summary: 'Importar leads em JSON (scope leads:import)',
          description: [
            'Para integrações como a tarefa semanal de prospeção. Os valores podem vir como na folha',
            '("🔍 Identificado", "Sim", "06/10/2026", "1.200 €"); o setor é procurado pelo nome.',
            'Duplicados: `on_duplicate` = `skip` (por omissão), `merge` (preenche campos vazios) ou `create`.',
            'A lista "não contactar" bloqueia sempre. Com `dry_run: true` nada é gravado.',
            'Cabeçalho opcional `Idempotency-Key`: repetir o pedido devolve a resposta original (`replayed: true`).',
          ].join('\n'),
          security: [{ apiToken: [] }, { bearerAuth: [] }, { cookieAuth: [] }],
          requestParams: { header: z.object({ 'Idempotency-Key': z.string().max(200).optional() }) },
          requestBody: body(IntegrationImportSchema),
          responses: {
            '200': ok(data(IntegrationImportResultSchema), 'Validado (dry_run), repetido ou nada gravado'),
            '201': ok(data(IntegrationImportResultSchema), 'Leads criados/juntados'),
            '403': problem('O token não tem o scope leads:import'),
            ...common,
          },
        }),
      },
      '/tokens': {
        get: op({
          tags: ['Integrações'],
          summary: 'Tokens de integração do utilizador (só sessão)',
          responses: { '200': ok(data(z.array(ApiTokenSchema))), ...common },
        }),
        post: op({
          tags: ['Integrações'],
          summary: 'Criar token (o valor só é devolvido agora)',
          requestBody: body(ApiTokenCreateSchema),
          responses: { '201': ok(data(ApiTokenCreatedSchema), 'Criado'), ...common },
        }),
      },
      '/tokens/{id}': {
        delete: op({
          tags: ['Integrações'],
          summary: 'Revogar token',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Revogado' }, ...withNotFound },
        }),
      },
      '/leads/{id}/audits': {
        get: op({
          tags: ['Auditor de sites'],
          summary: 'Histórico de análises do site do lead',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(SiteAuditSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Analisar o site (HTTPS/SSL, telemóvel, SEO, CMS, copyright, PageSpeed)',
          description: 'Pode demorar até 1 minuto (PageSpeed). Por omissão analisa o website do lead.',
          requestParams: { path: leadId },
          requestBody: body(SiteAuditRequestSchema),
          responses: {
            '201': ok(data(SiteAuditSchema), 'Análise concluída'),
            '422': problem('Sem website, ou endereço interno/inválido'),
            ...withNotFound,
          },
        }),
      },
      '/leads/{id}/ai-visibility': {
        get: op({
          tags: ['Auditor de sites'],
          summary: 'Testes "Aparece nas IAs?" do lead (GEO)',
          description: 'Os últimos 5, o mais recente primeiro. Enquanto status = running, consultar de novo.',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(AiVisibilityCheckSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Perguntar a uma IA com pesquisa se o lead aparece nas respostas (GEO)',
          description:
            'Faz as perguntas (1 a 5) a Claude, ChatGPT ou OpenRouter, conforme Definições → Inteligência artificial (ai.visibility), sem dizer qual é o lead. Corre em segundo plano (1 a 3 minutos).',
          requestParams: { path: leadId },
          requestBody: body(AiVisibilityRequestSchema),
          responses: {
            '202': ok(data(AiVisibilityCheckSchema), 'Teste começado (status running)'),
            '409': problem('Já há um teste a correr para este lead'),
            '422': problem('Fornecedor sem pesquisa na internet ou sem modelo escolhido'),
            ...withNotFound,
          },
        }),
      },
      '/leads/{id}/geo': {
        get: op({
          tags: ['Auditor de sites'],
          summary: 'Kit GEO do lead: dados do negócio (schema.org/llms.txt), perguntas frequentes e perfil do Google',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LeadGeoSchema)), ...withNotFound },
        }),
        patch: op({
          tags: ['Auditor de sites'],
          summary: 'Guardar os dados do negócio e/ou as perguntas frequentes',
          requestParams: { path: leadId },
          requestBody: body(LeadGeoUpdateSchema),
          responses: { '200': ok(data(LeadGeoSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/geo/faq': {
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Perguntas frequentes com IA (8 a 10, substituem as atuais)',
          description: 'Usa o fornecedor do "Email com IA" (Definições → Inteligência artificial).',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LeadGeoSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/geo/google': {
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Perfil do Google: nota e avaliações do lead e dos concorrentes do último "Aparece nas IAs?"',
          description: 'Com GOOGLE_PLACES_API_KEY usa a Google Places API (exato); sem ela, a IA com pesquisa na internet (aproximado).',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LeadGeoSchema)), '502': problem('A Google ou a IA não responderam'), ...withNotFound },
        }),
      },
      '/leads/{id}/screenshots': {
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Tirar as imagens do site (telemóvel e computador) para a última análise',
          description: 'Usa o Google PageSpeed (até 1 minuto). As imagens entram no relatório PDF e podem ir em anexo no email.',
          requestParams: { path: leadId },
          responses: {
            '200': ok(data(SiteAuditSchema), 'Análise com as imagens'),
            '422': problem('Ainda não há análise do site'),
            '502': problem('O PageSpeed não devolveu imagens'),
            ...withNotFound,
          },
        }),
      },
      '/leads/{id}/audits/{auditId}/screenshots/{device}': {
        get: op({
          tags: ['Auditor de sites'],
          summary: 'Imagem do site (redireciona para um link temporário)',
          requestParams: { path: z.object({ id: z.uuid(), auditId: z.uuid(), device: z.enum(SCREENSHOT_DEVICES) }) },
          responses: { '302': { description: 'Link temporário (10 minutos)' }, ...withNotFound },
        }),
      },
      '/leads/{id}/audits/{auditId}/apply': {
        post: op({
          tags: ['Auditor de sites'],
          summary: 'Aplicar PageSpeed, Mobile? e/ou Problemas ao lead',
          requestParams: { path: z.object({ id: z.uuid(), auditId: z.uuid() }) },
          requestBody: body(AuditApplySchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/push-subscriptions': {
        get: op({
          tags: ['Notificações'],
          summary: 'Chave pública VAPID e dispositivos subscritos',
          responses: { '200': ok(data(z.record(z.string(), z.unknown()))), ...common },
        }),
        post: op({
          tags: ['Notificações'],
          summary: 'Registar este browser para notificações push',
          requestBody: body(PushSubscriptionCreateSchema),
          responses: { '204': { description: 'Registado' }, '503': problem('Push não configurado'), ...common },
        }),
        delete: op({
          tags: ['Notificações'],
          summary: 'Desligar as notificações neste browser',
          requestBody: body(PushSubscriptionDeleteSchema),
          responses: { '204': { description: 'Removido' }, ...common },
        }),
      },
      '/push-subscriptions/test': {
        post: op({
          tags: ['Notificações'],
          summary: 'Enviar uma notificação de teste',
          responses: { '200': ok(data(z.object({ sent: z.int(), removed: z.int(), failed: z.int() }))), ...common },
        }),
      },
      '/packages': {
        get: op({
          tags: ['Propostas'],
          summary: 'Pacotes de serviços (?archived=true inclui arquivados)',
          responses: { '200': ok(data(z.array(ServicePackageSchema))), ...common },
        }),
        post: op({
          tags: ['Propostas'],
          summary: 'Novo pacote',
          requestBody: body(ServicePackageCreateSchema),
          responses: { '201': ok(data(ServicePackageSchema), 'Criado'), ...common },
        }),
      },
      '/packages/{id}': {
        patch: op({
          tags: ['Propostas'],
          summary: 'Editar ou arquivar pacote',
          requestParams: { path: idParam },
          requestBody: body(ServicePackageUpdateSchema),
          responses: { '200': ok(data(ServicePackageSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Propostas'],
          summary: 'Apagar pacote',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound },
        }),
      },
      '/leads/{id}/proposals': {
        get: op({
          tags: ['Propostas'],
          summary: 'Propostas do lead',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(ProposalSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Propostas'],
          summary: 'Nova proposta (validade e pagamento por omissão vêm das definições)',
          requestParams: { path: leadId },
          requestBody: body(ProposalCreateSchema),
          responses: { '201': ok(data(ProposalSchema), 'Criada'), ...withNotFound },
        }),
      },
      '/proposals/{id}': {
        get: op({ tags: ['Propostas'], summary: 'Proposta', requestParams: { path: idParam }, responses: { '200': ok(data(ProposalSchema)), ...withNotFound } }),
        patch: op({
          tags: ['Propostas'],
          summary: 'Editar proposta ou mudar o estado',
          requestParams: { path: idParam },
          requestBody: body(ProposalUpdateSchema),
          responses: { '200': ok(data(ProposalSchema)), ...withNotFound },
        }),
        delete: op({ tags: ['Propostas'], summary: 'Apagar proposta', requestParams: { path: idParam }, responses: { '204': { description: 'Apagada' }, ...withNotFound } }),
      },
      '/proposals/{id}/pdf': {
        get: op({
          tags: ['Propostas'],
          summary: 'PDF da proposta (?download=1 para descarregar)',
          requestParams: { path: idParam, query: z.object({ download: z.enum(['1']).optional() }) },
          responses: { '200': { description: 'PDF', content: { 'application/pdf': { schema: z.string().meta({ format: 'binary' }) } } }, ...withNotFound },
        }),
      },
      '/proposals/{id}/send': {
        post: op({
          tags: ['Propostas'],
          summary: 'Marcar como enviada (o lead passa a "Proposta enviada")',
          requestParams: { path: idParam },
          responses: { '200': ok(data(z.object({ proposal: ProposalSchema, lead: LeadSchema }))), ...withNotFound },
        }),
      },
      '/leads/{id}/tasks': {
        get: op({
          tags: ['Tarefas'],
          summary: 'Tarefas do lead',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(LeadTaskSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Tarefas'],
          summary: 'Nova tarefa (fica no fim da lista)',
          requestParams: { path: leadId },
          requestBody: body(LeadTaskCreateSchema),
          responses: { '201': ok(data(LeadTaskSchema), 'Criada'), ...withNotFound },
        }),
      },
      '/leads/{id}/tasks/reorder': {
        post: op({
          tags: ['Tarefas'],
          summary: 'Mudar a ordem das tarefas',
          requestParams: { path: leadId },
          requestBody: body(LeadTaskReorderSchema),
          responses: { '200': ok(data(z.array(LeadTaskSchema))), ...withNotFound },
        }),
      },
      '/leads/{id}/tasks/template': {
        post: op({
          tags: ['Tarefas'],
          summary: 'Acrescentar as tarefas de uma lista-modelo (sem repetir as que já existem)',
          requestParams: { path: leadId },
          requestBody: body(ApplyTaskTemplateSchema),
          responses: { '200': ok(data(z.array(LeadTaskSchema))), ...withNotFound },
        }),
      },
      '/leads/{id}/meeting-notes': {
        post: op({
          tags: ['Leads'],
          summary: 'Notas de reunião com IA: resumo, tarefas e próximo passo a partir dos apontamentos (não grava nada)',
          requestParams: { path: leadId },
          requestBody: body(MeetingNotesInputSchema),
          responses: { '200': ok(data(MeetingNotesResultSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/summary': {
        post: op({
          tags: ['Leads'],
          summary: 'Resumo do lead com IA antes de ligar: quem é, o que se falou, o combinado e o próximo passo (não grava nada)',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LeadSummarySchema)), ...withNotFound },
        }),
      },
      '/leads/card-scan': {
        post: op({
          tags: ['Leads'],
          summary: 'Ler a fotografia de um cartão de visita (data URL) e devolver os dados do lead (não grava nada)',
          requestBody: body(CardScanInputSchema),
          responses: { '200': ok(data(CardScanResultSchema)), ...common },
        }),
      },
      '/leads/from-text': {
        post: op({
          tags: ['Leads'],
          summary: 'Texto ditado ou colado ({ text }) → dados do lead para o formulário (a IA preenche; não grava nada)',
          requestBody: body(LeadTextInputSchema),
          responses: { '200': ok(data(CardScanResultSchema)), ...common },
        }),
      },
      '/leads/trash': {
        get: op({
          tags: ['Leads'],
          summary: 'Reciclagem: leads apagados nos últimos 30 dias (só o dono ou um administrador)',
          responses: { '200': ok(data(z.array(TrashItemSchema))), ...common },
        }),
        delete: op({
          tags: ['Leads'],
          summary: 'Apagar de vez da reciclagem ({ ids }; sem corpo esvazia tudo)',
          requestBody: body(TrashIdsSchema),
          responses: { '200': ok(data(z.object({ deleted: z.int() }))), ...common },
        }),
      },
      '/leads/trash/restore': {
        post: op({
          tags: ['Leads'],
          summary: 'Repor leads apagados, tal como estavam (tarefas, pagamentos, reuniões, horas, linha do tempo…)',
          requestBody: body(TrashIdsSchema),
          responses: { '200': ok(data(z.object({ lead_ids: z.array(z.uuid()) }))), ...common },
        }),
      },
      '/custom-fields': {
        get: op({ tags: ['Leads'], summary: 'Campos personalizados dos leads', responses: { '200': ok(data(z.array(CustomFieldSchema))), ...common } }),
        post: op({
          tags: ['Leads'],
          summary: 'Novo campo personalizado (texto, número, sim/não ou escolha); só o dono ou um administrador',
          requestBody: body(CustomFieldCreateSchema),
          responses: { '201': ok(data(CustomFieldSchema)), ...common },
        }),
      },
      '/custom-fields/{id}': {
        patch: op({
          tags: ['Leads'],
          summary: 'Mudar o nome, as opções ou a ordem de um campo personalizado',
          requestParams: { path: idParam },
          requestBody: body(CustomFieldUpdateSchema),
          responses: { '200': ok(data(CustomFieldSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Leads'],
          summary: 'Apagar um campo personalizado (e os valores dele em todos os leads)',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound },
        }),
      },
      '/reschedule': {
        post: op({
          tags: ['Tarefas'],
          summary: 'Mudar o follow-up de vários leads e o prazo de várias tarefas de uma vez (Pôr em dia, Anular)',
          requestBody: body(RescheduleSchema),
          responses: { '200': ok(data(RescheduleResultSchema)), ...common },
        }),
      },
      '/notes': {
        get: op({
          tags: ['Leads'],
          summary: 'Pesquisa rápida no texto das notas e chamadas registadas (Ctrl+K)',
          requestParams: { query: NoteSearchQuerySchema },
          responses: { '200': ok(data(z.array(NoteSearchResultSchema))), ...common },
        }),
      },
      '/tasks': {
        get: op({
          tags: ['Tarefas'],
          summary: 'Com ?q=: pesquisa rápida nas tarefas (Ctrl+K). Sem q: tarefas por fazer de todos os leads (página Tarefas), filtradas por responsável',
          requestParams: { query: TaskListQuerySchema.extend({ q: TaskSearchQuerySchema.shape.q.optional() }) },
          responses: { '200': ok(data(z.union([z.array(TaskListItemSchema), z.array(TaskSearchResultSchema)]))), ...common },
        }),
      },
      '/notifications': {
        get: op({
          tags: ['Equipa'],
          summary: 'Os meus avisos (tarefas, @menções, lembretes, respostas, emails abertos…) e quantos estão por ler',
          responses: { '200': ok(NotificationListSchema), ...common },
        }),
        delete: op({
          tags: ['Equipa'],
          summary: 'Limpar o sino: ?which=read (só os lidos, por omissão) ou ?which=all (todos)',
          requestParams: { query: NotificationClearQuerySchema },
          responses: { '200': ok(data(z.object({ deleted: z.int() }))), ...common },
        }),
      },
      '/notifications/{id}': {
        delete: op({
          tags: ['Equipa'],
          summary: 'Apagar um aviso',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound },
        }),
      },
      '/notifications/read': {
        post: op({
          tags: ['Equipa'],
          summary: 'Marcar avisos como lidos ({ ids } ou { all: true })',
          requestBody: body(NotificationReadSchema),
          responses: { '200': ok(data(z.object({ updated: z.int() }))), ...common },
        }),
      },
      '/tasks/{id}': {
        patch: op({
          tags: ['Tarefas'],
          summary: 'Editar, concluir ({ done: true }) ou reabrir uma tarefa',
          requestParams: { path: idParam },
          requestBody: body(LeadTaskUpdateSchema),
          responses: { '200': ok(data(LeadTaskSchema)), ...withNotFound },
        }),
        delete: op({ tags: ['Tarefas'], summary: 'Apagar tarefa', requestParams: { path: idParam }, responses: { '204': { description: 'Apagada' }, ...withNotFound } }),
      },
      '/task-templates': {
        get: op({ tags: ['Tarefas'], summary: 'Listas-modelo de tarefas', responses: { '200': ok(data(z.array(TaskTemplateSchema))), ...common } }),
        post: op({
          tags: ['Tarefas'],
          summary: 'Nova lista-modelo',
          requestBody: body(TaskTemplateCreateSchema),
          responses: { '201': ok(data(TaskTemplateSchema), 'Criada'), ...common },
        }),
      },
      '/task-templates/{id}': {
        patch: op({
          tags: ['Tarefas'],
          summary: 'Editar lista-modelo',
          requestParams: { path: idParam },
          requestBody: body(TaskTemplateUpdateSchema),
          responses: { '200': ok(data(TaskTemplateSchema)), ...withNotFound },
        }),
        delete: op({ tags: ['Tarefas'], summary: 'Apagar lista-modelo', requestParams: { path: idParam }, responses: { '204': { description: 'Apagada' }, ...withNotFound } }),
      },
      '/leads/{id}/ai-email': {
        post: op({
          tags: ['Email com IA'],
          summary: 'Rascunho de email escrito pela IA com os dados do lead',
          description: 'Usa os dados do lead, a última análise do site, os argumentos do setor e a assinatura. Pode demorar até 30 s.',
          requestParams: { path: leadId },
          requestBody: body(AiEmailRequestSchema),
          responses: {
            '200': ok(data(AiEmailResultSchema)),
            '503': problem('ANTHROPIC_API_KEY em falta ou inválida'),
            ...withNotFound,
          },
        }),
      },
      '/mail-account': {
        get: op({
          tags: ['Email'],
          summary: 'Conta de envio do utilizador (sem a palavra-passe), ou null',
          responses: { '200': ok(data(MailAccountSchema.nullable())), ...common },
        }),
        put: op({
          tags: ['Email'],
          summary: 'Ligar ou mudar a conta de envio (Gmail, Hostinger ou outro SMTP)',
          description: 'A palavra-passe fica cifrada no servidor; vazia = manter a atual.',
          requestBody: body(MailAccountUpsertSchema),
          responses: { '200': ok(data(MailAccountSchema)), ...common },
        }),
        delete: op({ tags: ['Email'], summary: 'Desligar a conta de envio', responses: { '204': { description: 'Desligada' }, ...common } }),
      },
      '/mail-account/test': {
        post: op({
          tags: ['Email'],
          summary: 'Enviar um email de teste para o próprio',
          responses: { '200': ok(data(z.object({ sent_to: z.string() }))), '422': problem('Sem conta ou palavra-passe recusada'), ...common },
        }),
      },
      '/leads/{id}/follow-up-draft': {
        get: op({
          tags: ['Email'],
          summary: 'O próximo follow-up da sequência, já escrito (modelo do passo preenchido, "Re:" do último email)',
          description: 'Enviar com `POST /leads/{id}/email` (com `in_reply_to`): conta como follow-up feito e agenda o passo seguinte.',
          requestParams: { path: idParam },
          responses: { '200': ok(data(FollowUpDraftSchema)), '422': problem('O lead não está "Contactado"'), ...withNotFound },
        }),
      },
      '/leads/{id}/diagnosis-pdf': {
        get: op({
          tags: ['Leads'],
          summary: 'Relatório de diagnóstico do site em PDF (a partir da última análise; ?download=1 para descarregar)',
          requestParams: { path: idParam },
          responses: { '200': { description: 'PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, '422': problem('Sem análise do site ou relatório desligado'), ...withNotFound },
        }),
      },
      '/leads/{id}/payments': {
        get: op({ tags: ['Projetos'], summary: 'Pagamentos do cliente', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(LeadPaymentSchema))), ...withNotFound } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Acrescentar um pagamento (com `paid_on` fica já pago e regista "Pagamento recebido")',
          requestParams: { path: idParam },
          requestBody: body(LeadPaymentCreateSchema),
          responses: { '201': ok(data(LeadPaymentSchema), 'Criado'), ...withNotFound },
        }),
      },
      '/leads/{id}/payments/plan': {
        post: op({
          tags: ['Projetos'],
          summary: 'Criar um plano de pagamentos (ex.: split [50, 50] = sinal hoje + entrega)',
          requestParams: { path: idParam },
          requestBody: body(PaymentPlanSchema),
          responses: { '201': ok(data(z.array(LeadPaymentSchema)), 'Criado'), ...withNotFound },
        }),
      },
      '/payments/{id}': {
        patch: op({ tags: ['Projetos'], summary: 'Mudar ou marcar como pago', requestParams: { path: idParam }, requestBody: body(LeadPaymentUpdateSchema), responses: { '200': ok(data(LeadPaymentSchema)), ...withNotFound } }),
        delete: op({ tags: ['Projetos'], summary: 'Apagar um pagamento', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, ...withNotFound } }),
      },
      '/projects/reconnect': {
        get: op({
          tags: ['Projetos'],
          summary: 'Clientes antigos para voltar a contactar (último projeto concluído há mais de N meses, sem projeto em curso nem contacto recente)',
          requestParams: { query: ReconnectQuerySchema },
          responses: { '200': ok(data(z.array(ReconnectClientSchema))), ...common },
        }),
      },
      '/projects': {
        get: op({
          tags: ['Projetos'],
          summary: 'Clientes com o projeto em curso (ou concluídos), com tarefas, pagamentos e próxima reunião',
          requestParams: { query: ProjectsQuerySchema },
          responses: { '200': ok(data(z.array(ProjectSchema))), ...common },
        }),
      },
      '/leads/{id}/project': {
        get: op({ tags: ['Projetos'], summary: 'Prazo, fase, revisões incluídas e link do cliente', requestParams: { path: idParam }, responses: { '200': ok(data(ProjectInfoSchema)), ...withNotFound } }),
        patch: op({
          tags: ['Projetos'],
          summary: 'Mudar o prazo, a fase (regista "Fase do projeto") ou as revisões incluídas',
          requestParams: { path: idParam },
          requestBody: body(ProjectInfoUpdateSchema),
          responses: { '200': ok(data(ProjectInfoSchema)), ...withNotFound },
        }),
        post: op({
          tags: ['Projetos'],
          summary: 'Concluir ou reabrir o projeto do cliente',
          description: 'Ao concluir: `portfolio_task` cria a tarefa "Juntar o projeto ao portefólio" (daqui a 7 dias) e `upsell_months` a tarefa "Propor um novo serviço" (daqui a N meses).',
          requestParams: { path: idParam },
          requestBody: body(ProjectCompleteSchema),
          responses: { '200': ok(data(LeadSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/project/start': {
        post: op({
          tags: ['Projetos'],
          summary: 'Preparar o projeto: prazo e revisões pelos serviços; tarefas das listas e plano de pagamentos, se ainda não houver',
          description: 'É o que acontece sozinho quando o lead passa a "Cliente" (Definições → Funcionalidades → Arranque automático).',
          requestParams: { path: idParam },
          responses: { '200': ok(data(ProjectStartResultSchema)), '422': problem('Lead arquivado ou anonimizado'), ...withNotFound },
        }),
      },
      '/leads/{id}/project/share': {
        post: op({
          tags: ['Projetos'],
          summary: 'Ligar, desligar ou renovar o link da página de acompanhamento do cliente (/p/{share_token})',
          requestParams: { path: idParam },
          requestBody: body(ProjectShareSchema),
          responses: { '200': ok(data(ProjectInfoSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/contracts': {
        get: op({ tags: ['Contratos'], summary: 'Contratos do lead', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(LeadContractSchema))), ...withNotFound } }),
        post: op({
          tags: ['Contratos'],
          summary: 'Gerar um contrato a partir da proposta (objeto, prazo, revisões, valor, pagamentos e condições gerais)',
          requestParams: { path: idParam },
          requestBody: body(ContractCreateSchema),
          responses: { '201': ok(data(LeadContractSchema), 'Criado'), ...withNotFound },
        }),
      },
      '/contracts/{id}': {
        patch: op({
          tags: ['Contratos'],
          summary: 'Editar o título ou as cláusulas (só até o cliente aceitar)',
          requestParams: { path: idParam },
          requestBody: body(ContractUpdateSchema),
          responses: { '200': ok(data(LeadContractSchema)), '422': problem('Contrato já aceite'), ...withNotFound },
        }),
        delete: op({ tags: ['Contratos'], summary: 'Apagar (só se não tiver sido aceite)', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, '422': problem('Contrato já aceite'), ...withNotFound } }),
      },
      '/contracts/{id}/sent': {
        post: op({ tags: ['Contratos'], summary: 'Marcar como enviado (regista "Contrato enviado")', requestParams: { path: idParam }, responses: { '200': ok(data(LeadContractSchema)), ...withNotFound } }),
      },
      '/contracts/{id}/pdf': {
        get: op({ tags: ['Contratos'], summary: 'O contrato em PDF (?download=1 para descarregar)', requestParams: { path: idParam }, responses: { '200': { description: 'application/pdf' }, ...withNotFound } }),
      },
      '/public/contracts/{token}/pdf': {
        get: op({
          tags: ['Contratos'],
          summary: 'O contrato em PDF, para o cliente (sem sessão)',
          security: [],
          requestParams: { path: z.object({ token: z.string() }) },
          responses: { '200': { description: 'application/pdf' }, '404': problem('Link inexistente') },
        }),
      },
      '/public/t/{token}/{n}': {
        get: op({
          tags: ['Email'],
          summary: 'Aberturas e cliques dos emails (sem sessão): "o.gif" é a imagem de 1×1; um número segue para esse link do email',
          security: [],
          requestParams: { path: z.object({ token: z.string(), n: z.string() }) },
          responses: { '200': { description: 'Imagem GIF de 1×1' }, '302': { description: 'Segue para o link original' }, '404': problem('Link desconhecido') },
        }),
      },
      '/leads/{id}/launch': {
        get: op({
          tags: ['Projetos'],
          summary: 'Checklist de lançamento do site do cliente',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LaunchChecklistSchema)), ...withNotFound },
        }),
        patch: op({
          tags: ['Projetos'],
          summary: 'Endereço do site novo e pontos marcados à mão',
          requestParams: { path: leadId },
          requestBody: body(LaunchChecklistUpdateSchema),
          responses: { '200': ok(data(LaunchChecklistSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/launch/check': {
        post: op({
          tags: ['Projetos'],
          summary: 'Verificar sozinho o site novo (HTTPS, telemóvel, SEO, favicon, 404, sitemap, robots, estatísticas, privacidade, PageSpeed)',
          requestParams: { path: leadId },
          responses: { '200': ok(data(LaunchChecklistSchema)), '422': problem('Sem endereço, ou o site não abre'), ...withNotFound },
        }),
      },
      '/me/sessions': {
        get: op({
          tags: ['Conta'],
          summary: 'Sessões abertas da conta (aparelho, IP, última atividade, se entrou com o código)',
          responses: { '200': ok(data(z.array(UserSessionSchema))), ...common },
        }),
      },
      '/me/sessions/{id}': {
        delete: op({
          tags: ['Conta'],
          summary: 'Terminar uma sessão (o aparelho deixa de entrar ao fim de, no máximo, 1 hora)',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Terminada' }, ...withNotFound },
        }),
      },
      '/leads/{id}/collaborators': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Colaboradores convidados para o projeto',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(ProjectCollaboratorSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Colaboradores'],
          summary: 'Convidar um colaborador por email (só vê as tarefas, entregas, briefing e as próprias horas do projeto)',
          requestParams: { path: leadId },
          requestBody: body(CollaboratorInviteSchema),
          responses: {
            '201': ok(data(z.object({ collaborator: ProjectCollaboratorSchema, emailed: z.boolean() })), 'Convidado'),
            '409': problem('Este email já foi convidado'),
            ...withNotFound,
          },
        }),
      },
      '/team': {
        get: op({ tags: ['Equipa'], summary: 'Membros da equipa e convites por aceitar (dono ou administrador)', responses: { '200': ok(data(TeamSchema)), ...common } }),
      },
      '/team/names': {
        get: op({
          tags: ['Equipa'],
          summary: 'Nomes e papéis dos membros (para o responsável de um lead)',
          responses: { '200': ok(data(z.array(z.object({ user_id: z.uuid(), name: z.string(), role: z.enum(MEMBER_ROLES), avatar_url: z.string().nullable() })))), ...common },
        }),
      },
      '/team/activity': {
        get: op({
          tags: ['Equipa'],
          summary: 'O que cada pessoa fez nos leads (dono ou administrador)',
          requestParams: { query: TeamActivityQuerySchema },
          responses: { '200': ok(data(z.array(TeamActivitySchema))), ...common },
        }),
      },
      '/team/invites': {
        post: op({
          tags: ['Equipa'],
          summary: 'Convidar para a equipa (prospetor: só a parte comercial; administrador: tudo)',
          requestBody: body(TeamInviteCreateSchema),
          responses: { '201': ok(data(z.object({ invite: TeamInviteSchema, emailed: z.boolean() })), 'Criado'), '409': problem('Já há um convite por aceitar'), ...common },
        }),
      },
      '/team/invites/{id}': {
        delete: op({ tags: ['Equipa'], summary: 'Anular um convite por aceitar', requestParams: { path: idParam }, responses: { '204': { description: 'Anulado' }, ...withNotFound } }),
      },
      '/team/members/{userId}': {
        patch: op({
          tags: ['Equipa'],
          summary: 'Mudar o papel de um membro',
          requestParams: { path: z.object({ userId: z.uuid() }) },
          requestBody: body(TeamMemberUpdateSchema),
          responses: { '204': { description: 'Alterado' }, ...withNotFound },
        }),
        delete: op({
          tags: ['Equipa'],
          summary: 'Remover da equipa (perde logo o acesso; os leads dele ficam sem responsável)',
          requestParams: { path: z.object({ userId: z.uuid() }) },
          responses: { '204': { description: 'Removido' }, ...withNotFound },
        }),
      },
      '/team-invites/{token}/claim': {
        post: op({ tags: ['Equipa'], summary: 'Aceitar o convite da equipa com a conta já aberta (mesmo email)', requestParams: { path: z.object({ token: z.string() }) }, responses: { '204': { description: 'Aceite' }, ...withNotFound } }),
      },
      '/public/team-invites/{token}/accept': {
        post: op({
          tags: ['Equipa'],
          summary: 'Aceitar o convite da equipa criando a conta (sem sessão)',
          requestParams: { path: z.object({ token: z.string() }) },
          requestBody: body(TeamAcceptSchema),
          responses: { '200': ok(data(z.object({ email: z.string() }))), '409': problem('Já existe conta com este email'), '404': problem('Convite não encontrado') },
        }),
      },
      '/site-form': {
        post: op({
          tags: ['Leads'],
          summary: 'Ligar/desligar o formulário do site (ou trocar o código)',
          description: 'Devolve { token }; o endereço público é /api/v1/public/forms/{token}. Dono ou administrador.',
          requestBody: body(SiteFormToggleSchema),
          responses: { '200': ok(data(z.object({ token: z.string().nullable() }))), ...common },
        }),
      },
      '/public/forms/{token}': {
        post: op({
          tags: ['Leads'],
          summary: 'Formulário do site: cria o lead, a tarefa "Responder hoje" e avisa (sem sessão)',
          description:
            'Aceita JSON, multipart ou formulário HTML (nome, email, telefone, empresa, mensagem, site, servico; _gotcha = campo escondido contra robôs; _next = página para onde voltar). CORS aberto. Até 5 pedidos por 10 minutos por endereço.',
          requestParams: { path: z.object({ token: z.string() }) },
          responses: {
            '200': ok(z.object({ ok: z.boolean(), message: z.string() }), 'Pedido recebido'),
            '404': problem('Formulário desconhecido ou desligado'),
            '422': problem('Falta o email ou o telefone'),
            '429': problem('Demasiados pedidos'),
          },
        }),
      },
      '/stats/lost-reasons': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Leads em "Sem interesse" por motivo (preço, já tem site, agora não, não responde, respondeu que não, outro)',
          responses: { '200': ok(data(z.array(LostReasonCountSchema))), ...common },
        }),
      },
      '/replies': {
        get: op({
          tags: ['Email'],
          summary: 'Respostas dos leads (caixa de entrada) dos últimos N dias e se ainda falta responder',
          requestParams: { query: RepliesQuerySchema },
          responses: { '200': ok(data(RepliesSchema)), ...common },
        }),
      },
      '/leads/{id}/replies/handled': {
        post: op({
          tags: ['Email'],
          summary: '"Já tratei": as respostas recebidas até agora deixam de estar por responder (ex.: respondeu-se pelo Gmail)',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.object({ handled_at: z.string() }))), ...withNotFound },
        }),
      },
      '/stats/emails': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Emails enviados pela plataforma: abertura, clique e resposta por modelo, e quando são abertos (dia e hora)',
          requestParams: { query: EmailStatsQuerySchema },
          responses: { '200': ok(data(EmailStatsSchema)), ...common },
        }),
      },
      '/stats/compare': {
        get: op({
          tags: ['Dashboard'],
          summary: 'Este mês (ou semana) até hoje contra o anterior até ao mesmo dia: leads novos, contactos, respostas, reuniões, propostas, clientes e recebido',
          requestParams: { query: PeriodCompareQuerySchema },
          responses: { '200': ok(data(PeriodCompareSchema)), ...common },
        }),
      },
      '/stats/team': {
        get: op({ tags: ['Equipa'], summary: 'Trabalho de cada pessoa nos últimos 30 dias (o prospetor só vê o seu)', responses: { '200': ok(data(TeamStatsSchema)), ...common } }),
      },
      '/collaborators': {
        get: op({
          tags: ['Projetos'],
          summary: 'Todos os colaboradores, por pessoa: projetos, estado do convite e horas registadas',
          responses: { '200': ok(data(z.array(CollaboratorPersonSchema))), ...common },
        }),
      },
      '/collaborators/{id}': {
        delete: op({
          tags: ['Colaboradores'],
          summary: 'Remover um colaborador (perde logo o acesso)',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Removido' }, ...withNotFound },
        }),
      },
      '/public/invites/{token}/accept': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Aceitar o convite sem conta: cria a conta do colaborador (sem sessão)',
          security: [],
          requestParams: { path: z.object({ token: z.string() }) },
          requestBody: body(CollaboratorAcceptSchema),
          responses: { '200': { description: 'Conta criada' }, '404': problem('Convite inexistente'), '409': problem('Já existe conta com este email') },
        }),
      },
      '/collab/invites/{token}/claim': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Aceitar o convite com a conta já aberta (o email tem de ser o do convite)',
          requestParams: { path: z.object({ token: z.string() }) },
          responses: { '204': { description: 'Aceite' }, '403': problem('Outro email'), '404': problem('Convite inexistente') },
        }),
      },
      '/collab/projects': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: os projetos em que colabora',
          responses: { '200': ok(data(z.array(CollabProjectSummarySchema))), ...common },
        }),
      },
      '/collab/projects/{leadId}': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: tarefas, entregas, briefing e as próprias horas',
          requestParams: { path: z.object({ leadId: z.uuid() }) },
          responses: { '200': ok(data(CollabProjectSchema)), ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/tasks': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: acrescentar uma tarefa',
          requestParams: { path: z.object({ leadId: z.uuid() }) },
          requestBody: body(LeadTaskCreateSchema),
          responses: { '204': { description: 'Criada' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/tasks/{taskId}': {
        patch: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: marcar uma tarefa como feita (ou por fazer)',
          requestParams: { path: z.object({ leadId: z.uuid(), taskId: z.uuid() }) },
          requestBody: body(z.object({ done: z.boolean() })),
          responses: { '204': { description: 'Atualizada' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/deliverables': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: juntar um ficheiro ou link (fica "Por enviar")',
          requestParams: { path: z.object({ leadId: z.uuid() }) },
          requestBody: body(ProjectDeliverableCreateSchema),
          responses: { '204': { description: 'Junta' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/time': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: começar ou parar o temporizador',
          requestParams: { path: z.object({ leadId: z.uuid() }) },
          requestBody: body(CollabTimeActionSchema),
          responses: { '204': { description: 'Feito' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/time/manual': {
        post: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: registar horas à mão',
          requestParams: { path: z.object({ leadId: z.uuid() }) },
          requestBody: body(TimeEntryCreateSchema),
          responses: { '204': { description: 'Registado' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/briefing/files/{index}': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: ficheiro do briefing (redireciona para um link temporário)',
          requestParams: { path: z.object({ leadId: z.uuid(), index: z.string() }) },
          responses: { '302': { description: 'Link temporário' }, ...withNotFound },
        }),
      },
      '/leads/{id}/client-projects': {
        get: op({
          tags: ['Projetos'],
          summary: 'Todos os projetos do cliente (o registo principal e os projetos novos ligados)',
          requestParams: { path: leadId },
          responses: { '200': ok(data(ClientProjectsSchema)), ...withNotFound },
        }),
        post: op({
          tags: ['Projetos'],
          summary: 'Novo projeto para um cliente que volta: registo próprio (tarefas, pagamentos, horas, contrato), já preparado',
          requestParams: { path: leadId },
          requestBody: body(ClientProjectCreateSchema),
          responses: { '201': ok(data(LeadSchema), 'Criado'), ...withNotFound },
        }),
      },
      '/leads/{id}/brand-kit': {
        get: op({
          tags: ['Projetos'],
          summary: 'Kit da marca do cliente (logótipos, cores, tipos de letra, links); o mesmo em todos os projetos dele',
          requestParams: { path: leadId },
          responses: { '200': ok(data(BrandKitSchema)), ...withNotFound },
        }),
        patch: op({
          tags: ['Projetos'],
          summary: 'Atualizar cores, tipos de letra, links e notas do kit da marca',
          requestParams: { path: leadId },
          requestBody: body(BrandKitUpdateSchema),
          responses: { '200': ok(data(BrandKitSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/brand-kit/files': {
        post: op({
          tags: ['Projetos'],
          summary: 'Juntar ficheiros ao kit da marca (multipart, campo "files"; até 30 ficheiros de 25 MB)',
          requestParams: { path: leadId },
          responses: { '201': ok(data(BrandKitSchema)), '422': problem('Sem ficheiros, demasiados ou demasiado grandes'), ...withNotFound },
        }),
      },
      '/leads/{id}/brand-kit/files/{index}': {
        get: op({
          tags: ['Projetos'],
          summary: 'Descarregar um ficheiro do kit (redireciona para um link temporário)',
          requestParams: { path: z.object({ id: z.uuid(), index: z.string() }) },
          responses: { '302': { description: 'Link temporário' }, ...withNotFound },
        }),
        delete: op({
          tags: ['Projetos'],
          summary: 'Apagar um ficheiro do kit',
          requestParams: { path: z.object({ id: z.uuid(), index: z.string() }) },
          responses: { '200': ok(data(BrandKitSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/accesses': {
        get: op({
          tags: ['Projetos'],
          summary: 'Acessos do cliente (domínio, alojamento, redes) — sem as palavras-passe',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(LeadAccessSchema))), ...withNotFound },
        }),
        post: op({
          tags: ['Projetos'],
          summary: 'Novo acesso (a palavra-passe fica cifrada no servidor)',
          requestParams: { path: leadId },
          requestBody: body(LeadAccessUpsertSchema),
          responses: { '201': ok(data(LeadAccessSchema), 'Criado'), ...withNotFound },
        }),
      },
      '/accesses/{id}': {
        patch: op({
          tags: ['Projetos'],
          summary: 'Editar um acesso (secret vazio mantém a palavra-passe; null apaga-a)',
          requestParams: { path: idParam },
          requestBody: body(LeadAccessUpsertSchema),
          responses: { '200': ok(data(LeadAccessSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Projetos'],
          summary: 'Apagar um acesso',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, ...withNotFound },
        }),
      },
      '/accesses/{id}/secret': {
        get: op({
          tags: ['Projetos'],
          summary: 'A palavra-passe de um acesso, em claro (para mostrar ou copiar)',
          requestParams: { path: idParam },
          responses: { '200': ok(data(z.object({ secret: z.string().nullable() }))), ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/brand-files/{index}': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: ficheiro do kit da marca (redireciona para um link temporário)',
          requestParams: { path: z.object({ leadId: z.uuid(), index: z.string() }) },
          responses: { '302': { description: 'Link temporário' }, ...withNotFound },
        }),
      },
      '/collab/projects/{leadId}/accesses/{id}/secret': {
        get: op({
          tags: ['Colaboradores'],
          summary: 'Portal do colaborador: palavra-passe de um acesso partilhado com os colaboradores',
          requestParams: { path: z.object({ leadId: z.uuid(), id: z.uuid() }) },
          responses: { '200': ok(data(z.object({ secret: z.string().nullable() }))), ...withNotFound },
        }),
      },
      '/share': {
        post: op({
          tags: ['Leads'],
          summary: 'Interpretar um link partilhado do telemóvel (Google Maps, Instagram, Facebook ou site) num lead por gravar',
          description: 'Resolve links curtos do Maps e lê o site (nome, telefone, email). Com GOOGLE_PLACES_API_KEY pede também telefone e site à Google.',
          requestBody: body(SharePayloadSchema),
          responses: { '200': ok(data(SharedLeadDraftSchema)), ...common },
        }),
      },
      '/prospecting': {
        get: op({
          tags: ['Leads'],
          summary: 'Sessão de prospeção: leads a contactar agora (abriram o email, follow-ups, por contactar)',
          requestParams: { query: ProspectingQuerySchema },
          responses: { '200': ok(data(ProspectingQueueSchema)), ...common },
        }),
      },
      '/leads/{id}/prospecting': {
        post: op({
          tags: ['Leads'],
          summary: 'Registar o resultado de um contacto (não atendeu, contactado, interessado, mais tarde, sem interesse)',
          requestParams: { path: leadId },
          requestBody: body(ProspectingOutcomeSchema),
          responses: { '200': ok(data(ProspectingResultSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/email-tracking': {
        get: op({
          tags: ['Email'],
          summary: 'Emails enviados pela plataforma ao lead, com aberturas e cliques',
          requestParams: { path: leadId },
          responses: { '200': ok(data(z.array(EmailTrackingSchema))), ...withNotFound },
        }),
      },
      '/public/contracts/{token}/accept': {
        post: op({
          tags: ['Contratos'],
          summary: 'O cliente aceita o contrato (sem sessão): nome, data e hora e IP ficam registados',
          security: [],
          requestParams: { path: z.object({ token: z.string() }) },
          requestBody: body(ContractAcceptSchema),
          responses: { '200': { description: 'Aceite' }, '404': problem('Link inexistente'), '422': problem('Falta o nome ou a confirmação') },
        }),
      },
      '/public/projects/{token}/deliverables/{id}': {
        post: op({
          tags: ['Projetos'],
          summary: 'Na página do cliente (sem sessão): aprovar uma entrega ou pedir alterações (cria uma revisão)',
          security: [],
          requestParams: { path: z.object({ token: z.string(), id: z.uuid() }) },
          requestBody: body(ClientDeliverableActionSchema),
          responses: { '200': { description: 'Respondido' }, '404': problem('Página ou entrega inexistente'), '409': problem('Já respondida') },
        }),
      },
      '/leads/{id}/expenses': {
        get: op({ tags: ['Projetos'], summary: 'Despesas do projeto', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(ProjectExpenseSchema))), ...withNotFound } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Registar uma despesa (alojamento, plugins, fotos, impressão…)',
          requestParams: { path: idParam },
          requestBody: body(ProjectExpenseCreateSchema),
          responses: { '201': ok(data(ProjectExpenseSchema), 'Criada'), ...withNotFound },
        }),
      },
      '/expenses/{id}': {
        delete: op({ tags: ['Projetos'], summary: 'Apagar uma despesa', requestParams: { path: idParam }, responses: { '204': { description: 'Apagada' }, ...withNotFound } }),
      },
      '/leads/{id}/briefing': {
        get: op({ tags: ['Projetos'], summary: 'Briefing do projeto (null se ainda não foi pedido)', requestParams: { path: idParam }, responses: { '200': ok(data(ProjectBriefingSchema.nullable())), ...withNotFound } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Criar o link do briefing (/b/{token}) com as perguntas das Definições, ou voltar a pedi-lo',
          requestParams: { path: idParam },
          responses: { '201': ok(data(ProjectBriefingSchema), 'Criado'), ...withNotFound },
        }),
        delete: op({ tags: ['Projetos'], summary: 'Apagar o briefing e os ficheiros enviados', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, ...withNotFound } }),
      },
      '/leads/{id}/briefing/files/{index}': {
        get: op({
          tags: ['Projetos'],
          summary: 'Descarregar um ficheiro do briefing (redireciona para um link temporário de 10 minutos)',
          requestParams: { path: z.object({ id: z.uuid(), index: z.string() }) },
          responses: { '302': { description: 'Link temporário' }, ...withNotFound },
        }),
      },
      '/public/briefings/{token}': {
        post: op({
          tags: ['Projetos'],
          summary: 'O cliente envia o briefing (sem sessão; multipart: answer_0, answer_1…, files — até 10 ficheiros de 15 MB)',
          security: [],
          requestParams: { path: z.object({ token: z.string() }) },
          responses: { '200': { description: 'Recebido' }, '404': problem('Link inexistente'), '422': problem('Sem respostas ou ficheiros a mais') },
        }),
      },
      '/calendar-feed': {
        get: op({ tags: ['Projetos'], summary: 'O meu link do calendário subscrito (token null = desligado)', responses: { '200': ok(data(CalendarFeedSchema)), ...common } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Criar, renovar ou desligar o link do calendário subscrito',
          requestBody: body(CalendarFeedUpdateSchema),
          responses: { '200': ok(data(CalendarFeedSchema)), ...common },
        }),
      },
      '/calendar/{token}.ics': {
        get: op({
          tags: ['Projetos'],
          summary: 'Calendário subscrito (iCalendar, sem sessão): reuniões, entregas, pagamentos previstos e tarefas',
          description: 'Para o Google Calendar ("A partir do URL"), o iPhone (webcal://) ou o Outlook. O código secreto é a autorização.',
          security: [],
          requestParams: { path: z.object({ token: z.string() }) },
          responses: { '200': { description: 'text/calendar' }, '404': problem('Link inexistente ou desligado') },
        }),
      },
      '/stats/profitability': {
        get: op({
          tags: ['Projetos'],
          summary: 'Rentabilidade: €/hora por serviço e por cliente, horas e valor recebido por mês, duração média dos projetos',
          responses: { '200': ok(data(ProfitabilitySchema)), ...common },
        }),
      },
      '/projects/calendar': {
        get: op({
          tags: ['Projetos'],
          summary: 'Calendário: prazos de entrega, reuniões, pagamentos previstos e tarefas (máx. 62 dias); followups=true junta as próximas ações dos leads',
          requestParams: { query: CalendarQuerySchema },
          responses: { '200': ok(data(z.array(CalendarEventSchema))), ...common },
        }),
      },
      '/leads/{id}/revisions': {
        get: op({ tags: ['Projetos'], summary: 'Rondas de revisão pedidas pelo cliente', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(ProjectRevisionSchema))), ...withNotFound } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Registar uma revisão (sem `billable`: a cobrar à parte quando já passou das incluídas)',
          requestParams: { path: idParam },
          requestBody: body(ProjectRevisionCreateSchema),
          responses: { '201': ok(data(ProjectRevisionSchema), 'Criada'), ...withNotFound },
        }),
      },
      '/revisions/{id}': {
        delete: op({ tags: ['Projetos'], summary: 'Apagar uma revisão', requestParams: { path: idParam }, responses: { '204': { description: 'Apagada' }, ...withNotFound } }),
      },
      '/leads/{id}/find-contacts': {
        post: op({
          tags: ['Leads'],
          summary: 'Procurar telefone e email do lead no site, na página de contactos e no Google Maps (não guarda nada)',
          requestParams: { path: idParam },
          responses: { '200': ok(data(ContactFindingsSchema)), ...withNotFound },
        }),
      },
      '/leads/{id}/time': {
        get: op({ tags: ['Projetos'], summary: 'Horas registadas, total, temporizador e valor por hora', requestParams: { path: idParam }, responses: { '200': ok(data(ProjectTimeSchema)), ...withNotFound } }),
        post: op({ tags: ['Projetos'], summary: 'Registar horas à mão', requestParams: { path: idParam }, requestBody: body(TimeEntryCreateSchema), responses: { '201': ok(data(TimeEntrySchema), 'Criado'), ...withNotFound } }),
        delete: op({
          tags: ['Projetos'],
          summary: 'Pôr as horas do projeto a zero (apaga todos os registos; para o temporizador e o pomodoro)',
          requestParams: { path: idParam },
          responses: { '200': ok(data(z.object({ deleted: z.int() }))), ...withNotFound },
        }),
      },
      '/leads/{id}/time/start': {
        post: op({
          tags: ['Projetos'],
          summary: 'Pôr o temporizador a contar (para o que estiver a contar noutro projeto)',
          requestParams: { path: idParam },
          requestBody: body(TimeStartSchema),
          responses: { '201': ok(data(TimeEntrySchema), 'A contar'), ...withNotFound },
        }),
      },
      '/time/stop': {
        post: op({ tags: ['Projetos'], summary: 'Pausar o meu temporizador (o tempo fica registado; "start" continua a somar)', responses: { '200': ok(data(TimeEntrySchema.nullable())), ...common } }),
      },
      '/pomodoro': {
        get: op({ tags: ['Projetos'], summary: 'O meu pomodoro em curso (null = nenhum); avança as fases que já acabaram', responses: { '200': ok(data(PomodoroSchema)), ...common } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Começar um pomodoro de trabalho num projeto (e tarefa), que conta no registo de horas, ou um descanso já (phase: short_break)',
          requestBody: body(PomodoroStartSchema),
          responses: { '201': ok(data(PomodoroSchema)), ...withNotFound },
        }),
      },
      '/pomodoro/action': {
        post: op({
          tags: ['Projetos'],
          summary: 'Pausar, continuar, saltar (acabar já a fase), reiniciar a fase ou parar o pomodoro',
          requestBody: body(PomodoroActionSchema),
          responses: { '200': ok(data(PomodoroSchema)), '404': problem('Sem pomodoro a decorrer'), ...common },
        }),
      },
      '/stats/pomodoros': {
        get: op({ tags: ['Projetos'], summary: 'Os meus pomodoros: hoje, últimos 7 dias, por dia (14 dias) e por projeto', responses: { '200': ok(data(PomodoroStatsSchema)), ...common } }),
      },
      '/time/running': {
        get: op({ tags: ['Projetos'], summary: 'O meu temporizador a contar (com o projeto), ou null', responses: { '200': ok(data(RunningTimerSchema)), ...common } }),
      },
      '/time-entries/{id}': {
        patch: op({
          tags: ['Projetos'],
          summary: 'Corrigir um registo de horas (dia, minutos, notas); mantém a hora de início',
          requestParams: { path: idParam },
          requestBody: body(TimeEntryUpdateSchema),
          responses: { '200': ok(data(TimeEntrySchema)), '422': problem('O temporizador ainda está a contar'), ...withNotFound },
        }),
        delete: op({ tags: ['Projetos'], summary: 'Apagar um registo de horas', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, ...withNotFound } }),
      },
      '/leads/{id}/deliverables': {
        get: op({ tags: ['Projetos'], summary: 'Ficheiros e entregas do projeto', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(ProjectDeliverableSchema))), ...withNotFound } }),
        post: op({
          tags: ['Projetos'],
          summary: 'Acrescentar um ficheiro ou entrega (link do Drive, Figma, Canva…)',
          requestParams: { path: idParam },
          requestBody: body(ProjectDeliverableCreateSchema),
          responses: { '201': ok(data(ProjectDeliverableSchema), 'Criada'), ...withNotFound },
        }),
      },
      '/deliverables/{id}': {
        patch: op({
          tags: ['Projetos'],
          summary: 'Mudar o nome, o link ou o estado (regista "Entrega enviada" / "Entrega aprovada")',
          requestParams: { path: idParam },
          requestBody: body(ProjectDeliverableUpdateSchema),
          responses: { '200': ok(data(ProjectDeliverableSchema)), ...withNotFound },
        }),
        delete: op({ tags: ['Projetos'], summary: 'Apagar um ficheiro ou entrega', requestParams: { path: idParam }, responses: { '204': { description: 'Apagado' }, ...withNotFound } }),
      },
      '/dashboard/billing': {
        get: op({ tags: ['Projetos'], summary: 'Faturação: recebido este mês, por receber, em atraso', responses: { '200': ok(data(BillingSummarySchema)), ...common } }),
      },
      '/leads/{id}/meetings': {
        get: op({ tags: ['Reuniões'], summary: 'Reuniões do lead', requestParams: { path: idParam }, responses: { '200': ok(data(z.array(LeadMeetingSchema))), ...withNotFound } }),
        post: op({
          tags: ['Reuniões'],
          summary: 'Marcar uma reunião (o lead passa a "Reunião"; com send_invite, o cliente recebe o convite de calendário)',
          requestParams: { path: idParam },
          requestBody: body(LeadMeetingCreateSchema),
          responses: { '201': ok(data(LeadMeetingResultSchema), 'Marcada'), '422': problem('Sem email ou sem conta de envio'), ...withNotFound },
        }),
      },
      '/meetings/{id}/cancel': {
        post: op({ tags: ['Reuniões'], summary: 'Desmarcar (notify: avisar o cliente que recebeu o convite)', requestParams: { path: idParam }, responses: { '200': ok(data(LeadMeetingSchema)), ...withNotFound } }),
      },
      '/meetings/{id}/ics': {
        get: op({ tags: ['Reuniões'], summary: 'A reunião em .ics (para o próprio calendário)', requestParams: { path: idParam }, responses: { '200': { description: 'iCalendar' }, ...withNotFound } }),
      },
      '/settings/backup': {
        post: op({ tags: ['Definições'], summary: 'Enviar já a cópia de segurança (todos os leads em Excel) por email', responses: { '200': ok(data(z.object({ sent_to: z.string(), leads: z.int() }))), '422': problem('Sem email para enviar'), ...common } }),
      },
      '/mail-account/check-replies': {
        post: op({
          tags: ['Email'],
          summary: 'Ler já a caixa de entrada (IMAP) e registar as respostas dos leads',
          description:
            'Só lê o cabeçalho dos emails novos (remetente, assunto, data). Uma resposta de um lead "Contactado" passa-o a "Respondeu". O cron `/cron/reminders` faz o mesmo de 10 em 10 minutos.',
          responses: { '200': ok(data(ReplyCheckResultSchema)), '422': problem('Deteção desligada ou acesso recusado'), '502': problem('Servidor IMAP inacessível'), ...common },
        }),
      },
      '/leads/{id}/email': {
        post: op({
          tags: ['Email'],
          summary: 'Enviar um email ao lead pela conta do utilizador',
          description:
            'Regista "Email enviado" na linha do tempo; um lead "Identificado" passa a "Contactado" (follow-up agendado). Recusa leads anonimizados, a lista "não contactar" e acima do limite diário.',
          requestParams: { path: leadId },
          requestBody: body(LeadEmailSendSchema),
          responses: {
            '200': ok(data(LeadEmailSendResultSchema)),
            '422': problem('Sem conta de envio, lead anonimizado ou na lista "não contactar"'),
            '429': problem('Limite diário atingido'),
            ...withNotFound,
          },
        }),
      },
      '/proposals/{id}/email': {
        post: op({
          tags: ['Email'],
          summary: 'Enviar a proposta por email, com o PDF em anexo',
          description: 'A proposta fica "Enviada" e o lead avança para "Proposta enviada".',
          requestParams: { path: idParam },
          requestBody: body(LeadEmailSendSchema),
          responses: { '200': ok(data(LeadEmailSendResultSchema)), '429': problem('Limite diário atingido'), ...withNotFound },
        }),
      },
      '/ai-providers': {
        get: op({
          tags: ['Fornecedores de IA'],
          summary: 'Fornecedores de IA (chave do servidor e chaves guardadas; a chave nunca é devolvida)',
          responses: { '200': ok(data(z.array(AiProviderSchema))), ...common },
        }),
        post: op({
          tags: ['Fornecedores de IA'],
          summary: 'Juntar uma chave (Anthropic, OpenAI, OpenRouter ou compatível com a OpenAI) — dono/administrador',
          description: 'A chave fica cifrada no servidor. Escolhe-se onde usar em PATCH /settings (ai.email / ai.lead_generation).',
          requestBody: body(AiProviderCreateSchema),
          responses: { '201': ok(data(AiProviderSchema), 'Criado'), '403': problem('Só o dono ou um administrador'), '409': problem('Nome repetido'), ...common },
        }),
      },
      '/ai-providers/{id}': {
        patch: op({
          tags: ['Fornecedores de IA'],
          summary: 'Mudar o nome, a chave ou o endereço',
          requestParams: { path: idParam },
          requestBody: body(AiProviderUpdateSchema),
          responses: { '200': ok(data(AiProviderSchema)), '403': problem('Só o dono ou um administrador'), ...withNotFound },
        }),
        delete: op({
          tags: ['Fornecedores de IA'],
          summary: 'Apagar (as funções que o usavam voltam à chave do servidor)',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagado' }, '403': problem('Só o dono ou um administrador'), ...withNotFound },
        }),
      },
      '/ai-providers/{id}/test': {
        post: op({
          tags: ['Fornecedores de IA'],
          summary: 'Confirmar a chave e listar os modelos disponíveis (id "server" = chave do servidor)',
          requestParams: { path: z.object({ id: z.string() }) },
          responses: { '200': ok(data(AiProviderTestResultSchema)), ...withNotFound },
        }),
      },
      '/lead-generation': {
        get: op({
          tags: ['Gerador de leads'],
          summary: 'Últimas pesquisas do gerador de leads',
          responses: { '200': ok(data(z.array(LeadGenerationRunSchema))), ...common },
        }),
        post: op({
          tags: ['Gerador de leads'],
          summary: 'Começar uma pesquisa de empresas com o Claude (pesquisa na internet)',
          description:
            'Responde logo com a pesquisa em `running`; a IA pesquisa durante 1–3 minutos em segundo plano. Consultar `GET /lead-generation/{id}` até `done` ou `error`. Uma pesquisa de cada vez.',
          requestBody: body(LeadGenerationRequestSchema),
          responses: {
            '202': ok(data(LeadGenerationRunSchema), 'Pesquisa começada'),
            '409': problem('Já há uma pesquisa a correr'),
            '503': problem('ANTHROPIC_API_KEY em falta ou inválida'),
            ...common,
          },
        }),
      },
      '/lead-generation/{id}': {
        get: op({
          tags: ['Gerador de leads'],
          summary: 'Estado da pesquisa e empresas encontradas (com duplicados e lista "não contactar" assinalados)',
          requestParams: { path: idParam },
          responses: { '200': ok(data(LeadGenerationRunSchema)), ...withNotFound },
        }),
      },
      '/lead-generation/{id}/add': {
        post: op({
          tags: ['Gerador de leads'],
          summary: 'Criar leads com as empresas escolhidas (pelo índice em `candidates`)',
          description: 'Duplicados e empresas da lista "não contactar" são saltados. Com `audit`, o site de cada lead é analisado em segundo plano e os resultados aplicados.',
          requestParams: { path: idParam },
          requestBody: body(LeadGenerationAddSchema),
          responses: { '200': ok(data(LeadGenerationAddResultSchema)), '409': problem('A pesquisa ainda não terminou'), ...withNotFound },
        }),
      },
      '/lead-generation/schedules': {
        get: op({
          tags: ['Gerador de leads'],
          summary: 'Pesquisas automáticas (semanais)',
          responses: { '200': ok(data(z.array(LeadGenerationScheduleSchema))), ...common },
        }),
        post: op({
          tags: ['Gerador de leads'],
          summary: 'Criar uma pesquisa automática (corre sozinha uma vez por semana, à hora de Lisboa)',
          description:
            'Lançada pelo cron `/cron/reminders` (de 5 em 5 minutos) ou `/cron/daily-digest`. No fim, o utilizador recebe uma notificação e um email. Com `auto_add`, as empresas novas entram logo como leads.',
          requestBody: body(LeadGenerationScheduleUpsertSchema),
          responses: { '201': ok(data(LeadGenerationScheduleSchema), 'Criada'), '422': problem('Dados inválidos ou demasiadas pesquisas'), ...common },
        }),
      },
      '/lead-generation/schedules/{id}': {
        patch: op({
          tags: ['Gerador de leads'],
          summary: 'Ativar/desativar ou mudar uma pesquisa automática',
          requestParams: { path: idParam },
          requestBody: body(LeadGenerationScheduleUpdateSchema),
          responses: { '200': ok(data(LeadGenerationScheduleSchema)), ...withNotFound },
        }),
        delete: op({
          tags: ['Gerador de leads'],
          summary: 'Apagar uma pesquisa automática (as pesquisas já feitas ficam)',
          requestParams: { path: idParam },
          responses: { '204': { description: 'Apagada' }, ...withNotFound },
        }),
      },
      '/lead-generation/schedules/{id}/run': {
        post: op({
          tags: ['Gerador de leads'],
          summary: 'Correr já a pesquisa automática (não muda a próxima data)',
          requestParams: { path: idParam },
          responses: {
            '202': ok(data(LeadGenerationRunSchema), 'Pesquisa começada'),
            '409': problem('Já há uma pesquisa a correr'),
            ...withNotFound,
          },
        }),
      },
      '/map': {
        get: op({
          tags: ['Mapa'],
          summary: 'Leads com coordenadas (aceita os filtros de /leads)',
          requestParams: { query: LeadListQuerySchema },
          responses: { '200': ok(data(MapDataSchema)), ...common },
        }),
      },
      '/map/geocode': {
        post: op({
          tags: ['Mapa'],
          summary: 'Localizar um lote de leads sem coordenadas (repetir até remaining = 0)',
          responses: { '200': ok(data(GeocodeBatchResultSchema)), ...common },
        }),
      },
      '/leads/{id}/location': {
        post: op({
          tags: ['Mapa'],
          summary: 'Localizar pela morada (sem corpo) ou gravar a posição escolhida ({ latitude, longitude })',
          requestParams: { path: leadId },
          requestBody: { content: { 'application/json': { schema: LeadLocationSchema } }, required: false },
          responses: { '200': ok(data(LeadSchema)), '422': problem('Sem morada nem cidade'), ...withNotFound },
        }),
      },
      '/preferences/{key}': {
        get: op({
          tags: ['Preferências'],
          summary: 'Ler preferência (ex.: leads.table)',
          requestParams: { path: z.object({ key: z.string() }) },
          responses: { '200': ok(data(PreferenceValueSchema)), ...common },
        }),
        put: op({
          tags: ['Preferências'],
          summary: 'Gravar preferência',
          requestParams: { path: z.object({ key: z.string() }) },
          requestBody: body(PreferenceValueSchema),
          responses: { '200': ok(data(PreferenceValueSchema)), ...common },
        }),
      },
    },
  });
  return cached;
}
