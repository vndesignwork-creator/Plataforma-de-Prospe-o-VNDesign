/**
 * Formulário do site: quem preenche o contacto no site (ex.: vndesign.pt) entra
 * logo como lead, com uma tarefa para responder hoje e uma notificação.
 * Aceita os nomes de campo habituais (pt e en, Bricks, Contact Form 7, Elementor)
 * e, quando não os reconhece, adivinha pelo conteúdo (email, telefone, mensagem).
 */
import { z } from 'zod';

export const SiteFormSettingsSchema = z.object({
  /** Código secreto do endereço público (null = desligado). */
  token: z.string().nullable().default(null),
});
export type SiteFormSettings = z.infer<typeof SiteFormSettingsSchema>;
export const DEFAULT_SITE_FORM: SiteFormSettings = { token: null };

export const SiteFormToggleSchema = z
  .object({
    enabled: z.boolean(),
    /** Gerar um código novo (o endereço antigo deixa de funcionar). */
    rotate: z.boolean().optional().default(false),
  })
  .meta({ id: 'SiteFormToggle' });

export interface SiteFormSubmission {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  website: string | null;
  service: string | null;
}

const ALIASES: Record<keyof SiteFormSubmission, RegExp> = {
  name: /^(nome|name|your-name|first_?name|fullname|full_?name|nome_?completo)$/i,
  email: /^(email|e-mail|mail|your-email|email_?address)$/i,
  phone: /^(telefone|telemovel|telemóvel|phone|tel|your-phone|mobile|contacto_?telefonico|whatsapp)$/i,
  company: /^(empresa|company|organizacao|organização|negocio|negócio|business|your-company)$/i,
  message: /^(mensagem|message|your-message|msg|comentario|comentário|pedido|descricao|descrição|detalhes)$/i,
  website: /^(site|website|url|your-website|pagina|página)$/i,
  service: /^(servico|serviço|service|assunto|subject|your-subject|interesse)$/i,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{9,20}$/;
const clip = (v: string | null, max: number) => (v ? v.trim().slice(0, max) || null : null);
/** Campos internos (honeypot, redirecionamento, plugins) não contam. */
const INTERNAL = /^(_|form[-_]?id$|post[-_]?id$|referrer|action$|nonce|g-recaptcha|cf-turnstile|h-captcha)/i;

/** Lê os campos de um formulário (nomes conhecidos primeiro; o resto pelo conteúdo). */
export function parseSiteFormFields(fields: Record<string, string>): SiteFormSubmission {
  const out: SiteFormSubmission = { name: null, email: null, phone: null, company: null, message: null, website: null, service: null };
  const unknown: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(fields)) {
    const value = String(rawValue ?? '').trim();
    // "form-field-abc123" / "fields[name]" / "your-name" → nome simples.
    const key = rawKey.replace(/^fields\[(.+)\]$/, '$1').replace(/^form[-_]field[-_]/i, '').trim();
    if (!value || INTERNAL.test(key)) continue;
    const hit = (Object.keys(ALIASES) as (keyof SiteFormSubmission)[]).find((k) => ALIASES[k].test(key));
    if (hit && !out[hit]) out[hit] = value;
    else unknown.push(value);
  }
  // Campos com nomes desconhecidos (ex.: ids do Bricks): pelo conteúdo.
  for (const value of unknown) {
    if (!out.email && EMAIL.test(value)) out.email = value;
    else if (!out.phone && PHONE.test(value) && (value.match(/\d/g)?.length ?? 0) >= 9) out.phone = value;
    else if (!out.website && /^(https?:\/\/|www\.)\S+$/i.test(value)) out.website = value;
    else if (!out.message && (value.length > 40 || /\s.*\s.*\s/.test(value))) out.message = value;
    else if (!out.name && value.length <= 80) out.name = value;
  }
  return {
    name: clip(out.name, 120),
    email: out.email && EMAIL.test(out.email) ? clip(out.email.toLowerCase(), 254) : null,
    phone: clip(out.phone, 40),
    company: clip(out.company, 160),
    message: clip(out.message, 3000),
    website: clip(out.website, 300),
    service: clip(out.service, 120),
  };
}

/** O HTML pronto a colar no site (Bricks: elemento "Código"), que envia sem sair da página. */
export function siteFormSnippet(endpoint: string): string {
  return `<form class="vnd-form" action="${endpoint}" method="post">
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <label>Nome <input type="text" name="nome" required></label>
  <label>Email <input type="email" name="email" required></label>
  <label>Telefone <input type="tel" name="telefone"></label>
  <label>Empresa <input type="text" name="empresa"></label>
  <label>Mensagem <textarea name="mensagem" rows="4" required></textarea></label>
  <button type="submit">Enviar</button>
  <p class="vnd-form-status" role="status"></p>
</form>
<script>
document.querySelectorAll('form.vnd-form').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = form.querySelector('.vnd-form-status');
    status.textContent = 'A enviar…';
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (r) { status.textContent = r.message || 'Obrigado! Respondemos em breve.'; if (r.ok) form.reset(); })
      .catch(function () { status.textContent = 'Não foi possível enviar. Tente outra vez ou ligue-nos.'; });
  });
});
</script>`;
}
