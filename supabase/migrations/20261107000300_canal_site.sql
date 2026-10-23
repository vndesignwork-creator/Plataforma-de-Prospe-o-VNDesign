-- Formulário do site: novo canal "site" (os leads que chegam pelo formulário do
-- site da VNDesign). Num ficheiro à parte: um valor novo de enum só pode ser
-- usado depois de a transação que o cria terminar.
alter type public.lead_channel add value if not exists 'site';
