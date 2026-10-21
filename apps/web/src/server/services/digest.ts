/**
 * Resumo diário por email: follow-ups em atraso, de hoje e dos próximos 7 dias.
 * Corre a partir de /api/v1/cron/daily-digest (Vercel Cron, tarefa agendada no
 * Coolify/Hostinger) ou de um envio de teste nas Definições.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addDays,
  dueStatus,
  formatCurrency,
  formatDate,
  LEAD_STATUS_META,
  type Lead,
  type Today,
  type TodayTask,
  leadPath,
  todayIso,
  WorkspaceSettingsSchema,
} from '@vndesign/core';
import { isMailConfigured, sendMail } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { fetchToday } from './dashboard';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Tarefas em atraso e para hoje (as que pedem atenção no resumo e no aviso). */
export function urgentTasks(today: Today): TodayTask[] {
  return [...(today.tasks?.overdue ?? []), ...(today.tasks?.due_today ?? [])];
}

type LeadRef = { id: string; number: number; company_name: string };

/** Projetos no resumo: entregas atrasadas e desta semana, pagamentos em atraso. */
export interface DigestProjects {
  deliveries: { lead: LeadRef; due_on: string }[];
  overdue_payments: { lead: LeadRef; description: string; amount: number; due_on: string }[];
}

export async function fetchDigestProjects(client: SupabaseClient, workspaceId: string, today = todayIso()): Promise<DigestProjects> {
  const { data: ws } = await client.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const features = WorkspaceSettingsSchema.parse(ws?.settings ?? {}).features;
  const embed = 'lead:leads!inner(id, number, company_name, status, archived_at, project_completed_at)';
  const [dues, payments] = await Promise.all([
    features.projects
      ? client
          .from('lead_projects')
          .select(`due_on, ${embed}`)
          .eq('workspace_id', workspaceId)
          .not('due_on', 'is', null)
          .lte('due_on', addDays(today, 7))
          .eq('lead.status', 'cliente')
          .is('lead.project_completed_at', null)
          .is('lead.archived_at', null)
          .order('due_on', { ascending: true })
      : Promise.resolve({ data: [] }),
    features.payments
      ? client
          .from('lead_payments')
          .select(`description, amount, due_on, ${embed}`)
          .eq('workspace_id', workspaceId)
          .is('paid_on', null)
          .lt('due_on', today)
          .is('lead.archived_at', null)
          .order('due_on', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const ref = (l: LeadRef) => ({ id: l.id, number: l.number, company_name: l.company_name });
  return {
    deliveries: ((dues.data ?? []) as unknown as { due_on: string; lead: LeadRef }[]).map((d) => ({ lead: ref(d.lead), due_on: d.due_on })),
    overdue_payments: ((payments.data ?? []) as unknown as { description: string; amount: number | string; due_on: string; lead: LeadRef }[]).map((p) => ({
      lead: ref(p.lead),
      description: p.description,
      amount: Number(p.amount),
      due_on: p.due_on,
    })),
  };
}

const projectCount = (p?: DigestProjects) => (p ? p.deliveries.length + p.overdue_payments.length : 0);

export function buildDigestEmail(input: { workspaceName: string; today: Today; appUrl: string; projects?: DigestProjects }) {
  const { today, appUrl } = input;
  const projects = input.projects ?? { deliveries: [], overdue_payments: [] };
  const total = today.overdue.length + today.due_today.length;
  const tasksUrgent = urgentTasks(today);
  const tasksAll = [...tasksUrgent, ...(today.tasks?.upcoming ?? [])];
  const taskNote = tasksUrgent.length ? ` · ${tasksUrgent.length} tarefa${tasksUrgent.length === 1 ? '' : 's'}` : '';
  const deliveries = projects.deliveries.length;
  const subject =
    total === 0
      ? tasksUrgent.length
        ? `VNDesign Leads · ${tasksUrgent.length} tarefa${tasksUrgent.length === 1 ? '' : 's'} para hoje · ${formatDate(today.today)}`
        : deliveries
          ? `VNDesign Leads · ${deliveries} entrega${deliveries === 1 ? '' : 's'} de projeto esta semana · ${formatDate(today.today)}`
          : `VNDesign Leads · sem follow-ups para hoje (${formatDate(today.today)})`
      : `VNDesign Leads · ${total} follow-up${total === 1 ? '' : 's'} para hoje${
          today.overdue.length ? ` (${today.overdue.length} em atraso)` : ''
        }${taskNote} · ${formatDate(today.today)}`;

  const sections: { title: string; leads: Lead[]; color: string }[] = [
    { title: 'Em atraso', leads: today.overdue, color: '#c22a2a' },
    { title: 'Para hoje', leads: today.due_today, color: '#EF5C32' },
    { title: 'Próximos 7 dias', leads: today.upcoming, color: '#5f5b53' },
  ];

  const textParts = [`Resumo de ${formatDate(today.today)} — ${input.workspaceName}`, ''];
  for (const s of sections) {
    if (!s.leads.length) continue;
    textParts.push(`${s.title.toUpperCase()} (${s.leads.length})`);
    for (const l of s.leads) {
      textParts.push(
        `- #${l.number} ${l.company_name} — ${l.next_action_text ?? 'Próxima ação'} (${formatDate(l.next_action_on)}) ${appUrl}${leadPath(l)}`,
      );
    }
    textParts.push('');
  }
  if (tasksAll.length) {
    textParts.push(`TAREFAS (${tasksAll.length})`);
    for (const t of tasksAll) {
      textParts.push(`- ${t.title} — #${t.lead.number} ${t.lead.company_name} (${formatDate(t.due_on)}) ${appUrl}${leadPath(t.lead)}`);
    }
    textParts.push('');
  }
  if (projectCount(projects)) {
    textParts.push('PROJETOS');
    for (const d of projects.deliveries) {
      textParts.push(`- Entrega: #${d.lead.number} ${d.lead.company_name} — ${dueStatus(d.due_on, today.today)!.label} (${formatDate(d.due_on)}) ${appUrl}${leadPath(d.lead)}`);
    }
    for (const p of projects.overdue_payments) {
      textParts.push(
        `- Pagamento em atraso: #${p.lead.number} ${p.lead.company_name} — ${p.description}, ${formatCurrency(p.amount)} (desde ${formatDate(p.due_on)}) ${appUrl}${leadPath(p.lead)}`,
      );
    }
    textParts.push('');
  }
  textParts.push(`Abrir o dashboard: ${appUrl}/dashboard`);

  const taskColor = (t: TodayTask) => (t.due_on! < today.today ? '#c22a2a' : t.due_on === today.today ? '#EF5C32' : '#5f5b53');
  const taskRows = tasksAll
    .map(
      (t) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;">
    <span style="color:#141414;font-weight:600;">☐ ${esc(t.title)}</span><br>
    <a href="${esc(`${appUrl}${leadPath(t.lead)}`)}" style="color:#5f5b53;font-size:13px;text-decoration:none;">#${t.lead.number} ${esc(t.lead.company_name)}</a>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;text-align:right;white-space:nowrap;color:${taskColor(t)};font-weight:600;font-size:13px;">${esc(formatDate(t.due_on))}</td>
</tr>`,
    )
    .join('');

  const projectRows = [
    ...projects.deliveries.map((d) => {
      const due = dueStatus(d.due_on, today.today)!;
      return { lead: d.lead, line: `📦 Entrega · ${due.label}`, right: formatDate(d.due_on), color: due.tone === 'danger' ? '#c22a2a' : due.tone === 'warning' ? '#EF5C32' : '#5f5b53' };
    }),
    ...projects.overdue_payments.map((p) => ({
      lead: p.lead,
      line: `💶 Pagamento em atraso · ${p.description} (desde ${formatDate(p.due_on)})`,
      right: formatCurrency(p.amount),
      color: '#c22a2a',
    })),
  ]
    .map(
      (r) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;">
    <a href="${esc(`${appUrl}${leadPath(r.lead)}`)}" style="color:#141414;font-weight:600;text-decoration:none;">#${r.lead.number} ${esc(r.lead.company_name)}</a><br>
    <span style="color:#5f5b53;font-size:13px;">${esc(r.line)}</span>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;text-align:right;white-space:nowrap;color:${r.color};font-weight:600;font-size:13px;">${esc(r.right)}</td>
</tr>`,
    )
    .join('');

  const rows = (leads: Lead[], color: string) =>
    leads
      .map(
        (l) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;">
    <a href="${esc(`${appUrl}${leadPath(l)}`)}" style="color:#141414;font-weight:600;text-decoration:none;">#${l.number} ${esc(l.company_name)}</a><br>
    <span style="color:#5f5b53;font-size:13px;">${esc(l.next_action_text ?? 'Próxima ação')} · ${esc(LEAD_STATUS_META[l.status].label)}${l.city ? ` · ${esc(l.city)}` : ''}</span>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;text-align:right;white-space:nowrap;color:${color};font-weight:600;font-size:13px;">${esc(formatDate(l.next_action_on))}</td>
</tr>`,
      )
      .join('');

  const html = `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f6f4f0;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f0;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0d0d0d;padding:20px 24px;">
  <span style="font-size:20px;font-weight:800;color:#f4f1ea;"><span style="color:#EF5C32;">VN</span>Design Leads</span><br>
  <span style="color:#a9a59c;font-size:13px;">Resumo de ${esc(formatDate(today.today))}</span>
</td></tr>
<tr><td style="padding:16px 24px 8px;">
${
  total + today.upcoming.length + tasksAll.length + projectCount(projects) === 0
    ? '<p style="color:#141414;">Não há follow-ups nem tarefas para os próximos 7 dias.</p>'
    : sections
        .filter((s) => s.leads.length)
        .map(
          (s) => `<h2 style="font-size:15px;margin:16px 0 4px;color:${s.color};">${s.title} (${s.leads.length})</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(s.leads, s.color)}</table>`,
        )
        .join('') +
      (tasksAll.length
        ? `<h2 style="font-size:15px;margin:16px 0 4px;color:#141414;">Tarefas (${tasksAll.length})</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${taskRows}</table>`
        : '') +
      (projectRows
        ? `<h2 style="font-size:15px;margin:16px 0 4px;color:#141414;">Projetos</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${projectRows}</table>`
        : '')
}
</td></tr>
<tr><td style="padding:16px 24px 24px;">
  <a href="${esc(`${appUrl}/dashboard`)}" style="display:inline-block;background:#EF5C32;color:#0d0d0d;font-weight:700;padding:10px 16px;border-radius:8px;text-decoration:none;">Abrir o dashboard</a>
</td></tr>
</table>
<p style="color:#5f5b53;font-size:12px;">Recebes este email porque ativaste o resumo diário nas Definições da VNDesign Leads.</p>
</td></tr></table></body></html>`;

  return { subject, text: textParts.join('\n'), html };
}

export interface DigestResult {
  workspace_id: string;
  recipient: string;
  status: 'sent' | 'skipped' | 'dry_run' | 'error';
  overdue: number;
  due_today: number;
  upcoming: number;
  tasks?: number;
  projects?: number;
  error?: string;
}

/** Envia o resumo a todos os workspaces com o resumo ativo. Sem nada para hoje, não envia. */
export async function sendDailyDigests(options: { appUrl: string; dryRun?: boolean }): Promise<DigestResult[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('digest_recipients');
  if (error) throw new Error(error.message);
  const results: DigestResult[] = [];
  for (const ws of (data ?? []) as { workspace_id: string; workspace_name: string; recipient: string }[]) {
    const today = await fetchToday(admin, ws.workspace_id);
    const projects = await fetchDigestProjects(admin, ws.workspace_id, today.today);
    const base = {
      workspace_id: ws.workspace_id,
      recipient: ws.recipient,
      overdue: today.overdue.length,
      due_today: today.due_today.length,
      upcoming: today.upcoming.length,
      tasks: urgentTasks(today).length,
      projects: projectCount(projects),
    };
    if (base.overdue + base.due_today + base.tasks + base.projects === 0) {
      results.push({ ...base, status: 'skipped' });
      continue;
    }
    if (options.dryRun || !isMailConfigured()) {
      results.push({ ...base, status: 'dry_run' });
      continue;
    }
    try {
      await sendMail({ to: ws.recipient, ...buildDigestEmail({ workspaceName: ws.workspace_name, today, appUrl: options.appUrl, projects }) });
      results.push({ ...base, status: 'sent' });
    } catch (e) {
      results.push({ ...base, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
