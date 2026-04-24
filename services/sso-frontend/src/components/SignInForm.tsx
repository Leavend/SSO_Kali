"use client";

import { useState, type FormEvent } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordResetHref = identityActionHref("/auth/password-reset", email);
  const registerHref = identityActionHref("/auth/register", email);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const params = new URLSearchParams({ login_hint: email.trim() });
    window.location.href = `/auth/login?${params.toString()}`;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {/* Theme toggle — above footer */}
      <div className="fixed bottom-14 right-5 z-50">
        <ThemeToggle />
      </div>

      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--accent-soft),_transparent_50%)]" />

      <div className="relative z-10 w-full max-w-md animate-[fadeInUp_0.45s_ease-out]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-5 text-accent"
              aria-hidden="true"
            >
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-[11px] font-medium tracking-wide text-accent">
            Dev-SSO
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card px-8 py-8 shadow-xl shadow-black/10">
          <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
            Masuk
          </h1>
          <p className="mt-2 text-center text-sm text-muted">
            Masukkan email yang terdaftar untuk melanjutkan.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-medium text-ink"
              >
                Email <span className="text-muted">*</span>
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="user@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="block w-full rounded-lg border border-line bg-transparent px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/50 transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href={passwordResetHref}
                className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
              >
                Lupa kata sandi?
              </a>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="inline-flex min-w-[120px] items-center justify-center rounded-lg bg-accent-soft px-5 py-2.5 text-sm font-semibold text-accent transition-all duration-200 hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    <span>Loading…</span>
                  </span>
                ) : (
                  "Lanjutkan"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Register */}
        <div className="mt-4 rounded-2xl bg-card px-8 py-4 text-center text-sm text-muted shadow-xl shadow-black/10">
          Belum memiliki akun?{" "}
          <a
            href={registerHref}
            className="font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Daftar Sekarang
          </a>
        </div>

        {/* Footer — fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-4 text-[11px] text-muted/60">
          <span>&copy; 2026 Dev-SSO</span>
          <span>·</span>
          <a href="#" className="transition-colors hover:text-muted">Terms</a>
          <span>·</span>
          <a href="#" className="transition-colors hover:text-muted">Privacy</a>
          <span>·</span>
          <a href="#" className="transition-colors hover:text-muted">Docs</a>
        </div>
      </div>
    </main>
  );
}

function identityActionHref(path: string, email: string): string {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return path;
  }

  const params = new URLSearchParams({ login_hint: trimmedEmail });

  return `${path}?${params.toString()}`;
}
