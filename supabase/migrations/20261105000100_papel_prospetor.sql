-- Papel "prospector" (equipa de prospeção): só a parte comercial da plataforma.
-- Fica numa migração à parte porque um valor novo de enum só se pode usar
-- depois de confirmado (ver 20261105000200_equipa_prospecao.sql).
alter type public.member_role add value if not exists 'prospector';
