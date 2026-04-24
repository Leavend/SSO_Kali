# Back-Channel Logout Security Profile

## Purpose

This profile defines the mandatory validation rules for OpenID Connect back-channel logout tokens in the Prototype SSO platform.

## As-Built Scope

Consumers:

- App A back-channel logout endpoint
- App B back-channel logout endpoint

Issuer:

- `sso-backend` `LogoutTokenService`

## Broker-Issued Logout Token Contract

Broker logout tokens MUST contain:

- `iss`
- `aud`
- `sub`
- `sid`
- `iat`
- `exp`
- `jti`
- `events["http://schemas.openid.net/event/backchannel-logout"]`

Broker logout tokens MUST NOT contain:

- `nonce`

## Consumer Validation Rules

Back-channel logout verifiers SHALL:

1. verify JWT signature against broker JWKS
2. enforce trusted `iss`
3. enforce expected `aud`
4. require `exp`
5. require `iat`
6. require the back-channel logout `events` marker
7. require `sub` and/or `sid`
8. require `jti`
9. reject replayed `jti`
10. reject tokens containing `nonce`

Runtime reject counters are tracked by reason:

- `app-b:metrics:jwt_reject_total:missing_exp`
- `app-b:metrics:jwt_reject_total:missing_iat`
- `app-b:metrics:jwt_reject_total:token_expired`
- `app-b:metrics:jwt_reject_total:invalid_events`
- `app-b:metrics:jwt_reject_total:missing_subject_or_sid`
- `app-b:metrics:jwt_reject_total:invalid_nonce`

## Replay Defense

Replay defense is mandatory for this program.

- first use of a `jti` is accepted
- subsequent use of the same `jti` is rejected
- replay is counted as an operational alert

## Operational Failure Response

If a logout token fails validation:

- endpoint returns `401`
- no session destruction is performed
- replay alert counter is incremented when the failure reason is `jti` reuse

## Implementation References

- `/Users/leavend/Desktop/Project_SSO/services/sso-backend/app/Services/Oidc/LogoutTokenService.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/LogoutTokenVerifier.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/app/Services/Sso/LogoutTokenReplayStore.php`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/logout-token.ts`
- `/Users/leavend/Desktop/Project_SSO/apps/app-a-next/src/lib/logout-replay-store.ts`
