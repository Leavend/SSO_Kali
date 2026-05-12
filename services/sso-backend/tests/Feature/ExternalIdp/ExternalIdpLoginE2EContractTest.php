<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\CreateExternalIdpAuthenticationRedirectAction;
use App\Actions\ExternalIdp\ExchangeExternalIdpCallbackTokenAction;
use App\Actions\ExternalIdp\LinkExternalSubjectAccountAction;
use App\Actions\ExternalIdp\SelectExternalIdpForAuthenticationAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\User;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);
});

it('completes external idp login from provider selection to durable local subject link', function (): void {
    [$provider, $keys] = externalIdpLoginProvider();

    $selection = app(SelectExternalIdpForAuthenticationAction::class)->execute('keycloak-login', 'req-external-idp-login-select');
    $selected = $selection['provider'];
    Http::fake([$provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200)]);
    $redirect = app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($selected, [
        'request_id' => 'req-external-idp-login-e2e',
        'return_to' => '/portal/profile',
    ]);

    Http::fake([
        $provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'upstream-access-token-must-not-leak',
            'refresh_token' => 'upstream-refresh-token-must-not-leak',
            'id_token' => externalIdpLoginIdToken($provider, $redirect['nonce'], $keys),
            'token_type' => 'Bearer',
            'expires_in' => 300,
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpLoginJwks($keys), 200),
    ]);

    $exchange = app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'auth-code-login-e2e',
        'req-external-idp-login-callback',
    );
    $linked = app(LinkExternalSubjectAccountAction::class)->execute(
        $provider,
        $exchange,
        'req-external-idp-login-link',
    );

    expect($redirect['redirect_url'])->toStartWith($provider->authorization_endpoint)
        ->and($redirect['provider_key'])->toBe('keycloak-login')
        ->and($exchange['provider_key'])->toBe('keycloak-login')
        ->and($exchange['subject'])->toBe('external-login-user-1')
        ->and($exchange['return_to'])->toBe('/portal/profile')
        ->and($linked['created_user'])->toBeTrue()
        ->and($linked['created_link'])->toBeTrue()
        ->and($linked['user'])->toBeInstanceOf(User::class)
        ->and($linked['user']->email)->toBe('login-user@example.com')
        ->and($linked['user']->local_account_enabled)->toBeFalse()
        ->and($linked['link'])->toBeInstanceOf(ExternalSubjectLink::class)
        ->and($linked['link']->provider_key)->toBe('keycloak-login')
        ->and($linked['link']->external_subject)->toBe('external-login-user-1')
        ->and(app(ExternalIdpAuthenticationRedirectService::class)->peek($redirect['state']))->toBeNull();

    Http::assertSent(fn ($request): bool => $request->url() === $provider->token_endpoint
        && $request['grant_type'] === 'authorization_code'
        && $request['code'] === 'auth-code-login-e2e'
        && $request['redirect_uri'] === 'https://api-sso.timeh.my.id/external-idp/callback'
        && is_string($request['code_verifier']));
});

it('keeps external idp login idempotent for returning linked subjects', function (): void {
    [$provider, $keys] = externalIdpLoginProvider('keycloak-returning');

    $first = externalIdpLoginExchangeAndLink($provider, $keys, 'returning-code-1');
    $second = app(LinkExternalSubjectAccountAction::class)->execute($provider, [
        'provider_key' => 'keycloak-returning',
        'subject' => 'external-login-user-1',
        'email' => 'login-user@example.com',
        'name' => 'External Login User',
        'return_to' => '/portal/profile',
        'claims' => [
            'iss' => $provider->issuer,
            'sub' => 'external-login-user-1',
            'aud' => $provider->client_id,
            'email' => 'login-user@example.com',
            'email_verified' => true,
            'name' => 'External Login User',
        ],
    ], 'req-external-idp-login-returning-link');

    expect($first['created_user'])->toBeTrue()
        ->and($first['created_link'])->toBeTrue()
        ->and($second['created_user'])->toBeFalse()
        ->and($second['created_link'])->toBeFalse()
        ->and($second['user']->id)->toBe($first['user']->id)
        ->and(ExternalSubjectLink::query()
            ->where('provider_key', 'keycloak-returning')
            ->where('external_subject', 'external-login-user-1')
            ->count())->toBe(1);
});

it('fails closed when external idp login callback uses replayed state or unverified takeover email', function (): void {
    [$provider, $keys] = externalIdpLoginProvider('keycloak-failure');
    $redirect = externalIdpLoginAuthState($provider);
    User::factory()->create([
        'email' => 'login-user@example.com',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    Http::fake([
        $provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'must-not-leak',
            'id_token' => externalIdpLoginIdToken($provider, $redirect['nonce'], $keys, [
                'email_verified' => false,
            ]),
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpLoginJwks($keys), 200),
    ]);

    $exchange = app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'auth-code-takeover',
        'req-external-idp-login-takeover-callback',
    );

    expect(fn () => app(LinkExternalSubjectAccountAction::class)->execute(
        $provider,
        $exchange,
        'req-external-idp-login-takeover-link',
    ))->toThrow(RuntimeException::class, 'External IdP email must be verified before linking an existing account.');

    expect(fn () => app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'auth-code-replay',
        'req-external-idp-login-replay',
    ))->toThrow(RuntimeException::class, 'External IdP authentication state is invalid or expired.');
});

it('audits external idp login lifecycle without leaking callback tokens', function (): void {
    [$provider, $keys] = externalIdpLoginProvider('keycloak-audit');

    externalIdpLoginExchangeAndLink($provider, $keys, 'audit-code-1');

    $redirect = externalIdpLoginAuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'must-not-leak',
            'refresh_token' => 'must-not-leak',
            'id_token' => externalIdpLoginIdToken($provider, $redirect['nonce'], $keys, [
                'nonce' => 'wrong-nonce',
            ]),
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpLoginJwks($keys), 200),
    ]);

    expect(fn () => app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'audit-code-failure',
        'req-external-idp-login-audit-failure',
    ))->toThrow(RuntimeException::class, 'External IdP nonce claim mismatch.');

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', [
            'external_idp.failover_selected',
            'external_idp.auth_redirect_created',
            'external_idp.callback_exchange_succeeded',
            'external_idp.callback_exchange_failed',
            'external_idp.account_linked',
            'external_idp.security_incident',
        ])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events->pluck('taxonomy')->all())->toContain('external_idp.auth_redirect_created')
        ->and($events->pluck('taxonomy')->all())->toContain('external_idp.callback_exchange_succeeded')
        ->and($events->pluck('taxonomy')->all())->toContain('external_idp.callback_exchange_failed')
        ->and($events->pluck('taxonomy')->all())->toContain('external_idp.account_linked')
        ->and($events->pluck('taxonomy')->all())->toContain('external_idp.security_incident')
        ->and($encoded)->toContain('req-external-idp-login-audit-failure')
        ->and($encoded)->not->toContain('must-not-leak')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('code_verifier');
});

/**
 * @return array{0: ExternalIdentityProvider, 1: array{private: string, public_jwk: array<string, mixed>}}
 */
function externalIdpLoginProvider(string $providerKey = 'keycloak-login'): array
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';
    $provider = ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Login',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret_encrypted' => null,
        'authorization_endpoint' => $issuer.'/protocol/openid-connect/auth',
        'token_endpoint' => $issuer.'/protocol/openid-connect/token',
        'userinfo_endpoint' => $issuer.'/protocol/openid-connect/userinfo',
        'jwks_uri' => $issuer.'/protocol/openid-connect/certs',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => true,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);

    return [$provider, externalIdpLoginKeys()];
}

/**
 * @param  array{private: string, public_jwk: array<string, mixed>}  $keys
 * @param  array<string, mixed>  $claimOverrides
 * @return array{user: User, link: ExternalSubjectLink, created_user: bool, created_link: bool}
 */
function externalIdpLoginExchangeAndLink(
    ExternalIdentityProvider $provider,
    array $keys,
    string $code,
    array $claimOverrides = [],
): array {
    $redirect = externalIdpLoginAuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'upstream-access-token-must-not-leak',
            'refresh_token' => 'upstream-refresh-token-must-not-leak',
            'id_token' => externalIdpLoginIdToken($provider, $redirect['nonce'], $keys, $claimOverrides),
            'token_type' => 'Bearer',
            'expires_in' => 300,
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpLoginJwks($keys), 200),
    ]);

    $exchange = app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        $code,
        'req-external-idp-login-callback',
    );

    return app(LinkExternalSubjectAccountAction::class)->execute(
        $provider,
        $exchange,
        'req-external-idp-login-link',
    );
}

/**
 * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
 */
function externalIdpLoginAuthState(ExternalIdentityProvider $provider): array
{
    Http::fake([$provider->metadata_url => Http::response(externalIdpLoginDiscovery($provider), 200)]);

    return app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($provider, [
        'request_id' => 'req-external-idp-login-state',
        'return_to' => '/portal/profile',
    ]);
}

/**
 * @return array<string, mixed>
 */
function externalIdpLoginDiscovery(ExternalIdentityProvider $provider): array
{
    return [
        'issuer' => $provider->issuer,
        'authorization_endpoint' => $provider->authorization_endpoint,
        'token_endpoint' => $provider->token_endpoint,
        'userinfo_endpoint' => $provider->userinfo_endpoint,
        'jwks_uri' => $provider->jwks_uri,
        'response_types_supported' => ['code'],
        'subject_types_supported' => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
    ];
}

/**
 * @return array{private: string, public_jwk: array<string, mixed>}
 */
function externalIdpLoginKeys(): array
{
    $privateKey = openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_RSA,
        'private_key_bits' => 2048,
    ]);
    openssl_pkey_export($privateKey, $privatePem);
    $details = openssl_pkey_get_details($privateKey);

    return [
        'private' => $privatePem,
        'public_jwk' => [
            'kid' => 'kid-login-primary',
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'n' => rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '='),
            'e' => rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '='),
        ],
    ];
}

/**
 * @param  array{public_jwk: array<string, mixed>}  $keys
 * @return array<string, mixed>
 */
function externalIdpLoginJwks(array $keys): array
{
    return ['keys' => [$keys['public_jwk']]];
}

/**
 * @param  array{private: string}  $keys
 * @param  array<string, mixed>  $overrides
 */
function externalIdpLoginIdToken(
    ExternalIdentityProvider $provider,
    string $nonce,
    array $keys,
    array $overrides = [],
): string {
    return JWT::encode([
        'iss' => $provider->issuer,
        'sub' => 'external-login-user-1',
        'aud' => $provider->client_id,
        'nonce' => $nonce,
        'email' => 'login-user@example.com',
        'email_verified' => true,
        'name' => 'External Login User',
        'iat' => now()->timestamp,
        'exp' => now()->addMinutes(5)->timestamp,
        ...$overrides,
    ], $keys['private'], 'RS256', 'kid-login-primary');
}
