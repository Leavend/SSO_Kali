<?php

declare(strict_types=1);

use App\Support\Oidc\Pkce;
use Symfony\Component\HttpFoundation\Cookie;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('session.driver', 'array');
    config()->set('session.cookie', '__Host-broker_session');
    config()->set('session.secure', true);
    config()->set('session.path', '/');
    config()->set('session.domain', null);
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/zitadel');
});

it('keeps the broker session cookie compliant with __Host- rules', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $cookie = brokerSessionCookie($response->headers->getCookies());

    expect($cookie)->not->toBeNull()
        ->and($cookie?->getName())->toBe('__Host-broker_session')
        ->and($cookie?->isSecure())->toBeTrue()
        ->and($cookie?->getPath())->toBe('/')
        ->and($cookie?->getDomain())->toBeNull();
});

/**
 * @param  list<Cookie>  $cookies
 */
function brokerSessionCookie(array $cookies): ?Cookie
{
    foreach ($cookies as $cookie) {
        if ($cookie->getName() === '__Host-broker_session') {
            return $cookie;
        }
    }

    return null;
}
