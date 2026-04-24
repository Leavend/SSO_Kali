# OIDC Security Profile

- Status: Accepted
- Date: 2026-04-04
- Scope: SSO Broker, App A, App B

## Profile Statement

This platform supports only:

- OAuth 2.0 / OIDC Authorization Code Flow
- PKCE with `code_challenge_method=S256`

The broker rejects non-compliant authorization requests before any upstream redirect is issued.

## Mandatory Broker Rules

The `/authorize` endpoint must reject requests when any of the following conditions is true:

- `state` is missing or empty
- `nonce` is missing or empty
- `response_type` is not `code`
- `code_challenge_method` is not `S256`
- `code_challenge` is missing or empty
- `scope` does not include `openid`

## Client Requirements

All downstream clients must:

- generate `state`
- generate `nonce`
- generate PKCE verifier and `S256` challenge
- send `response_type=code`
- send `code_challenge_method=S256`

## Runtime Telemetry

The broker emits a cache-backed runtime counter:

- `pkce_reject_total{reason}`

Current reasons:

- `missing_client_binding`
- `missing_state`
- `missing_nonce`
- `unsupported_response_type`
- `invalid_code_challenge_method`
- `missing_code_challenge`
- `missing_openid_scope`

## Enforcement Points

- Broker request validation: `CreateAuthorizationRedirect`
- App A authorize URL builder: `src/lib/oidc.ts`
- App B authorize URL builder: `SsoHttpClient::authorizeUrl`

## CI Coverage

- Broker feature tests cover valid redirect and negative request matrix
- App A test verifies authorize URL contains `code_challenge_method=S256`
- App B test verifies authorize redirect contains `code_challenge_method=S256`
