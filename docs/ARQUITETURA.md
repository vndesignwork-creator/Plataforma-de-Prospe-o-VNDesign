# Arquitetura — VNDesign Leads

## Visão geral

```
Browser (web/PWA) ──┐
App Expo (futura) ──┼──► /api/v1 (Next.js route handlers) ──► Supabase Postgres (RLS)
Integrações (token)─┘          │                                   ▲
                               └── packages/core (Zod, regras) ────┘ funções SQL
```

- **A web é o primeiro cliente da própria API.** As páginas usam TanStack Query sobre
  `/api/v1`. Assim, tudo o que a web faz, a app móvel também consegue fazer.
- **`packages/core`** contém os schemas Zod, os enums com rótulos pt-PT, a normalização,
  os parsers da folha e a formatação. É TypeScript puro e será reutilizado pela app Expo.
- **Autenticação** num só sítio (`apps/web/src/server/context.ts`):

  | Cliente | Mecanismo | Acesso aos dados |
  |---|---|---|
  | Web | Sessão Supabase em cookies (renovada pelo `proxy.ts`) | JWT do utilizador → RLS |
  | App móvel | `Authorization: Bearer <access token Supabase>` | JWT do utilizador → RLS |
  | Integrações (Fase D) | `Authorization: Bearer vnd_…` (hash SHA-256, scopes) | servidor + `workspace_id` explícito |

- Pedidos autenticados por cookie que alteram dados têm de ter `Origin` igual ao host
  (proteção CSRF).

## Modelo de dados

Todas as tabelas têm `workspace_id` e RLS (`is_workspace_member(workspace_id)`). Começa
com um utilizador, mas está pronto para colaboradores.

| Tabela | Notas |
|---|---|
| `workspaces` | `lead_counter` (para o "#"), `settings` (fuso, dias de follow-up = 3, linha de opt-out) |
| `workspace_members` | papel `owner` / `admin` / `member` |
| `sectors` | editáveis; emoji, prioridade, notas de oportunidade, argumentos de venda |
| `leads` | todas as colunas da folha + morada/coordenadas + campos derivados por trigger |
| `lead_activities` | linha do tempo; FK composta `(workspace_id, lead_id)` |
| `do_not_contact` | RGPD; bloqueia criação/importação |
| `contact_templates`, `signatures`, `tools` | dados iniciais da folha (interface nas Fases C/B) |
| `user_preferences` | ex.: colunas visíveis da tabela (`leads.table`) |

**Enums:** `lead_status`, `lead_channel`, `mobile_status` (`desconhecido` = "--"),
`activity_type`, `template_kind`, `member_role`.

**Campos derivados de `leads`** (trigger `vnd_leads_before_write`, não editáveis):

- `company_name_normalized`
- `website_key`
- `email_normalized`
- `email_domain`
- `search_text`

**Índices:**

- `(workspace_id, status, kanban_position)`
- setor, cidade, "sugerido em"
- próxima ação (parcial, exclui fechados)
- `website_key`, email, `email_domain`
- GIN trigram no nome normalizado e no texto de pesquisa

## Regras de negócio

### Deteção de duplicados (`find_lead_duplicates`)

A **fonte de verdade é o SQL**. O espelho em TypeScript (`packages/core/src/normalize.ts`)
é verificado contra o SQL pelo teste `sql-parity.test.ts`.

1. **Nome normalizado:** minúsculas, sem acentos e sem pontuação; a forma jurídica final
   (`Lda`, `Unipessoal`, `S.A.`…) é retirada *antes* de tirar os acentos, para que
   "Clínica Sá" não perca o "Sá".
2. **Chave do website:** domínio sem protocolo nem `www`. Em redes sociais e agregadores
   (Facebook, Instagram, Restaurant Guru, Sluurpy, Wanderlog, Google…) a chave inclui o
   caminho, por exemplo `facebook.com/bogotacervejaria`.
3. **Email:** primeiro email válido, em minúsculas. Também se compara o domínio
   empresarial do email com o website de outro lead (ignorando gmail, sapo, etc.).

| Força | Critério | Efeito |
|---|---|---|
| **forte** | mesmo website, mesmo email, mesmo nome, ou domínio do email = website | Aviso; ao gravar dá **409**, e o utilizador pode juntar ou criar mesmo assim |
| **possível** | semelhança de trigramas do nome ≥ 0,6 | Só aviso (não bloqueia) |

**Juntar** (`merge_leads`): os valores escolhidos campo a campo ficam no lead principal; a
atividade dos duplicados passa para ele e os duplicados são apagados. Sem duplicados, só
aplica os dados de um registo novo a um lead existente.

### Estados e follow-up (trigger)

- **→ Contactado:**
  - preenche o 1.º contacto, se estiver vazio;
  - último follow-up = hoje;
  - se não houver próxima ação futura, cria "Enviar follow-up" a +3 dias
    (`settings.follow_up_days`).
- **→ Cliente / Sem interesse:** limpa a próxima ação.
- **Linha do tempo:** cada mudança de estado, edição (com a lista de campos), junção e
  follow-up agendado é registada automaticamente.

### RGPD

- Guardar só dados empresariais públicos; o campo **Fonte** indica a origem dos dados.
- **Apagar:** remove o lead e toda a linha do tempo; pode acrescentar a empresa à lista
  "não contactar".
- **Anonimizar** (`anonymize_lead`): apaga contactos, textos livres e notas; mantém setor,
  cidade, estado e valor para as estatísticas.
- **Lista "não contactar":** bloqueia criação e importação. A correspondência faz-se por
  nome normalizado, website ou email (incluindo o domínio).
- Os modelos de email incluem `{{opt_out}}`: "Se não quiser receber mais contactos,
  basta responder a este email."

## Convenções da API `/api/v1`

- JSON em snake_case; datas `AAAA-MM-DD`; timestamps ISO 8601; valores em euros.
- Sucesso: `{ "data": … }`. Listas: `{ "data": [...], "meta": { "page", "limit", "total" } }`.
- Erros: `application/problem+json` (`title`, `detail`, `errors` por campo), em pt-PT.
- Filtros de lista separados por vírgulas (`?status=contactado,respondeu`).
- OpenAPI gerado a partir dos mesmos schemas Zod que validam os pedidos.

### Endpoints da Fase A

| Método | Rota |
|---|---|
| GET | `/me`, `/meta` |
| GET / POST | `/leads` (POST: 409 duplicado forte · 422 "não contactar" · `?force=true`) |
| POST | `/leads/check-duplicates` |
| GET / PATCH / DELETE | `/leads/{id}` (DELETE `?add_to_do_not_contact=true`) |
| POST | `/leads/{id}/merge`, `/leads/{id}/anonymize` |
| GET / POST | `/leads/{id}/activities` |
| DELETE | `/leads/{id}/activities/{activityId}` (notas próprias) |
| GET / POST | `/sectors` |
| PATCH / DELETE | `/sectors/{id}` |
| GET / POST | `/do-not-contact` |
| DELETE | `/do-not-contact/{id}` |
| GET / PUT | `/preferences/{key}` |
| GET | `/openapi.json` (documentação em `/docs/api`) |

### Endpoints da Fase B

| Método | Rota |
|---|---|
| GET | `/board` (colunas do Kanban; aceita os filtros de `/leads`) |
| POST | `/leads/{id}/move` (`{ status, position }`) |
| GET | `/dashboard` (resumo, por setor/estado/canal, funil, semanas) |
| GET | `/dashboard/today` (em atraso, hoje e próximos 7 dias) |
| GET | `/leads/export?format=csv\|xlsx` (+ filtros) |
| POST | `/imports/analyze` (multipart: `file`, `sheet`) |
| POST | `/imports/preview` (`{ rows, mapping }`) |
| GET / POST | `/imports` (histórico / gravar `{ items: [{ action: create\|merge\|skip }] }`) |

**Kanban:** `kanban_position` (double) — menor = mais acima; o cliente calcula a posição entre
os vizinhos. Novos leads e mudanças de estado sem posição vão para o topo (trigger).

**Dashboard** (`dashboard_summary`): ativos = Identificado…Proposta enviada; conversão =
clientes ÷ total e clientes ÷ contactados; o funil usa a etapa mais alta alguma vez atingida
(histórico `status_changed`); a evolução semanal usa “Sugerido em” (ou a data de criação).

**Importação:** o ficheiro é lido no servidor (exceljs/papaparse); `packages/core/src/import.ts`
deteta o cabeçalho, sugere o mapeamento e converte cada linha (testado com o formato da folha).
`find_import_duplicates` e `check_import_do_not_contact` verificam todas as linhas numa só
chamada; `import_leads` grava tudo numa transação (criar ou juntar preenchendo campos vazios).

### Endpoints da Fase C

| Método | Rota |
|---|---|
| GET / POST | `/templates` |
| GET / PATCH / DELETE | `/templates/{id}` |
| POST | `/leads/{id}/render-template` (`{ template_id }` ou `{ subject, body }`) |
| POST | `/leads/{id}/follow-up` (`{ action: done\|snooze, days?, note? }`) |
| GET / PUT | `/signature` |
| GET / PATCH | `/settings` (dias de follow-up, opt-out, resumo diário) |
| POST | `/settings/test-digest` |
| GET / POST | `/cron/daily-digest` (`Authorization: Bearer CRON_SECRET`) |

**Modelos:** `packages/core/src/templates.ts` (`renderTemplate`, `buildTemplateContext`) é usado
na pré-visualização no browser e na API — o mesmo resultado nos dois lados. Variáveis vazias
desaparecem e a pontuação é arrumada (“Olá {{contacto}},” → “Olá,”).

**Follow-up:** `complete_follow_up()` (SQL) regista “Follow-up feito” ou “Adiado” sem gerar também
um “Lead editado”. O resumo diário usa a chave de serviço só no servidor
(`digest_recipients()`, acessível apenas a `service_role`).

### Planeado: `POST /api/v1/leads/import` (Fase D)

Para a tarefa semanal de prospeção com o Claude. Autenticação por token
`Authorization: Bearer vnd_…` com o scope `leads:import`. Suporta `Idempotency-Key`.

```json
{
  "source": "claude-semanal",
  "on_duplicate": "skip",
  "dry_run": false,
  "leads": [
    {
      "company_name": "Restaurante O Lagar",
      "sector": "Restauração",
      "website": "https://olagar.pt",
      "city": "Amadora",
      "problems": "Sem HTTPS; não é responsivo",
      "pagespeed": 34,
      "mobile": "Não",
      "email": "geral@olagar.pt",
      "approach_angle": "Reservas online",
      "source_url": "https://maps.google.com/…",
      "suggested_on": "2026-10-06",
      "email_subject": "…",
      "email_body": "…"
    }
  ]
}
```

- `sector`, `status`, `channel` e `mobile` aceitam o nome, o código ou a versão com emoji
  da folha (por exemplo `"🔍 Identificado"`). Os parsers já existem em
  `packages/core/src/parse.ts`.
- `on_duplicate` pode ser `skip`, `merge` ou `create`.
- A resposta traz um resultado por lead:
  - `created`, `merged`, `skipped_duplicate`, `blocked_dnc` ou `invalid`;
  - mais um resumo.
