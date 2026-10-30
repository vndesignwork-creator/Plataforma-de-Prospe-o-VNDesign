/**
 * Funil por período (Estatísticas): dos leads que entraram nos últimos N dias,
 * quantos chegaram a cada fase e quanto tempo demoraram desde a anterior.
 * Calculado na base de dados (stats_cohort_funnel, migração 20261108001800).
 */
import { z } from 'zod';
import { LeadStatusSchema } from './schemas';

export const FUNNEL_WINDOWS = ['30', '90', '365'] as const;
export type FunnelWindow = (typeof FUNNEL_WINDOWS)[number];
export const FUNNEL_WINDOW_LABELS: Record<FunnelWindow, string> = { '30': '30 dias', '90': '3 meses', '365': '12 meses' };

export const CohortFunnelQuerySchema = z.object({ days: z.enum(FUNNEL_WINDOWS).default('90') }).meta({ id: 'CohortFunnelQuery' });

export const CohortFunnelSchema = z
  .object({
    from: z.string().meta({ description: 'Leads que entraram desde este dia (AAAA-MM-DD)' }),
    stages: z.array(
      z.object({
        stage: LeadStatusSchema,
        reached: z.int().meta({ description: 'Quantos chegaram a esta fase (ou a uma seguinte)' }),
        avg_days: z.number().nullable().meta({ description: 'Dias, em média, desde a fase anterior' }),
      }),
    ),
  })
  .meta({ id: 'CohortFunnel' });
export type CohortFunnel = z.infer<typeof CohortFunnelSchema>;
