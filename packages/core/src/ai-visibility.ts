/**
 * GEO — "Aparece nas IAs?": faz a uma IA com pesquisa na internet as perguntas
 * que um cliente faria ("Que construtoras recomendas em Lisboa?") e vê se o
 * lead aparece nas respostas e quem aparece no lugar dele.
 * A IA não sabe qual é o lead (para não o favorecer): só responde como
 * responderia a qualquer pessoa. A comparação é feita aqui, pelo nome e pelo site.
 */
import { z } from 'zod';
import { normalizeCompanyName, normalizeText, websiteKey } from './normalize';

export const AI_VISIBILITY_LIMITS = { questions: 5, webSearches: 8, competitors: 8 } as const;

// -----------------------------------------------------------------------------
// Perguntas
// -----------------------------------------------------------------------------

/** Perguntas sugeridas (editáveis antes de correr), a partir do setor e da cidade do lead. */
export function defaultVisibilityQuestions(lead: { sector: string | null; city: string | null }): string[] {
  const where = lead.city?.trim() ? `em ${lead.city.trim()}` : 'perto de mim';
  const what = lead.sector?.trim() ? lead.sector.trim().toLowerCase() : null;
  if (!what) {
    return [`Que empresas recomendas ${where}?`, `Onde posso pedir orçamento ${where}?`, `Qual a melhor empresa do ramo ${where}?`];
  }
  return [
    `Quais são as melhores empresas de ${what} ${where}?`,
    `Recomenda-me uma empresa de ${what} de confiança ${where}.`,
    `Preciso de ${what} ${where}: a quem devo pedir orçamento?`,
  ];
}

export const AiVisibilityRequestSchema = z
  .object({
    questions: z
      .array(z.string().trim().min(8, { error: 'Pergunta demasiado curta.' }).max(200, { error: 'Máximo de 200 caracteres.' }))
      .min(1, { error: 'Escreve pelo menos uma pergunta.' })
      .max(AI_VISIBILITY_LIMITS.questions, { error: `No máximo ${AI_VISIBILITY_LIMITS.questions} perguntas.` }),
  })
  .meta({ id: 'AiVisibilityRequest' });
export type AiVisibilityRequest = z.infer<typeof AiVisibilityRequestSchema>;

// -----------------------------------------------------------------------------
// Pedido à IA
// -----------------------------------------------------------------------------

export const AI_VISIBILITY_TOOL_NAME = 'entregar_respostas';

const nullableString = { type: ['string', 'null'] } as const;

export const AI_VISIBILITY_TOOL = {
  name: AI_VISIBILITY_TOOL_NAME,
  description: 'Entrega as respostas finais, uma por pergunta, pela mesma ordem. Chama esta ferramenta uma única vez, no fim.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['respostas'],
    properties: {
      respostas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['pergunta', 'resposta', 'empresas'],
          properties: {
            pergunta: { type: 'string', description: 'A pergunta, tal como foi feita' },
            resposta: { type: 'string', description: 'A resposta que darias a quem perguntou (2 a 4 frases)' },
            empresas: {
              type: 'array',
              description: 'As empresas que recomendas nesta resposta, pela ordem em que as recomendas',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'site'],
                properties: {
                  nome: { type: 'string', description: 'Nome comercial' },
                  site: { ...nullableString, description: 'Site próprio, se o conheces' },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const RULES = `Regras:
- Responde a cada pergunta como responderias a uma pessoa em Portugal que te fizesse essa pergunta: pesquisa na internet e recomenda empresas concretas e reais (3 a 6), as que de facto recomendarias.
- Usa o que encontrares nas pesquisas (sites, Google Maps, diretórios, avaliações). Não inventes empresas nem sites.
- Se não encontrares recomendações fiáveis para uma pergunta, deixa a lista dessa pergunta vazia.
- Responde em português de Portugal.`;

export const AI_VISIBILITY_SYSTEM_PROMPT = `És um assistente que ajuda pessoas a encontrar empresas e serviços locais.
${RULES}
- No fim, chama a ferramenta ${AI_VISIBILITY_TOOL_NAME} uma única vez, com uma resposta por pergunta, pela mesma ordem.`;

export const AI_VISIBILITY_JSON_SYSTEM_PROMPT = `És um assistente que ajuda pessoas a encontrar empresas e serviços locais.
${RULES}
- No fim, responde só com um objeto JSON {"respostas":[{"pergunta":"…","resposta":"…","empresas":[{"nome":"…","site":"https://… ou null"}]}]}, sem texto à volta.`;

export function buildVisibilityPrompt(questions: string[]): string {
  return `Responde a estas perguntas, uma de cada vez:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
}

// -----------------------------------------------------------------------------
// Resultado
// -----------------------------------------------------------------------------

export const AiVisibilityCompanySchema = z.object({ name: z.string(), website: z.string().nullable() });

export const AiVisibilityResultSchema = z.object({
  question: z.string(),
  answer: z.string(),
  companies: z.array(AiVisibilityCompanySchema),
  mentioned: z.boolean(),
  /** Posição do lead na lista (1 = o primeiro recomendado); null se não aparece. */
  position: z.int().nullable(),
});
export type AiVisibilityResult = z.infer<typeof AiVisibilityResultSchema>;

export const AiVisibilityCompetitorSchema = z.object({ name: z.string(), website: z.string().nullable(), count: z.int() });
export type AiVisibilityCompetitor = z.infer<typeof AiVisibilityCompetitorSchema>;

export const AiVisibilityCheckSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    status: z.enum(['running', 'done', 'error']),
    questions: z.array(z.string()),
    results: z.array(AiVisibilityResultSchema),
    competitors: z.array(AiVisibilityCompetitorSchema),
    mentioned_count: z.int(),
    assistant: z.string().nullable(),
    model: z.string().nullable(),
    searches: z.int().nullable(),
    cost_usd: z.number().nullable(),
    error: z.string().nullable(),
    /** Texto pronto a mostrar ao cliente. */
    summary: z.string().nullable(),
    created_at: z.string(),
    finished_at: z.string().nullable(),
  })
  .meta({ id: 'AiVisibilityCheck' });
export type AiVisibilityCheck = z.infer<typeof AiVisibilityCheckSchema>;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Lê as respostas devolvidas pela IA (tolera campos em falta). */
export function parseVisibilityAnswers(raw: unknown, questions: string[]): { question: string; answer: string; companies: { name: string; website: string | null }[] }[] {
  const list = (raw as { respostas?: unknown } | null)?.respostas;
  const items = Array.isArray(list) ? list : [];
  return questions.map((question, i) => {
    // Pela ordem; se a IA trocou a ordem, procura-se pela pergunta.
    const item = (items.find((it) => normalizeText(str((it as { pergunta?: unknown })?.pergunta)) === normalizeText(question)) ?? items[i]) as
      | { resposta?: unknown; empresas?: unknown }
      | undefined;
    const companies = (Array.isArray(item?.empresas) ? item.empresas : [])
      .map((c) => ({ name: str((c as { nome?: unknown }).nome), website: str((c as { site?: unknown }).site) }))
      .filter((c): c is { name: string; website: string | null } => c.name !== null)
      .slice(0, 10);
    return { question, answer: str(item?.resposta) ?? '', companies };
  });
}

/** O lead aparece nesta empresa recomendada? (nome normalizado ou mesmo site). */
function sameCompany(company: { name: string; website: string | null }, lead: { name: string | null; site: string | null }): boolean {
  if (lead.site && company.website && websiteKey(company.website) === lead.site) return true;
  const name = normalizeCompanyName(company.name);
  if (!lead.name || !name) return false;
  if (name === lead.name) return true;
  // "api construcoes" ↔ "api construcoes relacoes construtivas" (nomes com pelo menos 5 letras).
  return lead.name.length >= 5 && name.length >= 5 && (name.includes(lead.name) || lead.name.includes(name));
}

/** Compara as respostas com o lead: aparece? em que posição? quem aparece no lugar dele? */
export function matchVisibility(
  answers: { question: string; answer: string; companies: { name: string; website: string | null }[] }[],
  lead: { company_name: string; website: string | null },
): { results: AiVisibilityResult[]; competitors: AiVisibilityCompetitor[]; mentioned_count: number } {
  const target = { name: normalizeCompanyName(lead.company_name), site: websiteKey(lead.website) };
  const results: AiVisibilityResult[] = answers.map((a) => {
    const index = a.companies.findIndex((c) => sameCompany(c, target));
    // Também conta se o nome aparece no texto da resposta (sem estar na lista).
    const inText = index < 0 && !!target.name && target.name.length >= 5 && (normalizeCompanyName(a.answer) ?? '').includes(target.name);
    return { ...a, mentioned: index >= 0 || inText, position: index >= 0 ? index + 1 : null };
  });

  const byKey = new Map<string, AiVisibilityCompetitor>();
  for (const r of results) {
    for (const c of r.companies) {
      if (sameCompany(c, target)) continue;
      const key = websiteKey(c.website) ?? normalizeCompanyName(c.name);
      if (!key) continue;
      const found = byKey.get(key);
      if (found) {
        found.count += 1;
        found.website ??= c.website;
      } else byKey.set(key, { name: c.name, website: c.website, count: 1 });
    }
  }
  const competitors = [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, AI_VISIBILITY_LIMITS.competitors);
  return { results, competitors, mentioned_count: results.filter((r) => r.mentioned).length };
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`);

/** Frase para o cliente (relatório, email, conversa). */
export function visibilitySummary(check: {
  assistant: string | null;
  questions: string[];
  results: { mentioned: boolean }[];
  competitors: { name: string }[];
  mentioned_count: number;
}): string {
  const who = check.assistant ?? 'uma IA';
  const total = check.results.length || check.questions.length;
  const example = check.questions[0] ? `“${check.questions[0]}”` : 'o que um cliente perguntaria';
  const others = joinNames(check.competitors.slice(0, 3).map((c) => c.name));
  if (check.mentioned_count === 0) {
    return others
      ? `Quando se pergunta ao ${who} ${example}, aparecem ${others} — a sua empresa não aparece ${total === 1 ? 'na resposta' : `em nenhuma das ${total} respostas`}.`
      : `Perguntámos ao ${who} ${example} e outras perguntas parecidas: a sua empresa não aparece em nenhuma resposta.`;
  }
  if (check.mentioned_count === total) {
    return total === 1
      ? `A sua empresa aparece na resposta do ${who} a ${example}.`
      : `A sua empresa aparece nas ${total} respostas do ${who} a perguntas como ${example}.`;
  }
  return `A sua empresa aparece em ${check.mentioned_count} de ${total} respostas do ${who}${others ? `; nas outras aparecem ${others}` : ''}.`;
}

/** Nome do assistente a mostrar ao cliente, pelo tipo de fornecedor. */
export function assistantName(kind: string, label: string): string {
  if (kind === 'anthropic') return 'Claude';
  if (kind === 'openai') return 'ChatGPT';
  return label;
}
