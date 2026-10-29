/**
 * Exportação de leads (CSV/XLSX) com as mesmas colunas da folha original,
 * para que um ficheiro exportado possa ser reimportado sem mapeamento manual.
 */
import { LEAD_CHANNEL_META, LEAD_STATUS_META, LOST_REASON_LABELS, MOBILE_STATUS_META } from './enums';
import type { Lead } from './schemas';
import { serviceLabel, type ServiceInfo } from './services';
import { formatCustomValue, type CustomField } from './custom-fields';
import { toPlainText } from './rich-text';

export type ExportValue = string | number | null;
export type ExportKind = 'text' | 'number' | 'integer' | 'date' | 'currency' | 'url';

export interface ExportColumn {
  header: string;
  kind: ExportKind;
  width: number;
  value: (lead: Lead) => ExportValue;
}

const withEmoji = (emoji: string, label: string) => (emoji ? `${emoji} ${label}` : label);

/** Colunas da exportação; `services` dá os nomes dos serviços do workspace e `fields` os campos personalizados (no fim). */
export function exportColumns(services?: readonly ServiceInfo[], fields: readonly CustomField[] = []): ExportColumn[] {
  return [
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
    { header: 'Email de prospeção', kind: 'text', width: 60, value: (l) => (l.email_body ? toPlainText(l.email_body) : l.email_body) },
    // Volta a ser lida pela importação (coluna "Serviços").
    {
      header: 'Serviços',
      kind: 'text',
      width: 30,
      value: (l) => (l.services?.length ? l.services.map((s) => serviceLabel(s, services)).join('; ') : null),
    },
    { header: 'Etiquetas', kind: 'text', width: 24, value: (l) => (l.tags?.length ? l.tags.join('; ') : null) },
    { header: 'Nota afixada', kind: 'text', width: 30, value: (l) => l.pinned_note ?? null },
    { header: 'Motivo (sem interesse)', kind: 'text', width: 22, value: (l) => (l.lost_reason ? LOST_REASON_LABELS[l.lost_reason] : null) },
    ...fields.map((f): ExportColumn => ({
      header: f.label,
      kind: f.type === 'number' ? 'number' : 'text',
      width: 18,
      value: (l) => {
        const v = l.custom?.[f.key];
        if (v === undefined || v === null || v === '') return null;
        return f.type === 'number' && typeof v === 'number' ? v : formatCustomValue(f, v);
      },
    })),
  ];
}

export const EXPORT_COLUMNS: ExportColumn[] = exportColumns();

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
export function leadsToCsv(leads: readonly Lead[], services?: readonly ServiceInfo[], fields: readonly CustomField[] = []): string {
  const columns = exportColumns(services, fields);
  const header = columns.map((c) => csvCell(c.header, 'text')).join(';');
  const lines = leads.map((l) => columns.map((c) => csvCell(c.value(l), c.kind)).join(';'));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}
