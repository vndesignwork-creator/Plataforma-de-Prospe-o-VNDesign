/**
 * Limpeza de duplicados: grupos de leads com o mesmo email, site ou nome, e qual
 * fica como principal (o mais avançado no pipeline; em empate, o mais antigo).
 */
import { z } from 'zod';
import type { LeadStatus } from './enums';

// Os textos dos motivos estão em DUPLICATE_REASON_LABELS (enums.ts).
import { LeadSchema } from './schemas';

export const DUPLICATE_REASONS = ['email', 'website', 'name'] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

export const DuplicateGroupSchema = z
  .object({
    key: z.string().meta({ description: 'Ids dos leads do grupo, ordenados e separados por vírgula' }),
    reasons: z.array(z.enum(DUPLICATE_REASONS)),
    primary_id: z.uuid().meta({ description: 'O sugerido para ficar (os outros juntam-se a ele)' }),
    leads: z.array(LeadSchema).meta({ description: 'O principal primeiro' }),
  })
  .meta({ id: 'DuplicateGroup' });
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

export const DuplicateIgnoreSchema = z
  .object({ ids: z.array(z.uuid()).min(2, { error: 'Escolhe pelo menos 2 leads.' }).max(20) })
  .meta({ id: 'DuplicateIgnore' });

/** Ordem do pipeline para escolher o principal (cliente primeiro; sem interesse e em pausa no fim). */
const STATUS_RANK: Record<LeadStatus, number> = {
  cliente: 0,
  proposta_enviada: 1,
  reuniao: 2,
  respondeu: 3,
  contactado: 4,
  identificado: 5,
  em_pausa: 6,
  sem_interesse: 7,
};

/** O lead que fica: o mais avançado; em empate, o mais antigo (número mais baixo). */
export function pickPrimary<L extends { id: string; number: number; status: LeadStatus; archived_at?: string | null }>(leads: readonly L[]): L {
  return [...leads].sort(
    (a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.number - b.number,
  )[0]!;
}

/** Junta os pares em grupos (se A=B e B=C, então A, B e C são o mesmo grupo). */
export function groupDuplicatePairs(pairs: readonly { lead_a: string; lead_b: string; reason: DuplicateReason }[]): { ids: string[]; reasons: DuplicateReason[] }[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  for (const { lead_a, lead_b } of pairs) {
    if (!parent.has(lead_a)) parent.set(lead_a, lead_a);
    if (!parent.has(lead_b)) parent.set(lead_b, lead_b);
    const ra = find(lead_a);
    const rb = find(lead_b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, { ids: Set<string>; reasons: Set<DuplicateReason> }>();
  for (const { lead_a, lead_b, reason } of pairs) {
    const root = find(lead_a);
    const g = groups.get(root) ?? { ids: new Set(), reasons: new Set() };
    g.ids.add(lead_a).add(lead_b);
    g.reasons.add(reason);
    groups.set(root, g);
  }
  return [...groups.values()].map((g) => ({
    ids: [...g.ids].sort(),
    reasons: DUPLICATE_REASONS.filter((r) => g.reasons.has(r)),
  }));
}

