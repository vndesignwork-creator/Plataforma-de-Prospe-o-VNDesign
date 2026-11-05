/**
 * O que falta o cliente enviar: uma lista no projeto e na página do cliente
 * (/p/<código>), onde ele marca como enviado e junta os ficheiros.
 */
import { z } from 'zod';

export const CLIENT_REQUEST_STATUSES = ['pending', 'sent', 'done'] as const;
export type ClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];
export const CLIENT_REQUEST_STATUS_LABELS: Record<ClientRequestStatus, string> = { pending: 'Por enviar', sent: 'Enviado', done: 'Recebido' };

/** Pedidos comuns, para juntar com um toque. */
export const CLIENT_REQUEST_PRESETS = [
  'Textos para o site (quem somos, serviços)',
  'Fotografias (espaço, equipa, produtos)',
  'Logótipo em boa qualidade (PNG ou SVG)',
  'Acessos ao domínio e ao alojamento',
  'Lista de serviços e preços',
  'Contactos e horário para o site',
] as const;

export const CLIENT_REQUEST_MAX_FILES = 10;
export const CLIENT_REQUEST_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ClientRequestFileSchema = z.object({ name: z.string(), size: z.int(), type: z.string() });

export const ClientRequestSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    title: z.string(),
    note: z.string().nullable(),
    status: z.enum(CLIENT_REQUEST_STATUSES),
    client_note: z.string().nullable().meta({ description: 'O que o cliente escreveu ao enviar' }),
    files: z.array(ClientRequestFileSchema),
    sent_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'ClientRequest' });
export type ClientRequest = z.infer<typeof ClientRequestSchema>;

export const ClientRequestCreateSchema = z
  .object({
    title: z.string().trim().min(1, { error: 'Escreve o que falta.' }).max(200),
    note: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  })
  .meta({ id: 'ClientRequestCreate' });

export const ClientRequestUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(1000).nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
    status: z.enum(CLIENT_REQUEST_STATUSES).optional(),
  })
  .meta({ id: 'ClientRequestUpdate' });

/** O que a página do cliente mostra de cada pedido. */
export interface SharedClientRequest {
  id: string;
  title: string;
  note: string | null;
  status: ClientRequestStatus;
  client_note: string | null;
  files: { name: string }[];
  sent_at: string | null;
}
