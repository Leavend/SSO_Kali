<?php

declare(strict_types=1);

use App\Services\Sso\JwtRejectMetrics;
use App\Services\Sso\LogoutTokenReplayStore;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeBrokerJwt;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('services.sso.public_issuer', 'http://sso.example');
    config()->set('services.sso.client_id', 'prototype-app-b');
    config()->set('services.sso.jwks_url', 'http://sso.example/jwks');
    config()->set('services.sso.jwt.allowed_algs', ['RS256']);
    Cache::flush();

    DB::table('sessions')->insert([
        'id' => 'session-1',
        'user_id' => null,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Pest',
        'payload' => 'serialized',
        'last_activity' => time(),
    ]);

    Cache::put('app-b:sid:shared-sid', ['session-1'], now()->addMinutes(5));
});

it('rejects invalid back-channel logout tokens and records the reject reason', function (
    string $token,
    string $expectedReason,
): void {
    /** @var TestCase $this */
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $this->post('/auth/backchannel/logout', ['logout_token' => $token])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid logout token');

    expect(DB::table('sessions')->where('id', 'session-1')->exists())->toBeTrue()
        ->and(app(JwtRejectMetrics::class)->count($expectedReason))->toBe(1);
})->with([
    'missing exp' => [FakeBrokerJwt::logoutToken(['exp' => null]), 'missing_exp'],
    'missing iat' => [FakeBrokerJwt::logoutToken(['iat' => null]), 'missing_iat'],
    'expired token' => [FakeBrokerJwt::expiredLogoutToken(), 'token_expired'],
    'missing events' => [FakeBrokerJwt::logoutToken(['events' => []]), 'invalid_events'],
    'missing sub and sid' => [FakeBrokerJwt::logoutToken(['sub' => null, 'sid' => null]), 'missing_subject_or_sid'],
    'nonce present' => [FakeBrokerJwt::logoutToken(['nonce' => 'forbidden']), 'invalid_nonce'],
]);

it('rejects replayed back-channel logout tokens and records a replay alert', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $token = FakeBrokerJwt::logoutToken(['jti' => 'logout-jti-replay']);

    $this->post('/auth/backchannel/logout', ['logout_token' => $token])
        ->assertOk()
        ->assertJsonPath('cleared', 1)
        ->assertJsonPath('sid', 'shared-sid');

    $this->post('/auth/backchannel/logout', ['logout_token' => $token])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid logout token');

    expect(app(LogoutTokenReplayStore::class)->replayAlerts())->toBe(1)
        ->and(DB::table('sessions')->where('id', 'session-1')->exists())->toBeFalse();
});
