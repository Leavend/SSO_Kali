<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('rejects invalid login credentials without issuing an SSO cookie', function (): void {
    User::factory()->create([
        'email' => 'admin@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => 'admin@example.test',
        'password' => 'wrong-password',
    ])->assertUnauthorized()
        ->assertJsonPath('authenticated', false)
        ->assertCookieMissing(config('sso.session.cookie', 'sso_session'));

    expect(SsoSession::query()->count())->toBe(0);
});

it('creates an HttpOnly SSO session cookie for valid credentials', function (): void {
    $user = User::factory()->create([
        'email' => 'admin@example.test',
        'password' => Hash::make('correct-password'),
        'role' => 'admin',
    ]);

    $response = $this->postJson('/api/auth/login', [
        'identifier' => 'admin@example.test',
        'password' => 'correct-password',
    ])->assertOk()
        ->assertJsonPath('authenticated', true)
        ->assertJsonPath('user.subject_id', $user->subject_id)
        ->assertCookie(config('sso.session.cookie', 'sso_session'));

    $cookie = collect($response->headers->getCookies())
        ->first(fn (Symfony\Component\HttpFoundation\Cookie $cookie): bool => $cookie->getName() === config('sso.session.cookie', 'sso_session'));

    expect($cookie)->not->toBeNull()
        ->and($cookie->isHttpOnly())->toBeTrue();

    expect(SsoSession::query()->where('subject_id', $user->subject_id)->whereNull('revoked_at')->exists())->toBeTrue();
});

it('returns the current user from an active SSO session', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('correct-password'),
        'role' => 'admin',
    ]);

    $login = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');

    $this->withHeader('Cookie', config('sso.session.cookie', 'sso_session').'='.$sessionId)
        ->getJson('/api/auth/session')
        ->assertOk()
        ->assertJsonPath('authenticated', true)
        ->assertJsonPath('user.subject_id', $user->subject_id)
        ->assertJsonPath('user.roles.0', 'admin');
});

it('revokes the current SSO session on logout', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('correct-password'),
    ]);

    $login = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');

    $this->withHeader('Cookie', config('sso.session.cookie', 'sso_session').'='.$sessionId)
        ->postJson('/api/auth/logout')
        ->assertOk()
        ->assertJsonPath('authenticated', false);

    expect(SsoSession::query()->where('subject_id', $user->subject_id)->whereNotNull('revoked_at')->exists())->toBeTrue();
});
