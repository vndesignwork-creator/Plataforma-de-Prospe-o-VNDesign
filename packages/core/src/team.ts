/**
 * Equipa de prospeção: o dono convida pessoas para a equipa. O papel
 * "prospector" só vê a parte comercial (leads, prospeção, gerador, Kanban,
 * mapa, scripts); "admin" vê tudo, como o dono.
 */
import { z } from 'zod';
import { ACTIVITY_TYPES } from './enums';

export const MEMBER_ROLES = ['owner', 'admin', 'member', 'prospector'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  member: 'Membro',
  prospector: 'Prospetor',
};
/** Papéis que se podem dar por convite. */
export const INVITE_ROLES = ['prospector', 'admin'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** Pode gerir definições, equipa e chaves (dono ou administrador). */
export const isAdminRole = (role: MemberRole) => role === 'owner' || role === 'admin';
export const isProspector = (role: MemberRole | null | undefined) => role === 'prospector';

export const TeamMemberSchema = z
  .object({
    user_id: z.uuid(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    role: z.enum(MEMBER_ROLES),
    joined_at: z.string(),
    is_me: z.boolean(),
  })
  .meta({ id: 'TeamMember' });
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamInviteSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    name: z.string().nullable(),
    role: z.enum(INVITE_ROLES),
    invited_at: z.string(),
    token: z.string(),
  })
  .meta({ id: 'TeamInvite' });
export type TeamInvite = z.infer<typeof TeamInviteSchema>;

export const TeamSchema = z
  .object({ members: z.array(TeamMemberSchema), invites: z.array(TeamInviteSchema) })
  .meta({ id: 'Team' });
export type Team = z.infer<typeof TeamSchema>;

export const TeamInviteCreateSchema = z
  .object({
    // Limpa espaços (email colado) antes de validar.
    email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Indica um email válido.' })),
    name: z.string().trim().max(120, { error: 'Máximo de 120 caracteres.' }).optional().transform((v) => v || null),
    role: z.enum(INVITE_ROLES).default('prospector'),
    /** Enviar o convite por email (pela conta de Email de envio). */
    send_email: z.boolean().optional().default(true),
  })
  .meta({ id: 'TeamInviteCreate' });
export type TeamInviteCreate = z.output<typeof TeamInviteCreateSchema>;

export const TeamMemberUpdateSchema = z.object({ role: z.enum(INVITE_ROLES) }).meta({ id: 'TeamMemberUpdate' });

/** O que a página do convite mostra (sem login). */
export const TeamInviteInfoSchema = z
  .object({ email: z.string(), name: z.string().nullable(), role: z.enum(INVITE_ROLES), inviter: z.string(), accepted: z.boolean() })
  .meta({ id: 'TeamInviteInfo' });
export type TeamInviteInfo = z.infer<typeof TeamInviteInfoSchema>;

export const TeamAcceptSchema = z
  .object({
    name: z.string().trim().min(2, { error: 'Escreve o teu nome.' }).max(120),
    password: z.string().min(8, { error: 'A palavra-passe tem de ter pelo menos 8 caracteres.' }).max(200),
  })
  .meta({ id: 'TeamAccept' });
export type TeamAccept = z.output<typeof TeamAcceptSchema>;

export const TeamSettingsSchema = z.object({
  /** Leads que cada prospetor pode juntar pelo gerador (IA), por semana. 0 = sem gerador. */
  generation_weekly_limit: z.int().min(0).max(1000).default(50),
});
export type TeamSettings = z.output<typeof TeamSettingsSchema>;
export const DEFAULT_TEAM_SETTINGS: TeamSettings = { generation_weekly_limit: 50 };

/** Estatísticas → Equipa: o trabalho de cada pessoa. */
export const TeamStatsSchema = z
  .object({
    days: z.int(),
    members: z.array(
      z.object({
        user_id: z.uuid(),
        name: z.string(),
        role: z.enum(MEMBER_ROLES),
        contacts: z.int().meta({ description: 'Contactos registados (prospeção, emails, chamadas, mensagens)' }),
        contacts_today: z.int(),
        replied: z.int().meta({ description: 'Leads que passaram a Respondeu' }),
        meetings: z.int().meta({ description: 'Leads que passaram a Reunião' }),
        won: z.int().meta({ description: 'Leads que passaram a Cliente' }),
        generated: z.int().meta({ description: 'Leads criados (à mão ou pelo gerador)' }),
        assigned_open: z.int().meta({ description: 'Leads atribuídos ainda em aberto' }),
        generation_used: z.int().meta({ description: 'Leads juntados pelo gerador nos últimos 7 dias' }),
        generation_limit: z.int().nullable().meta({ description: 'Limite semanal do gerador (null = sem limite)' }),
      }),
    ),
  })
  .meta({ id: 'TeamStats' });
export type TeamStats = z.infer<typeof TeamStatsSchema>;

/** Equipa → Atividade: o que cada pessoa fez nos leads (mais recente primeiro). */
export const TeamActivitySchema = z
  .object({
    id: z.uuid(),
    type: z.enum(ACTIVITY_TYPES),
    body: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    created_at: z.string(),
    actor_user_id: z.uuid().nullable(),
    actor_name: z.string().nullable(),
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string() }),
  })
  .meta({ id: 'TeamActivity' });
export type TeamActivity = z.infer<typeof TeamActivitySchema>;

export const TeamActivityQuerySchema = z.object({
  user: z.uuid().optional(),
  days: z.coerce.number().int().min(1).max(90).default(7),
});
