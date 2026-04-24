<?php

declare(strict_types=1);

use Tests\TestCase;

it('exposes an OpenID discovery document', function (): void {
    /** @var TestCase $this */
    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertJsonPath('issuer', config('sso.issuer'))
        ->assertJsonPath('authorization_endpoint', config('sso.base_url').'/authorize')
        ->assertJsonPath('token_endpoint', config('sso.base_url').'/token')
        ->assertJsonPath('jwks_uri', config('sso.base_url').'/jwks')
        ->assertJsonPath('end_session_endpoint', config('sso.base_url').'/connect/logout')
        ->assertJsonPath('session_registration_endpoint', config('sso.base_url').'/connect/register-session')
        ->assertJsonPath('backchannel_logout_supported', true);
});

it('publishes a local jwks document', function (): void {
    /** @var TestCase $this */
    $this->getJson('/jwks')
        ->assertOk()
        ->assertJsonPath('keys.0.alg', config('sso.signing.alg'))
        ->assertJsonPath('keys.0.kid', config('sso.signing.kid'));
});
