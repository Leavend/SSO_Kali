<?php

declare(strict_types=1);

use App\Support\Oidc\Pkce;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/zitadel');
});

it('fails closed for invalid authorize requests in the security regression pack', function (
    array $replace,
    array $remove,
    string $errorDescription,
): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query(authorizeParams($replace, $remove)));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request')
        ->assertJsonPath('error_description', $errorDescription);
})->with([
    'missing state' => [[], ['state'], 'state is required.'],
    'missing nonce' => [[], ['nonce'], 'nonce is required.'],
    'non-s256 method' => [['code_challenge_method' => 'plain'], [], 'PKCE with S256 is required.'],
    'missing code challenge' => [[], ['code_challenge'], 'code_challenge is required.'],
]);

it('forces prompt=login and max_age=0 for the admin panel client regression path', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        ...authorizeParams(),
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
    ]));

    $response->assertRedirect();

    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['prompt'])->toBe('login')
        ->and($query['max_age'])->toBe('0');
});

/**
 * @param  array<string, string>  $replace
 * @param  list<string>  $remove
 * @return array<string, string>
 */
function authorizeParams(array $replace = [], array $remove = []): array
{
    $params = [
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ];

    foreach ($remove as $key) {
        unset($params[$key]);
    }

    return [...$params, ...$replace];
}
