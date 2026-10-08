import type { FollowUpInput, Lead } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { getLead } from './leads';

/** Follow-up feito (com ou sem nova próxima ação) ou adiado. */
export async function completeFollowUp(ctx: ApiContext, leadId: string, input: FollowUpInput): Promise<Lead> {
  await getLead(ctx, leadId);
  const { error } = await ctx.supabase.rpc('complete_follow_up', {
    p_lead_id: leadId,
    p_action: input.action,
    p_days: input.days ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw fromPostgrest(error, 'Lead não encontrado');
  return getLead(ctx, leadId);
}
