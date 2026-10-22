/**
 * Som de aviso do Pomodoro (sem ficheiros: gerado com Web Audio).
 * Os browsers só deixam tocar som depois de um clique na página, por isso o
 * contexto de áudio "desbloqueia-se" no primeiro clique e fica guardado.
 */
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx ??= new Ctx();
  return ctx;
}

/** Chamar num clique/toque: autoriza o som para os avisos seguintes. */
export function unlockSound(): void {
  try {
    const c = audioContext();
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
  } catch {
    // Sem áudio neste browser.
  }
}

/** Uma nota de sino: ataque rápido e cauda longa, com um harmónico suave. */
function bell(c: AudioContext, freq: number, at: number, volume: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
  gain.connect(c.destination);
  for (const [mult, level] of [
    [1, 1],
    [2.76, 0.18],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(at);
    osc.stop(at + 1.7);
  }
}

/**
 * Aviso de fim de fase: "break" (acabou o trabalho → descansar) desce,
 * "work" (acabou a pausa → voltar ao trabalho) sobe. Toca duas vezes.
 */
export function playChime(kind: 'break' | 'work' = 'break'): boolean {
  try {
    const c = audioContext();
    if (!c) return false;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const notes = kind === 'break' ? [1046.5, 784, 659.3] : [659.3, 784, 1046.5];
    const t0 = c.currentTime + 0.05;
    for (const round of [0, 1.9]) notes.forEach((f, i) => bell(c, f, t0 + round + i * 0.28, 0.32));
    return c.state !== 'suspended';
  } catch {
    return false;
  }
}
