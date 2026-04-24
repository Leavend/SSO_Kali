# Admin MFA Canary Activation

## Goal
- Enable `ADMIN_PANEL_REQUIRE_MFA=true` only after at least one live admin account proves:
  - a second factor is enrolled in ZITADEL
  - the broker stores an MFA-compatible `amr` claim after a fresh login

## Readiness Gate
Run the live readiness checker first:

```bash
OUTPUT_FILE=/Users/leavend/Desktop/Project_SSO/test-results/admin-mfa-readiness.json \
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/audit-admin-mfa-readiness.sh
```

The checker returns one of these decisions:
- `READY_FOR_CANARY`
- `BLOCKED_ENROLLMENT`
- `BLOCKED_CLAIM_VALIDATION`
- `BLOCKED_POLICY`

Do not enable MFA enforcement unless the decision is `READY_FOR_CANARY`.

## Recommended Canary Sequence
1. Enroll one admin in ZITADEL OTP or U2F.
2. Perform one full hosted-login flow using that factor.
3. Re-run the readiness checker.
4. Set:

```bash
ADMIN_PANEL_MFA_ACCEPTED_AMR=mfa,otp,u2f
ADMIN_PANEL_REQUIRE_MFA=true
```

5. Recreate only `sso-backend`:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --no-deps sso-backend
docker compose --env-file .env.dev -f docker-compose.dev.yml exec -T sso-backend php artisan config:clear
```

## Live Verification
- Verify one MFA-enrolled admin can open `/dashboard`.
- Verify `/admin/api/me` succeeds for the MFA-enrolled admin.
- Verify one non-enrolled admin is denied with `mfa_required`.
- Verify destructive actions still require both freshness and MFA.

## Rollback
If MFA blocks valid admins unexpectedly:

```bash
ADMIN_PANEL_REQUIRE_MFA=false
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --no-deps sso-backend
docker compose --env-file .env.dev -f docker-compose.dev.yml exec -T sso-backend php artisan config:clear
```

## Notes
- Keep `ADMIN_PANEL_MFA_ACCEPTED_AMR` aligned with the real `amr` values observed in broker `login_contexts`.
- Do not widen accepted `amr` values without evidence from a real MFA-backed login.
