-- Emails devolvidos e respostas inteligentes (deteção de respostas, IMAP):
--  - email_bounced_at: o último email ao lead foi devolvido ("endereço não
--    existe"); volta a null quando se muda o email do lead;
--  - atividade 'email_bounced' na linha do tempo;
--  - motivo de "Sem interesse" 'respondeu_nao' (respondeu ao email que não tem interesse).

alter type public.activity_type add value if not exists 'email_bounced';

alter table public.leads add column if not exists email_bounced_at timestamptz;

create or replace function public.vnd_leads_clear_bounce()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    new.email_bounced_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists leads_clear_bounce on public.leads;
create trigger leads_clear_bounce before update of email on public.leads
  for each row execute function public.vnd_leads_clear_bounce();

alter table public.leads drop constraint if exists leads_lost_reason_check;
alter table public.leads add constraint leads_lost_reason_check
  check (lost_reason is null or lost_reason in ('preco', 'ja_tem_site', 'agora_nao', 'nao_responde', 'respondeu_nao', 'outro'));
