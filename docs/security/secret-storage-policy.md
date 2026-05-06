# Secret Storage Policy

## Scope

This policy governs verifier-side storage, runtime placement, rotation, and provenance for SSO secrets.

## Secret classification

| Class | Examples | Owner | Required handling |
|---|---|---|---|
| Verifier hashes | `APP_B_CLIENT_SECRET_HASH` | SSO broker | Argon2id only; safe to compare, not to reverse |
| Runtime client secrets | `APP_B_CLIENT_SECRET`, `ZITADEL_BROKER_CLIENT_SECRET` | Owning client or broker runtime | GitHub Actions secrets or VPS runtime env only |
| Root encryption keys | `APP_KEY`, `ADMIN_PANEL_SESSION_SECRET`, signing private keys | Platform operator | VPS runtime env or mounted secret files only |
| Local development secrets | `.env`, `.env.dev`, `.secrets/**` | Local developer | Never committed or copied into Docker build context |

## Runtime locations

- GitHub Actions secrets hold deployment credentials, registry access, and remote runtime values required by workflows.
- VPS runtime env holds service-specific plaintext secrets consumed by Docker Compose.
- Local development env holds developer-only values in ignored files.
- Mounted secret files under `.secrets/**` are excluded from Git and Docker build contexts.

## Required standard

- Stored client secrets must be encoded as `$argon2id$...`.
- Stored client secrets must meet or exceed:
  - memory cost: 19 MiB (`19456` KiB)
  - time cost: `2`
  - parallelism: `1`
- Plaintext client secrets must never be stored in broker configuration, documentation examples, CI logs, or generated artifacts.

## Rotation and provenance

- Every rotation must record who initiated it, when it happened, the affected environment, and where the new value was installed.
- Rotation evidence must describe validation steps without printing secret material.
- Client-secret rotations must update the client-owned plaintext and broker-owned verifier hash together.
- Emergency rotations must prefer disabling or replacing the affected credential over broad platform restarts.

## As-built implementation

- The broker stores verifier-side confidential client secrets in `config/oidc_clients.php`.
- The App B secret is now sourced from `APP_B_CLIENT_SECRET_HASH`.
- The client-owned plaintext secret remains separate in app runtime config as `APP_B_CLIENT_SECRET`.

## Enforcement

1. `ClientSecretHashPolicy` validates algorithm and cost parameters.
2. `DownstreamClientRegistry` rejects confidential client authentication if the stored verifier hash is non-compliant.
3. `DownstreamClientRegistry::assertStoredSecretsCompliant()` provides a runtime fail-closed verification pass for all configured confidential clients.
4. `php artisan oidc:verify-client-secret-policy` can be used in CI/CD and on-call checks before rollout.
5. CI architecture tests scan the confidential client config for hash-specific env bindings.
6. `infra/sre/check-secret-maturity.sh` validates policy coverage and repository hygiene without printing secret values.
