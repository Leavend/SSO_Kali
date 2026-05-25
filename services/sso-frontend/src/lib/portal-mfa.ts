import { formatPortalDateTime } from './portal-format'
import type { MfaEnrollmentStatus } from '@/types/mfa.types'

export function presentMfaSummary(
  status: MfaEnrollmentStatus | null,
  isMfaRequired: boolean,
): string {
  if (!status?.enrolled && !isMfaRequired)
    return 'Belum ada aplikasi autentikasi aktif · kode cadangan belum tersedia'

  const recoverySummary = `${status?.recovery_codes_remaining ?? 0} recovery code tersisa`
  const methodSummary = status?.methods.includes('totp')
    ? 'TOTP aktif'
    : 'TOTP wajib, aplikasi autentikasi belum terhubung'
  const verifiedSummary = status?.totp_verified_at
    ? `Diverifikasi ${formatPortalDateTime(status.totp_verified_at)}`
    : 'Belum pernah diverifikasi'

  return `${recoverySummary} · ${methodSummary} · ${verifiedSummary}`
}
