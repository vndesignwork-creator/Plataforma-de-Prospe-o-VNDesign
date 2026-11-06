-- =============================================================================
-- Scripts de contacto para Vídeo e Motion Design (Scripts → categoria de vídeo):
-- email de prospeção (2 ângulos), follow-up, DM, WhatsApp e guião de chamada.
-- Ficam na categoria com "vídeo" ou "motion" no nome (a mesma dos serviços da
-- migração anterior). Um nome que já exista não se repete; nada é substituído.
-- =============================================================================

create or replace function public.seed_video_motion_templates(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_order integer;
begin
  select key into v_category from public.service_categories
   where workspace_id = p_workspace_id
     and (label ~* 'v[íi]deo|motion' or key ~* 'video|motion')
   order by sort_order limit 1;
  if v_category is null then
    return;
  end if;

  select coalesce(max(sort_order), 0) into v_order from public.contact_templates where workspace_id = p_workspace_id;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, t.kind::public.template_kind, t.name, t.subject, t.body, v_category, false, v_order + t.n
  from (
    values
      (1, 'cold_email', 'Email de prospeção — Vídeo e Motion',
       'Um vídeo curto para a {{empresa}}?',
       E'Boa tarde,\n\nO meu nome é {{meu_nome}} (VNDesign). Faço {{servicos|vídeos e animações}} para negócios de {{setor|vários setores}}.\n\nEstive a ver a {{empresa}} nas redes e no site e acredito que um vídeo curto vos pode dar {{beneficio|mais alcance e mais pedidos de contacto}}: hoje é o formato que mais aparece no Instagram, no TikTok e no Google.\n\n{{angulo}}\n\nSe fizer sentido, envio 2 ou 3 exemplos de vídeos que fiz para negócios parecidos, sem compromisso.\n\nPortfólio: {{portfolio}}\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}'),
      (2, 'cold_email', 'Email de prospeção — Reels (redes sem vídeo)',
       'Reels para a {{empresa}}: uma ideia rápida',
       E'Olá {{contacto}},\n\nSou {{meu_nome}}, da VNDesign. Reparei que a {{empresa}} publica sobretudo fotografias. Os vídeos curtos (Reels e TikTok) costumam chegar a mais pessoas do que uma imagem — e não precisam de grandes produções.\n\nA partir do vosso próprio material (vídeos do telemóvel servem), faço a edição, as legendas e a música, prontos a publicar. Um pack de 4 Reels costuma bastar para perceberem a diferença.\n\nQuer que lhe mostre um exemplo feito para um negócio de {{setor|um setor parecido}}?\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}'),
      (3, 'follow_up', 'Follow-up — Vídeo e Motion',
       'Re: Um vídeo curto para a {{empresa}}?',
       E'Olá {{contacto}},\n\nSó a confirmar se recebeu o meu email de {{data}}. Separei 2 exemplos de {{servicos|vídeos}} para negócios de {{setor|vários setores}}; leva 1 minuto a ver.\n\nPosso enviar?\n\nCumprimentos,\n{{meu_nome}}\n\n{{opt_out}}'),
      (4, 'social_dm', 'DM Instagram / Facebook — Vídeo e Motion', null,
       E'Olá! Gosto muito do vosso perfil 🙌 Sou {{meu_nome}}, da VNDesign, e faço {{servicos|Reels, edição de vídeo e motion design}} para negócios de {{setor|vários setores}}. Com o material que já têm, dava para fazer vídeos curtos com legendas e música, prontos a publicar. Posso mostrar-vos um exemplo?'),
      (5, 'whatsapp', 'WhatsApp — Vídeo e Motion', null,
       E'Olá {{contacto}}! Sou {{meu_nome}}, da VNDesign. Faço {{servicos|vídeos curtos e animações}} para negócios como a {{empresa}}: {{beneficio|vídeos prontos a publicar nas redes, com legendas e música}}. Posso enviar-lhe 2 exemplos por aqui, sem compromisso?'),
      (6, 'call_script', 'Guião de chamada — Vídeo e Motion', null,
       E'ABERTURA\n"Bom dia, falo com o/a responsável pelas redes sociais / comunicação da {{empresa}}?"\n\nPROPOSTA\n"Chamo-me {{meu_nome}}, sou da VNDesign. Faço {{servicos|vídeos curtos, edição e animação}} para negócios de {{setor|vários setores}}. Os vídeos são o que mais aparece hoje nas redes e tive uma ideia para vos dar {{beneficio|mais alcance}}. Posso enviar 2 exemplos por email ou WhatsApp?"\n\nSE SIM\nRecolher o contacto e enviar os exemplos no mesmo dia.\n\nOBJEÇÃO: "NÃO TEMOS TEMPO PARA GRAVAR"\n"Não é preciso produção: vídeos do telemóvel servem, ou uso as vossas fotografias e o logótipo para uma animação. Eu trato da edição, das legendas e da música."\n\nOBJEÇÃO: "É CARO"\n"Há opções pequenas: um pack de 4 Reels ou só a animação do logótipo, para experimentarem. Depois decidem se faz sentido continuar."\n\nSE NÃO\n"Percebo. Posso deixar o meu contacto para quando quiserem experimentar vídeo?"')
  ) as t(n, kind, name, subject, body)
  where not exists (
    select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name
  );
end
$$;
revoke execute on function public.seed_video_motion_templates(uuid) from public, anon, authenticated;

select public.seed_video_motion_templates(id) from public.workspaces;

-- Conta nova: o mesmo trigger dos serviços de vídeo passa a juntar também os scripts.
create or replace function public.vnd_seed_video_motion_for_new_user()
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
    perform public.seed_video_motion_services(v_workspace_id);
    perform public.seed_video_motion_templates(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_video_motion_for_new_user() from public, anon, authenticated;
