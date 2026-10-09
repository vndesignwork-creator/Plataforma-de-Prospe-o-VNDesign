/**
 * Variáveis de ambiente públicas (disponíveis no browser e no servidor).
 * Ver .env.example na raiz do projeto.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta a variável de ambiente ${name}. Copia .env.example para apps/web/.env.local e preenche-a.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  /** Chave "publishable" (sb_publishable_…) ou a antiga "anon key". */
  get supabaseKey() {
    return required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
};

/**
 * Cookies da sessão Supabase: em produção só viajam por HTTPS (flag Secure),
 * para não serem enviados em claro se alguém abrir http://… numa rede pública.
 * Em desenvolvimento a app corre em http://localhost, por isso não se aplica.
 */
export const authCookieOptions = { secure: process.env.NODE_ENV === 'production' };
