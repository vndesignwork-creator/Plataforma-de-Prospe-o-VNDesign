'use client';

/**
 * Definições → Email de envio: a caixa de correio de onde saem os emails aos leads
 * (Gmail, Hostinger ou outro SMTP). Cada utilizador liga a sua.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  MAIL_DEFAULT_DAILY_LIMIT,
  MAIL_PROVIDERS,
  MAIL_PROVIDER_PRESETS,
  WEBMAIL_PREFERENCE,
  formatDateTime,
  parseWebmailUrl,
  type MailAccount,
  type MailProvider,
  type ReplyCheckResult,
} from '@vndesign/core';
import { CheckCircle2, Inbox, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useMailAccount, usePreference, useSetPreference, useSignature } from '@/lib/queries';

function MailForm({ account, defaultName }: { account: MailAccount | null; defaultName: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    provider: (account?.provider ?? 'gmail') as MailProvider,
    from_name: account?.from_name ?? defaultName,
    from_email: account?.from_email ?? '',
    smtp_host: account?.provider === 'custom' ? account.smtp_host : '',
    smtp_port: String(account?.provider === 'custom' ? account.smtp_port : MAIL_PROVIDER_PRESETS.custom.port),
    smtp_secure: account?.provider === 'custom' ? account.smtp_secure : false,
    smtp_user: account?.provider === 'custom' ? (account.smtp_user ?? '') : '',
    password: '',
    daily_limit: String(account?.daily_limit ?? MAIL_DEFAULT_DAILY_LIMIT),
    bcc_self: account?.bcc_self ?? MAIL_PROVIDER_PRESETS.gmail.bccSelf,
    reply_detection: account?.reply_detection ?? true,
    imap_host: account?.provider === 'custom' ? (account.imap_host ?? '') : '',
    imap_port: String(account?.provider === 'custom' ? (account.imap_port ?? 993) : 993),
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  // Endereço do webmail para "Abrir no …" (lista Respostas): preferência de cada pessoa.
  const { data: savedWebmail } = usePreference<string>(WEBMAIL_PREFERENCE);
  const saveWebmail = useSetPreference<string>(WEBMAIL_PREFERENCE);
  const [webmail, setWebmail] = useState<string | null>(null);
  const webmailValue = webmail ?? (typeof savedWebmail === 'string' ? savedWebmail : '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const preset = MAIL_PROVIDER_PRESETS[form.provider];
  const custom = form.provider === 'custom';

  async function save() {
    if (webmailValue.trim() && !parseWebmailUrl(webmailValue)) {
      setErrors({ webmail: ['Escreve o endereço completo (ex.: https://outlook.live.com/mail/).'] });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      if (webmail !== null) await saveWebmail.mutateAsync(parseWebmailUrl(webmail) ?? '');
      await api('/mail-account', {
        method: 'PUT',
        body: {
          provider: form.provider,
          from_name: form.from_name,
          from_email: form.from_email,
          smtp_host: custom ? form.smtp_host : undefined,
          smtp_port: custom ? Number(form.smtp_port) || undefined : undefined,
          smtp_secure: custom ? form.smtp_secure : undefined,
          smtp_user: custom ? form.smtp_user || null : undefined,
          password: form.password || undefined,
          daily_limit: Number(form.daily_limit) || MAIL_DEFAULT_DAILY_LIMIT,
          bcc_self: form.bcc_self,
          reply_detection: form.reply_detection,
          imap_host: custom ? form.imap_host || null : undefined,
          imap_port: custom ? Number(form.imap_port) || null : undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: ['mail-account'] });
      setForm((f) => ({ ...f, password: '' }));
      toast.success('Conta de email guardada. Envia um email de teste para confirmar.');
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const { data } = await api<{ data: { sent_to: string } }>('/mail-account/test', { method: 'POST' });
      toast.success(`Email de teste enviado para ${data.sent_to}. Vê a tua caixa de entrada.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  async function checkReplies() {
    setChecking(true);
    try {
      const { data } = await api<{ data: ReplyCheckResult }>('/mail-account/check-replies', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['mail-account'] });
      const bounces = data.bounces ?? [];
      if (data.replies.length || bounces.length || data.out_of_office) {
        void qc.invalidateQueries({ queryKey: ['leads'] });
        void qc.invalidateQueries({ queryKey: ['today'] });
        const declined = data.replies.filter((r) => r.intent);
        const parts = [
          data.replies.length
            ? `${data.replies.length === 1 ? '1 resposta nova' : `${data.replies.length} respostas novas`}: ${data.replies.map((r) => r.company_name).join(', ')}`
            : '',
          declined.length ? `${declined.length} sem interesse` : '',
          bounces.length ? `${bounces.length === 1 ? '1 email devolvido' : `${bounces.length} emails devolvidos`}: ${bounces.map((b) => b.company_name).join(', ')}` : '',
          data.out_of_office ? `${data.out_of_office} ausente${data.out_of_office === 1 ? '' : 's'} (follow-up adiado)` : '',
        ].filter(Boolean);
        toast.success(`${parts.join(' · ')}.`);
      } else {
        toast.success(`Caixa de entrada lida (${data.checked === 1 ? '1 email novo' : `${data.checked} emails novos`}). Nenhuma resposta de leads.`);
      }
    } catch (error) {
      await qc.invalidateQueries({ queryKey: ['mail-account'] });
      toast.error(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    try {
      await api('/mail-account', { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['mail-account'] });
      setConfirmRemove(false);
      toast.success('Conta de email desligada.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form
      className="grid gap-4 p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <Field label="Serviço de email" error={errors.provider?.[0]}>
        <Select
          value={form.provider}
          onChange={(e) => {
            const provider = e.target.value as MailProvider;
            setForm({ ...form, provider, bcc_self: MAIL_PROVIDER_PRESETS[provider].bccSelf });
          }}
        >
          {MAIL_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {MAIL_PROVIDER_PRESETS[p].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nome que o cliente vê" required error={errors.from_name?.[0]} hint="Ex.: Va · VNDesign">
        <Input value={form.from_name} maxLength={120} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
      </Field>
      <Field label="O teu email" required error={errors.from_email?.[0]} className="md:col-span-2">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={form.provider === 'gmail' ? 'nome@gmail.com' : 'geral@vndesign.pt'}
          value={form.from_email}
          onChange={(e) => setForm({ ...form, from_email: e.target.value })}
        />
      </Field>
      {custom ? (
        <>
          <Field label="Servidor SMTP" required error={errors.smtp_host?.[0]} hint="Ex.: smtp.exemplo.pt">
            <Input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} />
          </Field>
          <Field label="Porta" error={errors.smtp_port?.[0]} hint="465 (SSL) ou 587 (STARTTLS)">
            <Input type="number" inputMode="numeric" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} />
          </Field>
          <Field label="Utilizador (opcional)" error={errors.smtp_user?.[0]} hint="Normalmente o próprio email.">
            <Input autoComplete="off" value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} />
          </Field>
          <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={form.smtp_secure} onChange={(e) => setForm({ ...form, smtp_secure: e.target.checked })} />
            Ligação segura (SSL, porta 465)
          </label>
        </>
      ) : null}
      <Field
        label={form.provider === 'gmail' ? 'Palavra-passe de aplicação' : 'Palavra-passe'}
        required={!account?.password_set}
        error={errors.password?.[0]}
        className="md:col-span-2"
        hint={
          account?.password_set
            ? 'Guardada. Deixa vazio para manter; escreve só para a mudar.'
            : form.provider === 'gmail'
              ? undefined // o quadro abaixo explica como a criar
              : preset.help
        }
      >
        {/* new-password: o Chrome não preenche aqui a palavra-passe de entrada na plataforma. */}
        <PasswordInput
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </Field>
      {form.provider === 'gmail' ? (
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm md:col-span-2">
          <p className="mb-1 font-medium">Como criar a palavra-passe de aplicação do Gmail</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted">
            <li>
              Liga a <strong>Verificação em dois passos</strong> em{' '}
              <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                myaccount.google.com/security
              </a>
              .
            </li>
            <li>
              Abre{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                myaccount.google.com/apppasswords
              </a>
              , escreve “VNDesign Leads” e carrega em <strong>Criar</strong>.
            </li>
            <li>Copia as 16 letras e cola-as aqui (os espaços não fazem mal).</li>
          </ol>
        </div>
      ) : null}
      <Field label="Limite por dia" error={errors.daily_limit?.[0]} hint="Protege o teu email de ser marcado como spam.">
        <Input type="number" inputMode="numeric" min={1} max={500} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: e.target.value })} />
      </Field>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 md:col-span-2">
        <legend className="px-1 text-sm font-medium">Respostas dos leads</legend>
        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={form.reply_detection}
            onChange={(e) => setForm({ ...form, reply_detection: e.target.checked })}
          />
          <span>
            Detetar respostas na caixa de entrada
            <span className="block text-xs text-muted">
              De 10 em 10 minutos, lê só o remetente e o assunto dos emails novos (nunca o texto). Quando um lead responde, passa a
              “Respondeu”, a sequência de follow-ups para e recebes uma notificação.
            </span>
          </span>
        </label>
        {custom && form.reply_detection ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Servidor IMAP" error={errors.imap_host?.[0]} hint="Vazio = o servidor SMTP com “imap.” em vez de “smtp.”.">
              <Input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
            </Field>
            <Field label="Porta IMAP" error={errors.imap_port?.[0]} hint="993 (SSL)">
              <Input type="number" inputMode="numeric" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: e.target.value })} />
            </Field>
          </div>
        ) : null}
        {form.reply_detection ? (
          <Field
            label="Endereço do webmail (opcional)"
            error={errors.webmail?.[0]}
            hint={`Para o botão “Abrir” na lista Respostas do Dashboard. Vazio = ${
              form.provider === 'gmail' ? 'o Gmail (abre a própria conversa)' : form.provider === 'hostinger' ? 'o Hostinger Mail' : 'o do teu serviço, se for conhecido (Outlook, SAPO…)'
            }. Ex.: https://outlook.live.com/mail/`}
          >
            <Input type="url" inputMode="url" placeholder="https://" value={webmailValue} onChange={(e) => setWebmail(e.target.value)} />
          </Field>
        ) : null}
        {account?.reply_detection ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {account.imap_error ? (
              <p role="alert" className="flex-1 text-danger">
                Última leitura falhou: {account.imap_error}
              </p>
            ) : (
              <p className="flex-1 text-muted">
                {account.imap_checked_at ? `Última leitura: ${formatDateTime(account.imap_checked_at)}.` : 'Ainda não foi lida: lê-se sozinha em poucos minutos.'}
              </p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={checkReplies} loading={checking}>
              <Inbox className="h-4 w-4" aria-hidden /> Verificar agora
            </Button>
          </div>
        ) : null}
      </fieldset>
      <label className="inline-flex items-start gap-2 self-end pb-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.bcc_self} onChange={(e) => setForm({ ...form, bcc_self: e.target.checked })} />
        <span>
          Enviar-me uma cópia oculta de cada email
          {form.provider === 'gmail' ? <span className="block text-xs text-muted">O Gmail já guarda os enviados na pasta “Enviados”.</span> : null}
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
        {account ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmRemove(true)}>
              Desligar
            </Button>
            <Button type="button" variant="outline" onClick={test} loading={testing}>
              <Mail className="h-4 w-4" aria-hidden /> Enviar email de teste
            </Button>
          </>
        ) : null}
        <Button type="submit" loading={saving}>
          Guardar
        </Button>
      </div>
      <Dialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Desligar a conta de email?"
        description="A palavra-passe é apagada. Os botões “Enviar” deixam de funcionar até voltares a ligar uma conta."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove}>
              Desligar
            </Button>
          </>
        }
      />
    </form>
  );
}

export function MailSettings() {
  const { data: account, isLoading } = useMailAccount();
  const { data: signature } = useSignature();
  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <Card>
      <CardHeader
        title="Email de envio"
        description={
          <>
            A tua caixa de correio para enviar emails aos leads <em>pela plataforma</em> (botões “Enviar” na ficha e na proposta).
            As respostas chegam à tua caixa normal. O resumo diário usa outra configuração (
            <Link href="/definicoes/lembretes" className="text-accent-text underline underline-offset-2">
              Follow-up e lembretes
            </Link>
            ).
          </>
        }
        actions={
          account ? (
            <Badge tone="success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Ligada · hoje {account.sent_today} de {account.daily_limit}
            </Badge>
          ) : null
        }
      />
      <MailForm key={account ? `${account.provider}-${account.from_email}` : 'novo'} account={account ?? null} defaultName={signature?.full_name ?? ''} />
    </Card>
  );
}
