import type { AdminUserListItem, UserAccountStatus } from '@/types/users.types'

// The backend `GET /admin/api/users` returns a flat `{ users }` with no query
// params, so search / status-filter / pagination are derived client-side over
// the hydrated, already-masked list. 25 mirrors the legacy Users table page size.
export const USERS_PAGE_SIZE = 25

export type UsersStatusFilter = 'all' | UserAccountStatus

// Case-insensitive substring match over the operator-meaningful identity fields
// (display name, email, subject id); status filters on `effective_status` — the
// computed lifecycle state the badge shows — not the raw `status` column. PII
// identifiers (nik/nip/nisn) are deliberately NOT searchable: they are masked.
export function filterUsers(
  list: readonly AdminUserListItem[],
  args: { query: string; status: UsersStatusFilter },
): readonly AdminUserListItem[] {
  const q = args.query.trim().toLowerCase()
  return list.filter((user) => {
    if (args.status !== 'all' && user.effective_status !== args.status) return false
    if (q === '') return true
    return (
      (user.display_name ?? '').toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.subject_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateUsers(
  list: readonly AdminUserListItem[],
  page: number,
  size: number = USERS_PAGE_SIZE,
): readonly AdminUserListItem[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function pageCount(total: number, size: number = USERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
