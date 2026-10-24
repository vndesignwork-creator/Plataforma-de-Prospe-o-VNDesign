'use client';

/**
 * Dashboard → "Clientes antigos": quem teve o último projeto concluído há mais
 * de 3, 6 ou 12 meses e não tem nada em curso. Email pronto ("Como está a
 * correr?…") para rever e enviar (ou copiar), ou "Já falei" se foi por outra
 * via. Depois de contactado sai da lista durante esse tempo. Os clientes com a
 * tarefa "Propor um novo serviço" por fazer não aparecem (já têm lembrete).
 */
import {
  RECONNECT_MONTHS,
  RECONNECT_TEMPLATE,
  buildReconnectEmail,
  formatDate,
  formatSignature,
  leadPath,
  monthsBetween,
  todayIso,
  type ReconnectClient,
} from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Handshake } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DraftEmailButton } from '@/components/projects/project-update';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useLead, useSignature } from '@/lib/queries';
import { cn } from '@/lib/utils';

const VISIBLE = 5;

export function ReconnectCard({ className }: { className?: string }) {
  const [months, setMonths] = useState(6);
  const [all, setAll] = useState(false);
  const { data } = useQuery({
    queryKey: ['reconnect', months],
    queryFn: () => api<{ data: ReconnectClient[] }>('/projects/reconnect', { query: { months } }).then((r) => r.data),
  });
  if (!data?.length) return null;
  const shown = all ? data : data.slice(0, VISIBLE);
  return (
    <Card className={className}>
      <CardHeader
        title={`Clientes antigos (${data.length})`}
        description="Projeto concluído há algum tempo e nada em curso: um email pode trazer um projeto novo."
        actions={
          <Select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Concluído há mais de" className="h-8 w-auto py-0 text-sm">
            {RECONNECT_MONTHS.map((m) => (
              <option key={m} value={m}>
                há mais de {m} meses
              </option>
            ))}
          </Select>
        }
      />
      <ul className="divide-y divide-border" aria-label="Clientes antigos para voltar a contactar">
        {shown.map((c) => (
          <ReconnectRow key={c.lead.id} client={c} />
        ))}
      </ul>
      {data.length > VISIBLE ? (
        <div className="flex justify-end border-t border-border px-4 py-2">
          <Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll(!all)}>
            <ChevronDown className={cn('h-4 w-4 transition-transform', all && 'rotate-180')} aria-hidden />
            {all ? 'Mostrar menos' : `Ver todos (${data.length})`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function ReconnectRow({ client }: { client: ReconnectClient }) {
  const qc = useQueryClient();
  const { data: lead } = useLead(client.lead.id);
  const { data: signature } = useSignature();
  const [today] = useState(() => todayIso());
  const ago = monthsBetween(client.last_completed_at, today);
  const draft = buildReconnectEmail({
    company: client.lead.company_name,
    contact: client.lead.contact_name,
    lastProject: client.last_project,
    completedAt: client.last_completed_at,
    today,
    signature: signature ? formatSignature(signature) || null : null,
  });

  async function talked() {
    try {
      await api(`/leads/${client.lead.id}/activities`, {
        method: 'POST',
        body: { type: 'note', body: 'Cliente antigo: falámos (voltar a contactar).', payload: { via: 'reconnect' } },
      });
      toast.success(`#${client.lead.number} ${client.lead.company_name}: registado. Volta a aparecer daqui a uns meses.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      void qc.invalidateQueries({ queryKey: ['reconnect'] });
      void qc.invalidateQueries({ queryKey: ['activities', client.lead.id] });
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Handshake className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href={leadPath(client.lead)} className="text-sm font-medium hover:underline">
          <span className="text-muted tabular">#{client.lead.number}</span> {client.lead.company_name}
        </Link>
        <p className="text-xs text-muted">
          {client.last_project ? `${client.last_project} · ` : ''}concluído a {formatDate(client.last_completed_at.slice(0, 10))} (há {ago} meses)
          {client.projects > 1 ? ` · ${client.projects} projetos` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lead ? (
          <DraftEmailButton
            lead={lead}
            draft={draft}
            template={RECONNECT_TEMPLATE}
            label="Email"
            title="Email pronto a perguntar como está a correr e o que precisa (revês antes de enviar)."
          />
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void talked()} title="Já falaste por telefone ou pessoalmente: sai da lista por uns meses">
          <Check className="h-3.5 w-3.5" aria-hidden /> Já falei
        </Button>
      </div>
    </li>
  );
}
