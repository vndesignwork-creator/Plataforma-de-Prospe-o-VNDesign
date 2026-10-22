/**
 * Som de aviso do Pomodoro: um só toque, gerado com Web Audio (sem ficheiros).
 * Os browsers só deixam tocar som depois de um clique na página, por isso o
 * contexto de áudio "desbloqueia-se" no primeiro clique e fica guardado.
 */
import type { PomodoroSound } from '@vndesign/core';

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

interface Tone {
  /** Múltiplo da frequência base. */
  ratio: number;
  level: number;
  type?: OscillatorType;
}

/** Um toque: parciais com ataque e queda (e, opcionalmente, a frequência a deslizar). */
function hit(
  c: AudioContext,
  { freq, partials, attack, decay, volume, glideTo }: { freq: number; partials: Tone[]; attack: number; decay: number; volume: number; glideTo?: number },
) {
  const t = c.currentTime + 0.03;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(volume, t + attack);
  out.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  out.connect(c.destination);
  for (const p of partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = p.type ?? 'sine';
    osc.frequency.setValueAtTime(freq * p.ratio, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo * p.ratio, t + Math.min(decay, 0.25));
    g.gain.value = p.level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }
}

const SOUNDS: Record<PomodoroSound, (c: AudioContext) => void> = {
  // Sino claro, com a cauda longa.
  sino: (c) => hit(c, { freq: 880, partials: [{ ratio: 1, level: 1 }, { ratio: 2.76, level: 0.2 }, { ratio: 5.4, level: 0.06 }], attack: 0.01, decay: 2.2, volume: 0.35 }),
  // Taça tibetana: grave, com batimento lento e muito longa.
  taca: (c) => hit(c, { freq: 294, partials: [{ ratio: 1, level: 1 }, { ratio: 1.006, level: 0.8 }, { ratio: 2.71, level: 0.25 }], attack: 0.05, decay: 4.5, volume: 0.32 }),
  // Bloco de madeira: seco e curto.
  madeira: (c) => hit(c, { freq: 820, partials: [{ ratio: 1, level: 1, type: 'triangle' }, { ratio: 2.4, level: 0.3 }], attack: 0.003, decay: 0.18, volume: 0.5 }),
  // Digital: um "bip" suave.
  digital: (c) => hit(c, { freq: 1046.5, partials: [{ ratio: 1, level: 0.6, type: 'square' }], attack: 0.01, decay: 0.35, volume: 0.12 }),
  // Gota: o tom desce depressa.
  gota: (c) => hit(c, { freq: 1500, glideTo: 520, partials: [{ ratio: 1, level: 1 }], attack: 0.005, decay: 0.45, volume: 0.4 }),
  // Marimba: quente, média duração.
  marimba: (c) => hit(c, { freq: 523.25, partials: [{ ratio: 1, level: 1 }, { ratio: 4, level: 0.12 }, { ratio: 10, level: 0.02 }], attack: 0.004, decay: 0.9, volume: 0.45 }),
};

/** Toca o som escolhido (um toque). Devolve false se o browser ainda não deixou tocar. */
export function playChime(sound: PomodoroSound = 'sino'): boolean {
  try {
    const c = audioContext();
    if (!c) return false;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    (SOUNDS[sound] ?? SOUNDS.sino)(c);
    return c.state !== 'suspended';
  } catch {
    return false;
  }
}
