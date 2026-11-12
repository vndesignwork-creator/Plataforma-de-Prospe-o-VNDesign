-- =============================================================================
-- "Falso alarme" na vigilância dos sites: o site foi dado como em baixo mas está
-- no ar (ex.: o alojamento bloqueia o servidor da plataforma). Até esta data, as
-- falhas deste site não o dão como em baixo (nem avisos nem oportunidades). O
-- certificado SSL e o domínio continuam a ser vigiados.
-- =============================================================================
alter table public.site_monitors add column if not exists down_muted_until timestamptz;
comment on column public.site_monitors.down_muted_until is 'Falso alarme: até esta data, falhas não contam como "em baixo".';
