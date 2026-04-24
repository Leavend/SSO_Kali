type SignalPillProps = {
  readonly text: string;
};

export function SignalPill({ text }: SignalPillProps) {
  return (
    <span className="w-fit rounded-full border border-app-line bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-[0.24em] text-app-accent">
      {text}
    </span>
  );
}
