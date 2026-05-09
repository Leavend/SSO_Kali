<?php

declare(strict_types=1);

it('locks the complete externalIdp external idp aggregate evidence set', function (): void {
    foreach (externalIdp_external_idp_registry_contracts() as $relativePath => $needles) {
        $content = externalIdp_external_idp_registry_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('maps externalIdp registry to external idp use cases and actors', function (): void {
    expect(externalIdp_external_idp_registry_use_cases())->toBe([
        'UC-08' => 'Login via Portal SSO can select a configured OIDC IdP.',
        'UC-09' => 'Laravel SSO validates IdP-backed SSO login sessions.',
        'UC-22' => 'Laravel SSO validates external IdP token metadata before trusting claims.',
        'UC-36' => 'Administrator can manage IdP registry configuration.',
        'UC-46' => 'Administrator can inspect redacted IdP registry audit trail.',
        'UC-48' => 'Administrator can inspect IdP health/status metadata.',
        'UC-49' => 'External IdP login completes through redirect callback and subject linking.',
        'UC-50' => 'External IdP failover selects a healthy primary or backup provider safely.',
    ]);
});

it('maps externalIdp aggregate coverage to implementation domains', function (): void {
    $coverage = externalIdp_external_idp_coverage_matrix();

    expect(array_keys($coverage))->toBe([
        'registry',
        'discovery_metadata',
        'jwks_and_signature',
        'authentication_redirect',
        'callback_token_exchange',
        'subject_linking',
        'failover_policy',
        'health_readiness',
        'claims_mapping',
        'security_incidents',
        'login_e2e',
        'production_smoke',
        'admin_management',
    ]);

    foreach ($coverage as $domain => $evidence) {
        expect($evidence, "{$domain} must have evidence files")->not->toBeEmpty();

        foreach ($evidence as $relativePath) {
            expect(externalIdp_external_idp_registry_file($relativePath), "{$domain}: {$relativePath} must exist")
                ->toBeString()
                ->not->toBe('');
        }
    }
});

it('keeps every externalIdp aggregate dependency wired into ci', function (): void {
    $ci = externalIdp_external_idp_registry_file('../../.github/workflows/ci.yml');

    foreach (externalIdp_external_idp_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

/**
 * @return array<string, list<string>>
 */
function externalIdp_external_idp_registry_contracts(): array
{
    return [
        'database/migrations/2026_05_09_000001_create_external_identity_providers_table.php' => [
            'external_identity_providers',
            'client_secret_encrypted',
            'tls_validation_enabled',
            'signature_validation_enabled',
            'is_backup',
        ],
        'app/Models/ExternalIdentityProvider.php' => [
            'ExternalIdentityProvider',
            'allowed_algorithms',
            'client_secret_encrypted',
            'health_status',
        ],
        'app/Services/ExternalIdp/ExternalIdentityProviderRegistry.php' => [
            'assertHttps',
            'Crypt::encryptString',
            'publicView',
            'has_client_secret',
        ],
        'app/Actions/ExternalIdp/CreateExternalIdentityProviderAction.php' => [
            'external_idp.create',
            'external_idp.registry_created',
            'AdminAuditEventStore',
            'Arr::except',
        ],
        'tests/Feature/ExternalIdp/ExternalIdentityProviderRegistryContractTest.php' => [
            'secure production defaults',
            'rejects non-https',
            'without leaking client secret material',
            'tamper-evident audit evidence',
        ],
        'app/Services/ExternalIdp/ExternalIdpDiscoveryService.php' => [
            '{$field} must use HTTPS',
            'External IdP discovery document is invalid',
            'staleCacheKey',
            'response_types_supported',
        ],
        'app/Actions/ExternalIdp/RefreshExternalIdpDiscoveryAction.php' => [
            'external_idp.discovery.refresh',
            'external_idp.discovery_refreshed',
            'external_idp.discovery_failed',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpDiscoveryContractTest.php' => [
            'fetches validates caches',
            'rejects issuer mismatch',
            'uses stale discovery cache',
            'audits discovery refresh success and failure',
        ],
        'app/Services/ExternalIdp/ExternalIdpJwksService.php' => [
            'jwks_uri',
            'External IdP JWKS document is invalid',
            'staleCacheKey',
            '$algorithm !== \'none\'',
        ],
        'app/Actions/ExternalIdp/RefreshExternalIdpJwksAction.php' => [
            'external_idp.jwks.refresh',
            'external_idp.jwks_refreshed',
            'external_idp.jwks_failed',
        ],
        'app/Services/ExternalIdp/ExternalIdpAuthenticationRedirectService.php' => [
            'authorization_endpoint',
            'code_challenge_method',
            'external-idp:auth-state',
            'External IdP callback URL must use HTTPS',
        ],
        'app/Actions/ExternalIdp/CreateExternalIdpAuthenticationRedirectAction.php' => [
            'external_idp.auth.redirect',
            'external_idp.auth_redirect_created',
            'external_idp.auth_redirect_failed',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpAuthenticationRedirectContractTest.php' => [
            'OIDC conformant external idp authorization redirect',
            'rejects disabled unhealthy and non-https',
            'audits external idp auth redirect success and failure',
        ],
        'app/Services/ExternalIdp/ExternalIdpTokenExchangeService.php' => [
            'grant_type',
            'authorization_code',
            'External IdP id_token signature validation failed',
            'External IdP nonce claim mismatch',
        ],
        'app/Actions/ExternalIdp/ExchangeExternalIdpCallbackTokenAction.php' => [
            'external_idp.callback.exchange',
            'external_idp.callback_exchange_succeeded',
            'external_idp.callback_exchange_failed',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpCallbackTokenExchangeContractTest.php' => [
            'exchanges an external idp callback authorization code',
            'rejects invalid replayed state and non-https token endpoint',
            'rejects issuer nonce algorithm and kid validation failures',
            'audits callback token exchange success and failure',
        ],
        'database/migrations/2026_05_09_000002_create_external_subject_links_table.php' => [
            'external_subject_links',
            'provider_key',
            'external_subject',
        ],
        'app/Services/ExternalIdp/ExternalSubjectAccountMapper.php' => [
            'External IdP email must be verified before linking an existing account',
            'External IdP exchange provider mismatch',
            'Mapped local account is disabled',
        ],
        'app/Actions/ExternalIdp/LinkExternalSubjectAccountAction.php' => [
            'external_idp.account.link',
            'external_idp.account_linked',
            'external_idp.account_link_failed',
        ],
        'tests/Feature/ExternalIdp/ExternalSubjectAccountMappingContractTest.php' => [
            'creates a new local external user',
            'links verified external subject to an existing local account',
            'prevents email takeover',
            'audits account mapping success and failure',
        ],
        'app/Services/ExternalIdp/ExternalIdpFailoverPolicy.php' => [
            'No healthy external IdP provider is available',
            'backup_failover',
            'preferred_primary',
            'preferred_backup',
        ],
        'app/Actions/ExternalIdp/SelectExternalIdpForAuthenticationAction.php' => [
            'external_idp.failover.select',
            'external_idp.failover_selected',
            'external_idp.failover_unavailable',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpFailoverPolicyContractTest.php' => [
            'selects the highest priority healthy primary provider',
            'fails over to the highest priority backup provider',
            'fails closed when every external idp provider is unavailable',
            'deterministic provider key ordering',
            'excludes disabled and unhealthy providers',
            'audits failover selection success and unavailable failure',
        ],
        'app/Services/ExternalIdp/ExternalIdpHealthProbeService.php' => [
            'readinessSummary',
            'last_health_checked_at',
            'health_timeout_seconds',
            'External IdP discovery health probe failed validation',
        ],
        'app/Actions/ExternalIdp/ProbeExternalIdpHealthAction.php' => [
            'external_idp.health.probe',
            'external_idp.health_healthy',
            'external_idp.health_unhealthy',
        ],
        'app/Services/System/ReadinessProbeService.php' => [
            'external_idps',
            'readinessSummary',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpHealthReadinessContractTest.php' => [
            'marks an enabled external idp healthy',
            'marks external idp unhealthy',
            'does not perform network probe for disabled',
            'keeps readiness endpoint shallow',
            'audits health probe success and failure',
        ],
        'database/migrations/2026_05_09_000003_create_external_idp_claim_mappings_table.php' => [
            'external_idp_claim_mappings',
            'subject_paths',
            'require_verified_email',
        ],
        'app/Models/ExternalIdpClaimMapping.php' => [
            'ExternalIdpClaimMapping',
            'subject_paths',
            'require_verified_email',
        ],
        'app/Services/ExternalIdp/ExternalIdpClaimsMapper.php' => [
            'External IdP required claim',
            'require_verified_email',
            'safeSnapshot',
        ],
        'app/Actions/ExternalIdp/MapExternalIdpClaimsAction.php' => [
            'external_idp.claims.map',
            'external_idp.claims_mapped',
            'external_idp.claims_mapping_failed',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpClaimsMappingContractTest.php' => [
            'maps default oidc claims',
            'maps custom nested claims',
            'rejects missing required custom claims',
            'integrates raw claims mapping',
            'audits claims mapping success and failure',
        ],
        'app/Support/Security/SensitiveAuditContextRedactor.php' => [
            'SensitiveAuditContextRedactor',
            'access_token',
            'client_secret',
            'code_verifier',
        ],
        'app/Actions/ExternalIdp/RecordExternalIdpSecurityIncidentAction.php' => [
            'external_idp.security_incident',
            'severity',
            'classification',
            'external_identity_provider',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpSecurityIncidentAuditContractTest.php' => [
            'records centralized external idp security incidents',
            'records auth redirect failure',
            'records callback exchange failure',
            'records account link takeover protection failure',
            'keeps external idp security incident audit events hash chained',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpDiscoverySignatureContractTest.php' => [
            'enforces https issuer aligned discovery endpoints',
            'persists trusted discovery metadata only after issuer',
            'accepts only allowed rs256 signed id tokens',
            'rejects unsigned disallowed algorithm unknown kid',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpLoginE2EContractTest.php' => [
            'completes external idp login from provider selection',
            'keeps external idp login idempotent',
            'fails closed when external idp login callback uses replayed state',
            'audits external idp login lifecycle without leaking callback tokens',
        ],
        'tests/Feature/DevOps/ExternalIdpProductionSmokeEvidenceTest.php' => [
            'externalIdp production smoke secret-free',
            'RUN_FR005_PRODUCTION_SMOKE',
            'sso-backend-external-idp-production-smoke.sh',
        ],
        '../../scripts/sso-backend-external-idp-production-smoke.sh' => [
            'https://api-sso.timeh.my.id',
            'external_idps',
            'External IdP production smoke completed successfully without secrets or tokens',
        ],
        '../../docs/devops/sso-backend-external-idp-production-smoke.md' => [
            'RUN_FR005_PRODUCTION_SMOKE=true',
            'Evidence to Retain',
            'without secrets or tokens',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpJwksContractTest.php' => [
            'fetches validates caches and resolves',
            'rejects non-https jwks uri unknown kid alg none',
            'uses stale jwks cache',
            'audits jwks refresh success and failure',
        ],
        'app/Http/Controllers/Admin/ExternalIdentityProviderController.php' => [
            'ListExternalIdentityProvidersAction',
            'StoreExternalIdentityProviderAction',
            'UpdateExternalIdentityProviderAction',
            'DeleteExternalIdentityProviderAction',
        ],
        'app/Support/Rbac/AdminPermission.php' => [
            'EXTERNAL_IDPS_READ',
            'EXTERNAL_IDPS_WRITE',
        ],
        'app/Support/Rbac/AdminMenu.php' => [
            'EXTERNAL_IDPS',
            'External IdPs',
            'EXTERNAL_IDPS_READ',
        ],
        'app/Services/Admin/AdminPermissionMatrix.php' => [
            'canReadExternalIdps',
            'canManageExternalIdps',
        ],
        'tests/Feature/Admin/ExternalIdentityProviderPermissionMatrixTest.php' => [
            'explicit read and write permissions',
            'dedicated external idps menu',
            'step-up and mfa policy',
        ],
        'tests/Feature/Admin/ExternalIdentityProviderCrudContractTest.php' => [
            'enforces external idp admin CRUD validation boundaries',
            'without leaking secrets',
            'preserves existing client secret',
            'writes hash chained redacted audit events',
        ],
        'tests/Feature/Admin/ExternalIdentityProviderManagementTest.php' => [
            'creates updates lists shows and deletes external idps',
            'validates admin external idp request contracts',
            'writes redacted admin audit events',
        ],
    ];
}

/**
 * @return array<string, string>
 */
function externalIdp_external_idp_registry_use_cases(): array
{
    return [
        'UC-08' => 'Login via Portal SSO can select a configured OIDC IdP.',
        'UC-09' => 'Laravel SSO validates IdP-backed SSO login sessions.',
        'UC-22' => 'Laravel SSO validates external IdP token metadata before trusting claims.',
        'UC-36' => 'Administrator can manage IdP registry configuration.',
        'UC-46' => 'Administrator can inspect redacted IdP registry audit trail.',
        'UC-48' => 'Administrator can inspect IdP health/status metadata.',
        'UC-49' => 'External IdP login completes through redirect callback and subject linking.',
        'UC-50' => 'External IdP failover selects a healthy primary or backup provider safely.',
    ];
}

/**
 * @return array<string, list<string>>
 */
function externalIdp_external_idp_coverage_matrix(): array
{
    return [
        'registry' => [
            'tests/Feature/ExternalIdp/ExternalIdentityProviderRegistryContractTest.php',
            'app/Services/ExternalIdp/ExternalIdentityProviderRegistry.php',
            'database/migrations/2026_05_09_000001_create_external_identity_providers_table.php',
        ],
        'discovery_metadata' => [
            'tests/Feature/ExternalIdp/ExternalIdpDiscoveryContractTest.php',
            'tests/Feature/ExternalIdp/ExternalIdpDiscoverySignatureContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpDiscoveryService.php',
            'app/Actions/ExternalIdp/RefreshExternalIdpDiscoveryAction.php',
        ],
        'jwks_and_signature' => [
            'tests/Feature/ExternalIdp/ExternalIdpJwksContractTest.php',
            'tests/Feature/ExternalIdp/ExternalIdpDiscoverySignatureContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpJwksService.php',
            'app/Actions/ExternalIdp/RefreshExternalIdpJwksAction.php',
        ],
        'authentication_redirect' => [
            'tests/Feature/ExternalIdp/ExternalIdpAuthenticationRedirectContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpAuthenticationRedirectService.php',
            'app/Actions/ExternalIdp/CreateExternalIdpAuthenticationRedirectAction.php',
        ],
        'callback_token_exchange' => [
            'tests/Feature/ExternalIdp/ExternalIdpCallbackTokenExchangeContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpTokenExchangeService.php',
            'app/Actions/ExternalIdp/ExchangeExternalIdpCallbackTokenAction.php',
        ],
        'subject_linking' => [
            'tests/Feature/ExternalIdp/ExternalSubjectAccountMappingContractTest.php',
            'app/Services/ExternalIdp/ExternalSubjectAccountMapper.php',
            'app/Actions/ExternalIdp/LinkExternalSubjectAccountAction.php',
            'database/migrations/2026_05_09_000002_create_external_subject_links_table.php',
        ],
        'failover_policy' => [
            'tests/Feature/ExternalIdp/ExternalIdpFailoverPolicyContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpFailoverPolicy.php',
            'app/Actions/ExternalIdp/SelectExternalIdpForAuthenticationAction.php',
        ],
        'health_readiness' => [
            'tests/Feature/ExternalIdp/ExternalIdpHealthReadinessContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpHealthProbeService.php',
            'app/Actions/ExternalIdp/ProbeExternalIdpHealthAction.php',
            'app/Services/System/ReadinessProbeService.php',
        ],
        'claims_mapping' => [
            'tests/Feature/ExternalIdp/ExternalIdpClaimsMappingContractTest.php',
            'app/Services/ExternalIdp/ExternalIdpClaimsMapper.php',
            'app/Actions/ExternalIdp/MapExternalIdpClaimsAction.php',
            'database/migrations/2026_05_09_000003_create_external_idp_claim_mappings_table.php',
        ],
        'security_incidents' => [
            'tests/Feature/ExternalIdp/ExternalIdpSecurityIncidentAuditContractTest.php',
            'app/Actions/ExternalIdp/RecordExternalIdpSecurityIncidentAction.php',
            'app/Support/Security/SensitiveAuditContextRedactor.php',
        ],
        'login_e2e' => [
            'tests/Feature/ExternalIdp/ExternalIdpLoginE2EContractTest.php',
            'tests/Feature/ExternalIdp/ExternalIdpAuthenticationRedirectContractTest.php',
            'tests/Feature/ExternalIdp/ExternalIdpCallbackTokenExchangeContractTest.php',
            'tests/Feature/ExternalIdp/ExternalSubjectAccountMappingContractTest.php',
        ],
        'production_smoke' => [
            'tests/Feature/DevOps/ExternalIdpProductionSmokeEvidenceTest.php',
            '../../scripts/sso-backend-external-idp-production-smoke.sh',
            '../../docs/devops/sso-backend-external-idp-production-smoke.md',
            '../../.github/workflows/deploy-main.yml',
        ],
        'admin_management' => [
            'tests/Feature/Admin/ExternalIdentityProviderCrudContractTest.php',
            'tests/Feature/Admin/ExternalIdentityProviderManagementTest.php',
            'tests/Feature/Admin/ExternalIdentityProviderPermissionMatrixTest.php',
            'app/Http/Controllers/Admin/ExternalIdentityProviderController.php',
        ],
    ];
}

/**
 * @return list<string>
 */
function externalIdp_external_idp_ci_tests(): array
{
    return [
        'ExternalIdpCoverageEvidenceTest.php',
        'ExternalIdentityProviderRegistryContractTest.php',
        'ExternalIdpDiscoveryContractTest.php',
        'ExternalIdpJwksContractTest.php',
        'ExternalIdpAuthenticationRedirectContractTest.php',
        'ExternalIdpCallbackTokenExchangeContractTest.php',
        'ExternalSubjectAccountMappingContractTest.php',
        'ExternalIdpFailoverPolicyContractTest.php',
        'ExternalIdpHealthReadinessContractTest.php',
        'ExternalIdpClaimsMappingContractTest.php',
        'ExternalIdpSecurityIncidentAuditContractTest.php',
        'ExternalIdpDiscoverySignatureContractTest.php',
        'ExternalIdpLoginE2EContractTest.php',
        'ExternalIdpProductionSmokeEvidenceTest.php',
        'ExternalIdentityProviderCrudContractTest.php',
        'ExternalIdentityProviderManagementTest.php',
        'ExternalIdentityProviderPermissionMatrixTest.php',
    ];
}

function externalIdp_external_idp_registry_file(string $relativePath): string
{
    return (string) file_get_contents(base_path($relativePath));
}
