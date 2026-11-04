-- Modelos A/B: uma segunda versão (assunto e texto) do mesmo modelo.
-- Com versão B, os leads recebem A ou B alternadamente (pelo número do lead) e o
-- envio fica registado com "(A)"/"(B)" no nome do modelo, para as estatísticas
-- por modelo compararem as duas.
alter table public.contact_templates
  add column if not exists subject_b text,
  add column if not exists body_b text check (body_b is null or length(body_b) <= 20000);
