import { expect, test } from '@playwright/test';

/*
 * Dashboard: dois cartões com os projetos em curso. A ordem é a do
 * `workingOnPicks`: o que fixaste em "A trabalhar nisto" primeiro, depois o do
 * temporizador, depois o que mexeste há menos tempo e, por fim, o de entrega
 * mais próxima. O cartão leva à página Projetos, ao projeto certo.
 */
const run = Date.now().toString(36);

test('dois cartões "A trabalhar agora", fixar à mão e o link para o projeto', async ({ page }) => {
  test.setTimeout(150_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true } } });
  const perto = `Entrega Perto ${run}`;
  const longe = `Entrega Longe ${run}`;
  const criar = async (name: string) => {
    const res = await page.request.post('/api/v1/leads?force=true', { data: { company_name: name, status: 'cliente' } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).data.id as string;
  };
  const pertoId = await criar(perto);
  const longeId = await criar(longe);
  await page.request.patch(`/api/v1/leads/${pertoId}/project`, { data: { due_on: '2026-12-01' } });
  await page.request.patch(`/api/v1/leads/${longeId}/project`, { data: { due_on: '2027-06-01' } });
  // Sem nada fixado, o Dashboard vê os dois projetos.
  await page.request.put('/api/v1/preferences/dashboard.working_on', { data: { value: null } });

  try {
    await page.goto('/dashboard');
    await expect(page.getByText(/^A trabalhar agora/).first()).toBeVisible();
    // Dois cartões: o primeiro "A trabalhar agora", o segundo "Também em curso".
    const primeiro = page.getByRole('link').filter({ hasText: /^A trabalhar agora/ }).first();
    const segundo = page.getByRole('link').filter({ hasText: /^Também em curso/ }).first();
    await expect(segundo).toBeVisible();
    // Sem nada fixado e sem temporizador, manda aquele em que se mexeu há menos
    // tempo (o último criado) e o outro fica no segundo cartão.
    await expect(primeiro).toContainText(longe);
    await expect(segundo).toContainText(perto);
    // E o link vai para a página Projetos (não para a ficha do lead).
    await expect(primeiro).toHaveAttribute('href', `/projetos#projeto-${longeId}`);

    // Mexer nas tarefas do outro projeto põe-no à frente (criar já conta).
    const tarefa = await page.request.post(`/api/v1/leads/${pertoId}/tasks`, { data: { title: 'Montar o rascunho' } });
    expect(tarefa.status(), await tarefa.text()).toBe(201);
    await page.goto('/dashboard');
    await expect(page.getByRole('link').filter({ hasText: /^A trabalhar agora/ }).first()).toContainText(perto);

    // "A trabalhar nisto" na ficha do outro projeto: passa para o primeiro cartão.
    await page.goto(`/leads/${longeId}#projeto`);
    await page.getByRole('button', { name: 'Mais ações do projeto' }).click();
    await page.getByRole('menuitem', { name: /^A trabalhar nisto/ }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Fixado no Dashboard' })).toBeVisible();
    const pref = await page.request.get('/api/v1/preferences/dashboard.working_on');
    expect((await pref.json()).data.value).toBe(longeId);

    await page.goto('/dashboard');
    const fixado = page.getByRole('link').filter({ hasText: /^A trabalhar agora · fixado por ti/ }).first();
    await expect(fixado).toContainText(longe);
    await expect(page.getByRole('link').filter({ hasText: /^Também em curso/ }).first()).toContainText(perto);

    // O cartão abre o projeto na página Projetos.
    await fixado.click();
    await expect(page.getByRole('heading', { name: 'Projetos', level: 1 })).toBeVisible();
    await expect(page.locator(`#projeto-${longeId}`)).toBeVisible();
  } finally {
    await page.request.put('/api/v1/preferences/dashboard.working_on', { data: { value: null } });
    await page.request.delete(`/api/v1/leads/${pertoId}`);
    await page.request.delete(`/api/v1/leads/${longeId}`);
  }
});
