/**
 * Verificação em dois passos (TOTP do Supabase): quem a ligou tem de confirmar
 * o código da app de autenticação depois da palavra-passe. O nível da sessão
 * ("aal1" = só palavra-passe, "aal2" = com código) vem no próprio token.
 * Usado no proxy, na API e no browser (sem dependências do servidor).
 */

/** Nível de verificação ("aal") escrito no access token (JWT) da sessão. */
export function tokenAal(accessToken: string | null | undefined): string | null {
  const part = accessToken?.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.aal === 'string' ? json.aal : null;
  } catch {
    return null;
  }
}

/** O utilizador tem a verificação em dois passos ligada (algum fator confirmado)? */
export function hasVerifiedFactor(user: { factors?: { status: string }[] | null } | null | undefined): boolean {
  return !!user?.factors?.some((f) => f.status === 'verified');
}

/** Falta o código: tem a verificação ligada e a sessão ainda só tem a palavra-passe. */
export function needsMfaCode(user: { factors?: { status: string }[] | null } | null | undefined, accessToken: string | null | undefined): boolean {
  return hasVerifiedFactor(user) && tokenAal(accessToken) !== 'aal2';
}

export const MFA_REQUIRED = 'mfa_required';
