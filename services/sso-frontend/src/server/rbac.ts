import type { AdminSession } from './session.js'
import { getConfig } from './config.js'

const adminPanelRoles = new Set<string>(['admin'])

export function canViewAdminPanel(role: string): boolean {
  return adminPanelRoles.has(role.trim().toLowerCase())
}

export function canManageSessions(session: AdminSession): boolean {
  return canViewAdminPanel(session.role) && session.permissions.manage_sessions
}

export function sessionIsFresh(session: AdminSession, nowMs: number = Date.now()): boolean {
  if (session.authTime === null) return false
  return Math.max(0, Math.floor(nowMs / 1000) - session.authTime) <= getConfig().adminFreshAuthTtlSeconds
}

export function canUseAdminPanel(session: AdminSession): boolean {
  return canViewAdminPanel(session.role) && session.permissions.view_admin_panel && sessionIsFresh(session)
}
