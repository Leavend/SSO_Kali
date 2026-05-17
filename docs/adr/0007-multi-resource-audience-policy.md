# ADR-0007 — Multi-Resource Access Token Audience Policy

**Status:** Proposed
**Date:** 2026-05-17
**Owner:** SSO Backend
**Related FR:** FR-031 — Profil JWT Access Token

---

## Context

Current SSO backend issues access tokens with a single resource audience configured by:

- `services/sso-backend/config/sso.php` → `resource_audience`
- `services/sso-backend/app/Services/Oidc/UserClaimsFactory.php`
- `services/sso-backend/app/Services/Oidc/AccessTokenGuard.php`

This is acceptable for MVP because all first-party protected APIs currently share one logical resource audience (`sso-resource-api`). However, Phase-2/Phase-3 integrations will introduce multiple APIs/RPs with distinct audience expectations.

Problem: a single `aud` can over-authorize tokens across resource servers if a downstream API treats possession of the token as sufficient.

---

## Decision

Adopt a phased multi-resource audience model:

1. Keep current `sso.resource_audience` as the default audience for one release.
2. Add explicit resource registration before issuing multi-audience tokens.
3. Resolve access-token `aud` from the intersection of:
   - requested scopes,
   - client-allowed resources,
   - resource policy.
4. Reject requests that ask for scopes mapped to unauthorized resources.
5. Keep `openid`, `profile`, `email` as identity scopes; resource scopes must be namespaced (`api:orders.read`, `api:billing.write`, etc.).

---

## Proposed Data Model

### `resources`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint | PK |
| `resource_id` | string | stable audience value, e.g. `api-orders` |
| `display_name` | string | admin-readable |
| `jwks_uri` | string nullable | future sender-constrained/resource validation support |
| `enabled` | bool | disables issuance |
| `created_at`, `updated_at` | timestamps | audit support |

### `client_resources`

| Column | Type | Notes |
| --- | --- | --- |
| `client_id` | string | OIDC client slug |
| `resource_id` | string | resource audience |
| `allowed_scopes` | json | resource-bound scopes |

---

## Token Claim Rules

### MVP compatibility

```json
{
  "aud": "sso-resource-api"
}
```

### Multi-resource phase

Single resource:

```json
{
  "aud": "api-orders"
}
```

Multiple resources:

```json
{
  "aud": ["api-orders", "api-billing"]
}
```

Resource servers MUST reject tokens where their expected audience is absent.

---

## Migration Plan

1. **Release N**
   - Add tables/models only.
   - Populate default `resources.resource_id = sso-resource-api`.
   - Backfill all existing active clients into `client_resources` for default audience.
   - Keep `UserClaimsFactory` behavior unchanged.

2. **Release N+1**
   - Introduce `ResourceAudienceResolver`.
   - Add contract tests for:
     - default audience fallback,
     - unauthorized resource scope rejection,
     - multi-audience array claim.
   - Add admin APIs for resource assignment.

3. **Release N+2**
   - Deprecate implicit global audience for new clients.
   - Existing clients keep fallback until explicit migration.

4. **Release N+3**
   - Require explicit resource assignment for all clients.

---

## Alternatives Considered

### Per-client audience

Each client receives `aud = client_id`.

Rejected because resource servers should not need to trust every client ID directly. Audience should represent API/resource, not RP.

### Scope-only authorization

Resource servers inspect scopes only.

Rejected because OAuth 2.0 best current practice requires audience restriction to prevent token replay across APIs.

### One token per resource

Issue separate access token per resource.

Deferred. More secure for least privilege but increases frontend/backend token orchestration complexity. Can be added later once `resources` table exists.

---

## Consequences

Positive:

- Reduces lateral replay risk across APIs.
- Enables least-privilege resource server validation.
- Keeps MVP backward compatible.

Negative:

- Adds admin/client-management complexity.
- Requires downstream API teams to validate `aud` consistently.
- Requires migration communication before implicit fallback removal.

---

## Validation Gates

Before implementation:

- ADR reviewed by backend owner + security owner.
- Resource naming convention documented.

During implementation:

- `AccessTokenAudiencePolicyContractTest` expanded for array `aud`.
- `ScopePolicy` tests cover resource-bound scopes.
- `DiscoveryDocumentTest` updated if resource indicators are advertised.

Before enforcement:

- Production logs show zero clients using implicit fallback for 14 days.
