-- Pedir indicação: funcionalidade retirada a pedido. Tira-se a coluna (e o
-- índice); o valor "referral_asked" do tipo de atividade fica, porque o
-- Postgres não deixa tirar valores de um enum e pode haver registos antigos.
drop index if exists public.leads_referred_by_idx;
alter table public.leads drop column if exists referred_by;
