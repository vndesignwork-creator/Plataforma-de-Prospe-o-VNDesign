-- =============================================================================
-- Pontuação dos leads mais afinada
-- Muitos leads ficavam com a mesma pontuação (ex.: vários com 45) e a lista
-- "Leads mais quentes" quase não ordenava. Os critérios são os mesmos de
-- 20261028000100_prioridade_respostas_sequencia.sql, com degraus mais finos:
--   * PageSpeed em escala (20 pesa mais do que 45), em vez de "abaixo de 50";
--   * problemas identificados: cada um a mais conta um pouco (até +4);
--   * email e telefone, e pessoa de contacto com nome;
--   * setor: o 1.º, o 2.º e o 3.º mais prioritários já não valem o mesmo;
--   * valor estimado: acima de 1000 €, cada 1000 € a mais conta (até +5);
--   * interesse em vários serviços (até +6).
-- As razões antigas mantêm-se iguais (a plataforma e os filtros usam-nas).
-- =============================================================================

create or replace function public.vnd_lead_score(l public.leads)
returns table (score integer, reasons text[])
language plpgsql stable
set search_path = ''
as $$
declare
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_rank integer;
  v_web boolean;
  v_social boolean;
  v_problems integer;
  v_services integer := coalesce(cardinality(l.services), 0);
begin
  if l.status in ('cliente', 'sem_interesse', 'em_pausa') or l.archived_at is not null or l.anonymized_at is not null then
    return query select 0, '{}'::text[];
    return;
  end if;

  -- Fase do pipeline: quem já respondeu está mais perto de fechar.
  case l.status
    when 'reuniao' then v_score := v_score + 30; v_reasons := array_append(v_reasons, 'Reunião marcada');
    when 'respondeu' then v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Respondeu');
    when 'proposta_enviada' then v_score := v_score + 20; v_reasons := array_append(v_reasons, 'Proposta enviada');
    else null;
  end case;

  -- O site só conta se o lead precisa de web design (ou ainda não tem serviços).
  v_web := v_services = 0 or exists (
    select 1 from public.services s
     where s.workspace_id = l.workspace_id and s.key = any (l.services) and s.category = 'web'
  );
  if v_web then
    v_social := l.website ~* '(facebook|instagram|linktr\.ee|tiktok)\.';
    if nullif(btrim(coalesce(l.website, '')), '') is null then
      v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Sem site próprio');
    elsif v_social then
      v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Só tem redes sociais');
    else
      -- Em escala: PageSpeed 69 → +4 … PageSpeed 0 → +15 (antes: 15 abaixo de 50, 8 abaixo de 70).
      if l.pagespeed is not null and l.pagespeed < 70 then
        v_score := v_score + 4 + round((70 - l.pagespeed) * 11 / 70.0)::integer;
        v_reasons := array_append(v_reasons, case
          when l.pagespeed < 50 then format('Site lento (PageSpeed %s)', l.pagespeed)
          else format('Site pouco rápido (PageSpeed %s)', l.pagespeed) end);
      end if;
      if l.mobile = 'nao' then
        v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Site não funciona no telemóvel');
      elsif l.mobile = 'parcial' then
        v_score := v_score + 7; v_reasons := array_append(v_reasons, 'Site parcialmente adaptado ao telemóvel');
      end if;
    end if;
  end if;

  -- Problemas: um por linha (ou separados por ";"); cada um a mais conta um pouco.
  v_problems := (
    select count(*) from regexp_split_to_table(coalesce(l.problems, ''), E'[\\n;]+') p where btrim(p) <> ''
  );
  if v_problems > 0 then
    v_score := v_score + 5 + least(v_problems - 1, 4);
    v_reasons := array_append(v_reasons, case when v_problems > 1 then format('Problemas identificados (%s)', v_problems) else 'Problemas identificados' end);
  end if;

  if l.email is not null and l.phone is not null then
    v_score := v_score + 13; v_reasons := array_append(v_reasons, 'Tem email e telefone');
  elsif l.email is not null then
    v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Tem email');
  elsif l.phone is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem telefone');
  end if;
  if nullif(btrim(coalesce(l.contact_name, '')), '') is not null then
    v_score := v_score + 4; v_reasons := array_append(v_reasons, 'Pessoa de contacto');
  end if;

  if l.sector_id is not null then
    select s.priority_rank into v_rank from public.sectors s where s.id = l.sector_id;
    -- 1.º → 10, 2.º → 9, 3.º → 8; 4.º → 6, 5.º → 5, 6.º → 4.
    if v_rank between 1 and 3 then
      v_score := v_score + 11 - v_rank; v_reasons := array_append(v_reasons, 'Setor prioritário');
    elsif v_rank between 4 and 6 then
      v_score := v_score + 10 - v_rank; v_reasons := array_append(v_reasons, 'Setor com boas oportunidades');
    end if;
  end if;

  if l.estimated_value >= 1000 then
    v_score := v_score + 10 + least(floor((l.estimated_value - 1000) / 1000)::integer, 5);
    v_reasons := array_append(v_reasons, 'Valor estimado ≥ 1000 €');
  elsif l.estimated_value > 0 then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem valor estimado');
  end if;

  if v_services > 1 then
    v_score := v_score + least((v_services - 1) * 2, 6);
    v_reasons := array_append(v_reasons, format('Interesse em %s serviços', v_services));
  end if;

  if nullif(btrim(coalesce(l.approach_angle, '')), '') is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Ângulo de abordagem definido');
  end if;

  return query select least(v_score, 100), v_reasons;
end
$$;

-- Recalcular os leads que já existem (sem mexer em "atualizado em" nem na linha do tempo).
alter table public.leads disable trigger user;
update public.leads l set (score, score_reasons) = (select s.score, s.reasons from public.vnd_lead_score(l) s);
alter table public.leads enable trigger user;
