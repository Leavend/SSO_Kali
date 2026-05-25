import type { AuditEvent } from '@/types/audit.types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
type AuditSeverity = 'normal' | 'warning' | 'critical'

export interface AuditEventPresentation {
  readonly label: string
  readonly severity: AuditSeverity
  readonly helper: string
  readonly badgeVariant: BadgeVariant
  readonly rowClass: string
  readonly badgeClass: string
  readonly iconClass: string
}

const AUDIT_LABELS: Readonly<Record<string, string>> = {
  login: 'Login Berhasil',
  login_succeeded: 'Login Berhasil',
  'login.succeeded': 'Login Berhasil',
  login_failed: 'Login Gagal',
  'login.failed': 'Login Gagal',
  logout: 'Logout',
  logout_all: 'Semua Sesi Keluar',
  session_revoked: 'Sesi Keluar Otomatis',
  token_refreshed: 'Token Diperbarui',
  password_changed: 'Password Diperbarui',
  profile_updated: 'Profil Diperbarui',
  connected_app_revoked: 'Akses Aplikasi Dihapus',
}

export function knownLoginIpAddresses(events: readonly AuditEvent[]): ReadonlySet<string> {
  return new Set(
    events
      .filter((event) => isLoginEvent(event.event))
      .map((event) => event.ip_address)
      .filter((ipAddress): ipAddress is string => Boolean(ipAddress)),
  )
}

export function presentAuditEvent(
  event: AuditEvent,
  knownLoginIps: ReadonlySet<string>,
): AuditEventPresentation {
  const severity = auditSeverity(event, knownLoginIps)
  if (severity === 'critical') return criticalAuditPresentation(event)
  if (severity === 'warning') return warningAuditPresentation(event, knownLoginIps)
  return normalAuditPresentation(event)
}

export function auditEventLabel(eventType: string, metadata?: AuditEvent['metadata']): string {
  if (eventType === 'login' && metadata?.outcome === 'failed') return 'Login Gagal'
  return AUDIT_LABELS[eventType] ?? humanizeTechnicalName(eventType)
}

function normalAuditPresentation(event: AuditEvent): AuditEventPresentation {
  return {
    label: auditEventLabel(event.event, event.metadata),
    severity: 'normal',
    helper: 'Aktivitas normal akun.',
    badgeVariant: 'outline',
    rowClass: 'border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)]',
    badgeClass: 'text-[10px]',
    iconClass: 'text-muted-foreground',
  }
}

function criticalAuditPresentation(event: AuditEvent): AuditEventPresentation {
  return {
    label: auditEventLabel(event.event, event.metadata),
    severity: 'critical',
    helper: 'Aktivitas sensitif terdeteksi dari IP yang tidak dikenal.',
    badgeVariant: 'destructive',
    rowClass:
      'border-error-700/40 bg-error-50 text-error-800 dark:border-error-700/50 dark:bg-error-950/30 dark:text-error-200',
    badgeClass:
      'border-error-700/30 bg-error-50 text-error-800 dark:border-error-700/50 dark:bg-error-950/40 dark:text-error-200',
    iconClass: 'text-error-700 dark:text-error-300',
  }
}

function warningAuditPresentation(
  event: AuditEvent,
  knownLoginIps: ReadonlySet<string>,
): AuditEventPresentation {
  return {
    label: auditEventLabel(event.event, event.metadata),
    severity: 'warning',
    helper: auditWarningHelper(event, knownLoginIps),
    badgeVariant: 'outline',
    rowClass:
      'border-warning-800/40 bg-warning-50 text-warning-800 dark:border-warning-700/50 dark:bg-warning-950/30 dark:text-warning-200',
    badgeClass:
      'border-warning-800/30 bg-warning-50 text-warning-800 dark:border-warning-700/50 dark:bg-warning-950/40 dark:text-warning-200',
    iconClass: 'text-warning-800 dark:text-warning-200',
  }
}

function auditWarningHelper(event: AuditEvent, knownLoginIps: ReadonlySet<string>): string {
  if (isForeignIp(event, knownLoginIps)) return 'IP tidak dikenal dibanding login terakhir.'
  return 'Aktivitas keamanan sensitif.'
}

function auditSeverity(event: AuditEvent, knownLoginIps: ReadonlySet<string>): AuditSeverity {
  const isForeign = isForeignIp(event, knownLoginIps)
  const isSensitive = isSensitiveAuditEvent(event)
  if (isForeign && isSensitive) return 'critical'
  if (isForeign || isSensitive) return 'warning'
  return 'normal'
}

function isForeignIp(event: AuditEvent, knownLoginIps: ReadonlySet<string>): boolean {
  return Boolean(event.ip_address && knownLoginIps.size > 0 && !knownLoginIps.has(event.ip_address))
}

function isSensitiveAuditEvent(event: AuditEvent): boolean {
  if (event.event === 'login' && event.metadata?.outcome === 'failed') return true
  return ['session_revoked', 'connected_app_revoked', 'password_changed', 'logout_all'].includes(
    event.event,
  )
}

function isLoginEvent(eventType: string): boolean {
  return eventType === 'login' || eventType.startsWith('login.') || eventType.startsWith('login_')
}

function humanizeTechnicalName(value: string): string {
  return value
    .replaceAll('.', '_')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
