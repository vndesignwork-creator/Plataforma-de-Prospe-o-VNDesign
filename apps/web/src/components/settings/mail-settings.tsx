'use client';

/**
 * Definições → Email de envio: a caixa de correio de onde saem os emails aos leads
 * (Gmail, Hostinger ou outro SMTP). Cada utilizador liga a sua.
 */
import { useQueryClient } from '@tanstack/react-query';
import { MAIL_DEFAULT_DAILY_LIMIT, MAIL_PROVIDERS, MAIL_PROVIDER_PRESETS, type MailAccount, type MailProvider } from '@vndesign/core';
import { CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useMailAccount, useSignature } from '@/lib/queries';

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
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const preset = MAIL_PROVIDER_PRESETS[form.provider];
  const custom = form.provider === 'custom';

  async function save() {
    setSaving(true);
    setErrors({});
    try {
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
        <Input
          type="password"
          autoComplete="off"
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
              <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                myaccount.google.com/security
              </a>
              .
            </li>
            <li>
              Abre{' '}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
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
            <Link href="/definicoes/lembretes" className="text-accent-text hover:underline">
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
