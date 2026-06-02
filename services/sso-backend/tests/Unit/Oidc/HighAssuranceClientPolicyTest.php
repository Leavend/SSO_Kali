<?php

declare(strict_types=1);

use App\Services\Oidc\HighAssuranceClientPolicy;
use App\Support\Oidc\DownstreamClient;

beforeEach(function (): void {
    config()->set('sso.admin.panel_client_id', 'sso-admin-panel');
});

function makeClientWith(string $clientId): DownstreamClient
{
    return new DownstreamClient(
        clientId: $clientId,
        type: 'public',
        redirectUris: ['http://localhost:3001/auth/callback'],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid', 'profile', 'email'],
    );
}

it('does not force prompt login for the admin panel client', function (): void {
    $policy = new HighAssuranceClientPolicy;
    $result = $policy->promptFor(makeClientWith('sso-admin-panel'), null);

    expect($result)->toBeNull();
});

it('preserves requested prompt for the admin panel client', function (): void {
    $policy = new HighAssuranceClientPolicy;
    $result = $policy->promptFor(makeClientWith('sso-admin-panel'), 'none');

    expect($result)->toBe('none');
});

it('passes through the requested prompt for a normal client', function (): void {
    $policy = new HighAssuranceClientPolicy;
    $result = $policy->promptFor(makeClientWith('regular-app'), 'consent');

    expect($result)->toBe('consent');
});

it('returns null prompt for a normal client without a requested prompt', function (): void {
    $policy = new HighAssuranceClientPolicy;
    $result = $policy->promptFor(makeClientWith('regular-app'), null);

    expect($result)->toBeNull();
});

it('returns configured fresh-auth max_age for the admin panel client', function (): void {
    config()->set('sso.admin.freshness.read_seconds', 28800);

    $policy = new HighAssuranceClientPolicy;
    $result = $policy->maxAgeFor(makeClientWith('sso-admin-panel'));

    expect($result)->toBe('28800');
});

it('returns null max_age for a normal client', function (): void {
    $policy = new HighAssuranceClientPolicy;
    $result = $policy->maxAgeFor(makeClientWith('regular-app'));

    expect($result)->toBeNull();
});
