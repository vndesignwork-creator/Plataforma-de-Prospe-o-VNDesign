-- =============================================================================
-- Modelos de mensagens WhatsApp (1/2): novos valores dos enums.
-- Ficam numa migração à parte porque um valor novo de um enum só pode ser
-- usado depois de a transação que o criou terminar.
-- =============================================================================
alter type public.template_kind add value if not exists 'whatsapp';
alter type public.lead_channel add value if not exists 'whatsapp' before 'pessoal';
