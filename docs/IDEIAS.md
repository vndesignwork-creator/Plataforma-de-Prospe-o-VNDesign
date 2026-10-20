# Ideias para mais tarde

Ideias discutidas e guardadas para quando fizerem falta. Nada disto está implementado.

---

## Equipa: contas de administrador e colaboradores

**Estado:** guardada (outubro 2026) — a pensar no futuro, sem ninguém concreto para entrar.

### O que já existe

- Workspace com papéis `owner`, `admin` e `member` (`public.member_role`, tabela
  `workspace_members`); RLS por `is_workspace_member(workspace_id)`.
- Políticas para só o dono/administrador gerir membros (`is_workspace_admin`,
  `is_workspace_owner`, migração `20261014000100_correcoes_analise.sql`).
- Assinatura por pessoa (`signatures.user_id`): os scripts saem com o nome de quem envia.
- `lead_activities.actor_user_id` já guarda quem fez cada registo.
- `handle_new_user` cria sempre um workspace novo; o comentário prevê um convite com
  `raw_user_meta_data.workspace_id` para juntar a um workspace existente.

### Proposta

**Fase 1 — Equipa e papéis** (todos veem os mesmos leads)

- Definições → **Equipa**: lista, *Convidar* por email com papel, mudar papel, remover
  acesso (os leads e o histórico ficam).
- Papéis:

  | | Dono | Administrador | Colaborador |
  |---|---|---|---|
  | Leads, tarefas, scripts, propostas | ✅ | ✅ | ✅ |
  | Definições (serviços, pacotes, IA, API) | ✅ | ✅ | ❌ |
  | Exportar, apagar ou anonimizar leads | ✅ | ✅ | ❌ (proposta) |
  | Gerir a equipa | ✅ | ✅ (exceto o dono) | ❌ |

- Linha do tempo mostra quem fez cada coisa ("Chamada registada · Ana").

**Fase 2 — Distribuir trabalho**

- Campo **Responsável** no lead e na tarefa; filtro "Os meus leads".
- "Hoje" e lembretes vão para o responsável.
- Opcional: colaborador vê só os leads atribuídos.

### Cuidados

- **Emails de convite:** o SMTP de origem do Supabase é muito limitado (poucos emails por
  hora); é preciso configurar SMTP próprio (Hostinger, Brevo, Resend…) em Supabase → Auth.
- **RGPD:** colaboradores acedem a dados de contacto — remoção de acesso imediata e só
  dono/administradores exportam.
- Uma conta por pessoa, nunca contas partilhadas.

### Perguntas por responder

1. O colaborador vê todos os leads ou só os atribuídos?
2. Colaborador sem exportar nem apagar — confirmar.
