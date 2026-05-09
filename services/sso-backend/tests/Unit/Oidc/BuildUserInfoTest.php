<?php

declare(strict_types=1);

use App\Actions\Oidc\BuildUserInfo;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\OidcIncidentAuditLogger;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));

    Cache::flush();
});

it('rejects requests without a bearer token', function (): void {
    $action = new BuildUserInfo(app(AccessTokenGuard::class), buildUserInfoNoopIncidentLogger());
    $request = Request::create('/userinfo', 'GET');

    $response = $action->handle($request);

    expect($response->getStatusCode())->toBe(401);
    expect(json_decode((string) $response->getContent(), true))
        ->toHaveKey('error', 'invalid_token');
});

it('returns user claims from a valid access token', function (): void {
    $keys = app(SigningKeyService::class);

    $accessToken = $keys->sign([
        'iss' => 'http://localhost',
        'aud' => 'sso-resource-api',
        'sub' => 'sub-userinfo-001',
        'client_id' => 'sso-admin-panel',
        'token_use' => 'access',
        'scope' => 'openid profile email',
        'jti' => 'jti-userinfo-001',
        'sid' => 'sid-userinfo-001',
        'name' => 'Ada Lovelace',
        'given_name' => 'Ada',
        'family_name' => 'Lovelace',
        'email' => 'ada@example.com',
        'email_verified' => true,
        'iat' => time(),
        'nbf' => time(),
        'exp' => time() + 900,
    ]);

    $action = new BuildUserInfo(app(AccessTokenGuard::class), buildUserInfoNoopIncidentLogger());
    $request = Request::create('/userinfo', 'GET');
    $request->headers->set('Authorization', 'Bearer '.$accessToken);

    $response = $action->handle($request);

    expect($response->getStatusCode())->toBe(200);

    $body = json_decode((string) $response->getContent(), true);
    expect($body)
        ->toHaveKey('sub', 'sub-userinfo-001');
});

function buildUserInfoNoopIncidentLogger(): OidcIncidentAuditLogger
{
    return new OidcIncidentAuditLogger(
        new class extends AdminAuditEventStore
        {
            public function append(array $payload): void {}
        },
    );
}
