-- =============================================================================
-- Modelos de mensagens WhatsApp (2/2): três modelos prontos por workspace
-- (primeiro contacto, follow-up e lembrete de reunião), editáveis em Scripts.
-- =============================================================================
create or replace function public.seed_whatsapp_templates(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order integer;
begin
  select coalesce(max(sort_order), 0) into v_order from public.contact_templates where workspace_id = p_workspace_id;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, 'whatsapp'::public.template_kind, t.name, null, t.body, null, false, v_order + t.n
  from (
    values
      (1, 'WhatsApp — primeiro contacto',
       E'Olá {{contacto}}! 👋\n\nO meu nome é {{meu_nome}}, sou designer freelancer na Amadora (VNDesign). Estive a ver a {{empresa}} e tenho uma ideia para vos ajudar a ter {{beneficio|uma imagem mais forte}}.\n\nPosso enviar alguns exemplos do meu trabalho por aqui?'),
      (2, 'WhatsApp — follow-up',
       E'Olá {{contacto}}! Só a confirmar se viu a minha mensagem de {{data}} sobre {{servicos|a imagem da vossa marca}}.\n\nSe fizer sentido, envio alguns exemplos ou uma proposta rápida, sem compromisso 🙂\n\n{{meu_nome}}'),
      (3, 'WhatsApp — lembrete de reunião',
       E'Olá {{contacto}}! 👋\n\nSó para lembrar a nossa reunião de {{reuniao}}.\n{{reuniao_local}}\n\nAté já!\n{{meu_nome}}')
  ) as t(n, name, body)
  where not exists (
    select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name
  );
end
$$;
revoke execute on function public.seed_whatsapp_templates(uuid) from public, anon, authenticated;

select public.seed_whatsapp_templates(id) from public.workspaces;

-- Conta nova: o mesmo trigger que já semeia os modelos por categoria passa a
-- semear também os de WhatsApp.
create or replace function public.vnd_seed_category_templates_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select m.workspace_id into v_workspace_id
  from public.workspace_members m
  where m.user_id = new.id and m.role = 'owner'
  order by m.created_at desc
  limit 1;
  if v_workspace_id is not null then
    perform public.seed_category_templates(v_workspace_id);
    perform public.seed_whatsapp_templates(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_category_templates_for_new_user() from public, anon, authenticated;
