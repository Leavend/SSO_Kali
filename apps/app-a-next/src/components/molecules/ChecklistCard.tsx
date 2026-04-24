type ChecklistCardProps = {
  readonly label: string;
  readonly value: string;
};

export function ChecklistCard({ label, value }: ChecklistCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-app-line bg-white/5 p-5">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-app-muted">{label}</p>
      <p className="mt-3 text-sm leading-7 text-app-ink">{value}</p>
    </article>
  );
}
