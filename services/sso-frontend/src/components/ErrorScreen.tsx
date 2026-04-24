"use client";

type ErrorScreenProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export default function ErrorScreen(props: ErrorScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-danger/20 bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-2xl text-danger">
          ⚠
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">
          {props.title ?? "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {props.description ??
            "The admin panel hit an unexpected problem while rendering this page."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={props.onRetry}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-xl bg-card-hover px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-card"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
