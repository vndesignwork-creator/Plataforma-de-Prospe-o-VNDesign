-- =============================================================================
-- Pomodoro nos projetos.
--  - project_time_entries.pomodoro / pomodoro_done / task_id: o trabalho dos
--    pomodoros fica no registo de horas (conta para o €/hora), com a tarefa
--    escolhida; pomodoro_done marca o registo que fechou um pomodoro completo
--    (com pausas a meio, um pomodoro tem vários registos).
--  - pomodoro_timers: o pomodoro em curso de cada utilizador (fase, quando
--    acaba, pausa, ciclo). As transições fazem-se no servidor (ao abrir a app ou
--    pelo cron dos lembretes, que envia a notificação).
-- =============================================================================

alter table public.project_time_entries
  add column if not exists pomodoro boolean not null default false,
  add column if not exists pomodoro_done boolean not null default false,
  add column if not exists task_id uuid references public.lead_tasks (id) on delete set null;
create index if not exists project_time_pomodoro_idx on public.project_time_entries (user_id, started_at desc) where pomodoro;

create table public.pomodoro_timers (
  -- Um pomodoro de cada vez, por utilizador.
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null,
  task_id uuid references public.lead_tasks (id) on delete set null,
  -- work = a trabalhar · short_break / long_break = pausa · ready = pausa acabou, à espera do próximo
  phase text not null check (phase in ('work', 'short_break', 'long_break', 'ready')),
  phase_started_at timestamptz not null default now(),
  -- null em "ready" e em pausa (fica o que faltava em paused_left).
  ends_at timestamptz,
  paused_left integer check (paused_left is null or paused_left >= 0),
  -- Pomodoros de trabalho completos neste ciclo (a pausa longa vem a cada N).
  completed integer not null default 0 check (completed >= 0),
  -- Registo de horas da fase de trabalho em curso.
  entry_id uuid references public.project_time_entries (id) on delete set null,
  -- Já avisado do fim da fase (pela app aberta ou por notificação do cron).
  notified_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index pomodoro_timers_due_idx on public.pomodoro_timers (ends_at) where ends_at is not null;
alter table public.pomodoro_timers enable row level security;
create policy pomodoro_timers_member_own on public.pomodoro_timers for all to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = auth.uid())
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());
