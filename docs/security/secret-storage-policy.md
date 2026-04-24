# Secret Storage Policy

## Scope

This policy governs verifier-side storage of confidential OIDC client secrets in the SSO broker.

## Required standard

- Stored client secrets must be encoded as `$argon2id$...`.
- Stored client secrets must meet or exceed:
  - memory cost: 19 MiB (`19456` KiB)
  - time cost: `2`
  - parallelism: `1`
- Plaintext client secrets must never be stored in broker configuration.

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
