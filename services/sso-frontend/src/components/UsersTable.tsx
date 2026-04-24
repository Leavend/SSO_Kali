import Link from "next/link";
import RoleBadge from "@/components/shared/RoleBadge";
import RiskBadge from "@/components/shared/RiskBadge";
import LastLoginDisplay from "@/components/shared/LastLoginDisplay";
import { SessionsTableHead } from "@/components/SessionsTable";

interface UserRowData {
  readonly subject_id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: string;
  readonly last_login_at: string | null;
  readonly login_context?: { readonly risk_score: number } | null;
}

interface UsersTableProps {
  readonly users: readonly UserRowData[];
}

export function UsersTableBody({ users }: UsersTableProps) {
  return (
    <table className="w-full min-w-[760px] text-left text-sm">
      <SessionsTableHead columns={["User", "Role", "Risk Score", "Last Login", "Actions"]} />
      <tbody>
        {users.map((user) => (
          <UserTableRow key={user.subject_id} user={user} />
        ))}
      </tbody>
    </table>
  );
}

function UserTableRow({ user }: { readonly user: UserRowData }) {
  return (
    <tr className="border-b border-line transition-colors last:border-b-0 hover:bg-card-hover">
      <td className="px-5 py-4">
        <p className="font-medium text-ink">{user.display_name}</p>
        <p className="font-mono text-xs text-muted">{user.email}</p>
      </td>
      <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
      <td className="px-5 py-4"><RiskBadge score={user.login_context?.risk_score} /></td>
      <td className="px-5 py-4"><LastLoginDisplay value={user.last_login_at} /></td>
      <td className="px-5 py-4"><ViewSessionsLink userId={user.subject_id} /></td>
    </tr>
  );
}

function ViewSessionsLink({ userId }: { readonly userId: string }) {
  return (
    <Link
      href={`/users/${userId}`}
      className="rounded-md bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white"
    >
      View Sessions
    </Link>
  );
}
