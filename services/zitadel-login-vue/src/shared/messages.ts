export const LOGIN_MESSAGES = Object.freeze({
  generic: 'Kami tidak dapat melanjutkan proses masuk. Coba lagi beberapa saat lagi.',
  missingFlow: 'Mulai proses masuk dari aplikasi terlebih dahulu.',
  missingSession: 'Sesi masuk tidak ditemukan. Mulai lagi dari halaman masuk.',
  invalidLoginName: 'Masukkan email atau nama pengguna yang valid.',
  invalidPassword: 'Masukkan kata sandi Anda.',
  invalidOtp: 'Masukkan kode autentikator lengkap.',
  invalidCredentials: 'Email atau kata sandi tidak sesuai.',
  invalidOtpCode: 'Kode autentikator tidak valid atau sudah kedaluwarsa.',
  serviceUnavailable: 'Layanan identitas belum siap. Coba lagi sebentar lagi.',
})

export type LoginMessageKey = keyof typeof LOGIN_MESSAGES

export function messageForKey(key: LoginMessageKey): string {
  return LOGIN_MESSAGES[key]
}
