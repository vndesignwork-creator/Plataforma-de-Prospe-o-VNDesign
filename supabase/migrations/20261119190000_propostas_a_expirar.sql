-- Propostas a expirar: marca o dia em que já se avisou desta proposta, para o
-- aviso não se repetir todos os dias.
alter table public.proposals add column if not exists expiry_alert_on date;
