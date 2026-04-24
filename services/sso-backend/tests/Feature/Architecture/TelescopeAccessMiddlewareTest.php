<?php

declare(strict_types=1);

use App\Http\Middleware\EnforceTelescopeAccess;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

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
    ]);

    Route::middleware(EnforceTelescopeAccess::class)
        ->get('/__test/telescope-access', fn () => response()->json(['ok' => true]));
});

it('returns a basic auth challenge when telescope credentials are missing', function (): void {
    /** @var TestCase $this */
    $this->call('GET', 'http://debug.dev-sso.timeh.my.id/__test/telescope-access', [], [], [], [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'REMOTE_ADDR' => '203.0.113.10',
    ])->assertStatus(401)
        ->assertHeader('WWW-Authenticate', 'Basic realm="dev-sso Telescope"');
});

it('allows access when telescope credentials are valid', function (): void {
    /** @var TestCase $this */
    $server = [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ];

    $this->call('GET', 'http://debug.dev-sso.timeh.my.id/__test/telescope-access', [], [], [], $server)
        ->assertOk()
        ->assertJson(['ok' => true]);
});

it('returns not found when telescope access is disabled for the environment', function (): void {
    /** @var TestCase $this */
    config(['app.env' => 'production']);

    $server = [
        'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ];

    $this->call('GET', 'http://debug.dev-sso.timeh.my.id/__test/telescope-access', [], [], [], $server)
        ->assertNotFound();
});

it('returns not found on the main admin host even with valid debug credentials', function (): void {
    /** @var TestCase $this */
    $server = [
        'HTTP_HOST' => 'dev-sso.timeh.my.id',
        'PHP_AUTH_USER' => 'debug',
        'PHP_AUTH_PW' => 'secret-pass',
        'REMOTE_ADDR' => '203.0.113.10',
    ];

    $this->call('GET', 'http://dev-sso.timeh.my.id/__test/telescope-access', [], [], [], $server)
        ->assertNotFound();
});

it('challenges before web middleware can emit cookies', function (): void {
    /** @var TestCase $this */
    Route::middleware([
        EnforceTelescopeAccess::class,
        'web',
    ])->get('/__test/telescope-access-web', fn () => response()->json(['ok' => true]));

    $response = $this->call(
        'GET',
        'http://debug.dev-sso.timeh.my.id/__test/telescope-access-web',
        [],
        [],
        [],
        [
            'HTTP_HOST' => 'debug.dev-sso.timeh.my.id',
            'REMOTE_ADDR' => '203.0.113.10',
        ],
    );

    $response->assertStatus(401)
        ->assertHeader('WWW-Authenticate', 'Basic realm="dev-sso Telescope"');

    expect($response->headers->getCookies())->toBeEmpty();
});
