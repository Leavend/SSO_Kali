export const ACCESS_DENIED_ROUTE = '/access-denied'
export const HANDSHAKE_FAILED_ROUTE = '/handshake-failed'
export const INVALID_CREDENTIALS_ROUTE = '/invalid-credentials'
export const MFA_REQUIRED_ROUTE = '/mfa-required'
export const REAUTH_REQUIRED_ROUTE = '/reauth-required'
export const TOO_MANY_ATTEMPTS_ROUTE = '/too-many-attempts'
export const SESSION_EXPIRED_ROUTE = '/session-expired'
export const GENERIC_ERROR_ROUTE = '/error'

export type AuthStatusCopy = {
  readonly badge: string
  readonly title: string
  readonly description: string
  readonly accent: 'accent' | 'danger' | 'warning'
  readonly primaryAction: {
    readonly href: string
    readonly label: string
  }
  readonly secondaryAction?: {
    readonly href: string
    readonly label: string
  }
  readonly note?: string
}

export const authStatusCopy: Record<string, AuthStatusCopy> = {
  [ACCESS_DENIED_ROUTE]: {
    badge: 'Access denied',
    title: 'Akun ini belum punya akses',
    description: 'SSO berhasil, tetapi akun ini belum diizinkan membuka portal ini.',
    accent: 'danger',
    primaryAction: { href: '/auth/logout', label: 'Keluar' },
    secondaryAction: { href: '/', label: 'Kembali' },
    note: 'Hubungi owner SSO bila akses portal perlu diaktifkan.',
  },
  [HANDSHAKE_FAILED_ROUTE]: {
    badge: 'Handshake failed',
    title: 'Validasi login tidak lengkap',
    description: 'State, nonce, atau token exchange tidak lolos validasi keamanan.',
    accent: 'danger',
    primaryAction: { href: '/auth/login', label: 'Ulangi login' },
    secondaryAction: { href: '/', label: 'Kembali' },
  },
  [INVALID_CREDENTIALS_ROUTE]: {
    badge: 'Invalid credentials',
    title: 'Credential tidak dapat divalidasi',
    description: 'Provider SSO menolak permintaan login atau credential yang dipakai tidak valid.',
    accent: 'danger',
    primaryAction: { href: '/auth/login', label: 'Coba lagi' },
  },
  [MFA_REQUIRED_ROUTE]: {
    badge: 'MFA required',
    title: 'Multi-factor authentication wajib aktif',
    description: 'Akses portal membutuhkan faktor autentikasi tambahan sebelum sesi dapat dipakai.',
    accent: 'warning',
    primaryAction: { href: '/auth/login', label: 'Login dengan MFA' },
  },
  [REAUTH_REQUIRED_ROUTE]: {
    badge: 'Re-auth required',
    title: 'Sesi perlu diverifikasi ulang',
    description: 'Aksi sensitif membutuhkan login baru agar sesi tetap segar.',
    accent: 'warning',
    primaryAction: { href: '/auth/login?return_to=/home', label: 'Verifikasi ulang' },
    secondaryAction: { href: '/auth/logout', label: 'Keluar' },
  },
  [TOO_MANY_ATTEMPTS_ROUTE]: {
    badge: 'Rate limited',
    title: 'Terlalu banyak percobaan',
    description: 'Sistem menahan sementara percobaan login untuk melindungi akun.',
    accent: 'warning',
    primaryAction: { href: '/', label: 'Kembali' },
  },
  [SESSION_EXPIRED_ROUTE]: {
    badge: 'Session expired',
    title: 'Sesi SSO sudah berakhir',
    description: 'Silakan login ulang agar sesi terbaru dipakai.',
    accent: 'warning',
    primaryAction: { href: '/auth/login', label: 'Login ulang' },
  },
  [GENERIC_ERROR_ROUTE]: {
    badge: 'Error',
    title: 'Portal SSO belum bisa dibuka',
    description: 'Terjadi masalah saat memproses permintaan portal.',
    accent: 'danger',
    primaryAction: { href: '/', label: 'Kembali' },
  },
}

export function legacyAuthErrorRoute(error: string | undefined): string | null {
  if (!error) return null

  switch (error) {
    case 'auth_failed':
      return INVALID_CREDENTIALS_ROUTE
    case 'invalid_state':
    case 'handshake_failed':
      return HANDSHAKE_FAILED_ROUTE
    case 'mfa_required':
      return MFA_REQUIRED_ROUTE
    case 'not_admin':
      return ACCESS_DENIED_ROUTE
    case 'reauth_required':
      return REAUTH_REQUIRED_ROUTE
    case 'too_many_attempts':
      return TOO_MANY_ATTEMPTS_ROUTE
    case 'session_expired':
      return SESSION_EXPIRED_ROUTE
    default:
      return GENERIC_ERROR_ROUTE
  }
}
