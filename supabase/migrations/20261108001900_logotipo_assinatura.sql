-- =============================================================================
-- Logótipo na assinatura
-- Cada pessoa pode juntar um logótipo à assinatura: vai embutido no email (por
-- baixo da assinatura) nos emails enviados pela plataforma aos leads.
-- =============================================================================

alter table public.signatures
  add column logo_path text check (logo_path is null or length(logo_path) <= 300),
  add column logo_width integer not null default 160 check (logo_width between 60 and 320);

-- Imagens privadas (lidas pelo servidor ao enviar; na plataforma, por links temporários).
-- PNG, JPEG ou GIF (os formatos que todos os programas de email mostram), até 1 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-logos', 'signature-logos', false, 1048576, array['image/png', 'image/jpeg', 'image/gif'])
on conflict (id) do nothing;
