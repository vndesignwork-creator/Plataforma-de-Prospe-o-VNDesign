/**
 * Confirmar a palavra-passe (para ver um acesso de cliente) não pode fechar a
 * sessão de quem está a trabalhar: o Supabase, sem âmbito, apaga TODAS as
 * sessões da conta — e a plataforma atirava a pessoa para o /login "sozinha".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const signOut = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword, signOut } }),
}));
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://exemplo.supabase.co', supabaseKey: 'chave' } }));

const { unlockWithPassword, isUnlocked } = await import('./unlock');

const ctx = { user: { id: 'u1', email: 'va@vndesign.pt' } } as Parameters<typeof unlockWithPassword>[0];

describe('confirmar a palavra-passe', () => {
  beforeEach(() => {
    signInWithPassword.mockReset().mockResolvedValue({ error: null });
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it('fecha só a sessão de confirmação (scope local), nunca as outras', async () => {
    await unlockWithPassword(ctx, 'a-minha-palavra-passe');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    // 'global' (o valor por omissão do Supabase) fecharia a sessão do browser e a do telemóvel.
    expect(signOut).not.toHaveBeenCalledWith();
    expect(signOut).not.toHaveBeenCalledWith({ scope: 'global' });
  });

  it('com a palavra-passe certa fica desbloqueado uns minutos', async () => {
    const until = await unlockWithPassword(ctx, 'a-minha-palavra-passe');
    expect(new Date(until).getTime()).toBeGreaterThan(Date.now());
    expect(isUnlocked('u1')).toBe(true);
  });

  it('com a palavra-passe errada não desbloqueia nem fecha sessões', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(unlockWithPassword({ user: { id: 'u2', email: 'va@vndesign.pt' } } as typeof ctx, 'errada')).rejects.toThrow();
    expect(signOut).not.toHaveBeenCalled();
    expect(isUnlocked('u2')).toBe(false);
  });
});
