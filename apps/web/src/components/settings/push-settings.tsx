'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Download, Moon, Smartphone } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  ALERT_KIND_LABELS,
  ALERT_KINDS,
  ALERTS_PREFERENCE,
  parseAlertsPreference,
  parseQuietHours,
  QUIET_HOURS_PREFERENCE,
  type AlertKind,
  type AlertsPreference,
  type QuietHours,
} from '@vndesign/core';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import { usePreference, useSetPreference } from '@/lib/queries';
import { NOTIFY_KEY, notificationsEnabled } from '@/components/follow-up/follow-up-notifier';

interface PushStatus {
  configured: boolean;
  public_key: string | null;
  subscriptions: { id: string; endpoint: string; user_agent: string | null; created_at: string }[];
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Botão "Instalar a app" (Chrome/Edge/Samsung Internet). */
function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia('(display-mode: standalone)').matches,
    () => false,
  );
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (standalone) return <Badge tone="success">App instalada</Badge>;
  if (!prompt) {
    return (
      <p className="text-sm text-muted">
        Para instalar no telemóvel: no Chrome, menu <span aria-hidden>⋮</span> → “Adicionar ao ecrã principal” (no iPhone:
        Partilhar → “Adicionar ao ecrã principal”).
      </p>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      Instalar a app
    </Button>
  );
}

/** Alternativa sem push: aviso ao abrir a plataforma (uma vez por dia). */
function InAppNotifications() {
  const enabled = useSyncExternalStore(subscribeStorage, notificationsEnabled, () => false);
  const [, force] = useState(0);

  async function toggle() {
    if (enabled) {
      localStorage.removeItem(NOTIFY_KEY);
      force((n) => n + 1);
      toast.success('Avisos desligados neste browser.');
      return;
    }
    if ((await Notification.requestPermission()) !== 'granted') {
      toast.error('O browser não deu permissão. Ativa as notificações nas definições do site.');
      return;
    }
    localStorage.setItem(NOTIFY_KEY, 'on');
    localStorage.removeItem('vnd-notified-date');
    force((n) => n + 1);
    toast.success('Vais ser avisado dos follow-ups do dia ao abrir a plataforma.');
  }

  return (
    <Button size="sm" variant={enabled ? 'outline' : 'primary'} onClick={toggle}>
      {enabled ? 'Desligar avisos neste browser' : 'Avisar ao abrir a plataforma'}
    </Button>
  );
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Horário de silêncio (de cada pessoa): sem push à noite e, se quiser, ao fim de semana. */
function QuietHoursSettings() {
  const { data, isPending } = usePreference<QuietHours>(QUIET_HOURS_PREFERENCE);
  const save = useSetPreference<QuietHours>(QUIET_HOURS_PREFERENCE);
  // Cópia local: a mudança vê-se logo (e várias mudanças seguidas partem sempre da última).
  const [draft, setDraft] = useState<QuietHours | null>(null);
  const quiet = draft ?? parseQuietHours(data);
  const update = (patch: Partial<QuietHours>) => {
    const next = { ...quiet, ...patch };
    setDraft(next);
    save.mutate(next, { onError: (error) => toast.error(errorMessage(error)) });
  };
  const hours = (value: string) => (HALF_HOURS.includes(value) ? HALF_HOURS : [...HALF_HOURS, value].sort());

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3" data-testid="quiet-hours">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Moon className="h-4 w-4" aria-hidden /> Horário de silêncio
        </h4>
        <Switch
          checked={quiet.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
          label={quiet.enabled ? 'Desligar o horário de silêncio' : 'Ligar o horário de silêncio'}
          disabled={isPending}
        />
      </div>
      <p className="text-sm text-muted">
        Nesse período não recebes notificações no telemóvel nem no computador; os avisos ficam no sino e os lembretes das tarefas chegam
        quando o silêncio acabar. Os alertas das reuniões e do pomodoro continuam.
      </p>
      {quiet.enabled ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            Das
            <Select className="w-24" value={quiet.from} onChange={(e) => update({ from: e.target.value })} aria-label="Início do silêncio">
              {hours(quiet.from).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2">
            às
            <Select className="w-24" value={quiet.to} onChange={(e) => update({ to: e.target.value })} aria-label="Fim do silêncio">
              {hours(quiet.to).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={quiet.weekends} onChange={(e) => update({ weekends: e.target.checked })} />
            Fim de semana inteiro
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Que avisos aparecem no sino (e vão por push): cada pessoa escolhe os seus. */
function AlertKindsSettings() {
  const { data, isPending } = usePreference<AlertsPreference>(ALERTS_PREFERENCE);
  const save = useSetPreference<AlertsPreference>(ALERTS_PREFERENCE);
  const [draft, setDraft] = useState<AlertKind[] | null>(null);
  const off = draft ?? parseAlertsPreference(data).off;
  const toggle = (kind: AlertKind, on: boolean) => {
    const next = on ? off.filter((k) => k !== kind) : [...off, kind];
    setDraft(next);
    save.mutate({ off: next }, { onError: (error) => toast.error(errorMessage(error)) });
  };

  return (
    <div id="avisos" className="flex scroll-mt-20 flex-col gap-2 border-t border-border pt-3" data-testid="alert-kinds">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <BellRing className="h-4 w-4" aria-hidden /> Avisos no sino
      </h4>
      <p className="text-sm text-muted">
        O que aparece no sino (e no telemóvel, com as notificações ligadas). As tarefas que te derem e as menções aparecem sempre.
      </p>
      <ul className="flex flex-col gap-1">
        {ALERT_KINDS.map((kind) => (
          <li key={kind} className="flex items-center justify-between gap-3 py-1">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{ALERT_KIND_LABELS[kind].label}</span>
              <span className="block text-xs text-muted">{ALERT_KIND_LABELS[kind].hint}</span>
            </span>
            <Switch
              checked={!off.includes(kind)}
              onCheckedChange={(on) => toggle(kind, on)}
              label={`${off.includes(kind) ? 'Ligar' : 'Desligar'} os avisos: ${ALERT_KIND_LABELS[kind].label}`}
              disabled={isPending}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PushSettings() {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['push'],
    queryFn: () => api<{ data: PushStatus }>('/push-subscriptions').then((r) => r.data),
  });
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const supported = useSyncExternalStore(() => () => {}, pushSupported, () => false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => !cancelled && setEndpoint(sub?.endpoint ?? null))
      .catch(() => !cancelled && setEndpoint(null));
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const active = !!endpoint && !!status?.subscriptions.some((s) => s.endpoint === endpoint);

  async function enable() {
    if (!status?.public_key) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.error('O browser não deu permissão. Ativa as notificações nas definições do site.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(status.public_key) }));
      await api('/push-subscriptions', { method: 'POST', body: sub.toJSON() });
      // Com push ativo, o aviso ao abrir a plataforma deixa de ser preciso.
      localStorage.setItem(NOTIFY_KEY, 'push');
      setEndpoint(sub.endpoint);
      void qc.invalidateQueries({ queryKey: ['push'] });
      toast.success('Notificações ativas neste dispositivo.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/push-subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      localStorage.removeItem(NOTIFY_KEY);
      setEndpoint(null);
      void qc.invalidateQueries({ queryKey: ['push'] });
      toast.success('Notificações desligadas neste dispositivo.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const { data } = await api<{ data: { sent: number } }>('/push-subscriptions/test', { method: 'POST' });
      toast.success(data.sent === 1 ? 'Notificação enviada.' : `Notificação enviada para ${data.sent} dispositivos.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="h-4 w-4" aria-hidden /> Notificações no telemóvel e no computador
      </h3>
      <p className="text-sm text-muted">
        Todas as manhãs, um aviso com os follow-ups e tarefas de hoje e em atraso, os lembretes das tarefas à hora marcada e os avisos da equipa (tarefas que te derem e
        @menções) — mesmo com a plataforma fechada. Ao tocar, abre o lead ou o dashboard.{' '}
        {status && status.subscriptions.length > 0 ? (
          <span>
            ({status.subscriptions.length} dispositivo{status.subscriptions.length === 1 ? '' : 's'} ativo
            {status.subscriptions.length === 1 ? '' : 's'})
          </span>
        ) : null}
      </p>

      {!supported ? (
        <p className="text-sm text-muted">Este browser não suporta notificações push.</p>
      ) : status && !status.configured ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <Badge tone="warning">Push não configurado no servidor</Badge>{' '}
            <span className="text-muted">(chaves VAPID — ver README). Até lá, podes receber o aviso ao abrir a plataforma:</span>
          </p>
          <div>
            <InAppNotifications />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {active ? (
            <>
              <Badge tone="success">Ativas neste dispositivo</Badge>
              <Button size="sm" variant="outline" onClick={test} loading={busy}>
                Enviar notificação de teste
              </Button>
              <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>
                Desligar neste dispositivo
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={enable} loading={busy} disabled={!status || endpoint === undefined}>
              Ativar notificações neste dispositivo
            </Button>
          )}
        </div>
      )}

      <QuietHoursSettings />
      <AlertKindsSettings />

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="h-4 w-4" aria-hidden /> App no telemóvel
        </h4>
        <div>
          <InstallApp />
        </div>
      </div>
    </div>
  );
}
