import { ChecklistCard } from "@/components/molecules/ChecklistCard";
import { SessionRefreshBridge } from "@/components/SessionRefreshBridge";
import { SignalPill } from "@/components/atoms/SignalPill";
import { cookies } from "next/headers";
import { getPublicConfig, getServerConfig } from "@/lib/app-config";
import { integrationChecks } from "@/lib/app-content";
import { findSession } from "@/lib/session-store";

type HomePageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: HomePageProps) {
  const config = getPublicConfig();
  const params = await searchParams;
  const session = await currentSession();
  const event = readEvent(params.event);
  const ssoChecked = params.sso_checked === "1";

  // Touchless SSO: if no local session and not yet attempted silent SSO,
  // auto-redirect to broker with prompt=none to check for existing ZITADEL session.
  if (session === null && !ssoChecked && event === null) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/login?prompt=none");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <SessionRefreshBridge authenticated={session !== null} />
      <section className="rounded-[2rem] border border-app-line bg-app-panel/80 p-8 shadow-[0_30px_90px_rgba(2,8,23,0.35)] backdrop-blur-sm">
        <SignalPill text={session === null ? "Public Client + PKCE" : "Session Active"} />
        <h1 className="mt-5 text-4xl font-semibold tracking-tight leading-[1.1] sm:text-5xl">App A &mdash; Integrasi browser-side OIDC flow.</h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-8 text-app-muted">
          {session === null
            ? "Login dilakukan lewat Authorization Code + PKCE, lalu sesi lokal disimpan server-side di Redis agar back-channel logout bisa menutup sesi lintas aplikasi."
            : "Sesi ini berasal dari token lokal SSO facade. Jika logout terjadi dari App B, sesi ini juga akan diputus lewat back-channel logout berbasis sid."}
        </p>
        {event !== null ? <p className="mt-4 rounded-2xl border border-app-accent/20 bg-app-accent-soft px-4 py-3 text-sm text-app-accent">{event}</p> : null}
        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          <ChecklistCard label="Client ID" value={config.clientId} />
          <ChecklistCard label="Authorize URL" value={config.authorizeUrl} />
          <ChecklistCard label="Callback URL" value={config.callbackUrl} />
        </dl>
        {session === null ? <LoggedOutActions /> : <LoggedInActions />}
      </section>
      {session === null ? null : <SessionOverview session={session} />}
      <section className="grid gap-4 md:grid-cols-3">
        {integrationChecks.map((item) => <ChecklistCard key={item.label} label={item.label} value={item.value} />)}
      </section>
    </main>
  );
}

async function currentSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(getServerConfig().sessionCookieName)?.value;

  return sessionId === undefined ? null : findSession(sessionId);
}

function LoggedOutActions() {
  return (
    <form action="/auth/login" method="get" className="mt-8">
      <button className="rounded-2xl bg-app-accent px-6 py-3.5 font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(125,211,252,0.3)]" type="submit">
        Mulai Login PKCE
      </button>
    </form>
  );
}

function LoggedInActions() {
  return (
    <form action="/auth/logout" method="post" className="mt-8">
      <button className="rounded-2xl border border-app-line px-6 py-3.5 font-semibold text-app-ink transition-all hover:border-app-accent/40 hover:bg-app-accent-soft" type="submit">
        Logout Terpusat
      </button>
    </form>
  );
}

type SessionOverviewProps = {
  readonly session: Awaited<ReturnType<typeof currentSession>>;
};

function SessionOverview({ session }: SessionOverviewProps) {
  if (session === null) {
    return null;
  }

  return (
    <section className="grid gap-4 md:grid-cols-4">
      <ChecklistCard label="Display Name" value={session.displayName} />
      <ChecklistCard label="Email" value={session.profile.email} />
      <ChecklistCard label="Session ID (sid)" value={session.sid} />
      <ChecklistCard label="Adaptive MFA" value={session.profile.mfa_required ? "Required" : "Not required"} />
    </section>
  );
}

function readEvent(event: string | string[] | undefined): string | null {
  if (typeof event !== "string") {
    return null;
  }

  return {
    connected: "Handshake selesai. Session App A sudah diregistrasikan ke backend untuk back-channel logout.",
    "signed-out": "Logout terpusat selesai. Jika App B aktif dengan sid yang sama, sesi di sana juga ikut diputus.",
    "expired-state": "State callback sudah kedaluwarsa. Mulai ulang login untuk membuat transaksi PKCE baru.",
    "missing-code": "Authorization response tidak membawa code yang valid.",
    "handshake-failed": "Pertukaran code atau sinkronisasi profile gagal di sisi server.",
    "upstream-error": "Provider mengembalikan error saat proses autentikasi.",
    "session-expired": "Sesi lokal berakhir atau refresh token tidak valid. Silakan login ulang.",
  }[event] ?? null;
}
