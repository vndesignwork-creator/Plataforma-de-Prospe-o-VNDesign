/**
 * Exportação de leads (CSV/XLSX) com as mesmas colunas da folha original,
 * para que um ficheiro exportado possa ser reimportado sem mapeamento manual.
 */
import { LEAD_CHANNEL_META, LEAD_STATUS_META, MOBILE_STATUS_META } from './enums';
import type { Lead } from './schemas';

export type ExportValue = string | number | null;
export type ExportKind = 'text' | 'number' | 'integer' | 'date' | 'currency' | 'url';

export interface ExportColumn {
  header: string;
  kind: ExportKind;
  width: number;
  value: (lead: Lead) => ExportValue;
}

const withEmoji = (emoji: string, label: string) => (emoji ? `${emoji} ${label}` : label);

export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: '#', kind: 'integer', width: 6, value: (l) => l.number },
  { header: 'Empresa', kind: 'text', width: 32, value: (l) => l.company_name },
  {
    header: 'Setor',
    kind: 'text',
    width: 20,
    value: (l) => (l.sector ? withEmoji(l.sector.emoji ?? '', l.sector.name) : null),
  },
  { header: 'Website', kind: 'url', width: 30, value: (l) => l.website },
  { header: 'Cidade', kind: 'text', width: 16, value: (l) => l.city },
  { header: 'Morada', kind: 'text', width: 28, value: (l) => l.address },
  { header: 'Problemas', kind: 'text', width: 40, value: (l) => l.problems },
  { header: 'PageSpeed', kind: 'integer', width: 11, value: (l) => l.pagespeed },
  {
    header: 'Mobile?',
    kind: 'text',
    width: 11,
    value: (l) => (l.mobile === 'desconhecido' ? '--' : withEmoji(MOBILE_STATUS_META[l.mobile].emoji, MOBILE_STATUS_META[l.mobile].label)),
  },
  { header: 'Email', kind: 'text', width: 28, value: (l) => l.email },
  { header: 'Telefone', kind: 'text', width: 16, value: (l) => l.phone },
  { header: 'Contacto', kind: 'text', width: 18, value: (l) => l.contact_name },
  {
    header: 'Estado',
    kind: 'text',
    width: 18,
    value: (l) => withEmoji(LEAD_STATUS_META[l.status].emoji, LEAD_STATUS_META[l.status].label),
  },
  {
    header: 'Canal',
    kind: 'text',
    width: 15,
    value: (l) => (l.channel ? withEmoji(LEAD_CHANNEL_META[l.channel].emoji, LEAD_CHANNEL_META[l.channel].label) : null),
  },
  { header: '1.º contacto', kind: 'date', width: 12, value: (l) => l.first_contact_on },
  { header: 'Último follow-up', kind: 'date', width: 14, value: (l) => l.last_follow_up_on },
  { header: 'Próxima ação', kind: 'text', width: 26, value: (l) => l.next_action_text },
  { header: 'Data da próxima ação', kind: 'date', width: 14, value: (l) => l.next_action_on },
  { header: 'Valor estimado (€)', kind: 'currency', width: 14, value: (l) => l.estimated_value },
  { header: 'Notas', kind: 'text', width: 40, value: (l) => l.notes },
  { header: 'Ângulo de abordagem', kind: 'text', width: 40, value: (l) => l.approach_angle },
  { header: 'Fonte', kind: 'url', width: 30, value: (l) => l.source_url },
  { header: 'Sugerido em', kind: 'date', width: 12, value: (l) => l.suggested_on },
  { header: 'Assunto do email', kind: 'text', width: 34, value: (l) => l.email_subject },
  { header: 'Email de prospeção', kind: 'text', width: 60, value: (l) => l.email_body },
];

/** "2026-10-08" → "08/10/2026" (formato da folha). */
function ptDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function csvCell(value: ExportValue, kind: ExportKind): string {
  if (value === null || value === undefined || value === '') return '';
  let s: string;
  if (kind === 'date') s = ptDate(String(value));
  else if (kind === 'currency' || kind === 'number') s = String(value).replace('.', ',');
  else s = String(value);
  // Proteção contra injeção de fórmulas no Excel (=, +, -, @ no início).
  if (kind === 'text' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV para o Excel em português: separador ";", vírgula decimal,
 * datas DD/MM/AAAA e BOM UTF-8 (para os acentos e emojis aparecerem bem).
 */
export function leadsToCsv(leads: readonly Lead[]): string {
  const header = EXPORT_COLUMNS.map((c) => csvCell(c.header, 'text')).join(';');
  const lines = leads.map((l) => EXPORT_COLUMNS.map((c) => csvCell(c.value(l), c.kind)).join(';'));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}
