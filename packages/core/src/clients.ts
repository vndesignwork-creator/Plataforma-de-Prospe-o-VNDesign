/**
 * Separador "Clientes" (página Projetos): cada cliente uma vez só, com os projetos
 * que tem, o que falta receber, a próxima tarefa e a próxima renovação.
 *
 * É a mesma ficha de lead (estado "Cliente") vista de outra prateleira: não há
 * registo separado nem sincronização a fazer. Os projetos novos de um cliente
 * (`client_of`) contam para o cliente principal.
 */
import { z } from 'zod';
import { LeadSchema } from './schemas';
import { LeadTaskSchema } from './tasks';
import { PaymentSummarySchema } from './projects';
import { daysUntil } from './renewals';

export const ClientRenewalSummarySchema = z
  .object({
    next_due_on: z.string().meta({ description: 'Próxima renovação (AAAA-MM-DD)' }),
    monthly: z.number().meta({ description: 'Quanto vale por mês (avenças e renovações juntas)' }),
    count: z.int(),
  })
  .meta({ id: 'ClientRenewalSummary' });

export const ClientSchema = z
  .object({
    lead: LeadSchema.meta({ description: 'O registo principal do cliente' }),
    projects: z.object({
      total: z.int(),
      active: z.int().meta({ description: 'Projetos em curso' }),
      completed: z.int(),
    }),
    payments: PaymentSummarySchema.meta({ description: 'O cliente e todos os seus projetos somados' }),
    next_task: LeadTaskSchema.extend({ lead_id: z.uuid(), company: z.string() })
      .nullable()
      .meta({ description: 'A tarefa aberta com o prazo mais próximo, de qualquer projeto do cliente' }),
    renewal: ClientRenewalSummarySchema.nullable(),
    brand_kit: z.boolean().meta({ description: 'Tem kit da marca (cores, letras ou ficheiros)' }),
    client_since: z.string().nullable().meta({ description: 'Quando passou a cliente' }),
    value: z.number().meta({ description: 'Valor de todos os projetos' }),
  })
  .meta({ id: 'Client' });
export type Client = z.infer<typeof ClientSchema>;

// -----------------------------------------------------------------------------
// Filtros e ordem da lista
// -----------------------------------------------------------------------------

export const CLIENT_FILTERS = ['todos', 'em_curso', 'pagamentos', 'renovacoes'] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];
export const CLIENT_FILTER_LABELS: Record<ClientFilter, string> = {
  todos: 'Todos',
  em_curso: 'Com projeto em curso',
  pagamentos: 'Pagamentos em atraso',
  renovacoes: 'Renovação em 30 dias',
};

/** Dias em que uma renovação já conta como "a chegar". */
export const CLIENT_RENEWAL_SOON_DAYS = 30;

export const CLIENT_SORTS = ['recentes', 'nome', 'valor', 'por_receber'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];
export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  recentes: 'Clientes mais recentes',
  nome: 'Nome (A–Z)',
  valor: 'Valor',
  por_receber: 'Por receber',
};

type Filterable = Pick<Client, 'projects' | 'payments' | 'renewal'>;

/** O cliente entra neste filtro? */
export function clientMatches<C extends Filterable>(c: C, filter: ClientFilter, today: string): boolean {
  if (filter === 'em_curso') return c.projects.active > 0;
  if (filter === 'pagamentos') return c.payments.overdue > 0;
  if (filter === 'renovacoes') {
    if (!c.renewal) return false;
    const days = daysUntil(c.renewal.next_due_on, today);
    return days <= CLIENT_RENEWAL_SOON_DAYS;
  }
  return true;
}

type Sortable = Pick<Client, 'lead' | 'payments' | 'value' | 'client_since'>;

/** Ordena os clientes (empates pelo número do lead, para a lista não dançar). */
export function sortClients<C extends Sortable>(clients: readonly C[], sort: ClientSort): C[] {
  const list = [...clients];
  const newest = (a: C, b: C) =>
    (b.client_since ?? '').localeCompare(a.client_since ?? '') || b.lead.number - a.lead.number;
  if (sort === 'nome') return list.sort((a, b) => a.lead.company_name.localeCompare(b.lead.company_name, 'pt') || newest(a, b));
  if (sort === 'valor') return list.sort((a, b) => b.value - a.value || newest(a, b));
  if (sort === 'por_receber') return list.sort((a, b) => b.payments.outstanding - a.payments.outstanding || newest(a, b));
  return list.sort(newest);
}

/** "3 projetos · 1 em curso" (resumo de uma linha da lista). */
export function clientProjectsLabel(p: Client['projects']): string {
  const total = `${p.total} projeto${p.total === 1 ? '' : 's'}`;
  return p.active ? `${total} · ${p.active} em curso` : total;
}
