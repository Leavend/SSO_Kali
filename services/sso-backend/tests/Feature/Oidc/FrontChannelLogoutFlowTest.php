<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://app-a.example/auth/callback'],
            'post_logout_redirect_uris' => ['https://app-a.example/signed-out'],
            'backchannel_logout_uri' => null,
        ],
    ]);
});

it('clears browser SSO session and redirects to an allowed post logout uri', function (): void {
    Log::spy();
    $sessionId = issue20LoginSessionId();

    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'post_logout_redirect_uri' => 'https://app-a.example/signed-out',
            'state' => 'state-123',
        ]));

    $response->assertRedirect('https://app-a.example/signed-out?state=state-123')
        ->assertCookieExpired(config('sso.session.cookie'));

    expect(SsoSession::query()->where('session_id', $sessionId)->whereNotNull('revoked_at')->exists())->toBeTrue();

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'frontchannel_logout_completed'
                && ($payload['logout_channel'] ?? null) === 'frontchannel'
                && ($payload['result'] ?? null) === 'succeeded'
                && data_get($payload, 'context.client_id') === 'app-a';
        }));
});

it('rejects unregistered post logout redirect uri', function (): void {
    $sessionId = issue20LoginSessionId();

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->getJson('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'post_logout_redirect_uri' => 'https://evil.example/signed-out',
        ]))
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request');
});

it('rejects unknown front channel logout clients', function (): void {
    $this->getJson('/connect/logout?'.http_build_query([
        'client_id' => 'unknown-client',
        'post_logout_redirect_uri' => 'https://app-a.example/signed-out',
    ]))
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');
});

it('uses id token hint audience when client id is omitted', function (): void {
    $sessionId = issue20LoginSessionId();
    $idTokenHint = app(SigningKeyService::class)->sign([
        'iss' => config('sso.issuer'),
        'aud' => 'app-a',
        'sub' => 'subject-issue20',
        'sid' => $sessionId,
        'iat' => time(),
        'exp' => time() + 300,
    ]);

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->get('/connect/logout?'.http_build_query([
            'id_token_hint' => $idTokenHint,
            'post_logout_redirect_uri' => 'https://app-a.example/signed-out',
        ]))
        ->assertRedirect('https://app-a.example/signed-out')
        ->assertCookieExpired(config('sso.session.cookie'));
});

it('keeps bearer-token centralized logout backward compatible', function (): void {
    $this->postJson('/connect/logout')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

function issue20LoginSessionId(): string
{
    $user = User::factory()->create([
        'email' => 'issue20@example.test',
        'password' => Hash::make('correct-password'),
        'subject_id' => 'subject-issue20',
    ]);

    test()->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    return (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
}
