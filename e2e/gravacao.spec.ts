import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Gravar a reunião (microfone simulado do Chromium): pausa, Resumir a meio
 * (termina, passa a texto e resume logo) e Descartar (não envia nada).
 */
test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
});

const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

test('gravação: pausa, Resumir sem terminar, e Descartar', async ({ page }) => {
  test.setTimeout(120_000);
  const res = await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Gravação ${run}`, status: 'reuniao' } });
  expect(res.status()).toBe(201);
  const lead = (await res.json()).data as { id: string };
  let providerId: string | null = null;
  const transcribed: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/transcribe')) transcribed.push(r.status());
  });

  try {
    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('button', { name: 'Notas com IA' }).click();
    const dialog = page.getByRole('dialog', { name: 'Notas com IA' });
    await dialog.getByRole('button', { name: 'Gravação' }).click();

    // Descartar: volta ao início sem enviar.
    await dialog.getByRole('button', { name: 'Gravar' }).click();
    await expect(dialog.getByRole('status').getByText('A gravar')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Apontamentos' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByText('Gravação descartada.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Gravar' })).toBeVisible();

    // Gravar, pausar e Resumir sem terminar: passa a texto e mostra logo o resumo.
    await dialog.getByRole('button', { name: 'Gravar' }).click();
    await page.waitForTimeout(1500);
    await dialog.getByRole('button', { name: 'Pausa' }).click();
    await expect(dialog.getByRole('status').getByText('Em pausa')).toBeVisible();
    await dialog.getByRole('button', { name: 'Resumir' }).click();

    // Sem fornecedor que transcreva (ou sem rede): a gravação não se perde, tenta-se outra vez.
    const failedBox = dialog.getByRole('alert');
    const retry = failedBox.getByRole('button', { name: 'Tentar outra vez' });
    const summary = dialog.getByLabel('Resumo (vai para a linha do tempo)');
    await expect(retry.or(summary)).toBeVisible({ timeout: 30_000 });
    if (await retry.isVisible()) {
      await expect(failedBox).toContainText('não se perdeu');
      const provider = await page.request.post('/api/v1/ai-providers', { data: { kind: 'openai', label: `OpenAI ${run}`, api_key: 'sk-teste-gravacao' } });
      expect(provider.ok(), await provider.text()).toBe(true);
      providerId = (await provider.json()).data.id as string;
      await retry.click();
    }
    await expect(summary).not.toBeEmpty({ timeout: 30_000 });
    expect(transcribed.at(-1)).toBe(200);
    const calls = transcribed.length;

    // Cancelar a meio de outra gravação: fecha sem enviar.
    await dialog.getByRole('button', { name: 'Voltar aos apontamentos' }).click();
    await dialog.getByRole('button', { name: 'Gravar ou escolher outra vez' }).click();
    await dialog.getByRole('button', { name: 'Gravar' }).click();
    await expect(dialog.getByRole('status').getByText('A gravar')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(1000);
    expect(transcribed.length).toBe(calls);
  } finally {
    if (providerId) await page.request.delete(`/api/v1/ai-providers/${providerId}`);
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});

test('ditar sem reconhecimento de voz (ex.: Firefox): grava e passa a texto ao Concluir', async ({ page }) => {
  test.setTimeout(120_000);
  // Como no Firefox: o browser não tem reconhecimento de voz.
  await page.addInitScript(() => {
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: undefined, configurable: true });
  });
  const res = await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Ditado gravado ${run}` } });
  const lead = (await res.json()).data as { id: string };
  const provider = await page.request.post('/api/v1/ai-providers', { data: { kind: 'openai', label: `OpenAI ditado ${run}`, api_key: 'sk-teste-ditado' } });
  expect(provider.ok(), await provider.text()).toBe(true);
  const providerId = (await provider.json()).data.id as string;
  try {
    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('button', { name: 'Notas com IA' }).click();
    const dialog = page.getByRole('dialog', { name: 'Notas com IA' });
    await dialog.getByRole('button', { name: 'Ditar (falar em vez de escrever)' }).click();
    await expect(dialog.getByRole('group', { name: 'Ditado' }).getByRole('status')).toContainText('A gravar');
    await page.waitForTimeout(1200);
    await dialog.getByRole('button', { name: 'Concluir o ditado' }).click();
    await expect(dialog.getByLabel('Apontamentos')).toHaveValue(/loja online/i, { timeout: 30_000 });
  } finally {
    await page.request.delete(`/api/v1/ai-providers/${providerId}`);
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
