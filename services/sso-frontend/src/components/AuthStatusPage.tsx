import type { ReactNode } from "react";
import AuthExperienceShell from "@/components/AuthExperienceShell";

type AuthStatusPageProps = {
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly accent: "accent" | "danger" | "warning";
  readonly primaryAction: {
    readonly href: string;
    readonly label: string;
  };
  readonly secondaryAction?: {
    readonly href: string;
    readonly label: string;
  };
  readonly note?: string;
  readonly children?: ReactNode;
};

export default function AuthStatusPage(props: AuthStatusPageProps) {
  return (
    <AuthExperienceShell
      badge={props.badge}
      title={props.title}
      description={props.description}
      accent={props.accent}
      actions={buildActions(props)}
      {...withNote(props.note)}
    >
      {props.children}
    </AuthExperienceShell>
  );
}

function buildActions(props: AuthStatusPageProps) {
  return [
    {
      href: props.primaryAction.href,
      label: props.primaryAction.label,
      tone: "primary" as const,
    },
    ...(props.secondaryAction
      ? [{
          href: props.secondaryAction.href,
          label: props.secondaryAction.label,
          tone: "secondary" as const,
        }]
      : []),
  ];
}

function withNote(note: string | undefined) {
  return note ? { note } : {};
}
