import AdminNavLinks from "@/components/AdminNavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import { getSession } from "@/lib/session";

export default async function Sidebar() {
  const session = await getSession();

  return (
    <>
      {/* ── Mobile Header: sticky glassmorphism bar ── */}
      <div className="sticky top-0 z-40 border-b border-line bg-card/80 px-4 py-4 backdrop-blur-xl md:hidden">
        <MobileHeader email={session?.email ?? ""} />
      </div>

      {/* ── Desktop Sidebar: fixed left panel ── */}
      <aside
        className="hidden h-full w-60 flex-col border-r border-line bg-card md:fixed md:left-0 md:top-0 md:flex"
        role="navigation"
        aria-label="Admin navigation"
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft font-mono text-sm font-bold text-accent">
            SSO
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Admin Panel</p>
            <p className="font-mono text-[10px] text-muted">Prototype SSO</p>
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
          <AdminNavLinks variant="desktop" />
        </nav>
        {session ? <DesktopProfile session={session} /> : null}
      </aside>
    </>
  );
}

function MobileHeader(props: { readonly email: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft font-mono text-sm font-bold text-accent">
            SSO
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Admin Panel</p>
            <p className="font-mono text-[10px] text-muted">Prototype SSO</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {props.email ? (
            <p className="max-w-[120px] truncate font-mono text-[10px] text-muted">
              {props.email}
            </p>
          ) : null}
        </div>
      </div>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Admin tabs">
        <AdminNavLinks variant="mobile" />
      </nav>
    </>
  );
}

type SidebarSession = Awaited<ReturnType<typeof getSession>>;

function DesktopProfile(props: { readonly session: NonNullable<SidebarSession> }) {
  return (
    <div className="border-t border-line px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink">
            {props.session.displayName}
          </p>
          <p className="truncate font-mono text-[10px] text-muted">
            {props.session.email}
          </p>
        </div>
        <ThemeToggle />
      </div>
      {/* IMPORTANT: Must NOT use next/link <Link> here — Next.js prefetches
          Link targets, and /auth/logout is a GET route handler that calls
          clearSession(). Prefetching it would delete the user's session cookie
          immediately after dashboard loads. Use a plain <a> tag instead. */}
      <a
        href="/auth/logout"
        className="mt-3 block rounded-lg bg-danger-soft px-3 py-2 text-center text-xs font-medium text-danger transition-all duration-200 hover:bg-danger hover:text-white focus-visible:ring-2 focus-visible:ring-danger"
      >
        Sign Out
      </a>
    </div>
  );
}
