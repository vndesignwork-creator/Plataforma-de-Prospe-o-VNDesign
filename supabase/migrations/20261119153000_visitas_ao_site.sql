-- Leads que visitam o teu site: o plugin de WordPress avisa quando alguém que
-- clicou num email teu volta ao site (atividade "Visitou o teu site").
alter type public.activity_type add value if not exists 'site_visit';
