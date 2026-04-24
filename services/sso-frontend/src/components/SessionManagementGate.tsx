import type { ReactNode } from "react";

type SessionManagementGateProps = {
  readonly allowed: boolean;
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
};

export default function SessionManagementGate(props: SessionManagementGateProps) {
  if (props.allowed) {
    return <>{props.children}</>;
  }

  return (
    <>
      {props.fallback ?? (
        <span className="text-xs font-medium text-muted">
          Restricted
        </span>
      )}
    </>
  );
}
