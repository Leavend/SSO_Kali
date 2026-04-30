type ChecklistCardProps = {
  readonly label: string;
  readonly value: string;
};

export function ChecklistCard({ label, value }: ChecklistCardProps) {
  return (
    <article className="rounded-2xl border border-app-line bg-white/[0.04] p-5 transition-all hover:border-app-accent/20 hover:bg-white/[0.06]">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-app-muted">{label}</p>
      <p className="mt-3 break-all text-sm leading-7 text-app-ink">{value}</p>
    </article>
  );
}
