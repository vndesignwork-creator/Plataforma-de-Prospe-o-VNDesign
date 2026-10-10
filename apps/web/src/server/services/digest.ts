/**
 * Resumo diário por email: follow-ups em atraso, de hoje e dos próximos 7 dias.
 * Corre a partir de /api/v1/cron/daily-digest (Vercel Cron, tarefa agendada no
 * Coolify/Hostinger) ou de um envio de teste nas Definições.
 */
import { formatDate, LEAD_STATUS_META, type Lead, type Today, type TodayTask } from '@vndesign/core';
import { isMailConfigured, sendMail } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { fetchToday } from './dashboard';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Tarefas em atraso e para hoje (as que pedem atenção no resumo e no aviso). */
export function urgentTasks(today: Today): TodayTask[] {
  return [...(today.tasks?.overdue ?? []), ...(today.tasks?.due_today ?? [])];
}

export function buildDigestEmail(input: { workspaceName: string; today: Today; appUrl: string }) {
  const { today, appUrl } = input;
  const total = today.overdue.length + today.due_today.length;
  const tasksUrgent = urgentTasks(today);
  const tasksAll = [...tasksUrgent, ...(today.tasks?.upcoming ?? [])];
  const taskNote = tasksUrgent.length ? ` · ${tasksUrgent.length} tarefa${tasksUrgent.length === 1 ? '' : 's'}` : '';
  const subject =
    total === 0
      ? tasksUrgent.length
        ? `VNDesign Leads · ${tasksUrgent.length} tarefa${tasksUrgent.length === 1 ? '' : 's'} para hoje · ${formatDate(today.today)}`
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
        `- #${l.number} ${l.company_name} — ${l.next_action_text ?? 'Próxima ação'} (${formatDate(l.next_action_on)}) ${appUrl}/leads/${l.id}`,
      );
    }
    textParts.push('');
  }
  if (tasksAll.length) {
    textParts.push(`TAREFAS (${tasksAll.length})`);
    for (const t of tasksAll) {
      textParts.push(`- ${t.title} — #${t.lead.number} ${t.lead.company_name} (${formatDate(t.due_on)}) ${appUrl}/leads/${t.lead.id}`);
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
    <a href="${esc(`${appUrl}/leads/${t.lead.id}`)}" style="color:#5f5b53;font-size:13px;text-decoration:none;">#${t.lead.number} ${esc(t.lead.company_name)}</a>
  </td>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;text-align:right;white-space:nowrap;color:${taskColor(t)};font-weight:600;font-size:13px;">${esc(formatDate(t.due_on))}</td>
</tr>`,
    )
    .join('');

  const rows = (leads: Lead[], color: string) =>
    leads
      .map(
        (l) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e7e3db;">
    <a href="${esc(`${appUrl}/leads/${l.id}`)}" style="color:#141414;font-weight:600;text-decoration:none;">#${l.number} ${esc(l.company_name)}</a><br>
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
  total + today.upcoming.length + tasksAll.length === 0
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
    const base = {
      workspace_id: ws.workspace_id,
      recipient: ws.recipient,
      overdue: today.overdue.length,
      due_today: today.due_today.length,
      upcoming: today.upcoming.length,
      tasks: urgentTasks(today).length,
    };
    if (base.overdue + base.due_today + base.tasks === 0) {
      results.push({ ...base, status: 'skipped' });
      continue;
    }
    if (options.dryRun || !isMailConfigured()) {
      results.push({ ...base, status: 'dry_run' });
      continue;
    }
    try {
      await sendMail({ to: ws.recipient, ...buildDigestEmail({ workspaceName: ws.workspace_name, today, appUrl: options.appUrl }) });
      results.push({ ...base, status: 'sent' });
    } catch (e) {
      results.push({ ...base, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
