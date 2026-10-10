-- =============================================================================
-- Tarefas por lead (lista com caixas, por ordem) e listas-modelo por serviço
--  - lead_tasks: tarefas de cada lead (ex.: passos do projeto depois de fechar
--    o negócio), com data opcional; concluir regista "Tarefa concluída" na
--    linha do tempo.
--  - task_templates: listas prontas (uma por serviço) que se aplicam a um lead.
--  - Tarefas com data entram em "Hoje", no resumo diário e nas notificações.
-- =============================================================================

alter type public.activity_type add value if not exists 'task_completed';
alter type public.activity_type add value if not exists 'tasks_added';

-- -----------------------------------------------------------------------------
-- Tarefas
-- -----------------------------------------------------------------------------
create table public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  due_on date,
  done_at timestamptz,
  -- Ordem na lista (valores menores ficam mais acima).
  position double precision not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_tasks_lead_idx on public.lead_tasks (lead_id, position);
-- "Hoje": tarefas por fazer com data.
create index lead_tasks_due_idx on public.lead_tasks (workspace_id, due_on) where done_at is null and due_on is not null;
create trigger lead_tasks_touch before update on public.lead_tasks
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_tasks enable row level security;
create policy lead_tasks_member_all on public.lead_tasks for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Concluir uma tarefa fica na linha do tempo do lead.
create or replace function public.vnd_lead_tasks_log_done()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.done_at is not null and old.done_at is null then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.lead_id, 'task_completed', jsonb_build_object('title', new.title),
            public.vnd_actor_user_id(), public.vnd_actor_token_id());
  end if;
  return new;
end
$$;
create trigger lead_tasks_log_done after update of done_at on public.lead_tasks
  for each row execute function public.vnd_lead_tasks_log_done();

-- Anonimizar um lead apaga as tarefas (podem ter nomes ou contactos).
create or replace function public.vnd_leads_anonymized_tasks()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.lead_tasks where lead_id = new.id;
  return new;
end
$$;
create trigger leads_anonymized_tasks after update of anonymized_at on public.leads
  for each row when (new.anonymized_at is not null and old.anonymized_at is null)
  execute function public.vnd_leads_anonymized_tasks();

-- -----------------------------------------------------------------------------
-- Listas-modelo
-- -----------------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  service text check (service in ('landing_page','site_institucional','blog','loja_online','identidade_visual','flyers_cartazes','posts_redes','estampas')),
  items text[] not null default '{}' check (cardinality(items) <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_templates_ws_idx on public.task_templates (workspace_id, sort_order);
create trigger task_templates_touch before update on public.task_templates
  for each row execute function public.vnd_touch_updated_at();
alter table public.task_templates enable row level security;
create policy task_templates_member_all on public.task_templates for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.seed_task_templates(p_workspace_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.task_templates where workspace_id = p_workspace_id) then
    return;
  end if;
  insert into public.task_templates (workspace_id, name, service, items, sort_order) values
    (p_workspace_id, 'Site Institucional', 'site_institucional', array[
      'Reunião de arranque (objetivos, páginas, referências)',
      'Receber logótipo, textos e fotografias',
      'Registar o domínio e configurar o alojamento',
      'Estrutura das páginas (mapa do site)',
      'Maquete da página inicial',
      'Aprovação da maquete pelo cliente',
      'Desenvolver as restantes páginas',
      'Formulário de contacto, WhatsApp e mapa',
      'SEO básico (títulos, descrições, Google Business)',
      'Revisão no telemóvel e PageSpeed',
      'Revisão final com o cliente',
      'Publicar o site e ligar o domínio',
      'Formação ao cliente e entrega dos acessos',
      'Enviar a fatura final'
    ], 1),
    (p_workspace_id, 'Landing Page', 'landing_page', array[
      'Briefing (objetivo, público, oferta)',
      'Receber logótipo, textos e fotografias',
      'Registar o domínio e configurar o alojamento',
      'Maquete da página',
      'Aprovação da maquete pelo cliente',
      'Desenvolver a página',
      'Botões de contacto (WhatsApp, telefone, formulário)',
      'Revisão no telemóvel e PageSpeed',
      'Publicar a página',
      'Enviar a fatura final'
    ], 2),
    (p_workspace_id, 'Blog', 'blog', array[
      'Definir as categorias e a estrutura',
      'Receber logótipo e textos',
      'Registar o domínio e configurar o alojamento',
      'Maquete do blog',
      'Aprovação da maquete pelo cliente',
      'Desenvolver o blog',
      'Publicar os primeiros artigos',
      'SEO e partilha nas redes sociais',
      'Revisão no telemóvel',
      'Publicar o blog',
      'Formação para publicar artigos',
      'Enviar a fatura final'
    ], 3),
    (p_workspace_id, 'Pequena Loja', 'loja_online', array[
      'Reunião de arranque (produtos, envios, pagamentos)',
      'Receber logótipo, fotografias e lista de produtos',
      'Registar o domínio e configurar o alojamento',
      'Maquete da loja',
      'Aprovação da maquete pelo cliente',
      'Configurar pagamentos (MB WAY, Multibanco, cartão)',
      'Configurar envios e portes',
      'Carregar os produtos',
      'Páginas legais (termos, privacidade, livro de reclamações)',
      'Fazer uma encomenda de teste',
      'Revisão no telemóvel',
      'Publicar a loja',
      'Formação ao cliente',
      'Enviar a fatura final'
    ], 4),
    (p_workspace_id, 'Identidade Visual', 'identidade_visual', array[
      'Briefing (valores, público, concorrência, cores)',
      'Pesquisa e moodboard',
      'Três propostas de logótipo',
      'Apresentar as propostas ao cliente',
      'Afinar a proposta escolhida',
      'Paleta de cores e tipografia',
      'Versões do logótipo (horizontal, vertical, ícone, uma cor)',
      'Mini manual de marca',
      'Entregar os ficheiros (PNG, SVG, PDF)',
      'Enviar a fatura final'
    ], 5),
    (p_workspace_id, 'Flyers e Cartazes', 'flyers_cartazes', array[
      'Briefing (formato, textos, datas)',
      'Receber logótipo, textos e imagens',
      'Primeira proposta',
      'Correções pedidas pelo cliente',
      'Aprovação final',
      'Preparar o ficheiro para impressão (sangria, CMYK)',
      'Versão para as redes sociais',
      'Enviar os ficheiros ao cliente ou à gráfica',
      'Enviar a fatura'
    ], 6),
    (p_workspace_id, 'Posts Redes Sociais', 'posts_redes', array[
      'Briefing (redes, tom, objetivos)',
      'Calendário de publicações do mês',
      'Modelos com a identidade da marca',
      'Criar os posts',
      'Aprovação do cliente',
      'Agendar as publicações',
      'Relatório do mês',
      'Enviar a fatura'
    ], 7),
    (p_workspace_id, 'Estampas T-shirts', 'estampas', array[
      'Briefing (quantidades, cores, tamanhos)',
      'Receber o logótipo ou a ideia',
      'Proposta de estampa',
      'Aprovação do cliente',
      'Preparar o ficheiro para estampagem',
      'Encomendar à estamparia',
      'Controlo de qualidade',
      'Entregar ao cliente',
      'Enviar a fatura'
    ], 8);
end
$$;
revoke execute on function public.seed_task_templates(uuid) from public, anon, authenticated;

create or replace function public.vnd_workspaces_seed_task_templates()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.seed_task_templates(new.id);
  return new;
end
$$;
create trigger workspaces_seed_task_templates after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_task_templates();

select public.seed_task_templates(id) from public.workspaces;

-- -----------------------------------------------------------------------------
-- Juntar leads: as tarefas dos duplicados passam para o lead principal
-- -----------------------------------------------------------------------------
create or replace function public.merge_leads(
  p_primary_id uuid,
  p_duplicate_ids uuid[],
  p_values jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_primary public.leads;
  v_numbers integer[];
  v_found integer;
  v_values jsonb;
  v_dup_services text[];
begin
  -- Sem duplicados = juntar dados de um registo novo (rascunho) ao lead existente.
  p_duplicate_ids := coalesce(p_duplicate_ids, '{}');
  if p_primary_id = any(p_duplicate_ids) then
    raise exception using errcode = '22023', message = 'O lead principal não pode estar na lista de duplicados.';
  end if;

  select * into v_primary from public.leads where id = p_primary_id for update;
  if not found or not public.vnd_can_write(v_primary.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Lead principal não encontrado.';
  end if;

  select count(*), array_agg(l.number order by l.number)
    into v_found, v_numbers
    from public.leads l
   where l.id = any(p_duplicate_ids) and l.workspace_id = v_primary.workspace_id;
  if v_found <> cardinality(p_duplicate_ids) then
    raise exception using errcode = 'P0002', message = 'Um ou mais leads a juntar não foram encontrados.';
  end if;

  -- Só campos editáveis podem ser escolhidos.
  v_values := coalesce(p_values, '{}'::jsonb) - array[
    'id', 'workspace_id', 'number', 'created_at', 'created_by', 'updated_at', 'status_changed_at',
    'anonymized_at', 'company_name_normalized', 'website_key', 'email_normalized', 'email_domain',
    'search_text', 'kanban_position'
  ];
  v_primary := jsonb_populate_record(v_primary, v_values);

  select array_agg(distinct s) into v_dup_services
    from public.leads l, unnest(l.services) s
   where l.id = any(p_duplicate_ids);

  -- Move tudo o que pertence aos duplicados antes de os apagar
  -- (propostas e análises de site eram apagadas em cascata).
  update public.lead_activities set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.proposals set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.site_audits set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_tasks set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  delete from public.leads where id = any(p_duplicate_ids);

  -- A junção já fica registada como "merged": sem um "Lead editado" repetido.
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads set
    company_name = v_primary.company_name,
    sector_id = v_primary.sector_id,
    website = v_primary.website,
    city = v_primary.city,
    address = v_primary.address,
    latitude = v_primary.latitude,
    longitude = v_primary.longitude,
    problems = v_primary.problems,
    pagespeed = v_primary.pagespeed,
    mobile = v_primary.mobile,
    email = v_primary.email,
    phone = v_primary.phone,
    contact_name = v_primary.contact_name,
    status = v_primary.status,
    channel = v_primary.channel,
    first_contact_on = v_primary.first_contact_on,
    last_follow_up_on = v_primary.last_follow_up_on,
    next_action_text = v_primary.next_action_text,
    next_action_on = v_primary.next_action_on,
    estimated_value = v_primary.estimated_value,
    notes = v_primary.notes,
    approach_angle = v_primary.approach_angle,
    source_url = v_primary.source_url,
    suggested_on = v_primary.suggested_on,
    email_subject = v_primary.email_subject,
    email_body = v_primary.email_body,
    -- Serviços: os escolhidos, mais os dos duplicados (nada se perde).
    services = (
      select coalesce(array_agg(distinct s order by s), '{}')
        from unnest(v_primary.services || coalesce(v_dup_services, '{}')) s
    )
  where id = p_primary_id;
  perform set_config('vnd.skip_update_log', '', true);

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (
    v_primary.workspace_id, p_primary_id, 'merged',
    jsonb_build_object(
      'merged_numbers', coalesce(to_jsonb(v_numbers), '[]'::jsonb),
      'fields', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(v_values) k), '[]'::jsonb)
    ),
    public.vnd_actor_user_id(),
    public.vnd_actor_token_id()
  );

  return p_primary_id;
end
$$;
