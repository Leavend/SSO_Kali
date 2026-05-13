<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;

/**
 * FR-008 / UC-16: Feature-level integration test for redirect URI rejection
 * at the /authorize endpoint.
 *
 * Critical security contract:
 *   - MUST NOT redirect to an unregistered URI (open redirect attack)
 *   - MUST return error JSON/page without any Location header to attacker URI
 *   - MUST audit the rejection event
 */
beforeEach(function (): void {
    OidcClientRegistration::query()->updateOrCreate(
        ['client_id' => 'test-app-fr008'],
        [
            'display_name' => 'FR-008 Test App',
            'type' => 'public',
            'environment' => 'test',
            'app_base_url' => 'https://app.example.test',
            'redirect_uris' => ['https://app.example.test/auth/callback'],
            'post_logout_redirect_uris' => ['https://app.example.test/'],
            'owner_email' => 'test@example.test',
            'provisioning' => 'manual',
            'contract' => [],
            'status' => 'active',
        ],
    );
});

it('rejects authorize request with unregistered redirect_uri', function (): void {
    $response = $this->getJson('/authorize?'.http_build_query([
        'client_id' => 'test-app-fr008',
        'redirect_uri' => 'https://evil.example.com/steal',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => 'abc',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');

    // Critical: no Location header pointing to attacker URI
    $response->assertHeaderMissing('Location');
});

it('rejects authorize request with unknown client_id', function (): void {
    $response = $this->getJson('/authorize?'.http_build_query([
        'client_id' => 'nonexistent-client',
        'redirect_uri' => 'https://evil.example.com/steal',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => 'abc',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');

    $response->assertHeaderMissing('Location');
});

it('rejects authorize request with trailing slash on redirect_uri', function (): void {
    $response = $this->getJson('/authorize?'.http_build_query([
        'client_id' => 'test-app-fr008',
        'redirect_uri' => 'https://app.example.test/auth/callback/',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => 'abc',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');

    $response->assertHeaderMissing('Location');
});

it('rejects authorize request with HTTP downgrade on redirect_uri', function (): void {
    $response = $this->getJson('/authorize?'.http_build_query([
        'client_id' => 'test-app-fr008',
        'redirect_uri' => 'http://app.example.test/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => 'abc',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');

    $response->assertHeaderMissing('Location');
});

it('does not reject authorize request with exact registered redirect_uri as invalid_client', function (): void {
    $response = $this->getJson('/authorize?'.http_build_query([
        'client_id' => 'test-app-fr008',
        'redirect_uri' => 'https://app.example.test/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => 'abc',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    // The client is registered in DB — should pass URI validation.
    // May still fail on other grounds (missing session, etc.) but NOT invalid_client.
    if ($response->status() === 400) {
        expect($response->json('error'))->not->toBe('invalid_client');
    } else {
        // 302 redirect to login or 200 — both acceptable
        expect($response->status())->toBeIn([200, 302, 303]);
    }
});
