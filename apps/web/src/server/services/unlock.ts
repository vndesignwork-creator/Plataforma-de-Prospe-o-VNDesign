/**
 * Confirmar a palavra-passe da conta antes de mostrar um acesso de cliente.
 * Depois de confirmada, fica desbloqueado uns minutos (quem está a trabalhar
 * não escreve a palavra-passe a cada acesso) — e só neste servidor, em
 * memória: ao reiniciar, pede outra vez.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { ApiContext } from '../context';
import { ApiError } from '../http';

/** Quanto tempo dura a confirmação. */
export const UNLOCK_MINUTES = 5;

const unlocked = new Map<string, number>();
/** Tentativas falhadas recentes (para não se adivinhar a palavra-passe). */
const failures = new Map<string, number[]>();

export function isUnlocked(userId: string): boolean {
  const until = unlocked.get(userId);
  if (!until) return false;
  if (until < Date.now()) {
    unlocked.delete(userId);
    return false;
  }
  return true;
}

export function unlockedUntil(userId: string): string | null {
  return isUnlocked(userId) ? new Date(unlocked.get(userId)!).toISOString() : null;
}

/** Confirma a palavra-passe da conta (sem mexer na sessão aberta). */
export async function unlockWithPassword(ctx: ApiContext, password: string): Promise<string> {
  const email = ctx.user.email;
  if (!email) throw new ApiError(422, 'Conta sem email', 'Esta conta não tem email para confirmar a palavra-passe.');

  const now = Date.now();
  const recent = (failures.get(ctx.user.id) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 5) throw new ApiError(429, 'Demasiadas tentativas', 'Espera 10 minutos antes de tentar outra vez.');

  const client = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    failures.set(ctx.user.id, [...recent, now]);
    throw new ApiError(422, 'Palavra-passe errada', 'Escreve a palavra-passe com que entras na plataforma.');
  }
  // A sessão criada para confirmar não serve para mais nada.
  await client.auth.signOut().catch(() => undefined);
  failures.delete(ctx.user.id);
  if (unlocked.size > 1_000) unlocked.clear();
  const until = now + UNLOCK_MINUTES * 60_000;
  unlocked.set(ctx.user.id, until);
  return new Date(until).toISOString();
}
