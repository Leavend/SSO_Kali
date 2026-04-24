# Logout Everywhere UX Flow

## Intent

Users should experience logout as a single action that invalidates all broker-linked sessions.

## UX sequence

1. The user signs in to App A.
2. The user signs in to App B with the same broker-backed identity.
3. The user triggers `Logout Terpusat` from App A.
4. App A calls the broker logout endpoint.
5. The broker revokes the logical session and sends back-channel logout to App B.
6. App B removes its local session by `sid`.
7. A fresh visit to App B `/dashboard` must redirect to `/`.

## Evidence expectations

- App A shows the signed-out confirmation message.
- App B no longer serves a protected dashboard session.
- App B returns to the landing state with the session-terminated status notice.
