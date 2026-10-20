/**
 * Servidores falsos para os testes E2E da Fase E (sem rede nem custos):
 *  - API da Anthropic (AI_BASE_URL=http://127.0.0.1:4621);
 *  - geocodificador compatível com Nominatim (GEOCODER_URL=http://127.0.0.1:4620/search).
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
  const company = (o: Record<string, unknown>) => ({
    city: 'Amadora', address: null, website: null, social_url: null, phone: null, email: null, sector: null,
    services: ['site_institucional'], approach_angle: null, ...o,
  });
  reply(
    [
      {
        type: 'tool_use',
        id: 'toolu_stub_leads',
        name: 'guardar_empresas',
        input: {
          empresas: [
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
          ],
        },
      },
    ],
    'tool_use',
  );
}

export async function startStubs() {
  const anthropic = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if ((body.tools ?? []).some((t: { name?: string }) => t.name === 'guardar_empresas')) {
        leadSearch(body, res);
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

  const servers = await Promise.all([listen(anthropic, 4621), listen(geocoder, 4620)]);
  return () => servers.forEach((s) => s?.close());
}
