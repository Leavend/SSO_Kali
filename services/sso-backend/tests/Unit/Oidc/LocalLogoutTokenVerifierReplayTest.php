<?php

declare(strict_types=1);

use App\Services\Oidc\LocalLogoutTokenVerifier;
use App\Services\Oidc\LogoutTokenService;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'https://sso.example');
    Cache::flush();
});
it('rejects an inbound logout token replayed under the same audience', function (): void {
    $service = app(LogoutTokenService::class);
    $verifier = app(LocalLogoutTokenVerifier::class);

    $token = $service->issue(
        clientId: 'prototype-app-a',
        subjectId: 'subject-123',
        sessionId: 'shared-sid',
    );

    $first = $verifier->verify($token, 'prototype-app-a');
    expect($first['jti'])->toBeString();

    expect(fn () => $verifier->verify($token, 'prototype-app-a'))
        ->toThrow(RuntimeException::class, 'Logout token jti has already been used.');
});

it('treats different audiences as independent replay namespaces', function (): void {
    $service = app(LogoutTokenService::class);
    $verifier = app(LocalLogoutTokenVerifier::class);

    $token = $service->issue(
        clientId: 'aud-x',
        subjectId: 'subject-123',
        sessionId: 'shared-sid',
    );

    $verifier->verify($token, 'aud-x');

    expect(fn () => $verifier->verify($token, 'aud-y'))
        ->toThrow(RuntimeException::class, 'Logout token audience is invalid.');
});

it('rejects logout tokens that do not carry a jti claim', function (): void {
    $signed = app(SigningKeyService::class)->sign([
        'iss' => 'https://sso.example',
        'aud' => 'aud-x',
        'sub' => 'subject-x',
        'sid' => 'sid-x',
        'iat' => time(),
        'exp' => time() + 60,
        'events' => [
            'http://schemas.openid.net/event/backchannel-logout' => (object) [],
        ],
    ]);

    expect(fn () => app(LocalLogoutTokenVerifier::class)->verify($signed, 'aud-x'))
        ->toThrow(RuntimeException::class, 'Logout token jti is missing.');
});
