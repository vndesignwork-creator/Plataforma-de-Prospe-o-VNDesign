'use client';

import { todayIso } from '@vndesign/core';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api-client';
import type { Today } from '@vndesign/core';

export const NOTIFY_KEY = 'vnd-notify';
const NOTIFIED_KEY = 'vnd-notified-date';

/** Notificações ativas neste browser (preferência por dispositivo). */
export function notificationsEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === 'on' && 'Notification' in window && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Uma vez por dia, ao abrir a plataforma, avisa dos follow-ups de hoje e em
 * atraso (se as notificações estiverem ativas nas Definições).
 */
export function FollowUpNotifier() {
  const router = useRouter();
  useEffect(() => {
    if (!notificationsEnabled()) return;
    const today = todayIso();
    try {
      if (localStorage.getItem(NOTIFIED_KEY) === today) return;
    } catch {
      return;
    }
    let cancelled = false;
    api<{ data: Today }>('/dashboard/today')
      .then(({ data }) => {
        if (cancelled) return;
        localStorage.setItem(NOTIFIED_KEY, today);
        const due = data.overdue.length + data.due_today.length;
        if (due === 0) return;
        const n = new Notification(`${due} follow-up${due === 1 ? '' : 's'} para hoje`, {
          body: data.overdue.length
            ? `${data.overdue.length} em atraso. ${[...data.overdue, ...data.due_today].slice(0, 3).map((l) => l.company_name).join(', ')}…`
            : [...data.due_today].slice(0, 3).map((l) => l.company_name).join(', '),
          icon: '/icon.svg',
          tag: 'vnd-follow-ups',
        });
        n.onclick = () => {
          window.focus();
          router.push('/dashboard');
        };
      })
      .catch(() => {
        // sem ligação: tenta na próxima vez
      });
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
