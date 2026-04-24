import AdminPageShell from "@/components/AdminPageShell";
import EmptyState from "@/components/EmptyState";
import NoticeCard from "@/components/NoticeCard";
import RecordCard from "@/components/RecordCard";
import DetailGrid, { type DetailItem } from "@/components/DetailGrid";
import ResponsiveTable from "@/components/ResponsiveTable";
import SessionManagementGate from "@/components/SessionManagementGate";
import StepUpCountdown from "@/components/StepUpCountdown";
import { SessionsTableHead, SessionTableRow } from "@/components/SessionsTable";
import ClientBadge from "@/components/shared/ClientBadge";
import RefreshLink from "@/components/shared/RefreshLink";
import SessionIdDisplay from "@/components/shared/SessionIdDisplay";
import SessionTimeDisplay from "@/components/shared/SessionTimeDisplay";
import { RevokeSessionButton } from "@/components/RevokeButtons";
import { buildAdminLoginHref } from "@/lib/admin-login-url";
import { canManageSessions } from "@/lib/admin-rbac";
import { loadAdminData } from "@/lib/admin-data-loader";
import { fetchSessions } from "@/lib/admin-api";
import { requiresSensitiveActionStepUp } from "@/lib/admin-freshness";
import { requireAdminSession } from "@/lib/require-admin-session";

import { Suspense } from "react";
import { TableSkeleton } from "@/components/PageLoading";

export default async function SessionsPage() {
  const session = await requireAdminSession("/sessions");
  const manage = canManageSessions(session.role);
  const stepUp = manage && requiresSensitiveActionStepUp(session.authTime);

  return (
    <AdminPageShell
      title="Sessions"
      sessionExpiresAt={session.expiresAt}
      subtitle=""
      breadcrumbs={[{ label: "Admin Panel", href: "/dashboard" }, { label: "Sessions" }]}
    >
      {manage ? <StepUpCountdown authTime={session.authTime} returnTo="/sessions" /> : null}
      {stepUp ? <StepUpNotice returnTo="/sessions" /> : null}
      
      <Suspense fallback={<TableSkeleton />}>
        <SessionsContentLoader session={session} manage={manage} />
      </Suspense>
    </AdminPageShell>
  );
}

type AdminSession = Awaited<ReturnType<typeof requireAdminSession>>;

function StepUpNotice({ returnTo }: { readonly returnTo: string }) {
  return (
    <div className="mb-6">
      <NoticeCard
        icon="⟲"
        title="Sensitive actions need a newer sign-in"
        description="You can review active sessions, but revocation requires a fresher admin session before it can proceed."
        actionHref={buildAdminLoginHref(returnTo)}
        actionLabel="Verify Identity Again"
      />
    </div>
  );
}

interface SessionsContentProps {
  readonly list: SessionRow[];
  readonly error: string | null;
  readonly authTime: number | null;
  readonly canManage: boolean;
}

function SessionsContent({ list, error, authTime, canManage }: SessionsContentProps) {
  if (error) {
    return <NoticeCard icon="⚠" title="Failed to Load Sessions" description={error} tone="danger" />;
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon="⊛"
        message="No active sessions"
        description="Sessions will appear here once users authenticate via SSO."
        actionNode={<RefreshLink href="/sessions" label="Refresh Data" />}
      />
    );
  }

  return (
    <ResponsiveTable
      cards={list.map((s) => (
        <SessionRecordCard key={`${s.session_id}-${s.client_id}`} session={s} authTime={authTime} canManage={canManage} />
      ))}
      table={
        <table className="w-full min-w-[820px] text-left text-sm">
          <SessionsTableHead columns={["User", "App", "Session ID", "Created", "Expires", "Actions"]} />
          <tbody>
            {list.map((s) => (
              <SessionTableRow key={`${s.session_id}-${s.client_id}`} session={s} authTime={authTime} canManage={canManage} returnTo="/sessions" showUser />
            ))}
          </tbody>
        </table>
      }
    />
  );
}

type SessionRow = Awaited<ReturnType<typeof fetchSessions>>[number];

async function SessionsContentLoader(
  { session, manage }: { readonly session: AdminSession; readonly manage: boolean },
) {
  const { data, error } = await loadAdminData(session, "/sessions", fetchSessions);
  const list = data ?? [];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted">{error ? "Unable to load session data" : `${list.length} active session${list.length !== 1 ? "s" : ""} across all apps`}</p>
      </div>
      <SessionsContent list={list} error={error} authTime={session.authTime} canManage={manage} />
    </>
  );
}

function SessionRecordCard(props: { readonly session: SessionRow; readonly authTime: number | null; readonly canManage: boolean }) {
  return (
    <RecordCard
      title={props.session.display_name}
      subtitle={props.session.email}
      badge={<ClientBadge clientId={props.session.client_id} />}
      details={<DetailGrid items={sessionDetailItems(props.session)} />}
      footer={
        <SessionManagementGate allowed={props.canManage}>
          <RevokeSessionButton authTime={props.authTime} returnTo="/sessions" sessionId={props.session.session_id} />
        </SessionManagementGate>
      }
    />
  );
}

function sessionDetailItems(s: SessionRow): DetailItem[] {
  return [
    { label: "App", value: <ClientBadge clientId={s.client_id} /> },
    { label: "Session ID", value: <SessionIdDisplay sessionId={s.session_id} /> },
    { label: "Created", value: <SessionTimeDisplay value={s.created_at} /> },
    { label: "Expires", value: <SessionTimeDisplay value={s.expires_at} /> },
  ];
}
