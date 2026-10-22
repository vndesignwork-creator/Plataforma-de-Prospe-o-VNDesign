/**
 * Vários projetos por cliente: cada projeto novo de um cliente que volta é um
 * registo próprio (client_of = registo principal), por isso tarefas, pagamentos,
 * horas, contratos, briefing e entregas continuam separados por projeto.
 */
import {
  todayIso,
  type ClientProject,
  type ClientProjectCreate,
  type ClientProjects,
  type Lead,
  type ProjectStage,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { LEAD_SELECT, getLead } from './leads';
import { startProject } from './project-tools';

/** O registo principal do cliente (o próprio, se não for um projeto ligado). */
export async function mainClientId(ctx: ApiContext, leadId: string): Promise<string> {
  const lead = await getLead(ctx, leadId);
  return lead.client_of ?? lead.id;
}

export async function listClientProjects(ctx: ApiContext, leadId: string): Promise<ClientProjects> {
  const mainId = await mainClientId(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('leads')
    .select('id, number, company_name, project_title, client_of, status, services, estimated_value, project_completed_at, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .or(`id.eq.${mainId},client_of.eq.${mainId}`)
    .order('created_at', { ascending: true });
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as (Pick<Lead, 'id' | 'number' | 'company_name' | 'status' | 'created_at'> & {
    project_title: string | null;
    client_of: string | null;
    services: string[] | null;
    estimated_value: number | string | null;
    project_completed_at: string | null;
  })[];
  const ids = rows.map((r) => r.id);
  const { data: projects, error: pError } = await ctx.supabase.from('lead_projects').select('lead_id, stage, due_on').eq('workspace_id', ctx.workspaceId).in('lead_id', ids);
  if (pError) throw fromPostgrest(pError);
  const info = new Map(((projects ?? []) as { lead_id: string; stage: ProjectStage; due_on: string | null }[]).map((p) => [p.lead_id, p]));
  const list: ClientProject[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    company_name: r.company_name,
    project_title: r.project_title,
    main: r.id === mainId,
    status: r.status,
    services: r.services ?? [],
    estimated_value: r.estimated_value === null ? null : Number(r.estimated_value),
    stage: info.get(r.id)?.stage ?? null,
    due_on: info.get(r.id)?.due_on ?? null,
    completed_at: r.project_completed_at,
    created_at: r.created_at,
  }));
  return { main_id: mainId, projects: list };
}

/**
 * Novo projeto para o cliente: um registo "Cliente" com os contactos do registo
 * principal, o nome do projeto e os serviços escolhidos; o projeto prepara-se
 * logo (prazo, tarefas e plano de pagamentos, como ao passar a Cliente).
 */
export async function createClientProject(ctx: ApiContext, leadId: string, input: ClientProjectCreate): Promise<Lead> {
  const main = await getLead(ctx, await mainClientId(ctx, leadId));
  if (main.anonymized_at) throw new ApiError(422, 'Lead anonimizado', 'Não é possível criar projetos para um lead anonimizado.');
  const { data, error } = await ctx.supabase
    .from('leads')
    .insert({
      workspace_id: ctx.workspaceId,
      client_of: main.id,
      project_title: input.title,
      company_name: main.company_name,
      sector_id: main.sector_id,
      website: main.website,
      city: main.city,
      address: main.address,
      latitude: main.latitude,
      longitude: main.longitude,
      email: main.email,
      phone: main.phone,
      contact_name: main.contact_name,
      channel: main.channel,
      services: input.services ?? main.services ?? [],
      estimated_value: input.estimated_value ?? null,
      status: 'cliente',
      first_contact_on: todayIso(),
      created_by: ctx.user.id,
    })
    .select(LEAD_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const lead = data as unknown as Lead;
  // Registo principal: fica na linha do tempo que há um projeto novo.
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: main.id,
    type: 'note',
    body: `Novo projeto: ${input.title} (#${lead.number})`,
    payload: { via: 'client_project', project_id: lead.id },
    actor_user_id: ctx.user.id,
  });
  await startProject(ctx, lead.id).catch(() => undefined);
  return getLead(ctx, lead.id);
}
