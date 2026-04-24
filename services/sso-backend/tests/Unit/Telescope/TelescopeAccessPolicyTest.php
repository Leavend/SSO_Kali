<?php

declare(strict_types=1);

use App\Support\Telescope\TelescopeAccessPolicy;
use Illuminate\Http\Request;

beforeEach(function (): void {
    config([
        'app.env' => 'dev',
        'telescope.enabled' => true,
        'telescope.domain' => 'debug.dev-sso.timeh.my.id',
        'telescope.allowed_environments' => ['dev'],
        'telescope.allowed_ips' => [],
        'telescope.allowed_hosts' => ['debug.dev-sso.timeh.my.id'],
        'telescope.basic_auth' => [
            'username' => 'debug',
            'password' => 'secret-pass',
        ],
        'telescope.record_all' => true,
    ]);
});

it('allows telescope access with valid basic auth credentials', function (): void {
    $policy = app(TelescopeAccessPolicy::class);
    $request = Request::create('/telescope', 'GET', [], [], [], [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ]);

    expect($policy->allows($request))->toBeTrue()
        ->and($policy->shouldChallenge($request))->toBeFalse()
        ->and($policy->shouldRecordAll())->toBeTrue();
});

it('challenges when credentials are missing', function (): void {
    $policy = app(TelescopeAccessPolicy::class);
    $request = Request::create('/telescope', 'GET', [], [], [], [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'REMOTE_ADDR' => '203.0.113.10',
    ]);

    expect($policy->allows($request))->toBeFalse()
        ->and($policy->shouldChallenge($request))->toBeTrue();
});

it('fails closed when ip is outside the allowlist', function (): void {
    config(['telescope.allowed_ips' => ['198.51.100.0/24']]);

    $policy = app(TelescopeAccessPolicy::class);
    $request = Request::create('/telescope', 'GET', [], [], [], [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ]);

    expect($policy->allows($request))->toBeFalse()
        ->and($policy->shouldChallenge($request))->toBeFalse();
});

it('disables telescope access outside allowed environments', function (): void {
    config(['app.env' => 'production']);

    $policy = app(TelescopeAccessPolicy::class);
    $request = Request::create('/telescope', 'GET', [], [], [], [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ]);

    expect($policy->allows($request))->toBeFalse()
        ->and($policy->shouldChallenge($request))->toBeFalse()
        ->and($policy->shouldRecordAll())->toBeFalse();
});

it('fails closed when telescope is requested on an unauthorized host', function (): void {
    $policy = app(TelescopeAccessPolicy::class);
    $request = Request::create('/telescope', 'GET', [], [], [], [
        'HTTP_HOST' => 'dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ]);

    expect($policy->allows($request))->toBeFalse()
        ->and($policy->shouldChallenge($request))->toBeFalse();
});
