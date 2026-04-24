import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: string;
  message: string;
  description: string;
  actionNode?: ReactNode;
};

export default function EmptyState(props: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-card-hover text-2xl text-muted">
        {props.icon}
      </div>
      <h2 className="mt-5 text-base font-semibold text-ink">{props.message}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        {props.description}
      </p>
      {props.actionNode ? <div className="mt-5">{props.actionNode}</div> : null}
    </div>
  );
}
