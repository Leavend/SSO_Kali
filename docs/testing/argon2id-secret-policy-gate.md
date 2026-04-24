# Argon2id Secret Policy Gate

## Scope

This release gate verifies that verifier-side confidential client secrets in the broker remain Argon2id-hashed and compliant with the documented parameter baseline.

## Assertions

- broker config binds verifier secrets from `APP_B_CLIENT_SECRET_HASH`
- broker config does not bind verifier secrets from `APP_B_CLIENT_SECRET`
- broker `.env.example` contains an Argon2id hash that satisfies the minimum policy
- `argon2id-parameters.json` remains at or above the OWASP minimum
- broker runtime verification command passes for the configured confidential clients

## Command

```bash
bash infra/qa/run-argon2id-secret-policy-gate.sh
```

## Evidence

- static scan report JSON
- static scan console log
- broker Pest output
- broker runtime verification output
