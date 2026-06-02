<?php

declare(strict_types=1);

use App\Services\Oidc\AuthorizationRequestContextFactory;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

it('normalizes authorization request context for native login', function (): void {
    $request = Request::create('/authorize', 'GET', [
        'client_id' => 'context-app',
        'redirect_uri' => 'https://client.example.test/callback',
        'scope' => 'openid profile',
        'state' => 'state-1',
        'nonce' => 'nonce-1',
        'code_challenge' => str_repeat('b', 43),
        'prompt' => 'login',
        'access_type' => 'online',
    ]);

    $context = app(AuthorizationRequestContextFactory::class)->make($request, authContextClient());

    expect($context['client_id'])->toBe('context-app')
        ->and($context['redirect_uri'])->toBe('https://client.example.test/callback')
        ->and($context['scope'])->toBe('openid profile')
        ->and($context['prompt'])->toBe('login')
        ->and($context['access_type'])->toBe('online')
        ->and($context)->not->toHaveKeys(['upstream_code_verifier', 'upstream_code_challenge']);
});

function authContextClient(): DownstreamClient
{
    return new DownstreamClient(
        clientId: 'context-app',
        type: 'public',
        redirectUris: ['https://client.example.test/callback'],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid', 'profile'],
    );
}
