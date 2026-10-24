/**
 * Servidores falsos para os testes E2E da Fase E (sem rede nem custos):
 *  - API da Anthropic (AI_BASE_URL=http://127.0.0.1:4621);
 *  - geocodificador compatível com Nominatim (GEOCODER_URL=http://127.0.0.1:4620/search);
 *  - PageSpeed com as imagens do site (PAGESPEED_ENDPOINT=http://127.0.0.1:4622/pagespeed);
 *  - site de um negócio com página de contactos (http://127.0.0.1:4623), para "Procurar contacto".
 */
import http from 'node:http';

export const STUB_SUBJECT = 'Uma ideia rápida para o site da {{empresa}}';

function listen(server: http.Server, port: number) {
  return new Promise<http.Server | null>((resolve) => {
    server.once('error', () => resolve(null)); // já existe (outro worker): reutiliza
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Gerador de leads: 1.º pedido pausa ("pause_turn", como numa pesquisa longa);
 * o seguinte entrega 3 empresas válidas e 1 inválida pela ferramenta guardar_empresas.
 * O último termo do <pedido> entra nos nomes (para cada teste ter empresas próprias).
 */
function leadSearch(body: { model?: string; messages?: unknown[] }, res: http.ServerResponse) {
  const prompt = JSON.stringify(body.messages ?? '');
  const token = /<pedido>[^<]*?(\S+)<\/pedido>/.exec(prompt)?.[1] ?? 'teste';
  const reply = (content: unknown[], stop_reason: string) =>
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_stub_leads' });
      res.end(
        JSON.stringify({
          id: 'msg_stub_leads',
          type: 'message',
          role: 'assistant',
          model: body.model ?? 'claude-sonnet-5-5',
          content,
          stop_reason,
          stop_sequence: null,
          usage: { input_tokens: 20_000, output_tokens: 1_500, server_tool_use: { web_search_requests: 3 } },
        }),
      );
    }, 800);
  if ((body.messages ?? []).length === 1) {
    reply([{ type: 'text', text: 'A pesquisar empresas…' }], 'pause_turn');
    return;
  }
  reply(
    [
      {
        type: 'tool_use',
        id: 'toolu_stub_leads',
        name: 'guardar_empresas',
        input: { empresas: stubCompanies(token) },
      },
    ],
    'tool_use',
  );
}

/**
 * "Aparece nas IAs?": responde a cada pergunta com 2 concorrentes fixos; se a
 * pergunta tiver um nome entre «…», essa empresa aparece em 2.º lugar.
 */
function visibilityAnswers(body: { model?: string; messages?: { content?: unknown }[] }, res: http.ServerResponse) {
  const prompt = String(body.messages?.[0]?.content ?? '');
  const questions = [...prompt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]!);
  const respostas = questions.map((pergunta) => {
    const named = /«([^»]+)»/.exec(pergunta)?.[1];
    const empresas = [
      { nome: 'Forno Concorrente', site: 'https://forno-concorrente.pt' },
      ...(named ? [{ nome: named, site: null }] : []),
      { nome: 'Pão Quente Lda', site: null },
    ];
    return { pergunta, resposta: `Recomendo ${empresas.map((e) => e.nome).join(', ')}.`, empresas };
  });
  setTimeout(() => {
    sendJson(res, 200, {
      id: 'msg_stub_visibility',
      type: 'message',
      role: 'assistant',
      model: body.model ?? 'claude-sonnet-5-5',
      content: [{ type: 'tool_use', id: 'toolu_stub_visibility', name: 'entregar_respostas', input: { respostas } }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 8_000, output_tokens: 600, server_tool_use: { web_search_requests: 3 } },
    });
  }, 800);
}

/** As empresas que o "fornecedor" devolve (3 válidas e 1 sem fonte, que é descartada). */
export function stubCompanies(token: string) {
  const company = (o: Record<string, unknown>) => ({
    city: 'Amadora', address: null, website: null, social_url: null, phone: null, email: null, sector: null,
    services: ['site_institucional'], approach_angle: null, ...o,
  });
  return [
    company({
      company_name: `Café Central ${token}`,
      social_url: `https://www.facebook.com/cafecentral${token}`,
      phone: '214 000 001',
      opportunity: 'Sem site próprio, só página de Facebook.',
      approach_angle: 'Propor um site simples com a carta e o horário.',
      source_url: `https://www.facebook.com/cafecentral${token}`,
    }),
    company({
      company_name: `Oficina Rápida ${token}`,
      website: `https://oficina-${token}.invalid`,
      email: `geral@oficina-${token}.invalid`,
      services: ['site_institucional', 'servico_inexistente'],
      opportunity: 'Site sem HTTPS e não adaptado a telemóvel.',
      source_url: `https://oficina-${token}.invalid/contactos`,
    }),
    company({ company_name: `Duplicado ${token}`, opportunity: 'Já existe na plataforma.', source_url: 'https://exemplo.pt/duplicado' }),
    { company_name: 'Sem fonte', opportunity: 'Falta o source_url.' },
  ];
}

/** Chaves que o servidor falso recusa (para testar "Testar chave"). */
const INVALID_KEY = /invalida/;

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

/**
 * Fornecedores no formato da OpenAI (OpenAI, OpenRouter e compatíveis):
 * /v1/models, /v1/key, /v1/chat/completions (email e OpenRouter com pesquisa) e
 * /v1/responses (OpenAI com pesquisa). O modelo "sem-schema" recusa a saída
 * estruturada, para testar a alternativa sem esquema.
 */
function openAiCompatible(req: http.IncomingMessage, body: Record<string, unknown>, res: http.ServerResponse): boolean {
  const url = req.url ?? '';
  const auth = String(req.headers.authorization ?? '');
  if (!url.startsWith('/v1/') || url.startsWith('/v1/messages')) return false;
  // A Anthropic envia a chave em x-api-key; os outros em Authorization: Bearer.
  if (!auth.startsWith('Bearer ') || req.headers['x-api-key']) return false;
  if (INVALID_KEY.test(auth)) {
    sendJson(res, 401, { error: { message: 'Incorrect API key provided' } });
    return true;
  }
  if (url.startsWith('/v1/models')) {
    sendJson(res, 200, { data: [{ id: 'gpt-teste' }, { id: 'gpt-teste-mini' }] });
    return true;
  }
  if (url.startsWith('/v1/key')) {
    sendJson(res, 200, { data: { label: 'teste' } });
    return true;
  }
  const prompt = JSON.stringify(body.messages ?? body.input ?? '');
  const token = /<pedido>[^<]*?(\S+)<\/pedido>/.exec(prompt)?.[1] ?? 'teste';
  if (url.startsWith('/v1/responses')) {
    const text = JSON.stringify({ empresas: stubCompanies(token) });
    sendJson(res, 200, {
      id: 'resp_stub',
      model: body.model,
      output: [
        { type: 'web_search_call', id: 'ws_1', status: 'completed' },
        { type: 'web_search_call', id: 'ws_2', status: 'completed' },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] },
      ],
      usage: { input_tokens: 9000, output_tokens: 900 },
    });
    return true;
  }
  if (url.startsWith('/v1/chat/completions')) {
    const format = (body.response_format as { type?: string } | undefined)?.type;
    if (body.model === 'sem-schema' && format === 'json_schema') {
      sendJson(res, 400, { error: { message: 'response_format json_schema is not supported for this model' } });
      return true;
    }
    let content: string;
    if (Array.isArray(body.plugins)) {
      content = 'Encontrei estas empresas:\n```json\n' + JSON.stringify({ empresas: stubCompanies(token) }) + '\n```';
    } else {
      const company = /<dados_do_lead>\\nEmpresa: ([^\\]+?)\\n/.exec(prompt)?.[1] ?? 'empresa';
      content = JSON.stringify({
        subject: STUB_SUBJECT.replace('{{empresa}}', company),
        body: `Olá,\n\nEscrito por ${String(body.model)} para a ${company}.\n\nCumprimentos,`,
      });
    }
    sendJson(res, 200, {
      id: 'chatcmpl_stub',
      model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    });
    return true;
  }
  return false;
}

/** Imagens JPEG minúsculas (telemóvel laranja, computador cinzento) como as do PageSpeed. */
const SHOTS = {
  mobile: { data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABSACkDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB1FFFeKfWBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/2Q==', width: 41, height: 82 },
  desktop: { data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABeAIcDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiaKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=', width: 135, height: 94 },
};

export async function startStubs() {
  const anthropic = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if (openAiCompatible(req, body, res)) return;
      // Anthropic: lista de modelos ("Testar" a chave do servidor).
      if ((req.url ?? '').startsWith('/v1/models')) {
        sendJson(res, INVALID_KEY.test(String(req.headers['x-api-key'] ?? '')) ? 401 : 200, { data: [{ id: 'claude-sonnet-5-5' }] });
        return;
      }
      if ((body.tools ?? []).some((t: { name?: string }) => t.name === 'guardar_empresas')) {
        leadSearch(body, res);
        return;
      }
      if ((body.tools ?? []).some((t: { name?: string }) => t.name === 'entregar_respostas')) {
        visibilityAnswers(body, res);
        return;
      }
      // Kit GEO: perfil do Google (o 1.º é o lead; os outros, concorrentes com mais avaliações).
      if ((body.tools ?? []).some((t: { name?: string }) => t.name === 'entregar_perfis')) {
        const lines = [...String(body.messages?.[0]?.content ?? '').matchAll(/^\d+\. (.+?)(?: \(| —|$)/gm)].map((m) => m[1]!);
        const perfis = lines.map((nome: string, i: number) => ({
          nome,
          encontrado: true,
          nota: i === 0 ? 4.1 : 4.7,
          avaliacoes: i === 0 ? 12 : 150,
          link_maps: `https://maps.google.com/?q=${encodeURIComponent(nome)}`,
          morada: null,
        }));
        sendJson(res, 200, {
          id: 'msg_stub_perfis', type: 'message', role: 'assistant', model: body.model ?? 'claude-sonnet-5-5',
          content: [{ type: 'tool_use', id: 'toolu_stub_perfis', name: 'entregar_perfis', input: { perfis } }],
          stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 3_000, output_tokens: 300, server_tool_use: { web_search_requests: 2 } },
        });
        return;
      }
      // Resumo do lead com IA (antes de ligar).
      if (JSON.stringify(body.system ?? '').includes('preparar-se antes de contactar')) {
        const resumo = {
          resumo: 'Restaurante em Lisboa sem site. Falámos por telefone e pediram uma proposta de site com reservas.',
          combinado: 'Enviar a proposta até sexta.',
          proximo_passo: 'Ligar para saber se receberam a proposta',
          atencao: 'Só atende depois das 15h',
        };
        sendJson(res, 200, {
          id: 'msg_stub_resumo', type: 'message', role: 'assistant', model: body.model ?? 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(resumo) }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 900, output_tokens: 150 },
        });
        return;
      }
      // Cartão de visita (com a imagem na mensagem).
      if (JSON.stringify(body.system ?? '').includes('cartão de visita')) {
        const hasImage = JSON.stringify(body.messages ?? '').includes('"type":"image"');
        const cartao = hasImage
          ? { empresa: 'Padaria Estrela', contacto: 'Ana Ribeiro', email: 'ANA@PadariaEstrela.pt', telefone: '+351 912 345 678', site: 'padariaestrela.pt', cidade: 'Porto', morada: 'Rua das Flores, 10', notas: 'Gerente' }
          : { empresa: null, contacto: null, email: null, telefone: null, site: null, cidade: null, morada: null, notas: null };
        sendJson(res, 200, {
          id: 'msg_stub_cartao', type: 'message', role: 'assistant', model: body.model ?? 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(cartao) }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1_500, output_tokens: 120 },
        });
        return;
      }
      // Notas de reunião com IA: resumo, tarefas e próximo passo.
      if (JSON.stringify(body.system ?? '').includes('apontamentos de uma reunião')) {
        const notas = {
          resumo: 'Querem uma loja online até ao Natal, com orçamento até 2000 €.',
          tarefas: [
            { titulo: 'Enviar proposta da loja online', prazo_dias: 3 },
            { titulo: 'Pedir as fotografias dos produtos', prazo_dias: null },
          ],
          proximo_passo: { texto: 'Ligar para saber a decisão', dias: 7 },
        };
        sendJson(res, 200, {
          id: 'msg_stub_notas', type: 'message', role: 'assistant', model: body.model ?? 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(notas) }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 800, output_tokens: 200 },
        });
        return;
      }
      // Kit GEO: perguntas frequentes (texto estruturado, como o email com IA).
      if (JSON.stringify(body.system ?? '').includes('perguntas frequentes')) {
        const perguntas = [
          { pergunta: 'Fazem orçamentos sem compromisso?', resposta: 'Sim. Peça o seu orçamento pelo telefone ou pelo formulário do site e respondemos no próprio dia.' },
          { pergunta: 'Em que zonas trabalham?', resposta: 'Trabalhamos na zona indicada no pedido e arredores; confirme connosco a sua localidade.' },
        ];
        sendJson(res, 200, {
          id: 'msg_stub_faq', type: 'message', role: 'assistant', model: body.model ?? 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify({ perguntas }) }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1_000, output_tokens: 400 },
        });
        return;
      }
      const prompt = JSON.stringify(body.messages ?? '');
      const company = /<dados_do_lead>\\nEmpresa: ([^\\]+?)\\n/.exec(prompt)?.[1] ?? 'empresa';
      const draft = {
        subject: STUB_SUBJECT.replace('{{empresa}}', company),
        body: `Olá,\n\nVi o site da ${company} no telemóvel e reparei que não usa HTTPS.\n\nPosso enviar-lhe um relatório curto?\n\nCumprimentos,`,
      };
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_stub' });
      res.end(
        JSON.stringify({
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: body.model ?? 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(draft) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      );
    });
  });

  const geocoder = http.createServer((req, res) => {
    const q = new URL(req.url ?? '/', 'http://x').searchParams.get('q') ?? '';
    let out: unknown[] = [];
    if (q.includes('Rua do Teste')) out = [{ lat: '38.7581', lon: '-9.2393', display_name: 'Rua do Teste, Amadora' }];
    else if (q === 'Amadora, Portugal') out = [{ lat: '38.7538', lon: '-9.2308', display_name: 'Amadora' }];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });

  const pagespeed = http.createServer((req, res) => {
    const strategy = new URL(req.url ?? '/', 'http://x').searchParams.get('strategy') === 'desktop' ? 'desktop' : 'mobile';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        lighthouseResult: {
          categories: { performance: { score: strategy === 'mobile' ? 0.42 : 0.81 } },
          audits: { 'final-screenshot': { details: { type: 'screenshot', ...SHOTS[strategy] } } },
        },
      }),
    );
  });

  const business = http.createServer((req, res) => {
    // GEO: o robots.txt bloqueia o robô do ChatGPT.
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /privado/\n\nUser-agent: GPTBot\nDisallow: /\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (req.url?.startsWith('/contactos')) {
      res.end(
        '<html><body><h1>Contactos</h1><p>NIF 212345678</p><p>Telefone: 213 456 789</p><p>Telemóvel: +351 912 345 678</p>' +
          '<a href="mailto:reservas@tasca-exemplo.pt">Escreva-nos</a></body></html>',
      );
      return;
    }
    res.end('<html><head><title>Tasca Exemplo | Restaurante</title></head><body><a href="/contactos">Contactos</a></body></html>');
  });

  const servers = await Promise.all([listen(anthropic, 4621), listen(geocoder, 4620), listen(pagespeed, 4622), listen(business, 4623)]);
  return () => servers.forEach((s) => s?.close());
}
