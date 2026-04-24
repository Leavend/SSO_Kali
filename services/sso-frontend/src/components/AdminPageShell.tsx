import type { ReactNode } from "react";
import PageHeader, { type BreadcrumbItem } from "@/components/PageHeader";
import SessionExpiryWarning from "@/components/SessionExpiryWarning";
import SessionRefresher from "@/components/SessionRefresher";
import Sidebar from "@/components/Sidebar";

type AdminPageShellProps = {
  title: string;
  subtitle: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
  sessionExpiresAt?: number | null;
};

export default async function AdminPageShell(props: AdminPageShellProps) {
  const headerProps = props.breadcrumbs
    ? {
        title: props.title,
        subtitle: props.subtitle,
        actions: props.actions,
        breadcrumbs: props.breadcrumbs,
      }
    : {
        title: props.title,
        subtitle: props.subtitle,
        actions: props.actions,
      };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-4 pb-8 pt-4 md:ml-60 md:px-8 md:py-8">
        <SessionExpiryWarning expiresAt={props.sessionExpiresAt ?? null} />
        {props.sessionExpiresAt ? <SessionRefresher expiresAt={props.sessionExpiresAt} /> : null}
        <PageHeader {...headerProps} />
        {props.children}
      </main>
    </div>
  );
}
