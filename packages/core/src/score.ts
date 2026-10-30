/**
 * Prioridade dos leads: a pontuação (0–100) é calculada pela base de dados
 * (vnd_lead_score, migrações 20261028000100 e 20261108001700) sempre que o lead muda. Aqui só se
 * traduz em "quente / morno / frio" para a plataforma.
 */
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export const LEAD_TEMPERATURE_META: Record<LeadTemperature, { label: string; emoji: string; min: number }> = {
  hot: { label: 'Quente', emoji: '🔥', min: 60 },
  warm: { label: 'Morno', emoji: '🌤️', min: 35 },
  cold: { label: 'Frio', emoji: '❄️', min: 0 },
};

export function leadTemperature(score: number | null | undefined): LeadTemperature {
  const s = score ?? 0;
  if (s >= LEAD_TEMPERATURE_META.hot.min) return 'hot';
  if (s >= LEAD_TEMPERATURE_META.warm.min) return 'warm';
  return 'cold';
}
