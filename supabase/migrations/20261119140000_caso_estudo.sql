-- Caso de estudo do projeto (escrito com IA a partir do que está na ficha):
-- fica guardado para se voltar a ver, copiar ou pôr em PDF.
alter table public.lead_projects
  add column if not exists case_study jsonb;
