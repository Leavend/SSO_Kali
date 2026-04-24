import { truncateId } from "@/lib/format";

type SessionIdDisplayProps = {
  readonly sessionId: string;
};

export default function SessionIdDisplay({ sessionId }: SessionIdDisplayProps) {
  return (
    <span className="cursor-help font-mono text-xs text-muted" title={sessionId}>
      {truncateId(sessionId)}
    </span>
  );
}
