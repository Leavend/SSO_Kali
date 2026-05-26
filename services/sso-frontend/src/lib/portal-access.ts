const PERMISSION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'profile.read': 'Melihat data profil dasar akun.',
  'sessions.revoke': 'Mengakhiri sesi aktif dari perangkat lain.',
  'mfa.manage': 'Mengelola aplikasi autentikasi dan kode cadangan.',
}

const SCOPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  openid: 'Mengizinkan identitas OIDC dasar.',
  profile: 'Mengizinkan aplikasi membaca profil dasar.',
  email: 'Mengizinkan aplikasi membaca email terverifikasi.',
  offline_access: 'Mengizinkan refresh token untuk akses jangka panjang.',
  'sso.portal': 'Mengizinkan akses portal pengguna SSO.',
}

export function oauthScopeTokens(scope: string): readonly string[] {
  return scope
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function permissionDescription(permission: string): string {
  return PERMISSION_DESCRIPTIONS[permission] ?? 'Izin teknis yang diberikan administrator.'
}

export function oauthScopeDescription(scope: string): string {
  return SCOPE_DESCRIPTIONS[scope] ?? 'Cakupan akses yang diberikan saat otorisasi aplikasi.'
}
