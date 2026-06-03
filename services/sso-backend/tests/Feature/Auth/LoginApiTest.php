<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Cookie;

it('rejects invalid login credentials without issuing an SSO cookie', function (): void {
    User::factory()->create([
        'email' => 'admin@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => 'admin@example.test',
        'password' => 'wrong-password',
    ])->assertUnauthorized()
        ->assertJsonPath('authenticated', false);

    // The authoritative check: no SSO session record was created
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
        ->first(fn (Cookie $cookie): bool => $cookie->getName() === config('sso.session.cookie', 'sso_session'));

    expect($cookie)->not->toBeNull()
        ->and($cookie->isHttpOnly())->toBeTrue();

    expect(SsoSession::query()->where('subject_id', $user->subject_id)->whereNull('revoked_at')->exists())->toBeTrue();
});

it('reuses the active portal session for the same trusted device', function (): void {
    $user = User::factory()->create([
        'email' => 'reuse@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $headers = [
        'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/124.0.0.0',
        'X-Forwarded-For' => '182.8.178.112',
    ];

    $this->withHeaders($headers)->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $first = SsoSession::query()->where('subject_id', $user->subject_id)->firstOrFail();
    $first->forceFill([
        'authenticated_at' => now()->subHours(4),
        'last_seen_at' => now()->subHours(4),
        'expires_at' => now()->addHour(),
    ])->save();

    $this->withHeaders($headers)->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $first->refresh();

    expect(SsoSession::query()->where('subject_id', $user->subject_id)->whereNull('revoked_at')->count())->toBe(1)
        ->and($first->authenticated_at->greaterThan(now()->subMinute()))->toBeTrue()
        ->and($first->last_seen_at?->greaterThan(now()->subMinute()))->toBeTrue();
});

it('keeps separate portal sessions for different trusted devices', function (): void {
    $user = User::factory()->create([
        'email' => 'devices@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    foreach (['Chrome macOS', 'Mobile Safari iOS'] as $agent) {
        $this->withHeader('User-Agent', $agent)->postJson('/api/auth/login', [
            'identifier' => $user->email,
            'password' => 'correct-password',
        ])->assertOk();
    }

    expect(SsoSession::query()->where('subject_id', $user->subject_id)->whereNull('revoked_at')->count())->toBe(2);
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
