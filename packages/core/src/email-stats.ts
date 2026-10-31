/**
 * Estatísticas dos emails enviados pela plataforma: abertura, clique e
 * resposta por modelo (137) e quando os emails são abertos (138).
 */
import { z } from 'zod';

export const EmailTemplateStatSchema = z.object({
  template: z.string().nullable().meta({ description: 'Nome do modelo (null = escrito à mão / sem modelo)' }),
  sent: z.int(),
  tracked: z.int().meta({ description: 'Enviados com o rastreio de aberturas ligado (base das percentagens de abertura e clique)' }),
  opened: z.int(),
  clicked: z.int(),
  replied: z.int(),
});
export type EmailTemplateStat = z.infer<typeof EmailTemplateStatSchema>;

export const EmailSlotSchema = z.object({ weekday: z.int(), from_hour: z.int(), to_hour: z.int(), opens: z.int() });
export type EmailSlot = z.infer<typeof EmailSlotSchema>;

export const EmailStatsSchema = z
  .object({
    days: z.int(),
    tracked: z.boolean().meta({ description: 'Há emails com o rastreio de aberturas ligado' }),
    templates: z.array(EmailTemplateStatSchema),
    heatmap: z.array(z.array(z.int())).meta({ description: '7 × 24: aberturas por dia da semana (0 = segunda) e hora (Lisboa)' }),
    best: z.array(EmailSlotSchema).meta({ description: 'Os melhores intervalos de 2 horas (mais aberturas)' }),
  })
  .meta({ id: 'EmailStats' });
export type EmailStats = z.infer<typeof EmailStatsSchema>;

export const EmailStatsQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

export const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Uma resposta conta para o último email enviado ao lead antes dela (até 30 dias depois). */
const REPLY_WINDOW_MS = 30 * 86_400_000;

export function statsByTemplate(
  sent: readonly { lead_id: string; at: string; template: string | null; tracking_id: string | null }[],
  tracking: ReadonlyMap<string, { opens: number; clicks: number }>,
  replies: readonly { lead_id: string; at: string }[],
): EmailTemplateStat[] {
  type Sent = (typeof sent)[number];
  const byLead = new Map<string, Sent[]>();
  for (const s of sent) byLead.set(s.lead_id, [...(byLead.get(s.lead_id) ?? []), s]);
  for (const list of byLead.values()) list.sort((a, b) => a.at.localeCompare(b.at));
  const repliedTo = new Set<Sent>();
  for (const r of replies) {
    const before = (byLead.get(r.lead_id) ?? []).filter((s) => s.at <= r.at);
    const last = before.at(-1);
    if (last && new Date(r.at).getTime() - new Date(last.at).getTime() <= REPLY_WINDOW_MS) repliedTo.add(last);
  }
  const rows = new Map<string, EmailTemplateStat>();
  for (const s of sent) {
    const key = s.template?.trim() || '';
    const row = rows.get(key) ?? { template: key || null, sent: 0, tracked: 0, opened: 0, clicked: 0, replied: 0 };
    row.sent++;
    const t = s.tracking_id ? tracking.get(s.tracking_id) : undefined;
    if (t) row.tracked++;
    if (t && t.opens > 0) row.opened++;
    if (t && t.clicks > 0) row.clicked++;
    if (repliedTo.has(s)) row.replied++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.sent - a.sent);
}

const lisbon = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Aberturas por dia da semana (0 = segunda) e hora, na hora de Lisboa. */
export function openHeatmap(openedAt: readonly string[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const iso of openedAt) {
    const parts = lisbon.formatToParts(new Date(iso));
    const day = WEEKDAY_INDEX[parts.find((p) => p.type === 'weekday')?.value ?? ''];
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (day === undefined || !Number.isFinite(hour)) continue;
    grid[day]![hour % 24]!++;
  }
  return grid;
}

/** Os melhores intervalos de 2 horas (sem se sobreporem), com pelo menos 2 aberturas. */
export function bestSlots(grid: readonly (readonly number[])[], count = 3): EmailSlot[] {
  const slots: EmailSlot[] = [];
  grid.forEach((hours, weekday) => {
    for (let h = 0; h < 23; h++) slots.push({ weekday, from_hour: h, to_hour: h + 2, opens: (hours[h] ?? 0) + (hours[h + 1] ?? 0) });
  });
  const picked: EmailSlot[] = [];
  for (const s of slots.sort((a, b) => b.opens - a.opens || a.weekday - b.weekday || a.from_hour - b.from_hour)) {
    if (s.opens < 2 || picked.length >= count) break;
    if (picked.some((p) => p.weekday === s.weekday && Math.abs(p.from_hour - s.from_hour) < 2)) continue;
    picked.push(s);
  }
  return picked;
}

/** "terça entre as 9h e as 11h". */
export function slotLabel(s: Pick<EmailSlot, 'weekday' | 'from_hour' | 'to_hour'>): string {
  return `${WEEKDAY_NAMES[s.weekday]} entre as ${s.from_hour}h e as ${s.to_hour}h`;
}
