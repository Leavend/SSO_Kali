<?php

declare(strict_types=1);

use App\Services\Oidc\UpstreamAuthorizationParameters;

it('adds offline access upstream only when offline access is requested', function (): void {
    config()->set('sso.upstream_oidc.client_id', 'upstream-client');
    config()->set('sso.upstream_oidc.redirect_uri', 'https://sso.example.test/callback');
    config()->set('sso.upstream_oidc.scope', 'openid email');

    $parameters = app(UpstreamAuthorizationParameters::class)->make('state-a', [
        'session_id' => 'session-a',
        'upstream_code_challenge' => str_repeat('c', 43),
        'access_type' => 'offline',
    ]);

    expect($parameters['scope'])->toBe('openid email offline_access')
        ->and($parameters['code_challenge_method'])->toBe('S256')
        ->and($parameters['state'])->toBe('state-a');
});
