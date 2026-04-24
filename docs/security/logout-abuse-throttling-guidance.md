# Logout Abuse and Throttling Guidance

## Threats

- replay of captured logout tokens
- high-rate POST abuse against back-channel endpoints
- malformed logout tokens intended to force repeated verification work

## Current Controls

- signature verification before session destruction
- `jti` replay rejection
- strict `iss` and `aud` checks
- strict `events`, `exp`, and `iat` validation
- session cleanup only after successful validation

## Recommended Operational Responses

### Replay bursts

If replay alert counters increase:

1. inspect source IPs and reverse proxy logs
2. confirm whether the same `jti` is being retried
3. keep current fail-closed behavior

### Sustained malformed traffic

If invalid logout requests become noisy:

1. add reverse-proxy rate limiting to back-channel endpoints
2. preserve allowlisting for trusted broker origins when possible
3. alert on repeated `401` spikes

## Reverse Proxy Guidance

Suggested targets for rate limiting:

- `/api/backchannel/logout` on App A
- `/auth/backchannel/logout` on App B

Rate limiting must not block legitimate single logout traffic during normal use, so burst allowance should remain moderate.
