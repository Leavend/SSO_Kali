import AdminPageShell from "@/components/AdminPageShell";
import EmptyState from "@/components/EmptyState";
import NoticeCard from "@/components/NoticeCard";
import RefreshLink from "@/components/shared/RefreshLink";
import { fetchClients } from "@/lib/admin-api";
import { loadAdminData } from "@/lib/admin-data-loader";
import { requireAdminSession } from "@/lib/require-admin-session";
import { getBackchannelDisplay } from "@/lib/backchannel";

import { Suspense } from "react";
import { CardsSkeleton } from "@/components/PageLoading";

export default async function AppsPage() {
  const session = await requireAdminSession("/apps");

  return (
    <AdminPageShell
      title="Registered Apps"
      sessionExpiresAt={session.expiresAt}
      subtitle=""
      breadcrumbs={[{ label: "Admin Panel", href: "/dashboard" }, { label: "Apps" }]}
    >
      <Suspense fallback={<CardsSkeleton />}>
        <AppsContentLoader session={session} />
      </Suspense>
    </AdminPageShell>
  );
}

type ClientRow = Awaited<ReturnType<typeof fetchClients>>[number];
type AdminSession = Awaited<ReturnType<typeof requireAdminSession>>;

async function AppsContentLoader({ session }: { readonly session: AdminSession }) {
  const { data, error } = await loadAdminData(session, "/apps", fetchClients);
  const list = data ?? [];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted">{error ? "Unable to load client data" : `${list.length} OIDC client${list.length !== 1 ? "s" : ""} registered`}</p>
      </div>
      <AppsContent list={list} error={error} />
    </>
  );
}

function AppsContent({ list, error }: { readonly list: ClientRow[]; readonly error: string | null }) {
  if (error) {
    return <NoticeCard icon="⚠" title="Failed to Load Apps" description={error} tone="danger" />;
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon="⊞"
        message="No apps registered"
        description="OIDC clients will appear here once they are configured in the broker."
        actionNode={<RefreshLink href="/apps" label="Refresh Apps" />}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {list.map((client) => (
        <ClientCard key={client.client_id} client={client} />
      ))}
    </div>
  );
}

function ClientCard({ client }: { readonly client: ClientRow }) {
  const backchannel = getBackchannelDisplay(client);

  return (
    <div className="group rounded-xl border border-line bg-card p-5 transition-all duration-200 hover:border-accent/30 hover:bg-card-hover">
      <CardHeader clientId={client.client_id} type={client.type} />
      <div className="mt-4 space-y-2">
        <RedirectUris uris={client.redirect_uris} />
        <BackchannelInfo label={backchannel.label} title={backchannel.title ?? ""} tone={backchannel.tone} />
      </div>
    </div>
  );
}

function CardHeader({ clientId, type }: { readonly clientId: string; readonly type: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="font-mono text-sm font-semibold text-ink">{clientId}</h3>
      <span className={clientTypePalette(type)}>{type}</span>
    </div>
  );
}

function RedirectUris({ uris }: { readonly uris: readonly string[] }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Redirect URIs</p>
      {uris.map((uri) => (
        <p key={uri} className="mt-0.5 break-all font-mono text-xs text-muted sm:truncate" title={uri}>
          {uri}
        </p>
      ))}
    </div>
  );
}

interface BackchannelInfoProps {
  readonly label: string;
  readonly title: string;
  readonly tone: "disabled" | "internal" | "public";
}

function BackchannelInfo({ label, title, tone }: BackchannelInfoProps) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">BCL Endpoint</p>
      <p className={backchannelTextClass(tone)} title={title}>{label}</p>
    </div>
  );
}

function clientTypePalette(type: string): string {
  const color = type === "public" ? "bg-success-soft text-success" : "bg-warning-soft text-warning";
  return `rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`;
}

function backchannelTextClass(tone: "disabled" | "internal" | "public"): string {
  if (tone === "public") return "mt-0.5 truncate font-mono text-xs text-muted";
  if (tone === "internal") return "mt-0.5 text-xs font-medium text-warning";
  return "mt-0.5 text-xs text-muted/70";
}
