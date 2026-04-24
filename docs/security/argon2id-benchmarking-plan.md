# Argon2id Benchmarking Plan

## Objective

Confirm that the selected Argon2id parameters remain safe and operational on the target VPS class.

## Current default

- memory cost: 65536 KiB
- time cost: 4
- threads: 2

These settings exceed the OWASP baseline used by this program.

## Benchmark steps

1. Run `php artisan oidc:hash-secret --secret=benchmark-secret` ten times on the target VPS.
2. Record median and p95 wall-clock latency.
3. Repeat under light concurrent load from the application stack.
4. If p95 is too high for operational use, lower settings only with written approval and update this file plus `argon2id-parameters.json`.

## Guardrail

No parameter change may go below:
- memory cost: 19456 KiB
- time cost: 2
- threads: 1
