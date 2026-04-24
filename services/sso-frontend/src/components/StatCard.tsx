export type StatColor = "accent" | "success" | "warning";

export interface StatCardProps {
  readonly label: string;
  readonly value: number | string;
  readonly color: StatColor;
}

const cardPalette: Record<StatColor, string> = {
  accent: "border-accent/20 bg-accent-soft",
  success: "border-success/20 bg-success-soft",
  warning: "border-warning/20 bg-warning-soft",
};

const dotPalette: Record<StatColor, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
};

const valuePalette: Record<StatColor, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
};

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 sm:p-6 ${cardPalette[color]}`}
      role="status"
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block size-2 rounded-full ${dotPalette[color]} animate-pulse`}
          aria-hidden="true"
        />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/70 sm:text-xs">
          {label}
        </p>
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight sm:mt-3 sm:text-4xl ${valuePalette[color]}`}>
        {value}
      </p>
    </div>
  );
}
