<?php

declare(strict_types=1);

it('locks fr005 external idp registry domain model into backend evidence', function (): void {
    foreach (fr005_external_idp_registry_contracts() as $relativePath => $needles) {
        $content = fr005_external_idp_registry_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('maps fr005 registry to external idp use cases and actors', function (): void {
    expect(fr005_external_idp_registry_use_cases())->toBe([
        'UC-08' => 'Login via Portal SSO can select a configured OIDC IdP.',
        'UC-09' => 'Laravel SSO validates IdP-backed SSO login sessions.',
        'UC-36' => 'Administrator can manage IdP registry configuration.',
        'UC-46' => 'Administrator can inspect redacted IdP registry audit trail.',
        'UC-48' => 'Administrator can inspect IdP health/status metadata.',
    ]);
});

/**
 * @return array<string, list<string>>
 */
function fr005_external_idp_registry_contracts(): array
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
    ];
}

/**
 * @return array<string, string>
 */
function fr005_external_idp_registry_use_cases(): array
{
    return [
        'UC-08' => 'Login via Portal SSO can select a configured OIDC IdP.',
        'UC-09' => 'Laravel SSO validates IdP-backed SSO login sessions.',
        'UC-36' => 'Administrator can manage IdP registry configuration.',
        'UC-46' => 'Administrator can inspect redacted IdP registry audit trail.',
        'UC-48' => 'Administrator can inspect IdP health/status metadata.',
    ];
}

function fr005_external_idp_registry_file(string $relativePath): string
{
    return (string) file_get_contents(base_path($relativePath));
}
