# VNDesign Leads

Plataforma de prospeção de clientes da **VNDesign** (vndesign.pt). Substitui a folha
"Leads_Prospeccao_VNDesign": pipeline de leads, deteção de duplicados, linha do tempo,
dashboard, scripts de contacto e mais. Interface em português europeu (DD/MM/AAAA, €).

> **Estado:** Fase A concluída (projeto, autenticação, modelo de dados, CRUD de leads,
> tabela + ficha, deteção de duplicados). Ver [Plano por fases](#plano-por-fases).

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **Supabase** (Postgres + Auth), com Row Level Security em todas as tabelas
- **Zod** (validação partilhada web/API/app móvel) + React Hook Form + TanStack Query/Table
- API REST em `/api/v1`, documentada em OpenAPI (`/docs/api`)
- Testes: **Vitest** (lógica) e **Playwright** (fluxos principais)

## Estrutura

```
apps/web/            Next.js: interface + API /api/v1
  src/app/api/v1/    route handlers (auth → Zod → serviço → JSON)
  src/server/        contexto de autenticação, serviços, OpenAPI
  src/components/    interface (leads, definições, UI base)
packages/core/       schemas Zod, enums, normalização, formatação (reutilizável pela app Expo)
supabase/migrations/ migrações SQL versionadas (modelo de dados, RLS, funções, seeds)
scripts/             create-user.mjs
e2e/                 testes Playwright
docs/                arquitetura e decisões
```

Mais detalhe em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

---

## Instalação (Windows / PowerShell)

Requisitos: **Node.js 24** (ou 22+), **Git** e uma conta **Supabase**.
O Docker Desktop é opcional (só para correr o Supabase localmente).

```powershell
git clone https://github.com/vndesignwork-creator/Plataforma-de-Prospe-o-VNDesign.git
cd Plataforma-de-Prospe-o-VNDesign
npm install
Copy-Item .env.example apps/web/.env.local
```

### Opção A — Supabase na nuvem (sem Docker) · recomendado para começar

1. Em [supabase.com](https://supabase.com) cria um projeto (região **West EU (Ireland)** ou **Central EU (Frankfurt)**).
2. **Authentication → Sign In / Providers**:
   - deixa o provider **Email** ativo;
   - desativa **"Allow new users to sign up"** (só tu entras; o utilizador é criado pelo script).
3. **Authentication → URL Configuration**: *Site URL* `http://localhost:3000`
   (em produção, o teu domínio) e acrescenta `http://localhost:3000/auth/callback` aos *Redirect URLs*.
4. **Project Settings → API Keys**: copia o *Project URL*, a *Publishable key* e a *Secret key*
   para `apps/web/.env.local` (ver `.env.example`).
5. Aplica as migrações:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>   # o ref está no URL do projeto
   npx supabase db push
   ```

### Opção B — Supabase local (com Docker Desktop)

```powershell
npx supabase start          # aplica as migrações; mostra URL e chaves
npx supabase status -o env  # copia API_URL, PUBLISHABLE_KEY e SECRET_KEY para apps/web/.env.local
```

`npx supabase db reset` recria a base de dados local a partir das migrações.

### Criar o teu utilizador

O registo público está desativado. Cria o utilizador com:

```powershell
npm run create-user
# ou sem perguntas:
npm run create-user -- --email eu@vndesign.pt --password "uma-palavra-passe-forte" --name "Vá Nancassa" --phone "+351 9xx xxx xxx"
```

Ao ser criado, o utilizador recebe automaticamente o workspace **VNDesign** com os setores,
os modelos de contacto e as ferramentas da folha.

### Correr

```powershell
npm run dev        # http://localhost:3000
```

---

## Testes

```powershell
npm test               # Vitest: normalização, duplicados, datas/€, schemas, erros da API
npm run lint
npm run typecheck
```

**Paridade TypeScript ↔ SQL** (garante que a deteção de duplicados dá o mesmo resultado
no browser e na base de dados) — corre com o Supabase ligado:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"; $env:SUPABASE_KEY="<publishable key>"; npm test -w @vndesign/core
```

**E2E (Playwright)** — precisa do Supabase e de um utilizador de teste:

```powershell
npm run create-user -- --email teste@vndesign.pt --password teste12345 --name Teste
# em apps/web/.env.local: E2E_EMAIL=teste@vndesign.pt e E2E_PASSWORD=teste12345
npx playwright install chromium
npm run test:e2e       # arranca o "npm run dev" automaticamente
```

O GitHub Actions (`.github/workflows/ci.yml`) corre lint, tipos, testes, build e — com um
Supabase local — as migrações, a paridade SQL e os testes E2E.

---

## API

- Documentação interativa: **`/docs/api`** · especificação: **`/api/v1/openapi.json`**
- Autenticação:
  - **Web:** sessão (cookies);
  - **App móvel:** `Authorization: Bearer <access token do Supabase>`;
  - **Integrações:** tokens pessoais `vnd_…`, a partir da Fase D (incluindo `POST /api/v1/leads/import`).
- Erros em `application/problem+json`, com mensagens em pt-PT. Respostas em `{ "data": … }`.

Exemplo em PowerShell, com um access token:

```powershell
$h = @{ Authorization = "Bearer $token" }
Invoke-RestMethod "http://localhost:3000/api/v1/leads?status=contactado&due=overdue" -Headers $h
```

---

## Deploy

### Vercel

1. *Add New → Project* → importa o repositório.
2. **Root Directory:** `apps/web` (o Vercel deteta o Next.js e o monorepo npm).
3. **Environment Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
4. No Supabase (*Authentication → URL Configuration*):
   - *Site URL* = `https://<o-teu-domínio>`;
   - acrescenta `https://<o-teu-domínio>/auth/callback` aos *Redirect URLs*.
5. Migrações: corre `npx supabase db push` (ou automatiza no CI) antes de cada deploy que as altere.

### Coolify (Docker)

O `Dockerfile` na raiz gera uma imagem Node "standalone".

1. *New Resource → Application* → repositório Git → **Build Pack: Dockerfile**.
2. **Build Variables:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   São embutidas no build, por isso têm de estar disponíveis *no build* e não só em runtime.
3. **Environment Variables (runtime):** as mesmas duas, mais `SUPABASE_SECRET_KEY`.
4. **Porta:** 3000. Configura o domínio e o HTTPS no Coolify.
5. Atualiza os URLs de autenticação no Supabase, como no Vercel.

Para testar a imagem localmente:

```powershell
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... -t vndesign-leads .
docker run -p 3000:3000 --env-file apps/web/.env.local vndesign-leads
```

---

## Plano por fases

| Fase | Conteúdo | Estado |
|---|---|---|
| A | Projeto, autenticação, modelo de dados + RLS, CRUD de leads, tabela + ficha, duplicados, "não contactar", RGPD | ✅ |
| B | Kanban, dashboard, importação/exportação CSV/XLSX (com a folha atual) | ⏳ |
| C | Scripts de contacto com variáveis, assinatura, lembretes de follow-up | ⏳ |
| D | Auditor de sites, API de integração com token, PWA | ⏳ |
| E | Email com IA, propostas em PDF, mapa | ⏳ |
