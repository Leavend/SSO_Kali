<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\CreateExternalIdpAuthenticationRedirectAction;
use App\Actions\ExternalIdp\ExchangeExternalIdpCallbackTokenAction;
use App\Actions\ExternalIdp\LinkExternalSubjectAccountAction;
use App\Models\AuthenticationAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);
});

it('records external idp redirect callback and account-link authentication audit events without token leakage', function (): void {
    [$provider, $keys] = issue84ExternalIdpProvider();
    Http::fake([$provider->metadata_url => Http::response(issue84ExternalIdpDiscovery($provider), 200)]);

    $redirect = app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($provider, [
        'request_id' => 'req-external-idp-audit-redirect-84',
        'return_to' => '/portal/profile?invite=secret-invite-code',
        'prompt' => 'login',
        'ip_address' => '203.0.113.141',
        'user_agent' => 'Issue84ExternalIdpAgent/redirect',
    ]);

    $redirectEvent = AuthenticationAuditEvent::query()
        ->where('event_type', 'external_idp_redirect_created')
        ->where('request_id', 'req-external-idp-audit-redirect-84')
        ->firstOrFail();

    expect($redirectEvent->outcome)->toBe('succeeded')
        ->and($redirectEvent->client_id)->toBe('sso-upstream')
        ->and($redirectEvent->ip_address)->toBe('203.0.113.141')
        ->and($redirectEvent->user_agent)->toBe('Issue84ExternalIdpAgent/redirect')
        ->and($redirectEvent->context)->toMatchArray([
            'provider_key' => 'keycloak-issue84',
            'issuer_hash' => hash('sha256', $provider->issuer),
            'return_to_hash' => hash('sha256', '/portal/profile?invite=secret-invite-code'),
            'prompt' => 'login',
        ]);

    Http::fake([
        $provider->metadata_url => Http::response(issue84ExternalIdpDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'upstream-access-token-must-not-leak-84',
            'refresh_token' => 'upstream-refresh-token-must-not-leak-84',
            'id_token' => issue84ExternalIdpIdToken($provider, $redirect['nonce'], $keys),
            'token_type' => 'Bearer',
            'expires_in' => 300,
        ], 200),
        $provider->jwks_uri => Http::response(issue84ExternalIdpJwks($keys), 200),
    ]);

    $exchange = app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'issue84-auth-code-must-not-leak',
        'req-external-idp-audit-callback-84',
    );

    $callbackEvent = AuthenticationAuditEvent::query()
        ->where('event_type', 'external_idp_callback_exchanged')
        ->where('request_id', 'req-external-idp-audit-callback-84')
        ->firstOrFail();

    expect($callbackEvent->outcome)->toBe('succeeded')
        ->and($callbackEvent->subject_id)->toBe('external-issue84-user')
        ->and($callbackEvent->email)->toBe('issue84-login@example.com')
        ->and($callbackEvent->context)->toMatchArray([
            'provider_key' => 'keycloak-issue84',
            'issuer_hash' => hash('sha256', $provider->issuer),
            'state_hash' => hash('sha256', $redirect['state']),
            'code_hash' => hash('sha256', 'issue84-auth-code-must-not-leak'),
            'return_to_hash' => hash('sha256', '/portal/profile?invite=secret-invite-code'),
            'external_subject_hash' => hash('sha256', 'external-issue84-user'),
        ]);

    $linked = app(LinkExternalSubjectAccountAction::class)->execute(
        $provider,
        $exchange,
        'req-external-idp-audit-link-84',
    );

    $linkEvent = AuthenticationAuditEvent::query()
        ->where('event_type', 'external_idp_account_linked')
        ->where('request_id', 'req-external-idp-audit-link-84')
        ->firstOrFail();
    $encodedEvents = AuthenticationAuditEvent::query()->get()->toJson(JSON_THROW_ON_ERROR);

    expect($linked['user'])->toBeInstanceOf(User::class)
        ->and($linkEvent->outcome)->toBe('succeeded')
        ->and($linkEvent->subject_id)->toBe($linked['user']->subject_id)
        ->and($linkEvent->email)->toBe('issue84-login@example.com')
        ->and($linkEvent->context)->toMatchArray([
            'provider_key' => 'keycloak-issue84',
            'issuer_hash' => hash('sha256', $provider->issuer),
            'external_subject_hash' => hash('sha256', 'external-issue84-user'),
            'return_to_hash' => hash('sha256', '/portal/profile?invite=secret-invite-code'),
            'created_user' => true,
            'created_link' => true,
        ])
        ->and($encodedEvents)->not->toContain('upstream-access-token-must-not-leak-84')
        ->and($encodedEvents)->not->toContain('upstream-refresh-token-must-not-leak-84')
        ->and($encodedEvents)->not->toContain('issue84-auth-code-must-not-leak')
        ->and($encodedEvents)->not->toContain($redirect['state'])
        ->and($encodedEvents)->not->toContain('/portal/profile?invite=secret-invite-code')
        ->and($encodedEvents)->not->toContain($provider->issuer);
});

it('records external idp callback and account-link failure authentication audits safely', function (): void {
    [$provider, $keys] = issue84ExternalIdpProvider('keycloak-issue84-failure');
    Http::fake([$provider->metadata_url => Http::response(issue84ExternalIdpDiscovery($provider), 200)]);
    $redirect = app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($provider, [
        'request_id' => 'req-external-idp-audit-failure-state-84',
        'return_to' => '/portal/profile',
    ]);

    Http::fake([
        $provider->metadata_url => Http::response(issue84ExternalIdpDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'failure-access-token-must-not-leak-84',
            'id_token' => issue84ExternalIdpIdToken($provider, $redirect['nonce'], $keys, ['nonce' => 'wrong-nonce']),
        ], 200),
        $provider->jwks_uri => Http::response(issue84ExternalIdpJwks($keys), 200),
    ]);

    expect(fn () => app(ExchangeExternalIdpCallbackTokenAction::class)->execute(
        $provider,
        $redirect['state'],
        'failure-auth-code-must-not-leak-84',
        'req-external-idp-audit-callback-failed-84',
    ))->toThrow(RuntimeException::class, 'External IdP nonce claim mismatch.');

    $callbackFailed = AuthenticationAuditEvent::query()
        ->where('event_type', 'external_idp_callback_failed')
        ->where('request_id', 'req-external-idp-audit-callback-failed-84')
        ->firstOrFail();

    expect($callbackFailed->outcome)->toBe('failed')
        ->and($callbackFailed->error_code)->toBe('external_id_p_nonce_claim_mismatch.')
        ->and($callbackFailed->context)->toMatchArray([
            'provider_key' => 'keycloak-issue84-failure',
            'state_hash' => hash('sha256', $redirect['state']),
            'code_hash' => hash('sha256', 'failure-auth-code-must-not-leak-84'),
        ]);

    User::factory()->create([
        'email' => 'issue84-existing@example.com',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    expect(fn () => app(LinkExternalSubjectAccountAction::class)->execute($provider, [
        'provider_key' => 'keycloak-issue84-failure',
        'subject' => 'external-takeover-subject-84',
        'email' => 'issue84-existing@example.com',
        'name' => 'External Takeover',
        'return_to' => '/portal/profile',
        'claims' => [
            'iss' => $provider->issuer,
            'sub' => 'external-takeover-subject-84',
            'aud' => $provider->client_id,
            'email' => 'issue84-existing@example.com',
            'email_verified' => false,
        ],
    ], 'req-external-idp-audit-link-failed-84'))
        ->toThrow(RuntimeException::class, 'External IdP email must be verified before linking an existing account.');

    $linkFailed = AuthenticationAuditEvent::query()
        ->where('event_type', 'external_idp_account_link_failed')
        ->where('request_id', 'req-external-idp-audit-link-failed-84')
        ->firstOrFail();
    $encodedEvents = AuthenticationAuditEvent::query()->get()->toJson(JSON_THROW_ON_ERROR);

    expect($linkFailed->outcome)->toBe('failed')
        ->and($linkFailed->email)->toBe('issue84-existing@example.com')
        ->and($linkFailed->error_code)->toBe('external_id_p_email_must_be_verified_before_linking_an_existing_account.')
        ->and($linkFailed->context)->toMatchArray([
            'provider_key' => 'keycloak-issue84-failure',
            'external_subject_hash' => hash('sha256', 'external-takeover-subject-84'),
            'return_to_hash' => hash('sha256', '/portal/profile'),
        ])
        ->and($encodedEvents)->not->toContain('failure-access-token-must-not-leak-84')
        ->and($encodedEvents)->not->toContain('failure-auth-code-must-not-leak-84')
        ->and($encodedEvents)->not->toContain($redirect['state'])
        ->and($encodedEvents)->not->toContain('external-takeover-subject-84')
        ->and($encodedEvents)->not->toContain($provider->issuer);
});

/**
 * @return array{0: ExternalIdentityProvider, 1: array{private: string, public_jwk: array<string, mixed>}}
 */
function issue84ExternalIdpProvider(string $providerKey = 'keycloak-issue84'): array
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';
    $provider = ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Issue 84',
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

    return [$provider, issue84ExternalIdpKeys()];
}

/**
 * @return array<string, mixed>
 */
function issue84ExternalIdpDiscovery(ExternalIdentityProvider $provider): array
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
function issue84ExternalIdpKeys(): array
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
            'kid' => 'kid-issue84-primary',
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
function issue84ExternalIdpJwks(array $keys): array
{
    return ['keys' => [$keys['public_jwk']]];
}

/**
 * @param  array{private: string}  $keys
 * @param  array<string, mixed>  $overrides
 */
function issue84ExternalIdpIdToken(
    ExternalIdentityProvider $provider,
    string $nonce,
    array $keys,
    array $overrides = [],
): string {
    return JWT::encode([
        'iss' => $provider->issuer,
        'sub' => 'external-issue84-user',
        'aud' => $provider->client_id,
        'nonce' => $nonce,
        'email' => 'issue84-login@example.com',
        'email_verified' => true,
        'name' => 'Issue 84 Login User',
        'iat' => now()->timestamp,
        'exp' => now()->addMinutes(5)->timestamp,
        ...$overrides,
    ], $keys['private'], 'RS256', 'kid-issue84-primary');
}
