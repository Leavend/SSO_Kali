import { formatDateTime } from "@/lib/format";

type SessionTimeDisplayProps = {
  readonly value: string;
};

export default function SessionTimeDisplay({ value }: SessionTimeDisplayProps) {
  return (
    <span className="font-mono text-xs text-muted">
      {formatDateTime(value)}
    </span>
  );
}
