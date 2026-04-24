import Link from "next/link";
import AdminPageShell from "@/components/AdminPageShell";
import DetailGrid, { type DetailItem } from "@/components/DetailGrid";
import EmptyState from "@/components/EmptyState";
import NoticeCard from "@/components/NoticeCard";
import RecordCard from "@/components/RecordCard";
import RefreshLink from "@/components/shared/RefreshLink";
import RoleBadge from "@/components/shared/RoleBadge";
import RiskBadge from "@/components/shared/RiskBadge";
import LastLoginDisplay from "@/components/shared/LastLoginDisplay";
import ResponsiveTable from "@/components/ResponsiveTable";
import { UsersTableBody } from "@/components/UsersTable";
import { fetchUsers } from "@/lib/admin-api";
import { loadAdminData } from "@/lib/admin-data-loader";
import { requireAdminSession } from "@/lib/require-admin-session";

import { Suspense } from "react";
import { TableSkeleton } from "@/components/PageLoading";

export default async function UsersPage() {
  const session = await requireAdminSession("/users");

  return (
    <AdminPageShell
      title="Users"
      sessionExpiresAt={session.expiresAt}
      subtitle=""
      breadcrumbs={[{ label: "Admin Panel", href: "/dashboard" }, { label: "Users" }]}
    >
      <Suspense fallback={<TableSkeleton />}>
        <UsersContentLoader session={session} />
      </Suspense>
    </AdminPageShell>
  );
}

type AdminSession = Awaited<ReturnType<typeof requireAdminSession>>;

async function UsersContentLoader({ session }: { readonly session: AdminSession }) {
  const { data, error } = await loadAdminData(session, "/users", fetchUsers);
  const list = data ?? [];
  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted">{error ? "Unable to load user data" : `${list.length} registered user${list.length !== 1 ? "s" : ""}`}</p>
      </div>
      <UsersContent list={list} error={error} />
    </>
  );
}

type UserRow = Awaited<ReturnType<typeof fetchUsers>>[number];

function UsersContent({ list, error }: { readonly list: UserRow[]; readonly error: string | null }) {
  if (error) {
    return <NoticeCard icon="⚠" title="Failed to Load Users" description={error} tone="danger" />;
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon="◉"
        message="No users yet"
        description="Users will appear here once they authenticate via SSO."
        actionNode={<RefreshLink href="/users" label="Refresh Directory" />}
      />
    );
  }

  return (
    <ResponsiveTable
      cards={list.map((u) => <UserRecordCard key={u.subject_id} user={u} />)}
      table={<UsersTableBody users={list} />}
    />
  );
}

function UserRecordCard({ user }: { readonly user: UserRow }) {
  return (
    <RecordCard
      title={user.display_name}
      subtitle={user.email}
      badge={<RoleBadge role={user.role} />}
      details={<DetailGrid items={userDetailItems(user)} />}
      footer={<UserAction userId={user.subject_id} />}
    />
  );
}

function userDetailItems(user: UserRow): DetailItem[] {
  return [
    { label: "Role", value: <RoleBadge role={user.role} /> },
    { label: "Risk Score", value: <RiskBadge score={user.login_context?.risk_score} /> },
    { label: "Last Login", value: <LastLoginDisplay value={user.last_login_at} /> },
  ];
}

function UserAction({ userId }: { readonly userId: string }) {
  return (
    <Link
      href={`/users/${userId}`}
      className="inline-flex rounded-md bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white"
    >
      View Sessions
    </Link>
  );
}
