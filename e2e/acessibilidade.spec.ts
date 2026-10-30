import { expect, test, type Page } from '@playwright/test';

/*
 * Acessibilidade (WCAG 2.1 AA): o axe-core em cada página principal (tema escuro
 * e claro) e a navegação por teclado — saltar para o conteúdo, abas e grupos com
 * setas, diálogos que devolvem o foco a quem os abriu.
 */
const axePath = require.resolve('axe-core/axe.min.js');

type Violation = { id: string; help: string; nodes: { target: string[]; html: string }[] };

async function axe(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Violation[] }> } };
    const result = await w.axe.run(
      // O "VN" laranja do logótipo é a marca: os logótipos não têm requisito de contraste.
      { exclude: [['[data-logo]']] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
    );
    return result.violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, html: n.html.slice(0, 160) })),
    }));
  });
}

const PAGES = [
  '/dashboard',
  '/tarefas',
  '/leads',
  '/leads/novo',
  '/kanban',
  '/prospecao',
  '/projetos',
  '/estatisticas',
  '/scripts',
  '/equipa',
  '/definicoes/servicos',
  '/definicoes/email',
  '/definicoes/funcionalidades',
];

for (const theme of ['dark', 'light'] as const) {
  test(`axe sem erros nas páginas principais (tema ${theme === 'dark' ? 'escuro' : 'claro'})`, async ({ page }) => {
    test.setTimeout(480_000);
    await page.addInitScript((t) => window.localStorage.setItem('vnd-theme', t), theme);
    const found: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
      // Os dados chegam depois do título (algumas páginas vão atualizando sozinhas: não há "rede parada").
      await page.waitForTimeout(3000);
      for (const v of await axe(page)) found.push(`${path} · ${v.id}: ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html}`).join('\n    ')}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}

test('teclado: saltar para o conteúdo, abas com setas e diálogos que devolvem o foco', async ({ page }) => {
  await page.goto('/leads');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // O primeiro Tab mostra o "Saltar para o conteúdo".
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar para o conteúdo' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  // Abas: só a escolhida está no Tab; as setas mudam de aba.
  await page.goto('/equipa');
  const selected = page.getByRole('tablist', { name: 'Equipa' }).getByRole('tab', { selected: true });
  await expect(selected).toHaveAttribute('tabindex', '0');
  const first = await selected.textContent();
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  const next = page.getByRole('tablist', { name: 'Equipa' }).getByRole('tab', { selected: true });
  await expect(next).not.toHaveText(first ?? '');
  await expect(next).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tablist', { name: 'Equipa' }).getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');

  // Diálogo: Esc fecha e o foco volta ao botão que o abriu.
  await page.goto('/tarefas');
  const open = page.getByRole('button', { name: 'Nova tarefa' }).first();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();

  // Pesquisa rápida: o mesmo.
  const search = page.getByRole('button', { name: /Pesquisar…/ }).first();
  await search.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Pesquisar leads, projetos, tarefas e páginas' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
});
