<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Tests\Support\ArrayLogger;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://dev-sso.timeh.my.id');
});

it('logs structured warnings when forwarded host and proto drift from the public broker url', function (): void {
    /** @var TestCase $this */
    $logger = new ArrayLogger;
    Log::swap($logger);

    $this->withHeaders([
        'Host' => 'dev-sso.timeh.my.id',
        'X-Forwarded-Host' => 'wrong.dev-sso.timeh.my.id',
        'X-Forwarded-Proto' => 'http',
        'X-Forwarded-Port' => '80',
    ])->getJson('/.well-known/openid-configuration')->assertOk();

    expect($logger->warnings)->toHaveCount(1);
    expect($logger->warnings[0]['message'])->toBe('[FORWARDED_HEADER_MISMATCH]');
    expect($logger->warnings[0]['context']['expected_host'])->toBe('dev-sso.timeh.my.id');
    expect($logger->warnings[0]['context']['expected_proto'])->toBe('https');
    expect($logger->warnings[0]['context']['forwarded_host'])->toBe('wrong.dev-sso.timeh.my.id');
    expect($logger->warnings[0]['context']['forwarded_proto'])->toBe('http');
    expect($logger->warnings[0]['context']['forwarded_port'])->toBe('80');
    expect($logger->warnings[0]['context']['reasons'])->toContain('forwarded_host_mismatch');
    expect($logger->warnings[0]['context']['reasons'])->toContain('forwarded_proto_mismatch');
});

it('stays silent when forwarded host and proto match the public broker url', function (): void {
    /** @var TestCase $this */
    $logger = new ArrayLogger;
    Log::swap($logger);

    $this->withHeaders([
        'Host' => 'dev-sso.timeh.my.id',
        'X-Forwarded-Host' => 'dev-sso.timeh.my.id',
        'X-Forwarded-Proto' => 'https',
        'X-Forwarded-Port' => '443',
    ])->getJson('/.well-known/openid-configuration')->assertOk();

    expect($logger->warnings)->toBeEmpty();
});

it('trusts forwarded proto from the private proxy chain when resolving the request scheme', function (): void {
    /** @var TestCase $this */
    app('router')->get('/__test/trusted-proxy-scheme', function (Request $request) {
        return response()->json([
            'scheme' => $request->getScheme(),
            'is_secure' => $request->isSecure(),
        ]);
    });

    $this->withServerVariables([
        'REMOTE_ADDR' => '172.18.0.10',
    ])->withHeaders([
        'Host' => 'dev-sso.timeh.my.id',
        'X-Forwarded-Proto' => 'https',
        'X-Forwarded-Port' => '443',
        'X-Forwarded-Host' => 'dev-sso.timeh.my.id',
    ])->getJson('/__test/trusted-proxy-scheme')
        ->assertOk()
        ->assertJson([
            'scheme' => 'https',
            'is_secure' => true,
        ]);
});
