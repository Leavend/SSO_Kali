# dev-sso First Access & Hard Refresh Audit

Date: 2026-04-08

Scope:
- `https://dev-sso.timeh.my.id/`
- first access without session
- hard refresh behavior on auth-sensitive routes

## Executive Summary

`dev-sso` is not failing because the service is down. The primary issue is a UX/runtime
design mismatch:

1. The global app loading boundary renders an **admin dashboard skeleton** for the root
   sign-in route.
2. Several auth routes **await telemetry writes** before rendering or redirecting.
3. The landing page still contains a **session-based fast redirect to `/dashboard`**,
   which partially reintroduces the naive auto-redirect behavior that earlier phases
   were supposed to remove.

The result is that first access and hard refresh can look "stuck", "wrong page first",
or "randomly bouncing", even though the service itself is healthy.

## What Was Reproduced

### Public path behavior

- External request to `/` returned `200`, but the HTML stream initially contained the
  global admin-shell skeleton before swapping to the real sign-in screen.
- External request timing from a remote client fluctuated around `0.8s` to `1.8s`,
  with one spike above `5s`.
- The same request executed locally on the VPS through public Nginx with:
  `curl --resolve dev-sso.timeh.my.id:443:127.0.0.1`
  completed in about `15-19ms`.

Conclusion:
- The service is not compute-bound on the VPS.
- The "buntu" feeling is primarily caused by streamed fallback UX plus blocking work on
  auth routes, and is amplified by normal internet/TLS latency.

## Root Causes

### 1. Wrong global loading UI for the root sign-in route

File:
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/loading.tsx`

The global `app/loading.tsx` renders the full admin-shell skeleton:
- sidebar
- dashboard-style header
- dashboard cards

That fallback is used while the root page resolves its server-side work, so a first-time
 visitor sees a dashboard-like placeholder before the secure sign-in screen arrives.

This is the strongest explanation for "halaman terasa buntu / salah / seperti nyangkut".

### 2. Blocking telemetry on auth-critical paths

Files:
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/page.tsx`
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/auth/login/route.ts`
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/access-denied/page.tsx`
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/reauth-required/page.tsx`
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/invalid-credentials/page.tsx`
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/lib/admin-auth-funnel.ts`

These routes/pages all `await recordAdminAuthFunnelEvent(...)`, and that function
`await`s Redis writes.

This means non-essential telemetry sits directly on the critical path for:
- first landing render
- login redirect start
- forbidden page render
- reauth page render
- invalid-credentials page render

Telemetry should be best-effort here, not render-blocking.

### 3. Landing page still has naive session fast-redirect

File:
- `/Users/leavend/Desktop/Project_SSO/services/sso-frontend/src/app/page.tsx`

The root route still does:

- `getSession()`
- if session exists, `redirect("/dashboard")`

That bypasses the explicit state-machine-first entry decision on the landing page.
When the session is stale, forbidden, or otherwise not fit for admin UX, the user can
still bounce into `/dashboard` first and only be corrected later.

This is a policy regression and contributes to the "random / stuck / redirecting"
experience.

## Why Hard Refresh Feels Bad

Hard refresh always re-enters server rendering because the auth surface is correctly
`no-store`. That is expected.

What is not ideal is:
- the wrong fallback UI is shown first
- non-essential telemetry is awaited during render/redirect
- root entry still tries a session shortcut

So the browser is doing a fresh request correctly, but the app gives the user the wrong
visual and timing signals during that refresh.

## Findings by Severity

### P0

1. Global loading boundary shows dashboard shell for unauthenticated first access.
2. Auth telemetry is synchronous on the critical path.
3. Root route still performs session fast-redirect to `/dashboard`.

### P1

1. Auth status pages also block on telemetry writes.
2. External latency magnifies the bad fallback experience, making a mostly-healthy app
   feel broken.

## Recommended Remediation Order

1. Replace `app/loading.tsx` with an auth-neutral loading screen, or scope admin-shell
   loading to protected route groups only.
2. Make `recordAdminAuthFunnelEvent(...)` fire-and-forget on render/redirect paths.
3. Remove the root `session -> /dashboard` shortcut and let the state machine decide the
   visible route deterministically.
4. Re-test first access and hard refresh with live browser traces after the above.

## Final Assessment

This is primarily a **UX/state-boundary bug**, not a backend outage.

The service is healthy. The user experience feels blocked because the first visual state
and the critical auth path still contain synchronous work and a misleading loading
boundary.
