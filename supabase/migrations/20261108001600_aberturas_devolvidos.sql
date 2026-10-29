-- Emails devolvidos: as "aberturas" e "cliques" registados nos emails enviados
-- antes da devolução não foram do lead (o email não chegou) — foram de quem o
-- enviou, ao ver a conversa nos Enviados do Gmail. Saem da ficha, da linha do
-- tempo, de "Abriram o email" e do sino. (Daqui para a frente a plataforma faz
-- isto sozinha quando deteta a devolução.)

with wrong as (
  select t.id, t.workspace_id, t.lead_id
    from public.email_tracking t
    join public.leads l on l.id = t.lead_id
   where l.email_bounced_at is not null
     and t.sent_at <= l.email_bounced_at
     and (t.opens > 0 or t.clicks > 0)
), reset as (
  update public.email_tracking t
     set opens = 0, first_opened_at = null, last_opened_at = null,
         clicks = 0, first_clicked_at = null, last_clicked_at = null, notified_at = null
    from wrong w
   where t.id = w.id
  returning t.id
)
delete from public.lead_activities a
 using wrong w
 where a.lead_id = w.lead_id
   and a.type in ('email_opened', 'email_clicked')
   and a.payload ->> 'tracking_id' = w.id::text;

delete from public.notifications n
 using public.leads l
 where n.lead_id = l.id
   and n.kind = 'email_open'
   and l.email_bounced_at is not null;
