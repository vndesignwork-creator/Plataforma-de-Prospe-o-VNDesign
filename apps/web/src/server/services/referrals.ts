/**
 * Indicações: quem este cliente já nos indicou e o registo de quando se lhe
 * pediu (para não andar a pedir todos os meses).
 */
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { createActivity } from './activities';
import { getLead } from './leads';

export interface ReferralSummary {
  /** Leads que este cliente indicou. */
  referred: { id: string; number: number; company_name: string; status: string }[];
  /** Última vez que lhe pedimos uma indicação (ISO) ou null. */
  asked_at: string | null;
}

export async function getReferrals(ctx: ApiContext, leadId: string): Promise<ReferralSummary> {
  await getLead(ctx, leadId);
  const [referred, asked] = await Promise.all([
    ctx.supabase
      .from('leads')
      .select('id, number, company_name, status')
      .eq('workspace_id', ctx.workspaceId)
      .eq('referred_by', leadId)
      .is('archived_at', null)
      .is('anonymized_at', null)
      .order('number', { ascending: false })
      .limit(50),
    ctx.supabase
      .from('lead_activities')
      .select('created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('lead_id', leadId)
      .eq('type', 'referral_asked')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (referred.error) throw fromPostgrest(referred.error);
  if (asked.error) throw fromPostgrest(asked.error);
  return {
    referred: (referred.data ?? []) as ReferralSummary['referred'],
    asked_at: ((asked.data ?? []) as { created_at: string }[])[0]?.created_at ?? null,
  };
}

/** "Já pedi": fica na linha do tempo e o pedido deixa de aparecer como por fazer. */
export async function markReferralAsked(ctx: ApiContext, leadId: string): Promise<ReferralSummary> {
  await createActivity(ctx, leadId, { type: 'referral_asked', body: 'Pedido de indicação' });
  return getReferrals(ctx, leadId);
}
