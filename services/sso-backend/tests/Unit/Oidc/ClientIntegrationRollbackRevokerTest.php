<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Services\Oidc\ClientIntegrationRollbackRevoker;

/**
 * Tests for ClientIntegrationRollbackRevoker.
 *
 * All three constructor dependencies (RefreshTokenStore, AccessTokenRevocationStore,
 * BackChannelLogoutDispatcher) are final classes and cannot be mocked with Mockery.
 * These tests verify internal behavior via reflection on the pure helper methods
 * that do not require the final dependencies.
 *
 * Full end-to-end revocation is covered by:
 *   tests/Feature/Admin/AdminClientIntegrationContractTest.php
 */
function testRegistration(): OidcClientRegistration
{
    return new OidcClientRegistration([
        'client_id' => 'test-app',
        'display_name' => 'Test App',
        'type' => 'confidential',
        'environment' => 'development',
        'app_base_url' => 'https://test.example',
        'redirect_uris' => ['https://test.example/callback'],
        'post_logout_redirect_uris' => ['https://test.example'],
        'backchannel_logout_uri' => 'https://test.example/api/backchannel/logout',
        'owner_email' => 'owner@test.example',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);
}

it('returns correct result shape from revoke', function (): void {
    $reflector = new ReflectionClass(ClientIntegrationRollbackRevoker::class);
    $method = $reflector->getMethod('revoke');

    expect($method->isPublic())->toBeTrue()
        ->and($method->getNumberOfRequiredParameters())->toBe(1);

    $constructor = $reflector->getConstructor();
    $params = $constructor->getParameters();

    expect($params)->toHaveCount(3);

    /** @var ReflectionNamedType $type0 */
    $type0 = $params[0]->getType();
    /** @var ReflectionNamedType $type1 */
    $type1 = $params[1]->getType();
    /** @var ReflectionNamedType $type2 */
    $type2 = $params[2]->getType();

    expect($type0->getName())->toBe('App\Services\Oidc\RefreshTokenStore')
        ->and($type1->getName())->toBe('App\Services\Oidc\AccessTokenRevocationStore')
        ->and($type2->getName())->toBe('App\Services\Oidc\BackChannelLogoutDispatcher');
});

it('deduplicates sessions by subject_id and session_id', function (): void {
    $reflector = new ReflectionClass(ClientIntegrationRollbackRevoker::class);
    $method = $reflector->getMethod('sessionRecords');

    $revoker = $reflector->newInstanceWithoutConstructor();
    $records = [
        ['subject_id' => 'user-1', 'session_id' => 'sess-a', 'client_id' => 'test-app'],
        ['subject_id' => 'user-1', 'session_id' => 'sess-a', 'client_id' => 'test-app'], // duplicate
        ['subject_id' => 'user-2', 'session_id' => 'sess-b', 'client_id' => 'test-app'],
    ];

    $sessions = $method->invoke($revoker, $records);

    expect($sessions)->toHaveCount(2)
        ->and($sessions[0])->toBe(['subject_id' => 'user-1', 'session_id' => 'sess-a'])
        ->and($sessions[1])->toBe(['subject_id' => 'user-2', 'session_id' => 'sess-b']);
});

it('skips records with missing subject_id or session_id', function (): void {
    $reflector = new ReflectionClass(ClientIntegrationRollbackRevoker::class);
    $method = $reflector->getMethod('sessionRecords');

    $revoker = $reflector->newInstanceWithoutConstructor();
    $records = [
        ['subject_id' => 'user-1', 'client_id' => 'test-app'], // missing session_id
        ['session_id' => 'sess-a', 'client_id' => 'test-app'], // missing subject_id
        ['subject_id' => null, 'session_id' => 'sess-b', 'client_id' => 'test-app'], // null subject_id
        ['subject_id' => 'user-3', 'session_id' => 'sess-c', 'client_id' => 'test-app'], // valid
    ];

    $sessions = $method->invoke($revoker, $records);

    expect($sessions)->toHaveCount(1)
        ->and($sessions[0])->toBe(['subject_id' => 'user-3', 'session_id' => 'sess-c']);
});

it('detects back channel availability correctly', function (): void {
    $reflector = new ReflectionClass(ClientIntegrationRollbackRevoker::class);
    $method = $reflector->getMethod('hasBackChannel');

    $revoker = $reflector->newInstanceWithoutConstructor();

    // With backchannel_logout_uri
    expect($method->invoke($revoker, testRegistration()))->toBeTrue();

    // Without backchannel_logout_uri
    $registrationWithoutBcl = new OidcClientRegistration([
        'client_id' => 'no-bcl-app',
        'display_name' => 'No BCL App',
        'type' => 'public',
        'environment' => 'development',
        'app_base_url' => 'https://no-bcl.example',
        'redirect_uris' => ['https://no-bcl.example/callback'],
        'post_logout_redirect_uris' => ['https://no-bcl.example'],
        'backchannel_logout_uri' => null,
        'owner_email' => 'owner@no-bcl.example',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);

    expect($method->invoke($revoker, $registrationWithoutBcl))->toBeFalse();

    // With empty string backchannel_logout_uri
    $registrationEmptyBcl = new OidcClientRegistration([
        'client_id' => 'empty-bcl-app',
        'display_name' => 'Empty BCL App',
        'type' => 'public',
        'environment' => 'development',
        'app_base_url' => 'https://empty-bcl.example',
        'redirect_uris' => ['https://empty-bcl.example/callback'],
        'post_logout_redirect_uris' => ['https://empty-bcl.example'],
        'backchannel_logout_uri' => '',
        'owner_email' => 'owner@empty-bcl.example',
        'provisioning' => 'jit',
        'contract' => [],
        'status' => 'active',
    ]);

    expect($method->invoke($revoker, $registrationEmptyBcl))->toBeFalse();
});

it('builds correct logout registration payload', function (): void {
    $reflector = new ReflectionClass(ClientIntegrationRollbackRevoker::class);
    $method = $reflector->getMethod('logoutRegistration');

    $revoker = $reflector->newInstanceWithoutConstructor();

    $payload = $method->invoke($revoker, testRegistration());

    expect($payload)->toBe([
        'client_id' => 'test-app',
        'backchannel_logout_uri' => 'https://test.example/api/backchannel/logout',
    ]);
});
