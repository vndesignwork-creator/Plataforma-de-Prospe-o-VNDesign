/**
 * Documento OpenAPI 3.1 da API /api/v1, gerado a partir dos schemas Zod de
 * @vndesign/core (a mesma fonte usada para validar os pedidos).
 * Servido em /api/v1/openapi.json e apresentado em /docs/api.
 */
import {
  ActivityCreateSchema,
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
        '- Integrações: tokens pessoais `vnd_…` (Fase D).',
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
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sb-<projeto>-auth-token' },
      },
    },
    tags: [
      { name: 'Conta' },
      { name: 'Leads' },
      { name: 'Kanban' },
      { name: 'Dashboard' },
      { name: 'Importação e exportação' },
      { name: 'Atividade' },
      { name: 'Setores' },
      { name: 'Não contactar' },
      { name: 'Preferências' },
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
