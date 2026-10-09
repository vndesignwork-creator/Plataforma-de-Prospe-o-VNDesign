# Integração: enviar leads para a VNDesign Leads

Este guia explica como uma ferramenta externa envia leads diretamente para a plataforma. O exemplo
principal é a **tarefa semanal de prospeção com o Claude**. O pedido usado é `POST /api/v1/leads/import`.

## 1. Criar um token

1. Abre **Definições → API e integrações**.
2. Dá um nome ao token (ex.: “Tarefa semanal Claude”).
3. Deixa só a permissão **`leads:import`** e escolhe a validade (1 ano, por exemplo).
4. Carrega em **Criar token**.
5. Copia o token `vnd_…` e guarda-o num gestor de palavras-passe. Só é mostrado uma vez.

Se o token se perder ou for exposto, **revoga-o** na mesma página: deixa de funcionar de imediato.
Depois cria outro.

## 2. O pedido

```
POST https://leads.vndesign.pt/api/v1/leads/import
Authorization: Bearer vnd_…
Content-Type: application/json
Idempotency-Key: semana-2026-41        (opcional, recomendado)
```

```json
{
  "source": "claude-semanal",
  "on_duplicate": "skip",
  "dry_run": false,
  "leads": [
    {
      "company_name": "Restaurante O Lagar",
      "sector": "Restauração",
      "website": "https://olagar.pt",
      "city": "Amadora",
      "address": "Rua Elias Garcia 10, Amadora",
      "problems": "Sem HTTPS; não é responsivo",
      "pagespeed": 34,
      "mobile": "Não",
      "email": "geral@olagar.pt",
      "phone": "214 000 000",
      "contact_name": "Sr. Manuel",
      "approach_angle": "Reservas online",
      "estimated_value": "900 €",
      "source_url": "https://maps.google.com/?cid=…",
      "suggested_on": "2026-10-06",
      "email_subject": "Uma ideia para o site do O Lagar",
      "email_body": "Olá Sr. Manuel, …"
    }
  ]
}
```

### Campos de cada lead

O único campo obrigatório é `company_name`. Os outros são opcionais.

Os valores podem vir como estão na folha:

- **Estado:** `"🔍 Identificado"` ou `"identificado"`.
- **Mobile?:** `"Sim"`, `"Não"` ou `"Parcial"`.
- **Datas:** `"06/10/2026"` ou `"2026-10-06"`.
- **Valores:** `"1.200 €"` ou `1200`.

| Campo | Notas |
|---|---|
| `company_name` | Nome da empresa (também aceita `name` ou `empresa`) |
| `sector` | Nome do setor como em Definições → Setores. Com ou sem emoji |
| `website`, `source_url` | Sem `https://` também funciona |
| `city`, `address`, `phone`, `contact_name`, `email` | — |
| `problems`, `approach_angle`, `notes` | Texto livre |
| `pagespeed` | 0–100 |
| `mobile` | `Sim`, `Não`, `Parcial` |
| `status` | Por omissão `Identificado` |
| `channel` | `Email`, `Telefone`, `Instagram`, … |
| `next_action` (ou `next_action_text`), `next_action_on` | Próxima ação e data |
| `estimated_value` | Em euros |
| `suggested_on` | Data em que o lead foi sugerido |
| `email_subject`, `email_body` | Email de prospeção pronto a enviar |

Campos desconhecidos são ignorados e aparecem num aviso na resposta. O `#` é sempre atribuído pela plataforma.

### Opções

- **`on_duplicate`** — o que fazer quando já existe um lead com o mesmo nome, website ou email:
  - `skip` (por omissão): ignora o lead novo;
  - `merge`: preenche os campos vazios do lead existente;
  - `create`: cria na mesma.
- **`dry_run: true`**: valida e mostra o que aconteceria, sem gravar nada.
- **`Idempotency-Key`**: se o mesmo pedido for repetido (por exemplo, depois de um erro de rede),
  devolve a resposta original (`"replayed": true`) e não cria leads em duplicado. Usa uma chave
  por semana, como `semana-2026-41`.
- **Limite:** 500 leads por pedido.
- **Lista “não contactar”:** bloqueia sempre (`blocked_dnc`).

## 3. A resposta

```json
{
  "data": {
    "job_id": "…",
    "dry_run": false,
    "replayed": false,
    "summary": { "total": 3, "created": 1, "merged": 0, "skipped_duplicate": 1, "blocked_dnc": 0, "invalid": 1 },
    "results": [
      { "index": 0, "result": "created", "company_name": "Restaurante O Lagar", "lead_id": "…", "number": 112 },
      { "index": 1, "result": "skipped_duplicate", "company_name": "Clínica Sá", "lead_id": "…", "number": 87,
        "duplicate_of": [{ "lead_id": "…", "number": 87, "company_name": "Clínica Sá", "reasons": ["website"] }] },
      { "index": 2, "result": "invalid", "company_name": null, "errors": ["Falta o nome da empresa."] }
    ]
  }
}
```

### Códigos de estado

| Código | Significado |
|---|---|
| `201` | Pelo menos um lead foi criado ou juntado. |
| `200` | Simulação (`dry_run`), pedido repetido, ou nada gravado. |
| `400` | O JSON é inválido. A resposta traz os erros campo a campo. |
| `401` | O token é inválido, foi revogado ou expirou. |
| `403` | O token não tem a permissão `leads:import`. |

Cada importação aparece em **Importar → Histórico**. Os leads ficam com a atividade “Lead criado … via API”.

## 4. Exemplos

**PowerShell** (Windows):

```powershell
$token = "vnd_…"
$headers = @{ Authorization = "Bearer $token"; "Idempotency-Key" = "semana-$(Get-Date -UFormat %Y-%V)" }
$body = @'
{ "source": "teste", "dry_run": true, "leads": [ { "company_name": "Empresa Teste", "city": "Amadora" } ] }
'@
Invoke-RestMethod -Method Post -Uri "https://leads.vndesign.pt/api/v1/leads/import" `
  -Headers $headers -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 6
```

**curl:**

```bash
curl -X POST https://leads.vndesign.pt/api/v1/leads/import \
  -H "Authorization: Bearer vnd_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: semana-$(date +%G-%V)" \
  -d '{"source":"teste","dry_run":true,"leads":[{"company_name":"Empresa Teste","city":"Amadora"}]}'
```

## 5. Texto para a tarefa semanal do Claude

Acrescenta isto às instruções da tarefa e substitui o token. Se a tarefa não puder fazer pedidos
HTTP, pede-lhe que gere o JSON e envia-o tu com o exemplo PowerShell acima.

```text
No fim, envia os leads encontrados para a minha plataforma:
POST https://leads.vndesign.pt/api/v1/leads/import
Cabeçalhos: Authorization: Bearer vnd_COLOCA_AQUI_O_TOKEN
            Content-Type: application/json
            Idempotency-Key: semana-<ano>-<número da semana>
Corpo: { "source": "claude-semanal", "on_duplicate": "skip", "leads": [ ... ] }
Cada lead: company_name (obrigatório), sector, website, city, address, problems,
pagespeed (0-100), mobile (Sim/Não/Parcial), email, phone, contact_name,
approach_angle, source_url, suggested_on (AAAA-MM-DD), email_subject, email_body.
Usa só dados empresariais públicos e indica a fonte em source_url.
Mostra-me o "summary" da resposta e os leads com "skipped_duplicate" ou "invalid".
```

## 6. Outras permissões

Um token também pode ter outras permissões, por exemplo para um Zapier ou um script:

- `leads:read`: dá acesso a `GET /leads` (com os mesmos filtros da web), `GET /leads/{id}`,
  `GET /sectors`, `GET /meta` e `POST /leads/check-duplicates`.
- `leads:write`: dá acesso a `POST /leads` e `PATCH /leads/{id}`.

Apagar, anonimizar e juntar leads só é possível na plataforma. Gerir tokens também.

A documentação completa está em **`/docs/api`**.
