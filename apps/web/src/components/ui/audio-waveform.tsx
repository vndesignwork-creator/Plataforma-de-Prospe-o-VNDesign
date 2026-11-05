'use client';

/** Onda do som do microfone (gravação da reunião e ditado). */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Onda do som a passar (barras do volume dos últimos segundos); parada durante a pausa. */
export function AudioWaveform({ stream, paused, className, bar = 3, gap = 2 }: { stream: MediaStream; paused: boolean; className?: string; bar?: number; gap?: number }) {
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
    const BAR = bar;
    const GAP = gap;
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
  }, [stream, bar, gap]);

  return <canvas ref={canvas} aria-hidden className={cn('text-accent', className)} />;
}
