# ZITADEL Login Copywriting

## Tone

- Professional
- Clear
- Calm
- Non-technical
- Privacy-preserving

## Headline Copy

| Scenario | Indonesian | English |
| --- | --- | --- |
| Login title | `Masuk` | `Sign in` |
| Login description | `Masukkan email yang terdaftar untuk melanjutkan.` | `Enter the registered email to continue.` |
| Register title | `Buat akun` | `Create account` |
| Register description | `Buat akun Dev-SSO Anda.` | `Create your Dev-SSO account.` |
| Password setup title | `Atur kata sandi` | `Set password` |
| Password reset title | `Atur ulang kata sandi` | `Reset password` |
| Verify title | `Verifikasi akun` | `Verify account` |
| Consent title | `Tinjau akses aplikasi` | `Review application access` |

## Primary Actions

| Action | Indonesian | English |
| --- | --- | --- |
| Continue | `Lanjutkan` | `Continue` |
| Back | `Kembali` | `Back` |
| Register | `Daftar Sekarang` | `Register Now` |
| Sign in | `Masuk` | `Sign in` |
| Reset password | `Atur ulang kata sandi` | `Reset password` |
| Allow | `Izinkan` | `Allow` |
| Deny | `Tolak` | `Deny` |

## Input Labels

| Field | Indonesian | English |
| --- | --- | --- |
| Login name | `Email` | `Email` |
| First name | `Nama depan` | `First name` |
| Last name | `Nama belakang` | `Last name` |
| Password | `Kata sandi` | `Password` |
| Confirm password | `Konfirmasi kata sandi` | `Confirm password` |
| Device code | `Kode perangkat` | `Device code` |

## Error Copy Principles

- Explain the action that failed, not the internal cause.
- Avoid naming infrastructure, stack traces, or vendor internals.
- Avoid confirming whether an account exists unless the flow requires it.
- Offer one next step when possible.

## Recommended Generic Errors

| Scenario | Indonesian | English |
| --- | --- | --- |
| Sign-in failed | `Kami belum bisa memverifikasi detail masuk Anda. Coba lagi.` | `We could not verify your sign-in details. Please try again.` |
| Register failed | `Kami belum bisa menyelesaikan pendaftaran. Akun dengan data ini mungkin sudah ada. Masuk atau atur ulang kata sandi Anda.` | `We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.` |
| Password reset failed | `Kami belum bisa memulai proses atur ulang kata sandi. Coba lagi.` | `We could not start password reset. Please try again.` |
| Verification failed | `Kami belum bisa memverifikasi permintaan ini. Coba lagi.` | `We could not verify this request. Please try again.` |
| Invitation failed | `Kami belum bisa mengirim undangan. Coba lagi.` | `We could not send the invitation. Please try again.` |
| Rate limit | `Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.` | `Too many attempts. Please wait a moment and try again.` |

## Implementation Notes

The current hosted-login patch layer already aligns the public login surface with this wording baseline. If future ZITADEL Settings V2 text APIs are adopted directly, use this document as the source-of-truth for both Indonesian and English variants.
