# VNDesign Leads

Plataforma de prospeção de clientes da **VNDesign** (vndesign.pt). Substitui a folha
"Leads_Prospeccao_VNDesign": pipeline de leads, deteção de duplicados, linha do tempo,
dashboard, scripts de contacto e mais. Interface em português europeu (DD/MM/AAAA, €).

> **Estado:** Fases A, B e C concluídas — leads com deteção de duplicados, Kanban,
> dashboard, importação/exportação, scripts de contacto, assinatura e lembretes de
> follow-up. Ver [Plano por fases](#plano-por-fases).

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **Supabase** (Postgres + Auth), com Row Level Security em todas as tabelas
- **Zod** (validação partilhada web/API/app móvel) + React Hook Form + TanStack Query/Table
- API REST em `/api/v1`, documentada em OpenAPI (`/docs/api`)
- Testes: **Vitest** (lógica) e **Playwright** (fluxos principais)

## Estrutura

```
apps/web/            Next.js: interface + API /api/v1
  src/app/api/v1/    route handlers (auth → Zod → serviço → JSON)
  src/server/        contexto de autenticação, serviços, OpenAPI
  src/components/    interface (leads, definições, UI base)
packages/core/       schemas Zod, enums, normalização, formatação (reutilizável pela app Expo)
supabase/migrations/ migrações SQL versionadas (modelo de dados, RLS, funções, seeds)
scripts/             create-user.mjs
e2e/                 testes Playwright
docs/                arquitetura e decisões
```

Mais detalhe em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

---

## Instalação (Windows / PowerShell)

Requisitos: **Node.js 24** (ou 22+), **Git** e uma conta **Supabase**.
O Docker Desktop é opcional (só para correr o Supabase localmente).

```powershell
git clone https://github.com/vndesignwork-creator/Plataforma-de-Prospe-o-VNDesign.git
cd Plataforma-de-Prospe-o-VNDesign
npm install
Copy-Item .env.example apps/web/.env.local
```

### Opção A — Supabase na nuvem (sem Docker) · recomendado para começar

1. Em [supabase.com](https://supabase.com) cria um projeto (região **West EU (Ireland)** ou **Central EU (Frankfurt)**).
2. **Authentication → Sign In / Providers**:
   - deixa o provider **Email** ativo;
   - desativa **"Allow new users to sign up"** (só tu entras; o utilizador é criado pelo script).
3. **Authentication → URL Configuration**: *Site URL* `http://localhost:3000`
   (em produção, o teu domínio) e acrescenta `http://localhost:3000/auth/callback` aos *Redirect URLs*.
4. **Project Settings → API Keys**: copia o *Project URL*, a *Publishable key* e a *Secret key*
   para `apps/web/.env.local` (ver `.env.example`).
5. Aplica as migrações:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>   # o ref está no URL do projeto
   npx supabase db push
   ```

### Opção B — Supabase local (com Docker Desktop)

```powershell
npx supabase start          # aplica as migrações; mostra URL e chaves
npx supabase status -o env  # copia API_URL, PUBLISHABLE_KEY e SECRET_KEY para apps/web/.env.local
```

`npx supabase db reset` recria a base de dados local a partir das migrações.

### Criar o teu utilizador

O registo público está desativado. Cria o utilizador com:

```powershell
npm run create-user
# ou sem perguntas:
npm run create-user -- --email eu@vndesign.pt --password "uma-palavra-passe-forte" --name "Vá Nancassa" --phone "+351 9xx xxx xxx"
```

Ao ser criado, o utilizador recebe automaticamente o workspace **VNDesign** com os setores,
os modelos de contacto e as ferramentas da folha.

### Correr

```powershell
npm run dev        # http://localhost:3000
```

---

## Pesquisa rápida (Ctrl+K)

Em qualquer página, **Ctrl+K** (⌘K no Mac), o botão **Pesquisar…** na barra lateral ou a lupa 🔍 no telemóvel abrem uma caixa para escrever o nome de um **lead ou projeto**, uma **tarefa**, uma **página** (incluindo as secções das Definições, ex.: "Setores", e outras palavras como "palavra-passe" → Conta) ou um **estado, setor ou serviço** ("Respondeu", "Restauração", "Loja online" → a lista de leads já filtrada). Setas ↑↓ e **Enter** (ou tocar) para saltar: os clientes abrem no Projeto, as tarefas na lista de tarefas da ficha. API: `GET /api/v1/tasks?q=` (pelo menos 2 letras).

- **Recentes**: com a caixa vazia aparecem os últimos 8 leads que abriste (guardados neste browser) e as **Ações** gerais: *Novo lead*, *Limpar duplicados*.
- **Ações num lead**: num lead da lista, **→**, **Tab** ou o botão **Ações ›** mostra o que fazer sem abrir a ficha: *Nova tarefa…*, *Registar chamada…* e *Registar nota…* (escreves logo ali e carregas Enter), *Notas com IA*, *Marcar reunião*, *Começar Pomodoro* (clientes) ou *Abrir a ficha*. **Backspace** com a caixa vazia volta atrás.
- **Etiquetas**: escrever o nome de uma etiqueta abre a lista de leads filtrada por ela.
- **Notas e chamadas**: também procura no texto das notas e chamadas registadas (sem contar acentos), com um excerto; abre a linha do tempo do lead.
- No *Registar nota…* / *chamada…*, o 🎤 **Ditar** escreve o que dizes.

## Atalhos de teclado (computador)

Fora dos campos de texto: **N** novo lead, **/** pesquisar, **?** a lista de atalhos, e **G** seguido de outra tecla para ir a uma página: **G D** Dashboard, **G T** Tarefas, **G L** Leads, **G K** Kanban, **G P** Projetos, **G R** Prospeção, **G M** Mapa, **G E** Estatísticas, **G S** Scripts (só as páginas a que tens acesso). A lista também está no Ctrl+K → *Atalhos de teclado*.

## Ditar por voz

O botão 🎤 **Ditar** (Notas com IA, Registar na linha do tempo e nas ações da pesquisa rápida) usa o reconhecimento de voz do próprio browser, em português de Portugal: falas e o texto aparece. Sem custos nem IA. Funciona no Chrome, Edge e Safari (computador, Android e iPhone); no Firefox o botão não aparece. Da primeira vez, o browser pede para usar o microfone.

## Etiquetas

Marcas livres para agrupar leads (“feira de março”, “indicação do João”, “urgente”…), até 10 por lead e 30 letras cada.

- Na ficha, linha **Etiquetas**: escreve e carrega **Enter** (ou vírgula); as já usadas aparecem como sugestão. O **×** tira.
- Aparecem na lista, no Kanban e na pesquisa rápida; tocar numa leva à lista filtrada.
- Filtro **Etiqueta** na lista de leads e no Kanban (com o número de leads de cada uma); entra na exportação (coluna *Etiquetas*).
- **Várias de uma vez**: na lista, seleciona leads → **Etiqueta…** para pôr uma (das já usadas ou nova) ou tirar uma dos selecionados, com **Anular** no aviso.
- **Definições → Etiquetas**: quantos leads tem cada uma; **renomear** (muda em todos os leads; para um nome que já existe, as duas **juntam-se**, ex.: "feira março" e "Feira de março") e **apagar**.
- API: `GET /api/v1/leads/tags`, `PATCH /api/v1/leads/tags` (`{ from, to }`, `to: null` apaga) e `GET /api/v1/leads?tag=a,b`.

## Ações em massa na lista de leads

Seleciona leads com as caixas à esquerda: **Arquivar**/**Repor**, **Atribuir a…**, **Etiqueta…**, **Estado…** (as regras de cada estado aplicam-se, como na ficha: *Contactado* agenda o follow-up), **Follow-up…** (Hoje, Amanhã, Próxima semana, outra data ou sem follow-up) e **Apagar**. Arquivar, etiquetas e follow-up têm **Anular** no aviso (o follow-up volta à data que cada lead tinha).

## Limpar duplicados

**Leads → Importar/Exportar → Limpar duplicados…** (ou "duplicados" na pesquisa rápida) mostra os grupos de leads com o mesmo **email**, **site** ou **nome**:

- Em cada grupo fica escolhido o **principal** (o mais avançado no pipeline: cliente → proposta → … ; os arquivados por último). Podes escolher outro.
- **Juntar em #N** passa tudo dos outros para o principal: tarefas, pagamentos, reuniões, horas, despesas, entregas, revisões, contratos, propostas, etiquetas, aberturas de email e a linha do tempo; depois apaga-os. Os campos do principal ficam como estão.
- **Comparar** abre a junção campo a campo (para escolher o telefone, a morada… de cada um).
- **Não são duplicados** esconde o grupo de vez.
- **Juntar todos nos principais** faz o mesmo em todos os grupos de uma vez (pede confirmação; não dá para desfazer).
- Juntar leads (aqui ou no aviso de duplicado da ficha) **já não perde dados**: antes, pagamentos, reuniões, horas e o projeto do duplicado eram apagados com ele.

## Fins de semana

Os follow-ups que a plataforma marca sozinha ("Contactado", "Não atendeu", "Mais tarde", follow-up feito, sequências, "agora não" que volta) nunca caem ao sábado nem ao domingo — passam para segunda-feira. Quem trabalha ao fim de semana liga **Também trabalho ao fim de semana** em Definições → Follow-up e lembretes. As datas escolhidas à mão ficam como estão.

Os follow-ups do dia e os atrasados estão no cartão **Hoje** do Dashboard (com **Pôr em dia**) e fazem-se na **Prospeção**; reuniões, entregas, pagamentos e tarefas com prazo estão no **calendário dos Projetos** e no **calendário subscrito**. (A antiga página Agenda foi retirada: o endereço `/agenda` leva ao Dashboard.)

## Filtros guardados

Na lista de leads, o botão 🔖 **Guardados** → **Guardar estes filtros…** guarda os filtros e a pesquisa atuais com um nome (ex.: "Restaurantes em Lisboa sem site"). Volta a eles com um toque (o botão mostra o nome do que está ativo) ou no **Ctrl+K** (sem escrever aparecem em *Filtros guardados*). **Apagar “…”** no mesmo menu. Cada pessoa tem os seus (até 20).

## Leads sem próximo passo

Um lead **em conversa** (Contactado, Respondeu, Reunião, Proposta enviada) sem próxima ação marcada está a ser esquecido:

- no cartão **Hoje** aparece "**N leads em conversa sem próximo passo**" (toca para ver a lista) com **Marcar follow-up** (hoje, amanhã, próxima semana ou outra data, com **Anular**) — o mesmo menu do *Pôr em dia*;
- na lista, filtro **Próxima ação → Sem próximo passo (em conversa)** (API: `?due=none`).

## Notas

O cartão **Notas** da ficha edita-se no sítio (**Editar**; Ctrl+Enter guarda) e tem as **Notas com IA** (ver abaixo). A seta ⌃ recolhe-o: fica só o início das notas à vista (a escolha fica guardada neste dispositivo).

## Nota afixada

Uma frase sempre à vista no topo da ficha (ex.: "Só atende depois das 15h", "Falar com a Marta, não com o sócio"): ficha → **⋯ → Afixar uma nota…** (até 200 caracteres); **Editar** na própria nota para mudar ou **Tirar**. Aparece também na **Prospeção**, antes de ligar. Entra na exportação (coluna *Nota afixada*) e, ao juntar leads, passa para o principal.

## Resumo com IA (antes de ligar)

Na ficha, ao lado de Ligar/WhatsApp/Email, **Resumo IA**: a IA lê a ficha (notas, linha do tempo, tarefas, propostas, reuniões) e diz em poucas frases quem é, em que ponto está a conversa, **o que ficou combinado**, o **próximo passo** (com *Usar como próxima ação*) e um cuidado a ter (com *Afixar na ficha*). Não grava nada sozinho. Também em Ctrl+K → um lead → *Resumo com IA*. É o contrário das *Notas com IA* (essas escrevem na ficha); usam o mesmo fornecedor de IA.

## Ler cartão de visita

Em **Novo lead**, **📷 Ler cartão de visita**: no telemóvel abre a câmara. A IA lê a fotografia e preenche a empresa, o contacto, o email, o telefone, o site, a cidade e a morada (só os campos ainda vazios; o cargo vai para as notas). Revês e carregas em *Criar lead* — o aviso de duplicados funciona como sempre. A foto é reduzida antes de enviar e não fica guardada. Precisa de um fornecedor de IA que leia imagens (Claude, ou um modelo da OpenAI/OpenRouter com visão).

## Campos personalizados

**Definições → Campos personalizados → Novo campo**: texto, número, sim/não ou escolha (lista de opções), por exemplo "Nº de lojas", "Programa de faturação", "Tem Instagram?" (até 30).

- Na ficha aparecem no cartão **Pipeline**, a seguir às etiquetas; preenchem-se ali mesmo.
- Os de **escolha** e **sim/não** têm filtro na lista de leads (e entram nos filtros guardados).
- Entram na **exportação** (uma coluna por campo).
- Mudar o nome não perde os valores; apagar um campo tira-o de todos os leads. Ao juntar leads, os valores dos duplicados passam para o principal (os do principal ganham).
- API: `GET/POST /api/v1/custom-fields`, `PATCH/DELETE /api/v1/custom-fields/{id}`; nos leads, o campo `custom` (`{ chave: valor }`) e o filtro `?cf=chave:valor`.

## Estatísticas: comparar com o período anterior

No topo de **Estatísticas**, "**Este mês vs. o mês passado**" (ou **Semana**): leads novos, primeiros contactos, respostas, reuniões marcadas, propostas enviadas, clientes ganhos e recebido, comparados **até ao mesmo dia** (1–24 de outubro contra 1–24 de setembro), com ↑/↓ e a percentagem. Não são metas: mostra só se estás a melhorar. API: `GET /api/v1/stats/compare?period=month|week`.

## Emails: o que resulta e quando abrem

Em **Estatísticas**, dois cartões sobre os emails enviados pela plataforma (últimos 30, 90, 180 ou 365 dias):

- **Emails: o que resulta** — por modelo (ex.: "Email de prospeção", "Follow-up 1"): enviados, % abertos, % com clique e % respondidos. Uma resposta conta para o último email enviado a esse lead antes dela (até 30 dias). ★ marca o modelo com mais respostas (com pelo menos 5 envios).
- **Quando abrem os teus emails** — a primeira abertura de cada email, por dia da semana e hora (Lisboa, 7h–22h), e as melhores alturas ("terça entre as 9h e as 11h"), para saberes quando enviar ou ligar.

Só conta emails com rastreio (enviados pela plataforma). API: `GET /api/v1/stats/emails?days=90`.

## Pôr em dia os atrasados

No cartão **Hoje**, quando há follow-ups ou tarefas em atraso, aparece "**Em atraso:** 4 follow-ups e 2 tarefas" com **Pôr em dia**: passa todos para hoje, amanhã, a próxima semana ou outra data, de uma vez, com **Anular**. API: `POST /api/v1/reschedule` (`{ leads: [{ id, next_action_on }], tasks: [{ id, due_on }] }`, até 200 de cada).

## Anular

O aviso que aparece depois de uma ação traz **Anular** durante uns segundos em: arquivar (ficha e lista), etiquetas (pôr em vários, tirar na ficha), follow-up em massa, Pôr em dia, adiar um follow-up e concluir uma tarefa no cartão Hoje. Mudar o estado não tem Anular (as regras do estado já mudaram outras coisas, como o follow-up): muda-se outra vez.

## Notas de reunião com IA

Na ficha, cartão **Notas** → **Notas com IA** (ou *Notas com IA* nas ações da pesquisa rápida): cola ou escreve os apontamentos de uma chamada ou reunião, carrega em **Resumir** e revê:

- o **resumo** (fica na linha do tempo como nota “📝 Resumo da reunião/chamada”);
- as **tarefas** com prazo (até 6; desmarca as que não queres);
- o **próximo passo** com data (passa a ser a próxima ação do lead).

Tudo é editável antes de **Guardar**. Usa o fornecedor de IA escolhido para os emails (Definições → Inteligência artificial).

## Projetos a precisar de atenção e Ponto de situação

- **Dashboard → Projetos**: por cima da lista, “**N com a entrega atrasada**” e “**N com pagamentos em atraso**” levam aos **Projetos** já filtrados; os projetos com problemas aparecem primeiro.
- **Ponto de situação** (cartão **Projeto** na ficha do cliente): prepara um email ao cliente com o que foi **concluído** desde o último ponto de situação, as **entregas**, os **próximos passos** (com datas), a **próxima reunião**, o **próximo pagamento** e o link da página do cliente. Revês e envias pela plataforma; sem email do cliente (ou sem a conta de envio ligada) copia o texto para colares no WhatsApp ou no teu email.

## Motivo de “Sem interesse”

Ao passar um lead a **Sem interesse** (na ficha, no Kanban, em massa na lista ou com o botão *Sem interesse* da Prospeção) a plataforma pergunta **porquê**: *Preço*, *Já tem site / fornecedor*, *Agora não (talvez mais tarde)*, *Não responde* ou *Outro motivo* (ou **Sem motivo**). Depois muda-se na ficha (linha **Motivo** do cartão Pipeline); se o lead sair de *Sem interesse*, o motivo apaga-se sozinho.

- Fica na linha do tempo junto com a mudança de estado (“Contactado → Sem interesse · Motivo: Preço”).
- **Estatísticas → Porque perdes leads**: quantos leads em *Sem interesse* há por motivo.
- Na lista, com o estado *Sem interesse* escolhido, filtro **Motivo** (API: `?lost=preco,none`). Entra na exportação (coluna *Motivo (sem interesse)*).
- API: campo `lost_reason` nos leads (e nas ações em massa de estado); `GET /api/v1/stats/lost-reasons`.

## Tempo em cada fase

Os cartões do **Kanban** mostram há quantos dias o lead está na fase (⏳ “12 d”; a laranja com mais de 14 dias) e a ficha tem a linha **Nesta fase** (“há 12 dias”). Conta desde a última mudança de estado; não aparece em *Cliente* nem em *Sem interesse*.

Na lista, filtro **Na fase há → mais de 7 / 14 / 30 dias** (só leads em curso; API: `?stale=14`). É diferente de *Sem próximo passo* (que olha para a próxima ação): um lead pode ter follow-ups marcados e estar há semanas na mesma fase.

## Ficheiros do lead (antes de ser cliente)

Na ficha de um lead que ainda não é cliente, cartão **Ficheiros**: fotografias do espaço ou da montra, o menu em PDF, o cartão de visita… (até 30 ficheiros de 25 MB; também para os colaboradores de prospeção). São os ficheiros do **kit da marca**: quando o lead passa a cliente, já lá estão (cartão *Kit da marca → Logótipos e ficheiros*), sem copiar nada.

## O que mudou (e Repor)

Na linha do tempo, cada **Lead editado** mostra o valor de antes e o de depois (“Telefone: 912 345 678 → 934 567 890”). **Repor** volta a pôr o valor de antes — só aparece enquanto o campo ainda tem o valor dessa edição (não desfaz uma alteração mais recente) e a reposição fica também registada. Textos longos (notas, emails) mostram só “(texto longo)” e não se repõem por aqui; os campos personalizados também não. Ao anonimizar um lead, os valores antigos são apagados da linha do tempo.

## Boas-vindas ao novo cliente

No cartão **Projeto** de um cliente novo, **Boas-vindas** prepara o primeiro email: agradecimento, o link do **briefing** (se ainda não foi respondido), a **reunião de arranque**, os primeiros passos (tarefas abertas, com datas), a **entrega prevista**, o **plano de pagamentos** e o link da **página do projeto**. Revês e envias pela plataforma; sem email do cliente (ou sem a conta de envio ligada) copia o texto. Depois de enviado (ou copiado) o botão sai e fica o **Ponto de situação** para os emails seguintes.

## Seguinte / Anterior na ficha

Abre um lead a partir da lista (com os filtros e a ordem que quiseres): no topo da ficha aparece **‹ 3 de 25 ›**. As setas passam ao lead anterior ou seguinte dessa lista sem voltar atrás (no fim de uma página vai buscar a seguinte); no teclado, **J** (seguinte) e **K** (anterior). Tocar em "3 de 25" volta à lista com os mesmos filtros.

## Tarefas da equipa e avisos

- **Responsável:** ao editar uma tarefa (✏️) escolhe **Responsável** (só aparece com equipa). A tarefa mostra o nome e essa pessoa recebe um aviso.
- **Página Tarefas** (menu, ou **G + T**): as tarefas por fazer de todos os leads e projetos, por **Em atraso / Hoje / Próximos 7 dias / Mais tarde / Sem prazo**. Com equipa: **As minhas** (para o dono, também as sem responsável — como nos leads), **Sem responsável**, **Todas** ou **De uma pessoa…**; o botão com o nome de cada tarefa muda o responsável. O botão 📅 de cada tarefa dá-lhe um prazo daqui mesmo (Hoje, Amanhã, Próxima semana, Escolher data… ou Sem prazo, com **Anular**): útil para as que estão em *Sem prazo*, que não aparecem no Hoje nem no calendário. Marca a caixa para concluir (com **Anular**).
- **Avisos (🔔):** no topo da barra lateral (no telemóvel, ao lado da pesquisa). Mostra as tarefas que te deram e quando te mencionam; tocar abre o lead no sítio certo. Se tiveres as notificações ligadas no dispositivo, chega também uma notificação.
- API: `assigned_to` nas tarefas; `GET /api/v1/tasks?assigned=me|none|all|{id}`; `GET /api/v1/notifications`, `POST /api/v1/notifications/read`.

## Comentários da equipa (@menções)

Na linha do tempo → **Registar → Comentário para a equipa** (com equipa): conversa interna sobre o lead, separada das notas (o cliente nunca vê). Escreve **@** e escolhe a pessoa (setas + Enter); quem é mencionado recebe um aviso. O comentário fica destacado na linha do tempo e quem o escreveu pode apagá-lo. API: `POST /api/v1/leads/{id}/comments` (`{ body, mentions }`).

## Organizar os cartões da ficha

No fim da coluna lateral da ficha, **Organizar cartões**: muda a ordem (↑ ↓) de Tarefas, Pagamentos, Reuniões, Notas, Propostas, Linha do tempo… e esconde os que não usas (a Linha do tempo fica sempre). Vale para todos os leads e fica na tua conta (computador e telemóvel); **Repor original** volta ao de sempre.

## Prospeção: tentativas e "Não responde"

Na sessão de **Prospeção**, os botões **Não atendeu** e **Contactado** mostram quantas vezes já os usaste nesse lead (“2×”). À **3.ª vez seguida** sem atender, a plataforma pergunta se passa o lead a **Sem interesse** com o motivo *Não responde* (ou se só regista “Não atendeu”). O **Sem interesse** da Prospeção também pergunta o motivo. API: `attempts` em cada lead de `GET /api/v1/prospecting`.

## "Agora não" volta sozinho

Ao escolher o motivo **Agora não (talvez mais tarde)**, escolhe também **Voltar a tentar daqui a 1, 3 ou 6 meses** (ou *Não voltar*). Nesse dia, o lead volta sozinho: passa a *Contactado*, com a próxima ação para hoje (aparece na Prospeção e no Hoje), sai do arquivo se lá estiver e fica na linha do tempo “Voltou à prospeção: a … tinha dito “agora não””. Na ficha, a linha **Motivo** mostra “Volta à Prospeção a …” (com *Não voltar*) ou deixa marcar mais tarde. Os outros motivos continuam a ir para o arquivo automático. Corre no cron diário (`/api/v1/cron/daily-digest`). API: campo `retry_on` nos leads.

## Novo lead: ditar, escrever ou dos contactos

Em **Novo lead**, além de *Ler cartão de visita*:

- **Ditar ou escrever**: diz (🎤 Ditar) ou cola o que sabes — “Restaurante O Quintal em Braga, falei com a Ana, 912 345 678, querem site com reservas” — e a IA preenche a empresa, o contacto, o telefone, o email, a cidade e as notas (só os campos vazios). Revês antes de criar. API: `POST /api/v1/leads/from-text`.
- **Escolher dos contactos** (telemóvel Android com Chrome): puxa o nome, o telefone e o email de um contacto que já tens.

## Guardar contacto no telemóvel

Na ficha, botão **Guardar contacto** (ao lado de Ligar/WhatsApp/Email): descarrega o contacto (.vcf) com a pessoa, a empresa, o telefone, o email, o site e a morada. No telemóvel abre “Adicionar aos contactos” — o WhatsApp e as chamadas passam a mostrar o nome.

## Organizar o Dashboard

No fim do Dashboard, **Organizar cartões**: muda a ordem do Resumo, Leads mais quentes, Pipeline, Projetos e Clientes antigos e esconde os que não usas (o *Hoje* fica sempre). **Repor original** volta ao de sempre. É o mesmo que já existe na ficha.

## Clientes antigos

No Dashboard, cartão **Clientes antigos** (só aparece quando há): clientes com o último projeto concluído há mais de **3, 6 ou 12 meses** e nada em curso. Cada um tem **Email** (pronto: “Já passaram 9 meses desde que terminámos o projeto…”, com sugestões de manutenção, redes sociais, GEO…; revês antes de enviar ou copia) e **Já falei** (se foi por telefone). Depois de contactado sai da lista durante esse tempo. Quem já tem a tarefa *Propor um novo serviço* por fazer (a que se cria ao concluir um projeto) não aparece, para não haver dois lembretes. API: `GET /api/v1/projects/reconnect?months=6`.

## Avisos por email

Quem não tem as notificações push ligadas recebe, no email da conta, os avisos por ler (tarefas que lhe deram e @menções), uma vez por dia (cron diário); cada aviso vai uma vez. As notificações push ligam-se agora também em **Definições → Conta** (a equipa de prospeção só vê essa página).

## Pesquisa nos comentários

O **Ctrl+K** encontra também o texto dos **comentários da equipa** (aparecem em *Notas e chamadas*, como “Comentário da equipa”).

## Projetos: a minha ordem

Na lista de **Projetos**, cada bloco tem uma pega **⠿** à esquerda: arrasta-o (rato, dedo ou, no teclado, Espaço + setas + Espaço) para outra posição. A ordem fica guardada na tua conta e **Ordenar por** passa a **A minha ordem**; os projetos novos entram no fim (pelo prazo). Com um filtro ativo (ex.: *Atrasados*) só mudam de lugar os que se veem. Para voltar à ordem automática, escolhe *Prazo*, *Valor* ou *Fase* — a tua ordem fica guardada para quando voltares a *A minha ordem*.

## Importar a folha atual

1. No Google Sheets (“Leads_Prospeccao_VNDesign”): **Ficheiro → Transferir → Microsoft Excel (.xlsx)**.
2. Na plataforma: **Leads → Importar / Exportar → Folha CSV ou Excel…** → escolhe o ficheiro. A folha “🎯 Pipeline de Leads”, o cabeçalho
   (linha 2) e as colunas são detetados automaticamente; valores como “🔍 Identificado”,
   “✅ Sim”, “--”, “08/10/2026” ou “1.250,00 €” são convertidos.
3. Revê: linhas repetidas no ficheiro, leads que já existem (podes **juntar** — só preenche
   campos vazios — ou ignorar) e empresas na lista “não contactar” (bloqueadas).
4. Confirma. O “#” da folha é mantido quando está livre e fica um relatório em “Importações anteriores”.

Na lista de leads, **Exportar** gera um `.xlsx` ou um `.csv` (separador “;”, para o Excel em
português) com as mesmas colunas — pode ser reimportado sem mapear nada.

---

## Scripts de contacto e lembretes

- **Scripts** (menu): biblioteca de modelos com variáveis — `{{empresa}}`, `{{contacto}}`,
  `{{setor}}`, `{{cidade}}`, `{{problema}}`, `{{angulo}}`, `{{website}}`, `{{argumentos}}`,
  `{{data}}`, `{{hoje}}`, `{{meu_nome}}`, `{{meu_cargo}}`, `{{meu_telefone}}`, `{{meu_email}}`,
  `{{meu_site}}`, `{{portfolio}}`, `{{projetos}}`, `{{assinatura}}`, `{{opt_out}}`,
  `{{reuniao}}` (próxima reunião: “amanhã, às 10:00”), `{{reuniao_local}}` e `{{avaliacao}}` (link para avaliação no Google).
  `{{contacto|equipa}}` usa “equipa” quando o lead não tem contacto.
- **Por serviço:** `{{servicos}}` (ex.: “identidade visual e flyers”), `{{categoria}}`
  (ex.: “design gráfico”) e `{{beneficio}}` (a *frase de valor* do serviço, em
  **Definições → Serviços**). Cada modelo pode ter uma **categoria de serviço**: na ficha, o
  modelo sugerido é o da categoria dos serviços do lead, depois os de todas as categorias.
  Há modelos de origem para Web Design, Design Gráfico e genéricos (servem a qualquer
  categoria nova). Para Design Gráfico, `{{portfolio}}` usa o portfólio de design.
- **Ficha do lead → Scripts de contacto:** escolhe o modelo, edita, copia, abre no email,
  guarda como email de prospeção ou marca como enviado (passa a “Contactado” e agenda o follow-up).
- **WhatsApp com mensagens prontas:** na ficha, o botão **WhatsApp** abre um menu com os
  modelos do tipo *WhatsApp* (de origem: primeiro contacto, follow-up e lembrete de reunião)
  e abre a conversa — no telemóvel, na app WhatsApp ou WhatsApp Business — com a mensagem já
  escrita, para rever e enviar. Fica registado na linha do tempo; num lead “Identificado”, o
  aviso tem **Marcar como contactado** (canal WhatsApp). O lembrete só fica ativo com uma
  reunião marcada. Os textos editam-se em **Scripts**; no cartão *Scripts de contacto* há
  também **Abrir no WhatsApp** (com o texto editado). Desliga-se em **Definições →
  Funcionalidades** (o botão volta a abrir só a conversa). Só aparece para telemóveis
  (9xx xxx xxx ou com indicativo).
- **Follow-up:** na ficha e na lista “Hoje” — *Feito* (com ou sem nova data) ou *Adiar*.
  Os dias até ao follow-up configuram-se em **Definições → Follow-up e lembretes**.
- **Notificações push** (Fase D): Definições → *Ativar notificações neste dispositivo* — chegam
  todas as manhãs mesmo com a plataforma fechada (ver “App no telemóvel” abaixo).
- **Resumo diário por email** (opcional): precisa de SMTP e de um cron.

## Serviços: Web Design, Design Gráfico e outros

- **Definições → Serviços → Categorias:** criar categorias (ex.: Fotografia & Vídeo), mudar o nome, o
  ícone e a ordem, e escolher se o email com IA usa o portefólio de design; apagar só vazias. Começa com
  Web Design, Design Gráfico e Outros serviços.
- **Definições → Serviços:** acrescentar, mudar o nome, a categoria, o nome curto dos cartões e o
  ícone; mudar a ordem; **esconder** (os leads que já o têm ficam com ele) ou **apagar** (só sem leads). Começa com os 8 do site: Landing Pages, Sites
  Institucionais, Blogs, Pequenas Lojas · Identidade Visual, Flyers e Cartazes, Posts Rede Social, Estampas T-shirts.
- **Serviços de interesse** em cada lead (formulário e ficha), escolhidos da lista acima.
- **Filtro "Serviço"** na lista e no Kanban; ícones nos leads; gráfico **Por serviço** no dashboard.
- **Pacotes por categoria** (Definições → Propostas e IA): cada pacote é de Web Design, Design
  Gráfico ou Outros e pode estar ligado a um serviço. Vêm 5 pacotes de design gráfico de exemplo — **revê os preços**.
- **Proposta nova:** sugere um pacote por cada serviço de interesse do lead (ex.: site + logótipo).
- **Email com IA:** escolhe os serviços a propor (por omissão os do lead); para design gráfico usa o
  *Portfólio de design gráfico* da assinatura (variável `{{portfolio_design}}` nos modelos).
- **Importação/exportação:** coluna "Serviços" (ex.: `Logótipo; Posts redes sociais`).

## Tarefas (projetos dos clientes)

- **Cartão "Tarefas" na ficha** (coluna da direita; no telemóvel, botão *Tarefas* no topo):
  escreve e carrega Enter, prazo opcional no botão **Prazo** (Hoje, Amanhã, Próxima semana ou outra data), marca a caixa quando está feito (passa para
  *Concluídas*), arrasta pela pega ⠿ para mudar a ordem (com o teclado: Espaço + setas).
  Ao passar o rato numa tarefa: ✏️ editar, ⧉ **duplicar** (a cópia fica logo a seguir, com o mesmo
  texto e prazo, sem o lembrete; com **Anular**) e ✕ apagar.
- **Listas prontas por serviço** (Site Institucional, Landing Page, Identidade Visual, Flyers…):
  a ficha sugere as dos serviços do lead; *Usar lista* acrescenta-as sem repetir tarefas.
  Edita-as em **Definições → Listas de tarefas**.
- **Progresso** ("4/9") nos cartões do Kanban e na lista; passar um lead a *Cliente* mostra
  o atalho *Criar tarefas*.
- **Prazos:** as tarefas com data entram em **Hoje** (dashboard), no **resumo diário** por
  email e na **notificação** da manhã. Concluir uma tarefa fica na **linha do tempo**.

## Arquivar e apagar leads

- **Arquivar** (ficha → *Arquivar*, ou vários de uma vez na lista): o lead sai da lista, do
  Kanban, do mapa, de “Hoje” e do resumo diário, mas mantém histórico, propostas e estatísticas
  e continua a ser detetado como duplicado. *Repor* volta a pô-lo ativo.
- **Lista de leads:** seleciona leads com as caixas à esquerda para *Arquivar*, *Repor* ou
  *Apagar* em conjunto; o filtro *Sem os arquivados / Só os arquivados / Com os arquivados*
  mostra os arquivados.
- **Arquivo automático** (opcional): Definições → Follow-up e lembretes → leads em “Sem
  interesse” há mais de N dias são arquivados todas as manhãs (pelo mesmo cron do resumo diário).
- **Apagar** (ficha ou vários na lista) leva o lead para a **reciclagem**: **Leads → Importar/Exportar → Apagados (reciclagem)** (ou "apagados" no Ctrl+K). Fica lá **30 dias com tudo** (tarefas, pagamentos, reuniões, horas, propostas, contratos, kit da marca, linha do tempo…); **Repor** volta a pô-lo como estava (o mesmo #). O aviso depois de apagar também tem **Anular**. Depois de 30 dias sai de vez sozinho (no cron diário), com os ficheiros; **Apagar de vez** e **Esvaziar** fazem-no logo. Só o dono ou um administrador vê a reciclagem.
- **Pedidos RGPD**: *Anonimizar*, ou *Apagar* com "Acrescentar à lista não contactar" — estes apagam **de vez** (não vão para a reciclagem).

### Configurar o email (resumo diário)

Em `apps/web/.env.local` (ou nas variáveis da Hostinger/Vercel):

```
SMTP_HOST=smtp.hostinger.com     # email @vndesign.pt da Hostinger
SMTP_PORT=465
SMTP_USER=leads@vndesign.pt
SMTP_PASS=<palavra-passe da caixa de email>
SMTP_FROM=VNDesign Leads <leads@vndesign.pt>
APP_URL=https://leads.vndesign.pt
CRON_SECRET=<um texto aleatório longo>
```

Em desenvolvimento, o Supabase local inclui o **Mailpit**: usa `SMTP_HOST=127.0.0.1` e
`SMTP_PORT=54325` e vê os emails em http://127.0.0.1:54324. Testa em **Definições →
Enviar um resumo de teste agora**.

**Agendar o envio** (todas as manhãs) — chamar `GET /api/v1/cron/daily-digest` com
`Authorization: Bearer <CRON_SECRET>`:

- **Vercel:** já configurado em `apps/web/vercel.json` (06:45 UTC); define `CRON_SECRET` no projeto.
- **Hostinger** (hPanel → Avançado → Cron Jobs), comando:
  `curl -s -H "Authorization: Bearer <CRON_SECRET>" https://leads.vndesign.pt/api/v1/cron/daily-digest`
- **Coolify:** *Scheduled Tasks* com o mesmo `curl`.

O mesmo cron envia também as **notificações push** a todos os dispositivos ativados.

**Horário de silêncio** (Definições → Conta → Notificações, de cada pessoa): por exemplo das 21:00 às 08:00 e, se quiseres, o fim de semana inteiro. Nesse período não chegam notificações push (os avisos ficam no sino da plataforma); os **lembretes das tarefas** esperam e chegam quando o silêncio acaba (até 3 dias). O aviso da manhã não é enviado a quem estiver em silêncio à hora do cron. Os alertas das reuniões e do pomodoro continuam.

**Lembretes das tarefas** (sino 🔔 no cartão Tarefas: dia e hora) — outro cron, **de 5 em 5
minutos**, envia a notificação quando chega a hora (e lança as pesquisas automáticas do gerador de leads e lê as caixas de entrada para detetar respostas):

- **Hostinger** (hPanel → Avançado → Cron Jobs, "a cada 5 minutos"), comando:
  `curl -s -H "Authorization: Bearer <CRON_SECRET>" https://leads.vndesign.pt/api/v1/cron/reminders`
- Com a plataforma aberta, o lembrete aparece também como aviso no ecrã.

---

## Auditor de sites

Na ficha do lead, **Diagnóstico do site → Analisar site**. Verifica:

- HTTPS e certificado SSL (válido, emissor, data de expiração);
- adaptação a telemóvel (meta viewport e zoom bloqueado);
- título e meta descrição;
- plataforma (WordPress com versão, Wix, Shopify, Squarespace…) e ano do copyright no rodapé;
- PageSpeed mobile do Google (pontuação, LCP, CLS…).

Os problemas encontrados são escritos à moda da folha (“Sem HTTPS; Não é responsivo;
PageSpeed 34”) e podes **aplicá-los ao lead** (PageSpeed, Mobile? e Problemas — substituir
ou acrescentar). Fica um histórico das análises e uma entrada “Site analisado” na atividade.
Links de redes sociais/diretórios dão “Sem site próprio”.

**PageSpeed:** sem chave funciona com limites baixos. Para uso diário cria uma chave gratuita
(Google Cloud → *APIs e serviços* → ativar *PageSpeed Insights API* → *Credenciais → Criar
chave de API*) e define `PAGESPEED_API_KEY`. A análise demora 10–40 segundos.

**Segurança:** o servidor só abre endereços públicos em `http`/`https` (portas 80/443), nunca
`localhost` nem a rede interna, também depois de redirecionamentos.

**Imagens do site:** ao analisar, a plataforma guarda como o site aparece **no telemóvel e no
computador** (as imagens do próprio PageSpeed). Aparecem no cartão *Diagnóstico do site* (toca para
abrir em grande), entram no **relatório PDF** e podem ir em anexo no email (*Anexar as imagens do
site*). Em sites analisados antes, **Tirar imagens**. Ficam no Supabase Storage (bucket privado
`site-screenshots`). Desligam-se em Definições → Funcionalidades.

---

### GEO: preparado para as IAs

A análise do site também verifica o que ajuda o ChatGPT, o Claude, o Perplexity e o Google a
recomendar o negócio (bloco **Preparado para as IAs (GEO)**, "x de 6"):
- **robots.txt**: se bloqueia os robôs das IAs (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot…). Bloquear só o
  Google-Extended (treino do Gemini) não conta como problema.
- **Dados estruturados** do negócio (schema.org em JSON-LD ou microdata: LocalBusiness, Organization…).
- **Conteúdo**: pelo menos 300 palavras na página inicial.
- **Contactos visíveis**: telefone (`tel:` ou número português) ou morada (código postal ou `<address>`).
- **Perguntas frequentes** e **ligação ao Google Maps** (estes dois só aparecem no diagnóstico; não entram na coluna "Problemas").

### Kit GEO (ficha do lead)

O que se entrega ao cliente para o site aparecer nas IAs, tudo pronto a copiar (WordPress/Bricks: elemento "Código"):
- **Perfil do Google**: nota e número de avaliações do lead e dos concorrentes do último "Aparece nas IAs?", com uma frase de comparação para o cliente (também no relatório PDF). Com `GOOGLE_PLACES_API_KEY` usa a Google Places API (dados exatos; reconhece o perfil pelo site, telefone ou nome escrito de outra forma); sem ela, a IA com pesquisa (aproximado). A pesquisa da IA não vê o Google Maps: quando não encontra o perfil mostra "Não confirmado" (e não "Sem perfil"), não escreve a frase para o cliente e dá o link "Procurar no Maps" para confirmar.
- **Dados estruturados**: o código schema.org (JSON-LD) do negócio — tipo, morada, telefone, horário ("Seg–Sex 09:00–18:00"), redes, serviços — sugerido a partir da ficha e editável.
- **Perguntas frequentes**: a IA (fornecedor do "Email com IA") escreve 8 a 10 perguntas e respostas do setor, editáveis; sai o HTML (acordeão) e o JSON-LD FAQPage.
- **llms.txt**: resumo do negócio para as IAs, para pôr na raiz do site (descarregar ou copiar).

**Ficha de cliente**: num lead que já é **Cliente**, os cartões de prospeção (Diagnóstico, Aparece nas IAs?, Kit GEO, Scripts, Escrever com IA, Email de prospeção) começam recolhidos — fica à vista o Projeto, as Tarefas e os Pagamentos. Num lead por contactar começam abertos. O que abres ou recolhes fica lembrado à parte para fichas de clientes e de leads.

**Recolher cartões**: **Diagnóstico do site**, **Aparece nas IAs?**, **Kit GEO**, **Scripts de contacto**, **Escrever com IA**, **Email de prospeção** e **Linha do tempo** têm o botão ⌄ no canto para recolher/expandir. A escolha fica lembrada neste browser, para todos os leads; recolhido, o diagnóstico mostra o resumo (PageSpeed, telemóvel, problemas) e o "Aparece nas IAs?" o último resultado.

**GEO como serviço**: o catálogo tem o serviço **Otimização para IAs (GEO)** (Web Design), os pacotes *GEO — Preparar para as IAs* e *GEO — Acompanhamento mensal* (preços para ajustar em Definições → Propostas) e 4 scripts GEO (email, follow-up, mensagem curta e guião de chamada) com a variável **{{visibilidade_ia}}** (a frase do último "Aparece nas IAs?"). No diagnóstico, quando há pontos GEO a melhorar, o botão **Juntar o serviço ao lead** acrescenta-o.

### Aparece nas IAs? (GEO)

Na ficha do lead, o cartão **Aparece nas IAs?** faz a uma IA com pesquisa na internet 1 a 5 perguntas de um
cliente típico (sugeridas a partir do setor e da cidade, editáveis) **sem dizer qual é o lead**, e mostra:
- em quantas respostas o lead aparece e em que lugar;
- as empresas que aparecem no lugar dele;
- uma frase pronta para o cliente (botão copiar), que também entra no **relatório PDF** do diagnóstico.

Escolhe-se a IA em Definições → Inteligência artificial → Onde usar → **Aparece nas IAs? (GEO)** (Claude, OpenAI
ou OpenRouter; por omissão o Claude Sonnet com a chave do servidor). Corre em segundo plano (1 a 3 minutos) e
custa cerca de 5 a 20 cêntimos por teste. As respostas das IAs variam: é uma amostra do dia, não uma posição fixa.

## Email com IA

Na ficha do lead, **Escrever com IA**:

1. Escolhe o tipo de email (primeiro contacto, follow-up, depois de uma chamada, envio da proposta), o tom e o tamanho.
2. Opcionalmente, acrescenta indicações.
3. O Claude escreve o assunto e o texto em português de Portugal.

O texto usa os dados do lead, a última análise do site e os argumentos de venda do setor. A assinatura e a linha de opt-out (RGPD) são acrescentadas automaticamente. Revê sempre o texto antes de enviar. Depois podes copiá-lo, abri-lo no programa de email ou guardá-lo como email de prospeção.

**Configurar:**

- Cria uma chave em https://console.anthropic.com (*API Keys*). É preciso ter créditos na conta: cada email custa poucos cêntimos.
- No PC, na pasta do projeto, corre `npm run ai-key`. Cola a chave quando for pedida (não
  aparece no ecrã). O comando testa-a junto da Anthropic e só a grava no
  `apps/web/.env.local` se for aceite. `npm run ai-key -- --test` volta a testar a chave gravada.
- Na Hostinger, define `ANTHROPIC_API_KEY` nas variáveis de ambiente.
- O modelo por omissão é `claude-opus-5-5`; podes mudá-lo com `ANTHROPIC_MODEL`.
- O estado da configuração aparece em **Definições → Propostas e IA**.

---

## Enviar emails pela plataforma

Os botões **Enviar** (email de prospeção, scripts de contacto, Escrever com IA) e **Enviar por email (com o PDF)** na proposta enviam o email diretamente da plataforma, a partir da tua caixa de correio:

- Abre uma janela com Para, Assunto e Mensagem já preenchidos: revês e carregas em **Enviar**.
- O email sai com o teu nome; as respostas chegam à tua caixa normal.
- Fica registado na linha do tempo do lead ("Enviado pela plataforma") e o lead avança de estado. Um lead *Identificado* passa a *Contactado*, com o follow-up agendado. A proposta passa a *Enviada*.
- Empresas na lista **Não contactar** e leads anonimizados são recusados.
- Há um **limite diário** (por omissão 50 emails em 24 horas), para o teu email não ser marcado como spam.

**Ligar o Gmail** (Definições → **Email de envio**):

1. Liga a *Verificação em dois passos* em https://myaccount.google.com/security.
2. Abre https://myaccount.google.com/apppasswords, escreve "VNDesign Leads" e carrega em **Criar**.
3. Na plataforma escolhe **Gmail**, escreve o teu email e cola as 16 letras em *Palavra-passe de aplicação*.
4. Carrega em **Guardar** e depois em **Enviar email de teste**.

O Gmail guarda os emails enviados na pasta "Enviados". Com o email da Hostinger (ou outro SMTP) isso não acontece: liga a opção *cópia oculta* para receberes uma cópia de cada email. A palavra-passe fica cifrada no servidor, como as chaves de IA (ver `AI_KEYS_SECRET` no `.env.example`), e nunca volta a aparecer.

### Sequência de follow-ups por email

Depois de um email enviado pela plataforma, a próxima ação passa a ser o **follow-up seguinte**, já escrito:

- Por omissão: 1.º follow-up 3 dias depois, 2.º 7 dias depois, 3.º 14 dias depois (sempre contados a partir do email anterior).
- Muda os dias e o modelo de cada passo em **Definições → Follow-up e lembretes → Sequência de follow-ups por email**. "Automático" escolhe o modelo de follow-up mais adequado ao lead (categoria dos serviços e setor).
- No dia certo, o lead aparece em **Hoje** (Dashboard) com o botão de responder ↩, e a ficha mostra **Enviar follow-up** no cartão Pipeline.
- O botão abre o follow-up preenchido, com "Re:" do último email e na **mesma conversa**. Revês e carregas em **Enviar**.
- Depois do último passo, a próxima ação fica "Sem resposta aos follow-ups: ligar ou marcar Sem interesse".
- A sequência **para** quando o lead deixa de estar "Contactado": por exemplo, quando responde (deteção de respostas, abaixo) ou quando mudas o estado.

### Deteção de respostas

Com a opção **Detetar respostas na caixa de entrada** ligada (Definições → Email de envio, ligada por omissão):

- De 10 em 10 minutos (pelo cron dos lembretes), a plataforma lê na caixa de entrada o remetente e o assunto dos emails novos. O **texto** só é lido nos avisos de devolução e nas respostas dos leads (até 32 KB, sem guardar o texto); os outros emails nunca são abertos.
- Um email de um lead (resposta ao email enviado, o mesmo endereço, ou o mesmo domínio de empresa) fica na linha do tempo como **Resposta recebida**.
- Se o lead estava "Contactado", passa a **Respondeu**, com a próxima ação "Responder ao cliente" para hoje, e recebes uma notificação.
- **"Não temos interesse"** (ou "não precisamos", "já temos site"…) passa o lead a **Sem interesse** com o motivo *Respondeu que não tem interesse*. **"Removam-me"** (ou "não nos voltem a contactar", "unsubscribe") faz o mesmo e junta o email à lista **Não contactar**. Só conta o texto novo da resposta (não a mensagem citada). Se for engano, muda o estado na ficha.
- **Respostas automáticas** (férias, ausência) ficam registadas mas não mudam o estado; se disserem até quando a pessoa está fora ("estou fora até 10/11", "regresso a 3 de novembro", "back on November 10"), o follow-up passa para esse dia (dia útil, até 60 dias).
- **Emails devolvidos** ("Undelivered Mail…", "Mensagem não entregue"): o lead fica com o email riscado na ficha ("Email devolvido a …: procura outro email ou liga."), a linha do tempo mostra **Email devolvido**, a próxima ação passa para hoje ("procurar outro email ou contactar por telefone") e o **Procurar contacto** aparece. Na Prospeção (modo email), o lead sai da lista até ter outro email. Ao mudar o email, o aviso desaparece. API: campo `email_bounced_at` nos leads.
- Usa a mesma palavra-passe de aplicação do Gmail (IMAP: `imap.gmail.com:993`). Hostinger: `imap.hostinger.com:993`. Outro serviço: indica o servidor IMAP.
- **Verificar agora** lê logo a caixa. Se a leitura falhar (ex.: palavra-passe mudada), o erro aparece nessa secção.

### Lista Respostas (Dashboard)

O cartão **Respostas** do Dashboard junta o que os leads te responderam nos últimos 14 dias (detetado na caixa de entrada; ver acima):

- **Por responder**: as respostas a que ainda não respondeste. **Todas**: também as respondidas, as respostas automáticas ("Ausente até 10/11/2026"), "Sem interesse" e "Pediu para não contactar".
- **Responder** abre o email já com "Re: …" e na mesma conversa (o cliente vê-o como resposta); ao enviar, sai de *Por responder*.
- **Abrir no …** abre o teu email no browser: no Gmail, a própria conversa; na Hostinger, o Hostinger Mail; noutro serviço, o webmail conhecido pelo servidor (Outlook, SAPO, Zoho, Yahoo, iCloud). Para outro endereço, escreve-o em **Definições → Email → Endereço do webmail** (ex.: `https://webmail.empresa.pt/`).
- Com muitas respostas, **⌄** recolhe o cartão (fica só "3 por responder · 12 nos últimos 14 dias"); a escolha fica lembrada neste browser.
- **Já tratei** — respondeste noutro sítio (Gmail, telefone): deixa de estar por responder (para toda a equipa). Uma chamada registada ou um email enviado ao lead depois da resposta também conta como respondido.
- A equipa de prospeção vê só as respostas dos seus leads. O cartão pode mudar de lugar ou esconder-se em **Organizar cartões**.
- API: `GET /api/v1/replies?days=14` e `POST /api/v1/leads/{id}/replies/handled`.

### Verificar o email antes de enviar

Ao escrever o email de um lead (formulário do lead e janela **Enviar email**), a plataforma confirma se o domínio existe e recebe emails (registo MX), sem enviar nada. Se não, aparece "O domínio “…” não existe / não recebe emails: confirma o endereço." Gmail, Outlook, Sapo e afins não precisam de verificação. Se o servidor não conseguir confirmar (DNS em baixo), não mostra nada. API: `GET /api/v1/email-check?email=…` (`status`: `ok`, `no_mail`, `no_domain`, `invalid` ou `unknown`).

### Saber quando o lead abre o email

- Cada email enviado pela plataforma leva uma imagem invisível de 1×1 e os links passam pela plataforma (seguem logo para o endereço original).
- Quando o lead **abre o email** ou **carrega num link**, recebes uma notificação ("📬 Padaria Sol — Abriu o email. Bom momento para ligar!"), fica na linha do tempo e aparece em **Dashboard → Hoje → Abriram o teu email** (últimas 48 horas, com o botão para ligar). Uma nova abertura volta a avisar ao fim de 6 horas.
- Na linha do tempo, cada email enviado mostra "Aberto 3× · última vez a …" ou "Ainda não foi aberto".
- A cópia para ti (cópia oculta) vai num email separado, sem rastreio, para não contar como aberto.
- Limites: quem bloqueia imagens só conta quando carrega num link; o Apple Mail (proteção de privacidade) pode abrir as imagens sozinho; abrir o email na tua pasta *Enviados* pode contar como aberto.
- Desliga-se em Definições → Funcionalidades → *Saber quando o lead abre o email*.

---

## Formulário do site

Definições → **Formulário do site** → **Ligar** cria um endereço secreto (`/api/v1/public/forms/<código>`). Cada pedido de contacto do site:
- entra como lead (canal **Formulário do site**, estado Respondeu, próxima ação "Responder ao pedido do site" para hoje) — ou junta-se ao lead com o mesmo email;
- fica com a mensagem na linha do tempo, a tarefa **Responder ao pedido do site** e um aviso no telemóvel.

Como ligar: no Bricks, elemento Formulário → ações → **Webhook** (POST, JSON) para o endereço; ou o **HTML pronto a colar** (elemento "Código"). Aceita JSON, multipart e formulários HTML normais (`_next` = página para onde voltar), reconhece os nomes de campo habituais (nome, email, telefone, empresa, mensagem…) e, sem eles, adivinha pelo conteúdo. Proteções: campo escondido `_gotcha`, 5 pedidos por 10 minutos por endereço IP e é preciso email ou telefone. "Criar outro endereço" invalida o antigo.

## Sessão de prospeção

Menu **Prospeção**: os contactos do dia numa lista, sem saltar de lead. Em cima escolhes **Trabalho por: Email / Telefone** (fica na tua conta; por omissão, Email).

- **Email**: cada linha tem o botão **Enviar 1.º email** (lead novo: o email de prospeção da ficha ou, se não houver, o 1.º modelo de email já preenchido), **Enviar follow-up** (lead contactado: o follow-up seguinte da sequência, na mesma conversa) ou **Enviar email** (noutros estados). Revês sempre antes de enviar. Ao enviar, o lead passa a Contactado e o próximo follow-up fica marcado sozinho (sem fins de semana) — não é preciso registar nada; a linha passa para *Feito nesta sessão* ("Email enviado · próximo a 28/10/2026"). Uma chamada ou uma resposta por outra via regista-se no menu **Registar** (Contactado, Não atendeu, Interessado, Mais tarde, Sem interesse). Em cima: "Hoje: 12 emails enviados". O separador **Falta email** junta os leads sem email, com *Procurar email*.
- **Telefone**: Ligar, WhatsApp e os resultados com um toque, como abaixo.

- A lista começa por quem **abriu um email** nas últimas 48 horas, depois os **follow-ups** em atraso ou para hoje e, por fim, os leads **por contactar** (os mais quentes primeiro). Os separadores filtram cada grupo e mostram quantos leads há em cada um. **Falta email** (a trabalhar por email) e **Falta contacto** (por telefone) juntam os follow-ups e os por contactar sem forma de contactar — um email devolvido não conta; quem abriu o email fica sempre em *Abriram o email*. Cada pedido traz até 150 leads; com mais, aparece "A mostrar os primeiros 150 de N". API: `GET /api/v1/prospecting?filter=all|opened|follow_up|new|missing&mode=email|phone` (com `counts`).
- Cada linha: o motivo ("Abriu o email há 2 h"), a nota afixada, **Ligar**, **WhatsApp** (com as mensagens prontas), **Email** (o de prospeção) e os botões do resultado. **Nota** abre uma caixa para escrever (vai com o próximo resultado); **Ver mais** mostra o ângulo de abordagem, os problemas, as notas, o site e os scripts; **Ficha** abre o lead num separador novo.
- O resultado regista-se com um toque. O lead **não salta**: passa para **Feito nesta sessão**, com o resultado ("Não atendeu (2.ª vez) · volta a 26/10/2026") e os mesmos botões, para registar outra tentativa. O número nos botões **Não atendeu** e **Contactado** é quantas vezes já o fizeste nesse lead; à 3.ª vez seguida sem atender, pergunta se passa a Sem interesse (Não responde).
- Os resultados:
  - **Não atendeu** — volta a aparecer amanhã;
  - **Contactado** — passa a Contactado e agenda o follow-up (ou, se já estava contactado, conta como follow-up feito);
  - **Interessado** — passa a Respondeu, com "Marcar reunião ou enviar proposta" para hoje;
  - **Mais tarde** — amanhã, 3 dias, 1 semana, 2 semanas ou 1 mês;
  - **Sem interesse** (pergunta o motivo).
- Em cima: quantos contactos fizeste nesta sessão e hoje, e quantos faltam.
- **Procurar contacto** (botão nas linhas sem telefone ou email, sobretudo em *Falta contacto*; também na ficha, no cartão *Empresa e contacto*):
  - **Procurar automaticamente** lê o site do lead e a página de contactos (telefones em links e no texto, perto de "Telefone"/"Telemóvel"; o NIF não conta) e, com `GOOGLE_PLACES_API_KEY`, o Google Maps. Mostra o que encontrou para escolheres; nada é guardado sem carregares em **Guardar contactos**.
  - Atalhos **Google**, **Google Maps**, **Facebook** e **Instagram** já com o nome e a cidade (as páginas do Facebook/Instagram não se leem automaticamente).
  - Cola o telefone ou o email e **Guardar contactos**: aparecem logo **Ligar**, **WhatsApp** e **Email**.

**Sequência multicanal** (Definições → Follow-up e lembretes → *Sequência multicanal na Prospeção*, desligada por omissão)
- Um plano por lead, por exemplo **dia 0 WhatsApp, dia 3 email, dia 7 ligar, dia 14 email** (até 8 passos; canal WhatsApp, Email, Ligar ou Mensagem nas redes; modelo por passo ou o 1.º modelo desse canal).
- Na Prospeção, cada lead mostra **"Passo 2 de 4: Email (dia 3)"** com a mensagem já preenchida (abrir no WhatsApp, enviar o email, ligar ou copiar).
- **Contactado** faz o passo e agenda o seguinte para o dia certo (a linha do tempo regista "Contactado — Passo 1 de 4: WhatsApp"); **Interessado** ou **Sem interesse** tiram o lead da sequência; no fim, fica "tentar mais tarde ou marcar Sem interesse".

---

## Novo lead a partir de um link (partilhar do telemóvel)

- **Android** (com a app instalada no ecrã principal): no Google Maps, no Instagram ou no browser, carrega em **Partilhar → VNDesign Leads**. Abre o formulário de novo lead já preenchido; revê e carrega em **Criar lead** (o aviso de duplicados funciona como sempre).
- **iPhone ou computador**: menu da app (atalho *Lead a partir de um link*) ou `/partilhar` → cola o link → **Ler o link**.
- O que se aproveita: do **Google Maps**, o nome e a morada (e a cidade pelo código postal); do **Instagram/Facebook**, o nome do perfil; do **site**, o nome, o telefone e o email (lê a página com a mesma proteção da análise de sites).
- **Telefone e site a partir do Google Maps** (opcional): define `GOOGLE_PLACES_API_KEY` (Google Cloud → ativar *Places API (New)* → criar chave). Cada pesquisa é cobrada pela Google (tem uma quota gratuita mensal); sem a chave, preenche-se o telefone à mão.

---

## Prioridade dos leads

Cada lead tem uma pontuação de 0 a 100 (Quente ≥ 60 com uma chama, Morno ≥ 35 com um sol, Frio com um floco de neve), atualizada sozinha sempre que o lead muda.

- Somam pontos: o estado (Reunião, Respondeu, Proposta enviada), sem site próprio ou só redes sociais, site lento ou que não funciona no telemóvel (só se o lead precisar de web design), problemas identificados, ter email ou telefone, setor prioritário (Definições → Setores), valor estimado e ângulo de abordagem.
- Clientes, sem interesse, em pausa e arquivados ficam com 0.
- **Leads → ordenar por Prioridade** (coluna "Prioridade"; no telemóvel, "Ordenar → Prioridade (mais quentes)").
- **Dashboard → Leads mais quentes**: os 8 com mais pontos.
- Na ficha, toca no distintivo ao lado do setor para ver as razões.

---

## Projetos, pagamentos e reuniões

Cada funcionalidade liga-se e desliga-se em **Definições → Funcionalidades**. Desligada, sai do menu e da ficha, mas os dados ficam guardados.

**Relatório de diagnóstico (PDF)**
- Na ficha, cartão **Diagnóstico do site**: **Relatório PDF** abre o relatório e **Enviar relatório** envia-o ao cliente em anexo.
- Só aparece depois de analisar o site (Análise automática do site).
- O relatório tem a tua marca e mostra: velocidade no telemóvel, adaptação ao telemóvel, segurança (HTTPS), tempo de resposta, os 3 problemas principais com o porquê de importarem, o que propões (serviços do lead) e o próximo passo.
- Em qualquer email enviado pela plataforma, a caixa **Anexar o relatório de diagnóstico do site (PDF)** junta-o.

**Pagamentos**
- Na ficha (leads com proposta enviada ou clientes), cartão **Pagamentos**: **Criar plano** (50% sinal + 50% na entrega, 30/40/30 ou pagamento único) a partir do valor da proposta ou do valor estimado; ou **Acrescentar um pagamento à mão**.
- Marca a caixa quando receberes um pagamento: fica "Pagamento recebido" na linha do tempo.
- Dashboard → **Projetos**: projetos em curso, entregas próximas e o que está por receber ou em atraso.

**Projetos**
- Menu **Projetos**, com três vistas (a última escolhida fica lembrada neste browser):
  - **Lista**: os projetos em curso ordenados pelo prazo de entrega ("Faltam 5 dias", "Entrega hoje", "Atrasado 2 dias" a vermelho). Cada projeto tem, de cima para baixo:
    - o nome, a fase, o prazo e as ações (**WhatsApp**, **Reunião**, **Concluir projeto**);
    - o **resumo** em caixinhas: **Pagamentos** (recebido de total, em atraso, ou **Criar plano**), **Tarefas** (feitas de total), **Revisões** e **Horas** (com €/hora e **Ver registos**);
    - **todas as tarefas** (a mesma lista da ficha: marcar como feitas, arrastar pela pega ⠿ para mudar a ordem, editar, apagar e acrescentar; **Esconder tarefas** recolhe a lista) e, ao lado, o bloco **Tempo** com o Pomodoro e o ▶ cronómetro (no telemóvel fica por baixo das tarefas);
    - em baixo, a próxima reunião, despesas, entregas e **Detalhes do projeto**.
  - Por cima da lista: filtros **Atrasados**, **Pagamentos em atraso** e **Entregam esta semana** (com o número de projetos), **Ordenar por** prazo, valor ou fase (fica lembrado), e **Recolher todos / Abrir todos**. O ⌄ ao lado do nome recolhe cada projeto à linha do título, com um resumo curto (tarefas, pagamentos, horas).
  - "Concluídos" mostra os terminados.
  - **Fases**: colunas Briefing → Em produção → Revisões → Entrega. Arrasta o cartão (no telemóvel, mantém o dedo) ou usa o botão da fase.
  - **Calendário**: o mês com as entregas, reuniões, pagamentos previstos e tarefas (no telemóvel, a lista dos dias com alguma coisa).
- Na ficha de um cliente, cartão **Projeto** (na coluna larga, logo a seguir ao Pipeline): prazo de entrega, fase, o mesmo **resumo** em caixinhas (Pagamentos, Tarefas, Revisões, Horas) e as secções abaixo; à direita, o bloco **Tempo** com o Pomodoro e as horas (no telemóvel, no fim do cartão). Na coluna da direita, **Pagamentos** fica logo a seguir às Tarefas.
- **Rondas de revisão**: indicas quantas estão incluídas no preço (2 por omissão) e registas cada pedido do cliente. A partir da primeira além das incluídas, aparece o aviso e a revisão fica "A cobrar".
- **Registo de horas**: ▶ **Começar** → ⏸ **Pausar** → ▶ **Continuar** quantas vezes quiseres: o relógio mostra sempre o total do projeto (o já registado mais a sessão atual). Só há um temporizador a contar de cada vez; enquanto conta aparece no menu (também no telemóvel). **À mão** regista horas sem temporizador; sessões de menos de 5 segundos (começar e pausar logo) não ficam guardadas; **Pôr a zero** apaga todas as horas do projeto (com confirmação); cada registo pode ser corrigido (✎ horas, minutos, notas) ou apagado — na ficha ou em **ver registos** na lista de projetos. Mostra o total e quanto ganhas por hora (valor da proposta aceite; sem ela, o total dos pagamentos; por fim, o valor estimado).
- **Horas por tarefa**: o Pomodoro guarda a tarefa escolhida e o registo **À mão** (ou o ✎ de um registo) também deixa escolher a tarefa. Cada tarefa mostra o tempo gasto (⏱ 3 h 20 min) e as **Horas** mostram o **Tempo por tarefa** (barras, com "Sem tarefa" no fim).
- **Ficheiros e entregas**: links do Google Drive, Figma, Canva… com o estado *Por enviar → Enviada → Aprovada pelo cliente* (fica na linha do tempo).
- **Página para o cliente**: **Criar link** gera uma página só de leitura (sem login, endereço `/p/<código>`) com a fase, o progresso das tarefas, a entrega prevista, a próxima reunião, as entregas enviadas, os pagamentos (total, pago, em falta) e as revisões. Não mostra notas, horas nem valores internos. **Enviar por WhatsApp**, **Novo link** (o antigo deixa de abrir) ou **Desligar**.
- **Concluir projeto** abre os passos finais: criar a tarefa *Juntar o projeto ao portefólio* (daqui a 7 dias), lembrar de *propor um novo serviço* daqui a 3, 6 ou 12 meses (tarefas que aparecem em "Hoje" no dia) e, no fim, **pedir uma avaliação no Google** por WhatsApp ou email (modelos *pedido de avaliação* em Scripts, com `{{avaliacao}}`). O link de avaliação guarda-se em Definições → Funcionalidades → *Avaliações no Google*. **Reabrir projeto** volta a pô-lo em curso.
- **Resumo diário por email**: inclui as entregas de projeto atrasadas e dos próximos 7 dias e os pagamentos em atraso.
- Arranque automático, briefing, revisões, horas, despesas, entregas, página do cliente e aprovação pelo cliente desligam-se uma a uma em Definições → Funcionalidades.

**Arranque automático do projeto**
- Em **Definições → Serviços**, cada serviço tem o **Prazo de entrega (dias)** e as **Revisões incluídas** (já vêm preenchidos: landing page 14 dias, site 30, loja online 45, identidade visual 21…).
- Quando um lead passa a **Cliente**, o projeto prepara-se sozinho: prazo de entrega (hoje + o maior prazo dos serviços), revisões incluídas, tarefas das listas de cada serviço (se ainda não tiver tarefas) e plano de pagamentos sobre a proposta aceite ou o valor estimado (se ainda não tiver pagamentos). Fica "Projeto preparado" na linha do tempo.
- O plano de pagamentos escolhe-se em Definições → Funcionalidades → *Arranque automático do projeto* (50/50, 30/40/30, pagamento único ou nenhum).
- Para clientes antigos, o botão **⚡ Preparar** no cartão Projeto faz o mesmo (não mexe no que já existe).

**Briefing online**
- No cartão Projeto, **Pedir briefing** cria um link `/b/<código>` (sem login) para enviar por WhatsApp, email ou copiar.
- O cliente responde às perguntas e pode enviar até **10 ficheiros de 15 MB** (logótipo, fotografias, textos…). Pode voltar ao link e completar.
- Quando responde: recebes uma notificação, fica "Briefing recebido" na linha do tempo e a fase passa de *Briefing* a *Em produção*. **Ver respostas** mostra as respostas e os ficheiros; **Pedir de novo** reabre o formulário.
- As perguntas editam-se em Definições → Funcionalidades → *Briefing online*. Os ficheiros ficam no Supabase Storage (privados).

**Despesas e lucro**
- No cartão Projeto, secção **Despesas e lucro**: regista custos do projeto (tema, plugin, fotografias, subcontratação…) com valor e data.
- Mostra o valor do projeto, o **lucro** (valor − despesas) e o **ganho líquido por hora**. Na lista de projetos aparece "Despesas X € · lucro Y €".

**Aprovação pelo cliente**
- Na página do cliente (`/p/<código>`), cada entrega *Enviada* tem **Aprovar** e **Pedir alterações**.
- Aprovar marca a entrega como *Aprovada pelo cliente*. Pedir alterações (com comentário obrigatório) volta a pô-la *Por enviar* e regista uma ronda de revisão — marcada "A cobrar" se já passou das incluídas. Recebes uma notificação e fica na linha do tempo ("via cliente").

**Contratos**
- Na ficha, cartão **Contratos → Gerar contrato**: a partir da proposta aceite (ou de outra escolhida), com as partes, o objeto (serviços), o prazo, as revisões incluídas, o valor e o plano de pagamentos e as condições gerais.
- **Editar** permite mudar o título, as partes e o texto de cada cláusula antes de enviar. **PDF** descarrega-o.
- **Copiar link**, **Enviar por email** ou **WhatsApp** enviam o link `/c/<código>`: o cliente lê o contrato, descarrega o PDF e aceita com o nome completo e a caixa "Li o contrato e aceito as condições". Ficam guardados o nome, a data, a hora e o IP; recebes uma notificação e fica "Contrato aceite" na linha do tempo. Depois de aceite, o contrato já não pode ser alterado.
- O contrato também aparece na página do cliente do projeto.
- Em Definições → Funcionalidades → *Contratos* indicas o teu NIF e as condições gerais (uma por linha) usadas nos contratos novos.

**Checklist de lançamento do site**
- No cartão Projeto (serviços de Web Design), **Checklist de lançamento → Ver lista**: indica o endereço do site novo e carrega em **Verificar o site**.
- Verifica sozinho: HTTPS e certificado, passagem de http para https, adaptação ao telemóvel, título e descrição, favicon, imagem para partilhas, página 404, sitemap, se o Google pode indexar (robots.txt e "noindex"), estatísticas (Google Analytics, Tag Manager, Plausible…), política de privacidade/cookies e o PageSpeed no telemóvel (70 ou mais). O que falhar aparece a vermelho com o motivo.
- Marcas à mão: formulário testado, botões e links testados, textos revistos, Search Console com o sitemap, Perfil da Empresa no Google, cópias de segurança e acessos entregues ao cliente.

**Colaboradores**
- No cartão Projeto, **Colaboradores → Convidar**: nome e email de um programador, fotógrafo ou copywriter. O convite vai por email (pela tua conta de *Email de envio*) ou copias o link (`/convite/<código>`).
- O colaborador cria a conta (nome e palavra-passe) no link e entra num portal só dele (`/colaborador`) com os projetos para que foi convidado. Em cada um vê **as tarefas** (marca como feitas e acrescenta), **os ficheiros e entregas** (junta links, que ficam "Por enviar" — és tu que envias ao cliente), **o briefing** do cliente (respostas e ficheiros) e **as horas dele** (temporizador e registo à mão).
- Nunca vê os leads, os contactos do cliente, as notas, os valores nem os pagamentos, e não entra no resto da plataforma.
- Recebes uma notificação quando aceita o convite, conclui uma tarefa ou junta uma entrega. As horas dele aparecem em *Horas* com o nome.
- **Remover** tira-lhe logo o acesso ao projeto.
- Menu **Equipa → Projetos**: todas as pessoas convidadas (ativas ou com o convite por aceitar), as horas de cada uma (total e últimos 30 dias, por projeto) e a última atividade. Daqui convidas alguém novo ou a mesma pessoa para **outro projeto**, copias o link de um convite por aceitar ou removes de um projeto. O separador desaparece se desligares Projetos ou Colaboradores.

**Pomodoro**
- No cartão de cada projeto (em **Projetos** e na ficha), bloco **Pomodoro** com um mostrador circular: as marcas que já passaram apagam-se e o ponteiro (laranja a trabalhar, verde na pausa) mostra onde vai a fase. Escolhe a tarefa (opcional) e carrega em **Começar 25 min**.
- Ritmo: 25 min de trabalho, 5 de pausa e, a cada 4 pomodoros, uma pausa de 15. Botões: **Pausar** / **Continuar**, **Reiniciar** (a contar ou em pausa: a fase volta ao início; o trabalho já feito fica registado), **Pausa de 5 min** (descanso já, mesmo a meio do trabalho), **Saltar pausa**, **Começar o próximo** e **Parar**.
- O trabalho conta no **registo de horas** do projeto (com a nota "Pomodoro · tarefa") e no €/hora; as pausas não. Pausar o temporizador ▶ pausa o pomodoro; começar o ▶ à parte termina o pomodoro.
- Enquanto decorre, aparece no menu (a fase e o tempo que falta, também no telemóvel).
- No fim de cada fase, com a app aberta: **som de aviso** (um só toque; 6 à escolha em Definições: Sino, Taça tibetana, Madeira, Digital, Gota, Marimba — toca ao escolher), vibração, notificação e mensagem. O browser só deixa tocar som depois de um clique na app (basta um clique qualquer). Em Definições há **Testar som**. Com a app fechada, o pomodoro continua no servidor e o cron dos lembretes (de 5 em 5 minutos) avança a fase, fecha as horas e envia a notificação push.
- **Começar a pausa automaticamente** (ligado por omissão): desligado, quando o trabalho acaba a pausa fica à espera ("Pausa por começar") até carregares em **Começar pausa** (ou **Saltar pausa**).
- **Modo foco** (botão "Foco" no bloco): o mostrador em ecrã inteiro, só com a fase, o tempo e a tarefa; o ecrã fica ligado (não se apaga) enquanto estiver aberto; se o telemóvel bloquear, o modo foco continua aberto (botão "Ecrã inteiro" para voltar ao ecrã inteiro); Esc para sair.
- Os tempos, o som e a pausa automática mudam-se em Definições → Funcionalidades → *Pomodoro*. Em **Estatísticas → Pomodoro**: hoje, últimos 7 dias, por dia e por projeto.

**Vários projetos por cliente**
- Quando um cliente volta (ex.: site em 2025, loja online em 2026), na ficha dele, cartão **Projetos deste cliente → Novo projeto**: nome do projeto, serviços e valor.
- Cria um registo próprio para o projeto novo, com os contactos do cliente, e prepara-o logo (prazo, tarefas e plano de pagamentos). Tarefas, pagamentos, horas, contrato, briefing e entregas ficam separados por projeto.
- O cartão mostra todos os projetos do cliente (fase ou "Concluído") e o nome do projeto aparece na lista de leads, no Kanban e em Projetos ("Padaria Sol · Loja online").
- No Dashboard, o cliente conta uma vez (o valor dos projetos novos soma-se ao ganho); em Estatísticas → Rentabilidade, o ganho por cliente junta todos os projetos dele.

**Kit da marca do cliente**
- Na ficha de um cliente, cartão **Kit da marca** (é o mesmo em todos os projetos dele):
  - **Editar**: cores (com o código, copia-se com um toque), tipos de letra e links (Drive, Figma, Canva…) e notas;
  - **Juntar ficheiros**: logótipos e outros ficheiros (até 30, de 25 MB cada), privados no Supabase Storage;
  - **Acessos**: domínio, alojamento, redes sociais… com o endereço, o utilizador e a palavra-passe. A palavra-passe fica **cifrada** no servidor e só aparece quando carregas em 👁 (ou copias).
- Marca **Partilhar com os colaboradores** num acesso para o colaborador o ver no portal dele. O kit (cores, tipos de letra, links e ficheiros) aparece sempre aos colaboradores dos projetos do cliente; os acessos não partilhados nunca.

**Calculadora de orçamento**
- Na ficha, cartão **Propostas → Calcular**: escolhe os pacotes (começa com os dos serviços do lead) e os extras (páginas, idiomas, textos, urgência +20%, manutenção mensal…) e o desconto.
- Mostra o total, o valor mensal, as **horas previstas** (média dos teus projetos de cada serviço com horas registadas + as horas de cada extra; ou escreves as horas) e **quanto ganhas por hora**. Abaixo do teu objetivo, diz quanto deverias cobrar.
- **Guardar como valor estimado** passa o total para o lead; **Criar proposta** cria a proposta com estes itens e abre-a para rever.
- Os extras (nome, preço, € ou %, unidade, horas, mensal) e o objetivo por hora editam-se em Definições → Funcionalidades → *Calculadora de orçamento*.

**Rentabilidade (Estatísticas)**
- Em **Estatísticas → Rentabilidade**: ganho médio por hora (e depois das despesas), horas registadas, duração média e horas por projeto concluído, ganho por hora por serviço e por cliente, e gráficos das horas e do recebido nos últimos 12 meses.

**Calendário no telemóvel (subscrição)**
- Em Definições → Funcionalidades → *Calendário no telemóvel*, **Criar link** gera um endereço privado com as reuniões, as entregas dos projetos, os pagamentos previstos, as tarefas e os follow-ups (do último mês até 6 meses à frente). Atualiza-se sozinho.
- **iPhone / Mac:** carrega em **Abrir no iPhone / Mac** e confirma "Subscrever".
- **Google Calendar:** no computador, calendar.google.com → ⚙ → *Adicionar calendário* → *A partir do URL* → cola o link. O Google atualiza-o de algumas em algumas horas.
- Quem tiver o link vê estes dados: **Novo link** troca-o (o antigo deixa de funcionar) e **Desligar** apaga-o.

**Reuniões**
- Na ficha, cartão **Reuniões → Marcar reunião**: dia e hora, duração, local ou link (Google Meet, Zoom, morada) e notas.
- O lead passa a **Reunião**, com a próxima ação nesse dia.
- Com **Enviar o convite ao cliente**, o cliente recebe um email com o convite de calendário (.ics): no Gmail, no Outlook e no iPhone aparece "Adicionar ao calendário".
- Recebes uma notificação **1 hora antes** (pelo cron dos lembretes). A reunião aparece em **Hoje** no Dashboard.
- O botão ⬇ junta a reunião ao teu calendário.
- **Desmarcar** pode avisar o cliente: recebe o cancelamento e a reunião sai do calendário dele.

**Cópia de segurança semanal**
- Todas as semanas (segunda-feira por omissão, de manhã, pelo cron do resumo diário) recebes por email um Excel com todos os leads, também os arquivados.
- É o mesmo ficheiro da exportação: pode ser reimportado em Leads → Importar / Exportar.
- O email sai da tua conta de *Email de envio* ou, sem ela, do SMTP do servidor.
- Em Definições → Funcionalidades escolhes o destinatário e o dia, desligas, ou carregas em **Enviar uma cópia agora**.

---

## Perfil (nome e foto)

**Definições → Conta → Perfil** (também pelo bloco da conta no fundo do menu, com a tua foto e o teu nome — leva a esta página):
- **Foto**: *Escolher foto* (JPEG, PNG ou WebP); o browser recorta o quadrado do centro e reduz para 256 px antes de enviar. Fica privada (servida por links temporários) e aparece em círculo no menu. *Tirar foto* volta às iniciais.
- **Nome a mostrar**: um nome curto ou alcunha, no menu, na equipa e no "Responsável" dos leads. Vazio = o nome da Assinatura, que continua a ser o dos emails.

## Segurança da conta

**Verificação em dois passos** (Definições → Conta)
- **Ligar a verificação** mostra um código QR: lê-o com uma app de autenticação (Google Authenticator, Microsoft Authenticator, 1Password) e escreve o código de 6 dígitos.
- A partir daí, depois da palavra-passe, o login pede o código da app. Sem o código, nem a plataforma nem a API respondem.
- **Perdeste o telemóvel?** No Supabase → *Authentication → Users* → o teu utilizador → apaga o fator (MFA). Depois entras só com a palavra-passe e voltas a ligar.
- No Supabase alojado, a verificação por app (TOTP) vem ligada por omissão (*Authentication → Multi-Factor*).

**Sessões abertas** (Definições → Conta)
- Lista os aparelhos com a conta aberta (browser e sistema, IP, última atividade, se entrou com o código).
- **Terminar** fecha uma sessão; **Terminar as outras** fecha todas menos esta. O aparelho deixa de entrar em, no máximo, 1 hora.

## Equipa de prospeção

Pessoas que te ajudam a procurar, gerar, organizar e contactar leads, cada uma com a sua conta.

**Página Equipa** (menu) — dois separadores:
- **Prospeção**: quem tem conta na tua plataforma (prospetores e administradores).
- **Projetos**: os colaboradores externos, cada um só no(s) projeto(s) para onde foi convidado (aparece com *Projetos* e *Colaboradores* ligados em Definições → Funcionalidades).
- Um só botão **Convidar**, que pergunta primeiro *Para quê?*: **Ajudar com leads** (papel **Prospetor**, só a parte comercial, ou **Administrador**, vê tudo como tu) ou **Trabalhar num projeto** (escolhe-se o projeto).
- Os endereços antigos (`/colaboradores` e Definições → Equipa) levam à página nova.
- O convite segue pela tua conta de *Email de envio*; sem ela (ou com a caixa desligada), o link `/equipa/<código>` é copiado para o enviares tu. A pessoa cria a conta (ou entra com a que já tem) e fica na tua equipa.
- Na mesma página: mudar o papel, remover (perde logo o acesso; os leads dela ficam sem responsável) e anular convites.

**O que o prospetor vê**
- Dashboard dele (contactos de hoje, respostas, leads em aberto, gerador), Leads, Prospeção, Gerar leads, Kanban, Mapa, Scripts e Estatísticas → Equipa (só os números dele). Nas Definições, só a Assinatura e a Conta.
- Não vê valores, propostas, pagamentos, contratos, projetos, horas, colaboradores, kit da marca nem as estatísticas financeiras; não importa, não exporta, não apaga leads nem muda o responsável. O bloqueio está no servidor (`apiRoute` responde 403 fora da lista em `server/prospector-access.ts` e tira o `estimated_value` das respostas) e na base de dados (as tabelas sensíveis só abrem a `is_workspace_staff`).
- Os emails saem pela tua conta de envio, com a assinatura dele (Definições → Assinatura). O limite diário de envios conta para a equipa toda.

**Responsável**
- Cada lead tem um **Responsável**: escolhe-se na ficha (cartão Pipeline) ou em conjunto na lista de leads (seleciona → **Atribuir a…**). A lista tem o filtro *Responsável* (os meus, sem responsável, cada pessoa).
- Os leads que o prospetor cria ficam dele. A **Prospeção** dele mostra só os leads de que é responsável.

**Gerador de leads**
- A pesquisa com IA é paga pela tua conta: cada prospetor junta no máximo **50 leads por semana** (últimos 7 dias). Muda-se em Equipa → Prospeção (0 = sem gerador). As pesquisas automáticas são só tuas.

**Equipa → Atividade** ("quem fez o quê"): os registos de cada pessoa nos leads (contactos, estados, emails, notas), com filtro por pessoa e período. Na linha do tempo de cada lead aparece quem fez cada coisa, com filtro por pessoa.

**Estatísticas → Equipa** — por pessoa, nos últimos 30 dias: contactos (e hoje), responderam, reuniões, clientes, leads criados, leads em aberto e o gerador da semana. Aparece quando a equipa tem mais de uma pessoa.

---

## Fornecedores de IA (Claude, ChatGPT, OpenRouter…)

- **Definições → Inteligência artificial → Juntar chave:** Anthropic (Claude), OpenAI (ChatGPT),
  OpenRouter ou *Outro (compatível com OpenAI)* — Groq, Mistral, DeepSeek… (indica o endereço da API).
  A chave fica **cifrada** (AES-256-GCM) e a API só mostra os últimos 4 carateres. *Testar* confirma
  a chave e lista os modelos.
- **Onde usar:** escolhe o fornecedor e o modelo do **email com IA** e do **gerador de leads**.
  O gerador precisa de pesquisa na internet: Claude, OpenAI ou OpenRouter (o “Outro” não serve).
- A `ANTHROPIC_API_KEY` do servidor continua a funcionar e aparece como *Claude (chave do servidor)*.
- Só o dono ou um administrador junta, altera ou apaga chaves. Apagar uma chave em uso faz as
  funções voltarem à chave do servidor.
- O custo estimado só aparece com o Claude; com os outros vê-se no painel do fornecedor.
- Cifra: `AI_KEYS_SECRET` (opcional; por omissão deriva da `SUPABASE_SECRET_KEY`). Se mudar, as
  chaves guardadas deixam de abrir e é preciso colá-las outra vez.

## Gerador de leads (Claude com pesquisa na internet)

- Menu **Gerar leads**: descreve que empresas procuras (ex.: “restaurantes sem site ou com site
  antigo”), a zona, o setor e os serviços a propor. O Claude (Sonnet 5.5) pesquisa na internet e
  abre as páginas das empresas durante 1 a 3 minutos, em segundo plano — podes sair da página.
  Também funciona com OpenAI ou OpenRouter (ver “Fornecedores de IA”).
- A lista mostra, por empresa, a oportunidade observada, o site ou a rede social, contactos
  públicos da empresa e a **fonte** de cada dado. Duplicados e empresas da lista “não contactar”
  ficam assinalados e não se escolhem.
- **Adicionar como leads:** só as escolhidas; ficam “Identificado”, com a fonte, o ângulo de
  abordagem e os serviços sugeridos. Com *Analisar os sites*, cada site é analisado e o PageSpeed,
  o Mobile? e os Problemas ficam preenchidos.
- **Custo:** créditos da Anthropic — tokens do Sonnet 5.5 + 10 $ por 1000 pesquisas na internet;
  no máximo 12 pesquisas e 15 páginas por pesquisa. O custo estimado aparece em cada pesquisa.
- **Pesquisa na internet** na conta da Anthropic: vem ligada por omissão. Se alguém a desligou,
  liga-a em platform.claude.com/settings/capabilities (*web search* e *web fetch*); sem ela, a
  pesquisa termina com um aviso.
- Uma pesquisa de cada vez; uma pesquisa interrompida (ex.: deploy a meio) fica como “falhou” e
  pode repetir-se. API: `POST /api/v1/lead-generation`, `GET /api/v1/lead-generation/{id}`,
  `POST /api/v1/lead-generation/{id}/add`.

### Pesquisas automáticas (todas as semanas)

- Em **Gerar leads**, preenche a pesquisa e carrega em **Repetir todas as semanas** (ou, no cartão
  **Pesquisas automáticas**, em **Nova**). Escolhe o dia e a hora (de Portugal continental).
- **Interruptor** em cada pesquisa: liga ou desliga sem a apagar. No menu **⋯** há *Correr agora*,
  *Editar* e *Apagar*.
- **Quando terminar:** fica a lista para rever (recomendado) ou as empresas novas entram logo como
  leads (duplicados, empresas parecidas com leads que já tens e a lista “não contactar” ficam sempre
  de fora). As empresas encontradas nas semanas anteriores não voltam a aparecer.
- No fim recebes uma **notificação** (se ativaste as notificações) e um **email** com o resumo —
  enviado pela tua conta de *Email de envio* ou, sem ela, pelo SMTP do servidor.
- **Precisa do cron dos lembretes** (de 5 em 5 minutos, ver “Lembretes das tarefas”); sem ele, só
  correm uma vez por dia com o cron do resumo diário. O cartão avisa se o agendador não estiver a correr.
- Custo: o de uma pesquisa normal, uma vez por semana por cada pesquisa ligada (máximo 10 pesquisas).
- API: `GET/POST /api/v1/lead-generation/schedules`, `PATCH/DELETE /api/v1/lead-generation/schedules/{id}`,
  `POST /api/v1/lead-generation/schedules/{id}/run`.

## Propostas em PDF

Na ficha do lead, **Propostas → Nova proposta**. Começa com o pacote recomendado; acrescenta
outros pacotes (Essencial, Profissional, Premium, Manutenção mensal) ou itens à medida, ajusta
preços, quantidades e desconto. O texto inicial pode ser sugerido a partir da análise do site.

- **Ver PDF / Descarregar:** A4 com a identidade VNDesign (cabeçalho escuro, laranja, Syne e
  Plus Jakarta Sans), itens, total, mensalidade, validade, pagamento e próximos passos.
- **Enviar por email** abre o email já escrito (anexa o PDF descarregado).
- **Marcar como enviada** passa o lead para “Proposta enviada” e regista a atividade.
- Os pacotes, a validade (30 dias), as condições de pagamento, a nota de IVA e os próximos
  passos editam-se em **Definições → Propostas e IA**. Os preços iniciais são só exemplos.
- As propostas são numeradas por ano: `2026-001`, `2026-002`…

---

## Mapa

**Mapa** (Leads → botão *Mapa*, ou *Ver no mapa* na ficha): os leads com coordenadas, coloridos pelo estado, com filtros por estado e setor.

- **Localizar N leads** procura as moradas no OpenStreetMap (gratuito; 1 pesquisa por segundo,
  por isso 25 leads demoram cerca de meio minuto). Tenta a morada, depois o nome + cidade e,
  em último caso, só a cidade (posição aproximada, com círculo tracejado).
- Na ficha do lead: **Localizar**, **Ver no mapa** ou **Marcar no mapa** (clica no mapa para
  corrigir a posição).

---

## API de integração (tarefa semanal com o Claude)

1. **Definições → Acesso externo (API) → Criar token** (permissão `leads:import`). Copia o token
   `vnd_…` — só é mostrado uma vez.
2. A tarefa envia os leads para `POST /api/v1/leads/import` com
   `Authorization: Bearer vnd_…`. Guia completo, exemplos em curl/PowerShell e o texto para
   colar nas instruções da tarefa: **[docs/INTEGRACAO.md](docs/INTEGRACAO.md)**.
3. Os leads entram com as mesmas regras da importação: duplicados ignorados (ou juntados),
   lista “não contactar” respeitada, e aparecem no histórico de importações e na atividade
   (“via API”).

Podes revogar um token a qualquer momento; deixa de funcionar de imediato.

---

## App no telemóvel (PWA)

- **Instalar:** abre a plataforma no Chrome do telemóvel → menu ⋮ → **Adicionar ao ecrã
  principal** (ou o botão *Instalar a app* em Definições). Abre em ecrã inteiro, com ícone próprio.
- **Notificações push:** Definições → *Follow-up e lembretes* → **Ativar notificações neste
  dispositivo** → *Enviar notificação de teste*. Ao tocar na notificação abre o lead (ou o dashboard).
- Precisam das chaves VAPID no servidor (uma vez):

  ```powershell
  npx web-push generate-vapid-keys
  ```

  e define `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT=mailto:geral@vndesign.pt`.
  Sem elas, as Definições oferecem o aviso “ao abrir a plataforma”.
- Sem rede, aparece a página “Sem ligação” (os dados não ficam guardados no telemóvel).
- No iPhone, as notificações só funcionam com a app instalada no ecrã principal (iOS 16.4+).

---

## Testes

```powershell
npm test               # Vitest: normalização, duplicados, datas/€, schemas, erros da API
npm run lint
npm run typecheck
```

**Paridade TypeScript ↔ SQL** (garante que a deteção de duplicados dá o mesmo resultado
no browser e na base de dados) — corre com o Supabase ligado:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"; $env:SUPABASE_KEY="<publishable key>"; npm test -w @vndesign/core
```

**E2E (Playwright)** — precisa do Supabase e de um utilizador de teste:

```powershell
npm run create-user -- --email teste@vndesign.pt --password teste12345 --name Teste
# em apps/web/.env.local: E2E_EMAIL=teste@vndesign.pt e E2E_PASSWORD=teste12345
npx playwright install chromium
npm run test:e2e       # arranca o "npm run dev" automaticamente
```

Se já tiveres o `npm run dev` a correr, acrescenta ao `apps/web/.env.local`
`AUDIT_ALLOW_PRIVATE=1`, `AUDIT_SKIP_PAGESPEED=1` (o teste do auditor analisa um site local),
`ANTHROPIC_API_KEY=sk-ant-teste`, `AI_BASE_URL=http://127.0.0.1:4621` e
`GEOCODER_URL=http://127.0.0.1:4620/search` (os testes da Fase E usam serviços falsos, sem custos).

O GitHub Actions (`.github/workflows/ci.yml`) corre lint, tipos, testes, build e — com um
Supabase local — as migrações, a paridade SQL e os testes E2E.

---

## API

- Documentação interativa: **`/docs/api`** · especificação: **`/api/v1/openapi.json`**
- Autenticação:
  - **Web:** sessão (cookies);
  - **App móvel:** `Authorization: Bearer <access token do Supabase>`;
  - **Integrações:** tokens pessoais `vnd_…` (Definições → Acesso externo (API)), com permissões
    `leads:import` (`POST /leads/import`), `leads:read` (`GET /leads`, `/leads/{id}`, `/sectors`,
    `/meta`, `POST /leads/check-duplicates`) e `leads:write` (`POST /leads`, `PATCH /leads/{id}`).
- Erros em `application/problem+json`, com mensagens em pt-PT. Respostas em `{ "data": … }`.

Exemplo em PowerShell, com um access token:

```powershell
$h = @{ Authorization = "Bearer $token" }
Invoke-RestMethod "http://localhost:3000/api/v1/leads?status=contactado&due=overdue" -Headers $h
```

---

## Deploy

### Vercel

1. *Add New → Project* → importa o repositório.
2. **Root Directory:** `apps/web` (o Vercel deteta o Next.js e o monorepo npm).
3. **Environment Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
4. No Supabase (*Authentication → URL Configuration*):
   - *Site URL* = `https://<o-teu-domínio>`;
   - acrescenta `https://<o-teu-domínio>/auth/callback` aos *Redirect URLs*.
5. Migrações: corre `npx supabase db push` (ou automatiza no CI) antes de cada deploy que as altere.

### Hostinger (plano Business ou Cloud — Node.js Apps)

O projeto tem um build "standalone" pensado para isto (`npm run build:standalone`).
A base de dados fica no **Supabase na nuvem** (ver Opção A acima).

**Assistente:** `npm run publicar` verifica o projeto Supabase na nuvem (chaves, migrações,
registo público desligado), cria o teu utilizador se faltar e escreve as variáveis da
Hostinger em `.env.hostinger.local` (só no teu computador). Depois de publicar,
`npm run publicar -- --verificar` confirma o site no ar (login, API, HTTPS, PWA e cron).

1. hPanel → **Websites → Adicionar website → Node.js Apps** → ligar o **GitHub** e escolher
   este repositório e o ramo a publicar.
2. **Definições de build** (se a Hostinger detetar `apps/web` como pasta, muda para a raiz):

   | Campo | Valor |
   |---|---|
   | Framework | Other (ou Express/Node, se não houver "Other") |
   | Root directory | `/` (raiz do repositório — **não** `apps/web`) |
   | Node.js | 24.x (ou 22.x) |
   | Build script | `build:standalone` |
   | Output directory | `apps/web/.next/standalone` |
   | Entry file | `apps/web/.next/standalone/apps/web/server.js` |

3. **Variáveis de ambiente:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` e `HOSTNAME=0.0.0.0` (mais, se usares: `SMTP_*`, `APP_URL`,
   `CRON_SECRET`, `PAGESPEED_API_KEY`, `VAPID_*`, `ANTHROPIC_API_KEY` — ver `.env.example`). A Hostinger injeta-as no build e na execução;
   cada alteração precisa de um novo deploy.
4. Associa o domínio (ex.: `leads.vndesign.pt`) e confirma que o SSL está ativo.
5. No Supabase (*Authentication → URL Configuration*): *Site URL* = `https://leads.vndesign.pt`
   e acrescenta `https://leads.vndesign.pt/auth/callback` aos *Redirect URLs*.

O root directory tem de ser a raiz porque a web usa o pacote interno `packages/core`;
com `apps/web` sozinho a instalação falha.

### Coolify (Docker)

O `Dockerfile` na raiz gera uma imagem Node "standalone".

1. *New Resource → Application* → repositório Git → **Build Pack: Dockerfile**.
2. **Build Variables:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   São embutidas no build, por isso têm de estar disponíveis *no build* e não só em runtime.
3. **Environment Variables (runtime):** as mesmas duas, mais `SUPABASE_SECRET_KEY`.
4. **Porta:** 3000. Configura o domínio e o HTTPS no Coolify.
5. Atualiza os URLs de autenticação no Supabase, como no Vercel.

Para testar a imagem localmente:

```powershell
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... -t vndesign-leads .
docker run -p 3000:3000 --env-file apps/web/.env.local vndesign-leads
```

---

## Plano por fases

| Fase | Conteúdo | Estado |
|---|---|---|
| A | Projeto, autenticação, modelo de dados + RLS, CRUD de leads, tabela + ficha, duplicados, "não contactar", RGPD | ✅ |
| B | Kanban, dashboard, importação/exportação CSV/XLSX (com a folha atual) | ✅ |
| C | Scripts de contacto com variáveis, assinatura, lembretes de follow-up | ✅ |
| D | Auditor de sites, API de integração com token, PWA e notificações push | ✅ |
| E | Email com IA, propostas em PDF, mapa | ✅ |
