type ClientBadgeProps = {
  readonly clientId: string;
};

export default function ClientBadge({ clientId }: ClientBadgeProps) {
  return (
    <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-medium text-accent">
      {clientId}
    </span>
  );
}
