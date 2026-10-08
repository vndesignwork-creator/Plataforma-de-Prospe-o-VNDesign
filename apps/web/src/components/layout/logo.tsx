export function Logo({ className }: { className?: string }) {
  return (
    <span className={`font-display text-lg font-bold tracking-tight ${className ?? ''}`}>
      <span className="text-accent">VN</span>Design <span className="font-semibold text-muted">Leads</span>
    </span>
  );
}
