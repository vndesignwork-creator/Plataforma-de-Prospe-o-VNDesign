/** `narrow`: em ecrãs muito estreitos (< 400 px) só "VNDesign", para caber o relógio do pomodoro na barra do telemóvel. */
export function Logo({ className, narrow }: { className?: string; narrow?: boolean }) {
  return (
    // data-logo: o laranja do "VN" é a marca (os logótipos não têm requisito de contraste; o teste de acessibilidade ignora-o).
    <span data-logo className={`font-display text-lg font-bold tracking-tight ${className ?? ''}`}>
      <span className="text-accent">VN</span>Design<span className={narrow ? 'max-[399px]:hidden' : undefined}> </span>
      <span className={`font-semibold text-muted ${narrow ? 'max-[399px]:hidden' : ''}`}>Leads</span>
    </span>
  );
}
