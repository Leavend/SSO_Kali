<?php

declare(strict_types=1);

require_once __DIR__.'/../../Support/UnitOidcDatabase.php';

use App\Actions\Oidc\RegisterClientSession;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

use function Tests\Support\ensureOidcUnitTables;
use function Tests\Support\resetOidcUnitTables;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));

    ensureOidcUnitTables();
    resetOidcUnitTables();
    Cache::flush();
});

function sessionRegAction(): RegisterClientSession
{
    return new RegisterClientSession(
        app(AccessTokenGuard::class),
        app(DownstreamClientRegistry::class),
        app(BackChannelSessionRegistry::class),
    );
}

function bearerRequest(string $token): Request
{
    $request = Request::create('/connect/session/register', 'POST');
    $request->headers->set('Authorization', 'Bearer '.$token);

    return $request;
}

it('rejects requests without a bearer token', function (): void {
    $response = sessionRegAction()->handle(
        Request::create('/connect/session/register', 'POST'),
    );

    expect($response->getStatusCode())->toBe(401);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_token');
});

it('rejects clients without a backchannel_logout_uri', function (): void {
    config()->set('oidc_clients.clients.no-bcl-client', [
        'type' => 'public',
        'redirect_uris' => ['http://localhost:3001/auth/callback'],
        'post_logout_redirect_uris' => [],
    ]);

    $token = app(SigningKeyService::class)->sign([
        'iss' => 'http://localhost',
        'aud' => 'sso-resource-api',
        'sub' => 'sub-reg-001',
        'client_id' => 'no-bcl-client',
        'token_use' => 'access',
        'scope' => 'openid',
        'jti' => 'jti-reg-001',
        'sid' => 'sid-reg-001',
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ]);

    $response = sessionRegAction()->handle(bearerRequest($token));

    expect($response->getStatusCode())->toBe(400);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_client');
});

it('registers a session for a BCL-capable client', function (): void {
    config()->set('oidc_clients.clients.bcl-client', [
        'type' => 'public',
        'redirect_uris' => ['http://localhost:3001/auth/callback'],
        'post_logout_redirect_uris' => [],
        'backchannel_logout_uri' => 'http://localhost:3001/auth/backchannel-logout',
    ]);

    $token = app(SigningKeyService::class)->sign([
        'iss' => 'http://localhost',
        'aud' => 'sso-resource-api',
        'sub' => 'sub-reg-002',
        'client_id' => 'bcl-client',
        'token_use' => 'access',
        'scope' => 'openid',
        'jti' => 'jti-reg-002',
        'sid' => 'sid-reg-002',
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ]);

    $response = sessionRegAction()->handle(bearerRequest($token));

    expect($response->getStatusCode())->toBe(200);

    $body = json_decode((string) $response->getContent(), true);
    expect($body)
        ->toHaveKey('registered', true)
        ->toHaveKey('client_id', 'bcl-client')
        ->toHaveKey('sid', 'sid-reg-002');

    $registry = app(BackChannelSessionRegistry::class);
    $registration = $registry->forSession('sid-reg-002')[0] ?? [];
    expect($registration)
        ->toHaveKey('subject_id', 'sub-reg-002')
        ->toHaveKey('scope', 'openid')
        ->toHaveKey('created_at')
        ->toHaveKey('expires_at');
    expect($registry->sessionIdsForSubject('sub-reg-002'))->toBe(['sid-reg-002']);

    $registry->clear('sid-reg-002');

    expect($registry->sessionIdsForSubject('sub-reg-002'))->toBe([]);
});
