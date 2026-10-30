/**
 * Opções soltas dentro das secções das Definições (cada funcionalidade, os cartões
 * e os campos mais procurados), para a pesquisa das Definições e o Ctrl+K
 * encontrarem "Tempo em dinheiro" ou "Limite por dia" e irem direto a elas.
 */
import type { Features } from '@vndesign/core';
import { FEATURE_BY_KEY, FEATURE_GROUPS } from './features-list';
import type { SettingsSection } from './settings-nav';

export type SettingsItem = {
  /** Âncora no endereço: /definicoes/<slug>#<id>. */
  id: string;
  slug: SettingsSection['slug'];
  label: string;
  /** Onde fica dentro da secção (ex.: "Tempo", "Sobre ti"). */
  where?: string;
  keywords?: string;
  /** O texto no ecrã (título ou rótulo) onde se vai parar; por omissão o label. */
  find?: string;
  /** Procurar o texto só nos títulos (quando o mesmo nome também é um interruptor). */
  heading?: boolean;
  /** Só aparece no ecrã com estas funcionalidades ligadas. */
  requires?: (keyof Features)[];
};

const slugify = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FEATURE_ITEMS: SettingsItem[] = FEATURE_GROUPS.flatMap((group) =>
  group.parts.flatMap((part) =>
    part.keys.map((key) => {
      const f = FEATURE_BY_KEY.get(key)!;
      return {
        id: `func-${key}`,
        slug: 'funcionalidades' as const,
        label: f.label,
        where: part.title ?? group.title,
        keywords: `ligar desligar ${f.description}`,
      };
    }),
  ),
);

const ITEMS: Omit<SettingsItem, 'id'>[] = [
  { slug: 'assinatura', label: 'Nome', where: 'Sobre ti', keywords: 'meu_nome o meu nome' },
  { slug: 'assinatura', label: 'Cargo', where: 'Sobre ti' },
  { slug: 'assinatura', label: 'Telefone', where: 'Sobre ti', keywords: 'meu_telefone telemóvel' },
  { slug: 'assinatura', label: 'Link do portfólio', where: 'Portefólio', keywords: 'portefólio portfolio trabalhos' },
  { slug: 'assinatura', label: 'Portfólio de design gráfico', where: 'Portefólio', keywords: 'portefólio behance logótipos flyers posts' },
  { slug: 'assinatura', label: 'Links de projetos', find: 'Projetos (um link por linha)', where: 'Portefólio', keywords: 'projetos exemplos sites feitos' },
  { slug: 'conta', label: 'Fotografia e nome', find: 'Perfil', heading: true, keywords: 'perfil foto avatar nome no menu' },
  { slug: 'conta', label: 'Nova palavra-passe', keywords: 'password mudar alterar' },
  { slug: 'conta', label: 'Tema', keywords: 'escuro claro modo noturno dark light cores' },
  { slug: 'conta', label: 'Notificações no telemóvel e no computador', keywords: 'push avisos alertas notificações' },
  { slug: 'conta', label: 'Horário de silêncio', keywords: 'noite fim de semana não incomodar notificações' },
  { slug: 'conta', label: 'Verificação em dois passos', keywords: '2fa autenticação código segurança' },
  { slug: 'conta', label: 'Sessões abertas', keywords: 'terminar sessão dispositivos sair' },
  { slug: 'email', label: 'Serviço de email', keywords: 'gmail outlook smtp fornecedor' },
  { slug: 'email', label: 'Nome que o cliente vê', keywords: 'remetente from nome de envio' },
  { slug: 'email', label: 'Limite por dia', keywords: 'limite diário spam máximo de emails' },
  { slug: 'email', label: 'Servidor SMTP', keywords: 'porta smtp' },
  { slug: 'email', label: 'Servidor IMAP', keywords: 'respostas ler caixa de entrada' },
  { slug: 'email', label: 'Endereço do webmail', find: 'Endereço do webmail (opcional)', keywords: 'webmail' },
  { slug: 'lembretes', label: 'Dias até ao follow-up', keywords: 'follow-up próxima ação dias' },
  { slug: 'lembretes', label: 'Sequência de follow-ups por email', keywords: 'follow-ups automáticos passos' },
  { slug: 'lembretes', label: 'Linha de opt-out (RGPD)', keywords: 'opt_out anular subscrição rgpd' },
  { slug: 'lembretes', label: 'Arquivo automático', keywords: 'arquivar sem interesse' },
  { slug: 'lembretes', label: 'Limpar registos antigos', find: 'Apagar os registos “Lead editado” antigos', keywords: 'lead editado apagar histórico limpeza' },
  { slug: 'lembretes', label: 'Resumo diário por email', keywords: 'resumo manhã digest' },
  { slug: 'lembretes', label: 'Sequência multicanal na Prospeção', keywords: 'whatsapp ligar passos prospeção' },
  { slug: 'propostas', label: 'Validade (dias)', keywords: 'validade proposta' },
  { slug: 'propostas', label: 'Nota de IVA', keywords: 'iva isento art. 53' },
  { slug: 'propostas', label: 'Condições de pagamento', keywords: 'pagamento sinal' },
  { slug: 'propostas', label: 'Próximos passos (fim do PDF)', keywords: 'pdf proposta' },
  {
    slug: 'funcionalidades',
    label: 'Valor por hora',
    heading: true,
    keywords: '€ por hora tarifa preço à hora tempo em dinheiro',
    requires: ['projects', 'time_tracking', 'time_value'],
  },
  {
    slug: 'funcionalidades',
    label: 'Tempos do Pomodoro',
    find: 'Pomodoro',
    heading: true,
    keywords: 'pomodoro minutos pausa foco som',
    requires: ['projects', 'time_tracking', 'pomodoro'],
  },
  {
    slug: 'funcionalidades',
    label: 'Perguntas do briefing',
    find: 'Briefing online',
    heading: true,
    keywords: 'briefing perguntas',
    requires: ['projects', 'briefing'],
  },
  {
    slug: 'funcionalidades',
    label: 'Arranque: plano de pagamentos',
    find: 'Arranque automático do projeto',
    heading: true,
    keywords: 'arranque sinal prestações prazo revisões',
    requires: ['projects', 'project_kickoff'],
  },
  {
    slug: 'funcionalidades',
    label: 'NIF e condições do contrato',
    find: 'Contratos',
    heading: true,
    keywords: 'nif condições gerais contrato',
    requires: ['contracts'],
  },
  {
    slug: 'funcionalidades',
    label: 'Extras da calculadora',
    find: 'Calculadora de orçamento',
    heading: true,
    keywords: 'orçamento extras páginas preço',
    requires: ['quote_calculator'],
  },
  { slug: 'funcionalidades', label: 'Calendário no telemóvel', keywords: 'ical subscrever google calendar apple agenda' },
  { slug: 'funcionalidades', label: 'Avaliações no Google', keywords: 'review avaliação link google' },
  { slug: 'funcionalidades', label: 'Cópia de segurança semanal', keywords: 'backup excel exportar cópia' },
  { slug: 'ia', label: 'Chaves de IA', keywords: 'chave api key fornecedor' },
  { slug: 'ia', label: 'Email com IA', where: 'Onde usar', keywords: 'modelo escrever emails' },
  { slug: 'ia', label: 'Gerador de leads', where: 'Onde usar', heading: true, keywords: 'modelo gerar leads' },
  { slug: 'ia', label: 'Aparece nas IAs? (GEO)', where: 'Onde usar', keywords: 'geo modelo' },
];

export const SETTINGS_ITEMS: SettingsItem[] = [...FEATURE_ITEMS, ...ITEMS.map((i) => ({ ...i, id: `${i.slug}-${slugify(i.label)}` }))];
const BY_ID = new Map(SETTINGS_ITEMS.map((i) => [i.id, i]));

/** Todas as palavras escritas têm de aparecer (no nome, no "onde" ou nas palavras-chave); o nome conta mais. */
export function searchSettingsItems(query: string, slugs: ReadonlySet<string>, limit = 8): SettingsItem[] {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  return SETTINGS_ITEMS.filter((i) => slugs.has(i.slug))
    .map((i) => {
      const label = normalize(i.label);
      const hay = `${label} ${normalize(i.where ?? '')} ${normalize(i.keywords ?? '')}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : words.every((w) => label.includes(w)) ? 2 : 3;
      return { i, score };
    })
    .filter((r): r is { i: SettingsItem; score: number } => r !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((r) => r.i);
}

/** Com uma funcionalidade necessária desligada, leva ao interruptor dela. */
export function settingsItemTarget(item: SettingsItem, features: Features | undefined): { href: string; missing?: string } {
  const off = features ? item.requires?.find((k) => !features[k]) : undefined;
  if (off) return { href: `/definicoes/funcionalidades#func-${off}`, missing: FEATURE_BY_KEY.get(off)?.label };
  return { href: `/definicoes/${item.slug}#${item.id}` };
}

let pending = 0;

/**
 * Depois de abrir a secção, procura a opção no ecrã (os dados demoram um instante a
 * chegar), desliza até ela e destaca-a por uns segundos.
 */
export function revealSetting(hash: string) {
  const item = BY_ID.get(decodeURIComponent(hash.replace(/^#/, '')));
  if (!item) return;
  const run = ++pending;
  const path = `/definicoes/${item.slug}`;
  const text = normalize(item.find ?? item.label);
  const started = Date.now();
  const tick = () => {
    if (run !== pending) return;
    const el = window.location.pathname === path ? findText(text, item.heading) : null;
    if (el) {
      const box = (el.closest('li, fieldset, [data-setting-row]') as HTMLElement | null) ?? el.parentElement ?? el;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.animate?.(
        [
          { boxShadow: '0 0 0 3px var(--accent)', borderRadius: '0.5rem' },
          { boxShadow: '0 0 0 3px transparent', borderRadius: '0.5rem' },
        ],
        {
          duration: 2600,
          easing: 'ease-in',
        },
      );
      return;
    }
    if (Date.now() - started < 8000) window.setTimeout(tick, 150);
  };
  tick();
}

function findText(text: string, headingOnly?: boolean): HTMLElement | null {
  const main = document.querySelector('main') ?? document.body;
  const clean = (el: HTMLElement) =>
    normalize(el.textContent ?? '')
      .replace(/\*$/, '')
      .trim();
  // Primeiro os nomes das funcionalidades (o grupo "Projetos" também tem um título igual).
  const selectors = headingOnly ? ['h2, h3, h4'] : ['[data-setting-label]', 'h2, h3, h4, legend, label'];
  for (const selector of selectors) {
    const nodes = Array.from(main.querySelectorAll<HTMLElement>(selector));
    const el = nodes.find((n) => clean(n) === text) ?? nodes.find((n) => clean(n).startsWith(text));
    if (el) return el;
  }
  return null;
}
