/**
 * Pedir indicação: um cliente satisfeito é a forma mais barata de arranjar
 * trabalho. Depois de entregar, pede-se a indicação; e quando um lead novo
 * vem de alguém, fica registado quem o indicou ("referred_by").
 */
export const REFERRAL_TEMPLATE = 'Pedir indicação';

/** Dias depois da entrega a partir dos quais faz sentido pedir (deixa assentar). */
export const REFERRAL_AFTER_DAYS = 7;

/** O email pronto, em português, para rever antes de enviar. */
export function buildReferralEmail(input: {
  company: string;
  contact: string | null;
  project: string | null;
  signature: string | null;
}): { subject: string; body: string } {
  const project = input.project ? `o ${input.project}` : 'o trabalho que fizemos';
  const lines = [
    input.contact ? `Olá ${input.contact.split(' ')[0]},` : 'Boa tarde,',
    '',
    `Espero que ${project} esteja a dar o que precisava.`,
    '',
    'Tenho espaço para mais um ou dois projetos este mês e, por experiência, os melhores clientes chegam sempre por indicação de quem já trabalhou comigo.',
    '',
    'Se conhecer alguém que precise de um site, de imagem ou de material gráfico, era um grande favor passar-lhe o meu contacto (ou dizer-me o nome, que eu falo com cuidado e sem pressão).',
    '',
    'Obrigado e às ordens,',
  ];
  return {
    subject: `Um favor pequeno · ${input.company}`,
    body: `${lines.join('\n')}${input.signature ? `\n${input.signature}` : ''}`,
  };
}

/** "Já indicou 2 clientes" / "Já indicou 1 cliente" / null. */
export function referralCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return `Já indicou ${count} ${count === 1 ? 'cliente' : 'clientes'}`;
}
