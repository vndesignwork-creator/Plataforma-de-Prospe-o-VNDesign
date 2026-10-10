-- =============================================================================
-- Lembretes nas tarefas: "remind_at" (dia e hora) envia uma notificação push
-- (cron /api/v1/cron/reminders, de 5 em 5 minutos). "reminded_at" marca o envio.
-- =============================================================================

alter table public.lead_tasks
  add column remind_at timestamptz,
  add column reminded_at timestamptz;

-- Lembretes por enviar (o cron só lê estes).
create index lead_tasks_remind_idx on public.lead_tasks (remind_at)
  where remind_at is not null and reminded_at is null and done_at is null;

-- Mudar a hora do lembrete volta a deixá-lo por enviar.
create or replace function public.vnd_lead_tasks_reset_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end
$$;
create trigger lead_tasks_reset_reminder before update of remind_at on public.lead_tasks
  for each row execute function public.vnd_lead_tasks_reset_reminder();
