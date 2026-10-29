-- Mais avisos no sino: além das tarefas atribuídas e das @menções, ficam lá os
-- alertas que até aqui só iam por push (lembretes, atrasados do dia, respostas e
-- emails devolvidos, emails abertos, pedidos pelo site, clientes, gerador de
-- leads e equipa). Cada aviso guarda o título e o link para onde leva.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'mention',
  'reminder', 'daily', 'reply', 'email_open', 'site_form', 'client', 'system'
));
alter table public.notifications add column if not exists title text check (title is null or length(title) between 1 and 200);
alter table public.notifications add column if not exists url text check (url is null or (length(url) between 1 and 500 and url like '/%'));
