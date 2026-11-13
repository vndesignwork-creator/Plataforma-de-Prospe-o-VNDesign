-- Cópias de segurança guardadas na plataforma (as últimas 8 de cada workspace), para repor
-- sem ter de procurar o email: Definições → Repor a partir de uma cópia.
-- Bucket privado: só o servidor (chave de serviço) lê e escreve, por workspace (<workspace>/<data>.xlsx).
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 31457280)
on conflict (id) do nothing;
