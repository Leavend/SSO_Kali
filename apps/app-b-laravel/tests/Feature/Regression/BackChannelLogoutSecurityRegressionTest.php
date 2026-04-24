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

it('rejects expired logout tokens in the regression pack', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $this->post('/auth/backchannel/logout', [
        'logout_token' => FakeBrokerJwt::expiredLogoutToken(),
    ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid logout token');

    expect(DB::table('sessions')->where('id', 'session-1')->exists())->toBeTrue()
        ->and(app(JwtRejectMetrics::class)->count('token_expired'))->toBe(1);
});

it('rejects replayed logout tokens after the first successful clear', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $token = FakeBrokerJwt::logoutToken(['jti' => 'regression-replay-jti']);

    $this->post('/auth/backchannel/logout', ['logout_token' => $token])
        ->assertOk()
        ->assertJsonPath('cleared', 1);

    $this->post('/auth/backchannel/logout', ['logout_token' => $token])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid logout token');

    expect(app(LogoutTokenReplayStore::class)->replayAlerts())->toBe(1)
        ->and(DB::table('sessions')->where('id', 'session-1')->exists())->toBeFalse();
});
