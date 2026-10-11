-- =============================================================================
-- Linha do tempo: além das notas ("Outro registo"), o próprio utilizador pode
-- apagar as chamadas e os emails que registou (um engano acontece). O histórico
-- automático (estados, propostas, tarefas, importações…) continua a não se apagar.
-- =============================================================================
drop policy if exists lead_activities_delete_own_notes on public.lead_activities;
create policy lead_activities_delete_own_manual on public.lead_activities for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and type in ('note', 'call_logged', 'email_sent')
    and actor_user_id = (select auth.uid())
  );
