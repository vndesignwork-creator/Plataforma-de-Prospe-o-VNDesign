/**
 * Colaboradores de um projeto (programador, fotógrafo, copywriter…): convidados
 * por email para um projeto, entram com conta própria e só veem as tarefas, as
 * entregas, o briefing e as horas desse projeto — nunca os leads nem valores.
 */
import { z } from 'zod';
import { DELIVERABLE_STATUSES, PROJECT_STAGES, TimeEntrySchema } from './project-tools';

export const COLLABORATOR_STATUSES = ['convidado', 'ativo'] as const;
export type CollaboratorStatus = (typeof COLLABORATOR_STATUSES)[number];

export const ProjectCollaboratorSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    email: z.string(),
    name: z.string().nullable(),
    user_id: z.uuid().nullable(),
    status: z.enum(COLLABORATOR_STATUSES),
    invited_at: z.string(),
    accepted_at: z.string().nullable(),
    /** Só enquanto o convite não for aceite (para copiar o link). */
    token: z.string().nullable(),
  })
  .meta({ id: 'ProjectCollaborator' });
export type ProjectCollaborator = z.infer<typeof ProjectCollaboratorSchema>;

export const CollaboratorInviteSchema = z
  .object({
    email: z
      .email({ error: 'Indica um email válido.' })
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    name: z.string().trim().max(120, { error: 'Máximo de 120 caracteres.' }).optional().transform((v) => v || null),
    /** Enviar o convite por email (pela conta de Email de envio). */
    send_email: z.boolean().optional().default(true),
  })
  .meta({ id: 'CollaboratorInvite' });
export type CollaboratorInvite = z.output<typeof CollaboratorInviteSchema>;

export const CollaboratorAcceptSchema = z
  .object({
    name: z.string().trim().min(2, { error: 'Escreve o teu nome.' }).max(120),
    password: z.string().min(8, { error: 'A palavra-passe tem de ter pelo menos 8 caracteres.' }).max(200),
  })
  .meta({ id: 'CollaboratorAccept' });
export type CollaboratorAccept = z.output<typeof CollaboratorAcceptSchema>;

/** Um projeto na lista do colaborador. */
export const CollabProjectSummarySchema = z
  .object({
    lead_id: z.uuid(),
    company_name: z.string(),
    stage: z.enum(PROJECT_STAGES),
    due_on: z.string().nullable(),
    tasks: z.object({ total: z.int(), done: z.int() }),
    owner: z.string().meta({ description: 'Quem convidou (nome e empresa)' }),
  })
  .meta({ id: 'CollabProjectSummary' });
export type CollabProjectSummary = z.infer<typeof CollabProjectSummarySchema>;

export const CollabProjectSchema = z
  .object({
    lead_id: z.uuid(),
    company_name: z.string(),
    website: z.string().nullable(),
    stage: z.enum(PROJECT_STAGES),
    due_on: z.string().nullable(),
    owner: z.object({ name: z.string(), email: z.string().nullable() }),
    tasks: z.array(z.object({ id: z.uuid(), title: z.string(), due_on: z.string().nullable(), done: z.boolean() })),
    deliverables: z.array(
      z.object({ id: z.uuid(), title: z.string(), url: z.string().nullable(), status: z.enum(DELIVERABLE_STATUSES), created_at: z.string() }),
    ),
    briefing: z
      .object({
        status: z.enum(['pendente', 'respondido']),
        items: z.array(z.object({ question: z.string(), answer: z.string() })),
        files: z.array(z.object({ name: z.string(), size: z.int(), url: z.string() })),
      })
      .nullable(),
    time: z.object({
      entries: z.array(TimeEntrySchema).meta({ description: 'Só os registos do próprio colaborador' }),
      total_minutes: z.int(),
      running: TimeEntrySchema.nullable(),
    }),
  })
  .meta({ id: 'CollabProject' });
export type CollabProject = z.infer<typeof CollabProjectSchema>;

export const CollabTimeActionSchema = z
  .object({ action: z.enum(['start', 'stop']), notes: z.string().trim().max(300).optional().transform((v) => v || null) })
  .meta({ id: 'CollabTimeAction' });
