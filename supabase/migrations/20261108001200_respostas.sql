-- Lista "Respostas" no Dashboard: "Já tratei" (ex.: respondeu pelo Gmail).
-- As respostas recebidas até esta data contam como tratadas (para toda a equipa).
alter table public.leads add column if not exists replies_handled_at timestamptz;
