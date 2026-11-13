/**
 * Resumo da semana por email (à segunda-feira, pelo cron do resumo diário): os números da
 * semana que passou num só email, para ver o negócio sem abrir a plataforma. Liga/desliga em
 * Definições → Funcionalidades.
 */
import { z } from 'zod';
import { formatCurrency, formatDate } from './format';

export const WeeklyReportSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Último envio (o cron não manda dois na mesma semana). */
  last_sent_at: z.string().nullable().default(null),
});
export type WeeklyReportSettings = z.infer<typeof WeeklyReportSettingsSchema>;
export const DEFAULT_WEEKLY_REPORT: WeeklyReportSettings = { enabled: true, last_sent_at: null };

export interface WeeklyReportData {
  /** Primeiro e último dia da semana (AAAA-MM-DD). */
  from: string;
  to: string;
  new_leads: number;
  by_origin: { label: string; count: number }[];
  contacted: number;
  replied: number;
  proposals: number;
  won: number;
  /** null: sem pagamentos (funcionalidade desligada). */
  received: number | null;
  sites: { down: { name: string; checks: number }[]; slow: { name: string; ms: number }[] };
  ai: { spent_usd: number; month_usd: number; budget_usd: number | null };
  problems: { title: string; count: number }[];
  /** Endereço da plataforma (links do email). */
  url: string;
}

/** Um site é "lento" quando demora, em média, mais do que isto a responder. */
export const SLOW_SITE_MS = 3000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => formatDate(iso).slice(0, 5);

export function buildWeeklyReport(d: WeeklyReportData): { subject: string; text: string; html: string } {
  const period = `${shortDate(d.from)} a ${shortDate(d.to)}`;
  const sections: { title: string; lines: string[] }[] = [];

  const leads = [plural(d.new_leads, 'lead novo', 'leads novos')];
  if (d.by_origin.length) leads.push(`De onde vieram: ${d.by_origin.map((o) => `${o.label} ${o.count}`).join(' · ')}`);
  sections.push({ title: 'Leads', lines: leads });

  const sales = [
    `${plural(d.contacted, 'primeiro contacto', 'primeiros contactos')} · ${plural(d.replied, 'resposta', 'respostas')} · ${plural(d.proposals, 'proposta enviada', 'propostas enviadas')}`,
    d.won ? `🤝 ${plural(d.won, 'cliente novo', 'clientes novos')}` : 'Sem clientes novos esta semana.',
  ];
  if (d.received !== null) sales.push(`Recebido: ${formatCurrency(d.received, { decimals: false })}`);
  sections.push({ title: 'Vendas', lines: sales });

  const sites: string[] = [];
  for (const s of d.sites.down) sites.push(`🔴 ${s.name}: esteve em baixo (${plural(s.checks, 'verificação', 'verificações')})`);
  for (const s of d.sites.slow) sites.push(`🐢 ${s.name}: lento (${(s.ms / 1000).toFixed(1).replace('.', ',')} s em média)`);
  sections.push({ title: 'Sites dos clientes', lines: sites.length ? sites : ['Todos no ar e rápidos. ✅'] });

  const ai = [`Esta semana: ${usd(d.ai.spent_usd)} · este mês: ${usd(d.ai.month_usd)}${d.ai.budget_usd !== null ? ` de ${usd(d.ai.budget_usd)} (limite)` : ''}`];
  sections.push({ title: 'Inteligência artificial (estimativa)', lines: ai });

  sections.push({
    title: 'Problemas da plataforma por resolver',
    lines: d.problems.length ? d.problems.map((p) => `⚠️ ${p.title}${p.count > 1 ? ` (${p.count} vezes)` : ''}`) : ['Nenhum. ✅'],
  });

  const subject = `Resumo da semana — ${period}`;
  const text = [
    `Resumo da semana de ${period}`,
    '',
    ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `- ${l}`), '']),
    `Abrir a plataforma: ${d.url}`,
    'Para deixar de receber: Definições → Funcionalidades → Resumo da semana.',
  ].join('\n');
  const html = [
    `<h2 style="margin:0 0 12px;font-size:18px">Resumo da semana de ${esc(period)}</h2>`,
    ...sections.map(
      (s) =>
        `<h3 style="margin:18px 0 6px;font-size:15px">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
    ),
    `<p style="margin-top:20px"><a href="${esc(d.url)}">Abrir a plataforma</a></p>`,
    '<p style="color:#888;font-size:12px">Para deixar de receber: Definições → Funcionalidades → Resumo da semana.</p>',
  ].join('\n');
  return { subject, text, html };
}
