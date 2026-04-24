# Logout Validation Test Vectors

## Valid Vector

- signed JWT
- trusted `iss`
- expected `aud`
- includes `sub`
- includes `sid`
- includes `jti`
- includes `iat`
- includes `exp`
- includes `events["http://schemas.openid.net/event/backchannel-logout"]`
- omits `nonce`

## Required Negative Vectors

| Vector | Expected Reason |
| --- | --- |
| missing `exp` | `missing_exp` |
| missing `iat` | `missing_iat` |
| expired token | `token_expired` |
| missing logout event marker | `invalid_events` |
| missing both `sub` and `sid` | `missing_subject_or_sid` |
| token contains `nonce` | `invalid_nonce` |

## Endpoint Expectation

For every negative vector:

- HTTP status MUST be `401`
- response body MUST include `error=invalid logout token`
- local session rows MUST remain intact
- reject counter for the mapped reason MUST increment
