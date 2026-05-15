<?php

declare(strict_types=1);

use App\Actions\Oidc\ValidateProductionOidcClientRegistryAction;
use App\Support\Security\ClientSecretHashPolicy;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    config()->set('oidc_clients.locked_production_client_ids', [
        'app-a',
        'app-b',
        'sso-admin-panel',
        'sso-frontend-portal',
    ]);

    config()->set('oidc_clients.clients', issue4ValidRegistry());
});

it('accepts only the locked production client id set', function (): void {
    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeTrue()
        ->and($result['checked_clients'])->toBe(4)
        ->and($result['errors'])->toBe([]);
});

it('rejects unexpected production clients', function (): void {
    $clients = issue4ValidRegistry();
    $clients['rogue-client'] = [
        'type' => 'public',
        'redirect_uris' => ['https://evil.example/callback'],
        'post_logout_redirect_uris' => ['https://evil.example'],
    ];
    config()->set('oidc_clients.clients', $clients);

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and(implode(' ', $result['errors']))->toContain('unexpected production client');
});

it('rejects missing locked production clients', function (): void {
    $clients = issue4ValidRegistry();
    unset($clients['app-b']);
    config()->set('oidc_clients.clients', $clients);

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and(implode(' ', $result['errors']))->toContain('missing locked production client');
});

it('rejects missing sso-frontend-portal client registration', function (): void {
    $clients = issue4ValidRegistry();
    unset($clients['sso-frontend-portal']);
    config()->set('oidc_clients.clients', $clients);

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and(implode(' ', $result['errors']))->toContain('sso-frontend-portal');
});

it('registers sso-frontend-portal as PKCE public client (no secret, explicit redirect)', function (): void {
    $registry = config('oidc_clients.clients');

    expect($registry)->toHaveKey('sso-frontend-portal');

    $portal = $registry['sso-frontend-portal'];
    expect($portal['type'])->toBe('public')
        ->and($portal)->not->toHaveKey('secret')
        ->and($portal['redirect_uris'])->toContain('https://sso.timeh.my.id/auth/callback')
        ->and($portal['post_logout_redirect_uris'])->toContain('https://sso.timeh.my.id');
});

function issue4ValidRegistry(): array
{
    return [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'secret_expires_at' => now()->addDays(90)->toIso8601String(),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
        ],
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id'],
            'backchannel_logout_uri' => 'https://api-sso.timeh.my.id/connect/backchannel/admin-panel/logout',
        ],
        'sso-frontend-portal' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id'],
        ],
    ];
}
