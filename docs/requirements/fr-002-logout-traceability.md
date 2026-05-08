# FR-002 Logout Terpusat Traceability

## Scope

FR-002 requires centralized logout across browser/front-channel and server-to-server back-channel flows.

When a user logs out from one app or the SSO portal:

1. the SSO session ends,
2. the browser SSO cookie is cleared,
3. every related client session is notified,
4. clients verify `logout_token`,
5. clients terminate local sessions by `sid`,
6. failures are clear, auditable, and retryable.

## Acceptance Matrix

| ID | Acceptance Criteria | Current Evidence | Status | Gap / Next Action |
|---|---|---|---|---|
| FR002-AC-01 | Logout endpoint rejects missing/invalid bearer token | `CentralizedLogoutTest` rejects `/connect/logout` without bearer | Done | None |
| FR002-AC-02 | Logout request identifies `sub` and `sid` from valid access token | `CentralizedLogoutTest` uses signed token with `sub` and `sid` | Done | Add invalid-audience/expired-token explicit tests if not already covered elsewhere |
| FR002-AC-03 | SSO queues back-channel logout for every registered client session | `Bus::assertDispatched(DispatchBackChannelLogoutJob::class, 2)` | Done | None |
| FR002-AC-04 | SSO clears session registry after centralized logout | `BackChannelSessionRegistry::forSession($sid)` returns empty | Done | None |
| FR002-AC-05 | Back-channel callback sends OIDC `logout_token` | HTTP fake assertion in `CentralizedLogoutTest` | Done | None |
| FR002-AC-06 | `logout_token` contains `sub`, `sid`, `jti`, and back-channel event claim | `LocalLogoutTokenVerifier` assertion in feature test | Done | Add `aud`, `iss`, `iat`, `exp` explicit assertions for audit completeness |
| FR002-AC-07 | `logout_token` excludes `nonce` | Feature assertion verifies no `nonce` | Done | None |
| FR002-AC-08 | Client non-2xx callback fails safely | `CentralizedLogoutTest` and unit tests throw controlled exception | Done | Ensure queued retry metrics/audit are visible to admin |
| FR002-AC-09 | Job has bounded retry/backoff | `DispatchBackChannelLogoutJobTest` | Done | None |
| FR002-AC-10 | Front-channel logout clears SSO cookie | `/api/auth/logout` test asserts expired cookie | Done | Add browser/E2E validation if frontend harness exists |
| FR002-AC-11 | Discovery exposes end-session endpoint | `DiscoveryDocumentTest` checks `end_session_endpoint` | Done | None |
| FR002-AC-12 | App A verifies token and clears local session by `sid` | No runnable App A receiver found | Gap | Add mock receiver contract or App A E2E service |
| FR002-AC-13 | App B verifies token and clears local session by `sid` | No runnable App B receiver found | Gap | Add mock receiver contract or App B E2E service |
| FR002-AC-14 | User sees clear error/message on partial logout failure | Failure is controlled server-side | Partial | Add response contract for partial failure and UI message |
| FR002-AC-15 | Admin can inspect logout delivery audit | Audit action exists, query surface not fully confirmed | Partial | Add admin audit query/filter tests for logout events |

## Production Evidence

- `/connect/logout` is route-locked by route contract tests.
- `/connect/register-session` is route-locked by route contract tests.
- `/api/auth/logout` is route-locked by route contract tests.
- Production `/ready` returns DB/Redis readiness.
- OIDC discovery/JWKS are cached at Nginx edge and passed WRK without `429`.

## Remaining FR-002 Work

### High Priority

1. Add App A/App B back-channel receiver contract tests.
2. Add explicit logout token claim assertions for `aud`, `iss`, `iat`, `exp`.
3. Add admin audit query/filter tests for logout delivery events.
4. Add partial logout response contract and UI copy requirement.

### Medium Priority

1. Browser E2E for front-channel cookie clearing.
2. Load-test valid OAuth logout path with dedicated test client.

## Recommended Definition of Done

FR-002 is fully production-complete when:

- server-side SSO tests pass,
- client receiver contract/E2E tests pass for App A and App B,
- admin audit query proves visibility of delivery results,
- partial failure behavior is documented and tested,
- production smoke remains green.
