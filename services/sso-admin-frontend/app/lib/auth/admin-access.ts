export function hasAdminRole(roles: readonly string[]): boolean {
  return roles.includes('admin')
}
