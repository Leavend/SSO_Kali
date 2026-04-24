import type { ReactNode } from "react";
import Link from "next/link";

type AuthAction = {
  readonly href: string;
  readonly label: string;
  readonly tone?: "primary" | "secondary";
};

type AuthExperienceShellProps = {
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly accent: "accent" | "danger" | "warning";
  readonly actions: readonly AuthAction[];
  readonly children?: ReactNode;
  readonly note?: string;
};

const accentStyles = {
  accent: {
    badge: "bg-accent-soft text-accent",
    frame: "border-line bg-card",
    glow: "from-accent/16 to-transparent",
  },
  danger: {
    badge: "bg-danger-soft text-danger",
    frame: "border-danger/20 bg-card",
    glow: "from-danger/12 to-transparent",
  },
  warning: {
    badge: "bg-warning-soft text-warning",
    frame: "border-warning/20 bg-card",
    glow: "from-warning/12 to-transparent",
  },
} as const;

export default function AuthExperienceShell(props: AuthExperienceShellProps) {
  const styles = accentStyles[props.accent];
  const isError = props.accent === "danger" || props.accent === "warning";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {/* Background gradient */}
      <div className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-from),_var(--tw-gradient-to)_38%)] ${styles.glow}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(241,245,249,0.08),_transparent_45%)]" />

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-xl animate-[fadeInUp_0.5s_ease-out] rounded-[28px] border p-6 text-center shadow-2xl sm:p-8 ${styles.frame}`}
        role={isError ? "alert" : "main"}
        aria-labelledby="auth-title"
        aria-describedby="auth-description"
      >
        {/* Badge */}
        <div
          className={`mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl text-lg font-bold sm:mb-6 sm:size-16 sm:text-sm ${styles.badge}`}
          aria-hidden="true"
        >
          <span className="font-mono uppercase tracking-[0.24em]">{props.badge}</span>
        </div>

        {/* Title */}
        <h1
          id="auth-title"
          className="text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          {props.title}
        </h1>

        {/* Description */}
        <p
          id="auth-description"
          className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted"
        >
          {props.description}
        </p>

        {/* Children (countdown timer, security expectations, etc) */}
        {props.children ? <div className="mt-6 sm:mt-8">{props.children}</div> : null}

        {/* Actions */}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:mt-8 sm:flex-row">
          {props.actions.map(renderAction)}
        </div>

        {/* Note */}
        {props.note ? (
          <p className="mx-auto mt-5 max-w-sm font-mono text-[10px] uppercase leading-4 tracking-[0.2em] text-muted sm:text-[11px] sm:tracking-[0.24em]">
            {props.note}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function actionClassName(tone: "primary" | "secondary"): string {
  return tone === "primary"
    ? "rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all duration-200 hover:bg-accent-hover hover:shadow-xl hover:shadow-accent/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    : "rounded-xl bg-card-hover px-5 py-3 text-sm font-semibold text-ink transition-all duration-200 hover:bg-line focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
}

function renderAction(action: AuthAction) {
  const className = actionClassName(action.tone ?? "secondary");

  return (
    <Link
      key={`${action.href}-${action.label}`}
      className={`${className} block text-center sm:flex-1`}
      href={action.href}
    >
      {action.label}
    </Link>
  );
}
