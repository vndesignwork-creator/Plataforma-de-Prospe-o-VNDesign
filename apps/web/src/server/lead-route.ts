/**
 * Páginas da ficha (/leads/[id]/…): o segmento pode ser o endereço amigável
 * ("13-o-quintal"), só o número ("13") ou o id interno antigo (UUID). Devolve o
 * id interno para os componentes usarem na API e, se o endereço não for o
 * canónico (id antigo, nome mudado, só o número), redireciona para ele.
 */
import { leadSlug, parseLeadRef } from '@vndesign/core';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase';

type Search = Record<string, string | string[] | undefined>;

export async function resolveLeadRoute(ref: string, options: { suffix?: string; search?: Search } = {}): Promise<string> {
  const parsed = parseLeadRef(ref);
  if (!parsed) notFound();

  const supabase = await createSupabaseServerClient();
  let query = supabase.from('leads').select('id, number, company_name');
  if ('id' in parsed) {
    query = query.eq('id', parsed.id);
  } else {
    // O número é único por workspace: usa o workspace do utilizador (o mesmo que a API).
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) notFound();
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!membership) notFound();
    query = query.eq('workspace_id', membership.workspace_id).eq('number', parsed.number);
  }
  const { data: lead } = await query.maybeSingle();
  if (!lead) notFound();

  const canonical = leadSlug(lead as { number: number; company_name: string });
  if (decodeURIComponent(ref) !== canonical) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.search ?? {})) {
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v);
    }
    const query = qs.toString();
    redirect(`/leads/${canonical}${options.suffix ?? ''}${query ? `?${query}` : ''}`);
  }
  return lead.id as string;
}
