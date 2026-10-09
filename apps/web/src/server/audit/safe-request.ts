/**
 * Pedidos HTTP para sites de terceiros com proteção contra SSRF: só http/https,
 * portas 80/443, nunca endereços internos (verificado em cada ligação, também
 * depois de redirecionamentos), tempo e tamanho limitados.
 * Em desenvolvimento/testes, AUDIT_ALLOW_PRIVATE=1 permite localhost.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 VNDesignAuditor/1.0';

const allowPrivate = () => process.env.AUDIT_ALLOW_PRIVATE === '1';

const BLOCKED = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
] as const) {
  BLOCKED.addSubnet(net6, prefix, 'ipv6');
}

/** Endereço interno/reservado (não pode ser analisado)? */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED.check(ip, 'ipv4');
  if (family === 6) return BLOCKED.check(ip, 'ipv6');
  return true;
}

export class AuditRequestError extends Error {
  constructor(
    public code: 'blocked' | 'dns' | 'refused' | 'timeout' | 'reset' | 'redirects' | 'protocol' | 'other',
    message: string,
  ) {
    super(message);
  }
}

const blockedError = () => new AuditRequestError('blocked', 'Endereço interno ou porta não permitida — não é possível analisar.');

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup que recusa endereços internos (usado em cada ligação). */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as dns.LookupAddress[];
    if (!list.length) return callback(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), '');
    if (!allowPrivate() && list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error('blocked'), { code: 'EVND_BLOCKED' }), '');
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

/** Valida protocolo, porta e (se for um IP) o endereço. */
export function assertAllowedUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AuditRequestError('protocol', 'Só é possível analisar endereços http:// ou https://.');
  }
  if (url.username || url.password) throw blockedError();
  if (allowPrivate()) return;
  if (url.port && url.port !== '80' && url.port !== '443') throw blockedError();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) throw blockedError();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw blockedError();
  }
}

export interface CertificateInfo {
  valid: boolean;
  issuer: string | null;
  expires_at: string | null;
  error: string | null;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  response_ms: number;
  certificate: CertificateInfo | null;
}

const CERT_ERRORS: Record<string, string> = {
  CERT_HAS_EXPIRED: 'O certificado expirou.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificado autoassinado (não reconhecido pelos browsers).',
  SELF_SIGNED_CERT_IN_CHAIN: 'Certificado autoassinado na cadeia.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Cadeia de certificados incompleta.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'Cadeia de certificados incompleta.',
  CERT_NOT_YET_VALID: 'O certificado ainda não é válido.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'O certificado não corresponde a este domínio.',
};

function certificateInfo(socket: tls.TLSSocket, hostname: string): CertificateInfo {
  const cert = socket.getPeerCertificate();
  if (!cert || !Object.keys(cert).length) return { valid: false, issuer: null, expires_at: null, error: 'Sem certificado.' };
  let error: string | null = null;
  if (!socket.authorized) {
    const code = String(socket.authorizationError ?? '');
    error = CERT_ERRORS[code] ?? `Certificado inválido (${code || 'desconhecido'}).`;
  } else {
    const mismatch = tls.checkServerIdentity(hostname, cert);
    if (mismatch) error = CERT_ERRORS.ERR_TLS_CERT_ALTNAME_INVALID!;
  }
  const issuer = cert.issuer ? (cert.issuer.O ?? cert.issuer.CN ?? null) : null;
  const expires = cert.valid_to ? new Date(cert.valid_to) : null;
  return {
    valid: error === null,
    issuer: Array.isArray(issuer) ? (issuer[0] ?? null) : issuer,
    expires_at: expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : null,
    error,
  };
}

function decodeBody(buffer: Buffer, contentType: string | undefined): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const sniff = buffer.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const charset = (fromHeader ?? sniff ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function mapNetworkError(error: NodeJS.ErrnoException): AuditRequestError {
  if (error instanceof AuditRequestError) return error;
  switch (error.code) {
    case 'EVND_BLOCKED':
      return blockedError();
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'ENODATA':
      return new AuditRequestError('dns', 'O domínio não existe ou não tem DNS configurado.');
    case 'ECONNREFUSED':
      return new AuditRequestError('refused', 'O servidor recusou a ligação.');
    case 'ECONNRESET':
    case 'EPIPE':
      return new AuditRequestError('reset', 'A ligação foi interrompida pelo servidor.');
    case 'ETIMEDOUT':
      return new AuditRequestError('timeout', 'O site não respondeu a tempo.');
    default:
      return new AuditRequestError('other', `Não foi possível abrir o site (${error.code ?? error.message}).`);
  }
}

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<SafeResponse & { location?: string }> {
  assertAllowedUrl(url);
  const started = Date.now();
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: safeLookup as unknown as net.LookupFunction,
        rejectUnauthorized: false, // a validade do certificado é avaliada à parte
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'pt-PT,pt;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const responseMs = Date.now() - started;
        const certificate = url.protocol === 'https:' ? certificateInfo(res.socket as tls.TLSSocket, url.hostname) : null;
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ url: url.toString(), status, headers: res.headers, body: '', response_ms: responseMs, certificate, location: res.headers.location });
          return;
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip' || encoding === 'x-gzip'
            ? res.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? res.pipe(zlib.createInflate())
              : encoding === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () =>
          resolve({
            url: url.toString(),
            status,
            headers: res.headers,
            body: decodeBody(Buffer.concat(chunks), res.headers['content-type']),
            response_ms: responseMs,
            certificate,
          });
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            stream.removeAllListeners('data');
            req.destroy();
            finish();
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', finish);
        stream.on('error', () => finish());
      },
    );
    // Tempo total (inclui servidores que enviam a página muito devagar).
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', (error: NodeJS.ErrnoException) => reject(mapNetworkError(error)));
    req.end();
  });
}

/** GET com redirecionamentos manuais (cada salto é validado). */
export async function safeGet(
  input: string,
  { timeoutMs = 15_000, maxBytes = 2_000_000, maxRedirects = 5 } = {},
): Promise<SafeResponse> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AuditRequestError('protocol', 'Endereço inválido.');
  }
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AuditRequestError('timeout', 'O site não respondeu a tempo.');
    const res = await requestOnce(url, remaining, maxBytes);
    if (!res.location) return res;
    try {
      url = new URL(res.location, url);
    } catch {
      throw new AuditRequestError('redirects', 'Redirecionamento inválido.');
    }
  }
  throw new AuditRequestError('redirects', 'Demasiados redirecionamentos.');
}
