import type { ReactNode } from "react";

type RecordCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  details: ReactNode;
  footer?: ReactNode;
};

export default function RecordCard(props: RecordCardProps) {
  return (
    <article className="rounded-xl border border-line bg-card p-4 shadow-sm transition-all duration-200 hover:border-line hover:shadow-md hover:shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-1 break-all font-mono text-xs text-muted">{props.subtitle}</div>
          ) : null}
        </div>
        {props.badge ? <div className="shrink-0">{props.badge}</div> : null}
      </div>
      <div className="mt-4">{props.details}</div>
      {props.footer ? <div className="mt-4">{props.footer}</div> : null}
    </article>
  );
}
