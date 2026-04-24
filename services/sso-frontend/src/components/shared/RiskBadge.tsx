interface RiskBadgeProps {
  readonly score: number | undefined;
}

export default function RiskBadge({ score }: RiskBadgeProps) {
  if (typeof score !== "number") {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${palette(score)}`}>
      {score}
    </span>
  );
}

function palette(score: number): string {
  if (score >= 60) return "bg-danger-soft text-danger";
  if (score >= 40) return "bg-warning-soft text-warning";
  return "bg-success-soft text-success";
}
