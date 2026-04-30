type SignalPillProps = {
  readonly text: string;
};

export function SignalPill({ text }: SignalPillProps) {
  return (
    <span className="w-fit rounded-xl border border-app-accent/20 bg-app-accent-soft px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-app-accent">
      {text}
    </span>
  );
}
