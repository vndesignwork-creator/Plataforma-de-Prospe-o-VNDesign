/**
 * Resumo do lead com IA (antes de ligar): lê a ficha, as últimas 40 entradas
 * da linha do tempo, as tarefas, as propostas e as reuniões. Não grava nada.
 * Usa o fornecedor do "Email com IA", como as Notas com IA.
 */
import { ACTIVITY_TYPE_LABELS, LEAD_STATUS_META, LEAD_SUMMARY_SYSTEM_PROMPT, LeadSummaryDraftSchema, buildLeadSummaryPrompt, leadSummaryResult, todayIso, type ActivityType, type LeadSummary } from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getLead } from './leads';
import { getSettings } from './workspace';

const day = (iso: string) => todayIso(new Date(iso));

/** O texto útil de um registo da linha do tempo (corpo ou assunto do email). */
function activityText(a: { body: string | null; payload: Record<string, unknown> | null }): string {
  const p = a.payload ?? {};
  const text = a.body || (typeof p.subject === 'string' ? `“${p.subject}”` : '') || (typeof p.to === 'string' ? `→ ${p.to}` : '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 400);
}

export async function summarizeLead(ctx: ApiContext, leadId: string): Promise<LeadSummary> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado');
  const ws = ctx.workspaceId;
  const [activities, tasks, proposals, meetings] = await Promise.all([
    ctx.supabase.from('lead_activities').select('type, body, payload, created_at').eq('workspace_id', ws).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(40),
    ctx.supabase.from('lead_tasks').select('title, due_on, done_at').eq('workspace_id', ws).eq('lead_id', leadId).order('position').limit(30),
    ctx.supabase.from('proposals').select('status, total, created_at').eq('workspace_id', ws).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(5),
    ctx.supabase.from('lead_meetings').select('starts_at, canceled_at').eq('workspace_id', ws).eq('lead_id', leadId).order('starts_at', { ascending: false }).limit(5),
  ]);
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const prompt = buildLeadSummaryPrompt({
    today: todayIso(),
    lead: {
      company_name: lead.company_name,
      status: LEAD_STATUS_META[lead.status].label,
      contact_name: lead.contact_name,
      city: lead.city,
      website: lead.website,
      services: lead.services ?? [],
      notes: lead.notes,
      pinned_note: lead.pinned_note ?? null,
      problems: lead.problems,
      next_action_text: lead.next_action_text,
      next_action_on: lead.next_action_on,
      estimated_value: ctx.role === 'prospector' ? null : lead.estimated_value,
    },
    activities: ((activities.data ?? []) as { type: ActivityType; body: string | null; payload: Record<string, unknown> | null; created_at: string }[]).map((a) => ({
      date: day(a.created_at),
      type: ACTIVITY_TYPE_LABELS[a.type] ?? a.type,
      text: activityText(a),
    })),
    tasks: ((tasks.data ?? []) as { title: string; due_on: string | null; done_at: string | null }[]).map((t) => ({ title: t.title, due_on: t.due_on, done: !!t.done_at })),
    proposals: ((proposals.data ?? []) as { status: string; total: number | string | null; created_at: string }[]).map((p) => ({
      status: p.status,
      total: ctx.role === 'prospector' || p.total === null ? null : Number(p.total),
      date: day(p.created_at),
    })),
    meetings: ((meetings.data ?? []) as { starts_at: string; canceled_at: string | null }[]).map((m) => ({ starts_at: m.starts_at, canceled: !!m.canceled_at })),
  });
  const { data, model: used } = await generateJson(provider, model, {
    system: LEAD_SUMMARY_SYSTEM_PROMPT,
    prompt,
    schema: LeadSummaryDraftSchema,
    schemaName: 'resumo_lead',
  });
  const result = leadSummaryResult(data, used);
  if (!result.summary) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
  return result;
}
