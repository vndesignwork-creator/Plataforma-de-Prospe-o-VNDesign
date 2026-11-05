'use client';

/**
 * 🎤 Ditar: o reconhecimento de voz do próprio browser (Chrome, Edge, Safari;
 * no Android e no iPhone também), em português de Portugal. O que se diz vai
 * entrando no texto. Enquanto se dita: Pausa/Retomar, Concluir, Descartar (repõe
 * o texto como estava antes de começar) e a onda do som. Sem custos nem IA; o
 * áudio é tratado pelo browser. Onde não existe (ex.: Firefox), grava o áudio e passa-o
 * a texto com a chave da OpenAI (Definições → IA), ao Concluir; sem essa chave, não aparece.
 */
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Mic, Pause, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { appendDictation, newDictationPart } from '@/lib/dictation';
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

/** Este browser grava áudio? (Para o Ditar com transcrição, onde não há reconhecimento de voz.) */
function useRecordingSupported(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
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

type Phase = 'idle' | 'listening' | 'paused' | 'sending';

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
  const recordable = useRecordingSupported();
  // Sem reconhecimento de voz no browser: grava e transcreve, se houver chave da OpenAI.
  const fallback = useQuery({
    queryKey: ['transcribe-available'],
    queryFn: () => api<{ data: { available: boolean } }>('/ai/transcribe').then((r) => r.data.available),
    enabled: !supported && recordable,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const engine: 'speech' | 'record' | null = supported ? 'speech' : recordable && fallback.data ? 'record' : null;
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mediaMode = useRef<'finish' | 'discard'>('finish');
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
      mediaMode.current = 'discard';
      if (media.current && media.current.state !== 'inactive') media.current.stop();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  if (!engine) return null;

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'pt-PT';
    r.continuous = true;
    r.interimResults = true;
    // Cada frase final entra uma só vez (o Android repete resultados e frases já ditas).
    const handled = new Set<number>();
    let committed = '';
    r.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        if (result.isFinal) {
          if (handled.has(i)) continue;
          handled.add(i);
          const part = newDictationPart(committed, result[0].transcript);
          committed = part.committed;
          if (part.add) live.current?.insert(part.add);
        } else partial += result[0].transcript;
      }
      // A frase a meio, sem o que já entrou (no Android vem com o que já foi dito).
      setInterim(partial && committed ? newDictationPart(committed, partial).add : partial);
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

  async function startRecording() {
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Sem acesso ao microfone: toca no cadeado ao lado do endereço → Microfone → Permitir, e tenta outra vez.');
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
    chunks.current = [];
    mediaMode.current = 'finish';
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      s.getTracks().forEach((t) => t.stop());
      if (mediaMode.current === 'discard') return;
      const mime = r.mimeType || 'audio/webm';
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      void transcribe(new File([new Blob(chunks.current, { type: mime })], `ditado.${ext}`, { type: mime }));
    };
    r.start(1000);
    media.current = r;
    setStream(s);
    elapsed.current = { before: 0, since: Date.now() };
    setSeconds(0);
    setP('listening');
    tick();
  }

  async function transcribe(file: File) {
    setP('sending');
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/v1/ai/transcribe', { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, payload ?? { type: 'about:blank', title: 'Não foi possível passar a texto', status: res.status });
      const spoken = (payload as { data: { text: string } }).data.text;
      if (spoken.trim()) live.current?.insert(spoken);
      else toast('Não se ouviu nada.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      if (phaseRef.current === 'sending') setP('idle');
    }
  }

  function start() {
    if (engine === 'record') {
      before.current = live.current?.snapshot() ?? '';
      produced.current = before.current;
      void startRecording();
      return;
    }
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
    if (engine === 'record') media.current?.pause();
    else rec.current?.stop();
  }

  function resume() {
    setP('listening');
    elapsed.current.since = Date.now();
    restarts.current = [];
    tick();
    if (engine === 'record') media.current?.resume();
    else listen();
  }

  function finish() {
    if (engine === 'record') {
      stopClock();
      mediaMode.current = 'finish';
      // A transcrição começa quando o gravador entrega o áudio (onstop).
      setP('sending');
      media.current?.stop();
      media.current = null;
      setStream(null);
      return;
    }
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
    if (engine === 'record') {
      // Nada entrou no texto ainda: só deita a gravação fora.
      mediaMode.current = 'discard';
      media.current?.stop();
      media.current = null;
      releaseMic();
      toast('Ditado descartado.');
      return;
    }
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

  if (phase === 'sending') {
    return (
      <span role="status" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-muted', size === 'sm' ? 'h-8' : 'h-9', className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A passar a texto…
      </span>
    );
  }

  const paused = phase === 'paused';
  const recording = engine === 'record';
  const ctl = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors';
  const status = (
    <span role="status" className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium tabular', paused ? 'text-warning' : 'text-danger')}>
      {paused ? <Pause className="h-3 w-3" aria-hidden /> : <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />}
      <span className={size === 'sm' ? 'sr-only' : undefined}>{paused ? 'Em pausa' : recording ? 'A gravar' : 'A ouvir'}</span> {fmt(seconds)}
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
        {interim ? (
          <em>{interim}…</em>
        ) : paused ? (
          'Em pausa: Retomar para continuar, Concluir para acabar.'
        ) : recording ? (
          'A gravar: o texto aparece na caixa quando carregares em Concluir.'
        ) : (
          'Fala à vontade: o texto vai entrando na caixa.'
        )}
      </p>
    </div>
  );
}
