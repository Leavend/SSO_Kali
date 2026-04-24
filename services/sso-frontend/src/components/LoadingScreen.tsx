type LoadingScreenProps = {
  title?: string;
  description?: string;
};

export default function LoadingScreen(props: LoadingScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft">
          <span className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-ink">
          {props.title ?? "Loading Admin Panel"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {props.description ?? "Preparing the latest admin data and session context."}
        </p>
      </div>
    </main>
  );
}
