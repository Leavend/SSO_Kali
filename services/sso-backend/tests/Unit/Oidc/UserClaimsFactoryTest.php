<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\UserClaimsFactory;

beforeEach(function (): void {
    config()->set('sso.issuer', 'https://sso.example.com');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.ttl.access_token_minutes', 15);
    config()->set('sso.ttl.id_token_minutes', 15);
});

function makeUser(): User
{
    $user = new User;
    $user->forceFill([
        'id' => 1,
        'subject_id' => 'sub-uuid-001',
        'email' => 'ada@example.com',
        'given_name' => 'Ada',
        'family_name' => 'Lovelace',
        'display_name' => 'Ada Lovelace',
        'email_verified_at' => now(),
    ]);

    return $user;
}

function baseContext(array $overrides = []): array
{
    return [
        'client_id' => 'app-a',
        'session_id' => 'sid-001',
        'scope' => 'openid profile email',
        'nonce' => 'nonce-xyz',
        ...$overrides,
    ];
}

// ── Access Token Claims ──

it('includes required OIDC access token claims', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(), 'jti-001');

    expect($claims)
        ->toHaveKey('iss', 'https://sso.example.com')
        ->toHaveKey('aud', 'sso-resource-api')
        ->toHaveKey('sub', 'sub-uuid-001')
        ->toHaveKey('client_id', 'app-a')
        ->toHaveKey('token_use', 'access')
        ->toHaveKey('scope', 'openid profile email')
        ->toHaveKey('jti', 'jti-001')
        ->toHaveKey('sid', 'sid-001')
        ->toHaveKey('iat')
        ->toHaveKey('nbf')
        ->toHaveKey('exp');

    expect($claims['exp'] - $claims['iat'])->toBe(15 * 60);
});

// ── ID Token Claims ──

it('includes required OIDC id token claims', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->idTokenClaims(makeUser(), baseContext(), 'jti-002');

    expect($claims)
        ->toHaveKey('iss', 'https://sso.example.com')
        ->toHaveKey('aud', 'app-a')
        ->toHaveKey('sub', 'sub-uuid-001')
        ->toHaveKey('azp', 'app-a')
        ->toHaveKey('token_use', 'id')
        ->toHaveKey('jti', 'jti-002')
        ->toHaveKey('sid', 'sid-001')
        ->toHaveKey('nonce', 'nonce-xyz');
});

it('omits nonce from id_token when not provided in context', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->idTokenClaims(makeUser(), baseContext(['nonce' => null]), 'jti-003');

    expect($claims)->not->toHaveKey('nonce');
});

// ── Scope-Driven Claims ──

it('includes profile claims when scope contains profile', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(['scope' => 'openid profile']), 'jti-004');

    expect($claims)
        ->toHaveKey('name', 'Ada Lovelace')
        ->toHaveKey('given_name', 'Ada')
        ->toHaveKey('family_name', 'Lovelace');
});

it('excludes profile claims when scope does not contain profile', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(['scope' => 'openid']), 'jti-005');

    expect($claims)
        ->not->toHaveKey('name')
        ->not->toHaveKey('given_name')
        ->not->toHaveKey('family_name');
});

it('includes email claims when scope contains email', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(['scope' => 'openid email']), 'jti-006');

    expect($claims)
        ->toHaveKey('email', 'ada@example.com')
        ->toHaveKey('email_verified', true);
});

it('excludes email claims when scope does not contain email', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(['scope' => 'openid']), 'jti-007');

    expect($claims)
        ->not->toHaveKey('email')
        ->not->toHaveKey('email_verified');
});

// ── Auth Assurance Claims ──

it('passes through auth_time, amr, and acr from context', function (): void {
    $factory = new UserClaimsFactory;
    $context = baseContext([
        'auth_time' => 1_700_000_000,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    $claims = $factory->accessTokenClaims(makeUser(), $context, 'jti-008');

    expect($claims)
        ->toHaveKey('auth_time', 1_700_000_000)
        ->toHaveKey('amr', ['pwd', 'mfa'])
        ->toHaveKey('acr', 'urn:example:loa:2');
});

it('defaults auth_time to iat when not present in context', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(makeUser(), baseContext(), 'jti-009');

    expect($claims['auth_time'])->toBe($claims['iat']);
});

it('omits amr and acr when empty or null in context', function (): void {
    $factory = new UserClaimsFactory;
    $claims = $factory->accessTokenClaims(
        makeUser(),
        baseContext(['amr' => [], 'acr' => null]),
        'jti-010',
    );

    expect($claims)
        ->not->toHaveKey('amr')
        ->not->toHaveKey('acr');
});
