<?php

declare(strict_types=1);

use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * BE-FR043-001 — Front-Channel Logout fallback contract.
 *
 * Locks the OIDC Front-Channel Logout 1.0 §3 contract:
 *
 *   1. Discovery advertises `frontchannel_logout_supported` and
 *      `frontchannel_logout_session_supported`.
 *   2. RPs registered with `frontchannel_logout_uri` (and no
 *      `backchannel_logout_uri`) survive global logout: their
 *      registration is persisted, the dispatcher reports
 *      `frontchannel_pending`, and the response carries the fallback
 *      page URL.
 *   3. The fallback page renders an iframe per RP with `iss` and `sid`
 *      query parameters when `frontchannel_logout_session_required`
 *      is true. Iframe URIs are HTML-escaped and the page disallows
 *      framing of itself.
 *   4. RPs registered with neither channel still surface as `failed`
 *      (FR-040 invariant preserved).
 */
beforeEach(function (): void {
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');

    config()->set('oidc_clients.clients.fcl-only-client', [
        'type' => 'public',
        'redirect_uris' => ['https://fcl.example.test/cb'],
        'post_logout_redirect_uris' => ['https://fcl.example.test/'],
        'allowed_scopes' => ['openid', 'profile'],
        'frontchannel_logout_uri' => 'https://fcl.example.test/oidc/frontchannel-logout',
        'frontchannel_logout_session_required' => true,
    ]);

    config()->set('oidc_clients.clients.bcl-only-client', [
        'type' => 'public',
        'redirect_uris' => ['https://bcl.example.test/cb'],
        'post_logout_redirect_uris' => ['https://bcl.example.test/'],
        'allowed_scopes' => ['openid'],
        'backchannel_logout_uri' => 'https://bcl.example.test/api/backchannel/logout',
    ]);

    app(DownstreamClientRegistry::class)->flush();
    Cache::flush();
});

it('advertises frontchannel logout support in discovery', function (): void {
    /** @var TestCase $this */
    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertJsonPath('frontchannel_logout_supported', true)
        ->assertJsonPath('frontchannel_logout_session_supported', true);
});

it('persists RP sessions for frontchannel-only clients and returns frontchannel_pending during global logout', function (): void {
    Bus::fake();

    $sessionId = 'sid-fcl-'.bin2hex(random_bytes(4));
    $subjectId = 'user-fcl-'.bin2hex(random_bytes(3));

    $registry = app(BackChannelSessionRegistry::class);
    $registry->register($sessionId, 'fcl-only-client', '', [
        'subject_id' => $subjectId,
        'frontchannel_logout_uri' => 'https://fcl.example.test/oidc/frontchannel-logout',
        'channels' => ['frontchannel'],
    ]);

    $token = fr043AccessToken($subjectId, $sessionId);

    $response = $this->postJson('/connect/logout', [], ['Authorization' => 'Bearer '.$token])
        ->assertOk()
        ->assertJsonPath('signed_out', true)
        ->assertJsonPath('sid', $sessionId);

    $payload = $response->json();

    expect($payload['notifications'])->toHaveCount(1)
        ->and($payload['notifications'][0]['client_id'])->toBe('fcl-only-client')
        ->and($payload['notifications'][0]['status'])->toBe('frontchannel_pending')
        ->and($payload['notifications'][0]['frontchannel_logout_uri'])
        ->toBe('https://fcl.example.test/oidc/frontchannel-logout')
        ->and($payload['frontchannel_logout_url'] ?? null)
        ->toContain('/connect/logout/frontchannel');

    Bus::assertNothingDispatched();
});

it('renders the frontchannel logout fallback page with iss/sid iframes for the bearer subject', function (): void {
    $sessionId = 'sid-fcl-render-'.bin2hex(random_bytes(4));
    $subjectId = 'user-fcl-render-'.bin2hex(random_bytes(3));

    $registry = app(BackChannelSessionRegistry::class);
    $registry->register($sessionId, 'fcl-only-client', '', [
        'subject_id' => $subjectId,
        'frontchannel_logout_uri' => 'https://fcl.example.test/oidc/frontchannel-logout',
        'channels' => ['frontchannel'],
    ]);

    $token = fr043AccessToken($subjectId, $sessionId);

    $response = $this->withHeader('Authorization', 'Bearer '.$token)
        ->get('/connect/logout/frontchannel');

    $response->assertOk()
        ->assertHeader('Content-Type', 'text/html; charset=utf-8')
        ->assertHeader('X-Frame-Options', 'DENY');

    expect($response->headers->get('Cache-Control'))->toContain('no-store');

    $html = $response->getContent();

    expect($html)->toContain('<iframe')
        ->toContain('iss=https%3A%2F%2Fapi-sso.timeh.my.id')
        ->toContain('sid='.$sessionId)
        ->toContain('https://fcl.example.test/oidc/frontchannel-logout?')
        ->and($response->headers->get('Content-Security-Policy'))
        ->toContain("default-src 'none'")
        ->toContain('frame-src https: http:');
});

it('rejects the frontchannel logout fallback page without a valid bearer token', function (): void {
    $this->get('/connect/logout/frontchannel')->assertStatus(401);
});

it('keeps the FR-040 invariant: registrations without any logout channel surface as failed', function (): void {
    $sessionId = 'sid-noch-'.bin2hex(random_bytes(4));
    $subjectId = 'user-noch-'.bin2hex(random_bytes(3));

    $dispatcher = app(BackChannelLogoutDispatcher::class);

    $results = $dispatcher->dispatch($subjectId, $sessionId, [
        ['client_id' => 'no-channel-client'],
    ]);

    expect($results)->toHaveCount(1)
        ->and($results[0])->toMatchArray([
            'client_id' => 'no-channel-client',
            'status' => 'failed',
            'failure_class' => 'queue_dispatch_failed',
        ]);
});

function fr043AccessToken(string $subjectId, string $sessionId): string
{
    return app(SigningKeyService::class)->sign([
        'iss' => config('sso.issuer'),
        'aud' => config('sso.resource_audience'),
        'sub' => $subjectId,
        'sid' => $sessionId,
        'jti' => 'jti-fr043-'.bin2hex(random_bytes(4)),
        'client_id' => 'fcl-only-client',
        'scope' => 'openid profile',
        'token_use' => 'access',
        'iat' => time(),
        'exp' => time() + 300,
    ]);
}
