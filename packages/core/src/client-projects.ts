/**
 * Vários projetos por cliente: um cliente que volta (ex.: site em 2025, loja
 * online em 2026) ganha um registo próprio para o projeto novo — com tarefas,
 * pagamentos, horas e contrato próprios — ligado ao cliente principal
 * (`client_of`). A ficha mostra todos os projetos do cliente.
 */
import { z } from 'zod';
import { LEAD_STATUSES } from './enums';
import { PROJECT_STAGES } from './project-tools';
import { ServiceKeyListSchema } from './services';

export const ClientProjectSchema = z
  .object({
    id: z.uuid(),
    number: z.int(),
    company_name: z.string(),
    project_title: z.string().nullable(),
    main: z.boolean().meta({ description: 'O registo principal do cliente' }),
    status: z.enum(LEAD_STATUSES),
    services: z.array(z.string()),
    estimated_value: z.number().nullable(),
    stage: z.enum(PROJECT_STAGES).nullable(),
    due_on: z.string().nullable(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'ClientProject' });
export type ClientProject = z.infer<typeof ClientProjectSchema>;

export const ClientProjectsSchema = z
  .object({ main_id: z.uuid(), projects: z.array(ClientProjectSchema) })
  .meta({ id: 'ClientProjects' });
export type ClientProjects = z.infer<typeof ClientProjectsSchema>;

export const ClientProjectCreateSchema = z
  .object({
    title: z.string().trim().min(1, { error: 'Dá um nome ao projeto (ex.: Loja online).' }).max(120, { error: 'Máximo de 120 caracteres.' }),
    services: ServiceKeyListSchema.optional(),
    estimated_value: z.number().min(0).max(100_000_000).nullish(),
  })
  .meta({ id: 'ClientProjectCreate' });
export type ClientProjectCreate = z.output<typeof ClientProjectCreateSchema>;

/** "Padaria Sol · Loja online" (só com o nome do projeto quando existe). */
export function projectLabel(lead: { company_name: string; project_title?: string | null }): string {
  return lead.project_title ? `${lead.company_name} · ${lead.project_title}` : lead.company_name;
}
