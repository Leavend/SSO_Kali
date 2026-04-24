"use client";

import { buildAdminLoginHref } from "@/lib/admin-login-url";

type ReAuthInterstitialProps = {
  readonly open: boolean;
  readonly returnTo: string;
  readonly onClose: () => void;
  readonly title?: string;
  readonly description?: string;
};

export default function ReAuthInterstitial(props: ReAuthInterstitialProps) {
  if (!props.open) {
    return null;
  }

  const loginHref = buildAdminLoginHref(props.returnTo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4">
      <div
        aria-labelledby="reauth-title"
        aria-modal="true"
        className="w-full max-w-md rounded-[28px] border border-warning/20 bg-card p-7 shadow-2xl"
        role="dialog"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft font-mono text-xs font-bold uppercase tracking-[0.24em] text-warning">
          Step-Up
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-ink" id="reauth-title">
          {props.title ?? "Re-authentication Required"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {props.description ?? "This action needs a fresher admin session. Verify your identity again before continuing."}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <a
            className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            href={loginHref}
          >
            Verify Identity Again
          </a>
          <button
            className="rounded-xl bg-card-hover px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-line"
            onClick={props.onClose}
            type="button"
          >
            Stay on This Page
          </button>
        </div>
      </div>
    </div>
  );
}
