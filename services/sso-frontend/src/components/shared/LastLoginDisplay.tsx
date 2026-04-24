import { formatRelative } from "@/lib/format";

interface LastLoginDisplayProps {
  readonly value: string | null;
}

export default function LastLoginDisplay({ value }: LastLoginDisplayProps) {
  if (!value) {
    return <span className="text-xs text-muted">Never</span>;
  }

  return (
    <span className="text-xs text-muted" title={new Date(value).toISOString()}>
      {formatRelative(value)}
    </span>
  );
}
