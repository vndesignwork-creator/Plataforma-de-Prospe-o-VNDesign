-- =============================================================================
-- Briefing online e despesas dos projetos.
--  - project_briefings: um formulário por projeto (link /b/<código>) com as
--    perguntas das Definições; o cliente responde e junta ficheiros.
--  - Ficheiros do briefing no Storage (bucket privado "project-files").
--  - project_expenses: custos do projeto (alojamento, plugins, fotos…) para o
--    lucro real e o ganho líquido por hora.
-- =============================================================================

alter type public.activity_type add value if not exists 'briefing_received';

create table public.project_briefings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null unique,
  token text not null unique check (length(token) between 16 and 64),
  -- ["Pergunta 1", "Pergunta 2", …] (as das Definições no momento de criar).
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  -- ["Resposta 1", …] pela mesma ordem.
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  -- [{ "name", "path", "size", "type" }]
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  status text not null default 'pendente' check (status in ('pendente', 'respondido')),
  submitted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create trigger project_briefings_touch before update on public.project_briefings
  for each row execute function public.vnd_touch_updated_at();
alter table public.project_briefings enable row level security;
create policy project_briefings_member_all on public.project_briefings for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Bucket privado (o servidor guarda e dá links temporários).
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 15728640)
on conflict (id) do nothing;

create table public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  spent_on date not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index project_expenses_lead_idx on public.project_expenses (lead_id, spent_on);
alter table public.project_expenses enable row level security;
create policy project_expenses_member_all on public.project_expenses for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
