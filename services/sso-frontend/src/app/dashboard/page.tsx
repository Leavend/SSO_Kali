import { Suspense } from "react";
import AdminPageShell from "@/components/AdminPageShell";
import NoticeCard from "@/components/NoticeCard";
import StatCard from "@/components/StatCard";
import QuickLinks, { type QuickLinkItem } from "@/components/QuickLinks";
import { fetchUsers, fetchSessions, fetchClients } from "@/lib/admin-api";
import { loadAdminData } from "@/lib/admin-data-loader";
import { requireAdminSession } from "@/lib/require-admin-session";
import { type StatCardProps } from "@/components/StatCard";

export default async function DashboardPage() {
  const session = await requireAdminSession("/dashboard");

  return (
    <AdminPageShell
      title="Dashboard"
      sessionExpiresAt={session.expiresAt}
      subtitle={`Welcome, ${session.displayName}`}
      breadcrumbs={[{ label: "Admin Panel" }, { label: "Dashboard" }]}
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent session={session} />
      </Suspense>
    </AdminPageShell>
  );
}

async function DashboardContent({ session }: { readonly session: Awaited<ReturnType<typeof requireAdminSession>> }) {
  const { stats, error } = await loadDashboardStats(session);

  return (
    <>
      {error ? <DashboardError message={error} /> : null}
      <DashboardStats stats={stats} hasError={!!error} />
      <QuickLinks items={quickLinks} />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8 rounded-xl border border-line bg-card p-6">
        <div className="h-5 w-32 animate-pulse rounded-md bg-card-hover" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-card-hover px-4 py-4">
            <div className="h-4 w-32 animate-pulse rounded bg-card-hover" />
          </div>
          <div className="rounded-lg bg-card-hover px-4 py-4">
            <div className="h-4 w-32 animate-pulse rounded bg-card-hover" />
          </div>
          <div className="rounded-lg bg-card-hover px-4 py-4">
            <div className="h-4 w-32 animate-pulse rounded bg-card-hover" />
          </div>
        </div>
      </div>
    </>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="h-4 w-28 animate-pulse rounded bg-card-hover" />
      <div className="mt-4 h-10 w-20 animate-pulse rounded-md bg-card-hover" />
    </div>
  );
}

async function loadDashboardStats(session: Awaited<ReturnType<typeof requireAdminSession>>) {
  const [u, s, c] = await Promise.all([
    loadAdminData(session, "/dashboard", fetchUsers),
    loadAdminData(session, "/dashboard", fetchSessions),
    loadAdminData(session, "/dashboard", fetchClients),
  ]);

  return {
    stats: buildStatCards(u.data?.length ?? 0, s.data?.length ?? 0, c.data?.length ?? 0),
    error: u.error ?? s.error ?? c.error,
  };
}

function buildStatCards(users: number, sessions: number, clients: number): StatCardProps[] {
  return [
    { label: "Total Users", value: users, color: "accent" },
    { label: "Active Sessions", value: sessions, color: "success" },
    { label: "Registered Apps", value: clients, color: "warning" },
  ];
}

function DashboardError({ message }: { readonly message: string }) {
  return (
    <div className="mb-6">
      <NoticeCard icon="⚠" title="Backend Unreachable" description={message} tone="danger" />
    </div>
  );
}

function DashboardStats({ stats, hasError }: { readonly stats: StatCardProps[]; readonly hasError: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} value={hasError ? "—" : stat.value} />
      ))}
    </div>
  );
}

const quickLinks: QuickLinkItem[] = [
  { href: "/users", label: "Manage Users", icon: "◉" },
  { href: "/sessions", label: "View Sessions", icon: "⊛" },
  { href: "/apps", label: "Registered Apps", icon: "⊞" },
];
