'use client';

/**
 * Gravar a reunião no navegador (ou escolher um ficheiro de áudio) e passá-la a
 * texto no servidor. O áudio não fica guardado: só o texto volta.
 */
import { FileAudio, Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiClientError, errorMessage } from '@/lib/api-client';

const MAX_BYTES = 25 * 1024 * 1024;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Onda do som a passar (barras do volume dos últimos segundos); parada durante a pausa. */
function Waveform({ stream, paused }: { stream: MediaStream; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const el = canvas.current;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!el || !Ctx) return;
    const audio = new Ctx();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const BAR = 3;
    const GAP = 2;
    const levels: number[] = [];
    let frame = 0;
    let last = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 50) return;
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      const max = Math.floor(w / (BAR + GAP));
      if (!pausedRef.current) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += ((v - 128) / 128) ** 2;
        // Raiz da média (volume), ampliada para a fala normal encher a altura.
        levels.push(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        while (levels.length > max) levels.shift();
      }
      const g = el.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = getComputedStyle(el).color;
      g.globalAlpha = pausedRef.current ? 0.4 : 1;
      const start = w - levels.length * (BAR + GAP);
      levels.forEach((lvl, i) => {
        const bh = Math.max(2, lvl * (h - 4));
        g.beginPath();
        g.roundRect(start + i * (BAR + GAP), (h - bh) / 2, BAR, bh, 1.5);
        g.fill();
      });
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void audio.close();
    };
  }, [stream]);

  return <canvas ref={canvas} aria-hidden className="h-12 w-full rounded-md bg-surface-2 text-accent" />;
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'sending';
/** O que acontece ao terminar: mostrar o texto para rever, resumir logo ou deitar fora. */
type FinishMode = 'review' | 'summarize' | 'discard';
export interface RecorderControl {
  /** Termina a gravação (mesmo em pausa) e passa-a a texto; com "summarize", o diálogo resume logo. */
  finish: (mode: Exclude<FinishMode, 'discard'>) => void;
  /** Deita a gravação fora (pergunta antes, se tiver 1 minuto ou mais). Devolve false se a pessoa desistir. */
  discard: () => boolean;
}

export function MeetingRecorder({
  leadId,
  onText,
  onStateChange,
  control,
}: {
  leadId: string;
  onText: (text: string, summarize: boolean) => void;
  onStateChange?: (state: RecorderState) => void;
  control?: Ref<RecorderControl>;
}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  // A última gravação que não passou a texto (sem rede, sem chave…): para tentar outra vez sem a perder.
  const [failed, setFailed] = useState<{ file: File; summarize: boolean; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tempo gravado: o que já passou (antes das pausas) + desde que retomou.
  const elapsed = useRef({ before: 0, since: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => (failed ? () => URL.revokeObjectURL(failed.url) : undefined), [failed]);
  const mode = useRef<FinishMode>('review');
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      // Fechar a janela (Cancelar, X, Esc) a meio da gravação: deita-a fora, não a envia.
      mode.current = 'discard';
      if (timer.current) clearInterval(timer.current);
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const state: RecorderState = sending ? 'sending' : recording ? (paused ? 'paused' : 'recording') : 'idle';
  useEffect(() => onStateChange?.(state), [state, onStateChange]);
  useImperativeHandle(control, () => ({ finish: (m) => stop(m), discard }));

  async function send(file: File, summarize = false) {
    if (file.size > MAX_BYTES) {
      toast.error('A gravação tem mais de 25 MB. Corta-a em partes ou grava com menos qualidade.');
      return;
    }
    setSending(true);
    setFailed(null);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch(`/api/v1/leads/${leadId}/transcribe`, { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, payload ?? { type: 'about:blank', title: 'Não foi possível transcrever', status: res.status });
      onText((payload as { data: { text: string } }).data.text, summarize);
      if (!summarize) toast.success('Gravação passada a texto. Revê e carrega em Resumir.');
    } catch (error) {
      setFailed({ file, summarize, url: URL.createObjectURL(file) });
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mode.current === 'discard') {
          chunks.current = [];
          return;
        }
        const mime = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type: mime });
        void send(new File([blob], mime.includes('mp4') ? 'reuniao.m4a' : 'reuniao.webm', { type: mime }), mode.current === 'summarize');
      };
      mode.current = 'review';
      rec.start(1000);
      recorder.current = rec;
      setStream(stream);
      setSeconds(0);
      elapsed.current = { before: 0, since: Date.now() };
      setPaused(false);
      setRecording(true);
      tick();
    } catch {
      toast.error('Sem acesso ao microfone. Permite-o no navegador ou escolhe um ficheiro de áudio.');
    }
  }

  function tick() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds(Math.floor((elapsed.current.before + Date.now() - elapsed.current.since) / 1000)), 250);
  }

  function togglePause() {
    const rec = recorder.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      if (timer.current) clearInterval(timer.current);
      elapsed.current.before += Date.now() - elapsed.current.since;
      setPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      elapsed.current.since = Date.now();
      tick();
      setPaused(false);
    }
  }

  function discard(): boolean {
    if (seconds >= 60 && !window.confirm(`Deitar fora a gravação de ${fmt(seconds)}? Não fica guardada em lado nenhum.`)) return false;
    stop('discard');
    toast('Gravação descartada.');
    return true;
  }

  function stop(how: FinishMode = 'review') {
    mode.current = how;
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    setPaused(false);
    setStream(null);
    recorder.current?.stop();
    recorder.current = null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-4">
      <p className="text-sm text-muted">
        Grava a reunião aqui (com o telemóvel em cima da mesa, por exemplo) ou escolhe uma gravação que já tenhas. A plataforma passa-a a texto e depois a IA faz o
        resumo, as tarefas e o próximo passo. O áudio não fica guardado. Pede sempre autorização a quem estiver na reunião.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <>
            <Button variant="outline" onClick={togglePause}>
              {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />} {paused ? 'Retomar' : 'Pausa'}
            </Button>
            <Button variant="outline" onClick={() => stop('review')} title="Termina e mostra o texto para rever antes de resumir">
              <Square className="h-4 w-4 text-danger" aria-hidden /> Terminar ({fmt(seconds)})
            </Button>
            <Button variant="ghost" onClick={discard} className="text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" aria-hidden /> Descartar
            </Button>
          </>
        ) : (
          <Button onClick={() => void start()} disabled={!supported || sending}>
            <Mic className="h-4 w-4" aria-hidden /> Gravar
          </Button>
        )}
        {!recording ? (
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={sending} loading={sending}>
          <FileAudio className="h-4 w-4" aria-hidden /> {sending ? 'A passar a texto…' : 'Escolher ficheiro'}
        </Button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
            e.target.value = '';
          }}
        />
        {recording ? (
          paused ? (
            <span role="status" className="flex items-center gap-1.5 text-sm text-warning">
              <Pause className="h-3.5 w-3.5" aria-hidden /> Em pausa
            </span>
          ) : (
            <span role="status" className="flex items-center gap-1.5 text-sm text-danger">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden /> A gravar
            </span>
          )
        ) : null}
      </div>
      {recording && stream ? <Waveform stream={stream} paused={paused} /> : null}
      {!supported ? <p className="text-xs text-muted">Este navegador não grava áudio: escolhe um ficheiro.</p> : null}
      {failed && !recording && !sending ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm">
          <span className="flex-1">A gravação ({(failed.file.size / 1024 / 1024).toFixed(1)} MB) não passou a texto, mas não se perdeu.</span>
          <Button size="sm" variant="outline" onClick={() => void send(failed.file, failed.summarize)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Tentar outra vez
          </Button>
          <a href={failed.url} download={failed.file.name} className="text-xs text-accent-text underline">
            Guardar o áudio
          </a>
          <button type="button" className="text-xs text-muted underline" onClick={() => setFailed(null)}>
            Deitar fora
          </button>
        </div>
      ) : null}
      {recording ? <p className="text-xs text-muted">Carrega em Resumir (em baixo) para terminar e fazer logo o resumo, mesmo em pausa.</p> : null}
      <p className="text-xs text-muted">Precisa de uma chave da OpenAI em Definições → Inteligência artificial. Até 25 MB (cerca de 1h30).</p>
    </div>
  );
}
