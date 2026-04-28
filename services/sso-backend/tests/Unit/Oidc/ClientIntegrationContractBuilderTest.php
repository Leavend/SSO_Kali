<?php

declare(strict_types=1);

use App\Services\Oidc\ClientIntegrationContractBuilder;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('oidc_clients.clients', [
        'prototype-app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://app-a.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => [],
            'backchannel_logout_uri' => 'https://app-a.timeh.my.id/api/backchannel/logout',
        ],
    ]);
});

it('builds a broker-authoritative client integration contract', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);
    $draft = $builder->draftFrom([
        'appName' => 'Customer Portal',
        'clientId' => 'customer-portal',
        'environment' => 'development',
        'clientType' => 'confidential',
        'appBaseUrl' => 'https://customer-dev.timeh.my.id',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@company.com',
        'provisioning' => 'scim',
    ]);

    $contract = $builder->build($draft);

    expect($builder->validate($draft))->toBe([])
        ->and($contract['redirectUri'])->toBe('https://customer-dev.timeh.my.id/auth/callback')
        ->and($contract['scopes'])->toContain('sso:session.register')
        ->and($contract['env'])->toContain('SSO_CLIENT_SECRET=<store-in-vault>')
        ->and($contract['registryPatch'])->toContain("  'secret' => env('CUSTOMER_PORTAL_CLIENT_SECRET_HASH'),")
        ->and($contract['provisioningManifest']['mode'])->toBe('scim')
        ->and($contract['provisioningManifest']['requiredSchemas'])->toContain('SCIM User resource')
        ->and($contract['provisioningManifest']['deprovisioning'])->toContain('SCIM active=false disables local account before next login')
        ->and($contract['findings'])->toContain('RFC 7642 lifecycle covered by SCIM provisioning.');
});

it('rejects unsafe live clients and existing broker registrations', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);
    $draft = $builder->draftFrom([
        'appName' => 'Prototype App A',
        'clientId' => 'prototype-app-a',
        'environment' => 'live',
        'clientType' => 'public',
        'appBaseUrl' => 'http://app-a.timeh.my.id',
        'callbackPath' => '/auth/*',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'not-an-email',
        'provisioning' => 'jit',
    ]);

    expect($builder->validate($draft))
        ->toContain('Live client wajib memakai HTTPS.')
        ->toContain('Callback path tidak boleh wildcard.')
        ->toContain('Owner email harus valid.')
        ->toContain('Client ID sudah terdaftar di broker.');
});

it('rejects non-canonical origins and ambiguous callback paths', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);
    $draft = $builder->draftFrom([
        'appName' => 'Customer Portal',
        'clientId' => 'customer-portal',
        'environment' => 'live',
        'clientType' => 'public',
        'appBaseUrl' => 'https://user:secret@customer.timeh.my.id/admin?next=/home#token',
        'callbackPath' => '//evil.example/callback',
        'logoutPath' => '/../logout?token=leak',
        'ownerEmail' => 'owner@company.com',
        'provisioning' => 'jit',
    ]);

    expect($builder->validate($draft))->toBe([
        'Base URL tidak boleh memuat credentials.',
        'Base URL hanya boleh berisi origin tanpa path, query, atau fragment.',
        'Callback path tidak boleh diawali //.',
        'Logout path tidak boleh mengandung query atau fragment.',
        'Logout path tidak boleh mengandung traversal.',
    ]);
});

it('canonicalizes origins before emitting exact redirect uri artifacts', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);
    $draft = $builder->draftFrom([
        'appName' => 'Customer Portal',
        'clientId' => 'customer-portal',
        'environment' => 'live',
        'clientType' => 'public',
        'appBaseUrl' => 'HTTPS://Customer-Dev.Timeh.My.ID:443/',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@company.com',
        'provisioning' => 'jit',
    ]);

    $contract = $builder->build($draft);

    expect($builder->validate($draft))->toBe([])
        ->and($contract['redirectUri'])->toBe('https://customer-dev.timeh.my.id/auth/callback')
        ->and($contract['registryPatch'])->toContain("  'post_logout_redirect_uris' => ['https://customer-dev.timeh.my.id'],");
});
