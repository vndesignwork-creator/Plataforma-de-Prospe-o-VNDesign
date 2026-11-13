import { existsSync, readFileSync } from 'node:fs';

/**
 * Limpeza no fim de cada corrida: apaga de vez o que os testes criaram durante a
 * corrida (leads — e tudo o que pende deles —, tarefas, listas, projetos…), para a
 * base de testes não crescer até ficar lenta.
 *
 * Só atua com o Supabase LOCAL (127.0.0.1 / localhost): nunca toca na base de dados do site.
 * Para manter os dados (ex.: ver o que um teste deixou), corre com E2E_MANTER_DADOS=1.
 */

// Tabelas com workspace_id e a coluna da data em que a linha nasceu; o que depende de um
// lead vai junto (on delete cascade). O Lixo guarda os leads que os testes já apagam.
const TABELAS: [string, string][] = [
  ['leads', 'created_at'],
  ['lead_tasks', 'created_at'],
  ['task_lists', 'created_at'],
  ['lead_projects', 'created_at'],
  ['proposals', 'created_at'],
  ['notifications', 'created_at'],
  ['import_jobs', 'created_at'],
  ['site_monitors', 'created_at'],
  ['contact_templates', 'created_at'],
  ['task_templates', 'created_at'],
  ['automation_rules', 'created_at'],
  ['do_not_contact', 'created_at'],
  ['platform_problems', 'first_at'],
  ['lead_trash', 'deleted_at'],
];

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync('apps/web/.env.local')) return env;
  for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export default async function globalTeardown() {
  if (process.env.E2E_MANTER_DADOS === '1') return;
  const ficheiro = 'e2e/.auth/inicio-corrida.txt';
  if (!existsSync(ficheiro)) return;
  const inicio = readFileSync(ficheiro, 'utf8').trim();

  const local = lerEnvLocal();
  const get = (k: string) => process.env[k] ?? local[k];
  const url = (get('NEXT_PUBLIC_SUPABASE_URL') ?? '').replace(/\/$/, '');
  const chave = get('SUPABASE_SECRET_KEY');
  const email = get('E2E_EMAIL');
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // sem URL válido: não limpa
  }
  if (!['127.0.0.1', 'localhost'].includes(host) || !chave || !email) {
    console.log('[limpeza E2E] ignorada: só limpa o Supabase local com SUPABASE_SECRET_KEY e E2E_EMAIL.');
    return;
  }

  const headers = { apikey: chave, Authorization: `Bearer ${chave}`, 'content-type': 'application/json' };
  try {
    const users = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers }).then((r) => r.json());
    const user = (users.users ?? []).find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return;
    const membros = await fetch(`${url}/rest/v1/workspace_members?select=workspace_id&user_id=eq.${user.id}`, { headers }).then((r) =>
      r.json(),
    );
    const workspaces: string[] = (Array.isArray(membros) ? membros : []).map((m: { workspace_id: string }) => m.workspace_id);
    if (workspaces.length === 0) return;

        const resumo: string[] = [];
    for (const [tabela, coluna] of TABELAS) {
      const filtro = `workspace_id=in.(${workspaces.join(',')})&${coluna}=gte.${encodeURIComponent(inicio)}`;
      const res = await fetch(`${url}/rest/v1/${tabela}?${filtro}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation', 'Accept-Profile': 'public' },
      });
      if (!res.ok) continue; // tabela sem estas colunas ou bloqueada: segue para a próxima
      const apagados = ((await res.json()) as unknown[]).length;
      if (apagados) resumo.push(`${tabela}: ${apagados}`);
    }
    console.log(`[limpeza E2E] apagado o que a corrida criou${resumo.length ? ` (${resumo.join(', ')})` : ' (nada)'}.`);
  } catch (err) {
    console.log(`[limpeza E2E] não foi possível limpar: ${(err as Error).message}`);
  }
}
