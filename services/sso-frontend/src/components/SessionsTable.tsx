import ClientBadge from "@/components/shared/ClientBadge";
import SessionIdDisplay from "@/components/shared/SessionIdDisplay";
import SessionTimeDisplay from "@/components/shared/SessionTimeDisplay";
import SessionManagementGate from "@/components/SessionManagementGate";
import { RevokeSessionButton } from "@/components/RevokeButtons";

interface SessionRowData {
  readonly session_id: string;
  readonly client_id: string;
  readonly display_name?: string;
  readonly email?: string;
  readonly created_at: string;
  readonly expires_at: string;
}

interface SessionsTableHeadProps {
  readonly columns: readonly string[];
}

export function SessionsTableHead({ columns }: SessionsTableHeadProps) {
  return (
    <thead>
      <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
        {columns.map((col) => (
          <th key={col} className="px-5 py-3 font-medium">{col}</th>
        ))}
      </tr>
    </thead>
  );
}

interface SessionTableRowProps {
  readonly session: SessionRowData;
  readonly authTime: number | null;
  readonly canManage: boolean;
  readonly returnTo: string;
  readonly showUser?: boolean;
}

export function SessionTableRow({ session, authTime, canManage, returnTo, showUser }: SessionTableRowProps) {
  return (
    <tr className="border-b border-line transition-colors last:border-b-0 hover:bg-card-hover">
      {showUser ? <UserCell name={session.display_name} email={session.email} /> : null}
      <td className="px-5 py-4"><ClientBadge clientId={session.client_id} /></td>
      <td className="px-5 py-4"><SessionIdDisplay sessionId={session.session_id} /></td>
      <td className="px-5 py-4"><SessionTimeDisplay value={session.created_at} /></td>
      <td className="px-5 py-4"><SessionTimeDisplay value={session.expires_at} /></td>
      <td className="px-5 py-4">
        <SessionManagementGate allowed={canManage}>
          <RevokeSessionButton authTime={authTime} returnTo={returnTo} sessionId={session.session_id} />
        </SessionManagementGate>
      </td>
    </tr>
  );
}

function UserCell({ name, email }: { readonly name?: string | undefined; readonly email?: string | undefined }) {
  return (
    <td className="px-5 py-4">
      <p className="font-medium text-ink">{name}</p>
      <p className="font-mono text-[10px] text-muted">{email}</p>
    </td>
  );
}
