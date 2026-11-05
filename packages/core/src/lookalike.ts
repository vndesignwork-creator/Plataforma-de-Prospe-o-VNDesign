/**
 * "Parecidos com os meus clientes": agrupa os clientes (setor + cidade) e propõe
 * pesquisas para o Gerar leads, das mais fortes (mais clientes) para as outras.
 */
export interface LookalikeClient {
  company_name: string;
  city: string | null;
  sector: { id: string; name: string } | null;
  services?: string[] | null;
}

export interface LookalikeSuggestion {
  key: string;
  sector_id: string | null;
  sector_name: string | null;
  city: string | null;
  services: string[];
  clients: number;
  examples: string[];
  query: string;
}

const clean = (s: string | null | undefined) => (s ?? '').trim();
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function lookalikeSuggestions(clients: readonly LookalikeClient[], max = 5): LookalikeSuggestion[] {
  const groups = new Map<string, { sector: LookalikeClient['sector']; city: string | null; names: string[]; services: Map<string, number> }>();
  for (const c of clients) {
    if (!c.sector && !clean(c.city)) continue;
    const city = clean(c.city) || null;
    const key = `${c.sector?.id ?? '-'}|${city ? fold(city) : '-'}`;
    const g = groups.get(key) ?? { sector: c.sector, city, names: [], services: new Map<string, number>() };
    g.names.push(c.company_name);
    for (const s of c.services ?? []) g.services.set(s, (g.services.get(s) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const services = [...g.services.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 3);
      const examples = g.names.slice(0, 3);
      const what = g.sector ? g.sector.name.toLowerCase() : 'negócios';
      const where = g.city ? ` em ${g.city} e arredores` : '';
      return {
        key,
        sector_id: g.sector?.id ?? null,
        sector_name: g.sector?.name ?? null,
        city: g.city,
        services,
        clients: g.names.length,
        examples,
        query: `Empresas de ${what}${where} parecidas com os meus clientes (${examples.join(', ')}): negócios do mesmo tipo e tamanho, com o site fraco, antigo ou sem site.`,
      };
    })
    .sort((a, b) => b.clients - a.clients || Number(!!b.sector_id) - Number(!!a.sector_id))
    .slice(0, max);
}
