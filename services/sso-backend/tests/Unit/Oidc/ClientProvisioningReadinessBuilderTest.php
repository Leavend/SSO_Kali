<?php

declare(strict_types=1);

use App\Services\Oidc\ClientProvisioningReadinessBuilder;
use App\Support\Oidc\ClientIntegrationDraft;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://sso.example.com');
});

it('builds JIT provisioning manifest with OIDC schemas', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'JIT Portal',
        clientId: 'jit-portal',
        environment: 'development',
        clientType: 'public',
        appBaseUrl: 'https://jit.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'owner@jit.example',
        provisioning: 'jit',
    );

    $manifest = $builder->build($draft);

    expect($manifest['mode'])->toBe('jit')
        ->and($manifest['requiredSchemas'])->toBe(['OIDC ID token claims', 'UserInfo profile claims'])
        ->and($manifest['requiredSchemas'])->not->toContain('SCIM User resource');
});

it('builds SCIM provisioning manifest with SCIM schemas and discovery', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'SCIM Portal',
        clientId: 'scim-portal',
        environment: 'live',
        clientType: 'confidential',
        appBaseUrl: 'https://scim.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'admin@scim.example',
        provisioning: 'scim',
    );

    $manifest = $builder->build($draft);

    expect($manifest['mode'])->toBe('scim')
        ->and($manifest['requiredSchemas'])->toBe([
            'SCIM User resource',
            'SCIM Group resource',
            'ServiceProviderConfig discovery',
        ])
        ->and($manifest['groupMapping'])->toContain('SCIM Groups -> local roles')
        ->and($manifest['groupMapping'])->toContain('SCIM memberships -> authorization grants');
});

it('includes owner email in audit evidence', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'Audited App',
        clientId: 'audited-app',
        environment: 'live',
        clientType: 'confidential',
        appBaseUrl: 'https://audited.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'compliance@audited.example',
        provisioning: 'jit',
    );

    $manifest = $builder->build($draft);

    expect($manifest['auditEvidence'])->toContain('Owner approval from compliance@audited.example')
        ->and($manifest['auditEvidence'])->toContain('Exact redirect and logout URI review')
        ->and($manifest['auditEvidence'])->toContain('Provisioning mode jit recorded in admin audit log');
});

it('returns correct risk gates for live environment', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'Live App',
        clientId: 'live-app',
        environment: 'live',
        clientType: 'confidential',
        appBaseUrl: 'https://live.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'owner@live.example',
        provisioning: 'jit',
    );

    $manifest = $builder->build($draft);

    expect($manifest['riskGates'][0])->toBe('Canary cohort before full cutover')
        ->and($manifest['riskGates'])->toContain('Refresh token rotation verified')
        ->and($manifest['riskGates'])->toContain('Back-channel logout smoke test passed');
});

it('returns correct risk gates for development environment', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'Dev App',
        clientId: 'dev-app',
        environment: 'development',
        clientType: 'public',
        appBaseUrl: 'https://dev.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'dev@dev.example',
        provisioning: 'jit',
    );

    $manifest = $builder->build($draft);

    expect($manifest['riskGates'][0])->toBe('Isolated dev callback')
        ->and($manifest['riskGates'])->toContain('Refresh token rotation verified')
        ->and($manifest['riskGates'])->toContain('Back-channel logout smoke test passed');
});

it('includes SCIM deprovisioning steps', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'SCIM Deprov App',
        clientId: 'scim-deprov-app',
        environment: 'live',
        clientType: 'confidential',
        appBaseUrl: 'https://scim-deprov.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'admin@scim-deprov.example',
        provisioning: 'scim',
    );

    $manifest = $builder->build($draft);

    expect($manifest['deprovisioning'])->toBe([
        'SCIM active=false disables local account before next login',
        'Back-channel logout revokes sessions by sid',
    ]);
});

it('includes JIT deprovisioning steps', function (): void {
    $builder = app(ClientProvisioningReadinessBuilder::class);

    $draft = new ClientIntegrationDraft(
        appName: 'JIT Deprov App',
        clientId: 'jit-deprov-app',
        environment: 'development',
        clientType: 'public',
        appBaseUrl: 'https://jit-deprov.example',
        callbackPath: '/auth/callback',
        logoutPath: '/auth/backchannel/logout',
        ownerEmail: 'dev@jit-deprov.example',
        provisioning: 'jit',
    );

    $manifest = $builder->build($draft);

    expect($manifest['deprovisioning'])->toBe([
        'Back-channel logout revokes sessions by sid',
        'Next login revalidates SSO account state',
    ]);
});
