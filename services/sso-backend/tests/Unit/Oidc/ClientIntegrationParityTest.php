<?php

declare(strict_types=1);

/**
 * Frontend-Backend validation parity contract.
 *
 * These tests verify the PHP (backend) side of the integration validation rules
 * documented in the parity contract between the admin frontend form and the
 * broker's ClientIntegrationContractBuilder.
 *
 * The frontend must enforce identical rules before submission. When adding or
 * modifying a rule here, the corresponding frontend validation in the admin
 * client registration form MUST be updated to match.
 *
 * Parity contract:
 *   Backend : ClientIntegrationContractBuilder::validate()
 *   Frontend: admin/src/lib/validation/clientIntegration.ts (or equivalent)
 */

use App\Services\Oidc\ClientIntegrationContractBuilder;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://sso.example.com');
    config()->set('oidc_clients.clients', []);
});

it('rejects empty required fields (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => '',
        'clientId' => '',
        'environment' => 'development',
        'clientType' => 'public',
        'appBaseUrl' => '',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => '',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->toContain('Nama aplikasi wajib diisi.')
        ->and($violations)->toContain('Client ID wajib diisi.')
        ->and($violations)->toContain('Base URL wajib diisi.')
        ->and($violations)->toContain('Owner email wajib diisi.');
});

it('rejects non-slug client IDs (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $invalidIds = ['My App', 'UPPER-CASE', 'under_score', 'a', '-starts-with-dash'];

    foreach ($invalidIds as $id) {
        $draft = $builder->draftFrom([
            'appName' => 'Test App',
            'clientId' => $id,
            'environment' => 'development',
            'clientType' => 'public',
            'appBaseUrl' => 'https://test.example',
            'callbackPath' => '/auth/callback',
            'logoutPath' => '/auth/backchannel/logout',
            'ownerEmail' => 'owner@test.example',
            'provisioning' => 'jit',
        ]);

        $violations = $builder->validate($draft);

        expect($violations)
            ->toContain('Client ID harus slug 3-63 karakter.');
    }
});

it('rejects non-canonical base URLs with credentials, path, query, fragment (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => 'Portal',
        'clientId' => 'portal-app',
        'environment' => 'live',
        'clientType' => 'confidential',
        'appBaseUrl' => 'https://user:pass@portal.example/admin?next=/home#section',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@portal.example',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->toContain('Base URL tidak boleh memuat credentials.')
        ->and($violations)->toContain('Base URL hanya boleh berisi origin tanpa path, query, atau fragment.');
});

it('rejects wildcard callback paths (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => 'Wildcard App',
        'clientId' => 'wildcard-app',
        'environment' => 'development',
        'clientType' => 'public',
        'appBaseUrl' => 'https://wildcard.example',
        'callbackPath' => '/auth/*',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@wildcard.example',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->toContain('Callback path tidak boleh wildcard.');
});

it('rejects path traversal in logout paths (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => 'Traversal App',
        'clientId' => 'traversal-app',
        'environment' => 'development',
        'clientType' => 'public',
        'appBaseUrl' => 'https://traversal.example',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/../logout',
        'ownerEmail' => 'owner@traversal.example',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->toContain('Logout path tidak boleh mengandung traversal.');
});

it('rejects HTTP for live environment (parity: both reject)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => 'Insecure Live App',
        'clientId' => 'insecure-live',
        'environment' => 'live',
        'clientType' => 'confidential',
        'appBaseUrl' => 'http://insecure-live.example',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@insecure-live.example',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->toContain('Live client wajib memakai HTTPS.');
});

it('allows HTTP localhost for development environment (parity: both allow)', function (): void {
    $builder = app(ClientIntegrationContractBuilder::class);

    $draft = $builder->draftFrom([
        'appName' => 'Local Dev App',
        'clientId' => 'local-dev-app',
        'environment' => 'development',
        'clientType' => 'public',
        'appBaseUrl' => 'http://localhost:3000',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'dev@local.example',
        'provisioning' => 'jit',
    ]);

    $violations = $builder->validate($draft);

    expect($violations)->not->toContain('Live client wajib memakai HTTPS.')
        ->and($violations)->toBe([]);
});
