/**
 * Criar uma tarefa a escrever como se fala: "Ligar à Clínica Sorriso sexta às 10h"
 * → título "Ligar à Clínica Sorriso", prazo (a próxima sexta), hora 10:00 e a pista
 * do lead ("Clínica Sorriso"). Só reconhece formas claras; o resto fica no título.
 */
import { addDays } from './format';

export interface ParsedTaskPhrase {
  /** O texto sem a data e a hora reconhecidas. */
  title: string;
  /** Prazo (AAAA-MM-DD) ou null. */
  due_on: string | null;
  /** Hora "HH:MM" (para o lembrete) ou null. */
  time: string | null;
  /** Nome (ou "#12") de um lead que parece estar no texto. */
  leadHint: string | null;
  /** O que foi reconhecido (para mostrar). */
  matched: string[];
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_RE = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const monthIndex = (name: string) => MONTHS.map(fold).indexOf(fold(name));

const NUMBERS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const toNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUMBERS[fold(s)] ?? NaN));

/** 0 = domingo … 6 = sábado. */
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** Limite de palavra que conta com letras acentuadas (o \b do JavaScript não conta: "amanhã"). */
const BOUNDARY = String.raw`(?:(?<![\p{L}\d])(?=[\p{L}\d])|(?<=[\p{L}\d])(?![\p{L}\d]))`;
const R = (re: RegExp) => new RegExp(re.source.replaceAll('\\b', BOUNDARY), re.flags.includes('u') ? re.flags : `${re.flags}u`);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const weekday = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).getUTCDay();
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const validDate = (y: number, m: number, d: number) => m >= 0 && m < 12 && d >= 1 && d <= daysInMonth(y, m);

/** Preposições que ficam a sobrar antes da data/hora ("na sexta", "até amanhã", "às 10h"). */
const LEAD_IN = String.raw`(?:(?:at[ée]|para|na|no|em|ao|à|a|dia|de|do|da)\s+)*`;

type DateRule = { re: RegExp; date: (m: RegExpExecArray, today: string, text: string) => string | null };

const DATE_RULES: DateRule[] = [
  { re: R(/\bdepois de amanh[ãa]\b/iu), date: (_m, t) => addDays(t, 2) },
  { re: R(/\bamanh[ãa]\b/iu), date: (_m, t) => addDays(t, 1) },
  { re: R(/\bhoje\b/iu), date: (_m, t) => t },
  {
    re: R(/\b(?:daqui a|dentro de|em)\s+(\d{1,3}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(dias?|semanas?|m[êe]s(?:es)?)\b/iu),
    date: (m, t) => {
      const n = toNumber(m[1]!);
      if (!Number.isFinite(n) || n <= 0) return null;
      const unit = fold(m[2]!);
      if (unit.startsWith('dia')) return addDays(t, n);
      if (unit.startsWith('semana')) return addDays(t, n * 7);
      const [y, mo, d] = t.split('-').map(Number) as [number, number, number];
      const target = new Date(Date.UTC(y, mo - 1 + n, 1));
      return iso(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
    },
  },
  {
    re: R(/\b(?:pr[óo]xima semana|para a semana|semana que vem)\b/iu),
    date: (_m, t) => {
      const w = weekday(t);
      return addDays(t, ((8 - w) % 7) || 7);
    },
  },
  { re: R(/\bfim do m[êe]s\b/iu), date: (_m, t) => {
      const [y, mo] = t.split('-').map(Number) as [number, number];
      return iso(y, mo - 1, daysInMonth(y, mo - 1));
    } },
  {
    // Em minúsculas (ou com "-feira"): "Quinta do Lago" e "Segunda versão" não são dias.
    re: R(/\b(?:[Pp]r[óo]xim[ao]\s+)?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|(?:Segunda|Ter[çc]a|Quarta|Quinta|Sexta)(?=-feira))(-feira)?\b/u),
    date: (m, t, text) => {
      const before = text.slice(0, m.index).trim();
      // Primeira palavra ("Segunda rápida") ou depois de um artigo ("a segunda proposta"): não é o dia.
      if (!m[2] && (!before || /(?:^|\s)(?:a|o|um|uma|da|do|na\s+tua|nesta)$/i.test(before))) return null;
      const target = WEEKDAYS[fold(m[1]!)]!;
      // O próximo dia com esse nome (hoje é sexta → a próxima sexta).
      return addDays(t, ((target - weekday(t) + 7) % 7) || 7);
    },
  },
  {
    re: R(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/u),
    date: (m, t) => {
      const [ty] = t.split('-').map(Number) as [number];
      const d = Number(m[1]);
      const mo = Number(m[2]) - 1;
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : ty;
      if (!validDate(y, mo, d)) return null;
      // Sem ano e já passou: é para o ano que vem.
      if (!m[3] && iso(y, mo, d) < t) y += 1;
      return validDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
  {
    re: R(new RegExp(String.raw`\b(?:dia\s+)?(\d{1,2})\s+de\s+(${MONTH_RE})\b`, 'iu')),
    date: (m, t) => {
      const [ty] = t.split('-').map(Number) as [number];
      const d = Number(m[1]);
      const mo = monthIndex(m[2]!);
      let y = ty;
      if (!validDate(y, mo, d)) return null;
      if (iso(y, mo, d) < t) y += 1;
      return validDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
  {
    re: R(/\bdia\s+(\d{1,2})\b/iu),
    date: (m, t) => {
      const [ty, tm] = t.split('-').map(Number) as [number, number];
      const d = Number(m[1]);
      let y = ty;
      let mo = tm - 1;
      if (validDate(y, mo, d) && iso(y, mo, d) >= t) return iso(y, mo, d);
      // Já passou este mês: o mesmo dia no mês seguinte.
      mo += 1;
      if (mo > 11) [y, mo] = [y + 1, 0];
      return validDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
];

const TIME_RULES: { re: RegExp; time: (m: RegExpExecArray) => string | null }[] = [
  // "às 10h", "às 10", "às 10:30", "às 10h30", "pelas 15h"
  { re: R(/\b(?:[àa]s|pelas|por volta das)\s+(\d{1,2})(?:[:h](\d{2}))?\s*h?\b/iu), time: (m) => hhmm(m[1]!, m[2]) },
  // "10h", "10h30", "15:45"
  { re: R(/\b(\d{1,2})h(\d{2})?\b/iu), time: (m) => hhmm(m[1]!, m[2]) },
  { re: R(/\b(\d{1,2}):(\d{2})\b/u), time: (m) => hhmm(m[1]!, m[2]) },
];

function hhmm(h: string, m?: string): string | null {
  const hour = Number(h);
  const min = m ? Number(m) : 0;
  if (hour > 23 || min > 59) return null;
  return `${pad(hour)}:${pad(min)}`;
}

/** Tira o que foi reconhecido (e a preposição que o antecedia) do texto. */
function cut(text: string, m: RegExpExecArray): string {
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const trimmedBefore = before.replace(new RegExp(String.raw`\s*${BOUNDARY}${LEAD_IN}$`, 'iu'), (s) => (/\S/.test(s) ? ' ' : s));
  return `${trimmedBefore} ${after}`;
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(?:^|\s)(?:at[ée]|para|na|no|em|às|as|à|a|dia|de|,)\s*$/iu, '')
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')
    .trim();

/** "Ligar à Clínica Sorriso" → "Clínica Sorriso"; "Proposta #12" → "#12". */
function findLeadHint(title: string): string | null {
  const byNumber = /#(\d{1,6})(?!\d)/.exec(title);
  if (byNumber) return `#${byNumber[1]}`;
  const m = /(?:^|\s)(?:à|ao|a|da|do|das|dos|de|para a|para o|com a|com o|na|no|pela|pelo)\s+((?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][\p{L}\d&.'’-]*)(?:\s+(?:(?:de|da|do|das|dos|e|&)\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9&][\p{L}\d&.'’-]*)*)/u.exec(title);
  return m ? m[1]!.replace(/[.,;:]+$/, '') : null;
}

export function parseTaskPhrase(text: string, today: string): ParsedTaskPhrase {
  let rest = ` ${text} `;
  let due: string | null = null;
  let time: string | null = null;
  const matched: string[] = [];
  outer: for (const rule of DATE_RULES) {
    // Todas as ocorrências: a primeira pode não contar ("Segunda versão até sexta").
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
    for (const m of rest.matchAll(re) as IterableIterator<RegExpExecArray>) {
      const date = rule.date(m, today, rest);
      if (!date) continue;
      due = date;
      matched.push(m[0].trim());
      rest = cut(rest, m);
      break outer;
    }
  }
  for (const rule of TIME_RULES) {
    const m = rule.re.exec(rest);
    if (!m) continue;
    const t = rule.time(m);
    if (!t) continue;
    time = t;
    matched.push(m[0].trim());
    rest = cut(rest, m);
    break;
  }
  // Hora sem dia: é para hoje.
  if (time && !due) due = today;
  const title = matched.length ? tidy(rest) || text.trim() : text.trim();
  return { title, due_on: due, time, leadHint: findLeadHint(title), matched };
}
