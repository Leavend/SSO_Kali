<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * FR-047 / UC-36: Self-service change password via session cookie.
 *
 * Contract:
 *   POST /api/profile/change-password
 *   Body: { current_password, new_password, new_password_confirmation }
 *   Auth: session cookie (same as other /api/profile/* endpoints)
 *
 * Acceptance criteria:
 *   - 200 on valid change with ISO 8601 changed_at
 *   - 401 without session
 *   - 422 on validation failure (missing fields, wrong current, reuse)
 */
it('changes password successfully with valid session and credentials', function (): void {
    [$user, $cookie] = changePasswordSession('success', 'OldPassword123!');

    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/change-password', [
            'current_password' => 'OldPassword123!',
            'new_password' => 'NewSecure456!',
            'new_password_confirmation' => 'NewSecure456!',
        ]);

    $response->assertOk()
        ->assertJsonPath('message', 'Password berhasil diubah.')
        ->assertJsonStructure(['changed_at']);

    // Verify password actually changed
    $user->refresh();
    expect(Hash::check('NewSecure456!', $user->password))->toBeTrue();
});

it('returns 401 without session cookie', function (): void {
    $this->postJson('/api/profile/change-password', [
        'current_password' => 'x',
        'new_password' => 'y1234567',
        'new_password_confirmation' => 'y1234567',
    ])->assertStatus(401);
});

it('returns 422 when current password is wrong', function (): void {
    [, $cookie] = changePasswordSession('wrong-current', 'CorrectPassword1!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/change-password', [
            'current_password' => 'WrongPassword!',
            'new_password' => 'NewSecure456!',
            'new_password_confirmation' => 'NewSecure456!',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.current_password.0', 'Password saat ini salah.');
});

it('returns 422 when new password is same as current', function (): void {
    [, $cookie] = changePasswordSession('reuse', 'SamePassword1!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/change-password', [
            'current_password' => 'SamePassword1!',
            'new_password' => 'SamePassword1!',
            'new_password_confirmation' => 'SamePassword1!',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.new_password.0', 'Password baru tidak boleh sama dengan password lama.');
});

it('returns 422 when new password is too short', function (): void {
    [, $cookie] = changePasswordSession('short', 'ValidPassword1!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/change-password', [
            'current_password' => 'ValidPassword1!',
            'new_password' => 'short',
            'new_password_confirmation' => 'short',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.new_password.0', 'Password minimal 12 karakter.');
});

it('returns 422 when confirmation does not match', function (): void {
    [, $cookie] = changePasswordSession('mismatch', 'ValidPassword1!');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->postJson('/api/profile/change-password', [
            'current_password' => 'ValidPassword1!',
            'new_password' => 'NewSecure456!',
            'new_password_confirmation' => 'Different789!',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.new_password.0', 'Konfirmasi password baru tidak cocok.');
});

/**
 * @return array{0: User, 1: string}
 */
function changePasswordSession(string $id, string $password): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $id.'@changepw.example.test',
        'password' => Hash::make($password),
        'display_name' => 'Change PW User',
        'given_name' => 'Change',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    $sessionId = (string) Str::uuid();
    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addMinutes(60),
    ]);

    return [$user, $sessionId];
}
