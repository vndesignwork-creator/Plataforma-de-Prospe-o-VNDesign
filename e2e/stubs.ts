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

export async function startStubs() {
  const anthropic = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
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
