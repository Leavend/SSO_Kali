<?php

declare(strict_types=1);

use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\JwtRejectMetrics;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'https://sso.example');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.alg', 'ES256');
    config()->set('sso.jwt.local_allowed_algs', ['ES256']);
    config()->set('oidc_clients.clients.prototype-client', [
        'type' => 'public',
        'redirect_uris' => ['https://prototype.example/auth/callback'],
        'post_logout_redirect_uris' => ['https://prototype.example'],
    ]);

    Cache::flush();
});

it('accepts valid locally signed access tokens', function (): void {
    $guard = app(AccessTokenGuard::class);
    $claims = $guard->claimsFrom(localAccessToken());

    expect($claims['sub'])->toBe('subject-123');
    expect($claims['token_use'])->toBe('access');
});

it('rejects unsigned access tokens and records the reject reason', function (): void {
    $guard = app(AccessTokenGuard::class);
    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => $guard->claimsFrom(algorithmToken(localClaims(), 'none')))
        ->toThrow(RuntimeException::class, 'Unsigned');

    expect($metrics->count('alg_none'))->toBe(1);
});

it('rejects access tokens that omit the issued-at claim', function (): void {
    $guard = app(AccessTokenGuard::class);
    $metrics = app(JwtRejectMetrics::class);
    $token = app(SigningKeyService::class)->sign(localClaims(['iat' => null]));

    expect(fn () => $guard->claimsFrom($token))
        ->toThrow(RuntimeException::class, 'iat');

    expect($metrics->count('missing_iat'))->toBe(1);
});

it('rejects access tokens whose client is no longer active', function (): void {
    config()->set('oidc_clients.clients', []);

    $guard = app(AccessTokenGuard::class);
    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => $guard->claimsFrom(localAccessToken()))
        ->toThrow(RuntimeException::class, 'client is not active');

    expect($metrics->count('unknown_client'))->toBe(1);
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function localClaims(array $overrides = []): array
{
    return array_replace([
        'iss' => 'https://sso.example',
        'aud' => 'sso-resource-api',
        'sub' => 'subject-123',
        'sid' => 'shared-sid',
        'client_id' => 'prototype-client',
        'token_use' => 'access',
        'jti' => 'token-123',
        'iat' => time() - 5,
        'exp' => time() + 300,
    ], $overrides);
}

function localAccessToken(): string
{
    return app(SigningKeyService::class)->sign(localClaims());
}

/**
 * @param  array<string, mixed>  $claims
 */
function algorithmToken(array $claims, string $algorithm): string
{
    $header = encodeSegment(['typ' => 'JWT', 'alg' => $algorithm]);
    $payload = encodeSegment($claims);
    $signature = $algorithm === 'none' ? '' : 'signature';

    return sprintf('%s.%s.%s', $header, $payload, $signature);
}

/**
 * @param  array<string, mixed>  $value
 */
function encodeSegment(array $value): string
{
    return rtrim(strtr(base64_encode(json_encode($value, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
}
