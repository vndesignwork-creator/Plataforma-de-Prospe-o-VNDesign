/**
 * Estado da plataforma: as tarefas automáticas (cron) e os problemas em segundo plano.
 */
import { z } from 'zod';

/** Os lembretes correm de 5 em 5 minutos: mais de 1 hora sem correr = parados. */
export const CRON_REMINDERS_LATE_MS = 60 * 60_000;
/** O resumo diário corre uma vez por dia: mais de 26 horas = parado. */
export const CRON_DIGEST_LATE_MS = 26 * 60 * 60_000;

export const CRON_STATES = ['ok', 'late', 'never'] as const;
export type CronState = (typeof CRON_STATES)[number];

/** ok: correu há pouco; late: parou; never: ainda não correu nenhuma vez. */
export function cronState(at: string | null, lateMs: number, now = Date.now()): CronState {
  if (!at) return 'never';
  return now - Date.parse(at) > lateMs ? 'late' : 'ok';
}

export const PlatformProblemSchema = z
  .object({
    id: z.string(),
    area: z.string(),
    title: z.string(),
    detail: z.string().nullable(),
    count: z.int(),
    first_at: z.string(),
    last_at: z.string(),
    resolved_at: z.string().nullable(),
  })
  .meta({ id: 'PlatformProblem' });
export type PlatformProblem = z.infer<typeof PlatformProblemSchema>;

export const PlatformStatusSchema = z
  .object({
    reminders_at: z.string().nullable(),
    digest_at: z.string().nullable(),
    reminders: z.enum(CRON_STATES),
    digest: z.enum(CRON_STATES),
    /** O envio de emails da plataforma (SMTP) está configurado? Sem ele, o aviso só vai para o sino. */
    mail_configured: z.boolean(),
    problems: z.array(PlatformProblemSchema),
  })
  .meta({ id: 'PlatformStatus' });
export type PlatformStatus = z.infer<typeof PlatformStatusSchema>;

/** De que parte vem cada problema (para o ecrã). */
export const PROBLEM_AREA_LABELS: Record<string, string> = {
  email: 'Email',
  mailbox: 'Caixa de email',
  digest: 'Resumo diário',
  backup: 'Cópia de segurança',
  lead_generation: 'Gerador de leads',
  site_form: 'Formulário do site',
  error: 'Erro inesperado',
  screen: 'Erro no ecrã',
  audit: 'Registo',
};

/** Uma página que falhou no navegador (o ecrã "Não foi possível abrir esta página"). */
export const ClientErrorReportSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    page: z.string().trim().min(1).max(300),
    digest: z.string().trim().max(100).optional(),
  })
  .meta({ id: 'ClientErrorReport' });
export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>;

/** Uma linha do registo de alterações (Definições → Registo de alterações). */
export const AuditEventSchema = z
  .object({
    id: z.number(),
    at: z.string(),
    action: z.string(),
    summary: z.string(),
    /** Quem: o nome da pessoa, "Integração (API)" ou "Antigo membro". */
    actor: z.string(),
  })
  .meta({ id: 'AuditEvent' });
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** O que a cópia de segurança tem e falta agora (Definições → Repor a partir de uma cópia). */
export const BackupRestorePreviewSchema = z
  .object({
    filename: z.string(),
    leads_in_file: z.int(),
    /** Leads da cópia que já não existem (repõem-se com o mesmo número). */
    missing_leads: z.array(z.object({ number: z.int(), company_name: z.string() })),
    /** Estão na reciclagem: repõem-se em Apagados, com tudo o que tinham. */
    in_trash: z.array(z.object({ number: z.int(), company_name: z.string() })),
    /** Linhas sem número (não se sabe se já existem): não se repõem. */
    without_number: z.int(),
    /** O ficheiro tem a folha "Tarefas" (cópias de 13/11/2026 em diante). */
    has_tasks: z.boolean(),
    missing_tasks: z.int(),
    missing_tasks_sample: z.array(z.object({ number: z.int(), company_name: z.string(), title: z.string() })),
  })
  .meta({ id: 'BackupRestorePreview' });
export type BackupRestorePreview = z.infer<typeof BackupRestorePreviewSchema>;

export const BackupRestoreResultSchema = z
  .object({ leads_restored: z.int(), tasks_restored: z.int(), skipped: z.int() })
  .meta({ id: 'BackupRestoreResult' });
export type BackupRestoreResult = z.infer<typeof BackupRestoreResultSchema>;
