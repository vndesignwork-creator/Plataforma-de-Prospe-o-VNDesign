-- Acessos dos clientes: idade da palavra-passe, onde está guardada fora da
-- plataforma e a entrega ao cliente no fim do trabalho.

alter type public.activity_type add value if not exists 'accesses_handed_over';

alter table public.lead_accesses
  -- Quando a palavra-passe foi escrita/trocada (o updated_at muda com qualquer edição).
  add column if not exists secret_changed_at timestamptz,
  -- "Está no gestor de palavras-passe, pasta X": apontador, em vez de a guardar aqui.
  add column if not exists vault_ref text,
  -- Entregue ao cliente (fim do trabalho).
  add column if not exists handed_over_at timestamptz;

alter table public.lead_accesses
  drop constraint if exists lead_accesses_vault_ref_check;
alter table public.lead_accesses
  add constraint lead_accesses_vault_ref_check check (vault_ref is null or length(vault_ref) <= 200);

-- Nos que já têm palavra-passe, conta-se a partir da última alteração conhecida.
update public.lead_accesses
  set secret_changed_at = updated_at
  where secret_ciphertext is not null and secret_changed_at is null;
