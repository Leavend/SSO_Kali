<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Services\Profile\TrustedDevicesService;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.ttl.refresh_token_days', 30);
    config()->set('oidc_clients.clients.trusted-devices-client.display_name', 'Trusted Devices Client');
    config()->set('oidc_clients.clients.trusted-devices-client.allowed_scopes', [
        'openid',
        'profile',
        'email',
        'offline_access',
    ]);
    Cache::flush();
});

it('lists active trusted devices without exposing full fingerprints', function (): void {
    $user = trustedDevicesUser();
    trustedDevice($user, ['fingerprint' => str_repeat('a', 64), 'label' => 'Laptop kerja']);
    trustedDevice($user, ['fingerprint' => str_repeat('b', 64), 'revoked_at' => now()]);

    $response = $this->getJson('/api/profile/devices', trustedDevicesAuthHeaders($user));

    $response->assertOk()
        ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private')
        ->assertHeader('Pragma', 'no-cache')
        ->assertJsonCount(1, 'devices')
        ->assertJsonPath('devices.0.label', 'Laptop kerja')
        ->assertJsonPath('devices.0.fingerprint', str_repeat('a', 12));
});

it('renames only devices owned by the authenticated subject', function (): void {
    $user = trustedDevicesUser();
    $device = trustedDevice($user, ['label' => null]);
    $other = trustedDevicesUser('other-device-subject', 'other-device@example.test');
    $otherDevice = trustedDevice($other, ['label' => 'Other']);

    $this->patchJson(
        '/api/profile/devices/'.$device->id,
        ['label' => '  Laptop utama  '],
        trustedDevicesAuthHeaders($user),
    )->assertOk()->assertJsonPath('device.label', 'Laptop utama');

    expect($device->refresh()->label)->toBe('Laptop utama');

    $this->patchJson(
        '/api/profile/devices/'.$otherDevice->id,
        ['label' => 'Hijack'],
        trustedDevicesAuthHeaders($user),
    )->assertStatus(404);
});

it('revokes a trusted device and linked active sessions', function (): void {
    $user = trustedDevicesUser();
    $device = trustedDevice($user);
    $session = SsoSession::query()->create([
        'session_id' => 'trusted-device-session',
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'trusted_device_id' => $device->id,
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    $this->deleteJson('/api/profile/devices/'.$device->id, [], trustedDevicesAuthHeaders($user))
        ->assertOk()
        ->assertJsonPath('device_id', $device->id)
        ->assertJsonPath('revoked', true);

    expect($device->refresh()->revoked_at)->not->toBeNull()
        ->and($session->refresh()->revoked_at)->not->toBeNull();
});

it('sets trusted_at during first remember insert for strict databases', function (): void {
    $user = trustedDevicesUser();

    $device = app(TrustedDevicesService::class)->remember(
        $user->id,
        $user->subject_id,
        '127.0.0.1',
        'Mozilla/5.0 Chrome/124.0',
    );

    expect($device->trusted_at)->not->toBeNull()
        ->and($device->last_seen_at)->not->toBeNull();
});

it('preserves original trusted_at when a known device is seen again', function (): void {
    $user = trustedDevicesUser();
    $trustedAt = now()->subDays(3)->startOfSecond();
    $device = trustedDevice($user, [
        'trusted_at' => $trustedAt,
        'fingerprint' => hash('sha256', $user->subject_id.'|Known UA'),
    ]);

    app(TrustedDevicesService::class)->remember($user->id, $user->subject_id, '127.0.0.2', 'Known UA');

    expect($device->refresh()->trusted_at?->equalTo($trustedAt))->toBeTrue()
        ->and($device->ip_address)->toBe('127.0.0.2');
});

function trustedDevicesUser(
    string $subjectId = 'trusted-devices-subject',
    string $email = 'trusted-devices@example.test',
): User {
    return User::factory()->create([
        'subject_id' => $subjectId,
        'email' => $email,
        'email_verified_at' => now(),
        'display_name' => 'Trusted Devices User',
        'status' => 'active',
    ]);
}

/** @param array<string, mixed> $overrides */
function trustedDevice(User $user, array $overrides = []): TrustedDevice
{
    /** @var TrustedDevice $device */
    $device = TrustedDevice::query()->create(array_merge([
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'fingerprint' => hash('sha256', $user->subject_id.'|test-device'),
        'label' => 'Work laptop',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Mozilla/5.0 Chrome/124.0',
        'trusted_at' => now()->subDay(),
        'last_seen_at' => now(),
    ], $overrides));

    return $device;
}

/** @return array<string, string> */
function trustedDevicesAuthHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'trusted-devices-client',
        'scope' => 'openid profile email offline_access',
        'session_id' => 'trusted-devices-session-'.$user->id,
        'auth_time' => time(),
        'amr' => ['pwd'],
        'upstream_refresh_token' => 'upstream-trusted-devices-'.$user->id,
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
