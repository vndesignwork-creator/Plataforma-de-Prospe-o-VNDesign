# VNDesign Leads — notas para o Claude

- Interface, textos, mensagens de erro e comentários em **português europeu** (pt-PT): "utilizador", "ficheiro", "ecrã", "telemóvel", DD/MM/AAAA, €.
- Monorepo npm: `apps/web` (Next.js 16 + API `/api/v1`), `packages/core` (Zod, enums, normalização — partilhado com a futura app Expo), `supabase/migrations`.
- A deteção de duplicados tem a fonte de verdade em SQL (`vnd_normalize_company`, `vnd_website_key`, `vnd_normalize_email`); o espelho TS em `packages/core/src/normalize.ts` tem de ficar igual (teste `sql-parity.test.ts`).
- Novas tabelas: sempre com `workspace_id`, RLS ativo e política `is_workspace_member(workspace_id)`. Alterações ao esquema = nova migração em `supabase/migrations/` (nunca editar migrações já aplicadas em produção).
- A web consome a própria API (TanStack Query); novos endpoints usam `apiRoute()` + schemas de `@vndesign/core` e entram em `src/server/openapi.ts`.
- Verificações: `npm run lint && npm run typecheck && npm test`; E2E: `npm run test:e2e` (Supabase local + utilizador de teste).
