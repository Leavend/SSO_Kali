# OIDC Threat Rationale Summary

## Why `state` is mandatory

`state` protects the downstream client and broker callback from CSRF-style request substitution.
Without `state`, an attacker can attempt to inject an authorization response into the wrong browser flow.

## Why `nonce` is mandatory

`nonce` binds the authentication response to the initiating client transaction.
Without it, a valid `id_token` can be replayed into a different callback context.

## Why PKCE is mandatory

Authorization codes travel through user-agent redirects.
PKCE prevents a stolen code from being redeemed without the matching verifier.

## Why only `S256`

`S256` prevents downgrade to weaker verifier handling.
The platform intentionally disallows `plain` to eliminate downgrade ambiguity and align with the stricter ZITADEL requirement.

## Why reject before upstream redirect

If malformed requests are forwarded upstream, the broker loses control over local policy enforcement and telemetry.
Early rejection keeps the trust boundary local, auditable, and deterministic.

## Why runtime reject counters matter

Repeated invalid authorization requests can indicate:

- misconfigured clients
- active probing
- broken deployments
- downgrade attempts against PKCE

`pkce_reject_total{reason}` makes these failures observable without parsing application logs.
