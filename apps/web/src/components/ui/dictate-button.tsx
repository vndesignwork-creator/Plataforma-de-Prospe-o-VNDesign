'use client';

/**
 * 🎤 Ditar: o reconhecimento de voz do próprio browser (Chrome, Edge, Safari;
 * no Android e no iPhone também), em português de Portugal. O que se diz vai
 * entrando no texto. Enquanto se dita: Pausa/Retomar, Concluir, Descartar (repõe
 * o texto como estava antes de começar) e a onda do som. Sem custos nem IA; o
 * áudio é tratado pelo browser. Onde não existe (ex.: Firefox), o botão não aparece.
 */
import { Check, Mic, Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { appendDictation } from '@/lib/dictation';
import { cn } from '@/lib/utils';
import { AudioWaveform } from './audio-waveform';

export { appendDictation } from '@/lib/dictation';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
/** Há ditado neste browser? (false no servidor, para não haver diferenças ao hidratar.) */
export function useDictationSupported(): boolean {
  return useSyncExternalStore(noop, () => !!recognitionCtor(), () => false);
}

/** Para campos que não são texto simples (ex.: o editor do email). */
export interface DictateTarget {
  /** Junta uma frase reconhecida (no sítio do cursor ou no fim). */
  insert: (spoken: string) => void;
  /** O conteúdo atual (para Descartar o repor). */
  snapshot: () => string;
  restore: (value: string) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type Phase = 'idle' | 'listening' | 'paused';

export function DictateButton({
  value,
  onChange,
  max,
  target,
  className,
  size = 'md',
}: {
  /** Campo de texto simples: o ditado junta-se a `value` e sai por `onChange`. */
  value?: string;
  onChange?: (value: string) => void;
  max?: number;
  /** Em vez de value/onChange (ex.: editor de texto com formatação). */
  target?: DictateTarget;
  className?: string;
  /** "sm": controlos compactos numa linha (barras de botões); "md": painel com nomes. */
  size?: 'sm' | 'md';
}) {
  const supported = useDictationSupported();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [interim, setInterim] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const rec = useRef<Recognition | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useRef({ before: 0, since: 0 });
  // Para Descartar: o texto antes de começar e o último que o ditado deixou.
  const before = useRef('');
  const produced = useRef('');
  const restarts = useRef<number[]>([]);

  // O alvo mais recente. No texto simples guarda-se o valor aqui também: duas frases seguidas
  // (antes de o campo atualizar) não se perdem.
  const text = useRef(value ?? '');
  useEffect(() => {
    text.current = value ?? '';
  }, [value]);
  const live = useRef<DictateTarget | null>(null);
  useEffect(() => {
    live.current =
      target ??
      (onChange
        ? {
            insert: (spoken) => {
              const next = appendDictation(text.current, spoken);
              text.current = max ? next.slice(0, max) : next;
              produced.current = text.current;
              onChange(text.current);
            },
            snapshot: () => text.current,
            restore: (v) => {
              text.current = v;
              onChange(v);
            },
          }
        : null);
  });

  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  function tick() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds(Math.floor((elapsed.current.before + Date.now() - elapsed.current.since) / 1000)), 250);
  }
  function stopClock() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  function releaseMic() {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }

  // Ao sair (fechar a janela): pára de ouvir e larga o microfone; o que já foi ditado fica.
  useEffect(
    () => () => {
      phaseRef.current = 'idle';
      rec.current?.abort();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  if (!supported) return null;

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'pt-PT';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        if (result.isFinal) live.current?.insert(result[0].transcript);
        else partial += result[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Sem acesso ao microfone: toca no cadeado ao lado do endereço → Microfone → Permitir, e tenta outra vez.');
        finish();
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error('O ditado parou. Tenta outra vez.');
    };
    r.onend = () => {
      setInterim('');
      if (rec.current !== r || phaseRef.current !== 'listening') return;
      // O browser pára sozinho depois de um silêncio: continua a ouvir (a não ser que pare sem parar).
      const now = Date.now();
      restarts.current = [...restarts.current.filter((t) => now - t < 5000), now];
      if (restarts.current.length > 4) {
        toast.error('O ditado parou. Tenta outra vez.');
        finish();
        return;
      }
      listen();
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      finish();
    }
  }

  function start() {
    before.current = live.current?.snapshot() ?? '';
    produced.current = before.current;
    restarts.current = [];
    elapsed.current = { before: 0, since: Date.now() };
    setSeconds(0);
    setP('listening');
    tick();
    listen();
    // A onda precisa do microfone à parte: só no computador (no telemóvel, dois ao mesmo tempo falham).
    if (window.matchMedia?.('(pointer: fine)').matches && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => (phaseRef.current === 'idle' ? s.getTracks().forEach((t) => t.stop()) : setStream(s)))
        .catch(() => undefined);
    }
  }

  function pause() {
    setP('paused');
    stopClock();
    elapsed.current.before += Date.now() - elapsed.current.since;
    rec.current?.stop();
  }

  function resume() {
    setP('listening');
    elapsed.current.since = Date.now();
    restarts.current = [];
    tick();
    listen();
  }

  function finish() {
    setP('idle');
    stopClock();
    // stop() (não abort): as últimas palavras ainda entram.
    rec.current?.stop();
    setInterim('');
    releaseMic();
  }

  function discard() {
    const t = live.current;
    // Só no texto simples se sabe se escreveram por cima do ditado.
    const edited = !target && !!t && t.snapshot() !== produced.current;
    if (edited && !window.confirm('Descartar o ditado repõe o texto como estava antes de começares (também o que escreveste entretanto). Continuar?')) return;
    setP('idle');
    stopClock();
    rec.current?.abort();
    rec.current = null;
    setInterim('');
    releaseMic();
    t?.restore(before.current);
    toast('Ditado descartado.');
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        aria-label="Ditar (falar em vez de escrever)"
        title="Ditar"
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg',
          size === 'sm' ? 'h-8 px-2' : 'h-9 px-2.5',
          className,
        )}
      >
        <Mic className="h-4 w-4" aria-hidden />
        <span className={size === 'sm' ? 'sr-only' : 'max-sm:sr-only'}>Ditar</span>
      </button>
    );
  }

  const paused = phase === 'paused';
  const ctl = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors';
  const status = (
    <span role="status" className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium tabular', paused ? 'text-warning' : 'text-danger')}>
      {paused ? <Pause className="h-3 w-3" aria-hidden /> : <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />}
      <span className={size === 'sm' ? 'sr-only' : undefined}>{paused ? 'Em pausa' : 'A ouvir'}</span> {fmt(seconds)}
    </span>
  );
  const wave = stream ? (
    <AudioWaveform stream={stream} paused={paused} bar={2} gap={2} className={size === 'sm' ? 'h-7 w-16 shrink-0 sm:w-24' : 'h-8 w-full rounded-md bg-surface'} />
  ) : !paused ? (
    // Sem onda (telemóvel): umas barras a mexer, para se ver que está a ouvir.
    <span aria-hidden className="flex h-6 items-center gap-0.5 text-accent">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="w-0.5 animate-pulse rounded-full bg-current" style={{ height: `${[40, 80, 55, 90, 45][i]}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  ) : null;
  const buttons = (
    <>
      <button
        type="button"
        onClick={paused ? resume : pause}
        aria-label={paused ? 'Retomar o ditado' : 'Pausar o ditado'}
        title={paused ? 'Retomar' : 'Pausa'}
        className={cn(ctl, 'border-border hover:bg-surface-2', size === 'sm' ? 'h-8 w-8' : 'h-8 px-2.5')}
      >
        {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        {size === 'md' ? (paused ? 'Retomar' : 'Pausa') : null}
      </button>
      <button
        type="button"
        onClick={finish}
        aria-label="Concluir o ditado"
        title="Concluir (o texto fica)"
        className={cn(ctl, 'border-success/50 text-success hover:bg-success/10', size === 'sm' ? 'h-8 w-8' : 'h-8 px-2.5')}
      >
        <Check className="h-4 w-4" aria-hidden />
        {size === 'md' ? 'Concluir' : null}
      </button>
      <button
        type="button"
        onClick={discard}
        aria-label="Descartar o ditado"
        title="Descartar (repõe o texto de antes)"
        className={cn(ctl, 'border-transparent text-danger hover:bg-danger-soft', size === 'sm' ? 'h-8 w-8' : 'h-8 px-2.5')}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {size === 'md' ? 'Descartar' : null}
      </button>
    </>
  );

  if (size === 'sm') {
    return (
      <div role="group" aria-label="Ditado" className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-danger/40 bg-danger-soft/40 px-1.5 py-0.5', className)}>
        {status}
        {wave}
        {buttons}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Ditado" className={cn('flex w-full flex-col gap-2 rounded-lg border border-danger/40 bg-surface-2 p-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {buttons}
        <span className="ml-auto">{status}</span>
      </div>
      {wave}
      <p className="min-h-5 text-xs text-muted" aria-live="off">
        {interim ? <em>{interim}…</em> : paused ? 'Em pausa: Retomar para continuar, Concluir para acabar.' : 'Fala à vontade: o texto vai entrando na caixa.'}
      </p>
    </div>
  );
}
