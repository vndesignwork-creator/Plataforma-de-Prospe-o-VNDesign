import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Scripts: a IA escreve a versão B de um modelo (mudando só uma coisa) e dá
 * para ver as duas versões lado a lado.
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

test('modelos: versão B com IA e pré-visualização lado a lado', async ({ page }) => {
  test.setTimeout(120_000);
  const created = await page.request.post('/api/v1/templates', {
    data: {
      kind: 'cold_email',
      name: `Modelo AB ${run}`,
      subject: 'Uma ideia para a {{empresa}}',
      body: '<p>Olá {{contacto}}, vi o site da {{empresa}} e reparei que demora a abrir no telemóvel. Posso enviar um relatório curto?</p>',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const template = (await created.json()).data as { id: string };

  try {
    // Pela API: a versão B vem com o que mudou.
    const variant = await page.request.post('/api/v1/templates/ab-variant', {
      data: { kind: 'cold_email', subject: 'Uma ideia para a {{empresa}}', body: 'Olá {{contacto}}, uma ideia para a {{empresa}}.', angle: 'curto', rich: true },
    });
    expect(variant.status(), await variant.text()).toBe(200);
    const data = (await variant.json()).data as { body: string; changed: string; model: string };
    expect(data.body).toContain('{{contacto}}');
    expect(data.changed).toBe('texto com metade do tamanho');
    expect(data.model).toBeTruthy();

    // Na página: gerar a versão B e ver as duas lado a lado.
    await page.goto('/scripts');
    // Os modelos estão agrupados por tipo: primeiro abre-se o grupo.
    await page.getByRole('button', { name: /^Email frio/ }).click();
    await page.getByRole('button', { name: new RegExp(`Modelo AB ${run}`) }).first().click();
    await page.getByRole('button', { name: 'Gerar versão B com IA' }).click();
    await expect(page.getByText('Versão B escrita. Lê e muda o que quiseres antes de guardar.')).toBeVisible();
    await expect(page.getByText(/O que mudou:/)).toBeVisible();

    // A pré-visualização passa sozinha para "A e B lado a lado".
    const both = page.getByRole('button', { name: 'A e B lado a lado' });
    await expect(both).toHaveAttribute('aria-pressed', 'true');
    // As duas colunas da pré-visualização, cada uma com o seu texto.
    await expect(page.getByTestId('pre-visualizacao-a')).toContainText('vi o site da');
    await expect(page.getByTestId('pre-visualizacao-b')).toContainText('Versão B escrita pela IA');
    // O lead escolhido vale para as duas colunas (senão a comparação enganava).
    const picker = page.getByTestId('pre-visualizacao-a').getByLabel('Lead para a pré-visualização');
    const options = await picker.locator('option').all();
    if (options.length > 1) {
      const value = await options[1]!.getAttribute('value');
      const label = ((await options[1]!.textContent()) ?? '').replace(/^#\d+\s*/, '').trim();
      await picker.selectOption(value!);
      await expect(page.getByTestId('pre-visualizacao-b')).toContainText(label.slice(0, 15));
    }

    // Guardar mantém a versão B.
    await page.getByRole('button', { name: 'Guardar modelo' }).click();
    await expect(page.getByText(/guardado/i).first()).toBeVisible();
    const saved = (await (await page.request.get('/api/v1/templates')).json()).data as { id: string; body_b: string | null }[];
    expect(saved.find((t) => t.id === template.id)?.body_b).toBeTruthy();
  } finally {
    await page.request.delete(`/api/v1/templates/${template.id}`);
  }
});
