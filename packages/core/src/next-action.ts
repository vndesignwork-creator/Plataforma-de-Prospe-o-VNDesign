/**
 * De onde veio a próxima ação de um lead (para a ficha mostrar "veio da
 * importação", "adiado a 22/10"…), a partir da linha do tempo — sem guardar
 * nada novo: a última atividade que pôs aquela data.
 */
import type { Activity, Lead } from './schemas';

export type NextActionOrigin =
  | { kind: 'import' | 'api' | 'created'; at: string; actor_user_id: string | null }
  | { kind: 'snoozed' | 'scheduled' | 'edited'; at: string; actor_user_id: string | null; via_api: boolean };

export function nextActionOrigin(lead: Pick<Lead, 'next_action_on'>, activities: Activity[]): NextActionOrigin | null {
  if (!lead.next_action_on) return null;
  // Da mais recente para a mais antiga.
  const list = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const a of list) {
    const p = a.payload as Record<string, unknown>;
    const viaApi = !!a.actor_token_id;
    if ((a.type === 'follow_up_scheduled' || a.type === 'follow_up_done') && p.on === lead.next_action_on) {
      return { kind: p.snoozed ? 'snoozed' : 'scheduled', at: a.created_at, actor_user_id: a.actor_user_id, via_api: viaApi };
    }
    if (a.type === 'updated' && Array.isArray(p.fields) && p.fields.includes('next_action_on')) {
      return { kind: 'edited', at: a.created_at, actor_user_id: a.actor_user_id, via_api: viaApi };
    }
    if (a.type === 'created') {
      // A API grava pelo importador (origem "import") com um token de acesso.
      const kind = p.source === 'import' ? (viaApi ? 'api' : 'import') : 'created';
      return { kind, at: a.created_at, actor_user_id: a.actor_user_id };
    }
  }
  return null;
}
