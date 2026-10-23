/**
 * Ações pedidas pela pesquisa rápida ao abrir a ficha (ex.: ?acao=reuniao abre
 * "Marcar reunião"). Lê o parâmetro uma vez e tira-o do endereço (recarregar a
 * página não volta a abrir).
 */
export function consumeLeadAction(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('acao') !== name) return false;
  url.searchParams.delete('acao');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
