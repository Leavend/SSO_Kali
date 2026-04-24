# OIDC Negative Test Matrix

| ID | Scenario | Input Fault | Expected Result | Covered By |
|---|---|---|---|---|
| OIDC-NEG-01 | Missing state | `/authorize` without `state` | `400 invalid_request`, metric `missing_state` increments | `AuthorizationBrokerFlowTest` |
| OIDC-NEG-02 | Missing nonce | `/authorize` without `nonce` | `400 invalid_request`, metric `missing_nonce` increments | `AuthorizationBrokerFlowTest` |
| OIDC-NEG-03 | Non-S256 PKCE | `/authorize` with `code_challenge_method=plain` | `400 invalid_request`, metric `invalid_code_challenge_method` increments | `AuthorizationBrokerFlowTest` |
| OIDC-NEG-04 | Missing code challenge | `/authorize` without `code_challenge` | `400 invalid_request`, metric `missing_code_challenge` increments | `AuthorizationBrokerFlowTest` |
| OIDC-NEG-05 | Nonce mismatch after upstream auth | callback receives token with wrong nonce | redirect error, no local session issued | `AuthorizationBrokerFlowTest`, client callback tests |
| OIDC-NEG-06 | App A builder regression | client authorize URL omits `S256` | test failure in CI | `src/lib/oidc.test.ts` |
| OIDC-NEG-07 | App B builder regression | client authorize URL omits `S256` | test failure in CI | `ClientFlowTest` |

## Operational Review Guidance

- A sudden rise in `missing_state` or `missing_nonce` usually indicates a client regression.
- A rise in `invalid_code_challenge_method` is high-signal for protocol probing or downgrade attempts.
- Any successful authorization request without `S256` is a release blocker.
