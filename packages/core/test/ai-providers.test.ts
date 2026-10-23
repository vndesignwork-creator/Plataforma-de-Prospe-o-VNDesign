import { describe, expect, it } from 'vitest';
import { AiProviderCreateSchema, extractJson } from '../src/ai-providers';
import { WorkspaceSettingsSchema } from '../src/schemas';

describe('fornecedores de IA', () => {
  it('lê o JSON da resposta: sozinho, em ```json``` ou com texto à volta', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Aqui está:\n```json\n{"empresas":[]}\n```')).toEqual({ empresas: [] });
    expect(extractJson('Resultado: {"subject":"Olá","body":"x"} — fim')).toEqual({ subject: 'Olá', body: 'x' });
    expect(extractJson('sem json nenhum')).toBeNull();
  });

  it('valida a chave e exige o endereço no "Outro"', () => {
    expect(AiProviderCreateSchema.safeParse({ kind: 'openai', api_key: 'sk-curta' }).success).toBe(false);
    expect(AiProviderCreateSchema.safeParse({ kind: 'openai', api_key: 'sk-com espaco-123456' }).success).toBe(false);
    expect(AiProviderCreateSchema.safeParse({ kind: 'custom', api_key: 'gsk-1234567890' }).success).toBe(false);
    const ok = AiProviderCreateSchema.parse({ kind: 'custom', api_key: ' gsk-1234567890 ', base_url: 'https://api.groq.com/openai/v1/' });
    expect(ok).toEqual({ kind: 'custom', api_key: 'gsk-1234567890', base_url: 'https://api.groq.com/openai/v1' });
  });

  it('definições antigas ficam com a chave do servidor', () => {
    expect(WorkspaceSettingsSchema.parse({}).ai).toEqual({
      email: { provider: 'server', model: null },
      lead_generation: { provider: 'server', model: null },
      visibility: { provider: 'server', model: null },
    });
  });
});
