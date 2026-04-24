# Frontend Security Checklist

## Browser storage

- Access tokens, refresh tokens, and ID tokens must never be written to:
  - `localStorage`
  - `sessionStorage`
  - `document.cookie`
- CI enforces this with `tools/frontend-security/check-browser-storage-policy.mjs`.

## Cookie policy

- Browser sessions must use host-only cookies.
- Session cookies must use the `__Host-` prefix.
- Cookie attributes must include:
  - `Secure`
  - `HttpOnly`
  - `Path=/`
  - `SameSite=Lax`

## BFF boundary

- App A and the Admin Panel keep tokens server-side.
- Browser-visible state is limited to opaque session cookies.
