<?php

declare(strict_types=1);

use App\Services\Oidc\AuthorizationRequestValidator;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

it('rejects authorization requests without S256 PKCE', function (): void {
    $validator = app(AuthorizationRequestValidator::class);
    $request = Request::create('/authorize', 'GET', authValidatorQuery(['code_challenge_method' => 'plain']));

    expect($validator->validate($request, authValidatorClient()))
        ->toBe(['reason' => 'invalid_code_challenge_method', 'description' => 'PKCE with S256 is required.']);
});

it('rejects unsupported prompt values before auth request persistence', function (): void {
    $validator = app(AuthorizationRequestValidator::class);
    $request = Request::create('/authorize', 'GET', authValidatorQuery(['prompt' => 'bad_prompt']));

    expect($validator->validate($request, authValidatorClient())['reason'] ?? null)->toBe('invalid_prompt');
});

function authValidatorClient(): DownstreamClient
{
    return new DownstreamClient(
        clientId: 'validator-app',
        type: 'public',
        redirectUris: ['https://client.example.test/callback'],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid', 'profile', 'email'],
    );
}

/** @return array<string, string> */
function authValidatorQuery(array $overrides = []): array
{
    return [
        'client_id' => 'validator-app',
        'redirect_uri' => 'https://client.example.test/callback',
        'response_type' => 'code',
        'scope' => 'openid profile',
        'state' => 'state-1',
        'nonce' => 'nonce-1',
        'code_challenge' => str_repeat('a', 43),
        'code_challenge_method' => 'S256',
        ...$overrides,
    ];
}
