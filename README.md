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
- **Apagar** é definitivo (para erros, testes e duplicados). Para pedidos RGPD usa *Anonimizar*.

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

- De 10 em 10 minutos (pelo cron dos lembretes), a plataforma lê na caixa de entrada **só o remetente e o assunto** dos emails novos. Nunca lê o texto.
- Um email de um lead (resposta ao email enviado, o mesmo endereço, ou o mesmo domínio de empresa) fica na linha do tempo como **Resposta recebida**.
- Se o lead estava "Contactado", passa a **Respondeu**, com a próxima ação "Responder ao cliente" para hoje, e recebes uma notificação.
- As respostas automáticas (férias, ausência) ficam registadas mas não mudam o estado.
- Usa a mesma palavra-passe de aplicação do Gmail (IMAP: `imap.gmail.com:993`). Hostinger: `imap.hostinger.com:993`. Outro serviço: indica o servidor IMAP.
- **Verificar agora** lê logo a caixa. Se a leitura falhar (ex.: palavra-passe mudada), o erro aparece nessa secção.

### Saber quando o lead abre o email

- Cada email enviado pela plataforma leva uma imagem invisível de 1×1 e os links passam pela plataforma (seguem logo para o endereço original).
- Quando o lead **abre o email** ou **carrega num link**, recebes uma notificação ("📬 Padaria Sol — Abriu o email. Bom momento para ligar!"), fica na linha do tempo e aparece em **Dashboard → Hoje → Abriram o teu email** (últimas 48 horas, com o botão para ligar). Uma nova abertura volta a avisar ao fim de 6 horas.
- Na linha do tempo, cada email enviado mostra "Aberto 3× · última vez a …" ou "Ainda não foi aberto".
- A cópia para ti (cópia oculta) vai num email separado, sem rastreio, para não contar como aberto.
- Limites: quem bloqueia imagens só conta quando carrega num link; o Apple Mail (proteção de privacidade) pode abrir as imagens sozinho; abrir o email na tua pasta *Enviados* pode contar como aberto.
- Desliga-se em Definições → Funcionalidades → *Saber quando o lead abre o email*.

---

## Sessão de prospeção

Menu **Prospeção**: um lead de cada vez, com tudo à mão.

- A lista começa por quem **abriu um email** nas últimas 48 horas, depois os **follow-ups** em atraso ou para hoje e, por fim, os leads **por contactar** (os mais quentes primeiro). Os separadores filtram cada grupo.
- Em cada lead: o motivo ("Abriu o email há 2 h"), **Ligar**, **WhatsApp** (com as mensagens prontas), **Email** (o de prospeção), o site, o ângulo de abordagem, os problemas, as notas e **Ver scripts**.
- O resultado regista-se com um toque (com uma nota opcional):
  - **Não atendeu** — volta a aparecer amanhã;
  - **Contactado** — passa a Contactado e agenda o follow-up (ou, se já estava contactado, conta como follow-up feito);
  - **Interessado** — passa a Respondeu, com "Marcar reunião ou enviar proposta" para hoje;
  - **Mais tarde** — amanhã, 3 dias, 1 semana, 2 semanas ou 1 mês;
  - **Sem interesse**; **Saltar** passa para o fim da fila.
- Em cima: quantos contactos fizeste nesta sessão e hoje.
- **Procurar contacto** (leads sem telefone ou email; também na ficha, no cartão *Empresa e contacto*):
  - **Procurar automaticamente** lê o site do lead e a página de contactos (telefones em links e no texto, perto de "Telefone"/"Telemóvel"; o NIF não conta) e, com `GOOGLE_PLACES_API_KEY`, o Google Maps. Mostra o que encontrou para escolheres; nada é guardado sem carregares em **Guardar contactos**.
  - Atalhos **Google**, **Google Maps**, **Facebook** e **Instagram** já com o nome e a cidade (as páginas do Facebook/Instagram não se leem automaticamente).
  - Cola o telefone ou o email e **Guardar contactos**: aparecem logo **Ligar**, **WhatsApp** e **Email**.

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
  - **Lista**: os projetos em curso ordenados pelo prazo de entrega ("Faltam 5 dias", "Entrega hoje", "Atrasado 2 dias" a vermelho), a fase, barras de progresso das tarefas e dos pagamentos, revisões, horas, entregas e próxima reunião. Cada projeto mostra **todas as tarefas** (a mesma lista da ficha: marcar como feitas, arrastar pela pega ⠿ para mudar a ordem, editar, apagar e acrescentar; **Esconder tarefas** recolhe a lista). Ações rápidas sem abrir a ficha: ▶ temporizador, **WhatsApp**, **Reunião**, **Criar plano** de pagamentos e **Concluir projeto**. "Concluídos" mostra os terminados.
  - **Fases**: colunas Briefing → Em produção → Revisões → Entrega. Arrasta o cartão (no telemóvel, mantém o dedo) ou usa o botão da fase.
  - **Calendário**: o mês com as entregas, reuniões, pagamentos previstos e tarefas (no telemóvel, a lista dos dias com alguma coisa).
- Na ficha de um cliente, cartão **Projeto**: prazo de entrega, fase e as secções abaixo.
- **Rondas de revisão**: indicas quantas estão incluídas no preço (2 por omissão) e registas cada pedido do cliente. A partir da primeira além das incluídas, aparece o aviso e a revisão fica "A cobrar".
- **Registo de horas**: ▶ **Começar** → ⏸ **Pausar** → ▶ **Continuar** quantas vezes quiseres: o relógio mostra sempre o total do projeto (o já registado mais a sessão atual). Só há um temporizador a contar de cada vez; enquanto conta aparece no menu (também no telemóvel). **À mão** regista horas sem temporizador; sessões de menos de 5 segundos (começar e pausar logo) não ficam guardadas; **Pôr a zero** apaga todas as horas do projeto (com confirmação); cada registo pode ser corrigido (✎ horas, minutos, notas) ou apagado — na ficha ou em **ver registos** na lista de projetos. Mostra o total e quanto ganhas por hora (valor da proposta aceite; sem ela, o total dos pagamentos; por fim, o valor estimado).
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

**Pomodoro**
- No cartão de cada projeto (em **Projetos** e na ficha), bloco **Pomodoro** com um mostrador circular: as marcas que já passaram apagam-se e o ponteiro (laranja a trabalhar, verde na pausa) mostra onde vai a fase. Escolhe a tarefa (opcional) e carrega em **Começar 25 min**.
- Ritmo: 25 min de trabalho, 5 de pausa e, a cada 4 pomodoros, uma pausa de 15. Botões: **Pausar** / **Continuar**, **Reiniciar** (a contar ou em pausa: a fase volta ao início; o trabalho já feito fica registado), **Pausa de 5 min** (descanso já, mesmo a meio do trabalho), **Saltar pausa**, **Começar o próximo** e **Parar**.
- O trabalho conta no **registo de horas** do projeto (com a nota "Pomodoro · tarefa") e no €/hora; as pausas não. Pausar o temporizador ▶ pausa o pomodoro; começar o ▶ à parte termina o pomodoro.
- Enquanto decorre, aparece no menu (a fase e o tempo que falta, também no telemóvel).
- No fim de cada fase, com a app aberta: **som de aviso** (um toque de sino, a descer no fim do trabalho e a subir no fim da pausa), vibração, notificação e mensagem. O browser só deixa tocar som depois de um clique na app (basta um clique qualquer). Em Definições há **Testar som**. Com a app fechada, o pomodoro continua no servidor e o cron dos lembretes (de 5 em 5 minutos) avança a fase, fecha as horas e envia a notificação push.
- **Começar a pausa automaticamente** (ligado por omissão): desligado, quando o trabalho acaba a pausa fica à espera ("Pausa por começar") até carregares em **Começar pausa** (ou **Saltar pausa**).
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
- Em Definições → Funcionalidades → *Calendário no telemóvel*, **Criar link** gera um endereço privado com as reuniões, as entregas dos projetos, os pagamentos previstos e as tarefas (do último mês até 6 meses à frente). Atualiza-se sozinho.
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

## Segurança da conta

**Verificação em dois passos** (Definições → Conta)
- **Ligar a verificação** mostra um código QR: lê-o com uma app de autenticação (Google Authenticator, Microsoft Authenticator, 1Password) e escreve o código de 6 dígitos.
- A partir daí, depois da palavra-passe, o login pede o código da app. Sem o código, nem a plataforma nem a API respondem.
- **Perdeste o telemóvel?** No Supabase → *Authentication → Users* → o teu utilizador → apaga o fator (MFA). Depois entras só com a palavra-passe e voltas a ligar.
- No Supabase alojado, a verificação por app (TOTP) vem ligada por omissão (*Authentication → Multi-Factor*).

**Sessões abertas** (Definições → Conta)
- Lista os aparelhos com a conta aberta (browser e sistema, IP, última atividade, se entrou com o código).
- **Terminar** fecha uma sessão; **Terminar as outras** fecha todas menos esta. O aparelho deixa de entrar em, no máximo, 1 hora.

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
