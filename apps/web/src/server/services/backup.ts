/**
 * Cópia de segurança semanal: todos os leads (também os arquivados) num Excel,
 * por email, no dia da semana escolhido (cron do resumo diário). O ficheiro é
 * o mesmo da exportação e pode ser reimportado. Liga/desliga em Definições →
 * Funcionalidades.
 */
import { WorkspaceSettingsSchema, todayIso, type WorkspaceSettings } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { isMailConfigured, sendMail, sendWithAccount } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { systemContext } from '../system-context';
import { leadsToXlsx } from './export';
import { listAllLeads } from './leads';
import { loadSmtpAccount } from './mail-account';
import { loadServiceCatalog } from './service-catalog';
import { getSettings } from './workspace';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const isoWeekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
};

/** Envia já a cópia (botão "Enviar uma cópia agora" e cron). */
export async function sendBackup(ctx: ApiContext): Promise<{ sent_to: string; leads: number }> {
  const settings = await getSettings(ctx);
  const recipient = settings.weekly_backup.recipient || ctx.user.email;
  if (!recipient) throw new ApiError(422, 'Falta o destinatário', 'Indica para que email vai a cópia em Definições → Funcionalidades.');
  const [leads, services] = await Promise.all([listAllLeads(ctx, { archived: 'include' }), loadServiceCatalog(ctx)]);
  const today = todayIso();
  const attachment = { filename: `copia-leads-vndesign-${today}.xlsx`, content: await leadsToXlsx(leads, services), contentType: XLSX };
  const text = [
    'Olá!',
    '',
    `Em anexo segue a cópia de segurança semanal dos teus leads (${leads.length}, incluindo os arquivados).`,
    'Guarda-a numa pasta tua (ex.: Google Drive). Se alguma vez precisares, importa-a em Leads → Importar / Exportar.',
    '',
    'Para mudar o dia ou desligar: Definições → Funcionalidades.',
  ].join('\n');
  const message = {
    to: recipient,
    subject: `Cópia de segurança dos leads — ${today.split('-').reverse().join('/')}`,
    text,
    html: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    attachments: [attachment],
  };
  // Pela conta de envio do utilizador; sem ela, pelo SMTP do servidor.
  const account = await loadSmtpAccount(ctx).catch(() => null);
  if (account) await sendWithAccount(account.account, message);
  else if (isMailConfigured()) await sendMail(message);
  else throw new ApiError(422, 'Sem email para enviar', 'Liga a tua conta em Definições → Email de envio para receber a cópia.');

  await saveLastSent(ctx.workspaceId, settings);
  return { sent_to: recipient, leads: leads.length };
}

async function saveLastSent(workspaceId: string, settings: WorkspaceSettings) {
  // Com a chave de serviço: um membro sem permissão de alterar definições também a pode enviar.
  await createSupabaseAdminClient()
    .from('workspaces')
    .update({ settings: { ...settings, weekly_backup: { ...settings.weekly_backup, last_sent_at: new Date().toISOString() } } })
    .eq('id', workspaceId);
}

export interface BackupCronResult {
  workspace_id: string;
  status: 'sent' | 'error' | 'dry_run';
  leads?: number;
  error?: string;
}

/** Cron (todas as manhãs): envia a cópia aos workspaces cujo dia é hoje. */
export async function runWeeklyBackups(options: { dryRun?: boolean; now?: Date } = {}): Promise<BackupCronResult[]> {
  const admin = createSupabaseAdminClient();
  const today = todayIso(options.now);
  const { data, error } = await admin.from('workspaces').select('id, settings');
  if (error) throw new Error(error.message);
  const results: BackupCronResult[] = [];
  for (const row of (data ?? []) as { id: string; settings: unknown }[]) {
    const settings = WorkspaceSettingsSchema.parse(row.settings ?? {});
    const backup = settings.weekly_backup;
    if (!backup.enabled || isoWeekday(today) !== backup.weekday) continue;
    // Uma por semana (o cron pode correr mais do que uma vez no mesmo dia).
    if (backup.last_sent_at && Date.now() - new Date(backup.last_sent_at).getTime() < 6 * 86_400_000) continue;
    if (options.dryRun) {
      results.push({ workspace_id: row.id, status: 'dry_run' });
      continue;
    }
    const ctx = await systemContext(row.id, null);
    if (!ctx) continue;
    try {
      const sent = await sendBackup(ctx);
      results.push({ workspace_id: row.id, status: 'sent', leads: sent.leads });
    } catch (e) {
      results.push({ workspace_id: row.id, status: 'error', error: e instanceof ApiError ? (e.detail ?? e.title) : 'Erro inesperado.' });
    }
  }
  return results;
}
