/**
 * Os emails chegam à caixa de entrada? Verifica o domínio de envio: SPF (quem pode
 * enviar em nome do domínio), DKIM (assinatura dos emails) e DMARC (o que fazer com os
 * que falham). Explica em português o que falta e o registo DNS a acrescentar.
 * (A consulta ao DNS é do servidor; aqui só as regras.)
 */
import { z } from 'zod';
import { isGenericEmailDomain } from './normalize';

export const DeliverabilityStatusSchema = z.enum(['ok', 'warn', 'fail', 'unknown']);
export type DeliverabilityStatus = z.infer<typeof DeliverabilityStatusSchema>;

export const DeliverabilityCheckSchema = z.object({
  key: z.enum(['spf', 'dkim', 'dmarc', 'mx']),
  label: z.string(),
  status: DeliverabilityStatusSchema,
  /** O que se encontrou (em português). */
  summary: z.string(),
  /** O que fazer (em português), se houver. */
  fix: z.string().nullable(),
  /** Registo DNS a acrescentar ou a corrigir. */
  record: z
    .object({ type: z.literal('TXT'), name: z.string(), value: z.string() })
    .nullable(),
  /** Os registos encontrados (para mostrar a quem perceber). */
  found: z.array(z.string()),
});
export type DeliverabilityCheck = z.infer<typeof DeliverabilityCheckSchema>;

export const DeliverabilityReportSchema = z
  .object({
    domain: z.string(),
    email: z.string(),
    /** Gmail/Hotmail…: o próprio serviço trata do SPF/DKIM/DMARC. */
    managed: z.boolean(),
    status: DeliverabilityStatusSchema,
    checks: z.array(DeliverabilityCheckSchema),
    checked_at: z.string(),
  })
  .meta({ id: 'DeliverabilityReport' });
export type DeliverabilityReport = z.infer<typeof DeliverabilityReportSchema>;

export const DeliverabilityQuerySchema = z.object({
  selector: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]{1,63}$/i, { error: 'Seletor inválido.' })
    .optional()
    .meta({ description: 'Seletor DKIM (o nome antes de ._domainkey), se souberes' }),
});

/** O que o SPF deve incluir, pelo servidor de envio (SMTP). */
const SPF_INCLUDES: { match: RegExp; include: string; name: string }[] = [
  { match: /hostinger/i, include: '_spf.mail.hostinger.com', name: 'Hostinger' },
  { match: /gmail|google/i, include: '_spf.google.com', name: 'Google Workspace' },
  { match: /office365|outlook|microsoft/i, include: 'spf.protection.outlook.com', name: 'Microsoft 365' },
  { match: /zoho\.eu/i, include: 'zoho.eu', name: 'Zoho' },
  { match: /zoho/i, include: 'zoho.com', name: 'Zoho' },
  { match: /titan/i, include: 'spf.titan.email', name: 'Titan' },
  { match: /ionos|1and1/i, include: '_spf.perfora.net', name: 'IONOS' },
  { match: /ovh/i, include: 'mx.ovh.com', name: 'OVH' },
  { match: /sendgrid/i, include: 'sendgrid.net', name: 'SendGrid' },
  { match: /brevo|sendinblue/i, include: 'spf.brevo.com', name: 'Brevo' },
  { match: /mailgun/i, include: 'mailgun.org', name: 'Mailgun' },
];

/** Seletores DKIM mais usados (Hostinger, Google, Microsoft, Zoho…). */
export const DKIM_SELECTORS = [
  'hostingermail1',
  'hostingermail-a',
  'hostingermail-b',
  'hostingermail-c',
  'google',
  'selector1',
  'selector2',
  'default',
  'dkim',
  'mail',
  'k1',
  's1',
  's2',
  'zmail',
  'zoho',
  'titan1',
  'smtp',
] as const;

export function expectedSpfInclude(smtpHost: string | null | undefined, provider?: string | null): { include: string; name: string } | null {
  const key = `${smtpHost ?? ''} ${provider ?? ''}`;
  const hit = SPF_INCLUDES.find((s) => s.match.test(key));
  return hit ? { include: hit.include, name: hit.name } : null;
}

const joinTxt = (record: string[] | string) => (Array.isArray(record) ? record.join('') : record).trim();

export interface DnsAnswers {
  /** TXT do domínio (null = o DNS não respondeu). */
  domainTxt: string[][] | null;
  /** TXT de _dmarc.domínio. */
  dmarcTxt: string[][] | null;
  /** DKIM encontrado: seletor → valor (vazio = nenhum dos seletores). */
  dkim: Record<string, string>;
  /** MX do domínio (null = o DNS não respondeu). */
  mx: string[] | null;
  /** Os seletores procurados. */
  selectors: string[];
}

/** Avalia o domínio de envio a partir das respostas do DNS. */
export function evaluateDeliverability(
  email: string,
  answers: DnsAnswers,
  options: { smtpHost?: string | null; provider?: string | null; now?: Date } = {},
): DeliverabilityReport {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const checkedAt = (options.now ?? new Date()).toISOString();
  if (isGenericEmailDomain(domain)) {
    return {
      domain,
      email,
      managed: true,
      status: 'ok',
      checked_at: checkedAt,
      checks: [
        {
          key: 'spf',
          label: 'Autenticação do domínio',
          status: 'ok',
          summary: `O ${domain} trata do SPF, DKIM e DMARC. Não tens nada a configurar.`,
          fix: 'Para enviar muitos emails de prospeção, um domínio teu (ex.: nome@vndesign.pt) passa mais confiança e chega melhor.',
          record: null,
          found: [],
        },
      ],
    };
  }

  const checks: DeliverabilityCheck[] = [];
  const expected = expectedSpfInclude(options.smtpHost, options.provider);

  // SPF ------------------------------------------------------------------------
  if (answers.domainTxt === null) {
    checks.push({ key: 'spf', label: 'SPF', status: 'unknown', summary: 'Não foi possível consultar o DNS do domínio agora.', fix: 'Tenta outra vez daqui a pouco.', record: null, found: [] });
  } else {
    const spf = answers.domainTxt.map(joinTxt).filter((r) => /^v=spf1(\s|$)/i.test(r));
    const suggested = `v=spf1 ${expected ? `include:${expected.include} ` : ''}~all`;
    if (!spf.length) {
      checks.push({
        key: 'spf',
        label: 'SPF',
        status: 'fail',
        summary: 'Não tem SPF: os servidores de email não sabem quem pode enviar em nome do teu domínio.',
        fix: `No painel do domínio (DNS), acrescenta um registo TXT${expected ? ` (para o ${expected.name})` : ''}.`,
        record: { type: 'TXT', name: '@', value: suggested },
        found: [],
      });
    } else if (spf.length > 1) {
      checks.push({
        key: 'spf',
        label: 'SPF',
        status: 'fail',
        summary: `Tem ${spf.length} registos SPF. Só pode haver um (com vários, nenhum conta).`,
        fix: 'Junta-os num só e apaga os outros.',
        record: { type: 'TXT', name: '@', value: suggested },
        found: spf,
      });
    } else {
      const record = spf[0]!;
      const includesExpected = !expected || record.toLowerCase().includes(`include:${expected.include.toLowerCase()}`);
      if (/\+all\b/i.test(record)) {
        checks.push({
          key: 'spf',
          label: 'SPF',
          status: 'fail',
          summary: 'O SPF termina em "+all": qualquer pessoa pode enviar em teu nome (os filtros desconfiam).',
          fix: 'Troca "+all" por "~all".',
          record: { type: 'TXT', name: '@', value: record.replace(/\+all\b/i, '~all') },
          found: spf,
        });
      } else if (!includesExpected) {
        checks.push({
          key: 'spf',
          label: 'SPF',
          status: 'warn',
          summary: `O SPF existe mas não inclui o ${expected!.name}, que é quem envia os teus emails.`,
          fix: `Acrescenta "include:${expected!.include}" ao registo (antes do "~all").`,
          record: { type: 'TXT', name: '@', value: record.replace(/\s*([~?-]all)\b/i, ` include:${expected!.include} $1`) },
          found: spf,
        });
      } else {
        checks.push({ key: 'spf', label: 'SPF', status: 'ok', summary: 'SPF certo: diz quem pode enviar em nome do teu domínio.', fix: null, record: null, found: spf });
      }
    }
  }

  // DKIM -----------------------------------------------------------------------
  const dkimFound = Object.entries(answers.dkim).filter(([, v]) => /v=DKIM1|k=rsa|p=/i.test(v));
  if (dkimFound.length) {
    checks.push({
      key: 'dkim',
      label: 'DKIM',
      status: 'ok',
      summary: `Os emails são assinados (seletor ${dkimFound.map(([s]) => `"${s}"`).join(', ')}).`,
      fix: null,
      record: null,
      found: dkimFound.map(([s]) => `${s}._domainkey.${domain}`),
    });
  } else {
    checks.push({
      key: 'dkim',
      label: 'DKIM',
      status: answers.domainTxt === null ? 'unknown' : 'warn',
      summary: 'Não encontrei a assinatura DKIM nos nomes mais usados.',
      fix: expected
        ? `No painel do ${expected.name}, ativa o DKIM do domínio (às vezes chama-se "Autenticação" ou "DKIM"); depois escreve aqui o seletor, se não for um dos habituais.`
        : 'No painel do teu serviço de email, ativa o DKIM do domínio e copia o registo que ele der para o DNS. Se já estiver ativo, escreve aqui o seletor (o nome antes de ._domainkey).',
      record: null,
      found: [],
    });
  }

  // DMARC ----------------------------------------------------------------------
  if (answers.dmarcTxt === null) {
    checks.push({ key: 'dmarc', label: 'DMARC', status: 'unknown', summary: 'Não foi possível consultar o DMARC agora.', fix: null, record: null, found: [] });
  } else {
    const dmarc = answers.dmarcTxt.map(joinTxt).filter((r) => /^v=DMARC1/i.test(r));
    const suggested = `v=DMARC1; p=none; rua=mailto:${email}`;
    if (!dmarc.length) {
      checks.push({
        key: 'dmarc',
        label: 'DMARC',
        status: 'warn',
        summary: 'Não tem DMARC. O Gmail e o Outlook pedem-no a quem envia muitos emails.',
        fix: 'Acrescenta este registo TXT. Começa em "p=none" (só observa); passadas umas semanas, sem problemas, muda para "p=quarantine".',
        record: { type: 'TXT', name: '_dmarc', value: suggested },
        found: [],
      });
    } else {
      const policy = /;\s*p=(\w+)/i.exec(dmarc[0]!)?.[1]?.toLowerCase() ?? 'none';
      checks.push({
        key: 'dmarc',
        label: 'DMARC',
        status: 'ok',
        summary:
          policy === 'none'
            ? 'DMARC ativo, só a observar (p=none). Quando o SPF e o DKIM estiverem certos há umas semanas, podes passar a "p=quarantine".'
            : `DMARC ativo (p=${policy}).`,
        fix: null,
        record: null,
        found: dmarc,
      });
    }
  }

  // MX (receber respostas) ---------------------------------------------------------
  if (answers.mx !== null) {
    checks.push(
      answers.mx.length
        ? { key: 'mx', label: 'Receber respostas (MX)', status: 'ok', summary: 'O domínio recebe emails: as respostas dos leads chegam.', fix: null, record: null, found: answers.mx }
        : {
            key: 'mx',
            label: 'Receber respostas (MX)',
            status: 'fail',
            summary: 'O domínio não recebe emails (sem MX): as respostas dos leads perdem-se.',
            fix: 'No painel do domínio, configura os registos MX do teu serviço de email.',
            record: null,
            found: [],
          },
    );
  }

  const order: DeliverabilityStatus[] = ['fail', 'warn', 'unknown', 'ok'];
  const status = order.find((s) => checks.some((c) => c.status === s)) ?? 'ok';
  return { domain, email, managed: false, status, checks, checked_at: checkedAt };
}
