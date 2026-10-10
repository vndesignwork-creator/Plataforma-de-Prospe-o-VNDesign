# VNDesign Leads

Plataforma de prospeção de clientes da **VNDesign** (vndesign.pt). Substitui a folha
"Leads_Prospeccao_VNDesign": pipeline de leads, deteção de duplicados, linha do tempo,
dashboard, scripts de contacto e mais. Interface em português europeu (DD/MM/AAAA, €).

> **Estado:** Fases A, B e C concluídas — leads com deteção de duplicados, Kanban,
> dashboard, importação/exportação, scripts de contacto, assinatura e lembretes de
> follow-up. Ver [Plano por fases](#plano-por-fases).

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

## Importar a folha atual

1. No Google Sheets (“Leads_Prospeccao_VNDesign”): **Ficheiro → Transferir → Microsoft Excel (.xlsx)**.
2. Na plataforma: **Importar** → escolhe o ficheiro. A folha “🎯 Pipeline de Leads”, o cabeçalho
   (linha 2) e as colunas são detetados automaticamente; valores como “🔍 Identificado”,
   “✅ Sim”, “--”, “08/10/2026” ou “1.250,00 €” são convertidos.
3. Revê: linhas repetidas no ficheiro, leads que já existem (podes **juntar** — só preenche
   campos vazios — ou ignorar) e empresas na lista “não contactar” (bloqueadas).
4. Confirma. O “#” da folha é mantido quando está livre e fica um relatório em “Importações anteriores”.

Na lista de leads, **Exportar** gera um `.xlsx` ou um `.csv` (separador “;”, para o Excel em
português) com as mesmas colunas — pode ser reimportado sem mapear nada.

---

## Scripts de contacto e lembretes

- **Scripts** (menu): biblioteca de modelos com variáveis — `{{empresa}}`, `{{contacto}}`,
  `{{setor}}`, `{{cidade}}`, `{{problema}}`, `{{angulo}}`, `{{website}}`, `{{argumentos}}`,
  `{{data}}`, `{{hoje}}`, `{{meu_nome}}`, `{{meu_cargo}}`, `{{meu_telefone}}`, `{{meu_email}}`,
  `{{meu_site}}`, `{{portfolio}}`, `{{projetos}}`, `{{assinatura}}`, `{{opt_out}}`.
  `{{contacto|equipa}}` usa “equipa” quando o lead não tem contacto.
- **Ficha do lead → Scripts de contacto:** escolhe o modelo, edita, copia, abre no email,
  guarda como email de prospeção ou marca como enviado (passa a “Contactado” e agenda o follow-up).
- **Follow-up:** na ficha e na lista “Hoje” — *Feito* (com ou sem nova data) ou *Adiar*.
  Os dias até ao follow-up configuram-se em **Definições → Follow-up e lembretes**.
- **Notificações push** (Fase D): Definições → *Ativar notificações neste dispositivo* — chegam
  todas as manhãs mesmo com a plataforma fechada (ver “App no telemóvel” abaixo).
- **Resumo diário por email** (opcional): precisa de SMTP e de um cron.

## Arquivar e apagar leads

- **Arquivar** (ficha → *Arquivar*, ou vários de uma vez na lista): o lead sai da lista, do
  Kanban, do mapa, de “Hoje” e do resumo diário, mas mantém histórico, propostas e estatísticas
  e continua a ser detetado como duplicado. *Repor* volta a pô-lo ativo.
- **Lista de leads:** seleciona leads com as caixas à esquerda para *Arquivar*, *Repor* ou
  *Apagar* em conjunto; o filtro *Sem os arquivados / Só os arquivados / Com os arquivados*
  mostra os arquivados.
- **Arquivo automático** (opcional): Definições → Follow-up e lembretes → leads em “Sem
  interesse” há mais de N dias são arquivados todas as manhãs (pelo mesmo cron do resumo diário).
- **Apagar** é definitivo (para erros, testes e duplicados). Para pedidos RGPD usa *Anonimizar*.

### Configurar o email (resumo diário)

Em `apps/web/.env.local` (ou nas variáveis da Hostinger/Vercel):

```
SMTP_HOST=smtp.hostinger.com     # email @vndesign.pt da Hostinger
SMTP_PORT=465
SMTP_USER=leads@vndesign.pt
SMTP_PASS=<palavra-passe da caixa de email>
SMTP_FROM=VNDesign Leads <leads@vndesign.pt>
APP_URL=https://leads.vndesign.pt
CRON_SECRET=<um texto aleatório longo>
```

Em desenvolvimento, o Supabase local inclui o **Mailpit**: usa `SMTP_HOST=127.0.0.1` e
`SMTP_PORT=54325` e vê os emails em http://127.0.0.1:54324. Testa em **Definições →
Enviar um resumo de teste agora**.

**Agendar o envio** (todas as manhãs) — chamar `GET /api/v1/cron/daily-digest` com
`Authorization: Bearer <CRON_SECRET>`:

- **Vercel:** já configurado em `apps/web/vercel.json` (06:45 UTC); define `CRON_SECRET` no projeto.
- **Hostinger** (hPanel → Avançado → Cron Jobs), comando:
  `curl -s -H "Authorization: Bearer <CRON_SECRET>" https://leads.vndesign.pt/api/v1/cron/daily-digest`
- **Coolify:** *Scheduled Tasks* com o mesmo `curl`.

O mesmo cron envia também as **notificações push** a todos os dispositivos ativados.

---

## Auditor de sites

Na ficha do lead, **Diagnóstico do site → Analisar site**. Verifica:

- HTTPS e certificado SSL (válido, emissor, data de expiração);
- adaptação a telemóvel (meta viewport e zoom bloqueado);
- título e meta descrição;
- plataforma (WordPress com versão, Wix, Shopify, Squarespace…) e ano do copyright no rodapé;
- PageSpeed mobile do Google (pontuação, LCP, CLS…).

Os problemas encontrados são escritos à moda da folha (“Sem HTTPS; Não é responsivo;
PageSpeed 34”) e podes **aplicá-los ao lead** (PageSpeed, Mobile? e Problemas — substituir
ou acrescentar). Fica um histórico das análises e uma entrada “Site analisado” na atividade.
Links de redes sociais/diretórios dão “Sem site próprio”.

**PageSpeed:** sem chave funciona com limites baixos. Para uso diário cria uma chave gratuita
(Google Cloud → *APIs e serviços* → ativar *PageSpeed Insights API* → *Credenciais → Criar
chave de API*) e define `PAGESPEED_API_KEY`. A análise demora 10–40 segundos.

**Segurança:** o servidor só abre endereços públicos em `http`/`https` (portas 80/443), nunca
`localhost` nem a rede interna, também depois de redirecionamentos.

---

## Email com IA

Na ficha do lead, **Escrever com IA**:

1. Escolhe o tipo de email (primeiro contacto, follow-up, depois de uma chamada, envio da proposta), o tom e o tamanho.
2. Opcionalmente, acrescenta indicações.
3. O Claude escreve o assunto e o texto em português de Portugal.

O texto usa os dados do lead, a última análise do site e os argumentos de venda do setor. A assinatura e a linha de opt-out (RGPD) são acrescentadas automaticamente. Revê sempre o texto antes de enviar. Depois podes copiá-lo, abri-lo no programa de email ou guardá-lo como email de prospeção.

**Configurar:**

- Cria uma chave em https://console.anthropic.com (*API Keys*). É preciso ter créditos na conta: cada email custa poucos cêntimos.
- No PC, na pasta do projeto, corre `npm run ai-key`. Cola a chave quando for pedida (não
  aparece no ecrã). O comando testa-a junto da Anthropic e só a grava no
  `apps/web/.env.local` se for aceite. `npm run ai-key -- --test` volta a testar a chave gravada.
- Na Hostinger, define `ANTHROPIC_API_KEY` nas variáveis de ambiente.
- O modelo por omissão é `claude-opus-5-5`; podes mudá-lo com `ANTHROPIC_MODEL`.
- O estado da configuração aparece em **Definições → Propostas e IA**.

---

## Propostas em PDF

Na ficha do lead, **Propostas → Nova proposta**. Começa com o pacote recomendado; acrescenta
outros pacotes (Essencial, Profissional, Premium, Manutenção mensal) ou itens à medida, ajusta
preços, quantidades e desconto. O texto inicial pode ser sugerido a partir da análise do site.

- **Ver PDF / Descarregar:** A4 com a identidade VNDesign (cabeçalho escuro, laranja, Syne e
  Plus Jakarta Sans), itens, total, mensalidade, validade, pagamento e próximos passos.
- **Enviar por email** abre o email já escrito (anexa o PDF descarregado).
- **Marcar como enviada** passa o lead para “Proposta enviada” e regista a atividade.
- Os pacotes, a validade (30 dias), as condições de pagamento, a nota de IVA e os próximos
  passos editam-se em **Definições → Propostas e IA**. Os preços iniciais são só exemplos.
- As propostas são numeradas por ano: `2026-001`, `2026-002`…

---

## Mapa

**Mapa** (menu): os leads com coordenadas, coloridos pelo estado, com filtros por estado e setor.

- **Localizar N leads** procura as moradas no OpenStreetMap (gratuito; 1 pesquisa por segundo,
  por isso 25 leads demoram cerca de meio minuto). Tenta a morada, depois o nome + cidade e,
  em último caso, só a cidade (posição aproximada, com círculo tracejado).
- Na ficha do lead: **Localizar**, **Ver no mapa** ou **Marcar no mapa** (clica no mapa para
  corrigir a posição).

---

## API de integração (tarefa semanal com o Claude)

1. **Definições → API e integrações → Criar token** (permissão `leads:import`). Copia o token
   `vnd_…` — só é mostrado uma vez.
2. A tarefa envia os leads para `POST /api/v1/leads/import` com
   `Authorization: Bearer vnd_…`. Guia completo, exemplos em curl/PowerShell e o texto para
   colar nas instruções da tarefa: **[docs/INTEGRACAO.md](docs/INTEGRACAO.md)**.
3. Os leads entram com as mesmas regras da importação: duplicados ignorados (ou juntados),
   lista “não contactar” respeitada, e aparecem no histórico de importações e na atividade
   (“via API”).

Podes revogar um token a qualquer momento; deixa de funcionar de imediato.

---

## App no telemóvel (PWA)

- **Instalar:** abre a plataforma no Chrome do telemóvel → menu ⋮ → **Adicionar ao ecrã
  principal** (ou o botão *Instalar a app* em Definições). Abre em ecrã inteiro, com ícone próprio.
- **Notificações push:** Definições → *Follow-up e lembretes* → **Ativar notificações neste
  dispositivo** → *Enviar notificação de teste*. Ao tocar na notificação abre o lead (ou o dashboard).
- Precisam das chaves VAPID no servidor (uma vez):

  ```powershell
  npx web-push generate-vapid-keys
  ```

  e define `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT=mailto:geral@vndesign.pt`.
  Sem elas, as Definições oferecem o aviso “ao abrir a plataforma”.
- Sem rede, aparece a página “Sem ligação” (os dados não ficam guardados no telemóvel).
- No iPhone, as notificações só funcionam com a app instalada no ecrã principal (iOS 16.4+).

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

Se já tiveres o `npm run dev` a correr, acrescenta ao `apps/web/.env.local`
`AUDIT_ALLOW_PRIVATE=1`, `AUDIT_SKIP_PAGESPEED=1` (o teste do auditor analisa um site local),
`ANTHROPIC_API_KEY=sk-ant-teste`, `AI_BASE_URL=http://127.0.0.1:4621` e
`GEOCODER_URL=http://127.0.0.1:4620/search` (os testes da Fase E usam serviços falsos, sem custos).

O GitHub Actions (`.github/workflows/ci.yml`) corre lint, tipos, testes, build e — com um
Supabase local — as migrações, a paridade SQL e os testes E2E.

---

## API

- Documentação interativa: **`/docs/api`** · especificação: **`/api/v1/openapi.json`**
- Autenticação:
  - **Web:** sessão (cookies);
  - **App móvel:** `Authorization: Bearer <access token do Supabase>`;
  - **Integrações:** tokens pessoais `vnd_…` (Definições → API e integrações), com permissões
    `leads:import` (`POST /leads/import`), `leads:read` (`GET /leads`, `/leads/{id}`, `/sectors`,
    `/meta`, `POST /leads/check-duplicates`) e `leads:write` (`POST /leads`, `PATCH /leads/{id}`).
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

### Hostinger (plano Business ou Cloud — Node.js Apps)

O projeto tem um build "standalone" pensado para isto (`npm run build:standalone`).
A base de dados fica no **Supabase na nuvem** (ver Opção A acima).

**Assistente:** `npm run publicar` verifica o projeto Supabase na nuvem (chaves, migrações,
registo público desligado), cria o teu utilizador se faltar e escreve as variáveis da
Hostinger em `.env.hostinger.local` (só no teu computador). Depois de publicar,
`npm run publicar -- --verificar` confirma o site no ar (login, API, HTTPS, PWA e cron).

1. hPanel → **Websites → Adicionar website → Node.js Apps** → ligar o **GitHub** e escolher
   este repositório e o ramo a publicar.
2. **Definições de build** (se a Hostinger detetar `apps/web` como pasta, muda para a raiz):

   | Campo | Valor |
   |---|---|
   | Framework | Other (ou Express/Node, se não houver "Other") |
   | Root directory | `/` (raiz do repositório — **não** `apps/web`) |
   | Node.js | 24.x (ou 22.x) |
   | Build script | `build:standalone` |
   | Output directory | `apps/web/.next/standalone` |
   | Entry file | `apps/web/.next/standalone/apps/web/server.js` |

3. **Variáveis de ambiente:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` e `HOSTNAME=0.0.0.0` (mais, se usares: `SMTP_*`, `APP_URL`,
   `CRON_SECRET`, `PAGESPEED_API_KEY`, `VAPID_*`, `ANTHROPIC_API_KEY` — ver `.env.example`). A Hostinger injeta-as no build e na execução;
   cada alteração precisa de um novo deploy.
4. Associa o domínio (ex.: `leads.vndesign.pt`) e confirma que o SSL está ativo.
5. No Supabase (*Authentication → URL Configuration*): *Site URL* = `https://leads.vndesign.pt`
   e acrescenta `https://leads.vndesign.pt/auth/callback` aos *Redirect URLs*.

O root directory tem de ser a raiz porque a web usa o pacote interno `packages/core`;
com `apps/web` sozinho a instalação falha.

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
| B | Kanban, dashboard, importação/exportação CSV/XLSX (com a folha atual) | ✅ |
| C | Scripts de contacto com variáveis, assinatura, lembretes de follow-up | ✅ |
| D | Auditor de sites, API de integração com token, PWA e notificações push | ✅ |
| E | Email com IA, propostas em PDF, mapa | ✅ |
