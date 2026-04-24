import AdminPageShell from "@/components/AdminPageShell";
import DetailGrid, { type DetailItem } from "@/components/DetailGrid";
import EmptyState from "@/components/EmptyState";
import NoticeCard from "@/components/NoticeCard";
import RecordCard from "@/components/RecordCard";
import ResponsiveTable from "@/components/ResponsiveTable";
import SessionManagementGate from "@/components/SessionManagementGate";
import StepUpCountdown from "@/components/StepUpCountdown";
import { SessionsTableHead, SessionTableRow } from "@/components/SessionsTable";
import ClientBadge from "@/components/shared/ClientBadge";
import RefreshLink from "@/components/shared/RefreshLink";
import SessionIdDisplay from "@/components/shared/SessionIdDisplay";
import SessionTimeDisplay from "@/components/shared/SessionTimeDisplay";
import { RevokeSessionButton, RevokeAllButton } from "@/components/RevokeButtons";
import { buildAdminLoginHref } from "@/lib/admin-login-url";
import { canManageSessions } from "@/lib/admin-rbac";
import { fetchUser } from "@/lib/admin-api";
import { loadAdminData } from "@/lib/admin-data-loader";
import { requiresSensitiveActionStepUp } from "@/lib/admin-freshness";
import { truncateId } from "@/lib/format";
import { requireAdminSession } from "@/lib/require-admin-session";

import { Suspense } from "react";
import { UserDetailSkeleton } from "@/components/PageLoading";

type Props = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: Props) {
  const admin = await requireAdminSession("/users/[id]");
  const { id } = await params;

  return (
    <AdminPageShell
      title="User Details"
      sessionExpiresAt={admin.expiresAt}
      subtitle="Loading user details..."
      breadcrumbs={[
        { label: "Admin Panel", href: "/dashboard" },
        { label: "Users", href: "/users" },
        { label: "Details" },
      ]}
    >
      <Suspense fallback={<UserDetailSkeleton />}>
        <UserDetailLoader admin={admin} id={id} />
      </Suspense>
    </AdminPageShell>
  );
}

type AdminSession = Awaited<ReturnType<typeof requireAdminSession>>;

async function UserDetailLoader({ admin, id }: { readonly admin: AdminSession; readonly id: string }) {
  const { data, error } = await loadUserData(admin, id);

  if (!data) {
    return <UserLoadErrorInline message={error} />;
  }

  return (
    <>
      <div className="-mt-14 mb-8">
        <p className="text-sm text-muted">{data.user.email}</p>
      </div>
      <UserDetailView admin={admin} user={data.user} sessions={data.sessions} id={id} />
    </>
  );
}

function UserLoadErrorInline({ message }: { readonly message: string | null }) {
  return (
    <NoticeCard
      icon="⚠"
      title="Failed to load user details"
      description={message ?? "The admin API did not return a usable user record for this page."}
      tone="danger"
      actionHref="/users"
      actionLabel="Back to Users"
    />
  );
}

async function loadUserData(admin: Awaited<ReturnType<typeof requireAdminSession>>, id: string) {
  return loadAdminData(
    admin,
    `/users/${id}`,
    (session) => fetchUser(session, id),
    "The admin API did not return a usable user record for this page.",
  );
}

interface UserDetailViewProps {
  readonly admin: Awaited<ReturnType<typeof requireAdminSession>>;
  readonly user: NonNullable<Awaited<ReturnType<typeof fetchUser>>>["user"];
  readonly sessions: NonNullable<Awaited<ReturnType<typeof fetchUser>>>["sessions"];
  readonly id: string;
}

function UserDetailView({ admin, user, sessions, id }: UserDetailViewProps) {
  const manage = canManageSessions(admin.role);
  const stepUp = manage && requiresSensitiveActionStepUp(admin.authTime);
  const returnTo = `/users/${id}`;

  return (
    <>
      {stepUp ? <StepUpNotice returnTo={returnTo} /> : null}
      <UserIdLine subjectId={user.subject_id} />
      {manage ? <StepUpCountdown authTime={admin.authTime} returnTo={returnTo} /> : null}
      <UserSessionsSection sessions={sessions} manage={manage} authTime={admin.authTime} returnTo={returnTo} subjectId={user.subject_id} />
    </>
  );
}

function StepUpNotice({ returnTo }: { readonly returnTo: string }) {
  return (
    <div className="mb-6">
      <NoticeCard
        icon="⟲"
        title="Session revocation needs step-up authentication"
        description="You can inspect this user, but revoking sessions requires a more recent admin sign-in."
        actionHref={buildAdminLoginHref(returnTo)}
        actionLabel="Verify Identity Again"
      />
    </div>
  );
}

function UserIdLine({ subjectId }: { readonly subjectId: string }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <p className="font-mono text-xs text-muted">
        <span className="cursor-help" title={subjectId}>
          ID: {truncateId(subjectId, 10)}
        </span>
      </p>
    </div>
  );
}

interface UserSessionsSectionProps {
  readonly sessions: UserDetailViewProps["sessions"];
  readonly manage: boolean;
  readonly authTime: number | null;
  readonly returnTo: string;
  readonly subjectId: string;
}

function UserSessionsSection({ sessions, manage, authTime, returnTo, subjectId }: UserSessionsSectionProps) {
  return (
    <>
      <SessionsHeader count={sessions.length} manage={manage} authTime={authTime} returnTo={returnTo} subjectId={subjectId} />
      {sessions.length === 0
        ? <UserEmptyState subjectId={subjectId} />
        : <UserSessionsList sessions={sessions} manage={manage} authTime={authTime} returnTo={returnTo} />}
    </>
  );
}

interface SessionsHeaderProps {
  readonly count: number;
  readonly manage: boolean;
  readonly authTime: number | null;
  readonly returnTo: string;
  readonly subjectId: string;
}

function SessionsHeader({ count, manage, authTime, returnTo, subjectId }: SessionsHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h2 className="text-lg font-semibold">Active Sessions ({count})</h2>
      {count > 0 ? (
        <SessionManagementGate allowed={manage}>
          <RevokeAllButton authTime={authTime} returnTo={returnTo} subjectId={subjectId} />
        </SessionManagementGate>
      ) : null}
    </div>
  );
}

function UserEmptyState({ subjectId }: { readonly subjectId: string }) {
  return (
    <EmptyState
      icon="⊛"
      message="No active sessions"
      description="This user has no active sessions across any application."
      actionNode={
        <div className="flex flex-wrap justify-center gap-3">
          <RefreshLink href={`/users/${subjectId}`} label="Refresh Data" />
          <RefreshLink href="/users" label="Back to Users" />
        </div>
      }
    />
  );
}

function UserSessionsList({ sessions, manage, authTime, returnTo }: Omit<UserSessionsSectionProps, "subjectId">) {
  return (
    <ResponsiveTable
      cards={sessions.map((s) => (
        <UserSessionCardItem key={`${s.session_id}-${s.client_id}`} session={s} manage={manage} authTime={authTime} returnTo={returnTo} />
      ))}
      table={
        <table className="w-full min-w-[720px] text-left text-sm">
          <SessionsTableHead columns={["Session ID", "App", "Created", "Expires", "Actions"]} />
          <tbody>
            {sessions.map((s) => (
              <SessionTableRow key={`${s.session_id}-${s.client_id}`} session={s} authTime={authTime} canManage={manage} returnTo={returnTo} />
            ))}
          </tbody>
        </table>
      }
    />
  );
}

type UserSessionRow = NonNullable<Awaited<ReturnType<typeof fetchUser>>>["sessions"][number];

function UserSessionCardItem(props: { readonly session: UserSessionRow; readonly manage: boolean; readonly authTime: number | null; readonly returnTo: string }) {
  return (
    <RecordCard
      title={<SessionIdDisplay sessionId={props.session.session_id} />}
      badge={<ClientBadge clientId={props.session.client_id} />}
      details={<DetailGrid items={userSessionItems(props.session)} />}
      footer={
        <SessionManagementGate allowed={props.manage}>
          <RevokeSessionButton authTime={props.authTime} returnTo={props.returnTo} sessionId={props.session.session_id} />
        </SessionManagementGate>
      }
    />
  );
}

function userSessionItems(s: UserSessionRow): DetailItem[] {
  return [
    { label: "App", value: <ClientBadge clientId={s.client_id} /> },
    { label: "Created", value: <SessionTimeDisplay value={s.created_at} /> },
    { label: "Expires", value: <SessionTimeDisplay value={s.expires_at} /> },
  ];
}
