import { apiRoute, json, parseId } from '@/server/http';
import { startProject } from '@/server/services/project-tools';

/**
 * POST /api/v1/leads/{id}/project/start — prepara o projeto: prazo e revisões
 * pelos serviços do lead e, se ainda não houver, as tarefas das listas dos
 * serviços e o plano de pagamentos (Definições → Funcionalidades).
 */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await startProject(ctx, parseId(id)) }));
