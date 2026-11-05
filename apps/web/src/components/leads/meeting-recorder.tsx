'use client';

/**
 * Gravar a reunião no navegador (ou escolher um ficheiro de áudio) e passá-la a
 * texto no servidor. O áudio não fica guardado: só o texto volta.
 */
import { FileAudio, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiClientError, errorMessage } from '@/lib/api-client';

const MAX_BYTES = 25 * 1024 * 1024;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function MeetingRecorder({ leadId, onText }: { leadId: string; onText: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function send(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('A gravação tem mais de 25 MB. Corta-a em partes ou grava com menos qualidade.');
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch(`/api/v1/leads/${leadId}/transcribe`, { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, payload ?? { type: 'about:blank', title: 'Não foi possível transcrever', status: res.status });
      onText((payload as { data: { text: string } }).data.text);
      toast.success('Gravação passada a texto. Revê e carrega em Resumir.');
    } catch (error) {
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
        const mime = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type: mime });
        void send(new File([blob], mime.includes('mp4') ? 'reuniao.m4a' : 'reuniao.webm', { type: mime }));
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('Sem acesso ao microfone. Permite-o no navegador ou escolhe um ficheiro de áudio.');
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
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
          <Button variant="outline" onClick={stop}>
            <Square className="h-4 w-4 text-danger" aria-hidden /> Parar ({fmt(seconds)})
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={!supported || sending}>
            <Mic className="h-4 w-4" aria-hidden /> Gravar
          </Button>
        )}
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={recording || sending} loading={sending}>
          <FileAudio className="h-4 w-4" aria-hidden /> {sending ? 'A passar a texto…' : 'Escolher ficheiro'}
        </Button>
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
          <span role="status" className="flex items-center gap-1.5 text-sm text-danger">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden /> A gravar
          </span>
        ) : null}
      </div>
      {!supported ? <p className="text-xs text-muted">Este navegador não grava áudio: escolhe um ficheiro.</p> : null}
      <p className="text-xs text-muted">Precisa de uma chave da OpenAI em Definições → Inteligência artificial. Até 25 MB (cerca de 1h30).</p>
    </div>
  );
}
