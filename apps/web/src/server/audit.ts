/**
 * Registo das mudanças fora dos leads (Definições → Registo de alterações). Regista-se à
 * passagem pela API (apiRoute), depois de o pedido correr bem, para não depender de cada
 * serviço se lembrar de o fazer. As mudanças nos leads ficam na linha do tempo de cada um.
 */
import { MEMBER_ROLE_LABELS, type MemberRole } from '@vndesign/core';
import type { ApiContext } from './context';
import { createSupabaseAdminClient } from './supabase-admin';

type Body = Record<string, unknown> | null;
interface Rule {
  method: string;
  path: RegExp;
  action: string;
  /** O resumo (null = não registar este pedido). */
  summary: (body: Body, url: URL) => string | null;
  /** Precisa do corpo do pedido (JSON) para o resumo. */
  body?: boolean;
}

/** Nomes das partes das Definições (as chaves de PATCH /settings). */
const SETTINGS_LABELS: Record<string, string> = {
  follow_up_days: 'dias até ao follow-up',
  work_weekends: 'fins de semana',
  import_skip_next_action: 'importação',
  follow_up_sequence: 'sequência de follow-ups',
  prospecting_sequence: 'sequência da prospeção',
  auto_archive_days: 'arquivo automático',
  activity_cleanup_months: 'limpeza dos registos',
  opt_out_line: 'linha de opt-out',
  daily_digest: 'resumo diário',
  proposal: 'propostas',
  ai: 'inteligência artificial',
  features: 'funcionalidades',
  google_review_url: 'link das avaliações do Google',
  project_kickoff: 'início dos projetos',
  briefing: 'briefing',
  contract: 'contrato',
  weekly_backup: 'cópia de segurança',
  quote: 'orçamentos',
  pomodoro: 'pomodoro',
  team: 'equipa',
  call_avoid: 'horas a evitar nas chamadas',
  goals: 'metas',
};

const str = (v: unknown, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const role = (v: unknown) => (typeof v === 'string' && v in MEMBER_ROLE_LABELS ? MEMBER_ROLE_LABELS[v as MemberRole].toLowerCase() : null);

export const AUDIT_RULES: Rule[] = [
  {
    method: 'PATCH',
    path: /^\/settings$/,
    action: 'settings',
    body: true,
    summary: (b) => {
      const keys = Object.keys(b ?? {});
      if (!keys.length) return null;
      return `Mudou as definições: ${keys.map((k) => SETTINGS_LABELS[k] ?? k.replace(/_/g, ' ')).join(', ')}`;
    },
  },
  { method: 'POST', path: /^\/settings\/backup$/, action: 'backup', summary: () => 'Enviou a cópia de segurança por email' },
  {
    method: 'POST',
    path: /^\/team\/invites$/,
    action: 'team_invite',
    body: true,
    summary: (b) => `Convidou ${str(b?.email, 120) ?? 'uma pessoa'} para a equipa${role(b?.role ?? 'prospector') ? ` (${role(b?.role ?? 'prospector')})` : ''}`,
  },
  { method: 'DELETE', path: /^\/team\/invites\/[^/]+$/, action: 'team_invite_revoke', summary: () => 'Cancelou um convite para a equipa' },
  { method: 'PATCH', path: /^\/team\/members\/[^/]+$/, action: 'team_role', body: true, summary: (b) => `Mudou o papel de um membro da equipa${role(b?.role) ? ` para ${role(b?.role)}` : ''}` },
  { method: 'DELETE', path: /^\/team\/members\/[^/]+$/, action: 'team_remove', summary: () => 'Removeu um membro da equipa' },
  { method: 'POST', path: /^\/tokens$/, action: 'token_create', body: true, summary: (b) => `Criou a chave da API “${str(b?.name) ?? 'sem nome'}”` },
  { method: 'DELETE', path: /^\/tokens\/[^/]+$/, action: 'token_revoke', summary: () => 'Revogou uma chave da API' },
  { method: 'GET', path: /^\/leads\/export$/, action: 'export', summary: (_b, u) => `Exportou leads (${u.searchParams.get('format') === 'xlsx' ? 'Excel' : 'CSV'})` },
  { method: 'POST', path: /^\/imports$/, action: 'import', summary: () => 'Importou leads de uma folha' },
  { method: 'POST', path: /^\/backup\/restore$/, action: 'restore', summary: () => 'Repôs dados a partir de uma cópia de segurança' },
  { method: 'PUT', path: /^\/mail-account$/, action: 'mail_account', summary: () => 'Mudou o email de envio' },
  { method: 'DELETE', path: /^\/mail-account$/, action: 'mail_account_off', summary: () => 'Desligou o email de envio' },
  { method: 'POST', path: /^\/free-audit$/, action: 'free_audit', body: true, summary: (b) => (b?.rotate ? 'Criou um código novo para a análise grátis' : b?.enabled === false ? 'Desligou a análise grátis' : 'Ligou a análise grátis') },
  { method: 'DELETE', path: /^\/leads\/trash$/, action: 'trash_purge', summary: () => 'Apagou de vez leads da reciclagem' },
  {
    method: 'POST',
    path: /^\/leads\/bulk$/,
    action: 'bulk_delete',
    body: true,
    summary: (b) => (b?.action === 'delete' ? `Apagou ${Array.isArray(b.ids) ? b.ids.length : 'vários'} leads de uma vez` : null),
  },
  { method: 'DELETE', path: /^\/collaborators\/[^/]+$/, action: 'collaborator_remove', summary: () => 'Removeu o acesso de um colaborador' },
  { method: 'DELETE', path: /^\/custom-fields\/[^/]+$/, action: 'custom_field_delete', summary: () => 'Apagou um campo personalizado' },
  { method: 'DELETE', path: /^\/automation-rules\/[^/]+$/, action: 'rule_delete', summary: () => 'Apagou uma regra automática' },
];

/** A regra deste pedido (ou null). */
export function auditRuleFor(req: Request): Rule | null {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, '');
  return AUDIT_RULES.find((r) => r.method === req.method && r.path.test(path)) ?? null;
}

/** Guarda o registo (nunca lança: um registo que falha não estraga o pedido). */
export async function recordAudit(ctx: ApiContext, rule: Rule, req: Request, body: Body): Promise<void> {
  try {
    const summary = rule.summary(body, new URL(req.url));
    if (!summary) return;
    const { error } = await createSupabaseAdminClient()
      .from('audit_events')
      .insert({
        workspace_id: ctx.workspaceId,
        actor_user_id: ctx.token ? null : ctx.user.id,
        actor_token_id: ctx.token?.id ?? null,
        action: rule.action,
        summary: summary.slice(0, 300),
      });
    if (error && !['42P01', 'PGRST205'].includes(error.code ?? '')) console.warn('[registo]', error.message);
  } catch (e) {
    console.warn('[registo]', e instanceof Error ? e.message : e);
  }
}
