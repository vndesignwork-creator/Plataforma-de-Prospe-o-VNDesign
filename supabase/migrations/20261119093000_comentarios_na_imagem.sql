-- Comentários em cima da imagem nas entregas: cada entrega pode ter uma imagem
-- (pré-visualização, no bucket privado "project-files") e marcas com comentários
-- colocadas num ponto da imagem — pela equipa ou pelo cliente, na página do projeto.

alter table public.project_deliverables
  add column if not exists image_path text,
  add column if not exists image_name text;

create table if not exists public.deliverable_pins (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  deliverable_id uuid not null references public.project_deliverables(id) on delete cascade,
  -- Posição em percentagem da largura/altura da imagem (aguenta qualquer tamanho de ecrã).
  x numeric(5, 2) not null check (x >= 0 and x <= 100),
  y numeric(5, 2) not null check (y >= 0 and y <= 100),
  comment text not null check (length(btrim(comment)) between 1 and 1000),
  -- Quem escreveu: a equipa (com sessão) ou o cliente (na página do projeto).
  author text not null default 'equipa' check (author in ('equipa', 'cliente')),
  author_name text check (author_name is null or length(author_name) <= 120),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index if not exists deliverable_pins_deliverable_idx on public.deliverable_pins (deliverable_id, created_at);
create trigger deliverable_pins_touch before update on public.deliverable_pins
  for each row execute function public.vnd_touch_updated_at();
alter table public.deliverable_pins enable row level security;
create policy deliverable_pins_member_all on public.deliverable_pins for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
