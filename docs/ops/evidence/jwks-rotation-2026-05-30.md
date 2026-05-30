# JWKS Rotation Drill Evidence Pack

> FR-002 / UC-80 — OIDC signing key rotation drill evidence.
> Staging drill dieksekusi via CI workflow pada VPS self-hosted runner
> untuk memverifikasi broker dan App B dapat memulihkan diri setelah
> rotasi `kid` JWKS.

## Drill Information

| Field | Value |
|---|---|
| Drill ID | `jwks-rotation-drill-001` |
| Execution timestamp (UTC) | 2026-05-30 |
| Trigger | Manual / CI (`jwks-rotation-simulation.yml`) |
| Runner | VPS self-hosted |
| Operator | Leavend |

## Artifacts

| Artifact | Path |
|---|---|
| Runbook | `docs/testing/jwks-rotation-staging-drill.md` |
| Staging drill script | `infra/qa/run-jwks-rotation-staging-drill.sh` |
| Simulation script | `infra/qa/run-jwks-rotation-simulation.sh` |
| CI workflow | `.github/workflows/jwks-rotation-simulation.yml` |
| Backend rotation command | `app/Console/Commands/RotateSigningKeysCommand.php` |
| Staging drill guide | `docs/testing/jwks-rotation-staging-drill.md` |

## Evidence Output

Evidence dari staging drill disimpan di `test-results/jwks-rotation-staging-drill/` pada
VPS self-hosted runner:

- `summary.md` — Ringkasan hasil drill
- `mock-jwks-server.log` — Log server JWKS mock (`tools/qa/mock-jwks-rotation-server.mjs`)
- `mock-jwks-state.json` — State JSON server JWKS mock
- `sso-backend-jwks-rotation.txt` — Hasil rotasi sisi broker SSO backend
- `app-b-jwks-rotation.txt` — Hasil rotasi sisi App B

## Acceptance Checklist

- [x] Staging drill script executable dengan PHP + Node lokal
- [x] Broker (`services/sso-backend`) recover setelah `kid` rotation
- [x] App B (`apps/app-b-laravel`) recover setelah `kid` rotation
- [x] Kedua component fail closed saat `kid` yang diminta tidak muncul
- [x] Evidence pack ditulis ke `test-results/jwks-rotation-staging-drill/`
- [x] CI workflow siap untuk eksekusi production rotation

## Operator Signoff

- **Operator:** Leavend
- **Role:** SRE
- **Signed at:** 2026-05-30T07:00:00Z
- **Status:** PASS (all gate criteria met)
