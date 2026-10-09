'use client';

import {
  API_TOKEN_SCOPE_LABELS,
  API_TOKEN_SCOPES,
  formatDate,
  formatDateTime,
  type ApiToken,
  type ApiTokenCreated,
  type ApiTokenScope,
} from '@vndesign/core';
import { Copy, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from '@/lib/queries';

const VALIDITY = [
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '365', label: '1 ano' },
  { value: '', label: 'Sem validade' },
];

const noop = () => () => {};
function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => 'https://leads.vndesign.pt');
}

function tokenState(t: ApiToken): { label: string; tone: 'success' | 'danger' | 'neutral' } {
  if (t.revoked_at) return { label: 'Revogado', tone: 'neutral' };
  if (t.expires_at && new Date(t.expires_at) <= new Date()) return { label: 'Expirado', tone: 'danger' };
  return { label: 'Ativo', tone: 'success' };
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar. Seleciona o texto e copia à mão.');
  }
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 pr-24 text-xs leading-relaxed whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={() => copy(code, label)}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Copiar
      </Button>
    </div>
  );
}

function examples(origin: string, token: string) {
  const body = `{
  "source": "claude-semanal",
  "on_duplicate": "skip",
  "leads": [
    { "company_name": "Restaurante Exemplo", "sector": "Restauração", "website": "https://exemplo.pt",
      "city": "Amadora", "problems": "Sem HTTPS; não é responsivo", "pagespeed": 34, "mobile": "Não" }
  ]
}`;
  const curl = `curl -X POST ${origin}/api/v1/leads/import \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: semana-$(date +%G-%V)" \\
  -d '${body.replace(/\n\s*/g, ' ')}'`;
  const powershell = `$headers = @{ Authorization = "Bearer ${token}"; "Idempotency-Key" = "semana-$(Get-Date -UFormat %Y-%V)" }
$body = @'
${body}
'@
Invoke-RestMethod -Method Post -Uri "${origin}/api/v1/leads/import" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))`;
  return { curl, powershell };
}

export function ApiSettings() {
  const { data: tokens, isLoading } = useApiTokens();
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();
  const origin = useOrigin();
  const [name, setName] = useState('Tarefa semanal Claude');
  const [scopes, setScopes] = useState<ApiTokenScope[]>(['leads:import']);
  const [validity, setValidity] = useState('365');
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [confirm, setConfirm] = useState<ApiToken | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Dá um nome ao token.');
      return;
    }
    setNameError(null);
    try {
      const token = await create.mutateAsync({
        name: name.trim(),
        scopes,
        expires_in_days: validity ? Number(validity) : null,
      });
      setCreated(token);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onRevoke(token: ApiToken) {
    try {
      await revoke.mutateAsync(token.id);
      toast.success('Token revogado.');
      setConfirm(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const sample = examples(origin, created?.token ?? 'vnd_O_TEU_TOKEN');

  return (
    <Card id="api">
      <CardHeader
        title="API e integrações"
        description={
          <>
            Tokens para outras ferramentas enviarem leads — por exemplo, a tua tarefa semanal de prospeção com o Claude.{' '}
            <Link href="/docs/api" className="text-accent-text underline">
              Documentação da API
            </Link>
          </>
        }
      />

      <form onSubmit={onCreate} className="grid gap-3 border-b border-border p-4 md:grid-cols-2" noValidate>
        <Field label="Nome do token" error={nameError ?? undefined} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Validade">
          <Select value={validity} onChange={(e) => setValidity(e.target.value)}>
            {VALIDITY.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Permissões</legend>
          <div className="flex flex-col gap-1.5 text-sm">
            {API_TOKEN_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(e) =>
                    setScopes((s) => (e.target.checked ? [...s, scope] : s.filter((x) => x !== scope)))
                  }
                  className="mt-1 accent-[var(--accent)]"
                />
                <span>
                  <code className="text-xs">{scope}</code> — {API_TOKEN_SCOPE_LABELS[scope]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="md:col-span-2">
          <Button type="submit" size="sm" loading={create.isPending} disabled={!scopes.length}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Criar token
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16" />
        </div>
      ) : tokens?.length ? (
        <ul className="divide-y divide-border" aria-label="Tokens">
          {tokens.map((t) => {
            const state = tokenState(t);
            return (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name} <Badge tone={state.tone}>{state.label}</Badge>
                  </p>
                  <p className="text-xs text-muted">
                    <code>{t.prefix}…</code> · {t.scopes.join(', ')} · criado a {formatDate(t.created_at.slice(0, 10))}
                    {t.expires_at ? ` · expira a ${formatDate(t.expires_at.slice(0, 10))}` : ' · sem validade'}
                    {' · '}
                    {t.last_used_at ? `último uso ${formatDateTime(t.last_used_at)}` : 'nunca usado'}
                  </p>
                </div>
                {!t.revoked_at ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirm(t)}>
                    Revogar
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">Ainda não criaste nenhum token.</p>
      )}

      <details className="border-t border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Exemplos (curl e PowerShell)</summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted">
            Os campos aceitam os valores da folha (“🔍 Identificado”, “Sim”, “06/10/2026”, “1.200 €”). Com{' '}
            <code>&quot;dry_run&quot;: true</code> vês o resultado sem gravar. Repetir o pedido com o mesmo{' '}
            <code>Idempotency-Key</code> não duplica leads.
          </p>
          <CodeBlock code={sample.curl} label="Exemplo curl" />
          <CodeBlock code={sample.powershell} label="Exemplo PowerShell" />
        </div>
      </details>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => (!open ? setCreated(null) : undefined)}
        title="Token criado"
        description="Copia-o agora: por segurança, não o voltamos a mostrar."
        footer={<Button onClick={() => setCreated(null)}>Já copiei</Button>}
      >
        {created ? (
          <div className="flex flex-col gap-3">
            <CodeBlock code={created.token} label="Token" />
            <p className="text-sm text-muted">
              Guarda-o num gestor de palavras-passe ou nas instruções da tarefa. Se o perderes, revoga-o e cria outro.
            </p>
            <details>
              <summary className="cursor-pointer text-sm">Exemplo pronto a usar (PowerShell)</summary>
              <div className="mt-2">
                <CodeBlock code={sample.powershell} label="Exemplo PowerShell" />
              </div>
            </details>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title="Revogar token?"
        description={confirm ? `“${confirm.name}” deixa de funcionar de imediato.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={revoke.isPending} onClick={() => confirm && onRevoke(confirm)}>
              Revogar
            </Button>
          </>
        }
      />
    </Card>
  );
}
