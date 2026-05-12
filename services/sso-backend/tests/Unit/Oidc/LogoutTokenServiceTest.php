<?php

declare(strict_types=1);

use App\Services\Oidc\LogoutTokenService;
use App\Services\Oidc\SigningKeyService;

beforeEach(function (): void {
    config()->set('sso.issuer', 'https://sso.example');
});

it('issues logout tokens with the required security claims', function (): void {
    $token = app(LogoutTokenService::class)->issue(
        clientId: 'prototype-app-a',
        subjectId: 'subject-123',
        sessionId: 'shared-sid',
    );

    $claims = app(SigningKeyService::class)->decode($token);

    expect($claims['iss'])->toBe('https://sso.example');
    expect($claims['aud'])->toBe('prototype-app-a');
    expect($claims['sub'])->toBe('subject-123');
    expect($claims['sid'])->toBe('shared-sid');
    expect($claims['jti'])->toBeString();
    expect($claims['iat'])->toBeInt();
    expect($claims['exp'])->toBeInt();
    expect($claims['events'])->toHaveKey('http://schemas.openid.net/event/backchannel-logout');
    expect($claims)->not->toHaveKey('nonce');
});
