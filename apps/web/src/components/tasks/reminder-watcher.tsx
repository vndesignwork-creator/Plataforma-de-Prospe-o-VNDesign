'use client';

import { leadPath, type Today, type TodayTask } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';

const SHOWN_KEY = 'vnd-reminders-shown';
/** Lembretes mais antigos do que isto já não aparecem (ex.: abrir a plataforma no dia seguinte). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function shownIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * Com a plataforma aberta, mostra um aviso quando um lembrete de tarefa chega à
 * hora (as notificações no telemóvel/computador são enviadas pelo cron).
 */
export function ReminderWatcher() {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const { data } = useQuery({
    queryKey: ['today'],
    queryFn: () => api<{ data: Today }>('/dashboard/today').then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Reavalia a cada 20 s (o lembrete pode chegar à hora entre duas atualizações).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const tasks: TodayTask[] = data?.tasks ? [...data.tasks.overdue, ...data.tasks.due_today, ...data.tasks.upcoming] : [];
    const due = tasks.filter((t) => {
      if (!t.remind_at || t.done_at) return false;
      const at = new Date(t.remind_at).getTime();
      return at <= now && now - at < MAX_AGE_MS;
    });
    if (!due.length) return;
    const shown = shownIds();
    const fresh = due.filter((t) => !shown.includes(t.id));
    if (!fresh.length) return;
    for (const t of fresh) {
      toast(`⏰ ${t.title}`, {
        description: t.lead ? `Lembrete · #${t.lead.number} ${t.lead.company_name}` : 'Lembrete de tarefa',
        duration: 30_000,
        action: t.lead ? { label: 'Abrir', onClick: () => router.push(`${leadPath(t.lead!)}#tarefas`) } : undefined,
      });
    }
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown, ...fresh.map((t) => t.id)].slice(-200)));
    } catch {
      // sem armazenamento: pode voltar a aparecer, sem problema
    }
  }, [data, now, router]);

  return null;
}
