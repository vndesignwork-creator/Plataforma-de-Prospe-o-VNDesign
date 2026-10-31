/**
 * Uma imagem da própria plataforma (foto do perfil, logótipo da assinatura) como
 * ficheiro, para a reaproveitar noutro sítio — passa pelos mesmos passos de
 * preparação e envio que uma imagem escolhida do computador.
 */
export async function imageFileFromUrl(url: string, name: string): Promise<File> {
  const res = await fetch(url, { credentials: 'same-origin' }).catch(() => null);
  if (!res?.ok) throw new Error('Não foi possível ler a imagem. Tenta outra vez.');
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Não foi possível ler a imagem. Tenta outra vez.');
  return new File([blob], name, { type: blob.type });
}
