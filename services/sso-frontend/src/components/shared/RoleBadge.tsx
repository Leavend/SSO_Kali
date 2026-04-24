interface RoleBadgeProps {
  readonly role: string;
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  const palette = role === "admin"
    ? "bg-accent-soft text-accent"
    : "bg-card-hover text-muted";

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${palette}`}>
      {role}
    </span>
  );
}
