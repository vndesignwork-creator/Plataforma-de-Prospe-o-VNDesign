'use client';

/**
 * 🎤 Ditar: o reconhecimento de voz do próprio browser (Chrome, Edge, Safari;
 * no Android e no iPhone também), em português de Portugal. Cada frase
 * reconhecida junta-se ao texto. Sem custos nem IA; o áudio é tratado pelo
 * browser. Onde não existe (ex.: Firefox), o botão não aparece.
 */
import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

export function DictateButton({ onText, className, size = 'md' }: { onText: (spoken: string) => void; className?: string; size?: 'sm' | 'md' }) {
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  // Ao sair (fechar a janela), pára de ouvir.
  useEffect(() => () => rec.current?.abort(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'pt-PT';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        if (result.isFinal) onTextRef.current(result[0].transcript);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.error('Sem acesso ao microfone: autoriza-o nas definições do browser.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error('O ditado parou. Tenta outra vez.');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={listening ? 'Parar o ditado' : 'Ditar (falar em vez de escrever)'}
      title={listening ? 'A ouvir… toca para parar' : 'Ditar'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors',
        size === 'sm' ? 'h-8 px-2' : 'h-9 px-2.5',
        listening ? 'animate-pulse border-danger bg-danger-soft text-danger' : 'border-border text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
      <span className={size === 'sm' ? 'sr-only' : 'max-sm:sr-only'}>{listening ? 'A ouvir…' : 'Ditar'}</span>
    </button>
  );
}
