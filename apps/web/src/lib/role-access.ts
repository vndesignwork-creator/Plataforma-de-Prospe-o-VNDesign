/**
 * Equipa de prospeção: as páginas que um prospetor abre (as outras levam-no
 * para a Prospeção). A API bloqueia na mesma o que não é para ele; isto só
 * evita páginas vazias ou com erros.
 */
const PROSPECTOR_PAGES = ['/dashboard', '/leads', '/prospecao', '/gerar-leads', '/kanban', '/mapa', '/scripts', '/partilhar', '/estatisticas', '/definicoes/assinatura', '/definicoes/conta'];
// Propostas, juntar e a limpeza de duplicados (apagam leads) são só do dono ou administrador.
const BLOCKED_LEAD_PAGES = /^\/leads\/(duplicados(\/|$)|[^/]+\/(propostas|juntar)(\/|$))/;

export function prospectorPageAllowed(pathname: string): boolean {
  if (pathname === '/definicoes') return true;
  if (BLOCKED_LEAD_PAGES.test(pathname)) return false;
  return PROSPECTOR_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Secções das Definições que o prospetor vê. */
export const PROSPECTOR_SETTINGS = new Set(['assinatura', 'conta']);
