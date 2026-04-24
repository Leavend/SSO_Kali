const ADMIN_PANEL_ROLES = new Set<string>(["admin"]);
const SESSION_MANAGEMENT_ROLES = new Set<string>(["admin"]);

export function canViewAdminPanel(role: string): boolean {
  return ADMIN_PANEL_ROLES.has(normalizeRole(role));
}

export function canManageSessions(role: string): boolean {
  return SESSION_MANAGEMENT_ROLES.has(normalizeRole(role));
}

export function isAccessDeniedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function normalizeRole(role: string): Lowercase<string> {
  return role.trim().toLowerCase() as Lowercase<string>;
}
