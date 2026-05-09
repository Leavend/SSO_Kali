<?php

declare(strict_types=1);

use App\Actions\Oidc\ValidateProductionOidcClientRegistryAction;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;

beforeEach(function (): void {
    config()->set('app.env', 'production');
});

it('keeps the load-test client absent by default', function (): void {
    config()->set('oidc_clients.load_test_client.enabled', false);

    expect(app(DownstreamClientRegistry::class)->find('sso-load-test-client'))->toBeNull();
});

it('registers the load-test client only when explicitly enabled', function (): void {
    enableOidcLoadTestClient();

    $client = app(DownstreamClientRegistry::class)->find('sso-load-test-client');

    expect($client)->not->toBeNull()
        ->and($client->clientId)->toBe('sso-load-test-client')
        ->and($client->type)->toBe('confidential')
        ->and($client->requiresClientSecret())->toBeTrue()
        ->and($client->allowsRedirectUri('https://load-test.timeh.my.id/oauth/callback'))->toBeTrue();
});

it('passes production registry validation when enabled with HTTPS exact URIs and hashed secret', function (): void {
    enableOidcLoadTestClient();

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeTrue()
        ->and($result['errors'])->toBe([]);
});

it('rejects an enabled load-test client without a hashed secret', function (): void {
    enableOidcLoadTestClient(['secret' => null]);

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and(implode(' ', $result['errors']))->toContain('Confidential client [sso-load-test-client] must define a hashed client secret.');
});

it('rejects unsafe enabled load-test redirect URIs in production', function (string $redirectUri): void {
    enableOidcLoadTestClient(['redirect_uri' => $redirectUri]);

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse();
})->with([
    'localhost' => 'http://localhost:3000/oauth/callback',
    'wildcard' => 'https://*.timeh.my.id/oauth/callback',
]);

/**
 * @param  array{secret?: string|null, redirect_uri?: string}  $overrides
 */
function enableOidcLoadTestClient(array $overrides = []): void
{
    $secret = array_key_exists('secret', $overrides)
        ? $overrides['secret']
        : app(ClientSecretHashPolicy::class)->make('load-test-secret');

    config()->set('oidc_clients.clients', issue30SafeProductionClients());

    config()->set('oidc_clients.load_test_client', [
        'enabled' => true,
        'client_id' => 'sso-load-test-client',
        'secret' => $secret,
        'redirect_uri' => $overrides['redirect_uri'] ?? 'https://load-test.timeh.my.id/oauth/callback',
        'post_logout_redirect_uri' => 'https://load-test.timeh.my.id/signed-out',
        'backchannel_logout_uri' => null,
    ]);

    config()->set('oidc_clients.locked_production_client_ids', [
        'app-a',
        'app-b',
        'sso-admin-panel',
        'sso-load-test-client',
    ]);

    app(DownstreamClientRegistry::class)->flush();
}

function issue30SafeProductionClients(): array
{
    return [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
            'backchannel_logout_uri' => null,
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
            'backchannel_logout_uri' => null,
        ],
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id'],
            'backchannel_logout_uri' => 'https://api-sso.timeh.my.id/connect/backchannel/admin-panel/logout',
        ],
    ];
}
