import type { ReactNode } from "react";
import Link from "next/link";

type Tone = "danger" | "neutral";

type NoticeCardProps = {
  icon: string;
  title: string;
  description: string;
  tone?: Tone;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export default function NoticeCard(props: NoticeCardProps) {
  return (
    <div className={cardClassName(props.tone ?? "neutral")}>
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-card-hover text-2xl text-muted sm:size-16">
        {props.icon}
      </div>
      <p className={titleClassName(props.tone ?? "neutral")}>{props.title}</p>
      <p className={descriptionClassName(props.tone ?? "neutral")}>
        {props.description}
      </p>
      {props.children}
      {props.actionHref && props.actionLabel ? (
        <Link
          href={props.actionHref}
          className="mt-4 inline-flex rounded-lg bg-card px-3 py-2 text-xs font-medium text-ink transition-all duration-200 hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-accent"
        >
          {props.actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function cardClassName(tone: Tone): string {
  const palette =
    tone === "danger"
      ? "border-danger/20 bg-danger-soft"
      : "border-line bg-card";

  return `rounded-xl border p-8 text-center sm:p-12 ${palette}`;
}

function titleClassName(tone: Tone): string {
  return tone === "danger"
    ? "text-sm font-semibold text-danger"
    : "text-sm font-medium text-ink";
}

function descriptionClassName(tone: Tone): string {
  return tone === "danger"
    ? "mt-1 text-xs text-danger/80"
    : "mt-1 text-xs text-muted";
}
