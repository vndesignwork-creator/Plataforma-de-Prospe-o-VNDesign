-- Imagens e links de referência no briefing: o cliente mostra o que gosta
-- (sites, imagens) com uma nota em cada ("gosto destas cores").
alter table public.project_briefings
  add column if not exists "references" jsonb not null default '[]'::jsonb;
