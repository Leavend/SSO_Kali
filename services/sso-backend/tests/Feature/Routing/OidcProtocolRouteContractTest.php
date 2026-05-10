<?php

declare(strict_types=1);

it('rejects malformed authorization requests without server errors', function (string $uri): void {
    $this->get($uri)
        ->assertStatus(400);
})->with([
    'authorize' => ['/authorize'],
    'oauth2 authorize' => ['/oauth2/authorize'],
]);

it('rejects malformed token requests without server errors', function (string $uri): void {
    $this->postJson($uri)
        ->assertStatus(400)
        ->assertJsonStructure(['error']);
})->with([
    'token' => ['/token'],
    'oauth2 token' => ['/oauth2/token'],
]);

it('rejects malformed revocation requests without server errors', function (string $uri): void {
    $this->postJson($uri)
        ->assertOk();
})->with([
    'revocation' => ['/revocation'],
    'oauth2 revocation' => ['/oauth2/revocation'],
]);

it('rejects userinfo without bearer credentials using OIDC error semantics', function (): void {
    $this->getJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('rejects post userinfo without bearer credentials using OIDC error semantics', function (): void {
    $this->postJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('keeps legacy oauth revoke invalid requests RFC7009 safe', function (): void {
    $this->postJson('/oauth/revoke', [
        'client_id' => 'invalid-client',
        'client_secret' => 'invalid-secret',
        'token' => 'invalid-token',
    ])->assertOk()
        ->assertExactJson([]);
});

it('rejects centralized logout without bearer credentials using OIDC error semantics', function (): void {
    $this->postJson('/connect/logout')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('rejects malformed back-channel and session registration payloads safely', function (string $uri, int $status): void {
    $this->postJson($uri)
        ->assertStatus($status);
})->with([
    'admin panel back-channel logout' => ['/connect/backchannel/admin-panel/logout', 400],
    'session registration' => ['/connect/register-session', 401],
]);
