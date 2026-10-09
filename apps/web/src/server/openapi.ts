/**
 * Documento OpenAPI 3.1 da API /api/v1, gerado a partir dos schemas Zod de
 * @vndesign/core (a mesma fonte usada para validar os pedidos).
 * Servido em /api/v1/openapi.json e apresentado em /docs/api.
 */
import {
  ApiTokenCreateSchema,
  ApiTokenCreatedSchema,
  ApiTokenSchema,
  AuditApplySchema,
  IntegrationImportResultSchema,
  IntegrationImportSchema,
  PushSubscriptionCreateSchema,
  PushSubscriptionDeleteSchema,
  SiteAuditRequestSchema,
  SiteAuditSchema,
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
  DuplicateCheckSchema,
  LeadAnonymizeSchema,
  LeadCreateSchema,
  LeadListQuerySchema,
  LeadMergeSchema,
  LeadSchema,
  LeadUpdateSchema,
  MeSchema,
  PaginationMetaSchema,
  PreferenceValueSchema,
  ProblemSchema,
  SectorCreateSchema,
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
        '- Integrações: tokens pessoais `Authorization: Bearer vnd_…` (criados em Definições → API e integrações).',
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
      { name: 'Não contactar' },
      { name: 'Preferências' },
      { name: 'Auditor de sites' },
      { name: 'Integrações' },
      { name: 'Notificações' },
    ],
    paths: {
      '/me': {
        get: op({ tags: ['Conta'], summary: 'Utilizador e workspace atuais', responses: { '200': ok(data(MeSchema)), ...common } }),
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
      '/leads/{id}/activities/{activityId}': {
        delete: op({
          tags: ['Atividade'],
          summary: 'Apagar uma nota própria',
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
