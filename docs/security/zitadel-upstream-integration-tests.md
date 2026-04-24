# ZITADEL Upstream Integration Tests

## Covered checks

- Broker authorize redirect uses `/oauth/v2/authorize`.
- Broker token exchange uses `/oauth/v2/token`.
- Broker JWKS verification resolves `/oauth/v2/keys`.
- Broker end-session URL resolves `/oidc/v1/end_session`.
- Discovery responses with custom endpoint paths do not override the canonical contract.

## Test surfaces

- `tests/Unit/Oidc/ZitadelEndpointContractTest.php`
- `tests/Unit/Oidc/ZitadelMetadataServiceTest.php`
- `tests/Unit/Oidc/ZitadelBrokerServiceTest.php`
- `tests/Feature/Oidc/AuthorizationBrokerFlowTest.php`
