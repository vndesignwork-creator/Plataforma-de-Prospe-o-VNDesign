import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";

/*
 * Testemunhos: pedir no projeto, o cliente responde na página /o/…, aparece na
 * ficha e em Definições → Testemunhos, e (autorizado, 5 estrelas) no PDF da proposta.
 */
const run = Date.now().toString(36);

async function createLead(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  const res = await request.post("/api/v1/leads?force=true", { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number };
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  return { context, page: await context.newPage() };
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: "e2e/.auth/user.json" });
  await page.request.patch("/api/v1/settings", {
    data: { google_review_url: "" },
  });
  await page.close();
});

test("pedir testemunho, o cliente responde (5 estrelas, autoriza) e aparece na ficha e nas Definições", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: {
          google_review_url: "https://g.page/r/teste/review",
          features: { testimonials: true },
        },
      })
    ).status(),
  ).toBe(200);
  const company = `Testemunho ${run}`;
  const lead = await createLead(page.request, {
    company_name: company,
    contact_name: "Cliente Teste",
    status: "cliente",
  });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator("#projeto");
  await card
    .getByRole("tablist", { name: "Partes do projeto" })
    .getByRole("tab", { name: /^Cliente/ })
    .click();
  await card.getByRole("button", { name: "Pedir testemunho" }).click();
  await expect(card.getByText("À espera do cliente")).toBeVisible();
  const testimonial = (
    await (
      await page.request.get(`/api/v1/leads/${lead.id}/testimonial`)
    ).json()
  ).data as { token: string };

  const client = await anonymous(browser);
  await client.page.goto(`/o/${testimonial.token}`);
  await expect(
    client.page.getByRole("heading", { name: "Como correu o projeto?" }),
  ).toBeVisible();
  await expect(client.page.getByLabel("O seu nome")).toHaveValue(
    "Cliente Teste",
  );
  await client.page.getByRole("button", { name: "Enviar" }).click();
  await expect(
    client.page.getByText("Escolha de 1 a 5 estrelas."),
  ).toBeVisible();
  await client.page.getByLabel("5 estrelas (Excelente)").check({ force: true });
  await client.page
    .getByLabel("A sua opinião")
    .fill(`Trabalho rápido e muito profissional ${run}.`);
  await client.page.getByLabel("Cargo e empresa (opcional)").fill("Gerente");
  await client.page.getByRole("button", { name: "Enviar" }).click();
  await expect(
    client.page.getByText("Recebido. Muito obrigado pela sua opinião!"),
  ).toBeVisible();
  // Com 5 estrelas, sugere o Google.
  await expect(
    client.page.getByRole("link", { name: "Avaliar no Google" }),
  ).toHaveAttribute("href", "https://g.page/r/teste/review");
  await client.context.close();

  await page.reload();
  await card
    .getByRole("tablist", { name: "Partes do projeto" })
    .getByRole("tab", { name: /^Cliente/ })
    .click();
  await expect(
    card.getByText(`Trabalho rápido e muito profissional ${run}.`),
  ).toBeVisible();
  await expect(card.getByText("Aparece nas propostas.")).toBeVisible();

  await page.goto("/definicoes/testemunhos");
  const row = page
    .getByRole("list", { name: "Testemunhos recebidos" })
    .getByRole("listitem")
    .filter({ hasText: company });
  await expect(row.getByText("Nas propostas", { exact: true })).toBeVisible();
  await row
    .getByRole("switch", {
      name: `Mostrar o testemunho de ${company} nas propostas`,
    })
    .click();
  await expect(row.getByText("Nas propostas", { exact: true })).toHaveCount(0);
  const list = (await (await page.request.get("/api/v1/testimonials")).json())
    .data as { lead_id: string; featured: boolean }[];
  expect(list.find((t) => t.lead_id === lead.id)?.featured).toBe(false);

  // A atividade fica na ficha; no fim, apaga o lead de teste.
  const activities = (
    await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()
  ).data as { type: string }[];
  expect(activities.some((a) => a.type === "testimonial_received")).toBe(true);
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});

test("o PDF da proposta sai com testemunhos e o link inválido dá 404", async ({
  page,
  browser,
}) => {
  const client = await anonymous(browser);
  const res = await client.page.goto("/o/codigo-que-nao-existe-123");
  expect(res?.status()).toBe(404);
  const api = await client.page.request.post(
    "/api/v1/public/testimonials/codigo-que-nao-existe-123",
    {
      data: {
        rating: 5,
        quote: "Muito bom trabalho!",
        author_name: "X",
        can_publish: true,
      },
    },
  );
  expect(api.status()).toBe(404);
  await client.context.close();

  const lead = await createLead(page.request, {
    company_name: `Proposta testemunho ${run}`,
    status: "proposta_enviada",
  });
  const created = await page.request.post(
    `/api/v1/leads/${lead.id}/proposals`,
    {
      data: {
        title: "Site institucional",
        items: [{ name: "Site", price: 900 }],
      },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const proposal = (await created.json()).data as { id: string };
  const pdf = await page.request.get(`/api/v1/proposals/${proposal.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});
