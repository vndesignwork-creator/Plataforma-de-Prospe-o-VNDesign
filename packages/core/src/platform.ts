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
};
